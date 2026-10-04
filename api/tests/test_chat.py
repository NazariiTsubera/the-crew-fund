"""Agent chat: answers in persona from the agent's own stored rows, with evidence."""

import pytest

from crew.chat import answer, facts_for
from crew.gemini import LLMError
from crew.store import JsonStore
from tests.test_compiler import FakeLLM

AGENT = {
    "id": "lookout",
    "name": "The Lookout",
    "persona": "Calm, terse, paranoid about funding markets.",
    "pitch": "I read the macro regime",
    "status": "sitting_out",
    "verdict": "probation",
    "capital_share": 0.15,
    "capital_trend": "down",
    "kpis": {
        "total_return": 0.31,
        "sharpe": 0.62,
        "max_drawdown": -0.12,
        "max_drawdown_month": "2020-03",
        "ann_return": 0.03,
        "ann_vol": 0.05,
        "turnover": 0.15,
        "trailing_12m_sharpe": 0.12,
    },
    "yearly_returns": {"2021": 0.05, "2022": -0.02},
    "redteam": {
        "verdict": "probation",
        "tests": [
            {
                "name": "Lookahead test",
                "passed": True,
                "detail": "Sharpe 0.62 → 0.58 with signals lagged one month",
            },
            {
                "name": "Shuffle test",
                "passed": True,
                "detail": "Shuffled-label Sharpe 0.01 over 100 runs, p=0.010",
            },
            {
                "name": "2020 replay",
                "passed": True,
                "detail": "Drawdown −8% vs SPX −34%, Feb–Apr 2020",
            },
            {
                "name": "2022 replay",
                "passed": False,
                "detail": "Drawdown −27% vs SPX −25%, Dec 2021–Dec 2022",
            },
        ],
    },
}


@pytest.fixture
def store(tmp_path):
    s = JsonStore(tmp_path / "s.json")
    s.put_agent(AGENT)
    s.put_holdings(
        "lookout",
        [
            {
                "month": "2026-08",
                "ticker": "MSFT",
                "weight": 0.6,
                "agent_id": "lookout",
                "reason": "funding_stress −0.40, inflation_expectation 2.70",
            },
        ],
    )
    s.replace_log(
        [
            {
                "ts": "2022-03-01 16:00",
                "agent_id": "lookout",
                "type": "risk",
                "text": "Sat out: trailing Sharpe −0.31 below 0.25 floor",
            },
            {
                "ts": "2022-04-01 16:00",
                "agent_id": "lookout",
                "type": "risk",
                "text": "Sat out: trailing Sharpe −0.40 below 0.25 floor",
            },
            {
                "ts": "2025-06-02 16:00",
                "agent_id": "lookout",
                "type": "mastermind",
                "text": "Cut The Lookout 20% → 15% · trailing Sharpe 0.1",
            },
            {
                "ts": "2026-08-03 16:00",
                "agent_id": "lookout",
                "type": "trade",
                "text": "Bought MSFT 60.0% — funding_stress −0.40",
            },
        ],
        agent_id="lookout",
    )
    return s


def offline():
    return FakeLLM(LLMError("network down"))


def all_fact_texts(store, question):
    return {f["text"] for f in facts_for(store, AGENT, question)}


def test_how_are_you_doing_cites_stored_kpis_offline(store):
    out = answer(store, AGENT, "How are you doing?", offline())

    assert out["source"] == "fallback"
    assert "+31.0%" in out["text"]
    assert out["evidence"]
    assert set(out["evidence"]) <= all_fact_texts(store, "How are you doing?")


def test_why_did_you_sit_out_in_2022_cites_the_2022_rows(store):
    out = answer(store, AGENT, "Why did you sit out in 2022?", offline())

    assert any("2022-03-01" in e and "Sat out" in e for e in out["evidence"])
    assert "−2.0%" in out["text"]


def test_why_do_you_hold_msft_cites_the_holding(store):
    out = answer(store, AGENT, "Why do you hold MSFT?", offline())

    assert any(e.startswith("Holds MSFT") for e in out["evidence"])
    assert "funding_stress" in out["text"]


def test_red_team_question_lists_the_failed_test(store):
    out = answer(store, AGENT, "What did the Red Team find?", offline())

    assert "2022 replay" in out["text"]
    assert any("2022 replay" in e for e in out["evidence"])


