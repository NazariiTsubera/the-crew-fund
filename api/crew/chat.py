"""Agent chat: an agent answers in persona from its own stored rows, citing them.

Every answer works from a numbered list of facts built from the store: the agent's KPIs,
yearly returns, red-team tests, latest book, and the log rows that match the question (years,
tickers, topics). Gemini writes the words and cites fact ids; the evidence shown is the cited
facts' own text, so nothing in the evidence footer is model output. When Gemini is down,
rate-limited or has no key, a deterministic answer is built from the same facts.
"""

from __future__ import annotations

import re

from crew.gemini import LLM, LLMError
from crew.pipeline import now_ts
from crew.store import Store

INTRO = "Introduce yourself: what you trade, your track record in one sentence, your verdict."
MAX_LOG_FACTS = 12
SCHEMA = {
    "type": "object",
    "properties": {
        "text": {"type": "string"},
        "cited": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["text", "cited"],
}
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


def facts_for(store: Store, agent: dict, question: str | None) -> list[dict]:
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
    return [{"id": f"F{i + 1}", "text": t} for i, t in enumerate(texts)]


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


def answer(store: Store, agent: dict, question: str | None, llm: LLM | None) -> dict:
    """Answer `question` (None: the agent introduces itself) and store the exchange."""
    facts = facts_for(store, agent, question)
    by_id = {f["id"]: f["text"] for f in facts}
    system = (
        f"You are {agent['name']}, a trading agent in a heist-crew hedge fund. "
        f"Persona: {agent.get('persona', '')} "
        "Answer in first person, in persona, in two to four sentences. Use only the numbered "
        "facts you are given; never invent a number, date, trade or result. Cite the ids of "
        "every fact you use in `cited`."
    )
    prompt = f"Question: {question or INTRO}\n\nFacts:\n" + "\n".join(
        f"{f['id']}: {f['text']}" for f in facts
    )
    source = "gemini"
    try:
        if llm is None:
            raise LLMError("no Gemini client")
        reply = llm.generate_json(system, prompt, SCHEMA)
        text = " ".join(str(reply.get("text") or "").split())
        evidence = [by_id[i] for i in reply.get("cited") or [] if i in by_id]
        if not text:
            raise LLMError("empty answer")
    except LLMError:
        source = "fallback"
        text, evidence = fallback(agent, question, facts)

    ts = now_ts()
    if question is not None:
        store.add_chat(agent["id"], {"ts": ts, "role": "user", "text": question})
    message = {"ts": ts, "role": "agent", "text": text, "evidence": evidence, "source": source}
    store.add_chat(agent["id"], message)
    return message
