"""Agent chat: an agent answers in persona from its own stored rows, citing them.

Every answer works from a numbered list of facts built from the store: the agent's KPIs,
yearly returns, red-team tests, latest book, and the log rows that match the question (years,
tickers, topics). Gemini writes the words and cites fact ids; the evidence shown is the cited
facts' own text, so nothing in the evidence footer is model output. When Gemini is down,
rate-limited or has no key, a deterministic answer is built from the same facts.
"""

from __future__ import annotations

import json
import logging
import re

from pydantic import ValidationError

from crew.features import FEATURES
from crew.gemini import LLM, LLMError, reason
from crew.pipeline import now_ts
from crew.recipe import Recipe
from crew.store import Store

log = logging.getLogger(__name__)

INTRO = "Introduce yourself: what you trade, your track record in one sentence, your verdict."
MAX_LOG_FACTS = 20
MAX_FOLLOW_UPS = 3
SCHEMA = {
    "type": "object",
    "properties": {
        "text": {"type": "string"},
        "cited": {"type": "array", "items": {"type": "string"}},
        "follow_ups": {"type": "array", "items": {"type": "string"}},
        # A recipe change as a JSON string ("" for none): a string survives both providers'
        # schema dialects, and Python validates it before anything sees it.
        "proposal_json": {"type": "string"},
        "recompile": {"type": "boolean"},
    },
    "required": ["text", "cited", "follow_ups", "proposal_json", "recompile"],
}
# What a judge might ask next, offered as chips when Gemini cannot suggest any.
DEFAULT_FOLLOW_UPS = [
    "How are you doing?",
    "How does your strategy pick stocks?",
    "What did the Red Team find?",
    "What happened in 2022?",
    "Why did the Mastermind move your capital?",
]
STATUS = {"trading": "trading", "sitting_out": "sitting out in cash", "killed": "out of the fund"}


def pct(x: float, signed: bool = True) -> str:
    s = f"{abs(x) * 100:.1f}%"
    return (("−" if x < 0 else "+") + s) if signed else s


def num(x: float) -> str:
    return f"{x:.2f}".replace("-", "−")


def _years(q: str) -> list[str]:
    return re.findall(r"\b(20[12]\d)\b", q)


def _tickers(q: str) -> list[str]:
    return re.findall(r"\b([A-Z]{1,5}(?:\.[A-Z])?)\b", q)


def _topic(q: str) -> set[str]:
    q = q.lower()
    topics = set()
    if "red team" in q or "redteam" in q:
        topics.add("redteam")
    if any(w in q for w in ("mastermind", "cut", "capital", "fired", "raised")):
        topics.add("mastermind")
    if any(w in q for w in ("sit out", "sat out", "sitting", "cash", "risk")):
        topics.add("risk")
    return topics


