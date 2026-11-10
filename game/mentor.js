// Friendly mentor bot (tutorial): follows the player, demonstrates abilities, shoots hostiles.
// Uses an operative rig (idle_rifle / run_rifle / shoot / ab_* clips, handR bone). Never targeted, never dies.
// Usage (game.js):
//   const m = new Mentor({ gltf, gun, gunOffset, gunInfo, pos, yaw }); scene.add(m.root);
//   every frame: m.update(dt, ctx)   ctx = { player, world, enemies, losClear(a,b), onShot(from,to,enemy,killed), onAbility(mentor,kind) }
//   m.fight = true lets it engage; m.demo(kind) plays ab_<kind> and calls ctx.onAbility at the release frame.
// Hot path is allocation-free (scratch vectors; findPath only on a ~1 s repath timer).
import * as THREE from 'three';
import * as SkeletonUtils from '../lib/addons/utils/SkeletonUtils.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const RUN = 5.0, FOLLOW = 3.2, RANGE = 34, DMG = 16, ROF = 0.16;

export class Mentor {
  constructor({ gltf, gun, gunOffset, gunInfo, pos, yaw = 0 }) {
    this.root = SkeletonUtils.clone(gltf.scene);
    this.root.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });
    this.clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
    this.mixer = new THREE.AnimationMixer(this.root); this.actions = {}; this.clip = null;
    this.pos = pos.clone(); this.vel = new THREE.Vector3(); this.r = 0.4; this.h = 1.8; this.onGround = true; this.yaw = yaw;
    this.fight = false; this.kills = 0; this.target = null;
    this.path = null; this.pathI = 0; this.repathT = 0; this.busyT = 0; this.pending = null; this.dashT = 0;
    this.shotT = 0; this.burst = 0; this.pauseT = 0;
    this.muzzleLocal = gunInfo?.muzzle?.clone() ?? new THREE.Vector3();
    const hand = this.root.getObjectByName('handR');
    if (hand && gun) { this.gun = gun.clone(true); this.gun.matrixAutoUpdate = false; this.gun.matrix.copy(gunOffset); hand.add(this.gun); }
    this.play('idle_rifle'); this.mixer.update(0); this.sync();
  }
  play(name, once = false, fade = 0.2) {
    const clip = this.clips[name]; if (!clip || (this.clip === name && !once)) return;
    const next = this.actions[name] ??= this.mixer.clipAction(clip);
    for (const k in this.actions) { const a = this.actions[k]; if (a !== next && a.isRunning()) a.fadeOut(fade); }
    next.reset(); next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); next.clampWhenFinished = once;
    next.setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fade).play(); this.clip = name;
  }
  sync() { this.root.position.copy(this.pos); this.root.rotation.y = this.yaw; }
  muzzle(out) {
    if (!this.gun) return out.copy(this.pos).setY(this.pos.y + 1.4);
    this.gun.updateWorldMatrix(true, false); return out.copy(this.muzzleLocal).applyMatrix4(this.gun.matrixWorld);
  }
  forward(out) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  face(p, dt, k = 8) {
    const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    let d = want - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * k);
  }
  /** Play the ability clip; the effect fires at ~55% (ctx.onAbility). Returns false if busy or clip missing. */
  demo(kind) {
    const c = this.clips['ab_' + kind]; if (!c || this.busyT > 0) return false;
    this.play('ab_' + kind, true, 0.12); this.busyT = c.duration; this.pending = { kind, at: c.duration * 0.55 };
    return true;
  }
  /** Teleport next to the player if left far behind (e.g. after a long fall). */
  rejoin(p) { this.pos.set(p.x + 1.5, p.y, p.z + 1.5); this.vel.set(0, 0, 0); this.path = null; }

  update(dt, ctx) {
    this.mixer.update(dt);
    const P = ctx.player.pos;
    if (this.busyT > 0) {
      this.busyT -= dt;
      const a = this.actions[this.clip];
      if (this.pending && a && a.time >= this.pending.at) { const k = this.pending.kind; this.pending = null; if (k === 'dash') this.dashT = 0.22; ctx.onAbility?.(this, k); }
      if (this.dashT > 0) { this.dashT -= dt; this.forward(_a); this.vel.x = _a.x * 14; this.vel.z = _a.z * 14; } else this.vel.x = this.vel.z = 0;
      ctx.world.move(this, dt);
      if (this.busyT <= 0) this.clip = null;
      this.sync(); return;
    }
    // target: nearest visible live hostile
    this.target = null;
    if (this.fight) {
      let bd = RANGE * RANGE; _a.copy(this.pos); _a.y += 1.5;
      for (const e of ctx.enemies) {
        if (!e.alive) continue;
        const d2 = e.pos.distanceToSquared(this.pos); if (d2 > bd) continue;
        _b.copy(e.pos); _b.y += e.T?.flying ? 0 : e.T?.static ? 0.6 : 1.2;
        if (!ctx.losClear(_a, _b)) continue;
        bd = d2; this.target = e;
      }
    }
    // movement: stay near the player (slightly behind-right), on the nav graph when far
    const dist = Math.hypot(P.x - this.pos.x, P.z - this.pos.z);
    if (dist > 40 || this.pos.y < -20) this.rejoin(P);
    this.repathT -= dt; this.vel.x = this.vel.z = 0;
    let moving = false;
    if (dist > FOLLOW + (this.target ? 4 : 0)) {
      if (this.repathT <= 0) { this.repathT = 1; this.path = ctx.world.findPath(this.pos, P); this.pathI = 0; }
      let wp = this.path && this.path[this.pathI];
      while (wp && Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < 0.6) { this.pathI++; wp = this.path[this.pathI]; }
      const tx = wp ? wp.x : P.x, tz = wp ? wp.z : P.z, dx = tx - this.pos.x, dz = tz - this.pos.z, l = Math.hypot(dx, dz) || 1;
      const sp = dist > 9 ? RUN * 1.25 : RUN;
      this.vel.x = dx / l * sp; this.vel.z = dz / l * sp; moving = true;
    }
    ctx.world.move(this, dt);
    if (this.target) {
      _c.copy(this.target.pos); this.face(_c, dt, 10);
      this.play(moving ? 'run_rifle' : 'shoot');
      this.shoot(dt, ctx);
    } else {
      if (moving) this.face(_d.copy(this.pos).add(this.vel), dt, 8); else this.face(P, dt, 2);
      this.play(moving ? 'run_rifle' : 'idle_rifle');
    }
    this.sync();
  }
  shoot(dt, ctx) {
    const e = this.target;
    if (this.pauseT > 0) { this.pauseT -= dt; return; }
    this.shotT -= dt; if (this.shotT > 0) return;
    // only once roughly facing the target
    const want = Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
    let d = want - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) > 0.35) return;
    this.shotT = ROF;
    this.muzzle(_a);
    _b.copy(e.pos); _b.y += e.T?.flying ? 0 : e.T?.static ? 0.6 : 1.25;
    const hit = Math.random() < 0.6;
    if (!hit) { _b.x += (Math.random() - 0.5) * 1.6; _b.y += Math.random() * 0.8; _b.z += (Math.random() - 0.5) * 1.6; }
    const killed = hit ? e.damage(DMG, this.pos, 'body') : false;
    if (killed) { this.kills++; this.target = null; }
    ctx.onShot?.(_a, _b, e, killed, hit);
    if (++this.burst >= 4) { this.burst = 0; this.pauseT = 0.5 + Math.random() * 0.4; }
  }
}
