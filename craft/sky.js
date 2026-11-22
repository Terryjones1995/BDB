/* BDB Craft: the sky. A day lasts 20 minutes (like the real thing): the sun comes up in the east, sets in the west in orange, the moon follows it with
   its phase changing night to night, and stars come out. Clouds are blocky 3D puffs that drift, lit by the time of day.
   time: 0 sunrise, .25 noon, .5 sunset, .75 midnight. light() is how bright the world is (the block shader multiplies by it). */
import * as THREE from '../chess/vendor/three.module.min.js?v=c13';

export const DAY_SECONDS = 1200;
const C = h => new THREE.Color(h);
// sky top, horizon, and the glow round the sun, at noon, at sunset, and at night (written straight to the screen, no colour management)
const NOON = [C('#6fa4ff'), C('#bcd8fb')], DUSK = [C('#3f5fa8'), C('#f0a46a')], NIGHT = [C('#060b1e'), C('#15233f')];
const mix3 = (a, b, k) => a.clone().lerp(b, k);
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const DOME_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const DOME_FS = `uniform vec3 top, hor, glow, sunDir; uniform float glowAmt; varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir); float y = d.y;
  vec3 c = mix(hor, top, pow(clamp(y, 0.0, 1.0), 0.48));
  if (y < 0.0) c = mix(hor, hor * 0.55, clamp(-y * 3.0, 0.0, 1.0));
  float s = max(dot(d, sunDir), 0.0);
  c += glow * glowAmt * (pow(s, 6.0) * 0.8 + pow(s, 40.0) * 0.6) * (1.0 - clamp(abs(y) * 1.6, 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
}`;

function squareTex(draw, n = 64){ const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d'), n); const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.colorSpace = THREE.NoColorSpace; return t; }
const sunTex = squareTex((x, n) => {
  const g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); g.addColorStop(0, 'rgba(255,240,190,.55)'); g.addColorStop(.45, 'rgba(255,220,150,.18)'); g.addColorStop(1, 'rgba(255,200,120,0)');
  x.fillStyle = g; x.fillRect(0, 0, n, n); x.fillStyle = '#fffbe6'; x.fillRect(n * .34, n * .34, n * .32, n * .32); x.fillStyle = '#fff3b8'; x.fillRect(n * .38, n * .38, n * .24, n * .24);
});
function moonTex(phase){
  return squareTex((x, n) => {
    const s = n * .3, o = (n - s) / 2, px = s / 8;
    const g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); g.addColorStop(0, 'rgba(200,215,255,.22)'); g.addColorStop(1, 'rgba(200,215,255,0)'); x.fillStyle = g; x.fillRect(0, 0, n, n);
    x.fillStyle = '#e8ecf4'; x.fillRect(o, o, s, s);
    x.fillStyle = '#c3cad8'; for (const [a, b, w] of [[1, 1, 2], [5, 2, 1], [2, 5, 2], [6, 6, 1], [4, 4, 1]]) x.fillRect(o + a * px, o + b * px, w * px, w * px);
    // the dark part: 8 phases, full at 0
    const k = phase % 8; if (k){ x.fillStyle = 'rgba(8,12,24,.94)'; const cols = Math.round((k <= 4 ? k : 8 - k) / 4 * 8); if (k <= 4) x.fillRect(o + s - cols * px, o, cols * px, s); else x.fillRect(o, o, cols * px, s); }
  });
}

export function createSky(scene, seed = 1){
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({vertexShader:DOME_VS, fragmentShader:DOME_FS, side:THREE.BackSide, depthWrite:false,
    uniforms:{top:{value:NOON[0].clone()}, hor:{value:NOON[1].clone()}, glow:{value:C('#ff9a4a')}, sunDir:{value:new THREE.Vector3(0, 1, 0)}, glowAmt:{value:0}}}));
  dome.renderOrder = -10; dome.frustumCulled = false; scene.add(dome);
  // stars
  let s = (seed >>> 0) || 7; const r = () => (s = Math.imul(s ^ s >>> 15, 2246822519) + 0x9e3779b9 >>> 0, (s >>> 8) / 16777216);
  const sp = []; for (let i = 0; i < 1400; i++){ const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u); if (u < -.1) continue; sp.push(q * Math.cos(a) * 850, u * 850, q * Math.sin(a) * 850); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({color:0xffffff, size:2.2, sizeAttenuation:false, transparent:true, opacity:0, depthWrite:false, fog:false}));
  stars.renderOrder = -9; stars.frustumCulled = false; scene.add(stars);
  const disc = (t, size) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({map:t, transparent:true, depthWrite:false, fog:false, blending:THREE.AdditiveBlending})); m.renderOrder = -8; m.frustumCulled = false; scene.add(m); return m; };
  const sun = disc(sunTex, 220), moons = Array.from({length:8}, (_, i) => moonTex(i)), moon = disc(moons[0], 190); moon.material.blending = THREE.NormalBlending;
  const out = {top:new THREE.Color(), hor:new THREE.Color(), light:1, night:0, sunDir:new THREE.Vector3()};
  const v = new THREE.Vector3();
  out.update = (cam, time, day = 0) => {
    const a = time * Math.PI * 2, h = Math.sin(a);                         // sun height, -1..1
    out.sunDir.set(Math.cos(a), h, .28).normalize();
    const dayK = ss(-.08, .32, h), duskK = Math.max(0, 1 - Math.abs(h) / .32) * ss(-.3, 0, h + .1);
    const top = mix3(NIGHT[0], NOON[0], dayK), hor = mix3(NIGHT[1], NOON[1], dayK);
    top.lerp(DUSK[0], duskK * .45); hor.lerp(DUSK[1], duskK * .75);
    out.top.copy(top); out.hor.copy(hor); out.night = 1 - ss(-.25, .05, h);
    out.light = .34 + .66 * ss(-.18, .25, h);
    const u = dome.material.uniforms; u.top.value.copy(top); u.hor.value.copy(hor); u.sunDir.value.copy(out.sunDir); u.glowAmt.value = duskK;
    dome.position.copy(cam.position); stars.position.copy(cam.position); stars.rotation.z = a; stars.material.opacity = out.night * .9;
    v.copy(out.sunDir).multiplyScalar(700); sun.position.copy(cam.position).add(v); sun.lookAt(cam.position);
    moon.position.copy(cam.position).sub(v); moon.lookAt(cam.position); moon.material.map = moons[Math.floor(day) % 8];
    sun.material.opacity = ss(-.15, .05, h); moon.material.opacity = ss(-.15, .05, -h) * .95 + .05;
    return out;
  };
  return out;
}

