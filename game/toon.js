// Runtime toon look: banded toon shading, inverted-hull ink outlines, optional rim light.
// Works on the existing models/textures; nothing is re-rendered.
import * as THREE from 'three';

let GRAD = null;
function gradient() {
  if (GRAD) return GRAD;
  const d = new Uint8Array([90, 170, 235, 255]);          // 4 light bands: shadow, mid, lit, highlight
  GRAD = new THREE.DataTexture(d, d.length, 1, THREE.RedFormat);
  GRAD.minFilter = GRAD.magFilter = THREE.NearestFilter; GRAD.needsUpdate = true;
  return GRAD;
}

const cache = new WeakMap();
function toonMat(m, rim) {
  const key = rim ? 'rim' : 'plain';
  let per = cache.get(m); if (!per) { per = {}; cache.set(m, per); }
  if (per[key]) return per[key];
  const t = new THREE.MeshToonMaterial({
    color: m.color?.clone() ?? new THREE.Color(0xffffff), map: m.map ?? null, vertexColors: m.vertexColors,
    emissive: m.emissive?.clone() ?? new THREE.Color(0), emissiveMap: m.emissiveMap ?? null, emissiveIntensity: m.emissiveIntensity ?? 1,
    transparent: m.transparent, opacity: m.opacity, side: m.side, alphaTest: m.alphaTest, depthWrite: m.depthWrite,
    gradientMap: gradient(), name: m.name,
  });
  // keep the painted look bright: lambert/standard maps were authored for softer shading
  t.color.multiplyScalar(m.isMeshStandardMaterial ? 1.08 : 1.0);
  if (rim) {
    t.onBeforeCompile = sh => {
      sh.uniforms.rimColor = { value: new THREE.Color(rim) };
      sh.fragmentShader = 'uniform vec3 rimColor;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
        `float rimF = 1.0 - max(dot(normalize(vViewPosition), normal), 0.0);
         gl_FragColor.rgb += rimColor * smoothstep(0.82, 0.97, rimF) * 0.22;
         #include <dithering_fragment>`);
    };
    t.customProgramCacheKey = () => 'rim' + rim;
  }
  per[key] = t; return t;
}
const skip = m => !m || m.isMeshBasicMaterial || m.isMeshToonMaterial || m.isLineBasicMaterial || m.isSpriteMaterial ||
  m.blending === THREE.AdditiveBlending || m.userData?.noToon || m.wireframe;

// Swap materials under `root` to toon. opts.rim: hex colour for a rim light (enemies).
export function toonify(root, { rim = null } = {}) {
  root.traverse(o => {
    if (!o.isMesh || o.userData.outline) return;
    if (Array.isArray(o.material)) o.material = o.material.map(m => skip(m) ? m : toonMat(m, rim));
    else if (!skip(o.material)) o.material = toonMat(o.material, rim);
  });
  return root;
}

// Ink outline: a back-face copy pushed out along the normals (skinned meshes keep their skeleton).
const outlineMats = new Map();
function outlineMat(thick, color) {
  const k = thick + ':' + color; if (outlineMats.has(k)) return outlineMats.get(k);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${thick.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => 'ol' + k;
  m.userData.noToon = true;
  outlineMats.set(k, m); return m;
}
export const OUTLINES = false;   // ink outlines disabled; flip to true to bring them back
export function outline(root, { thick = 0.02, color = 0x111111 } = {}) {
  if (!OUTLINES) return root;
  const add = [];
  root.traverse(o => {
    if (!o.isMesh || o.userData.outline || o.userData.hasOutline || !o.geometry?.attributes?.normal) return;
    if (o.material?.transparent || o.material?.blending === THREE.AdditiveBlending) return;
    // thickness in world units: compensate for the mesh's own scale
    const s = new THREE.Vector3(); o.getWorldScale(s); const k = thick / Math.max(1e-3, (s.x + s.y + s.z) / 3);
    const ol = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, outlineMat(k, color)) : new THREE.Mesh(o.geometry, outlineMat(k, color));
    if (o.isSkinnedMesh) ol.bind(o.skeleton, o.bindMatrix);
    ol.userData.outline = true; ol.frustumCulled = false; ol.castShadow = false; ol.renderOrder = o.renderOrder;
    o.userData.hasOutline = true; add.push([o, ol]);
  });
  for (const [o, ol] of add) {
    if (o.isSkinnedMesh) { o.parent.add(ol); ol.position.copy(o.position); ol.quaternion.copy(o.quaternion); ol.scale.copy(o.scale); }
    else o.add(ol);
  }
  return root;
}
