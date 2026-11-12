#!/usr/bin/env bash
# Idempotent setup for a fresh Linux container (no GPU): node deps + Playwright Chromium, python3, then a smoke run.
# Usage: bash tools/setup_cloud.sh [--full]   (--full runs the whole suite instead of the smoke check)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
SUDO=""; [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null && SUDO=sudo

if ! command -v python3 >/dev/null || ! command -v node >/dev/null; then
  if command -v apt-get >/dev/null; then
    $SUDO apt-get update -y
    command -v python3 >/dev/null || $SUDO apt-get install -y python3
    command -v node >/dev/null || $SUDO apt-get install -y nodejs npm
  else echo "install python3 and node >=18 manually"; exit 1; fi
fi
echo "node $(node -v), $(python3 --version)"

(cd tests && { [ -d node_modules/playwright-core ] || npm ci --no-audit --no-fund || npm install --no-audit --no-fund; })
# Chromium matching the installed playwright-core (+ system libs when we can install them)
(cd tests && { npx --yes playwright-core install --with-deps chromium 2>/dev/null || npx --yes playwright-core install chromium; })
CHROME=$(cd tests && node -e "console.log(require('playwright-core').chromium.executablePath())")
[ -x "$CHROME" ] || { echo "chromium not found at $CHROME"; exit 1; }
echo "export CHROME=$CHROME" > "$ROOT/tests/node_modules/.chrome-env"; echo "CHROME=$CHROME (also in tests/node_modules/.chrome-env)"

# Server (reuse if already up)
if ! curl -sf -o /dev/null http://localhost:8765/index.html; then
  nohup python3 tools/serve.py > /tmp/sz-serve.log 2>&1 &
  for i in $(seq 1 50); do curl -sf -o /dev/null http://localhost:8765/index.html && break; sleep 0.2; done
fi
curl -sf -o /dev/null http://localhost:8765/index.html || { echo "server did not start"; cat /tmp/sz-serve.log; exit 1; }

if [ "${1:-}" = "--full" ]; then (cd tests && CHROME="$CHROME" node run.cjs); exit $?; fi

# Smoke: boot with ?test=1, start mission 1, step 2 s, require no page errors
cd tests && CHROME="$CHROME" node -e '
const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME, headless: true, args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--no-sandbox"] });
  const pg = await b.newPage(); const errs = [];
  pg.on("pageerror", e => errs.push(String(e)));
  pg.on("console", m => { if (m.type() === "error" && !/AudioContext/.test(m.text())) errs.push(m.text()); });
  await pg.goto("http://localhost:8765/index.html?test=1");
  await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
  const s = await pg.evaluate(() => { __game.start(0); __game.step(2); return __game.state; });
  console.log("smoke: mission", s.mission, "running", s.running, "errors", errs.length); errs.forEach(e => console.log("  ", e));
  await b.close(); process.exit(errs.length || !s.running ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });'
echo "SMOKE OK. Full suite: cd tests && source node_modules/.chrome-env && node run.cjs"
