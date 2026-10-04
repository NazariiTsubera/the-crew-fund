"""run_recipe: one walk-forward code path for every agent."""

import time
from dataclasses import replace
from datetime import date

import numpy as np
import polars as pl
import pytest

from crew.backtest import run_recipe
from crew.recipe import Recipe
from tests.synthetic import SIGNAL, make_panel


def recipe(feature=SIGNAL, direction="high", top_n=5, floor=None, filters=(), lookback=12):
    return Recipe(
        features=[{"name": feature, "weight": 1, "direction": direction}],
        filters=list(filters),
        lookback_months=lookback,
        top_n=top_n,
        sit_out_if_trailing_sharpe_below=floor,
    )


@pytest.fixture(scope="module")
def panel():
    return make_panel()


def _oracle_monthly(panel, top_n):
    """Independent reference: each month buy the top-N by the true signal at the close one
    trading day after the decision date, sell at the close one trading day after the next."""
    wide = panel.closes.pivot(on="ticker", index="date", values="close").sort("date")
    dates = wide["date"].to_list()
    px = wide.drop("date")
    decisions = panel.decision_dates
    out = []
    for i, d in enumerate(decisions):
        entry = next((k for k, x in enumerate(dates) if x > d), None)
        if entry is None:
            break
        nxt = decisions[i + 1] if i + 1 < len(decisions) else None
        exit_ = next((k for k, x in enumerate(dates) if nxt and x > nxt), len(dates) - 1)
        if exit_ <= entry:
            continue
        rows = panel.vectors.filter(pl.col("date") == d).sort(SIGNAL, descending=True)
        picks = rows["ticker"].head(top_n).to_list()
        rel = [px[t][exit_] / px[t][entry] for t in picks]
        out.append(float(np.mean(rel)) - 1)
    return np.array(out)


def _sharpe(r):
    return r.mean() / r.std(ddof=1) * np.sqrt(12)


def test_the_planted_signal_is_recovered_within_5_percent(panel):
    run = run_recipe(recipe(top_n=5), panel, costs=False)

    ours = np.array([m["ret"] for m in run.monthly])
    oracle = _oracle_monthly(panel, 5)
    assert len(ours) == len(oracle)
    assert _sharpe(ours) == pytest.approx(_sharpe(oracle), rel=0.05)
    assert run.kpis["sharpe"] > 1.0


def test_a_noise_feature_earns_much_less_than_the_signal(panel):
    signal = run_recipe(recipe(), panel).kpis["sharpe"]
    noise = run_recipe(recipe(feature="atm_iv"), panel).kpis["sharpe"]

    assert noise < signal / 2


def test_direction_low_flips_the_ranking(panel):
    high = run_recipe(recipe(direction="high"), panel)
    low = run_recipe(recipe(direction="low"), panel)

    assert low.kpis["total_return"] < high.kpis["total_return"]


def test_no_vector_row_after_a_decision_date_changes_that_decision(panel):
    base = run_recipe(recipe(), panel)
    cut = date(2021, 6, 30)
    poisoned_vectors = panel.vectors.with_columns(
        pl.when(pl.col("date") > cut)
        .then(-pl.col(SIGNAL) * 1000)
        .otherwise(pl.col(SIGNAL))
        .alias(SIGNAL)
    )
    poisoned = run_recipe(recipe(), replace(panel, vectors=poisoned_vectors))

    def book(run):
        return [(h["month"], h["ticker"]) for h in run.holdings if h["month"] <= "2021-07"]

    assert book(poisoned) == book(base)
    assert book(base)


def test_costs_lower_the_return(panel):
    gross = run_recipe(recipe(), panel, costs=False).kpis["total_return"]
    net = run_recipe(recipe(), panel).kpis["total_return"]

    assert net < gross


def test_weights_are_equal_within_the_book_and_sum_to_one(panel):
    run = run_recipe(recipe(top_n=4), panel)
    first = run.holdings[0]["month"]
    month = [h for h in run.holdings if h["month"] == first]

    assert len(month) == 4
    assert sum(h["weight"] for h in month) == pytest.approx(1.0)
    assert all(h["reason"].startswith(SIGNAL) for h in month)


