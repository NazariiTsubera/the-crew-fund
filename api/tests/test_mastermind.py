"""The Mastermind: capital by trailing Sharpe, caps, and a fund book that always sums to 1."""

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


def test_capital_shares_respect_floor_cap_and_sum_to_one(plan):
    for month, shares in plan.shares.items():
        live = {a: s for a, s in shares.items() if s > 0}
        lo, hi = min(0.1, 1 / len(live)), max(0.5, 1 / len(live))
        assert sum(shares.values()) == pytest.approx(1.0), month
        assert all(lo - 1e-9 <= s <= hi + 1e-9 for s in live.values()), (month, shares)


def test_a_losing_agent_loses_capital_and_is_fired(plan):
    months = sorted(plan.shares)
    loser = [plan.shares[m]["loser"] for m in months]

    assert any(b < a for a, b in zip(loser, loser[1:], strict=False))
    assert "loser" in plan.fired
    assert loser[-1] == 0.0
    assert any(e["agent_id"] == "loser" and e["text"].startswith("Fired ") for e in plan.log)


def test_the_winner_ends_with_more_capital_than_it_started(plan):
    months = sorted(plan.shares)

    assert plan.shares[months[-1]]["winner"] > plan.shares[months[0]]["winner"]


def test_a_killed_agent_gets_nothing(agents, panel):
    universe = set(panel.vectors["ticker"].unique().to_list())
    killed = [*agents[:2], {**agents[3], "verdict": "killed"}]

    plan = allocate(killed, universe)

    assert all(s["other"] == 0.0 for s in plan.shares.values())


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


def test_a_bear_market_alone_does_not_fire_anyone():
    panel = make_panel(
        persistence=0.9, n_tickers=60, market_shocks={f"2022-{m:02d}": -0.06 for m in range(1, 13)}
    )
    agents = [
        {"id": i, "name": i, "verdict": "pass", "run": run_recipe(r, panel).to_dict()}
        for i, r in [("winner", recipe()), ("other", recipe("skew_25d", top_n=25))]
    ]

    plan = allocate(agents, set(panel.vectors["ticker"].unique().to_list()), spx(panel))

    assert "winner" not in plan.fired


def test_bounded_split_water_fills():
    shares = bounded_split({"a": 10.0, "b": 0.0, "c": 0.0}, lo=0.1, hi=0.5)

    assert shares == pytest.approx({"a": 0.5, "b": 0.25, "c": 0.25})
    assert bounded_split({"a": 1.0}, lo=0.1, hi=0.5) == {"a": 1.0}


def test_cap_positions_redistributes_excess():
    weights = cap_positions({f"T{i}": w for i, w in enumerate([0.5] + [0.5 / 24] * 24)}, 0.05)

    assert sum(weights.values()) == pytest.approx(1.0)
    assert max(weights.values()) <= 0.05 + 1e-12
