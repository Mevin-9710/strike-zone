// Online play: the WebSocket link to the Blastline server (server/server.mjs) + snapshot interpolation.
// The game logic for online matches lives in game.js (section "online"); this file only moves messages.
export const NET_VERSION = 1;
const INTERP = 0.11;                                    // draw other players this many seconds in the past (smooth between 20 Hz snapshots)

export function serverUrl(Q, RC) {                      // ?mp=wss://host overrides remote-config mpUrl; ?mp=0 turns online off
  const q = Q.get('mp');
  if (q === '0') return '';
  if (q) return q.startsWith('ws') ? q : `wss://${q}`;
  return RC.mpUrl || '';
}

const SNAP = { t: 'snap' }, SC = { A: 0, B: 0 }, BOT_BUF = new ArrayBuffer(3 + 14 * 128), BV = new DataView(BOT_BUF);
const q16 = v => Math.max(-32768, Math.min(32767, Math.round(v)));
let bn = 0;
export function createNet() {
  const N = {
    ws: null, on: false, me: 0, team: 'A', host: false, room: '', mode: '', map: 0, round: 0, clock: 0, target: 0, score: { A: 0, B: 0 },
    state: 'play', hill: null, hillOwn: '', br: null, zone: null, zoneNext: 0, zoneShrink: 0, alive: 0, ents: new Map(), handler: () => {}, ping: 0, sentT: 0, botT: 0, url: '',
    connect(url, opts) {
      N.close(); N.url = url;
      return new Promise((res, rej) => {
        let ws; try { ws = new WebSocket(url); } catch (e) { rej(e); return; }
        N.ws = ws; let done = false;
        const to = setTimeout(() => { if (!done) { done = true; rej(new Error('timeout')); try { ws.close(); } catch { /* closed */ } } }, 6000);
        ws.onopen = () => ws.send(JSON.stringify({ t: 'join', v: NET_VERSION, mode: opts.mode, name: opts.name, room: opts.room || '', dev: opts.dev || 'd' }));
        ws.binaryType = 'arraybuffer';
        ws.onmessage = ev => {
          if (typeof ev.data !== 'string') { if (snapBin(ev.data)) N.handler(SNAP); return; }
          let m; try { m = JSON.parse(ev.data); } catch { return; }
          if (m.t === 'welcome') { welcome(m); if (!done) { done = true; clearTimeout(to); res(m); } }
          else if (m.t === 'err') { if (!done) { done = true; clearTimeout(to); rej(new Error(m.why)); } return; }
          else if (m.t === 'snap') snap(m);
          else if (m.t === 'pong') N.ping = Math.round(performance.now() - m.c);
          else track(m);
          N.handler(m);
        };
        ws.onclose = () => { const was = N.ws === ws; if (was) { N.ws = null; if (N.on) N.handler({ t: 'closed' }); N.on = false; } if (!done) { done = true; clearTimeout(to); rej(new Error('closed')); } };
        ws.onerror = () => {};
      });
    },
    close() { N.on = false; if (N.ws) { const w = N.ws; N.ws = null; try { w.close(); } catch { /* already closed */ } } N.ents.clear(); },
    send(m) { if (N.ws && N.ws.readyState === 1) N.ws.send(JSON.stringify(m)); },
    // my state, 20 Hz
    sendState(t, p, yaw, pitch, speed, w) {
      if (t - N.sentT < 0.05) return; N.sentT = t;
      N.send({ t: 's', p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], y: +yaw.toFixed(3), pi: +pitch.toFixed(2), sp: +speed.toFixed(1), w });
      if ((N.pingT = (N.pingT || 0) + 1) % 40 === 0) N.send({ t: 'ping', c: performance.now() });
    },
    // host: bot states, binary (see server onBin). Call botsBegin(t) -> false if not due; then bot(...) per bot; then botsSend()
    botsBegin(t) { if (t - N.botT < 0.05 || !N.ws || N.ws.readyState !== 1) return false; N.botT = t; bn = 0; return true; },
    bot(id, x, y, z, yaw, sp, fl) {
      const o = 3 + bn * 14; if (o + 14 > BOT_BUF.byteLength) return;
      BV.setUint32(o, id, true); BV.setInt16(o + 4, q16(x * 50), true); BV.setInt16(o + 6, q16(y * 50), true); BV.setInt16(o + 8, q16(z * 50), true);
      BV.setInt16(o + 10, q16(Math.atan2(Math.sin(yaw), Math.cos(yaw)) * 10000), true); BV.setUint8(o + 12, Math.min(255, Math.max(0, Math.round(sp * 10)))); BV.setUint8(o + 13, fl & 255); bn++;
    },
    botsSend() { BV.setUint8(0, 2); BV.setUint16(1, bn, true); N.ws.send(new Uint8Array(BOT_BUF, 0, 3 + bn * 14)); },
    shot(s, a, b, w) { N.send({ t: 'f', s, a: [+a.x.toFixed(2), +a.y.toFixed(2), +a.z.toFixed(2)], b: [+b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2)], w }); },
    hit(s, v, d, hd, w) { N.send({ t: 'h', s, v, d: Math.round(d * 10) / 10, hd: hd ? 1 : 0, w }); },
    // interpolated pose of entity `e` (from snapshots) into out {x,y,z,yaw,sp}; false if none yet
    pose(id, out) {
      const e = N.ents.get(id), b = e?.buf; if (!b || !b.length) return false;
      const rt = performance.now() / 1000 - INTERP;
      let i = b.length - 1; while (i > 0 && b[i - 1][0] > rt) i--;
      const B = b[i], A = b[Math.max(0, i - 1)];
      let k = B[0] === A[0] ? 1 : (rt - A[0]) / (B[0] - A[0]); k = Math.max(0, Math.min(1.2, k));
      out.x = A[1] + (B[1] - A[1]) * k; out.y = A[2] + (B[2] - A[2]) * k; out.z = A[3] + (B[3] - A[3]) * k;
      let dy = B[4] - A[4]; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); out.yaw = A[4] + dy * k; out.pitch = B[5]; out.sp = B[6]; out.fl = B[8];
      return true;
    },
  };
  function welcome(m) {
    Object.assign(N, { on: true, me: m.you, team: m.team, host: m.host, room: m.room, mode: m.mode, map: m.map, round: m.round, clock: m.clock, target: m.target, score: m.score, state: m.state, hill: m.hill, hillOwn: m.hillOwn || '', br: m.br || null, alive: m.br?.alive || 0, zone: null });
    N.ents.clear(); for (const e of m.ents) N.ents.set(e.id, { ...e, buf: [] });
  }
  // binary snapshot from the server (layout in server/server.mjs, "binary snapshots"); fills SNAP + the interpolation buffers
  function snapBin(ab) {
    const d = new DataView(ab); if (d.byteLength < 10 || d.getUint8(0) !== 1) return false;
    const br = d.getUint8(1) & 1; let o = 2;
    N.clock = d.getUint16(o, true) / 10; SC.A = d.getUint16(o + 2, true); SC.B = d.getUint16(o + 4, true); o += 6; N.score = SC;
    if (br) {
      const z = N.zone || (N.zone = [0, 0, 0]); z[0] = d.getFloat32(o, true); z[1] = d.getFloat32(o + 4, true); z[2] = d.getFloat32(o + 8, true);
      N.zoneNext = d.getUint16(o + 12, true) / 10; N.zoneShrink = d.getUint16(o + 14, true) / 10; N.alive = d.getUint8(o + 16); o += 17;
    }
    const n = d.getUint16(o, true), t = performance.now() / 1000; o += 2;
    for (let i = 0; i < n && o + 15 <= d.byteLength; i++, o += 15) {
      const e = N.ents.get(d.getUint32(o, true)); if (!e) continue;
      const f = d.getUint8(o + 14); e.alive = !!(f & 1);
      if (e.id === N.me) continue;
      const b = e.buf, q = b.length >= 12 ? b.shift() : new Array(9);              // reuse the oldest sample's array
      q[0] = t; q[1] = d.getInt16(o + 4, true) / 50; q[2] = d.getInt16(o + 6, true) / 50; q[3] = d.getInt16(o + 8, true) / 50;
      q[4] = d.getInt16(o + 10, true) / 10000; q[5] = d.getInt8(o + 12) / 80; q[6] = d.getUint8(o + 13) / 10; q[7] = f & 1; q[8] = f >> 1; b.push(q);
    }
    return true;
  }
  function snap(m) {
    N.clock = m.c; if (m.sc) N.score = m.sc;
    if (m.z) { N.zone = m.z; N.zoneNext = m.zn; N.zoneShrink = m.zs; N.alive = m.al; }
    const t = performance.now() / 1000;
    for (const q of m.e) {
      const e = N.ents.get(q[0]); if (!e) continue;
      e.alive = !!q[7];
      if (q[0] === N.me) continue;
      const b = e.buf; b.push([t, q[1], q[2], q[3], q[4], q[5], q[6], q[7], q[8]]); if (b.length > 12) b.shift();
    }
  }
  function track(m) {                                   // keep the roster in sync for every message that changes it
    if (m.t === 'add') N.ents.set(m.e.id, { ...m.e, buf: [] });
    else if (m.t === 'del') N.ents.delete(m.id);
    else if (m.t === 'host') N.host = m.on !== false;
    else if (m.t === 'dmg') { const v = N.ents.get(m.v); if (v) v.hp = m.hp; }
    else if (m.t === 'kill') { N.score = m.score; const s = N.ents.get(m.s), v = N.ents.get(m.v); if (s) s.k = m.sk; if (v) { v.d = m.vd; v.alive = false; v.hp = 0; } if (m.alive) N.alive = m.alive; }
    else if (m.t === 'zone') { if (N.br) Object.assign(N.br, { ph: m.ph, to: m.to, dps: m.dps }); }
    else if (m.t === 'took') { if (N.br) N.br.taken.push(m.i); const e = N.ents.get(m.by); if (e) { e.hp = m.hp; e.ar = m.ar; } }
    else if (m.t === 'sp') { const e = N.ents.get(m.id); if (e) { e.alive = true; e.hp = 100; e.buf.length = 0; e.p = m.p; } }
    else if (m.t === 'hill') N.hillOwn = m.own;
    else if (m.t === 'hillpos') N.hill = m.p;
    else if (m.t === 'end') { N.state = 'end'; N.score = m.score; }
    else if (m.t === 'round') { Object.assign(N, { state: 'play', map: m.map, round: m.round, clock: m.clock, target: m.target, score: { A: 0, B: 0 }, hill: null, hillOwn: '', br: m.br || null, alive: m.br?.alive || 0, zone: null }); N.ents.clear(); for (const e of m.ents) N.ents.set(e.id, { ...e, buf: [] }); }
  }
  return N;
}
