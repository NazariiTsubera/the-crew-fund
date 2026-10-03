"""The red team: four attacks, one verdict."""

import pytest

from crew.backtest import run_recipe
from crew.recipe import Recipe
from crew.redteam import TESTS, attack, verdict
from tests.synthetic import SIGNAL, make_panel

CRASHES = {"2020-03": -0.30, "2022-06": -0.20}


def recipe(feature=SIGNAL, top_n=5):
    return Recipe(
        features=[{"name": feature, "weight": 1, "direction": "high"}],
        lookback_months=12,
        top_n=top_n,
    )


def by_name(report):
    return {t["name"]: t for t in report["tests"]}


def test_a_clean_persistent_signal_passes_all_four():
    panel = make_panel(persistence=0.95, market_shocks=CRASHES)

    report = attack(recipe(), panel)

    assert [t["name"] for t in report["tests"]] == TESTS
    assert report["verdict"] == "pass", report
    assert all(t["passed"] for t in report["tests"])


def test_a_planted_leaky_recipe_is_killed():
    panel = make_panel(persistence=0.95, market_shocks=CRASHES, leak_feature="fundamental_surprise")

    report = attack(recipe("fundamental_surprise"), panel)

    assert report["verdict"] == "killed"
    assert not by_name(report)["Lookahead test"]["passed"]


def test_one_failing_replay_lands_on_probation():
    panel = make_panel(
        persistence=0.95,
        market_shocks={"2020-03": -0.30},
        tilted_shocks={"2022-06": (-0.20, 1.5)},
    )

    report = attack(recipe(), panel)

    assert report["verdict"] == "probation", report
    assert not by_name(report)["2022 replay"]["passed"]
    assert by_name(report)["2020 replay"]["passed"]


def test_a_noise_recipe_fails_the_shuffle_test():
    panel = make_panel(persistence=0.95)

    report = attack(recipe("atm_iv"), panel)

    assert not by_name(report)["Shuffle test"]["passed"]


def test_details_read_like_the_design_card():
    panel = make_panel(persistence=0.95, market_shocks=CRASHES)
    tests = by_name(attack(recipe(), panel, shuffles=50))

    assert tests["Lookahead test"]["detail"].endswith("with signals lagged one month")
    assert " → " in tests["Lookahead test"]["detail"]
    assert "over 50 runs, p=" in tests["Shuffle test"]["detail"]
    assert tests["2020 replay"]["detail"].startswith("Drawdown ")
    assert " vs SPX −" in tests["2020 replay"]["detail"]
    assert tests["2020 replay"]["detail"].endswith(", Feb–Apr 2020")
    assert tests["2022 replay"]["detail"].endswith(", Dec 2021–Dec 2022")


def test_the_attack_reuses_a_run_it_is_given():
    panel = make_panel(persistence=0.95)
    run = run_recipe(recipe(), panel)

    assert attack(recipe(), panel, run=run)["verdict"] in {"pass", "probation", "killed"}


@pytest.mark.parametrize(
    "fails, expected",
    [
        ([], "pass"),
        (["Shuffle test"], "probation"),
        (["2020 replay"], "probation"),
        (["2020 replay", "2022 replay"], "killed"),
        (["Lookahead test"], "killed"),
    ],
)
def test_verdict_counts_failures_and_lookahead_is_fatal(fails, expected):
    tests = [{"name": n, "passed": n not in fails, "detail": ""} for n in TESTS]

    assert verdict(tests) == expected
