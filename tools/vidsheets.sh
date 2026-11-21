#!/usr/bin/env bash
# Contact sheets from a video: one frame every STEP seconds, 4x3 tiles per sheet, timestamps burned in.
# usage: tools/vidsheets.sh VIDEO OUTDIR [STEP]
set -e
v="$1"; out="$2"; step="${3:-6}"; mkdir -p "$out"; n=$(basename "${v%.*}")
ffmpeg -loglevel error -y -i "$v" -vf "fps=1/$step,scale=426:-2,drawtext=text='%{pts\:hms}':x=4:y=4:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=4x3" "$out/${n}_%02d.jpg"
ls "$out" | grep -c "^${n}_"