def test_the_curve_is_daily_and_stops_before_the_holdout(panel):
    run = run_recipe(recipe(), panel)
    dates = [p["date"] for p in run.curve]

    assert dates == sorted(dates)
    assert dates[-1] < panel.manifest["holdout_cutoff"]
    assert len(dates) > 2000


def test_snapshot_flagged_rows_are_never_picked(panel):
    first = panel.decision_dates[0]
    top = panel.vectors.filter(pl.col("date") == first).sort(SIGNAL, descending=True)["ticker"][0]
    flagged = panel.vectors.with_columns(
        pl.when((pl.col("ticker") == top) & (pl.col("date") == first))
        .then(1)
        .otherwise(pl.col("snapshot_track_used"))
        .alias("snapshot_track_used")
    )
    run = run_recipe(recipe(), replace(panel, vectors=flagged))

    first_book = [h["ticker"] for h in run.holdings if h["month"] == run.holdings[0]["month"]]
    assert top not in first_book


def test_percentile_filters_cut_the_universe(panel):
    run = run_recipe(recipe(filters=["amihud_illiq < p20"], top_n=50), panel)
    first = run.holdings[0]["month"]

    assert len([h for h in run.holdings if h["month"] == first]) <= 0.25 * 40


def test_an_agent_below_its_floor_sits_out_and_logs_why(panel):
    run = run_recipe(recipe(direction="low", floor=0.5, lookback=6), panel)

    sat = [m for m in run.monthly if not m["invested"]]
    assert sat
    assert any(e["type"] == "risk" and e["text"].startswith("Sat out") for e in run.log)
    # Flat in cash, apart from the cost of selling out of the book.
    assert all(-0.003 < m["ret"] <= 0 for m in sat)


def test_the_log_names_real_trades_with_feature_values(panel):
    run = run_recipe(recipe(), panel)
    trades = [e for e in run.log if e["type"] == "trade"]

    assert trades[0]["text"].startswith("Bought ")
    assert any(e["text"].startswith("Sold ") for e in trades)
    assert all(len(e["ts"]) == 16 for e in run.log)


def test_kpis_cover_the_design_tiles(panel):
    k = run_recipe(recipe(), panel).kpis

    for key in (
        "total_return",
        "ann_return",
        "ann_vol",
        "sharpe",
        "max_drawdown",
        "max_drawdown_month",
        "turnover",
        "trailing_12m_sharpe",
    ):
        assert key in k
    assert k["max_drawdown"] <= 0


def test_a_full_universe_run_takes_under_10_seconds():
    big = make_panel(n_tickers=700, seed=9)
    t0 = time.monotonic()
    run_recipe(recipe(top_n=12), big)

    assert time.monotonic() - t0 < 10


def test_missing_feature_values_never_break_a_run(panel):
    # Real vectors have gaps: null and NaN readings in the very features a recipe ranks on.
    holes = (
        panel.vectors.with_row_index()
        .with_columns(
            pl.when(pl.col("index") % 3 == 0)
            .then(None)
            .when(pl.col("index") % 3 == 1)
            .then(float("nan"))
            .otherwise(pl.col(SIGNAL))
            .alias(SIGNAL)
        )
        .drop("index")
    )
    run = run_recipe(recipe(top_n=8), replace(panel, vectors=holes))

    texts = [e["text"] for e in run.log] + [h["reason"] for h in run.holdings]
    assert run.monthly
    assert not any("nan" in t or "None" in t for t in texts)


def test_each_month_records_the_equal_weight_return_of_every_eligible_name(panel):
    # With top_n covering the whole universe the picks are the eligible names.
    everyone = run_recipe(recipe(top_n=40), panel)
    assert all(m["baseline_ret"] == pytest.approx(m["paper_ret"]) for m in everyone.monthly)
    # A narrower book keeps the same baseline: it depends on the pool, not the picks.
    narrow = run_recipe(recipe(top_n=5), panel)
    assert [m["baseline_ret"] for m in narrow.monthly] == pytest.approx(
        [m["baseline_ret"] for m in everyone.monthly]
    )
