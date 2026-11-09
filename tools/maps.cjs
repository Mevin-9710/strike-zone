// Renders map previews and prints collision sanity data. Usage: node tools/maps.cjs 1,2,3 aerial,ground
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true, args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--ignore-gpu-blocklist'] });
  const pg = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type()==='error' && !m.text().includes('404')) errs.push(m.text()); });
  for (const m of (process.argv[2] || '1,2,3').split(',')) for (const v of (process.argv[3] || 'aerial,ground').split(',')) {
    await pg.goto(`http://localhost:8765/world/preview.html?m=${m}&v=${v}`);
    await pg.waitForFunction(() => window.__ready, null, { timeout: 100000 });
    await pg.waitForTimeout(1200);
    if (v === 'aerial') console.log('M' + m, JSON.stringify(await pg.evaluate(() => window.__map)));
    await pg.screenshot({ path: `/tmp/map_${m}_${v}.png` });
  }
  console.log('errors:', errs.slice(0, 5));
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
