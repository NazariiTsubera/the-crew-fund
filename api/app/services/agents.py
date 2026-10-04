"""Creating an agent: compile the words, backtest, red-team, publish, let the Mastermind
re-split. Yields one stage event at a time so the War Room can show progress; any failure
ends the stream with a readable error event, never silence.
"""

from __future__ import annotations

import hashlib
import re
import threading
from collections.abc import Callable, Iterator

from app import crew_repository
from crew import chat as crew_chat
from crew.compiler import CompileError, compile_strategy
from crew.gemini import LLM, LLMError
from crew.pipeline import VERDICT_LABEL, evaluate, log_judge, now_ts, publish, rebalance
from crew.recipe import Recipe
from crew.seeds import SEEDS
from crew.strategy_chat import build_strategy_chat
from crew.whatif import run_whatif, whatif_context, whatif_facts

# The design's shapes and colours for agents beyond the five seeds, in turn.
NEW_LOOKS = [("box", "sky"), ("half", "orange"), ("plus", "lime")]
SEED_IDS = {s["id"] for s in SEEDS}
# The palette in the order new agents take it; amber is the fund's own line, never an agent's.
PALETTE = ["sky", "orange", "lime", "rose", "green", "teal", "violet", "slate"]


def next_look(agents: list[dict]) -> tuple[str, str]:
    """A shape in turn and the first palette colour no one in the crew has, so every line on
    the War Room chart is told apart (colours repeat only past eight agents)."""
    used = {a.get("color") for a in agents}
    fresh = [c for c in PALETTE if c not in used]
    color = fresh[0] if fresh else PALETTE[len(agents) % len(PALETTE)]
    shape = NEW_LOOKS[sum(a["id"] not in SEED_IDS for a in agents) % len(NEW_LOOKS)][0]
    return shape, color


# One creation at a time: publish + rebalance rewrite the fund.
_lock = threading.Lock()


def _agent_id(name: str, prompt: str, taken: set[str]) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower().removeprefix("the ")).strip("-") or "agent"
    digest = hashlib.sha1(prompt.encode()).hexdigest()
    for k in range(6, len(digest)):
        candidate = f"{slug}-{digest[:k]}"
        if candidate not in taken:
            return candidate
    raise RuntimeError("no free id")


def create(prompt: str, llm_factory: Callable[[], LLM]) -> Iterator[tuple[str, dict]]:
    yield "compiling", {}
    try:
        compiled = compile_strategy(prompt, llm_factory())
    except (CompileError, LLMError) as e:
        yield "error", {"message": str(e)}
        return

    yield "backtesting", {"name": compiled.name, "recipe": compiled.recipe.model_dump()}
    try:
        panel = crew_repository.panel()
    except FileNotFoundError:
        yield "error", {"message": "the panel cache is missing; run scripts/cache_panel.py"}
        return

    with _lock:
        store = crew_repository.store()
        run, report = evaluate(compiled.recipe, panel)
        yield "redteam", {"kpis": run.kpis}

        agents = store.list_agents()
        taken = {a["id"] for a in agents}
        shape, color = next_look(agents)
        meta = {
            "id": _agent_id(compiled.name, prompt, taken),
            "name": compiled.name,
            "persona": compiled.persona,
            "strategy_line": compiled.strategy_line,
            "pitch": compiled.pitch,
            "shape": shape,
            "color": color,
            "prompt": prompt,
        }
        agent = publish(store, meta, compiled.recipe, run, report)
        rebalance(store, panel)
        agent = store.get_agent(agent["id"])
    yield "done", {"agent": agent}


def create_from_recipe(
    prompt: str,
    recipe,
    name: str,
    persona: str,
    strategy_line: str,
    pitch: str,
) -> Iterator[tuple[str, dict]]:
    """Create an agent from an already validated Recipe.

    Gemini has already interpreted the user's conversation. The Recipe has
    already been validated and normalized. No second LLM compilation occurs,
    so the user's weights cannot silently change between confirmation and
    backtesting.
    """

    yield "compiling", {}

    yield (
        "backtesting",
        {
            "name": name,
            "recipe": recipe.model_dump(),
        },
    )

    try:
        panel = crew_repository.panel()
    except FileNotFoundError:
        yield "error", {"message": "the panel cache is missing; run scripts/cache_panel.py"}
        return

    with _lock:
        store = crew_repository.store()

        run, report = evaluate(recipe, panel)

        yield (
            "redteam",
            {
                "kpis": run.kpis,
            },
        )

        agents = store.list_agents()
        taken = {a["id"] for a in agents}

        shape, color = next_look(agents)

        meta = {
            "id": _agent_id(name, prompt, taken),
            "name": name,
            "persona": persona,
            "strategy_line": strategy_line,
            "pitch": pitch,
            "shape": shape,
            "color": color,
            "prompt": prompt,
        }

        agent = publish(
            store,
            meta,
            recipe,
            run,
            report,
        )

        rebalance(store, panel)

        agent = store.get_agent(agent["id"])

    yield (
        "done",
        {
            "agent": agent,
        },
    )


IDENTITY = (
    "id",
    "name",
    "persona",
    "strategy_line",
    "pitch",
    "shape",
    "color",
    "prompt",
    "created_at",
    "allocation",
)


