"""Recompile: a judge changes a live agent's recipe and it goes through the full pipeline
again, keeping its identity and its chat."""

import json

import pytest
from fastapi.testclient import TestClient

from app import crew_repository
from app.main import app
from crew.store import JsonStore
from tests.synthetic import SIGNAL, make_panel
from tests.test_chat import AGENT

RECIPE = {
    "features": [{"name": SIGNAL, "weight": 1, "direction": "high"}],
    "lookback_months": 12,
    "top_n": 7,
}


@pytest.fixture(scope="module")
def panel():
    return make_panel(persistence=0.9)


@pytest.fixture
def client(panel, tmp_path, monkeypatch):
    store = JsonStore(tmp_path / "s.json")
    store.put_agent({**AGENT, "id": "skew", "name": "The Skew", "prompt": "Buy skew"})
    store.add_chat("skew", {"ts": "t", "role": "user", "text": "hello"})
    monkeypatch.setattr(crew_repository, "panel", lambda: panel)
    monkeypatch.setattr(crew_repository, "store", lambda: store)
    yield TestClient(app), store


def events(response):
    out = []
    for block in response.text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def test_a_recompile_runs_the_pipeline_and_replaces_the_recipe(client):
    http, store = client

    r = http.post("/agents/skew/recompile", json={"recipe": RECIPE})

    stream = events(r)
    assert [e for e, _ in stream] == ["backtesting", "redteam", "done"]
    agent = store.get_agent("skew")
    assert agent["recipe"]["top_n"] == 7
    assert agent["name"] == "The Skew" and agent["persona"] == AGENT["persona"]
    assert agent["prompt"] == "Buy skew"
    assert store.latest_run("skew")["kpis"]["sharpe"] == agent["kpis"]["sharpe"]
    assert stream[-1][1]["agent"]["id"] == "skew"


def test_a_recompile_keeps_the_conversation(client):
    http, store = client

    http.post("/agents/skew/recompile", json={"recipe": RECIPE})

    assert [c["text"] for c in store.chats("skew")][0] == "hello"
    assert any("Recompiled" in c["text"] for c in store.chats("skew"))


def test_recompile_refusals(client):
    http, _ = client
    assert http.post("/agents/nobody/recompile", json={"recipe": RECIPE}).status_code == 404
    bad = {**RECIPE, "features": [{"name": "alpha", "weight": 1, "direction": "high"}]}
    assert http.post("/agents/skew/recompile", json={"recipe": bad}).status_code == 422


def test_the_chat_sees_the_draft_on_screen(client):
    from app.routes.crew import get_llm
    from tests.test_compiler import FakeLLM

    http, _ = client
    llm = FakeLLM(
        {"text": "ok", "cited": [], "follow_ups": [], "proposal_json": "", "recompile": False}
    )
    app.dependency_overrides[get_llm] = lambda: lambda: llm
    try:
        r = http.post("/agents/skew/chat", json={"message": "Better?", "draft": RECIPE})
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    assert '"top_n": 7' in llm.calls[0][1]
