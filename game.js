// Strike Zone: Season 1. Full game: maps + collision, rigged enemies with AI, first-person weapons,
// abilities that drive gameplay, objectives, story radio, style D HUD. See DEV-LOG.md.
import { createFlow } from './game/menu-flow.js';
import * as THREE from 'three';
import { GLTFLoader } from './lib/addons/loaders/GLTFLoader.js';
import { World } from './world/collision.js';
import { loadKenney, dressMap } from './world/kenney.js';
import { loadArch } from './world/kenney-arch.js';
import { crazy } from './game/crazy.js';
import { buildM1, buildM2, buildM3, LIGHTING } from './world/maps.js';
import { AbilityFX } from './fx/abilities.js';
import { WEAPONS, PRIMARIES, SIDEARMS, Viewmodel, starTex } from './game/weapons.js';
import { ENEMY_TYPES, Enemy, loadEnemyAssets, calibrateGun } from './game/enemies.js';
import * as SkeletonUtils from './lib/addons/utils/SkeletonUtils.js';
import { RELEASE_AT } from './fx/abilities.js';
import { sfx, unlockAudio, music } from './game/audio.js';
import { toonify, outline } from './game/toon.js';
import { TouchControls, isTouchDevice, TOUCH_CSS } from './game/touch.js';
import { buildDistrict } from './world/procgen.js';
import * as META from './game/meta.js';
import * as FX from './game/feel.js';
import { createTutorial, tutorialDone } from './game/tutorial.js';
import { createOnboarding, onboardingDone } from './game/onboarding.js';
import { Mentor } from './game/mentor.js';
import { weaponInfo } from './game/weapons.js';
import { radio as RADIO } from './game/radio.js';
import * as MODES from './game/modes.js';
import { RC, loadRemote } from './game/remote.js';
import { track, at, onQuit } from './game/telemetry.js';
const TUT = { dt: 0, look: 0, moved: false, walked: false, jumped: false, slid: false, fired: false, aiming: false, reloaded: false, swapped: false, ab0: false, ab1: false, kills: 0, interacting: false };

const Q = new URLSearchParams(location.search);
const TEST = Q.has('test'), DEBUG = Q.has('debug') || TEST;
const $ = id => document.getElementById(id);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const fmt = s => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;
const errors = []; addEventListener('error', e => errors.push(String(e.message)));

const CFG = { retrieve: 2.5, breach: 1.2, fuse: 1.8, eye: 1.6, run: 5.2, walk: 2.6, jump: 7.2, sens: 0.0022, defuse: 5, plant: 3, hold: 20, useR: 2.3, blockR: 7 };

const ABILITIES = {
  smoke: { name: 'Smoke', icon: '☁', cd: 18 }, flash: { name: 'Flash', icon: '✸', cd: 14 }, dash: { name: 'Dash', icon: '»', cd: 8 },
  sensor: { name: 'Sensor', icon: '◉', cd: 16 }, shield: { name: 'Shield', icon: '⬡', cd: 24 }, decoy: { name: 'Decoy', icon: '♟', cd: 15 },
  lockdown: { name: 'Lockdown', icon: '⬢', cd: 28 }, drone: { name: 'Drone', icon: '✈', cd: 26 },
};

// ---------- missions + story ----------
const MISSIONS = [
  { id: 'm1', title: 'First Signal', build: buildM1, objective: 'defuse',
    brief: 'Halvane, noon. A Meridian Covenant device sits on the transit hub roof. Take the fire escape (stealth) or the stairwell (assault) and defuse it before the countdown ends.',
    routes: { stealth: { name: 'Stealth · fire escape', count: 5, timer: 180, spawn: 'stealth' }, assault: { name: 'Assault · stairwell', count: 8, timer: 140, spawn: 'assault' } },
    roster: ['guard', 'sniper', 'guard', 'commander', 'guard', 'guard', 'guard', 'guard'],
    pool: ['smoke', 'dash', 'flash'],
    radio: { start: [['OKONKWO', 'Rhea, the device is on the station roof. Covenant has the hub. Get up there.'], ['VOSS', 'Copy. Moving.']],
      contact: [['OKONKWO', 'Contact! They know you are here.']], near: [['OKONKWO', 'You are on it. Hold E and cut the wires.']], low: [['OKONKWO', 'Thirty seconds, Rhea!']] },
    win: { title: 'DEVICE DEFUSED', text: 'The tower is clean.\n\nSignature check: the device carried a Civic Shield signal.\n\nOkonkwo ordered that route. Why?' },
    failTimer: 'The device detonated.' },
  { id: 'm2', title: 'Low Tide', build: buildM2, objective: 'plant_hold',
    brief: 'Morning, harbor district. Get into the flooded vault, plant a counter-charge on the red Covenant server, then hold the area for 20 seconds while it cracks.',
    timer: 170, roster: ['guard', 'heavy', 'guard', 'guard', 'drone', 'guard', 'sniper', 'heavy'],
    pool: ['sensor', 'smoke', 'dash', 'shield', 'decoy', 'flash'],
    radio: { start: [['OKONKWO', 'Vault is under the warehouse. The red server is yours.'], ['VOSS', 'Water is up to the racks. Lovely.']],
      contact: [['COVENANT', 'Intruder on the dock! Seal the vault!']], near: [['OKONKWO', 'Plant it. Hold E.']], planted: [['OKONKWO', 'Charge is set. Hold the area, thirty seconds!']], low: [['OKONKWO', 'The vault seals in thirty!']] },
    win: { title: 'SERVER CRACKED', text: 'The vault server went dark. A courier file is loading.\n\nBefore it finished, a sniper shot the courier. The rifle used Civic Shield frequencies.\n\n"The courier had a message for you, Operative. It was addressed to your old name."' },
    failTimer: 'The vault sealed before the server cracked.' },
  { id: 'm3', title: 'Dead Air', build: buildM3, objective: 'defuse',
    brief: 'Dusk, the blackout block. Three devices: the alley, the north-east roof and the plaza. Defuse all three before the grid goes dark. Covenant heavies and a turret are on site.',
    timer: 220, roster: ['guard', 'heavy', 'sniper', 'commander', 'turret', 'guard', 'drone', 'heavy'],
    pool: ['smoke', 'dash', 'flash', 'sensor', 'shield', 'decoy', 'lockdown', 'drone'],
    radio: { start: [['OKONKWO', 'Three devices on the grid. Lights go out when the timer hits zero.'], ['VOSS', 'Then I will be quick.']],
      contact: [['COVENANT', 'She is here. Commander wants her alive. Mostly.']], near: [['OKONKWO', 'Device in reach. Hold E.']], device: [['OKONKWO', 'One down. Keep moving.']], low: [['OKONKWO', 'Thirty seconds to blackout!']] },
    win: { title: 'GRID SECURED', text: 'All three devices are down. The blackout is averted.\n\nOn the last feed, Okonkwo stands beside the Covenant commander. The final device was armed to your call sign.\n\n"Next time you hear my voice, it will be the last thing you hear."' },
    failTimer: 'The blackout hit the city.' },
  // ---------- chapter 2+: procedural districts around hand-built hubs ----------
  ...[
    ['m4', 'Static Bloom', { seed: 4141, theme: 'downtown', time: 'night', hub: 'tower', count: 2, hubSign: 'BLOOM FM' }, 'defuse', 210, 10,
      'Night, Bloom district. Two devices on the top floors of the BLOOM FM tower. Climb the stairwells floor by floor, or breach the west wall for a faster way in. Three intel caches are hidden in the district.',
      ['guard', 'guard', 'sniper', 'heavy', 'guard', 'commander', 'drone', 'guard', 'sniper', 'guard'], ['smoke', 'flash', 'dash', 'sensor'],
      { start: [['OKONKWO', 'Two devices up the radio tower. Go vertical, Rhea.'], ['VOSS', 'Since when do you pick the routes yourself?']], contact: [['COVENANT', 'Tower team, she is in the stairwell!']], near: [['OKONKWO', 'Hold E. Quietly.']], device: [['VOSS', 'One down. Going up.']], low: [['OKONKWO', 'Thirty seconds!']] },
      { title: 'TOWER CLEAN', text: 'Both devices are cold. The tower was broadcasting one word on a loop: WARDEN.\n\nVoss saves a copy of the signal. She does not tell Okonkwo.' }, 'The tower burned the city\'s radio band.'],
    ['m5', 'Cold Storage', { seed: 5252, theme: 'harbor', time: 'morning', hub: 'vault', count: 1, hubSign: 'COLD STORE 4' }, 'plant_hold', 200, 10,
      'Morning, harbor cold stores. The Covenant ledger server is sealed inside a vault building with no doors. Breach a wall (hold E at the hazard panels), plant the counter-charge, and hold for 20 seconds.',
      ['guard', 'heavy', 'guard', 'sniper', 'guard', 'heavy', 'drone', 'guard', 'commander', 'guard'], ['shield', 'sensor', 'smoke', 'dash', 'decoy'],
      { start: [['OKONKWO', 'Vault is sealed. You will have to make your own door.'], ['VOSS', 'My favourite kind.']], contact: [['COVENANT', 'Breach alarm! Lock it down!']], near: [['OKONKWO', 'Plant it, hold E.']], planted: [['OKONKWO', 'Charge set. Thirty seconds.']], low: [['OKONKWO', 'The tide gates shut in thirty!']] },
      { title: 'LEDGER BURNED', text: 'The ledger lists every Covenant buyer in Halvane.\n\nOne name repeats on every page: a Civic Shield procurement code. Okonkwo\'s.' }, 'The vault flooded with you outside.'],
    ['m6', 'Paper Trail', { seed: 6363, theme: 'industrial', time: 'overcast', hub: 'compound', count: 3 }, 'retrieve', 230, 11,
      'Overcast, the rail yards. Three data drives sit inside a walled Covenant compound. Retrieve all three (hold E), then get back to your extraction point.',
      ['guard', 'guard', 'heavy', 'sniper', 'commander', 'guard', 'turret', 'guard', 'drone', 'heavy', 'guard'], ['sensor', 'smoke', 'flash', 'drone', 'dash'],
      { start: [['OKONKWO', 'Three drives. Grab them, get out.'], ['VOSS', 'And you want them delivered to you personally?']], contact: [['COVENANT', 'Thief in the yard!']], near: [['OKONKWO', 'Hold E to pull the drive.']], device: [['VOSS', 'Got one.']], extract: [['OKONKWO', 'All drives secured. Get to extraction!']], low: [['OKONKWO', 'Thirty seconds, move!']] },
      { title: 'DRIVES SECURED', text: 'Voss reads the drives before handing them in.\n\nProject Dead Air: a planned blackout of Halvane, signed "O".' }, 'Covenant wiped the drives.'],
    ['m7', 'Glass Choir', { seed: 7474, theme: 'civic', time: 'noon', hub: 'tower', count: 3, hubFloors: 4, hubSign: 'CIVIC SHIELD' }, 'defuse', 240, 11,
      'Noon, the civic quarter. Three devices inside Civic Shield\'s own glass tower. Someone let the Covenant in. Defuse all three.',
      ['guard', 'commander', 'sniper', 'heavy', 'guard', 'guard', 'drone', 'sniper', 'heavy', 'guard', 'guard'], ['flash', 'smoke', 'shield', 'lockdown', 'dash'],
      { start: [['VOSS', 'Devices in our own headquarters, Okonkwo.'], ['OKONKWO', 'Then clean our house.']], contact: [['COVENANT', 'The commander said she would come.']], near: [['OKONKWO', 'Hold E.']], device: [['OKONKWO', 'Next device.']], low: [['OKONKWO', 'Thirty seconds!']] },
      { title: 'HQ SECURED', text: 'The devices were wired to Okonkwo\'s office terminal.\n\nWhen Voss calls in, he answers on the first ring. "Good work, Rhea. Come home."' }, 'Civic Shield HQ went dark.'],
    ['m8', 'Undertow', { seed: 8585, theme: 'harbor', time: 'dusk', hub: 'vault', count: 2, hubSign: 'PUMP STATION' }, 'retrieve', 230, 11,
      'Dusk, the pump station. Breach the sealed station and pull two key fragments from the servers, then extract.',
      ['heavy', 'guard', 'sniper', 'guard', 'commander', 'drone', 'guard', 'heavy', 'turret', 'guard', 'sniper'], ['sensor', 'decoy', 'smoke', 'shield', 'dash', 'flash'],
      { start: [['VOSS', 'Going dark on comms, Okonkwo.'], ['OKONKWO', 'Rhea, that is not protocol.']], contact: [['COVENANT', 'She cut the line. Find her!']], near: [['VOSS', 'Pulling the fragment.']], device: [['VOSS', 'Fragment secured.']], extract: [['VOSS', 'Both fragments. Getting out.']], low: [['VOSS', 'Thirty seconds.']] },
      { title: 'FRAGMENTS RECOVERED', text: 'The fragments make a key, the master switch for the Halvane grid.\n\nThe key carries a name inside its code: VOSS, R.' }, 'The station flooded with the fragments inside.'],
    ['m9', 'Ash Market', { seed: 9696, theme: 'downtown', time: 'sunset', hub: 'compound', count: 1 }, 'plant_hold', 210, 12,
      'Sunset, the night market. Covenant are moving weapons through a walled depot. Breach in, plant a charge on the arms cache and hold.',
      ['guard', 'guard', 'heavy', 'commander', 'sniper', 'guard', 'drone', 'heavy', 'guard', 'sniper', 'guard', 'turret'], ['smoke', 'flash', 'lockdown', 'shield', 'dash', 'decoy'],
      { start: [['YUNA', 'Voss, it is Yuna. Okonkwo is off the grid. I am running your comms now.']], contact: [['COVENANT', 'Depot breach!']], near: [['YUNA', 'Plant it.']], planted: [['YUNA', 'Charge live. Hold thirty.']], low: [['YUNA', 'Thirty seconds!']] },
      { title: 'DEPOT DESTROYED', text: 'The cache was Civic Shield stock, marked for the Warden Protocol.\n\nYuna: "If the grid goes down, the protocol hands the city to one person. Guess who."' }, 'The weapons shipped out.'],
    ['m10', 'Signal Fire', { seed: 10107, theme: 'blackout', time: 'night', hub: 'tower', count: 3, hubFloors: 4, hubSign: 'GRID RELAY' }, 'defuse', 250, 12,
      'Night, the blackout zone. Three relay devices in and around the grid relay tower are counting down to a total blackout. Defuse all three.',
      ['guard', 'heavy', 'sniper', 'commander', 'guard', 'drone', 'heavy', 'guard', 'sniper', 'turret', 'guard', 'commander'], ['smoke', 'flash', 'sensor', 'drone', 'shield', 'lockdown', 'dash'],
      { start: [['YUNA', 'Three relays. If they fire, Halvane goes dark for good.']], contact: [['OKONKWO', 'Rhea. Stand down. You do not understand what you are stopping.']], near: [['YUNA', 'Hold E!']], device: [['YUNA', 'Relay down.']], low: [['YUNA', 'Thirty seconds!']] },
      { title: 'RELAYS DOWN', text: 'The blackout fails.\n\nOkonkwo, on an open channel: "You were always going to come to me, cadet. You carry the key."' }, 'Halvane went dark.'],
    ['m11', 'Iron Psalm', { seed: 11118, theme: 'industrial', time: 'night', hub: 'vault', count: 3, hubSign: 'PSALM WORKS' }, 'retrieve', 250, 12,
      'Night, the foundry. Breach the Psalm Works vault, steal the three broadcast cores for the Warden Protocol and extract before Okonkwo locks the district.',
      ['heavy', 'commander', 'guard', 'sniper', 'guard', 'heavy', 'drone', 'guard', 'turret', 'commander', 'sniper', 'guard'], ['sensor', 'smoke', 'flash', 'shield', 'decoy', 'drone', 'lockdown', 'dash'],
      { start: [['YUNA', 'Without those cores he cannot broadcast the protocol.']], contact: [['COVENANT', 'The Warden wants her alive!']], near: [['YUNA', 'Pull it.']], device: [['VOSS', 'Core secured.']], extract: [['YUNA', 'All three cores. Extract!']], low: [['YUNA', 'Thirty seconds!']] },
      { title: 'CORES STOLEN', text: 'Okonkwo has one way left: the civic tower, and the key in Voss\'s gear.\n\n"Come to the tower, Rhea. Let us end it where it started."' }, 'The cores went live.'],
    ['m12', 'Last Light', { seed: 12129, theme: 'civic', time: 'dusk', hub: 'tower', count: 2, hubFloors: 4, hubSign: 'HALVANE CIVIC' }, 'defuse', 300, 12,
      'Dusk, the civic tower. Okonkwo, the Warden, holds the top floors with the Covenant elite. Defuse the two protocol devices and bring him down.',
      ['warden', 'commander', 'heavy', 'sniper', 'guard', 'heavy', 'commander', 'drone', 'sniper', 'guard', 'turret', 'heavy'], ['smoke', 'flash', 'dash', 'sensor', 'shield', 'decoy', 'lockdown', 'drone'],
      { start: [['OKONKWO', 'Top floor, Rhea. I will wait.'], ['VOSS', 'You taught me never to keep anyone waiting.']], contact: [['OKONKWO', 'Show me what I made.']], near: [['YUNA', 'Hold E. Finish it.']], device: [['YUNA', 'One left!']], low: [['YUNA', 'Thirty seconds!']] },
      { title: 'LAST LIGHT', text: 'The Warden Protocol resets. Halvane\'s lights come back on, block by block.\n\nVoss drops the key into the river.\n\n"My name is Rhea Voss. Nobody steers me now."\n\nSEASON 1 COMPLETE · THANK YOU FOR PLAYING' }, 'The Warden Protocol went live.'],
  ].map(([id, title, proc, objective, timer, count, brief, roster, pool, radio, win, failTimer]) =>
    ({ id, title, proc, objective, timer, count, brief, roster, pool, radio, win, failTimer, build: (w, sc) => buildDistrict(w, sc, proc) })),
];

// ---------- persistence ----------
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } } };
let progress = Number(store.get('sz_progress', 0)) || 0;
const loadout = store.get('sz_loadout', { primary: 'ar7_lance', sidearm: 'vex_p9', abilities: {} });
loadout.operative ??= 'rhea';
const OPERATIVES = { rhea: 'Rhea', kade: 'Kade', yuna: 'Yuna', tomas: 'Tomas', amara: 'Amara' };
const settings = Object.assign({ sens: 1, touchSens: 1, btnSize: 1, btnOpacity: 0.8, fireMode: isTouchDevice() ? 'auto' : 'button', aimAssist: true, quality: isTouchDevice() ? 'auto' : 'high', qMigrated: isTouchDevice() ? 1 : 0 }, store.get('sz_settings', {}));
if (settings.quality === 'auto' && !settings.qMigrated) { settings.quality = 'high'; settings.qMigrated = 1; store.set('sz_settings', settings); }   // default is High; old 'auto' saves move to High once
const IS_TOUCH = isTouchDevice();
document.head.insertAdjacentHTML('beforeend', `<style>${TOUCH_CSS}</style>`);
if (IS_TOUCH) document.body.classList.add('touch');
const touch = IS_TOUCH ? new TouchControls(document.body, settings) : null;
// Mobile browsers only allow fullscreen inside a user gesture, so request it on every tap until it sticks.
if (touch) {
  const goFull = () => {
    if (document.fullscreenElement) return;
    const el = document.documentElement;
    (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el, { navigationUI: 'hide' }).catch(() => {});
  };
  addEventListener('pointerup', goFull, true);
}

