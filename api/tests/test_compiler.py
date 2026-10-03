"""The compiler: words in, a validated Recipe (plus name and persona) out. It never sees a
return or a date."""

import pytest

from crew.compiler import SYSTEM, CompileError, compile_strategy
from crew.features import FEATURES
from crew.gemini import LLMError

GOOD = {
    "name": "The Skew Hound",
    "persona": "Nervous, quick, reads the options pit.",
    "strategy_line": "Buys names where options skew is rising and informed flow builds.",
    "pitch": "I follow rising skew and building informed flow",
    "recipe": {
        "features": [
            {"name": "skew_25d", "weight": 0.6, "direction": "high"},
            {"name": "oi_divergence", "weight": 0.4, "direction": "high"},
        ],
        "filters": ["amihud_illiq < p80"],
        "lookback_months": 6,
        "top_n": 10,
        "sit_out_if_trailing_sharpe_below": 0.0,
    },
}


class FakeLLM:
    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls = []

    def generate_json(self, system, prompt, schema):
        self.calls.append((system, prompt, schema))
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def bad_feature():
    draft = {**GOOD, "recipe": {**GOOD["recipe"]}}
    draft["recipe"]["features"] = [{"name": "secret_alpha", "weight": 1, "direction": "high"}]
    return draft


def test_a_good_draft_compiles_to_a_recipe_and_identity():
    out = compile_strategy("Buy rising skew, skip illiquid names", FakeLLM(GOOD))

    assert out.name == "The Skew Hound"
    assert [f.name for f in out.recipe.features] == ["skew_25d", "oi_divergence"]
    assert out.recipe.filters[0] == "snapshot_track_used == 0"


def test_the_prompt_lists_every_feature_and_no_numbers_from_the_market():
    llm = FakeLLM(GOOD)
    compile_strategy("Buy rising skew", llm)
    system, prompt, schema = llm.calls[0]

    assert all(f in system for f in FEATURES)
    assert "Buy rising skew" in prompt
    assert "return" not in prompt.lower().replace("returns", "")
    assert schema["type"] == "object"


def test_an_invented_feature_gets_one_correction_round():
    llm = FakeLLM(bad_feature(), GOOD)

    out = compile_strategy("Use secret alpha", llm)

    assert out.recipe.features[0].name == "skew_25d"
    assert "unknown feature 'secret_alpha'" in llm.calls[1][1]


def test_a_draft_still_wrong_after_the_retry_is_refused_readably():
    with pytest.raises(CompileError) as e:
        compile_strategy("Use secret alpha", FakeLLM(bad_feature(), bad_feature()))

    assert "unknown feature 'secret_alpha'" in str(e.value)


def test_an_empty_prompt_is_refused_without_calling_gemini():
    llm = FakeLLM()

    with pytest.raises(CompileError):
        compile_strategy("   ", llm)
    assert llm.calls == []


def test_gemini_failing_is_a_readable_compile_error():
    with pytest.raises(CompileError) as e:
        compile_strategy("Buy skew", FakeLLM(LLMError("quota exceeded")))

    assert "Gemini" in str(e.value)


def test_the_system_prompt_forbids_dates_and_returns():
    assert "never" in SYSTEM.lower()
