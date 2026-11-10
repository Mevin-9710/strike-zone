// First-run coach overlay (non-blocking). Comic HUD style: yellow panel, ink outline, Impact, skewX(-8deg).
// Usage (game.js):
//   const tut = createTutorial({ isTouch, onDone: ({ skipped }) => {} });
//   on mission start: tut.start();              // no-op (returns false) if already completed
//   every frame:      if (tut.active) tut.update({ moved, looked, fired, reloaded, ability, interacting });
//   tut.skip() ends it early (also wired to the SKIP button). Completion persists in localStorage 'sz_tutorial_done'.
// Flags are sticky: if the player already fired before the SHOOT step, that step completes instantly.
// Only transform/opacity animate (cheap on low-end GPUs); prefers-reduced-motion disables motion.

const KEY = 'sz_tutorial_done';
const DONE_HOLD = 650;     // ms the green "NICE!" state shows before advancing

const STEPS = [
  { id: 'moved',       title: 'MOVE',      pc: ['W', 'A', 'S', 'D'], pcTxt: 'to move',            touch: 'LEFT STICK',  touchTxt: 'to move' },
  { id: 'looked',      title: 'LOOK',      pc: ['MOUSE'],            pcTxt: 'to aim',             touch: 'DRAG RIGHT',  touchTxt: 'to aim' },
  { id: 'fired',       title: 'SHOOT',     pc: ['LMB'],              pcTxt: 'to fire',            touch: 'FIRE',        touchTxt: 'button to shoot' },
  { id: 'reloaded',    title: 'RELOAD',    pc: ['R'],                pcTxt: 'to reload',          touch: 'RELOAD',      touchTxt: 'button to reload' },
  { id: 'ability',     title: 'ABILITY',   pc: ['Q', 'F'],           pcTxt: 'use an ability',     touch: 'ABILITY',     touchTxt: 'tap an ability slot' },
  { id: 'interacting', title: 'OBJECTIVE', pc: ['HOLD E'],           pcTxt: 'at the objective',   touch: 'HOLD USE',    touchTxt: 'at the objective' },
];

const CSS = `
#tut{position:fixed;left:50%;top:calc(var(--u,12px)*8.2);z-index:30;pointer-events:none;transform:translateX(-50%);
  font-family:Impact,"Haettenschweiler","Arial Narrow Bold",sans-serif;color:#111;transition:opacity .25s,transform .25s}
#tut.hide{opacity:0;transform:translateX(-50%) translateY(-12px)}
#tut .tb{background:#ffd23b;border:3px solid #111;box-shadow:4px 4px 0 #111;transform:skewX(-8deg);display:flex;align-items:center;
  gap:calc(var(--u,12px)*.7);padding:calc(var(--u,12px)*.35) calc(var(--u,12px)*.5) calc(var(--u,12px)*.35) calc(var(--u,12px)*.8);transition:background .15s}
#tut .tb>*{transform:skewX(8deg)}
#tut.ok .tb{background:#3ddc84}
#tut .st{font-size:calc(var(--u,12px)*.75);background:#111;color:#ffd23b;padding:1px 6px;white-space:nowrap}
#tut .ti{font-size:calc(var(--u,12px)*1.35);letter-spacing:1px;white-space:nowrap}
#tut .ks{display:flex;gap:4px;align-items:center}
#tut kbd{font-family:inherit;font-size:calc(var(--u,12px)*1);background:#fff;border:2px solid #111;box-shadow:2px 2px 0 #111;padding:0 calc(var(--u,12px)*.4);min-width:1em;text-align:center}
#tut .tx{font-family:"Trebuchet MS",Arial,sans-serif;font-weight:bold;font-size:calc(var(--u,12px)*.9);white-space:nowrap}
#tut .sk{pointer-events:auto;font-family:inherit;font-size:calc(var(--u,12px)*.85);padding:2px calc(var(--u,12px)*.6);border:2px solid #111;background:#111;color:#fff;
  box-shadow:2px 2px 0 #111;cursor:pointer;margin:0 0 0 calc(var(--u,12px)*.3);transform:none}
#tut .sk:active{transform:translate(2px,2px);box-shadow:none}
#tut .dots{display:flex;gap:4px;justify-content:center;margin-top:5px}
#tut .dots i{width:8px;height:8px;background:#fff;border:2px solid #111;transform:skewX(-8deg)}
#tut .dots i.d{background:#111}
#tut .dots i.c{background:#ff3b47}
#tut.pop .tb{animation:tutPop .32s cubic-bezier(.2,1.6,.4,1)}
@keyframes tutPop{0%{transform:skewX(-8deg) scale(.6);opacity:0}100%{transform:skewX(-8deg) scale(1);opacity:1}}
@media (max-height:560px){#tut{top:calc(var(--u,12px)*7.4)}#tut .tx{display:none}}
@media (prefers-reduced-motion:reduce){#tut,#tut .tb{transition:none}#tut.pop .tb{animation:none}}
`;

