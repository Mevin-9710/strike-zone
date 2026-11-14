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
- 2026-11-14: Added docs/marketing/launch-plan.md (phased launch + marketing plan).
