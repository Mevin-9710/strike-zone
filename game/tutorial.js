// Guided first-mission tutorial: a mentor (Amara) talks the player through every control, demonstrates each
// ability, then fights beside them and walks them to the objective. Comic HUD panel: yellow, ink outline, Impact.
// Usage (game.js):
//   const tut = createTutorial({ isTouch, hooks, onDone: ({ skipped }) => {} });
//   tut.start({ force })            -> false if already completed (unless force)
//   every frame: tut.update(dt, S)  S = per-frame input/state flags (see STEPS[].need); reuse one object.
//   tut.hold                        -> true while the world (enemies + timer) should stay frozen
//   tut.skip() / Backspace / SKIP button end it. Completion persists in localStorage 'sz_tutorial_done'.
// hooks: say(who, text) · demo(slot) mentor shows ability · onStep(id) per-step setup · abilityName(slot)
// Steps only accept input after the mentor's intro (and demo) so each action is done on cue.
// Only transform/opacity animate (cheap on low-end GPUs); prefers-reduced-motion disables motion.

const KEY = 'sz_tutorial_done';
const DONE_HOLD = 650;     // ms the green "NICE!" state shows before advancing


const MENTOR = 'AMARA';
// need(S, m): S = frame state from game.js; m = per-step scratch (reset on entry). wait = seconds before input counts.
export const STEPS = [
  { id: 'look', title: 'LOOK', pc: ['MOUSE'], touch: ['DRAG RIGHT'], tx: 'look around', wait: 1.6,
    say: "Voss, this is Amara. Okonkwo asked me to walk you in. Look around first.", need: (S, m) => (m.a = (m.a || 0) + S.look) > 1.2 },
  { id: 'move', title: 'MOVE', pc: ['W', 'A', 'S', 'D'], touch: ['LEFT STICK'], tx: 'move', say: 'Good. Now move.', need: (S, m) => (m.t = (m.t || 0) + (S.moved ? S.dt : 0)) > 0.8 },
  { id: 'fire', title: 'SHOOT', pc: ['LMB'], touch: ['FIRE'], tx: 'fire at a wall', say: 'Weapons hot. Put a few rounds into that wall.', need: S => S.fired },
  { id: 'fight', title: 'FIGHT', pc: ['TAKE OUT 2'], touch: ['TAKE OUT 2'], tx: 'hostiles, together', wait: 0.5, timeout: 45,
    say: "Covenant heard us. They're coming. Stay close and shoot what I shoot!", need: S => S.kills >= 2 },
  { id: 'reload', title: 'RELOAD', pc: ['R'], touch: ['RELOAD'], tx: 'reload', say: 'Nice work. Reload now, while it is quiet.', need: S => S.reloaded },
  { id: 'defuse', title: 'DEFUSE', pc: ['HOLD E'], touch: ['HOLD USE'], tx: 'at the device', wait: 0.5,
    say: 'Follow the marker to the device. Hold E to cut the wires. I have your back.', need: S => S.interacting },
];
const DEMO_LINE = { smoke: 'Watch. Smoke blocks sight lines.', flash: 'Eyes away! Flash blinds anyone facing it.', dash: 'Dash: a burst of speed. In and out.',
  sensor: 'Sensor reveals hostiles nearby.', shield: 'Shield soaks damage for a few seconds.', decoy: 'Decoy draws their fire.', lockdown: 'Lockdown slows anyone inside.', drone: 'Drone scouts ahead and marks targets.' };
const SAY_GAP = 0.15;
const HL = { jump: { touch: '#tjump' }, fire: { touch: '#tfire' }, aim: { touch: '#taim' }, reload: { pc: '#ammo', touch: '#treload' },
  swap: { pc: '#wep', touch: '#wep' }, ab0: { pc: '#ab0', touch: '#tab0' }, ab1: { pc: '#ab1', touch: '#tab1' }, defuse: { pc: '#prompt', touch: '#tuse' } };