const store = {
  get() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } },
  set() { try { localStorage.setItem(KEY, '1'); } catch { /* storage blocked in iframe: ignore */ } },
};

export function createTutorial({ isTouch = false, onDone = () => {} } = {}) {
  let root = null, idx = 0, okAt = 0, finished = false;
  const seen = Object.create(null);

  function mount() {
    if (!document.getElementById('tutCss')) {
      const s = document.createElement('style'); s.id = 'tutCss'; s.textContent = CSS; document.head.append(s);
    }
    root = document.createElement('div'); root.id = 'tut'; root.className = 'hide';
    root.innerHTML = '<div class="tb"><span class="st"></span><span class="ti"></span><span class="ks"></span><span class="tx"></span>'
      + '<button class="sk" type="button">SKIP ✕</button></div><div class="dots">' + STEPS.map(() => '<i></i>').join('') + '</div>';
    const sk = root.querySelector('.sk');
    const stop = e => { e.stopPropagation(); };
    sk.addEventListener('pointerdown', stop); sk.addEventListener('touchstart', stop, { passive: true });
    sk.addEventListener('click', e => { e.stopPropagation(); api.skip(); });
    (document.getElementById('hud') || document.body).append(root);
  }

  function render() {
    const s = STEPS[idx];
    root.querySelector('.st').textContent = `${idx + 1}/${STEPS.length}`;
    root.querySelector('.ti').textContent = s.title;
    const keys = isTouch ? [s.touch] : s.pc;
    root.querySelector('.ks').innerHTML = keys.map(k => `<kbd>${k}</kbd>`).join('');
    root.querySelector('.tx').textContent = isTouch ? s.touchTxt : s.pcTxt;
    root.querySelectorAll('.dots i').forEach((d, j) => { d.className = j < idx ? 'd' : j === idx ? 'c' : ''; });
    root.classList.remove('ok', 'pop'); void root.offsetWidth; root.classList.add('pop');
  }

  function end(skipped) {
    if (finished) return;
    finished = true; api.active = false; store.set();
    if (root) {
      root.classList.add('hide');
      const r = root; setTimeout(() => r.remove(), 300); root = null;
    }
    try { onDone({ skipped }); } catch (e) { console.warn('tutorial onDone', e); }
  }

  const api = {
    active: false,
    /** Show the coach if not completed before. Pass { force: true } to replay. Returns true if shown. */
    start({ force = false } = {}) {
      if (api.active) return true;
      if (!force && store.get()) return false;
      finished = false; idx = 0; okAt = 0; for (const k in seen) delete seen[k];
      if (!root) mount();
      api.active = true; render();
      requestAnimationFrame(() => root && root.classList.remove('hide'));
      return true;
    },
    /** Call every frame with this frame's input booleans. */
    update(state = {}) {
      if (!api.active || !root) return;
      for (const s of STEPS) if (state[s.id]) seen[s.id] = true;
      const now = performance.now();
      if (okAt) {
        if (now - okAt < DONE_HOLD) return;
        okAt = 0; idx++;
        if (idx >= STEPS.length) { end(false); return; }
        render();
      }
      if (seen[STEPS[idx].id]) { okAt = now; root.classList.add('ok'); root.querySelector('.tx').textContent = 'NICE!'; }
    },
    skip() { if (api.active) end(true); },
    /** Hide/show without losing progress (e.g. pause menu). */
    visible(on) { if (root) root.classList.toggle('hide', !on); },
    get step() { return api.active ? STEPS[idx].id : null; },
  };
  return api;
}

export const tutorialDone = () => store.get();
export const resetTutorial = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };
