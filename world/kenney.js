// Kenney CC0 map props (models/kenney/<kit>.glb, baked by tools/kenney_props.mjs). One material per kit.
// Geometry is baked into the Kit's merged batches at build time, so there is no per-frame cost.
import * as THREE from 'three';
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';

const KITS = ['car', 'ind', 'fac', 'dun', 'skate', 'forest', 'arena', 'blk'];   // models are whatever tools/kenney_props.mjs baked into each GLB
const MODELS = new Map();   // name -> { geo: BufferGeometry[] (non-indexed, world-baked, centred xz, base y=0), mat, size: Vector3 }
export const kenneyReady = () => MODELS.size > 0;
export const kenneyModel = name => MODELS.get(name);
export const kenneyKeys = () => [...MODELS.keys()];

// All kits share ONE atlas material (each kit's 512px palette texture in a 4x2 grid, UVs remapped) -> one draw call for all dressing.
export async function loadKenney(loader) {
  const COLS = 4, ROWS = 2, N = 512;
  const found = [];
  await Promise.all(KITS.map(async (kit, ki) => {
    try {
      const g = await loader.loadAsync(`models/kenney/${kit}.glb`);
      let img = null; g.scene.updateMatrixWorld(true);
      const models = [];
      for (const grp of g.scene.children) {
        const geos = [];
        grp.traverse(o => {
          if (!o.isMesh) return;
          img = img || o.material.map?.image;
          const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
          const ng = geo.index ? geo.toNonIndexed() : geo;
          for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') ng.deleteAttribute(k);   // identical attribute sets so everything merges
          if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2).fill(0.01), 2));
          if (!ng.attributes.normal) ng.computeVertexNormals();
          geos.push(ng);
        });
        const box = new THREE.Box3(); geos.forEach(ge => { ge.computeBoundingBox(); box.union(ge.boundingBox); });
        const c = box.getCenter(new THREE.Vector3());
        geos.forEach(ge => ge.translate(-c.x, -box.min.y, -c.z));
        models.push([grp.name.replace(/_\d+$/, ''), geos, box.getSize(new THREE.Vector3())]);
      }
      found[ki] = { img, models };
    } catch (e) { console.warn('kenney kit failed', kit, e); }
  }));
  if (!found.some(Boolean)) return;
  const cv = document.createElement('canvas'); cv.width = COLS * N; cv.height = ROWS * N;
  const cx = cv.getContext('2d');
  found.forEach((f, ki) => { if (f?.img) cx.drawImage(f.img, (ki % COLS) * N, Math.floor(ki / COLS) * N, N, N); });
  const tex = new THREE.CanvasTexture(cv); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.MeshLambertMaterial({ map: tex, color: 0xffffff, side: THREE.FrontSide });
  found.forEach((f, ki) => {
    if (!f) return;
    const ox = ki % COLS, oy = Math.floor(ki / COLS);
    for (const [name, geos, size] of f.models) {
      for (const ge of geos) {
        const uv = ge.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + ox) / COLS, (uv.getY(i) + oy) / ROWS);
        uv.needsUpdate = true;
      }
      MODELS.set(name + (MODELS.has(name) ? '@' + KITS[ki] : ''), { geo: geos, mat, size });
    }
  });
}

