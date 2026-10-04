"""The panel cache: month-end state vectors + daily closes, sealed at the holdout cutoff."""

import time
from datetime import timedelta

import polars as pl
import pytest
import yaml
from statevector import Dataset

from crew.features import CLOCK_FIELDS, CONTROL_FLAGS, FEATURES, PLANTED_TICKER
from crew.panel import load_panel
from scripts import cache_panel
from tests import panelroot


def test_feature_lists_match_the_organizers_manifest():
    spec = yaml.safe_load(open("tests/fixtures/features.yaml"))

    assert list(FEATURES) == spec["numeric_features"]
    assert len(FEATURES) == 27
    assert CLOCK_FIELDS == spec["clock_fields"]
    assert CONTROL_FLAGS == spec["control_flags"]


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    root = panelroot.build(tmp_path_factory.mktemp("svpanel"))
    out = tmp_path_factory.mktemp("cache")
    manifest = cache_panel.build(Dataset(root), out)
    return root, out, manifest


def test_manifest_records_the_holdout_cutoff(built):
    root, out, manifest = built
    last_day = pl.read_parquet(root / "data/canonical/stocks_daily.parquet")["date"].max()

    assert manifest["holdout_cutoff"] == str(last_day - timedelta(days=30))
    assert load_panel(out).manifest == manifest


def test_nothing_inside_the_holdout_is_cached(built):
    _, out, manifest = built
    panel = load_panel(out)
    cutoff = panel.holdout_cutoff

    assert panel.vectors["date"].max() < cutoff
    assert panel.closes["date"].max() < cutoff
    assert panel.benchmark["date"].max() < cutoff
    assert manifest["rows"]["closes"] == panel.closes.height


def test_the_planted_ticker_is_absent_everywhere(built):
    panel = load_panel(built[1])

    for frame in (panel.vectors, panel.closes, panel.sectors):
        assert PLANTED_TICKER not in frame["ticker"].to_list()


def test_decision_dates_are_month_ends_from_2017(built):
    panel = load_panel(built[1])
    dates = panel.decision_dates
    closes = panel.closes.select("date").unique()
    month_ends = closes.group_by(pl.col("date").dt.strftime("%Y-%m").alias("month")).agg(
        pl.col("date").max()
    )["date"]

    assert dates[0].isoformat() >= "2017-01-01"
    assert dates[0].month == 1 and dates[0].year == 2017
    assert set(dates) <= set(month_ends.to_list())
    assert dates == sorted(dates)


def test_vectors_carry_every_feature_and_flag(built):
    panel = load_panel(built[1])

    assert set(FEATURES) | set(CONTROL_FLAGS) <= set(panel.vectors.columns)


def test_cache_loads_in_under_a_second(built):
    t0 = time.monotonic()
    load_panel(built[1])

    assert time.monotonic() - t0 < 1.0


def test_ticker_limit_builds_a_small_fixture(tmp_path):
    root = panelroot.build(tmp_path / "root", n_tickers=6)
    manifest = cache_panel.build(Dataset(root), tmp_path / "fx", max_tickers=3)
    size = sum(f.stat().st_size for f in (tmp_path / "fx").iterdir())

    assert manifest["tickers"] == 3
    assert size < 5 * 1024 * 1024


def test_a_reference_table_without_sic_description_does_not_stop_the_pull(tmp_path):
    root = panelroot.build(tmp_path / "root", n_tickers=4)
    ref = root / "data/raw/massive/reference_tickers.parquet"
    pl.read_parquet(ref).drop("sic_description").write_parquet(ref)

    cache_panel.build(Dataset(root), tmp_path / "out")

    sectors = pl.read_parquet(tmp_path / "out" / "sectors.parquet")
    assert sectors.height == 4
    assert "sic_description" not in sectors.columns


def _jump(closes, ticker, ex):
    rows = closes.filter(pl.col("ticker") == ticker).sort("date")
    before = rows.filter(pl.col("date") < ex)["close"][-1]
    after = rows.filter(pl.col("date") >= ex)["close"][0]
    return after / before


def test_cached_closes_are_split_adjusted(built):
    root, out, manifest = built
    raw = pl.read_parquet(root / "data/canonical/stocks_daily.parquet")
    cached = load_panel(out).closes

    for i, ex, ratio in panelroot.SPLITS:
        t = panelroot.tickers(12)[i]
        assert _jump(raw, t, ex) == pytest.approx(1 / ratio, rel=0.1)  # the raw panel jumps
        assert _jump(cached, t, ex) == pytest.approx(1.0, abs=0.1)  # the cache does not
    assert manifest["splits_applied"] == len(panelroot.SPLITS)


def test_split_adjustment_keeps_the_latest_prices_unchanged(built):
    root, out, _ = built
    raw = pl.read_parquet(root / "data/canonical/stocks_daily.parquet")
    cached = load_panel(out).closes
    last = cached["date"].max()

    def at(frame):
        return frame.filter(pl.col("date") == last).sort("ticker")["close"].to_list()

    assert at(cached) == pytest.approx(at(raw.filter(pl.col("ticker") != "ORKD")))
