// Blastline (built on Strike Zone: Season 1). Full game: maps + collision, rigged enemies with AI, first-person weapons,
// abilities that drive gameplay, objectives, story radio, style D HUD. See DEV-LOG.md.
import { createFlow } from './game/menu-flow.js';
import * as THREE from 'three';
// (GLTF loading goes through world/gltf.js makeLoader since v43)
import { World } from './world/collision.js';
import { loadKenney, dressMap } from './world/kenney.js';
import { loadArch } from './world/kenney-arch.js';
import { crazy } from './game/crazy.js';
import { buildM1, buildM2, buildM3, LIGHTING } from './world/maps.js';
import { DM_MAPS, loadDmMap, dmMapReady, buildDmMap } from './world/dm-maps.js';
import { buildBrIsland, BR_MAP_IDS } from './world/br-map.js';
import { makeLoader } from './world/gltf.js';
import { buildLobbyRoom } from './world/lobby-room.js';
import { AbilityFX } from './fx/abilities.js';
import { WEAPONS, PRIMARIES, SIDEARMS, Viewmodel, starTex } from './game/weapons.js';
import { ENEMY_TYPES, Enemy, loadEnemyAssets, calibrateGun, buildCharAssets } from './game/enemies.js';
import * as SkeletonUtils from './lib/addons/utils/SkeletonUtils.js';
import { RELEASE_AT } from './fx/abilities.js';
import { sfx, unlockAudio, music, ambience, audio, setAudio, toggleMute, forceMute, setLite } from './game/audio.js';
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
import { track, at, onQuit, stage, flush as tFlush } from './game/telemetry.js';
import { director } from './game/director.js';
import * as QUESTS from './game/quests.js';
import { icon } from './game/icons.js';
import { createNet, serverUrl } from './game/net.js';
const TUT = { dt: 0, look: 0, moved: false, walked: false, jumped: false, slid: false, fired: false, aiming: false, reloaded: false, swapped: false, ab0: false, ab1: false, kills: 0, interacting: false };

const Q = new URLSearchParams(location.search);
const TEST = Q.has('test'), DEBUG = Q.has('debug') || TEST;
const $ = id => document.getElementById(id);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const fmt = s => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;
const errors = []; addEventListener('error', e => errors.push(String(e.message)));

