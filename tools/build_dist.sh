#!/usr/bin/env bash
# Builds dist/ (runtime files only) and dist/strike-zone.zip for CrazyGames upload.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist && mkdir dist
cp index.html game.js menu.css dist/
cp -r game world fx dist/
mkdir -p dist/lib/addons/loaders dist/lib/addons/utils
cp lib/three.module.js lib/three.core.js dist/lib/
cp lib/addons/loaders/GLTFLoader.js dist/lib/addons/loaders/
cp lib/addons/utils/BufferGeometryUtils.js lib/addons/utils/SkeletonUtils.js dist/lib/addons/utils/
# models: only the folders the code loads from (kenney, props, rigged, weapons); no renders/src/top-level duplicates
for d in kenney props rigged weapons; do mkdir -p dist/models/$d; cp models/$d/*.glb dist/models/$d/; done
find dist -name '*.md' -delete
rm -f dist/strike-zone.zip
(cd dist && zip -qr -9 strike-zone.zip . -x strike-zone.zip)
echo "files: $(find dist -type f ! -name strike-zone.zip | wc -l)"
du -sh dist --exclude=strike-zone.zip | tail -1
ls -l dist/strike-zone.zip | awk '{printf "zip: %.1f MB\n",$5/1048576}'
