// Collision world shared by movement, bullets, line of sight and AI navigation.
// Colliders: axis-aligned boxes and ramps (wedges rising along +/-X or +/-Z).
// Entities: vertical capsules approximated as a cylinder (radius r, height h, feet at pos.y).
import * as THREE from 'three';

const CELL = 4;
const EPS = 1e-4;

export class World {
  constructor() {
    this.solids = [];
    this.grid = new Map();
    this.nav = null;
  }

  // ---------- building ----------
  addBox(min, max, tag = 'solid') {
    const c = { min: min.clone(), max: max.clone(), ramp: null, tag, id: this.solids.length };
    this.solids.push(c); this._index(c); return c;
  }
  // Ramp: occupies the box min..max; walkable surface rises from min.y to max.y along `axis` in direction `dir` (+1/-1).
  addRamp(min, max, axis, dir, tag = 'ramp') {
    const c = { min: min.clone(), max: max.clone(), ramp: { axis, dir }, tag, id: this.solids.length };
    this.solids.push(c); this._index(c); return c;
  }
  // Remove a collider (breached wall, destroyed prop). Nav links gated on it open up.
  removeBox(c) {
    c.dead = true;
    for (const l of this.grid.values()) { const i = l.indexOf(c); if (i >= 0) l.splice(i, 1); }
    if (c.gate) c.gate.open = true;
  }
  _index(c) {
    for (let x = Math.floor(c.min.x / CELL); x <= Math.floor(c.max.x / CELL); x++)
      for (let z = Math.floor(c.min.z / CELL); z <= Math.floor(c.max.z / CELL); z++) {
        const k = x + ',' + z; if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(c);
      }
  }
  near(x, z, r) {
    const out = new Set();
    for (let gx = Math.floor((x - r) / CELL); gx <= Math.floor((x + r) / CELL); gx++)
      for (let gz = Math.floor((z - r) / CELL); gz <= Math.floor((z + r) / CELL); gz++) {
        const l = this.grid.get(gx + ',' + gz); if (l) for (const c of l) out.add(c);
      }
    return out;
  }

  // ---------- shape queries ----------
  surface(c, x, z) {
    if (!c.ramp) return c.max.y;
    const { axis, dir } = c.ramp;
    const lo = axis === 'x' ? c.min.x : c.min.z, hi = axis === 'x' ? c.max.x : c.max.z;
    let t = ((axis === 'x' ? x : z) - lo) / (hi - lo); t = Math.min(1, Math.max(0, t));
    if (dir < 0) t = 1 - t;
    return c.min.y + (c.max.y - c.min.y) * t;
  }
  static circleRect(x, z, r, c) {
    const cx = Math.max(c.min.x, Math.min(x, c.max.x)), cz = Math.max(c.min.z, Math.min(z, c.max.z));
    const dx = x - cx, dz = z - cz;
    return { hit: dx * dx + dz * dz < r * r - EPS, cx, cz, dx, dz, inside: dx === 0 && dz === 0 };
  }
  // Highest walkable surface under a circle that is no higher than feetY + step.
  groundHeight(x, z, r, feetY, step) {
    let g = -Infinity;
    for (const c of this.near(x, z, r)) {
      const q = World.circleRect(x, z, r, c);
      if (!q.hit) continue;
      const s = this.surface(c, Math.max(c.min.x, Math.min(x, c.max.x)), Math.max(c.min.z, Math.min(z, c.max.z)));
      if (s <= feetY + step + EPS && s > g) g = s;
    }
    return g;
  }
  // Push a capsule out of every collider it overlaps that is too tall to step onto.
  resolve(e, step) {
    let pushed = false;
    for (let iter = 0; iter < 4; iter++) {
      let any = false;
      for (const c of this.near(e.pos.x, e.pos.z, e.r + 0.1)) {
        if (c.min.y >= e.pos.y + e.h - EPS) continue;               // above the head
        const q = World.circleRect(e.pos.x, e.pos.z, e.r, c);
        if (!q.hit) continue;
        const top = this.surface(c, q.cx, q.cz);
        if (top <= e.pos.y + step + EPS) continue;                 // low enough to step onto: not a wall
        if (q.inside) {
          const pens = [[e.pos.x - c.min.x + e.r, -1, 0], [c.max.x - e.pos.x + e.r, 1, 0], [e.pos.z - c.min.z + e.r, 0, -1], [c.max.z - e.pos.z + e.r, 0, 1]];
          pens.sort((a, b) => a[0] - b[0]);
          e.pos.x += pens[0][1] * pens[0][0]; e.pos.z += pens[0][2] * pens[0][0];
        } else {
          const d = Math.hypot(q.dx, q.dz), push = e.r - d + 0.001;
          e.pos.x += (q.dx / d) * push; e.pos.z += (q.dz / d) * push;
          // wall slide: remove the velocity component going into the wall
          if (e.vel) { const nx = q.dx / d, nz = q.dz / d, vn = e.vel.x * nx + e.vel.z * nz; if (vn < 0) { e.vel.x -= vn * nx; e.vel.z -= vn * nz; } }
        }
        any = pushed = true;
      }
      if (!any) break;
    }
    return pushed;
  }
  // Is this capsule overlapping anything solid (ignoring surfaces it could stand on)?
  overlaps(pos, r, h, step = 0.05) {
    for (const c of this.near(pos.x, pos.z, r + 0.1)) {
      if (c.min.y >= pos.y + h - EPS) continue;
      const q = World.circleRect(pos.x, pos.z, r, c);
      if (!q.hit) continue;
      if (this.surface(c, q.cx, q.cz) <= pos.y + step + EPS) continue;
      return c;
    }
    return null;
  }