const CFG = { retrieve: 2.5, breach: 1.2, fuse: 1.8, eye: 1.75, run: 5.8, walk: 2.6, jump: 7.2, sens: 0.0022, defuse: 5, plant: 3, hold: 20, useR: 2.3, blockR: 7 };

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
if (touch) touch.onSlot = i => { if (running && player.alive && i !== W.cur && W.slots[i]) equip(i); };   // Blastline: tap a weapon card to switch
if (touch) document.getElementById('touch')?.addEventListener('touchstart', () => noteInput('touch'), { passive: true });
if (touch) for (const [id, ic] of [['tfire', 'crosshair'], ['taim', 'ads'], ['tjump', 'extraction'], ['treload', 'reload']]) { const b = document.getElementById(id); if (b) b.innerHTML = icon(ic, 'ic tic'); }   // v14 kit icons
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
  qLevel = want; setLite(want === 0);
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
const loader = makeLoader();   // v43: meshopt-compressed models (world/gltf.js)
const A = { weapons: {}, icons: {}, props: {}, enemies: null, rhea: null };
async function loadAll() {
  const ids = Object.keys(WEAPONS), total = ids.length + 2 + 1 + Object.keys(ENEMY_TYPES).length; let done = 0;   // weapons + props + operative + enemies (v44: kits load in the background)
  const bar = $('lbar').firstElementChild, ldSent = {}, tick = () => { done++; const pc = Math.min(99, Math.round(done / total * 100)); bar.style.width = `${pc}%`; for (const m of [25, 50, 75]) if (pc >= m && !ldSent[m]) { ldSent[m] = 1; track('ld', { p: m }); } };
  const origLoad = loader.loadAsync.bind(loader);   // every GLB (weapons, kenney kits, arch, enemies, operative) advances the bar
  loader.loadAsync = async u => { try { return await origLoad(u); } finally { tick(); } };
  // v43: all groups download in parallel (they used to load one group after another, so slow phone networks paid
  // six round-trip waits). Enemies only need the weapon scenes to be in first.
  A.ops = {};
  const wP = Promise.all(ids.map(async id => { const g = await loader.loadAsync(`models/weapons/${id}.glb`); A.weapons[id] = g.scene; vm.register(id, g.scene); }));
  const pP = Promise.all(['covenant_device', 'counter_charge'].map(async id => { const g = await loader.loadAsync(`models/props/${id}.glb`); g.scene.traverse(o => { if (o.isMesh) o.castShadow = true; }); A.props[id] = g.scene; }));
  // Kenney architecture (world/kenney-arch.js) + map props (world/kenney.js); fall back to procedural boxes if missing
  const kits = () => (A.kitsP ??= Promise.all([loadArch(loader), loadKenney(loader)]).catch(() => {}).then(() => { A.kits = true; }));
  A.loadKits = kits;
  const oP = loadOperative(loadout.operative in OPERATIVES ? loadout.operative : 'rhea').then(g => { A.rhea = g; });
  const eP = wP.then(() => loadEnemyAssets(loader, A.weapons));
  // v44: the Kenney kits only dress the story maps, so they no longer hold up boot (first launch is a Deathmatch arena).
  // They start downloading at the end of boot; a story map waits for them (startMissionNow). Tests keep them synchronous.
  if (TEST) await kits();
  await Promise.all([wP, pP, oP]); A.enemies = await eP;
  loader.loadAsync = origLoad; bar.style.width = '100%';
  for (const id of ids) A.icons[id] = renderIcon(A.weapons[id]);
  for (const m of Object.values(vm.models)) { toonify(m.scene); outline(m.scene, { thick: 0.0035 }); }
  toonify(vm.root); outline(vm.armR, { thick: 0.003 }); outline(vm.armL, { thick: 0.003 });
}
const BOT_OPS = ['kade', 'tomas', 'yuna', 'amara', 'rhea'], HUMANOID = new Set(['enemy_guard', 'enemy_heavy', 'enemy_sniper', 'enemy_commander']), botSkin = {};
function loadBotSkins() {                                                          // v15: Deathmatch bots wear the operative characters (same rig + clips as enemies)
  for (const op of BOT_OPS) if (!(op in botSkin)) { botSkin[op] = null; loadOperative(op).then(g => { botSkin[op] = { g, by: {} }; }).catch(e => { errors.push('botskin ' + op + ': ' + e); }); }
}
function botAssets(type, i) {
  if (!HUMANOID.has(ENEMY_TYPES[type].model)) return null;
  const ready = BOT_OPS.filter(o => botSkin[o] && o !== loadout.operative); if (!ready.length) return null;
  const s = botSkin[ready[i % ready.length]]; return (s.by[type] ??= buildCharAssets(s.g, type, A.weapons));
}
function loadOperative(id) { return (A.ops[id] ??= loader.loadAsync(`models/rigged/${id}.glb`)); }
function renderIcon(model) {
  const W = 256, H = 96, rt = new THREE.WebGLRenderTarget(W, H);
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
  const m = model.clone(true); sc.add(m);
  const box = new THREE.Box3().setFromObject(m), c = box.getCenter(V()), s = box.getSize(V());
  const half = Math.max(s.z, s.x, s.y * W / H) * 0.54;                 // v26: fill the frame (was ~1/3 of the width)
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
let enemies = [], allies = [], devices = [], zones = { smoke: [], lock: [], sensor: [], decoy: [], drone: [], elock: [], edrone: [] };
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
let medkits = [], breaches = [], barrels = [], intel = [], extractMark = null, matchXP = {}, revived = false, invT = 0, shakeK = 0, sprays = [], sprayCD = 0, xpDoubled = false, winBonus = 0, dmLevel = Math.max(1, Number(store.get('sz_dm_level', 1)) || 1), matchCoins = 0, dblT = 0, hudLow = false, playMode = 'story', trialWeapon = null;

const G = {                                         // services handed to enemies
  get player() { return player; }, get world() { return world; },
  get ffaRival() { return mode === 'dm' ? ffaRival : null; },
  botBoost(e) {                                                                // v28 team DM: +4% every 5 total kills (cap +16%), +8% for the team 5+ kills behind
    if (mode !== 'dm' || !DM.tdm || !DM.score || NET.on) return 1;                   // online: no side gets a boost
    const A = DM.score.A, B = DM.score.B, mine = e.ally ? A : B, theirs = e.ally ? B : A;
    return 1 + (e.ally ? 0 : RC.tdmRedBoost) + Math.min(RC.tdmRampMax, RC.tdmRamp * Math.floor((A + B) / 5)) + (theirs - mine >= RC.tdmComebackGap ? RC.tdmComeback : 0);   // v29.4: red bots a touch stronger
  }, get tdm() { return mode === 'dm' && !!DM.tdm; },
  get dmParity() { return mode === 'dm'; }, get dmPower() { if (NET.on) return Math.min(1, RC.dmPower + RC.dmPowerStep * 4); const base = DM.grace ? RC.dmGracePower + RC.dmGraceStep * (DM.graceN || 0) : Math.min(1, RC.dmPower + RC.dmPowerStep * (dmLevel - 1)); return Math.max(RC.dmEaseFloor, base - (DM.ease || 0)); },   // v29.7: grace 0.55 -> 0.6, minus a loss-streak ease
  get ignorePlayer() { return mode === 'dm' && DM.grace && elapsed < RC.dmGraceCalm; }, get rampage() { return mode === 'dm' && DM.rampage; },
  get difficulty() { return RC.adaptive ? director.difficulty() : 0.8 + Math.min(11, missionIdx) * 0.035; },   // v14: adaptive threat owns difficulty   // gentle first missions, ramps through the campaign
  playerHead: () => player.pos.clone().add(V(0, 1.55, 0)),   // v46: eye 1.6 -> 1.75
  losClear: (a, b) => world.lineClear(a, b) && !smokeBlocks(a, b),
  nearestDecoy(p, r) { let best = null, bd = r; for (const d of zones.decoy) { const q = d.obj.position.clone().add(V(0, 1.2, 0)); const dd = q.distanceTo(p); if (dd < bd) { bd = dd; best = q; } } return best; },
  inLockdown: p => zones.lock.some(z => z.pos.distanceTo(p) < z.radius && Math.abs(z.pos.y - p.y) < 3),
  allowRepath: () => repathBudget-- > 0,
  onSpotted(e) { if (e.ally || e.targetKind === 'bot') return; radioOnce('contact'); storyEv(e.type); for (const o of enemies) if (o !== e && o.alive && o.pos.distanceTo(e.pos) < 18) o.alert(player.pos, 0.8); },
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

// v27: Deathmatch arenas (own list; story MISSIONS untouched)
const DM_MISSIONS = DM_MAPS.map(d => ({ id: 'dm_' + d.id, title: d.title, build: (w, sc) => buildDmMap(d, w, sc), objective: 'dm', roster: ['guard', 'guard', 'sniper', 'commander'], pool: ['smoke', 'dash'], radio: {}, dm: true }));
const BR_IDX = DM_MISSIONS.push({ id: 'br_island', title: 'Island Ring', build: (w, sc) => buildBrIsland(w, sc), objective: 'dm', roster: ['guard', 'guard', 'sniper', 'commander'], pool: ['smoke', 'dash'], radio: {}, dm: true, br: true }) - 1;   // battle royale: the 4 arenas as regions of one island
const brLoad = () => Promise.all(BR_MAP_IDS.map(id => loadDmMap(id)));
// ---------- building a mission ----------
function buildMission(idx, opts = {}) {
  missionIdx = idx; mission = opts.dmMap != null ? DM_MISSIONS[opts.dmMap] : MISSIONS[idx];
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
  if (!map.noDress) { const th = mission.proc?.theme || { m1: 'downtown', m2: 'harbor', m3: 'industrial' }[mission.id] || 'street';   // decorative Kenney scatter (no colliders / minimap)
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
  enemies = []; clearAllies(); DM.tdm = false;
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
  medkits = mode === 'dm' ? [] : buildMedkits();                                  // deathmatch: no pickups, health resets only on respawn
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
  W.cur = slot; W.reloadT = 0; vm.equip(cur()); W.drawT = instant ? 0 : 0.45; attachCharm(); if (!instant && running) sfx.draw(cur());
  $('wicon').src = A.icons[cur()] || ''; $('wname').textContent = cs().name.toUpperCase(); wslots();
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
  vm.fire(w); sfx.shot(cur(), 0, 0, 1, 1 - s.mag / w.mag);
  addTracer(muzzleWorld(), end, 0xffe08a); if (NET.on) NET.shot(NET.me, muzzleWorld(), end, cur());
  if (best) {
    const head = best.h.part === 'head';
    const mult = head ? (best.h.mult || w.head) : best.h.mult;
    const amount = w.dmg * mult * META.dmgMult(cur()) * (mode === 'dm' && DM.odT > 0 ? 1.6 : 1);
    const killed = NET.on ? (best.e.nid && NET.hit(NET.me, best.e.nid, amount, head, cur()), false) : best.e.damage(amount, player.pos.clone(), best.h.part);   // online: the server applies damage + confirms the kill
    { const sp = toScreen(end); if (sp.on) FX.damageNumber(sp.x, sp.y, Math.round(amount), { head, kill: killed }); FX.hitPunch(head ? 1 : 0.5); }
    if (killed) { const n = FX.streakTick(performance.now()); FX.killBanner(head ? 'HEADSHOT' : 'ELIMINATED', { head, streak: n }); FX.xpPop(META.XP.kill + (head ? META.XP.head : 0), head ? 'HEADSHOT' : 'KILL'); }
    stats.hits++; if (head) stats.heads++;
    hitMarker(killed, head); sfx.hit(head); addImpact(end, dir.clone().negate(), true);
    if (killed) { best.e._dv = dir.clone().setY(0).normalize().multiplyScalar(w.dmg > 60 ? 7 : 3.5); if (head) FEEL.hitStop = 0.06; }
    FEEL.combo++; FEEL.comboT = 1.2;
    if (killed && mode === 'dm') dmKill();
    if (killed) { stats.kills++; if (stats.kills === 1) track('kill1', { m: mission.id, t: Math.round(elapsed) }); killTick(head, best.e); matchXP.kills += META.XP.kill; if (head) matchXP.heads += META.XP.head; sfx.kill(stats.kills, head); feed(`VOSS ▸ ${ENEMY_TYPES[best.e.type].name.toUpperCase()}${head ? ' ✦' : ''}`, head); }
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
    scene.add(d); impacts.push(d); sfx.impact(p.distanceTo(player.pos), panOf(p.x, p.z));
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
function ffaRival(e) {                                                             // nearest other live bot within 40 m (LOS is checked by the bot); team DM: nearest bot of the other team
  let best = null, bd = DM.tdm ? 60 : 40;
  for (const o of DM.tdm ? (e.ally ? enemies : allies) : enemies) { if (o === e || !o.alive) continue; const d = o.pos.distanceTo(e.pos); if (d < bd) { bd = d; best = o; } }
  return best;
}
function dmMap() {                                                                  // a different random map each Deathmatch (never the same twice in a row)
  const n = Math.max(1, Math.min(MISSIONS.length, RC.dmMaps)); let i = (Math.random() * n) | 0;
  if (n > 1 && i === dmMap.last) i = (i + 1 + ((Math.random() * (n - 1)) | 0)) % n;
  return (dmMap.last = i);
}
function dmStart(def, forceMap = null) {
  unlockAudio();
  if (RC.dmNewMaps) {                                                              // v27: the four DM arenas, never the same twice in a row, loaded on demand
    const n = DM_MAPS.length; let j = forceMap ?? DM.nextMap ?? ((Math.random() * n) | 0); if (forceMap == null && n > 1 && j === dmStart.last) j = (j + 1) % n; dmStart.last = j; DM.nextMap = null;
    const go = () => { $('dmLoad')?.remove(); startMission(0, { route: 'default', abilities: [], mode: 'dm', def: def ? 1 : 0, dmMap: j }); let k = (Math.random() * n) | 0; if (k === j) k = (k + 1) % n; DM.nextMap = k; loadDmMap(DM_MAPS[k].id).catch(() => {}); };
    if (dmMapReady(DM_MAPS[j].id)) { go(); return; }
    let el = $('dmLoad'); if (!el) { el = document.createElement('div'); el.id = 'dmLoad'; document.body.append(el); } el.textContent = `LOADING ${DM_MAPS[j].title.toUpperCase()}…`;
    loadDmMap(DM_MAPS[j].id).then(go).catch(e => { errors.push('dm map: ' + e); el.remove(); if (NET.on) { netQuit('MAP FAILED TO LOAD'); return; } RC.dmNewMaps = false; dmStart(def); });
    return;
  }
  const i = dmMap(); selected = i; startMission(i, { route: MISSIONS[i].routes ? 'assault' : 'default', abilities: [], mode: 'dm', def: def ? 1 : 0 });
}
const dmGoal = (lvl, tdm = DM.tdm) => tdm ? Math.min(RC.tdmMaxKills, RC.tdmLevelKills + RC.tdmLevelStep * (lvl - 1)) : Math.min(RC.dmMaxKills, RC.dmLevelKills + RC.dmLevelStep * (lvl - 1));
const dmTarget = () => DM.target || dmGoal(dmLevel);
function tdmScore(team) {                                                          // team Deathmatch: every kill scores for the killer's team
  if (!DM.tdm || matchOver || DM.hill || NET.on) return; DM.score[team]++; DM.boardDirty = true;
  if (DM.score[team] >= dmTarget()) dmEnd(team === 'A');
}
function botKill(killer, victim) {                                                 // bot fragged bot: score + feed
  if (victim.ident) victim.ident.d++;
  DM.boardDirty = true; feed(`${killer.callsign || 'BOT'} ▸ ${victim.callsign || 'BOT'}`, false);
  if (DM.tdm) { if (killer.ident) killer.ident.k++; tdmScore(killer.ally ? 'A' : 'B'); return; }
  if (killer.ident) { killer.ident.k++; if (killer.ident.k >= dmTarget() && !matchOver) dmEnd(false); }
}
const panOf = (x, z) => Math.sin(Math.atan2(x - player.pos.x, z - player.pos.z) - player.yaw - Math.PI);   // stereo position of a world point
function nearMiss(from, to) {                                                    // closest pass of a shot to your head (m), scalar math only
  const ax = to.x - from.x, ay = to.y - from.y, az = to.z - from.z, L = ax * ax + ay * ay + az * az || 1;
  const px = player.pos.x - from.x, py = player.pos.y + 1.5 - from.y, pz = player.pos.z - from.z;
  const u = (px * ax + py * ay + pz * az) / L; if (u < 0.05 || u > 1.2) return 99;
  return Math.hypot(px - ax * u, py - ay * u, pz - az * u);
}
function enemyFired(e, from, to, dmg, victim) {
  if (NET.on) {                                                                    // online: bot damage goes through the server; only the visuals run here
    if (NET.host && e.nid && !e.net) { NET.shot(e.nid, from, to, ''); if (dmg > 0 && !matchOver) { const v = victim ? victim.nid : player.alive ? NET.me : 0; if (v) NET.hit(e.nid, v, dmg, false); } }
    if (victim && !victim.net) victim.alert(e.pos, 1); dmg = 0; victim = null;
  }
  addTracer(from, to, e.ally ? 0x7cc8ff : e.S.laser ? 0xff8080 : 0xff6b4a);
  const d = from.distanceTo(player.pos);
  const rel = Math.atan2(from.x - player.pos.x, from.z - player.pos.z);
  const pan = Math.sin(rel - player.yaw - Math.PI); sfx.shot(e.S.weapon || e.S.cls, d, pan, Math.cos(rel - player.yaw - Math.PI));
  if (victim) {                                                                   // bot vs bot (free-for-all Deathmatch)
    if (dmg > 0 && victim.alive && !matchOver) { victim.alert(e.pos, 1); if (victim.damage(dmg, from.clone())) botKill(e, victim); }
    else { const h = world.raycast(from, to.clone().sub(from).normalize(), from.distanceTo(to)); if (h) addImpact(h.point, h.normal, false); }
    return;
  }
  const n = V().subVectors(from, to).normalize(), hit = world.raycast(from, to.clone().sub(from).normalize(), from.distanceTo(to));
  if (hit && !dmg) addImpact(hit.point, hit.normal, false);
  if (dmg > 0 && mode !== 'dm' && RC.hitTimer && !hitReady(d, from)) { dmg = 0; if (hit) addImpact(hit.point, hit.normal, false); }   // v14 fair-fight hit timer: blocked hits become near-misses
  if (dmg > 0) { LS.by = e.type || ''; LS.byE = e; damagePlayer(dmg, from); }
  else if (d > 6 && nearMiss(from, to) < 2.2) sfx.whiz(pan);                        // round cracks past your head
}
let hitNextT = 0;
function hitReady(dist, from) {                                                  // global inter-hit timer (story): delay = 0.5 s x rules / threat
  if (elapsed < hitNextT) return false;
  let k = dist < 5 ? 0.5 : dist > 15 ? 1 : 0.75;
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw), dx = from.x - player.pos.x, dz = from.z - player.pos.z, dl = Math.hypot(dx, dz) || 1;
  const dot = -(fx * dx + fz * dz) / dl;                                         // camera looks down -z: facing the shooter -> dot ~ 1
  if (dot < -0.98) k *= 2;
  const vl = Math.hypot(player.vel.x, player.vel.z); if (vl > 2 && -(player.vel.x * dx + player.vel.z * dz) / (vl * dl) < -0.86) k *= 0.5;
  hitNextT = elapsed + 0.5 * k / director.hitDelayDiv(); return true;
}
function damagePlayer(dmg, from) {
  if (!player.alive || matchOver || invT > 0) return;
  LS.dmg += dmg; DM.hitT = elapsed; if (mode === 'dm' && DM.hits) { DM.hits.push(Math.round(dmg)); if (DM.hits.length > 12) DM.hits.shift(); } let x = dmg; if (player.shield > 0) { const a = Math.min(player.shield, x); player.shield -= a; x -= a; }
  player.hp -= x; hurtK = Math.min(1, hurtK + 0.35 + dmg / 60); sfx.hurt(dmg, from ? panOf(from.x, from.z) : 0);
  if (from) { const a = Math.atan2(from.x - player.pos.x, from.z - player.pos.z) - player.yaw; FEEL.punchY = Math.sin(a) * 0.02; FEEL.punchP = -0.015 - dmg * 0.0006; }
  if (from) dmgDirs.push({ ang: Math.atan2(from.x - player.pos.x, from.z - player.pos.z), t: 1.2 });
  if (player.hp > 0 && player.hp < 35) storyEv('hurt');
  if (player.hp <= 0 && NET.on) { player.hp = 0; return; }                         // online: wait for the server's kill message
  if (player.hp <= 0) { player.hp = 0; sfx.death(); director.death(); track('thr', { k: 'death', v: +director.threat.toFixed(2), m: mission.id }); if (mode === 'dm' && LS.byE?.ident) { LS.byE.ident.k++; DM.boardDirty = true; if (DM.tdm) { tdmScore('B'); if (matchOver) return; } else if (LS.byE.ident.k >= dmTarget()) { dmEnd(false); return; } } if (mode === 'dm') { dmDeath(); return; } player.alive = false; lose('You were eliminated.'); }
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
let lastStart = { idx: 0, opts: {} }, autoNextT = 0, returnGifts = null;
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
// ---------- solo deathmatch: bots keep coming, you respawn, first to dmKills or most kills when the clock ends ----------
const DM = { d: 0, streak: 0, best: 0, k0: 0, spawnT: 0, deadT: 0, lastK: -9, multi: 0, uavT: 0, odT: 0, hitT: 0, final: false };
const MULTI = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'RAMPAGE', 'UNSTOPPABLE'];
function dmKill() {                                                             // multi-kills within 4 s + streak rewards
  if (DM.rampage) { DM.rampage = false; FX.announce('RAMPAGE BROKEN', 'start'); }
  DM.streak++; DM.best = Math.max(DM.best, DM.streak);
  DM.multi = elapsed - DM.lastK < 4 ? DM.multi + 1 : 1; DM.lastK = elapsed;
  if (DM.multi >= 2) { FX.announce(MULTI[Math.min(DM.multi, 5)], 'objective'); sfx.coin(); const f = $('mkFlash'); f.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on'))); }
  if (DM.streak === 3) { DM.uavT = 12; FX.announce('UAV ONLINE · 3 STREAK', 'start'); }
  if (DM.streak === 5) { DM.odT = 12; FX.announce('OVERDRIVE · 5 STREAK', 'start'); }
  if (DM.streak === 8) { FX.announce('AIRSTRIKE INBOUND · 8 STREAK', 'start'); setTimeout(dmAirstrike, 1500); }
}
function dmAirstrike() {
  if (mode !== 'dm' || matchOver) return; invT = Math.max(invT, 1.5);
  for (const e of enemies.slice()) if (e.alive) explode(e.pos.clone().add(V(0, 1, 0)), 3.5, 400, 'AIRSTRIKE');
}
const _spH = new THREE.Vector3(), _spE = new THREE.Vector3();
function dmPool() {                                                              // v15: spawn spots spread over the whole map (reachable nav nodes, ~4 m apart)
  const nav = world.nav, pool = [];
  if (!nav?.nodes?.length) return map.guards.map(g => g.clone());
  const start = world.nearestNode(map.spawns.default || player.pos); if (!start) return pool;
  const seen = new Uint8Array(nav.nodes.length), q = [start]; seen[start.id] = 1; const cell = new Set();
  for (const g of pool) cell.add(`${Math.floor(g.x / 4)},${Math.floor(g.z / 4)},${Math.round(g.y / 2)}`);
  while (q.length) {
    const n = q.pop();
    if (n.links.length >= 6) { const k = `${Math.floor(n.pos.x / 4)},${Math.floor(n.pos.z / 4)},${Math.round(n.pos.y / 2)}`; if (!cell.has(k) && !world.overlaps(n.pos, 0.4, 1.8)) { cell.add(k); pool.push(n.pos.clone()); } }
    for (const l of n.links) { const m = l[0]; if (!seen[m.id]) { seen[m.id] = 1; q.push(m); } }
  }
  if (pool.length >= 40 && RC.dmArea < 1 && !map.dm) {                                       // play area ~20% smaller: keep spawns in the central part of the map
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const p of pool) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2 * RC.dmArea, hz = (z1 - z0) / 2 * RC.dmArea;
    const inner = pool.filter(p => Math.abs(p.x - cx) <= hx && Math.abs(p.z - cz) <= hz); if (inner.length >= 30) { DM.area = { cx, cz, hx, hz }; return inner; }
  }
  return pool.length >= 20 ? pool : pool.concat(map.guards.map(g => g.clone()));
}
function dmSides(pool) {                                                          // team DM: split the map along its long axis
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const p of pool) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const T = map.teamSpawns;
  if (T) { const dx = T.B.x - T.A.x, dz = T.B.z - T.A.z, L = Math.hypot(dx, dz) || 1; return { ax: dx / L, az: dz / L, cx: (T.A.x + T.B.x) / 2, cz: (T.A.z + T.B.z) / 2, h: Math.max(4, L / 2) }; }   // v27: blue = the map's team A end (works for diagonal maps)
  const x = (x1 - x0) >= (z1 - z0); return { ax: x ? 1 : 0, az: x ? 0 : 1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, h: Math.max(4, (x ? x1 - x0 : z1 - z0) / 2) };
}
function dmHomes(pool, a) {                                                       // v42 team DM: the spawn area of each team = the ground spots nearest its base
  const T = map.teamSpawns, ground = pool.filter(p => p.y <= 2), out = {};
  for (const side of [-1, 1]) {
    const at = T ? (side < 0 ? T.A : T.B) : V(a.cx + a.ax * a.h * 0.9 * side, 0, a.cz + a.az * a.h * 0.9 * side);
    const pts = ground.map(p => [p, Math.hypot(p.x - at.x, p.z - at.z)]).sort((x, y) => x[1] - y[1]);
    out[side] = pts.filter(([, d], i) => i < 12 && (d < 16 || i < 6)).map(([p]) => p);
  }
  return out;
}
function dmSpot(far, viewers, others, hardAll, side = 0) {                               // side: team DM home half (-1 blue, +1 red)                                          // spawn scoring: never in sight, 18-40 m from the threat, no clumping, no repeats
  const pool = DM.pool?.length ? DM.pool : map.guards;
  const home = side && DM.home?.[side];
  if (home?.length) {                                                              // v42 team DM: each team (re)spawns only in its own base area
    let best = home[0], bs = -Infinity;
    for (const p of home) {
      let sc = Math.random() * 3;
      if (others) for (const o of others) if (o.distanceTo(p) < 2.5) { sc -= 40; break; }       // don't stack on a team-mate
      for (const q of far) if (q.distanceTo(p) < 8) { sc -= 30; break; }                       // an enemy is camping this corner of the base
      for (const r of DM.recent) if (r.t > elapsed - 4 && Math.abs(r.x - p.x) < 2 && Math.abs(r.z - p.z) < 2) { sc -= 10; break; }
      if (sc > bs) { bs = sc; best = p; }
    }
    const r = DM.recent[DM.recentI = (DM.recentI + 1) % DM.recent.length]; r.x = best.x; r.z = best.z; r.t = elapsed;
    return best.clone();
  }
  if (!RC.dmSpawnScore) {
    let best = null, bd = -1;
    for (let i = 0; i < 8; i++) { const p = pool[(Math.random() * pool.length) | 0]; let d = Infinity; for (const q of far) d = Math.min(d, q.distanceTo(p)); if (d > bd) { bd = d; best = p; } }
    return best.clone();
  }
  let best = null, bs = -Infinity;
  for (let i = 0; i < 24; i++) {
    const p = pool[(Math.random() * pool.length) | 0]; let sc = Math.random() * 2;
    let d = Infinity; for (const q of far) d = Math.min(d, q.distanceTo(p)); if (d === Infinity) d = 30;   // nobody alive yet: any distance is fine
    sc += d < 9.5 ? -20 : d < 18 ? -(18 - d) * 1.2 : d > 40 ? -(d - 40) * 0.3 : 6;
    if (others) for (const o of others) { const od = o.distanceTo(p); if (od < 14) { sc -= 90 - od * 3; break; } }
    if (side && DM.side) { const a = DM.side; sc += clamp((((p.x - a.cx) * a.ax + (p.z - a.cz) * a.az) * side) / a.h, -1, 1) * 8; }
    if (p.y > 2) sc -= 100;                                                        // ground level only (the terrace was a spawn trap)   // keep roofs/terraces rare
    for (const r of DM.recent) if (r.t > elapsed - 10 && Math.abs(r.x - p.x) < 6 && Math.abs(r.z - p.z) < 6) { sc -= 8; break; }
    if (DM.deathPos && elapsed - DM.deathT < 7 && DM.deathPos.distanceTo(p) < 10) sc -= 8 * (1 - (elapsed - DM.deathT) / 7);
    if (viewers) { _spH.copy(p).y += 1.5; for (let vi = 0; vi < viewers.length; vi++) { const v = viewers[vi]; _spE.copy(v).y += 1.5; if (_spE.distanceTo(_spH) < 45 && world.lineClear(_spE, _spH)) { sc -= hardAll || vi === 0 ? 300 : 40; break; } } }   // in the first viewer's sight: never; others: discouraged
    if (sc > bs) { bs = sc; best = p; }
  }
  if (!best) best = pool[(Math.random() * pool.length) | 0] || map.spawns.default || player.pos;   // never null (crash seen 7x in v17-v20)
  const r = DM.recent[DM.recentI = (DM.recentI + 1) % DM.recent.length]; r.x = best.x; r.z = best.z; r.t = elapsed;
  return best.clone();
}
function dmBot(ident) {
  const types = mission.roster.filter(t => t !== 'warden' && t !== 'turret' && t !== 'drone');
  const type = ident?.type || types[(Math.random() * types.length) | 0];
  const ally = !!ident?.ally, live = a => a.filter(o => o.alive).map(o => o.pos);
  const others = live(enemies);
  let p;
  if (!DM.tdm) p = dmSpot([player.pos, ...others], [player.pos, ...others], others);
  else if (ally) { const foes = live(enemies), mates = live(allies); p = dmSpot(foes, foes, mates.length ? mates : null, false, -1); }
  else { const foes = [player.pos, ...live(allies)]; p = dmSpot(foes, foes, others.length ? others : null, false, 1); } if (world.overlaps(p, 0.4, 1.8)) { const n = world.nearestNode(p); if (n) p = n.pos.clone(); }
  DM.nameI = (DM.nameI || 0) + 1; const skin = botAssets(type, ident ? ident.i : DM.nameI);
  const e = new Enemy(type, skin || A.enemies[type], p, { yaw: rand(-Math.PI, Math.PI) }); scene.add(e.root); e.skin = !!skin;
  if (ally) { e.ally = true; e.abCD = 1e9; allies.push(e); } else enemies.push(e);   // allies: no abilities (their flashes/smokes would hit the player)
  e.hp = 100; e.root.scale.setScalar(RC.dmBotScale);                          // same 100 HP as the player; drawn bigger so they read at range
  if (ident) { ident.type = type; ident.e = e; e.ident = ident; e.callsign = ident.name; e.jumper = ident.jumper; if (ident.nid) e.nid = ident.nid; }
  else e.callsign = CALLSIGNS[DM.nameI % CALLSIGNS.length];
  toonify(e.root, { rim: ally ? 0x6ab8ff : 0xff6a5a }); outline(e.root, { thick: 0.025, color: ally ? 0x2f9bff : 0xff2a3a, force: true }); nameTag(e);   // v27.1: clean team outline (the additive glow hull looked blobby)
  if (ally) { const f = ffaRival(e); if (f) { e.alert(f.pos, 1); if (!e.T.static) e.goTo(spreadGoal(e, f.pos), G); } return; }
  if (NET.on) { const f = ffaRival(e); if (f) { e.alert(f.pos, 1); if (!e.T.static) e.goTo(spreadGoal(e, f.pos), G); } return; }
  const r = G.ignorePlayer || Math.random() >= 0.5 || (DM.tdm && Math.random() < 0.3) ? ffaRival(e) : null; e.alert(r ? r.pos : player.pos, 1); if (!e.T.static) e.goTo(r ? r.pos : player.pos, G);
}
function nameTag(e) {                                                              // small red callsign above Deathmatch bots (one canvas sprite per bot)
  const c = document.createElement('canvas'); c.width = 256; c.height = 48; const x = c.getContext('2d');
  x.font = 'italic 700 30px Oswald, Impact, sans-serif'; x.textAlign = 'center'; x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.75)'; x.fillStyle = e.ally ? '#6ab8ff' : '#ff5a5a';
  x.strokeText(e.callsign, 128, 34); x.fillText(e.callsign, 128, 34);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: true, transparent: true }));
  sp.scale.set(1.3, 0.24, 1); sp.position.y = (e.A.height || 1.8) + 0.35; sp.renderOrder = 5; e.root.add(sp); e.tag = sp;
}
function dmSetup() {
  for (const d of devices) d.g.visible = false;
  map.points = []; clock = RC.dmTime;
  for (const e of enemies) scene.remove(e.root); enemies = []; clearAllies();
  if (NET.on) { netSetup(); return; }
  DM.br = false; brClear(); document.body.classList.remove('br');
  DM.tdm = teamsOn(); DM.score = { A: 0, B: 0 }; DM.hits = []; SS.ssA = null; document.body.classList.toggle('teams', DM.tdm);
  DM.gun = !DM.tdm && gunOn(); DM.hill = DM.tdm && hillOn(); DM.target = DM.gun ? GUN_LADDER.length : DM.hill ? RC.hillScore : dmGoal(dmLevel); DM.level = dmLevel; DM.gunI = 0;
  { const n = Number(store.get('sz_dm_played', 0)) || 0; DM.grace = n < RC.dmGraceMatches; DM.graceN = n; DM.walk = DM.grace && RC.dmFirstFoe !== false ? 0 : -1; DM.ease = Math.min(RC.dmEaseMax, RC.dmEaseStep * (Number(store.get('sz_dm_losses', 0)) || 0)); store.set('sz_dm_played', n + 1); if (DM.grace) track('dm', { k: 'grace', n }); }   // new players: first matches are gentler
  Object.assign(DM, { rampage: false, alive0: 0, coins: 0, d: 0, streak: 0, best: 0, k0: stats.kills, spawnT: 0, deadT: 0, lastK: -9, multi: 0, uavT: 0, odT: 0, hitT: 0, final: false });
  DM.pool = dmPool(); DM.recent = Array.from({ length: 10 }, () => ({ x: 0, z: 0, t: -99 })); DM.recentI = 0;
  const names = CALLSIGNS.slice().sort(() => Math.random() - 0.5);
  const team = touch ? RC.tdmTeamTouch : RC.tdmTeam, nB = DM.tdm ? team : RC.dmBots, nA = DM.tdm ? team - 1 : 0;   // team DM: you + (team-1) allies vs team
  DM.pool = DM.pool.length ? DM.pool : map.guards.map(g => g.clone()); DM.side = DM.tdm ? dmSides(DM.pool) : null; DM.home = DM.tdm ? dmHomes(DM.pool, DM.side) : null;
  DM.roster = Array.from({ length: nA + nB }, (_, i) => ({ i, name: names[i % names.length], k: 0, d: 0, e: null, respT: null, type: null, jumper: Math.random() < 0.5, ally: i >= nB }));
  if (DM.tdm) { player.pos.copy(dmSpot([], null, null, false, -1)); player.vel.set(0, 0, 0); faceFoe(); }   // start on the blue side
  for (const r of DM.roster) dmBot(r);
  if (DM.gun) gunStep(0, true);
  if (DM.hill) hillSetup();
  DM.boardDirty = true;
}
// v37 first 15 seconds: in a new player's first matches one red bot runs, unaware, to a spot in plain view ahead of
// the player a few seconds in, so the first kill comes early. Bots still ignore the player during the calm window.
function firstFoe(dt) {
  const W2 = DM.walk;
  if (W2 === 0) {
    if (elapsed < 3 || !player.alive) return;
    const eye = _spE.copy(player.pos); eye.y += CFG.eye; let spot = null;
    for (const d of [13, 10, 7]) { _spH.set(eye.x - Math.sin(player.yaw) * d, eye.y, eye.z - Math.cos(player.yaw) * d);
      if (!world.lineClear(eye, _spH)) continue; const n = world.nearestNode(_spH); if (!n) continue;
      _spG.copy(n.pos); _spG.y += 1.4; if (Math.abs(n.pos.y - player.pos.y) < 1.5 && world.lineClear(eye, _spG)) { spot = n.pos.clone(); break; } }
    let best = null, bd = Infinity;
    if (spot) for (const e of enemies) { if (!e.alive || e.T.static || e.type === 'sniper') continue; const d = e.pos.distanceToSquared(spot); if (d < bd && d > 16) { bd = d; best = e; } }
    if (!best || bd > 40 * 40) { DM.walk = -1; DM.walkLog = { why: spot ? 'nobot' : 'nospot' }; return; }
    best.task = { pos: spot, t: 0, firstFoe: 1, warned: true }; best.state = 'patrol'; best.target = null;
    DM.walk = { e: best, spot, t: 0 }; track('dm', { k: 'firstFoe', d: Math.round(Math.sqrt(bd)) });
    return;
  }
  const w = W2, e = w.e; w.t += dt;
  // arrived, hurt, or 12 s gone: it becomes a normal bot again, patrolling where the player can see it
  if (!e.alive || e.lastHurtT < 0.3 || w.t > 12 || e.pos.distanceTo(w.spot) < 1.6) { DM.walkLog = { t: +w.t.toFixed(1), why: !e.alive ? 'dead' : e.lastHurtT < 0.3 ? 'hurt' : w.t > 12 ? 'timeout' : 'arrived' }; if (e.task?.firstFoe) e.task = null; e.post = w.spot; e.path = null; DM.walk = -1; }
}
function faceFoe() {                                                              // (re)spawn looking toward the enemy side / centre, not into a wall
  const T = map.teamSpawns, b = map.bounds, t = DM.tdm && T ? T.B : V((b.min.x + b.max.x) / 2, 0, (b.min.z + b.max.z) / 2);
  const fy = Math.atan2(-(t.x - player.pos.x), -(t.z - player.pos.z)); player.pitch = 0;
  _spE.copy(player.pos).y += CFG.eye; let by = fy, bs = -Infinity;                  // v30.1: look down the most open line near the foe side, never into a wall (SZ-03)
  for (let i = 0; i < 16; i++) {
    const yaw = fy + (i - 8) / 16 * Math.PI * 2; let free = 0;
    for (const d of [3, 6, 10, 15, 22]) { _spH.set(_spE.x - Math.sin(yaw) * d, _spE.y, _spE.z - Math.cos(yaw) * d); if (!world.lineClear(_spE, _spH)) break; free = d; }
    const sc = free + Math.cos(yaw - fy) * 6 + (free >= 10 ? 8 : 0); if (sc > bs) { bs = sc; by = yaw; }   // strongly prefer 10 m+ of open view
  }
  player.yaw = by;
}
function spreadGoal(e, to) {                                                    // v29: bots fan out instead of all running to the same spot
  const pool = DM.pool; if (pool?.length && Math.random() < 0.23) return pool[(Math.random() * pool.length) | 0];   // v29.1: spread cut 35%
  const a = Math.random() * Math.PI * 2, r = 2.6 + Math.random() * 4.55, g = _spG.set(to.x + Math.cos(a) * r, to.y, to.z + Math.sin(a) * r);
  const n = world.nearestNode(g); return n ? n.pos : to;
}
const _spG = new THREE.Vector3();
function clearAllies() { for (const e of allies) { scene.remove(e.root); if (e.tag) { e.tag.material.map.dispose(); e.tag.material.dispose(); } } allies = []; }
// ---------- Hold the Hill: one zone near the middle of the arena; a team scores while it alone stands in it ----------
const _hc = new THREE.Vector3();
function hillSetup() {
  const pool = DM.pool && DM.pool.length ? DM.pool : map.guards; _hc.set(0, 0, 0); for (const p of pool) _hc.add(p); _hc.divideScalar(Math.max(1, pool.length));
  let best = pool[0], bd = Infinity; for (const p of pool) { const d = (p.x - _hc.x) ** 2 + (p.z - _hc.z) ** 2; if (d < bd) { bd = d; best = p; } }
  DM.hillPos = best.clone(); DM.hillOwner = ''; DM.hillT = 0; DM.hillAcc = { A: 0, B: 0 }; DM.inHill = false;
  const R = RC.hillRadius, g = new THREE.Group();
  const ringM = new THREE.MeshBasicMaterial({ color: 0xffd23b, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.35, R, 48), ringM); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
  const colM = new THREE.MeshBasicMaterial({ color: 0xffd23b, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const col = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 7, 40, 1, true), colM); col.position.y = 3.5;
  g.add(ring, col); g.position.copy(DM.hillPos); scene.add(g); DM.hillFx = { g, ringM, colM };
}
const inHill = p => { const h = DM.hillPos, R = RC.hillRadius; return (p.x - h.x) ** 2 + (p.z - h.z) ** 2 < R * R && Math.abs(p.y - h.y) < 3; };
function hillTick(dt) {
  if (!DM.hillPos || matchOver) return;
  let a = 0, b = 0; DM.inHill = player.alive && inHill(player.pos); if (DM.inHill) a++;
  for (const e of allies) if (e.alive && inHill(e.pos)) a++;
  for (const e of enemies) if (e.alive && inHill(e.pos)) b++;
  const own = NET.on ? netHillOwn() : a && !b ? 'A' : b && !a ? 'B' : a && b ? 'X' : '';
  if (own !== DM.hillOwner) {
    if (own === 'A') { FX.announce('HILL TAKEN', 'start'); sfx.done?.(); } else if (own === 'B') FX.announce('ENEMY ON THE HILL', 'objective'); else if (own === 'X') FX.announce('HILL CONTESTED', 'objective');
    DM.hillOwner = own; const c = own === 'A' ? 0x2a5cf0 : own === 'B' ? 0xdc2a34 : own === 'X' ? 0xffffff : 0xffd23b; DM.hillFx.ringM.color.setHex(c); DM.hillFx.colM.color.setHex(c);
  }
  if (own === 'A' || own === 'B') {
    DM.hillAcc[own] += dt * RC.hillRate; if (own === 'A' && DM.inHill) { DM.hillT = (DM.hillT || 0) + dt; matchXP.hill = Math.floor(DM.hillT * 2); }
    if (NET.on) return;                                                            // online: the server scores the hill
    while (DM.hillAcc[own] >= 1) { DM.hillAcc[own] -= 1; DM.score[own]++; DM.boardDirty = true; if (DM.score[own] >= dmTarget()) { dmEnd(own === 'A'); return; } }
  }
}
function dmTick(dt) {
  const k = stats.kills - DM.k0;
  if (!DM.tdm && !DM.br && k >= dmTarget()) { dmEnd(true); return ''; }
  if (DM.br) brTick(dt);
  if (DM.br && !player.alive) { killCam(dt); if (DM.boardDirty) dmBoard(); return `ELIMINATED · #${BR.place || '?'}`; }
  if (!player.alive) {                                                          // respawn away from the bots, short spawn protection
    if ((DM.deadT -= dt) <= 0) {
      const live = enemies.filter(e => e.alive).map(e => e.pos), p = dmSpot(live, live, DM.tdm ? null : live, true, DM.tdm ? -1 : 0); player.pos.copy(p); player.vel.set(0, 0, 0);
      player.hp = 100; player.alive = true; invT = 2.5; DM.hits = []; faceFoe(); if (NET.on) netSpawned(); hurtK = 0; FX.announce('BACK IN', 'start'); sfx.respawn(); dmApplyLoadout(); DM.alive0 = elapsed; DM.rampage = false;
      for (const e of enemies) if (e.alive) e.alert(player.pos, 0.6);
    }
    if ($('dcard').classList.contains('show')) { const t = Math.max(0, Math.ceil(DM.deadT)); if (t !== DM.dcT) { DM.dcT = t; $('dcGo').textContent = dcGoTxt(t); } }
    killCam(dt); return 'RESPAWNING…';
  }
  DM.uavT -= dt; DM.odT -= dt;
  { const quiet = elapsed - Math.max(DM.lastK, DM.alive0 || 0);                 // stalling: no kill for a while -> the bots go on a rampage
    if (!NET.on && !DM.rampage && quiet > RC.dmStall * (DM.grace ? 1.5 : 1)) { DM.rampage = true; FX.announce('BOTS ON A RAMPAGE', 'objective'); sfx.alarm?.(); for (const e of enemies) if (e.alive) { e.alert(player.pos, 1); if (!e.T.static) e.goTo(DM.tdm ? spreadGoal(e, player.pos) : player.pos, G); } track('dm', { k: 'rampage', t: Math.round(elapsed) }); }
    if (DM.rampage) { director.set(director.threat + 0.01 * dt * 10); if (Math.random() < dt * 0.8) for (const e of enemies) if (e.alive && e.state !== 'combat') { e.alert(player.pos, 1); e.goTo(DM.tdm ? spreadGoal(e, player.pos) : player.pos, G); } } }
  if (DM.walk != null && DM.walk !== -1) firstFoe(dt);
  if (DM.hill) hillTick(dt);
  if (RC.dmInfiniteAmmo) for (const id of W.slots) { const s = W.state[id]; if (s && s.reserve < 999) s.reserve = 999; }   // reloads never run dry
  if (DM.uavT > 0) for (const e of enemies) if (e.alive) e.revealT = 0.5;
  if (!DM.final && clock < 30) { DM.final = true; FX.announce('FINAL 30 SECONDS', 'start'); }
  for (const r of DM.roster) {                                                  // every bot is a persistent player: dies, waits, respawns somewhere new
    if (r.e && r.e.alive) continue;
    if (DM.br) continue;                                                        // battle royale: one life for bots too
    if (r.respT === null) { r.respT = 2.5; continue; }
    if ((r.respT -= dt) <= 0) { r.respT = null; dmBot(r); if (NET.on && r.nid && r.e) NET.send({ t: 'br', id: r.nid, p: [+r.e.pos.x.toFixed(2), +r.e.pos.y.toFixed(2), +r.e.pos.z.toFixed(2)] }); }
  }
  if (DM.boardDirty) dmBoard();
  {
    if (allies.length > 12) { const dead = allies.filter(e => !e.alive).slice(0, allies.length - 8); for (const e of dead) { scene.remove(e.root); if (e.tag) { e.tag.material.map.dispose(); e.tag.material.dispose(); } } allies = allies.filter(e => !dead.includes(e)); }
    if (enemies.length > RC.dmBots * 3) { const dead = enemies.filter(e => !e.alive).slice(0, enemies.length - RC.dmBots * 2); for (const e of dead) { scene.remove(e.root); if (e.tag) { e.tag.material.map.dispose(); e.tag.material.dispose(); } } enemies = enemies.filter(e => !dead.includes(e)); }
  }
  for (const e of allies) if (e.alive && !e.net && e.state !== 'combat' && Math.random() < dt * 0.35 && !e.T.static) { if (DM.hill && Math.random() < RC.hillBotBias) { e.goTo(spreadGoal(e, DM.hillPos), G); continue; } const f = ffaRival(e); if (f) { e.alert(f.pos, 0.5); e.goTo(spreadGoal(e, f.pos), G); } }   // allies push toward the nearest enemy
  for (const e of enemies) if (e.alive && !e.net && e.state !== 'combat' && !(e.loot && !e.loot.taken) && Math.random() < dt * 0.25 && !e.T.static) { if (DM.hill && Math.random() < RC.hillBotBias) { e.alert(DM.hillPos, 0.5); e.goTo(spreadGoal(e, DM.hillPos), G); continue; } const calm = G.ignorePlayer, r = calm || NET.on || Math.random() < 0.5 ? ffaRival(e) : null, to = r ? r.pos : player.pos; if (calm && !r) continue; e.alert(to, 0.5); e.goTo(DM.tdm ? spreadGoal(e, to) : to, G); }   // bots hunt the player or a rival
  return '';
}
function dmDeath() { DM.deathPos = player.pos.clone(); DM.deathT = elapsed; DM.d++; DM.streak = 0; DM.deadT = RC.deathCard ? Math.max(RC.dmRespawn, 1.5) : RC.dmRespawn; player.alive = false; if (RC.deathCard) deathCard(); else FX.announce('ELIMINATED', 'objective'); }
// Gun Run ladder: every kill moves you to the next gun; a kill with the last one wins
const GUN_LADDER = ['ar7_lance', 'kestrel_bp', 'grinder_lmg', 'warden_br', 'hailstorm_mg', 'bulldog_r6', 'longshot_bolt', 'javelin_amr', 'harrow_45', 'vex_p9'];
function gunStep(i, quiet) {
  const id = GUN_LADDER[Math.min(i, GUN_LADDER.length - 1)]; DM.gunI = i;
  W.slots = [id, id === 'vex_p9' ? 'harrow_45' : 'vex_p9']; for (const w of W.slots) if (!W.state[w]) W.state[w] = { mag: WEAPONS[w].mag, reserve: META.reserveFor(w, WEAPONS[w].reserve) };
  W.state[id].mag = WEAPONS[id].mag; equip(0, true);
  if (!quiet) FX.announce(i === GUN_LADDER.length - 1 ? 'FINAL GUN' : `GUN ${i + 1}/${GUN_LADDER.length}`, 'start');
}
const DM_LOADOUTS = [['ASSAULT', 'ar7_lance', 'vex_p9'], ['HEAVY', 'hailstorm_mg', 'vex_p9'], ['MARKSMAN', 'longshot_bolt', 'harrow_45'], ['RUSH', 'kestrel_bp', 'bulldog_r6']];
const CALLSIGNS = ['VIPER', 'ROOK', 'GHOST', 'NOMAD', 'HEX', 'BRAVO_7', 'KILO', 'RAZOR', 'SABLE', 'ONYX', 'WRAITH', 'JINX'];
const dcOk = p => DEBUG || p === 'ar7_lance' || p === W.slots[0] || META.unlocked(progress).weapons.has(p);
function deathCard() {
  const e = LS.byE;
  $('dcWho').textContent = e?.callsign || (e ? ENEMY_TYPES[e.type].name.toUpperCase() : 'UNKNOWN');
  $('dcHow').textContent = e ? `${(e.S.cls || 'rifle').toUpperCase()} · ${Math.round(e.pos.distanceTo(player.pos))} M` : '';
  if (DM.grace && DM.d <= 2) { const k = stats.kills - DM.k0; $('dcHow').textContent = DM.tdm ? `Your team ${DM.score.A} · Red ${DM.score.B}. First team to ${dmTarget()} wins!` : k > 0 ? `You have ${k} kill${k > 1 ? 's' : ''}. Keep going: first to ${dmTarget()} wins!` : `Everyone respawns. First to ${dmTarget()} kills wins!`; }
  const cur = W.slots[0], el = $('dcLo'); el.innerHTML = '';
  DM_LOADOUTS.forEach(([name, p], i) => {
    if (!dcOk(p) || DM.gun) return;
    const b = document.createElement('button'); b.className = p === (DM.next?.[0] || cur) ? 'on' : ''; b.dataset.i = i;
    b.innerHTML = `<img src="${A.icons[p] || ''}" alt=""><span>${touch ? '' : `<kbd>${i + 1}</kbd>`}${name}<em>${WEAPONS[p].name.toUpperCase()}</em></span>${p !== cur ? '<small>+15 XP</small>' : ''}`;
    b.onclick = () => dcPick(i); el.append(b);
  });
  DM.dcT = -1; dcFill(); $('dcGo').textContent = dcGoTxt(Math.ceil(DM.deadT));
  $('dcard').classList.add('show');
}
const dcGoTxt = t => (touch ? 'TAP ANYWHERE TO RESPAWN' : 'CLICK ANYWHERE OR PRESS SPACE TO RESPAWN') + (t > 0 ? ` · ${t}` : '');
function dcPick(i) {
  const L = DM_LOADOUTS[i]; if (!L || !dcOk(L[1])) return;
  DM.next = [L[1], L[2]]; for (const b of $('dcLo').children) b.classList.toggle('on', +b.dataset.i === i); track('dcard', { k: 'loadout', w: L[1] });
}
function dcRespawnNow() { if (!$('dcard').classList.contains('show') || elapsed - DM.deathT < 0.6) return; DM.deadT = 0; track('dcard', { k: 'now' }); }
function dmApplyLoadout() {                                                        // swap weapons on respawn (death card choice)
  const n = DM.next; DM.next = null; $('dcard').classList.remove('show');
  if (DM.gun) return;                                                            // Gun Run: the ladder picks your gun
  if (!n || n[0] === W.slots[0]) return; matchXP.swap = (matchXP.swap || 0) + 15;
  W.slots = [n[0], n[1]]; for (const id of W.slots) if (!W.state[id]) W.state[id] = { mag: WEAPONS[id].mag, reserve: META.reserveFor(id, WEAPONS[id].reserve) };
  equip(0, true);
}
function dmRows() {                                                                // scoreboard rows: you + every bot, most kills first (ties: you first)
  if (NET.on) return netRows();
  const rows = [{ name: 'YOU', k: stats.kills - DM.k0, d: DM.d, me: true }].concat((DM.roster || []).map(r => ({ name: r.name, k: r.k, d: r.d })));
  return rows.sort((a, b) => b.k - a.k || (b.me ? 1 : 0) - (a.me ? 1 : 0));
}
function dmBoard() {
  DM.boardDirty = false; const el = $('dmBoard'); if (!el) return;
  if (DM.br) { brBoard(el); return; }
  if (DM.tdm) { el.innerHTML = `<div class="tA"><span>BLUE</span><b>${DM.score.A}</b></div><div class="tB"><span>RED</span><b>${DM.score.B}</b></div><div class="me"><span>YOU</span><b>${stats.kills - DM.k0}</b></div><div class="tg"><span>FIRST TO</span><b>${dmTarget()}</b></div>`; return; }
  const rows = dmRows(), top = rows.slice(0, 4); if (!top.some(r => r.me)) top[3] = rows.find(r => r.me);
  el.innerHTML = top.map(r => `<div class="${r.me ? 'me' : ''}"><span>${rows.indexOf(r) + 1}. ${r.name}</span><b>${r.k}</b></div>`).join('');
}
function dmEnd(won) {
  if (matchOver) return; endMatch();
  if (DM.tdm) { won = DM.score.A > DM.score.B; DM.draw = DM.score.A === DM.score.B; }
  else if (DM.br) { DM.place = BR.place || 1; DM.nRows = NET.ents.size; const w = [...NET.ents.values()].find(e => e.alive && e.id !== NET.me); DM.winner = won ? 'YOU' : (w?.name || 'THE ZONE'); }
  else { const rows = dmRows(); won = rows[0].me && rows[0].k > 0; DM.place = rows.findIndex(r => r.me) + 1; DM.winner = rows[0].name; DM.nRows = rows.length; }
  music.end(won);
  const k = stats.kills - DM.k0, best = store.get('sz_dm_best', 0), rec = k > best; if (rec) store.set('sz_dm_best', k);
  const dmC = Math.round(DM.coins || k * RC.dmCoinsPerKill); META.profile.coins += dmC; matchCoins = dmC; META.saveProfile(); if (won) crazy.happy();
  track('dm_end', { won, k, d: DM.d, t: Math.round(elapsed), best: DM.best, m: mission.id, ...(DM.tdm ? { tA: DM.score.A, tB: DM.score.B } : {}) });
  const tier = k >= 30 ? 'LEGEND' : k >= 22 ? 'PLATINUM' : k >= 15 ? 'GOLD' : k >= 8 ? 'SILVER' : 'BRONZE';
  questP('finish'); if (won) questP('win'); if (k >= 15) questP('rank');
  store.set('sz_dm_losses', won ? 0 : (Number(store.get('sz_dm_losses', 0)) || 0) + 1);   // v29.7: each loss in a row eases the next match a bit
  const lvl = dmLevel; if (won && !NET.on) { dmLevel++; store.set('sz_dm_level', dmLevel); META.profile.upPoints++; META.saveProfile(); } track('dm', { k: 'level', l: lvl, won });
  $('end').classList.add('dm'); $('rankBadge').dataset.t = tier; $('rankBadge').textContent = DM.br ? (won ? 'LAST ONE STANDING · #1' : `#${DM.place} OF ${DM.nRows}`) : won ? `LEVEL ${lvl} CLEARED · ${tier}` : DM.tdm ? (DM.draw ? `DRAW ${DM.score.A}–${DM.score.B}` : `RED TEAM WINS ${DM.score.B}–${DM.score.A}`) : `#${DM.place} · ${DM.winner} WINS`;
  $('tK').textContent = k; $('tKD').textContent = (k / Math.max(1, DM.d)).toFixed(1); $('tSt').textContent = DM.best; $('tC').textContent = dmC;
  $('beatBest').textContent = rec ? '★ NEW PERSONAL BEST ★' : `${best - k + 1} more kill${best - k ? 's' : ''} to beat your best (${best})`; $('beatBest').classList.toggle('rec', rec);
  const stand = DM.tdm ? `BLUE ${DM.score.A}  ·  RED ${DM.score.B}` : dmRows().slice(0, 4).map((r, i) => `${i + 1}. ${r.name} ${r.k}`).join('  ·  ');
  showEnd(DM.br ? (won ? 'VICTORY · LAST ONE STANDING' : `ELIMINATED · #${DM.place} OF ${DM.nRows}`) : won ? `VICTORY · LEVEL ${lvl}` : DM.tdm ? (DM.draw ? `DRAW · ${tier} RANK` : `DEFEAT · RED TEAM WINS · ${tier} RANK`) : `DEFEAT · #${DM.place} OF ${DM.nRows} · ${tier} RANK`, `${stand}\n${k} KILLS · ${DM.d} deaths · K/D ${(k / Math.max(1, DM.d)).toFixed(1)} · best streak ${DM.best}\n+${dmC} ◎ · peak threat ${Math.round(director.peak * 7)}` + (rec ? '\n\n★ NEW PERSONAL BEST ★' : `\n\n${best - k + 1} more kill${best - k ? 's' : ''} to beat your best (${best})`), null, { failed: true });
  const againLbl = won ? `▶ NEXT LEVEL ${dmLevel} · ${DM.hill ? 'HOLD THE HILL' : DM.gun ? GUN_LADDER.length + ' GUNS' : dmGoal(dmLevel) + (DM.tdm ? ' TEAM' : '') + ' KILLS'}` : `↻ RETRY LEVEL ${dmLevel} (REMATCH)`;
  $('again').textContent = againLbl; $('again').className = 'go';
  if (!won) $('upBox').style.display = 'none';                                   // weapon upgrades are a victory reward
  if (NET.on && DM.br && !won) { $('again').textContent = '▶ PLAY AGAIN · NEW MATCH'; $('again').className = 'go'; return; }
  if (NET.on) { netEndScreen(); return; }
  if (!TEST) {                                                                  // one more match: auto rematch unless the player touches the end screen
    let n = RC.dmRematch + 1; const tick = () => { if (--n <= 0) { clearInterval(autoNextT); $('again').click(); } else $('again').textContent = `${againLbl} (${n})`; };
    clearInterval(autoNextT); tick(); autoNextT = setInterval(tick, 1000);
    const stop = e => { if (!e.target.closest?.('button,input,a') || e.target.id === 'again' || e.target.id === 'endMore') return; clearInterval(autoNextT); $('again').textContent = againLbl; $('end').removeEventListener('pointerdown', stop); };
    $('end').removeEventListener('pointerdown', dmEnd.stop); dmEnd.stop = stop; $('end').addEventListener('pointerdown', stop);   // v30: only pressing another button stops the rematch countdown (a scroll or stray tap no longer does)
  }
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
    sfx.flash(d.pos.distanceTo(player.pos));
    const eye = camera.getWorldPosition(V()), to = d.pos.clone().sub(eye), dist = to.length(), look = V(); camera.getWorldDirection(look);
    if (dist < d.radius && world.lineClear(eye, d.pos)) flashK = Math.max(flashK, clamp(0.35 + look.dot(to.normalize()), 0.15, 1) * (1 - dist / d.radius * 0.5));
  }
}

