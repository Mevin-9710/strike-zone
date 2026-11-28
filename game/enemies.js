// Meridian Covenant enemies: rigged, armed, animated, with bone-driven hitboxes and nav-graph AI.
import * as THREE from 'three';
import * as SkeletonUtils from '../lib/addons/utils/SkeletonUtils.js';
import { weaponInfo } from './weapons.js';
import { RELEASE_AT } from '../fx/abilities.js';

// Hand-space transform that puts a weapon at the grip of `gltf` posed in `clipName` (shared by enemies and operatives).
export function calibrateGun(gltf, clipName) {
  const tmp = SkeletonUtils.clone(gltf.scene), mixer = new THREE.AnimationMixer(tmp);
  mixer.clipAction(gltf.animations.find(c => c.name === clipName)).play(); mixer.update(0); tmp.updateMatrixWorld(true);
  const hand = tmp.getObjectByName('handR'), fore = tmp.getObjectByName('forearmR');
  const hp = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld), fp = new THREE.Vector3().setFromMatrixPosition(fore.matrixWorld);
  const grip = hp.clone().addScaledVector(hp.clone().sub(fp).normalize(), 0.05);
  return hand.matrixWorld.clone().invert().multiply(new THREE.Matrix4().compose(grip, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
}
// Which ability clips each enemy type uses in combat.
const ENEMY_ABILITIES = { guard: ['smoke', 'dash'], heavy: ['shield', 'lockdown'], sniper: ['sensor', 'decoy'], commander: ['flash', 'smoke', 'drone'], warden: ['flash', 'smoke', 'drone', 'shield'] };
const PISTOL = { dmg: 9, burst: [2, 3], rof: 0.28, pause: [0.8, 1.2], acc: 0.55, range: 30, cls: 'pistol' };

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// scratch vectors for hot paths (never stored)
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _from = new THREE.Vector3(), _to = new THREE.Vector3();
const AIM_TELL = 0.25, STAGGER = 0.35, ACC_RAMP = 1.2;
// difficulty scalars (G.difficulty: 1 = normal; <1 easier, >1 harder)
const diffOf = G => (typeof G?.difficulty === 'number' && Number.isFinite(G.difficulty) ? clamp(G.difficulty, 0.25, 3) : 1);
// Attack tokens (DOOM 2016 style): only a few enemies may shoot at the player at once; the rest keep pressure
// by strafing/repositioning. 'ranged' = bursts, 'heavy' = sniper laser shots. Holders refresh `tokT` every frame,
// so a holder that dies or is removed from the game without releasing is audited out (UPD = global update counter,
// sim-time based so fast-forwarded tests behave like real play).
const TOKENS = { ranged: new Set(), heavy: new Set() };
let UPD = 0;
const tokenCap = (kind, diff) => kind === 'heavy' ? 1 : clamp(Math.round(1 + diff), 1, 4);
function claimToken(e, kind, diff) {
  const pool = TOKENS[kind]; if (pool.has(e) && e.token === kind) return true;
  if (e.token) releaseToken(e);
  for (const h of pool) if (!h.alive || h.token !== kind || UPD - h.tokT > 400) { pool.delete(h); if (h.token === kind) h.token = null; }
  if (pool.size >= tokenCap(kind, diff)) return false;
  pool.add(e); e.token = kind; e.tokT = UPD; return true;
}
function releaseToken(e) { if (e.token) { TOKENS[e.token].delete(e); e.token = null; } }
// one shared additive glow used for the pre-burst aim tell
let GLOW_MAT = null;
function glowMat() {
  if (GLOW_MAT) return GLOW_MAT;
  let map = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,90,70,0.9)'); gr.addColorStop(1, 'rgba(255,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); map = new THREE.CanvasTexture(cv);
  }
  GLOW_MAT = new THREE.SpriteMaterial({ map, color: 0xff3a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  return GLOW_MAT;
}

// burst: shots per burst; rof: seconds between shots; pause: seconds between bursts; acc: base hit chance at 10 m
// Deathmatch damage per hit on the player's scale (player AR-7 does 28): ~4-6 hits to kill from 100 HP
const DM_DMG = { assault: 22, 'machine gun': 17, sniper: 70, pistol: 18 };
export const ENEMY_TYPES = {
  guard:     { model: 'enemy_guard', weapon: 'ar7_lance', cls: 'assault', name: 'Guard', hp: 100, walk: 1.7, run: 3.8, dmg: 8, burst: [3, 5], rof: 0.11, pause: [0.7, 1.3], acc: 0.5, range: 42, react: 0.6, fov: 0.6 },
  heavy:     { model: 'enemy_heavy', weapon: 'grinder_lmg', cls: 'machine gun', name: 'Heavy', hp: 230, walk: 1.3, run: 2.7, dmg: 6, burst: [7, 11], rof: 0.09, pause: [1.0, 1.6], acc: 0.4, range: 36, react: 0.7, fov: 0.55 },
  sniper:    { model: 'enemy_sniper', weapon: 'longshot_bolt', cls: 'sniper', name: 'Sniper', hp: 80, walk: 1.5, run: 3.2, dmg: 42, burst: [1, 1], rof: 0.1, pause: [2.6, 3.4], acc: 0.8, range: 85, react: 1.0, fov: 0.75, laser: 1.1 },
  commander: { model: 'enemy_commander', weapon: 'warden_br', cls: 'assault', name: 'Commander', hp: 160, walk: 1.6, run: 3.6, dmg: 13, burst: [2, 3], rof: 0.22, pause: [0.8, 1.2], acc: 0.6, range: 55, react: 0.5, fov: 0.55 },
  warden:    { model: 'enemy_commander', weapon: 'warden_br', cls: 'assault', name: 'Okonkwo', hp: 950, walk: 1.6, run: 3.4, dmg: 14, burst: [3, 4], rof: 0.2, pause: [0.7, 1.0], acc: 0.6, range: 60, react: 0.35, fov: 0.6, boss: true },
  drone:     { model: 'enemy_drone', cls: 'pistol', name: 'Drone', hp: 60, walk: 3, run: 4.5, dmg: 5, burst: [5, 7], rof: 0.1, pause: [1.0, 1.5], acc: 0.42, range: 32, react: 0.4, fov: -1, flying: true },
  turret:    { model: 'enemy_turret', cls: 'machine gun', name: 'Turret', hp: 180, walk: 0, run: 0, dmg: 5, burst: [8, 12], rof: 0.08, pause: [1.2, 1.8], acc: 0.4, range: 38, react: 0.5, fov: -1, static: true },
};

// ---------- ray tests ----------
function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc; if (h < 0) return Infinity;
  const t = -b - Math.sqrt(h); return t >= 0 ? t : (cc < 0 ? 0 : Infinity);
}
function rayCapsule(o, d, a, b, r) {
  // closest approach between the ray and segment ab, then a sphere test there (good enough for hitboxes)
  const ab = b.clone().sub(a), ao = o.clone().sub(a);
  const abd = ab.dot(d), abab = ab.dot(ab), abao = ab.dot(ao), dao = d.dot(ao);
  const den = abab - abd * abd;
  let s = den > 1e-6 ? clamp((abao - abd * dao) / den, 0, 1) : 0;
  for (let i = 0; i < 2; i++) {                          // refine: closest point on segment to the ray
    const p = a.clone().addScaledVector(ab, s);
    const t = Math.max(0, p.clone().sub(o).dot(d));
    const q = o.clone().addScaledVector(d, t);
    s = clamp(q.clone().sub(a).dot(ab) / abab, 0, 1);
  }
  return raySphere(o, d, a.clone().addScaledVector(ab, s), r);
}

