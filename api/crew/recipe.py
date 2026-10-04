"""The recipe grammar: the only thing a strategy description can be compiled into.

A recipe ranks the universe at each month-end by a weighted blend of state-vector features,
drops names that fail its filters, and holds the top N equally. Every name and number is
checked here, so the compiler cannot smuggle in a feature, a filter or a parameter we cannot
backtest honestly.

Filters read `<column> <op> <value>`: the column is a feature, clock field or control flag;
the op is one of < <= > >= ==; the value is a number or `pNN`, the NNth cross-sectional
percentile on that date. `snapshot_track_used == 0` is always present (crew/pit.py).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator

from crew.features import CLOCK_FIELDS, CONTROL_FLAGS, FEATURES

ALWAYS = "snapshot_track_used == 0"
FILTER_COLUMNS = {*FEATURES, *CLOCK_FIELDS, *CONTROL_FLAGS}
OPS = ("<=", ">=", "==", "<", ">")
_FILTER = re.compile(r"^\s*([a-z0-9_]+)\s*(<=|>=|==|<|>)\s*(p\d{1,2}|-?\d+(?:\.\d+)?)\s*$")


@dataclass(frozen=True)
class Filter:
    column: str
    op: str
    value: float
    percentile: bool

    @classmethod
    def parse(cls, text: str) -> Filter:
        m = _FILTER.match(text)
        if not m:
            raise ValueError(
                f"filter {text!r} must read '<column> <op> <number or pNN>', "
                "e.g. 'amihud_illiq < p80' or 'options_thin_chain == 0'"
            )
        column, op, raw = m.groups()
        if column not in FILTER_COLUMNS:
            raise ValueError(f"unknown column {column!r} in filter {text!r}")
        percentile = raw.startswith("p")
        value = float(raw[1:]) if percentile else float(raw)
        if percentile and not 1 <= value <= 99:
            raise ValueError(f"percentile in {text!r} must be p1..p99")
        return cls(column, op, value, percentile)


class FeatureWeight(BaseModel):
    name: str
    weight: float = Field(gt=0)
    direction: Literal["high", "low"]

    @field_validator("name")
    @classmethod
    def known_feature(cls, name: str) -> str:
        if name not in FEATURES:
            raise ValueError(f"unknown feature {name!r}; use one of the 27 state-vector features")
        return name


class Recipe(BaseModel):
    features: list[FeatureWeight] = Field(min_length=1, max_length=8)
    filters: list[str] = Field(default_factory=list, max_length=6, validate_default=True)
    # Trailing window, in months, of the agent's own returns for the sit-out rule.
    lookback_months: int = Field(ge=1, le=60)
    top_n: int = Field(ge=1, le=50)
    rebalance: Literal["monthly"] = "monthly"
    sit_out_if_trailing_sharpe_below: float | None = Field(default=None, ge=-3, le=3)

    @field_validator("filters")
    @classmethod
    def whitelisted_filters(cls, filters: list[str]) -> list[str]:
        cleaned = [" ".join(f.split()) for f in filters]
        for f in cleaned:
            Filter.parse(f)
        return [ALWAYS, *(f for f in cleaned if f != ALWAYS)]

    @model_validator(mode="after")
    def normalized_and_unique(self) -> Recipe:
        names = [f.name for f in self.features]
        dupes = sorted({n for n in names if names.count(n) > 1})
        if dupes:
            raise ValueError(f"feature {dupes[0]!r} appears twice")
        total = sum(f.weight for f in self.features)
        for f in self.features:
            f.weight = round(f.weight / total, 6)
        return self

    def parsed_filters(self) -> list[Filter]:
        return [Filter.parse(f) for f in self.filters]


def explain(error: ValidationError) -> str:
    """One line per problem, in words a person (or the compiler's retry) can act on."""
    lines = []
    for e in error.errors():
        where = ".".join(str(p) for p in e["loc"]) or "recipe"
        msg = e["msg"].removeprefix("Value error, ")
        lines.append(f"{where}: {msg}")
    return "; ".join(lines)
