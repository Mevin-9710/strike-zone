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

const PORT = Number(process.env.PORT || 8787);
const VERSION = 1;                                     // protocol version: clients with another version are refused
const TICK = 20;                                       // snapshots per second
const MODES = {
  tdm: { size: 8, time: 300, target: 40 },             // 4 v 4, first team to 40 kills or most kills after 5 min
  hill: { size: 8, time: 300, target: 100 },           // 4 v 4, first team to 100 hill points
};
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
const pub = e => ({ id: e.id, bot: e.bot, team: e.team, name: e.name, alive: e.alive, hp: e.hp, k: e.k, d: e.d, p: e.p, yaw: e.yaw });

// ---------- rooms ----------
function makeRoom(mode, priv = false) {
  const r = { id: (nextRoom++).toString(36) + Math.random().toString(36).slice(2, 6), mode, cfg: MODES[mode], priv, ents: new Map(), host: 0,
    state: 'play', map: (Math.random() * MAPS) | 0, t0: now(), clock: MODES[mode].time, score: { A: 0, B: 0 }, endT: 0, hill: null, hillOwn: '', hillAcc: 0, botSeq: 0, round: 1 };
  rooms.set(r.id, r); fill(r); return r;
}
const humans = r => [...r.ents.values()].filter(e => !e.bot);
const teamOf = (r, t) => [...r.ents.values()].filter(e => e.team === t);
const per = r => r.cfg.size / 2;
function broadcast(r, m, except = 0) { const s = JSON.stringify(m); for (const e of r.ents.values()) if (!e.bot && e.id !== except) send(e.ws, s); }
function addBot(r, team) {
  const used = new Set([...r.ents.values()].map(e => e.name)); let name = BOT_NAMES[r.botSeq++ % BOT_NAMES.length] + ' [BOT]';
  if (used.has(name)) name = BOT_NAMES[(Math.random() * BOT_NAMES.length) | 0] + (r.botSeq % 10) + ' [BOT]';
  const e = { id: nextId++, bot: true, team, name, alive: true, hp: 100, k: 0, d: 0, p: [0, -50, 0], yaw: 0, sp: 0, pi: 0, spawnT: now(), hitLog: [], lastHit: 0 };
  r.ents.set(e.id, e); broadcast(r, { t: 'add', e: pub(e) }); return e;
}
function removeEnt(r, e) { r.ents.delete(e.id); broadcast(r, { t: 'del', id: e.id }); }
// bot fill: each team always has `size/2` members; humans push bots out, leaving humans are replaced by bots
function fill(r) {
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
    if (!best || humans(r).length > humans(best).length) best = r;                   // fill the busiest room first so people meet
  }
  return best || makeRoom(mode);
}
function joinable(r) { return humans(r).length < r.cfg.size && !(r.state === 'play' && r.clock < JOIN_CUTOFF); }
function setHost(r) {
  const h = humans(r).sort((a, b) => a.joinT - b.joinT)[0]; r.host = h ? h.id : 0;
  if (h) send(h.ws, { t: 'host', on: true });
}

// ---------- joining / leaving ----------
function join(ws, m) {
  if (m.v !== VERSION) { send(ws, { t: 'err', why: 'version', need: VERSION }); ws.close(); return; }
  const mode = MODES[m.mode] ? m.mode : 'tdm';
  const r = pickRoom(mode, m.room ? String(m.room) : null);
  const a = teamOf(r, 'A').filter(e => !e.bot).length, b = teamOf(r, 'B').filter(e => !e.bot).length;
  const team = a <= b ? 'A' : 'B';
  const e = { id: nextId++, bot: false, ws, team, name: clean(m.name) || 'Player' + ((Math.random() * 9000 + 1000) | 0), alive: false, hp: 100, k: 0, d: 0,
    p: [0, -50, 0], yaw: 0, sp: 0, pi: 0, w: 'ar7_lance', spawnT: 0, hitLog: [], lastHit: 0, joinT: now(), lastMsg: now() };
  ws.ent = e; ws.room = r;
  r.ents.set(e.id, e); fill(r);                                                       // a bot on the new player's team steps out
  if (!r.host) r.host = e.id;
  send(ws, { t: 'welcome', you: e.id, team, room: r.id, mode, map: r.map, round: r.round, host: r.host === e.id, clock: r.clock, state: r.state,
    target: r.cfg.target, score: r.score, hill: r.hill, hillOwn: r.hillOwn, ents: [...r.ents.values()].map(pub), joinable: joinable(r) });
  broadcast(r, { t: 'add', e: pub(e) }, e.id);
  log(`join ${e.name} -> room ${r.id} (${mode}) team ${team}, ${humans(r).length} players`);
}
function leave(ws) {
  const e = ws.ent, r = ws.room; if (!e || !r) return; ws.ent = null;
  removeEnt(r, e);
  if (!humans(r).length) { rooms.delete(r.id); log(`room ${r.id} closed`); return; }
  fill(r);
  if (r.host === e.id) setHost(r);
  log(`leave ${e.name} <- room ${r.id}, ${humans(r).length} left`);
}

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
  s.lastHit = t;
  v.hp = Math.max(0, v.hp - d);
  const head = !!m.hd;
  broadcast(r, { t: 'dmg', s: s.id, v: v.id, d: Math.round(d), hp: Math.round(v.hp), hd: head });
  if (v.hp <= 0) kill(r, s, v, head);
}
function reject(s, why) { s.bad = (s.bad || 0) + 1; if (s.bad % 20 === 1) log(`reject ${why} from ${s.name} (${s.bad})`); }
function kill(r, s, v, head) {
  v.alive = false; v.d++; s.k++;
  if (r.mode === 'tdm') r.score[s.team]++;
  broadcast(r, { t: 'kill', s: s.id, v: v.id, hd: head, score: r.score, sk: s.k, vd: v.d });
  if (r.mode === 'tdm' && r.score[s.team] >= r.cfg.target) endRound(r);
}

// ---------- rounds ----------
function endRound(r) {
  if (r.state !== 'play') return;
  r.state = 'end'; r.endT = now();
  const win = r.score.A > r.score.B ? 'A' : r.score.B > r.score.A ? 'B' : 'draw';
  broadcast(r, { t: 'end', win, score: r.score, next: END_PAUSE, board: [...r.ents.values()].map(e => ({ id: e.id, name: e.name, team: e.team, k: e.k, d: e.d, bot: e.bot })) });
  log(`room ${r.id} round ${r.round} over: A ${r.score.A} - B ${r.score.B}`);
}
function newRound(r) {
  let m = (Math.random() * MAPS) | 0; if (MAPS > 1 && m === r.map) m = (m + 1) % MAPS;
  Object.assign(r, { state: 'play', map: m, t0: now(), clock: r.cfg.time, score: { A: 0, B: 0 }, hill: null, hillOwn: '', hillAcc: 0, round: r.round + 1 });
  for (const e of r.ents.values()) { e.k = 0; e.d = 0; e.hp = 100; e.alive = e.bot; e.spawnT = now(); e.p = [0, -50, 0]; }
  broadcast(r, { t: 'round', map: m, round: r.round, clock: r.clock, target: r.cfg.target, ents: [...r.ents.values()].map(pub) });
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
function onMsg(ws, raw) {
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
      broadcast(r, { t: 'f', s: m.s, a: m.a, b: m.b, w: m.w }, e.id);
      break;
    case 'h': hit(r, e, m); break;
    case 'r':                                                                          // I respawned at p
      if (r.state !== 'play' || e.alive) break;
      e.alive = true; e.hp = 100; e.spawnT = now(); if (Array.isArray(m.p)) e.p = m.p;
      broadcast(r, { t: 'sp', id: e.id, p: e.p }, e.id);
      break;
    case 'br': {                                                                        // host: a bot respawned at p
      const b = r.ents.get(m.id); if (e.id !== r.host || !b || !b.bot || b.alive || r.state !== 'play') break;
      b.alive = true; b.hp = 100; b.spawnT = now(); if (Array.isArray(m.p)) b.p = m.p;
      broadcast(r, { t: 'sp', id: b.id, p: b.p }, e.id);
      break;
    }
    case 'hillpos':                                                                    // host: where the hill is on this map (same for every client)
      if (e.id === r.host && Array.isArray(m.p) && !r.hill) { r.hill = m.p.map(Number); broadcast(r, { t: 'hillpos', p: r.hill }); }
      break;
    case 'emote': broadcast(r, { t: 'emote', s: e.id, k: String(m.k).slice(0, 12) }, e.id); break;
    case 'ping': send(ws, { t: 'pong', c: m.c }); break;
  }
}

// ---------- loop ----------
let lastT = now();
setInterval(() => {
  const t = now(), dt = t - lastT; lastT = t;
  for (const r of rooms.values()) {
    for (const e of humans(r)) if (t - e.lastMsg > 20) { log(`timeout ${e.name}`); e.ws.terminate(); }
    if (r.state === 'play') {
      r.clock = Math.max(0, r.cfg.time - (t - r.t0));
      hillTick(r, dt);
      if (r.clock <= 0) endRound(r);
    } else if (t - r.endT >= END_PAUSE) newRound(r);
    if (r.state !== 'play') continue;
    const l = []; for (const e of r.ents.values()) l.push([e.id, +e.p[0].toFixed(2), +e.p[1].toFixed(2), +e.p[2].toFixed(2), +e.yaw.toFixed(2), +e.pi.toFixed(2), +e.sp.toFixed(1), e.alive ? 1 : 0, e.fl | 0]);
    broadcast(r, { t: 'snap', c: +r.clock.toFixed(1), e: l, sc: r.score });
  }
}, 1000 / TICK);

function log(s) { if (!process.env.QUIET) console.log(new Date().toISOString().slice(11, 19), s); }

// plain HTTP: health check + player count (handy for the lobby "players online" line)
const srv = http.createServer((req, res) => {
  const n = [...rooms.values()].reduce((a, r) => a + humans(r).length, 0);
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify({ ok: true, v: VERSION, players: n, rooms: rooms.size }));
});
const wss = new WebSocketServer({ server: srv, maxPayload: 16 * 1024 });
wss.on('connection', ws => {
  ws.on('message', d => onMsg(ws, d));
  ws.on('close', () => leave(ws));
  ws.on('error', () => {});
});
srv.listen(PORT, () => log(`Blastline server on :${PORT}`));
export { rooms, MODES };
