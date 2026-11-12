# Progression, meta and shop (game/meta.js)
- **XP**: kill 50, headshot +25, objective 150, breach 40, intel 100, barrel 30, win 600, first clear 400. Level = xp/800 + 1.
- **Battle pass**: 40 tiers, one per level; pays coins (every 5th tier 500, otherwise 150). Paid automatically in `addXP`.
- **Shop**: charms (hang on the viewmodel gun, 150-450 coins) and sprays (T key / touch button, 150-400). `buy`, `equipItem`.
- **Weapon upgrades**: 1 point per mission win, +8% damage or +25% reserve per rank, 5 ranks each.
- **Story unlocks** (`UNLOCKS[i]` = granted after completing mission i+1): weapons and operatives come only from campaign progress (see content.md).
- **Intel**: caches in districts. Every 3 intel opens one of 12 `FILES` (Profile tab).
- **Rewarded ads**: double XP on the end card, and one revive per mission.
- **Saves**: `sz_profile`, `sz_progress`, `sz_loadout`, `sz_settings`, `sz_tutorial_done` in localStorage, mirrored to the CrazyGames data module when the SDK is active.
