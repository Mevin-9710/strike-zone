# v14 plan: daylight kit UI, quests, adaptive bots, icon kit (revised after review)

## Context
- **Where we are.** The CrazyGames Basic Launch is at 6/15 on desktop and mobile; playtime and day-1 return are the weak scores. Scoring may close as early as about **27 Nov** (7 days + 500 plays from 20 Nov). Today is 21 Nov.
- **Why.** In the last 24 h only 54% of desktop players got a kill (touch: 74%), and most desktop quitters left during the drill.
- **Sources:** `docs/competitor-video-study.md`, the approved kit-style mockups (now with a bright daylight backdrop), the bot research paper (`~/Downloads/Engineering the Perfect FPS Bot…docx`), and the icon kit (`~/Downloads/fps_game_icon_kit.html`, 40 SVG icons).
- **Already done (uncommitted):**
  - The drill is removed, with a 5 s controls card instead (`controlsCard()` in game.js, `#ctlCard`).
  - The TUTORIAL button is now CONTROLS.
  - Tests: 73/75 (the 2 known charm/spray failures).

## Review: gaps found in the first draft, and fixes
| # | Gap | Fix in this revision |
|---|---|---|
| 1 | **Build size.** dist_v12 is already **19 MB** against the 20 MB limit. Kit PNGs, 3 Rajdhani TTFs and the vignette PNG could push us over. | Hard budget of **+250 KB**: Rajdhani as 2 subsetted woff2 files (~30 KB each), and Oswald removed. The kit PNGs are recompressed (oxipng) or replaced with CSS (bars and panels are flat shapes). The low-HP vignette becomes a CSS radial gradient, not a 142 KB PNG. Build size is checked as a release gate. |
| 2 | **Overlapping difficulty systems.** The existing `G.difficulty` (game.js:229, which drives tokens, accuracy and damage in enemies.js), `easyAfterFails`, the attack tokens, plus a new hit token, pacing director, skill tiers and the new kill-based ramp would fight each other. | **One owner:** a new `game/director.js` computes a single `threat` value, and everything else reads it. `G.difficulty` returns `director.difficulty()`. `easyAfterFails` stays a route modifier (fewer enemies, more time) and also lowers threat. The attack tokens keep deciding *who shoots*; the hit timer only decides *when a shot may land*. |
| 3 | **Weapon classes in the death card don't exist.** There is no SMG or shotgun in weapons.js. | Loadouts use real weapons: **Assault** (ar7_lance), **Heavy** (hailstorm_mg), **Marksman** (longshot_bolt), **Sidearm rush** (bulldog_r6 + kestrel_bp). Only weapons the player has unlocked, plus the active trial weapon. |
| 4 | **Scope against the deadline.** Shipping everything in one late build risks a broken scoring window. | **Two cuts from one branch.** Cut A (target 23 Nov): §1–5 and §6a–b. Cut B (v15, after scoring): deeper bot work, §6c–e. If Cut A slips past 24 Nov, ship what is green. |
| 5 | **No kill switches.** A bad feature needs a rebuild and re-upload. | Every new system gets a remote-config flag in `remote.js` defaults and `remote-config.json`: `v14ui`, `quests`, `trials`, `deathCard`, `adaptive`, `hitTimer`, `dmAim`, `dmSpawnScore`. Can be switched off within about 5 minutes. |
| 6 | **We can't measure the new features.** Telemetry only covered trials. | New events: `quest` (done/claim), `trial` (offer/watch/use), `dbl` (offer/watch), `dcard` (respawn-now/loadout), `thr` (threat sampled every 30 s and at death/end), `lobby` (play mode). Plus `cgmetrics.py` columns for desktop first-kill %, time to first kill, and threat at quit. |
| 7 | **Quest coins have nothing to buy.** Only a small charm/spray shop, so rewards feel empty. | Quests pay **XP toward the battle pass** plus coins. Coins get a sink: weapon trials can also be bought with coins, and the shop gets 3 more charms. A new player's first daily set can be finished in session 1 (kill 5, win 1 mission, 2 headshots), so they get a quick win. The end screen teases tomorrow's quests and login reward. |
| 8 | **The login toast depends on an unspecified CrazyGames login-prompt event.** | Show the toast on the **first lobby visit after the first match**, not on boot. No SDK event needed. |
| 9 | **The font swap breaks layouts.** Rajdhani is narrower and has different metrics, so text could overflow. | Screenshot pass on desktop at 1280×720, 800×450 and 821×462, and on phone portrait and landscape. `font-display: swap` plus preload so the first paint isn't blocked. |
| 10 | **Daylight lighting leaking into missions.** | The lobby-only sky and light preset is applied in `openLobby` and fully restored in `startMissionNow`. Test: mission lighting values match before and after a lobby visit. |
| 11 | **Licences unverified.** The UI kit images have no stated licence; the user got the pack free from **itch.io**, where every page sets its own licence. The icon kit claims royalty-free but its origin is unknown. | **Resolved:** the user confirmed the itch.io pack is free to use. Use the kit PNGs (recompressed, within the size budget), and credit "Stylized FPS UI Lite" plus Rajdhani (OFL) in the game's credits. The icons are inline SVG paths. |
| 12 | **Per-frame cost** of new DOM HUD updates and new bot code. | HUD writes only when a value changes (cached last value). Bot perception at about 5 Hz, staggered. No per-frame allocations (reuse vectors). Checked with `?perf=1` frame times. |
| 13 | **Tests depend on the removed `#pick` step and on DM timing**, which reaction delays would change. | Update the PLAY/picker tests to the lobby toggle. DM tests set `RC.adaptive=false` and a fixed skill. |
| 14 | **The desktop first-kill problem may not be fully the drill.** Pointer-lock "click to continue" friction and the first enemy spawning far away also play a part. | The first mission's first squad spawns within about 25 m along the guide path, already moving toward the player, at low threat. Telemetry for time to first kill on desktop. |

