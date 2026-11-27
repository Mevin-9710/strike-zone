// Strike Zone audio engine (v31 sound pass).
// Mixer:  voices -> [world lowpass] -> sfx volume -> master -> limiter -> speakers
//         voices -> reverb send -> convolver (per-arena room) -> world lowpass
//         ambience -> amb duck -> sfx volume;  music <audio> streams -> music lowpass -> music duck -> music volume -> master
//         UI clicks -> ui bus -> master (never muffled or ducked)
// Everything starts only after the first user gesture (unlockAudio). Samples are small mp3s in sfx/ (CC0, see sfx/CREDITS.md);
// every sound has a procedural fallback until its sample has decoded. Music streams through <audio> elements (no big decode).
// Per-frame cost: none. Sounds are scheduled on events; the game loop only calls cheap setters that early-out when unchanged.

let ctx = null, master = null, limiter = null, sfxVol = null, uiBus = null, world = null, worldLP = null;
let reverbIn = null, convolver = null, ambDuck = null, ambBus = null, musicVol = null, musicInt = null, musicDuck = null, musicLP = null, noiseBuf = null;
let canPan = false, voices = 0, lite = false;
const MAX_VOICES = 40;
const STORE = 'sz_audio';

// ---------------------------------------------------------------- settings (persisted, shown in SETTINGS)
const saved = (() => { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; } })();
const num = (v, d) => (Number.isFinite(+v) ? Math.max(0, Math.min(1, +v)) : d);
export const audio = {
  master: num(saved.master, 0.8), music: num(saved.music, 0.6), sfx: num(saved.sfx, 0.9), muted: !!saved.muted,
  sdkMuted: false, adMuted: false, hidden: false,
  get volume() { return this.master; }, set volume(v) { this.master = num(v, this.master); syncVolume(); },
};
function persist() { try { localStorage.setItem(STORE, JSON.stringify({ master: audio.master, music: audio.music, sfx: audio.sfx, muted: audio.muted })); } catch (e) { /* storage blocked */ } }
const silent = () => audio.muted || audio.sdkMuted || audio.adMuted || audio.hidden;
function syncVolume() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(silent() ? 0 : audio.master, t, 0.03);
  sfxVol.gain.setTargetAtTime(audio.sfx, t, 0.03);
  musicVol.gain.setTargetAtTime(audio.music, t, 0.05);
  uiBus.gain.setTargetAtTime(audio.sfx * 0.9, t, 0.03);
}
export function setAudio(k, v) {
  if (k === 'muted') audio.muted = !!v; else if (k === 'master' || k === 'music' || k === 'sfx') audio[k] = num(v, audio[k]);
  persist(); syncVolume(); musicKick();
}
export function toggleMute() { setAudio('muted', !audio.muted); return audio.muted; }
// CrazyGames "mute audio" setting, ads and hidden tabs all force silence without touching the player's own choice.
export function forceMute(reason, on) {
  const k = reason === 'sdk' ? 'sdkMuted' : reason === 'ad' ? 'adMuted' : 'hidden';
  if (audio[k] === !!on) return; audio[k] = !!on;
  if (ctx) { syncVolume(); if (on && reason !== 'sdk') { try { ctx.suspend(); } catch (e) { /* ignore */ } } else if (!silent()) { try { ctx.resume(); } catch (e) { /* ignore */ } } }
  musicKick();
}
export function setLite(on) { lite = !!on; }   // low quality: no convolution reverb

// ---------------------------------------------------------------- graph
function init() {
  if (ctx) return ctx;
  if (!unlocked) return null;                                                     // browsers only allow audio after a gesture
  try {
    if (typeof window === 'undefined') return null;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = window.__audioCtx = new AC({ latencyHint: 'interactive' });
    canPan = !!ctx.createStereoPanner;
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -9; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = 0.002; limiter.release.value = 0.16;
    master = gain(0, limiter); limiter.connect(ctx.destination);
    sfxVol = gain(audio.sfx, master);
    worldLP = ctx.createBiquadFilter(); worldLP.type = 'lowpass'; worldLP.frequency.value = 20000; worldLP.Q.value = 0.5; worldLP.connect(sfxVol);
    world = gain(1, worldLP);
    uiBus = gain(audio.sfx * 0.9, master);
    ambDuck = gain(1, worldLP); ambBus = gain(0, ambDuck);
    musicVol = gain(audio.music, master); musicInt = gain(0.8, musicVol); musicDuck = gain(1, musicInt);
    musicLP = ctx.createBiquadFilter(); musicLP.type = 'lowpass'; musicLP.frequency.value = 20000; musicLP.connect(musicDuck);
    reverbIn = gain(1, null);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    setRoom('street');
    syncVolume();
  } catch (e) { ctx = null; }
  return ctx;
}
function gain(v, dest) { const g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }

