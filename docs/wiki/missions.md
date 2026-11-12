# Campaign: Season 1 (12 missions, 4 chapters of 3)
Chapters are `Math.floor(index/3)`. A chapter unlocks when `chapter*3 <= sz_progress` (with `?debug`/`?test` everything is unlocked).
Objective types (`CFG`): **defuse** (hold E 5 s per device), **plant_hold** (plant 3 s, then hold 30 s), **retrieve** (hold E 2.5 s per drive, then reach `map.extract`).
Maps: m1-m3 are hand-built (`world/maps.js`); m4-m12 are procedural districts (`world/procgen.js`) with `{seed, theme, time, hub, count}`.

| # | Ch | id | Title | Objective | Map | Timer (s) | Enemies | Ability pool |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 | m1 | First Signal | defuse x1 | buildM1, transit hub roof. Routes: stealth (5 enemies, 180 s) / assault (8, 140 s) | 180/140 | guard, sniper, commander | smoke dash flash |
| 2 | 1 | m2 | Low Tide | plant_hold | buildM2, harbor flooded vault | 170 | 8 incl. heavy, drone, sniper | sensor smoke dash shield decoy flash |
| 3 | 1 | m3 | Dead Air | defuse x3 | buildM3, blackout block | 220 | 8 incl. turret | all 8 |
| 4 | 2 | m4 | Static Bloom | defuse x2 | downtown/night, hub tower "BLOOM FM", seed 4141 | 210 | 10 | smoke flash dash sensor |
| 5 | 2 | m5 | Cold Storage | plant_hold | harbor/morning, vault "COLD STORE 4" (breach in), 5252 | 200 | 10 | shield sensor smoke dash decoy |
| 6 | 2 | m6 | Paper Trail | retrieve x3 + extract | industrial/overcast, compound, 6363 | 230 | 11 | sensor smoke flash drone dash |
| 7 | 3 | m7 | Glass Choir | defuse x3 | civic/noon, tower 4 floors "CIVIC SHIELD", 7474 | 240 | 11 | flash smoke shield lockdown dash |
| 8 | 3 | m8 | Undertow | retrieve x2 + extract | harbor/dusk, vault "PUMP STATION", 8585 | 230 | 11 | sensor decoy smoke shield dash flash |
| 9 | 3 | m9 | Ash Market | plant_hold | downtown/sunset, compound, 9696 | 210 | 12 | smoke flash lockdown shield dash decoy |
| 10 | 4 | m10 | Signal Fire | defuse x3 | blackout/night, tower 4 floors "GRID RELAY", 10107 | 250 | 12 | 7 (no decoy) |
| 11 | 4 | m11 | Iron Psalm | retrieve x3 + extract | industrial/night, vault "PSALM WORKS", 11118 | 250 | 12 | all 8 |
| 12 | 4 | m12 | Last Light | defuse x2 | civic/dusk, tower 4 floors "HALVANE CIVIC", 12129; boss **warden** (Okonkwo, 950 HP) | 300 | 12 | all 8 |

Winning m12 shows "SEASON 1 COMPLETE". Each mission has radio lines (`start/contact/near/device/planted/extract/low`) plus story-data.js briefing, debrief and event chatter.
Districts contain breach walls (hold E), explosive barrels, intel caches, and 3-6 medkits (+35 HP, 30 s respawn). Difficulty: `0.8 + min(11, idx)*0.035`.
Mission 1 forces the tutorial on the first run (`sz_tutorial_done`). Steps: look, move, walk, jump, slide (PC only), fire, aim, reload, swap, ab0, ab1, kit, fight, defuse.
