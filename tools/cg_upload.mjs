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
//   node tools/cg_upload.mjs upload [dir] [--id X] # upload files, attach them as a new build (draft)
//        --dry  upload files but do not attach them   (sending for review stays a portal click for now)
// Defaults: dir=dist, --id from CG_SUBMISSION_ID or the submission named "Strike Zone".
import { readdir, readFile, stat } from 'node:fs/promises';
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

async function gql(query, variables) {
  const r = await fetch(GRAPH, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors) throw new Error('graphql: ' + JSON.stringify(j.errors || r.status));
  return j.data;
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
  const list = Array.isArray(pre) ? pre : pre.files || pre.urls || Object.values(pre);
  if (list.length !== items.length) throw new Error('unexpected presign response: ' + JSON.stringify(pre).slice(0, 400));
  const done = [];
  let n = 0;
  // 2. PUT each file, 3. confirm it (returns {fileName, size, uploadId})
  const queue = items.map((it, k) => ({ it, ps: list[k].presigned || list[k] }));
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

async function main() {
  const me = (await gql(LIST)).me;
  if (cmd === 'check') {
    console.log(`auth ok (developer ${me.id})`);
    for (const s of me.submissions) console.log(`- ${s.id}  ${s.gameName}  [${s.status}${s.isFullLaunch ? ', full launch' : ''}]  build ${s.latestNonDraftBuild?.status || '-'}`);
    return;
  }
  if (cmd !== 'upload') throw new Error('unknown command ' + cmd);
  const id = opt('--id', process.env.CG_SUBMISSION_ID)
    || me.submissions.find((s) => /strike zone/i.test(s.gameName))?.id;
  if (!id) throw new Error('no submission id (pass --id)');
  const sub = (await gql(SUB, { id })).me.submission;
  const b = sub.gameBuilds[sub.gameBuilds.length - 1];
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
  };
  if (flag('--dry')) { console.log(JSON.stringify({ ...input, gameFiles: `${gameFiles.length} files` }, null, 2)); return; }
  const upd = await gql(`mutation($input: DeveloperSubmissionUpdateInput!) {
    developerSubmissionUpdate(input: $input) { id status hasPendingBuildUpdate gameBuilds { id status createdAt } } }`, { input });
  const s2 = upd.developerSubmissionUpdate;
  console.log(`new build attached: ${JSON.stringify(s2.gameBuilds.at(-1))}, pending update: ${s2.hasPendingBuildUpdate}`);
  if (flag('--submit')) {
    // TODO confirm on first real run which step the portal uses for a live game's update
    // (AddQAResultAndNote + SubmitForApproval vs Release). Left manual until verified.
    console.log('--submit not wired yet: finish the update in the portal (one click).');
  }
}

main().catch((e) => { console.error('cg_upload:', e.message); process.exit(1); });
