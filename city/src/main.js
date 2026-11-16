import { Config } from './core/Config.js';
import { EventBus } from './core/EventBus.js';
import { Engine } from './core/Engine.js';
import { World } from './core/World.js';
import { Input } from './core/Input.js';
import { CameraController } from './core/CameraController.js';
import { AssetLoader } from './core/AssetLoader.js';
import { installDebugAPI } from './core/DebugAPI.js';
import { MODULES } from './modules/registry.js';
import { makeRng, randomSeed } from './shared/random.js';
import { detectHardware, recommendQuality } from './shared/quality.js';

const loadingBar = document.getElementById('loading-bar');
const loadingStatus = document.getElementById('loading-status');
let menuModule = null;
const setLoading = (fraction, text) => {
  if (loadingBar) loadingBar.style.width = `${Math.round(fraction * 100)}%`;
  if (loadingStatus && text) loadingStatus.textContent = text;
  // §5b: the start screen mirrors core progress inside its own panel while modules initialise.
  try { menuModule?.setProgress?.(fraction, text); } catch (_) { /* the menu must never block boot */ }
};

/**
 * The half-size textures exist to spare phones the download and the memory. A desktop on the low
 * preset has both to spare, and sharper textures cost it nothing per frame, so it gets the full set.
 */
function shortOnMemory(hw) {
  if (!hw) return true;
  return !!hw.mobile || (hw.memoryGB != null && hw.memoryGB <= 4);
}

