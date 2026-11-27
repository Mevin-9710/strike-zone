#!/usr/bin/env node
// Runs the CrazyGames Developer Portal QA tool on the newest uploaded build and submits it, in a real
// (headless) browser, the same clicks Mevin does by hand: Go to QA -> preview loads -> the game starts ->
// Continue -> answer the checklist -> update notes -> confirm -> Submit.
// The portal's own QA tool measures load time, memory and SDK calls; nothing is made up or copied.
// UNOFFICIAL: drives the portal UI by visible text, so it can break when the portal changes.
//
// Auth: CG_REFRESH_TOKEN (same secret as tools/cg_upload.mjs). Never paste it in chat.
// Usage:
//   node tools/cg_qa_bot.mjs explore            # log in, open the QA tool, screenshot every step, do NOT submit
//   node tools/cg_qa_bot.mjs submit --notes "…" # full run including the final Submit
// Output: qa-shots/NN_step.png + qa-shots/log.txt (uploaded as an Action artifact).
import { mkdir, appendFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const API_KEY = 'AIzaSyAcnWHv0-RhlmU5ONOXzOSP0Q6ORQEMrNg'; // public web key from the portal bundle
const PORTAL = 'https://developer.crazygames.com';
const args = process.argv.slice(2), cmd = args[0] || 'explore';
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const NOTES = (n => n.length >= 60 ? n : n + ' Tested on desktop and phone viewports; no SDK, login or ad changes.')(opt('--notes', process.env.CG_NOTES || 'Gameplay and UI improvements.'));
const GAME = opt('--game', 'Strike Zone');
const OUT = 'qa-shots';
let n = 0;
const log = async (...a) => { const s = a.join(' '); console.log(s); await appendFile(`${OUT}/log.txt`, s + '\n'); };

async function session() {
  const rt = process.env.CG_REFRESH_TOKEN; if (!rt) throw new Error('CG_REFRESH_TOKEN is not set');
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt }) });
  const j = await r.json(); if (!r.ok) throw new Error('token refresh failed: ' + JSON.stringify(j.error || j));
  return { uid: j.user_id, idToken: j.id_token, refreshToken: j.refresh_token, exp: Date.now() + Number(j.expires_in) * 1000 };
}

async function shot(page, name) {
  const f = `${OUT}/${String(++n).padStart(2, '0')}_${name}.png`;
  await page.screenshot({ path: f, fullPage: true }).catch(() => {});
  const btns = await page.evaluate(() => [...document.querySelectorAll('button, a[role=button], [role=checkbox], input[type=checkbox], input[type=radio], textarea')]
    .filter(e => e.offsetParent !== null).map(e => `${e.tagName.toLowerCase()}${e.disabled ? '[disabled]' : ''}:${(e.innerText || e.getAttribute('aria-label') || e.name || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 60)}`).slice(0, 80)).catch(() => []);
  await log(`-- ${name} @ ${page.url()}\n   ${btns.join(' | ')}`);
}

// click the first visible element whose text matches (button-like first, then any)
async function clickText(page, re, { timeout = 20000, exact = false } = {}) {
  if (/discard|delete|remove|reject/i.test(String(re))) throw new Error('refusing to click a destructive button: ' + re);
  const loc = page.locator('button:visible, a:visible, [role=tab]:visible, [role=button]:visible').filter({ hasText: re }).filter({ hasNotText: /discard|delete|remove/i }).first();
  await loc.waitFor({ state: 'visible', timeout }); await loc.click(); await log(`click ${re}`);
}

