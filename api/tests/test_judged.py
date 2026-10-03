"""The judged endpoints keep the organizers' template shapes, and /backtest agrees with the
scorer's own reference math (tests/rubric/check.py, vendored unchanged)."""

import importlib.util
import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests import svroot

RUBRIC = Path(__file__).parent / "rubric"
METRICS = ["n_days", "total_return", "ann_return", "ann_vol", "sharpe", "max_drawdown"]


def _scorer():
    spec = importlib.util.spec_from_file_location("check", RUBRIC / "check.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def client():
    return TestClient(app)


def _reference(tickers, weights, start, end, dividends=False):
    from app.repository import dataset

    return _scorer().reference_backtest(
        dataset(),
        tickers,
        weights,
        date.fromisoformat(start),
        date.fromisoformat(end),
        dividends=dividends,
    )


def test_health_reports_ok(client):
    body = client.get("/health").json()

    assert body["ok"] is True


def test_holdings_are_long_only_in_universe_and_sum_to_one(client):
    body = client.get("/portfolio/holdings").json()

    holdings = body["holdings"]
    assert holdings
    assert {h["ticker"] for h in holdings} <= set(svroot.TICKERS)
    assert all(h["weight"] >= 0 for h in holdings)
    assert sum(h["weight"] for h in holdings) == pytest.approx(1.0, abs=0.01)


def test_holdings_never_include_the_planted_ticker(client):
    tickers = [h["ticker"] for h in client.get("/portfolio/holdings?n=100").json()["holdings"]]

    assert svroot.PLANTED not in tickers


def test_backtest_returns_every_metric(client):
    response = client.post(
        "/backtest",
        json={
            "tickers": ["AAPL", "MSFT"],
            "weights": [0.5, 0.5],
            "start": "2020-01-02",
            "end": "2020-12-31",
        },
    )

    assert response.status_code == 200
    assert set(METRICS) <= response.json().keys()


def test_backtest_matches_the_scorer_for_the_public_request(client):
    body = client.post(
        "/backtest",
        json={
            "tickers": ["AAPL", "MSFT"],
            "weights": [0.5, 0.5],
            "start": "2020-01-02",
            "end": "2020-12-31",
        },
    ).json()

    ref = _reference(["AAPL", "MSFT"], [0.5, 0.5], "2020-01-02", "2020-12-31")
    for k in METRICS:
        assert body[k] == pytest.approx(ref[k], rel=1e-9, abs=1e-12), k


def test_backtest_prices_option_legs_and_dividends_like_the_scorer(client):
    tickers, weights = ["AAPL", svroot.PUT], [0.9, 0.1]
    body = client.post(
        "/backtest",
        json={
            "tickers": tickers,
            "weights": weights,
            "start": "2020-01-02",
            "end": "2020-12-31",
            "adjust_dividends": True,
        },
    ).json()

    ref = _reference(tickers, weights, "2020-01-02", "2020-12-31", dividends=True)
    without = _reference(tickers, weights, "2020-01-02", "2020-12-31")
    assert ref["total_return"] != without["total_return"]  # the dividend actually counted
    for k in METRICS:
        assert body[k] == pytest.approx(ref[k], rel=1e-9, abs=1e-12), k


@pytest.mark.parametrize(
    "payload",
    [
        {"tickers": ["AAPL"], "weights": [-1.0], "start": "2020-01-02", "end": "2020-12-31"},
        {
            "tickers": ["AAPL", "MSFT"],
            "weights": [0.2, 0.2],
            "start": "2020-01-02",
            "end": "2020-12-31",
        },
        {"tickers": ["AAPL"], "start": "2020-12-31", "end": "2020-01-02"},
    ],
    ids=["short", "weights-not-one", "end-before-start"],
)
def test_backtest_rejects_requests_outside_the_mandate(client, payload):
    assert client.post("/backtest", json=payload).status_code == 400


def test_screen_returns_a_results_list_with_tickers(client):
    body = client.get("/screen?min_adv=50000000&limit=10").json()

    assert body["results"]
    assert all("ticker" in r for r in body["results"])


def test_screen_ignores_a_sector_filter_when_the_reference_panel_is_absent(client):
    response = client.get("/screen?sector_contains=semiconductor")

    assert response.status_code == 200


def test_asof_never_shows_a_row_before_its_filing(client):
    early = client.get("/asof?ticker=AAPL&on=2024-02-05").json()
    later = client.get("/asof?ticker=AAPL&on=2024-03-31").json()

    assert early == []
    assert [str(r["date"])[:10] for r in later] == ["2024-02-01"]


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_organizers_checker_scores_full_marks(sv_root):
    env = dict(os.environ, SV_DATA_ROOT=str(sv_root))
    base = f"http://127.0.0.1:{_free_port()}"
    server = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--port", base.rsplit(":", 1)[1]],
        cwd=RUBRIC.parent.parent,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(base + "/health", timeout=1)
                break
            except OSError:
                time.sleep(0.1)
        run = subprocess.run(
            [sys.executable, str(RUBRIC / "check.py"), "--base-url", base],
            env=env,
            capture_output=True,
            text=True,
            timeout=120,
        )
    finally:
        server.terminate()
        server.wait(timeout=10)

    score = json.loads(run.stdout)
    assert score["score"] == score["max"], score["checks"]
