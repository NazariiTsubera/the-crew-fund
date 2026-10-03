# THE CREW

An AI hedge fund run like a heist crew. Describe a strategy in plain English; an agent compiles it
into a trading recipe, backtests it walk-forward from 2017 to the holdout cutoff, gets attacked by
a red team, and trades alongside the rest of the crew. Built for the Investment Society track at
RowdyHacks XII.

- Dashboard: https://crewfund.vodka
- Judged API: https://api.crewfund.vodka

## Run it locally

You need Python 3.12 with [uv](https://docs.astral.sh/uv/), Node 22 with pnpm, and access to the
organizers' dataset (a local copy, or their data server plus a token).

### 1. The API

```
cd api
cp .env.example .env    # fill in SV_DATA_ROOT and SV_DATA_TOKEN; GEMINI_API_KEY to create agents
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

The five judged endpoints (`/health`, `/portfolio/holdings`, `/backtest`, `/screen`, `/asof`)
work as soon as the dataset is reachable.

### 2. The crew (once per dataset)

```
cd api
uv run python -m scripts.cache_panel     # pull the panel into api/cache (a few minutes, once)
uv run python -m scripts.seed_agents     # run the five seed agents and the Mastermind
```

Without `DATABASE_URL` the results go to `api/cache/store.json`; with it, to Tiger Data
(`uv run python -m scripts.migrate` creates the schema). After seeding, `/portfolio/holdings`
serves the Mastermind's book and the War Room endpoints (`/vault`, `/agents`, `/log`,
`/capital`) have data.

### 3. The War Room

```
cd web
cp .env.example .env.local    # NEXT_PUBLIC_API_MOCK=1 runs on built-in fixtures, no API needed
pnpm install
pnpm dev                      # http://localhost:3000
```

Set `NEXT_PUBLIC_API_MOCK=` (empty) to read the API at `NEXT_PUBLIC_API_URL`.

### Without the dataset

`api/tests` builds synthetic dataset roots, so every check below runs with no token. To click
through the War Room without data, use mock mode.

## Checks

```
cd api && uv run ruff check . && uv run pytest -q
cd web && pnpm lint && pnpm typecheck && pnpm test
```

The API suite runs the organizers' scorer (`api/tests/rubric/check.py`, vendored unchanged)
against a live local server and expects 100/100. To score the deployed API:

```
cd api && uv run python tests/rubric/check.py --base-url https://api.crewfund.vodka
```

## Where to read next

- [`AGENTS.md`](AGENTS.md): how we work (Linear, tests, the rules that protect the score).
- [`docs/validation.md`](docs/validation.md): how every number is made, and its weak spots.
- [`docs/TRACKS.md`](docs/TRACKS.md): the prizes and where each one lives.
- [`docs/decisions/`](docs/decisions/): why the architecture looks the way it does.