## 1. Assets (bundled locally; no CDN at runtime)
- **Rajdhani** Medium/Bold as subsetted woff2 in `fonts/`, plus the OFL licence file. Oswald is removed.
- **`game/icons.js`:** the icon-kit SVG paths with an `icon(id)` helper.
  - **Supply-drop crate:** free crate, gifts, login reward, rewards, battle-pass tiers.
  - **Skull / headshot:** kill feed and kill pops.
  - **Health / armor:** health and shield bars.
  - **Weapons:** rifle, pistol, sniper, grenade, reload, ammo.
  - **Radar:** UAV streak. **Bomb / flag / extraction:** objective pill. **Rank:** level badge. **Settings / backpack:** lobby rail. **Danger:** low time.
  - Emoji in the UI are replaced with these icons.
- **Kit PNGs:** buttons, weapon panel, HP bar and popup background, recompressed; simple bars and the vignette are CSS.

## 2. Theme (`v14.css` after `menu.css`; existing ids are kept)
- **Look:** dark translucent panels, kit yellow, `skewX(-8deg)` slanted buttons with an ink border, grey secondary buttons.
- **Daylight lobby:** the live map behind the lobby gets a midday sky and light preset and a lighter scrim (restored on mission start).
- **HUD:**
  - `#vit` is the slanted HP bar; it goes red under 30 HP with a CSS edge vignette.
  - `#wep` is the slanted weapon panel with big ammo numbers.
  - `#abil` slots are slanted, `#objp` is one dark pill with an icon, and `#feed` and `#dmBar` are restyled.

## 3. Lobby (`#lobby` markup, `openLobby()` / `chips()` / `modeButtons()`)
- **Top bar:** logo, level badge with XP bar, coins, settings.
- **Left rail:** Shop, Loadout, Pass, Profile. Then the Quests card and the free-crate tile.
- **Centre:** the existing `setPreview()` soldier.
- **Right:** "LEVEL N · mission", a big PLAY, and a Story/Deathmatch toggle (remembered; replaces the `#pick` step). Daily and Survival tiles keep the `lDaily`/`lSurv` ids; the DM best score sits on the toggle.
- **Bottom:** weapon cards, with locked ones offering a trial.

## 4. Quests and trials (`game/quests.js`)
- **Quests:**
  - 3 daily (from a pool) plus 1 weekly, reset by UTC day and ISO week. Saved in `sz_quests`, which is added to the `crazy.js` KEYS for cloud save.
  - Rewards: XP plus coins. A first-session-friendly set for new players.
  - Hooks: `fire()` kills (+ headshots), `explode` kills, `dmEnd`, mission win/part, match count.
  - A mid-match toast "QUEST COMPLETE"; Claim lives in the lobby and on the end screen.
- **Trials:**
  - A locked weapon card offers "TRY 1 LEVEL": watch an ad (`rewardedAd()`) or pay coins.
  - The weapon applies only to the next `startMission` through opts.primary, then reverts.

## 5. Feedback, death card, end screen
- **Kill feedback:** restyle `FX.killBanner` / `xpPop` and add the "+100 / HEADSHOT +50" line. `feed()` gets skull/headshot icons.
- **Deathmatch death card** (`dmDeath` / `dmTick`):
  - Shows the killer's name, cause and distance (captured where the player takes damage).
  - The real-weapon loadouts from review #3.
  - RESPAWN counts down from `RC.dmRespawn`; Space or tap respawns now.
