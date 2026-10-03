"""The Mastermind: splits the fund's capital across the crew and writes the fund's book.

Each month every surviving agent (red-team verdict not `killed`, not fired) gets capital by its
trailing 6-month Sharpe: the positive part of the Sharpe, then a 10% floor and a 50% cap
fitted by water-filling. Until an agent has three settled months, the split is equal. "Settled"
means the month's holding period had closed by the decision date, so the Mastermind never
reads a return it could not have known.

An agent whose trailing 12-month Sharpe of returns in excess of the S&P 500 stays below -1.0
for three months in a row is fired: capital 0 from then on, with the month recorded. Excess
returns, because every long-only book has a negative Sharpe in a bear market; the 12-month
window, because one bad quarter should trim an agent, not fire it.

The fund's book is the invested agents' books weighted by capital. A sitting-out agent's share
flows to the others, because the organizers' checker demands weights summing to 1.0; "invested"
is the display figure. Names outside the universe and ORKD are dropped, every position is capped
at 5%, and the weights are re-scaled to sum to 1.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date

import numpy as np

from crew.backtest import fmt, kpis_from_curve
from crew.features import PLANTED_TICKER

FLOOR, CAP = 0.10, 0.50
POSITION_CAP = 0.05
TRAILING_MONTHS = 6
MIN_HISTORY = 3
FIRE_WINDOW, FIRE_SHARPE, FIRE_MONTHS = 12, -1.0, 3
MEMO_STEP = 0.03  # log a capital change of at least 3 points
CLOSE = "16:00"


@dataclass
class Plan:
    months: list[str]
    shares: dict[str, dict[str, float]]  # month -> agent -> capital share (sums to 1)
    trailing: dict[str, dict[str, float | None]]  # month -> agent -> trailing Sharpe
    invested: dict[str, float]  # month -> share of capital in trading agents
    fund_curve: list[dict]
    fund_holdings: list[dict]  # {month, ticker, weight, agent_id, reason}
    log: list[dict]  # {ts, type: mastermind, agent_id, text}
    fired: dict[str, str]  # agent -> month fired
    kpis: dict

    def to_dict(self) -> dict:
        return asdict(self)


def bounded_split(raw: dict[str, float], lo: float = FLOOR, hi: float = CAP) -> dict[str, float]:
    """Shares proportional to `raw`, each within [lo, hi], summing to 1."""
    n = len(raw)
    if not n:
        return {}
    lo, hi = min(lo, 1 / n), max(hi, 1 / n)
    fixed: dict[str, float] = {}
    while True:
        free = [k for k in raw if k not in fixed]
        if not free:
            break
        room = 1 - sum(fixed.values())
        total = sum(raw[k] for k in free)
        w = {k: room * (raw[k] / total if total > 0 else 1 / len(free)) for k in free}
        over = [k for k in free if w[k] > hi + 1e-12]
        under = [k for k in free if w[k] < lo - 1e-12]
        if over:
            fixed |= dict.fromkeys(over, hi)
        elif under:
            fixed |= dict.fromkeys(under, lo)
        else:
            return fixed | w
    return fixed


def cap_positions(weights: dict[str, float], cap: float = POSITION_CAP) -> dict[str, float]:
    """Clip every weight at `cap` and hand the excess to the rest pro rata, summing to 1.
    With fewer than 1/cap names the cap cannot hold; the names are then equal weight."""
    total = sum(weights.values())
    w = {k: v / total for k, v in weights.items() if v > 0}
    if len(w) * cap < 1:
        return {k: 1 / len(w) for k in w}
    while True:
        over = {k for k, v in w.items() if v > cap + 1e-12}
        if not over:
            return w
        excess = sum(w[k] - cap for k in over)
        rest = {k: v for k, v in w.items() if k not in over and v < cap}
        rest_total = sum(rest.values())
        for k in over:
            w[k] = cap
        for k, v in rest.items():
            w[k] = v + excess * v / rest_total


def _sharpe(rets: list[float]) -> float:
    sd = float(np.std(rets, ddof=1))
    return float(np.mean(rets)) / sd * np.sqrt(12) if sd else 0.0


def benchmark_monthly(benchmark: list[dict], months: list[str]) -> dict[str, float]:
    """The S&P 500 over each holding month: from its first trading day to the next month's."""
    firsts: dict[str, float] = {}
    for p in sorted(benchmark, key=lambda p: p["date"]):
        firsts.setdefault(p["date"][:7], p["value"])
    out = {}
    for a, b in zip(months, months[1:], strict=False):
        if a in firsts and b in firsts:
            out[a] = firsts[b] / firsts[a] - 1
    return out


