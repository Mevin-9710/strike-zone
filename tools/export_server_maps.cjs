// Exports the map colliders the server uses for line-of-sight checks on hits -> server/maps.json.
// Builds each arena (DM_MAPS order = server map index 0..3) and Island Ring (index 4) in a headless page and dumps World.solids.
// Re-run after any map change:  python3 tools/serve.py &  node tools/export_server_maps.cjs
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.SZ_URL || 'http://localhost:8765/index.html';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const pg = await b.newPage();
  await pg.goto(BASE + '?test=1');
  await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
  const out = await pg.evaluate(async () => {
    const THREE = await import('three'), { World } = await import('./world/collision.js'), dm = await import('./world/dm-maps.js'), br = await import('./world/br-map.js');
    const dump = w => w.solids.filter(c => !c.ramp).map(c => [c.min.x, c.min.y, c.min.z, c.max.x, c.max.y, c.max.z].map(v => Math.round(v * 100) / 100))
      .filter(a => a[3] - a[0] > 0.05 && a[5] - a[2] > 0.05 && a[4] - a[1] > 0.05);
    const maps = [];
    for (const d of dm.DM_MAPS) { await dm.loadDmMap(d.id); const w = new World(); dm.buildDmMap(d, w, new THREE.Scene()); maps.push(dump(w)); }
    const w = new World(); br.buildBrIsland(w, new THREE.Scene()); maps.push(dump(w));
    return maps;
  });
  const file = path.join(__dirname, '..', 'server', 'maps.json');
  fs.writeFileSync(file, JSON.stringify({ v: 1, maps: out }));
  console.log('wrote', file, out.map(m => m.length).join(' / '), 'boxes,', (fs.statSync(file).size / 1024).toFixed(0), 'KB');
  await b.close();
})();
