"""Holdings, screen and point-in-time fundamentals: the template's reference logic over
universe names only."""

from __future__ import annotations

import math
from datetime import date

import polars as pl

from app import repository


def _adv20() -> pl.LazyFrame:
    """20-day average dollar volume per universe ticker."""
    return (
        repository.recent_universe_trades()
        .with_columns((pl.col("close") * pl.col("volume")).alias("dollar_vol"))
        .group_by("ticker")
        .agg(pl.col("dollar_vol").tail(20).mean().alias("adv20"))
    )


def top_liquidity_holdings(n: int) -> dict:
    """Template fallback until the Mastermind allocates (CREW-14): equal weight over the
    top-N universe names by ADV20."""
    top = _adv20().sort("adv20", descending=True).limit(n).collect()
    w = round(1.0 / len(top), 8) if len(top) else 0.0
    return {
        "as_of": None,
        "method": "equal_weight_top_liquidity",
        "holdings": [{"ticker": t, "weight": w} for t in top["ticker"].to_list()],
    }


def screen(min_adv: float, sector_contains: str | None, limit: int) -> dict:
    out = _adv20().filter(pl.col("adv20") >= min_adv).collect().to_pandas()
    if sector_contains:
        sec = repository.sectors()
        if sec is not None:
            hit = sec["sic_description"].str.contains(sector_contains, case=False, na=False)
            out = out[out["ticker"].isin(sec.loc[hit, "ticker"])]
    out = out.sort_values("adv20", ascending=False).head(limit)
    return {"count": int(len(out)), "results": out.to_dict("records")}


def fundamentals_asof(ticker: str, on: date) -> list[dict]:
    rows = repository.fundamentals_asof(ticker, on).to_dict("records")
    # NaN/inf -> None so sparse fundamentals never 500 on json.dumps.
    return [
        {k: (None if isinstance(v, float) and not math.isfinite(v) else v) for k, v in r.items()}
        for r in rows
    ]