// ---------- renderer ----------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality === 'high', powerPreference: 'high-performance', preserveDrawingBuffer: TEST });   // MSAA only on High
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;
let qLevel = 2, lowFpsT = 0, dynScale = 1;            // dynScale: dynamic resolution 0.5..1                         // 0 low, 1 medium, 2 high
// Quality levels: 2 = high (shadows, up to 1.5x pixels, PC only), 1 = medium (no shadows, 1x pixels), 0 = low (0.7x pixels).
function applyQuality() {
  const want = settings.quality === 'low' ? 0 : settings.quality === 'high' ? 2 : Math.min(qLevel, 1);
  qLevel = want;
  renderer.setPixelRatio((want === 0 ? Math.min(devicePixelRatio, 0.75) : want === 1 ? Math.min(devicePixelRatio, 1) : Math.min(devicePixelRatio, 1.5)) * dynScale);
  const shadowChange = renderer.shadowMap.enabled !== (want === 2);
  renderer.shadowMap.enabled = want === 2;
  if (sun) { sun.castShadow = want === 2; if (sun.shadow.mapSize.x !== 2048) { sun.shadow.mapSize.set(2048, 2048); sun.shadow.map?.dispose(); sun.shadow.map = null; } }
  if (map) for (const l of map.kit.lights || []) l.visible = want > 0;
  if (scene && shadowChange) scene.traverse(o => { if (o.isMesh && o.material) o.material.needsUpdate = true; });
  renderer.setSize(innerWidth, innerHeight);
}
qLevel = settings.quality === 'high' ? 2 : settings.quality === 'low' ? 0 : 1;
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 600);
const vm = new Viewmodel();
// portrait phones: widen the vertical FOV so the horizontal view stays ~70 deg (else it is a keyhole)
let fovK = 1;
function resize() { camera.aspect = innerWidth / innerHeight; fovK = camera.aspect >= 1 ? 1 : Math.min(1.45, 2 * Math.atan(Math.tan(35 * Math.PI / 180) / camera.aspect) * 180 / Math.PI / 75); camera.updateProjectionMatrix(); vm.setAspect(camera.aspect); renderer.setSize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();

// ---------- assets ----------
const loader = new GLTFLoader();
const A = { weapons: {}, icons: {}, props: {}, enemies: null, rhea: null };
async function loadAll() {
  const ids = Object.keys(WEAPONS), total = ids.length + 2 + 8 + 5 + 1 + Object.keys(ENEMY_TYPES).length; let done = 0;   // weapons + props + kenney kits + arch kits + operative + enemies
  const bar = $('lbar').firstElementChild, tick = () => { done++; bar.style.width = `${Math.min(99, Math.round(done / total * 100))}%`; };
  const origLoad = loader.loadAsync.bind(loader);   // every GLB (weapons, kenney kits, arch, enemies, operative) advances the bar
  loader.loadAsync = async u => { try { return await origLoad(u); } finally { tick(); } };
  await Promise.all(ids.map(async id => { const g = await loader.loadAsync(`models/weapons/${id}.glb`); A.weapons[id] = g.scene; vm.register(id, g.scene); }));
  await Promise.all(['covenant_device', 'counter_charge'].map(async id => { const g = await loader.loadAsync(`models/props/${id}.glb`); g.scene.traverse(o => { if (o.isMesh) o.castShadow = true; }); A.props[id] = g.scene; }));
  await loadArch(loader);   // Kenney architecture (world/kenney-arch.js)
  await loadKenney(loader);   // Kenney map props (world/kenney.js); falls back to procedural boxes if missing
  A.ops = {}; const rhea = await loadOperative(loadout.operative in OPERATIVES ? loadout.operative : 'rhea'); A.rhea = rhea;
  A.enemies = await loadEnemyAssets(loader, A.weapons);
  loader.loadAsync = origLoad; bar.style.width = '100%';
  for (const id of ids) A.icons[id] = renderIcon(A.weapons[id]);
  for (const m of Object.values(vm.models)) { toonify(m.scene); outline(m.scene, { thick: 0.0035 }); }
  toonify(vm.root); outline(vm.armR, { thick: 0.003 }); outline(vm.armL, { thick: 0.003 });
}
function loadOperative(id) { return (A.ops[id] ??= loader.loadAsync(`models/rigged/${id}.glb`)); }
function renderIcon(model) {
  const W = 256, H = 96, rt = new THREE.WebGLRenderTarget(W, H);
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
  const m = model.clone(true); sc.add(m);
  const box = new THREE.Box3().setFromObject(m), c = box.getCenter(V()), s = box.getSize(V());
  const half = Math.max(s.z * W / H, s.y, s.x) * 0.55;
  const cam = new THREE.OrthographicCamera(-half, half, half * H / W, -half * H / W, -10, 10); cam.position.set(c.x + 1, c.y, c.z); cam.lookAt(c);
  renderer.setRenderTarget(rt); renderer.setClearColor(0, 0); renderer.clear(); renderer.render(sc, cam);
  const px = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, px); renderer.setRenderTarget(null); rt.dispose();
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  g.putImageData(img, 0, 0); return cv.toDataURL();
}

// ---------- match state ----------
let efx = null, effectOwner = null;
let scene = null, world = null, map = null, fx = null, sun = null, mission = null, missionIdx = 0, route = null;
let enemies = [], devices = [], zones = { smoke: [], lock: [], sensor: [], decoy: [], drone: [], elock: [], edrone: [] };
let running = false, paused = false, clock = 0, elapsed = 0, matchOver = false;
const player = { pos: V(), vel: V(), r: 0.4, h: 1.8, onGround: false, yaw: 0, pitch: 0, hp: 100, shield: 0, shieldT: 0, alive: true, moving: false, dashT: 0, dash: V() };
const W = { slots: [], cur: 0, state: {}, cd: 0, reloadT: 0, trigger: false, firedSemi: false, bloom: 0, drawT: 0, ads: 0, recoil: 0, recoverP: 0 };
let picks = [], abilityCD = [0, 0], keys = {}, mouse = { l: false, r: false }, lookD = { x: 0, y: 0 };
let objective = { prog: [], done: [], planted: false, plantProg: 0, holdProg: 0, active: -1 };
let stats = { kills: 0, shots: 0, hits: 0, heads: 0 };
let LS = { dmg: 0, ab: 0, pz: 0, mv: -1, sh: -1, ct: -1, by: '' };   // per-level telemetry
let flashK = 0, hurtK = 0, hitmT = 0, laserK = 0, dmgDirs = [], said = {}, repathBudget = 2, stepT = 0;
const proxy = new THREE.Object3D();                 // stands in for the player's body for dash/shield fx
let tracers = [], impacts = [], lasers = new Map();
let medkits = [], breaches = [], barrels = [], intel = [], extractMark = null, matchXP = {}, revived = false, invT = 0, shakeK = 0, sprays = [], sprayCD = 0, xpDoubled = false;

const G = {                                         // services handed to enemies
  get player() { return player; }, get world() { return world; },
  get difficulty() { return 0.8 + Math.min(11, missionIdx) * 0.035; },   // gentle first missions, ramps through the campaign
  playerHead: () => player.pos.clone().add(V(0, 1.45, 0)),
  losClear: (a, b) => world.lineClear(a, b) && !smokeBlocks(a, b),
  nearestDecoy(p, r) { let best = null, bd = r; for (const d of zones.decoy) { const q = d.obj.position.clone().add(V(0, 1.2, 0)); const dd = q.distanceTo(p); if (dd < bd) { bd = dd; best = q; } } return best; },
  inLockdown: p => zones.lock.some(z => z.pos.distanceTo(p) < z.radius && Math.abs(z.pos.y - p.y) < 3),
  allowRepath: () => repathBudget-- > 0,
  onSpotted(e) { radioOnce('contact'); storyEv(e.type); for (const o of enemies) if (o !== e && o.alive && o.pos.distanceTo(e.pos) < 18) o.alert(player.pos, 0.8); },
  sniperLaser, enemyFired, enemyAbility,
  nearDevice: p => mission?.objective === 'defuse' && map.points.some((q, i) => !objective.done[i] && q.distanceTo(p) < 4),
  onEnemyTask(e, t) {
    if (!t.warned) { t.warned = true; radio('OKONKWO', 'They are on your charge! Stop him!'); }
    if (t.t >= 7 && t.kind === 'defuse' && objective.planted) {
      objective.planted = false; objective.plantProg = 0; objective.holdProg = 0;
      objective.charge?.parent?.remove(objective.charge); objective.charge = null;
      devices[0].lamp.material.color.set(0xff3b3b); devices[0].glow.color.set(0xff3b3b);
      radio('COVENANT', 'Charge disarmed. Nice try, Operative.'); e.task = null;
    }
  },
};
function smokeBlocks(a, b) {
  const d = b.clone().sub(a), len = d.length(); d.divideScalar(len || 1);
  for (const z of zones.smoke) { const t = clamp(z.pos.clone().sub(a).dot(d), 0, len); if (a.clone().addScaledVector(d, t).distanceTo(z.pos.clone().add(V(0, 1, 0))) < z.radius) return true; }
  return false;
}

