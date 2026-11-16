// Save round trip: play a starter in one page, save it, load the save into a fresh page, compare.
//   node savecheck.mjs [seed] [village|town]
//   BASE=http://127.0.0.1:5200/BDB/city/   where the game is served (see README.md)
// Three things are checked, and each prints a DIFF line that should name nothing but the clock:
//   1. straight after loading: same zoning cells, same plots, every building back, ground and road
//      heights within a centimetre, same people and money
//   2. both pages play on for three game days and should still agree
//   3. second generation: save the loaded city and load it again; nothing may drift
// The clock differs by a few game minutes because the original keeps running while it is saved.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const seed = process.argv[2] || '42799', kind = process.argv[3] || 'town';
const base = process.env.BASE || 'http://127.0.0.1:5200/BDB/city/', focus = '&focus=terrain,roads,zoning,buildings,simulation';
const browser = await chromium.launch({
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const open = async (query) => {
  const page = await browser.newPage({ viewport: { width: 400, height: 240 } });
  page.errs = []; page.on('pageerror', e => page.errs.push(String(e).slice(0, 300))); page.on('console', m => { if (m.type() === 'error') page.errs.push('console: ' + m.text().slice(0, 240)); });
  await page.goto(base + query + focus, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 600000 });
  return page;
};
// what a city "is", for comparing two pages
const fingerprint = () => {
  const g = window.__game, w = g.world, t = w.terrain;
  const lots = w.zones.api.lotsFor();
  const lotKeys = lots.map((l) => l.key).sort();
  const b = w.buildings.list;
  const byType = {}; let levels = 0, room = 0;
  for (const x of b) { byType[x.type + (x.state === 'built' ? '' : ':building')] = (byType[x.type + (x.state === 'built' ? '' : ':building')] || 0) + 1; levels += x.level; room += x.residents || 0; }
  let hsum = 0, n = 0; const hs = [];
  for (let z = -1000; z <= 1000; z += 20) for (let x = -1000; x <= 1000; x += 20) { const h = t.getHeight(x, z); hsum += h; n++; hs.push(Math.round(h * 100)); }
  const segs = [...w.roads.segments.values()];
  const roadY = segs.map((s) => [s.id, s.type, Math.round(s.length * 10), ...(s.points || []).filter((_, i) => i % 8 === 0).map((p) => Math.round(p.y * 100))]);
  const e = w.economy;
  const cells = w.zones.api.cellList ? w.zones.api.cellList() : [];
  return { cells, nodes: w.roads.nodes.size, segs: segs.length, zoned: w.zones.api.stats().zonedCells, lots: lots.length, lotKeys, buildings: b.length, byType, levels, room,
    places: b.map((x) => `${Math.round(x.x)},${Math.round(x.z)},${x.type},${x.level},${x.seed}`).sort(),
    services: w.services.list.map((s) => `${s.type}@${Math.round(s.x)},${Math.round(s.z)}`).sort(), pop: e.population, households: e.households, money: Math.round(e.money),
    happiness: +e.happiness.toFixed(3), tax: e.taxRate, name: e.cityName, date: `${w.time.day}/${w.time.month}/${w.time.year} ${w.time.hour.toFixed(2)}`, milestone: e.milestone && e.milestone.name,
    hmean: +(hsum / n).toFixed(4), hs, roadY };
};
const diff = (a, b) => {
  const out = {};
  for (const k of ['nodes', 'segs', 'zoned', 'lots', 'buildings', 'levels', 'room', 'pop', 'households', 'money', 'happiness', 'name', 'date', 'milestone', 'hmean']) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = [a[k], b[k]];
  for (const k of ['byType', 'tax', 'services']) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = [a[k], b[k]];
  const setDiff = (x, y) => { const s = new Set(y); return x.filter((v) => !s.has(v)).length; };
  const cm = a.cells.filter((v) => !new Set(b.cells).has(v)), ce = b.cells.filter((v) => !new Set(a.cells).has(v));
  out.cellsMissing = cm.length; out.cellsExtra = ce.length; out.cellSample = [cm.slice(0, 8), ce.slice(0, 8)];
  out.lotKeysMissing = setDiff(a.lotKeys, b.lotKeys); out.lotKeysExtra = setDiff(b.lotKeys, a.lotKeys);
  out.buildingsMissing = setDiff(a.places, b.places); out.buildingsExtra = setDiff(b.places, a.places);
  let worst = 0, moved = 0; for (let i = 0; i < a.hs.length; i++) { const d = Math.abs(a.hs[i] - b.hs[i]); if (d > worst) worst = d; if (d > 1) moved++; }
  out.groundWorstCm = worst; out.groundPointsMoved = moved;
  let ry = 0; const m = new Map(b.roadY.map((r) => [r[0], r])); let roadsMissing = 0;
  for (const r of a.roadY) { const o = m.get(r[0]); if (!o || o[1] !== r[1] || o[2] !== r[2]) { roadsMissing++; continue; } for (let i = 3; i < r.length; i++) ry = Math.max(ry, Math.abs(r[i] - (o[i] ?? 1e9))); }
  out.roadsChanged = roadsMissing; out.roadHeightWorstCm = ry;
  return out;
};

// ---- page A: a starter, then some play of our own
const A = await open(`?start=${kind}&seed=${seed}&quality=low`);
const made = await A.evaluate(async () => {
  const g = window.__game, w = g.world, s = w.starter, sim = g.modules.simulation.api;
  const ux = Math.cos(s.yaw), uz = Math.sin(s.yaw), vx = -uz, vz = ux;
  const L = (u, v) => ({ x: s.x + ux * u + vx * v, z: s.z + uz * u + vz * v });
  // a new street off the edge of the grid with a bend in it, zoned on both sides, a clinic, a tax change, and a week of play
  const far = Math.max(...[...w.roads.nodes.values()].map((n) => (n.x - s.x) * ux + (n.z - s.z) * uz));
  const built = w.roads.api.build([L(far, 0), L(far + 60, 30), L(far + 150, 30)], 'local');
  const built2 = w.roads.api.build([L(far + 60, 30), L(far + 60, 130)], 'local', {});
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const a = L(far + 20, -30), b = L(far + 160, 140);
  const painted = w.zones.api.paintRect(Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z), 'res-low');
  const c = L(far + 110, 85);
  const clinic = w.services.api.place('health', c.x, c.z, { free: false, silent: true });
  sim.setTax('residential', 0.07);
  w.economy.cityName = 'Round Trip';
  w.buildings.api.fastForward(86400 * 30);
  sim.fastForward(86400 * 9);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return { newSegs: built.segments.length + built2.segments.length, painted, clinic: !!clinic };
});
const { snapshotJson, packed, sizes } = await A.evaluate(async () => {
  const S = await import(new URL('src/save/snapshot.js', document.baseURI).href), C = await import(new URL('src/save/codec.js', document.baseURI).href);
  const t0 = performance.now();
  const snap = S.captureCity(window.__game.ctx, { start: window.__game.config.start });
  const t1 = performance.now();
  const packed = await C.pack(snap);
  const t2 = performance.now();
  const part = (k) => Math.round(JSON.stringify(snap[k]).length / 1024);
  return { packed, snapshotJson: null, sizes: { captureMs: Math.round(t1 - t0), packMs: Math.round(t2 - t1), jsonKB: Math.round(JSON.stringify(snap).length / 1024), packedKB: Math.round(packed.length / 1024),
    terrainKB: part('terrain'), roadsKB: part('roads'), zonesKB: part('zones'), simKB: part('sim'), buildingsKB: part('buildings'), prefix: packed.slice(0, 6) } };
});
const fa = await A.evaluate(fingerprint);
console.log('played:', JSON.stringify(made), '· save:', JSON.stringify(sizes));
console.log('A:', JSON.stringify({ nodes: fa.nodes, segs: fa.segs, zoned: fa.zoned, lots: fa.lots, buildings: fa.buildings, byType: fa.byType, services: fa.services.length, pop: fa.pop, money: fa.money, date: fa.date, name: fa.name, milestone: fa.milestone }));

