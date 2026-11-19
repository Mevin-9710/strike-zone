// HUD study: screenshots of Deathmatch + Story on desktop, phone landscape, phone portrait -> media/raw/hud/
const { chromium } = require('../tests/node_modules/playwright-core');
const fs = require('fs'); fs.mkdirSync('media/raw/hud', { recursive: true });
const D = [['desk', { width: 1280, height: 720 }, false], ['phoneL', { width: 844, height: 390 }, true], ['phoneP', { width: 390, height: 844 }, true]];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [n, vp, t] of D) {
    const ctx = await b.newContext({ viewport: vp, hasTouch: t, isMobile: t }); const pg = await ctx.newPage();
    await ctx.addInitScript(() => { localStorage.setItem('sz_progress', '3'); localStorage.setItem('sz_tutorial_done', '1'); localStorage.setItem('sz_onboard_done', '1'); localStorage.setItem('sz_settings', JSON.stringify({ quality: 'low', qMigrated: 1 })); });
    await pg.goto('http://localhost:8765/?test=1'); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
    await pg.evaluate(() => __game.openLobby()); await pg.waitForTimeout(600); await pg.screenshot({ path: `media/raw/hud/${n}_lobby.png` });
    await pg.click('#lPlay'); await pg.waitForTimeout(400); await pg.screenshot({ path: `media/raw/hud/${n}_pick.png` });
    await pg.evaluate(() => { __game.start(0, { mode: 'dm' }); __game.step(3); for (let i = 0; i < 25; i++) { const e = __game.enemies.filter(x => x.alive).sort((a, b) => a.pos.distanceTo(__game.player.pos) - b.pos.distanceTo(__game.player.pos))[0]; if (!e) { __game.step(0.5); continue; } __game.teleport(e.pos.x + 3, e.pos.y, e.pos.z + 3); __game.lookAt(e.pos.x, e.pos.y + 1.3, e.pos.z); __game.fire(); __game.step(0.12); } const e = __game.enemies.find(x => x.alive); if (e) __game.lookAt(e.pos.x, e.pos.y + 1.3, e.pos.z); __game.step(0.1); __game.render(); });
    await pg.waitForTimeout(300); await pg.screenshot({ path: `media/raw/hud/${n}_dm.png`, timeout: 120000 });
    await ctx.close();
  }
  await b.close();
})();