  // Move an entity {pos, vel, r, h, onGround} with gravity, collisions, step-up and ramp sticking.
  move(e, dt, { step = 0.45, gravity = 24 } = {}) {
    const wasGround = e.onGround;
    // horizontal, sub-stepped so fast movement (dash) can't tunnel through thin walls
    const hs = Math.hypot(e.vel.x, e.vel.z) * dt;
    const n = Math.max(1, Math.ceil(hs / (e.r * 0.5)));
    for (let i = 0; i < n; i++) {
      e.pos.x += (e.vel.x * dt) / n; e.pos.z += (e.vel.z * dt) / n;
      this.resolve(e, wasGround ? step : 0.12);
      // step up onto low ledges / stairs while grounded
      if (wasGround) {
        const g = this.groundHeight(e.pos.x, e.pos.z, e.r * 0.7, e.pos.y, step);
        if (g > e.pos.y) e.pos.y = g;
      }
    }
    // vertical
    e.vel.y -= gravity * dt;
    const ny = e.pos.y + e.vel.y * dt;
    if (e.vel.y > 0) {                                     // ceiling
      for (const c of this.near(e.pos.x, e.pos.z, e.r)) {
        if (!World.circleRect(e.pos.x, e.pos.z, e.r * 0.8, c).hit) continue;
        if (c.min.y >= e.pos.y + e.h - 0.01 && c.min.y < ny + e.h) { e.vel.y = 0; e.pos.y = c.min.y - e.h - 0.01; return; }
      }
    }
    const ground = this.groundHeight(e.pos.x, e.pos.z, e.r * 0.7, Math.max(e.pos.y, ny), wasGround ? step : 0.05);
    const snap = wasGround && e.vel.y <= 0 && ground > -Infinity && e.pos.y - ground <= step + 0.05;   // stick to ramps/stairs going down
    if (ny <= ground || snap) { e.pos.y = ground; e.vel.y = 0; e.onGround = true; }
    else { e.pos.y = ny; e.onGround = false; }
  }

