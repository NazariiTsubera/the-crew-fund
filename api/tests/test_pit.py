"""Point-in-time guards: nothing after the decision date, nothing inside the holdout, and the
snapshot-track rows (which borrow a 2026-08-28 analyst snapshot) never feed a signal."""

from datetime import date

import polars as pl
import pytest

from crew.pit import clean_rows, in_training_window, leaky_rows, training_window, visible_rows

MANIFEST = {"holdout_cutoff": "2026-09-01"}


def frame(*rows):
    return pl.DataFrame([{"ticker": t, "date": d, "snapshot_track_used": f} for t, d, f in rows])


def test_visible_rows_drop_anything_dated_after_the_decision():
    df = frame(("A", date(2020, 1, 31), 0), ("A", date(2020, 2, 3), 0))

    out = visible_rows(df, date(2020, 1, 31))

    assert out["date"].to_list() == [date(2020, 1, 31)]


def test_visible_rows_accept_a_datetime_column():
    df = pl.DataFrame({"date": [date(2020, 1, 31), date(2020, 2, 1)]}).with_columns(
        pl.col("date").cast(pl.Datetime)
    )

    assert visible_rows(df, date(2020, 1, 31)).height == 1


def test_training_window_runs_from_2017_up_to_the_cutoff():
    assert training_window(MANIFEST) == (date(2017, 1, 1), date(2026, 9, 1))


def test_holdout_rows_are_excluded():
    df = frame(
        ("A", date(2016, 12, 30), 0),
        ("A", date(2017, 1, 31), 0),
        ("A", date(2026, 8, 31), 0),
        ("A", date(2026, 9, 1), 0),
        ("A", date(2026, 9, 30), 0),
    )

    out = in_training_window(df, MANIFEST)

    assert out["date"].to_list() == [date(2017, 1, 31), date(2026, 8, 31)]


def test_flagged_rows_are_reported_and_cleaned_out():
    df = frame(("A", date(2020, 1, 31), 0), ("B", date(2020, 1, 31), 1))

    assert leaky_rows(df)["ticker"].to_list() == ["B"]
    assert clean_rows(df)["ticker"].to_list() == ["A"]


def test_a_frame_without_the_flag_is_refused():
    with pytest.raises(KeyError):
        clean_rows(pl.DataFrame({"ticker": ["A"], "date": [date(2020, 1, 31)]}))
