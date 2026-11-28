// End-to-end decode check in a 50-slot BR room: a host (game/net.js in Node) walks 49 bots around the island, an observer decodes
// the snapshots; then everyone stands still and every bot must sit exactly where the host put it (2 cm) on the observer's side.
//   node tools/net/decode_check.mjs
import { createNet } from '../../game/net.js';
import { spawn } from 'node:child_process';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 8793, srv = spawn(process.execPath, [new URL('../../server/server.mjs', import.meta.url).pathname], { env: { ...process.env, PORT: String(PORT), QUIET: '1' }, stdio: 'inherit' });
await sleep(400);
const A = createNet(), B = createNet(); A.handler = B.handler = () => {};
await A.connect(`ws://localhost:${PORT}`, { mode: 'br', name: 'Host' }); await sleep(200);
await B.connect(`ws://localhost:${PORT}`, { mode: 'br', name: 'Obs', room: A.room }); await sleep(300);
for (const [N, p] of [[A, [116, 0.2, 116]], [B, [60, 0.2, 60]]]) N.send({ t: 'r', p });
const bots = [...A.ents.values()].filter(e => e.bot), truth = new Map();
bots.forEach((e, i) => truth.set(e.id, { x: 20 + (i % 7) * 32, z: 20 + ((i / 7) | 0) * 32, yaw: i * 0.3, a: i }));
const P = (x, y, z) => ({ x, y, z });
let t0 = performance.now() / 1000, moving = true;
const tick = setInterval(() => {
  const t = performance.now() / 1000;
  A.sendState(t, P(116, 0.2, 116), 0, 0, 0, 'vex_p9', true); B.sendState(t, P(60, 0.2, 60), 0, 0, 0, 'vex_p9', true);
  if (!A.botsBegin(t)) return;
  for (const e of bots) {
    const s = truth.get(e.id);
    if (moving) { s.a += 0.05; s.x += Math.sin(s.a) * 0.37; s.z += Math.cos(s.a) * 0.37; s.yaw = s.a; s.y = 0.2 + Math.max(0, Math.sin(t * 3 + s.a)) * 0.8; }
    A.bot(e.id, s.x, s.y ?? 0.2, s.z, s.yaw, moving ? 5.5 : 0, 0);
  }
  A.botsSend();
}, 16);
await sleep(5000); moving = false; await sleep(2500); clearInterval(tick);
let bad = 0, n = 0, worst = 0;
for (const e of bots) {
  const o = B.ents.get(e.id), s = truth.get(e.id); if (!o || !o.alive) continue; n++;
  const d = Math.hypot(o.q[0] / 50 - s.x, o.q[2] / 50 - s.z, o.q[1] / 50 - (s.y ?? 0.2)); worst = Math.max(worst, d);
  if (d > 0.03) { bad++; if (bad < 5) console.log('off', e.id, e.sl, d.toFixed(3)); }
}
console.log(JSON.stringify({ bots: bots.length, checked: n, bad, worstM: +worst.toFixed(3), kb: +(B.bytes / 1024).toFixed(1) }));
srv.kill(); process.exit(bad || n < 40 ? 1 : 0);
