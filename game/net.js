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

export function createNet() {
  const N = {
    ws: null, on: false, me: 0, team: 'A', host: false, room: '', mode: '', map: 0, round: 0, clock: 0, target: 0, score: { A: 0, B: 0 },
    state: 'play', hill: null, hillOwn: '', ents: new Map(), handler: () => {}, ping: 0, sentT: 0, botT: 0, url: '',
    connect(url, opts) {
      N.close(); N.url = url;
      return new Promise((res, rej) => {
        let ws; try { ws = new WebSocket(url); } catch (e) { rej(e); return; }
        N.ws = ws; let done = false;
        const to = setTimeout(() => { if (!done) { done = true; rej(new Error('timeout')); try { ws.close(); } catch { /* closed */ } } }, 6000);
        ws.onopen = () => ws.send(JSON.stringify({ t: 'join', v: NET_VERSION, mode: opts.mode, name: opts.name, room: opts.room || '' }));
        ws.onmessage = ev => {
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
    bots(t, list) { if (t - N.botT < 0.05) return false; N.botT = t; N.send({ t: 'b', l: list }); return true; },
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
    Object.assign(N, { on: true, me: m.you, team: m.team, host: m.host, room: m.room, mode: m.mode, map: m.map, round: m.round, clock: m.clock, target: m.target, score: m.score, state: m.state, hill: m.hill, hillOwn: m.hillOwn || '' });
    N.ents.clear(); for (const e of m.ents) N.ents.set(e.id, { ...e, buf: [] });
  }
  function snap(m) {
    N.clock = m.c; if (m.sc) N.score = m.sc;
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
    else if (m.t === 'host') N.host = true;
    else if (m.t === 'dmg') { const v = N.ents.get(m.v); if (v) v.hp = m.hp; }
    else if (m.t === 'kill') { N.score = m.score; const s = N.ents.get(m.s), v = N.ents.get(m.v); if (s) s.k = m.sk; if (v) { v.d = m.vd; v.alive = false; v.hp = 0; } }
    else if (m.t === 'sp') { const e = N.ents.get(m.id); if (e) { e.alive = true; e.hp = 100; e.buf.length = 0; e.p = m.p; } }
    else if (m.t === 'hill') N.hillOwn = m.own;
    else if (m.t === 'hillpos') N.hill = m.p;
    else if (m.t === 'end') { N.state = 'end'; N.score = m.score; }
    else if (m.t === 'round') { Object.assign(N, { state: 'play', map: m.map, round: m.round, clock: m.clock, target: m.target, score: { A: 0, B: 0 }, hill: null, hillOwn: '' }); N.ents.clear(); for (const e of m.ents) N.ents.set(e.id, { ...e, buf: [] }); }
  }
  return N;
}
