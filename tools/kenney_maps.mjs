// Bakes Kenney CC0 architecture pieces into models/kenney/arch_<kit>.glb (one texture per file, only the used meshes).
// Usage: cd tools && node kenney_maps.mjs   (KENNEY_SRC overrides ../assets new/extracted)
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, mergeDocuments } from '@gltf-transform/functions';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.KENNEY_SRC || path.resolve(ROOT, '..', 'assets new', 'extracted');
const io = new NodeIO(); console.warn = () => {};
const L = (a, p) => 'abcdefghijklmnopqrst'.slice(a, p).split('').map(c => c);
const KITS = {
  com: { dir: 'kenney_city-kit-commercial_2.1', models: [...L(0, 8).map(c => 'building-' + c), 'building-n', ...L(0, 5).map(c => 'building-skyscraper-' + c),
    ...L(0, 8).map(c => 'low-detail-building-' + c), 'low-detail-building-wide-a', 'low-detail-building-wide-b', 'detail-awning', 'detail-awning-wide', 'detail-overhang-wide', 'detail-parasol-a', 'detail-parasol-b'] },
  ind: { dir: 'kenney_city-kit-industrial_2.0', models: ['building-a', 'building-d', 'chimney-large', 'chimney-medium', 'detail-tank-large', 'water-tower', 'solar-panel-landscape-group', 'solar-panel-portrait-group'] },
  fac: { dir: 'kenney_factory-kit_3.0', models: ['catwalk-straight', 'catwalk-corner', 'catwalk-stairs', 'structure-wall', 'structure-window', 'structure-doorway', 'pipe-large-long', 'crane'] },
  are: { dir: 'kenney_mini-arena', models: ['wall', 'wall-corner', 'wall-gate', 'column', 'column-damaged', 'stairs', 'banner', 'border-straight', 'block'] },
  dun: { dir: 'kenney_mini-dungeon', models: ['wall', 'wall-half', 'wall-opening', 'gate', 'stairs', 'wood-structure', 'wood-support', 'column'] },
};
const find = (dir, name) => { const d = path.join(SRC, dir); const f = fs.readdirSync(d, { recursive: true }).find(p => p.endsWith(`GLB format/${name}.glb`)); if (!f) throw new Error('missing ' + dir + '/' + name); return path.join(d, f); };
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
for (const [out, { dir, models }] of Object.entries(KITS)) {
  let doc = null, scene; const groups = [];
  for (const m of models) {
    if (!doc) { doc = await io.read(find(dir, m)); scene = doc.getRoot().listScenes()[0]; groups.push([m, doc.getRoot().listNodes().filter(n => n.getMesh())]); continue; }
    const before = new Set(doc.getRoot().listNodes()); mergeDocuments(doc, await io.read(find(dir, m)));
    groups.push([m, doc.getRoot().listNodes().filter(n => !before.has(n) && n.getMesh())]);
  }
  const roots = [];
  for (const [name, ms] of groups) { const g = doc.createNode(name); for (const n of ms) { const wm = n.getWorldMatrix(); n.getParentNode()?.removeChild(n); n.setMatrix(wm); g.addChild(n); } roots.push(g); }
  for (const n of scene.listChildren()) scene.removeChild(n);
  roots.forEach(g => scene.addChild(g));
  const bs = doc.getRoot().listBuffers(); doc.getRoot().listAccessors().forEach(a => a.setBuffer(bs[0])); bs.slice(1).forEach(b => b.dispose());
  doc.getRoot().listScenes().slice(1).forEach(s => s.dispose());
  doc.getRoot().listNodes().forEach(n => { if (!n.getMesh() && !roots.includes(n) && n.listChildren().length === 0 && !n.getParentNode()) n.dispose(); });
  await doc.transform(dedup(), prune());
  const f = `${ROOT}/models/kenney/arch_${out}.glb`; await io.write(f, doc);
  console.log(out, models.length, 'models', (fs.statSync(f).size / 1024).toFixed(0) + ' KB');
}
