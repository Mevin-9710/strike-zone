// The three Season 1 maps (~90 x 90 m), built from the shared city kit.
// North = -Z. Each builder returns gameplay data: spawns, guard posts, objective points, lighting.
import * as THREE from 'three';
import { Kit } from './kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const B = 45;   // half size

function perimeter(k, h, styles) {
  // ring of buildings so the map edge reads as city, plus invisible bounds
  const [a, b, c] = styles;
  k.building(-B - 8, -B - 8, B + 8, -B, h + 4, { wall: a, faces: ['s'] });
  k.building(-B - 8, B, B + 8, B + 8, h, { wall: b, faces: ['n'] });
  k.building(-B - 8, -B, -B, B, h + 2, { wall: c, faces: ['e'] });
  k.building(B, -B, B + 8, B, h, { wall: a, faces: ['w'] });
  for (const [x0, z0, x1, z1] of [[-B, -B, B, -B], [-B, B, B, B], [-B, -B, -B, B], [B, -B, B, B]]) k.invisibleWall(x0, z0, x1, z1);
}

// ============================================================ M1 FIRST SIGNAL (noon)
export function buildM1(world, scene) {
  const k = new Kit(world, scene);
  const asphalt = k.mat('asphalt', { line: true }, 6), side = k.mat('tiles', { color: 0xc9c2b4 }, 2);
  k.slab(-B, 8, B, B, 0, asphalt);
  k.slab(-B, -B, B, 8, 0, side);
  perimeter(k, 12, [['brick', { color: 0xb5533c }], ['brick', { color: 0xc98f52 }], ['concrete', { color: 0xb9c3cc }]]);

  // transit station block, roof at y = 8 (walkable)
  const roofH = 8;
  k.building(-20, -40, 20, -10, roofH, { wall: ['brick', { color: 0x9a4a3a }], roof: ['roof', {}],
    walkableRoof: { gaps: [{ side: 's', from: 14, to: 15.9 }, { side: 'w', from: -16.2, to: -12.8 }] }, parapet: 1.0,
    door: { face: 's', t: 0.25 } });
  k.minimap.push({ x0: -20, z0: -40, x1: 20, z1: -10, y: roofH, kind: 'roof' });

  // --- assault route: enclosed stairwell tower on the south face (door west, exits onto roof at the east end)
  const tw = k.mat('concrete', { color: 0xa8b0b8 }, 2.5);
  k.wall(0, -6.15, 16, -6.15, 0, 10.6, tw, 0.3);                           // south wall
  k.wall(15.85, -10, 15.85, -6, 0, 10.6, tw, 0.3);                         // east wall
  k.wall(0.15, -10, 0.15, -9.3, 0, 10.6, tw, 0.3); k.wall(0.15, -6.7, 0.15, -6, 0, 10.6, tw, 0.3);   // west wall with a 2.6 m door
  k.box(0.15, 2.6, -8, 0.3, 8, 2.6, tw);                                  // lintel above the door
  k.wall(0, -9.85, 14, -9.85, roofH, 2.6, tw, 0.3);                         // above-roof north wall (opening at x 14..16)
  k.box(8, 10.3, -8, 16, 0.3, 4, tw);                                       // ceiling
  k.stairs(1.2, -9.7, 13.8, -6.3, 0, roofH, 'x', 1, k.mat('concrete', { color: 0x8d949c }, 1));
  k.box(14.9, 0, -8, 1.9, roofH, 3.4, k.mat('concrete', { color: 0x8d949c }, 1));   // top landing
  k.minimap.push({ x0: 0, z0: -10, x1: 16, z1: -6, y: roofH, kind: 'stairs' });

  // --- stealth route: exterior fire escape on the west face (two flights + landings, railings)
  const fe = k.mat('metal', { color: 0x2f3a45 }, 1.5);
  k.stairs(-22.4, -24, -20.2, -16, 0, 4, 'z', -1, fe, { solidBelow: false });
  k.platform(-24.8, -27, -20.2, -24, 4, fe, 'nw');
  k.stairs(-24.8, -24, -22.6, -16, 4, roofH, 'z', 1, fe, { solidBelow: false });
  k.platform(-24.8, -16, -20.2, -12.8, roofH, fe, 'sw');
  k.railing(-24.8, -24, -24.8, -16, 4, 1.05, roofH);
  k.railing(-22.5, -24, -22.5, -16, 0, 1.05, roofH);
  k.minimap.push({ x0: -24.8, z0: -27, x1: -20.2, z1: -12.8, y: 4, kind: 'stairs' });

  // --- rooftop transit hub
  const ry = roofH + 0.3;
  for (const [x, z] of [[-12, -30], [-4, -30], [4, -30], [12, -30], [-12, -20], [12, -20]]) k.box(x, ry, z, 0.6, 4, 0.6, k.mat('metal', { color: 0xdfe6ee }, 1));
  k.box(0, ry + 4, -25, 28, 0.3, 14, k.mat('window', { glass: 0x9fd3ff }, 2), { collide: false, uvTile: 2 });   // glass canopy
  k.acUnit(-15, -36, ry); k.acUnit(-11, -36, ry, 1.6); k.acUnit(6, -15, ry); k.acUnit(17, -24, ry, 1.6);
  k.crate(-2, -14, ry); k.crate(-0.9, -14, ry); k.crate(-1.5, -14, ry + 1);
  k.billboard(-6, -38.5, ry, 10, 3.5, 'METRO LINE 3', { bg: 0x1d9bf0 });
  k.box(10, ry, -34, 4, 1.2, 0.5, k.mat('concrete', { color: 0x8d949c }, 1));           // low cover near the device
  k.box(18, ry, -30, 0.5, 1.2, 4, k.mat('concrete', { color: 0x8d949c }, 1));
  k.cyl(-16, ry, -14.5, 1.4, 3.2, k.mat('metal', { color: 0xb0b8c2 }, 2), { seg: 12 });    // water tank

  // --- street level dressing
  k.car(-30, 18, 0, 0x2f9e44); k.car(-8, 22, 0, 0xffc93c); k.car(14, 18, 0, 0x1d6fd8); k.car(32, 25, Math.PI / 2, 0xe63946);
  for (let x = -36; x <= 36; x += 18) { k.streetlight(x, 9.5); k.streetlight(x + 9, 35.5); }
  k.crate(26, 2); k.crate(27.1, 2); k.crate(26.5, 2, 1); k.crate(28, 3.4, 0, 1.2);
  k.barrel(-34, 2, 0, 0xe63946); k.barrel(-33.2, 2.8); k.barrel(34, 6, 0, 0x2f9e44);
  k.tree(-36, -4); k.tree(34, -4); k.tree(-30, 40); k.tree(30, 40);
  k.bench(-6, 4); k.bench(6, 4);
  k.box(-14, 0, 32, 6, 2.6, 0.2, k.mat('window', { glass: 0xaad7ff }, 2), { uvTile: 2.6 });   // bus shelter
  k.box(-14, 2.6, 32.8, 6.4, 0.2, 2, k.mat('metal', { color: 0x30363d }, 2), { collide: 'roof' });
  k.box(-16.9, 0, 32.8, 0.2, 2.6, 1.8, k.mat('metal', { color: 0x30363d }, 2)); k.box(-11.1, 0, 32.8, 0.2, 2.6, 1.8, k.mat('metal', { color: 0x30363d }, 2));
  k.billboard(30, -8, 0, 8, 3, 'HALVANE', { bg: 0xffd23b, fg: '#111111' });
  k.decal(3, 2.5, -5.95, 's', 3, 1.6, 'EXIT >', '#ffd23b');
  k.decal(-12, 3.5, -9.9, 's', 5, 2.5, 'SIGNAL', '#5fe6ff');
  k.decal(-30, 3, 39.9, 'n', 5, 2.5, 'HLV', '#ff6b6b');
  k.civicTower(0, -150);

  return {
    kit: k.finish() && k, time: 'noon', bounds: { min: V(-B, -5, -B), max: V(B, 15, B) },
    spawns: { stealth: V(-30, 0, 2), assault: V(4, 0, 4), default: V(4, 0, 4) }, spawnYaw: Math.PI,
    guards: [V(-10, ry, -22), V(6, ry, -36), V(0, ry, -18), V(15, ry, -16), V(-14, ry, -32), V(-6, 0, 18), V(20, 0, 28), V(-24, 0, 30)],
    points: [V(14, ry, -36)], holdRadius: 6,
  };
}

