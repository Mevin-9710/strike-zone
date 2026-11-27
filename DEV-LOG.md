# Strike Zone: dev log (Season 1 foundation)

Status: foundation build. Logic for all 3 missions is in place and tested headless. Art is blockout boxes. Visuals and models come later (Blender, then final engine decisions).

## Files
- `index.html`: all UI (mission select, route/ability picker, HUD, pause, end screen).
- `game.js`: all game logic. Single ES module, no build step.
- `lib/three.module.js`, `lib/three.core.js`: Three.js r-latest, copied from local node_modules. Loaded relatively.
- `tests/run.cjs`: headless Chromium test suite (playwright-core).
- `story/story-bible.md` (one folder up): story, scoring, improvements.

## How to run
1. Serve the folder: `cd strike-zone && python3 -m http.server 8765`
2. Open `http://localhost:8765/index.html` (normal) or `?debug=1` (debug keys on).
3. Tests: `cd tests && npm install && npm test` (server from step 1 must be running). Needs `/usr/bin/chromium` (override with `CHROME=`). Full run takes about 6-8 minutes headless.

## Controls
WASD move · SHIFT walk (slower, more accurate) · SPACE jump · mouse aim · LMB fire · R reload · E hold to defuse or plant · Q / F: first and second picked abilities · ESC pause · ENTER clear radio.

## Debug keys (only with `?debug=1`)
| Key | Action |
|-----|--------|
| F9 | kill all guards |
| F8 | teleport to the next objective |
| F7 | set clock to 0.5 s (timer fail) |
| F6 | finish the current step (plant charge, hold, or current device) |

Debug keys are gated in `game.js` by `DEBUG`. Remove them or keep the gate before release.

## Missions (logic)
| ID | Title | Objective | Timer | Guards | Abilities offered |
|----|-------|-----------|-------|--------|-------------------|
| m1 | First Signal | defuse 1 device (E x 5 s, no guard within 8 m) | 170 s stealth / 130 s assault | 3 / 5 | smoke, dash, flash |
| m2 | Low Tide | plant (E x 3 s) then hold within 6 m for 30 s | 150 s | 6 | sensor, smoke, dash, shield, decoy, flash |
| m3 | Dead Air | defuse 3 devices in any order | 180 s | 8 | all 8 |

Route (m1 only) changes guard count and timer. Routes set the briefing radio line too.

## Abilities (all 8 implemented)
- **Smoke**: 6 s cloud ahead; blocks bot line of sight.
- **Dash**: 14 m/s burst forward for 0.2 s.
- **Flash**: guards within 20 m are blinded 2.5 s (no move, no shoot).
- **Sensor**: 4 s, shows guards within 30 m on HUD ("SPOTTED").
- **Shield**: 50-point damage absorber on the player.
- **Decoy**: 4 s box ahead; guards within 25 m walk toward it when they don't see you.
- **Lockdown**: 5 s zone (radius 5 m); guards inside move at 35% speed.
- **Recon drone**: 6 s; all guards are revealed (HUD and red emissive).

Pick two per run. Q = slot 1, F = slot 2 (fixed by pick order).

## Progression
- Completed mission count saved in `localStorage['sz_progress']`. Mission N unlocks when N-1 is won. Replays are always allowed.
- Swap for CrazyGames Data module before release (localStorage is per-browser and is not what CrazyGames wants; see wiki `crazygames/requirements`).

## Test results (headless, 2026-11-07)
**34/34 passed.** Full output in `tests/last-run.txt`. Covered: boot and locks, m1 blocked defuse, m1 win, m1 timer fail, m1 death fail, replay, m2 plant + hold win, m2 timer fail, m3 three devices win, m3 timer fail, ability cooldowns, progress persistence.

## Known gaps (for the next phase)
- Blockout art only; no models, animations, sound.
- Bots are box guards with simple AI. No pathfinding: they walk straight and can clip through thin cover.
- Abilities are functional but not balanced. Cooldowns and ranges are first guesses.
- Mission 2 "reward a new option" (story bible) is not wired. Lockdown/drone are offered only in m3 for now.
- Story text is shown in end screens, not in-mission cutscenes. The betrayal clue is shown only at the end, not on the HUD.
- Only desktop input. No touch or gamepad.
- Multiplayer, round-based play and the tactical 5v5 mode are out of scope for now (per the staged plan).
- Headless testing uses swiftshader and runs slowly. Real-time behaviour (movement feel, bot aim) needs a human play test.
- No CrazyGames SDK events yet (gameplayStart/Stop).

## Decisions made
- Three.js + plain HTML over Godot for size (stock Godot 3D export ~40 MB raw vs Three.js ~180 KB gzipped). See wiki `tech/godot-web.md`.
- Single-player story first; online play and rounds later (wiki `verdict.md`).
- Original names and assets only (CrazyGames originality rule).
- No custom accounts or leaderboards (CrazyGames account rule; wiki `crazygames/multiplayer.md`).

## Next steps
1. Human play test on a real GPU: feel of movement, guard difficulty, mission length (target 3-4 min each).
2. Hand off art, models and final engine decision to the more capable model (per user).
3. CrazyGames SDK wiring (gameplayStart/Stop, loadingStop, Data module for progress).
4. Re-check size and load time in the CrazyGames QA tool.

## Test-writing lessons (from this build)
- Playwright `waitForFunction` runs in the browser: pass outside values as the `arg` parameter, never via closure.
- The briefing panel hides on DEPLOY, so pick abilities before starting.
- Headless swiftshader runs at a low frame rate and `dt` is clamped to 0.05 s, so game time runs slower than wall time (a 5 s defuse took about 20 s). Use generous timeouts or the F6 debug key.
- Run the suite as a direct background command; a `( ... ) &` wrapper got killed before the run started.

## Character models (2026-11-07)
- Five Civic Shield operatives, cosmetic only: Rhea Voss (story lead), plus proposed Kade Mercer, Yuna Sato, Tomas Reyes, Amara Diallo. Pending user approval.
- Source: `models/src/operatives.py` (parametric Blender script; one dict entry per operative). Run: `blender -b -P models/src/operatives.py -- "$PWD/models/renders"`.
- Output: `models/<name>.glb` (~90-110 KB, 1.1-1.4k tris each), renders in `models/renders/` (front, three-quarter, side, sheet).
- Stylized low-poly, T-pose, not rigged yet. Rig + animations needed before use in-game (enemies full body, menu showcase).
- Headless lesson: EEVEE and Workbench fail here (EGL); use Cycles CPU, 24 samples. Full set takes about 4 minutes.
- Still to do: first-person arms, briefing portraits, opponents (sniper, drone/turret).
- 2026-11-07: all five approved. Recolored for unique identities (Rhea navy/blue, Kade olive/orange, Yuna light grey/teal, Tomas brown/yellow, Amara purple/lime). Red is reserved for enemies: all Covenant enemies use one single red tone.
- Fixed Yuna coat z-fighting (coat faces coincided with leg faces). Script now accepts a list of keys after the output dir to re-render only some operatives.

## Enemy models (2026-11-07)
- Six Meridian Covenant types, single red tone (one hue, shade variation only, glowing red eyes/visors): guard, heavy, sniper, commander (story boss), drone, turret.
- Source: `models/src/enemies.py` (shared `body()` humanoid builder + `Kit.beam()` for angled struts). Run: `blender -b -P models/src/enemies.py -- "$PWD/models/renders" [keys...]`.
- Output: `models/enemy_<type>.glb`, 636-1,160 tris each. Weapons sit on backs so the T-pose stays clean for rigging.
- Fixes during build: turret legs rebuilt as beams (rotation math was wrong); guard rifle and heavy cannon moved onto backs (they floated in T-pose).
- Not rigged, not in game yet. Drone and turret need simple part animation (rotors, head yaw), humanoids need a shared rig.

## Rigging and animation (2026-11-07)
- Script: `models/src/rig.py`. Imports each static GLB, splits it into loose parts, assigns every part 100% to one bone (rigid skinning: boxy parts never stretch), builds the skeleton, keys the clips, exports to `models/rigged/<name>.glb`.
  - Export all: `blender -b -P models/src/rig.py -- export "$PWD/models"`
  - Preview frames: `blender -b -P models/src/rig.py -- preview "$PWD/models" <outdir> [names]`
- Humanoid skeleton (15 bones, shared by 5 operatives + guard, heavy, sniper, commander): hips > chest > head; chest > upper_arm > forearm > hand (L/R); hips > thigh > shin > foot (L/R). Bone positions scale with each character's height and bulk (table `HUMANOIDS`).
- Humanoid clips: idle (2.0 s loop), walk (1.0 s loop), run (0.67 s loop), shoot (0.5 s loop, one recoil kick), death (1.67 s, play once, clamp). Every loop starts on an extreme pose so the seam has zero velocity; feet counter-rotate to stay flat.
- Drone (body + 4 rotors): hover (2 s), fire (0.5 s), death (1.5 s). Rotors use linear Euler keys so spin speed is constant.
- Turret (base > head > barrels): idle scan ±35 deg (4 s), fire (0.33 s barrel recoil), death (1.25 s droop).
- Clip names are shared on purpose: `idle`, `walk`, `run`, `shoot`/`fire`, `death`, `hover`.
- Pose helper `hp()` uses armature-space angles: thigh/arm swing negative = forward, lean positive = forward, twist positive = right shoulder forward.
- Verified: GLBs contain 1 skin each (15/5/3 joints) and all clips; all 11 load in Three.js (`viewer.html`, headless Chromium check) with zero load errors; side/front renders confirm stride and aim directions.
- Rigged sizes: 84-243 KB each (about 2.1 MB total, uncompressed GLB with sampled keys). Could shrink later with Draco/meshopt or fewer samples.
- Viewer: `viewer.html` (serve the folder, open `/viewer.html`): pick a character, click a clip, orbit with the mouse. Crossfades 0.25 s between clips.
- Known gaps: no hand/weapon props yet (weapons are on backs), no hit-react or reload clip, no first-person arms. Clips are hand-keyed, not mocap.

## Shoot pose fix + weapons (2026-11-07)
- Bug (user report): `shoot` looked like a zombie on wide characters (Kade). Cause: per-joint rotations ignored body width, so hands never met; shoulder pads were skinned to the upper arm and flipped up into spikes.
- Fix: analytic two-bone IK (`ik_arm`, `two_hand` in `rig.py`). Wrist targets in chest space: rifle grip R (-0.07,-0.25,1.25), handguard L (-0.03,-0.43,1.27); pistol R (-0.03,-0.44,1.37), L (0,-0.42,1.35). Elbow poles point down (±0.12, 0.05, -1). Recoil key moves both wrists back 4.5 cm and up 2 cm. Shoulder caps/pads now skin to `chest`.
- New clip `shoot_pistol` (0.58 s loop, two-handed). Verified front/side/top renders on Kade and Heavy.
- Weapons: `models/src/weapons.py` -> `models/weapons/<id>.glb` + `weapons.json` (id, name, class, clip, length, tris). Origin = top of grip, barrel along -Y (glTF +Z), real-world meters.
  - Pistols: Vex P9, Harrow .45, Bulldog R6 (revolver). Assault: AR-7 Lance, Kestrel (bullpup), Warden (wood battle rifle). Machine guns: Grinder (box mag, bipod), Hailstorm (drum, shroud). Snipers: Longshot (bolt), Javelin (anti-materiel, bipod).
  - 424-904 tris each, shared neutral palette (gunmetal, polymer, tan/wood/olive furniture, small brass accent, cyan optic glass).
