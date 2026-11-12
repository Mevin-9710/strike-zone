// Compact procedural sound kit. Audio nodes are created only for scheduled sounds.
let ctx = null, master = null, compressor = null, noiseBuf = null;
let musicBus = null, musicTimer = 0, musicOn = false, musicIntensity = 0, musicStep = 0;
export const audio = { muted: false, volume: 0.5 };

function init() {
  if (ctx) return ctx;
  try {
    if (typeof window === 'undefined') return null;
    ctx = window.__audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = audio.muted ? 0 : audio.volume;
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12; compressor.knee.value = 8; compressor.ratio.value = 8;
    compressor.attack.value = 0.003; compressor.release.value = 0.18;
    master.connect(compressor); compressor.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
  return ctx;
}
function syncVolume() {
  if (master && ctx) master.gain.setTargetAtTime(audio.muted ? 0 : Math.max(0, Math.min(1, audio.volume)), ctx.currentTime, 0.025);
}
export function unlockAudio() {
  init(); if (ctx?.state === 'suspended') ctx.resume();
  syncVolume(); loadSamples();
}

// Recorded samples (sfx/*.mp3, built by tools/import_sfx.sh). Each sound falls back to the
// procedural version until its sample has decoded, or if loading fails (offline, old browser).
const SAMPLE_NAMES = ['shot_pistol', 'shot_pistol_far', 'shot_revolver', 'shot_revolver_far', 'shot_assault', 'shot_assault_far',
  'shot_mg', 'shot_mg_far', 'shot_sniper', 'shot_sniper_far', 'bolt', 'empty', 'boom',
  'step_0', 'step_1', 'step_2', 'step_3', 'step_4',
  'impact_metal_0', 'impact_metal_1', 'impact_metal_2', 'impact_wood_0', 'impact_wood_1', 'impact_wood_2',
  'impact_generic_0', 'impact_generic_1', 'impact_generic_2'];
const samples = Object.create(null);
let samplesRequested = false;
export function loadSamples() {
  if (samplesRequested || !ctx || typeof fetch === 'undefined') return;
  samplesRequested = true;
  const base = new URL('../sfx/', import.meta.url);
  for (const name of SAMPLE_NAMES) {
    fetch(new URL(name + '.mp3', base)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((data) => new Promise((ok, bad) => ctx.decodeAudioData(data, ok, bad)))
      .then((b) => { samples[name] = b; }).catch(() => {});
  }
}
export function samplesLoaded() { return Object.keys(samples).length; }
function play(name, gain = 1, pan = 0, rate = 1) {
  const b = samples[name];
  if (!b || !ctx || audio.muted) return !!b;
  const src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
  const g = ctx.createGain(); g.gain.value = gain;
  const p = pan ? panNode(pan) : null; src.connect(g);
  if (p) { g.connect(p); p.connect(master); } else g.connect(master);
  src.start();
  return true;
}
const SHOT_SAMPLE = { pistol: 'shot_pistol', revolver: 'shot_revolver', assault: 'shot_assault', 'machine gun': 'shot_mg', sniper: 'shot_sniper' };
const SHOT_FAR = { pistol: 'shot_pistol_far', revolver: 'shot_revolver_far', assault: 'shot_assault_far', 'machine gun': 'shot_mg_far', sniper: 'shot_sniper_far' };
const rnd3 = () => (Math.random() * 3) | 0;

function panNode(pan) {
  if (!ctx.createStereoPanner) return null;
  const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); return p;
}
function noise({ dur = 0.15, freq = 1200, q = 0.8, gain = 0.6, type = 'lowpass', attack = 0.002, pan = 0, offset = 0 }) {
  if (!ctx || audio.muted) return;
  const t = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const p = panNode(pan); src.connect(f); f.connect(g);
  if (p) { g.connect(p); p.connect(master); } else g.connect(master);
  src.start(t, offset, Math.min(0.59, dur + 0.02)); src.stop(t + dur + 0.03);
}
function tone({ f0 = 800, f1 = 400, dur = 0.06, gain = 0.25, type = 'square', pan = 0, when = 0 }) {
  if (!ctx || audio.muted) return;
  const t = ctx.currentTime + when, o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(Math.max(20, f0), t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.004, dur * 0.15));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const p = panNode(pan); o.connect(g);
  if (p) { g.connect(p); p.connect(master); } else g.connect(master);
  o.start(t); o.stop(t + dur + 0.025);
}
const SHOT = {
  pistol: { crack: 4400, body: 1450, low: 125, tail: 0.12, level: 0.86 },
  revolver: { crack: 3100, body: 900, low: 88, tail: 0.23, level: 1.0 },
  assault: { crack: 3600, body: 1250, low: 105, tail: 0.14, level: 0.9 },
  'machine gun': { crack: 2900, body: 1050, low: 95, tail: 0.12, level: 0.82 },
  sniper: { crack: 2200, body: 650, low: 64, tail: 0.38, level: 1.0 },
};

