// UI study: lobby, TDM HUD, death card, scoreboard (Tab), pause, end -> media/raw/ui/<tag>_*.png  (usage: node tools/shots_ui.cjs TAG)
const { chromium } = require('../tests/node_modules/playwright-core');
const fs = require('fs'); const tag = process.argv[2] || 'now'; fs.mkdirSync('media/raw/ui', { recursive: true });
const D = [['desk', { width: 1280, height: 720 }, false], ['phoneL', { width: 844, height: 390 }, true]];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [n, vp, t] of D) {
    const ctx = await b.newContext({ viewport: vp, hasTouch: t, isMobile: t }); const pg = await ctx.newPage();
    pg.on('pageerror', e => console.log('ERR', n, e.message));
    await ctx.addInitScript(() => { localStorage.setItem('sz_progress', '3'); localStorage.setItem('sz_tutorial_done', '1'); localStorage.setItem('sz_onboard_done', '1'); localStorage.setItem('sz_dm_played', '9'); localStorage.setItem('sz_settings', JSON.stringify({ quality: 'low', qMigrated: 1 })); });
    await pg.goto('http://localhost:8765/?test=1'); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
    const shot = async s => { await pg.waitForTimeout(400); await pg.screenshot({ path: `media/raw/ui/${tag}_${n}_${s}.png`, timeout: 120000 }); };
    await pg.evaluate(() => __game.openLobby()); await shot('lobby');
    await pg.evaluate(() => { const g = __game; g.start(0, { mode: 'dm' }); g.step(2); g.addKills(7); const e = g.enemies.find(x => x.alive); if (e) { g.teleport(e.pos.x + 4, e.pos.y, e.pos.z + 4); g.lookAt(e.pos.x, e.pos.y + 1.3, e.pos.z); } g.step(0.2); g.render(); }); await shot('hud');
    await pg.evaluate(() => { const g = __game; g.ui?.board?.(true); g.render(); }); await shot('board'); await pg.evaluate(() => __game.ui?.board?.(false));
    await pg.evaluate(() => { const g = __game; for (let i = 0; i < 6 && g.player.hp > 0; i++) { g.damage(30); g.step(0.1); } g.step(0.6); g.render(); }); await shot('death');
    await pg.evaluate(() => { const g = __game; g.step(4); g.ui?.pause?.(); g.render(); }); await shot('pause');
    await pg.evaluate(() => { const g = __game; g.timeout(); g.step(0.2); }); await shot('end');
    await ctx.close();
  }
  await b.close();
})();
