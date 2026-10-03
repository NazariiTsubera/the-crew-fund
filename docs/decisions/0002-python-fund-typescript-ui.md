# 0002 — Python for the fund, TypeScript for the War Room

**Status:** Accepted (CREW-1)

## Context

The scored half of the project is the organizers' API contract, and their template, SDK and
scorer are Python with polars. The shown half is the War Room, a data-dense dashboard with
streaming creation, charts and chat, judged on design.

## Decision

`api/` is Python 3.12 with uv, FastAPI and polars: it serves the judged endpoints in the
template's shapes and runs the whole fund engine (`api/crew/`). `web/` is Next.js with
TypeScript, Tailwind and Zod: it never computes a number, it only renders what the API serves.
The contract between them is the Pydantic response models in `api/app/models.py`, mirrored by
the Zod schemas in `web/src/lib/api.ts`.

## Consequences

- The judged endpoints use the organizers' own SDK and the scorer's own math, with no
  translation layer to drift.
- Two toolchains and two images; CI runs both gates and the deploy ships both.
- A mismatch between the Pydantic models and the Zod schemas is caught by tests on both sides
  (the web mock fixtures are validated against the Pydantic models).
