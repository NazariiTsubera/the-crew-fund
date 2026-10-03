"""Request and response schemas. Judged shapes are the organizers' template's; do not rename."""

from __future__ import annotations

from datetime import date
from typing import Literal

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


class ChatRequest(BaseModel):
    # Omitted: the agent introduces itself (the creation flow's first message).
    message: str | None = Field(default=None, min_length=1, max_length=1000)


# --- The War Room's data contract (web/src/lib/api.ts mirrors these) ---


class CurvePoint(BaseModel):
    date: str
    value: float


class Kpis(BaseModel):
    total_return: float
    ann_return: float
    ann_vol: float
    sharpe: float
    max_drawdown: float  # negative
    max_drawdown_month: str | None
    turnover: float | None = None
    trailing_12m_sharpe: float | None = None


class RedTeamTest(BaseModel):
    name: str
    passed: bool
    detail: str


class RedTeam(BaseModel):
    verdict: Literal["pass", "probation", "killed"]
    tests: list[RedTeamTest]


class RecipeFeature(BaseModel):
    name: str
    weight: float
    direction: Literal["high", "low"]


class RecipeOut(BaseModel):
    features: list[RecipeFeature]
    filters: list[str]
    lookback_months: int
    top_n: int
    rebalance: str
    sit_out_if_trailing_sharpe_below: float | None


class Holding(BaseModel):
    ticker: str
    weight: float
    reason: str | None = None
    agent_id: str | None = None


class AgentSummary(BaseModel):
    id: str
    name: str
    persona: str
    strategy_line: str
    pitch: str
    shape: str
    color: str
    status: Literal["trading", "sitting_out", "killed"]
    verdict: Literal["pass", "probation", "killed"]
    capital_share: float
    capital_trend: Literal["up", "down", "flat"]
    stop_month: str | None = None
    kpis: Kpis
    spark: list[float]  # month-end equity, for the agents table sparkline


class Agent(AgentSummary):
    recipe: RecipeOut
    redteam: RedTeam
    yearly_returns: dict[str, float]
    curve: list[CurvePoint]  # daily equity, 1.0 at the first decision date
    benchmark: list[CurvePoint]  # the S&P 500 on the same base
    holdings_month: str | None
    holdings: list[Holding]  # the latest book
    prompt: str | None = None
    created_at: str | None = None


class LogEntry(BaseModel):
    ts: str
    type: Literal["trade", "risk", "mastermind", "redteam"]
    text: str
    agent_id: str | None = None


class Fund(BaseModel):
    as_of: str
    holdout_cutoff: str
    kpis: Kpis
    spx_kpis: Kpis
    invested_fraction: float
    curve: list[CurvePoint]
    benchmark: list[CurvePoint]
    agents: list[AgentSummary]
    holdings: list[Holding]
    latest_memo: str | None


class CapitalMonth(BaseModel):
    month: str
    shares: dict[str, float]
    invested: float


class Capital(BaseModel):
    months: list[CapitalMonth]
