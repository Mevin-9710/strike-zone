// Server line of sight for hits. The map colliders (server/maps.json, made by tools/export_server_maps.cjs) sit on a 4 m grid.
// A hit is refused when every line from the shooter's eye to the victim's head, chest and both shoulders is blocked. Lenient on
// purpose: positions are up to ~150 ms old, so boxes are shrunk by LOS_SHRINK, boxes holding either end are skipped, and low
// cover (under 1 m) is ignored. Map index: 0-3 the arenas (world/dm-maps.js order), 4 Island Ring.
import fs from 'node:fs';
const LOS_CELL = 4, LOS_SHRINK = 0.35;
const LOS = (() => {
  let raw; try { raw = JSON.parse(fs.readFileSync(new URL('./maps.json', import.meta.url))); } catch { console.log('maps.json missing: no line-of-sight checks'); return []; }
  return raw.maps.map(list => {
    const grid = new Map(), boxes = [];
    for (const a of list) {
      if (a[4] - a[1] < 1) continue;                                                     // low cover: a crouch/peek over it is fine
      const sx = a[3] - a[0] > 3 * LOS_SHRINK ? LOS_SHRINK : 0, sz = a[5] - a[2] > 3 * LOS_SHRINK ? LOS_SHRINK : 0;   // thin walls keep their thickness
      const b = { a: [a[0] + sx, a[1], a[2] + sz, a[3] - sx, a[4] - 0.1, a[5] - sz], s: 0 };
      boxes.push(b);
      for (let x = Math.floor(b.a[0] / LOS_CELL); x <= Math.floor(b.a[3] / LOS_CELL); x++)
        for (let z = Math.floor(b.a[2] / LOS_CELL); z <= Math.floor(b.a[5] / LOS_CELL); z++) { const k = x * 4096 + z; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(b); }
    }
    return { grid, boxes };
  });
})();
let losStamp = 0;
const inBox = (b, x, y, z) => x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5];
function segBlocked(m, ax, ay, az, bx, by, bz) {                                         // does any box cut the segment a->b?
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dz), steps = Math.ceil(len / 1.5) + 1, st = ++losStamp;
  for (let i = 0; i <= steps; i++) {                                                     // walk the grid cells under the segment (1.5 m samples on 4 m cells)
    const t = i / steps, l = m.grid.get(Math.floor((ax + dx * t) / LOS_CELL) * 4096 + Math.floor((az + dz * t) / LOS_CELL)); if (!l) continue;
    for (const o of l) {
      if (o.s === st) continue; o.s = st; const b = o.a;
      if (inBox(b, ax, ay, az) || inBox(b, bx, by, bz)) continue;
      let t0 = 0, t1 = 1;                                                                // slab test
      for (let k = 0; k < 3; k++) {
        const p = k === 0 ? ax : k === 1 ? ay : az, d = k === 0 ? dx : k === 1 ? dy : dz, lo = b[k], hi = b[k + 3];
        if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = 2; break; } continue; }
        let u = (lo - p) / d, v = (hi - p) / d; if (u > v) { const w = u; u = v; v = w; }
        if (u > t0) t0 = u; if (v < t1) t1 = v; if (t0 > t1) break;
      }
      if (t0 <= t1) return true;
    }
  }
  return false;
}
export function losOk(map, s, v) {                                                      // s, v: [x, y, z] feet positions of shooter and victim
  const m = LOS[map]; if (!m) return true;
  const ex = s[0], ey = s[1] + 1.5, ez = s[2], dx = v[0] - ex, dz = v[2] - ez, l = Math.hypot(dx, dz) || 1, ox = -dz / l * 0.45, oz = dx / l * 0.45;
  return !segBlocked(m, ex, ey, ez, v[0], v[1] + 1.6, v[2]) || !segBlocked(m, ex, ey, ez, v[0], v[1] + 1.1, v[2])
    || !segBlocked(m, ex, ey, ez, v[0] + ox, v[1] + 1.3, v[2] + oz) || !segBlocked(m, ex, ey, ez, v[0] - ox, v[1] + 1.3, v[2] - oz);
}
export const losMaps = () => LOS.length;

