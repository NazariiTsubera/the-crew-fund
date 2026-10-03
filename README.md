# THE CREW

An AI hedge fund run like a heist crew. Describe a strategy in plain English; an agent compiles it
into a trading recipe, backtests it walk-forward from 2017 to the holdout cutoff, gets attacked by
a red team, and trades alongside the rest of the crew. Built for the Investment Society track at
RowdyHacks XII.

- Dashboard: https://crewfund.vodka
- Judged API: https://api.crewfund.vodka

## Run it locally

API (Python 3.12, [uv](https://docs.astral.sh/uv/)):

```
cd api
cp .env.example .env    # fill in SV_DATA_ROOT and SV_DATA_TOKEN
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Web (Node 22, pnpm):

```
cd web
cp .env.example .env.local
pnpm install
pnpm dev
```

## Checks

```
cd api && uv run ruff check . && uv run pytest -q
cd web && pnpm lint && pnpm typecheck && pnpm test
```

How we work: [`AGENTS.md`](AGENTS.md).
