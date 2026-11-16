/**
 * Starter cities — a small place that is already standing when a new game begins, so a new mayor
 * does not have to start from bare land. Like the demo city it uses ONLY the public module APIs
 * (terrain / roads / zones / services / buildings / simulation), but it is deliberately modest:
 * a few blocks with the basics switched on, and most of the map left empty to grow into.
 *
 *   buildStarter(ctx, 'village' | 'town') → { x, z, radius, population, lots } | null
 *
 * Deterministic for a given seed: the same seed and the same starter always give the same town.
 * A new game gets a fresh random seed (see modules/menu), so in practice no two starts are alike.
 *
 * The town is laid out in a LOCAL FRAME (u, v) in metres, centred on the site and turned to
 * whichever heading suits the ground best; `L(u, v)` maps it to world XZ. Blocks are addressed
 * by (i, j) = (column, row), counted from the low-u, low-v corner.
 */

const DT = 88;      // block pitch. Same as the demo city: every frontage gets full-depth lots.
const STUB = 108;   // an avenue runs this far past the last block: an obvious road to carry on from
const SIDE = 300;   // strip beside the grid (high-u side) kept clear for the utilities

/**
 * What each starter is made of.
 *   avenueRows / avenueCols  which grid LINES are avenues (line k sits between block k-1 and block k)
 *   blocks   "i,j" → zone type, or 'park' (left green), or a service id (a civic block)
 *            anything not listed is low-density housing
 *   utilities  set down beside the grid, on the industry side
 *   growDays / weeks / passes  how long the place is aged before the player gets it
 *   people / maxLevel  homes are raised a level at a time (never past maxLevel) until the town can
 *            house about this many, so every seed hands over a place of roughly the same size
 *   money    the least the treasury starts with
 */
export const STARTERS = {
  village: {
    title: 'Village',
    cols: 3, rows: 2,
    avenueRows: [1], avenueCols: [],
    blocks: { '1,0': 'com-low', '1,1': 'res-high', '2,0': 'ind' },
    // the four utilities are on; police, fire, a clinic and a school are the new mayor's first jobs
    utilities: ['power', 'water', 'sewage', 'garbage'],
    growDays: 240, weeks: 12, passes: 2,
    people: 450, maxLevel: 3,
    money: 250000,
    camera: 520,
  },
  town: {
    title: 'Town',
    cols: 6, rows: 4,
    avenueRows: [2], avenueCols: [3],
    blocks: {
      '2,1': 'com-high', '3,2': 'com-high', '3,1': 'com-low', '2,2': 'com-low',
      '1,1': 'res-high', '1,2': 'res-high', '2,0': 'res-high', '3,0': 'res-high', '2,3': 'res-high', '3,3': 'res-high',
      '5,1': 'ind', '5,2': 'ind',
      '0,1': 'park',
      '1,0': 'education', '4,1': 'police', '4,2': 'fire', '4,0': 'health',
    },
    utilities: ['power', 'water', 'sewage', 'garbage'],
    growDays: 340, weeks: 17, passes: 2,
    people: 3500, maxLevel: 4,
    money: 400000,
    camera: 780,
  },
};

const ZONES = new Set(['res-low', 'res-high', 'com-low', 'com-high', 'ind', 'office']);