// ---- page B: empty world on the same seed, load the save
const B = await open(`?start=empty&seed=${seed}&quality=low`);
const restored = await B.evaluate(async (packed) => {
  const S = await import(new URL('src/save/snapshot.js', document.baseURI).href), C = await import(new URL('src/save/codec.js', document.baseURI).href);
  const snap = await C.unpack(packed);
  const why = S.whyNotLoadable(snap, window.__game.world);
  if (why) return { why };
  const t0 = performance.now();
  const r = await S.restoreCity(window.__game.ctx, snap, () => {});
  return { ...r, ms: Math.round(performance.now() - t0) };
}, packed);
await B.waitForTimeout(500);
const fb = await B.evaluate(fingerprint);
console.log('restored:', JSON.stringify(restored));
console.log('DIFF straight after loading:', JSON.stringify(diff(fa, fb)));

// ---- both pages play on for three game days: the loaded city must behave like the original
const play = async (p) => p.evaluate(() => { const g = window.__game; g.modules.simulation.api.fastForward(86400 * 3); const e = g.world.economy; return { pop: e.population, households: e.households, money: Math.round(e.money), happiness: +e.happiness.toFixed(3), buildings: g.world.buildings.list.length }; });
console.log('3 days later  A:', JSON.stringify(await play(A)), ' B:', JSON.stringify(await play(B)));

// ---- second generation: save the loaded city and load it again; nothing may drift
await A.close();
const packed2 = await B.evaluate(async () => { const S = await import(new URL('src/save/snapshot.js', document.baseURI).href), C = await import(new URL('src/save/codec.js', document.baseURI).href); return C.pack(S.captureCity(window.__game.ctx, {})); });
const fb2 = await B.evaluate(fingerprint);
const Cc = await open(`?start=empty&seed=${seed}&quality=low`);
const restored2 = await Cc.evaluate(async (packed) => { const S = await import(new URL('src/save/snapshot.js', document.baseURI).href), C = await import(new URL('src/save/codec.js', document.baseURI).href); return S.restoreCity(window.__game.ctx, await C.unpack(packed), () => {}); }, packed2);
await Cc.waitForTimeout(500);
const fc = await Cc.evaluate(fingerprint);
console.log('second generation restored:', JSON.stringify(restored2), 'packedKB', Math.round(packed2.length / 1024));
console.log('DIFF second generation:', JSON.stringify(diff(fb2, fc)));
console.log('errors A/B/C:', JSON.stringify([A.errs, B.errs, Cc.errs]));
await browser.close();