// ---------- abilities ----------
function chosenAbilities() { const saved = loadout.abilities[mission?.id]; return saved && saved.length === 2 ? saved : mission.pool.slice(0, 2); }
function useAbility(slot) {
  const kind = picks[slot]; if (!kind || !running || abilityCD[slot] > 0 || !player.alive) return false;
  abilityCD[slot] = ABILITIES[kind].cd; sfx.ability(kind); LS.ab++;
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
    sfx.flash(20);
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
  sfx.boom(player.pos.distanceTo(p), panOf(p.x, p.z)); shakeK = Math.max(shakeK, clamp(1 - player.pos.distanceTo(p) / 30, 0, 1));
  for (let i = 0; i < 7; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex(), color: i % 2 ? 0xffa040 : 0xffe080, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.position.copy(p).add(V(rand(-1, 1), rand(-0.5, 1.2), rand(-1, 1))); sp.scale.setScalar(rand(2, 3.6)); sp.userData.t = 0.35; sp.userData.spark = true; scene.add(sp); impacts.push(sp); }
  for (const e of enemies) {
    if (!e.alive) continue; const d = e.pos.clone().add(V(0, 1, 0)).distanceTo(p);
    if (d < r && NET.on) { if (e.nid) NET.hit(NET.me, e.nid, dmg * (1 - d / r * 0.6), false, 'blast'); }   // online: blast damage is checked by the server too
    else if (d < r) { const killed = e.damage(dmg * (1 - d / r * 0.6), p.clone()); if (killed) { stats.kills++; killTick(false, e); matchXP.kills += META.XP.kill; feed(`VOSS ▸ ${ENEMY_TYPES[e.type].name.toUpperCase()} · ${label}`, false); } }
    if (d < 30) e.alert(p, 1);
  }
  const pd = player.pos.clone().add(V(0, 1, 0)).distanceTo(p);
  if (pd < r && !NET.on && world.lineClear(p, player.pos.clone().add(V(0, 1.4, 0)))) damagePlayer(dmg * 0.45 * (1 - pd / r), p);
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
  const vy0 = player.vel.y, air0 = !player.onGround;
  world.move(player, dt, { step: 0.45, gravity: 22 });
  if (air0 && player.onGround && vy0 < -5) sfx.land(-vy0);
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
  for (const e of ev) e === 'out' ? sfx.magOut(cur()) : e === 'in' ? sfx.magIn(cur()) : sfx.bolt();
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
let musicFinal = false;
function enemySteps() {                                                          // hear bots moving near you (positional, no allocations)
  for (const e of enemies) {
    if (!e.alive || e.T?.static || e.S?.flying) continue;
    const mx = e.pos.x - (e._sx ?? e.pos.x), mz = e.pos.z - (e._sz ?? e.pos.z); e._sx = e.pos.x; e._sz = e.pos.z;
    const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z, d2 = dx * dx + dz * dz, mv = mx * mx + mz * mz;
    if (d2 > 256 || mv < 1e-6 || mv > 4) continue;
    e._st = (e._st ?? Math.random() * 2) - Math.sqrt(mv);
    if (e._st <= 0) { e._st = 2.1; sfx.footstep(Math.sqrt(d2), panOf(e.pos.x, e.pos.z)); }
  }
}
function update(dt) {
  if (!running) return;
  if (firstContactT > 0 && (firstContactT -= dt) <= 0) forceContact();
  if (FEEL.hitStop > 0) { FEEL.hitStop -= dt; dt *= 0.12; }               // lethal headshot: world slows for a beat
  FEEL.punchP *= Math.max(0, 1 - dt * 16); FEEL.punchY *= Math.max(0, 1 - dt * 16);
  FEEL.comboT -= dt; if (FEEL.comboT <= 0) FEEL.combo = 0;
  if (LS.mv < 0 && player.moving) LS.mv = Math.round(elapsed); if (LS.sh < 0 && stats.shots) LS.sh = Math.round(elapsed);
  { const fighting = enemies.some(e => e.alive && e.state === 'combat'); if (fighting && LS.ct < 0) LS.ct = Math.round(elapsed); music.setIntensity(fighting ? 1 : clock < 30 ? 0.7 : 0.25); }
  sfx.health(player.alive ? player.hp / 100 : 0);
  if (clock < 60 && clock > 0 && !musicFinal && mode !== 'survival' && !tutorial) { musicFinal = true; music.final(); }
  if (clock < 10 && clock > 0 && Math.ceil(clock) !== Math.ceil(clock + dt)) sfx.tick(clock < 4);
  enemySteps();
  for (const e of enemies) if (!e.alive && e._dv && e.deadT < 0.45) { e.pos.addScaledVector(e._dv, dt * (1 - e.deadT / 0.45)); }   // death knockback
  for (const e of allies) if (!e.alive && e._dv && e.deadT < 0.45) { e.pos.addScaledVector(e._dv, dt * (1 - e.deadT / 0.45)); }
  const tutHold = !!tutorial?.hold;                                     // tutorial drills: freeze the timer + hostiles
  let areaClear = !mode && enemies.length > 0; if (areaClear) for (const e of enemies) if (e.alive) { areaClear = false; break; }
  if (areaClear && !said.clear) { said.clear = true; FX.announce('AREA CLEAR', 'objective'); radio('OKONKWO', 'Area clear. Timer is off, take your time.', 3); }
  elapsed += dt; if (!tutHold && !areaClear) clock -= dt; repathBudget = 2;      // all hostiles down: the clock stops
  if (clock <= 30 && clock + dt > 30) radioOnce('low');
  if (NET.on && mode === 'dm') clock = Math.max(0.05, NET.clock);                 // online: the server owns the clock and ends the round
  if (clock <= 0) { clock = 0; if (mode === 'dm') dmEnd(false); else lose(mission.failTimer); return; }
  pollInput(dt);
  updatePlayer(dt);
  let prompt = mode === 'survival' ? survivalTick(dt) : mode === 'dm' ? dmTick(dt) : updateObjective(dt); prompt = updateInteract(dt, prompt);
  invT = Math.max(0, invT - dt); shakeK = Math.max(0, shakeK - dt * 2.5); sprayCD = Math.max(0, sprayCD - dt);
  updateWeapon(dt);
  for (let i = 0; i < 2; i++) abilityCD[i] = Math.max(0, abilityCD[i] - dt);
  swingCharm(dt);
  lodTick = (lodTick + 1) % 60;
  const brLod = DM.br && NET.host; if (brLod) brHumans();
  for (const e of enemies) {
    if (e.net) { if (e.alive) netPuppetTick(e, dt); else e.update(dt, G); continue; }
    if (tutHold) { e.tickAnim(dt); e.sync(); continue; }
    const per = !e.alive ? 1 : brLod ? brLodPer(e) : e.state === 'patrol' && e.pos.distanceToSquared(player.pos) > 1600 ? 3 : 1;   // AI level of detail: far bots think less often
    if (per === 1) { if (e._lodAcc) { e.update(e._lodAcc, G); e._lodAcc = 0; } e.update(dt, G); continue; }
    e._lodAcc = (e._lodAcc || 0) + dt; if ((e.id % per) === lodTick % per) { e.update(Math.min(e._lodAcc, 0.05 * per), G); e._lodAcc = 0; }
  }
  for (const e of allies) if (e.net && e.alive) netPuppetTick(e, dt); else e.update(dt, G);
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
    if (mode === 'dm' && DM.hill && DM.hillPos) { if (!DM.inHill) { tgt = DM.hillPos; label = 'HILL'; } }
    else if (objective.extract) { tgt = map.extract; label = 'EXTRACT'; }
    else map.points.forEach((p, i) => { if (objective.done[i] || (mission.objective === 'plant_hold' && objective.planted && i)) return; const d = p.distanceTo(player.pos); if (d < bd) { bd = d; tgt = p; } });
    if (tgt) {                                                           // follow the walkable route (stairs, ladders), not a straight line through walls
      guideTo(tgt, dt); const w = GUIDE.wp || tgt;
      _arrowP.copy(w).y += 1.2; const sp = toScreen(_arrowP); if (sp.behind) { sp.x = innerWidth - sp.x; sp.y = innerHeight; }
      FX.objectiveArrow(sp.x, sp.y, sp.on, label, Math.round(GUIDE.len || tgt.distanceTo(player.pos)));
    } else { GUIDE.path = null; FX.objectiveArrow(null); }   // hide it (inside the hill, or a mode with no objective)
  }
  if (mentor) { mentor.update(dt, MCTX); mfx?.update(dt); }
  if (tutorial?.active) tutorialTick(dt);
  if (running && !matchOver) director.tick(dt, player.hp, elapsed);
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
  else if (kind === 'flash') { sfx.flash(20); for (const e of enemies) if (e.alive && e.eye.distanceTo(d.pos) < d.radius && world.lineClear(e.eye, d.pos)) e.blindT = Math.max(e.blindT, 3.2); }
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
function controlsCard() {                                                            // v13: 4 s controls card in place of the drill
  try { localStorage.setItem('sz_tutorial_done', '1'); } catch { /* blocked */ }
  let el = $('ctlCard'); if (!el) { el = document.createElement('div'); el.id = 'ctlCard'; document.body.appendChild(el); }
  const goal = mode === 'dm' ? (DM.hill ? `Hold the Hill: stand in the zone to score. First team to ${dmTarget()} wins` : DM.tdm ? `Team Deathmatch: first team to ${dmTarget()} kills wins` : DM.gun ? `Gun Run: every kill gives you the next gun. A kill with gun ${dmTarget()} wins` : `Free for all: first to ${dmTarget()} kills wins`) : 'Follow the arrow to the objective';
  el.innerHTML = (touch ? '<b>LEFT STICK</b> move · <b>DRAG</b> aim · <b>FIRE</b> shoot' : '<b>WASD</b> move · <b>MOUSE</b> aim · <b>CLICK</b> shoot · <b>R</b> reload') + '<br>' + goal;
  el.className = 'show'; clearTimeout(controlsCard.t); controlsCard.t = setTimeout(() => el.className = '', 5000);
}
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
  if (lobbyRoom?.on && !running) { if (lobbyRoom.asp !== camera.aspect) { lobbyRoom.asp = camera.aspect; lobbyRoom.frame(camera.aspect); } renderer.render(lobbyRoom.scene, lobbyRoom.cam); return; }
  if (scene) {
    camera.updateMatrixWorld(); _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pv);
    const far2 = camera.far * camera.far;
    for (const e of allies) { _sp.center.set(e.pos.x, e.pos.y + 1, e.pos.z); e.root.visible = (e.alive || e.deadT < 7) && e.pos.distanceToSquared(camera.position) < far2 && _fr.intersectsSphere(_sp); }
    for (const e of enemies) { _sp.center.set(e.pos.x, e.pos.y + 1, e.pos.z); const d2 = e.pos.distanceToSquared(camera.position), lod = qLevel === 0 ? 3025 : 4900; e.root.visible = (e.alive || e.deadT < 7) && d2 < far2 && (d2 < lod || e.revealT > 0 || e.state === 'combat' || e.netShow === true) && _fr.intersectsSphere(_sp);
      if (e.root.visible) { if (e._hand === undefined) e._hand = e.root.getObjectByName('handR') || null; if (e._hand) e._hand.visible = d2 < 900; } }   // guns are a few pixels past 30 m
    if (preview) preview.root.visible = true;
    if (map?.cull && !render.noCull) map.cull(camera.position);                    // BR island: far arenas are not drawn
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
  return HUD = { dm: g('dmBar'), dmK: g('dmK'), dmF: g('dmF'), dmS: g('dmS'), dmP: g('dmP'), obj: g('obj'), prog: g('prog'), timer: g('timer'), hp: g('hp'), hpf: g('hpb').firstElementChild, shb: g('shb'), shf: g('shb').firstElementChild, ammo: g('ammo'), rbar: g('rbar'), rbf: g('rbar').firstElementChild,
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
  if (mode === 'dm') {
    const k = stats.kills - DM.k0; title = `${DM.gun ? 'GUN RUN' : DM.hill ? 'HOLD THE HILL' : 'DEATHMATCH'} · LV ${DM.level || 1}`; prog = `${DM.gun ? `Gun ${Math.min(k + 1, dmTarget())} of` : 'First to'} ${dmTarget()} · deaths ${DM.d}${DM.rampage ? ' · RAMPAGE!' : ''}`;
    sT(H.dmK, String(k)); sS(H.dmF, 'width', `${Math.min(100, k / dmTarget() * 100)}%`);
    sT(H.dmS, DM.streak >= 2 ? `🔥 ${DM.streak}` : ''); sT(H.dmP, DM.odT > 0 ? 'OVERDRIVE' : DM.uavT > 0 ? 'UAV' : '');
  }
  sC(H.dm, 'on', mode === 'dm'); if (mode === 'dm') stripTick();
  if (mode === 'survival') { title = `SURVIVAL · WAVE ${wave}`; prog = `Hostiles left: ${alive} · Best: wave ${survBestV}`; }
  sT(H.obj, title); sT(H.prog, prog);
  sT(H.timer, fmt(mode === 'survival' ? elapsed : clock)); sC(H.timer, 'low', clock < 30);
  // vitals
  sT(H.hp, String(Math.ceil(player.hp))); sS(H.hpf, 'width', `${player.hp}%`);
  sS(H.hpf, 'background', player.hp < 30 ? '#ff5a5a' : '#f4f4f4');
  { const low = player.alive && player.hp < 30; if (low !== hudLow) { hudLow = low; $('vit').classList.toggle('low', low); } }
  sS(H.shb, 'display', player.shield > 0 ? 'block' : 'none'); sS(H.shf, 'width', `${player.shield / 60 * 100}%`);
  // ammo
  const ak = W.reloadT > 0 ? 'R' : `${s.mag}/${s.reserve}`;
  if (H.ammo._k !== ak) { H.ammo._k = ak; H.ammo.innerHTML = W.reloadT > 0 ? 'RELOAD' : `${s.mag} <small>/ ${mode === 'dm' && RC.dmInfiniteAmmo ? '∞' : s.reserve}</small>`; }
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
  sC(H.spot, 'on', spotted > 0 && mode !== 'dm'); sT(H.spot, `SPOTTED BY ${spotted}`);
  // overlays
  sS(H.whiteout, 'opacity', clamp(flashK * 1.4, 0, 1).toFixed(3)); sS(H.hurt, 'opacity', hurtK.toFixed(3)); sS(H.laser, 'opacity', laserK.toFixed(3));
  if (dmgDirs.length || _dmgKey) { const html = dmgDirs.map(d => `<i style="transform:rotate(${(-(d.ang - player.yaw - Math.PI)) * 180 / Math.PI}deg);opacity:${Math.min(1, d.t)}"></i>`).join(''); _dmgKey = html && 'x'; H.dmgdir.innerHTML = html; }
  drawMinimap();
}
function hitMarker(kill, head) { hitmT = kill ? 0.45 : 0.2; $('hitm').className = `ov${kill ? ' kill' : head ? ' head' : ''}`; }
function feed(msg, hs) { const d = document.createElement('div'); d.className = `pnl${hs ? ' hs' : ''}`; const k = msg.includes('▸'); d.innerHTML = `${k ? icon(hs ? 'headshot' : 'skull') : ''}<span></span>`; d.lastChild.textContent = msg.replace(' ✦', ''); $('feed').prepend(d); setTimeout(() => d.remove(), 4000); while ($('feed').children.length > 5) $('feed').lastChild.remove(); }
function radio(who, text, dur) { if (mode === 'dm') return; RADIO.say(who, text, dur); }
function radioOnce(key) { if (mode === 'dm' || !mission.radio[key]) return; RADIO.once(mission.id + ':' + key, mission.radio[key]); }
function questP(kind, n = 1) {                                                   // quest progress + mid-match toast
  if (!RC.quests) return;
  for (const q of QUESTS.progress(kind, n)) { questToast(q); track('quest', { k: 'done', q: q.kind, n: q.n }); }
}
function questToast(q) {
  const d = document.createElement('div'); d.className = 'questToast';
  d.innerHTML = `${icon('check')}<b>QUEST COMPLETE</b><span></span>`; d.lastChild.textContent = `${q.t} · +${q.coins} COINS`;
  document.body.append(d); sfx.coin?.(); setTimeout(() => d.remove(), 3200);
}
function threatChip(reset) {                                                     // HUD 'THREAT n' chip; pulses when the bots adapt
  const el = $('thr'); if (!el) return; const t = director.tier;
  el.firstChild.textContent = 'THREAT ' + t; el.className = reset ? 'ov' : 'ov up'; el.style.display = RC.adaptive ? '' : 'none';
  if (!reset) { void el.offsetWidth; el.className = 'ov up'; }
}
director.onRise = t => { if (running && !matchOver) { threatChip(false); if (t >= 3 && t % 2 === 1) FX.announce('ENEMIES ADAPTING', 'objective'); track('thr', { k: 'up', v: t, m: mission?.id }); } };
function killTick(head, victim) { if (matchOver) return; if (mode === 'dm') { if (victim?.ident) victim.ident.d++; DM.boardDirty = true; if (DM.tdm) tdmScore('A'); if (DM.gun) { const k = stats.kills - DM.k0; if (k < GUN_LADDER.length) gunStep(k); } } director.kill(!!head, elapsed); questP('kill'); if (head) questP('head'); if (mode === 'dm') questP('dmkill'); questP('streak', director.state.streak); if (mode === 'dm') DM.coins += RC.dmCoinsPerKill * director.coinMul(); let n = 0; for (const e of enemies) if (e.alive) n++; if (n === 1) storyEv('last'); else if (n > 0 && n * 2 <= enemies.length && enemies.length > 4) storyEv('half'); }
function storyEv(key) { if (mode === 'dm') return; RADIO.event(mission.id, key); }

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
  for (const e of allies) if (e.alive) dot(e.pos.x, e.pos.z, '#4aa8ff', 3.5);   // team DM: teammates in blue
  for (const z of zones.smoke) dot(z.pos.x, z.pos.z, 'rgba(200,205,212,.7)', z.radius * k / MM.scale * MM.scale);
  g.restore();
  g.fillStyle = '#5fe6ff'; g.strokeStyle = '#111'; g.lineWidth = 2; g.beginPath(); g.moveTo(W2 / 2, W2 / 2 - 9); g.lineTo(W2 / 2 + 6, W2 / 2 + 6); g.lineTo(W2 / 2 - 6, W2 / 2 + 6); g.closePath(); g.fill(); g.stroke();
}

