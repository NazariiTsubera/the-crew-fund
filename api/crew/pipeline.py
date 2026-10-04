"""How an agent joins the crew, the same way for the seeds and for one a judge creates:
evaluate (backtest, then red team), publish (write it all to the store), rebalance (the
Mastermind re-splits capital across everyone and writes the fund).
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from crew.backtest import Run, run_recipe
from crew.mastermind import Plan, allocate
from crew.panel import Panel
from crew.recipe import Recipe
from crew.redteam import attack
from crew.store import Store

TREND_STEP = 0.0005


def now_ts() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d %H:%M")


def evaluate(recipe: Recipe, panel: Panel, shuffles: int = 100) -> tuple[Run, dict]:
    run = run_recipe(recipe, panel)
    return run, attack(recipe, panel, run=run, shuffles=shuffles)


def publish(store: Store, meta: dict, recipe: Recipe, run: Run, report: dict) -> dict:
    """Write a freshly evaluated agent. Replaces anything stored under the same id."""
    agent_id = meta["id"]
    stamp = now_ts()
    failed = [t["name"] for t in report["tests"] if not t["passed"]]
    agent = {
        **meta,
        "recipe": recipe.model_dump(),
        "verdict": report["verdict"],
        "redteam": report,
        # The Red Team advises; it never stops an agent from trading.
        "status": run.status,
        "kpis": run.kpis,
        "yearly_returns": run.yearly_returns,
        "capital_share": 0.0,
        "capital_trend": "flat",
        "stop_month": None,
        "created_at": meta.get("created_at") or stamp,
    }
    store.delete_agent(agent_id)
    store.put_agent(agent)
    store.put_run(agent_id, {**run.to_dict(), "redteam": report, "evaluated_at": stamp})
    store.put_curve(agent_id, run.curve)
    store.put_holdings(agent_id, [{**h, "agent_id": agent_id} for h in run.holdings])
    entries = [
        {"ts": e["ts"], "agent_id": agent_id, "type": e["type"], "text": e["text"]} for e in run.log
    ]
    entries.append(
        {
            "ts": stamp,
            "agent_id": agent_id,
            "type": "redteam",
            "text": f"Red Team: {len(failed)} of 4 tests failed"
            + (f" ({', '.join(failed)})" if failed else "")
            + f", verdict {report['verdict'].upper()}",
        }
    )
    store.replace_log(entries, agent_id=agent_id)
    return agent


def benchmark_curve(panel: Panel, start: date) -> list[dict]:
    """The S&P 500 rebased to 1.0 on `start`, the fund's first decision date."""
    rows = [(d, v) for d, v in panel.benchmark.select(["date", "close"]).iter_rows() if d >= start]
    if not rows:
        return []
    base = rows[0][1]
    return [{"date": str(d), "value": v / base} for d, v in rows]


def rebalance(store: Store, panel: Panel) -> Plan:
    """Re-split capital across every stored agent and write the fund."""
    agents = store.list_agents()
    crew = [
        {
            "id": a["id"],
            "name": a["name"],
            "verdict": a["verdict"],
            "run": run,
            "allocation": a.get("allocation", 1.0),
        }
        for a in agents
        if (run := store.latest_run(a["id"])) is not None
    ]
    spx = benchmark_curve(panel, panel.decision_dates[0]) if panel.decision_dates else []
    universe = set(panel.vectors["ticker"].unique().to_list())
    plan = allocate(crew, universe, spx)

    store.put_curve("fund", plan.fund_curve)
    store.put_curve("spx", spx)
    store.put_holdings("fund", plan.fund_holdings)
    store.replace_log(plan.log, types=["mastermind"])

    months = plan.months
    last = months[-1] if months else None
    prev = months[-2] if len(months) > 1 else None
    for a in agents:
        share = plan.shares.get(last, {}).get(a["id"], 0.0) if last else 0.0
        before = plan.shares.get(prev, {}).get(a["id"], share) if prev else share
        trend = "flat" if abs(share - before) < TREND_STEP else ("up" if share > before else "down")
        fired = plan.fired.get(a["id"])
        run = store.latest_run(a["id"]) or {}
        status = run.get("status", a["status"])
        store.put_agent(
            {
                **a,
                "capital_share": share,
                "capital_trend": trend,
                "status": status,
                "stop_month": fired,
            }
        )

    memos = sorted(plan.log, key=lambda e: e["ts"])
    spx_values = [p["value"] for p in spx]
    store.put_run(
        "fund",
        {
            "as_of": last,
            "holdout_cutoff": panel.manifest["holdout_cutoff"],
            "kpis": plan.kpis,
            "spx_kpis": _spx_kpis(spx),
            "invested": plan.invested,
            "shares": plan.shares,
            "fired": plan.fired,
            "latest_memo": memos[-1]["text"] if memos else None,
            "spx_last": spx_values[-1] if spx_values else None,
            "rebalanced_at": now_ts(),
        },
    )
    return plan


def _spx_kpis(spx: list[dict]) -> dict:
    import numpy as np

    from crew.backtest import kpis_from_curve

    return kpis_from_curve(
        np.array([p["value"] for p in spx]), [date.fromisoformat(p["date"]) for p in spx]
    )
