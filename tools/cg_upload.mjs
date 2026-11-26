#!/usr/bin/env node
// Upload a Strike Zone build (dist/) to the CrazyGames Developer Portal without the browser.
// Uses the same endpoints the portal's own web app uses (graph.crazygames.com, Firebase auth).
// UNOFFICIAL: CrazyGames publishes no upload API, so this can break when the portal changes.
//
// Auth: CG_REFRESH_TOKEN = your Firebase refresh token (portal tab > DevTools > Application >
//   IndexedDB > firebaseLocalStorageDb > firebaseLocalStorage > value.stsTokenManager.refreshToken).
//   Store it as a secret (GitHub Actions secret or cloud env secret). Never paste it in chat.
//
// Usage:
//   node tools/cg_upload.mjs check                 # auth + list your submissions (read-only)
//   node tools/cg_upload.mjs metrics [--json f]    # Basic Launch score per platform + last 7 days (read-only)
//   node tools/cg_upload.mjs upload [dir] [--id X] # upload files, attach them as a new build (draft)
//        --dry  upload files but do not attach them   (sending for review stays a portal click for now)
// Defaults: dir=dist, --id from CG_SUBMISSION_ID or the submission named "Strike Zone".
import { appendFile, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const API_KEY = 'AIzaSyAcnWHv0-RhlmU5ONOXzOSP0Q6ORQEMrNg'; // public web key from the portal bundle
const GRAPH = 'https://graph.crazygames.com';
const args = process.argv.slice(2);
const cmd = args[0] || 'check';
const opt = (k, d) => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(k);

let idToken = null, idTokenAt = 0;
async function token() {
  if (idToken && Date.now() - idTokenAt < 45 * 60e3) return idToken;
  const rt = process.env.CG_REFRESH_TOKEN;
  if (!rt) throw new Error('CG_REFRESH_TOKEN is not set');
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('token refresh failed: ' + JSON.stringify(j.error || j));
  idToken = j.id_token; idTokenAt = Date.now();
  return idToken;
}

async function gql(query, variables, label = 'graphql', retries = 3) {
  for (let attempt = 1; ; attempt++) {
    const t0 = Date.now();
    const r = await fetch(GRAPH, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(90e3),
    });
    const text = await r.text();
    let j = {}; try { j = JSON.parse(text); } catch {}
    if (r.ok && !j.errors) return j.data;
    const why = `${label}: HTTP ${r.status} after ${((Date.now() - t0) / 1e3).toFixed(1)} s: ` + (j.errors ? JSON.stringify(j.errors) : text.slice(0, 300));
    if (r.status >= 500 && attempt < retries) { console.log(`  ${why} (retrying)`); await new Promise((f) => setTimeout(f, 5e3 * attempt)); continue; }
    throw new Error(why);
  }
}

