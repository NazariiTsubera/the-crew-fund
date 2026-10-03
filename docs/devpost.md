# Devpost submission (draft)

Paste into https://rowdy-hacks-xii.devpost.com/ . Every number in the final text must come from the
live War Room on submission morning; the brackets mark where.

## Title

THE CREW: an AI hedge fund run like a heist crew

## Tagline

Describe a strategy in plain English. Watch it become a trading agent, survive a red team and earn
its capital over nine years of history.

## Inspiration

Every "AI trader" demo we had seen showed a chatbot picking stocks, with no way to tell skill from
luck or from lookahead. We wanted a fund where every idea is held to the same honest standard, and
where you can argue with the agent and it has to show its receipts.

## What it does

- **You recruit an agent in words.** Gemini compiles the description into a recipe: a weighted
  blend of the organizers' 27 state-vector features, filters, a book size and a sit-out rule. It
  sees only words, never a return, price or date.
- **The recipe is backtested walk-forward** from January 2017 to the holdout cutoff on monthly
  decisions with a one-day embargo, net of liquidity-scaled trading costs, point in time.
- **A red team attacks it:** a lookahead test (signals lagged one month), a shuffle test against
  random picks, and replays of the 2020 crash and the 2022 bear market. Verdict: pass, probation
  or killed.
- **The Mastermind pays the crew by track record:** capital by trailing Sharpe with floors and
  caps, a 5% position cap, and it fires agents whose picks keep losing to the S&P 500.
- **You can talk to every agent.** It answers in persona and every answer cites stored rows from
  its own log.
- **The judged API** serves the fund's book at `/portfolio/holdings` and matches the organizers'
  scorer exactly (100/100 on `check.py`).

## How we built it

Python 3.12, FastAPI and polars for the fund engine and judged API (the organizers' SDK and the
scorer's own math); Next.js, TypeScript, Tailwind and Zod for the War Room; Gemini for compiling
and narrating; Tiger Data (TimescaleDB hypertables) for the store with a file fallback; one Vultr
box behind Caddy, deployed by GitHub Actions on every green push to `main`; crewfund.vodka.

## Challenges

- Making "nothing on screen is invented" true: the evidence under each chat answer is the stored
  rows' own text, never model output.
- Point in time: the holdout is never written to disk, snapshot-flagged rows can never feed a
  signal, and every decision only reads rows dated on or before it.
- A firing rule that judges skill, not the market: firing on raw Sharpe fired every long-only
  agent in 2022, so the Mastermind judges picks against the S&P 500.

## Accomplishments

- [Live check.py score against api.crewfund.vodka]
- [Fund total return and Sharpe vs the S&P 500, from the War Room]
- [Which seed agents passed, which were put on probation or fired, from the War Room]

## What we learned

A leaky signal aces every test except the one that looks for leakage, so that test has to be
fatal on its own.

## What's next

Rolling re-evaluation of every agent as new months arrive, multiple-testing correction across all
the agents judges create, and position-level risk limits per sector.

## Built with

python, fastapi, polars, pydantic, nextjs, typescript, tailwindcss, zod, gemini, timescaledb,
tiger-data, postgresql, docker, caddy, vultr, github-actions

## Links

- Live: https://crewfund.vodka
- Judged API: https://api.crewfund.vodka
- Repo: https://github.com/NazariiTsubera/the-crew-fund

## Prize opt-ins (re-check on Sunday)

Investment Society, Overall, Best Theme, Best Design, Best use of Gemini, Tiger Data, Vultr,
GoDaddy domain. See docs/TRACKS.md for the blurbs.
