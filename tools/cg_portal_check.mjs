#!/usr/bin/env node
// Detects changes in the CrazyGames Developer Portal that could break tools/cg_upload.mjs.
// Downloads the portal's public JS bundle, extracts the parts the upload script depends on
// (endpoints, GraphQL input fields, request shapes) and compares them with
// tools/cg_portal_fingerprint.json. Needs no login.
//   node tools/cg_portal_check.mjs          exit 0 = unchanged, 2 = changed (prints diff), 1 = error
//   node tools/cg_portal_check.mjs --write  save the current fingerprint as the new baseline
//   node tools/cg_portal_check.mjs --art    also fail on cover-art changes (otherwise they only warn, so art
//                                           drift never blocks a game build upload)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const FP = fileURLToPath(new URL('./cg_portal_fingerprint.json', import.meta.url));
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.text(); };

const { version } = JSON.parse(await get('https://graph.crazygames.com/devportal-version'));
const base = `https://builds.crazygames.com/devportal/v${version}/`;
const main = await get(base + 'bundle.js');
// chunks referenced by the bundle, plus the chunks those import (the art/video form lives two levels down)
const seen = new Set(), texts = [];
let next = [...new Set(main.match(/static\/js\/[\w-]+\.js/g) || [])].map((c) => c.split('/').pop());
for (let depth = 0; depth < 3 && next.length; depth++) {
  next = next.filter((c) => !seen.has(c)); next.forEach((c) => seen.add(c));
  const got = await Promise.all(next.map((c) => get(base + 'static/js/' + c).catch(() => '')));
  texts.push(...got);
  next = [...new Set(got.join('\n').match(/["'`]\.\/[\w-]+\.js["'`]/g) || [])].map((x) => x.slice(3, -1));
}
const all = main + texts.join('\n');

const inputFields = (name, kind = 'INPUT_OBJECT') => {
  const i = all.indexOf(`"kind":"${kind}","name":"${name}","description"`);
  if (i < 0) return null;
  const seg = all.slice(i, all.indexOf('"possibleTypes"', i));
  const key = kind === 'ENUM' ? '"enumValues":[' : '"inputFields":[';
  const body = seg.slice(seg.indexOf(key) + key.length);
  // top-level field names only: depth-1 objects inside the list
  const out = []; let d = 1;
  for (let k = 0; k < body.length && d > 0; k++) {
    const c = body[k];
    if (c === '[' || c === '{') { d++; if (d === 2 && body.startsWith('"name":"', k + 1)) out.push(body.slice(k + 9, body.indexOf('"', k + 9))); }
    else if (c === ']' || c === '}') d--;
  }
  return out.sort();
};
const has = (s) => all.includes(s);

const fp = {
  endpoints: {
    graph: has('graph:`https://graph.crazygames.com`'),
    requestPresigned: has(`upload/request-presigned-url`),
    checkPresigned: has('upload/check-presigned-url-upload'),
    presignBodyPathName: /JSON\.stringify\(\w+\.map\(\w+=>\(\{path:\w+\.path,name:\w+\.blob\?\.name\}\)\)\)/.test(all),
    presignResponseFields: /\{path:\w+,presignedUrl:\w+,type:\w+,encoding:\w+\}/.test(all),
    checkBodyKeys: /\{filePath:\w+\.path,uncompressedSize:\w+,presignedUrl:\w+\}/.test(all),
    putIfNoneMatch: has('"If-None-Match":`*`'),
    firebaseProjectProd: has('projectId:`crazygames-prod`'),
    firebaseApiKey: has('AIzaSyAcnWHv0-RhlmU5ONOXzOSP0Q6ORQEMrNg'),
  },
  graphql: {
    developerSubmissionUpdate: has('mutation developerSubmissionUpdate($input: DeveloperSubmissionUpdateInput!)'),
    DeveloperSubmissionUpdateInput: inputFields('DeveloperSubmissionUpdateInput'),
    UploadedFileInput: inputFields('UploadedFileInput'),
    SubmissionUpdateStep: inputFields('SubmissionUpdateStep', 'ENUM'),
    DeveloperSubmissionSubmitForApprovalInput: inputFields('DeveloperSubmissionSubmitForApprovalInput'),
    DeveloperSubmissionReleaseInput: inputFields('DeveloperSubmissionReleaseInput'),
    DeveloperSubmissionAddQAResultAndNoteInput: inputFields('DeveloperSubmissionAddQAResultAndNoteInput'),
    filesSentWithBaseInfoStep: has('updateStep:`baseInfo`'),
  },
  // cover art (cg_upload.mjs art): multipart POST /upload + developerSubmissionUpdateArt
  art: {
    uploadEndpoint: /\w+=\w+\(`upload`\),\w+=\w+\(`upload\/request-presigned-url`\)/.test(all),
    developerSubmissionUpdateArt: has('mutation DeveloperSubmissionUpdateArt($input: DeveloperSubmissionUpdateArtInput!)'),
    DeveloperSubmissionUpdateArtInput: inputFields('DeveloperSubmissionUpdateArtInput'),
    GameCoverWithUploadedFileInput: inputFields('GameCoverWithUploadedFileInput'),
    ArtVideoInput: inputFields('ArtVideoInput'),
    videoThumbnailCreate: has('mutation createVideoThumbnail($input: VideoThumbnailCreateInput!)') || has('videoThumbnailCreate(input:'),
    coverSizes: has('landscape (1920x1080), portrait (800x1200), and square (800x800)'),
  },
};

if (process.argv.includes('--write')) {
  await writeFile(FP, JSON.stringify({ portalVersion: version, ...fp }, null, 2) + '\n');
  console.log(`baseline saved for portal v${version}`);
  process.exit(0);
}
const old = JSON.parse(await readFile(FP, 'utf8'));
const diffs = [];
for (const g of ['endpoints', 'graphql', 'art']) for (const k of new Set([...Object.keys(old[g] || {}), ...Object.keys(fp[g])])) {
  const a = JSON.stringify(old[g]?.[k]), b = JSON.stringify(fp[g][k]);
  if (a !== b) diffs.push(`${g}.${k}: ${a} -> ${b}`);
}
console.log(`portal v${old.portalVersion} -> v${version}`);
const hard = diffs.filter((d) => !d.startsWith('art.') || process.argv.includes('--art'));
if (diffs.length > hard.length) console.log('warning, cover-art flow changed (art uploads may break):\n' + diffs.filter((d) => !hard.includes(d)).join('\n'));
if (!hard.length) { console.log('upload flow unchanged'); process.exit(0); }
console.log('UPLOAD FLOW CHANGED:\n' + hard.join('\n'));
process.exit(2);