async function rest(path, body) {
  const r = await fetch(`${GRAPH}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

const LIST = `query { me { id submissions { id gameName gameStatus status isFullLaunch slug
  latestNonDraftBuild { id status createdAt totalFileSize } } } }`;
const SUB = `query($id: String!) { me { id submission(id: $id) {
  id gameName status gameStatus hasPendingBuildUpdate gameJamId
  multiplayerOptions { isMultiplayer supportsInstantJoin hasModeratedChat supportsPrivateLobby
    instantJoinLaunchesInPrivateLobby minLobbySize maxLobbySize }
  game { hasLeaderboard rawLeaderboardOptions }
  gameBuilds { id status createdAt loaderType fullscreen iosFriendly androidFriendly chromebookFriendly
    hasIap hasLeaderboard mobileOrientation platformAudioMuteSupported apsConfig { progressType }
    unityConfig { saveFileNames } files { fileName size uploadFileId } } } } }`;
// Details the portal re-sends with the files step. Separate query so a failure is easy to pin down.
const DETAILS = `query($id: String!) { me { id submission(id: $id) {
  id categoryId tagIds description controls marketingCreativesUrl steamStoreLink appStoreLink playStoreLink
  toolsUsed toolsUsedOther gameBuilds { id allowEmbed } } } }`;

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (!e.name.endsWith('.zip') && !e.name.startsWith('.')) out.push(p);
  }
  return out;
}

async function uploadFiles(dir) {
  const files = await walk(dir);
  const items = files.map((f) => ({ abs: f, path: relative(dir, f).split(sep).join('/') }));
  // 1. ask for presigned PUT URLs (the portal sends [{path, name}])
  const pre = await rest('upload/request-presigned-url',
    items.map((i) => ({ path: i.path, name: i.path.split('/').pop() })));
  // response: [{path, presignedUrl, type, encoding}], matched by path like the portal does
  const byPath = new Map((Array.isArray(pre) ? pre : []).map((p) => [p.path, p]));
  const missing = items.filter((i) => !byPath.get(i.path)?.presignedUrl).map((i) => i.path);
  if (missing.length) throw new Error(`no presigned url for ${missing.length} file(s), e.g. ${missing[0]}; response: ` + JSON.stringify(pre).slice(0, 300).replace(/X-Amz-[^&"]*/g, '…'));
  const done = [];
  let n = 0;
  // 2. PUT each file, 3. confirm it (returns {fileName, size, uploadId})
  const queue = items.map((it) => { const p = byPath.get(it.path); return { it, ps: { url: p.presignedUrl, type: p.type, encoding: p.encoding } }; });
  async function worker() {
    for (let q; (q = queue.shift());) {
      const body = await readFile(q.it.abs);
      const h = { 'If-None-Match': '*' };
      if (q.ps.type) h['Content-Type'] = q.ps.type;
      if (q.ps.encoding) h['Content-Encoding'] = q.ps.encoding;
      const put = await fetch(q.ps.url, { method: 'PUT', body, headers: h });
      if (!put.ok) throw new Error(`PUT ${q.it.path}: ${put.status} ${await put.text()}`);
      const c = await rest('upload/check-presigned-url-upload',
        { filePath: q.it.path, uncompressedSize: body.length, presignedUrl: q.ps.url });
      done.push({ path: c.fileName || q.it.path, size: c.size ?? body.length, uploadId: c.uploadId });
      if (++n % 25 === 0 || n === items.length) console.log(`  uploaded ${n}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return done;
}

// Basic Launch evaluation, same query and scoring the portal's metrics page uses (portal v2.137).
// Each metric scores 1..(thresholds+1) = 1..5: +1 for every benchmark threshold the value is strictly above.
// scoringVersion 3 adds CTR as a 4th metric (max 20), otherwise 3 metrics (max 15).
const BASIC_LAUNCH = `query($slug: String!) { gameBySlug(slug: $slug) { basicLaunchStatsAndBenchmarks {
  basicLaunchStart basicLaunchExpire evaluationStart evaluationEnd totalPlays scoringVersion
  desktop { ...M } mobile { ...M } } } }
  fragment M on BasicLaunchPerformanceIndicators {
    metrics { averagePlaytime retentionD1 gameplayConversion ctr }
    benchmarks { averagePlaytime retentionD1 gameplayConversion ctr } }`;
const DAILY = `query($slug: String!, $options: StatsForPeriodOptionsInput!) { gameBySlug(slug: $slug) {
  desktop: dailyStats(options: $options, device: desktop) { ...D }
  mobile: dailyStats(options: $options, device: mobile) { ...D } } }
  fragment D on DailyDeveloperAnalytics { date users avgTimeOnPage retentionD1 avgConversion avgLoadingTime ctr rating totalVotes }`;
const METRICS = [
  ['averagePlaytime', 'Avg playtime'], ['gameplayConversion', 'Conversion (1 min)'], ['retentionD1', 'D1 retention'], ['ctr', 'CTR'],
];
const fmtMetric = (k, v) => v == null ? '-' : k === 'averagePlaytime'
  ? `${Math.floor(v / 60000)}m${String(Math.round((v % 60000) / 1000)).padStart(2, '0')}s` : `${(v * 100).toFixed(2)}%`;
function scoreMetric(v, th) {
  let s = th.length + 1;
  for (let i = 0; i < th.length; i++) if (v == null || v <= th[i]) { s = i + 1; break; }
  return { value: v, score: s, max: th.length + 1, next: s <= th.length ? th[s - 1] : null };
}
function scorePlatform(p, version) {
  if (!p) return null;
  const keys = METRICS.map((m) => m[0]).filter((k) => k !== 'ctr' || version === 3);
  const out = { metrics: {}, total: 0, max: 0 };
  for (const k of keys) {
    const th = p.benchmarks?.[k];
    if (!th?.length) return null;
    const r = scoreMetric(p.metrics?.[k] ?? null, th);
    out.metrics[k] = { ...r, thresholds: th };
    out.total += r.score; out.max += r.max;
  }
  return out;
}

async function metrics(me) {
  const sub = me.submissions.find((s) => s.id === process.env.CG_SUBMISSION_ID)
    || me.submissions.find((s) => /strike zone/i.test(s.gameName));
  if (!sub?.slug) throw new Error('no game slug found');
  const bl = (await gql(BASIC_LAUNCH, { slug: sub.slug }, 'basic launch stats')).gameBySlug?.basicLaunchStatsAndBenchmarks;
  const lines = [], res = { slug: sub.slug, fetchedAt: new Date().toISOString(), basicLaunch: bl, scores: {}, daily: null };
  const d = (x) => x ? String(x).slice(0, 10) : '-';
  if (!bl) lines.push('No Basic Launch stats returned (no evaluation data yet).');
  else {
    lines.push(`## ${sub.gameName}: Basic Launch score`, '',
      `Evaluation ${d(bl.evaluationStart)} to ${d(bl.evaluationEnd)} · Basic Launch ${d(bl.basicLaunchStart)} to ${d(bl.basicLaunchExpire)} · plays ${bl.totalPlays ?? '-'} · scoring v${bl.scoringVersion}`, '');
    for (const plat of ['desktop', 'mobile']) {
      const sc = scorePlatform(bl[plat], bl.scoringVersion);
      res.scores[plat] = sc;
      if (!sc) { lines.push(`**${plat}**: not enough data yet`, ''); continue; }
      lines.push(`**${plat}: ${sc.total}/${sc.max}**`, '', '| Metric | Value | Score | Next score at | Thresholds |', '|---|---|---|---|---|');
      for (const [k, label] of METRICS) {
        const m = sc.metrics[k]; if (!m) continue;
        lines.push(`| ${label} | ${fmtMetric(k, m.value)} | ${m.score}/${m.max} | ${m.next == null ? 'top' : '> ' + fmtMetric(k, m.next)} | ${m.thresholds.map((t) => fmtMetric(k, t)).join(' / ')} |`);
      }
      lines.push('');
    }
  }
  try {
    const until = new Date(Date.now() - 864e5), from = new Date(until - 6 * 864e5);
    const day = (x) => x.toISOString().slice(0, 10);
    const g = (await gql(DAILY, { slug: sub.slug, options: { from: day(from), until: day(until) } }, 'daily stats', 1)).gameBySlug;
    res.daily = g;
    for (const plat of ['desktop', 'mobile']) {
      const rows = g?.[plat] || [];
      if (!rows.length) continue;
      lines.push(`**${plat}, daily (portal dashboard)**`, '', '| Date | Users | Avg time | Conversion | D1 | Load |', '|---|---|---|---|---|---|');
      for (const r of rows) lines.push(`| ${d(r.date)} | ${r.users ?? '-'} | ${r.avgTimeOnPage == null ? '-' : Math.round(r.avgTimeOnPage) + ' s'} | ${fmtMetric('x', r.avgConversion)} | ${fmtMetric('x', r.retentionD1)} | ${r.avgLoadingTime == null ? '-' : (+r.avgLoadingTime).toFixed(1)} |`);
      lines.push('');
    }
  } catch (e) { lines.push(`(daily stats unavailable: ${e.message.slice(0, 200)})`); }
  const md = lines.join('\n');
  console.log(md);
  const jf = opt('--json');
  if (jf) await writeFile(jf, JSON.stringify(res, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md + '\n');
}

async function main() {
  const me = (await gql(LIST, undefined, 'list submissions')).me;
  if (cmd === 'check') {
    console.log(`auth ok (developer ${me.id})`);
    for (const s of me.submissions) console.log(`- ${s.id}  ${s.gameName}  [${s.status}${s.isFullLaunch ? ', full launch' : ''}]  build ${s.latestNonDraftBuild?.status || '-'}`);
    return;
  }
  if (cmd === 'metrics') return metrics(me);
  if (cmd !== 'upload') throw new Error('unknown command ' + cmd);
  const id = opt('--id', process.env.CG_SUBMISSION_ID)
    || me.submissions.find((s) => /strike zone/i.test(s.gameName))?.id;
  if (!id) throw new Error('no submission id (pass --id)');
  const sub = (await gql(SUB, { id }, 'read submission')).me.submission;
  const det = (await gql(DETAILS, { id }, 'read details')).me.submission;
  Object.assign(sub, { ...det, gameBuilds: sub.gameBuilds });
  const b = sub.gameBuilds[sub.gameBuilds.length - 1];
  b.allowEmbed = det.gameBuilds.find((x) => x.id === b.id)?.allowEmbed;
  const dir = args[1] && !args[1].startsWith('--') ? args[1] : 'dist';
  await stat(join(dir, 'index.html'));
  console.log(`submission ${sub.id} "${sub.gameName}" [${sub.status}], base build ${b.id} (${b.files.length} files)`);
  const gameFiles = await uploadFiles(dir);
  // Same shape the portal's "Game files" step sends (updateStep baseInfo), keeping current settings.
  const input = {
    id: sub.id, updateStep: 'baseInfo', gameName: sub.gameName, gameLoaderType: b.loaderType,
    hasIAP: !!b.hasIap, hasLeaderboard: !!b.hasLeaderboard, isChromebookFriendly: !!b.chromebookFriendly,
    platformAudioMuteSupported: !!b.platformAudioMuteSupported, fullscreen: b.fullscreen,
    isIOSFriendly: !!b.iosFriendly, isAndroidFriendly: !!b.androidFriendly,
    orientation: (b.iosFriendly || b.androidFriendly) ? b.mobileOrientation : null,
    multiplayerOptions: sub.multiplayerOptions, gameJamId: sub.gameJamId,
    apsDetail: { progressType: b.apsConfig?.progressType || 'NO' }, gameFiles, allowEmbed: !!b.allowEmbed,
    // The portal also sends the details form with this step; resend current values so nothing is cleared.
    ...(sub.categoryId ? {
      categoryId: sub.categoryId, tagIds: sub.tagIds, description: sub.description, controls: sub.controls,
      marketingCreativesUrl: sub.marketingCreativesUrl ?? undefined, steamStoreLink: sub.steamStoreLink ?? undefined,
      appStoreLink: sub.appStoreLink ?? undefined, playStoreLink: sub.playStoreLink ?? undefined,
      toolsUsed: sub.toolsUsed ?? undefined,
      toolsUsedOther: sub.toolsUsedOther ?? undefined,
    } : {}),
  };
  if (flag('--dry')) { console.log(JSON.stringify({ ...input, gameFiles: `${gameFiles.length} files`, description: input.description && `${input.description.length} chars`, controls: input.controls && `${input.controls.length} chars` }, null, 2)); return; }
  const upd = await gql(`mutation($input: DeveloperSubmissionUpdateInput!) {
    developerSubmissionUpdate(input: $input) { id status hasPendingBuildUpdate gameBuilds { id status createdAt } } }`, { input }, 'attach build', 1);
  const s2 = upd.developerSubmissionUpdate;
  console.log(`new build attached: ${JSON.stringify(s2.gameBuilds.at(-1))}, pending update: ${s2.hasPendingBuildUpdate}`);
  if (flag('--submit')) {
    // TODO confirm on first real run which step the portal uses for a live game's update
    // (AddQAResultAndNote + SubmitForApproval vs Release). Left manual until verified.
    console.log('--submit not wired yet: finish the update in the portal (one click).');
  }
}

main().catch((e) => { console.error('cg_upload:', e.message); process.exit(1); });
