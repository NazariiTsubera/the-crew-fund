# 0001 — Layered API: routes, services, repository, models

**Status:** Accepted (CREW-3)

## Context

The organizers' template is one `app.py` where every endpoint reads the dataset SDK directly.
We are adding a backtester, a red team, the Mastermind, a compiler and chat on top of it, and
the score depends on rules that must hold everywhere: universe-only tickers, never `ORKD`,
point-in-time reads, and judged endpoints that never import Gemini. If every endpoint queries
the SDK itself, each one has to apply those rules again, and reviewers have to check each one.

## Decision

`api/app/` has four layers. Each one only imports from the layers below it:

| Layer | Owns | Never does |
| --- | --- | --- |
| `routes/` | HTTP: parse the request, call one service, turn errors into status codes | business logic, dataset reads |
| `services/` | business logic (backtest math, holdings, screen) | HTTP types, SDK calls |
| `repository.py` | every read of the organizers' dataset; the universe, `ORKD` and PIT rules | business logic |
| `models.py` | Pydantic request/response schemas | logic |

`routes/judged.py` holds the five judged endpoints and nothing else, so the import-boundary
test (CREW-4) checks one module. The crew engine (`api/crew/`) is a service-level package; the
Tiger Data store (CREW-6) is a second repository next to `repository.py`.

Not added: dependency-injection containers, abstract repository interfaces, response models for
the judged shapes. They add indirection without a second implementation to justify it. The one
exception is the Store's JSON fallback (CREW-6), which is a real second implementation.

## Consequences

- A data rule is fixed once in `repository.py`. Example: the SDK's `/asof` fallback showed a
  quarter before it was filed, and the fix went in the repository only.
- The backtest arithmetic is pure (frames in, metrics out), so it is tested against the
  vendored scorer without a server.
- One more hop per request than the template; negligible next to the parquet scans.
