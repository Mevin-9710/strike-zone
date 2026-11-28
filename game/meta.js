// Meta progression: XP levels, the battle pass (pays coins), shop items (charms + sprays), story unlocks, intel files.
import * as THREE from 'three';

const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } } };

export const XP_PER_LEVEL = 800, PASS_TIERS = 40;
export const XP = { kill: 50, head: 25, objective: 150, breach: 40, intel: 100, barrel: 30, win: 600, firstClear: 400 };
export const tierCoins = t => (t % 5 === 0 ? 500 : 150);

export const profile = Object.assign({ xp: 0, coins: 0, owned: ['charm_none', 'spray_gg'], charm: 'charm_none', spray: 'spray_gg', intel: [], claimed: 0, upgrades: {}, upPoints: 0, totals: { kills: 0, wins: 0, heads: 0, breaches: 0 } }, store.get('sz_profile', {}));
export const saveProfile = () => store.set('sz_profile', profile);
export const level = () => Math.floor(profile.xp / XP_PER_LEVEL) + 1;
export const levelProgress = () => (profile.xp % XP_PER_LEVEL) / XP_PER_LEVEL;

// Add XP; pays any pass tiers reached. Returns [{tier, coins}] newly paid.
export function addXP(n) {
  profile.xp += Math.max(0, Math.round(n));
  const paid = [];
  while (profile.claimed < Math.min(PASS_TIERS, level() - 1)) { profile.claimed++; const c = tierCoins(profile.claimed); profile.coins += c; paid.push({ tier: profile.claimed, coins: c }); }
  saveProfile(); return paid;
}

// ---------- shop ----------
export const CHARMS = {
  charm_none: { name: 'None', price: 0 },
  charm_star: { name: 'Gold Star', price: 150, shape: 'star', color: 0xffd23b },
  charm_die: { name: 'Lucky Die', price: 200, shape: 'die', color: 0xffffff },
  charm_heart: { name: 'Heartbreaker', price: 250, shape: 'heart', color: 0xff3b47 },
  charm_ring: { name: 'Signal Ring', price: 250, shape: 'ring', color: 0x5fe6ff },
  charm_gem: { name: 'Covenant Gem', price: 350, shape: 'gem', color: 0xb44bff },
  charm_coin: { name: 'Halvane Coin', price: 300, shape: 'coin', color: 0xe6a93b },
  charm_skull: { name: 'Dead Air', price: 400, shape: 'skull', color: 0xeeeeee },
  charm_bolt: { name: 'Live Wire', price: 450, shape: 'bolt', color: 0x3ddc84 },
};
export const SPRAYS = {
  spray_gg: { name: 'GG', price: 0, glyph: 'GG', bg: '#ffd23b', fg: '#111' },
  spray_hlv: { name: 'HLV Crew', price: 150, glyph: 'HLV', bg: '#1d9bf0', fg: '#fff' },
  spray_star: { name: 'Superstar', price: 150, glyph: '★', bg: '#ff3b47', fg: '#ffd23b' },
  spray_skull: { name: 'Bones', price: 250, glyph: '☠', bg: '#111', fg: '#fff' },
  spray_heart: { name: 'Love Tap', price: 200, glyph: '♥', bg: '#ff8fb1', fg: '#c2185b' },
  spray_bolt: { name: 'Shock', price: 250, glyph: '⚡', bg: '#3ddc84', fg: '#111' },
  spray_eye: { name: 'Watcher', price: 300, glyph: '◉', bg: '#b44bff', fg: '#fff' },
  spray_ez: { name: 'EZ', price: 350, glyph: 'EZ', bg: '#ff9f1c', fg: '#111' },
  spray_voss: { name: 'Voss Was Here', price: 400, glyph: 'VOSS', bg: '#2b2d42', fg: '#5fe6ff' },
};
export function buy(id) {
  const it = CHARMS[id] || SPRAYS[id]; if (!it || profile.owned.includes(id) || profile.coins < it.price) return false;
  profile.coins -= it.price; profile.owned.push(id); equipItem(id); saveProfile(); return true;
}
export function equipItem(id) { if (!profile.owned.includes(id)) return; if (CHARMS[id]) profile.charm = id; else profile.spray = id; saveProfile(); }

