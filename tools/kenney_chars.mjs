// Converts Kenney CC0 characters (mini-characters / blocky-characters) into the game's rigged-model contract:
// named nodes (head/chest/hips/footL/footR/forearmR/handR) + the game's clip names (composed from Kenney clips).
// Usage: node tools/kenney_chars.mjs [outDir=models/rigged] [--only name,name]   (needs `npm i` in tools/)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, mergeDocuments, unpartition } from '@gltf-transform/functions';
import path from 'node:path';

const KEN = process.env.KENNEY_DIR || '/home/mevin/strike-zone-project/assets new/extracted';
const MINI = n => `${KEN}/kenney_mini-characters/Models/GLB format/character-${n}.glb`;
const BLOCKY = n => `${KEN}/kenney_blocky-characters_20/Models/GLB format/character-${n}.glb`;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// family proportions: fractions of total height for hitbox anchor nodes (head = head-sphere centre, chest/hips = capsule ends)
const FAM = {
  mini:   { head: 0.73, chest: 0.36, hips: 0.27, skinned: true },
  blocky: { head: 0.85, chest: 0.52, hips: 0.37 },
};
// [name, kenney clip, time scale, arm-only composition]
const LOCO = { idle: ['idle', 1.5], walk: ['walk', 1.5], run: ['sprint', 1.34] };
const ONESHOT = {
  death: ['die', 5], plant: ['pick-up', 5], defuse: ['interact-right', 1.5],
  ab_dash: ['sprint', 1.5], ab_decoy: ['interact-left', 1.75], ab_drone: ['pick-up', 3.5], ab_flash: ['attack-melee-right', 2],
  ab_lockdown: ['attack-kick-right', 2.5], ab_sensor: ['interact-right', 1.9], ab_shield: ['emote-yes', 1.5], ab_smoke: ['attack-melee-left', 2.8],
};
const isArm = n => /^arm-/.test(n), isRArm = n => n === 'arm-right';

// ---- tiny affine helpers (column-major 4x4) ----
const xform = (m, p) => [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
function invXform(m, p) {
  const a=m[0],b=m[4],c=m[8],d=m[1],e=m[5],f=m[9],g=m[2],h=m[6],i=m[10];
  const det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g), k=1/det;
  const r=[(e*i-f*h)*k,-(b*i-c*h)*k,(b*f-c*e)*k, -(d*i-f*g)*k,(a*i-c*g)*k,-(a*f-c*d)*k, (d*h-e*g)*k,-(a*h-b*g)*k,(a*e-b*d)*k];
  const q=[p[0]-m[12],p[1]-m[13],p[2]-m[14]];
  return [r[0]*q[0]+r[1]*q[1]+r[2]*q[2], r[3]*q[0]+r[4]*q[1]+r[5]*q[2], r[6]*q[0]+r[7]*q[1]+r[8]*q[2]];
}
function bounds(doc) {
  const lo=[1e9,1e9,1e9], hi=[-1e9,-1e9,-1e9];
  for (const n of doc.getRoot().listNodes()) {
    const mesh = n.getMesh(); if (!mesh) continue;
    const M = n.getSkin() ? [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1] : n.getWorldMatrix();   // skinned meshes ignore their node transform
    for (const pr of mesh.listPrimitives()) {
      const a = pr.getAttribute('POSITION'), mn = a.getMin([]), mx = a.getMax([]);
      for (let c = 0; c < 8; c++) { const w = xform(M, [c&1?mx[0]:mn[0], c&2?mx[1]:mn[1], c&4?mx[2]:mn[2]]); for (let k=0;k<3;k++){lo[k]=Math.min(lo[k],w[k]);hi[k]=Math.max(hi[k],w[k]);} }
    }
  }
  return { lo, hi };
}

function addNode(doc, parent, name, worldPos) {
  const n = doc.createNode(name); parent.addChild(n);
  n.setTranslation(invXform(parent.getWorldMatrix(), worldPos)); return n;
}

