# Strike Zone

A browser tactical FPS for CrazyGames, built on plain Three.js ES modules (no build step). Story campaign "Season 1":
12 missions in 4 chapters set in the city of Halvane. You play operative Rhea Voss against the Meridian Covenant,
and over the campaign you find out who her handler Okonkwo really is. Objectives are defuse, plant and hold, and
retrieve and extract. The game also has a 3D operative lobby, XP levels, a 40-tier battle pass, a cosmetic shop
(charms and sprays), weapon upgrades, story unlocks, a guided tutorial, touch controls and CrazyGames SDK v3 ads and cloud saves.

## Play locally
    python3 tools/serve.py              # http://localhost:8765/index.html (no-cache server, required)
URL flags: `?debug=1` (cheat keys F7 time / F8 teleport to objective / F9 kill all, all missions unlocked),
`?test=1` (exposes `window.__game` test API, skips the SDK, implies debug), `?touch=1` (forces the touch UI),
`?noarch=1` (procedural buildings instead of the Kenney ones), `?brief=1` (opens the briefing instead of the lobby).

## Tests
    cd tests && npm ci && node run.cjs  # needs the server running; CHROME=/path/to/chromium (default /usr/bin/chromium)
In a fresh Linux container, run `bash tools/setup_cloud.sh`. It installs everything and does a smoke run.

## Repo layout
| Path | What |
|---|---|
| `index.html`, `menu.css`, `game.js` | Entry page, menu/HUD CSS, main game (loop, player, missions, UI, test API) |
| `game/` | Modules: enemies, weapons, meta (XP/shop/unlocks), tutorial, mentor, radio and story data, feel, audio, touch, crazy (SDK), toon, menu-flow |
| `world/` | Collision world, city kit, the 3 hand-built maps, procedural districts, Kenney art loaders, textures |
| `fx/` | Ability effects |
| `lib/` | Vendored Three.js + addons |
| `models/`, `fonts/` | GLB assets (Kenney CC0 based) and the Oswald font |
| `tests/` | Playwright-core headless suite (`run.cjs`) |
| `tools/` | Dev server, benchmarks, asset bakers, `build_dist.sh` (CrazyGames zip), `setup_cloud.sh` |
| `site/` | Marketing website (Vercel). Maintained separately, see docs/wiki/website.md |
| `media/` | Trailer, screenshots and store art |
| `supabase/` | Backend for the website (schema/functions). Secrets are never committed |
| `docs/wiki/` | Project wiki: architecture, content reference, testing, known issues |
| `docs/context/` | Background: CrazyGames/FPS market wiki and the story bible |

Notes and planning: `HANDOFF.md` (current state), `DEV-LOG.md`, `EXPANSION-PLAN.md`, `RESEARCH-FEEL.md`, `ART-PLAN.md`,
and `AGENT-HANDOVER.md` (brief for an autonomous QA and bug-fix agent).

## Links
- Repo: https://github.com/Mevin-9710/strike-zone
- CrazyGames SDK v3: https://docs.crazygames.com/
- Wiki index: [docs/wiki/README.md](docs/wiki/README.md)
