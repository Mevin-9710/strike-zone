# Poki launch, step 0: rules check (2026-11-21)

Source: developers.poki.com guide (Working with Poki, How we partner with you, Requirements, External resources policy, Player fit test, Web fit test, Final review).

## Blocker: web exclusivity
- Poki asks for **web exclusivity** by default (about 5 years): no other web portals or aggregators. Discord and YouTube Playables also count as web. Steam, app stores and consoles are not covered.
- **Non-exclusive** deal exists "for games already live on other web platforms": one-time flat license fee, no revenue share, no Poki marketing investment.
- So with Strike Zone live on CrazyGames, the realistic options are:
  1. Non-exclusive flat fee (keep CrazyGames).
  2. Exclusive revenue share (would mean taking the game off CrazyGames).
  3. Release a distinct game on Poki (a different game, not a reskin).
- CrazyGames side: their public docs say nothing about exclusivity. Check the CrazyGames developer portal or agreement to see whether we opted into an exclusive deal; nothing about it turned up in Gmail.

## Process and timeline
1. Sign up at app.poki.dev, upload the build, use Poki Inspector.
2. Playtests: 10 recordings each, results within minutes to hours.
3. **Player fit test** (unlocks after you watch 10 recordings and upload a thumbnail): 500 players, about 5 h, max 2 a day. Pass bar: **average over 3 min and at least 25% of players over 3 min** (strong games average 5+ min).
4. **Web fit test**: about 10k players over 3-5 days, scored 0-5 against category averages on **CTR, time on page and conversion to play** (C2P, reaching the first `gameplayStart`). Ads are optional at this stage.
5. Final review: 1-2 weeks. Then the agreement, QA, soft release and global release: **about 2-3 months**.

## Requirements that hit our code
| Requirement | Strike Zone today | Work |
|---|---|---|
| No external requests (CSP blocks them) | Supabase telemetry, GitHub remote config | Request a CSP exception (analytics is case-by-case), needs an in-game privacy policy link; or bundle the config and drop telemetry |
| No external logins | CrazyGames login/cloud save | Poki build: localStorage only (or Poki AUDS/User Accounts) |
| `gameplayStart` on first input, never twice; `gameplayStop` on every interruption | Same rules as on CrazyGames | Poki adapter + check for double fires |
| `commercialBreak` only when going back into gameplay | Midgame ads at level end | Move ad calls to "Next/Continue → gameplay" |
| 16:9, scales to 640x360, 836x470 and 1031x580 | Responsive | Test at those sizes |
| localStorage in try/catch (incognito) | Mostly | Audit |
| Mobile + tablet; force touch controls on tablet | Touch present | Force touch on tablets |
| Static **and animated** thumbnails | Static cover | Make an animated one |
| Small initial download, about 10 s or less | 19 MB | Progressive loading |
| No outgoing links or other ad systems | Check | Strip in the Poki build |

## Recommendation
Start testing now: playtests and player fit tests are free and don't publish anything. They give unbiased playtime data from Poki's audience, which is useful for the CrazyGames work too. Decide between exclusive and non-exclusive only if we pass the web fit test.