// Rooms: synthetic stereo impulse responses (decaying filtered noise + early reflections). Zero download, one per arena.
const ROOMS = {
  street: { len: 1.4, decay: 2.6, damp: 0.55, early: 0.018, wet: 0.32 },     // open city square: long slap + tail
  canal: { len: 1.8, decay: 2.2, damp: 0.45, early: 0.026, wet: 0.36 },      // water + stone walls: bright, long
  alley: { len: 1.0, decay: 3.4, damp: 0.6, early: 0.008, wet: 0.4 },        // tight walls: dense, short
  desert: { len: 1.1, decay: 3.8, damp: 0.75, early: 0.03, wet: 0.22 },      // open sand: dry, soft
  indoor: { len: 0.9, decay: 3.2, damp: 0.5, early: 0.006, wet: 0.42 },      // story interiors
};
let roomKey = '', roomWet = 0.3;
const irCache = Object.create(null);
function setRoom(key) {
  if (!ctx || key === roomKey) return; roomKey = key;
  const R = ROOMS[key] || ROOMS.street; roomWet = R.wet;
  let ir = irCache[key];
  if (!ir) {
    const n = Math.floor(ctx.sampleRate * R.len); ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c); let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / ctx.sampleRate, env = Math.pow(1 - i / n, R.decay);
        lp += (Math.random() * 2 - 1 - lp) * (1 - R.damp * Math.min(1, t * 2.2));   // gets darker as it decays
        ch[i] = lp * env * 0.6;
      }
      for (let k = 1; k <= 5; k++) { const at = Math.floor(ctx.sampleRate * R.early * k * (c ? 1.13 : 0.91)); if (at < n) ch[at] += (c ? -1 : 1) * 0.5 / k; }
    }
    irCache[key] = ir;
  }
  if (convolver) { try { reverbIn.disconnect(); convolver.disconnect(); } catch (e) { /* ignore */ } }
  convolver = ctx.createConvolver(); convolver.normalize = true; convolver.buffer = ir;
  reverbIn.connect(convolver); const ret = gain(0.55, world); convolver.connect(ret);
}

// ---------------------------------------------------------------- samples
const SAMPLE_NAMES = [
  'w_vex_p9', 'w_harrow_45', 'w_bulldog_r6', 'w_ar7_lance', 'w_kestrel_bp', 'w_warden_br', 'w_grinder_lmg', 'w_hailstorm_mg', 'w_longshot_bolt', 'w_javelin_amr',
  'rl_rifle_out', 'rl_rifle_in', 'rl_pistol_out', 'rl_pistol_in', 'rl_pistol_slide', 'rl_heavy_out', 'rl_heavy_in', 'rl_heavy_charge', 'bolt', 'empty',
  'hit_body', 'hit_head', 'kill_ding', 'flesh_0', 'flesh_1', 'flesh_2', 'ui_click',
  'step_c0', 'step_c1', 'step_c2', 'step_c3', 'step_c4', 'land',
  'impact_metal_0', 'impact_metal_1', 'impact_metal_2', 'impact_wood_0', 'impact_wood_1', 'impact_wood_2', 'impact_generic_0', 'impact_generic_1', 'impact_generic_2',
  'casing_0', 'casing_1', 'casing_2', 'boom', 'boom2',
];
// loaded second (enemy far shots, other surfaces, ambience), so the first second of play gets the important ones first
const LATE_NAMES = [
  'w_vex_p9_far', 'w_harrow_45_far', 'w_bulldog_r6_far', 'w_ar7_lance_far', 'w_kestrel_bp_far', 'w_warden_br_far', 'w_grinder_lmg_far', 'w_hailstorm_mg_far', 'w_longshot_bolt_far', 'w_javelin_amr_far',
  'step_s0', 'step_s1', 'step_s2', 'step_s3', 'step_s4', 'step_s5', 'step_t0', 'step_t1', 'step_t2', 'step_t3', 'step_t4', 'step_t5',
  'amb_bell', 'amb_bell2', 'amb_water0', 'amb_water1', 'amb_machine', 'amb_door',
];
const samples = Object.create(null);
let samplesRequested = false;
const base = () => new URL('../sfx/', import.meta.url);
function fetchList(list, then) {
  let left = list.length; const b = base();
  const done = () => { if (--left === 0 && then) then(); };
  for (const name of list) {
    fetch(new URL(name + '.mp3', b)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((data) => new Promise((ok, bad) => ctx.decodeAudioData(data, ok, bad)))
      .then((buf) => { samples[name] = buf; }).catch(() => {}).finally(done);
  }
}
export function loadSamples() {
  if (samplesRequested || !ctx || typeof fetch === 'undefined') return;
  samplesRequested = true;
  fetchList(SAMPLE_NAMES, () => fetchList(LATE_NAMES));
}
export function samplesLoaded() { return Object.keys(samples).length; }

function vEnd() { voices--; }
// One voice: buffer -> [lowpass] -> gain -> [pan] -> dest (+ reverb send). Returns false when the sample is missing.
function voice(name, g, pan = 0, rate = 1, dest = world, send = 0, cutoff = 0, when = 0) {
  const b = samples[name];
  if (!b) return false;
  if (!ctx || silent() || voices >= MAX_VOICES) return true;
  const src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = rate; src.onended = vEnd;
  let node = src;
  if (cutoff > 0 && cutoff < 16000) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; node.connect(f); node = f; }
  const gn = ctx.createGain(); gn.gain.value = g; node.connect(gn); node = gn;
  if (pan && canPan) { const p = ctx.createStereoPanner(); p.pan.value = pan > 1 ? 1 : pan < -1 ? -1 : pan; node.connect(p); node = p; }
  node.connect(dest);
  if (send > 0 && !lite && convolver) { const s = ctx.createGain(); s.gain.value = send * roomWet; node.connect(s); s.connect(reverbIn); }
  voices++; src.start(ctx.currentTime + when);
  return true;
}
// procedural building blocks (also the fallbacks)
function noise(dur = 0.15, freq = 1200, q = 0.8, g = 0.6, type = 'lowpass', attack = 0.002, pan = 0, when = 0, f1 = 0, dest = world, send = 0) {
  if (!ctx || silent() || voices >= MAX_VOICES) return;
  const t = ctx.currentTime + when, src = ctx.createBufferSource(); src.buffer = noiseBuf; src.onended = vEnd;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(g, t + attack);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(gn); let node = gn;
  if (pan && canPan) { const p = ctx.createStereoPanner(); p.pan.value = pan; gn.connect(p); node = p; }
  node.connect(dest);
  if (send > 0 && !lite && convolver) { const s = ctx.createGain(); s.gain.value = send * roomWet; node.connect(s); s.connect(reverbIn); }
  voices++; src.start(t, Math.random() * Math.max(0, 1.9 - dur), dur + 0.05); src.stop(t + dur + 0.06);
}
function tone(f0 = 800, f1 = 400, dur = 0.06, g = 0.25, type = 'square', pan = 0, when = 0, dest = world, send = 0) {
  if (!ctx || silent() || voices >= MAX_VOICES) return;
  const t = ctx.currentTime + when, o = ctx.createOscillator(); o.type = type; o.onended = vEnd;
  o.frequency.setValueAtTime(Math.max(20, f0), t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(g, t + Math.min(0.006, dur * 0.15));
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn); let node = gn;
  if (pan && canPan) { const p = ctx.createStereoPanner(); p.pan.value = pan; gn.connect(p); node = p; }
  node.connect(dest);
  if (send > 0 && !lite && convolver) { const s = ctx.createGain(); s.gain.value = send * roomWet; node.connect(s); s.connect(reverbIn); }
  voices++; o.start(t); o.stop(t + dur + 0.03);
}
// Duck music + ambience under big moments (explosions, your shots, getting hit, kill stingers).
let duckUntil = 0;
function duck(depth, hold = 0.12, release = 0.45) {
  if (!ctx) return;
  const t = ctx.currentTime, lvl = Math.max(0.05, 1 - depth);
  if (t < duckUntil && musicDuck.gain.value <= lvl) return;
  for (const g of [musicDuck.gain, ambDuck.gain]) { g.cancelScheduledValues(t); g.setTargetAtTime(lvl, t, 0.015); g.setTargetAtTime(1, t + hold, release); }
  duckUntil = t + hold;
}

