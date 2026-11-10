// Per-mission screenshots + render stats. Usage: node tools/shots_maps.cjs <tag> [missionIdx...]  (server on :8811)
const { chromium } = require('../tests/node_modules/playwright-core');
const tag = process.argv[2] || 'after', only = process.argv.slice(3).map(Number);
const OUT = '/home/mevin/strike-zone-project/screenshots/maps';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
  await ctx.addInitScript(() => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', 1); localStorage.clear(); localStorage.setItem('sz_progress', '12'); localStorage.setItem('sz_tutorial_done', '1'); });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error' && !/AudioContext/.test(m.text())) errs.push(m.text()); });
  await pg.goto('http://localhost:8811/index.html?test=1' + (process.env.NOARCH ? '&noarch=1' : '') + '');
  await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 90000 });
  const n = await pg.evaluate(() => __game.MISSIONS.length);
  for (let i = 0; i < n; i++) {
    if (only.length && !only.includes(i)) continue;
    const info = await pg.evaluate(i => { __game.start(i); __game.peace(); __game.step(0.6); __game.render(); const r = __game.info; return { calls: r.calls, tris: r.triangles, id: __game.MISSIONS[i].id }; }, i);
    await pg.evaluate(() => __game.auto()); await pg.waitForTimeout(700);
    await pg.screenshot({ path: `${OUT}/${tag}_${String(i + 1).padStart(2, '0')}_a.png` });
    await pg.evaluate(() => { const g = __game; const p = g.map.spawns.default || g.map.spawns[Object.keys(g.map.spawns)[0]]; g.teleport(p.x * 0.4, 0.3, p.z * 0.4); g.look(Math.atan2(-p.x, -p.z) + 0.6, 0.1); g.step(0.5); g.auto(); }); await pg.waitForTimeout(700);
    await pg.screenshot({ path: `${OUT}/${tag}_${String(i + 1).padStart(2, '0')}_b.png` });
    await pg.evaluate(() => { const g = __game; const e = g.map.kit.minimap.filter(m => m.kind === 'roof' || m.kind === 'building').sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0)).find(m => m.x1 < 45 && m.x0 > -45 && m.z1 < 38) || g.map.kit.minimap[0]; g.teleport((e.x0 + e.x1) / 2, 0.3, e.z1 + 9); g.lookAt((e.x0 + e.x1) / 2, Math.min(e.y, 8) * 0.6, e.z1); g.step(0.5); g.auto(); }); await pg.waitForTimeout(700);
    await pg.screenshot({ path: `${OUT}/${tag}_${String(i + 1).padStart(2, '0')}_c.png` });
    await pg.evaluate(() => { const g = __game; g.setQuality && 0; g.teleport(-40, 40, 40); g.look(Math.PI * 0.25 * -1 + 0.0, -0.5); g.render(); g.auto(); g.player.vel.set(0,0,0); }); await pg.waitForTimeout(150);
    await pg.screenshot({ path: `${OUT}/${tag}_${String(i + 1).padStart(2, '0')}_d.png` });
    console.log(tag, info.id, 'calls', info.calls, 'tris', info.tris);
  }
  console.log('errors', errs.slice(0, 5));
  await b.close();
})();
