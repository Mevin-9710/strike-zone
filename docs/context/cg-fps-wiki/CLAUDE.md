# CLAUDE.md: Strike Zone research wiki

## What this project is
The user wants to build a Valorant-like tactical shooter for crazygames.com (engine: Godot 4 + Blender, online multiplayer, abilities were their stated wishes). They have released several games on CrazyGames before; none passed Basic Launch (reasons: "didn't align with terms" and "not enough players after the 1-week test"; exact dashboard numbers not yet known, see `wiki/open-questions.md`).

**Current phase: validate the idea. Do NOT build the game yet.** The user explicitly said: plan and research first. Building starts only after the user approves a verdict in `wiki/verdict.md`.

## How this wiki works (LLM-wiki pattern)
- `raw/` holds source lists and saved excerpts. Never edit past entries; only append.
- `wiki/` holds the synthesized pages you maintain. Every claim carries a tag:
  - `[S]` sourced (URL in `raw/sources.md`), `[I]` my inference, `[?]` unverified/needs checking.
- `wiki/index.md` lists every page with a one-line summary. Update it on every change.
- `wiki/log.md` is append-only: date, what was done, what changed.
- `wiki/lessons.md` is the self-improvement file (see below).

## Workflows
1. **Ingest** a new source: add it to `raw/sources.md`, update the affected wiki pages, add a log entry, update the index.
2. **Query**: read `wiki/index.md` first, then only the relevant pages. If the answer was new synthesis, file it back into the wiki.
3. **Lint** (before any verdict update): look for contradictions, stale facts (CrazyGames docs change), claims without tags, orphan pages, and open questions that are now answerable.

## Self-improvement loop
- When the user corrects you, or a tool/approach fails, append an entry to `wiki/lessons.md` (what happened, why, the rule going forward) before continuing.
- Read `wiki/lessons.md` at the start of each session.
- Promote a lesson into this file's Rules once it has applied twice.

## Rules
- Plan before building. Ask or confirm scope before writing game code.
- Cite sources; mark confidence. Do not present third-party blog claims as CrazyGames policy.
- CrazyGames docs are the authority; re-fetch them when a decision depends on a number (limits, thresholds).
- WebFetch is unreliable in this environment (model error seen 2026-11-07). Use `python3 -I tools/fetch_text.py URL [MARKER] [MAX]`.
- Keep replies short (user chose the concise output style).
- Never claim a play count, revenue or ranking that was not found; say it was not found.

## Layout
```
CLAUDE.md            this file
raw/sources.md       every source with URL, date retrieved, trust level
wiki/index.md        catalog
wiki/log.md          chronological log
wiki/lessons.md      mistakes and rules
wiki/verdict.md      the idea-validation conclusion (update as evidence changes)
wiki/open-questions.md
wiki/crazygames/     launch process, requirements, multiplayer, economics
wiki/market/         competitors and audience
wiki/tech/           Godot web, multiplayer backends
tools/fetch_text.py  page-to-text helper
```
