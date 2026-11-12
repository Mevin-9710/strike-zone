// Strike Zone marketing capture: drives the game in real (GPU) Google Chrome and records
// screenshots + canvas/audio clips into media/raw/. Editing is done by tools/capture_media.sh (ffmpeg).
// Usage: serve a stable snapshot on :8766, then
//   NODE_PATH=tests/node_modules node tools/capture_media.cjs [only=name,name]
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const BASE = process.env.SZ_URL || 'http://localhost:8766/index.html';
const OUT = path.join(__dirname, '..', 'media', 'raw');
fs.mkdirSync(OUT, { recursive: true });
const only = (process.argv.find(a => a.startsWith('only=')) || '').slice(5).split(',').filter(Boolean);

// In-page helpers: audio tap, recorder, and an aim/shoot bot running on rAF in real time.
const PAGE_HELPERS = () => {
  const origConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dst, ...r) {
    const out = origConnect.call(this, dst, ...r);
    if (dst instanceof AudioDestinationNode) {
      const c = dst.context; c.__tap ??= c.createMediaStreamDestination(); origConnect.call(this, c.__tap);
    }
    return out;
  };
  window.__rec = (secs) => new Promise(res => {
    const cv = document.querySelector('canvas'); const s = cv.captureStream(60);
    const tap = window.__audioCtx?.__tap; if (tap) for (const t of tap.stream.getAudioTracks()) s.addTrack(t);
    const mr = new MediaRecorder(s, { mimeType: MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.640028,mp4a.40.2') ? 'video/mp4;codecs=avc1.640028,mp4a.40.2' : 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 14e6 });
    const parts = []; mr.ondataavailable = e => e.data.size && parts.push(e.data);
    mr.onstop = async () => { const b = new Blob(parts); const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); res(btoa(s)); };
    mr.start(250); setTimeout(() => mr.stop(), secs * 1000);
  });
  window.__recAudio = (secs) => new Promise(res => {
    const tap = window.__audioCtx.__tap; const mr = new MediaRecorder(tap.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
    const parts = []; mr.ondataavailable = e => e.data.size && parts.push(e.data);
    mr.onstop = async () => { const buf = new Uint8Array(await new Blob(parts).arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); res(btoa(s)); };
    mr.start(500); setTimeout(() => mr.stop(), secs * 1000);
  });
  window.__bot = { on: false, head: true, move: true, fire: true, abil: [], t: 0 };
  window.__botTick = (dt) => {
    const b = window.__bot, g = window.__game; if (!b.on) return;
    const t0 = b.t; b.t += dt; const P = g.player; P.hp = Math.max(P.hp, 80);
    let best = null, bd = 1e9; const e0 = P.pos;
    for (const e of g.enemies) if (e.alive) { const d = e.pos.distanceTo(e0); if (d < bd) { bd = d; best = e; } }
    for (const [slot, at] of b.abil) if (t0 < at && b.t >= at) g.ability(slot);
    if (!best) { g.mouse('l', false); g.key('KeyW', false); return; }
    const tx = best.pos.x, ty = best.pos.y + (b.head ? 1.62 : 1.1), tz = best.pos.z;
    const ey = P.pos.y + 1.6, wantYaw = Math.atan2(-(tx - P.pos.x), -(tz - P.pos.z)), wantP = Math.atan2(ty - ey, Math.hypot(tx - P.pos.x, tz - P.pos.z));
    let dy = wantYaw - P.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); const k = 1 - Math.exp(-dt * 14);
    P.yaw += dy * k; P.pitch += (wantP - P.pitch) * k;
    g.mouse('l', b.fire && Math.abs(dy) < 0.05 && bd < 50);
    g.key('KeyW', b.move && bd > 16); g.key('KeyA', b.move && Math.sin(b.t * 1.3) > 0.85); g.key('KeyD', b.move && Math.sin(b.t * 1.3) < -0.85);
  };
  // offline render: advance the sim exactly 1/fps per frame, so clips are perfectly smooth even on a slow GPU
  window.__frame = (fps, q) => { const g = window.__game; window.__botTick(1 / fps); window.__pan?.(1 / fps); g.step(1 / fps, fps); return document.querySelector('canvas').toDataURL('image/jpeg', q); };
  const loop = () => { requestAnimationFrame(loop); if (window.__game?.ready && !window.__offline) window.__botTick(1 / 60); };
  requestAnimationFrame(loop);
};

