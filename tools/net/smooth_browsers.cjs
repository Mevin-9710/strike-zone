// Smoothness bench: needs tools/serve.py on :8765 and cd tests && npm install. Env BASE/JIT (ms, latency + jitter each way), STALL=periodMs,holdMs (server->client).
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright-core');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn(process.execPath, [__dirname + '/../../server/server.mjs'], { env: { ...process.env, PORT: '8798', QUIET: '1' }, stdio: 'inherit' });
  const px = spawn(process.execPath, [__dirname + '/jitter_proxy.mjs', '8795', 'ws://localhost:8798', process.env.BASE || '40', process.env.JIT || '60'], { stdio: 'inherit' }); await sleep(700);
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const mk = async () => { const ctx = await b.newContext({ viewport: { width: 640, height: 360 } });
    await ctx.addInitScript(() => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', 1); localStorage.clear(); localStorage.setItem('sz_onboard_done', '1'); localStorage.setItem('sz_tutorial_done', '1'); localStorage.setItem('sz_settings', JSON.stringify({ quality: 'low', qMigrated: 1 })); });
    const pg = await ctx.newPage(); pg.on('pageerror', e => console.log('ERR', e)); await pg.goto('http://localhost:8765/index.html?test=1&mp=ws://localhost:8795');
    await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 90000 }); await pg.evaluate(() => __game.netStart('otdm')); await pg.waitForFunction(() => __game.net.ready && __game.state.running, null, { timeout: 90000 }); return pg; };
  const A = await mk(), B = await mk(); await sleep(2500);
  const me = await A.evaluate(() => __game.net.me);
  await A.evaluate(() => { const p = __game.state.pos, x0 = p[0], z0 = p[2], t0 = performance.now() / 1000; window.__walkFn = (pos, t) => { pos.x = x0 + 2.5 - Math.abs(((t - t0) * 5) % 10 - 5); pos.z = z0; }; });
  await sleep(500);
  const r = await B.evaluate(id => new Promise(res => { const N = __game.NET; N.trace = []; N.traceId = id; setTimeout(() => { N.traceId = 0; const e = N.ents.get(id); res({ tr: N.trace, off: N.off, del: e.del, late: e.lat, gap: e.gap, buf: e.buf.map(q => [q[0], q[1]]) }); }, 4000); }), me);
  const tr = r.tr; const sp = [];
  for (let i = 1; i < tr.length; i++) { const dt = (tr[i][0] - tr[i - 1][0]) / 1000; if (dt > 0) sp.push([Math.abs(tr[i][1] - tr[i - 1][1]) / dt, tr[i][1]]); }
  const x0 = sp.length ? Math.min(...sp.map(q => q[1])) : 0, x1 = sp.length ? Math.max(...sp.map(q => q[1])) : 0;
  const mid = sp.filter(q => q[1] > x0 + 0.5 && q[1] < x1 - 0.5).map(q => q[0]);   // leave out the turnarounds
  const mean = mid.reduce((a, b) => a + b, 0) / (mid.length || 1), stall = mid.filter(v => v < 2).length, spike = mid.filter(v => v > 8).length;
  let jerk = 0; for (let i = 1; i < mid.length; i++) jerk += Math.abs(mid[i] - mid[i - 1]); jerk /= (mid.length || 1) * 5;
  console.log(JSON.stringify({ BASE: process.env.BASE, JIT: process.env.JIT, STALL: process.env.STALL, frames: tr.length, mean: +mean.toFixed(2), jerk: +jerk.toFixed(3), stall, spike, del: +r.del.toFixed(3), late: +r.late.toFixed(3), gap: +r.gap.toFixed(3) }));
  await b.close(); srv.kill(); px.kill();
})();
