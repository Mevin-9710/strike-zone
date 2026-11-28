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
const VERSION = 2;                                     // protocol version: clients with another version are refused
const TICK = Number(process.env.SNAP_HZ || 15);         // ticks (and snapshots) per second
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
const outBy = {};                                                                      // bytes sent per message type (GET /stats)
// Messages wait in a per-socket queue and go out once per tick together with the snapshot, as ONE WebSocket frame (and so one
// TCP packet): every packet costs ~70 bytes of TCP/IP + TLS + WebSocket headers, and one frame compresses better.
// Bundle layout: u8 9, then per message: u16 length, u8 kind (0 JSON text, 1 binary), bytes.
const pending = new Set();
function queue(ws, data) { if (ws.readyState !== 1) return; (ws.q || (ws.q = [])).push(data); pending.add(ws); }
function flush(ws, snap) {
  if (ws.readyState !== 1) { ws.q = null; return; }
  const q = ws.q || [];
  if (!q.length) { if (snap) { ws.send(snap); stats.packets++; } return; }
  if (q.length === 1 && !snap) { ws.send(q[0]); q.length = 0; stats.packets++; return; }
  const parts = []; let len = 1;
  for (const d of q) { const b = typeof d === 'string' ? Buffer.from(d) : d; parts.push(b, typeof d === 'string' ? 0 : 1); len += 3 + b.length; }
  if (snap) { parts.push(snap, 1); len += 3 + snap.length; }
  const out = Buffer.allocUnsafe(len); out[0] = 9; let k = 1;
  for (let i = 0; i < parts.length; i += 2) { const b = parts[i]; out.writeUInt16LE(b.length, k); out[k + 2] = parts[i + 1]; b.copy(out, k + 3); k += 3 + b.length; }
  q.length = 0; ws.send(out); stats.packets++;
}
const send = (ws, m, now_) => {
  if (ws.readyState !== 1) return; const s = typeof m === 'string' ? m : JSON.stringify(m);
  if (now_) ws.send(s); else queue(ws, s);
  const t = s.charCodeAt(5) === 34 ? s.slice(6, s.indexOf('"', 6)) : '?'; outBy[t] = (outBy[t] || 0) + s.length;   // '{"t":"xx"'
};
const pub = e => ({ id: e.id, sl: e.sl, bot: e.bot, team: e.team, name: e.name, alive: e.alive, hp: e.hp, ar: e.ar || 0, k: e.k, d: e.d, p: e.p, yaw: e.yaw });

// ---------- rooms ----------
function takeSlot(r) { for (let i = 0; i < 255; i++) if (!r.slots.has(i)) { r.slots.add(i); return i; } return 255; }   // room-local id used in snapshots (1 byte)
function makeRoom(mode, priv = false) {
  const r = { id: (nextRoom++).toString(36) + Math.random().toString(36).slice(2, 6), mode, cfg: MODES[mode], priv, ents: new Map(), host: 0,
    state: 'play', map: mode === 'br' ? BR_MAP : (Math.random() * MAPS) | 0, t0: now(), clock: MODES[mode].time, score: { A: 0, B: 0 }, endT: 0, hill: null, hillOwn: '', hillAcc: 0, botSeq: 0, round: 1, slots: new Set() };
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
    broadcast(r, { t: 'zone', ph: z.ph, from: z.from.map(v => +v.toFixed(1)), to: z.to.map(v => +v.toFixed(1)), sh: +(z.t1 - t).toFixed(2), nx: +Math.min(9999, z.next - t).toFixed(2), dps });
  }
  const k = z.t1 > z.t0 ? Math.min(1, Math.max(0, (t - z.t0) / (z.t1 - z.t0))) : 1;
  z.c = [z.from[0] + (z.to[0] - z.from[0]) * k, z.from[1] + (z.to[1] - z.from[1]) * k]; z.r = z.from[2] + (z.to[2] - z.from[2]) * k;
  if (z.ph < 0) return;
  for (const e of r.ents.values()) {                                                   // outside the circle: damage every second, credited to the zone
    if (!e.alive) continue;
    if ((e.p[0] - z.c[0]) ** 2 + (e.p[2] - z.c[1]) ** 2 <= z.r * z.r || e.p[1] < -20) { e.zAcc = 0; continue; }
    e.zAcc = (e.zAcc || 0) + dt * z.dps; if (e.zAcc < 1 && e.hp > e.zAcc) continue;
    const d = Math.min(e.hp, Math.floor(e.zAcc) || e.zAcc); e.zAcc -= d; e.hp = Math.max(0, e.hp - d);
    sendDmg(r, { t: 'dmg', s: 0, v: e.id, d: Math.round(d), hp: Math.round(e.hp), hd: false, z: 1 }, e, null);
    if (e.hp <= 0) kill(r, null, e, false);
  }
}
function addBot(r, team) {
  const used = new Set([...r.ents.values()].map(e => e.name)); let name = BOT_NAMES[r.botSeq++ % BOT_NAMES.length] + ' [BOT]';
  if (used.has(name)) name = BOT_NAMES[(Math.random() * BOT_NAMES.length) | 0] + (r.botSeq % 10) + ' [BOT]';
  if (isBr(r)) team = 'p' + nextId;                                                 // battle royale: everyone is their own team
  const e = { id: nextId++, bot: true, team, name, alive: true, hp: 100, ar: 0, k: 0, d: 0, p: [0, -50, 0], yaw: 0, sp: 0, pi: 0, spawnT: now(), hitLog: [], lastHit: 0 };
  e.sl = takeSlot(r); r.ents.set(e.id, e); broadcast(r, { t: 'add', e: pub(e) }); return e;
}
function removeEnt(r, e) { for (const o of r.ents.values()) o.seen?.delete(e.id); r.ents.delete(e.id); r.slots.delete(e.sl); broadcast(r, { t: 'del', id: e.id }); }
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
  if (m.v !== VERSION) { send(ws, { t: 'err', why: 'version', need: VERSION }, true); ws.close(); return; }
  const mode = MODES[m.mode] ? m.mode : 'tdm';
  const r = pickRoom(mode, m.room ? String(m.room) : null);
  const a = teamOf(r, 'A').filter(e => !e.bot).length, b = teamOf(r, 'B').filter(e => !e.bot).length;
  const id = nextId++, team = isBr(r) ? 'p' + id : a <= b ? 'A' : 'B';
  const e = { id, bot: false, ws, team, name: clean(m.name) || 'Player' + ((Math.random() * 9000 + 1000) | 0), alive: false, hp: 100, ar: 0, k: 0, d: 0, spawned: false,
    p: [0, -50, 0], yaw: 0, sp: 0, pi: 0, w: 'ar7_lance', spawnT: 0, hitLog: [], lastHit: 0, joinT: now(), lastMsg: now(), desk: m.dev === 'm' ? 0 : 1 };
  ws.ent = e; ws.room = r; e.sl = takeSlot(r); e.seen = new Map();
  r.ents.set(e.id, e); fill(r);                                                       // a bot on the new player's team steps out
  if (!r.host) r.host = e.id;
  send(ws, { t: 'welcome', hz: TICK, you: e.id, team, room: r.id, mode, map: r.map, round: r.round, host: r.host === e.id, clock: r.clock, state: r.state,
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
  sendDmg(r, { t: 'dmg', s: s.id, v: v.id, d: Math.round(d), hp: Math.round(v.hp), hd: head, ar: Math.round(v.ar || 0) }, v, s);
  if (v.hp <= 0) kill(r, s, v, head);
}
// damage, binary: u8 7, u8 shooter slot (255: the zone), u8 victim slot, u8 damage, u8 hp, u8 armor, u8 flags (1 headshot, 2 zone)
const DMG = Buffer.alloc(7);
function sendDmg(r, m, v, s) {                                                          // BR: only the two players involved, the host (bots) and anyone nearby
  DMG[0] = 7; DMG[1] = s ? s.sl : 255; DMG[2] = v.sl; DMG[3] = Math.min(255, m.d); DMG[4] = Math.max(0, Math.min(255, m.hp)); DMG[5] = Math.min(255, m.ar || 0); DMG[6] = (m.hd ? 1 : 0) | (m.z ? 2 : 0);
  const br = isBr(r), b = Buffer.from(DMG);
  for (const o of r.ents.values()) if (!o.bot && o.ws.readyState === 1 && (!br || o === v || o === s || o.id === r.host || !o.alive || (o.p[0] - v.p[0]) ** 2 + (o.p[2] - v.p[2]) ** 2 < SHOT_HEAR * SHOT_HEAR)) { queue(o.ws, b); outBy.dmg = (outBy.dmg || 0) + 7; }
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
  if (isBr(r)) { brReset(r); for (const e of [...r.ents.values()]) if (e.bot) { r.ents.delete(e.id); r.slots.delete(e.sl); } fill(r); }
  for (const e of r.ents.values()) if (e.seen) { e.seen.clear(); e.info = 0; }        // clients rebuild their roster on 'round': start the deltas over
  for (const e of r.ents.values()) { e.k = 0; e.d = 0; e.hp = 100; e.ar = 0; e.alive = e.bot; e.spawned = false; e.spawnT = now(); setPos(e, 0, -50, 0, now()); }
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
// ---------- binary uploads ----------
// 4 my state:  u8 4, u32 clientMs, i16 x,y,z (2 cm), u16 yaw, i8 pitch (1/80), u8 speed (0.1), u8 weapon (WPN_IDS)
// 5 a shot:    u8 5, u8 shooter slot, i16 ax,ay,az, i16 bx,by,bz (2 cm)
// 6 host bots: u8 6, u32 clientMs, u8 n, n x (u8 slot, i16 x,y,z, u16 yaw, u8 speed, u8 flags), [u8 m, m x u8 slot: bots unchanged since the last upload]
// clientMs is the sender's clock; each connection learns its offset to ours, so every position carries the moment it was
// really captured (upload jitter does not turn into stutter on other screens).
const WPN_IDS = Object.keys(WPN);
function capTime(e, ms) {                                                                // the sender's clock -> our clock (s)
  const t = now(), o = t - ms / 1000;
  if (e.coff == null || o < e.coff || o - e.coff > 5) e.coff = o; else e.coff += (o - e.coff) * 0.002;
  return Math.min(t, ms / 1000 + e.coff);
}
function setPos(e, x, y, z, ct) {                                                         // a new position; remembers how long the old one held
  e.p = [x, y, z];
  const qx = q16(x * POS_STEP), qy = q16(y * POS_STEP), qz = q16(z * POS_STEP), c = e.cq || (e.cq = new Int32Array(6));
  if (qx !== c[0] || qy !== c[1] || qz !== c[2]) { c[3] = c[0]; c[4] = c[1]; c[5] = c[2]; c[0] = qx; c[1] = qy; c[2] = qz; e.holdT = e.confT || ct; e.posT = ct; }
  e.confT = ct;
}
const bySlot = (r, sl) => { for (const e of r.ents.values()) if (e.sl === sl) return e; return null; };
function onBin(ws, b) {
  const e = ws.ent, r = ws.room; if (!e || !r || b.length < 2) return;
  e.lastMsg = now();
  if (b[0] === 4 && b.length >= 15) {
    const ct = capTime(e, b.readUInt32LE(1));
    setPos(e, b.readInt16LE(5) / 50, b.readInt16LE(7) / 50, b.readInt16LE(9) / 50, ct);
    e.yaw = b.readUInt16LE(11) / 65536 * 2 * Math.PI - Math.PI; e.pi = b.readInt8(13) / 80; e.sp = b[14] / 10; if (b.length > 15 && WPN_IDS[b[15]]) e.w = WPN_IDS[b[15]];
  } else if (b[0] === 5 && b.length >= 14) {
    const sh = b[1] === e.sl ? e : e.id === r.host ? bySlot(r, b[1]) : null; if (!sh || (sh !== e && !sh.bot)) return;
    onShot(sh, [b.readInt16LE(2) / 50, b.readInt16LE(4) / 50, b.readInt16LE(6) / 50], [b.readInt16LE(8) / 50, b.readInt16LE(10) / 50, b.readInt16LE(12) / 50]);
  } else if (b[0] === 8 && b.length >= 7) {                                              // 8 a hit: u8 8, u8 shooter slot, u8 victim slot, u16 damage*10, u8 flags (1 head), u8 weapon
    const sh = bySlot(r, b[1]), v = bySlot(r, b[2]); if (!sh || !v) return;
    hit(r, e, { s: sh.id, v: v.id, d: b.readUInt16LE(3) / 10, hd: b[5] & 1, w: WPN_IDS[b[6]] });
  } else if (b[0] === 6 && b.length >= 6 && e.id === r.host) {
    const ct = capTime(e, b.readUInt32LE(1)), n = Math.min(b[5], ((b.length - 6) / 11) | 0);
    for (let i = 0, o = 6; i < n; i++, o += 11) {
      const bot = bySlot(r, b[o]); if (!bot || !bot.bot) continue;
      setPos(bot, b.readInt16LE(o + 1) / 50, b.readInt16LE(o + 3) / 50, b.readInt16LE(o + 5) / 50, ct);
      bot.yaw = b.readUInt16LE(o + 7) / 65536 * 2 * Math.PI - Math.PI; bot.sp = b[o + 9] / 10; bot.fl = b[o + 10];
    }
    const so = 6 + n * 11, m = b.length > so ? Math.min(b[so], b.length - so - 1) : 0;   // unchanged bots: still where they were at this moment
    for (let i = 0; i < m; i++) { const bot = bySlot(r, b[so + 1 + i]); if (bot && bot.bot && bot.cq) bot.confT = ct; }
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
      if (Array.isArray(m.p) && m.p.length === 3 && m.p.every(Number.isFinite)) setPos(e, m.p[0], m.p[1], m.p[2], now());
      e.yaw = +m.y || 0; e.pi = +m.pi || 0; e.sp = +m.sp || 0; if (WPN[m.w]) e.w = m.w;
      break;
    case 'b':                                                                          // host: bot states [[id,x,y,z,yaw,speed,flags],...]
      if (e.id !== r.host || !Array.isArray(m.l)) break;
      for (const q of m.l) { const b = r.ents.get(q[0]); if (b && b.bot && [q[1], q[2], q[3]].every(Number.isFinite)) { setPos(b, q[1], q[2], q[3], now()); b.yaw = +q[4] || 0; b.sp = +q[5] || 0; b.fl = q[6] | 0; } }
      break;
    case 'f': {                                                                        // a shot to draw: rides in the shooter's snapshot record
      const sh = m.s === e.id ? e : e.id === r.host ? r.ents.get(m.s) : null; if (!sh || (sh !== e && !sh.bot)) break;
      if (Array.isArray(m.a) && Array.isArray(m.b)) onShot(sh, m.a, m.b);
      break;
    }
    case 'h': hit(r, e, m); break;
    case 'r':                                                                          // I respawned at p
      if (r.state !== 'play' || e.alive) break;
      if (isBr(r) && e.spawned) break;                                                   // BR: one life
      e.spawned = true; e.alive = true; e.hp = 100; e.spawnT = now(); if (Array.isArray(m.p) && m.p.length === 3 && m.p.every(Number.isFinite)) setPos(e, m.p[0], m.p[1], m.p[2], now());
      broadcast(r, { t: 'sp', id: e.id, p: e.p }, e.id);
      break;
    case 'br': {                                                                        // host: a bot respawned at p
      const b = r.ents.get(m.id); if (e.id !== r.host || !b || !b.bot || b.alive || r.state !== 'play' || isBr(r)) break;
      b.alive = true; b.hp = 100; b.spawnT = now(); if (Array.isArray(m.p) && m.p.length === 3 && m.p.every(Number.isFinite)) setPos(b, m.p[0], m.p[1], m.p[2], now());
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
    case 'ping': send(ws, { t: 'pong', c: m.c }, true); break;                         // not queued: it measures the round trip
  }
}

// ---------- loop ----------
let lastT = now();
setInterval(() => {
  const t = now(), dt = t - lastT; lastT = t;
  try { tick(t, dt); } finally { stats.tickMs += (now() - t) * 1000; stats.ticks++; }
}, 1000 / TICK);
function tick(t, dt) {
  tickRooms(t, dt);
  for (const ws of pending) flush(ws, null); pending.clear();                          // rooms between rounds, sockets that got no snapshot
}
function tickRooms(t, dt) {
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

// ---------- binary snapshots: per receiver, interest managed, delta coded ----------
// Each human gets their own snapshot every tick (20 Hz). An entity is in it only when something about it changed since
// the last time THIS receiver got it, and only as often as its distance allows: under NEAR_A m every tick, under NEAR_B m every
// 2nd tick, further away every FAR_IV-th tick. Values are sent as changes against what this receiver already has (the socket is
// ordered and reliable, so deltas are safe); positions use 1 byte per axis while the move fits.
// The host gets every human every tick (it aims the bots at them). Shots ride along in the shooter's record.
// Layout (little endian):
//   u8 5, u8 flags (1: info block, 2: slot bitmap), u32 server ms, [info: u16 clock*10, u16 scoreA, u16 scoreB, u8 alive, u16 zoneNext*10, u16 zoneShrink*10],
//   then either (no flag 2) u8 n and n records "u8 slot, u8 mask, ..." or (flag 2) u8 nb, nb bytes of slot bitmap (bit i = slot i)
//   and one record "u8 mask, ..." per set bit, in slot order (whichever is shorter). After the mask, by mask bit:
//     1 pos delta i8 x3 (2 cm)   2 pos i16 x3 (2 cm)   1|2 both: pos delta i8 x, i8 z (height unchanged)
//     [any of 1|2 and not 16: u8 position age, 2 ms steps]   4 yaw: i8 change (2pi/4096), or -128 + u16 absolute
//     8 pitch i8 (1/80 rad)   16 (with 1|2) the position age byte is left out: same as the last one in this snapshot   32 flags u8 (alive | fl<<1)
//     64 shot: u8 count, yaw (i8 change from the record's yaw in 2pi/4096, or -128 + u16 2pi/65536), i8 pitch (1/120 rad), u8 range m   128 hold: u8, the previous position held until this long ago (4 ms steps)
// Small turns are left out: under 0.5 deg (yaw) / 1.4 deg (pitch) close up, 2 deg past NEAR_A (YAW_DB, PITCH_DB); that can't be seen and the error never grows past it.
const SHOT_HEAR = 160, NEAR_A = 50, NEAR_B = 120, FAR_IV = 4, INFO_EVERY = TICK, POS_STEP = 50, YAW_DB = 23, PITCH_DB = 3, YAW_DB_NEAR = 6, PITCH_DB_NEAR = 2;
let tickN = 0, out = Buffer.alloc(8192), out2 = Buffer.alloc(8192), recAt = new Int32Array(256);
const bySl = (a, b) => a.sl - b.sl;
const stats = { snapBytes: 0, snaps: 0, tickMs: 0, ticks: 0, hits: 0, inBytes: 0, packets: 0 };
const q16 = v => Math.max(-32768, Math.min(32767, Math.round(v)));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const yawQ = a => Math.round((wrap(a) + Math.PI) / (2 * Math.PI) * 4096) & 4095;       // 12-bit yaw (0.09 deg)
function quant(e) {                                                                      // once per tick: the entity's state as integers
  const q = e.q || (e.q = new Int32Array(8));
  if (!e.cq) setPos(e, e.p[0], e.p[1], e.p[2], now());
  q[0] = e.cq[0]; q[1] = e.cq[1]; q[2] = e.cq[2]; q[3] = yawQ(e.yaw);
  q[4] = Math.max(-127, Math.min(127, Math.round(e.pi * 80))); q[5] = 0; q[6] = (e.alive ? 1 : 0) | ((e.fl & 127) << 1); q[7] = e.shotN | 0;   // q[5] (speed) is unused: clients work it out from the positions
}
function onShot(e, a, b) {                                                               // a shot to draw: counted into the shooter's next records
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], h = Math.hypot(dx, dz);
  if (![dx, dy, dz].every(Number.isFinite)) return;
  e.shotN = (e.shotN | 0) + 1; e.shotYaw = Math.round((Math.atan2(dx, dz) + Math.PI) / (2 * Math.PI) * 65536) & 65535;
  e.shotPi = Math.max(-127, Math.min(127, Math.round(Math.atan2(dy, h) * 120))); e.shotD = Math.min(255, Math.round(Math.hypot(h, dy)));
}
function snapRoom(r, t) {
  const list = [...r.ents.values()].sort(bySl), n = list.length;              // slot order (the bitmap form needs it)
  for (const e of list) quant(e);
  tickN++;
  const br = isBr(r);
  for (const rc of list) {
    if (rc.bot || rc.ws.readyState !== 1) continue;
    if (out.length < 64 + n * 24) { out = Buffer.alloc(64 + n * 48); out2 = Buffer.alloc(64 + n * 48); }
    const host = rc.id === r.host, px = rc.p[0], pz = rc.p[2], all = !rc.alive, seen = rc.seen;
    let k = 0; out[k++] = 5; const info = (tickN - (rc.info | 0)) >= INFO_EVERY && !(tickN & 1); out[k++] = info ? 1 : 0; out.writeUInt32LE(Math.round(t * 1000) >>> 0, k); k += 4;
    if (info) {
      rc.info = tickN;
      out.writeUInt16LE(Math.round(r.clock * 10), k); out.writeUInt16LE(r.score.A, k + 2); out.writeUInt16LE(r.score.B, k + 4); k += 6;
      out[k++] = br ? Math.min(255, aliveN(r)) : 0;
      const z = r.zone; out.writeUInt16LE(br ? Math.min(65535, Math.round(Math.max(0, z.next - t) * 10)) : 0, k); out.writeUInt16LE(br ? Math.min(65535, Math.round(Math.max(0, z.t1 - t) * 10)) : 0, k + 2); k += 4;
    }
    const nAt = k++; let cnt = 0, lastAge = -1;
    for (const e of list) {
      if (e === rc || cnt >= 255) continue;
      const d2 = (e.p[0] - px) ** 2 + (e.p[2] - pz) ** 2;
      const iv = all || (host && !e.bot) || d2 < NEAR_A * NEAR_A ? 1 : d2 < NEAR_B * NEAR_B ? 2 : FAR_IV;   // dead receivers spectate anywhere: everyone at full rate
      if (iv > 1 && tickN % iv) continue;                                             // all on the same ticks: a player with nobody close gets no packet at all in between
      const q = e.q; let s = seen.get(e.id);
      if (!s) { s = new Float64Array(11); s[9] = -1; seen.set(e.id, s); }
      let mask = 0, dx = 0, dy = 0, dz = 0;
      if (s[9] < 0) mask = 2 | 4 | 8 | 32;                                              // first time: everything, absolute
      else {
        dx = q[0] - s[0]; dy = q[1] - s[1]; dz = q[2] - s[2];
        if (dx || dy || dz) mask |= (dx >= -127 && dx <= 127 && dy >= -127 && dy <= 127 && dz >= -127 && dz <= 127) ? (dy ? 1 : 3) : 2;
        const dyw = Math.abs(((q[3] - s[3] + 6144) % 4096) - 2048), dpi = Math.abs(q[4] - s[4]), near = all || d2 < NEAR_A * NEAR_A;
        if (dyw >= (near ? YAW_DB_NEAR : YAW_DB)) mask |= 4; if (dpi >= (near ? PITCH_DB_NEAR : PITCH_DB)) mask |= 8; if (q[6] !== s[6]) mask |= 32;
        if (q[7] !== s[7]) mask |= 64;
      }
      if (!mask) continue;                                                                   // nothing new: costs nothing
      const c = e.cq, hold = (mask & 3) && s[9] >= 0 && s[0] === c[3] && s[1] === c[4] && s[2] === c[5] && e.holdT > s[10] + 0.06;
      if (hold) mask |= 128;                                                                 // it stood still a while: say until when, so the client doesn't glide
      recAt[cnt] = k; out[k++] = e.sl; const mAt = k; out[k++] = mask;
      const pm = mask & 3;
      if (pm === 1) { out.writeInt8(dx, k); out.writeInt8(dy, k + 1); out.writeInt8(dz, k + 2); k += 3; }
      else if (pm === 3) { out.writeInt8(dx, k); out.writeInt8(dz, k + 1); k += 2; }
      else if (pm === 2) { out.writeInt16LE(q[0], k); out.writeInt16LE(q[1], k + 2); out.writeInt16LE(q[2], k + 4); k += 6; }
      if (mask & 3) {                                                                        // how old this position is (2 ms steps); 16: same as the record before
        const age = Math.min(255, Math.max(0, Math.round((t - e.posT) * 500)));
        if (age === lastAge) out[mAt] |= 16; else { out[k++] = age; lastAge = age; }
      }
      if (mask & 128) out[k++] = Math.min(255, Math.max(0, Math.round((t - e.holdT) * 250)));   // the old position held until this long ago (4 ms steps)
      if (mask & 4) {                                                                        // yaw: i8 change, or -128 then the full u16
        const dyw = ((q[3] - s[3] + 6144) % 4096) - 2048;
        if (s[9] >= 0 && dyw >= -127 && dyw <= 127) out.writeInt8(dyw, k++); else { out.writeInt8(-128, k); out.writeUInt16LE(q[3], k + 1); k += 3; }
      }
      if (mask & 8) out.writeInt8(q[4], k++);
      if (mask & 32) out[k++] = q[6];
      if (mask & 64) {                                                                       // shot: aim as a change from the facing the client now has (players shoot where they look)
        out[k++] = Math.min(255, q[7] - s[7]); const so = (((e.shotYaw >> 4) - ((mask & 4) ? q[3] : s[3]) + 6144) % 4096) - 2048;
        if (so >= -127 && so <= 127) out.writeInt8(so, k++); else { out.writeInt8(-128, k); out.writeUInt16LE(e.shotYaw | 0, k + 1); k += 3; }
        out.writeInt8(e.shotPi | 0, k); out[k + 1] = e.shotD | 0; k += 2;
      }
      for (let j = 0; j < 8; j++) if (j !== 3 && j !== 4) s[j] = q[j]; if (mask & 4) s[3] = q[3]; if (mask & 8) s[4] = q[4];   // left-out turns stay as the client has them
      s[8] = tickN; s[9] = 1; if (mask & 3) s[10] = e.posT; cnt++;
    }
    out[nAt] = cnt;
    if (!cnt && !info) { if (rc.ws.q?.length) { flush(rc.ws, null); pending.delete(rc.ws); } continue; }   // nothing changed: no snapshot at all
    let pk = out.subarray(0, k);
    const nb = cnt ? (out[recAt[cnt - 1]] >> 3) + 1 : 0;                              // bitmap bytes up to the highest slot sent
    if (nb < cnt) {                                                                    // the bitmap is shorter than one slot byte per record
      out.copy(out2, 0, 0, nAt); out2[1] |= 2; let j = nAt; out2[j++] = nb; out2.fill(0, j, j + nb);
      for (let i = 0; i < cnt; i++) { const a = recAt[i], sl = out[a]; out2[j + (sl >> 3)] |= 1 << (sl & 7); }
      let w = j + nb; recAt[cnt] = k;
      for (let i = 0; i < cnt; i++) { out.copy(out2, w, recAt[i] + 1, recAt[i + 1]); w += recAt[i + 1] - recAt[i] - 1; }
      pk = out2.subarray(0, w); k = w;
    }
    flush(rc.ws, Buffer.from(pk)); pending.delete(rc.ws);
    stats.snapBytes += k; stats.snaps++; outBy.snap = (outBy.snap || 0) + k;
  }
}

function log(s) { if (!process.env.QUIET) console.log(new Date().toISOString().slice(11, 19), s); }

// plain HTTP: health check + player count (handy for the lobby "players online" line)
const srv = http.createServer((req, res) => {
  const n = [...rooms.values()].reduce((a, r) => a + humans(r).length, 0);
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  const body = { ok: true, v: VERSION, players: n, rooms: rooms.size };
  if (req.url === '/stats') Object.assign(body, { ents: [...rooms.values()].reduce((a, r) => a + r.ents.size, 0), ...stats, sockOut: sockBytes(), outBy, mem: Math.round(process.memoryUsage().rss / 1e6) });
  res.end(JSON.stringify(body));
});
// permessage-deflate: about 30% fewer bytes for about 0.2% of a core per player (small window and fast level keep memory and CPU low). PMD=0 turns it off.
const wss = new WebSocketServer({ server: srv, maxPayload: 16 * 1024, perMessageDeflate: process.env.PMD === '0' ? false : { threshold: 24, serverMaxWindowBits: Number(process.env.PMD_BITS || 9), clientMaxWindowBits: Number(process.env.PMD_BITS || 9), zlibDeflateOptions: { level: Number(process.env.PMD_LEVEL || 1), memLevel: 4 } } });
let sockBytesClosed = 0;
const sockBytes = () => { let n = sockBytesClosed; for (const ws of wss.clients) n += ws._socket?.bytesWritten || 0; return n; };   // what really left (WebSocket frames, before TLS)
wss.on('connection', ws => {
  ws.on('close', () => { sockBytesClosed += ws._socket?.bytesWritten || 0; });
  if (process.env.COUNT_WRITES && ws._socket) { const so = ws._socket, w = so.write.bind(so); so.write = (...a) => { if (!so.writableCorked) stats.writes = (stats.writes || 0) + 1; return w(...a); }; const u = so.uncork.bind(so); so.uncork = () => { if (so.writableCorked === 1) stats.writes = (stats.writes || 0) + 1; return u(); }; }
  ws.on('message', (d, bin) => { stats.inBytes += d.length; onMsg(ws, d, bin); });
  ws.on('close', () => leave(ws));
  ws.on('error', () => {});
});
srv.listen(PORT, () => log(`Blastline server on :${PORT}`));
export { rooms, MODES };
