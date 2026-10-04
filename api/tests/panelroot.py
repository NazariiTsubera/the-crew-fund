"""A synthetic dataset root with a state vector, for the panel cache and the engine tests.

Laid out like the organizers' real root (state_vector partitioned under data/canonical,
index_daily with an `index` column, reference_tickers under raw/massive). One signal is planted:
a ticker's `kl_surprise_bits` at a month-end decision date sets its drift over the following
month. Everything else is noise. ORKD trades and has a state vector but is not in the universe.

    python -m tests.panelroot <dir>    # build one to run scripts/cache_panel.py against
"""

from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import polars as pl

from crew.features import CONTROL_FLAGS, FEATURES, PLANTED_TICKER

START = date(2016, 1, 1)
SIGNAL = "kl_surprise_bits"
SIGNAL_DRIFT = 0.02  # monthly drift per unit of the planted signal
# Raw closes carry splits, as the organizers' stocks_daily does: (ticker index, ex-date, to/from).
SPLITS = [(0, date(2020, 6, 1), 2.0), (1, date(2021, 3, 1), 0.1)]


def tickers(n: int) -> list[str]:
    return [f"T{i:02d}" for i in range(n)]


def _bizdays(start: date, end: date) -> list[date]:
    d, out = start, []
    while d <= end:
        if d.weekday() < 5:
            out.append(d)
        d += timedelta(days=1)
    return out


def build(root: Path, n_tickers: int = 12, end: date | None = None, seed: int = 7) -> Path:
    rng = np.random.default_rng(seed)
    end = end or date.today()
    days = _bizdays(START, end)
    by_month: dict[tuple[int, int], list[date]] = {}
    for d in days:
        by_month.setdefault((d.year, d.month), []).append(d)
    months = sorted(by_month)
    month_end = {m: by_month[m][-1] for m in months}
    names = [*tickers(n_tickers), PLANTED_TICKER]

    signal = {(t, m): rng.normal() for t in names for m in months}
    closes, vectors = [], []
    for t in names:
        px = 100.0
        for i, m in enumerate(months):
            # Drift this month comes from the signal observed at the previous month-end.
            drift = SIGNAL_DRIFT * signal[(t, months[i - 1])] if i else 0.0
            mdays = by_month[m]
            for d in mdays:
                px *= 1 + drift / len(mdays) + rng.normal(0, 0.01)
                closes.append({"ticker": t, "date": d, "close": px, "volume": 1e6})
            row = {"ticker": t, "date": month_end[m]}
            row |= {f: float(rng.normal()) for f in FEATURES}
            row[SIGNAL] = signal[(t, m)]
            row["amihud_illiq"] = abs(row["amihud_illiq"]) * 1e-4
            row |= {flag: 0 for flag in CONTROL_FLAGS}
            row["snapshot_track_used"] = int(rng.random() < 0.05)
            vectors.append(row)

    split_rows = []
    for i, ex, ratio in SPLITS:
        if i < n_tickers:
            t = tickers(n_tickers)[i]
            for row in closes:
                if row["ticker"] == t and row["date"] >= ex:
                    row["close"] /= ratio
            split_rows.append(
                {"ticker": t, "ex_date": ex, "kind": "split", "value": ratio, "raw": "{}"}
            )

    canonical = root / "data/canonical"
    (canonical / "state_vector").mkdir(parents=True, exist_ok=True)
    (root / "data/structural").mkdir(parents=True, exist_ok=True)
    (root / "data/raw/massive").mkdir(parents=True, exist_ok=True)

    pl.DataFrame(closes).write_parquet(canonical / "stocks_daily.parquet")
    sv = pl.DataFrame(vectors)
    for year in sorted({m[0] for m in months}):
        sv.filter(pl.col("date").dt.year() == year).write_parquet(
            canonical / "state_vector" / f"{year}.parquet"
        )
    spx = (
        pl.DataFrame(closes)
        .group_by("date")
        .agg(pl.col("close").mean())
        .sort("date")
        .with_columns(pl.lit("SPX").alias("index"))
    )
    spx.write_parquet(canonical / "index_daily.parquet")
    pl.DataFrame(
        {
            "ticker": names,
            "name": [f"{t} Inc" for t in names],
            "sic_description": ["SERVICES-PREPACKAGED SOFTWARE"] * len(names),
            "primary_exchange": ["XNAS"] * len(names),
            "market_cap": [1e10] * len(names),
        }
    ).write_parquet(root / "data/raw/massive/reference_tickers.parquet")
    pl.DataFrame(
        split_rows
        + [
            {
                "ticker": "T00",
                "ex_date": date(2019, 3, 1),
                "kind": "dividend:cash",
                "value": 0.5,
                "raw": "{}",
            }
        ],
        schema={
            "ticker": pl.String,
            "ex_date": pl.Date,
            "kind": pl.String,
            "value": pl.Float64,
            "raw": pl.String,
        },
    ).write_parquet(root / "data/structural/corporate_actions.parquet")
    (root / "data/structural/universe_us.txt").write_text("\n".join(tickers(n_tickers)) + "\n")
    return root


if __name__ == "__main__":
    print(build(Path(sys.argv[1])))
