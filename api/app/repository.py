"""The only module that reads the organizers' dataset.

Everything above this layer gets plain polars/pandas frames and never calls the SDK, so the
data rules (universe only, point-in-time only) are enforced once, here.
SV_DATA_ROOT and SV_DATA_TOKEN select a local root or the organizers' data server.
"""

from __future__ import annotations

from datetime import date, timedelta
from functools import lru_cache

import pandas as pd
import polars as pl
from statevector import Dataset

# Planted in the price panel to catch anyone who trades outside the universe.
PLANTED_TICKER = "ORKD"


def is_option(t: str) -> bool:
    return t.startswith("O:")


@lru_cache(maxsize=1)
def dataset() -> Dataset:
    # Lazy so importing the app never needs a dataset root.
    return Dataset()


@lru_cache(maxsize=1)
def universe() -> frozenset[str]:
    return frozenset(dataset().universe()) - {PLANTED_TICKER}


def recent_universe_trades(days: int = 45) -> pl.LazyFrame:
    """Universe stock prints over the trailing `days` (ticker, date, close, volume)."""
    # A bounded window keeps the remote client to ~30 day-files.
    cutoff = str(date.today() - timedelta(days=days))
    return (
        dataset()
        ._scan("stocks_daily", start=cutoff)
        .filter(pl.col("ticker").is_in(list(universe())))
    )


def closes(tickers: list[str], start: date, end: date) -> pl.DataFrame:
    """Wide daily closes, one column per leg: stocks from stocks_daily, O: legs from
    options_daily. Same query as the scorer's `leg_returns`."""
    ds = dataset()
    opts = [t for t in tickers if is_option(t)]
    stocks = [t for t in tickers if not is_option(t)]
    scans = []
    if stocks:
        scans.append(
            ds._scan("stocks_daily", start=str(start), end=str(end)).filter(
                pl.col("ticker").is_in(stocks)
            )
        )
    if opts:
        scans.append(
            ds._scan("options_daily", start=str(start), end=str(end)).filter(
                pl.col("ticker").is_in(opts)
            )
        )
    return (
        pl.concat(scans, how="diagonal_relaxed")
        .filter(pl.col("date").is_between(start, end))
        .select(["date", "ticker", "close"])
        .collect()
        .pivot(on="ticker", index="date", values="close")
        .sort("date")
    )


def dividends(stocks: list[str], start: date, end: date) -> pl.DataFrame | None:
    """Cash dividends per (ticker, ex-date) as `div`, or None when the panel is absent.

    Reads the raw files the scorer's `_dividends` reads, in its order, so totals agree.
    """
    root = dataset().root
    if root is None:
        return None
    p = next(
        (
            x
            for x in (
                root / "data/raw/massive/dividends.parquet",
                root / "data/raw/massive/dividends_all.parquet",
            )
            if x.exists()
        ),
        None,
    )
    if p is None:
        return None
    df = pl.read_parquet(p)
    dcol = next((c for c in df.columns if "ex_dividend" in c or c == "ex_date"), None)
    acol = next((c for c in df.columns if c in ("cash_amount", "amount")), None)
    if not dcol or not acol:
        return None
    return (
        df.filter(pl.col("ticker").is_in(stocks))
        .with_columns(pl.col(dcol).cast(pl.Date).alias("date"))
        .filter(pl.col("date").is_between(start, end))
        .group_by(["ticker", "date"])
        .agg(pl.col(acol).sum().alias("div"))
    )


def fundamentals_asof(ticker: str, on: date) -> pd.DataFrame:
    """Fundamental rows whose filing existed by `on`.

    The SDK falls back to period-end dates when no filing is on record yet, which shows a
    quarter before it was filed. We return nothing instead: no filing, no row.
    """
    ds = dataset()
    filed = (
        ds._scan("report_calendar_us")
        .filter(
            (pl.col("ticker") == ticker)
            & pl.col("filing_date").is_not_null()
            & (pl.col("filing_date").cast(pl.Date) <= on)
        )
        .limit(1)
        .collect()
    )
    if filed.is_empty():
        return pd.DataFrame()
    return ds.fundamentals(ticker, asof=str(on))


def sectors() -> pd.DataFrame | None:
    # The SDK raises KeyError for a missing panel; the template only caught FileNotFoundError.
    try:
        return dataset().sectors()
    except (FileNotFoundError, KeyError):
        return None