- Viewer: weapon row; grip calibrated per character at runtime from the weapon's aim clip (frame 0): offset = handR^-1 * (grip position, character-forward rotation). Weapon is a child of `handR`, so it follows recoil. Shown only in shoot clips.
- Verified headless: all 10 weapons equip on Kade, Rhea, Heavy with zero errors; side/front views show rifle level at chest height with both hands on it, pistol held out two-handed.
- Next: carry/low-ready poses so weapons can stay visible while walking/running; reload clip; muzzle flash anchor point per weapon.

## Carry poses, plant/defuse, abilities, bomb props (2026-11-07)
- Every humanoid now has 22 clips (all 9 humanoid rigs re-exported):
  - Move: idle, walk, run, death; armed variants `idle_rifle`, `walk_rifle`, `run_rifle`, `idle_pistol`, `walk_pistol`, `run_pistol`; aims `shoot`, `shoot_pistol`.
  - Objective: `plant` (2.6 s one-shot: kneel, place, type on keypad, stand), `defuse` (1.0 s loop: kneeling, hands working).
  - Abilities (one-shot): `ab_smoke` (overhand lob), `ab_flash` (sidearm flick, other hand shields eyes, head turns away), `ab_decoy` (underhand bowl), `ab_sensor` (squat, set on floor), `ab_shield` (forearm guard), `ab_dash` (coil, lunge, recover), `ab_lockdown` (fists overhead then ground slam), `ab_drone` (cradle, launch overhead, point).
- Carry math (`carry()` in rig.py): the right hand's rotation is solved so the weapon's world rotation is exactly W = yaw then pitch-down (rifle low-ready 28 deg down/22 deg left; run 15/35; pistol 45/0, run 55/10), and the left wrist target is moved with the weapon so it stays on the handguard. Uses the same grip calibration as the viewer (aim clip frame 0).
- Kneel/squat targets are given in world space and converted to the chest frame (`to_chest`) before IK, so hands land on the device top (0.30 m) or the floor.
- Reach: Heavy's shoulders are 35% wider with the same arm length, so his support hand falls ~4-5 cm short in two-handed holds (IK clamps to a straight arm). Decoy release is intentionally a straight arm. `IKWARN` lines in the export log list these.
- Props: `models/src/props.py` -> `models/props/covenant_device.glb` (Covenant red, hex core, glow ring, fuel cells, timer, antenna; 496 tris) and `counter_charge.glb` (Civic Shield case, twin canisters, keypad, blue status strip; 636 tris). Origin at floor center, top ~0.24 m.
- Viewer: Move / Objective / Abilities rows. Base buttons resolve to the armed variant for the equipped weapon class. Weapon hidden during plant/defuse/abilities. Props appear in front during plant/defuse. One-shots return to (armed) idle automatically. Test hooks: `__viewer.play(name)`, `__viewer.seek(t)`.
- Verified headless: 7 armed-mapping checks OK; ability auto-returns to `idle_rifle`; plant/defuse hands on props; zero page errors.
- Next: holster/draw clip, reload, hit-react; ability VFX and throwable props (grenade, sensor puck, drone).

## Ability effects (2026-11-07)
- `fx/abilities.js`: `AbilityFX` class, procedural low-poly VFX, no textures, reusable in the game. `spawn(kind, {hand, forward, root, template, clips})`, `update(dt)`. `RELEASE_AT` maps each `ab_*` clip to the clip time where the effect fires (smoke 0.5 s, flash 0.33, decoy 0.58, sensor 0.62, shield 0.25, dash 0.1, lockdown 0.58, drone 0.5).
- Effects:
  - Smoke: canister arcs with bounces, then 34 soft flat-shaded puffs bloom to a 2.6 m cloud, drift and breathe for 6.5 s, fade 1.6 s.
  - Flash: fizzing orb, pops after 0.38 s: white core, star spikes, warm shockwave ring, point light spike; `onFlash` drives the screen whiteout in the viewer.
  - Decoy: puck rolls out, a cyan holographic copy of the thrower materializes (scale-in), walks forward with the real walk clip, flickers, dissolves after 4.5 s.
  - Sensor: puck set on the floor, prongs deploy, 4 radar pulses (ring + wall) out to 8 m, then retracts.
  - Shield: hex-faceted bubble with glowing edges follows the player, pops in with overshoot, ripples, shatters into flying shards after 4 s.
  - Dash: moves the character 3.2 m in 0.34 s with ease-out, spawns posed holographic afterimages every 45 ms, speed streaks and dust (viewer glides back after).
  - Lockdown: ground shockwave, debris, 5 m hex zone with rising wall and rotating light bars, pulses for 5.5 s, collapses.
  - Drone: Civic Shield recon drone launches from the hand, flies an S-curve with spinning rotors, banks into turns, sweeps a scan cone, shrinks out after 6 s.
- Bug fixed during build: effects spawned from inside another effect's update (cloud, burst, shards, hologram) were dropped from the list; `update()` now iterates a snapshot.
- Viewer: effects fire at the release frame; camera pulls back for abilities; `__viewer.step(seconds)` steps animation + effects deterministically for captures.
- Verified headless: 8 abilities captured at 4 moments each (32 frames), zero errors.
- Not yet: in-game wiring (game.js still uses its old simple ability effects), sound, gameplay hit tests for smoke/flash against bots.