// ---------- procedural scatter: decorative-only Kenney dressing, placed AFTER the nav graph exists ----------
// piece: [model, height m, weight, surface 'g' ground | 'r' roof | 'gr' both]
const P = {
  cone: ['cone', 0.5, 2, 'g'], plank: ['plank', 0.12, 1, 'g'], crateM: ['crate-medium', 0.7, 3, 'gr'], crateW: ['crate-wide', 0.7, 2, 'gr'], pallet: ['pallet', 0.15, 2, 'g'],
  boxS: ['box-small', 0.7, 3, 'gr'], boxL: ['box-large', 1.2, 2, 'gr'], pipe: ['pipe-large-long', 0.9, 2, 'gr'], hopper: ['hopper-round', 1.6, 1, 'g'], cog: ['cog-a', 0.8, 1, 'g'],
  warn: ['warning-orange', 0.9, 1, 'g'], tankS: ['detail-tank', 1.6, 2, 'gr'], tankL: ['detail-tank-large', 2.2, 1, 'r'], solar: ['solar-panel-landscape-group', 0.9, 3, 'r'],
  solarP: ['solar-panel-portrait-group', 1.1, 2, 'r'], chim: ['chimney-small', 1.8, 1, 'r'], barrel: ['barrel', 0.95, 3, 'gr'], pot: ['pot', 0.6, 3, 'g'], chest: ['chest', 0.6, 1, 'g'],
  table: ['table', 0.8, 1, 'g'], rocks: ['rocks-low', 0.7, 3, 'g'], rocksH: ['rocks-high', 1.4, 1, 'g'], stones: ['stones', 0.25, 3, 'g'], plant: ['plant', 0.55, 4, 'gr'], fence: ['fence', 0.9, 4, 'g'],
  tent: ['tent', 1.6, 1, 'g'], flag: ['flag', 2.6, 1, 'g'], target: ['target', 1.3, 1, 'g'], tire: ['debris-tire', 0.5, 2, 'g'], door: ['debris-door', 0.12, 1, 'g'], plate: ['debris-plate-a', 0.3, 2, 'g'],
  bumper: ['debris-bumper', 0.4, 1, 'g'], statue: ['statue', 2.4, 1, 'g'], banner: ['banner', 2.2, 2, 'g'], rack: ['weapon-rack', 1.4, 2, 'g'], trophy: ['trophy', 0.8, 1, 'g'], bench: ['bench', 0.8, 1, 'g'],
  ramp: ['ramp', 0.5, 1, 'g'], rail: ['rail-low', 0.5, 1, 'g'], tgtS: ['target-small', 1.0, 1, 'g'],
};
const THEMES = {
  industrial: ['boxS', 'boxL', 'pipe', 'hopper', 'cog', 'warn', 'pallet', 'crateM', 'crateW', 'tankS', 'tankL', 'solar', 'chim', 'cone', 'barrel', 'plank', 'tire'],
  harbor: ['pallet', 'crateM', 'crateW', 'boxS', 'tankS', 'barrel', 'tire', 'fence', 'rocks', 'plank', 'cone', 'pipe', 'solar', 'chim', 'plant'],
  downtown: ['plant', 'pot', 'stones', 'rocks', 'fence', 'flag', 'tgtS', 'pallet', 'crateM', 'solar', 'solarP', 'cone', 'bench', 'banner', 'boxS', 'ramp', 'rail', 'tankS'],
  civic: ['statue', 'banner', 'trophy', 'rack', 'plant', 'pot', 'fence', 'flag', 'stones', 'table', 'bench', 'solarP', 'plant', 'rocks'],
  blackout: ['tire', 'door', 'plate', 'bumper', 'cone', 'plank', 'barrel', 'rocks', 'rocksH', 'tent', 'pallet', 'crateM', 'boxS', 'stones', 'solar'],
  street: ['cone', 'plant', 'pot', 'pallet', 'crateM', 'boxS', 'fence', 'rocks', 'stones', 'tankS', 'solar', 'barrel', 'plank', 'tire', 'chest', 'flag'],
};
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Adds ONE merged mesh (single atlas material) to `root`. No colliders, no minimap, no per-frame cost. Returns the placed count.
export function dressMap(world, root, map, { seed = 1, theme = 'street', count = 300, navDist = 0.5, spawnDist = 3 } = {}) {
  if (!MODELS.size || !world.nav) return 0;
  const R = mulberry(seed * 7919 + 13);
  const pool = []; for (const k of THEMES[theme] || THEMES.street) { const d = P[k]; if (d && (MODELS.has(d[0]))) for (let i = 0; i < d[2]; i++) pool.push(d); }
  if (!pool.length) return 0;
  const keep = [];   // protected points
  const addP = p => { if (p && p.isVector3) keep.push(p); };
  for (const p of Object.values(map.spawns || {})) addP(p);
  for (const l of [map.points, map.pointPool, map.intel, map.intelPool, map.guards]) (l || []).forEach(addP);
  addP(map.extract); (map.breaches || []).forEach(b => addP(b.pos));
  const nodes = world.nav.nodes.filter(n => n.links.length), { cells, spacing } = world.nav;
  const b = map.bounds, placed = [], out = [], pos = new THREE.Vector3();
  const M4 = new THREE.Matrix4(), SC = new THREE.Matrix4(), RT = new THREE.Matrix4();
  const solids = world.solids.filter(c => !c.dead && !c.navSkip && !c.ramp && c.max.y - c.min.y >= 1.6);
  const st = dressMap.stats = { bounds: 0, keep: 0, placed: 0, nav: 0, ovl: 0, gnd: 0, skip: 0 };
  const ok = (x, y, z, rho, h) => {
    if (x < b.min.x + 0.5 || x > b.max.x - 0.5 || z < b.min.z + 0.5 || z > b.max.z - 0.5) { st.bounds++; return false; }
    for (const q of keep) if (Math.hypot(q.x - x, q.z - z) < spawnDist && Math.abs(q.y - y) < 3) return false;
    for (const q of placed) if (Math.hypot(q[0] - x, q[1] - z) < q[2] + rho + 0.15 && Math.abs(q[3] - y) < 1.5) return false;
    const gx = Math.round(x / spacing), gz = Math.round(z / spacing), nd = navDist + rho, reach = Math.ceil(nd / spacing) + 1;
    for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++)
      for (const n of cells.get((gx + dx) + ',' + (gz + dz)) || []) if (n.links.length && Math.abs(n.pos.y - y) < 1.8 && Math.hypot(n.pos.x - x, n.pos.z - z) < nd) { st.nav++; return false; }
    pos.set(x, y + 0.03, z);
    if (world.overlaps(pos, rho, Math.min(h, 1.4), 0.03)) { st.ovl++; return false; }
    if (Math.abs(world.groundHeight(x, z, rho * 0.6, y + 0.35, 0.35) - y) > 0.1) { st.gnd++; return false; }
    return true;
  };
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const def = pool[Math.floor(R() * pool.length)];
    if (!MODELS.has(def[0])) continue;
    const M = MODELS.get(def[0]), k = def[1] / M.size.y, sx = M.size.x * k, sz = M.size.z * k;
    const rho = Math.min(Math.max(sx, sz) / 2, 1.5) * 0.85;
    const wantG = def[3].includes('g'), wantR = def[3].includes('r');
    let x, y, z, rot = R() * 6.283;
    const mode = R();
    if (mode < 0.15) {            // map edge / bounds corner
      const side = Math.floor(R() * 4), t = R();
      if (side < 2) { x = b.min.x + 0.7 + t * (b.max.x - b.min.x - 1.4); z = side ? b.max.z - 0.7 - rho : b.min.z + 0.7 + rho; rot = 0; }
      else { z = b.min.z + 0.7 + t * (b.max.z - b.min.z - 1.4); x = side === 3 ? b.max.x - 0.7 - rho : b.min.x + 0.7 + rho; rot = Math.PI / 2; }
      y = 0.15; if (!wantG) continue;
      // ground height varies per map: take the highest surface at that point under y 1
      y = world.groundHeight(x, z, 0.2, 1.0, 1.0);
    } else {
      if (!solids.length) break;
      const c = solids[Math.floor(R() * solids.length)];
      const w = c.max.x - c.min.x, d = c.max.z - c.min.z;
      const roofOK = wantR && c.max.y > 2.5 && w > 3 && d > 3;
      const groundOK = wantG && c.min.y <= 0.5 && c.max.y - c.min.y >= 1.6;
      if (!roofOK && !groundOK) continue;
      const onRoof = roofOK && (!groundOK || R() < 0.5);
      if (onRoof) {               // inset from a roof edge / corner
        const face = Math.floor(R() * 4), t = R(), inset = 0.5 + rho;
        if (face < 2) { x = c.min.x + inset + t * Math.max(0, w - 2 * inset); z = face ? c.max.z - inset : c.min.z + inset; rot = 0; }
        else { z = c.min.z + inset + t * Math.max(0, d - 2 * inset); x = face === 3 ? c.max.x - inset : c.min.x + inset; rot = Math.PI / 2; }
        y = c.max.y;
      } else {                    // hugging a wall at ground level
        const face = Math.floor(R() * 4), t = R();
        const depth = Math.min(sx, sz) / 2 + 0.1;
        if (face < 2) { x = c.min.x + t * w; z = face ? c.max.z + depth : c.min.z - depth; rot = 0; }
        else { z = c.min.z + t * d; x = face === 3 ? c.max.x + depth : c.min.x - depth; rot = Math.PI / 2; }
        y = c.min.y <= 0.3 ? world.groundHeight(x, z, 0.2, 1.0, 1.0) : c.min.y;
        if (!(y > -4)) continue;
      }
    }
    const longX = sx >= sz, along = rot === 0 ? 0 : Math.PI / 2;   // long axis parallel to the wall (+ small jitter on small pieces)
    const ry = along + (longX ? 0 : Math.PI / 2) + (R() < 0.5 ? Math.PI : 0) + (rho < 0.5 ? (R() - 0.5) * 2 : 0);
    if (!ok(x, y, z, rho, def[1])) continue;
    SC.makeScale(k, k, k); RT.makeRotationY(ry); M4.makeTranslation(x, y, z).multiply(RT).multiply(SC);
    for (const g of M.geo) out.push(g.clone().applyMatrix4(M4));
    placed.push([x, z, rho, y]);
  }
  if (!out.length) return 0;
  const merged = mergeGeometries(out, false); merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, MODELS.get('cone')?.mat || [...MODELS.values()][0].mat);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.userData.dress = true;
  root.add(mesh); out.forEach(g => g.dispose());
  return placed.length;
}
