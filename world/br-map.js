// Battle royale map "Island Ring": the four Deathmatch arenas as regions on one island (232 x 232 m).
//   NW Belltower Square · NE Sandkeep · SW Lantern Canal · SE Neon Alley, open ground between them,
//   a central market on its own island inside a ring canal (4 bridges), roads from every arena exit to a bridge.
// Colours follow the Blastline look: cool sky + turquoise sea against warm sand, vivid grass, loud accent props
// (yellow #ffd23b, cyan #36d6f0, red #e3141b, green #33c46a, blue #2f5bff, orange #f08a24).
// Phones: far regions (> CULL m) are hidden every frame via map.cull(cameraPos).
import * as THREE from 'three';
import { Kit } from './kit.js';
import { DM_MAPS, dmMapData, floors } from './dm-maps.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const BR_SIZE = 232, BR_C = 116;
const S = BR_SIZE, C = BR_C, MKT = 24, CAN = 31;                // market half-size, canal outer half-size
// arena placement: [id, x offset, z offset]
export const BR_REGIONS = [['belltower', 16, 18], ['sandkeep', 158, 14], ['lantern', 14, 172], ['neon', 156, 164]];
export const BR_MAP_IDS = BR_REGIONS.map(r => r[0]);
const PAL = { sand: 0xe0a845, grass: 0x45b83a, grass2: 0x3aa632, road: 0x4e5666, stripe: 0xffd23b, bank: 0xb8b0a0, tile: 0xc99a5a, tile2: 0xa8743c,
  water: 0x2bc6d9, sea: 0x22b3d6, yellow: 0xffd23b, cyan: 0x36d6f0, red: 0xe3141b, green: 0x33c46a, blue: 0x2f5bff, orange: 0xf08a24, white: 0xf7f4ee,
  trunk: 0x8a5a2b, leaf: 0x2f9e3a, leaf2: 0x5cc23f, rock: 0x7f93aa, wood: 0xc98a4b, dark: 0x2a3142 };

// gates cut into each arena's outer wall (local arena coords): [edge, centre along the edge, width, depth into the arena]
// picked where the arena floor behind the wall is open (see the wall profile in DEV-LOG v-BR1)
const GATES = { belltower: [['E', 22, 6, 2.4], ['S', 50, 5, 2.4]], lantern: [['E', 20, 6, 1.4], ['N', 53.5, 9, 2.4]],
  neon: [['W', 12, 6, 1.6], ['W', 34, 6, 1.6]], sandkeep: [['S', 6, 6, 2.4], ['W', 12, 3, 1.6]] };
const GATE_Y0 = 0.1, GATE_Y1 = 4.2;
// the arenas' outer walls are cut down to a low ruin wall (Mevin: the full-height walls made them look like boxes)
// per arena: depth of the wall band from each edge [N, S, W, E], cap colour; everything in the band above LOW_WALL goes
const LOW_WALL = 1.3;
const BANDS = { belltower: [[2.2, 2.2, 1.2, 1.2], 0xc98f6a], lantern: [[2.2, 2.2, 1.2, 1.2], 0x8a6a45], neon: [[1.9, 1.6, 1.6, 1.6], 0x3d4258], sandkeep: [[6, 6, 6, 6], 0xc99a5a] };
function bandBoxes(def, [n, s, w, e]) { const o = 1.6, Y1 = 60;
  return [[-o, LOW_WALL, -o, def.w + o, Y1, n], [-o, LOW_WALL, def.d - s, def.w + o, Y1, def.d + o], [-o, LOW_WALL, -o, w, Y1, def.d + o], [def.w - e, LOW_WALL, -o, def.w + o, Y1, def.d + o]]; }
function gateBox(def, [edge, t, w, dep]) {                         // -> [x0, y0, z0, x1, y1, z1] in arena coords
  const h = w / 2, o = 1.5;
  if (edge === 'N') return [t - h, GATE_Y0, -o, t + h, GATE_Y1, dep];
  if (edge === 'S') return [t - h, GATE_Y0, def.d - dep, t + h, GATE_Y1, def.d + o];
  if (edge === 'W') return [-o, GATE_Y0, t - h, dep, GATE_Y1, t + h];
  return [def.w - dep, GATE_Y0, t - h, def.w + o, GATE_Y1, t + h];
}
// the parts of space outside a box, as disjoint convex pieces (each a list of [axis, sign, value]: keep where sign*(p[axis]-value) >= 0)
const outside = ([x0, y0, z0, x1, y1, z1]) => [[[0, -1, x0]], [[0, 1, x1]], [[0, 1, x0], [0, -1, x1], [2, -1, z0]], [[0, 1, x0], [0, -1, x1], [2, 1, z1]],
  [[0, 1, x0], [0, -1, x1], [2, 1, z0], [2, -1, z1], [1, 1, y1]], [[0, 1, x0], [0, -1, x1], [2, 1, z0], [2, -1, z1], [1, -1, y0]]];