  // ---------- rays (bullets, line of sight) ----------
  _rayBox(c, origin, dir, inv, maxDist) {
    let t0 = 0, t1 = maxDist, nAxis = -1, nSign = 0;
    for (let a = 0; a < 3; a++) {
      const o = a === 0 ? origin.x : a === 1 ? origin.y : origin.z, iv = a === 0 ? inv.x : a === 1 ? inv.y : inv.z;
      const mn = a === 0 ? c.min.x : a === 1 ? c.min.y : c.min.z, mx = a === 0 ? c.max.x : a === 1 ? c.max.y : c.max.z;
      let ta = (mn - o) * iv, tb = (mx - o) * iv, sign = -1;
      if (ta > tb) { const t = ta; ta = tb; tb = t; sign = 1; }
      if (ta > t0) { t0 = ta; nAxis = a; nSign = sign; }
      if (tb < t1) t1 = tb;
      if (t0 > t1) return null;
    }
    let t = t0;
    if (c.ramp) {
      let found = false;
      for (let k = 0; k <= 16; k++) {
        const tt = t0 + (t1 - t0) * (k / 16);
        const px = origin.x + dir.x * tt, py = origin.y + dir.y * tt, pz = origin.z + dir.z * tt;
        if (py <= this.surface(c, px, pz) + 0.01) { t = tt; found = true; break; }
      }
      if (!found) return null;
      return { t, nAxis: 1, nSign: 1 };
    }
    return t < 0 ? null : { t, nAxis, nSign };
  }
  // Grid-walking ray cast (2D DDA over the collider grid): cost scales with distance, not map size.
  raycast(origin, dir, maxDist = 200) {
    const inv = { x: 1 / (dir.x || 1e-9), y: 1 / (dir.y || 1e-9), z: 1 / (dir.z || 1e-9) };
    const stamp = ++this._stamp || (this._stamp = 1);
    let best = null;
    let gx = Math.floor(origin.x / CELL), gz = Math.floor(origin.z / CELL);
    const sx = dir.x > 0 ? 1 : -1, sz = dir.z > 0 ? 1 : -1;
    const dX = Math.abs(CELL * inv.x), dZ = Math.abs(CELL * inv.z);
    let tX = dir.x > 0 ? ((gx + 1) * CELL - origin.x) * inv.x : (origin.x - gx * CELL) * -inv.x;
    let tZ = dir.z > 0 ? ((gz + 1) * CELL - origin.z) * inv.z : (origin.z - gz * CELL) * -inv.z;
    if (!Number.isFinite(tX)) tX = Infinity; if (!Number.isFinite(tZ)) tZ = Infinity;
    let tCell = 0;
    for (let guard = 0; guard < 400; guard++) {
      const l = this.grid.get(gx + ',' + gz);
      if (l) for (const c of l) {
        if (c._ray === stamp) continue; c._ray = stamp;
        const h = this._rayBox(c, origin, dir, inv, maxDist);
        if (h && (!best || h.t < best.t)) best = { t: h.t, c, nAxis: h.nAxis, nSign: h.nSign };
      }
      const tNext = Math.min(tX, tZ);
      if ((best && best.t <= tNext) || tNext > maxDist) break;
      tCell = tNext;
      if (tX < tZ) { tX += dX; gx += sx; } else { tZ += dZ; gz += sz; }
    }
    if (!best) return null;
    const normal = new THREE.Vector3(); if (best.nAxis >= 0) normal.setComponent(best.nAxis, best.nSign);
    return { t: best.t, point: origin.clone().addScaledVector(dir, best.t), normal, collider: best.c };
  }
  lineClear(a, b) {
    const d = new THREE.Vector3().subVectors(b, a); const len = d.length(); if (len < 1e-3) return true;
    const hit = this.raycast(a, d.divideScalar(len), len);
    return !hit || hit.t >= len - 0.05;
  }

