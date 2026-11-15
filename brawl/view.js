/* Break Room Brawl: the 3D arena. Draws whatever entity list it is handed (the live sim, or a host's snapshot)
   and turns sim events into effects. It never decides anything about the game. */
import * as THREE from 'three';
import { RoomEnvironment } from '../chess/vendor/RoomEnvironment.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { EffectComposer } from './vendor/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/postprocessing/OutputPass.js';
import { makeModel, basketball, M, TEAM, TX, outline } from './models.js?v=1114j';
import { UNITS, MAPS } from './cards.js';
import { W, L, RIVER } from './sim.js';

const PI = Math.PI, clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
const angTo = (a, b, k) => { let d = (b - a) % (PI * 2); if (d > PI) d -= PI * 2; if (d < -PI) d += PI * 2; return a + d * k; };

const LOOK = {
  court:   {bg:0x0a1838, apron:0x12244f, water:0x2f9bff, bridge:0xb9864a, wall:0xf2c14e, sun:1.7},
  casino:  {bg:0x1a0616, apron:0x2a0a22, water:0x38e0ff, bridge:0xc8a03c, wall:0xf2c14e, sun:1.45},
  breakrm: {bg:0x0f2028, apron:0x1c3540, water:0x5a3418, bridge:0xcfd5e2, wall:0xcfd5e2, sun:1.7},
  field:   {bg:0x14351c, apron:0x3f8a36, water:0x2fa8ff, bridge:0xb9864a, wall:0x9aa3b5, sun:1.85},
  lot:     {bg:0x05070d, apron:0x12151c, water:0, bridge:0, wall:0xf2c14e, sun:1.1}
};

