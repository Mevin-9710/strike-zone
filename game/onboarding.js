// First-time-user interface tour: spotlight/coach-mark overlay pointing at real UI elements, NEXT/SKIP, persisted
// 'sz_onboard_done'. game.js supplies `open` hooks (show the right panel before each step) and `onFinish(played)`.
// Usage: const tour = createOnboarding({ isTouch, open, onFinish }); tour.start({ force }); tour.active; tour.step
const KEY = 'sz_onboard_done';
export const STEPS = [
  { id: 'lobby', panel: 'lobby', sel: '#lPlay', title: 'WELCOME, VOSS', tx: 'This is HQ. PLAY starts the campaign. Let us take a quick look around first.' },
  { id: 'mode', panel: 'mode', sel: '#chapters', title: 'CHAPTERS', tx: 'PLAY opens the step menu: pick a chapter, then a mission. BACK or ESC goes back a step.' },
  { id: 'agent', panel: 'agent', sel: '#operatives', title: 'OPERATIVE', tx: 'Choose your operative. More unlock as the story moves on.' },
  { id: 'loadout', panel: 'loadout', sel: '#primaries', title: 'WEAPONS', tx: 'Pick a primary and a sidearm. Wins earn upgrade points for damage and ammo.' },
  { id: 'abilities', panel: 'loadout', sel: '#abilities', title: 'ABILITIES', tx: 'Pick two abilities per mission: slot one (Q) and slot two (F).' },
  { id: 'charms', panel: 'shop', sel: '#charms', title: 'SHOP · CHARMS', tx: 'Spend coins on charms that hang from your gun.' },
  { id: 'sprays', panel: 'shop', sel: '#sprays', title: 'SHOP · SPRAYS', tx: 'Sprays tag walls in a mission (T, or the pen button on phone).' },
  { id: 'pass', panel: 'pass', sel: '#passTrack', title: 'BATTLE PASS', tx: 'Every mission earns XP. Each tier pays out coins and cosmetics.' },
  { id: 'intel', panel: 'profile', sel: '#files', title: 'INTEL FILES', tx: 'Hidden files on each map unlock story here. Grab them for XP.' },
  { id: 'settings', panel: 'settings', sel: '#setRows', title: 'SETTINGS', tx: 'Sensitivity, button size, quality. You can replay this tour from here.' },
  { id: 'deploy', panel: 'lobby', sel: '#lPlay', title: 'READY', tx: 'Mission 1 is a guided drill with Amara. Deploy when ready.', last: true },
];
const CSS = `
#onb{position:fixed;inset:0;z-index:60;font-family:Impact,"Arial Narrow Bold",sans-serif;color:#111}
#onb .spot{position:fixed;border-radius:10px;box-shadow:0 0 0 9999px rgba(0,0,0,.62);outline:3px solid #ffd23b;outline-offset:3px;transition:all .25s;pointer-events:none}
#onb .bub{position:fixed;max-width:min(380px,88vw);background:#ffd23b;border:3px solid #111;box-shadow:4px 4px 0 #111;padding:10px 12px;transition:top .25s,left .25s}
#onb .bub h4{margin:0 0 4px;font-size:20px;letter-spacing:1px;font-weight:normal}
#onb .bub p{margin:0 0 8px;font:bold 14px "Trebuchet MS",Arial,sans-serif}
#onb .bub .r{display:flex;gap:8px;align-items:center;justify-content:flex-end}
#onb .bub .n{margin-right:auto;font-size:13px}
#onb button{font-family:inherit;font-size:15px;padding:4px 12px;border:2px solid #111;box-shadow:2px 2px 0 #111;cursor:pointer;background:#fff;color:#111;transform:none}
#onb button.nx{background:#111;color:#ffd23b}
@media (max-height:520px){#onb .bub{padding:6px 9px}#onb .bub h4{font-size:16px}#onb .bub p{font-size:12px;margin-bottom:5px}}
@media (prefers-reduced-motion:reduce){#onb .spot,#onb .bub{transition:none}}`;
const store = {
  get() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } },
  set() { try { localStorage.setItem(KEY, '1'); } catch { /* blocked */ } },
};
export const onboardingDone = () => store.get();

