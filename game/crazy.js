// CrazyGames SDK v3 wrapper. Every call is a safe no-op when the SDK is absent (local dev, ?test=1, blocked script).
// Hooks: crazy.init(), loading(on), gameplay(on), happy(), midgame(), rewarded(onDone), onAd(cb) for mute/pause.
let MIN_AD_GAP = 180000;           // midgame ads at most every 3 min (the SDK also enforces its own cooldown)
const KEYS = ['sz_loadout', 'sz_profile', 'sz_progress', 'sz_settings', 'sz_tutorial_done', 'sz_onboard_done', 'sz_daily', 'sz_surv_best', 'sz_parts', 'sz_login', 'sz_quests', 'sz_dm_best', 'sz_dm_played', 'sz_dm_level', 'sz_mode'];
import { track } from './telemetry.js';
let S = null, lastAd = 0, gsSent = false, adsArmed = false, adHook = () => {}, playing = false, inAd = false;

const sdk = () => S;
const safe = fn => { try { return fn(S); } catch (e) { /* SDK hiccup: never break the game */ } };

async function waitForScript(ms) {
  const t0 = performance.now();
  while (!window.CrazyGames?.SDK && !window.__noSDK && performance.now() - t0 < ms) await new Promise(r => setTimeout(r, 50));
  return window.CrazyGames?.SDK;
}

function mirrorData() {
  // Hydrate localStorage from the SDK data module (cloud save), then mirror every sz_* write back to it.
  safe(s => { for (const k of KEYS) { const v = s.data.getItem(k); if (v !== null && v !== undefined) try { localStorage.setItem(k, v); } catch (e) { /* blocked */ } } });
  try {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { orig.call(this, k, v); if (this === localStorage && KEYS.includes(k)) safe(s => s.data.setItem(k, String(v))); };
  } catch (e) { /* ignore */ }
}

export const crazy = {
  get active() { return !!S; },
  async init(skip) {
    if (skip) return false;
    try {
      const sd = await waitForScript(4000); if (!sd) return false;
      await Promise.race([sd.init(), new Promise((_, rej) => setTimeout(() => rej(new Error('sdk init timeout')), 5000))]);
      S = sd; mirrorData(); track('sdk', { ok: 1 }); return true;
    } catch (e) { S = null; track('sdk', { ok: 0, m: String(e?.message || e).slice(0, 60) }); return false; }
  },
  onAd(cb) { adHook = cb; },                         // cb(true) ad started -> mute+pause; cb(false) ended
  loading(on) { safe(s => on ? s.game.loadingStart() : s.game.loadingStop()); },
  gameplay(on) { if (on === playing) return; playing = on; if (on && !gsSent) { gsSent = true; track('gs', { sdk: !!S }); } safe(s => on ? s.game.gameplayStart() : s.game.gameplayStop()); },
  setAdGap(ms) { if (ms >= 60000) MIN_AD_GAP = ms; },
  armAds() { if (!adsArmed) { adsArmed = true; lastAd = Date.now(); } },   // ad clock starts at the first real (non-drill) mission
  happy() { safe(s => s.game.happytime()); },
  // resolves when the ad (if any) is over; never rejects. Skips if an ad ran < 3 min ago or SDK absent.
  midgame() {
    if (!S || inAd || !adsArmed || Date.now() - lastAd < MIN_AD_GAP) return Promise.resolve();
    return new Promise(res => {
      const end = () => { if (inAd) { inAd = false; adHook(false); } lastAd = Date.now(); res(); };
      inAd = true; adHook(true);
      try { S.ad.requestAd('midgame', { adStarted() {}, adFinished: end, adError: end }); } catch (e) { end(); }
    });
  },
  // grants (onDone) after a finished rewarded ad; with no SDK it grants immediately (dev/offline). adError -> no reward.
  rewarded(onDone, onFail) {
    if (!S) { onDone(); return; }
    inAd = true; adHook(true);
    const end = ok => { inAd = false; adHook(false); lastAd = Date.now(); ok ? onDone() : onFail?.(); };
    try { S.ad.requestAd('rewarded', { adStarted() {}, adFinished: () => end(true), adError: () => end(false) }); } catch (e) { end(false); }
  },
};
