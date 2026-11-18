const { chromium } = require('../tests/node_modules/playwright-core');
const { TICK } = require('./playtest.cjs');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await pg.addInitScript(() => { localStorage.setItem('sz_tutorial_done', '1'); localStorage.setItem('sz_onboard_done', '1'); localStorage.setItem('sz_settings', JSON.stringify({ quality: 'low', qMigrated: 1 })); });
  await pg.goto('http://localhost:8765/?test=1');
  await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
  await pg.evaluate(() => { __game.start(0); __game.killAll(); });
  for (let i = 0; i < 240; i++) {
    await pg.evaluate(TICK); await pg.evaluate(() => __game.step(0.25, 20));
    if (i % 20 === 0) console.log(await pg.evaluate(() => { const g = __game, P = g.player.pos, pt = g.map.points[0], G = g.guide;
      return `t=${(g.state.elapsed ?? 0)} pos ${P.x.toFixed(0)},${P.y.toFixed(1)},${P.z.toFixed(0)} pt ${pt.x.toFixed(0)},${pt.y.toFixed(1)},${pt.z.toFixed(0)} path ${G.path ? G.path.length : 'null'} len ${G.len | 0} wp ${G.wp ? [G.wp.x | 0, G.wp.y.toFixed(1), G.wp.z | 0] : '-'} over ${g.state.matchOver}`; }));
  }
  await b.close();
})();
