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
from crew.compiler import CompileError, compile_strategy
from crew.gemini import LLM, LLMError
from crew.pipeline import evaluate, publish, rebalance
from crew.seeds import SEEDS

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
