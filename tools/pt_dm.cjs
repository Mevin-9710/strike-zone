const { chromium } = require('../tests/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await pg.addInitScript(() => { localStorage.setItem('sz_onboard_done', '1'); localStorage.setItem('sz_settings', JSON.stringify({ quality: 'low', qMigrated: 1 })); });
  await pg.goto('http://localhost:8765/?test=1');
  await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
  console.log(await pg.evaluate(() => { const g = __game; g.start(0, { mode: 'dm' }); const s1 = { run: g.state.running, n: g.enemies.length, mission: g.state.mission };
    g.killAll(); g.step(4); return { s1, n1: g.enemies.filter(e => e.alive).length, run: g.state.running, title: document.getElementById('endTitle').textContent }; }));
  console.log(errs.slice(0, 3)); await b.close();
})();
