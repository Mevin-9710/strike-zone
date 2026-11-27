#!/usr/bin/env bash
# Builds sfx/*.mp3 (trimmed, loudness-matched, game-ready) and sfx/music/*.mp3 from the raw CC0 packs.
# Sources: /mnt/project-files/strike-zone-assets/sfx (unzip into $SRC first, see sfx/CREDITS.md). Re-run after changing a mapping.
#   SRC=/tmp/sfxsrc bash tools/import_audio.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${SRC:-/tmp/sfxsrc}"
GUN="$SRC/prep/Prepared SFX Library"
KEN="$SRC/kenney_impact-sounds/Audio"
CC0="$SRC/100-CC0-SFX_0"
YD="$SRC/yd-Sounds/yd-Sounds"
FAN="$SRC/Fantozzi-footsteps/ogg"
RL="$SRC/loose"
MUS="$SRC/Alexander Ehlers - Free Music Pack/Alexander Ehlers - Free Music Pack"
OUT=sfx; mkdir -p "$OUT/music"; rm -f "$OUT"/*.mp3 "$OUT"/music/*.mp3

# gun <in> <out> <seconds>: trims leading silence, keeps shot + early tail, fades, -11 LUFS, stereo 44.1k
gun() {
  ffmpeg -y -v error -i "$1" -af "silenceremove=start_periods=1:start_threshold=-38dB,atrim=0:$3,afade=t=out:st=$(awk "BEGIN{print $3*0.45}"):d=$(awk "BEGIN{print $3*0.55}"),loudnorm=I=-11:TP=-0.5:LRA=11,aresample=44100" \
    -ac 2 -b:a 112k "$OUT/$2.mp3"
}
# fx <in> <out> <seconds> [extra filters]: mono 44.1k, 80k
fx() {
  ffmpeg -y -v error -i "$1" -af "silenceremove=start_periods=1:start_threshold=-45dB,atrim=0:$3,afade=t=out:st=$(awk "BEGIN{print $3*0.7}"):d=$(awk "BEGIN{print $3*0.3}")${4:+,$4},aresample=44100" \
    -ac 1 -b:a 80k "$OUT/$2.mp3"
}
# slice <in> <out> <start> <end>: slice of a recording (reload parts)
slice() {
  local d; d=$(awk "BEGIN{print $4-$3}")
  ffmpeg -y -v error -i "$1" -af "atrim=$3:$4,asetpts=N/SR/TB,afade=t=in:d=0.004,afade=t=out:st=$(awk "BEGIN{print $d*0.75}"):d=$(awk "BEGIN{print $d*0.25}"),loudnorm=I=-16:TP=-1,aresample=44100" \
    -ac 1 -b:a 80k "$OUT/$2.mp3"
}
# music <in> <out> <start> <len>: streamed track, -17 LUFS (the packs master at -6..-10), 80k stereo
music() {
  ffmpeg -y -v error -ss "$3" -t "$4" -i "$1" -af "afade=t=in:d=1.2,afade=t=out:st=$(awk "BEGIN{print $4-2.5}"):d=2.5,loudnorm=I=-17:TP=-1.5:LRA=9,aresample=44100" \
    -ac 2 -b:a 80k "$OUT/music/$2.mp3"
}
g() { find "$GUN" -name "$1" | head -1; }

# ---- weapons: near (yours / close) + far (enemies at range). One real firearm per gun so every weapon sounds different.
gun "$(g X_39P.wav)" w_vex_p9 0.55;         gun "$(g X_31P.wav)" w_vex_p9_far 0.7          # Walther PPQ 9mm
gun "$(g A_42P.wav)" w_harrow_45 0.65;      gun "$(g A_34P.wav)" w_harrow_45_far 0.8       # 1911 .45
gun "$(g V_27P.wav)" w_bulldog_r6 0.85;     gun "$(g V_22P.wav)" w_bulldog_r6_far 0.9      # S&W 642 .38
gun "$(g D_32P.wav)" w_ar7_lance 0.55;      gun "$(g D_24P.wav)" w_ar7_lance_far 0.7       # AR-15 5.56
gun "$(g G_31P.wav)" w_kestrel_bp 0.45;     gun "$(g G_20P.wav)" w_kestrel_bp_far 0.6      # Carl Gustav M45 9mm SMG
gun "$(g U_14P.wav)" w_warden_br 0.75;      gun "$(g U_19P.wav)" w_warden_br_far 0.85      # SKS 7.62x39
gun "$(g C_28P.wav)" w_grinder_lmg 0.5;     gun "$(g C_31P.wav)" w_grinder_lmg_far 0.65    # AK-47 7.62x39
gun "$(g P_30P.wav)" w_hailstorm_mg 0.4;    gun "$(g P_16P.wav)" w_hailstorm_mg_far 0.55   # PPSh 7.62 Tokarev
gun "$(g W_29P.wav)" w_longshot_bolt 1.4;   gun "$(g W_24P.wav)" w_longshot_bolt_far 1.5   # Tikka T3 .30-06
gun "$(g M_21P.wav)" w_javelin_amr 1.6;     gun "$(g M_26P.wav)" w_javelin_amr_far 1.7     # Mosin Nagant 7.62x54

# ---- reloads (SpringySpringo "Gun reload sounds", airsoft foley): sliced into mag-out / mag-in / charge
slice "$RL/assaultriflereload1_0.wav" rl_rifle_out 0.13 0.36; slice "$RL/assaultriflereload1_0.wav" rl_rifle_in 1.02 1.46
slice "$RL/gunreload1.wav" rl_pistol_out 0.05 0.30; slice "$RL/gunreload1.wav" rl_pistol_in 0.66 1.08
slice "$RL/gunreload1.wav" rl_pistol_slide 1.24 1.52
slice "$RL/reload.wav" rl_heavy_out 0.08 0.22; slice "$RL/reload.wav" rl_heavy_in 0.56 0.78
slice "$RL/reload.wav" rl_heavy_charge 1.01 1.36
slice "$RL/shotguncock_0.wav" bolt 0.03 0.47
fx "$CC0/switch_01.ogg" empty 0.25

# ---- footsteps per surface + landing
for i in 0 1 2 3 4; do fx "$KEN/footstep_concrete_00$i.ogg" step_c$i 0.3; done
i=0; for f in L1 R1 L2 R2 L3 R3; do fx "$FAN/Fantozzi-Sand$f.ogg" step_s$i 0.32; fx "$FAN/Fantozzi-Stone$f.ogg" step_t$i 0.32; i=$((i+1)); done
fx "$YD/landing.ogg" land 0.4

# ---- bullet impacts, shell casings, hits
for i in 0 1 2; do
  fx "$KEN/impactMetal_light_00$i.ogg" impact_metal_$i 0.3
  fx "$KEN/impactPlank_medium_00$i.ogg" impact_wood_$i 0.3
  fx "$KEN/impactGeneric_light_00$i.ogg" impact_generic_$i 0.3
  fx "$KEN/impactPunch_medium_00$i.ogg" flesh_$i 0.25
  fx "$KEN/impactTin_medium_00$i.ogg" casing_$i 0.35 "asetrate=44100*1.5,aresample=44100,volume=0.8"
done
fx "$KEN/impactPunch_heavy_000.ogg" hit_body 0.3
fx "$KEN/impactGlass_light_002.ogg" hit_head 0.35
fx "$KEN/impactBell_heavy_001.ogg" kill_ding 0.9 "asetrate=44100*1.26,aresample=44100"

# ---- explosions, UI, world one-shots for ambience
fx "$CC0/explosion.ogg" boom 2.2
fx "$YD/explode.ogg" boom2 1.4
fx "$CC0/switch_02.ogg" ui_click 0.12
fx "$CC0/gong_01.ogg" amb_bell 1.4 "lowpass=f=2500"
fx "$CC0/bell_03.ogg" amb_bell2 1.78 "lowpass=f=3000"
fx "$CC0/splash_01.ogg" amb_water0 0.74 "lowpass=f=1600"
fx "$CC0/splash_02.ogg" amb_water1 0.65 "lowpass=f=1600"
fx "$CC0/machine_01.ogg" amb_machine 0.55 "lowpass=f=1800"
fx "$YD/door_open.ogg" amb_door 1.6 "lowpass=f=2200"

# ---- music (streamed after the first click, never blocks loading)
music "$MUS/Alexander Ehlers - Spacetime.mp3" menu 0 116
music "$MUS/Alexander Ehlers - Great mission.mp3" match 0 118.5
music "$MUS/Alexander Ehlers - Doomed.mp3" final 8 122

echo "sfx: $(du -ch "$OUT"/*.mp3 | tail -1 | cut -f1)  music: $(du -ch "$OUT"/music/*.mp3 | tail -1 | cut -f1)"
