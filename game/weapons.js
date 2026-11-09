// Weapon stats and the first-person viewmodel (arms + gun, own scene/camera, procedural animation).
import * as THREE from 'three';

// rpm: rounds per minute; dmg: body damage; head: headshot multiplier; spread: radians (hip, standing);
// move: extra spread while running; recoil: camera kick per shot (rad); reload: seconds; zoom: ADS fov.
export const WEAPONS = {
  vex_p9:        { name: 'Vex P9',     cls: 'pistol',      auto: false, rpm: 420, dmg: 26, head: 3.0, mag: 15, reserve: 60,  reload: 1.4, spread: 0.010, move: 0.020, recoil: 0.012, zoom: 60, range: 60 },
  harrow_45:     { name: 'Harrow .45', cls: 'pistol',      auto: false, rpm: 320, dmg: 38, head: 3.0, mag: 9,  reserve: 45,  reload: 1.6, spread: 0.012, move: 0.022, recoil: 0.020, zoom: 60, range: 60 },
  bulldog_r6:    { name: 'Bulldog R6', cls: 'revolver',    auto: false, rpm: 130, dmg: 64, head: 2.5, mag: 6,  reserve: 30,  reload: 2.3, spread: 0.008, move: 0.030, recoil: 0.045, zoom: 58, range: 80 },
  ar7_lance:     { name: 'AR-7 Lance', cls: 'assault',     auto: true,  rpm: 620, dmg: 28, head: 3.0, mag: 30, reserve: 120, reload: 2.0, spread: 0.006, move: 0.030, recoil: 0.010, zoom: 55, range: 120 },
  kestrel_bp:    { name: 'Kestrel',    cls: 'assault',     auto: true,  rpm: 760, dmg: 24, head: 3.0, mag: 30, reserve: 120, reload: 2.2, spread: 0.008, move: 0.026, recoil: 0.008, zoom: 55, range: 100 },
  warden_br:     { name: 'Warden',     cls: 'assault',     auto: false, rpm: 380, dmg: 44, head: 2.6, mag: 20, reserve: 80,  reload: 2.4, spread: 0.004, move: 0.034, recoil: 0.022, zoom: 45, range: 140 },
  grinder_lmg:   { name: 'Grinder',    cls: 'machine gun', auto: true,  rpm: 680, dmg: 26, head: 2.5, mag: 100, reserve: 200, reload: 4.0, spread: 0.014, move: 0.045, recoil: 0.009, zoom: 60, range: 110 },
  hailstorm_mg:  { name: 'Hailstorm',  cls: 'machine gun', auto: true,  rpm: 900, dmg: 20, head: 2.5, mag: 60, reserve: 180, reload: 3.2, spread: 0.016, move: 0.040, recoil: 0.007, zoom: 60, range: 90 },
  longshot_bolt: { name: 'Longshot',   cls: 'sniper',      auto: false, rpm: 48,  dmg: 110, head: 2.5, mag: 5, reserve: 25,  reload: 3.0, spread: 0.050, move: 0.080, recoil: 0.060, zoom: 24, range: 250, scope: true, bolt: true },
  javelin_amr:   { name: 'Javelin',    cls: 'sniper',      auto: false, rpm: 40,  dmg: 150, head: 2.0, mag: 5, reserve: 20,  reload: 3.4, spread: 0.060, move: 0.090, recoil: 0.080, zoom: 16, range: 300, scope: true },
};
export const PRIMARIES = ['ar7_lance', 'kestrel_bp', 'warden_br', 'grinder_lmg', 'hailstorm_mg', 'longshot_bolt', 'javelin_amr'];
export const SIDEARMS = ['vex_p9', 'harrow_45', 'bulldog_r6'];
export const isPistol = id => SIDEARMS.includes(id);

// ---------- shared textures ----------
function starTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,230,1)'); grd.addColorStop(0.25, 'rgba(255,220,120,0.9)'); grd.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = grd; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, r = i % 2 ? 10 : 32; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let STAR = null;
export const starTex = () => (STAR ??= starTexture());

