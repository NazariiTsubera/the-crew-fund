"""The recruiter chat: Gemini edits a recipe in conversation; Python validates every turn."""

import pytest

from crew.gemini import LLMError
from crew.strategy_chat import DEFAULT_STRATEGY, build_strategy_chat
from tests.test_compiler import FakeLLM

IDENTITY = {
    "name": "The Bargain Hunter",
    "persona": "Cheap and patient.",
    "strategy_line": "Buys cheap names that beat estimates.",
    "pitch": "I buy what the market forgot.",
}


def reply(strategy: dict, ready: bool = False) -> dict:
    return {"reply": "Updated.", "ready": ready, "strategy": strategy, **IDENTITY}


def test_returns_the_validated_strategy_with_normalized_weights():
    strategy = {
        **DEFAULT_STRATEGY,
        "features": [
            {"name": "log_fv_gap", "weight": 50, "direction": "low"},
            {"name": "fundamental_surprise", "weight": 50, "direction": "high"},
        ],
    }
    out = build_strategy_chat("value, 50/50", [], None, FakeLLM(reply(strategy, ready=True)))
    assert out.ready is True
    assert [f["weight"] for f in out.strategy["features"]] == pytest.approx([0.5, 0.5])
    assert out.name == "The Bargain Hunter"


def test_sends_the_current_strategy_to_gemini():
    llm = FakeLLM(reply(DEFAULT_STRATEGY))
    current = {**DEFAULT_STRATEGY, "top_n": 25}
    build_strategy_chat("hold 25", [], current, llm)
    assert '"top_n": 25' in llm.calls[0][1]


def test_refuses_an_unknown_feature_from_gemini():
    bad = {**DEFAULT_STRATEGY, "features": [{"name": "alpha", "weight": 1, "direction": "high"}]}
    with pytest.raises(ValueError, match="invalid strategy"):
        build_strategy_chat("x", [], None, FakeLLM(reply(bad)))


def test_refuses_an_invalid_current_strategy_before_calling_gemini():
    llm = FakeLLM()
    with pytest.raises(ValueError, match="invalid current strategy"):
        build_strategy_chat("x", [], {**DEFAULT_STRATEGY, "top_n": 0}, llm)
    assert llm.calls == []


def test_a_gemini_failure_is_a_value_error():
    with pytest.raises(ValueError, match="Gemini could not"):
        build_strategy_chat("x", [], None, FakeLLM(LLMError("429 quota")))
