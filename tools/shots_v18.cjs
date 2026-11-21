// v18 screenshots: desktop lobby + DM HUD, phone landscape lobby + DM -> /tmp/v18.jpg (2x2)
const { chromium } = require('../tests/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [n, vp, t] of [['desk', { width: 1280, height: 720 }, false], ['ph', { width: 844, height: 390 }, true]]) {
    const ctx = await b.newContext({ viewport: vp, hasTouch: t, isMobile: t }); const pg = await ctx.newPage();
    await pg.goto('http://localhost:8765/?test=1' + (t ? '&touch=1' : '')); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
    await pg.evaluate(() => __game.openLobby()); await pg.waitForTimeout(800); await pg.screenshot({ path: `/tmp/v18_${n}_lobby.jpg`, quality: 55, timeout: 120000 });
    await pg.evaluate(() => { __game.start(3, { mode: 'dm', route: 'assault' }); for (let i = 0; i < 30; i++) __game.step(0.1); }); await pg.waitForTimeout(400);
    await pg.screenshot({ path: `/tmp/v18_${n}_dm.jpg`, quality: 55, timeout: 120000 }); await ctx.close();
  }
  await b.close();
})();
