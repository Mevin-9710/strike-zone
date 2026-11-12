# AGENT HANDOVER: autonomous QA + bug-fix brief for Strike Zone

You are a cloud agent in a fresh Linux container (no GPU, no logins). You test and fix the game on your own.
Read first: `README.md`, `HANDOFF.md`, `docs/wiki/` (especially `testing.md`, `missions.md`, `known-issues.md`), and the latest entries at the bottom of `DEV-LOG.md`.

## 1. Setup (exact commands)
    git clone https://github.com/Mevin-9710/strike-zone && cd strike-zone
    bash tools/setup_cloud.sh            # idempotent: node deps, Playwright Chromium (+system libs), starts server on :8765, smoke run
    source tests/node_modules/.chrome-env  # exports CHROME=<playwright chromium>
    cd tests && node run.cjs             # full suite (about 50 checks, several minutes on SwiftShader)
Server by hand (headless/background): `nohup python3 tools/serve.py > /tmp/serve.log 2>&1 &`, then wait for
`curl -sf http://localhost:8765/index.html`. Always use serve.py (it sends no-cache headers), never a caching server.
Chromium flags (as in run.cjs): `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --no-sandbox`.

## 2. Driving the game
Load `http://localhost:8765/index.html?test=1` (adds `&touch=1` for the phone UI). Wait for `window.__game.ready`.
`?test=1` exposes `window.__game`, skips the CrazyGames SDK, unlocks everything, and does not force the tutorial. The full API is documented in `docs/wiki/testing.md`. The core calls:
- `__game.start(i, {route:'stealth'|'assault', abilities:[a,b], primary, sidearm, tutorial})` starts mission index i (0-11).
- `__game.step(sec, fps=30)` advances the simulation deterministically and renders one frame. `__game.auto()` hands control back to rAF.
- `key('KeyW'|'KeyE'|..., down)`, `mouse(0|2, down)`, `look/lookAt`, `teleport(x,y,z)`, `fire()`, `reload()`, `equip(slot)`, `ability(0|1)`
- `killAll()`, `peace()`, `damage(n)`, `timeout()`; `state` (hp, pos, objective, enemies, end text, fps), `map.points`, `map.extract`, `info` (draw calls/tris)
- To win a mission, copy `WIN()` from tests/run.cjs (defuse / plant_hold / retrieve+extract recipes).
- With `?debug=1` (no test API): F9 kills all enemies, F8 teleports to the next objective, F7 sets the clock to 0.5 s. Use this to check the real UI/rAF path.
- Menus: `openLobby()`, `openBriefing('mode'|'mission'|'agent'|'loadout')`, `openShop()`, `openPass()`, `openProfile()`. Element ids are in index.html (`#lPlay`, `#chapters`, `#missions`, `#briefNext`, `#briefBack`, `#start`, `#end`, `#next`, `#again`, `#menuBtn`, `#adXP`, `#adRevive`).
- Tutorial: `start(0, {tutorial:true})`, then read `__game.tutorial.step` / `.steps`. Block 9 in run.cjs drives every step.
- Seed saves before load with `addInitScript` (see `open()` in run.cjs): `sz_progress`, `sz_profile`, `sz_tutorial_done`.

## 3. Goals (in priority order)
1. **Unit suite green**: `cd tests && node run.cjs` exits 0. Fix regressions before anything else.
2. **Automated playthrough of all 12 missions (4 chapters)**. Write `tests/playthrough.cjs`. For each mission: start, play it with the API (move along `map.points`, fight with fire/lookAt rather than only `killAll`, use both abilities, breach, pick up intel/medkits), finish, then also check the fail paths (timeout, death, revive). Record per mission: page errors, console errors **and warnings**, `state.fps` / `info` draw calls and triangles, time to complete, and **stuck states** (player position unchanged for more than 10 s of sim while moving, objective progress frozen, enemy stuck inside a collider, `state.end` never set, NaN in pos). Also play once through the real UI with `?debug=1` (lobby, Play, chapter, mission, loadout, DEPLOY, F8/E, end card, Next) for each chapter.
3. **Screenshot report** `qa/report.md` + `qa/shots/*.png` at **1920x1080** and **390x844 with `?touch=1`** (hasTouch context). Cover every mission (spawn, objective, combat, end card), every menu (lobby, each play step, shop, pass, profile, settings, pause, end win/lose, loading), and every tutorial step. Write one table row per screen with the PNG link and any problems you see (overlaps, clipped text, unreadable HUD, missing models, black meshes).
4. **Fix every bug found.** Add a regression test for each fix (new block in run.cjs or in playthrough.cjs) and list it in the report.

## 4. Definition of done
- `node tests/run.cjs` and `node tests/playthrough.cjs` both exit 0 headless, with zero uncaught errors.
- All 12 missions can be won and lost with no stuck states. All tutorial steps complete.
- `qa/report.md` covers every mission, menu and tutorial step at both resolutions, with the bug list (found, fixed, test name, or open with a reason).
- `tests/last-run.txt`, `DEV-LOG.md` (dated entry) and `docs/wiki/known-issues.md` are updated.
- CI (`.github/workflows/test.yml`) is green on your PR.

## 5. Constraints
- **No build step.** Plain ES modules plus the vendored `lib/`. Don't add bundlers, TypeScript or frameworks. Runtime deps stay at zero.
- **Performance budget: Intel HD 2500 at 60 FPS.** Keep hot paths (update, render, AI, HUD) allocation-free. Don't add draw calls (the suite allows at most 350 calls and 600k tris per district). Download must stay under 20 MB (`tools/build_dist.sh` prints the size).
- **Headless FPS numbers are unreliable** (SwiftShader runs about 2 FPS). Don't "fix" low headless FPS. Use `tools/bench2.cjs` (deterministic update/render ms) for relative comparisons only, and report FPS as informational.
- Don't touch `site/` secrets, Supabase keys, Vercel config or deployments. Don't change `game/crazy.js` ad-gating semantics (CrazyGames policy) without a stated reason.
- Don't regenerate art (`tools/kenney_*.mjs` need asset folders that are not in the repo).
- Keep diffs small and in the existing style (compact, comment the why).

## 6. Commit / PR conventions
- Work on a branch `qa/<topic>` (for example `qa/playthrough`, `qa/fix-m6-extract`). Never push to `main`.
- One logical fix per commit. Use an imperative subject such as `Fix drone stuck in m8 vault wall`, and write the cause and the test in the body.
- Open a PR per batch with a bug table (bug, cause, fix, test), the test output summary, and screenshot links (CI artifact `test-artifacts`).
- Commit `qa/report.md` and the screenshots only if they total under 15 MB (otherwise rely on the CI artifact).
