# CrazyGames launch process and what decides pass/fail

## Stages [S: S1, S2, S7]
1. **Initial QA check.** Visual and functional checks against Basic Requirements. Result by email.
2. **Basic Launch (test).** Shown to a *small segment* of players. SDK optional, ads/monetization off. Lasts until the game has been live **≥7 days AND ≥500 plays**; if 500 plays not reached, it auto-ends at **21 days**. Updates are auto-approved and appear in daily dashboard data.
3. **Full Launch.** Only for games that beat the benchmarks. Requires full SDK integration, full QA, gameplay landing in ≤1 click. Ads and rev share start here.

Outcomes after Basic Launch [S: S2 via search]: all metrics pass → invited to Full; some pass → invited to improve and request another Basic Launch; most fail → cannot proceed.

## The three KPIs [S: S2]
| KPI | Definition | "Success looks like" (CrazyGames's words) |
|-----|-----------|----------------------------------------|
| Average play time | avg time per session | often 10+ min |
| Day 1 retention | % returning next day | strong games 10-15% |
| Conversion | % who play ≥1 min after starting | top titles 80%+, load <10 s, build <20 MB |

These are described as illustrative, "a compass, not a final grade"; exact pass thresholds are **not published**. [S: S2] Benchmarks are relative to other games on the platform [C: S10].

## Ranking after launch [S: S7]
Algorithms vary by device, country, OS, some personalisation. New games "may receive an initial boost". Rankings driven by play count, avg playtime, retention, conversion, player feedback. Homepage new-games carousel exists; staying visible depends on continued metrics.

## What this implies for the user's past rejections [I]
- "Not enough players after 1 week" most likely means conversion/playtime/retention fell below the platform benchmark, or the test audience never reached 500 plays. Which one is unknown until the user shares dashboard numbers (see open-questions).
- Conversion (80%+ play ≥1 min) is mostly about **load time and size**, which kills heavy engines first.
- Player feedback on negative ratings is visible in the Developer Portal [S: S7]; check it for past games.

## Rejection patterns reported by others [C/B]
- Rejected within about 2 hours with note "looks like a prototype", thin feedback [C: search snippet, unattributed]. Treat as anecdote.
- A Three.js arena shooter built with Claude Code went live in Basic Launch 1 day after submission (Oct 2026) [B: S9]. So a shooter *can* get through the first gate.
- Resubmission after meaningful improvements is allowed [S: S7].