// ============================================================ M2 LOW TIDE (morning harbor + flooded vault)
export function buildM2(world, scene) {
  const k = new Kit(world, scene);
  const dock = k.mat('concrete', { color: 0xa9a59b, grime: 0.55 }, 4);
  // dock slab with a hole for the vault pit (x -12..12, z -36..-18)
  k.slab(-B, -18, B, 25, 0, dock);
  k.slab(-B, -B, -12, -18, 0, dock); k.slab(12, -B, B, -18, 0, dock); k.slab(-12, -B, 12, -36, 0, dock);
  k.slab(-12, -36, 12, -18, -3, k.mat('tiles', { color: 0x6f7d86 }, 2), 4);
  k.waterPlane(-12, -36, 12, -18, -2.7, 0x3d7f9a);
  k.waterPlane(-80, 25, 80, 120, -1.6, 0x2f6f8f);
  k.invisibleWall(-B, 25, B, 25);
  perimeter(k, 10, [['corrugated', { color: 0x5b7f95 }], ['brick', { color: 0x9a7b5a }], ['corrugated', { color: 0x8a9a5b }]]);

  // vault warehouse: hollow walls with a south entrance, roof slab
  const vw = k.mat('concrete', { color: 0x9aa3ad }, 3);
  k.wall(-16, -40, 16, -40, 0, 8, vw, 0.6);
  k.wall(-16, -40, -16, -14, 0, 8, vw, 0.6); k.wall(16, -40, 16, -14, 0, 8, vw, 0.6);
  k.wall(-16, -14, -3, -14, 0, 8, vw, 0.6); k.wall(3, -14, 16, -14, 0, 8, vw, 0.6);
  k.box(0, 4.2, -14, 6, 3.8, 0.6, vw);
  k.box(0, 8, -27, 32.6, 0.4, 26.6, k.mat('metal', { color: 0x6b7480 }, 3));
  k.minimap.push({ x0: -16, z0: -40, x1: 16, z1: -14, y: 8, kind: 'vault' });
  k.box(0, 4, -13.6, 6.4, 0.25, 0.5, k.mat('hazard', {}, 1), { collide: false });
  // pit: ramps down, catwalk across, railings around the ledge
  const st = k.mat('metal', { color: 0x46505c }, 1.2);
  k.stairs(-2, -23, 2, -18, -3, 0, 'z', 1, st);
  k.stairs(-2, -36, 2, -31, -3, 0, 'z', -1, st);
  k.platform(-12, -34.5, 12, -32.8, 0, st, 'ns');
  for (const [x0, z0, x1, z1] of [[-12, -18, -2, -18], [2, -18, 12, -18], [-12, -36, -2, -36], [2, -36, 12, -36], [-12, -36, -12, -34.5], [-12, -32.8, -12, -18], [12, -36, 12, -34.5], [12, -32.8, 12, -18]])
    k.railing(x0, z0, x1, z1, 0);
  // servers in the flooded pit; the Covenant server is the plant target
  for (const x of [-9, -6, 6, 9]) for (const z of [-30, -25]) k.serverRack(x, z, -3, 0);
  k.serverRack(0, -27.5, -3, 0, 2.2, 2.6, 1.6, 0xff3b3b);
  k.box(0, -3, -25.5, 3, 0.15, 1.6, k.mat('hazard', {}, 1), { collide: false });

  // docks: container stacks with stairs, cranes, bollards
  const cols = [0xc0392b, 0x2e86c1, 0xf39c12, 0x27ae60, 0x8e44ad];
  let ci = 0;
  for (const [x, z, lv] of [[-30, -4, 1], [-30, 2, 2], [-22, 10, 1], [20, -4, 1], [28, 4, 2], [20, 12, 1], [-6, 6, 1], [6, 2, 1]]) {
    for (let l = 0; l < lv; l++) k.container(x, z, l * 2.6, 0, cols[ci++ % cols.length]);
  }
  k.stairs(-36.5, -5.2, -33.2, -2.8, 0, 2.6, 'x', 1, st);          // up onto the west stack
  k.stairs(23.2, -5.2, 26.5, -2.8, 0, 2.6, 'x', -1, st);           // up onto the east stack
  k.stairs(9.2, 0.8, 12.5, 3.2, 0, 2.6, 'x', -1, st);
  k.crane(-36, 20); k.crane(34, 20);
  for (let x = -40; x <= 40; x += 8) k.cyl(x, 0, 24, 0.3, 0.7, k.mat('metal', { color: 0x30363d }, 1));
  k.crate(-14, 4); k.crate(-13, 4); k.crate(-13.5, 4, 1); k.crate(14, 18); k.crate(15.2, 18, 0, 1.2);
  k.barrel(-20, -10, 0, 0xe63946); k.barrel(-19.2, -9.4); k.barrel(24, -10, 0, 0xf39c12);
  k.box(-38, 0, -20, 4, 2.2, 2.5, k.mat('metal', { color: 0xf2b134 }, 1.5));      // forklift block
  k.streetlight(-24, 18); k.streetlight(0, 18); k.streetlight(24, 18);
  k.billboard(0, -41, 8.4, 12, 3, 'COVENANT DATA', { bg: 0x7f1d1d, fg: '#ffffff' });
  k.decal(0, 6, -13.65, 's', 5, 2.2, 'VAULT', '#ffd23b');
  k.decal(-44.9, 3, 10, 'e', 5, 2.5, 'DOCK 7', '#ffffff');
  k.decal(-30, 1.4, -2.75, 's', 3, 1.5, 'HLV', '#5fe6ff');
  k.civicTower(-60, -160);

  return {
    kit: k.finish() && k, time: 'morning', bounds: { min: V(-B, -5, -B), max: V(B, 12, 25) },
    spawns: { default: V(-38, 0, 18) }, spawnYaw: Math.PI * 0.75,
    guards: [V(-6, -3, -21), V(6, -3, -34), V(-10, 0, -16), V(10, 0, -38), V(20, 2.6, -4), V(-30, 2.6, -4), V(6, 2.6, 2), V(0, 0, 10)],
    points: [V(0, -3, -24.6)], holdRadius: 6,
  };
}

