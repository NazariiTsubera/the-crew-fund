from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from crew.features import CONTROL_FLAGS, FEATURES
from crew.gemini import LLM, LLMError
from crew.recipe import Recipe, explain

DEFAULT_STRATEGY = {
    "features": [
        {
            "name": "fundamental_surprise",
            "weight": 0.40,
            "direction": "high",
        },
        {
            "name": "log_fv_gap",
            "weight": 0.30,
            "direction": "low",
        },
        {
            "name": "measured_half_life",
            "weight": 0.20,
            "direction": "high",
        },
        {
            "name": "growth_kalman_update",
            "weight": 0.10,
            "direction": "high",
        },
    ],
    "filters": [],
    "lookback_months": 12,
    "top_n": 10,
    "rebalance": "monthly",
    "sit_out_if_trailing_sharpe_below": None,
}


class StrategyChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=2000)


class StrategyChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[StrategyChatMessage] = Field(default_factory=list)
    strategy: dict | None = None


class StrategyChatResponse(BaseModel):
    reply: str
    ready: bool
    strategy: dict
    name: str
    persona: str
    strategy_line: str
    pitch: str


SYSTEM = f"""
You are Gemini, the investment-strategy recruiter for THE CREW.

Your job is to have a conversation with the user and turn their natural-language
investment preferences into an exact, backtestable Recipe.

IMPORTANT:
- Do NOT create an agent.
- Do NOT backtest.
- Do NOT claim a strategy will make or lose money.
- You are only building the strategy configuration.
- Always return the COMPLETE strategy, including unchanged values.
- Python will validate and normalize weights after you respond.
- Signal weights determine stock ranking. The selected stocks are then equally weighted.
- Feature weights are relative signal weights, not portfolio dollar allocations.

AVAILABLE FEATURES:
{chr(10).join(f"- {name}: {meaning}" for name, meaning in FEATURES.items())}

DIRECTIONS:
- "high" means higher values rank stocks higher.
- "low" means lower values rank stocks higher.

FILTERS:
Filters use:
  <column> <op> <value>

Columns may be features or:
{", ".join(CONTROL_FLAGS)}

Operators:
< <= > >= ==

Values may be a number or percentile such as p80.

RECIPE LIMITS:
- 1-8 features
- positive feature weights
- at most 6 filters
- lookback_months: 1-60
- top_n: 1-50
- rebalance: monthly
- sit_out_if_trailing_sharpe_below: -3 to 3 or null

DEFAULT STRATEGY:
{DEFAULT_STRATEGY}

CONVERSATION RULES:
1. Start from the current strategy supplied by Python.
2. Change only what the user's latest message requires.
3. If the user asks for "worst", "bad", "terrible", "lose money", or similar,
   interpret that as requesting an intentionally adverse/contrarian strategy,
   but do not claim that it is guaranteed to lose money.
4. If the user specifies a percentage allocation such as:
      valuation 50%, surprise 30%, growth 20%
   preserve those relative proportions.
5. If the user gives weights that do not total 100, Python will normalize them.
6. If the user has not specified a value, keep the current value.
7. Ask a clarification question only when the requested change cannot be
   reasonably inferred.
8. Set ready=true only when the user has clearly provided enough information
   to define the strategy or explicitly asks to finalize/confirm it.

IDENTITY:
Also return:
- name: short "The <Noun>" name
- persona: 1-2 sentences
- strategy_line: one concise sentence
- pitch: first-person one sentence

OUTPUT ONLY JSON.
"""


SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "ready": {"type": "boolean"},
        "name": {"type": "string"},
        "persona": {"type": "string"},
        "strategy_line": {"type": "string"},
        "pitch": {"type": "string"},
        "strategy": {
            "type": "object",
            "properties": {
                "features": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "enum": list(FEATURES),
                            },
                            "weight": {"type": "number"},
                            "direction": {
                                "type": "string",
                                "enum": ["high", "low"],
                            },
                        },
                        "required": ["name", "weight", "direction"],
                    },
                },
                "filters": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "lookback_months": {"type": "integer"},
                "top_n": {"type": "integer"},
                "rebalance": {
                    "type": "string",
                    "enum": ["monthly"],
                },
                "sit_out_if_trailing_sharpe_below": {
                    "type": ["number", "null"],
                },
            },
            "required": [
                "features",
                "filters",
                "lookback_months",
                "top_n",
                "rebalance",
                "sit_out_if_trailing_sharpe_below",
            ],
        },
    },
    "required": [
        "reply",
        "ready",
        "strategy",
        "name",
        "persona",
        "strategy_line",
        "pitch",
    ],
}


def _clean_identity(data: dict) -> dict:
    limits = {
        "name": 40,
        "persona": 280,
        "strategy_line": 160,
        "pitch": 240,
    }

    result = {}

    for key, limit in limits.items():
        value = " ".join(str(data.get(key) or "").split())

        if not value:
            raise ValueError(f"missing {key}")

        result[key] = value[:limit]

    return result


def build_strategy_chat(
    message: str,
    history: list[StrategyChatMessage],
    current: dict | None,
    llm: LLM,
) -> StrategyChatResponse:
    current_strategy = current or DEFAULT_STRATEGY

    # Validate the strategy coming from the browser before Gemini sees it.
    try:
        current_recipe = Recipe.model_validate(current_strategy)
    except ValidationError as exc:
        raise ValueError(f"invalid current strategy: {explain(exc)}") from exc

    transcript = "\n".join(f"{m.role.upper()}: {m.text}" for m in history[-12:])

    prompt = f"""
CURRENT STRATEGY:
{current_recipe.model_dump_json(indent=2)}

CONVERSATION:
{transcript or "(none)"}

LATEST USER MESSAGE:
{message}

Update the CURRENT STRATEGY according to the LATEST USER MESSAGE.

Return the complete strategy, not just changed fields.
"""

    try:
        data = llm.generate_json(
            SYSTEM,
            prompt,
            SCHEMA,
        )
    except LLMError as exc:
        raise ValueError(f"Gemini could not update the strategy ({exc})") from exc

    try:
        recipe = Recipe.model_validate(data.get("strategy") or {})
    except ValidationError as exc:
        raise ValueError(f"Gemini produced an invalid strategy: {explain(exc)}") from exc

    identity = _clean_identity(data)

    return StrategyChatResponse(
        reply=" ".join(str(data["reply"]).split()),
        ready=bool(data["ready"]),
        strategy=recipe.model_dump(),
        **identity,
    )
