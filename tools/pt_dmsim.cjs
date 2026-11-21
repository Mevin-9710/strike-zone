// Deathmatch balance sim (headless): an idle player for N seconds; reports bot K/D, player deaths, spawn heights/separation.
// usage: node tools/pt_dmsim.cjs [seconds]
const { chromium } = require('../tests/node_modules/playwright-core');
const secs = +(process.argv[2] || 60);
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  await pg.goto('http://localhost:8765/?test=1'); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
  console.log(JSON.stringify(await pg.evaluate(n => { const g = __game; g.start(0, { mode: 'dm' }); const seen = new Set(), ys = [], sep = []; let jumps = 0, pdeaths = 0, was = true, firstDeath = null, rampage = null;
    for (let i = 0; i < n * 10; i++) { g.step(0.1);
      for (const e of g.enemies) { if (!seen.has(e)) { seen.add(e); ys.push(Math.round(e.pos.y)); let m = 99; for (const o of g.enemies) if (o !== e && o.alive) m = Math.min(m, o.pos.distanceTo(e.pos)); sep.push(Math.round(m)); } if (e.alive && e.vel.y > 3) jumps++; }
      if (was && !g.player.alive) { pdeaths++; if (firstDeath === null) firstDeath = i / 10; } was = g.player.alive; if (rampage === null && g.DM.rampage) rampage = i / 10; if (g.state.matchOver) break; }
    return { secs: n, target: g.DM.target, roster: g.DM.roster.map(r => `${r.name}:${r.k}/${r.d}`), playerDeaths: pdeaths, firstDeathAt: firstDeath, rampageAt: rampage, ys: ys.join(','), minSep: sep.join(','), jumps }; }, secs)));
  await b.close();
})();
