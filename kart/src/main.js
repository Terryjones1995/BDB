// Turbo Kart Rally — bootstrap, renderer, post-processing, game state machine and main loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { bus } from './events.js';
import { CHARACTERS, RACE, PHYSICS } from './config.js';
import { RaceManager } from './race.js';
import { HUD } from './hud.js';
import { Menu } from './menu.js';
import { AudioEngine } from './audio.js';

// ---------------------------------------------------------------------------------------------
// Error isolation: one failing subsystem must never freeze the loop. Log once per error type.
// ---------------------------------------------------------------------------------------------
const seenErrors = new Set();
function report(tag, err) {
  const key = tag + '|' + (err && err.message);
  if (seenErrors.has(key)) return;
  seenErrors.add(key);
  console.error(`[${tag}]`, err);
}
function safe(tag, fn) {
  try { return fn(); } catch (err) { report(tag, err); return undefined; }
}

// ---------------------------------------------------------------------------------------------
// Renderer / camera / post
// ---------------------------------------------------------------------------------------------
const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(0, 30, 60);

const fallbackScene = new THREE.Scene();
fallbackScene.background = new THREE.Color(0x2a6fdb);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
composer.setSize(window.innerWidth, window.innerHeight);
const renderPass = new RenderPass(fallbackScene, camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.32, 0.45, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}
window.addEventListener('resize', onResize);

// ---------------------------------------------------------------------------------------------
// Modules from other agents are loaded dynamically so a broken file degrades instead of killing the game.
// ---------------------------------------------------------------------------------------------
const mods = {};
async function loadModules() {
  const specs = {
    track: './track.js', kart: './kart.js', ai: './ai.js', input: './input.js',
    items: './items.js', effects: './effects.js', models: './models.js', camera: './camera.js',
    online: './online.js', lobby: './lobby.js',
  };
  await Promise.all(Object.entries(specs).map(async ([k, p]) => {
    try { mods[k] = await import(p); } catch (e) { console.error(`[main] failed to load ${p}`, e); }
  }));
}

// ---- fallbacks -------------------------------------------------------------------------------
function fallbackKartModel(character) {
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: character ? character.color : 0xff0000 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.4), mat);
  body.position.y = 0.5; body.castShadow = true; root.add(body);
  const anchors = {};
  for (const [n, x, y, z] of [['exhaustL', 0.4, 0.5, -1.3], ['exhaustR', -0.4, 0.5, -1.3], ['wheelRL', 0.8, 0.3, -0.8], ['wheelRR', -0.8, 0.3, -0.8],
    ['wheelFL', 0.8, 0.3, 0.8], ['wheelFR', -0.8, 0.3, 0.8], ['itemHold', 0, 0.6, -1.8]]) {
    const o = new THREE.Object3D(); o.position.set(x, y, z); root.add(o); anchors[n] = o;
  }
  return { root, anchors, animate() {}, setShrunk(s) { root.scale.setScalar(s); }, dispose() { body.geometry.dispose(); mat.dispose(); } };
}
function makeKartModel(character) {
  if (mods.models && mods.models.createKartModel) {
    try { return mods.models.createKartModel(character); } catch (e) { report('models.createKartModel', e); }
  }
  return fallbackKartModel(character);
}

class FallbackAI {
  constructor(kart, track) { this.kart = kart; this.track = track; }
  update() {
    const k = this.kart, tr = this.track;
    const p = tr.getPointAt(((k.trackT || 0) + 25 / (tr.length || 2000)) % 1);
    const dx = p.x - k.position.x, dz = p.z - k.position.z;
    const want = Math.atan2(dx, dz);
    let d = want - k.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    k.input = { throttle: 1, brake: 0, steer: THREE.MathUtils.clamp(-d * 2, -1, 1), drift: false, item: !!k.item && Math.random() < 0.01, lookBack: false };
  }
}

class FallbackCamera {
  constructor(cam) { this.cam = cam; this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); }
  snap(k) { this._target(k, this.pos, this.look); this.cam.position.copy(this.pos); this.cam.lookAt(this.look); }
  _target(k, pos, look) {
    const h = k.heading || 0;
    pos.set(k.position.x - Math.sin(h) * 9, k.position.y + 4, k.position.z - Math.cos(h) * 9);
    look.set(k.position.x + Math.sin(h) * 4, k.position.y + 1.2, k.position.z + Math.cos(h) * 4);
  }
  update(dt, k) {
    const p = new THREE.Vector3(), l = new THREE.Vector3();
    this._target(k, p, l);
    const a = 1 - Math.exp(-dt * 6);
    this.pos.lerp(p, a); this.look.lerp(l, a);
    this.cam.position.copy(this.pos); this.cam.lookAt(this.look);
  }
}

// ---------------------------------------------------------------------------------------------
// UI + audio
// ---------------------------------------------------------------------------------------------
const audio = new AudioEngine();
const hud = new HUD(uiRoot);
const menu = new Menu(uiRoot, {
  onStart: (settings) => startRace(settings),
  onResume: () => resume(),
  onRestart: () => { menu.hideAll(); startRace(lastSettings); },
  onQuit: () => { if (net.active) leaveOnline(); else goToTitle(); },
  onScreen: (s) => { setState(s === 'select' ? 'select' : 'title'); },
  onOnline: () => openOnline(),
  onNetPause: () => netPause(),
});
hud.onNetPause = () => netPause();
hud.onNetResume = () => netResume();
let input = null;

// ---------------------------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------------------------
let state = 'boot';
let prevState = null;
let world = null;
let lastSettings = { characterIndex: 0, difficulty: 'normal', laps: RACE.laps };
let introTimer = 0;
let resultsShown = false;
let time = 0;
const clock = new THREE.Clock();
const NEUTRAL = Object.freeze({ throttle: 0, brake: 0, steer: 0, drift: false, item: false, lookBack: false });

function setState(s) {
  if (state === s) return;
  state = s;
  document.body.dataset.state = s;
  bus.emit('game:state', { state: s });
}

const RACE_STATES = new Set(['intro', 'countdown', 'racing', 'finished']);

// ---------------------------------------------------------------------------------------------
// World lifecycle
// ---------------------------------------------------------------------------------------------
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

function buildWorld({ mode, characterIndex = 0, difficulty = 'normal', laps = RACE.laps, online = null }) {
  if (!mods.track || !mods.track.createTrack) throw new Error('track.js unavailable');
  if (!mods.kart || !mods.kart.Kart) throw new Error('kart.js unavailable');
  const w = { mode, difficulty, laps, karts: [], ais: [], playerAI: null, player: null, scene: new THREE.Scene() };
  w.track = mods.track.createTrack(w.scene, renderer);
  if (online) buildOnlineRoster(w, online);
  else buildLocalRoster(w, { mode, characterIndex, difficulty, laps });
  return finishWorld(w);
}

/** Online: every client builds the same roster from the host's `start` grid (track is deterministic). */
function buildOnlineRoster(w, start) {
  const { Kart } = mods.kart;
  const myId = net.session.myId, amAIOwner = net.aiOwner === myId;
  const iv = sendIntervalMs();
  w.online = true;
  w.raceId = start.race;
  w.byIndex = new Map();
  for (const g of [...start.grid].sort((a, b) => a.k - b.k)) {
    const character = CHARACTERS.find((c) => c.id === g.char) || CHARACTERS[0];
    const isPlayer = g.owner === myId;
    const kart = new Kart({ scene: w.scene, track: w.track, character, isPlayer, index: g.k, model: makeKartModel(character) });
    kart.owner = g.owner;
    kart.displayName = g.owner === 'ai' ? null : g.name;
    kart.remote = !(isPlayer || (g.owner === 'ai' && amAIOwner));
    // ghosts lag one send interval behind (+ jitter slack) and go idle when their owner goes quiet
    kart.ghostDelayMs = Math.round(iv * 1.2);
    kart.ghostStaleMs = Math.max(1000, iv * 4);
    w.karts.push(kart);
    w.byIndex.set(g.k, kart);
    if (isPlayer) w.player = kart;
  }
  w.allKarts = w.karts.slice(); // departed racers leave w.karts but are kept (hidden) so they can come back
  w.race = new RaceManager({ track: w.track, karts: w.karts, player: w.player, laps: start.laps, silent: false });
  w.race.placeOnGrid(start.grid.map((g) => w.byIndex.get(g.k)));
  for (const k of w.karts) if (k.owner === 'ai' && !k.remote) addAIDriver(w, k);
}

function addAIDriver(w, k) {
  const AIClass = (mods.ai && mods.ai.AIDriver) || null;
  let ai = null;
  if (AIClass) ai = safe('ai.ctor', () => new AIClass(k, w.track, { difficulty: 'normal' }));
  ai = ai || new FallbackAI(k, w.track);
  k._ai = ai;
  w.ais.push(ai);
}