// ---------- building a mission ----------
function buildMission(idx, opts = {}) {
  missionIdx = idx; mission = MISSIONS[idx];
  if (map) map.kit.dispose();
  scene = new THREE.Scene(); world = new World();
  map = mission.build(world, scene);
  const L = LIGHTING[map.time];
  // toon colour grade: more saturated sky, softer/farther fog, brighter fill
  scene.background = new THREE.Color(L.sky).offsetHSL(0, 0.12, 0.03);
  scene.fog = new THREE.Fog(new THREE.Color(L.fog[0]).offsetHSL(0, 0.1, 0.02), L.fog[1] * 1.3, L.fog[2] * 1.2);
  camera.far = scene.fog.far + 15; camera.updateProjectionMatrix();
  const hemi = new THREE.HemisphereLight(...L.hemi); hemi.intensity *= 1.15; hemi.groundColor.offsetHSL(0.55, 0.15, 0); scene.add(hemi);
  sun = new THREE.DirectionalLight(...L.sun); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 260 }); sun.shadow.bias = -0.0005;
  sun.userData.off = V(...L.sunPos).normalize().multiplyScalar(120);
  scene.add(sun, sun.target); applyQuality();
  vm.hemi.color.set(L.hemi[0]); vm.hemi.groundColor.set(L.hemi[1]); vm.sun.color.set(L.sun[0]);
  world.buildNav(map.bounds);
  if (map.procedural) {                       // keep only objectives / intel a player can actually walk to
    const sp = map.spawns.default, pts = [];
    for (const p of [...map.points, ...map.pointPool]) { if (pts.length >= map.wantPoints) break; if (pts.every(q => q.distanceTo(p) > 6) && world.reachable(sp, p)) pts.push(p); }
    map.points = pts;
    map.intel = map.intelPool.filter(p => p.distanceTo(sp) > 15 && world.reachable(sp, p, 1.2)).slice(0, map.wantIntel);
  }
  { const th = mission.proc?.theme || { m1: 'downtown', m2: 'harbor', m3: 'industrial' }[mission.id] || 'street';   // decorative Kenney scatter (no colliders / minimap)
    let h = 7; for (const ch of mission.id) h = (h * 31 + ch.charCodeAt(0)) | 0;
    map.dressCount = dressMap(world, map.kit.root, map, { seed: mission.proc?.seed || h, theme: th }); window.__dress = dressMap.stats; }
  scene.add(camera);
  // short parts: a multi-objective mission is played one objective per part (60-90 s levels), progress saved per part
  const nPts = map.points.length, parted = !mode && opts.part != null && mission.objective !== 'plant_hold' && nPts > 1;
  const part = parted ? Math.min(opts.part, nPts - 1) : 0, parts = parted ? nPts : 1;
  if (parted) map.points = [map.points[part]];
  // hostiles guard the objective: take the guard spots nearest to the live objective(s), ground level first
  if (!mode && map.points.length) {
    const near = p => { let d = Infinity; for (const q of map.points) d = Math.min(d, p.distanceTo(q) + Math.abs(p.y - q.y) * 2); return d; };
    const sps = Object.values(map.spawns || {}), farOk = p => sps.every(s => !s || s.distanceTo(p) > RC.minSpawnDist);   // never right on top of the player's spawn
    const keep = mission.roster.includes('warden') ? map.guards : [...map.guards.filter(farOk).sort((a, b) => near(a) - near(b)), ...map.guards.filter(p => !farOk(p))];
    map.guards = keep;
  }
  const r = mission.routes ? mission.routes[opts.route || 'stealth'] : { count: mission.count || 8, timer: mission.timer, spawn: 'default' };
  route = { id: opts.route || 'default', ...r, part, parts };
  const ov = !mode && RC.missions?.[mission.id]; if (ov) route = { ...route, ...(ov.count ? { count: Math.min(route.count, ov.count) } : {}), ...(ov.timer ? { timer: ov.timer } : {}) };
  if (parted) route = { ...route, count: Math.max(3, Math.ceil(r.count / parts) + 1), timer: Math.round(clamp(r.timer / parts + RC.partTimer.extra, RC.partTimer.min, RC.partTimer.max)) };
  else if (!mode && !TEST && idx > 0) route = { ...route, count: Math.min(route.count, RC.singleMaxCount), timer: Math.min(route.timer, RC.singleMaxTimer) };   // single-part missions stay short too
  if (!mode && (fails[idx] || 0) >= RC.easyAfterFails) route = { ...route, count: Math.max(3, Math.round(route.count * RC.easyCountMul)), timer: route.timer + RC.easyExtraTime, easy: true };   // stuck: fewer hostiles, more time
  clock = route.timer; elapsed = 0; matchOver = false;
  enemies = [];
  map.guards.slice(0, route.count).forEach((p, i) => {
    let type = mission.roster[i % mission.roster.length];
    if (type === 'warden' && route.part < route.parts - 1) type = 'commander';     // the boss only waits in the final part
    if (type === 'warden') p = map.points[map.points.length - 1].clone().add(V(2.5, 0, 0));      // the boss holds the last device
    if (world.overlaps(p, 0.4, 1.8)) { const n = world.nearestNode(p); if (n) p = n.pos.clone(); }   // never spawn inside a wall
    const e = new Enemy(type, A.enemies[type], p, { yaw: rand(-Math.PI, Math.PI) });
    scene.add(e.root); enemies.push(e);
  });
  // objective props
  devices = map.points.map(p => {
    const g = new THREE.Group(); g.position.copy(p);
    if (mission.objective === 'defuse') g.add(A.props.covenant_device.clone(true));
    if (mission.objective === 'retrieve') { const d = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.7), new THREE.MeshLambertMaterial({ color: 0x2b2d42 })); d.position.y = 0.45; const st = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.9), new THREE.MeshLambertMaterial({ color: 0x6b7480 })); st.position.y = 0.15; g.add(d, st); }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3b3b })); lamp.position.y = 0.75; g.add(lamp);
    const glow = { color: new THREE.Color(0xff3b3b) };                // colour state only (no runtime lights)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex(), color: 0xff3b3b, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); halo.position.y = 0.75; halo.scale.setScalar(0.9); g.add(halo); glow.color = halo.material.color;
    scene.add(g); return { g, lamp, glow, pos: p.clone() };
  });
  if (mission.objective === 'retrieve') devices.forEach(d => { d.lamp.material.color.set(0x5fe6ff); d.glow.color.set(0x5fe6ff); });
  objective = { prog: map.points.map(() => 0), done: map.points.map(() => false), planted: false, plantProg: 0, holdProg: 0, active: -1, charge: null, extract: false };
  // breach walls, explosive barrels, intel caches, extraction marker (procedural districts)
  breaches = (map.breaches || []).map(b => ({ ...b, prog: 0, fuse: -1, charge: null }));
  barrels = map.barrels || [];
  intel = (map.intel || []).map((p, i) => {
    const id = `${mission.id}:${i}`, got = META.profile.intel.includes(id);
    const g = new THREE.Group(); g.position.copy(p);
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.32), new THREE.MeshBasicMaterial({ color: got ? 0x777777 : 0xffd23b })); f.position.y = 0.6; g.add(f);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffd23b, transparent: true, opacity: 0.7 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    g.visible = !got; scene.add(g); return { id, g, pos: p.clone(), got };
  });
  medkits = buildMedkits();
  extractMark = null;
  if (mission.objective === 'retrieve') {
    extractMark = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 6, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    extractMark.position.copy(map.extract).add(V(0, 3, 0)); extractMark.visible = false; scene.add(extractMark);
  }
  matchXP = { kills: 0, heads: 0, objective: 0, breach: 0, intel: 0, barrel: 0, win: 0, first: 0 }; revived = false; invT = 0; shakeK = 0;
  if (map.procedural) for (const b of breaches) b.mesh.userData.noToon = false;
  // fx + zones
  zones = { smoke: [], lock: [], sensor: [], decoy: [], drone: [], elock: [], edrone: [] };
  efx = new AbilityFX(scene, {
    ground: (x, z, y) => { const g = world.groundHeight(x, z, 0.05, y + 0.2, 0.6); return Number.isFinite(g) ? g : 0; },
    collide: (a, b) => { const d = b.clone().sub(a), l = d.length(); if (l < 1e-4) return null; const h = world.raycast(a, d.divideScalar(l), l); return h ? { point: h.point, normal: h.normal } : null; },
    onFlash: () => {}, onEvent: enemyEffect,
  });
  fx = new AbilityFX(scene, {
    ground: (x, z, y) => { const g = world.groundHeight(x, z, 0.05, y + 0.2, 0.6); return Number.isFinite(g) ? g : 0; },
    collide: (a, b) => { const d = b.clone().sub(a), l = d.length(); if (l < 1e-4) return null; const h = world.raycast(a, d.divideScalar(l), l); return h ? { point: h.point, normal: h.normal } : null; },
    onFlash: () => {}, onEvent: abilityEvent,
  });
  tracers.forEach(t => t.parent?.remove(t)); tracers = []; impacts = []; lasers.clear();
  // player
  player.pos.copy(map.spawns[r.spawn] || map.spawns.default); player.vel.set(0, 0, 0);
  player.yaw = map.spawnYaw; player.pitch = 0; player.hp = 100; player.shield = 0; player.shieldT = 0; player.alive = true; player.dashT = 0; player.onGround = true;
  proxy.position.copy(player.pos); scene.add(proxy);
  // weapons
  W.slots = [opts.primary || loadout.primary, opts.sidearm || loadout.sidearm];
  W.state = {}; for (const id of W.slots) W.state[id] = { mag: WEAPONS[id].mag, reserve: META.reserveFor(id, WEAPONS[id].reserve) };
  W.cur = 0; W.cd = 0; W.reloadT = 0; W.bloom = 0; equip(0, true);
  picks = (opts.abilities?.length === 2 ? opts.abilities : chosenAbilities()).slice(0, 2); abilityCD = [0, 0];
  stats = { kills: 0, shots: 0, hits: 0, heads: 0 };
  flashK = hurtK = laserK = 0; dmgDirs = []; said = {}; RADIO.reset();
  // toon pass: rim-lit, inked enemies and props; banded shading on the whole city
  for (const e of enemies) { toonify(e.root, { rim: 0xff6a5a }); outline(e.root, { thick: 0.022 }); }
  for (const d of devices) { toonify(d.g); outline(d.g, { thick: 0.015 }); }
  toonify(scene);
  buildMinimap(); buildAbilityHud();
  map.kit.root.updateMatrixWorld(true); map.kit.root.traverse(o => { if (!o.userData.dyn) o.matrixAutoUpdate = false; });   // static city: skip per-frame matrix composes
  // shader warm-up: one of every runtime effect + every ability fx, compiled now instead of mid-fight
  const keep = new Set(scene.children);
  const warm = new THREE.Group(); warm.position.set(player.pos.x, player.pos.y - 400, player.pos.z); scene.add(warm);
  warm.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex(), color: 0xff4a4a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })), new THREE.Sprite(sparkMat), new THREE.Mesh(decalGeo, decalMat),
    new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(), V(0, 1, 0)]), tracerMat), new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(), V(0, 1, 0)]), new THREE.LineBasicMaterial({ color: 0xff2020, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
  const wfx = new AbilityFX(scene, { ground: () => warm.position.y, collide: () => null });
  const dummy = enemies.find(e => !e.T.flying && !e.T.static);
  if (dummy) for (const k of Object.keys(ABILITIES)) { try { wfx.spawn(k, { hand: warm.position.clone(), forward: V(0, 0, 1), root: warm, template: dummy.root, clips: A.enemies[dummy.type].gltf.animations, move: false }); } catch (e) { /* kind needs live context */ } }
  wfx.update(0.05);
  try { renderer.compile(scene, camera); renderer.compile(vm.scene, vm.camera); } catch (e) { /* older drivers */ }
  wfx.update(60); for (const c of [...scene.children]) if (!keep.has(c)) scene.remove(c);
  frames = 0; fpsT = 0; lowFpsT = 0;
}

// ---------- weapons ----------
const cur = () => W.slots[W.cur], cs = () => WEAPONS[cur()], st = () => W.state[cur()];
function equip(slot, instant = false) {
  if (!W.slots[slot]) return;
  W.cur = slot; W.reloadT = 0; vm.equip(cur()); W.drawT = instant ? 0 : 0.45; attachCharm();
  $('wicon').src = A.icons[cur()] || ''; $('wname').textContent = cs().name.toUpperCase();
}
function startReload() {
  const s = st(), w = cs();
  if (W.reloadT > 0 || s.mag >= w.mag || s.reserve <= 0 || W.drawT > 0) return false;
  W.reloadT = w.reload; vm.startReload(w.reload); return true;
}
function currentSpread() {
  const w = cs(), sp = Math.hypot(player.vel.x, player.vel.z);
  let s = w.spread + w.move * clamp(sp / CFG.run, 0, 1) + (player.onGround ? 0 : 0.05) + W.bloom;
  if (w.scope) s = W.ads > 0.9 ? 0.0008 + w.move * clamp(sp / CFG.run, 0, 1) * 0.5 : s;
  else s *= 1 - W.ads * 0.6;
  return s;
}
function fire() {
  const w = cs(), s = st();
  if (W.drawT > 0 || W.reloadT > 0 || W.cd > 0) return;
  if (s.mag <= 0) { sfx.empty(); vm.click(); W.cd = 0.25; if (!startReload()) {} return; }
  s.mag--; W.cd = 60 / w.rpm; stats.shots++;
  const spread = currentSpread();
  W.bloom = Math.min(W.bloom + w.recoil * 0.5, 0.05);
  const dir = V(); camera.getWorldDirection(dir);
  const right = V().crossVectors(dir, camera.up).normalize(), up = V().crossVectors(right, dir).normalize();
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
  dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
  const o = camera.getWorldPosition(V());
  const wh = world.raycast(o, dir, w.range);
  let maxT = wh ? wh.t : w.range, best = null;
  for (const e of enemies) { const h = e.hitTest(o, dir, maxT); if (h && (!best || h.t < best.h.t)) best = { e, h }; }
  const end = o.clone().addScaledVector(dir, best ? best.h.t : maxT);
  // recoil: camera kick + viewmodel
  player.pitch = clamp(player.pitch + w.recoil * (W.ads > 0.5 ? 0.6 : 1), -1.5, 1.5); W.recoverP += w.recoil * 0.7;
  player.yaw += (Math.random() - 0.5) * w.recoil * 0.5;
  vm.fire(w); sfx.shot(w.cls);
  addTracer(muzzleWorld(), end, 0xffe08a);
  if (best) {
    const head = best.h.part === 'head';
    const mult = head ? (best.h.mult || w.head) : best.h.mult;
    const amount = w.dmg * mult * META.dmgMult(cur());
    const killed = best.e.damage(amount, player.pos.clone(), best.h.part);
    { const sp = toScreen(end); if (sp.on) FX.damageNumber(sp.x, sp.y, Math.round(amount), { head, kill: killed }); FX.hitPunch(head ? 1 : 0.5); }
    if (killed) { const n = FX.streakTick(performance.now()); FX.killBanner(head ? 'HEADSHOT' : 'ELIMINATED', { head, streak: n }); FX.xpPop(META.XP.kill + (head ? META.XP.head : 0), head ? 'HEADSHOT' : 'KILL'); }
    stats.hits++; if (head) stats.heads++;
    hitMarker(killed, head); sfx.hit(head); addImpact(end, dir.clone().negate(), true);
    if (killed) { best.e._dv = dir.clone().setY(0).normalize().multiplyScalar(w.dmg > 60 ? 7 : 3.5); if (head) FEEL.hitStop = 0.06; }
    FEEL.combo++; FEEL.comboT = 1.2;
    if (killed) { stats.kills++; if (stats.kills === 1) track('kill1', { m: mission.id, t: Math.round(elapsed) }); killTick(); matchXP.kills += META.XP.kill; if (head) matchXP.heads += META.XP.head; sfx.kill(stats.kills); feed(`VOSS ▸ ${ENEMY_TYPES[best.e.type].name.toUpperCase()}${head ? ' ✦' : ''}`, head); }
  } else if (wh) { addImpact(wh.point, wh.normal, false); if (wh.collider.tag === 'barrel' && wh.collider.prop?.alive) detonateBarrel(wh.collider.prop); }
  for (const e of enemies) e.hear(player.pos, w.cls === 'pistol' ? 0.7 : 1);
  if (s.mag === 0 && s.reserve > 0) setTimeout(() => { if (running && cur() === w && st().mag === 0) startReload(); }, 250);
}
const _scr = new THREE.Vector3();
function toScreen(p) { _scr.copy(p).project(camera); return { x: (_scr.x * 0.5 + 0.5) * innerWidth, y: (-_scr.y * 0.5 + 0.5) * innerHeight, on: _scr.z < 1 && Math.abs(_scr.x) <= 1 && Math.abs(_scr.y) <= 1, behind: _scr.z >= 1 }; }
function muzzleWorld() { return camera.localToWorld(V(0.14, -0.12, -0.55).lerp(V(0, -0.05, -0.5), W.ads)); }

// ---------- tracers / impacts ----------
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
function addTracer(a, b, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const m = color === 0xffe08a ? tracerMat : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const l = new THREE.Line(geo, m); l.userData.t = 0.07; scene.add(l); tracers.push(l);
}
const sparkMat = new THREE.SpriteMaterial({ map: starTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
const decalGeo = new THREE.CircleGeometry(0.06, 8), decalMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
function addImpact(p, n, flesh) {
  const s = new THREE.Sprite(flesh ? new THREE.SpriteMaterial({ map: starTex(), color: 0xff4a4a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }) : sparkMat);
  s.position.copy(p).addScaledVector(n, 0.05); s.scale.setScalar(flesh ? 0.5 : 0.35); s.userData.t = 0.08; s.userData.spark = true;
  scene.add(s); impacts.push(s);
  if (!flesh) {
    const d = new THREE.Mesh(decalGeo, decalMat); d.position.copy(p).addScaledVector(n, 0.01); d.lookAt(p.clone().add(n)); d.userData.t = 8;
    scene.add(d); impacts.push(d); sfx.impact();
  }
  if (impacts.length > 80) { const o = impacts.shift(); o.parent?.remove(o); }
}
function sniperLaser(e, target, k) {
  let l = lasers.get(e);
  if (!target || k <= 0) { if (l) { l.visible = false; } return; }
  if (!l) { l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(), V()]), new THREE.LineBasicMaterial({ color: 0xff2020, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(l); lasers.set(e, l); }
  l.visible = true; l.geometry.setFromPoints([e.muzzle(), target]); l.material.opacity = 0.35 + 0.6 * k;
  if (e.targetKind === 'player') laserK = Math.max(laserK, k);
}
function enemyFired(e, from, to, dmg) {
  addTracer(from, to, e.S.laser ? 0xff8080 : 0xff6b4a);
  const d = from.distanceTo(player.pos);
  const rel = Math.atan2(from.x - player.pos.x, from.z - player.pos.z);
  sfx.shot(e.S.cls, { dist: d, pan: Math.sin(rel - player.yaw - Math.PI) });
  const n = V().subVectors(from, to).normalize(), hit = world.raycast(from, to.clone().sub(from).normalize(), from.distanceTo(to));
  if (hit && !dmg) addImpact(hit.point, hit.normal, false);
  if (dmg > 0) { LS.by = e.type || ''; damagePlayer(dmg, from); }
  else if (!hit && n) { /* whizz-by miss */ }
}
function damagePlayer(dmg, from) {
  if (!player.alive || matchOver || invT > 0) return;
  LS.dmg += dmg; let x = dmg; if (player.shield > 0) { const a = Math.min(player.shield, x); player.shield -= a; x -= a; }
  player.hp -= x; hurtK = Math.min(1, hurtK + 0.35 + dmg / 60); sfx.hurt();
  if (from) { const a = Math.atan2(from.x - player.pos.x, from.z - player.pos.z) - player.yaw; FEEL.punchY = Math.sin(a) * 0.02; FEEL.punchP = -0.015 - dmg * 0.0006; }
  if (from) dmgDirs.push({ ang: Math.atan2(from.x - player.pos.x, from.z - player.pos.z), t: 1.2 });
  if (player.hp > 0 && player.hp < 35) storyEv('hurt');
  if (player.hp <= 0) { player.hp = 0; player.alive = false; lose('You were eliminated.'); }
}

// ---------- enemy abilities (clip released -> effect + gameplay) ----------
function enemyAbility(e, kind) {
  e.root.updateMatrixWorld(true);
  const hand = V().setFromMatrixPosition(e.root.getObjectByName('handR').matrixWorld);
  let fwd = V(Math.sin(e.yaw), 0, Math.cos(e.yaw));
  if (e.target && ['flash', 'smoke', 'decoy'].includes(kind)) fwd = e.target.clone().sub(e.pos).setY(0).normalize();
  if (kind === 'dash') fwd = e.dashV.clone().normalize();
  effectOwner = e;
  efx.spawn(kind, { hand, forward: fwd, root: e.root, template: e.root, clips: e.A.gltf.animations, move: false });
  effectOwner = null;
}
let firstContactT = -1;
// ---------- modes: 'daily' (seeded mission, streak bonus) and 'survival' (endless waves, no objective) ----------
let mode = null, wave = 0, waveT = 0, survBestV = 0;
let lastStart = { idx: 0, opts: {} }, autoNextT = 0;
const fails = {};                                   // per-mission fail streak this session: 2+ fails = easier next try
function survivalSetup() {
  for (const d of devices) d.g.visible = false;
  map.points = []; clock = 1e9;
  const keep = MODES.survCount(1);
  for (const e of enemies.slice(keep)) scene.remove(e.root);
  enemies = enemies.slice(0, keep); wave = 1; waveT = 0; survBestV = MODES.survBest();
}
function nextWave() {
  wave++; waveT = 0;
  for (const e of enemies) if (!e.alive) scene.remove(e.root);
  enemies = enemies.filter(e => e.alive);
  matchXP.wave = (matchXP.wave || 0) + MODES.SURV_XP;
  player.hp = Math.min(100, player.hp + 35);
  const spots = map.guards.filter(p => p.distanceTo(player.pos) > 14).sort(() => Math.random() - 0.5);
  if (!spots.length) spots.push(...map.guards);
  const types = mission.roster.filter(t => t !== 'warden');
  for (let i = 0; i < MODES.survCount(wave); i++) {
    let p = spots[i % spots.length].clone();
    if (world.overlaps(p, 0.4, 1.8)) { const n = world.nearestNode(p); if (n) p = n.pos.clone(); }
    const type = types[(Math.random() * types.length) | 0];
    const e = new Enemy(type, A.enemies[type], p, { yaw: rand(-Math.PI, Math.PI) });
    scene.add(e.root); enemies.push(e);
    e.alert(player.pos, 1); if (!e.T.static) e.goTo(player.pos, G);
  }
  FX.announce(`WAVE ${wave}`, 'start'); sfx.done?.();
}
function survivalTick(dt) {
  for (const e of enemies) if (e.alive) return '';
  waveT += dt; if (waveT > 3) nextWave();
  return `WAVE ${wave + 1} INCOMING`;
}
function forceContact() {                                                      // nearest patrol + its buddies hunt the player (skipped if already fighting)
  if (enemies.some(e => e.alive && e.state === 'combat')) return;
  let best = null, bd = Infinity;
  for (const e of enemies) if (e.alive && !e.T.static) { const d = e.pos.distanceToSquared(player.pos); if (d < bd) { bd = d; best = e; } }
  if (!best) return;
  for (const e of enemies) if (e.alive && !e.T.static && (e === best || e.pos.distanceTo(best.pos) < 14)) { e.alert(player.pos, 1); e.goTo?.(player.pos, G); }
  radioOnce('contact');
}
function revealPlayer() { for (const o of enemies) if (o.alive) o.alert(player.pos, 1); if (!said.revealed) { said.revealed = true; radio('OKONKWO', 'They have a fix on you. Move!'); } setTimeout(() => { said.revealed = false; }, 8000); }
function enemyEffect(kind, d) {
  const owner = effectOwner;
  if (kind === 'smoke') zones.smoke.push({ pos: d.pos, radius: d.radius, t: d.life });
  else if (kind === 'lockdown') zones.elock.push({ pos: d.pos, radius: d.radius, t: d.life });
  else if (kind === 'shield' && owner) owner.shieldHP = 80;
  else if (kind === 'sensor') { if (d.pos.distanceTo(player.pos) < d.radius + 6) revealPlayer(); }
  else if (kind === 'drone') zones.edrone.push({ obj: d.obj, radius: d.radius, t: d.life });
  else if (kind === 'flash') {
    sfx.flash();
    const eye = camera.getWorldPosition(V()), to = d.pos.clone().sub(eye), dist = to.length(), look = V(); camera.getWorldDirection(look);
    if (dist < d.radius && world.lineClear(eye, d.pos)) flashK = Math.max(flashK, clamp(0.35 + look.dot(to.normalize()), 0.15, 1) * (1 - dist / d.radius * 0.5));
  }
}

// ---------- abilities ----------
function chosenAbilities() { const saved = loadout.abilities[mission?.id]; return saved && saved.length === 2 ? saved : mission.pool.slice(0, 2); }
function useAbility(slot) {
  const kind = picks[slot]; if (!kind || !running || abilityCD[slot] > 0 || !player.alive) return false;
  abilityCD[slot] = ABILITIES[kind].cd; sfx.ability(); LS.ab++;
  const fwd = V(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const look = V(); camera.getWorldDirection(look);
  const hand = camera.getWorldPosition(V()).addScaledVector(look, 0.5).add(V(0, -0.25, 0)).addScaledVector(V(-fwd.z, 0, fwd.x), -0.15);
  proxy.position.copy(player.pos);
  if (kind === 'dash') { vm.gesture(); player.dashT = 0.22; player.dash.copy(fwd).multiplyScalar(15); fx.spawn('dash', { root: proxy, forward: fwd, move: false }); return true; }
  const throwFwd = kind === 'flash' || kind === 'smoke' || kind === 'decoy' ? V(look.x, 0, look.z).normalize() : fwd;
  vm.gesture();
  fx.spawn(kind, { hand, forward: throwFwd, root: proxy, template: A.rhea.scene, clips: A.rhea.animations });
  return true;
}
function abilityEvent(kind, d) {
  if (kind === 'smoke') zones.smoke.push({ pos: d.pos, radius: d.radius, t: d.life });
  else if (kind === 'lockdown') zones.lock.push({ pos: d.pos, radius: d.radius, t: d.life });
  else if (kind === 'sensor') { zones.sensor.push({ pos: d.pos, radius: d.radius, t: d.life }); }
  else if (kind === 'decoy') zones.decoy.push({ obj: d.obj, t: d.life });
  else if (kind === 'drone') zones.drone.push({ obj: d.obj, radius: d.radius, t: d.life });
  else if (kind === 'shield') { player.shield = 60; player.shieldT = d.life; }
  else if (kind === 'flash') {
    sfx.flash();
    for (const e of enemies) {
      if (!e.alive) continue; const ep = e.eye;
      if (ep.distanceTo(d.pos) < d.radius && world.lineClear(ep, d.pos)) { e.blindT = Math.max(e.blindT, 3.2); e.alert(player.pos, 0.6); }
    }
    const eye = camera.getWorldPosition(V()), to = d.pos.clone().sub(eye), dist = to.length(), look = V(); camera.getWorldDirection(look);
    if (dist < d.radius && world.lineClear(eye, d.pos)) { const facing = look.dot(to.normalize()); flashK = Math.max(flashK, clamp(0.35 + facing, 0.15, 1) * (1 - dist / d.radius * 0.5)); }
  }
}

// ---------- objectives ----------
function nearPoint(i) { const p = map.points[i]; return Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < CFG.useR && Math.abs(player.pos.y - p.y) < 1.6; }
function blockers(p) { return enemies.filter(e => e.alive && e.pos.distanceTo(p) < CFG.blockR).length; }
function updateObjective(dt) {
  const usingE = keys.KeyE && player.alive;
  objective.active = -1; let prompt = '';
  if (mission.objective === 'plant_hold') {
    const p = map.points[0];
    if (!objective.planted) {
      if (nearPoint(0)) {
        radioOnce('near');
        const b = blockers(p);
        if (usingE && !b) { objective.plantProg += dt; objective.active = 0; if (Math.floor(objective.plantProg * 3) !== Math.floor((objective.plantProg - dt) * 3)) sfx.beep(false); }
        else { objective.plantProg = Math.max(0, objective.plantProg - dt * 2); prompt = b ? `CLEAR ${b} HOSTILE${b > 1 ? 'S' : ''} FIRST` : 'HOLD E · PLANT CHARGE'; }
        if (objective.plantProg >= CFG.plant) {
          objective.planted = true; sfx.done(); FX.announce('CHARGE PLANTED', 'objective'); FX.xpPop(META.XP.objective, 'OBJECTIVE'); radioOnce('planted'); matchXP.objective += META.XP.objective;
          const fixer = enemies.filter(e => e.alive && !e.T.static && !e.T.flying).sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))[0];
          if (fixer) fixer.task = { kind: 'defuse', clip: 'defuse', pos: p.clone().add(V(0, 0, 1.0)), t: 0 };
          const c = A.props.counter_charge.clone(true); c.position.copy(p).add(V(0, 0, 0.6)); toonify(c); outline(c, { thick: 0.015 }); scene.add(c); objective.charge = c;
          devices[0].lamp.material.color.set(0xffd23b); devices[0].glow.color.set(0xffd23b);
          for (const e of enemies) e.alert(p, 1);
        }
      } else objective.plantProg = Math.max(0, objective.plantProg - dt * 2);
    } else {
      const inArea = player.pos.distanceTo(p) < map.holdRadius + 1;
      objective.holdProg = inArea ? objective.holdProg + dt : Math.max(0, objective.holdProg - dt * 0.5);
      if (!inArea) prompt = 'RETURN TO THE SERVER';
      if (objective.holdProg >= CFG.hold) win();
    }
  } else {
    const dur = mission.objective === 'retrieve' ? CFG.retrieve : CFG.defuse, verb = mission.objective === 'retrieve' ? 'RETRIEVE' : 'DEFUSE';
    if (objective.extract) {
      const d = Math.hypot(player.pos.x - map.extract.x, player.pos.z - map.extract.z);
      if (d < 3.5) win(); else prompt = `EXTRACT · ${Math.round(d)} M`;
      return prompt;
    }
    for (let i = 0; i < map.points.length; i++) {
      if (objective.done[i]) continue;
      if (nearPoint(i)) {
        radioOnce('near');
        const b = blockers(map.points[i]);
        if (usingE && !b) { objective.prog[i] += dt; objective.active = i; if (Math.floor(objective.prog[i] * 2) !== Math.floor((objective.prog[i] - dt) * 2)) sfx.beep(true); }
        else prompt = b ? `CLEAR ${b} HOSTILE${b > 1 ? 'S' : ''} FIRST` : `HOLD E · ${verb}`;
        if (objective.prog[i] >= dur) {
          objective.done[i] = true; sfx.done(); FX.announce(mission.objective === 'retrieve' ? 'DRIVE SECURED' : 'DEVICE DEFUSED', 'objective'); FX.xpPop(META.XP.objective, 'OBJECTIVE'); devices[i].lamp.material.color.set(0x3bff6a); devices[i].glow.color.set(0x3bff6a); matchXP.objective += META.XP.objective;
          if (mission.objective === 'retrieve') devices[i].g.children.slice(0, 2).forEach(o => o.visible = false);
          const left = objective.done.filter(d => !d).length;
          if (left) { if (mission.radio.device) radio(...mission.radio.device[0]); else radio('OKONKWO', `Device down. ${left} to go.`); }
          else if (mission.objective === 'retrieve' && route.part >= route.parts - 1) { objective.extract = true; radioOnce('extract'); if (extractMark) extractMark.visible = true; for (const e of enemies) e.alert(player.pos, 1); }
          else win();
        }
      }
      if (objective.active !== i) objective.prog[i] = Math.max(0, objective.prog[i] - dt * 1.5);
    }
  }
  return prompt;
}

// ---------- breach charges, intel caches, explosive barrels ----------
let breachRing = -1, lodTick = 0;
function updateInteract(dt, prompt) {
  breachRing = -1;
  for (const b of breaches) {
    if (b.fuse >= 0) {
      b.fuse -= dt; if (Math.floor(b.fuse * 4) !== Math.floor((b.fuse + dt) * 4)) sfx.beep(true);
      if (b.fuse < 0) { b.done = true; world.removeBox(b.col); b.mesh.visible = false; b.charge?.parent?.remove(b.charge); explode(b.pos.clone().add(V(0, 1.2, 0)), 6, 140, 'BREACH'); matchXP.breach += META.XP.breach; META.profile.totals.breaches++; }
      continue;
    }
    if (b.done || prompt || objective.active >= 0) continue;
    const d = Math.hypot(player.pos.x - b.pos.x, player.pos.z - b.pos.z);
    if (d > 3.2 || Math.abs(player.pos.y - b.pos.y) > 1.6) { b.prog = Math.max(0, b.prog - dt * 2); continue; }
    if (keys.KeyE && player.alive) {
      b.prog += dt; breachRing = b.prog / CFG.breach;
      if (b.prog >= CFG.breach) {
        b.fuse = CFG.fuse; sfx.beep(false);
        const c = A.props.counter_charge.clone(true), n = b.normal;
        const sg = (player.pos.x - b.pos.x) * n.x + (player.pos.z - b.pos.z) * n.z >= 0 ? 1 : -1;   // wall side the player stands on
        c.scale.setScalar(1.5);
        c.position.set(b.pos.x + n.x * sg * 0.4, b.pos.y + 1.2, b.pos.z + n.z * sg * 0.4);
        c.lookAt(c.position.x + n.x * sg, c.position.y, c.position.z + n.z * sg); toonify(c); scene.add(c); b.charge = c;
        radio('VOSS', 'Breach charge set. Stand clear!', 2);
      }
    } else prompt = 'HOLD E · PLACE BREACH CHARGE';
  }
  // intel: walk over to collect
  for (const it of intel) {
    if (it.got) continue;
    it.g.rotation.y += dt * 2; it.g.children[0].position.y = 0.6 + Math.sin(elapsed * 3) * 0.08;
    if (player.pos.distanceTo(it.pos) < 1.4) {
      it.got = true; it.g.visible = false; sfx.pickup(); FX.xpPop(META.XP.intel, 'INTEL'); matchXP.intel += META.XP.intel;
      if (!META.profile.intel.includes(it.id)) { META.profile.intel.push(it.id); META.saveProfile(); }
      const left = intel.filter(x => !x.got).length;
      feed(`INTEL RECOVERED · ${META.profile.intel.length} TOTAL${left ? ` · ${left} HERE` : ''}`, true);
    }
  }
  updateMedkits(dt);
  if (extractMark) extractMark.material.opacity = 0.18 + Math.sin(elapsed * 4) * 0.08;
  return prompt;
}
// ---------- medkits: seeded nav-node health pickups (+35 HP, respawn 30 s) ----------
const MEDKIT = { heal: 35, respawn: 30, r: 1.5 };
let _mkGeo = null;
function medkitMesh() {
  if (!_mkGeo) _mkGeo = { box: new THREE.BoxGeometry(0.46, 0.32, 0.34), bar: new THREE.BoxGeometry(0.28, 0.09, 0.02), white: new THREE.MeshBasicMaterial({ color: 0xf4f4f0 }), red: new THREE.MeshBasicMaterial({ color: 0xe8202a }), ring: new THREE.TorusGeometry(0.5, 0.03, 6, 20), ringM: new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.7 }) };
  const g = new THREE.Group(), m = new THREE.Group(); m.position.y = 0.6;
  m.add(new THREE.Mesh(_mkGeo.box, _mkGeo.white));
  for (const z of [0.175, -0.175]) { const a = new THREE.Mesh(_mkGeo.bar, _mkGeo.red); a.position.z = z; const b = new THREE.Mesh(_mkGeo.bar, _mkGeo.red); b.rotation.z = Math.PI / 2; b.position.z = z; m.add(a, b); }
  g.add(m); const ring = new THREE.Mesh(_mkGeo.ring, _mkGeo.ringM); ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; g.add(ring);
  return g;
}
function buildMedkits() {
  let h = 2166136261; for (const ch of mission.id + (mission.proc?.seed || '')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => { h = (h + 0x6D2B79F5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const nodes = world.nav?.nodes || [], sps = Object.values(map.spawns), sp = map.spawns.default, want = 3 + Math.floor(rnd() * 4), out = [];
  const pool = [];
  for (const n of nodes) {
    const p = n.pos;
    if (sps.some(q => q.distanceTo(p) < 15) || map.points.some(q => q.distanceTo(p) < 6) || (map.extract && map.extract.distanceTo(p) < 6)) continue;
    if (breaches.some(b => b.pos.distanceTo(p) < 3) || barrels.some(b => b.pos.distanceTo(p) < 2)) continue;
    pool.push(p);
  }
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  for (const p of pool) {
    if (out.length >= want) break;
    if (out.some(m => m.pos.distanceTo(p) < 22) || !world.reachable(sp, p, 1.2)) continue;
    const g = medkitMesh(); g.position.copy(p); scene.add(g); out.push({ g, pos: p.clone(), t: 0 });
  }
  return out;
}
function updateMedkits(dt) {
  for (const m of medkits) {
    if (m.t > 0) { m.t -= dt; if (m.t <= 0) m.g.visible = true; else continue; }
    m.g.rotation.y += dt * 2; m.g.children[0].position.y = 0.6 + Math.sin(elapsed * 3 + m.pos.x) * 0.08;
    if (player.alive && player.hp < 100 && Math.abs(player.pos.y - m.pos.y) < 1.5 && Math.hypot(player.pos.x - m.pos.x, player.pos.z - m.pos.z) < MEDKIT.r) {
      const before = player.hp; player.hp = Math.min(100, player.hp + MEDKIT.heal); m.t = MEDKIT.respawn; m.g.visible = false;
      sfx.pickup(); FX.xpPop(Math.round(player.hp - before), 'HEALTH'); feed(`MEDKIT · +${Math.round(player.hp - before)} HP`, true);
    }
  }
}
function explode(p, r, dmg, label) {
  sfx.boom(); shakeK = Math.max(shakeK, clamp(1 - player.pos.distanceTo(p) / 30, 0, 1));
  for (let i = 0; i < 7; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex(), color: i % 2 ? 0xffa040 : 0xffe080, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.position.copy(p).add(V(rand(-1, 1), rand(-0.5, 1.2), rand(-1, 1))); sp.scale.setScalar(rand(2, 3.6)); sp.userData.t = 0.35; sp.userData.spark = true; scene.add(sp); impacts.push(sp); }
  for (const e of enemies) {
    if (!e.alive) continue; const d = e.pos.clone().add(V(0, 1, 0)).distanceTo(p);
    if (d < r) { const killed = e.damage(dmg * (1 - d / r * 0.6), p.clone()); if (killed) { stats.kills++; killTick(); matchXP.kills += META.XP.kill; feed(`VOSS ▸ ${ENEMY_TYPES[e.type].name.toUpperCase()} · ${label}`, false); } }
    if (d < 30) e.alert(p, 1);
  }
  const pd = player.pos.clone().add(V(0, 1, 0)).distanceTo(p);
  if (pd < r && world.lineClear(p, player.pos.clone().add(V(0, 1.4, 0)))) damagePlayer(dmg * 0.45 * (1 - pd / r), p);
  for (const b of barrels) if (b.alive && b.pos.distanceTo(p) < r * 0.8 && b.pos.distanceTo(p) > 0.1) setTimeout(() => detonateBarrel(b), 140);
}
function detonateBarrel(b) {
  if (!b.alive || !running && !TEST) return; b.alive = false; b.mesh.visible = false; world.removeBox(b.col);
  matchXP.barrel += META.XP.barrel; explode(b.pos.clone(), 5.5, 160, 'BARREL');
}

// ---------- player ----------
function updatePlayer(dt) {
  let mx = 0, mz = 0;
  if (keys.KeyW) mz -= 1; if (keys.KeyS) mz += 1; if (keys.KeyA) mx -= 1; if (keys.KeyD) mx += 1;
  let mag = 1;
  if (touch && (touch.move.x || touch.move.y)) { mx = touch.move.x; mz = touch.move.y; mag = Math.min(1, Math.hypot(mx, mz)); if (mag < 0.12) mx = mz = 0; }
  const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
  let wx = mx * c + mz * s, wz = -mx * s + mz * c; const wl = Math.hypot(wx, wz); if (wl) { wx /= wl; wz /= wl; }
  const w = cs(); let speed = keys.ShiftLeft ? CFG.walk : CFG.run;
  if (w.cls === 'machine gun' || w.cls === 'sniper') speed *= 0.9; speed *= 1 - W.ads * 0.45;
  if (objective.active >= 0) speed = 0;
  if (zones.elock.some(z => z.pos.distanceTo(player.pos) < z.radius && Math.abs(z.pos.y - player.pos.y) < 3)) speed *= 0.45;
  const k = Math.min(1, dt * (player.onGround ? 14 : 2.5));
  player.vel.x += (wx * speed * mag - player.vel.x) * k; player.vel.z += (wz * speed * mag - player.vel.z) * k;
  if (player.dashT > 0) { player.dashT -= dt; player.vel.x = player.dash.x; player.vel.z = player.dash.z; }
  FEEL.slideCD -= dt;
  if ((keys.KeyC || keys.ControlLeft) && FEEL.slideT <= 0 && FEEL.slideCD <= 0 && player.onGround && Math.hypot(player.vel.x, player.vel.z) > CFG.run * 0.8) {
    FEEL.slideT = 0.55; FEEL.slideCD = 0.9; const v = Math.hypot(player.vel.x, player.vel.z); player.dash.set(player.vel.x / v * CFG.run * 1.55, 0, player.vel.z / v * CFG.run * 1.55); sfx.step();
  }
  if (FEEL.slideT > 0) { FEEL.slideT -= dt; const k = Math.max(0, FEEL.slideT / 0.55); player.vel.x = player.dash.x * (0.45 + 0.55 * k); player.vel.z = player.dash.z * (0.45 + 0.55 * k); }
  if (keys.Space && player.onGround && objective.active < 0) { player.vel.y = CFG.jump; player.onGround = false; if (FEEL.slideT > 0) { FEEL.slideT = 0; player.vel.x *= 1.15; player.vel.z *= 1.15; } }
  world.move(player, dt, { step: 0.45, gravity: 22 });
  if (player.pos.y < -30) { player.pos.copy(map.spawns.default); player.vel.set(0, 0, 0); }
  player.moving = Math.hypot(player.vel.x, player.vel.z) > 0.5;
  if (player.moving && player.onGround && !keys.ShiftLeft) { stepT -= dt * Math.hypot(player.vel.x, player.vel.z); if (stepT <= 0) { stepT = 2.2; sfx.step(); for (const e of enemies) if (e.pos.distanceTo(player.pos) < 7) e.alert(player.pos, 0.5); } }
  player.shieldT = Math.max(0, player.shieldT - dt); if (player.shieldT <= 0) player.shield = 0;
  proxy.position.copy(player.pos);
}
function updateWeapon(dt) {
  W.cd -= dt; W.drawT = Math.max(0, W.drawT - dt); W.bloom = Math.max(0, W.bloom - dt * 0.08);
  if (W.recoverP > 0) { const r = Math.min(W.recoverP, dt * 0.35); W.recoverP -= r; if (!mouse.l) player.pitch -= r; }
  if (W.reloadT > 0) {
    W.reloadT -= dt;
    if (W.reloadT <= 0) { const s = st(), n = Math.min(cs().mag - s.mag, s.reserve); s.mag += n; s.reserve -= n; W.reloadT = 0; }
  }
  const w = cs();
  if (mouse.l && player.alive && objective.active < 0) {
    if (w.auto) fire(); else if (!W.firedSemi) { fire(); W.firedSemi = true; }
  } else W.firedSemi = false;
  const adsT = mouse.r && W.reloadT <= 0 && W.drawT <= 0 && objective.active < 0 ? 1 : 0;
  W.ads += (adsT - W.ads) * Math.min(1, dt * 12);
  const spd = Math.hypot(player.vel.x, player.vel.z); FEEL.fovKick += ((FEEL.slideT > 0 ? 9 : spd > CFG.run * 0.9 ? 4 : 0) * (1 - W.ads) - FEEL.fovKick) * Math.min(1, dt * 6);
  const targetFov = (75 + FEEL.fovKick + (w.zoom - 75) * (w.scope ? (W.ads > 0.9 ? 1 : W.ads * 0.2) : W.ads)) * fovK;
  if (Math.abs(camera.fov - targetFov) > 0.05) { camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 18); camera.updateProjectionMatrix(); }
  const ev = vm.update(dt, { moving: player.moving, speed: Math.hypot(player.vel.x, player.vel.z), lookDX: lookD.x, lookDY: lookD.y, adsTarget: adsT, sprint: false, onGround: player.onGround, scope: w.scope && W.ads > 0.9 });
  lookD.x = lookD.y = 0;
  for (const e of ev) e === 'out' ? sfx.magOut() : e === 'in' ? sfx.magIn() : sfx.bolt();
  vm.root.position.y += ((objective.active >= 0 ? -0.35 : 0) - vm.root.position.y) * Math.min(1, dt * 8);
}

// ---------- touch input + aim assist ----------
let assist = null;
function assistTarget() {
  if (!settings.aimAssist) return null;
  const eye = camera.getWorldPosition(V()), look = V(); camera.getWorldDirection(look);
  let best = null;
  for (const e of enemies) {
    if (!e.alive) continue;
    const c = e.pos.clone().add(V(0, e.T.flying ? 0 : e.T.static ? 0.6 : 1.25, 0)), to = c.clone().sub(eye), d = to.length();
    if (d > cs().range) continue;
    const ang = Math.acos(clamp(look.dot(to.normalize()), -1, 1));
    const lim = Math.max(0.035, 0.12 * Math.min(1, 12 / d));          // wider cone up close
    if (ang > lim || (best && ang > best.ang)) continue;
    if (!G.losClear(eye, c)) continue;
    best = { e, ang, lim, c };
  }
  return best;
}
function lookBy(dx, dy, k) { player.yaw -= dx * k; player.pitch = clamp(player.pitch - dy * k, -1.45, 1.45); lookD.x += dx; lookD.y += dy; }
function pollInput(dt) {
  assist = assistTarget();
  const slow = assist && assist.ang < assist.lim * 0.6 ? 0.55 : 1;
  if (touch) {
    const l = touch.takeLook();
    lookBy(l.x, l.y, 0.0042 * settings.touchSens * slow * (camera.fov / 75 / fovK));
    mouse.l = touch.fire; mouse.r = touch.aim;
    if (touch.take('jump')) keys.Space = true, setTimeout(() => { keys.Space = false; }, 80);
    if (touch.take('ab0')) useAbility(0); if (touch.take('ab1')) useAbility(1);
    if (touch.take('swap')) equip(W.cur ? 0 : 1);
    if (touch.take('pause')) doPause();
    if (touch.take('spray')) doSpray();
    if (touch.take('reload')) startReload();
    keys.KeyE = touch.use;
    touch.setCooldowns(abilityCD);
    if (settings.fireMode === 'auto') mouse.l = touch.fire || !!(assist && assist.ang < 0.03 + 0.4 / assist.c.distanceTo(player.pos));
  }
  // pull toward the target: always on touch, on PC only while firing
  if (assist && (touch || mouse.l)) {
    const eye = camera.getWorldPosition(V()), to = assist.c.clone().sub(eye);
    const wantYaw = Math.atan2(-to.x, -to.z), wantPitch = Math.atan2(to.y, Math.hypot(to.x, to.z));
    let dy = wantYaw - player.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    const rate = (touch ? 1.6 : 0.7) * dt;
    player.yaw += clamp(dy, -rate, rate) * 0.6; player.pitch += clamp(wantPitch - player.pitch, -rate, rate) * 0.4;
  }
  aimSlow = slow;
}
let aimSlow = 1;

// ---------- frame update ----------
// ---- game feel state (research items: hit-stop, camera punch, slide, sprint FOV, death impulse, adaptive music)
const FEEL = { hitStop: 0, punchP: 0, punchY: 0, slideT: 0, slideCD: 0, fovKick: 0, combo: 0, comboT: 0 };
function update(dt) {
  if (!running) return;
  if (firstContactT > 0 && (firstContactT -= dt) <= 0) forceContact();
  if (FEEL.hitStop > 0) { FEEL.hitStop -= dt; dt *= 0.12; }               // lethal headshot: world slows for a beat
  FEEL.punchP *= Math.max(0, 1 - dt * 16); FEEL.punchY *= Math.max(0, 1 - dt * 16);
  FEEL.comboT -= dt; if (FEEL.comboT <= 0) FEEL.combo = 0;
  if (LS.mv < 0 && player.moving) LS.mv = Math.round(elapsed); if (LS.sh < 0 && stats.shots) LS.sh = Math.round(elapsed);
  { const fighting = enemies.some(e => e.alive && e.state === 'combat'); if (fighting && LS.ct < 0) LS.ct = Math.round(elapsed); music.setIntensity(fighting ? 1 : clock < 30 ? 0.7 : 0.25); }
  for (const e of enemies) if (!e.alive && e._dv && e.deadT < 0.45) { e.pos.addScaledVector(e._dv, dt * (1 - e.deadT / 0.45)); }   // death knockback
  const tutHold = !!tutorial?.hold;                                     // tutorial drills: freeze the timer + hostiles
  let areaClear = !mode && enemies.length > 0; if (areaClear) for (const e of enemies) if (e.alive) { areaClear = false; break; }
  if (areaClear && !said.clear) { said.clear = true; FX.announce('AREA CLEAR', 'objective'); radio('OKONKWO', 'Area clear. Timer is off, take your time.', 3); }
  elapsed += dt; if (!tutHold && !areaClear) clock -= dt; repathBudget = 2;      // all hostiles down: the clock stops
  if (clock <= 30 && clock + dt > 30) radioOnce('low');
  if (clock <= 0) { clock = 0; lose(mission.failTimer); return; }
  pollInput(dt);
  updatePlayer(dt);
  let prompt = mode === 'survival' ? survivalTick(dt) : updateObjective(dt); prompt = updateInteract(dt, prompt);
  invT = Math.max(0, invT - dt); shakeK = Math.max(0, shakeK - dt * 2.5); sprayCD = Math.max(0, sprayCD - dt);
  updateWeapon(dt);
  for (let i = 0; i < 2; i++) abilityCD[i] = Math.max(0, abilityCD[i] - dt);
  swingCharm(dt);
  lodTick = (lodTick + 1) % 3;
  for (const e of enemies) {
    if (tutHold) { e.tickAnim(dt); e.sync(); continue; }
    const far = e.alive && e.state === 'patrol' && e.pos.distanceToSquared(player.pos) > 1600;
    if (!far) { if (e._lodAcc) { e.update(e._lodAcc, G); e._lodAcc = 0; } e.update(dt, G); continue; }
    e._lodAcc = (e._lodAcc || 0) + dt; if ((e.id % 3) === lodTick) { e.update(Math.min(e._lodAcc, 0.15), G); e._lodAcc = 0; }
  }
  for (const k of Object.keys(zones)) zones[k] = zones[k].filter(z => (z.t -= dt) > 0);
  const reveal = e => zones.sensor.some(z => z.pos.distanceTo(e.pos) < z.radius) || zones.drone.some(z => z.obj.position.distanceTo(e.pos) < z.radius);
  for (const e of enemies) if (e.alive && reveal(e)) e.revealT = 1.5;
  fx.update(dt); efx.update(dt);
  if (zones.edrone.some(z => z.obj.position.distanceTo(player.pos) < z.radius)) revealPlayer();
  for (const l of [...lasers.keys()]) if (!l.alive) { lasers.get(l).visible = false; }
  map.kit.update(dt, elapsed);
  devices.forEach((d, i) => { if (!objective.done[i] && !(mission.objective === 'plant_hold' && objective.planted)) d.lamp.visible = Math.sin(elapsed * (clock < 30 ? 14 : 6)) > 0; else d.lamp.visible = true; });
  tracers = tracers.filter(l => { l.userData.t -= dt; if (l.userData.t <= 0) { scene.remove(l); l.geometry.dispose(); return false; } return true; });
  impacts = impacts.filter(o => { o.userData.t -= dt; if (o.userData.spark) o.scale.multiplyScalar(1 + dt * 4); if (o.userData.t <= 0) { scene.remove(o); return false; } return true; });
  flashK = Math.max(0, flashK - dt * 0.45); hurtK = Math.max(0, hurtK - dt * 1.6); hitmT = Math.max(0, hitmT - dt); laserK = Math.max(0, laserK - dt * 3);
  dmgDirs = dmgDirs.filter(d => (d.t -= dt) > 0);
  RADIO.update(dt);
  updateHud(prompt);
  FX.lowHealth(player.alive ? clamp(1 - player.hp / 45, 0, 1) : 0);
  { // arrow to the nearest live objective (or extraction)
    let tgt = null, bd = Infinity, label = 'OBJ';
    if (objective.extract) { tgt = map.extract; label = 'EXTRACT'; }
    else map.points.forEach((p, i) => { if (objective.done[i] || (mission.objective === 'plant_hold' && objective.planted && i)) return; const d = p.distanceTo(player.pos); if (d < bd) { bd = d; tgt = p; } });
    if (tgt) {                                                           // follow the walkable route (stairs, ladders), not a straight line through walls
      guideTo(tgt, dt); const w = GUIDE.wp || tgt;
      _arrowP.copy(w).y += 1.2; const sp = toScreen(_arrowP); if (sp.behind) { sp.x = innerWidth - sp.x; sp.y = innerHeight; }
      FX.objectiveArrow(sp.x, sp.y, sp.on, label, Math.round(GUIDE.len || tgt.distanceTo(player.pos)));
    } else GUIDE.path = null;
  }
  if (mentor) { mentor.update(dt, MCTX); mfx?.update(dt); }
  if (tutorial?.active) tutorialTick(dt);
  FX.update(dt);
}

// ---------- guided tutorial (mission 1) + mentor bot (Amara, the last operative unlock) ----------
let tutorial = null, mentor = null, mfx = null, mentorGltf = null, tutToken = 0;
const tutPrev = { yaw: 0, pitch: 0, shots: 0, cur: 0, cd0: 0, cd1: 0, kills0: 0 };
const _tv = new THREE.Vector3(), _tv2 = new THREE.Vector3();
const MCTX = {
  get player() { return player; }, get world() { return world; }, get enemies() { return enemies; },
  losClear: (a, b) => world.lineClear(a, b) && !smokeBlocks(a, b),
  onShot(from, to, e, killed, hit) {
    addTracer(from, to, 0x8fffc0); sfx.shot('rifle', { dist: from.distanceTo(player.pos), pan: 0 });
    if (hit) e.alert(mentor.pos, 1);
    if (killed) feed(`AMARA ▸ ${ENEMY_TYPES[e.type].name.toUpperCase()}`, false);
  },
  onAbility(m, kind) {
    if (!mfx || !mentorGltf) return;
    mfx.spawn(kind, { hand: m.muzzle(V()), forward: m.forward(V()), root: m.root, template: mentorGltf.scene, clips: mentorGltf.animations, move: false });
  },
};
// mentor ability effects: visuals + smoke/flash on hostiles only (never blinds or shields the player)
function mentorEvent(kind, d) {
  if (kind === 'smoke') zones.smoke.push({ pos: d.pos, radius: d.radius, t: d.life });
  else if (kind === 'flash') { sfx.flash(); for (const e of enemies) if (e.alive && e.eye.distanceTo(d.pos) < d.radius && world.lineClear(e.eye, d.pos)) e.blindT = Math.max(e.blindT, 3.2); }
  else if (kind === 'decoy') zones.decoy.push({ obj: d.obj, t: d.life });
  else if (kind === 'sensor') zones.sensor.push({ pos: d.pos, radius: d.radius, t: d.life });
  else if (kind === 'drone') zones.drone.push({ obj: d.obj, radius: d.radius, t: d.life });
}
function spawnMentor(g) {
  mentorGltf = g; A.gunCal ??= {}; A.gunCal['amara:r'] ??= calibrateGun(g, 'shoot');
  const fwd = V(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const p = player.pos.clone().addScaledVector(fwd, 2.4).addScaledVector(V(-fwd.z, 0, fwd.x), 1.2);
  if (!world.reachable(player.pos, p, 1.5)) p.copy(player.pos).addScaledVector(fwd, -1.5);
  mentor = new Mentor({ gltf: g, gun: A.weapons.ar7_lance, gunOffset: A.gunCal['amara:r'], gunInfo: weaponInfo(A.weapons.ar7_lance), pos: p, yaw: player.yaw + Math.PI });
  toonify(mentor.root, { rim: 0x8fffc0 }); outline(mentor.root, { thick: 0.02 }); scene.add(mentor.root);
  mfx = new AbilityFX(scene, {
    ground: (x, z, y) => { const h = world.groundHeight(x, z, 0.05, y + 0.2, 0.6); return Number.isFinite(h) ? h : 0; },
    collide: (a, b) => { const d = b.clone().sub(a), l = d.length(); if (l < 1e-4) return null; const h = world.raycast(a, d.divideScalar(l), l); return h ? { point: h.point, normal: h.normal } : null; },
    onFlash: () => {}, onEvent: mentorEvent,
  });
}
function dropMentor() { mentor?.root.parent?.remove(mentor.root); mentor = null; mfx = null; }
function startTutorial(force) {
  const token = ++tutToken;
  tutorial?.abort();
  tutorial = createTutorial({ isTouch: !!touch, hooks: TUT_HOOKS, onDone: ({ skipped }) => { if (skipped) dropMentor(); else if (mentor) mentor.fight = true; } });
  if (!tutorial.start({ force })) return false;
  RADIO.clear(); RADIO.once(mission.id + ':start', []);                     // Amara's intro replaces the opening radio
  loadOperative('amara').then(g => { if (token === tutToken && running && missionIdx === 0 && tutorial?.active) spawnMentor(g); }).catch(e => errors.push('mentor: ' + e));
  Object.assign(tutPrev, { yaw: player.yaw, pitch: player.pitch, shots: stats.shots, cur: W.cur, cd0: 0, cd1: 0, kills0: 0 });
  return true;
}
const TUT_HOOKS = {
  say(who, text) { RADIO.clear(); RADIO.say(who, text); },
  abilityName: slot => ABILITIES[picks[slot]]?.name || '', abilityKind: slot => picks[slot],
  demo(slot) {
    if (!mentor || !picks[slot]) return;
    _tv.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));                  // throw where the player is looking
    mentor.yaw = Math.atan2(_tv.x, _tv.z); mentor.demo(picks[slot]);
  },
  onStep(id) {
    track('tut', { s: id }); at('tut:' + id);
    if (id === 'reload') { const s = st(); if (s.mag >= cs().mag) { const n = Math.min(s.mag - 1, 6); s.mag -= n; s.reserve += n; } }
    if (id === 'ab0') abilityCD[0] = 0; if (id === 'ab1') abilityCD[1] = 0;
    if (id === 'fight') {
      tutPrev.kills0 = deadCount(); if (mentor) mentor.fight = true;
      const near = enemies.filter(e => e.alive && !e.T.static).sort((a, b) => a.pos.distanceToSquared(player.pos) - b.pos.distanceToSquared(player.pos)).slice(0, 2);
      for (const e of near) { e.alert(player.pos, 1.5); e.goTo?.(player.pos, G); }
    }
  },
};
function deadCount() { let n = 0; for (const e of enemies) if (!e.alive) n++; return n; }
function tutorialTick(dt) {
  const T = TUT, sp = Math.hypot(player.vel.x, player.vel.z);
  T.dt = dt; T.look = Math.abs(player.yaw - tutPrev.yaw) + Math.abs(player.pitch - tutPrev.pitch); tutPrev.yaw = player.yaw; tutPrev.pitch = player.pitch;
  T.moved = player.moving; T.walked = player.moving && sp < CFG.walk + 0.6; T.jumped = !player.onGround && player.vel.y > 1;
  T.slid = FEEL.slideT > 0; T.fired = stats.shots > tutPrev.shots; tutPrev.shots = stats.shots;
  T.aiming = W.ads > 0.8; T.reloaded = W.reloadT > 0; T.swapped = W.cur !== tutPrev.cur; tutPrev.cur = W.cur;
  T.ab0 = abilityCD[0] > tutPrev.cd0 + 0.5; T.ab1 = abilityCD[1] > tutPrev.cd1 + 0.5; tutPrev.cd0 = abilityCD[0]; tutPrev.cd1 = abilityCD[1];
  T.kills = deadCount() - tutPrev.kills0; T.interacting = objective.active >= 0;
  tutorial.update(dt, T);
}
window.__replayTutorial = () => { unlockAudio(); startMission(0, { tutorial: true }); };
const _arrowP = new THREE.Vector3();
// route guide: a nav path to the objective refreshed every 0.8 s; the arrow points at a waypoint ~6 m along it
const GUIDE = { t: 0, path: null, wp: null, len: 0, tgt: null };
function guideTo(tgt, dt) {
  if ((GUIDE.t -= dt) > 0 && GUIDE.tgt === tgt) return;
  GUIDE.t = 0.8; GUIDE.tgt = tgt;
  const path = world.findPath(player.pos, tgt);
  if (!path || path.length < 2) { GUIDE.path = null; GUIDE.wp = null; GUIDE.len = 0; return; }
  path.push(tgt.clone()); GUIDE.path = path;
  let len = 0, wp = null, acc = 0, prev = player.pos;
  for (const p of path) { const d = prev.distanceTo(p); len += d; acc += d; if (!wp && acc > 6) wp = p; prev = p; }
  GUIDE.wp = wp || tgt; GUIDE.len = len;
}
function updateCamera() {
  camera.position.set(player.pos.x, player.pos.y + CFG.eye - (FEEL.slideT > 0 ? 0.55 : 0), player.pos.z);
  camera.rotation.set(player.pitch + FEEL.punchP + (shakeK ? rand(-1, 1) * shakeK * 0.03 : 0), player.yaw + FEEL.punchY + (shakeK ? rand(-1, 1) * shakeK * 0.03 : 0), FEEL.slideT > 0 ? 0.04 : 0, 'YXZ');
  if (sun) { sun.position.copy(player.pos).add(sun.userData.off); sun.target.position.copy(player.pos); }
}
const _pv = new THREE.Matrix4(), _fr = new THREE.Frustum(), _sp = new THREE.Sphere(new THREE.Vector3(), 1.6);
function render() {
  updateCamera();
  renderer.info.autoReset = false; renderer.info.reset();
  renderer.clear();
  if (scene) {
    camera.updateMatrixWorld(); _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pv);
    const far2 = camera.far * camera.far;
    for (const e of enemies) { _sp.center.set(e.pos.x, e.pos.y + 1, e.pos.z); const d2 = e.pos.distanceToSquared(camera.position), lod = qLevel === 0 ? 3025 : 4900; e.root.visible = (e.alive || e.deadT < 7) && d2 < far2 && (d2 < lod || e.revealT > 0 || e.state === 'combat') && _fr.intersectsSphere(_sp);
      if (e.root.visible) { if (e._hand === undefined) e._hand = e.root.getObjectByName('handR') || null; if (e._hand) e._hand.visible = d2 < 900; } }   // guns are a few pixels past 30 m
    if (preview) preview.root.visible = true;
    renderer.render(scene, camera);
  }
  if (running || paused) { renderer.clearDepth(); renderer.render(vm.scene, vm.camera); }
}