// ---------- story unlocks (weapons + operatives come only from campaign progress) ----------
export const BASE_UNLOCKS = { weapons: ['ar7_lance', 'kestrel_bp', 'vex_p9'], operatives: ['rhea'] };
export const UNLOCKS = [            // index = mission completed
  { weapons: ['harrow_45'], operatives: ['kade'] }, { weapons: ['warden_br'] }, { weapons: ['bulldog_r6'], operatives: ['yuna'] },
  { weapons: ['grinder_lmg'] }, { operatives: ['tomas'] }, { weapons: ['longshot_bolt'] }, { weapons: ['hailstorm_mg'] },
  { operatives: ['amara'] }, { weapons: ['javelin_amr'] }, {}, {}, {},
];
// v17: XP levels unlock weapons too (Deathmatch players progress without the campaign)
export const LEVEL_WEAPONS = [[3, 'harrow_45'], [4, 'warden_br'], [6, 'bulldog_r6'], [8, 'grinder_lmg'], [10, 'longshot_bolt'], [12, 'hailstorm_mg'], [15, 'javelin_amr']];
export const LEVEL_OPERATIVES = [[2, 'kade'], [5, 'yuna'], [7, 'tomas'], [9, 'amara']];   // rebrand: operatives unlock by level (no campaign)
export function unlocked(progress) {
  const w = new Set(BASE_UNLOCKS.weapons), o = new Set(BASE_UNLOCKS.operatives);
  for (const [lv, id] of LEVEL_WEAPONS) if (level() >= lv) w.add(id);
  for (const [lv, id] of LEVEL_OPERATIVES) if (level() >= lv) o.add(id);
  for (const id of store.get('sz_gifts', [])) w.add(id);                         // v31 return gifts
  for (let i = 0; i < progress && i < UNLOCKS.length; i++) { (UNLOCKS[i].weapons || []).forEach(x => w.add(x)); (UNLOCKS[i].operatives || []).forEach(x => o.add(x)); }
  return { weapons: w, operatives: o };
}
export const unlockLevel = id => ([...LEVEL_WEAPONS, ...LEVEL_OPERATIVES].find(([, w]) => w === id) || [])[0] || null;
export function unlockSource(kind, id) { const i = UNLOCKS.findIndex(u => (u[kind] || []).includes(id)); return i < 0 ? null : i + 1; }

// ---------- intel files (every 3 intel caches opens one) ----------
export const FILES = [
  ['CIVIC SHIELD / ORIGIN', 'Civic Shield was founded to guard the grid. Its first director signed every order with one initial: O.'],
  ['VOSS / SERVICE RECORD', 'Rhea Voss, field operative. Previous call sign redacted. Recruited by Okonkwo personally, no interview.'],
  ['COVENANT / FUNDING', 'Covenant equipment is bought through shell firms. Three of them share a mailing address with Civic Shield HQ.'],
  ['THE COURIER', 'The courier shot at Low Tide carried a key, not a message. The key opens the Halvane grid master switch.'],
  ['PROJECT DEAD AIR', 'A plan to black out Halvane and blame the Covenant. Approval line: "Proceed. Make it look like them. O."'],
  ['OKONKWO / MEDICAL', 'Okonkwo has been treated for implant rejection. The implant matches the Covenant commanders\' comm chips.'],
  ['WARDEN PROTOCOL', 'If the grid falls, one person gets emergency control of the city. The protocol names that person: The Warden.'],
  ['VOSS / OLD NAME', 'Before Civic Shield, Voss was a Covenant cadet. Okonkwo pulled her out. He has been steering her ever since.'],
  ['IRON PSALM', 'The final device is not a bomb. It is a broadcast that hands the Warden Protocol to whoever holds the key.'],
  ['THE KEY', 'The key from Low Tide was never destroyed. Voss has carried it since Mission 2, in her gear, without knowing.'],
  ['LAST LIGHT', 'Okonkwo needs Voss at the civic tower. The key only works in the hands of the person it was coded to.'],
  ['AFTER', 'If Okonkwo falls, the protocol resets. Halvane gets its lights back, and Voss gets her name back.'],
];
export const filesOpen = () => Math.min(FILES.length, Math.floor(profile.intel.length / 3));

