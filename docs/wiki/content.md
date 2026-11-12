# Content reference (from game/enemies.js, game/weapons.js, game.js)
## Enemies (`ENEMY_TYPES`)
| type | name | HP | weapon | notes |
|---|---|---|---|---|
| guard | Guard | 100 | ar7_lance | basic rifleman |
| heavy | Heavy | 230 | grinder_lmg | slow, long bursts |
| sniper | Sniper | 80 | longshot_bolt | 42 dmg, laser tell |
| commander | Commander | 160 | warden_br | |
| warden | Okonkwo (boss, m12) | 950 | warden_br | commander model |
| drone | Drone | 60 | none | flies; avoids walls |
| turret | Turret | 180 | none | static |
See the full table in enemies.js for speed, burst, rof, acc, range, react and fov.

## Weapons (`WEAPONS`)
Primaries: ar7_lance (AR-7 Lance), kestrel_bp, warden_br, grinder_lmg, hailstorm_mg, longshot_bolt, javelin_amr. Sidearms: vex_p9, harrow_45, bulldog_r6.
| id | class | auto | rpm | dmg | mag | unlock |
|---|---|---|---|---|---|---|
| vex_p9 | pistol | no | 420 | 26 | 15 | base |
| harrow_45 | pistol | no | 320 | 38 | 9 | after M1 |
| bulldog_r6 | revolver | no | 130 | 64 | 6 | after M3 |
| ar7_lance | assault | yes | 620 | 28 | 30 | base |
| kestrel_bp | assault | yes | 760 | 24 | 30 | base |
| warden_br | assault | no | 380 | 44 | 20 | after M2 |
| grinder_lmg | MG | yes | 680 | 26 | 100 | after M4 |
| hailstorm_mg | MG | yes | 900 | 20 | 60 | after M7 |
| longshot_bolt | sniper (scope, bolt) | no | 48 | 110 | 5 | after M6 |
| javelin_amr | sniper (scope) | no | 40 | 150 | 5 | after M9 |

## Abilities (`ABILITIES`, cooldown in s)
smoke 18, flash 14, dash 8, sensor 16, shield 24, decoy 15, lockdown 28, drone 26. Each mission has a `pool`; the player picks 2 (Q / F). The default is the first two in the pool.

## Operatives
rhea (base), kade (after M1), yuna (after M3), tomas (after M5), amara (after M8; also the tutorial mentor). They are cosmetic, with no stat differences in code. The Agent step is skipped when fewer than 2 are unlocked.
