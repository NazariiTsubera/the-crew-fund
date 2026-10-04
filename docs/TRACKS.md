# Prize tracks

One row per prize we enter. "Where" points at the code a judge can open; "Demo" is the moment in
the three-minute demo that shows it.

| Prize | Where it lives | Demo moment | Devpost blurb |
| --- | --- | --- | --- |
| Investment Society (core) | `api/app/routes/judged.py`, `api/crew/`, `docs/validation.md` | Live `check.py` against `api.crewfund.vodka` | A long-only fund whose judged endpoints match the organizers' template and scorer exactly (100/100), run by a crew of AI agents that are backtested walk-forward and attacked by a red team, with a human splitting the capital. |
| Overall | The whole repo | Recruit an agent → argue with it → recompile it in words → set the split | Talk a strategy through with an AI, compile it into a trading agent, watch a red team attack it, then decide who gets the money. |
| Best Theme | `web/`, `api/crew/seeds.py` | The crew: Accountant, Fence, Inside Man, Lookout, Wheelman | A heist crew where every member is a strategy with a persona, a record and a red-team file. |
| Best Design | `web/src/`, `web/design/` | The War Room and an agent's page | A dense, honest War Room: every number on screen comes from the engine, badges carry text, never colour alone. |
| Best use of Gemini (only if Gemini is primary) | `api/crew/gemini.py`, `api/crew/chat.py` | Typing a strategy; asking "Why did you sit out in 2022?" | OpenAI is the primary model and Gemini the fallback chain today; enter only after switching. |
| Tiger Data | `api/crew/store.py` (hypertables for curves and the log) | The Live floor replaying the log | Agents, curves, books and every decision stored in TimescaleDB hypertables, with a file fallback so the demo never dies with a database. |
| Vultr | `deploy/`, `.github/workflows/deploy.yml` | Push to `main`, watch it deploy | Both apps on one Vultr box behind Caddy with automatic HTTPS, deployed by GitHub Actions on every green push. |
| GoDaddy (domain) | `crewfund.vodka`, `api.crewfund.vodka` | The URL on the slide | THE CREW lives at crewfund.vodka. |
