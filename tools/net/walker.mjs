import { createNet } from '../../game/net.js';
const N = createNet(); N.handler = () => {};
const m = await N.connect('ws://localhost:8795', { mode: 'tdm', name: 'walker' });
console.log('id', m.you);
N.send({ t: 'r', p: [20, 0.2, 20] });
const t0 = performance.now() / 1000, p = { x: 20, y: 0.2, z: 20 };
setInterval(() => { const t = performance.now() / 1000; p.x = 20 + 2.5 - Math.abs(((t - t0) * 5) % 10 - 5); N.sendState(t, p, 0, 0, 5, 'ar7_lance', true); }, 16);
