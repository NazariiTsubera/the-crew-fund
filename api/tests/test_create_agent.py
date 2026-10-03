"""POST /agents: words in, a live agent out, with every stage streamed."""

import json
import time

import pytest
from fastapi.testclient import TestClient

from app import crew_repository
from app.main import app
from app.routes.crew import get_llm
from crew.gemini import LLMError
from tests.synthetic import make_panel
from tests.test_compiler import GOOD, FakeLLM


@pytest.fixture(scope="module")
def panel():
    return make_panel(persistence=0.9)


@pytest.fixture
def client(panel, monkeypatch):
    monkeypatch.setattr(crew_repository, "panel", lambda: panel)
    yield TestClient(app)
    app.dependency_overrides.clear()


def use_llm(*replies):
    app.dependency_overrides[get_llm] = lambda: lambda: FakeLLM(*replies)


def events(response):
    out = []
    for block in response.text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def test_stages_stream_in_order_and_the_agent_is_stored(client):
    use_llm(GOOD)
    t0 = time.monotonic()

    response = client.post("/agents", json={"prompt": "Buy rising skew, skip illiquid names"})

    assert response.headers["content-type"].startswith("text/event-stream")
    stream = events(response)
    assert [e for e, _ in stream] == ["compiling", "backtesting", "redteam", "done"]
    assert time.monotonic() - t0 < 15
    agent = stream[-1][1]["agent"]
    assert agent["name"] == "The Skew Hound"
    assert agent["prompt"] == "Buy rising skew, skip illiquid names"
    assert agent["verdict"] in {"pass", "probation", "killed"}
    stored = crew_repository.store().get_agent(agent["id"])
    assert stored["capital_share"] == agent["capital_share"]
    assert crew_repository.store().latest_run("fund")


def test_backtesting_announces_the_compiled_recipe(client):
    use_llm(GOOD)

    stream = dict(events(client.post("/agents", json={"prompt": "skew"})))

    assert stream["backtesting"]["name"] == "The Skew Hound"
    assert stream["backtesting"]["recipe"]["features"][0]["name"] == "skew_25d"


def test_two_agents_get_distinct_ids_and_shapes(client):
    use_llm(GOOD, GOOD)

    first = events(client.post("/agents", json={"prompt": "skew"}))[-1][1]["agent"]
    second = events(client.post("/agents", json={"prompt": "skew"}))[-1][1]["agent"]

    assert first["id"] != second["id"]
    assert (first["shape"], first["color"]) != (second["shape"], second["color"])


def test_a_compile_failure_is_an_error_event_and_nothing_is_stored(client):
    use_llm(LLMError("quota exceeded"))

    stream = events(client.post("/agents", json={"prompt": "skew"}))

    assert stream[-1][0] == "error"
    assert "Gemini" in stream[-1][1]["message"]
    assert crew_repository.store().list_agents() == []


def test_a_missing_gemini_key_is_an_error_event(client, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    stream = events(client.post("/agents", json={"prompt": "skew"}))

    assert stream[-1][0] == "error"
    assert "GEMINI_API_KEY" in stream[-1][1]["message"]


def test_an_empty_prompt_is_rejected(client):
    assert client.post("/agents", json={"prompt": ""}).status_code == 422