const HL_CSS = `.tut-hl{animation:tutHl 1s ease-in-out infinite!important;outline:3px solid #ffd23b!important;outline-offset:3px}
@keyframes tutHl{0%,100%{box-shadow:0 0 0 0 rgba(255,210,59,.9),3px 3px 0 #111}50%{box-shadow:0 0 0 12px rgba(255,210,59,0),3px 3px 0 #111}}
@media (prefers-reduced-motion:reduce){.tut-hl{animation:none!important}}`;

const CSS = `
#tut{position:fixed;left:50%;top:calc(var(--u,12px)*8.2);z-index:30;pointer-events:none;transform:translateX(-50%);
  font-family:Impact,"Haettenschweiler","Arial Narrow Bold",sans-serif;color:#111;transition:opacity .25s,transform .25s}
#tut.hide{opacity:0;transform:translateX(-50%) translateY(-12px)}
#tut .tb{background:#ffd23b;border:3px solid #111;box-shadow:4px 4px 0 #111;transform:skewX(-8deg);display:flex;align-items:center;
  gap:calc(var(--u,12px)*.7);padding:calc(var(--u,12px)*.35) calc(var(--u,12px)*.5) calc(var(--u,12px)*.35) calc(var(--u,12px)*.8);transition:background .15s}
#tut .tb>*{transform:skewX(8deg)}
#tut.ok .tb{background:#3ddc84}
#tut.wait .ks{opacity:.45}
#tut .ks{transition:opacity .2s}
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

export function createTutorial({ isTouch = false, hooks = {}, onDone = () => {} } = {}) {
  let root = null, idx = 0, okT = -1, finished = false, t = 0, readyAt = 0, demoAt = -1, m = {}, steps = STEPS;
  const say = (who, txt) => { try { hooks.say?.(who, txt); } catch (e) { console.warn('tutorial say', e); } };
  const onKey = e => { if (api.active && e.code === 'Backspace') { e.preventDefault(); api.skip(); } };

  function mount() {
    if (!document.getElementById('tutCss')) {
      const s = document.createElement('style'); s.id = 'tutCss'; s.textContent = CSS + HL_CSS; document.head.append(s);
    }
    root = document.createElement('div'); root.id = 'tut'; root.className = 'hide';
    root.innerHTML = '<div class="tb"><span class="st"></span><span class="ti"></span><span class="ks"></span><span class="tx"></span>'
      + `<button class="sk" type="button">SKIP${isTouch ? '' : ' <small>⌫</small>'} ✕</button></div><div class="dots">` + steps.map(() => '<i></i>').join('') + '</div>';
    const sk = root.querySelector('.sk');
    const stop = e => { e.stopPropagation(); };
    sk.addEventListener('pointerdown', stop); sk.addEventListener('mousedown', stop); sk.addEventListener('touchstart', stop, { passive: true });
    sk.addEventListener('click', e => { e.stopPropagation(); api.skip(); });
    (document.getElementById('hud') || document.body).append(root);
    addEventListener('keydown', onKey, true);
  }
  const abName = s => (s.ab !== undefined && hooks.abilityName?.(s.ab)) || '';
  function render() {
    const s = steps[idx], name = abName(s);
    root.querySelector('.st').textContent = `${idx + 1}/${steps.length}`;
    root.querySelector('.ti').textContent = name ? name.toUpperCase() : s.title;
    root.querySelector('.ks').innerHTML = (isTouch ? s.touch || s.pc : s.pc).map(k => k === '+' ? '+' : `<kbd>${k}</kbd>`).join('');
    root.querySelector('.tx').textContent = t < readyAt ? (s.demo !== undefined ? `watch ${MENTOR.charAt(0) + MENTOR.slice(1).toLowerCase()}…` : '…') : s.tx || (name ? `use ${name}` : '');
    root.querySelectorAll('.dots i').forEach((d, j) => { d.className = j < idx ? 'd' : j === idx ? 'c' : ''; });
    root.classList.toggle('wait', t < readyAt);
  }
  let hlEls = [];
  function clearHl() { for (const e of hlEls) e.classList.remove('tut-hl'); hlEls = []; }
  function highlight(s) {
    clearHl(); const sel = HL[s.id]?.[isTouch ? 'touch' : 'pc'];
    for (const e of [sel && document.querySelector(sel), root?.querySelector('.ks')]) if (e) { e.classList.add('tut-hl'); hlEls.push(e); }
  }
  function enter(i) {
    idx = i; okT = -1; m = {};
    const s = steps[idx];
    try { hooks.onStep?.(s.id, s); } catch (e) { console.warn('tutorial onStep', e); }
    api.hold = s.id !== 'fight' && s.id !== 'defuse';
    const name = abName(s);
    if (s.demo !== undefined) {
      say(MENTOR, DEMO_LINE[hooks.abilityKind?.(s.demo)] || `Watch my ${name}.`);
      demoAt = t + 0.9; readyAt = t + 3.0;
    } else { if (s.say) say(MENTOR, s.say); demoAt = -1; readyAt = t + (s.wait ?? SAY_GAP); }
    render(); highlight(s); root.classList.remove('ok', 'pop'); void root.offsetWidth; root.classList.add('pop');
  }
  function end(skipped) {
    if (finished) return;
    finished = true; api.active = false; api.hold = false; store.set(); clearHl();
    removeEventListener('keydown', onKey, true);
    if (root) { root.classList.add('hide'); const r = root; setTimeout(() => r.remove(), 300); root = null; }
    try { onDone({ skipped }); } catch (e) { console.warn('tutorial onDone', e); }
  }

  const api = {
    active: false, hold: false,
    /** Start if not completed before (or { force: true } to replay). Returns true if shown. */
    start({ force = false } = {}) {
      if (api.active) return true;
      if (!force && store.get()) return false;
      steps = isTouch ? STEPS.filter(s => !s.pcOnly) : STEPS;
      finished = false; t = 0; if (root) root.remove(); mount();
      api.active = true; enter(0);
      requestAnimationFrame(() => root && root.classList.remove('hide'));
      return true;
    },
    /** Call every frame (dt seconds) with this frame's state flags. */
    update(dt, S) {
      if (!api.active || !root) return;
      t += dt;
      const s = steps[idx];
      if (demoAt >= 0 && t >= demoAt) { demoAt = -1; try { hooks.demo?.(s.demo); } catch (e) { console.warn('tutorial demo', e); } }
      if (okT >= 0) {
        if (t - okT < DONE_HOLD / 1000) return;
        if (idx + 1 >= steps.length) { end(false); return; }
        enter(idx + 1); return;
      }
      if (t < readyAt) return;
      if (root.classList.contains('wait')) render();
      const done = s.timed ? t - readyAt >= s.timed : s.timeout && t - readyAt >= s.timeout ? true : s.need(S, m);
      if (done) { clearHl(); okT = t; root.classList.add('ok'); root.querySelector('.tx').textContent = 'NICE!'; }
    },
    skip() { if (api.active) end(true); },
    /** Mission ended mid-tutorial (death / quit): tear down without marking it completed. */
    abort() {
      if (!api.active) return; finished = true; api.active = false; api.hold = false; clearHl(); removeEventListener('keydown', onKey, true);
      if (root) { root.remove(); root = null; }
    },
    /** Hide/show without losing progress (e.g. pause menu). */
    visible(on) { if (root) root.classList.toggle('hide', !on); },
    get highlighted() { return hlEls.map(e => e.id || e.className); },
    get step() { return api.active ? steps[idx].id : null; },
    get steps() { return steps.map(s => s.id); },
  };
  return api;
}

export const tutorialDone = () => store.get();
export const resetTutorial = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };
