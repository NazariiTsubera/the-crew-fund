"""One Store contract, two backends: the JSON file always, Postgres/Tiger Data when
TEST_DATABASE_URL points at a database (CI runs a TimescaleDB service)."""

import os

import pytest

from crew.store import JsonStore, PgStore, open_store

PG_URL = os.environ.get("TEST_DATABASE_URL")


@pytest.fixture(params=["json", "postgres"])
def store(request, tmp_path):
    if request.param == "json":
        s = JsonStore(tmp_path / "store.json")
    else:
        if not PG_URL:
            pytest.skip("TEST_DATABASE_URL not set")
        s = PgStore(PG_URL)
        s.migrate()
        s.reset()
    s.migrate()  # idempotent
    return s


AGENT = {"id": "accountant", "name": "The Accountant", "shape": "circle", "status": "trading"}


def pt(date, value):
    return {"date": date, "value": value}


def hold(month, ticker, weight, reason):
    return {
        "month": month,
        "ticker": ticker,
        "weight": weight,
        "agent_id": "accountant",
        "reason": reason,
    }


def entry(ts, type_, text):
    return {"ts": ts, "agent_id": "accountant", "type": type_, "text": text}


def test_agents_round_trip_in_insertion_order(store):
    store.put_agent(AGENT)
    store.put_agent({"id": "fence", "name": "The Fence"})
    store.put_agent({**AGENT, "status": "sitting_out"})  # update keeps its place

    assert [a["id"] for a in store.list_agents()] == ["accountant", "fence"]
    assert store.get_agent("accountant")["status"] == "sitting_out"
    assert store.get_agent("nobody") is None


def test_latest_run_wins(store):
    store.put_agent(AGENT)
    store.put_run("accountant", {"kpis": {"sharpe": 0.5}})
    store.put_run("accountant", {"kpis": {"sharpe": 0.9}})

    assert store.latest_run("accountant")["kpis"]["sharpe"] == 0.9
    assert store.latest_run("fence") is None


def test_curve_is_replaced_and_sorted_by_date(store):
    store.put_curve("fund", [pt("2017-02-28", 1.01), pt("2017-01-31", 1.0)])
    store.put_curve("fund", [pt("2017-01-31", 1.0), pt("2017-02-28", 1.02)])

    assert store.curve("fund") == [pt("2017-01-31", 1.0), pt("2017-02-28", 1.02)]
    assert store.curve("spx") == []


def test_holdings_replace_per_owner_and_filter_by_month(store):
    rows = [
        hold("2017-01", "AAPL", 0.4, "r1"),
        hold("2017-01", "MSFT", 0.6, "r2"),
        hold("2017-02", "NVDA", 1.0, "r3"),
    ]
    store.put_holdings("accountant", rows)
    store.put_holdings("fund", rows[:1])
    store.put_holdings("accountant", rows)  # replace, not append

    jan = store.holdings("accountant", month="2017-01")
    assert [h["ticker"] for h in jan] == ["MSFT", "AAPL"]  # heaviest first
    assert len(store.holdings("accountant")) == 3
    assert store.holdings("fund") == [rows[0]]


def test_log_replace_by_agent_and_type_newest_first(store):
    store.replace_log(
        [
            entry("2017-01-31 15:45", "trade", "Bought AAPL"),
            entry("2017-02-28 15:45", "trade", "Sold AAPL"),
            entry("2017-02-28 16:05", "mastermind", "old"),
        ],
        agent_id="accountant",
    )
    store.replace_log(
        [entry("2017-02-28 16:05", "mastermind", "new")],
        types=["mastermind"],
    )

    texts = [e["text"] for e in store.log(agent_id="accountant")]
    assert texts == ["new", "Sold AAPL", "Bought AAPL"]
    assert [e["text"] for e in store.log(month="2017-01")] == ["Bought AAPL"]
    assert [e["text"] for e in store.log(types=["mastermind"])] == ["new"]
    assert len(store.log(limit=2)) == 2


def test_chats_append_in_order(store):
    store.add_chat("accountant", {"ts": "2026-10-03 21:00", "role": "user", "text": "hi"})
    store.add_chat(
        "accountant",
        {"ts": "2026-10-03 21:00", "role": "agent", "text": "hello", "evidence": ["a"]},
    )

    assert [c["text"] for c in store.chats("accountant")] == ["hi", "hello"]
    assert store.chats("accountant")[1]["evidence"] == ["a"]


def test_delete_agent_removes_everything_it_owns(store):
    store.put_agent(AGENT)
    store.put_run("accountant", {"kpis": {}})
    store.put_curve("accountant", [pt("2017-01-31", 1.0)])
    store.put_holdings("accountant", [hold("2017-01", "AAPL", 1.0, "r")])
    store.replace_log([entry("2017-01-31 15:45", "trade", "x")], agent_id="accountant")
    store.add_chat("accountant", {"ts": "2026-10-03 21:00", "role": "user", "text": "hi"})

    store.delete_agent("accountant")

    assert store.get_agent("accountant") is None
    assert store.latest_run("accountant") is None
    assert store.curve("accountant") == []
    assert store.holdings("accountant") == []
    assert store.log(agent_id="accountant") == []
    assert store.chats("accountant") == []


def test_json_store_sees_writes_from_another_process(tmp_path):
    reader, writer = JsonStore(tmp_path / "s.json"), JsonStore(tmp_path / "s.json")
    assert reader.list_agents() == []

    writer.put_agent(AGENT)

    assert [a["id"] for a in reader.list_agents()] == ["accountant"]


def test_open_store_falls_back_to_json_without_a_database(tmp_path, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("CREW_STORE_PATH", str(tmp_path / "s.json"))

    assert isinstance(open_store(), JsonStore)


def test_open_store_falls_back_to_json_when_the_database_is_down(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://nobody@127.0.0.1:1/none?connect_timeout=1")
    monkeypatch.setenv("CREW_STORE_PATH", str(tmp_path / "s.json"))

    assert isinstance(open_store(), JsonStore)
