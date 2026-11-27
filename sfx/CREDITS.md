# Sound and music credits

Every file in `sfx/` and `sfx/music/` is built by `tools/import_audio.sh` from the raw packs in the project folder
(`/mnt/project-files/strike-zone-assets/sfx/`, not in git). All sources used are **CC0 / public domain**: no attribution is
legally required, but we credit them anyway (licences checked 26 Nov 2026).

| Files | Source | Author | Licence |
|---|---|---|---|
| `w_*` (10 guns, near + far) | [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library) ("Prepared SFX Library": Walther PPQ, 1911, S&W 642, AR-15, Carl Gustav M45, SKS, AK-47, PPSh, Tikka T3, Mosin Nagant) | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney | CC0 |
| `rl_*`, `bolt` | [Gun reload sounds](https://opengameart.org/content/gun-reload-sounds) (`assaultriflereload1`, `gunreload1`, `reload`, `shotguncock`) | SpringySpringo | CC0 |
| `step_c*`, `impact_*`, `flesh_*`, `casing_*`, `hit_body`, `hit_head`, `kill_ding` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney | CC0 |
| `step_s*`, `step_t*` | [Fantozzi's Footsteps (Grass/Sand & Stone)](https://opengameart.org/content/fantozzis-footsteps-grasssand-stone) | Fantozzi (via qubodup) | CC0 |
| `empty`, `boom`, `ui_click`, `amb_bell*`, `amb_water*`, `amb_machine` | [100 CC0 SFX](https://opengameart.org/content/100-cc0-sfx) | rubberduck | CC0 |
| `boom2`, `land`, `amb_door` | [Platformer sounds](https://opengameart.org/content/platformer-sprites) (yd-Sounds) | yd | CC0 |
| `music/menu` (Spacetime), `music/match` (Great Mission), `music/final` (Doomed, excerpt) | [Free Music Pack](https://opengameart.org/content/free-music-pack) | Alexander Ehlers | CC0 |

Not used (licence not confirmed as CC0): the "ShotgunSounds" pack, `TremLoadingloopl.wav`, `Cyberpunk Moonlight Sonata v2.mp3`.
Everything else you hear (reverb rooms, sub punches, whizz-bys, stingers, ability sounds, wind/hum beds, heartbeat) is
synthesised at runtime in `game/audio.js`, so it costs no download.
