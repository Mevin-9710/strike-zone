# v15 plan: Deathmatch-first, Deathmatch-wide spawns, operative bots, cleaner mobile HUD, Deathmatch-linked quests

(The v14 plan is saved in `docs/v14-plan.md`. v14 is committed as 6dcaa01.)

## Context
- **Deathmatch is the stickiest mode.** On mobile, Deathmatch sessions last about 2.5× longer than story-only ones (median 6.4 vs 2.5 min), and 41% of those players play again.
- **The user's asks:**
  - make Deathmatch the default and start straight in it
  - set the target to 50 kills
  - fix bots spawning in the same place
  - use the operative characters as Deathmatch bots instead of the enemy soldiers
  - clean up the cluttered mobile HUD
  - make quests and rewards work in Deathmatch too
- **Tuning history (checked):**
  - Deathmatch shipped in v9 at 30 kills / 5 min; matches ended in about 2 min and every one was a win ("too easy").
  - Remote config v4 raised the target to 75. Nobody reached it, matches ran the full 5 min, and the median was still 0 deaths.
  - The real problem is that bots can't kill the player. v14's adaptive threat makes them dangerous as kills climb, so the new target is **50 kills / 4 min**.
- **Same-place spawns are only partly fixed in v14.**
  - Each map has only **8 hand-placed guard spots** (`world/maps.js`, the `guards:` arrays). `dmSpot()` (game.js ~line 565) only picks among those.
  - Bots are scored only against the player's position, so the same far spot wins again and again.
  - v14 added line-of-sight rejection and a random tie-break, but bots still cluster on the same few spots.
- **The operative models share the enemy rig.** All 15 bones and all 22 clips (idle/run/walk/shoot/death, plus pistol and rifle variants) are identical in `models/rigged/{rhea,kade,tomas,yuna,amara}.glb` and `enemy_*.glb`. The `Enemy` class can drive them unchanged, and they're already in the build, so download size doesn't change.

