/* Break Room Brawl: every character, building and prop, built from three.js primitives (no model files to download).
   makeModel(key, team, opts) -> {g, h, fly, turret, anim(t, s)}.  Models face +z.
   s = {mv, ph, atk, chg, aim}: moving, walk phase, seconds since the last attack, charging, turret yaw. */
import * as THREE from 'three';
import { AFF } from './cards.js';
import { loadRigs, hasRig, makeRig } from './rigs.js?v=1114e';

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

const GRAD = (() => { const t = new THREE.DataTexture(new Uint8Array([105, 105, 105, 255, 180, 180, 180, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
let TINT = null; const _tc = new THREE.Color(), _tt = new THREE.Color();
export function M(color, o = {}){
  if (TINT != null && !o.keep) color = _tc.set(color).lerp(_tt.set(TINT), .46).getHex();     // a card style recolours the whole character
  const k = color + '|' + (o.r ?? '') + '|' + (o.m ?? '') + '|' + (o.e ?? '') + '|' + (o.ei ?? '') + '|' + (o.o ?? '') + '|' + (o.flat ? 1 : 0) + '|' + (o.ds ? 1 : 0) + '|' + (o.map ? o.map.uuid : '') + '|' + (o.emap ? o.emap.uuid : '');
  let m = MC.get(k);
  if (!m){
    m = new THREE.MeshToonMaterial({color, gradientMap:GRAD, emissive:o.e ?? 0, emissiveIntensity:o.ei ?? 1, transparent:o.o != null, opacity:o.o ?? 1,
      side:o.ds ? THREE.DoubleSide : THREE.FrontSide, map:o.map || null, emissiveMap:o.emap || null, depthWrite:o.o == null || o.o > .6});
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
export const preload = () => Promise.all([new Promise(res => { faceDone = res; TX.face(); setTimeout(res, 4000); }), Promise.race([loadRigs(), new Promise(res => setTimeout(res, 25000))])]);
export const TX = {
  face(){ if (!TC.face){ TC.face = new THREE.TextureLoader().load('../assets/face.jpg', () => { faceDone && faceDone(); }, undefined, () => { faceDone && faceDone(); }); TC.face.colorSpace = THREE.SRGBColorSpace; TC.face.anisotropy = 4; } return TC.face; },
  ball: () => ctex('ball', 256, 128, (x, w, h) => { x.fillStyle = '#e8792a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#3a1a06'; x.lineWidth = 5;
    for (const u of [0, .25, .5, .75, 1]){ x.beginPath(); x.moveTo(u * w, 0); x.lineTo(u * w, h); x.stroke(); } x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke(); }),
  stripes: () => ctex('stripes', 128, 32, (x, w, h) => { for (let i = 0; i < 8; i++){ x.fillStyle = i % 2 ? '#15171c' : '#f6f6f2'; x.fillRect(i * w / 8, 0, w / 8, h); } }),
  brick: () => ctex('brick', 256, 256, (x, w, h) => { x.fillStyle = '#aab4c8'; x.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 5; c++){ const o = r % 2 ? 26 : 0, v = 150 + ((r * 7 + c * 13) % 5) * 9; x.fillStyle = `rgb(${v},${v + 8},${v + 26})`; x.fillRect(c * 52 - o + 2, r * 32 + 2, 48, 28); if (c === 4 && o) x.fillRect(c * 52 + 26 + 2, r * 32 + 2, 48, 28); } }, [3, 1.4]),
  snacks: () => ctex('snacks', 128, 192, (x, w, h) => { x.fillStyle = '#0c1326'; x.fillRect(0, 0, w, h); const cs = ['#ff8a2b', '#f2c14e', '#4ade80', '#ff5a8a', '#4fb3ff', '#c77dff'];
    for (let r = 0; r < 5; r++){ x.fillStyle = '#26324f'; x.fillRect(4, r * 36 + 32, w - 8, 4); for (let c = 0; c < 4; c++){ x.fillStyle = cs[(r * 3 + c * 5) % 6]; x.fillRect(10 + c * 29, r * 36 + 8, 20, 24); x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(12 + c * 29, r * 36 + 12, 16, 5); } } }),
  digits: () => ctex('digits', 128, 64, (x, w, h) => { x.fillStyle = '#12060a'; x.fillRect(0, 0, w, h); x.fillStyle = '#ff3a2a'; x.font = '700 56px "Arial Narrow", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = '#ff3a2a'; x.shadowBlur = 10; x.fillText('00', w / 2, h / 2 + 3); }),
  clock: () => ctex('clock', 128, 128, (x, w) => { const c = w / 2; x.fillStyle = '#fbf8f2'; x.beginPath(); x.arc(c, c, c, 0, 7); x.fill(); x.strokeStyle = '#151a26'; x.lineWidth = 5; x.lineCap = 'round';
    for (let i = 0; i < 12; i++){ const a = i / 12 * 6.283; x.beginPath(); x.moveTo(c + Math.cos(a) * 50, c + Math.sin(a) * 50); x.lineTo(c + Math.cos(a) * 58, c + Math.sin(a) * 58); x.stroke(); }
    x.lineWidth = 7; x.beginPath(); x.moveTo(c, c); x.lineTo(c, c - 40); x.stroke(); x.beginPath(); x.moveTo(c, c); x.lineTo(c + 26, c + 12); x.stroke(); }),
  crest: () => ctex('crest', 128, 128, (x, w) => { x.fillStyle = '#12306b'; x.fillRect(0, 0, w, w); x.fillStyle = '#f2c14e'; x.beginPath();
    for (let i = 0; i < 10; i++){ const a = i / 10 * 6.283 - PI / 2, r = i % 2 ? 22 : 50; x.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r); } x.fill(); })
};
const ballMat = () => M(0xffffff, {map:TX.ball(), r:.8});
export const basketball = r => { const b = new THREE.Mesh(SPH(r, 16, 12), ballMat()); b.castShadow = true; return b; };
function starGeo(){ return geo('star', () => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++){ const a = i / 10 * PI * 2 + PI / 2, r = i % 2 ? .05 : .12; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } return new THREE.ExtrudeGeometry(s, {depth:.04, bevelEnabled:false}); }); }
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

/* ---------- the roster ---------- */
const MK = {
  princess, king,
  skel(){
    const R = human({s:.64, skin:0xf3f0e6, top:0xf3f0e6, bottom:0xe4e0d2, shoe:0xd9d4c3, thin:.7, bulk:.78, headR:.27});
    eyes(R.head, R.hr, {r:.068}); P(R.head, BOX(.2, .08, .1), M(0xe4e0d2), [0, -.21, .14]); cap(R.head, R.hr, 0x1b2a55);
    for (let i = 0; i < 3; i++) P(R.body, BOX(.3, .025, .2), M(0xcfc9b8), [0, .5 + i * .08, .02]);
    const b = Gp(R.armR.hand, [0, 0, .12], [PI / 2, 0, 0]); P(b, CYL(.03, .03, .34, 6), M(0xf3f0e6)); P(b, SPH(.055, 8, 6), M(0xf3f0e6), [0, .17, 0]); P(b, SPH(.055, 8, 6), M(0xf3f0e6), [0, -.17, 0]);
    return out(R, walker(R));
  },
  bench(team){
    const R = human({s:.98, top:TEAM[team], bottom:0x20242e, bulk:1.22, skin:0xd9a47c});
    eyes(R.head, R.hr); band(R.head, R.hr, 0xffffff); P(R.torso, BOX(.2, .16, .02), M(0xffffff), [0, .04, .2]);
    P(R.body, TOR(.2, .05, PI), M(0xfafafa), [.06, .76, 0], [0, PI / 2, .2]);                                       // towel
    const c = Gp(R.armR.hand, [0, -.04, .16], [-.5, 0, 0]), steel = M(0x9aa3b5, {m:.7, r:.35});
    P(c, BOX(.36, .03, .32), M(0x2a3350), [0, 0, 0]); P(c, BOX(.36, .32, .03), M(0x2a3350), [0, .2, -.16]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(c, CYL(.015, .015, .34, 6), steel, [sx * .16, -.17, sz * .14]);
    return out(R, walker(R));
  },
  shooter(team){
    const R = human({s:.8, top:TEAM[team], bottom:0xf4f4f4, bare:true, skin:0x9a6a48, shoe:0xff8a2b});
    eyes(R.head, R.hr); band(R.head, R.hr, TEAM[team]);
    const b = basketball(.13); b.position.set(0, -.06, .12); R.armR.hand.add(b);
    return out(R, walker(R, {swing:'throw', carry:[-.9, -.9], extra(t, s, a){ b.visible = a < 0 || a > .7; }}));
  },
  gob(){
    const R = human({s:.64, skin:0x6fbf4a, top:0x7a4a2a, bottom:0x3c2a1c, shoe:0x3c2a1c, headR:.3, bare:true, bulk:.9});
    eyes(R.head, R.hr, {white:true, r:.03}); P(R.head, CONE(.05, .16, 8), M(0x5aa33a), [0, -.04, .32], [PI / 2, 0, 0]);
    for (const sx of [-1, 1]) P(R.head, CONE(.09, .3, 8), M(0x6fbf4a), [sx * .34, .08, 0], [0, 0, -sx * 1.25]);
    const bag = Gp(R.armR.hand, [0, -.02, .1]); P(bag, BOX(.2, .26, .08), M(0xf2c14e, {r:.35})); P(bag, BOX(.21, .08, .085), M(0xe0362c, {r:.35}));
    return out(R, walker(R));
  },
  bat(){
    const g = new THREE.Group(), b = Gp(g), dark = M(0x3b2a63, {r:.5}), mem = M(0x5a3f96, {r:.5, ds:true});
    P(b, SPH(.2, 14, 10), dark, null, null, [1, 1.1, 1]);
    for (const sx of [-1, 1]){ P(b, CONE(.06, .16, 6), dark, [sx * .1, .24, 0]); P(b, SPH(.04, 8, 6), M(0xffe14d, {e:0xffc400, ei:1.5}), [sx * .08, .05, .17]); P(b, CONE(.016, .05, 5), M(0xffffff), [sx * .04, -.07, .17], [PI, 0, 0]); }
    const wl = Gp(b, [-.14, .02, 0]), wr = Gp(b, [.14, .02, 0]);
    P(wl, wingGeo('b', .52), mem, null, [0, PI, 0]); P(wr, wingGeo('b', .52), mem);
    return {g, h:.7, fly:1.5, anim(t, s){ const f = Math.sin(t * 22 + g.id) * .8; wl.rotation.z = -f; wr.rotation.z = f; b.position.y = Math.sin(t * 5 + g.id) * .08; }};
  },
  slime(team, o = {}){
    const sc = o.small ? .62 : 1, g = new THREE.Group(), b = Gp(g); b.scale.setScalar(sc);
    P(b, SPH(.56, 22, 16), M(0x3fd0b8, {o:.8, r:.12}), [0, .42, 0], null, [1, .78, 1]);
    P(b, SPH(.3, 14, 10), M(0x1f8f86, {r:.3}), [0, .34, 0]);
    for (const sx of [-1, 1]){ P(b, SPH(.1, 10, 8), M(0xffffff, {r:.2}), [sx * .2, .52, .44]); P(b, SPH(.05, 8, 6), M(0x15171c), [sx * .2, .52, .53]); }
    for (let i = 0; i < 9; i++){ const a = i / 9 * PI * 2; P(b, CYL(.035, .03, .34, 5), M(0xe9e4d6, {r:.9}), [Math.cos(a) * .2, .78, Math.sin(a) * .2], [Math.sin(a) * .9, 0, -Math.cos(a) * .9]); }
    if (!o.small) P(b, CYL(.035, .035, .9, 6), M(0xb9864a), [.12, 1.1, -.1], [-.35, 0, -.3]);
    return {g, h:1.25 * sc + (o.small ? 0 : .4), anim(t, s){ const q = s.mv ? Math.sin(s.ph) * .14 : Math.sin(t * 2) * .03, k = s.atk < .3 ? Math.sin(s.atk / .3 * PI) * .3 : 0; b.scale.set(sc * (1 - q + k), sc * (1 + q - k * .5), sc * (1 - q + k)); }};
  },
  slimelet(team){ return MK.slime(team, {small:true}); },
  hoop(team){
    const g = new THREE.Group(), steel = M(0x39425a, {m:.5, r:.4});
    P(g, CYL(.78, .86, .3, 20), steel, [0, .15, 0]); P(g, CYL(.8, .8, .1, 20), M(TEAM[team]), [0, .34, 0]);
    const t = Gp(g, [0, .4, 0]);
    P(t, CYL(.08, .1, 1.5, 10), steel, [0, .75, -.3]);
    P(t, BOX(1.1, .74, .06), M(0xf6f7fb, {r:.4}), [0, 1.56, -.24]); P(t, BOX(.44, .32, .07), M(0xff8a2b), [0, 1.42, -.235]); P(t, BOX(.34, .22, .075), M(0xf6f7fb), [0, 1.42, -.232]);
    P(t, TOR(.2, .025), M(0xff5a1f), [0, 1.3, .0], [PI / 2, 0, 0]); P(t, CYL(.2, .12, .26, 12, true), M(0xffffff, {o:.55, ds:true}), [0, 1.16, 0]);
    const br = Gp(t, [0, .55, 0]); P(br, CYL(.16, .2, .8, 12), M(0x222836, {m:.6, r:.35}), [0, 0, .3], [PI / 2, 0, 0]); P(br, SPH(.24, 12, 10), steel);
    return {g, h:2.5, turret:t, anim(tm, s){ t.rotation.y = s.aim || 0; br.position.z = s.atk < .2 ? -.16 * (1 - s.atk / .2) : 0; }};
  },
  mascot(team){
    const g = new THREE.Group(), b = Gp(g), fur = M(0xa8713c, {r:.95}), lite = M(0xe3c08e, {r:.95});
    P(b, SPH(.62, 20, 14), fur, [0, .78, 0], null, [1, 1.05, .92]); P(b, SPH(.44, 16, 12), lite, [0, .72, .26]);
    P(b, CYL(.63, .6, .42, 20), M(TEAM[team], {r:.6}), [0, .98, 0], null, [1, 1, .93]);
    const hd = Gp(b, [0, 1.62, .04]); P(hd, SPH(.5, 20, 14), fur);
    for (const sx of [-1, 1]){ P(hd, SPH(.17, 12, 8), fur, [sx * .38, .36, 0]); P(hd, SPH(.09, 10, 8), lite, [sx * .38, .36, .1]); P(hd, SPH(.1, 10, 8), M(0xffffff, {r:.2}), [sx * .18, .1, .42]); P(hd, SPH(.05, 8, 6), M(0x15171c), [sx * .18, .1, .51]); }
    P(hd, SPH(.2, 12, 10), lite, [0, -.1, .4]); P(hd, SPH(.07, 8, 6), M(0x2b1a10), [0, -.04, .58]); P(hd, TOR(.1, .02, PI), M(0x2b1a10), [0, -.12, .56], [0, 0, PI]);
    const arm = sx => { const a = Gp(b, [sx * .62, 1.1, 0]); P(a, CAP(.15, .3), fur, [0, -.26, 0]); P(a, SPH(.18, 10, 8), lite, [0, -.52, 0]); return a; }, aL = arm(-1), aR = arm(1);
    const lg = sx => { const l = Gp(b, [sx * .28, .3, 0]); P(l, CAP(.17, .12), fur, [0, -.1, 0]); P(l, SPH(.2, 10, 8), lite, [0, -.24, .08], null, [1, .6, 1.3]); return l; }, lL = lg(-1), lR = lg(1);
    b.scale.setScalar(1.12);
    return {g, h:2.6, anim(t, s){ const w = s.mv ? Math.sin(s.ph) : 0, a = s.atk < .4 ? s.atk / .4 : -1;
      lL.rotation.x = w * .7; lR.rotation.x = -w * .7; b.rotation.z = w * .07; aL.rotation.z = -.5 - Math.sin(t * 3) * .15; aR.rotation.z = .5 + Math.sin(t * 3) * .15;
      aL.rotation.x = aR.rotation.x = a >= 0 ? -2.6 + a * 3 : -w * .4; hd.rotation.z = Math.sin(t * 1.8) * .07; }};
  },
  barista(){
    const R = human({s:.9, robe:true, top:0x2f6b4f, skin:0xe9c29d, bulk:1.05});
    P(R.body, BOX(.3, .5, .03), M(0xf3ead6), [0, .42, .2], [-.26, 0, 0]);
    eyes(R.head, R.hr); wizHat(R.head, R.hr, 0x6b4426, 0xf3ead6);
    P(R.head, SPH(.13, 10, 8), M(0xf1f1f1, {r:.9}), [0, -.17, .16], null, [1.3, 1, .8]);
    const pot = Gp(R.armR.hand, [0, -.02, .12]); P(pot, CYL(.1, .13, .24, 12), M(0x2a1a12, {r:.15, o:.85})); P(pot, CYL(.105, .105, .04, 12), M(0xe0362c), [0, .13, 0]); P(pot, TOR(.08, .02, PI), M(0x15171c), [.12, 0, 0], [0, 0, -PI / 2]);
    return out(R, walker(R, {swing:'throw'}));
  },
  golem(){
    const g = new THREE.Group(), b = Gp(g), st = M(0x8b93a6, {flat:true, r:.95}), dk = M(0x636b7e, {flat:true, r:.95}), glow = M(0xff8a2b, {e:0xff6a00, ei:2.2});
    P(b, ROCK(.7), st, [0, 1.15, 0], [.3, .4, 0], [1.15, 1, .9]);
    for (const sx of [-1, 1]) P(b, ROCK(.42), dk, [sx * .82, 1.55, 0], [sx, .3, .5]);
    const hd = Gp(b, [0, 1.95, .12]); P(hd, ROCK(.34), dk, null, [.2, .7, .1]); for (const sx of [-1, 1]) P(hd, SPH(.065, 8, 6), glow, [sx * .13, .02, .27]);
    P(b, BOX(.06, .5, .04), glow, [.1, 1.2, .62], [0, 0, .5]); P(b, BOX(.05, .32, .04), glow, [-.18, 1.0, .6], [0, 0, -.7]);
    const arm = sx => { const a = Gp(b, [sx * .92, 1.5, 0]); P(a, ROCK(.3), st, [0, -.45, 0], [sx, 0, 0], [.9, 1.5, .9]); P(a, ROCK(.36), dk, [0, -1.0, .05], [0, sx, .4]); return a; }, aL = arm(-1), aR = arm(1);
    const lg = sx => { const l = Gp(b, [sx * .36, .6, 0]); P(l, ROCK(.36), dk, [0, -.3, 0], [0, sx * .5, 0], [1, 1.25, 1]); return l; }, lL = lg(-1), lR = lg(1);
    b.scale.setScalar(1.12);
    return {g, h:2.9, anim(t, s){ const w = s.mv ? Math.sin(s.ph) : 0, a = s.atk < .5 ? s.atk / .5 : -1;
      lL.rotation.x = w * .5; lR.rotation.x = -w * .5; b.rotation.z = w * .06; b.position.y = Math.abs(w) * .05;
      aL.rotation.x = a >= 0 ? -2.4 + a * 2.7 : -w * .4; aR.rotation.x = a >= 0 ? -2.4 + a * 2.7 : w * .4; }};
  },
  ref(){
    const R = human({s:.9, topMat:M(0xffffff, {map:TX.stripes()}), bottom:0x15171c, shoe:0x15171c, skin:0xc68d68});
    eyes(R.head, R.hr); cap(R.head, R.hr, 0x15171c); P(R.head, SPH(.04, 8, 6), M(0xcfd5e2, {m:.8, r:.2}), [0, -.1, .25]);
    const f = Gp(R.armR.hand, [0, 0, .08]); P(f, BOX(.2, .2, .02), M(0xffd21f)); P(f, SPH(.04, 6, 6), M(0xffd21f), [0, -.12, 0]);
    return out(R, walker(R, {swing:'throw', extra(t, s, a){ f.visible = a < 0 || a > .7; }}));
  },
  vending(team){
    const g = new THREE.Group(), b = Gp(g);
    P(b, BOX(1.1, 1.9, .86), M(TEAM[team], {r:.45}), [0, .95, 0]); P(b, BOX(1.16, .12, .92), M(0x1a2038), [0, .06, 0]); P(b, BOX(1.16, .1, .92), M(0x1a2038), [0, 1.9, 0]);
    P(b, new THREE.PlaneGeometry(.66, 1.3), M(0xffffff, {map:TX.snacks(), emap:TX.snacks(), e:0xffffff, ei:.55, r:.2}), [-.14, 1.12, .435]);
    P(b, BOX(.2, .5, .02), M(0x10162a), [.38, 1.3, .435]); P(b, BOX(.1, .03, .03), M(0xf2c14e, {e:0xf2c14e, ei:1}), [.38, 1.42, .45]);
    P(b, BOX(.7, .2, .03), M(0x10162a), [-.14, .28, .435]); P(b, BOX(1.0, .16, .02), M(0xffffff, {e:0xffffff, ei:.9}), [0, 1.74, .44]);
    return {g, h:2.3, anim(t, s){ const k = s.sum < .4 ? Math.sin(s.sum * 50) * .05 * (1 - s.sum / .4) : 0; b.rotation.z = k; b.position.y = Math.abs(k) * 1.5; }};
  },
  trainer(){
    const R = human({s:.86, top:0xfafafa, bottom:0x2aa876, skin:0xf0c9a4, shoe:0x2aa876});
    eyes(R.head, R.hr); P(R.head, HALF(R.hr * 1.05), M(0x6b3f22, {r:.9}), [0, .03, -.02]); P(R.head, SPH(.1, 10, 8), M(0x6b3f22, {r:.9}), [0, .08, -.28]); P(R.head, CONE(.07, .26, 8), M(0x6b3f22, {r:.9}), [0, -.08, -.34], [-.5, 0, 0]);
    P(R.head, BOX(.34, .025, .2), M(0x2aa876), [0, .1, .24]); P(R.body, TOR(.19, .045), M(0x2aa876), [0, .76, 0], [PI / 2, 0, 0]);
    const w = Gp(R.armR.hand, [0, -.02, .1]); P(w, CYL(.055, .055, .24, 10), M(0x8fd8ff, {o:.8, r:.1})); P(w, CYL(.035, .045, .06, 10), M(0xffffff), [0, .15, 0]);
    return out(R, walker(R, {swing:'throw'}));
  },
  fast(){
    const R = human({s:1.0, top:0xf2c14e, bottom:0x1b2440, bare:true, skin:0x7a5238, shoe:0xff3d7f, thin:1.05});
    eyes(R.head, R.hr); band(R.head, R.hr, 0xff3d7f); P(R.torso, BOX(.16, .14, .02), M(0x1b2440), [0, .04, .2]);
    for (const l of [R.legL, R.legR]) P(l, BOX(.17, .05, .29), M(0xffffff), [0, -.345, .04]);
    const b = basketball(.14); b.position.set(0, -.08, .1); R.armL.hand.add(b);
    return out(R, walker(R, {lean:.16}));
  },
  dragon(){
    const g = new THREE.Group(), b = Gp(g), red = M(0xd8452e, {r:.5}), belly = M(0xf4b860, {r:.6}), dk = M(0x8e2318, {r:.5, ds:true});
    P(b, SPH(.5, 20, 14), red, null, null, [.92, .82, 1.35]); P(b, SPH(.4, 16, 12), belly, [0, -.12, .08], null, [.85, .7, 1.25]);
    const nk = Gp(b, [0, .22, .52], [-.7, 0, 0]); P(nk, CYL(.17, .24, .5, 12), red, [0, .22, 0]);
    const hd = Gp(nk, [0, .56, 0], [.9, 0, 0]); P(hd, SPH(.26, 16, 12), red, null, null, [1, .9, 1.15]); P(hd, SPH(.17, 12, 10), red, [0, -.05, .28], null, [1, .7, 1.2]);
    const jaw = P(hd, BOX(.24, .05, .3), dk, [0, -.17, .25]);
    for (const sx of [-1, 1]){ P(hd, SPH(.055, 8, 6), M(0xffe14d, {e:0xffc400, ei:1.6}), [sx * .14, .1, .18]); P(hd, CONE(.05, .26, 8), M(0xf3ead6), [sx * .13, .25, -.1], [-.7, 0, sx * -.25]); P(hd, SPH(.025, 6, 6), M(0x2b0d08), [sx * .06, -.02, .47]); }
    for (let i = 0; i < 5; i++) P(b, CONE(.06, .18, 6), belly, [0, .42 - i * .03, .3 - i * .22], [-.3, 0, 0]);
    const wl = Gp(b, [-.3, .2, .05]), wr = Gp(b, [.3, .2, .05]); P(wl, wingGeo('d', 1.25), dk, null, [-PI / 2 + .25, PI, 0]); P(wr, wingGeo('d', 1.25), dk, null, [-PI / 2 + .25, 0, 0]);
    const tail = []; let par = Gp(b, [0, 0, -.6]);
    for (let i = 0; i < 5; i++){ const sg = Gp(par, [0, 0, i ? -.24 : 0]); P(sg, SPH(.2 - i * .034, 10, 8), red, null, null, [1, 1, 1.4]); tail.push(sg); par = sg; }
    P(par, CONE(.1, .24, 4), belly, [0, 0, -.2], [-PI / 2, 0, 0]);
    for (const sx of [-1, 1]) P(b, CAP(.08, .12), red, [sx * .26, -.36, .2], [.4, 0, 0]);
    return {g, h:1.4, fly:2.0, anim(t, s){ const f = Math.sin(t * 9); wl.rotation.z = -f * .65 - .1; wr.rotation.z = f * .65 + .1; b.position.y = Math.sin(t * 9 + 1.6) * .1;
      tail.forEach((sg, i) => { sg.rotation.y = Math.sin(t * 4 - i * .7) * .22; }); const a = s.atk < .4 ? Math.sin(s.atk / .4 * PI) : 0; jaw.rotation.x = a * .6; nk.rotation.x = -.7 + a * .35; }};
  },
  ghost(){
    const g = new THREE.Group(), b = Gp(g), wh = M(0xf3f6ff, {o:.8, r:.3, e:0x8fb4ff, ei:.25, ds:true});
    const pts = [[0, 1.0], [.2, .96], [.33, .8], [.38, .55], [.4, .28], [.46, .08], [.38, 0], [.3, .1]].map(p => new THREE.Vector2(p[0], p[1]));
    P(b, geo('ghost', () => new THREE.LatheGeometry(pts, 20)), wh);
    for (const sx of [-1, 1]){ P(b, SPH(.07, 10, 8), M(0x10131c), [sx * .13, .74, .3], null, [1, 1.35, .6]); const a = P(b, SPH(.11, 10, 8), wh, [sx * .42, .5, .08], null, [1, .8, .8]); a.userData.sx = sx; }
    P(b, SPH(.05, 8, 6), M(0x10131c), [0, .6, .35], null, [1.2, .8, .5]);
    P(b, TOR(.3, .018), M(0xff8a2b), [0, .5, 0], [PI / 2 - .35, 0, 0]); P(b, BOX(.16, .22, .02), M(0xffffff, {r:.4}), [0, .28, .36], [-.2, 0, 0]); P(b, BOX(.1, .03, .025), M(0x2a5bd7), [0, .33, .37], [-.2, 0, 0]);
    return {g, h:1.3, fly:1.0, anim(t, s){ b.position.y = Math.sin(t * 2.6 + g.id) * .12; b.rotation.z = Math.sin(t * 1.7) * .08; b.rotation.x = (s.mv ? .18 : 0) + (s.atk < .3 ? Math.sin(s.atk / .3 * PI) * .5 : 0); }};
  },
  buzzer(){
    const R = human({s:1.34, skin:0xe9e5d8, top:0x3a4259, bottom:0x23283a, shoe:0x15171c, bulk:1.3, bare:true, headR:.27});
    eyes(R.head, R.hr, {r:.07}); P(R.head, BOX(.22, .08, .1), M(0xd6d1c0), [0, -.22, .14]);
    const c = Gp(R.body, [0, 1.62, .05]), led = M(0xffffff, {map:TX.digits(), emap:TX.digits(), e:0xffffff, ei:1.2});
    P(c, BOX(.8, .5, .3), M(0x15171c, {r:.4})); P(c, new THREE.PlaneGeometry(.64, .34), led, [0, 0, .155]); P(c, BOX(.84, .06, .34), M(0xff3a2a, {e:0xff2a1a, ei:1.3}), [0, .28, 0]);
    return out(R, walker(R, {carry:[-2.95, -2.95], swing:'none', extra(t, s, a){ c.position.y = 1.62 + (a >= 0 ? -Math.sin(a * PI) * .5 : 0); c.rotation.x = a >= 0 ? Math.sin(a * PI) * .7 : 0; led.emissiveIntensity = .9 + Math.sin(t * 9) * .5; }}), {h:2.75});
  },
  witch(){
    const R = human({s:.92, robe:true, top:0x5b2a86, skin:0xb7dba0, bulk:1});
    eyes(R.head, R.hr, {col:0x1b0b2a}); wizHat(R.head, R.hr, 0x2a1440, 0xf2c14e); P(R.head, CONE(.04, .14, 6), M(0xa6cc8e), [0, -.03, .27], [PI / 2, 0, 0]);
    P(R.head, HALF(R.hr * 1.08), M(0x2fbf71, {r:.9}), [0, -.02, -.05], [.5, 0, 0]);
    const st = Gp(R.armR.hand, [0, .2, .06]); P(st, CYL(.03, .035, 1.2, 6), M(0x6b4426)); const orb = P(st, SPH(.11, 12, 10), M(0x6dff9a, {e:0x2fff7a, ei:2}), [0, .68, 0]);
    return out(R, walker(R, {swing:'cast', carry:[0, -.5], extra(t){ orb.scale.setScalar(1 + Math.sin(t * 6) * .12); }}));
  },
  fivestar(){
    const R = human({s:1.5, top:0x2a5bd7, bottom:0x1b2440, skin:0xe0b08c, shoe:0xffffff, bulk:1.2, noHead:true, headR:.42});
    for (const a of [R.armL, R.armR]) P(a, BOX(.03, .34, .15), M(0xffffff), [a === R.armL ? -.07 : .07, -.15, 0]);
    P(R.torso, BOX(.03, .4, .02), M(0xffffff), [0, 0, .205]); P(R.body, TOR(.17, .05), M(0x2a5bd7), [0, .78, 0], [PI / 2, 0, 0]);
    // the big-head cutout
    const hd = Gp(R.head, [0, .16, 0]);
    P(hd, CYL(.56, .56, .05, 40), [M(0xffffff, {r:.5}), M(0xffffff, {map:TX.face(), r:.6, keep:true}), M(0xf2c14e, {r:.4, m:.5})], null, [PI / 2, PI / 2, 0]);
    P(hd, TOR(.56, .035), M(0xf2c14e, {m:.6, r:.3}));
    const stars = Gp(R.head, [0, .16, 0]);
    for (let i = 0; i < 5; i++){ const a = (i - 2) * .42; const sm = P(stars, starGeo(), M(0xffd95a, {e:0xffb300, ei:1.1, m:.4, r:.3}), [Math.sin(a) * .86, Math.cos(a) * .86, 0], [0, 0, -a]); sm.scale.setScalar(1.25); }
    const b = basketball(.15); b.position.set(0, -.08, .12); R.armL.hand.add(b);
    return out(R, walker(R, {swing:'slam', extra(t){ stars.rotation.z = Math.sin(t * 1.5) * .12; hd.rotation.z = Math.sin(t * 2) * .05; }}), {h:3.25});
  },
  jumbo(){
    const g = new THREE.Group(), b = Gp(g), dk = M(0x1a2038, {m:.4, r:.5}), scr = new THREE.MeshStandardMaterial({color:0xffffff, map:TX.face(), emissiveMap:TX.face(), emissive:0xffffff, emissiveIntensity:.4, roughness:.3});
    P(b, BOX(1.3, .3, 1.0), dk, [0, .42, 0]); P(b, BOX(1.36, .08, 1.06), M(0xf2c14e, {m:.6, r:.3}), [0, .6, 0]);
    const wheels = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheels.push(P(b, CYL(.24, .24, .16, 14), M(0x0d1020, {r:.9}), [sx * .68, .24, sz * .34], [0, 0, PI / 2]));
    P(b, CYL(.09, .12, .7, 10), dk, [0, .95, -.1]);
    const hd = Gp(b, [0, 1.75, 0]);
    P(hd, BOX(1.7, 1.12, .2), dk); P(hd, new THREE.PlaneGeometry(1.5, .9), scr, [0, .03, .105]); P(hd, BOX(1.5, .1, .03), M(0xff8a2b, {e:0xff7a00, ei:1.6}), [0, -.5, .11]);
    for (const sx of [-1, 1]){ P(hd, BOX(.2, .7, .26), M(0x0d1020), [sx * .98, 0, 0]); P(hd, CYL(.07, .07, .02, 12), M(0x39425a), [sx * .98, .16, .14], [PI / 2, 0, 0]); P(hd, CYL(.07, .07, .02, 12), M(0x39425a), [sx * .98, -.14, .14], [PI / 2, 0, 0]); }
    P(hd, CYL(.012, .012, .5, 5), M(0xcfd5e2), [.6, .8, 0]); P(hd, SPH(.04, 8, 6), M(0xff3a2a, {e:0xff2a1a, ei:2}), [.6, 1.06, 0]);
    return {g, h:2.75, anim(t, s){ const c = Math.min(1, s.atk / 4.2); scr.emissiveIntensity = .25 + c * c * 1.5 + (c >= 1 ? Math.sin(t * 20) * .3 : 0);
      hd.position.z = s.atk < .3 ? -.3 * (1 - s.atk / .3) : 0; hd.rotation.x = s.atk < .3 ? -.25 * (1 - s.atk / .3) : 0; for (const w of wheels) w.rotation.x = s.ph * .5; b.position.y = s.mv ? Math.abs(Math.sin(s.ph * 2)) * .015 : 0; }};
  },

  /* props used for spell cards */
  airball(){ const g = new THREE.Group(); for (const [x, y, z, r] of [[-.3, .2, 0, .32], [.34, .55, -.2, .26], [.05, .95, .1, .2]]){ const b = basketball(r); b.position.set(x, y + .3, z); g.add(b); } return {g, h:1.6, anim(){}}; },
  coffee(){ const g = new THREE.Group(); P(g, CYL(.42, .3, .8, 20), M(0xfbf8f2, {r:.4}), [0, .5, 0]); P(g, CYL(.43, .4, .14, 20), M(0x7a4a2a), [0, .55, 0]); P(g, CYL(.38, .38, .02, 20), M(0x3b1f10, {r:.2}), [0, .9, 0]); P(g, CYL(.45, .45, .06, 20), M(0xfbf8f2), [0, .9, 0], null, [1, .4, 1]);
    for (let i = 0; i < 3; i++) P(g, SPH(.1, 8, 6), M(0xffffff, {o:.5}), [(i - 1) * .16, 1.15 + (i % 2) * .16, 0]); return {g, h:1.5, anim(){}}; },
  clockout(){ const g = new THREE.Group(); P(g, CYL(.62, .62, .12, 28), M(0x8fd8ff, {m:.3, r:.3}), [0, .8, 0], [PI / 2, 0, 0]); P(g, new THREE.CircleGeometry(.54, 28), M(0xffffff, {map:TX.clock(), r:.5}), [0, .8, .065]);
    for (let i = 0; i < 5; i++) P(g, CONE(.07, .3, 5), M(0xcfefff, {o:.85, r:.1}), [-.5 + i * .25, .12, .1], [PI, 0, 0]); return {g, h:1.5, anim(){}}; },
  overtime(){ const g = new THREE.Group(), gold = M(0xf2c14e, {m:.8, r:.25}); P(g, SPH(.36, 18, 12), gold, [0, .7, 0]); P(g, BOX(.5, .22, .3), gold, [.42, .82, 0]); P(g, TOR(.14, .04), M(0xcfd5e2, {m:.8, r:.3}), [-.36, 1.0, 0]); P(g, BOX(.2, .06, .31), M(0x15171c), [.56, .9, 0]);
    for (let i = 0; i < 3; i++) P(g, BOX(.04, .2, .04), M(0xff8a2b, {e:0xff7a00, ei:1.4}), [.8 + i * .12, .9 + (i - 1) * .16, 0], [0, 0, -1.2 + (i - 1) * .5]); return {g, h:1.4, anim(){}}; }
};

/* the cardboard big-head for Five-Star BDB, worn on the rigged model's head */
function bigHead(){
  const hd = new THREE.Group();
  P(hd, CYL(.62, .62, .06, 40), [M(0xffffff, {keep:true}), M(0xffffff, {map:TX.face(), keep:true}), M(0xf2c14e, {keep:true})], null, [PI / 2, PI / 2, 0]);
  P(hd, TOR(.62, .04), M(0xf2c14e, {keep:true}));
  for (let i = 0; i < 5; i++){ const a = (i - 2) * .42; P(hd, starGeo(), M(0xffd95a, {e:0xffb300, ei:1.1, keep:true}), [Math.sin(a) * .95, Math.cos(a) * .95, 0], [0, 0, -a], 1.3); }
  return hd;
}
export function makeModel(key, team = 0, o){
  if (hasRig(key)){
    const A = o && o.aff && AFF[o.aff], m = makeRig(key, {tint:A && A.tint != null ? A.tint : null}, GRAD, {bighead:bigHead});
    m.s = A ? A.size : 1; m.h *= m.s; return m;
  }
  const f = MK[key];
  if (!f){ const g = new THREE.Group(); P(g, BOX(.5, .8, .5), M(0xff00ff), [0, .4, 0]); return {g, h:1, anim(){}}; }
  const A = o && o.aff && AFF[o.aff];
  TINT = A && A.tint != null ? A.tint : null;
  let m; try { m = f(team, o); } finally { TINT = null; }
  m.s = A ? A.size : 1; m.h *= m.s;
  return m;
}
export const hasModel = k => !!MK[k];

const INK = new THREE.MeshBasicMaterial({color:0x160d07, side:THREE.BackSide});
export function outline(g, k = 1.085){
  const ms = [];
  g.traverse(o => { if (o.isMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && !o.material.transparent && o.material.side !== THREE.DoubleSide && o.geometry.type !== 'PlaneGeometry' && o.geometry.type !== 'ShapeGeometry' && o.geometry.type !== 'TorusGeometry') ms.push(o); });
  for (const o of ms){ const h = new THREE.Mesh(o.geometry, INK); h.scale.setScalar(k); o.add(h); }
}
