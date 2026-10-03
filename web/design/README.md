# Design reference

Exported from Claude Design ("The Crew" project) on 2026-10-03.

- `the-crew-bundle.html` — the self-contained export. Open it in a browser to see every screen
  (`python3 -m http.server 8766` in this folder, then http://localhost:8766/the-crew-bundle.html).
- `src/The Crew.dc.html` — the page template (Claude Design `dc` runtime markup, sc-if / sc-for).
- `src/crew-data.js` — the mock data model: seed agents, recipes, red-team tests, Mastermind memos,
  holdings with reasons, log entries. This is the shape the real API must serve.
- `src/dc-runtime.js`, `src/react*.min.js`, `src/*.woff2` — runtime and IBM Plex fonts, reference only.
- `tokens.css` — the color tokens for dark and light themes, extracted from the template.

Screens: War Room (dashboard), Live floor (event tape), Holdings, Agent page (Chat | Performance),
New agent (recruit flow). We re-implement these in Next.js under `web/src`; nothing here ships.
