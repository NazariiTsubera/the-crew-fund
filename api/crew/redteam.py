"""The red team: four attacks on every new agent, matching the design's Red Team card.

1. Lookahead test: score each month on the previous month's vector. A real signal keeps
   more than 80% of its Sharpe; one that leans on information it should not have collapses.
2. Shuffle test: the agent's monthly picks against random picks from the same eligible names,
   gross of costs. Passes when p < 0.05.
3. 2020 replay: drawdown Feb–Apr 2020 no worse than 90% of random books of the same size
   drawn from the same eligible names (the S&P 500 is shown for context).
4. 2022 replay: the same, Dec 2021–Dec 2022.

Verdict: no failures is `pass`, one is `probation`, two or more is `killed`. A lookahead test
that collapses (the lagged signal keeps under a quarter of its Sharpe) kills on its own: that is
what leakage looks like, and a backtest that leaks makes the other three numbers meaningless. A
milder drop is a real but fast-decaying signal, and counts as one ordinary failure.
"""

from __future__ import annotations

from datetime import date

import numpy as np

from crew.backtest import Market, Run, fmt, market_for, rank_month, run_recipe
from crew.panel import Panel
from crew.recipe import Recipe

TESTS = ["Lookahead test", "Shuffle test", "2020 replay", "2022 replay"]
LAG_KEEP = 0.8
LAG_COLLAPSE = 0.25
P_MAX = 0.05
REPLAY_DRAWS = 100
REPLAY_TAIL = 10  # percentile of random books' drawdowns an agent must not fall below
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


def _random_books_drawdowns(
    recipe: Recipe, panel: Panel, start: date, end: date, draws: int, seed: int
) -> np.ndarray | None:
    """Drawdowns over [start, end] of `draws` equal-weight books of top_n names drawn at random
    from the recipe's eligible names each month: same pool, same size, no signal."""
    m: Market = market_for(panel)
    rng = np.random.default_rng(seed)
    values = np.ones(draws)
    path: list[np.ndarray] = []
    for i in range(len(m.decisions)):
        entry, exit_ = m.entry[i], m.exit[i]
        if m.dates[exit_] < start or m.dates[entry] > end:
            continue
        ranked = rank_month(m, recipe, i)
        if ranked is None:
            books = np.ones((exit_ - entry + 1, draws))
        else:
            cols = np.array([m.col[t] for t in ranked["ticker"].to_list()])
            k = min(recipe.top_n, len(cols))
            picks = np.array([rng.choice(cols, k, replace=False) for _ in range(draws)])
            with np.errstate(invalid="ignore", divide="ignore"):
                rel = m.prices[entry : exit_ + 1][:, picks] / m.prices[entry, picks]
            books = np.nan_to_num(np.nanmean(rel, axis=2), nan=1.0)  # day x draw
        # Day 0 of a period is the previous period's last day; skip it after the first.
        for k in range(0 if not path else 1, len(books)):
            if start <= m.dates[entry + k] <= end:
                path.append(values * books[k])
        values = values * books[-1]
    if len(path) < 2:
        return None
    curves = np.array(path)
    return (curves / np.maximum.accumulate(curves, axis=0) - 1).min(axis=0)


def _replay(name: str, recipe: Recipe, run: Run, panel: Panel, seed: int) -> dict:
    """The agent's drawdown against random books of the same size from its own eligible names.
    Against the S&P 500 a 10-name equal-weight book of mid caps loses every crash on size and
    concentration alone; against books like its own, only the picks are judged. The S&P 500
    stays in the detail for context."""
    start, end, label = REPLAYS[name]
    agent = _window_drawdown(
        [(date.fromisoformat(p["date"]), p["value"]) for p in run.curve], start, end
    )
    random = _random_books_drawdowns(recipe, panel, start, end, REPLAY_DRAWS, seed)
    spx = _window_drawdown(
        list(
            zip(panel.benchmark["date"].to_list(), panel.benchmark["close"].to_list(), strict=True)
        ),
        start,
        end,
    )
    if agent is None or random is None:
        return {"name": name, "passed": True, "detail": f"No trading history in {label}"}
    # In a crash every name falls together, so a book's drawdown against the typical random
    # book is close to a coin flip. It fails only when worse than 90% of them: the picks made
    # the crash measurably worse.
    median, tail = float(np.median(random)), float(np.percentile(random, REPLAY_TAIL))
    context = f", SPX {pct0(spx)}" if spx is not None else ""
    return {
        "name": name,
        "passed": agent >= tail,
        "detail": f"Drawdown {pct0(agent)} vs random picks {pct0(median)} "
        f"(worst 10% {pct0(tail)}){context}, {label}",
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
        _replay("2020 replay", recipe, run, panel, seed),
        _replay("2022 replay", recipe, run, panel, seed),
    ]
    return {"verdict": verdict(tests, leaked=leaked), "tests": tests}
