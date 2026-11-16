/**
 * A city as data: taking a snapshot of the running game, and standing a snapshot back up.
 *
 * A snapshot holds the things a player made and the state the simulation was in, and nothing
 * that can be derived again. In the order they are restored:
 *
 *   terrain    every heightmap sample that differs from the generated ground   (terrain/edits.js)
 *   roads      nodes, exact curves and each road's own height profile          (RoadNetwork.exportState)
 *   zones      the paint, per world cell                                        (ZoneGrid.exportPaint)
 *   sim        service buildings, the books, residents, milestones, the clock  (simulation.exportState)
 *   buildings  one row per building, tied to its plot by the plot's key         (buildings.exportState)
 *
 * Plots are not stored. They are worked out from roads, paint and ground, and with those three
 * back exactly they come out the same, so every building finds its plot again.
 *
 * Loading never reshapes the ground. The saved ground already has every road corridor, plot and
 * pad in it; cutting them a second time would move the blends a little on each load.
 */
import { bytesToBase64, base64ToBytes } from './codec.js';

export const SNAPSHOT_VERSION = 1;

/** Resolves after `n` engine frames, so each restored layer has been seen by the modules that follow it. */
function frames(ctx, n) {
  const engine = ctx.engine;
  return new Promise((resolve) => {
    const start = engine.frame;
    const step = () => (engine.frame - start >= n ? resolve() : requestAnimationFrame(step));
    step();
  });
}

/** What a list of cities shows without opening the save. */
export function summarise(world) {
  const e = world.economy || {};
  return {
    population: Math.round(e.population || 0),
    money: Math.round(e.money || 0),
    happiness: Math.round((e.happiness || 0) * 100),
    buildings: (world.buildings.list || []).length,
    roads: world.roads.segments ? world.roads.segments.size : 0,
    day: world.time ? world.time.totalDays || 0 : 0,
  };
}

/** Snapshot of the running game. Synchronous: nothing may change between its parts. */
export function captureCity(ctx, meta = {}) {
  const { world } = ctx;
  const sim = ctx.modules.simulation && ctx.modules.simulation.api;
  const tapi = world.terrain && world.terrain.api;
  const edits = tapi && typeof tapi.exportEdits === 'function' ? tapi.exportEdits() : null;
  const cc = ctx.cameraController;
  let camera = null;
  try {
    const v = cc && typeof cc.getView === 'function' ? cc.getView() : null;
    if (v && v.target) camera = { target: { x: Math.round(v.target.x), z: Math.round(v.target.z) }, distance: Math.round(v.distance), yaw: +v.yaw.toFixed(3), pitch: +v.pitch.toFixed(3) };
  } catch (_) { /* a camera is a nicety */ }
  return {
    app: 'bdb-city', v: SNAPSHOT_VERSION,
    savedAt: new Date().toISOString(),
    seed: world.seed, size: world.size,
    name: (world.economy && world.economy.cityName) || 'New city',
    start: meta.start || null,
    summary: summarise(world),
    terrain: edits && edits.count ? bytesToBase64(edits.bytes) : null,
    roads: world.roads.api.exportState(),
    zones: world.zones.api.exportPaint(),
    sim: sim ? sim.exportState() : null,
    buildings: world.buildings.api.exportState(),
    weather: world.env ? world.env.weather || null : null,
    camera,
  };
}

/** Is this object something restoreCity can work with? → null, or a plain reason why not. */
export function whyNotLoadable(snap, world) {
  if (!snap || typeof snap !== 'object') return 'the file is not a saved city';
  if (snap.app !== 'bdb-city') return 'the file is not a BDB City save';
  if (!(snap.v >= 1) || snap.v > SNAPSHOT_VERSION) return 'the save was made by a newer version of the game';
  if (!Number.isFinite(snap.seed)) return 'the save has no map seed';
  if (world && Number.isFinite(snap.size) && snap.size !== world.size) return 'the save is for a different map size';
  if (!snap.roads || !Array.isArray(snap.roads.segs)) return 'the save has no roads in it';
  return null;
}

/**
 * Stand a snapshot up in a freshly booted, empty world generated from the snapshot's seed.
 * `report(fraction, text)` drives the loading bar.
 * → what came back: `{ edits, roads, zoned, lots, services, buildings, missing }`.
 */
