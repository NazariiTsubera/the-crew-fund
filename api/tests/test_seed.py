"""Seeding: five agents through the real pipeline, then one Mastermind rebalance."""

import pytest

from crew.seeds import SEEDS
from crew.store import JsonStore
from scripts.seed_agents import seed
from tests.synthetic import make_panel


@pytest.fixture(scope="module")
def seeded(tmp_path_factory):
    store = JsonStore(tmp_path_factory.mktemp("seed") / "store.json")
    panel = make_panel(n_tickers=60, persistence=0.9, market_shocks={"2020-03": -0.3})
    seed(store, panel)
    return store, panel


def test_five_agents_exist_with_runs_verdicts_shapes_and_colors(seeded):
    store, _ = seeded
    agents = store.list_agents()

    assert [a["id"] for a in agents] == [s["id"] for s in SEEDS]
    for a in agents:
        assert a["verdict"] in {"pass", "probation", "killed"}
        assert len(a["redteam"]["tests"]) == 4
        assert a["shape"] and a["color"]
        assert store.latest_run(a["id"])["kpis"]["sharpe"] is not None
        assert store.curve(a["id"])


def test_capital_sums_to_one_and_dead_agents_hold_none(seeded):
    store, _ = seeded
    agents = store.list_agents()

    assert sum(a["capital_share"] for a in agents) == pytest.approx(1.0)
    for a in agents:
        if a["status"] == "killed":
            assert a["capital_share"] == 0.0


def test_the_fund_is_written(seeded):
    store, _ = seeded
    fund = store.latest_run("fund")

    assert store.curve("fund")[0]["value"] == 1.0
    assert store.curve("spx")[0]["value"] == pytest.approx(1.0)
    assert store.holdings("fund", month=fund["as_of"])
    assert fund["holdout_cutoff"] == "2026-09-01"


def test_every_agent_has_a_redteam_log_line(seeded):
    store, _ = seeded

    for s in SEEDS:
        assert any(
            e["text"].startswith("Red Team: ")
            for e in store.log(agent_id=s["id"], types=["redteam"])
        )


def test_seeding_again_changes_nothing(seeded):
    store, panel = seeded
    before = (len(store.list_agents()), len(store.log()), len(store.holdings("fund")))

    seed(store, panel)

    assert (len(store.list_agents()), len(store.log()), len(store.holdings("fund"))) == before