def facts_for(
    store: Store, agent: dict, question: str | None, whatif: list[str] | None = None
) -> list[dict]:
    q = question or ""
    k = agent.get("kpis") or {}
    texts: list[str] = []
    if k:
        texts += [
            f"Total return {pct(k['total_return'])}",
            f"Sharpe {num(k['sharpe'])}",
            f"Max drawdown {pct(k['max_drawdown'])} in {k.get('max_drawdown_month')}",
            f"Annual return {pct(k['ann_return'])}, annual volatility {pct(k['ann_vol'], False)}",
            f"Trailing 12-month Sharpe {num(k.get('trailing_12m_sharpe', 0.0))}",
            f"Turnover {num(k.get('turnover', 0.0))} per month",
        ]
    recipe = agent.get("recipe") or {}
    for f in recipe.get("features", []):
        meaning = FEATURES.get(f["name"], "")
        texts.append(
            f"Ranks on {f['name']} ({f['direction']} first, weight {f['weight']:.0%}): {meaning}"
        )
    if recipe:
        floor = recipe.get("sit_out_if_trailing_sharpe_below")
        rule = (
            f"sit out in cash when my trailing {recipe['lookback_months']}-month Sharpe is "
            f"below {num(floor)}"
            if floor is not None
            else "never sit out"
        )
        filters = ", ".join(recipe.get("filters") or []) or "no filters"
        texts.append(
            f"Each month I hold the top {recipe['top_n']} names equally ({filters}) and {rule}"
        )
    texts.append(
        f"Capital share {pct(agent.get('capital_share', 0.0), False)}, "
        f"trend {agent.get('capital_trend', 'flat')}"
    )
    texts.append(f"Status: {STATUS.get(agent.get('status'), agent.get('status'))}")
    report = agent.get("redteam") or {}
    if report:
        texts.append(f"Red Team verdict: {report['verdict'].upper()}")
        texts += [
            f"{t['name']}: {'passed' if t['passed'] else 'FAILED'} — {t['detail']}"
            for t in report["tests"]
        ]
    texts += [
        f"{y} return: {pct(r)}" for y, r in sorted((agent.get("yearly_returns") or {}).items())
    ]

    texts += _versus_market(store, agent["id"], _years(q))

    book = store.holdings(agent["id"])
    if book:
        last = max(h["month"] for h in book)
        texts += [
            f"Holds {h['ticker']} {h['weight']:.1%} ({last}): {h['reason']}"
            for h in book
            if h["month"] == last
        ]

    rows = store.log(agent_id=agent["id"])
    years, tickers, topics = _years(q), _tickers(q), _topic(q)
    wanted = [
        e
        for e in rows
        if any(e["ts"].startswith(y) for y in years)
        or any(t in e["text"] for t in tickers)
        or e["type"] in topics
    ]
    # Decisions explain more than trades: risk, Mastermind and red-team rows first.
    wanted.sort(key=lambda e: (e["type"] == "trade", e["ts"]))
    texts += [
        f"{e['ts']} · {e['type']} · {e['text']}" for e in (wanted or rows[:5])[:MAX_LOG_FACTS]
    ]
    # A what-if the judge is testing comes first: it is what the question is about.
    texts = [*(whatif or []), *texts]
    return [{"id": f"F{i + 1}", "text": t} for i, t in enumerate(texts)]


def _versus_market(store: Store, agent_id: str, years: list[str]) -> list[str]:
    """The agent's months against the S&P 500 over the same holding months: a line per year,
    and a line per month for any year the question names, so "what happened in 2022" has the
    market beside the agent's own record."""
    run = store.latest_run(agent_id) or {}
    monthly = run.get("monthly") or []
    if not monthly:
        return []
    firsts: dict[str, float] = {}
    for p in sorted(store.curve("spx"), key=lambda p: p["date"]):
        firsts.setdefault(p["date"][:7], p["value"])
    months = sorted(firsts)
    spx = {a: firsts[b] / firsts[a] - 1 for a, b in zip(months, months[1:], strict=False)}
    out = []
    by_year: dict[str, list[tuple[float, float]]] = {}
    for row in monthly:
        m = row["month"]
        if m in spx:
            by_year.setdefault(m[:4], []).append((row["ret"], spx[m]))
        if m[:4] in years and m in spx:
            cash = "" if row.get("invested", True) else " (in cash)"
            out.append(f"{m}: me {pct(row['ret'])}{cash} vs S&P 500 {pct(spx[m])}")
    for y in sorted(by_year):
        me = 1.0
        mkt = 1.0
        for r, x in by_year[y]:
            me *= 1 + r
            mkt *= 1 + x
        out.append(f"{y} vs market: me {pct(me - 1)}, S&P 500 {pct(mkt - 1)}")
    return out


def _find(facts: list[dict], prefix: str) -> list[str]:
    return [f["text"] for f in facts if f["text"].startswith(prefix)]