// ---------- 3D charm meshes (viewmodel + lobby preview) ----------
export function charmMesh(id) {
  const c = CHARMS[id]; if (!c || !c.shape) return null;
  const m = new THREE.MeshToonMaterial({ color: c.color, emissive: c.color, emissiveIntensity: 0.15 });
  const g = new THREE.Group(), s = 0.022;
  const add = (geo, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  switch (c.shape) {
    case 'star': { const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.45 : s, a = i / 10 * Math.PI * 2 + Math.PI / 2; sh[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } add(new THREE.ExtrudeGeometry(sh, { depth: s * 0.35, bevelEnabled: false })); break; }
    case 'die': add(new THREE.BoxGeometry(s * 1.4, s * 1.4, s * 1.4)); break;
    case 'heart': add(new THREE.SphereGeometry(s * 0.6, 10, 8), -s * 0.45, s * 0.3); add(new THREE.SphereGeometry(s * 0.6, 10, 8), s * 0.45, s * 0.3); add(new THREE.ConeGeometry(s * 0.95, s * 1.3, 12), 0, -s * 0.45).rotation.z = Math.PI; break;
    case 'ring': add(new THREE.TorusGeometry(s * 0.8, s * 0.22, 8, 18)); break;
    case 'gem': add(new THREE.OctahedronGeometry(s)); break;
    case 'coin': add(new THREE.CylinderGeometry(s, s, s * 0.25, 16)).rotation.x = Math.PI / 2; break;
    case 'skull': add(new THREE.SphereGeometry(s * 0.9, 12, 10)); add(new THREE.BoxGeometry(s * 1.0, s * 0.6, s * 0.9), 0, -s * 0.7); break;
    case 'bolt': { const sh = new THREE.Shape(); [[0.2, 1], [-0.5, -0.1], [0, -0.1], [-0.2, -1], [0.5, 0.15], [0, 0.15]].forEach(([x, y], i) => sh[i ? 'lineTo' : 'moveTo'](x * s, y * s)); add(new THREE.ExtrudeGeometry(sh, { depth: s * 0.3, bevelEnabled: false })); break; }
  }
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.035, 4), new THREE.MeshBasicMaterial({ color: 0x222222 })); chain.position.y = 0.0175 + s;
  const pivot = new THREE.Group(); g.position.y = -(0.035 + s); g.add(chain); chain.position.y = 0.0175 + s * 0.9; pivot.add(g);
  pivot.userData.swing = { a: 0, v: 0 };
  return pivot;
}

// ---------- sprays (canvas texture) ----------
const sprayCache = {};
export function sprayTexture(id) {
  if (sprayCache[id]) return sprayCache[id];
  const s = SPRAYS[id] || SPRAYS.spray_gg, cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = s.bg; g.strokeStyle = '#111'; g.lineWidth = 14;
  g.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 104 : 120; g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke();
  g.fillStyle = s.fg; g.font = `900 ${s.glyph.length > 2 ? 64 : 110}px Impact, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeText(s.glyph, 128, 136); g.fillText(s.glyph, 128, 136);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; sprayCache[id] = t; return t;
}
export const sprayDataURL = id => { const t = sprayTexture(id); return t.image.toDataURL(); };

// ---------- weapon upgrades (one point per mission win: +ammo or +damage, 5 ranks each) ----------
export const UP_MAX = 5, UP_DMG = 0.08, UP_AMMO = 0.25;
export const upg = id => (profile.upgrades[id] ??= { dmg: 0, ammo: 0 });
export const dmgMult = id => 1 + upg(id).dmg * UP_DMG;
export const reserveFor = (id, base) => Math.round(base * (1 + upg(id).ammo * UP_AMMO));
export function upgrade(id, kind) {
  const u = upg(id); if (profile.upPoints <= 0 || u[kind] >= UP_MAX) return false;
  u[kind]++; profile.upPoints--; saveProfile(); return true;
}