def test_mastermind_question_cites_its_memo(store):
    out = answer(store, AGENT, "Why did the Mastermind cut you?", offline())

    assert any("Cut The Lookout 20% → 15%" in e for e in out["evidence"])


def test_gemini_answers_in_persona_and_evidence_comes_only_from_cited_facts(store):
    facts = facts_for(store, AGENT, "How are you doing?")
    llm = FakeLLM({"text": "Fine. Thirty-one percent.", "cited": [facts[0]["id"], "F999"]})

    out = answer(store, AGENT, "How are you doing?", llm)

    assert out["source"] == "gemini"
    assert out["text"] == "Fine. Thirty-one percent."
    assert out["evidence"] == [facts[0]["text"]]
    system, prompt, _ = llm.calls[0]
    assert AGENT["persona"] in system
    assert facts[0]["text"] in prompt


def test_the_exchange_is_stored(store):
    answer(store, AGENT, "How are you doing?", offline())

    roles = [c["role"] for c in store.chats("lookout")]
    assert roles == ["user", "agent"]


def test_intro_introduces_without_a_user_message(store):
    out = answer(store, AGENT, None, offline())

    assert "I read the macro regime" in out["text"]
    assert "PROBATION" in out["text"]
    assert [c["role"] for c in store.chats("lookout")] == ["agent"]


def test_the_chat_endpoint_answers_offline_and_keeps_history(monkeypatch):
    from fastapi.testclient import TestClient

    from app.crew_repository import store as app_store
    from app.main import app

    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    app_store().put_agent(AGENT)
    client = TestClient(app)

    reply = client.post("/agents/lookout/chat", json={"message": "How are you doing?"}).json()
    intro = client.post("/agents/lookout/chat", json={}).json()

    assert reply["source"] == "fallback" and reply["evidence"]
    assert "PROBATION" in intro["text"]
    assert len(client.get("/agents/lookout/chat").json()) == 3
    assert client.post("/agents/nobody/chat", json={"message": "hi"}).status_code == 404


def test_a_fallback_says_why_gemini_was_not_used(store):
    limited = FakeLLM(LLMError("boom", "rate limited (429)"))
    out = answer(store, AGENT, "How are you doing?", limited)

    assert out["source"] == "fallback"
    assert out["fallback_reason"] == "rate limited (429)"


def test_a_gemini_answer_has_no_fallback_reason(store):
    facts = facts_for(store, AGENT, "How are you doing?")
    out = answer(store, AGENT, "How are you doing?", FakeLLM({"text": "Fine.", "cited": []}))

    assert out["source"] == "gemini"
    assert "fallback_reason" not in out
    assert facts


RECIPE = {
    "features": [{"name": "kyle_lambda", "weight": 1.0, "direction": "low"}],
    "filters": [],
    "lookback_months": 12,
    "top_n": 10,
    "rebalance": "monthly",
    "sit_out_if_trailing_sharpe_below": 0.25,
}


def test_the_facts_explain_the_recipe_in_plain_words(store):
    facts = [f["text"] for f in facts_for(store, {**AGENT, "recipe": RECIPE}, "What do you do?")]

    assert any("kyle_lambda" in t and "low" in t and "price impact" in t for t in facts)
    assert any("top 10" in t and "sit out" in t.lower() for t in facts)


def test_gemini_answers_keep_paragraphs_and_offer_follow_ups(store):
    llm = FakeLLM(
        {
            "text": "First  point.\n\nSecond point.",
            "cited": [],
            "follow_ups": ["What about 2020?", "  ", "Why MSFT?", "a", "b"],
        }
    )

    out = answer(store, AGENT, "How are you doing?", llm)

    assert out["text"] == "First point.\n\nSecond point."
    assert out["follow_ups"] == ["What about 2020?", "Why MSFT?", "a"]


def test_the_prompt_asks_for_a_full_answer_not_attitude(store):
    llm = FakeLLM({"text": "Fine.", "cited": [], "follow_ups": []})
    answer(store, AGENT, "How are you doing?", llm)
    system = llm.calls[0][0]

    assert "two to four sentences" not in system
    assert "paragraph" in system and "follow_ups" in system


def test_a_fallback_also_offers_follow_ups(store):
    out = answer(store, AGENT, "How are you doing?", offline())

    assert 1 <= len(out["follow_ups"]) <= 3
    assert "How are you doing?" not in out["follow_ups"]
