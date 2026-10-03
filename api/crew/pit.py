"""Point-in-time guards for everything the crew reads from the panel.

A decision on date D sees only rows dated <= D. Nothing on or after the holdout cutoff is ever
used. Rows with `snapshot_track_used == 1` take `fundamental_surprise` from a 2026-08-28 analyst
snapshot, which is lookahead for any earlier date, so they never feed a signal.
"""

from __future__ import annotations

from datetime import date

import polars as pl

TRAINING_START = date(2017, 1, 1)


def _date_col(col: str) -> pl.Expr:
    return pl.col(col).cast(pl.Date)


def visible_rows(df: pl.DataFrame, on: date, col: str = "date") -> pl.DataFrame:
    """Rows a decision made on `on` could have seen."""
    return df.filter(_date_col(col) <= on)


def training_window(manifest: dict) -> tuple[date, date]:
    """[start, cutoff): the cutoff itself is the first sealed day."""
    return TRAINING_START, date.fromisoformat(manifest["holdout_cutoff"])


def in_training_window(df: pl.DataFrame, manifest: dict, col: str = "date") -> pl.DataFrame:
    start, cutoff = training_window(manifest)
    d = _date_col(col)
    return df.filter((d >= start) & (d < cutoff))


def leaky_rows(df: pl.DataFrame) -> pl.DataFrame:
    """Rows whose fundamentals come from the future analyst snapshot."""
    return df.filter(pl.col("snapshot_track_used") == 1)


def clean_rows(df: pl.DataFrame) -> pl.DataFrame:
    """Rows safe to rank on. Refuses a frame that cannot say whether it is clean."""
    if "snapshot_track_used" not in df.columns:
        raise KeyError("snapshot_track_used missing: cannot prove these rows are clean")
    return df.filter(pl.col("snapshot_track_used") == 0)
