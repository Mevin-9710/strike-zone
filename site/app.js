// Strike Zone site: install flow, media gallery, devlog, and Supabase-backed ideas/auth/subscriptions.
const $ = (s) => document.querySelector(s);
const SITE = window.SZ_SITE || {};
const ENV = window.SZ_ENV || {};
const DEMO = !(ENV.SUPABASE_URL && ENV.SUPABASE_ANON_KEY);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 3500);
}

// ---------- links ----------
const cg = $('#cgLink');
if (SITE.CRAZYGAMES_URL) { cg.href = SITE.CRAZYGAMES_URL; cg.textContent = 'Play on CrazyGames'; cg.target = '_blank'; cg.rel = 'noopener'; }
else { cg.removeAttribute('href'); cg.setAttribute('aria-disabled', 'true'); }
if (SITE.GITHUB_URL) $('#ghLink').href = SITE.GITHUB_URL; else $('#ghLink').remove();

// ---------- PWA install ----------
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
let deferred = null;
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone;
const installBtn = $('#installBtn');
if (standalone) installBtn.hidden = true;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; installBtn.textContent = '⤓ Install app'; });
addEventListener('appinstalled', () => { installBtn.hidden = true; toast('Installed. Strike Zone now works offline.'); });
installBtn.addEventListener('click', async () => {
  if (deferred) {
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    if (outcome === 'accepted') toast('Installing…');
  } else if (ios) {
    $('#iosDlg').showModal();
  } else {
    toast('Use your browser menu → "Install app" / "Add to Home screen". The game is cached for offline play once loaded.');
  }
});

// ---------- media ----------
const ph = (label, cls = '') => `<div class="ph ${cls}">${label}</div>`;
fetch('/media/media.json').then((r) => r.json()).catch(() => ({})).then((m) => {
  const shots = m.screenshots || [], clips = m.clips || [], trailer = m.trailer || [];
  $('#trailer').innerHTML = trailer.length
    ? `<video src="${trailer[0].src}" controls preload="none" playsinline ${shots[0] ? `poster="${shots[0].src}"` : ''}></video>`
    : ph('TRAILER INCOMING');
  $('#gallery').innerHTML = shots.length
    ? shots.map((s) => `<a href="${s.src}" target="_blank" rel="noopener"><img src="${s.src}" alt="Strike Zone screenshot" loading="lazy" decoding="async"></a>`).join('')
    : [1, 2, 3].map((i) => ph(`SCREENSHOT ${i} · CLASSIFIED`)).join('');
  $('#clips').innerHTML = clips.length
    ? clips.map((c) => `<video class="${c.vertical ? 'tall' : 'wide'}" src="${c.src}" muted loop playsinline controls preload="none"></video>`).join('')
    : ph('CLIP', 'wide') + ph('CLIP', 'tall');
  if (shots[0]) { const bg = $('.hero-bg'); bg.style.backgroundImage = `url(${shots[0].src})`; bg.classList.add('has-shot'); }
});