// ---------------------------------------------------------------- weapons
// Per gun: level, sub-punch frequency + amount, mechanical click brightness, casing chance, reload family.
const GUN = {
  vex_p9: { lv: 0.9, sub: 120, sk: 0.35, mech: 5200, cas: 1, rl: 'pistol' },
  harrow_45: { lv: 1.0, sub: 95, sk: 0.5, mech: 4200, cas: 1, rl: 'pistol' },
  bulldog_r6: { lv: 1.15, sub: 75, sk: 0.75, mech: 3300, cas: 0, rl: 'pistol' },
  ar7_lance: { lv: 0.85, sub: 100, sk: 0.45, mech: 4800, cas: 0.5, rl: 'rifle' },
  kestrel_bp: { lv: 0.8, sub: 115, sk: 0.35, mech: 5600, cas: 0.4, rl: 'rifle' },
  warden_br: { lv: 1.0, sub: 80, sk: 0.6, mech: 3900, cas: 1, rl: 'rifle' },
  grinder_lmg: { lv: 0.9, sub: 85, sk: 0.55, mech: 3600, cas: 0.35, rl: 'heavy' },
  hailstorm_mg: { lv: 0.8, sub: 105, sk: 0.4, mech: 5000, cas: 0.3, rl: 'heavy' },
  longshot_bolt: { lv: 1.15, sub: 60, sk: 0.9, mech: 3000, cas: 0, rl: 'rifle' },
  javelin_amr: { lv: 1.3, sub: 48, sk: 1.0, mech: 2600, cas: 0, rl: 'rifle' },
};
const CLASS_GUN = { pistol: 'vex_p9', revolver: 'bulldog_r6', assault: 'ar7_lance', rifle: 'ar7_lance', 'machine gun': 'grinder_lmg', sniper: 'longshot_bolt' };
const gunOf = (id) => (GUN[id] ? id : CLASS_GUN[id] || 'ar7_lance');
const rnd = (a, b) => a + Math.random() * (b - a);
let lastEnemyShot = 0, casT = 0;

function procShot(G, k, pan, far, cutoff) {        // fallback until samples decode
  noise(0.022, G.mech, 0.8, 0.5 * k, 'highpass', 0.0005, pan);
  noise(0.08, far ? 700 : 1300, 0.7, 0.5 * k, 'bandpass', 0.001, pan);
  tone(G.sub * 2.5, G.sub * 0.55, 0.12, 0.45 * k, 'sine', pan);
  noise(0.18, Math.min(cutoff || 1100, 1100), 0.8, 0.22 * k, 'lowpass', 0.008, pan);
}