/* clouds: a 64 x 64 grid of cells (12 blocks each), switched on by a smoothed noise, extruded 4 blocks tall, every face shaded the way a block is.
   The same tile is drawn nine times round you so it never ends, and fades out into the distance */
const CLOUD_VS = `attribute float shade; varying float vS; varying float vD; void main(){ vS = shade; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = length(mv.xz); gl_Position = projectionMatrix * mv; }`;
const CLOUD_FS = `uniform vec3 tint; uniform float far; varying float vS; varying float vD; void main(){ float a = 0.82 * (1.0 - smoothstep(far * 0.55, far, vD)); if (a < 0.01) discard; gl_FragColor = vec4(tint * vS, a); }`;
const NIGHT_CLOUD = new THREE.Color();
export function createClouds(scene, seed = 1234){
  const N = 64, CELL = 12, TH = 4, TILE = N * CELL;
  let s = (seed >>> 0) || 1; const r = () => (s = Math.imul(s ^ s >>> 15, 2246822519) + 0x9e3779b9 >>> 0, (s >>> 8) / 16777216);
  const g0 = new Float32Array(N * N); for (let i = 0; i < N * N; i++) g0[i] = r();
  const on = new Uint8Array(N * N);
  for (let b = 0; b < N; b++) for (let a = 0; a < N; a++){ let t = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) t += g0[((b + dy + N) % N) * N + (a + dx + N) % N]; on[b * N + a] = t / 25 > .545 ? 1 : 0; }
  const at = (a, b) => on[((b + N) % N) * N + (a + N) % N];
  const pos = [], shade = [], idx = [];
  const quad = (p, sh) => { const k = pos.length / 3; pos.push(...p); for (let i = 0; i < 4; i++) shade.push(sh); idx.push(k, k + 1, k + 2, k, k + 2, k + 3); };
  for (let b = 0; b < N; b++) for (let a = 0; a < N; a++){
    if (!at(a, b)) continue; const x0 = a * CELL, x1 = x0 + CELL, z0 = b * CELL, z1 = z0 + CELL;
    quad([x0, TH, z1, x1, TH, z1, x1, TH, z0, x0, TH, z0], 1);
    quad([x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1], .72);
    if (!at(a + 1, b)) quad([x1, 0, z1, x1, 0, z0, x1, TH, z0, x1, TH, z1], .86);
    if (!at(a - 1, b)) quad([x0, 0, z0, x0, 0, z1, x0, TH, z1, x0, TH, z0], .86);
    if (!at(a, b + 1)) quad([x0, 0, z1, x1, 0, z1, x1, TH, z1, x0, TH, z1], .8);
    if (!at(a, b - 1)) quad([x1, 0, z0, x0, 0, z0, x0, TH, z0, x1, TH, z0], .8);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('shade', new THREE.Float32BufferAttribute(shade, 1)); geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({vertexShader:CLOUD_VS, fragmentShader:CLOUD_FS, transparent:true, depthWrite:false, side:THREE.DoubleSide, uniforms:{tint:{value:C('#ffffff')}, far:{value:420}}});
  const group = new THREE.Group(); scene.add(group); const tiles = [];
  for (let i = 0; i < 9; i++){ const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 3; group.add(m); tiles.push(m); }
  let drift = 0;
  return {
    group,
    update(cam, dt, sky){
      drift += dt * 1.6;
      const bx = Math.floor((cam.position.x - drift) / TILE) * TILE + drift, bz = Math.floor(cam.position.z / TILE) * TILE;
      let i = 0; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) tiles[i++].position.set(bx + dx * TILE, 150, bz + dz * TILE);
      if (sky){ const t = mat.uniforms.tint.value, k = (sky.light - .34) / .66; t.setRGB(.16, .19, .28).lerp(NIGHT_CLOUD.setRGB(1, 1, 1).lerp(sky.hor, .3), k); }
    },
    set far(v){ mat.uniforms.far.value = v; }
  };
}