// ---------- devlog ----------
function md(src) {
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>');
  let out = '', list = false;
  for (const raw of src.split('\n')) {
    const l = raw.trim();
    if (/^\|/.test(l) || /^#/.test(l) && !l.startsWith('### ')) continue;
    const li = l.match(/^(?:[-*]|\d+\.)\s+(.*)/);
    if (li) { if (!list) { out += '<ul>'; list = true; } out += `<li>${inline(li[1])}</li>`; continue; }
    if (list) { out += '</ul>'; list = false; }
    if (l.startsWith('### ')) out += `<p><b>${inline(l.slice(4))}</b></p>`;
    else if (l) out += `<p>${inline(l)}</p>`;
  }
  return out + (list ? '</ul>' : '');
}
fetch('/devlog.json').then((r) => r.json()).then((entries) => {
  const box = $('#devlogList'), more = $('#devlogMore');
  let shown = 0;
  const render = (n) => {
    box.insertAdjacentHTML('beforeend', entries.slice(shown, shown + n).map((e) => `<article><time datetime="${e.date}">${e.date}</time><h3>${esc(e.title)}</h3><div class="body">${md(e.body)}</div><button class="btn link more" type="button">Read more</button></article>`).join(''));
    shown += n;
    more.hidden = shown >= entries.length;
  };
  box.innerHTML = '';
  if (!entries.length) box.innerHTML = '<p class="muted">No reports yet.</p>';
  render(5);
  more.onclick = () => render(10);
  box.addEventListener('click', (e) => {
    if (!e.target.classList.contains('more')) return;
    const b = e.target.previousElementSibling;
    e.target.textContent = b.classList.toggle('open') ? 'Show less' : 'Read more';
  });
}).catch(() => { $('#devlogList').innerHTML = '<p class="muted">Devlog unavailable offline.</p>'; });

// ---------- Supabase ----------
let sb = null, user = null, myVotes = new Set();
const authBtn = $('#authBtn');
const comingSoon = () => toast('Coming soon: accounts and voting are not switched on yet.');

async function initSupabase() {
  if (DEMO) { renderIdeas(demoIdeas); return; }
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    sb = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY);
    const { data } = await sb.auth.getSession();
    setUser(data.session?.user || null);
    sb.auth.onAuthStateChange((_e, s) => setUser(s?.user || null));
  } catch (err) {
    sb = null;
    renderIdeas(demoIdeas);
  }
}
function setUser(u) {
  user = u;
  authBtn.textContent = u ? 'Sign out' : 'Sign in';
  authBtn.title = u ? u.email : '';
  loadIdeas();
}
authBtn.onclick = async () => {
  if (!sb) return $('#authDlg').showModal();
  if (user) { await sb.auth.signOut(); toast('Signed out.'); } else $('#authDlg').showModal();
};
$('#authDlg').addEventListener('close', async () => {
  const how = $('#authDlg').returnValue;
  if (how === 'cancel' || !how) return;
  if (!sb) return comingSoon();
  const redirect = location.origin + '/#ideas';
  const email = $('#authEmail').value.trim();
  if (!email) return toast('Enter your email first.');
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
  toast(error ? `Could not send link: ${error.message}` : 'Check your inbox for the sign-in link.');
});

const demoIdeas = [
  { id: 1, title: 'Co-op mode: two operatives, one bomb', votes: 0 },
  { id: 2, title: 'Night mission on a cargo ship', votes: 0 },
  { id: 3, title: 'Replay of your best defuse', votes: 0 },
];
async function loadIdeas() {
  if (!sb) return renderIdeas(demoIdeas);
  const { data, error } = await sb.from('ideas_ranked').select('id,title,votes').order('votes', { ascending: false }).order('created_at', { ascending: false }).limit(50);
  if (error) return renderIdeas(demoIdeas);
  myVotes = new Set();
  if (user) {
    const { data: v } = await sb.from('idea_votes').select('idea_id').eq('user_id', user.id);
    (v || []).forEach((r) => myVotes.add(r.idea_id));
  }
  renderIdeas(data.length ? data : []);
}
function renderIdeas(list) {
  $('#ideaList').innerHTML = list.length
    ? list.map((i) => `<li><button class="vote ${myVotes.has(i.id) ? 'on' : ''}" data-id="${i.id}" type="button" aria-label="Upvote">▲<span>${i.votes}</span></button><span>${esc(i.title)}</span></li>`).join('')
    : '<li class="muted">No ideas yet. Be the first.</li>';
}
$('#ideaList').addEventListener('click', async (e) => {
  const b = e.target.closest('.vote');
  if (!b) return;
  if (!sb) return comingSoon();
  if (!user) { toast('Sign in to vote.'); return $('#authDlg').showModal(); }
  const id = Number(b.dataset.id);
  const { error } = myVotes.has(id)
    ? await sb.from('idea_votes').delete().eq('idea_id', id).eq('user_id', user.id)
    : await sb.from('idea_votes').insert({ idea_id: id });
  if (error) toast('Vote failed. Try again.');
  loadIdeas();
});
$('#ideaForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!sb) return comingSoon();
  if (!user) { toast('Sign in to submit ideas.'); return $('#authDlg').showModal(); }
  const title = e.target.title.value.trim();
  const { error } = await sb.from('ideas').insert({ title });
  if (error) return toast('Could not submit: ' + error.message);
  e.target.reset();
  toast('Idea filed. Thanks, operative.');
  loadIdeas();
});
$('#subForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!sb) return comingSoon();
  const email = e.target.email.value.trim().toLowerCase();
  const { error } = await sb.from('subscribers').insert({ email });
  if (error && error.code !== '23505') return toast('Could not subscribe: ' + error.message);
  e.target.reset();
  toast(error ? 'You are already on the list.' : 'Subscribed. We will radio you.');
});

initSupabase();
