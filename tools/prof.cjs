const { chromium } = require('../tests/node_modules/playwright-core');
const mi = +(process.argv[2] ?? 6);
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const pg = await (await b.newContext({ viewport: { width: 480, height: 270 } })).newPage();
  await pg.goto('http://localhost:8765/index.html?test=1');
  await pg.waitForFunction(() => window.__game?.ready && document.getElementById('lobby').classList.contains('show'), null, { timeout: 120000 });
  await pg.evaluate(i => { __game.setQuality('medium'); __game.start(i); }, mi);
  await pg.waitForTimeout(1500);
  const c = await pg.context().newCDPSession(pg);
  await c.send('Profiler.enable'); await c.send('Profiler.start');
  await pg.waitForTimeout(6000);
  const { profile } = await c.send('Profiler.stop');
  const self = {}, dt = profile.timeDeltas, idx = {}; profile.nodes.forEach(n => idx[n.id] = n);
  profile.samples.forEach((s, i) => { const n = idx[s].callFrame; const k = `${n.functionName || '(anon)'} ${n.url.split('/').slice(-2).join('/')}:${n.lineNumber}`; self[k] = (self[k] || 0) + dt[i] / 1000; });
  Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log(v.toFixed(0).padStart(6), k));
  await b.close();
})();
