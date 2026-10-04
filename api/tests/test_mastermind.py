"""The fund: the judge splits capital across the crew; the book always sums to 1."""

import pytest

from crew.backtest import run_recipe
from crew.features import PLANTED_TICKER
from crew.mastermind import POSITION_CAP, allocate, bounded_split, cap_positions
from crew.recipe import Recipe
from tests.synthetic import SIGNAL, make_panel


def recipe(feature=SIGNAL, direction="high", top_n=25):
    return Recipe(
        features=[{"name": feature, "weight": 1, "direction": direction}],
        lookback_months=12,
        top_n=top_n,
    )


@pytest.fixture(scope="module")
def panel():
    return make_panel(persistence=0.9, n_tickers=60)


@pytest.fixture(scope="module")
def agents(panel):
    def agent(agent_id, r, verdict="pass"):
        return {
            "id": agent_id,
            "name": agent_id.title(),
            "verdict": verdict,
            "run": run_recipe(r, panel).to_dict(),
        }

    return [
        agent("winner", recipe()),
        agent("noise", recipe("atm_iv")),
        agent("loser", recipe(direction="low")),
        agent("other", recipe("skew_25d")),
    ]


@pytest.fixture(scope="module")
def plan(agents, panel):
    universe = set(panel.vectors["ticker"].unique().to_list())
    return allocate(agents, universe, spx(panel))


def spx(panel):
    return [{"date": str(d), "value": v} for d, v in panel.benchmark.iter_rows()]


def test_fund_weights_sum_to_one_every_month(plan):
    by_month = {}
    for h in plan.fund_holdings:
        by_month[h["month"]] = by_month.get(h["month"], 0.0) + h["weight"]

    assert by_month
    assert all(abs(total - 1.0) < 1e-6 for total in by_month.values())


def test_no_position_above_five_percent(plan):
    assert max(h["weight"] for h in plan.fund_holdings) <= POSITION_CAP + 1e-9


def test_planted_and_off_universe_names_never_reach_the_book(agents, panel):
    universe = set(panel.vectors["ticker"].unique().to_list())
    run = dict(agents[0]["run"])
    month = run["holdings"][-1]["month"]
    run["holdings"] = [
        *run["holdings"],
        {"month": month, "ticker": PLANTED_TICKER, "weight": 0.5, "reason": "x"},
        {"month": month, "ticker": "NOTREAL", "weight": 0.5, "reason": "x"},
    ]

    plan = allocate([{**agents[0], "run": run}, *agents[1:]], universe)

    tickers = {h["ticker"] for h in plan.fund_holdings}
    assert PLANTED_TICKER not in tickers
    assert "NOTREAL" not in tickers


def test_the_fund_curve_is_daily_and_starts_at_one(plan):
    assert plan.fund_curve[0]["value"] == 1.0
    assert len(plan.fund_curve) > 2000
    assert plan.kpis["sharpe"] != 0


def test_invested_fraction_counts_only_trading_agents(plan):
    assert all(0.0 <= x <= 1.0 for x in plan.invested.values())


def test_bounded_split_water_fills():
    shares = bounded_split({"a": 10.0, "b": 0.0, "c": 0.0}, lo=0.1, hi=0.5)

    assert shares == pytest.approx({"a": 0.5, "b": 0.25, "c": 0.25})
    assert bounded_split({"a": 1.0}, lo=0.1, hi=0.5) == {"a": 1.0}


def test_cap_positions_redistributes_excess():
    weights = cap_positions({f"T{i}": w for i, w in enumerate([0.5] + [0.5 / 24] * 24)}, 0.05)

    assert sum(weights.values()) == pytest.approx(1.0)
    assert max(weights.values()) <= 0.05 + 1e-12


def test_capital_is_split_equally_until_the_judge_sets_it(plan):
    for month, shares in plan.shares.items():
        live = [x for x in shares.values() if x > 0]
        assert sum(shares.values()) == pytest.approx(1.0), month
        assert max(live) - min(live) < 1e-9, (month, shares)


def test_capital_follows_the_judges_split(agents, panel):
    universe = set(panel.vectors["ticker"].unique().to_list())
    split = {"winner": 3.0, "noise": 1.0, "loser": 0.0, "other": 0.0}
    plan = allocate([{**a, "allocation": split[a["id"]]} for a in agents], universe)

    last = plan.shares[plan.months[-1]]
    assert last["winner"] == pytest.approx(0.75) and last["noise"] == pytest.approx(0.25)
    assert last["loser"] == 0.0 and last["other"] == 0.0


def test_nobody_is_fired_and_a_red_team_kill_still_trades(agents, panel):
    universe = set(panel.vectors["ticker"].unique().to_list())
    killed = [*agents[:2], {**agents[2], "verdict": "killed"}]

    plan = allocate(killed, universe)

    assert plan.fired == {}
    assert not any(e["text"].startswith("Fired ") for e in plan.log)
    assert all(s["loser"] > 0 for s in plan.shares.values())
