/**
 * Rescue a city out of a tab that is still open.
 *
 * The first public build had no saving, so a city existed only in the memory of the tab that was
 * running it. This file can be loaded INTO such a tab, from the browser console, without a reload:
 *
 *     import('./src/rescue.js')
 *
 * It reads the running game through `window.__game`, writes everything a later load needs into
 * one JSON document, and puts that document in two places: the browser's storage for this site
 * (where the game looks for it once saving exists) and a file in the Downloads folder (the copy
 * that survives clearing the browser).
 *
 * It imports nothing and changes nothing in the running game, so it works against any build.
 */
export const RESCUE_KEY = 'bdb.city.rescue.v1';

const r2 = (n) => Math.round(n * 100) / 100;
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isVec = (v) => v && typeof v === 'object' && isNum(v.x) && isNum(v.z);
const vec = (v) => [r2(v.x), r2(isNum(v.y) ? v.y : 0), r2(v.z)];

/** Numbers, strings, booleans, and arrays or one level of plain object made of them. Nothing else. */
function flat(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v == null || typeof v === 'string' || typeof v === 'boolean') { out[k] = v; continue; }
    if (typeof v === 'number') { if (Number.isFinite(v)) out[k] = v; continue; }
    if (Array.isArray(v)) {
      if (v.length <= 64 && v.every((x) => x == null || ['number', 'string', 'boolean'].includes(typeof x))) out[k] = v.slice();
      continue;
    }
    if (typeof v === 'object' && !v.isObject3D && !v.isBufferGeometry && !v.isMaterial && !(v instanceof Map) && !(v instanceof Set)) {
      const inner = {};
      let n = 0;
      for (const kk of Object.keys(v)) {
        const vv = v[kk];
        if (vv == null || typeof vv === 'string' || typeof vv === 'boolean' || isNum(vv)) { inner[kk] = vv; n++; }
        if (n > 40) break;
      }
      if (n && n <= 40) out[k] = inner;
    }
  }
  return out;
}

/** The shape of one road: its base curve (so it can be rebuilt exactly) and a sampled path as a fallback. */
function curveOf(seg) {
  const c = seg.curve;
  const base = c && c.base ? c.base : c;
  const shape = { kind: base && (base.type || (base.constructor && base.constructor.name)) || null };
  if (base) {
    for (const k of Object.keys(base)) {
      const v = base[k];
      if (isVec(v)) shape[k] = vec(v);
      else if (Array.isArray(v) && v.length && v.length <= 512 && v.every(isVec)) shape[k] = v.map(vec);
      else if (typeof v === 'string' || typeof v === 'boolean' || isNum(v)) shape[k] = v;
    }
  }
  const pts = Array.isArray(seg.points) ? seg.points : [];
  const step = Math.max(1, Math.round(pts.length / 24));
  const path = [];
  for (let i = 0; i < pts.length; i++) if (i % step === 0 || i === pts.length - 1) path.push([r2(pts[i].x), r2(pts[i].z)]);
  return { u0: c && isNum(c.u0) ? c.u0 : 0, u1: c && isNum(c.u1) ? c.u1 : 1, base: shape, path };
}

export function rescue() {
  const g = window.__game;
  if (!g || !g.world) throw new Error('This page is not a running BDB City game.');
  const w = g.world;
  const errors = [];
  const part = (name, fn, fallback) => { try { return fn(); } catch (err) { errors.push(`${name}: ${err && err.message}`); return fallback; } };

  const doc = {
    format: 'bdb-city-rescue', v: 1,
    savedAt: new Date().toISOString(),
    page: String(location.href),
    seed: w.seed, size: w.size, half: w.half, cellSize: w.cellSize,
    name: w.economy && w.economy.cityName,
    start: g.config ? g.config.start : null, demo: !!(g.config && g.config.demo),
  };

  doc.nodes = part('nodes', () => [...w.roads.nodes.values()].map((n) => [n.id, r2(n.x), r2(n.z)]), []);
  doc.segments = part('segments', () => [...w.roads.segments.values()].map((s) => ({
    id: s.id, a: s.a, b: s.b, type: s.type, length: r2(s.length), ...curveOf(s),
  })), []);

  // Zoning is painted per world cell. The live API answers "what zone is at this point", so ask at
  // the centre of every cell the road grid covers, and a little to each side, and keep the majority.
  doc.zones = part('zones', () => {
    const api = w.zones.api, out = [], seen = new Set();
    const offsets = [[0, 0], [2.6, 0], [-2.6, 0], [0, 2.6], [0, -2.6]];
    for (const c of api.cellsInRect(-w.half, -w.half, w.half, w.half)) {
      const key = c.cz * 65536 + c.cx;
      if (seen.has(key)) continue;
      seen.add(key);
      const p = w.cellCenter(c.cx, c.cz);
      const votes = {};
      for (const [dx, dz] of offsets) { const t = api.zoneAt(p.x + dx, p.z + dz); if (t) votes[t] = (votes[t] || 0) + 1; }
      const best = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0];
      if (best) out.push([c.cx, c.cz, best]);
    }
    return out;
  }, []);

  doc.lots = part('lots', () => (w.zones.api.lotsFor() || []).map(flat), []);
  doc.buildings = part('buildings', () => (w.buildings.list || []).map(flat), []);
  doc.services = part('services', () => (w.services.list || []).map(flat), []);
  doc.economy = part('economy', () => flat(w.economy), {});
  doc.time = part('time', () => flat(w.time), {});
  doc.weather = part('weather', () => w.env && w.env.weather, null);
  doc.starter = part('starter', () => (w.starter ? flat(w.starter) : null), null);
  doc.camera = part('camera', () => {
    const cc = g.cameraController;
    const v = cc && typeof cc.getView === 'function' ? cc.getView() : null;
    return v ? { target: { x: r2(v.target.x), z: r2(v.target.z) }, distance: r2(v.distance), yaw: v.yaw, pitch: v.pitch } : null;
  }, null);
  doc.errors = errors;

  const json = JSON.stringify(doc);
  let stored = false;
  try { localStorage.setItem(RESCUE_KEY, json); stored = true; } catch (err) { errors.push(`storage: ${err && err.message}`); }

  let fileName = null;
  try {
    const slug = String(doc.name || 'city').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'city';
    fileName = `bdb-city-${slug}-${doc.savedAt.slice(0, 16).replace(/[:T]/g, '')}.json`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  } catch (err) { errors.push(`download: ${err && err.message}`); fileName = null; }

  const summary = {
    city: doc.name, roads: doc.segments.length, zonedCells: doc.zones.length, buildings: doc.buildings.length,
    services: doc.services.length, people: doc.economy.population, money: Math.round(doc.economy.money || 0),
    kilobytes: Math.round(json.length / 1024), inBrowserStorage: stored, file: fileName, problems: errors,
  };
  window.__bdbRescue = { doc, summary };
  const line = `${summary.city}: ${summary.roads} roads, ${summary.buildings} buildings, ${summary.people} people saved` +
    `${stored ? ' in this browser' : ''}${fileName ? ` and in the file ${fileName}` : ''}.`;
  console.log('%cBDB City rescue', 'font-weight:bold;font-size:14px', '\n' + line, summary);
  try { g.events.emit('notification', { kind: 'info', title: 'City saved', text: line, life: 15000 }); } catch (_) { /* no HUD */ }
  return summary;
}

export const result = (() => {
  try { return rescue(); } catch (err) { console.error('[rescue] failed', err); return { failed: String(err && err.message) }; }
})();
