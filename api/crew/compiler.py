"""The compiler: turns a strategy described in words into a Recipe, a name and a persona.

Gemini sees the words and the feature glossary, never a return, a price or a date, so nothing
it writes can be fitted to the backtest it is about to face. Its draft is validated by the
recipe grammar; a draft that fails gets one correction round with the readable errors, then is
refused.
"""

from __future__ import annotations

from dataclasses import dataclass

from pydantic import ValidationError

from crew.features import CONTROL_FLAGS, FEATURES
from crew.gemini import LLM, LLMError
from crew.recipe import Recipe, explain

MAX_PROMPT = 2000

SYSTEM = f"""You compile a stock-picking strategy described in plain English into a recipe for a
long-only, monthly-rebalanced equity fund, and give the agent that runs it a name and a persona.

The recipe ranks stocks each month by a weighted blend of these state-vector features. Use
only these names, exactly as written:
{chr(10).join(f"- {name}: {meaning}" for name, meaning in FEATURES.items())}

direction "high" prefers high values of a feature, "low" prefers low values. Use 1 to 8
features; weights are positive and are normalized for you.

filters (optional, at most 6) read "<column> <op> <value>", where column is a feature above or
one of {", ".join(CONTROL_FLAGS)}; op is one of < <= > >= ==; value is a number or pNN, the NNth
percentile across stocks that month. Example: "amihud_illiq < p80" skips the most illiquid 20%.

lookback_months (1-60) is how many months of the agent's own record its sit-out rule looks at.
top_n (1-50) is how many stocks it holds, equally weighted.
sit_out_if_trailing_sharpe_below (-3 to 3, or null) makes it hold cash while its trailing
Sharpe is below that floor.

name: "The <Noun>", a heist-crew role that fits the strategy. persona: one or two sentences of
voice and temperament. strategy_line: one sentence a judge can read. pitch: first person, one
sentence, no trailing period.

Never invent performance, dates, prices or results: you have not seen any data."""

SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "persona": {"type": "string"},
        "strategy_line": {"type": "string"},
        "pitch": {"type": "string"},
        "recipe": {
            "type": "object",
            "properties": {
                "features": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "enum": list(FEATURES)},
                            "weight": {"type": "number"},
                            "direction": {"type": "string", "enum": ["high", "low"]},
                        },
                        "required": ["name", "weight", "direction"],
                    },
                },
                "filters": {"type": "array", "items": {"type": "string"}},
                "lookback_months": {"type": "integer"},
                "top_n": {"type": "integer"},
                "sit_out_if_trailing_sharpe_below": {"type": ["number", "null"]},
            },
            "required": ["features", "lookback_months", "top_n"],
        },
    },
    "required": ["name", "persona", "strategy_line", "pitch", "recipe"],
}


class CompileError(ValueError):
    """The words could not be turned into a valid recipe; the message says why."""


@dataclass(frozen=True)
class Compiled:
    recipe: Recipe
    name: str
    persona: str
    strategy_line: str
    pitch: str


def _identity(draft: dict) -> dict:
    out = {}
    for key, limit in (("name", 40), ("persona", 280), ("strategy_line", 160), ("pitch", 240)):
        value = " ".join(str(draft.get(key) or "").split())
        if not value:
            raise CompileError(f"the draft has no {key}")
        out[key] = value[:limit]
    return out


def compile_strategy(text: str, llm: LLM) -> Compiled:
    words = " ".join(text.split())
    if not words:
        raise CompileError("describe a strategy first")
    if len(words) > MAX_PROMPT:
        raise CompileError(f"keep the description under {MAX_PROMPT} characters")

    prompt = f"Strategy: {words}"
    problem = ""
    for attempt in range(2):
        if attempt:
            prompt = (
                f"Strategy: {words}\n\nYour previous recipe was rejected: {problem}\n"
                "Fix those fields and answer again with the full JSON."
            )
        try:
            draft = llm.generate_json(SYSTEM, prompt, SCHEMA)
        except LLMError as e:
            raise CompileError(f"Gemini could not compile this right now ({e})") from e
        try:
            recipe = Recipe.model_validate(draft.get("recipe") or {})
            return Compiled(recipe=recipe, **_identity(draft))
        except ValidationError as e:
            problem = explain(e)
        except CompileError as e:
            problem = str(e)
    raise CompileError(f"could not build a valid recipe: {problem}")
