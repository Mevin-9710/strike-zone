// v43: one GLTF loader setup for the whole game. Models are meshopt-compressed (tools/compress_models.sh, ~2.3x smaller
// download). After decoding, quantized vertex attributes (int8/int16, normalized) are turned back into plain floats, so
// every later step (merging kits, applyMatrix4, collision, sculpted skins) sees the same data as before compression.
// The quantization scale lives in the node transforms, which the scene graph already applies.
import * as THREE from 'three';
import { GLTFLoader } from '../lib/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../lib/addons/libs/meshopt_decoder.module.js';

const KEEP = new Set(['skinIndex']);                                    // integer by nature: the skinning shader reads it as-is
function floatify(geo) {
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.attributes[name];
    if (KEEP.has(name) || (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute)) continue;
    const n = a.count, k = a.itemSize, out = new Float32Array(n * k);
    for (let i = 0; i < n; i++) { out[i * k] = a.getX(i); if (k > 1) out[i * k + 1] = a.getY(i); if (k > 2) out[i * k + 2] = a.getZ(i); if (k > 3) out[i * k + 3] = a.getW(i); }
    geo.setAttribute(name, new THREE.BufferAttribute(out, k));
  }
  geo.computeBoundingBox(); geo.computeBoundingSphere();
}
export function dequantize(root) {
  const seen = new Set();
  root.traverse(o => { if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); floatify(o.geometry); } });
  return root;
}
export function makeLoader() {
  const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
  const load = l.loadAsync.bind(l);
  l.loadAsync = async (url, onProgress) => { const g = await load(url, onProgress); for (const s of g.scenes || [g.scene]) dequantize(s); return g; };
  return l;
}
