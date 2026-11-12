// game/feel.js — comic "game juice" overlay (damage numbers, kill banners, multi-kill
// announcements, XP pops, low-health vignette, hit punch, objective arrow).
//
// Usage:
//   import { initFeel, damageNumber, killBanner, announce, xpPop, streakTick,
//            lowHealth, hitPunch, objectiveArrow, update } from './game/feel.js';
//   initFeel(hudEl);                       // once, after the HUD exists (pass #hud, not body,
//                                          // so full-screen menus still paint above the layer)
//   damageNumber(x, y, 42, { head:true }); // screen px
//   killBanner('ELIMINATED', { head:false, streak:3 });
//   announce('OBJECTIVE SECURED', 'objective');
//   xpPop(50, 'KILL');
//   const n = streakTick(performance.now()); // n >= 2 already announced
//   lowHealth(0.4);                        // 0..1, call whenever health changes
//   hitPunch(1);                           // 0..1
//   objectiveArrow(x, y, onScreen, 'A', 18); // call each frame; x/y may be off-screen
//   update(dt);                            // each frame; animations themselves run in CSS
//
// Everything is pooled DOM. Spawns write transform/opacity vars only; update() just
// ages the pools (no layout reads, no per-frame allocation). All @keyframes animate
// transform/opacity only.

const MAX_DMG = 24, XP_POOL = 6, ANN_POOL = 3;
const DMG_LIFE = 0.82, XP_LIFE = 1.0;
const STREAK_WINDOW = 4000;

const KIND_COLOR = {
  streak: '#ffd23b',
  kill: '#ff3b47',
  head: '#ffd23b',
  objective: '#5fe6ff',
  mission: '#ffd23b',
  warn: '#ff3b47',
  xp: '#3ddc84',
  info: '#ffd23b',
};

