"""The red team: four attacks on every new agent, matching the design's Red Team card.

1. Lookahead test: score each month on the previous month's vector. A real signal keeps
   more than 80% of its Sharpe; one that leans on information it should not have collapses.
2. Shuffle test: the agent's monthly picks against random picks from the same eligible names,
   gross of costs. Passes when p < 0.05.
3. 2020 replay: drawdown Feb–Apr 2020 no worse than the S&P 500's.
4. 2022 replay: drawdown Dec 2021–Dec 2022 no worse than the S&P 500's.

Verdict: no failures is `pass`, one is `probation`, two or more is `killed`. A lookahead test
that collapses (the lagged signal keeps under a quarter of its Sharpe) kills on its own: that is
what leakage looks like, and a backtest that leaks makes the other three numbers meaningless. A
milder drop is a real but fast-decaying signal, and counts as one ordinary failure.
"""

from __future__ import annotations

from datetime import date

import numpy as np

from crew.backtest import Run, fmt, market_for, rank_month, run_recipe
from crew.panel import Panel
from crew.recipe import Recipe

TESTS = ["Lookahead test", "Shuffle test", "2020 replay", "2022 replay"]
LAG_KEEP = 0.8
LAG_COLLAPSE = 0.25
P_MAX = 0.05
REPLAYS = {
    "2020 replay": (date(2020, 2, 1), date(2020, 4, 30), "Feb–Apr 2020"),
    "2022 replay": (date(2021, 12, 1), date(2022, 12, 31), "Dec 2021–Dec 2022"),
}


def pct0(x: float) -> str:
    return f"{'−' if x < 0 else '+'}{abs(x) * 100:.0f}%"


def verdict(tests: list[dict], leaked: bool = False) -> str:
    failed = [t["name"] for t in tests if not t["passed"]]
    if leaked or len(failed) >= 2:
        return "killed"
    return "probation" if failed else "pass"


def _lookahead(recipe: Recipe, panel: Panel, run: Run) -> tuple[dict, bool]:
    """The test, and whether the lagged signal collapsed (a leak) rather than faded."""
    base = run.kpis["sharpe"]
    lagged = run_recipe(recipe, panel, lag_months=1).kpis["sharpe"]
    # A recipe with no edge has nothing to leak.
    passed = base <= 0 or lagged > LAG_KEEP * base
    collapsed = base > 0 and lagged < LAG_COLLAPSE * base
    return {
        "name": "Lookahead test",
        "passed": bool(passed),
        "detail": f"Sharpe {fmt(base)} → {fmt(lagged)} with signals lagged one month",
    }, collapsed


def _sharpe(monthly: np.ndarray) -> float:
    sd = monthly.std(ddof=1) if len(monthly) > 1 else 0.0
    return float(monthly.mean() / sd * np.sqrt(12)) if sd else 0.0


def _shuffle(recipe: Recipe, panel: Panel, shuffles: int, seed: int) -> dict:
    m = market_for(panel)
    rng = np.random.default_rng(seed)
    real, eligible = [], []
    for i in range(len(m.decisions)):
        ranked = rank_month(m, recipe, i)
        if ranked is None:
            continue
        cols = np.array([m.col[t] for t in ranked["ticker"].to_list()])
        k = min(recipe.top_n, len(cols))
        real.append(float(np.mean(m.period_returns[i, cols[:k]])))
        eligible.append((i, cols, k))
    actual = _sharpe(np.array(real))
    shuffled = np.array(
        [
            _sharpe(
                np.array(
                    [
                        np.mean(m.period_returns[i, rng.choice(cols, k, replace=False)])
                        for i, cols, k in eligible
                    ]
                )
            )
            for _ in range(shuffles)
        ]
    )
    p = (1 + int(np.sum(shuffled >= actual))) / (1 + shuffles)
    return {
        "name": "Shuffle test",
        "passed": bool(p < P_MAX),
        "detail": f"Shuffled-label Sharpe {fmt(float(shuffled.mean()))} over {shuffles} runs, "
        f"p={p:.3f}",
    }


def _window_drawdown(points: list[tuple[date, float]], start: date, end: date) -> float | None:
    values = np.array([v for d, v in points if start <= d <= end])
    if len(values) < 2:
        return None
    return float((values / np.maximum.accumulate(values) - 1).min())


def _replay(name: str, run: Run, panel: Panel) -> dict:
    start, end, label = REPLAYS[name]
    agent = _window_drawdown(
        [(date.fromisoformat(p["date"]), p["value"]) for p in run.curve], start, end
    )
    spx = _window_drawdown(
        list(
            zip(panel.benchmark["date"].to_list(), panel.benchmark["close"].to_list(), strict=True)
        ),
        start,
        end,
    )
    if agent is None or spx is None:
        return {"name": name, "passed": True, "detail": f"No trading history in {label}"}
    return {
        "name": name,
        "passed": agent >= spx,
        "detail": f"Drawdown {pct0(agent)} vs SPX {pct0(spx)}, {label}",
    }


def attack(
    recipe: Recipe, panel: Panel, run: Run | None = None, shuffles: int = 100, seed: int = 0
) -> dict:
    """{verdict, tests: [{name, passed, detail}]} for the recipe on this panel."""
    run = run or run_recipe(recipe, panel)
    lookahead, leaked = _lookahead(recipe, panel, run)
    tests = [
        lookahead,
        _shuffle(recipe, panel, shuffles, seed),
        _replay("2020 replay", run, panel),
        _replay("2022 replay", run, panel),
    ]
    return {"verdict": verdict(tests, leaked=leaked), "tests": tests}
