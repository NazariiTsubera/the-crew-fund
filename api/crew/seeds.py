"""The five seed agents, as in the design's SEEDS (web/design/src/crew-data.js).

Recipes are the ROW-13 spec; personas, strategy lines and pitches come from the design, except
where the design states an outcome (the Wheelman "fired by the Mastermind, Mar 2025"): outcomes
come from the real run, never from copy.
"""

SEEDS: list[dict] = [
    {
        "id": "accountant",
        "name": "The Accountant",
        "shape": "circle",
        "color": "violet",
        "persona": "Dry, exact, former auditor. Talks in basis points and never rounds up.",
        "strategy_line": "Buys stocks after earnings that surprise the model, not the consensus.",
        "pitch": "I buy companies right after earnings that surprise my model, not the consensus, "
        "and hold them while the surprise decays",
        "recipe": {
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
    },
    {
        "id": "fence",
        "name": "The Fence",
        "shape": "square",
        "color": "teal",
        "persona": "Patient, a little smug. Thinks every price is a negotiation.",
        "strategy_line": "Buys quality names trading below fair value; sells when the gap closes.",
        "pitch": "I buy quality names trading below fair value and sell them once the gap closes",
        "recipe": {
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
    },
    {
        "id": "insideman",
        "name": "The Inside Man",
        "shape": "diamond",
        "color": "rose",
        "persona": "Jittery, talks fast, always watching the options pit. Defensive about 2022.",
        "strategy_line": "Follows options-market tells: rising skew and building informed flow.",
        "pitch": "I follow the options market: rising skew and building informed flow tell me "
        "where someone knows something",
        "recipe": {
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
    },
    {
        "id": "lookout",
        "name": "The Lookout",
        "shape": "ring",
        "color": "green",
        "persona": "Calm, terse, paranoid about funding markets. Happy to sit in cash.",
        "strategy_line": "Reads the macro regime. Sits in cash whenever its own edge fades.",
        "pitch": "I read the macro regime. When my edge fades I sit in cash; when it is there I "
        "run a small defensive book",
        "recipe": {
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
    },
    {
        "id": "wheelman",
        "name": "The Wheelman",
        "shape": "triangle",
        "color": "slate",
        "persona": "Brash, fast, impatient. Blames the liquidity regime when it loses.",
        "strategy_line": "Rides liquidity momentum: buys names whose liquidity is accelerating.",
        "pitch": "I ride liquidity momentum: I buy names whose liquidity is accelerating and get "
        "out fast",
        "recipe": {
            "features": [
                {"name": "liquidity_roc", "weight": 0.45, "direction": "high"},
                {"name": "kyle_lambda", "weight": 0.3, "direction": "low"},
                {"name": "minute_realized_diffusion", "weight": 0.25, "direction": "high"},
            ],
            "lookback_months": 3,
            "top_n": 15,
            "sit_out_if_trailing_sharpe_below": -0.4,
        },
    },
]
