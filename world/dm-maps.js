// v27: the four Deathmatch arenas (Belltower Square, Lantern Canal, Neon Alley, Sandkeep).
// Visuals are baked from the prototypes in docs/maps/dm-src by tools/export_dm_maps.cjs -> models/dm/<id>.glb;
// colliders (and the prototypes' floor/ramp data) come from models/dm/<id>.json. Loaded on demand, cached.
import * as THREE from 'three';
import { GLTFLoader } from '../lib/addons/loaders/GLTFLoader.js';
import { Kit } from './kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const DM_MAPS = [
  { id: 'belltower', title: 'Belltower Square', time: 'noon', w: 60, d: 44, a: [3.4, 0, 21.9], b: [56.6, 0, 21.9] },
  { id: 'lantern', title: 'Lantern Canal', time: 'clear', w: 70, d: 40, a: [4.5, 0.4, 20], b: [65.5, 0.4, 20] },
  { id: 'neon', title: 'Neon Alley', time: 'evening', w: 64, d: 48, a: [5, 0, 24], b: [59, 0, 24] },
  { id: 'sandkeep', title: 'Sandkeep', time: 'noon', w: 56, d: 56, a: [4.5, 0, 51.5], b: [51.5, 0, 4.5] },
];
const P = {}, R = {};
export function loadDmMap(id) {
  if (!P[id]) P[id] = Promise.all([new GLTFLoader().loadAsync(`models/dm/${id}.glb`), fetch(`models/dm/${id}.json`).then(r => r.json())])
    .then(([g, data]) => { const def = DM_MAPS.find(d => d.id === id), bb = new THREE.Box3();
      g.scene.updateMatrixWorld(true);
      g.scene.traverse(o => { if (o.isMesh) {
        // v34: the prototypes' flat spawn-pad quads read as a solid neon slab at your feet; keep them as a soft translucent tint
        bb.setFromObject(o); if (def && bb.max.y - bb.min.y < 0.05 && [def.a, def.b].some(p => p[0] > bb.min.x && p[0] < bb.max.x && p[2] > bb.min.z && p[2] < bb.max.z) && bb.max.x - bb.min.x < 14) {
          o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.18; o.material.depthWrite = false; o.renderOrder = 1; }
        // v34: Neon Alley's near-black walls swallowed bots and read as one muddy hue; lift dark materials to a mid tone
        if (id === 'neon' && o.material.color && !o.material.transparent && !o.material.userData.lift) { o.material.userData.lift = 1; const h = {}; o.material.color.getHSL(h); if (h.l < 0.24) o.material.color.setHSL(h.h, h.s, 0.12 + h.l * 0.6); }
        o.castShadow = !o.material.transparent; o.receiveShadow = true; o.matrixAutoUpdate = false; o.updateMatrix(); } });
      return (R[id] = { scene: g.scene, data }); })
    .catch(e => { delete P[id]; throw e; });
  return P[id];
}
export const dmMapReady = id => !!R[id];