// copy channels of `anim` whose target node passes `keep` into `out`, with times scaled
function copyChannels(doc, out, anim, keep, k) {
  const buf = doc.getRoot().listBuffers()[0], cache = new Map();
  const scaled = acc => {                       // scaled copy of a time accessor (cached per source accessor)
    if (k === 1) return acc; if (cache.has(acc)) return cache.get(acc);
    const arr = Float32Array.from(acc.getArray(), t => t * k);
    const a = doc.createAccessor().setType('SCALAR').setArray(arr).setBuffer(buf); cache.set(acc, a); return a;
  };
  const smp = new Map();
  for (const ch of anim.listChannels()) {
    if (!keep(ch.getTargetNode().getName())) continue;
    const s = ch.getSampler();
    if (!smp.has(s)) smp.set(s, doc.createAnimationSampler().setInput(scaled(s.getInput())).setOutput(s.getOutput()).setInterpolation(s.getInterpolation()));
    out.addSampler(smp.get(s));
    out.addChannel(doc.createAnimationChannel().setTargetNode(ch.getTargetNode()).setTargetPath(ch.getTargetPath()).setSampler(smp.get(s)));
  }
}
function makeClip(doc, src, name, parts) {       // parts: [[clipName, keepFn, timeScale], ...]
  const a = doc.createAnimation(name);
  for (const [cn, keep, k] of parts) {
    const s = src[cn]; if (!s) throw new Error('missing clip ' + cn);
    copyChannels(doc, a, s, keep, k);
  }
  return a;
}

export async function convert(spec) {
  const doc = await io.read(spec.src), root = doc.getRoot(), scene = root.listScenes()[0];
  const fam = FAM[spec.fam];
  // lit materials (Kenney blocky ships unlit); no recolour
  for (const m of root.listMaterials()) { m.setExtension('KHR_materials_unlit', null); m.setMetallicFactor(0).setRoughnessFactor(1); }
  for (const e of root.listExtensionsUsed()) if (e.extensionName === 'KHR_materials_unlit') e.dispose();
  const top = scene.listChildren()[0];
  const b0 = bounds(doc), s = spec.h / (b0.hi[1] - b0.lo[1]);
  top.setScale(top.getScale().map(v => v * s));
  top.setTranslation(top.getTranslation().map((v, i) => i === 1 ? v - b0.lo[1] * s : v));      // feet on y=0
  const by = {}; root.listNodes().forEach(n => by[n.getName()] = n);
  const H = spec.h, wp = n => n.getWorldMatrix().slice(12, 15);
  const head = by['head']; head.setName('head_joint');
  const T = by['torso'], LL = by['leg-left'], LR = by['leg-right'], AR = by['arm-right'];
  const hx = wp(head)[0], hz = wp(head)[2], tz = wp(T)[2];
  addNode(doc, head, 'head', [hx, fam.head * H - 0.2, hz]);
  addNode(doc, T, 'chest', [hx, fam.chest * H, tz]);
  addNode(doc, T, 'hips', [hx, fam.hips * H, tz]);
  addNode(doc, LL, 'footL', [wp(LL)[0], 0.05, wp(LL)[2]]);
  addNode(doc, LR, 'footR', [wp(LR)[0], 0.05, wp(LR)[2]]);
  const sh = wp(AR);
  let hand;
  if (fam.skinned) {            // mini: arm mesh is bent in bind pose, so put the hand at the far end of the vertices skinned to arm-right
    const pts = [], TM = top.getWorldMatrix();
    for (const n of root.listNodes()) {
      const sk = n.getSkin(), mesh = n.getMesh(); if (!sk || !mesh) continue;
      const ji = sk.listJoints().indexOf(AR); if (ji < 0) continue;
      for (const pr of mesh.listPrimitives()) {
        const P = pr.getAttribute('POSITION'), J = pr.getAttribute('JOINTS_0'), W = pr.getAttribute('WEIGHTS_0');
        for (let i = 0; i < P.getCount(); i++) { const j = J.getElement(i, []), w = W.getElement(i, []); const k = j.indexOf(ji); if (k >= 0 && w[k] > 0.5) pts.push(xform(TM, P.getElement(i, []))); }
      }
    }
    pts.sort((a, b) => Math.hypot(b[0]-sh[0], b[1]-sh[1], b[2]-sh[2]) - Math.hypot(a[0]-sh[0], a[1]-sh[1], a[2]-sh[2]));
    const far = pts.slice(0, Math.max(4, Math.floor(pts.length * 0.15)));
    hand = [0, 1, 2].map(k => far.reduce((a, p) => a + p[k], 0) / far.length);
  } else {
    let La = -AR.getMesh().listPrimitives()[0].getAttribute('POSITION').getMin([])[1] * AR.getWorldMatrix()[5];
    hand = [sh[0], sh[1] - La * 0.92, sh[2]];
  }
  addNode(doc, AR, 'forearmR', [0, 1, 2].map(k => (sh[k] + hand[k]) / 2));
  addNode(doc, AR, 'handR', hand);

  // ---- clips ----
  const src = {}; for (const a of root.listAnimations()) src[a.getName()] = a;
  const all = () => true, notArm = n => !isArm(n), none = () => false;
  const made = [];
  const add = (name, parts) => made.push(makeClip(doc, src, name, parts));
  for (const [nm, [cn, k]] of Object.entries(LOCO)) {
    add(nm, [[cn, all, k]]);
    add(nm + '_rifle', [[cn, notArm, k], ['holding-both', isArm, 1]]);
    add(nm + '_pistol', [[cn, n => !isRArm(n), k], ['holding-right', isRArm, 1]]);
  }
  add('shoot', [['static', n => !isArm(n) && n !== 'torso' && n !== 'head', 1], ['holding-both-shoot', all, 2.5]]);
  add('shoot_pistol', [['static', n => !isRArm(n), 1], ['holding-right-shoot', all, 2.9]]);
  for (const [nm, [cn, k]] of Object.entries(ONESHOT)) add(nm, [[cn, all, k]]);
  for (const a of root.listAnimations()) if (!made.includes(a)) a.dispose();
  await doc.transform(prune({ keepLeaves: true }));
  return doc;
}

