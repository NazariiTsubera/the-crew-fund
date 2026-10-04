# Devpost submission

Paste into https://rowdy-hacks-xii.devpost.com/ . The numbers below come from a fresh seed of the
five agents with an equal capital split on the 2026-10-04 panel (holdout from 2026-08-22); after
the production re-seed, confirm them on the live War Room before submitting.

## Title

THE CREW: an AI hedge fund you run like a heist crew

## Tagline

Talk a strategy through with an AI, compile it into a trading agent, watch a red team attack it,
then decide who gets the money.

## Inspiration

Every "AI trader" demo we had seen was a chatbot picking stocks, with no way to tell skill from
luck or from lookahead. We wanted the opposite: a fund where any idea, typed in plain English,
goes through the same honest test as a quant's, where the agent has to show its receipts when you
question it, and where a human stays in charge of the money.

## What it does

**You are the Mastermind. The agents are your crew.**

- **Recruit an agent by talking to it.** The recruiter is a research chat first: ask what a
  signal means or which ones fit your idea, and nothing changes until you ask for it. When the
  strategy is complete it asks whether to compile, and compiles only when you agree. A recipe is
  a weighted blend of the organizers' state-vector features (high or low first), filters, how
  many stocks to hold, a lookback and a sit-out rule.
- **Every recipe is backtested walk-forward** from January 2017 to the holdout cutoff: 116 monthly
  decisions over a 1,257-stock universe, one-day embargo, equal-weight top N, trading costs
  scaled by each stock's liquidity (5 to 25 bps), strictly point in time.
- **A Red Team attacks it with four tests:** a lookahead test (does the signal survive being lagged
  a month?), a shuffle test (does it beat 100 random books drawn from the same eligible stocks?),
  and replays of the 2020 crash and the 2022 bear market (is its drawdown worse than 90% of
  random same-size books from its own pool?). The verdict, PASSED, CAUTION or FAILED, is advice:
  it never stops an agent from trading.
- **Talk to any agent.** It answers in persona from its own stored record: recipe, KPIs, every
  Red Team test, holdings, the log rows matching your question, and how it did against the
  S&P 500 month by month. Every answer lists the stored facts it cited, and the agent remembers
  the conversation.