// collider boxes: split around the gate
function splitBox(b, g) {                                          // b, g: [x0, y0, z0, x1, y1, z1]
  if (b[3] <= g[0] || b[0] >= g[3] || b[4] <= g[1] || b[1] >= g[4] || b[5] <= g[2] || b[2] >= g[5]) return [b];
  const out = [];
  for (const piece of outside(g)) {
    const q = b.slice(); for (const [ax, sg, v] of piece) { if (sg > 0) q[ax] = Math.max(q[ax], v); else q[ax + 3] = Math.min(q[ax + 3], v); }
    if (q[3] - q[0] > 0.01 && q[4] - q[1] > 0.01 && q[5] - q[2] > 0.01) out.push(q);
  }
  return out;
}
// render meshes: clip triangles against the gate (Sutherland-Hodgman per convex piece, all attributes interpolated)
function carveMesh(m, gates) {                                     // gates in world coords
  const inv = new THREE.Matrix4().copy(m.matrixWorld).invert(), src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
  const names = Object.keys(src.attributes).filter(n => n !== 'position'); names.unshift('position');
  const sizes = names.map(n => src.attributes[n].itemSize), stride = sizes.reduce((a, b) => a + b, 0), n = src.attributes.position.count;
  const pieces = gates.map(g => outside(g).map(pc => pc.map(([ax, sg, v]) => { const nrm = V(0, 0, 0); nrm.setComponent(ax, sg); return new THREE.Plane(nrm, -sg * v).applyMatrix4(inv); })));
  const vert = i => { const a = new Float32Array(stride); let o = 0; names.forEach((nm, k) => { const at = src.attributes[nm]; for (let c = 0; c < sizes[k]; c++) a[o++] = at.getComponent(i, c); }); return a; };
  const P = new THREE.Vector3(), dist = (pl, v) => pl.distanceToPoint(P.set(v[0], v[1], v[2]));
  const clip = (poly, pl) => { const out = []; for (let i = 0; i < poly.length; i++) { const A = poly[i], B = poly[(i + 1) % poly.length], da = dist(pl, A), db = dist(pl, B);
    if (da >= 0) out.push(A); if ((da >= 0) !== (db >= 0)) { const t = da / (da - db), v = new Float32Array(stride); for (let c = 0; c < stride; c++) v[c] = A[c] + (B[c] - A[c]) * t; out.push(v); } } return out; };
  const groups = src.groups.length ? src.groups : [{ start: 0, count: n, materialIndex: 0 }], outV = [], outG = [];
  for (const gr of groups) {
    const g0 = outV.length;
    for (let t = gr.start; t < Math.min(n, gr.start + gr.count); t += 3) {
      let polys = [[vert(t), vert(t + 1), vert(t + 2)]];
      for (const gate of pieces) {
        const next = [];
        for (const poly of polys) {
          const whole = gate.find(pc => pc.every(pl => poly.every(v => dist(pl, v) >= -1e-4)));
          if (whole) { next.push(poly); continue; }
          for (const pc of gate) { let q = poly; for (const pl of pc) { q = clip(q, pl); if (q.length < 3) break; } if (q.length >= 3) next.push(q); }
        }
        polys = next;
      }
      for (const q of polys) for (let i = 1; i < q.length - 1; i++) outV.push(q[0], q[i], q[i + 1]);
    }
    outG.push({ start: g0, count: outV.length - g0, materialIndex: gr.materialIndex });
  }
  const geo = new THREE.BufferGeometry(); let o = 0;
  names.forEach((nm, k) => { const arr = new Float32Array(outV.length * sizes[k]); outV.forEach((v, i) => { for (let c = 0; c < sizes[k]; c++) arr[i * sizes[k] + c] = v[o + c]; }); o += sizes[k]; geo.setAttribute(nm, new THREE.BufferAttribute(arr, sizes[k], src.attributes[nm].normalized)); });
  if (src.groups.length) for (const g of outG) geo.addGroup(g.start, g.count, g.materialIndex);
  geo.computeBoundingBox(); geo.computeBoundingSphere(); m.geometry = geo;
}

