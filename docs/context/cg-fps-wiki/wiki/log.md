# Log (append only)

## 2026-11-07
- Context: user asked to validate the CrazyGames Valorant-like idea before building; asked for an LLM wiki with CLAUDE.md and self-improvement.
- Read CrazyGames docs: requirements intro, technical, gameplay, multiplayer, quality, game covers, Basic Launch guide, FAQ.
- Searched: Basic Launch criteria, FPS category rankings, Godot web size, a developer's CrazyGames launch post.
- Created wiki skeleton, 6 topic pages, verdict (preliminary), open questions, lessons.
- Abandoned earlier Three.js prototype in `valorant-web/` (outside this wiki; not needed for validation).

## 2026-11-07 (later)
- User decisions: use Three.js + plain HTML (see tech/godot-web.md); phase 1 = single-player story mode vs bots as the Basic Launch test; round-based pacing and online lobbies come after the KPIs pass. User message about agents/plant-defuse gap was cut off mid-sentence; not yet answered.

## 2026-11-07 (foundation build)
- Story researched and scored 14/25 -> ~19/25 after improvements (story/story-bible.md).
- Built Season 1 foundation in strike-zone/: 3 missions (defuse, plant+hold, 3-device defuse), 8 abilities, mission select, progression (localStorage), debug keys F6-F9.
- Headless test suite: 34/34 pass (strike-zone/tests/last-run.txt). Details in strike-zone/DEV-LOG.md.
- Next phase (per user): stronger model handles modeling and the final game build.

## 2026-11-08 (catch-up)
- Wiki had fallen behind; the detailed build log lives in strike-zone/DEV-LOG.md (characters, rig, weapons, props, ability FX). Art/map decisions: strike-zone/ART-PLAN.md.
- Decisions since last entry: Three.js + original assets; 5 operatives + 6 enemies; 10 weapons; maps medium (~90 m), shared city kit, M1 noon / M2 morning / M3 dusk; painted+grime style; goal prompt drafted to build everything and test collisions, combat feel, HUD. Pending: choose HUD/UI style.
- 2026-11-08: HUD/UI style chosen = D "Comic bold" (yellow/black skewed panels). Spec in strike-zone/ART-PLAN.md.
