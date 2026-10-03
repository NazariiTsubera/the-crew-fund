"""The cached panel every backtest reads: month-end state vectors, daily closes, the S&P 500.

Built by scripts/cache_panel.py from the organizers' dataset and sealed at the holdout cutoff,
so nothing that reads a Panel can see the trailing 30 days.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import date
from functools import cached_property
from pathlib import Path

import polars as pl

from crew.features import PLANTED_TICKER

DEFAULT_CACHE = Path(__file__).parent.parent / "cache"
FILES = ("state_vector", "closes", "benchmark", "sectors")


@dataclass(frozen=True)
class Panel:
    vectors: pl.DataFrame  # ticker, date (decision date), features, flags
    closes: pl.DataFrame  # ticker, date, close (daily)
    benchmark: pl.DataFrame  # date, close (S&P 500)
    sectors: pl.DataFrame  # ticker, name, sic_description, ...
    manifest: dict

    @property
    def holdout_cutoff(self) -> date:
        return date.fromisoformat(self.manifest["holdout_cutoff"])

    @cached_property
    def decision_dates(self) -> list[date]:
        return sorted(self.vectors["date"].unique().to_list())


def cache_dir() -> Path:
    return Path(os.environ.get("CREW_CACHE_DIR") or DEFAULT_CACHE)


def load_panel(path: Path | None = None) -> Panel:
    path = Path(path or cache_dir())
    frames = {
        name: pl.read_parquet(path / f"{name}.parquet")
        if (path / f"{name}.parquet").exists()
        else pl.DataFrame({"ticker": []}, schema={"ticker": pl.String})
        for name in FILES
    }
    # Belt and braces: the cache script already drops it.
    for name in ("state_vector", "closes", "sectors"):
        frames[name] = frames[name].filter(pl.col("ticker") != PLANTED_TICKER)
    return Panel(
        vectors=frames["state_vector"],
        closes=frames["closes"],
        benchmark=frames["benchmark"],
        sectors=frames["sectors"],
        manifest=json.loads((path / "manifest.json").read_text()),
    )
