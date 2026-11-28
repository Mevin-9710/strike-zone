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
- Smoothness (`game/net.js` `pose`): positions carry the time they were captured on the sender; the drawn clock is slewed (no jumps); the delay per entity covers the sample spacing plus the whole capture-to-screen lateness (mean + 2.5 sd, or 80% of the worst in the last 4-8 s), grows fast and shrinks slowly; when samples run out the puppet keeps going up to 0.1 s.
- Server line of sight: `server/los.mjs` + `server/maps.json` (re-export with `tools/export_server_maps.cjs` after map changes).
- Capacity: `node server/loadtest.mjs` (table in `server/README.md`). 50 humans in one BR match: about 3.3 KB/s per player on the wire (was ~50 KB/s in phase 1), 8% of one CPU core. Eliminated BR players get no records after the 4 s kill cam; mid-range players behind walls go at the far rate; the host gets no records of its own bots and sends unchanged bots as a slot list.
- Tests: `tests/mp.cjs` (includes a smoothness check of a walking player), `tests/br.cjs`. Benches: `tools/net/` (jitter/stall proxy, smoothness with two browsers or a node walker, shot direction check, 50-slot decode check).

## Next
- Reconnect after a dropped connection, invite links tested on CrazyGames, 16-player rooms.