const CSS = `
.sz-feel{position:fixed;inset:0;overflow:hidden;pointer-events:none;font-family:Impact,"Haettenschweiler","Arial Narrow Bold","Franklin Gothic Heavy",sans-serif;contain:layout style}
.sz-feel *{pointer-events:none;box-sizing:border-box}

/* ---- floating damage numbers ---- */
.sz-dmg{position:absolute;left:0;top:0;opacity:0;white-space:nowrap;
  font-size:calc(var(--u,12px)*1.5);line-height:1;color:#fff;text-shadow:0 0 4px rgba(0,0,0,.9),2px 2px 0 #111;
  text-shadow:2px 2px 0 #111;transform:translate3d(var(--x,0px),var(--y,0px),0) translate(-50%,-50%)}
.sz-dmg.kill{font-size:calc(var(--u,12px)*1.72);color:#ff3b47}
.sz-dmg.head{font-size:calc(var(--u,12px)*1.88);color:#ffd23b;text-shadow:2px 2px 0 #111,0 0 8px rgba(255,210,59,.55)}
.sz-dmg.on{animation:sz-dmg-a ${DMG_LIFE}s cubic-bezier(.16,.8,.32,1) forwards}
@keyframes sz-dmg-a{
  0%{opacity:0;transform:translate3d(var(--x,0px),var(--y,0px),0) translate(-50%,-50%) scale(.5)}
  14%{opacity:1;animation-timing-function:linear;transform:translate3d(var(--x,0px),calc(var(--y,0px) - 7px),0) translate(-50%,-50%) scale(1.18)}
  100%{opacity:0;transform:translate3d(var(--x,0px),calc(var(--y,0px) - 54px),0) translate(-50%,-50%) scale(.9)}
}
@keyframes sz-dmg-b{
  0%{opacity:0;transform:translate3d(var(--x,0px),var(--y,0px),0) translate(-50%,-50%) scale(.5)}
  14%{opacity:1;animation-timing-function:linear;transform:translate3d(var(--x,0px),calc(var(--y,0px) - 7px),0) translate(-50%,-50%) scale(1.18)}
  100%{opacity:0;transform:translate3d(var(--x,0px),calc(var(--y,0px) - 54px),0) translate(-50%,-50%) scale(.9)}
}

/* ---- XP pops right of the crosshair ---- */
.sz-xp{position:absolute;left:0;top:0;opacity:0;white-space:nowrap;
  background:#ffd23b;border:2px solid #111;box-shadow:2px 2px 0 #111;padding:1px 5px;
  transform:translate3d(var(--x,0px),var(--y,0px),0) translate(0,-50%) skewX(-8deg)}
.sz-xp .sz-xpi{display:block;transform:skewX(8deg);font-size:calc(var(--u,12px)*.92);line-height:1.1;color:#111}
.sz-xp b{font-weight:normal;letter-spacing:.5px}
.sz-xp small{display:inline;margin-left:4px;font-size:.78em;opacity:.8}
.sz-xp.on{animation:sz-xp-a ${XP_LIFE}s cubic-bezier(.16,.8,.32,1) forwards}
@keyframes sz-xp-a{
  0%{opacity:0;transform:translate3d(var(--x,0px),var(--y,0px),0) translate(0,-50%) skewX(-8deg) scale(.7)}
  12%{opacity:1;transform:translate3d(calc(var(--x,0px) + 3px),var(--y,0px),0) translate(0,-50%) skewX(-8deg) scale(1.06)}
  40%{opacity:1;animation-timing-function:linear}
  100%{opacity:0;transform:translate3d(calc(var(--x,0px) + 14px),calc(var(--y,0px) - 38px),0) translate(0,-50%) skewX(-8deg) scale(1)}
}
@keyframes sz-xp-b{
  0%{opacity:0;transform:translate3d(var(--x,0px),var(--y,0px),0) translate(0,-50%) skewX(-8deg) scale(.7)}
  12%{opacity:1;transform:translate3d(calc(var(--x,0px) + 3px),var(--y,0px),0) translate(0,-50%) skewX(-8deg) scale(1.06)}
  40%{opacity:1;animation-timing-function:linear}
  100%{opacity:0;transform:translate3d(calc(var(--x,0px) + 14px),calc(var(--y,0px) - 38px),0) translate(0,-50%) skewX(-8deg) scale(1)}
}

/* ---- center-bottom kill banner ---- */
.sz-banner{position:absolute;left:50%;bottom:15%;opacity:0;display:flex;
  align-items:center;gap:8px;background:#ffd23b;border:3px solid #111;box-shadow:5px 5px 0 #111;
  padding:3px 15px;transform:translateX(-50%) skewX(-8deg)}
.sz-banner .sz-bt{font-size:calc(var(--u,12px)*2.35);line-height:1;letter-spacing:1px;color:#111;text-transform:uppercase;transform:skewX(8deg)}
.sz-banner .sz-bs{display:none;background:#111;color:#ffd23b;padding:1px 7px;font-size:calc(var(--u,12px)*1.4);
  line-height:1.1;transform:skewX(8deg)}
.sz-banner.head{background:#ff3b47}
.sz-banner.head .sz-bt{color:#fff;text-shadow:2px 2px 0 #111}
.sz-banner.head .sz-bs{background:#ffd23b;color:#111}
.sz-banner.on{animation:sz-ban-a .95s cubic-bezier(.16,.9,.3,1) forwards}
@keyframes sz-ban-a{
  0%{opacity:0;transform:translateX(-50%) skewX(-8deg) scale(.72)}
  12%{opacity:1;transform:translateX(-50%) skewX(-8deg) scale(1.07)}
  22%{transform:translateX(-50%) skewX(-8deg) scale(1)}
  78%{opacity:1;animation-timing-function:linear}
  100%{opacity:0;transform:translateX(-50%) skewX(-8deg) scale(1.02)}
}
@keyframes sz-ban-b{
  0%{opacity:0;transform:translateX(-50%) skewX(-8deg) scale(.72)}
  12%{opacity:1;transform:translateX(-50%) skewX(-8deg) scale(1.07)}
  22%{transform:translateX(-50%) skewX(-8deg) scale(1)}
  78%{opacity:1;animation-timing-function:linear}
  100%{opacity:0;transform:translateX(-50%) skewX(-8deg) scale(1.02)}
}

/* ---- big center announcements ---- */
.sz-ann{position:absolute;left:50%;top:36%;opacity:0;white-space:nowrap;
  font-size:calc(var(--u,12px)*4);line-height:1;letter-spacing:2px;text-transform:uppercase;color:#ffd23b;
  text-shadow:0 0 6px rgba(0,0,0,.85),3px 3px 0 #111;
  transform:translate(-50%,-50%) skewX(-8deg) scale(.8)}
.sz-ann.on{animation:sz-ann-a 1.7s cubic-bezier(.18,.9,.3,1) forwards}
@keyframes sz-ann-a{
  0%{opacity:0;transform:translate(-50%,-50%) skewX(-8deg) scale(.66)}
  12%{opacity:1;transform:translate(-50%,-50%) skewX(-8deg) scale(1.1)}
  22%{transform:translate(-50%,-50%) skewX(-8deg) scale(1)}
  72%{opacity:1;animation-timing-function:linear}
  100%{opacity:0;transform:translate(-50%,-50%) skewX(-8deg) scale(1.04)}
}
@keyframes sz-ann-b{
  0%{opacity:0;transform:translate(-50%,-50%) skewX(-8deg) scale(.66)}
  12%{opacity:1;transform:translate(-50%,-50%) skewX(-8deg) scale(1.1)}
  22%{transform:translate(-50%,-50%) skewX(-8deg) scale(1)}
  72%{opacity:1;animation-timing-function:linear}
  100%{opacity:0;transform:translate(-50%,-50%) skewX(-8deg) scale(1.04)}
}

/* ---- low health pulsing edge vignette ---- */
.sz-low{position:absolute;inset:0;opacity:0}
.sz-low .sz-low-i{position:absolute;inset:0;opacity:.6;
  background:radial-gradient(ellipse at center,transparent 50%,rgba(255,25,40,.5) 80%,rgba(255,20,35,.9) 100%)}
.sz-low.on .sz-low-i{animation:sz-low-pulse 1.05s ease-in-out infinite}
@keyframes sz-low-pulse{0%,100%{opacity:.38}50%{opacity:.88}}

/* ---- objective marker / edge arrow ---- */
.sz-obj{position:absolute;left:0;top:0;display:none;opacity:0;
  transform:translate3d(-200px,-200px,0)}
.sz-obj.on{display:block;opacity:1}
.sz-obj .sz-oa{position:absolute;left:-11px;top:-11px;width:22px;height:22px;line-height:22px;text-align:center;
  font-style:normal;font-size:22px;color:#ffd23b;text-shadow:0 0 4px rgba(0,0,0,.9),2px 2px 0 #111;
  transform-origin:50% 50%}
.sz-obj.onScreen .sz-oa{left:-8px;top:-8px;width:16px;height:16px;line-height:16px;font-size:16px;color:#5fe6ff}
.sz-obj .sz-ol{position:absolute;left:0;top:15px;transform:translateX(-50%) skewX(-8deg);white-space:nowrap;
  background:#ffd23b;border:2px solid #111;box-shadow:2px 2px 0 #111;padding:0 5px;color:#111;
  font-size:calc(var(--u,12px)*.72);line-height:1.25}
.sz-obj .sz-od{margin-left:4px;opacity:.75}

/* ---- hit punch: briefly scales the existing crosshair ---- */
body.sz-punch-a #cross{animation:sz-punch-a .12s ease-out}
body.sz-punch-b #cross{animation:sz-punch-b .12s ease-out}
@keyframes sz-punch-a{0%{transform:scale(var(--szp,1.4))}100%{transform:scale(1)}}
@keyframes sz-punch-b{0%{transform:scale(var(--szp,1.4))}100%{transform:scale(1)}}
`;

