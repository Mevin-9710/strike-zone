// Anonymous gameplay telemetry -> Supabase REST (insert-only table, see supabase/telemetry.sql).
// No personal data: a random per-tab session id, device class, and game events. No-op until URL/KEY are set
// (here or via window.SZ_TELEMETRY = { url, key }), and always off in ?test=1.
const CFG = Object.assign({ url: 'https://tzpebjsikktsqlzqlemb.supabase.co',   // public anon key: insert-only table, RLS blocks reads
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6cGVianNpa2t0c3FsenFsZW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0ODk2MTcsImV4cCI6MjExMDA2NTYxN30.tRAsW47PooyFklDqvLQCKEQ-jSof7htupS3BZLOe5Ws' }, window.SZ_TELEMETRY || {});
const ON = !!(CFG.url && CFG.key) && !/[?&]test=1/.test(location.search);
const T = window.__szT || {};                       // set by the inline <head> script: same session id as the 'page' event
const sid = T.sid || Math.random().toString(36).slice(2, 10);
const t0 = 0, jsAt = performance.now();               // t = seconds since page open (navigation start)
const dev = T.dev || ((matchMedia('(pointer:coarse)').matches ? 'touch' : 'desk') + (innerWidth < innerHeight ? '-p' : '-l'));
T.js = true; T.stage = 'js';
export const stage = s => { T.stage = s; };
let q = [], where = 'boot';
export const at = w => { where = w; };
let quitInfo = () => ({});
export const onQuit = fn => { quitInfo = fn; };      // game supplies a live snapshot for the quit event                // last known place, sent with 'quit'

export function flush(beacon) {
  if (!ON || !q.length) return;
  const body = JSON.stringify(q); q = [];
  try {
    fetch(`${CFG.url}/rest/v1/events`, { method: 'POST', keepalive: !!beacon, body,
      headers: { apikey: CFG.key, Authorization: `Bearer ${CFG.key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' } }).catch(() => {});
  } catch (e) { /* never break the game */ }
}
if (ON) {
  setInterval(flush, 10000);
  addEventListener('pagehide', () => { let x = {}; try { x = quitInfo(); } catch (e) { /* ignore */ } track('quit', { where, ...x }); flush(true); });
  // device + context, once per session
  queueMicrotask(() => {
    let gpu = ''; try { const gl = document.createElement('canvas').getContext('webgl'), ext = gl?.getExtension('WEBGL_debug_renderer_info'); gpu = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '').slice(0, 60); } catch (e) { /* none */ }
    let first = null; try { first = localStorage.getItem('sz_first'); if (!first) localStorage.setItem('sz_first', first = new Date().toISOString().slice(0, 10)); } catch (e) { /* blocked */ }
    const ua = navigator.userAgent, br = /Edg\//.test(ua) ? 'edge' : /OPR|Opera/.test(ua) ? 'opera' : /Firefox/.test(ua) ? 'firefox' : /CriOS|Chrome/.test(ua) ? 'chrome' : /Safari/.test(ua) ? 'safari' : 'other';
    const os = /Android/.test(ua) ? 'android' : /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Windows/.test(ua) ? 'windows' : /Mac/.test(ua) ? 'mac' : /CrOS/.test(ua) ? 'chromeos' : /Linux/.test(ua) ? 'linux' : 'other';
    let ref = ''; try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) { /* none */ }
    track('ctx', { js: Math.round(jsAt / 100) / 10, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, gpu, mem: navigator.deviceMemory || 0, cores: navigator.hardwareConcurrency || 0, br, os,
      lang: navigator.language, ref, iframe: window !== top, first, ret: first !== new Date().toISOString().slice(0, 10), prog: +(localStorage.getItem('sz_progress') || 0) });
  });
  // JS errors (first 5) and which buttons get pressed (first 80)
  let nErr = 0, nUi = 0;
  addEventListener('error', e => { if (nErr++ < 5) track('err', { m: String(e.message).slice(0, 120), at: `${(e.filename || '').split('/').pop()}:${e.lineno}` }); });
  addEventListener('unhandledrejection', e => { if (nErr++ < 5) track('err', { m: String(e.reason?.message || e.reason).slice(0, 120), at: 'promise' }); });
  document.addEventListener('click', e => { const b = e.target.closest?.('button'); if (b && nUi++ < 80) track('ui', { id: b.id || b.textContent.trim().slice(0, 16), where }); }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(true); });
}

// ev: short name; data: small flat object. t = seconds since page open.
export function track(ev, data = {}) {
  if (!ON) return;
  q.push({ sid, dev, ev, t: Math.round((performance.now() - t0) / 100) / 10, data });
  if (q.length >= 20) flush();
}
export const telemetryOn = ON;
