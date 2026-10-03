"""The judged endpoints, scored live by the organizers' checker.

Paths and response shapes are the organizers' template's
(orkid-labs/utsa-investment-hackathon@3c137e7 launchpad/template/app.py). HTTP only: logic
lives in app.services. Never import Gemini, the compiler or the chat module from here.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query

from app.models import BacktestRequest
from app.services import backtest as backtest_service
from app.services import market

router = APIRouter()


@router.get("/health")
def health() -> dict:
    # Never touches the dataset: a slow or missing data root must not fail the health check.
    return {"ok": True}


@router.get("/portfolio/holdings")
def holdings(n: int = Query(10, ge=1, le=100)) -> dict:
    return market.top_liquidity_holdings(n)


@router.post("/backtest")
def backtest(req: BacktestRequest) -> dict:
    """Daily close-to-close long-only backtest over stock and O: option legs."""
    try:
        return backtest_service.run(req)
    except backtest_service.BacktestRejected as e:
        raise HTTPException(400, str(e)) from e


@router.get("/screen")
def screen(
    min_adv: float = Query(0, description="min 20d avg dollar volume"),
    sector_contains: str | None = None,
    limit: int = Query(25, le=200),
) -> dict:
    return market.screen(min_adv, sector_contains, limit)


@router.get("/asof")
def asof(ticker: str, on: date) -> list[dict]:
    """Fundamentals a model could have seen on `on`: only rows whose filing existed by then."""
    try:
        return market.fundamentals_asof(ticker, on)
    except Exception as e:
        raise HTTPException(400, str(e)) from e