// ---------- flow ----------
function startMission(idx = selected, opts = {}) {
  if (idx > progress && !DEBUG && opts.mode !== 'dm') return;                     // Deathmatch may use any map
  if (!crazy.active) { startMissionNow(idx, opts); return; }
  if (startMission.busy) return; startMission.busy = true;                       // midgame ad between missions (rate-limited in crazy.js)
  track('ad', { k: 'midgame' }); crazy.midgame().then(() => { startMission.busy = false; startMissionNow(idx, opts); });
}
let firstInput = false;
function noteInput(kind) { if (firstInput || !running) return; firstInput = true; stage('play'); track('input', { k: kind, el: Math.round(elapsed * 10) / 10 }); }
function startMissionNow(idx, opts) {
  if (opts.part === undefined && !opts.mode && !TEST) opts = { ...opts, part: partOf(idx) };   // resume at the saved part
  if (trialWeapon && !opts.primary) { opts = { ...opts, primary: trialWeapon }; track('trial', { k: 'use', w: trialWeapon }); trialWeapon = null; }
  const o = { route: opts.route ?? selRoute, primary: opts.primary ?? loadout.primary, sidearm: opts.sidearm ?? loadout.sidearm, abilities: opts.abilities ?? selAbilities.slice(), part: opts.part, dmMap: opts.dmMap };
  if (o.dmMap == null && !A.kits) {                                               // v44: a story map needs the Kenney kits (still downloading in the background)
    let el = $('dmLoad'); if (!el) { el = document.createElement('div'); el.id = 'dmLoad'; document.body.append(el); } el.textContent = 'LOADING MAP…';
    A.loadKits().then(() => { $('dmLoad')?.remove(); startMissionNow(idx, opts); }); return;
  }
  if (preview) { preview.root.parent?.remove(preview.root); preview = null; }
  if (lobbyRoom) lobbyRoom.on = false;
  mode = opts.mode || null; lastStart = { idx, opts: { ...opts, tutorial: false } }; clearInterval(autoNextT);
  buildMission(idx, o); xpDoubled = false;
  if (mode === 'survival') survivalSetup();
  if (mode === 'dm') dmSetup();
  questP('match'); matchCoins = 0;
  document.body.classList.toggle('tdm', mode === 'dm');
  director.start({ mode, level: META.level(), firstMission: idx === 0 && progress === 0 && !mode, base: mode === 'dm' ? Math.min(0.75, RC.dmBaseThreat + 0.06 * (dmLevel - 1)) : null, easy: !!route.easy, on: !!RC.adaptive }); hitNextT = 0; threatChip(true);
  LS = { dmg: 0, ab: 0, pz: 0, mv: -1, sh: -1, ct: -1, by: '' };
  stage('match'); startMissionNow.n = (startMissionNow.n || 0) + 1; track('start', { m: mission.id, p: route.part, mode: mode || '', n: startMissionNow.n, def: opts.def ? 1 : 0 }); at(`${mission.id}:${route.part}`);
  for (const id of ['brief', 'pick', 'quick', 'end', 'pause', 'lobby', 'shop', 'pass', 'profile', 'loading']) $(id).classList.remove('show');
  $('hud').classList.add('on'); running = true; paused = false;
  dropMentor(); tutorial?.abort(); tutorial = null;                                  // v13: drill removed, every start is straight into play
  if (!TEST && ((!mode && idx === 0) || mode === 'dm') && !tutorialDone()) controlsCard();
  if (!tutorial) crazy.armAds();
  firstContactT = mode || tutorial || TEST ? -1 : RC.contactAfter;
  if (!TEST && !mode) invT = Math.max(invT, RC.startGrace);                          // a few safe seconds to get bearings                // no contact yet? a squad comes looking for you                                          // mission 2: force a first fight within ~15 s
  if (mode !== 'survival') radioOnce('start'); musicFinal = false; sfx.reset(); music.start(); sfx.spawn(); ambience.start(mission.id.startsWith('dm_') ? mission.id.slice(3) : 'story'); startAnn = { txt: mode === 'survival' ? 'WAVE 1' : mode === 'dm' ? (DM.hill ? 'HOLD THE HILL · GO!' : DM.tdm ? 'TEAM DEATHMATCH · GO!' : DM.gun ? 'GUN RUN · GO!' : 'FREE FOR ALL · GO!') : mode === 'daily' ? 'DAILY CHALLENGE' : 'MISSION START', at: performance.now() }; FX.announce(startAnn.txt, 'start');
  if (touch) { touch.show(true); touch.setAbilities(picks.map(p => ABILITIES[p].icon + ' ' + ABILITIES[p].name.toUpperCase().slice(0, 5))); try { document.documentElement.requestFullscreen?.()?.catch?.(() => {}); } catch (e) { /* iOS: no fullscreen API */ } }
  else if (!TEST) lockMouse();
  if (returnGifts && mode === 'dm') {                                               // v31: back on a new day: the gift is equipped right away
    const g = returnGifts[returnGifts.length - 1], lo = DM_LOADOUTS.find(l => l[1] === g.id); returnGifts = null;
    if (lo) { DM.next = [lo[1], lo[2]]; dmApplyLoadout(); matchXP.swap = 0; }
    FX.announce(`WELCOME BACK · ${g.cls} UNLOCKED`, 'start'); giftToast(g);
  }
  crazy.gameplay(true);
}
function giftToast(g) {
  const d = document.createElement('div'); d.className = 'questToast';
  d.innerHTML = `${icon('check')}<b>${g.cls} CLASS UNLOCKED</b><span></span>`; d.lastChild.textContent = `${WEAPONS[g.id].name} is yours to keep.`;
  document.body.append(d); sfx.coin?.(); setTimeout(() => d.remove(), 5000);
}
$('dcGo').onclick = dcRespawnNow;
function endMatch() { $('dcard').classList.remove('show'); tutorial?.abort(); ambience.stop(); touch?.show(false); running = false; matchOver = true; mouse.l = mouse.r = false; keys = {}; document.exitPointerLock?.(); crazy.gameplay(false); }
function lose(reason) {
  if (matchOver) return; endMatch(); music.end(false); questP('finish');
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
  if (matchOver) return; endMatch(); music.end(true); questP('finish');
  track(route.parts > 1 && route.part < route.parts - 1 ? 'part' : 'win', { m: mission.id, p: route.part, mode: mode || '', t: Math.round(elapsed), ...lvlStats() }); at('end:' + mission.id);
  if (route.parts > 1 && route.part < route.parts - 1) {                       // a part of a longer mission: bank it, go straight to the next part
    const pp = store.get('sz_parts', {}); pp[mission.id] = route.part + 1; store.set('sz_parts', pp);
    fails[missionIdx] = 0; matchXP.win = Math.round(META.XP.win / 2);
    META.profile.coins += RC.partCoins; matchCoins = RC.partCoins; META.profile.upPoints++; META.saveProfile(); crazy.happy();
    showEnd(`PART ${route.part + 1}/${route.parts} CLEARED`, `+${RC.partCoins} ◎ · +1 upgrade point\n\n[ NEXT: part ${route.part + 2} of "${mission.title}" ]`, missionIdx);
    return;
  }
  { const pp = store.get('sz_parts', {}); if (pp[mission.id]) { delete pp[mission.id]; store.set('sz_parts', pp); } }
  questP('win');
  if (!mode) { winBonus = Math.round(RC.winCoins * director.coinMul()); META.profile.coins += winBonus; matchCoins = winBonus; }
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
function audioMute(on) { forceMute('ad', on); }
function revive() {
  revived = true; $('end').classList.remove('show'); $('hud').classList.add('on');
  player.hp = 100; player.alive = true; invT = 3; hurtK = 0; matchOver = false; running = true; paused = false;
  sfx.respawn(); music.start(); ambience.start(mission.id.startsWith('dm_') ? mission.id.slice(3) : 'story');
  for (const e of enemies) if (e.alive && e.pos.distanceTo(player.pos) < 6) e.alert(player.pos, 0.3);
  if (touch) touch.show(true); else if (!TEST) lockMouse();
  radio('VOSS', 'Not done yet.', 2); crazy.gameplay(true);
}
function showEnd(title, text, nextIdx, { death = false, failed = false } = {}) {
  if (mode !== 'dm') $('end').classList.remove('dm');
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
  $('again').textContent = mode === 'dm' ? '↻ REMATCH' : failed ? '↻ RETRY' : 'REPLAY'; $('again').className = failed ? 'go' : '';
  clearInterval(autoNextT);
  if (nextIdx !== null && !TEST) {                                              // win: next mission starts by itself unless the player touches anything
    let n = RC.autoNextSeconds + 1; const tick = () => { if (--n <= 0) { clearInterval(autoNextT); $('next').click(); } else $('next').textContent = `NEXT MISSION (${n})`; };
    tick(); autoNextT = setInterval(tick, 1000);
    $('end').addEventListener('pointerdown', e => { if (e.target.id !== 'next' && e.target.id !== 'endMore') { clearInterval(autoNextT); $('next').textContent = 'NEXT MISSION'; } }, { once: true });
  } else $('next').textContent = 'NEXT MISSION';
  $('next').onclick = () => { unlockAudio(); selected = nextIdx; const nm = MISSIONS[nextIdx]; const route = !nm.routes ? 'default' : nm.routes[selRoute] ? selRoute : 'stealth'; startMission(nextIdx, { route, abilities: [] }); };   // straight in with the current kit; LOBBY to change it
  if (RC.v14ui) endV14(add); else $('end').classList.remove('v14e');
  if (mode === 'dm') $('dmEnd').after($('endPlay')); else $('endQ').after($('endPlay'));
  giftCard();   // v30: DM rematch/lobby sit right under the result tiles, always on screen (phones too)
  const show = () => { endPage(1); $('end').classList.add('show'); $('end').querySelector('.card').scrollTop = 0; };
  if (TEST) show(); else outro(title, show);
}
// v39: the match does not cut to the result. The world slows to a stop under a fading VICTORY / DEFEAT, then the result screen
// comes in; CONTINUE (or 5 s) moves on to the what-next screen. Two short screens, no scrolling.
let outroT = -1;
function outro(title, then) {
  const word = title.split(' · ')[0], lose = /DEFEAT|FAILED|OVER/.test(word);
  let el = $('outro'); if (!el) { el = document.createElement('div'); el.id = 'outro'; el.innerHTML = '<b></b>'; document.body.append(el); }
  el.className = lose ? 'lose' : ''; el.firstChild.textContent = word; void el.offsetWidth; el.classList.add('on');
  outroT = 0; clearTimeout(outro.t); FX.announce('', 'info');
  outro.t = setTimeout(() => { el.classList.add('off'); outroT = -1; then(); setTimeout(() => { el.className = ''; }, 400); }, 1700);
}
const outroScale = () => outroT < 0 ? 1 : Math.max(0, 1 - outroT / 1.3);
function endPage(n) {
  const E = $('end'); E.dataset.pg = n; clearTimeout(endPage.t);
  if (n === 1 && !TEST) { endPage.t = setTimeout(() => { if (E.dataset.pg === '1' && E.classList.contains('show')) endPage(2); }, 5000); }
  if (n === 2) { const c = E.querySelector('.card'); c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; }
}
$('endMore').onclick = () => endPage(2);
$('end').addEventListener('pointerdown', e => { if (e.target.closest?.('button') && e.target.id !== 'endMore' && $('end').dataset.pg === '1') clearTimeout(endPage.t); });   // busy with upgrades / double offer: stay
function giftCard() {                                                              // v31: the unlock waiting tomorrow, right under the play buttons
  const el = $('endGift'), un = META.unlocked(progress).weapons, g = MODES.nextGift(id => un.has(id));
  $('endPlay').after(el);
  if (!g) { el.style.display = 'none'; return; }
  el.style.display = ''; el.innerHTML = `<img src="${A.icons[g.id] || ''}" alt=""><span><b>COME BACK TOMORROW</b><small>The ${g.cls} class unlocks: ${WEAPONS[g.id].name}, yours to keep</small></span>`;
  if (!giftCard.sent) { giftCard.sent = 1; track('gift', { k: 'shown', id: g.id }); }
}
function endV14(add) {                                                              // v14 end screen: coin count-up, timed double offer, quest bars
  const E = $('end'); E.classList.add('v14e'); $('adXP').style.display = 'none';
  const c = matchCoins, el = $('endCoins'); clearInterval(dblT);
  if (c > 0) { let v = 0; const t0 = performance.now(); const up = () => { v = Math.min(c, Math.round(c * (performance.now() - t0) / 900)); el.innerHTML = `${icon('coin')} +${v}`; if (v < c && E.classList.contains('show')) requestAnimationFrame(up); }; el.innerHTML = `${icon('coin')} +0`; requestAnimationFrame(up); } else el.textContent = '';
  const b = $('dbl');
  if ((c > 0 || add > 0) && !xpDoubled) {
    let n = 6; const tick = () => { if (--n <= 0) { clearInterval(dblT); b.style.display = 'none'; return; } b.innerHTML = `${icon('video')} DOUBLE COINS + XP <b>CLAIM ${n}S</b>`; };
    b.style.display = ''; tick(); dblT = setInterval(tick, 1000); track('dbl', { k: 'offer' });
    b.onclick = () => { clearInterval(dblT); b.style.display = 'none'; track('dbl', { k: 'watch' }); rewardedAd(() => {
      xpDoubled = true; META.profile.coins += c; const p2 = META.addXP(add); META.saveProfile(); if (p2.length) sfx.coin();
      matchCoins = c * 2; el.innerHTML = `${icon('coin')} +${c * 2} · DOUBLED`; $('endXP').textContent = xpLine(add * 2, p2) + ' · DOUBLED'; track('dbl', { k: 'ok' }); }); };
  } else b.style.display = 'none';
  if (RC.quests) { const qs = QUESTS.all(); $('endQ').innerHTML = `<div class="qh"><span>QUESTS</span><small>${qs.some(q => q.done && !q.claimed) ? 'CLAIM IN THE LOBBY' : 'NEW IN ' + QUESTS.resetsIn()}</small></div>` + qs.map(q => `<div class="q${q.done ? ' done' : ''}">${q.t.toUpperCase()} · ${q.p}/${q.n}<div class="qr"><div class="qb"><i style="width:${Math.round(q.p / q.n * 100)}%"></i></div></div></div>`).join(''); }
  else $('endQ').textContent = '';
  const fbN = startMissionNow.n || 0, fbChips = !store.get('sz_fb_r', 0), fbText = fbN >= 2 && !store.get('sz_fb_done', 0) && !store.get('sz_fb_end', 0);
  $('fbEnd')?.remove();
  if (!TEST && (fbChips || fbText)) {   // v29.8 one-time one-tap reason chips (from match 1) + v29.2 one-time text line (from match 2)
    const f = document.createElement('div'); f.id = 'fbEnd';
    if (fbChips) { f.append(fbChipRow('How was that match?', FB_END, 'end')); track('ui', { k: 'fbChips', where: 'end' }); }
    if (fbText) {
      store.set('sz_fb_end', 1); track('ui', { k: 'fbEnd' });
      const w = document.createElement('div'); w.className = 'fbT';
      w.innerHTML = `<label for="fbEndT">What should we improve? <small>(optional)</small></label><div><input id="fbEndT" maxlength="500" placeholder="Bugs, ideas, what felt bad…"><button id="fbEndB">SEND</button></div>`;
      f.append(w); w.querySelector('input').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') w.querySelector('button').click(); });
      w.querySelector('button').onclick = () => { const t = $('fbEndT').value.trim(); if (!t) return; sendFeedback(t, 'end'); w.innerHTML = '<span class="ok">Thanks! We read every message.</span>'; };
    }
    $('adXP').parentElement.after(f);   // below RETRY/LOBBY so feedback never pushes the play buttons off a phone screen
  }
  $('menuBtn').classList.add('kgrey');
}
function pause() { if (!running || TEST || touch) return; doPause(); }
function doPause() { if (!running) return; LS.pz++; music.pause(true); touch?.show(false); running = false; paused = true; mouse.l = false; showBoard(false); pauseFill(); $('pause').classList.add('show'); crazy.gameplay(false); }

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
    b.innerHTML = `<img src="${A.icons[id]}" alt=""><span>${lock ? '🔒 LV ' + META.unlockLevel(id) : WEAPONS[id].name.toUpperCase()}</span>`;
    if (lock && !DEBUG) { b.disabled = true; b.title = `Unlocks at level ${META.unlockLevel(id)}`; }
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
function openBriefing(step = 'agent') {
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
// rebrand: no campaign steps (mode/mission skipped)
const flow = createFlow({ $, skip: id => id === 'mode' || id === 'mission' || (id === 'agent' && [...META.unlocked(progress).operatives].length < 2 && !DEBUG), onExit: () => openLobby() });

// ---------- input ----------
const isMenu = () => !running;
document.addEventListener('keydown', e => {
  keys[e.code] = true; unlockAudio(); noteInput('key');
  if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
  if (isMenu()) return;
  if ($('dcard').classList.contains('show')) { if (e.code === 'Space') dcRespawnNow(); const d = +e.code.replace('Digit', ''); if (d >= 1 && d <= 4) dcPick(d - 1); return; }
  if (e.code === 'KeyM') { muteToast(toggleMute()); return; }
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
canvas.addEventListener('mousedown', e => { unlockAudio(); noteInput('mouse'); if (!running) return; if ($('dcard').classList.contains('show') && document.pointerLockElement) { dcRespawnNow(); return; } if (!document.pointerLockElement && !TEST) { lockMouse(); return; } if (e.button === 0) mouse.l = true; if (e.button === 2) mouse.r = true; });
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
let startAnn = null;   // v38: the match-start banner is held while the desktop PLAY gate is up, then replayed after the click
function lockHint() {                                                           // lock refused while playing: freeze + ask for a click
  if (!running || touch || TEST || document.pointerLockElement || matchOver) return;
  track('lock', { k: 'hint' });
  running = false; paused = true; mouse.l = false; $('clickGo').classList.add('show'); crazy.gameplay(false);
  const cc = $('ctlCard'); if (cc?.className === 'show') { cc.className = ''; clearTimeout(controlsCard.t); controlsCard.pending = true; }
  if (startAnn && performance.now() - startAnn.at < 3000) { FX.announce('', 'info'); startAnn.pending = true; }   // v37: the controls card waits for the click instead of fading unseen
}
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) pause(); });
document.addEventListener('visibilitychange', () => { if ($('clickGo').classList.contains('show')) track('lock', { k: 'vis', h: document.hidden ? 1 : 0 }); });   // v38: do gate leavers tab away?
document.addEventListener('pointerlockerror', () => { track('lock', { k: 'err' }); setTimeout(lockHint, 50); });
$('clickGo').addEventListener('mousedown', e => { track('lock', { k: 'click' }); if (controlsCard.pending) { controlsCard.pending = false; controlsCard(); } if (startAnn?.pending) { startAnn.pending = false; FX.announce(startAnn.txt, 'start'); } e.preventDefault(); $('clickGo').classList.remove('show'); unlockAudio(); paused = false; running = true; last = performance.now(); crazy.gameplay(true); lockMouse(); });
$('start').onclick = () => { unlockAudio(); dmStart(false); };   // rebrand: the loadout screen deploys into an arena match
$('resume').onclick = () => { music.pause(false); $('pause').classList.remove('show'); paused = false; running = true; if (touch) touch.show(true); else lockMouse(); crazy.gameplay(true); };
$('trySurv').onclick = () => { unlockAudio(); clearInterval(autoNextT); const i = (Math.random() * Math.min(progress, MISSIONS.length)) | 0; startMission(i, { route: MISSIONS[i].routes ? 'assault' : 'default', abilities: [], mode: 'survival' }); };
$('again').onclick = () => { unlockAudio(); if (NET.on) { if (DM.br && !NET.wantRoom) { clearInterval(autoNextT); netLeave(); netStart(); } return; } clearInterval(autoNextT); if (lastStart.opts.mode === 'dm') { dmStart(false); return; } startMission(lastStart.idx, lastStart.opts); };
$('menuBtn').onclick = openLobby; $('pauseMenu').onclick = () => quitAsk();
// v29: "leave the match?" confirm with an optional feedback box (stored in Supabase as a 'feedback' event)
function quitAsk() {
  let el = $('quitAsk');
  if (!el) {
    el = document.createElement('div'); el.id = 'quitAsk';
    el.innerHTML = `<div class="qa"><h2>LEAVE THE MATCH?</h2><p>Your progress in this match will be lost.</p><div id="qaChips"></div><label for="qaText">How can we make Blastline better? <small>(optional)</small></label><textarea id="qaText" maxlength="500" rows="3" placeholder="Bugs, ideas, what felt bad…"></textarea><div class="qaB"><button id="qaStay" class="go">STAY</button><button id="qaLeave">LEAVE</button></div></div>`;
    document.body.append(el);
    el.querySelector('#qaText').addEventListener('keydown', e => e.stopPropagation());   // typing never triggers game keys
    $('qaStay').onclick = () => { el.classList.remove('show'); track('ui', { k: 'quitStay' }); };
    $('qaLeave').onclick = () => {
      const t = $('qaText').value.trim().slice(0, 500);
      track('quit_ask', { k: 'leave', fb: t ? 1 : 0, mode: mode || 'story', m: mission?.id, el: Math.round(elapsed) });
      if (el.dataset.k === 'exit') { if (t) sendFeedback(t, 'exit'); track('ui', { k: 'exitAsk', fb: t ? 1 : 0 }); $('qaText').value = ''; el.classList.remove('show'); return; }
      if (t) sendFeedback(t, 'quit');
      tFlush(); $('qaText').value = ''; el.classList.remove('show'); paused = false; openLobby();
    };
  }
  setAsk(el, 'quit'); el.classList.add('show'); track('ui', { k: 'quitAsk' }); setTimeout(() => $('qaText').focus(), 50);
}
function setAsk(el, k) {                                                           // same dialog: 'quit' (Quit to lobby) or 'exit' (mouse heading out of the game)
  el.dataset.k = k; const q = k === 'exit';
  el.querySelector('h2').textContent = q ? 'LEAVING ALREADY?' : 'LEAVE THE MATCH?';
  const un = META.unlocked(progress).weapons, g = MODES.nextGift(id => un.has(id));   // v31: remind what is waiting tomorrow
  el.querySelector('p').textContent = (g ? `Come back tomorrow: the ${g.cls} class (${WEAPONS[g.id].name}) unlocks for free. ` : '') + (q ? 'Before you go: one line on what we should improve helps a lot.' : 'Your progress in this match will be lost.');
  $('qaStay').textContent = q ? 'NO THANKS' : 'STAY'; $('qaLeave').textContent = q ? 'SEND' : 'LEAVE';
  const c = $('qaChips'); c.textContent = '';
  if (!store.get('sz_fb_rq', 0)) c.append(fbChipRow(q ? 'What made you want to leave?' : 'Why are you leaving?', FB_QUIT, k));
}
// v29.8 one-tap reasons: one tap sends ev='fb_reason' right away (no typing needed, works on phones). Once per player per place (end / quit+exit).
const FB_END = [['fun', 'FUN'], ['hard', 'TOO HARD'], ['easy', 'TOO EASY'], ['boring', 'BORING'], ['lag', 'LAGGY'], ['controls', 'CONTROLS']];
const FB_QUIT = [['break', 'JUST A BREAK'], ['hard', 'TOO HARD'], ['boring', 'BORING'], ['lag', 'LAGGY'], ['controls', 'CONTROLS'], ['confusing', 'CONFUSING']];
function fbChipRow(title, list, where) {
  const row = document.createElement('div'); row.className = 'fbChips';
  row.innerHTML = `<span>${title}</span><div>${list.map(([r, l]) => `<button data-r="${r}">${l}</button>`).join('')}</div>`;
  row.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || row.dataset.done) return;
    row.dataset.done = 1; b.classList.add('on'); store.set(where === 'end' ? 'sz_fb_r' : 'sz_fb_rq', 1);
    track('fb_reason', { r: b.dataset.r, where, mode: mode || playMode || 'story', m: mission?.id, lvl: META.level(), tdm: DM.tdm ? 1 : 0, n: startMissionNow.n || 0, el: Math.round(elapsed) });
    tFlush(); row.querySelector('span').textContent = 'Thanks!';
  });
  return row;
}
function sendFeedback(t, where) {
  store.set('sz_fb_done', 1);
  track('feedback', { text: t.slice(0, 500), where, mode: mode || playMode || 'story', m: mission?.id, lvl: META.level(), tdm: DM.tdm ? 1 : 0, n: startMissionNow.n || 0 });
  tFlush(); FX.announce('THANKS FOR THE FEEDBACK!', 'start');
}
// v29.2 (1) exit intent, PC: mouse leaves through the top of the game while not fighting -> ask once per session
document.addEventListener('mouseout', e => {
  if (touch || TEST || e.relatedTarget || e.clientY > 4 || (running && !paused) || sendFeedback.asked || store.get('sz_fb_done', 0)) return;
  if (!startMissionNow.n) return;                                                 // only after at least one match
  sendFeedback.asked = true; quitAsk(); setAsk($('quitAsk'), 'exit'); track('ui', { k: 'exitIntent' });
});

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
  $('setRows').insertAdjacentHTML('afterbegin', [['master', 'MASTER VOLUME'], ['music', 'MUSIC'], ['sfx', 'EFFECTS']].map(([k, label]) =>
    `<p style="display:flex;justify-content:space-between;align-items:center;gap:12px"><span>${label}</span><input type="range" data-a="${k}" min="0" max="1" step="0.05" value="${audio[k]}"></p>`).join('') +
    `<p style="display:flex;justify-content:space-between;align-items:center;gap:12px"><span>MUTE ALL SOUND <small style="opacity:.6">(M)</small></span><input type="checkbox" data-a="muted" ${audio.muted ? 'checked' : ''}></p>`);
  $('setRows').querySelectorAll('[data-a]').forEach(el => el.oninput = () => { setAudio(el.dataset.a, el.type === 'checkbox' ? el.checked : Number(el.value)); muteIcons(); });
  $('setRows').insertAdjacentHTML('beforeend', '<p style="display:flex;justify-content:space-between;align-items:center;gap:12px"><span>INTERFACE TOUR</span><button id="setTour" type="button">REPLAY</button></p>');
  $('setTour').onclick = () => { $('settings').classList.remove('show'); startOnboarding(true); };
  $('settings').classList.add('show');
}
// ---------- sound on/off: lobby + pause buttons, M key, toast ----------
const SPK = on => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="4 9 8 9 13 5 13 19 8 15 4 15 4 9"/>${on ? '<path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>' : '<line x1="17" y1="9" x2="22" y2="14"/><line x1="22" y1="9" x2="17" y2="14"/>'}</svg>`;
function muteIcons() { for (const id of ['lMute', 'pzMute']) { const b = $(id); if (b) { b.innerHTML = SPK(!audio.muted) + (id === 'pzMute' ? (audio.muted ? ' SOUND OFF' : ' SOUND ON') : ''); b.setAttribute('aria-label', audio.muted ? 'Unmute' : 'Mute'); b.classList.toggle('off', audio.muted); } } }
function muteToast(muted) {
  muteIcons(); let t = $('muteToast');
  if (!t) { t = document.createElement('div'); t.id = 'muteToast'; t.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:60;padding:8px 16px;border-radius:8px;background:rgba(10,14,20,.82);color:#fff;font:600 14px/1.2 inherit;letter-spacing:.08em;display:flex;gap:8px;align-items:center;pointer-events:none;transition:opacity .3s'; document.body.append(t); }
  t.innerHTML = SPK(!muted) + (muted ? 'SOUND OFF · PRESS M' : 'SOUND ON'); t.style.opacity = '1'; clearTimeout(muteToast.t); muteToast.t = setTimeout(() => { t.style.opacity = '0'; }, 1400);
}
$('lSettings').insertAdjacentHTML('beforebegin', '<button id="lMute" class="ico" type="button"></button>');
$('pauseMenu').insertAdjacentHTML('afterend', '<button id="pzMute" type="button"></button>');
$('lMute').onclick = () => { unlockAudio(); toggleMute(); muteIcons(); track('ui', { k: 'mute', on: audio.muted ? 1 : 0 }); };
$('pzMute').onclick = () => { toggleMute(); muteIcons(); track('ui', { k: 'mute', on: audio.muted ? 1 : 0 }); };
muteIcons();
crazy.onMuteSetting(on => forceMute('sdk', on));
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
    onFinish(played) { $('settings').classList.remove('show'); if (played) { unlockAudio(); if (onlineOn()) netStart(); else dmStart(false); } else openLobby(); },
  });
  return onboard.start({ force });
}
{ const b = document.createElement('button'); b.textContent = '⚙ SETTINGS'; b.onclick = settingsUI; $('pause').querySelector('.pzBtns').append(b); }
$('setClose').onclick = () => $('settings').classList.remove('show');

// ---------- briefing preview: the chosen operative, armed, idling; ability picks play their clip + effect ----------
let preview = null, lobbyRoom = null;
{ // v40: in the lobby room, drag empty space to turn your operative, tap them to show off a move
  let drag = null; const free = e => !e.target.closest?.('button,a,input,select,textarea,.pnl,.card,.panel.show .row') && lobbyRoom?.on && !running && preview;
  addEventListener('pointerdown', e => { if (free(e)) drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
  addEventListener('pointermove', e => { if (!drag || !preview) return; const dx = e.clientX - drag.x; drag.x = e.clientX; drag.moved += Math.abs(dx); setPreview.turn = (setPreview.turn || 0) + dx * 0.012; preview.root.rotation.y = lobbyRoom.faceYaw + setPreview.turn; });
  addEventListener('pointerup', e => { if (!drag) return; const tap = drag.moved < 6; drag = null; if (!tap || !preview) return;
    const r = canvas.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width, ny = (e.clientY - r.top) / r.height;
    if (Math.abs(nx - 0.5) < 0.12 && ny > 0.2 && ny < 0.95) { const m = ['ab_smoke', 'ab_flash', 'ab_decoy', 'ab_sensor', 'ab_shield']; preview.perform(m[(Math.random() * m.length) | 0]); track('ui', { k: 'lobbyTap' }); } });
}
async function setPreview() {
  const id = loadout.operative, gltf = await loadOperative(id);
  A.rhea = gltf;
  if (preview) { preview.root.parent?.remove(preview.root); preview.mixer.stopAllAction(); }
  const inRoom = lobbyRoom?.on;
  if (running || (!scene && !inRoom)) return;
  const root = SkeletonUtils.clone(gltf.scene); toonify(root, { rim: 0x8fd8ff }); outline(root, { thick: 0.02 });
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  const wid = loadout.primary, pist = SIDEARMS.includes(wid);
  const key = `${id}:${pist ? 'p' : 'r'}`; A.gunCal ??= {}; A.gunCal[key] ??= calibrateGun(gltf, pist ? 'shoot_pistol' : 'shoot');
  const gun = A.weapons[wid].clone(true); gun.matrixAutoUpdate = false; gun.matrix.copy(A.gunCal[key]); toonify(gun); outline(gun, { thick: 0.012 });
  root.getObjectByName('handR').add(gun);
  const pc = META.charmMesh(META.profile.charm); if (pc) { const bx = new THREE.Box3().setFromObject(A.weapons[wid]); pc.scale.setScalar(1.6); pc.position.set(bx.max.x + 0.01, (bx.min.y + bx.max.y) / 2, bx.min.z + (bx.max.z - bx.min.z) * 0.3); gun.add(pc); }
  const fwd = V(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const at = inRoom ? lobbyRoom.spot.clone() : player.pos.clone().addScaledVector(fwd, 3.4).addScaledVector(V(-fwd.z, 0, fwd.x), -1.55 * Math.min(1.4, camera.aspect / 1.4));
  if (inRoom) { at.copy(lobbyRoom.spot); root.position.copy(at); root.rotation.y = lobbyRoom.faceYaw + (setPreview.turn || 0); lobbyRoom.scene.add(root); }
  else { const g = world.groundHeight(at.x, at.z, 0.3, at.y + 1, 2); at.y = Number.isFinite(g) ? g : player.pos.y;
    root.position.copy(at); root.rotation.y = Math.atan2(-fwd.x, -fwd.z) + 0.35; scene.add(root); }
  const mixer = new THREE.AnimationMixer(root), clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
  const base = pist ? 'idle_pistol' : 'idle_rifle';
  let cur = mixer.clipAction(clips[base]); cur.play(); mixer.update(0);
  let pending = null;
  const pfx = new AbilityFX(inRoom ? lobbyRoom.scene : scene, { ground: () => at.y });
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
    if (!META.unlocked(progress).operatives.has(id)) { b.textContent = `🔒 ${name.toUpperCase()} · LV ${META.unlockLevel(id)}`; if (!DEBUG) b.disabled = true; }
    b.onclick = () => { loadout.operative = id; store.set('sz_loadout', loadout); operativeButtons(); setPreview(); };
    $('operatives').append(b);
  }
}

// ---------- lobby / shop / pass / profile ----------
const PANELS = ['lobby', 'pick', 'quick', 'brief', 'shop', 'pass', 'profile', 'tutPick', 'guide', 'end', 'pause', 'loading'];
function only(id) { for (const p of PANELS) $(p).classList.toggle('show', p === id); $('hud').classList.remove('on'); }
function chips() {
  $('lvl').firstChild.textContent = `LV ${META.level()} `; $('lvlbar').firstElementChild.style.width = `${META.levelProgress() * 100}%`;
  $('coins').innerHTML = `${icon('coin')} ${META.profile.coins.toLocaleString()}`; $('shopCoins').textContent = `◎ ${META.profile.coins}`;
  $('lobbyOp').textContent = `${OPERATIVES[loadout.operative].toUpperCase()} · ${WEAPONS[loadout.primary].name.toUpperCase()} · ${META.CHARMS[META.profile.charm].name.toUpperCase()} CHARM`;
}
// PLAY: one screen, one tap. Next mission with the saved kit; loadout / mission pickers are optional.
// PLAY -> two big choices, each starts immediately
function openPick() {
  only('pick'); setPreview(); at('pick');
  const i = Math.min(progress, MISSIONS.length - 1), pt = partOf(i);
  { const b = store.get('sz_dm_best', 0); $('pDmBest').textContent = b ? `BEST ${b} KILLS` : ''; }
  $('pStorySub').textContent = `MISSION ${i + 1}` + (pt ? ` · PART ${pt + 1}` : '') + ` · ${MISSIONS[i].title.toUpperCase()}`;
}
$('pStory').onclick = () => { unlockAudio(); selected = Math.min(progress, MISSIONS.length - 1); const m = MISSIONS[selected]; startMission(selected, { route: !m.routes ? 'default' : m.routes[selRoute] ? selRoute : 'stealth', abilities: [] }); };
$('pDm').onclick = () => { unlockAudio(); dmStart(false); };
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
  if (NET.ws) netLeave();
  music.pause(false); music.menu(); ambience.stop();
  only('lobby'); at('lobby'); stage('lobby');
  const lc = TEST || !startMissionNow.n ? null : MODES.loginClaim();             // v14: login reward lands after the first match, not on boot
  if (lc) { META.profile.coins += lc.coins; META.saveProfile(); sfx.coin?.(); loginBanner(lc); track('ui', { k: 'login', d: lc.day }); }
  lobbyRoom ??= buildLobbyRoom(); lobbyRoom.on = true;   // v40: the lobby has its own fixed room, not the frozen last match
  lobbyDaylight(); chips(); setPreview(); modeButtons(); lobbyV14(); loadBotSkins(); if (mpUrl()) netCount();
}
function lobbyDaylight() {                                                         // bright midday look behind the lobby (scene is rebuilt on mission start)
  if (!scene || !RC.v14ui) return; const L = LIGHTING.noon;
  scene.background = new THREE.Color(L.sky).offsetHSL(0, 0.12, 0.05);
  if (scene.fog) { scene.fog.color.copy(scene.background); scene.fog.near = 120; scene.fog.far = 420; }
  scene.traverse(o => { if (o.isHemisphereLight) { o.color.set(L.hemi[0]); o.intensity = 1.9; } else if (o.isDirectionalLight && o === sun) { o.color.set(L.sun[0]); o.intensity = 2.4; } });
}
const WICON = { pistol: 'pistol', revolver: 'pistol', assault: 'assault-rifle', 'machine gun': 'assault-rifle', sniper: 'sniper-rifle' };
function lobbyV14() {
  $('lMission').textContent = onlineOn() ? `${MODE_NAME[modeKey()]} · REAL PLAYERS + BOTS${netOnlineN ? ` · ${netOnlineN} ONLINE` : ''}` : hillOn() ? `HOLD THE HILL · LEVEL ${dmLevel} · FIRST TO ${RC.hillScore}` : gunOn() ? `GUN RUN · LEVEL ${dmLevel} · ${GUN_LADDER.length} GUNS` : `${MODE_NAME[modeKey()]} · LEVEL ${dmLevel} · FIRST TO ${dmGoal(dmLevel, teamsOn())}`;
  $('lPlay').innerHTML = `<span>${icon('play')} PLAY</span>`;
  { const b = store.get('sz_dm_best', 0); $('mStory').innerHTML = `${icon('flag')} STORY<small></small>`; $('mDm').innerHTML = `${icon('skull')} DEATHMATCH<small>${b ? 'BEST ' + b : ''}</small>`; }
  $('mStory').classList.toggle('on', playMode !== 'dm'); $('mDm').classList.toggle('on', playMode === 'dm'); lobbyModes();
  // quests
  if (RC.quests) {
    const qs = QUESTS.all();
    $('lQuests').innerHTML = `<div class="qh"><span>QUESTS</span><small>NEW IN ${QUESTS.resetsIn()}</small></div>` + qs.map(q => `<div class="q${q.done ? ' done' : ''}${q.claimed ? ' claimed' : ''}">${q.id === 'w0' ? 'WEEKLY · ' : ''}${q.t.toUpperCase()} · ${q.p}/${q.n}<div class="qr"><div class="qb"><i style="width:${Math.round(q.p / q.n * 100)}%"></i></div>${q.done && !q.claimed ? `<button data-q="${q.id}">CLAIM +${q.coins}</button>` : q.claimed ? icon('check') : ''}</div></div>`).join('');
    $('lQuests').querySelectorAll('button[data-q]').forEach(b => b.onclick = () => { const r = QUESTS.claim(b.dataset.q); if (!r) return; META.profile.coins += r.coins; const paid = META.addXP(r.xp); META.saveProfile(); sfx.coin?.(); track('quest', { k: 'claim', q: b.dataset.q }); if (paid.length) FX.announce('TIER UP', 'start'); chips(); lobbyV14(); });
  } else $('lQuests').style.display = 'none';
  // crate (login calendar)
  { const st = store.get('sz_login', { last: '', day: 0 }), today = new Date().toISOString().slice(0, 10), got = st.last === today;
    // v41: 7-day reward strip under the crate line: paid days ticked, today lit, tomorrow tagged
    const wk = MODES.loginWeek(), cells = MODES.LOGIN_COINS.map((c, i) => { const d = i + 1, paid = d < wk.cur || (d === wk.cur && wk.got), now = d === wk.cur && !wk.got, nx = wk.got && d === wk.cur % 7 + 1;
      return `<i class="d${paid ? ' got' : ''}${now ? ' now' : ''}${nx ? ' nx' : ''}${d === 7 ? ' big' : ''}"><b>${nx ? 'NEXT' : now ? 'TODAY' : 'DAY ' + d}</b>${paid ? icon('check') : `<em>${c}</em>`}</i>`; }).join('');
    $('lCrate').innerHTML = `<div class="dh">${icon('supply-drop')}<span>${got ? 'DAILY REWARD CLAIMED' : 'DAILY REWARD'}<small>${got ? `DAY ${st.day} OF 7 · COME BACK TOMORROW +${MODES.loginTomorrow()}` : 'FINISH 1 MATCH TO CLAIM'}</small></span></div><div class="days">${cells}</div>`;
    $('lCrate').classList.toggle('ready', !got); }
  // weapon cards: equipped + next ones; locked ones offer a 1-level trial
  const un = META.unlocked(progress).weapons, list = PRIMARIES.slice(0, 5);
  $('lWeps').innerHTML = '';
  for (const id of list) {
    const w = WEAPONS[id], own = un.has(id) || DEBUG, eq = loadout.primary === id && !trialWeapon, tr = trialWeapon === id;
    const d = document.createElement('button'); d.className = `wcard${eq ? ' eq' : ''}${own ? '' : ' lock'}${tr ? ' trial' : ''}`;
    d.innerHTML = `${icon(own ? WICON[w.cls] || 'assault-rifle' : 'lock')} ${w.name.toUpperCase()}` + (own ? `<div class="wb"><i style="width:${Math.min(100, Math.round(w.dmg * w.rpm / 220))}%"></i></div>` : `<span class="tr">${tr ? 'TRIAL READY · NEXT MATCH' : RC.trials ? `TRY 1 LEVEL: <u data-k="ad">AD</u> · <u data-k="c">${RC.trialCost} COINS</u>` : 'LOCKED'}</span>`);
    d.onclick = ev => {
      if (own) { loadout.primary = id; trialWeapon = null; store.set('sz_loadout', loadout); setPreview(); lobbyV14(); return; }
      if (!RC.trials || tr) return;
      if (ev.target.closest('[data-k=c]')) { if (META.profile.coins < RC.trialCost) { FX.announce('NOT ENOUGH COINS', 'objective'); return; } META.profile.coins -= RC.trialCost; META.saveProfile(); trialWeapon = id; track('trial', { k: 'coins', w: id }); chips(); lobbyV14(); return; }
      track('trial', { k: 'offer', w: id });
      rewardedAd(() => { trialWeapon = id; track('trial', { k: 'watch', w: id }); sfx.coin?.(); lobbyV14(); });
    };
    $('lWeps').append(d);
  }
}
function loginBanner(lc) {
  const d = document.createElement('div'); d.className = 'loginToast';
  d.innerHTML = `${icon('supply-drop')} <b>DAY ${lc.day} CRATE</b> +${lc.coins} COINS<small>${[1, 2, 3, 4, 5, 6, 7].map(n => n <= lc.day ? '■' : '□').join(' ')} · tomorrow +${lc.tomorrow}</small>`;
  document.body.append(d); setTimeout(() => d.remove(), 5000);
}
function modeButtons() {
  const d = MODES.dailyToday(progress, MISSIONS.length), st = MODES.dailyState();
  $('lDaily').innerHTML = st.done ? `${icon('check')} DAILY DONE · ${st.streak}-DAY` : `${icon('calendar')} DAILY · +${MODES.dailyBonus(st.next)} XP`;
  $('lSurv').disabled = progress < 1 && !DEBUG;
  $('lSurv').innerHTML = progress < 1 && !DEBUG ? `${icon('lock')} SURVIVAL` : `${icon('infinity')} SURVIVAL${MODES.survBest() ? ' · W' + MODES.survBest() : ''}`;
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
  $('profStats').textContent = `LEVEL ${META.level()} · ${META.profile.xp} XP · ◎ ${META.profile.coins}\nWins ${T.wins} · Kills ${T.kills} · Headshots ${T.heads}`;
  $('profUnlocks').textContent = [...PRIMARIES, ...SIDEARMS].map(w => `${WEAPONS[w].name}${un.weapons.has(w) ? ' ✓' : META.unlockLevel(w) ? ` (LV ${META.unlockLevel(w)})` : ''}`).join(' · ');
  const open = META.filesOpen();
  $('files').innerHTML = META.FILES.map(([t, b], i) => `<div class="file${i < open ? '' : ' lock'}"><b>${i < open ? t : '🔒 FILE ' + (i + 1)}</b><br>${i < open ? b : `Recover ${(i + 1) * 3} intel caches to open.`}</div>`).join('');
}
$('lPlay').onclick = () => {                                                       // first launch: PLAY drops straight into the mission-1 drill (tour stays in Settings)
  unlockAudio();
  track('lobby', { k: 'play', m: playMode, o: onlineOn() ? 1 : 0 });
  if (onlineOn()) { netStart(); return; }
  dmStart(!store.get('sz_mode', null));
}; $('mDm').onclick = () => { playMode = 'dm'; store.set('sz_mode', playMode); lobbyV14(); };
$('lCrate').onclick = () => { if (!startMissionNow.n) { unlockAudio(); $('lPlay').click(); } };
{ const R = { lShop: ['cart', 'SHOP'], lLoadout: ['backpack', 'LOADOUT'], lPass: ['star', 'PASS'], lProfile: ['rank', 'PROFILE'] };
  for (const [id, [ic, t]] of Object.entries(R)) $(id).innerHTML = `${icon(ic)}<span>${t}</span>`;
  $('lSettings').innerHTML = icon('settings'); }
$('lLoadout').onclick = () => { openBriefing('agent'); };
$('lDaily').onclick = () => { unlockAudio(); const d = MODES.dailyToday(progress, MISSIONS.length); selected = d.idx; startMission(d.idx, { route: MISSIONS[d.idx].routes ? d.route : 'default', abilities: [], mode: 'daily' }); };
$('lSurv').onclick = () => { unlockAudio(); const i = (Math.random() * Math.min(progress, MISSIONS.length)) | 0; selected = i; startMission(i, { route: MISSIONS[i].routes ? 'assault' : 'default', abilities: [], mode: 'survival' }); };
$('lShop').onclick = openShop; $('lPass').onclick = openPass; $('lProfile').onclick = openProfile; $('lSettings').onclick = settingsUI;
$('lTutorial').onclick = () => { only('guide'); $('guide').querySelector('.card').scrollTop = 0; };
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
function idleAnim(dt) { for (const e of enemies) { e.tickAnim(dt); e.sync(); } for (const e of allies) { e.tickAnim(dt); e.sync(); } preview?.update(dt); efx?.update(dt); map?.kit.update(dt, performance.now() / 1000); }

// ---------- loop ----------
let last = performance.now(), manual = false, frames = 0, fpsT = 0, fps = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  // FPS every half second; dynamic resolution first (cheap, smooth), then drop a quality level if still slow
  frames++; fpsT += Math.min((now - (frame.prev ?? now)) / 1000, 1); frame.prev = now;
  if (fpsT >= 0.5) {
    fps = frames / fpsT; frames = 0; fpsT = 0;
    if (running && (frame.tk = (frame.tk || 0) + 1) % 30 === 0) track('fps', { fps: Math.round(fps), q: qLevel, s: Math.round(dynScale * 100) });
    if (running && !manual && settings.quality === 'high' && !settings.qUser && !IS_TOUCH) {   // safety net: High default on a slow PC -> hand over to Auto
      if (fps < 30) { if (++frame.lowHi >= 8) { frame.lowHi = 0; settings.quality = 'auto'; qLevel = 1; dynScale = 0.85; applyQuality(); store.set('sz_settings', settings); track('q', { k: 'auto', fps: Math.round(fps) }); } }
      else frame.lowHi = 0;
    }
    if (running && !manual && settings.quality === 'auto') {
      const target = IS_TOUCH ? 45 : 58;
      if (fps < target - 3) {
        if (dynScale > 0.55) { dynScale = Math.max(0.5, dynScale - (fps < target * 0.6 ? 0.15 : 0.07)); applyQuality(); }
        else if (++lowFpsT >= 4 && qLevel > 0) { qLevel--; lowFpsT = 0; dynScale = 0.8; applyQuality(); }
      } else { lowFpsT = 0; if (fps > target + 1 && (frame.up = (frame.up || 0) + 1) >= 3) { frame.up = 0; if (dynScale < 1) { dynScale = Math.min(1, dynScale + (fps > target * 1.3 ? 0.15 : 0.07)); applyQuality(); } else if (fps > target * 1.35 && qLevel < 1) { qLevel++; dynScale = 0.85; applyQuality(); } } }
    }
  }
  if (NET.on) netPump();
  if (!manual) {
    const t0 = performance.now(); if (!running) { if (outroT >= 0) outroT += dt; idleAnim(dt * outroScale()); } update(dt); const t1 = performance.now(); render(); const t2 = performance.now();
    if (TEST) { (window.__frames ??= []).push([+(t1 - t0).toFixed(1), +(t2 - t1).toFixed(1), +(now - (frame.last ?? now)).toFixed(0)]); if (window.__frames.length > 600) window.__frames.shift(); }
    frame.last = now;
  }
  requestAnimationFrame(frame);
}

// ---------- online (server/server.mjs + game/net.js): real players, bots fill the empty slots ----------
// Teams: the server says A or B; locally your team is always "blue" (allies array) and the map is flipped for team B so
// your base is the blue end. Other players and (unless you are the host) the bots are puppets: Enemy models driven by
// snapshots, no AI. The host (longest-connected player) runs the bot AI and streams the bots to everyone.
const NET = createNet(), mpUrl = () => serverUrl(Q, RC), _np = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, sp: 0, fl: 0, shot: 0, shotYaw: 0, shotPitch: 0, shotD: 0 };
let netOnlineN = 0;
const otherTeam = t => t === 'A' ? 'B' : 'A';
function netMsgBox(txt) {                                                          // small centred status line (connecting / lost)
  let el = $('dmLoad'); if (!txt) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'dmLoad'; document.body.append(el); } el.textContent = txt;
}
async function netStart() {
  unlockAudio(); if (NET.on) { netRound(); return; }
  if (netStart.busy) return; netStart.busy = true;
  netMsgBox('FINDING PLAYERS…');
  try {
    const name = (await crazy.username()) || store.get('sz_name', '');
    await NET.connect(mpUrl(), { mode: brOn() ? 'br' : hillOn() ? 'hill' : 'tdm', name, room: crazy.inviteRoom(), dev: IS_TOUCH ? 'm' : 'd' });
    NET.handler = netOnMsg; netMsgBox(null);
    track('net', { k: 'join', m: NET.mode, n: [...NET.ents.values()].filter(e => !e.bot).length, host: NET.host ? 1 : 0 });
    crazy.room(NET.room, true);
    netRound();
  } catch (e) {                                                                   // server down: play the same mode against bots instead of a dead end
    netMsgBox(null); track('net', { k: 'fail', m: String(e?.message || e).slice(0, 40) });
    NET.close(); dmStart(false); setTimeout(() => FX.announce('ONLINE UNAVAILABLE · PLAYING VS BOTS', 'objective'), 1200);
  } finally { netStart.busy = false; }
}
function netRound() {
  NET.ready = false; NET.wantEnd = null;
  if (NET.mode === 'br') {                                                         // battle royale: the island needs all four arenas loaded
    netMsgBox('LOADING ISLAND RING…');
    brLoad().then(() => { netMsgBox(null); startMission(0, { route: 'default', abilities: [], mode: 'dm', dmMap: BR_IDX }); }).catch(e => { errors.push('br map: ' + e); netQuit('MAP FAILED TO LOAD'); });
    return;
  }
  dmStart(false, NET.map);
}
function netLeave() { NET.handler = () => {}; NET.close(); crazy.room(null); }
function netQuit(why) { netLeave(); if (running || matchOver) { endMatch(); openLobby(); } FX.announce(why, 'objective'); }
function netSetup() {                                                              // dmSetup for an online round
  DM.br = NET.mode === 'br'; document.body.classList.toggle('br', DM.br); brClear();
  if (DM.br) { brSetup(); return; }
  const flip = NET.team === 'B';
  if (flip && map.teamSpawns) map.teamSpawns = { A: map.teamSpawns.B, B: map.teamSpawns.A };   // your base is always the blue end
  DM.tdm = true; document.body.classList.add('teams'); DM.gun = false; DM.hill = NET.mode === 'hill';
  DM.score = { A: NET.score[NET.team] || 0, B: NET.score[otherTeam(NET.team)] || 0 }; DM.hits = []; SS.ssA = null;
  DM.target = NET.target; DM.level = dmLevel; DM.gunI = 0; DM.grace = false; DM.graceN = 9; DM.walk = -1; DM.ease = 0;
  Object.assign(DM, { rampage: false, alive0: 0, coins: 0, d: 0, streak: 0, best: 0, k0: stats.kills, spawnT: 0, deadT: 0, lastK: -9, multi: 0, uavT: 0, odT: 0, hitT: 0, final: false });
  DM.pool = dmPool(); DM.recent = Array.from({ length: 10 }, () => ({ x: 0, z: 0, t: -99 })); DM.recentI = 0;
  DM.pool = DM.pool.length ? DM.pool : map.guards.map(g => g.clone()); DM.side = dmSides(DM.pool); DM.home = dmHomes(DM.pool, DM.side);
  DM.roster = [];
  player.pos.copy(dmSpot([], null, null, false, -1)); player.vel.set(0, 0, 0); faceFoe();
  for (const ne of NET.ents.values()) { if (ne.id === NET.me) continue; if (ne.bot && NET.host) netHostBot(ne); else if (ne.alive) netPuppet(ne); }
  if (DM.hill) { hillSetup(); if (NET.hill) netHillPos(NET.hill); else if (NET.host) NET.send({ t: 'hillpos', p: [+DM.hillPos.x.toFixed(2), +DM.hillPos.y.toFixed(2), +DM.hillPos.z.toFixed(2)] }); }
  NET.ready = true; netSpawned(); DM.boardDirty = true;
}
// ---------- battle royale (Island Ring): one life, shrinking zone, loot ----------
const BR = { loot: [], crates: null, beams: null, zone: null, ring: null, ar: 0, place: 0, warnT: 0, pickT: 0, botT: 0, zoneT: -1 };
const BR_GUNS = ['ar7_lance', 'kestrel_bp', 'grinder_lmg', 'warden_br', 'hailstorm_mg', 'bulldog_r6', 'longshot_bolt', 'harrow_45'];
const BR_COL = { med: 0x33c46a, armor: 0x2f5bff, gun: 0xffd23b };
const _brM = new THREE.Matrix4(), _brQ = new THREE.Quaternion(), _brS = V(), _brP = V(), _brC = new THREE.Color();
function brRng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function brClear() {
  for (const o of [BR.crates, BR.beams, BR.zone, BR.ring]) if (o) { o.removeFromParent(); o.geometry.dispose(); o.material.dispose(); }
  BR.crates = BR.beams = BR.zone = BR.ring = null; BR.loot = []; document.body.classList.remove('brOut');
}
function brSetup() {
  DM.tdm = false; document.body.classList.remove('teams'); DM.gun = false; DM.hill = false;
  DM.score = { A: 0, B: 0 }; DM.hits = []; SS.ssA = null; DM.target = 0; DM.level = dmLevel; DM.gunI = 0; DM.grace = false; DM.graceN = 9; DM.walk = -1; DM.ease = 0;
  Object.assign(DM, { rampage: false, alive0: 0, coins: 0, d: 0, streak: 0, best: 0, k0: stats.kills, spawnT: 0, deadT: 0, lastK: -9, multi: 0, uavT: 0, odT: 0, hitT: 0, final: true });
  DM.pool = dmPool(); DM.recent = Array.from({ length: 10 }, () => ({ x: 0, z: 0, t: -99 })); DM.recentI = 0; DM.pool = DM.pool.length ? DM.pool : map.guards.map(g => g.clone());
  DM.side = null; DM.home = null; DM.roster = [];
  Object.assign(BR, { ar: 0, place: 0, warnT: 0, pickT: 0, botT: 0, zoneT: -1 });
  player.pos.copy(brSpot()); player.vel.set(0, 0, 0); faceFoe();
  W.slots = ['vex_p9', 'harrow_45']; for (const id of W.slots) W.state[id] = { mag: WEAPONS[id].mag, reserve: META.reserveFor(id, WEAPONS[id].reserve) }; equip(0, true);   // everyone drops in with pistols: guns are loot
  for (const ne of NET.ents.values()) { if (ne.id === NET.me) continue; if (ne.bot && NET.host) netHostBot(ne); else if (ne.alive) netPuppet(ne); }
  brLootBuild(); brZoneFx();
  NET.ready = true; netSpawned(); DM.boardDirty = true;
  FX.announce('DROP IN · FIND A GUN · STAY IN THE ZONE', 'start');
}
function brSpot() {                                                                // a ground spot far from everyone already on the island
  const others = []; for (const e of [...enemies, ...allies]) if (e.alive) others.push(e.pos);
  let best = null, bd = -1;
  for (let i = 0; i < 40; i++) { const p = DM.pool[(Math.random() * DM.pool.length) | 0]; if (!p) continue; let d = 1e9; for (const o of others) d = Math.min(d, o.distanceToSquared(p)); if (d > bd) { bd = d; best = p; } if (d > 900) break; }
  return (best || DM.pool[0] || V(116, 0, 116)).clone();
}
function brLootBuild() {                                                           // same list on every client: the map's nav grid + the round's seed
  const b = NET.br; if (!b) return;
  const R = brRng(b.seed), nodes = world.nav?.nodes || [], out = [];
  for (let tries = 0; out.length < 150 && tries < 8000 && nodes.length; tries++) {
    const n = nodes[(R() * nodes.length) | 0], r = R(), g = BR_GUNS[(R() * BR_GUNS.length) | 0];
    if (!n || n.links.length < 6 || n.pos.y > 6) continue;
    if (out.some(o => (o.p.x - n.pos.x) ** 2 + (o.p.z - n.pos.z) ** 2 < 64)) continue;
    out.push({ i: out.length, p: n.pos.clone(), kind: r < 0.55 ? g : r < 0.8 ? 'med' : 'armor', taken: false, pend: -9 });
  }
  for (const i of b.taken || []) if (out[i]) out[i].taken = true;
  BR.loot = out; const n = out.length; if (!n) return;
  BR.crates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
  BR.beams = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }), n);
  out.forEach(o => { _brC.setHex(BR_COL[WEAPONS[o.kind] ? 'gun' : o.kind]); BR.crates.setColorAt(o.i, _brC); BR.beams.setColorAt(o.i, _brC); brLootSet(o); });
  scene.add(BR.crates, BR.beams);
}
function brLootSet(o) {
  const k = o.taken ? 0 : 1;
  _brM.compose(_brP.set(o.p.x, o.p.y + 0.25, o.p.z), _brQ.identity(), _brS.set(k, k, k)); BR.crates.setMatrixAt(o.i, _brM);
  _brM.compose(_brP.set(o.p.x, o.p.y + 1.6, o.p.z), _brQ, _brS); BR.beams.setMatrixAt(o.i, _brM);
  BR.crates.instanceMatrix.needsUpdate = BR.beams.instanceMatrix.needsUpdate = true;
}
function brZoneFx() {                                                              // the storm wall (current circle) + a white ring on the ground (next circle)
  BR.zone = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 72, 1, true), new THREE.MeshBasicMaterial({ color: 0xff2a6a, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  BR.ring = new THREE.Mesh(new THREE.RingGeometry(0.992, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
  BR.zone.renderOrder = BR.ring.renderOrder = 4; BR.ring.visible = false; scene.add(BR.zone, BR.ring); brZoneTick();
}
function brZoneTick() {
  const z = NET.zone || [NET.br?.from?.[0] ?? 116, NET.br?.from?.[1] ?? 116, NET.br?.from?.[2] ?? 175];
  if (BR.zone) { BR.zone.position.set(z[0], 20, z[1]); BR.zone.scale.set(z[2], 60, z[2]); }
  const to = NET.br?.to; if (BR.ring && to && NET.br.ph >= 0) { BR.ring.visible = true; BR.ring.position.set(to[0], 0.35, to[1]); BR.ring.scale.set(to[2], 1, to[2]); }
  return z;
}
function brTick(dt) {                                                              // every frame of a BR round
  const z = brZoneTick(), out = player.alive && (player.pos.x - z[0]) ** 2 + (player.pos.z - z[1]) ** 2 > z[2] * z[2];
  document.body.classList.toggle('brOut', !!out);
  if (out && (BR.warnT -= dt) <= 0) { BR.warnT = 4; FX.announce('OUTSIDE THE ZONE · GET IN', 'objective'); }
  const zt = Math.ceil(NET.zoneShrink > 0 ? NET.zoneShrink : NET.zoneNext); if (zt !== BR.zoneT) { BR.zoneT = zt; DM.boardDirty = true; }
  if ((BR.pickT -= dt) <= 0) {                                                     // loot: walk over it (you), host bots grab what they pass
    BR.pickT = 0.15;
    for (const o of BR.loot) {
      if (o.taken || elapsed - o.pend < 1.2) continue;
      if (player.alive && Math.abs(player.pos.y - o.p.y) < 1.6 && (player.pos.x - o.p.x) ** 2 + (player.pos.z - o.p.z) ** 2 < 2.4 && o.kind !== W.slots[0] && !(o.kind === 'med' && player.hp >= 100) && !(o.kind === 'armor' && BR.ar >= 100)) {
        o.pend = elapsed; NET.send({ t: 'pick', i: o.i, k: WEAPONS[o.kind] ? 'gun' : o.kind }); continue;
      }
      if (NET.host) for (const r of DM.roster) { const e = r.e; if (e?.alive && Math.abs(e.pos.y - o.p.y) < 1.6 && (e.pos.x - o.p.x) ** 2 + (e.pos.z - o.p.z) ** 2 < 2.4 && brBotWants(r, o)) { o.pend = elapsed; NET.send({ t: 'pick', i: o.i, k: WEAPONS[o.kind] ? 'gun' : o.kind, s: r.nid }); break; } }
    }
  }
  if (NET.host && (BR.botT -= dt) <= 0 && NET.br?.to) {                            // host bots: move into the next circle in time
    BR.botT = 1; const to = NET.br.to;
    for (const r of DM.roster) { const e = r.e; if (!e?.alive || e.T.static) continue; const dx = e.pos.x - to[0], dz = e.pos.z - to[1], lim = to[2] * 0.8;
      if (dx * dx + dz * dz > lim * lim && (e.state !== 'combat' || Math.random() < 0.3)) { const a = Math.random() * 6.283, rr = Math.random() * to[2] * 0.6; e.goTo(V(to[0] + Math.cos(a) * rr, 0, to[1] + Math.sin(a) * rr), G); }
      else if (e.state !== 'combat') brBotLoot(r, e, to); }
  }
}
function brBotWants(r, o) { return o.kind === 'med' ? r.e.hp < 100 : o.kind === 'armor' ? (r.ar || 0) < 100 : !r.gun; }
function brBotLoot(r, e, to) {                                                    // a calm bot walks to the nearest loot it wants (within 30 m, inside the next circle)
  let best = null, bd = 900;
  for (const o of BR.loot) {
    if (o.taken || o === e.lootBan || Math.abs(e.pos.y - o.p.y) > 4 || !brBotWants(r, o)) continue;
    const d = (e.pos.x - o.p.x) ** 2 + (e.pos.z - o.p.z) ** 2; if (d >= bd) continue;
    if ((o.p.x - to[0]) ** 2 + (o.p.z - to[1]) ** 2 > to[2] * to[2]) continue;
    bd = d; best = o;
  }
  if (best && e.loot === best) {
    if (elapsed - e.lootT > 12) { e.lootBan = best; e.loot = null; return; }          // could not get there: try another one next time
    if (!e.path) { e.repathT = 0; e.goTo(best.p, G); } return;
  }
  e.loot = best; e.lootT = elapsed; if (!best) return;
  e.state = 'patrol'; e.lastKnown = null; e.post.copy(best.p); e.wanderT = 4; e.repathT = 0; e.goTo(best.p, G);   // the patrol "post" moves to the loot: the bot walks there, then hangs about
}
// host AI level of detail in BR: a bot near a human thinks every frame, further out every 3rd/6th frame (combat: every 2nd/3rd)
const _brHum = []; let _brHumN = 0;
function brHumans() {
  _brHumN = 0; if (player.alive) _brHum[_brHumN++] = player.pos;
  for (const e of enemies) if (e.net && e.human && e.alive && e.netOk) _brHum[_brHumN++] = e.pos;
}
function brNearestHuman(e) { let d = 1e9; for (let i = 0; i < _brHumN; i++) { const p = _brHum[i], q = (p.x - e.pos.x) ** 2 + (p.z - e.pos.z) ** 2; if (q < d) d = q; } return d; }   // squared m
function brLodPer(e) {
  const d = brNearestHuman(e);
  const c = e.state === 'combat';
  return d < 3600 ? 1 : d < 16900 ? (c ? 2 : 3) : (c ? 3 : 6);
}
function brTook(m) {
  const o = BR.loot[m.i]; if (o) { o.taken = true; brLootSet(o); }
  if (m.by === NET.me && o) {
    if (WEAPONS[o.kind]) { const id = o.kind; W.slots = [id, W.slots[1] || 'vex_p9']; W.state[id] = { mag: WEAPONS[id].mag, reserve: META.reserveFor(id, WEAPONS[id].reserve) }; equip(0, true); FX.announce(WEAPONS[id].name.toUpperCase(), 'start'); }
    else if (o.kind === 'med') { player.hp = m.hp; FX.announce('+50 HEALTH', 'start'); }
    else { BR.ar = m.ar; FX.announce(`ARMOR ${m.ar}`, 'start'); }
    sfx.coin?.(); DM.boardDirty = true;
  } else if (o && NET.host) {                                                     // one of my bots took it
    const r = DM.roster.find(q => q.nid === m.by); if (!r) return;
    r.ar = m.ar; if (r.e) r.e.hp = m.hp; if (WEAPONS[o.kind]) r.gun = o.kind;
  }
}
function brBoard(el) {
  const zs = NET.zoneShrink > 0, t = Math.max(0, Math.ceil(zs ? NET.zoneShrink : NET.zoneNext)), mm = `${(t / 60) | 0}:${String(t % 60).padStart(2, '0')}`;
  el.innerHTML = `<div class="tA"><span>ALIVE</span><b>${NET.alive || NET.ents.size}</b></div><div class="me"><span>KILLS</span><b>${stats.kills - DM.k0}</b></div><div class="tg"><span>${zs ? 'ZONE CLOSING' : NET.br?.ph >= 4 && !zs ? 'FINAL ZONE' : 'ZONE MOVES IN'}</span><b>${mm}</b></div>${BR.ar > 0 ? `<div class="tB"><span>ARMOR</span><b>${BR.ar}</b></div>` : ''}`;
}
function netSpawned() { NET.send({ t: 'r', p: [+player.pos.x.toFixed(2), +player.pos.y.toFixed(2), +player.pos.z.toFixed(2)] }); }
function netHillPos(p) { if (!DM.hillPos) return; DM.hillPos.set(p[0], p[1], p[2]); DM.hillFx?.g.position.copy(DM.hillPos); }
function netHillOwn() { const o = NET.hillOwn; return o === NET.team ? 'A' : o === otherTeam(NET.team) ? 'B' : o; }
function netHostBot(ne) {                                                          // the host runs this bot's AI
  const r = { i: DM.roster.length, nid: ne.id, name: ne.name, k: ne.k || 0, d: ne.d || 0, e: null, respT: null, type: null, jumper: Math.random() < 0.5, ally: ne.team === NET.team };
  DM.roster.push(r); if (ne.alive) dmBot(r); return r;
}
function netPuppet(ne) {                                                           // a model that follows the snapshots of player/bot `ne`
  netDropPuppet(ne.id, true);
  const ally = ne.team === NET.team, type = 'guard', skin = botAssets(type, ne.id);
  const e = new Enemy(type, skin || A.enemies[type], ne.p ? V(ne.p[0], ne.p[1], ne.p[2]) : V(0, -50, 0), { yaw: ne.yaw || 0 }); scene.add(e.root); e.skin = !!skin;
  e.net = true; e.nid = ne.id; e.human = !ne.bot; e.hp = ne.hp ?? 100; e.abCD = 1e9; e.callsign = ne.name; e.ident = ne; e.shotK = -9;
  e.root.scale.setScalar(RC.dmBotScale); e.root.visible = false;
  if (ally) { e.ally = true; allies.push(e); } else enemies.push(e);
  toonify(e.root, { rim: ally ? 0x6ab8ff : 0xff6a5a }); outline(e.root, { thick: 0.025, color: ally ? 0x2f9bff : 0xff2a3a, force: true }); nameTag(e);
  return e;
}
function netDrop(e) { scene.remove(e.root); if (e.tag) { e.tag.material.map.dispose(); e.tag.material.dispose(); } enemies = enemies.filter(o => o !== e); allies = allies.filter(o => o !== e); }
function netDropPuppet(id, aliveOnly) { for (const e of [...enemies, ...allies]) if (e.nid === id && (!aliveOnly || e.alive)) netDrop(e); }
function netObj(id, any) {                                                         // the live model for server id (any: also a corpse)
  let dead = null;
  for (const e of enemies) if (e.nid === id) { if (e.alive) return e; dead = e; }
  for (const e of allies) if (e.nid === id) { if (e.alive) return e; dead = e; }
  return any ? dead : null;
}
function netPuppetTick(e, dt) {
  e.mixer.update(dt);
  if (!NET.pose(e.nid, _np) || _np.y < -40) { e.root.visible = e.netOk = false; return; }
  e.root.visible = e.netOk = true;                                                // (render() still frustum-culls it)
  e.pos.set(_np.x, _np.y, _np.z); e.yaw = _np.yaw; e.flinch = Math.max(0, e.flinch - dt * 6);
  if (_np.shot) {                                                                  // shots ride in the snapshots: draw them as the puppet reaches that moment
    const c = Math.cos(_np.shotPitch); _netA.set(e.pos.x, e.pos.y + 1.45 * RC.dmBotScale, e.pos.z);
    _netB.set(_netA.x + Math.sin(_np.shotYaw) * c * _np.shotD, _netA.y + Math.sin(_np.shotPitch) * _np.shotD, _netA.z + Math.cos(_np.shotYaw) * c * _np.shotD);
    e.shotK = 0.35; for (let i = Math.min(3, _np.shot); i > 0; i--) enemyFired(e, _netA, _netB, 0, null);
  }
  e.shotK -= dt; e.netShow = e.shotK > -1.5; const sp = _np.sp;   // render(): a player who fired in the last ~2 s stays drawn past the LOD range
  e.play(e.shotK > 0 && sp < 2.6 ? e.cn('shoot') : sp > 2.6 ? e.cn('run') : sp > 0.2 ? e.cn('walk') : e.cn('idle'));
  const a = e.actions[e.clip]; if (a && /walk|run/.test(e.clip)) a.timeScale = clamp(sp / (e.clip.startsWith('run') ? 3.6 : 1.6), 0.5, 1.6);
  e.sync();
}
function netPump() {                                                               // every frame: my state + (host) the bots
  if (!NET.ready || mode !== 'dm') return;
  NET.frame();
  const t = performance.now() / 1000, sp = Math.hypot(player.vel.x, player.vel.z);
  if (TEST && window.__walkFn) window.__walkFn(player.pos, t);                      // tests: a scripted walk, sampled right when the state goes out
  NET.sendState(t, player.alive ? player.pos : _netDead, player.yaw + Math.PI, player.pitch, sp, cur(), player.alive);
  if (NET.host && NET.botsBegin(t)) {
    const lod = DM.br; NET.botN = (NET.botN || 0) + 1;
    for (const r of DM.roster) {
      const e = r.e; if (!e || !e.alive) continue;
      if (lod && (NET.botN + r.nid) % 4 && brNearestHuman(e) > 14400) continue;      // BR: bots over 120 m from every human go up at 5 Hz
      NET.bot(r.nid, e.pos.x, e.pos.y, e.pos.z, e.yaw, Math.hypot(e.vel.x, e.vel.z), e.state === 'combat' ? 1 : 0);
    }
    NET.botsSend();
  }
}
const _netDead = V(0, -50, 0);
function netRows() {
  const rows = [...NET.ents.values()].map(e => ({ name: e.id === NET.me ? 'YOU' : e.name, k: e.k || 0, d: e.d || 0, me: e.id === NET.me, ally: e.team === NET.team, dead: e.id === NET.me ? !player.alive : !e.alive, bot: e.bot }));
  return rows.sort((a, b) => b.k - a.k || a.d - b.d);
}
function netMyKill(v, head) {                                                      // the server confirmed my kill: the usual kill feedback
  const n = FX.streakTick(performance.now()); FX.killBanner(head ? 'HEADSHOT' : 'ELIMINATED', { head, streak: n }); FX.xpPop(META.XP.kill + (head ? META.XP.head : 0), head ? 'HEADSHOT' : 'KILL');
  hitMarker(true, head); if (head) FEEL.hitStop = 0.06;
  dmKill(); stats.kills++; if (stats.kills === 1) track('kill1', { m: mission.id, t: Math.round(elapsed), o: 1 });
  killTick(head, null); matchXP.kills += META.XP.kill; if (head) matchXP.heads += META.XP.head; sfx.kill(stats.kills, head);
}
function netOnMsg(m) {
  if (m.t === 'closed') { if (running || paused || matchOver) netQuit('CONNECTION LOST'); return; }
  if (m.t === 'round') { if (matchOver && $('end').classList.contains('show')) { clearInterval(autoNextT); netRound(); } return; }
  if (m.t === 'host') { if (NET.ready) m.on === false ? netLoseHost() : netBecomeHost(); return; }
  if (!NET.ready || mode !== 'dm') return;
  const my = NET.team;
  switch (m.t) {
    case 'snap': {
      const a = NET.score[my] || 0, b = NET.score[otherTeam(my)] || 0;
      if (a !== DM.score.A || b !== DM.score.B) { DM.score.A = a; DM.score.B = b; DM.boardDirty = true; }
      break;
    }
    case 'add': if (m.e.bot && NET.host) netHostBot(NET.ents.get(m.e.id)); else if (m.e.alive) netPuppet(NET.ents.get(m.e.id)); DM.boardDirty = true; if (!m.e.bot) feed(`${m.e.name} JOINED`); break;
    case 'del': {
      const ri = DM.roster.findIndex(r => r.nid === m.id); if (ri >= 0) { const r = DM.roster[ri]; if (r.e) netDrop(r.e); DM.roster.splice(ri, 1); }
      netDropPuppet(m.id, false); DM.boardDirty = true; break;
    }
    case 'sp': { const ne = NET.ents.get(m.id); if (ne && !(ne.bot && NET.host)) netPuppet(ne); break; }
    case 'f': {
      const e = netObj(m.s); if (!e || !e.net) break;
      e.shotK = 0.35; _netA.set(m.a[0], m.a[1], m.a[2]); _netB.set(m.b[0], m.b[1], m.b[2]); enemyFired(e, _netA, _netB, 0, null);
      break;
    }
    case 'dmg': {
      const s = netObj(m.s, true);
      if (m.v === NET.me) { if (m.ar != null) { BR.ar = m.ar; DM.boardDirty = true; } if (!player.alive) break; LS.by = s?.type || ''; LS.byE = s; const inv = invT; invT = 0; player.hp = m.hp + m.d; damagePlayer(m.d, s ? s.pos.clone() : null); invT = inv; player.hp = m.hp; break; }
      const e = netObj(m.v); if (!e) break;
      if (e.net) { e.hp = m.hp; e.flinch = 1; break; }
      e.shieldHP = 0; e.hp = m.hp + m.d; e.damage(m.d, (s ? s.pos : e.pos).clone(), m.hd ? 'head' : 'body');   // host bot: flinch + alert, dies at 0
      break;
    }
    case 'kill': {
      const s = NET.ents.get(m.s), v = NET.ents.get(m.v), ve = m.v === NET.me ? null : netObj(m.v, true);
      if (ve && ve.alive) { ve.hp = 0; ve.die(); }
      if (m.v === NET.me && player.alive) { player.hp = 0; sfx.death(); director.death(); LS.byE = netObj(m.s, true); dmDeath(); }
      if (m.s === NET.me) netMyKill(ve, m.hd);
      if (s && v) feed(`${s.id === NET.me ? 'YOU' : s.name} ▸ ${v.id === NET.me ? 'YOU' : v.name}${m.hd ? ' ✦' : ''}`, m.hd);
      else if (!m.s && v) feed(`ZONE ▸ ${v.id === NET.me ? 'YOU' : v.name}`, false);
      if (DM.br && m.v === NET.me) { BR.place = m.pl; setTimeout(() => { if (DM.br && NET.on && !matchOver) dmEnd(false); }, 2200); }
      if (s?.bot && NET.host) { const r = DM.roster.find(q => q.nid === m.s); if (r) r.k = m.sk; }
      if (v?.bot && NET.host) { const r = DM.roster.find(q => q.nid === m.v); if (r) r.d = m.vd; }
      DM.score.A = m.score[my] || 0; DM.score.B = m.score[otherTeam(my)] || 0; DM.boardDirty = true;
      break;
    }
    case 'hillpos': netHillPos(m.p); break;
    case 'took': if (DM.br) brTook(m); break;
    case 'zone': if (DM.br) { FX.announce(`ZONE ${m.ph + 1} CLOSING · ${Math.round(m.sh)} S`, 'objective'); DM.boardDirty = true; } break;
    case 'end': {
      if (DM.br) { if (m.win === NET.me) BR.place = 1; dmEnd(m.win === NET.me); break; }
      DM.score.A = m.score[my] || 0; DM.score.B = m.score[otherTeam(my)] || 0; NET.next = m.next; NET.endAt = performance.now();
      if (m.win !== 'draw' && m.win !== my) DM.score.B = Math.max(DM.score.B, DM.score.A + (DM.score.A === DM.score.B ? 1 : 0));   // never show a win the server did not call
      dmEnd(m.win === my); break;
    }
  }
}
const _netA = V(), _netB = V();
function netLoseHost() {                                                           // a desktop took over the bots: they become puppets here
  for (const r of DM.roster) { if (r.e) netDrop(r.e); const ne = NET.ents.get(r.nid); if (ne?.alive) netPuppet(ne); }
  DM.roster.length = 0;
}
function netBecomeHost() {                                                         // the old host left: run the bots from here on
  if (NET.host && DM.roster.length) return; NET.host = true; track('net', { k: 'host' });
  for (const ne of NET.ents.values()) {
    if (!ne.bot) continue;
    const pe = netObj(ne.id); if (pe) netDrop(pe);
    const r = netHostBot({ ...ne, alive: false }); r.respT = ne.alive ? 0.01 : null;
    if (ne.alive && pe) { dmBot(r); r.respT = null; r.e.pos.copy(pe.pos); r.e.yaw = pe.yaw; r.e.sync(); }
  }
}
function netEndScreen() {                                                          // the same room plays on: count down to the server's next round
  const lbl = n => `NEXT ROUND IN ${n}`; let n = Math.max(1, Math.round(NET.next || 12));
  $('again').textContent = lbl(n); $('again').className = 'go';
  clearInterval(autoNextT); autoNextT = setInterval(() => { n = Math.max(0, n - 1); $('again').textContent = n ? lbl(n) : 'STARTING…'; if (!n) clearInterval(autoNextT); }, 1000);
}
async function netCount() {                                                        // lobby: "N ONLINE" from the server's HTTP status
  const u = mpUrl(); if (!u) return; try { const r = await fetch(u.replace(/^ws/, 'http'), { cache: 'no-store' }); const j = await r.json(); netOnlineN = j.players | 0; if ($('lobby').classList.contains('show')) lobbyV14(); } catch { /* offline */ }
}

// ---------- test / debug API ----------
window.__game = { RC, G, outro: t => outro(t, () => {}), get dmWalk() { return DM.walkLog || (DM.walk && DM.walk.e ? { walking: +DM.walk.t.toFixed(1), dist: +DM.walk.e.pos.distanceTo(DM.walk.spot).toFixed(1) } : { walk: DM.walk, grace: DM.grace }); }, get allies() { return allies; }, tdmScore, ui: { board: showBoard, pause: () => { if (!running) return; doPause(); } },
  errors, get ready() { return !!A.enemies; }, MISSIONS, WEAPONS, ABILITIES,
  async brPreview() { await brLoad(); const t0 = performance.now(); startMission(0, { route: 'default', abilities: [], mode: 'dm', dmMap: BR_IDX }); return { ms: Math.round(performance.now() - t0), nav: world.nav?.nodes?.length || 0 }; },
  view(x, y, z, tx, ty, tz, all = false) { manual = true; render.noCull = all; if (all) { for (const r of map.regions || []) for (const ob of r.objs) ob.visible = true; scene.fog.near = 2000; scene.fog.far = 3000; camera.far = 1200; camera.near = 1; camera.updateProjectionMatrix(); } camera.position.set(x, y, z); camera.lookAt(tx, ty, tz); camera.updateMatrixWorld(); if (!all && map?.cull) map.cull(camera.position); renderer.info.autoReset = false; renderer.info.reset(); renderer.clear(); renderer.render(scene, camera); return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; },
  brPath(a, b) { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), na = world.nearestNode(A), nb = world.nearestNode(B), p = world.findPath(A, B); return { na: na && na.pos.toArray().map(Math.round), nb: nb && nb.pos.toArray().map(Math.round), la: na?.links.length, n: p?.length ?? null }; },
  brReach() { const T = new THREE.Vector3(116, 0.1, 128); return (map.regions || []).map(r => { const d = DM_MAPS.find(q => q.id === r.id), out = []; for (const [fx, fz] of [[0.5, 0.5], [0.3, 0.5], [0.7, 0.5]]) { const p = new THREE.Vector3(r.x0 + d.w * fx, 0.5, r.z0 + d.d * fz), path = world.findPath(p, T); let ex = null; if (path) for (const q of path) if (q.x < r.x0 || q.x > r.x0 + d.w || q.z < r.z0 || q.z > r.z0 + d.d) { ex = [Math.round(q.x), Math.round(q.z)]; break; } out.push(path ? { n: path.length, ex, end: [Math.round(path.at(-1).x), Math.round(path.at(-1).z)] } : null); } return [r.id, out]; }); },
  get mapInfo() { return map && { br: !!map.br, pois: map.pois, regions: map.regions?.map(r => { let n = 0, g = 0; r.objs[0].traverse(o => { if (o.isMesh) { n++; if (o.geometry.attributes.position) g++; } }); return [r.id, r.x0, r.z0, r.objs[0].visible, r.objs[0].parent === scene, n, g, r.objs[0].position.toArray()]; }) }; },
  get net() { const pz = [...enemies, ...allies].filter(e => e.net); return { on: NET.on, ready: !!NET.ready, host: NET.host, team: NET.team, me: NET.me, room: NET.room, mode: NET.mode, map: NET.map, ents: NET.ents.size, puppets: pz.length, livePuppets: pz.filter(e => e.alive && e.netOk).length, stuck: pz.filter(e => e.alive && !e.netOk && NET.ents.get(e.nid)?.buf.length).length, stuckInfo: pz.filter(e => e.alive && !e.netOk && NET.ents.get(e.nid)?.buf.length).map(e => { const n = NET.ents.get(e.nid); return [e.nid, n.bot, n.alive, n.buf[n.buf.length - 1]?.slice(1, 4)]; }), roster: DM.roster?.length || 0, aiBots: DM.roster?.filter(r => r.e?.alive).length || 0, score: { ...NET.score }, clock: NET.clock, ping: NET.ping, hill: DM.hillPos?.toArray(), hillOwn: NET.hillOwn }; },
  netStart: (k = 'otdm') => { setModeKey(k); netStart(); }, get br() { return { on: !!DM.br, loot: BR.loot.length, taken: BR.loot.filter(o => o.taken).length, ar: BR.ar, place: BR.place, zone: NET.zone, alive: NET.alive, slots: W.slots.slice(), out: document.body.classList.contains('brOut') }; }, brLoot: () => BR.loot.map(o => [o.i, o.kind, +o.p.x.toFixed(1), +o.p.y.toFixed(1), +o.p.z.toFixed(1), o.taken]), netLeave: () => { netLeave(); openLobby(); }, netObj: id => { const e = netObj(id); return e && { pos: e.pos.toArray(), alive: e.alive, hp: e.hp, net: !!e.net, visible: e.root.visible }; }, NET,
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
  addKills(n) { stats.kills += n; }, fragOne() { const e = enemies.find(x => x.alive); if (!e) return false; e.damage(9999); stats.kills++; killTick(false, e); return true; }, get gunI() { return DM.gunI; }, GUN_LADDER, get weapon() { return W.slots[0]; }, get hill() { return DM.hill ? { pos: DM.hillPos, owner: DM.hillOwner, A: DM.score.A, B: DM.score.B, inHill: DM.inHill } : null; }, get ignorePlayer() { return G.ignorePlayer; }, get dmPower() { return G.dmPower; },
  director, QUESTS, dmSpot, killTick, loadBotSkins, botKill, ffaRival, get playMode() { return playMode; }, DM, get W() { return W; }, setTrial(id) { trialWeapon = id; }, get trial() { return trialWeapon; }, lobbyV14, win: () => win(),
  get tutorial() { return tutorial; }, get onboard() { return onboard; }, startOnboarding, get mentor() { return mentor; }, TUT,
  killAll() { for (const e of enemies) if (e.alive) e.damage(9999); },
  peace() { for (const e of enemies) { e.update = function (dt) { this.mixer.update(dt); this.sync(); }; } },
  damage: (n) => damagePlayer(n, null), timeout() { clock = 0.01; }, dmScore(a, b) { DM.score.A = a; DM.score.B = b; },
  get scene() { return scene; }, get renderer() { return renderer; }, get camera() { return camera; },
  setQuality(q) { settings.quality = q; qLevel = q === 'high' ? 2 : 1; applyQuality(); },
  get info() { return { ...renderer.info.render, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, q: qLevel, fps }; },
  get player() { return player; }, get guide() { return GUIDE; }, get enemies() { return enemies; }, get world() { return world; }, get map() { return map; },
};


// ---------- v26 UI: score strip, weapon slots, Tab scoreboard, death recap, pause menu, lobby mode picker ----------
const onlineOn = () => !!mpUrl() && !!store.get('sz_online', 0);
const teamsOn = () => { const v = store.get('sz_teams', null); return v === null ? !!RC.dmTeams : !!v; };
const gunOn = () => !teamsOn() && !!store.get('sz_gun', 0);
const hillOn = () => teamsOn() && !!store.get('sz_hill', 0);                     // Blastline Hold the Hill: teams score by standing in the zone                       // Blastline Gun Run: free-for-all with a weapon ladder
const brOn = () => onlineOn() && !!store.get('sz_br', 0);
const modeKey = () => (onlineOn() ? 'o' : '') + (brOn() ? 'br' : hillOn() ? 'hill' : teamsOn() ? 'tdm' : gunOn() ? 'gun' : 'dm');
const MODE_NAME = { tdm: 'TEAM DEATHMATCH', dm: 'FREE FOR ALL', gun: 'GUN RUN', hill: 'HOLD THE HILL', otdm: 'ONLINE TEAM DEATHMATCH', ohill: 'ONLINE HOLD THE HILL', obr: 'BATTLE ROYALE' };
function setModeKey(k) { const on = k === 'otdm' || k === 'ohill' || k === 'obr'; store.set('sz_online', on ? 1 : 0); if (on) k = k.slice(1); store.set('sz_br', k === 'br' ? 1 : 0); playMode = 'dm'; store.set('sz_mode', 'dm'); store.set('sz_teams', k === 'tdm' || k === 'hill' ? 1 : 0); store.set('sz_gun', k === 'gun' ? 1 : 0); store.set('sz_hill', k === 'hill' ? 1 : 0); }
const SS = {}, mmss = s => { s = Math.max(0, Math.ceil(s)); return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; };
const BOT_W = { pistol: 'vex_p9', assault: 'ar7_lance', 'machine gun': 'hailstorm_mg', sniper: 'longshot_bolt' };
function stripSetup() {
  for (const id of ['ssA', 'ssB', 'ssT', 'ssG', 'ssLa', 'ssLb']) SS[id] = $(id);
  SS.a = SS.b = SS.t = -1;
  SS.ssLa.textContent = DM.tdm ? 'BLUE' : 'KILLS'; SS.ssLb.textContent = DM.tdm ? 'RED' : DM.br ? 'ALIVE' : 'TARGET';
  SS.ssG.textContent = DM.tdm ? `FIRST TO ${dmTarget()}` : DM.br ? 'ZONE MOVES IN' : `LEVEL ${DM.level || 1}`; SS.zs = -1;
  document.body.classList.toggle('teams', !!DM.tdm);
}
function stripTick() {                                                             // allocation-free: only touches the DOM when a number changes
  if (!SS.ssA) stripSetup();
  const zs = DM.br && NET.zoneShrink > 0 ? 1 : 0, a = DM.tdm ? DM.score.A : stats.kills - DM.k0, b = DM.tdm ? DM.score.B : DM.br ? NET.alive || NET.ents.size : dmTarget(), t = Math.ceil(DM.br ? (zs ? NET.zoneShrink : NET.zoneNext) : clock);   // BR: the clock counts down the zone
  if (DM.br && zs !== SS.zs) { SS.zs = zs; SS.ssG.textContent = zs ? 'ZONE CLOSING' : 'ZONE MOVES IN'; }
  if (a !== SS.a) { SS.a = a; SS.ssA.textContent = a; }
  if (b !== SS.b) { SS.b = b; SS.ssB.textContent = b; }
  if (t !== SS.t) { SS.t = t; SS.ssT.textContent = mmss(t); SS.ssT.classList.toggle('low', t <= 30); }
}
function wslots() {                                                                // right-hand weapon column: slot keys + rendered gun icons
  const el = $('wslots'); if (!el) return;
  el.innerHTML = W.slots.map((id, i) => `<div class="ws${i === W.cur ? ' on' : ''}" data-i="${i}"><img src="${A.icons[id] || ''}" alt=""><span class="k">${i + 1}</span></div>`).reverse().join('');
  if (!touch) el.querySelectorAll('.ws').forEach(d => d.onmousedown = e => { e.stopPropagation(); if (running && +d.dataset.i !== W.cur) equip(+d.dataset.i); });   // desktop: click a slot (phones go through the touch layer)
}
function boardRows() {
  if (NET.on) return netRows();
  const me = { name: 'YOU', k: stats.kills - DM.k0, d: DM.d, me: true, ally: true };
  const bots = (DM.roster || []).map(r => ({ name: r.name, k: r.k, d: r.d, ally: !!r.ally, dead: !(r.e && r.e.alive) }));
  return [me, ...bots].sort((a, b) => b.k - a.k || a.d - b.d);
}
function boardHTML(compact) {
  const rows = boardRows(), row = r => `<div class="br${r.me ? ' me' : ''}${r.dead ? ' dead' : ''}">${icon(r.dead ? 'skull' : 'user')}<span>${r.name}</span><b>${r.k}</b><i>${r.d}</i></div>`;
  const head = '<div class="br bh"><span></span><span>PLAYER</span><b>K</b><i>D</i></div>';
  if (!DM.tdm) return `<div class="bcol"><div class="bt">${DM.gun ? 'GUN RUN · ' + dmTarget() + ' GUNS' : 'FREE FOR ALL · FIRST TO ' + dmTarget()}</div>${head}${rows.map(row).join('')}</div>`;
  const col = (ally, name, sc) => `<div class="bcol ${ally ? 'ta' : 'tb'}"><div class="bt"><span>${name}</span><b>${sc}</b></div>${compact ? '' : head}${rows.filter(r => r.ally === ally).map(row).join('')}</div>`;
  return col(true, 'BLUE TEAM', DM.score.A) + (compact ? '' : `<div class="bmid"><em>TEAM DEATHMATCH</em><span>${(mission?.title || '').toUpperCase()}</span><small>${mmss(clock)}</small><span>FIRST TO ${dmTarget()}</span></div>`) + col(false, 'RED TEAM', DM.score.B);
}
function showBoard(on) {
  const el = $('tabBoard'); if (!el) return;
  if (on && mode === 'dm' && !matchOver) { el.innerHTML = boardHTML(false); el.classList.add('show'); clearInterval(showBoard.t); showBoard.t = setInterval(() => { if (el.classList.contains('show')) el.innerHTML = boardHTML(false); }, 500); }
  else { el.classList.remove('show'); clearInterval(showBoard.t); }
}
document.addEventListener('keydown', e => { if (e.code === 'Tab' && running) showBoard(true); });
document.addEventListener('keyup', e => { if (e.code === 'Tab') showBoard(false); });
$('sStrip').addEventListener('pointerdown', () => { const el = $('tabBoard'); showBoard(!el.classList.contains('show')); });
function dcFill() {                                                                // death recap: killer, damage taken, killer's gun
  const e = LS.byE, ally = false, dmg = (DM.hits || []).slice(-6);
  $('dcAv').innerHTML = icon('skull'); $('dcAv').className = 'av' + (ally ? ' ta' : '');
  $('dcDmg').innerHTML = dmg.length ? dmg.map((h, i) => `<span class="${i === dmg.length - 1 ? 'last' : ''}">-${h}</span>`).join('') : '<span>—</span>';
  const wid = e ? BOT_W[e.S.cls] || 'ar7_lance' : null;
  $('dcWimg').src = wid ? A.icons[wid] || '' : ''; $('dcWimg').style.visibility = wid ? 'visible' : 'hidden';
  $('dcHow').textContent = e ? `${(WEAPONS[wid]?.name || e.S.cls || 'RIFLE').toUpperCase()} · ${Math.round(e.pos.distanceTo(player.pos))} M` : '';
  $('dcKeys').style.display = touch ? 'none' : '';
}
$('dcard').addEventListener('pointerdown', e => { if (!e.target.closest('#dcLo button')) dcRespawnNow(); });
function killCam(dt) {                                                             // while dead: turn the camera toward whoever got you
  const e = LS.byE; if (!e || !e.alive) return;
  const ex = e.pos.x - player.pos.x, ez = e.pos.z - player.pos.z, ty = Math.atan2(-ex, -ez), tp = Math.atan2(e.pos.y + 1.2 - player.pos.y - CFG.eye, Math.hypot(ex, ez));
  let d = ty - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); player.yaw += d * Math.min(1, dt * 4); player.pitch += (tp - player.pitch) * Math.min(1, dt * 4);
}
const pzModes = () => mpUrl() ? [['obr', 'BATTLE ROYALE', 'skull', 'ISLAND RING · 50 PLAYERS · LAST ONE STANDING'], ['otdm', 'ONLINE TEAM DM', 'squad', 'REAL PLAYERS + BOTS · 4 V 4'], ['ohill', 'ONLINE HOLD THE HILL', 'flag', 'REAL PLAYERS + BOTS · 4 V 4'], ...PZ_MODES] : PZ_MODES;
const PZ_MODES = [['tdm', 'TEAM DEATHMATCH', 'squad', '5 V 5 · BOTS'], ['dm', 'FREE FOR ALL', 'skull', 'EVERY BOT FOR ITSELF'], ['gun', 'GUN RUN', 'assault-rifle', 'EVERY KILL, A NEW GUN'], ['hill', 'HOLD THE HILL', 'flag', 'STAND IN THE ZONE']];   // rebrand: story campaign cut
function pauseFill() {
  const dm = mode === 'dm';
  $('pzMap').textContent = (mission?.title || '').toUpperCase(); $('pzIc').innerHTML = icon(dm ? 'skull' : 'flag');
  $('pzMode').textContent = dm ? MODE_NAME[(NET.on ? 'o' : '') + (DM.hill ? 'hill' : DM.tdm ? 'tdm' : DM.gun ? 'gun' : 'dm')] : mode === 'survival' ? 'SURVIVAL' : mode === 'daily' ? 'DAILY' : 'STORY';
  $('pzTime').textContent = mmss(mode === 'survival' ? elapsed : clock);
  $('pzList').innerHTML = dm ? boardHTML(true) : `<div class="bcol"><div class="bt">${(mission?.title || '').toUpperCase()}</div><div class="br me">${icon('user')}<span>YOU</span><b>${stats.kills}</b><i></i></div></div>`;
  const cur = dm ? (NET.on ? 'o' : '') + (DM.hill ? 'hill' : DM.tdm ? 'tdm' : DM.gun ? 'gun' : 'dm') : 'story';
  $('pzModes').innerHTML = pzModes().map(([k, n, ic, sub]) => `<div class="pzm m-${k}${k === cur ? ' cur' : ''}"><div class="art">${icon(ic)}</div><div class="nm">${icon(ic)}<span>${n}<small>${sub}</small></span><button data-m="${k}">${k === cur ? 'RESTART' : 'PLAY'}</button></div></div>`).join('');
  $('pzModes').querySelectorAll('button[data-m]').forEach(b => b.onclick = () => {   // v30.1: restart / mode switch needs a second tap (players lost running matches to one stray click)
    if (b.dataset.arm) { pzPlay(b.dataset.m); return; }
    const t0 = b.textContent; b.dataset.arm = 1; b.textContent = 'SURE? TAP AGAIN'; b.classList.add('arm'); track('ui', { k: 'pzArm', m: b.dataset.m });
    setTimeout(() => { delete b.dataset.arm; b.textContent = t0; b.classList.remove('arm'); }, 2500);
  });
  const lo = $('pzLo'); lo.innerHTML = '';
  $('pzLoH').style.display = dm ? '' : 'none';
  if (dm) DM_LOADOUTS.forEach(([name, p], i) => { if (!dcOk(p)) return; const b = document.createElement('button'); b.className = p === (DM.next?.[0] || W.slots[0]) ? 'on' : ''; b.innerHTML = `<img src="${A.icons[p] || ''}" alt=""><span>${name}</span>`; b.onclick = () => { DM.next = [DM_LOADOUTS[i][1], DM_LOADOUTS[i][2]]; dmApplyLoadout(); pauseFill(); track('ui', { k: 'pzLoadout', w: p }); }; lo.append(b); });
}
function pzPlay(k) {
  track('ui', { k: 'pzMode', m: k }); $('pause').classList.remove('show'); paused = false; unlockAudio();
  setModeKey(k); endMatch(); if (NET.ws) netLeave(); if (onlineOn()) netStart(); else dmStart(false);
}
function lobbyModes() {                                                            // lobby: one SELECT MODE button + a pop-up list, giant PLAY
  const cur = modeKey(), M = MODE_NAME;
  let el = $('lModeSel'); if (!el) { el = document.createElement('div'); el.id = 'lModeSel'; $('lMain').insertBefore(el, $('lPlay')); }
  el.innerHTML = `<button id="lmsBtn" class="lms"><span class="ar">▾</span><span>SELECT MODE<small>${M[cur]}</small></span></button><div id="lmsList">${pzModes().map(([k, n, ic, sub]) => `<button data-m="${k}" class="${k === cur ? 'on' : ''}">${icon(ic)}<span>${n}<small>${sub}</small></span></button>`).join('')}</div>`;
  $('lmsBtn').onclick = () => el.classList.toggle('open');
  el.querySelectorAll('#lmsList button').forEach(b => b.onclick = () => { const k = b.dataset.m; setModeKey(k); el.classList.remove('open'); track('ui', { k: 'mode', m: k }); lobbyV14(); });
  let nav = $('lNav'); if (!nav) {
    nav = document.createElement('div'); nav.id = 'lNav';
    nav.innerHTML = [['PLAY', null], ['LOADOUT', 'lLoadout'], ['SHOP', 'lShop'], ['PASS', 'lPass'], ['PROFILE', 'lProfile']].map(([n, id], i) => `<button class="${i ? '' : 'on'}" data-id="${id || ''}">${n}</button>`).join('');
    nav.querySelectorAll('button').forEach(b => b.onclick = () => { if (b.dataset.id) $(b.dataset.id).click(); });
    $('lobbyTop').insertBefore(nav, $('lobbyTop').querySelector('.sp'));
  }
}

// ---------- boot ----------
(async () => {
  crazy.onAd(on => { audioMute(on); if (on && running) doPause(); });
  const rcP = loadRemote(TEST);
  await crazy.init(TEST); crazy.loading(true);
  if (crazy.active) {                                                             // cloud save just hydrated localStorage: re-read what was loaded at import time
    progress = Number(store.get('sz_progress', progress)) || 0;
    Object.assign(loadout, store.get('sz_loadout', {})); Object.assign(settings, store.get('sz_settings', {})); Object.assign(META.profile, store.get('sz_profile', {}));
  }
  DM.nextMap = (Math.random() * DM_MAPS.length) | 0; const dmPreP = TEST ? null : loadDmMap(DM_MAPS[DM.nextMap].id).catch(() => {});   // v27: first arena downloads alongside the game assets
  try { await loadAll(); }
  catch (e) { $('ltext').textContent = `Failed to load: ${e.message}`; errors.push(String(e)); return; }
  await rcP; applyRemote();
  crazy.loading(false); stage('ready'); track('boot', { b: 100, g: 'blastline', load: Math.round(performance.now() / 100) / 10, q: settings.quality, rc: RC.loaded ? RC.v : 0 });
  if (!PRIMARIES.includes(loadout.primary)) loadout.primary = 'ar7_lance';
  if (!SIDEARMS.includes(loadout.sidearm)) loadout.sidearm = 'vex_p9';
  FX.initFeel($('hud'));
  const visitDay = MODES.visitDay(), gifts = TEST && !Q.has('gifts') ? [] : MODES.claimGifts(visitDay); if (gifts.length) { returnGifts = gifts; track('gift', { k: 'claim', day: visitDay, ids: gifts.map(g => g.id).join(',') }); }   // v31
  const un = META.unlocked(progress);
  if (!DEBUG) { if (!un.weapons.has(loadout.primary)) loadout.primary = 'ar7_lance'; if (!un.weapons.has(loadout.sidearm)) loadout.sidearm = 'vex_p9'; if (!un.operatives.has(loadout.operative)) loadout.operative = 'rhea'; }
  buildMission(Math.min(progress, MISSIONS.length - 1));             // a live backdrop behind the lobby
  running = false;
  const firstRun = !TEST && !Q.has('brief') && !Q.has('onboard') && !store.get('sz_mode', null) && !onboardingDone() && !tutorialDone();
  playMode = 'dm';                                                                // rebrand: arena modes only (story campaign cut)
  if (firstRun && playMode === 'dm' && RC.dmNewMaps && dmPreP) await Promise.race([dmPreP, new Promise(r => setTimeout(r, 8000))]);   // first launch goes straight into the arena, no lobby flash
  if (Q.has('brief')) openBriefing(); else if (!(firstRun && playMode === 'dm' && dmMapReady(DM_MAPS[DM.nextMap].id))) openLobby();
  if (Q.has('onboard')) startOnboarding(true);
  else if (firstRun) {                                                            // first launch: straight into the mission-1 drill, no menus (CG load time = page open -> gameplayStart)
    try { localStorage.setItem('sz_onboard_done', '1'); } catch { /* blocked */ }
    selected = 0;                                                                // first click on the canvas grabs the mouse + unlocks audio
    dmStart(true);                                                               // first launch = a match
  }
  requestAnimationFrame(frame);
})();
