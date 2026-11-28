// Smoothness bench: needs tools/serve.py on :8765 and cd tests && npm install. Env BASE/JIT (ms, latency + jitter each way), STALL=periodMs,holdMs (server->client).
// observer = one browser page; walker = a plain node client (game/net.js) walking 5 m/s back and forth
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright-core');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn(process.execPath, [__dirname + '/../../server/server.mjs'], { env: { ...process.env, PORT: '8798', QUIET: '1' }, stdio: 'inherit' });
  const px = spawn(process.execPath, [__dirname + '/jitter_proxy.mjs', '8795', 'ws://localhost:8798', process.env.BASE || '40', process.env.JIT || '0'], { stdio: 'inherit' });
  await sleep(700);
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 640, height: 360 } });
  await ctx.addInitScript(() => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', 1); localStorage.clear(); localStorage.setItem('sz_onboard_done', '1'); localStorage.setItem('sz_tutorial_done', '1'); localStorage.setItem('sz_settings', JSON.stringify({ quality: 'low', qMigrated: 1 })); });
  const pg = await ctx.newPage(); pg.on('pageerror', e => console.log('ERR', e));
  await pg.goto('http://localhost:8765/index.html?test=1&mp=ws://localhost:8795');
  await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 90000 }); await pg.evaluate(() => __game.netStart('otdm'));
  await pg.waitForFunction(() => __game.net.ready && __game.state.running, null, { timeout: 90000 });
  const walker = spawn(process.execPath, [__dirname + '/walker.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
  let wid = 0; walker.stdout.on('data', d => { const m = String(d).match(/id (\d+)/); if (m) wid = +m[1]; });
  while (!wid) await sleep(100);
  await sleep(3000);
  const r = await pg.evaluate(id => new Promise(res => { const N = __game.NET; N.trace = []; N.traceId = id; setTimeout(() => { N.traceId = 0; const e = N.ents.get(id); res({ tr: N.trace, del: e.del, late: e.lat }); }, 5000); }), wid);
  const sp = []; for (let i = 1; i < r.tr.length; i++) { const dt = (r.tr[i][0] - r.tr[i - 1][0]) / 1000, x = (r.tr[i][1] + r.tr[i - 1][1]) / 2 - 20; if (dt > 0 && Math.abs(x) < 1.9) sp.push(Math.abs(r.tr[i][1] - r.tr[i - 1][1]) / dt); }
  sp.sort((a, b) => a - b); const P = f => sp[Math.floor(sp.length * f)]?.toFixed(2);
  console.log(JSON.stringify({ jit: process.env.JIT || '0', frames: r.tr.length, del: +r.del.toFixed(3), late: +r.late.toFixed(3), p10: P(0.1), p25: P(0.25), p50: P(0.5), p75: P(0.75), p90: P(0.9) }));
  walker.kill(); await b.close(); srv.kill(); px.kill();
})();
