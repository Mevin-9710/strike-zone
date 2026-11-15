// Quick check: first launch auto-starts the drill; quality defaults/migrates to High. Run: node tests/quick_firstrun.cjs
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const run = async (seed) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(s => { if (sessionStorage.getItem('x')) return; sessionStorage.setItem('x', 1); localStorage.clear(); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, seed);
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e)));
    const t0 = Date.now(); await pg.goto('http://localhost:8765/index.html');
    await pg.waitForFunction(() => window.__game?.ready && (__game.state.running || document.getElementById('lobby').classList.contains('show')), null, { timeout: 90000 });
    const r = await pg.evaluate(() => ({ running: __game.state.running, tut: !!__game.tutorial?.active, lobby: document.getElementById('lobby').classList.contains('show'), q: JSON.parse(localStorage.getItem('sz_settings') || '{}').quality ?? 'high(default)' }));
    r.secs = ((Date.now() - t0) / 1000).toFixed(1); r.errs = errs; await ctx.close(); return r;
  };
  console.log('first launch:', JSON.stringify(await run({})));
  console.log('returning   :', JSON.stringify(await run({ sz_onboard_done: '1', sz_tutorial_done: '1', sz_progress: '2', sz_settings: '{"quality":"auto"}' })));
  await b.close();
})();
