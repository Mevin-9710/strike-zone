// Deterministic CPU bench: ms per update() + per render() submit, via __game.step. node tools/bench2.cjs label mission
const { chromium } = require('../tests/node_modules/playwright-core');
const label = process.argv[2], mi = +(process.argv[3] ?? 2);
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--js-flags=--expose-gc'] });
  const pg = await (await b.newContext({ viewport: { width: 320, height: 180 } })).newPage();
  await pg.goto('http://localhost:8765/index.html?test=1');
  await pg.waitForFunction(() => window.__game?.ready && document.getElementById('lobby').classList.contains('show'), null, { timeout: 120000 });
  const r = await pg.evaluate(async (i) => {
    const g = __game; g.setQuality('high'); g.start(i); g.look(0.5, 0); g.step(2);
    const res = [];
    for (let rep = 0; rep < 5; rep++) {
      gc(); const h0 = performance.memory?.usedJSHeapSize || 0;
      let t = performance.now(); const N = 120; for (let k = 0; k < N; k++) { g.step(1 / 30, 30); }   // update + render each
      const tot = performance.now() - t; res.push(tot / N);
    }
    const t1 = performance.now(); for (let k = 0; k < 60; k++) g.render(); const rn = (performance.now() - t1) / 60;
    res.sort((a, b) => a - b); const inf = g.info;
    return { stepMsMin: +res[0].toFixed(2), stepMsMed: +res[2].toFixed(2), renderOnlyMs: +rn.toFixed(2), calls: inf.calls, tris: inf.triangles };
  }, mi);
  console.log(label, mi, JSON.stringify(r));
  await b.close();
})();
