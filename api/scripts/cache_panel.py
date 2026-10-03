"""Pull the panel every backtest reads into local parquet, sealed at the holdout cutoff.

    cd api && SV_DATA_ROOT=https://... SV_DATA_TOKEN=... uv run python -m scripts.cache_panel
    cd api && uv run python -m scripts.cache_panel --max-tickers 20 --out tests/fixtures/panel

Writes cache/state_vector.parquet (one row per ticker per month-end decision date, 2017-01 on),
closes.parquet (daily, from 2016 for trailing windows), benchmark.parquet (S&P 500),
sectors.parquet and manifest.json. Nothing dated on or after `holdout_cutoff` is written, and
ORKD (the organizers' sentinel) never is. This cache is what makes a nine-year backtest take
seconds instead of minutes against the remote dataset.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import polars as pl
from statevector import Dataset
from statevector.pit import holdout_cutoff

from app.mirror import mirrored_scan
from crew.features import CLOCK_FIELDS, CONTROL_FLAGS, FEATURES, PLANTED_TICKER
from crew.panel import cache_dir

DECISIONS_FROM = date(2017, 1, 1)
CLOSES_FROM = date(2016, 1, 1)
# A month-end vector older than this is stale, not a decision-date reading.
MAX_VECTOR_AGE = timedelta(days=10)


def progress(message: str) -> None:
    print(f"[{datetime.now(UTC):%H:%M:%S}] {message}", file=sys.stderr, flush=True)


def last_trading_day(ds: Dataset) -> date:
    # A bounded scan: the remote client would otherwise fetch every day-file since 2003.
    recent = (
        ds._scan("stocks_daily", start=str(date.today() - timedelta(days=21)))
        .select(pl.col("date").max())
        .collect()
        .item()
    )
    return recent or max(ds.trading_days())


def build(ds: Dataset, out: Path, max_tickers: int | None = None) -> dict:
    cutoff = holdout_cutoff(end=last_trading_day(ds))
    universe = sorted(set(ds.universe()) - {PLANTED_TICKER})
    if max_tickers:
        universe = universe[:max_tickers]

    # Day-files come through the parallel mirror the API shares (cache/mirror): the SDK alone
    # reads them one at a time over HTTP, which is most of a full pull's wall time.
    mirror = out / "mirror"
    progress(f"cutoff {cutoff}; {len(universe)} tickers; daily closes from {CLOSES_FROM}")
    closes = (
        mirrored_scan(ds, "stocks_daily", str(CLOSES_FROM), str(cutoff - timedelta(days=1)), mirror)
        .filter(
            pl.col("ticker").is_in(universe)
            & (pl.col("date") >= CLOSES_FROM)
            & (pl.col("date") < cutoff)
        )
        .select(["ticker", "date", "close"])
        .collect()
        .sort(["ticker", "date"])
    )
    decision_dates = (
        closes.filter(pl.col("date") >= DECISIONS_FROM)
        .group_by(pl.col("date").dt.strftime("%Y-%m").alias("month"))
        .agg(pl.col("date").max().alias("decision_date"))
        .sort("month")
    )

    # Only the days just before each decision date are read: the rest of the state vector is
    # never used, and on a daily-partitioned panel this skips most of its files.
    progress(f"{decision_dates.height} decision dates; state vector at each month-end")
    if ds.base is None:  # a local root: one scan is cheapest
        sv = ds._scan("state_vector", str(DECISIONS_FROM - MAX_VECTOR_AGE), str(cutoff))
    else:
        sv = pl.concat(
            [
                mirrored_scan(ds, "state_vector", str(d - MAX_VECTOR_AGE), str(d), mirror).filter(
                    pl.col("date").cast(pl.Date).is_between(d - MAX_VECTOR_AGE, d)
                )
                for d in decision_dates["decision_date"].to_list()
            ],
            how="diagonal_relaxed",
        )
    wanted = [*FEATURES, *CLOCK_FIELDS, *CONTROL_FLAGS]
    present = [c for c in wanted if c in sv.collect_schema().names()]
    # The last reading per ticker at or before each month's decision date.
    vectors = (
        sv.filter(pl.col("ticker").is_in(universe) & (pl.col("date") < cutoff))
        .select(["ticker", "date", *present])
        .collect()
        .with_columns(pl.col("date").dt.strftime("%Y-%m").alias("month"))
        .join(decision_dates, on="month")
        .filter(
            (pl.col("date") <= pl.col("decision_date"))
            & (pl.col("date") > pl.col("decision_date") - MAX_VECTOR_AGE)
        )
        .sort("date")
        .group_by(["ticker", "month"])
        .last()
        .rename({"date": "observed", "decision_date": "date"})
        .drop("month")
        .sort(["date", "ticker"])
    )

    progress(f"{vectors.height} vector rows; S&P 500 and sectors")
    benchmark = (
        ds._scan("index_daily")
        .filter(
            (pl.col("index") == "SPX") & (pl.col("date") >= CLOSES_FROM) & (pl.col("date") < cutoff)
        )
        .select(["date", "close"])
        .collect()
        .sort("date")
    )
    try:
        sectors = pl.from_pandas(ds.sectors()).filter(pl.col("ticker").is_in(universe))
    except (FileNotFoundError, KeyError):
        sectors = pl.DataFrame({"ticker": []}, schema={"ticker": pl.String})

    out.mkdir(parents=True, exist_ok=True)
    frames = {
        "state_vector": vectors,
        "closes": closes,
        "benchmark": benchmark,
        "sectors": sectors,
    }
    for name, frame in frames.items():
        frame.write_parquet(out / f"{name}.parquet")

    dates = decision_dates["decision_date"].to_list()
    manifest = {
        "holdout_cutoff": str(cutoff),
        "built_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "source": ds.base or str(ds.root),
        "first_decision": str(dates[0]) if dates else None,
        "last_decision": str(dates[-1]) if dates else None,
        "decision_dates": len(dates),
        "tickers": vectors["ticker"].n_unique(),
        "features": present,
        "rows": {name: frame.height for name, frame in frames.items()},
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=cache_dir())
    ap.add_argument("--max-tickers", type=int, default=None)
    args = ap.parse_args()
    manifest = build(Dataset(), args.out, args.max_tickers)
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
