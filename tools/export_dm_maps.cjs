// One-off: bake the 4 Deathmatch map prototypes (docs/maps/dm-src/*.html) into models/dm/<id>.glb + <id>.json
// (static map meshes only; colliders/floors/ramps as data). Runs each prototype in headless Chromium.
const { chromium } = require('../tests/node_modules/playwright-core');
const fs = require('fs'), path = require('path');
const SRC = 'docs/maps/dm-src';
const M = [
  { id: 'belltower', file: 'belltower_square_detail_pass_5v5_tdm.html', call: '  buildDetailedArena();\n',
    exp: '({ boxes: solidBoxes.map(b => ({ x0: b.minX, x1: b.maxX, y0: b.minY, y1: b.maxY, z0: b.minZ, z1: b.maxZ, p: b.blocksPlayer, b: b.blocksBullets })) })' },
  { id: 'lantern', file: 'lantern_canal_3d_5v5_tdm_arena_aerial_map_viewer.html', call: '    buildMap();\n',
    exp: '({ boxes: colliders.map(c => ({ x0: c.x1, x1: c.x2, y0: c.yMin, y1: c.yMax, z0: c.z1, z1: c.z2, p: c.blocksMove !== false, b: c.blocksBullets !== false })) })' },
  { id: 'neon', file: 'neon_alley_5v5_tdm_arena.html', call: '      buildMap();\n',
    exp: '({ boxes: colliders.map(c => ({ x0: c.minX, x1: c.maxX, y0: c.minY, y1: c.maxY, z0: c.minZ, z1: c.maxZ, p: true, b: true })), floors: floorZones, ramps: stairRamps })' },
  { id: 'sandkeep', file: 'sandkeep_detail_pass_5v5_tdm_architectural_showcase.html', call: '  buildSandkeepMap();\n',
    exp: '({ boxes: colliders.map(c => ({ x0: c.minX, x1: c.maxX, y0: c.minY, y1: c.maxY, z0: 56 - c.maxZ, z1: 56 - c.minZ, p: true, b: c.blocksSight !== false })), ramps, ladders })' },
];
const only = process.argv[2];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const m of M) {
    if (only && m.id !== only) continue;
    let html = fs.readFileSync(path.join(SRC, m.file), 'utf8');
    const i = html.indexOf(m.call); if (i < 0) throw new Error('marker not found ' + m.id);
    html = html.slice(0, i) + `window.__N0 = scene.children.length;\n` + m.call + `window.__EXP = Object.assign(${m.exp}, { n0: window.__N0, n1: scene.children.length }); window.__SCENE = scene;${m.id === 'sandkeep' ? ' window.mapGroup = mapGroup; window.__USE_GROUP = true;' : ''}\n` + html.slice(i + m.call.length);
    const tmp = path.join('/tmp', `dmexp_${m.id}.html`); fs.writeFileSync(tmp, html);
    const pg = await b.newPage({ viewport: { width: 800, height: 600 } });
    pg.on('pageerror', e => console.log(m.id, 'pageerror', e.message));
    await pg.goto('file://' + tmp); await pg.waitForFunction(() => window.__EXP, null, { timeout: 60000 });
    await pg.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/exporters/GLTFExporter.js' });
    await pg.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/BufferGeometryUtils.js' });
    const out = await pg.evaluate(async () => {
      const scene = window.__SCENE, E = window.__EXP, root = new THREE.Group();
      const kids = window.mapGroup && window.__USE_GROUP ? [window.mapGroup] : scene.children.slice(E.n0, E.n1);
      const stats = {};
      const bad = o => o.isLight || o.isPoints || o.isLine || o.isSprite || o.isCamera || (o.material && (o.material.isShaderMaterial || o.material.isRawShaderMaterial || (Array.isArray(o.material) && o.material.some(x => x.isShaderMaterial))));
      let meshes = 0, tris = 0, skipped = 0;
      scene.updateMatrixWorld(true);
      const byMat = new Map(), U = THREE.BufferGeometryUtils;
      const norm = (g, mw) => {                                   // bake to world, non-indexed, position/normal/uv only
        g = g.clone(); g.applyMatrix4(mw); if (g.index) g = g.toNonIndexed();
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.clearGroups(); g.morphAttributes = {}; return g;
      };
      const canon = new Map();                                     // identical-looking materials share one batch
      const mkey = m => [m.type, m.color?.getHex(), m.emissive?.getHex(), m.emissiveIntensity, m.map?.uuid, m.roughness, m.metalness, m.transparent, m.opacity, m.side, m.alphaTest, m.vertexColors, m.flatShading].join('|');
      const push = (g, mat, key) => { mat = Array.isArray(mat) ? mat[0] : mat; const mk = mkey(mat); if (!canon.has(mk)) canon.set(mk, mat); mat = canon.get(mk); if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(g); const t = g.attributes.position.count / 3; tris += t; stats[key] = (stats[key] || 0) + t; meshes++; };
      const add = o => {
        if (bad(o)) { skipped++; return; }
        if (o.isInstancedMesh) {
          if (o.count > 1000) { skipped++; stats['DROP inst ' + o.count] = 0; return; }      // e.g. 5000 roof-tile cylinders: the roof deck underneath stays
          const mm = new THREE.Matrix4();
          for (let k = 0; k < o.count; k++) { o.getMatrixAt(k, mm); push(norm(o.geometry, new THREE.Matrix4().multiplyMatrices(o.matrixWorld, mm)), o.material, 'inst:' + o.geometry.type); }
          return;
        }
        if (!o.isMesh) return;
        let geo = o.geometry;
        if (geo.type === 'ExtrudeGeometry') { geo.computeBoundingBox(); const bb = geo.boundingBox, sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3()); geo = new THREE.BoxGeometry(sz.x, sz.y, sz.z).translate(c.x, c.y, c.z); }
        push(norm(geo, o.matrixWorld), o.material, geo.type);
      };
      for (const k of kids) k.traverse(o => { if (o.visible === false) return; add(o); });
      for (const [mat, gs] of byMat) { let g = U.mergeBufferGeometries(gs); if (!g) { skipped++; continue; } if (!mat.map && !mat.normalMap && !mat.roughnessMap && !mat.emissiveMap) g.deleteAttribute('uv'); g = U.mergeVertices(g, 1e-3); const me = new THREE.Mesh(g, mat); me.name = mat.name || ''; root.add(me); }
      meshes = byMat.size;
      const glb = await new Promise(res => new THREE.GLTFExporter().parse(root, r => res(r), { binary: true, maxTextureSize: 1024 }));
      const u8 = new Uint8Array(glb); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      const data = JSON.parse(JSON.stringify(E)); delete data.n0; delete data.n1;
      return { b64: btoa(s), data, meshes, tris: Math.round(tris), skipped, stats: Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + '=' + Math.round(v)).join(' ') };
    });
    fs.writeFileSync(`models/dm/${m.id}.glb`, Buffer.from(out.b64, 'base64'));
    fs.writeFileSync(`models/dm/${m.id}.json`, JSON.stringify(out.data));
    console.log(m.id, 'meshes', out.meshes, 'tris', out.tris, 'skipped', out.skipped, 'boxes', out.data.boxes.length, 'glb KB', Math.round(fs.statSync(`models/dm/${m.id}.glb`).size / 1024), '\n  ', out.stats);
    await pg.close();
  }
  await b.close();
})();
