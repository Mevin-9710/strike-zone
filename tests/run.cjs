// Strike Zone test suite (headless Chromium via playwright-core).
// Run: (1) serve the folder:  python3 -m http.server 8765  (inside strike-zone/)
//      (2) node tests/run.cjs            (CHROME=/path/to/chromium to override)
const { chromium } = require('playwright-core');
const BASE = process.env.SZ_URL || 'http://localhost:8765/index.html';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  [' + info + ']' : ''}`); };

async function open(browser, { query = 'test=1', progress = null, profile = null, viewport = { width: 1280, height: 720 }, touch = false, seen = ['sz_onboard_done'] } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch });
  await ctx.addInitScript(([p, prof, seen]) => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.clear(); for (const k of seen) localStorage.setItem(k, '1');
    localStorage.setItem('sz_login', JSON.stringify({ last: new Date().toISOString().slice(0, 10), day: 1 }));   // today's login coins already paid
    localStorage.setItem('sz_settings', JSON.stringify({ quality: 'auto', qMigrated: 1 }));   // swiftshader: High (shadows) is too slow for the suite localStorage.setItem('sz_settings', JSON.stringify({ quality: 'auto', qMigrated: 1 }));   // software GL: High (shadows) is too slow
    if (p !== null) localStorage.setItem('sz_progress', String(p));
    if (prof) localStorage.setItem('sz_profile', JSON.stringify(prof));
  }, [progress, profile, seen]);
  const pg = await ctx.newPage(); pg.errors = [];
  pg.on('pageerror', e => pg.errors.push(String(e))); pg.on('console', m => { if (m.type() === 'error' && !/AudioContext encountered an error/.test(m.text())) pg.errors.push(m.text()); });   // headless has no audio device
  await pg.goto(`${BASE}?${query}`);
  await pg.waitForFunction(() => window.__game?.ready && (document.getElementById('lobby').classList.contains('show') || document.getElementById('brief').classList.contains('show') || __game.state.running), null, { timeout: 90000 });
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
    check('lobby shows level + coins', /LV 1/.test(await pg.textContent('#lvl')) && /^\s*0\s*$/.test(await pg.textContent('#coins')));
    check('v14 lobby: quests card, crate, weapon cards, mode toggle', await pg.evaluate(() => document.querySelectorAll('#lQuests .q').length === 4 && /DAILY REWARD/.test(document.getElementById('lCrate').textContent) && document.querySelectorAll('#lCrate .days .d').length === 7 && document.querySelectorAll('#lWeps .wcard').length >= 3 && document.querySelectorAll('#lWeps .wcard.lock').length >= 1));
    check('operative preview animates in the lobby', await pg.evaluate(() => { const p = __game.preview; return !!p && p.mixer.time > 0; }));
    await pg.click('#lmsBtn'); await pg.click('#lmsList [data-m=tdm]');
    check('mode toggle switches the lobby to Deathmatch', await pg.evaluate(() => document.getElementById('mDm').classList.contains('on') && /DEATHMATCH/.test(document.getElementById('lMission').textContent)));
    { const { ctx: dctx, pg: dpg } = await open(browser, { query: 'test=1' });
      const dm = await dpg.evaluate(() => { const g = __game; g.start(0, { mode: 'dm' }); const n0 = g.enemies.filter(e => e.alive).length; g.killAll(); g.step(4); const n1 = g.enemies.filter(e => e.alive).length;
        g.damage(500); g.step(0.2); const dead = !g.player.alive; g.step(3); return { n0, n1, dead, back: g.player.alive, hud: document.getElementById('obj').textContent, run: g.state.running }; });
      check('deathmatch: bots respawn, player respawns, HUD counts kills', dm.n0 >= 4 && dm.n1 >= 1 && dm.dead && dm.back && /DEATHMATCH/.test(dm.hud) && dm.run, JSON.stringify(dm));
      await dpg.evaluate(() => { __game.timeout(); __game.step(0.2); }); check('deathmatch ends with REMATCH', /RANK|VICTORY/.test(await dpg.textContent('#endTitle')) && /REMATCH/.test(await dpg.textContent('#again')));
      await dctx.close(); }
    check('rebrand: SELECT MODE lists only arena modes (no story)', await pg.evaluate(() => [...document.querySelectorAll('#lmsList [data-m]')].map(b => b.dataset.m).join(',') === 'tdm,dm'));
    await pg.evaluate(() => __game.openBriefing());
    check('rebrand: LOADOUT opens on the loadout step (no mode/mission steps)', await pg.isVisible('#stepLoadout') && !(await pg.isVisible('#stepMode')) && !(await pg.isVisible('#stepMission')));
    check('level-locked weapons are disabled and show their level', (await pg.locator('#primaries button:disabled').count()) === 5 && /LV \d/.test(await pg.textContent('#primaries')));
    await pg.click('#briefBack'); check('briefing BACK returns to lobby', await pg.isVisible('#lobby'));
    check('rebrand: story entry points hidden', await pg.evaluate(() => ['mStory', 'lDaily', 'lSurv', 'pStory'].every(id => getComputedStyle(document.getElementById(id)).display === 'none')));
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
      document.getElementById('endMore')?.click(); const shown = getComputedStyle(document.getElementById('upBox')).display !== 'none', pts = g.META.profile.upPoints;
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
    const { ctx, pg } = await open(browser, { query: '', profile: { xp: 4000, coins: 1000, claimed: 4 }, seen: ['sz_onboard_done', 'sz_tutorial_done'] });
    await pg.click('#lNav [data-id=lShop]');
    const buy = pg.locator('#charms .item', { hasText: 'GOLD STAR' }).locator('button'); await buy.click();
    const s = await pg.evaluate(() => ({ coins: __game.META.profile.coins, charm: __game.META.profile.charm }));
    check('buying a charm spends coins and equips it', s.coins === 850 && s.charm === 'charm_star', JSON.stringify(s));
    await pg.locator('#sprays .item', { hasText: 'HLV CREW' }).locator('button').click();
    check('buying a spray equips it', await pg.evaluate(() => __game.META.profile.spray === 'spray_hlv'));
    await pg.click('#shop .back'); await pg.click('#lNav [data-id=lPass]');
    check('pass shows 40 tiers with 4 claimed', (await pg.locator('.tier').count()) === 40 && (await pg.locator('.tier.got').count()) === 4);
    await pg.click('#pass .back'); await pg.click('#lNav [data-id=lProfile]');
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
      const ids = ['obj', 'hp', 'ammo', 'mm', 'tfire', 'tjump', 'tab0', 'tpause', 'treload', 'taim'];
      const out = {};
      out.sprayHidden = getComputedStyle(document.getElementById('tspray')).display === 'none';
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

  // v14: adaptive threat, quests, trial, death card, spawn scoring, end screen
  {
    const { ctx, pg } = await open(browser, { query: 'test=1' });
    const r = await pg.evaluate(() => {
      const g = __game, D = g.director, out = {};
      g.start(0); D.start({ mode: null, level: 1, firstMission: false, on: true }); const t0 = D.threat;
      for (let i = 0; i < 12; i++) D.kill(i % 2 === 0, i); out.rose = D.threat > t0; const t1 = D.threat;
      D.death(); out.fell = D.threat < t1;
      for (let i = 0; i < 200; i++) D.kill(true, i); out.capS = D.threat <= 0.85 + 1e-9;
      D.start({ mode: null, level: 1, firstMission: true }); for (let i = 0; i < 0; i++); out.pinned = D.threat <= 0.2;
      D.start({ mode: 'dm', level: 1 }); for (let i = 0; i < 300; i++) D.kill(true, i); out.capDm = D.threat <= 1 && D.threat > 0.85;
      out.diff = g.G ? 1 : 1;
      g.QUESTS._reset(); const q0 = g.QUESTS.all()[0].p; g.start(0); g.killTick(false); out.quest = g.QUESTS.all()[0].p > q0;
      g.setTrial('javelin_amr'); g.start(0); out.trialUsed = g.W.slots[0] === 'javelin_amr' && g.trial === null; g.start(0); out.trialOnce = g.W.slots[0] !== 'javelin_amr';
      g.start(0, { mode: 'dm' }); g.step(1);
      let los = 0; for (let i = 0; i < 20; i++) { const live = g.enemies.filter(e => e.alive).map(e => e.pos); const p = g.dmSpot(live, live, live, true); for (const v of live) if (v.distanceTo(p) < 9) los++; } out.spawnFar = los === 0;
      g.damage(500); g.step(0.2); out.card = document.getElementById('dcard').classList.contains('show') && /RESPAWN/.test(document.getElementById('dcGo').textContent);
      g.step(0.8); document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); g.step(0.1); out.respawnNow = g.player.alive && !document.getElementById('dcard').classList.contains('show');
      return out;
    });
    check('v14 threat rises with kills, falls on death, capped (story 0.85 / DM 1), pinned on mission 1', r.rose && r.fell && r.capS && r.pinned && r.capDm, JSON.stringify(r));
    check('v14 quests count kills', r.quest, JSON.stringify(r));
    check('v14 weapon trial applies to one match only', r.trialUsed && r.trialOnce, JSON.stringify(r));
    check('v14 DM spawn scoring keeps spawns away from bots', r.spawnFar, JSON.stringify(r));
    check('v14 DM death card shows and SPACE respawns now', r.card && r.respawnNow, JSON.stringify(r));
    const e = await pg.evaluate(() => { const g = __game; g.start(0); g.win(); g.step(0.1); return { v14: document.getElementById('end').classList.contains('v14e'), coins: document.getElementById('endCoins').textContent.length > 0, dbl: getComputedStyle(document.getElementById('dbl')).display !== 'none', q: document.querySelectorAll('#endQ .q').length }; });
    check('v14 end screen: coins, double offer, quest bars', e.v14 && e.coins && e.dbl && e.q === 4, JSON.stringify(e));
    check('no page errors (v14)', pg.errors.length === 0, pg.errors.join('|'));
    await ctx.close();
  }

  // v15: Deathmatch default, map-wide spawns, operative bots, DM quests
  {
    const { ctx, pg } = await open(browser, { query: 'test=1' });
    await pg.evaluate(() => __game.loadBotSkins());
    await pg.waitForTimeout(4000);
    const r = await pg.evaluate(() => {
      const g = __game, out = { def: g.playMode };
      g.start(0, { mode: 'dm' }); g.step(0.5);
      out.pool = g.DM.pool.length;
      const live = g.enemies.filter(e => e.alive).map(e => e.pos), keys = new Set(); let near = 0;
      for (let i = 0; i < 30; i++) { const p = g.dmSpot([g.player.pos, ...live], [g.player.pos, ...live], live); keys.add(Math.round(p.x / 3) + ',' + Math.round(p.z / 3)); if (live.some(v => v.distanceTo(p) < 8)) near++; }
      out.distinct = keys.size; out.near = near;
      out.skins = g.enemies.filter(e => e.skin).length; out.bots = g.enemies.length; out.tags = g.enemies.filter(e => e.tag).length;
      g.QUESTS._reset(); g.timeout(); g.step(0.2); out.finish = g.QUESTS.all().find(q => q.kind === 'finish')?.p === 1;
      return out;
    });
    check('v15 lobby defaults to Deathmatch', r.def === 'dm', JSON.stringify(r));
    check('v15 DM spawn pool covers the map and spawns spread out', r.pool >= 20 && r.distinct >= 8 && r.near <= 6, JSON.stringify(r));
    check('v15 DM bots wear operative models with callsign tags', r.skins >= 1 && r.tags === r.bots, JSON.stringify(r));
    check('v15 finishing a Deathmatch advances the finish quest', r.finish, JSON.stringify(r));
    check('no page errors (v15)', pg.errors.length === 0, pg.errors.join('|'));
    await ctx.close();
  }

  // v16: free-for-all Deathmatch (bots fight bots, bots can win, no regen / medkits)
  {
    const { ctx, pg } = await open(browser, { query: 'test=1' });
    const r = await pg.evaluate(() => {
      const g = __game, out = {}; g.RC.dmTeams = false;
      g.start(0, { mode: 'dm' }); g.step(0.5);
      out.medkits = g.medkits.length; out.roster = g.DM.roster.length;
      const d0 = g.DM.d; g.player.hp = 40; g.step(6); out.noRegen = g.player.hp <= 40 || g.DM.d > d0;
      const [a, b] = g.DM.roster; out.rival = !!g.ffaRival(a.e);
      const ak = a.k, bd = b.d; b.e.damage(9999); g.botKill(a.e, b.e); out.botScore = a.k === ak + 1 && b.d === bd + 1;
      g.step(3.2); out.respawned = !!(b.e && b.e.alive);
      a.k = g.RC ? 0 : a.k; a.k = 49; const c = g.DM.roster[2]; c.e.damage(9999); g.botKill(a.e, c.e); g.step(0.2);
      out.botWon = g.state.matchOver && /OF 7/.test(document.getElementById('endTitle').textContent) && /WINS/.test(document.getElementById('rankBadge').textContent);
      return out;
    });
    check('v16 DM: no medkits, no health regen', r.medkits === 0 && r.noRegen, JSON.stringify(r));
    check('v16 DM: bots target and frag each other, scores tracked, bots respawn', r.rival && r.botScore && r.respawned, JSON.stringify(r));
    check('v16 DM: a bot reaching the target wins the match', r.botWon, JSON.stringify(r));
    check('no page errors (v16)', pg.errors.length === 0, pg.errors.join('|'));
    await ctx.close();
  }

  // v26: team Deathmatch (allies vs red team, team score wins)
  {
    const { ctx, pg } = await open(browser, { query: 'test=1' });
    const r = await pg.evaluate(() => {
      const g = __game, out = {};
      localStorage.removeItem('sz_dm_level'); localStorage.setItem('sz_dm_played', '9');
      g.RC.dmTeams = true; g.start(0, { mode: 'dm' }); g.step(0.3);
      out.teams = g.allies.length === g.RC.tdmTeam - 1 && g.enemies.length === g.RC.tdmTeam && g.allies.every(e => e.ally);
      out.target = g.DM.target === g.RC.tdmLevelKills;
      out.noAllyTarget = true; let botKills = 0, sawBotTarget = false;
      for (let i = 0; i < 90; i++) { g.player.hp = 100; g.step(1); for (const a of g.allies) if (a.targetKind === 'player') out.noAllyTarget = false; for (const e of [...g.allies, ...g.enemies]) if (e.targetKind === 'bot') sawBotTarget = true; if (g.state.matchOver) break; }
      out.botTarget = sawBotTarget; out.scoreA = g.DM.score.A; out.scoreB = g.DM.score.B;
      { const a = g.allies[0], e = g.enemies[0]; g.DM.score.A = 10; g.DM.score.B = 2; out.boostE = +g.G?.botBoost?.(e)?.toFixed(2); }
      out.botKills = g.DM.score.A + g.DM.score.B;
      g.start(0, { mode: 'dm' }); g.step(0.2); g.DM.score.A = g.DM.target - 1; g.tdmScore('A'); g.step(0.2);
      out.win = g.state.matchOver && /VICTORY/.test(document.getElementById('endTitle').textContent);
      g.start(0, { mode: 'dm' }); g.step(0.2); g.DM.score.B = g.DM.target - 1; g.tdmScore('B'); g.step(0.2);
      out.lose = g.state.matchOver && /RED TEAM WINS/.test(document.getElementById('endTitle').textContent);
      g.RC.dmTeams = false; g.start(0, { mode: 'dm' }); g.step(0.2); out.ffa = g.allies.length === 0 && g.enemies.length === g.RC.dmBots;
      return out;
    });
    check('v26 TDM: 4 allies + 5 enemies, team target', r.teams && r.target, JSON.stringify(r));
    check('v26 TDM: allies never target the player; bots target bots', r.noAllyTarget && r.botTarget, JSON.stringify(r));
    check('v26 TDM: team target ends the match (win + loss)', r.win && r.lose, JSON.stringify(r));
    check('v28 TDM: bots kill each other (team score rises without the player)', r.scoreA + r.scoreB >= 10, JSON.stringify(r));
    check('v28 TDM: boost = ramp (+8% at 12 kills) + comeback (+8%) for the side 8 behind', r.boostE === 1.16, JSON.stringify(r));
    check('v26 TDM: switch off = free-for-all', r.ffa, JSON.stringify(r));
    check('no page errors (v26)', pg.errors.length === 0, pg.errors.join('|'));
    await ctx.close();
  }

  // v27: the four Deathmatch arenas load, build nav + spawn pools, and run a match without errors
  {
    const { ctx, pg } = await open(browser, { query: 'test=1' });
    const r = await pg.evaluate(async () => {
      const g = __game, M = await import('./world/dm-maps.js'), out = [];
      localStorage.setItem('sz_dm_played', '9'); g.RC.dmTeams = true;
      for (let j = 0; j < M.DM_MAPS.length; j++) {
        await M.loadDmMap(M.DM_MAPS[j].id); g.start(0, { mode: 'dm', dmMap: j }); g.step(0.3);
        const p = g.player.pos; g.step(3);
        const e = p.clone(), ey = g.player.yaw; e.y += 1.6; let free = 0; for (const d of [2, 4, 6, 8]) { const t = e.clone(); t.x -= Math.sin(ey) * d; t.z -= Math.cos(ey) * d; if (g.world.lineClear(e, t)) free = d; else break; }
        out.push({ id: M.DM_MAPS[j].id, free, ok: g.state.running && g.DM.pool.length > 40 && g.allies.length === 4 && g.enemies.length === 5 && p.y > -1 && p.x > 0 && g.world.nav.nodes.length > 1000, calls: g.info.calls });
      }
      return { out, errs: g.errors.length };
    });
    check('v27 DM arenas: all 4 load and play (nav, spawn pool, teams)', r.out.length === 4 && r.out.every(o => o.ok) && r.errs === 0, JSON.stringify(r));
    check('v30.1 TDM spawn looks down an open line (8 m+), not into a wall', r.out.every(o => o.free >= 8), JSON.stringify(r.out.map(o => o.free)));
    check('v27 DM arenas: under 400 draw calls (incl. shadow pass + outlines)', r.out.every(o => o.calls < 400), JSON.stringify(r.out.map(o => o.calls)));
    check('no page errors (v27)', pg.errors.length === 0, pg.errors.join('|'));
    await ctx.close();
  }

  // v31: return gift (D1): day 1 end screen shows what unlocks tomorrow; on day 2 it is granted, equipped and announced
  {
    const { ctx, pg } = await open(browser, { query: 'test=1&gifts=1' });
    const r = await pg.evaluate(async () => {
      const g = __game, M = await import('./world/dm-maps.js'); await M.loadDmMap(M.DM_MAPS[0].id); g.RC.dmTeams = true;
      g.start(0, { mode: 'dm', dmMap: 0 }); g.step(0.3); g.dmScore(25, 10); g.timeout(); g.step(0.2);
      const card = document.getElementById('endGift'); return { days: JSON.parse(localStorage.getItem('sz_days')).n, shown: card.style.display !== 'none' && /HEAVY/.test(card.textContent), gifts: localStorage.getItem('sz_gifts') };
    });
    check('v31 day 1: end screen shows the HEAVY unlock waiting tomorrow, nothing granted yet', r.days === 1 && r.shown && !r.gifts, JSON.stringify(r));
    await pg.evaluate(() => { const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10); localStorage.setItem('sz_days', JSON.stringify({ last: y, n: 1 })); });
    await pg.reload(); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 90000 });
    const r2 = await pg.evaluate(async () => {
      const g = __game, M = await import('./world/dm-maps.js'); await M.loadDmMap(M.DM_MAPS[0].id);
      g.start(0, { mode: 'dm', dmMap: 0 }); g.step(0.3);
      return { w: g.state.weapon, gifts: JSON.parse(localStorage.getItem('sz_gifts') || '[]'), days: JSON.parse(localStorage.getItem('sz_days')).n, toast: !!document.querySelector('.questToast') };
    });
    check('v31 day 2: Hailstorm granted once, equipped, toast shown', r2.days === 2 && r2.gifts.length === 1 && r2.gifts[0] === 'hailstorm_mg' && r2.w === 'hailstorm_mg' && r2.toast, JSON.stringify(r2));
    check('no page errors (v31 gifts)', pg.errors.length === 0, pg.errors.join('|'));
    await ctx.close();
  }

  // v17: Deathmatch levels, victory rewards, bot parity, touch layout
  {
    const { ctx, pg } = await open(browser, { query: 'test=1&touch=1', viewport: { width: 844, height: 390 }, touch: true });
    const r = await pg.evaluate(() => {
      const g = __game, out = {}; g.RC.dmTeams = false;
      localStorage.removeItem('sz_dm_level');
      g.start(0, { mode: 'dm' }); g.step(0.3); out.target1 = g.DM.target; out.lvl1 = g.DM.level;
      const ids = ['tfire', 'treload', 'taim', 'tjump', 'wep']; const R = ids.map(i => document.getElementById(i).getBoundingClientRect()); out.overlap = 0;
      for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) { const p = R[a], q = R[b]; if (p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom) out.overlap++; }
      out.bigBots = g.enemies.every(e => e.root.scale.y > 1.05 &&  e.hp === 100);
      const up0 = g.META.profile.upPoints;
      g.addKills(15); g.step(0.2);
      out.victory = /VICTORY/.test(document.getElementById('endTitle').textContent) && /NEXT LEVEL 2/.test(document.getElementById('again').textContent);
      out.upPoint = g.META.profile.upPoints === up0 + 1 && document.getElementById('upBox').style.display !== 'none';
      g.start(0, { mode: 'dm' }); g.step(0.3); out.target2 = g.DM.target;
      g.timeout(); g.step(0.2); out.defeat = /DEFEAT/.test(document.getElementById('endTitle').textContent) && document.getElementById('upBox').style.display === 'none' && /RETRY LEVEL 2/.test(document.getElementById('again').textContent);
      return out;
    });
    check('v25 DM level 1 = 15 kills; level 2 = 20', r.target1 === 15 && r.lvl1 === 1 && r.target2 === 20, JSON.stringify(r));
    check('v17 DM victory: VICTORY, NEXT LEVEL, +1 upgrade point shown', r.victory && r.upPoint, JSON.stringify(r));
    check('v17 DM defeat: DEFEAT, retry same level, no upgrades', r.defeat, JSON.stringify(r));
    check('v17 bots: bigger, 100 HP', r.bigBots, JSON.stringify(r));
    check('v17 phone landscape: fire/reload/aim/jump do not overlap', r.overlap === 0, JSON.stringify(r));
    check('no page errors (v17)', pg.errors.length === 0, pg.errors.join('|'));
    await ctx.close();
  }

  // v19: new-player grace in the first 2 Deathmatches
  {
    const { ctx, pg } = await open(browser, { query: 'test=1' });
    const r = await pg.evaluate(() => {
      const g = __game, out = {}; localStorage.removeItem('sz_dm_played');
      g.start(0, { mode: 'dm' }); g.step(1); out.g1 = g.DM.grace && g.dmPower === 0.55 && g.ignorePlayer;
      for (let i = 0; i < 220; i++) g.step(0.1); out.calmEnds = !g.ignorePlayer;
      g.start(0, { mode: 'dm' }); g.step(0.2); out.g2 = g.DM.grace;
      g.start(0, { mode: 'dm' }); g.step(0.2); out.g3 = !g.DM.grace && g.dmPower > 0.5 && !g.ignorePlayer;
      return out;
    });
    { const ok = await pg.evaluate(() => { const g = __game; g.start(0, { mode: 'dm' }); g.step(0.2); for (let i = 0; i < 20; i++) { const p = g.dmSpot([], [], [], true); if (!p || !Number.isFinite(p.x)) return false; } return true; });
      check('v21 DM spawn never returns null when nobody is alive', ok); }
    check('v19 grace: first 2 Deathmatches use weaker bots and a 20 s calm start; the 3rd is normal', r.g1 && r.calmEnds && r.g2 && r.g3, JSON.stringify(r));
    check('no page errors (v19)', pg.errors.length === 0, pg.errors.join('|'));
    await ctx.close();
  }

  // 9. First launch: no tour, PLAY drops straight into the mission-1 drill; tour still replayable from Settings
  {
    const { ctx, pg } = await open(browser, { query: '', seen: [] });
    check('first launch skips lobby and tour', await pg.evaluate(() => !__game.onboard?.active && !document.getElementById('lobby').classList.contains('show')));
    await pg.waitForTimeout(300);
    const r1 = await pg.evaluate(() => ({ running: __game.state.running || document.getElementById('clickGo').classList.contains('show'), tut: !!__game.tutorial?.active, flag: localStorage.getItem('sz_onboard_done'), card: document.getElementById('ctlCard') ? 1 : 0 }));
    check('first launch drops straight into mission 1: no drill, controls card shown', r1.running && !r1.tut && r1.flag === '1' && r1.card === 1, JSON.stringify(r1));
    { await pg.mouse.click(400, 300); const ran = await pg.waitForFunction(() => __game.state.running, null, { timeout: 15000 }).then(() => true, () => false);
      const ld = await pg.evaluate(() => document.getElementById('loading').className);
      check('v29.9 first launch: loading screen is hidden once the match runs', ran && !/\bshow\b/.test(ld), JSON.stringify({ ran, ld })); }
    check('v15 first launch is a Deathmatch', await pg.evaluate(() => __game.state.mode === 'dm' || /DEATHMATCH/.test(document.getElementById('obj').textContent)));
    check('no page errors (first launch)', pg.errors.length === 0, pg.errors.join('|'));
    await ctx.close();
  }
  {
    const { ctx, pg } = await open(browser, { query: 'touch=1', seen: ['sz_tutorial_done'], viewport: { width: 907, height: 510 }, touch: true });
    await pg.tap('#lSettings'); await pg.tap('#setTour');
    const r = await pg.evaluate(() => { const b = document.querySelector('#onb .bub').getBoundingClientRect(); return { a: __game.onboard?.active, inView: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight }; });
    check('phone: tour shows with the bubble inside the screen', r.a && r.inView, JSON.stringify(r));
    await pg.tap('#onb .sk');
    const r2 = await pg.evaluate(() => ({ a: __game.onboard.active, lobby: document.getElementById('lobby').classList.contains('show'), flag: localStorage.getItem('sz_onboard_done') }));
    check('phone: SKIP ends the tour, persists, returns to lobby', !r2.a && r2.lobby && r2.flag === '1', JSON.stringify(r2));
    await pg.tap('#lSettings'); await pg.tap('#setTour');
    check('tour is replayable from settings', await pg.evaluate(() => __game.onboard.active && __game.onboard.step === 'lobby'));
    await pg.evaluate(() => __game.onboard.skip());
    check('no page errors (phone tour)', pg.errors.length === 0, pg.errors.join('|'));
    await ctx.close();
  }

  // 10. Phone reload button, touch-button highlight, SDK no-op
  {
    const { ctx, pg } = await open(browser, { query: 'test=1&touch=1', viewport: { width: 907, height: 510 }, touch: true, progress: 12 });
    await pg.evaluate(() => { const g = __game; g.start(0); g.peace(); g.step(0.5); g.state.ammo; const w = g.state; });
    await pg.evaluate(() => { __game.fire(); __game.step(0.2); });
    check('phone: RELOAD button is visible', await pg.isVisible('#treload'));
    await pg.tap('#treload');
    const rl = await pg.evaluate(() => { __game.step(0.1); return __game.state.reloading; });
    check('phone: RELOAD button reloads like R', rl);
    const hl = await pg.evaluate(async () => {
      const { createTutorial } = await import('./game/tutorial.js');
      const t = createTutorial({ isTouch: true }); t.start({ force: true });
      const S = { dt: 1, look: 5, moved: true, walked: true, jumped: true, slid: true, fired: true, aiming: true, reloaded: false, swapped: false, ab0: false, ab1: false, kills: 0, interacting: false };
      for (let i = 0; i < 60 && t.step !== 'reload'; i++) t.update(1, S);
      const on = t.step === 'reload' && document.getElementById('treload').classList.contains('tut-hl');
      t.update(5, S); S.reloaded = true; t.update(1, S);
      const off = !document.getElementById('treload').classList.contains('tut-hl'); t.abort();
      return { on, off };
    });
    check('tutorial pulses the real touch button and clears it on completion', hl.on && hl.off, JSON.stringify(hl));
    const sdk = await pg.evaluate(async () => {
      const { crazy } = await import('./game/crazy.js'); let granted = false;
      crazy.loading(true); crazy.loading(false); crazy.gameplay(true); crazy.gameplay(false); crazy.happy();
      await crazy.midgame(); crazy.rewarded(() => { granted = true; });
      return { active: crazy.active, granted };
    });
    check('CrazyGames SDK absent: every call no-ops, rewarded grants', !sdk.active && sdk.granted, JSON.stringify(sdk));
    check('no page errors (reload/highlight/sdk)', pg.errors.length === 0, pg.errors.join('|'));
    await ctx.close();
  }

  // ---- audio: unlock on first gesture, samples decode, mute/volume persist, a firefight plays without errors
  {
    const { ctx, pg } = await open(browser);
    const pre = await pg.evaluate(async () => (await import('./game/audio.js')).samplesLoaded());
    await pg.mouse.click(640, 360); await pg.waitForTimeout(2500);
    const a = await pg.evaluate(async () => {
      const A = await import('./game/audio.js'); const n = A.samplesLoaded();
      const g = __game; g.openLobby(); document.getElementById('lMute').click(); const m1 = JSON.parse(localStorage.getItem('sz_audio') || '{}').muted;
      document.getElementById('lMute').click(); A.setAudio('music', 0.3);
      g.start(0, { mode: 'dm' }); g.step(6); g.mouse('l', true); g.step(2); g.mouse('l', false); g.key('KeyR', true); g.step(0.1); g.key('KeyR', false); g.step(3);
      return { n, m1, saved: JSON.parse(localStorage.getItem('sz_audio')), sliders: !!document.querySelector('#settings') };
    });
    await pg.evaluate(() => __game.openLobby()); await pg.click('#lSettings');
    const rows = await pg.$$eval('#setRows [data-a]', els => els.map(e => e.dataset.a).join(','));
    check('audio: nothing loads before the first gesture, samples decode after it', pre === 0 && a.n >= 30, `${pre} -> ${a.n}`);
    check('audio: mute button + volume persist in sz_audio, settings has volume rows', a.m1 === true && a.saved.muted === false && a.saved.music === 0.3 && rows === 'master,music,sfx,muted', JSON.stringify(a.saved) + ' ' + rows);
    check('no page errors (audio)', pg.errors.length === 0, pg.errors.join('|'));
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
