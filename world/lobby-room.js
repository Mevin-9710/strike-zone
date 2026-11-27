// v40: the lobby's own fixed backdrop, a small squad ready room. Replaces the frozen last match behind the menu.
// The player's operative stands on a lit pad in the middle; drag to turn them, tap them to make them move.
// Pure Three.js boxes and cylinders (no download), built once and reused.
import * as THREE from 'three';

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0.05, ...o });
function stripes(w, h, a, b, n) {               // small canvas texture: diagonal hazard stripes
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
  g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b;
  for (let i = -h; i < w + h; i += w / n) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + w / n / 2, h); g.lineTo(i + w / n / 2 + h, 0); g.lineTo(i + h, 0); g.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function sky(w, h) {                            // window view: cool sky gradient with soft clouds
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5aa8f5'); gr.addColorStop(1, '#bfe2ff'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.85)';
  for (const [x, y, r] of [[0.2, 0.3, 0.09], [0.28, 0.27, 0.07], [0.7, 0.45, 0.1], [0.8, 0.42, 0.07]]) { g.beginPath(); g.arc(x * w, y * h, r * w, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#7c8aa3'; for (let i = 0; i < 9; i++) { const bw = w * (0.06 + (i % 3) * 0.03), bh = h * (0.18 + ((i * 7) % 5) * 0.06); g.fillRect(i * w / 9, h - bh, bw, bh); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildLobbyRoom() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1e2333);
  const add = (geo, mat, x, y, z, ry = 0, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, ry = 0, shadow = true) => add(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, ry, shadow);

  // shell: light floor, navy back wall, slate side walls, dark ceiling
  box(14, 0.1, 10, M(0xd6dbe2), 0, -0.1, -1, 0, false);
  for (let i = -6; i <= 6; i += 2) box(0.04, 0.012, 10, M(0xb9c0ca), i, 0, -1, 0, false);           // floor tile seams
  box(14, 6, 0.2, M(0x232a3e), 0, 0, -5);
  box(0.2, 6, 10, M(0x2c3550), -6.2, 0, -1); box(0.2, 6, 10, M(0x2c3550), 6.2, 0, -1);
  box(14, 0.2, 10, M(0x161b29), 0, 4.2, -1, 0, false);
  box(14, 0.5, 0.06, new THREE.MeshStandardMaterial({ map: stripes(512, 32, '#ffd23b', '#1e2333', 16), roughness: 0.7 }), 0, 0.15, -4.88, 0, false);   // hazard band
  // window to the city, team banners, ceiling light strips
  const win = add(new THREE.PlaneGeometry(4.2, 2.1), new THREE.MeshBasicMaterial({ map: sky(512, 256) }), -2.6, 2.4, -4.88, 0, false); win.receiveShadow = false;
  box(4.5, 0.14, 0.2, M(0x3a4460), -2.6, 1.28, -4.8); box(4.5, 0.14, 0.2, M(0x3a4460), -2.6, 3.45, -4.8);
  box(1.0, 2.6, 0.06, M(0x2f6bff, { roughness: 0.6 }), 2.2, 1.3, -4.86); box(1.0, 2.6, 0.06, M(0xe3141b, { roughness: 0.6 }), 3.6, 1.3, -4.86);
  box(0.5, 0.5, 0.07, M(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.4 }), 2.2, 3.1, -4.84); box(0.5, 0.5, 0.07, M(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.4 }), 3.6, 3.1, -4.84);
  for (const x of [-3, 0, 3]) box(2.2, 0.06, 0.3, M(0xffffff, { emissive: 0xeaf4ff, emissiveIntensity: 1.2 }), x, 4.12, -1, 0, false);
  // weapon rack (left) and supply crates (right): warm accents against the cool room
  box(2.6, 2.2, 0.5, M(0x3a4460), -4.6, 0, -4.4);
  for (let i = 0; i < 4; i++) { box(0.12, 1.1, 0.12, M(0x1b1f2b), -5.5 + i * 0.6, 0.6, -4.05); box(0.3, 0.18, 0.18, M(0xe07a2e), -5.5 + i * 0.6, 1.55, -4.05); }
  box(1.1, 0.9, 1.1, M(0xe07a2e), 4.4, 0, -3.4, 0.2); box(0.9, 0.7, 0.9, M(0x3e9a5a), 4.5, 0.9, -3.4, -0.15); box(1.0, 0.8, 1.0, M(0x3e9a5a), 5.2, 0, -2.0, 0.5);
  box(0.9, 0.06, 0.9, new THREE.MeshStandardMaterial({ map: stripes(64, 64, '#ffd23b', '#1e2333', 3) }), 4.4, 0.9, -3.4, 0.2, false);
  box(1.6, 0.8, 0.7, M(0x4a556f), -4.4, 0, -1.2, 0.35);                                              // bench
  // the pad the operative stands on: dark disc with a cyan rim
  add(new THREE.CylinderGeometry(1.1, 1.2, 0.16, 40), M(0x262c3d, { roughness: 0.5 }), 0, 0.08, 0);
  const rim = add(new THREE.TorusGeometry(1.12, 0.035, 8, 64), new THREE.MeshBasicMaterial({ color: 0x36d6f0 }), 0, 0.17, 0, 0, false); rim.rotation.x = Math.PI / 2;

  // light: soft fill, warm key from front-left with shadows, cool rim from behind
  scene.add(new THREE.HemisphereLight(0xeef4ff, 0x4a4a58, 1.5));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.4); key.position.set(-3, 6, 5); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -3, near: 1, far: 20 }); key.shadow.bias = -0.0008;
  scene.add(key, key.target);
  const rimL = new THREE.PointLight(0x7fd8ff, 6, 8, 2); rimL.position.set(1.5, 2.6, -2); scene.add(rimL);

  const cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 60);
  const spot = new THREE.Vector3(0, 0.16, 0);
  const room = {
    scene, cam, spot, faceYaw: 0.25, on: false,
    frame(aspect) {                               // keep the operative centred and full height on any screen shape
      cam.aspect = aspect; const narrow = aspect < 1.2;
      cam.fov = narrow ? 58 : 40; cam.position.set(0, 1.6, narrow ? 6.4 : 6.6); cam.lookAt(0, narrow ? 1.2 : 1.0, 0); cam.updateProjectionMatrix();
    },
  };
  room.frame(16 / 9);
  return room;
}
