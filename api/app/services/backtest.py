"""/backtest: the scorer's math, so our numbers are its numbers.

Ported from orkid-labs/utsa-investment-hackathon@3c137e7 launchpad/rubric/check.py
(`leg_returns`, `portfolio_metrics`). The data reads moved to the repository; the arithmetic
is unchanged. tests/test_judged.py holds it to the vendored scorer within 1e-9.
"""

from __future__ import annotations

import polars as pl

from app import repository
from app.models import BacktestRequest

TRADING_DAYS = 252


class BacktestRejected(ValueError):
    """The request breaks the mandate or the data cannot answer it."""


def leg_returns(closes: pl.DataFrame, divs: pl.DataFrame | None = None) -> pl.DataFrame:
    """Daily returns per leg; a leg with no print that day returns 0.0.

    With `divs`, stock legs earn total return on ex-dates: (close + cash) / prev_close - 1.
    """
    cols = [c for c in closes.columns if c != "date"]
    exprs = [pl.col(c) / pl.col(c).shift(1) - 1.0 for c in cols]
    rets = closes.select(["date", *exprs]).fill_null(0.0)

    if divs is not None:
        long_px = closes.select(["date", *cols]).unpivot(
            index="date", variable_name="ticker", value_name="px"
        )
        long_px = (
            long_px.with_columns(pl.col("px").shift(1).over("ticker").alias("prev_px"))
            .join(divs, on=["ticker", "date"], how="left")
            .with_columns((pl.col("div").fill_null(0.0) / pl.col("prev_px")).alias("dy"))
        )
        dy_wide = long_px.select(["date", "ticker", "dy"]).pivot(
            on="ticker", index="date", values="dy"
        )
        rets = rets.join(dy_wide, on="date", how="left", suffix="_dy")
        for c in cols:
            if f"{c}_dy" in rets.columns:
                rets = rets.with_columns(
                    (pl.col(c) + pl.col(f"{c}_dy").fill_null(0.0)).alias(c)
                ).drop(f"{c}_dy")
    return rets.drop("date")


def portfolio_metrics(rets: pl.DataFrame, wmap: dict[str, float]) -> dict:
    port = sum(rets[c] * wmap.get(c, 0.0) for c in rets.columns)
    n = port.len()
    if n == 0:
        return {}
    total = float((1 + port).product() - 1)
    mean = float(port.mean())
    std = float(port.std() or 0.0)
    ann_ret = (1 + total) ** (TRADING_DAYS / n) - 1
    ann_vol = std * TRADING_DAYS**0.5
    sharpe = (mean / std * TRADING_DAYS**0.5) if std else 0.0
    curve = (1 + port).cum_prod()
    max_dd = abs(float((curve / curve.cum_max() - 1).min()))
    return {
        "n_days": int(n),
        "total_return": total,
        "ann_return": ann_ret,
        "ann_vol": ann_vol,
        "sharpe": sharpe,
        "max_drawdown": max_dd,
    }


def run(req: BacktestRequest) -> dict:
    """Validate against the long-only mandate, then price every leg the scorer's way."""
    if req.end <= req.start:
        raise BacktestRejected("end must be after start")
    weights = req.weights or [1.0 / len(req.tickers)] * len(req.tickers)
    if len(weights) != len(req.tickers):
        raise BacktestRejected("weights length must match tickers")
    if any(w < 0 for w in weights):
        raise BacktestRejected("long-only: all weights must be >= 0")
    if abs(sum(weights) - 1.0) > 0.01:
        raise BacktestRejected("weights must sum to ~1.0")

    closes = repository.closes(req.tickers, req.start, req.end)
    if closes.height < 3:
        raise BacktestRejected("insufficient data in range")
    divs = None
    if req.adjust_dividends:
        stocks = [t for t in req.tickers if not repository.is_option(t)]
        divs = repository.dividends(stocks, req.start, req.end)

    wmap = dict(zip(req.tickers, weights, strict=True))
    metrics = portfolio_metrics(leg_returns(closes, divs), wmap)
    return {
        "tickers": req.tickers,
        "weights": weights,
        "start": str(req.start),
        "end": str(req.end),
        **metrics,
    }
