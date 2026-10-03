# 0004 — A cached panel for the engine, one Store for results

**Status:** Accepted (CREW-6, CREW-7)

## Context

A nine-year monthly backtest against the remote dataset would fetch thousands of day-files per
run; creating an agent must finish in under 15 seconds. Results (agents, curves, books, the
log, chats) must survive restarts and be shared by the API and the seed script, and the demo
cannot die with a database.

## Decision

- **Panel cache** (`scripts/cache_panel.py`, `crew/panel.py`): one pull of month-end state
  vectors from 2017, daily closes from 2016, the S&P 500 and sectors into local parquet, sealed
  at the holdout cutoff with ORKD removed, plus a manifest recording the cutoff. Every backtest
  reads only this cache.
- **Store** (`crew/store.py`): one contract, two backends. Tiger Data (Postgres + TimescaleDB,
  `curves` and `log` as hypertables) when `DATABASE_URL` answers; a JSON file otherwise.
  `open_store()` falls back on any connection failure.

## Consequences

- Backtests take seconds and cannot see the holdout, because the holdout is not on disk.
- The cache must be rebuilt (and agents re-seeded) when the organizers extend the dataset.
- A dead database degrades to the file store instead of taking the War Room down.