function buildLocalRoster(w, { mode, characterIndex, difficulty, laps }) {
  // roster: attract mode = every character in order (kart index == character index)
  let chars;
  if (mode === 'race') {
    const others = shuffle(CHARACTERS.filter((_, i) => i !== characterIndex));
    chars = [CHARACTERS[characterIndex], ...others];
  } else chars = CHARACTERS.slice();

  const { Kart } = mods.kart;
  for (let i = 0; i < RACE.racers; i++) {
    const character = chars[i % chars.length];
    const isPlayer = mode === 'race' && i === 0;
    const model = makeKartModel(character);
    const kart = new Kart({ scene: w.scene, track: w.track, character, isPlayer, index: i, model });
    w.karts.push(kart);
    if (isPlayer) w.player = kart;
  }

  // grid order: player mid-pack (slot 4 or 5), others shuffled
  const gridOrder = new Array(RACE.racers);
  const rest = shuffle(w.karts.filter((k) => k !== w.player));
  if (w.player) {
    const slot = 4 + ((Math.random() * 2) | 0);
    gridOrder[slot] = w.player;
  }
  for (let i = 0; i < gridOrder.length; i++) if (!gridOrder[i]) gridOrder[i] = rest.shift();

  w.race = new RaceManager({ track: w.track, karts: w.karts, player: w.player, laps, silent: mode !== 'race' });
  w.race.placeOnGrid(gridOrder);

  const AIClass = (mods.ai && mods.ai.AIDriver) || null;
  for (const k of w.karts) {
    if (k === w.player) continue;
    let ai = null;
    if (AIClass) ai = safe('ai.ctor', () => new AIClass(k, w.track, { difficulty: mode === 'race' ? difficulty : 'hard' }));
    w.ais.push(ai || new FallbackAI(k, w.track));
  }
}

function finishWorld(w) {
  if (mods.items && mods.items.ItemSystem) w.items = safe('items.ctor', () => new mods.items.ItemSystem({ scene: w.scene, track: w.track, karts: w.karts }));
  if (mods.effects && mods.effects.Effects) w.effects = safe('effects.ctor', () => new mods.effects.Effects(w.scene, camera));
  w.chase = (mods.camera && mods.camera.ChaseCamera && safe('camera.ctor', () => new mods.camera.ChaseCamera(camera))) || new FallbackCamera(camera);
  w.ctx = { karts: w.karts, player: w.player || w.karts[0], itemSystem: w.items || null, time: 0 };
  if (w.player) safe('camera.snap', () => w.chase.snap(w.player));

  renderPass.scene = w.scene;
  return w;
}

function disposeWorld() {
  const w = world;
  if (w && w.online) net.offsets.clear();
  world = null;
  net.pzPhase = 'run';
  hud.hideNetPause();
  hud.setNetPauseButton(null);
  renderPass.scene = fallbackScene;
  if (!w) return;
  safe('dispose.items', () => w.items && w.items.dispose && w.items.dispose());
  safe('dispose.effects', () => w.effects && w.effects.dispose && w.effects.dispose());
  for (const k of (w.allKarts || w.karts)) safe('dispose.kart', () => k.dispose && k.dispose());
  safe('dispose.track', () => w.track && w.track.dispose && w.track.dispose());
  safe('dispose.race', () => w.race && w.race.dispose());
  safe('dispose.ai', () => { for (const a of [...w.ais, w.playerAI]) a && a.dispose && a.dispose(); });
  safe('dispose.chase', () => w.chase && w.chase.dispose && w.chase.dispose());
  // sweep anything left in the scene graph
  safe('dispose.scene', () => {
    const seen = new Set();
    const dispTex = (m) => {
      for (const key in m) {
        const v = m[key];
        if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); }
      }
    };
    w.scene.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) if (!seen.has(m)) { seen.add(m); dispTex(m); m.dispose(); }
      if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose();
    });
    if (w.scene.background && w.scene.background.isTexture) w.scene.background.dispose();
    if (w.scene.environment && w.scene.environment.isTexture) w.scene.environment.dispose();
    w.scene.clear();
  });
  renderer.renderLists.dispose();
}

// ---------------------------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------------------------
function buildAttract() {
  disposeWorld();
  try {
    world = buildWorld({ mode: 'attract' });
    world.race.startImmediately();
    // stagger: let them drive for a few seconds instantly so the title shows a spread-out pack
    attractCam.targetIndex = 0; attractCam.switchT = 0;
    uiRoot.classList.remove('no-world');
  } catch (e) {
    report('attract', e);
    disposeWorld();
    uiRoot.classList.add('no-world');
  }
}

function goToTitle() {
  hud.hide(); hud.hideResults();
  audio.setPaused(false);
  audio.setGameplayActive(false);
  resultsShown = false;
  menu.showLoading('LOADING');
  setTimeout(() => {
    buildAttract();
    menu.showTitle();
    setState('title');
    audio.playMusic('menu');
  }, 30);
}

function startRace(settings) {
  lastSettings = { ...lastSettings, ...settings };
  hud.hide(); hud.hideResults();
  menu.showLoading('GET READY!');
  audio.setPaused(false);
  audio.stopMusic();
  setState('loading');
  setTimeout(() => {
    disposeWorld();
    try {
      world = buildWorld({ mode: 'race', ...lastSettings });
    } catch (e) {
      report('buildWorld', e);
      menu.showLoading('RACE FAILED TO LOAD — SEE CONSOLE');
      setTimeout(goToTitle, 2500);
      return;
    }
    resultsShown = false;
    introTimer = 0;
    seenErrors.clear();
    hud.reset({ player: world.player, track: world.track, laps: lastSettings.laps });
    hud.show();
    menu.hideAll();
    audio.setGameplayActive(true);
    uiRoot.classList.remove('no-world');
    setState('intro');
    showIntroCard();
  }, 40);
}

let introCard = null;
function showIntroCard() {
  if (!introCard) introCard = Object.assign(document.createElement('div'), { className: 'intro-card' });
  uiRoot.appendChild(introCard);
  const name = (world && world.track && world.track.name) || 'Grand Circuit';
  const d = { easy: '50cc', normal: '100cc', hard: '150cc' }[lastSettings.difficulty] || '';
  introCard.innerHTML = `<div class="ic-sub">${d} · ${lastSettings.laps} LAP${lastSettings.laps > 1 ? 'S' : ''}</div><div class="ic-name">${name}</div><div class="ic-skip">ENTER · SKIP</div>`;
  introCard.classList.remove('show'); void introCard.offsetWidth; introCard.classList.add('show');
}
function hideIntroCard() { if (introCard) introCard.classList.remove('show'); }

function beginCountdown() {
  if (state !== 'intro' || !world) return;
  hideIntroCard();
  world.race.startCountdown();
  setState('countdown');
  safe('camera.snap', () => world.chase.snap(world.player));
}

function pause() {
  if (!RACE_STATES.has(state) || resultsShown) return;
  if (world && world.online) {
    // online: open the menu while the race keeps running; PAUSE RACE there pauses it for everyone
    net.menuOpen = true;
    menu.showPause({ online: true, netPause: netPauseMenuState() });
    return;
  }
  prevState = state;
  setState('paused');
  menu.showPause();
  audio.setPaused(true);
}
function resume() {
  if (net.menuOpen) { net.menuOpen = false; menu.hideAll(); return; }
  if (state !== 'paused') return;
  menu.hideAll();
  setState(prevState || 'racing');
  audio.setPaused(false);
  clock.getDelta();
}

bus.on('race:go', () => {
  if (state === 'countdown' || (state === 'paused' && prevState === 'countdown')) {
    if (state === 'paused') prevState = 'racing'; else setState('racing');
    audio.playMusic('race');
  }
});
bus.on('race:finish', (d) => {
  if (!world || !d || !d.kart) return;
  if (!d.kart.isPlayer) {
    // online: another racer finished after our results went up: swap their estimate for the real time
    if (world.online && resultsShown) {
      clearTimeout(net.resTimer);
      net.resTimer = setTimeout(() => { if (world && world.online && resultsShown && hud.resultsVisible) showOnlineResults(); }, 300);
    }
    return;
  }
  if (world.online && net.session) net.session.setProfile({ st: 'done' }); // tells the host we're off the track
  setState('finished');
  // hand the player's kart to an AI so it keeps cruising during the finish camera
  const AIClass = mods.ai && mods.ai.AIDriver;
  world.playerAI = (AIClass && safe('ai.player', () => new AIClass(world.player, world.track, { difficulty: 'easy' }))) || new FallbackAI(world.player, world.track);
});
bus.on('race:end', (d) => {
  if (!world || world.mode !== 'race') return;
  resultsShown = true;
  const results = (d && d.results) || world.race.computeResults();
  if (state === 'paused') resume();
  setTimeout(() => {
    if (!world || !resultsShown) return;
    audio.playMusic('menu');
    if (world.online) {
      net.menuOpen = false;
      if (menu.screen === 'pause') menu.hideAll();
      net.resultsAt = performance.now();
      showOnlineResults();
      return;
    }
    hud.showResults(results, {
      laps: world.race.laps,
      onRestart: () => startRace(lastSettings),
      onMenu: () => goToTitle(),
    });
  }, 200);
});

