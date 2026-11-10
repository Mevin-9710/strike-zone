// Bakes Kenney CC0 models into the game's weapon/prop GLBs. Usage: node tools/kenney_props.mjs [weapons|props|map|all]
// Source dir defaults to ../assets new/extracted (read-only). Needs: cd tools && npm i @gltf-transform/core @gltf-transform/functions
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, mergeDocuments } from '@gltf-transform/functions';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SRC = process.env.KENNEY_SRC || path.resolve(ROOT, '..', 'assets new', 'extracted');
export const BK = `${SRC}/kenney_blaster-kit_2.1/Models/GLB format`;
const io = new NodeIO();
const log = console.log; console.warn = () => {};

// ---- tiny 4x4 column-major math ----
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const T = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const S = s => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1];
const RY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
const apply = (m, p) => [0, 1, 2].map(i => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i]);

export function meshNodes(doc) { return doc.getRoot().listNodes().filter(n => n.getMesh()); }
export function bbox(nodes, pre = null) {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const n of nodes) {
    const wm = pre ? mul(pre, n.getWorldMatrix()) : n.getWorldMatrix();
    for (const prim of n.getMesh().listPrimitives()) {
      const a = prim.getAttribute('POSITION'), lo = a.getMin([]), hi = a.getMax([]);
      for (let i = 0; i < 8; i++) { const p = apply(wm, [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]]); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); } }
    }
  }
  return { min: mn, max: mx, size: mx.map((v, i) => v - mn[i]), ctr: mx.map((v, i) => (v + mn[i]) / 2) };
}
const hasAnc = (n, name) => { for (let p = n; p; p = p.getParentNode?.() ?? null) if (p.getName && p.getName() === name) return true; return false; };

// Merge another GLB into `doc`; returns its mesh nodes (world matrices intact, still under their own scene roots).
export async function importInto(doc, file) {
  const before = new Set(doc.getRoot().listNodes());
  const src = await io.read(file); mergeDocuments(doc, src);
  const fresh = doc.getRoot().listNodes().filter(n => !before.has(n));
  return fresh;
}
// Re-parent mesh nodes flat under `parent` with matrix = pre * world.
function flattenInto(doc, parent, nodes, pre) {
  for (const n of nodes) {
    const m = mul(pre, n.getWorldMatrix()); if (n.getParentNode()) n.getParentNode().removeChild(n);
    n.setMatrix(m); parent.addChild(n);
    for (const c of n.listChildren()) n.removeChild(c);
  }
}
function cleanup(doc) {
  const bs = doc.getRoot().listBuffers(); doc.getRoot().listAccessors().forEach(a => a.setBuffer(bs[0])); bs.slice(1).forEach(b => b.dispose());
  const sc = doc.getRoot().listScenes(); sc.slice(1).forEach(s => s.dispose());
  const keep = new Set(sc[0].listChildren());
  doc.getRoot().listNodes().forEach(n => { if (!n.getMesh() && !keep.has(n) && n.listChildren().length === 0 && !n.getParentNode() && !n.getName().match(/^(mag|rotor)/)) n.dispose(); });
}

// ================= WEAPONS =================
// cfg: blaster letter, target length (m), grip position as fraction along length from rear (f) and down from top (fy),
// extras: [file, x,y,z (blaster frame: y relative to bbox top; z relative to muzzle(-)/rear), sc]
const WEAPONS = {
  vex_p9:        { k: 0.95, b: 'b', len: 0.205, f: 0.30, fy: 0.42, ex: [['silencer-small', 'muzzle', 0.78]] },
  harrow_45:     { k: 0.95, b: 'k', len: 0.269, f: 0.30, fy: 0.42 },
  bulldog_r6:    { k: 0.95, b: 'c', len: 0.279, f: 0.30, fy: 0.42 },
  ar7_lance:     { b: 'n', len: 0.858, f: 0.30, fy: 0.42 },
  kestrel_bp:    { b: 'm', len: 0.676, f: 0.30, fy: 0.42, ex: [['scope-small', 'top', 0.55]] },
  warden_br:     { k: 0.38, b: 'r', len: 1.006, f: 0.30, fy: 0.55 },
  grinder_lmg:   { k: 0.48, b: 'q', len: 1.063, f: 0.30, fy: 0.42 },
  hailstorm_mg:  { k: 0.5, b: 'p', len: 0.936, f: 0.30, fy: 0.42 },
  longshot_bolt: { b: 'f', len: 1.142, f: 0.30, fy: 0.55 },
  javelin_amr:   { b: 'e', len: 1.447, f: 0.30, fy: 0.55 },
};
const GUN_K = 0.6;   // Kenney blasters are chunky; shrink vs. the nominal weapons.json length so they don't fill the screen
const MAG_CLIP = 'clip-small';   // used when the blaster has no separable magazine mesh