// ---------------- static enemies (turret / drone) assembled from Kenney factory + blaster kit pieces ----------------
const FK = n => `${KEN}/kenney_factory-kit_3.0/Models/GLB format/${n}.glb`;
const BK = n => `${KEN}/kenney_blaster-kit_2.1/Models/GLB format/${n}.glb`;
async function part(doc, file, name, parent, { pos = [0, 0, 0], scale = 1, rotY = 0, rotX = 0 } = {}) {
  const d = await io.read(file), roots = d.getRoot().listScenes()[0].listChildren();
  mergeDocuments(doc, d);                       // brings the source scenes along as extra scenes; steal their nodes
  const holder = doc.createNode(name).setTranslation(pos).setScale([scale, scale, scale]);
  const hy = Math.sin(rotY / 2), hx = Math.sin(rotX / 2), cy = Math.cos(rotY / 2), cx = Math.cos(rotX / 2);
  holder.setRotation([cy * hx, hy * cx, -hy * hx, cy * cx]);   // rotY * rotX
  parent.addChild(holder);
  for (const sc of doc.getRoot().listScenes().slice(1)) { for (const c of sc.listChildren()) { sc.removeChild(c); holder.addChild(c); } sc.dispose(); }
  return holder;
}
function track(doc, anim, node, path, times, values) {
  const buf = doc.getRoot().listBuffers()[0], comp = path === 'rotation' ? 4 : 3;
  const inp = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(times)).setBuffer(buf);
  const out = doc.createAccessor().setType(comp === 4 ? 'VEC4' : 'VEC3').setArray(new Float32Array(values.flat())).setBuffer(buf);
  const smp = doc.createAnimationSampler().setInput(inp).setOutput(out).setInterpolation('LINEAR');
  anim.addSampler(smp); anim.addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(smp));
}
const qx = a => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)], qy = a => [0, Math.sin(a / 2), 0, Math.cos(a / 2)], qz = a => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];

