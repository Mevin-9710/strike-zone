// Strike Zone test suite (headless Chromium via playwright-core).
// Run: (1) serve the folder:  python3 -m http.server 8765  (inside strike-zone/)
//      (2) node tests/run.cjs            (CHROME=/path/to/chromium to override)
const { chromium } = require('playwright-core');
const BASE = process.env.SZ_URL || 'http://localhost:8765/index.html';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  [' + info + ']' : ''}`); };

async function open(browser, { query = 'test=1', progress = null, profile = null, viewport = { width: 1280, height: 720 }, touch = false } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch });
  await ctx.addInitScript(([p, prof]) => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    if (p !== null) localStorage.setItem('sz_progress', String(p));
    if (prof) localStorage.setItem('sz_profile', JSON.stringify(prof));
  }, [progress, profile]);
  const pg = await ctx.newPage(); pg.errors = [];
  pg.on('pageerror', e => pg.errors.push(String(e))); pg.on('console', m => { if (m.type() === 'error' && !/AudioContext encountered an error/.test(m.text())) pg.errors.push(m.text()); });   // headless has no audio device
  await pg.goto(`${BASE}?${query}`);
  await pg.waitForFunction(() => window.__game?.ready && (document.getElementById('lobby').classList.contains('show') || document.getElementById('brief').classList.contains('show')), null, { timeout: 90000 });
  return { ctx, pg };
}

