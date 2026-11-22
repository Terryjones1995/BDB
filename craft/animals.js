/* BDB Craft: animals. Cows, pigs, sheep and chickens wander the grass near you, stop to graze, step up single blocks, keep out of water, and bolt
   when someone gets close or slaps them. Blocky, with pixel faces drawn here. In a shared world only the host moves them and sends where they are
   (5 times a second); friends just draw them. */
import * as THREE from '../chess/vendor/three.module.min.js?v=c4';
import { B, SOLID, LIQUID } from './blocks.js?v=c4';

function pic(w, h, fill){ const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = fill; x.fillRect(0, 0, w, h); return {c, px(a, b, col, ww = 1, hh = 1){ x.fillStyle = col; x.fillRect(a, b, ww, hh); }}; }
const tex = p => { const t = new THREE.CanvasTexture(p.c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; };
const mat = p => new THREE.MeshLambertMaterial({map:tex(p)});
const plain = c => new THREE.MeshLambertMaterial({color:new THREE.Color(c)});

/* faces for each kind, made once */
const LOOK = {};
function look(kind){
  if (LOOK[kind]) return LOOK[kind];
  let L;
  if (kind === 'cow'){
    const hide = () => { const p = pic(8, 8, '#f2efe8'); p.px(0, 1, '#2a2522', 3, 3); p.px(5, 4, '#2a2522', 3, 3); p.px(2, 6, '#2a2522', 2, 2); return p; };
    const face = pic(8, 8, '#f2efe8'); face.px(0, 0, '#2a2522', 3, 3); face.px(1, 3, '#111', 1, 1); face.px(6, 3, '#111', 1, 1); face.px(2, 5, '#d9a6a0', 4, 3); face.px(3, 6, '#7a4a44'); face.px(4, 6, '#7a4a44');
    const b = mat(hide()), bs = mat(hide()), f = mat(face), s = plain('#f2efe8');
    L = {body:[b, bs, b, plain('#ded9cf'), bs, b], head:[s, s, mat(hide()), s, f, s], leg:plain('#2a2522'), horn:plain('#d9d3c0'), w:.9, h:.9, len:1.3, legH:.6, headS:.5, speed:1.6};
  } else if (kind === 'pig'){
    const skin = '#eda7a6'; const face = pic(8, 8, skin); face.px(1, 2, '#111'); face.px(6, 2, '#111'); face.px(2, 4, '#d7807f', 4, 3); face.px(3, 5, '#7a3a3a'); face.px(4, 5, '#7a3a3a');
    const s = plain(skin), f = mat(face);
    L = {body:[s, s, s, plain('#df9493'), s, s], head:[s, s, s, s, f, s], leg:plain('#d98d8c'), w:.62, h:.55, len:1, legH:.35, headS:.48, speed:1.5};
  } else if (kind === 'sheep'){
    const wool = () => { const p = pic(8, 8, '#efece6'); for (let i = 0; i < 9; i++) p.px((i * 5) % 8, (i * 3) % 8, '#dcd8cf'); return p; };
    const face = pic(8, 8, '#cdbba8'); face.px(1, 3, '#111'); face.px(6, 3, '#111'); face.px(3, 6, '#8c6f5a', 2, 1); face.px(0, 0, '#efece6', 8, 2);
    const w = mat(wool()), f = mat(face), s = plain('#cdbba8');
    L = {body:[w, w, w, w, w, w], head:[s, s, mat(wool()), s, f, s], leg:plain('#cdbba8'), w:.75, h:.7, len:1.1, legH:.5, headS:.42, speed:1.4};
  } else {
    const face = pic(8, 8, '#fbfbf7'); face.px(1, 2, '#111'); face.px(6, 2, '#111'); face.px(2, 4, '#f0a12e', 4, 2); face.px(3, 6, '#d12b2b', 2, 2);
    const s = plain('#fbfbf7'), f = mat(face);
    L = {body:[s, s, s, s, s, s], head:[s, s, s, s, f, s], leg:plain('#f0a12e'), w:.35, h:.38, len:.45, legH:.28, headS:.28, speed:1.9};
  }
  return LOOK[kind] = L;
}
export const KINDS = ['cow', 'pig', 'sheep', 'chicken'];

function model(kind){
  const L = look(kind), g = new THREE.Group();
  const bodyM = new THREE.Mesh(new THREE.BoxGeometry(L.w, L.h, L.len), L.body); bodyM.position.y = L.legH + L.h / 2; g.add(bodyM);
  const head = new THREE.Group(); head.position.set(0, L.legH + L.h * (kind === 'chicken' ? 1 : .85), L.len / 2 + (kind === 'chicken' ? -.05 : .05)); g.add(head);
  const hm = new THREE.Mesh(new THREE.BoxGeometry(L.headS, L.headS, L.headS * (kind === 'cow' ? .8 : .9)), L.head); hm.position.set(0, kind === 'chicken' ? L.headS * .5 : 0, L.headS * .35); head.add(hm);
  if (kind === 'cow') for (const x of [-.3, .3]){ const h = new THREE.Mesh(new THREE.BoxGeometry(.08, .14, .08), L.horn); h.position.set(x, .28, .25); head.add(h); }
  if (kind === 'chicken') for (const x of [-.2, .2]){ const wg = new THREE.Mesh(new THREE.BoxGeometry(.06, .22, .3), L.body[0]); wg.position.set(x, L.legH + L.h * .55, 0); g.add(wg); }
  const legs = []; const lw = kind === 'chicken' ? .06 : Math.min(.24, L.w * .32), off = kind === 'chicken' ? [[-.08, 0], [.08, 0]] : [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [a * (L.w / 2 - lw / 2), b * (L.len / 2 - lw / 2 - .02)]);
  for (const [x, z] of off){ const lg = new THREE.Group(); lg.position.set(x, L.legH, z); const m = new THREE.Mesh(new THREE.BoxGeometry(lw, L.legH, lw), L.leg); m.position.y = -L.legH / 2; lg.add(m); g.add(lg); legs.push(lg); }
  return {g, head, legs, L};
}

export function createAnimals(scene, world, rnd = Math.random){
  const list = new Map(); let nid = 1, spawnT = 0, sendT = 0;
  const groundAt = (x, z, y0) => {       // the standing height near y0: on top of the highest solid block at or a little above / below
    for (let y = Math.min(127, Math.floor(y0) + 2); y > Math.floor(y0) - 4; y--){ const b = world.get(x, y - 1, z); if (b < 0) return null; if (b > 0 && SOLID[b]) return world.get(x, y, z) <= 0 || !SOLID[world.get(x, y, z)] ? y : null; }
    return null;
  };
  function add(kind, x, y, z, id){
    const m = model(kind); m.g.position.set(x, y, z); scene.add(m.g);
    const a = {id:id || nid++, kind, x, y, z, yaw:rnd() * 6.28, m, t:rnd() * 3, go:0, run:0, walk:0, tx:x, tz:z, ty:y, tyaw:0};
    list.set(a.id, a); return a;
  }
  function remove(a){ scene.remove(a.m.g); list.delete(a.id); }
  /* host or alone: spawn, think, move */
  function think(dt, people){
    const p0 = people[0];
    // keep about 14 within reach of someone; drop ones far from everyone
    spawnT -= dt;
    if (spawnT <= 0 && p0){
      spawnT = .7;
      for (const a of list.values()) if (!people.some(p => Math.hypot(p.x - a.x, p.z - a.z) < 90)) remove(a);
      if (list.size < 14){
        const p = people[Math.floor(rnd() * people.length)], ang = rnd() * 6.28, d = 24 + rnd() * 40, x = Math.floor(p.x + Math.cos(ang) * d), z = Math.floor(p.z + Math.sin(ang) * d);
        const top = world.surface(x, z), under = top > 0 ? world.get(x, top - 1, z) : -1;
        if (under === B.grass || under === B.grass_snow){
          const kind = KINDS[Math.floor(rnd() * KINDS.length)], n = kind === 'chicken' ? 3 : 2;
          for (let i = 0; i < n && list.size < 16; i++){ const xx = x + (i % 2), zz = z + (i >> 1), y = groundAt(xx, zz, top); if (y != null) add(kind, xx + .5, y, zz + .5); }
        }
      }
    }
    for (const a of list.values()){
      const L = a.m.L;
      // scared: someone close and moving, or a slap
      for (const p of people){ const d = Math.hypot(p.x - a.x, p.z - a.z); if (d < 3.2 && a.run <= 0 && p.moving){ a.run = 2.5; a.yaw = Math.atan2(a.x - p.x, a.z - p.z) + (rnd() - .5); } }
      a.t -= dt;
      if (a.run > 0) a.run -= dt;
      else if (a.t <= 0){ a.go = rnd() < .55 ? 1 : 0; a.t = 1.5 + rnd() * 4; if (a.go) a.yaw += (rnd() - .5) * 2.4; }
      const sp = a.run > 0 ? L.speed * 2.4 : a.go ? L.speed : 0;
      if (sp){
        const nx = a.x + Math.sin(a.yaw) * sp * dt, nz = a.z + Math.cos(a.yaw) * sp * dt, bx = Math.floor(nx + Math.sin(a.yaw) * L.len * .4), bz = Math.floor(nz + Math.cos(a.yaw) * L.len * .4);
        const ny = groundAt(bx, bz, a.y), wet = world.get(bx, Math.floor(a.y), bz);
        if (ny == null || ny - a.y > 1.01 || a.y - ny > 2.01 || LIQUID[wet] || LIQUID[world.get(bx, ny - 1, bz)]){ a.yaw += 1.6 + rnd(); a.t = Math.min(a.t, .4); }
        else { a.x = nx; a.z = nz; const gy = groundAt(Math.floor(a.x), Math.floor(a.z), a.y); if (gy != null) a.ty = gy; }
      }
      a.y += (a.ty - a.y) * Math.min(1, dt * 10);
      a.walk += sp * dt * 3.2; a.moving = sp;
    }
  }
  function draw(dt){
    for (const a of list.values()){
      const g = a.m.g, k = Math.min(1, dt * 12);
      g.position.set(a.x, a.y, a.z);
      let dy = a.yaw - g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); g.rotation.y += dy * k;
      const sw = Math.sin(a.walk) * (a.moving ? .55 : 0);
      a.m.legs.forEach((l, i) => l.rotation.x = (i % 2 === (i >> 1) % 2 ? sw : -sw));
      a.m.head.rotation.x = !a.moving && a.kind !== 'chicken' ? .45 + Math.sin(performance.now() / 500 + a.id) * .1 : 0;       // grazing
    }
  }
  return {
    list,
    update(dt, people, host){ if (host) think(dt, people); draw(dt); },
    /* someone hit one: it runs from them */
    slap(a, from){ a.run = 3; a.yaw = Math.atan2(a.x - from.x, a.z - from.z); a.ty = a.y + .6; a.y += .5; },
    /* the one in front of you, if it is nearer than the block you are looking at */
    pick(o, dir, max){
      let best = null, bt = max;
      for (const a of list.values()){
        const L = a.m.L, r = Math.max(L.w, L.len) / 2 + .1, cx = a.x - o.x, cy = a.y + L.legH + L.h / 2 - o.y, cz = a.z - o.z;
        const t = cx * dir.x + cy * dir.y + cz * dir.z; if (t < 0 || t > bt) continue;
        const dx = cx - dir.x * t, dy = cy - dir.y * t, dz = cz - dir.z * t; if (dx * dx + dy * dy + dz * dz < r * r){ best = a; bt = t; }
      }
      return best;
    },
    /* for friends: [id, kind, x, y, z, yaw, moving] */
    state(){ return [...list.values()].map(a => [a.id, KINDS.indexOf(a.kind), +a.x.toFixed(2), +a.y.toFixed(2), +a.z.toFixed(2), +a.yaw.toFixed(2), a.moving ? 1 : 0]); },
    apply(s){
      const seen = new Set();
      for (const [id, k, x, y, z, yaw, mv] of s){
        seen.add(id); let a = list.get(id);
        if (!a){ a = add(KINDS[k] || 'pig', x, y, z, id); a.yaw = yaw; }
        a.tx = x; a.tz = z; a.ty2 = y; a.tyaw = yaw; a.moving = mv; a.remote = true;
      }
      for (const a of [...list.values()]) if (!seen.has(a.id)) remove(a);
    },
    follow(dt){       // friends: glide towards where the host says they are
      for (const a of list.values()) if (a.remote){ const k = Math.min(1, dt * 8); const ox = a.x, oz = a.z; a.x += (a.tx - a.x) * k; a.z += (a.tz - a.z) * k; a.y += (a.ty2 - a.y) * k; a.yaw = a.tyaw; a.walk += Math.hypot(a.x - ox, a.z - oz) * 3.2; }
    },
    clear(){ for (const a of [...list.values()]) remove(a); }
  };
}
