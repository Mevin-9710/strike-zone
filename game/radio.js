// Radio subtitle queue + briefing/debrief rendering. Event-driven; update(dt) is allocation-free when idle.
//   radio.say(who, text, dur?)        queue a non-blocking subtitle (portrait + name)
//   radio.once(key, lines)            say lines once per mission (reset() clears the set)
//   radio.event(missionId, key)       say STORY[missionId].ev[key] once (enemy types, 'hurt', 'half', 'last'...)
//   radio.addSpeaker(id, {name,role,color,glyph})
//   radio.clear() / reset()           drop queue / new mission
//   radio.briefing(el, missionId)     fill an element with portrait lines
//   radio.debrief(el, missionId, win) fill an element with win/lose lines
import { SPEAKERS, STORY, FALLBACK } from './story-data.js';

const CSS = `
#radio{align-items:stretch}
#radio .por{width:calc(var(--u)*3);min-width:calc(var(--u)*3);border:3px solid var(--ink);display:grid;place-items:center;font-size:calc(var(--u)*1.6);color:#111;margin-right:-3px;text-shadow:none}
#radio .who small{display:block;font-size:.55em;opacity:.7}
.sline{font-size:.78em;display:flex;gap:calc(var(--u,12px)*.6);align-items:flex-start;margin:.4em 0;font-family:"Trebuchet MS",Arial,sans-serif;font-weight:bold}
.sline .por{flex:0 0 auto;width:2.4em;height:2.4em;border:3px solid #111;display:grid;place-items:center;color:#111;font-size:1em}
.sline .bub{background:rgba(17,17,17,.85);color:#fff;padding:.3em .6em;border:3px solid #111;line-height:1.25}
.sline .bub b{display:block;font-size:.72em;letter-spacing:.06em;opacity:.8}
.sline.hero{flex-direction:row-reverse}`;
let styled = false;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sp = who => SPEAKERS[who] || (SPEAKERS[who] = { name: who, role: '', color: '#c9cfd8', glyph: (who || '?')[0] });

class Radio {
  constructor() { this.q = []; this.t = 0; this.said = {}; this.el = null; this.busy = false; this.log = []; }
  _dom() {
    if (this.el) return true;
    const el = document.getElementById('radio'); if (!el) return false;
    if (!styled) { styled = true; document.head.insertAdjacentHTML('beforeend', `<style>${CSS}</style>`); }
    this.el = el; this.rwho = document.getElementById('rwho'); this.rtxt = document.getElementById('rtxt'); this.whoBox = el.querySelector('.who');
    this.por = document.createElement('span'); this.por.className = 'por'; el.prepend(this.por);
    return true;
  }
  addSpeaker(id, def) { SPEAKERS[id] = { name: id, role: '', glyph: id[0], color: '#c9cfd8', ...def }; }
  say(who, text, dur) {
    this.q.push([who, text, dur || Math.min(7, Math.max(2.5, text.length / 14))]); this.log.push(who + ': ' + text);
    if (this.log.length > 200) this.log.shift();
    if (this.t <= 0) this._next();
  }
  once(key, lines) { if (this.said[key] || !lines) return; this.said[key] = true; for (const l of lines) this.say(l[0], l[1], l[2]); }
  event(mid, key) { const s = STORY[mid]; if (s?.ev) this.once('ev:' + key, s.ev[key]); }
  clear() { this.q.length = 0; this.t = 0; if (this._dom()) this.el.classList.remove('on'); this.busy = false; }
  reset() { this.clear(); this.said = {}; this.log.length = 0; }
  skip() { if (this.t > 0) { this.t = 0; this._next(); } }
  update(dt) { if (this.t > 0) { this.t -= dt; if (this.t <= 0) this._next(); } }
  _next() {
    const n = this.q.shift();
    if (!this._dom()) { this.t = 0; return; }
    if (!n) { this.el.classList.remove('on'); this.t = 0; this.busy = false; return; }
    const s = sp(n[0]);
    this.rwho.textContent = s.name.toUpperCase(); this.rtxt.textContent = n[1];
    this.whoBox.style.background = s.color; this.por.style.background = s.color; this.por.textContent = s.glyph;
    this.el.classList.add('on'); this.t = n[2]; this.busy = true;
  }
  _lines(lines) {
    return lines.map(([w, t]) => { const s = sp(w); return `<div class="sline${w === 'VOSS' ? ' hero' : ''}"><span class="por" style="background:${s.color}">${esc(s.glyph)}</span><span class="bub"><b>${esc(s.name.toUpperCase())}${s.role ? ' · ' + esc(s.role) : ''}</b>${esc(t)}</span></div>`; }).join('');
  }
  briefing(el, mid) { if (!this._dom()) { /* style only */ } el.innerHTML = this._lines(STORY[mid]?.briefing || FALLBACK.briefing); }
  debrief(el, mid, win) { el.innerHTML = this._lines((win ? STORY[mid]?.win : STORY[mid]?.lose) || (win ? FALLBACK.win : FALLBACK.lose)); el.style.display = ''; }
}
export const radio = new Radio();
// Fill #briefExtra whenever the UI's Mission step selects a mission (event 'sz:brief' from game.js).
document.addEventListener('sz:brief', e => { const el = document.getElementById('briefExtra'); if (el) { radio._dom(); radio.briefing(el, e.detail.mission.id); } });
