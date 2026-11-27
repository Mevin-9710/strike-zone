# Architecture
No bundler. `index.html` loads `game.js` as an ES module with an import map (`three` -> `lib/three.module.js`).
Everything is served statically, so you must use `tools/serve.py` (no-cache) to avoid stale modules.

## game.js (~1440 lines, the hub)
- Config `CFG`, the `ABILITIES` table, and the `MISSIONS` array (m1-m3 use hand-built maps; m4-m12 use `buildDistrict(proc)`).
- Persistence through `localStorage` keys `sz_progress`, `sz_loadout`, `sz_settings`, `sz_profile` (meta.js), `sz_tutorial_done`.
- `loadAll()` loads models, weapons, props, Kenney kits and arch kits, and drives the loading bar.
- `buildMission(i)` builds the collision world, the scene and the nav graph, then places enemies, medkits, breaches, barrels, intel and Kenney dressing. `startMission` runs a midgame ad, then calls `startMissionNow`.
- `update(dt)`: player movement (walk/run/slide/jump), weapons, abilities, objectives (defuse / plant_hold / retrieve+extract), enemies, tutorial, mentor, radio, medkits. `render()`. `frame()` runs the rAF loop, which also does dynamic resolution and quality.
- UI: lobby, briefing step flow, shop/pass/profile, pause, end card (debrief, XP, rewarded double-XP and revive, upgrades). `updateHud` uses a DOM write cache.
- `window.__game` test/debug API at the end of the file (see testing.md).

## game/
| Module | Responsibility |
|---|---|
| enemies.js | `ENEMY_TYPES`, rigged enemy models, bone hitboxes, nav-graph AI (patrol/alert/strafe/aim tell/stagger), difficulty |
| weapons.js | `WEAPONS` stats, `PRIMARIES`/`SIDEARMS`, first-person `Viewmodel`, `weaponInfo` |
| meta.js | XP/levels, battle pass, charms and sprays shop, story `UNLOCKS`, intel `FILES`, weapon upgrades |
| tutorial.js | 14-step guided tutorial (forced on the first mission-1 run) |
| mentor.js | Amara mentor bot used in the tutorial |
| radio.js / story-data.js | Radio queue, briefings, debriefs, event chatter, speakers |
| feel.js | Damage numbers, kill banners, streaks, XP pops, objective arrow, vignette |
| audio.js | Audio engine: mixer buses (sfx/music/ui/ambience), per-arena reverb, ducking, distance falloff, 10 sampled guns, adaptive streamed music (menu/match/final minute), arena ambience, volume + mute settings (sz_audio). Assets: sfx/ via tools/import_audio.sh |
| touch.js | Touch stick/look/buttons, `isTouchDevice()` (`?touch=1` forces it) |
| crazy.js | CrazyGames SDK v3 wrapper (see crazygames.md) |
| toon.js | Toon shading and ink outlines |
| menu-flow.js | Play steps: Mode, Mission, Agent, Loadout, Deploy |

## world/
| Module | Responsibility |
|---|---|
| collision.js | AABB/ramp colliders, capsule movement, rays, LOS |
| kit.js | City kit pieces (buildings, stairs, props) and their colliders, merged per material at `finish()` |
| maps.js | Hand-built maps `buildM1..3`, `LIGHTING` presets |
| procgen.js | Seeded districts around hubs (tower/vault/compound), breach walls, intel caches |
| kenney.js | Kenney prop atlas (one draw call) and `dressMap()` decor scatter |
| kenney-arch.js | Kenney building facades/stairs/awnings (visual only; `?noarch=1` turns them off) |
| textures.js | Procedural textures |

## fx/abilities.js
`AbilityFX`: smoke, flash, dash, sensor, shield, decoy, lockdown, drone effects, spawned at the animation release frame (`RELEASE_AT`).

## Budgets
Under 20 MB download; the target GPU is Intel HD 2500 at 60+ FPS (districts ran at 70-85 FPS before). The suite caps draw calls under 350 and triangles under 600k. Hot paths must be allocation-free.
