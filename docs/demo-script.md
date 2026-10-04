# Demo video (3 minutes)

One story in five beats: you are the Mastermind, the AI does the work, every number is honest.
Every step below was verified working on 2026-10-04. Pre-record each segment and splice: AI
answers take ~3 s, a recompile ~5-10 s; cut the waits rather than narrate over them.

| Time | Screen | Action | Say (roughly) |
| --- | --- | --- | --- |
| 0:00-0:15 | War Room | Open on the fund chart. | "Every AI trading demo is a chatbot picking stocks. You can't tell skill from luck. THE CREW is an AI hedge fund where every idea is tested honestly, and you're the boss." |
| 0:15-0:40 | War Room | Point at the fund line vs the S&P 500 and the agent lines; drag the scrubber in "Who runs the money" back to Feb 2020 and let go: the chart rewinds and replays through COVID. | "Five AI agents, nine years of history, every number from our engine. +381% against the S&P's +237%, at about the same Sharpe. Here's the 2020 crash, replayed." |
| 0:40-1:20 | New agent | Ask "Which signals capture cheap companies?" (it answers; the recipe doesn't change), then "compile it". Show the compile, backtest and Red Team stages. | "You build an agent by talking to it. It researches with you first and only compiles when you agree. Then it's backtested walk-forward from 2017 and attacked by our Red Team." |
| 1:20-2:00 | Agent page (Accountant) | Ask "What happened in 2022?" (evidence and "me vs S&P 500" facts), then "raise kl_surprise_bits to 35% and recompile the model": the recipe card changes, it recompiles, the numbers update. | "Every answer cites the agent's own record. And you change it in plain English: it rewrites its recipe and goes through the whole pipeline again." |
| 2:00-2:25 | War Room, Live floor | SET SPLIT: drag one agent up, save, the chart updates. FIRE one agent. Live floor, YOU filter: your decisions on the tape. | "You're the Mastermind: you decide who runs the money, and you hire and fire. Every decision is on the tape." |
| 2:25-2:45 | Agent page Red Team card, Holdings | A FAILED shuffle test; hover Holdings at March 2020. | "And we're honest: our Red Team says none of these agents beats random picks from its own stocks. Most demos hide that; we put it on screen." |
| 2:45-3:00 | Terminal | `uv run python tests/rubric/check.py --base-url https://api.crewfund.vodka` → 100/100. End on the logo. | "The judged API scores 100 out of 100 on the organizers' checker. THE CREW, crewfund.vodka." |

Before recording: re-seed production (README, Deploy) with `OPENAI_KEY` set, so no answer reads
"FROM ITS FILE"; record agent shots on a freshly seeded agent so the chat history is clean; the
model is OpenAI first with Gemini as fallback, so don't call it Gemini on camera.

Backup: if a live step stalls, cut to the pre-recorded take of it; never fake a number on screen.