def allocate(agents: list[dict], universe: set[str], benchmark: list[dict] | None = None) -> Plan:
    """`agents`: [{id, name, verdict, run}] where run is Run.to_dict() on the same panel;
    `benchmark`: the S&P 500 as [{date, value}] (without it, firing uses raw returns)."""
    universe = set(universe) - {PLANTED_TICKER}
    crew = [a for a in agents if a["run"]["monthly"]]
    months = sorted({r["month"] for a in crew for r in a["run"]["monthly"]})
    monthly = {a["id"]: {r["month"]: r for r in a["run"]["monthly"]} for a in crew}
    spx = benchmark_monthly(benchmark or [], months)
    names = {a["id"]: a["name"] for a in crew}
    books: dict[tuple[str, str], list[dict]] = {}
    for a in crew:
        for h in a["run"]["holdings"]:
            books.setdefault((a["id"], h["month"]), []).append(h)

    shares, trailing, invested, holdings, log = {}, {}, {}, [], []
    fired: dict[str, str] = {}
    strikes = dict.fromkeys(monthly, 0)
    previous: dict[str, float] = {}

    for k, month in enumerate(months):
        # Settled by this decision: months up to k-2 (month k-1 closes the day after it).
        settled = months[: max(0, k - 1)]
        sharpe: dict[str, float | None] = {}
        for a in crew:
            rets = [monthly[a["id"]][m]["ret"] for m in settled if m in monthly[a["id"]]]
            recent = rets[-TRAILING_MONTHS:]
            sharpe[a["id"]] = _sharpe(recent) if len(recent) >= MIN_HISTORY else None
            if a["id"] in fired or len(rets) < FIRE_WINDOW:
                continue
            window = [m for m in settled if m in monthly[a["id"]]][-FIRE_WINDOW:]
            excess = [monthly[a["id"]][m]["ret"] - spx.get(m, 0.0) for m in window]
            long_run = _sharpe(excess)
            strikes[a["id"]] = strikes[a["id"]] + 1 if long_run < FIRE_SHARPE else 0
            if strikes[a["id"]] >= FIRE_MONTHS:
                fired[a["id"]] = month
                log.append(
                    {
                        "ts": f"{month}-01 {CLOSE}",
                        "type": "mastermind",
                        "agent_id": a["id"],
                        "text": f"Fired {a['name']} · 12-month Sharpe vs S&P 500 "
                        f"{fmt(long_run, 1)} for {FIRE_MONTHS} months, capital → 0%",
                    }
                )
        trailing[month] = sharpe

        alive = [
            a["id"]
            for a in crew
            if a["verdict"] != "killed" and a["id"] not in fired and month in monthly[a["id"]]
        ]
        if any(sharpe[i] is None for i in alive):
            raw = dict.fromkeys(alive, 1.0)
        else:
            raw = {i: max(sharpe[i], 0.0) for i in alive}
        split = bounded_split(raw)
        shares[month] = {a["id"]: split.get(a["id"], 0.0) for a in crew}

        trading = {i: s for i, s in split.items() if monthly[i][month]["invested"]}
        invested[month] = sum(trading.values())
        holdings += _fund_book(month, trading, books, universe)

        for i, s in shares[month].items():
            before = previous.get(i)
            if before is None or i in fired and fired[i] == month:
                continue
            if abs(s - before) >= MEMO_STEP:
                verb = "Raised" if s > before else "Cut"
                why = f" · trailing Sharpe {fmt(sharpe[i], 1)}" if sharpe[i] is not None else ""
                log.append(
                    {
                        "ts": f"{month}-01 {CLOSE}",
                        "type": "mastermind",
                        "agent_id": i,
                        "text": f"{verb} {names[i]} {before:.0%} → {s:.0%}{why}",
                    }
                )
        previous = shares[month]

    curve = _fund_curve(crew, months, shares, monthly)
    values = np.array([p["value"] for p in curve])
    dates = [date.fromisoformat(p["date"]) for p in curve]
    return Plan(
        months=months,
        shares=shares,
        trailing=trailing,
        invested=invested,
        fund_curve=curve,
        fund_holdings=holdings,
        log=_dated(log, crew),
        fired=fired,
        kpis=kpis_from_curve(values, dates),
    )