// floors / ramps the prototypes handled in code (their getFloorHeight functions), per map
function floors(def, world, k, data) {
  const box = (x0, y0, z0, x1, y1, z1) => world.addBox(V(x0, y0, z0), V(x1, y1, z1), 'floor');
  const ramp = (x0, y0, z0, x1, y1, z1, axis, dir) => world.addRamp(V(x0, y0, z0), V(x1, y1, z1), axis, dir);
  const { w, d } = def;
  if (def.id === 'lantern') {                                       // decks at 0.4, a shallow wadeable canal, arched footbridge
    box(-6, -4, -6, w + 6, 0.4, 16); box(-6, -4, 24, w + 6, 0.4, d + 6); box(-6, -4, 16, 10, 0.4, 24); box(60, -4, 16, w + 6, 0.4, 24);
    box(10, -4, 16, 60, 0.0, 24);                                     // canal bed (proto: -0.6, raised so you can always step out)
    ramp(33.65, 0.4, 13.8, 36.35, 2.5, 20, 'z', 1); ramp(33.65, 0.4, 20, 36.35, 2.5, 26.2, 'z', -1);
    k.waterPlane(10, 16, 60, 24, 0.22, 0x2a7f86);
    return;
  }
  box(-6, -4, -6, w + 6, 0, d + 6);                                  // ground
  if (def.id === 'belltower') {
    box(23, 3.85, 35.8, 37, 4, 42.1);                                 // bell tower balcony
    for (const x of [20.9, 36.9]) { ramp(x, 0, 30, x + 2.2, 4, 38, 'z', 1); box(x, 3.85, 38, x + 2.2, 4, 41.8); }   // enclosed staircases + landings
  }
  if (def.id === 'neon') {
    for (const f of data.floors || []) box(f.minX, f.y - 0.26, f.minZ, f.maxX, f.y, f.maxZ);
    for (const r of data.ramps || []) ramp(r.minX, Math.min(r.yAtMinZ, r.yAtMaxZ), r.minZ, r.maxX, Math.max(r.yAtMinZ, r.yAtMaxZ), r.maxZ, 'z', r.yAtMaxZ > r.yAtMinZ ? 1 : -1);
  }
  if (def.id === 'sandkeep') {                                       // prototype data is in map coords (z flipped)
    for (const r of data.ramps || []) {
      const up = Math.sign(r.high - r.low);
      if (r.axis === 'z') ramp(r.minX, r.yLow, 56 - r.maxZ, r.maxX, r.yHigh, 56 - r.minZ, 'z', -up);
      else ramp(r.minX, r.yLow, 56 - r.maxZ, r.maxX, r.yHigh, 56 - r.minZ, 'x', up);
    }
    for (const l of data.ladders || []) {                             // ladders become plank ramps up to the wall walks
      const lx = (l.minX + l.maxX) / 2, up = Math.sign(l.exitX - lx), z0 = 56 - l.maxZ, z1 = 56 - l.minZ;
      const wood = k.mat('wood', { color: 0x9a6a3c }, 1);           // visible plank ramp; ~40° so the step-up onto the wall walk stays under 0.45 m
      if (up > 0) k.ramp(lx - 4.6, z0, lx + 0.2, z1, 0, l.topY, 'x', 1, wood); else k.ramp(lx - 0.2, z0, lx + 4.6, z1, 0, l.topY, 'x', -1, wood);
    }
  }
}

export function buildDmMap(def, world, scene) {
  const r = R[def.id]; if (!r) throw new Error('DM map not loaded: ' + def.id);
  const k = new Kit(world, scene), { w, d } = def;
  scene.add(r.scene.clone());                                        // shares geometry/materials with the cache (kit.dispose never sees them)
  for (const b of r.data.boxes) {
    if (b.x1 - b.x0 < 0.01 || b.z1 - b.z0 < 0.01 || b.y1 - b.y0 < 0.01) continue;
    if (def.id === 'lantern' && b.x0 >= 33.4 && b.x1 <= 36.6 && b.y1 <= 2.7 && b.z0 > 10 && b.z1 < 30) continue;   // bridge abutments: the ramps below carry you up
    world.addBox(V(b.x0, b.y0, b.z0), V(b.x1, b.y1, b.z1));
    if (b.y1 - b.y0 > 2.2 && (b.x1 - b.x0) * (b.z1 - b.z0) > 1.5 && b.y0 < 1) k.minimap.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, y: b.y1, kind: 'building' });
  }
  floors(def, world, k, r.data);
  for (const [x0, z0, x1, z1] of [[0, 0, w, 0], [0, d, w, d], [0, 0, 0, d], [w, 0, w, d]]) k.invisibleWall(x0, z0, x1, z1);
  const A = V(...def.a), B = V(...def.b), C = V(w / 2, def.id === 'lantern' ? 0.4 : 0, def.id === 'lantern' ? 8 : d / 2);
  return {
    kit: k.finish() && k, time: def.time, bounds: { min: V(0, -5, 0), max: V(w, 15, d) },
    spawns: { default: A, stealth: A, assault: A }, spawnYaw: Math.atan2(-(B.x - A.x), -(B.z - A.z)),
    guards: [B, C, V((A.x + B.x) / 2, A.y, (A.z + B.z) / 2)], points: [], holdRadius: 6,
    dm: true, noDress: true, teamSpawns: { A, B },
  };
}
