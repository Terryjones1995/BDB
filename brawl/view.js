/* Break Room Brawl: the 3D arena. Draws whatever entity list it is handed (the live sim, or a host's snapshot)
   and turns sim events into effects. It never decides anything about the game. */
import * as THREE from 'three';
import { RoomEnvironment } from '../chess/vendor/RoomEnvironment.js';
import { makeModel, basketball, M, TEAM, TX, outline } from './models.js?v=1114e';
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
  field:   {a:'#8fd450', b:'#83c846', path:'#e6c98c', edge:'#b3904f', pad:'#cfd5e0'},
  court:   {a:'#dba768', b:'#d09a5a', path:'#f3deb0', edge:'#a8763a', pad:'#cfd5e0'},
  casino:  {a:'#86204c', b:'#741a41', path:'#e0b84e', edge:'#8f6a18', pad:'#d9c9e6'},
  breakrm: {a:'#f1ecde', b:'#a9dccd', path:'#c9d0db', edge:'#8791a3', pad:'#e6e9f0'},
  lot:     {a:'#424857', b:'#3a404d', path:'#5d6473', edge:'#f2c14e', pad:'#aab1bf'}
};
function groundTex(id){
  const S = 56, w = 18 * S, h = 2 * L * S, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), X = v => (v + 9) * S, Z = v => (v + L) * S, T = THEME[id], map = MAPS[id];
  for (let r = 0; r < L; r++) for (let q = 0; q < 9; q++){ x.fillStyle = (q + r) % 2 ? T.a : T.b; x.fillRect(q * S * 2, r * S * 2, S * 2, S * 2); }
  for (let i = 0; i < 1400; i++){ x.fillStyle = i % 2 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)'; x.fillRect((i * 7919) % w, (i * 104729) % h, 3 + i % 4, 2 + i % 3); }
  if (id === 'court'){ x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 6; x.beginPath(); x.arc(X(0), Z(0), 3.2 * S, 0, 7); x.stroke(); for (const sz of [1, -1]){ x.beginPath(); x.arc(X(0), Z(sz * (L - 1)), 7 * S, sz > 0 ? PI : 0, sz > 0 ? PI * 2 : PI); x.stroke(); } }
  if (id === 'lot'){ x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 5; for (const sx of [-1, 1]) for (let r = -14; r <= 14; r += 2.6){ if (Math.abs(r) < 2) continue; x.beginPath(); x.moveTo(X(sx * 9), Z(r)); x.lineTo(X(sx * 7.2), Z(r)); x.stroke(); } }
  // lanes: one down to every crossing, one across each back line, one stem to each king
  const lx = map.bridges.length ? map.bridges.map(b => b.x) : [-5.5, 5.5], wide = Math.max(5.5, ...lx.map(Math.abs)) + .85, rects = [];
  for (const v of lx){ const bw = map.bridges.length ? Math.min(1.25, map.bridges.find(b => b.x === v).w / 2 - .2) : .85; rects.push([v - bw, -(L - 5.7), v + bw, L - 5.7]); }
  for (const sz of [-1, 1]){ const pz = sz * (L - 6.5), kz = sz * (L - 2.4); rects.push([-wide, pz - .85, wide, pz + .85]); rects.push([-.85, Math.min(pz, kz), .85, Math.max(pz, kz)]); }
  const rr = (a, b, c2, d, g, col) => { x.fillStyle = col; x.beginPath(); x.roundRect(X(a - g), Z(b - g), (c2 - a + g * 2) * S, (d - b + g * 2) * S, S * .3); x.fill(); };
  for (const r of rects) rr(...r, .14, T.edge);
  for (const r of rects) rr(...r, 0, T.path);
  for (let i = 0; i < 500; i++){ const r = rects[i % rects.length], px = r[0] + ((i * 37) % 100) / 100 * (r[2] - r[0]), pz = r[1] + ((i * 61) % 100) / 100 * (r[3] - r[1]); x.fillStyle = i % 2 ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.1)'; x.fillRect(X(px), Z(pz), 4, 3); }
  const pad = (a, b, r) => { x.fillStyle = 'rgba(0,0,0,.22)'; x.beginPath(); x.arc(X(a), Z(b) + 6, r * S + 6, 0, 7); x.fill(); x.fillStyle = T.pad; x.beginPath(); x.arc(X(a), Z(b), r * S, 0, 7); x.fill(); x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 5; x.beginPath(); x.arc(X(a), Z(b), r * S - 8, 0, 7); x.stroke(); };
  for (const sz of [-1, 1]){ pad(0, sz * (L - 3), 2.25); pad(-5.5, sz * (L - 6.5), 1.65); pad(5.5, sz * (L - 6.5), 1.65); }
  if (id === 'field') for (let i = 0; i < 46; i++){ const fx = (i * 7919 % 1000) / 1000 * w, fz = (i * 104729 % 1000) / 1000 * h; x.fillStyle = i % 3 ? '#ffffff' : '#ffe27a'; for (let k = 0; k < 5; k++){ x.beginPath(); x.arc(fx + Math.cos(k * 1.257) * 5, fz + Math.sin(k * 1.257) * 5, 3.4, 0, 7); x.fill(); } x.fillStyle = '#ffb02e'; x.beginPath(); x.arc(fx, fz, 2.6, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
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
  const root = new THREE.Group(), stage = new THREE.Group(), fxW = new THREE.Group(), bars = new THREE.Group();
  scene.add(stage, root, fxW, bars);
  let me = 0, mapId = 'court', time = 0, shakeAmt = 0, lostGL = false;
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); lostGL = true; });
  renderer.domElement.addEventListener('webglcontextrestored', () => { lostGL = false; });

  /* ---------- camera ---------- */
  const camHome = new THREE.Vector3(), LOOKAT = new THREE.Vector3(0, 0, .8), fitCam = new THREE.PerspectiveCamera(), tv = new THREE.Vector3();
  const FIT = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) FIT.push(new THREE.Vector3(sx * 10.3, 0, sz * (L + 1.3))); FIT.push(new THREE.Vector3(0, 4.9, -(L - 2.4)), new THREE.Vector3(-9.9, 3.2, -L), new THREE.Vector3(9.9, 3.2, -L));
  function fit(){
    const a = camera.aspect, el = lerp(1.03, .88, clamp((a - .62) / .9, 0, 1)), dir = new THREE.Vector3(0, Math.sin(el), Math.cos(el));
    fitCam.fov = camera.fov; fitCam.aspect = a; fitCam.near = 1; fitCam.far = 300; fitCam.updateProjectionMatrix();
    let lo = 8, hi = 160;
    for (let i = 0; i < 22; i++){
      const d = (lo + hi) / 2;
      fitCam.position.copy(dir).multiplyScalar(d).add(LOOKAT); fitCam.lookAt(LOOKAT); fitCam.updateMatrixWorld(); fitCam.matrixWorldInverse.copy(fitCam.matrixWorld).invert();
      if (FIT.every(p => { tv.copy(p).project(fitCam); return Math.abs(tv.x) < .97 && tv.y < .97 && tv.y > -.94; })) hi = d; else lo = d;
    }
    camHome.copy(dir).multiplyScalar(hi).add(LOOKAT);
  }
  function resize(){
    const w = el.clientWidth || 2, h = el.clientHeight || 2;
    renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    camera.aspect = w / h; camera.updateProjectionMatrix(); fit();
  }

  /* ---------- particles: two pools (glow and smoke) ---------- */
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, '#fff'); g.addColorStop(.4, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  function pool(n, size, add){
    const pos = new Float32Array(n * 3).fill(999), col = new Float32Array(n * 4), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({size, map:dot, vertexColors:true, transparent:true, depthWrite:false, blending:add ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation:true}));
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
    return tiny(id, 256, 256, (x, w, h) => {
      if (id === 'field'){ x.fillStyle = '#3f8f34'; x.fillRect(0, 0, w, h); speck(x, w, h, 500, ['#368029', '#4aa03c', '#2f7424', '#55ab45'], 3); }
      else if (id === 'court'){ x.fillStyle = '#122a5e'; x.fillRect(0, 0, w, h); speck(x, w, h, 200, ['#16336f', '#0e2250'], 6); }
      else if (id === 'casino'){ x.fillStyle = '#2a0a22'; x.fillRect(0, 0, w, h); x.fillStyle = '#3a1030'; for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++){ x.beginPath(); x.moveTo(q * 64 + 32, r * 64 + 6); x.lineTo(q * 64 + 58, r * 64 + 32); x.lineTo(q * 64 + 32, r * 64 + 58); x.lineTo(q * 64 + 6, r * 64 + 32); x.fill(); } }
      else if (id === 'breakrm'){ x.fillStyle = '#5c7480'; x.fillRect(0, 0, w, h); x.fillStyle = '#667f8b'; x.fillRect(0, 0, 128, 128); x.fillRect(128, 128, 128, 128); }
      else { x.fillStyle = '#1b1e25'; x.fillRect(0, 0, w, h); speck(x, w, h, 500, ['#252933', '#14161c', '#2c303b'], 2); }
    }, 14, 14);
  }
  function setMap(id){
    mapId = id; flags.length = 0;
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
      const wm = new THREE.Mesh(new THREE.PlaneGeometry(18, RIVER * 2), new THREE.MeshStandardMaterial({map:waterTex, roughness:.15, envMapIntensity:.4, emissive:lk.water, emissiveIntensity:id === 'breakrm' ? .04 : .2})); wm.rotation.x = -PI / 2; wm.position.y = -.1; wm.receiveShadow = true; stage.add(wm);
      for (const sz of [-1, 1]){ box(stage, 18, .26, .34, id === 'field' ? 0x8a6a3f : stone, 0, .02, sz * (RIVER + .12)); }
      const wood = tiny('plank' + id, 128, 64, (x, w, h) => { const base = id === 'casino' ? [200, 160, 60] : id === 'breakrm' ? [200, 208, 220] : [185, 134, 74]; for (let i = 0; i < 8; i++){ const v = (i * 37 % 5) * 7 - 14; x.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v})`; x.fillRect(i * 16, 0, 15, h); x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(i * 16 + 15, 0, 1, h); } }, 1, 1);
      for (const b of map.bridges){
        wood.repeat.set(Math.max(1, Math.round(b.w / 2.6)), 1);
        const deck = new THREE.Mesh(new THREE.BoxGeometry(b.w, .3, RIVER * 2 + .9), new THREE.MeshStandardMaterial({map:wood, roughness:.8, envMapIntensity:.15})); deck.position.set(b.x, .0, 0); deck.castShadow = deck.receiveShadow = true; stage.add(deck);
        for (const sx of [-1, 1]){ box(stage, .2, .2, RIVER * 2 + 1.1, 0x6b4426, b.x + sx * (b.w / 2 - .08), .62, 0); for (const sz of [-1, 0, 1]) box(stage, .26, .7, .26, 0x8a5a2a, b.x + sx * (b.w / 2 - .08), .35, sz * (RIVER + .35)); }
      }
    }
    decor(id);
    for (const c of stage.children[stage.children.length - 1].children) if (Math.abs(c.position.z) > 16.2) c.position.z += Math.sign(c.position.z) * (L - 16);   // scenery beyond the ends moves out with them
  }
  function decor(id){
    const d = new THREE.Group(); stage.add(d);
    if (id === 'field'){
      const leaf = [0x3fae3f, 0x56c24a, 0x2f9836], ball = (xx, y, z, r, c) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), M(c)); m.position.set(xx, y, z); m.castShadow = true; d.add(m); };
      const tree = (xx, z, k) => { box(d, .5 * k, 1.6 * k, .5 * k, 0x7a4f2a, xx, .8 * k, z); ball(xx, 2.3 * k, z, 1.25 * k, leaf[0]); ball(xx + .7 * k, 1.9 * k, z + .3 * k, .85 * k, leaf[1]); ball(xx - .6 * k, 2 * k, z - .3 * k, .9 * k, leaf[2]); ball(xx + .1 * k, 3.1 * k, z, .8 * k, leaf[1]); };
      for (const sx of [-1, 1]){
        for (let i = 0; i < 3; i++){ const z = -10.2 + i * 10.2;                                     // plank stands
          box(d, 2.6, 2.2, 8.6, 0x9a6a3a, sx * 12, 1.1, z); box(d, 2.9, .3, 8.9, 0xc08a4c, sx * 12, 2.3, z);
          for (let k = 0; k < 6; k++) box(d, .12, 2.2, .18, 0x6b4426, sx * (12 - sx * 1.31), 1.1, z - 3.6 + k * 1.45);
          box(d, .2, 1.3, .2, 0x6b4426, sx * 12, 3.1, z - 3.6); box(d, .9, .6, .06, TEAM[i === 0 ? 1 : i === 2 ? 0 : (sx > 0 ? 0 : 1)], sx * 12 + .5, 3.45, z - 3.6); }
        for (const [z, k] of [[-19.5, 1.2], [19.5, 1.3], [-16, .9], [16.2, 1]]) tree(sx * (13.2 + (z > 0 ? 1 : 0)), z, k);
        for (const z of [-15.2, -5.1, 5.1, 15.2]){ ball(sx * 10.9, .5, z, .7, leaf[1]); ball(sx * 11.3, .4, z + .8, .5, leaf[0]); }
      }
      for (const sz of [-1, 1]) for (const xx of [-7.5, -3, 3, 7.5]){ ball(xx, .5, sz * 18, .75, leaf[sz > 0 ? 0 : 2]); ball(xx + .9, .4, sz * 18.3, .55, leaf[1]); }
      tree(-4.6, 20.8, 1.25); tree(5.2, 21.2, 1.4); tree(0, -20.5, 1.2);
    } else if (id === 'court'){
      for (const sx of [-1, 1]){
        for (let i = 0; i < 4; i++) box(d, 2.2, .7 + i * .7, 30, i % 2 ? 0x1b2f66 : 0x16264f, sx * (11 + i * 2.1), .35 + i * .35, 0, {r:.9});
        const n = low ? 60 : 150, im = new THREE.InstancedMesh(new THREE.SphereGeometry(.34, 8, 6), new THREE.MeshStandardMaterial({roughness:.8}), n), mt = new THREE.Matrix4(), cl = new THREE.Color(), pal = [0xff8a2b, 0xf2c14e, 0x4fb3ff, 0xffffff, 0xff5a4a, 0x4ade80];
        for (let i = 0; i < n; i++){ const row = i % 4; mt.makeTranslation(sx * (11 + row * 2.1 + (i * 13 % 7) * .1), 1.1 + row * .7, -14 + (i * 7919 % 2800) / 100); im.setMatrixAt(i, mt); im.setColorAt(i, cl.set(pal[i * 5 % 6])); }
        d.add(im); crowd.push(im);
      }
      for (const sz of [-1, 1]){ box(d, .3, 5, .3, 0x39425a, 0, 2.5, sz * 18.4, {m:.5}); box(d, 3.4, 2.2, .14, 0xf6f7fb, 0, 5.2, sz * 17.9, {r:.4}); const r = new THREE.Mesh(new THREE.TorusGeometry(.5, .06, 8, 20), M(0xff5a1f)); r.rotation.x = PI / 2; r.position.set(0, 4.5, sz * 17.2); d.add(r); }
    } else if (id === 'casino'){
      const cols = [0xff3d7f, 0x38e0ff, 0xf2c14e, 0x4ade80, 0xc77dff];
      for (const sx of [-1, 1]) for (let i = 0; i < 7; i++){
        const g = new THREE.Group(); g.position.set(sx * 11.2, 0, -13.5 + i * 4.5); g.rotation.y = -sx * PI / 2; d.add(g);
        box(g, 1.5, 2.6, 1.2, 0x241036, 0, 1.3, 0, {r:.5}); box(g, 1.2, .9, .06, cols[i % 5], 0, 1.8, .62, {e:cols[i % 5], ei:1.1}); box(g, 1.3, .5, .5, 0x3a1a52, 0, .95, .5, {r:.4}); box(g, 1.6, .36, 1.3, cols[(i + 2) % 5], 0, 2.78, 0, {e:cols[(i + 2) % 5], ei:.8});
      }
      for (const sz of [-1, 1]) for (let i = -1; i <= 1; i++){ const r = new THREE.Mesh(new THREE.TorusGeometry(1.5, .1, 8, 32), M(cols[(i + 2) % 5], {e:cols[(i + 2) % 5], ei:1.6})); r.position.set(i * 5.5, 3.4, sz * 19); d.add(r); }
    } else if (id === 'breakrm'){
      for (const sx of [-1, 1]){
        box(d, 1.4, 1.1, 30, 0x6b4426, sx * 11.4, .55, 0, {r:.7}); box(d, 1.6, .12, 30.2, 0xe9e4d6, sx * 11.4, 1.16, 0, {r:.4});
        for (let i = 0; i < 4; i++){ const z = -12 + i * 8; box(d, 1.2, 2.4, 1.1, [0xe0362c, 0x2a5bd7, 0xfafafa, 0x2aa876][i], sx * 13.2, 1.2, z, {r:.4}); box(d, .06, 1.6, .8, 0x10162a, sx * (13.2 - sx * .62), 1.4, z, {e:0x4fb3ff, ei:.5});
          box(d, .9, .5, .7, 0x39425a, sx * 11.4, 1.47, z + 3.4, {m:.5, r:.4}); box(d, .04, .34, .44, 0x10162a, sx * (11.4 - sx * .46), 1.47, z + 3.3, {e:0xffb547, ei:.8}); }
      }
      for (const sz of [-1, 1]) for (const sx of [-1, 1]){ const t = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, .12, 24), M(0xfbf8f2, {r:.5})); t.position.set(sx * 5, 1.1, sz * 19); d.add(t); box(d, .2, 1.1, .2, 0x39425a, sx * 5, .55, sz * 19, {m:.5}); }
    } else {
      const cars = [0xe0362c, 0x2a5bd7, 0xf2c14e, 0xfafafa, 0x2aa876, 0x8b93a6];
      for (const sx of [-1, 1]) for (let i = 0; i < 5; i++){
        const g = new THREE.Group(); g.position.set(sx * 11.6, 0, -12.5 + i * 6.2 + (sx > 0 ? 1.3 : 0)); g.rotation.y = sx * .08; d.add(g);
        box(g, 3.6, .7, 1.7, cars[(i * 2 + (sx > 0 ? 1 : 0)) % 6], 0, .65, 0, {r:.3, m:.4}); box(g, 1.9, .6, 1.5, 0x10162a, -.2, 1.25, 0, {r:.15, m:.5});
        for (const a of [-1, 1]) for (const b of [-1, 1]){ const w = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .24, 12), M(0x0d1020, {r:.9})); w.rotation.x = PI / 2; w.position.set(a * 1.15, .34, b * .86); g.add(w); }
        box(g, .06, .16, .4, 0xfff3c4, -sx * 1.81, .7, .5, {e:0xfff3c4, ei:1.5});
      }
      for (const sx of [-1, 1]) for (const z of [-11, 0, 11]){ box(d, .16, 6.5, .16, 0x39425a, sx * 9.9, 3.25, z, {m:.5}); box(d, 1.3, .12, .3, 0x39425a, sx * 9.4, 6.5, z, {m:.5}); box(d, .5, .08, .26, 0xfff3c4, sx * 9.0, 6.42, z, {e:0xffe9a8, ei:3});
        const pl = new THREE.Mesh(discG, new THREE.MeshBasicMaterial({color:0xffe9a8, transparent:true, opacity:.13, depthWrite:false, blending:THREE.AdditiveBlending})); pl.userData.keep = true; pl.rotation.x = -PI / 2; pl.scale.setScalar(5.2); pl.position.set(sx * 7.6, .03, z); d.add(pl); }
      for (const [a, b] of [[-9.6, 15.4], [9.6, 15.4], [-9.6, -15.4], [9.6, -15.4]]){ const c = new THREE.Mesh(new THREE.ConeGeometry(.3, .8, 10), M(0xff7a1f)); c.position.set(a, .4, b); d.add(c); }
    }
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
  function numTex(){ const c = document.createElement('canvas'); c.width = 128; c.height = 48; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return {c, t, v:-1}; }
  function make(e){
    const rel = e.team === me ? 0 : 1, U = e.U, m = makeModel(e.key, rel, {face:rel === 1, aff:U.aff});
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
    recs.set(e.id, r); return r;
  }
  function drawNum(r, v){
    const n = r.num; if (n.v === v) return; n.v = v;
    const x = n.c.getContext('2d'); x.clearRect(0, 0, 128, 48); x.font = '700 38px Teko, "Arial Narrow", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 7; x.strokeStyle = '#050c1c'; x.strokeText(v, 64, 27); x.fillStyle = '#fff'; x.fillText(v, 64, 27); n.t.needsUpdate = true;
  }
  function drop(r){
    root.remove(r.g); bars.remove(r.bar);
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
    else { bars.remove(r.bar); recs.delete(r.e.id); dying.push({g:r.g, t:0, spin:(Math.random() - .5) * 16}); flat(r.x, r.z, {r0:.2, r1:U.r * 2.2, dur:.3, color:0xffffff, add:true, a:.6}); }   // knocked into the air, spinning, then gone
  }
  const dying = [];
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
      if (r.lunge > 0) r.lunge -= dt; if (r.hit > 0) r.hit -= dt;
      const hop = e.mv && !m.fly && !U.bld && !frozen && !m.rig ? Math.abs(Math.sin(r.ph)) * (U.spd >= 1.9 ? .32 : U.r > .8 ? .05 : .12) : 0;
      m.g.position.set(0, (m.fly || 0) + hop, r.lunge > 0 ? Math.sin(r.lunge / .22 * PI) * (.35 + U.r * .5) : 0);
      if (!U.bld){ m.g.rotation.x = r.hit > 0 ? -Math.sin(r.hit / .18 * PI) * .32 : m.fly && e.mv ? .22 : 0; m.g.rotation.z = e.mv && !frozen && !m.rig ? Math.sin(r.ph) * (m.fly ? .14 : .07) : 0; }
      if (e.mv && !m.fly && !low && !frozen && (r.step = (r.step || 0) + dt) > .26){ r.step = 0; burst(r.x, .1, r.z, 1, 0xe6dcc4, {smoke:true, spd:.35, up:.45, life:.45, grav:-.3}); }
      if (r.pop > 0) r.pop -= dt;
      const sq = r.pop > 0 ? Math.sin(r.pop / .22 * PI) * .16 : 0;
      const ms = m.s || 1; m.g.scale.set(ms * (1 + sq), ms * (1 - sq), ms * (1 + sq));
      if (e.slow && Math.random() < dt * 5) burst(r.x, m.h * .5 + (m.fly || 0), r.z, 1, 0x9fdcff, {spd:.5, up:.8, life:.5, grav:-.5});
      if (e.hp < r.hp - .5 && r.landed){ if (e.hp < r.hp - 12 || Math.random() < .3) burst(r.x, m.h * .55 + (m.fly || 0), r.z, U.twr ? 5 : 3, 0xffe3a0, {spd:2, up:1.6, life:.3}); if (r.pop <= 0) r.pop = .1; r.hit = .18; }
      else if (e.hp > r.hp + 5) burst(r.x, m.h * .6 + (m.fly || 0), r.z, 4, 0x6dff9a, {spd:.8, up:2.2, life:.6, grav:-1});
      r.hp = e.hp;
      if (!frozen) m.anim(time, {mv:e.mv, ph:r.ph, atk:r.atk, chg:e.chg, aim, sum:r.sum, active:e.active, spd:U.spd * (e.rage ? 1.35 : 1) * (e.slow ? .62 : 1)});
      if (frozen && !r.ice){ r.ice = new THREE.Mesh(iceG, iceMat); r.ice.scale.set(U.r * 1.25, m.h * .58, U.r * 1.25); r.ice.position.y = m.h * .5 + (m.fly || 0); r.g.add(r.ice); }
      else if (!frozen && r.ice){ r.g.remove(r.ice); r.ice = null; burst(r.x, m.h * .5, r.z, 8, 0xbfe9ff, {spd:2.5, up:2, life:.4}); }
      if (r.ring){ r.ring.material = e.rage ? rageMat : ringMat[r.rel]; r.ring.scale.setScalar(U.r * (e.rage ? 1.3 + Math.sin(time * 12) * .1 : e.dep ? .7 + (time * 2 % 1) * .5 : 1.12)); }
      const show = r.landed && !e.dep && (U.twr || e.hp < e.max - .5);
      r.bar.visible = show;
      if (show){
        tv.set(r.x, m.h + (m.fly || 0) + (U.twr ? .5 : .3), r.z); root.localToWorld(tv); r.bar.position.copy(tv); r.bar.quaternion.copy(camera.quaternion);
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
    b.position.set(x, 17, z); root.add(b); beams.push({m:b, t:0});
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
  function screenOf(x, y, z){ tv.set(x, y, z); root.localToWorld(tv); tv.project(camera); const b = renderer.domElement.getBoundingClientRect(); return {x:b.left + (tv.x + 1) / 2 * b.width, y:b.top + (1 - tv.y) / 2 * b.height}; }

  /* ---------- frame ---------- */
  function frame(dt, ents){
    time += dt;
    if (ents) sync(ents, dt);
    if (ghost.visible){ const p = 1 + Math.sin(time * 7) * .06; gRing.scale.setScalar(gRing.scale.x / (gRing.userData.p || 1) * p); gRing.userData.p = p; if (gM && gM.g.visible){ gM.g.position.y = (gM.fly || 0) + .5 + Math.sin(time * 5) * .14; gM.anim(time, {mv:false, ph:0, atk:99, sum:99, aim:0, active:true, chg:false}); } }
    stepShots(dt); stepFlats(dt); stepBeams(dt); glow.step(dt); smoke.step(dt);
    if (waterTex) waterTex.offset.x = time * .035;
    for (let i = 0; i < crowd.length; i++) crowd[i].position.y = Math.abs(Math.sin(time * 3 + i)) * .12;
    for (let i = dying.length - 1; i >= 0; i--){ const d = dying[i]; d.t += dt; const k = d.t / .42; if (k >= 1){ root.remove(d.g); dying.splice(i, 1); continue; } d.g.position.y += dt * (5 - k * 9); d.g.rotation.z += dt * d.spin; d.g.rotation.x += dt * 6; d.g.scale.setScalar(Math.max(.01, 1 - k * k)); }
    for (let i = 0; i < flags.length; i++){ flags[i].rotation.y = Math.sin(time * 3.2 + i * 1.7) * .4; flags[i].scale.x = 1 + Math.sin(time * 5 + i) * .06; }
    if ((amb += dt) > (low ? .45 : .16)){ amb = 0; tc.set(AMB[mapId] || 0xffffff); glow.emit((Math.random() * 2 - 1) * 9, .4 + Math.random() * 2.5, (Math.random() * 2 - 1) * 16, (Math.random() - .5) * .4, .2 + Math.random() * .35, (Math.random() - .5) * .4, 2.6, tc, 0); }
    camera.position.copy(camHome);
    if (intro < 2.8){ intro += dt; const k = Math.min(1, intro / 2.8), q = 1 - Math.pow(1 - k, 3), a = (1 - q) * 2.4; camera.position.set(camHome.x + Math.sin(a) * 30 * (1 - q), camHome.y * (.38 + .62 * q), camHome.z * (.3 + .7 * q) + Math.cos(a) * 10 * (1 - q)); }   // fly in around the arena at the start
    if (punch.t > 0){ punch.t -= dt; camera.position.lerp(tv.set(punch.x, 7, punch.z + 9), Math.sin(Math.min(1, punch.t) * PI) * .22); }
    if (shakeAmt > .002){ camera.position.x += (Math.random() - .5) * shakeAmt; camera.position.y += (Math.random() - .5) * shakeAmt; shakeAmt *= Math.exp(-dt * 7); }
    camera.lookAt(LOOKAT);
    if (!lostGL) renderer.render(scene, camera);
  }
  function reset(team, map){
    me = team; root.rotation.y = team === 0 ? 0 : PI;
    for (const r of [...recs.values()]) drop(r);
    for (const c of root.children.slice()) if (c.userData.rubble) root.remove(c);
    for (const s of shots) root.remove(s.m); shots.length = 0;
    for (const f of flats){ root.remove(f.m); f.m.material.dispose(); } flats.length = 0;
    for (const b of beams){ root.remove(b.m); b.m.material.dispose(); } beams.length = 0;
    for (const d of dying) root.remove(d.g); dying.length = 0; intro = opt.reduced ? 9 : 0; punch.t = 0;
    glow.clear(); smoke.clear(); crowd.length = 0; shakeAmt = 0; setGhost(false); setNoGo(false);
    setMap(map); resize();
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
    const m = makeModel(key, 0, {face:true, aff}); outline(m.g, 1.07); m.g.scale.setScalar(m.s || 1); m.anim(.4, {mv:false, ph:.9, atk:99, sum:99, aim:.5, active:true, chg:false}); TR.sc.add(m.g);
    const bx = new THREE.Box3().setFromObject(m.g), c = bx.getCenter(new THREE.Vector3()), rad = bx.getSize(new THREE.Vector3()).length() / 2;
    TR.cam.position.copy(c).add(new THREE.Vector3(.75, .5, 2).normalize().multiplyScalar(rad / Math.sin(15 * PI / 180) * 1.02)); TR.cam.lookAt(c);
    TR.r.render(TR.sc, TR.cam); TR.sc.remove(m.g);
    return TR.r.domElement.toDataURL('image/png');
  }

  return { reset, resize, frame, events, pick, screenOf, setGhost, setNoGo, thumb, shake, burst, legend, get dom(){ return renderer.domElement; }, get count(){ return recs.size; } };
}