// Measure a weapon model (barrel along +Z, grip at the origin) once: muzzle, top of the sights, magazine.
export function weaponInfo(scene) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const mag = scene.getObjectByName('mag');
  const magBox = mag ? new THREE.Box3().setFromObject(mag) : null;
  return {
    box, length: box.max.z - box.min.z,
    muzzle: new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y + (box.max.y - box.min.y) * 0.62, box.max.z),
    top: box.max.y, magCenter: magBox ? magBox.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, -0.08, box.max.z * 0.3),
    fore: new THREE.Vector3(0, -0.02, Math.min(box.max.z * 0.55, 0.42)),
  };
}

// ---------- first-person viewmodel ----------
const ARM_COL = 0x26324a, GLOVE_COL = 0x1b1f26, CUFF_COL = 0xffd23b;
function armMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: ARM_COL });
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.5), mat); sleeve.position.z = -0.25;
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.095, 0.035), new THREE.MeshLambertMaterial({ color: CUFF_COL })); cuff.position.z = -0.03;
  const glove = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.06, 0.09), new THREE.MeshLambertMaterial({ color: GLOVE_COL })); glove.position.z = 0.03;
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.05), glove.material); thumb.position.set(0.035, 0.02, 0.05);
  g.add(sleeve, cuff, glove, thumb);
  g.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingSphere(); } });
  return g;   // local +Z points from elbow to hand; origin at the hand
}

