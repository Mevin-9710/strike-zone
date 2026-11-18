const { chromium } = require('../tests/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { localStorage.setItem('sz_progress', '2'); localStorage.setItem('sz_tutorial_done', '1'); localStorage.setItem('sz_onboard_done', '1'); localStorage.setItem('sz_settings', JSON.stringify({ quality: 'low', qMigrated: 1 })); });
  await pg.goto('http://localhost:8765/?test=1');
  await pg.waitForFunction(() => window.__game?.ready && document.getElementById('lobby').classList.contains('show'), null, { timeout: 120000 });
  await pg.evaluate(() => __game.start(1));
  const seq = [];
  for (const dy of [100, 100, 100, -100, -100]) { await pg.mouse.wheel(0, dy); await pg.waitForTimeout(300); seq.push(await pg.evaluate(() => __game.state.weapon)); }
  console.log('wheel down,down,down,up,up ->', seq.join(' '));
  const rc = await pg.evaluate(async () => { const m = await import('/game/remote.js'); await m.loadRemote(false); return { loaded: m.RC.loaded, hold: m.RC.holdSeconds }; });
  console.log('remote config fetch:', JSON.stringify(rc));
  console.log('errors', errs); await b.close();
})();
