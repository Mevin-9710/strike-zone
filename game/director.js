// Adaptive difficulty: one `threat` value (0..1) owns how hard the bots are. Everything else reads it:
// G.difficulty (enemy accuracy / damage / attack tokens), the story hit timer, DM bot skill and coin multiplier.
// Rises with kills (more for headshots and streaks), falls on death / low HP, drifts back to a level-based baseline.
// Allocation-free; tick() does real work at most once a second.
const S = { threat: 0.2, base: 0.2, peak: 0.2, cap: 0.85, streak: 0, firstKill: false, pinned: false, lastKill: 0, acc: 0, lowHpT: 0, on: true, tier: 0, onRise: null };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export const director = {
  get threat() { return S.threat; },
  get peak() { return S.peak; },
  get tier() { return S.tier; },                      // 0..7 display / DM bot skill tier
  set onRise(fn) { S.onRise = fn; },
  // mode: null|'daily'|'survival'|'dm'; level: player level; firstMission: true on mission 1 before any kill; easy: route marked easy
  start({ mode = null, level = 1, firstMission = false, easy = false, on = true, base = null } = {}) {
    S.on = on; S.cap = mode === 'dm' ? 1 : 0.85;
    S.base = base ?? clamp(0.15 + 0.03 * (level - 1), 0.1, 0.5) - (easy ? 0.15 : 0);
    S.base = clamp(S.base, 0.05, mode === 'dm' ? 0.8 : 0.5);
    S.pinned = firstMission; S.firstKill = false;
    S.threat = S.peak = S.pinned ? Math.min(S.base, 0.2) : S.base;
    S.streak = 0; S.lastKill = 0; S.acc = 0; S.lowHpT = 0; S.tier = Math.round(S.threat * 7);
  },
  kill(head, now) {
    if (!S.on) return;
    S.firstKill = true; S.pinned = false; S.streak++; S.lastKill = now;
    let d = 0.02 + (head ? 0.01 : 0); if (S.streak >= 3) d *= 1.5;
    this.set(S.threat + d);
  },
  death() { S.streak = 0; if (S.on) this.set(S.threat - 0.12); },
  set(v) {
    const top = S.pinned ? Math.min(0.2, S.cap) : S.cap;
    const before = S.tier; S.threat = clamp(v, 0, top); S.peak = Math.max(S.peak, S.threat);
    S.tier = Math.round(S.threat * 7); if (S.tier > before && S.onRise) S.onRise(S.tier);
  },
  // once per frame; cheap. hp: player HP, now: mission clock (s)
  tick(dt, hp, now) {
    if (!S.on) return;
    S.acc += dt; if (S.acc < 1) return; const step = S.acc; S.acc = 0;
    if (hp > 0 && hp < 30) { if (S.lowHpT <= 0) { this.set(S.threat - 0.05); S.lowHpT = 8; } }
    S.lowHpT -= step;
    if (now - S.lastKill > 20) { const k = Math.min(1, step / 20); this.set(S.threat + (S.base - S.threat) * k); S.streak = 0; }
  },
  difficulty() { return 0.6 + S.threat * 1.0; },       // 0.6 .. 1.6, inside enemies.js's 0.25..3 clamp
  coinMul() { return 1 + S.threat; },
  // story hit timer multiplier: higher threat -> bots land hits more often
  hitDelayDiv() { return 0.6 + S.threat; },
  get state() { return { ...S, onRise: undefined }; },
};
