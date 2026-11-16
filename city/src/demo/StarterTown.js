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

import { sliced } from './pace.js';

const DT = 88;      // block pitch. Same as the demo city: every frontage gets full-depth lots.
const STUB = 108;   // an avenue runs up to this far past the last block: an obvious road to carry on from
const SIDE = 260;   // strip beside the grid (high-u side) kept clear for the utilities
const MAX_STEP = 2.6;   // most one block may stand above or below its neighbour, in metres (a 3% street)

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

export async function buildStarter(ctx, kind, report = () => {}) {
  const plan = STARTERS[kind];
  const { world, events } = ctx;
  const roads = world.roads && world.roads.api;
  const terrain = world.terrain;
  if (!plan || !roads || typeof roads.build !== 'function' || !terrain || typeof terrain.getHeight !== 'function') {
    console.warn(`[starter] cannot build "${kind}": roads or terrain not ready`);
    return null;
  }
  const t0 = performance.now();
  const timing = {};
  let tMark = t0;
  const mark = (name) => { const now = performance.now(); timing[name] = Math.round(now - tMark); tMark = now; };
  /** Tell the loading screen where we are, and let the page breathe so it can show it. */
  const stage = async (fraction, text) => { try { report(fraction, text); } catch (_) { /* cosmetic */ } await frames(ctx, 1); };
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
  await stage(0.02, 'Finding level ground');
  const site = pickSite(world, terrain, rng, { u0: U0 - STUB, u1: U1 + SIDE, v0: V0 - STUB, v1: V1 + STUB }, { u0: U0, u1: U1, v0: V0, v1: V1, cols, rows });
  const { cx, cz, ux, uz, vx, vz } = site;
  const L = (u, v) => ({ x: cx + ux * u + vx * v, z: cz + uz * u + vz * v });
  const toLocal = (x, z) => { const dx = x - cx, dz = z - cz; return { u: dx * ux + dz * uz, v: dx * vx + dz * vz }; };
  const dry = (p) => world.inBounds(p.x, p.z) && !(terrain.isWater && terrain.isWater(p.x, p.z));

  mark('site');

  // ------------------------------------------------------------------ 1b. level the blocks
  // A town dropped on raw ground has streets climbing straight over whatever is there: on a hilly
  // map that meant 25% grades, cuttings, and grass lying over the carriageway. Like the demo city,
  // each block is levelled to a smoothed version of its own height BEFORE any road is built, so the
  // blocks are flat terraces and the streets between them are gentle ramps. Neighbouring blocks are
  // never allowed to differ by more than MAX_STEP.
  await stage(0.06, 'Levelling the ground');
  const tapi = terrain.api;
  let graded = 0, steepest = 0;
  if (tapi && typeof tapi.conformPath === 'function') {
    try {
      const H = new Float64Array(cols * rows);
      const wl = terrain.waterLevel != null ? terrain.waterLevel : -Infinity;
      // which grid corners stand in water BEFORE anything is moved: a street line is never graded out into the sea
      const wetCorner = new Uint8Array((cols + 1) * (rows + 1));
      for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) wetCorner[i * (rows + 1) + j] = dry(L(U0 + i * DT, V0 + j * DT)) ? 0 : 1;
      const at = (i, j) => H[i * rows + j];
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const hs = [];
          for (let a = 0; a <= 2; a++) for (let b = 0; b <= 2; b++) {
            const p = L(U0 + (i + a / 2) * DT, V0 + (j + b / 2) * DT);
            if (world.inBounds(p.x, p.z)) hs.push(terrain.getHeight(p.x, p.z));
          }
          hs.sort((x, y) => x - y);
          H[i * rows + j] = Math.max(hs.length ? hs[hs.length >> 1] : wl + 2, wl + 1.6);
        }
      }
      const worstStep = () => {
        let w = 0;
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          if (i + 1 < cols) w = Math.max(w, Math.abs(at(i, j) - at(i + 1, j)));
          if (j + 1 < rows) w = Math.max(w, Math.abs(at(i, j) - at(i, j + 1)));
        }
        return w;
      };
      // smooth until no two neighbours differ by more than MAX_STEP (two passes at least, as the demo does)
      for (let pass = 0; pass < 40 && (pass < 2 || worstStep() > MAX_STEP); pass++) {
        const src = H.slice();
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          let sum = 0, w = 0;
          for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
            const ii = i + di, jj = j + dj;
            if (ii < 0 || ii >= cols || jj < 0 || jj >= rows) continue;
            const k = di === 0 && dj === 0 ? 3 : 1;
            sum += src[ii * rows + jj] * k; w += k;
          }
          H[i * rows + j] = Math.max(sum / w, wl + 1.6);
        }
      }
      steepest = worstStep();
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const vc = V0 + (j + 0.5) * DT;
        const a = L(U0 + i * DT + 10, vc), b = L(U0 + (i + 1) * DT - 10, vc);
        if (!dry(a) && !dry(b)) continue;
        const y = at(i, j);
        tapi.conformPath([{ x: a.x, y, z: a.z }, { x: b.x, y, z: b.z }], DT - 30, 20);
        graded++;
      }
      // Then every street line, the outer ones included, as a straight ramp between its two corners.
      // A corner stands at the mean of the blocks that touch it. Without this an outer street sits in
      // the blend between its terrace and the raw hillside beyond, and follows the hillside.
      const cornerH = (i, j) => {
        let sum = 0, n = 0;
        for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) if (a >= 0 && a < cols && b >= 0 && b < rows) { sum += at(a, b); n++; }
        return sum / n;
      };
      const ramp = (i0, j0, i1, j1) => {
        if (wetCorner[i0 * (rows + 1) + j0] || wetCorner[i1 * (rows + 1) + j1]) return;
        const a = L(U0 + i0 * DT, V0 + j0 * DT), b = L(U0 + i1 * DT, V0 + j1 * DT);
        tapi.conformPath([{ x: a.x, y: cornerH(i0, j0), z: a.z }, { x: b.x, y: cornerH(i1, j1), z: b.z }], 22, 16);
      };
      for (let j = 0; j <= rows; j++) for (let i = 0; i < cols; i++) ramp(i, j, i + 1, j);
      for (let i = 0; i <= cols; i++) for (let j = 0; j < rows; j++) ramp(i, j, i, j + 1);
    } catch (err) { console.error('[starter] levelling failed', err); }
  }
  await frames(ctx, 1);
  mark('grade');

  // ------------------------------------------------------------------ 2. streets
  await stage(0.14, 'Laying the streets');
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
    // Two points only. The network cuts a street wherever another crosses it, so every stretch ends
    // up exactly one block long; a vertex of our own in the middle of a block would split that
    // block's frontage in two, and a building lot cannot span two stretches.
    try { roads.build([at(best[0]), at(best[1])], type); return true; }
    catch (err) { console.error('[starter] road build failed', err); return false; }
  };
  /**
   * How far an avenue may run on past the grid, from local point (u, v) in direction (du, dv):
   * as far as STUB, but it stops where the ground starts to climb or drop away, at water and at
   * the map edge. A stub that would be shorter than half a block is not built at all.
   */
  const stubLength = (u, v, du, dv) => {
    const p0 = L(u, v);
    const h0 = terrain.getHeight(p0.x, p0.z);
    let reach = 0, prev = h0;
    for (let d = 12; d <= STUB; d += 12) {
      const p = L(u + du * d, v + dv * d);
      if (!dry(p)) break;
      const h = terrain.getHeight(p.x, p.z);
      if (Math.abs(h - h0) > 3.2 || Math.abs(h - prev) > 1.1) break;   // 3.2 m in all, or a 9% pitch
      prev = h; reach = d;
    }
    return reach >= DT / 2 ? reach : 0;
  };
  let streets = 0;
  for (let k = 0; k <= rows; k++) {
    const v = V0 + k * DT, avenue = plan.avenueRows.includes(k);
    const lo = avenue ? stubLength(U0, v, -1, 0) : 0, hi = avenue ? stubLength(U1, v, 1, 0) : 0;
    if (street({ u: U0 - lo, v }, { u: U1 + hi, v }, avenue ? 'avenue' : 'local')) streets++;
  }
  for (let k = 0; k <= cols; k++) {
    const u = U0 + k * DT, avenue = plan.avenueCols.includes(k);
    const lo = avenue ? stubLength(u, V0, 0, -1) : 0, hi = avenue ? stubLength(u, V1, 0, 1) : 0;
    if (street({ u, v: V0 - lo }, { u, v: V1 + hi }, avenue ? 'avenue' : 'local')) streets++;
    if (k % 3 === 2) await frames(ctx, 1);
  }
  await frames(ctx, 2);
  mark('streets');

  // ------------------------------------------------------------------ 3. zoning
  await stage(0.24, 'Zoning the blocks');
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
  mark('zoning');

  // ------------------------------------------------------------------ 4. services
  await stage(0.30, 'Switching on power and water');
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
  mark('services');

  // ------------------------------------------------------------------ 5. grow and move people in
  const buildings = world.buildings && world.buildings.api;
  const sim = ctx.modules.simulation && ctx.modules.simulation.api;
  const day = 60 * 60 * 24;
  try {
    if (lots && buildings && typeof buildings.fastForward === 'function') {
      await stage(0.36, 'Building homes and shops');
      await sliced(plan.growDays, 30, (days) => buildings.fastForward(day * days), (f) => report(0.36 + 0.14 * f, 'Building homes and shops'));
    }
    mark('grow');
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
      mark('levels');
      // The slow part: months of simulated minutes. Done a few days at a time with a breath between,
      // so the bar keeps moving and the browser never decides the page has hung.
      const span = 0.46 / plan.passes;
      for (let pass = 0; pass < plan.passes; pass++) {
        const from = 0.50 + span * pass;
        await sliced(plan.weeks * 7, 3, (days) => sim.fastForward(day * days), (f) => report(from + span * 0.8 * f, 'Moving people in'));
        await sliced(120, 40, (days) => buildings?.fastForward?.(day * days), (f) => report(from + span * (0.8 + 0.2 * f), 'Moving people in'));   // demand has moved on: let lots catch up
      }
      Object.assign(world.time, date0);
      events.emit('time:set', date0.hour);
    }
    mark('people');
    // a starter is a head start, not a debt: never hand over less than a fresh city's treasury
    if (Number.isFinite(world.economy.money)) world.economy.money = Math.max(world.economy.money, plan.money);
  } catch (err) { console.error('[starter] growing the town failed', err); }

  // Roads have the last word on the ground. Service pads and building plots level their own land,
  // and where that land stands above a street the blend spills onto the carriageway. Re-cutting
  // every corridor once everything is in place guarantees no street ends up under the grass.
  await stage(0.97, 'Tidying the streets');
  try { roads.conformAll?.(); roads.flush?.(); } catch (err) { console.error('[starter] road tidy failed', err); }
  mark('tidy');

  try { world.props.api?.refresh?.(); world.traffic.api?.spawnBurst?.(kind === 'town' ? 90 : 30); } catch (err) { console.error('[starter] traffic failed', err); }
  await frames(ctx, 2);
  mark('traffic');
  report(1, 'Raising the town');

  world.time.speed = speed0; world.time.paused = paused0;
  events.emit('time:speed', speed0);
  unmute();

  const result = {
    kind, x: cx, z: cz, radius: plan.camera, yaw: site.yaw,
    streets, lots, services: placed, buildings: (world.buildings && world.buildings.list || []).length,
    homesFor: Math.round((world.buildings && world.buildings.list || []).reduce((n, b) => n + ((b.type === 'res-low' || b.type === 'res-high') ? (b.residents || 0) : 0), 0)),
    population: world.economy.population, ms: Math.round(performance.now() - t0),
    relief: +site.relief.toFixed(1), step: +site.step.toFixed(2), graded, terraceStep: +steepest.toFixed(2), timing,
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
 * Find where the town goes. Two boxes, in the local frame: `box` is everything the town touches
 * (streets, stubs, the utility strip) and only has to be dry; `grid` is the blocks themselves and
 * has to be LEVEL, because every block becomes a terrace and every street a ramp between two.
 * What counts as level is the step between neighbouring blocks, not the height range across the
 * whole town: a long even slope makes a fine town, a 30 m hill in the middle does not.
 *
 * Looks at eight headings per candidate (a seeded start, in eighths of a turn), with a mild pull
 * toward the middle of the map. Always returns a site; on a map with no good one, the least bad.
 */
function pickSite(world, terrain, rng, box, grid) {
  const reach = Math.hypot(Math.max(-box.u0, box.u1), Math.max(-box.v0, box.v1));
  const limit = Math.max(0, world.half - reach - 40);
  const yaw0 = rng.range(0, Math.PI / 4);
  const STEP = 64, PROBE = 44, DTg = (grid.u1 - grid.u0) / grid.cols;
  const wet = (x, z) => !world.inBounds(x, z) || (terrain.isWater && terrain.isWater(x, z));
  const H = new Float64Array(grid.cols * grid.rows);
  let best = null;
  for (let z = -limit; z <= limit; z += STEP) {
    for (let x = -limit; x <= limit; x += STEP) {
      for (let q = 0; q < 8; q++) {
        const yaw = yaw0 + q * Math.PI / 4;
        const ux = Math.cos(yaw), uz = Math.sin(yaw), vx = -uz, vz = ux;
        // the blocks: height at the middle of each, and whether any corner is in the water
        let gridWet = 0, lo = Infinity, hi = -Infinity;
        for (let i = 0; i < grid.cols; i++) {
          for (let j = 0; j < grid.rows; j++) {
            const u = grid.u0 + (i + 0.5) * DTg, v = grid.v0 + (j + 0.5) * DTg;
            const px = x + ux * u + vx * v, pz = z + uz * u + vz * v;
            if (wet(px, pz)) { gridWet++; H[i * grid.rows + j] = NaN; continue; }
            const h = terrain.getHeight(px, pz);
            H[i * grid.rows + j] = h;
            if (h < lo) lo = h;
            if (h > hi) hi = h;
          }
        }
        for (let i = 0; i <= grid.cols; i++) {
          for (let j = 0; j <= grid.rows; j++) {
            const u = grid.u0 + i * DTg, v = grid.v0 + j * DTg;
            if (wet(x + ux * u + vx * v, z + uz * u + vz * v)) gridWet++;
          }
        }
        let step = 0;
        for (let i = 0; i < grid.cols; i++) {
          for (let j = 0; j < grid.rows; j++) {
            const h = H[i * grid.rows + j];
            if (!(h === h)) continue;
            if (i + 1 < grid.cols) { const n = H[(i + 1) * grid.rows + j]; if (n === n) step = Math.max(step, Math.abs(h - n)); }
            if (j + 1 < grid.rows) { const n = H[i * grid.rows + j + 1]; if (n === n) step = Math.max(step, Math.abs(h - n)); }
          }
        }
        // the wider footprint: how much of it is dry
        let dry = 0, total = 0;
        for (let v = box.v0; v <= box.v1; v += PROBE) {
          for (let u = box.u0; u <= box.u1; u += PROBE) {
            total++;
            if (!wet(x + ux * u + vx * v, z + uz * u + vz * v)) dry++;
          }
        }
        const dryness = total ? dry / total : 0;
        const relief = hi > lo ? hi - lo : 0;
        const gridDry = 1 - gridWet / (grid.cols * grid.rows + (grid.cols + 1) * (grid.rows + 1));
        // a step of MAX_STEP between two blocks is where terracing starts to show; twice that halves the score
        const level = 1 / (1 + Math.pow(step / (MAX_STEP * 2), 2)) * (1 / (1 + relief / 40));
        const centre = limit ? 1 - Math.hypot(x, z) / (limit * 1.5) : 1;
        // water under a block costs the block outright, so it is squared; then level ground; then the rest
        const score = gridDry * gridDry * 0.38 + level * 0.40 + dryness * 0.14 + centre * 0.08;
        if (!best || score > best.score) best = { cx: x, cz: z, yaw, ux, uz, vx, vz, score, dryness, relief, step, gridDry };
      }
    }
  }
  return best || { cx: 0, cz: 0, yaw: 0, ux: 1, uz: 0, vx: 0, vz: 1, score: 0, dryness: 0, relief: 0, step: 0, gridDry: 0 };
}
