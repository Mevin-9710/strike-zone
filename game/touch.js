// Touch controls (phones in landscape + tablets): floating move stick on the left half, drag to look on the
// right half, minimal buttons. The game reads the state each frame; pulses (jump, ability, swap) are consumed.
export const isTouchDevice = () => new URLSearchParams(location.search).has('touch') ||
  (matchMedia('(pointer: coarse)').matches && ('ontouchstart' in window || navigator.maxTouchPoints > 0));

export class TouchControls {
  constructor(root, settings) {
    this.s = settings;
    this.move = { x: 0, y: 0 }; this.look = { x: 0, y: 0 };
    this.fire = false; this.aim = false; this.use = false; this.pulses = new Set();
    this.el = document.createElement('div'); this.el.id = 'touch'; root.append(this.el);
    this.el.innerHTML = `
      <div id="tstick"><div id="tknob"></div></div>
      <button class="tb" id="tfire" data-k="fire">FIRE</button>
      <button class="tb" id="taim" data-k="aim">AIM</button>
      <button class="tb" id="tjump" data-k="jump">JUMP</button>
      <button class="tb" id="treload" data-k="reload">RELOAD</button>
      <button class="tb ab" id="tab0" data-k="ab0">Q</button>
      <button class="tb ab" id="tab1" data-k="ab1">F</button>
      <button class="tb" id="tuse" data-k="use">DEFUSE</button>
      <button class="tb sm" id="tpause" data-k="pause">II</button>
      <button class="tb sm" id="tspray" data-k="spray">✎</button>`;
    this.stick = this.el.querySelector('#tstick'); this.knob = this.el.querySelector('#tknob');
    this.touches = new Map();          // id -> {role, x, y, ox, oy}
    const opts = { passive: false };
    this.el.addEventListener('touchstart', e => this.start(e), opts);
    this.el.addEventListener('touchmove', e => this.moveT(e), opts);
    this.el.addEventListener('touchend', e => this.end(e), opts);
    this.el.addEventListener('touchcancel', e => this.end(e), opts);
    this.applySettings();
  }
  applySettings() {
    this.el.style.setProperty('--ts', this.s.btnSize);
    this.el.style.setProperty('--to', this.s.btnOpacity);
  }
  show(on) { this.el.classList.toggle('on', on); if (!on) this.reset(); }
  reset() { this.move.x = this.move.y = 0; this.fire = this.use = false; this.touches.clear(); this.stick.classList.remove('on'); }
  setUse(label) { const b = this.el.querySelector('#tuse'); b.style.display = label ? 'block' : 'none'; if (label) b.textContent = label; if (!label) this.use = false; }
  setAbilities(names) { names.forEach((n, i) => { const b = this.el.querySelector('#tab' + i); if (b) b.textContent = n; }); }
  setCooldowns(cds) { cds.forEach((c, i) => { const b = this.el.querySelector('#tab' + i); if (b) b.classList.toggle('cd', c > 0); }); }
  take(k) { const had = this.pulses.has(k); this.pulses.delete(k); return had; }
  start(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const btn = t.target.closest?.('.tb');
      if (btn) {
        const k = btn.dataset.k; btn.classList.add('down');
        if (k === 'fire') { this.fire = true; this.touches.set(t.identifier, { role: 'firelook', x: t.clientX, y: t.clientY, btn }); }
        else if (k === 'use') { this.use = true; this.touches.set(t.identifier, { role: 'use', btn }); }
        else { this.pulses.add(k); if (k === 'aim') this.aim = !this.aim; this.touches.set(t.identifier, { role: 'btn', btn }); }
        continue;
      }
      if (t.clientX < innerWidth * 0.42) {                     // floating stick
        this.touches.set(t.identifier, { role: 'stick', ox: t.clientX, oy: t.clientY });
        this.stick.style.left = `${t.clientX}px`; this.stick.style.top = `${t.clientY}px`; this.stick.classList.add('on');
        this.knob.style.transform = 'translate(-50%,-50%)';
      } else {
        // a tap on the weapon panel swaps weapons
        const wep = document.getElementById('wep')?.getBoundingClientRect();
        if (wep && t.clientX >= wep.left && t.clientX <= wep.right && t.clientY >= wep.top && t.clientY <= wep.bottom) this.pulses.add('swap');
        this.touches.set(t.identifier, { role: 'look', x: t.clientX, y: t.clientY });
      }
    }
  }
  moveT(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const s = this.touches.get(t.identifier); if (!s) continue;
      if (s.role === 'stick') {
        const R = 55 * this.s.btnSize; let dx = t.clientX - s.ox, dy = t.clientY - s.oy; const l = Math.hypot(dx, dy);
        if (l > R) { dx *= R / l; dy *= R / l; }
        this.move.x = dx / R; this.move.y = dy / R;
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else if (s.role === 'look' || s.role === 'firelook') {
        this.look.x += t.clientX - s.x; this.look.y += t.clientY - s.y; s.x = t.clientX; s.y = t.clientY;
      }
    }
  }
  end(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const s = this.touches.get(t.identifier); if (!s) continue;
      this.touches.delete(t.identifier); s.btn?.classList.remove('down');
      if (s.role === 'stick') { this.move.x = this.move.y = 0; this.stick.classList.remove('on'); }
      if (s.role === 'firelook') this.fire = false;
      if (s.role === 'use') this.use = false;
    }
  }
  takeLook() { const l = { x: this.look.x, y: this.look.y }; this.look.x = this.look.y = 0; return l; }
}