- **Change an agent and recompile it.** Edit its recipe in place (weights, directions, add or drop
  signals, book size, lookback, sit-out), or just tell it ("make it a lot less risky", "go
  ahead"): it rewrites the recipe and puts it through the whole pipeline again.
- **Run the fund.** Split the capital across the crew with sliders; fire an agent (it can be
  rehired) or delete it. The War Room shows the fund against the S&P 500 with each agent's share
  as its own line; scrub back in time and the chart rewinds, let go and it replays. Holdings shows
  the fund's book month by month, by agent. The Live floor replays the fund's log from any year,
  including your own decisions.
- **Voice:** any answer can be read aloud (ElevenLabs), and prompts can be dictated.
- **The judged API** serves the fund's current book at `/portfolio/holdings` and scores **100/100
  on the organizers' `check.py`**, locally and against https://api.crewfund.vodka.

## How the engine works

1. **Data.** The organizers' state-vector dataset through their SDK, cached locally: month-end
   feature vectors, daily closes (split-adjusted, 188 splits) and the S&P 500. The trailing
   holdout is never written to disk. Rows flagged `snapshot_track_used` (a 2026 analyst snapshot,
   lookahead for earlier dates) are filtered out of every recipe, and that filter cannot be
   removed.
2. **Ranking.** On each decision date every eligible stock gets a score: for each feature in the
   recipe, its cross-sectional percentile rank on that date, centred, signed by direction and
   weighted. Missing values count as the median.
3. **Trading.** Hold the top N equally, bought at the close one trading day after the decision,
   held until the next rebalance, net of costs. If the recipe's own trailing Sharpe drops below
   its floor, it sits in cash that month and logs why.
4. **Red Team.** The four tests above, run on the same engine. A collapsed lookahead test is
   fatal on its own: a leaky backtest makes every other number meaningless.
5. **The fund.** Your split, normalized over the agents holding a book that month; positions
   capped at 5% and re-scaled to sum to 1 (the organizers' checker requires it). A sitting-out
   agent's capital flows to the others.
6. **The AI's role.** The model turns words into a recipe (validated by Python against a feature
   whitelist and the recipe grammar) and explains results. It never sees a price, a return or a
   date range, and it never picks a weight in the book: every number comes from the engine.

## How we built it

- **Engine and judged API:** Python 3.12, FastAPI, polars, NumPy, Pydantic, the organizers'
  `statevector` SDK, with `/backtest` ported from the scorer's own reference math. A local
  day-file mirror of the organizers' data server took `/asof` from about 10 s to about 10 ms.
- **AI:** OpenAI (`gpt-5.4-mini`, about 3 s an answer) first, with Google Gemini as the fallback,
  falling down a chain of Gemini models when one is rate-limited or overloaded, with timeouts
  and a deterministic answer from the agent's own facts if every model fails. JSON-schema
  outputs, validated in Python. ElevenLabs for speech; the browser's Web Speech API for
  dictation.
- **Store:** Tiger Data (TimescaleDB): agents, runs, curves, books, the log and every chat in
  Postgres, with hypertables for the time series and the log.
- **War Room:** Next.js 16, React 19, TypeScript, Tailwind CSS, Zod schemas mirroring the API's
  Pydantic models, SVG charts written by hand.
- **Quality:** test-first for the engine and the web logic: 240 API tests (including the
  organizers' scorer against synthetic datasets), 190 Vitest tests, Playwright smoke tests on
  desktop and phone. A regression gate runs on every push.
- **Ship:** Docker images on GHCR, one Vultr box behind Caddy with automatic HTTPS, deployed by
  GitHub Actions on every green push to `main`, at crewfund.vodka.

## Results (be honest about them)

From a fresh seed, equal split, February 2017 to August 2026:

| | THE CREW | S&P 500 |
| --- | --- | --- |
| Total return | +381.5% | +236.8% |
| Sharpe | 0.78 | 0.79 |
| Max drawdown | −37.5% (Sep 2022) | −33.9% |

More return at about the index's risk-adjusted level, and our own Red Team says why not to trust
it too much: none of the five seed agents beats random picks from its own pool (the shuffle
test), so three are flagged FAILED and two CAUTION. Part of the return is survivorship bias: the
universe is today's listed companies. We say so on screen and in `docs/validation.md`.

## Challenges

- **Making "nothing on screen is invented" true.** The evidence under each answer is the stored
  rows' own text, never model output; the agent can only cite facts the engine wrote.
- **A Red Team that judges skill, not size.** Our first crash tests compared a 10-stock
  equal-weight book of mid caps to the cap-weighted S&P 500, which fails every crash on size
  alone. They now compare against random books of the same size from the agent's own pool.
- **Automatic firing that fired everyone.** A 12-month Sharpe of a concentrated book has a
  standard error near 1, so our original Mastermind fired zero-skill agents on noise. We handed
  that decision to the human.
- **A model that said it recompiled when it hadn't.** We gave the agent its conversation, split
  "talk" from "edit the recipe", and made the server correct any claim no action backs.
- **Free-tier AI quotas** (20 requests per model per day) in the middle of a demo: hence the
  model chain, timeouts and the deterministic fallback.

## Accomplishments

- 100/100 on the organizers' scorer, locally and in production.
- A seed scan of every stock-level feature through the Red Team (48 trials) that found one
  strong effect, buying illiquid stocks, and then showed it was survivorship bias, not alpha.
  We left it out of the seeds and documented why.
- A fund you can steer in plain English, where every number traces back to the engine.

## What we learned

A leaky signal aces every test except the one that looks for leakage, so that test has to be
fatal on its own. And the honest result ("our agents don't beat random picks") is a better demo
than a fake +2,000%.

## What's next

Per-user memory and conversations, rolling re-evaluation as new months arrive, multiple-testing
correction across every agent judges create, a point-in-time universe without survivorship bias,
and versioned agents you can roll back.

## Built with

python, fastapi, uvicorn, polars, numpy, pydantic, openai, gemini, elevenlabs, web-speech-api,
nextjs, react, typescript, tailwindcss, zod, vitest, playwright, tiger-data, timescaledb,
postgresql, docker, caddy, vultr, github-actions, uv, pnpm

## Links

- Live: https://crewfund.vodka
- Judged API: https://api.crewfund.vodka
- Repo: https://github.com/NazariiTsubera/the-crew-fund

## Prize opt-ins

Investment Society, Overall, Best Theme, Best Design, Tiger Data, Vultr, GoDaddy domain. See
docs/TRACKS.md. Gemini is the fallback model, not the primary: enter "Best use of Gemini" only if
Gemini is made the primary model before submitting.
