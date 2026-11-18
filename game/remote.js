// Remote config: live tuning without a new CrazyGames upload. Fetched once at boot from the public GitHub repo
// (raw CDN, CORS *, ~5 min cache). Times out fast and falls back to the built-in values; never blocks the game.
const URL = 'https://raw.githubusercontent.com/Mevin-9710/strike-zone/main/remote-config.json';
export const RC = {
  quality: { desk: null, touch: null }, touchAutoFire: true, partTimer: { extra: 30, min: 90, max: 150 }, singleMaxTimer: 150, singleMaxCount: 7,
  holdSeconds: 20, contactAfter: 20, easyAfterFails: 2, easyCountMul: 0.65, easyExtraTime: 30, autoNextSeconds: 5, winCoins: 100, partCoins: 50, midgameGapSeconds: 180,
  loaded: false,
};
export async function loadRemote(skip, ms = 2500) {
  if (skip) return RC;
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms);
    const r = await fetch(`${URL}?t=${Math.floor(Date.now() / 300000)}`, { signal: ctl.signal, cache: 'no-store' }); clearTimeout(to);
    if (r.ok) { const j = await r.json(); for (const k of Object.keys(RC)) if (j[k] !== undefined && j[k] !== null) RC[k] = typeof RC[k] === 'object' && RC[k] ? { ...RC[k], ...j[k] } : j[k]; RC.loaded = true; RC.v = j.v; }
  } catch (e) { /* offline / blocked: built-in values */ }
  return RC;
}
