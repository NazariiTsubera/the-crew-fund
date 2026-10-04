"""What-if: a judge edits an agent's recipe and sees how the variant would have done.

The variant runs through the same evaluate() as every agent (backtest and red team), so a
tuned curve still faces the shuffle and lookahead tests that catch overfitting. Nothing is
stored: no new agent, no capital, no log rows. Results are cached per recipe, because the chat
asks about the same variant the chart just drew.
"""

from __future__ import annotations

import threading

from crew.backtest import fmt
from crew.panel import Panel
from crew.pipeline import evaluate
from crew.recipe import Recipe

CACHE_SIZE = 32

_cache: dict[tuple[int, str], dict] = {}
_lock = threading.Lock()


def run_whatif(recipe: Recipe, panel: Panel) -> dict:
    """{recipe, kpis, curve, yearly_returns, redteam} for `recipe` on `panel`."""
    key = (id(panel), recipe.model_dump_json())
    with _lock:
        if key in _cache:
            return _cache[key]
    run, report = evaluate(recipe, panel)
    out = {
        "recipe": recipe.model_dump(),
        "kpis": run.kpis,
        "curve": run.curve,
        "yearly_returns": run.yearly_returns,
        "redteam": report,
    }
    with _lock:
        if len(_cache) >= CACHE_SIZE:
            _cache.pop(next(iter(_cache)))
        _cache[key] = out
    return out


def _pct(x: float) -> str:
    return f"{'−' if x < 0 else '+'}{abs(x) * 100:.1f}%"


def whatif_facts(agent: dict, whatif: dict) -> list[str]:
    """Facts for the chat: the variant's recipe and record beside the live agent's."""
    k, live = whatif["kpis"], agent.get("kpis") or {}
    r = whatif["recipe"]
    ranks = ", ".join(f"{f['name']} {f['direction']} {f['weight']:.0%}" for f in r["features"])
    floor = r.get("sit_out_if_trailing_sharpe_below")
    facts = [
        f"What-if (unsaved variant the user is testing, not trading): ranks on {ranks}; "
        f"holds the top {r['top_n']}; "
        + (
            f"sits out below a trailing Sharpe of {fmt(floor)}"
            if floor is not None
            else "never sits out"
        ),
        f"What-if Sharpe {fmt(k['sharpe'])} vs live {fmt(live.get('sharpe', 0.0))}",
        f"What-if total return {_pct(k['total_return'])} vs live "
        f"{_pct(live.get('total_return', 0.0))}",
        f"What-if max drawdown {_pct(k['max_drawdown'])} in {k.get('max_drawdown_month')} vs live "
        f"{_pct(live.get('max_drawdown', 0.0))}",
        f"What-if Red Team verdict: {whatif['redteam']['verdict'].upper()}",
    ]
    facts += [
        f"What-if {t['name']}: {'passed' if t['passed'] else 'FAILED'} — {t['detail']}"
        for t in whatif["redteam"]["tests"]
    ]
    facts += [f"What-if {y} return: {_pct(v)}" for y, v in sorted(whatif["yearly_returns"].items())]
    return facts
