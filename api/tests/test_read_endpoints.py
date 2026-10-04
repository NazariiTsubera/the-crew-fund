"""The War Room's read endpoints over a seeded store."""

import time

import pytest
from fastapi.testclient import TestClient

from app import crew_repository
from app.main import app
from crew.store import JsonStore
from scripts.seed_agents import seed
from tests.synthetic import make_panel


@pytest.fixture(scope="module")
def seeded(tmp_path_factory):
    store = JsonStore(tmp_path_factory.mktemp("read") / "store.json")
    seed(store, make_panel(n_tickers=60, persistence=0.9, market_shocks={"2020-03": -0.3}))
    return store


@pytest.fixture
def client(seeded, monkeypatch):
    monkeypatch.setattr(crew_repository, "store", lambda: seeded)
    return TestClient(app)


def timed(client, path):
    t0 = time.monotonic()
    response = client.get(path)
    assert time.monotonic() - t0 < 0.5, path
    assert response.status_code == 200, (path, response.text)
    return response.json()


def test_vault_carries_every_tile(client):
    fund = timed(client, "/vault")

    assert fund["as_of"] == "2026-08"
    assert fund["holdout_cutoff"] == "2026-09-01"
    assert fund["curve"][0]["value"] == 1.0 and fund["benchmark"]
    assert len(fund["agents"]) == 5
    assert all(a["spark"] for a in fund["agents"])
    assert abs(sum(h["weight"] for h in fund["holdings"]) - 1) < 1e-6
    assert 0 <= fund["invested_fraction"] <= 1
    assert "latest_memo" in fund  # None when the Mastermind never moved capital


def test_agents_list_and_detail(client):
    agents = timed(client, "/agents")
    agent = timed(client, f"/agents/{agents[0]['id']}")

    assert [a["id"] for a in agents][:2] == ["accountant", "fence"]
    assert len(agent["redteam"]["tests"]) == 4
    assert agent["recipe"]["features"]
    assert agent["curve"] and agent["benchmark"]
    assert agent["yearly_returns"]


def test_an_unknown_agent_is_a_404(client):
    assert client.get("/agents/nobody").status_code == 404
    assert client.get("/agents/nobody/log").status_code == 404


def test_agent_log_filters_by_month_and_type(client):
    rows = timed(client, "/agents/accountant/log?month=2020-03")
    risk = timed(client, "/agents/accountant/log?type=redteam")

    assert rows and all(r["ts"].startswith("2020-03") for r in rows)
    assert risk and all(r["type"] == "redteam" for r in risk)


def test_fund_log_is_newest_first_and_limited(client):
    rows = timed(client, "/log?limit=20")

    assert len(rows) == 20
    assert [r["ts"] for r in rows] == sorted((r["ts"] for r in rows), reverse=True)
    assert {r["type"] for r in timed(client, "/log?type=mastermind&limit=5")} <= {"mastermind"}


def test_capital_by_month_from_a_start(client):
    capital = timed(client, "/capital?from=2025-01")

    months = capital["months"]
    assert months[0]["month"] == "2025-01" and months[-1]["month"] == "2026-08"
    assert all(abs(sum(m["shares"].values()) - 1) < 1e-6 for m in months)


def test_an_unseeded_store_says_so(monkeypatch, tmp_path):
    monkeypatch.setattr(crew_repository, "store", lambda: JsonStore(tmp_path / "empty.json"))
    client = TestClient(app)

    assert client.get("/vault").status_code == 404
    assert client.get("/agents").json() == []


def test_the_war_room_origin_may_call_the_api(client):
    response = client.get("/vault", headers={"Origin": "https://crewfund.vodka"})

    assert response.headers["access-control-allow-origin"] == "https://crewfund.vodka"


def test_the_vault_book_is_only_the_as_of_month(monkeypatch, tmp_path):
    store = JsonStore(tmp_path / "s.json")
    store.put_run(
        "fund",
        {
            "as_of": "2026-08",
            "holdout_cutoff": "2026-08-22",
            "invested": {"2026-08": 0.0},
            "kpis": KPIS,
            "spx_kpis": KPIS,
            "shares": {},
            "latest_memo": None,
        },
    )
    store.put_holdings(
        "fund",
        [
            {
                "month": "2021-12",
                "ticker": "AGL",
                "weight": 1.0,
                "agent_id": "wheelman",
                "reason": "r",
            }
        ],
    )
    monkeypatch.setattr(crew_repository, "store", lambda: store)

    fund = TestClient(app).get("/vault").json()

    assert fund["holdings"] == []  # all cash in August, not December 2021's book


KPIS = {
    "total_return": 0.0,
    "ann_return": 0.0,
    "ann_vol": 0.0,
    "sharpe": 0.0,
    "max_drawdown": 0.0,
    "max_drawdown_month": None,
}
