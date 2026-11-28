// Blastline online server: rooms, bot fill, server-checked hits, scores and the match clock.
// One Node process, plain WebSocket + JSON. See server/README.md for running it on a VPS.
//
// Authority split (phase 1):
//   server  - who is in the room, teams, HP of everyone (players and bots), kills, scores, the clock, Hold the Hill scoring
//   clients - their own movement and aim; a client says "I hit X for N" and the server checks it is believable
//   host    - one client per room (the longest-connected player) also runs the bot AI and streams bot positions;
//             when it leaves, the next player takes the bots over
import { WebSocketServer } from 'ws';
import http from 'node:http';
import { losOk as losMap } from './los.mjs';

const PORT = Number(process.env.PORT || 8787);
const VERSION = 1;                                     // protocol version: clients with another version are refused
const TICK = 20;                                       // snapshots per second
const MODES = {
  tdm: { size: 8, time: 300, target: 40 },             // 4 v 4, first team to 40 kills or most kills after 5 min
  hill: { size: 8, time: 300, target: 100 },           // 4 v 4, first team to 100 hill points
  br: { size: Number(process.env.BR_SIZE || 50), time: 600, target: 0, br: true },   // battle royale on Island Ring: everyone for themselves, no respawns, last one standing
};
// battle royale zone: starts over the whole island, each phase waits, then shrinks to a smaller circle inside the last one
const BR_C = 116, BR_R0 = 175, BR_DROP = Number(process.env.BR_DROP || 40);   // island centre/radius; humans can still join for BR_DROP s
const ZONE = (process.env.ZONE_FAST ? [[8, 8, 110, 6], [6, 6, 70, 8], [6, 6, 40, 10], [5, 5, 18, 14], [5, 5, 3, 20]]
  : [[60, 40, 110, 2], [40, 35, 70, 4], [30, 30, 40, 6], [25, 25, 18, 9], [20, 20, 3, 14]]);   // [wait s, shrink s, radius m, damage/s outside]
const BR_MAP = 4;                                      // map index the client reads as Island Ring
if (process.env.ROUND_TIME) for (const m of Object.values(MODES)) m.time = Number(process.env.ROUND_TIME);   // tests: short rounds
const MAPS = 4;                                        // the four Blastline arenas (world/dm-maps.js order)
const END_PAUSE = Number(process.env.END_PAUSE || 12);                                  // seconds on the end screen before the same room starts the next round
const JOIN_CUTOFF = 45;                                // a new player is not put into a round with less than this many seconds left
const HILL = { radius: 5, rate: 1 };
const BOT_NAMES = ['VIPER', 'ROOK', 'GHOST', 'NOMAD', 'HEX', 'BRAVO', 'KILO', 'RAZOR', 'SABLE', 'ONYX', 'WRAITH', 'JINX', 'FLINT', 'MANTIS', 'COBALT', 'EMBER'];
// weapon table for hit checks (mirrors game/weapons.js: rpm, body damage, headshot multiplier, range)
const WPN = {
  vex_p9: [420, 26, 3, 60], harrow_45: [320, 38, 3, 60], bulldog_r6: [130, 64, 2.5, 80], ar7_lance: [620, 28, 3, 120],
  kestrel_bp: [760, 24, 3, 100], warden_br: [380, 44, 2.6, 140], grinder_lmg: [680, 26, 2.5, 110], hailstorm_mg: [900, 20, 2.5, 90],
  longshot_bolt: [48, 110, 2.5, 250], javelin_amr: [40, 150, 2, 300], blast: [900, 200, 2, 400],   // blast: airstrike + barrels
};
const DMG_SLACK = 2.2;                                 // upgrades (+dmg) and the overdrive streak reward (x1.6) sit inside this
const RANGE_SLACK = 1.35;                              // positions are up to ~150 ms old
const SPAWN_PROTECT = 2.5;                             // seconds of no damage after a respawn
const BOT_MAX_HIT = 60, BOT_MIN_GAP = 0.08;            // bots: per-hit cap and min seconds between hits

