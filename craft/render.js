/* BDB Craft: how things look. The block shader (every texture sits in one texture array, so a whole chunk is one draw), the sky, the clouds, the outline
   round the block you are pointing at, and your friends' blocky bodies with name tags. */
import * as THREE from '../chess/vendor/three.module.min.js?v=c17';
import { TS } from './tex.js?v=c17';
import { TEX, T } from './blocks.js?v=c17';
import { body } from './skin.js?v=c17';

const VS = `in vec3 position; in vec3 tex; in vec2 light;
uniform mat4 modelViewMatrix, projectionMatrix;
out vec3 vT; out vec2 vL; out float vD;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vT = tex; vL = light; vD = length(mv.xyz); }`;
const FS = `precision highp float; precision highp sampler2DArray;
uniform sampler2DArray map; uniform vec3 fogColor; uniform float fogNear, fogFar, cut, bright, time, wl, ll;
in vec3 vT; in vec2 vL; in float vD; out vec4 col;
void main(){
  vec2 uv = vT.xy;
  // water and lava move: the picture drifts and ripples
  if (abs(vT.z - wl) < .5){ uv += vec2(time * .05, time * .035) + .06 * vec2(sin(uv.y * 2.1 + time * 1.3), cos(uv.x * 1.7 + time * 1.1)); }
  else if (abs(vT.z - ll) < .5){ uv += vec2(time * .012, time * .008) + .04 * vec2(sin(uv.y * 1.3 + time * .5), cos(uv.x * 1.1 + time * .4)); }
  vec4 c = textureGrad(map, vec3(fract(uv), vT.z), dFdx(vT.xy), dFdy(vT.xy));
  if (c.a < cut) discard;
  vec3 lit = max(vec3(vL.x * bright), vL.y * vec3(1.0, 0.88, 0.7));      // daylight or the warm light of torches and lamps, whichever is brighter
  vec3 rgb = c.rgb * lit;
  col = vec4(mix(rgb, fogColor, smoothstep(fogNear, fogFar, vD)), c.a);
}`;
export const SKY = new THREE.Color('#8fc3ff'), HORIZON = new THREE.Color('#c6defa');

