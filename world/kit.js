// Shared Halvane city kit: visual pieces + their collision shapes.
// Every piece paints its geometry with a vertical light gradient (painted depth) and world-scaled UVs,
// registers precise colliders in the World, and is merged per material at finish() for few draw calls.
import * as THREE from 'three';
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';
import { paintedTexture } from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Kit {
  constructor(world, scene, { tint = 1 } = {}) {
    this.world = world; this.scene = scene; this.tint = tint;
    this.batches = new Map();      // material key -> { mat, geos: [] }
    this.root = new THREE.Group(); scene.add(this.root);
    this.lights = []; this.flicker = []; this.water = []; this.beacons = [];
    this.minimap = [];             // footprints for the HUD minimap: {x0,z0,x1,z1,y,kind}
  }

  // ---------- materials ----------
  mat(kind, opts = {}, tile = 2, { unlit = false, transparent = false, opacity = 1, color = 0xffffff } = {}) {
    const key = kind + JSON.stringify(opts) + tile + unlit + transparent;
    if (!this.batches.has(key)) {
      const map = kind === 'flat' ? null : paintedTexture(kind, opts);
      const params = { map, vertexColors: true, color: kind === 'flat' ? opts.color ?? color : color, transparent, opacity };
      const m = unlit ? new THREE.MeshBasicMaterial(params) : new THREE.MeshLambertMaterial(params);
      this.batches.set(key, { mat: m, geos: [], tile, unlit });
    }
    return key;
  }
  _paint(geo, h, { shade = 0.28, top = 1.06 } = {}) {
    const pos = geo.attributes.position, nrm = geo.attributes.normal, n = pos.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = h > 0 ? (pos.getY(i) + h / 2) / h : 1;
      let k = (1 - shade) + shade * t;                 // dark at the bottom, light at the top
      if (nrm.getY(i) > 0.5) k *= top;                  // top faces catch light
      if (nrm.getY(i) < -0.5) k *= 0.7;
      k *= this.tint;
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  _add(key, geo, matrix) {
    geo.applyMatrix4(matrix);
    this.batches.get(key).geos.push(geo.index ? geo.toNonIndexed() : geo);
  }

  // ---------- primitives ----------
  // Box centered at (x, y0 + h/2, z). collide: true | false | 'top' (only the walkable top matters, still solid)
  box(x, y0, z, w, h, d, key, { collide = true, rotY = 0, shade, uvTile } = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const tile = uvTile ?? this.batches.get(key).tile;
    const uv = geo.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
      const j = f * 4 + i; uv.setXY(j, uv.getX(j) * dims[f][0] / tile, uv.getY(j) * dims[f][1] / tile);
    }
    this._paint(geo, h, { shade });
    const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y0 + h / 2, z);
    this._add(key, geo, m);
    if (collide) {
      const rot = Math.abs(Math.sin(rotY)) > 0.5;
      const hw = (rot ? d : w) / 2, hd = (rot ? w : d) / 2;
      this.world.addBox(V(x - hw, y0, z - hd), V(x + hw, y0 + h, z + hd), typeof collide === 'string' ? collide : 'solid');
    }
  }
  cyl(x, y0, z, r, h, key, { collide = true, seg = 8, r2 } = {}) {
    const geo = new THREE.CylinderGeometry(r2 ?? r, r, h, seg);
    this._paint(geo, h);
    this._add(key, geo, new THREE.Matrix4().setPosition(x, y0 + h / 2, z));
    if (collide) this.world.addBox(V(x - r, y0, z - r), V(x + r, y0 + h, z + r), 'pole');
  }
  blob(x, y, z, r, key) {               // low-poly foliage / decoration, no collision
    const geo = new THREE.IcosahedronGeometry(r, 0); this._paint(geo, r * 2, { shade: 0.4 });
    this._add(key, geo, new THREE.Matrix4().makeRotationY(Math.random() * 6).setPosition(x, y, z));
  }

  // ---------- floors / walls ----------
  slab(x0, z0, x1, z1, top, key, depth = 4) {
    this.box((x0 + x1) / 2, top - depth, (z0 + z1) / 2, x1 - x0, depth, z1 - z0, key, { shade: 0.05 });
  }
  wall(x0, z0, x1, z1, y0, h, key, t = 0.4) {
    const horizontal = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const len = horizontal ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    this.box((x0 + x1) / 2, y0, (z0 + z1) / 2, horizontal ? len : t, h, horizontal ? t : len, key);
  }
  invisibleWall(x0, z0, x1, z1, h = 40) {
    this.world.addBox(V(Math.min(x0, x1) - 0.2, -10, Math.min(z0, z1) - 0.2), V(Math.max(x0, x1) + 0.2, h, Math.max(z0, z1) + 0.2), 'bounds');
  }

  // ---------- buildings ----------
  // Solid building block with window grid, trim and roof. side windows on all four faces unless `faces` given.
  building(x0, z0, x1, z1, h, { wall = ['brick', {}], roof = ['roof', {}], trim = 0x5b5f66, windows = true, lit = false,
    faces = ['n', 's', 'e', 'w'], parapet = 0, walkableRoof = false, door = null } = {}) {
    const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.box(cx, 0, cz, W, h, D, this.mat(wall[0], wall[1], 3));
    this.box(cx, h, cz, W + 0.3, 0.3, D + 0.3, this.mat('concrete', { color: trim }, 2), { collide: walkableRoof ? 'roof' : true });
    this.box(cx, h + 0.3, cz, W - 0.2, 0.05, D - 0.2, this.mat(roof[0], roof[1], 4), { collide: false });
    this.minimap.push({ x0, z0, x1, z1, y: h, kind: 'building' });
    if (parapet) {
      const p = parapet, t = 0.35, k = this.mat('concrete', { color: trim }, 2);
      for (const [a, b, c, d2] of [[x0, z0, x1, z0], [x0, z1, x1, z1], [x0, z0, x0, z1], [x1, z0, x1, z1]]) {
        const gaps = (walkableRoof?.gaps || []).filter(g => g.side === (a === c ? (a === x0 ? 'w' : 'e') : (b === z0 ? 'n' : 's')));
        this._wallWithGaps(a, b, c, d2, h + 0.3, p, k, t, gaps);
      }
    }
    if (windows) {
      const wk = this.mat('window', { lit }, 1, { unlit: lit });
      const floors = Math.max(1, Math.floor((h - 1) / 3));
      const place = (face) => {
        const along = face === 'n' || face === 's' ? W : D;
        const n = Math.max(1, Math.floor((along - 2) / 3.2));
        for (let f = 0; f < floors; f++) for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n, y = 1.2 + f * 3;
          if (door && door.face === face && f === 0 && Math.abs(t - door.t) < 0.12) continue;
          const px = face === 'n' || face === 's' ? x0 + W * t : (face === 'e' ? x1 + 0.06 : x0 - 0.06);
          const pz = face === 'e' || face === 'w' ? z0 + D * t : (face === 's' ? z1 + 0.06 : z0 - 0.06);
          const vertical = face === 'e' || face === 'w';
          this.box(px, y, pz, vertical ? 0.12 : 1.6, 1.7, vertical ? 1.6 : 0.12, wk, { collide: false, uvTile: 1.7 });
          this.box(px, y - 0.12, pz, vertical ? 0.3 : 1.9, 0.12, vertical ? 1.9 : 0.3, this.mat('concrete', { color: trim }, 2), { collide: false });
        }
      };
      for (const f of faces) place(f);
    }
    if (door) {
      const along = door.face === 'n' || door.face === 's' ? W : D;
      const px = door.face === 'n' || door.face === 's' ? x0 + W * door.t : (door.face === 'e' ? x1 + 0.05 : x0 - 0.05);
      const pz = door.face === 'e' || door.face === 'w' ? z0 + D * door.t : (door.face === 's' ? z1 + 0.05 : z0 - 0.05);
      const vertical = door.face === 'e' || door.face === 'w';
      this.box(px, 0, pz, vertical ? 0.1 : 1.6, 2.4, vertical ? 1.6 : 0.1, this.mat('metal', { color: 0x4a5866 }, 2.4), { collide: false });
    }
  }
  _wallWithGaps(x0, z0, x1, z1, y0, h, key, t, gaps) {
    const horizontal = z0 === z1;
    const lo = horizontal ? x0 : z0, hi = horizontal ? x1 : z1;
    const cuts = gaps.map(g => [g.from, g.to]).sort((a, b) => a[0] - b[0]);
    let cur = lo;
    for (const [a, b] of cuts) { if (a > cur) this._seg(horizontal, cur, a, x0, z0, y0, h, key, t); cur = Math.max(cur, b); }
    if (cur < hi) this._seg(horizontal, cur, hi, x0, z0, y0, h, key, t);
  }
  _seg(horizontal, a, b, x0, z0, y0, h, key, t) {
    if (horizontal) this.box((a + b) / 2, y0, z0, b - a, h, t, key);
    else this.box(x0, y0, (a + b) / 2, t, h, b - a, key);
  }

  // ---------- vertical movement ----------
  // Stairs rendered as steps; collision is a smooth ramp. axis 'x'|'z', dir +1/-1 = direction of rising.
  stairs(x0, z0, x1, z1, yLow, yHigh, axis, dir, key, { solidBelow = true, sideRails = [] } = {}) {
    const run = axis === 'x' ? x1 - x0 : z1 - z0, rise = yHigh - yLow;
    const steps = Math.max(2, Math.round(rise / 0.25));
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const a = dir > 0 ? t0 : 1 - t1, b = dir > 0 ? t1 : 1 - t0;
      const top = yLow + rise * t1;
      const bottom = solidBelow ? yLow : top - 0.25;
      if (axis === 'x') this.box(x0 + run * (a + b) / 2, bottom, (z0 + z1) / 2, run * (b - a), top - bottom, z1 - z0, key, { collide: false });
      else this.box((x0 + x1) / 2, bottom, z0 + run * (a + b) / 2, x1 - x0, top - bottom, run * (b - a), key, { collide: false });
    }
    this.world.addRamp(V(x0, yLow, z0), V(x1, yHigh, z1), axis, dir);
    for (const side of sideRails) this.railing(...side);
  }
  ramp(x0, z0, x1, z1, yLow, yHigh, axis, dir, key) {
    const geo = new THREE.BoxGeometry(x1 - x0, 0.15, z1 - z0);
    const run = axis === 'x' ? x1 - x0 : z1 - z0, rise = yHigh - yLow;
    const angle = Math.atan2(rise, run) * dir;
    const m = new THREE.Matrix4().makeRotationAxis(axis === 'x' ? V(0, 0, 1) : V(-1, 0, 0), angle)
      .setPosition((x0 + x1) / 2, (yLow + yHigh) / 2, (z0 + z1) / 2);
    const len = Math.hypot(run, rise);
    const g2 = new THREE.BoxGeometry(axis === 'x' ? len : x1 - x0, 0.15, axis === 'z' ? len : z1 - z0);
    this._paint(g2, 0.15); this._add(key, g2, m);
    this.world.addRamp(V(x0, yLow, z0), V(x1, yHigh, z1), axis, dir);
  }
  // Railing between two points at height y (thin collider so nobody walks off edges).
  railing(x0, z0, x1, z1, y0, h = 1.05, y1 = null) {
    const k = this.mat('metal', { color: 0x3b4450 }, 1);
    const horizontal = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const len = horizontal ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const top = Math.max(y0, y1 ?? y0) + h;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // visual: top bar + posts
    this.box(cx, (y0 + (y1 ?? y0)) / 2 + h - 0.06, cz, horizontal ? len : 0.06, 0.06, horizontal ? 0.06 : len, k, { collide: false });
    const posts = Math.max(2, Math.round(len / 1.5));
    for (let i = 0; i <= posts; i++) {
      const t = i / posts, y = y0 + ((y1 ?? y0) - y0) * t;
      this.box(horizontal ? Math.min(x0, x1) + len * t : cx, y, horizontal ? cz : Math.min(z0, z1) + len * t, 0.06, h, 0.06, k, { collide: false });
    }
    this.world.addBox(V(Math.min(x0, x1) - (horizontal ? 0 : 0.05), Math.min(y0, y1 ?? y0), Math.min(z0, z1) - (horizontal ? 0.05 : 0)),
      V(Math.max(x0, x1) + (horizontal ? 0 : 0.05), top, Math.max(z0, z1) + (horizontal ? 0.05 : 0)), 'railing');
  }
  // Thin walkable platform (catwalk / landing) with open space beneath.
  platform(x0, z0, x1, z1, y, key, rails = '') {
    this.box((x0 + x1) / 2, y - 0.15, (z0 + z1) / 2, x1 - x0, 0.15, z1 - z0, key, { collide: 'platform' });
    if (rails.includes('n')) this.railing(x0, z0, x1, z0, y);
    if (rails.includes('s')) this.railing(x0, z1, x1, z1, y);
    if (rails.includes('w')) this.railing(x0, z0, x0, z1, y);
    if (rails.includes('e')) this.railing(x1, z0, x1, z1, y);
  }

  // ---------- props (all climbable ones have collision tops) ----------
  crate(x, z, y = 0, s = 1.0, rotY = 0) {
    this.box(x, y, z, s, s, s, this.mat('wood', {}, s), { rotY: 0, uvTile: s });
    this.minimap.push({ x0: x - s / 2, z0: z - s / 2, x1: x + s / 2, z1: z + s / 2, y: y + s, kind: 'prop' });
  }
  barrel(x, z, y = 0, color = 0x2f6fb0) {
    this.cyl(x, y, z, 0.32, 0.95, this.mat('metal', { color }, 1), { seg: 10 });
    this.cyl(x, y + 0.3, z, 0.335, 0.06, this.mat('flat', { color: 0x222222 }), { collide: false, seg: 10 });
    this.cyl(x, y + 0.65, z, 0.335, 0.06, this.mat('flat', { color: 0x222222 }), { collide: false, seg: 10 });
  }
  car(x, z, rotY = 0, color = 0x2f9e44) {
    const rot = Math.abs(Math.sin(rotY)) > 0.5;
    const L = 4.2, W = 1.9;
    const body = this.mat('flat', { color }), dark = this.mat('flat', { color: 0x1c1f24 }), glass = this.mat('window', {}, 1);
    const bx = (w, d) => rot ? [d, w] : [w, d];
    const [bw, bd] = bx(L, W);
    this.box(x, 0.35, z, bw, 0.55, bd, body, { collide: 'car' });
    const [cw, cd] = bx(L * 0.55, W * 0.88);
    this.box(x, 0.9, z, cw, 0.6, cd, glass, { collide: 'car', uvTile: 1.2 });
    this.box(x, 1.5, z, cw * 0.98, 0.08, cd * 0.98, body, { collide: false });
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const [ox, oz] = rot ? [b * W * 0.45, a * L * 0.32] : [a * L * 0.32, b * W * 0.45];
      this.box(x + ox, 0, z + oz, rot ? 0.25 : 0.7, 0.7, rot ? 0.7 : 0.25, dark, { collide: false });
    }
    const [hx, hz] = rot ? [0, L / 2] : [L / 2, 0];
    this.box(x + hx, 0.55, z + hz, rot ? 1.5 : 0.06, 0.18, rot ? 0.06 : 1.5, this.mat('flat', { color: 0xfff4c2 }, 1, { unlit: true }), { collide: false });
    this.minimap.push({ x0: x - bw / 2, z0: z - bd / 2, x1: x + bw / 2, z1: z + bd / 2, y: 1.5, kind: 'car' });
  }
  container(x, z, y = 0, rotY = 0, color = 0xc0392b, tag) {
    const rot = Math.abs(Math.sin(rotY)) > 0.5;
    const L = 6.1, W = 2.44, H = 2.6;
    this.box(x, y, z, rot ? W : L, H, rot ? L : W, this.mat('corrugated', { color, tag }, 2.6));
    this.minimap.push({ x0: x - (rot ? W : L) / 2, z0: z - (rot ? L : W) / 2, x1: x + (rot ? W : L) / 2, z1: z + (rot ? L : W) / 2, y: y + H, kind: 'container' });
  }
  streetlight(x, z, { on = true, flicker = false, light = false } = {}) {
    this.cyl(x, 0, z, 0.08, 5, this.mat('metal', { color: 0x30363d }, 1), { seg: 6 });
    this.box(x + 0.6, 4.9, z, 1.3, 0.12, 0.12, this.mat('metal', { color: 0x30363d }, 1), { collide: false });
    const lampKey = this.mat('flat', { color: on ? 0xfff1b8 : 0x555555 }, 1, { unlit: on });
    this.box(x + 1.15, 4.7, z, 0.45, 0.2, 0.3, lampKey, { collide: false });
    if (light) {
      const l = new THREE.PointLight(0xffd28a, 14, 16, 2); l.position.set(x + 1.15, 4.5, z); this.root.add(l);
      this.lights.push(l); if (flicker) this.flicker.push({ l, base: 14, phase: Math.random() * 10 });
    }
  }
  acUnit(x, z, y, h = 1.0) {
    this.box(x, y, z, 1.8, h, 1.4, this.mat('metal', { color: 0xa9b2bc }, 1.4));
    this.cyl(x, y + h, z, 0.45, 0.05, this.mat('flat', { color: 0x2a2f36 }), { collide: false, seg: 12 });
  }
  billboard(x, z, y, w, h, text, { bg = 0xe63946, fg = '#ffd23b', face = 's' } = {}) {
    const vertical = face === 'e' || face === 'w';
    for (const s of [-1, 1]) {
      const px = vertical ? x : x + s * (w / 2 - 0.3), pz = vertical ? z + s * (w / 2 - 0.3) : z;
      this.box(px, y, pz, 0.2, h + 2, 0.2, this.mat('metal', { color: 0x30363d }, 1));
    }
    this.box(x, y + 2, z, vertical ? 0.25 : w, h, vertical ? w : 0.25, this.mat('sign', { text, bg, fg, size: 46 }, 1), { collide: false, uvTile: Math.max(w, h) });
  }
  tree(x, z, y = 0) {
    this.box(x, y, z, 1.6, 0.6, 1.6, this.mat('concrete', { color: 0x9b958a }, 1.6));
    this.cyl(x, y + 0.6, z, 0.12, 1.6, this.mat('wood', { color: 0x6b4a2b }, 1), { collide: false, seg: 6 });
    const leaf = this.mat('flat', { color: 0x4caf50 });
    this.blob(x, y + 2.6, z, 1.0, leaf); this.blob(x + 0.5, y + 2.3, z + 0.3, 0.7, leaf); this.blob(x - 0.4, y + 2.4, z - 0.4, 0.75, leaf);
  }
  bench(x, z, rotY = 0) {
    const k = this.mat('wood', { color: 0x9c6b3c }, 1);
    const rot = Math.abs(Math.sin(rotY)) > 0.5;
    this.box(x, 0.4, z, rot ? 0.5 : 1.8, 0.1, rot ? 1.8 : 0.5, k, { collide: false });
    this.box(x, 0, z, rot ? 0.5 : 1.8, 0.45, rot ? 1.8 : 0.5, this.mat('metal', { color: 0x30363d }, 1), { collide: 'prop' });
  }
  dumpster(x, z, rotY = 0) {
    const rot = Math.abs(Math.sin(rotY)) > 0.5;
    this.box(x, 0, z, rot ? 1.4 : 2.2, 1.3, rot ? 2.2 : 1.4, this.mat('metal', { color: 0x2e7d32 }, 1.4));
  }
  serverRack(x, z, y, rotY = 0, w = 0.9, h = 2.2, d = 1.2, glow = 0x3aa0ff) {
    const rot = Math.abs(Math.sin(rotY)) > 0.5;
    this.box(x, y, z, rot ? d : w, h, rot ? w : d, this.mat('metal', { color: 0x2a2f38 }, 1.1));
    for (let i = 0; i < 5; i++) {
      const yy = y + 0.3 + i * 0.38;
      this.box(x + (rot ? d / 2 + 0.01 : 0), yy, z + (rot ? 0 : d / 2 + 0.01), rot ? 0.02 : w * 0.8, 0.05, rot ? w * 0.8 : 0.02, this.mat('flat', { color: glow }, 1, { unlit: true }), { collide: false });
    }
  }
  crane(x, z, h = 22) {
    const k = this.mat('metal', { color: 0xf2b134 }, 2);
    for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) this.box(x + a, 0, z + b, 0.6, h, 0.6, k);
    this.box(x, h, z - 8, 1.2, 1.2, 26, k, { collide: false });
    this.box(x, h - 3, z, 7, 3, 4, k, { collide: false });
  }
  civicTower(x, z) {
    const k = this.mat('concrete', { color: 0xd9e2ec }, 6), g = this.mat('window', { glass: 0x6fb6ff }, 4);
    this.box(x, 0, z, 26, 90, 26, k, { collide: false });
    this.box(x, 0, z, 26.4, 86, 18, g, { collide: false, uvTile: 4 });
    this.box(x, 90, z, 16, 24, 16, k, { collide: false });
    this.box(x, 114, z, 3, 16, 3, this.mat('metal', {}, 2), { collide: false });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(2, 12, 8), new THREE.MeshBasicMaterial({ color: 0x3aa0ff }));
    beacon.position.set(x, 131, z); this.root.add(beacon); this.beacons.push(beacon);
    this.billboard(x, z + 13.5, 70, 18, 6, 'CIVIC SHIELD', { bg: 0x1d4f91, fg: '#ffffff' });
  }
  waterPlane(x0, z0, x1, z1, y, color = 0x2f6f8f) {
    const tex = paintedTexture('water', { color }).clone(); tex.needsUpdate = true;
    tex.repeat.set((x1 - x0) / 6, (z1 - z0) / 6);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0),
      new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.82 }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); this.root.add(m); this.water.push(tex);
  }

  // Single painted graffiti/decal on a wall face ('n','s','e','w' = which way it faces).
  decal(x, y, z, face, w, h, text, color = '#ffd23b') {
    const tex = paintedTexture('graffiti', { text, color, size: text.length > 6 ? 46 : 64 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(x, y, z); m.rotation.y = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[face];
    this.root.add(m);
  }

  // ---------- finish ----------
  // Merge per material; heavy materials are also split per 64 m tile so the camera frustum can skip whole chunks of the city.
  finish() {
    const TILE = 64, box = new THREE.Box3(), c = new THREE.Vector3();
    for (const { mat, geos } of this.batches.values()) {
      if (!geos.length) continue;
      const tiles = new Map();
      for (const g of geos) {
        g.computeBoundingBox(); box.copy(g.boundingBox); box.getCenter(c);
        const big = box.max.x - box.min.x > TILE * 1.5 || box.max.z - box.min.z > TILE * 1.5;
        let tris = 0; for (const q of geos) tris += q.attributes.position.count / 3;
        const key = big || tris < 6000 ? 'big' : Math.floor(c.x / TILE) + ',' + Math.floor(c.z / TILE);
        if (!tiles.has(key)) tiles.set(key, []); tiles.get(key).push(g);
      }
      for (const list of tiles.values()) {
        const merged = mergeGeometries(list, false); merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = !mat.transparent; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
        this.root.add(mesh);
        for (const g of list) g.dispose();
      }
    }
    this.batches.clear();
    return this.root;
  }
  update(dt, t) {
    for (const tex of this.water) { tex.offset.x += dt * 0.02; tex.offset.y += dt * 0.01; }
    for (const f of this.flicker) f.l.intensity = f.base * (Math.sin(t * 13 + f.phase) > 0.85 || Math.sin(t * 2.3 + f.phase) > 0.97 ? 0.15 : 1);
    for (const b of this.beacons) b.material.color.setHSL(0.58, 1, 0.45 + 0.25 * Math.max(0, Math.sin(t * 3)));
  }
  dispose() {
    this.scene.remove(this.root);
    this.root.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });   // painted textures are cached and shared
  }
}
