# Strike Zone launch plan

Written 2026-11-14. Sources: docs/context/cg-fps-wiki (launch-process, verdict, fps-landscape) and media/ (screenshots, covers, clips, trailer).

## The main idea
CrazyGames decides Strike Zone's reach. Basic Launch shows the game to a small test audience and then compares three numbers to other games: **average play time (target 10+ min)**, **D1 retention (10-15%)** and **conversion (80%+ playing at least 1 minute)**. Social posts can't fix weak numbers. They mainly help after Full Launch, when outside players add to the play count and ranking.

So the order is: **1. Get the game ready for the KPIs → 2. Pass Basic Launch → 3. Promote it hard once the game is fully launched.**
Before Full Launch, spend about 20% of the effort on audience-building and 80% on the game.

## Phase 0: before submitting (week 0)
Goal: no avoidable fails on conversion or QA.
- [ ] **Load test.** Measure the dist zip size (`tools/build_dist.sh`) and time to first gameplay on a slow connection. Targets: under 20 MB, under 10 s, gameplay in 1 click or fewer.
- [ ] **First minute.** A new player should be shooting within about 5 s of pressing Play. Check that the tutorial doesn't block the first fight.
- [ ] **Chromebook / 4 GB check.** Use dynamic resolution and a low preset. If it isn't smooth, the game gets disabled on those devices.
- [ ] **Refresh the media.** The current captures come from commit 93086b4 and don't show the newer slide, kill banners, streaks or tutorial. Re-run `tools/capture_media.cjs` and `capture_media.sh` on the build you submit.
- [ ] **Listing.** Title, a 1-2 sentence hook, description, controls, and tags (FPS, shooter, 3D, story, mission, action). Covers at 1920x1080, 800x1200 and 800x470 are already in media/screenshots/covers.
- [ ] **Originality pass.** Nothing in the names, art or copy may suggest Valorant or another game.
- [ ] **Analytics.** Write down baseline numbers from the Developer Portal every day. Use the scorecard below.

Hook options (test in posts, use the winner on the listing):
1. "12-mission tactical FPS campaign. Breach, defuse, take down the Warden. No download."
2. "Rhea Voss vs the Meridian Covenant. Who is your handler really working for?"
3. "Slide, breach walls, blow barrels, and clear Halvane district by district."

## Phase 1: Basic Launch (weeks 1-3)
It lasts at least 7 days and 500 plays, and closes automatically at 21 days.
- **Daily:** check the dashboard and read the negative feedback. Ship small fixes, which get approved automatically. Change one thing at a time and log it in DEV-LOG.md, so a change in the numbers can be traced to its cause.
- **Fix in this order:** conversion (load and first minute) → play time (mission length, the "one more mission" loop) → D1 (daily reward, battle-pass progress shown at the end of a match, a mission-unlock cliffhanger).
- **Build the audience on the side** (no hard launch yet):
  - Make a TikTok, YouTube Shorts and Instagram account named "Strike Zone". Post one 9:16 clip a day from media/clips. Hook in the first second, caption ends with "free in your browser".
  - Post a devlog on r/WebGames, r/threejs, r/IndieDev and r/indiegaming (read each sub's self-promo rules first). Good angles: "a 3D FPS in plain Three.js under 20 MB" for tech subs, the trailer for game subs.
  - Upload a playable page to itch.io (HTML5) as a secondary storefront and a place for feedback.
  - Run a small Discord, mainly for bug reports and playtesters.
- **Decision at the end:** If everything passes, go to Full Launch. If some numbers pass, improve and ask for another Basic Launch. If most fail, hold all promotion and use the numbers to decide what to rework.

## Phase 2: Full Launch (weeks 4-6)
Requires the full SDK, full QA and ads turned on.
- **Launch day:** release the new trailer (16:9 on YouTube, 9:16 on Shorts, TikTok and Reels). Post on all subs and the Discord, and update the site (site/) with a "Play on CrazyGames" button and the CrazyGames link.
- **Launch week:** post 1-2 short videos a day. Rotate four formats: a boss fight, a breach plus barrel chain, a "can you beat mission 7" challenge, and story or lore teasers.
- **Creators:** send a short email with the link, the trailer and 3 GIFs to 20-30 small browser-game and "free games" YouTubers and TikTokers (10k-200k followers).
- **Ride the new-games boost:** CrazyGames boosts new games at first. Ship a visible update in week 1 or 2 (new mission, skin or event) so the game page keeps getting activity.

## Phase 3: Keep it going (week 7 and later)
- **Content updates every 2-3 weeks:** a new mission or district, a seasonal battle pass, limited sprays. Each update gets one trailer clip and a set of posts.
- **Events:** weekly challenge missions with leaderboard-style screenshots players can share.
- **Phase 2 of the game:** add tactical rounds and online play only after the KPIs pass, as the verdict says. That launch then becomes the next marketing beat.

## Scorecard (fill in daily)
| Date | Plays | Avg play time | Conversion | D1 | Top feedback | Change shipped |
|---|---|---|---|---|---|---|
| | | | | | | |

Weekly social numbers: views per post, best hook, clicks to the game. Stop using formats that get under 500 views after 5 posts.

## Unknowns
- The exact pass thresholds aren't published. The targets above are CrazyGames' own "success looks like" figures.
- It's unclear whether outside traffic during Basic Launch counts toward the test numbers or skews them. Ask CrazyGames support before pushing external traffic during the test.
- Results of the user's earlier games are still missing (see open-questions.md). They would show which KPI is the real bottleneck.
