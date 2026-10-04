# Validation: how the numbers are made

Everything on screen comes from one engine run over one cached panel. This page says how, and
where the method is weaker than it looks.

## Data and the holdout

- Source: the organizers' state-vector dataset through their SDK, cached by
  `scripts/cache_panel.py` (ADR 0004).
- Decision dates: the last trading day of every month from January 2017.
- Holdout: the trailing 30 days (`holdout_cutoff`, recorded in the cache manifest) are never
  written to the cache, so no backtest, red-team test or Mastermind decision can read them.
- Point in time (`crew/pit.py`): a decision on date D ranks only vector rows dated on or before
  D. Rows with `snapshot_track_used == 1` take `fundamental_surprise` from a 2026-08-28 analyst
  snapshot, which is lookahead for any earlier date; every recipe filters them out and the
  filter cannot be removed (`crew/recipe.py`).
- `ORKD`, the organizers' planted ticker, is dropped from the cache, every book and every
  judged response.

## Walk-forward method (`crew/backtest.py`)

1. At each decision date, drop flagged rows, names without a price on the entry day, and names
   failing the recipe's filters (`pNN` thresholds are cross-sectional percentiles on that date).
2. Score each name: for every recipe feature, its cross-sectional percentile rank, centered,
   signed by direction (high or low) and weighted. A missing value counts as the median.
3. Hold the top N equally, bought at the close one trading day after the decision (a one-day
   embargo) and held buy-and-hold until the close one trading day after the next decision.
4. Sit-out rule: if the trailing Sharpe of the recipe's own paper returns over
   `lookback_months` (only months fully settled by the decision date, at least three) is below
   the recipe's floor, hold cash that month and log why.

One code path runs every agent: the seeds and any agent a judge creates.

## Cost model

Every unit of weight traded pays 5 to 25 basis points, scaled by the name's `amihud_illiq`
rank on the decision date (most liquid 5 bps, least liquid 25 bps; 25 bps when unknown).
Costs are charged on the entry day, so every KPI is net of costs.

## KPIs

Daily curve, 252 trading days a year, Sharpe without a risk-free rate (the organizers' scorer
convention), max drawdown as a negative number dated by the month of its trough, turnover as
the average one-way monthly turnover, trailing 12-month Sharpe from monthly returns.

## Red team (`crew/redteam.py`)

| Test | Passes when |
| --- | --- |
| Lookahead | Scoring each month on the previous month's vector keeps more than 80% of the Sharpe |
| Shuffle | The monthly picks beat 100 random draws from the same eligible names, p < 0.05 |
| 2020 replay | Drawdown Feb–Apr 2020 no worse than 90% of 100 random books of the same size from the same eligible names |
| 2022 replay | The same, Dec 2021–Dec 2022 |

The replays used to compare against the S&P 500. A 5–15 name equal-weight book of mid caps
lost every crash to a cap-weighted index on size and concentration alone, so the replays now
judge only the picks: same pool, same size, no signal. In a crash every name falls together,
so the bar is the worst decile of random books, not their median. The S&P 500 stays in the
detail line for context.

Verdict: no failures pass, one probation, two or more killed. A failed lookahead test kills on
its own, because a leaky backtest makes the other three numbers meaningless.

## The Mastermind (`crew/mastermind.py`)

- Capital across agents that are not killed or fired, by the positive part of each one's
  trailing 6-month Sharpe, with a 10% floor and a 50% cap, using only months settled by the
  decision date; equal until three such months exist.
- Fired when the trailing 24-month Sharpe of its picks' returns in excess of an equal-weight
  book of its own eligible names stays below −1.5 for six months. Excess over its own pool,
  so neither a bear market nor a small-cap crash fires anyone; only picks that lag the names
  they were chosen from. A 12-month Sharpe of a concentrated book has a standard error near 1,
  so the earlier rule (12 months, −1.0, three months) fired zero-skill agents on noise and,
  since firing is final, eventually fired everyone.
- The fund book: invested agents' books weighted by capital, universe only, every position
  capped at 5%, re-scaled to sum to 1 (the organizers' checker requires it). A sitting-out
  agent's capital flows to the others; "invested" is shown separately.

## Known weaknesses

- **Survivorship.** The universe is today's universe. Names that delisted before today are
  missing from the panel, which flatters every backtest, the S&P 500 comparison included.
  Prices are forward-filled, so a name that stops trading is held at its last price.
- **Estimates snapshot.** Outside `snapshot_track_used` rows, estimate-based features come from
  the organizers' point-in-time assembly; we trust their PIT gates (their DEVIATIONS.md) rather
  than re-deriving them.
- **Market-wide features.** Macro features that take one value per date for every name
  (for example `funding_stress`) cannot rank names; in a recipe they contribute nothing to the
  ranking.
- **Multiple testing.** A judge can create many agents; the shuffle test's p-value is per
  agent, not corrected across agents.
  `scripts/scan_features.py` runs every stock-level feature both ways (48 trials) through the
  same pipeline. On the 2026-10-04 panel six passed the shuffle test at p < 0.05, where about
  2.4 would by luck; with 1,000 shuffles only the two illiquidity measures (`kyle_lambda` and
  `amihud_illiq`, high) stayed below 0.01, and neither clears a Bonferroni bar of 0.001.
- **Survivorship and illiquidity.** The strongest scan result, buying the most illiquid names,
  is where survivorship bites hardest: a $0.70 stock is in today's universe because it
  survived. We read that result as the bias, not as an edge.
