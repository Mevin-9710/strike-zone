// Blastline arenas built in code from Kit primitives (no download): flat bright colours, cool sky vs warm geometry, light floors.
// Each arena is symmetric under a 180 degree turn around its centre, so both teams get the same lanes.
// def: { id, title, time, w, d, a, b, build(k, def) }; build() lays out geometry with colliders and returns optional { hill }.
import * as THREE from 'three';
import { Kit } from './kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const COL = { floor: 0xe9edf1, line: 0xffd23b, warm: 0xf29a4a, brick: 0xd9774a, sand: 0xf2c98a, blue: 0x2a5cf0, red: 0xdc2a34, teal: 0x2fb5a8, green: 0x3fbf5f, ink: 0x2b3240, white: 0xf7f7f2 };

// mirror helper: place something at (x, z) and at its 180 degree twin
const twin = (def, fn) => (x, z, ...rest) => { fn(x, z, ...rest); fn(def.w - x, def.d - z, ...rest); };

function sunbreak(k, def) {                                          // container yard with a raised centre deck
  const f = c => k.mat('flat', { color: c }), { w, d } = def;
  k.slab(-6, -6, w + 6, d + 6, 0, k.mat('concrete', { color: COL.floor }, 4));
  for (const z of [d / 2 - 0.08]) k.box(w / 2, 0.005, z, w - 8, 0.01, 0.16, f(COL.line), { collide: false });   // painted centre line
  // perimeter: stacked containers along the long edges, low wall at the spawns
  const C = [COL.red, COL.blue, COL.warm, COL.teal, COL.green, COL.warm];
  for (let i = 0; i < 6; i++) { k.container(5 + i * 8.4, -1.4, 0, 0, C[i]); k.container(w - 5 - i * 8.4, d + 1.4, 0, 0, C[5 - i]); }
  // centre deck (the hill) with ramps east and west
  const top = 1.6, dk = f(COL.sand);
  k.box(w / 2, 0, d / 2, 10, top, 9, dk, { collide: 'platform' });
  k.ramp(w / 2 - 9, d / 2 - 2, w / 2 - 5, d / 2 + 2, 0, top, 'x', 1, f(COL.warm));
  k.ramp(w / 2 + 5, d / 2 - 2, w / 2 + 9, d / 2 + 2, 0, top, 'x', -1, f(COL.warm));
  k.crate(w / 2 - 2.5, d / 2 - 2.6, top, 1.2); k.crate(w / 2 + 2.5, d / 2 + 2.6, top, 1.2);
  // mid containers (lanes north and south of the deck)
  const T = twin(def, (x, z, rot, c) => k.container(x, z, 0, rot, c));
  T(15, 9, 0, COL.blue); T(37, 9, 0, COL.red); T(w / 2, 4.5, 0, COL.teal);
  // spawn cover: low walls and crates
  const L = twin(def, (x, z, len) => k.box(x, 0, z, 0.6, 1.1, len, f(COL.ink)));
  L(9, d / 2 - 5, 3.4); L(9, d / 2 + 5, 3.4);
  const K = twin(def, (x, z, s) => k.crate(x, z, 0, s));
  K(14, d / 2, 1.3); K(19, 15.5, 1.1); K(19, d - 15.5, 1.1); K(8, 5, 1.2); K(8, d - 5, 1.2);
  const B = twin(def, (x, z) => k.barrel(x, z, 0, COL.blue));
  B(23, 6.2); B(29, d - 6.2);
}

function skyline(k, def) {                                           // two-level courts: a catwalk ring over a sunken middle
  const f = c => k.mat('flat', { color: c }), { w, d } = def;
  k.slab(-6, -6, w + 6, d + 6, 0, k.mat('concrete', { color: COL.floor }, 4));
  // warm brick blocks frame the courts
  const blk = twin(def, (x, z, bw, bd, h, c) => k.box(x, 0, z, bw, h, bd, k.mat('brick', { color: c }, 2)));
  blk(8, 13, 6, 4, 4.2, COL.brick); blk(w / 2, 12, 6, 4, 3.0, COL.sand);
  // north and south catwalks at 2.8 m with stairs at both ends
  const y = 2.8, cw = f(COL.ink);
  for (const z0 of [d - 7, 4]) {
    const z1 = z0 + 3;
    k.platform(18, z0, w - 18, z1, y, cw, z0 > d / 2 ? 'n' : 's');
    k.stairs(12, z0, 18, z1, 0, y, 'x', 1, f(COL.warm));
    k.stairs(w - 18, z0, w - 12, z1, 0, y, 'x', -1, f(COL.warm));
    for (let x = 20; x <= w - 20; x += 6) k.box(x, 0, (z0 + z1) / 2, 0.5, y - 0.15, 0.5, f(COL.white));   // posts
  }
  // centre: a low fountain ring (the hill) with four gaps
  const r = f(COL.teal);
  for (const [x, z, bw, bd] of [[w / 2 - 3.2, d / 2, 0.6, 3.6], [w / 2 + 3.2, d / 2, 0.6, 3.6], [w / 2, d / 2 - 3.2, 3.6, 0.6], [w / 2, d / 2 + 3.2, 3.6, 0.6]]) k.box(x, 0, z, bw, 0.9, bd, r);
  k.box(w / 2, 0, d / 2, 1.6, 1.4, 1.6, f(COL.white));
  // cover on the floor
  const K = twin(def, (x, z, s) => k.crate(x, z, 0, s));
  K(15, d / 2 - 3, 1.2); K(15, d / 2 + 3, 1.2); K(w / 2 - 9, d / 2 + 6, 1.3); K(22, 12, 1.1);
  const C = twin(def, (x, z, rot, c) => k.container(x, z, 0, rot, c));
  C(w / 2 - 12, d / 2, Math.PI / 2, COL.green);
  const W = twin(def, (x, z, len) => k.box(x, 0, z, 0.6, 1.1, len, f(COL.ink)));
  W(6, d / 2 - 4.5, 3); W(6, d / 2 + 4.5, 3);
}

export const ARENAS = [
  { id: 'sunbreak', title: 'Sunbreak Yard', time: 'clear', w: 52, d: 44, a: [3.5, 0, 22], b: [48.5, 0, 22], code: true, build: sunbreak },
  { id: 'skyline', title: 'Skyline Courts', time: 'noon', w: 56, d: 40, a: [3.5, 0, 20], b: [52.5, 0, 20], code: true, build: skyline },
];

export function buildArena(def, world, scene) {
  const k = new Kit(world, scene), { w, d } = def;
  def.build(k, def);
  for (const [x0, z0, x1, z1] of [[0, 0, w, 0], [0, d, w, d], [0, 0, 0, d], [w, 0, w, d]]) k.invisibleWall(x0, z0, x1, z1);
  const A = V(...def.a), B = V(...def.b), C = V(w / 2, 0, d / 2 + 6);
  return {
    kit: k.finish() && k, time: def.time, bounds: { min: V(-1, -5, -1), max: V(w + 1, 15, d + 1) },
    spawns: { default: A, stealth: A, assault: A }, spawnYaw: Math.atan2(-(B.x - A.x), -(B.z - A.z)),
    guards: [B, C, V(w / 2, 0, 6)], points: [], holdRadius: 6,
    dm: true, noDress: true, teamSpawns: { A, B },
  };
}
