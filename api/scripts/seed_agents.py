"""Seed the crew: the five design agents through the same pipeline as any new agent, then
one Mastermind rebalance. Idempotent: each seed replaces its own stored rows.

    cd api && uv run python -m scripts.seed_agents      # reads cache/, writes the store
"""

from __future__ import annotations

import sys

from crew.env import load_api_env
from crew.panel import Panel, load_panel
from crew.pipeline import evaluate, publish, rebalance
from crew.recipe import Recipe
from crew.seeds import SEEDS
from crew.store import Store, open_store


def seed(store: Store, panel: Panel) -> None:
    for s in SEEDS:
        recipe = Recipe.model_validate(s["recipe"])
        run, report = evaluate(recipe, panel)
        meta = {k: v for k, v in s.items() if k != "recipe"}
        publish(store, meta, recipe, run, report)
        print(f"{s['name']:<16} {report['verdict']:<10} Sharpe {run.kpis['sharpe']:.2f}")
    plan = rebalance(store, panel)
    last = plan.months[-1]
    for agent_id, share in plan.shares[last].items():
        print(
            f"  {agent_id:<12} {share:6.1%}"
            + (f"  fired {plan.fired[agent_id]}" if agent_id in plan.fired else "")
        )


def main() -> int:
    load_api_env()
    seed(open_store(), load_panel())
    return 0


if __name__ == "__main__":
    sys.exit(main())