// ============================================================ M3 DEAD AIR (dusk blackout city block)
export function buildM3(world, scene) {
  const k = new Kit(world, scene, { tint: 0.92 });
  const road = k.mat('asphalt', { line: true, color: 0x3d4048 }, 6), walk = k.mat('tiles', { color: 0xa9a294 }, 2);
  k.slab(-B, -6, B, 6, 0, road); k.slab(-6, -B, 6, -6, 0, road); k.slab(-6, 6, 6, B, 0, road);
  k.slab(-B, -B, -6, -6, 0, walk); k.slab(6, -B, B, -6, 0, walk); k.slab(-B, 6, -6, B, 0, walk); k.slab(6, 6, B, B, 0, walk);
  perimeter(k, 16, [['brick', { color: 0x7d3b32 }], ['concrete', { color: 0x8995a0 }], ['brick', { color: 0x6b5a4a }]]);

  // NW block: two buildings with an alley between (device 1 in the alley)
  k.building(-42, -42, -31, -12, 14, { wall: ['brick', { color: 0x8a4b3c }], lit: true });
  k.building(-25, -42, -10, -12, 12, { wall: ['concrete', { color: 0x8995a0 }], lit: true });
  k.dumpster(-28, -38); k.barrel(-29.5, -20); k.barrel(-26.5, -24, 0, 0xf39c12); k.crate(-29, -33); k.crate(-29, -33, 1);
  k.billboard(-27.9, -14, 3, 5, 2, 'ALLEY 9', { bg: 0x1d9bf0, face: 'e' });

  // NE block: building with walkable roof (device 2 on the roof), fire escape on the west face
  k.building(14, -42, 42, -14, 6, { wall: ['brick', { color: 0x9a5a3a }], walkableRoof: { gaps: [{ side: 'w', from: -24, to: -21 }] }, parapet: 1.0, lit: true });
  const fe = k.mat('metal', { color: 0x2f3a45 }, 1.5);
  k.stairs(11.8, -36, 14, -28, 0, 3, 'z', -1, fe, { solidBelow: false });
  k.platform(9.4, -39, 14, -36, 3, fe, 'nw');
  k.stairs(9.4, -36, 11.6, -24, 3, 6.3, 'z', 1, fe, { solidBelow: false });
  k.platform(9.4, -24, 14, -21, 6.3, fe, 'sw');
  k.railing(9.4, -36, 9.4, -24, 3, 1.05, 6.3); k.railing(11.7, -36, 11.7, -28, 0, 1.05, 6.3);
  k.acUnit(20, -36, 6.3); k.acUnit(36, -20, 6.3, 1.6); k.crate(30, -34, 6.3); k.crate(31.1, -34, 6.3);
  k.box(26, 6.3, -24, 0.5, 1.2, 5, k.mat('concrete', { color: 0x8d949c }, 1));
  k.minimap.push({ x0: 14, z0: -42, x1: 42, z1: -14, y: 6, kind: 'roof' });

  // SW block: storefronts
  k.building(-42, 12, -10, 42, 10, { wall: ['brick', { color: 0x6b5a4a }], lit: false });
  // SE: plaza (device 3) with fountain, planters, benches
  k.building(28, 30, 42, 42, 12, { wall: ['concrete', { color: 0x7d8792 }], lit: true });
  k.cyl(25, 0, 25, 3, 0.7, k.mat('concrete', { color: 0xb9b4aa }, 2), { seg: 12 });
  k.cyl(25, 0.7, 25, 0.6, 1.6, k.mat('concrete', { color: 0xb9b4aa }, 1), { seg: 10 });
  k.tree(14, 36); k.tree(36, 14); k.tree(14, 14); k.bench(20, 34); k.bench(34, 20, Math.PI / 2);
  k.box(18, 0, 22, 0.5, 1.1, 5, k.mat('concrete', { color: 0x8d949c }, 1)); k.box(30, 0, 30, 5, 1.1, 0.5, k.mat('concrete', { color: 0x8d949c }, 1));

  // streets: cars, a bus, barriers, flickering streetlights
  k.car(-20, 2, 0, 0x3a6ea5); k.car(-36, -2, 0, 0xb5533c); k.car(2, -24, Math.PI / 2, 0xcfcfcf); k.car(-2, 22, Math.PI / 2, 0x2f9e44); k.car(30, 2, 0, 0xffc93c);
  k.box(-10, 0, -2.5, 11, 3, 2.6, k.mat('flat', { color: 0xe08b2c }), {});                       // bus (climbable from a car)
  k.box(-10, 3, -2.5, 10.6, 0.1, 2.5, k.mat('flat', { color: 0xbf6f1c }), { collide: false });
  for (const [x, z] of [[8, 8], [-8, -8], [-8, 8], [8, -8]]) { k.box(x, 0, z, 2.2, 0.9, 0.5, k.mat('hazard', {}, 1)); }
  const lights = [[-24, -7.5, true], [-4, -26, true], [7.5, 20, true], [24, 7.5, true], [-24, 7.5, false], [7.5, -30, false]];
  for (const [x, z, light] of lights) k.streetlight(x, z, { flicker: true, light });
  k.billboard(-6.5, 24, 0, 6, 2.5, 'POWER OUT', { bg: 0x222222, fg: '#ff6b6b', face: 'e' });
  k.decal(-9.9, 3, 25, 'e', 5, 2.5, 'NO POWER', '#ff6b6b');
  k.decal(-30, 3, 44.9, 'n', 6, 3, 'BLACKOUT', '#ffd23b');
  k.decal(-30.9, 2.5, -30, 'e', 3, 1.6, 'C?', '#5fe6ff');
  k.civicTower(80, -170);

  return {
    kit: k.finish() && k, time: 'dusk', bounds: { min: V(-B, -5, -B), max: V(B, 12, B) },
    spawns: { default: V(0, 0, 40) }, spawnYaw: 0,
    guards: [V(-28, 0, -28), V(-26, 0, -18), V(24, 6.3, -30), V(34, 6.3, -24), V(22, 0, 20), V(20, 0, 38), V(0, 0, -8), V(-30, 0, 0)],
    points: [V(-28, 0, -30), V(30, 6.3, -28), V(25, 0, 30)], holdRadius: 6,
  };
}