// ---------------------------------------------------------------------------------------------
// Keyboard (global)
// ---------------------------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return; // lobby text fields
  if (e.code === 'KeyM' && !e.repeat) {
    const muted = audio.toggleMute();
    hud.toast(muted ? 'SOUND OFF' : 'SOUND ON');
    return;
  }
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
    if (state === 'paused') { if (e.code === 'Escape' || e.code === 'KeyP') { bus.emit('ui:back'); resume(); } }
    else if (net.menuOpen) { bus.emit('ui:back'); resume(); }
    else if (RACE_STATES.has(state)) pause();
    return;
  }
  // online race paused for everyone: Enter (pad A) = RESUME on the pause overlay. Not Space: it's the drift key.
  // defaultPrevented = the online menu already used this Enter (BACK closed it): it must not resume as well.
  if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat && !e.defaultPrevented && net.pzPhase === 'paused'
    && world && world.online && !net.menuOpen && !resultsShown) {
    e.preventDefault();
    netResume();
    return;
  }
  if (state === 'intro' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') && !e.repeat) {
    beginCountdown();
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && state !== 'boot') e.preventDefault();
});
canvas.addEventListener('click', () => { if (state === 'intro') beginCountdown(); });
// online races never pause (the race goes on for everyone else)
document.addEventListener('visibilitychange', () => { if (document.hidden && (state === 'racing' || state === 'countdown') && !(world && world.online)) pause(); });

// ---------------------------------------------------------------------------------------------
// Attract-mode camera (title / select): cinematic orbit around a kart, or around the track centre
// ---------------------------------------------------------------------------------------------
const attractCam = {
  targetIndex: 0, switchT: 0, angle: 0,
  pos: new THREE.Vector3(0, 40, 80), look: new THREE.Vector3(), init: false,
  _p: new THREE.Vector3(), _l: new THREE.Vector3(),
};
function updateAttractCamera(dt) {
  const w = world;
  const ac = attractCam;
  ac.angle += dt * (state === 'select' ? 0.28 : 0.16);
  let target = null;
  if (w && w.karts.length) {
    if (state === 'select') target = w.karts[menu.charIndex] || w.karts[0];
    else {
      ac.switchT -= dt;
      if (ac.switchT <= 0) {
        ac.switchT = 9;
        const st = w.race.standings;
        const pick = st[(Math.random() * Math.min(4, st.length)) | 0];
        ac.targetIndex = w.karts.indexOf(pick);
      }
      target = w.karts[ac.targetIndex] || w.karts[0];
    }
  }
  if (target) {
    const close = state === 'select';
    const r = close ? 7.5 : 14 + Math.sin(ac.angle * 0.7) * 3;
    const h = target.heading || 0;
    const a = h + (close ? Math.PI * 0.75 + Math.sin(ac.angle) * 0.5 : ac.angle);
    ac._p.set(target.position.x + Math.sin(a) * r, target.position.y + (close ? 2.6 : 5 + Math.sin(ac.angle * 0.5) * 2), target.position.z + Math.cos(a) * r);
    ac._l.set(target.position.x, target.position.y + (close ? 1.1 : 1.5), target.position.z);
    // lead by velocity so the exponential smoothing below has no steady-state lag behind a moving kart
    const v = target.velocity;
    if (v) { const lead = 1 / 2.5; ac._p.addScaledVector(v, lead); ac._l.addScaledVector(v, lead); }
  } else {
    let cx = 0, cz = 0, span = 200;
    const mm = w && w.track && w.track.minimap && w.track.minimap.bounds;
    if (mm) { cx = (mm.minX + mm.maxX) / 2; cz = (mm.minZ + mm.maxZ) / 2; span = Math.max(mm.maxX - mm.minX, mm.maxZ - mm.minZ); }
    ac._p.set(cx + Math.cos(ac.angle) * span * 0.6, span * 0.3, cz + Math.sin(ac.angle) * span * 0.6);
    ac._l.set(cx, 0, cz);
  }
  const k = ac.init ? 1 - Math.exp(-dt * 2.5) : 1;
  ac.init = true;
  ac.pos.lerp(ac._p, k); ac.look.lerp(ac._l, k);
  camera.position.copy(ac.pos);
  camera.lookAt(ac.look);
  if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
}

// ---------------------------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------------------------
let playerInput = null;
const debug = { autopilot: false };
function simulate(w, dt) {
  time += dt;
  w.ctx.time = time;
  const racing = w.mode === 'race';
  const player = w.player;

  // player input (always drain the controller so edge-triggered presses don't queue up)
  if (racing && player) {
    let raw = null;
    if (input) raw = safe('input.getInput', () => input.getInput());
    if (input) safe('input.pause', () => input.consumePressed && input.consumePressed('pause'));
    // menu keys must not steer; the item button (not a menu key) keeps its real held state, so an item held
    // behind the kart isn't thrown just because the menu opened
    if (net.menuOpen && w.online) raw = { ...NEUTRAL, itemHeld: !!(raw && raw.itemHeld) };
    playerInput = raw || NEUTRAL;
    if (debug.autopilot && !w.playerAI && !player.controlsLocked) {
      const AIClass = mods.ai && mods.ai.AIDriver;
      w.playerAI = (AIClass && safe('ai.player', () => new AIClass(player, w.track, { difficulty: 'hard' }))) || new FallbackAI(player, w.track);
    }
    if ((player.finished || debug.autopilot) && w.playerAI) {
      safe('ai.player', () => w.playerAI.update(dt, w.ctx));
    } else if (player.controlsLocked) {
      player.input = { ...NEUTRAL };
    } else {
      player.input = raw || { ...NEUTRAL };
    }
  }

  for (let i = 0; i < w.ais.length; i++) {
    const ai = w.ais[i];
    try { ai.update(dt, w.ctx); } catch (e) { report('ai.update', e); }
  }
  const nowMs = performance.now();
  for (let i = 0; i < w.karts.length; i++) {
    const k = w.karts[i];
    if (k.remote) { try { k.ghostUpdate(dt, nowMs); } catch (e) { report('kart.ghost', e); } continue; }
    try { k.update(dt); } catch (e) { report('kart.update', e); }
  }
  if (mods.kart && mods.kart.resolveKartCollisions) safe('resolveKartCollisions', () => mods.kart.resolveKartCollisions(w.karts));
  if (w.items) safe('items.update', () => w.items.update(dt, time));
  if (w.online) {
    // every client's countdown AND race clock run off the wall clock from when `start` arrived, so GO lines
    // up and finish times compare fairly across clients (a hidden tab, a slow phone or a frame hitch can't
    // shrink a client's race time); only the time this client sat frozen by a pause is taken out (net.pzOff).
    // RaceManager adds dt itself, hence the `- dt`.
    const el = netElapsedMs(nowMs) / 1000 - COUNTDOWN_LEAD;
    if (w.race.phase === 'countdown') w.race.countdownTime = el - dt;
    else if (w.race.phase === 'racing' || w.race.phase === 'done') w.race.raceTime = el - GO_AT - dt;
  }
  safe('race.update', () => w.race.update(dt));
  if (w.online) safe('net.tick', () => netTick(w, nowMs));
  if (w.effects) safe('effects.update', () => w.effects.update(dt, w.karts));
  safe('track.update', () => w.track.update && w.track.update(dt, time));
  // keep the sun's shadow frustum centred on whatever the camera is following
  const focus = racing ? player : (w.karts[attractCam.targetIndex] || w.karts[0]);
  if (focus && w.track.setShadowFocus) safe('track.setShadowFocus', () => w.track.setShadowFocus(focus.position));

  if (racing && state === 'intro') {
    introTimer += dt;
    if (introTimer > 4.0) beginCountdown();
  }
}