def recompile(agent_id: str, recipe: Recipe) -> Iterator[tuple[str, dict]]:
    """Put a live agent's new recipe through the whole pipeline again: backtest, red team,
    publish under the same identity, Mastermind re-split. The conversation is kept, with a line
    saying what changed, so the agent can be asked why the new version does better or worse."""
    store = crew_repository.store()
    agent = store.get_agent(agent_id)
    if agent is None:
        raise AgentNotFound(agent_id)
    yield "backtesting", {"name": agent["name"], "recipe": recipe.model_dump()}
    try:
        panel = crew_repository.panel()
    except FileNotFoundError:
        yield "error", {"message": "the panel cache is missing; run scripts/cache_panel.py"}
        return
    with _lock:
        run, report = evaluate(recipe, panel)
        yield "redteam", {"kpis": run.kpis}
        chats = store.chats(agent_id)  # publish replaces everything stored under the id
        before = agent.get("kpis") or {}
        publish(store, {k: agent[k] for k in IDENTITY if k in agent}, recipe, run, report)
        for c in chats:
            store.add_chat(agent_id, c)
        store.add_chat(
            agent_id,
            {
                "ts": now_ts(),
                "role": "agent",
                "text": _recompiled_line(before, run.kpis, report["verdict"]),
                "evidence": [],
                "source": "fallback",
            },
        )
        rebalance(store, panel)
        agent = store.get_agent(agent_id)
        log_judge(
            store,
            f"You recompiled {agent['name']}: Sharpe {before.get('sharpe', 0):.2f} → "
            f"{run.kpis['sharpe']:.2f}, Red Team {VERDICT_LABEL[report['verdict']]}",
        )
    yield "done", {"agent": agent}


def _recompiled_line(before: dict, after: dict, verdict: str) -> str:
    def f(k, pct=True):
        v = after.get(k)
        b = before.get(k)
        fmt = (lambda x: f"{x:+.1%}") if pct else (lambda x: f"{x:.2f}")
        return fmt(v) + (f" (was {fmt(b)})" if b is not None else "")

    return (
        f"Recompiled. Total return {f('total_return')}, Sharpe {f('sharpe', False)}, "
        f"max drawdown {f('max_drawdown')}. Red Team verdict {verdict.upper()}."
    )


def set_allocations(allocations: dict[str, float], action: str = "split") -> None:
    """The judge's split of capital; the fund is re-split and rewritten. `action` names the
    decision on the tape: a new split, or firing or hiring one agent."""
    with _lock:
        store = crew_repository.store()
        agents = {a["id"]: a for a in store.list_agents()}
        unknown = sorted(set(allocations) - set(agents))
        if unknown:
            raise AgentNotFound(", ".join(unknown))
        for agent_id, weight in allocations.items():
            store.put_agent({**agents[agent_id], "allocation": weight})
        rebalance(store, crew_repository.panel())
        if action == "split":
            shares = ", ".join(
                f"{a['name']} {a['capital_share']:.0%}"
                for a in sorted(store.list_agents(), key=lambda a: -a["capital_share"])
            )
            log_judge(store, f"You set the split: {shares}")
        else:
            (agent_id,) = allocations
            log_judge(store, f"You {action} {agents[agent_id]['name']}")


def delete(agent_id: str) -> None:
    """The judge deletes an agent: it and everything stored under it are removed for good."""
    with _lock:
        store = crew_repository.store()
        agent = store.get_agent(agent_id)
        if agent is None:
            raise AgentNotFound(agent_id)
        store.delete_agent(agent_id)
        log_judge(store, f"You deleted {agent['name']}")
        rebalance(store, crew_repository.panel())


class AgentNotFound(LookupError):
    pass


def whatif(agent_id: str, recipe: Recipe) -> dict:
    """The agent's recipe as edited by a judge, backtested and red-teamed, never stored."""
    if crew_repository.store().get_agent(agent_id) is None:
        raise AgentNotFound(agent_id)
    return run_whatif(recipe, crew_repository.panel())


def whatif_compile(
    agent_id: str, message: str, draft: Recipe, llm_factory: Callable[[], LLM]
) -> dict:
    """{reply, recipe, changed}: the recruiter's recipe editing, on a judge's what-if draft. It
    only edits the recipe; the judge runs it. Raises LLMError without a key, ValueError when the
    AI's recipe does not validate."""
    agent = crew_repository.store().get_agent(agent_id)
    if agent is None:
        raise AgentNotFound(agent_id)
    out = build_strategy_chat(
        message, [], draft.model_dump(), llm_factory(), context=whatif_context(agent)
    )
    return {"reply": out.reply, "recipe": out.strategy, "changed": out.changed}


def chat(
    agent_id: str,
    message: str | None,
    llm_factory: Callable[[], LLM],
    variant: Recipe | None = None,
    draft: Recipe | None = None,
) -> dict:
    store = crew_repository.store()
    agent = store.get_agent(agent_id)
    if agent is None:
        raise AgentNotFound(agent_id)
    try:
        llm = llm_factory()
    except LLMError:
        llm = None  # no key: the agent still answers, from its facts alone
    # Re-run the variant here (cached) rather than trust numbers sent by the browser.
    facts = whatif_facts(agent, whatif(agent_id, variant)) if variant else None
    return crew_chat.answer(
        store, agent, message, llm, whatif=facts, draft=draft.model_dump() if draft else None
    )


def chat_history(agent_id: str) -> list[dict]:
    store = crew_repository.store()
    if store.get_agent(agent_id) is None:
        raise AgentNotFound(agent_id)
    return store.chats(agent_id)