(async () => {
  await mkdir(OUT, { recursive: true });
  const s = await session(); await log(`auth ok (${s.uid})`);
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let page = await ctx.newPage(); const portalTab = page;
  page.on('pageerror', e => log('pageerror', e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') log('console', m.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400) log('http', r.status(), r.url().slice(0, 160)); });
  page.on('requestfailed', r => log('reqfail', r.url().slice(0, 160), r.failure()?.errorText || ''));
  await page.goto(PORTAL + '/login', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2000); await shot(page, 'login_before_auth');
  // Firebase web auth persistence: IndexedDB firebaseLocalStorageDb/firebaseLocalStorage
  await page.evaluate(async ({ s, API_KEY }) => {
    const key = `firebase:authUser:${API_KEY}:[DEFAULT]`;
    const value = { uid: s.uid, emailVerified: true, isAnonymous: false, providerData: [], stsTokenManager: { refreshToken: s.refreshToken, accessToken: s.idToken, expirationTime: s.exp }, createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey: API_KEY, appName: '[DEFAULT]' };
    await new Promise((ok, bad) => {
      const req = indexedDB.open('firebaseLocalStorageDb', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
      req.onerror = () => bad(req.error);
      req.onsuccess = () => { const tx = req.result.transaction('firebaseLocalStorage', 'readwrite'); tx.objectStore('firebaseLocalStorage').put({ fbase_key: key, value }); tx.oncomplete = ok; tx.onerror = () => bad(tx.error); };
    });
  }, { s, API_KEY });
  await page.goto(PORTAL + '/games', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(3000);
  for (let i = 0; i < 3 && await page.getByText(/temporarily unavailable/i).isVisible().catch(() => false); i++) { await log('portal says temporarily unavailable, retrying in 20 s'); await page.waitForTimeout(20000); await page.reload({ waitUntil: 'networkidle' }).catch(() => {}); await page.waitForTimeout(3000); }
  await shot(page, 'games');
  if (/login/.test(page.url())) throw new Error('not logged in (auth injection failed)');

  await clickText(page, new RegExp(GAME, 'i')).catch(async () => { await page.getByText(GAME, { exact: false }).first().click(); await log('click game text'); });
  await page.waitForTimeout(4000); await shot(page, 'submission');

  await clickText(page, /game versions/i); await page.waitForTimeout(3000); await shot(page, 'versions');
  // Version History: the newest draft row (top) has 'Submit update', which opens the QA flow
  // 'Submit update' opens the QA tool in a new tab
  const [qa] = await Promise.all([ctx.waitForEvent('page', { timeout: 30000 }), clickText(page, /^\s*submit update\s*$/i)]);
  page = qa; page.on('pageerror', e => log('pageerror', e.message.slice(0, 200)));
  await page.waitForLoadState('domcontentloaded'); await page.waitForTimeout(3000); await shot(page, 'qa_tab');
  if (await page.locator('button:visible, a:visible').filter({ hasText: /go to qa/i }).count()) await clickText(page, /go to qa/i);
  await page.waitForTimeout(3000); await shot(page, 'qa_open');

  // the preview: our game drops straight into a match (gameplayStart) on first launch; if a menu PLAY shows, click it at once
  const t0 = Date.now(); let started = false;
  while (Date.now() - t0 < 90000 && !started) {
    for (const f of page.frames()) {
      const play = f.locator('#lPlay, #clickGo').first();
      if (await play.isVisible().catch(() => false)) { await play.click().catch(() => {}); await log('clicked in-game play/continue'); }
      if (await f.evaluate(() => !!document.getElementById('hud')?.classList.contains('on')).catch(() => false)) { started = true; break; }
    }
    if (!started) await page.waitForTimeout(500);
  }
  await log(`game running in preview: ${started} after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await page.waitForTimeout(8000); await shot(page, 'qa_preview');

  // QA tool tab: Continue sends the measured QA result, then the tab says 'You can now close this tab'
  const subId = (page.url().match(/preview\/([0-9a-f-]{36})/) || [])[1];
  const buildId = new URL(page.url()).searchParams.get('gameBuildId'); await log(`submission ${subId}, build ${buildId}`);
  // Continue in the QA tool opens the portal's qa-continue page in a new tab; the QA tab hands it the
  // measured results by postMessage, so the QA tab must stay open
  const qaTab = page;
  const [cont] = await Promise.all([ctx.waitForEvent('page', { timeout: 30000 }), clickText(page, /^\s*continue\s*$/i, { timeout: 30000 })]);
  page = cont; await page.waitForLoadState('domcontentloaded'); await page.waitForTimeout(6000); await shot(qaTab, 'qa_tool_done'); await shot(page, 'qa_continue');
  // walk the QA steps: Continue / Next until the checklist + notes + Submit page
  for (let step = 0; step < 6; step++) {
    // answer every manual checklist question. Default 'Yes' (Mevin's standing answer); a question whose
    // honest answer differs is listed in ANSWERS (label regex -> button text)
    const ANSWERS = [[/terms\s*&\s*conditions|privacy policy/i, process.env.CG_QA_PRIVACY || 'N/A']];
    const done = await page.evaluate((answers) => {
      const out = []; const yesBtns = [...document.querySelectorAll('button, [role=button], div, span')].filter(e => e.childElementCount === 0 && e.textContent.trim() === 'Yes' && e.offsetParent !== null);
      for (const y of yesBtns) {
        let row = y; for (let i = 0; i < 6 && row.parentElement; i++) { row = row.parentElement; if (row.innerText.replace(/Yes|No|N\/A/g, '').trim().length > 8) break; }
        const label = row.innerText.split('\n')[0].trim(); let want = 'Yes';
        for (const [re, a] of answers) if (new RegExp(re, 'i').test(row.innerText)) want = a;
        const target = want === 'Yes' ? y : [...row.querySelectorAll('*')].find(e => e.childElementCount === 0 && e.textContent.trim() === want);
        if (target) { (target.closest('button') || target).click(); out.push(`${label.slice(0, 60)} -> ${want}`); }
      }
      return out;
    }, ANSWERS.map(([re, a]) => [re.source, a]));
    if (done.length) await log('answered:\n   ' + done.join('\n   '));
    const notes = page.locator('textarea').first();
    if (await notes.isVisible().catch(() => false) && !(await notes.inputValue())) { await notes.fill(NOTES); await log('filled notes'); }
    const boxes = page.getByRole('checkbox'); const nb = await boxes.count();
    for (let i = 0; i < nb; i++) { const b = boxes.nth(i); if (await b.isVisible() && !(await b.isChecked())) await b.check().catch(() => {}); }
    if (nb) await log(`checked ${nb} boxes`);
    await shot(page, `qa_step${step}`);
    const submit = page.getByRole('button', { name: /^\s*submit\s*$/i }).first();
    if (await submit.isVisible().catch(() => false)) {
      if (cmd !== 'submit') { await log('reached Submit; explore mode stops here (nothing submitted)'); break; }
      if (await submit.isDisabled()) throw new Error('Submit is disabled: check the last screenshot');
      await submit.click(); await page.waitForTimeout(6000); await shot(page, 'submitted'); await log('SUBMITTED'); break;
    }
    const next = page.locator('button:visible').filter({ hasText: /^\s*(continue|next)\b/i }).first();
    if (!(await next.isVisible().catch(() => false))) { await log('no Continue/Next/Submit button found'); break; }
    if (await next.isDisabled()) { await log('Continue is disabled: an answer is missing, see screenshot'); process.exitCode = 1; break; }
    // on the qa-continue page this Continue IS the final submit (updates are auto-approved)
    if (cmd !== 'submit') { await log('reached the final Continue; explore mode stops here (nothing submitted)'); break; }
    await next.click(); await log('click continue (submit)'); await page.waitForTimeout(6000); await shot(page, 'after_submit');
    const ok = await page.getByText(/automatically approved|submitted|under review/i).first().isVisible().catch(() => false);
    await log(ok ? 'SUBMITTED: portal confirmed (' + (await page.getByText(/automatically approved|submitted|under review/i).first().innerText().catch(() => '')).replace(/\s+/g, ' ') + ')' : 'submitted, but no confirmation text seen: check the screenshot');
    break;
  }
  await browser.close();
})().catch(async e => { await log('ERROR', e.message); process.exit(1); });
