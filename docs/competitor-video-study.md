# Competitor video study (2026-11-21)

Input: 27 YouTube videos from "Strike Zone — Browser FPS Gameplay & UI Reference Guide.docx" (Kour.io, Krunker, Shell Shockers, Deadshot.io, 1v1.LOL, Bullet Force, Venge.io, Smash Karts, Horde Killer).
Method: downloaded at 480p (`/tmp/szvid`, 239 MB), built timestamped contact sheets with `tools/vidsheets.sh` (one frame every 3, 5 or 15 s, by video length), then reviewed the sheets covering the guide's key moments and top 10 (~20 of 98 sheets). The rest are still in `/tmp/szvid/sheets` if needed.

The guide is mostly accurate. Corrections:
- Shell Shockers BPsh_optGzw is an edited meme video, not a raw capture.
- Kour Jw85 has a facecam.
- Bullet Force jd7G is a custom farming match.
- Bullet Force qEO0 is a CrazyGames cold start: about 20 s of portal page and ad before the loading bar.

## What every good one does (and we don't)
| # | Pattern | Seen in | Strike Zone today |
|---|---|---|---|
| 1 | **Respawn in 2-4 s with a big "Back in: 4s / press Space to spawn now"**, plus a "switch class +5/+15 XP" card on the right and "Killed by X (Headshot)" | Kour 0:05, 2:00; Deadshot 0:40 (RESPAWN + Change Class) | DM respawn 1.5 s but no killer card, no class/loadout swap on death |
| 2 | **Big center kill numbers**: "+150 / 47" damage pop-ups, "HEADSHOT DOUBLE KILL +200", stacked "ENEMY KILLED 100 / HEADSHOT BONUS" lines | Kour 0:30-0:35, Bullet Force, Deadshot +150 | Multi-kill flash only; no per-kill score pop or headshot bonus |
| 3 | **Score/XP visible during play** (team scores and timer top center, top-5 board top right) | Kour, Deadshot, Venge | DM bar has kills/target; no live leaderboard of bots |
| 4 | **Quests beside PLAY and on the end screen** (Daily/Weekly tabs with bars: "Get 3 wins 2/3", "Get 75 eliminations 71/75") and a mid-match "Challenge completed" toast | Deadshot lobby 0:00 and VICTORY 4:45; Shell Shockers CHALLENGES with timer; 1v1 end screen "Play 15 matches 150" | One daily mission, hidden in a panel |
| 5 | **End screen = rewards + quests + one big PLAY AGAIN**, often auto-advancing ("Next game: 17", "New round in 12") | Deadshot, Venge (map vote), Smash Karts, 1v1, Horde ("HORDE DESTROYED +100 → CONTINUE") | DM end has rematch countdown; story end is several buttons |
| 6 | **Timed rewarded offer on the end screen** ("Claim: 5.9s" +100 XP, 20 min boost, 200 coins) | Smash Karts 2:45 | Rewarded ads only in the shop |
| 7 | **"Try it for one level" rewarded trials next to START** (Minigun, RPG, Invulnerability, Endless ammo, each "WATCH AD") and locked weapons shown in the hotbar | Horde Killer lobby 0:00 and 1:25 | None; a strong fit for our arsenal |
| 8 | **Lobby = big character render + loadout row + one huge PLAY**, currency top right, free crate/claim top left | Kour, Shell Shockers, Horde, 1v1 | Dark lobby, 9 small buttons (see the v13 lobby plan) |
| 9 | **Straight into play**: Smash Karts shows a 3 s controls card over the live match; Krunker puts "click to play" over a live match; Horde goes from START to combat with no loading | Smash Karts 0:00, Horde 0:12→0:13 | Fast load, but text-heavy tutorial |
| 10 | **Mobile HUD**: left stick; right side has big fire, jump, reload and scope; HP bottom left; ammo bottom right; 4-6 buttons; Shell Shockers auto-fires when the crosshair is on target; Deadshot and Krunker have a layout editor | Venge iPad 0:21, Deadshot, 1v1 | Similar layout; no auto-fire option; no layout editor |

## Anti-patterns confirmed
- Bullet Force on CrazyGames: about 20 s of portal page, a pre-roll ad, then a loading bar. Our 2-5 s load is a real advantage; keep it.
- Shell Shockers mobile: forced ad on death breaks the flow. Keep our ads at level ends only.
- 1v1.LOL mobile: a banner ad covering the top of the HUD.

## Proposed v13 additions (ranked by expected playtime and D1 effect, all small or medium)
1. **Quests panel**: 3 daily + 2 weekly quests with progress bars. Shown next to PLAY, on every end screen, and as a mid-match "QUEST COMPLETE +coins" toast. Reuses the modes.js daily logic. Targets D1.
2. **Kill feedback**: "+100" score pop per kill, "HEADSHOT +50", a stacked kill-line list; a small live top-5 board in DM.
3. **Death card in DM**: "Killed by Bot_7 (headshot)", "Back in 2s · SPACE / tap to respawn now", "Switch loadout" buttons (pistol/AR/shotgun/sniper loadouts).
4. **End screen redesign**: rewards with a counting animation, quest bars, one huge PLAY AGAIN with auto-continue, plus a 6 s "Claim 2x coins" rewarded offer.
5. **One-level rewarded weapon trials** on the lobby/level card (Minigun / RPG / Endless ammo) and locked weapons visible in the weapon bar.
6. **Lobby overhaul**: hero render, loadout row, one huge PLAY, currency top right (as already planned).
7. **First-run**: drop straight into a short, winnable fight with a 3 s controls card in place of the text tutorial, and a level-up payoff within 2 min.
8. **Mobile**: optional aim-assist auto-fire when the crosshair is on an enemy (Shell Shockers does this on mobile only).
