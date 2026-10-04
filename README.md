# THE CREW

An AI hedge fund run like a heist crew, built for the Investment Society track at RowdyHacks XII.
You are the Mastermind: talk a strategy through with the AI recruiter, compile it into an agent,
watch it backtest walk-forward from 2017 to the holdout cutoff while a Red Team attacks it, then
decide how much of the fund each agent runs, and fire, rehire or delete them.

- Dashboard: https://crewfund.vodka
- Judged API: https://api.crewfund.vodka

## What's in it

- **Recruit** (`/agents/new`): research a strategy with the AI first; it asks before it compiles.
- **Agent page**: chat with the agent about its record (it cites its own facts, and knows how the
  S&P 500 did month by month), edit its compiled recipe above the chat and **RECOMPILE**, or ask
  it to change the recipe for you. FIRE / HIRE / DELETE sit in the header. ▶ PLAY reads an answer
  aloud; the microphone dictates.
- **War Room** (`/`): the fund against the S&P 500, each agent's share as its own line (toggle
  them with the checkboxes in the crew table), **SET SPLIT** to divide the money, and a scrubber
  that replays the history.
- **Live floor** (`/floor`): the fund's log replayed as a tape, from any year; **YOU** shows your
  own decisions.
- **Red Team**: four tests per agent (lookahead, shuffle, 2020 and 2022 crash replays). It
  advises (PASSED / CAUTION / FAILED); it never stops an agent from trading.

How every number is made: [`docs/validation.md`](docs/validation.md).

## Run it locally

You need:

- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- Node 22 and pnpm 10 (`corepack enable` gives you the pinned pnpm)
- The organizers' dataset: their data server URL plus a token (or a local copy)
- For the AI parts: an OpenAI key and/or a Gemini key (either works; OpenAI is tried first)

### 1. API (`api/`)

```bash
cd api
cp .env.example .env
```

Fill in `api/.env`:

| Variable | Needed for |
| --- | --- |
| `SV_DATA_ROOT`, `SV_DATA_TOKEN` | everything (the dataset) |
| `OPENAI_KEY` and/or `GEMINI_API_KEY` | recruiting, chat, recompiling with words |
| `ELEVENLABS_API_KEY` | ▶ PLAY (optional) |
| `DATABASE_URL` | leave **empty** locally: results go to `api/cache/store.json` |

```bash
uv sync
uv run python -m scripts.cache_panel   # once: pulls the panel into api/cache (~20 min the first time)
uv run python -m scripts.seed_agents   # once: runs the five seed agents and splits the fund
uv run uvicorn app.main:app --reload --port 8000 --env-file .env
```

`--env-file .env` matters: it is how the server reads your keys. The scripts read `api/.env` on
their own. Check it is up: `curl localhost:8000/health` → `{"ok":true}`.

The judged endpoints (`/health`, `/portfolio/holdings`, `/backtest`, `/screen`, `/asof`) work as
soon as the dataset is reachable; the War Room endpoints need the two scripts above. The first
`/backtest` on a fresh clone can take a minute while the price files download into
`api/cache/mirror`; after that it answers in about a second.

### 2. Web (`web/`)

```bash
cd web
cp .env.example .env.local
pnpm install
pnpm dev                      # http://localhost:3000
```

`.env.local` starts in **mock mode** (`NEXT_PUBLIC_API_MOCK=1`): built-in fixtures, no API needed,
and the AI answers are placeholders. To use your local API, set:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_API_MOCK=
```

and restart `pnpm dev` (Next reads these at start).

## Checks (run before every push; CI runs the same)

```bash
cd api && uv run ruff check . && uv run ruff format --check . && uv run pytest -q
cd web && pnpm lint && pnpm typecheck && pnpm test
cd web && pnpm exec playwright install chromium && pnpm e2e   # browser smoke tests, mock mode
```

The API tests build synthetic datasets, so they need no token, no keys and no `.env`. They compare
`/backtest` against the organizers' scorer (`api/tests/rubric/check.py`, vendored unchanged). To
run that scorer against a server:

```bash
cd api
set -a && . ./.env && set +a
uv run python tests/rubric/check.py --base-url http://localhost:8000     # or https://api.crewfund.vodka
```

It expects 100/100.

## Troubleshooting

- **A script says the dataset or a key is missing**: check `api/.env` exists in `api/` (not the
  repo root) and that you ran the command from `api/`.
- **The server starts but the AI always answers "from its file"**: start it with
  `--env-file .env`, and check `OPENAI_KEY` or `GEMINI_API_KEY`. The answer's footer names the
  reason (no key, rate limited, timeout).
- **The War Room says the fund is not seeded**: run `scripts.cache_panel` then
  `scripts.seed_agents`.
- **The web app shows "MOCK DATA"**: `.env.local` still has `NEXT_PUBLIC_API_MOCK=1`.
- **`pnpm` is missing or the wrong version**: `corepack enable`, then `pnpm --version` should
  print 10.x.
- **`pnpm e2e` fails at once**: run `pnpm exec playwright install chromium` first.

## Deploy

Every push to `main` that passes CI deploys both apps to the VPS (`.github/workflows/deploy.yml`);
secrets live in `/opt/crew/.env` on the server. After a change to the engine or the seeds,
re-seed on the server:

```bash
cd /opt/crew && unset API_TAG WEB_TAG && docker compose run --rm --user root -e PYTHONUNBUFFERED=1 api sh -c 'python -m scripts.seed_agents && chown -R 10001:10001 /app/cache' && docker compose restart api
```

## Where to read next

- [`AGENTS.md`](AGENTS.md): how we work (Linear, tests, the rules that protect the score).
- [`docs/validation.md`](docs/validation.md): how every number is made, and its weak spots.
- [`docs/TRACKS.md`](docs/TRACKS.md): the prizes and where each one lives.
- [`docs/decisions/`](docs/decisions/): why the architecture looks the way it does.
