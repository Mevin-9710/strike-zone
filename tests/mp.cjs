// Online multiplayer test: starts server/server.mjs, opens real game clients (desktop + phone) against it.
// Run (static server on :8765 as for run.cjs):  cd tests && node mp.cjs
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');
const BASE = process.env.SZ_URL || 'http://localhost:8765/index.html';
const PORT = 8790, MP = `ws://localhost:${PORT}`;
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
const net = pg => pg.evaluate(() => __game.net);
const until = (pg, fn, arg, ms = 30000) => pg.waitForFunction(fn, arg, { timeout: ms, polling: 200 }).then(() => true, () => false);

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.mjs')], { env: { ...process.env, PORT: String(PORT), ROUND_TIME: '75', END_PAUSE: '6' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  await sleep(600);
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    // 1. lobby lists the online modes when a server is configured
    const A = await client(browser, { name: 'Alpha' });
    check('lobby lists ONLINE TEAM DM + ONLINE HOLD THE HILL', await A.pg.evaluate(() => { document.getElementById('lmsBtn').click(); return ['otdm', 'ohill'].every(k => document.querySelector(`#lmsList [data-m=${k}]`)); }));

    // 2. first player: instant match, is the host, 7 bots fill the room
    await A.pg.evaluate(() => __game.netStart('otdm'));
    let ok = await until(A.pg, () => __game.net.ready && __game.state.running);
    let a = await net(A.pg);
    check('desktop joins an online TDM room at once and hosts the bots', ok && a.host && a.ents === 8 && a.aiBots === 7, JSON.stringify(a));
    await sleep(1500);
    check('bot names are labelled [BOT] on the scoreboard', await A.pg.evaluate(() => { const r = document.getElementById('tabBoard'); __game.ui.board(true); const t = r.textContent; __game.ui.board(false); return (t.match(/\[BOT\]/g) || []).length === 7; }));

    // 3. second player (phone): same room, other team, sees the host's bots + the host as puppets
    const B = await client(browser, { phone: true, name: 'Bravo' });
    await B.pg.evaluate(() => __game.netStart('otdm'));
    ok = await until(B.pg, () => __game.net.ready && __game.state.running);
    await sleep(2500);
    await until(B.pg, () => __game.net.stuck === 0 && __game.net.livePuppets >= 3, null, 5000);   // a puppet spawned since the last frame is not drawn yet
    let b = await net(B.pg); a = await net(A.pg);
    check('phone joins the same room on the other team, a bot steps out', ok && b.room === a.room && b.team !== a.team && b.ents === 8 && a.ents === 8 && !b.host, JSON.stringify({ a, b }));
    check('phone sees the host + 6 bots as puppets, none stuck invisible', b.puppets >= 7 && b.livePuppets >= 3 && b.stuck === 0, JSON.stringify(b));
    // the host's puppet on the phone is where the host really is
    const posA = (await A.pg.evaluate(() => __game.state.pos)), seen = await B.pg.evaluate(id => __game.netObj(id), a.me);
    const dd = seen ? Math.hypot(seen.pos[0] - posA[0], seen.pos[2] - posA[2]) : 99;
    check('host position reaches the phone (interpolated, < 1.5 m off)', dd < 1.5, `d=${dd.toFixed(2)}`);
    // movement: the host walks a straight line at 5 m/s; the phone's puppet must follow it smoothly (no stalls or jumps)
    const walk = await A.pg.evaluate(() => { const p = __game.state.pos, x0 = p[0], z0 = p[2], t0 = performance.now() / 1000;
      window.__walkFn = (pos, t) => { const d = 2.5 - Math.abs(((t - t0) * 5) % 10 - 5); pos.x = x0 + d; pos.z = z0; }; return [x0, z0]; });
    const tr = await B.pg.evaluate(id => new Promise(res => { const N = __game.NET; N.trace = []; N.traceId = id; setTimeout(() => { N.traceId = 0; res(N.trace.map(q => [q[0], q[1], q[2]])); }, 4000); }), a.me);
    await A.pg.evaluate(() => { window.__walkFn = null; });
    const lo = Math.min(...tr.map(q => q[1])), hi = Math.max(...tr.map(q => q[1])), span = hi - lo;
    const sp = []; for (let i = 1; i < tr.length; i++) { const dt = (tr[i][0] - tr[i - 1][0]) / 1000, x = (tr[i][1] + tr[i - 1][1]) / 2; if (dt > 0 && x > lo + 0.6 && x < hi - 0.6) sp.push(Math.hypot(tr[i][1] - tr[i - 1][1], tr[i][2] - tr[i - 1][2]) / dt); }   // skip the turn-arounds
    const mid = sp, mean = mid.reduce((x, y) => x + y, 0) / Math.max(1, mid.length);
    const jerk = mid.filter(v => Math.abs(v - 5) > 2.5).length / Math.max(1, mid.length);
    check('a walking player moves smoothly on other screens (5 m/s, few jumps)', span > 3 && Math.abs(mean - 5) < 1.2 && jerk < 0.2, JSON.stringify({ span: +span.toFixed(1), mean: +mean.toFixed(2), jerk: +jerk.toFixed(2), frames: tr.length, from: walk }));

    // 4. a real shot: the host stands next to the phone player and fires; the server applies the damage
    const pB = await B.pg.evaluate(() => __game.state.pos);
    await A.pg.evaluate(([x, y, z]) => { __game.teleport(x + 3, y, z); __game.lookAt(x, y + 1.2, z); }, pB);
    await B.pg.evaluate(() => { __game.teleport(...__game.state.pos); });
    await sleep(600);
    await A.pg.evaluate(([x, y, z]) => { __game.lookAt(x, y + 1.2, z); __game.mouse('l', true); }, pB);
    await sleep(1800); await A.pg.evaluate(() => __game.mouse('l', false));
    const hb = await B.pg.evaluate(() => ({ hp: __game.state.hp, alive: __game.player.alive }));
    check('host shoots the phone player: damage arrives via the server', hb.hp < 100 || !hb.alive, JSON.stringify(hb));

    // 5. phone leaves: the bot comes back. Then host leaves with a 3rd player in: host moves over
    const C = await client(browser, { name: 'Charlie' });
    await C.pg.evaluate(() => __game.netStart('otdm'));
    ok = await until(C.pg, () => __game.net.ready);
    await B.ctx.close(); await sleep(1500);
    a = await net(A.pg);
    check('a player leaves: a bot takes the free slot (room stays 8)', ok && a.ents === 8, JSON.stringify(a));
    await A.ctx.close();
    await until(C.pg, () => __game.net.host && __game.net.aiBots >= 6, null, 10000);
    let c = await net(C.pg);
    check('host leaves: the next player takes over the bots', c.host && c.roster === 7 && c.aiBots >= 6 && c.ents === 8, JSON.stringify(c));
    await C.ctx.close();

    // 6. Hold the Hill: two players agree on the hill; standing in it scores for your team
    const H1 = await client(browser, { name: 'Hill1' }), H2 = await client(browser, { phone: true, name: 'Hill2' });
    await H1.pg.evaluate(() => __game.netStart('ohill')); await until(H1.pg, () => __game.net.ready && __game.net.hill);
    await H2.pg.evaluate(() => __game.netStart('ohill')); await until(H2.pg, () => __game.net.ready && __game.net.hill);
    const h1 = await net(H1.pg), h2 = await net(H2.pg);
    check('hill: both clients use the same hill position', h1.room === h2.room && h1.hill && h2.hill && Math.hypot(h1.hill[0] - h2.hill[0], h1.hill[2] - h2.hill[2]) < 0.01, JSON.stringify([h1.hill, h2.hill]));
    await H1.pg.evaluate(() => { const fr = window.__game; fr.G; });
    // freeze the other team out of the hill: H1 stands in it, its team should own it unless a rival is there too
    await H1.pg.evaluate(h => __game.teleport(h[0], h[1], h[2]), h1.hill);
    await until(H1.pg, () => __game.net.score.A + __game.net.score.B > 0, null, 15000);
    const s1 = await net(H1.pg);
    check('hill: standing in the zone scores for a team', (s1.score.A + s1.score.B) > 0, JSON.stringify({ own: s1.hillOwn, sc: s1.score }));
    await H2.pg.screenshot({ path: process.env.SHOTS ? process.env.SHOTS + '/mp_phone_hill.png' : '/dev/null' }).catch(() => {});
    await H1.pg.screenshot({ path: process.env.SHOTS ? process.env.SHOTS + '/mp_desk_hill.png' : '/dev/null' }).catch(() => {});
    // 7. round end -> both see the result, the same room starts the next round on its own (CG: same group plays on)
    ok = await until(H1.pg, () => document.getElementById('end').classList.contains('show'), null, 100000);
    const endTxt = ok ? await H1.pg.textContent('#again') : '';
    check('round ends for everyone with a NEXT ROUND countdown', ok && /NEXT ROUND|STARTING/.test(endTxt) && await H2.pg.evaluate(() => document.getElementById('end').classList.contains('show')), endTxt);
    const r0 = (await net(H1.pg)).map;
    ok = await until(H1.pg, () => __game.state.running && __game.net.ready, null, 40000) && await until(H2.pg, () => __game.state.running && __game.net.ready, null, 20000);
    const n1 = await net(H1.pg), n2 = await net(H2.pg);
    check('next round starts by itself in the same room on a new map', ok && n1.room === n2.room && n1.map !== r0 && n1.map === n2.map, JSON.stringify({ r0, m1: n1.map, m2: n2.map }));
    for (const [n, c2] of [['Hill1', H1], ['Hill2', H2]]) { const e = c2.pg.errors.filter(x => !/favicon|404/.test(x)); check(`${n}: no page errors`, !e.length, e.slice(0, 3).join(' | ')); }
    await H1.ctx.close(); await H2.ctx.close();
  } catch (e) { check('test run', false, String(e).slice(0, 300)); }
  await browser.close(); srv.kill();
  console.log('--- server log ---\n' + log.split('\n').slice(-25).join('\n'));
  const f = results.filter(r => !r.ok).length; console.log(`\n${results.length - f}/${results.length} passed`); process.exit(f ? 1 : 0);
})();
