"""What-if: an edited recipe through the same backtest and red team, never stored."""

import pytest

from crew.pipeline import evaluate
from crew.recipe import Recipe
from crew.whatif import run_whatif, whatif_context, whatif_facts
from tests.synthetic import SIGNAL, make_panel


@pytest.fixture(scope="module")
def panel():
    return make_panel(persistence=0.9)


def recipe(direction="high", top_n=5):
    return Recipe(
        features=[{"name": SIGNAL, "weight": 1, "direction": direction}],
        lookback_months=12,
        top_n=top_n,
    )


def test_a_what_if_is_the_same_evaluation_any_agent_gets(panel):
    out = run_whatif(recipe(), panel)
    run, report = evaluate(recipe(), panel)

    assert out["kpis"] == run.kpis
    assert out["redteam"] == report
    assert out["curve"] == run.curve
    assert out["recipe"] == recipe().model_dump()


def test_the_same_recipe_is_not_evaluated_twice(panel, monkeypatch):
    run_whatif(recipe(top_n=6), panel)
    monkeypatch.setattr("crew.whatif.evaluate", lambda *a, **k: pytest.fail("re-evaluated"))
    assert run_whatif(recipe(top_n=6), panel)["kpis"]


def test_what_if_facts_compare_the_variant_with_the_live_agent(panel):
    live = {"kpis": {"sharpe": 0.41, "total_return": 1.06, "max_drawdown": -0.54}}
    out = run_whatif(recipe(direction="low"), panel)

    facts = whatif_facts(live, out)

    joined = "\n".join(facts)
    assert facts[0].startswith("What-if (unsaved")
    assert "Sharpe" in joined and "0.41" in joined
    assert "Red Team" in joined
    assert f"{SIGNAL}" in joined and "low" in joined


def test_the_ai_hears_who_the_agent_is_but_never_its_record():
    agent = {
        "name": "The Skew",
        "strategy_line": "Follows rising skew.",
        "prompt": "Buy rising skew",
        "recipe": {**RECIPE, "features": [{"name": "skew_25d", "weight": 1, "direction": "high"}]},
        "kpis": {"sharpe": 0.4321, "total_return": 1.2345},
    }

    ctx = whatif_context(agent)

    assert "The Skew" in ctx and "Follows rising skew." in ctx and "Buy rising skew" in ctx
    assert "skew_25d" in ctx
    assert "funding_stress" in ctx  # the market-wide caveat
    assert "0.4321" not in ctx and "1.2345" not in ctx and "sharpe" not in ctx.lower()


@pytest.fixture
def client(panel, tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from app import crew_repository
    from app.main import app
    from app.routes.crew import get_llm
    from crew.store import JsonStore
    from tests.test_compiler import FakeLLM

    store = JsonStore(tmp_path / "s.json")
    from tests.test_chat import AGENT

    store.put_agent({**AGENT, "id": "skew", "name": "The Skew"})
    monkeypatch.setattr(crew_repository, "panel", lambda: panel)
    monkeypatch.setattr(crew_repository, "store", lambda: store)
    llm = FakeLLM({"text": "Compared.", "cited": [], "follow_ups": []})
    app.dependency_overrides[get_llm] = lambda: lambda: llm
    yield TestClient(app), store, llm
    app.dependency_overrides.clear()


RECIPE = {
    "features": [{"name": SIGNAL, "weight": 1, "direction": "high"}],
    "lookback_months": 12,
    "top_n": 5,
}


def test_the_endpoint_backtests_a_variant_without_storing_it(client):
    http, store, _ = client
    before = (len(store.list_agents()), len(store.log()))

    r = http.post("/agents/skew/whatif", json={"recipe": RECIPE})

    assert r.status_code == 200
    body = r.json()
    assert set(body) >= {"kpis", "curve", "redteam", "recipe", "yearly_returns"}
    assert (len(store.list_agents()), len(store.log())) == before


def test_an_unknown_agent_or_feature_is_refused(client):
    http, _, _ = client
    assert http.post("/agents/nobody/whatif", json={"recipe": RECIPE}).status_code == 404
    bad = {**RECIPE, "features": [{"name": "alpha", "weight": 1, "direction": "high"}]}
    assert http.post("/agents/skew/whatif", json={"recipe": bad}).status_code == 422


def test_the_chat_hears_about_the_variant_from_the_server(client):
    http, _, llm = client

    r = http.post("/agents/skew/chat", json={"message": "Is this better?", "whatif": RECIPE})

    assert r.status_code == 200
    assert "What-if Sharpe" in llm.calls[-1][1]


def compiled(recipe: dict, changed: bool = True) -> dict:
    return {
        "reply": "Leaned into the signal.",
        "ready": True,
        "changed": changed,
        "ask_to_compile": False,
        "compile": False,
        "strategy": recipe,
        "name": "The Skew",
        "persona": "Nervous.",
        "strategy_line": "Skew.",
        "pitch": "I follow skew.",
    }


def test_the_ai_recompiles_the_draft_without_storing_or_running_it(client, monkeypatch):
    http, store, llm = client
    llm.replies[:] = [compiled({**RECIPE, "top_n": 8})]
    before = (len(store.list_agents()), len(store.log()))
    monkeypatch.setattr("crew.whatif.evaluate", lambda *a, **k: pytest.fail("ran a backtest"))

    r = http.post("/agents/skew/whatif/compile", json={"message": "hold 8", "recipe": RECIPE})

    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"reply", "recipe", "changed"}
    assert body["reply"] == "Leaned into the signal."
    assert body["changed"] is True and body["recipe"]["top_n"] == 8
    prompt = llm.calls[-1][1]
    assert '"top_n": 5' in prompt and "The Skew" in prompt and "hold 8" in prompt
    assert (len(store.list_agents()), len(store.log())) == before


def test_a_question_keeps_the_draft(client):
    http, _, llm = client
    llm.replies[:] = [compiled({**RECIPE, "top_n": 30}, changed=False)]

    r = http.post(
        "/agents/skew/whatif/compile", json={"message": "what is skew?", "recipe": RECIPE}
    )

    assert r.status_code == 200
    assert r.json()["changed"] is False and r.json()["recipe"]["top_n"] == 5


def test_recompile_refusals_are_readable(client):
    http, _, llm = client
    body = {"message": "x", "recipe": RECIPE}
    assert http.post("/agents/nobody/whatif/compile", json=body).status_code == 404
    empty = {**body, "message": ""}
    assert http.post("/agents/skew/whatif/compile", json=empty).status_code == 422

    bad = {**RECIPE, "features": [{"name": "alpha", "weight": 1, "direction": "high"}]}
    llm.replies[:] = [compiled(bad)]
    r = http.post("/agents/skew/whatif/compile", json=body)
    assert r.status_code == 400 and "invalid strategy" in r.json()["detail"]


def test_recompile_without_an_ai_key_is_a_503(client):
    from app.main import app
    from app.routes.crew import get_llm
    from crew.gemini import LLMError

    def no_key():
        raise LLMError("no key")

    app.dependency_overrides[get_llm] = lambda: no_key
    http, _, _ = client

    r = http.post("/agents/skew/whatif/compile", json={"message": "x", "recipe": RECIPE})

    assert r.status_code == 503