export const LIGHTING = {
  noon: { sky: 0x8fc9f5, fog: [0x8fc9f5, 90, 320], hemi: [0xeaf6ff, 0x8a7a5a, 1.5], sun: [0xfff4e0, 2.2], sunPos: [30, 80, 20] },
  morning: { sky: 0xf2c79a, fog: [0xe8c9a8, 70, 260], hemi: [0xffe8cf, 0x5a6a7a, 1.3], sun: [0xffd2a0, 1.9], sunPos: [-70, 35, 40] },
  night: { sky: 0x1b2440, fog: [0x1d2542, 45, 200], hemi: [0x7f9cff, 0x1a1a26, 0.75], sun: [0xbfd0ff, 0.6], sunPos: [-40, 60, 30] },
  overcast: { sky: 0xa7b4bf, fog: [0xa3adb6, 55, 230], hemi: [0xe2e8ee, 0x6a6a64, 1.45], sun: [0xf0f0f0, 1.1], sunPos: [20, 70, -40] },
  sunset: { sky: 0xff9a6b, fog: [0xf0a07a, 60, 240], hemi: [0xffd2b0, 0x4a3a50, 1.2], sun: [0xff8040, 1.7], sunPos: [-80, 20, -20] },
  clear: { sky: 0x6cb6ff, fog: [0xc4e2ff, 80, 300], hemi: [0xeef6ff, 0x9a8466, 1.55], sun: [0xfff0d8, 2.2], sunPos: [-60, 70, 30] },   // v34: cool sky vs warm geometry (Lantern)
  evening: { sky: 0x5b7fe0, fog: [0x8a9ad6, 60, 250], hemi: [0xdfe6ff, 0x6a5c6c, 2.6], sun: [0xffbf8a, 1.7], sunPos: [-80, 30, -20] },  // v34: blue hour, warm signs pop (Neon)
  dusk: { sky: 0x4a3b6b, fog: [0x3f3557, 50, 220], hemi: [0x8f78c7, 0x2a2430, 0.85], sun: [0xff8a5c, 0.9], sunPos: [80, 18, -30] },
};
