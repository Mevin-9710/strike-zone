// Painted, stylized textures drawn on canvas at load time (no image downloads).
// Every texture: flat base colors + soft painted shading + grime, cracks and stains.
import * as THREE from 'three';

const S = 256;
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const r = (a, b) => a + rnd() * (b - a);
const hex = (c, k = 1) => {
  const n = typeof c === 'number' ? c : parseInt(c.slice(1), 16);
  const ch = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

function canvas() { const c = document.createElement('canvas'); c.width = c.height = S; return [c, c.getContext('2d')]; }

function grime(g, amount = 0.25, color = '#1a1410') {
  for (let i = 0; i < 26 * amount * 4; i++) {
    const x = r(0, S), y = r(0, S), rad = r(6, 34);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(26,20,16,${r(0.05, 0.16) * amount * 2})`); gr.addColorStop(1, 'rgba(26,20,16,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  // vertical drips
  g.strokeStyle = `rgba(30,24,18,${0.12 * amount * 2})`;
  for (let i = 0; i < 8 * amount * 2; i++) {
    const x = r(0, S); g.lineWidth = r(1, 3); g.beginPath(); g.moveTo(x, r(0, S * 0.4)); g.lineTo(x + r(-2, 2), r(S * 0.5, S)); g.stroke();
  }
}
function cracks(g, n = 3) {
  g.strokeStyle = 'rgba(20,18,16,0.45)'; g.lineWidth = 1.2;
  for (let i = 0; i < n; i++) {
    let x = r(0, S), y = r(0, S); g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += r(-14, 14); y += r(-14, 14); g.lineTo(x, y); }
    g.stroke();
  }
}
function speckle(g, n, colors, size = [1, 3]) {
  for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; const s = r(size[0], size[1]); g.fillRect(r(0, S), r(0, S), s, s); }
}
function graffiti(g, text, color) {
  g.save(); g.translate(r(40, 120), r(110, 200)); g.rotate(r(-0.2, 0.1));
  g.font = `bold ${Math.round(r(34, 48))}px Impact, Arial Black, sans-serif`;
  g.lineWidth = 6; g.strokeStyle = 'rgba(20,20,20,0.85)'; g.strokeText(text, 0, 0);
  g.fillStyle = color; g.fillText(text, 0, 0);
  g.restore();
}

const DRAW = {
  brick(g, o) {
    const base = o.color ?? 0xb5533c, bw = 64, bh = 24;
    g.fillStyle = hex(o.mortar ?? 0xcfc4b0); g.fillRect(0, 0, S, S);
    for (let row = 0; row * bh < S; row++) {
      for (let col = -1; col * bw < S; col++) {
        const x = col * bw + (row % 2 ? bw / 2 : 0) + 2, y = row * bh + 2;
        const k = r(0.82, 1.08);
        g.fillStyle = hex(base, k); g.fillRect(x, y, bw - 4, bh - 4);
        g.fillStyle = hex(base, k * 1.15); g.fillRect(x, y, bw - 4, 4);          // painted top light
        g.fillStyle = hex(base, k * 0.72); g.fillRect(x, y + bh - 8, bw - 4, 4); // painted bottom shade
      }
    }
    grime(g, 0.35); cracks(g, 2);
  },
  concrete(g, o) {
    const base = o.color ?? 0xb9b4aa;
    g.fillStyle = hex(base); g.fillRect(0, 0, S, S);
    speckle(g, 900, [hex(base, 0.9), hex(base, 1.08), hex(base, 0.8)]);
    g.strokeStyle = hex(base, 0.7); g.lineWidth = 3; g.strokeRect(1.5, 1.5, S - 3, S - 3);       // panel seams
    g.fillStyle = hex(base, 1.12); g.fillRect(3, 3, S - 6, 5);
    for (const [x, y] of [[14, 14], [S - 14, 14], [14, S - 14], [S - 14, S - 14]]) { g.fillStyle = hex(base, 0.6); g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
    grime(g, o.grime ?? 0.4); cracks(g, 3);
  },
  asphalt(g, o) {
    const base = o.color ?? 0x4a4d55;
    g.fillStyle = hex(base); g.fillRect(0, 0, S, S);
    speckle(g, 2200, [hex(base, 0.8), hex(base, 1.2), hex(base, 1.05)], [1, 2]);
    grime(g, 0.3, '#000'); cracks(g, 4);
    if (o.line) { g.fillStyle = 'rgba(240,220,120,0.9)'; g.fillRect(S / 2 - 5, 0, 10, S * 0.55); }
    for (let i = 0; i < 2; i++) { g.fillStyle = 'rgba(30,40,60,0.25)'; g.beginPath(); g.ellipse(r(30, 220), r(30, 220), r(20, 40), r(8, 16), r(0, 3), 0, 7); g.fill(); } // puddles
  },
  tiles(g, o) {
    const base = o.color ?? 0xc9c2b4, t = 64;
    g.fillStyle = hex(base, 0.7); g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += t) for (let x = 0; x < S; x += t) {
      const k = r(0.9, 1.06); g.fillStyle = hex(base, k); g.fillRect(x + 2, y + 2, t - 4, t - 4);
      g.fillStyle = hex(base, k * 1.12); g.fillRect(x + 2, y + 2, t - 4, 3);
    }
    grime(g, 0.3); cracks(g, 2);
  },
  metal(g, o) {
    const base = o.color ?? 0x7b8794;
    g.fillStyle = hex(base); g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 128) { g.fillStyle = hex(base, 0.72); g.fillRect(0, y, S, 3); g.fillStyle = hex(base, 1.15); g.fillRect(0, y + 3, S, 3); }
    for (let x = 12; x < S; x += 40) for (let y = 12; y < S; y += 128) { g.fillStyle = hex(base, 0.55); g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    speckle(g, 300, ['rgba(255,255,255,0.08)', 'rgba(0,0,0,0.1)']);
    grime(g, 0.3); for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(150,80,30,${r(0.1, 0.25)})`; g.beginPath(); g.arc(r(0, S), r(0, S), r(4, 14), 0, 7); g.fill(); } // rust
  },
  corrugated(g, o) {
    const base = o.color ?? 0xc0392b;
    for (let x = 0; x < S; x += 16) {
      g.fillStyle = hex(base, 1.12); g.fillRect(x, 0, 8, S);
      g.fillStyle = hex(base, 0.78); g.fillRect(x + 8, 0, 8, S);
    }
    g.fillStyle = hex(base, 0.6); g.fillRect(0, 0, S, 6); g.fillRect(0, S - 6, S, 6);
    grime(g, 0.45); for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(120,60,20,${r(0.15, 0.3)})`; g.fillRect(r(0, S), r(0, S), r(3, 10), r(10, 40)); }
  },
  wood(g, o) {
    const base = o.color ?? 0xa8763e;
    for (let y = 0; y < S; y += 32) {
      const k = r(0.88, 1.08); g.fillStyle = hex(base, k); g.fillRect(0, y, S, 32);
      g.fillStyle = hex(base, k * 0.7); g.fillRect(0, y + 29, S, 3);
      g.strokeStyle = hex(base, k * 0.85); g.lineWidth = 1;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(0, y + r(6, 26)); g.bezierCurveTo(80, y + r(4, 28), 170, y + r(4, 28), S, y + r(6, 26)); g.stroke(); }
    }
    g.fillStyle = hex(base, 0.62); g.fillRect(0, 0, 12, S); g.fillRect(S - 12, 0, 12, S);       // frame boards
    g.save(); g.translate(S / 2, S / 2); g.rotate(Math.PI / 4); g.fillRect(-S * 0.72, -6, S * 1.44, 12); g.restore();
    grime(g, 0.25);
  },
  window(g, o) {
    const frame = o.frame ?? 0x3a3f4b, glass = o.glass ?? 0x6fa8d6;
    g.fillStyle = hex(frame); g.fillRect(0, 0, S, S);
    const lit = o.lit;
    for (const [x, y] of [[20, 20], [136, 20], [20, 136], [136, 136]]) {
      g.fillStyle = lit ? `rgba(255,${200 + r(0, 40)},${120 + r(0, 60)},1)` : hex(glass, r(0.85, 1.05)); g.fillRect(x, y, 100, 100);
      if (!lit) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(x + 10, y + 90); g.lineTo(x + 40, y + 10); g.lineTo(x + 55, y + 10); g.lineTo(x + 25, y + 90); g.fill(); }
    }
    g.fillStyle = hex(frame, 1.3); g.fillRect(0, 0, S, 6);
  },
  roof(g, o) {
    const base = o.color ?? 0x8a8a86;
    g.fillStyle = hex(base); g.fillRect(0, 0, S, S);
    speckle(g, 1600, [hex(base, 0.75), hex(base, 1.15), hex(base, 0.9)], [1, 3]);
    grime(g, 0.4);
  },
  water(g, o) {
    g.fillStyle = hex(o.color ?? 0x2f6f8f); g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2;
    for (let i = 0; i < 18; i++) { const x = r(0, S), y = r(0, S); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 12, y - 5, x + 26, y); g.stroke(); }
  },
  hazard(g) {
    for (let i = -S; i < S * 2; i += 40) { g.fillStyle = '#ffd23b'; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 20, 0); g.lineTo(i - S + 20, S); g.lineTo(i - S, S); g.fill(); }
    g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'source-over';
    grime(g, 0.3);
  },
  graffiti(g, o) {          // transparent decal: one tag, painted with outline and drips
    g.clearRect(0, 0, S, S);
    g.save(); g.translate(S / 2, S / 2); g.rotate(-0.12);
    g.font = `bold ${o.size ?? 64}px Impact, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = 'rgba(15,15,15,0.9)'; g.strokeText(o.text, 0, 0);
    g.fillStyle = o.color ?? '#ffd23b'; g.fillText(o.text, 0, 0);
    g.fillStyle = o.color ?? '#ffd23b';
    for (let i = 0; i < 6; i++) { const x = r(-90, 90); g.fillRect(x, 16, 4, r(10, 40)); }
    g.restore();
  },
  sign(g, o) {
    g.fillStyle = hex(o.bg ?? 0x1d9bf0); g.fillRect(0, 0, S, S);
    g.fillStyle = hex(o.bg ?? 0x1d9bf0, 1.2); g.fillRect(0, 0, S, 20);
    g.font = `bold ${o.size ?? 56}px Impact, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = '#111'; g.strokeText(o.text, S / 2, S / 2); g.fillStyle = o.fg ?? '#ffd23b'; g.fillText(o.text, S / 2, S / 2);
    grime(g, 0.2);
  },
};

const cache = new Map();
// Returns a repeating painted texture. `tile` = world meters per texture repeat (used by kit UVs).
export function paintedTexture(kind, opts = {}) {
  const key = kind + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  seed = 1 + [...key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 100000, 7);
  const [c, g] = canvas();
  DRAW[kind](g, opts);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}
