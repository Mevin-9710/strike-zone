// Procedural Halvane districts: a seeded street grid of open city blocks around a hand-designed story hub.
// Blocks become enterable multi-floor buildings, rooftop climbs, plazas, lots and parks. The hub (tower, vault,
// compound) carries the objective; breach walls, upper floors and intel caches drive progress.
// Everything static is merged per material by the Kit, so a whole district is a handful of draw calls.
import * as THREE from 'three';
import { Kit } from './kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FH = 3.6, WT = 0.3, RUN = 7.2;            // floor height, wall thickness, stair run

export function rng(seed) {
  let a = seed >>> 0;
  const r = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.range = (lo, hi) => lo + r() * (hi - lo);
  r.int = (lo, hi) => Math.floor(r.range(lo, hi + 1));
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  return r;
}

export const THEMES = {
  downtown: { walls: [['brick', { color: 0xb5533c }], ['concrete', { color: 0xb9c3cc }], ['brick', { color: 0xc98f52 }], ['concrete', { color: 0x9aa7b4 }]], inner: 0xd8d2c4, road: 0x4a4d55, walk: 0xc9c2b4, accent: 0x1d9bf0 },
  harbor:   { walls: [['corrugated', { color: 0x5b7f95 }], ['corrugated', { color: 0x8a9a5b }], ['brick', { color: 0x9a7b5a }], ['concrete', { color: 0xa9a59b }]], inner: 0xc4c9cc, road: 0x55585e, walk: 0xa9a59b, accent: 0xf39c12 },
  blackout: { walls: [['brick', { color: 0x7d3b32 }], ['concrete', { color: 0x8995a0 }], ['brick', { color: 0x6b5a4a }], ['concrete', { color: 0x7d8792 }]], inner: 0xb0aaa0, road: 0x3d4048, walk: 0xa9a294, accent: 0xff6b6b },
  industrial: { walls: [['corrugated', { color: 0x9a6b4a }], ['concrete', { color: 0x8d949c }], ['corrugated', { color: 0x6b7d5a }], ['brick', { color: 0x8a5a4a }]], inner: 0xbab4a8, road: 0x50525a, walk: 0x9c9890, accent: 0xffd23b },
  civic:    { walls: [['concrete', { color: 0xd8dde3 }], ['concrete', { color: 0xb9c3cc }], ['brick', { color: 0xa8705a }], ['concrete', { color: 0xc6ccd2 }]], inner: 0xe4e0d8, road: 0x4a4d55, walk: 0xd2ccc0, accent: 0x7f1d1d },
};

// Rectangle minus one hole -> up to 4 rects.
function subtract([x0, z0, x1, z1], [hx0, hz0, hx1, hz1]) {
  const out = [];
  if (hz0 > z0) out.push([x0, z0, x1, hz0]);
  if (hz1 < z1) out.push([x0, hz1, x1, z1]);
  if (hx0 > x0) out.push([x0, Math.max(z0, hz0), hx0, Math.min(z1, hz1)]);
  if (hx1 < x1) out.push([hx1, Math.max(z0, hz0), x1, Math.min(z1, hz1)]);
  return out.filter(([a, b, c, d]) => c - a > 0.05 && d - b > 0.05);
}

