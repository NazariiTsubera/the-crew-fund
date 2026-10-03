# 0003 — Gemini compiles and narrates; it never sees a return

**Status:** Accepted (CREW-15, CREW-17)

## Context

An LLM that can see backtest results can fit a strategy to them: the cleanest lookahead leak
there is. An LLM that writes numbers can invent them. Judges will ask about both.

## Decision

Gemini does exactly two jobs, both through `crew/gemini.py`:

1. **Compile** (`crew/compiler.py`): words in, a recipe out. Its prompt holds the strategy
   text, the 27 feature names with plain-English meanings and the grammar. No return, price,
   date or result ever reaches it, so nothing it writes can be fitted to the test it is about
   to face. Its draft must pass the recipe grammar (`crew/recipe.py`) or it is corrected once
   and then refused.
2. **Narrate** (`crew/chat.py`): an agent answers questions in persona from a numbered list of
   facts read from the store. Gemini cites fact ids; the evidence shown is the cited facts' own
   text, never model output. When Gemini is unavailable the answer is built from the same facts
   without it.

Gemini never picks a weight, never sees a return series, and is never imported by the judged
endpoints (`tests/test_import_boundary.py`).

## Consequences

- The 100 judged points cannot depend on Gemini being up.
- A creation fails readably if Gemini is down; chat degrades to deterministic answers.
- The demo line "Gemini never sees a return" is enforced by code, not by a promise.