// Template cache per enemy type: gltf + calibrated weapon offset + body measurements.
export async function loadEnemyAssets(loader, weaponScenes) {
  const out = {};
  await Promise.all(Object.entries(ENEMY_TYPES).map(async ([type, T]) => {
    const g = await loader.loadAsync(`models/rigged/${T.model}.glb`);
    out[type] = buildCharAssets(g, type, weaponScenes);
  }));
  return out;
}
// asset bundle for one enemy type on any humanoid rig (enemy or operative model share the same bones + clips)
export function buildCharAssets(g, type, weaponScenes) {
  const T = ENEMY_TYPES[type];
  {
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    const a = { gltf: g, clips: Object.fromEntries(g.animations.map(c => [c.name, c])) };
    if (T.weapon) {
      // pose a temp copy in its aim clip and store the hand-space transform that puts the gun at the grip
      a.gunOffset = calibrateGun(g, 'shoot');
      a.gun = weaponScenes[T.weapon]; a.gunInfo = weaponInfo(a.gun);
      if (type === 'sniper') { a.pistolOffset = calibrateGun(g, 'shoot_pistol'); a.pistol = weaponScenes.vex_p9; a.pistolInfo = weaponInfo(a.pistol); }
    }
    const box = new THREE.Box3().setFromObject(g.scene); a.height = box.max.y; a.box = box;
    return a;
  }
}