function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 1 / 30);
  const w = world;
  // online race paused for everyone (or counting back in): the whole race holds still on every client
  const netFrozen = !!(w && w.online) && !!safe('net.pause', () => netPauseTick(w, performance.now(), rawDt));
  safe('menu.update', () => menu.update(rawDt, resultsShown ? 'results' : netFrozen && net.pzPhase === 'paused' ? 'netpause' : state));

  if (w) {
    const running = state !== 'paused' && state !== 'loading' && state !== 'boot' && !netFrozen;
    if (running) simulate(w, dt);
    else if (netFrozen && state !== 'loading') safe('net.frozen', () => netFrozenTick(w));

    if (w.mode === 'race' && w.player) {
      if (state !== 'paused' && !netFrozen) {
        const mode = state === 'intro' ? 'intro' : state === 'countdown' ? 'countdown' : state === 'finished' ? 'finish' : 'race';
        const lookBack = !!(state === 'racing' && playerInput && playerInput.lookBack);
        safe('camera.update', () => w.chase.update(dt, w.player, { lookBack, mode }));
      }
      safe('hud.update', () => hud.update(dt, { player: w.player, karts: w.karts, race: w.race, itemSystem: w.items, track: w.track, time }));
    } else {
      updateAttractCamera(dt);
    }
    safe('audio.update', () => audio.update(dt, { player: w.player, karts: w.karts, camera }));
  } else {
    updateAttractCamera(dt);
    safe('audio.update', () => audio.update(dt, { camera }));
  }

  try { composer.render(dt); } catch (e) { report('render', e); }
}

// ---------------------------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------------------------
async function boot() {
  document.body.dataset.state = 'boot';
  menu.showLoading('LOADING');
  requestAnimationFrame(frame);
  await loadModules();
  if (mods.input && mods.input.InputController) input = safe('input.ctor', () => new mods.input.InputController());
  if (mods.models && mods.models.createCharacterPortrait) {
    const fn = (c) => mods.models.createCharacterPortrait(c);
    portraitFn = fn;
    safe('portraits', () => menu.setPortraitProvider(fn));
    hud.setPortraitProvider(fn);
  }
  menu.setOnlineAvailable(!!(mods.online && mods.lobby));
  buildAttract();
  await warmUp(world);
  menu.showTitle();
  setState('title');
  audio.playMusic('menu');
  // invite links: kart/?room=CODE opens straight into joining that room
  let code = '';
  try { code = mods.online ? mods.online.normalizeCode(new URLSearchParams(location.search).get('room')) : ''; } catch (e) { code = ''; }
  if (code) openOnline(code);
}
let portraitFn = null;

// Patch port: compile shaders in parallel and upload textures a few at a time behind the
// loading screen, so the first render of the title scene doesn't block the main thread for seconds.
async function warmUp(w) {
  if (!w) return;
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  renderPass.scene = fallbackScene;
  await nextFrame(); // end the task that built the world before compiling
  try {
    const textures = new Set();
    w.scene.traverse((o) => {
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        for (const k in m) { const v = m[k]; if (v && v.isTexture && !v.isRenderTargetTexture) textures.add(v); }
      }
    });
    let t = performance.now();
    for (const tex of textures) {
      renderer.initTexture(tex);
      if (performance.now() - t > 30) { await nextFrame(); t = performance.now(); }
    }
    // RenderPass draws into the composer's (linear, untonemapped) buffer, so compile for that target.
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(composer.readBuffer);
    const done = renderer.compileAsync(w.scene, camera);
    renderer.setRenderTarget(prevTarget);
    await done;
  } catch (e) { /* warm-up is best effort: the first render compiles whatever is left */ }
  if (world === w) renderPass.scene = w.scene;
}
boot();

// ---------------------------------------------------------------------------------------------
// Online races (BDB Supabase realtime): lobby, start, ghosts, items, host migration
// Ownership: each kart is simulated by exactly one client (a human's kart by that human, AI karts by
// the host); everyone else shows it as a ghost following ~10 Hz snapshots.
// ---------------------------------------------------------------------------------------------
const COUNTDOWN_LEAD = 1.5;     // s from receiving `start` to the first countdown mark (hides world build time)
const GO_AT = 3.5;              // s into RaceManager's countdown when GO fires (race.js marks)
const GONE_GRACE_MS = 4000;     // a racer missing from presence (or back in the lobby) this long leaves the race
const AI_SETTLE_MS = 5000;      // right after `start`, presence `st` may still read 'lobby': don't judge by it yet
const RACE_WAIT_MS = 30000;     // host's RACE AGAIN waits this long at most for racers still driving
const START_DEBOUNCE_MS = 3000; // a second `start` this soon after the last one is ignored
// The realtime server counts every delivered copy of a broadcast toward the tenant's events/s budget, so a
// room of N humans costs ~N^2 x send rate. Send slower as rooms grow: 2 -> 10 Hz (40/s), 3 -> 6.7 Hz (60/s),
// 4 -> 5 Hz (80/s), 5+ -> 4 Hz (100/s at 5, 256/s at 8: needs the tenant limit raised).
function sendIntervalMs() {
  const n = net.grid ? net.grid.filter((g) => g.owner !== 'ai').length : 1;
  return Math.min(250, Math.max(100, 50 * n));
}
const net = {
  session: null, lobby: null, active: false,
  raceId: null, grid: null, laps: RACE.laps, aiOwner: null,
  opts: { laps: RACE.laps, ai: true },
  menuOpen: false, countdownT0: 0, sendT: 0, checkT: 0, flow: 0, resultsAt: 0, resTimer: null,
  offsets: new Map(),
  notice: null,
  last: { s: 0, start: 0, iu: 0, lobby: 0 },
  // pause for everyone (see "Online pause" below)
  pz: { n: 0, a: 0, g: 0, pt: 0, k: -1 }, pzPhase: 'run', pzUsed: new Map(), pzMsgAt: new Map(),
  pzActT: -Infinity, pzCd: 0, pzAutoMs: 60000,
  pzOff: 0, pzFrz: null, pzPausedAt: -Infinity,
};

function netCtx() {
  const s = net.session;
  return { hostId: s.hostId, aiOwner: net.aiOwner, players: s.players, raceId: net.raceId, grid: net.grid, laps: net.laps };
}

/** Other players in the room still driving a race (presence st 'race'; 'done' = finished, 'lobby' = out). */
function driversLeft() {
  const s = net.session;
  if (!s) return 0;
  let n = 0;
  for (const p of s.players.values()) if (p.id !== s.myId && p.st === 'race') n++;
  return n;
}

/**
 * Who simulates the AI karts: the earliest-joined racer of THIS race still in it (present, st race/done).
 * Computed from presence + the race grid only, so every client gets the same answer, and someone sitting
 * in the lobby (or a late joiner with a skewed clock) can never take the AI over mid-race.
 */
function computeAIOwner() {
  const s = net.session;
  if (!s || !net.grid) return null;
  const settling = performance.now() - net.countdownT0 < AI_SETTLE_MS;
  const humans = new Set(net.grid.filter((g) => g.owner !== 'ai').map((g) => g.owner));
  for (const id of s.order) {
    if (!humans.has(id)) continue;
    const p = s.players.get(id);
    if (p && (settling || p.st === 'race' || p.st === 'done')) return id;
  }
  return null;
}
function syncAIOwner() {
  const w = world;
  if (!w || !w.online || !net.session || w.raceId !== net.raceId) return;
  const id = computeAIOwner();
  if (id === net.aiOwner) return;
  net.aiOwner = id;
  const me = id === net.session.myId;
  if (me) adoptAIKarts(w); else releaseAIKarts(w);
  if (me && !resultsShown && w.karts.some((k) => k.owner === 'ai')) hud.toast('YOU RUN THE AI NOW');
}

function ensureNet() {
  if (net.session) return true;
  if (!mods.online || !mods.lobby) return false;
  const O = mods.online;
  net.session = new O.OnlineSession({
    onStatus: (s) => onNetStatus(s),
    onPlayers: () => { safe('net.aiOwner', () => syncAIOwner()); renderLobby(); },
    onMessage: (ev, p, from) => onNetMessage(ev, p, from),
    onHostChange: (h, old) => onHostChange(h, old),
  });
  net.lobby = new mods.lobby.Lobby(uiRoot, {
    onCreate: () => netJoin(O.makeRoomCode()),
    onJoin: (code) => {
      const c = O.normalizeCode(code);
      if (c) netJoin(c); else net.lobby.setStatus('Enter the 6-character room code.', 'warn');
    },
    onLeave: () => netLeaveRoom(),
    onBack: () => leaveOnline(),
    onStart: () => hostStart(),
    onProfile: (p) => { net.session.setProfile({ name: p.name, char: p.char }); renderLobby(); },
    onOptions: (o) => {
      if (o.laps != null && O.LAP_CHOICES.includes(o.laps)) net.opts.laps = o.laps;
      if (o.ai != null) net.opts.ai = !!o.ai;
      renderLobby();
    },
  });
  if (portraitFn) safe('lobby.portraits', () => net.lobby.setPortraitProvider(portraitFn));
  return true;
}