async function buildWeapon(id, c) {
  const doc = await io.read(`${BK}/blaster-${c.b}.glb`);
  const all = meshNodes(doc);
  const body = all.filter(n => !hasAnc(n, 'magazine') && n.getName() !== 'magazine');
  const magN = all.filter(n => hasAnc(n, 'magazine') || n.getName() === 'magazine');
  const bb = bbox(all);                                   // Kenney frame: muzzle toward -Z
  const extra = [];
  for (const [f, where, k] of c.ex || []) {
    const ns = await importInto(doc, `${BK}/${f}.glb`); const ms = meshNodes(doc).filter(n => ns.includes(n));
    const xb = bbox(ms);
    // place: muzzle -> attachment's +Z end (z=0) at blaster's front; top -> sits on the receiver
    const pre = where === 'muzzle' ? T(-xb.ctr[0], bb.min[1] + (bb.size[1]) * k - 0, bb.min[2]) : T(-xb.ctr[0], bb.max[1] - 0.02, bb.min[2] + bb.size[2] * (1 - k) - xb.ctr[2]);
    extra.push({ ms, pre });
  }
  if (!magN.length) {                                     // add a short clip as the reload mag
    const ns = await importInto(doc, `${BK}/${MAG_CLIP}.glb`); const ms = meshNodes(doc).filter(n => ns.includes(n));
    const xb = bbox(ms);
    extra.push({ ms, pre: T(-xb.ctr[0], bb.min[1] + 0.02 - xb.min[1] * 0, bb.max[2] - bb.size[2] * 0.62 - xb.ctr[2]), mag: true });
  }
  const s = c.len * (c.k ?? GUN_K) / bb.size[2];
  const gz = bb.max[2] - bb.size[2] * c.f;                // grip along Z (rear is +Z in Kenney frame)
  const gy = bb.max[1] - bb.size[1] * c.fy;
  const gx = bb.ctr[0];
  const X = mul(S(s), mul(RY(Math.PI), T(-gx, -gy, -gz)));  // grip -> origin, rotate muzzle to +Z, scale
  const scene = doc.getRoot().listScenes()[0];
  const bodyN = doc.createNode(id), magG = doc.createNode('mag');
  flattenInto(doc, bodyN, body, X); flattenInto(doc, magG, magN, X);
  for (const e of extra) flattenInto(doc, e.mag ? magG : bodyN, e.ms, mul(X, e.pre));
  for (const n of scene.listChildren()) scene.removeChild(n);
  scene.addChild(magG); scene.addChild(bodyN);
  cleanup(doc); await doc.transform(dedup(), prune());
  await io.write(`${ROOT}/models/weapons/${id}.glb`, doc);
  const o = bbox(meshNodes(doc)); log(id, 'blaster-' + c.b, 'size', o.size.map(v => +v.toFixed(3)), 'min', o.min.map(v => +v.toFixed(3)), 'max', o.max.map(v => +v.toFixed(3)), magN.length ? 'native-mag' : 'clip-mag');
}

const what = process.argv[2] || 'all';
if (what === 'weapons' || what === 'all') for (const [id, c] of Object.entries(WEAPONS)) await buildWeapon(id, c);

// ================= MAP KITS (models/kenney/<kit>.glb: one texture per kit, models as named top-level nodes) =================
const KITS = {
  car:  { dir: 'kenney_car-kit', models: ['sedan', 'suv', 'van', 'taxi', 'hatchback-sports', 'delivery', 'cone', 'cone-flat', 'debris-tire', 'debris-door', 'debris-plate-a', 'debris-bumper', 'box'] },
  ind:  { dir: 'kenney_city-kit-industrial_2.0', models: ['shipping-container-a', 'shipping-container-b', 'shipping-container-c', 'detail-tank', 'detail-tank-large', 'water-tower', 'solar-panel-landscape-group', 'solar-panel-portrait-group', 'chimney-small'] },
  fac:  { dir: 'kenney_factory-kit_3.0', models: ['box-large', 'box-small', 'machine', 'machine-window', 'machine-window-bar', 'hopper-round', 'pipe-large', 'pipe-large-long', 'screen-wide', 'scanner-low', 'warning-orange', 'cog-a'] },
  dun:  { dir: 'kenney_mini-dungeon', models: ['barrel', 'pot', 'chest', 'table', 'rocks', 'stones'] },
  skate: { dir: 'kenney_mini-skate', models: ['bench', 'pallet', 'plank', 'rail-low', 'ramp'] },
  forest: { dir: 'kenney_mini-forest_1.0', models: ['tree', 'tree-high', 'rocks-high', 'rocks-low', 'stones', 'plant', 'tent', 'fence', 'flag', 'target'] },
  arena: { dir: 'kenney_mini-arena', models: ['statue', 'banner', 'tree', 'weapon-rack', 'trophy'] },
  blk: { dir: 'kenney_blaster-kit_2.1', models: ['crate-medium', 'crate-wide', 'target-large', 'target-small'] },
};
const glbPath = (dir, name) => { const d = `${SRC}/${dir}/Models`; return `${d}/GLB format/${name}.glb`; };

