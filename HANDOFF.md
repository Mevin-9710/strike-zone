# HANDOFF — where work stopped (2026-11-10)

## Run it
    python3 tools/serve.py          # http://localhost:8765/index.html  (no-cache dev server; add ?debug=1 for cheat keys F7/F8/F9, ?test=1 for the __game test API, ?touch=1 to force touch UI)
    cd tests && node run.cjs        # 50 tests (needs the server running + /usr/bin/chromium)

## State
Phases 1-3 are built: 3D lobby, XP/battle pass/shop (charms, sprays), weapon upgrades after wins, rewarded-ad hooks, procedural districts (world/procgen.js), 12-mission campaign, breach walls, barrels, intel. Last full test run: 50/50 (tests/last-run.txt). Docs: DEV-LOG.md, EXPANSION-PLAN.md, RESEARCH-FEEL.md, ../cg-fps-wiki/CLAUDE.md.

## Last thing in progress: "make it 1000x more fun + fast" parallel sprint
DONE and committed (50d2a1d): music + new audio (game/audio.js), slide (C/Ctrl), sprint FOV kick, hit-stop, camera punch, death knockback, damage numbers/kill banners/streaks/objective arrow (game/feel.js wired in game.js), enemy LOD culling, dynamic resolution, G.difficulty ramp, tutorial wired (game/tutorial.js).
Sub-agent edits (committed d3d6ff5) — VERIFIED: full suite 50/50 passes on the combined code (kit.js/procgen.js load fine; no rollback needed). Still not FPS-measured or phone-tested:
- game/enemies.js (aim tell, stagger, accuracy ramp, strafing, difficulty) — agent said it works in headless run
- index.html CSS polish block (lobby/end-screen animations)
- world/kit.js + world/procgen.js (agy: perf + props) — agy was killed mid-edit; CHECK these load without errors, else `git checkout world/`
## Next steps
1. Start server, run `cd tests && node run.cjs`; fix regressions; `git checkout world/` if kit/procgen are broken.
2. Re-measure FPS (tmp scripts are gone; use __game.info / tests): districts were 70-85 FPS on Intel HD 2500 before the agent edits; keep that.
3. Phone testing: use LAN http://<pc-ip>:8765 (public tunnel was too slow). `sudo ufw allow 8765/tcp` if blocked.
4. Remaining ideas in RESEARCH-FEEL.md; update DEV-LOG.md and the wiki when done.
## Notes
- Headless FPS tests are unreliable (swiftshader); user GPU is Intel HD 2500.
- Browser caching bit us once; always use tools/serve.py.
