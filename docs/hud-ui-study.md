# HUD / UI study (2026-11-19, v9 screenshots in media/raw/hud/)

## Problems seen
| # | Where | Problem |
|---|---|---|
| 1 | all, Deathmatch | Story radio ("the device is on the station roof") and "MISSION START" play in Deathmatch; "SPOTTED BY 4" is noise when every bot hunts you |
| 2 | all, Deathmatch | Score lives in the small objective card; no big kill counter, no progress to the target, no streak feedback |
| 3 | phone portrait | Radio subtitle box collapses into a tall narrow column over the fire button; covers a third of the screen |
| 4 | phone landscape | Radio box sits bottom-center over the play area, between the thumbs |
| 5 | phone | 7 round buttons + pause + spray visible at once (Fortnite guidance: 5-6 active controls max) |
| 6 | desktop | Ability chips and HP/ammo are small for a 1280x720 iframe |

## Research (sources)
- Show only what the moment needs; 5-6 active touch controls max; context-sensitive elements ([Epic, Designing for Mobile in Fortnite](https://dev.epicgames.com/documentation/fortnite/designing-for-mobile-in-fortnite?lang=en-US)).
- Fire near the thumb arc, bottom-aligned controls, ≥44 px targets, minimal overlap ([Game UI guide 2025](https://generalistprogrammer.com/tutorials/game-ui-design-complete-interface-guide-2025)).
- Readable on any background (outlines/panels); minimal HUD, reactive feedback (hit markers, damage direction) ([RocketBrush HUD guide](https://rocketbrush.com/blog/designing-practical-and-pretty-hud-in-video-games)).
- Full-screen use and legibility on handhelds ([Apple via PrismNews](https://www.prismnews.com/hobbies/mobile-gaming/apple-explains-how-to-design-mobile-game-controls-that-feel-native)).
- Deathmatch pacing: near-instant respawn + protection, spawn away from action, short matches, one-click rematch ([Valve DM](https://developer.valvesoftware.com/wiki/CS:GO_Gamemodes:_Deathmatch), [GameDev.net](https://www.gamedev.net/forums/topic/648174-multiplayer-respawn-times/5096503/)).

## v10 changes
- Deathmatch scoreboard: big kill counter, progress bar to the target, timer, streak flame; no story radio, no "spotted" badge; "DEATHMATCH · GO!" opener; FINAL 30 s call-out.
- Radio subtitles: top-center, max 60 vw, compact on touch; never a column in portrait.
- Touch: secondary buttons (spray, jump in Deathmatch) dimmed; consistent sizes.
- Addiction loop: multi-kill announcer (DOUBLE / TRIPLE / RAMPAGE), streak rewards (3 = UAV reveal, 5 = OVERDRIVE damage boost, 8 = AIRSTRIKE), health regen after 4 s out of combat, rank tier at the end (Bronze→Legend), "N kills to beat your best", auto-rematch countdown.
