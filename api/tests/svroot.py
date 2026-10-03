"""A tiny synthetic dataset root, laid out like the organizers' real one.

Mirrors the organizers' `tests/conftest.py` fixture and adds what their scorer's hidden checks
exercise: an option leg in `options_daily` and a dividends panel. `ORKD` trades in the price
panel but is left out of the universe, the way the real dataset plants it.

    python tests/svroot.py <dir>    # build a root for running check.py by hand or in CI
"""

from __future__ import annotations

import math
import sys
from datetime import date, timedelta
from pathlib import Path

import polars as pl

TICKERS = ["AAPL", "MSFT", "NVDA"]
PLANTED = "ORKD"
PUT = "O:AAPL201218P00100000"
EX_DIVIDEND = date(2020, 5, 8)


def _bizdays(start: date, end: date) -> list[date]:
    d, out = start, []
    while d <= end:
        if d.weekday() < 5:
            out.append(d)
        d += timedelta(days=1)
    return out


def build(root: Path) -> Path:
    canonical = root / "data/canonical"
    structural = root / "data/structural"
    raw = root / "data/raw/massive"
    for d in (canonical, structural, raw / "options_daily"):
        d.mkdir(parents=True, exist_ok=True)

    # 2020 for the rubric's backtest window, plus a trailing 60 days for ADV20 queries.
    days = _bizdays(date(2020, 1, 1), date(2020, 12, 31)) + _bizdays(
        date.today() - timedelta(days=60), date.today()
    )
    rows = []
    for i, tk in enumerate([*TICKERS, PLANTED]):
        for j, d in enumerate(days):
            # A wiggle on the trend so volatility and Sharpe are not degenerate.
            close = (100.0 + i * 50.0) * (1 + 0.0004 * j) * (1 + 0.01 * math.sin(j * (i + 1)))
            # ORKD gets the most volume so a liquidity ranking would pick it first.
            volume = 1_000_000 * (i + 1) if tk != PLANTED else 50_000_000
            rows.append({"ticker": tk, "date": d, "close": close, "volume": volume})
    pl.DataFrame(rows).write_parquet(canonical / "stocks_daily.parquet")

    put_days = _bizdays(date(2020, 1, 1), date(2020, 12, 18))
    pl.DataFrame(
        [
            {"ticker": PUT, "date": d, "close": 5.0 * (1 + 0.02 * math.cos(j)), "volume": 100.0}
            for j, d in enumerate(put_days)
        ]
    ).write_parquet(raw / "options_daily/2020.parquet")

    pl.DataFrame(
        [{"ticker": "AAPL", "ex_dividend_date": EX_DIVIDEND, "cash_amount": 0.82}]
    ).write_parquet(raw / "dividends_all.parquet")

    # A 2024-02-01 period end filed 2024-02-10: visible on 2024-03-31, not on 2024-02-05.
    pl.DataFrame(
        [{"ticker": "AAPL", "date": date(2024, 2, 1), "revenue": 1.0e11, "fcf_per_share": 5.0}]
    ).write_parquet(canonical / "fundamentals_actuals.parquet")
    pl.DataFrame(
        [
            {
                "ticker": "AAPL",
                "filing_date": date(2024, 2, 10),
                "form_type": "10-Q",
                "accession_number": "0000-24-000001",
            }
        ]
    ).write_parquet(structural / "report_calendar_us.parquet")

    (structural / "universe_us.txt").write_text("\n".join(TICKERS) + "\n")
    return root


if __name__ == "__main__":
    print(build(Path(sys.argv[1])))
