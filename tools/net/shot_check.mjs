// End-to-end check of shot direction/range through server + game/net.js: node tools/net/shot_check.mjs
import { createNet } from '../../game/net.js';
import { spawn } from 'node:child_process';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, [new URL('../../server/server.mjs', import.meta.url).pathname], { env: { ...process.env, PORT: '8797', QUIET: '1' }, stdio: 'inherit' });
await sleep(400);
const A = createNet(), B = createNet();
await A.connect('ws://localhost:8797', { mode: 'tdm', name: 'A' }); await sleep(300);
await B.connect('ws://localhost:8797', { mode: 'tdm', name: 'B', room: A.room }); await sleep(300);
console.log('rooms', A.room, B.room, 'me', A.me, B.me);
for (const N of [A, B]) N.send({ t: 'r', p: [10, 0.2, 10] });
await sleep(300);
const P = { x: 10, y: 0.2, z: 10 }; let bad = 0, n = 0;
const cases = [];
for (let i = 0; i < 40; i++) {
  const face = Math.random() * 6.283 - 3.1416, aimOff = i % 4 === 0 ? (Math.random() - 0.5) * 3 : (Math.random() - 0.5) * 0.3;
  const dir = face + aimOff, pi = (Math.random() - 0.5) * 0.8, R = 5 + Math.random() * 120;
  const b = { x: P.x + Math.sin(dir) * Math.cos(pi) * R, y: P.y + Math.sin(pi) * R, z: P.z + Math.cos(dir) * Math.cos(pi) * R };
  B.sentT = -1; B.sendState(performance.now() / 1000, P, face + Math.PI, 0, 0, 'ar7_lance', true);   // the game sends yaw + pi
  B.shot(B.me, P, b); cases.push([dir, pi, R]);
  await sleep(140);
}
await sleep(300);
const e = A.ents.get(B.me), shots = e.buf.filter(s => s[9]);
for (let i = 0; i < Math.min(shots.length, cases.length); i++) {
  const [dir, pi, R] = cases[cases.length - shots.length + i], s = shots[i];
  const dy = Math.atan2(Math.sin(s[10] - dir), Math.cos(s[10] - dir));
  n++; if (Math.abs(dy) > 0.01 || Math.abs(s[11] - pi) > 0.01 || Math.abs(s[12] - R) > 0.6) { bad++; console.log('bad', dy.toFixed(4), (s[11] - pi).toFixed(4), (s[12] - R).toFixed(2)); }
}
console.log('shots', shots.length, 'checked', n, 'bad', bad);
srv.kill(); process.exit(0);
