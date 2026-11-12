#!/usr/bin/env bash
# Strike Zone media edit pass (ffmpeg). Input: media/raw/ from tools/capture_media.cjs. Output: media/{screenshots,clips,trailer}.
# Usage: bash tools/capture_media.sh
set -euo pipefail
cd "$(dirname "$0")/.."
R=media/raw; S=media/screenshots; C=media/clips; T=media/trailer
FONT=fonts/Oswald.ttf
mkdir -p "$S/portrait" "$S/covers" "$C" "$T"
calc() { python3 -c "print(round($1, 3))"; }
FF="ffmpeg -y -v error -hide_banner"

# ---------- screenshots: SHOTS="src:name ..." (src = file stem in media/raw) ----------
SHOTS=${SHOTS:-}
PORTRAIT=${PORTRAIT:-}
for p in $SHOTS; do src=${p%%:*}; name=${p##*:}; $FF -i "$R/$src.png" -vf scale=1920:1080:flags=lanczos "$S/$name.png"; done
# portrait reframes: 608x1080 crop around the crosshair, scaled to 1080x1920 (no letterbox)
for p in $PORTRAIT; do $FF -i "$S/$p.png" -vf "crop=608:1080:656:0,scale=1080:1920:flags=lanczos" "$S/portrait/${p}_1080x1920.png"; done

# ---------- covers with title overlay ----------
COVER_SRC=${COVER_SRC:-$S/01.png}
title() { # $1 w $2 h $3 out ; text sized from height/width
  local w=$1 h=$2; local fs=$(( w < h ? w / 6 : h / 6 )); local sub=$(( (w < h ? w : h) / 22 ))
  $FF -i "$COVER_SRC" -vf "scale=$w:$h:force_original_aspect_ratio=increase:flags=lanczos,crop=$w:$h,
    drawbox=x=0:y=ih*0.58:w=iw:h=ih*0.42:color=black@0.45:t=fill,
    drawtext=fontfile=$FONT:text='STRIKE ZONE':fontsize=$fs:fontcolor=0xFFD23C:borderw=$(( fs / 14 )):bordercolor=black:x=(w-tw)/2:y=h*0.64,
    drawtext=fontfile=$FONT:text='STOP THE MERIDIAN COVENANT':fontsize=$sub:fontcolor=white:borderw=2:bordercolor=black:x=(w-tw)/2:y=h*0.64+$fs*1.12" \
    -frames:v 1 "$3"
}
title 1920 1080 "$S/covers/cover_1920x1080.png"
COVER_SRC=${COVER_SRC_P:-$COVER_SRC} title 800 1200 "$S/covers/cover_800x1200.png"
title 800 470 "$S/covers/cover_800x470.png"

# ---------- looping clips: CLIPS="raw_clip:start:len:name ..." ----------
# Loop trick: play [start+X, start+len], cross-fade the last X s into [start, start+X] -> the last frame flows into the first.
X=0.5
for p in ${CLIPS:-}; do IFS=: read -r src st len name <<<"$p"
  in="$R/clip_$src.mp4"; e=$(calc "$st + $len"); off=$(calc "$len - 2*$X")
  loop="[0:v]trim=$(calc "$st+$X"):$e,setpts=PTS-STARTPTS[a];[0:v]trim=$st:$(calc "$st+$X"),setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=$X:offset=$off,eq=contrast=1.06:saturation=1.15"
  $FF -i "$in" -filter_complex "$loop[v]" -map "[v]" -an -c:v libx264 -preset slow -crf 22 -maxrate 7M -bufsize 10M -pix_fmt yuv420p -movflags +faststart "$C/${name}_16x9.mp4"
  $FF -i "$C/${name}_16x9.mp4" -vf "crop=608:1080:656:0,scale=1080:1920:flags=lanczos" -c:v libx264 -preset slow -crf 23 -maxrate 6M -bufsize 9M -pix_fmt yuv420p -movflags +faststart "$C/${name}_9x16.mp4"
  $FF -i "$C/${name}_16x9.mp4" -vf scale=1280:720 -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 -deadline good -cpu-used 4 "$C/${name}_16x9.webm"
  $FF -i "$C/${name}_9x16.mp4" -vf scale=540:960 -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 -deadline good -cpu-used 4 "$C/${name}_9x16.webm"
done

# ---------- trailer ----------
# CUTS="raw_clip:start:len ..." in order; title cards between groups via CARD markers "card:Text|Sub:secs"
if [ -n "${CUTS:-}" ]; then
  tmp=$(mktemp -d); i=0; : > "$tmp/list.txt"
  for c in $CUTS; do i=$((i+1)); f=$(printf "%s/%03d.mp4" "$tmp" $i)
    if [[ $c == card:* ]]; then IFS=: read -r _ txt secs <<<"$c"; main=${txt%%|*}; sub=${txt#*|}; main=${main//_/ }; sub=${sub//_/ }
      $FF -f lavfi -i "color=c=0x0b0d12:s=1920x1080:r=30:d=$secs" -vf "drawtext=fontfile=$FONT:text='$main':fontsize=130:fontcolor=0xFFD23C:x=(w-tw)/2:y=(h-th)/2-60,
        drawtext=fontfile=$FONT:text='$sub':fontsize=52:fontcolor=white:x=(w-tw)/2:y=(h/2)+70,fade=in:0:8,fade=out:st=$(calc "$secs-0.3"):d=0.3" -c:v libx264 -crf 16 -pix_fmt yuv420p "$f"
    else IFS=: read -r src st len <<<"$c"
      $FF -ss "$st" -t "$len" -i "$R/clip_$src.mp4" -vf "scale=1920:1080,fps=30,eq=contrast=1.08:saturation=1.2,fade=in:0:3,fade=out:st=$(calc "$len-0.1"):d=0.1" -an -c:v libx264 -crf 16 -pix_fmt yuv420p "$f"
    fi; echo "file '$f'" >> "$tmp/list.txt"; done
  $FF -f concat -safe 0 -i "$tmp/list.txt" -c copy "$tmp/video.mp4"
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmp/video.mp4")
  AUD=()
  if [ -f "$R/audio_bed.webm" ]; then AUD=(-i "$R/audio_bed.webm" -map 1:a -af "afade=in:0:d=1.5,afade=out:st=$(calc "$dur-2.5"):d=2.5,loudnorm=I=-15" -c:a aac -b:a 160k -shortest); fi
  $FF -i "$tmp/video.mp4" "${AUD[@]}" -map 0:v -c:v libx264 -preset slow -crf 21 -maxrate 8M -bufsize 12M -pix_fmt yuv420p -movflags +faststart "$T/strike_zone_trailer_16x9.mp4"
  # portrait: gameplay is a centre crop; title cards (found by blackdetect) are shown full width on a stretched card background so text is never cut
  E=$(ffmpeg -v info -i "$T/strike_zone_trailer_16x9.mp4" -vf "blackdetect=d=0.8:pix_th=0.13:pic_th=0.8" -an -f null - 2>&1 | grep -o "black_start:[0-9.]* black_end:[0-9.]*" | sed -E 's/black_start:([0-9.]+) black_end:([0-9.]+)/between(t,\1,\2)/' | paste -sd+)
  $FF -i "$T/strike_zone_trailer_16x9.mp4" -filter_complex "[0:v]split=3[a][b][bg];[a]crop=608:1080:656:0,scale=1080:1920:flags=lanczos[g];[bg]crop=1920:150:0:0,scale=1080:1920[bgs];[b]scale=1400:788:flags=lanczos,crop=1080:788[txt];[bgs][txt]overlay=0:566[c];[g][c]overlay=0:0:enable='${E:-0}'[v]" -map "[v]" -map 0:a? -c:v libx264 -preset slow -crf 22 -maxrate 7M -bufsize 10M -pix_fmt yuv420p -c:a copy -movflags +faststart "$T/strike_zone_trailer_9x16.mp4"
  rm -rf "$tmp"
fi
ls -la "$S" "$S/portrait" "$S/covers" "$C" "$T"
