// Render the CrazyGames covers from tools/keyart.html (serve the repo on :8765 first: python3 tools/serve.py).
//   node tools/keyart_shoot.cjs [outDir=media/covers-v2] [ss=2] [extra query]
// Writes raw_<fmt>.png at ss x size; then downscale to the exact portal sizes (no alpha):
//   python3 -c "from PIL import Image;import os;[(Image.open(f'D/raw_{k}.png').convert('RGB').resize(s,Image.LANCZOS).save(f'D/cover_{k}.png'),os.remove(f'D/raw_{k}.png')) for k,s in {'16x9':(1920,1080),'2x3':(800,1200),'1x1':(800,800)}.items()]"  (D = outDir)
const { chromium } = require('playwright');
const path = require('path');
const [out = 'media/covers-v2', ss = '2', extra = ''] = process.argv.slice(2);
const SIZES = { '16x9': [1920, 1080], '2x3': [800, 1200], '1x1': [800, 800] };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  require('fs').mkdirSync(out, { recursive: true });
  for (const [fmt, [w, h]] of Object.entries(SIZES)) {
    if (process.env.ONLY && !process.env.ONLY.split(',').includes(fmt)) continue;
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +ss });
    let err = null; p.on('pageerror', (e) => { err = e; console.log('ERR', e.message); });
    await p.goto(`http://localhost:8765/tools/keyart.html?fmt=${fmt}${extra ? '&' + extra : ''}`);
    for (let t = 0; t < 600 && !err; t++) { if (await p.evaluate(() => document.title === 'done')) break; await p.waitForTimeout(500); }
    if (err) throw err;
    const f = path.join(out, `raw_${fmt}.png`); await p.screenshot({ path: f }); await p.close();
    console.log('wrote', f);
  }
  await b.close();
})();
