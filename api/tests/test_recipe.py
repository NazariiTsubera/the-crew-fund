"""The recipe grammar: the only thing a strategy can be compiled into."""

import pytest
from pydantic import ValidationError

from crew.recipe import ALWAYS, Filter, Recipe, explain

SEEDS = {
    "accountant": {
        "features": [
            {"name": "kl_surprise_bits", "weight": 0.4, "direction": "high"},
            {"name": "fundamental_surprise", "weight": 0.3, "direction": "high"},
            {"name": "measured_half_life", "weight": 0.15, "direction": "high"},
            {"name": "growth_kalman_update", "weight": 0.15, "direction": "high"},
        ],
        "lookback_months": 12,
        "top_n": 12,
        "sit_out_if_trailing_sharpe_below": 0.0,
    },
    "fence": {
        "features": [
            {"name": "log_fv_gap", "weight": 0.35, "direction": "low"},
            {"name": "composite_valuation_gap", "weight": 0.3, "direction": "low"},
            {"name": "mean_reversion_speed", "weight": 0.2, "direction": "high"},
            {"name": "fwd_fcf_fair_value", "weight": 0.15, "direction": "high"},
        ],
        "lookback_months": 24,
        "top_n": 10,
        "sit_out_if_trailing_sharpe_below": -0.2,
    },
    "insideman": {
        "features": [
            {"name": "skew_25d", "weight": 0.35, "direction": "high"},
            {"name": "oi_divergence", "weight": 0.25, "direction": "high"},
            {"name": "variance_risk_premium", "weight": 0.2, "direction": "low"},
            {"name": "kyle_lambda", "weight": 0.2, "direction": "low"},
        ],
        "filters": ["options_thin_chain == 0"],
        "lookback_months": 6,
        "top_n": 8,
        "sit_out_if_trailing_sharpe_below": 0.0,
    },
    "lookout": {
        "features": [
            {"name": "funding_stress", "weight": 0.4, "direction": "low"},
            {"name": "treasury_funding_interact", "weight": 0.25, "direction": "low"},
            {"name": "inflation_expectation", "weight": 0.2, "direction": "low"},
            {"name": "mktcap_duration_interact", "weight": 0.15, "direction": "low"},
        ],
        "lookback_months": 36,
        "top_n": 5,
        "sit_out_if_trailing_sharpe_below": 0.25,
    },
    "wheelman": {
        "features": [
            {"name": "liquidity_roc", "weight": 0.45, "direction": "high"},
            {"name": "kyle_lambda", "weight": 0.3, "direction": "low"},
            {"name": "minute_realized_diffusion", "weight": 0.25, "direction": "high"},
        ],
        "lookback_months": 3,
        "top_n": 15,
        "sit_out_if_trailing_sharpe_below": -0.4,
    },
}


def recipe(**changes):
    return Recipe.model_validate({**SEEDS["accountant"], **changes})


@pytest.mark.parametrize("name", SEEDS)
def test_seed_recipes_parse(name):
    r = Recipe.model_validate(SEEDS[name])

    assert r.rebalance == "monthly"
    assert ALWAYS in r.filters


def test_the_snapshot_filter_cannot_be_removed():
    assert recipe(filters=[]).filters == [ALWAYS]
    assert recipe(filters=["options_thin_chain == 0"]).filters == [
        ALWAYS,
        "options_thin_chain == 0",
    ]


def test_weights_are_normalized_to_one():
    r = recipe(
        features=[
            {"name": "atm_iv", "weight": 2, "direction": "low"},
            {"name": "skew_25d", "weight": 2, "direction": "high"},
        ]
    )

    assert [f.weight for f in r.features] == [0.5, 0.5]


@pytest.mark.parametrize(
    "changes, message",
    [
        (
            {"features": [{"name": "alpha_magic", "weight": 1, "direction": "high"}]},
            "unknown feature 'alpha_magic'",
        ),
        ({"filters": ["mktcap > $10B"]}, "filter 'mktcap > $10B'"),
        ({"filters": ["price_momentum > 0"]}, "unknown column 'price_momentum'"),
        ({"top_n": 0}, "top_n"),
        ({"top_n": 500}, "top_n"),
        ({"lookback_months": 0}, "lookback_months"),
        ({"sit_out_if_trailing_sharpe_below": 9}, "sit_out_if_trailing_sharpe_below"),
        ({"features": []}, "features"),
        ({"features": [{"name": "atm_iv", "weight": 1, "direction": "sideways"}]}, "direction"),
        (
            {
                "features": [
                    {"name": "atm_iv", "weight": 1, "direction": "low"},
                    {"name": "atm_iv", "weight": 1, "direction": "high"},
                ]
            },
            "twice",
        ),
        ({"rebalance": "daily"}, "rebalance"),
    ],
)
def test_bad_recipes_are_rejected_readably(changes, message):
    with pytest.raises(ValidationError) as e:
        recipe(**changes)

    assert message in explain(e.value)


def test_filters_parse_into_column_op_value():
    assert Filter.parse("amihud_illiq < p80") == Filter("amihud_illiq", "<", 80.0, True)
    assert Filter.parse("options_thin_chain == 0") == Filter("options_thin_chain", "==", 0.0, False)
    assert Filter.parse("atm_iv >= -1.5").value == -1.5