// Complete mission i through real objective logic (hold E, plant, hold, extract) with the API driving the clock.
const WIN = async (pg, i) => pg.evaluate((i) => {
  const g = __game; g.start(i); g.killAll(); g.step(1);
  const pts = g.map.points, obj = g.MISSIONS[i].objective;
  if (obj === 'plant_hold') {
    const p = pts[0]; g.teleport(p.x + 1.2, p.y, p.z); g.key('KeyE', true); g.step(4); g.key('KeyE', false);
    g.step(31);
  } else {
    for (const p of pts) { g.teleport(p.x + 1.2, p.y, p.z); g.key('KeyE', true); g.step(obj === 'retrieve' ? 3 : 6); g.key('KeyE', false); g.step(0.2); }
    if (obj === 'retrieve') { const x = g.map.extract; g.teleport(x.x, x.y, x.z); g.step(0.5); }
  }
  return g.state.end;
}, i);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });

  // 1. Boot: lobby, campaign list, story locks
  {
    const { ctx, pg } = await open(browser, { query: '' });
    check('boots into the 3D lobby', await pg.isVisible('#lobby'));
    check('lobby shows level + coins', /LV 1/.test(await pg.textContent('#lvl')) && /◎ 0/.test(await pg.textContent('#coins')));
    check('operative preview animates in the lobby', await pg.evaluate(() => { const p = __game.preview; return !!p && p.mixer.time > 0; }));
    await pg.click('#lPlay');
    check('Play opens step 1 (mode) only', await pg.isVisible('#stepMode') && !(await pg.isVisible('#stepLoadout')));
    await pg.click('#chapters button >> nth=0');
    check('chapter pick advances to mission step', await pg.isVisible('#stepMission') && !(await pg.isVisible('#stepMode')));
    await pg.keyboard.press('Escape'); check('Esc goes back a step', await pg.isVisible('#stepMode'));
    await pg.click('#chapters button >> nth=0');
    await pg.click('#briefNext');
    check('loadout step has DEPLOY', await pg.isVisible('#stepLoadout') && await pg.isVisible('#start'));
    await pg.click('#briefBack'); await pg.click('#briefBack');
    check('Back x2 reaches mode step', await pg.isVisible('#stepMode'));
    await pg.click('#briefBack'); check('Back from mode returns to lobby', await pg.isVisible('#lobby'));
    await pg.click('#lPlay');
    const n = await pg.locator('#missions button').count(), locked = await pg.locator('#missions button:disabled').count();
    check('campaign lists 12 missions', n === 12, `n=${n}`);
    check('new profile: only mission 1 open', locked === 11, `locked=${locked}`);
    check('story-locked weapons are disabled', (await pg.locator('#primaries button:disabled').count()) === 5);
    check('story-locked operatives are disabled', (await pg.locator('#operatives button:disabled').count()) === 4);
    await pg.click('#briefBack'); check('briefing BACK returns to lobby', await pg.isVisible('#lobby'));
    check('no errors on boot', pg.errors.length === 0, pg.errors.join(' | '));
    await ctx.close();
  }

  // 2. Every mission is winnable; wins unlock gear + pay XP
  {
    const { ctx, pg } = await open(browser);
    const titles = [];
    for (let i = 0; i < 12; i++) { const t = await WIN(pg, i); titles.push(t); check(`M${i + 1} ${await pg.evaluate(i => __game.MISSIONS[i].title, i)} wins`, !!t && t !== 'MISSION FAILED', t); }
    const st = await pg.evaluate(() => ({ p: +localStorage.getItem('sz_progress'), lv: __game.META.level(), coins: __game.META.profile.coins, text: document.getElementById('endText').textContent }));
    check('campaign progress reaches 12', st.p === 12, `p=${st.p}`);
    check('wins level up and the pass pays coins', st.lv > 5 && st.coins > 0, `lv=${st.lv} coins=${st.coins}`);
    check('final mission ends the season', /SEASON 1 COMPLETE/.test(st.text));
    check('no errors across all 12 missions', pg.errors.length === 0, pg.errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // 3. Fails: timer, death, rewarded revive, double XP
  {
    const { ctx, pg } = await open(browser);
    const t = await pg.evaluate(() => { __game.start(0); __game.timeout(); __game.step(0.2); return __game.state.end; });
    check('timer fail shows MISSION FAILED', t === 'MISSION FAILED');
    const d = await pg.evaluate(() => { const g = __game; g.start(3); g.step(0.2); g.damage(500); return { end: g.state.end, revive: getComputedStyle(document.getElementById('adRevive')).display !== 'none' }; });
    check('death shows the REVIVE ad button', d.end === 'MISSION FAILED' && d.revive);
    await pg.click('#adRevive');
    const r = await pg.evaluate(() => { __game.step(0.5); return { running: __game.state.running, hp: __game.state.hp, again: (__game.damage(500), __game.state.hp) }; });
    check('revive restores the player with brief invulnerability', r.running && r.hp === 100 && r.again === 100, JSON.stringify(r));
    const once = await pg.evaluate(() => { __game.step(4); __game.damage(500); return getComputedStyle(document.getElementById('adRevive')).display === 'none'; });
    check('revive is once per mission', once);
    const x = await pg.evaluate(async () => { const g = __game; g.start(0); g.killAll(); g.step(0.5); const xp0 = g.META.profile.xp; const p = g.map.points[0]; g.teleport(p.x + 1.2, p.y, p.z); g.key('KeyE', true); g.step(6); g.key('KeyE', false); const xp1 = g.META.profile.xp; document.getElementById('adXP').click(); return { gain: xp1 - xp0, doubled: g.META.profile.xp - xp1 }; });
    check('double-XP ad repeats the mission XP', x.gain > 0 && x.doubled === x.gain, JSON.stringify(x));
    await ctx.close();
  }

  // 3b. Weapon upgrades after a win
  {
    const { ctx, pg } = await open(browser);
    const u = await pg.evaluate(() => {
      const g = __game; g.start(0, { primary: 'ar7_lance' }); g.killAll(); g.step(0.5);
      const p = g.map.points[0]; g.teleport(p.x + 1.2, p.y, p.z); g.key('KeyE', true); g.step(6); g.key('KeyE', false);
      const shown = getComputedStyle(document.getElementById('upBox')).display !== 'none', pts = g.META.profile.upPoints;
      document.getElementById('upDmg').click();
      const after = { pts: g.META.profile.upPoints, rank: g.META.upg('ar7_lance').dmg, mult: g.META.dmgMult('ar7_lance') };
      g.META.profile.upPoints = 1; g.META.upgrade('ar7_lance', 'ammo');
      g.start(0, { primary: 'ar7_lance' }); return { shown, pts, after, reserve: g.state.ammo.reserve, base: g.WEAPONS.ar7_lance.reserve };
    });
    check('a win grants an upgrade point and shows the upgrade panel', u.shown && u.pts === 1, JSON.stringify(u));
    check('+DAMAGE raises the weapon damage multiplier', u.after.pts === 0 && u.after.rank === 1 && u.after.mult > 1);
    check('+AMMO raises reserve ammo next mission', u.reserve > u.base, `${u.reserve} vs ${u.base}`);
    await ctx.close();
  }

  // 4. World mechanics: breach gates, barrels, intel
  {
    const { ctx, pg } = await open(browser, { progress: 12 });
    const b = await pg.evaluate(() => {
      const g = __game; g.start(4); g.peace(); g.step(0.2);                  // M5 vault: sealed building
      const w = g.world, sp = g.player.pos.clone(), p = g.map.points[0];
      const before = !!w.findPath(sp, p);
      const br = g.breaches.slice().sort((a, c) => a.pos.distanceTo(p) - c.pos.distanceTo(p))[0];
      const n = br.normal; g.teleport(br.pos.x + n.x * 1.6, br.pos.y + 0.15, br.pos.z + n.z * 1.6);
      g.key('KeyE', true); g.step(1.5); g.key('KeyE', false); g.step(2.5);
      return { before, done: br.done, after: !!w.findPath(sp, p), hit: !!w.raycast(br.pos.clone().add(n.clone().multiplyScalar(2)).setY(br.pos.y + 1.2), n.clone().negate(), 2.2)?.collider?.gate };
    });
    check('vault objective is sealed until a breach', !b.before, JSON.stringify(b));
    check('hold E places a breach charge that blows the wall', b.done && b.after && !b.hit, JSON.stringify(b));
    const k = await pg.evaluate(() => {
      const g = __game; g.start(4); g.step(0.2);
      const bar = g.barrels[0], e = g.enemies.find(x => x.alive && !x.T.flying);
      e.pos.copy(bar.pos).setY(bar.pos.y - 0.6).add({ x: -1.2, y: 0, z: 0 }); e.sync();
      g.teleport(bar.pos.x + 12, bar.pos.y - 0.6, bar.pos.z); g.step(0.1);
      g.lookAt(bar.pos.x, bar.pos.y, bar.pos.z); g.equip(0); g.step(0.6); g.fire(); g.step(0.5);
      return { barrel: bar.alive, enemy: e.alive };
    });
    check('shooting an explosive barrel blows it up and kills nearby enemies', !k.barrel && !k.enemy, JSON.stringify(k));
    const it = await pg.evaluate(() => {
      const g = __game; g.start(5); g.peace(); g.step(0.2);
      const n0 = g.META.profile.intel.length, c = g.intel[0]; g.teleport(c.pos.x, c.pos.y, c.pos.z); g.step(0.3);
      return { got: c.got, saved: g.META.profile.intel.length - n0, xp: g.matchXP.intel };
    });
    check('walking over intel collects and saves it', it.got && it.saved === 1 && it.xp > 0, JSON.stringify(it));
    check('no errors in world mechanics', pg.errors.length === 0, pg.errors.join(' | '));
    await ctx.close();
  }

  // 5. Shop, pass, profile, charm, spray
  {
    const { ctx, pg } = await open(browser, { query: '', profile: { xp: 4000, coins: 1000, claimed: 4 } });
    await pg.click('#lShop');
    const buy = pg.locator('#charms .item', { hasText: 'GOLD STAR' }).locator('button'); await buy.click();
    const s = await pg.evaluate(() => ({ coins: __game.META.profile.coins, charm: __game.META.profile.charm }));
    check('buying a charm spends coins and equips it', s.coins === 850 && s.charm === 'charm_star', JSON.stringify(s));
    await pg.locator('#sprays .item', { hasText: 'HLV CREW' }).locator('button').click();
    check('buying a spray equips it', await pg.evaluate(() => __game.META.profile.spray === 'spray_hlv'));
    await pg.click('#shop .back'); await pg.click('#lPass');
    check('pass shows 40 tiers with 4 claimed', (await pg.locator('.tier').count()) === 40 && (await pg.locator('.tier.got').count()) === 4);
    await pg.click('#pass .back'); await pg.click('#lProfile');
    check('profile lists intel files', (await pg.locator('.file').count()) === 12);
    await pg.click('#profile .back');
    const c = await pg.evaluate(() => {
      const g = __game; g.start(0); g.peace(); g.step(0.3);
      const charm = !!g.charm?.parent; g.equip(1); g.step(0.6); const charm2 = !!g.charm?.parent;
      let placed = 0; for (let a = 0; a < 16 && !placed; a++) { g.look(a * Math.PI / 8, -0.5); g.doSpray(); placed = g.sprays.length; }
      return { charm, charm2, placed };
    });
    check('equipped charm hangs on the viewmodel gun (both weapons)', c.charm && c.charm2, JSON.stringify(c));
    check('T sprays the equipped spray on a wall', c.placed === 1, JSON.stringify(c));
    check('no errors in shop/pass/profile/charm/spray', pg.errors.length === 0, pg.errors.join(' | '));
    await ctx.close();
  }

  // 6. Touch controls + HUD at phone/tablet/desktop sizes
  for (const vp of [{ width: 907, height: 510 }, { width: 1024, height: 768 }, { width: 1920, height: 1080 }]) {
    const { ctx, pg } = await open(browser, { query: 'test=1&touch=1', viewport: vp, touch: true, progress: 12 });
    const r = await pg.evaluate(() => {
      __game.start(3); __game.step(0.3);
      const ids = ['obj', 'hp', 'ammo', 'mm', 'tfire', 'tjump', 'tab0', 'tpause', 'tspray'];
      const out = {};
      for (const id of ids) { const e = document.getElementById(id); const b = e.getBoundingClientRect(); out[id] = b.width > 0 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1 && b.left >= -1 && b.top >= -1; }
      return out;
    });
    check(`HUD + touch buttons on screen at ${vp.width}x${vp.height}`, Object.values(r).every(Boolean), JSON.stringify(r));
    await ctx.close();
  }

  // 7. Performance budget (draw calls per frame on the biggest district)
  {
    const { ctx, pg } = await open(browser, { progress: 12 });
    const info = await pg.evaluate(() => { __game.start(9); __game.step(0.5); __game.render(); return __game.info; });
    check('district renders in under 350 draw calls (incl. shadow pass)', info.calls < 350, JSON.stringify(info));
    check('district under 600k triangles per frame', info.triangles < 600000, `tris=${info.triangles}`);
    await ctx.close();
  }

  // 8. Story data integrity + radio/briefing/debrief wiring
  {
    const { ctx, pg } = await open(browser, { progress: 12 });
    const r = await pg.evaluate(async () => {
      const { STORY, SPEAKERS } = await import('./game/story-data.js'); const { radio } = await import('./game/radio.js');
      const bad = []; for (const m of __game.MISSIONS) { const s = STORY[m.id]; if (!s || !s.briefing?.length || !s.win?.length || !s.lose?.length) { bad.push(m.id); continue; }
        for (const l of [...s.briefing, ...s.win, ...s.lose, ...Object.values(s.ev || {}).flat()]) if (!SPEAKERS[l[0]] || !l[1] || l[1].length > 160) bad.push(m.id + ':' + l[0]); }
      __game.start(2); __game.step(0.1); radio.say('YUNA', 'Test line'); const on = document.getElementById('radio').classList.contains('on');
      const txt = document.getElementById('rtxt').textContent; __game.step(0.1);
      return { bad, on, txt, started: __game.state.mission };
    });
    check('every mission has briefing + win/lose debrief with valid speakers', r.bad.length === 0, r.bad.join(','));
    check('radio subtitle shows non-blocking', r.on && r.txt.length > 0, r.txt);
    await pg.evaluate(() => { __game.openBriefing('mission'); }); 
    const brief = await pg.evaluate(() => document.querySelectorAll('#briefExtra .sline').length);
    check('briefing panel renders portrait lines', brief > 0, String(brief));
    check('no page errors (story)', pg.errors.length === 0, pg.errors.join('|'));
    await ctx.close();
  }

  // 9. Guided tutorial (mission 1): every step completes headlessly, mentor spawns + fights, flag persists
  {
    const { ctx, pg } = await open(browser, {});
    await pg.evaluate(() => { __game.start(0, { tutorial: true }); __game.step(0.1); });
    const mentorOk = await pg.waitForFunction(() => !!__game.mentor, null, { timeout: 30000 }).then(() => true, () => false);
    check('tutorial spawns the Amara mentor bot', mentorOk);
    const r = await pg.evaluate(() => {
      const g = __game, t = g.tutorial, out = [], clock0 = g.state.clock;
      const act = {
        look: () => g.look(g.player.yaw + 0.3, 0), move: () => g.key('KeyW', true), walk: () => { g.key('KeyW', true); g.key('ShiftLeft', true); },
        jump: () => g.key('Space', true), slide: () => { g.key('KeyW', true); g.key('ShiftLeft', false); g.key('KeyC', true); },
        fire: () => g.fire(), aim: () => g.mouse('r', true), reload: () => g.reload(), swap: () => g.equip(1),
        ab0: () => g.ability(0), ab1: () => g.ability(1), kit: () => {},
        fight: n => { if (n > 20) { const e = g.enemies.find(e => e.alive); e?.damage(9999); } },
        defuse: () => { const p = g.map.points[0]; g.teleport(p.x + 1.2, p.y, p.z); g.key('KeyE', true); },
      };
      let held = true;
      for (const id of t.steps) {
        if (t.step !== id) { out.push(id + ':skipped'); continue; }
        g.step(3.2); let n = 0;
        while (t.active && t.step === id && n < 200) { act[id]?.(n); g.step(0.3); n++; }
        for (const k of ['KeyW', 'ShiftLeft', 'Space', 'KeyC', 'KeyE']) g.key(k, false); g.mouse('r', false);
        if (id === 'kit') held = held && clock0 - g.state.clock < 0.5;   // last 0.3s tick may already be in the (unfrozen) fight step
        out.push(id + ':' + (n < 200 ? 'ok' : 'STUCK'));
      }
      g.step(0.2);
      return { out, active: t.active, held, flag: localStorage.getItem('sz_tutorial_done'), mentorKills: g.mentor?.kills ?? -1, fight: g.mentor?.fight };
    });
    check('tutorial: every guided step completes in order', !r.active && r.out.every(s => s.endsWith(':ok')), r.out.join(' '));
    check('tutorial freezes the mission timer during drills', r.held);
    check('tutorial completion persists (forced only on first play)', r.flag === '1');
    check('mentor keeps fighting after the tutorial', r.fight === true);
    const skip = await pg.evaluate(() => { __game.start(0, { tutorial: true }); __game.step(0.5); const a = __game.tutorial.active; document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace' })); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace' })); __game.step(0.1); return { a, after: __game.tutorial.active, hold: __game.tutorial.hold }; });
    check('tutorial is replayable and skippable (Backspace)', skip.a && !skip.after && !skip.hold, JSON.stringify(skip));
    check('no page errors (tutorial)', pg.errors.length === 0, pg.errors.join('|'));
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