const SCENES = [
  // name, mission index, weapon, abilities, seconds, ability schedule [slot, t], screenshots at t
  { name: 'm1_ar_assault', m: 0, primary: 'ar7_lance', ab: ['flash', 'dash'], secs: 14, abil: [[0, 2.5], [1, 6]] },
  { name: 'm3_lmg', m: 2, primary: 'grinder_lmg', ab: ['smoke', 'shield'], secs: 13, abil: [[1, 1.5], [0, 7]] },
  { name: 'm5_revolver_heads', m: 4, primary: 'bulldog_r6', sidearm: 'bulldog_r6', ab: ['sensor', 'dash'], secs: 12, abil: [[0, 1], [1, 5]] },
  { name: 'm7_smg', m: 6, primary: 'kestrel_bp', ab: ['drone', 'flash'], secs: 13, abil: [[0, 1.5], [1, 6]] },
  { name: 'm9_sniper', m: 8, primary: 'longshot_bolt', ab: ['decoy', 'lockdown'], secs: 12, abil: [[0, 1], [1, 4]], nomove: true },
  { name: 'm10_barrels', m: 9, primary: 'hailstorm_mg', ab: ['flash', 'smoke'], secs: 12, abil: [[0, 3]], barrels: true },
  { name: 'm12_boss', m: 11, primary: 'javelin_amr', ab: ['shield', 'dash'], secs: 15, abil: [[0, 1], [1, 7]], boss: true },
  { name: 'm11_br', m: 10, primary: 'warden_br', ab: ['lockdown', 'sensor'], secs: 12, abil: [[1, 1], [0, 5]] },
];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: false,
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required', '--window-size=1920,1130', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear(); localStorage.setItem('sz_progress', '12');
       }
  });
  await ctx.addInitScript(PAGE_HELPERS);
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('pageerror', String(e)));
  await pg.goto(`${BASE}?test=1&debug=1`);
  await pg.waitForFunction(() => window.__game?.ready && document.getElementById('lobby').classList.contains('show'), null, { timeout: 120000 });
  await pg.mouse.click(960, 540).catch(() => {});

  const shot = (n) => pg.screenshot({ path: path.join(OUT, `shot_${n}.png`) });
  const { execFileSync } = require('child_process');
  async function render(name, secs, S, each) {
    const fps = 30, n = Math.round(secs * fps), dir = `/tmp/sz-frames/${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < n; i++) {
      const url = await pg.evaluate((fps) => window.__frame(fps, 0.93), fps);
      fs.writeFileSync(`${dir}/${String(i).padStart(5, '0')}.jpg`, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
      if (each) await each(i, n);
    }
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(fps), '-i', `${dir}/%05d.jpg`, '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-pix_fmt', 'yuv420p', path.join(OUT, `clip_${name}.mp4`)]);
    fs.rmSync(dir, { recursive: true, force: true }); console.log('  rendered', name, n, 'frames');
  }
  const want = n => !only.length || only.includes(n);

  if (want('menus')) {
    await pg.waitForTimeout(2500); await shot('lobby');
    await pg.click('#lPlay').catch(() => {}); await pg.waitForTimeout(1200); await shot('menu_mode');
    await pg.click('#chapters button >> nth=2').catch(() => {}); await pg.waitForTimeout(1200); await shot('menu_missions');
    await pg.click('#briefNext').catch(() => {}); await pg.waitForTimeout(1500); await shot('menu_loadout');
    await pg.evaluate(() => __game.openLobby());
  }

  for (const S of SCENES) {
    if (!want(S.name)) continue;
    console.log('scene', S.name);
    await pg.evaluate((S) => {
      const g = __game; g.start(S.m, { primary: S.primary, sidearm: S.sidearm || 'vex_p9', abilities: S.ab, route: 'assault' }); g.auto();
      // put the player ~16 m from the nearest enemy group, facing it
      const al = g.enemies.filter(e => e.alive && (!S.boss || e.type === 'warden'));
      const tgt = (S.boss ? al.find(e => e.type === 'warden') : null) || al[Math.floor(al.length / 2)];
      if (tgt) { const p = tgt.pos; const d = S.m === 8 ? 24 : 10; let best = null;
        for (let a = 0; a < 16; a++) { const x = p.x + Math.cos(a / 16 * 6.283) * d, z = p.z + Math.sin(a / 16 * 6.283) * d; if (!best) best = [x, z]; }
        g.teleport(best[0], p.y + 0.2, best[1]); g.lookAt(p.x, p.y + 1.5, p.z); }
      if (S.barrels && g.barrels?.length) { const b = g.barrels[0]; const bp = b.pos || b.mesh?.position || b.position; if (bp) g.teleport(bp.x + 9, bp.y + 0.2, bp.z); }
      Object.assign(window.__bot, { on: false, t: 0, move: !S.nomove, abil: S.abil });
    }, S);
    await pg.evaluate(() => { window.__offline = true; window.__bot.on = true; __game.step(0.05, 60); });
    await render(S.name, S.secs, S, async (i, n) => { if (i === Math.round(n * 0.3) || i === Math.round(n * 0.55) || i === Math.round(n * 0.8)) await shot(`${S.name}_${i}`); });
    await pg.evaluate(() => { window.__bot.on = false; window.__offline = false; __game.mouse('l', false); for (const k of ['KeyW', 'KeyA', 'KeyD']) __game.key(k, false); });
  }

  if (want('ambient')) {   // slow cinematic pans for trailer B-roll (lobby backdrop + districts)
    for (const m of [3, 5, 7]) {
      await pg.evaluate((m) => { const g = __game; g.start(m, { route: 'stealth' }); g.peace(); g.auto();
        const p = g.map.points[0]; g.teleport(p.x + 14, p.y + 0.2, p.z + 10); g.lookAt(p.x, p.y + 2, p.z);
        const y0 = g.player.yaw; let t = 0; g.player.yaw = y0 - 0.4; g.player.pitch = 0.05; window.__pan = (dt) => { t += dt; g.player.yaw = y0 - 0.4 + t * 0.13; g.player.pitch = 0.05; }; }, m);
      await pg.waitForTimeout(800); await shot('district_m' + (m + 1));
      await render(`pan_m${m + 1}`, 6, {});
      await pg.evaluate(() => { window.__pan = null; });
    }
  }
  if (want('audio')) {   // real-time pass to capture the procedural music + combat sfx for the trailer bed
    await pg.evaluate(() => { const g = __game; g.start(11, { primary: 'grinder_lmg', route: 'assault' }); g.auto(); Object.assign(window.__bot, { on: true, t: 0, abil: [] }); });
    const b64 = await pg.evaluate(() => window.__recAudio(75)); fs.writeFileSync(path.join(OUT, 'audio_bed.webm'), Buffer.from(b64, 'base64'));
    await pg.evaluate(() => { window.__bot.on = false; });
  }
  console.log('fps', await pg.evaluate(() => __game.state.fps));
  await browser.close();
})();