export function buildDistrict(world, scene, spec) {
  const R = rng(spec.seed), T = THEMES[spec.theme] || THEMES.downtown;
  const B = spec.size || 56;
  const k = new Kit(world, scene, { tint: spec.time === 'dusk' || spec.time === 'night' ? 0.9 : 1 });
  const road = k.mat('asphalt', { line: true, color: T.road }, 6), walk = k.mat('tiles', { color: T.walk }, 2);
  const inner = k.mat('concrete', { color: T.inner }, 2.5), floorM = k.mat('tiles', { color: 0x9c958a }, 2);
  const stairM = k.mat('concrete', { color: 0x8d949c }, 1), metal = k.mat('metal', { color: 0x2f3a45 }, 1.5);
  const hazard = k.mat('hazard', {}, 1);
  const out = { breaches: [], barrels: [], intel: [], hubSlots: [], upperSlots: [], groundSlots: [], guards: [], roofSlots: [] };

  // ---------- street grid ----------
  const STREET = 8;
  const cuts = (lo, hi) => { const r = []; let p = lo; while (p < hi - 10) { const s = Math.min(R.range(17, 25), hi - p); r.push([p, p + s]); p += s + STREET; } return r; };
  const xs = cuts(-B, B), zs = cuts(-B, B);
  const far = B + 34;
  k.slab(-far, -far, far, far, 0, road);
  const blocks = [];
  for (const [bx0, bx1] of xs) for (const [bz0, bz1] of zs) {
    k.slab(bx0, bz0, bx1, bz1, 0.15, walk, 1);
    blocks.push({ x0: bx0, z0: bz0, x1: bx1, z1: bz1, cx: (bx0 + bx1) / 2, cz: (bz0 + bz1) / 2 });
  }
  // outer city ring: the grid keeps going past the play area so the edge reads as open streets, not a wall
  for (let gx = -far + 4; gx < far; gx += 22) for (let gz = -far + 4; gz < far; gz += 22) {
    if (Math.abs(gx + 8) < B + 6 && Math.abs(gz + 8) < B + 6) continue;
    const h = R.range(9, 34), w = R.pick(T.walls);
    // windows only on the face looking into the play area (the rest is never seen up close)
    const cx = gx + 8, cz = gz + 8, faces = [];
    if (Math.abs(cx) > Math.abs(cz)) faces.push(cx > 0 ? 'w' : 'e'); else faces.push(cz > 0 ? 'n' : 's');
    const nearRing = Math.max(Math.abs(cx), Math.abs(cz)) < B + 26;
    k.building(gx, gz, gx + 16, gz + 16, h, { wall: w, windows: nearRing, faces, lit: spec.time === 'night' || spec.time === 'dusk' ? R() < 0.5 : false });
  }
  for (const [x0, z0, x1, z1] of [[-B, -B, B, -B], [-B, B, B, B], [-B, -B, -B, B], [B, -B, B, B]]) k.invisibleWall(x0, z0, x1, z1);
  // police cordon where streets meet the play boundary
  const cordon = (x, z, rot) => { k.box(x, 0, z, rot ? 0.5 : 2.4, 1, rot ? 2.4 : 0.5, hazard, { collide: false }); };
  for (let i = 0; i < xs.length; i++) { const sx = (xs[i][1] + (xs[i + 1]?.[0] ?? B + STREET)) / 2; if (sx < B) { cordon(sx, -B + 0.4, false); cordon(sx, B - 0.4, false); } }
  for (let i = 0; i < zs.length; i++) { const sz = (zs[i][1] + (zs[i + 1]?.[0] ?? B + STREET)) / 2; if (sz < B) { cordon(-B + 0.4, sz, true); cordon(B - 0.4, sz, true); } }

  // ---------- spawn + hub ----------
  const corner = R.int(0, 3), sxSign = corner & 1 ? 1 : -1, szSign = corner & 2 ? 1 : -1;
  const spawnBlock = blocks.slice().sort((a, b) => (b.cx * sxSign + b.cz * szSign) - (a.cx * sxSign + a.cz * szSign))[0];
  const spawn = V(spawnBlock.cx + sxSign * ((spawnBlock.x1 - spawnBlock.x0) / 2 + STREET / 2), 0, spawnBlock.cz);
  spawn.x = THREE.MathUtils.clamp(spawn.x, -B + 2, B - 2);
  const hubBlock = blocks.slice().sort((a, b) => b.cx * -sxSign + b.cz * -szSign - (a.cx * -sxSign + a.cz * -szSign))[Math.min(1, blocks.length - 1)];
  const opposite = blocks.slice().sort((a, b) => (b.cx * -sxSign + b.cz * -szSign) - (a.cx * -sxSign + a.cz * -szSign))[0];
  const hub = spec.hub === 'compound' ? opposite : hubBlock;
  const wallOf = () => R.pick(T.walls);

  // ---------- interior building ----------
  // opening on face: {face, from, to (along), kind: 'door'|'window'|'breach'}
  function openingsFor(face, along0, along1, floor, opts) {
    const L = along1 - along0, ops = [];
    if (floor === 0) {
      const nd = opts.doors?.[face] ?? 0;
      for (let i = 0; i < nd; i++) {
        const c = along0 + L * (nd === 1 ? R.range(0.35, 0.65) : (i + 0.5) / nd);
        ops.push({ from: c - 1.1, to: c + 1.1, bottom: 0, top: 2.5, kind: opts.breach?.[face] ? 'breach' : 'door' });
      }
    } else {
      const n = Math.max(1, Math.floor(L / 5.5));
      for (let i = 0; i < n; i++) { const c = along0 + L * (i + 0.5) / n; if (R() < 0.75) ops.push({ from: c - 0.9, to: c + 0.9, bottom: 1.0, top: 2.5, kind: 'window' }); }
    }
    return ops;
  }
  function facade(face, x0, z0, x1, z1, y0, h, mat, ops, b) {
    const horiz = face === 'n' || face === 's';
    const line = horiz ? (face === 'n' ? z0 + WT / 2 : z1 - WT / 2) : (face === 'w' ? x0 + WT / 2 : x1 - WT / 2);
    const lo = horiz ? x0 : z0, hi = horiz ? x1 : z1;
    const seg = (a, c, yy, hh) => { if (c - a < 0.02 || hh < 0.02) return; if (horiz) k.box((a + c) / 2, yy, line, c - a, hh, WT, mat); else k.box(line, yy, (a + c) / 2, WT, hh, c - a, mat); };
    let cur = lo;
    for (const o of ops.sort((p, q) => p.from - q.from)) {
      seg(cur, o.from, y0, h); cur = o.to;
      if (o.bottom > 0) seg(o.from, o.to, y0, o.bottom);
      seg(o.from, o.to, y0 + o.top, h - o.top);
      if (o.kind === 'breach') {
        const w = o.to - o.from, cx = horiz ? (o.from + o.to) / 2 : line, cz = horiz ? line : (o.from + o.to) / 2;
        const geo = new THREE.BoxGeometry(horiz ? w : WT * 1.6, o.top, horiz ? WT * 1.6 : w);
        const mesh = new THREE.Mesh(geo, k.batches.get(hazard).mat); mesh.position.set(cx, y0 + o.top / 2, cz); mesh.castShadow = true; mesh.receiveShadow = true;
        k.root.add(mesh);
        const hw = horiz ? w / 2 : WT, hd = horiz ? WT : w / 2;
        const col = world.addGate(V(cx - hw, y0, cz - hd), V(cx + hw, y0 + o.top, cz + hd));
        const n = { n: V(0, 0, -1), s: V(0, 0, 1), e: V(1, 0, 0), w: V(-1, 0, 0) }[face];
        out.breaches.push({ pos: V(cx, y0, cz), normal: n, mesh, col, done: false, b });
      }
    }
    seg(cur, hi, y0, h);
  }
  function interior(x0, z0, x1, z1, floors, opts = {}) {
    const wall = k.mat(...(opts.wall || wallOf()), 3), b = { x0, z0, x1, z1, floors, top: floors * FH };
    const W = x1 - x0, D = z1 - z0;
    const strips = [[x0 + 1.4, z0 + WT + 0.05, x0 + 1.4 + RUN, z0 + WT + 1.95], [x1 - 1.4 - RUN, z1 - WT - 1.95, x1 - 1.4, z1 - WT - 0.05]];
    for (let f = 0; f < floors; f++) {
      const y0 = f * FH;
      for (const face of ['n', 's', 'e', 'w']) {
        const horiz = face === 'n' || face === 's';
        facade(face, x0, z0, x1, z1, y0, FH, wall, openingsFor(face, horiz ? x0 : z0, horiz ? x1 : z1, f, opts), b);
      }
      // stairs up from this floor (alternating strips so each landing sits on solid floor)
      const s = strips[f % 2], up = f < floors;
      if (up) {
        const rise = f % 2 === 0 ? 1 : -1;
        k.stairs(s[0], s[1], s[2], s[3], y0 + (f ? 0 : 0.15), y0 + FH, 'x', rise, stairM);
      }
      // floor slab of the next level, with a hole over this floor's stairs
      const yTop = (f + 1) * FH, rect = [x0 + WT, z0 + WT, x1 - WT, z1 - WT];
      const hole = [s[0] - 0.1, s[1] - 0.05, s[2] + 0.1, s[3] + 0.05];
      const landX = f % 2 === 0 ? [s[2] - 0.01, s[2] + 1.2] : [s[0] - 1.2, s[0] + 0.01];
      for (const [a, bb, c, d] of subtract(rect, hole)) k.box((a + c) / 2, yTop - 0.3, (bb + d) / 2, c - a, 0.3, d - bb, f === floors - 1 ? k.mat('roof', {}, 4) : floorM, { collide: f === floors - 1 ? 'roof' : true });
      // railings around the stair hole on the floor above (open on the arrival end)
      const rx0 = hole[0], rx1 = hole[2], rz = f % 2 === 0 ? hole[3] : hole[1];
      k.railing(rx0, rz, rx1, rz, yTop);
      // floor slots: centre of the floor clear of the strips
      const slot = V((x0 + x1) / 2 + R.range(-W * 0.15, W * 0.15), y0 + (f ? 0 : 0.15), (z0 + z1) / 2);
      (f ? out.upperSlots : out.groundSlots).push(slot); (b.slots ??= []).push(slot);
      out.guards.push(V(x0 + W * R.range(0.25, 0.75), y0 + (f ? 0 : 0.15), (z0 + z1) / 2 + R.range(-1, 1)));
      // cover: a desk row + column
      if (W > 12) { k.box((x0 + x1) / 2 + R.range(-2, 2), y0, (z0 + z1) / 2 + R.range(-1.2, 1.2), R.range(1.6, 2.6), 1.0, 0.8, k.mat('flat', { color: 0x6b4f3a })); }
      if (landX && f > 0) out.intel.push(V((x0 + x1) / 2 + R.range(-W * 0.3, W * 0.3), y0 + 0.05, (z0 + z1) / 2 + R.range(-0.8, 0.8)));
    }
    // roof: parapet, roof hatch stairs come out of the top strip
    const top = floors * FH;
    for (const [a, bb, c, d] of [[x0, z0, x1, z0 + WT], [x0, z1 - WT, x1, z1], [x0, z0, x0 + WT, z1], [x1 - WT, z0, x1, z1]]) k.box((a + c) / 2, top, (bb + d) / 2, c - a, 1.0, d - bb, wall);
    const s = strips[(floors - 1) % 2];
    k.railing(s[0] - 0.1, (s[1] + s[3]) / 2 + ((floors - 1) % 2 === 0 ? -1.05 : 1.05), s[2] + 0.1, (s[1] + s[3]) / 2 + ((floors - 1) % 2 === 0 ? -1.05 : 1.05), top);
    k.acUnit(x0 + W * 0.7, z0 + D * 0.5, top, 1.2);
    out.roofSlots.push(V(x0 + W * 0.3, top, (z0 + z1) / 2)); b.roof = V(x0 + W * 0.3, top, (z0 + z1) / 2);
    out.guards.push(V(x0 + W * 0.5, top, (z0 + z1) / 2 + R.range(-1, 1)));
    k.minimap.push({ x0, z0, x1, z1, y: top, kind: 'roof' });
    return b;
  }

  // ---------- block fillers ----------
  const inset = (bl, m) => [bl.x0 + m, bl.z0 + m, bl.x1 - m, bl.z1 - m];
  function streetProps(bl) {
    if (R() < 0.6) k.streetlight(bl.x0 - 1, bl.cz, { light: false });
    if (R() < 0.5) k.car(bl.cx + R.range(-4, 4), bl.z1 + 2.2, 0, R.pick([0x2f9e44, 0xffc93c, 0x1d6fd8, 0xe63946, 0xcfcfcf]));
    if (R() < 0.4) k.car(bl.x1 + 2.2, bl.cz + R.range(-4, 4), Math.PI / 2, R.pick([0x3a6ea5, 0xb5533c, 0x2f3a45]));
  }
  function explosiveBarrel(x, z, y = 0.15) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 10), new THREE.MeshLambertMaterial({ color: 0xd62828 }));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.18, 10), new THREE.MeshLambertMaterial({ color: 0xffd23b })); band.position.y = 0.1; mesh.add(band);
    mesh.position.set(x, y + 0.55, z); mesh.castShadow = true; k.root.add(mesh);
    const col = world.addBox(V(x - 0.42, y, z - 0.42), V(x + 0.42, y + 1.1, z + 0.42), 'barrel');
    const b = { pos: V(x, y + 0.6, z), mesh, col, alive: true }; col.prop = b; out.barrels.push(b);
  }
  const fillers = {
    interior(bl) {
      const [a, b, c, d] = inset(bl, R.range(1.5, 2.5));
      const floors = R.int(2, 3), doors = { n: R() < 0.7 ? 1 : 0, s: 1, e: R() < 0.5 ? 1 : 0, w: R() < 0.5 ? 1 : 0 };
      const breach = { e: R() < 0.35, w: R() < 0.35 };
      interior(a, b, c, d, floors, { doors, breach });
      streetProps(bl);
    },
    roofs(bl) {
      const [a, b, c, d] = inset(bl, 2), h = R.pick([4.5, 5.4]);
      k.building(a, b, c, d - 3.2, h, { wall: wallOf(), walkableRoof: { gaps: [{ side: 's', from: c - 3.4, to: c - 0.6 }] }, parapet: 1.0 });
      k.stairs(a + 1, d - 3.0, a + 1 + h * 2, d - 0.6, 0.15, h + 0.3, 'x', 1, metal, { solidBelow: false });
      k.platform(a + 1 + h * 2, d - 3.0, c - 0.6, d - 0.6, h + 0.3, metal, 's');
      k.railing(a + 1, d - 0.6, a + 1 + h * 2, d - 0.6, 0.15, 1.05, h + 0.3);
      k.acUnit(a + (c - a) * 0.3, b + 3, h + 0.3); k.crate(c - 4, b + 3, h + 0.3); k.crate(c - 2.9, b + 3, h + 0.3);
      out.roofSlots.push(V((a + c) / 2, h + 0.3, (b + d - 3.2) / 2)); out.guards.push(V((a + c) / 2 + 2, h + 0.3, (b + d - 3.2) / 2));
      out.intel.push(V(a + (c - a) * 0.8, h + 0.35, b + 2.5));
      k.minimap.push({ x0: a, z0: b, x1: c, z1: d - 3.2, y: h, kind: 'roof' });
      streetProps(bl);
    },
    plaza(bl) {
      const cx = bl.cx, cz = bl.cz, r = Math.min(bl.x1 - bl.x0, bl.z1 - bl.z0);
      k.cyl(cx, 0.15, cz, r * 0.14, 0.7, k.mat('concrete', { color: 0xb9b4aa }, 2), { seg: 12 });
      k.cyl(cx, 0.85, cz, 0.6, 1.6, k.mat('concrete', { color: 0xb9b4aa }, 1), { seg: 10 });
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + R.range(-0.3, 0.3), d = r * 0.32; k.box(cx + Math.cos(a) * d, 0.15, cz + Math.sin(a) * d, i % 2 ? 0.6 : 4, 1.1, i % 2 ? 4 : 0.6, k.mat('concrete', { color: 0x8d949c }, 1)); }
      k.tree(bl.x0 + 2.5, bl.z0 + 2.5, 0.15); k.tree(bl.x1 - 2.5, bl.z1 - 2.5, 0.15); k.bench(cx, bl.z0 + 2.5); k.bench(cx, bl.z1 - 2.5);
      explosiveBarrel(bl.x0 + 3, bl.z1 - 3);
      out.groundSlots.push(V(cx + r * 0.25, 0.15, cz)); out.guards.push(V(cx - r * 0.25, 0.15, cz + 2));
      k.billboard(bl.x0 + 1, bl.cz, 0.15, 6, 2.5, R.pick(['HALVANE', 'METRO', 'CIVIC SHIELD', 'OPEN 24H']), { bg: T.accent, face: 'e' });
      streetProps(bl);
    },
    lot(bl) {
      const cols = [0xc0392b, 0x2e86c1, 0xf39c12, 0x27ae60, 0x8e44ad];
      const n = R.int(3, 5);
      for (let i = 0; i < n; i++) {
        const x = bl.x0 + 4 + (bl.x1 - bl.x0 - 8) * R(), z = bl.z0 + 4 + (bl.z1 - bl.z0 - 8) * (i / n);
        const lv = R() < 0.35 ? 2 : 1;
        for (let l = 0; l < lv; l++) k.container(x, z, 0.15 + l * 2.6, 0, R.pick(cols));
        if (lv === 2) out.guards.push(V(x, 0.15 + 5.2, z)); else out.guards.push(V(x + 2, 0.15, z + 2.5));
      }
      for (let i = 0; i < 3; i++) k.crate(bl.x0 + 3 + i * 1.1, bl.z1 - 3, 0.15);
      explosiveBarrel(bl.cx + 2, bl.z1 - 2.5); explosiveBarrel(bl.cx + 3, bl.z1 - 2.0);
      out.groundSlots.push(V(bl.cx, 0.15, bl.cz + 1.5));
      out.intel.push(V(bl.x0 + 2.5, 0.2, bl.z0 + 2.5));
    },
    park(bl) {
      for (let i = 0; i < 6; i++) k.tree(bl.x0 + 3 + (bl.x1 - bl.x0 - 6) * R(), bl.z0 + 3 + (bl.z1 - bl.z0 - 6) * R(), 0.15);
      k.box(bl.cx, 0.15, bl.cz, 6, 0.9, 0.5, k.mat('concrete', { color: 0x8d949c }, 1));
      k.bench(bl.cx - 4, bl.cz + 3); k.bench(bl.cx + 4, bl.cz - 3, Math.PI);
      out.guards.push(V(bl.cx, 0.15, bl.cz + 3)); out.groundSlots.push(V(bl.cx + 3, 0.15, bl.cz + 3));
      streetProps(bl);
    },
  };

  // ---------- hubs (hand-designed story set pieces) ----------
  function buildHub(bl) {
    const [a, b, c, d] = inset(bl, 1.5);
    if (spec.hub === 'tower') {
      const t = interior(a, b, c, d, spec.hubFloors || 4, { doors: { s: 1, n: 1, e: 0, w: 1 }, breach: { w: true }, wall: ['concrete', { color: 0x9aa7b4 }] });
      out.hubSlots.push(...t.slots.slice(-2), t.roof);
      k.billboard(a + 1, d + 0.2, t.top - 3, 10, 2.6, spec.hubSign || 'COVENANT', { bg: 0x7f1d1d, fg: '#ffffff' });
    } else if (spec.hub === 'vault') {
      const t = interior(a, b, c, d, 2, { doors: { s: 1, n: 1, e: 1, w: 1 }, breach: { s: true, n: true, e: true, w: true }, wall: ['concrete', { color: 0x6f7d86 }] });
      out.hubSlots.push(t.slots[0], t.slots[1]);
      for (let i = 0; i < 4; i++) k.serverRack(a + 3 + i * 2, b + (d - b) * 0.5 + 2.2, 0.15, 0);
      k.billboard(a + 1, d + 0.2, FH * 2 - 2.6, 10, 2.4, spec.hubSign || 'VAULT', { bg: 0x222222, fg: '#ffd23b' });
    } else {
      // compound: walled yard with breach gaps and one open gate, a guardhouse inside
      const wall = k.mat('concrete', { color: 0x8d949c }, 2.5), H = 3.2;
      const gaps = { s: [(a + c) / 2 - 1.5, (a + c) / 2 + 1.5] };
      for (const face of ['n', 's', 'e', 'w']) {
        const horiz = face === 'n' || face === 's', lo = horiz ? a : b, hi = horiz ? c : d, mid = (lo + hi) / 2;
        const ops = face === 's' ? [{ from: gaps.s[0], to: gaps.s[1], bottom: 0, top: H, kind: 'door' }] : [{ from: mid - 1.2, to: mid + 1.2, bottom: 0, top: 2.6, kind: 'breach' }];
        facade(face, a, b, c, d, 0.15, H, wall, ops, null);
      }
      const g = interior(a + 4, b + 3, a + 4 + Math.max(12, (c - a) * 0.5), b + 3 + 9, 2, { doors: { s: 1 }, breach: {}, wall: ['brick', { color: 0x8a4b3c }] });
      out.hubSlots.push(g.slots[1], V(c - 4, 0.15, d - 4), V(c - 4, 0.15, b + 4));
      for (let i = 0; i < 3; i++) k.container(c - 6, b + (d - b) * 0.55 + i * 0.01, 0.15 + i * 0, 0, 0x7f1d1d);
      explosiveBarrel(a + 2, d - 2); explosiveBarrel(a + 3, d - 2.2);
    }
    out.hubGuards = [V(bl.cx, 0.15, bl.z1 + 3), V(bl.x0 - 3, 0, bl.cz), V(bl.cx + 3, 0.15, bl.cz)];
  }

  const kinds = ['interior', 'interior', 'roofs', 'plaza', 'lot', 'park', 'interior', 'roofs'];
  for (const bl of blocks) {
    if (bl === hub) { buildHub(bl); continue; }
    if (bl === spawnBlock) { fillers.plaza(bl); continue; }
    fillers[R.pick(kinds)](bl);
  }

  // street clutter at intersections
  for (const [, x1] of xs) for (const [, z1] of zs) {
    if (x1 + STREET / 2 > B - 1 || z1 + STREET / 2 > B - 1) continue;
    if (R() < 0.35) k.box(x1 + STREET / 2, 0, z1 + STREET / 2, 2.2, 0.9, 0.5, hazard);
    if (R() < 0.25) explosiveBarrel(x1 + STREET / 2 + 1.5, z1 + STREET / 2 + 1.5, 0);
  }
  k.civicTower(R.range(-60, 60), -B - 110);

  // ---------- objective + intel selection ----------
  const pts = [];
  const pool = [...out.hubSlots, ...R.shuffle(out.upperSlots.slice()), ...R.shuffle(out.roofSlots.slice())];
  for (const p of pool) { if (pts.length >= (spec.count || 1)) break; if (pts.every(q => q.distanceTo(p) > 6)) pts.push(p.clone()); }
  const intel = R.shuffle(out.intel.slice()).filter(p => p.distanceTo(spawn) > 15).slice(0, spec.intel ?? 3);
  const guards = [...out.hubGuards, ...R.shuffle(out.guards.slice())].filter(p => p.distanceTo(spawn) > 22);

  k.finish();
  return {
    kit: k, time: spec.time, bounds: { min: V(-B, -2, -B), max: V(B, 4 * FH + 6, B) },
    spawns: { default: spawn }, spawnYaw: Math.atan2(spawn.x, spawn.z),
    guards, points: pts, pointPool: pool.map(p => p.clone()), intelPool: R.shuffle(out.intel.slice()), wantPoints: spec.count || 1, wantIntel: spec.intel ?? 3, holdRadius: 6, breaches: out.breaches, barrels: out.barrels, intel, extract: spawn.clone(),
    size: B, procedural: true,
  };
}