async function boot() {
  const canvas = document.getElementById('game');
  const config = new Config();
  let hardware = null;
  try { hardware = detectHardware(); } catch (_) { /* detection is a convenience, never a requirement */ }
  if (!config.params.has('quality') && hardware) {
    try { config.quality = recommendQuality(hardware).name; } catch (_) { /* keep the default preset */ }
  }
  // a start named in the address (?start=town) still gets its own map, unless the address names the seed too
  if (config.start && !config.seedPinned) config.seed = randomSeed();
  const events = new EventBus();
  const engine = new Engine({ canvas, config, events });
  const world = new World(config);
  const assets = new AssetLoader(engine.renderer, events);
  assets.textureSet = config.get('tex') === 'full' || config.get('tex') === 'lite'
    ? config.get('tex') : (engine.quality.name === 'low' && shortOnMemory(hardware) ? 'lite' : 'full');
  const input = new Input(canvas);
  const cameraController = new CameraController(engine.camera, input, world, canvas);

  const ctx = {
    engine,
    renderer: engine.renderer,
    scene: engine.scene,
    camera: engine.camera,
    world,
    events,
    assets,
    input,
    cameraController,
    config,
    modules: {},
    moduleStatus: {},
    uiRoot: document.getElementById('ui-root'),
  };
  const debug = installDebugAPI(ctx);

  engine.onUpdate(function coreInput(dt) {
    input.beginFrame();
    cameraController.update(dt);
  });
  engine.onAfterRender(() => input.endFrame());
  // nothing is drawn until the world is ready: the loading screen covers the canvas (Engine.renderPaused)
  engine.renderPaused = true;
  engine.start();

  // --- start screen: runs BEFORE module init so it can choose the seed the world is built from ---
  if (config.menu) {
    try {
      const menu = await import('./modules/menu/index.js');
      ctx.modules.menu = menu;
      menuModule = menu;
      document.getElementById('loading')?.classList.add('hidden');
      const choice = await menu.showStartScreen(ctx);
      if (choice) {
        if (Number.isFinite(choice.seed)) {
          config.seed = choice.seed;
          world.seed = choice.seed;
          world.rng = makeRng(choice.seed);
        }
        if (choice.cityName) world.economy.cityName = choice.cityName;
        config.demo = choice.mode === 'demo';
        config.start = choice.mode === 'village' || choice.mode === 'town' ? choice.mode : null;
        ctx.startChoice = choice;
        events.emit('game:start', choice);
      }
      document.getElementById('loading')?.classList.remove('hidden');
    } catch (err) {
      console.error('[main] start screen failed, continuing without it', err);
      ctx.moduleStatus.menu = { ok: false, error: String(err && err.stack || err) };
    }
  }

  // --- load modules in order ---
  const list = [...MODULES].sort((a, b) => a.order - b.order).filter((m) => !config.focus || config.focus.includes(m.name));
  // How the bar is shared out. Building a town or the demo city is a good part of the wait, so it
  // gets a good part of the bar; it used to be squeezed into the last few percent, where a long
  // step looked exactly like a hang.
  const builds = config.demo || config.start === 'village' || config.start === 'town';
  const moduleShare = builds ? 0.58 : 0.9;
  const buildAt = (f) => moduleShare + 0.02 + (0.955 - moduleShare) * Math.max(0, Math.min(1, f));
  let i = 0;
  for (const entry of list) {
    setLoading((i / (list.length + 1)) * moduleShare, `Loading ${entry.name}`);
    const t0 = performance.now();
    try {
      const mod = await entry.load();
      ctx.modules[entry.name] = mod;
      if (typeof mod.init === 'function') await mod.init(ctx);
      if (typeof mod.update === 'function') {
        const fn = (dt, elapsed) => mod.update(dt, elapsed);
        fn.moduleName = entry.name;
        engine.onUpdate(fn);
      }
      ctx.moduleStatus[entry.name] = { ok: true, ms: Math.round(performance.now() - t0) };
      events.emit(`module:ready:${entry.name}`, mod);
    } catch (err) {
      console.error(`[main] module "${entry.name}" failed to initialise`, err);
      ctx.moduleStatus[entry.name] = { ok: false, error: String(err && err.stack || err) };
      debug.errors.push(`module ${entry.name}: ${err && err.message}`);
    }
    i++;
  }
  events.emit('modules:ready');

  // --- module showcases (?showcase=roads,props) ---
  if (config.showcase) {
    const showcases = {
      './modules/audio/showcase.js': () => import('./modules/audio/showcase.js'),
      './modules/buildings/showcase.js': () => import('./modules/buildings/showcase.js'),
      './modules/effects/showcase.js': () => import('./modules/effects/showcase.js'),
      './modules/environment/showcase.js': () => import('./modules/environment/showcase.js'),
      './modules/menu/showcase.js': () => import('./modules/menu/showcase.js'),
      './modules/props/showcase.js': () => import('./modules/props/showcase.js'),
      './modules/roads/showcase.js': () => import('./modules/roads/showcase.js'),
      './modules/simulation/showcase.js': () => import('./modules/simulation/showcase.js'),
      './modules/terrain/showcase.js': () => import('./modules/terrain/showcase.js'),
      './modules/tools/showcase.js': () => import('./modules/tools/showcase.js'),
      './modules/traffic/showcase.js': () => import('./modules/traffic/showcase.js'),
      './modules/ui/showcase.js': () => import('./modules/ui/showcase.js'),
      './modules/zoning/showcase.js': () => import('./modules/zoning/showcase.js'),
    };
    for (const name of config.showcase) {
      const key = `./modules/${name}/showcase.js`;
      setLoading(0.91, `Showcase ${name}`);
      try {
        if (!showcases[key]) throw new Error(`no showcase.js for module "${name}"`);
        const mod = await showcases[key]();
        await mod.showcase(ctx);
        ctx.moduleStatus[`showcase:${name}`] = { ok: true };
      } catch (err) {
        console.error(`[main] showcase "${name}" failed`, err);
        ctx.moduleStatus[`showcase:${name}`] = { ok: false, error: String(err && err.stack || err) };
        debug.errors.push(`showcase ${name}: ${err && err.message}`);
      }
    }
  }

  // --- demo city ---
  if (config.demo) {
    setLoading(buildAt(0), 'Building city');
    try {
      const { buildDemoCity } = await import('./demo/DemoCity.js');
      await buildDemoCity(ctx, (f, text) => setLoading(buildAt(f), text));
      ctx.moduleStatus.demo = { ok: true };
    } catch (err) {
      console.error('[main] demo city failed', err);
      ctx.moduleStatus.demo = { ok: false, error: String(err && err.stack || err) };
      debug.errors.push(`demo: ${err && err.message}`);
    }
  }

  // --- starter city: a small town already standing (demo/StarterTown.js) ---
  let starter = null;
  if (!config.demo && (config.start === 'village' || config.start === 'town')) {
    setLoading(buildAt(0), 'Raising the town');
    try {
      const { buildStarter } = await import('./demo/StarterTown.js');
      starter = await buildStarter(ctx, config.start, (f, text) => setLoading(buildAt(f), text));
      ctx.moduleStatus.starter = starter ? { ok: true } : { ok: false, error: 'no town was built' };
    } catch (err) {
      console.error('[main] starter city failed', err);
      ctx.moduleStatus.starter = { ok: false, error: String(err && err.stack || err) };
      debug.errors.push(`starter: ${err && err.message}`);
    }
  }

  // An empty world has no city to look at. Map origin is wherever the heightmap put it — often a
  // slope or open water — so search for the flattest dry patch and open the camera over that.
  if (!config.demo && !config.showcase) {
    // a starter town is where the camera opens; bare land opens over the flattest dry patch
    const spot = starter || findBuildableStart(world);
    if (spot) {
      debug.presets.newcity = { target: { x: spot.x, z: spot.z }, distance: starter ? starter.radius : 380, yaw: 0.6, pitch: 0.62 };
      config.cam = 'newcity';
      if (config.debug) console.log('[main] new-city start', spot);
    }
  }
  debug.setCamera(config.cam, true) || debug.setCamera('city', true);
  // every program the first frame needs, compiled off the main thread while the bar still moves
  setLoading(0.985, 'Warming up the graphics');
  const tWarm = performance.now();
  const warmed = await engine.warmUp();
  // `ok` stays true either way: a warm-up that timed out only means the first frame compiles the rest
  ctx.moduleStatus.warmUp = { ok: true, finished: warmed, ms: Math.round(performance.now() - tWarm) };
  engine.renderPaused = false;
  setLoading(1, 'Ready');
  await debug.waitStable(2);
  document.getElementById('loading')?.classList.add('hidden');
  debug.ready = true;
  events.emit('game:ready');
  if (config.debug) console.log('[main] ready', debug.stats());
}