export const sfx = {
  // Your shot (dist 0) or anyone else's. id = weapon id or weapon class. front: 1 ahead .. -1 behind. low: 0..1 mag emptiness.
  shot(id, dist = 0, pan = 0, front = 1, low = 0) {
    if (!init() || silent()) return;
    if (typeof dist === 'object' && dist) { pan = dist.pan || 0; dist = dist.dist || 0; }   // old call style
    const gid = gunOf(id), G = GUN[gid];
    if (dist <= 0.5) {
      // you: close recording + sub punch + mechanical click + room tail + brass. Music dips a touch so shots cut through.
      if (!voice('w_' + gid, 0.78 * G.lv, 0, rnd(0.97, 1.03), world, 0.55)) procShot(G, G.lv, 0, false, 0);
      tone(G.sub * 2.2, G.sub * 0.5, 0.09 + G.sk * 0.06, 0.32 * G.sk, 'sine');
      noise(0.018, G.mech, 1.2, 0.12, 'highpass', 0.0005);
      if (low > 0.7) tone(2600 + low * 900, 2200 + low * 900, 0.03, 0.05 * low, 'triangle', 0, 0.04);   // low-ammo tick: rises as the mag empties
      if (G.cas && Math.random() < G.cas && ctx.currentTime > casT) { casT = ctx.currentTime + 0.12; voice('casing_' + ((Math.random() * 3) | 0), 0.1, rnd(0.15, 0.45), rnd(0.9, 1.15), world, 0.1, 0, rnd(0.32, 0.55)); }
      duck(0.22, 0.06, 0.35);
      return;
    }
    // others: inverse-distance falloff, air absorption, darker from behind, wetter far away, far recording past 18 m.
    const now = ctx.currentTime; if (now - lastEnemyShot < 0.018 && dist > 25) return;   // thin out distant crossfire
    lastEnemyShot = now;
    const k = G.lv / (1 + Math.pow(dist / 11, 1.5));
    let cutoff = 16000 * Math.exp(-dist / 38); if (front < 0) cutoff *= 0.55 + 0.45 * (1 + front); if (cutoff < 900) cutoff = 900;
    const far = dist > 18, wet = Math.min(1, 0.45 + dist / 60);
    if (!voice('w_' + gid + (far ? '_far' : ''), 0.85 * k, pan * 0.85, rnd(0.95, 1.05), world, wet, cutoff) && !voice('w_' + gid, 0.75 * k, pan * 0.85, rnd(0.95, 1.05), world, wet, cutoff)) procShot(G, k, pan, far, cutoff);
    if (dist < 12) tone(G.sub * 2, G.sub * 0.5, 0.1, 0.22 * k * G.sk, 'sine', pan * 0.5);
  },
  // supersonic crack + whoosh when an enemy round passes close by
  whiz(pan = 0) {
    if (!init()) return;
    noise(0.16, 3800, 2.2, 0.16, 'bandpass', 0.004, pan, 0, 900);
    noise(0.02, 6000, 1, 0.08, 'highpass', 0.001, pan);
  },
  empty() { if (!init() || voice('empty', 0.45)) return; tone(2400, 1800, 0.03, 0.15); },
  reload(part, id) {
    if (!init()) return;
    const fam = GUN[gunOf(id)].rl;
    if (part === 'out') { if (!voice('rl_' + fam + '_out', 0.55, 0.12)) { tone(900, 500, 0.05, 0.12); noise(0.05, 3000, 0.8, 0.15); } return; }
    if (!voice('rl_' + fam + '_in', 0.6, 0.12)) { tone(500, 1200, 0.05, 0.15); noise(0.04, 4000, 0.8, 0.2); }
    if (fam === 'pistol') voice('rl_pistol_slide', 0.45, 0.08, 1, world, 0.1, 0, 0.22);
    else if (fam === 'heavy') voice('rl_heavy_charge', 0.55, 0.1, 1, world, 0.1, 0, 0.3);
  },
  magOut(id) { sfx.reload('out', id); },
  magIn(id) { sfx.reload('in', id); },
  bolt() { if (!init() || voice('bolt', 0.5, 0.1, rnd(0.97, 1.05), world, 0.12)) return; noise(0.08, 3500, 2, 0.25, 'bandpass'); },
  draw(id) {                                                                   // weapon swap: cloth + metal
    if (!init()) return;
    noise(0.12, 1800, 0.7, 0.08, 'bandpass', 0.01, 0.1, 0, 3500);
    if (!voice(GUN[gunOf(id)].rl === 'heavy' ? 'rl_heavy_charge' : 'rl_pistol_slide', 0.28, 0.1, rnd(1.05, 1.15), world, 0, 0, 0.12)) tone(700, 1100, 0.04, 0.08, 'triangle', 0, 0.12);
  },
  // hit marker: crisp tick on the UI bus (always clear) + body/head thud in the world
  hit(head) {
    if (!init()) return;
    if (head) {
      tone(2450, 3850, 0.07, 0.24, 'sine', 0, 0, uiBus); tone(3900, 2600, 0.1, 0.1, 'triangle', 0, 0.018, uiBus);
      voice('hit_head', 0.4, 0, rnd(1.05, 1.15), uiBus);
    } else {
      tone(1350, 900, 0.045, 0.16, 'triangle', 0, 0, uiBus);
      voice('hit_body', 0.3, 0, rnd(0.95, 1.08), uiBus) || noise(0.035, 1800, 2, 0.08, 'bandpass', 0.001, 0, 0, 0, uiBus);
    }
  },
  // kill confirm: punchy thud + bell that climbs with the streak; headshot kills add a bright crack
  kill(streak = 1, head = false) {
    if (!init()) return;
    const now = ctx.currentTime; chain = now - chainT < 4 ? chain + 1 : 0; chainT = now;   // quick kills climb the scale
    const n = Math.min(6, chain);
    voice('flesh_' + ((Math.random() * 3) | 0), 0.5, 0, 0.8, uiBus);
    if (!voice('kill_ding', 0.32, 0, 1 + n * 0.0595, uiBus, 0.3)) { const f = 820 + n * 115; tone(f, f * 1.65, 0.12, 0.22, 'sine', 0, 0, uiBus); }
    tone(160, 55, 0.18, 0.35, 'sine', 0, 0, uiBus);
    if (head) { tone(5200, 3800, 0.05, 0.12, 'square', 0, 0, uiBus); voice('impact_generic_' + ((Math.random() * 3) | 0), 0.4, 0, 0.7, uiBus); }
    duck(0.35, 0.1, 0.5);
  },
  hurt(dmg = 10, pan = 0) {
    if (!init()) return;
    const k = Math.min(1, 0.4 + dmg / 30);
    voice('flesh_' + ((Math.random() * 3) | 0), 0.45 * k, pan * 0.6, rnd(0.85, 0.95), world) || noise(0.18, 400, 0.8, 0.5 * k, 'lowpass', 0.002, pan);
    noise(0.12, 260, 0.8, 0.35 * k, 'lowpass', 0.003, pan * 0.6);
    duck(0.3 * k, 0.08, 0.4);
  },
  death() {                                                                    // world falls away: muffle + low hit + music drop
    if (!init()) return;
    tone(110, 32, 0.9, 0.55, 'sine'); noise(1.2, 300, 0.7, 0.35, 'lowpass', 0.01, 0, 0, 80);
    tone(392, 370, 1.4, 0.06, 'sawtooth', -0.3, 0.05); tone(415, 392, 1.4, 0.05, 'sawtooth', 0.3, 0.05);
    filterTo(worldLP, 380, 0.25); filterTo(musicLP, 600, 0.4); musicDuck.gain.setTargetAtTime(0.5, ctx.currentTime, 0.2);
    dead = true;
  },
  reset() {                                                                    // new match: clear death/low-HP filters silently
    if (!init()) return;
    dead = false; healthState = -1; chain = 0; sfx.health(1); musicDuck.gain.setTargetAtTime(1, ctx.currentTime, 0.1);
  },
  respawn() {                                                                  // whoosh in, world snaps back
    if (!init()) return;
    dead = false; healthState = -1; sfx.health(1);
    musicDuck.gain.setTargetAtTime(1, ctx.currentTime, 0.3);
    noise(0.45, 300, 1.2, 0.18, 'bandpass', 0.2, 0, 0, 4200, uiBus);
    tone(523, 523, 0.5, 0.06, 'triangle', 0, 0.38, uiBus, 0); tone(784, 784, 0.6, 0.05, 'triangle', 0, 0.42, uiBus, 0);
  },
  // match start: rising sweep into a bright hit
  spawn() {
    if (!init()) return;
    noise(0.9, 200, 1.5, 0.16, 'bandpass', 0.7, 0, 0, 5000, uiBus);
    tone(98, 40, 0.8, 0.5, 'sine', 0, 0.85, uiBus);
    chord([196, 293.7, 392, 587.3], 1.6, 0.05, 0.85, 'sawtooth', 2400);
    voice('impact_metal_' + ((Math.random() * 3) | 0), 0.35, 0, 0.6, uiBus, 0, 0, 0.85);
  },
  victory() { if (!init()) return; duck(0.8, 2.4, 0.8); chord([261.6, 329.6, 392, 523.3], 0.5, 0.05, 0, 'sawtooth', 3000); chord([349.2, 440, 523.3, 698.5], 0.5, 0.05, 0.28, 'sawtooth', 3200); chord([392, 493.9, 587.3, 784], 2.2, 0.06, 0.56, 'sawtooth', 3600); tone(98, 45, 1.2, 0.4, 'sine', 0, 0.56, uiBus); },
  defeat() { if (!init()) return; duck(0.8, 2.4, 0.8); chord([220, 261.6, 329.6], 0.7, 0.05, 0, 'sawtooth', 1600); chord([207.7, 246.9, 311.1], 0.7, 0.05, 0.5, 'sawtooth', 1300); chord([196, 233.1, 293.7], 2.4, 0.05, 1.0, 'sawtooth', 1000); tone(82, 35, 1.8, 0.45, 'sine', 0, 1.0, uiBus); },
  alarm() { if (!init()) return; for (let i = 0; i < 3; i++) { tone(660, 660, 0.18, 0.09, 'square', 0, i * 0.42, uiBus); tone(880, 880, 0.18, 0.09, 'square', 0, i * 0.42 + 0.2, uiBus); } },
  finalCountdown() { if (!init()) return; noise(1.2, 150, 2, 0.14, 'bandpass', 0.9, 0, 0, 3000, uiBus); tone(55, 55, 1.4, 0.35, 'sine', 0, 1.0, uiBus); chord([110, 164.8, 220], 1.4, 0.05, 1.0, 'sawtooth', 900); },
  tick(hi) { if (!init()) return; tone(hi ? 1400 : 1000, hi ? 1400 : 1000, 0.05, 0.1, 'sine', 0, 0, uiBus); },
  ability(kind) {
    if (!init()) return;
    switch (kind) {
      case 'dash': noise(0.28, 500, 1.4, 0.3, 'bandpass', 0.02, 0, 0, 3200); noise(0.2, 2400, 1, 0.12, 'bandpass', 0.06, 0, 0.08, 700); break;
      case 'smoke': voice('impact_generic_0', 0.35, 0.2, 0.6); noise(1.4, 5000, 0.6, 0.18, 'highpass', 0.05, 0.2, 0.08); noise(1.1, 900, 0.7, 0.12, 'lowpass', 0.2, 0, 0.1); break;
      case 'shield': chord([220, 277.2, 329.6], 0.7, 0.05, 0, 'triangle', 2200); tone(220, 880, 0.5, 0.12, 'sine'); noise(0.5, 1800, 4, 0.06, 'bandpass', 0.2, 0, 0, 4200); break;
      case 'sensor': tone(1250, 1180, 0.9, 0.16, 'sine', 0, 0, world, 1); tone(1250, 1180, 0.6, 0.06, 'sine', 0, 0.35, world, 1); break;
      case 'drone': tone(140, 180, 0.6, 0.08, 'sawtooth', 0, 0, world, 0.2); tone(147, 190, 0.6, 0.06, 'sawtooth', 0, 0.02, world, 0.2); noise(0.6, 2200, 3, 0.05, 'bandpass', 0.2); break;
      case 'decoy': sfx.step(); sfx.step(0.18); tone(900, 900, 0.05, 0.08, 'sine', 0, 0.3); break;
      case 'lockdown': tone(80, 60, 0.7, 0.4, 'sine'); voice('impact_metal_1', 0.5, 0, 0.55, world, 0.6); noise(0.4, 600, 2, 0.15, 'bandpass', 0.05, 0, 0.1, 150); break;
      case 'flash': break;   // flash() plays when it pops
      default: tone(300, 900, 0.18, 0.15, 'sawtooth');
    }
  },
  flash(dist = 0) {
    if (!init()) return;
    const k = 1 / (1 + dist / 10);
    voice('boom2', 0.5 * k, 0, 1.6, world, 0.6) || noise(0.5, 6000, 0.8, 0.6 * k, 'highpass');
    if (dist < 12) { tone(3000, 2900, 1.6, 0.05, 'sine'); filterTo(worldLP, 1200, 0.02); filterBack(worldLP, 1.6); duck(0.7, 0.6, 1.2); }
  },
  beep(hi) { if (!init()) return; tone(hi ? 1400 : 900, hi ? 1400 : 900, 0.07, 0.12, 'sine', 0, 0, uiBus); },
  done() { if (!init()) return; chord([523.3, 659.3, 784], 0.45, 0.05, 0, 'triangle', 5000); },
  // footsteps: surface set per arena; others' steps are quieter, panned and fall off fast
  step(when = 0) {
    if (!init()) return;
    const n = surface === 'c' ? 5 : 6, nm = 'step_' + surface + ((Math.random() * n) | 0);
    stepSide = -stepSide;
    if (!voice(nm, 0.24, stepSide * 0.08, rnd(0.93, 1.07), world, 0.06, 0, when) && !voice('step_c' + ((Math.random() * 5) | 0), 0.24, 0, rnd(0.93, 1.07), world, 0, 0, when)) noise(0.06, 500, 0.8, 0.08);
  },
  footstep(dist, pan) {
    if (!init() || dist > 16) return;
    const n = surface === 'c' ? 5 : 6, k = 0.32 / (1 + dist * dist * 0.03);
    voice('step_' + surface + ((Math.random() * n) | 0), k, pan * 0.9, rnd(0.85, 1.0), world, 0.15, 5000) || voice('step_c' + ((Math.random() * 5) | 0), k, pan * 0.9, 0.9, world, 0.15, 5000);
  },
  land(v = 6) { if (!init()) return; const k = Math.min(1, v / 12); voice('land', 0.3 * k, 0, rnd(0.9, 1.0)) || noise(0.08, 300, 0.8, 0.2 * k); sfx.step(); },
  boom(dist = 8, pan = 0) {
    if (!init()) return;
    const k = 1.2 / (1 + dist / 9), cutoff = Math.max(700, 14000 * Math.exp(-dist / 30));
    if (!voice('boom', 0.9 * k, pan, rnd(0.9, 1.0), world, 0.9, cutoff)) { noise(0.9, 220, 0.8, 0.8 * k, 'lowpass', 0.002, pan); noise(0.25, 1400, 0.8, 0.4 * k, 'lowpass', 0.002, pan); }
    voice('boom2', 0.55 * k, pan * 0.5, rnd(0.7, 0.8), world, 0.5, cutoff);
    tone(70, 28, 0.9, 0.55 * k, 'sine'); noise(1.6, 180, 0.7, 0.25 * k, 'lowpass', 0.05, pan, 0.08, 60, world, 0.6);
    voice('impact_metal_' + ((Math.random() * 3) | 0), 0.12 * k, -pan, 0.8, world, 0.4, 3000, rnd(0.35, 0.6));   // debris
    duck(0.75 * Math.min(1, k * 1.5), 0.25, 0.9);
    if (dist < 7) { tone(3500, 3450, 1.8, 0.045, 'sine'); filterTo(worldLP, 900, 0.01); filterBack(worldLP, 1.8); }    // ears ring
  },
  pickup() { if (!init()) return; tone(880, 1760, 0.12, 0.16, 'triangle', 0, 0, uiBus); tone(1320, 2640, 0.14, 0.08, 'sine', 0, 0.06, uiBus); },
  coin() { if (!init()) return; tone(1318, 1318, 0.06, 0.12, 'square', 0, 0, uiBus); tone(1975, 1975, 0.14, 0.12, 'square', 0, 0.07, uiBus); voice('kill_ding', 0.12, 0, 2, uiBus, 0, 0, 0.07); },
  spray() { if (!init()) return; noise(0.35, 5000, 0.8, 0.18, 'highpass'); },
  ui(kind = 'click') {
    if (!init() || silent()) return;
    if (kind === 'hover') { tone(2200, 2400, 0.018, 0.025, 'sine', 0, 0, uiBus); return; }
    voice('ui_click', 0.35, 0, kind === 'back' ? 0.85 : rnd(1.0, 1.08), uiBus) || tone(1800, 1200, 0.03, 0.08, 'triangle', 0, 0, uiBus);
  },
  impact(dist = 0, pan = 0) {
    if (!init()) return;
    const k = dist ? 1 / (1 + dist / 8) : 1;
    if (voice(['impact_metal_', 'impact_wood_', 'impact_generic_'][(Math.random() * 3) | 0] + ((Math.random() * 3) | 0), 0.3 * k, pan, rnd(0.9, 1.15), world, 0.25)) return;
    noise(0.045, 2800, 3, 0.18 * k, 'bandpass', 0.002, pan);
  },
};
let stepSide = 1, surface = 'c', dead = false, chain = 0, chainT = -9;
function chord(freqs, dur, g, when, type, cutoff) {        // detuned stacked voices through one lowpass, into reverb
  if (!ctx || silent()) return;
  const t = ctx.currentTime + when, f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.35), t + dur);
  const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(g, t + 0.02); gn.gain.setTargetAtTime(0.0001, t + dur * 0.4, dur * 0.25);
  f.connect(gn); gn.connect(uiBus); if (!lite && convolver) { const s = ctx.createGain(); s.gain.value = 0.5; gn.connect(s); s.connect(reverbIn); }
  for (const fr of freqs) for (const det of [-7, 7]) {
    if (voices >= MAX_VOICES) break;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = fr; o.detune.value = det; o.onended = vEnd; o.connect(f); voices++; o.start(t); o.stop(t + dur + 0.6);
  }
}
function filterTo(f, hz, tc) { if (ctx) { f.frequency.cancelScheduledValues(ctx.currentTime); f.frequency.setTargetAtTime(hz, ctx.currentTime, tc); } }
function filterBack(f, after) { if (ctx) f.frequency.setTargetAtTime(dead ? 380 : lowHP ? 2400 : 20000, ctx.currentTime + after * 0.5, after * 0.35); }