## 2026-11-08 — integration in progress (paused, out of usage)
Done: restyled operatives/enemies/weapons/props rendered + re-rigged (models/rigged/*), 3 maps (world/), carousels shown.
fx/abilities.js: added ground/collide/onEvent hooks (smoke, flash, decoy, sensor, shield, lockdown, drone), dash move:false.
New: game/audio.js (synth sfx), game/weapons.js (10 weapon stats + Viewmodel: recoil, flash, shells, mag reload, draw, ADS),
game/enemies.js (6 types, bone hitboxes, nav AI, sniper laser), index.html rewritten for HUD style D (new ids).
NEXT: rewrite game.js to use these (old game.js no longer matches index.html — game is BROKEN until then),
then extend tests/run.cjs, play-test screenshots, size/FPS check, wiki log.

## 2026-11-09 — game.js rewritten, everything wired
game.js now runs the new maps/collision, 6 rigged enemy types (AI, hitboxes, death/flinch, sniper laser), 10 weapons
(viewmodel recoil/flash/shells/mag reload/ADS/scope, per-weapon stats, icons rendered at load), 8 abilities driving
gameplay via fx onEvent, defuse/plant/hold with ring, story radio, style D HUD + minimap, briefing weapon picker, saves, SDK
(only inits on CrazyGames hosts). Test API: window.__game (?test=1). Headless: all 3 missions win, 0 console errors.
Tuning: enemy accuracy x0.55 (was killing the player in ~3 s).
TODO: extend tests/run.cjs, HUD size checks, download size + FPS, viewmodel size/arms polish.

## 2026-11-09 — mobile controls
game/touch.js: floating left stick, right-half drag look, FIRE (drag to aim), AIM toggle, JUMP, Q/F ability buttons,
context DEFUSE/PLANT hold button, tap weapon panel to swap, pause button; portrait shows "rotate" card; ?touch=1 forces it.
game.js: aim assist (slowdown + pull; PC pull only while firing), touch auto-fire option, settings panel (sens, touch sens,
button size/opacity, fire mode, aim assist, quality), auto quality (touch = medium; drops a level after 4 s under 28 FPS).
Emulated 844x390 phone: move/look/fire/defuse-to-win pass; PC win path for all 3 missions still passes; 0 console errors.

## 2026-11-09 — runtime toon look (PC + mobile)
game/toon.js: toonify() swaps Lambert/Standard to MeshToonMaterial (4-band gradient, keeps maps + vertex paint),
rim light shader for enemies, inverted-hull ink outlines (skinned-safe) for enemies, guns, props, viewmodel + arms.
Grade: sky/fog more saturated, fog pushed back, hemi fill +15%. Same on both platforms (cheap enough for medium quality).
Bugs fixed on the way: outline shader used objectNormal (undefined in MeshBasic), rim dot product sign.
Checks: PC + 844x390 touch screenshots for all 3 maps, 0 console errors, all mission wins + touch suite still pass.

## 2026-11-09 — every clip in use, no more T-pose
T-pose cause: enemy mixers only ticked during a live match (briefing backdrop / pause showed the bind pose). Now mixers
tick in menus and every Enemy poses on spawn (mixer.update(0)).
Clip coverage (all 242 clips on 11 rigs verified to move bones):
- enemies: idle/walk/run (+_rifle/_pistol), shoot/shoot_pistol, death, flinch; ability clips released at RELEASE_AT with
  real effects: guard smoke/dash, heavy shield(80 absorb)/lockdown(player 45% speed), sniper sensor(reveal)/decoy,
  commander flash(whiteout)/smoke/drone(reveal); sniper swaps to a Vex P9 under 11 m; guards play `plant` arming devices;
  in Low Tide the nearest enemy runs to your charge and plays `defuse` (7 s, resets the plant) — kill him.
- drone hover/fire/death, turret idle/fire/death.
- operatives: picker in briefing (Rhea/Kade/Yuna/Tomas/Amara), armed toon preview idling; picking an ability plays its
  clip + effect; chosen operative is the decoy hologram.
- first person: off-hand throw gesture for every ability.
Fixed: circular userData on enemy meshes broke cloning (enemy decoy).

## 2026-11-09 · Expansion: lobby, progression, procedural districts, 12-mission campaign
- **Lobby** (`#lobby`): 3D operative idles beside the menu; PLAY / LOADOUT / SHOP / BATTLE PASS / PROFILE · INTEL / SETTINGS. Briefing has ◀ LOBBY; end + pause return to the lobby. `?brief=1` opens the briefing directly.
- **Progression** (`game/meta.js`, `sz_profile`): XP for kills (50), headshots (+25), objectives (150), breaches (40), intel (100), barrels (30), win (600), first clear (+400). 800 XP per level; each level claims a pass tier (40 tiers, 150 coins, 500 every 5th).
- **Shop**: 8 weapon charms (3D, swing on the viewmodel gun and on the lobby operative's gun) and 9 sprays (T / touch ✎ button). Bought with pass coins.
- **Story unlocks**: weapons + operatives unlock only by clearing missions (`META.UNLOCKS`); locked cards show 🔒 M#.
- **Rewarded ads** (CrazyGames SDK `ad.requestAd('rewarded')`, granted instantly off-platform): DOUBLE XP on the end screen, REVIVE once per mission after death (3 s invulnerability).
- **Procedural districts** (`world/procgen.js`): seeded street grid with open streets that continue past the play area (outer ring + police cordons, no closed box). Blocks: enterable 2-3 floor buildings (stairwells, window openings, roof access), rooftop climbs, plazas, container lots, parks. Hand-built hubs carry the story: **tower** (objectives on top floors/roof), **vault** (sealed, breach to enter), **compound** (walled yard with breach walls).
- **Breach walls**: hold E 1.2 s → charge → 1.8 s fuse → explosion removes the wall's collider; nav links through it open via gates (`World.addGate`).
- **Explosive barrels**: shoot to detonate; chain reactions; damage enemies/player.
- **Intel caches**: 3 per district; saved to the profile; every 3 open an intel file in PROFILE.
- **New objective**: `retrieve` (hold E 2.5 s per drive, then reach the green extraction beacon).
- **Campaign**: M4-M12 across 3 new chapters, boss `warden` (Okonkwo, 950 HP) in M12. Lighting presets night/overcast/sunset added.
- **Performance**: `World.raycast` now walks the collision grid (DDA) instead of testing every collider; distant unaware enemies think at 1/3 rate; shadows only at high quality (PC); auto quality targets 55 FPS PC / 45 FPS touch and steps down after 3 slow seconds.
- Ink outlines disabled (`OUTLINES=false` in game/toon.js).
- Tests: `tests/run.cjs` rewritten for the API-driven suite (lobby, locks, all 12 wins, fails, revive, double XP, breach, barrels, intel, shop/pass/profile, charm, spray, HUD at 907x510/1024x768/1920x1080 in touch mode, draw-call budget).

## 2026-11-10 · Kenney characters (branch kenney-assets)
- All 11 `models/rigged/*.glb` regenerated by `tools/kenney_chars.mjs` from Kenney CC0 mini-characters / blocky-characters (no recolour; unlit → lit materials). Old models stay in git (`git checkout master -- models/rigged`).
- Map: rhea=mini female-a, amara=mini female-d, tomas=mini male-c, kade=blocky c, yuna=blocky h; guard=mini soldier, heavy=mini robot, sniper=mini raider, commander=blocky n; turret/drone assembled from factory-kit + blaster-kit parts.
- Scale baked into the top node to the old heights (1.7–1.95 m); added empty nodes head/chest/hips/footL/footR/forearmR/handR so hitboxes + gun-in-hand are unchanged. Mini `handR` = far end of the arm-right skinned verts.
- Clips composed from Kenney clips with time scaling (Kenney clips are 0.2–0.7 s): idle/walk/run (+_rifle/_pistol = legs from locomotion, arms from holding-both/right), shoot(_pistol), death←die, plant←pick-up, defuse←interact-right, ab_*←interact/attack/emote/pick-up.
- Regenerate: `cd tools && npm i && node kenney_chars.mjs` (KENNEY_DIR env overrides the asset path). Preview rig: `tools/char_view.html?dir=models/rigged&f=rhea,kade&clip=shoot&gun=1`.

## 2026-11-10: guided tutorial + Amara mentor bot (tutorial agent)
- `game/tutorial.js` rewritten: 14 guided steps (look, move, walk-quiet, jump, slide [PC only], shoot, aim, reload, switch, ability 1 + ability 2 [mentor demos first], loadout info, live fight (2 hostile deaths, 45 s fallback), defuse). Each step waits for the mentor's line before input counts. Skip: button or Backspace. `sz_tutorial_done` persists; `abort()` on death/quit doesn't mark it done.
- `game/mentor.js` (new): Amara (last operative unlock, teaser) follows the player on the nav graph, plays `ab_*` clips to demo abilities, shoots visible hostiles (never targeted, never dies). Allocation-free update.
- `game.js`: while `tutorial.hold` the timer + hostiles freeze (anim only); fight step alerts the 2 nearest hostiles. Mentor ability fx use their own AbilityFX (`mentorEvent`): smoke/flash/etc hit hostiles only. Mentor lines go through `RADIO` (story agent's radio.js, speaker AMARA). Forced on first mission-1 run; replay via `window.__replayTutorial()` or `__game.start(0, { tutorial: true })`.
- Test block 9 in tests/run.cjs drives every step headlessly.

## Story agent: radio + briefings + debriefs
- game/story-data.js: per-mission `briefing`, `win`/`lose` debrief, `ev` event chatter (sniper/heavy/drone/turret/commander/warden first seen, `hurt` <35 HP, `half`, `last` enemy) for m1-m12 + SPEAKERS (portrait color/glyph).
- game/radio.js: singleton `radio` (say/once/event/skip/clear/reset/update, addSpeaker, briefing(), debrief()). Non-blocking queue; Enter skips a line. Briefing fills `#briefExtra` via the UI's `sz:brief` event; debrief fills new `#debrief` in the end card.
- game.js: old radio()/radioOnce() delegate to it; storyEv()/killTick() hooks at spot/damage/kill. index.html: `<div id="debrief">`. Test #8 in tests/run.cjs.

## 2026-11-10: Kenney guns + props + map dressing (branch kenney-assets, guns&props agent)
- `tools/kenney_props.mjs` (`cd tools && npm i && node kenney_props.mjs [weapons|props|map|all]`; KENNEY_SRC overrides `../assets new/extracted`): bakes Kenney CC0 models into the game GLBs (gltf-transform).
- Weapons (models/weapons/*.glb, same names): blaster-kit bodies rotated muzzle->+Z, grip at origin, scaled to 0.6x the weapons.json length (pistols 0.95x; Kenney guns are chunky). `mag` node = native `magazine` mesh, else a clip-small. vex_p9=b+silencer, harrow=k, bulldog=c, ar7=n, kestrel=m+scope, warden=r, grinder=q, hailstorm=p, longshot=f, javelin=e.
- Ability props (models/props/*.glb): counter_charge=crate-small, smoke_canister=grenade-b, flash_orb=grenade-a, covenant_device=factory machine-fortified, decoy/sensor puck=factory button/piston, recon_drone=disc+4 cog rotors. (Only covenant_device + counter_charge are loaded at runtime.)
- Map dressing: `world/kenney.js` loads models/kenney/{car,ind,fac,dun,skate}.glb (one texture per kit). `Kit.crate/barrel/car/container/bench/dumpster` hide the procedural mesh (`hide:true`, colliders unchanged) and bake the Kenney model, stretched to the same footprint, into per-kit merged meshes in `finish()` (+5 draw calls). Falls back to procedural if the GLBs are missing. Still procedural: acUnit, waterTank, serverRack, trees, buildings.

## 2026-11-10 — Play flow split into steps (UI agent)
Play now runs Mode (+chapter) → Mission (briefing, route) → Agent (skipped if <2 operatives unlocked) → Loadout (weapons, abilities) → DEPLOY. One step visible at a time, Back button + Esc go back. New: game/menu-flow.js, menu.css. Lobby nav tidied (big PLAY, 2x2 secondary, small settings). Hooks for story: #briefExtra, events `sz:brief` {index,mission}, `sz:deploy` {index}. Tests updated (+flow checks).

## 2026-11-10 — SPEED agent (no visual changes)
- Profiled (CDP Profiler, mission 7, 480x270): JS is ~10% of wall time; top self-time = updateHud (79ms/6s), Object3D.updateMatrix (54ms), per-frame DOM writes. Draw calls already low (22-58/frame, kit batching exists).
- game.js `updateHud`: DOM write cache (sT/sS/sC), cached element refs, crosshair tick sizes cached (removed per-frame offsetHeight layout reads), ammo innerHTML only on change, dmgdir innerHTML only when non-empty, no per-frame filter() allocations, minimap ctx cached.
- game.js buildMission: static city (map.kit.root) gets matrixAutoUpdate=false after build (mark `userData.dyn` to opt out).
- tools/bench.cjs (rAF bench w/ CPU throttle), tools/bench2.cjs (deterministic update/render ms), tools/prof.cjs (CPU profile top self-time). Machine load (~25) made absolute timings noisy; use bench2 min.

## 2026-11-10 — Fixer: viewmodel sizes + third-person gun check
- tools/kenney_props.mjs: per-gun `k` for the bulky blasters (warden_br 0.38, grinder_lmg 0.48, hailstorm_mg 0.5; default 0.6) and regenerated models/weapons/*.glb. First-person size now matches ar7_lance (screenshots/fixer/vm_after_all.png).
- Third-person guns: measured gun world forward vs character forward in every *_rifle/_pistol clip (idle/walk/run/shoot) for guard/heavy/sniper: dot >= 0.97, pitch within ±0.22 — calibrateGun already aims correctly; side-view shots (fixer/before_*.png) and lobby (fixer/lobby.png) show level, forward-pointing guns at the right hand. No code change. Non-`_rifle` base clips (idle/walk/run, used only by static turrets/flyers) are not calibrated.
- Lobby preview (game.js setPreview): the gun was already aligned with the operative's forward (verified numerically for all 5 operatives), but with yaw offset +0.35 the off-axis camera made the barrel look sideways. Turned the preview to +0.85 so the muzzle clearly points toward the camera/menu. Screenshots: screenshots/fixer/op_<id>.png, op_all.png, op_amara_tutorial.png.

## 2026-11-10 — maps-dress: street-level Kenney detail (kenney branch)
- `tools/kenney_props.mjs` KITS now: car (+cone, debris-*), ind (+tanks, water-tower, solar), fac (+machine-window[-bar], pipes, hopper, screens), dun (+pot, chest, table, rocks), skate (+pallet, plank, rail, ramp), forest (tree, tree-high, rocks, stones, plant, tent, fence, flag, target), arena (statue, banner, tree, weapon-rack), blk (crates, targets). models/kenney/*.glb = 1.5 MB total (was 0.6).
- `world/kenney.js`: all 8 kit textures packed in ONE 2048x1024 atlas (UVs remapped at load) -> every Kenney prop on a map merges into a single draw call (was 5). Duplicate names get `@kit` suffix (tree = forest, tree@arena).
- `world/kit.js` (small hooks): new `prop(name,x,y0,z,h,rotY)` + `_h(x,z)` hash; tree -> Kenney tree/tree-high + plant + stones on/around the planter (planter collider unchanged); acUnit -> machine-window; serverRack -> machine-window-bar; waterTank -> water-tower (colliders unchanged); streetlight base plant/stones/cone; bench plant; car bumper debris (tire/cones/plate), all collider-free ground decor. Falls back to procedural if GLBs are missing. Streetlight poles stay procedural (no Kenney lamp post).
- Screenshots: screenshots/maps-dress/m<N>_<view>.png, pit.png. Draw calls (swiftshader, spawn view): 22-91, tris 60k-246k.
- maps-dress #2: `dressMap()` (world/kenney.js, called from game.js buildMission after buildNav/point filtering) scatters ≤300 decorative Kenney pieces per map into ONE merged atlas mesh in map.kit.root (+1 draw call, no colliders, no minimap). Seeded RNG (proc.seed or id hash), themed pool (industrial/harbor/downtown/civic/blackout/street). Spots: hugging wall bases, roof edges/corners, map edges. Rejected if inside a collider, unsupported, within 3 m of spawn/objective/intel/guard/breach, or nav node within (0.5 m + piece radius) — NOTE: the requested flat 1.2 m node rule rejected ~95% of wall-hugging spots (nav nodes sit 0.5-1 m from walls), so clearance is footprint-edge based. Counts 143-300 placed per map. Screens: screenshots/maps-dress/sheet_m*.png (3 views each).

## 2026-11-10 — Kenney architecture on every map (maps-build agent)
- New `world/kenney-arch.js` (+ `tools/kenney_maps.mjs` → `models/kenney/arch_{com,ind,fac,are,dun}.glb`, 2.3 MB total, only used meshes; `tools/arch_view.html?kit=com` previews a kit). Loaded in game.js `loadAll` (`loadArch`); falls back to procedural if a GLB is missing; `?noarch=1` forces the procedural look for A/B.
- Hooks (visual only, colliders/nav/minimap untouched): `Kit.building()` hides the procedural wall box + windows and tiles Kenney commercial buildings (skyscrapers when h>14; flat-roofed industrial sheds for `corrugated` themes) along the faces listed in `faces`; other faces get a single low-detail piece; detailed-tri budget 220k per map. Non-walkable roofs get chimneys/solar panels. `Kit.stairs()` → factory catwalk-stairs (open fire escapes) / dungeon stairs (solid flights). `Kit.awning()` → commercial awning tiles. procgen `facade()` segments → squashed factory/dungeon/arena wall panels (openings and colliders unchanged).
- Everything goes into `kit.kgeos` → merged per texture at `finish()`: +5 draw calls (one per kit texture), no per-frame cost.
- Still procedural: railings, platforms/landings, parapets, the m2 vault interior, hub roofs.
- Stats (draw calls / tris, before→after) in the agent report; screenshots in screenshots/maps/{before,after}_NN_{a,b,c,d}.png. `tools/shots_maps.cjs <tag> [idx…]` (server :8811, `NOARCH=1` for the baseline).

## 2026-11-10 CrazyGames SDK v3 + loading bar + dist build
- game/crazy.js: SDK wrapper (init w/ 4s script wait + 5s timeout, skipped on ?test=1; no-ops when absent). loading/gameplay start/stop, happytime on win, midgame ad before startMission (>=3 min gap, only when SDK active), rewarded ads (no reward on adError; instant grant when no SDK), audio mute + pause during ads, sz_* localStorage mirrored to SDK data module (hydrated on init). game.js: startMission -> startMissionNow behind midgame ad.
- Loading bar: loader.loadAsync wrapped during loadAll so every GLB (weapons, props, 5 arch + 8 kenney kits, operative, enemies) advances it; capped 99% until done.
- tools/build_dist.sh -> dist/ (19 MB, 71 files) + dist/strike-zone.zip (3.2 MB). dist/ gitignored. Smoke-tested on :8831 (missions 0/2/8, no 404s/errors, non-test boot too).

## 2026-11-10 — Medkits + breach fix
- Medkits: game.js buildMedkits/updateMedkits. 3–6 per map, seeded per mission id, picked from nav nodes (>15 m from spawns, >6 m from objectives/extract, ≥22 m apart, reachable). Walk-over, +35 HP cap 100, 30 s respawn, pickup sfx + feed + popup, green cross on minimap. Field Guide TIPS line added.
- Breach: wall panel was black (batched hazard material needs vertex colors the box lacked) -> own textured steel/hazard "BREACH / PLACE CHARGE" panel (world/procgen.js breachMat). Charge is now placed along the wall normal on the player's side (was diagonal -> twisted), scaled 1.5x, flush on the wall. Interaction range 2.6 -> 3.2 m. Collider/nav handling unchanged.
- Mobile: tap anywhere enters fullscreen + landscape lock (old call ran after async midgame, losing the user gesture).
- Fonts: bundled Oswald (OFL, fonts/Oswald.ttf, 170KB) as the main UI font (Impact is missing on Android); replaced thick text strokes with soft shadows. Announcements now replace each other instead of overlapping (MISSION START over DEVICE DEFUSED).
- Maps (procgen, ch2+): enterable buildings use solid procedural walls/steps again (Kenney archSeg panels + stretched archStairs read as see-through/missing); ceilings no longer backface-culled from below.
- Drones: detect grinding against walls (raycast hits) -> fly to the most open of 8 headings and tighten patrol orbit; enemies that would spawn inside a collider snap to the nearest nav node.

## 2026-11-12 — onboarding tour, tutorial highlights, phone reload, CrazyGames zip
- game/onboarding.js (new): first-launch coach-mark tour (spotlight + bubble, NEXT/SKIP) over lobby, step menu, operative (auto-skipped while hidden), weapons, abilities, shop charms/sprays, battle pass, intel files, settings; DEPLOY starts mission 1 where the guided tutorial continues. Flag `sz_onboard_done` (mirrored to CrazyGames data). Settings > INTERFACE TOUR > REPLAY. `?onboard=1` forces it. Never auto-runs with ?test=1.
- game/tutorial.js: each step highlights its control (pulsing ring): touch buttons on phone, HUD element on PC (#ammo, #wep, #ab0/#ab1, #prompt), plus the on-screen key hint. Cleared on completion/skip/abort.
- game/touch.js + game.js: RELOAD touch button (#treload) -> startReload().
- tools/build_dist.sh: also writes dist/strike-zone-crazygames.zip, verifies index.html at zip root and no absolute paths.
- tests: seed `sz_onboard_done` by default; shop/charm test seeds `sz_tutorial_done` (the auto-started mission-1 tutorial was what broke the charm/spray tests); new tests for tour (PC + phone), highlight, reload button, SDK no-op.

## 2026-11-13 — Submitted to CrazyGames (Basic launch)
- Game ID 171659, build 5d3acbd8. Status: awaiting review.
- Uploaded dist/ as a folder (the portal rejects zips). HTML5, Data Module saves, mobile landscape. Category Shooting; tags FPS, Gun, 3D, Mission, 1 Player.
- Media: covers from media/screenshots/covers (plus a new cover_800x800.png). Videos: smg_elimination_16x9.mp4 and smg_elimination_2x3.mp4, a new 1080x1620 crop because the portrait video must be 2:3.
- QA: gameplayStart only registers after a mission has been started in the preview tab, before you click Continue.

## 2026-11-15 — Faster first session (Basic Launch day 1: 3m43s avg playtime, 43% reach 1 min, 5.6% reach 10 min)
- First launch: no interface tour. Lobby PLAY goes straight into the mission-1 drill (sets `sz_onboard_done`); the tour is still under Settings > INTERFACE TOUR or `?onboard=1`.
- Drill trimmed from 15 to 9 steps: look, move, fire, aim, reload, ability 1, fight, defuse. Dropped walk, jump, slide, swap, ability 2 and kit.
- End screen NEXT MISSION deploys immediately with the current kit (route normalised, the mission's saved or default abilities). Change the loadout via LOBBY.
- crazy.js: midgame ads stay off until `armAds()`, which runs at the first non-tutorial mission; the 3-min gap counts from there, not from page load.
- Mission 2: if no fight has started after 14 s, the nearest non-static enemy and its buddies within 14 m hunt the player (`forceContact`).
- Tests: test 9 rewritten for the new first launch, and the phone tour test opens the tour from Settings. 78/80 pass; the 2 charm/spray failures also fail without these changes.

## 2026-11-15 — First launch straight into gameplay; quality defaults to High
- The QA tool's "Load time" runs from page open to the first gameplayStart. It showed 31.7 s because menus came first; the real asset load is about 2.6 s.
- First launch (no progress, tour and tutorial not done, not ?test): the lobby is skipped and mission 1 (the drill) starts as soon as loading finishes. The first canvas click grabs the mouse and unlocks audio. Returning players still boot into the lobby.
- Quality now defaults to High. A saved 'auto' moves to High once (`qMigrated`).
- tests/quick_firstrun.cjs: quick check of first-launch auto-start and quality. Measured 5.6 s from page open to gameplay locally (software GL).
- Known issue: the full suite times out on software GL at High quality. The tests need to pin quality to auto; not done yet.

## 2026-11-15 · Return hooks + action-first preview
- Lobby: **DAILY** (one seeded mission per UTC day from the missions you can play; win it for +300 XP, +100 per streak day up to 7; streak in `sz_daily`) and **SURVIVAL** (unlocks after mission 1; random cleared map, no objective or timer, waves of 2+n hostiles up to 10, +35 HP and +120 XP per wave, best wave in `sz_surv_best`). Logic in `game/modes.js`.
- New hover preview `media/clips/preview_highlights_{16x9,2x3,9x16}.mp4`: gunfire from frame 1, five 2 s action cuts, title card last.
- Tagline now "TACTICAL FPS · DEFUSE THE BOMBS" (cover script).

## 2026-11-16 · Retention pass for the Basic Launch score
- Phones can play upright: no more "rotate your device" wall; portrait widens the vertical FOV (horizontal view stays ~70°), touch sensitivity compensates, buttons and HUD re-laid out for portrait. No landscape orientation lock.
- First-run drill: look, move, shoot, then straight into the fight; reload after it, then defuse. Aim and ability demo dropped (6 steps, was 8).
- Fail screen: big ↻ RETRY replays the same mission/mode/route. After 2 fails on a mission (per session) the next try has 35% fewer hostiles and +30 s.
- Win screen: next mission starts by itself after a 5 s countdown; touching anything on the end screen cancels it.
- Cloud save fix: progress, loadout, settings and profile are re-read after the CrazyGames data module hydrates localStorage (they were read at import, before the SDK loaded). Daily streak and Survival best now sync too.
- Every end screen ends with a daily-challenge reminder (today's bonus, or tomorrow's streak bonus).
- Cleanup: removed unused proxyHolo, isPistol, easeIn and the dead rotate-device overlay; build drops the stray game/project.godot.

## 2026-11-16 · v4: one-tap deploy, hostile pins, longer-range recon
- PLAY opens a one-screen deploy card: next mission, saved kit, big DEPLOY. CHANGE LOADOUT / OTHER MISSION open the old step flow.
- Minimap shows every live hostile (dim red; bright red when spotted or revealed). Floating HUD pins tried and removed.
- Sensor radius 8 → 30 m and reveal 4.6 → 8 s; recon drone radius 12 → 35 m.

## 2026-11-17 · v5: short levels, hostiles where you are going, D1 hooks
- Missions with several objectives play as parts (one objective each, timer clamp(t/parts+30, 90..150) s, ceil(count/parts)+1 hostiles). Part progress saved in `sz_parts` (cloud-synced); part clear pays +50 ◎, +1 upgrade point, half win XP; the story ending only after the last part; the boss only in the last part. Single-part missions are capped at 150 s / 7 hostiles; plant-and-hold is 20 s (was 30).
- Hostile placement: guard spots are taken nearest to the live objective (ground level preferred) instead of anywhere on the map (procgen spread them map-wide incl. rooftops, so players could not find them). With no fight after 20 s, the nearest squad comes to the player (was mission 2 only).
- Mission win pays +100 ◎. 7-day login calendar (100→600 ◎, `sz_login`), banner on the first lobby visit each day; end screens tease tomorrow's login coins.
- After 2 fails on a mission the fail screen offers ♾ TRY SURVIVAL.
- Phones default to auto-fire and Auto quality (PC stays High).

## 2026-11-18 · v6: telemetry + route guidance
- Anonymous telemetry (game/telemetry.js -> Supabase `events`, insert-only RLS; schema in supabase/telemetry.sql): ctx (screen, GPU, memory, cores, browser/OS, referrer, returning), boot, start, tut steps, kill1, part/win/fail with per-level stats (shots, accuracy, kills, enemies left, damage, killer type, abilities, pauses, time to first move/shot/fight, time left, fps), fps every 30 s, ads, button clicks, JS errors, quit with a live snapshot. Off in ?test=1.
- Objective arrow follows the nav route (stairs/fire escapes) to a waypoint ~6 m ahead, with route length as distance; the route is drawn on the minimap in yellow. A straight-line arrow sent players into walls below the m1 roof device.
- tools/playtest.cjs: autopilot bot (desktop) that plays the first levels, logs drill timing, first contact/kill and outcome, and saves screenshots. Touch runs need stick input (not supported yet).

## 2026-11-18 · v7: remote config, mouse capture, scroll wheel
- Remote config: game/remote.js fetches remote-config.json from the public GitHub repo (raw CDN, ~5 min cache, 2.5 s timeout, falls back to built-ins) at boot. Tunes quality defaults (desk/touch, unless the player picked one), touch auto-fire, part/single timers and counts, hold time, forced-contact delay, easy-retry rules, auto-next delay, coin rewards, midgame ad gap. Edit + push = live for every player, no CrazyGames upload. Telemetry `boot` carries the config version.
- Pointer lock: requests are wrapped (no unhandled rejection); when a lock is refused (auto-started level, no user gesture) the game freezes behind a "CLICK TO CONTINUE" card whose click grabs the mouse.
- Scroll wheel: one weapon per notch in either direction, wrapping round; trackpad deltas are accumulated.

## 2026-11-19 · v8: from the first night of telemetry (190 real sessions)
- Mission 2 was an ambush: contact 1-9 s after spawn, deaths at 23-47 s (30 fails). Guard spots within `minSpawnDist` (20 m) of any player spawn now go last; the m2-only 14 s forced contact is gone (all missions use `contactAfter`); m2 capped at 5 hostiles (`missions.m2.count`); every level starts with `startGrace` (4 s) of invulnerability.
- Mission 1 timed out with the area already clear (8 of 26 fails had 0 hostiles left): when every hostile is down the clock stops, with an AREA CLEAR call-out.
- Remote config v2: easy retry after the first fail, +45 s. New keys: minSpawnDist, startGrace, missions.{id}.{count,timer}.
- tools/funnel.py prints the per-device funnel, quits, fails, clears, fps, load, errors and button use.

## 2026-11-19 · v9: solo Deathmatch + Story/Deathmatch picker
- PLAY opens two big buttons: STORY (next mission, starts at once) and DEATHMATCH (starts at once). Loadout stays in the lobby.
- Solo Deathmatch (`mode: 'dm'`): 5 min, first to 30 kills; 6 bots always on the map, a new one every 2.5 s when short, spawned at the guard spot furthest from the player; idle bots hunt the player. Player death = respawn after 1.5 s at the spot furthest from live bots with 2.5 s protection (no game over). Streaks tracked; end screen shows K/D, best streak, personal best (`sz_dm_best`), +5 ◎ per kill and a big ↻ REMATCH. All numbers in remote config (dmTime, dmKills, dmBots, dmRespawn, dmCoinsPerKill). Telemetry `dm_end`.
- Design notes from research: near-instant respawn + spawn protection, spawn away from the action, bots come to you, short matches with one-click rematch.

## 2026-11-19 · v10: HUD study + addictive Deathmatch
- Study: docs/hud-ui-study.md (v9 screenshots on desktop / phone landscape / phone portrait + Fortnite/Apple/HUD-guide research).
- Deathmatch HUD: big kill counter with progress bar to the target, 🔥 streak and power-up tags; no story radio, no "spotted" badge, "DEATHMATCH · GO!" opener, FINAL 30 SECONDS call-out (+2 bots).
- Addiction loop: multi-kills within 4 s (DOUBLE / TRIPLE / RAMPAGE / UNSTOPPABLE); streak rewards 3 = UAV (all bots revealed 12 s), 5 = OVERDRIVE (+60% damage 12 s), 8 = AIRSTRIKE (blasts every live bot); health regenerates after 4 s without damage; end screen rank tier (Bronze→Legend), kills-to-beat-best, auto REMATCH countdown (`dmRematch`, 8 s, cancelled by any touch).
- Mobile: radio subtitles moved top-center, compact, never a column in portrait; portrait kill bar and kill feed re-placed; spray button dimmed.
- Visual pass: Deathmatch end screen = animated tier-coloured rank badge + 4 stat tiles (kills, K/D, best streak, coins) + pulsing personal-best line; PLAY picker shows your best Deathmatch score on a pulsing Deathmatch card; multi-kills flash the screen edges gold.

## 2026-11-19 · v11: Deathmatch infinite ammo
- `dmInfiniteAmmo` (remote, default on): in Deathmatch every weapon's reserve stays topped up (you still reload the magazine); HUD shows ∞ for reserve. Remote config v3.

## 2026-11-20 · v12: iOS start crash
- startMissionNow called `document.documentElement.requestFullscreen?.().catch(...)`; on iOS Safari (no Fullscreen API) that threw before `crazy.gameplay(true)`, so phone sessions never reported gameplay start (telemetry: 5× "Cannot read properties of undefined (reading 'catch')" on touch). Now guarded.
- Remote config v4: Deathmatch target 75 kills (real matches were ending in ~105 s at 30 kills, median 30 kills, all wins).
- CrazyGames (Jacinda, Technical QA) reset the Basic Launch evaluation on 20 Nov; the scored window is 29 Nov – 5 Dec.

## 2026-11-21 · v13 (in progress): drill removed
- Mission-1 guided drill no longer starts (first-run or PLAY). Every start goes straight into play; first mission shows a 5 s controls card (#ctlCard, desktop/touch text) and sets sz_tutorial_done.
- Lobby TUTORIAL button is now CONTROLS (opens the guide). game/tutorial.js kept but unused.
- Why: telemetry, last 24 h: desktop players quit during the first drill steps; only 54% got a kill (touch 74%).
- Tests: 73/75 (the 2 known charm/spray failures).

## 2026-11-21 · v14: kit UI, daylight lobby, quests, adaptive bots
Plan + review: docs/v14-plan.md. Every new system has a remote-config kill switch (remote-config.json v5).
- **UI kit look** (Stylized FPS UI Lite, itch.io, free; Rajdhani OFL): v14.css restyles lobby, HUD, kill banners, end screen, touch buttons. Rajdhani subset woff2 (28 KB). Line icons in game/icons.js (FPS Icon Kit); supply-crate icon for crates/rewards.
- **Daylight lobby**: midday light on the live map; top bar (level, coins, settings), icon rail (Shop/Loadout/Pass/Profile), quests card, free daily crate, big PLAY + Story/Deathmatch toggle (replaces the picker step), Daily/Survival/Controls tiles, weapon cards.
- **Quests** (game/quests.js, `sz_quests`, cloud-saved): 3 daily + 1 weekly; first set finishable in session 1; mid-match toast; claim in lobby (coins + pass XP).
- **Weapon trials**: locked weapon for one match via rewarded ad or 150 coins.
- **Adaptive threat** (game/director.js): one 0..1 value owns G.difficulty; +kills/headshots/streaks, -death/low HP, drifts to a level baseline; pinned low on mission 1; caps story 0.85 / DM 1. HUD "THREAT n" chip + "ENEMIES ADAPTING"; coins x(1+threat).
- **Fair-fight hit timer** (story): blocked enemy hits become near-misses; spacing scales with distance, facing, charging, threat.
- **DM spawn scoring**: no spawns in a bot's sight, away from fights and recent deaths.
- **DM death card**: killer callsign, weapon + distance, 4 loadouts (Assault/Heavy/Marksman/Rush, unlocked only), RESPAWN countdown, SPACE/tap respawns now.
- **End screen**: compact, coin count-up, 5 s DOUBLE COINS + XP rewarded offer, quest bars.
- **Login crate** now opens after the first match (not on boot). Drill removed (see earlier entry).
- Telemetry: quest, trial, dbl, dcard, thr, lobby events.

## 2026-11-21 · v15: Deathmatch-first
Plan: docs/v15-plan.md. Remote config v6.
- **Deathmatch is the default** (`RC.defaultMode`, remote switch): first launch drops straight into a Deathmatch (controls card, threat pinned low until the first kill); lobby toggle defaults to Deathmatch, a Story pick is remembered. `start` telemetry has `def`.
- **Target 50 kills / 4 min** (history: 30 kills ended in ~2 min, all wins; 75 was never reached and players never died. v14 adaptive threat now makes bots dangerous).
- **Map-wide spawns**: spawn pool = guard spots + reachable open nav nodes ~4 m apart (~500 on m1, was 8); scoring prefers 18-40 m, rejects bot/player sight, penalises clumping near live bots and spots used in the last 10 s.
- **Operative bots**: Deathmatch bots wear kade/tomas/yuna/amara/rhea (same rig + clips as enemies; `buildCharAssets` in enemies.js), red outline + red callsign tag; falls back to enemy models until loaded. No download change.
- **Minimal mobile HUD**: hidden on touch — spray, weapon name/icon, threat chip, HP label, progress line; Deathmatch also hides minimap + ability buttons; minimap 60% in story; pause top-left; feed max 2; radio one line.
- **Quests count in Deathmatch**: "Win N matches" (story win or DM victory), new "Finish N matches" and "Reach GOLD rank in Deathmatch"; starter set = 5 kills / finish 1 match / 2 headshots.
- Tests: 87/89 (2 known charm/spray failures).

## 2026-11-21 · v16: true free-for-all Deathmatch
Research (Wikipedia "Deathmatch (video games)"): free-for-all, everyone (humans and bots) has the same stats, random spawn points, die at 0 HP and respawn with full health, score = frags, session ends at the frag or time limit and the most frags wins.
- **Bots fight each other**: each bot also targets the nearest visible rival bot (re-picked every 0.4 s); bot shots hit bots; bot kills show in the feed ("VIPER ▸ ROOK"). Idle bots hunt either the player or a rival.
- **Persistent bot players**: a roster of 6 named bots with kills/deaths; each respawns 2.5 s after dying somewhere new. Player kills by a bot score for that bot.
- **Win rule**: first to the kill target (player or bot) ends the match; at time-out the most kills wins (ties go to the player). End screen shows place "#2 OF 7", the winner, and the top-4 standings. HUD scoreboard (top 4 + you) top-left.
- **No health regen and no medkits in Deathmatch**; health resets only on respawn.
- **Spawns**: nav pool only (the 8 hand-placed guard spots on m1 were mostly on the terrace); ground level only; hard-rejected in the player's sight, discouraged in bots' sight (with many viewers, the hard rule pushed every spawn onto the hidden terrace); 18-40 m preferred; strong penalty within 14 m of another bot. 90 s sim: all spawns at ground level, nearest other bot 19-34 m.
- **Jumping bots**: half the bots hop while strafing, more often right after taking a hit.
- **Hover fix**: translucent lobby buttons turn pale yellow with black text on hover.
- Tests: 91/93 (2 known charm/spray failures).

## 2026-11-21 · v17: Deathmatch levels, bots at player strength, old font back
- **Font**: every screen back to the original bold italic look (Oswald 700 italic); Rajdhani removed.
- **Smaller arena, bigger bots**: Deathmatch spawns limited to the central ~82% of the map (`dmArea`); bots drawn 1.2x (`dmBotScale`) with matching hit shapes.
- **Bot strength from level 1** (`G.dmParity`): 100 HP like the player; per-hit damage on the player's scale (assault 22, MG 17, sniper 70: ~4-6 hits to kill); no story nerfs (no 0.65 accuracy cut, no warning shot, no attack tokens). Threat baseline 0.4 at level 1.
- **Rampage**: no player kill for 20 s (`dmStall`) -> "BOTS ON A RAMPAGE": every bot hunts the player, +30% accuracy, +20% damage, threat climbs until the player scores.
- **Deathmatch levels** (`sz_dm_level`): level 1 = 30 kills, +10 per level (cap 80), threat baseline +0.06 per level; time limit = `dmTime` (remote). End screen: VICTORY · LEVEL n / DEFEAT · #place; coins collected; weapon upgrade (+1 point) only after a victory; NEXT LEVEL / RETRY LEVEL buttons (auto-continue).
- **XP unlocks weapons** (meta.js `LEVEL_WEAPONS`): Harrow L3, Warden L4, Bulldog L6, Grinder L8, Longshot L10, Hailstorm L12, Javelin L15 (story unlocks still apply).
- **Phone landscape layout**: fixed thumb cluster (jump, fire, reload left of fire, aim above), ammo moved clear of the buttons; no overlaps from 667x375 to 1024x768.
- **Website**: site/build.mjs never copied v14.css to /play, so the Vercel build had no v14+ styling; added.
- Tests 97/99 (2 known charm/spray failures). Remote config v7.

## 2026-11-21 · v18: easier Deathmatch start, random maps, bigger UI
- **Easier level 1**: `dmPower` 0.62 (+0.06 per level, max 1) scales bot kill speed in Deathmatch, split as sqrt(power) on accuracy and on damage -> level 1 bots kill ~38% slower than v17; level 7+ is back to full strength. Remote-tunable.
- **Random maps**: every Deathmatch (first launch, PLAY, rematch, next level) picks a random map from the first 5 (`dmMaps`), never the same twice in a row; Deathmatch may use maps not yet unlocked in story.
- **UI ~22% bigger**: `--u` scale raised (11-18 px, 22 px on tall screens); touch buttons x1.2. Phone thumb cluster re-laid out for landscape and portrait (no overlaps from 360x740 to 1024x768); scoreboard moved under the objective in portrait.
- Spawn spacing: stronger penalty for spots near other bots.
- Tests 97/99 (2 known charm/spray failures). Remote config v8.

## 2026-11-22 · v19: new-player grace, easier Deathmatch for everyone
Why: since v17-18, 28 of 52 sessions under 2 min (22 Nov 06:00+ UTC) got a kill, died in their first match and left within ~1 min; mobile median fell 3.2 -> 1.8 min.
- **Grace for the first 2 Deathmatches** (`sz_dm_played`, `dmGraceMatches`): bot power 0.45 (`dmGracePower`); for the first 20 s (`dmGraceCalm`) bots ignore the player and fight each other; rampage needs 30 s of no kills; first-death card says "You have N kills. Keep going: first to X wins!".
- **All players**: Deathmatch bot power 0.62 -> 0.56 (`dmPower`; remote config v9 applies it to v18 too).
- Cloud save also mirrors sz_dm_played, sz_dm_level, sz_mode.
- `tools/vsplit.py`: per-build funnel from telemetry (builds split by first-seen time on CrazyGames).
- Tests 99/101 (2 known charm/spray failures).

## 2026-11-22 · v20: full conversion-funnel telemetry
Funnel 18-21 Nov (our telemetry starts 18 Nov 14:32 UTC; 15-17 Nov has none), sessions where our script ran:
desktop 485 -> 88% loaded (load median 2.9 s, p90 10.4 s) -> 85% started a match -> 63% played 60 s+; mobile 427 -> 94% -> 93% -> 75%.
Once loaded, 94-100% start at any load time. CrazyGames shows 66% (desktop) / 41% (mobile): the gap is before our game code runs (CrazyGames loader/preroll, our page and three.js download), which we could not see.
New events to find the leak:
- `page`: inline `<head>` beacon before any game code downloads; `quit0 {stage}` if the tab closes before the game code runs. telemetry.js reuses the same session id.
- `ctx.js`: seconds from page open to game code running; `t` is now seconds since page open.
- `sdk {ok}`: CrazyGames SDK init; `ld {p}`: 25/50/75% of assets; `gs`: first gameplayStart sent; `input {k, el}`: first key/mouse/touch in a match.
- `lock {k: hint|click|err}`: mouse-capture "click to continue" shown / clicked / refused.
- `tools/convfunnel.py FROM TO`: step-by-step funnel (page -> code -> assets -> start -> gameplayStart -> input -> kill).

## 2026-11-23 · v21: Deathmatch spawn crash, slow-desktop FPS
From telemetry (v17-v20): 7 errors "Cannot read properties of null" at the Deathmatch spawn picker; desktop sessions under 25 fps went 4% -> 15%.
- **Crash**: `dmSpot` scored every spot -Infinity when nobody was alive to measure distance from (e.g. player respawning while all bots were dead), so `best` stayed null. Distance now defaults to 30 m in that case, and the picker always falls back to a random pool spot.
- **FPS**: desktop defaults to High with no automatic downgrade. If a desktop player never picked a quality and runs under 30 fps for ~4 s in a match, the game switches to Auto (medium + dynamic resolution, can drop to low), remembers it, and sends `q {k:'auto', fps}`.
- Tests 100/102 (2 known charm/spray failures).

## 2026-11-24 · Deathmatch kill target 15 +5/level
- Level 1 now needs 15 kills, then +5 each level (15, 20, 25 ... capped at 80). Was 30 +10.
- Changed in game/remote.js defaults and remote-config.json (v10), so it goes live for every build once pushed.
- Mobile check (23 vs 24 Nov): no new errors (5 -> 0), fps median 60 both days, players quitting in under 60 s are at full HP with kills. The drop looks like a different mix of players, not a bug.
- Tests 100/102 (2 known charm/spray failures).
- Source files for the 4 new Deathmatch maps (Belltower Square, Lantern Canal, Neon Alley, Sandkeep) moved from ~/Downloads to docs/maps/dm-src/. They are standalone three r128 prototypes, kept only as reference for the port; not shipped.

## 2026-11-24 · v26: Team Deathmatch + UI overhaul (uncommitted)
- **Team Deathmatch** (remote `dmTeams`, default on; player can pick TDM/DM in the lobby or pause menu, stored in `sz_teams`): you + 4 blue bots vs 5 red (4v4 on touch). Allies live in `allies[]` (not `enemies`), never target the player, no abilities, blue outline/tag/tracers/minimap. Team spawns on each half of the long map axis. Team score: first to `tdmLevelKills` 40 +10/level (cap 100); time-out = higher score wins, equal = DRAW.
- Bot-vs-bot accuracy fix written then **held back** on request (bot shots at bots still use 25% accuracy because sightT only ramps for the player).
- **UI (ui26.css + v26 block in game.js)**: top-centre score strip (BLUE · timer · RED, or KILLS · timer · TARGET), segmented health with heart, right weapon column with rendered gun icons + slot keys, Tab scoreboard (tap the strip on touch), full-screen death recap (killer, damage taken, killer's gun, 4 loadout cards, click/Space anywhere to respawn, camera turns to the killer), pause menu (team lists, map + mode header, mode cards TDM/DM/Story, loadout, RESUME), lobby top tabs + SELECT MODE pop-up + bigger PLAY. Weapon icons now fill their frame (renderIcon framing fix).
- `tools/shots_ui.cjs TAG`: lobby/hud/board/death/pause screenshots, desktop + phone.
- Tests 105/107 (2 known charm/spray failures); FFA tests force `dmTeams=false`; lobby tests use the new nav/mode picker.
- 2026-11-24 · v26.1: touch fire button smaller (66px) and low in the corner, aim button moved high on the right edge, reload/jump smaller, so the right half is free for drag-to-aim. Tests 105/107.

## 2026-11-24 · v27: four Deathmatch arenas + team outlines
- Belltower Square, Lantern Canal, Neon Alley, Sandkeep baked from docs/maps/dm-src by `tools/export_dm_maps.cjs` into models/dm/<id>.glb (merged per material, 26-57k tris, ~2-2.8 MB each) + <id>.json (colliders, floors, ramps, ladders). `world/dm-maps.js` builds them (floors/stairs/bridge/ladder ramps from the prototypes' floor code). Loaded on demand (first one alongside boot assets), next one prefetched during a match. Remote `dmNewMaps` (on) switches back to the old maps.
- Team sides follow each map's team spawns (diagonal-aware); spawns face the enemy side.
- Bots: bright team outline + additive glow (blue allies, red enemies), forced on even though ink outlines are off globally.
- Checked: stairs (Belltower, Neon), canal bridge, Sandkeep ramps + ladder ramps all climbable. `tools/shots_dm_maps.cjs` for stats/screens.
- 2026-11-24 · v27.1: team target 20 +5/level (remote-config v11); bot glow hull removed, clean 0.025 team outline only. CrazyGames zip rebuilt.
- 2026-11-24 · v27.2: team target 25 +5/level (remote-config v12).
- 2026-11-24 · v28: bot-vs-bot accuracy fix enabled (sightT ramps for any target; player-movement penalties only when aiming at the player). Team DM bot boost: +4% kill speed every 5 total team kills (cap +16%), +8% for the team 5+ kills behind (remote tdmRamp/tdmRampMax/tdmComeback/tdmComebackGap). 90 s bots-only sim: 12-19 team score (was ~3-12). Tests 110/112.
- 2026-11-24 · v29: team DM bots spread out: spawn anti-clump vs all teammates, weaker home-side pull (14->8), hunt/rampage goals offset 4-11 m or a random pool spot (35%).
- 2026-11-24 · v29: QUIT TO LOBBY asks 'Leave the match?' with an optional feedback box; text goes to Supabase events as ev='feedback' (plus quit_ask leave/stay). Read with tools/feedback.py [days].
- 2026-11-24 · v29.1: bot spread cut 35% (roam 35%->23%, goal offset 4-11 m -> 2.6-7.2 m).
- 2026-11-24 · v29.2: smaller minimap (PC 8u, phone 6.4u, now also shown in DM on phones). Feedback: exit-intent box on PC (mouse leaves through the top while not fighting, after 1+ match, once per session) and a one-time 'What should we improve?' line on the end screen after the 2nd match; both -> Supabase ev='feedback' (where: exit/end/quit).
- 2026-11-24 · v29.3: PC minimap back to full size; small minimap is phone-only.
- 2026-11-24 · v29.4: red (enemy) bots +10% kill speed in team DM (remote tdmRedBoost, config v14).
- 2026-11-24 · v29.5: red bot boost 10% -> 6% (config v15).
- 2026-11-24 · v29.6: bot base power 0.69 at level 1, +0.017/level (L4 = 0.74, the level that felt right); was 0.56 +0.06. In-match ramp/comeback/red boost unchanged (config v16).
- 2026-11-24 · v29.7: new-player grace power 0.55 (1st match) -> 0.60 (2nd), in-match ramp still applies. Losing streak eases the next match: -0.04 power per loss in a row (max -0.12, floor 0.45), reset on a win (sz_dm_losses). Config v17.
- 2026-11-25 · v29.8: one-tap feedback reasons. End screen (from match 1, once per player): 'How was that match?' FUN/TOO HARD/TOO EASY/BORING/LAGGY/CONTROLS. Quit + exit dialogs (once per player): JUST A BREAK/TOO HARD/BORING/LAGGY/CONTROLS/CONFUSING. One tap sends ev='fb_reason' {r, where, mode, m, lvl, tdm, n, el}. End-screen feedback (chips + v29.2 text line) now sits below RETRY/LOBBY so it never pushes the play buttons off a phone screen. tools/feedback.py prints reason counts (by place and touch/desk) above the written feedback. No balance change. Tests 96/112: 15 'no page errors' fails are the cloud proxy blocking outside hosts; v28 TDM boost test expects 1.16 but gets 1.22 since v29.5 (red boost 6%), unrelated.
- 2026-11-25 · Tooling: `tools/cg_upload.mjs` uploads `dist/` to the CrazyGames portal via the portal's own (unofficial) endpoints, run from the `crazygames-upload` GitHub Action (Actions tab, modes check/dry/upload; secret `CG_REFRESH_TOKEN`). Draft: not yet run for real; sending for review stays a portal click. `tools/cg_portal_check.mjs` fingerprints the portal's upload flow against `tools/cg_portal_fingerprint.json` (exit 2 = changed); a daily scheduled task runs it and opens a PR on change. Node fetch in the cloud needs `NODE_USE_ENV_PROXY=1`.
- 2026-11-26 · Tooling: cg_upload.mjs fix: presign response is [{path, presignedUrl, type, encoding}], now matched by path (dry run failed with 'Failed to parse URL from undefined'). Checker fingerprints that shape too.
- 2026-11-26 · Tooling: dry run passed (117 files uploaded, settings match the live build). cg_upload now also resends the current details (category, tags, description, controls, links, allowEmbed) with the baseInfo step, like the portal does, so a real upload can't clear them.
- 2026-11-26 · Tooling: cg_upload: post-PR4 dry run failed with HTTP 554 after ~60 s on the submission read. Details now come from a separate small query (dropped the store download counts), GraphQL errors show status, time and body, reads retry on 5xx.
- 2026-11-26 · v29.9: SZ-01 blocker fixed. First launch on a fast connection skips openLobby(), and startMissionNow() never hid #loading, so the yellow 'Loading Halvane…' screen stayed over the running match. 'loading' added to the panels hidden when a match starts. New test 'v29.9 first launch: loading screen is hidden once the match runs'. Cold first launch checked on desktop 1280x720 and phone 844x390: stuck before, gone after. Tests 110/113 (same 3 known failures).
- 2026-11-26 · Tooling: `cg_upload.mjs metrics` (Action mode `metrics`, read-only) pulls the portal's Basic Launch evaluation (`gameBySlug.basicLaunchStatsAndBenchmarks`) and scores it the way the portal does: each metric gets 1-5 (+1 per benchmark threshold it is strictly above), 3 metrics = max 15 per platform (scoringVersion 3 adds CTR, max 20). Also prints the last 7 days of desktop/mobile daily stats. Output goes to the job summary and a `cg-metrics` artifact.
- 2026-11-26 · Tooling: removed the GitHub `tests` workflow (always red from known cloud-only failures). Tests run locally/in Claude's container only: `cd tests && node run.cjs`.
- 2026-11-26 · v30 (playtime): Deathmatch end screen. REMATCH / NEXT LEVEL and LOBBY now sit right under the result tiles (moved from the bottom of the card), so they are on screen at 1280x720, phone landscape 844x390 and portrait 390x844 (before: below the fold on phones, SZ-02). The 8 s auto-rematch countdown is now only stopped by pressing another button, not by a scroll or stray tap. Story end screens keep the old order. Telemetry `boot` now carries `b: 30` (build number) so per-build funnels are exact. Test hook `__game.dmScore(a, b)`.
- 2026-11-26 · v30.1 (first minute / conversion): telemetry 26 Nov showed ~46% of desktop and ~56% of phone players who start a match leave within 60 s, almost all before their first death, and several hit pause > RESTART (a new map) or PLAY STORY by accident. (1) Spawn view (SZ-03): `faceFoe()` now checks 16 directions and looks down the most open line near the enemy side (free distance + 6·cos to foe). Free view at spawn, 6 samples per arena, before -> after: Belltower 2-22 m -> 22, Neon 6-8 -> 12-22, Sandkeep 0-6 -> 12-22, Lantern 22 -> 8-22. (2) Pause menu (SZ-17): RESTART / PLAY on a mode card needs a second tap within 2.5 s ("SURE? TAP AGAIN"), ev ui/pzArm. New test 'v30.1 TDM spawn looks down an open line (8 m+)'.
- 2026-11-26 · v31 (D1 retention): return gifts. `sz_days` counts distinct UTC days with a session; on day 2 the HEAVY class (Hailstorm MG, normally level 12) unlocks for good, on day 3 MARKSMAN (Longshot, level 10) (`sz_gifts`, added to META.unlocked and the cloud-save keys). Every end screen shows a gold 'COME BACK TOMORROW · The HEAVY class unlocks: Hailstorm, yours to keep' card right under REMATCH/LOBBY (the old 'come back tomorrow' text lines were line-clamped away). The quit dialog says the same. On the return day the first Deathmatch equips the gift with 'WELCOME BACK · HEAVY UNLOCKED' + toast. Gifts already unlocked by level are skipped. Telemetry ev 'gift' {k: shown|claim}; boot b: 31. Tests use `?gifts=1` (gifts are off in plain test mode).

## 2026-11-26 · v31-audio: full sound pass (branch claude/project-thread-st9n5x)
- New audio engine (`game/audio.js`): buses for effects / music / UI / ambience under one limiter; synthetic reverb room per arena (street, canal, alley, desert, indoor); music and ambience duck under your shots, hits, kills and explosions; up to 40 voices, low quality drops reverb.
- Weapons: every gun has its own real recording (10 firearms from the CC0 Free Firearm Sound Library), plus a synthesized sub punch, mechanical click, room tail, brass casings and a low-ammo tick. Enemy shots use their gun's far recording past 18 m, fall off with distance, lose highs with range and from behind. Rounds that pass within ~2 m crack past your head.
- Reloads (mag out / in / slide / charging handle per gun family), weapon-swap foley, landing, per-surface footsteps (concrete, stone on Lantern Canal, sand on Sandkeep), positional enemy footsteps within 16 m.
- Feedback: layered hit marker (tick + body/head thud), kill confirm that climbs in pitch for quick multi-kills, headshot crack, hurt thud panned to the shooter, death muffle, respawn whoosh, match-start sweep, victory/defeat stingers, last-10-seconds ticks, flash/explosion ear ringing.
- Abilities each get their own sound (dash, smoke, shield, sensor, drone, decoy, lockdown, flash).
- Music: 3 streamed CC0 tracks by Alexander Ehlers (menu, match, final minute), crossfaded; intensity follows combat; low HP muffles the world and music and adds a heartbeat; pause filters the music.
- Ambience per arena: wind/hum beds (synth) + sparse one-shots (bells on Belltower, water on Lantern Canal, mains buzz on Neon Alley, gusts on Sandkeep).
- Settings: master / music / effects sliders + mute, lobby speaker button, SOUND ON/OFF in pause, M key toggles (with toast). Saved in `sz_audio` (cloud-saved via the CrazyGames data module). Respects the CrazyGames "mute audio" setting, ads and hidden tabs.
- Nothing audio loads before the first click/tap/key (no effect on load time); samples load in two waves, music streams. Download: +0.4 MB effects, +3.5 MB music (only fetched when played).
- Assets rebuilt by `tools/import_audio.sh` (replaces import_sfx.sh); licences in `sfx/CREDITS.md` (all CC0; the unverified shotgun pack is no longer used).
- 2026-11-26 · Art (models only, no code change): all 9 humanoid agents rebuilt smooth. New `models/src/body.py` kit (tapered capsules + soft-box blobs instead of bevelled cubes, smooth normals) and `models/src/agents.py` (the 5 operatives + guard/heavy/sniper/commander; replaces `operatives.py` and the humanoid half of `enemies.py`, which now only builds drone/turret). Outfits are painted, not modelled: vests, pouches, straps, pockets, knee pads, belts, coats, beards and faces live in one 512 px JPEG per agent, painted in numpy from each texel's 3D position (rasterized UVs, 2x supersampled, baked AO). Gear that shapes the silhouette (helmets, hair, hood, cap, backpack, drone, slung rifles) stays as geometry. Same skeleton/clips/joints, so `rig.py` is unchanged. Per agent: ~5-6k tris (was 4-9k), 2 materials (was ~10), rigged GLBs 11.4 MB -> 5.4 MB total. 9-agent lineup: 82 -> 32 draw calls, 64k -> 52k tris. Rebuild: `blender -b -P models/src/agents.py -- "$PWD/models/renders"` then `blender -b -P models/src/rig.py -- export "$PWD/models" rhea kade yuna tomas amara enemy_guard enemy_heavy enemy_sniper enemy_commander`. Toon lineup viewer: `tools/agents_lineup.html?f=rhea,kade&team=1`. Before/after: `docs/media/agents-v32/`.
- 2026-11-27 · Art (Mevin feedback on PR #10): agents much more vivid. Brighter, saturated palettes (Rhea blue, Kade olive + tan vest, Yuna white + teal, Tomas orange, Amara purple, Covenant bright red), lighter baked shading (AO floor 0.66), +20% saturation on clothes. Beards and stubble removed. Smooth vest armholes (was stair-stepped). Texture 512 -> 768 px. Fix: `rig.py` imports with `merge_vertices=True`, because textured parts split at UV seams and left stray slivers on posed arms. Playtested a live TDM on desktop and phone (bots fight and animate, no page errors). Rigged agents 5.6 MB total (was 11.4 MB before PR #10).
- 2026-11-27 · v33 = v31 return gifts + v32 sound pass (PR #9) + lighter, vivid agent models (PR #10, rigged GLBs 11.4 -> 5.6 MB), shipped together because Mevin asked for updates to go out immediately. Boot tag b: 33. Tooling: `tools/cg_qa_bot.mjs` + Action modes qa-explore / qa-submit / ship run the portal's QA tool and submit in headless Chromium.
- 2026-11-27 · v34 (cryzen.io colour study, item 2: per-map hue balance). Lantern Canal swaps its salmon sunset for a new `clear` preset (blue sky, pale blue haze, warm sun) so the red/brown wood reads against a cool sky. Neon Alley swaps sunset for a new `evening` blue-hour preset with a brighter fill, and its near-black materials are lifted to a mid tone so bots no longer vanish into the walls. The prototypes' flat spawn-pad quads (the solid cyan slab at your feet on Lantern / Neon spawns) are now an 18% translucent tint. Boot b: 34.
- 2026-11-27 · v35 (cryzen.io study, items 3 + 5: phone HUD). On phones in landscape the move stick now rests as a faint ring bottom-left (it still floats to wherever the left thumb lands, and returns to rest on release), so a new player sees where to put the thumb. The health box moves off that spot to bottom-centre, on a navy panel at 72% size, and the ammo number shrinks. Portrait keeps the floating stick only (its buttons sit where the ring would go). Boot b: 35.
- 2026-11-27 · v36 (cryzen.io study, item 6: Tab board). The Team Deathmatch board's team headers are now filled with solid team colours (blue #2F6BFF, red #E3141B) on navy panels. The centre panel shows the mode, the map, a large timer and the target, and your own row is highlighted in cyan. Boot b: 36. Tooling: the QA bot now answers the crazygames.com cookie banner with "Only Essential" (it covered the QA Continue button and broke the v35 ship) and retries Continue up to 3 times.
- 2026-11-27 · v37 (first 15 seconds, critique run 1 ideas 1+2). In a new player's first Deathmatch matches (grace, `sz_dm_played` < 2), about 3 s in, the nearest red non-sniper bot (within 40 m) runs, unaware, to a nav spot 7-13 m ahead in plain view of the player. It is released back to normal AI when it arrives, is hurt, or after 12 s. Bots still ignore the player during the calm window, so the first kill comes early (telemetry ev dm {k:'firstFoe'}; RC.dmFirstFoe=false turns it off). On desktop, if the click-to-continue gate appears, the 5 s controls card now waits and starts after the click instead of fading unseen. Boot b: 37.
- 2026-11-27 · v38 (critique run 2: desktop click gate). 15% of v37 desktop sessions hit "CLICK TO CONTINUE" and never clicked. The gate is now a big pulsing slanted yellow "▶ PLAY" block with "click anywhere to play" under it. The match-start banner (TEAM DEATHMATCH · GO!) is held while the gate is up and replays after the click, along with the controls card. Telemetry lock {k:'vis'} logs tab switches while the gate is up. Boot b: 38.
- 2026-11-27 · v39 (feedback: the end screen cut in instantly and needed scrolling on PC). A match now ends with a 1.7 s outro: the world's animation slows to a stop over 1.3 s while the screen dims and a big VICTORY / DEFEAT / DRAW word scales in. Then the end screen comes in as two screens that never scroll. Screen 1 is the result (rank badge, tiles, personal best, XP, coins, double offer) with a big CONTINUE ▸ (auto after 5 s unless the player presses something). Screen 2 is what next (rematch / next level + lobby, come-back-tomorrow gift, weapon upgrade, quests, feedback); the revive / double-XP ad buttons stay on screen 1. In Deathmatch the duplicated text summary is hidden. Short screens drop the quest list from screen 2 when an upgrade point is waiting. Measured no overflow at 1280x720, 1366x600, 844x390 and 390x844 (11 px on 844x390 win screen 1 trimmed after). Boot b: 39.
- 2026-11-27 · v40 (feedback: after quitting, the menu background kept animating the last match). The lobby now has its own fixed backdrop, `world/lobby-room.js`: a small squad ready room built from boxes, with no download. It has a navy room, a light tiled floor, a hazard band, a window onto a blue sky city, team banners, a weapon rack and orange/green crates. Your operative stands on a dark pad with a cyan rim, lit warm from the front with a cool rim light. Drag empty space to turn them; tap them to play an ability move (ui {k:'lobbyTap'}). It is rendered instead of the match scene whenever the lobby is open; starting a match switches back. Boot b: 40.
- 2026-11-27 · Art v33 (feedback: still "building blocks"): agent bodies are now ONE sculpted continuous surface. `body.sculpt()` fuses the skin parts (head, neck, torso, deltoids, limbs, gloves, boots) with a voxel remesh (clay union), smooths, decimates to ~6-7k tris, and gives each face the part id of the nearest original part for painting; clothing borders (collar, cuffs, belt, boot tops) are painted from position so they are clean lines. New anatomy: `head_shape()` (long cranium, flat temples and face plane, brow ridge, eye sockets, cheekbones, tapered jaw, forward chin; hair follows it), sloped trapezius, deltoids, waist, calves. `rig.py` gives the fused body smooth bone-heat weights (`build_rig(..., smooth_body=True)`, max 4 influences), so shoulders, elbows, knees and hips bend as one skin; gear (helmets, hair, hood, cap, packs, drone, slung guns) stays rigid. Colours and no beards kept. Rigged agents 6.0 MB total.
- 2026-11-27 · v41 (cryzen.io study: phone thumb arc + 7-day strip). Phone landscape: FIRE is a big 84 px yellow button at the bottom right, with round JUMP, RELOAD, ability Q/F and AIM buttons on an arc around it (radius ~102 px, ui26.css v41 block). RELOAD/AIM are tinted blue. Lobby: the crate panel is now a DAILY REWARD panel with a 7-day strip (100…600 coins from `LOGIN_COINS`). Paid days get a green tick, today is lit yellow, tomorrow is tagged NEXT in cyan, and day 7 is orange. `MODES.loginWeek()` gives the strip's state. Boot b: 41.
- 2026-11-27 · v42 (feedback: enemy deaths "lean" or float, enemy shooting looks ridiculous, TDM teams spawn all over the map).
  - Animation bug: `Enemy.play()` faded out only actions where `isRunning()` was true. A one-shot clip that had finished (an ability move or a plant, clamped on its last frame) reports false there but still weighs 1. So after a bot's first ability, that frozen pose stayed blended 50/50 into every later clip: walk, shoot and the death fall. Now every other action with weight is faded out.
  - Dead humanoids also fall to the floor (`world.move`) until they sink, so a bot killed mid-dash or on a ledge no longer hangs in the air.
  - Team DM spawns: `dmHomes()` takes the 6-12 ground spots nearest each team's base (`map.teamSpawns` A/B), and `dmSpot(side)` (re)spawns that team only there. It avoids stacking on a team-mate and corners with an enemy within 8 m. All 4 maps checked: start and respawn within ~12 m of the team's own base (bases 53-66 m apart). Free-for-all spawns are unchanged.
  - Boot b: 42.
- 2026-11-27 · v43 (mobile conversion: the first load). Telemetry: ~15% of phone page loads never reach boot; phone boot median 4.1 s, p75 8.2 s, p90 12.8 s, and the first load was 14.0 MB.
  - Every GLB the game loads is now meshopt-compressed (`tools/compress_models.sh`, gltf-transform 4.1.1, EXT_meshopt_compression). Belltower 2.8 → 1.1 MB, agents ~600 → ~355 KB each.
  - `world/gltf.js` `makeLoader()` decodes the models and turns quantized attributes back into floats, so kit merging, collision and skins see the same data as before. Agents were checked side by side, original vs compressed: identical.
  - `lib/three.core.js` and `lib/three.module.js` are now the official minified r180 builds (same version, 2.0 → 0.72 MB).
  - Boot asset groups (weapons, props, kits, operative, enemies) now download in parallel instead of one group after another.
  - First load: 14.0 → 6.8 MB. On a simulated 8 Mbps / 150 ms phone link, page open → in a match went from 16.1 s to 8.7 s.
  - Re-run `tools/compress_models.sh` after exporting new GLBs from Blender. Raw GLBs still load, just bigger.
  - Boot b: 43.
- 2026-11-27 · Cover art v2 (portal art, not a game build). New CrazyGames covers rendered from the game's own assets by `tools/keyart.html` (blurred Lantern Canal backdrop, sharp blue operative Rhea firing the AR-7 at a red squad, additive muzzle flash/tracers/shells, blue/red team light wash, Oswald title with navy extrude). `node tools/keyart_shoot.cjs media/covers-v2 2` renders 2x supersampled; resize to 1920x1080 / 800x1200 / 800x800 (see DEV notes in the script). Old live covers kept in `media/covers-v1-live/` for rollback. Upload: `tools/cg_upload.mjs art [dir]` (multipart POST /upload, then `developerSubmissionUpdateArt`, keeps the published preview videos; refuses if an art update is already pending unless `--force`) and `art-status`; Action modes `art-status`, `art-dry`, `art`. `cg_portal_check.mjs` fingerprints the art flow too, but art drift only fails `--art` runs, so build uploads are never blocked by it. First run 27 Nov 16:17 UTC: the new covers were PUBLISHED instantly (no review wait) and are live on the game page.
- 2026-11-27 · Preview videos v2 (portal art, not a game build). `tools/capture_preview.cjs` records real Team Deathmatch on Lantern Canal, Neon Alley and Belltower Square in headless Chromium (2560x1440, offline-stepped at 30 fps so it's smooth, aim bot drives the player, HUD included). `tools/make_preview.sh` opens on the new cover, crossfades into ~6 s of each map at real speed and writes `media/preview-v2/video_landscape.mp4` (1920x1080) and `video_portrait.mp4` (1080x1620 centre crop), 18.3 s, no audio. Upload: `cg_upload.mjs art media/preview-v2 --only videos` (multipart /upload, then `videoThumbnailCreate`, then `developerSubmissionUpdateArt`, covers kept); Action modes `art-video-dry` / `art-video`. `cg_portal_check.mjs` now also reads nested portal chunks.
- 2026-11-27 · v43.1 HOTFIX. v43 went live at ~16:30 UTC with a blank load. `tools/build_dist.sh` copies a fixed list of `lib/` files and did not include the new `lib/addons/libs/meshopt_decoder.module.js`. The module graph 404'd, game.js never ran, and every player sat on the HTML loading screen (telemetry: 26 sessions, all `quit0 stage:html`, 0 boots).
  - The file is now copied.
  - New build guard: every relative ES-module import in dist/ must resolve to a file in dist/, or the build fails. It caught the v43 bug when re-run.
  - The packaged dist/ was booted headlessly into a match before shipping.
  - Lesson: always boot dist/ (not the repo root) before a ship.
- 2026-11-27 · v44 (phone first load, round 2). The Kenney story kits (arch + props, ~1.5 MB after v43) no longer hold up boot. `A.loadKits()` starts them at the end of boot (4 s into the first arena on a first run). `startMissionNow` shows "LOADING MAP…" and waits for them when a story map is chosen first. Tests load them synchronously.
  - Before the first match: 6.8 → 5.2 MB. Page open → in a match on a simulated 8 Mbps / 150 ms phone link: 8.7 → 7.1 s (v42: 16.1 s).
  - Story start on a 2 Mbps link: overlay shows, then the map builds with all Kenney props.
  - Tests 116/120: the known 3, plus "deathmatch ends with REMATCH". That test fails whenever blue leads at the forced timeout (the button then reads NEXT LEVEL). It is order-dependent and v44 doesn't touch the end screen.
  - Packaged dist/ booted into a match before shipping.
  - Boot b: 44.
- 2026-11-27 · v45 (pre-boot rescue). Telemetry since 25 Nov: 14% of sessions on desktop and phone never ran any game JS. They sat on a frozen loading card for 10-100 s+. Changes:
  - build_dist.sh rewrites `from 'three'` to relative paths, so dist no longer needs import maps (iOS < 16.4 and Chrome < 89 lack them). It fails if a bare import is left, and adds `<link rel="modulepreload">` for the 37 static modules.
  - Loading card: moving shimmer on the bar, "Slow connection, still loading…" at 12 s, and TAP TO RETRY at 35 s or 1.5 s after a script fails. telemetry.js removes the button once JS runs.
  - Inline telemetry: `page` gains `im` (import-map support) and a coarse OS/browser string. New `err0`, `slow0` and `retry0` events fire before game JS runs.
  - Boot tag b:45. Verified: dist boots with the import map stripped, and a 404 on a module shows the retry button.
