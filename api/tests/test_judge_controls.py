"""The judge is the Mastermind: they set each agent's share of capital and fire agents."""

import pytest
from fastapi.testclient import TestClient

from app import crew_repository
from app.main import app
from crew.pipeline import evaluate, publish, rebalance
from crew.recipe import Recipe
from crew.store import JsonStore
from tests.synthetic import SIGNAL, make_panel


@pytest.fixture(scope="module")
def panel():
    return make_panel(persistence=0.9, n_tickers=60)


@pytest.fixture
def client(panel, tmp_path, monkeypatch):
    store = JsonStore(tmp_path / "s.json")
    for agent_id, feature in [("a", SIGNAL), ("b", "skew_25d")]:
        recipe = Recipe(
            features=[{"name": feature, "weight": 1, "direction": "high"}],
            lookback_months=12,
            top_n=10,
        )
        run, report = evaluate(recipe, panel, shuffles=10)
        meta = {
            "id": agent_id,
            "name": agent_id.upper(),
            "persona": "",
            "strategy_line": "",
            "pitch": "",
            "shape": "box",
            "color": "sky",
        }
        publish(store, meta, recipe, run, report)
    rebalance(store, panel)
    monkeypatch.setattr(crew_repository, "panel", lambda: panel)
    monkeypatch.setattr(crew_repository, "store", lambda: store)
    yield TestClient(app), store


def test_capital_starts_equal(client):
    _, store = client
    assert {a["id"]: a["capital_share"] for a in store.list_agents()} == pytest.approx(
        {"a": 0.5, "b": 0.5}
    )


def test_the_judge_sets_the_split(client):
    http, store = client

    r = http.post("/capital", json={"allocations": {"a": 3, "b": 1}})

    assert r.status_code == 200
    shares = {a["id"]: a["capital_share"] for a in store.list_agents()}
    assert shares == pytest.approx({"a": 0.75, "b": 0.25})
    holdings = http.get("/portfolio/holdings").json()
    weights = (
        holdings["weights"]
        if "weights" in holdings
        else [h["weight"] for h in holdings["holdings"]]
    )
    assert sum(weights) == pytest.approx(1.0)


def test_a_split_must_name_real_agents_and_not_be_negative(client):
    http, _ = client
    assert http.post("/capital", json={"allocations": {"zz": 1}}).status_code == 404
    assert http.post("/capital", json={"allocations": {"a": -1}}).status_code == 422


def test_the_judge_fires_an_agent(client):
    http, store = client

    assert http.delete("/agents/b").status_code == 200

    assert [a["id"] for a in store.list_agents()] == ["a"]
    assert store.get_agent("a")["capital_share"] == pytest.approx(1.0)
    assert http.delete("/agents/b").status_code == 404