function setRoomInUrl(code) {
  try {
    const u = new URL(location.href);
    if (code) u.searchParams.set('room', code); else u.searchParams.delete('room');
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
  } catch (e) { /* ignore */ }
}
function inviteLink(code) { return code ? location.origin + location.pathname + '?room=' + code : ''; }

function openOnline(code = '') {
  if (!ensureNet()) { hud.toast('ONLINE UNAVAILABLE'); return; }
  net.active = true;
  menu.showExternal('lobby');
  net.lobby.show();
  setState('lobby');
  if (code && code !== net.session.code) netJoin(code);
  renderLobby();
}

function netJoin(code) {
  if (!code) return;
  net.raceId = null; net.grid = null; net.notice = null;
  net.session.join(code, { ...net.lobby.profile, st: 'lobby' });
  setRoomInUrl(code);
  renderLobby();
}

function netLeaveRoom() {
  net.session.leave();
  net.raceId = null; net.grid = null; net.notice = null;
  setRoomInUrl('');
  renderLobby();
}

function leaveOnline() {
  net.flow++;
  if (net.session) net.session.leave();
  net.active = false; net.menuOpen = false; net.raceId = null; net.grid = null; net.notice = null;
  if (net.lobby) net.lobby.hide();
  setRoomInUrl('');
  goToTitle();
}

function goToLobby() {
  const tok = ++net.flow;
  hud.hide(); hud.hideResults();
  net.menuOpen = false;
  audio.setPaused(false);
  audio.setGameplayActive(false);
  resultsShown = false;
  if (net.session) net.session.setProfile({ st: 'lobby' });
  menu.showLoading('LOADING');
  setTimeout(() => {
    if (tok !== net.flow || !net.active) return;
    buildAttract();
    menu.showExternal('lobby');
    net.lobby.show();
    setState('lobby');
    renderLobby();
    audio.playMusic('menu');
  }, 30);
}

const STATUS_TEXT = {
  connecting: ['Connecting to the BDB server…', 'info'],
  reconnecting: ['Connection lost. Reconnecting…', 'warn'],
  unreachable: ["Can't reach the BDB server. Retrying…", 'error'],
  full: ['That room is full (8 racers max).', 'error'],
};
function onNetStatus(s) {
  if (world && world.online && !resultsShown) {
    if (s === 'reconnecting' || s === 'unreachable') hud.toast('CONNECTION LOST · RECONNECTING');
    else if (s === 'joined') hud.toast('RECONNECTED');
  }
  if (s === 'full') setRoomInUrl('');
  renderLobby();
}

function renderLobby() {
  const s = net.session, L = net.lobby;
  if (!s || !L) return;
  const inRoom = !!s.code && s.status !== 'full' && s.status !== 'closed' && s.status !== 'idle';
  const players = s.playerList().map((p) => ({ ...p, host: p.id === s.hostId, me: p.id === s.myId }));
  const joined = s.status === 'joined';
  const driving = joined ? driversLeft() : 0; // a race is still running for someone
  let [status, kind] = STATUS_TEXT[s.status] || ['', ''];
  if (joined) {
    if (net.notice && performance.now() < net.notice.until) [status, kind] = [net.notice.text, 'warn'];
    else if (driving) [status, kind] = [s.isHost ? `Race in progress. Start when ${driving === 1 ? 'the last racer finishes' : `${driving} racers finish`}.` : "Race in progress. You'll join the next race.", 'info'];
    else [status, kind] = [s.isHost ? 'You are the host. Start when everyone is in.' : 'Connected.', 'ok'];
  }
  L.render({
    phase: inRoom ? 'room' : 'menu',
    status, statusKind: kind,
    code: s.code || '', link: inviteLink(s.code),
    players, isHost: joined && s.isHost,
    laps: net.opts.laps, ai: net.opts.ai,
    canStart: joined && s.isHost && players.length >= 1 && !driving,
    waiting: driving ? 'Race in progress…' : 'Waiting for the host to start the race…',
  });
}

/** Host: start a race for the room. Returns false (and does nothing) if this client can't start one now. */
function hostStart() {
  const s = net.session;
  if (!s || !s.isHost || s.status !== 'joined') return false;
  // never pull racers out of a race they're still driving (the results screen waits RACE_WAIT_MS at most)
  const onResults = !!(world && world.online && resultsShown);
  if (driversLeft() && !(onResults && performance.now() - net.resultsAt > RACE_WAIT_MS)) return false;
  const humans = s.playerList();
  if (!humans.length) return false;
  const entries = humans.map((p, i) => ({ k: i, owner: p.id, char: p.char, name: p.name }));
  if (net.opts.ai) {
    const used = new Set(humans.map((p) => p.char));
    const pool = [...CHARACTERS.filter((c) => !used.has(c.id)), ...CHARACTERS.filter((c) => used.has(c.id))];
    for (let i = entries.length, j = 0; i < RACE.racers; i++, j++) {
      const c = pool[j % pool.length];
      entries.push({ k: i, owner: 'ai', char: c.id, name: c.name });
    }
  }
  const msg = { race: mods.online.randomId(8), laps: net.opts.laps, grid: shuffle(entries) };
  if (!s.send('start', msg)) return false;
  onNetStart(msg, s.myId);
  return true;
}

function onNetMessage(ev, p, from) {
  switch (ev) {
    case 'start': onNetStart(p, from); break;
    case 's': onNetState(p, from); break;
    case 'iu': onNetItemUse(p, from); break;
    case 'ib': onNetItemBlock(p, from); break;
    case 'pause': case 'resume': onNetPauseMsg(ev, p, from); break;
    case 'lobby': {
      const w = world;
      if (from !== net.session.hostId || !w || !w.online || !p || p.r !== net.raceId) break;
      if (w.player && !w.player.finished) break; // still driving: finish first, then pick LOBBY yourself
      net.last.lobby = performance.now();
      goToLobby();
      break;
    }
    default: break;
  }
}

function onNetStart(raw, from) {
  if (!net.active) return;
  const now = performance.now();
  if (from !== net.session.myId && now - net.last.start < START_DEBOUNCE_MS) return; // start spam
  const p = mods.online.validateStart(raw, from, netCtx());
  if (!p) return;
  net.last.start = now;
  net.raceId = p.race; net.grid = p.grid; net.laps = p.laps;
  net.aiOwner = from; // the starter runs the AI until it leaves the race (see computeAIOwner)
  net.offsets.clear();
  resetNetPause();
  if (!p.grid.some((g) => g.owner === net.session.myId)) { renderLobby(); return; } // not in it: wait for the next one
  startOnlineRace(p, performance.now());
}

function startOnlineRace(p, t0) {
  const tok = ++net.flow;
  net.menuOpen = false;
  net.countdownT0 = t0;
  hud.hide(); hud.hideResults();
  if (net.lobby) net.lobby.hide();
  menu.showLoading('GET READY!');
  audio.setPaused(false);
  audio.stopMusic();
  setState('loading');
  net.session.setProfile({ st: 'race' });
  setTimeout(() => {
    if (tok !== net.flow || !net.active || net.raceId !== p.race) return;
    disposeWorld();
    try {
      world = buildWorld({ mode: 'race', laps: p.laps, online: p });
    } catch (e) {
      report('buildWorld', e);
      goToLobby();
      return;
    }
    resultsShown = false;
    introTimer = 0;
    seenErrors.clear();
    net.sendT = 0; net.checkT = performance.now();
    hud.reset({ player: world.player, track: world.track, laps: p.laps });
    hud.show();
    menu.hideAll();
    audio.setGameplayActive(true);
    uiRoot.classList.remove('no-world');
    world.race.startCountdown();
    setState('countdown');
    safe('camera.snap', () => world.chase.snap(world.player));
  }, 40);
}

function onNetState(raw, from) {
  const w = world;
  if (!w || !w.online) return;
  const p = mods.online.validateState(raw, from, netCtx());
  if (!p) return;
  const now = performance.now();
  net.last.s = now;
  // every snapshot carries the race's latest pause: a client that missed a pause / resume (reconnect) catches up
  if (p.z && pauseSane(p.z, now)) mergePause(p.z);
  const frozen = pzPhase(now) !== 'run'; // ghosts hold still; their buffers restart on resume
  // map the sender's clock onto ours with the smallest offset seen (= latency floor), so snapshot
  // timing follows the sender's send times instead of network jitter
  const o = now - p.t;
  let off = net.offsets.get(from);
  if (off == null || o < off) off = o; else off += (o - off) * 0.005;
  net.offsets.set(from, off);
  const t = p.t + off;
  const HELD = mods.online.HELD_ITEMS;
  for (const e of p.karts) {
    const kart = w.byIndex.get(e.k);
    if (!kart || !kart.remote) continue;
    if (kart.departed) restoreKart(w, kart); // its owner came back (reconnect): put the kart back in the race
    if (!frozen) kart.pushSnapshot({ t, x: e.x, y: e.y, z: e.z, h: e.h, speed: e.speed, vx: e.vx, vz: e.vz, flags: e.flags, driftDir: e.driftDir });
    kart.net = { lap: e.lap, tt: e.tt, fin: e.fin, ft: e.ft };
    kart.heldItem = HELD[e.hd] || null; // the item it holds behind it (drawn by ItemSystem)
  }
}