export async function buildTurret() {
  const doc = new (await import('@gltf-transform/core')).Document(); doc.createBuffer(); const sc = doc.createScene('turret');
  const rig = doc.createNode('enemy_turret_rig'); sc.addChild(rig);
  const base = doc.createNode('base'); rig.addChild(base);
  await part(doc, FK('piston-round'), 'pedestal', base, { scale: 0.5 });
  const head = doc.createNode('head').setTranslation([0, 0.55, 0]); base.addChild(head);
  await part(doc, FK('machine'), 'housing', head, { pos: [0, -0.02, -0.05], scale: 0.42 });
  const barrels = doc.createNode('barrels').setTranslation([0, 0.19, 0.25]); head.addChild(barrels);
  await part(doc, BK('blaster-i'), 'gunL', barrels, { pos: [0.16, 0, 0.1], scale: 1.7 });
  await part(doc, BK('blaster-i'), 'gunR', barrels, { pos: [-0.16, 0, 0.1], scale: 1.7 });
  for (const m of doc.getRoot().listMaterials()) { m.setExtension('KHR_materials_unlit', null); }
  const idle = doc.createAnimation('idle');   track(doc, idle, head, 'rotation', [0, 2, 4], [qy(-0.12), qy(0.12), qy(-0.12)]);
  const fire = doc.createAnimation('fire');   track(doc, fire, barrels, 'translation', [0, 0.04, 0.16], [[0, 0.19, 0.25], [0, 0.19, 0.17], [0, 0.19, 0.25]]);
  const death = doc.createAnimation('death'); track(doc, death, head, 'rotation', [0, 0.9], [qx(0), qx(0.8)]); track(doc, death, head, 'translation', [0, 0.9], [[0, 0.55, 0], [0, 0.4, 0]]);
  return doc;
}
export async function buildDrone() {
  const doc = new (await import('@gltf-transform/core')).Document(); doc.createBuffer(); const sc = doc.createScene('drone');
  const rig = doc.createNode('enemy_drone_rig'); sc.addChild(rig);
  const body = doc.createNode('body'); rig.addChild(body);
  await part(doc, FK('hopper-round'), 'shell', body, { pos: [0, -0.2, 0], scale: 0.4 });
  await part(doc, BK('blaster-i'), 'gun', body, { pos: [0, -0.22, 0.28], scale: 1.1 });
  const rot = [];
  const corners = [[0.36, -0.36], [-0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]];
  for (let i = 0; i < 4; i++) {
    const r = doc.createNode('rotor' + i).setTranslation([corners[i][0], 0.22, corners[i][1]]); body.addChild(r); rot.push(r);
    await part(doc, FK('cog-a'), 'blade' + i, r, { pos: [0, 0.04, 0], scale: 0.4 });
  }
  for (const m of doc.getRoot().listMaterials()) m.setExtension('KHR_materials_unlit', null);
  const spin = (a, k) => rot.forEach((r, i) => track(doc, a, r, 'rotation', [0, 0.25 * k, 0.5 * k, 0.75 * k, k], [0, 1, 2, 3, 4].map(j => qy((i % 2 ? -1 : 1) * j * Math.PI / 2))));
  const hover = doc.createAnimation('hover'); spin(hover, 1);
  track(doc, hover, body, 'translation', [0, 0.5, 1], [[0, 0, 0], [0, 0.06, 0], [0, 0, 0]]);
  const fire = doc.createAnimation('fire'); spin(fire, 1);
  track(doc, fire, body, 'rotation', [0, 0.05, 0.2], [qx(0), qx(-0.12), qx(0)]);
  const death = doc.createAnimation('death'); track(doc, death, body, 'rotation', [0, 0.8], [qz(0), qz(1.6)]);
  return doc;
}

// ---------------- spec table ----------------
export const SPECS = {
  rhea:   { src: MINI('female-a'),  fam: 'mini',   h: 1.7 },
  kade:   { src: BLOCKY('c'),       fam: 'blocky', h: 1.85 },
  amara:  { src: MINI('female-d'),  fam: 'mini',   h: 1.7 },
  tomas:  { src: MINI('male-c'),    fam: 'mini',   h: 1.8 },
  yuna:   { src: BLOCKY('h'),       fam: 'blocky', h: 1.75 },
  enemy_guard:     { src: MINI('soldier'), fam: 'mini',   h: 1.75 },
  enemy_heavy:     { src: MINI('robot'),   fam: 'mini',   h: 1.95 },
  enemy_sniper:    { src: MINI('raider'),  fam: 'mini',   h: 1.75 },
  enemy_commander: { src: BLOCKY('n'),     fam: 'blocky', h: 1.9 },
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2), oi = args.indexOf('--only');
  const only = oi >= 0 ? args.splice(oi, 2)[1].split(',') : null;
  const outDir = args[0] || new URL('../models/rigged', import.meta.url).pathname;
  for (const [name, fn] of Object.entries({ enemy_turret: buildTurret, enemy_drone: buildDrone })) {
    if (only && !only.includes(name)) continue;
    const doc = await fn(); await doc.transform(unpartition(), prune({ keepLeaves: true })); await io.write(path.join(outDir, name + '.glb'), doc); console.log('wrote', name);
  }
  for (const [name, spec] of Object.entries(SPECS)) {
    if (only && !only.includes(name)) continue;
    const doc = await convert(spec); await io.write(path.join(outDir, name + '.glb'), doc);
    console.log('wrote', name);
  }
}
