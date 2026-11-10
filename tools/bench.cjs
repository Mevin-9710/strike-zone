// Perf bench: node tools/bench.cjs [label] [missionIdx] [throttle]. Needs server on :8765.
const { chromium } = require('../tests/node_modules/playwright-core');
const label = process.argv[2] || 'run', mi = +(process.argv[3] ?? 2), thr = +(process.argv[4] ?? 4);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const pg = await (await b.newContext({ viewport: { width: 480, height: 270 } })).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.addInitScript(q => window.__q = q, process.env.Q || 'medium'); await pg.goto('http://localhost:8765/index.html?test=1');
  await pg.waitForFunction(() => window.__game?.ready && (document.getElementById('lobby').classList.contains('show')), null, { timeout: 120000 });
  await pg.evaluate(i => { __game.setQuality(window.__q||'medium'); __game.start(i); __game.look(0.5, 0); }, mi);
  await pg.waitForTimeout(1500);
  const cdp = await pg.context().newCDPSession(pg);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: thr });
  await pg.evaluate(() => { window.__frames = []; gc && gc(); window.__h0 = performance.memory.usedJSHeapSize; });
  await pg.waitForTimeout(8000);
  const r = await pg.evaluate(() => {
    const f = __game_frames(); return f;
    function __game_frames() {
      const F = window.__frames, t = F.map(x => x[2]).filter(x => x > 0).sort((a, b) => a - b), up = F.map(x => x[0]), re = F.map(x => x[1]);
      const avg = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
      const low1 = t[Math.floor(t.length * 0.99)] || 0;
      const i = __game.info;
      return { frames: F.length, avgFrameMs: +avg(t).toFixed(1), p99Ms: low1, updMs: +avg(up).toFixed(2), renMs: +avg(re).toFixed(2), calls: i.calls, tris: i.triangles, geoms: i.geometries, tex: i.textures, q: i.q, heapDeltaKB: Math.round((performance.memory.usedJSHeapSize - window.__h0) / 1024) };
    }
  });
  console.log(label, JSON.stringify(r), errs.length ? 'ERR ' + errs[0] : '');
  await pg.screenshot({ path: `${process.env.CLAUDE_JOB_DIR || '/tmp'}/tmp/shot_${label}.png` });
  await b.close();
})();
