// Battle royale test: starts server/server.mjs with a fast zone, opens real game clients (desktop + phone) against it.
// Run (static server on :8765 as for run.cjs):  cd tests && node br.cjs
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');
const BASE = process.env.SZ_URL || 'http://localhost:8765/index.html';
const PORT = 8792, MP = `ws://localhost:${PORT}`;
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  [' + info + ']' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function client(browser, { phone = false, name } = {}) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(n => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.clear(); localStorage.setItem('sz_onboard_done', '1'); localStorage.setItem('sz_tutorial_done', '1'); localStorage.setItem('sz_name', JSON.stringify(n));
    localStorage.setItem('sz_login', JSON.stringify({ last: new Date().toISOString().slice(0, 10), day: 1 }));
    localStorage.setItem('sz_settings', JSON.stringify({ quality: 'low', qMigrated: 1 }));
  }, name);
  const pg = await ctx.newPage(); pg.errors = [];
  pg.on('pageerror', e => pg.errors.push(String(e))); pg.on('console', m => { if (m.type() === 'error' && !/AudioContext|WebSocket/.test(m.text())) pg.errors.push(m.text()); });
  await pg.goto(`${BASE}?test=1&mp=${encodeURIComponent(MP)}${phone ? '&touch=1' : ''}`);
  await pg.waitForFunction(() => window.__game?.ready && document.getElementById('lobby').classList.contains('show'), null, { timeout: 90000 });
  return { ctx, pg };
}
const until = (pg, fn, arg, ms = 30000) => pg.waitForFunction(fn, arg, { timeout: ms, polling: 250 }).then(() => true, () => false);
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.mjs')], { env: { ...process.env, PORT: String(PORT), BR_SIZE: '12', BR_DROP: '20', ZONE_FAST: '1', END_PAUSE: '6' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  await sleep(600);
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const A = await client(browser, { name: 'Alpha' });
    check('lobby lists BATTLE ROYALE', await A.pg.evaluate(() => { document.getElementById('lmsBtn').click(); return !!document.querySelector('#lmsList [data-m=obr]'); }));
    await A.pg.evaluate(() => __game.netStart('obr'));
    let ok = await until(A.pg, () => __game.net.ready && __game.state.running && __game.br.on, null, 90000);
    let a = await A.pg.evaluate(() => ({ net: __game.net, br: __game.br }));
    check('desktop drops onto Island Ring with 11 bots, pistols only', ok && a.net.mode === 'br' && a.net.ents === 12 && a.net.aiBots === 11 && a.br.slots[0] === 'vex_p9', JSON.stringify({ ents: a.net.ents, ai: a.net.aiBots, slots: a.br.slots }));
    check('loot is spread over the island', a.br.loot >= 100, `loot=${a.br.loot}`);
    const B = await client(browser, { phone: true, name: 'Bravo' });
    await B.pg.evaluate(() => __game.netStart('obr'));
    ok = await until(B.pg, () => __game.net.ready && __game.br.on, null, 90000);
    const b = await B.pg.evaluate(() => ({ net: __game.net, loot: __game.brLoot() })), la = await A.pg.evaluate(() => __game.brLoot());
    check('phone joins the same BR room during the drop, a bot steps out', ok && b.net.room === a.net.room && b.net.ents === 12, JSON.stringify({ r: [a.net.room, b.net.room], ents: b.net.ents }));
    check('both clients generate the same loot list', JSON.stringify(la.map(x => x.slice(0, 5))) === JSON.stringify(b.loot.map(x => x.slice(0, 5))), `${la.length} vs ${b.loot.length}`);
    // walk onto a gun: teleport to the nearest gun crate
    const gun = la.find(x => !['med', 'armor'].includes(x[1]) && !x[5] && x[1] !== 'vex_p9');
    await A.pg.evaluate(g => __game.teleport(g[2], g[3] + 0.1, g[4]), gun);
    ok = await until(A.pg, w => __game.br.slots[0] === w, gun[1], 6000);
    const tk = await B.pg.evaluate(i => __game.brLoot()[i][5], gun[0]);
    check('walking over a gun crate picks it up (server confirms, gone for others)', ok && tk, JSON.stringify({ gun: gun[1], slots: (await A.pg.evaluate(() => __game.br.slots)), seenTaken: tk }));
    // host bots go for loot they want (meds, armor, one gun each)
    ok = await until(A.pg, () => __game.brLoot().filter(x => x[5]).length >= 4, null, 30000);
    check('bots pick up loot', ok, `taken=${await A.pg.evaluate(() => __game.brLoot().filter(x => x[5]).length)}`);
    // zone: shrinks (fast zone) and hurts players outside
    ok = await until(A.pg, () => __game.br.zone && __game.br.zone[2] < 120, null, 40000);
    const zz = await A.pg.evaluate(() => __game.br.zone);
    check('zone starts closing in', ok, JSON.stringify(zz));
    const far = await A.pg.evaluate(() => { const z = __game.br.zone, a = Math.atan2(z[1] - 116, z[0] - 116) + Math.PI; return [116 + Math.cos(a) * 112, 116 + Math.sin(a) * 112]; });
    const hp0 = await B.pg.evaluate(() => __game.state.hp);
    await B.pg.evaluate(([x, z]) => __game.teleport(x, 0.2, z), far);
    ok = await until(B.pg, h => __game.state.hp < h || !__game.player.alive, hp0, 20000);
    check('standing outside the zone hurts (server damage) + red vignette', ok && (await B.pg.evaluate(() => __game.br.out || !__game.player.alive)), JSON.stringify(await B.pg.evaluate(() => ({ hp: __game.state.hp, out: __game.br.out }))));
    // eliminated: the phone stays outside until it dies -> placement end screen
    ok = await until(B.pg, () => document.getElementById('end').classList.contains('show'), null, 90000);
    const endB = ok ? await B.pg.evaluate(() => ({ badge: document.getElementById('rankBadge').textContent, again: document.getElementById('again').textContent, place: __game.br.place })) : null;
    check('eliminated player gets a placement screen with PLAY AGAIN', ok && /#\d+ OF \d+/.test(endB.badge) && /PLAY AGAIN/.test(endB.again), JSON.stringify(endB));
    await B.pg.screenshot({ path: process.env.SHOTS ? process.env.SHOTS + '/br_phone_end.png' : '/dev/null' }).catch(() => {});
    await A.pg.screenshot({ path: process.env.SHOTS ? process.env.SHOTS + '/br_desk.png' : '/dev/null' }).catch(() => {});
    // round ends (last one standing) for the desktop too
    ok = await until(A.pg, () => document.getElementById('end').classList.contains('show'), null, 150000);
    check('round ends with a last one standing', ok, ok ? await A.pg.textContent('#rankBadge') : 'timeout');
    // server: line-of-sight checks on hits pass real fights (few "through a wall" refusals) + slim binary snapshots
    const st = await (await fetch(`http://localhost:${PORT}/stats`)).json(), wall = st.rej_wall || 0;
    check('line-of-sight check refuses few real hits (< 25%)', st.hits > 5 && wall / (st.hits + wall) < 0.25, JSON.stringify({ hits: st.hits, wall }));
    check('snapshots are binary and small (< 260 B avg for 12 players)', st.snaps > 100 && st.snapBytes / st.snaps < 260, `avg=${(st.snapBytes / st.snaps).toFixed(0)} B`);
    for (const [n, c] of [['desktop', A], ['phone', B]]) { const e = c.pg.errors.filter(x => !/favicon|404/.test(x)); check(`${n}: no page errors`, !e.length, e.slice(0, 3).join(' | ')); }
    await A.ctx.close(); await B.ctx.close(); await sleep(500);
    // a desktop joining a room a phone hosts takes the bots over
    const P = await client(browser, { phone: true, name: 'PhoneHost' });
    await P.pg.evaluate(() => __game.netStart('obr'));
    ok = await until(P.pg, () => __game.net.ready && __game.br.on && __game.net.host, null, 90000);
    const D = await client(browser, { name: 'DeskJoin' });
    await D.pg.evaluate(() => __game.netStart('obr'));
    ok = ok && await until(D.pg, () => __game.net.ready && __game.br.on && __game.net.host && __game.net.aiBots >= 9, null, 90000);
    ok = ok && await until(P.pg, () => !__game.net.host && __game.net.roster === 0 && __game.net.puppets >= 10, null, 10000);
    const ph = await P.pg.evaluate(() => __game.net), dk = await D.pg.evaluate(() => __game.net);
    check('a desktop joining a phone-hosted room takes over the bots', ok && ph.room === dk.room, JSON.stringify({ p: [ph.host, ph.roster, ph.puppets], d: [dk.host, dk.aiBots], rooms: [ph.room, dk.room] }));
    for (const [n, c] of [['host phone', P], ['desktop joiner', D]]) { const e = c.pg.errors.filter(x => !/favicon|404/.test(x)); check(`${n}: no page errors`, !e.length, e.slice(0, 3).join(' | ')); }
    await P.ctx.close(); await D.ctx.close();
  } catch (e) { check('test run', false, String(e).slice(0, 300)); }
  await browser.close(); srv.kill();
  console.log('--- server log ---\n' + log.split('\n').slice(-20).join('\n'));
  const f = results.filter(r => !r.ok).length; console.log(`\n${results.length - f}/${results.length} passed`); process.exit(f ? 1 : 0);
})();
