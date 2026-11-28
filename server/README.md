# Blastline online server

One small Node process (`server.mjs`, only dependency: `ws`). It runs the rooms for online Team Deathmatch, Hold the Hill and Battle Royale.

## What it does
- **Rooms of 8 (4 v 4).** A player who presses PLAY drops straight into a running room of that mode (the fullest one first, so people meet). No room? A new one starts at once.
- **Bot fill.** Every team always has 4 members. Empty slots are bots, named with a `[BOT]` tag. When a player joins, a bot on their team steps out; when a player leaves, a bot takes the slot.
- **Who runs the bots.** The player who has been in the room longest (the "host") runs the bot AI in their game and streams the bots to the server. If the host leaves, the next player takes over.
- **Server-checked hits.** Your game says "I hit X for N damage"; the server checks the damage fits the gun, the range is possible, and the fire rate is real, then applies it. The server owns everyone's health, kills, team scores, the clock and Hold the Hill scoring.
- **Rounds.** 5 minutes, or first team to 40 kills (TDM) / 100 hill points. After 12 s on the end screen the same room starts the next round on a new map (CrazyGames: the same group keeps playing).
- **Battle royale** (Island Ring map): 50 players by default (`BR_SIZE` to change it), everyone for themselves, one life each. Bots fill only during the first 40 s, the drop. The server runs the shrinking zone (5 phases) and its damage, the loot pickups (first come first served), armor and the placement. The round ends when one player is left.
- `GET /` on the same port returns `{ ok, players, rooms }` (the lobby shows "N ONLINE").

## Run it locally
    cd server && npm install && npm start          # ws://localhost:8787
    open http://localhost:8765/index.html?mp=ws://localhost:8787    (game served with python3 tools/serve.py)

## Run it on a VPS (1 CPU / 1 GB is fine for testing)
Ubuntu or Debian, then one command:

    curl -fsSL https://raw.githubusercontent.com/Mevin-9710/strike-zone/main/server/setup-vps.sh | sudo bash

(Before the PR is merged, use the branch name: `.../strike-zone/claude/project-thread-vvbk6z/server/setup-vps.sh | sudo bash -s -- claude/project-thread-vvbk6z`.)

It installs Node + Caddy, runs the server as a service that restarts itself and starts on boot, and sets up HTTPS on `<your-ip>.sslip.io` (free certificate, no domain needed; browsers need `wss://` because the game page is `https://`). At the end it prints the server URL. Re-run the same command to update.

Then point the game at it:
- to test: open the game with `?mp=wss://<your-ip>.sslip.io`
- for everyone: set `"mpUrl": "wss://<your-ip>.sslip.io"` in `remote-config.json`

## Useful commands on the VPS
    journalctl -u blastline -f       # live log (joins, leaves, rejected hits)
    systemctl restart blastline      # restart
    curl https://<your-ip>.sslip.io  # health + player count

## Capacity (load test, server pinned to 1 CPU core)
    node server/loadtest.mjs        # simulated players; prints CPU, tick time, memory and bandwidth per step

| Load | CPU (1 core) | Tick | RAM | Out |
|---|---|---|---|---|
| 1 BR room, 50 humans | 5% | 0.5 ms | 74 MB | 1.7 MB/s |
| 4 BR rooms of 50 (160 humans + 40 bots) | 14% | 1.7 ms | 88 MB | 5.0 MB/s |
| 25 TDM rooms of 8 (100 humans) | 4% | 0.6 ms | 82 MB | 0.5 MB/s |

A BR player costs about 30 KB/s (about 110 MB per hour of play); a TDM player about 5 KB/s. On a 1 CPU / 1 GB VPS the network and the monthly traffic cap run out long before the CPU does.

## Line of sight
Hits are refused when walls block every line from the shooter to the victim (`los.mjs`, colliders in `maps.json`). After changing a map, rebuild it: `python3 tools/serve.py & node tools/export_server_maps.cjs`.

## Limits (planned next)
- Bot abilities (smoke, flash) only show for the host.
- One host client still runs all bots of a room; in a 50-player BR with few humans that is 40+ bots on one device (far bots think less often to keep it light).