- **End screen** (`showEnd` / `dmEnd`):
  - Stat tiles, coins counting up, the XP bar, and a 5 s "DOUBLE COINS + XP · watch ad" offer (replaces `adXP`).
  - Quest bars and a tomorrow teaser.
  - Big PLAY AGAIN / NEXT with auto-continue (`RC.autoNextSeconds`); grey LOBBY.

## 6. Bots and adaptive difficulty (`game/director.js`, `game/enemies.js`, DM code in game.js)
### 6a. Adaptive difficulty: one threat value (Cut A)
- **`threat` from 0 to 1**, mapped to `G.difficulty = 0.6 + threat × 1.0` (range 0.6–1.6, inside enemies.js's 0.25–3 clamp).
- **It rises with kills:** +0.02 per kill, +0.01 extra per headshot, ×1.5 during a 3+ kill streak.
- **It falls:** −0.12 on each player death, −0.05 when HP drops under 30 (a breather), and drifts toward the baseline over 20 s without kills.
- **Baseline** = 0.15 + 0.03 × player level (capped at 0.5). The first mission is pinned to ≤0.2 until the first kill. `easyAfterFails` lowers the baseline by 0.15.
- **Caps:** story 0.85, Deathmatch 1.0. Recomputed at most once a second, never per frame.
- **Players see it as a reward:**
  - a HUD chip "THREAT ▲ 3" with a pulse when it rises ("ENEMIES ADAPTING")
  - coins per kill scale ×(1 + threat), so a harder fight pays more
  - the end screen shows peak threat
- **Deathmatch extras:** bot skill tier = round(threat × 7). Strafing by skill: under 0.2 none, 0.2–0.4 forward and back, 0.4+ circle-strafe, over 0.7 random flips.
- **Flag:** `RC.adaptive` (on). Telemetry: `thr` events.

### 6b. Fairness (Cut A)
- **Hit timer (story)** on top of the existing tokens: `delay = 0.5 s × rules`. Rules: under 5 m ×0.5, over 15 m ×1, crouched ×2, in cover ×2, player facing away ×2, charging the bot ×0.5. The whole delay is divided by (0.6 + threat).
- Shots blocked by the timer become visible near-misses. Implemented in `enemies.js` around line 524 (accuracy/damage); behind `RC.hitTimer`.
- **Deathmatch spawn scoring** (`dmSpot`): reject spawns in an enemy's line of sight; −20 within 9.5 m of an enemy; a penalty for 7 s near recent deaths; a random tie-break. Used for bots and the player. Behind `RC.dmSpawnScore`.

### 6c–e. Cut B (v15)
- **6c. Human aim for DM bots:** 0.2–0.3 s reaction delay, slew-clamped yaw with a spring-damper, spread that tightens while tracking, same stats as the player.
- **6d. Bot callouts** through the radio/feed when orders change.
- **6e. Story pacing director:** build-up, peak, fade, relax (30 s with no new squads), driven by threat and player damage. It changes how often squads come, not how hard they are.
- **Before touching enemies.js,** check the linked `enemy-ai` session for overlapping changes.

## 7. Mobile
- Kit-yellow fire button with the crosshair icon, and kit icons on the touch buttons (`game/touch.js`).
- Auto-fire (`settings.fireMode='auto'`, `RC.touchAutoFire`) on by default on phones, with a toggle in Settings.
- The death card and lobby have touch targets of at least 44 px.

## 8. Release gates (all must pass)
- **Tests:** `cd tests && node run.cjs`; only the 2 known failures allowed. New tests:
  - quests progress, claim and reset
  - a trial applies once
  - the director rises with kills, falls on death and stays within caps
  - death card respawn-now
  - end-screen auto-continue
  - spawn scoring never picks a spot in an enemy's line of sight
  - lobby lighting is restored on mission start
- **Screenshots** at 1280×720, 800×450, 821×462 and phone portrait/landscape (`tools/shots_hud.cjs`), compared against the mockups.
- **Bot check** with `tools/playtest.cjs`: DM time to first kill, deaths per minute, no spawn-kills, and the threat curve over a 5-minute match.
- **Performance:** about 60 FPS with 6 DM bots on a mid laptop; no new per-frame allocations.
- **Size:** `dist_v14` under 20 MB.
- **Licences:** confirmed (itch.io pack free to use); credits added.
- **Ship:** DEV-LOG entry, `dist_v14` + `dist_v14_zip`, update notes, `remote-config.json` v5 with the new flags.

## After upload
- `tools/cgmetrics.py` 24 h after the upload. Targets: desktop first-kill rate 70%+, median playtime up, day-1 return up.
- Use remote config to turn off any feature that hurts the numbers.