export const sfx = {
  shot(cls, { dist = 0, pan = 0 } = {}) {
    if (!init() || audio.muted) return;
    const s = SHOT[cls] || SHOT.assault, k = s.level / (1 + dist * 0.055), far = dist > 15;
    if (play((far ? SHOT_FAR : SHOT_SAMPLE)[cls] || 'shot_assault', 0.8 * k, pan, 0.96 + Math.random() * 0.08)) return;
    // A sharp high click, filtered body, sub thump and short noisy tail give each weapon weight.
    noise({ dur: 0.022, freq: s.crack, type: 'highpass', gain: 0.52 * k, attack: 0.0005, pan, offset: Math.random() * 0.2 });
    noise({ dur: 0.075, freq: far ? s.body * 0.65 : s.body, type: 'bandpass', q: 0.7, gain: 0.48 * k, attack: 0.001, pan, offset: Math.random() * 0.25 });
    tone({ f0: s.low * 2.5, f1: s.low * 0.55, dur: 0.12, gain: 0.48 * k, type: 'sine', pan });
    noise({ dur: s.tail, freq: far ? 700 : 1050, type: 'lowpass', gain: 0.25 * k, attack: 0.008, pan, offset: Math.random() * 0.35 });
  },
  empty() { if (!init() || play('empty', 0.5)) return; tone({ f0: 2400, f1: 1800, dur: 0.03, gain: 0.15 }); },
  magOut() { if (!init()) return; tone({ f0: 900, f1: 500, dur: 0.05, gain: 0.12 }); noise({ dur: 0.05, freq: 3000, gain: 0.15 }); },
  magIn() { if (!init()) return; tone({ f0: 500, f1: 1200, dur: 0.05, gain: 0.15 }); noise({ dur: 0.04, freq: 4000, gain: 0.2 }); },
  bolt() { if (!init() || play('bolt', 0.6)) return; noise({ dur: 0.08, freq: 3500, gain: 0.25, type: 'bandpass', q: 2 }); },
  hit(head) {
    if (!init()) return;
    if (head) { tone({ f0: 2450, f1: 3850, dur: 0.075, gain: 0.32, type: 'sine' }); tone({ f0: 3900, f1: 2600, dur: 0.11, gain: 0.14, type: 'triangle', when: 0.018 }); }
    else { tone({ f0: 1250, f1: 820, dur: 0.055, gain: 0.2, type: 'triangle' }); noise({ dur: 0.035, freq: 1800, gain: 0.08, type: 'bandpass', q: 2 }); }
  },
  kill(streak = 1) {
    if (!init()) return;
    const n = Math.max(0, Math.min(5, (streak | 0) - 1)), f = 820 + n * 115;
    tone({ f0: f, f1: f * 1.65, dur: 0.12, gain: 0.24, type: 'sine' });
    tone({ f0: f * 1.5, f1: f * 2.05, dur: 0.16, gain: 0.16, type: 'triangle', when: 0.065 });
  },
  hurt() { if (!init()) return; noise({ dur: 0.18, freq: 400, gain: 0.5 }); },
  ability() { if (!init()) return; tone({ f0: 300, f1: 900, dur: 0.18, gain: 0.15, type: 'sawtooth' }); },
  flash() { if (!init()) return; noise({ dur: 0.5, freq: 6000, gain: 0.6, type: 'highpass' }); tone({ f0: 3000, f1: 2900, dur: 1.2, gain: 0.05, type: 'sine' }); },
  beep(hi) { if (!init()) return; tone({ f0: hi ? 1400 : 900, f1: hi ? 1400 : 900, dur: 0.07, gain: 0.12, type: 'sine' }); },
  done() { if (!init()) return; tone({ f0: 600, f1: 1200, dur: 0.25, gain: 0.2, type: 'triangle' }); },
  step() { if (!init() || play('step_' + ((Math.random() * 5) | 0), 0.22, 0, 0.95 + Math.random() * 0.1)) return; noise({ dur: 0.06, freq: 500, gain: 0.08 }); },
  boom() { if (!init() || play('boom', 1)) return; noise({ dur: 0.9, freq: 220, gain: 0.8 }); noise({ dur: 0.25, freq: 1400, gain: 0.4 }); tone({ f0: 90, f1: 35, dur: 0.7, gain: 0.4, type: 'sine' }); },
  pickup() { if (!init()) return; tone({ f0: 880, f1: 1760, dur: 0.14, gain: 0.18, type: 'triangle' }); },
  coin() { if (!init()) return; tone({ f0: 1300, f1: 1300, dur: 0.06, gain: 0.15, type: 'square' }); tone({ f0: 1950, f1: 1950, dur: 0.12, gain: 0.15, type: 'square', when: 0.07 }); },
  spray() { if (!init()) return; noise({ dur: 0.35, freq: 5000, gain: 0.18, type: 'highpass' }); },
  impact() {
    if (!init()) return;
    if (play(['impact_metal_', 'impact_wood_', 'impact_generic_'][rnd3()] + rnd3(), 0.35, 0, 0.9 + Math.random() * 0.2)) return;
    const variant = (Math.random() * 3) | 0;
    if (variant === 0) noise({ dur: 0.045, freq: 2800, gain: 0.18, type: 'bandpass', q: 3, offset: Math.random() * 0.4 });
    else if (variant === 1) { tone({ f0: 1850, f1: 720, dur: 0.045, gain: 0.13, type: 'triangle' }); noise({ dur: 0.025, freq: 950, gain: 0.1, type: 'lowpass' }); }
    else { tone({ f0: 520, f1: 180, dur: 0.06, gain: 0.18, type: 'sine' }); noise({ dur: 0.04, freq: 1600, gain: 0.09, type: 'highpass' }); }
  },
};