export function createOnboarding({ open = () => {}, onFinish = () => {} } = {}) {
  let root = null, idx = 0, raf = 0;
  function mount() {
    if (!document.getElementById('onbCss')) { const s = document.createElement('style'); s.id = 'onbCss'; s.textContent = CSS; document.head.append(s); }
    root = document.createElement('div'); root.id = 'onb';
    root.innerHTML = '<div class="spot"></div><div class="bub"><h4></h4><p></p><div class="r"><span class="n"></span><button class="sk" type="button">SKIP</button><button class="nx" type="button">NEXT</button></div></div>';
    root.querySelector('.sk').onclick = e => { e.stopPropagation(); finish(false); };
    root.querySelector('.nx').onclick = e => { e.stopPropagation(); api.next(); };
    root.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    document.body.append(root);
  }
  function place() {
    if (!root) return;
    const s = STEPS[idx], el = document.querySelector(s.sel), spot = root.querySelector('.spot'), bub = root.querySelector('.bub');
    const r = el?.getBoundingClientRect();
    if (!r || !r.width) { spot.style.cssText = 'left:50%;top:50%;width:0;height:0'; }
    else { const p = 6; spot.style.left = `${r.left - p}px`; spot.style.top = `${r.top - p}px`; spot.style.width = `${r.width + p * 2}px`; spot.style.height = `${Math.min(r.height, innerHeight * 0.7) + p * 2}px`; }
    const b = bub.getBoundingClientRect(), H = innerHeight, Wd = innerWidth;
    let top = r && r.width ? (r.bottom + 14 + b.height < H ? r.bottom + 14 : r.top - 14 - b.height) : (H - b.height) / 2;
    if (top < 8 || top + b.height > H - 8) top = H - b.height - 8;               // tall targets (phone): pin to bottom
    const left = Math.max(8, Math.min(Wd - b.width - 8, r && r.width ? r.left + r.width / 2 - b.width / 2 : (Wd - b.width) / 2));
    bub.style.top = `${top}px`; bub.style.left = `${left}px`;
  }
  function loop() { place(); raf = requestAnimationFrame(loop); }
  function enter(i) {
    idx = i; const s = STEPS[i];
    try { open(s.panel, s.id); } catch (e) { console.warn('onboarding open', e); }
    const el = document.querySelector(s.sel);
    if (!s.last && (!el || !el.getClientRects().length)) { enter(i + 1); return; }   // e.g. operative step hidden until a 2nd unlock
    root.querySelector('h4').textContent = s.title; root.querySelector('p').textContent = s.tx;
    root.querySelector('.n').textContent = `${i + 1}/${STEPS.length}`;
    root.querySelector('.nx').textContent = s.last ? 'DEPLOY ▶' : 'NEXT';
    el?.scrollIntoView?.({ block: 'nearest' });
    place();
  }
  function finish(played) {
    if (!api.active) return;
    api.active = false; store.set(); cancelAnimationFrame(raf); root?.remove(); root = null;
    try { onFinish(played); } catch (e) { console.warn('onboarding finish', e); }
  }
  const api = {
    active: false,
    start({ force = false } = {}) {
      if (api.active) return true; if (!force && store.get()) return false;
      root?.remove(); mount(); api.active = true; enter(0); loop(); return true;
    },
    next() { if (!api.active) return; if (STEPS[idx].last) finish(true); else enter(idx + 1); },
    skip() { finish(false); },
    get step() { return api.active ? STEPS[idx].id : null; },
    get target() { return api.active ? STEPS[idx].sel : null; },
  };
  return api;
}
