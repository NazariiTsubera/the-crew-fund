"""Scan every stock-level feature, both directions, through the same evaluate() every agent
gets, so seed recipes come from evidence instead of intuition. Prints one row per trial.

    cd api && uv run python -m scripts.scan_features [--top-n 10]

Multiple testing: this runs ~50 trials. At p < 0.05, two or three would pass the shuffle test
by luck alone, so a survivor here is a candidate, not a discovery (docs/validation.md).
"""

from __future__ import annotations

import argparse
import sys

import polars as pl

from crew.features import FEATURES
from crew.panel import Panel, load_panel
from crew.pipeline import evaluate
from crew.recipe import Recipe


def stock_level(panel: Panel) -> list[str]:
    """Features that differ across names on a date. Market-wide ones (one value per date)
    cannot rank names, so a recipe built on them is a random book."""
    v = panel.vectors
    out = []
    for f in FEATURES:
        if f not in v.columns:
            continue
        spread = v.group_by("date").agg(pl.col(f).drop_nulls().n_unique().alias("n"))
        if spread["n"].median() > 5:
            out.append(f)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top-n", type=int, default=10)
    args = ap.parse_args()
    panel = load_panel()
    features = stock_level(panel)
    skipped = sorted(set(FEATURES) - set(features))
    print(f"{len(features)} stock-level features; market-wide, skipped: {', '.join(skipped)}")
    rows = []
    for f in features:
        for direction in ("high", "low"):
            recipe = Recipe(
                features=[{"name": f, "weight": 1, "direction": direction}],
                lookback_months=12,
                top_n=args.top_n,
            )
            run, report = evaluate(recipe, panel)
            tests = {t["name"]: t for t in report["tests"]}
            rows.append((report["verdict"], run.kpis["sharpe"], f, direction, tests))
            print(
                f"{report['verdict']:<10} {run.kpis['sharpe']:5.2f}  {f:<28} {direction:<4}  "
                + "  ".join(
                    ("ok " if t["passed"] else "XX ") + t["detail"] for t in report["tests"]
                ),
                flush=True,
            )
    print("\nSurvivors (not killed), best Sharpe first:")
    for verdict, sharpe, f, direction, _ in sorted(rows, key=lambda r: -r[1]):
        if verdict != "killed":
            print(f"  {verdict:<10} {sharpe:5.2f}  {f} {direction}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