def fallback(agent: dict, question: str | None, facts: list[dict]) -> tuple[str, list[str]]:
    """A plain answer from the facts alone, for when Gemini is not available."""
    k = agent.get("kpis") or {}
    q = question or ""
    record = (
        f"Total return {pct(k.get('total_return', 0.0))}, Sharpe {num(k.get('sharpe', 0.0))}, "
        f"worst drawdown {pct(k.get('max_drawdown', 0.0))} in {k.get('max_drawdown_month')}."
    )
    record_facts = (
        _find(facts, "Total return") + _find(facts, "Sharpe") + _find(facts, "Max drawdown")
    )
    verdict = (agent.get("verdict") or "").upper()

    if question is None:
        return (
            f"{agent.get('pitch', '').rstrip('.')}. {record} The Red Team says {verdict}.",
            record_facts + _find(facts, "Red Team verdict"),
        )
    topics, years, tickers = _topic(q), _years(q), _tickers(q)
    if "redteam" in topics:
        failed = [t for t in agent["redteam"]["tests"] if not t["passed"]]
        body = " ".join(f"Failed the {t['name']}: {t['detail']}." for t in failed)
        return (
            f"Verdict {verdict}. " + (body or "All four tests passed."),
            _find(facts, "Red Team verdict")
            + [f["text"] for f in facts if "passed —" in f["text"] or "FAILED —" in f["text"]],
        )
    if "mastermind" in topics:
        memos = [f["text"] for f in facts if " · mastermind · " in f["text"]][:2]
        if memos:
            return " ".join(m.split(" · ", 2)[2] + "." for m in memos), memos
        share = pct(agent.get("capital_share", 0.0), False)
        return f"The Mastermind hasn't moved my capital. I run {share} of the fund.", _find(
            facts, "Capital share"
        )
    held = [t for t in tickers if _find(facts, f"Holds {t} ")]
    if held:
        line = _find(facts, f"Holds {held[0]} ")[0]
        weight, reason = line.split(" ", 2)[2].split(": ", 1)
        return f"I hold {held[0]} at {weight.split(' (')[0]}: {reason}.", [line]
    if tickers and "hold" in q.lower():
        trades = [
            f["text"] for f in facts if tickers[0] in f["text"] and " · trade · " in f["text"]
        ]
        return f"I don't hold {tickers[0]} in my latest book.", trades[:1]
    if years:
        year = years[0]
        lines = _find(facts, f"{year} return")
        text = f"{year} return: {lines[0].split(': ', 1)[1]}." if lines else f"No {year} record."
        sat = [f["text"] for f in facts if f["text"].startswith(year) and "Sat out" in f["text"]]
        other = [
            f["text"]
            for f in facts
            if f["text"].startswith(year)
            and (" · mastermind · " in f["text"] or " · risk · " in f["text"])
        ]
        if sat:
            text += f" I sat out {len(sat)} month(s) that year: {sat[0].split(' · ', 2)[2]}."
        elif other:
            text += f" {other[0].split(' · ', 2)[2]}."
        return text, lines + (sat or other)[:3]
    status = STATUS.get(agent.get("status"), agent.get("status"))
    share = pct(agent.get("capital_share", 0.0), False)
    return (
        f"{record} I run {share} of the fund and I'm {status}.",
        record_facts + _find(facts, "Capital share") + _find(facts, "Status"),
    )


# "[F43, F50-F62]" or "(F2)": fact ids belong in `cited`, never in the words a judge reads.
_FACT_IDS = re.compile(r"\s*[\[(]\s*F\d+(?:\s*[-–,]\s*F?\d+)*\s*[\])]")


def _paragraphs(text: str) -> str:
    """Collapse stray whitespace inside paragraphs, keep the blank lines between them."""
    text = _FACT_IDS.sub("", text)
    paras = [" ".join(p.split()) for p in re.split(r"\n\s*\n", text)]
    return "\n\n".join(p for p in paras if p)


def _proposal(raw) -> dict | None:
    """A validated, normalized recipe from the model's JSON, or None (empty or invalid)."""
    if not raw or not str(raw).strip():
        return None
    try:
        return Recipe.model_validate(json.loads(raw)).model_dump()
    except (ValueError, ValidationError):
        log.warning("dropped an invalid recipe proposal")
        return None


def _follow_ups(raw) -> list[str]:
    out = [" ".join(str(q).split())[:80] for q in raw or []]
    return [q for q in out if q][:MAX_FOLLOW_UPS]


