# CrazyGames SDK v3 (game/crazy.js)
- `index.html` loads `https://sdk.crazygames.com/crazygames-sdk-v3.js` async; `onerror` sets `window.__noSDK`.
- `crazy.init(skip)`: skipped on `?test=1`. Waits up to 4 s for the script, then up to 5 s for `SDK.init()`. Every call is a no-op without the SDK.
- Hooks: `loading(on)` around `loadAll`, `gameplay(on)` for start/stop, `happy()` on a win, `midgame()` before `startMission` (only when the SDK is active and at least 3 min since the last ad), `rewarded(onDone,onFail)` (no reward on adError; granted instantly without the SDK), `onAd(cb)` mutes and pauses during ads.
- Data module: on init, hydrates `sz_*` keys into localStorage, then patches `Storage.prototype.setItem` to mirror writes.
- Upload: `bash tools/build_dist.sh` produces `dist/` (runtime only) and `dist/strike-zone.zip`. dist/ is gitignored.
- Market and requirements research: docs/context/cg-fps-wiki/wiki/crazygames.
