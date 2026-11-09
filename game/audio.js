// Tiny synthesized sound kit (no audio files to download). Every sound is a short noise or tone burst.
let ctx = null, master = null, noiseBuf = null;
export const audio = { muted: false, volume: 0.5 };

function init() {
  if (ctx) return ctx;
  try {
    ctx = window.__audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = audio.volume; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
  return ctx;
}
export function unlockAudio() { init(); if (ctx?.state === 'suspended') ctx.resume(); }

function noise({ dur = 0.15, freq = 1200, q = 0.8, gain = 0.6, type = 'lowpass', attack = 0.002, pan = 0 }) {
  if (!init() || audio.muted) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  src.connect(f); f.connect(g);
  if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(master); } else g.connect(master);
  src.start(t, Math.random() * 0.3, dur + 0.05);
}
function tone({ f0 = 800, f1 = 400, dur = 0.06, gain = 0.25, type = 'square' }) {
  if (!init() || audio.muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}

const SHOT = {
  pistol: { dur: 0.16, freq: 2600, gain: 0.55 }, revolver: { dur: 0.32, freq: 1500, gain: 0.8 },
  assault: { dur: 0.18, freq: 1900, gain: 0.6 }, 'machine gun': { dur: 0.2, freq: 1300, gain: 0.6 },
  sniper: { dur: 0.55, freq: 900, gain: 0.9 },
};
export const sfx = {
  shot(cls, { dist = 0, pan = 0 } = {}) {
    const s = SHOT[cls] || SHOT.assault, k = 1 / (1 + dist * 0.06);
    noise({ ...s, gain: s.gain * k, freq: s.freq * (dist > 15 ? 0.5 : 1), pan });
    if (dist < 2) tone({ f0: 160, f1: 50, dur: 0.12, gain: 0.35 * k, type: 'sine' });
  },
  empty() { tone({ f0: 2400, f1: 1800, dur: 0.03, gain: 0.15 }); },
  magOut() { tone({ f0: 900, f1: 500, dur: 0.05, gain: 0.12 }); noise({ dur: 0.05, freq: 3000, gain: 0.15 }); },
  magIn() { tone({ f0: 500, f1: 1200, dur: 0.05, gain: 0.15 }); noise({ dur: 0.04, freq: 4000, gain: 0.2 }); },
  bolt() { noise({ dur: 0.08, freq: 3500, gain: 0.25, type: 'bandpass', q: 2 }); },
  hit(head) { tone({ f0: head ? 1800 : 1200, f1: head ? 2400 : 900, dur: 0.05, gain: 0.18, type: 'triangle' }); },
  kill() { tone({ f0: 700, f1: 1400, dur: 0.12, gain: 0.2, type: 'triangle' }); },
  hurt() { noise({ dur: 0.18, freq: 400, gain: 0.5 }); },
  ability() { tone({ f0: 300, f1: 900, dur: 0.18, gain: 0.15, type: 'sawtooth' }); },
  flash() { noise({ dur: 0.5, freq: 6000, gain: 0.6, type: 'highpass' }); tone({ f0: 3000, f1: 2900, dur: 1.2, gain: 0.05, type: 'sine' }); },
  beep(hi) { tone({ f0: hi ? 1400 : 900, f1: hi ? 1400 : 900, dur: 0.07, gain: 0.12, type: 'sine' }); },
  done() { tone({ f0: 600, f1: 1200, dur: 0.25, gain: 0.2, type: 'triangle' }); },
  step() { noise({ dur: 0.06, freq: 500, gain: 0.08 }); },
  boom() { noise({ dur: 0.9, freq: 220, gain: 1.0 }); noise({ dur: 0.25, freq: 1400, gain: 0.5 }); tone({ f0: 90, f1: 40, dur: 0.7, gain: 0.35, type: 'sine' }); },
  pickup() { tone({ f0: 880, f1: 1760, dur: 0.14, gain: 0.18, type: 'triangle' }); },
  coin() { tone({ f0: 1300, f1: 1300, dur: 0.06, gain: 0.15, type: 'square' }); setTimeout(() => tone({ f0: 1950, f1: 1950, dur: 0.12, gain: 0.15, type: 'square' }), 70); },
  spray() { noise({ dur: 0.35, freq: 5000, gain: 0.18, type: 'highpass' }); },
  impact() { noise({ dur: 0.05, freq: 2500, gain: 0.12, type: 'bandpass', q: 3 }); },
};