  // ---------- navigation graph ----------
  // Walkable nodes on a grid (every surface level), linked when a capsule can walk between them.
  buildNav(bounds, { spacing = 1.0, r = 0.45, h = 1.8, step = 0.45 } = {}) {
    const nodes = [], cells = new Map();
    this.gates = this.solids.filter(c => c.navSkip && !c.dead);
    const saved = new Map(); for (const [k, l] of this.grid) { const f = l.filter(c => !c.navSkip); if (f.length !== l.length) { saved.set(k, l); this.grid.set(k, f); } }
    for (let x = bounds.min.x + spacing / 2; x < bounds.max.x; x += spacing)
      for (let z = bounds.min.z + spacing / 2; z < bounds.max.z; z += spacing) {
        const heights = new Set();
        for (const c of this.near(x, z, 0.01)) {
          if (x < c.min.x || x > c.max.x || z < c.min.z || z > c.max.z) continue;
          heights.add(Math.round(this.surface(c, x, z) * 100) / 100);
        }
        for (const y of heights) {
          const pos = new THREE.Vector3(x, y, z);
          if (this.groundHeight(x, z, r * 0.7, y, 0.02) < y - 0.02) continue;
          if (this.overlaps(pos, r, h, step)) continue;
          const key = Math.round(x / spacing) + ',' + Math.round(z / spacing);
          const node = { id: nodes.length, pos, links: [], key };
          nodes.push(node); if (!cells.has(key)) cells.set(key, []); cells.get(key).push(node);
        }
      }
    const tmp = new THREE.Vector3();
    for (const n of nodes) {
      const [gx, gz] = n.key.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        for (const m of cells.get((gx + dx) + ',' + (gz + dz)) || []) {
          if (m.id < n.id) continue;
          if (Math.abs(m.pos.y - n.pos.y) > spacing * 0.75 + 0.05) continue;
          let ok = true;
          for (let k = 1; k < 6 && ok; k++) {
            tmp.lerpVectors(n.pos, m.pos, k / 6);
            const g = this.groundHeight(tmp.x, tmp.z, r * 0.5, tmp.y + step, step * 2);
            if (g < tmp.y - step) ok = false;
            else { tmp.y = g; if (this.overlaps(tmp, r * 0.9, h, step)) ok = false; }
          }
          if (ok) { const d = n.pos.distanceTo(m.pos), gate = this._gateAt(n.pos, m.pos); n.links.push([m, d, gate]); m.links.push([n, d, gate]); }
        }
      }
    }
    for (const [k, l] of saved) this.grid.set(k, l.filter(c => !c.dead));
    this.nav = { nodes, cells, spacing };
    return this.nav;
  }
  // Colliders added with addGate() are left out of the nav build; links through them wait for gate.open.
  addGate(min, max, tag = 'breach') { const c = this.addBox(min, max, tag); c.gate = { open: false }; c.navSkip = true; return c; }
  _gateAt(a, b) {
    for (const c of this.gates || []) {
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = Math.min(a.y, b.y) + 0.5;
      if (mx > c.min.x - 0.6 && mx < c.max.x + 0.6 && mz > c.min.z - 0.6 && mz < c.max.z + 0.6 && my > c.min.y && my < c.max.y) return c.gate;
    }
    return null;
  }
  // Can a walker get within `reach` of p (gates counted as breachable)?
  reachable(from, p, reach = 2.0) {
    const path = this.findPath(from, p, { ignoreGates: true }); if (!path) return false;
    const e = path[path.length - 1]; return Math.hypot(e.x - p.x, e.z - p.z) < reach && Math.abs(e.y - p.y) < 1.0;
  }
  nearestNode(p) {
    if (!this.nav) return null;
    const { cells, spacing } = this.nav;
    const gx = Math.round(p.x / spacing), gz = Math.round(p.z / spacing);
    let best = null, bd = Infinity;
    for (let ring = 0; ring < 6 && !best; ring++)
      for (let dx = -ring; dx <= ring; dx++) for (let dz = -ring; dz <= ring; dz++) {
        for (const n of cells.get((gx + dx) + ',' + (gz + dz)) || []) {
          const d = n.pos.distanceToSquared(p) + Math.abs(n.pos.y - p.y) * 4;
          if (d < bd && n.links.length) { bd = d; best = n; }
        }
      }
    return best;
  }
  findPath(from, to, { ignoreGates = false } = {}) {
    const a = this.nearestNode(from), b = this.nearestNode(to);
    if (!a || !b) return null;
    // A* with a binary heap
    const heap = [], push = (f, n) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top[1]; };
    const g = new Map([[a.id, 0]]), came = new Map(), closed = new Set();
    push(a.pos.distanceTo(b.pos), a);
    while (heap.length) {
      const cur = pop();
      if (closed.has(cur.id)) continue;
      if (cur === b) {
        const path = [cur.pos.clone()]; let c = cur;
        while (came.has(c.id)) { c = came.get(c.id); path.unshift(c.pos.clone()); }
        return path;
      }
      closed.add(cur.id);
      for (const [m, d, gate] of cur.links) {
        if (gate && !gate.open && !ignoreGates) continue;
        const ng = g.get(cur.id) + d;
        if (ng < (g.get(m.id) ?? Infinity)) { came.set(m.id, cur); g.set(m.id, ng); push(ng + m.pos.distanceTo(b.pos), m); }
      }
    }
    return null;
  }
}
