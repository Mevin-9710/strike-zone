// Autopilot playtest: a fresh player on desktop / phone landscape / phone portrait plays the first levels with a simple
// bot (aim at the nearest hostile and shoot, otherwise walk at the objective, hold E/R when asked). Reports the timeline
// and saves screenshots to media/raw/playtest/. Usage: python3 tools/serve.py & node tools/playtest.cjs [levels=3]
const { chromium } = require('../tests/node_modules/playwright-core');
const fs = require('fs');
const OUT = 'media/raw/playtest'; fs.mkdirSync(OUT, { recursive: true });
const LEVELS = +process.argv[2] || 3;
const DEVICES = [
  { name: 'desktop', viewport: { width: 1280, height: 720 } },
  { name: 'phone-landscape', viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
  { name: 'phone-portrait', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
];

// one bot tick in page context: returns a short status
const TICK = () => {
  const g = __game, s = g.state, P = g.player.pos, eye = P.clone(); eye.y += 1.6;
  let best = null, bd = 1e9;
  for (const e of g.enemies) if (e.alive) { const d = e.pos.distanceTo(P); if (d < bd) { bd = d; best = e; } }
  const step = g.tutorial?.active ? g.tutorial.step : null;
  for (const k of ['KeyW', 'KeyA', 'KeyD', 'Space', 'KeyE', 'KeyR']) g.key(k, false); g.mouse('l', false);
  if (step === 'look') { g.player.yaw += 0.4; return { hp: Math.round(s.hp), step, near: Math.round(bd), pos: [P.x | 0, P.z | 0] }; }
  const B = window.__bot ??= { last: P.clone(), still: 0, side: 'KeyA' };       // stuck on a wall? strafe + jump for a bit
  B.still = P.distanceTo(B.last) < 0.3 ? B.still + 1 : 0; B.last.copy(P);
  if (B.still > 6) { if (B.still % 12 === 7) B.side = Math.random() < 0.5 ? 'KeyA' : 'KeyD'; g.key(B.side, true); g.key('Space', true); }
  if (step === 'reload') g.key('KeyR', true);
  const pt = g.guide?.wp || g.map.points?.[0];
  if (best && bd < 28 && step !== 'look' && step !== 'move') { g.lookAt(best.pos.x, best.pos.y + 1.3, best.pos.z); g.mouse('l', true); if (bd > 9) g.key('KeyW', true); }
  else if (pt) {
    const d = Math.hypot(pt.x - P.x, pt.z - P.z);
    g.lookAt(pt.x, pt.y + 1, pt.z);
    if (d > 1.6) g.key('KeyW', true); else g.key('KeyE', true);
    if (step === 'fire' || step === 'aim') g.mouse('l', true);
  }
  return { hp: Math.round(s.hp), alive: g.enemies.filter(e => e.alive).length, near: Math.round(bd), step, pos: [P.x | 0, P.z | 0] };
};

async function session(dev) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: dev.viewport, hasTouch: !!dev.hasTouch, isMobile: !!dev.isMobile });
  await ctx.addInitScript(() => { if (sessionStorage.getItem('pt')) return; sessionStorage.setItem('pt', 1); localStorage.clear(); localStorage.setItem('sz_settings', JSON.stringify({ quality: 'low', qMigrated: 1 })); });
  const pg = await ctx.newPage(), errs = []; pg.on('pageerror', e => errs.push(e.message));
  const t0 = Date.now(); await pg.goto('http://localhost:8765/');
  await pg.waitForFunction(() => window.__game?.ready && __game.state.running, null, { timeout: 120000 });
  const log = [`boot→gameplay ${((Date.now() - t0) / 1000).toFixed(1)}s (real, swiftshader)`];
  await pg.screenshot({ path: `${OUT}/${dev.name}_0_start.png` });
  for (let lv = 0; lv < LEVELS; lv++) {
    let last = '', firstKill = null, contact = null, steps = [], lowHp = 100;
    for (let i = 0; i < 4 * 200; i++) {                       // up to 200 game-seconds, 0.25 s per tick
      const r = await pg.evaluate(TICK);
      await pg.evaluate(() => __game.step(0.25, 20));
      const st = await pg.evaluate(() => ({ run: __game.state.running, over: __game.state.matchOver, k: __game.enemies.filter(e => !e.alive).length, c: __game.enemies.some(e => e.alive && e.state === 'combat'), clock: Math.round(__game.state.clock) }));
      const t = i / 4;
      if (r.step && r.step !== last) { steps.push(`${r.step}@${t}s`); last = r.step; }
      if (st.c && contact === null) contact = t;
      if (st.k && firstKill === null) firstKill = t;
      lowHp = Math.min(lowHp, r.hp);
      if (i === 40) await pg.screenshot({ path: `${OUT}/${dev.name}_${lv + 1}_play.png` });
      if (st.over || !st.run) {
        const end = await pg.evaluate(() => ({ title: document.getElementById('endTitle').textContent, mission: __game.state.mission }));
        log.push(`L${lv + 1} ${end.mission}: "${end.title}" at ${t}s · contact ${contact ?? '-'}s · 1st kill ${firstKill ?? '-'}s · lowest HP ${lowHp}` + (steps.length ? ` · drill ${steps.join(' ')}` : ''));
        await pg.screenshot({ path: `${OUT}/${dev.name}_${lv + 1}_end.png` });
        break;
      }
      if (i === 4 * 200 - 1) log.push(`L${lv + 1}: still running after 200 s · contact ${contact ?? '-'} · near ${r.near}m · pos ${r.pos} · clock ${st.clock}`);
    }
    const next = await pg.evaluate(() => { const n = document.getElementById('next'), a = document.getElementById('again'); const b = n && n.offsetParent ? n : a; b?.click(); return b?.id; });
    await pg.waitForFunction(() => __game.state.running, null, { timeout: 60000 }).catch(() => log.push('did not restart'));
    log.push(`  → clicked ${next}`);
  }
  if (errs.length) log.push('errors: ' + errs.slice(0, 3).join(' | '));
  await browser.close();
  return log;
}

module.exports = { TICK };
if (require.main === module) (async () => {
  for (const d of DEVICES) { const log = await session(d); console.log(`\n== ${d.name} ==\n` + log.join('\n')); }
})();
