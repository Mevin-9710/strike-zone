// Load test for the Blastline server: starts server.mjs pinned to ONE cpu core (like the 1 CPU VPS), then fills it with
// simulated players (plain WebSocket clients that move, shoot and hit like the game does; one per room also streams the bots
// like a real host). Reports server CPU, memory, tick time and bandwidth for each step.
//   node server/loadtest.mjs                       default steps (BR rooms of 50 with 10 / 25 / 50 humans; TDM rooms of 8)
//   STEPS="br:4x50:10,br:8x50:10" node server/loadtest.mjs     custom: mode:ROOMSxSIZE:HUMANS[:tight]   (tight = all within 60 m)
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import WebSocket from 'ws';
const PORT = 8811, WS_URL = `ws://127.0.0.1:${PORT}`, SECS = Number(process.env.SECS || 20);
const STEPS = (process.env.STEPS || 'br:1x50:10,br:1x50:25,br:1x50:50,br:4x50:10,br:8x50:10,br:12x50:10,br:4x50:25:tight,tdm:25x8:4').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clk = Number(execSync('getconf CLK_TCK')) || 100;
function cpuOf(pid) { const f = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' '); return (Number(f[11]) + Number(f[12])) / clk; }
async function stats() { return (await fetch(`http://127.0.0.1:${PORT}/stats`)).json(); }

function fakeClient(mode, room, tight, onWelcome) {
  return new Promise(res => {
    const ws = new WebSocket(WS_URL), c = { ws, id: 0, host: false, bots: new Set(), room: '', inB: 0, p: [0, 0, 0], v: [0, 0], t0: 0 };
    const centre = 116, R = tight ? 60 : 160;
    const rnd = () => { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * R / 2; return [centre + Math.cos(a) * r, 0.2, centre + Math.sin(a) * r]; };
    c.p = mode === 'br' ? rnd() : [Math.random() * 60, 0.2, Math.random() * 44];
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', v: 1, mode, name: 'Load' + ((Math.random() * 1e4) | 0), room, dev: 'd' })));
    ws.on('message', (d, bin) => {
      c.inB += d.length; if (bin) return;
      const m = JSON.parse(d);
      if (m.t === 'welcome') { c.id = m.you; c.host = m.host; c.room = m.room; for (const e of m.ents) if (e.bot) c.bots.add(e.id); ws.send(JSON.stringify({ t: 'r', p: c.p })); res(c); }
      else if (m.t === 'add' && m.e.bot) c.bots.add(m.e.id);
      else if (m.t === 'del') c.bots.delete(m.id);
      else if (m.t === 'host') c.host = m.on !== false;
      else if (m.t === 'kill' && m.v === c.id && mode !== 'br') setTimeout(() => ws.readyState === 1 && ws.send(JSON.stringify({ t: 'r', p: c.p })), 2000);
      else if (m.t === 'round') ws.send(JSON.stringify({ t: 'r', p: c.p }));
    });
    ws.on('error', () => {});
  });
}
const botPos = new Map();
function drive(clients, all) {                                         // 20 Hz like the game: state, bots (host), shots and hits now and then
  const buf = Buffer.alloc(3 + 14 * 64);
  return setInterval(() => {
    for (const c of clients) {
      if (c.ws.readyState !== 1) continue;
      c.v[0] += (Math.random() - 0.5) * 0.4; c.v[1] += (Math.random() - 0.5) * 0.4; c.v[0] *= 0.95; c.v[1] *= 0.95;
      c.p[0] += c.v[0] * 0.25; c.p[2] += c.v[1] * 0.25;
      c.ws.send(JSON.stringify({ t: 's', p: c.p.map(v => +v.toFixed(2)), y: Math.random() * 6 - 3, pi: 0, sp: 3.2, w: 'ar7_lance' }));
      if (Math.random() < 0.15) {                                                     // ~3 shots a second, every 3rd one hits someone
        const tg = all[(Math.random() * all.length) | 0];
        c.ws.send(JSON.stringify({ t: 'f', s: c.id, a: c.p, b: tg.p, w: 'ar7_lance' }));
        if (tg !== c && tg.room === c.room && Math.random() < 0.33) c.ws.send(JSON.stringify({ t: 'h', s: c.id, v: tg.id, d: 1, hd: 0, w: 'ar7_lance' }));
      }
      if (c.host && c.bots.size) {
        let n = 0;
        for (const id of c.bots) {
          let p = botPos.get(id); if (!p) botPos.set(id, p = [c.p[0] + (Math.random() - 0.5) * 120, 0.2, c.p[2] + (Math.random() - 0.5) * 120]);
          p[0] += (Math.random() - 0.5) * 0.3; p[2] += (Math.random() - 0.5) * 0.3;
          const o = 3 + n * 14; buf.writeUInt32LE(id, o); buf.writeInt16LE(Math.round(p[0] * 50), o + 4); buf.writeInt16LE(10, o + 6); buf.writeInt16LE(Math.round(p[2] * 50), o + 8); buf.writeInt16LE(0, o + 10); buf[o + 12] = 30; buf[o + 13] = 0; n++;
          if (n >= 64) break;
        }
        buf[0] = 2; buf.writeUInt16LE(n, 1); c.ws.send(buf.subarray(0, 3 + n * 14));
        if (Math.random() < 0.3) {                                                    // bots shoot too: ~6 shots/s per room, a third hit
          const s = [...c.bots][(Math.random() * c.bots.size) | 0], v = all[(Math.random() * all.length) | 0];
          c.ws.send(JSON.stringify({ t: 'f', s, a: botPos.get(s) || c.p, b: v.p, w: '' }));
          if (v.room === c.room && Math.random() < 0.33) c.ws.send(JSON.stringify({ t: 'h', s, v: v.id, d: 1, hd: 0 }));
        }
      }
    }
  }, 50);
}

