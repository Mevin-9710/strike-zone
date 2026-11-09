// Strike Zone ability effects. Procedural, low-poly, flat-shaded, no textures.
// Usage:
//   const fx = new AbilityFX(scene, { onFlash: strength => {...} });
//   fx.spawn('smoke', { hand, forward, root, template, clips });   // at the animation's release frame
//   fx.update(dt);                                                  // every frame
// Coordinates: three.js, Y up, character forward = `forward` (unit Vector3 on the ground plane).
import * as THREE from 'three';
import * as SkeletonUtils from '../lib/addons/utils/SkeletonUtils.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = t => Math.min(1, Math.max(0, t));
const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
const easeIn = t => Math.pow(clamp01(t), 2);
const easeOutBack = t => { t = clamp01(t); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const rand = (a, b) => a + Math.random() * (b - a);

const COL = { civic: 0x3aa0ff, cyan: 0x5fe6ff, smoke: 0xc7ccd4, white: 0xffffff, lock: 0x3ddc84, warm: 0xffd27a };

function glow(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}
function solid(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7, metalness: 0.2, ...opts });
}

// Stand-in for a PointLight: same fields, no lighting cost. Adding/removing real lights at runtime forces every
// material in the scene to recompile (a long freeze on weak GPUs), so effects glow through their own sprites.
class GlowLight extends THREE.Object3D {
  constructor(color = 0xffffff, intensity = 1, distance = 0, decay = 2) { super(); this.isFakeLight = true; this.color = new THREE.Color(color); this.intensity = intensity; this.distance = distance; this.decay = decay; }
}
export class AbilityFX {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.items = [];
    this.onFlash = opts.onFlash || (() => {});
    this.groundY = opts.groundY ?? 0;
    // Game hooks: ground(x, z, y) -> floor height under a point; collide(a, b) -> {point, normal} | null;
    // onEvent(kind, data) fires when an effect starts acting on gameplay (cloud bloomed, burst popped, ...).
    this.ground = opts.ground || (() => this.groundY);
    this.collide = opts.collide || null;
    this.onEvent = opts.onEvent || (() => {});
  }
  floorAt(p) { const g = this.ground(p.x, p.z, p.y); return Number.isFinite(g) ? g : this.groundY; }

  update(dt) {
    // Effects may spawn follow-up effects while updating (canister -> cloud, fuse -> burst, shield -> shards),
    // so iterate a snapshot and let new items land in the fresh list.
    const cur = this.items; this.items = [];
    for (const it of cur) {
      it.t += dt;
      if (it.update(dt, it.t)) this.items.push(it);
      else it.dispose?.();
    }
  }

  add(update, dispose) { const it = { t: 0, update, dispose }; this.items.push(it); return it; }

  // Remove meshes and free their geometry/materials.
  drop(...objs) {
    for (const o of objs) {
      if (!o) continue;
      o.parent?.remove(o);
      o.traverse?.(c => { c.geometry?.dispose?.(); if (c.material && !c.material.userData?.shared) c.material.dispose?.(); });
    }
  }

  // Ballistic throw with ground bounces; calls onRest(position) once it settles.
  throwArc(mesh, from, vel, { radius = 0.05, bounce = 0.35, friction = 0.6, spin = 8, maxAir = 3, onRest }) {
    mesh.position.copy(from); this.scene.add(mesh);
    const v = vel.clone(); const g = -14; let rested = false, rest = 0;
    const axis = V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
    this.add((dt, t) => {
      if (rested) return false;
      v.y += g * dt;
      const prev = mesh.position.clone(); mesh.position.addScaledVector(v, dt);
      if (this.collide) {
        const hit = this.collide(prev, mesh.position);
        if (hit && hit.normal.y < 0.5) { mesh.position.copy(hit.point).addScaledVector(hit.normal, radius + 0.02); const vn = v.dot(hit.normal); v.addScaledVector(hit.normal, -(1 + bounce) * vn); v.multiplyScalar(friction); }
      }
      mesh.rotateOnAxis(axis, spin * dt * (v.length() / 6));
      const floor = this.floorAt(mesh.position) + radius;
      if (mesh.position.y <= floor) {
        mesh.position.y = floor;
        if (Math.abs(v.y) > 1.2) { v.y = -v.y * bounce; v.x *= friction; v.z *= friction; }
        else { v.y = 0; v.x *= Math.pow(0.02, dt); v.z *= Math.pow(0.02, dt); rest += dt; }
      }
      if (rest > 0.15 || t > maxAir) { rested = true; onRest?.(mesh.position.clone()); return false; }
      return true;
    });
  }

  spawn(kind, ctx) {
    const f = { smoke: this.smoke, flash: this.flash, decoy: this.decoy, sensor: this.sensor, shield: this.shield,
                dash: this.dash, lockdown: this.lockdown, drone: this.drone }[kind];
    if (!f) throw new Error(`unknown ability fx: ${kind}`);
    f.call(this, ctx);
  }

  // ---------------------------------------------------------------- SMOKE
  smoke({ hand, forward }) {
    const can = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8), solid(0x2b2f36));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.03, 8), glow(COL.civic));
    can.add(body, band);
    const vel = forward.clone().multiplyScalar(4.4).add(V(0, 4.2, 0));
    this.throwArc(can, hand, vel, { radius: 0.045, onRest: p => this.smokeCloud(p, can) });
  }

  smokeCloud(pos, canister) {
    const puffs = [];
    const N = 34, R = 2.6, HOLD = 6.5, FADE = 1.6;
    this.onEvent('smoke', { pos: pos.clone(), radius: R + 0.4, life: HOLD + FADE * 0.5 });
    for (let i = 0; i < N; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1),
        new THREE.MeshLambertMaterial({ color: COL.smoke, emissive: 0x7d838c, flatShading: true, transparent: true, opacity: 0, depthWrite: false }));
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * R * 0.85;
      const target = V(Math.cos(a) * r, rand(0.3, 1.0) + (1 - r / R) * 1.4, Math.sin(a) * r);
      const size = rand(0.75, 1.35) * (1.15 - r / R * 0.35);
      m.position.copy(pos); m.scale.setScalar(0.05);
      m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      puffs.push({ m, target, size, delay: rand(0, 0.5), spin: V(rand(-.2, .2), rand(-.3, .3), rand(-.2, .2)), drift: rand(0.6, 1.4) });
      this.scene.add(m);
    }
    // a short jet from the canister before the cloud blooms
    this.add((dt, t) => {
      for (const p of puffs) {
        const k = easeOut((t - p.delay) / 1.4);
        p.m.position.lerpVectors(pos, pos.clone().add(p.target), k);
        p.m.position.y += Math.sin(t * p.drift + p.delay * 9) * 0.06;
        const breathe = 1 + Math.sin(t * 0.9 + p.delay * 7) * 0.05;
        const end = clamp01((t - HOLD) / FADE);
        p.m.scale.setScalar(Math.max(0.05, p.size * k * breathe * (1 + end * 0.35)));
        p.m.rotation.x += p.spin.x * dt; p.m.rotation.y += p.spin.y * dt; p.m.rotation.z += p.spin.z * dt;
        p.m.material.opacity = 0.78 * clamp01((t - p.delay) * 3) * (1 - end);
      }
      if (canister) canister.rotation.y += dt * 0.5;
      return t < HOLD + FADE;
    }, () => this.drop(...puffs.map(p => p.m), canister));
  }

  // ---------------------------------------------------------------- FLASH
  flash({ hand, forward }) {
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), glow(COL.white));
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), solid(0x9aa3b5));
    orb.add(core);
    orb.position.copy(hand); this.scene.add(orb);
    const v = forward.clone().multiplyScalar(10).add(V(0, 2.8, 0));
    const FUSE = 0.38;
    this.add((dt, t) => {
      v.y -= 14 * dt; orb.position.addScaledVector(v, dt);
      orb.material.opacity = 0.6 + 0.4 * Math.sin(t * 60);       // fizzing before it pops
      if (t >= FUSE) { this.flashBurst(orb.position.clone()); return false; }
      return true;
    }, () => this.drop(orb));
  }

  flashBurst(p) {
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), glow(COL.white));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 4, 32), glow(COL.warm));
    const spikes = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 1), glow(COL.white, 0.9));
      s.position.z = 0.5; const holder = new THREE.Group(); holder.add(s);
      holder.rotation.set(rand(-Math.PI, Math.PI), rand(-Math.PI, Math.PI), 0);
      spikes.add(holder);
    }
    const light = new GlowLight(0xffffff, 0, 14, 2);
    for (const o of [ball, ring, spikes, light]) { o.position.copy(p); this.scene.add(o); }
    ring.lookAt(p.clone().add(V(0, 1, 0)));
    this.onFlash(1, p.clone());
    this.onEvent('flash', { pos: p.clone(), radius: 16 });
    this.add((dt, t) => {
      const a = easeOut(t / 0.12), fade = clamp01((t - 0.08) / 0.45);
      ball.scale.setScalar(0.15 + 0.75 * a); ball.material.opacity = 0.9 * (1 - clamp01((t - 0.04) / 0.25));
      ring.scale.setScalar(0.3 + 5 * easeOut(t / 0.4)); ring.material.opacity = 1 - clamp01(t / 0.4);
      spikes.scale.setScalar(0.2 + 2.6 * easeOut(t / 0.18));
      spikes.children.forEach(h => h.children[0].material.opacity = 0.9 * (1 - clamp01(t / 0.3)));
      spikes.rotation.y += dt * 2;
      light.intensity = 90 * (1 - fade);
      return t < 0.6;
    }, () => this.drop(ball, ring, spikes, light));
  }

  // ---------------------------------------------------------------- DECOY
  decoy({ hand, forward, template, clips }) {
    const puck = new THREE.Group();
    puck.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 10), solid(0x2b2f36)));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 4, 16), glow(COL.cyan)); rim.rotation.x = Math.PI / 2;
    puck.add(rim);
    const start = V(hand.x, Math.max(hand.y, 0.25), hand.z);
    const vel = forward.clone().multiplyScalar(5.5).add(V(0, 0.8, 0));
    this.throwArc(puck, start, vel, { radius: 0.02, bounce: 0.15, friction: 0.9, spin: 0, maxAir: 2.5,
      onRest: p => this.hologram(p, forward, template, clips, puck) });
  }

  hologram(pos, forward, template, clips, puck) {
    if (!template) { this.drop(puck); return; }
    const holo = SkeletonUtils.clone(template);
    const mat = new THREE.MeshBasicMaterial({ color: 0x2aa8d8, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
    const wire = new THREE.MeshBasicMaterial({ color: COL.cyan, wireframe: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    const meshes = []; holo.traverse(o => { if (o.isMesh && o.visible) meshes.push(o); });
    for (const o of meshes) {
      o.material = mat; o.frustumCulled = false;
      const w = o.clone(); w.material = wire; o.parent.add(w);
    }
    holo.position.copy(pos); holo.position.y = this.floorAt(pos);
    this.onEvent('decoy', { obj: holo, life: 4.5 });
    holo.rotation.y = Math.atan2(forward.x, forward.z);
    this.scene.add(holo);
    const mixer = new THREE.AnimationMixer(holo);
    const walk = clips?.find(c => c.name === 'walk');
    if (walk) mixer.clipAction(walk).play();
    const scan = new THREE.Mesh(new THREE.RingGeometry(0.0, 0.45, 24), glow(COL.cyan, 0.5)); scan.rotation.x = -Math.PI / 2;
    scan.position.copy(pos); scan.position.y = holo.position.y + 0.01; this.scene.add(scan);
    const LIFE = 4.5;
    this.add((dt, t) => {
      mixer.update(dt);
      const on = easeOut(t / 0.35), off = clamp01((t - (LIFE - 0.4)) / 0.4);
      holo.scale.set(1, Math.max(0.001, on * (1 - off)), 1);
      if (t > 0.35 && t < LIFE - 0.4) {                                  // walks forward like a real operative
        const nx = holo.position.clone().addScaledVector(forward, 1.35 * dt);
        const hit = this.collide?.(holo.position.clone().setY(holo.position.y + 0.5), nx.clone().setY(nx.y + 0.5).addScaledVector(forward, 0.3));
        if (!hit) holo.position.copy(nx);
      }
      const flicker = Math.random() < 0.06 ? 0.15 : 1;
      mat.opacity = 0.3 * flicker * (1 - off); wire.opacity = 0.22 * flicker * (1 - off);
      scan.scale.setScalar(1 + 0.15 * Math.sin(t * 8)); scan.material.opacity = 0.5 * (1 - off);
      puck.children[1].material.opacity = 0.6 + 0.4 * Math.sin(t * 10);
      return t < LIFE;
    }, () => { mixer.stopAllAction(); this.drop(holo, scan, puck); mat.dispose(); wire.dispose(); });
  }

  // ---------------------------------------------------------------- SENSOR
  sensor({ hand, forward }) {
    const pos = V(hand.x, 0, hand.z).addScaledVector(forward, 0.1); pos.y = this.floorAt(V(pos.x, hand.y, pos.z));
    const g = new THREE.Group(); g.position.copy(pos); this.scene.add(g);
    this.onEvent('sensor', { pos: pos.clone(), radius: 8, life: 4.6 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.05, 8), solid(0x2b2f36)); base.position.y = 0.025;
    const prongs = [];
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.02), solid(0x6b7384));
      const a = i * Math.PI * 2 / 3; p.position.set(Math.cos(a) * 0.07, 0.05, Math.sin(a) * 0.07); p.scale.y = 0.01;
      prongs.push(p); g.add(p);
    }
    const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), glow(COL.civic)); eye.position.y = 0.09;
    g.add(base, eye);
    const pulses = [];
    const LIFE = 4.6, PERIOD = 1.0, RADIUS = 8;
    let next = 0.35;
    this.add((dt, t) => {
      const dep = easeOutBack(t / 0.3);
      prongs.forEach(p => { p.scale.y = Math.max(0.01, dep); p.position.y = 0.05 + 0.09 * dep; });
      eye.position.y = 0.09 + 0.12 * dep;
      eye.material.opacity = 0.5 + 0.5 * Math.sin(t * 12);
      if (t >= next && t < LIFE - 0.6) {
        next += PERIOD;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.975, 1.0, 64), glow(COL.civic, 0.9));
        ring.rotation.x = -Math.PI / 2; ring.position.set(pos.x, pos.y + 0.02, pos.z);
        const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.6, 48, 1, true), glow(COL.civic, 0.25));
        wall.position.set(pos.x, pos.y + 0.3, pos.z);
        this.scene.add(ring, wall); pulses.push({ ring, wall, t0: t });
      }
      for (const p of pulses) {
        const k = (t - p.t0) / 0.9; const r = 0.2 + RADIUS * easeOut(k);
        p.ring.scale.setScalar(r); p.wall.scale.set(r, 1, r);
        p.ring.material.opacity = 0.9 * (1 - clamp01(k)); p.wall.material.opacity = 0.22 * (1 - clamp01(k));
      }
      const done = pulses.filter(p => t - p.t0 > 0.9); done.forEach(p => this.drop(p.ring, p.wall));
      for (const d of done) pulses.splice(pulses.indexOf(d), 1);
      if (t > LIFE - 0.5) g.scale.setScalar(Math.max(0.001, 1 - (t - (LIFE - 0.5)) / 0.5));
      return t < LIFE;
    }, () => { pulses.forEach(p => this.drop(p.ring, p.wall)); this.drop(g); });
  }

  // ---------------------------------------------------------------- SHIELD
  shield({ root }) {
    const geo = new THREE.IcosahedronGeometry(1.2, 1);
    const shell = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: COL.civic, emissive: COL.civic, emissiveIntensity: 0.6,
      flatShading: true, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: COL.cyan, transparent: true,
      opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    const bubble = new THREE.Group(); bubble.add(shell, edges);
    const light = new GlowLight(COL.civic, 6, 5, 2);
    bubble.add(light);
    this.scene.add(bubble);
    const LIFE = 4.0;
    this.onEvent('shield', { life: LIFE });
    const follow = () => { bubble.position.copy(root.position); bubble.position.y += 1.0; };
    follow();
    this.add((dt, t) => {
      follow();
      const s = easeOutBack(t / 0.35);
      bubble.scale.set(s * 0.9, s * 1.05, s * 0.9);
      bubble.rotation.y += dt * 0.4;
      const ripple = 0.5 + 0.5 * Math.sin(t * 6);
      shell.material.opacity = 0.14 + 0.08 * ripple; edges.material.opacity = 0.55 + 0.4 * ripple;
      if (t >= LIFE) { this.shatter(geo, bubble); return false; }
      return true;
    }, () => this.drop(bubble));
  }

  shatter(geo, ref) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position;
    const mat = glow(COL.cyan, 0.8); mat.side = THREE.DoubleSide;
    const shards = [];
    ref.updateMatrixWorld(true);
    for (let i = 0; i < pos.count; i += 3) {
      const a = V().fromBufferAttribute(pos, i), b = V().fromBufferAttribute(pos, i + 1), c = V().fromBufferAttribute(pos, i + 2);
      const ctr = a.clone().add(b).add(c).divideScalar(3);
      const tri = new THREE.BufferGeometry().setFromPoints([a.sub(ctr), b.sub(ctr), c.sub(ctr)]);
      const m = new THREE.Mesh(tri, mat);
      m.position.copy(ctr.clone().applyMatrix4(ref.matrixWorld));
      m.scale.copy(ref.scale);
      shards.push({ m, v: ctr.clone().normalize().multiplyScalar(rand(2, 4)).add(V(0, rand(0.5, 2), 0)), w: V(rand(-8, 8), rand(-8, 8), rand(-8, 8)) });
      this.scene.add(m);
    }
    this.add((dt, t) => {
      for (const s of shards) {
        s.v.y -= 9 * dt; s.m.position.addScaledVector(s.v, dt);
        s.m.rotation.x += s.w.x * dt; s.m.rotation.y += s.w.y * dt; s.m.rotation.z += s.w.z * dt;
        s.m.scale.multiplyScalar(1 - dt * 1.2);
      }
      mat.opacity = 0.8 * (1 - clamp01(t / 0.7));
      return t < 0.7;
    }, () => { shards.forEach(s => { s.m.parent?.remove(s.m); s.m.geometry.dispose(); }); mat.dispose(); });
  }

  // ---------------------------------------------------------------- DASH
  // Moves `root` forward 3.2 m over the lunge window and leaves holographic afterimages.
  // move:false leaves positioning to the caller (in game the physics moves the player).
  dash({ root, forward, template, move = true }) {
    const start = root.position.clone(), DIST = 3.2, WINDOW = 0.34, BACK_AT = 1.6;
    const ghosts = [], lines = [];
    let lastGhost = -1;
    const ghostMat = glow(COL.civic, 0.45);
    for (let i = 0; i < 16; i++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, rand(0.6, 1.4)), glow(COL.cyan, 0));
      l.userData.off = V(rand(-0.45, 0.45), rand(0.2, 1.7), 0); lines.push(l); this.scene.add(l);
    }
    const dust = [];
    for (let i = 0; i < 8; i++) {
      const d = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshStandardMaterial({ color: 0x8a8f98,
        flatShading: true, transparent: true, opacity: 0.7, depthWrite: false }));
      const a = rand(0, Math.PI * 2); d.position.copy(start).add(V(Math.cos(a) * 0.3, 0.08, Math.sin(a) * 0.3));
      d.userData.v = V(Math.cos(a) * rand(1, 2), rand(0.3, 0.8), Math.sin(a) * rand(1, 2)); dust.push(d); this.scene.add(d);
    }
    const yaw = Math.atan2(forward.x, forward.z);
    this.add((dt, t) => {
      const k = easeOut(t / WINDOW);
      if (move && t <= WINDOW + 0.05) root.position.copy(start).addScaledVector(forward, DIST * k);
      if (template && t < WINDOW && t - lastGhost >= 0.045) {           // snapshot the current pose as an afterimage
        lastGhost = t;
        const g = SkeletonUtils.clone(root);
        g.traverse(o => { if (o.isMesh) { o.material = ghostMat; o.frustumCulled = false; } });
        this.scene.add(g); ghosts.push({ g, t0: t });
      }
      for (const gh of ghosts) {
        const a = clamp01((t - gh.t0) / 0.4);
        gh.g.visible = a < 1; gh.g.scale.setScalar(1 + a * 0.08);
      }
      ghostMat.opacity = 0.45;
      for (const l of lines) {
        const life = clamp01(t / 0.55);
        const behind = root.position.clone().addScaledVector(forward, -0.6 - life * 1.6 - l.userData.off.y * 0.2);
        const side = V(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(l.userData.off.x);
        l.position.copy(behind).add(side); l.position.y = l.userData.off.y; l.rotation.y = yaw;
        l.material.opacity = t < WINDOW ? 0.8 : 0.8 * (1 - clamp01((t - WINDOW) / 0.25));
      }
      for (const d of dust) { d.userData.v.y -= 3 * dt; d.position.addScaledVector(d.userData.v, dt); d.scale.multiplyScalar(1 + dt * 1.5);
        d.material.opacity = 0.7 * (1 - clamp01(t / 0.7)); }
      if (move && t > BACK_AT) {                                                   // viewer convenience: glide back to the start
        const b = easeOut((t - BACK_AT) / 0.6);
        root.position.copy(start).addScaledVector(forward, DIST * (1 - b));
      }
      return t < (move ? BACK_AT + 0.6 : 0.8);
    }, () => { if (move) root.position.copy(start); ghosts.forEach(g => g.g.parent?.remove(g.g)); ghostMat.dispose(); this.drop(...lines, ...dust); });
  }

  // ---------------------------------------------------------------- LOCKDOWN
  lockdown({ hand, root, forward }) {
    const c = V(hand.x, 0, hand.z).addScaledVector(forward, 0.4); c.y = this.floorAt(V(c.x, hand.y, c.z));
    const R = 5, LIFE = 5.5;
    this.onEvent('lockdown', { pos: c.clone(), radius: R, life: LIFE });
    const shock = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 64), glow(COL.lock, 1)); shock.rotation.x = -Math.PI / 2;
    const floor = new THREE.Mesh(new THREE.RingGeometry(R * 0.96, R, 6, 1), glow(COL.lock, 0)); floor.rotation.x = -Math.PI / 2;
    const hex = new THREE.Mesh(new THREE.CircleGeometry(R, 6), glow(COL.lock, 0)); hex.rotation.x = -Math.PI / 2;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 2.4, 6, 1, true), glow(COL.lock, 0));
    const bars = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI * 2 / 12;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.4, 0.06), glow(COL.lock, 0.8));
      b.position.set(Math.cos(a) * R, 1.2, Math.sin(a) * R); bars.add(b);
    }
    const light = new GlowLight(COL.lock, 0, 12, 2); light.position.set(0, 1.5, 0);
    const g = new THREE.Group(); g.position.copy(c); g.add(shock, floor, hex, wall, bars, light);
    shock.position.y = floor.position.y = 0.02; hex.position.y = 0.015; wall.position.y = 1.2;
    this.scene.add(g);
    const debris = [];
    for (let i = 0; i < 10; i++) {
      const d = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.06, 0.12), 0), solid(0x5b6070, { transparent: true }));
      d.position.set(rand(-0.4, 0.4), 0.1, rand(-0.4, 0.4)); d.userData.v = V(rand(-2, 2), rand(3, 5), rand(-2, 2));
      debris.push(d); g.add(d);
    }
    this.add((dt, t) => {
      const sk = easeOut(t / 0.5); shock.scale.setScalar(0.3 + R * sk); shock.material.opacity = 1 - clamp01(t / 0.5);
      const rise = easeOutBack((t - 0.15) / 0.45), end = clamp01((t - (LIFE - 0.5)) / 0.5);
      const pulse = 0.75 + 0.25 * Math.sin(t * 5);
      wall.scale.set(1, Math.max(0.001, rise * (1 - end)), 1); wall.position.y = 1.2 * rise * (1 - end);
      wall.material.opacity = 0.12 * pulse * (t > 0.15 ? 1 : 0);
      bars.scale.y = Math.max(0.001, rise * (1 - end)); bars.position.y = 0;
      bars.rotation.y += dt * 0.35;
      bars.children.forEach((b, i) => { b.material.opacity = 0.8 * (0.6 + 0.4 * Math.sin(t * 6 + i)); });
      floor.material.opacity = 0.9 * clamp01(t / 0.3) * (1 - end); hex.material.opacity = 0.08 * pulse * (1 - end);
      light.intensity = 20 * Math.max(0, 1 - t * 2) + 4 * pulse * (1 - end);
      for (const d of debris) { d.userData.v.y -= 14 * dt; d.position.addScaledVector(d.userData.v, dt);
        if (d.position.y < 0.05) { d.position.y = 0.05; d.userData.v.set(0, 0, 0); }
        d.material.opacity = 1 - clamp01((t - 1.5) / 0.5); }
      return t < LIFE;
    }, () => this.drop(g));
  }

  // ---------------------------------------------------------------- DRONE
  drone({ hand, forward }) {
    const d = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.22), solid(0x1e232b));
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.12), solid(0x3a4150)); top.position.y = 0.05;
    const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 0), glow(COL.civic)); eye.position.set(0, -0.01, 0.12);
    d.add(body, top, eye);
    const rotors = [];
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.025), solid(0x2b2f36));
      arm.position.set(x * 0.13, 0.02, z * 0.13); arm.rotation.y = Math.atan2(z, x) * -1; d.add(arm);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.006, 10), glow(COL.cyan, 0.45));
      r.position.set(x * 0.2, 0.05, z * 0.2); d.add(r); rotors.push(r);
    }
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.2, 20, 1, true), glow(COL.civic, 0.12));
    cone.geometry.translate(0, -1.6, 0); cone.rotation.x = -0.55; d.add(cone);
    const light = new GlowLight(COL.civic, 3, 4, 2); d.add(light);
    d.position.copy(hand); this.scene.add(d);
    this.onEvent('drone', { obj: d, radius: 12, life: 6.0 });
    const yaw = Math.atan2(forward.x, forward.z);
    const side = V(Math.cos(yaw), 0, -Math.sin(yaw));
    const LIFE = 6.0, SPEED = 1.7;
    const p0 = hand.clone();
    let prev = d.position.clone();
    this.add((dt, t) => {
      rotors.forEach(r => r.rotation.y += dt * 40);
      let p;
      if (t < 0.45) p = p0.clone().add(V(0, 1.1 * easeOut(t / 0.45), 0)).addScaledVector(forward, 0.4 * t);   // launch up
      else {
        const s = t - 0.45;
        p = p0.clone().add(V(0, 1.1 + 0.12 * Math.sin(s * 3), 0)).addScaledVector(forward, 0.18 + SPEED * s)
          .addScaledVector(side, 1.6 * Math.sin(s * 1.3));                                                      // sweeping S path
      }
      if (this.collide) { const hit = this.collide(d.position, p); if (hit) { p.copy(hit.point).addScaledVector(hit.normal, 0.3); p0.addScaledVector(hit.normal, 0.25); } }
      d.position.copy(p);
      const vel = p.clone().sub(prev).divideScalar(Math.max(dt, 1e-4)); prev = p.clone();
      d.rotation.set(Math.min(0.35, vel.length() * 0.08), yaw + Math.atan2(vel.x, vel.z) - yaw, 0);   // nose dips into motion
      d.rotation.z = -side.dot(vel) * 0.08;
      cone.material.opacity = t < 0.45 ? 0 : 0.12 + 0.05 * Math.sin(t * 7);
      eye.material.opacity = 0.6 + 0.4 * Math.sin(t * 9);
      const end = clamp01((t - (LIFE - 0.4)) / 0.4);
      if (end > 0) { d.scale.setScalar(1 - end); light.intensity = 3 * (1 - end); }
      return t < LIFE;
    }, () => this.drop(d));
  }
}

// Clip-time (seconds) at which each ability's effect is released, matched to the character animations in rig.py.
export const RELEASE_AT = { ab_smoke: 0.5, ab_flash: 0.33, ab_decoy: 0.58, ab_sensor: 0.62, ab_shield: 0.25,
                            ab_dash: 0.1, ab_lockdown: 0.58, ab_drone: 0.5 };
