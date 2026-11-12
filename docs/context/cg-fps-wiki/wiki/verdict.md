# Verdict: will people play a Valorant-like game on CrazyGames?

Status as of 2026-11-07: **preliminary. Genre demand is real; this exact shape is high-risk; two cheap tests should come before building.**

## Evidence for
- Browser FPS is a proven, large category; shooters hold top slots (Shell Shockers, Krunker, Hazmob, Veck.io). [C]
- CrazyGames pushes multiplayer: 2x long-term retention claim, dedicated landing page, may skip Basic Launch for games that need a crowd. [S]
- A new shooter (Veck.io, Dec 2025) reached the top lists within months, and a Three.js shooter passed the first gate in one day. [C/B]
- Audience skews to US/UK/AU teens who like competitive games. [S]
- Ability shooters already exist (Venge), so the concept is understood by players. [C]

## Evidence against / risks
1. **Cold-start multiplayer.** 5v5 needs 10 humans; Basic Launch shows the game to a small audience (500 plays min). Without bots filling every slot, retention and playtime fail. [I from S2, S5]
2. **Load size and time.** Conversion benchmark is 80%+ playing ≥1 min, load <10 s, <20 MB. Stock Godot 3D is ~40 MB raw. Hard limit 50 MB initial. [S + C]
3. **Slow session shape.** Round-based elimination has dead time and slow match start, against CrazyGames guidance (land in gameplay immediately; 1 click max for Full Launch). [S: S4; I]
4. **Chromebook and weak hardware.** Games not smooth on 4 GB RAM are disabled there. Heavy 3D WebGL 2 at risk. [S: S3]
5. **Originality / IP.** Names, assets, content must be original. "Valorant-like" mechanics are fine; Valorant agents, names, maps, art are not. PEGI 12 means stylized violence only. [S: S4]
6. **Incumbents.** Established communities with fast instant-match formats. [C]
7. **Infrastructure.** CrazyGames provides no servers. Cost, regions, anti-cheat are yours. [S: S7]
8. **Your history.** Several past games failed Basic Launch; the cause is unknown. Building a much bigger game before knowing why is the biggest process risk. [I]

## What the evidence cannot answer yet
- Exact pass thresholds (unpublished). Real play counts of FPS titles. Whether 5v5 tactical shooters get traction on browser portals (none found). See `open-questions.md`.

## Recommended next steps (cheap, in order)
1. **Diagnose past failures.** User shares Developer Portal numbers (plays, avg playtime, conversion, D1) and any QA/rejection emails for 2-3 earlier games. This tells us which KPI is the real bottleneck. Costs nothing.
2. **Size/performance test.** Export an empty Godot 3D web build and measure size; run it in the CrazyGames QA tool. Compare to Three.js. (1-2 hours.)
3. **Demand probe without the full game.** Build the smallest fun slice (instant deathmatch vs bots, one gun, one ability, <20 MB, plays in 5 seconds) and put it through Basic Launch or Poki's Player Fit Test. Judge by the same KPIs CrazyGames uses. If retention and playtime pass, add tactical rounds and online play.
4. Only then commit to the full Valorant-like scope.

## Confidence
Genre demand: high. This specific game succeeding in Basic Launch as originally scoped (Godot 3D, 5v5, online, abilities): low to moderate. A reduced-scope version: moderate.

## Direction chosen by user (2026-11-07)
Phase 1: Three.js, story/campaign mode against bots, small build, goes to Basic Launch. Phase 2 (only if KPIs pass): tactical rounds, then online play.
Why it fits: single-player component means the Basic Launch path applies [S: S5]; no server or cold-start risk; build stays far below 20 MB.
Watch-outs [I]: story mode must still hit ~10 min average session and 80%+ conversion, so first mission must start in seconds with in-gameplay onboarding and short, replayable missions with progression and saved progress (D1 retention).
Originality note: genre is open, but CrazyGames requires original names/assets [S: S4]. Valorant mechanics are fine; its names, agents, maps and art are not.
"No plant/defuse game on CrazyGames" is [?] only: I did not find one, but could not browse the category. Absence could mean an open gap or weak demand. Check manually.