// Build one GLB from named models of a kit. extras: [{name, file, dir}] allow pulling from other dirs (same texture only!).
export async function bakeKit(outName, dir, models, outDir) {
  let doc = null, scene;
  const groups = [];
  for (const m of models) {
    if (!doc) { doc = await io.read(glbPath(dir, m)); scene = doc.getRoot().listScenes()[0]; groups.push([m, meshNodes(doc)]); continue; }
    const ns = await importInto(doc, glbPath(dir, m)); groups.push([m, meshNodes(doc).filter(n => ns.includes(n))]);
  }
  const roots = [];
  for (const [name, ms] of groups) { const g = doc.createNode(name); flattenInto(doc, g, ms, T(0, 0, 0).map((v, i) => (i % 5 === 0 ? 1 : 0))); roots.push(g); }
  for (const n of scene.listChildren()) scene.removeChild(n);
  roots.forEach(g => scene.addChild(g));
  cleanup(doc); await doc.transform(dedup(), prune());
  await io.write(`${outDir}/${outName}.glb`, doc);
  log('kit', outName, models.length, 'models');
}
if (what === 'map' || what === 'all') for (const [k, v] of Object.entries(KITS)) await bakeKit(k, v.dir, v.models, `${ROOT}/models/kenney`);

// ================= ABILITY PROPS =================
const FAC = 'kenney_factory-kit_3.0', BLK = 'kenney_blaster-kit_2.1';
const BKP = n => `${BK}/${n}.glb`;
// h: target height (m); w: target max horizontal size; base at y=0, centered on x/z
const PROPS = {
  counter_charge: { src: [BKP('crate-small')], w: 0.31 },
  smoke_canister: { src: [BKP('grenade-b')], h: 0.176 },
  flash_orb:      { src: [BKP('grenade-a')], h: 0.12 },
  covenant_device: { src: [glbPath(FAC, 'machine-fortified')], w: 0.4 },
  decoy_puck:     { src: [glbPath(FAC, 'button-floor-round')], w: 0.16 },
  sensor_puck:    { src: [glbPath(FAC, 'piston-round')], w: 0.24 },
  recon_drone:    { src: [glbPath(FAC, 'button-floor-round')], w: 0.3, rotors: glbPath(FAC, 'cog-a') },
};
async function bakeProp(id, c) {
  const doc = await io.read(c.src[0]); const ms = meshNodes(doc); const bb = bbox(ms);
  const s = c.h ? c.h / bb.size[1] : c.w / Math.max(bb.size[0], bb.size[2]);
  const X = mul(S(s), T(-bb.ctr[0], -bb.min[1], -bb.ctr[2]));
  const g = doc.createNode(id); flattenInto(doc, g, ms, X);
  const scene = doc.getRoot().listScenes()[0];
  for (const n of scene.listChildren()) scene.removeChild(n);
  scene.addChild(g);
  if (c.rotors) {
    const ns = []; for (let i = 0; i < 4; i++) ns.push(await importInto(doc, c.rotors));
    const sc = doc.getRoot().listScenes(); 
    for (let i = 0; i < 4; i++) {
      const rm = meshNodes(doc).filter(n => ns[i].includes(n)); const rb = bbox(rm);
      const r = doc.createNode('rotor' + i); const k = 0.16 / Math.max(rb.size[0], rb.size[2]);
      flattenInto(doc, r, rm, mul(S(k), T(-rb.ctr[0], -rb.min[1], -rb.ctr[2]))); r.setTranslation([(i & 1 ? 1 : -1) * 0.2, 0.05, (i & 2 ? 1 : -1) * 0.2]); scene.addChild(r);
    }
  }
  cleanup(doc); await doc.transform(dedup(), prune());
  await io.write(`${ROOT}/models/props/${id}.glb`, doc);
  const o = bbox(meshNodes(doc)); log(id, 'size', o.size.map(v => +v.toFixed(3)));
}
if (what === 'props' || what === 'all') for (const [id, c] of Object.entries(PROPS)) await bakeProp(id, c);
