// v27: load each Deathmatch arena in the real game, report nav/spawn/draw stats, screenshot spawn + mid-match views
const { chromium } = require('../tests/node_modules/playwright-core');
const fs = require('fs'); fs.mkdirSync('media/raw/dmmaps', { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  pg.on('pageerror', e => console.log('ERR', e.message));
  await pg.addInitScript(() => { localStorage.setItem('sz_progress', '3'); localStorage.setItem('sz_tutorial_done', '1'); localStorage.setItem('sz_onboard_done', '1'); localStorage.setItem('sz_dm_played', '9'); localStorage.setItem('sz_settings', JSON.stringify({ quality: 'low', qMigrated: 1 })); });
  await pg.goto('http://localhost:8765/?test=1'); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
  for (let j = 0; j < 4; j++) {
    const r = await pg.evaluate(async j => {
      const M = await import('./world/dm-maps.js'); await M.loadDmMap(M.DM_MAPS[j].id);
      const g = __game; g.start(0, { mode: 'dm', dmMap: j }); g.step(0.5); g.render();
      const w = g.world, nav = w.nav;
      return { id: M.DM_MAPS[j].id, title: g.state.mission, nodes: nav?.nodes.length, pool: g.DM.pool.length, allies: g.allies.length, enemies: g.enemies.length, pos: g.player.pos.toArray().map(v => +v.toFixed(1)), calls: g.info.calls, tris: g.info.triangles, errs: g.errors.slice(-3) };
    }, j);
    console.log(JSON.stringify(r));
    await pg.screenshot({ path: `media/raw/dmmaps/${r.id}_spawn.png` });
    await pg.evaluate(() => { const g = __game; for (let i = 0; i < 20; i++) { g.player.hp = 100; g.step(1); } g.render(); });
    const s = await pg.evaluate(() => ({ A: __game.DM.score.A, B: __game.DM.score.B, pos: __game.player.pos.toArray().map(v => +v.toFixed(1)), stuck: __game.enemies.filter(e => e.alive).map(e => e.pos.toArray().map(v => +v.toFixed(0)).join(',')).join(' ') }));
    console.log('  after 20s', JSON.stringify(s));
    await pg.evaluate(() => { const g = __game, d = g.DM.pool; const p = d[(d.length / 2) | 0]; g.teleport(p.x, p.y, p.z); g.lookAt(g.map?.bounds ? 0 : 0, 2, 0); g.step(0.1); g.render(); });
    await pg.screenshot({ path: `media/raw/dmmaps/${r.id}_mid.png` });
  }
  await b.close();
})();
