# AGENTS.md — how we work on THE CREW

Rules for humans and coding agents. `CLAUDE.md` points here; keep guidance in this file only.

## What this is

An AI hedge fund for the Investment Society track at RowdyHacks XII. You describe a strategy in a
chat; an agent compiles it into a recipe, backtests 2017 → holdout cutoff, survives a red team,
and trades alongside the other agents. The Mastermind splits capital by track record.

- `api/` — Python 3.12, uv, FastAPI, polars. The fund engine and every endpoint.
- `web/` — Next.js (App Router), TypeScript, Tailwind, Vitest. The War Room UI.
- `web/design/` — the Claude Design export we implement. Reference only, never shipped.
- `docs/` — decisions (ADRs), per-ticket plans, `TRACKS.md`.

## Where truth lives

Linear is the source of truth for **what** to build and **in what order**
(team Rowdyhacks12, project "THE CREW — RowdyHacks XII"). This repo's docs are the source of truth
for **how**.

- Find or create the issue before non-trivial work. Move it to In Progress when you start,
  Done only when its "Done when" line is verified by the command it names.
- Do not start a blocked issue before its blockers are Done.
- Branches `row-<n>-<slug>`; commit subjects start with `ROW-<n>: ` and an imperative summary.
- Scope creep becomes a new Backlog issue, never a silent expansion of the current one.

## Rules that protect the score

1. The judged endpoints (`/health`, `/portfolio/holdings`, `/backtest`, `/screen`, `/asof`) keep
   the organizers' template shapes. `/backtest` math matches the scorer's reference
   (`launchpad/rubric/check.py` in `orkid-labs/utsa-investment-hackathon`).
2. Judged endpoints never import the Gemini client, the compiler or the chat module.
3. Point-in-time only: no row dated after the decision date; the trailing 30 days
   (`ds.holdout_cutoff()`) are sealed; `snapshot_track_used == 1` rows never feed a signal.
4. Gemini compiles words into recipes and explains results. It never sees a return series and
   never picks a weight.
5. Long-only; weights ≥ 0 summing to 1.0; tickers from `ds.universe()`; never `ORKD`.
6. Nothing on screen is invented: every number comes from the store.

## Tests

- `api/crew/**` and `web/src/lib/**`: write the failing test first, watch it fail for the right
  reason, make the smallest change, watch it pass, commit.
- `api/app/**`: shape tests for every endpoint, plus the organizers' `check.py` against a local
  server before pushing.
- `web/src/app/**`: no component tests; verify the ticket's "Done when" in the running app.

Regression gate, run before every push and by CI:

```
cd api && uv run ruff check . && uv run pytest -q
cd web && pnpm lint && pnpm typecheck && pnpm test
```

## Conventions

- Kebab-case files on the web side; snake_case modules on the API side. No barrel files.
- Zod schemas with inferred types on the web side; Pydantic models on the API side.
- Comments explain why, never what.
- Secrets only in `.env` files; `.env.example` with empty values is committed.
- A decision that changes a pattern gets an ADR in `docs/decisions/`.