/**
 * Pick where a brand-new city opens: score a coarse grid on how much of the surrounding 200 m is dry
 * and gently sloped, and take the best. Deterministic — same seed, same starting view.
 */
function findBuildableStart(world) {
  const t = world.terrain;
  if (!t || !t.ready || typeof t.getHeight !== 'function') return null;
  const R = world.half * 0.62;      // stay away from the map edge
  const STEP = 120;                 // candidate spacing
  const PROBE = 40;                 // sample spacing inside a candidate
  let best = null;
  for (let cz = -R; cz <= R; cz += STEP) {
    for (let cx = -R; cx <= R; cx += STEP) {
      let dry = 0, total = 0, maxDrop = 0;
      const h0 = t.getHeight(cx, cz);
      if (t.isWater && t.isWater(cx, cz)) continue;
      for (let dz = -200; dz <= 200; dz += PROBE) {
        for (let dx = -200; dx <= 200; dx += PROBE) {
          const x = cx + dx, z = cz + dz;
          total++;
          if (t.isWater && t.isWater(x, z)) continue;
          dry++;
          maxDrop = Math.max(maxDrop, Math.abs(t.getHeight(x, z) - h0));
        }
      }
      if (!total) continue;
      const dryness = dry / total;
      if (dryness < 0.85) continue;                    // a buildable start is not a lakeside sliver
      const flatness = 1 / (1 + maxDrop / 12);         // 12 m of relief across 400 m is already rolling
      const centreBias = 1 - Math.hypot(cx, cz) / (R * 1.6);
      const score = dryness * 0.45 + flatness * 0.45 + centreBias * 0.10;
      if (!best || score > best.score) best = { x: cx, z: cz, score, dryness, maxDrop: +maxDrop.toFixed(1) };
    }
  }
  return best;
}

boot().catch((err) => {
  console.error('[main] fatal', err);
  const el = document.getElementById('loading-status');
  if (el) el.textContent = 'Failed to start: ' + (err && err.message);
});