export function blockMaterials(layers){
  const t = new THREE.DataArrayTexture(layers, TS, TS, TEX.length);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; t.needsUpdate = true;
  const u = () => ({map:{value:t}, fogColor:{value:new THREE.Vector3(HORIZON.r, HORIZON.g, HORIZON.b)}, fogNear:{value:60}, fogFar:{value:120}, cut:{value:.5}, bright:{value:1}, time:{value:0}, wl:{value:T.water}, ll:{value:T.lava}});
  const solid = new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3, vertexShader:VS, fragmentShader:FS, uniforms:u()});
  const clear = new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3, vertexShader:VS, fragmentShader:FS, uniforms:u(), transparent:true, depthWrite:false, side:THREE.DoubleSide});
  clear.uniforms.cut.value = .02;
  return {solid, clear, texture:t, tick(dt){ for (const m of [solid, clear]) m.uniforms.time.value += dt; }, fog(near, far){ for (const m of [solid, clear]){ m.uniforms.fogNear.value = near; m.uniforms.fogFar.value = far; } }, refresh(){ t.needsUpdate = true; }};
}
/* the colours are written straight to the screen by the block shader; three.js would turn ours from linear, so the sky is set to match by hand */
export function sky(scene){
  const g = new THREE.SphereGeometry(900, 24, 12), top = SKY.clone().convertSRGBToLinear(), hor = HORIZON.clone().convertSRGBToLinear();
  const cols = []; const p = g.attributes.position;
  for (let i = 0; i < p.count; i++){ const y = p.getY(i) / 900, k = Math.pow(Math.max(0, y), .55); const c = hor.clone().lerp(top, k); if (y < 0) c.copy(hor); cols.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({vertexColors:true, side:THREE.BackSide, depthWrite:false, fog:false}));
  m.renderOrder = -10; m.frustumCulled = false; scene.add(m);
  // the sun: a square, the way it should be
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({color:new THREE.Color('#fff6c8').convertSRGBToLinear(), depthWrite:false, fog:false, transparent:true, opacity:.95}));
  sun.renderOrder = -9; sun.frustumCulled = false; scene.add(sun);
  return {follow(cam){ m.position.copy(cam.position); sun.position.copy(cam.position).add(new THREE.Vector3(-300, 420, -500)); sun.lookAt(cam.position); }};
}
/* clouds: flat blocky puffs high up, drifting slowly. One big plane with a nearest-filtered picture, tiled and scrolled */
export function clouds(scene, seed){
  const n = 64, c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'), im = x.createImageData(n, n);
  let s = (seed >>> 0) || 1; const r = () => (s = Math.imul(s ^ s >>> 15, 2246822519) + 0x9e3779b9 >>> 0, (s >>> 8) / 16777216);
  const g = new Float32Array(n * n); for (let i = 0; i < n * n; i++) g[i] = r();
  const sm = (a, b) => { let t = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) t += g[((b + dy + n) % n) * n + (a + dx + n) % n]; return t / 25; };
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++){ const v = sm(a, b), on = v > .555; const o = (b * n + a) * 4; im.data[o] = im.data[o + 1] = im.data[o + 2] = 255; im.data[o + 3] = on ? 215 : 0; }
  x.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1536, 1536), new THREE.MeshBasicMaterial({map:t, transparent:true, depthWrite:false, fog:false, side:THREE.DoubleSide, opacity:.9}));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.frustumCulled = false; scene.add(m);
  let drift = 0;
  return {update(cam, dt){ drift += dt * 1.2; m.position.set(Math.round(cam.position.x / 12) * 12, 146, Math.round(cam.position.z / 12) * 12); t.offset.set((m.position.x + drift) / 384, -m.position.z / 384); }, mesh:m};
}
/* the thin dark box round the block you are pointing at */
export function outline(scene){
  const e = .004, g = new THREE.EdgesGeometry(new THREE.BoxGeometry(1 + e * 2, 1 + e * 2, 1 + e * 2));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({color:0x000000, transparent:true, opacity:.55, fog:false}));
  l.visible = false; scene.add(l);
  return {show(hit, b){ if (!hit){ l.visible = false; return; } b = b || [0, 0, 0, 1, 1, 1]; l.visible = true; l.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); l.position.set(hit.x + (b[0] + b[3]) / 2, hit.y + (b[1] + b[4]) / 2, hit.z + (b[2] + b[5]) / 2); }};
}
/* a friend (or you, seen from behind): their own blocky character from skin.js, and their name floating over it */
export function avatar(scene, name, skinData){
  const bd = body(skinData), g = bd.group, {head, la, ra, ll, rl} = bd;
  // the name tag
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.font = '600 34px Figtree, system-ui, sans-serif'; const w = Math.min(250, x.measureText(name).width + 28);
  x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect((256 - w) / 2, 6, w, 52); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, 128, 33, 230);
  const tt = new THREE.CanvasTexture(c); tt.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({map:tt, depthTest:false, transparent:true})); tag.scale.set(1.6, .4, 1); tag.position.y = 2.25; tag.renderOrder = 5; g.add(tag);
  scene.add(g);
  let walk = 0, last = null;
  const a = {group:g, target:null, name, tag, snap:false,
    set(p){ a.target = p; if (!last){ g.position.set(p.x, p.y, p.z); last = {...p}; } },
    update(dt){
      const p = a.target; if (!p) return;
      const k = a.snap ? 1 : 1 - Math.exp(-dt * 14), ox = g.position.x, oz = g.position.z;
      g.position.x += (p.x - g.position.x) * k; g.position.y += (p.y - g.position.y) * k; g.position.z += (p.z - g.position.z) * k;
      let dy = p.yaw + Math.PI - g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); g.rotation.y += dy * k;
      head.rotation.x = -(p.pitch || 0) * .8;
      const sp = Math.hypot(g.position.x - ox, g.position.z - oz) / Math.max(dt, 1e-3); walk += dt * Math.min(sp, 8) * 2.2;
      const sw = Math.sin(walk) * Math.min(1, sp / 3) * .7; la.rotation.x = sw; ra.rotation.x = -sw; ll.rotation.x = -sw; rl.rotation.x = sw;
    },
    dispose(){ scene.remove(g); bd.dispose(); tt.dispose(); }};
  return a;
}
