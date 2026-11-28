# Online multiplayer
Phase 1 (28 Nov 2026): online Team Deathmatch + Hold the Hill, 4 v 4, real players + bots. Details and how to run the server: `server/README.md`. Decisions: own Node + WebSocket server, server-checked hits, bots clearly labelled, no text chat, order TDM -> Hold the Hill -> battle royale (up to 50).

## How it fits together
- `server/server.mjs`: rooms, bot fill, HP/kills/scores/clock, hit checks.
- `game/net.js`: socket + snapshot interpolation.
- `game.js` section "online": netStart/netSetup/netOnMsg. Puppets are `Enemy` objects with `e.net = true` (no AI, driven by snapshots). Host runs bot AI (`DM.roster` entries carry `nid`).
- Turning it on: `?mp=wss://host` for a test, `mpUrl` in `remote-config.json` for everyone.
- Test: `cd tests && node mp.cjs` (needs `cd server && npm install` once).

## Next
- Phase 2: line-of-sight checks on the server, 16-player rooms, reconnect, invite links tested on CrazyGames.
- Phase 3: battle royale (big map, zone, loot, binary messages, interest management).