let NEXT_ID = 1;
export class Enemy {
  constructor(type, assets, pos, { yaw = 0, post = null } = {}) {
    this.id = NEXT_ID++; this.type = type; this.T = ENEMY_TYPES[type]; this.A = assets;
    this.root = SkeletonUtils.clone(assets.gltf.scene);
    this.root.traverse(o => { if (o.isMesh) { o.frustumCulled = false; } });
    this.mixer = new THREE.AnimationMixer(this.root); this.actions = {}; this.clip = null;
    this.pos = pos.clone(); this.vel = V(); this.r = 0.4; this.h = 1.8; this.onGround = true;
    this.post = (post || pos).clone(); this.yaw = yaw; this.postYaw = yaw;
    this.hp = this.T.hp; this.alive = true; this.deadT = 0;
    this.state = this.T.static ? 'guard' : 'patrol';
    this.awareness = 0; this.lastKnown = null; this.alertT = 0; this.seesTarget = false; this.target = null;
    this.burstLeft = 0; this.shotT = rand(0.5, 1.2); this.reactT = 0; this.laserT = 0;
    this.path = null; this.pathI = 0; this.repathT = 0; this.wanderT = rand(2, 6); this.searchT = 0;
    this.blindT = 0; this.flinch = 0; this.revealT = 0; this.strafeT = 0; this.strafeDir = 1; this.lockSlow = 1;
    this.bones = { head: this.root.getObjectByName('head'), chest: this.root.getObjectByName('chest'), hips: this.root.getObjectByName('hips'),
      footL: this.root.getObjectByName('footL'), footR: this.root.getObjectByName('footR'), barrels: this.root.getObjectByName('barrels'), body: this.root.getObjectByName('body') };
    this.S = this.T; this.armed = 'rifle'; this.guns = {};
    this.abilities = ENEMY_ABILITIES[type] || []; this.abCD = rand(4, 9); this.busyT = 0; this.abPending = null; this.shieldHP = 0; this.dashT = 0; this.dashV = V();
    this.task = null; this.armedDevice = false;
    this.aimT = 0; this.staggerT = 0; this.lastHitPart = null; this.sightT = 0; this.unseenT = 9; this.firstShot = true;
    this.repoT = rand(2.5, 5); this.repoActive = false; this.token = null; this.tokT = 0;
    if (this.T.weapon) {
      const hand = this.root.getObjectByName('handR');
      const mk = (scene, offset) => { const w = scene.clone(true); w.matrixAutoUpdate = false; w.matrix.copy(offset); w.traverse(o => { if (o.isMesh) o.castShadow = true; }); hand.add(w); return w; };
      this.guns.rifle = mk(assets.gun, assets.gunOffset);
      if (assets.pistol) { this.guns.pistol = mk(assets.pistol, assets.pistolOffset); this.guns.pistol.visible = false; }
      this.gun = this.guns.rifle; this.gunInfo = assets.gunInfo;
    }
    if (this.T.flying) { this.hover = 2.6; this.pos.y += this.hover; }
    this.glow = new THREE.Sprite(glowMat()); this.glow.visible = false; this.glow.scale.setScalar(0.45);
    this.glow.raycast = () => {}; this.glow.renderOrder = 5; this.root.add(this.glow);
    this.play(this.T.flying ? 'hover' : this.T.static ? 'idle' : 'idle_rifle');
    this.mixer.update(0);                      // pose immediately: never show the bind (T) pose
    this.sync();
  }
  cn(base) { const p = this.armed === 'pistol'; return base === 'shoot' ? (p ? 'shoot_pistol' : 'shoot') : `${base}_${p ? 'pistol' : 'rifle'}`; }
  setArmed(kind) {
    if (this.armed === kind || !this.guns[kind]) return;
    this.guns[this.armed].visible = false; this.armed = kind; this.gun = this.guns[kind]; this.gun.visible = true;
    this.gunInfo = kind === 'pistol' ? this.A.pistolInfo : this.A.gunInfo;
    releaseToken(this); this.aimT = 0;
    this.S = kind === 'pistol' ? { ...this.T, ...PISTOL, laser: 0 } : this.T; this.laserT = 0; this.burstLeft = 0;
  }
  // one-shot clip (ability / plant / defuse); `kind` fires its effect at the clip's release frame
  perform(clip, kind = null) {
    const c = this.A.clips[clip]; if (!c) return false;
    this.play(clip, { once: true, fade: 0.12, solo: true });
    this.busyT = c.duration; this.abPending = kind ? { kind, at: RELEASE_AT[clip] ?? c.duration * 0.5, clip } : null;
    return true;
  }
  tickAnim(dt) { this.mixer.update(dt); }
  get eye() { return this.T.flying ? this.pos.clone() : this.T.static ? this.pos.clone().add(V(0, 0.8, 0)) : this.pos.clone().add(V(0, 1.62, 0)); }
  // Cross-fade to `name`. Every other running action fades out too, so one-shots (death, abilities) never
  // blend with a leftover walk/shoot loop.
  play(name, { once = false, fade = 0.2, solo = false } = {}) {
    const clip = this.A.clips[name]; if (!clip || (this.clip === name && !solo)) return;
    const next = this.actions[name] ??= this.mixer.clipAction(clip);
    // v42: a finished one-shot (clamped, so isRunning() is false) still weighs 1: fade it out too, or it blends into
    // every later pose (the "frozen lean" while shooting, the half-standing death)
    for (const a of Object.values(this.actions)) if (a !== next && a.getEffectiveWeight() > 0) a.fadeOut(fade);
    next.reset(); next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); next.clampWhenFinished = once;
    next.setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fade).play(); this.clip = name;
  }
  sync() {
    this.root.position.copy(this.pos); if (this.T.flying) this.root.position.y -= 0.0;
    this.root.rotation.y = this.yaw;
  }
  muzzle(out = V()) {
    if (this.gun) { this.gun.updateWorldMatrix(true, false); return out.copy(this.gunInfo.muzzle).applyMatrix4(this.gun.matrixWorld); }
    const f = V(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    if (this.T.static && this.bones.barrels) { this.bones.barrels.updateWorldMatrix(true, false); return out.setFromMatrixPosition(this.bones.barrels.matrixWorld).addScaledVector(f, 0.6); }
    return out.copy(this.pos).addScaledVector(f, 0.35);
  }

  // ---------- hitboxes (built from bones each query) ----------
  hitTest(o, d, maxT = 300) {
    if (!this.alive) return null;
    // broad phase
    const c = this.pos.clone().add(V(0, this.T.flying ? 0 : 0.95, 0));
    if (raySphere(o, d, c, 1.5) > maxT) return null;
    this.root.updateMatrixWorld(true);
    const wp = (b, off) => (b ? V().setFromMatrixPosition(b.matrixWorld) : this.pos.clone()).add(off || V());
    let best = null;
    const test = (t, part, mult) => { if (t < maxT && (!best || t < best.t)) best = { t, part, mult }; };
    if (this.T.flying) { test(raySphere(o, d, this.pos, 0.55), 'body', 1); return best; }
    if (this.T.static) {
      test(raySphere(o, d, wp(this.bones.head, V(0, 0.15, 0)), 0.5), 'head', 1.5);
      test(rayCapsule(o, d, this.pos.clone().add(V(0, 0.1, 0)), this.pos.clone().add(V(0, 0.6, 0)), 0.45), 'body', 1);
      return best;
    }
    const k = this.root.scale.y || 1;                   // Deathmatch bots are drawn bigger: grow the hit shapes with them
    const head = wp(this.bones.head, V(0, 0.2 * k, 0));
    const chest = wp(this.bones.chest, V(0, 0.22 * k, 0)), hips = wp(this.bones.hips, V(0, -0.05 * k, 0));
    test(raySphere(o, d, head, 0.22 * k), 'head', 0);
    test(rayCapsule(o, d, hips, chest, 0.3 * k), 'body', 1);
    const fl = wp(this.bones.footL), fr = wp(this.bones.footR);
    test(rayCapsule(o, d, hips.clone().add(V(0.1, 0, 0)), fl, 0.14), 'legs', 0.75);
    test(rayCapsule(o, d, hips.clone().add(V(-0.1, 0, 0)), fr, 0.14), 'legs', 0.75);
    return best;
  }
  damage(amount, from, part) {
    if (!this.alive) return false;
    if (this.shieldHP > 0) { const a = Math.min(this.shieldHP, amount * 0.75); this.shieldHP -= a; amount -= a; }
    this.hp -= amount; this.lastHurtT = 0;
    this.lastHitPart = part === 'head' || part === 'legs' ? part : 'body';
    if (this.flinch < 0.3) this.flinchSide = Math.random() < 0.5 ? -1 : 1;   // v46: small eased twitch, re-armed only once the last one settled (no limbo lean under sustained fire)
    if (part === 'head') { releaseToken(this); this.flinch = 1; this.staggerT = STAGGER; this.aimT = 0; this.burstLeft = 0; this.shotT = Math.max(this.shotT, STAGGER); }
    else if (this.flinch < 0.3) this.flinch = part === 'legs' ? 0.6 : 1;
    this.alert(from, 1);
    if (this.hp <= 0) { this.die(); return true; }
    return false;
  }
  die() {
    releaseToken(this);
    this.alive = false; this.hp = 0; this.state = 'dead'; this.laserT = 0; this.aimT = 0; this.staggerT = 0; if (this.glow) this.glow.visible = false; this.busyT = 0; this.abPending = null; this.task = null;
    this.play('death', { once: true, fade: 0.12, solo: true });
  }
  alert(pos, amount = 1) {
    if (!this.alive) return;
    this.awareness = Math.max(this.awareness, amount);
    if (pos) this.lastKnown = pos.clone();
    this.alertT = 12;
    if (this.state === 'patrol' || this.state === 'guard') this.state = this.T.static ? 'guard' : 'search';
  }
  hear(pos, loud = 1) {
    if (!this.alive) return;
    const d = pos.distanceTo(this.pos);
    if (d < 32 * loud) this.alert(pos, d < 12 ? 1 : 0.6);
  }

  // ---------- AI ----------
  update(dt, G) {
    if (!this.alive && this.deadT > 7) return;                    // gone: no animation or AI cost
    this.mixer.update(dt);
    if (!this.alive) {
      this.deadT += dt;
      if (this.deadT > 4) this.pos.y -= dt * 0.6;                 // bodies sink away after a few seconds
      else if (!this.T.flying && !this.T.static) { this.vel.x = this.vel.z = 0; G.world.move(this, dt); }   // v42: killed mid-air (dash, ledge, jump pad): fall to the floor
      if (this.T.flying && this.pos.y > (this.groundY ?? 0) + 0.3) { this.vel.y -= 14 * dt; this.pos.y = Math.max(this.groundY ?? 0, this.pos.y + this.vel.y * dt); }
      if (this.glow) this.glow.visible = false;
      this.sync(); return;
    }
    this.staggerT = Math.max(0, this.staggerT - dt);
    UPD++; if (this.token) this.tokT = UPD;
    this.blindT = Math.max(0, this.blindT - dt); this.revealT = Math.max(0, this.revealT - dt);
    this.alertT = Math.max(0, this.alertT - dt); this.flinch = Math.max(0, this.flinch - dt * 6);
    this.lockSlow = G.inLockdown(this.pos) ? 0.3 : 1;

    // choose target: the player, or a decoy hologram that is closer/visible
    const pTarget = G.player.alive && !G.ignorePlayer && !this.ally ? G.playerHead() : null;   // team Deathmatch: allies never target the player   // new-player calm start: bots leave the player alone
    let target = null, tgtKind = null;
    const eye = this.eye;
    const sees = p => p && this.canSee(eye, p, G);
    const decoy = G.nearestDecoy(this.pos, 28);
    const seePlayer = sees(pTarget);
    const seeDecoy = decoy && sees(decoy);
    if (seeDecoy && (!seePlayer || decoy.distanceTo(this.pos) < pTarget.distanceTo(this.pos))) { target = decoy; tgtKind = 'decoy'; }
    else if (seePlayer) { target = pTarget; tgtKind = 'player'; }
    if (G.ffaRival) {                                       // free-for-all Deathmatch: bots also fight the nearest rival bot
      if ((this.rivalT = (this.rivalT || 0) - dt) <= 0) { this.rivalT = 0.4; this.rival = G.ffaRival(this); }
      const r = this.rival;
      if (r && r.alive) {
        const rh = (this._rh ??= V()).copy(r.pos); rh.y += (r.A.height || 1.8) * 0.85;
        if ((!target || rh.distanceTo(this.pos) < target.distanceTo(this.pos) * 0.8) && sees(rh)) { target = rh; tgtKind = 'bot'; }
      }
    }
    if (this.blindT > 0) { target = null; tgtKind = null; }
    this.seesTarget = !!target; this.target = target; this.targetKind = tgtKind;
    // accuracy ramp: re-acquiring the player after ~1 s out of sight resets to a fresh (deliberately missed) first shot
    // v28: tracked for bot targets too (before, bot-vs-bot shots stayed at 25% accuracy, so bots almost never killed each other)
    const tid = tgtKind === 'bot' ? this.rival : tgtKind;
    if (tgtKind) { if (this.unseenT > 1 || tid !== this._tid) { this.sightT = 0; if (tgtKind === 'player') this.firstShot = true; } this._tid = tid; this.unseenT = 0; this.sightT += dt; }
    else this.unseenT += dt;

    if (target) {
      const dist = target.distanceTo(eye);
      const rate = (this.state === 'combat' || this.alertT > 0 ? 3 : 1) / (0.35 + dist / 22);
      this.awareness = Math.min(1.5, this.awareness + rate * dt);
      if (this.lastKnown) this.lastKnown.copy(target); else this.lastKnown = target.clone();
      if (this.awareness >= 1 && this.state !== 'combat') { this.state = 'combat'; this.reactT = this.T.react * clamp(1.6 - 0.6 * diffOf(G), 0.45, 2); G.onSpotted?.(this); }
    } else {
      this.awareness = Math.max(0, this.awareness - dt * 0.15);
      if (this.state === 'combat') { this.state = 'search'; this.searchT = 7; this.path = null; }
    }

    this.lastHurtT = (this.lastHurtT ?? 9) + dt; this.abCD -= dt;
    if (this.busyT > 0) {                                   // playing a one-shot clip: hold still, release the effect on cue
      this.busyT -= dt;
      const a = this.actions[this.clip];
      if (this.abPending && a && a.time >= this.abPending.at) { const k = this.abPending.kind; this.abPending = null; G.enemyAbility?.(this, k); }
      if (this.target) this.faceTowards(this.target, dt, 4);
      if (this.dashT > 0) { this.dashT -= dt; this.vel.x = this.dashV.x; this.vel.z = this.dashV.z; } else { this.vel.x = this.vel.z = 0; }
      G.world.move(this, dt);
      if (this.busyT <= 0) this.clip = null;               // let the base clip take over again
      this.aimT = 0; this.glow.visible = false;
      this.sync(); return;
    }
    if (!this.T.static && !this.T.flying) this.thinkAbility(G);
    if (this.busyT > 0) { this.aimT = 0; this.glow.visible = false; this.sync(); return; }
    if (this.T.static) this.updateTurret(dt, G);
    else if (this.T.flying) this.updateDrone(dt, G);
    else this.updateHumanoid(dt, G);

    this.updateShooting(dt, G);
    this.sync();
    this.poseOverlay();
  }
  // Additive tweaks after the mixer pose: aim tell (gun raised + muzzle glow), flinch and headshot stagger.
  poseOverlay() {
    const ch = this.bones.chest, hd = this.bones.head;
    const aimK = this.aimT > 0 ? Math.sin(clamp(1 - this.aimT / AIM_TELL, 0, 1) * Math.PI * 0.5) : 0;
    if (ch) {
      if (aimK > 0) ch.rotation.x -= aimK * 0.16;
      if (this.flinch > 0) { const k = this.flinch * this.flinch; ch.rotation.x -= k * 0.12; ch.rotation.y += k * 0.08 * (this.flinchSide || 1); if (hd) hd.rotation.x -= k * 0.1; }
      if (this.staggerT > 0) { const k = this.staggerT / STAGGER; if (hd) hd.rotation.x -= 0.22 * k * k; }   // v46: headshot = quick head snap, no shaking
    }
    if (aimK > 0) {
      this.glow.visible = true;
      this.muzzle(_a); this.root.worldToLocal(_a);   // muzzle() refreshed the root→gun matrix chain
      this.glow.position.copy(_a); this.glow.scale.setScalar(0.25 + aimK * 0.3);
    } else this.glow.visible = false;
  }
  thinkAbility(G) {
    // sniper: sidearm up close, rifle at range
    if (this.guns.pistol && this.target) { const d = this.target.distanceTo(this.pos); if (d < 11) this.setArmed('pistol'); else if (d > 18) this.setArmed('rifle'); }
    if (this.abCD > 0 || !this.abilities.length || this.blindT > 0) return;
    const d = this.target ? this.target.distanceTo(this.pos) : 99, inCombat = this.state === 'combat' && this.target;
    let pick = null;
    for (const k of this.abilities) {
      if (k === 'smoke' && inCombat && this.hp < this.T.hp * 0.6) pick = k;
      else if (k === 'shield' && this.lastHurtT < 1.5) pick = k;
      else if (k === 'flash' && inCombat && d > 5 && d < 18) pick = k;
      else if (k === 'lockdown' && inCombat && d < 9) pick = k;
      else if (k === 'dash' && inCombat && Math.random() < 0.3) pick = k;
      else if ((k === 'sensor' || k === 'drone') && this.state === 'search') pick = k;
      else if (k === 'decoy' && inCombat && Math.random() < 0.25) pick = k;
      if (pick) break;
    }
    this.abCD = pick ? rand(9, 15) : rand(1.5, 3);
    if (!pick) return;
    if (pick === 'dash') { const side = Math.random() < 0.5 ? -1 : 1; this.dashV.set(Math.cos(this.yaw) * side, 0, -Math.sin(this.yaw) * side).multiplyScalar(9); this.dashT = 0.3; }
    this.perform('ab_' + pick, pick);
  }
  canSee(eye, p, G) {
    const d = p.distanceTo(eye);
    if (d > this.T.range * (this.alertT > 0 ? 1.15 : 1)) return false;
    if (this.T.fov > -1 && this.alertT <= 0 && this.state !== 'combat') {
      const f = V(Math.sin(this.yaw), 0, Math.cos(this.yaw)), to = p.clone().sub(eye).setY(0).normalize();
      if (f.dot(to) < this.T.fov - 0.45 && d > 4) return false;          // ~120° cone unless alerted or very close
    }
    return G.losClear(eye, p);
  }
  faceTowards(p, dt, speed = 8) {
    const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    let d = want - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += clamp(d, -speed * dt, speed * dt);
    return Math.abs(d);
  }
  followPath(dt, G, speed) {
    if (!this.path || this.pathI >= this.path.length) return false;
    let wp = this.path[this.pathI];
    while (wp && Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < 0.6 && Math.abs(wp.y - this.pos.y) < 1.2) { this.pathI++; wp = this.path[this.pathI]; }
    if (!wp) { this.path = null; return false; }
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
    this.vel.x = dx / l * speed; this.vel.z = dz / l * speed;
    return true;
  }
  // Pick a spot a few metres to the side (peek / shift cover) and walk there on the nav graph — never through walls.
  tryReposition(G, dist) {
    if (!G.allowRepath() || !this.target) return false;
    const side = Math.random() < 0.5 ? -1 : 1, r = rand(2.5, 4.5);
    _b.set(Math.cos(this.yaw) * side * r, 0, -Math.sin(this.yaw) * side * r);
    const fwd = this.type === 'sniper' ? -1 : dist > 14 ? 1.5 : dist < 7 ? -1.5 : 0;   // close in / back off a little
    _b.x += Math.sin(this.yaw) * fwd; _b.z += Math.cos(this.yaw) * fwd;
    _c.copy(this.pos).add(_b);
    _a.copy(this.pos); _a.y += 1.2; _c.y += 1.2;
    if (!G.losClear(_a, _c)) return false;              // a wall is in the way: stay put
    _c.y -= 1.2;
    const path = G.world.findPath(this.pos, _c); if (!path || !path.length) return false;
    let len = 0, px = this.pos.x, pz = this.pos.z;
    for (const w of path) { len += Math.hypot(w.x - px, w.z - pz); px = w.x; pz = w.z; }
    if (len > 8 || len < 0.8) return false;                // nav detour too long (or no real move)
    this.path = path; this.pathI = 0; this.repathT = rand(0.9, 1.4); this.repoActive = true;
    return true;
  }
  goTo(p, G) {
    if (this.repathT > 0 || !G.allowRepath()) return;
    this.repathT = rand(0.9, 1.4);
    this.path = G.world.findPath(this.pos, p); this.pathI = 0;
  }
  updateHumanoid(dt, G) {
    this.repathT -= dt;
    let speed = 0, moving = false;
    this.vel.x = 0; this.vel.z = 0;
    if (this.task && this.blindT <= 0) {                     // e.g. run to the player's charge and defuse it
      const t = this.task, near = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) < 1.4 && Math.abs(t.pos.y - this.pos.y) < 1.5;
      if (!near) { this.goTo(t.pos, G); moving = this.followPath(dt, G, this.T.run * this.lockSlow); if (moving) this.faceTowards(this.pos.clone().add(this.vel), dt, 8); }
      else { this.faceTowards(t.pos, dt, 6); t.t += dt; G.onEnemyTask?.(this, t); }
      G.world.move(this, dt);
      if (near) { if (this.clip !== t.clip) { this.clip = null; this.play(t.clip); } }
      else this.play(this.cn(moving ? 'run' : 'idle'));
      return;
    }
    if (this.blindT > 0) {
      speed = 0.6; this.yaw += Math.sin(this.blindT * 6) * dt * 2;          // stumbling, blinded
      this.vel.x = Math.sin(this.yaw) * speed; this.vel.z = Math.cos(this.yaw) * speed; moving = true;
    } else if (this.state === 'combat' && this.target) {
      const dist = this.target.distanceTo(this.pos);
      this.faceTowards(this.target, dt, 10);
      const want = this.type === 'sniper' ? 40 : this.type === 'heavy' ? 10 : 16;
      this.repoT -= dt;
      if (this.repoActive) {
        moving = this.followPath(dt, G, this.T.walk * 1.25 * this.lockSlow);
        if (!moving || this.repoT < -3) { this.repoActive = false; this.path = null; this.repoT = rand(3, 6); }
      } else if (this.repoT <= 0 && this.staggerT <= 0 && this.aimT <= 0 && this.burstLeft <= 0 && this.laserT <= 0) {
        this.repoT = rand(3, 6);
        if (Math.random() < (this.type === 'sniper' ? 0.35 : this.token ? 0.4 : 0.8)) this.tryReposition(G, dist);   // no token: keep pressure by moving
      }
      if (this.repoActive) { /* moving to a new firing spot */ }
      else if (dist > want + 6 && this.type !== 'sniper') {
        this.goTo(this.target, G); moving = this.followPath(dt, G, this.T.walk * this.lockSlow);
      } else if (this.type !== 'sniper') {                                    // strafe while shooting
        this.strafeT -= dt; if (this.strafeT <= 0) { this.strafeT = rand(0.8, 1.8); this.strafeDir = Math.random() < 0.5 ? -1 : 1; if (Math.random() < 0.35) this.strafeDir = 0; }
        const k = this.strafeDir * this.T.walk * 0.8 * this.lockSlow * (this.staggerT > 0 ? 0.3 : 1);
        if (this.jumper && this.onGround && Math.random() < dt * (this.lastHurtT < 0.6 ? 2.5 : 0.5)) this.vel.y = 7;   // some Deathmatch bots hop to dodge
        this.vel.x = Math.cos(this.yaw) * k; this.vel.z = -Math.sin(this.yaw) * k; moving = this.strafeDir !== 0;
      }
    } else if (this.state === 'search' && this.lastKnown) {
      this.goTo(this.lastKnown, G);
      moving = this.followPath(dt, G, this.T.run * this.lockSlow);
      if (moving) this.faceTowards(this.pos.clone().add(this.vel), dt, 6);
      if (!moving) { this.searchT -= dt; this.yaw += dt * 1.2; if (this.searchT <= 0) { this.state = 'patrol'; this.lastKnown = null; } }
    } else {                                                                  // patrol around the post
      this.wanderT -= dt;
      if (this.wanderT <= 0 && !this.path) {
        this.wanderT = rand(4, 9);
        const a = rand(0, Math.PI * 2), r = rand(2, 7);
        const dest = this.post.clone().add(V(Math.cos(a) * r, 0, Math.sin(a) * r));
        if (Math.random() < 0.4) dest.copy(this.post);
        this.repathT = 0; this.goTo(dest, G);
      }
      moving = this.followPath(dt, G, (this.loot && !this.loot.taken ? this.T.run : this.T.walk * 0.8) * this.lockSlow);   // battle royale: bots run to loot
      if (moving) this.faceTowards(this.pos.clone().add(this.vel), dt, 4);
    }
    G.world.move(this, dt);
    if (this.pos.y < -20) { this.pos.copy(this.post); this.vel.set(0, 0, 0); }   // safety net, never expected
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (this.state === 'combat' && this.target && sp < 0.3) this.play(this.cn('shoot'));
    else if (sp > 2.6) this.play(this.cn('run'));
    else if (sp > 0.2) this.play(this.cn('walk'));
    else if (this.state === 'patrol' && !this.armedDevice && G.nearDevice?.(this.pos) && Math.random() < 0.01) { this.armedDevice = true; this.perform('plant'); }
    else this.play(this.state === 'combat' ? this.cn('shoot') : this.cn('idle'));
    // walk clip speed matches ground speed
    const a = this.actions[this.clip]; if (a && /walk|run/.test(this.clip)) a.timeScale = clamp(sp / (this.clip.startsWith('run') ? 3.6 : 1.6), 0.5, 1.6);
  }
  updateDrone(dt, G) {
    this.repathT -= dt;
    const ground = G.world.groundHeight(this.pos.x, this.pos.z, 0.3, this.pos.y, 0.1);
    this.groundY = Number.isFinite(ground) ? ground : 0;
    let goal = null;
    if (this.blindT > 0) goal = null;
    else if (this.state === 'combat' && this.target) {
      const to = this.pos.clone().sub(this.target).setY(0); const d = to.length();
      goal = d > 12 ? this.target.clone().add(to.normalize().multiplyScalar(10)) : null;
      this.faceTowards(this.target, dt, 6);
    } else if (this.lastKnown && this.state === 'search') goal = this.lastKnown.clone();
    else { const t = performance.now() / 1000 + this.id; const R = this.dRad ?? 5; goal = this.post.clone().add(V(Math.cos(t * 0.3) * R, 0, Math.sin(t * 0.3) * R)); }
    if (this.dWander && (this.dWanderT -= dt) > 0) goal = this.dWander;   // escaping a wall: fly to a clear spot first
    else this.dWander = null;
    const want = V();
    if (goal) { want.copy(goal).sub(this.pos).setY(0); const l = want.length(); if (l > 0.5) want.multiplyScalar(Math.min(this.T.walk, l) / l * this.lockSlow); else want.set(0, 0, 0); if (this.state !== 'combat' && want.lengthSq() > 0.01) this.faceTowards(this.pos.clone().add(want), dt, 3); }
    const targetY = Math.max(this.groundY, goal?.y ?? -99) + this.hover + Math.sin(performance.now() / 600 + this.id) * 0.15;
    want.y = clamp((targetY - this.pos.y) * 2, -2, 2);
    this.vel.lerp(want, Math.min(1, dt * 3));
    const next = this.pos.clone().addScaledVector(this.vel, dt);
    const hit = G.world.raycast(this.pos, this.vel.clone().normalize(), this.vel.length() * dt + 0.6);
    if (hit) { this.vel.addScaledVector(hit.normal, -this.vel.dot(hit.normal)); this.vel.y += 1.5 * dt; this.dStuck = (this.dStuck || 0) + dt; }
    else { this.pos.copy(next); this.dStuck = Math.max(0, (this.dStuck || 0) - dt * 0.25); }
    // Grinding against a wall: pick the most open of 8 headings and fly there for a few seconds.
    if (this.dStuck > 0.4) {
      this.dStuck = 0; this.dRad = Math.max(1.5, (this.dRad ?? 5) * 0.6);   // tighter orbit so it stops re-hitting the same wall
      let best = 0, bx = 0, bz = 0;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 + Math.random() * 0.3, dir = V(Math.cos(a), 0, Math.sin(a));
        const h = G.world.raycast(this.pos, dir, 8), d = h ? h.t : 8;
        if (d > best) { best = d; bx = dir.x; bz = dir.z; }
      }
      const go = Math.max(0, best - 1);
      this.dWander = V(this.pos.x + bx * go, this.pos.y - this.hover, this.pos.z + bz * go); this.dWanderT = 3;
      this.post.set(this.dWander.x, this.post.y, this.dWander.z);   // re-centre patrol on open space
    }
    if (this.state === 'search' && this.lastKnown && this.pos.distanceTo(this.lastKnown) < 3) { this.searchT -= dt; if (this.searchT <= 0) this.state = 'patrol'; }
    this.play(this.burstLeft > 0 ? 'fire' : 'hover');
  }
  updateTurret(dt, G) {
    if (this.target && this.blindT <= 0) this.faceTowards(this.target, dt, 2.2);
    else if (this.lastKnown && this.alertT > 0) this.faceTowards(this.lastKnown, dt, 1.5);
    else this.yaw = this.postYaw + Math.sin(performance.now() / 1800 + this.id) * 0.9;
    this.play(this.burstLeft > 0 ? 'fire' : 'idle');
  }
  updateShooting(dt, G) {
    this.shotT -= dt; this.reactT -= dt;
    const canShoot = this.state === 'combat' && this.target && this.blindT <= 0 && this.reactT <= 0 && this.staggerT <= 0;
    if (this.S.laser) {                                     // sniper: visible laser wind-up, then one heavy shot
      if (canShoot && this.shotT <= 0 && this.laserT <= 0 && this.targetKind === 'player' && !G.dmParity && !claimToken(this, 'heavy', diffOf(G))) { this.shotT = rand(0.4, 0.8); return; }
      if (canShoot && this.shotT <= 0) {
        this.laserT += dt; G.sniperLaser(this, this.target, this.laserT / this.S.laser);
        if (this.laserT >= this.S.laser) { this.laserT = 0; this.fire(G); releaseToken(this); this.shotT = rand(...this.S.pause); }
      } else if (this.laserT > 0) { releaseToken(this); this.laserT = Math.max(0, this.laserT - dt * 2); if (this.laserT === 0) G.sniperLaser(this, null, 0); else G.sniperLaser(this, this.target || this.lastKnown, this.laserT / this.S.laser); }
      return;
    }
    if (!canShoot) { this.burstLeft = 0; this.aimT = 0; releaseToken(this); return; }
    if (this.laserT > 0) { this.laserT = 0; G.sniperLaser(this, null, 0); }
    if (this.burstLeft <= 0 && this.shotT <= 0) {              // readable tell: raise the gun + muzzle glow, then fire
      if (this.aimT <= 0) {
        // claim before committing to the wind-up; decoys don't need a token
        if (this.targetKind === 'player' && !G.dmParity && !claimToken(this, 'ranged', diffOf(G))) { this.shotT = rand(0.25, 0.6); return; }
        this.aimT = AIM_TELL; return;
      }
      this.aimT -= dt; if (this.aimT > 0) return;
      this.aimT = 0; this.burstLeft = Math.round(rand(this.S.burst[0], this.S.burst[1]));
    }
    if (this.burstLeft > 0 && this.shotT <= 0) {
      this.fire(G); this.burstLeft--;
      this.shotT = this.burstLeft > 0 ? this.S.rof : rand(this.S.pause[0], this.S.pause[1]);
      if (this.burstLeft <= 0) releaseToken(this);
    }
  }
  fire(G) {
    const from = this.muzzle(_from), tgt = this.target, diff = diffOf(G);
    // v46: the bullet needs a clear line from the muzzle too. Eye LOS alone let a gun poking past a corner, or a tall bot over a wall, land hits through brick.
    if (!G.world.lineClear(from, tgt)) { this.burstLeft = 0; return; }
    const dist = from.distanceTo(tgt);
    let acc = this.S.acc * clamp(1.25 - dist / (this.S.range * 1.1), 0.15, 1.2);
    acc *= 1 / (1 + Math.max(0, dist - 15) / 30);       // extra long-range falloff
    acc *= 0.25 + 0.75 * clamp(this.sightT / ACC_RAMP, 0, 1);   // settle onto target over ~1.2 s
    acc *= clamp(0.55 + 0.45 * diff, 0.3, 1.6);
    const atP = this.targetKind === 'player';                // player movement only makes the player harder to hit
    acc *= atP && G.player.moving ? 0.7 : 1; acc *= this.lockSlow < 1 ? 0.35 : 1; acc *= this.flinch > 0.3 ? 0.5 : 1;
    if (atP && !G.player.onGround) acc *= 0.6;
    const dm = !!G.dmParity;                             // Deathmatch: bots play by the player's rules (no global nerf, no warning shot)
    if (!dm) acc *= 0.65;                                // global tuning (attack tokens now cap simultaneous shooters)
    const pw = dm ? Math.sqrt((G.dmPower || 1) * (G.botBoost ? G.botBoost(this) : 1)) : 1;   // v28: team DM ramp + comeback boost (split between accuracy and damage)      // DM level power: kill speed scales by dmPower (split between accuracy and damage)
    if (dm) { acc *= 1.05 * pw; if (G.rampage) acc *= 1.3; }
    const nearMiss = !dm && this.targetKind === 'player' && this.firstShot;     // first shot after spotting: a warning crack past the head
    if (this.targetKind === 'player') this.firstShot = false;
    const hit = !nearMiss && (this.targetKind === 'player' ? Math.random() < clamp(acc, 0, 0.95) : this.targetKind === 'bot' && Math.random() < clamp(acc * 1.2, 0, 0.85));
    const to = _to.copy(tgt);
    if (nearMiss) {
      _a.subVectors(tgt, from).setY(0).normalize(); const s = Math.random() < 0.5 ? -1 : 1, m = rand(0.45, 0.7);
      to.x += -_a.z * s * m; to.z += _a.x * s * m; to.y += rand(0.1, 0.35);
    } else if (!hit) { const miss = 0.6 + dist * 0.03; to.x += rand(-miss, miss); to.y += rand(-miss * 0.6, miss * 0.6); to.z += rand(-miss, miss); }
    const dmg = dm ? (DM_DMG[this.S.cls] || 22) * pw * clamp(0.75 + 0.25 * diff, 0.7, 1.4) * (G.rampage ? 1.2 : 1) : this.S.dmg * clamp(0.6 + 0.4 * diff, 0.4, 1.8);
    G.enemyFired(this, from, to, hit ? Math.round(dmg) : 0, this.targetKind === 'bot' ? this.rival : null);
  }
}