const IU_MIN_GAP_MS = 150;   // per kart: real use is >= 280 ms apart (USE_COOLDOWN); allow for network jitter
const IU_BIG_GAP_MS = 4000;  // per kart: lightning / blue shell / star can't legitimately repeat this fast
const BIG_ITEMS = new Set(['lightning', 'blue_shell', 'star']);
function onNetItemUse(raw, from) {
  const w = world;
  if (!w || !w.online || !w.items) return;
  const p = mods.online.validateItemUse(raw, from, netCtx());
  if (!p) return;
  const kart = w.byIndex.get(p.k);
  if (!kart || !kart.remote || kart.departed) return;
  const now = performance.now();
  if (now - (kart._iuAt || 0) < IU_MIN_GAP_MS) return;
  const big = BIG_ITEMS.has(p.item);
  if (big && now - (kart._iuBigAt || 0) < IU_BIG_GAP_MS) return;
  kart._iuAt = now;
  if (big) kart._iuBigAt = now;
  net.last.iu = now;
  safe('items.remoteUse', () => w.items.remoteUse(kart, p.item, p));
}

// a kart this client owns used an item: tell everyone so they fire it from the ghost, the same way
// (dir: 1 = banana thrown forward, -1 = shell thrown backwards)
bus.on('item:use', (d) => {
  const w = world;
  if (!w || !w.online || !d || !d.kart || d.kart.remote || !net.session) return;
  const k = d.kart;
  net.session.send('iu', { r: net.raceId, k: k.index, item: d.item, fw: d.dir > 0, bk: d.dir < 0 });
});

/** A racer's held item blocked a projectile on their screen (their call, like hits): remove it here too. */
function onNetItemBlock(raw, from) {
  const w = world;
  if (!w || !w.online || !w.items) return;
  const p = mods.online.validateItemBlock(raw, from, netCtx());
  if (!p) return;
  const kart = w.byIndex.get(p.k);
  if (!kart || !kart.remote || kart.departed) return;
  const now = performance.now();
  if (now - (kart._ibAt || 0) < IU_MIN_GAP_MS) return;
  kart._ibAt = now;
  safe('items.remoteBlock', () => w.items.remoteBlock(kart, w.byIndex.get(p.o) || null, p.t, p.x, p.z));
}

// a kart this client owns blocked a projectile with its held item: tell everyone
bus.on('item:block', (d) => {
  const w = world;
  if (!w || !w.online || !d || !d.kart || d.kart.remote || !net.session || !d.by) return;
  const r2 = (v) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
  net.session.send('ib', { r: net.raceId, k: d.kart.index, o: d.by.index, t: d.type, x: r2(d.x), z: r2(d.z) });
});

// ---------------------------------------------------------------------------------------------
// Online pause: any racer can freeze the race for everyone (PAUSES_PER_RACER per race, auto-resume after
// net.pzAutoMs). The race's latest pause is one tuple, net.pz = {n, a, g, pt, k}, on the shared race clock
// (ms since `start` arrived, the countdown's origin): frozen at a, resuming at g (0 = until someone presses
// RESUME), pt = ms of the earlier pauses (informational), k = the pauser's kart. `pause`, `resume` and every
// state snapshot carry it and each client merges it the same way (newer n wins; same n: earliest a, earliest
// g), so every screen shows the same pause and counts back in to the same instant g. Each client's race clock
// leaves out only the time it really sat frozen (net.pzOff: from when it froze to g): a client that heard of
// the pause late kept driving until then, and that driving counts. Finish times are each owner's own clock
// (`ft`), so places still agree. A client that missed a message (reconnect) catches up from the next snapshot.
// ---------------------------------------------------------------------------------------------
const PAUSES_PER_RACER = 3;
const PAUSE_AUTO_MS = 60000;
const RESUME_LEAD_MS = 3000;  // synced 3-2-1 before the race moves again
const PAUSE_GAP_MS = 1000;    // this client: at most one pause / resume per second
const RESUME_GUARD_MS = 1500; // no RESUME for this long after the race froze here (a reflex Enter / pad A can't undo it)
const PAUSE_SPAM_MS = 500;    // per sender: pause / resume messages closer than this are dropped
const PAUSE_SKEW_MS = 10000;  // a pause / resume instant this far ahead of our race clock is bogus
const PAUSED_SEND_MS = 1000;  // state snapshots while frozen (they carry the pause for reconnecting clients)

function resetNetPause() {
  net.pz = { n: 0, a: 0, g: 0, pt: 0, k: -1 };
  net.pzUsed.clear(); net.pzMsgAt.clear();
  net.pzCd = 0;
  net.pzOff = 0; net.pzFrz = null; net.pzPausedAt = -Infinity;
}
const pzTuple = () => [net.pz.n, net.pz.a, net.pz.g, net.pz.pt, net.pz.k];
function pzPhase(nowMs) {
  const P = net.pz;
  if (!P.n) return 'run';
  if (!P.g) return 'paused';
  return nowMs - net.countdownT0 < P.g ? 'resuming' : 'run';
}
/** Online race clock (ms since `start` arrived) without the time this client sat frozen; holds still while frozen. */
function netElapsedMs(nowMs) {
  return (net.pzFrz != null ? net.pzFrz : nowMs - net.countdownT0) - net.pzOff;
}
function inNetRace() {
  const s = net.session;
  return !!(s && net.raceId && net.grid && net.grid.some((g) => g.owner === s.myId));
}
function pausesUsed(k) { const u = net.pzUsed.get(k); return u ? u.size : 0; }
function myPausesLeft() {
  const w = world;
  return w && w.online && w.player ? Math.max(0, PAUSES_PER_RACER - pausesUsed(w.player.index)) : 0;
}
function pauseSane(z, nowMs) {
  const raw = nowMs - net.countdownT0;
  return z.a <= raw + PAUSE_SKEW_MS && (!z.g || z.g <= raw + RESUME_LEAD_MS + PAUSE_SKEW_MS);
}

/** Merge a pause tuple (validated) into ours. False if refused: that racer is out of pauses. */
function mergePause(z) {
  const P = net.pz;
  if (z.n < P.n) return true; // older news
  let used = net.pzUsed.get(z.k);
  if (!used || !used.has(z.n)) {
    if (used && used.size >= PAUSES_PER_RACER) return false;
    if (!used) net.pzUsed.set(z.k, (used = new Set()));
    used.add(z.n);
  }
  if (z.n > P.n) { net.pz = { n: z.n, a: z.a, g: z.g, pt: z.pt, k: z.k }; return true; }
  if (z.a < P.a || (z.a === P.a && z.k < P.k)) { P.a = z.a; P.k = z.k; } // two racers paused at once
  if (z.g && (!P.g || z.g < P.g)) P.g = z.g;                           // two resumes at once
  if (z.pt > P.pt) P.pt = z.pt;
  return true;
}

function canNetPause() {
  const w = world, s = net.session;
  if (!w || !w.online || !w.player || w.player.finished || resultsShown || !s || s.status !== 'joined') return false;
  if (w.raceId !== net.raceId || (state !== 'countdown' && state !== 'racing')) return false;
  return pzPhase(performance.now()) === 'run' && myPausesLeft() > 0;
}
function netPauseMenuState() {
  return { left: myPausesLeft(), can: canNetPause(), paused: pzPhase(performance.now()) !== 'run' };
}

/** This racer pauses the race for everyone. */
function netPause() {
  const now = performance.now();
  if (!canNetPause() || now - net.pzActT < PAUSE_GAP_MS) return false;
  const P = net.pz;
  const z = [P.n + 1, Math.round(now - net.countdownT0), 0, P.n ? P.pt + (P.g - P.a) : 0, world.player.index];
  if (!net.session.send('pause', { r: net.raceId, z })) { hud.toast('NOT CONNECTED'); return false; }
  net.pzActT = now;
  mergePause({ n: z[0], a: z[1], g: 0, pt: z[3], k: z[4] });
  return true;
}

