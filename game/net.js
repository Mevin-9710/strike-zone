// Online play: the WebSocket link to the Blastline server (server/server.mjs) + snapshot interpolation.
// The game logic for online matches lives in game.js (section "online"); this file only moves messages.
export const NET_VERSION = 2;
let TICK = 1 / 15;                                      // server snapshot interval (s); the server says in 'welcome'
const JITTER = 0.04;                                    // least extra delay that hides late packets (it grows with the measured lateness); an entity sent every `iv` ticks is drawn TICK*iv + that in the past
const BUF = 16;                                         // samples kept per entity

export function serverUrl(Q, RC) {                      // ?mp=wss://host overrides remote-config mpUrl; ?mp=0 turns online off
  const q = Q.get('mp');
  if (q === '0') return '';
  if (q) return q.startsWith('ws') ? q : `wss://${q}`;
  return RC.mpUrl || '';
}

const SNAP = { t: 'snap' }, SC = { A: 0, B: 0 }, ZC = [0, 0, 0], BOT_BUF = new ArrayBuffer(6 + 11 * 255), BV = new DataView(BOT_BUF);
const UP = new ArrayBuffer(16), UV = new DataView(UP), SH = new ArrayBuffer(14), SV = new DataView(SH), HB = new ArrayBuffer(7), HV = new DataView(HB);
const DEC = new TextDecoder();
const DM = { t: 'dmg', s: 0, v: 0, d: 0, hp: 0, ar: 0, hd: false, z: 0 };            // reused for every binary damage message
// weapon ids in the server's WPN table order (server/server.mjs)
const WPN_IDS = ['vex_p9', 'harrow_45', 'bulldog_r6', 'ar7_lance', 'kestrel_bp', 'warden_br', 'grinder_lmg', 'hailstorm_mg', 'longshot_bolt', 'javelin_amr', 'blast'];
const yawU = a => Math.round((Math.atan2(Math.sin(a), Math.cos(a)) + Math.PI) / (2 * Math.PI) * 65536) & 65535;
const q16 = v => Math.max(-32768, Math.min(32767, Math.round(v)));
let bn = 0;
export function createNet() {
  const N = {
    ws: null, on: false, me: 0, team: 'A', host: false, room: '', mode: '', map: 0, round: 0, target: 0, score: { A: 0, B: 0 },
    state: 'play', hill: null, hillOwn: '', br: null, alive: 0, ents: new Map(), slots: [], handler: () => {}, ping: 0, sentT: 0, botT: 0, url: '',
    off: 0, offS: 0, offOk: false, late: 0, lateM: 0, lateV: 0, frameT: 0, fdt: 0, bytes: 0, traceId: 0, trace: [], myPos: [0, 0, 0], myAlive: true,
    // the round clock counts down locally between the server's once-a-second updates
    set clock(v) { clk0 = v; clkT = performance.now() / 1000; }, get clock() { return Math.max(0, clk0 - (N.state === 'play' ? performance.now() / 1000 - clkT : 0)); },
    // BR zone: worked out locally from the zone events (the server resyncs the timers once a second)
    get zone() {
      if (!N.br || !Z.to) return null; const t = performance.now() / 1000, k = Z.t1 > Z.t0 ? Math.min(1, Math.max(0, (t - Z.t0) / (Z.t1 - Z.t0))) : 1;
      for (let i = 0; i < 3; i++) ZC[i] = Z.from[i] + (Z.to[i] - Z.from[i]) * k; return ZC;
    },
    get zoneShrink() { return Z.to ? Math.max(0, Z.t1 - performance.now() / 1000) : 0; },
    get zoneNext() { return Z.to ? Math.max(0, Z.next - performance.now() / 1000) : 0; },
    connect(url, opts) {
      N.close(); N.url = url;
      return new Promise((res, rej) => {
        let ws; try { ws = new WebSocket(url); } catch (e) { rej(e); return; }
        N.ws = ws; let done = false;
        const to = setTimeout(() => { if (!done) { done = true; rej(new Error('timeout')); try { ws.close(); } catch { /* closed */ } } }, 6000);
        ws.onopen = () => ws.send(JSON.stringify({ t: 'join', v: NET_VERSION, mode: opts.mode, name: opts.name, room: opts.room || '', dev: opts.dev || 'd' }));
        ws.binaryType = 'arraybuffer';
        ws.onmessage = ev => {
          if (typeof ev.data === 'string') { N.bytes += ev.data.length; onText(ev.data); return; }
          const ab = ev.data, u = new Uint8Array(ab); N.bytes += ab.byteLength;
          if (u[0] !== 9) { onBin(ab); return; }
          for (let k = 1; k + 3 <= u.length;) {                                        // a bundle: all of one tick's messages (server flush())
            const n = u[k] | (u[k + 1] << 8), kind = u[k + 2]; k += 3;
            if (kind === 0) onText(DEC.decode(u.subarray(k, k + n))); else onBin(ab.slice(k, k + n));
            k += n;
          }
        };
        const onBin = ab => { if (snapBin(ab)) N.handler(SNAP); else if (dmgBin(ab)) { track(DM); N.handler(DM); } };
        const onText = str => {
          let m; try { m = JSON.parse(str); } catch { return; }
          if (m.t === 'welcome') { welcome(m); if (!done) { done = true; clearTimeout(to); res(m); } }
          else if (m.t === 'err') { if (!done) { done = true; clearTimeout(to); rej(new Error(m.why)); } return; }
          else if (m.t === 'pong') N.ping = Math.round(performance.now() - m.c);
          else track(m);
          N.handler(m);
        };
        ws.onclose = () => { const was = N.ws === ws; if (was) { N.ws = null; if (N.on) N.handler({ t: 'closed' }); N.on = false; } if (!done) { done = true; clearTimeout(to); rej(new Error('closed')); } };
        ws.onerror = () => {};
      });
    },
    close() { N.on = false; if (N.ws) { const w = N.ws; N.ws = null; try { w.close(); } catch { /* already closed */ } } N.ents.clear(); N.slots.length = 0; },
    send(m) { if (N.ws && N.ws.readyState === 1) N.ws.send(JSON.stringify(m)); },
    // my state, 20 Hz, binary (layout: server/server.mjs "binary uploads"); also remembers where I am for the interpolation delay
    sendState(t, p, yaw, pitch, speed, w, alive) {
      N.myPos[0] = p.x; N.myPos[1] = p.y; N.myPos[2] = p.z; N.myAlive = alive !== false;
      if (t - N.sentT < TICK * 0.95 || !N.ws || N.ws.readyState !== 1) return; N.sentT = t;
      UV.setUint8(0, 4); UV.setUint32(1, (performance.now() | 0) >>> 0, true); UV.setInt16(5, q16(p.x * 50), true); UV.setInt16(7, q16(p.y * 50), true); UV.setInt16(9, q16(p.z * 50), true);
      UV.setUint16(11, yawU(yaw), true); UV.setInt8(13, Math.max(-127, Math.min(127, Math.round(pitch * 80)))); UV.setUint8(14, Math.min(255, Math.max(0, Math.round(speed * 10)))); UV.setUint8(15, Math.max(0, WPN_IDS.indexOf(w)));
      N.ws.send(new Uint8Array(UP, 0, 16));
      if ((N.pingT = (N.pingT || 0) + 1) % 40 === 0) N.send({ t: 'ping', c: performance.now() });
    },
    // host: bot states. botsBegin(t) -> false if not due; then bot(...) per bot; then botsSend()
    botsBegin(t) { if (t - N.botT < TICK * 0.95 || !N.ws || N.ws.readyState !== 1) return false; N.botT = t; bn = 0; return true; },
    bot(id, x, y, z, yaw, sp, fl) {
      const e = N.ents.get(id), o = 6 + bn * 11; if (!e || o + 11 > BOT_BUF.byteLength) return;
      BV.setUint8(o, e.sl); BV.setInt16(o + 1, q16(x * 50), true); BV.setInt16(o + 3, q16(y * 50), true); BV.setInt16(o + 5, q16(z * 50), true);
      BV.setUint16(o + 7, yawU(yaw), true); BV.setUint8(o + 9, Math.min(255, Math.max(0, Math.round(sp * 10)))); BV.setUint8(o + 10, fl & 255); bn++;
    },
    botsSend() { BV.setUint8(0, 6); BV.setUint32(1, (performance.now() | 0) >>> 0, true); BV.setUint8(5, bn); N.ws.send(new Uint8Array(BOT_BUF, 0, 6 + bn * 11)); },
    shot(s, a, b) {
      const e = N.ents.get(s); if (!e || !N.ws || N.ws.readyState !== 1) return;
      SV.setUint8(0, 5); SV.setUint8(1, e.sl); SV.setInt16(2, q16(a.x * 50), true); SV.setInt16(4, q16(a.y * 50), true); SV.setInt16(6, q16(a.z * 50), true);
      SV.setInt16(8, q16(b.x * 50), true); SV.setInt16(10, q16(b.y * 50), true); SV.setInt16(12, q16(b.z * 50), true); N.ws.send(new Uint8Array(SH, 0, 14));
    },
    hit(s, v, d, hd, w) {                                                          // binary: u8 8, u8 shooter slot, u8 victim slot, u16 damage*10, u8 flags, u8 weapon
      const a = N.ents.get(s), b = N.ents.get(v); if (!a || !b || !N.ws || N.ws.readyState !== 1) return;
      HV.setUint8(0, 8); HV.setUint8(1, a.sl); HV.setUint8(2, b.sl); HV.setUint16(3, Math.min(65535, Math.round(d * 10)), true); HV.setUint8(5, hd ? 1 : 0); HV.setUint8(6, w ? Math.max(0, WPN_IDS.indexOf(w)) : 255);
      N.ws.send(new Uint8Array(HB, 0, 7));
    },
    // once per frame: the drawn clock follows the measured server clock without jumps (at most 5% faster or slower)
    frame() {
      const t = performance.now() / 1000, dt = Math.min(0.1, t - (N.frameT || t)); N.frameT = t; N.fdt = dt;
      const d = N.off - N.offS; N.offS = Math.abs(d) > 0.25 ? N.off : N.offS + Math.max(-0.05 * dt, Math.min(0.05 * dt, d));
    },
    // interpolated pose of entity `id` (from snapshots) into out {x,y,z,yaw,pitch,sp,fl}, plus the shots it fired since the last call
    // (out.shot = count, out.shotYaw/shotPitch/shotD = direction and range of the latest); false if no data yet
    pose(id, out) {
      const e = N.ents.get(id), b = e?.buf; out.shot = 0; if (!b || !b.length) return false;
      const d2 = (b[b.length - 1][1] - N.myPos[0]) ** 2 + (b[b.length - 1][3] - N.myPos[2]) ** 2;   // the server's send rate for this distance (see NEAR_A/B)
      const iv = !N.myAlive || (N.host && !e.bot) || d2 < 2500 ? 1 : d2 < 14400 ? 2 : 4;
      const dd = Math.min(0.5, Math.max(TICK * iv, e.gap) + Math.max(JITTER, e.lat + 0.015)) - e.del; e.del += Math.max(-0.03 * N.fdt, Math.min(0.1 * N.fdt, dd));   // change the delay slowly (grow faster than shrink) when the send rate changes
      const rt = performance.now() / 1000 - N.offS - e.del;
      let i = b.length - 1; while (i > 0 && b[i - 1][0] > rt) i--;
      const B = b[i], A = b[Math.max(0, i - 1)];
      const k = B[0] === A[0] || rt >= B[0] ? 1 : rt <= A[0] ? 0 : (rt - A[0]) / (B[0] - A[0]);
      out.x = A[1] + (B[1] - A[1]) * k; out.y = A[2] + (B[2] - A[2]) * k; out.z = A[3] + (B[3] - A[3]) * k;
      if (rt > B[0] && i === b.length - 1 && B[0] > A[0] && B[0] - A[0] < 0.4) {       // ran out of samples (a late packet): keep going a little instead of freezing
        const x = Math.min(rt - B[0], 0.1) / (B[0] - A[0]); out.x += (B[1] - A[1]) * x; out.z += (B[3] - A[3]) * x;
      }
      let dy = B[4] - A[4]; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); out.yaw = A[4] + dy * k; out.pitch = A[5] + (B[5] - A[5]) * k; out.fl = B[8];
      out.sp = B[0] > A[0] && rt < B[0] + 0.1 ? Math.hypot(B[1] - A[1], B[3] - A[3]) / (B[0] - A[0]) : 0;   // speed from the positions (for the walk/run animation)
      if (N.traceId === id && N.trace.length < 2000) N.trace.push([performance.now(), out.x, out.z]);   // tests: what the screen draws, frame by frame
      if (e.shotT < 0) e.shotT = rt;                                                  // shots fire when the drawn time passes their snapshot
      else if (rt > e.shotT) { for (const q of b) if (q[9] && q[0] > e.shotT && q[0] <= rt) { out.shot += q[9]; out.shotYaw = q[10]; out.shotPitch = q[11]; out.shotD = q[12]; } e.shotT = rt; }
      return true;
    },
  };
  let clk0 = 0, clkT = 0;
  const Z = { from: null, to: null, t0: 0, t1: 0, next: 0 };
  function zoneFrom(br) {                                                             // welcome / round: where the zone is right now
    const t = performance.now() / 1000; if (!br) { Z.to = null; return; }
    Z.from = br.from.slice(); Z.to = br.to.slice(); Z.t1 = t + br.sh; Z.t0 = br.sh > 0 && br.k < 1 ? Z.t1 - br.sh / (1 - br.k) : t - 1; Z.next = t + br.next;
  }
  const ent = e => ({ ...e, buf: [], q: new Int32Array(8), has: false, del: TICK + JITTER, gap: TICK, lat: 0, latM: 0, latV: 0, latC: 0, latP: 0, latT: 0, shotT: -1 });
  function setEnts(list) { N.ents.clear(); N.slots.length = 0; for (const e of list) { const o = ent(e); N.ents.set(e.id, o); N.slots[e.sl] = o; } }
  function welcome(m) {
    if (m.hz > 0) TICK = 1 / m.hz;
    Object.assign(N, { on: true, me: m.you, team: m.team, host: m.host, room: m.room, mode: m.mode, map: m.map, round: m.round, clock: m.clock, target: m.target, score: m.score, state: m.state, hill: m.hill, hillOwn: m.hillOwn || '', br: m.br || null, alive: m.br?.alive || 0, offOk: false });
    zoneFrom(m.br); setEnts(m.ents);
  }
  // binary snapshot (layout in server/server.mjs, "binary snapshots"): applies the deltas, fills the interpolation buffers
  function snapBin(ab) {
    const d = new DataView(ab), L = d.byteLength; if (L < 7 || d.getUint8(0) !== 5) return false;
    const fl = d.getUint8(1), info = fl & 1, st = d.getUint32(2, true) / 1000, now = performance.now() / 1000; let o = 6;
    const off = now - st;                                                              // clock sync: the smallest delay seen, creeping up slowly
    if (!N.offOk || off < N.off || off - N.off > 5) { if (!N.offOk) N.offS = off; N.off = off; N.offOk = true; } else N.off += (off - N.off) * 0.002;
    const lt = Math.min(0.4, off - N.off), dl = lt - N.lateM; N.lateM += dl * 0.03; N.lateV += (dl * dl - N.lateV) * 0.03;
    N.late = N.lateM + 2 * Math.sqrt(N.lateV);                                         // how late packets come vs the fastest one (mean + 2 sd; stats only, the delay is per entity below)
    if (info) {
      N.clock = d.getUint16(o, true) / 10; SC.A = d.getUint16(o + 2, true); SC.B = d.getUint16(o + 4, true); N.score = SC;
      const al = d.getUint8(o + 6); if (N.br) { N.alive = al; const zn = d.getUint16(o + 7, true) / 10, zs = d.getUint16(o + 9, true) / 10; if (Z.to) { if (zs > 0) Z.t1 = now + zs; Z.next = now + zn; } }
      o += 11;
    }
    const bm = fl & 2, n = d.getUint8(o++), bAt = o, nbits = bm ? n * 8 : 0; let lastAge = 0, bi = -1;
    if (bm) o += n;                                                                    // slot bitmap: one record per set bit, in slot order
    for (let r = 0; ; r++) {
      let sl;
      if (bm) { do bi++; while (bi < nbits && !((d.getUint8(bAt + (bi >> 3)) >> (bi & 7)) & 1)); if (bi >= nbits) break; sl = bi; }
      else { if (r >= n || o + 2 > L) break; sl = d.getUint8(o++); }
      if (o >= L) break;
      const e = N.slots[sl], mask = d.getUint8(o++), pm = mask & 3;
      const q = e ? e.q : SCRATCH; let age = 0, hold = -1;
      if (pm === 1) { q[0] += d.getInt8(o); q[1] += d.getInt8(o + 1); q[2] += d.getInt8(o + 2); o += 3; }
      else if (pm === 3) { q[0] += d.getInt8(o); q[2] += d.getInt8(o + 1); o += 2; }     // height unchanged
      else if (pm === 2) { q[0] = d.getInt16(o, true); q[1] = d.getInt16(o + 2, true); q[2] = d.getInt16(o + 4, true); o += 6; }
      if (mask & 3) { if (!(mask & 16)) lastAge = d.getUint8(o++) / 500; age = lastAge; }
      if (mask & 128) hold = d.getUint8(o++) / 250;
      if (mask & 4) { const dy = d.getInt8(o++); if (dy === -128) { q[3] = d.getUint16(o, true); o += 2; } else q[3] = (q[3] + dy + 4096) & 4095; }
      if (mask & 8) q[4] = d.getInt8(o++);
      if (mask & 32) q[6] = d.getUint8(o++);
      let sh = 0, sy = 0, sp = 0, sd = 0;
      if (mask & 64) { sh = d.getUint8(o); const so = d.getInt8(o + 1); o += 2; if (so === -128) { sy = d.getUint16(o, true); o += 2; } else sy = ((q[3] + so) & 4095) << 4; sp = d.getInt8(o); sd = d.getUint8(o + 1); o += 2; }
      if (!e) continue;
      if (pm === 2) e.has = true; if (!e.has) continue;                                // a delta without a base (should not happen): wait for a full record
      e.alive = !!(q[6] & 1);
      const b = e.buf, last = b.length ? b[b.length - 1] : null;
      let t = (mask & 3) ? st - age : last ? Math.max(last[0], st - TICK) : st;         // position records carry when they were captured
      if (last && t <= last[0]) t = last[0] + 0.001;
      if (hold >= 0 && last && st - hold > last[0] && st - hold < t) { const h = push(b), p = b[b.length - 2]; for (let j = 1; j < 13; j++) h[j] = p[j]; h[0] = st - hold; h[9] = 0; }   // it stood still until then
      if (last && hold < 0) { const g = t - last[0]; e.gap = Math.max(g < 1 ? g : 0, e.gap * 0.97); }   // spacing of recent samples (decaying max): the delay covers it
      if (mask & 3) {                                                                  // how long from capture (on the sender) to here, past the fastest: upload + server + download lateness
        const a = Math.min(0.45, lt + age), da = a - e.latM; e.latM += da * 0.05; e.latV += (da * da - e.latV) * 0.05;
        if (st - e.latT > 4) { e.latP = e.latC; e.latC = 0; e.latT = st; } e.latC = Math.max(e.latC, a);   // the worst in the last 4-8 s (two 4 s buckets)
        e.lat = Math.max(e.latM + 2.5 * Math.sqrt(e.latV), 0.8 * Math.max(e.latC, e.latP));   // mean + 2.5 sd, or most of the worst lately: a resent packet is (mostly) covered next time
      }
      const s = push(b);
      s[0] = t; s[1] = q[0] / 50; s[2] = q[1] / 50; s[3] = q[2] / 50; s[4] = q[3] / 4096 * 2 * Math.PI - Math.PI; s[5] = q[4] / 80; s[6] = q[5] / 10; s[7] = q[6] & 1; s[8] = q[6] >> 1;
      s[9] = sh; s[10] = sy / 65536 * 2 * Math.PI - Math.PI; s[11] = sp / 120; s[12] = sd;
    }
    return true;
  }
  function dmgBin(ab) {                                                             // damage, binary (server sendDmg) -> the usual {t:'dmg'} message
    const d = new Uint8Array(ab); if (d.length < 7 || d[0] !== 7) return false;
    const v = N.slots[d[2]], s = d[1] === 255 ? null : N.slots[d[1]]; if (!v) return false;
    DM.s = s ? s.id : 0; DM.v = v.id; DM.d = d[3]; DM.hp = d[4]; DM.ar = d[5]; DM.hd = !!(d[6] & 1); DM.z = d[6] & 2 ? 1 : 0;
    return true;
  }
  const SCRATCH = new Int32Array(8);
  function push(b) { const q = b.length >= BUF ? b.shift() : new Array(13); b.push(q); return q; }   // reuses the oldest sample's array
  function track(m) {                                   // keep the roster in sync for every message that changes it
    if (m.t === 'add') { const o = ent(m.e); N.ents.set(m.e.id, o); N.slots[m.e.sl] = o; }
    else if (m.t === 'del') { const o = N.ents.get(m.id); if (o && N.slots[o.sl] === o) N.slots[o.sl] = null; N.ents.delete(m.id); }
    else if (m.t === 'host') N.host = m.on !== false;
    else if (m.t === 'dmg') { const v = N.ents.get(m.v); if (v) v.hp = m.hp; }
    else if (m.t === 'kill') { N.score = m.score; const s = N.ents.get(m.s), v = N.ents.get(m.v); if (s) s.k = m.sk; if (v) { v.d = m.vd; v.alive = false; v.hp = 0; } if (m.alive) N.alive = m.alive; }
    else if (m.t === 'zone') { if (N.br) { Object.assign(N.br, { ph: m.ph, to: m.to, dps: m.dps }); const t = performance.now() / 1000; Object.assign(Z, { from: m.from, to: m.to, t0: t, t1: t + m.sh, next: t + m.nx }); } }
    else if (m.t === 'took') { if (N.br) N.br.taken.push(m.i); const e = N.ents.get(m.by); if (e) { e.hp = m.hp; e.ar = m.ar; } }
    else if (m.t === 'sp') { const e = N.ents.get(m.id); if (e) { e.alive = true; e.hp = 100; e.buf.length = 0; e.shotT = -1; e.p = m.p; } }
    else if (m.t === 'hill') N.hillOwn = m.own;
    else if (m.t === 'hillpos') N.hill = m.p;
    else if (m.t === 'end') { N.state = 'end'; N.score = m.score; }
    else if (m.t === 'round') { Object.assign(N, { state: 'play', map: m.map, round: m.round, clock: m.clock, target: m.target, score: { A: 0, B: 0 }, hill: null, hillOwn: '', br: m.br || null, alive: m.br?.alive || 0 }); zoneFrom(m.br); setEnts(m.ents); }
  }
  return N;
}