(async () => {
  const rows = [];
  for (const step of STEPS) {
    const [mode, shape, hum, tight] = step.split(':'), [nRooms, size] = shape.split('x').map(Number), humans = Number(hum);
    const srv = spawn('taskset', ['-c', '0', process.execPath, new URL('./server.mjs', import.meta.url).pathname], { env: { ...process.env, PORT: String(PORT), BR_SIZE: String(size), BR_DROP: '600', QUIET: '1' }, stdio: 'ignore' });
    await sleep(700);
    const clients = [];
    for (let r = 0; r < nRooms; r++) {
      const first = await fakeClient(mode, '', tight); clients.push(first);
      for (let i = 1; i < humans; i++) clients.push(await fakeClient(mode, first.room, tight));
    }
    botPos.clear();
    const timer = drive(clients, clients);
    await sleep(3000);                                                                 // settle
    const s0 = await stats(), c0 = cpuOf(srv.pid), t0 = performance.now(), in0 = clients.reduce((a, c) => a + c.inB, 0);
    await sleep(SECS * 1000);
    const s1 = await stats(), c1 = cpuOf(srv.pid), dt = (performance.now() - t0) / 1000, in1 = clients.reduce((a, c) => a + c.inB, 0);
    const row = { step, players: nRooms * humans, ents: s1.ents, cpu: +((c1 - c0) / dt * 100).toFixed(1), tickMs: +((s1.tickMs - s0.tickMs) / (s1.ticks - s0.ticks)).toFixed(2),
      outKBs: +((in1 - in0) / dt / 1024).toFixed(0), perPlayerKBs: +((in1 - in0) / dt / 1024 / clients.length).toFixed(1), inKBs: +((s1.inBytes - s0.inBytes) / dt / 1024).toFixed(0),
      snapB: Math.round((s1.snapBytes - s0.snapBytes) / Math.max(1, s1.snaps - s0.snaps)), memMB: s1.mem, hitsS: +((s1.hits - s0.hits) / dt).toFixed(0) };
    rows.push(row); console.log(JSON.stringify(row));
    clearInterval(timer); for (const c of clients) c.ws.terminate(); srv.kill(); await sleep(500);
  }
  console.table(rows);
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(rows, null, 1));
})();
