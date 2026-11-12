# Multiplayer on CrazyGames

## Facts
- **CrazyGames does not host game servers.** "We only host the game files. For multiplayer servers, you'll need your own solution, for example Photon." [S: S7] This answers the earlier open question: plan on self-hosting or a third-party backend.
- CrazyGames says online multiplayer games have **2x higher long-term retention** than single-player. [S: S5]
- Multiplayer games needing a large audience **may skip Basic Launch** and go straight to Full Launch (then must meet Full requirements). Multiplayer games with a single-player component still go through Basic Launch. QA decides which flow. [S: S5]
- Full requirements for the Multiplayer landing page: share room info and `isJoinable` via SDK, invite links, **Instant Multiplayer** (first player placed in a private room; for 20+ player games may go to public gameplay), round-based games must let the same group continue to the next match, show CrazyGames usernames, submit lobby sizes. [S: S5]
- Chat requires moderation (profanity filter at minimum) and must respect the disableChat setting. [S: S5]
- Godot web builds cannot use ENet; use WebSocket or WebRTC. A forum thread of a CrazyGames .io developer asked how to manage multiple servers and left it open. [C: S14]

## Implications [I]
- **Cold start is the biggest risk for a 5v5.** The Basic Launch audience is small (500 plays minimum). A 5v5 round-based game needs 10 humans at once; empty lobbies mean conversion and playtime collapse. Bots that fill every empty slot are mandatory, not a nice-to-have.
- A single-player/bots mode plus online mode keeps the game inside the "Basic Launch required" path, which is probably the safer path for a new developer.
- Server cost and latency: tier-1 audience (US/UK/AU) means at least US and EU regions. [I]
- Anti-cheat: browser clients are trivially modifiable; server-authoritative shooting is needed. [I]