export class Viewmodel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.scene.add(this.camera);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x555566, 1.6); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6); this.sun.position.set(0.5, 1, 0.6); this.scene.add(this.sun);
    this.root = new THREE.Group(); this.camera.add(this.root);         // follows camera space
    this.gunHolder = new THREE.Group(); this.gunHolder.scale.setScalar(0.8); this.root.add(this.gunHolder);
    this.armR = armMesh(); this.armL = armMesh(); this.root.add(this.armR, this.armL);
    this.flash = new THREE.Group();
    const fm = new THREE.MeshBasicMaterial({ map: starTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), fm); p.rotation.set(i === 0 ? 0 : Math.PI / 2, i === 2 ? Math.PI / 2 : 0, 0); this.flash.add(p); }
    this.flashLight = new THREE.PointLight(0xffc070, 0, 2.5, 2); this.flash.add(this.flashLight);
    this.flash.visible = false;
    this.shells = []; this.shellGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.025, 6); this.shellMat = new THREE.MeshLambertMaterial({ color: 0xd9a63a });
    this.models = {};                      // id -> { scene, info }
    this.cur = null; this.id = null;
    this.kick = { z: 0, vz: 0, p: 0, vp: 0, r: 0, vr: 0 };
    this.sway = new THREE.Vector2(); this.bob = 0; this.ads = 0;
    this.reloadT = -1; this.reloadDur = 1; this.drawT = 1; this.flashT = 0; this.jolt = 0; this.boltT = -1;
    this.magEvents = []; this.gestT = -1;
  }
  register(id, gltfScene) {
    const s = gltfScene.clone(true);
    s.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.material = o.material.clone(); } });
    this.models[id] = { scene: s, info: weaponInfo(s) };
  }
  equip(id) {
    if (this.cur) this.gunHolder.remove(this.cur.scene);
    this.id = id; this.cur = this.models[id] || null; this.drawT = 0; this.reloadT = -1; this.boltT = -1;
    if (!this.cur) return;
    const s = this.cur.scene; s.rotation.set(0, Math.PI, 0); s.position.set(0, 0, 0);
    const mag = s.getObjectByName('mag'); if (mag) { mag.userData.home ??= mag.position.clone(); mag.position.copy(mag.userData.home); mag.visible = true; }
    this.gunHolder.add(s);
    // muzzle flash at the barrel tip (gun local space is rotated 180° about Y)
    const m = this.cur.info.muzzle; this.flash.position.set(-m.x, m.y, -m.z - 0.04);
    this.gunHolder.add(this.flash);
  }
  setAspect(a) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }
  fire(stats) {
    const k = this.kick, strong = stats.cls === 'sniper' ? 2.6 : stats.cls === 'revolver' ? 1.8 : 1;
    k.vz += 1.6 * strong; k.vp += 3.0 * strong + Math.random(); k.vr += (Math.random() - 0.5) * 3 * strong;
    this.flash.visible = true; this.flashT = 0.05; this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.6 * (stats.cls === 'pistol' ? 0.7 : 1));
    this.flashLight.intensity = 6;
    if (stats.bolt) this.boltT = 0.15; else this.ejectShell();
  }
  ejectShell() {
    if (!this.cur) return;
    let s = this.shells.find(x => !x.m.visible);
    if (!s) { s = { m: new THREE.Mesh(this.shellGeo, this.shellMat), v: new THREE.Vector3(), w: new THREE.Vector3() }; this.root.add(s.m); this.shells.push(s); }
    s.m.visible = true; s.t = 0;
    const p = this.gunHolder.position;
    s.m.position.set(p.x + 0.02, p.y + 0.05, p.z - Math.min(0.2, this.cur.info.length * 0.25));
    s.v.set(0.9 + Math.random() * 0.4, 1.0 + Math.random() * 0.5, 0.2 + Math.random() * 0.2);
    s.w.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
  }
  click() { this.jolt = 1; }
  gesture() { this.gestT = 0; }        // off-hand throw / deploy for abilities
  startReload(dur) { this.reloadT = 0; this.reloadDur = dur; this.magEvents = []; }
  cancelReload() { this.reloadT = -1; if (this.cur) { const mag = this.cur.scene.getObjectByName('mag'); if (mag) { mag.position.copy(mag.userData.home); mag.visible = true; } } }
  // returns 'out'/'in' events for sounds
  update(dt, { moving = false, speed = 0, lookDX = 0, lookDY = 0, adsTarget = 0, sprint = false, onGround = true, scope = false }) {
    const events = [];
    const k = this.kick;
    // springs back to rest
    for (const [x, v, stiff, damp] of [['z', 'vz', 160, 16], ['p', 'vp', 140, 14], ['r', 'vr', 120, 12]]) {
      k[v] += (-k[x] * stiff - k[v] * damp) * dt; k[x] += k[v] * dt;
    }
    this.ads += (adsTarget - this.ads) * Math.min(1, dt * 14);
    this.sway.x += (-lookDX * 0.0025 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (lookDY * 0.0025 - this.sway.y) * Math.min(1, dt * 10);
    if (moving && onGround) this.bob += dt * speed * 1.9; else this.bob += (Math.round(this.bob / Math.PI) * Math.PI - this.bob) * Math.min(1, dt * 6);
    this.drawT = Math.min(1, this.drawT + dt / 0.45);
    this.flashT -= dt; if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; }
    this.jolt = Math.max(0, this.jolt - dt * 8);
    if (!this.cur) return events;
    const info = this.cur.info, pistol = info.length < 0.4;
    const hip = pistol ? new THREE.Vector3(0.16, -0.17, -0.42) : new THREE.Vector3(0.19, -0.2, -0.46);
    const aim = new THREE.Vector3(0, -info.top * 0.8 - 0.01, pistol ? -0.42 : -0.34);
    const pos = hip.clone().lerp(aim, this.ads);
    const bobAmt = (1 - this.ads * 0.85) * (sprint ? 1.6 : 1);
    pos.x += Math.sin(this.bob) * 0.012 * bobAmt + this.sway.x * (1 - this.ads * 0.7);
    pos.y += -Math.abs(Math.cos(this.bob)) * 0.01 * bobAmt + this.sway.y * (1 - this.ads * 0.7) - (onGround ? 0 : 0.015);
    pos.z += k.z * 0.012 + this.jolt * 0.006;
    let rx = k.p * 0.02 + this.jolt * 0.04, ry = 0, rz = k.r * 0.01 + (sprint ? 0.25 : 0) * (1 - this.ads);
    // draw / switch
    const d = 1 - Math.pow(1 - this.drawT, 3);
    pos.y -= (1 - d) * 0.3; rx -= (1 - d) * 0.9;
    // reload choreography
    const mag = this.cur.scene.getObjectByName('mag');
    let leftTarget = null;
    if (this.reloadT >= 0) {
      this.reloadT += dt; const t = this.reloadT / this.reloadDur;
      const tilt = Math.sin(Math.min(1, t / 0.2) * Math.PI / 2) * (1 - Math.max(0, (t - 0.85) / 0.15));
      rz += tilt * 0.45; rx += tilt * 0.12; pos.y -= tilt * 0.03; pos.x -= tilt * 0.02;
      if (mag) {
        const home = mag.userData.home;
        if (t < 0.15) mag.position.copy(home);
        else if (t < 0.32) { const u = (t - 0.15) / 0.17; mag.position.set(home.x, home.y - u * u * 0.35, home.z); if (!this.magEvents.includes('out')) { this.magEvents.push('out'); events.push('out'); } }
        else if (t < 0.55) { mag.visible = false; }
        else if (t < 0.78) { mag.visible = true; const u = 1 - (t - 0.55) / 0.23; mag.position.set(home.x, home.y - u * 0.18, home.z); }
        else { mag.position.copy(home); if (!this.magEvents.includes('in')) { this.magEvents.push('in'); events.push('in'); } }
        // left hand rides the magazine
        const mw = mag.getWorldPosition(new THREE.Vector3()); this.root.worldToLocal(mw);
        if (t > 0.12 && t < 0.88) leftTarget = mw.add(new THREE.Vector3(0, t > 0.32 && t < 0.55 ? -0.25 : -0.03, 0));
      } else if (!this.magEvents.includes('out') && t > 0.3) { this.magEvents.push('out'); events.push('out'); }
      else if (!this.magEvents.includes('in') && t > 0.8) { this.magEvents.push('in'); events.push('in'); }
      if (t >= 1) { this.reloadT = -1; if (mag) { mag.position.copy(mag.userData.home); mag.visible = true; } }
    }
    if (this.boltT >= 0) { this.boltT += dt; const u = Math.sin(Math.min(1, (this.boltT - 0.15) / 0.5) * Math.PI); if (this.boltT > 0.15) { rz -= u * 0.25; pos.y -= u * 0.02; } if (this.boltT > 0.65) this.boltT = -1; if (Math.abs(this.boltT - 0.4) < dt) events.push('bolt'); }
    if (this.gestT >= 0) {
      this.gestT += dt / 0.55; const u = Math.sin(Math.min(1, this.gestT) * Math.PI);
      pos.y -= u * 0.08; pos.x += u * 0.04; rz -= u * 0.3; rx -= u * 0.15;
      leftTarget = new THREE.Vector3(-0.12 + u * 0.05, -0.16 + u * 0.12, -0.32 - u * 0.22 * Math.min(1, this.gestT * 1.4));
      if (this.gestT >= 1) this.gestT = -1;
    }
    this.gunHolder.position.copy(pos); this.gunHolder.rotation.set(rx, ry, rz);
    this.gunHolder.visible = !scope; this.armR.visible = this.armL.visible = !scope;
    // arms: right hand on the grip, left on the foregrip (or the magazine while reloading)
    this.gunHolder.updateMatrix();
    const grip = new THREE.Vector3(0, -0.03, 0.01).applyMatrix4(this.gunHolder.matrix);
    const fore = pistol ? new THREE.Vector3(-0.02, -0.05, 0.0).applyMatrix4(this.gunHolder.matrix)
                        : new THREE.Vector3(-info.fore.x, info.fore.y - 0.03, -info.fore.z).applyMatrix4(this.gunHolder.matrix);
    const leftHand = leftTarget || fore;
    this.placeArm(this.armR, grip, new THREE.Vector3(0.34, -0.42, 0.15));
    this.placeArm(this.armL, leftHand, new THREE.Vector3(-0.32, -0.45, 0.1));
    // shells
    for (const s of this.shells) {
      if (!s.m.visible) continue;
      s.t += dt; s.v.y -= 9 * dt; s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += s.w.x * dt; s.m.rotation.y += s.w.y * dt;
      if (s.t > 0.7) s.m.visible = false;
    }
    return events;
  }
  placeArm(arm, hand, elbow) {
    arm.position.copy(hand);
    const dir = hand.clone().sub(elbow);
    // local +Z from elbow toward hand (positions are in root space, so build the rotation directly)
    arm.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(hand.clone().add(dir), hand, new THREE.Vector3(0, 1, 0)));
    const len = dir.length();
    arm.children[0].scale.z = len / 0.5; arm.children[0].position.z = -len / 2;
  }
  muzzleWorld(out = new THREE.Vector3()) {
    // muzzle in viewmodel camera space -> direction from camera usable for the main camera
    this.flash.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.flash.matrixWorld);
  }
}
