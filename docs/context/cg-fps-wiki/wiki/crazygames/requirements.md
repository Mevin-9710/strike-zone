# Requirements digest (re-fetch docs before relying on numbers)

## Technical [S: S1, S3]
- Initial download ≤ **50 MB**; ≤ **20 MB** to be on the mobile homepage. With the SDK, measured from load start to the first `gameplayStart` event (menus and extra loading excluded). Without SDK, total file size is used.
- Total ≤ **250 MB**, ≤ **1500 files**. Externally loaded files judged on time to gameplay ≤ **20 s**.
- Relative paths only; no absolute paths.
- Must work in Chrome and Edge. Disabled on Safari if poor. **Disabled on Chromebook (ChromiumOS) if not smooth on a 4 GB RAM device.** Mouse+keyboard (+touch if mobile supported). Landscape on desktop.
- Add `user-select: none` to body for touch devices.
- Cannot know whether "50 MB" is compressed or raw. [?] Verify in the QA tool.

## Gameplay and content [S: S4]
- Text legible at devicePixelRatio 1 on iframe sizes such as 907x510, 1216x684, 1280x720, 1920x1080.
- Physics consistent at 144/165 Hz (use delta time).
- English localization; use SDK locale.
- **Originality**: game names, assets, overall content must be original. [S] (Directly relevant to a Valorant-like: no Valorant names, agents, logos, maps, voice lines.)
- No custom fullscreen button (CrazyGames provides it). No cross-promotion of other games.
- **PEGI 12 compliant.** Audience 13+. [S]
- Full Launch: land in gameplay immediately, max 1 click. [S]

## Controls [S: S6]
Quality guide references "Restricted Keys" (browser-reserved keys such as Esc, Ctrl combos). FPS needs pointer lock and mouse control; see `Mouse control` resource page [?: not read].

## Covers [S: S8]
Three covers: 1920x1080, 800x1200, 800x800, plus preview video. Title only, no screenshots-as-cover, no borders. Cover quality directly affects clicks.

## Quality guidelines (optional but strongly recommended) [S: S6]
Onboarding inside gameplay, skippable, visual not text-heavy; clear goals; easy to learn; "is your game unique?"; solo play as prominent as multiplayer if both exist.
