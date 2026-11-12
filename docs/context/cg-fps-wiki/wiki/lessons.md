# Lessons (self-improvement log)

Format: date, what happened, why, rule.

## 2026-11-07: started building before planning
- Happened: user asked to "build a game"; I scaffolded a Three.js prototype immediately. User stopped me: "dont just go and start building! lets plan".
- Why: treated a large, ambiguous project as a coding task.
- Rule: for any new project or big scope, plan and confirm first. Never write game code before the user approves the scope. (Promoted to CLAUDE.md Rules.)

## 2026-11-07: ignored a stack/design preference until asked
- Happened: I chose Three.js without asking; user wanted Godot + Blender.
- Rule: ask engine/tooling and scope questions before choosing them.

## 2026-11-07: WebFetch failed
- Happened: WebFetch returned a model error (gemini-3.5-flash-lite unavailable) on every call.
- Rule: fall back to `tools/fetch_text.py` (curl-style fetch + text extraction). Do not retry WebFetch repeatedly.

## 2026-11-07: my text extractor deleted real content
- Happened: stripping `<nav>` tags removed whole documentation pages (empty output).
- Rule: only strip `script` and `style`. Docs pages repeat a large nav; locate content with a marker (last occurrence).

## 2026-11-07: search snippets are not evidence
- Happened: several facts came only from search-engine summaries (portalready.world, Godot size blogs).
- Rule: tag them `[C]` and open the primary page before using a number in a decision. Official docs are `[S]`.

## 2026-11-07: a plan-mode write failed silently
- Happened: plan file write returned "Tool result missing". It was unclear if the file existed.
- Rule: after an errored write, verify the file exists before moving on.

## 2026-11-07: test failures were test bugs, not game bugs
- Happened: three failures in a row came from the test code (closure in browser context, clicking a hidden panel, wrong assertion).
- Rule: when a test fails, check the test before changing the game. Record the fix in DEV-LOG "Test-writing lessons".

## 2026-11-08: keep the wiki current
- Happened: I logged builds only in DEV-LOG.md and the wiki fell behind; user asked whether it was being kept.
- Rule: after each milestone append one line to wiki/log.md pointing at DEV-LOG/ART-PLAN; keep wiki/index.md complete. The wiki is the first thing read next session to save tokens.