// scenery the arena GLBs place outside their own wall (merged into big meshes): drop every triangle whose centre lies outside
function trimOutside(m, x0, z0, x1, z1) {
  const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry, pos = src.attributes.position, n = pos.count, mw = m.matrixWorld, P = new THREE.Vector3(), Q = new THREE.Vector3();
  const keep = [];
  for (let t = 0; t < n; t += 3) { Q.set(0, 0, 0); for (let i = 0; i < 3; i++) Q.add(P.fromBufferAttribute(pos, t + i).applyMatrix4(mw)); Q.divideScalar(3); let ok = Q.x > x0 && Q.x < x1 && Q.z > z0 && Q.z < z1;
    for (let i = 0; i < 3 && ok; i++) { P.fromBufferAttribute(pos, t + i).applyMatrix4(mw); ok = P.x > x0 - 1 && P.x < x1 + 1 && P.z > z0 - 1 && P.z < z1 + 1; }   // roofs straddling the wall too
    keep.push(ok); }
  if (keep.every(Boolean)) return;
  const geo = new THREE.BufferGeometry(), map = [];
  for (let t = 0; t < keep.length; t++) if (keep[t]) map.push(t * 3, t * 3 + 1, t * 3 + 2);
  for (const nm in src.attributes) { const at = src.attributes[nm], sz = at.itemSize, arr = new at.array.constructor(map.length * sz); map.forEach((v, i) => { for (let c = 0; c < sz; c++) arr[i * sz + c] = at.getComponent(v, c); }); geo.setAttribute(nm, new THREE.BufferAttribute(arr, sz, at.normalized)); }
  if (src.groups.length) { const oldToNew = new Int32Array(n + 1); let k = 0; for (let v = 0; v < n; v++) { oldToNew[v] = k; if (keep[(v / 3) | 0]) k++; } oldToNew[n] = k; for (const g of src.groups) geo.addGroup(oldToNew[g.start], oldToNew[Math.min(n, g.start + g.count)] - oldToNew[g.start], g.materialIndex); }
  geo.computeBoundingBox(); geo.computeBoundingSphere(); m.geometry = geo;
}

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function buildBrIsland(world, scene) {
  const k = new Kit(world, scene), R = rng(9191), f = c => k.mat('flat', { color: c });
  const regions = [], rects = [], flats = [];                                  // rects: footprints to keep clear of filler props
  const keep = (x0, z0, x1, z1, pad = 0) => rects.push([x0 - pad, z0 - pad, x1 + pad, z1 + pad]);
  const free = (x, z, r = 1) => x > 12 + r && z > 12 + r && x < S - 12 - r && z < S - 12 - r && !rects.some(q => x + r > q[0] && x - r < q[2] && z + r > q[1] && z - r < q[3]);

  // ---------- the four arenas ----------
  for (const [id, ox, oz] of BR_REGIONS) {
    const def = DM_MAPS.find(d => d.id === id), r = dmMapData(id); if (!r) throw new Error('arena not loaded: ' + id);
    const o = V(ox, 0, oz), pw = { addBox: (a, b, t) => world.addBox(a.clone().add(o), b.clone().add(o), t), addRamp: (a, b, ax, dir, t) => world.addRamp(a.clone().add(o), b.clone().add(o), ax, dir, t) };
    const sub = new Kit(pw, scene), vis = r.scene.clone(); vis.position.copy(o); scene.add(vis);
    { const bb = new THREE.Box3(), c = new THREE.Vector3(), sz = new THREE.Vector3(), empty = new THREE.BufferGeometry();   // drop each arena's own backdrop (sky hills, clouds, skyline ring, far ground) and scenery buildings outside its wall
      vis.updateMatrixWorld(true);
      vis.traverse(m => { if (!m.isMesh) return; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); bb.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); bb.getSize(sz); bb.getCenter(c); c.sub(o);   // own geometry only (children keep drawing)
        if (sz.x > def.w * 1.8 || sz.z > def.d * 1.8 || c.x < -1.5 || c.z < -1.5 || c.x > def.w + 1.5 || c.z > def.d + 1.5) m.geometry = empty; }); }
    const wb = new THREE.Box3();
    vis.traverse(m => { if (m.isMesh && m.geometry.attributes.position?.count) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); wb.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
      if (wb.min.x < ox - 1.5 || wb.min.z < oz - 1.5 || wb.max.x > ox + def.w + 1.5 || wb.max.z > oz + def.d + 1.5) trimOutside(m, ox - 1.5, oz - 1.5, ox + def.w + 1.5, oz + def.d + 1.5); } });
    // gates through the outer wall: cut the render meshes and the colliders, then frame the opening
    const gates = GATES[id].map(g => gateBox(def, g)), gw = gates.map(g => [g[0] + ox, g[1], g[2] + oz, g[3] + ox, g[4], g[5] + oz]), gb = new THREE.Box3();
    vis.traverse(m => { if (!m.isMesh || !m.geometry.attributes.position?.count) return; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); wb.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
      const hit = gw.filter(g => wb.intersectsBox(gb.set(V(g[0], g[1], g[2]), V(g[3], g[4], g[5])))); if (hit.length) carveMesh(m, hit); });
    const bands = bandBoxes(def, BANDS[id][0]), bw = bands.map(g => [g[0] + ox, g[1], g[2] + oz, g[3] + ox, g[4], g[5] + oz]);
    vis.traverse(m => { if (!m.isMesh || !m.geometry.attributes.position?.count) return; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); wb.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
      const hit = bw.filter(g => wb.intersectsBox(gb.set(V(g[0], g[1], g[2]), V(g[3], g[4], g[5])))); if (hit.length) carveMesh(m, hit); });
    const capKey = f(BANDS[id][1]), caps = [];
    const cut = bx => [...gates, ...bands].reduce((list, g) => list.flatMap(q => splitBox(q, g)), [bx]), tops = gates.map(() => LOW_WALL);
    const capOf = b => { if (b[1] >= LOW_WALL - 0.05 || b[4] <= LOW_WALL + 0.05) return; for (const g of bands) { const x0 = Math.max(b[0], g[0]), x1 = Math.min(b[3], g[3]), z0 = Math.max(b[2], g[2]), z1 = Math.min(b[5], g[5]);
      if (x1 - x0 > 0.05 && z1 - z0 > 0.05) caps.push([x0, z0, x1, z1]); } };
    const inFoot = b => { const cx = (b[0] + b[3]) / 2, cz = (b[2] + b[5]) / 2; return cx > -1.5 && cz > -1.5 && cx < def.w + 1.5 && cz < def.d + 1.5; };
    const cols = [...r.data.boxes.map(b => [b.x0, b.y0, b.z0, b.x1, b.y1, b.z1]), ...r.extra];
    cols.forEach(b => gates.forEach((g, i) => { if (b[3] > g[0] && b[0] < g[3] && b[5] > g[2] && b[2] < g[5] && b[1] < g[4]) tops[i] = Math.max(tops[i], Math.min(b[4], 8)); }));
    for (const b of r.data.boxes) {
      if (b.x1 - b.x0 < 0.01 || b.z1 - b.z0 < 0.01 || b.y1 - b.y0 < 0.01) continue;
      if (id === 'lantern' && b.x0 >= 33.4 && b.x1 <= 36.6 && b.y1 <= 2.7 && b.z0 > 10 && b.z1 < 30) continue;
      if (!inFoot([b.x0, b.y0, b.z0, b.x1, b.y1, b.z1])) continue;
      for (const q of cut([b.x0, b.y0, b.z0, b.x1, b.y1, b.z1])) pw.addBox(V(q[0], q[1], q[2]), V(q[3], q[4], q[5]));
      capOf([b.x0, b.y0, b.z0, b.x1, b.y1, b.z1]);
      if (b.y1 - b.y0 > 2.2 && (b.x1 - b.x0) * (b.z1 - b.z0) > 1.5 && b.y0 < 1) k.minimap.push({ x0: b.x0 + ox, z0: b.z0 + oz, x1: b.x1 + ox, z1: b.z1 + oz, y: b.y1, kind: 'building' });
    }
    for (const b of r.extra) if (inFoot(b)) { for (const q of cut(b)) pw.addBox(V(q[0], q[1], q[2]), V(q[3], q[4], q[5])); capOf(b); }
    for (const [x0, z0, x1, z1] of caps) {                          // stone cap on every cut wall, minus the gate openings
      const parts = gates.reduce((list, g) => list.flatMap(q => splitBox(q, [g[0], -1, g[2], g[3], 9, g[5]])), [[x0, LOW_WALL - 0.12, z0, x1, LOW_WALL + 0.04, z1]]);
      for (const q of parts) if (q[1] < LOW_WALL) k.box(ox + (q[0] + q[3]) / 2 , q[1], oz + (q[2] + q[5]) / 2, q[3] - q[0] + 0.08, q[4] - q[1], q[5] - q[2] + 0.08, capKey, { collide: false });
    }
    gw.forEach((g, i) => {                                         // gate frame: yellow posts, dark beam if wall stays above the opening
      const H = LOW_WALL + 1.1, alongX = GATES[id][i][0] === 'N' || GATES[id][i][0] === 'S', cx = (g[0] + g[3]) / 2, cz = (g[2] + g[5]) / 2, dx = g[3] - g[0], dz = g[5] - g[2];
      for (const sgn of [-1, 1]) {
        const px = alongX ? cx + sgn * (dx / 2 + 0.3) : cx, pz = alongX ? cz : cz + sgn * (dz / 2 + 0.3);
        k.box(px, 0, pz, alongX ? 0.6 : dx, H + 0.05, alongX ? dz : 0.6, f(PAL.yellow));
        k.box(px, 0, pz, alongX ? 0.64 : dx + 0.04, 0.5, alongX ? dz + 0.04 : 0.64, f(PAL.dark), { collide: false });
      }
      if (false) k.box(cx, GATE_Y1, cz, alongX ? dx + 1.2 : dx, Math.min(0.6, H - GATE_Y1), alongX ? dz : dz + 1.2, f(PAL.dark), { collide: false });
    });
    floors(def, pw, sub, r.data);
    sub.finish(); sub.root.position.copy(o); scene.remove(sub.root); k.root.add(sub.root);
    k.water.push(...sub.water); k.flicker.push(...sub.flicker); k.lights.push(...sub.lights); k.beacons.push(...sub.beacons);
    regions.push({ id, title: def.title, x0: ox, z0: oz, x1: ox + def.w, z1: oz + def.d, objs: [vis, sub.root] });
    keep(ox, oz, ox + def.w, oz + def.d, 2);
  }

  // ---------- ground: sand island, grass inland (cells skip the arenas, canal and market), sea around ----------
  // colliders: everything at y 0 except the canal ring (bed at -0.4, wadeable)
  const gbox = (x0, z0, x1, z1) => world.addBox(V(x0, -4, z0), V(x1, 0, z1), 'floor');
  const a = C - CAN, b = C + CAN, m0 = C - MKT, m1 = C + MKT;
  gbox(-4, -4, S + 4, a); gbox(-4, b, S + 4, S + 4); gbox(-4, a, a, b); gbox(b, a, S + 4, b); gbox(m0, m0, m1, m1);
  for (const [x0, z0, x1, z1] of [[a, a, b, m0], [a, m1, b, b], [a, m0, m0, m1], [m1, m0, b, m1]]) world.addBox(V(x0, -4, z0), V(x1, -0.4, z1), 'floor');
  const sandBox = (x0, z0, x1, z1) => k.box((x0 + x1) / 2, -4.03, (z0 + z1) / 2, x1 - x0, 4, z1 - z0, f(PAL.sand), { collide: false, cullBottom: true });   // 3 cm under the arena floors (no z-fight)
  sandBox(-4, -4, S + 4, a); sandBox(-4, b, S + 4, S + 4); sandBox(-4, a, a, b); sandBox(b, a, S + 4, b); sandBox(m0, m0, m1, m1);   // open over the canal ring
  const sea = 420; k.waterPlane(-sea, -sea, S + sea, -2, -0.35, PAL.sea); k.waterPlane(-sea, S + 2, S + sea, S + sea, -0.35, PAL.sea);
  k.waterPlane(-sea, -2, -2, S + 2, -0.35, PAL.sea); k.waterPlane(S + 2, -2, S + sea, S + 2, -0.35, PAL.sea);
  k.box(S / 2, -6, S / 2, S + 2 * sea, 0.2, S + 2 * sea, f(0x1b8fb0), { collide: false });          // sea floor tint
  for (const [x0, z0, x1, z1] of [[0, 0, S, 0], [0, S, S, S], [0, 0, 0, S], [S, 0, S, S]]) k.invisibleWall(x0, z0, x1, z1);
  // canal: water, banks, bed
  keep(a, a, b, b, 1);
  for (const [x0, z0, x1, z1] of [[a, a, b, m0], [a, m1, b, b], [a, m0, m0, m1], [m1, m0, b, m1]]) { k.box((x0 + x1) / 2, -0.6, (z0 + z1) / 2, x1 - x0, 0.2, z1 - z0, f(0x1f7f95), { collide: false }); k.waterPlane(x0, z0, x1, z1, -0.12, PAL.water); }
  for (const h of [CAN, MKT]) for (const [x0, z0, x1, z1] of [[C - h, C - h, C + h, C - h], [C - h, C + h, C + h, C + h], [C - h, C - h, C - h, C + h], [C + h, C - h, C + h, C + h]]) {
    const hz = z0 === z1; k.box((x0 + x1) / 2, -0.4, (z0 + z1) / 2, hz ? x1 - x0 + 1 : 1, 0.45, hz ? 1 : z1 - z0 + 1, f(PAL.bank), { collide: false });
  }

  // ---------- market island ----------
  k.box(C, 0, C, MKT * 2, 0.03, MKT * 2, f(PAL.tile), { collide: false });
  for (let i = -MKT + 3; i < MKT; i += 6) for (let j = -MKT + 3; j < MKT; j += 6) if (((i + j) / 6 & 1) === 0) k.box(C + i, 0, C + j, 5.6, 0.04, 5.6, f(PAL.tile2), { collide: false });
  // landmark: Blastline beacon tower in the middle (climbable platform)
  k.box(C, 0, C, 3, 9, 3, f(PAL.dark)); for (let y = 1; y < 9; y += 2) k.box(C, y, C, 3.06, 0.5, 3.06, f(y % 4 === 1 ? PAL.yellow : PAL.red), { collide: false });
  k.platform(C - 4, C - 4, C + 4, C + 4, 9.15, f(PAL.yellow), 'nwe');
  k.stairs(C + 1.5, C + 4, C + 4, C + 16, 0, 9.15, 'z', -1, f(PAL.orange), { sideRails: [] });
  k.box(C, 9.15, C, 0.5, 6, 0.5, f(PAL.white), { collide: false }); k.blob(C, 15.6, C, 1.1, f(PAL.cyan));
  // stalls: coloured awnings on posts, a counter for cover
  const awn = [PAL.red, PAL.yellow, PAL.cyan, PAL.green, PAL.blue, PAL.orange];
  let si = 0;
  for (const [sx, sz] of [[-16, -16], [-6, -18], [10, -16], [17, -6], [16, 10], [6, 17], [-10, 16], [-17, 6], [-17, -6]]) {
    const x = C + sx, z = C + sz, col = awn[si++ % awn.length];
    for (const [dx, dz] of [[-1.8, -1.3], [1.8, -1.3], [-1.8, 1.3], [1.8, 1.3]]) k.box(x + dx, 0, z + dz, 0.16, 2.6, 0.16, f(PAL.white), { collide: false });
    k.box(x, 2.6, z, 4.3, 0.18, 3.3, f(col), { collide: false }); k.box(x, 2.78, z, 4.3, 0.1, 1.2, f(PAL.white), { collide: false });
    k.box(x, 0, z + 0.9, 3.4, 1.05, 0.8, f(PAL.wood));
    k.box(x - 0.9, 1.05, z + 0.9, 0.5, 0.35, 0.5, f([PAL.orange, PAL.green, PAL.red][si % 3]), { collide: false });
  }
  for (const [cx, cz] of [[-8, -6], [8, 6], [-6, 9], [7, -9]]) crates(k, f, C + cx, C + cz, R);

  // ---------- bridges over the canal (deck flush with the ground, railings) ----------
  const bridge = (x0, z0, x1, z1, alongX) => {
    k.box((x0 + x1) / 2, -0.25, (z0 + z1) / 2, x1 - x0, 0.25, z1 - z0, f(PAL.wood), { collide: 'floor' });
    for (let t = 0.5; t < (alongX ? x1 - x0 : z1 - z0); t += 1.2) {
      if (alongX) k.box(x0 + t, -0.005, (z0 + z1) / 2, 0.08, 0.01, z1 - z0, f(0x9c6534), { collide: false }); else k.box((x0 + x1) / 2, -0.005, z0 + t, x1 - x0, 0.01, 0.08, f(0x9c6534), { collide: false });
    }
    if (alongX) { k.railing(x0, z0, x1, z0, 0); k.railing(x0, z1, x1, z1, 0); k.box((x0 + x1) / 2, 0.95, z0, x1 - x0, 0.12, 0.14, f(PAL.yellow), { collide: false }); k.box((x0 + x1) / 2, 0.95, z1, x1 - x0, 0.12, 0.14, f(PAL.yellow), { collide: false }); }
    else { k.railing(x0, z0, x0, z1, 0); k.railing(x1, z0, x1, z1, 0); k.box(x0, 0.95, (z0 + z1) / 2, 0.14, 0.12, z1 - z0, f(PAL.yellow), { collide: false }); k.box(x1, 0.95, (z0 + z1) / 2, 0.14, 0.12, z1 - z0, f(PAL.yellow), { collide: false }); }
  };
  const BW = 3.5;
  bridge(C - BW, a - 0.6, C + BW, m0 + 0.6, false); bridge(C - BW, m1 - 0.6, C + BW, b + 0.6, false);
  bridge(a - 0.6, C - BW, m0 + 0.6, C + BW, true); bridge(m1 - 0.6, C - BW, b + 0.6, C + BW, true);

  // ---------- roads: every arena exit -> a bridge, plus the cross to the beach ----------
  const road = (x0, z0, x1, z1) => {
    const X0 = Math.min(x0, x1) - 4, X1 = Math.max(x0, x1) + 4, Z0 = Math.min(z0, z1) - 4, Z1 = Math.max(z0, z1) + 4;
    k.box((X0 + X1) / 2, 0, (Z0 + Z1) / 2, X1 - X0, 0.035, Z1 - Z0, f(PAL.road), { collide: false });
    const along = X1 - X0 > Z1 - Z0;
    for (let t = 2; t < (along ? X1 - X0 : Z1 - Z0) - 2; t += 5) {
      if (along) k.box(X0 + t, 0, (Z0 + Z1) / 2, 2.4, 0.045, 0.3, f(PAL.stripe), { collide: false }); else k.box((X0 + X1) / 2, 0, Z0 + t, 0.3, 0.045, 2.4, f(PAL.stripe), { collide: false });
    }
    keep(X0, Z0, X1, Z1, 0.5); flats.push([X0, Z0, X1, Z1]);
  };
  road(C, 14, C, a - 1); road(C, b + 1, C, S - 14); road(14, C, a - 1, C); road(b + 1, C, S - 14, C);   // the cross
  road(78, 40, C - 4, 40);                                          // Belltower east gate
  road(67, 64, 67, 170);                                            // Belltower south gate <-> Lantern north gate (west road)
  road(164, 72, 164, C - 4);                                        // Sandkeep south gate
  road(C + 4, 26, 156, 26);                                         // Sandkeep west gate
  road(86, 192, C - 4, 192);                                        // Lantern east gate
  road(C + 4, 176, 154, 176); road(C + 4, 198, 154, 198);           // Neon west gates

  // ---------- open ground: farm (W), container yard (E), watchtowers, trees, rocks, crate cover ----------
  // farm between Belltower and Lantern
  shed(k, f, 26, 84, 36, 92, PAL.red); shed(k, f, 46, 140, 56, 148, PAL.blue); shed(k, f, 22, 128, 30, 138, PAL.yellow);
  for (const [x0, z0, x1, z1] of [[20, 94, 58, 94], [20, 94, 20, 108], [58, 94, 58, 102], [34, 108, 58, 108]]) fence(k, f, x0, z0, x1, z1);
  for (let i = 0; i < 6; i++) hay(k, f, 28 + (i % 3) * 9, 98 + ((i / 3) | 0) * 6);
  keep(18, 82, 60, 150, 0);
  // container yard between Sandkeep and Neon
  const cc = [PAL.red, PAL.blue, PAL.yellow, PAL.green, PAL.orange, PAL.cyan];
  for (let i = 0; i < 12; i++) {
    const x = 176 + (i % 4) * 12, z = 90 + ((i / 4) | 0) * 18, rot = i % 2 ? Math.PI / 2 : 0, col = cc[i % cc.length];
    container(k, f, x, z, 0, rot, col); if (i % 3 === 0) container(k, f, x, z, 2.6, rot, cc[(i + 2) % cc.length]);
  }
  keep(170, 84, 222, 150, 0);
  // watchtowers (5 m platform, stairs)
  for (const [x, z] of [[96, 70], [150, 150], [88, 150], [186, 76], [40, 70]]) { tower(k, f, x, z); keep(x - 4, z - 4, x + 4, z + 9, 1); }
  // ---------- biomes: every arena's own ground colour fades smoothly into the land around it ----------
  const BIO = { belltower: { near: 0xd88a4a, far: 0xc2b04a, tree: 'autumn', rock: 0xc98f6a },   // terracotta -> golden meadow
    sandkeep: { near: 0xe6a24a, far: 0xe8c26a, tree: 'desert', rock: 0xd8a868 },                   // desert sand + dunes
    lantern: { near: 0x7a6440, far: 0x2f8a4a, tree: 'pine', rock: 0x7f8f86 },                      // muddy bank -> deep forest
    neon: { near: 0x3d4258, far: 0x5a4f8a, tree: 'neon', rock: 0x4a5068 } };                       // slate -> violet dusk
  const MEADOW = new THREE.Color(0x58b847), BEACH = new THREE.Color(0xf0c46a), tmp = new THREE.Color(), tmp2 = new THREE.Color();
  const sstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const rdist = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
  const hsh = (x, z) => { const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); };
  const vnoise = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    return (hsh(xi, zi) * (1 - u) + hsh(xi + 1, zi) * u) * (1 - v) + (hsh(xi, zi + 1) * (1 - u) + hsh(xi + 1, zi + 1) * u) * v; };
  const fbm = (x, z) => vnoise(x / 23, z / 23) * 0.6 + vnoise(x / 9 + 7, z / 9 + 3) * 0.3 + vnoise(x / 4 + 1, z / 4 + 9) * 0.1;
  const biomeOf = (x, z) => { let best = null, bd = 1e9; for (const r of regions) { const d = rdist(r, x, z) - hsh(r.x0, r.z0) * 0; if (d < bd) { bd = d; best = r; } } return { r: best, d: bd, b: BIO[best.id] }; };
  const groundCol = (x, z, out) => {
    let wsum = 0; out.setRGB(0, 0, 0);
    for (const r of regions) {
      const B = BIO[r.id], d = rdist(r, x, z) + (fbm(x, z) - 0.5) * 22;     // noisy edge so the fade is not a ring
      const w = 1 - sstep(8, 62, d); if (w <= 0) continue;
      tmp.setHex(B.far).lerp(tmp2.setHex(B.near), 1 - sstep(0, 16, d));
      out.r += tmp.r * w; out.g += tmp.g * w; out.b += tmp.b * w; wsum += w;
    }
    const m = Math.max(0, 1 - wsum); out.r += MEADOW.r * m; out.g += MEADOW.g * m; out.b += MEADOW.b * m; out.multiplyScalar(1 / Math.max(1, wsum + m));
    const n = fbm(x * 1.7, z * 1.7); out.multiplyScalar(0.88 + n * 0.24);             // soft patches
    const edge = Math.min(x, z, S - x, S - z) + (vnoise(x / 11, z / 11) - 0.5) * 6;
    out.lerp(BEACH, sstep(17, 9, edge));                                              // beach
    return out;
  };
  // flat near roads, arenas, the canal and props; gentle rolling ground elsewhere (visual only, colliders stay at y 0)
  const flatD = (x, z) => { let d = 1e9; for (const q of flats) d = Math.min(d, Math.hypot(Math.max(q[0] - x, 0, x - q[2]), Math.max(q[1] - z, 0, z - q[3])));
    for (const r of regions) d = Math.min(d, rdist(r, x, z)); return Math.min(d, Math.hypot(Math.max(a - 2 - x, 0, x - b - 2), Math.max(a - 2 - z, 0, z - b - 2))); };
  {
    const G = 2, N = S / G, pos = [], col = [], idx = [], vid = new Int32Array((N + 1) * (N + 1)).fill(-1), c = new THREE.Color();
    const inside = (x, z) => regions.some(r => x > r.x0 - 0.3 && x < r.x1 + 0.3 && z > r.z0 - 0.3 && z < r.z1 + 0.3) || (x > a - 1.5 && x < b + 1.5 && z > a - 1.5 && z < b + 1.5);
    const vert = (i, j) => { const k2 = j * (N + 1) + i; if (vid[k2] >= 0) return vid[k2]; const x = i * G, z = j * G;
      const edge = Math.min(x, z, S - x, S - z), h = 0.015 + 0.38 * sstep(3, 12, flatD(x, z)) * sstep(8, 18, edge) * fbm(x * 1.3 + 50, z * 1.3);
      pos.push(x, h, z); groundCol(x, z, c); col.push(c.r, c.g, c.b); return (vid[k2] = pos.length / 3 - 1); };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const cx = (i + 0.5) * G, cz = (j + 0.5) * G; if (inside(cx, cz)) continue;
      const v0 = vert(i, j), v1 = vert(i + 1, j), v2 = vert(i, j + 1), v3 = vert(i + 1, j + 1); idx.push(v0, v2, v1, v1, v2, v3);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const gm = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })); gm.receiveShadow = true; k.root.add(gm);
    k.minimap.push({ x0: 10, z0: 10, x1: S - 10, z1: S - 10, y: 0, kind: 'grass' });
  }

  // mountains ringing the island (in the sea, backdrop + frame), one vertex-coloured mesh: green foot, rock, snow cap
  {
    const parts = [], foot = new THREE.Color(0x4a9a48), rockC = new THREE.Color(0x9a8f88), snow = new THREE.Color(0xf4f7fb), c = new THREE.Color();
    for (let i = 0; i < 26; i++) {
      const t = i / 26 * Math.PI * 2 + R() * 0.12, rad = 262 + R() * 50, x = C + Math.cos(t) * rad, z = C + Math.sin(t) * rad;
      const hgt = 55 + R() * 60, wid = 42 + R() * 30, g = new THREE.ConeGeometry(wid, hgt, 7, 4).toNonIndexed(), p = g.attributes.position, cols = [];
      for (let v = 0; v < p.count; v++) { const y = p.getY(v), f2 = (y + hgt / 2) / hgt; if (f2 > 0.02 && f2 < 0.98) { const jx = hsh(p.getX(v) + i, y) - 0.5, jz = hsh(y, p.getZ(v) - i) - 0.5; p.setX(v, p.getX(v) + jx * wid * 0.25); p.setZ(v, p.getZ(v) + jz * wid * 0.25); } }
      g.computeVertexNormals();
      for (let v = 0; v < p.count; v += 3) { const fy = ((p.getY(v) + p.getY(v + 1) + p.getY(v + 2)) / 3 + hgt / 2) / hgt;
        c.copy(fy < 0.28 ? foot : fy < 0.72 ? rockC : snow); if (fy >= 0.28 && fy < 0.72) c.lerp(foot, 0.15 * hsh(v, i)); for (let q = 0; q < 3; q++) cols.push(c.r, c.g, c.b); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.deleteAttribute('uv'); g.translate(x, hgt / 2 - 3, z); parts.push(g);
    }
    const merged = mergeGeos(parts), mm = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })); k.root.add(mm);
  }

  // huge boulders and outcrops: break up the open ground, lean on arena walls (not in front of gates), cover for BR fights
  const boulders = [];
  const boulder = (x, z, s, color) => {
    const g = new THREE.IcosahedronGeometry(s, 1), p = g.attributes.position, cc = new THREE.Color(color), cols = [];
    const jit = (px, py, pz) => 0.8 + hsh(Math.round(px * 7) + x, Math.round(py * 7) * 3 + Math.round(pz * 7) + z) * 0.4;
    for (let v = 0; v < p.count; v++) { const q = jit(p.getX(v), p.getY(v), p.getZ(v)); p.setXYZ(v, p.getX(v) * q, p.getY(v) * q * 0.72, p.getZ(v) * q); }
    for (let v = 0; v < p.count; v += 3) { const sh2 = 0.82 + hsh(v + x, z) * 0.3; for (let q = 0; q < 3; q++) cols.push(cc.r * sh2, cc.g * sh2, cc.b * sh2); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.deleteAttribute('uv'); g.translate(x, s * 0.35, z); g.computeVertexNormals(); boulders.push(g);
    world.addBox(V(x - s * 0.62, 0, z - s * 0.62), V(x + s * 0.62, s * 0.95, z + s * 0.62)); keep(x - s, z - s, x + s, z + s, 1.5); flats.push([x - s, z - s, x + s, z + s]);
  };
  let nb = 0;
  for (let i = 0; i < 900 && nb < 26; i++) {
    const x = 20 + R() * (S - 40), z = 20 + R() * (S - 40), s = 3.5 + R() * 4.5; if (!free(x, z, s + 1.5)) continue;
    const { b: B, d } = biomeOf(x, z); boulder(x, z, s, d < 70 ? B.rock : 0x8d98a8); nb++;
    if (R() < 0.6) { const t = R() * 6.3, s2 = s * (0.4 + R() * 0.3), x2 = x + Math.cos(t) * s * 1.1, z2 = z + Math.sin(t) * s * 1.1; if (free(x2, z2, s2)) boulder(x2, z2, s2, d < 70 ? B.rock : 0x8d98a8); }
  }
  for (const r of regions) {                                                          // outcrops hugging the outside of each arena wall
    const B = BIO[r.id], gates = GATES[r.id].map(g => gateBox(DM_MAPS.find(q => q.id === r.id), g));
    for (let i = 0; i < 40; i++) {
      const side = (R() * 4) | 0, t = R(), x = side < 2 ? r.x0 + t * (r.x1 - r.x0) : side === 2 ? r.x0 - 3 : r.x1 + 3, z = side >= 2 ? r.z0 + t * (r.z1 - r.z0) : side === 0 ? r.z0 - 3 : r.z1 + 3;
      const lx = x - r.x0, lz = z - r.z0; if (gates.some(g => lx > g[0] - 8 && lx < g[3] + 8 && lz > g[2] - 8 && lz < g[5] + 8)) continue;
      const s = 2 + R() * 2.5; if (x < 12 || z < 12 || x > S - 12 || z > S - 12) continue;
      if (flats.some(q => x + s > q[0] && x - s < q[2] && z + s > q[1] && z - s < q[3])) continue;
      boulder(x, z, s, B.rock);
    }
  }
  if (boulders.length) k.root.add(new THREE.Mesh(mergeGeos(boulders), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));

  // scatter: trees (style follows the biome), rocks, crate stacks
  let n = 0;
  for (let i = 0; i < 3000 && n < 260; i++) {
    const x = 14 + R() * (S - 28), z = 14 + R() * (S - 28); if (!free(x, z, 2.2)) continue;
    const r = R(), { b: B, d } = biomeOf(x, z), edge = Math.min(x, z, S - x, S - z); n++;
    const style = edge < 17 ? 'palm' : d < 55 + R() * 20 ? B.tree : 'meadow';
    if (r < 0.72) tree(k, f, x, z, R, style); else if (r < 0.86) rock(k, f, x, z, R); else crates(k, f, x, z, R);
    keep(x - 1.6, z - 1.6, x + 1.6, z + 1.6, 1.0);
  }
  // forest clumps: a few dense groves so the land reads as places, not a sprinkle
  for (const r of regions) { const B = BIO[r.id], cx = (r.x0 + r.x1) / 2 < C ? r.x1 + 14 : r.x0 - 14, cz = (r.z0 + r.z1) / 2 < C ? r.z1 + 14 : r.z0 - 14;
    for (let i = 0; i < 60; i++) { const x = cx + (R() - 0.5) * 26, z = cz + (R() - 0.5) * 26; if (!free(x, z, 1.8)) continue; tree(k, f, x, z, R, B.tree); keep(x - 1.3, z - 1.3, x + 1.3, z + 1.3, 0.6); } }

  k.finish();
  const spawnA = V(C, 0, C + MKT - 3);
  const pois = [{ name: 'MARKET', x: C, z: C }, ...regions.map(r => ({ name: r.title.toUpperCase(), x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 })), { name: 'FARM', x: 40, z: 116 }, { name: 'CONTAINER YARD', x: 190, z: 116 }];
  const CULL = 115, CULL2 = CULL * CULL;
  return {
    kit: k, time: 'noon', bounds: { min: V(0, -5, 0), max: V(S, 18, S) }, br: true,
    spawns: { default: spawnA, stealth: spawnA, assault: spawnA }, spawnYaw: 0,
    guards: pois.map(p => V(p.x, 0, p.z)), points: [], holdRadius: 6, dm: true, noDress: true, regions, pois,
    cull(p) {                                                        // hide arenas whose footprint is farther than CULL from the camera
      for (const r of regions) { const dx = Math.max(r.x0 - p.x, 0, p.x - r.x1), dz = Math.max(r.z0 - p.z, 0, p.z - r.z1), on = dx * dx + dz * dz < CULL2; if (r.objs[0].visible !== on) for (const o of r.objs) o.visible = on; }
    },
  };
}