export const TOUCH_CSS = `
#touch{position:fixed;inset:0;display:none;z-index:5;touch-action:none;--ts:1;--to:.8}
#touch.on{display:block}
#tstick{position:fixed;width:calc(120px*var(--ts));height:calc(120px*var(--ts));margin:calc(-60px*var(--ts)) 0 0 calc(-60px*var(--ts));border:3px solid #111;border-radius:50%;background:rgba(255,210,59,.18);display:none;pointer-events:none}
#tstick.on{display:block}
#tknob{position:absolute;left:50%;top:50%;width:46%;height:46%;border-radius:50%;background:#ffd23b;border:3px solid #111;transform:translate(-50%,-50%)}
#touch .tb{position:fixed;opacity:var(--to);width:calc(64px*var(--ts));height:calc(64px*var(--ts));border-radius:50%;padding:0;margin:0;font-size:calc(14px*var(--ts));transform:none;box-shadow:3px 3px 0 #111;touch-action:none}
#touch .tb.down{background:#111;color:#ffd23b}
#tfire{right:calc(18px + 7vw);bottom:calc(46vh);width:calc(84px*var(--ts))!important;height:calc(84px*var(--ts))!important;background:#ff3b47;color:#fff}
#taim{right:calc(24px);bottom:calc(46vh + 70px*var(--ts))}
#tjump{right:calc(24px);bottom:calc(24vh)}
#treload{right:calc(28px + 76px*var(--ts));bottom:calc(46vh + 60px*var(--ts));font-size:calc(11px*var(--ts))!important}
#tab0{right:calc(28px + 76px*var(--ts));bottom:calc(24vh - 20px*var(--ts))}
#tab1{right:calc(28px + 76px*var(--ts) * 2);bottom:calc(24vh - 30px*var(--ts))}
#touch .tb.ab.cd{opacity:calc(var(--to)*.45)}
#tuse{right:calc(30vw);bottom:calc(30vh);width:calc(96px*var(--ts))!important;height:calc(96px*var(--ts))!important;background:#ffd23b;display:none;font-size:calc(15px*var(--ts))}
#touch .tb.sm{width:calc(40px*var(--ts));height:calc(40px*var(--ts));top:calc(var(--u)*15);left:calc(var(--u)*1.2);right:auto;bottom:auto}
#touch #tspray{top:calc(var(--u)*15 + 52px*var(--ts))}
body.touch #brief .help{display:none}
body.touch #abil{display:none}
body.touch #prompt{top:auto;bottom:calc(30vh + 110px)}
/* portrait play: thumbs sit low, buttons stack up the right edge */
@media (orientation:portrait){
#tfire{bottom:calc(16vh)}#taim{bottom:calc(16vh + 92px*var(--ts))}#treload{bottom:calc(16vh + 96px*var(--ts))}
#tjump{bottom:calc(6vh)}#tab0{bottom:calc(30vh + 70px*var(--ts))}#tab1{bottom:calc(30vh + 70px*var(--ts));right:calc(28px + 76px*var(--ts))!important}
#tab0{right:calc(24px)}#tuse{right:calc(34vw);bottom:calc(34vh)}
body.touch #prompt{bottom:calc(36vh + 80px)}
body.touch #mmp{transform:scale(.62);transform-origin:top left}
body.touch #objp{left:auto!important;right:calc(var(--u)*.6);transform:scale(.85);transform-origin:top right}
body.touch #tut{top:calc(var(--u)*21)!important;transform:translateX(-50%) scale(.82)}
body.touch #wep{bottom:auto!important;top:calc(var(--u)*11);transform:scale(.8);transform-origin:top right}
body.touch #vit{transform:scale(.85);transform-origin:bottom left}
}
`;
