// WebSocket proxy that adds latency + jitter (ordered, like TCP): node tools/net/jitter_proxy.mjs <listenPort> <targetUrl> <baseMs> <jitterMs>
import { WebSocketServer, WebSocket } from '../../server/node_modules/ws/wrapper.mjs';
const [port, target, base, jit] = [Number(process.argv[2]), process.argv[3], Number(process.argv[4]), Number(process.argv[5])];
const [stP, stH] = (process.env.STALL || '0,0').split(',').map(Number);   // every stP ms, hold the server->client stream for stH ms (a lost packet on TCP)
const stallUntil = t => { if (!stP) return t; const ph = t % stP; return ph < stH ? t - ph + stH : t; };
const wss = new WebSocketServer({ port });
wss.on('connection', c => {
  const up = new WebSocket(target); const pend = []; let lastA = 0, lastB = 0;
  const later = (to, d, bin, which) => { const now = Date.now(); let at = now + base + Math.random() * jit; if (!which) at = stallUntil(at); if (which) { at = Math.max(at, lastA); lastA = at; } else { at = Math.max(at, lastB); lastB = at; } setTimeout(() => { if (to.readyState === 1) to.send(d, { binary: bin }); }, at - now); };
  up.on('open', () => { for (const [d, b] of pend) up.send(d, { binary: b }); pend.length = 0; });
  c.on('message', (d, b) => { if (up.readyState === 1) later(up, d, b, 1); else pend.push([d, b]); });
  up.on('message', (d, b) => later(c, d, b, 0));
  c.on('close', () => up.close()); up.on('close', () => c.close());
  c.on('error', () => {}); up.on('error', () => {});
});