// ---------- props (flat vivid colours, merged per material) ----------
function mergeGeos(list) {                                          // non-indexed geometries with position/normal/color -> one
  const out = new THREE.BufferGeometry();
  for (const nm of ['position', 'normal', 'color']) { let n = 0; for (const g of list) n += g.attributes[nm].array.length; const arr = new Float32Array(n); let o = 0; for (const g of list) { arr.set(g.attributes[nm].array, o); o += g.attributes[nm].array.length; } out.setAttribute(nm, new THREE.BufferAttribute(arr, 3)); }
  out.computeBoundingSphere(); return out;
}
// tree styles per biome: meadow (round green), palm (beach), autumn (Belltower), desert (Sandkeep: palms + cacti), pine (Lantern), neon (violet/cyan glow-leaf)
const LEAF = { meadow: [0x2f9e3a, 0x5cc23f], autumn: [0xf08a24, 0xe9b93a, 0xd9553a], palm: [0x3fb04a, 0x5cc23f], pine: [0x1f6e3a, 0x2a8a46], neon: [0x8a4fe0, 0x2bc6d9, 0xd94fb0], cactus: [0x3f9e4a] };
function tree(k, f, x, z, R, style = 'meadow') {
  if (style === true) style = 'palm';
  if (style === 'desert') style = R() < 0.55 ? 'cactus' : 'palm';
  const pick = a => a[(R() * a.length) | 0], l = f(pick(LEAF[style] || LEAF.meadow));
  if (style === 'cactus') { const h = 2 + R() * 1.6; k.cyl(x, 0, z, 0.35, h, l, { seg: 7 }); k.cyl(x + 0.55, h * 0.4, z, 0.22, h * 0.35, l, { seg: 6, collide: false }); k.box(x + 0.3, h * 0.4, z, 0.5, 0.3, 0.3, l, { collide: false }); if (R() < 0.6) { k.cyl(x - 0.5, h * 0.55, z, 0.2, h * 0.3, l, { seg: 6, collide: false }); k.box(x - 0.28, h * 0.55, z, 0.45, 0.28, 0.28, l, { collide: false }); } return; }
  if (style === 'pine') { const h = 5 + R() * 3; k.cyl(x, 0, z, 0.25, h * 0.35, f(PAL.trunk), { seg: 6 }); for (let i = 0; i < 3; i++) k.cyl(x, h * (0.22 + i * 0.22), z, 2.2 - i * 0.6, h * 0.42, l, { seg: 7, r2: 0.05, collide: false }); return; }
  const palm = style === 'palm', h = palm ? 4.2 + R() * 1.5 : style === 'neon' ? 2.6 + R() * 1.6 : 2.2 + R() * 1.4;
  k.cyl(x, 0, z, 0.22, h, f(style === 'neon' ? 0x2a2440 : PAL.trunk), { seg: 6 });
  if (palm) { for (let i = 0; i < 5; i++) { const t = i / 5 * Math.PI * 2 + R(); k.box(x + Math.cos(t) * 1.1, h - 0.2, z + Math.sin(t) * 1.1, 2.2, 0.18, 0.7, l, { collide: false, rotY: t }); } k.blob(x, h, z, 0.6, l); return; }
  const sz = style === 'autumn' ? 1.3 : 1;
  k.blob(x, h + 0.9, z, (1.6 + R() * 0.5) * sz, l); k.blob(x + 0.6, h + 0.3, z + 0.4, 1.1 * sz, l); k.blob(x - 0.5, h + 0.5, z - 0.4, 1.0 * sz, l);
}
function rock(k, f, x, z, R) {
  const s = 1.2 + R() * 1.6; k.box(x, 0, z, s * 1.4, s * 0.8, s, f(PAL.rock), { rotY: 0 }); k.box(x + s * 0.4, 0, z + s * 0.3, s * 0.7, s * 1.1, s * 0.7, f(0x8aa0b8));
}
function crates(k, f, x, z, R) {
  const c = [PAL.orange, PAL.green, PAL.yellow];
  k.box(x, 0, z, 1.3, 1.3, 1.3, f(c[(R() * 3) | 0])); k.box(x + 1.4, 0, z + 0.2, 1.3, 1.3, 1.3, f(c[(R() * 3) | 0]));
  if (R() < 0.6) k.box(x + 0.7, 1.3, z + 0.1, 1.2, 1.2, 1.2, f(c[(R() * 3) | 0]));
  k.box(x, 1.3, z, 1.32, 0.12, 1.32, f(PAL.dark), { collide: false });
}
function hay(k, f, x, z) { k.box(x, 0, z, 2.2, 1.2, 1.4, f(0xf3c64e)); k.box(x, 1.2, z, 2.2, 0.06, 0.2, f(PAL.red), { collide: false }); }
function fence(k, f, x0, z0, x1, z1) {
  const hz = z0 === z1, len = hz ? x1 - x0 : z1 - z0;
  k.box((x0 + x1) / 2, 0.55, (z0 + z1) / 2, hz ? len : 0.12, 0.12, hz ? 0.12 : len, f(PAL.white), { collide: false });
  k.box((x0 + x1) / 2, 0.9, (z0 + z1) / 2, hz ? len : 0.12, 0.12, hz ? 0.12 : len, f(PAL.white), { collide: false });
  for (let t = 0; t <= len; t += 2) k.box(hz ? x0 + t : x0, 0, hz ? z0 : z0 + t, 0.16, 1.1, 0.16, f(PAL.white));
}
function shed(k, f, x0, z0, x1, z1, roof) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0, H = 3.4, t = 0.3;
  k.box(cx, 0, z0 + t / 2, w, H, t, f(PAL.white)); k.box(x0 + t / 2, 0, cz, t, H, d, f(PAL.white)); k.box(x1 - t / 2, 0, cz, t, H, d, f(PAL.white));
  k.box(x0 + w * 0.2, 0, z1 - t / 2, w * 0.4, H, t, f(PAL.white)); k.box(x1 - w * 0.2, 0, z1 - t / 2, w * 0.4, H, t, f(PAL.white));   // door gap in the middle of the south wall
  k.box(cx, H, cz, w + 0.8, 0.35, d + 0.8, f(roof), { collide: 'roof' });
  k.box(cx, 0, cz, w - 0.4, 0.03, d - 0.4, f(0xb98a55), { collide: false });
  k.minimap.push({ x0, z0, x1, z1, y: H, kind: 'building' });
}
function container(k, f, x, z, y, rot, col) {
  const L = 6.1, W = 2.44, H = 2.6, w = rot ? W : L, d = rot ? L : W;
  k.box(x, y, z, w, H, d, f(col));
  for (let t = -L / 2 + 0.4; t < L / 2; t += 0.6) k.box(rot ? x : x + t, y + 0.15, rot ? z + t : z, rot ? W + 0.04 : 0.12, H - 0.3, rot ? 0.12 : W + 0.04, f(0x000000 | (col & 0xfefefe) >> 1), { collide: false });
  k.minimap.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, y: y + H, kind: 'building' });
}
function tower(k, f, x, z) {
  const H = 5;
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) k.box(x + dx, 0, z + dz, 0.3, H, 0.3, f(PAL.wood));
  k.platform(x - 2.4, z - 2.4, x + 2.4, z + 2.4, H, f(PAL.wood), 'nwe');
  k.box(x, H + 2.4, z, 5.4, 0.25, 5.4, f(PAL.red), { collide: false });
  for (const [dx, dz] of [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3]]) k.box(x + dx, H, z + dz, 0.16, 2.4, 0.16, f(PAL.wood), { collide: false });
  k.stairs(x - 1, z + 2.4, x + 1, z + 9, 0, H, 'z', -1, f(PAL.yellow));
}