// ---------------------------------------------------------------- health: low HP muffles the world, music thins out, heartbeat
let healthState = -1, lowHP = false, beatTimer = 0;
sfx.health = function (hp01) {
  if (!ctx) return;
  const s = dead ? 2 : hp01 < 0.3 ? 1 : 0;
  if (s === healthState) return; healthState = s; lowHP = s === 1;
  if (s === 2) return;
  filterTo(worldLP, lowHP ? 2400 : 20000, lowHP ? 0.15 : 0.4);
  filterTo(musicLP, lowHP ? 900 : 20000, lowHP ? 0.2 : 0.5);
  if (lowHP && !beatTimer) heartbeat(); else if (!lowHP && beatTimer) { clearTimeout(beatTimer); beatTimer = 0; }
};
function heartbeat() {
  beatTimer = 0; if (!lowHP || dead || !ctx) return;
  tone(70, 45, 0.12, 0.32, 'sine', 0, 0, uiBus); tone(62, 40, 0.12, 0.22, 'sine', 0, 0.2, uiBus);
  beatTimer = setTimeout(heartbeat, 820);
}

// ---------------------------------------------------------------- ambience per arena (synth beds + sparse one-shots)
const AMB = {
  belltower: { room: 'street', surf: 'c', wind: 0.10, hum: 0.05, gust: 0.25, shots: ['amb_bell', 'amb_bell2', 'amb_door'], every: [9, 18] },
  lantern: { room: 'canal', surf: 't', wind: 0.07, hum: 0.04, gust: 0.15, shots: ['amb_water0', 'amb_water1', 'amb_water0', 'amb_bell2'], every: [2.5, 6] },
  neon: { room: 'alley', surf: 'c', wind: 0.05, hum: 0.11, buzz: 1, gust: 0.1, shots: ['amb_machine', 'amb_door', 'amb_machine'], every: [6, 14] },
  sandkeep: { room: 'desert', surf: 's', wind: 0.16, hum: 0.02, gust: 0.5, shots: ['impact_metal_1', 'amb_door'], every: [8, 16] },
  story: { room: 'street', surf: 'c', wind: 0.08, hum: 0.07, gust: 0.2, shots: ['amb_machine', 'amb_door', 'far'], every: [6, 14] },
  indoor: { room: 'indoor', surf: 'c', wind: 0.02, hum: 0.1, gust: 0.05, shots: ['amb_machine', 'amb_door'], every: [7, 15] },
};
let ambNodes = [], ambTimer = 0, ambProfile = null, ambKey = '';
export const ambience = {
  start(key) {
    ambience.stop(); ambKey = key;
    if (!init()) return;
    const A = ambProfile = AMB[key] || AMB.story; surface = A.surf; setRoom(A.room);
    const t = ctx.currentTime;
    // wind/air: looped noise through a band filter whose gain swells with a slow LFO
    const mk = (type, hz, q, g) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = rnd(0.9, 1.1);
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = hz; f.Q.value = q;
      const gn = ctx.createGain(); gn.gain.value = g; src.connect(f); f.connect(gn); gn.connect(ambBus); src.start(t, Math.random()); ambNodes.push(src);
      return gn;
    };
    const air = mk('bandpass', 700, 0.4, A.wind);
    mk('lowpass', 140, 0.7, A.hum);
    if (A.gust) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = rnd(0.05, 0.09); lg.gain.value = A.wind * A.gust; lfo.connect(lg); lg.connect(air.gain); lfo.start(t); ambNodes.push(lfo); }
    if (A.buzz) {                                                              // neon: 60 Hz mains buzz with flicker
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 60;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 240; f.Q.value = 2;
      const g = ctx.createGain(); g.gain.value = 0.018; o.connect(f); f.connect(g); g.connect(ambBus); o.start(t); ambNodes.push(o);
    }
    ambBus.gain.cancelScheduledValues(t); ambBus.gain.setValueAtTime(0.0001, t); ambBus.gain.linearRampToValueAtTime(1, t + 2.5);
    const next = () => {
      ambTimer = setTimeout(() => {
        if (!ambProfile) return;
        const nm = A.shots[(Math.random() * A.shots.length) | 0], pan = rnd(-0.9, 0.9);
        if (nm === 'far') { const ids = ['ar7_lance', 'grinder_lmg', 'vex_p9']; for (let i = 0, n = 1 + ((Math.random() * 4) | 0); i < n; i++) voice('w_' + ids[(Math.random() * 3) | 0] + '_far', 0.05, pan, rnd(0.85, 0.95), ambBus, 0.8, 1400, i * rnd(0.09, 0.14)); }
        else voice(nm, nm.startsWith('amb_water') ? 0.5 : 0.18, pan, rnd(0.85, 1.05), ambBus, 0.7, 6000);
        next();
      }, rnd(A.every[0], A.every[1]) * 1000);
    };
    next();
  },
  stop() {
    ambProfile = null; ambKey = ''; if (ambTimer) clearTimeout(ambTimer); ambTimer = 0;
    if (!ctx) return;
    const t = ctx.currentTime, old = ambNodes; ambNodes = [];
    ambBus.gain.cancelScheduledValues(t); ambBus.gain.setTargetAtTime(0, t, 0.25);
    for (const n of old) try { n.stop(t + 1.2); } catch (e) { /* already stopped */ }
  },
  pause(on) { if (ctx) ambDuck.gain.setTargetAtTime(on ? 0.15 : 1, ctx.currentTime, 0.2); },
};

