#!/usr/bin/env bash
# v43: meshopt-compress every GLB the game loads (geometry + animation), in place.
# Re-run after exporting new models from Blender. Already-compressed files are skipped.
# Needs node + network once: npx fetches @gltf-transform/cli 4.1.1 into the npm cache.
# The game's loaders (world/gltf.js) decode EXT_meshopt_compression and turn attributes back into floats.
set -euo pipefail
cd "$(dirname "$0")/.."
GT="npx -y @gltf-transform/cli@4.1.1"
for f in models/dm/*.glb models/rigged/*.glb models/kenney/*.glb models/weapons/*.glb models/props/*.glb; do
  if head -c 4000 "$f" | grep -aq EXT_meshopt_compression; then echo "skip $f (already compressed)"; continue; fi
  tmp="$(mktemp --suffix=.glb)"
  $GT meshopt "$f" "$tmp" --level medium --vertex-layout separate --quantize-position 16 --quantize-texcoord 14 > /dev/null
  echo "$(stat -c%s "$f") -> $(stat -c%s "$tmp")  $f"; mv "$tmp" "$f"
done
