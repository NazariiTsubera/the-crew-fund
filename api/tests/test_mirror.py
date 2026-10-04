"""The day-file mirror: remote partition files are read from local disk after the first fetch."""

import os
import time
from datetime import date, timedelta
from types import SimpleNamespace

import polars as pl
import pytest

from app.mirror import mirrored_scan


def remote(tmp_path, days):
    """A stand-in for the SDK's thin client: files served from a directory over file:// URLs."""
    src = tmp_path / "remote/stocks_daily"
    src.mkdir(parents=True)
    files = []
    for d in days:
        pl.DataFrame(
            {"ticker": ["AAPL"], "date": [d], "close": [1.0], "volume": [10]}
        ).write_parquet(src / f"{d}.parquet")
        files.append(f"stocks_daily/{d}.parquet")
    return SimpleNamespace(
        base="https://data.example",
        token="secret",
        _index={"panels": {"stocks_daily": {"files": files}}},
        _url=lambda rel: (tmp_path / "remote" / rel).as_uri(),
        _scan=lambda *a, **k: pytest.fail("fell back to the remote scan"),
    ), src


OLD = [date(2020, 1, 2), date(2020, 1, 3), date(2020, 1, 6)]


def test_files_in_the_window_are_fetched_once_then_read_locally(tmp_path):
    ds, src = remote(tmp_path, OLD)
    mirror = tmp_path / "mirror"

    first = mirrored_scan(ds, "stocks_daily", "2020-01-03", "2020-01-06", mirror).collect()
    for f in src.iterdir():
        f.unlink()  # the remote is gone; the mirror must be enough
    second = mirrored_scan(ds, "stocks_daily", "2020-01-03", "2020-01-06", mirror).collect()

    assert first.height == 2 and second.equals(first)
    assert sorted(p.name for p in (mirror / "stocks_daily").iterdir()) == [
        "2020-01-03.parquet",
        "2020-01-06.parquet",
    ]


def test_volume_is_cast_to_float_like_the_sdk(tmp_path):
    ds, _ = remote(tmp_path, OLD)

    frame = mirrored_scan(ds, "stocks_daily", "2020-01-02", "2020-01-06", tmp_path / "m").collect()

    assert frame.schema["volume"] == pl.Float64


def test_recent_files_are_refreshed_when_stale(tmp_path):
    today = date.today()
    ds, src = remote(tmp_path, [today - timedelta(days=1)])
    mirror = tmp_path / "mirror"
    mirrored_scan(ds, "stocks_daily", None, None, mirror).collect()
    cached = next((mirror / "stocks_daily").iterdir())
    stale = time.time() - 7 * 3600
    os.utime(cached, (stale, stale))
    pl.DataFrame(
        {"ticker": ["AAPL"], "date": [today - timedelta(days=1)], "close": [2.0], "volume": [10]}
    ).write_parquet(next(src.iterdir()))

    frame = mirrored_scan(ds, "stocks_daily", None, None, mirror).collect()

    assert frame["close"].to_list() == [2.0]


def test_a_local_dataset_is_scanned_directly(tmp_path):
    calls = []
    ds = SimpleNamespace(base=None, _scan=lambda *a, **k: calls.append(a) or pl.LazyFrame())

    mirrored_scan(ds, "stocks_daily", "2020-01-02", "2020-01-06", tmp_path / "m")

    assert calls == [("stocks_daily", "2020-01-02", "2020-01-06")]


def test_an_unwritable_mirror_reads_every_file_remotely(tmp_path, monkeypatch):
    import app.mirror as mirror_mod

    monkeypatch.setattr(mirror_mod, "RETRY_DELAYS", (0.0, 0.0, 0.0))
    ds, _ = remote(tmp_path, OLD)
    blocked = tmp_path / "blocked"
    blocked.write_text("a file where the mirror directory should be")

    frame = mirrored_scan(ds, "stocks_daily", "2020-01-02", "2020-01-06", blocked).collect()

    assert frame.height == 3


def test_mirrored_files_are_readable_by_other_users(tmp_path):
    ds, _ = remote(tmp_path, OLD)
    mirrored_scan(ds, "stocks_daily", "2020-01-02", "2020-01-06", tmp_path / "m").collect()

    modes = {p.stat().st_mode & 0o777 for p in (tmp_path / "m" / "stocks_daily").iterdir()}
    assert modes == {0o644}


def test_a_dropped_connection_is_retried(tmp_path, monkeypatch):
    import app.mirror as mirror_mod

    ds, _ = remote(tmp_path, OLD)
    real, calls = mirror_mod._fetch, []

    def flaky(ds_, rel):
        calls.append(rel)
        if calls.count(rel) < 3:
            raise OSError("UNEXPECTED_EOF_WHILE_READING")
        return real(ds_, rel)

    monkeypatch.setattr(mirror_mod, "_fetch", flaky)
    monkeypatch.setattr(mirror_mod, "RETRY_DELAYS", (0.0, 0.0, 0.0))

    frame = mirrored_scan(ds, "stocks_daily", "2020-01-02", "2020-01-06", tmp_path / "m").collect()

    assert frame.height == 3
    assert len(list((tmp_path / "m" / "stocks_daily").iterdir())) == 3


def test_a_file_that_never_downloads_is_read_remotely_alone(tmp_path, monkeypatch):
    import app.mirror as mirror_mod

    ds, _ = remote(tmp_path, OLD)
    real = mirror_mod._fetch

    def broken_for_one(ds_, rel):
        if rel.endswith("2020-01-03.parquet"):
            raise OSError("UNEXPECTED_EOF_WHILE_READING")
        return real(ds_, rel)

    monkeypatch.setattr(mirror_mod, "_fetch", broken_for_one)
    monkeypatch.setattr(mirror_mod, "RETRY_DELAYS", (0.0, 0.0, 0.0))

    frame = mirrored_scan(ds, "stocks_daily", "2020-01-02", "2020-01-06", tmp_path / "m").collect()

    assert frame.height == 3  # all three days, one of them read remotely
    assert len(list((tmp_path / "m" / "stocks_daily").iterdir())) == 2


def test_whole_table_panels_are_routed_through_the_mirror(tmp_path):
    # The SDK's point-in-time fundamentals read two whole-file tables over HTTP on every call
    # (~10 s); routed through the mirror they are fetched once.
    from app.repository import route_through_mirror

    src = tmp_path / "remote/canonical"
    src.mkdir(parents=True)
    pl.DataFrame({"ticker": ["AAPL"], "date": [date(2024, 3, 31)]}).write_parquet(
        src / "fundamentals_actuals.parquet"
    )
    calls = []
    ds = SimpleNamespace(
        base="https://data.example",
        token=None,
        _index={
            "panels": {
                "fundamentals_actuals": {"files": ["canonical/fundamentals_actuals.parquet"]}
            }
        },
        _url=lambda rel: (tmp_path / "remote" / rel).as_uri(),
        _scan=lambda name, start=None, end=None: calls.append(name) or pl.LazyFrame(),
    )
    route_through_mirror(ds, tmp_path / "mirror")

    first = ds._scan("fundamentals_actuals").collect()
    (src / "fundamentals_actuals.parquet").unlink()
    second = ds._scan("fundamentals_actuals").collect()
    ds._scan("stocks_daily")

    assert first.height == 1 and second.equals(first)
    assert calls == ["stocks_daily"]  # other panels still go to the SDK's own scan