let layer = null;
let styleInjected = false;
let vw = 0, vh = 0;
let dmgPool = [], xpPool = [], annPool = [];
let dmgCursor = 0, xpCursor = 0, annCursor = 0;
let dmgLive = 0, xpLive = 0;
let flip = false;
let punchFlip = false, punchTimer = 0;

let bannerEl, bannerText, bannerStreak;
let lowEl, lowOn = false, lowK = -1;
let objEl, objArrow, objLabelEl, objDistEl;
let objVis = false, objOn = null, objX = -9999, objY = -9999, objAng = 999;
let objLabelTxt = null, objDistVal = null;

let lastKillAt = -1e9, streak = 0;

function el(tag, cls, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
}

function nextAnim(base) {
  flip = !flip;
  return base + (flip ? '-b' : '-a');
}

function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  if (document.getElementById('sz-feel-style')) return;
  const s = document.createElement('style');
  s.id = 'sz-feel-style';
  s.textContent = CSS;
  (document.head || document.documentElement).appendChild(s);
}

function measure() {
  vw = window.innerWidth || 0;
  vh = window.innerHeight || 0;
}

export function initFeel(rootEl) {
  if (typeof document === 'undefined') return;
  if (!rootEl) rootEl = document.body;
  if (!rootEl) return;

  injectStyle();
  measure();
  if (!layer) {
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', measure);

    layer = el('div', 'sz-feel', rootEl);

    for (let i = 0; i < MAX_DMG; i++) {
      const d = el('div', 'sz-dmg', layer);
      dmgPool.push({ el: d, life: 0 });
    }

    for (let i = 0; i < XP_POOL; i++) {
      const p = el('div', 'sz-xp', layer);
      const inner = el('span', 'sz-xpi', p);
      const main = el('b', '', inner);
      const small = el('small', '', inner);
      small.style.display = 'none';
      xpPool.push({ el: p, main, small, life: 0 });
    }

    for (let i = 0; i < ANN_POOL; i++) annPool.push({ el: el('div', 'sz-ann', layer) });

    bannerEl = el('div', 'sz-banner', layer);
    bannerText = el('span', 'sz-bt', bannerEl);
    bannerStreak = el('span', 'sz-bs', bannerEl);

    lowEl = el('div', 'sz-low', layer);
    el('div', 'sz-low-i', lowEl);

    objEl = el('div', 'sz-obj', layer);
    objArrow = el('i', 'sz-oa', objEl);
    objArrow.textContent = '\u25B2';
    const objLabel = el('span', 'sz-ol', objEl);
    objLabelEl = el('span', 'sz-on', objLabel);
    objDistEl = el('span', 'sz-od', objLabel);
  } else if (rootEl && layer.parentNode !== rootEl) {
    rootEl.appendChild(layer);
  }
}

