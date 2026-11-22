/* BDB Craft: the world on the page. Keeps the chunks near the player, asks the workers to make and mesh them, turns meshes into three.js objects, and
   tracks every block anyone changes (mods: the whole chunk, kept for good once one block in it changes; that is what gets saved and sent to friends). */
import * as THREE from '../chess/vendor/three.module.min.js?v=c22';
import { CH, H, OPAQUE, SOLID, PLANT, LIQUID, BLOCKS, SHAPE } from './blocks.js?v=c22';
import { boxes, solidBoxes } from './shapes.js?v=c22';
import { PW, PH, PAD, pidx } from './mesh.js?v=c22';
const key = (cx, cz) => cx + ',' + cz;
export function createWorld({seed, kind, scene, matSolid, matClear, workers = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)), wait, onGen}){
  const chunks = new Map(), mods = new Map(), dirty = new Set(), pool = [], jobs = new Map(), queue = new Map(), far = new Set();
  function drain(k, v){ const q = queue.get(k); if (!q) return; for (let j = 0; j < q.length; j += 2) v[q[j]] = q[j + 1]; queue.delete(k); mods.set(k, v); dirty.add(k); }
  let nid = 0, R = 8, centre = [0, 0], busyGen = 0, busyMesh = 0, alive = true, stats = {gen:0, mesh:0};
  for (let i = 0; i < workers; i++){
    const w = new Worker(new URL('./worker.js?v=c22', import.meta.url), {type:'module'});
    w.onmessage = e => done(e.data); w.busy = 0; pool.push(w);
  }
  const free = () => pool.reduce((a, w) => w.busy < a.busy ? w : a, pool[0]);
  function send(msg, transfer, cb){ const id = ++nid, w = free(); w.busy++; jobs.set(id, {cb, w}); msg.id = id; w.postMessage(msg, transfer || []); }
  function done(m){ const j = jobs.get(m.id); if (!j) return; jobs.delete(m.id); j.w.busy--; if (alive) j.cb(m); }
  function get(x, y, z){
    if (y < 0) return 39; if (y >= H) return 0;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH), c = chunks.get(key(cx, cz)); if (!c || !c.v) return -1;
    return c.v[(y * CH + (z - cz * CH)) * CH + (x - cx * CH)];
  }
  /* change one block. Returns false if that part of the world is not loaded */
  function set(x, y, z, b, quiet){
    if (y < 1 || y >= H) return false;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH), k = key(cx, cz), c = chunks.get(k), lx = x - cx * CH, lz = z - cz * CH, i = (y * CH + lz) * CH + lx;
    if (!c || !c.v){
      if (mods.has(k) && !c){ const v = mods.get(k); v[i] = b; dirty.add(k); return true; }
      // not here yet: keep the change, and put it in as soon as the chunk is (made far away if no one is near it, so it still gets saved)
      if (!queue.has(k)) queue.set(k, []); queue.get(k).push(i, b);
      if (!c && !(wait && wait(k)) && !far.has(k)){ far.add(k); send({t:'gen', seed, cx, cz, kind}, null, m => { far.delete(k); const n = chunks.get(k); if (n && n.v) return; const v = mods.get(k) || m.v; drain(k, v); if (n){ n.v = v; n.need = true; } }); }
      return false;
    }
    if (c.v[i] === b) return true;
    c.v[i] = b; mods.set(k, c.v); dirty.add(k);
    remesh(c, true);
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]){      // a block near the edge changes the neighbour's faces, shadows and light too
      if ((dx < 0 && lx >= PAD) || (dx > 0 && lx < CH - PAD) || (dz < 0 && lz >= PAD) || (dz > 0 && lz < CH - PAD)) continue;
      const n = chunks.get(key(cx + dx, cz + dz)); if (n) remesh(n, true);
    }
    return true;
  }
  function remesh(c, soon){ c.need = true; if (soon) c.soon = true; }
  function padded(cx, cz){
    const v = new Uint16Array(PW * PH * PW);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++){
      const n = chunks.get(key(cx + dx, cz + dz)).v, x0 = dx < 0 ? CH - PAD : 0, x1 = dx > 0 ? PAD - 1 : CH - 1, z0 = dz < 0 ? CH - PAD : 0, z1 = dz > 0 ? PAD - 1 : CH - 1;
      for (let y = 0; y < H; y++) for (let z = z0; z <= z1; z++){ const row = (y * CH + z) * CH; for (let x = x0; x <= x1; x++) v[pidx(x + dx * CH, y, z + dz * CH)] = n[row + x]; }
    }
    for (let z = -PAD; z < CH + PAD; z++) for (let x = -PAD; x < CH + PAD; x++) v[pidx(x, -1, z)] = 39;      // bedrock under everything
    return v;
  }
  function build(c, r){
    for (const [part, mat] of [['solid', matSolid], ['clear', matClear]]){
      const old = c[part]; if (old){ scene.remove(old); old.geometry.dispose(); c[part] = null; }
      const m = r[part]; if (!m.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); g.setAttribute('tex', new THREE.BufferAttribute(m.tex, 3)); g.setAttribute('light', new THREE.BufferAttribute(m.light, 2));
      g.setIndex(new THREE.BufferAttribute(m.idx, 1)); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CH / 2, H / 2, CH / 2), Math.hypot(CH, H, CH) / 2);
      const o = new THREE.Mesh(g, mat); o.position.set(c.cx * CH, 0, c.cz * CH); o.matrixAutoUpdate = false; o.updateMatrix(); if (part === 'clear') o.renderOrder = 1;
      scene.add(o); c[part] = o;
    }
  }
  /* each frame: load what is near, mesh what is ready, drop what is far */
  function update(px, pz){
    const ccx = Math.floor(px / CH), ccz = Math.floor(pz / CH); centre = [ccx, ccz];
    const want = [];
    for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++){ const d = dx * dx + dz * dz; if (d <= (R + 1.5) ** 2) want.push([d, ccx + dx, ccz + dz]); }
    want.sort((a, b) => a[0] - b[0]);
    for (const [d, cx, cz] of want){
      const k = key(cx, cz); let c = chunks.get(k);
      if (!c){ c = {cx, cz, v:null, need:true, soon:false, solid:null, clear:null, busy:false, d}; chunks.set(k, c); }
      if (!c.v && !c.busy && busyGen < pool.length * 2){
        if (mods.has(k)){ c.v = mods.get(k); drain(k, c.v); continue; }
        if (wait && wait(k)) continue;                                  // a friend's change to this chunk is still on its way
        c.busy = true; busyGen++;
        send({t:'gen', seed, cx, cz, kind}, null, m => { busyGen--; c.busy = false; stats.gen++; if (!chunks.has(k)) return; c.v = mods.get(k) || m.v; drain(k, c.v); if (onGen) onGen(cx, cz, c.v); });
      }
    }
    // mesh: the nearest chunk that needs it and has all eight neighbours, edits first
    let n = 0; const ready = [];
    for (const [d, cx, cz] of want){
      if (d > (R + .5) ** 2) continue; const c = chunks.get(key(cx, cz));
      if (!c.v || !c.need || c.meshing) continue;
      let ok = true; for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1; dx++){ const q = chunks.get(key(cx + dx, cz + dz)); if (!q || !q.v){ ok = false; break; } }
      if (ok) ready.push(c);
    }
    ready.sort((a, b) => (b.soon - a.soon));
    for (const c of ready){
      if (busyMesh >= pool.length * 2 && !c.soon) break; if (++n > 6 && !c.soon) break;
      c.need = false; c.soon = false; c.meshing = true; busyMesh++;
      const v = padded(c.cx, c.cz);
      send({t:'mesh', v}, [v.buffer], m => { busyMesh--; c.meshing = false; stats.mesh++; if (chunks.get(key(c.cx, c.cz)) !== c) return; build(c, m.r); });
    }
    for (const [k, c] of chunks){ const dx = c.cx - ccx, dz = c.cz - ccz; if (dx * dx + dz * dz > (R + 3) ** 2){ drop(c); chunks.delete(k); } }
  }
  function drop(c){ for (const part of ['solid', 'clear']){ const o = c[part]; if (o){ scene.remove(o); o.geometry.dispose(); c[part] = null; } } }
  /* the block the player is looking at, and the empty spot in front of it (for placing): a step-by-step walk through the grid */
  /* where a ray first meets a box: [t, axis] or null (slab test) */
  function hitBox(o, dir, x0, y0, z0, x1, y1, z1){
    let tmin = -Infinity, tmax = Infinity, ax = 0; const lo = [x0, y0, z0], hi = [x1, y1, z1], O = [o.x, o.y, o.z], D = [dir.x, dir.y, dir.z];
    for (let i = 0; i < 3; i++){
      if (Math.abs(D[i]) < 1e-9){ if (O[i] < lo[i] || O[i] > hi[i]) return null; continue; }
      let a = (lo[i] - O[i]) / D[i], b = (hi[i] - O[i]) / D[i]; if (a > b){ const t = a; a = b; b = t; }
      if (a > tmin){ tmin = a; ax = i; } if (b < tmax) tmax = b; if (tmin > tmax) return null;
    }
    return tmax < 0 ? null : [Math.max(0, tmin), ax];
  }
  const nbOf = (x, y, z) => (dx, dy, dz) => Math.max(0, get(x + dx, y + dy, z + dz));
  /* the block the player is looking at, and the empty spot in front of it (for placing): a step-by-step walk through the grid.
     Shaped blocks are only hit where they really are, so you can look past a torch or over a slab. hp is the point hit */
  function ray(o, dir, max = 6, wet = false){
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z); const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
    const tdx = Math.abs(1 / dir.x), tdy = Math.abs(1 / dir.y), tdz = Math.abs(1 / dir.z);
    let tx = (sx > 0 ? x + 1 - o.x : o.x - x) * tdx, ty = (sy > 0 ? y + 1 - o.y : o.y - y) * tdy, tz = (sz > 0 ? z + 1 - o.z : o.z - z) * tdz, t = 0, face = null, px = x, py = y, pz = z;
    while (t <= max){
      const b = get(x, y, z);
      if (b > 0 && SHAPE[b]){
        let best = null; for (const bx of boxes(b, nbOf(x, y, z))){ const h = hitBox(o, dir, x + bx[0], y + bx[1], z + bx[2], x + bx[3], y + bx[4], z + bx[5]); if (h && (!best || h[0] < best[0])) best = h; }
        if (best && best[0] <= max){ const f = [0, 0, 0]; f[best[1]] = -Math.sign([dir.x, dir.y, dir.z][best[1]]); const hp = {x:o.x + dir.x * best[0], y:o.y + dir.y * best[0], z:o.z + dir.z * best[0]};
          return {x, y, z, b, px:x + f[0], py:y + f[1], pz:z + f[2], face:f, t:best[0], hp, shaped:true}; }
      } else if (b > 0 && (!LIQUID[b] || wet)) return {x, y, z, b, px, py, pz, face, t, hp:{x:o.x + dir.x * t, y:o.y + dir.y * t, z:o.z + dir.z * t}};
      px = x; py = y; pz = z;
      if (tx < ty && tx < tz){ x += sx; t = tx; tx += tdx; face = [-sx, 0, 0]; } else if (ty < tz){ y += sy; t = ty; ty += tdy; face = [0, -sy, 0]; } else { z += sz; t = tz; tz += tdz; face = [0, 0, -sz]; }
    }
    return null;
  }
  /* what you bump into in one cell, in world units */
  function boxesAt(x, y, z){
    const b = get(x, y, z); if (b < 0) return [[x, y, z, x + 1, y + 1, z + 1]]; if (!b) return null;
    if (SHAPE[b]) return solidBoxes(b, nbOf(x, y, z)).map(q => [x + q[0], y + q[1], z + q[2], x + q[3], y + q[4], z + q[5]]);
    return SOLID[b] ? [[x, y, z, x + 1, y + 1, z + 1]] : null;
  }
  /* the outline round a block: all its boxes in one */
  function bounds(x, y, z){
    const b = get(x, y, z); if (!(b > 0) || !SHAPE[b]) return [0, 0, 0, 1, 1, 1];
    const q = boxes(b, nbOf(x, y, z)); return [Math.min(...q.map(a => a[0])), Math.min(...q.map(a => a[1])), Math.min(...q.map(a => a[2])), Math.max(...q.map(a => a[3])), Math.max(...q.map(a => a[4])), Math.max(...q.map(a => a[5]))];
  }
  const solidAt = (x, y, z) => { const b = get(x, y, z); return b < 0 ? true : SOLID[b] === 1; };
  function loadedAround(px, pz, r = 1){ const cx = Math.floor(px / CH), cz = Math.floor(pz / CH); for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++){ const c = chunks.get(key(cx + dx, cz + dz)); if (!c || !c.solid && !c.clear) return false; } return true; }
  function surface(x, z){ for (let y = H - 1; y > 0; y--){ const b = get(x, y, z); if (b > 0 && SOLID[b]) return y + 1; } return -1; }
  return {
    get, set, ray, update, solidAt, boxesAt, bounds, loadedAround, surface, mods, dirty, chunks, stats,
    get R(){ return R; }, set R(v){ R = v; },
    setMod(k, v){ mods.set(k, v); drain(k, v); const c = chunks.get(k); if (c){ c.v = v; c.need = true; c.soon = true; const [cx, cz] = k.split(',').map(Number); for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++){ const n = chunks.get(key(cx + dx, cz + dz)); if (n) n.need = true; } } },
    loaded:() => [...chunks.values()].filter(c => c.solid || c.clear).length,
    pending:() => busyGen + busyMesh,
    dispose(){ alive = false; for (const w of pool) w.terminate(); for (const c of chunks.values()) drop(c); chunks.clear(); }
  };
}
