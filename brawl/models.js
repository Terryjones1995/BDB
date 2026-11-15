/* Break Room Brawl: towers, buildings and props built from three.js primitives, and the way in to the character models in rigs.js.
   makeModel(key, team, opts) -> {g, h, fly, turret, anim(t, s)}.  Models face +z.
   s = {mv, ph, atk, chg, aim}: moving, walk phase, seconds since the last attack, charging, turret yaw. */
import * as THREE from 'three';
import { AFF, UNITS } from './cards.js?v=1115n';
import { needRigs, hasRig, makeRig, useRim } from './rigs.js?v=1115n';

const PI = Math.PI;
export const TEAM = [0x3d8bff, 0xff4b47];
const GC = new Map(), MC = new Map(), TC = {};
const geo = (k, f) => { let g = GC.get(k); if (!g){ g = f(); GC.set(k, g); } return g; };
const SPH = (r, w = 18, h = 12) => geo(`s${r}|${w}`, () => new THREE.SphereGeometry(r, w, h));
const HALF = r => geo(`h${r}`, () => new THREE.SphereGeometry(r, 18, 9, 0, PI * 2, 0, PI / 2));
const BOX = (w, h, d) => geo(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
const CYL = (a, b, h, n = 16, open = false) => geo(`c${a}|${b}|${h}|${n}|${open}`, () => new THREE.CylinderGeometry(a, b, h, n, 1, open));
const CAP = (r, l) => geo(`k${r}|${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 12));
const CONE = (r, h, n = 14) => geo(`n${r}|${h}|${n}`, () => new THREE.ConeGeometry(r, h, n));
const TOR = (r, t, arc = PI * 2) => geo(`t${r}|${t}|${arc}`, () => new THREE.TorusGeometry(r, t, 8, 28, arc));
const ROCK = r => geo(`d${r}`, () => new THREE.DodecahedronGeometry(r, 0));
const PLN = (w, h) => geo(`p${w}|${h}`, () => new THREE.PlaneGeometry(w, h));

const GRAD = (() => { const t = new THREE.DataTexture(new Uint8Array([105, 105, 105, 255, 180, 180, 180, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
/* a soft edge light, so characters and buildings lift off whatever is behind them */
export function rim(m){
  m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'float rimK = pow( 1.0 - clamp( dot( normalize( vViewPosition ), normal ), 0.0, 1.0 ), 3.0 );\n\toutgoingLight += vec3( 1.0, 0.96, 0.86 ) * rimK * 0.34;\n\t#include <opaque_fragment>'); };
  m.customProgramCacheKey = () => 'rim';
  return m;
}
useRim(rim);
let TINT = null; const _tc = new THREE.Color(), _tt = new THREE.Color();
export function M(color, o = {}){
  if (TINT != null && !o.keep) color = _tc.set(color).lerp(_tt.set(TINT), .46).getHex();     // a card style recolours the whole character
  const k = color + '|' + (o.r ?? '') + '|' + (o.m ?? '') + '|' + (o.e ?? '') + '|' + (o.ei ?? '') + '|' + (o.o ?? '') + '|' + (o.flat ? 1 : 0) + '|' + (o.ds ? 1 : 0) + '|' + (o.map ? o.map.uuid : '') + '|' + (o.emap ? o.emap.uuid : '');
  let m = MC.get(k);
  if (!m){
    m = new THREE.MeshToonMaterial({color, gradientMap:GRAD, emissive:o.e ?? 0, emissiveIntensity:o.ei ?? 1, transparent:o.o != null, opacity:o.o ?? 1,
      side:o.ds ? THREE.DoubleSide : THREE.FrontSide, map:o.map || null, emissiveMap:o.emap || null, depthWrite:o.o == null || o.o > .6});
    rim(m);
    MC.set(k, m);
  }
  return m;
}
function P(par, g, m, p, r, s){
  const o = new THREE.Mesh(g, m); o.castShadow = true;
  if (p) o.position.set(p[0], p[1], p[2]);
  if (r) o.rotation.set(r[0], r[1], r[2]);
  if (s) typeof s === 'number' ? o.scale.setScalar(s) : o.scale.set(s[0], s[1], s[2]);
  par.add(o); return o;
}
function Gp(par, p, r){ const g = new THREE.Group(); if (p) g.position.set(p[0], p[1], p[2]); if (r) g.rotation.set(r[0], r[1], r[2]); if (par) par.add(g); return g; }

/* ---------- drawn textures ---------- */
function ctex(k, w, h, draw, rep){
  if (TC[k]) return TC[k];
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (rep){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return TC[k] = t;
}
let faceDone = null;
/* resolves once his photo is in memory, so the first thumbnails are not blank */
export const preload = () => new Promise(res => { faceDone = res; TX.face(); setTimeout(res, 4000); });
/* fetch the character files a match is about to need. Gives up waiting after a while: anything still missing is drawn as a stand-in. */
export const needModels = (keys, ms = 30000) => Promise.race([needRigs(keys), new Promise(res => setTimeout(res, ms))]);
export const TX = {
  face(){ if (!TC.face){ TC.face = new THREE.TextureLoader().load('../assets/face.jpg', () => { faceDone && faceDone(); }, undefined, () => { faceDone && faceDone(); }); TC.face.colorSpace = THREE.SRGBColorSpace; TC.face.anisotropy = 4; } return TC.face; },
  ball: () => ctex('ball', 256, 128, (x, w, h) => { x.fillStyle = '#e8792a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#3a1a06'; x.lineWidth = 5;
    for (const u of [0, .25, .5, .75, 1]){ x.beginPath(); x.moveTo(u * w, 0); x.lineTo(u * w, h); x.stroke(); } x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke(); }),
  stripes: () => ctex('stripes', 128, 32, (x, w, h) => { for (let i = 0; i < 8; i++){ x.fillStyle = i % 2 ? '#15171c' : '#f6f6f2'; x.fillRect(i * w / 8, 0, w / 8, h); } }),
  brick: () => ctex('brick', 512, 512, (x, w, h) => {                 // rounded stones with soft shading, not hard little rectangles
    x.fillStyle = '#8f9ab0'; x.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++){ const o = r % 2 ? 51 : 0, v = 168 + ((r * 7 + c * 13) % 6) * 9, bx = c * 102.4 + o + 4, by = r * 64 + 4;
      const g = x.createLinearGradient(0, by, 0, by + 56); g.addColorStop(0, `rgb(${v + 22},${v + 28},${v + 44})`); g.addColorStop(1, `rgb(${v - 14},${v - 6},${v + 14})`);
      x.fillStyle = g; x.beginPath(); x.roundRect(bx, by, 94.4, 56, 13); x.fill(); x.fillStyle = 'rgba(255,255,255,.2)'; x.beginPath(); x.roundRect(bx + 6, by + 5, 82, 12, 6); x.fill(); } }, [3, 1.4]),
  snacks: () => ctex('snacks', 128, 192, (x, w, h) => { x.fillStyle = '#0c1326'; x.fillRect(0, 0, w, h); const cs = ['#ff8a2b', '#f2c14e', '#4ade80', '#ff5a8a', '#4fb3ff', '#c77dff'];
    for (let r = 0; r < 5; r++){ x.fillStyle = '#26324f'; x.fillRect(4, r * 36 + 32, w - 8, 4); for (let c = 0; c < 4; c++){ x.fillStyle = cs[(r * 3 + c * 5) % 6]; x.fillRect(10 + c * 29, r * 36 + 8, 20, 24); x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(12 + c * 29, r * 36 + 12, 16, 5); } } }),
  digits: () => ctex('digits', 128, 64, (x, w, h) => { x.fillStyle = '#12060a'; x.fillRect(0, 0, w, h); x.fillStyle = '#ff3a2a'; x.font = '700 56px "Arial Narrow", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = '#ff3a2a'; x.shadowBlur = 10; x.fillText('00', w / 2, h / 2 + 3); }),
  clock: () => ctex('clock', 128, 128, (x, w) => { const c = w / 2; x.fillStyle = '#fbf8f2'; x.beginPath(); x.arc(c, c, c, 0, 7); x.fill(); x.strokeStyle = '#151a26'; x.lineWidth = 5; x.lineCap = 'round';
    for (let i = 0; i < 12; i++){ const a = i / 12 * 6.283; x.beginPath(); x.moveTo(c + Math.cos(a) * 50, c + Math.sin(a) * 50); x.lineTo(c + Math.cos(a) * 58, c + Math.sin(a) * 58); x.stroke(); }
    x.lineWidth = 7; x.beginPath(); x.moveTo(c, c); x.lineTo(c, c - 40); x.stroke(); x.beginPath(); x.moveTo(c, c); x.lineTo(c + 26, c + 12); x.stroke(); }),
  wet: () => ctex('wet', 128, 224, (x, w, h) => {                      // the face of a wet floor sign: warning triangle, a figure going over, two bars of small print
    x.fillStyle = '#ffd21f'; x.fillRect(0, 0, w, h); x.fillStyle = '#15171c'; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(64, 14); x.lineTo(116, 100); x.lineTo(12, 100); x.closePath(); x.fill();
    x.fillStyle = '#ffd21f'; x.beginPath(); x.moveTo(64, 34); x.lineTo(98, 90); x.lineTo(30, 90); x.closePath(); x.fill();
    x.fillStyle = '#15171c'; x.beginPath(); x.roundRect(58, 48, 12, 26, 5); x.fill(); x.beginPath(); x.arc(64, 82, 6, 0, 7); x.fill();
    x.strokeStyle = '#15171c'; x.lineWidth = 9; x.lineCap = 'round'; x.beginPath(); x.arc(40, 128, 9, 0, 7); x.fill();
    x.beginPath(); x.moveTo(50, 140); x.lineTo(72, 158); x.lineTo(100, 150); x.stroke(); x.beginPath(); x.moveTo(72, 158); x.lineTo(58, 180); x.lineTo(34, 176); x.stroke(); x.beginPath(); x.moveTo(60, 148); x.lineTo(84, 132); x.stroke();
    x.beginPath(); x.roundRect(18, 194, 92, 9, 4); x.fill(); x.beginPath(); x.roundRect(30, 208, 68, 7, 3); x.fill(); }),
  replay: () => ctex('replay', 256, 160, (x, w, h) => {                // a screen mid-rewind
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0a2f55'); g.addColorStop(1, '#0e7fc0'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,.07)'; for (let y = 0; y < h; y += 6) x.fillRect(0, y, w, 2);
    x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineWidth = 13; x.lineCap = 'round'; x.beginPath(); x.arc(128, 82, 44, -1.1, 3.9); x.stroke();
    x.beginPath(); x.moveTo(74, 30); x.lineTo(116, 34); x.lineTo(88, 66); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(146, 82); x.lineTo(124, 66); x.lineTo(124, 98); x.closePath(); x.fill(); x.beginPath(); x.moveTo(124, 82); x.lineTo(102, 66); x.lineTo(102, 98); x.closePath(); x.fill();
    x.fillStyle = '#ff4b47'; x.beginPath(); x.arc(226, 26, 9, 0, 7); x.fill(); }),
  crest: () => ctex('crest', 128, 128, (x, w) => { x.fillStyle = '#12306b'; x.fillRect(0, 0, w, w); x.fillStyle = '#f2c14e'; x.beginPath();
    for (let i = 0; i < 10; i++){ const a = i / 10 * 6.283 - PI / 2, r = i % 2 ? 22 : 50; x.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r); } x.fill(); })
};
const ballMat = () => M(0xffffff, {map:TX.ball(), r:.8});
export const basketball = r => { const b = new THREE.Mesh(SPH(r, 16, 12), ballMat()); b.castShadow = true; return b; };
function starGeo(){ return geo('star', () => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++){ const a = i / 10 * PI * 2 + PI / 2, r = i % 2 ? .05 : .12; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } return new THREE.ExtrudeGeometry(s, {depth:.04, bevelEnabled:false}); }); }
function boltGeo(){ return geo('bolt', () => { const s = new THREE.Shape(); for (const [x, y, i] of [[.1, .6], [-.3, 0], [-.04, 0], [-.18, -.6], [.3, .1], [.04, .1], [.26, .6]].map((p, i) => [...p, i])) i ? s.lineTo(x, y) : s.moveTo(x, y); return new THREE.ShapeGeometry(s); }); }
function shieldGeo(){ return geo('shield', () => { const s = new THREE.Shape(); s.moveTo(-.55, .6); s.lineTo(.55, .6); s.lineTo(.55, -.05); s.quadraticCurveTo(.5, -.6, 0, -.85); s.quadraticCurveTo(-.5, -.6, -.55, -.05); s.lineTo(-.55, .6); return new THREE.ExtrudeGeometry(s, {depth:.08, bevelEnabled:false}); }); }
function uturnGeo(){ return geo('uturn', () => { const s = new THREE.Shape(), R = .46, r = .26;            // a fat "go back" arrow
  s.moveTo(R, -.3); s.lineTo(R, 0); s.absarc(0, 0, R, 0, PI, false); s.lineTo(-R - .17, 0); s.lineTo(-(R + r) / 2, -.38); s.lineTo(-r + .17, 0); s.lineTo(-r, 0); s.absarc(0, 0, r, PI, 0, true); s.lineTo(r, -.3); s.closePath();
  return new THREE.ExtrudeGeometry(s, {depth:.14, bevelEnabled:false}).translate(0, 0, -.07); }); }
function wingGeo(k, sc){ return geo('wing' + k, () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(sc, .35 * sc); s.lineTo(.95 * sc, -.05 * sc); s.lineTo(.72 * sc, -.2 * sc); s.lineTo(.62 * sc, -.02 * sc); s.lineTo(.42 * sc, -.24 * sc); s.lineTo(.3 * sc, -.04 * sc); s.lineTo(.12 * sc, -.22 * sc); s.closePath(); return new THREE.ShapeGeometry(s); }); }

/* ---------- the little people ---------- */
function eyes(head, hr, o = {}){
  const m = M(o.col ?? 0x15171c, {r:.3, e:o.glow || 0}), r = o.r || .036, gx = hr * (o.gap || .36);
  for (const sx of [-1, 1]){
    if (o.white) P(head, SPH(r * 1.9, 10, 8), M(0xffffff, {r:.3}), [sx * gx, o.y || .02, hr * .82]);
    P(head, SPH(r, 10, 8), m, [sx * gx, o.y || .02, hr * (o.white ? .96 : .9)]);
  }
}
function human(o = {}){
  const s = o.s || 1, thin = o.thin || 1, bw = o.bulk || 1, skin = M(o.skin ?? 0xe6b48e), top = o.topMat || M(o.top ?? 0x3d8bff), bot = M(o.bottom ?? 0x23283a), shoe = M(o.shoe ?? 0xf4f4f4);
  const g = new THREE.Group(), body = Gp(g); body.scale.setScalar(s);
  const leg = .3, bh = .44 * (o.tall || 1), hr = o.headR || .25;
  const torso = o.robe ? P(body, CYL(.14 * bw, .34 * bw, leg + bh, 16), top, [0, (leg + bh) / 2, 0]) : P(body, CAP(.2, bh - .2), top, [0, leg + bh / 2 + .02, 0], null, [bw * 1.12, 1, bw * .86]);
  const head = Gp(body, [0, leg + bh + hr * .8 + .03, 0]);
  if (!o.noHead) P(head, SPH(hr, 20, 14), skin);
  const arm = sx => { const a = Gp(body, [sx * (.224 * bw + .07), leg + bh - .06, 0]); P(a, CAP(.068 * thin, .2), o.bare ? skin : top, [0, -.15, 0]); a.hand = Gp(a, [0, -.34, 0]); P(a.hand, SPH(.085 * thin, 10, 8), skin); return a; };
  const lg = sx => { const l = Gp(body, [sx * .11 * bw, leg + .04, 0]); if (!o.robe) P(l, CAP(.08 * thin, .14), bot, [0, -.13, 0]); P(l, BOX(.15, .1, .25), shoe, [0, -.29, .04]); return l; };
  return {g, body, torso, head, hr, armL:arm(-1), armR:arm(1), legL:lg(-1), legR:lg(1), h:(leg + bh + hr * 2 + .12) * s, seed:Math.random() * 6};
}
function cap(head, hr, col){ P(head, HALF(hr * 1.06), M(col), [0, hr * .12, 0]); P(head, BOX(hr * 1.3, .03, hr * .8), M(col), [0, hr * .22, hr * .95]); }
function band(head, hr, col){ P(head, TOR(hr * .97, .035), M(col), [0, hr * .3, 0], [PI / 2, 0, 0]); }
function wizHat(head, hr, col, bandCol){ P(head, CYL(hr * 1.5, hr * 1.5, .03, 20), M(col), [0, hr * .55, 0]); P(head, CONE(hr * .95, hr * 2.6, 16), M(col), [0, hr * 1.8, 0], [.12, 0, .08]); P(head, CYL(hr * .93, hr * .97, .07, 16), M(bandCol), [0, hr * .66, 0]); }
function walker(R, o = {}){
  const sw = o.swing || 'chop', dur = o.dur || .34;
  return (t, s) => {
    const w = s.mv ? Math.sin(s.ph) : 0, a = s.atk < dur ? s.atk / dur : -1, e = a >= 0 ? 1 - (1 - a) * (1 - a) : 0;
    R.legL.rotation.x = w * .9; R.legR.rotation.x = -w * .9;
    let aL = o.carry ? o.carry[0] : -w * .7, aR = o.carry ? o.carry[1] : w * .7;
    if (a >= 0){
      if (sw === 'chop') aR = -2.8 + e * 3.3;
      else if (sw === 'throw'){ aR = -3 + e * 1.7; aL = -2.5 + e * 1.3; }
      else if (sw === 'slam') aR = aL = -3 + e * 3.5;
      else if (sw === 'cast') aR = -1.3 - Math.sin(a * PI) * 1.3;
    }
    R.armL.rotation.x = aL; R.armR.rotation.x = aR;
    R.body.position.y = s.mv ? Math.abs(w) * .05 : Math.sin(t * 2.2 + R.seed) * .012;
    R.body.rotation.x = (s.mv ? .1 : 0) + (o.lean || 0) * (s.chg ? 2 : 1) + (a >= 0 && sw === 'slam' ? Math.sin(a * PI) * .35 : 0);
    R.head.rotation.y = s.mv ? Math.sin(s.ph * .5) * .1 : Math.sin(t * .9 + R.seed) * .45; R.head.rotation.z = s.mv ? Math.sin(s.ph) * .08 : 0;      // looks around when idle, bobs when running
    R.torso.rotation.y = s.mv ? Math.sin(s.ph) * .18 : 0;
    if (o.extra) o.extra(t, s, a);
  };
}
const out = (R, anim, x = {}) => ({g:R.g, h:R.h, anim, ...x});

/* ---------- towers ---------- */
function cannon(par, y, team, sc = 1){
  const t = Gp(par, [0, y, 0]); t.scale.setScalar(sc);
  P(t, CYL(.34, .4, .3, 16), M(0x30384c, {m:.5, r:.4}), [0, .15, 0]);
  const br = Gp(t, [0, .36, 0]);
  P(br, CYL(.17, .22, .8, 14), M(0x222836, {m:.6, r:.35}), [0, .1, .34], [1.15, 0, 0]);
  P(br, TOR(.19, .04), M(TEAM[team]), [0, .26, .68], [1.15 - PI / 2, 0, 0]);
  const b = basketball(.15); b.position.set(0, .3, .76); br.add(b);
  t.barrel = br; return t;
}
function flag(par, x, y, z, team){ P(par, CYL(.03, .03, 1, 6), M(0xd9dde8, {m:.6}), [x, y + .5, z]); P(par, BOX(.5, .3, .03), M(TEAM[team]), [x + .27, y + .82, z]); }
function princess(team){
  const g = new THREE.Group(), stone = M(0xffffff, {map:TX.brick(), r:.9});
  P(g, CYL(1.02, 1.16, 1.7, 24), stone, [0, .85, 0]);
  P(g, CYL(1.2, 1.2, .2, 24), M(0x7b879f, {r:.85}), [0, .1, 0]);
  P(g, CYL(1.06, 1.06, .22, 24), M(TEAM[team], {r:.5}), [0, 1.42, 0]);
  P(g, CYL(1.2, 1.1, .26, 24), M(0xc6cede, {r:.85}), [0, 1.8, 0]);
  for (let i = 0; i < 10; i++){ const a = i / 10 * PI * 2; P(g, BOX(.34, .26, .2), M(0xc6cede, {r:.85}), [Math.cos(a) * 1.1, 2.04, Math.sin(a) * 1.1], [0, -a + PI / 2, 0]); }
  const t = cannon(g, 1.92, team); flag(g, -.75, 1.9, -.6, team);
  return {g, h:3.0, turret:t, anim(tm, s){ t.rotation.y = s.aim || 0; t.barrel.position.z = s.atk < .2 ? -.14 * (1 - s.atk / .2) : 0; }};
}
function king(team, o = {}){
  const g = new THREE.Group(), stone = M(0xffffff, {map:TX.brick(), r:.9}), trim = M(0xc6cede, {r:.85});
  P(g, BOX(3.1, .3, 3.1), M(0x7b879f, {r:.85}), [0, .15, 0]);
  P(g, BOX(2.7, 2.1, 2.7), stone, [0, 1.3, 0]);
  P(g, BOX(2.76, .28, 2.76), M(TEAM[team], {r:.5}), [0, 1.95, 0]);
  P(g, BOX(3, .3, 3), trim, [0, 2.5, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]){ P(g, CYL(.36, .4, 2.9, 12), stone, [sx * 1.36, 1.6, sz * 1.36]); P(g, CONE(.46, .6, 12), M(TEAM[team], {r:.5}), [sx * 1.36, 3.35, sz * 1.36]); }
  for (let i = -1; i <= 1; i++) for (const sz of [-1, 1]){ P(g, BOX(.5, .3, .26), trim, [i * .82, 2.8, sz * 1.36]); P(g, BOX(.26, .3, .5), trim, [sz * 1.36, 2.8, i * .82]); }
  // the portrait over the gate
  P(g, BOX(1.7, 1.7, .12), M(0xf2c14e, {m:.7, r:.3}), [0, 1.25, 1.38]);
  P(g, new THREE.PlaneGeometry(1.46, 1.46), M(0xffffff, {map:o.face ? TX.face() : TX.crest(), r:.7, keep:true}), [0, 1.25, 1.45]);
  const t = cannon(g, 2.62, team, 1.5); t.position.y = 2.2;
  flag(g, 0, 3.5, -1.36, team);
  return {g, h:4.4, turret:t, anim(tm, s){ t.rotation.y = s.aim || 0; t.position.y += ((s.active ? 2.62 : 2.2) - t.position.y) * .1; t.barrel.position.z = s.atk < .2 ? -.14 * (1 - s.atk / .2) : 0; }};
}

/* ---------- buildings ---------- */
const OCT = r => geo('o' + r, () => new THREE.OctahedronGeometry(r, 0));
const ring = (g, team, r) => P(g, TOR(r, .05), M(TEAM[team], {r:.5}), [0, .05, 0], [PI / 2, 0, 0]);
const MK = {
  cannon(team){ const g = new THREE.Group(); P(g, CYL(.66, .76, .34, 18), M(0x6b7387, {r:.85}), [0, .17, 0]); ring(g, team, .78); const t = cannon(g, .32, team, 1.5);
    return {g, h:1.5, turret:t, anim(tm, s){ t.rotation.y = s.aim || 0; t.barrel.position.z = s.atk < .2 ? -.14 * (1 - s.atk / .2) : 0; }}; },
  watchtower(team){ const g = new THREE.Group(), wood = M(0xa9773f, {r:.8}), dk = M(0x6e4a28, {r:.8});
    for (const sx of [-1, 1]) for (const sz of [-1, 1]){ P(g, CYL(.07, .1, 2, 8), dk, [sx * .44, 1, sz * .44], [sz * .07, 0, -sx * .07]); P(g, CYL(.045, .045, .74, 6), dk, [sx * .5, 2.4, sz * .5]); }
    P(g, BOX(1.24, .12, 1.24), wood, [0, 1.94, 0]); for (const [x, z, w, d] of [[0, .58, 1.24, .07], [0, -.58, 1.24, .07], [.58, 0, .07, 1.24], [-.58, 0, .07, 1.24]]) P(g, BOX(w, .3, d), wood, [x, 2.14, z]);
    P(g, CONE(.98, .72, 4), M(TEAM[team], {r:.6}), [0, 3.12, 0], [0, PI / 4, 0]); ring(g, team, .8);
    const t = Gp(g, [0, 2.3, 0]); t.barrel = P(t, BOX(.14, .1, .74), dk, [0, 0, .2]); P(t, BOX(.74, .06, .08), wood, [0, .03, .44]);
    return {g, h:3.5, turret:t, anim(tm, s){ t.rotation.y = s.aim || 0; t.barrel.position.z = .2 - (s.atk < .2 ? .12 * (1 - s.atk / .2) : 0); }}; },
  manawell(team){ const g = new THREE.Group(), st = M(0x8d97ab, {r:.9}), glow = M(0x4fd8ff, {e:0x2fb8ff, ei:1.7, keep:true});
    P(g, CYL(.8, .92, .52, 20), st, [0, .26, 0]); P(g, TOR(.74, .12), M(0xb4bccb, {r:.85}), [0, .54, 0], [PI / 2, 0, 0]); P(g, CYL(.66, .66, .06, 20), glow, [0, .52, 0]); ring(g, team, .96);
    const c = P(g, OCT(.34), glow, [0, 1.4, 0]), orbs = [0, 1, 2].map(i => P(g, SPH(.09, 8, 6), glow, [0, 1, 0]));
    return {g, h:2.1, anim(t){ c.rotation.y = t * 1.4; c.position.y = 1.4 + Math.sin(t * 2.2) * .1; orbs.forEach((o, i) => { const a = t * 1.8 + i * 2.094; o.position.set(Math.cos(a) * .62, 1 + Math.sin(t * 3 + i) * .14, Math.sin(a) * .62); }); }}; },
  crypt(team){ const g = new THREE.Group(), st = M(0x6f778a, {r:.95}), dk = M(0x3b4152, {r:.9}), glow = M(0x7dffb0, {e:0x3dff8a, ei:1.5, keep:true});
    P(g, BOX(1.5, .16, 1.7), dk, [0, .08, 0]); P(g, BOX(1.3, 1.1, 1.5), st, [0, .7, 0]); P(g, CYL(.96, .96, 1.56, 3), dk, [0, 1.5, 0], [PI / 2, 0, PI / 2], [.55, 1, 1]);
    P(g, BOX(.56, .8, .06), M(0x11131a, {r:.9}), [0, .56, .76]); P(g, BOX(.36, .5, .02), glow, [0, .5, .79]); for (const sx of [-1, 1]) P(g, CYL(.09, .11, 1.1, 8), dk, [sx * .5, .7, .78]); ring(g, team, 1.0);
    return {g, h:2.1, anim(){}}; },
  flamespire(team){ const g = new THREE.Group(), ob = M(0x2a2233, {r:.5}), fire = M(0xff8a2b, {e:0xff5a00, ei:2, keep:true});
    P(g, CYL(.62, .78, .3, 8), M(0x4a4152, {r:.8}), [0, .15, 0]); P(g, CYL(.3, .52, 1.3, 6), ob, [0, .95, 0]); P(g, CYL(.2, .3, .9, 6), ob, [0, 2.05, 0]); ring(g, team, .82);
    for (let i = 0; i < 3; i++) P(g, CONE(.11, .5, 5), ob, [Math.cos(i * 2.094) * .34, 1.75, Math.sin(i * 2.094) * .34], [Math.sin(i * 2.094) * .5, 0, -Math.cos(i * 2.094) * .5]);
    const o = P(g, SPH(.26, 14, 10), fire, [0, 2.75, 0]);
    return {g, h:3.0, anim(t, s){ const k = 1 + Math.sin(t * 9) * .08 + (s.atk < .3 ? .3 : 0); o.scale.setScalar(k); }}; },
  stormcoil(team){ const g = new THREE.Group(), cu = M(0xc9853f, {m:.7, r:.35}), st = M(0x4a5266, {m:.5, r:.5}), glow = M(0xbfe8ff, {e:0x7fd0ff, ei:2, keep:true});
    P(g, CYL(.6, .72, .28, 16), st, [0, .14, 0]); P(g, CYL(.14, .2, 1.9, 10), st, [0, 1.2, 0]); for (let i = 0; i < 4; i++) P(g, TOR(.38 - i * .05, .055), cu, [0, .62 + i * .38, 0], [PI / 2, 0, 0]); ring(g, team, .78);
    const o = P(g, SPH(.26, 14, 10), glow, [0, 2.36, 0]);
    return {g, h:2.7, anim(t, s){ o.scale.setScalar(1 + Math.sin(t * 14) * .06 + (s.atk < .25 ? .45 * (1 - s.atk / .25) : 0)); }}; },
  barricade(team){ const g = new THREE.Group(), wood = M(0xa9773f, {r:.85}), dk = M(0x6e4a28, {r:.85});
    for (let i = 0; i < 5; i++){ const x = (i - 2) * .34, h = 1.15 + (i % 2) * .22; P(g, BOX(.3, h, .16), i % 2 ? wood : dk, [x, h / 2, 0]); P(g, CONE(.17, .3, 4), i % 2 ? wood : dk, [x, h + .14, 0], [0, PI / 4, 0]); }
    P(g, BOX(1.8, .12, .2), dk, [0, .4, .04]); P(g, BOX(1.8, .12, .2), dk, [0, .92, .04]); for (const sx of [-1, 1]) P(g, CYL(.05, .05, 1.2, 6), dk, [sx * .6, .5, -.34], [.6, 0, 0]);
    P(g, BOX(.5, .32, .03), M(TEAM[team], {r:.6}), [0, .66, .12]);
    return {g, h:1.6, anim(){}}; },
  shrine(team){ const g = new THREE.Group(), st = M(0xb9c2b0, {r:.9}), glow = M(0x8dff9a, {e:0x45ff7a, ei:1.6, keep:true}), leaf = M(0x4fae3c, {r:.7});
    P(g, CYL(.7, .82, .22, 12), st, [0, .11, 0]); P(g, CYL(.24, .3, 1.2, 8), st, [0, .82, 0]); P(g, CYL(.42, .26, .16, 8), st, [0, 1.5, 0]); ring(g, team, .86);
    const o = P(g, SPH(.3, 16, 12), glow, [0, 1.98, 0]); for (let i = 0; i < 5; i++) P(g, SPH(.16, 8, 6), leaf, [Math.cos(i * 1.257) * .44, .3, Math.sin(i * 1.257) * .44], null, [1.4, .5, 1]);
    return {g, h:2.5, anim(t){ o.position.y = 1.98 + Math.sin(t * 2) * .08; o.scale.setScalar(1 + Math.sin(t * 3) * .05); }}; },
  wardrum(team){ const g = new THREE.Group(), wood = M(0x8a5a30, {r:.8}), hide = M(0xe9d8b4, {r:.9}), red = M(TEAM[team], {r:.6});
    for (const sx of [-1, 1]) P(g, CYL(.06, .08, .9, 6), wood, [sx * .5, .4, 0], [0, 0, sx * .3]);
    const d = Gp(g, [0, .95, 0], [.5, 0, 0]); P(d, CYL(.62, .62, .6, 20), wood); P(d, CYL(.6, .6, .04, 20), hide, [0, .31, 0]); P(d, TOR(.62, .04), red, [0, .3, 0], [PI / 2, 0, 0]); P(d, TOR(.62, .04), red, [0, -.3, 0], [PI / 2, 0, 0]);
    for (const sx of [-1, 1]){ P(g, CYL(.03, .03, 1.9, 6), wood, [sx * .86, .95, -.2]); P(g, BOX(.36, .56, .03), red, [sx * .86, 1.58, -.2]); }
    return {g, h:2.1, anim(t){ const k = Math.abs(Math.sin(t * 5)); d.scale.setScalar(1 + k * .05); }}; },
  nest(team){ const g = new THREE.Group(), straw = M(0xc9a15a, {r:.95}), dk = M(0x8f6c33, {r:.95}), egg = M(0xdff3e4, {r:.5});
    P(g, TOR(.72, .26), straw, [0, .26, 0], [PI / 2, 0, 0]); P(g, TOR(.52, .2), dk, [0, .34, 0], [PI / 2, 0, 0]); P(g, CYL(.6, .7, .2, 16), dk, [0, .1, 0]); ring(g, team, 1.04);
    const eggs = [[-.2, .1], [.22, 0], [0, -.2]].map(([x, z], i) => P(g, SPH(.22, 12, 10), i === 1 ? M(0xbfe9c9, {r:.5}) : egg, [x, .56, z], [0, 0, (i - 1) * .3], [.82, 1.1, .82]));
    return {g, h:1.4, anim(t, s){ eggs.forEach((e, i) => { e.rotation.z = Math.sin(t * 6 + i * 2) * .1 * (i === 1 ? 2 : 1); }); }}; },

  /* props that stand for spell cards */
  arrows(){ const g = new THREE.Group(), wood = M(0xb9814a, {r:.7}), tip = M(0xcfd5e2, {m:.8, r:.3}), fl = M(0xe23b3b, {r:.7});
    for (const [x, z, rz] of [[0, 0, 0], [-.3, .1, .35], [.3, -.1, -.35], [-.14, -.2, .16], [.16, .2, -.18]]){ const a = Gp(g, [x, .9, z], [0, 0, rz]); P(a, CYL(.035, .035, 1.5, 6), wood); P(a, CONE(.09, .26, 6), tip, [0, -.86, 0], [PI, 0, 0]); for (const k of [0, 1.57]) P(a, BOX(.2, .3, .02), fl, [0, .62, 0], [0, k, 0]); }
    return {g, h:1.8, anim(){}}; },
  fireball(){ const g = new THREE.Group(); P(g, SPH(.5, 18, 14), M(0xff7a1f, {e:0xff4a00, ei:1.6, keep:true}), [0, .9, 0]); P(g, SPH(.34, 14, 10), M(0xffe27a, {e:0xffd23f, ei:2, keep:true}), [0, .9, 0]);
    for (let i = 0; i < 6; i++){ const a = i * 1.047; P(g, CONE(.2, .7, 6), M(0xff5a1f, {e:0xff3a00, ei:1.4, keep:true}), [Math.cos(a) * .42, 1.25 + (i % 2) * .16, Math.sin(a) * .42], [Math.sin(a) * .5, 0, -Math.cos(a) * .5]); }
    return {g, h:1.8, anim(){}}; },
  meteor(){ const g = new THREE.Group(); P(g, ROCK(.56), M(0x4a3b36, {r:.9}), [0, .8, 0]); for (const [x, y, z] of [[.3, 1.0, .2], [-.34, .7, .22], [.1, .6, -.4]]) P(g, ROCK(.16), M(0xff7a1f, {e:0xff4a00, ei:1.8, keep:true}), [x, y, z]);
    for (let i = 0; i < 5; i++) P(g, CONE(.24 - i * .03, .7, 6), M(i % 2 ? 0xffb03a : 0xff5a1f, {e:0xff4a00, ei:1.5, keep:true}), [-.3 - i * .16, 1.3 + i * .26, 0], [0, 0, .6]);
    return {g, h:2.3, anim(){}}; },
  zap(){ const g = new THREE.Group(); P(g, boltGeo(), M(0xfff27a, {e:0xffd23f, ei:1.8, keep:true, ds:true}), [0, .95, 0], null, 1.5); return {g, h:1.9, anim(){}}; },
  lightning(){ const g = new THREE.Group(), y = M(0xfff27a, {e:0xffd23f, ei:1.8, keep:true, ds:true});
    for (const [x, sc, rz] of [[0, 1.7, 0], [-.5, 1.1, .25], [.5, 1.2, -.22]]) P(g, boltGeo(), y, [x, .9 * sc / 1.4, 0], [0, 0, rz], sc);
    for (const [x, y2] of [[-.3, 2.05], [.2, 2.15], [.55, 1.95]]) P(g, SPH(.34, 12, 9), M(0x59627a, {r:.9}), [x, y2, 0]);
    return {g, h:2.5, anim(){}}; },
  freeze(){ const g = new THREE.Group(), ice = M(0x9fe6ff, {o:.86, r:.1, e:0x4fb8ff, ei:.4});
    for (const [x, z, h, r] of [[0, 0, 1.5, .28], [-.36, .1, .95, .2], [.34, -.06, 1.1, .22], [.1, .34, .7, .16], [-.14, -.32, .8, .17]]){ P(g, CYL(r, r, h, 6), ice, [x, h / 2, z]); P(g, CONE(r, r * 1.6, 6), ice, [x, h + r * .8, z]); }
    return {g, h:1.9, anim(){}}; },
  rage(){ const g = new THREE.Group(), bone = M(0xe9dcc0, {r:.7}), red = M(0xe23b3b, {e:0xff2a1a, ei:.5, keep:true});
    const h = Gp(g, [0, .9, 0], [0, 0, .5]); P(h, CONE(.3, 1.3, 14), bone, [0, 0, 0], [0, 0, PI]); P(h, TOR(.3, .05), M(0xf2c14e, {m:.8, r:.3}), [0, .64, 0], [PI / 2, 0, 0]); P(h, TOR(.14, .04), M(0xf2c14e, {m:.8, r:.3}), [0, -.2, 0], [PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) P(g, BOX(.06, .34, .06), red, [-.75 - i * .16, 1.5 + (i - 1) * .22, 0], [0, 0, 1.1 + (i - 1) * .4]);
    return {g, h:1.8, anim(){}}; },
  poison(){ const g = new THREE.Group(), gl = M(0xbfe8d0, {o:.55, r:.1}), gr = M(0x7dff5a, {e:0x45d82a, ei:1.2, keep:true});
    P(g, SPH(.46, 16, 12), gl, [0, .56, 0]); P(g, SPH(.38, 14, 10), gr, [0, .5, 0], null, [1, .8, 1]); P(g, CYL(.14, .14, .4, 10), gl, [0, 1.1, 0]); P(g, CYL(.17, .17, .1, 10), M(0x8a5a30, {r:.8}), [0, 1.34, 0]);
    for (const [x, y, r] of [[.5, 1.3, .16], [-.46, 1.5, .2], [.2, 1.8, .13]]) P(g, SPH(r, 10, 8), M(0x7dff5a, {o:.5}), [x, y, 0]);
    return {g, h:2.0, anim(){}}; },
  heal(){ const g = new THREE.Group(), gr = M(0x6dff9a, {e:0x2fff7a, ei:1.1, keep:true}); P(g, BOX(.34, 1.1, .3), gr, [0, 1, 0]); P(g, BOX(1.1, .34, .3), gr, [0, 1, 0]); P(g, TOR(.82, .05), M(0xffffff, {e:0xffffff, ei:.6, keep:true}), [0, 1, 0]);
    return {g, h:2.0, anim(){}}; },
  ward(team){ const g = new THREE.Group(), st = M(0xcfd5e2, {m:.7, r:.3}), bl = M(0x3d8bff, {e:0x2f7bff, ei:.5, keep:true});
    P(g, shieldGeo(), st, [0, 1, -.03], null, 1.12); P(g, shieldGeo(), bl, [0, 1, .03]); P(g, BOX(.12, .9, .06), M(0xf2c14e, {m:.8, r:.3}), [0, 1.02, .1]); P(g, BOX(.7, .12, .06), M(0xf2c14e, {m:.8, r:.3}), [0, 1.2, .1]);
    return {g, h:2.0, anim(){}}; },
  tornado(){ const g = new THREE.Group(); for (let i = 0; i < 6; i++) P(g, CYL(.24 + i * .13, .18 + i * .13, .28, 14, true), M(i % 2 ? 0xcfe0ee : 0x9fb6c9, {o:.8, ds:true, r:.6}), [Math.sin(i * 1.1) * .08, .2 + i * .3, Math.cos(i * 1.3) * .08]);
    return {g, h:2.1, anim(){}}; },
  graveyard(){ const g = new THREE.Group(), st = M(0x8d97ab, {r:.95}), dirt = M(0x5a4433, {r:1});
    P(g, SPH(.8, 14, 8), dirt, [0, 0, 0], null, [1.1, .22, .9]); for (const [x, z, h, ry] of [[0, -.1, 1.1, 0], [-.6, .16, .7, .3], [.62, .2, .8, -.25]]){ P(g, BOX(.44, h, .14), st, [x, h / 2, z], [0, ry, 0]); P(g, CYL(.22, .22, .14, 12), st, [x, h, z], [PI / 2, ry, 0]); }
    P(g, CAP(.05, .3), M(0xe9dcc0, {r:.7}), [.16, .34, .4], [0, 0, .5]); P(g, SPH(.1, 8, 6), M(0x7dffb0, {e:0x3dff8a, ei:1.6, keep:true}), [-.2, .3, .44]);
    return {g, h:1.6, anim(){}}; },
  quake(){ const g = new THREE.Group(), rk = M(0x8a7a66, {r:.95}), dk = M(0x5a4d40, {r:.95});
    for (const [x, z, r, y, rz] of [[0, 0, .5, .34, .3], [-.6, .2, .34, .22, -.4], [.62, -.1, .38, .26, .5], [.2, .5, .26, .16, .2], [-.3, -.5, .3, .18, -.2]]) P(g, ROCK(r), r > .36 ? rk : dk, [x, y, z], [rz, rz * 2, rz]);
    P(g, boltGeo(), M(0x2a221c, {ds:true, keep:true}), [0, .03, .1], [-PI / 2, 0, .4], 1.3);
    return {g, h:1.2, anim(){}}; },

  /* props used for trap cards, and for your own traps lying on the field */
  wetfloor(){ const g = new THREE.Group(), y = M(0xffd21f, {r:.45});
    P(g, CYL(.8, .8, .03, 28), M(0x59c8ff, {o:.7, r:.1}), [.06, .02, 0], null, [1, 1, .74]);                  // the puddle
    for (const s of [-1, 1]){ const leaf = Gp(g, [0, 0, s * .3], [-s * .27, 0, 0]); P(leaf, BOX(.62, 1.12, .05), y, [0, .56, 0]); P(leaf, PLN(.54, .94), M(0xffffff, {map:TX.wet(), r:.5}), [0, .56, s * .028], [0, s > 0 ? 0 : PI, 0]); }
    P(g, BOX(.66, .07, .16), M(0x15171c), [0, 1.09, 0]); return {g, h:1.3, anim(){}}; },
  screen(){ const g = new THREE.Group(), dk = M(0x1c2333, {r:.7}), wt = M(0xfbf8f2, {r:.6});                  // a blocking pad on a sprung base: run into it and find out
    P(g, CYL(.5, .58, .14, 20), dk, [0, .07, 0]); P(g, CYL(.1, .1, .34, 10), M(0xcfd5e2, {m:.8, r:.3}), [0, .28, 0]);
    P(g, CAP(.36, .62), M(0xe23b3b, {r:.6}), [0, 1.04, 0]); for (const yy of [.86, 1.22]) P(g, CYL(.368, .368, .1, 20), wt, [0, yy, 0]);
    for (const [x, yy, k] of [[-.66, 1.5, 1.5], [.64, 1.22, 1.1], [.5, 1.74, .8]]) P(g, starGeo(), M(0xffd95a, {e:0xffb300, ei:1.1, keep:true}), [x, yy, .16], [0, 0, x], k * 1.7);
    return {g, h:1.8, anim(){}}; },
  replay(){ const g = new THREE.Group(), dk = M(0x1c2333, {r:.5}), sil = M(0xcfd5e2, {m:.8, r:.3});            // a monitor stuck on rewind
    P(g, BOX(1.24, .84, .16), dk, [0, 1.02, 0]); for (const k of [1, -1]) P(g, PLN(1.08, .68), M(0xffffff, {map:TX.replay(), e:0xffffff, emap:TX.replay(), ei:.85, keep:true}), [0, 1.02, k * .085], [0, k > 0 ? 0 : PI, 0]);      // a screen on both faces: it spins once it is live
    P(g, CYL(.05, .05, .6, 8), sil, [0, .32, 0]); P(g, CYL(.34, .42, .06, 16), dk, [0, .03, 0]);
    for (const s of [-1, 1]) P(g, CYL(.016, .016, .52, 6), sil, [s * .2, 1.64, 0], [0, 0, -s * .5]);
    return {g, h:1.9, anim(){}}; },
  benched(){ const g = new THREE.Group(), wood = M(0xb9814a, {r:.7}), leg = M(0x4a5266, {m:.5, r:.4});          // the bench, and the arrow pointing you back to it
    P(g, BOX(1.3, .1, .42), wood, [0, .5, 0]); P(g, BOX(1.3, .3, .08), wood, [0, .88, -.2], [-.12, 0, 0]);
    for (const s of [-1, 1]){ P(g, BOX(.08, .5, .4), leg, [s * .52, .25, 0]); P(g, BOX(.07, .5, .07), leg, [s * .52, .74, -.2]); }
    P(g, uturnGeo(), M(0xff5a4a, {e:0xff2a1a, ei:.45, keep:true}), [0, 1.62, 0]); return {g, h:2.1, anim(){}}; },
  techfoul(){ const g = new THREE.Group(), red = M(0xe23b3b, {e:0xff2a1a, ei:.3, keep:true}), sil = M(0xcfd5e2, {m:.8, r:.25});   // a big red T on a podium in referee stripes, whistle at the ready
    P(g, CYL(.5, .5, .5, 24), M(0xffffff, {map:TX.stripes(), r:.6}), [0, .25, 0]); P(g, CYL(.55, .55, .06, 24), M(0x15171c), [0, .52, 0]);
    P(g, BOX(.2, .8, .2), red, [0, .95, 0]); P(g, BOX(.8, .22, .2), red, [0, 1.42, 0]);
    P(g, SPH(.17, 14, 10), sil, [.5, .74, .3]); P(g, BOX(.26, .1, .14), sil, [.69, .82, .3]); P(g, TOR(.07, .02), sil, [.38, .9, .3]);
    return {g, h:1.6, anim(){}}; }
};
MK.princess = princess; MK.king = king;

/* a stand-in for a character whose file has not arrived: the right size and team colour, so the match can go on */
function standin(team, U){
  const sc = clamp((U.r || .4) / .4, .6, 2.2), R = human({s:sc, top:TEAM[team], bottom:0x2a3142, headR:.25}); eyes(R.head, R.hr);
  return out(R, walker(R, {swing:'chop'}), {fly:U.fly ? 1.5 : 0});
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* the cardboard big-head for Five-Star BDB, worn on the rigged model's head */
function bigHead(){
  const hd = new THREE.Group();
  P(hd, CYL(.62, .62, .06, 40), [M(0xffffff, {keep:true}), M(0xffffff, {map:TX.face(), keep:true}), M(0xf2c14e, {keep:true})], null, [PI / 2, PI / 2, 0]);
  P(hd, TOR(.62, .04), M(0xf2c14e, {keep:true}));
  for (let i = 0; i < 5; i++){ const a = (i - 2) * .42; P(hd, starGeo(), M(0xffd95a, {e:0xffb300, ei:1.1, keep:true}), [Math.sin(a) * .95, Math.cos(a) * .95, 0], [0, 0, -a], 1.3); }
  return hd;
}
export function makeModel(key, team = 0, o){
  const U = UNITS[key];
  if (hasRig(key)){
    const A = o && o.aff && AFF[o.aff], m = makeRig(key, {tint:A && A.tint != null ? A.tint : null, ink:!!(o && o.ink), fly:!!(U && U.fly)}, GRAD, {bighead:bigHead});
    m.s = A ? A.size : 1; m.h *= m.s; return m;
  }
  const f = MK[key] || (U && U.twr ? null : U ? () => standin(team, U) : null);
  if (!f){ const g = new THREE.Group(); P(g, BOX(.5, .8, .5), M(0xff00ff), [0, .4, 0]); return {g, h:1, anim(){}}; }
  const A = o && o.aff && AFF[o.aff];
  TINT = A && A.tint != null ? A.tint : null;
  let m; try { m = f(team, o); } finally { TINT = null; }
  m.s = A ? A.size : 1; m.h *= m.s;
  return m;
}
export const hasModel = k => !!MK[k] || hasRig(k);

const INK = new THREE.MeshBasicMaterial({color:0x160d07, side:THREE.BackSide});
export function outline(g, k = 1.085){
  if (g.userData.inked) return;                 // rigged characters bring their own
  const ms = [];
  g.traverse(o => { if (o.isMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && !o.material.transparent && o.material.side !== THREE.DoubleSide && o.geometry.type !== 'PlaneGeometry' && o.geometry.type !== 'ShapeGeometry' && o.geometry.type !== 'TorusGeometry') ms.push(o); });
  for (const o of ms){ const h = new THREE.Mesh(o.geometry, INK); h.scale.setScalar(k); h.layers.set(1); o.add(h); }
}