/* ---------- the floor, painted per map ---------- */
const THEME = {
  field:   {a:'#8bd24d', b:'#82ca47', path:'#e6cd95', edge:'#a98744', pad:'#d6dbe5', blot:['#c2ee78', '#4f9e2c'], style:'grass'},
  court:   {a:'#dba768', b:'#d39d5d', path:'#f3dfb2', edge:'#a8763a', pad:'#d6dbe5', blot:['#f6d49a', '#a87036'], style:'wood'},
  casino:  {a:'#86214c', b:'#7a1c45', path:'#e6c25a', edge:'#8f6a18', pad:'#dccbe8', blot:['#b23a74', '#3f0c24'], style:'carpet'},
  breakrm: {a:'#f0ebdd', b:'#b9e0d2', path:'#d0d6e0', edge:'#8791a3', pad:'#e9ecf3', blot:['#ffffff', '#8fb0a6'], style:'tile'},
  lot:     {a:'#474d5b', b:'#434956', path:'#5f6675', edge:'#f2c14e', pad:'#b0b7c5', blot:['#6a7182', '#23272f'], style:'asphalt'}
};
function hexA(hex, a){ const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${a})`; }
/* soft patches of light and dark, so a painted surface never reads as flat, tiled or pixelly */
function blots(x, w, h, n, cols, rMin, rMax, alpha, seed = 7){
  let a = seed * 2654435761 >>> 0; const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  for (let i = 0; i < n; i++){ const cx = r() * w, cy = r() * h, rad = rMin + r() * (rMax - rMin), g = x.createRadialGradient(cx, cy, 0, cx, cy, rad), c = cols[i % cols.length];
    g.addColorStop(0, hexA(c, alpha)); g.addColorStop(1, hexA(c, 0)); x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); }
  return r;
}
function groundTex(id){
  const S = 72, w = 18 * S, h = 2 * L * S, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), X = v => (v + 9) * S, Z = v => (v + L) * S, T = THEME[id], map = MAPS[id];
  if (T.style === 'wood'){                               // long planks with staggered joints
    for (let i = 0; i < 36; i++){ x.fillStyle = i % 2 ? T.a : T.b; x.fillRect(i * w / 36, 0, w / 36 + 1, h); x.fillStyle = 'rgba(90,50,10,.16)'; x.fillRect(i * w / 36, 0, 1.5, h); for (let k = (i * 5) % 7; k < 2 * L; k += 7){ x.fillRect(i * w / 36, k * S, w / 36, 1.5); } }
  } else for (let r = 0; r < L; r++) for (let q = 0; q < 9; q++){ x.fillStyle = (q + r) % 2 ? T.a : T.b; x.fillRect(q * S * 2, r * S * 2, S * 2, S * 2); }
  if (T.style === 'tile'){ x.strokeStyle = 'rgba(60,80,90,.28)'; x.lineWidth = 3; for (let q = 0; q <= 9; q++){ x.beginPath(); x.moveTo(q * S * 2, 0); x.lineTo(q * S * 2, h); x.stroke(); } for (let r = 0; r <= L; r++){ x.beginPath(); x.moveTo(0, r * S * 2); x.lineTo(w, r * S * 2); x.stroke(); } }
  const rnd = blots(x, w, h, 90, T.blot, S * 1.2, S * 3.6, T.style === 'grass' ? .16 : .1);
  if (T.style === 'grass'){                              // blades: short curved strokes, lighter and darker than the turf
    x.lineCap = 'round';
    for (let i = 0; i < 900; i++){ const gx = rnd() * w, gy = rnd() * h, len = 5 + rnd() * 9; x.strokeStyle = i % 3 ? 'rgba(60,130,36,.33)' : 'rgba(205,245,130,.38)'; x.lineWidth = 2 + rnd() * 1.5; x.beginPath(); x.moveTo(gx, gy); x.quadraticCurveTo(gx + (rnd() - .5) * 8, gy - len * .6, gx + (rnd() - .5) * 10, gy - len); x.stroke(); }
  }
  if (id === 'court'){ x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 7; x.beginPath(); x.arc(X(0), Z(0), 3.2 * S, 0, 7); x.stroke(); for (const sz of [1, -1]){ x.beginPath(); x.arc(X(0), Z(sz * (L - 1)), 7 * S, sz > 0 ? PI : 0, sz > 0 ? PI * 2 : PI); x.stroke(); } }
  if (id === 'lot'){ x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 6; for (const sx of [-1, 1]) for (let r = -14; r <= 14; r += 2.6){ if (Math.abs(r) < 2) continue; x.beginPath(); x.moveTo(X(sx * 9), Z(r)); x.lineTo(X(sx * 7.2), Z(r)); x.stroke(); } }
  // lanes: one down to every crossing, one across each back line, one stem to each king
  const lx = map.bridges.length ? map.bridges.map(b => b.x) : [-5.5, 5.5], wide = Math.max(5.5, ...lx.map(Math.abs)) + .85, rects = [];
  for (const v of lx){ const bw = map.bridges.length ? Math.min(1.25, map.bridges.find(b => b.x === v).w / 2 - .2) : .85; rects.push([v - bw, -(L - 5.7), v + bw, L - 5.7]); }
  for (const sz of [-1, 1]){ const pz = sz * (L - 6.5), kz = sz * (L - 2.4); rects.push([-wide, pz - .85, wide, pz + .85]); rects.push([-.85, Math.min(pz, kz), .85, Math.max(pz, kz)]); }
  const rr = (a, b, c2, d, g, col) => { x.fillStyle = col; x.beginPath(); x.roundRect(X(a - g), Z(b - g), (c2 - a + g * 2) * S, (d - b + g * 2) * S, S * .32); x.fill(); };
  x.shadowColor = 'rgba(0,0,0,.3)'; x.shadowBlur = S * .3; for (const r of rects) rr(...r, .1, T.edge); x.shadowBlur = 0;
  for (const r of rects) rr(...r, 0, T.path);
  x.save(); x.beginPath(); for (const r of rects) x.roundRect(X(r[0]), Z(r[1]), (r[2] - r[0]) * S, (r[3] - r[1]) * S, S * .32); x.clip();
  blots(x, w, h, 260, ['#ffffff', T.edge], S * .25, S * 1.1, .2, 11);
  for (let i = 0; i < 520; i++){ x.fillStyle = i % 2 ? 'rgba(255,255,255,.2)' : 'rgba(70,45,10,.14)'; x.beginPath(); x.arc(rnd() * w, rnd() * h, 1.5 + rnd() * 3.2, 0, 7); x.fill(); }
  x.restore();
  // baked shade: under the walls, along the banks and around each tower
  const shade = (x0, y0, x1, y1, gx0, gy0, gx1, gy1, a) => { const g = x.createLinearGradient(gx0, gy0, gx1, gy1); g.addColorStop(0, `rgba(10,20,10,${a})`); g.addColorStop(1, 'rgba(10,20,10,0)'); x.fillStyle = g; x.fillRect(x0, y0, x1 - x0, y1 - y0); };
  const B = S * 1.7; shade(0, 0, B, h, 0, 0, B, 0, .3); shade(w - B, 0, w, h, w, 0, w - B, 0, .3); shade(0, 0, w, B, 0, 0, 0, B, .3); shade(0, h - B, w, h, 0, h, 0, h - B, .3);
  if (map.river) for (const sz of [-1, 1]){ const y0 = Z(sz * RIVER), y1 = Z(sz * (RIVER + 1)); shade(0, Math.min(y0, y1), w, Math.max(y0, y1), 0, y0, 0, y1, .26); }
  const pad = (a, b, r) => { x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = S * .5; x.shadowOffsetY = S * .1; x.fillStyle = T.pad; x.beginPath(); x.arc(X(a), Z(b), r * S, 0, 7); x.fill(); x.shadowBlur = 0; x.shadowOffsetY = 0;
    const g = x.createRadialGradient(X(a), Z(b), r * S * .3, X(a), Z(b), r * S); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(120,130,150,.25)'); x.fillStyle = g; x.beginPath(); x.arc(X(a), Z(b), r * S, 0, 7); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 5; x.beginPath(); x.arc(X(a), Z(b), r * S - 9, 0, 7); x.stroke(); };
  for (const sz of [-1, 1]){ pad(0, sz * (L - 3), 2.25); pad(-5.5, sz * (L - 6.5), 1.65); pad(5.5, sz * (L - 6.5), 1.65); }
  if (id === 'field') for (let i = 0; i < 60; i++){ const fx = rnd() * w, fz = rnd() * h, pr = 3 + rnd() * 2; x.fillStyle = i % 3 ? '#ffffff' : '#ffe27a'; for (let k = 0; k < 5; k++){ x.beginPath(); x.arc(fx + Math.cos(k * 1.257) * pr * 1.5, fz + Math.sin(k * 1.257) * pr * 1.5, pr, 0, 7); x.fill(); } x.fillStyle = '#ffb02e'; x.beginPath(); x.arc(fx, fz, pr * .8, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; return t;
}

export function createView(el, opt = {}){
  const low = !!opt.low;
  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .86;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, .5, 220);
  { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose(); }
  scene.environmentIntensity = .55;
  const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x3a2c22, .6), sun = new THREE.DirectionalLight(0xfff0dc, 1.7);
  sun.position.set(7, 20, 8); sun.castShadow = true; sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  Object.assign(sun.shadow.camera, {left:-17, right:17, top:23, bottom:-23, near:1, far:70}); sun.shadow.bias = -.0006; sun.shadow.normalBias = .03; sun.shadow.radius = 3;
  scene.add(hemi, sun);
  /* bloom on anything brighter than white (spells, fire, lamps, the Legendary beam). Desktop only; phones draw straight to the screen. */
  let composer = null;
  if (!low && !opt.noFx && renderer.capabilities.isWebGL2){
    try {
      composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, {type:THREE.HalfFloatType, samples:4}));
      composer.addPass(new RenderPass(scene, camera)); composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), .5, .55, 1.0)); composer.addPass(new OutputPass());
    } catch(e){ composer = null; }
  }
  const root = new THREE.Group(), stage = new THREE.Group(), fxW = new THREE.Group(), bars = new THREE.Group();
  scene.add(stage, root, fxW, bars);
  let me = 0, mapId = 'court', time = 0, shakeAmt = 0, lostGL = false;
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); lostGL = true; });
  renderer.domElement.addEventListener('webglcontextrestored', () => { lostGL = false; });

  /* ---------- camera ---------- */
  let side = false;
  const camHome = new THREE.Vector3(), LOOKAT = new THREE.Vector3(0, 0, .8), fitCam = new THREE.PerspectiveCamera(), tv = new THREE.Vector3();
  const FIT = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) FIT.push(new THREE.Vector3(sx * 10.3, 0, sz * (L + 1.3))); FIT.push(new THREE.Vector3(0, 4.9, -(L - 2.4)), new THREE.Vector3(-9.9, 3.2, -L), new THREE.Vector3(9.9, 3.2, -L)); FIT.push(new THREE.Vector3(0, 4.9, L - 2.4), new THREE.Vector3(-9.9, 3.2, L), new THREE.Vector3(-5.5, 3.4, L - 6.5), new THREE.Vector3(-5.5, 3.4, 6.5 - L));
  function fit(){
    const a = camera.aspect;
    side = a >= 1.2;                                  // wide screens watch from the sideline (the angle of the opening fly-in); tall ones from behind your king
    const el = side ? lerp(.78, .66, clamp((a - 1.2) / 1.4, 0, 1)) : lerp(1.0, .9, clamp((a - .55) / .5, 0, 1));
    const dir = side ? new THREE.Vector3(Math.cos(el), Math.sin(el), 0) : new THREE.Vector3(0, Math.sin(el), Math.cos(el));
    LOOKAT.set(0, 0, side ? 0 : .8);
    fitCam.fov = camera.fov; fitCam.aspect = a; fitCam.near = 1; fitCam.far = 300; fitCam.updateProjectionMatrix();
    let lo = 8, hi = 160;
    for (let i = 0; i < 22; i++){
      const d = (lo + hi) / 2;
      fitCam.position.copy(dir).multiplyScalar(d).add(LOOKAT); fitCam.lookAt(LOOKAT); fitCam.updateMatrixWorld(); fitCam.matrixWorldInverse.copy(fitCam.matrixWorld).invert();
      if (FIT.every(p => { tv.copy(p).project(fitCam); return Math.abs(tv.x) < .97 && tv.y < .97 && tv.y > -.94; })) hi = d; else lo = d;
    }
    camHome.copy(dir).multiplyScalar(hi).add(LOOKAT); camDir.copy(dir); camDist = hi;
  }
  /* the player can drag the view around and zoom in; pan is kept inside the arena */
  const camDir = new THREE.Vector3(0, .8, .6), look = new THREE.Vector3(), home = new THREE.Vector3(); let camDist = 60, zoomK = 1, panX = 0, panZ = 0;
  const clampPan = () => { const k = 1 - 1 / zoomK; panX = clamp(panX, -11 * k, 11 * k); panZ = clamp(panZ, -(L + 3) * k, (L + 1) * k); };
  function zoomBy(f){ zoomK = clamp(zoomK * f, 1, 4.2); clampPan(); }
  function panBy(dx, dz){ panX += dx; panZ += dz; clampPan(); }
  function resetCam(){ zoomK = 1; panX = panZ = 0; }
  function resize(){
    const w = el.clientWidth || 2, h = el.clientHeight || 2;
    renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    if (composer){ composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
    camera.aspect = w / h; camera.updateProjectionMatrix(); fit();
  }

  /* ---------- particles: two pools (glow and smoke) ---------- */
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, '#fff'); g.addColorStop(.4, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  function pool(n, size, add){
    const pos = new Float32Array(n * 3).fill(999), col = new Float32Array(n * 4), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({size, map:dot, vertexColors:true, transparent:true, depthWrite:false, blending:add ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation:true}));
    if (add && composer) pts.material.color.setScalar(2.2);
    pts.frustumCulled = false; root.add(pts);
    const P = Array.from({length:n}, () => ({l:0})); let head = 0, live = 0;
    return {
      emit(x, y, z, vx, vy, vz, life, c, grav){ const p = P[head], i = head; head = (head + 1) % n; if (p.l <= 0) live++; p.l = p.m = life; p.vx = vx; p.vy = vy; p.vz = vz; p.g = grav; pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; col[i * 4] = c.r; col[i * 4 + 1] = c.g; col[i * 4 + 2] = c.b; col[i * 4 + 3] = 1; },
      step(dt){
        if (!live) return;
        for (let i = 0; i < n; i++){ const p = P[i]; if (p.l <= 0) continue; p.l -= dt;
          if (p.l <= 0){ pos[i * 3 + 1] = 999; col[i * 4 + 3] = 0; live--; continue; }
          p.vy -= p.g * dt; pos[i * 3] += p.vx * dt; pos[i * 3 + 1] += p.vy * dt; pos[i * 3 + 2] += p.vz * dt;
          if (pos[i * 3 + 1] < .04 && p.g > 0){ pos[i * 3 + 1] = .04; p.vy *= -.35; p.vx *= .6; p.vz *= .6; }
          col[i * 4 + 3] = Math.min(1, p.l / p.m * 1.6); }
        g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
      },
      clear(){ for (let i = 0; i < n; i++){ P[i].l = 0; pos[i * 3 + 1] = 999; col[i * 4 + 3] = 0; } live = 0; g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; }
    };
  }
  const HDR = composer ? 2.2 : 1;      // with bloom on, glowing things are drawn brighter than white so they bleed light
  const glow = pool(low ? 320 : 640, .34, true), smoke = pool(low ? 140 : 260, .9, false), tc = new THREE.Color();
  function burst(x, y, z, n, color, o = {}){
    const sys = o.smoke ? smoke : glow, sp = o.spd ?? 3, up = o.up ?? 2.5; tc.set(color);
    if (low) n = Math.ceil(n * .6);
    for (let i = 0; i < n; i++){ const a = Math.random() * PI * 2, r = sp * (.35 + Math.random() * .65); sys.emit(x + (Math.random() - .5) * (o.spread || .2), y, z + (Math.random() - .5) * (o.spread || .2), Math.cos(a) * r, up * (.3 + Math.random() * .9), Math.sin(a) * r, (o.life ?? .6) * (.6 + Math.random() * .7), tc, o.grav ?? 7); }
  }

  /* ---------- flat ground effects ---------- */
  const ringG = new THREE.RingGeometry(.9, 1, 56), discG = new THREE.CircleGeometry(1, 48), flats = [];
  function flat(x, z, o){             // o: {r0, r1, dur, color, fill, a, delay, pulse}
    const m = new THREE.Mesh(o.fill ? discG : ringG, new THREE.MeshBasicMaterial({color:o.color, transparent:true, opacity:0, depthWrite:false, blending:o.add ? THREE.AdditiveBlending : THREE.NormalBlending}));
    if (o.add) m.material.color.multiplyScalar(1 + (HDR - 1) * .6);
    m.rotation.x = -PI / 2; m.position.set(x, .05 + flats.length % 5 * .004, z); m.visible = false; root.add(m);
    flats.push({m, t:-(o.delay || 0), ...o}); return m;
  }
  function stepFlats(dt){
    for (let i = flats.length - 1; i >= 0; i--){
      const f = flats[i]; f.t += dt;
      if (f.t < 0) continue;
      const k = f.t / f.dur;
      if (k >= 1){ root.remove(f.m); f.m.material.dispose(); flats.splice(i, 1); continue; }
      f.m.visible = true; f.m.scale.setScalar(lerp(f.r0, f.r1 ?? f.r0, 1 - (1 - k) * (1 - k)));
      f.m.material.opacity = (f.a ?? .8) * (f.hold ? Math.min(1, k * 8, (1 - k) * 5) : 1 - k) * (f.pulse ? .7 + Math.sin(time * 9) * .3 : 1);
    }
  }

  /* ---------- the map ---------- */
  function box(par, w, h, d, col, x, y, z, o){ const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(col, o)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; par.add(m); return m; }
  let waterTex = null;
  const tiny = (k, w, h, draw, rx, ry) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t; };
  const speck = (x, w, h, n, cols, sz) => { for (let i = 0; i < n; i++){ x.fillStyle = cols[i % cols.length]; x.fillRect((i * 7919) % w, (i * 104729) % h, sz + i % 3, sz + (i * 5) % 3); } };
  function apronTex(id){
    const base = {field:'#3f9434', court:'#122a5e', casino:'#2a0a22', breakrm:'#6b848f', lot:'#1d2028'}[id], bl = {field:['#63b84a', '#2c7a26'], court:['#1c3d82', '#0a1a40'], casino:['#4a1440', '#16040f'], breakrm:['#86a0aa', '#52686f'], lot:['#2c313c', '#111318']}[id];
    return tiny('ap' + id, 512, 512, (x, w, h) => { x.fillStyle = base; x.fillRect(0, 0, w, h); blots(x, w, h, 46, bl, 50, 150, .5, 3); blots(x, w, h, 30, bl, 20, 60, .35, 5); }, 5, 5);
  }
  function setMap(id){
    mapId = id; flags.length = 0; sway.length = 0;
    for (const c of stage.children.slice()){ stage.remove(c); c.traverse(o => { if (o.geometry && !o.userData.keep) o.geometry.dispose(); }); }
    const lk = LOOK[id], map = MAPS[id];
    scene.background = new THREE.Color(lk.bg); scene.fog = new THREE.Fog(lk.bg, 70, 150); sun.intensity = lk.sun; hemi.intensity = id === 'lot' ? .45 : .7;
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(18, 2 * L), new THREE.MeshStandardMaterial({map:groundTex(id), roughness:.9, envMapIntensity:.15}));
    gm.rotation.x = -PI / 2; gm.receiveShadow = true; stage.add(gm);
    const ap = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshStandardMaterial({map:apronTex(id), roughness:.95, envMapIntensity:.1})); ap.rotation.x = -PI / 2; ap.position.y = -.08; ap.receiveShadow = true; stage.add(ap);
    // a chunky stone frame with corner posts, banners in each side's colour
    const stone = id === 'casino' ? 0x6a3a7a : id === 'lot' ? 0x8b8f99 : 0xb9c0cf, cap = id === 'casino' ? 0xf2c14e : 0xdfe4ee;
    for (const sx of [-1, 1]){ box(stage, 1.1, .8, 2 * L + 2.3, stone, sx * 9.56, .32, 0); box(stage, 1.3, .2, 2 * L + 2.5, cap, sx * 9.56, .78, 0); }
    for (const sz of [-1, 1]){ box(stage, 20.2, .8, 1.1, stone, 0, .32, sz * (L + .56)); box(stage, 20.4, .2, 1.3, cap, 0, .78, sz * (L + .56)); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]){
      const col = TEAM[sz > 0 ? 0 : 1], post = new THREE.Mesh(new THREE.CylinderGeometry(.85, .95, 1.7, 14), M(stone)); post.position.set(sx * 9.56, .85, sz * (L + .56)); post.castShadow = true; stage.add(post);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.1, 14), M(col)); roof.position.set(sx * 9.56, 2.25, sz * (L + .56)); roof.castShadow = true; stage.add(roof);
      box(stage, .08, 1.5, .08, 0xdfe4ee, sx * 6, 1.6, sz * (L + .56)); flags.push(box(stage, .9, .6, .06, col, sx * 6 + .5, 2.05, sz * (L + .56)));
    }
    waterTex = null;
    if (map.river){
      const wc = '#' + lk.water.toString(16).padStart(6, '0');
      waterTex = tiny('w' + id, 256, 64, (x, w, h) => { x.fillStyle = wc; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(255,255,255,.4)'; x.lineWidth = 3; x.lineCap = 'round';
        for (let i = 0; i < 9; i++){ const y = 8 + (i * 23) % 50, x0 = (i * 61) % 256; x.beginPath(); x.moveTo(x0, y); x.quadraticCurveTo(x0 + 14, y - 5, x0 + 28, y); x.quadraticCurveTo(x0 + 42, y + 5, x0 + 56, y); x.stroke(); }
        x.fillStyle = 'rgba(0,0,0,.14)'; x.fillRect(0, 0, w, 7); x.fillRect(0, h - 7, w, 7); }, 5, 1);
      const wm = new THREE.Mesh(new THREE.PlaneGeometry(18, RIVER * 2), new THREE.MeshStandardMaterial({map:waterTex, roughness:.15, envMapIntensity:.4, emissive:lk.water, emissiveIntensity:id === 'breakrm' ? .04 : .2})); wm.rotation.x = -PI / 2; wm.position.y = .03; wm.receiveShadow = true; stage.add(wm);
      for (const sz of [-1, 1]){ box(stage, 18, .26, .34, id === 'field' ? 0x8a6a3f : stone, 0, .02, sz * (RIVER + .12)); }
      const wood = tiny('plank' + id, 128, 64, (x, w, h) => { const base = id === 'casino' ? [200, 160, 60] : id === 'breakrm' ? [200, 208, 220] : [185, 134, 74]; for (let i = 0; i < 8; i++){ const v = (i * 37 % 5) * 7 - 14; x.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v})`; x.fillRect(i * 16, 0, 15, h); x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(i * 16 + 15, 0, 1, h); } }, 1, 1);
      for (const b of map.bridges){
        wood.repeat.set(Math.max(1, Math.round(b.w / 2.6)), 1);
        const deck = new THREE.Mesh(new THREE.BoxGeometry(b.w, .3, RIVER * 2 + .9), new THREE.MeshStandardMaterial({map:wood, roughness:.8, envMapIntensity:.15})); deck.position.set(b.x, .0, 0); deck.castShadow = deck.receiveShadow = true; stage.add(deck);
        for (const sx of [-1, 1]){ box(stage, .2, .2, RIVER * 2 + 1.1, 0x6b4426, b.x + sx * (b.w / 2 - .08), .62, 0); for (const sz of [-1, 0, 1]) box(stage, .26, .7, .26, 0x8a5a2a, b.x + sx * (b.w / 2 - .08), .35, sz * (RIVER + .35)); }
      }
    }
    decor(id);
    if (side){ const d = stage.children[stage.children.length - 1]; for (const c of d.children.slice()) if (c.position.x > 9.8 || c.userData.near) d.remove(c); }      // nothing between the sideline camera and the field
    for (const c of stage.children[stage.children.length - 1].children) if (Math.abs(c.position.z) > 16.2) c.position.z += Math.sign(c.position.z) * (L - 16);   // scenery beyond the ends moves out with them
  }
  function decor(id){
    const d = new THREE.Group(); stage.add(d);
    if (id === 'field'){
      scenery(d, id, function build(put){
        const lib = build.lib, T = 3, B = 2.6, R = PI / 2, sw = {sway:true}, ex = {extra:true}, tall = {tall:true}, E = L;
        // the far sideline: his village up the field, yours down it
        put('trees_A_large', -14, -15.5, T, .4, sw); put('tree_single_A', -11.7, -12.6, T * 1.1, 0, sw); put('building_barracks_red', -14.2, -9.8, B, R);
        put('target', -11.5, -8.2, T, R); put('weaponrack', -11.5, -10.9, T, R); put('building_blacksmith_red', -14, -4.6, B, R); put('crate_A_big', -11.6, -5.6, T, .3); put('barrel', -11.7, -3.4, T);
        put('tree_single_B', -12, -1.4, T, 1, sw); put('rock_single_E', -11.3, .4, T * 1.2); put('building_market_blue', -13.8, 3.4, B, R); put('sack', -11.6, 2.2, T); put('crate_B_small', -11.5, 4.6, T, .5);
        put('building_well_blue', -12.1, 6.6, B * .8); put('building_tavern_blue', -14.2, 9.6, B, R); put('barrel', -11.7, 8.4, T); put('barrel', -11.9, 10.9, T); put('building_windmill_blue', -14.6, 14.2, B * 1.3, R - .3);
        put('tree_single_A', -11.8, 16.6, T, 2, sw); put('building_home_A_blue', -17.6, 6.4, B, R + .2, ex); put('building_home_B_red', -17.6, -7.2, B, R - .2, ex);
        put('hills_A_trees', -20.5, -14, 4.4, .5, ex); put('trees_A_medium', -19, -1, T * 1.1, 1, {extra:true, sway:true}); put('hills_B_trees', -20.5, 12.5, 4.4, 2, ex); put('trees_B_medium', -19.2, 18.5, T, 3, {extra:true, sway:true});
        put('mountain_A_grass_trees', -29, -8, 7.5, .3, ex); put('mountain_B_grass', -29, 9, 7, 1.2, ex); put('mountain_A_grass_trees', -32, 27, 8.5, 2, ex); put('mountain_B_grass', -31, -27, 8.5, 0, ex);
        // the near sideline (only tall screens see it)
        put('trees_B_large', 14, -15, T, 1, sw); put('tent', 12.3, -10.5, T * 1.25, -.4); put('tent', 13.8, -7.6, T * 1.25, .6); put('barrel', 11.6, -8.6, T); put('building_home_B_red', 14.4, -3, B, -R);
        put('tree_single_B', 12, .6, T, 2, sw); put('rock_single_C', 11.4, 2.6, T * 1.3); put('building_home_A_blue', 14.4, 5, B, -R); put('wheelbarrow', 11.7, 7.4, T, .7); put('bucket_water', 11.5, 9, T);
        put('trees_A_large', 14.2, 13.5, T, 3, sw); put('hills_A_trees', 20.5, -8, 4.4, 2.4, ex); put('hills_B_trees', 20.5, 10, 4.4, .7, ex);
        // his end: the red castle looms over his king
        put('building_castle_red', 0, -(E + 8), 2.6, 0, tall); put('building_tower_A_red', -7.6, -(E + 4.6), 2.5, 0, tall); put('building_tower_A_red', 7.6, -(E + 4.6), 2.5, 0, tall);
        put('trees_A_large', -13, -(E + 5.5), T, 2, sw); put('trees_B_large', 13, -(E + 5.5), T, 0, sw); put('flag_red', -3.4, -(E + 2.4), T * 1.4); put('flag_red', 3.4, -(E + 2.4), T * 1.4);
        put('mountain_B_grass', -10, -(E + 22), 9, 1, ex); put('mountain_A_grass_trees', 11, -(E + 24), 10, 2.2, ex);
        // your end: tents and supplies, with your castle behind them when the camera is on the sideline
        put('building_castle_blue', 0, E + 8, 2.6, PI, tall); put('building_tower_A_blue', -7.6, E + 4.6, 2.5, PI, tall); put('building_tower_A_blue', 7.6, E + 4.6, 2.5, PI, tall);
        put('trees_B_large', -13, E + 5.5, T, 1, {tall:true, sway:true}); put('trees_A_large', 13, E + 5.5, T, 2.5, {tall:true, sway:true});
        // the strip in front of the sideline camera: low things only
        const lo = {low:true, sideOnly:true};
        put('hill_single_A', 11.8, -15.5, T * 1.3, .5, lo); put('rock_single_E', 11, -12.4, T * 1.3, 1, lo); put('barrel', 10.9, -9.8, T, 0, lo); put('crate_A_big', 11.6, -9.2, T, .4, lo); put('sack', 10.9, -6.4, T, 0, lo);
        put('rock_single_C', 12.2, -4.2, T * 1.5, 2, lo); put('hill_single_A', 12.4, -.6, T * 1.2, 2.6, lo); put('wheelbarrow', 11, 2.2, T, .8, lo); put('bucket_water', 10.9, 4.4, T, 0, lo); put('rock_single_A', 11.9, 6.6, T * 1.6, 0, lo);
        put('crate_B_small', 10.9, 8.8, T, .3, lo); put('barrel', 11.4, 9.6, T, 0, lo); put('hill_single_A', 12, 12.8, T * 1.3, 4, lo); put('rock_single_E', 11, 15.6, T * 1.2, 3, lo); put('weaponrack', 10.9, -2.6, T, -R, lo); put('target', 10.9, 11.4, T, -R, lo);
        const kinds = ['trees_A_large', 'trees_B_large', 'trees_A_medium', 'trees_B_medium', 'hills_A_trees', 'hills_B_trees'], spots = kinds.map(() => []);
        let sd = 99; const rn = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
        for (let gx = -60; gx <= 60; gx += 6) for (let gz = -72; gz <= 72; gz += 6){
          const px = gx + (rn() - .5) * 3.4, pz = gz + (rn() - .5) * 3.4, inField = Math.abs(px) < 17 && Math.abs(pz) < E + 12, village = px < -9 && px > -24 && Math.abs(pz) < E + 3, near = side ? px > 8 : pz > E - 2;
          if (inField || village || near || (px < -24 && px > -36 && Math.abs(pz) < 32)) continue;
          if (low && (Math.abs(px) > 38 || Math.abs(pz) > 46 || rn() < .35)) continue;
          spots[Math.floor(rn() * kinds.length)].push([px, pz, T * (1 + rn() * .5) * (Math.hypot(px, pz) > 45 ? 1.5 : 1), rn() * 6.28]);
        }
        kinds.forEach((k, i) => scatter(d, lib, k, spots[i]));
        put('tent', -4.6, E + 3.3, T * 1.2, .3); put('tent', 4.8, E + 3.5, T * 1.2, -.5); put('barrel', -2.4, E + 2.5, T); put('crate_A_big', 2.6, E + 2.6, T, .4); put('flag_blue', -7.2, E + 2.3, T * 1.4); put('flag_blue', 7.2, E + 2.3, T * 1.4); put('rock_single_A', 0, E + 3.4, T * 1.4);
      });
    } else if (id === 'court'){
      for (const sx of [-1, 1]){
        for (let i = 0; i < 4; i++) box(d, 2.2, .7 + i * .7, 30, i % 2 ? 0x1b2f66 : 0x16264f, sx * (11 + i * 2.1), .35 + i * .35, 0, {r:.9});
        const n = low ? 60 : 150, im = new THREE.InstancedMesh(new THREE.SphereGeometry(.34, 8, 6), new THREE.MeshStandardMaterial({roughness:.8}), n), mt = new THREE.Matrix4(), cl = new THREE.Color(), pal = [0xff8a2b, 0xf2c14e, 0x4fb3ff, 0xffffff, 0xff5a4a, 0x4ade80];
        for (let i = 0; i < n; i++){ const row = i % 4; mt.makeTranslation(sx * (11 + row * 2.1 + (i * 13 % 7) * .1), 1.1 + row * .7, -14 + (i * 7919 % 2800) / 100); im.setMatrixAt(i, mt); im.setColorAt(i, cl.set(pal[i * 5 % 6])); }
        im.userData.near = sx > 0; d.add(im); crowd.push(im);
      }
      for (const sz of [-1, 1]){ box(d, .3, 5, .3, 0x39425a, 0, 2.5, sz * 18.4, {m:.5}); box(d, 3.4, 2.2, .14, 0xf6f7fb, 0, 5.2, sz * 17.9, {r:.4}); const r = new THREE.Mesh(new THREE.TorusGeometry(.5, .06, 8, 20), M(0xff5a1f)); r.rotation.x = PI / 2; r.position.set(0, 4.5, sz * 17.2); d.add(r); }
    } else if (id === 'casino'){
      const cols = [0xff3d7f, 0x38e0ff, 0xf2c14e, 0x4ade80, 0xc77dff];
      for (const sx of [-1, 1]) for (let i = 0; i < 7; i++){
        const g = new THREE.Group(); g.position.set(sx * 11.2, 0, -13.5 + i * 4.5); g.rotation.y = -sx * PI / 2; d.add(g);
        box(g, 1.5, 2.6, 1.2, 0x241036, 0, 1.3, 0, {r:.5}); box(g, 1.2, .9, .06, cols[i % 5], 0, 1.8, .62, {e:cols[i % 5], ei:1.1}); box(g, 1.3, .5, .5, 0x3a1a52, 0, .95, .5, {r:.4}); box(g, 1.6, .36, 1.3, cols[(i + 2) % 5], 0, 2.78, 0, {e:cols[(i + 2) % 5], ei:.8});
      }
      for (const sz of [-1, 1]) for (let i = -1; i <= 1; i++){ const r = new THREE.Mesh(new THREE.TorusGeometry(1.5, .1, 8, 32), M(cols[(i + 2) % 5], {e:cols[(i + 2) % 5], ei:1.6})); r.position.set(i * 5.5, 3.4, sz * 19); d.add(r); }
      scenery(d, id, function build(put){
        const K = 1.15, R = PI / 2, E = L, ex = {extra:true}, tall = {tall:true};
        for (const z of [-15.8, -11.25, -2.25, 6.75, 15.8]) put('pillar_decorated', -14.6, z, K, R);
        put('coin_stack_large', -10.9, -11.3, K); put('chest_gold', -10.9, -6.8, K, R); put('coin_stack_medium', -10.9, -2.2, K); put('candle_triple', -10.8, 2.3, K * 1.3); put('chest_gold', -10.9, 6.8, K, R); put('coin_stack_small', -10.9, 11.3, K); put('coin_stack_large', -10.9, 16.2, K, 1);
        put('table_medium_tablecloth_decorated_B', -18.6, -8, K, 0, ex); put('chair', -18.6, -10.4, K, 0, ex); put('chair', -18.6, -5.6, K, PI, ex); put('table_long_tablecloth_decorated_A', -18.6, 4, K, 0, ex); put('stool', -20.6, 4, K, 0, ex); put('keg_decorated', -19, 13, K, R, ex); put('barrel_large_decorated', -17.6, -16, K, 0, ex);
        put('rug_rectangle_A', 13, -9, K * 1.3, R); put('table_medium_tablecloth_decorated_B', 13, -9, K); put('chair', 13, -11.4, K, 0); put('chair', 13, -6.6, K, PI); put('chair', 15.4, -9, K, -R); put('armchair', 13, 1, K, -R); put('lamp_standing', 14.4, 3.4, K);
        put('rug_rectangle_A', 13, 10, K * 1.3, R); put('couch', 14, 10, K, -R); put('table_small_decorated_A', 11.8, 10, K); put('crates_stacked', 14, 16, K, .4);
        put('pillar_decorated', -7.4, -(E + 3.6), K, 0, tall); put('pillar_decorated', 7.4, -(E + 3.6), K, 0, tall); put('chest_gold', -3.2, -(E + 2.8), K * 1.2, 0); put('chest_gold', 3.2, -(E + 2.8), K * 1.2, 0); put('coin_stack_large', 0, -(E + 2.6), K * 1.2); put('banner_triple_red', 0, -(E + 5.4), K * 1.5, 0, tall);
        put('couch', -4.6, E + 3, K, PI); put('table_small_decorated_A', 0, E + 2.6, K); put('armchair', 4.8, E + 3, K, PI); put('coin_stack_medium', -8, E + 2.4, K); put('box_small_decorated', 8, E + 2.6, K, .5);
      });
    } else if (id === 'breakrm'){
      for (const [x, z, ry, t] of [[-13.1, 18.4, PI / 2, 0], [13.1, 17, -PI / 2, 1], [-9, -(L + 3.2), 0, 1], [9, -(L + 3.2), 0, 0]]){ if (side && x > 9.8) continue; const v = makeModel('vending', t); outline(v.g); v.g.position.set(x, 0, z); v.g.rotation.y = ry; v.g.scale.setScalar(1.25); d.add(v.g); }
      scenery(d, id, function build(put){
        const F = 1.25, R = PI / 2, E = L, ex = {extra:true};
        put('fridge_A_decorated', -12.9, -15.4, F, R); put('kitchencounter_straight_A_decorated', -12.5, -11.9, F, R); put('kitchencounter_sink', -12.5, -9.4, F, R); put('kitchencounter_straight_B', -12.5, -6.9, F, R); put('oven', -12.5, -4.4, F, R); put('fridge_B', -12.9, -1.2, F, R);
        put('lamp_standing', -14.2, 2.6, F); put('rug_oval_A', -12.6, 6.6, F * 1.3, R); put('couch_pillows', -14, 6.6, F, R); put('table_low', -11.4, 6.6, F * .8, R); put('armchair_pillows', -12.9, 10.9, F, R + .5); put('cabinet_medium_decorated', -14.2, 14.4, F, R); put('cactus_medium_A', -11.5, 16.4, F);
        put('table_round_A_decorated', -19.4, -7, F, 0, ex); put('chair_A', -21.8, -7, F, R, ex); put('chair_A', -17, -7, F, -R, ex); put('table_round_A_small_decorated', -19.4, 11.5, F, 0, ex); put('chair_stool', -21.2, 11.5, F, 0, ex); put('shelf_A_big', -22, 2, F * 1.4, R, ex);
        put('table_round_A_decorated', 13.8, -10.5, F); put('chair_A', 13.8, -13.1, F, 0); put('chair_A', 13.8, -7.9, F, PI); put('table_round_A_small_decorated', 13.2, -1.5, F); put('chair_stool', 14.9, -1.5, F); put('rug_rectangle_stripes_A', 12.6, 7.6, F * 1.2, R); put('couch_pillows', 14.2, 7.6, F, -R); put('cactus_small_B', 11.4, 12.6, F * 1.5);
        put('kitchentable_A_large_decorated', -3.6, -(E + 3.2), F); put('crate', 3.6, -(E + 3), F * .8, .3); put('menu', 0, -(E + 2.2), F * 1.7);
        put('table_low', -4.6, E + 3, F * .8); put('chair_stool', -1.8, E + 2.6, F); put('chair_stool', 2.4, E + 2.8, F); put('cactus_small_B', 5.6, E + 2.8, F * 1.5); put('pictureframe_standing_A', -7.6, E + 2.4, F * 1.6, PI);
      });
    } else {
      scenery(d, id, function build(put){
        const C = 4.4, Bd = 5, R = PI / 2, E = L, ex = {extra:true}, tall = {tall:true}, cars = ['car_sedan', 'car_taxi', 'car_hatchback', 'car_stationwagon', 'car_police'], bl = 'ABCDEFGH'.split('').map(c => `building_${c}_withoutBase`);
        for (let i = 0; i < 9; i++){ const z = -16 + i * 4; if (i % 4 !== 3) put(cars[i % 5], -12.6, z, C, R + (i % 3 - 1) * .06); if (i % 3 !== 1) put(cars[(i + 2) % 5], -18.8, z, C, -R + (i % 2) * .08, ex); if (i % 4 !== 1) put(cars[(i + 3) % 5], 12.6, z, C, -R + (i % 3 - 1) * .06); }
        put('dumpster', -11.2, -4, 4, R); put('firehydrant', -10.8, 4, 4.5); put('bench', -10.9, 12, 4.5, R); put('trash_A', -10.8, -12, 4.5); put('box_A', -11.1, 8, 4, .4);
        for (let i = 0; i < 8; i++){ put(bl[i], -27, -36 + i * 10.4, Bd, R, ex); put(bl[(i + 3) % 8], -39, -38 + i * 11, Bd * 1.35, R, ex); if (i < 6) put(bl[(i + 2) % 8], 27, -26 + i * 10.4, Bd, -R, ex); }
        for (let i = 0; i < 5; i++){ put(bl[(i + 5) % 8], -20 + i * 10, -(E + 14), Bd, 0, tall); put(bl[(i + 1) % 8], -20 + i * 10, E + 14, Bd, PI, tall); }
        put('car_police', -6.5, -(E + 4), C, .3); put('car_police', 6.5, -(E + 4), C, -.3); put('trafficlight_A', -3.4, -(E + 2.2), 5, 0, tall); put('trafficlight_A', 3.4, -(E + 2.2), 5, 0, tall);
        put('car_taxi', -6.5, E + 4, C, PI - .3); put('car_sedan', 6.5, E + 4.2, C, PI + .3); put('bench', 0, E + 2.4, 4.5); put('bush', -2.8, E + 2.4, 4); put('bush', 2.8, E + 2.4, 4); put('watertower', -22.5, 3, 7, 0, ex);
      });
      for (const sx of [-1, 1]) for (const z of [-11, 0, 11]){ box(d, .16, 6.5, .16, 0x39425a, sx * 9.9, 3.25, z, {m:.5}); box(d, 1.3, .12, .3, 0x39425a, sx * 9.4, 6.5, z, {m:.5}); box(d, .5, .08, .26, 0xfff3c4, sx * 9.0, 6.42, z, {e:0xffe9a8, ei:3});
        const pl = new THREE.Mesh(discG, new THREE.MeshBasicMaterial({color:0xffe9a8, transparent:true, opacity:.13, depthWrite:false, blending:THREE.AdditiveBlending})); pl.userData.keep = true; pl.rotation.x = -PI / 2; pl.scale.setScalar(5.2); pl.position.set(sx * 7.6, .03, z); d.add(pl); }
      for (const [a, b] of [[-9.6, 15.4], [9.6, 15.4], [-9.6, -15.4], [9.6, -15.4]]){ const c = new THREE.Mesh(new THREE.ConeGeometry(.3, .8, 10), M(0xff7a1f)); c.position.set(a, .4, b); d.add(c); }
    }
  }
  /* real scenery models, one bundled file per map (KayKit, CC0). They arrive a moment after the map and are skipped quietly if the file is missing. */
  const propLib = {}, sway = [];
  function loadProps(id){
    return propLib[id] || (propLib[id] = new Promise(res => new GLTFLoader().load(`props/${id}.glb`, g => {
      const o = {}; for (const c of g.scene.children) o[c.name] = c;
      g.scene.traverse(n => { if (n.isMesh){ n.material = M(0xffffff, {map:n.material.map, keep:true}); n.castShadow = true; } });
      res(o);
    }, undefined, () => res(null))));
  }
  /* many copies of one model in a single draw call */
  const im4 = new THREE.Matrix4(), iq = new THREE.Quaternion(), ip = new THREE.Vector3(), isc = new THREE.Vector3(), iup = new THREE.Vector3(0, 1, 0);
  function scatter(d, lib, name, list){
    const src = lib[name]; if (!src || !list.length) return;
    src.updateMatrixWorld(true);
    src.traverse(n => {
      if (!n.isMesh) return;
      const im = new THREE.InstancedMesh(n.geometry, n.material, list.length); im.frustumCulled = false;
      list.forEach(([x, z, sc, ry], i) => { im4.compose(ip.set(x, 0, z), iq.setFromAxisAngle(iup, ry), isc.setScalar(sc)); im4.multiply(n.matrixWorld); im.setMatrixAt(i, im4); });
      d.add(im);
    });
  }
  function scenery(d, id, build){
    loadProps(id).then(lib => {
      if (!lib || mapId !== id || d.parent !== stage) return;
      build.lib = lib;
      build((name, x, z, sc, ry = 0, o = {}) => {
        const src = lib[name]; if (!src || (low && o.extra)) return null;
        if (o.sideOnly && !side) return null;
        if (side ? (x > 9.8 && !o.low) : (o.tall && z > L)) return null;            // nothing tall between the camera and the field
        const m = src.clone(); m.position.set(x, o.y || 0, z); m.scale.setScalar(sc); m.rotation.y = ry; d.add(m);
        if (o.sway) sway.push(m);
        return m;
      });
    });
  }
  const crowd = [], flags = [], punch = {t:0, x:0, z:0}, AMB = {field:0xfff6c4, court:0xffffff, casino:0xff7ad0, breakrm:0xfff0d0, lot:0x9fc4ff};
  let intro = 9, amb = 0;

  /* ---------- entities ---------- */
  const recs = new Map(), barG = new THREE.PlaneGeometry(1, 1), iceG = new THREE.IcosahedronGeometry(1, 1);
  const barBg = new THREE.MeshBasicMaterial({color:0x08101f, transparent:true, opacity:.85, depthTest:false}), barCol = [new THREE.MeshBasicMaterial({color:0x3fa0ff, depthTest:false, transparent:true}), new THREE.MeshBasicMaterial({color:0xff3b30, depthTest:false, transparent:true})];   // transparent so they draw after the dark backing
  const shadowMat = new THREE.MeshBasicMaterial({color:0x000000, transparent:true, opacity:.3, depthWrite:false});
  const ringMat = [0, 1].map(i => new THREE.MeshBasicMaterial({color:TEAM[i], transparent:true, opacity:.9, depthWrite:false}));
  const rageMat = new THREE.MeshBasicMaterial({color:0xff4fd8, transparent:true, opacity:.9, depthWrite:false});
  const iceMat = new THREE.MeshStandardMaterial({color:0xbfe9ff, transparent:true, opacity:.5, roughness:.05, metalness:.1, flatShading:true, depthWrite:false});
  const baseRing = new THREE.RingGeometry(.86, 1.08, 30);
  const badges = {};
  function badgeMat(rel, lvl){
    const k = rel + '|' + lvl; if (badges[k]) return badges[k];
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#0a1430'; x.beginPath(); x.roundRect(4, 4, 56, 56, 14); x.fill();
    x.fillStyle = rel ? '#f0453c' : '#3f8cff'; x.beginPath(); x.roundRect(9, 9, 46, 46, 10); x.fill();
    x.fillStyle = 'rgba(255,255,255,.3)'; x.beginPath(); x.roundRect(12, 11, 40, 17, 8); x.fill();
    x.font = '900 34px "Lilita One", "Arial Black", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 6; x.strokeStyle = '#0a1430'; x.strokeText(lvl, 32, 35); x.fillStyle = '#fff'; x.fillText(lvl, 32, 35);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return badges[k] = new THREE.SpriteMaterial({map:t, depthTest:false, transparent:true});
  }
  function numTex(){ const c = document.createElement('canvas'); c.width = 128; c.height = 48; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return {c, t, v:-1}; }
  function make(e){
    const rel = e.team === me ? 0 : 1, U = e.U, m = makeModel(e.key, rel, {face:rel === 1, aff:U.aff, ink:!low});
    if (!U.twr){ m.s = (m.s || 1) * 1.2; m.h *= 1.2; }           // drawn a little larger than they collide, so they read from above
    if (!low) outline(m.g);
    const g = new THREE.Group(); g.add(m.g); root.add(g);
    const base = e.team === 0 ? PI : 0;
    g.rotation.y = base;
    const r = {e, m, g, rel, x:e.x, z:e.z, yaw:base, base, atk:99, sum:99, ph:Math.random() * 6, age:U.twr ? 9 : 0, hp:e.hp, landed:!!U.twr, pop:0, ice:null};
    if (!U.twr){
      r.ring = new THREE.Mesh(baseRing, ringMat[rel]); r.ring.rotation.x = -PI / 2; r.ring.scale.setScalar(U.r * 1.12); r.ring.position.y = .045; g.add(r.ring);
    }
    const bw = U.twr ? 2.1 : clamp(U.r * 2.2, .7, 1.7), bh = U.twr ? .26 : .13;
    r.bar = new THREE.Group(); r.bar.renderOrder = 10;
    const bg = new THREE.Mesh(barG, barBg); bg.scale.set(bw + .08, bh + .08, 1); bg.renderOrder = 10; r.bar.add(bg);
    r.fill = new THREE.Mesh(barG, barCol[rel]); r.fill.scale.set(bw, bh, 1); r.fill.renderOrder = 11; r.fill.position.z = .01; r.bar.add(r.fill); r.bw = bw;
    if (U.twr){ r.num = numTex(); const s = new THREE.Sprite(new THREE.SpriteMaterial({map:r.num.t, depthTest:false, transparent:true})); s.scale.set(1.9, .72, 1); s.position.y = .5; s.renderOrder = 12; r.bar.add(s); }
    r.bar.visible = false; bars.add(r.bar);
    if (!U.twr){ r.badge = new THREE.Sprite(badgeMat(rel, e.lvl || 1)); r.badge.scale.setScalar(clamp(.34 + U.r * .28, .42, .62)); r.badge.renderOrder = 12; r.badge.visible = false; bars.add(r.badge); }      // a team-coloured level tag over every troop, so sides read at a glance
    recs.set(e.id, r); return r;
  }
  function drawNum(r, v){
    const n = r.num; if (n.v === v) return; n.v = v;
    const x = n.c.getContext('2d'); x.clearRect(0, 0, 128, 48); x.font = '700 38px Teko, "Arial Narrow", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 7; x.strokeStyle = '#050c1c'; x.strokeText(v, 64, 27); x.fillStyle = '#fff'; x.fillText(v, 64, 27); n.t.needsUpdate = true;
  }
  function drop(r){
    root.remove(r.g); bars.remove(r.bar); if (r.badge) bars.remove(r.badge);
    if (r.num){ r.num.t.dispose(); }
    recs.delete(r.e.id);
  }
  function die(r){
    const U = r.e.U, h = r.m.h * .5 + (r.m.fly || 0);
    if (U.twr){
      burst(r.x, 1.5, r.z, 70, 0xffb547, {spd:7, up:8, life:1.1, spread:1.6}); burst(r.x, 1, r.z, 26, 0x8b93a6, {smoke:true, spd:3, up:3, life:1.6, grav:-.5, spread:1.5});
      flat(r.x, r.z, {r0:1, r1:6, dur:.7, color:0xffd28a, add:true}); shake(.7);
      const rub = new THREE.Group(); rub.position.set(r.x, 0, r.z); rub.userData.rubble = true; root.add(rub);
      for (let i = 0; i < 9; i++){ const k = new THREE.Mesh(new THREE.DodecahedronGeometry(.3 + (i * 7 % 5) * .1, 0), M(i % 3 ? 0x8b93a6 : 0x636b7e, {flat:true, r:.95})); const a = i / 9 * PI * 2; k.position.set(Math.cos(a) * (.4 + (i % 3) * .4), .2 + (i % 2) * .15, Math.sin(a) * (.4 + (i % 3) * .4)); k.rotation.set(i, i * 2, i * 3); rub.add(k); }
    } else {
      const col = r.e.key.startsWith('slime') ? 0x3fd0b8 : r.e.key === 'skel' ? 0xf3f0e6 : r.e.key === 'ghost' ? 0xbfd4ff : U.bld ? 0xffb547 : r.rel ? 0xff8a7a : 0x8fc4ff;
      burst(r.x, h, r.z, 8 + Math.round(U.r * 12), col, {spd:2.2 + U.r * 2, up:2.5, life:.5});
      burst(r.x, .3, r.z, 3 + Math.round(U.r * 4), 0xd9dde8, {smoke:true, spd:1, up:1, life:.7, grav:-.6});
    }
    if (U.twr) drop(r);
    else { bars.remove(r.bar); if (r.badge) bars.remove(r.badge); recs.delete(r.e.id); if (r.ring) r.ring.visible = false; if (r.ice) r.g.remove(r.ice); dying.push({g:r.g, t:0, spin:(Math.random() - .5) * 16, rig:r.m.die && r.m.die() ? r.m : null}); flat(r.x, r.z, {r0:.2, r1:U.r * 2.2, dur:.3, color:0xffffff, add:true, a:.6}); }   // knocked into the air, spinning, then gone
  }
  const dying = [], DEAD = {mv:false, atk:99, ph:0}, FLASH = new THREE.MeshBasicMaterial({color:0xffffff});
  function setFlash(r, on){
    if (!!r.fl === on) return; r.fl = on;
    r.m.g.traverse(o => { if (!o.isMesh || Array.isArray(o.material)) return; if (on){ if (o.material.side === THREE.BackSide || o.material.transparent) return; o.userData.om = o.material; o.material = FLASH; } else if (o.userData.om){ o.material = o.userData.om; o.userData.om = null; } });
  }
  const seen = new Set();
  function sync(ents, dt){
    seen.clear();
    const kp = 1 - Math.exp(-dt * 16), ky = 1 - Math.exp(-dt * 11);
    for (const e of ents){
      const r = recs.get(e.id) || make(e), U = e.U, m = r.m;
      r.e = e; seen.add(e.id);
      const dx = e.x - r.x, dz = e.z - r.z;
      r.x += dx * kp; r.z += dz * kp; r.age += dt; r.atk += dt; r.sum += dt;
      const t = e.tgt ? recs.get(e.tgt) : null;
      let yaw = r.yaw;
      if (e.mv && dx * dx + dz * dz > 1e-6) yaw = Math.atan2(dx, dz); else if (t) yaw = Math.atan2(t.x - r.x, t.z - r.z);
      r.yaw = yaw;
      let aim = 0;
      if (U.bld){ aim = r.aimS = angTo(r.aimS ?? 0, t ? yaw - r.base : 0, ky); } else r.g.rotation.y = angTo(r.g.rotation.y, yaw, ky);
      const frozen = !!e.frz;
      if (e.mv && !frozen) r.ph += dt * U.spd * (e.chg ? 2 : 1) * (e.rage ? 1.35 : 1) * 6.5 / Math.max(.7, m.h / 1.6);
      let y = 0;
      if (!r.landed){
        const k = r.age / .3;
        if (k >= 1){ r.landed = true; r.pop = .22; burst(r.x, .15, r.z, 4 + Math.round(U.r * 5), 0xe9e4d6, {smoke:true, spd:1.6, up:.6, life:.5, grav:-.4, spread:U.r}); }
        else y = (1 - k) * (1 - k) * 6;
      }
      r.g.position.set(r.x, y, r.z);
      if (r.lunge > 0) r.lunge -= dt; if (r.hit > 0) r.hit -= dt; if (r.white > 0 && (r.white -= dt) <= 0) setFlash(r, false);
      const hop = e.mv && !m.fly && !U.bld && !frozen && !m.rig ? Math.abs(Math.sin(r.ph)) * (U.spd >= 1.9 ? .32 : U.r > .8 ? .05 : .12) : 0;
      m.g.position.set(0, (m.fly || 0) + hop, r.lunge > 0 ? Math.sin(r.lunge / .22 * PI) * (.35 + U.r * .5) : 0);
      if (!U.bld){ m.g.rotation.x = r.hit > 0 ? -Math.sin(r.hit / .18 * PI) * .32 : m.fly && e.mv ? .22 : 0; m.g.rotation.z = e.mv && !frozen && !m.rig ? Math.sin(r.ph) * (m.fly ? .14 : .07) : 0; }
      if (e.mv && !m.fly && !low && !frozen && (r.step = (r.step || 0) + dt) > .26){ r.step = 0; burst(r.x, .1, r.z, 1, 0xe6dcc4, {smoke:true, spd:.35, up:.45, life:.45, grav:-.3}); }
      if (r.pop > 0) r.pop -= dt;
      const sq = r.pop > 0 ? Math.sin(r.pop / .22 * PI) * .16 : 0;
      const ms = m.s || 1; m.g.scale.set(ms * (1 + sq), ms * (1 - sq), ms * (1 + sq));
      if (e.slow && Math.random() < dt * 5) burst(r.x, m.h * .5 + (m.fly || 0), r.z, 1, 0x9fdcff, {spd:.5, up:.8, life:.5, grav:-.5});
      if (e.hp < r.hp - .5 && r.landed){ dmgNum(r, r.hp - e.hp); if (e.hp < r.hp - 12 || Math.random() < .3) burst(r.x, m.h * .55 + (m.fly || 0), r.z, U.twr ? 5 : 3, 0xffe3a0, {spd:2, up:1.6, life:.3}); if (r.pop <= 0) r.pop = .1; r.hit = .18; if (!U.twr && r.hp - e.hp >= 20){ r.white = .07; setFlash(r, true); } }
      else if (e.hp > r.hp + 5) burst(r.x, m.h * .6 + (m.fly || 0), r.z, 4, 0x6dff9a, {spd:.8, up:2.2, life:.6, grav:-1});
      r.hp = e.hp;
      if (!frozen) m.anim(time, {mv:e.mv, ph:r.ph, atk:r.atk, chg:e.chg, aim, sum:r.sum, active:e.active, spd:U.spd * (e.rage ? 1.35 : 1) * (e.slow ? .62 : 1)});
      if (frozen && !r.ice){ r.ice = new THREE.Mesh(iceG, iceMat); r.ice.scale.set(U.r * 1.25, m.h * .58, U.r * 1.25); r.ice.position.y = m.h * .5 + (m.fly || 0); r.g.add(r.ice); }
      else if (!frozen && r.ice){ r.g.remove(r.ice); r.ice = null; burst(r.x, m.h * .5, r.z, 8, 0xbfe9ff, {spd:2.5, up:2, life:.4}); }
      if (r.ring){ r.ring.material = e.rage ? rageMat : ringMat[r.rel]; r.ring.scale.setScalar(U.r * (e.rage ? 1.3 + Math.sin(time * 12) * .1 : e.dep ? .7 + (time * 2 % 1) * .5 : 1.12)); }
      const show = r.landed && !e.dep && (U.twr || e.hp < e.max - .5);
      r.bar.visible = show;
      tv.set(r.x, m.h + (m.fly || 0) + (U.twr ? .5 : .34), r.z); root.localToWorld(tv);
      if (r.badge){ r.badge.visible = r.landed && !e.dep; r.badge.position.copy(tv); if (show) r.badge.position.x -= 0; }
      if (show){
        r.bar.position.copy(tv); if (r.badge) r.bar.position.y += .36; r.bar.quaternion.copy(camera.quaternion);
        const f = clamp(e.hp / e.max, 0, 1); r.fill.scale.x = Math.max(.001, r.bw * f); r.fill.position.x = -r.bw * (1 - f) / 2;
        if (r.num) drawNum(r, Math.max(0, Math.ceil(e.hp)));
      }
    }
    for (const r of [...recs.values()]) if (!seen.has(r.e.id)) die(r);
  }

  /* ---------- things in the air ---------- */
  const shots = [];
  const shotMesh = {
    ball: () => basketball(.14),
    coffee: () => new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 8), M(0x5a3418, {r:.2})),
    flag: () => new THREE.Mesh(new THREE.BoxGeometry(.2, .2, .04), M(0xffd21f)),
    water: () => new THREE.Mesh(new THREE.SphereGeometry(.1, 8, 6), M(0x8fd8ff, {r:.1})),
    fire: () => new THREE.Mesh(new THREE.SphereGeometry(.2, 10, 8), M(0xffb347, {e:0xff6a00, ei:3})),
    magic: () => new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), M(0x6dff9a, {e:0x2fff7a, ei:3})),
    beam: () => new THREE.Mesh(new THREE.SphereGeometry(.34, 12, 10), M(0xdff2ff, {e:0x8fc8ff, ei:4})),
    cup: () => makeModel('coffee').g
  };
  const TRAIL = {fire:0xff8a2b, magic:0x6dff9a, beam:0xaad8ff, ball:0xffc27a, coffee:0xb07a4a, flag:0xffe27a, water:0x9fe0ff}, HITC = {ball:0xffb070, coffee:0x8a5a34, flag:0xffe27a, water:0x8fd8ff, fire:0xff8a2b, magic:0x6dff9a, beam:0xdff2ff, cup:0x8a5a34};
  function shoot(kind, from, to, dur, o = {}){
    const m = shotMesh[kind](); m.position.copy(from); root.add(m);
    shots.push({m, kind, from:from.clone(), to:to.clone(), tid:o.tid || 0, th:o.th || 0, t:-(o.delay || 0), d:dur, arc:o.arc ?? 0, splash:o.splash || 0, quiet:o.quiet});
    if (o.delay) m.visible = false;
  }
  function stepShots(dt){
    for (let i = shots.length - 1; i >= 0; i--){
      const s = shots[i]; s.t += dt;
      if (s.t < 0) continue;
      s.m.visible = true;
      const tr = s.tid ? recs.get(s.tid) : null;
      if (tr) s.to.set(tr.x, s.th, tr.z);
      const k = Math.min(1, s.t / s.d);
      s.m.position.lerpVectors(s.from, s.to, k); s.m.position.y += Math.sin(k * PI) * s.arc;
      if (s.kind === 'ball' || s.kind === 'flag' || s.kind === 'cup') s.m.rotation.x += dt * 9;
      if (TRAIL[s.kind] && Math.random() < .8) burst(s.m.position.x, s.m.position.y, s.m.position.z, 1, TRAIL[s.kind], {spd:.4, up:.3, life:.3, grav:0});
      if (k >= 1){
        if (!s.quiet) burst(s.to.x, s.to.y, s.to.z, s.kind === 'beam' ? 26 : 5, HITC[s.kind], {spd:s.kind === 'beam' ? 5 : 2, up:2, life:.4});
        if (s.splash) flat(s.to.x, s.to.z, {r0:.3, r1:s.splash, dur:.35, color:HITC[s.kind], add:true, a:.7});
        if (s.kind === 'beam') shake(.3);
        root.remove(s.m); shots.splice(i, 1);
      }
    }
  }
  /* a Legendary arrives: a column of light, two shockwaves and a shower of gold */
  const beams = [], beamG = new THREE.CylinderGeometry(.6, .85, 34, 24, 1, true);
  function legend(x, z){
    const b = new THREE.Mesh(beamG, new THREE.MeshBasicMaterial({color:0xffd95a, transparent:true, opacity:.5, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide}));
    b.material.color.multiplyScalar(HDR); b.position.set(x, 17, z); root.add(b); beams.push({m:b, t:0});
    flat(x, z, {r0:.4, r1:5, dur:.7, color:0xffe9a8, add:true}); flat(x, z, {r0:.4, r1:7.5, dur:1.1, delay:.25, color:0xffd95a, add:true, a:.6});
    flat(x, z, {r0:2.2, dur:1.5, color:0xffd95a, fill:true, a:.3, hold:true, add:true});
    for (let i = 0; i < 4; i++) setTimeout(() => burst(x, .4 + i * .8, z, 22, i % 2 ? 0xffffff : 0xffd95a, {spd:3.5 + i, up:5, life:1, grav:3, spread:.8}), i * 130);
    shake(.5);
  }
  function stepBeams(dt){ for (let i = beams.length - 1; i >= 0; i--){ const b = beams[i]; b.t += dt; const k = b.t / 1.5; if (k >= 1){ root.remove(b.m); b.m.material.dispose(); beams.splice(i, 1); continue; } b.m.material.opacity = .5 * (1 - k) * (.7 + Math.sin(time * 30) * .3); b.m.scale.set(1 - k * .7, 1, 1 - k * .7); b.m.rotation.y += dt * 2; } }
  function shake(a){ if (!opt.reduced) shakeAmt = Math.max(shakeAmt, a); }

  /* ---------- events from the sim ---------- */
  const va = new THREE.Vector3(), vb = new THREE.Vector3();
  function events(list){
    for (const ev of list){
      if (ev.e === 'drop'){ if (ev.rar === 'l') legend(ev.x, ev.z); }
      else if (ev.e === 'atk'){
        const r = recs.get(ev.id); if (!r) continue; r.atk = 0;
        const U = r.e.U, t = recs.get(ev.t);
        if (U.rng <= 1.5 && !U.bld){ r.lunge = .22; if (t && !low) burst((r.x + t.x) / 2, r.m.h * .5, (r.z + t.z) / 2, 4, 0xffffff, {spd:2.2, up:1.2, life:.22, grav:0}); }
        if (U.splash && U.rng <= 1.5 && t){ flat(t.x, t.z, {r0:.3, r1:U.splash, dur:.35, color:0xffd28a, add:true, a:.7}); burst(t.x, .2, t.z, 12, 0xffd28a, {spd:4, up:2, life:.4}); shake(.25); }
      } else if (ev.e === 'shot'){
        const r = recs.get(ev.id), t = recs.get(ev.t); if (!r || !t) continue;
        const U = r.e.U, th = t.m.h * .5 + (t.m.fly || 0);
        va.set(r.x, U.twr ? (r.e.key === 'king' ? 3.6 : 2.6) : r.m.h * .7 + (r.m.fly || 0), r.z); vb.set(t.x, th, t.z);
        burst(va.x, va.y, va.z, 4, 0xfff1c4, {spd:1.6, up:.6, life:.2, grav:0});
        shoot(ev.k, va, vb, ev.d, {tid:ev.t, th, arc:'ball coffee flag water'.includes(ev.k) ? va.distanceTo(vb) * .16 : 0, splash:U.splash || 0});
      } else if (ev.e === 'spell'){
        const rel = ev.team === me ? 0 : 1, col = TEAM[rel];
        flat(ev.x, ev.z, {r0:ev.r, dur:ev.d + .15, color:col, a:.9, hold:true});
        flat(ev.x, ev.z, {r0:ev.r, dur:ev.d + .15, color:col, fill:true, a:.16, hold:true});
        if (ev.k === 'rain'){
          for (let i = 0; i < (low ? 10 : 18); i++){ const a = Math.random() * PI * 2, q = Math.sqrt(Math.random()) * ev.r; vb.set(ev.x + Math.cos(a) * q, .15, ev.z + Math.sin(a) * q); va.set(vb.x + (ev.team === 0 ? 3 : -3), 15, vb.z + (ev.team === 0 ? 9 : -9)); shoot('ball', va, vb, .55, {delay:Math.max(0, ev.d - .5 + Math.random() * .5), quiet:i % 2}); }
        } else if (ev.k === 'bomb'){
          va.set(0, 3, ev.team === 0 ? L - 3 : 3 - L); vb.set(ev.x, .3, ev.z); shoot('cup', va, vb, ev.d, {arc:6, quiet:true});
        } else if (ev.k === 'rage'){
          flat(ev.x, ev.z, {r0:ev.r, dur:ev.t, delay:ev.d, color:0xff4fd8, fill:true, a:.2, hold:true, pulse:true, add:true});
          flat(ev.x, ev.z, {r0:ev.r, dur:ev.t, delay:ev.d, color:0xff8ae6, a:.8, hold:true, pulse:true});
        } else if (ev.k === 'freeze'){
          flat(ev.x, ev.z, {r0:ev.r, dur:ev.t, delay:ev.d, color:0xbfe9ff, fill:true, a:.26, hold:true});
        }
      } else if (ev.e === 'boom'){
        if (ev.k === 'rain'){ burst(ev.x, .3, ev.z, 16, 0xffb070, {spd:4, up:3, life:.5, spread:ev.r}); }
        else if (ev.k === 'bomb'){ burst(ev.x, .4, ev.z, 46, 0xb87a48, {spd:6, up:6, life:.8, spread:1}); burst(ev.x, .5, ev.z, 16, 0xf3ead6, {smoke:true, spd:1.6, up:3, life:1.3, grav:-1.2, spread:1.6}); flat(ev.x, ev.z, {r0:.5, r1:ev.r * 1.15, dur:.5, color:0xd9a066, add:true}); shake(.35); }
        else if (ev.k === 'freeze'){ burst(ev.x, .6, ev.z, 40, 0xdff5ff, {spd:5, up:3, life:.8, spread:1, grav:2}); flat(ev.x, ev.z, {r0:.5, r1:ev.r, dur:.5, color:0xbfe9ff, add:true}); }
        else if (ev.k === 'rage'){ burst(ev.x, .4, ev.z, 26, 0xff6fe0, {spd:4, up:4, life:.7, grav:1}); }
        else { burst(ev.x, .6, ev.z, 54, 0xff8a2b, {spd:7, up:7, life:.8, spread:.8}); burst(ev.x, .6, ev.z, 14, 0x3a3f4d, {smoke:true, spd:2, up:3, life:1.2, grav:-1}); flat(ev.x, ev.z, {r0:.5, r1:ev.r, dur:.5, color:0xffb547, add:true}); shake(.45); }
      } else if (ev.e === 'fuse'){
        flat(ev.x, ev.z, {r0:ev.r, dur:ev.d + .05, color:0xff3a2a, a:.9, hold:true, pulse:true}); flat(ev.x, ev.z, {r0:.2, r1:ev.r, dur:ev.d + .05, color:0xff3a2a, fill:true, a:.3, hold:true});
      } else if (ev.e === 'heal'){ const r = recs.get(ev.id); if (r) flat(r.x, r.z, {r0:.4, r1:ev.r, dur:.6, color:0x6dff9a, a:.6, add:true}); }
      else if (ev.e === 'summon'){ const r = recs.get(ev.id); if (r){ r.sum = 0; r.atk = 0; burst(r.x, .4, r.z + (r.e.team === 0 ? -1 : 1), 12, r.e.key === 'witch' ? 0xb18cff : 0xf2c14e, {spd:2, up:2.4, life:.5}); } }
      else if (ev.e === 'charge'){ const r = recs.get(ev.id); if (r) burst(r.x, .5, r.z, 10, 0xffe27a, {spd:2.5, up:1, life:.4}); }
      else if (ev.e === 'over'){ for (const r of recs.values()) if (r.e.team === ev.w && r.m.cheer) r.m.cheer(); }
      else if (ev.e === 'tower'){
        for (const c of [0xff5a4a, 0xffd23f, 0x4fb3ff, 0x4ade80, 0xff7ad0]) burst(ev.x, 2.6, ev.z, low ? 8 : 16, c, {spd:6, up:10, life:1.5, grav:9, spread:1.2});
        if (!opt.reduced){ punch.t = 1; punch.x = me === 0 ? ev.x : -ev.x; punch.z = me === 0 ? ev.z : -ev.z; }
      }
      else if (ev.e === 'king'){ const r = [...recs.values()].find(q => q.e.key === 'king' && q.e.team === ev.team); if (r){ flat(r.x, r.z, {r0:1, r1:4.5, dur:.6, color:0xffd95a, add:true}); burst(r.x, 3.4, r.z, 20, 0xffd95a, {spd:3, up:4, life:.7}); } }
    }
  }

  /* ---------- aiming a card ---------- */
  const ghost = new THREE.Group(); fxW.add(ghost); ghost.visible = false;
  const gRing = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({color:0x4ade80, transparent:true, opacity:.95, depthWrite:false})), gDisc = new THREE.Mesh(discG, new THREE.MeshBasicMaterial({color:0x4ade80, transparent:true, opacity:.22, depthWrite:false}));
  for (const m of [gRing, gDisc]){ m.rotation.x = -PI / 2; m.position.y = .07; ghost.add(m); }
  const nogo = new THREE.Group(); fxW.add(nogo); nogo.visible = false;
  const ngMat = new THREE.MeshBasicMaterial({color:0xff3a2a, transparent:true, opacity:.2, depthWrite:false}), ng = [];
  for (let i = 0; i < 4; i++){ const m = new THREE.Mesh(barG, ngMat); m.rotation.x = -PI / 2; m.position.y = .06; nogo.add(m); ng.push(m); }
  let gM = null, gKey = '';
  function setGhost(on, x, z, r, ok, key, aff){
    ghost.visible = !!on; if (!on) return;
    const wx = me === 0 ? x : -x, wz = me === 0 ? z : -z;
    ghost.position.set(wx, 0, wz); gRing.scale.setScalar(r); gRing.userData.p = 1; gDisc.scale.setScalar(r);
    gRing.material.color.set(ok ? 0x4ade80 : 0xff3a2a); gDisc.material.color.set(ok ? 0x4ade80 : 0xff3a2a);
    const k = key ? key + '|' + aff : '';                       // the troop itself hovers over the spot you are about to drop it on
    if (k !== gKey){ if (gM) ghost.remove(gM.g); gM = null; gKey = k; if (key){ gM = makeModel(key, 0, {aff}); gM.g.scale.setScalar((gM.s || 1) * 1.2); gM.g.rotation.y = PI; ghost.add(gM.g); } }
    if (gM) gM.g.visible = !!ok;
  }
  function setNoGo(on, pocket){
    nogo.visible = !!on; if (!on) return;
    const e = (MAPS[mapId].river ? RIVER : 0) + .6;
    const put = (m, x0, x1, z0, z1, vis) => { m.visible = vis; m.scale.set(x1 - x0, z1 - z0, 1); m.position.set((x0 + x1) / 2, .06, (z0 + z1) / 2); };
    put(ng[0], -W, W, -L, -(L - 8.5), true); put(ng[1], -W, W, -e, e, true);
    put(ng[2], -W, 0, -(L - 8.5), -e, !(pocket && pocket[0])); put(ng[3], 0, W, -(L - 8.5), -e, !(pocket && pocket[1]));
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function pick(cx, cy){
    const b = renderer.domElement.getBoundingClientRect();
    ndc.set((cx - b.left) / b.width * 2 - 1, -((cy - b.top) / b.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(floor, tv)) return null;
    return me === 0 ? {x:tv.x, z:tv.z} : {x:-tv.x, z:-tv.z};
  }
  function pickWorld(cx, cy){ const b = renderer.domElement.getBoundingClientRect(); ndc.set((cx - b.left) / b.width * 2 - 1, -((cy - b.top) / b.height) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray.intersectPlane(floor, tv) ? {x:tv.x, z:tv.z} : null; }
  /* whichever character or tower is drawn nearest the pointer */
  function entityAt(cx, cy){
    let best = null, bd = 1e9;
    for (const r of recs.values()){ const p = screenOf(r.x, r.m.h * .5 + (r.m.fly || 0), r.z), q = screenOf(r.x + Math.max(.7, r.e.U.r * 1.3), r.m.h * .5 + (r.m.fly || 0), r.z), lim = Math.max(26, Math.abs(q.x - p.x)), d = Math.hypot(p.x - cx, p.y - cy); if (d < lim && d < bd){ bd = d; best = r.e; } }
    return best;
  }
  const dmgEls = [];
  function dmgNum(r, amt){
    if (!opt.numbers || amt < 18 || dmgEls.length > 16) return;
    const p = screenOf(r.x + (Math.random() - .5) * .5, r.m.h + (r.m.fly || 0), r.z), d = document.createElement('div');
    d.className = 'dmg' + (r.rel ? '' : ' me') + (amt >= 250 ? ' big' : ''); d.textContent = Math.round(amt); const b = el.getBoundingClientRect(); d.style.left = (p.x - b.left) + 'px'; d.style.top = (p.y - b.top) + 'px';
    el.appendChild(d); dmgEls.push(d); setTimeout(() => { d.remove(); dmgEls.splice(dmgEls.indexOf(d), 1); }, 750);
  }
  function screenOf(x, y, z){ tv.set(x, y, z); root.localToWorld(tv); tv.project(camera); const b = renderer.domElement.getBoundingClientRect(); return {x:b.left + (tv.x + 1) / 2 * b.width, y:b.top + (1 - tv.y) / 2 * b.height}; }

  /* ---------- frame ---------- */
  function frame(dt, ents){
    time += dt;
    if (ents) sync(ents, dt);
    if (ghost.visible){ const p = 1 + Math.sin(time * 7) * .06; gRing.scale.setScalar(gRing.scale.x / (gRing.userData.p || 1) * p); gRing.userData.p = p; if (gM && gM.g.visible){ gM.g.position.y = (gM.fly || 0) + .5 + Math.sin(time * 5) * .14; gM.anim(time, {mv:false, ph:0, atk:99, sum:99, aim:0, active:true, chg:false}); } }
    stepShots(dt); stepFlats(dt); stepBeams(dt); glow.step(dt); smoke.step(dt);
    if (waterTex) waterTex.offset.x = time * .035;
    for (let i = 0; i < crowd.length; i++) crowd[i].position.y = Math.abs(Math.sin(time * 3 + i)) * .12;
    for (let i = dying.length - 1; i >= 0; i--){ const d = dying[i]; d.t += dt;
      if (d.rig){ d.rig.anim(time, DEAD); if (d.t > 1.15) d.g.position.y -= dt * 1.6; if (d.t > 1.75){ root.remove(d.g); dying.splice(i, 1); } continue; }     // rigged troops fall over, lie there a moment, then sink away
      const k = d.t / .42; if (k >= 1){ root.remove(d.g); dying.splice(i, 1); continue; } d.g.position.y += dt * (5 - k * 9); d.g.rotation.z += dt * d.spin; d.g.rotation.x += dt * 6; d.g.scale.setScalar(Math.max(.01, 1 - k * k)); }
    for (let i = 0; i < sway.length; i++){ sway[i].rotation.z = Math.sin(time * 1.1 + i * 1.7) * .028; sway[i].rotation.x = Math.sin(time * .8 + i) * .02; }
    for (let i = 0; i < flags.length; i++){ flags[i].rotation.y = Math.sin(time * 3.2 + i * 1.7) * .4; flags[i].scale.x = 1 + Math.sin(time * 5 + i) * .06; }
    if ((amb += dt) > (low ? .45 : .16)){ amb = 0; tc.set(AMB[mapId] || 0xffffff); glow.emit((Math.random() * 2 - 1) * 9, .4 + Math.random() * 2.5, (Math.random() * 2 - 1) * 16, (Math.random() - .5) * .4, .2 + Math.random() * .35, (Math.random() - .5) * .4, 2.6, tc, 0); }
    look.set(LOOKAT.x + panX, 0, LOOKAT.z + panZ); home.copy(camDir).multiplyScalar(camDist / zoomK).add(look); camera.position.copy(home);
    if (intro < 2.8){                                  // fly in around the arena at the start
      intro += dt; const k = Math.min(1, intro / 2.8), q = 1 - Math.pow(1 - k, 3);
      tv.copy(home).sub(look); const R = tv.length(), th = Math.atan2(tv.x, tv.z) + (1 - q) * 1.5, ph = Math.asin(tv.y / R) * (.5 + .5 * q), rr = R * (1.3 - .3 * q);
      camera.position.set(look.x + Math.sin(th) * Math.cos(ph) * rr, look.y + Math.sin(ph) * rr, look.z + Math.cos(th) * Math.cos(ph) * rr);
    }
    if (punch.t > 0){ punch.t -= dt; camera.position.lerp(tv.set(punch.x, 0, punch.z).addScaledVector(camDir, 15), Math.sin(Math.min(1, punch.t) * PI) * .22); }
    if (shakeAmt > .002){ camera.position.x += (Math.random() - .5) * shakeAmt; camera.position.y += (Math.random() - .5) * shakeAmt; shakeAmt *= Math.exp(-dt * 7); }
    camera.lookAt(look);
    if (!lostGL){ if (composer) composer.render(dt); else renderer.render(scene, camera); }
  }
  function reset(team, map){
    me = team; root.rotation.y = team === 0 ? 0 : PI;
    for (const r of [...recs.values()]) drop(r);
    for (const c of root.children.slice()) if (c.userData.rubble) root.remove(c);
    for (const s of shots) root.remove(s.m); shots.length = 0;
    for (const f of flats){ root.remove(f.m); f.m.material.dispose(); } flats.length = 0;
    for (const b of beams){ root.remove(b.m); b.m.material.dispose(); } beams.length = 0;
    for (const d of dying) root.remove(d.g); dying.length = 0; intro = opt.reduced ? 9 : 0; punch.t = 0;
    resetCam(); glow.clear(); smoke.clear(); crowd.length = 0; shakeAmt = 0; setGhost(false); setNoGo(false);
    resize(); setMap(map);
  }

  /* ---------- card art: render one model to a picture ---------- */
  let TR = null;
  function thumb(key, aff, px = 200){
    if (!TR){
      const r = new THREE.WebGLRenderer({antialias:true, alpha:true, preserveDrawingBuffer:true}); r.setPixelRatio(1); r.setSize(px, px, false); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.setClearColor(0x000000, 0);
      const sc = new THREE.Scene(), pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
      sc.add(new THREE.HemisphereLight(0xffffff, 0x51443a, .9)); const d = new THREE.DirectionalLight(0xfff1dd, 1.8); d.position.set(3, 6, 5); sc.add(d);
      TR = {r, sc, cam:new THREE.PerspectiveCamera(30, 1, .1, 80)};
    }
    const m = makeModel(key, 0, {face:true, aff, ink:true}); outline(m.g, 1.07); m.g.scale.setScalar(m.s || 1); m.anim(.4, {mv:false, ph:.9, atk:99, sum:99, aim:.5, active:true, chg:false}); TR.sc.add(m.g);
    const bx = new THREE.Box3().setFromObject(m.g), c = bx.getCenter(new THREE.Vector3()), rad = bx.getSize(new THREE.Vector3()).length() / 2;
    TR.cam.position.copy(c).add(new THREE.Vector3(.75, .5, 2).normalize().multiplyScalar(rad / Math.sin(15 * PI / 180) * 1.02)); TR.cam.lookAt(c);
    TR.r.render(TR.sc, TR.cam); TR.sc.remove(m.g);
    return TR.r.domElement.toDataURL('image/png');
  }

  return { loadProps, reset, resize, frame, events, pick, pickWorld, entityAt, zoomBy, panBy, resetCam, get zoom(){ return zoomK; }, screenOf, setGhost, setNoGo, thumb, shake, burst, legend, get dom(){ return renderer.domElement; }, get count(){ return recs.size; } };
}