/** Anyone in the race resumes it: everyone counts down 3-2-1 to the same instant on the race clock. */
function netResume() {
  const now = performance.now();
  const w = world, s = net.session;
  if (!w || !w.online || w.raceId !== net.raceId || pzPhase(now) !== 'paused' || now - net.pzActT < PAUSE_GAP_MS) return false;
  if (net.pzPhase !== 'paused' || now - net.pzPausedAt < RESUME_GUARD_MS) return false; // just froze here
  if (!s || s.status !== 'joined') { hud.toast('NOT CONNECTED'); return false; }
  const P = net.pz;
  const g = Math.round(Math.max(now - net.countdownT0, P.a) + RESUME_LEAD_MS);
  if (!s.send('resume', { r: net.raceId, z: [P.n, P.a, g, P.pt, P.k] })) { hud.toast('NOT CONNECTED'); return false; }
  net.pzActT = now;
  mergePause({ n: P.n, a: P.a, g, pt: P.pt, k: P.k });
  return true;
}

function onNetPauseMsg(ev, raw, from) {
  if (!inNetRace()) return;
  const O = mods.online, ctx = netCtx();
  const z = ev === 'pause' ? O.validatePauseMsg(raw, from, ctx) : O.validateResumeMsg(raw, from, ctx);
  if (!z) return;
  const now = performance.now();
  const last = net.pzMsgAt.get(from);
  if (last != null && now - last < PAUSE_SPAM_MS) return; // pause / resume spam
  if (!pauseSane(z, now)) return;
  net.pzMsgAt.set(from, now);
  mergePause(z);
}

/** Per frame (online race world): phase changes, auto-resume, overlay, countdown. True while the race is frozen. */
function netPauseTick(w, nowMs, rawDt) {
  if (w.raceId !== net.raceId || !net.session) return false;
  const P = net.pz, raw = nowMs - net.countdownT0;
  let phase = pzPhase(nowMs);
  if (phase === 'paused' && raw - P.a >= net.pzAutoMs) {
    // auto-resume: every client computes the same instant, so it fires even if the pauser left; the AI owner
    // also broadcasts it (merge keeps the earliest) in case a client's timeout differs
    P.g = Math.round(P.a + net.pzAutoMs + RESUME_LEAD_MS);
    if (net.aiOwner === net.session.myId) net.session.send('resume', { r: net.raceId, z: pzTuple() });
    phase = pzPhase(nowMs);
  }
  const was = net.pzPhase;
  if (phase !== was) {
    net.pzPhase = phase;
    if (was === 'run') onNetFreeze(raw);
    if (phase === 'paused') net.pzPausedAt = nowMs;
    if (phase === 'run') onNetUnfreeze(w, nowMs);
    // the online menu: counting back in closes it (the 3-2-1 must show, and an open menu holds the kart on
    // neutral input); back to racing, its BACK / RACE PAUSED labels go back to RESUME / PAUSE RACE
    if (phase === 'resuming') closeNetMenu();
    else if (phase === 'run' && net.menuOpen && menu.screen === 'pause') menu.setNetPause(netPauseMenuState());
  }
  const showBtn = !!w.player && !w.player.finished && !resultsShown && (state === 'countdown' || state === 'racing');
  hud.setNetPauseButton(showBtn ? { left: myPausesLeft(), can: canNetPause() } : null);
  if (phase === 'run') return false;
  if (resultsShown && net.resultsAt) net.resultsAt += rawDt * 1000; // RACE AGAIN's wait counts race time only
  if (phase === 'paused') {
    // the online menu (Esc / pad Start) goes on top of the pause overlay, so hide the overlay while it's open
    if (net.menuOpen) hud.hideNetPause();
    else {
      const by = w.byIndex.get(P.k);
      hud.showNetPause({
        by: (by && by.displayName) || 'A RACER', ms: raw - P.a, autoMs: P.a + net.pzAutoMs - raw,
        ready: nowMs - net.pzPausedAt >= RESUME_GUARD_MS,
      });
    }
  } else {
    hud.hideNetPause();
    if (w.race.phase === 'countdown') {
      // paused during the start countdown: that countdown starts over at g (onNetUnfreeze), so no 3-2-1 here
      if (!net.pzCd) { net.pzCd = -1; hud.banner('GET READY!'); }
    } else {
      const n = Math.ceil((P.g - raw) / 1000);
      if (n >= 1 && n <= 3 && n !== net.pzCd) {
        net.pzCd = n;
        hud.showCount(String(n), 'n' + n);
        audio.beep(440, 0.18, 'square', 0.22);
      }
    }
  }
  return true;
}

function closeNetMenu() {
  if (net.menuOpen) { net.menuOpen = false; if (menu.screen === 'pause') menu.hideAll(); }
}

function onNetFreeze(raw) {
  net.pzFrz = raw; // the race clock holds here until g (see netElapsedMs)
  net.pzCd = 0;
  closeNetMenu();
  audio.setPaused(true);
}

function onNetUnfreeze(w, nowMs) {
  // the race clock leaves out exactly the time this client sat frozen (until g, the shared resume instant)
  const P = net.pz, g = P.g || nowMs - net.countdownT0;
  const frz = net.pzFrz != null ? net.pzFrz : g;
  const lead = COUNTDOWN_LEAD * 1000;
  net.pzFrz = null;
  if (w.race.phase === 'countdown') {
    // paused during the start countdown: it starts over from the top at g, so every screen gets one clean
    // 3-2-1-GO (not the resume's 3-2-1 and then the rest of the old one). The rocket-start rev restarts too.
    if (frz - net.pzOff > lead) { net.pzOff = g - lead; w.race.startCountdown(); }
    else net.pzOff += Math.max(0, g - frz);
    if (w.player && w.player._countdown) w.player._countdown.holdStart = -1;
  } else net.pzOff += Math.max(0, g - frz);
  // ghosts restart from where they froze: drop every pre-pause snapshot (nothing interpolates or extrapolates
  // across the pause), seed one at the frozen pose so the first new snapshot blends in instead of jumping
  for (const k of w.allKarts) {
    if (!k.remote) continue;
    const had = k._snaps.length > 0 && !k.departed;
    k._snaps.length = 0;
    k._lastSnapAt = nowMs;
    if (had) {
      k._snaps.push({
        t: nowMs - (k.ghostDelayMs || 0), x: k.position.x, y: k.position.y, z: k.position.z, h: k.heading || 0,
        speed: k.speed || 0, vx: k.velocity.x, vz: k.velocity.z, flags: safe('kart.netFlags', () => k.netFlags()) | 0, driftDir: k.driftDir < 0 ? -1 : 1,
      });
    }
  }
  hud.hideNetPause();
  if (net.pzCd > 0) { // our 3-2-1 ran (not during the start countdown, whose own GO comes later)
    hud.flashGo();
    audio.beep(880, 0.55, 'square', 0.24);
  }
  net.pzCd = 0;
  if (state !== 'paused') audio.setPaused(false);
}

/** While frozen: drain the controller (no queued item press fires on resume) and keep the network ticking. */
function netFrozenTick(w) {
  if (input) {
    safe('input.getInput', () => input.getInput());
    safe('input.pause', () => input.consumePressed && input.consumePressed('pause'));
  }
  netTick(w, performance.now(), PAUSED_SEND_MS);
}

function onHostChange(newHost, oldHost) {
  const s = net.session;
  const me = newHost === s.myId;
  const name = (s.players.get(newHost) || {}).name || 'Someone';
  if (!s.players.has(oldHost)) net.notice = { text: me ? 'The host left. You are the host now.' : `The host left. ${name} is now the host.`, until: performance.now() + 8000 };
  // the lobby host only runs the lobby; who runs the AI mid-race is computeAIOwner's call (synced in onPlayers)
  if (world && world.online && resultsShown && hud.resultsVisible) showOnlineResults(); // RACE AGAIN follows the host
  renderLobby();
}

/** This client now runs the AI: AI ghosts become local AI karts from their last snapshot. */
function adoptAIKarts(w) {
  for (const k of w.karts) {
    if (k.owner !== 'ai' || !k.remote) continue;
    k.makeLocal();
    w.race.adoptKart(k);
    addAIDriver(w, k);
  }
}
/** Someone else runs the AI now: hand our AI karts over as ghosts. */
function releaseAIKarts(w) {
  for (const k of w.karts) {
    if (k.owner !== 'ai' || k.remote) continue;
    k.remote = true;
    k._snaps.length = 0;
    k._lastSnapAt = 0;
    k.item = null; k.itemCount = 0; k.heldItem = null;
    k.net = { lap: k._lapCount | 0, tt: k.trackT || 0, fin: k.finished ? 1 : 0, ft: k.finishTime || 0 };
    const i = w.ais.indexOf(k._ai);
    if (i >= 0) w.ais.splice(i, 1);
    k._ai = null;
  }
}

