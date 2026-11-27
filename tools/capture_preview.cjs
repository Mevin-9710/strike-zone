// CrazyGames preview video capture (headless, offline-rendered so the clip is smooth on any GPU).
// Serve the repo on :8765 (python3 tools/serve.py), then:
//   node tools/capture_preview.cjs <out_dir> <width> <height> [scenes=lantern,neon,belltower] [secs=6]
// Writes <out_dir>/<scene>.mp4 (30 fps, H.264, no audio). tools/make_preview.sh cuts them into the portal videos.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const [out = 'media/raw/preview', W = '1920', H = '1080', scenesArg = 'lantern,neon,belltower', secsArg = '6'] = process.argv.slice(2);
const MAPS = { belltower: 0, lantern: 1, neon: 2 };
const PRIMARY = { lantern: 'ar7_lance', neon: 'kestrel_bp', belltower: 'grinder_lmg' };
fs.mkdirSync(out, { recursive: true });

const HELPERS = () => {
  window.__bot = { on: false, t: 0 };
  window.__botTick = (dt) => {
    const b = window.__bot, g = window.__game; if (!b.on) return;
    b.t += dt; const P = g.player; P.hp = Math.max(P.hp, 85);
    let best = null, bd = 1e9;
    for (const e of g.enemies) if (e.alive) { const d = e.pos.distanceTo(P.pos); if (d < bd) { bd = d; best = e; } }
    if (!best) { g.mouse('l', false); g.key('KeyW', true); return; }
    const tx = best.pos.x, ty = best.pos.y + 1.45, tz = best.pos.z, ey = P.pos.y + 1.6;
    const wy = Math.atan2(-(tx - P.pos.x), -(tz - P.pos.z)), wp = Math.atan2(ty - ey, Math.hypot(tx - P.pos.x, tz - P.pos.z));
    let dy = wy - P.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); const k = 1 - Math.exp(-dt * 9);
    P.yaw += dy * k; P.pitch += (wp - P.pitch) * k;
    g.mouse('l', Math.abs(dy) < 0.06 && bd < 45);
    g.key('KeyW', bd > 14); g.key('KeyA', Math.sin(b.t * 1.1) > 0.8); g.key('KeyD', Math.sin(b.t * 1.1) < -0.8);
  };
  window.__frame = (fps, q) => { window.__botTick(1 / fps); window.__game.step(1 / fps, fps); return document.querySelector('canvas').toDataURL('image/jpeg', q); };
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, hasTouch: false });
  await ctx.addInitScript(() => { if (sessionStorage.getItem('seed')) return; sessionStorage.setItem('seed', 1); localStorage.clear();
    Object.entries({ sz_onboard_done: '1', sz_tutorial_done: '1', sz_progress: '4', sz_settings: '{"quality":"high"}' }).forEach(([k, v]) => localStorage.setItem(k, v)); });
  await ctx.addInitScript(HELPERS);
  const pg = await ctx.newPage(); pg.on('pageerror', (e) => console.log('pageerror', String(e)));
  await pg.goto('http://localhost:8765/index.html?test=1');
  await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
  const fps = 30, secs = +secsArg;
  for (const sc of scenesArg.split(',')) {
    const t0 = Date.now();
    await pg.evaluate(async (id) => { const m = await import('./world/dm-maps.js'); await m.loadDmMap(id); }, sc);
    await pg.evaluate(([m, gun]) => { const g = __game; g.start(0, { mode: 'dm', dmMap: m, primary: gun }); g.auto?.();
      document.querySelectorAll('.toast,#hint,#ctlCard,#coach,.coach,#gate,#clickGate').forEach((n) => n.style.display = 'none');
      // pre-roll with the bot driving until a red is close and in front, so the clip opens on a fight
      Object.assign(window.__bot, { on: true, t: 0 });
      for (let i = 0; i < 90; i++) { window.__botTick(0.2); g.step(0.2, 30);
        const P = g.player; const near = g.enemies.some((e) => e.alive && e.pos.distanceTo(P.pos) < 15); if (near && i > 40) break; }
      Object.assign(window.__bot, { on: true, t: 0 }); g.step(0.1, 30); }, [MAPS[sc], PRIMARY[sc]]);
    const dir = path.join(out, 'f_' + sc); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const n = Math.round(secs * fps);
    for (let i = 0; i < n; i++) { await pg.evaluate((f) => { window.__botTick(1 / f); window.__game.step(1 / f, f); }, fps); await pg.screenshot({ path: path.join(dir, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 }); }
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(fps), '-i', path.join(dir, '%05d.jpg'), '-c:v', 'libx264', '-crf', '15', '-preset', 'medium', '-pix_fmt', 'yuv420p', path.join(out, sc + '.mp4')]);
    fs.rmSync(dir, { recursive: true, force: true });
    await pg.evaluate(() => { window.__bot.on = false; __game.mouse('l', false); for (const k of ['KeyW', 'KeyA', 'KeyD']) __game.key(k, false); });
    console.log(sc, n, 'frames', ((Date.now() - t0) / 1000).toFixed(0), 's');
  }
  await b.close();
})();