export async function buildStarter(ctx, kind) {
  const plan = STARTERS[kind];
  const { world, events } = ctx;
  const roads = world.roads && world.roads.api;
  const terrain = world.terrain;
  if (!plan || !roads || typeof roads.build !== 'function' || !terrain || typeof terrain.getHeight !== 'function') {
    console.warn(`[starter] cannot build "${kind}": roads or terrain not ready`);
    return null;
  }
  const t0 = performance.now();
  // months of history are about to be fabricated in a moment: keep its toasts off the screen, and
  // hold the clock so the result depends on the seed and not on how fast this machine is
  const unmute = events.mute ? events.mute('notification') : () => {};
  const speed0 = world.time.speed, paused0 = world.time.paused;
  world.time.speed = 0; world.time.paused = true;
  events.emit('time:speed', 0);

  const rng = world.rng.fork(0x57a27e2 + kind.length);
  const { cols, rows } = plan;
  const U0 = -cols * DT / 2, U1 = cols * DT / 2, V0 = -rows * DT / 2, V1 = rows * DT / 2;

  // ------------------------------------------------------------------ 1. site + local frame
  const site = pickSite(world, terrain, rng, { u0: U0 - STUB, u1: U1 + SIDE, v0: V0 - STUB, v1: V1 + STUB });
  const { cx, cz, ux, uz, vx, vz } = site;
  const L = (u, v) => ({ x: cx + ux * u + vx * v, z: cz + uz * u + vz * v });
  const toLocal = (x, z) => { const dx = x - cx, dz = z - cz; return { u: dx * ux + dz * uz, v: dx * vx + dz * vz }; };
  const dry = (p) => world.inBounds(p.x, p.z) && !(terrain.isWater && terrain.isWater(p.x, p.z));

  // ------------------------------------------------------------------ 2. streets
  /** A straight street between two local points, cut back to its longest run of dry, in-bounds ground. */
  const street = (a, b, type) => {
    const len = Math.hypot(b.u - a.u, b.v - a.v), n = Math.max(2, Math.ceil(len / 16));
    let best = null, start = -1;
    for (let k = 0; k <= n + 1; k++) {
      const ok = k <= n && dry(L(a.u + (b.u - a.u) * k / n, a.v + (b.v - a.v) * k / n));
      if (ok) { if (start < 0) start = k; continue; }
      if (start >= 0 && (!best || k - 1 - start > best[1] - best[0])) best = [start, k - 1];
      start = -1;
    }
    if (!best || best[1] - best[0] < 4) return false;          // under ~64 m of usable ground: not a street
    const at = (k) => L(a.u + (b.u - a.u) * k / n, a.v + (b.v - a.v) * k / n);
    try { roads.build([at(best[0]), at(Math.round((best[0] + best[1]) / 2)), at(best[1])], type); return true; }
    catch (err) { console.error('[starter] road build failed', err); return false; }
  };
  let streets = 0;
  for (let k = 0; k <= rows; k++) {
    const v = V0 + k * DT, avenue = plan.avenueRows.includes(k), pad = avenue ? STUB : 0;
    if (street({ u: U0 - pad, v }, { u: U1 + pad, v }, avenue ? 'avenue' : 'local')) streets++;
  }
  for (let k = 0; k <= cols; k++) {
    const u = U0 + k * DT, avenue = plan.avenueCols.includes(k), pad = avenue ? STUB : 0;
    if (street({ u, v: V0 - pad }, { u, v: V1 + pad }, avenue ? 'avenue' : 'local')) streets++;
  }
  await frames(ctx, 3);

  // ------------------------------------------------------------------ 3. zoning
  const blockOf = (u, v) => {
    const i = Math.floor((u - U0) / DT), j = Math.floor((v - V0) / DT);
    return i >= 0 && i < cols && j >= 0 && j < rows ? `${i},${j}` : null;
  };
  const zones = world.zones && world.zones.api;
  if (zones && typeof zones.cellsInRect === 'function') {
    try {
      const corners = [L(U0 - 40, V0 - 40), L(U1 + 40, V0 - 40), L(U0 - 40, V1 + 40), L(U1 + 40, V1 + 40)];
      const xs = corners.map((p) => p.x), zs = corners.map((p) => p.z);
      const buckets = new Map(), seen = new Set();
      for (const c of zones.cellsInRect(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs))) {
        const key = c.cz * 65536 + c.cx;
        if (seen.has(key)) continue;
        seen.add(key);
        const p = world.cellCenter(c.cx, c.cz);
        const real = typeof zones.cellAt === 'function' ? zones.cellAt(p.x, p.z) : null;
        const l = toLocal(real ? real.x : p.x, real ? real.z : p.z);
        const block = blockOf(l.u, l.v);
        if (!block) continue;                                   // the frontage of an avenue stub stays the player's to zone
        const use = plan.blocks[block] || 'res-low';
        if (!ZONES.has(use)) continue;                          // park or civic block: left unzoned
        let list = buckets.get(use);
        if (!list) buckets.set(use, (list = []));
        list.push({ cx: c.cx, cz: c.cz });
      }
      for (const [type, cells] of buckets) zones.paint(cells, type);
      await frames(ctx, 2);
    } catch (err) { console.error('[starter] zoning failed', err); }
  }
  const lots = (world.zones && world.zones.lots || []).length;

  // ------------------------------------------------------------------ 4. services
  const svc = world.services && world.services.api;
  /** Try a spot, then a small deterministic spiral around it, so a service always finds a free site. */
  const place = (type, u, v, spread) => {
    if (!svc || typeof svc.place !== 'function') return false;
    for (let k = 0; k <= 22; k++) {
      const a = k * 2.399963, r = spread * Math.sqrt(k / 22);
      const p = L(u + Math.cos(a) * r, v + Math.sin(a) * r);
      if (dry(p) && svc.place(type, p.x, p.z, { free: true, silent: true })) return true;
    }
    return false;
  };
  let placed = 0;
  try {
    for (const [block, use] of Object.entries(plan.blocks)) {
      if (ZONES.has(use) || use === 'park') continue;
      const [i, j] = block.split(',').map(Number);
      if (place(use, U0 + (i + 0.5) * DT, V0 + (j + 0.5) * DT, 20)) placed++;
    }
    // utilities stand beside the grid on the industry side, well clear of the housing
    plan.utilities.forEach((type, n) => {
      const col = Math.floor(n / 2), side = n % 2 ? 1 : -1;
      if (place(type, U1 + 96 + col * 112, side * 76, 44)) placed++;
    });
    await frames(ctx, 2);
  } catch (err) { console.error('[starter] services failed', err); }

  // ------------------------------------------------------------------ 5. grow and move people in
  const buildings = world.buildings && world.buildings.api;
  const sim = ctx.modules.simulation && ctx.modules.simulation.api;
  const day = 60 * 60 * 24;
  try {
    if (lots && buildings && typeof buildings.fastForward === 'function') {
      buildings.fastForward(day * plan.growDays);
      await frames(ctx, 1);
    }
    if (sim && typeof sim.fastForward === 'function') {
      // ageing the town walks the calendar forward; put the date back so a new game starts on day one
      const date0 = {
        hour: world.time.hour, minute: world.time.minute, day: world.time.day, weekday: world.time.weekday,
        month: world.time.month, year: world.time.year, totalDays: world.time.totalDays,
      };
      // Homes first, then people: occupancy converges on capacity, so raising levels after the
      // fast-forward would buy height and no residents. Smallest homes are raised first, which keeps
      // the place low and even instead of growing one tower.
      const homes = () => world.buildings.list.filter((b) => b.type === 'res-low' || b.type === 'res-high');
      const room = () => homes().reduce((n, b) => n + (b.residents || 0), 0);
      if (typeof buildings?.setLevel === 'function') {
        for (let level = 2; level <= plan.maxLevel && room() < plan.people; level++) {
          for (const b of homes().filter((h) => h.level < level).sort((a, c) => (a.residents || 0) - (c.residents || 0) || a.id - c.id)) {
            if (room() >= plan.people) break;
            buildings.setLevel(b.id, level);
          }
        }
      }
      for (let pass = 0; pass < plan.passes; pass++) {
        sim.fastForward(day * 7 * plan.weeks);
        await frames(ctx, 1);
        buildings?.fastForward?.(day * 120);                    // demand has moved on: let lots catch up
        await frames(ctx, 1);
      }
      Object.assign(world.time, date0);
      events.emit('time:set', date0.hour);
    }
    // a starter is a head start, not a debt: never hand over less than a fresh city's treasury
    if (Number.isFinite(world.economy.money)) world.economy.money = Math.max(world.economy.money, plan.money);
  } catch (err) { console.error('[starter] growing the town failed', err); }

  try { world.props.api?.refresh?.(); world.traffic.api?.spawnBurst?.(kind === 'town' ? 90 : 30); } catch (err) { console.error('[starter] traffic failed', err); }
  await frames(ctx, 2);

  world.time.speed = speed0; world.time.paused = paused0;
  events.emit('time:speed', speed0);
  unmute();

  const result = {
    kind, x: cx, z: cz, radius: plan.camera, yaw: site.yaw,
    streets, lots, services: placed, buildings: (world.buildings && world.buildings.list || []).length,
    homesFor: Math.round((world.buildings && world.buildings.list || []).reduce((n, b) => n + ((b.type === 'res-low' || b.type === 'res-high') ? (b.residents || 0) : 0), 0)),
    population: world.economy.population, ms: Math.round(performance.now() - t0),
  };
  world.starter = result;
  if (ctx.config.debug) console.log('[starter]', result);
  return result;
}