function netTick(w, nowMs, iv = sendIntervalMs()) {
  if (nowMs - net.sendT >= iv) { net.sendT = nowMs; sendState(w, nowMs); }
  if (nowMs - net.checkT >= 250) {
    net.checkT = nowMs;
    syncAIOwner(); // the settle window after `start` ends without a presence event
    pruneDeparted(w, nowMs);
    updateResultButtons();
  }
}

function sendState(w, nowMs) {
  const r2 = (v) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
  const k = [];
  const hd = []; // per entry: item held behind the kart (online.HELD_ITEMS code; sent only when someone holds)
  let holding = false;
  const HELD = mods.online.HELD_ITEMS;
  for (const kart of w.karts) {
    if (kart.remote) continue;
    const code = kart.heldItem ? Math.max(0, HELD.indexOf(kart.heldItem)) : 0;
    if (code) holding = true;
    hd.push(code);
    const h = kart.heading || 0;
    k.push([
      kart.index, r2(kart.position.x), r2(kart.position.y), r2(kart.position.z),
      Math.round(Math.atan2(Math.sin(h), Math.cos(h)) * 1000) / 1000,
      Math.round((kart.speed || 0) * 10) / 10, r2(kart.velocity.x), r2(kart.velocity.z),
      kart.netFlags(), kart.driftDir < 0 ? -1 : 1,
      kart._lapCount | 0, Math.round((kart.trackT || 0) * 10000) / 10000,
      kart.finished ? 1 : 0, kart.finished ? r2(kart.finishTime) : 0,
    ]);
  }
  if (!k.length) return;
  const msg = { r: net.raceId, t: Math.round(nowMs), k };
  if (holding) msg.hd = hd;
  if (net.pz.n) msg.z = pzTuple();
  net.session.send('s', msg);
}

/**
 * Racers who left the room or went back to the lobby (after a short grace for reconnects / the start
 * handshake): their kart is hidden and stops colliding; an unfinished one also drops out of the standings.
 * Nothing is disposed, so a racer who reconnects gets their kart back on their next snapshot.
 */
function pruneDeparted(w, nowMs) {
  const s = net.session;
  if (!s || s.status !== 'joined') return; // we're the one offline: don't judge others
  for (const k of w.allKarts) {
    if (!k.remote || k.owner === 'ai' || k.departed) continue;
    const p = s.players.get(k.owner);
    if (p && p.st !== 'lobby') { k._goneAt = 0; continue; }
    if (!k._goneAt) { k._goneAt = nowMs; continue; }
    if (nowMs - k._goneAt < GONE_GRACE_MS) continue;
    departKart(w, k);
    if (!resultsShown && !k.finished) hud.toast('A RACER LEFT');
  }
}
function departKart(w, k) {
  k.departed = true;
  k.netIdle = true;
  k._snaps.length = 0;
  if (k.object3D) k.object3D.visible = false;
  if (!k.finished) w.race.removeKart(k); // same array as w.karts / items.karts; a finished racer keeps their result
  if (w.items && w.items.roulettes) w.items.roulettes.delete(k);
}
function restoreKart(w, k) {
  k.departed = false;
  k._goneAt = 0;
  if (k.object3D) k.object3D.visible = true;
  w.race.addKart(k);
}

function showOnlineResults() {
  const w = world;
  if (!w || !w.online) return;
  hud.showResults(w.race.computeResults(), { laps: w.race.laps, buttons: onlineResultButtons() });
  updateResultButtons();
}

/** Host's RACE AGAIN stays disabled while racers are still driving (up to RACE_WAIT_MS after results). */
function updateResultButtons() {
  if (!resultsShown || !world || !world.online) return;
  const b = hud.resultsEl && hud.resultsEl.querySelector('.res-buttons [data-act="again"]');
  if (!b) return;
  const n = driversLeft();
  const wait = n > 0 && performance.now() - net.resultsAt <= RACE_WAIT_MS;
  const label = wait ? `WAITING FOR ${n}…` : 'RACE AGAIN';
  if (b.disabled !== wait) b.disabled = wait;
  if (b.textContent !== label) b.textContent = label;
}

function onlineResultButtons() {
  const isHost = !!(net.session && net.session.isHost);
  const b = [];
  // if this client can't start after all (lost host, socket reconnecting), go to the lobby instead of
  // leaving the player on a finish camera with no buttons
  if (isHost) b.push({ act: 'again', label: 'RACE AGAIN', primary: true, onClick: () => { if (!hostStart()) goToLobby(); } });
  b.push({
    act: 'lobby', label: 'LOBBY', primary: !isHost,
    onClick: () => {
      // bring everyone along only when nobody is still driving
      if (net.session && net.session.isHost && !driversLeft()) net.session.send('lobby', { r: net.raceId });
      goToLobby();
    },
  });
  b.push({ act: 'leave', label: 'LEAVE', onClick: () => leaveOnline() });
  return b;
}

// ---------------------------------------------------------------------------------------------
// Debug / test hook
// ---------------------------------------------------------------------------------------------
window.__game = {
  get state() { return state; },
  get world() { return world; },
  get mods() { return mods; },
  audio, hud, menu, renderer, camera, bus,
  startRace: (s = {}) => startRace({ ...lastSettings, ...s }),
  goToTitle,
  skipIntro: () => beginCountdown(),
  errors: () => [...seenErrors],
  /** Put the player on its final lap just behind the line; drive on to finish. */
  toFinalLap() {
    const w = world; if (!w || !w.player) return;
    w.race.debugSetLap(w.player, w.race.laps);
    if (w.race.laps > 1) bus.emit('race:finalLap', {});
  },
  /** Instantly finish the player's race in the current place. */
  finishPlayer() {
    const w = world; if (!w || !w.player) return;
    w.race.debugSetLap(w.player, w.race.laps + 1);
    w.race._finish(w.player);
  },
  PHYSICS,
  debug,
  /** Online state for tests. */
  get online() {
    const s = net.session, w = world;
    const onlineWorld = !!(w && w.online);
    return {
      active: net.active,
      status: s ? s.status : 'idle',
      code: s ? s.code : null,
      myId: s ? s.myId : null,
      hostId: s ? s.hostId : null,
      isHost: !!(s && s.isHost),
      players: s ? s.playerList().map((p) => ({ ...p })) : [],
      phase: !net.active ? 'off' : onlineWorld ? (resultsShown ? 'results' : state) : 'lobby',
      raceId: net.raceId,
      aiOwner: net.aiOwner,
      sendMs: sendIntervalMs(),
      owned: onlineWorld ? w.karts.filter((k) => !k.remote).map((k) => k.index) : [],
      ghosts: onlineWorld ? w.karts.filter((k) => k.remote).map((k) => k.index) : [],
      idle: onlineWorld ? w.karts.filter((k) => k.remote && k.netIdle).map((k) => k.index) : [],
      departed: onlineWorld ? w.allKarts.filter((k) => k.departed).map((k) => k.index) : [],
      last: { ...net.last, recv: s ? s.lastRecv : 0, send: s ? s.lastSend : 0 },
      sent: s ? s.sentCount : 0,
      recv: s ? s.recvCount : 0,
      opts: { ...net.opts },
      menuOpen: net.menuOpen,
      pause: {
        ...net.pz, phase: pzPhase(performance.now()), left: myPausesLeft(), autoMs: net.pzAutoMs,
        clockMs: onlineWorld && net.raceId ? netElapsedMs(performance.now()) : 0,
      },
    };
  },
  onlinePause: () => netPause(),
  onlineResume: () => netResume(),
  /** Test hook: this client's auto-resume timeout in ms (default 60000). */
  setPauseAutoMs(ms) { net.pzAutoMs = ms > 0 ? ms : PAUSE_AUTO_MS; },
  onlineOpen: (code = '') => openOnline(code),
  onlineCreate(profile = {}) {
    openOnline();
    if (!net.session) return null;
    net.lobby.setProfile(profile);
    const code = mods.online.makeRoomCode();
    netJoin(code);
    return code;
  },
  onlineJoin(code, profile = {}) {
    openOnline();
    if (!net.session) return null;
    net.lobby.setProfile(profile);
    const c = mods.online.normalizeCode(code);
    netJoin(c);
    return c;
  },
  onlineStart({ laps, ai } = {}) {
    if (laps != null && mods.online.LAP_CHOICES.includes(laps)) net.opts.laps = laps;
    if (ai != null) net.opts.ai = !!ai;
    return hostStart();
  },
  onlineLeave: () => leaveOnline(),
};
