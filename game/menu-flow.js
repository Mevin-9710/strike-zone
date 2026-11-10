// Play flow: Mode -> Mission -> Agent -> Loadout -> Deploy. One step visible at a time, Back/Esc go back.
// DOM-only; game.js supplies hooks. Story agent hooks: #briefExtra, events 'sz:brief' / 'sz:deploy' (dispatched by game.js).
const STEPS = [['mode', 'MODE'], ['mission', 'MISSION'], ['agent', 'AGENT'], ['loadout', 'LOADOUT']];
export function createFlow({ $, skip, onExit, onEnter }) {
  let stack = [];          // visited steps (current on top)
  const cur = () => stack[stack.length - 1];
  function show(step) {
    stack.push(step);
    document.querySelectorAll('#briefCard .step').forEach(s => s.classList.toggle('show', s.id === 'step' + step[0].toUpperCase() + step.slice(1)));
    const live = STEPS.filter(([id]) => !skip(id)), i = live.findIndex(([id]) => id === step);
    $('stepTitle').textContent = STEPS.find(([id]) => id === step)[1];
    $('stepPips').textContent = `${i + 1} / ${live.length}`;
    const last = step === 'loadout';
    $('briefNext').style.display = last || step === 'mode' ? 'none' : 'inline-block';
    $('start').style.display = last ? '' : 'none';
    onEnter?.(step);
  }
  function next() {
    let i = STEPS.findIndex(([id]) => id === cur());
    while (++i < STEPS.length && skip(STEPS[i][0]));
    if (i < STEPS.length) show(STEPS[i][0]);
  }
  function back() { if (stack.length > 1) { stack.pop(); const s = stack.pop(); show(s); } else { stack = []; onExit(); } }
  $('briefNext').onclick = next; $('briefBack').onclick = back;
  document.addEventListener('keydown', e => {
    if (e.code !== 'Escape' || !$('brief').classList.contains('show') || $('settings')?.classList.contains('show')) return;
    back();
  });
  return { open(step = 'mode') { stack = []; show(skip(step) ? 'loadout' : step); }, next, back, cur };
}