export function damageNumber(screenX, screenY, amount, opts) {
  if (!layer || !dmgPool.length) return;
  const o = opts || {};
  const slot = dmgPool[dmgCursor];
  dmgCursor = (dmgCursor + 1) % MAX_DMG;
  const d = slot.el;
  if (slot.life <= 0) dmgLive++;
  slot.life = DMG_LIFE;
  d.textContent = amount;
  d.classList.toggle('head', !!o.head);
  d.classList.toggle('kill', !!o.kill);
  d.style.setProperty('--x', Math.round(screenX) + 'px');
  d.style.setProperty('--y', Math.round(screenY) + 'px');
  d.style.animationName = nextAnim('sz-dmg');
  d.classList.add('on');
}

export function killBanner(text, opts) {
  if (!layer) return;
  const o = opts || {};
  bannerText.textContent = text == null ? '' : text;
  bannerEl.classList.toggle('head', !!o.head);
  const s = o.streak | 0;
  if (s > 1) {
    bannerStreak.textContent = 'x' + s;
    bannerStreak.style.display = 'inline-block';
  } else {
    bannerStreak.style.display = 'none';
  }
  bannerEl.style.animationName = nextAnim('sz-ban');
  bannerEl.classList.add('on');
}

export function announce(text, kind) {
  if (!layer || !annPool.length) return;
  const slot = annPool[annCursor];
  annCursor = (annCursor + 1) % ANN_POOL;
  // One announcement at a time: a new one replaces any still on screen so they never overlap.
  for (const o of annPool) { o.el.classList.remove('on'); o.el.style.opacity = '0'; }
  const a = slot.el;
  a.style.opacity = '';
  a.textContent = text == null ? '' : text;
  a.style.color = KIND_COLOR[kind] || KIND_COLOR.info;
  a.style.animationName = nextAnim('sz-ann');
  a.classList.add('on');
}

export function xpPop(amount, label) {
  if (!layer || !xpPool.length) return;
  const slot = xpPool[xpCursor];
  const stack = xpCursor;
  xpCursor = (xpCursor + 1) % XP_POOL;
  if (slot.life <= 0) xpLive++;
  slot.life = XP_LIFE;

  slot.main.textContent = (amount >= 0 ? '+' : '') + amount + ' XP';
  if (label) {
    slot.small.textContent = label;
    slot.small.style.display = 'inline';
  } else {
    slot.small.style.display = 'none';
  }

  const x = Math.round(vw * 0.5 + 36);
  const y = Math.round(vh * 0.5 - 10 - (stack % XP_POOL) * 21);
  slot.el.style.setProperty('--x', x + 'px');
  slot.el.style.setProperty('--y', y + 'px');
  slot.el.style.animationName = nextAnim('sz-xp');
  slot.el.classList.add('on');
}