export async function restoreCity(ctx, snap, report = () => {}) {
  const { world, events } = ctx;
  const out = { edits: 0, roads: 0, zoned: 0, lots: 0, services: 0, buildings: 0, missing: 0 };
  const say = (f, text) => { try { report(f, text); } catch (_) { /* progress is cosmetic */ } };
  const sim = ctx.modules.simulation && ctx.modules.simulation.api;
  const unmute = events.mute ? events.mute('notification') : () => {};
  const speed0 = world.time.speed, paused0 = world.time.paused;
  world.time.speed = 0; world.time.paused = true;
  events.emit('time:speed', 0);
  // a save made before the ground was stored (a rescued city) lets roads, pads and plots cut their own
  const groundIsFinal = typeof snap.terrain === 'string' && snap.terrain.length > 0;
  try {
    say(0.04, 'Shaping the land');
    const tapi = world.terrain && world.terrain.api;
    if (groundIsFinal && tapi && typeof tapi.importEdits === 'function') out.edits = tapi.importEdits(base64ToBytes(snap.terrain));
    await frames(ctx, 1);

    say(0.18, 'Laying the streets');
    out.roads = world.roads.api.importState(snap.roads, { conform: !groundIsFinal }).segments;
    await frames(ctx, 2);

    say(0.38, 'Zoning the blocks');
    out.zoned = world.zones.api.importPaint(snap.zones);
    await frames(ctx, 1);

    say(0.5, 'Switching on the services');
    if (sim && snap.sim) out.services = sim.restoreServices(snap.sim.services, groundIsFinal);
    await frames(ctx, 1);

    say(0.6, 'Raising the buildings');
    const lots = world.zones.api.lotsFor();
    out.lots = lots.length;
    const b = world.buildings.api.restoreState({ ...snap.buildings, groundIsFinal }, lots);
    out.buildings = b.restored;
    out.missing = b.missing;
    await frames(ctx, 1);

    say(0.86, 'Bringing everyone home');
    if (sim && snap.sim) sim.importState(snap.sim, b.ids);
    if (snap.name) { world.economy.cityName = snap.name; events.emit('city:renamed', snap.name); }
    try {
      world.props.api?.refresh?.();
      const people = snap.summary ? snap.summary.population || 0 : 0;
      world.traffic.api?.spawnBurst?.(Math.max(8, Math.min(420, Math.round(people / 28))));
    } catch (err) { console.error('[save] traffic failed', err); }
    await frames(ctx, 2);
    say(1, 'Opening the gates');
  } finally {
    world.time.speed = speed0; world.time.paused = paused0;
    events.emit('time:speed', speed0);
    unmute();
  }
  return out;
}

/**
 * A rescue file (src/rescue.js, written out of a tab of the first public build) → a snapshot.
 * That build stored no ground and no road profiles, so a rescued city is rebuilt the way it was
 * first built: roads cut their corridors, pads and plots level themselves. Close, not exact.
 */
export function fromRescue(doc) {
  if (!doc || doc.format !== 'bdb-city-rescue') return null;
  const bases = [], segs = [];
  for (const s of doc.segments || []) {
    const b = s.base || {};
    const flat = (...vs) => { const out = []; for (const v of vs) if (Array.isArray(v)) out.push(v[0], v[2]); return out; };
    let row;
    if (Array.isArray(b.points) && b.points.length >= 3) row = ['R', ...flat(...b.points)];
    else if (b.v3 && b.v0) row = ['C', ...flat(b.v0, b.v1, b.v2, b.v3)];
    else if (b.v0 && b.v2) row = ['Q', ...flat(b.v0, b.v1, b.v2)];
    else if (b.v1 && b.v2) row = ['L', ...flat(b.v1, b.v2)];
    else if (Array.isArray(s.path) && s.path.length >= 2) { const p = s.path; row = ['L', p[0][0], p[0][1], p[p.length - 1][0], p[p.length - 1][1]]; s.u0 = 0; s.u1 = 1; }
    else continue;
    bases.push(row);
    segs.push([s.id, s.a, s.b, s.type, bases.length - 1, Number.isFinite(s.u0) ? s.u0 : 0, Number.isFinite(s.u1) ? s.u1 : 1, null]);
  }
  const ids = [null];
  const cells = [];
  for (const [cx, cz, type] of doc.zones || []) {
    let ti = ids.indexOf(type);
    if (ti < 0) { ti = ids.length; ids.push(type); }
    cells.push(cx, cz, ti);
  }
  const keyOfLot = new Map();
  for (const l of doc.lots || []) if (l && l.id) keyOfLot.set(l.id, l.key || null);
  const list = [];
  let nextId = 1;
  for (const b of doc.buildings || []) {
    if (!b || b.state === 'removed') continue;
    list.push([b.id, keyOfLot.get(b.lotId) || null, b.type, b.level || 1, b.seed, b.state === 'construction' ? 0 : 1, b.progress == null ? 1 : b.progress, b.age || 0, b.builtAt, b.x, b.z]);
    if (b.id >= nextId) nextId = b.id + 1;
  }
  const e = doc.economy || {};
  return {
    app: 'bdb-city', v: SNAPSHOT_VERSION, rescued: true,
    savedAt: doc.savedAt || new Date().toISOString(),
    seed: doc.seed, size: doc.size,
    name: doc.name || e.cityName || 'Rescued city',
    start: doc.start || null,
    summary: { population: Math.round(e.population || 0), money: Math.round(e.money || 0), happiness: Math.round((e.happiness || 0) * 100), buildings: list.length, roads: segs.length, day: doc.time ? doc.time.totalDays || 0 : 0 },
    terrain: null,
    roads: { nodes: (doc.nodes || []).map((n) => [n[0], n[1], n[2], null]), bases, segs },
    zones: { ids, cells },
    sim: {
      world: e,
      // nobody is recorded as living anywhere in a rescue file: residents move back in over the first game days
      economy: null,
      milestones: null,
      time: doc.time || null,
      services: (doc.services || []).map((s) => [s.type, s.x, s.z, s.yaw || 0, s.name, s.builtDay || 0, s.efficiency == null ? 1 : s.efficiency]),
    },
    buildings: { list, nextId },
    weather: doc.weather || null,
    camera: doc.camera || null,
  };
}
