// Hit check against what the shooter saw: the victim steps from open ground behind a wall; a hit sent with the time of the
// earlier (visible) position must count, the same hit without that time must be refused as through the wall.
//   node tools/net/rewind_check.mjs
import { createNet } from '../../game/net.js';
import { losOk } from '../../server/los.mjs';
import { spawn } from 'node:child_process';
const sleep = ms => new Promise(r => setTimeout(r, ms));
// find a shooter spot S, a visible spot P1 and a hidden spot P2 about 2.5 m away on Island Ring (map 4)
let S, P1, P2;
search: for (let x = 10; x < 230; x += 3) for (let z = 10; z < 230; z += 3) {
  const s = [x, 0.2, z]; for (let a = 0; a < 6.28; a += 0.4) { const p1 = [x + Math.sin(a) * 25, 0.2, z + Math.cos(a) * 25];
    if (!losOk(4, s, p1)) continue; for (let b = 0; b < 6.28; b += 0.8) { const p2 = [p1[0] + Math.sin(b) * 2.5, 0.2, p1[2] + Math.cos(b) * 2.5]; if (!losOk(4, s, p2) && !losOk(4, p2, s)) { S = s; P1 = p1; P2 = p2; break search; } } }
}
if (!S) { console.log('no spot found'); process.exit(1); }
const PORT = 8792, srv = spawn(process.execPath, [new URL('../../server/server.mjs', import.meta.url).pathname], { env: { ...process.env, PORT: String(PORT), QUIET: '1' }, stdio: 'inherit' });
await sleep(400);
const A = createNet(), B = createNet(); let dmg = 0; A.handler = () => {}; B.handler = m => { if (m.t === 'dmg' && m.v === B.me) dmg++; };
await A.connect(`ws://localhost:${PORT}`, { mode: 'br', name: 'Shooter' }); await sleep(200);
await B.connect(`ws://localhost:${PORT}`, { mode: 'br', name: 'Victim', room: A.room }); await sleep(300);
A.send({ t: 'r', p: S }); B.send({ t: 'r', p: P1 });
const V3 = p => ({ x: p[0], y: p[1], z: p[2] }); let bp = P1;
const iv = setInterval(() => { const t = performance.now() / 1000; A.sendState(t, V3(S), 0, 0, 0, 'vex_p9', true); B.sendState(t, V3(bp), 0, 0, 0, 'vex_p9', true); }, 20);
await sleep(3000);                                                                  // spawn protection
for (let i = 0; i < 20 && !(A.ents.get(B.me)?.buf.length); i++) await sleep(100);
const e = A.ents.get(B.me); e.del = 0.3;                                             // pretend my screen shows the victim 0.3 s late
await sleep(200); bp = P2; await sleep(150);                                         // the victim steps behind the wall (0.15 s ago)
A.hit(A.me, B.me, 20, 0, 'vex_p9'); await sleep(300);
const withTime = dmg;
const HV = new DataView(new ArrayBuffer(7)); HV.setUint8(0, 8); HV.setUint8(1, A.ents.get(A.me).sl); HV.setUint8(2, e.sl); HV.setUint16(3, 200, true); HV.setUint8(5, 0); HV.setUint8(6, 0);
await sleep(600); A.ws.send(new Uint8Array(HV.buffer)); await sleep(300);          // the old 7-byte hit (no time) once the rate limit is clear
const without = dmg - withTime;
const st = await (await fetch(`http://localhost:${PORT}/stats`)).json();
console.log(JSON.stringify({ S, P1, P2, hitWithTime: withTime, hitWithoutTime: without, rejWall: st.rej_wall || 0 }));
clearInterval(iv); srv.kill(); process.exit(withTime === 1 && without === 0 ? 0 : 1);