def _fund_book(month, trading, books, universe) -> list[dict]:
    total = sum(trading.values())
    weights: dict[str, float] = {}
    owner: dict[str, tuple[float, str, str]] = {}
    for agent_id, share in trading.items():
        for h in books.get((agent_id, month), []):
            if h["ticker"] not in universe:
                continue
            w = share / total * h["weight"]
            weights[h["ticker"]] = weights.get(h["ticker"], 0.0) + w
            if w > owner.get(h["ticker"], (0.0, "", ""))[0]:
                owner[h["ticker"]] = (w, agent_id, h["reason"])
    if not weights:
        return []
    capped = cap_positions(weights)
    return sorted(
        (
            {
                "month": month,
                "ticker": t,
                "weight": w,
                "agent_id": owner[t][1],
                "reason": owner[t][2],
            }
            for t, w in capped.items()
        ),
        key=lambda h: -h["weight"],
    )


def _fund_curve(crew, months, shares, monthly) -> list[dict]:
    """Daily fund value from the agents' sleeves, starting at 1.0 on the first decision date."""
    if not crew:
        return []
    curves = {a["id"]: {p["date"]: p["value"] for p in a["run"]["curve"]} for a in crew}
    dates = sorted({d for c in curves.values() for d in c})
    entries = [next((d for d in dates if d.startswith(m)), None) for m in months]
    out = {dates[0]: 1.0}
    value = 1.0
    for k, month in enumerate(months):
        start = entries[k]
        end = entries[k + 1] if k + 1 < len(months) else None
        if start is None:
            continue
        trading = {
            i: s for i, s in shares[month].items() if s > 0 and monthly[i][month]["invested"]
        }
        total = sum(trading.values())
        period = [d for d in dates if start <= d and (end is None or d < end)]
        for d in period:
            if total:
                rel = sum(
                    s / total * curves[i][d] / monthly[i][month]["value_start"]
                    for i, s in trading.items()
                )
            else:
                rel = 1.0
            out[d] = value * rel
        if total:
            value *= sum(
                s / total * monthly[i][month]["value_end"] / monthly[i][month]["value_start"]
                for i, s in trading.items()
            )
        if end is not None:
            out[end] = value
    return [{"date": d, "value": out[d]} for d in sorted(out)]


def _dated(log: list[dict], crew: list[dict]) -> list[dict]:
    """Move each memo from the month's first day to its real decision date: the close of the
    first trading day of the month, where the rebalance happens."""
    firsts: dict[str, str] = {}
    for a in crew:
        for p in a["run"]["curve"]:
            firsts.setdefault(p["date"][:7], p["date"])
            firsts[p["date"][:7]] = min(firsts[p["date"][:7]], p["date"])
    return [{**e, "ts": f"{firsts.get(e['ts'][:7], e['ts'][:10])} {CLOSE}"} for e in log]
