// Environment (Agent 1 — World): sky, lights, fog, terrain, water/lava, distant ring, clouds,
// grandstands + crowd, waving flags and per-theme scenery. The theme comes from the track def's `env`
// (tracks.js): 'coast' (Palm Cove: island, lagoon, palms, lighthouse, boats), 'desert', 'snow', 'city',
// 'jungle', 'volcano'. Everything is code-generated low-poly geometry, merged or instanced.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './track-textures.js';

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function hash(ix, iz) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) { s += a * vnoise(x * f + o * 17.3, z * f - o * 9.1); norm += a; f *= 2.03; a *= 0.5; }
  return s / norm;
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Paint a whole geometry with one vertex colour (so several parts can be merged).
function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  const col = new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (g !== geo) geo.dispose();
  return g;
}
const stripUV = (g) => { g.deleteAttribute('uv'); return g; };
// merge parts and dispose them
const mergeAll = (parts) => { const g = mergeGeometries(parts); parts.forEach((p) => p.dispose()); return g; };

export function createEnvironment(scene, renderer, root, L) {
  const E = L.env || {};
  const KIND = E.kind || 'coast';
  const COAST = KIND === 'coast';
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const uniforms = { uTime: { value: 0 } };
  const WATER = L.waterLevel;
  const animators = [];   // (dt, time) => void, for theme props

  const SUN_DIR = E.sunDir ? new THREE.Vector3(...E.sunDir).normalize() : new THREE.Vector3(0.32, 0.78, -0.54).normalize();
  const SKY = E.sky || {};
  const COL = {
    top: new THREE.Color(SKY.top ?? 0x2f7fe0),
    horizon: new THREE.Color(SKY.horizon ?? 0xcfe8fb),
    bottom: new THREE.Color(SKY.bottom ?? 0x9cc9ea),
    sun: new THREE.Color(SKY.sun ?? 0xfff2cf),
  };

  // island centre
  const cx = (L.bounds.minX + L.bounds.maxX) / 2, cz = (L.bounds.minZ + L.bounds.maxZ) / 2;
  const ISLAND_R = 760;
  // non-coast worlds: a rounded rectangle around the course
  const HX = (L.bounds.maxX - L.bounds.minX) / 2 + (E.margin ?? 340);
  const HZ = (L.bounds.maxZ - L.bounds.minZ) / 2 + (E.margin ?? 340);
  const edgeR = (x, z) => { const a = Math.abs(x - cx) / HX, b = Math.abs(z - cz) / HZ; return Math.pow(a ** 4 + b ** 4, 0.25); };
  const BASE = E.baseLevel ?? -6;   // level the world edge falls to (skirt / sea / lava)

  // track helpers for theme placement
  const atLat = (f, lat = 0) => {
    const [x0, , z0] = L.at(f);
    const q = L.nearest(x0, z0);
    const i = q.i;
    return { i, x: L.px[i] + L.rx[i] * lat, y: L.py[i], z: L.pz[i] + L.rz[i] * lat, h: L.head[i] };
  };
  const sampleRange = (f0, f1) => [atLat(f0).i, atLat(f1).i];
  const inRange = (i, r) => (r[0] <= r[1] ? i >= r[0] && i <= r[1] : i >= r[0] || i <= r[1]);
  const rangeFade = (i, r, w) => {   // 0 at the ends of the range, 1 inside (w samples of ramp)
    if (!inRange(i, r)) return 0;
    const a = (i - r[0] + L.N) % L.N, b = (r[1] - i + L.N) % L.N;
    return smoothstep(0, w, Math.min(a, b));
  };

  // ------------------------------------------------------------------ sky dome
  const skyMat = keep(new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: COL.top }, uHorizon: { value: COL.horizon }, uBottom: { value: COL.bottom },
      uSunDir: { value: SUN_DIR }, uSunColor: { value: COL.sun },
    },
    defines: E.stars ? { STARS: '' } : {},
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSunDir; uniform vec3 uSunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = y > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.55, y), 0.75)) : mix(uHorizon, uBottom, smoothstep(0.0, -0.15, y));
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (smoothstep(0.9993, 0.9996, sd) * 4.0 + pow(sd, 60.0) * 0.45 + pow(sd, 6.0) * 0.12);
        #ifdef STARS
          vec3 sp = d * 220.0;
          vec3 cell = floor(sp);
          float hs = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float st = step(0.982, hs) * smoothstep(0.32, 0.05, length(fract(sp) - 0.5)) * smoothstep(0.02, 0.3, y);
          col += vec3(0.85, 0.9, 1.0) * st * (0.6 + 1.4 * fract(hs * 91.7));
        #endif
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false, fog: false,
  }));
  const skyGeo = keep(new THREE.SphereGeometry(900, 48, 24));
  const makeSky = () => {
    const m = new THREE.Mesh(skyGeo, skyMat);
    m.frustumCulled = false; m.renderOrder = -1000; m.name = 'sky';
    m.onBeforeRender = (r, s, cam) => { m.position.copy(cam.position); m.updateMatrixWorld(); };
    return m;
  };
  root.add(makeSky());

  // env map from the sky for PBR materials (karts)
  let envRT = null;
  const prevEnv = scene.environment, prevBg = scene.background, prevFog = scene.fog;
  const prevEnvIntensity = 'environmentIntensity' in scene ? scene.environmentIntensity : 1;
  try {
    if (renderer && renderer.isWebGLRenderer) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      envScene.add(makeSky());
      const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: E.envGround ?? 0x5d9a44 }));
      ground.position.y = -20; envScene.add(ground);
      envRT = pmrem.fromScene(envScene, 0.02, 0.1, 2000);
      ground.geometry.dispose(); ground.material.dispose();
      pmrem.dispose();
      scene.environment = envRT.texture;
      if ('environmentIntensity' in scene) scene.environmentIntensity = E.envIntensity ?? 0.55;
    }
  } catch (e) { envRT = null; }
  const FOG_COL = E.fogColor !== undefined ? new THREE.Color(E.fogColor) : COL.horizon.clone();
  scene.background = FOG_COL.clone();
  scene.fog = new THREE.Fog(FOG_COL.clone(), E.fog ? E.fog[0] : 380, E.fog ? E.fog[1] : 1550);

  // ------------------------------------------------------------------ lights
  const hemi = E.hemi ? new THREE.HemisphereLight(E.hemi[0], E.hemi[1], E.hemi[2]) : new THREE.HemisphereLight(0xcfe8ff, 0x7aa05a, 1.25);
  scene.add(hemi);
  const sun = E.sunLight ? new THREE.DirectionalLight(E.sunLight[0], E.sunLight[1]) : new THREE.DirectionalLight(0xfff0d8, 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const SH = 75;
  Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 600 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);
  const texel = (SH * 2) / 2048;
  function setShadowFocus(v) {
    if (!v || !isFinite(v.x)) return;
    const fx = Math.round(v.x / texel) * texel, fz = Math.round(v.z / texel) * texel;
    sun.target.position.set(fx, v.y || 0, fz);
    sun.position.set(fx, v.y || 0, fz).addScaledVector(SUN_DIR, 250);
    sun.target.updateMatrixWorld();
  }
  setShadowFocus(L.startPositions[0]?.position || new THREE.Vector3());

  // ------------------------------------------------------------------ terrain
  // theme landmarks that shape the ground
  const PEAK = E.peak ? atLat(E.peak.at, E.peak.lat || 0) : null;            // snow: the mountain
  const CONE = E.cone ? atLat(E.cone.at, E.cone.lat || 0) : null;            // volcano: the volcano
  const CANYON = E.canyon ? E.canyon.map(([a, b]) => sampleRange(a, b)) : []; // desert: canyon walls
  const riverPl = L.river && L.river.points;
  function riverDist(x, z) {
    if (!riverPl) return 1e9;
    let best = Infinity;
    for (let k = 0; k < riverPl.length - 1; k++) {
      const [ax, az] = riverPl[k], [bx, bz] = riverPl[k + 1];
      const sx = bx - ax, sz = bz - az, L2 = sx * sx + sz * sz || 1;
      const f = Math.min(1, Math.max(0, ((x - ax) * sx + (z - az) * sz) / L2));
      best = Math.min(best, Math.hypot(x - ax - sx * f, z - az - sz * f));
    }
    return best;
  }

  function natural(x, z) {
    if (COAST) {
      const dx = x - cx, dz = z - cz;
      const r = Math.hypot(dx, dz) / ISLAND_R;
      let h = 1.2 + 4.5 * fbm(x * 0.0075, z * 0.0075) + 9 * Math.pow(fbm(x * 0.004 - 20, z * 0.004 + 13, 3), 2.2);
      const ang = Math.atan2(dz, dx);
      const hillMask = smoothstep(0.58, 0.8, r) * (1 - smoothstep(0.86, 0.95, r)) * (0.45 + 0.55 * Math.max(0, Math.sin(ang * 3 + 1.3)));
      h += hillMask * (14 + 34 * fbm(x * 0.012 + 3, z * 0.012 - 7));
      h = lerp(h, -16, smoothstep(0.9, 1.06, r));
      const dl = Math.hypot(x - L.lake.x, z - L.lake.z);
      h = lerp(h, -9 - 3 * fbm(x * 0.03, z * 0.03), 1 - smoothstep(L.lake.r * 0.72, L.lake.r + 14, dl));
      return h;
    }
    const r = edgeR(x, z);
    const edgeHills = smoothstep(0.62, 0.86, r) * (1 - smoothstep(0.9, 0.98, r));
    let h;
    if (KIND === 'desert') {
      h = 1 + 6 * fbm(x * 0.005, z * 0.005) + 2.5 * fbm(x * 0.02 + 5, z * 0.02, 2);
      h += edgeHills * (16 + 46 * Math.pow(fbm(x * 0.009 + 7, z * 0.009 - 3, 3), 1.5));
    } else if (KIND === 'snow') {
      h = 2 + 9 * fbm(x * 0.006, z * 0.006);
      if (PEAK) { const d = Math.hypot(x - PEAK.x, z - PEAK.z); h += E.peak.h * Math.exp(-((d / E.peak.r) ** 2)) * (0.8 + 0.4 * fbm(x * 0.01, z * 0.01, 3)); }
      h += edgeHills * (30 + 95 * Math.pow(fbm(x * 0.007 - 2, z * 0.007 + 9, 4), 1.4));
    } else if (KIND === 'city') {
      h = -0.6;
    } else if (KIND === 'jungle') {
      h = 3 + 12 * fbm(x * 0.0055, z * 0.0055) + 4 * fbm(x * 0.02, z * 0.02, 2);
      h += edgeHills * (14 + 40 * fbm(x * 0.011 + 3, z * 0.011 - 7));
      const dr = riverDist(x, z);
      if (dr < 200) h = lerp(h, WATER - 4.5 - 2 * fbm(x * 0.03, z * 0.03), 1 - smoothstep(L.river.width * 0.42, L.river.width * 0.5 + 26, dr));
    } else { // volcano
      h = 2 + 7 * fbm(x * 0.006, z * 0.006) + 3 * fbm(x * 0.025, z * 0.025, 2);
      if (CONE) {
        const d = Math.hypot(x - CONE.x, z - CONE.z), R = E.cone.r;
        const s = Math.max(0, 1 - d / R);
        h += E.cone.h * Math.pow(s, 1.5) * (0.9 + 0.2 * fbm(x * 0.02, z * 0.02, 2));
        h -= E.cone.h * 0.32 * (1 - smoothstep(R * 0.05, R * 0.14, d));   // crater
      }
      // lava basins away from the course
      const lb = fbm(x * 0.004 + 11, z * 0.004 - 6, 3);
      h = lerp(h, BASE - 3, smoothstep(0.56, 0.66, lb) * 0.95);
      h += edgeHills * (18 + 40 * fbm(x * 0.01 + 1, z * 0.01, 3));
    }
    return lerp(h, BASE - 4, smoothstep(0.95, 1.06, r));
  }
  const CORR = E.corridor || [4, 58];
  // gaps: keep the terrain well below the trough
  let dipT = null;
  if (L.dip && L.gaps && L.gaps.length) {
    dipT = new Float32Array(L.N);
    const w = Math.round(14 / L.ds);
    for (let i = 0; i < L.N; i++) if (L.dip[i] > 0) {
      for (let k = -w; k <= w; k++) { const j = (i + k + L.N) % L.N; dipT[j] = Math.max(dipT[j], L.dip[i] + 1.5); }
    }
  }
  const corridor = { w: 0, y: 0, d: 0, wall: 0, i: -1, lat: 0 };
  function corridorAt(x, z) {
    const q = L.nearest(x, z, true);
    corridor.i = q.i;
    if (q.i < 0) { corridor.w = 0; corridor.d = 1e9; return corridor; }
    const i = q.i, d = Math.sqrt(q.d2);
    const lat = (x - L.px[i]) * L.rx[i] + (z - L.pz[i]) * L.rz[i];
    const wall = lat >= 0 ? L.wallR[i] : L.wallL[i];
    corridor.d = d; corridor.wall = wall; corridor.y = dipT ? L.py[i] - dipT[i] : L.py[i]; corridor.lat = lat;
    corridor.w = (1 - smoothstep(wall + CORR[0], wall + CORR[1], d)) * (1 - L.bridge[i]);
    return corridor;
  }
  function extraH(c) {
    if (!CANYON.length || c.i < 0) return 0;
    let f = 0;
    for (const r of CANYON) f = Math.max(f, rangeFade(c.i, r, Math.round(60 / L.ds)));
    if (f <= 0) return 0;
    return f * (E.canyonH ?? 34) * smoothstep(c.wall + 3, c.wall + 18, c.d) * (0.85 + 0.3 * fbm(c.i * 0.02, c.lat * 0.05, 2));
  }
  function heightAt(x, z) {
    let n = natural(x, z);
    const c = corridorAt(x, z);
    if (!COAST) n += extraH(c);
    return c.w > 0 ? lerp(n, c.y - 0.6, c.w) : n;
  }

  const T_SIZE = COAST ? 1900 : Math.ceil(2 * Math.max(HX, HZ) * 1.1);
  const T_SEG = COAST ? 280 : KIND === 'city' ? 96 : Math.min(300, Math.round(T_SIZE / 7));
  const tGeo = keep(new THREE.PlaneGeometry(T_SIZE, T_SIZE, T_SEG, T_SEG).rotateX(-Math.PI / 2));
  tGeo.translate(cx, 0, cz);
  const tPos = tGeo.attributes.position;
  const tCol = new Float32Array(tPos.count * 3);
  const near = new Float32Array(tPos.count);
  const res = T_SEG + 1;
  const depthData = new Uint8Array(res * res * 4);
  for (let k = 0; k < tPos.count; k++) {
    const x = tPos.getX(k), z = tPos.getZ(k);
    const h = heightAt(x, z);
    tPos.setY(k, h);
    near[k] = corridor.w;
  }
  tGeo.computeVertexNormals();
  {
    const c = new THREE.Color();
    const nrm = tGeo.attributes.normal;
    if (COAST) {
      const sandWet = new THREE.Color(0xcdb277), sand = new THREE.Color(0xf1dca0);
      const g1 = new THREE.Color(0x58ad37), g2 = new THREE.Color(0x8fd352), g3 = new THREE.Color(0x3f8a2e);
      const rock = new THREE.Color(0x9c9588), under = new THREE.Color(0x8fae8f);
      for (let k = 0; k < tPos.count; k++) {
        const x = tPos.getX(k), y = tPos.getY(k), z = tPos.getZ(k);
        const n1 = fbm(x * 0.02, z * 0.02, 3);
        c.copy(g1).lerp(g2, smoothstep(0.35, 0.7, n1));
        c.lerp(g3, smoothstep(14, 30, y) * 0.8);
        c.lerp(g2, near[k] * 0.35);
        const slope = 1 - nrm.getY(k);
        c.lerp(rock, smoothstep(0.22, 0.4, slope));
        const beach = (1 - smoothstep(WATER + 1.6, WATER + 3.2, y)) * (1 - smoothstep(0.02, 0.2, near[k]));
        c.lerp(sand, beach);
        c.lerp(sandWet, (1 - smoothstep(WATER - 0.5, WATER + 0.6, y)) * (1 - near[k]));
        c.lerp(under, smoothstep(WATER - 1, WATER - 8, y) * 0.5);
        tCol[k * 3] = c.r; tCol[k * 3 + 1] = c.g; tCol[k * 3 + 2] = c.b;
      }
    } else {
      const P = E.ground || {};
      const C = (v, d) => new THREE.Color(v ?? d);
      const g1 = C(P.a, 0x888888), g2 = C(P.b, 0xaaaaaa), g3 = C(P.high, 0x777777), rock = C(P.rock, 0x8a8a8a);
      const nearC = C(P.near, g2.getHex()), low = C(P.low, g1.getHex());
      const bands = P.bands ? P.bands.map((v) => new THREE.Color(v)) : null;
      for (let k = 0; k < tPos.count; k++) {
        const x = tPos.getX(k), y = tPos.getY(k), z = tPos.getZ(k);
        const n1 = fbm(x * 0.02, z * 0.02, 3);
        c.copy(g1).lerp(g2, smoothstep(0.35, 0.7, n1));
        c.lerp(g3, smoothstep(P.highFrom ?? 18, (P.highFrom ?? 18) + 20, y) * 0.8);
        const slope = 1 - nrm.getY(k);
        if (bands) {   // layered rock strata on steep ground
          const b = bands[Math.abs(Math.floor(y / 4.5 + fbm(x * 0.01, z * 0.01, 2) * 1.5)) % bands.length];
          c.lerp(b, smoothstep(0.12, 0.3, slope));
        } else c.lerp(rock, smoothstep(P.rockFrom ?? 0.25, (P.rockFrom ?? 0.25) + 0.18, slope));
        c.lerp(nearC, near[k] * 0.5);
        c.lerp(low, smoothstep(P.lowFrom ?? (BASE + 6), P.lowTo ?? (BASE + 1), y));
        tCol[k * 3] = c.r; tCol[k * 3 + 1] = c.g; tCol[k * 3 + 2] = c.b;
      }
    }
    // depth texture for water shading (PlaneGeometry rows run -z..+z after rotateX)
    for (let k = 0; k < tPos.count; k++) {
      const col = k % res;
      const z = tPos.getZ(k);
      const ix = col, iz = Math.round((z - (cz - T_SIZE / 2)) / T_SIZE * T_SEG);
      const depth = Math.min(1, Math.max(0, (WATER - tPos.getY(k)) / 9));
      const o = (iz * res + ix) * 4;
      depthData[o] = depth * 255; depthData[o + 1] = 0; depthData[o + 2] = 0; depthData[o + 3] = 255;
    }
  }
  tGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
  const detail = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, 256, 256);
    const rnd = mulberry(7);
    for (let i = 0; i < 7000; i++) {
      ctx.fillStyle = ['#d2d2d2', '#f6f6f6', '#dcdcdc', '#c4c4c4'][(rnd() * 4) | 0];
      ctx.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2.5);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
    t.repeat.set(T_SIZE / 9, T_SIZE / 9);
    return keep(t);
  })();
  const terrainMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, map: detail }));
  const terrain = new THREE.Mesh(tGeo, terrainMat);
  terrain.receiveShadow = true; terrain.name = 'terrain';
  root.add(terrain);

  // ------------------------------------------------------------------ water (sea / river)
  const HAS_WATER = COAST || KIND === 'jungle';
  let waterMat = null;
  if (HAS_WATER) {
    const W = E.water || {};
    const depthTex = keep(new THREE.DataTexture(depthData, res, res, THREE.RGBAFormat));
    depthTex.magFilter = THREE.LinearFilter; depthTex.minFilter = THREE.LinearFilter;
    depthTex.needsUpdate = true;
    waterMat = keep(new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 },
        uSunDir: { value: SUN_DIR.clone() },
        uDeep: { value: new THREE.Color(W.deep ?? 0x0f6fb3) },
        uShallow: { value: new THREE.Color(W.shallow ?? 0x3fd6d0) },
        uSky: { value: new THREE.Color(W.sky ?? 0xc4e6ff) },
        uFoam: { value: new THREE.Color(W.foam ?? 0xffffff) },
        uDepth: { value: null },
        uBounds: { value: new THREE.Vector3(cx - T_SIZE / 2, cz - T_SIZE / 2, T_SIZE) },
      }]),
      vertexShader: /* glsl */`
        varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uSunDir; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uFoam;
        uniform sampler2D uDepth; uniform vec3 uBounds;
        varying vec3 vWorld;
        #include <fog_pars_fragment>
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        vec2 waveGrad(vec2 p, float t) {
          vec2 g = vec2(0.0);
          vec2 d1 = normalize(vec2(0.7, 0.4)), d2 = normalize(vec2(-0.3, 0.9)), d3 = normalize(vec2(0.9, -0.5)), d4 = normalize(vec2(-0.8, -0.3));
          g += d1 * cos(dot(p, d1) * 0.11 + t * 1.3) * 0.22;
          g += d2 * cos(dot(p, d2) * 0.19 + t * 1.7) * 0.16;
          g += d3 * cos(dot(p, d3) * 0.37 + t * 2.3) * 0.10;
          g += d4 * cos(dot(p, d4) * 0.61 + t * 2.9) * 0.07;
          float e = 0.35;
          vec2 q = p * 0.35 + vec2(t * 0.4, t * 0.25);
          float n0 = vn(q), nx = vn(q + vec2(e, 0.0)), nz = vn(q + vec2(0.0, e));
          g += vec2(nx - n0, nz - n0) / e * 0.18;
          return g;
        }
        void main() {
          vec2 p = vWorld.xz;
          vec2 g = waveGrad(p, uTime);
          vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
          vec2 duv = (p - uBounds.xy) / uBounds.z;
          float depth = 1.0;
          if (duv.x > 0.0 && duv.x < 1.0 && duv.y > 0.0 && duv.y < 1.0) depth = texture2D(uDepth, duv).r;
          vec3 col = mix(uShallow, uDeep, smoothstep(0.02, 0.55, depth));
          col = mix(col, uSky, clamp(fres * 0.75, 0.0, 0.75));
          vec3 H = normalize(uSunDir + V);
          float spec = pow(max(dot(n, H), 0.0), 260.0) * 3.0;
          float sparkle = step(0.985, vn(p * 1.7 + uTime * 0.8)) * pow(max(dot(n, H), 0.0), 20.0) * 1.5;
          float foamBand = smoothstep(0.1, 0.0, depth);
          float foamWave = 0.55 + 0.45 * sin(depth * 70.0 - uTime * 2.2 + vn(p * 0.25) * 6.0);
          float foam = clamp(foamBand * foamWave + smoothstep(0.03, 0.0, depth), 0.0, 1.0) * step(0.001, depth + 0.001);
          col = mix(col, uFoam, foam * 0.9);
          col += (spec + sparkle) * vec3(1.0, 0.96, 0.85);
          float alpha = mix(0.62, 0.96, smoothstep(0.0, 0.35, depth));
          alpha = max(alpha, foam);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true, fog: true, depthWrite: true,
    }));
    waterMat.uniforms.uDepth.value = depthTex;
    const waterGeo = keep(new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2));
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(cx, WATER, cz);
    water.name = 'water';
    water.renderOrder = 1;
    root.add(water);
  }

  // ------------------------------------------------------------------ lava sea (volcano) / ground skirt (others)
  let lavaMat = null;
  if (KIND === 'volcano') {
    lavaMat = keep(new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
      vertexShader: /* glsl */`
        varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime;
        varying vec3 vWorld;
        #include <fog_pars_fragment>
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          vec2 p = vWorld.xz * 0.045;
          float t = uTime * 0.12;
          float n = vn(p + vec2(t, t * 0.6)) * 0.55 + vn(p * 2.3 - vec2(t * 1.3, -t)) * 0.3 + vn(p * 5.1 + t) * 0.15;
          float crust = smoothstep(0.42, 0.62, n);
          vec3 hot = mix(vec3(1.0, 0.36, 0.02), vec3(1.0, 0.82, 0.25), smoothstep(0.0, 0.4, n));
          vec3 col = mix(hot * 1.6, vec3(0.16, 0.05, 0.03), crust);
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
      fog: true, toneMapped: false,
    }));
    const lg = keep(new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2));
    const lava = new THREE.Mesh(lg, lavaMat);
    lava.position.set(cx, BASE, cz);
    lava.name = 'lavaSea';
    root.add(lava);
  } else if (!HAS_WATER) {
    const sg = keep(new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2));
    const skirt = new THREE.Mesh(sg, keep(new THREE.MeshLambertMaterial({ color: E.skirt ?? 0x888888 })));
    skirt.position.set(cx, BASE - 3.5, cz);
    skirt.name = 'groundSkirt';
    skirt.receiveShadow = false;
    root.add(skirt);
  }

  // ------------------------------------------------------------------ mountains (distant, own haze)
  if (COAST) {
    const rnd = mulberry(99);
    const geos = [];
    const haze = COL.horizon.clone();
    const grass = new THREE.Color(0x4f8f45), rockC = new THREE.Color(0x8b8f9c), snow = new THREE.Color(0xf6f9ff);
    const count = 22;
    for (let m = 0; m < count; m++) {
      const ang = (m / count) * Math.PI * 2 + rnd() * 0.2;
      const dist = 1080 + rnd() * 380;
      const rad = 140 + rnd() * 170, hgt = 170 + rnd() * 260;
      const g = new THREE.ConeGeometry(rad, hgt, 11, 6).toNonIndexed();
      const pos = g.attributes.position;
      const seed = rnd() * 100;
      const colors = new Float32Array(pos.count * 3);
      const c = new THREE.Color();
      for (let k = 0; k < pos.count; k++) {
        let x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
        const hr = (y + hgt / 2) / hgt;
        const a = Math.atan2(z, x);
        const nn = fbm(Math.cos(a) * 2 + seed, Math.sin(a) * 2 + hr * 3, 3);
        const s = 1 + (nn - 0.5) * 0.7 * (1 - hr);
        x *= s; z *= s; y += (nn - 0.5) * hgt * 0.12 * (1 - hr) * hr * 4;
        pos.setXYZ(k, x, y, z);
      }
      // colours by height of each triangle (flat)
      for (let k = 0; k < pos.count; k += 3) {
        const yy = (pos.getY(k) + pos.getY(k + 1) + pos.getY(k + 2)) / 3;
        const hr = (yy + hgt / 2) / hgt + (rnd() - 0.5) * 0.08;
        c.copy(hr < 0.45 ? grass : hr < 0.74 ? rockC : snow);
        if (hr >= 0.45 && hr < 0.74) c.lerp(grass, (0.74 - hr) * 1.2);
        c.lerp(haze, 0.3 + 0.15 * (dist - 1080) / 380);
        for (let j = 0; j < 3; j++) { colors[(k + j) * 3] = c.r; colors[(k + j) * 3 + 1] = c.g; colors[(k + j) * 3 + 2] = c.b; }
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      g.deleteAttribute('uv');
      g.computeVertexNormals();
      g.translate(cx + Math.cos(ang) * dist, hgt / 2 - 25, cz + Math.sin(ang) * dist);
      geos.push(g);
    }
    const mg = keep(mergeGeometries(geos));
    geos.forEach((g) => g.dispose());
    const mm = new THREE.Mesh(mg, keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false })));
    mm.name = 'mountains';
    root.add(mm);
  } else if (E.ring) {
    buildRing(E.ring);
  }

  // Distant ring for non-coast themes: peaks, mesas, jungle hills or a city skyline.
  function buildRing(R) {
    const rnd = mulberry(R.seed ?? 99);
    const geos = [];
    const haze = FOG_COL.clone();
    const cols = (R.colors || [0x4f8f45, 0x8b8f9c, 0xf6f9ff]).map((v) => new THREE.Color(v));
    const count = R.count ?? 24;
    const r0 = Math.max(HX, HZ) * 1.12 + 150;
    for (let m = 0; m < count; m++) {
      const ang = (m / count) * Math.PI * 2 + rnd() * 0.2;
      const dist = r0 + rnd() * 380;
      const rad = (R.rad ?? 150) * (0.8 + rnd() * 0.9), hgt = (R.hgt ?? 260) * (0.6 + rnd() * 0.8);
      let g;
      if (R.shape === 'mesa') g = new THREE.CylinderGeometry(rad * 0.75, rad, hgt * 0.45, 9, 4).toNonIndexed();
      else if (R.shape === 'tower') g = new THREE.BoxGeometry(rad * 0.35, hgt, rad * 0.35, 1, 6, 1).toNonIndexed();
      else g = new THREE.ConeGeometry(rad, hgt, 11, 6).toNonIndexed();
      g.deleteAttribute('uv');
      const pos = g.attributes.position;
      g.computeBoundingBox();
      const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y;
      const seed = rnd() * 100;
      if (R.shape !== 'tower') {
        for (let k = 0; k < pos.count; k++) {
          let x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
          const hr = (y - y0) / (y1 - y0);
          const a = Math.atan2(z, x);
          const nn = fbm(Math.cos(a) * 2 + seed, Math.sin(a) * 2 + hr * 3, 3);
          const s = 1 + (nn - 0.5) * (R.shape === 'mesa' ? 0.35 : 0.7) * (1 - hr * (R.shape === 'mesa' ? 0.2 : 1));
          x *= s; z *= s;
          if (R.shape !== 'mesa') y += (nn - 0.5) * hgt * 0.12 * (1 - hr) * hr * 4;
          pos.setXYZ(k, x, y, z);
        }
      }
      const colors = new Float32Array(pos.count * 3);
      const c = new THREE.Color();
      for (let k = 0; k < pos.count; k += 3) {
        const yy = (pos.getY(k) + pos.getY(k + 1) + pos.getY(k + 2)) / 3;
        const hr = (yy - y0) / (y1 - y0) + (rnd() - 0.5) * 0.08;
        if (R.shape === 'mesa') c.copy(cols[Math.abs(Math.floor(hr * 7)) % cols.length]);
        else if (R.shape === 'tower') c.copy(cols[m % cols.length]);
        else c.copy(hr < (R.snowLine0 ?? 0.45) ? cols[0] : hr < (R.snowLine ?? 0.74) ? cols[1] : cols[2]);
        c.lerp(haze, (R.haze ?? 0.3) + 0.15 * (dist - r0) / 380);
        for (let j = 0; j < 3; j++) { colors[(k + j) * 3] = c.r; colors[(k + j) * 3 + 1] = c.g; colors[(k + j) * 3 + 2] = c.b; }
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      g.computeVertexNormals();
      g.translate(cx + Math.cos(ang) * dist, -y0 + (R.base ?? BASE - 20), cz + Math.sin(ang) * dist);
      geos.push(g);
    }
    const mg = keep(mergeAll(geos));
    const mm = new THREE.Mesh(mg, keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false, emissive: R.emissive ?? 0x000000 })));
    mm.name = 'mountains';
    root.add(mm);
  }

  // ------------------------------------------------------------------ clouds
  const cloudGroup = new THREE.Group();
  cloudGroup.position.set(cx, 0, cz);
  root.add(cloudGroup);
  const CL = COAST ? {} : E.clouds;
  if (CL) {
    const rnd = mulberry(5);
    const parts = [];
    for (let k = 0; k < 7; k++) {
      const s = 7 + rnd() * 7;
      const g = new THREE.IcosahedronGeometry(s, 1);
      g.scale(1, 0.72, 1);
      g.translate((k - 3) * 7 + rnd() * 4, (3 - Math.abs(k - 3)) * 2.5 + rnd() * 3, rnd() * 10 - 5);
      parts.push(stripUV(g));
    }
    const cg = keep(mergeGeometries(parts));
    parts.forEach((g) => g.dispose());
    const cm = keep(new THREE.MeshLambertMaterial({ color: CL.color ?? 0xffffff, emissive: CL.emissive ?? 0x9aa8bb, flatShading: true, fog: false }));
    const COUNT = CL.count ?? 34;
    const im = new THREE.InstancedMesh(cg, cm, COUNT);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const spread = COAST ? 800 : Math.max(HX, HZ) * 1.05;
    for (let k = 0; k < COUNT; k++) {
      const a = rnd() * Math.PI * 2, r = 250 + rnd() * spread;
      p.set(Math.cos(a) * r, (CL.y ?? 190) + rnd() * 160, Math.sin(a) * r);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI);
      const sc = 1.2 + rnd() * 2.2;
      s.set(sc, sc * (0.8 + rnd() * 0.4), sc);
      im.setMatrixAt(k, m4.compose(p, q, s));
    }
    im.frustumCulled = false;
    cloudGroup.add(im);
  }

  // ------------------------------------------------------------------ placement helpers
  const standZones = [];   // {i0, i1, side, depth} along-sample ranges with grandstands
  const inStand = (i, lat, d, wall) => {
    for (const z of standZones) {
      const inRange = z.i0 <= z.i1 ? (i >= z.i0 && i <= z.i1) : (i >= z.i0 || i <= z.i1);
      if (inRange && Math.sign(lat) === z.side && d < wall + z.depth) return true;
    }
    return false;
  };
  function spot(x, z, minClear) {
    const q = L.nearest(x, z, true);
    if (q.i < 0) return { ok: true, d: 1e9, i: -1 };
    const i = q.i, d = Math.sqrt(q.d2);
    const lat = (x - L.px[i]) * L.rx[i] + (z - L.pz[i]) * L.rz[i];
    const wall = lat >= 0 ? L.wallR[i] : L.wallL[i];
    if (d < wall + minClear) return { ok: false };
    if (inStand(i, lat, d, wall)) return { ok: false };
    return { ok: true, d: d - wall, i };
  }

  // ------------------------------------------------------------------ grandstands + crowd
  const shaderHooks = [];
  const withTime = (material, vertexPatch) => {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vertexPatch);
    };
    shaderHooks.push(material);
    return material;
  };
  {
    const rnd = mulberry(123);
    const nSteps = (m) => Math.round(m / L.ds);
    const defs = E.stands || [
      { from: -150, to: 70, side: 1, tiers: 8 },
      { from: -70, to: 45, side: -1, tiers: 6 },
    ];
    const standGeos = [];
    const crowd = [];
    const seatCols = E.seatCols || [0x1e6fe8, 0xf7f7f7, 0xe8322f, 0xffd21f];
    const roofCols = E.roofCols || [0xe8322f, 0xffffff];
    const SEG_LEN = 10;
    for (const def of defs) {
      const i0 = ((nSteps(def.from) % L.N) + L.N) % L.N, i1 = ((nSteps(def.to) % L.N) + L.N) % L.N;
      const depth = 4 + def.tiers * 1.6 + 4;
      standZones.push({ i0, i1, side: def.side, depth });
      const segSamples = nSteps(SEG_LEN);
      const total = nSteps(def.to - def.from);
      for (let k = 0; k <= total - segSamples; k += segSamples) {
        const i = (i0 + k + Math.floor(segSamples / 2)) % L.N;
        const wall = def.side > 0 ? L.wallR[i] : L.wallL[i];
        const base = new THREE.Vector3(L.px[i], L.py[i], L.pz[i]);
        const right = new THREE.Vector3(L.rx[i], 0, L.rz[i]).multiplyScalar(def.side); // outward
        const rotY = Math.atan2(right.x, right.z);   // local +Z = outward, local X along track
        const place = (g, lx, ly, lz) => {
          g.rotateY(rotY);
          const off = right.clone().multiplyScalar(wall + 3 + lz);
          const along = new THREE.Vector3(-right.z, 0, right.x).multiplyScalar(lx);
          g.translate(base.x + off.x + along.x, base.y + ly, base.z + off.z + along.z);
          return g;
        };
        // front wall
        standGeos.push(place(paint(stripUV(new THREE.BoxGeometry(SEG_LEN + 0.05, 4, 0.5)), E.standWall ?? 0xdad7cf), 0, -1, 0));
        for (let t = 0; t < def.tiers; t++) {
          const top = 1 + t * 0.85;
          standGeos.push(place(paint(stripUV(new THREE.BoxGeometry(SEG_LEN + 0.05, top + 3, 1.6)), seatCols[(t + (k / segSamples | 0)) % 4]), 0, (top - 3) / 2, 0.5 + t * 1.6 + 0.8));
          // crowd on this tier
          for (let c = 0; c < 6; c++) {
            if (rnd() < 0.12) continue;
            crowd.push({
              p: base.clone().addScaledVector(right, wall + 3 + 0.5 + t * 1.6 + 0.8 + (rnd() - 0.5) * 0.3)
                .addScaledVector(new THREE.Vector3(-right.z, 0, right.x), (c - 2.5) * (SEG_LEN / 6) + (rnd() - 0.5) * 0.6)
                .setY(base.y + top),
              rot: rotY + Math.PI,
            });
          }
        }
        const backZ = 0.5 + def.tiers * 1.6 + 0.3;
        const roofY = 1 + def.tiers * 0.85 + 4.2;
        standGeos.push(place(paint(stripUV(new THREE.BoxGeometry(SEG_LEN + 0.05, roofY + 3, 0.6)), E.standBack ?? 0xcfcac0), 0, (roofY - 3) / 2, backZ));
        // roof (sloped canopy) + pillars
        const roof = paint(stripUV(new THREE.BoxGeometry(SEG_LEN + 0.1, 0.4, def.tiers * 1.6 + 3)), (k / segSamples | 0) % 2 ? roofCols[0] : roofCols[1]);
        roof.rotateX(-0.08);
        standGeos.push(place(roof, 0, roofY, backZ - (def.tiers * 1.6 + 3) / 2 + 0.3));
        standGeos.push(place(paint(stripUV(new THREE.CylinderGeometry(0.18, 0.18, roofY - 1, 6)), 0x9aa0a8), -SEG_LEN / 2 + 0.3, (roofY - 1) / 2 + 1, 0.5));
      }
    }
    const sg = keep(mergeGeometries(standGeos));
    standGeos.forEach((g) => g.dispose());
    const stands = new THREE.Mesh(sg, keep(new THREE.MeshLambertMaterial({ vertexColors: true })));
    stands.castShadow = true; stands.receiveShadow = true; stands.name = 'grandstands';
    root.add(stands);

    // crowd: body + head instanced, bouncing via shader
    const bodyGeo = keep(new THREE.CylinderGeometry(0.28, 0.36, 0.95, 6, 1, true).translate(0, 0.55, 0));
    const headGeo = keep(new THREE.SphereGeometry(0.27, 6, 4).translate(0, 1.28, 0));
    const bounce = `
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 1.37 + instanceMatrix[3].z * 0.71;
        float jumper = step(0.45, fract(ph * 0.173));
        transformed.y += jumper * max(0.0, sin(uTime * (7.0 + fract(ph) * 3.0) + ph)) * 0.38;
      #endif`;
    const bodyMat = keep(withTime(new THREE.MeshLambertMaterial(), bounce));
    const headMat = keep(withTime(new THREE.MeshLambertMaterial(), bounce));
    const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, crowd.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, crowd.length);
    const shirt = [0xe53935, 0x43a047, 0x1e88e5, 0xfdd835, 0x8e24aa, 0xff7043, 0x00acc1, 0xf06292, 0xffffff];
    const skin = [0xffd2a6, 0xf1c08b, 0xc68a5a, 0x8d5a3b, 0xffe0bd];
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    crowd.forEach((cr, k) => {
      m4.makeRotationY(cr.rot).setPosition(cr.p);
      bodies.setMatrixAt(k, m4); heads.setMatrixAt(k, m4);
      bodies.setColorAt(k, c.setHex(shirt[(rnd() * shirt.length) | 0]));
      heads.setColorAt(k, c.setHex(skin[(rnd() * skin.length) | 0]));
    });
    root.add(bodies, heads);
  }

  // ------------------------------------------------------------------ waving flags
  if (E.flags !== false) {
    const flagSpots = [];
    // along stands + around the course on the outside of corners
    const step = Math.round(55 / L.ds);
    for (let i = 0; i < L.N; i += step) {
      if (L.bridge[i] > 0.2) continue;
      const side = L.kS[i] > 0 ? 1 : -1;  // outside of turn
      const wall = side > 0 ? L.wallR[i] : L.wallL[i];
      const lat = side * (wall + 2.2);
      const x = L.px[i] + L.rx[i] * lat, z = L.pz[i] + L.rz[i] * lat;
      if (!spot(x, z, 1.5).ok) continue;
      flagSpots.push({ x, y: L.py[i] - 0.5, z, rot: L.head[i] + Math.PI / 2 });
    }
    for (const zdef of standZones) {
      const len = ((zdef.i1 - zdef.i0) + L.N) % L.N;
      for (let k = 0; k <= len; k += Math.round(12 / L.ds)) {
        const i = (zdef.i0 + k) % L.N;
        const wall = zdef.side > 0 ? L.wallR[i] : L.wallL[i];
        const lat = zdef.side * (wall + zdef.depth - 4.8);
        flagSpots.push({ x: L.px[i] + L.rx[i] * lat, y: L.py[i] + 1 + 8 * 0.85 + 3.2, z: L.pz[i] + L.rz[i] * lat, rot: L.head[i] + Math.PI / 2, short: true });
      }
    }
    const poleGeo = keep(new THREE.CylinderGeometry(0.1, 0.13, 8, 6).translate(0, 4, 0));
    const poleMat = keep(new THREE.MeshLambertMaterial({ color: 0xe9ecef }));
    const flagGeo = keep(new THREE.PlaneGeometry(3.2, 1.9, 12, 4).translate(1.6, 7, 0));
    const flagMat = keep(withTime(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), `
      #ifdef USE_INSTANCING
        float fph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
        float fw = clamp(position.x / 3.2, 0.0, 1.0);
        transformed.z += sin(uTime * 6.0 - position.x * 1.7 + fph) * 0.42 * fw;
        transformed.y += sin(uTime * 3.7 - position.x * 1.2 + fph) * 0.12 * fw;
      #endif`));
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, flagSpots.length);
    const flags = new THREE.InstancedMesh(flagGeo, flagMat, flagSpots.length);
    const fcols = E.flagCols || [0xe8322f, 0xffd21f, 0x1e6fe8, 0x43a047, 0xff7043, 0xf06292, 0xffffff];
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    flagSpots.forEach((f, k) => {
      const sc = f.short ? 0.6 : 1;
      m4.makeRotationY(f.rot).scale(new THREE.Vector3(1, sc, 1)).setPosition(f.x, f.y, f.z);
      poles.setMatrixAt(k, m4);
      const m5 = new THREE.Matrix4().makeRotationY(f.rot).setPosition(f.x, f.y - (1 - sc) * 7, f.z);
      flags.setMatrixAt(k, m5);
      flags.setColorAt(k, c.setHex(fcols[k % fcols.length]));
    });
    poles.castShadow = true;
    root.add(poles, flags);
  }

  // ------------------------------------------------------------------ vegetation & props
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
  const upAxis = new THREE.Vector3(0, 1, 0);
  function instanced(geo, material, list, { cast = true, colors = null } = {}) {
    const im = new THREE.InstancedMesh(geo, material, Math.max(1, list.length));
    list.forEach((it, k) => {
      tmpQ.setFromAxisAngle(upAxis, it.r);
      if (it.tilt) tmpQ.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(it.tilt, 0, it.tilt2 || 0)));
      tmpS.set(it.s * (it.sx || 1), it.s * (it.sy || 1), it.s * (it.sz || 1));
      im.setMatrixAt(k, tmpM.compose(tmpP.set(it.x, it.y, it.z), tmpQ, tmpS));
      if (colors) im.setColorAt(k, colors(it, k));
    });
    im.count = list.length;
    im.castShadow = cast; im.receiveShadow = true;
    root.add(im);
    return im;
  }
  const flat = (opts) => keep(new THREE.MeshLambertMaterial({ flatShading: true, ...opts }));
  const vcolMat = (opts = {}) => keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...opts }));
  // shared low-poly parts
  const makeRoundCanopy = () => keep(mergeAll([
    stripUV(new THREE.IcosahedronGeometry(2.6, 0).translate(0, 4.6, 0)),
    stripUV(new THREE.IcosahedronGeometry(1.9, 0).translate(1.3, 4.0, 0.6)),
    stripUV(new THREE.IcosahedronGeometry(1.7, 0).translate(-1.1, 4.2, -0.8)),
    stripUV(new THREE.IcosahedronGeometry(1.5, 0).translate(0.2, 6.1, 0.2)),
  ]));
  const makePalm = () => {
    const palmTrunkParts = [];
    for (let k = 0; k < 6; k++) {
      const g = stripUV(new THREE.CylinderGeometry(0.3 - k * 0.02, 0.36 - k * 0.02, 1.35, 6));
      g.translate(k * k * 0.035, 0.65 + k * 1.25, 0);
      palmTrunkParts.push(g);
    }
    const trunk = keep(mergeAll(palmTrunkParts));
    const topX = 25 * 0.035, topY = 0.65 + 5 * 1.25 + 0.6;
    const frondParts = [];
    for (let k = 0; k < 8; k++) {
      const f = stripUV(new THREE.BoxGeometry(3.8, 0.08, 0.9, 4, 1, 1));
      const p = f.attributes.position;
      for (let v = 0; v < p.count; v++) { const xx = p.getX(v) + 1.9; p.setX(v, xx); p.setY(v, p.getY(v) - 0.09 * xx * xx); p.setZ(v, p.getZ(v) * (1 - xx / 4.5)); }
      f.rotateY((k / 8) * Math.PI * 2 + (k % 2) * 0.2);
      f.translate(topX, topY, 0);
      frondParts.push(f.toNonIndexed()); f.dispose();
    }
    frondParts.push(stripUV(new THREE.IcosahedronGeometry(0.45, 0).translate(topX, topY - 0.3, 0)));
    const fronds = keep(mergeAll(frondParts));
    fronds.computeVertexNormals();
    return { trunk, fronds };
  };

  if (COAST) {
    const rnd = mulberry(2024);
    const round = [], pines = [], palms = [], rocks = [], flowers = [], tufts = [], bushes = [];
    const R = ISLAND_R * 0.93;
    let guard = 0;
    while ((round.length < 700 || pines.length < 420 || palms.length < 110) && guard++ < 90000) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * R;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const h = natural(x, z);
      if (h < WATER + 0.3) continue;
      const s = spot(x, z, 6);
      if (!s.ok) continue;
      const y = heightAt(x, z);
      if (y < WATER + 0.3) continue;
      const beach = h < WATER + 3.2;
      const forest = fbm(x * 0.008 + 11, z * 0.008 - 4, 3);
      if (beach) {
        if (palms.length < 110 && rnd() < 0.8) palms.push({ x, y: y - 0.3, z, r: rnd() * 6.28, s: 1.0 + rnd() * 0.45, tilt: (rnd() - 0.5) * 0.3, tilt2: (rnd() - 0.5) * 0.3 });
        continue;
      }
      if (forest < 0.42 && rnd() < 0.85) continue;
      if (y > 12 || (forest > 0.62 && rnd() < 0.6)) {
        if (pines.length < 420) pines.push({ x, y: y - 0.3, z, r: rnd() * 6.28, s: 1.1 + rnd() * 0.9 });
      } else if (round.length < 700) round.push({ x, y: y - 0.3, z, r: rnd() * 6.28, s: 1.0 + rnd() * 0.7, hue: rnd() });
    }
    // palms lining the main straight & lagoon
    for (let i = 0; i < L.N; i += Math.round(22 / L.ds)) {
      const nearLake = Math.hypot(L.px[i] - L.lake.x, L.pz[i] - L.lake.z) < L.lake.r + 90;
      if (!nearLake) continue;
      for (const side of [1, -1]) {
        const lat = side * ((side > 0 ? L.wallR[i] : L.wallL[i]) + 7 + rnd() * 5);
        const x = L.px[i] + L.rx[i] * lat, z = L.pz[i] + L.rz[i] * lat;
        if (!spot(x, z, 5).ok) continue;
        const y = heightAt(x, z);
        if (y < WATER + 0.3) continue;
        palms.push({ x, y: y - 0.3, z, r: rnd() * 6.28, s: 0.9 + rnd() * 0.3, tilt: (rnd() - 0.5) * 0.3, tilt2: (rnd() - 0.5) * 0.3 });
      }
    }
    guard = 0;
    while ((rocks.length < 160 || flowers.length < 2600 || tufts.length < 3200 || bushes.length < 260) && guard++ < 90000) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * R;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const s = spot(x, z, 1.2);
      if (!s.ok) continue;
      const y = heightAt(x, z);
      if (y < WATER - 0.2) continue;
      const closeToTrack = s.d < 70;
      if (rocks.length < 160 && rnd() < 0.05) {
        const sc = 0.8 + rnd() * rnd() * 4;
        rocks.push({ x, y: y - sc * 0.25, z, r: rnd() * 6.28, s: sc, sx: 0.8 + rnd() * 0.6, sy: 0.55 + rnd() * 0.5, sz: 0.8 + rnd() * 0.6, tilt: rnd() * 0.4 });
        continue;
      }
      if (y < WATER + 2.5) continue;
      const meadow = fbm(x * 0.03 - 3, z * 0.03 + 8, 2);
      if (flowers.length < 2600 && meadow > 0.52 && (closeToTrack || rnd() < 0.3)) {
        // small cluster
        for (let k = 0; k < 5; k++) flowers.push({ x: x + (rnd() - 0.5) * 3, y: y + 0.12, z: z + (rnd() - 0.5) * 3, r: rnd() * 6.28, s: 0.7 + rnd() * 0.6, c: (meadow * 37 + k * 0.1) % 1 });
      } else if (tufts.length < 3200 && (closeToTrack || rnd() < 0.25)) {
        tufts.push({ x, y: y - 0.05, z, r: rnd() * 6.28, s: 0.7 + rnd() * 0.8 });
      } else if (bushes.length < 260 && rnd() < 0.3) {
        bushes.push({ x, y: y - 0.2, z, r: rnd() * 6.28, s: 0.8 + rnd() * 0.9, sy: 0.7 });
      }
    }

    // round tree
    const trunkGeo = keep(stripUV(new THREE.CylinderGeometry(0.32, 0.5, 3.4, 6).translate(0, 1.7, 0)));
    const canopyGeo = makeRoundCanopy();
    const trunkMat = flat({ color: 0x8a5a36 });
    const leafMat = flat({ color: 0xffffff });
    const greens = [0x5cb338, 0x76c442, 0x4a9e31, 0x8fd14f, 0x6bbf3d, 0xa5d65a];
    const c = new THREE.Color();
    const allTrees = [...round];
    instanced(trunkGeo, trunkMat, allTrees);
    instanced(canopyGeo, leafMat, round, { colors: (it) => c.setHex(greens[(it.hue * greens.length) | 0]) });
    // pines
    const pineTrunk = keep(stripUV(new THREE.CylinderGeometry(0.25, 0.4, 2.2, 5).translate(0, 1.1, 0)));
    const pineGeo = keep(mergeAll([
      stripUV(new THREE.ConeGeometry(2.8, 3.6, 7).translate(0, 3.4, 0)),
      stripUV(new THREE.ConeGeometry(2.2, 3.2, 7).translate(0, 5.2, 0)),
      stripUV(new THREE.ConeGeometry(1.5, 2.8, 7).translate(0, 6.9, 0)),
    ]));
    const pineGreens = [0x2f7d3a, 0x3a8f44, 0x286e34, 0x44a04c];
    instanced(pineTrunk, trunkMat, pines);
    instanced(pineGeo, leafMat, pines, { colors: (it, k) => c.setHex(pineGreens[k % pineGreens.length]) });
    // palms: curved trunk + drooping fronds
    const palm = makePalm();
    instanced(palm.trunk, flat({ color: 0xa8804f }), palms);
    instanced(palm.fronds, keep(new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide })), palms, { colors: (it, k) => c.setHex([0x3fa34d, 0x52b35a, 0x359447][k % 3]) });
    // bushes
    const bushGeo = keep(stripUV(new THREE.IcosahedronGeometry(1.3, 0)));
    instanced(bushGeo, leafMat, bushes, { colors: (it, k) => c.setHex(greens[(k * 7) % greens.length]).multiplyScalar(0.85) });
    // rocks
    const rockGeo = keep(stripUV(new THREE.DodecahedronGeometry(1, 0)));
    instanced(rockGeo, flat({ color: 0xffffff }), rocks, { colors: (it, k) => c.setHex([0x9a968d, 0xb3aea3, 0x85817a, 0xa7a197][k % 4]) });
    // flowers (petal cluster = small octahedron) + tufts
    const flowerGeo = keep(stripUV(new THREE.OctahedronGeometry(0.26, 0).scale(1, 0.6, 1)));
    const petal = [0xff4f6d, 0xffd84a, 0xffffff, 0xff8ad8, 0xb07cff, 0xff9a3c];
    instanced(flowerGeo, flat({ color: 0xffffff }), flowers, { cast: false, colors: (it) => c.setHex(petal[(it.c * petal.length) | 0]) });
    const tuftGeo = keep(stripUV(new THREE.ConeGeometry(0.28, 1.0, 4).translate(0, 0.45, 0)));
    instanced(tuftGeo, flat({ color: 0xffffff }), tufts, { cast: false, colors: (it, k) => c.setHex([0x4f9e33, 0x66b83e, 0x3f8a2b][k % 3]) });
  }

  // ------------------------------------------------------------------ lighthouse + boats (coast)
  const boats = [];
  if (COAST) {
    const dir = new THREE.Vector2(L.lake.x - cx, L.lake.z - cz).normalize();
    // walk outward from the island centre until we find the coast
    let lx = cx, lz = cz;
    for (let r = ISLAND_R * 0.6; r < ISLAND_R * 1.1; r += 4) {
      const x = cx + dir.x * r, z = cz + dir.y * r;
      if (natural(x, z) < WATER + 1.5) break;
      lx = x; lz = z;
    }
    const gy = natural(lx, lz);
    const parts = [];
    parts.push(paint(stripUV(new THREE.CylinderGeometry(6, 8, 10, 9).translate(0, gy - 4, 0)), 0x8f8a80));
    for (let k = 0; k < 6; k++) {
      parts.push(paint(stripUV(new THREE.CylinderGeometry(2.6 - k * 0.18, 2.8 - k * 0.18, 3.2, 14).translate(0, gy + 2.6 + k * 3.2, 0)), k % 2 ? 0xffffff : 0xe8322f));
    }
    const topY = gy + 1 + 6 * 3.2;
    parts.push(paint(stripUV(new THREE.CylinderGeometry(2.4, 2.4, 0.5, 14).translate(0, topY + 0.2, 0)), 0x333844));
    parts.push(paint(stripUV(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 10).translate(0, topY + 1.6, 0)), 0xfff3b0));
    parts.push(paint(stripUV(new THREE.ConeGeometry(2, 1.8, 10).translate(0, topY + 3.7, 0)), 0xc81e1e));
    const g = keep(mergeGeometries(parts)); parts.forEach((p) => p.dispose());
    g.translate(lx, 0, lz);
    const lh = new THREE.Mesh(g, keep(new THREE.MeshLambertMaterial({ vertexColors: true })));
    lh.castShadow = true; lh.name = 'lighthouse';
    root.add(lh);

    // sailboats on the sea
    const hull = paint(stripUV(new THREE.BoxGeometry(2.4, 1.2, 7, 1, 1, 2)), 0xffffff);
    const hp = hull.attributes.position;
    for (let v = 0; v < hp.count; v++) if (hp.getZ(v) > 3 && hp.getY(v) > -0.1) hp.setX(v, hp.getX(v) * 0.2);
    const mast = paint(stripUV(new THREE.CylinderGeometry(0.1, 0.1, 8, 5).translate(0, 4.5, 0)), 0x6d4c33);
    const sail = paint(stripUV(new THREE.ConeGeometry(2.4, 7, 3).scale(0.08, 1, 1).translate(0, 4.8, -1.2)), 0xffffff);
    const stripe = paint(stripUV(new THREE.BoxGeometry(2.45, 0.3, 6.6).translate(0, 0.3, 0)), 0x1e6fe8);
    const bg = keep(mergeGeometries([hull, mast, sail, stripe]));
    [hull, mast, sail, stripe].forEach((p) => p.dispose());
    bg.computeVertexNormals();
    const bm = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    const rnd = mulberry(77);
    for (let k = 0; k < 6; k++) {
      const a = rnd() * Math.PI * 2, r = ISLAND_R * (1.12 + rnd() * 0.3);
      const b = new THREE.Mesh(bg, bm);
      b.position.set(cx + Math.cos(a) * r, WATER, cz + Math.sin(a) * r);
      b.rotation.y = a + Math.PI / 2;
      b.userData = { a, r, speed: (0.004 + rnd() * 0.004) * (rnd() < 0.5 ? 1 : -1), ph: rnd() * 6 };
      b.scale.setScalar(1.6);
      root.add(b); boats.push(b);
    }
  }

  // ------------------------------------------------------------------ themed scenery (non-coast)
  // Random scatter over the world with a per-candidate callback; returns nothing.
  const scatter = (seed, tries, fn) => {
    const rnd = mulberry(seed);
    for (let k = 0; k < tries; k++) {
      const x = cx + (rnd() * 2 - 1) * HX * 0.97, z = cz + (rnd() * 2 - 1) * HZ * 0.97;
      if (edgeR(x, z) > 0.96) continue;
      if (fn(x, z, rnd) === false) break;
    }
  };
  // Strip that follows the course just outside the barriers (snow banks, hedges...).
  const sideStrip = (profile, colorHex, { skip = () => false, step = 2 } = {}) => {
    const pos = [], idx = [];
    const col = new THREE.Color(colorHex);
    const m = profile.length;
    for (const side of [1, -1]) {
      let open = false;
      for (let ii = 0; ii <= L.N; ii += step) {
        const i = ii % L.N;
        const bad = skip(i) || L.bridge[i] > 0.3;
        if (bad) { open = false; continue; }
        const wall = side > 0 ? L.wallR[i] : L.wallL[i];
        const base = pos.length / 3;
        for (const [d, h] of profile) {
          const lat = side * (wall + 0.7 + d);
          pos.push(L.px[i] + L.rx[i] * lat, L.py[i] + h, L.pz[i] + L.rz[i] * lat);
        }
        if (open) {
          for (let j = 0; j < m - 1; j++) {
            const A = base - m + j, B = base - m + j + 1, C = base + j, D = base + j + 1;
            if (side > 0) idx.push(A, C, B, B, C, D); else idx.push(A, B, C, B, D, C);
          }
        }
        open = true;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const cc = new Float32Array(pos.length);
    for (let k = 0; k < pos.length; k += 3) { cc[k] = col.r; cc[k + 1] = col.g; cc[k + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    return keep(g);
  };
  // Light pools / emissive helpers
  const glowMat = (hex, scale = 1.6) => { const m = keep(new THREE.MeshBasicMaterial({ color: hex, toneMapped: false })); m.color.multiplyScalar(scale); return m; };
  // Floating particles that follow the camera (snow flakes, embers).
  const particles = (P) => {
    const n = P.count || 1500, S = P.box || 140;
    const pos = new Float32Array(n * 3), rnd = mulberry(P.seed || 9);
    for (let k = 0; k < n; k++) { pos[k * 3] = (rnd() - 0.5) * S; pos[k * 3 + 1] = rnd() * S * 0.5; pos[k * 3 + 2] = (rnd() - 0.5) * S; }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = keep(new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.uTime, uCam: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(P.color) }, uSize: { value: P.size || 1.2 }, uSpeed: { value: P.speed || -2 }, uBox: { value: S } },
      vertexShader: /* glsl */`
        uniform float uTime; uniform vec3 uCam; uniform float uSize; uniform float uSpeed; uniform float uBox;
        varying float vA;
        void main() {
          vec3 p = position;
          p.y = mod(p.y + uSpeed * uTime, uBox * 0.5);
          p.x += sin(uTime * 0.7 + position.z * 0.3) * 1.5;
          vec3 w = uCam + vec3(mod(p.x - uCam.x + uBox * 0.5, uBox) - uBox * 0.5, p.y - uBox * 0.18, mod(p.z - uCam.z + uBox * 0.5, uBox) - uBox * 0.5);
          vec4 mv = viewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * 300.0 / max(1.0, -mv.z);
          vA = smoothstep(uBox * 0.6, uBox * 0.2, length(w - uCam));
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; varying float vA;
        void main() { vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.15, length(q)) * vA; if (a < 0.02) discard; gl_FragColor = vec4(uColor, a); }`,
      transparent: true, depthWrite: false, toneMapped: false, blending: P.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false; pts.name = 'particles';
    pts.onBeforeRender = (r, s, cam) => { m.uniforms.uCam.value.copy(cam.position); };
    root.add(pts);
  };

  const c3 = new THREE.Color();
  if (KIND === 'desert') buildDesert();
  else if (KIND === 'snow') buildSnow();
  else if (KIND === 'city') buildCity();
  else if (KIND === 'jungle') buildJungle();
  else if (KIND === 'volcano') buildVolcano();

  // ---------------------------------------------------------------- desert: mesas, cacti, rocks, a stone arch
  function buildDesert() {
    const cacti = [], rocks = [], bushes = [], tufts = [], mesas = [];
    scatter(31, 40000, (x, z, rnd) => {
      const s = spot(x, z, 3);
      if (!s.ok) return;
      const y = heightAt(x, z);
      if (mesas.length < 16 && s.d > 70 && rnd() < 0.03) { mesas.push({ x, y, z, r: 28 + rnd() * 45, h: 24 + rnd() * 46 }); return; }
      if (cacti.length < 300 && rnd() < 0.12 && s.d > 4) { cacti.push({ x, y: y - 0.2, z, r: rnd() * 6.28, s: 0.8 + rnd() * 0.7 }); return; }
      if (rocks.length < 320 && rnd() < 0.1) { const sc = 0.7 + rnd() * rnd() * 4.5; rocks.push({ x, y: y - sc * 0.25, z, r: rnd() * 6.28, s: sc, sx: 0.8 + rnd() * 0.6, sy: 0.5 + rnd() * 0.5, sz: 0.8 + rnd() * 0.6, tilt: rnd() * 0.4 }); return; }
      if (bushes.length < 420 && rnd() < 0.15) { bushes.push({ x, y: y - 0.1, z, r: rnd() * 6.28, s: 0.5 + rnd() * 0.6, sy: 0.6 }); return; }
      if (tufts.length < 1800 && (s.d < 60 || rnd() < 0.3)) tufts.push({ x, y: y - 0.05, z, r: rnd() * 6.28, s: 0.6 + rnd() * 0.8 });
      if (cacti.length >= 300 && rocks.length >= 320 && bushes.length >= 420 && tufts.length >= 1800) return false;
    });
    // saguaro cactus: trunk + two arms
    const green = 0x5f9a3c;
    const cactusGeo = keep(mergeAll([
      paint(stripUV(new THREE.CylinderGeometry(0.55, 0.65, 6, 7).translate(0, 3, 0)), green),
      paint(stripUV(new THREE.SphereGeometry(0.55, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 6, 0)), green),
      paint(stripUV(new THREE.CylinderGeometry(0.35, 0.35, 1.6, 6).rotateZ(Math.PI / 2).translate(1.1, 2.6, 0)), green),
      paint(stripUV(new THREE.CylinderGeometry(0.35, 0.38, 2.2, 6).translate(1.85, 3.6, 0)), green),
      paint(stripUV(new THREE.CylinderGeometry(0.32, 0.32, 1.3, 6).rotateZ(Math.PI / 2).translate(-0.95, 3.4, 0)), green),
      paint(stripUV(new THREE.CylinderGeometry(0.3, 0.33, 1.6, 6).translate(-1.55, 4.1, 0)), green),
    ]));
    instanced(cactusGeo, vcolMat(), cacti, { colors: (it, k) => c3.setHex([0xffffff, 0xd8f0c8, 0xeaf7d8][k % 3]) });
    const rockGeo = keep(stripUV(new THREE.DodecahedronGeometry(1, 0)));
    instanced(rockGeo, flat({ color: 0xffffff }), rocks, { colors: (it, k) => c3.setHex([0xb8693d, 0xcf8650, 0x9e5532, 0xd9a06a][k % 4]) });
    const bushGeo = keep(stripUV(new THREE.IcosahedronGeometry(1.3, 0)));
    instanced(bushGeo, flat({ color: 0xffffff }), bushes, { colors: (it, k) => c3.setHex([0x8a8a3c, 0x9c8f4a, 0x77733a][k % 3]) });
    const tuftGeo = keep(stripUV(new THREE.ConeGeometry(0.3, 0.9, 4).translate(0, 0.4, 0)));
    instanced(tuftGeo, flat({ color: 0xffffff }), tufts, { cast: false, colors: (it, k) => c3.setHex([0xd6b65a, 0xc9a24a, 0xe3c873][k % 3]) });
    // mesas: banded flat-topped buttes
    if (mesas.length) {
      const bands = [0xc0602f, 0xf2c48a, 0x9a4424, 0xe08d50, 0xf7dcae];
      const geos = mesas.map((m, k) => {
        const g = new THREE.CylinderGeometry(m.r * 0.78, m.r, m.h, 8, 5).toNonIndexed();
        g.deleteAttribute('uv');
        const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
        for (let v = 0; v < pos.count; v++) {
          const a = Math.atan2(pos.getZ(v), pos.getX(v));
          const s = 1 + (fbm(Math.cos(a) * 2 + k * 7, Math.sin(a) * 2 + pos.getY(v) * 0.05, 2) - 0.5) * 0.3;
          if (Math.abs(pos.getY(v)) < m.h / 2 - 0.01) { pos.setX(v, pos.getX(v) * s); pos.setZ(v, pos.getZ(v) * s); }
        }
        for (let v = 0; v < pos.count; v += 3) {
          const yy = (pos.getY(v) + pos.getY(v + 1) + pos.getY(v + 2)) / 3;
          c3.setHex(yy > m.h / 2 - 0.01 ? 0xe9c27f : bands[Math.abs(Math.floor((yy + m.h / 2) / (m.h / 5))) % bands.length]);
          for (let j = 0; j < 3; j++) { col[(v + j) * 3] = c3.r; col[(v + j) * 3 + 1] = c3.g; col[(v + j) * 3 + 2] = c3.b; }
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.computeVertexNormals();
        g.translate(m.x, m.y + m.h / 2 - 2, m.z);
        return g;
      });
      const mm = new THREE.Mesh(keep(mergeAll(geos)), vcolMat());
      mm.castShadow = true; mm.receiveShadow = true; mm.name = 'mesas';
      root.add(mm);
    }
    // natural stone arch over the road
    if (E.arch) {
      const a = atLat(E.arch.at);
      const span = (L.wallL[a.i] + L.wallR[a.i]) / 2 + 5;
      const g = new THREE.TorusGeometry(span, 4.2, 6, 18, Math.PI).toNonIndexed();
      g.deleteAttribute('uv');
      g.scale(1, 1.25, 0.9);
      const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
      const bands = [0xc8693a, 0xe08d50, 0xb5552e, 0xd27843];
      for (let v = 0; v < pos.count; v++) {
        const n = fbm(pos.getX(v) * 0.15, pos.getY(v) * 0.15, 2);
        pos.setXYZ(v, pos.getX(v) + (n - 0.5) * 2, pos.getY(v) + (n - 0.5) * 1.5, pos.getZ(v) * (0.9 + n * 0.4));
      }
      for (let v = 0; v < pos.count; v += 3) {
        c3.setHex(bands[Math.abs(Math.floor(pos.getY(v) / 4)) % bands.length]);
        for (let j = 0; j < 3; j++) { col[(v + j) * 3] = c3.r; col[(v + j) * 3 + 1] = c3.g; col[(v + j) * 3 + 2] = c3.b; }
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      // local X across the road: rotate so the arch plane is perpendicular to the track
      g.rotateY(a.h + Math.PI / 2);
      const off = (L.wallR[a.i] - L.wallL[a.i]) / 2;
      g.translate(a.x + L.rx[a.i] * off, a.y - 3, a.z + L.rz[a.i] * off);
      const am = new THREE.Mesh(keep(g), vcolMat());
      am.castShadow = true; am.receiveShadow = true; am.name = 'arch';
      root.add(am);
    }
  }

  // ---------------------------------------------------------------- snow: snowy pines, banks, rocks, cabins, snowmen, flakes
  function buildSnow() {
    const pines = [], rocks = [], cabins = [], snowmen = [];
    scatter(41, 60000, (x, z, rnd) => {
      const s = spot(x, z, 5);
      if (!s.ok) return;
      const y = heightAt(x, z);
      const forest = fbm(x * 0.008 + 3, z * 0.008 - 9, 3);
      if (pines.length < 1100 && (forest > 0.46 || (s.d < 50 && rnd() < 0.3)) && rnd() < 0.75) { pines.push({ x, y: y - 0.3, z, r: rnd() * 6.28, s: 0.9 + rnd() * 1.1 }); return; }
      if (rocks.length < 200 && rnd() < 0.05) { const sc = 0.8 + rnd() * rnd() * 4; rocks.push({ x, y: y - sc * 0.3, z, r: rnd() * 6.28, s: sc, sx: 0.8 + rnd() * 0.6, sy: 0.55 + rnd() * 0.5, sz: 0.8 + rnd() * 0.6, tilt: rnd() * 0.4 }); return; }
      if (snowmen.length < 14 && s.d < 25 && s.d > 6 && rnd() < 0.01) { snowmen.push({ x, y: y - 0.2, z, r: rnd() * 6.28, s: 1 }); }
      if (pines.length >= 1100 && rocks.length >= 200 && snowmen.length >= 14) return false;
    });
    // cabins near the start
    {
      const rnd = mulberry(43);
      for (let k = 0; k < 40 && cabins.length < 7; k++) {
        const i = ((Math.round((-120 + k * 18) / L.ds) % L.N) + L.N) % L.N;
        const side = k % 2 ? 1 : -1;
        const lat = side * ((side > 0 ? L.wallR[i] : L.wallL[i]) + 22 + rnd() * 10);
        const x = L.px[i] + L.rx[i] * lat, z = L.pz[i] + L.rz[i] * lat;
        if (!spot(x, z, 12).ok) continue;
        cabins.push({ x, y: heightAt(x, z) - 0.3, z, r: L.head[i] + (rnd() - 0.5) * 0.4, s: 1 + rnd() * 0.3 });
      }
    }
    const pineGeo = keep(mergeAll([
      paint(stripUV(new THREE.CylinderGeometry(0.25, 0.4, 2.2, 5).translate(0, 1.1, 0)), 0x6b4a33),
      paint(stripUV(new THREE.ConeGeometry(2.8, 3.6, 7).translate(0, 3.4, 0)), 0x24573a),
      paint(stripUV(new THREE.ConeGeometry(2.0, 1.1, 7).translate(0, 4.65, 0)), 0xf4f9ff),
      paint(stripUV(new THREE.ConeGeometry(2.2, 3.2, 7).translate(0, 5.2, 0)), 0x2b6442),
      paint(stripUV(new THREE.ConeGeometry(1.5, 1.0, 7).translate(0, 6.3, 0)), 0xf4f9ff),
      paint(stripUV(new THREE.ConeGeometry(1.5, 2.8, 7).translate(0, 6.9, 0)), 0x2f6d48),
      paint(stripUV(new THREE.ConeGeometry(0.75, 1.2, 7).translate(0, 7.9, 0)), 0xf4f9ff),
    ]));
    instanced(pineGeo, vcolMat(), pines, { colors: (it, k) => c3.setHex([0xffffff, 0xe6f0ea, 0xf3f7ff][k % 3]) });
    const rockGeo = keep(mergeAll([
      paint(stripUV(new THREE.DodecahedronGeometry(1, 0)), 0x7c8594),
      paint(stripUV(new THREE.DodecahedronGeometry(0.8, 0).scale(1, 0.45, 1).translate(0, 0.62, 0)), 0xf4f9ff),
    ]));
    instanced(rockGeo, vcolMat(), rocks);
    // snow banks hugging the outside of the barriers
    const bank = sideStrip([[0, 0.9], [1.2, 1.8], [3.2, 1.4], [5.5, -0.6]], 0xf2f7fd);
    const bm = new THREE.Mesh(bank, keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    bm.receiveShadow = true; bm.name = 'snowBanks';
    root.add(bm);
    // cabins: log box + snowy roof + chimney + lit window
    const cabinGeo = keep(mergeAll([
      paint(stripUV(new THREE.BoxGeometry(8, 4.5, 6).translate(0, 2.25, 0)), 0x8a5a36),
      paint(stripUV(new THREE.CylinderGeometry(4.9, 4.9, 9, 3, 1).rotateZ(Math.PI / 2).scale(1, 0.55, 0.9).translate(0, 5.6, 0)), 0xf4f9ff),
      paint(stripUV(new THREE.BoxGeometry(1, 3, 1).translate(2.4, 6.5, 1)), 0x6d6a66),
      paint(stripUV(new THREE.BoxGeometry(1.6, 1.2, 0.1).translate(-1.8, 2.4, 3.02)), 0xffd27a),
      paint(stripUV(new THREE.BoxGeometry(1.6, 1.2, 0.1).translate(1.8, 2.4, 3.02)), 0xffd27a),
    ]));
    instanced(cabinGeo, vcolMat(), cabins);
    const smGeo = keep(mergeAll([
      paint(stripUV(new THREE.IcosahedronGeometry(1.1, 1).translate(0, 1, 0)), 0xffffff),
      paint(stripUV(new THREE.IcosahedronGeometry(0.8, 1).translate(0, 2.5, 0)), 0xffffff),
      paint(stripUV(new THREE.IcosahedronGeometry(0.55, 1).translate(0, 3.6, 0)), 0xffffff),
      paint(stripUV(new THREE.ConeGeometry(0.12, 0.6, 5).rotateX(Math.PI / 2).translate(0, 3.6, 0.75)), 0xff8a1f),
      paint(stripUV(new THREE.CylinderGeometry(0.45, 0.5, 0.6, 8).translate(0, 4.25, 0)), 0x2a2c31),
      paint(stripUV(new THREE.TorusGeometry(0.55, 0.12, 4, 10).rotateX(Math.PI / 2).translate(0, 3.1, 0)), 0xe8322f),
    ]));
    instanced(smGeo, vcolMat(), snowmen);
    particles({ color: 0xffffff, count: 1600, size: 1.0, speed: -3.5, box: 150, seed: 4 });
  }

  // ---------------------------------------------------------------- city: blocks of lit buildings, neon signs, street lights
  function buildCity() {
    const rnd = mulberry(51);
    const facadeTex = keep(TX.makeWindowTexture());
    const litTex = keep(TX.makeWindowTexture({ lit: true }));
    const bMat = keep(new THREE.MeshStandardMaterial({ map: facadeTex, emissiveMap: litTex, emissive: 0xffffff, emissiveIntensity: 1.25, vertexColors: true, roughness: 0.8 }));
    const geos = [];
    const lot = 30;
    const buildingAt = (x, z, w, d, h, tint) => {
      const g = new THREE.BoxGeometry(w, h, d);
      const uv = g.attributes.uv;
      // faces: +x, -x, +y, -y, +z, -z (4 verts each)
      for (let f = 0; f < 6; f++) {
        for (let v = 0; v < 4; v++) {
          const k = f * 4 + v;
          if (f === 2 || f === 3) { uv.setXY(k, 0.01, 0.01); continue; }
          const width = f < 2 ? d : w;
          uv.setXY(k, uv.getX(k) * Math.max(1, Math.round(width / 4.5)) / 4, uv.getY(k) * Math.max(1, Math.round(h / 4)) / 4);
        }
      }
      g.translate(x, h / 2 - 0.6, z);
      const col = new Float32Array(g.attributes.position.count * 3);
      for (let k = 0; k < col.length; k += 3) { col[k] = tint.r; col[k + 1] = tint.g; col[k + 2] = tint.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geos.push(g);
    };
    const tints = [0xffffff, 0xcfd8ff, 0xffe0d0, 0xd8ffe8, 0xe8d8ff].map((v) => new THREE.Color(v));
    const signs = [];
    const roofs = [];
    for (let gx = cx - HX * 0.92; gx < cx + HX * 0.92; gx += lot) {
      for (let gz = cz - HZ * 0.92; gz < cz + HZ * 0.92; gz += lot) {
        if (rnd() < 0.08) continue;   // plazas
        const w = lot - 6 - rnd() * 6, d = lot - 6 - rnd() * 6;
        const x = gx + (rnd() - 0.5) * 3, z = gz + (rnd() - 0.5) * 3;
        let ok = true, dMin = 1e9;
        for (const [ox, oz] of [[0, 0], [-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, -d / 2], [0, d / 2], [-w / 2, 0], [w / 2, 0]]) {
          const s = spot(x + ox, z + oz, 7);
          if (!s.ok) { ok = false; break; }
          dMin = Math.min(dMin, s.d);
        }
        if (!ok) continue;
        const centre = 1 - Math.min(1, Math.hypot((x - cx) / HX, (z - cz) / HZ));
        const h = 12 + rnd() * 26 + centre * centre * 70 * rnd() + (dMin < 30 ? 6 : 0);
        buildingAt(x, z, w, d, h, tints[(rnd() * tints.length) | 0]);
        if (h > 30 && rnd() < 0.5) buildingAt(x, z, w * 0.6, d * 0.6, h + 8 + rnd() * 14, tints[(rnd() * tints.length) | 0]);
        roofs.push({ x, y: h - 0.6, z, w, d });
        if (dMin < 45 && rnd() < 0.55) signs.push({ x, z, w, d, h });
      }
    }
    const bm = new THREE.Mesh(keep(mergeAll(geos)), bMat);
    bm.castShadow = true; bm.receiveShadow = true; bm.name = 'buildings';
    root.add(bm);
    // neon signs on the faces looking at the course
    {
      const atlas = (() => {
        const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 512, 512);
        const words = [['ARCADE', '#ff3df0'], ['NOODLES', '#3dfcff'], ['HOTEL', '#ffe23d'], ['24H', '#5dff6a'], ['TURBO', '#ff5a3d'], ['DINER', '#ff3d8b'], ['GARAGE', '#3d9bff'], ['BDB', '#ffffff']];
        words.forEach(([w, col], k) => {
          const x = (k % 2) * 256, y = Math.floor(k / 2) * 128;
          ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.strokeRect(x + 10, y + 10, 236, 108);
          ctx.font = 'bold 64px "Lilita One", "Arial Black", Impact, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.fillStyle = col;
          ctx.fillText(w, x + 128, y + 68);
          ctx.shadowBlur = 0;
        });
        const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
        return keep(t);
      })();
      const parts = [];
      signs.forEach((sg, k) => {
        // face of the building closest to the track
        const q = L.nearest(sg.x, sg.z, true);
        let nx = 0, nz = 1;
        if (q.i >= 0) { const dx = L.px[q.i] - sg.x, dz = L.pz[q.i] - sg.z; if (Math.abs(dx) / sg.w > Math.abs(dz) / sg.d) { nx = Math.sign(dx); nz = 0; } else { nx = 0; nz = Math.sign(dz); } }
        const half = nx ? sg.w / 2 : sg.d / 2;
        const g = new THREE.PlaneGeometry(10, 5);
        const cell = k % 8, u0 = (cell % 2) * 0.5, v0 = 1 - (Math.floor(cell / 2) + 1) * 0.25;
        const uv = g.attributes.uv;
        for (let v = 0; v < 4; v++) uv.setXY(v, u0 + uv.getX(v) * 0.5, v0 + uv.getY(v) * 0.25);
        g.rotateY(Math.atan2(nx, nz));
        g.translate(sg.x + nx * (half + 0.15), Math.min(sg.h - 4, 9 + (k % 3) * 4), sg.z + nz * (half + 0.15));
        parts.push(g);
      });
      if (parts.length) {
        const sm = new THREE.MeshBasicMaterial({ map: atlas, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
        sm.color.setScalar(1.8);
        const sgm = new THREE.Mesh(keep(mergeAll(parts)), keep(sm));
        sgm.name = 'neonSigns';
        root.add(sgm);
      }
    }
    // rooftop antennas + water tanks
    {
      const parts = [];
      roofs.forEach((r, k) => {
        if (k % 3 === 0) parts.push(paint(stripUV(new THREE.CylinderGeometry(0.15, 0.15, 7, 4).translate(r.x + r.w * 0.25, r.y + 3.5, r.z)), 0x9aa0a8));
        else if (k % 3 === 1) parts.push(paint(stripUV(new THREE.CylinderGeometry(1.8, 1.8, 3, 8).translate(r.x - r.w * 0.2, r.y + 1.5, r.z + r.d * 0.2)), 0x5a4a44));
      });
      if (parts.length) { const m = new THREE.Mesh(keep(mergeAll(parts)), vcolMat()); m.name = 'roofProps'; root.add(m); }
      const blink = [];
      roofs.forEach((r, k) => { if (k % 3 === 0) blink.push({ x: r.x + r.w * 0.25, y: r.y + 7.2, z: r.z, r: 0, s: 1 }); });
      instanced(keep(new THREE.SphereGeometry(0.35, 6, 4)), glowMat(0xff2a2a, 2.2), blink, { cast: false });
    }
    // street lights along both sides + warm light pools on the road
    {
      const lights = [], pools = [];
      const step = Math.round(30 / L.ds);
      for (let i = 0; i < L.N; i += step) {
        for (const side of [1, -1]) {
          const wall = side > 0 ? L.wallR[i] : L.wallL[i];
          const lat = side * (wall + 1.6);
          const x = L.px[i] + L.rx[i] * lat, z = L.pz[i] + L.rz[i] * lat;
          lights.push({ x, y: L.py[i], z, r: L.head[i] + (side > 0 ? Math.PI / 2 : -Math.PI / 2), s: 1 });
          const pl = side * (L.halfWidth - 2.5);
          pools.push({ x: L.px[i] + L.rx[i] * pl, y: L.py[i] + 0.06, z: L.pz[i] + L.rz[i] * pl, r: 0, s: 1 });
        }
      }
      // pole + arm toward the road (local +Z = toward road after rotation)
      const poleGeo = keep(mergeAll([
        paint(stripUV(new THREE.CylinderGeometry(0.16, 0.22, 9, 6).translate(0, 4.5, 0)), 0x3a3f4a),
        paint(stripUV(new THREE.BoxGeometry(0.18, 0.18, 3.4).translate(0, 8.9, 1.6)), 0x3a3f4a),
        paint(stripUV(new THREE.BoxGeometry(0.9, 0.3, 1.4).translate(0, 8.75, 3.1)), 0x2a2e36),
      ]));
      instanced(poleGeo, vcolMat(), lights);
      const bulbGeo = keep(new THREE.BoxGeometry(0.7, 0.12, 1.1).translate(0, 8.55, 3.1));
      instanced(bulbGeo, glowMat(0xffd9a0, 2.4), lights, { cast: false });
      const poolTex = (() => {
        const cv = document.createElement('canvas'); cv.width = cv.height = 64;
        const ctx = cv.getContext('2d');
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,220,160,0.55)'); g.addColorStop(1, 'rgba(255,220,160,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
        return keep(new THREE.CanvasTexture(cv));
      })();
      const poolMat = keep(new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      const poolGeo = keep(new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2));
      instanced(poolGeo, poolMat, pools, { cast: false });
    }
    // a few parks with trees in open lots
    {
      const trees = [];
      scatter(53, 9000, (x, z, r2) => {
        if (trees.length >= 160) return false;
        if (!spot(x, z, 4).ok) return;
        if (fbm(x * 0.01, z * 0.01, 2) < 0.62) return;
        trees.push({ x, y: -0.6, z, r: r2() * 6.28, s: 0.9 + r2() * 0.5 });
      });
      instanced(keep(stripUV(new THREE.CylinderGeometry(0.3, 0.45, 3.4, 6).translate(0, 1.7, 0))), flat({ color: 0x5a3e2a }), trees);
      instanced(makeRoundCanopy(), flat({ color: 0xffffff }), trees, { colors: (it, k) => c3.setHex([0x2f7a45, 0x3b8a50, 0x276b3c][k % 3]) });
    }
  }

  // ---------------------------------------------------------------- jungle: dense trees, palms, ferns, temple ruins
  function buildJungle() {
    const big = [], round = [], palms = [], ferns = [], rocks = [], flowers = [];
    scatter(61, 90000, (x, z, rnd) => {
      const s = spot(x, z, 4);
      if (!s.ok) return;
      const y = heightAt(x, z);
      if (y < WATER + 0.4) return;
      const dense = fbm(x * 0.01 + 5, z * 0.01 - 2, 3);
      if (big.length < 420 && s.d > 8 && rnd() < 0.3 + dense * 0.3) { big.push({ x, y: y - 0.3, z, r: rnd() * 6.28, s: 0.9 + rnd() * 0.6, hue: rnd() }); return; }
      if (round.length < 700 && rnd() < 0.45) { round.push({ x, y: y - 0.3, z, r: rnd() * 6.28, s: 1.1 + rnd() * 0.8, hue: rnd() }); return; }
      if (palms.length < 110 && (y < WATER + 5 || rnd() < 0.15)) { palms.push({ x, y: y - 0.3, z, r: rnd() * 6.28, s: 1.0 + rnd() * 0.5, tilt: (rnd() - 0.5) * 0.35, tilt2: (rnd() - 0.5) * 0.35 }); return; }
      if (ferns.length < 1400 && (s.d < 50 || rnd() < 0.4)) { ferns.push({ x, y: y - 0.1, z, r: rnd() * 6.28, s: 0.7 + rnd() * 0.8 }); return; }
      if (rocks.length < 140 && rnd() < 0.1) { const sc = 0.8 + rnd() * rnd() * 3; rocks.push({ x, y: y - sc * 0.3, z, r: rnd() * 6.28, s: sc, sy: 0.6, tilt: rnd() * 0.3 }); return; }
      if (flowers.length < 1200 && s.d < 40) for (let k = 0; k < 4; k++) flowers.push({ x: x + (rnd() - 0.5) * 3, y: y + 0.15, z: z + (rnd() - 0.5) * 3, r: rnd() * 6.28, s: 0.8 + rnd() * 0.6, c: rnd() });
      if (big.length >= 420 && round.length >= 700 && palms.length >= 200 && ferns.length >= 1400 && rocks.length >= 140) return false;
    });
    {   // dense band of jungle just beyond the barriers
      const rnd = mulberry(63);
      for (let k = 0; k < 9000; k++) {
        const i = Math.floor(rnd() * L.N), side = rnd() < 0.5 ? 1 : -1;
        const wall = side > 0 ? L.wallR[i] : L.wallL[i];
        const lat = side * (wall + 6 + rnd() * rnd() * 90);
        const x = L.px[i] + L.rx[i] * lat, z = L.pz[i] + L.rz[i] * lat;
        if (!spot(x, z, 5).ok) continue;
        const y = heightAt(x, z);
        if (y < WATER + 0.4) continue;
        const pick = rnd();
        if (pick < 0.3 && big.length < 760) big.push({ x, y: y - 0.3, z, r: rnd() * 6.28, s: 0.9 + rnd() * 0.6, hue: rnd() });
        else if (pick < 0.7 && round.length < 820) round.push({ x, y: y - 0.3, z, r: rnd() * 6.28, s: 1.1 + rnd() * 0.8, hue: rnd() });
        else if (pick < 0.8 && palms.length < 160) palms.push({ x, y: y - 0.3, z, r: rnd() * 6.28, s: 1.0 + rnd() * 0.5, tilt: (rnd() - 0.5) * 0.35, tilt2: (rnd() - 0.5) * 0.35 });
        else if (ferns.length < 1700) ferns.push({ x, y: y - 0.1, z, r: rnd() * 6.28, s: 0.8 + rnd() * 0.9 });
      }
    }
    const trunkMat = flat({ color: 0x6e4a2e });
    const leafMat = flat({ color: 0xffffff });
    const greens = [0x2f8f3a, 0x3fa040, 0x237a33, 0x4cae45, 0x2e9a50, 0x5bb83e];
    // tall rainforest tree: long trunk + broad flat canopy layers
    const bigTrunk = keep(stripUV(new THREE.CylinderGeometry(0.45, 0.8, 11, 6).translate(0, 5.5, 0)));
    const bigCanopy = keep(mergeAll([
      stripUV(new THREE.IcosahedronGeometry(4.2, 0).scale(1, 0.45, 1).translate(0, 11.5, 0)),
      stripUV(new THREE.IcosahedronGeometry(3.2, 0).scale(1, 0.5, 1).translate(2.4, 10.6, 1.2)),
      stripUV(new THREE.IcosahedronGeometry(3.0, 0).scale(1, 0.5, 1).translate(-2.2, 10.9, -1.4)),
      stripUV(new THREE.IcosahedronGeometry(2.4, 0).scale(1, 0.55, 1).translate(0.4, 13.0, 0.3)),
    ]));
    instanced(bigTrunk, trunkMat, big);
    instanced(bigCanopy, leafMat, big, { colors: (it) => c3.setHex(greens[(it.hue * greens.length) | 0]) });
    instanced(keep(stripUV(new THREE.CylinderGeometry(0.32, 0.5, 3.4, 6).translate(0, 1.7, 0))), trunkMat, round);
    instanced(makeRoundCanopy(), leafMat, round, { colors: (it) => c3.setHex(greens[((it.hue * 7) | 0) % greens.length]) });
    const palm = makePalm();
    instanced(palm.trunk, flat({ color: 0x9a7448 }), palms);
    instanced(palm.fronds, keep(new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide })), palms, { colors: (it, k) => c3.setHex([0x2f9a45, 0x3daa50, 0x288a3d][k % 3]) });
    // ferns: a fan of flattened leaves
    const fernParts = [];
    for (let k = 0; k < 6; k++) fernParts.push(stripUV(new THREE.ConeGeometry(0.35, 2.2, 4).scale(1, 1, 0.25).rotateX(-1.0).rotateY((k / 6) * Math.PI * 2).translate(0, 0.5, 0)));
    instanced(keep(mergeAll(fernParts)), keep(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, side: THREE.DoubleSide })), ferns, { cast: false, colors: (it, k) => c3.setHex([0x3d9a35, 0x4fae3c, 0x2f8a30][k % 3]) });
    instanced(keep(stripUV(new THREE.DodecahedronGeometry(1, 0))), flat({ color: 0xffffff }), rocks, { colors: (it, k) => c3.setHex([0x7d8a6a, 0x6f7d5f, 0x8a9478][k % 3]) });
    const petal = [0xff3d6d, 0xffd84a, 0xff8ad8, 0xff7a1a, 0xb07cff];
    instanced(keep(stripUV(new THREE.OctahedronGeometry(0.3, 0).scale(1, 0.6, 1))), flat({ color: 0xffffff }), flowers, { cast: false, colors: (it) => c3.setHex(petal[(it.c * petal.length) | 0]) });

    // temple: stepped pyramid with a shrine, plus pillars and a stone gate over the road
    const stoneTex = keep(TX.makeStoneTexture());
    const stoneMat = keep(new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95 }));
    const tparts = [];
    const box = (w, h, d, x, y, z, ry = 0) => {
      const g = new THREE.BoxGeometry(w, h, d);
      const uv = g.attributes.uv;
      for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
        const k = f * 4 + v, a = f < 2 ? d : w, b = f === 2 || f === 3 ? d : h;
        uv.setXY(k, uv.getX(k) * a / 8, uv.getY(k) * b / 8);
      }
      g.rotateY(ry); g.translate(x, y, z);
      tparts.push(g);
    };
    if (E.temple) {
      const t = atLat(E.temple.at, E.temple.lat);
      const gy = heightAt(t.x, t.z) - 1;
      const tiers = 6, base = 44;
      for (let k = 0; k < tiers; k++) {
        const w = base - k * 6.5, h = 5;
        box(w, h, w, t.x, gy + k * h + h / 2, t.z, t.h);
      }
      const topY = gy + tiers * 5;
      box(10, 6, 10, t.x, topY + 3, t.z, t.h);
      box(13, 1.2, 13, t.x, topY + 6.6, t.z, t.h);
      // stairway facing the track
      const fx = Math.sign(E.temple.lat) * Math.cos(t.h), fz = -Math.sign(E.temple.lat) * Math.sin(t.h);
      for (let k = 0; k < tiers; k++) box(8, 5, 4, t.x + fx * (base / 2 - k * 3.25), gy + k * 5 + 2.5, t.z + fz * (base / 2 - k * 3.25), t.h + Math.PI / 2);
    }
    // stone gates spanning the road + ruined pillars along the temple straight
    for (const g of E.gates || []) {
      const a = atLat(g);
      const wl = L.wallL[a.i] + 2.6, wr = L.wallR[a.i] + 2.6;
      for (const lat of [-wl, wr]) {
        box(3.6, 13, 3.6, a.x + L.rx[a.i] * lat, a.y + 6.5 - 1, a.z + L.rz[a.i] * lat, a.h);
        box(4.6, 1.2, 4.6, a.x + L.rx[a.i] * lat, a.y + 12.4, a.z + L.rz[a.i] * lat, a.h);
      }
      const mid = (wr - wl) / 2, span = wl + wr + 6;
      const lx = a.x + L.rx[a.i] * mid, lz = a.z + L.rz[a.i] * mid;
      const g2 = new THREE.BoxGeometry(span, 2.8, 4.4);
      const uv = g2.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * span / 8, uv.getY(k) * 0.4);
      g2.rotateY(a.h);   // long axis across the road
      g2.translate(lx, a.y + 14.2, lz);
      tparts.push(g2);
    }
    if (E.ruins) {
      const [i0, i1] = sampleRange(E.ruins[0], E.ruins[1]);
      const rnd = mulberry(67);
      for (let ii = i0, n = 0; n < 30; ii = (ii + Math.round(18 / L.ds)) % L.N, n++) {
        if (!inRange(ii, [i0, i1])) break;
        for (const side of [1, -1]) {
          if (rnd() < 0.35) continue;
          const lat = side * ((side > 0 ? L.wallR[ii] : L.wallL[ii]) + 6 + rnd() * 8);
          const x = L.px[ii] + L.rx[ii] * lat, z = L.pz[ii] + L.rz[ii] * lat;
          if (!spot(x, z, 3).ok) continue;
          const h = 3 + rnd() * 8, y = heightAt(x, z);
          box(2.4, h, 2.4, x, y + h / 2 - 0.5, z, rnd());
          if (rnd() < 0.4) box(3.2, 1, 3.2, x, y + h, z, rnd());
          if (rnd() < 0.3) box(2.6, 1.4, 1.6, x + 3, y + 0.3, z + 1, rnd());
        }
      }
    }
    if (tparts.length) {
      const tm = new THREE.Mesh(keep(mergeAll(tparts.map((g) => (g.index ? g.toNonIndexed() : g)))), stoneMat);
      tm.castShadow = true; tm.receiveShadow = true; tm.name = 'temple';
      root.add(tm);
    }
    particles({ color: 0xfff6b0, count: 260, size: 0.9, speed: 0.4, box: 120, seed: 6, additive: true });   // fireflies / pollen
  }

  // ---------------------------------------------------------------- volcano: the cone + crater glow, lava falls, dead trees, spires, embers
  function buildVolcano() {
    const trees = [], spires = [], rocks = [], vents = [];
    scatter(71, 50000, (x, z, rnd) => {
      const s = spot(x, z, 3);
      if (!s.ok) return;
      const y = heightAt(x, z);
      if (y < BASE + 0.6) return;
      if (trees.length < 260 && rnd() < 0.25) { trees.push({ x, y: y - 0.2, z, r: rnd() * 6.28, s: 0.8 + rnd() * 0.7, tilt: (rnd() - 0.5) * 0.25 }); return; }
      if (spires.length < 160 && rnd() < 0.12) { spires.push({ x, y: y - 1, z, r: rnd() * 6.28, s: 1, sx: 1 + rnd() * 1.5, sy: 3 + rnd() * 9, sz: 1 + rnd() * 1.5 }); return; }
      if (rocks.length < 320 && rnd() < 0.3) { const sc = 0.8 + rnd() * rnd() * 5; rocks.push({ x, y: y - sc * 0.3, z, r: rnd() * 6.28, s: sc, sx: 0.8 + rnd() * 0.6, sy: 0.5 + rnd() * 0.5, sz: 0.8 + rnd() * 0.6, tilt: rnd() * 0.4 }); return; }
      if (vents.length < 40 && s.d < 40 && rnd() < 0.05) vents.push({ x, y: y + 0.05, z, r: rnd() * 6.28, s: 1 + rnd() });
      if (trees.length >= 260 && spires.length >= 160 && rocks.length >= 320) return false;
    });
    const deadTree = keep(mergeAll([
      stripUV(new THREE.CylinderGeometry(0.18, 0.4, 5, 5).translate(0, 2.5, 0)),
      stripUV(new THREE.CylinderGeometry(0.1, 0.2, 2.4, 4).rotateZ(0.9).translate(0.8, 3.6, 0)),
      stripUV(new THREE.CylinderGeometry(0.08, 0.16, 2, 4).rotateZ(-0.8).translate(-0.7, 4.1, 0.2)),
      stripUV(new THREE.CylinderGeometry(0.06, 0.12, 1.4, 4).rotateX(0.7).translate(0, 4.6, 0.5)),
    ]));
    instanced(deadTree, flat({ color: 0x1f1a1a }), trees);
    instanced(keep(stripUV(new THREE.CylinderGeometry(0.8, 1, 1, 6).translate(0, 0.5, 0))), flat({ color: 0xffffff }), spires, { colors: (it, k) => c3.setHex([0x2a2426, 0x352d2e, 0x221d1f][k % 3]) });
    instanced(keep(stripUV(new THREE.DodecahedronGeometry(1, 0))), flat({ color: 0xffffff }), rocks, { colors: (it, k) => c3.setHex([0x3a3233, 0x4a3f3d, 0x2e2829, 0x5a4a44][k % 4]) });
    // glowing vents near the road
    instanced(keep(new THREE.CircleGeometry(1.4, 7).rotateX(-Math.PI / 2)), glowMat(0xff6a1a, 1.8), vents, { cast: false });
    // crater glow + lava falls down the cone
    if (CONE) {
      const R = E.cone.r, H = E.cone.h;
      const crater = new THREE.Mesh(keep(new THREE.CircleGeometry(R * 0.11, 18).rotateX(-Math.PI / 2)), glowMat(0xff7a1a, 2.2));
      crater.position.set(CONE.x, natural(CONE.x, CONE.z) + 4, CONE.z);
      crater.name = 'crater';
      root.add(crater);
      const ribbons = [];
      const rnd = mulberry(73);
      for (let k = 0; k < 6; k++) {
        const a0 = rnd() * Math.PI * 2;
        const pts = [];
        let a = a0;
        for (let s = 0; s <= 24; s++) {
          const d = R * (0.1 + 0.62 * (s / 24));
          a += (fbm(k * 3 + s * 0.2, 1) - 0.5) * 0.08;
          const x = CONE.x + Math.cos(a) * d, z = CONE.z + Math.sin(a) * d;
          pts.push([x, natural(x, z) + 0.6, z, a]);
        }
        const pos = [];
        for (let s = 0; s < pts.length - 1; s++) {
          const [x0, y0, z0, a1] = pts[s], [x1, y1, z1, a2] = pts[s + 1];
          const w0 = 5 - s * 0.12, w1 = 5 - (s + 1) * 0.12;
          const px0 = -Math.sin(a1) * w0, pz0 = Math.cos(a1) * w0, px1 = -Math.sin(a2) * w1, pz1 = Math.cos(a2) * w1;
          pos.push(x0 - px0, y0, z0 - pz0, x0 + px0, y0, z0 + pz0, x1 - px1, y1, z1 - pz1);
          pos.push(x0 + px0, y0, z0 + pz0, x1 + px1, y1, z1 + pz1, x1 - px1, y1, z1 - pz1);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        ribbons.push(g);
      }
      const rm = new THREE.Mesh(keep(mergeAll(ribbons)), glowMat(0xff5a10, 1.7));
      rm.material.side = THREE.DoubleSide;
      rm.name = 'lavaFalls';
      root.add(rm);
      // smoke column
      const puff = keep(stripUV(new THREE.IcosahedronGeometry(1, 1)));
      const puffs = [];
      const topY = natural(CONE.x, CONE.z);
      for (let k = 0; k < 16; k++) puffs.push({ x: (rnd() - 0.5) * 30 + k * 4, y: topY + 30 + k * 16, z: (rnd() - 0.5) * 30, r: rnd() * 6.28, s: 18 + k * 3.5 });
      const smoke = instanced(puff, keep(new THREE.MeshLambertMaterial({ color: 0x3a2f2e, emissive: 0x2a0a04, flatShading: true, fog: false })), puffs, { cast: false });
      smoke.name = 'smoke';
      smoke.position.set(CONE.x, 0, CONE.z);   // instances are relative to the crater so the column turns in place
      smoke.frustumCulled = false;
      animators.push((dt, time) => { smoke.rotation.y = time * 0.03; });
    }
    particles({ color: 0xff8a2a, count: 900, size: 0.7, speed: 2.4, box: 140, seed: 8, additive: true });   // embers rising
  }

  // ------------------------------------------------------------------ API
  return {
    sunLight: sun,
    hemiLight: hemi,
    heightAt,
    setShadowFocus,
    update(dt, time) {
      uniforms.uTime.value = time;
      if (waterMat) waterMat.uniforms.uTime.value = time;
      if (lavaMat) lavaMat.uniforms.uTime.value = time;
      cloudGroup.rotation.y = time * 0.004;
      for (const b of boats) {
        const u = b.userData;
        const a = u.a + time * u.speed;
        b.position.x = cx + Math.cos(a) * u.r;
        b.position.z = cz + Math.sin(a) * u.r;
        b.position.y = WATER - 0.2 + Math.sin(time * 1.3 + u.ph) * 0.25;
        b.rotation.y = -a + (u.speed > 0 ? 0 : Math.PI);
        b.rotation.z = Math.sin(time * 1.1 + u.ph) * 0.06;
      }
      for (let k = 0; k < animators.length; k++) animators[k](dt, time);
    },
    dispose() {
      scene.remove(hemi, sun, sun.target);
      if (sun.shadow && sun.shadow.map) sun.shadow.map.dispose();
      root.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
      disposables.forEach((d) => d && d.dispose && d.dispose());
      if (envRT) envRT.dispose();
      if (scene.environment === (envRT && envRT.texture)) scene.environment = prevEnv || null;
      if ('environmentIntensity' in scene) scene.environmentIntensity = prevEnvIntensity;
      scene.fog = prevFog || null;
      scene.background = prevBg || null;
    },
  };
}
