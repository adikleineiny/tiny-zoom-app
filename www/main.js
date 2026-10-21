import * as THREE from './three.module.min.js';
import { CONFIG } from './config.js';
import { Track, SECTION_NAMES, SECTION_TIPS, TUNNEL } from './track.js';
import { buildWorld } from './world.js';
import { Racer, AIDriver, Sim } from './sim.js';
import { createVehicleMesh, updateVehicleMesh } from './vehicles.js';
import { Input } from './input.js';
import { EffectComposer } from './addons/postprocessing/EffectComposer.js';
import { RenderPass } from './addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './addons/postprocessing/OutputPass.js';
import { Weapons, WEAPONS, WEAPON_KEYS } from './weapons.js';
import { FX } from './fx.js';
import { preloadModels, setModelsEnabled, GLB } from './models.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// v3.5: sRGB output + ACES filmic tone mapping, soft PCF shadows, quality levels with automatic fallback
const RC = CONFIG.render;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = RC.exposure;
renderer.shadowMap.enabled = !!RC.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Quality presets (v3.5): Low / Medium / High / Ultra, persisted; default mobile = Medium, desktop = High.
const QUALITY = [
  { name: 'Low',    dpr: 1,   shadows: false, map: 512,  bloom: false },
  { name: 'Medium', dpr: 1.5, shadows: true,  map: 1024, bloom: false },
  { name: 'High',   dpr: 2,   shadows: true,  map: 1024, bloom: true, bloomRes: 0.5 },
  { name: 'Ultra',  dpr: 2.5, shadows: true,  map: 2048, bloom: true, bloomRes: 1 }];
const isMobile = /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 820);
const qParam = params.get('quality'), qNames = QUALITY.map(q => q.name.toLowerCase());
const qStored = (() => { try { return localStorage.getItem('tz.quality'); } catch (_) { return null; } })();
const qPick = v => { if (v == null) return null; const n = qNames.indexOf(String(v).toLowerCase()); if (n >= 0) return n; const k = parseInt(v, 10); return isFinite(k) ? Math.max(0, Math.min(3, k)) : null; };
const quality = { level: qPick(qParam) ?? qPick(qStored) ?? (isMobile ? 1 : 2), auto: RC.autoQuality && qParam == null, scale: 1, ema: 16.7, slowT: 0, fastT: 0, changes: 0, frames: 0, sum: 0 };
let composer = null, bloomPass = null;
function buildComposer(q) {
  if (!composer) {
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt); composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.45, 0.86); composer.addPass(bloomPass); composer.addPass(new OutputPass());
  }
  bloomPass.resolution.set(innerWidth * (q.bloomRes || 0.5), innerHeight * (q.bloomRes || 0.5));
}
function applyQuality() {
  const q = QUALITY[quality.level]; setModelsEnabled(quality.level > 0 || params.get('models') === '1'); if (params.get('models') === '0') setModelsEnabled(false); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.dpr) * quality.scale);
  const sh = q.shadows && !!RC.shadows;
  const sun = world.sun; if (sun && sun.shadow.mapSize.x !== q.map) { sun.shadow.mapSize.set(q.map, q.map); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  if (renderer.shadowMap.enabled !== sh) { renderer.shadowMap.enabled = sh; scene.traverse(o => { if (o.material) { for (const m of [].concat(o.material)) m.needsUpdate = true; } }); }
  if (q.bloom) buildComposer(q);
  for (const b of document.querySelectorAll('.btnQuality')) b.textContent = '⚙️ Graphics: ' + q.name + (quality.scale < 1 ? ' (auto ' + Math.round(quality.scale * 100) + '%)' : '');
  if (typeof resize === 'function') resize();
}
function setQualityLevel(l, persist) { quality.level = Math.max(0, Math.min(3, l)); quality.scale = 1; if (persist) { try { localStorage.setItem('tz.quality', QUALITY[quality.level].name.toLowerCase()); } catch (_) {} } applyQuality(); }
function qualityTick(ms) {
  quality.frames++; quality.sum += ms; quality.ema += (ms - quality.ema) * 0.05;
  if (!quality.auto || state !== 'race') return;
  if (quality.ema > RC.targetMs) { quality.slowT += ms; quality.fastT = 0; } else if (quality.ema < RC.upMs) { quality.fastT += ms; quality.slowT = 0; } else quality.slowT = quality.fastT = 0;
  if (quality.slowT > 2000) { // dynamic resolution first, then a lower preset
    quality.slowT = 0; quality.ema = 16.7; quality.changes++;
    if (quality.scale > 0.65) quality.scale = Math.max(0.6, quality.scale * 0.85); else if (quality.level > 0) { quality.level--; quality.scale = 1; }
    applyQuality();
  } else if (quality.fastT > 10000 && quality.scale < 1 && quality.changes < 8) { quality.fastT = 0; quality.scale = Math.min(1, quality.scale / 0.85); applyQuality(); }
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, QUALITY[quality.level].dpr));
renderer.shadowMap.enabled = QUALITY[quality.level].shadows;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.5, 5000);
const track = new Track();
const world = buildWorld(scene, track, renderer);
track.finalize();
applyQuality();
const sim = new Sim(track);
const weapons = new Weapons(sim, track);
const fx = new FX(scene, sim);
const input = new Input();