export function streakTick(now) {
  const t = typeof now === 'number' ? now
    : (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (t - lastKillAt > STREAK_WINDOW) streak = 1;
  else streak = Math.min(99, streak + 1);
  lastKillAt = t;

  if (streak >= 2) {
    announce(
      streak === 2 ? 'DOUBLE KILL' : streak === 3 ? 'TRIPLE KILL' : streak === 4 ? 'QUAD KILL' : 'RAMPAGE',
      'streak'
    );
  }
  return streak;
}

export function lowHealth(k) {
  if (!layer) return;
  let v = +k;
  if (!(v > 0)) v = 0;
  else if (v > 1) v = 1;
  const r = Math.round(v * 100) / 100;
  if (r === lowK) return;
  lowK = r;
  lowEl.style.opacity = r === 0 ? '0' : String(r);
  const on = r > 0;
  if (on !== lowOn) {
    lowOn = on;
    lowEl.classList.toggle('on', on);
  }
}

export function hitPunch(k) {
  if (!layer || typeof document === 'undefined' || !document.body) return;
  let v = k == null ? 0.6 : +k;
  if (!(v > 0)) v = 0;
  else if (v > 1) v = 1;

  const body = document.body;
  body.style.setProperty('--szp', (1 + v * 0.45).toFixed(2));
  punchFlip = !punchFlip;
  body.classList.remove('sz-punch-a', 'sz-punch-b');
  body.classList.add(punchFlip ? 'sz-punch-b' : 'sz-punch-a');
  if (punchTimer) clearTimeout(punchTimer);
  punchTimer = setTimeout(function () {
    body.classList.remove('sz-punch-a', 'sz-punch-b');
    punchTimer = 0;
  }, 130);
}

export function objectiveArrow(screenX, screenY, onScreen, label, dist) {
  if (!layer) return;

  if (screenX == null || !isFinite(screenX) || !isFinite(screenY)) {
    if (objVis) {
      objVis = false;
      objEl.classList.remove('on');
    }
    return;
  }

  if (!objVis) {
    objVis = true;
    objEl.classList.add('on');
  }

  const cx = vw * 0.5, cy = vh * 0.5;
  const on = !!onScreen;
  let x = screenX, y = screenY, ang = 0;

  if (!on) {
    const m = vw < 620 || vh < 430 ? 34 : 46;
    x = x < m ? m : (x > vw - m ? vw - m : x);
    y = y < m ? m : (y > vh - m ? vh - m : y);
    ang = Math.atan2(screenY - cy, screenX - cx);
  }

  const ix = Math.round(x), iy = Math.round(y);
  if (ix !== objX || iy !== objY) {
    objX = ix; objY = iy;
    objEl.style.transform = 'translate3d(' + ix + 'px,' + iy + 'px,0)';
  }

  if (on !== objOn) {
    objOn = on;
    objEl.classList.toggle('onScreen', on);
    objArrow.textContent = on ? '\u25C6' : '\u25B2';
  }

  if (on) {
    if (objAng !== 0) {
      objAng = 0;
      objArrow.style.transform = 'rotate(0deg)';
    }
  } else {
    let deg = Math.round(ang * 57.29578) + 90;
    if (deg > 180) deg -= 360;
    else if (deg < -180) deg += 360;
    if (deg !== objAng) {
      objAng = deg;
      objArrow.style.transform = 'rotate(' + deg + 'deg)';
    }
  }

  const lt = label == null ? '' : label;
  if (lt !== objLabelTxt) {
    objLabelTxt = lt;
    objLabelEl.textContent = lt;
  }

  const dv = typeof dist === 'number' ? Math.round(dist) : (dist == null ? '' : dist);
  if (dv !== objDistVal) {
    objDistVal = dv;
    objDistEl.textContent = dv === '' ? '' : (typeof dv === 'number' ? dv + 'm' : dv);
    objDistEl.style.display = dv === '' ? 'none' : 'inline';
  }
}

export function update(dt) {
  if (!layer) return;
  if (!(dt > 0)) return;
  if (dt > 0.1) dt = 0.1;

  if (dmgLive > 0) {
    for (let i = 0; i < MAX_DMG; i++) {
      const n = dmgPool[i];
      if (n.life > 0) {
        n.life -= dt;
        if (n.life <= 0) {
          n.life = 0;
          n.el.classList.remove('on');
          dmgLive--;
        }
      }
    }
  }

  if (xpLive > 0) {
    for (let i = 0; i < XP_POOL; i++) {
      const n = xpPool[i];
      if (n.life > 0) {
        n.life -= dt;
        if (n.life <= 0) {
          n.life = 0;
          n.el.classList.remove('on');
          xpLive--;
        }
      }
    }
  }
}