// ---------- HUD ----------
function buildAbilityHud() {
  $('abil').innerHTML = picks.map((p, i) => `<div class="slot pnl" id="ab${i}"><span class="k">${i ? 'F' : 'Q'}</span><span class="ic">${ABILITIES[p].icon}</span><span class="n">${ABILITIES[p].name.toUpperCase()}</span><div class="cd"></div></div>`).join('');
}
// DOM write cache: only touch the DOM when a value actually changed (no per-frame style/layout churn)
const sT = (el, v) => { if (el._t !== v) { el._t = v; el.textContent = v; } };
const sS = (el, p, v) => { const c = el._s || (el._s = {}); if (c[p] !== v) { c[p] = v; el.style[p] = v; } };
const sC = (el, cl, on) => { on = !!on; if (el._c !== on || el._cn !== cl) { el._c = on; el._cn = cl; el.classList.toggle(cl, on); } };
let HUD = null, _hudAb = null, _gapK = -1, _dmgKey = '';
function hudRefs() {
  const g = id => document.getElementById(id);
  return HUD = { obj: g('obj'), prog: g('prog'), timer: g('timer'), hp: g('hp'), hpf: g('hpb').firstElementChild, shb: g('shb'), shf: g('shb').firstElementChild, ammo: g('ammo'), rbar: g('rbar'), rbf: g('rbar').firstElementChild,
    cross: g('cross'), ci: [...g('cross').children], scope: g('scope'), hitm: g('hitm'), ringw: g('ringw'), ringp: g('ringp'), ringt: g('ringt'), ringl: g('ringl').firstElementChild,
    prompt: g('prompt'), promptt: g('promptt'), spot: g('spot'), whiteout: g('whiteout'), hurt: g('hurt'), laser: g('laser'), dmgdir: g('dmgdir'), mm: g('mm') };
}
function updateHud(prompt) {
  const w = cs(), s = st(), H = HUD || hudRefs();
  // objective + timer
  let title, prog, alive = 0, spotted = 0;
  for (const e of enemies) if (e.alive) { alive++; if (e.state === 'combat' && e.targetKind === 'player') spotted++; }
  if (mission.objective === 'plant_hold') { title = objective.planted ? 'HOLD THE AREA' : 'PLANT THE CHARGE'; prog = objective.planted ? `Charge ${Math.round(objective.holdProg / CFG.hold * 100)}%` : mission.id === 'm2' ? 'Red server · flooded vault' : 'Target marked on minimap'; }
  else if (objective.extract) { title = 'GET TO EXTRACTION'; prog = 'Green beacon · your start point'; }
  else { const n = map.points.length; let d = 0; for (const x of objective.done) if (x) d++; const v = mission.objective === 'retrieve' ? 'RETRIEVE DRIVES' : 'DEFUSE DEVICES'; title = n > 1 ? `${v} ${d}/${n}` : mission.objective === 'retrieve' ? 'RETRIEVE THE DRIVE' : 'DEFUSE THE DEVICE'; prog = `Hostiles left: ${alive}`; }
  if (intel.length) { let g = 0; for (const i of intel) if (i.got) g++; prog += ` · Intel ${g}/${intel.length}`; }
  if (mode === 'survival') { title = `SURVIVAL · WAVE ${wave}`; prog = `Hostiles left: ${alive} · Best: wave ${survBestV}`; }
  sT(H.obj, title); sT(H.prog, prog);
  sT(H.timer, fmt(mode === 'survival' ? elapsed : clock)); sC(H.timer, 'low', clock < 30);
  // vitals
  sT(H.hp, String(Math.ceil(player.hp))); sS(H.hpf, 'width', `${player.hp}%`);
  sS(H.hpf, 'background', player.hp < 35 ? '#ff3b47' : '#3ddc84');
  sS(H.shb, 'display', player.shield > 0 ? 'block' : 'none'); sS(H.shf, 'width', `${player.shield / 60 * 100}%`);
  // ammo
  const ak = W.reloadT > 0 ? 'R' : `${s.mag}/${s.reserve}`;
  if (H.ammo._k !== ak) { H.ammo._k = ak; H.ammo.innerHTML = W.reloadT > 0 ? 'RELOAD' : `${s.mag} <small>/ ${s.reserve}</small>`; }
  sC(H.ammo, 'low', s.mag <= Math.ceil(w.mag * 0.2));
  sS(H.rbar, 'display', W.reloadT > 0 ? 'block' : 'none'); if (W.reloadT > 0) sS(H.rbf, 'width', `${(1 - W.reloadT / w.reload) * 100}%`);
  // abilities
  if (!_hudAb || _hudAb.n !== picks.length || !_hudAb.cd[0]?.isConnected) _hudAb = { n: picks.length, cd: picks.map((p, i) => document.getElementById('ab' + i)?.querySelector('.cd')) };
  picks.forEach((p, i) => { const c = _hudAb.cd[i]; if (!c) return; const cdv = abilityCD[i]; const pv = `${cdv / ABILITIES[p].cd * 100}%`; if (c._p !== pv) { c._p = pv; c.style.setProperty('--p', pv); } sT(c, cdv > 0 ? String(Math.ceil(cdv)) : ''); });
  // crosshair: gap follows the real spread cone (tick sizes cached - reading offsetHeight forces layout)
  const gk = Math.round((5 + currentSpread() / (camera.fov * Math.PI / 180) * innerHeight) * 4) / 4;
  if (gk !== _gapK) {
    const ci = H.ci; if (!H.ch || !H.ch[0]) H.ch = [ci[0].offsetHeight, 0, ci[2].offsetWidth, 0];
    if (H.ch[0]) { _gapK = gk; ci[0].style.top = `${-gk - H.ch[0]}px`; ci[1].style.top = `${gk}px`; ci[2].style.left = `${-gk - H.ch[2]}px`; ci[3].style.left = `${gk}px`; }
  }
  const scoped = !!w.scope && W.ads > 0.9;
  sS(H.cross, 'display', scoped ? 'none' : ''); sC(H.scope, 'on', scoped);
  sS(H.hitm, 'opacity', hitmT > 0 ? String(Math.min(1, hitmT * 5)) : '0');
  // interaction ring
  let ringK = -1, ringL = '';
  if (objective.active >= 0) { ringK = mission.objective === 'plant_hold' ? objective.plantProg / CFG.plant : objective.prog[objective.active] / (mission.objective === 'retrieve' ? CFG.retrieve : CFG.defuse); ringL = mission.objective === 'plant_hold' ? 'PLANTING' : mission.objective === 'retrieve' ? 'RETRIEVING' : 'DEFUSING'; }
  else if (breachRing >= 0) { ringK = breachRing; ringL = 'BREACHING'; }
  sC(H.ringw, 'on', ringK >= 0);
  if (ringK >= 0) { const rk = clamp(ringK, 0, 1), off = 251.3 * (1 - rk); if (H.ringp._o !== off) { H.ringp._o = off; H.ringp.setAttribute('stroke-dashoffset', off); } sT(H.ringt, `${Math.round(rk * 100)}%`); sT(H.ringl, ringL); }
  sC(H.prompt, 'on', !!prompt && ringK < 0); sT(H.promptt, touch ? prompt.replace('HOLD E · ', 'HOLD ') : prompt);
  if (touch) touch.setUse(/HOLD E/.test(prompt) || ringK >= 0 ? (/BREACH/.test(prompt) || ringL === 'BREACHING' ? 'BREACH' : mission.objective === 'plant_hold' ? 'PLANT' : mission.objective === 'retrieve' ? 'GRAB' : 'DEFUSE') : null);
  sC(H.spot, 'on', spotted > 0); sT(H.spot, `SPOTTED BY ${spotted}`);
  // overlays
  sS(H.whiteout, 'opacity', clamp(flashK * 1.4, 0, 1).toFixed(3)); sS(H.hurt, 'opacity', hurtK.toFixed(3)); sS(H.laser, 'opacity', laserK.toFixed(3));
  if (dmgDirs.length || _dmgKey) { const html = dmgDirs.map(d => `<i style="transform:rotate(${(-(d.ang - player.yaw - Math.PI)) * 180 / Math.PI}deg);opacity:${Math.min(1, d.t)}"></i>`).join(''); _dmgKey = html && 'x'; H.dmgdir.innerHTML = html; }
  drawMinimap();
}
function hitMarker(kill, head) { hitmT = kill ? 0.45 : 0.2; $('hitm').className = `ov${kill ? ' kill' : head ? ' head' : ''}`; }
function feed(msg, hs) { const d = document.createElement('div'); d.className = `pnl${hs ? ' hs' : ''}`; d.innerHTML = `<span></span>`; d.firstChild.textContent = msg; $('feed').prepend(d); setTimeout(() => d.remove(), 4000); while ($('feed').children.length > 5) $('feed').lastChild.remove(); }
function radio(who, text, dur) { RADIO.say(who, text, dur); }
function radioOnce(key) { if (!mission.radio[key]) return; RADIO.once(mission.id + ':' + key, mission.radio[key]); }
function killTick() { if (matchOver) return; let n = 0; for (const e of enemies) if (e.alive) n++; if (n === 1) storyEv('last'); else if (n > 0 && n * 2 <= enemies.length && enemies.length > 4) storyEv('half'); }
function storyEv(key) { RADIO.event(mission.id, key); }

