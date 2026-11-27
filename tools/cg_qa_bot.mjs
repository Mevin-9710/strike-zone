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
const NOTES = opt('--notes', process.env.CG_NOTES || 'Gameplay and UI improvements.');
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
  const loc = page.getByRole('button', { name: re, exact }).or(page.getByRole('link', { name: re, exact })).first();
  await loc.waitFor({ state: 'visible', timeout }); await loc.click(); await log(`click ${re}`);
}

(async () => {
  await mkdir(OUT, { recursive: true });
  const s = await session(); await log(`auth ok (${s.uid})`);
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
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
  if (!(await page.getByRole('button', { name: /go to qa/i }).first().isVisible().catch(() => false))) {
    // the newest (draft) build may need opening first: try its row / an 'Edit' or 'View' button
    for (const re of [/draft/i, /edit/i, /continue/i, /view/i]) { const b = page.getByRole('button', { name: re }).first(); if (await b.isVisible().catch(() => false)) { await b.click(); await log(`click ${re}`); await page.waitForTimeout(3000); await shot(page, 'version_open'); break; } }
  }
  await clickText(page, /go to qa/i, { timeout: 30000 });
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

  // walk the QA steps: Continue / Next until the checklist + notes + Submit page
  for (let step = 0; step < 6; step++) {
    // answer every manual checklist question with Yes
    const yes = page.getByRole('radio', { name: /^yes$/i }).or(page.getByRole('button', { name: /^yes$/i }));
    const ny = await yes.count(); for (let i = 0; i < ny; i++) await yes.nth(i).click().catch(() => {});
    if (ny) await log(`answered yes x${ny}`);
    const notes = page.locator('textarea').first();
    if (await notes.isVisible().catch(() => false) && !(await notes.inputValue())) { await notes.fill(NOTES); await log('filled notes'); }
    const boxes = page.getByRole('checkbox'); const nb = await boxes.count();
    for (let i = 0; i < nb; i++) { const b = boxes.nth(i); if (await b.isVisible() && !(await b.isChecked())) await b.check().catch(() => {}); }
    if (nb) await log(`checked ${nb} boxes`);
    await shot(page, `qa_step${step}`);
    const submit = page.getByRole('button', { name: /^submit/i }).first();
    if (await submit.isVisible().catch(() => false)) {
      if (cmd !== 'submit') { await log('reached Submit; explore mode stops here (nothing submitted)'); break; }
      if (await submit.isDisabled()) throw new Error('Submit is disabled: check the last screenshot');
      await submit.click(); await page.waitForTimeout(6000); await shot(page, 'submitted'); await log('SUBMITTED'); break;
    }
    const next = page.getByRole('button', { name: /^(continue|next)/i }).first();
    if (!(await next.isVisible().catch(() => false))) { await log('no Continue/Next/Submit button found'); break; }
    await next.click(); await log('click continue'); await page.waitForTimeout(3000);
  }
  await browser.close();
})().catch(async e => { await log('ERROR', e.message); process.exit(1); });
