"""Request and response schemas. Judged shapes are the organizers' template's; do not rename."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class BacktestRequest(BaseModel):
    tickers: list[str] = Field(min_length=1)  # stocks and/or O: option legs
    weights: list[float] | None = None  # default: equal weight, all >= 0
    start: date
    end: date
    rebalance: str = "none"
    adjust_dividends: bool = False  # total return for stock legs, as the scorer computes it


class CreateAgentRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
