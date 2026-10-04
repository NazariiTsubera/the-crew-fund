"""What-if: an edited recipe through the same backtest and red team, never stored."""

import pytest

from crew.pipeline import evaluate
from crew.recipe import Recipe
from crew.whatif import run_whatif, whatif_facts
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
