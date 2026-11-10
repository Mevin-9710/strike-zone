// Kenney CC0 architecture (models/kenney/arch_<kit>.glb, baked by tools/kenney_maps.mjs): facades, roof props, stairs, awnings.
// Everything is baked into Kit.kgeos (merged per texture at finish()), so there is no per-frame cost. All functions return
// false when the GLBs are missing -> the Kit keeps its procedural meshes. Colliders are never touched (visuals only).
import * as THREE from 'three';

const KITS = ['com', 'ind', 'fac', 'are', 'dun'];
const M = new Map();   // name -> { geo[], mat, size, riseX }   (kit-prefixed: 'com:building-a')
export const archReady = () => M.size > 0 && !/noarch/.test(location.search);   // ?noarch=1 -> procedural fallback (for A/B)
const get = n => M.get(n);

export async function loadArch(loader) {
  await Promise.all(KITS.map(async kit => {
    try {
      const g = await loader.loadAsync(`models/kenney/arch_${kit}.glb`);
      let mat = null; g.scene.updateMatrixWorld(true);
      for (const grp of g.scene.children) {
        const geos = [];
        grp.traverse(o => {
          if (!o.isMesh) return;
          if (!mat) mat = new THREE.MeshLambertMaterial({ map: o.material.map, color: 0xffffff });
          const ge = o.geometry.clone().applyMatrix4(o.matrixWorld);
          geos.push(ge.index ? ge.toNonIndexed() : ge);
        });
        if (!geos.length) continue;
        const box = new THREE.Box3(); geos.forEach(ge => { ge.computeBoundingBox(); box.union(ge.boundingBox); });
        const c = box.getCenter(new THREE.Vector3());
        geos.forEach(ge => ge.translate(-c.x, -box.min.y, -c.z));
        const size = box.getSize(new THREE.Vector3());
        // which way does the model rise (stairs)? +1 = toward +x, -1 = toward -x
        let hi = 0, nh = 0, lo = 0, nl = 0;
        for (const ge of geos) { const p = ge.attributes.position; for (let i = 0; i < p.count; i++) { if (p.getY(i) > size.y * 0.8) { hi += p.getX(i); nh++; } else if (p.getY(i) < size.y * 0.2) { lo += p.getX(i); nl++; } } }
        let tris = 0; geos.forEach(ge => tris += ge.attributes.position.count / 3);
        M.set(kit + ':' + grp.name.replace(/_\d+$/, ''), { geo: geos, mat, size, tris, riseX: nh && nl && hi / nh > lo / nl ? 1 : -1 });
      }
    } catch (e) { console.warn('kenney arch failed', kit, e); }
  }));
}

const hash = (a, b) => { let h = Math.imul(Math.round(a * 7 + 1013), 374761393) ^ Math.imul(Math.round(b * 7 + 77), 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _s = new THREE.Matrix4();
// Place model `name` with its base-centre at (x,y,z), yaw rotY, scaled (sx,sy,sz) in model axes.
function put(k, name, x, y, z, rotY, sx, sy, sz) {
  const m = get(name); if (!m) return 0;
  _m.makeRotationY(rotY).setPosition(x, y, z).multiply(_s.makeScale(sx, sy, sz));
  let list = k.kgeos.get(m.mat); if (!list) k.kgeos.set(m.mat, list = []);
  for (const g of m.geo) list.push(g.clone().applyMatrix4(_m));
  k._archTris = (k._archTris || 0) + m.tris;
  return m.tris;
}

const COM_HI = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'building-h'];
const COM_SKY = ['building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c', 'building-skyscraper-d', 'building-skyscraper-e'];
const COM_LOW = ['low-detail-building-a', 'low-detail-building-b', 'low-detail-building-c', 'low-detail-building-d', 'low-detail-building-e', 'low-detail-building-f', 'low-detail-building-g', 'low-detail-building-h'];
const IND_HI = ['ind:building-a', 'ind:building-d', 'com:building-c', 'com:building-e'];   // flat-roofed sheds only (pitched/arched roofs would poke through)
const TRI_BUDGET = 220000;   // detailed-facade triangles per map; beyond that low-detail pieces are used

// Face -> outward yaw for a model whose front is +Z.
const YAW = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };

// Tile `faces` of the footprint with Kenney facades (detailed on `faces`, low-detail elsewhere). Visual only.
export function archBuilding(k, x0, z0, x1, z1, h, { faces = ['n', 's', 'e', 'w'], wall = ['brick'], walkable = false } = {}) {
  if (!archReady()) return false;
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, seed = hash(cx, cz);
  const industrial = wall[0] === 'corrugated';
  const tall = h > 14;
  const pool = industrial ? IND_HI : (tall ? COM_SKY : COM_HI).map(n => 'com:' + n);
  const td = Math.min(4, W / 2, D / 2);
  for (const face of ['s', 'n', 'e', 'w']) {
    const horiz = face === 's' || face === 'n';
    const L = horiz ? W : D - 2 * td, depthCap = horiz ? D / 2 : W / 2;
    const detailed = faces.includes(face) && (k._archTris || 0) < TRI_BUDGET;
    const name = detailed ? pool[Math.floor(hash(cx + face.charCodeAt(0), cz) * pool.length)] : 'com:' + COM_LOW[Math.floor(seed * COM_LOW.length)];
    const m = get(name); if (!m) continue;
    const sy = h / m.size.y, wn = m.size.x * sy;
    const n = detailed ? Math.max(1, Math.round(L / wn)) : 1;
    const sx = L / n / m.size.x;
    const depth = Math.min(depthCap, td, m.size.z * Math.max(sx, sy) * 0.9, 4), sz = depth / m.size.z;
    // face centre line, pushed inward by depth/2 so the front plane sits on the footprint edge
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      let px, pz;
      if (face === 's') { px = x0 + W * t; pz = z1 - depth / 2; }
      else if (face === 'n') { px = x0 + W * t; pz = z0 + depth / 2; }
      else if (face === 'e') { px = x1 - depth / 2; pz = z0 + td + (D - 2 * td) * t; }
      else { px = x0 + depth / 2; pz = z0 + td + (D - 2 * td) * t; }
      put(k, name, px, 0, pz, YAW[face], sx, sy, sz);
    }
  }
  // roof props on roofs nobody can stand on (walkable roofs keep their clear top)
  if (!walkable && h >= 6 && W >= 8 && D >= 8) {
    const r = hash(cz, cx), ry = h + 0.35;
    if (r < 0.35 && get('ind:chimney-large')) put(k, 'ind:chimney-' + (r < 0.17 ? 'large' : 'medium'), x0 + W * 0.7, ry, z0 + D * 0.3, 0, 1.6, 2.2, 1.6);
    else if (r < 0.7 && get('ind:solar-panel-landscape-group')) { put(k, 'ind:solar-panel-landscape-group', x0 + W * 0.35, ry, z0 + D * 0.5, 0, 2.2, 2.2, 2.2); put(k, 'ind:solar-panel-landscape-group', x0 + W * 0.65, ry, z0 + D * 0.5, 0, 2.2, 2.2, 2.2); }
  }
  return true;
}

// Stairs: fire-escape flights (open below) -> factory catwalk-stairs, solid flights -> dungeon stairs. Visual only.
export function archStairs(k, x0, z0, x1, z1, yLow, yHigh, axis, dir, solidBelow) {
  const name = solidBelow ? 'dun:stairs' : 'fac:catwalk-stairs', m = get(name);
  if (!m) return false;
  const run = axis === 'x' ? x1 - x0 : z1 - z0, wid = axis === 'x' ? z1 - z0 : x1 - x0, rise = yHigh - yLow;
  // model rises toward riseX along +x; map that to the requested world rise direction
  const want = axis === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? -Math.PI / 2 : Math.PI / 2);   // yaw taking +x -> world dir
  const yaw = (m.riseX > 0 ? want : want + Math.PI);
  // model: x = run (rise), z = width. rotation about Y by yaw puts model +x on (cos, -sin) ... use matrix so sx=run, sz=width
  put(k, name, (x0 + x1) / 2, yLow, (z0 + z1) / 2, yaw, run / m.size.x, rise / m.size.y, wid / m.size.z);
  return true;
}

// Storefront awning over a door: Kenney awning tiles along `w`.
export function archAwning(k, x, y, z, face, w, d) {
  const m = get('com:detail-awning-wide'); if (!m) return false;
  const n = Math.max(1, Math.round(w / 1.6)), sx = w / n / m.size.x;
  const horiz = face === 's' || face === 'n', sgn = (face === 's' || face === 'e') ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    const px = horiz ? x + t * w : x + sgn * d * 0.45, pz = horiz ? z + sgn * d * 0.45 : z + t * w;
    put(k, 'com:detail-awning-wide', px, y, pz, YAW[face], sx, sx * 1.1, d / m.size.z * 0.9);
  }
  return true;
}

// Wall segment of an enterable building (procgen facade): a squashed low-detail Kenney building panel, outward `face`.
// (a..c) along the wall, y/hh vertical span, `line` = wall centre line, t = thickness. Visual only; returns true when drawn.
export function archSeg(k, face, a, c, y, hh, line, t) {
  if (!archReady() || c - a < 0.1 || hh < 0.1) return false;
  const horiz = face === 's' || face === 'n', mid = (a + c) / 2;
  const r = hash(horiz ? mid : line, horiz ? line : mid), name = r < 0.4 ? 'fac:structure-wall' : r < 0.7 ? 'dun:wall' : 'are:wall', m = get(name);
  if (!m) return false;
  put(k, name, horiz ? mid : line, y, horiz ? line : mid, YAW[face], (c - a) / m.size.x, hh / m.size.y, t / m.size.z);
  return true;
}