## 1. Deathmatch as the default (game.js, game/remote.js, remote-config.json)
- **`RC.defaultMode = 'dm'`** (remote switch; `'story'` restores the old flow without an upload).
- **First launch** (boot block ~line 1901, `firstRun`) starts Deathmatch with the same call `$('pDm').onclick` uses: `startMission(i, { mode: 'dm', route: 'assault', abilities: [] })`.
  - Show `controlsCard()` on that first Deathmatch too (today it's story mission 1 only, ~line 1316).
- **Lobby default:** `playMode = store.get('sz_mode', RC.defaultMode)` (~line 1793). A player who picks Story is remembered.
- **Gentle first match:** pass `firstMission: true` to `director.start` when a player has no `sz_dm_best` and `progress === 0`. Threat stays at 0.2 or below until the first kill, then ramps.
- **Remote config v6:** `dmKills: 50`, `dmTime: 240`.
- **Telemetry:** the `start` event gets `def: 1` when Deathmatch was started by default.

## 2. Deathmatch spawns spread over the whole map (`dmSpot`, game.js)
- **A spawn pool per map, built once in `dmSetup()`:**
  - the 8 guard spots
  - every nav node from `world.buildNav` (reached through `world.nearestNode` and the nav graph) that is on walkable ground, 3+ m from other pool points, not on `world.overlaps`, and reachable from the player's spawn
- **Scoring each spawn** (12–16 random candidates):
  - reject anything in a living bot's or the player's line of sight (−300; already in v14)
  - prefer 18–40 m from the player
  - −10 within 8 m of another living bot (stops clumping)
  - −8 for spots used in the last 10 s (a small ring buffer of recent spawns)
  - keep the death-spot penalty and the random tie-break
- **Same rules for the player respawn**, scored against the bots.
- **Allocation-free:** reuse vectors and a preallocated ring buffer.

## 3. Operatives as Deathmatch bots (game.js, game/enemies.js)
- **`loadBotSkins()`:**
  - After the lobby appears, load `kade`, `tomas`, `yuna` and `amara` in the background, plus `rhea` if she isn't the player's operative. Reuse `loadOperative()` (game.js line 200).
  - Build asset bundles the same way `loadEnemyAssets` does (enemies.js line 92): `{ gltf, clips, gunOffset: calibrateGun(g, 'shoot'), gun, gunInfo, height, box }`. Export a small `buildCharAssets(gltf, weaponScene)` helper from enemies.js for this.
- **`dmBot()`** keeps the enemy *type* (stats and behaviour) but passes a random operative bundle as `assets`.
  - Each bot gets a different operative and a callsign (already in v14).
  - Until the skins finish loading, it falls back to the enemy model.
- **Reading as hostile:** keep the red rim light and outline, and add a small red callsign tag above each bot's head, visible within 25 m. One tag sprite per bot, updated only when its visibility changes.

## 4. Minimal mobile HUD (game/touch.js TOUCH_CSS, v14.css, game.js HUD)
- **On screen (touch):**
  - move stick
  - big yellow FIRE, AIM, JUMP, RELOAD
  - small pause in the top-left corner
  - HP bar bottom-left, ammo number bottom-right
  - objective/timer pill top-centre, or the kills bar in Deathmatch
- **Hidden on touch:**
  - spray button and weapon name
  - "THREAT" chip (its pulse goes on the Deathmatch kills bar instead)
  - minimap in Deathmatch; in story it's 60% size and moved to the top-left under pause
  - ability buttons in Deathmatch (it has no abilities); in story they're smaller and only appear when off cooldown
- **Kill feed:** at most 2 lines on touch.
- **Radio subtitles:** one line at the top, auto-hide after 3 s.
- **Spacing:** buttons stay ≥44 px, with no overlaps at 844×390, 667×375 or portrait 390×844.

## 5. Quests and rewards count in Deathmatch (game/quests.js, game.js)
- **"win"** becomes "Win N matches": a story win or a Deathmatch victory (`dmEnd(true)`) both count.
- **New kinds:**
  - **`finish`:** "Finish N matches", counted on story win/fail and every Deathmatch end.
  - **`rank`:** "Reach GOLD rank in Deathmatch", from the `dmEnd` tier.
- **The starter set**, playable in Deathmatch: get 5 kills, finish 1 match, land 2 headshots.
- **The daily pool mixes in Deathmatch quests:** dmkill, rank, streak.
- **Weekly:** "Get 250 kills" counts Deathmatch kills (already true).
- **The daily crate** opens after any finished match, Deathmatch included (already true in v14: `loginClaim` runs on the first lobby visit after a match). The crate tile text changes to "FINISH 1 MATCH".
- **Deathmatch coins** already scale with threat. The Deathmatch end screen shows quest bars and the double-coins offer (already in v14).

## Files
- **game.js:** first-run/default mode, `dmSetup`/`dmSpot`/`dmBot`, `loadBotSkins`, quest hooks in `dmEnd` and `lose`, touch HUD toggles
- **game/enemies.js:** export `buildCharAssets`
- **game/quests.js:** win/finish/rank kinds, new starter set and pool
- **game/remote.js, remote-config.json v6:** `defaultMode`, `dmKills: 50`, `dmTime: 240`
- **game/touch.js, v14.css:** minimal touch HUD
- **tests/run.cjs:** first launch is Deathmatch; lobby defaults to Deathmatch; spawn spread; operative bots; Deathmatch counts quests
- **DEV-LOG.md, `dist_v15` + `dist_v15_zip` + update notes**

## Verification
- `cd tests && node run.cjs`: only the 2 known charm/spray failures. New checks:
  - a fresh profile boots into a running Deathmatch with the controls card
  - the lobby defaults to the Deathmatch toggle, and a Story pick is remembered after reload
  - **spawn spread:** across 30 spawns, at least 8 distinct spots, none within 8 m of a live bot, none in sight
  - Deathmatch bots use operative models (the model name is checked once skins load)
  - a Deathmatch victory advances "win" and "finish" quests
- **Screenshots** at 844×390, 667×375 and 390×844 (Deathmatch and story HUD), plus a desktop Deathmatch with operative bots.
- **Bot check** over a 4-min match: the player dies a few times once threat climbs, spawns are spread out, and 50 kills is reachable for a strong player.
- `dist_v15` stays under 20 MB (no new assets).
- **After upload:** the per-version telemetry split. Targets:
  - Deathmatch matches finished above 60%
  - median deaths per match of 2–6
  - mobile and desktop median playtime up