// ---------- minimap ----------
let mmBg = null; const MM = { scale: 3, ox: 0, oz: 0 };
function buildMinimap() {
  const b = map.bounds, pad = 10, w = (b.max.x - b.min.x + pad * 2) * MM.scale, h = (b.max.z - b.min.z + pad * 2) * MM.scale;
  MM.ox = b.min.x - pad; MM.oz = b.min.z - pad;
  mmBg = document.createElement('canvas'); mmBg.width = w; mmBg.height = h; const g = mmBg.getContext('2d');
  g.fillStyle = '#2a2f3a'; g.fillRect(0, 0, w, h);
  const sorted = [...world.solids].sort((a, c) => a.max.y - c.max.y);
  for (const s of sorted) {
    if (s.tag === 'invisible' || s.max.x - s.min.x > 200) continue;
    const y = s.max.y, l = clamp(30 + y * 4, 22, 80);
    g.fillStyle = y <= 0.05 ? '#3a4150' : `hsl(215,12%,${l}%)`;
    g.fillRect((s.min.x - MM.ox) * MM.scale, (s.min.z - MM.oz) * MM.scale, (s.max.x - s.min.x) * MM.scale, (s.max.z - s.min.z) * MM.scale);
  }
  g.strokeStyle = '#111'; g.lineWidth = 1;
  for (const m of map.kit.minimap) if (m.kind === 'building' || m.kind === 'roof') g.strokeRect((m.x0 - MM.ox) * MM.scale, (m.z0 - MM.oz) * MM.scale, (m.x1 - m.x0) * MM.scale, (m.z1 - m.z0) * MM.scale);
  $('mmlabel').textContent = mission.title.toUpperCase();
}
function drawMinimap() {
  const c = (HUD || hudRefs()).mm, g = c._g || (c._g = c.getContext('2d')), W2 = c.width, R = 40;            // shows ±R metres
  const k = W2 / (R * 2);
  g.save(); g.fillStyle = '#1a1d24'; g.fillRect(0, 0, W2, W2);
  g.translate(W2 / 2, W2 / 2); g.rotate(player.yaw); g.scale(k / MM.scale, k / MM.scale);
  g.translate(-(player.pos.x - MM.ox) * MM.scale, -(player.pos.z - MM.oz) * MM.scale);
  if (mmBg) g.drawImage(mmBg, 0, 0);
  const dot = (x, z, col, r) => { g.fillStyle = col; g.strokeStyle = '#111'; g.lineWidth = 2 * MM.scale / k; g.beginPath(); g.arc((x - MM.ox) * MM.scale, (z - MM.oz) * MM.scale, r * MM.scale / k, 0, 7); g.fill(); g.stroke(); };
  map.points.forEach((p, i) => { if (!objective.done[i]) dot(p.x, p.z, '#ffd23b', 6); });
  for (const b of breaches) if (!b.done) dot(b.pos.x, b.pos.z, '#ff9f1c', 3.5);
  for (const it of intel) if (!it.got && it.pos.distanceTo(player.pos) < 22) dot(it.pos.x, it.pos.z, '#b44bff', 3);
  for (const m of medkits) if (m.t <= 0) { const x = (m.pos.x - MM.ox) * MM.scale, y = (m.pos.z - MM.oz) * MM.scale, r = 4 * MM.scale / k; g.fillStyle = '#3ddc84'; g.strokeStyle = '#111'; g.lineWidth = 1.5 * MM.scale / k; g.beginPath(); g.rect(x - r, y - r / 3, r * 2, r * 2 / 3); g.rect(x - r / 3, y - r, r * 2 / 3, r * 2); g.fill(); g.stroke(); }
  if (objective.extract) dot(map.extract.x, map.extract.z, '#3ddc84', 7);
  if (GUIDE.path) { g.strokeStyle = '#ffd23b'; g.lineWidth = 2.5 * MM.scale / k; g.beginPath(); GUIDE.path.forEach((p, i) => { const x = (p.x - MM.ox) * MM.scale, y = (p.z - MM.oz) * MM.scale; if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); }   // route to the objective
  for (const e of enemies) if (e.alive) { const hot = e.revealT > 0 || (e.state === 'combat' && e.targetKind === 'player'); dot(e.pos.x, e.pos.z, hot ? '#ff3b47' : '#c0303a', hot ? 4.5 : 3.5); }   // every hostile shows; spotted/revealed ones brighter
  for (const z of zones.smoke) dot(z.pos.x, z.pos.z, 'rgba(200,205,212,.7)', z.radius * k / MM.scale * MM.scale);
  g.restore();
  g.fillStyle = '#5fe6ff'; g.strokeStyle = '#111'; g.lineWidth = 2; g.beginPath(); g.moveTo(W2 / 2, W2 / 2 - 9); g.lineTo(W2 / 2 + 6, W2 / 2 + 6); g.lineTo(W2 / 2 - 6, W2 / 2 + 6); g.closePath(); g.fill(); g.stroke();
}

// ---------- flow ----------
function startMission(idx = selected, opts = {}) {
  if (idx > progress && !DEBUG) return;
  if (!crazy.active) { startMissionNow(idx, opts); return; }
  if (startMission.busy) return; startMission.busy = true;                       // midgame ad between missions (rate-limited in crazy.js)
  track('ad', { k: 'midgame' }); crazy.midgame().then(() => { startMission.busy = false; startMissionNow(idx, opts); });
}
function startMissionNow(idx, opts) {
  if (opts.part === undefined && !opts.mode && !TEST) opts = { ...opts, part: partOf(idx) };   // resume at the saved part
  const o = { route: opts.route ?? selRoute, primary: opts.primary ?? loadout.primary, sidearm: opts.sidearm ?? loadout.sidearm, abilities: opts.abilities ?? selAbilities.slice(), part: opts.part };
  if (preview) { preview.root.parent?.remove(preview.root); preview = null; }
  mode = opts.mode || null; lastStart = { idx, opts: { ...opts, tutorial: false } }; clearInterval(autoNextT);
  buildMission(idx, o); xpDoubled = false;
  if (mode === 'survival') survivalSetup();
  LS = { dmg: 0, ab: 0, pz: 0, mv: -1, sh: -1, ct: -1, by: '' };
  startMissionNow.n = (startMissionNow.n || 0) + 1; track('start', { m: mission.id, p: route.part, mode: mode || '', n: startMissionNow.n }); at(`${mission.id}:${route.part}`);
  for (const id of ['brief', 'quick', 'end', 'pause', 'lobby', 'shop', 'pass', 'profile']) $(id).classList.remove('show');
  $('hud').classList.add('on'); running = true; paused = false;
  dropMentor(); if (idx === 0 && mode !== 'survival' && (opts.tutorial || (!TEST && !tutorialDone()))) startTutorial(!!opts.tutorial); else { tutorial?.abort(); tutorial = null; }
  if (!tutorial) crazy.armAds();
  firstContactT = mode || tutorial || TEST ? -1 : RC.contactAfter;
  if (!TEST && !mode) invT = Math.max(invT, RC.startGrace);                          // a few safe seconds to get bearings                // no contact yet? a squad comes looking for you                                          // mission 2: force a first fight within ~15 s
  if (mode !== 'survival') radioOnce('start'); music.start(); FX.announce(mode === 'survival' ? 'WAVE 1' : mode === 'daily' ? 'DAILY CHALLENGE' : 'MISSION START', 'start');
  if (touch) { touch.show(true); touch.setAbilities(picks.map(p => ABILITIES[p].icon + ' ' + ABILITIES[p].name.toUpperCase().slice(0, 5))); document.documentElement.requestFullscreen?.().catch(() => {}); }
  else if (!TEST) lockMouse();
  crazy.gameplay(true);
}
function endMatch() { tutorial?.abort(); music.setIntensity(0.1); touch?.show(false); running = false; matchOver = true; mouse.l = mouse.r = false; keys = {}; document.exitPointerLock?.(); crazy.gameplay(false); }
function lose(reason) {
  if (matchOver) return; endMatch();
  track('fail', { m: mission.id, p: route.part, mode: mode || '', why: player.alive ? 'timer' : 'dead', t: Math.round(elapsed), w: wave, n: fails[missionIdx] || 0, ...lvlStats() }); at('fail:' + mission.id);
  if (mode === 'survival') { const rec = MODES.survRecord(wave); survBestV = MODES.survBest(); showEnd('SURVIVAL OVER', `You reached wave ${wave}.` + (rec ? '\n\nNEW BEST!' : `\n\nBest: wave ${survBestV}.`), null, { death: true, failed: true }); return; }
  fails[missionIdx] = (fails[missionIdx] || 0) + 1;
  showEnd('MISSION FAILED', reason + (fails[missionIdx] >= RC.easyAfterFails ? `\n\nNext try is easier: fewer hostiles and +${RC.easyExtraTime} s.` : ''), null, { death: !player.alive, failed: true });
}
const partOf = idx => store.get('sz_parts', {})[MISSIONS[idx].id] || 0;
function lvlStats() {
  let alive = 0; for (const e of enemies) if (e.alive) alive++;
  return { sh: stats.shots, acc: stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0, k: stats.kills, hs: stats.heads, left: alive, of: enemies.length, dmg: Math.round(LS.dmg),
    ab: LS.ab, pz: LS.pz, mv1: LS.mv, sh1: LS.sh, ct1: LS.ct, by: LS.by, easy: !!route?.easy, tl: Math.round(clock < 1e8 ? clock : 0), fps: Math.round(fps), q: qLevel };
}
onQuit(() => running || paused ? { lv: mission?.id, p: route?.part, el: Math.round(elapsed), hp: Math.round(player.hp), step: tutorial?.active ? tutorial.step : '', ...lvlStats() } : {});
function win() {
  if (matchOver) return; endMatch();
  track(route.parts > 1 && route.part < route.parts - 1 ? 'part' : 'win', { m: mission.id, p: route.part, mode: mode || '', t: Math.round(elapsed), ...lvlStats() }); at('end:' + mission.id);
  if (route.parts > 1 && route.part < route.parts - 1) {                       // a part of a longer mission: bank it, go straight to the next part
    const pp = store.get('sz_parts', {}); pp[mission.id] = route.part + 1; store.set('sz_parts', pp);
    fails[missionIdx] = 0; matchXP.win = Math.round(META.XP.win / 2);
    META.profile.coins += RC.partCoins; META.profile.upPoints++; META.saveProfile(); crazy.happy();
    showEnd(`PART ${route.part + 1}/${route.parts} CLEARED`, `+${RC.partCoins} ◎ · +1 upgrade point\n\n[ NEXT: part ${route.part + 2} of "${mission.title}" ]`, missionIdx);
    return;
  }
  { const pp = store.get('sz_parts', {}); if (pp[mission.id]) { delete pp[mission.id]; store.set('sz_parts', pp); } }
  if (!mode) META.profile.coins += RC.winCoins;
  matchXP.win = META.XP.win;
  const before = META.unlocked(progress);
  fails[missionIdx] = 0;
  if (missionIdx + 1 > progress) { progress = missionIdx + 1; store.set('sz_progress', progress); matchXP.first = META.XP.firstClear; }
  META.profile.totals.wins++; META.profile.upPoints++; META.saveProfile();
  const after = META.unlocked(progress), fresh = [...after.weapons].filter(w => !before.weapons.has(w)).map(w => WEAPONS[w].name).concat([...after.operatives].filter(o => !before.operatives.has(o)).map(o => OPERATIVES[o]));
  if (fresh.length) mission = Object.assign({}, mission, { win: { ...mission.win, text: mission.win.text + `\n\nUNLOCKED: ${fresh.join(', ').toUpperCase()}` } });
  const next = MISSIONS[missionIdx + 1];
  crazy.happy();
  let daily = '';
  if (mode === 'daily') { const c = MODES.claimDaily(); if (c) { matchXP.daily = c.bonus; daily = `\n\nDAILY CHALLENGE DONE · STREAK ${c.streak} DAY${c.streak > 1 ? 'S' : ''} · +${c.bonus} XP\nCome back tomorrow for a bigger bonus.`; } }
  showEnd(mission.win.title, mission.win.text + daily + (next ? `\n\n[ NEXT: "${next.title}" ]` : ''), next ? missionIdx + 1 : null);
}
function matchTotal() { return Object.entries(matchXP).reduce((a, [k, v]) => k === 'applied' ? a : a + v, 0); }
function awardXP() {
  const total = matchTotal(), add = total - (matchXP.applied || 0); matchXP.applied = total;
  META.profile.totals.kills += stats.kills - (matchXP.k0 || 0); META.profile.totals.heads += stats.heads - (matchXP.h0 || 0); matchXP.k0 = stats.kills; matchXP.h0 = stats.heads;
  const paid = META.addXP(add); if (paid.length) sfx.coin(); return { add, paid };
}
function xpLine(add, paid) {
  return `+${add} XP · LEVEL ${META.level()} (${Math.round(META.levelProgress() * 100)}%)` + (paid.length ? ` · PASS TIER ${paid[paid.length - 1].tier}: +${paid.reduce((a, p) => a + p.coins, 0)} ◎` : '');
}
// after a win: spend the upgrade point on either weapon you carried, +damage or +ammo
function upgradeUI() {
  const box = $('upBox'); box.style.display = META.profile.upPoints > 0 ? '' : 'none'; if (META.profile.upPoints <= 0) return;
  const id = upgradeUI.sel && W.slots.includes(upgradeUI.sel) ? upgradeUI.sel : W.slots[0]; upgradeUI.sel = id;
  const u = META.upg(id), w = WEAPONS[id];
  $('upTitle').innerHTML = `WEAPON UPGRADE · ${META.profile.upPoints} POINT${META.profile.upPoints > 1 ? 'S' : ''} · ` + W.slots.map(x => `<button class="upw${x === id ? ' on' : ''}" data-id="${x}">${WEAPONS[x].name.toUpperCase()}</button>`).join('');
  $('upTitle').querySelectorAll('.upw').forEach(b => b.onclick = () => { upgradeUI.sel = b.dataset.id; upgradeUI(); });
  $('upDmg').textContent = u.dmg >= META.UP_MAX ? 'DAMAGE MAXED' : `+ DAMAGE  ${Math.round(w.dmg * META.dmgMult(id))} → ${Math.round(w.dmg * (1 + (u.dmg + 1) * META.UP_DMG))}  (${u.dmg}/${META.UP_MAX})`;
  $('upAmmo').textContent = u.ammo >= META.UP_MAX ? 'AMMO MAXED' : `+ AMMO  ${META.reserveFor(id, w.reserve)} → ${Math.round(w.reserve * (1 + (u.ammo + 1) * META.UP_AMMO))} RESERVE  (${u.ammo}/${META.UP_MAX})`;
  $('upDmg').disabled = u.dmg >= META.UP_MAX; $('upAmmo').disabled = u.ammo >= META.UP_MAX;
  $('upDmg').onclick = () => { if (META.upgrade(id, 'dmg')) { sfx.coin(); upgradeUI(); } };
  $('upAmmo').onclick = () => { if (META.upgrade(id, 'ammo')) { sfx.coin(); upgradeUI(); } };
}
function rewardedAd(onDone) { track('ad', { k: 'rewarded' }); crazy.rewarded(() => { track('ad', { k: 'rewarded_ok' }); onDone(); }); }
function audioMute(on) { try { const c = window.__audioCtx; if (c) on ? c.suspend() : c.resume(); } catch (e) { /* none */ } }
function revive() {
  revived = true; $('end').classList.remove('show'); $('hud').classList.add('on');
  player.hp = 100; player.alive = true; invT = 3; hurtK = 0; matchOver = false; running = true; paused = false;
  for (const e of enemies) if (e.alive && e.pos.distanceTo(player.pos) < 6) e.alert(player.pos, 0.3);
  if (touch) touch.show(true); else if (!TEST) lockMouse();
  radio('VOSS', 'Not done yet.', 2); crazy.gameplay(true);
}
function showEnd(title, text, nextIdx, { death = false, failed = false } = {}) {
  $('hud').classList.remove('on');
  const { add, paid } = awardXP();
  $('endXP').textContent = xpLine(add, paid);
  $('adXP').style.display = add > 0 && !xpDoubled ? '' : 'none';
  $('adXP').onclick = () => rewardedAd(() => { xpDoubled = true; const p2 = META.addXP(add); if (p2.length) sfx.coin(); $('endXP').textContent = xpLine(add * 2, paid.concat(p2)) + ' · DOUBLED'; $('adXP').style.display = 'none'; });
  $('adRevive').style.display = death && !revived ? '' : 'none';
  upgradeUI();
  $('adRevive').onclick = () => rewardedAd(revive);
  {                                                                             // every end screen: a reason to come back tomorrow
    const ds = MODES.dailyState();
    text += ds.done ? `\n\n📅 Come back tomorrow: day ${ds.streak + 1} of your streak pays +${MODES.dailyBonus(ds.streak + 1)} XP.`
                    : `\n\n📅 Today's daily challenge is waiting in the lobby: +${MODES.dailyBonus(ds.next)} XP.`;
    text += `\n🎁 Log in tomorrow for +${MODES.loginTomorrow()} ◎.`;
  }
  $('endTitle').textContent = title; $('endText').textContent = text;
  $('endStats').textContent = `Time ${fmt(elapsed)} · Kills ${stats.kills} · Accuracy ${stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0}% · Headshots ${stats.heads}`;
  RADIO.debrief($('debrief'), mission.id, !title.startsWith('MISSION FAILED'));
  $('next').style.display = nextIdx !== null ? '' : 'none';
  $('trySurv').style.display = failed && !mode && (fails[missionIdx] || 0) >= 2 && progress >= 1 ? '' : 'none';
  $('again').textContent = failed ? '↻ RETRY' : 'REPLAY'; $('again').className = failed ? 'go' : '';
  clearInterval(autoNextT);
  if (nextIdx !== null && !TEST) {                                              // win: next mission starts by itself unless the player touches anything
    let n = RC.autoNextSeconds + 1; const tick = () => { if (--n <= 0) { clearInterval(autoNextT); $('next').click(); } else $('next').textContent = `NEXT MISSION (${n})`; };
    tick(); autoNextT = setInterval(tick, 1000);
    $('end').addEventListener('pointerdown', e => { if (e.target.id !== 'next') { clearInterval(autoNextT); $('next').textContent = 'NEXT MISSION'; } }, { once: true });
  } else $('next').textContent = 'NEXT MISSION';
  $('next').onclick = () => { unlockAudio(); selected = nextIdx; const nm = MISSIONS[nextIdx]; const route = !nm.routes ? 'default' : nm.routes[selRoute] ? selRoute : 'stealth'; startMission(nextIdx, { route, abilities: [] }); };   // straight in with the current kit; LOBBY to change it
  $('end').classList.add('show');
}
function pause() { if (!running || TEST || touch) return; doPause(); }
function doPause() { if (!running) return; LS.pz++; touch?.show(false); running = false; paused = true; mouse.l = false; $('pause').classList.add('show'); crazy.gameplay(false); }

// ---------- briefing ----------
let selected = Math.min(progress, MISSIONS.length - 1), selRoute = 'stealth', selAbilities = [];
function statRow(label, v) { return `<span>${label}</span><b style="width:${clamp(v, 4, 100)}%"></b>`; }
function showStats(id) {
  const w = WEAPONS[id];
  $('wstats').innerHTML = `<span style="grid-column:1/3">${w.name.toUpperCase()} · ${w.cls.toUpperCase()}${w.auto ? ' · AUTO' : ''}</span>` +
    statRow(`DAMAGE${META.upg(id).dmg ? ' +' + META.upg(id).dmg : ''}`, w.dmg * META.dmgMult(id) / 1.5) + statRow('FIRE RATE', w.rpm / 9) + statRow('MAGAZINE', w.mag) + statRow('ACCURACY', 100 - w.spread * 1500) + statRow('RANGE', w.range / 3);
}
function weaponButtons(el, list, key) {
  el.innerHTML = '';
  for (const id of list) {
    const b = document.createElement('button'); b.className = `wcard${loadout[key] === id ? ' on' : ''}`; b.dataset.id = id;
    const lock = !META.unlocked(progress).weapons.has(id);
    b.innerHTML = `<img src="${A.icons[id]}" alt=""><span>${lock ? '🔒 M' + META.unlockSource('weapons', id) : WEAPONS[id].name.toUpperCase()}</span>`;
    if (lock && !DEBUG) { b.disabled = true; b.title = `Unlocks after mission ${META.unlockSource('weapons', id)}`; }
    b.onclick = () => { loadout[key] = id; store.set('sz_loadout', loadout); weaponButtons(el, list, key); showStats(id); if (key === 'primary') setPreview(); };
    b.onmouseenter = () => showStats(id);
    el.append(b);
  }
}
function selectMission(i) {
  selected = i; const m = MISSIONS[i];
  document.querySelectorAll('#missions button').forEach((b, j) => b.classList.toggle('on', j === i));
  if (m.proc) $('brief-text').dataset.extra = '1';
  $('brief-text').textContent = m.brief;
  $('routeBox').style.display = m.routes ? '' : 'none'; $('routes').innerHTML = '';
  if (m.routes) for (const [id, r] of Object.entries(m.routes)) {
    const b = document.createElement('button'); b.textContent = r.name.toUpperCase(); b.dataset.id = id; b.classList.toggle('on', id === selRoute);
    b.onclick = () => { selRoute = id; document.querySelectorAll('#routes button').forEach(x => x.classList.toggle('on', x === b)); };
    $('routes').append(b);
  }
  if (!m.routes) selRoute = 'default'; else if (!m.routes[selRoute]) selRoute = 'stealth';
  document.dispatchEvent(new CustomEvent('sz:brief', { detail: { index: i, mission: m } }));
  mission = m; selAbilities = chosenAbilities().slice();
  $('abilities').innerHTML = '';
  for (const id of m.pool) {
    const b = document.createElement('button'); b.dataset.id = id; b.textContent = `${ABILITIES[id].icon} ${ABILITIES[id].name.toUpperCase()}`;
    b.onclick = () => { const k = selAbilities.indexOf(id); if (k >= 0) selAbilities.splice(k, 1); else { if (selAbilities.length >= 2) selAbilities.shift(); selAbilities.push(id); } loadout.abilities[m.id] = selAbilities.slice(); store.set('sz_loadout', loadout); refreshAb(); preview?.perform('ab_' + id); };
    $('abilities').append(b);
  }
  refreshAb();
  $('start').disabled = i > progress && !DEBUG;
}
function refreshAb() { document.querySelectorAll('#abilities button').forEach(b => b.classList.toggle('on', selAbilities.includes(b.dataset.id))); $('start').disabled = selAbilities.length !== 2 || (selected > progress && !DEBUG); }
function openBriefing(step = 'mode') {
  $('missions').innerHTML = '';
  MISSIONS.forEach((m, i) => {
    if (i === 0 || i === 3 || i === 6 || i === 9) $('missions').insertAdjacentHTML('beforeend', `<div data-ch="${i / 3}" style="width:100%;font-size:calc(var(--u)*.9);margin-top:4px">CHAPTER ${i / 3 + 1}</div>`);
    const b = document.createElement('button'); b.dataset.ch = Math.floor(i / 3); b.textContent = `${i + 1}. ${m.title.toUpperCase()}${i < progress ? ' ✓' : i > progress ? ' 🔒' : ''}`;
    b.disabled = i > progress && !DEBUG; b.onclick = () => selectMission(i); $('missions').append(b);
  });
  weaponButtons($('primaries'), PRIMARIES, 'primary'); weaponButtons($('sidearms'), SIDEARMS, 'sidearm'); showStats(loadout.primary);
  selectMission(Math.min(selected ?? progress, MISSIONS.length - 1));
  buildChapters(); showChapter(Math.floor(selected / 3));
  for (const id of ['end', 'pause', 'loading', 'lobby', 'quick', 'shop', 'pass', 'profile']) $(id).classList.remove('show');
  $('hud').classList.remove('on'); $('brief').classList.add('show');
  operativeButtons(); setPreview();
  flow.open(step);
}
let chapter = 0;
function showChapter(c) { chapter = c; document.querySelectorAll('#missions [data-ch]').forEach(el => el.classList.toggle('hid', +el.dataset.ch !== c)); document.querySelectorAll('#chapters button').forEach((b, j) => b.classList.toggle('on', j === c)); }
function buildChapters() {
  $('chapters').innerHTML = '';
  for (let c = 0; c < MISSIONS.length / 3; c++) {
    const b = document.createElement('button'), open = c * 3 <= progress || DEBUG;
    b.innerHTML = `CHAPTER ${c + 1}<small>${open ? 'MISSIONS ' + (c * 3 + 1) + '–' + (c * 3 + 3) : '🔒 LOCKED'}</small>`; b.disabled = !open;
    b.onclick = () => { showChapter(c); if (Math.floor(selected / 3) !== c) selectMission(Math.min(c * 3, progress)); flow.next(); };
    $('chapters').append(b);
  }
}
const flow = createFlow({ $, skip: id => id === 'agent' && [...META.unlocked(progress).operatives].length < 2 && !DEBUG, onExit: () => openLobby() });

// ---------- input ----------
const isMenu = () => !running;
document.addEventListener('keydown', e => {
  keys[e.code] = true; unlockAudio();
  if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
  if (isMenu()) return;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'Digit1') equip(0); if (e.code === 'Digit2') equip(1);
  if (e.code === 'KeyQ') useAbility(0); if (e.code === 'KeyF') useAbility(1);
  if (e.code === 'Enter') RADIO.skip();
  if (e.code === 'KeyT') doSpray();
  if (DEBUG) {
    if (e.code === 'F9') for (const en of enemies) if (en.alive) en.damage(9999);
    if (e.code === 'F8') { const i = Math.max(0, objective.done.findIndex(d => !d)); const p = map.points[i]; player.pos.set(p.x + 1.2, p.y, p.z); player.vel.set(0, 0, 0); }
    if (e.code === 'F7') clock = 0.5;
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('mousedown', e => { unlockAudio(); if (!running) return; if (!document.pointerLockElement && !TEST) { lockMouse(); return; } if (e.button === 0) mouse.l = true; if (e.button === 2) mouse.r = true; });
document.addEventListener('mouseup', e => { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
document.addEventListener('contextmenu', e => e.preventDefault());
let wheelT = 0, wheelAcc = 0;                                                    // one weapon per notch, either direction, wrapping round
document.addEventListener('wheel', e => {
  if (!running) return;
  const now = performance.now(); if (now - wheelT > 250) wheelAcc = 0;
  wheelAcc += e.deltaY; if (Math.abs(wheelAcc) < 40 || now - wheelT < 120) return;        // trackpads send many small deltas
  wheelT = now; const dir = wheelAcc > 0 ? 1 : -1; wheelAcc = 0;
  const n = W.slots.filter(Boolean).length; if (n < 2) return;
  equip((W.cur + dir + n) % n);
}, { passive: true });
document.addEventListener('mousemove', e => {
  if (!document.pointerLockElement || !running) return;
  lookBy(e.movementX, e.movementY, CFG.sens * settings.sens * aimSlow * (camera.fov / 75));
});
// Pointer lock needs a user gesture: after an auto-start (next part / mission) the request is refused, so show a
// "click to continue" card instead of a dead mouse; the click itself grabs the mouse.
function lockMouse() { try { const r = canvas.requestPointerLock?.(); r?.catch?.(() => setTimeout(lockHint, 50)); } catch (e) { /* refused */ } setTimeout(lockHint, 250); }
function lockHint() {                                                           // lock refused while playing: freeze + ask for a click
  if (!running || touch || TEST || document.pointerLockElement || matchOver) return;
  running = false; paused = true; mouse.l = false; $('clickGo').classList.add('show'); crazy.gameplay(false);
}
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) pause(); });
document.addEventListener('pointerlockerror', () => setTimeout(lockHint, 50));
$('clickGo').addEventListener('mousedown', e => { e.preventDefault(); $('clickGo').classList.remove('show'); unlockAudio(); paused = false; running = true; last = performance.now(); crazy.gameplay(true); lockMouse(); });
$('start').onclick = () => { unlockAudio(); document.dispatchEvent(new CustomEvent('sz:deploy', { detail: { index: selected } })); startMission(selected); };
$('resume').onclick = () => { $('pause').classList.remove('show'); paused = false; running = true; if (touch) touch.show(true); else lockMouse(); crazy.gameplay(true); };
$('trySurv').onclick = () => { unlockAudio(); clearInterval(autoNextT); const i = (Math.random() * Math.min(progress, MISSIONS.length)) | 0; startMission(i, { route: MISSIONS[i].routes ? 'assault' : 'default', abilities: [], mode: 'survival' }); };
$('again').onclick = () => { unlockAudio(); clearInterval(autoNextT); startMission(lastStart.idx, lastStart.opts); };
$('menuBtn').onclick = openLobby; $('pauseMenu').onclick = () => { paused = false; openLobby(); };

// ---------- settings ----------
document.body.insertAdjacentHTML('beforeend', `<div id="settings" class="panel"><div class="card" style="min-width:min(420px,90vw)"><h2>SETTINGS</h2><div id="setRows"></div><button id="setClose" class="go">DONE</button></div></div>`);
function settingsUI() {
  const rows = [
    ['sens', 'MOUSE SENSITIVITY', 'range', 0.3, 3, 0.05], ['touchSens', 'TOUCH SENSITIVITY', 'range', 0.3, 3, 0.05],
    ['btnSize', 'BUTTON SIZE', 'range', 0.7, 1.5, 0.05], ['btnOpacity', 'BUTTON OPACITY', 'range', 0.3, 1, 0.05],
    ['fireMode', 'TOUCH FIRING', 'select', ['button', 'auto']], ['aimAssist', 'AIM ASSIST', 'check'], ['quality', 'QUALITY', 'select', ['auto', 'low', 'high']],
  ];
  $('setRows').innerHTML = rows.map(([k, label, type, a, b, st]) => `<p style="display:flex;justify-content:space-between;align-items:center;gap:12px"><span>${label}</span>${
    type === 'range' ? `<input type="range" data-k="${k}" min="${a}" max="${b}" step="${st}" value="${settings[k]}">` :
    type === 'check' ? `<input type="checkbox" data-k="${k}" ${settings[k] ? 'checked' : ''}>` :
    `<select data-k="${k}">${a.map(o => `<option ${settings[k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`}</p>`).join('');
  $('setRows').querySelectorAll('[data-k]').forEach(el => el.oninput = () => {
    const k = el.dataset.k; settings[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
    if (k === 'quality') settings.qUser = 1; if (k === 'fireMode') settings.fUser = 1;
    store.set('sz_settings', settings); touch?.applySettings(); if (k === 'quality') { qLevel = settings.quality === 'high' ? 2 : 1; applyQuality(); }
  });
  $('setRows').insertAdjacentHTML('beforeend', '<p style="display:flex;justify-content:space-between;align-items:center;gap:12px"><span>INTERFACE TOUR</span><button id="setTour" type="button">REPLAY</button></p>');
  $('setTour').onclick = () => { $('settings').classList.remove('show'); startOnboarding(true); };
  $('settings').classList.add('show');
}
// ---------- first-time interface tour (coach marks) -> mission 1 guided tutorial ----------
let onboard = null;
function startOnboarding(force) {
  if (onboard?.active) return true;
  onboard = createOnboarding({
    open(panel) {
      if (panel !== 'settings') $('settings').classList.remove('show');
      if (panel === 'lobby') openLobby(); else if (panel === 'shop') openShop(); else if (panel === 'pass') openPass();
      else if (panel === 'profile') openProfile(); else if (panel === 'settings') { openLobby(); settingsUI(); }
      else if (!$('brief').classList.contains('show') || flow.cur() !== panel) openBriefing(panel);
    },
    onFinish(played) { $('settings').classList.remove('show'); if (played) { unlockAudio(); selected = 0; startMission(0); } else openLobby(); },
  });
  return onboard.start({ force });
}
{ const b = document.createElement('button'); b.textContent = '⚙ SETTINGS'; b.onclick = settingsUI; $('pause').querySelector('.card').append(b); }
$('setClose').onclick = () => $('settings').classList.remove('show');

// ---------- briefing preview: the chosen operative, armed, idling; ability picks play their clip + effect ----------
let preview = null;
async function setPreview() {
  const id = loadout.operative, gltf = await loadOperative(id);
  A.rhea = gltf;
  if (preview) { preview.root.parent?.remove(preview.root); preview.mixer.stopAllAction(); }
  if (running || !scene) return;
  const root = SkeletonUtils.clone(gltf.scene); toonify(root, { rim: 0x8fd8ff }); outline(root, { thick: 0.02 });
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  const wid = loadout.primary, pist = SIDEARMS.includes(wid);
  const key = `${id}:${pist ? 'p' : 'r'}`; A.gunCal ??= {}; A.gunCal[key] ??= calibrateGun(gltf, pist ? 'shoot_pistol' : 'shoot');
  const gun = A.weapons[wid].clone(true); gun.matrixAutoUpdate = false; gun.matrix.copy(A.gunCal[key]); toonify(gun); outline(gun, { thick: 0.012 });
  root.getObjectByName('handR').add(gun);
  const pc = META.charmMesh(META.profile.charm); if (pc) { const bx = new THREE.Box3().setFromObject(A.weapons[wid]); pc.scale.setScalar(1.6); pc.position.set(bx.max.x + 0.01, (bx.min.y + bx.max.y) / 2, bx.min.z + (bx.max.z - bx.min.z) * 0.3); gun.add(pc); }
  const fwd = V(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const at = player.pos.clone().addScaledVector(fwd, 3.4).addScaledVector(V(-fwd.z, 0, fwd.x), -1.55 * Math.min(1.4, camera.aspect / 1.4));
  const g = world.groundHeight(at.x, at.z, 0.3, at.y + 1, 2); at.y = Number.isFinite(g) ? g : player.pos.y;
  root.position.copy(at); root.rotation.y = Math.atan2(-fwd.x, -fwd.z) + 0.35;
  scene.add(root);
  const mixer = new THREE.AnimationMixer(root), clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
  const base = pist ? 'idle_pistol' : 'idle_rifle';
  let cur = mixer.clipAction(clips[base]); cur.play(); mixer.update(0);
  let pending = null;
  const pfx = new AbilityFX(scene, { ground: () => at.y });
  preview = {
    root, mixer, gun,
    perform(name) {
      const c = clips[name]; if (!c) return;
      const a = mixer.clipAction(c); a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
      cur.crossFadeTo(a, 0.15, false); a.play(); cur = a; gun.visible = false;
      pending = RELEASE_AT[name] !== undefined ? { name, t: RELEASE_AT[name], a } : null;
    },
    update(dt) {
      mixer.update(dt); pfx.update(dt);
      if (pending && pending.a.time >= pending.t) {
        const kind = pending.name.slice(3); pending = null; root.updateMatrixWorld(true);
        const hand = V().setFromMatrixPosition(root.getObjectByName('handR').matrixWorld), f = V(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
        pfx.spawn(kind, { hand, forward: f, root, template: root, clips: gltf.animations, move: false });
      }
      if (cur.getClip().name !== base && !cur.isRunning()) { const b = mixer.clipAction(clips[base]); b.reset().play(); cur.crossFadeTo(b, 0.2, false); cur = b; gun.visible = true; }
    },
  };
  window.__game.preview = preview;
}
function operativeButtons() {
  $('operatives').innerHTML = '';
  for (const [id, name] of Object.entries(OPERATIVES)) {
    const b = document.createElement('button'); b.textContent = name.toUpperCase(); b.classList.toggle('on', loadout.operative === id);
    if (!META.unlocked(progress).operatives.has(id)) { b.textContent = `🔒 ${name.toUpperCase()} · M${META.unlockSource('operatives', id)}`; if (!DEBUG) b.disabled = true; }
    b.onclick = () => { loadout.operative = id; store.set('sz_loadout', loadout); operativeButtons(); setPreview(); };
    $('operatives').append(b);
  }
}

// ---------- lobby / shop / pass / profile ----------
const PANELS = ['lobby', 'quick', 'brief', 'shop', 'pass', 'profile', 'tutPick', 'guide', 'end', 'pause', 'loading'];
function only(id) { for (const p of PANELS) $(p).classList.toggle('show', p === id); $('hud').classList.remove('on'); }
function chips() {
  $('lvl').firstChild.textContent = `LV ${META.level()} `; $('lvlbar').firstElementChild.style.width = `${META.levelProgress() * 100}%`;
  $('coins').textContent = `◎ ${META.profile.coins}`; $('shopCoins').textContent = `◎ ${META.profile.coins}`;
  $('lobbyOp').textContent = `${OPERATIVES[loadout.operative].toUpperCase()} · ${WEAPONS[loadout.primary].name.toUpperCase()} · ${META.CHARMS[META.profile.charm].name.toUpperCase()} CHARM`;
}
// PLAY: one screen, one tap. Next mission with the saved kit; loadout / mission pickers are optional.
function openQuick() {
  selected = Math.min(progress, MISSIONS.length - 1); const m = MISSIONS[selected];
  only('quick'); setPreview(); at('deploy');
  { const pt = partOf(selected); $('qChapter').textContent = `CHAPTER ${Math.floor(selected / 3) + 1} · MISSION ${selected + 1}` + (pt ? ` · PART ${pt + 1}` : ''); }
  $('qTitle').textContent = m.title.toUpperCase(); $('qBrief').textContent = m.brief;
  $('qKit').textContent = `${OPERATIVES[loadout.operative].toUpperCase()} · ${WEAPONS[loadout.primary].name.toUpperCase()} + ${WEAPONS[loadout.sidearm].name.toUpperCase()}`;
}
$('qDeploy').onclick = () => { unlockAudio(); const m = MISSIONS[selected]; startMission(selected, { route: !m.routes ? 'default' : m.routes[selRoute] ? selRoute : 'stealth', abilities: [] }); };
$('qLoadout').onclick = () => openBriefing('agent');
$('qMission').onclick = () => openBriefing('mission');
function applyRemote() {                                                        // live tuning from remote-config.json
  CFG.hold = RC.holdSeconds; crazy.setAdGap?.(RC.midgameGapSeconds * 1000);
  const q = touch ? RC.quality.touch : RC.quality.desk;
  if (q && !settings.qUser && settings.quality !== q) { settings.quality = q; qLevel = q === 'high' ? 2 : q === 'low' ? 0 : 1; applyQuality(); }
  if (touch && !settings.fUser) settings.fireMode = RC.touchAutoFire ? 'auto' : 'button';
}
function openLobby() {
  only('lobby'); at('lobby');
  const lc = TEST ? null : MODES.loginClaim();
  if (lc) { META.profile.coins += lc.coins; META.saveProfile(); sfx.coin?.(); loginBanner(lc); }
  chips(); setPreview(); modeButtons();
}
function loginBanner(lc) {
  const d = document.createElement('div'); d.className = 'loginToast';
  d.innerHTML = `<b>DAY ${lc.day} LOGIN REWARD</b> +${lc.coins} ◎<small>${[1, 2, 3, 4, 5, 6, 7].map(n => n <= lc.day ? '■' : '□').join(' ')} · tomorrow +${lc.tomorrow} ◎</small>`;
  document.body.append(d); setTimeout(() => d.remove(), 5000);
}
function modeButtons() {
  const d = MODES.dailyToday(progress, MISSIONS.length), st = MODES.dailyState();
  $('lDaily').textContent = st.done ? `✓ DAILY DONE · ${st.streak}-DAY STREAK` : `📅 DAILY: ${MISSIONS[d.idx].title.toUpperCase()} · +${MODES.dailyBonus(st.next)} XP`;
  $('lSurv').disabled = progress < 1 && !DEBUG;
  $('lSurv').textContent = progress < 1 && !DEBUG ? '🔒 SURVIVAL · CLEAR MISSION 1' : `♾ SURVIVAL${MODES.survBest() ? ' · BEST WAVE ' + MODES.survBest() : ''}`;
}
function openShop() {
  only('shop'); chips();
  const card = (id, it, vis) => {
    const own = META.profile.owned.includes(id), eq = META.profile.charm === id || META.profile.spray === id;
    const d = document.createElement('div'); d.className = `item${own ? ' own' : ''}${eq ? ' eq' : ''}`;
    d.innerHTML = `${vis}<div>${it.name.toUpperCase()}</div>`;
    const b = document.createElement('button'); b.textContent = eq ? 'EQUIPPED' : own ? 'EQUIP' : `BUY ◎${it.price}`; b.disabled = eq || (!own && META.profile.coins < it.price);
    b.onclick = () => { if (own) META.equipItem(id); else if (META.buy(id)) sfx.coin(); openShop(); setPreview(); };
    d.append(b); return d;
  };
  $('charms').innerHTML = ''; $('sprays').innerHTML = '';
  for (const [id, it] of Object.entries(META.CHARMS)) $('charms').append(card(id, it, `<div class="sw" style="background:#${(it.color ?? 0xdddddd).toString(16).padStart(6, '0')}"></div>`));
  for (const [id, it] of Object.entries(META.SPRAYS)) $('sprays').append(card(id, it, `<img src="${META.sprayDataURL(id)}" alt="">`));
}
function openPass() {
  only('pass');
  const lv = META.level();
  $('passInfo').textContent = `LEVEL ${lv} · ${META.profile.xp % META.XP_PER_LEVEL}/${META.XP_PER_LEVEL} XP · every level pays a tier · ◎ ${META.profile.coins}\nEarn XP from kills, headshots, objectives, breaches, intel and wins.`;
  $('passTrack').innerHTML = Array.from({ length: META.PASS_TIERS }, (_, i) => { const t = i + 1; return `<div class="tier${t <= META.profile.claimed ? ' got' : ''}${t % 5 === 0 ? ' big' : ''}">TIER ${t}<br>◎ ${META.tierCoins(t)}<br>${t <= META.profile.claimed ? '✓' : 'LV ' + (t + 1)}</div>`; }).join('');
}
function openProfile() {
  only('profile');
  const T = META.profile.totals, un = META.unlocked(progress);
  $('profStats').textContent = `LEVEL ${META.level()} · ${META.profile.xp} XP · ◎ ${META.profile.coins}\nCampaign ${progress}/${MISSIONS.length} · Wins ${T.wins} · Kills ${T.kills} · Headshots ${T.heads} · Breaches ${T.breaches} · Intel ${META.profile.intel.length}`;
  $('profUnlocks').textContent = [...PRIMARIES, ...SIDEARMS].map(w => `${WEAPONS[w].name}${un.weapons.has(w) ? ' ✓' : ` (M${META.unlockSource('weapons', w)})`}`).join(' · ') + '\n' + Object.entries(OPERATIVES).map(([o, n]) => `${n}${un.operatives.has(o) ? ' ✓' : ` (M${META.unlockSource('operatives', o)})`}`).join(' · ');
  const open = META.filesOpen();
  $('files').innerHTML = META.FILES.map(([t, b], i) => `<div class="file${i < open ? '' : ' lock'}"><b>${i < open ? t : '🔒 FILE ' + (i + 1)}</b><br>${i < open ? b : `Recover ${(i + 1) * 3} intel caches to open.`}</div>`).join('');
}
$('lPlay').onclick = () => {                                                       // first launch: PLAY drops straight into the mission-1 drill (tour stays in Settings)
  unlockAudio();
  if (progress === 0 && !onboardingDone() && !tutorialDone()) { try { localStorage.setItem('sz_onboard_done', '1'); } catch { /* blocked */ } selected = 0; startMission(0); return; }
  openQuick();
}; $('lLoadout').onclick = () => { openBriefing('agent'); };
$('lDaily').onclick = () => { unlockAudio(); const d = MODES.dailyToday(progress, MISSIONS.length); selected = d.idx; startMission(d.idx, { route: MISSIONS[d.idx].routes ? d.route : 'default', abilities: [], mode: 'daily' }); };
$('lSurv').onclick = () => { unlockAudio(); const i = (Math.random() * Math.min(progress, MISSIONS.length)) | 0; selected = i; startMission(i, { route: MISSIONS[i].routes ? 'assault' : 'default', abilities: [], mode: 'survival' }); };
$('lShop').onclick = openShop; $('lPass').onclick = openPass; $('lProfile').onclick = openProfile; $('lSettings').onclick = settingsUI;
$('lTutorial').onclick = () => only('tutPick');
$('tpPlay').onclick = () => window.__replayTutorial?.();
$('tpDoc').onclick = () => { only('guide'); $('guide').querySelector('.card').scrollTop = 0; };
document.querySelectorAll('.back').forEach(b => b.onclick = openLobby); 

// ---------- weapon charm (viewmodel) + sprays ----------
let charm = null, lastYaw = 0;
function attachCharm() {
  charm?.parent?.remove(charm); charm = null;
  const c = META.charmMesh(META.profile.charm), m = vm.cur; if (!c || !m) return;
  const b = m.info.box; c.position.set(-b.max.x - 0.004, (b.min.y + b.max.y) / 2, -(b.min.z + (b.max.z - b.min.z) * 0.3));
  vm.gunHolder.add(c); charm = c;
}
function swingCharm(dt) {
  if (!charm) return; const sw = charm.userData.swing, dy = player.yaw - lastYaw; lastYaw = player.yaw;
  sw.v += (-sw.a * 90 - sw.v * 5) * dt + dy * 6 + (player.moving ? Math.sin(elapsed * 9) * dt * 3 : 0); sw.a += sw.v * dt;
  charm.rotation.z = clamp(sw.a, -0.9, 0.9); charm.rotation.x = clamp(sw.a * 0.4, -0.5, 0.5);
}
function doSpray() {
  if (!running || sprayCD > 0) return; updateCamera();
  const o = camera.getWorldPosition(V()), d = V(); camera.getWorldDirection(d);
  const h = world.raycast(o, d, 6); if (!h) return;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: META.sprayTexture(META.profile.spray), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  m.position.copy(h.point).addScaledVector(h.normal, 0.02); m.lookAt(m.position.clone().add(h.normal));
  if (Math.abs(h.normal.y) > 0.7) m.rotateZ(-player.yaw);
  scene.add(m); sprays.push(m); if (sprays.length > 4) { const x = sprays.shift(); x.parent?.remove(x); }
  sprayCD = 3; sfx.spray();
}

// ---------- menus: keep characters animated behind the briefing / pause ----------
function idleAnim(dt) { for (const e of enemies) { e.tickAnim(dt); e.sync(); } preview?.update(dt); efx?.update(dt); map?.kit.update(dt, performance.now() / 1000); }

// ---------- loop ----------
let last = performance.now(), manual = false, frames = 0, fpsT = 0, fps = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  // FPS every half second; dynamic resolution first (cheap, smooth), then drop a quality level if still slow
  frames++; fpsT += Math.min((now - (frame.prev ?? now)) / 1000, 1); frame.prev = now;
  if (fpsT >= 0.5) {
    fps = frames / fpsT; frames = 0; fpsT = 0;
    if (running && (frame.tk = (frame.tk || 0) + 1) % 30 === 0) track('fps', { fps: Math.round(fps), q: qLevel, s: Math.round(dynScale * 100) });
    if (running && !manual && settings.quality === 'auto') {
      const target = IS_TOUCH ? 45 : 58;
      if (fps < target - 3) {
        if (dynScale > 0.55) { dynScale = Math.max(0.5, dynScale - (fps < target * 0.6 ? 0.15 : 0.07)); applyQuality(); }
        else if (++lowFpsT >= 4 && qLevel > 0) { qLevel--; lowFpsT = 0; dynScale = 0.8; applyQuality(); }
      } else { lowFpsT = 0; if (fps > target + 1 && (frame.up = (frame.up || 0) + 1) >= 3) { frame.up = 0; if (dynScale < 1) { dynScale = Math.min(1, dynScale + (fps > target * 1.3 ? 0.15 : 0.07)); applyQuality(); } else if (fps > target * 1.35 && qLevel < 1) { qLevel++; dynScale = 0.85; applyQuality(); } } }
    }
  }
  if (!manual) {
    const t0 = performance.now(); if (!running) idleAnim(dt); update(dt); const t1 = performance.now(); render(); const t2 = performance.now();
    if (TEST) { (window.__frames ??= []).push([+(t1 - t0).toFixed(1), +(t2 - t1).toFixed(1), +(now - (frame.last ?? now)).toFixed(0)]); if (window.__frames.length > 600) window.__frames.shift(); }
    frame.last = now;
  }
  requestAnimationFrame(frame);
}

// ---------- test / debug API ----------
window.__game = {
  errors, get ready() { return !!A.enemies; }, MISSIONS, WEAPONS, ABILITIES,
  get state() { return { running, matchOver, clock, mission: mission?.id, hp: player.hp, shield: player.shield, pos: player.pos.toArray(), onGround: player.onGround, weapon: cur(), ammo: st() && { ...st() }, reloading: W.reloadT > 0, enemies: enemies.map(e => ({ type: e.type, alive: e.alive, hp: e.hp, state: e.state, pos: e.pos.toArray(), blind: e.blindT, revealed: e.revealT > 0 })), objective: { ...objective, charge: undefined }, zones: Object.fromEntries(Object.entries(zones).map(([k, v]) => [k, v.length])), picks, abilityCD: [...abilityCD], stats: { ...stats }, fps, end: $('end').classList.contains('show') ? $('endTitle').textContent : null }; },
  start: (i, o = {}) => startMission(i, o), openBriefing, openLobby, openShop, openPass, openProfile, META, doSpray, detonateBarrel, revive,
  get charm() { return charm; }, get sprays() { return sprays; },
  get breaches() { return breaches; }, get medkits() { return medkits; }, get barrels() { return barrels; }, get intel() { return intel; }, get matchXP() { return matchXP; },
  prof: { up: 0, re: 0, progs: 0 },
  step(seconds, f = 30) { manual = true; const n = Math.round(seconds * f); let t = performance.now(); for (let i = 0; i < n; i++) update(1 / f); const u = performance.now() - t; t = performance.now(); const p0 = renderer.info.programs.length; render(); const r = performance.now() - t; const P = window.__game.prof; P.up = Math.max(P.up, u); P.re = Math.max(P.re, r); P.progs += renderer.info.programs.length - p0; },
  auto() { manual = false; last = performance.now(); },
  render, look(yaw, pitch = 0) { player.yaw = yaw; player.pitch = pitch; },
  lookAt(x, y, z) { const e = player.pos.clone().add(V(0, CFG.eye, 0)); player.yaw = Math.atan2(-(x - e.x), -(z - e.z)); player.pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z)); },
  teleport(x, y, z) { player.pos.set(x, y, z); player.vel.set(0, 0, 0); },
  key(code, down = true) { keys[code] = down; }, mouse(btn, down = true) { mouse[btn] = down; },
  equip, reload: startReload, ability: useAbility, fire: () => { W.cd = 0; W.firedSemi = false; fire(); },
  get tutorial() { return tutorial; }, get onboard() { return onboard; }, startOnboarding, get mentor() { return mentor; }, TUT,
  killAll() { for (const e of enemies) if (e.alive) e.damage(9999); },
  peace() { for (const e of enemies) { e.update = function (dt) { this.mixer.update(dt); this.sync(); }; } },
  damage: (n) => damagePlayer(n, null), timeout() { clock = 0.01; },
  get scene() { return scene; }, get renderer() { return renderer; }, get camera() { return camera; },
  setQuality(q) { settings.quality = q; qLevel = q === 'high' ? 2 : 1; applyQuality(); },
  get info() { return { ...renderer.info.render, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, q: qLevel, fps }; },
  get player() { return player; }, get guide() { return GUIDE; }, get enemies() { return enemies; }, get world() { return world; }, get map() { return map; },
};

// ---------- boot ----------
(async () => {
  crazy.onAd(on => { audioMute(on); if (on && running) doPause(); });
  const rcP = loadRemote(TEST);
  await crazy.init(TEST); crazy.loading(true);
  if (crazy.active) {                                                             // cloud save just hydrated localStorage: re-read what was loaded at import time
    progress = Number(store.get('sz_progress', progress)) || 0;
    Object.assign(loadout, store.get('sz_loadout', {})); Object.assign(settings, store.get('sz_settings', {})); Object.assign(META.profile, store.get('sz_profile', {}));
  }
  try { await loadAll(); }
  catch (e) { $('ltext').textContent = `Failed to load: ${e.message}`; errors.push(String(e)); return; }
  await rcP; applyRemote();
  crazy.loading(false); track('boot', { load: Math.round(performance.now() / 100) / 10, q: settings.quality, rc: RC.loaded ? RC.v : 0 });
  if (!PRIMARIES.includes(loadout.primary)) loadout.primary = 'ar7_lance';
  if (!SIDEARMS.includes(loadout.sidearm)) loadout.sidearm = 'vex_p9';
  FX.initFeel($('hud'));
  const un = META.unlocked(progress);
  if (!DEBUG) { if (!un.weapons.has(loadout.primary)) loadout.primary = 'ar7_lance'; if (!un.weapons.has(loadout.sidearm)) loadout.sidearm = 'vex_p9'; if (!un.operatives.has(loadout.operative)) loadout.operative = 'rhea'; }
  buildMission(Math.min(progress, MISSIONS.length - 1));             // a live backdrop behind the lobby
  running = false;
  const firstRun = !TEST && !Q.has('brief') && !Q.has('onboard') && progress === 0 && !onboardingDone() && !tutorialDone();
  if (Q.has('brief')) openBriefing(); else openLobby();
  if (Q.has('onboard')) startOnboarding(true);
  else if (firstRun) {                                                            // first launch: straight into the mission-1 drill, no menus (CG load time = page open -> gameplayStart)
    try { localStorage.setItem('sz_onboard_done', '1'); } catch { /* blocked */ }
    selected = 0; startMission(0);                                               // first click on the canvas grabs the mouse + unlocks audio
  }
  requestAnimationFrame(frame);
})();