const COLORS = [0x3a86ff, 0xe63946, 0x2a9d8f, 0xf4a261, 0x9b5de5];
const MODELS = Object.keys(CONFIG.models);
const NAMES = ['Bolt', 'Buzz', 'Cork', 'Bee', 'Zip'];
const normSel = t => CONFIG.models[t] ? t : (t === 'drone' ? 'drone' : 'racecar');
const CRATE_ICON = '<svg class="boltgear" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 4l7 10 12-4 2 12 12 2-4 12 10 7-10 7 4 12-12 2-2 12-12-4-7 10-7-10-12 4-2-12-12-2 4-12-10-7 10-7-4-12 12-2 2-12 12 4z" fill="#151515"/><circle cx="50" cy="50" r="30" fill="#ff7b00"/><path d="M56 26L36 54h12l-6 22 22-30H52z" fill="#ffd23f" stroke="#151515" stroke-width="3" stroke-linejoin="round"/></svg>';
const fmt = (t, d = 2) => { if (!isFinite(t)) return '—'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(d).padStart(d + 3, '0')}`; };
const typeName = m => `${CONFIG.models[m]?.icon || ''} ${CONFIG.models[m]?.label || m}`;

let state = 'menu', selected = 'racecar', fovNow = CONFIG.camera.fov, rollIconT = 0, slotShown = '', meshes = [], player = null, countdownT = 0, acc = 0, lastSec = 0, hudT = 0, toastT = 0, finishShownT = -1, timeScale = parseFloat(params.get('speed') || '1');
const camPos = new THREE.Vector3(350, 30, 100), camLook = new THREE.Vector3();
let shakeT = 0, shakeAmp = 0, cdShown = '';
let camHeading = 0, camOverride = null, speedOn = false;

function clearRacers() { for (const m of meshes) { scene.remove(m.root); scene.remove(m.shadow); } meshes = []; fx.clearAtt(); sim.reset(); }
function spawnMeshes() { meshes = sim.racers.map(r => { const m = createVehicleMesh(r.type, r.color, r.isPlayer ? null : r.name, r.model); scene.add(m.root); scene.add(m.shadow); return m; }); }

// AI rivals: the 4 other vehicle types minus one (rotates with your pick), so every type shows up
function rivalsFor(model) {
  const others = MODELS.filter(m => m !== model); others.splice(MODELS.indexOf(model) % others.length, 1);
  return others.slice(0, 3);
}
function setupRace(model, opts = {}) {
  model = normSel(model); clearRacers();
  const skills = CONFIG.ai.skill;
  const aiRacers = rivalsFor(model).map((m, k) => sim.add(new Racer({ name: NAMES[k], model: m, color: COLORS[k + 1], ai: new AIDriver(track, { skill: skills[k] ?? 0.96, lineK: 0.9 + 0.1 * k, altOff: (k - 1) * 3 }) })));
  player = sim.add(new Racer({ name: 'Me', model, color: COLORS[0], isPlayer: true, autopilot: !!opts.autopilot, ai: new AIDriver(track, { skill: 0.99 }) }));
  sim.placeGrid([...aiRacers, player]);
  spawnMeshes();
  input.setType(player.type);
}

function startRace(type = selected, opts = {}) {
  selected = normSel(type); input.releaseAll(); setupRace(selected, opts);
  state = 'countdown'; countdownT = 3.2; acc = 0; lastSec = player.section; finishShownT = -1; slotShown = '';
  $('menu').classList.add('hidden'); $('finish').classList.add('hidden'); $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden'); $('touchLayer').classList.remove('hidden');
  snapCamera();
}
function startDemo() {
  clearRacers(); player = null;
  ['moto', 'drone', 'racecar', 'heli', 'scooter'].forEach((m, k) => sim.add(new Racer({ name: NAMES[k], model: m, color: COLORS[k], ai: new AIDriver(track, { skill: 0.93 + 0.01 * k, lineK: 0.9 + 0.05 * k }) })));
  sim.placeGrid(sim.racers); spawnMeshes(); sim.running = true; state = 'menu';
  snapCamera();
}
function toMenu() {
  input.releaseAll(); $('rescueFx').classList.remove('on');
  $('menu').classList.remove('hidden'); $('finish').classList.add('hidden'); $('pause').classList.add('hidden');
  $('hud').classList.add('hidden'); $('touchLayer').classList.add('hidden'); setCountdown(''); $('speedlines').classList.remove('on'); speedOn = false;
  startDemo();
}

// ---------- UI wiring ----------
$('vehList').innerHTML = MODELS.map(m => { const M = CONFIG.models[m];
  return `<button class="vcard${m === selected ? ' sel' : ''}" data-type="${m}"><div class="vicon">${M.icon}</div><div class="vname">${M.label}</div>` +
    ['Speed', 'Accel', 'Boost'].map(k => `<div class="stat"><span>${k}</span><i style="--v:80%"></i></div>`).join('') +
    `<div class="vflav">${M.class === 'drone' ? '🛸 Flies' : '🛞 Drives & jumps'} · equal stats</div><div class="vnote">${M.note}</div></button>`; }).join('');
document.querySelectorAll('.vcard').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.vcard').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); selected = b.dataset.type;
}));
function goFullscreen() {
  // Inside the native app (Capacitor) the Fullscreen API makes iOS show a persistent
  // "is in full screen. Swipe down to exit." banner; the app is already fullscreen.
  if (window.Capacitor?.isNativePlatform?.() || location.protocol === 'capacitor:') return;
  const el = document.documentElement;
  if (el.requestFullscreen && !document.fullscreenElement && matchMedia('(pointer:coarse)').matches)
    el.requestFullscreen().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
}
$('btnStart').addEventListener('click', () => { goFullscreen(); startRace(selected); });
$('btnHelp').addEventListener('click', () => $('help').classList.remove('hidden'));
$('btnCredits')?.addEventListener('click', e => { e.preventDefault(); $('credits').classList.remove('hidden'); });
$('btnCreditsClose')?.addEventListener('click', () => $('credits').classList.add('hidden'));
for (const id of ['btnQuality', 'btnQuality2']) $(id)?.addEventListener('click', e => { e.preventDefault(); setQualityLevel((quality.level + 1) % 4, true); });
for (const id of ['btnControls', 'btnControls2']) $(id)?.addEventListener('click', e => { e.preventDefault(); input.cycleMode(); });
input.setType(input.type);
$('btnHelpClose').addEventListener('click', () => $('help').classList.add('hidden'));
const pause = () => { input.releaseAll(); if (state === 'race' || state === 'countdown') { state = 'paused:' + state; $('pause').classList.remove('hidden'); } };
const resume = () => { input.releaseAll(); if (state.startsWith('paused:')) { state = state.slice(7); $('pause').classList.add('hidden'); } };
$('btnPause').addEventListener('click', pause); $('btnResume').addEventListener('click', resume);
$('btnRestart').addEventListener('click', () => startRace(selected)); $('btnAgain').addEventListener('click', () => startRace(selected));
$('btnMenu').addEventListener('click', toMenu); $('btnMenu2').addEventListener('click', toMenu);
$('btnReset').addEventListener('click', () => resetPlayer());
addEventListener('keydown', e => {
  if (e.code === 'Escape' || e.code === 'KeyP') state.startsWith('paused') ? resume() : pause();
  if (e.code === 'KeyR') resetPlayer();
  if (e.code === 'Enter' && state === 'menu' && $('help').classList.contains('hidden')) startRace(selected);
});
document.addEventListener('visibilitychange', () => { input.releaseAll(); if (document.hidden) pause(); });
addEventListener('pagehide', () => { input.releaseAll(); pause(); });
addEventListener('blur', () => input.releaseAll());

// manual reset (↺ / R) = the same Lakitu-style rescue as the automatic one
function resetPlayer() { if (player && state === 'race') { if (!sim.rescue(player, 'manual') && player.rescueT <= 0) sim.respawn(player); } }

// ---------- camera ----------
function snapCamera() { const r = followed(); if (!r) return; camHeading = r.heading; updateCamera(1, true); }
function followed() { return player || sim.racers[0]; }
const tmpV = new THREE.Vector3(), camPivot = new THREE.Vector3(); let camWasPlaced = false;
const CAM_PAD = 2.2, camNear = [];
function camSolids(a, b) { // solids near the a→b segment (small list → cheap marching)
  const x0 = Math.min(a.x, b.x) - CAM_PAD, x1 = Math.max(a.x, b.x) + CAM_PAD, y0 = Math.min(a.y, b.y) - CAM_PAD, y1 = Math.max(a.y, b.y) + CAM_PAD, z0 = Math.min(a.z, b.z) - CAM_PAD, z1 = Math.max(a.z, b.z) + CAM_PAD;
  camNear.length = 0; for (const s of track.solids) if (s.x1 > x0 && s.x0 < x1 && s.y1 > y0 && s.y0 < y1 && s.z1 > z0 && s.z0 < z1) camNear.push(s);
  return camNear;
}
const inNear = (L, x, y, z, p) => { for (const s of L) if (x > s.x0 - p && x < s.x1 + p && y > s.y0 - p && y < s.y1 + p && z > s.z0 - p && z < s.z1 + p) return true; return false; };
// first free→blocked fraction along a→b (1 = clear)
function camHit(a, b) {
  const L = camSolids(a, b); if (!L.length) return 1;
  const d = a.distanceTo(b), n = Math.max(2, Math.ceil(d / 1.0));
  let started = !inNear(L, a.x, a.y, a.z, CAM_PAD); // pivot itself may touch a wall (driving along it): start testing once free
  for (let k = 1; k <= n; k++) { const t = k / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
    const hit = inNear(L, x, y, z, CAM_PAD); if (!started) { if (!hit) started = true; continue; } if (hit) return Math.max(0, (k - 1) / n); }
  return 1;
}
function camFree(a, want) { const f = camHit(a, want); if (f < 1) { const ff = Math.max(0.12, f); want.set(a.x + (want.x - a.x) * ff, a.y + (want.y - a.y) * ff, a.z + (want.z - a.z) * ff); } }
function camBlocked(a, p) { return camHit(a, p) < 0.999; }
function updateCamera(dt, snap) {
  const r = followed(); if (!r) return;
  const C = CONFIG.camera[r.type];
  let dh = r.heading - camHeading; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
  camHeading += dh * (snap ? 1 : Math.min(1, dt * 5));
  const fx = Math.cos(camHeading), fz = Math.sin(camHeading);
  const want = tmpV.set(r.x - fx * C.dist, r.y + C.height, r.z - fz * C.dist);
  // camera collision: march from the vehicle to the wanted spot and stop just before the first wall / door / prop
  // (thin walls like the pet door can't be skipped), then the same test on the smoothed position (never lerp through a wall)
  const pivot = camPivot.set(r.x, r.y + Math.min(6, C.height * 0.5), r.z);
  camFree(pivot, want);
  const ce = track.ceilingAt(want.x, want.z); if (want.y > ce - 3 && r.y < ce) want.y = Math.max(2, ce - 3);
  { const cv = track.ceilingAt(r.x, r.z); if (cv < CONFIG.maxAltitude && want.y > cv - 3 && r.y < cv) want.y = Math.max(2, cv - 3); } // inside the tunnel: stay under the pipe
  { const gy = track.groundAt(want.x, want.z) + 2.5; if (want.y < gy) want.y = gy; }
  if (snap || r.rescueT > 0 && r.rescuePlaced && !camWasPlaced) camPos.copy(want); else camPos.lerp(want, Math.min(1, dt * (7 + r.speed / 18)));
  camWasPlaced = !!(r.rescueT > 0 && r.rescuePlaced);
  if (camBlocked(pivot, camPos)) camPos.copy(want);
  camera.position.copy(camPos);
  camLook.set(r.x + fx * C.lookAhead, r.y + C.lookUp, r.z + fz * C.lookAhead);
  camera.lookAt(camLook);
  // speed feel: FOV widens with speed, kicks on turbo
  const top = r.type === 'car' ? r.V.topSpeed : r.V.thrust / r.V.drag;
  const wantFov = CONFIG.camera.fov + CONFIG.camera.speedFov * Math.min(1, r.speed / top) + (r.turboT > 0 ? CONFIG.camera.turboFov : 0);
  fovNow += (wantFov - fovNow) * (snap ? 1 : Math.min(1, dt * 4));
  if (Math.abs(camera.fov - fovNow) > 0.05) { camera.fov = fovNow; camera.updateProjectionMatrix(); }
}

// ---------- HUD ----------
const mm = $('minimap'), mctx = mm.getContext('2d'), MW = mm.width, MH = mm.height;
let mmB = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 };
for (let i = 0; i < track.N; i++) { mmB.x0 = Math.min(mmB.x0, track.px[i]); mmB.x1 = Math.max(mmB.x1, track.px[i]); mmB.z0 = Math.min(mmB.z0, track.pz[i]); mmB.z1 = Math.max(mmB.z1, track.pz[i]); }
const mmS = Math.min((MW - 16) / (mmB.x1 - mmB.x0), (MH - 16) / (mmB.z1 - mmB.z0));
const mmX = x => 8 + (x - mmB.x0) * mmS + (MW - 16 - (mmB.x1 - mmB.x0) * mmS) / 2, mmZ = z => 8 + (z - mmB.z0) * mmS + (MH - 16 - (mmB.z1 - mmB.z0) * mmS) / 2;
const SEC_COL = { 1: '#ffffff', 2: '#ffe8b0', 3: '#ffffff', 4: '#b8f28c', 5: '#c9a26b', 6: '#7fd65a', 7: '#b0b8c8', 8: '#d6f5a0' };
// static layer drawn once: track coloured by section, house wall, tunnel, ramps
const mmBase = document.createElement('canvas'); mmBase.width = MW; mmBase.height = MH;
{ const g = mmBase.getContext('2d'); g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 7; g.beginPath(); for (let i = 0; i <= track.N; i += 3) { const k = i % track.N; i ? g.lineTo(mmX(track.px[k]), mmZ(track.pz[k])) : g.moveTo(mmX(track.px[k]), mmZ(track.pz[k])); } g.closePath(); g.stroke();
  g.lineWidth = 4.5; for (let i = 0; i < track.N; i += 2) { const j = (i + 3) % track.N; g.strokeStyle = SEC_COL[track.section[i]] || '#fff'; g.beginPath(); g.moveTo(mmX(track.px[i]), mmZ(track.pz[i])); g.lineTo(mmX(track.px[j]), mmZ(track.pz[j])); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.strokeRect(mmX(0), mmZ(0), 1400 * mmS, 900 * mmS);
  g.strokeStyle = '#3b2a1a'; g.lineWidth = 6; g.beginPath(); g.moveTo(mmX(TUNNEL.x0), mmZ(TUNNEL.zc)); g.lineTo(mmX(TUNNEL.x1), mmZ(TUNNEL.zc)); g.stroke();
  for (const f of track.hfeat) { g.fillStyle = f.kind === 'ramp' ? '#ff7b00' : '#2f7d1f'; g.beginPath(); g.arc(mmX(f.x), mmZ(f.z), f.kind === 'ramp' ? 2.2 : 1.8, 0, 7); g.fill(); }
  for (const f of track.puddles) { g.fillStyle = f.mud ? '#6b4a2b' : '#3d8fd6'; g.beginPath(); g.arc(mmX(f.x), mmZ(f.z), 2.6, 0, 7); g.fill(); }
  g.fillStyle = '#111'; const s0 = track.gates[0]; g.fillRect(mmX(track.px[s0.i]) - 3, mmZ(track.pz[s0.i]) - 1, 6, 2);
}
function drawMinimap() {
  mctx.clearRect(0, 0, MW, MH); mctx.drawImage(mmBase, 0, 0);
  // v3.5: wind-gust zones (subtle pale-blue band along the track)
  mctx.save(); mctx.strokeStyle = 'rgba(160,220,255,0.45)'; mctx.lineWidth = 6; mctx.lineCap = 'round';
  for (const z of track.zones || []) { mctx.beginPath(); for (let i = z.i0; i <= z.i1; i += 3) { const X = mmX(track.px[i]), Y = mmZ(track.pz[i]); i === z.i0 ? mctx.moveTo(X, Y) : mctx.lineTo(X, Y); } mctx.stroke(); }
  mctx.restore();
  const flyer = player && player.type !== 'car';
  if (!flyer) for (const p of track.pads) { mctx.fillStyle = '#ff9f1c'; mctx.fillRect(mmX(p.x) - 2.5, mmZ(p.z) - 2.5, 5, 5); }
  else for (const p of track.rings) { mctx.strokeStyle = '#ff9f1c'; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(mmX(p.x), mmZ(p.z), 3.5, 0, 7); mctx.stroke(); mctx.strokeStyle = '#3ff6ff'; mctx.lineWidth = 1; mctx.beginPath(); mctx.arc(mmX(p.x), mmZ(p.z), 1.8, 0, 7); mctx.stroke(); }
  for (const r of sim.racers) { mctx.fillStyle = '#' + r.color.toString(16).padStart(6, '0'); mctx.beginPath(); mctx.arc(mmX(r.x), mmZ(r.z), r.isPlayer ? 4.5 : 3.2, 0, 7); mctx.fill(); if (r.isPlayer) { mctx.strokeStyle = '#fff'; mctx.lineWidth = 2; mctx.stroke(); } }
}
function updateSlot(dt) {
  if (!player) return;
  const el = $('wslot'); let cls, icon, name;
  if (player.rollT > 0) {
    rollIconT -= dt; cls = 'rolling';
    const left = player.rollT; if (rollIconT <= 0) { rollIconT = 0.05 + 0.25 * (1 - left / CONFIG.weapons.rollTime) ** 2; slotShown = WEAPON_KEYS[(WEAPON_KEYS.indexOf(slotShown) + 1 + Math.floor(Math.random() * 3)) % WEAPON_KEYS.length] || WEAPON_KEYS[0]; }
    icon = WEAPONS[slotShown]?.icon || CRATE_ICON; name = 'Rolling…';
  } else if (player.weapon) { cls = 'ready'; icon = WEAPONS[player.weapon].icon; name = WEAPONS[player.weapon].name; }
  else { cls = 'empty'; icon = CRATE_ICON; name = 'Grab a crate'; }
  if (el.dataset.c !== cls + icon) { el.dataset.c = cls + icon; el.className = 'panel wbtn ' + cls + (el.classList.contains('down') ? ' down' : ''); /* keep the pressed state */ $('wicon').innerHTML = icon; $('wname').textContent = name; }
}
function hudEvents() {
  if (!player) return;
  for (const e of sim.events) {
    // v3.5 camera shake: hits on me, explosions nearby
    if (e.type === 'hit' && e.r === player) shake(e.kind === 'bomb' || e.kind === 'rocket' ? 3.2 : 1.6);
    else if (e.type === 'boom' && Math.hypot(e.x - player.x, e.z - player.z) < 90) shake(2.4 * (1 - Math.hypot(e.x - player.x, e.z - player.z) / 90) + 0.6);
    if (e.type === 'gotWeapon' && e.r === player) toast(`${WEAPONS[e.w].icon} ${WEAPONS[e.w].name} – ${WEAPONS[e.w].tip}`);
    else if (e.type === 'hit' && e.by === player && e.r !== player) toast(`💥 Hit ${e.r.name}!`);
    else if (e.type === 'bombStick' && e.r === player) toast('💣 A sticky bomb is on you – bump someone to pass it!');
    else if (e.type === 'bombPass' && e.from === player) toast(`💣 Passed the bomb to ${e.to.name}!`);
    else if (e.type === 'rescue' && e.r === player) { $('rescueFx').classList.add('on'); toast(e.reason === 'wrongway' ? '🎣 Wrong way – back on track!' : '🎣 Back on track!'); }
    else if (e.type === 'rescued' && e.r === player) $('rescueFx').classList.remove('on');
    if (e.type === 'turboPad' && e.r === player) window.RC_SOUND?.('turboPad', e); // sound hook (no audio engine yet)
  }
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); toastT = 2.2; }
function updateHUD(dt) {
  if (!player) return;
  toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show');
  if (player.section !== lastSec && state === 'race') { lastSec = player.section; toast(`${SECTION_NAMES[lastSec]} · ${SECTION_TIPS[lastSec]}`); }
  hudT -= dt; if (hudT > 0) return; hudT = 0.1;
  const st = sim.standings(); $('posNum').textContent = st.indexOf(player) + 1;
  const lap = Math.min(CONFIG.laps, player.lapsDone + 1);
  $('lapNum').textContent = player.finished ? 'Finished!' : `Lap ${lap}/${CONFIG.laps}`;
  $('lapTime').textContent = fmt(player.finished ? player.lapTimes.at(-1) : (state === 'race' ? sim.t - player.lapStart : 0));
  $('totTime').textContent = fmt(player.finished ? player.finishTime : sim.t, 1); $('bestTime').textContent = fmt(player.best);
  $('spd').textContent = Math.round(player.speed); { const top = player.type === 'car' ? player.V.topSpeed * 1.6 : 220, f = Math.min(1, player.speed / top); const g = $('gaugeArc'); if (g) g.style.strokeDashoffset = String(100 - f * 100); $('hudBat').classList.toggle('turbo', player.turboT > 0); }
  $('alt').textContent = player.type === 'drone' ? `↕${Math.round(player.y)}` : '';
  const w = $('warn'); let msg = '', ok = false;
  if (player.bomb) msg = `💣 Sticky bomb ${player.bomb.t.toFixed(1)}s – bump someone!`;
  else if (player.stunT > 0) msg = '⚡ Power cut!';
  else if (player.gateBlockT > 0) msg = player.section === 5 ? 'No flying over the hill – into the pipe!' : 'Lower! Pass under the gate';
  else if (player.rescueT > 0) { msg = '🎣 Back on track…'; ok = true; }
  else if (state === 'race' && sim.stuckLevel(player) > 0.4) msg = 'Stuck? Rescue coming… (↺ = reset now)';
  else if (player.wrongWayT > 1) msg = 'Wrong way!';
  else if (player.turboT > 0 && player.padCD > 0) { msg = player.type === 'car' ? '🚀 TURBO PAD!' : '🚀 TURBO RING!'; ok = true; }
  else if (player.type === 'drone' && player.y - (player.groundY || 0) < 3 && state === 'race' && !(CONFIG.flyerAssist?.autoAltitude && CONFIG.flyerAssist.level > 0) && player.spool >= 1 && player.lapsDone === 0 && sim.t < 6) { msg = 'Left stick up to take off'; ok = true; }
  w.textContent = msg; w.classList.toggle('ok', ok);
  drawMinimap();
}
function showFinish() {
  input.releaseAll();
  const st = sim.standings(); const tb = $('results').querySelector('tbody'); tb.innerHTML = '';
  st.forEach((r, k) => {
    const tr = document.createElement('tr'); if (r.isPlayer) tr.className = 'me';
    tr.innerHTML = `<td>${k + 1}</td><td>${r.name}</td><td>${typeName(r.model)}</td><td class="mono">${r.finished ? fmt(r.finishTime) : 'Racing…'}</td><td class="mono">${fmt(r.best)}</td><td>${r.lapsDone}/${CONFIG.laps}</td><td>${r.landed || 0}</td>`;
    tb.appendChild(tr);
  });
  const best = t => { const v = sim.racers.filter(r => r.type === t && isFinite(r.best)).map(r => r.best); return v.length ? Math.min(...v) : Infinity; };
  const bc = best('car'), bd = best('drone');
  $('balance').textContent = `Balance check – best lap: ground ${fmt(bc)} · flyers ${fmt(bd)}` + (isFinite(bc) && isFinite(bd) ? ` (delta ${(bd - bc).toFixed(2)} s)` : '');
  const pos = st.indexOf(player) + 1; $('finTitle').textContent = pos === 1 ? '🏆 You won!' : `Finished in place ${pos}`;
  $('finish').classList.remove('hidden');
}

// ---------- main loop ----------
// v3.5: big bold pop-in countdown (each number re-triggers the CSS animation)
function setCountdown(t) {
  if (t === cdShown) return; cdShown = t; const el = $('countdown');
  el.innerHTML = t ? `<span class="cd ${t === 'GO!' ? 'go' : 'n' + t}">${t}</span>` : '';
  world.setStartLights?.(t === 'GO!' ? 4 : t ? 4 - Number(t) : 0);
}
function shake(a, t = 0.45) { shakeAmp = Math.max(shakeAmp * (shakeT > 0 ? 1 : 0), a); shakeT = Math.max(shakeT, t); }
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); const q = QUALITY[quality.level]; bloomPass.resolution.set(w * (q.bloomRes || 0.5), h * (q.bloomRes || 0.5)); } }
addEventListener('resize', resize); resize();
const H = 1 / CONFIG.physicsHz;
let last = performance.now(), simT = 0;
function frame(now) {
  const rawMs = now - last; const dt = Math.min(0.05, rawMs / 1000); last = now; simT += dt; if (rawMs > 0 && rawMs < 500) qualityTick(rawMs);
  const paused = state.startsWith('paused');
  if (!paused) {
    if (state === 'countdown') {
      countdownT -= dt; const n = Math.ceil(countdownT);
      setCountdown(countdownT > 0.2 ? String(Math.min(3, n)) : 'GO!');
      if (countdownT <= 0.2 && !sim.running) { sim.running = true; state = 'race'; }
    }
    if (state === 'race' && countdownT < -0.8) setCountdown(''); else if (state === 'race') countdownT -= dt;
    if (player && !player.autopilot && !player.finished) input.read(player.input, { cam: camHeading, heading: player.heading }); else input.read({});
    acc += dt * timeScale; let n = 0;
    while (acc >= H && n < 40) { sim.step(H); acc -= H; n++; }
    if (acc > H) acc = 0;
    if (player && player.finished && state === 'race') { state = 'finished'; finishShownT = 1.5; toast('🏁 Finish!'); }
    if (state === 'finished') { finishShownT -= dt; if (finishShownT <= 0) { showFinish(); finishShownT = 0.5; } }
  }
  sim.racers.forEach((r, k) => { const m = meshes[k]; if (!m) return; updateVehicleMesh(m, r, paused ? 0 : dt, simT);
    // Lakitu rescue: lift up + shrink away, then drop back in on the track
    if (r.rescueT > 0) { const A = CONFIG.rescue.animTime, ph = 1 - r.rescueT / A, u = ph < 0.5 ? ph * 2 : (1 - ph) * 2;
      m.root.position.y += u * 22; m.root.scale.setScalar(Math.max(0.05, 1 - u * 0.95)); m.shadow.visible = u < 0.6; m._resc = true; }
    else if (m._resc) { m.root.scale.setScalar(1); m.shadow.visible = true; m._resc = false; } });
  { const on = !!(player && player.turboT > 0 && state === 'race'); if (on !== speedOn) { speedOn = on; $('speedlines').classList.toggle('on', on); } }
  hudEvents(); fx.update(paused ? 0 : dt, sim.racers, meshes, camera); if (state !== 'menu') updateSlot(dt);
  world.update(simT, sim.racers);
  if (camOverride) { camera.position.set(...camOverride[0]); camera.lookAt(...camOverride[1]); }
  else updateCamera(dt);
  if (shakeT > 0 && !camOverride) { shakeT -= dt; const a = shakeAmp * Math.max(0, shakeT) / 0.45; camera.position.x += (Math.random() - 0.5) * a; camera.position.y += (Math.random() - 0.5) * a; camera.position.z += (Math.random() - 0.5) * a; }
  world.followSun?.(followed());
  const fr = followed(); meshes.forEach((m, k) => { if (m.label) { const r = sim.racers[k]; const d = camera.position.distanceTo(m.root.position); m.label.visible = r !== fr && d > 55; m.label.material.opacity = Math.min(1, (d - 55) / 40); } });
  updateHUD(dt);
  if (QUALITY[quality.level].bloom && composer) composer.render(); else renderer.render(scene, camera); window.__calls = renderer.info.render.calls;
  requestAnimationFrame(frame);
}

// ---------- test / debug hooks ----------
window.__rc = {
  sim, track, CONFIG, scene, get camera() { return camera; }, get calls() { return renderer.info.render.calls; }, get state() { return state; }, get player() { return player; },
  startRace, toMenu, setTimeScale: s => (timeScale = s), weapons, WEAPONS,
  setCam(pos, look) { camOverride = pos ? [pos, look] : null; },
  get meshes() { return meshes; }, input, world, GLB, createVehicleMesh, updateVehicleMesh, quality, setQuality(l) { quality.auto = false; setQualityLevel(l); }, QUALITY, frameStats() { const r = { avgMs: quality.frames ? quality.sum / quality.frames : 0, frames: quality.frames, level: quality.level, dpr: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; quality.frames = 0; quality.sum = 0; return r; }, rescue: (r = player, why) => sim.rescue(r, why),
  give(w, r = player) { weapons.give(r, w); }, fire(r = player) { return weapons.use(r); },
  // fast headless race simulation (no rendering) for balance testing
  simulateRace(type = 'racecar', maxSeconds = 400, opts = {}) {
    const wasW = CONFIG.weapons.enabled; if (opts.weapons !== undefined) CONFIG.weapons.enabled = opts.weapons;
    setupRace(type, { autopilot: true });
    if (opts.rivals) { clearRacers(); opts.rivals.forEach((m, k) => sim.add(new Racer({ name: NAMES[k], model: m, color: COLORS[k + 1], ai: new AIDriver(track, { skill: CONFIG.ai.skill[k] ?? 0.96, lineK: Math.min(1.1, 0.9 + 0.1 * k) }) })));
      player = sim.add(new Racer({ name: 'Me', model: normSel(type), color: COLORS[0], isPlayer: true, autopilot: true, ai: new AIDriver(track, { skill: 0.99 }) })); sim.placeGrid(sim.racers); spawnMeshes(); }
    sim.running = true; state = 'sim';
    const steps = Math.round(maxSeconds / H);
    for (let k = 0; k < steps; k++) { sim.step(H); sim.events.length = 0; if (sim.racers.every(r => r.finished)) break; }
    CONFIG.weapons.enabled = wasW;
    const res = sim.standings().map(r => ({ name: r.name, type: r.model, hits: r.hits, landed: r.landed || 0, shots: r.shots, player: r.isPlayer, finished: r.finished, total: +r.finishTime.toFixed(2), best: +r.best.toFixed(2), laps: r.lapTimes.map(x => +x.toFixed(2)), padHits: r.padHits, secT: Object.fromEntries(Object.entries(r.secT||{}).map(([k,v])=>[k,+(v/CONFIG.laps).toFixed(1)])), maxSp: Object.fromEntries(Object.entries(r.maxSp||{}).map(([k,v])=>[k,Math.round(v)])) }));
    toMenu(); return res;
  },
};

startDemo();
const auto = params.get('autostart');
// v3.6: licensed GLB vehicles load in the background (local files, ~1 MB); demo racers are re-skinned when ready
const modelsReady = Promise.race([preloadModels(), new Promise(r => setTimeout(r, 6000))]);
modelsReady.then(() => {
  if (state === 'menu' && !auto) { for (const m of meshes) { scene.remove(m.root); scene.remove(m.shadow); } spawnMeshes(); }
  if (auto) startRace(normSel(auto), { autopilot: params.get('autopilot') === '1' });
});
requestAnimationFrame(frame);