let nextId = 1, nextRoom = 1;
const rooms = new Map();
const now = () => performance.now() / 1000;
const clean = s => String(s || '').replace(/[^\w .\-]/g, '').trim().slice(0, 16);
const send = (ws, m) => { if (ws.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };
const pub = e => ({ id: e.id, bot: e.bot, team: e.team, name: e.name, alive: e.alive, hp: e.hp, ar: e.ar || 0, k: e.k, d: e.d, p: e.p, yaw: e.yaw });

// ---------- rooms ----------
function makeRoom(mode, priv = false) {
  const r = { id: (nextRoom++).toString(36) + Math.random().toString(36).slice(2, 6), mode, cfg: MODES[mode], priv, ents: new Map(), host: 0,
    state: 'play', map: mode === 'br' ? BR_MAP : (Math.random() * MAPS) | 0, t0: now(), clock: MODES[mode].time, score: { A: 0, B: 0 }, endT: 0, hill: null, hillOwn: '', hillAcc: 0, botSeq: 0, round: 1 };
  if (mode === 'br') brReset(r);
  rooms.set(r.id, r); fill(r); return r;
}
const humans = r => [...r.ents.values()].filter(e => !e.bot);
const teamOf = (r, t) => [...r.ents.values()].filter(e => e.team === t);
const per = r => r.cfg.size / 2;
function broadcast(r, m, except = 0) { const s = JSON.stringify(m); for (const e of r.ents.values()) if (!e.bot && e.id !== except) send(e.ws, s); }
const isBr = r => r.mode === 'br';
const brOpen = r => isBr(r) && r.state === 'play' && now() - r.t0 < BR_DROP;        // the drop window: humans may still join, bots still fill
const aliveN = r => [...r.ents.values()].filter(e => e.alive || (!e.bot && !e.spawned && r.state === 'play')).length;
function brReset(r) {                                                                  // new BR round: zone over the whole island, loot untaken, fresh seed
  Object.assign(r, { zone: { ph: -1, c: [BR_C, BR_C], r: BR_R0, from: [BR_C, BR_C, BR_R0], to: [BR_C, BR_C, BR_R0], t0: now(), t1: now(), dps: 0, next: now() + ZONE[0][0] },
    taken: new Set(), seed: (Math.random() * 1e9) | 0, out: 0 });
}
function brZone(r, t, dt) {
  const z = r.zone, hum = humans(r).some(e => e.alive || !e.spawned), speed = hum ? 1 : 4;   // nobody human left alive: the bots finish quickly
  if (z.ph < ZONE.length - 1 && t >= z.next) {                                        // next phase: pick a new circle inside the current one
    z.ph++; const [, sh, rad, dps] = ZONE[z.ph], a = Math.random() * Math.PI * 2, off = Math.random() * Math.max(0, z.to[2] - rad);
    z.from = [z.c[0], z.c[1], z.r]; z.to = [z.to[0] + Math.cos(a) * off, z.to[1] + Math.sin(a) * off, rad]; z.t0 = t; z.t1 = t + sh / speed; z.dps = dps;
    z.next = z.t1 + (ZONE[z.ph + 1] ? ZONE[z.ph + 1][0] / speed : 1e9);
    broadcast(r, { t: 'zone', ph: z.ph, to: z.to, sh: +(z.t1 - t).toFixed(1), dps });
  }
  const k = z.t1 > z.t0 ? Math.min(1, Math.max(0, (t - z.t0) / (z.t1 - z.t0))) : 1;
  z.c = [z.from[0] + (z.to[0] - z.from[0]) * k, z.from[1] + (z.to[1] - z.from[1]) * k]; z.r = z.from[2] + (z.to[2] - z.from[2]) * k;
  if (z.ph < 0) return;
  for (const e of r.ents.values()) {                                                   // outside the circle: damage every second, credited to the zone
    if (!e.alive) continue;
    if ((e.p[0] - z.c[0]) ** 2 + (e.p[2] - z.c[1]) ** 2 <= z.r * z.r || e.p[1] < -20) { e.zAcc = 0; continue; }
    e.zAcc = (e.zAcc || 0) + dt * z.dps; if (e.zAcc < 1 && e.hp > e.zAcc) continue;
    const d = Math.min(e.hp, Math.floor(e.zAcc) || e.zAcc); e.zAcc -= d; e.hp = Math.max(0, e.hp - d);
    broadcast(r, { t: 'dmg', s: 0, v: e.id, d: Math.round(d), hp: Math.round(e.hp), hd: false, z: 1 });
    if (e.hp <= 0) kill(r, null, e, false);
  }
}
function addBot(r, team) {
  const used = new Set([...r.ents.values()].map(e => e.name)); let name = BOT_NAMES[r.botSeq++ % BOT_NAMES.length] + ' [BOT]';
  if (used.has(name)) name = BOT_NAMES[(Math.random() * BOT_NAMES.length) | 0] + (r.botSeq % 10) + ' [BOT]';
  if (isBr(r)) team = 'p' + nextId;                                                 // battle royale: everyone is their own team
  const e = { id: nextId++, bot: true, team, name, alive: true, hp: 100, ar: 0, k: 0, d: 0, p: [0, -50, 0], yaw: 0, sp: 0, pi: 0, spawnT: now(), hitLog: [], lastHit: 0 };
  r.ents.set(e.id, e); broadcast(r, { t: 'add', e: pub(e) }); return e;
}
function removeEnt(r, e) { r.ents.delete(e.id); broadcast(r, { t: 'del', id: e.id }); }
// bot fill: each team always has `size/2` members; humans push bots out, leaving humans are replaced by bots
function fill(r) {
  if (isBr(r)) {                                                                       // BR: humans + bots = size, but only while the drop window is open
    if (!brOpen(r)) return;
    const bots = [...r.ents.values()].filter(e => e.bot); let need = r.cfg.size - humans(r).length - bots.length;
    while (need > 0) { addBot(r, ''); need--; }
    while (need < 0 && bots.length) { removeEnt(r, bots.pop()); need++; }
    return;
  }
  for (const t of ['A', 'B']) {
    const m = teamOf(r, t), hum = m.filter(e => !e.bot).length, bots = m.filter(e => e.bot);
    let need = per(r) - hum - bots.length;
    while (need > 0) { addBot(r, t); need--; }
    while (need < 0 && bots.length) { const b = bots.find(x => !x.alive) || bots[bots.length - 1]; bots.splice(bots.indexOf(b), 1); removeEnt(r, b); need++; }
  }
}
function pickRoom(mode, roomId) {
  if (roomId) { const r = rooms.get(roomId); if (r && r.mode === mode && humans(r).length < r.cfg.size) return r; }
  let best = null;
  for (const r of rooms.values()) {
    if (r.mode !== mode || r.priv || humans(r).length >= r.cfg.size) continue;
    if (r.state === 'play' && r.clock < JOIN_CUTOFF) continue;
    if (isBr(r) && !brOpen(r)) continue;                                               // BR: no joining once the drop is over
    if (!best || humans(r).length > humans(best).length) best = r;                   // fill the busiest room first so people meet
  }
  return best || makeRoom(mode);
}
function joinable(r) { return humans(r).length < r.cfg.size && !(r.state === 'play' && r.clock < JOIN_CUTOFF) && (!isBr(r) || brOpen(r)); }
function setHost(r) {                                                                   // desktops first (they run the bot AI better), then the longest-connected
  const h = humans(r).sort((a, b) => (b.desk - a.desk) || (a.joinT - b.joinT))[0]; r.host = h ? h.id : 0;
  if (h) send(h.ws, { t: 'host', on: true });
}
function handHost(r, to) {                                                              // a desktop joined a room hosted by a phone: the desktop takes the bots
  const old = r.ents.get(r.host); if (old && !old.bot) send(old.ws, { t: 'host', on: false });
  r.host = to.id; send(to.ws, { t: 'host', on: true }); log(`host -> ${to.name} (desktop)`);
}

// ---------- joining / leaving ----------
function join(ws, m) {
  if (m.v !== VERSION) { send(ws, { t: 'err', why: 'version', need: VERSION }); ws.close(); return; }
  const mode = MODES[m.mode] ? m.mode : 'tdm';
  const r = pickRoom(mode, m.room ? String(m.room) : null);
  const a = teamOf(r, 'A').filter(e => !e.bot).length, b = teamOf(r, 'B').filter(e => !e.bot).length;
  const id = nextId++, team = isBr(r) ? 'p' + id : a <= b ? 'A' : 'B';
  const e = { id, bot: false, ws, team, name: clean(m.name) || 'Player' + ((Math.random() * 9000 + 1000) | 0), alive: false, hp: 100, ar: 0, k: 0, d: 0, spawned: false,
    p: [0, -50, 0], yaw: 0, sp: 0, pi: 0, w: 'ar7_lance', spawnT: 0, hitLog: [], lastHit: 0, joinT: now(), lastMsg: now(), desk: m.dev === 'm' ? 0 : 1 };
  ws.ent = e; ws.room = r;
  r.ents.set(e.id, e); fill(r);                                                       // a bot on the new player's team steps out
  if (!r.host) r.host = e.id;
  send(ws, { t: 'welcome', you: e.id, team, room: r.id, mode, map: r.map, round: r.round, host: r.host === e.id, clock: r.clock, state: r.state,
    target: r.cfg.target, score: r.score, hill: r.hill, hillOwn: r.hillOwn, ents: [...r.ents.values()].map(pub), joinable: joinable(r), ...brInfo(r) });
  broadcast(r, { t: 'add', e: pub(e) }, e.id);
  const h = r.ents.get(r.host); if (e.desk && h && h !== e && !h.desk) handHost(r, e);
  log(`join ${e.name} -> room ${r.id} (${mode}) team ${team}, ${humans(r).length} players`);
}
function brInfo(r) {
  if (!isBr(r)) return {};
  const z = r.zone, t = now();
  return { br: { seed: r.seed, taken: [...r.taken], ph: z.ph, from: z.from, to: z.to, k: z.t1 > z.t0 ? Math.min(1, (t - z.t0) / (z.t1 - z.t0)) : 1, sh: Math.max(0, z.t1 - t), next: Math.max(0, z.next - t), dps: z.dps, drop: Math.max(0, BR_DROP - (t - r.t0)), alive: aliveN(r) } };
}
function leave(ws) {
  const e = ws.ent, r = ws.room; if (!e || !r) return; ws.ent = null;
  removeEnt(r, e);
  if (!humans(r).length) { rooms.delete(r.id); log(`room ${r.id} closed`); return; }
  fill(r);
  if (r.host === e.id) setHost(r);
  if (isBr(r)) brCheckEnd(r);
  log(`leave ${e.name} <- room ${r.id}, ${humans(r).length} left`);
}

// ---------- line of sight ----------
// (code in server/los.mjs)

// ---------- hits ----------
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function hit(r, from, m) {
  if (r.state !== 'play') return;
  const s = r.ents.get(m.s), v = r.ents.get(m.v); let d = Number(m.d);
  if (!s || !v || !s.alive || !v.alive || s.team === v.team || !(d > 0)) return;
  if (s.bot ? from.id !== r.host : s.id !== from.id) return;                         // you may only shoot as yourself; only the host shoots for bots
  const t = now();
  if (t - v.spawnT < SPAWN_PROTECT) return;
  if (s.bot) {
    if (t - s.lastHit < BOT_MIN_GAP) return; d = Math.min(d, BOT_MAX_HIT);
  } else {
    const w = WPN[m.w] || WPN[s.w] || WPN.ar7_lance, [rpm, dmg, head, range] = w;
    if (d > dmg * head * DMG_SLACK) return reject(s, 'dmg');
    if (dist(s.p, v.p) > range * RANGE_SLACK + 4) return reject(s, 'range');
    s.hitLog = s.hitLog.filter(x => t - x < 1); s.hitLog.push(t);                  // fire rate: hits in the last second vs the gun's rpm
    if (s.hitLog.length > rpm / 60 * 1.5 + 2) return reject(s, 'rate');
  }
  if (m.w !== 'blast' && !losMap(r.map, s.p, v.p)) return reject(s, 'wall');                  // splash damage (airstrike, barrels) goes round corners
  s.lastHit = t; stats.hits++;
  if (isBr(r) && v.ar > 0) { const soak = Math.min(v.ar, d * 0.6); v.ar -= soak; d -= soak; }   // armor takes 60% of each hit until it is gone
  v.hp = Math.max(0, v.hp - d);
  const head = !!m.hd;
  broadcast(r, { t: 'dmg', s: s.id, v: v.id, d: Math.round(d), hp: Math.round(v.hp), hd: head, ar: Math.round(v.ar || 0) });
  if (v.hp <= 0) kill(r, s, v, head);
}
function reject(s, why) { stats['rej_' + why] = (stats['rej_' + why] || 0) + 1; s.bad = (s.bad || 0) + 1; if (s.bad % 20 === 1) log(`reject ${why} from ${s.name} (${s.bad})`); }
function kill(r, s, v, head) {                                                     // s = null: the zone
  v.alive = false; v.d++; if (s) s.k++;
  if (r.mode === 'tdm' && s) r.score[s.team]++;
  const place = isBr(r) ? aliveN(r) + 1 : 0;
  broadcast(r, { t: 'kill', s: s ? s.id : 0, v: v.id, hd: head, score: r.score, sk: s ? s.k : 0, vd: v.d, pl: place, alive: isBr(r) ? aliveN(r) : 0 });
  if (r.mode === 'tdm' && s && r.score[s.team] >= r.cfg.target) endRound(r);
  if (isBr(r)) brCheckEnd(r);
}
function brCheckEnd(r) { if (r.state === 'play' && !brOpen(r) && aliveN(r) <= 1) endRound(r); }

// ---------- rounds ----------
function endRound(r) {
  if (r.state !== 'play') return;
  r.state = 'end'; r.endT = now();
  const last = isBr(r) ? [...r.ents.values()].find(e => e.alive) : null;
  const win = isBr(r) ? (last ? last.id : 0) : r.score.A > r.score.B ? 'A' : r.score.B > r.score.A ? 'B' : 'draw';
  broadcast(r, { t: 'end', win, score: r.score, next: END_PAUSE, board: [...r.ents.values()].map(e => ({ id: e.id, name: e.name, team: e.team, k: e.k, d: e.d, bot: e.bot })) });
  log(`room ${r.id} round ${r.round} over: A ${r.score.A} - B ${r.score.B}`);
}
function newRound(r) {
  let m = (Math.random() * MAPS) | 0; if (MAPS > 1 && m === r.map) m = (m + 1) % MAPS; if (isBr(r)) m = BR_MAP;
  Object.assign(r, { state: 'play', map: m, t0: now(), clock: r.cfg.time, score: { A: 0, B: 0 }, hill: null, hillOwn: '', hillAcc: 0, round: r.round + 1, fillDone: false });
  if (isBr(r)) { brReset(r); for (const e of [...r.ents.values()]) if (e.bot) r.ents.delete(e.id); fill(r); }
  for (const e of r.ents.values()) { e.k = 0; e.d = 0; e.hp = 100; e.ar = 0; e.alive = e.bot; e.spawned = false; e.spawnT = now(); e.p = [0, -50, 0]; }
  broadcast(r, { t: 'round', map: m, round: r.round, clock: r.clock, target: r.cfg.target, ents: [...r.ents.values()].map(pub), ...brInfo(r) });
}
function hillTick(r, dt) {
  if (r.mode !== 'hill' || !r.hill || r.state !== 'play') return;
  let a = 0, b = 0; const [hx, hy, hz] = r.hill;
  for (const e of r.ents.values()) {
    if (!e.alive) continue;
    if ((e.p[0] - hx) ** 2 + (e.p[2] - hz) ** 2 < HILL.radius ** 2 && Math.abs(e.p[1] - hy) < 3) e.team === 'A' ? a++ : b++;
  }
  const own = a && !b ? 'A' : b && !a ? 'B' : a && b ? 'X' : '';
  if (own !== r.hillOwn) { r.hillOwn = own; broadcast(r, { t: 'hill', own }); }
  if (own === 'A' || own === 'B') {
    r.hillAcc += dt * HILL.rate;
    while (r.hillAcc >= 1) { r.hillAcc -= 1; r.score[own]++; if (r.score[own] >= r.cfg.target) { endRound(r); return; } }
  }
}

// ---------- messages ----------
// host -> server bot states, binary: u8 2, u16 n, n x 14 bytes: u32 id, i16 x*50, i16 y*50, i16 z*50, i16 yaw*10000, u8 speed*10, u8 flags
function onBin(ws, b) {
  const e = ws.ent, r = ws.room; if (!e || !r || b.length < 3) return;
  e.lastMsg = now();
  if (b[0] !== 2 || e.id !== r.host) return;
  const n = Math.min(b.readUInt16LE(1), ((b.length - 3) / 14) | 0);
  for (let i = 0, o = 3; i < n; i++, o += 14) {
    const bot = r.ents.get(b.readUInt32LE(o)); if (!bot || !bot.bot) continue;
    bot.p = [b.readInt16LE(o + 4) / 50, b.readInt16LE(o + 6) / 50, b.readInt16LE(o + 8) / 50]; bot.yaw = b.readInt16LE(o + 10) / 10000; bot.sp = b[o + 12] / 10; bot.fl = b[o + 13];
  }
}
function onMsg(ws, raw, bin) {
  if (bin) { onBin(ws, raw); return; }
  let m; try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m.t !== 'string') return;
  if (m.t === 'join') { if (!ws.ent) join(ws, m); return; }
  const e = ws.ent, r = ws.room; if (!e || !r) return;
  e.lastMsg = now();
  switch (m.t) {
    case 's':                                                                          // my state: [x,y,z], yaw, pitch, speed, weapon
      if (Array.isArray(m.p) && m.p.length === 3 && m.p.every(Number.isFinite)) e.p = m.p;
      e.yaw = +m.y || 0; e.pi = +m.pi || 0; e.sp = +m.sp || 0; if (WPN[m.w]) e.w = m.w;
      break;
    case 'b':                                                                          // host: bot states [[id,x,y,z,yaw,speed,flags],...]
      if (e.id !== r.host || !Array.isArray(m.l)) break;
      for (const q of m.l) { const b = r.ents.get(q[0]); if (b && b.bot && [q[1], q[2], q[3]].every(Number.isFinite)) { b.p = [q[1], q[2], q[3]]; b.yaw = +q[4] || 0; b.sp = +q[5] || 0; b.fl = q[6] | 0; } }
      break;
    case 'f':                                                                          // a shot to draw (tracer + sound) on everyone else
      if (m.s !== e.id && !(e.id === r.host && r.ents.get(m.s)?.bot)) break;
      if (isBr(r) && Array.isArray(m.a)) {                                              // BR: only players within earshot get the shot
        const s = JSON.stringify({ t: 'f', s: m.s, a: m.a, b: m.b, w: m.w }), ax = +m.a[0] || 0, az = +m.a[2] || 0;
        for (const o of r.ents.values()) if (!o.bot && o.id !== e.id && (!o.alive || (o.p[0] - ax) ** 2 + (o.p[2] - az) ** 2 < SHOT_HEAR * SHOT_HEAR)) send(o.ws, s);
      } else broadcast(r, { t: 'f', s: m.s, a: m.a, b: m.b, w: m.w }, e.id);
      break;
    case 'h': hit(r, e, m); break;
    case 'r':                                                                          // I respawned at p
      if (r.state !== 'play' || e.alive) break;
      if (isBr(r) && e.spawned) break;                                                   // BR: one life
      e.spawned = true; e.alive = true; e.hp = 100; e.spawnT = now(); if (Array.isArray(m.p)) e.p = m.p;
      broadcast(r, { t: 'sp', id: e.id, p: e.p }, e.id);
      break;
    case 'br': {                                                                        // host: a bot respawned at p
      const b = r.ents.get(m.id); if (e.id !== r.host || !b || !b.bot || b.alive || r.state !== 'play' || isBr(r)) break;
      b.alive = true; b.hp = 100; b.spawnT = now(); if (Array.isArray(m.p)) b.p = m.p;
      broadcast(r, { t: 'sp', id: b.id, p: b.p }, e.id);
      break;
    }
    case 'hillpos':                                                                    // host: where the hill is on this map (same for every client)
      if (e.id === r.host && Array.isArray(m.p) && !r.hill) { r.hill = m.p.map(Number); broadcast(r, { t: 'hillpos', p: r.hill }); }
      break;
    case 'pick': {                                                                     // BR loot: first come first served (index into the seeded loot list)
      const i = m.i | 0; if (!isBr(r) || r.state !== 'play' || r.taken.has(i) || i < 0 || i > 2000) break;
      const by = m.s && m.s !== e.id ? r.ents.get(m.s) : e; if (!by || !by.alive || (by !== e && !(by.bot && e.id === r.host))) break;
      r.taken.add(i);
      if (m.k === 'med') by.hp = Math.min(100, by.hp + 50); else if (m.k === 'armor') by.ar = Math.min(100, by.ar + 50);
      broadcast(r, { t: 'took', i, by: by.id, hp: Math.round(by.hp), ar: Math.round(by.ar) });
      break;
    }
    case 'emote': broadcast(r, { t: 'emote', s: e.id, k: String(m.k).slice(0, 12) }, e.id); break;
    case 'ping': send(ws, { t: 'pong', c: m.c }); break;
  }
}