/** Resolves after `n` rendered frames, so each phase's meshes exist before the next one reads them. */
function frames(ctx, n) {
  const engine = ctx.engine;
  return new Promise((resolve) => {
    const start = engine.frame;
    const step = () => (engine.frame - start >= n ? resolve() : requestAnimationFrame(step));
    step();
  });
}

/**
 * Find where the town goes: the driest, flattest stretch that holds the whole footprint, looking at
 * four headings per candidate (a quarter-turn apart from a seeded start), with a mild pull toward
 * the middle of the map. `box` is the footprint in the local frame, streets, stubs and utilities
 * included. Always returns a site; on a map with no good one it returns the least bad.
 */
function pickSite(world, terrain, rng, box) {
  const reach = Math.hypot(Math.max(-box.u0, box.u1), Math.max(-box.v0, box.v1));
  const limit = Math.max(0, world.half - reach - 40);
  const yaw0 = rng.range(0, Math.PI / 2);
  const STEP = 96, PROBE = 44;
  let best = null;
  for (let z = -limit; z <= limit; z += STEP) {
    for (let x = -limit; x <= limit; x += STEP) {
      for (let q = 0; q < 4; q++) {
        const yaw = yaw0 + q * Math.PI / 2;
        const ux = Math.cos(yaw), uz = Math.sin(yaw), vx = -uz, vz = ux;
        let dry = 0, total = 0, lo = Infinity, hi = -Infinity;
        for (let v = box.v0; v <= box.v1; v += PROBE) {
          for (let u = box.u0; u <= box.u1; u += PROBE) {
            const px = x + ux * u + vx * v, pz = z + uz * u + vz * v;
            total++;
            if (!world.inBounds(px, pz) || (terrain.isWater && terrain.isWater(px, pz))) continue;
            dry++;
            const h = terrain.getHeight(px, pz);
            if (h < lo) lo = h;
            if (h > hi) hi = h;
          }
        }
        const dryness = total ? dry / total : 0;
        const flatness = dry ? 1 / (1 + (hi - lo) / 24) : 0;     // 24 m of relief across the town halves the score
        const centre = limit ? 1 - Math.hypot(x, z) / (limit * 1.5) : 1;
        // water inside the footprint costs streets and blocks outright, so dryness dominates
        const score = dryness * dryness * 0.62 + flatness * 0.3 + centre * 0.08;
        if (!best || score > best.score) best = { cx: x, cz: z, yaw, ux, uz, vx, vz, score, dryness, relief: dry ? hi - lo : 0 };
      }
    }
  }
  return best || { cx: 0, cz: 0, yaw: 0, ux: 1, uz: 0, vx: 0, vz: 1, score: 0, dryness: 0, relief: 0 };
}