// ---------------------------------------------------------------- music: streamed tracks, crossfaded by game state
const TRACKS = { menu: 'menu', match: 'match', final: 'final' };
const tracks = Object.create(null);
let want = '', musicIntensity = -1, pending = '';
function track(name) {
  let T = tracks[name]; if (T) return T;
  const el = new Audio(); el.src = new URL('../sfx/music/' + TRACKS[name] + '.mp3', import.meta.url).href; el.loop = true; el.preload = 'none';
  el.setAttribute('playsinline', ''); el.crossOrigin = 'anonymous';
  T = tracks[name] = { el, g: null, on: false };
  try { const src = ctx.createMediaElementSource(el); T.g = gain(0, musicLP); src.connect(T.g); }
  catch (e) { T.g = null; el.volume = 0; }                                      // no routing: plain element volume
  return T;
}
function fadeTrack(T, on, sec) {
  T.on = on;
  if (T.g) { const t = ctx.currentTime; T.g.gain.cancelScheduledValues(t); T.g.gain.setValueAtTime(T.g.gain.value, t); T.g.gain.linearRampToValueAtTime(on ? 1 : 0, t + sec); }
  else T.el.volume = on ? Math.min(1, audio.master * audio.music) : 0;
  if (on) { const p = T.el.play(); if (p && p.catch) p.catch(() => { T.blocked = true; }); }
  else setTimeout(() => { if (!T.on) T.el.pause(); }, sec * 1000 + 100);
}
function musicKick() {                                                          // keep elements in step with mute/ads/hidden
  if (!ctx) return;
  for (const k in tracks) { const T = tracks[k]; if (silent()) T.el.pause(); else if (T.on && T.el.paused) { const p = T.el.play(); if (p && p.catch) p.catch(() => {}); } if (!T.g) T.el.volume = T.on && !silent() ? Math.min(1, audio.master * audio.music) : 0; }
}
export const music = {
  play(name, sec = 1.6) {
    if (!TRACKS[name]) return;
    if (!unlocked) { pending = name; return; }                                   // no audio (or downloads) before the first gesture
    if (!init()) return;
    if (want === name && tracks[name]?.on && !tracks[name].blocked) return;
    want = name;
    for (const k in TRACKS) if (k !== name && tracks[k]?.on) fadeTrack(tracks[k], false, sec);
    const T = track(name); T.blocked = false;
    if (!T.on && name !== 'menu') try { T.el.currentTime = 0; } catch (e) { /* not loaded yet */ }
    fadeTrack(T, true, sec);
  },
  menu() { music.play('menu', 2); if (ctx) { music.setIntensity(0.6); filterTo(musicLP, 20000, 0.3); } },
  start() { music.play('match', 1.2); musicIntensity = -1; if (ctx) music.setIntensity(0.5); },
  final() { if (want === 'final') return; sfx.finalCountdown(); setTimeout(() => { if (want === 'match') music.play('final', 1.4); }, 900); },
  end(won) {
    if (!ctx) return; won ? sfx.victory() : sfx.defeat();
    for (const k in tracks) if (tracks[k].on) fadeTrack(tracks[k], false, 1.2);
    want = ''; setTimeout(() => { if (!want) music.menu(); }, 3800);
  },
  stop() { if (!ctx) return; for (const k in tracks) if (tracks[k].on) fadeTrack(tracks[k], false, 0.8); want = ''; },
  pause(on) { if (!ctx) return; filterTo(musicLP, on ? 700 : lowHP ? 900 : 20000, 0.2); musicDuck.gain.setTargetAtTime(on ? 0.7 : 1, ctx.currentTime, 0.2); ambience.pause(on); },
  // 0 calm .. 1 firefight: called every frame, only touches audio when the bucket changes
  setIntensity(v) {
    const b = v > 0.8 ? 2 : v > 0.4 ? 1 : 0; if (b === musicIntensity || !ctx) return; musicIntensity = b;
    musicInt.gain.setTargetAtTime(b === 2 ? 1 : b === 1 ? 0.85 : 0.7, ctx.currentTime, 1.2);
  },
};

