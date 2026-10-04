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
from crew.pipeline import evaluate, publish, rebalance
from crew.recipe import Recipe
from crew.seeds import SEEDS
from crew.strategy_chat import build_strategy_chat
from crew.whatif import run_whatif, whatif_context, whatif_facts

# The design's shapes and colours for agents beyond the five seeds, in turn.
NEW_LOOKS = [("box", "sky"), ("half", "orange"), ("plus", "lime")]
SEED_IDS = {s["id"] for s in SEEDS}

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
        shape, color = NEW_LOOKS[sum(a["id"] not in SEED_IDS for a in agents) % len(NEW_LOOKS)]
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

        shape, color = NEW_LOOKS[sum(a["id"] not in SEED_IDS for a in agents) % len(NEW_LOOKS)]

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
    return crew_chat.answer(store, agent, message, llm, whatif=facts)


def chat_history(agent_id: str) -> list[dict]:
    store = crew_repository.store()
    if store.get_agent(agent_id) is None:
        raise AgentNotFound(agent_id)
    return store.chats(agent_id)
