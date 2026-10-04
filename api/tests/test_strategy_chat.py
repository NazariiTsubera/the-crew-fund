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


def test_a_question_leaves_the_recipe_exactly_as_it_was():
    current = {**DEFAULT_STRATEGY, "top_n": 25}
    drifted = {**DEFAULT_STRATEGY, "top_n": 7}  # Gemini echoed a different recipe anyway
    llm = FakeLLM({**reply(drifted), "changed": False, "ask_to_compile": False, "compile": False})

    out = build_strategy_chat("What does log_fv_gap measure?", [], current, llm)

    assert out.strategy["top_n"] == 25
    assert out.changed is False


def test_an_edit_changes_the_recipe():
    edited = {**DEFAULT_STRATEGY, "top_n": 7}
    llm = FakeLLM({**reply(edited), "changed": True, "ask_to_compile": True, "compile": False})

    out = build_strategy_chat("Hold 7 names", [], None, llm)

    assert out.strategy["top_n"] == 7
    assert out.ready is True and out.compile is False


def test_compiles_only_on_agreement():
    llm = FakeLLM(
        {**reply(DEFAULT_STRATEGY), "changed": False, "ask_to_compile": False, "compile": True}
    )

    out = build_strategy_chat("Yes, compile it", [], None, llm)

    assert out.compile is True and out.ready is True


def test_the_prompt_researches_first_and_asks_before_compiling():
    llm = FakeLLM(
        {**reply(DEFAULT_STRATEGY), "changed": False, "ask_to_compile": False, "compile": False}
    )
    build_strategy_chat("hi", [], None, llm)
    system = llm.calls[0][0]

    assert "research" in system.lower()
    assert "compile" in system and "explicitly" in system


def test_context_about_the_agent_reaches_the_prompt():
    llm = FakeLLM({**reply(DEFAULT_STRATEGY), "changed": False})

    build_strategy_chat("lean into value", [], None, llm, context="AGENT: The Ledger")

    assert "AGENT: The Ledger" in llm.calls[0][1]
