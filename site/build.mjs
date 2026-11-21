// Builds the deployable site into site/.out:
//   /            landing page (site/*)
//   /play/       the game, copied from the repo root (same file set as tools/build_dist.sh)
//   /media/      whatever exists in media/{screenshots,clips,trailer} + media.json
//   /devlog.json parsed from DEV-LOG.md
//   /env.js      SUPABASE_URL / SUPABASE_ANON_KEY from env (empty = demo mode)
//   /sw.js       service worker with a generated precache list
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SITE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SITE, '..');
const OUT = path.join(SITE, '.out');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const cp = (src, dst) => {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true, filter: (s) => !s.endsWith('.md') });
};

// 1. landing page
for (const f of ['index.html', 'style.css', 'app.js', 'site.config.js', 'manifest.webmanifest', 'icons']) {
  cp(path.join(SITE, f), path.join(OUT, f));
}

// 2. game -> /play/
const PLAY = path.join(OUT, 'play');
for (const f of ['index.html', 'game.js', 'menu.css', 'v14.css', 'game', 'world', 'fx', 'fonts', 'sfx']) cp(path.join(ROOT, f), path.join(PLAY, f));
for (const f of ['three.module.js', 'three.core.js', 'addons/loaders/GLTFLoader.js',
  'addons/utils/BufferGeometryUtils.js', 'addons/utils/SkeletonUtils.js']) cp(path.join(ROOT, 'lib', f), path.join(PLAY, 'lib', f));
for (const d of ['kenney', 'props', 'rigged', 'weapons']) {
  const src = path.join(ROOT, 'models', d);
  if (!fs.existsSync(src)) continue;
  for (const f of fs.readdirSync(src)) if (f.endsWith('.glb')) cp(path.join(src, f), path.join(PLAY, 'models', d, f));
}
// let the game page register the shared SW and link the manifest
const playIndex = path.join(PLAY, 'index.html');
if (fs.existsSync(playIndex)) {
  let html = fs.readFileSync(playIndex, 'utf8');
  html = html.replace('</head>', `<link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#0b0d10"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"><meta name="apple-mobile-web-app-capable" content="yes"><script>if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js'))</script></head>`);
  fs.writeFileSync(playIndex, html);
}

// 3. media
const media = { screenshots: [], clips: [], trailer: [] };
for (const kind of Object.keys(media)) {
  const src = path.join(ROOT, 'media', kind);
  if (!fs.existsSync(src)) continue;
  for (const f of fs.readdirSync(src).sort()) {
    if (!/\.(png|jpe?g|webp|mp4|webm)$/i.test(f)) continue;
    cp(path.join(src, f), path.join(OUT, 'media', kind, f));
    media[kind].push({ src: `/media/${kind}/${f}`, vertical: /(9x16|9-16|vertical|portrait|short)/i.test(f) });
  }
}
fs.mkdirSync(path.join(OUT, 'media'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'media', 'media.json'), JSON.stringify(media));

// 4. devlog: every "## heading" section of DEV-LOG.md, newest first
const devlog = [];
const log = fs.existsSync(path.join(ROOT, 'DEV-LOG.md')) ? fs.readFileSync(path.join(ROOT, 'DEV-LOG.md'), 'utf8') : '';
let cur = null;
for (const line of log.split('\n')) {
  const h = line.match(/^## (.+)/);
  if (h) { cur = { title: h[1].trim(), body: [] }; devlog.push(cur); continue; }
  if (cur) cur.body.push(line);
}
const entries = devlog
  .map((e) => {
    const d = e.title.match(/(\d{4}-\d{2}-\d{2})/);
    return { title: e.title.replace(/^\d{4}-\d{2}-\d{2}\s*[·:—-]\s*/, '').replace(/\s*\(\d{4}-\d{2}-\d{2}\)/, ''), date: d ? d[1] : '', body: e.body.join('\n').trim() };
  })
  .filter((e) => e.date && e.body);
entries.reverse();
fs.writeFileSync(path.join(OUT, 'devlog.json'), JSON.stringify(entries));

// 5. env
const env = { SUPABASE_URL: process.env.SUPABASE_URL || '', SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '' };
fs.writeFileSync(path.join(OUT, 'env.js'), `window.SZ_ENV=${JSON.stringify(env)};`);

// 6. service worker: precache everything except media videos
const files = [];
const walk = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p); else files.push('/' + path.relative(OUT, p).split(path.sep).join('/'));
  }
};
walk(OUT);
const precache = files.filter((f) => !f.startsWith('/media/') || f.endsWith('.json')).map((f) => f.replace(/\/index\.html$/, '/'));
const hash = crypto.createHash('sha1');
for (const f of files.sort()) hash.update(f + fs.statSync(path.join(OUT, f)).size + fs.statSync(path.join(OUT, f)).mtimeMs);
const version = hash.digest('hex').slice(0, 10);
const sw = fs.readFileSync(path.join(SITE, 'sw.template.js'), 'utf8')
  .replace('__VERSION__', version)
  .replace('__PRECACHE__', JSON.stringify(precache));
fs.writeFileSync(path.join(OUT, 'sw.js'), sw);

const mb = files.reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0) / 1048576;
console.log(`site built: ${files.length} files, ${mb.toFixed(1)} MB, sw v${version}, devlog ${entries.length}, media ${Object.values(media).flat().length}, supabase ${env.SUPABASE_URL ? 'on' : 'demo'}`);
