"""In-memory synthetic panels for the engine tests: fast enough for a 700-ticker timing run.

One signal is planted: a ticker's `kl_surprise_bits` at a month-end decision date sets its
drift over the following month. Every other feature is noise.
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import polars as pl

from crew.features import CONTROL_FLAGS, FEATURES
from crew.panel import Panel

SIGNAL = "kl_surprise_bits"


def bizdays(start: date, end: date) -> list[date]:
    out, d = [], start
    while d <= end:
        if d.weekday() < 5:
            out.append(d)
        d += timedelta(days=1)
    return out


def make_panel(
    n_tickers: int = 40,
    start: date = date(2016, 1, 1),
    end: date = date(2026, 8, 31),
    cutoff: date = date(2026, 9, 1),
    drift: float = 0.02,
    noise: float = 0.01,
    seed: int = 3,
    market_shocks: dict[str, float] | None = None,
    persistence: float = 0.0,
    tilted_shocks: dict[str, tuple[float, float]] | None = None,
    leak_feature: str | None = None,
    name_beta: float = 1.0,
) -> Panel:
    """`market_shocks` maps "YYYY-MM" to a return applied to every name (and the S&P 500)
    spread evenly over that month's trading days.

    `persistence` makes the signal AR(1), so last month's reading still predicts.
    `tilted_shocks` maps "YYYY-MM" to (return, tilt): the S&P 500 takes the return, and each
    name takes return * (1 + tilt * the signal driving that month), so high-signal names fall
    harder. `leak_feature` overwrites that feature with each name's realized return over the
    holding period that follows the decision: future information a backtest must not trust.
    `name_beta` scales the market shocks for the names but not the S&P 500, the way small and
    mid caps fell harder than the index in 2020."""
    rng = np.random.default_rng(seed)
    days = [d for d in bizdays(start, end) if d < cutoff]
    months = sorted({(d.year, d.month) for d in days})
    month_of = np.array([months.index((d.year, d.month)) for d in days])
    counts = np.bincount(month_of)
    tickers = [f"T{i:03d}" for i in range(n_tickers)]

    signal = rng.normal(size=(len(months), n_tickers))
    for i in range(1, len(months)):
        signal[i] = persistence * signal[i - 1] + np.sqrt(1 - persistence**2) * signal[i]
    # Each month's drift comes from the signal at the previous month-end.
    month_drift = np.vstack([np.zeros((1, n_tickers)), drift * signal[:-1]])
    shocks = np.zeros(len(months))
    for m, r in (market_shocks or {}).items():
        y, mo = map(int, m.split("-"))
        if (y, mo) in months:
            shocks[months.index((y, mo))] = r
    name_shocks = np.repeat(shocks[:, None] * name_beta, n_tickers, axis=1)
    for m, (r, tilt) in (tilted_shocks or {}).items():
        y, mo = map(int, m.split("-"))
        if (y, mo) in months:
            i = months.index((y, mo))
            shocks[i] = r
            name_shocks[i] = r * (1 + tilt * signal[i - 1])
    daily = (
        month_drift[month_of] / counts[month_of][:, None]
        + name_shocks[month_of] / counts[month_of][:, None]
        + rng.normal(0, noise, size=(len(days), n_tickers))
    )
    prices = 100 * np.cumprod(1 + daily, axis=0)

    closes = pl.DataFrame(
        {
            "ticker": np.repeat(tickers, len(days)),
            "date": days * n_tickers,
            "close": prices.T.ravel(),
        }
    )
    spx_daily = (shocks[month_of] / counts[month_of]) + rng.normal(0, noise / 3, size=len(days))
    benchmark = pl.DataFrame({"date": days, "close": 3000 * np.cumprod(1 + spx_daily)})

    last_day = {mi: k for k, mi in enumerate(month_of)}
    month_ends = [days[last_day[i]] for i in range(len(months))]
    rows = []
    for i, d in enumerate(month_ends):
        if d < date(2017, 1, 1):
            continue
        feats = rng.normal(size=(n_tickers, len(FEATURES)))
        frame = {"ticker": tickers, "date": [d] * n_tickers}
        for k, f in enumerate(FEATURES):
            frame[f] = feats[:, k]
        frame[SIGNAL] = signal[i]
        frame["amihud_illiq"] = np.abs(feats[:, list(FEATURES).index("amihud_illiq")]) * 1e-4
        if leak_feature and i + 2 < len(months):
            # Entry the day after this month-end, exit the day after next month-end.
            entry, exit_ = last_day[i] + 1, last_day[i + 1] + 1
            frame[leak_feature] = prices[exit_] / prices[entry] - 1
        for flag in CONTROL_FLAGS:
            frame[flag] = [0] * n_tickers
        rows.append(pl.DataFrame(frame))
    vectors = pl.concat(rows)

    return Panel(
        vectors=vectors,
        closes=closes,
        benchmark=benchmark,
        sectors=pl.DataFrame({"ticker": tickers, "name": tickers}),
        manifest={"holdout_cutoff": str(cutoff), "source": "synthetic"},
    )