// ---------------------------------------------------------------- unlock (first gesture) + UI click sounds
let unlocked = false;
export function unlockAudio() {
  const first = !unlocked; unlocked = true;
  if (!init()) return;
  if (ctx.state === 'suspended' && !silent()) { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
  if (first) { syncVolume(); loadSamples(); if (ambKey) ambience.start(ambKey); if (pending) { const p = pending; pending = ''; music.play(p); } }
  for (const k in tracks) { const T = tracks[k]; if (T.on && T.blocked && !silent()) { T.blocked = false; const p = T.el.play(); if (p && p.catch) p.catch(() => { T.blocked = true; }); } }
}
// one delegated listener: every menu button clicks, desktop hover ticks (in-match touch buttons stay silent)
if (typeof document !== 'undefined') {
  let hoverT = 0, hoverEl = null;
  document.addEventListener('click', (e) => { unlockAudio(); const b = e.target.closest?.('button, .tab, [data-q], select, input[type=checkbox]'); if (b && !b.closest('#touch')) sfx.ui(/close|back|menuBtn|setClose/i.test(b.id || '') ? 'back' : 'click'); }, true);
  document.addEventListener('pointerover', (e) => { if (e.pointerType !== 'mouse' || !unlocked) return; const b = e.target.closest?.('button'); if (!b || b.closest('#touch') || b === hoverEl) return; hoverEl = b; const t = performance.now(); if (t - hoverT > 60) { hoverT = t; sfx.ui('hover'); } }, true);
  document.addEventListener('visibilitychange', () => forceMute('hidden', document.hidden));
  for (const ev of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(ev, unlockAudio, { capture: true, passive: true });   // any first touch/key/click (iOS needs touchend)
}
