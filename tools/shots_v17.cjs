// v17 screenshots: desktop lobby (font) + phone landscape Deathmatch (button layout) -> /tmp/v17_*.jpg
const { chromium } = require('../tests/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  let ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); let pg = await ctx.newPage();
  await pg.goto('http://localhost:8765/?test=1'); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
  await pg.evaluate(() => __game.openLobby()); await pg.waitForTimeout(800); await pg.screenshot({ path: '/tmp/v17_lobby.jpg', quality: 55, timeout: 120000 }); await ctx.close();
  ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }); pg = await ctx.newPage();
  await pg.goto('http://localhost:8765/?test=1&touch=1'); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
  await pg.evaluate(() => { __game.start(0, { mode: 'dm' }); __game.step(1); }); await pg.waitForTimeout(500); await pg.screenshot({ path: '/tmp/v17_phone.jpg', quality: 55, timeout: 120000 });
  await b.close();
})();
