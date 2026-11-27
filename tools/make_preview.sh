#!/usr/bin/env bash
# Cut the CrazyGames preview videos from tools/capture_preview.cjs clips (2560x1440 sources) + the covers.
#   bash tools/make_preview.sh [raw=media/raw/preview] [covers=media/covers-v2] [out=media/preview-v2] [scenes="lantern neon belltower"] [secs=6]
# Writes video_landscape.mp4 (1920x1080) and video_portrait.mp4 (1080x1620, centre crop): ~19 s, 30 fps, no audio.
# Opens on the static cover (CrazyGames: "use the cover as the opening frame"), then real-speed gameplay cuts.
set -euo pipefail
RAW=${1:-media/raw/preview}; COV=${2:-media/covers-v2}; OUT=${3:-media/preview-v2}; SCENES=(${4:-lantern neon belltower}); SECS=${5:-6}
mkdir -p "$OUT"
build() {   # $1 = landscape|portrait
  local o=$1 W H cover vf
  if [ "$o" = landscape ]; then W=1920; H=1080; cover="$COV/cover_16x9.png"; vf="scale=${W}:${H}:flags=lanczos"
  else W=1080; H=1620; cover="$COV/cover_2x3.png"; vf="crop=960:1440:(iw-960)/2:0,scale=${W}:${H}:flags=lanczos"; fi
  local inputs=(-loop 1 -t 1.2 -framerate 30 -i "$cover") fc="[0:v]scale=${W}:${H}:flags=lanczos,setsar=1,fps=30,format=yuv420p[c0];" n=0
  for s in "${SCENES[@]}"; do n=$((n+1)); inputs+=(-i "$RAW/$s.mp4"); fc+="[$n:v]trim=0.3:$(echo "$SECS+0.3" | bc),setpts=PTS-STARTPTS,${vf},setsar=1,fps=30,format=yuv420p[c$n];"; done
  # cover -> first scene: 0.4 s crossfade; between scenes: 0.25 s white flash-ish fade
  local last="c0" off=0.8 i
  fc+="[c0][c1]xfade=transition=fade:duration=0.4:offset=${off}[x1];"; last="x1"; off=$(echo "$off+$SECS-0.25" | bc)
  for ((i=2;i<=n;i++)); do fc+="[$last][c$i]xfade=transition=fadewhite:duration=0.25:offset=${off}[x$i];"; last="x$i"; off=$(echo "$off+$SECS-0.25" | bc); done
  ffmpeg -y -v error "${inputs[@]}" -filter_complex "${fc%;}" -map "[$last]" -an -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart -r 30 "$OUT/video_$o.mp4"
  echo "$o: $(ffprobe -v error -show_entries format=duration:stream=width,height -of csv=p=0 "$OUT/video_$o.mp4" | tr '\n' ' ') $(du -h "$OUT/video_$o.mp4" | cut -f1)"
}
build landscape; build portrait