const musicScale = [0, 3, 5, 7, 10];
function scheduleMusic() {
  if (!ctx || !musicOn || audio.muted) return;
  const now = ctx.currentTime, beat = 0.32, horizon = now + 0.12;
  while (musicNext < horizon) {
    const t = musicNext, step = musicStep++ & 15, intensity = musicIntensity;
    const root = intensity > 0.55 ? 55 : 49;
    if ((step & 3) === 0) tone({ f0: root * 2, f1: root, dur: 0.16, gain: 0.07 + intensity * 0.08, type: 'triangle', when: Math.max(0, t - ctx.currentTime) });
    if ((step & 1) === 0) {
      const note = root * Math.pow(2, musicScale[(step >> 1) % musicScale.length] / 12);
      tone({ f0: note * 4, f1: note * 2, dur: 0.42, gain: 0.018 + intensity * 0.025, type: 'sine', when: Math.max(0, t - ctx.currentTime) });
    }
    if ((step & 1) === 1) noise({ dur: 0.035, freq: 8500, type: 'highpass', gain: 0.025 + intensity * 0.025, attack: 0.001 });
    musicNext += beat;
  }
  musicTimer = setTimeout(scheduleMusic, 65);
}
let musicNext = 0;
export const music = {
  start() {
    if (!init()) return;
    if (!musicBus) { musicBus = ctx.createGain(); musicBus.gain.value = 1; /* music remains under the shared master */ }
    if (musicOn) return;
    musicOn = true; musicNext = ctx.currentTime + 0.03; scheduleMusic();
  },
  stop() { musicOn = false; if (musicTimer) clearTimeout(musicTimer); musicTimer = 0; },
  setIntensity(value) { musicIntensity = Math.max(0, Math.min(1, Number(value) || 0)); },
};