def answer(
    store: Store,
    agent: dict,
    question: str | None,
    llm: LLM | None,
    whatif: list[str] | None = None,
    draft: dict | None = None,
) -> dict:
    """Answer `question` (None: the agent introduces itself) and store the exchange. `draft`:
    the recipe as the judge has edited it on screen, not yet compiled."""
    facts = facts_for(store, agent, question, whatif)
    by_id = {f["id"]: f["text"] for f in facts}
    system = (
        f"You are {agent['name']}, a trading agent in a heist-crew hedge fund, talking to a "
        f"judge who is evaluating the fund. Character: {agent.get('persona', '')} Let the "
        "character colour your voice, but stay courteous and helpful: no attitude, no "
        "dismissiveness, no blaming the user.\n"
        "Answer in first person in two to four short paragraphs separated by a blank line. "
        "Answer the question directly first, then explain the why: what my strategy does, "
        "what the numbers show, and what they mean for an investor, including the weak spots "
        "(a failed Red Team test, a drawdown, lagging the S&P 500). Plain English; explain any "
        "feature name you mention.\n"
        "Never write fact ids like F12 in the text; list them only in `cited`. "
        "Use only the numbered facts; never invent a number, date, ticker, trade or result. If "
        "the facts do not answer the question, say so and offer what they do show. Cite the "
        "ids of every fact you use in `cited`.\n"
        f"In `follow_ups` suggest {MAX_FOLLOW_UPS} short questions (under 60 characters) the "
        "judge could ask you next that your facts can answer."
    )
    if whatif:
        system += (
            "\nThe judge is testing a what-if: an unsaved variant of your recipe (the facts that "
            "start with 'What-if'). Compare it with your live record: what changed, whether it "
            "did better or worse and when, and what its Red Team result says about trusting it. "
            "A hand-tuned curve that fails the shuffle or lookahead test is likely overfit; say so."
        )
    system += (
        "\nThe judge can change your recipe through you. If they ask to change it (weights, "
        "signals, directions, top N, lookback, the sit-out rule), put the complete new recipe in "
        "`proposal_json` as JSON with keys features [{name, weight, direction}], filters, "
        'lookback_months (1-60), top_n (1-50), rebalance "monthly" and '
        "sit_out_if_trailing_sharpe_below (number or null), starting from the recipe on screen "
        "and changing only what they asked; say what you changed and ask whether to recompile. "
        "Otherwise leave `proposal_json` empty. Set `recompile` true only when the judge "
        "explicitly agrees to recompile now. Market-wide signals (funding_stress, "
        "inflation_expectation, treasury_funding_interact) cannot rank stocks; warn if asked. "
        "Signals:\n" + "\n".join(f"- {n}: {m}" for n, m in FEATURES.items())
    )
    current = draft or agent.get("recipe")
    on_screen = (
        "Recipe on screen (edited by the judge, not compiled yet)"
        if draft and draft != agent.get("recipe")
        else "Recipe on screen (compiled, live)"
    )
    prompt = (
        f"Question: {question or INTRO}\n\n"
        + (f"{on_screen}:\n{json.dumps(current, indent=2)}\n\n" if current else "")
        + "Facts:\n"
        + "\n".join(f"{f['id']}: {f['text']}" for f in facts)
    )
    source, why = "gemini", None
    proposal, recompile = None, False
    try:
        if llm is None:
            raise LLMError("no Gemini client", "no Gemini key")
        reply = llm.generate_json(system, prompt, SCHEMA)
        text = _paragraphs(str(reply.get("text") or ""))
        proposal = _proposal(reply.get("proposal_json"))
        recompile = bool(reply.get("recompile")) and proposal is not None
        follow_ups = _follow_ups(reply.get("follow_ups"))
        evidence = [by_id[i] for i in reply.get("cited") or [] if i in by_id]
        if not text:
            raise LLMError("empty answer")
    except LLMError as e:
        source, why = "fallback", reason(e)
        log.warning("chat %s fell back: %s", agent["id"], why)
        text, evidence = fallback(agent, question, facts)
        follow_ups = [q for q in DEFAULT_FOLLOW_UPS if q != question][:MAX_FOLLOW_UPS]

    ts = now_ts()
    if question is not None:
        store.add_chat(agent["id"], {"ts": ts, "role": "user", "text": question})
    message = {"ts": ts, "role": "agent", "text": text, "evidence": evidence, "source": source}
    if source == "gemini" and getattr(llm, "provider", None):
        # `source` says the model wrote it (the value predates OpenAI); `provider` says which.
        message["provider"] = llm.provider
    if follow_ups:
        message["follow_ups"] = follow_ups
    if source == "gemini" and proposal is not None:
        message["proposal"] = proposal
        message["recompile"] = recompile
    if why:
        message["fallback_reason"] = why
    store.add_chat(agent["id"], message)
    return message
