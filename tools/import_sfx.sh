#!/usr/bin/env bash
# Builds sfx/*.mp3 (small, trimmed, game-ready) from the raw kits in "../assets new/sfx/extracted".
# Re-run after changing the mapping. Sources + licences: sfx/CREDITS.md
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${SFX_SRC:-../assets new/sfx/extracted}"
GUN="$SRC/Prepared SFX Library/Prepared SFX Library"
KEN="$SRC/kenney_impact-sounds/Audio"
CC0="$SRC/100-CC0-SFX_0"
SHOTGUN="$SRC/shotgunsounds/ShotgunSounds"
OUT=sfx; mkdir -p "$OUT"

# gun: in, out, seconds. Trims leading silence, keeps the shot + tail, fades out, stereo 48k mp3.
gun() {
  ffmpeg -y -v error -i "$1" -af "silenceremove=start_periods=1:start_threshold=-40dB,atrim=0:$3,afade=t=out:st=$(awk "BEGIN{print $3*0.55}"):d=$(awk "BEGIN{print $3*0.45}"),loudnorm=I=-12:TP=-1,aresample=48000" \
    -ac 2 -b:a 128k "$OUT/$2.mp3"
}
# fx: in, out, seconds (mono, 96k)
fx() {
  ffmpeg -y -v error -i "$1" -af "silenceremove=start_periods=1:start_threshold=-45dB,atrim=0:$3,afade=t=out:st=$(awk "BEGIN{print $3*0.7}"):d=$(awk "BEGIN{print $3*0.3}"),aresample=48000" \
    -ac 1 -b:a 96k "$OUT/$2.mp3"
}

g() { find "$GUN" -name "$1" | head -1; }
# near (player) / far (enemies at distance)
gun "$(g X_39P.wav)" shot_pistol 0.45;      gun "$(g X_31P.wav)" shot_pistol_far 0.6
gun "$(g V_27P.wav)" shot_revolver 0.7;     gun "$(g V_22P.wav)" shot_revolver_far 0.8
gun "$(g D_32P.wav)" shot_assault 0.5;      gun "$(g D_24P.wav)" shot_assault_far 0.6
gun "$(g C_28P.wav)" shot_mg 0.42;          gun "$(g C_31P.wav)" shot_mg_far 0.55
gun "$(g W_29P.wav)" shot_sniper 1.3;       gun "$(g W_24P.wav)" shot_sniper_far 1.4

fx "$SHOTGUN/Rack.mp3" bolt 0.6
fx "$CC0/switch_01.ogg" empty 0.25
fx "$CC0/explosion.ogg" boom 2.2
for i in 0 1 2 3 4; do fx "$KEN/footstep_concrete_00$i.ogg" step_$i 0.35; done
for i in 0 1 2; do
  fx "$KEN/impactMetal_light_00$i.ogg" impact_metal_$i 0.3
  fx "$KEN/impactPlank_medium_00$i.ogg" impact_wood_$i 0.3
  fx "$KEN/impactGeneric_light_00$i.ogg" impact_generic_$i 0.3
done
du -ch "$OUT"/*.mp3 | tail -1
