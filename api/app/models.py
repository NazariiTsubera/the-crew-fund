"""Request and response schemas. Judged shapes are the organizers' template's; do not rename."""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

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


class StrategyChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=2000)


class StrategyFeatureRequest(BaseModel):
    name: str
    weight: float = Field(gt=0)
    direction: Literal["high", "low"]


class StrategyRequest(BaseModel):
    features: list[StrategyFeatureRequest] = Field(min_length=1, max_length=8)
    filters: list[str] = Field(default_factory=list, max_length=6)
    lookback_months: int = Field(default=12, ge=1, le=60)
    top_n: int = Field(default=10, ge=1, le=50)
    rebalance: Literal["monthly"] = "monthly"
    sit_out_if_trailing_sharpe_below: float | None = Field(default=None, ge=-3, le=3)


class StrategyChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[StrategyChatTurn] = Field(default_factory=list, max_length=30)
    strategy: StrategyRequest | None = None


class ChatRequest(BaseModel):
    # Omitted: the agent introduces itself (the creation flow's first message).
    message: str | None = Field(default=None, min_length=1, max_length=2000)
    # A what-if recipe the judge is testing; the server re-runs it rather than trust numbers.
    whatif: StrategyRequest | None = None
    # The recipe as edited in the recipe card, not yet recompiled; the agent edits from it.
    draft: StrategyRequest | None = None


class CapitalRequest(BaseModel):
    # The judge's split: a non-negative weight per agent, normalized by the fund; 0 benches one.
    allocations: dict[str, Annotated[float, Field(ge=0)]] = Field(min_length=1)


class WhatIfRequest(BaseModel):
    recipe: StrategyRequest


class WhatIfCompileRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    recipe: StrategyRequest  # the panel's current draft, which the AI edits


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class CreateAgentFromStrategyRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    strategy: StrategyRequest
    name: str = Field(min_length=1, max_length=40)
    persona: str = Field(min_length=1, max_length=280)
    strategy_line: str = Field(min_length=1, max_length=160)
    pitch: str = Field(min_length=1, max_length=240)


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


class WhatIfCompile(BaseModel):
    reply: str
    recipe: RecipeOut
    changed: bool  # False when the message was a question and the draft stands as sent


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
