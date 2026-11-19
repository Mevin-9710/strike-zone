const { chromium } = require('../tests/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { localStorage.setItem('sz_onboard_done', '1'); localStorage.setItem('sz_tutorial_done', '1'); localStorage.setItem('sz_settings', JSON.stringify({ quality: 'low', qMigrated: 1 })); });
  await pg.goto('http://localhost:8765/?test=1'); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
  console.log('loaded');
  await pg.evaluate(() => __game.start(0, { mode: 'dm' })); console.log('started');
  for (let r = 0; r < 6; r++) {
    const t = Date.now();
    const o = await pg.evaluate(() => { for (let i = 0; i < 15; i++) { const g = __game, e = g.enemies.filter(x => x.alive)[0]; if (!e) { g.step(0.5); continue; } g.teleport(e.pos.x + 3, e.pos.y, e.pos.z + 3); g.lookAt(e.pos.x, e.pos.y + 1.3, e.pos.z); g.fire(); g.step(0.12); }
      return { n: __game.enemies.length, alive: __game.enemies.filter(x => x.alive).length, hud: document.getElementById('dmK').textContent, tags: document.getElementById('dmS').textContent + '|' + document.getElementById('dmP').textContent }; });
    console.log(r, Date.now() - t, 'ms', JSON.stringify(o));
  }
  console.log(errs.slice(0, 3)); await b.close();
})();
