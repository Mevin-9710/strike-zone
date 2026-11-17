// Return hooks: the daily challenge (one seeded mission a day, streak bonus) and endless Survival (waves on a cleared map).
const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);   // UTC day, same for every player
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

export const DAILY_BASE = 300, DAILY_STEP = 100, DAILY_CAP = 7;

// today's challenge among the missions the player can play (0..progress)
export function dailyToday(progress, count) {
  const day = dayKey(), h = hash(day), n = Math.min(count, progress + 1);
  return { day, idx: h % n, route: (h >> 8) & 1 ? 'assault' : 'stealth' };
}
export function dailyState() {
  const s = get('sz_daily', { last: '', streak: 0 }), today = dayKey(), yday = dayKey(Date.now() - 864e5);
  const done = s.last === today, alive = done || s.last === yday;
  return { done, streak: alive ? s.streak : 0, next: (alive ? s.streak : 0) + (done ? 0 : 1) };
}
export const dailyBonus = streak => DAILY_BASE + DAILY_STEP * (Math.min(streak, DAILY_CAP) - 1);
// call on a daily win; returns { streak, bonus } or null if already claimed today
export function claimDaily() {
  const st = dailyState(); if (st.done) return null;
  put('sz_daily', { last: dayKey(), streak: st.next });
  return { streak: st.next, bonus: dailyBonus(st.next) };
}

// Survival: wave n has 2 + n hostiles (max 10); every wave is worth XP; best wave is saved
export const SURV_XP = 120, survCount = w => Math.min(10, 2 + w);
export const survBest = () => get('sz_surv_best', 0);
export function survRecord(w) { const b = survBest(); if (w > b) put('sz_surv_best', w); return w > b; }

// 7-day login calendar: first lobby visit each UTC day pays coins; missing a day restarts at day 1; day 7 loops
export const LOGIN_COINS = [100, 150, 200, 250, 300, 400, 600];
export function loginClaim() {
  const s = get('sz_login', { last: '', day: 0 }), today = dayKey(), yday = dayKey(Date.now() - 864e5);
  if (s.last === today) return null;
  const day = s.last === yday ? (s.day % 7) + 1 : 1;
  put('sz_login', { last: today, day });
  return { day, coins: LOGIN_COINS[day - 1], tomorrow: LOGIN_COINS[day % 7] };
}
export const loginTomorrow = () => { const s = get('sz_login', { last: '', day: 0 }); return LOGIN_COINS[s.last === dayKey() ? s.day % 7 : 0]; };
