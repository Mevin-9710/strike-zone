// Daily (3) + weekly (1) quests. Saved in localStorage 'sz_quests' (mirrored to CrazyGames cloud save via crazy.js KEYS).
// progress(kind, n) -> list of quests completed by this call. claim(id) -> { coins, xp } or null.
const KEY = 'sz_quests';
const POOL = [
  { kind: 'kill', n: 30, coins: 60, xp: 150, t: 'Get {n} kills' },
  { kind: 'head', n: 8, coins: 60, xp: 150, t: 'Land {n} headshots' },
  { kind: 'win', n: 2, coins: 80, xp: 200, t: 'Win {n} missions' },
  { kind: 'dmkill', n: 25, coins: 70, xp: 180, t: 'Get {n} kills in Deathmatch' },
  { kind: 'match', n: 4, coins: 50, xp: 120, t: 'Play {n} matches' },
  { kind: 'streak', n: 5, coins: 70, xp: 160, t: 'Get a {n}-kill streak' },
];
const STARTER = [                                                    // a brand-new player's first set: doable in session 1
  { kind: 'kill', n: 5, coins: 40, xp: 100, t: 'Get {n} kills' },
  { kind: 'win', n: 1, coins: 60, xp: 150, t: 'Win {n} mission' },
  { kind: 'head', n: 2, coins: 40, xp: 100, t: 'Land {n} headshots' },
];
const WEEKLY = [
  { kind: 'win', n: 10, coins: 300, xp: 600, t: 'Win {n} missions this week' },
  { kind: 'kill', n: 250, coins: 300, xp: 600, t: 'Get {n} kills this week' },
];
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
function weekKey(d = new Date()) {                                   // ISO week, e.g. 2026-W47
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, '0')}`;
}
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const mk = (q, id) => ({ id, kind: q.kind, n: q.n, coins: q.coins, xp: q.xp, t: q.t.replace('{n}', q.n), p: 0, done: false, claimed: false });

let S = null;
function load() { try { S = JSON.parse(localStorage.getItem(KEY)); } catch { S = null; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* blocked */ } }

export function refresh(now = new Date()) {
  if (!S) load();
  const dk = dayKey(now), wk = weekKey(now);
  if (!S || typeof S !== 'object') S = { day: '', week: '', daily: [], weekly: null, sets: 0 };
  if (S.day !== dk) {
    const first = !S.sets; S.sets = (S.sets || 0) + 1; S.day = dk;
    if (first) S.daily = STARTER.map((q, i) => mk(q, 'd' + i));
    else { const h = hash(dk), pick = []; for (let i = 0; pick.length < 3 && i < 12; i++) { const q = POOL[(h + i * 7) % POOL.length]; if (!pick.includes(q)) pick.push(q); } S.daily = pick.map((q, i) => mk(q, 'd' + i)); }
  }
  if (S.week !== wk) { S.week = wk; S.weekly = mk(WEEKLY[hash(wk) % WEEKLY.length], 'w0'); }
  save(); return S;
}
export const all = () => { refresh(); return [...S.daily, S.weekly]; };
export const unclaimed = () => all().filter(q => q.done && !q.claimed).length;
// kind: kill | head | win | dmkill | match | streak (streak: n = current streak, keeps the max)
export function progress(kind, n = 1) {
  refresh(); const out = [];
  for (const q of all()) {
    if (q.kind !== kind || q.done) continue;
    q.p = kind === 'streak' ? Math.max(q.p, n) : q.p + n;
    if (q.p >= q.n) { q.p = q.n; q.done = true; out.push(q); }
  }
  save();
  return out;
}
export function claim(id) {
  const q = all().find(x => x.id === id); if (!q || !q.done || q.claimed) return null;
  q.claimed = true; save(); return { coins: q.coins, xp: q.xp };
}
export function resetsIn(now = new Date()) {                         // "14H" until the next UTC midnight
  const ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
  const h = Math.floor(ms / 36e5); return h >= 1 ? `${h}H` : `${Math.max(1, Math.round(ms / 6e4))}M`;
}
export const _reset = () => { S = null; try { localStorage.removeItem(KEY); } catch { /* */ } };
