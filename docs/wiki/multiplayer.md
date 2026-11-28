# Online multiplayer
Phase 1 (28 Nov 2026): online Team Deathmatch + Hold the Hill, 4 v 4, real players + bots. Details and how to run the server: `server/README.md`. Decisions: own Node + WebSocket server, server-checked hits, bots clearly labelled, no text chat, order TDM -> Hold the Hill -> battle royale (up to 50).

## How it fits together
- `server/server.mjs`: rooms, bot fill, HP/kills/scores/clock, hit checks.
- `game/net.js`: socket + snapshot interpolation.
- `game.js` section "online": netStart/netSetup/netOnMsg. Puppets are `Enemy` objects with `e.net = true` (no AI, driven by snapshots). Host runs bot AI (`DM.roster` entries carry `nid`).
- Turning it on: `?mp=wss://host` for a test, `mpUrl` in `remote-config.json` for everyone.
- Test: `cd tests && node mp.cjs` (needs `cd server && npm install` once).

## Battle royale + network (28 Nov 2026)
- Mode `obr` on Island Ring, 50 slots, one life, zone, loot. See DEV-LOG "Online battle royale" and "Battle royale scaled to 50".
- Wire format (all in `server/server.mjs` comments, "binary snapshots" and "binary uploads"): per-player snapshots at 15 Hz (`SNAP_HZ`), delta coded, entities as 1-byte room slots, only what changed, by distance (under 50 m every tick, under 120 m every 2nd, else every 4th). Shots ride inside the shooter's record; damage is a 7-byte binary message, in BR only to players nearby. All messages for a player go out in one packet per tick.
- Smoothness (`game/net.js` `pose`): positions carry the time they were captured on the sender; the drawn clock is slewed (no jumps); the delay adapts to the send rate, the sample spacing and the measured packet lateness.
- Server line of sight: `server/los.mjs` + `server/maps.json` (re-export with `tools/export_server_maps.cjs` after map changes).
- Capacity: `node server/loadtest.mjs`. 50 humans in one BR match: about 3.7 KB/s per player (about 4.8 KB/s on the wire with packet headers), 3% of one CPU core.
- Tests: `tests/mp.cjs` (includes a smoothness check of a walking player), `tests/br.cjs`.

## Next
- Reconnect after a dropped connection, invite links tested on CrazyGames, 16-player rooms.
