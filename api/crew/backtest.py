"""run_recipe: the one walk-forward code path every agent runs through.

At each month-end decision date the recipe ranks the clean, eligible names on that date's
state vector, keeps the top N equally weighted, and trades at the close one trading day later
(a one-day embargo). The book is held buy-and-hold until the close one trading day after the
next decision. Trading costs scale with illiquidity: 5 bps for the most liquid name on the date
up to 25 bps for the least, by `amihud_illiq` rank, charged on every unit of weight traded.

The sit-out rule looks at the recipe's own paper returns (what its picks earned, before costs)
over the last `lookback_months` that had fully settled by the decision date. Below the floor,
the agent holds cash that month and says so in its log.

Nothing reads a vector row dated after its decision date (crew/pit.py), and the panel itself
stops before the holdout cutoff.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date

import numpy as np
import polars as pl

from crew.panel import Panel
from crew.pit import clean_rows, visible_rows
from crew.recipe import Filter, Recipe

TRADING_DAYS = 252
COST_BPS_MIN, COST_BPS_MAX = 5.0, 25.0
MIN_SIT_OUT_HISTORY = 3
CLOSE = "16:00"  # trades execute at the close


@dataclass
class Run:
    recipe: dict
    kpis: dict
    curve: list[dict]  # daily {date, value}, starting at 1.0 on the first decision date
    monthly: list[dict]  # {month, ret, invested, paper_ret, value_start, value_end}
    holdings: list[dict]  # {month, ticker, weight, reason}
    log: list[dict]  # {ts, type, code, text}
    yearly_returns: dict[str, float]
    status: str  # trading | sitting_out

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class Market:
    """Prices and the decision schedule, precomputed once per panel."""

    dates: list[date]
    tickers: list[str]
    col: dict[str, int]
    prices: np.ndarray  # days x tickers, forward-filled
    decisions: list[date]
    entry: list[int]  # index into dates: first trading day after each decision
    exit: list[int]  # index into dates: entry of the next decision, or the last day
    period_returns: np.ndarray  # decisions x tickers, buy-and-hold over each holding period
    vectors: dict[date, pl.DataFrame]

    @classmethod
    def from_panel(cls, panel: Panel) -> Market:
        wide = panel.closes.pivot(on="ticker", index="date", values="close").sort("date")
        wide = wide.filter(pl.col("date") < panel.holdout_cutoff)
        dates = wide["date"].to_list()
        tickers = [c for c in wide.columns if c != "date"]
        prices = wide.select(pl.all().exclude("date").forward_fill()).to_numpy().astype(float)

        decisions, entry, exit_ = [], [], []
        day_index = np.array(dates, dtype="datetime64[D]")
        planned = [d for d in panel.decision_dates if d < panel.holdout_cutoff]
        for i, d in enumerate(planned):
            e = int(np.searchsorted(day_index, np.datetime64(d), side="right"))
            if e >= len(dates):
                break
            if i + 1 < len(planned):
                x = int(np.searchsorted(day_index, np.datetime64(planned[i + 1]), side="right"))
                x = min(x, len(dates) - 1)
            else:
                x = len(dates) - 1
            if x <= e:
                continue
            decisions.append(d)
            entry.append(e)
            exit_.append(x)

        with np.errstate(invalid="ignore", divide="ignore"):
            period = prices[exit_] / prices[entry] - 1.0
        vectors = {d: f for (d,), f in panel.vectors.partition_by("date", as_dict=True).items()}
        return cls(
            dates=dates,
            tickers=tickers,
            col={t: i for i, t in enumerate(tickers)},
            prices=prices,
            decisions=decisions,
            entry=entry,
            exit=exit_,
            period_returns=period,
            vectors=vectors,
        )


_MARKETS: dict[int, tuple[Panel, Market]] = {}


def market_for(panel: Panel) -> Market:
    hit = _MARKETS.get(id(panel))
    if hit is None or hit[0] is not panel:
        if len(_MARKETS) > 8:
            _MARKETS.clear()
        hit = (panel, Market.from_panel(panel))
        _MARKETS[id(panel)] = hit
    return hit[1]


def fmt(x: float, digits: int = 2) -> str:
    return f"{x:.{digits}f}".replace("-", "−")


def _passes(rows: pl.DataFrame, f: Filter) -> pl.Expr:
    threshold = f.value
    if f.percentile:
        threshold = rows[f.column].drop_nulls().quantile(f.value / 100)
        if threshold is None:
            return pl.lit(False)
    c = pl.col(f.column)
    return {
        "<": c < threshold,
        "<=": c <= threshold,
        ">": c > threshold,
        ">=": c >= threshold,
        "==": c == threshold,
    }[f.op].fill_null(False)


def score(rows: pl.DataFrame, recipe: Recipe) -> pl.DataFrame:
    """Rank-blend the recipe's features: each feature's cross-sectional percentile, centered,
    signed by direction and weighted. A missing value counts as the median."""
    contribs = []
    for f in recipe.features:
        pct = (pl.col(f.name).rank("average") / pl.col(f.name).count()).fill_null(0.5) - 0.5
        sign = 1.0 if f.direction == "high" else -1.0
        contribs.append((pct * sign * f.weight).alias(f"_c_{f.name}"))
    illiq = pl.col("amihud_illiq").rank("average") / pl.col("amihud_illiq").count()
    cost = (COST_BPS_MIN + (COST_BPS_MAX - COST_BPS_MIN) * illiq).fill_null(COST_BPS_MAX)
    out = rows.with_columns(*contribs, cost.alias("_cost_bps"))
    return out.with_columns(
        pl.sum_horizontal([c.meta.output_name() for c in contribs]).alias("_score")
    )


def _reason(row: dict, recipe: Recipe) -> str:
    top = sorted(recipe.features, key=lambda f: row[f"_c_{f.name}"], reverse=True)[:2]
    parts = [f"{f.name} {fmt(row[f.name])}" for f in top if row.get(f.name) is not None]
    return ", ".join(parts) or "ranked on recipe"


def rank_month(m: Market, recipe: Recipe, i: int, lag_months: int = 0) -> pl.DataFrame | None:
    """Every eligible name at decision `i`, best first, or None when nothing is eligible.

    Eligible: a clean vector row visible on the decision date, a price at the entry close,
    and every recipe filter passed."""
    d, entry = m.decisions[i], m.entry[i]
    source = m.decisions[i - lag_months] if i >= lag_months else None
    rows = m.vectors.get(source) if source is not None else None
    if rows is None:
        return None
    rows = clean_rows(visible_rows(rows, d))
    priced = np.isfinite(m.prices[entry])
    rows = rows.filter(
        pl.col("ticker").is_in([t for t, ok in zip(m.tickers, priced, strict=True) if ok])
    )
    for f in recipe.parsed_filters():
        rows = rows.filter(_passes(rows, f))
    if not rows.height:
        return None
    return score(rows, recipe).sort(["_score", "ticker"], descending=[True, False])


def run_recipe(
    recipe: Recipe,
    panel: Panel,
    *,
    costs: bool = True,
    lag_months: int = 0,
) -> Run:
    """Walk the recipe forward over the cached panel. `lag_months` scores each month on an
    older vector (the red team's lookahead test)."""
    m = market_for(panel)
    floor = recipe.sit_out_if_trailing_sharpe_below

    curve = np.full(len(m.dates), np.nan)
    start_idx = m.dates.index(m.decisions[0]) if m.decisions and m.decisions[0] in m.dates else None
    value = 1.0
    if start_idx is not None:
        curve[start_idx] = value
    book: dict[str, float] = {}
    paper: list[tuple[int, float]] = []  # (exit index, gross return of the picks)
    monthly, holdings, log, turnovers = [], [], [], []

    for i, d in enumerate(m.decisions):
        entry, exit_ = m.entry[i], m.exit[i]
        month = m.dates[entry].strftime("%Y-%m")
        ts = f"{m.dates[entry]} {CLOSE}"
        ranked = rank_month(m, recipe, i, lag_months)
        picks = ranked["ticker"].head(recipe.top_n).to_list() if ranked is not None else []

        settled = [r for x, r in paper if m.dates[x] <= d][-recipe.lookback_months :]
        trailing = None
        if len(settled) >= MIN_SIT_OUT_HISTORY:
            sd = float(np.std(settled, ddof=1))
            trailing = float(np.mean(settled)) / sd * np.sqrt(12) if sd else 0.0
        sitting = floor is not None and trailing is not None and trailing < floor

        if picks:
            cols = [m.col[t] for t in picks]
            paper.append((exit_, float(np.mean(m.period_returns[i, cols]))))

        invested = bool(picks) and not sitting
        new_book = {t: 1.0 / len(picks) for t in picks} if invested else {}
        by_ticker = (
            {r["ticker"]: r for r in ranked.iter_rows(named=True)} if ranked is not None else {}
        )

        traded = set(book) | set(new_book)
        delta = {t: abs(new_book.get(t, 0.0) - book.get(t, 0.0)) for t in traded}
        turnovers.append(0.5 * sum(delta.values()))
        cost = 0.0
        if costs:
            cost = sum(
                w * by_ticker.get(t, {}).get("_cost_bps", COST_BPS_MAX) / 1e4
                for t, w in delta.items()
            )

        start_value = value
        value *= 1.0 - cost
        curve[entry] = value
        if invested:
            cols = [m.col[t] for t in new_book]
            weights = np.array(list(new_book.values()))
            rel = m.prices[entry : exit_ + 1, cols] / m.prices[entry, cols]
            path = rel @ weights
            curve[entry + 1 : exit_ + 1] = value * path[1:]
            value *= float(path[-1])
            drifted = weights * rel[-1] / path[-1]
            next_book = dict(zip(new_book, drifted, strict=True))
        else:
            curve[entry + 1 : exit_ + 1] = value
            next_book = {}

        for t in sorted(set(new_book) - set(book)):
            reason = _reason(by_ticker[t], recipe)
            log.append(
                {
                    "ts": ts,
                    "type": "trade",
                    "code": "BUY",
                    "text": f"Bought {t} {new_book[t]:.1%} — {reason}",
                }
            )
        for t in sorted(set(book) - set(new_book)):
            if invested and t in by_ticker:
                lead = recipe.features[0].name
                why = f"out of the top {recipe.top_n}; {lead} now {fmt(by_ticker[t][lead])}"
            elif sitting:
                why = "sitting out"
            else:
                why = "no longer eligible"
            log.append({"ts": ts, "type": "trade", "code": "SELL", "text": f"Sold {t} — {why}"})
        if sitting:
            log.append(
                {
                    "ts": ts,
                    "type": "risk",
                    "code": "SIT_OUT",
                    "text": f"Sat out: trailing Sharpe {fmt(trailing)} below {fmt(floor)} floor",
                }
            )
        elif not picks:
            log.append(
                {
                    "ts": ts,
                    "type": "risk",
                    "code": "SIT_OUT",
                    "text": "Sat out: no name passed the filters",
                }
            )

        if invested:
            holdings.extend(
                {"month": month, "ticker": t, "weight": w, "reason": _reason(by_ticker[t], recipe)}
                for t, w in new_book.items()
            )
        monthly.append(
            {
                "month": month,
                "ret": value / start_value - 1.0,
                "invested": invested,
                "paper_ret": paper[-1][1] if picks else None,
                # Before this month's costs and at its end: the boundary day of the curve
                # carries the post-cost value, so sleeves are rebuilt from these.
                "value_start": start_value,
                "value_end": value,
            }
        )
        book = next_book

    return _finish(recipe, m, curve, monthly, holdings, log, turnovers)


def _finish(recipe, m: Market, curve, monthly, holdings, log, turnovers) -> Run:
    idx = np.flatnonzero(np.isfinite(curve))
    values = curve[idx]
    dates = [m.dates[k] for k in idx]
    kpis = kpis_from_curve(values, dates)
    kpis["turnover"] = float(np.mean(turnovers)) if turnovers else 0.0
    rets = np.array([x["ret"] for x in monthly[-12:]])
    sd = float(rets.std(ddof=1)) if len(rets) > 1 else 0.0
    kpis["trailing_12m_sharpe"] = float(rets.mean() / sd * np.sqrt(12)) if sd else 0.0

    yearly, prev = {}, values[0] if len(values) else 1.0
    for year in sorted({d.year for d in dates}):
        last = values[max(k for k, d in enumerate(dates) if d.year == year)]
        yearly[str(year)] = float(last / prev - 1.0)
        prev = last

    return Run(
        recipe=recipe.model_dump(),
        kpis=kpis,
        curve=[{"date": str(d), "value": float(v)} for d, v in zip(dates, values, strict=True)],
        monthly=monthly,
        holdings=holdings,
        log=sorted(log, key=lambda e: e["ts"]),
        yearly_returns=yearly,
        status="trading" if monthly and monthly[-1]["invested"] else "sitting_out",
    )


def kpis_from_curve(values: np.ndarray, dates: list[date]) -> dict:
    """Daily-curve KPIs, the scorer's conventions: 252 days, Sharpe without a risk-free rate.
    Max drawdown is negative and dated by the month of its trough."""
    if len(values) < 2:
        return {
            "total_return": 0.0,
            "ann_return": 0.0,
            "ann_vol": 0.0,
            "sharpe": 0.0,
            "max_drawdown": 0.0,
            "max_drawdown_month": None,
        }
    rets = values[1:] / values[:-1] - 1.0
    total = float(values[-1] / values[0] - 1.0)
    sd = float(rets.std(ddof=1))
    drawdown = values / np.maximum.accumulate(values) - 1.0
    trough = int(np.argmin(drawdown))
    return {
        "total_return": total,
        "ann_return": float((1 + total) ** (TRADING_DAYS / len(rets)) - 1),
        "ann_vol": sd * TRADING_DAYS**0.5,
        "sharpe": float(rets.mean() / sd * TRADING_DAYS**0.5) if sd else 0.0,
        "max_drawdown": float(drawdown[trough]),
        "max_drawdown_month": dates[trough].strftime("%Y-%m"),
    }
