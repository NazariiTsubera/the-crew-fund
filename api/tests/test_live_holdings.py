"""/portfolio/holdings serves the Mastermind's latest book; the template method only when the
store has none."""

import pytest
from fastapi.testclient import TestClient

from app.crew_repository import store
from app.main import app


def book(month, *rows):
    return [
        {
            "month": month,
            "ticker": t,
            "weight": w,
            "agent_id": "accountant",
            "reason": "kl_surprise_bits 2.31",
        }
        for t, w in rows
    ]


def fund(as_of):
    store().put_run("fund", {"as_of": as_of, "holdout_cutoff": "2026-09-01"})


@pytest.fixture
def client():
    return TestClient(app)


def test_an_empty_store_falls_back_to_the_template_method(client):
    body = client.get("/portfolio/holdings").json()

    assert body["method"] == "equal_weight_top_liquidity"
    assert body["holdings"]


def test_the_mastermind_book_is_served_with_its_month(client):
    store().put_holdings("fund", book("2026-08", ("MSFT", 0.6), ("AAPL", 0.4)))
    fund("2026-08")

    body = client.get("/portfolio/holdings").json()

    assert body["method"] == "mastermind"
    assert body["as_of"] == "2026-08"
    assert [(h["ticker"], h["weight"]) for h in body["holdings"]] == [("MSFT", 0.6), ("AAPL", 0.4)]
    assert body["holdings"][0]["agent_id"] == "accountant"


def test_off_universe_and_planted_names_are_dropped_and_the_rest_rescaled(client):
    store().put_holdings("fund", book("2026-08", ("MSFT", 0.5), ("ORKD", 0.25), ("NOTREAL", 0.25)))
    fund("2026-08")

    holdings = client.get("/portfolio/holdings").json()["holdings"]

    assert [(h["ticker"], h["weight"]) for h in holdings] == [("MSFT", 1.0)]


def test_a_fund_in_cash_never_serves_an_old_book(client):
    # The crew held nothing at the last decision: a book from months ago would be stale.
    store().put_holdings("fund", book("2026-06", ("NVDA", 1.0)))
    fund("2026-08")

    body = client.get("/portfolio/holdings").json()

    assert body["method"] == "equal_weight_top_liquidity"
    assert body["holdings"]
