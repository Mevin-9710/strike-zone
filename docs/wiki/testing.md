# Testing guide
## Run
    python3 tools/serve.py &                         # :8765, no-cache
    cd tests && CHROME=$(node -e "console.log(require('playwright-core').chromium.executablePath())") node run.cjs
`SZ_URL` overrides the base URL (default `http://localhost:8765/index.html`). Results are printed as PASS/FAIL lines, and the exit code is non-zero on failure. Keep `tests/last-run.txt` updated with the latest output. As of 2026-11-10: 50/50.
Blocks: 1 boot/lobby/flow, 2 every mission winnable (WIN helper), 3 fails/revive/double XP, 3b upgrades, 4 breach/barrels/intel, 5 shop/pass/profile/charm/spray, 6 touch HUD at 3 sizes, 7 perf budget, 8 story data/radio, 9 tutorial.
The `open()` helper seeds localStorage (`progress`, `profile`) through an init script and collects pageerrors and console errors into `pg.errors`.

## URL flags
`?test=1` (API + no SDK + debug), `?debug=1` (all unlocked; F7 clock to 0.5 s, F8 teleport to the next objective, F9 kill all), `?touch=1`, `?noarch=1`, `?brief=1`.

## `window.__game` API (game.js, end of file)
- `ready`: true once assets have loaded. `errors`: window error messages.
- `MISSIONS, WEAPONS, ABILITIES, META, TUT`
- `state`: running, matchOver, clock, mission, hp, shield, pos, onGround, weapon, ammo, reloading, enemies[{type,alive,hp,state,pos,blind,revealed}], objective, zones, picks, abilityCD, stats, fps, end, ...
- `start(i, {route, primary, sidearm, abilities, tutorial})` (with ?test=1 the tutorial runs only when `tutorial:true`), `openBriefing(step)`, `openLobby`, `openShop`, `openPass`, `openProfile`, `revive`, `doSpray`, `detonateBarrel`
- Clock: `step(seconds, fps=30)` runs update() deterministically, then one render(), and switches to manual mode. `auto()` returns to rAF.
- Input: `key(code, down)`, `mouse(btn, down)`, `look(yaw,pitch)`, `lookAt(x,y,z)`, `teleport(x,y,z)`, `equip`, `reload`, `ability(slot)`, `fire()`
- Cheats: `killAll()`, `peace()` (freeze AI), `damage(n)`, `timeout()`
- Introspection: `map` (points, extract, ...), `player`, `enemies`, `world`, `scene`, `renderer`, `camera`, `info` (draw calls, tris, q, fps), `prof`, `breaches`, `medkits`, `barrels`, `intel`, `matchXP`, `charm`, `sprays`, `tutorial` (`.step`, `.steps`, `.active`), `mentor`, `preview`, `setQuality('high'|...)`
- Mission completion recipe: `WIN()` in tests/run.cjs (killAll, teleport to each point, hold KeyE, step). Ending: `state.end`.
- Tutorial replay: `__game.start(0, {tutorial: true})` or `window.__replayTutorial()`.

## Tools
`tools/bench.cjs`, `bench2.cjs` (deterministic update/render ms), `prof.cjs` (CPU profile), `shots_maps.cjs`, `maps.cjs` (map screenshots), `build_dist.sh`, `setup_cloud.sh`.