// ---------- loop ----------
let lastT = now();
setInterval(() => {
  const t = now(), dt = t - lastT; lastT = t;
  try { tick(t, dt); } finally { stats.tickMs += (now() - t) * 1000; stats.ticks++; }
}, 1000 / TICK);
function tick(t, dt) {
  for (const r of rooms.values()) {
    for (const e of humans(r)) if (t - e.lastMsg > 20) { log(`timeout ${e.name}`); e.ws.terminate(); }
    if (r.state === 'play') {
      r.clock = Math.max(0, r.cfg.time - (t - r.t0));
      hillTick(r, dt);
      if (isBr(r)) { if (!r.fillDone && !brOpen(r)) { r.fillDone = true; brCheckEnd(r); } brZone(r, t, dt); if (r.state !== 'play') continue; }
      if (r.clock <= 0) endRound(r);
    } else if (t - r.endT >= END_PAUSE) newRound(r);
    if (r.state !== 'play') continue;
    snapRoom(r, t);
  }
}

// ---------- binary snapshots with interest management ----------
// Every receiver gets its own snapshot: everyone within NEAR metres at the full 20 Hz, everyone further away at 4 Hz
// (spread over the ticks by id). The host also needs every human at full rate, because it runs the bot AI.
// Layout (little endian): u8 1, u8 flags(1=br), u16 clock*10, u16 scoreA, u16 scoreB,
//   [br: f32 zoneX, f32 zoneZ, f32 zoneR, u16 next*10, u16 shrink*10, u8 alive], u16 n, n x ENT_B bytes:
//   u32 id, i16 x*50, i16 y*50, i16 z*50, i16 yaw*10000, i8 pitch*80, u8 speed*10, u8 (alive | flags<<1)
const SHOT_HEAR = 160, NEAR = 120, FAR_EVERY = 5, ENT_B = 15, HEAD_B = 8, BR_B = 17;
let ents = Buffer.alloc(ENT_B * 64), out = Buffer.alloc(HEAD_B + BR_B + 2 + ENT_B * 64), tickN = 0;
const stats = { snapBytes: 0, snaps: 0, tickMs: 0, ticks: 0, hits: 0, inBytes: 0 };
const q16 = v => Math.max(-32768, Math.min(32767, Math.round(v)));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
function snapRoom(r, t) {
  const list = [...r.ents.values()], n = list.length;
  if (ents.length < n * ENT_B) { ents = Buffer.alloc(n * ENT_B * 2); out = Buffer.alloc(HEAD_B + BR_B + 2 + n * ENT_B * 2); }
  for (let i = 0; i < n; i++) {                                                          // each entity's record once per tick
    const e = list[i], o = i * ENT_B;
    ents.writeUInt32LE(e.id, o); ents.writeInt16LE(q16(e.p[0] * 50), o + 4); ents.writeInt16LE(q16(e.p[1] * 50), o + 6); ents.writeInt16LE(q16(e.p[2] * 50), o + 8);
    ents.writeInt16LE(q16(wrap(e.yaw) * 10000), o + 10); ents.writeInt8(Math.max(-127, Math.min(127, Math.round(e.pi * 80))), o + 12);
    ents[o + 13] = Math.min(255, Math.max(0, Math.round(e.sp * 10))); ents[o + 14] = (e.alive ? 1 : 0) | ((e.fl & 127) << 1);
  }
  const br = isBr(r); let h = 0;
  out[h++] = 1; out[h++] = br ? 1 : 0; out.writeUInt16LE(Math.round(r.clock * 10), h); h += 2; out.writeUInt16LE(r.score.A, h); h += 2; out.writeUInt16LE(r.score.B, h); h += 2;
  if (br) {
    const z = r.zone; out.writeFloatLE(z.c[0], h); out.writeFloatLE(z.c[1], h + 4); out.writeFloatLE(z.r, h + 8);
    out.writeUInt16LE(Math.min(65535, Math.round(Math.max(0, z.next - t) * 10)), h + 12); out.writeUInt16LE(Math.min(65535, Math.round(Math.max(0, z.t1 - t) * 10)), h + 14); out[h + 16] = Math.min(255, aliveN(r)); h += BR_B;
  }
  tickN++;
  for (const rc of list) {
    if (rc.bot || rc.ws.readyState !== 1) continue;
    const host = rc.id === r.host, px = rc.p[0], pz = rc.p[2], dead = !rc.alive;
    let k = h + 2, c = 0;
    for (let i = 0; i < n; i++) {
      const e = list[i];
      const full = e === rc || dead || (host && !e.bot) || ((e.p[0] - px) ** 2 + (e.p[2] - pz) ** 2 < NEAR * NEAR);   // dead receivers spectate anywhere: send all
      if (!full && (tickN + e.id) % FAR_EVERY) continue;
      ents.copy(out, k, i * ENT_B, i * ENT_B + ENT_B); k += ENT_B; c++;
    }
    out.writeUInt16LE(c, h);
    rc.ws.send(Buffer.from(out.subarray(0, k)));
    stats.snapBytes += k; stats.snaps++;
  }
}

function log(s) { if (!process.env.QUIET) console.log(new Date().toISOString().slice(11, 19), s); }

// plain HTTP: health check + player count (handy for the lobby "players online" line)
const srv = http.createServer((req, res) => {
  const n = [...rooms.values()].reduce((a, r) => a + humans(r).length, 0);
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  const body = { ok: true, v: VERSION, players: n, rooms: rooms.size };
  if (req.url === '/stats') Object.assign(body, { ents: [...rooms.values()].reduce((a, r) => a + r.ents.size, 0), ...stats, mem: Math.round(process.memoryUsage().rss / 1e6) });
  res.end(JSON.stringify(body));
});
const wss = new WebSocketServer({ server: srv, maxPayload: 16 * 1024 });
wss.on('connection', ws => {
  ws.on('message', (d, bin) => { stats.inBytes += d.length; onMsg(ws, d, bin); });
  ws.on('close', () => leave(ws));
  ws.on('error', () => {});
});
srv.listen(PORT, () => log(`Blastline server on :${PORT}`));
export { rooms, MODES };
