#!/usr/bin/env bash
# Builds dist/ (runtime files only), dist/strike-zone.zip and dist/strike-zone-crazygames.zip (index.html at zip root,
# relative paths only) for CrazyGames upload.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist && mkdir dist
cp index.html game.js menu.css v14.css ui26.css dist/
cp -r game world fx fonts sfx dist/
mkdir -p dist/lib/addons/loaders dist/lib/addons/utils dist/lib/addons/libs
cp lib/three.module.js lib/three.core.js dist/lib/
cp lib/addons/loaders/GLTFLoader.js dist/lib/addons/loaders/
cp lib/addons/utils/BufferGeometryUtils.js lib/addons/utils/SkeletonUtils.js dist/lib/addons/utils/
cp lib/addons/libs/meshopt_decoder.module.js dist/lib/addons/libs/   # v43: models are meshopt-compressed
# models: only the folders the code loads from (kenney, props, rigged, weapons); no renders/src/top-level duplicates
for d in kenney props rigged weapons; do mkdir -p dist/models/$d; cp models/$d/*.glb dist/models/$d/; done
mkdir -p dist/models/dm; cp models/dm/*.glb models/dm/*.json dist/models/dm/
find dist \( -name '*.md' -o -name 'project.godot' \) -delete
# guard: no absolute/root-relative asset paths (the CrazyGames iframe serves the zip from a sub-path)
if grep -nE "(src|href)=\"/[^/]|from '/|import\('/" dist/index.html dist/game.js dist/game/*.js dist/world/*.js dist/fx/*.js; then echo 'absolute path found' >&2; exit 1; fi
# guard (v43.1): every relative ES module import in dist must resolve to a file in dist (a missing one blanks the game)
miss=0
while IFS= read -r f; do
  for spec in $(grep -vE "^[[:space:]]*(//|\*)" "$f" | grep -oE "(from|import)[[:space:]]*\(?'\.{1,2}/[^']+'" | grep -oE "'[^']+'" | tr -d "'"); do
    t="$(realpath -m "$(dirname "$f")/$spec")"; [ -f "$t" ] || { echo "missing import: $f -> $spec" >&2; miss=1; }
  done
done < <(find dist -name '*.js' -o -name 'index.html')
[ "$miss" = 0 ] || exit 1
rm -f dist/*.zip
(cd dist && zip -qr -9 strike-zone.zip . -x '*.zip')
cp dist/strike-zone.zip dist/strike-zone-crazygames.zip
unzip -Z1 dist/strike-zone-crazygames.zip > dist/.ls; grep -qx 'index.html' dist/.ls || { echo 'index.html not at zip root' >&2; exit 1; }; rm dist/.ls
echo "files: $(find dist -type f ! -name '*.zip' | wc -l)"
du -sh dist --exclude='*.zip' | tail -1
ls -l dist/strike-zone-crazygames.zip | awk '{printf "zip: %.1f MB\n",$5/1048576}'
