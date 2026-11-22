/* BDB Craft: your character. Skin, hair, eyes, mouth, clothes and shoes, picked once when you first sign in and changed any time from the start screen.
   A character is a handful of small numbers (indexes into the lists below), so it is tiny to save and to send to friends.
   body() builds the blocky figure from it: every face of every box is its own little pixel picture, drawn here on a canvas. */
import * as THREE from '../chess/vendor/three.module.min.js?v=c4';

export const SKIN = ['#f6d5b8', '#ebb98f', '#d49b6c', '#b07548', '#8a5634', '#5c3a22'];
export const HAIR = ['#1c1410', '#4a2d18', '#7a4a24', '#c08a3e', '#ead07a', '#b5381f', '#9a9a9a', '#f2f2f2', '#3a5fcf', '#d24f9a', '#3fae5a'];
export const EYES = ['#3b6fd8', '#4a8b3a', '#6b4524', '#2a2a2a', '#7a5fc0', '#8fb8c8'];
export const CLOTH = ['#e9ecec', '#2b2b30', '#c4372f', '#e8782a', '#f2c33c', '#4fa83c', '#2f8f86', '#3a8fd8', '#2c3e8f', '#7b3fb0', '#d65d93', '#6b4a2e', '#8a8f96', '#1f5130'];
export const HAIRS = ['Short', 'Long', 'Buzz', 'Mohawk', 'Cap', 'Bald', 'Curly'];
export const SHIRTS = ['T-shirt', 'Long sleeves', 'Hoodie', 'Stripes', 'Jersey', 'Suit'];
export const MOUTHS = ['Smile', 'Plain', 'Grin', 'Beard', 'Moustache'];
export const EXTRAS = ['Nothing', 'Glasses', 'Shades', 'Headband'];
/* what each pick is, its list, and how it shows on the character screen */
export const PARTS = [
  ['skin', 'Skin', SKIN, 'swatch'], ['hair', 'Hair', HAIRS, 'text'], ['hairC', 'Hair colour', HAIR, 'swatch'], ['eyes', 'Eyes', EYES, 'swatch'],
  ['mouth', 'Face', MOUTHS, 'text'], ['extra', 'Extra', EXTRAS, 'text'], ['shirt', 'Top', SHIRTS, 'text'], ['shirtC', 'Top colour', CLOTH, 'swatch'],
  ['accent', 'Second colour', CLOTH, 'swatch'], ['pants', 'Pants', CLOTH, 'swatch'], ['shoes', 'Shoes', CLOTH, 'swatch'],
];
export const DEFAULT = {skin:1, hair:0, hairC:1, eyes:0, mouth:0, extra:0, shirt:0, shirtC:7, accent:0, pants:8, shoes:1, num:7};
export function clean(s){
  const o = {}; s = s && typeof s === 'object' ? s : {};
  for (const [k, , list] of PARTS){ const v = s[k] | 0; o[k] = v >= 0 && v < list.length ? v : DEFAULT[k]; }
  o.num = Math.max(0, Math.min(99, s.num | 0)); if (s.num == null) o.num = DEFAULT.num;
  return o;
}
export function random(){ const o = {}; for (const [k, , list] of PARTS) o[k] = Math.floor(Math.random() * list.length); o.num = Math.floor(Math.random() * 100); return clean(o); }

/* a little pixel picture, w x h, scaled up later with no smoothing */
function pic(w, h, fill){ const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = fill; x.fillRect(0, 0, w, h); return {c, x, px(a, b, col, ww = 1, hh = 1){ x.fillStyle = col; x.fillRect(a, b, ww, hh); }}; }
const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16), r = Math.min(255, (n >> 16 & 255) * f), g = Math.min(255, (n >> 8 & 255) * f), b = Math.min(255, (n & 255) * f); return `rgb(${r | 0},${g | 0},${b | 0})`; };
const tex = p => { const t = new THREE.CanvasTexture(p.c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; };
const DIG = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];

/* the six faces of each box, in three.js order: +x (left side of the character), -x, top, bottom, front (+z), back */
function headFaces(s){
  const sk = SKIN[s.skin], hc = HAIR[s.hairC], hs = HAIRS[s.hair], dark = shade(sk, .8);
  const front = pic(8, 8, sk), back = pic(8, 8, sk), left = pic(8, 8, sk), right = pic(8, 8, sk), top = pic(8, 8, sk), bottom = pic(8, 8, sk);
  const cap = CLOTH[s.accent];
  const hairRows = {Short:[2, 3, 6], Long:[2, 7, 8], Buzz:[1, 1, 3], Mohawk:[0, 0, 0], Cap:[2, 2, 4], Bald:[0, 0, 0], Curly:[2, 4, 6]}[hs];      // front rows, side rows, back rows
  const hcol = hs === 'Cap' ? cap : hc;
  if (hs !== 'Bald'){
    if (hs === 'Mohawk'){ top.px(3, 0, hc, 2, 8); front.px(3, 0, hc, 2, 1); back.px(3, 0, hc, 2, 4); }
    else {
      top.px(0, 0, hcol, 8, 8);
      front.px(0, 0, hcol, 8, hairRows[0]); for (const f of [left, right]) f.px(0, 0, hcol, 8, hairRows[1]); back.px(0, 0, hcol, 8, hairRows[2]);
      if (hs === 'Long'){ front.px(0, 2, hc, 1, 5); front.px(7, 2, hc, 1, 5); }
      if (hs === 'Short'){ front.px(0, 2, hc, 1, 1); front.px(7, 2, hc, 1, 1); }
      if (hs === 'Curly'){ for (const f of [front, left, right, back]) for (let i = 0; i < 8; i += 2) f.px(i, hs === 'Curly' ? (f === front ? 2 : 4) : 0, hc); top.px(1, 1, shade(hc, 1.25)); top.px(5, 3, shade(hc, 1.25)); top.px(2, 6, shade(hc, 1.25)); }
      if (hs === 'Cap'){ front.px(0, 2, shade(cap, .7), 8, 1); top.px(0, 0, shade(cap, 1.15), 8, 1); left.px(0, 2, hc, 2, 2); right.px(6, 2, hc, 2, 2); back.px(0, 4, hc, 8, 1); }
    }
  }
  // eyes
  front.px(1, 4, '#ffffff', 2, 1); front.px(5, 4, '#ffffff', 2, 1); front.px(2, 4, EYES[s.eyes]); front.px(5, 4, EYES[s.eyes]);
  front.px(1, 3, shade(hc, .9), 2, 1); front.px(5, 3, shade(hc, .9), 2, 1);       // brows
  if (hs === 'Long' || hs === 'Short' || hs === 'Curly' || hs === 'Cap'){} else { front.px(1, 3, shade(sk, .7), 2, 1); front.px(5, 3, shade(sk, .7), 2, 1); }
  front.px(3, 5, dark, 2, 1);                                                      // nose
  const m = MOUTHS[s.mouth], lip = shade(sk, .55);
  if (m === 'Smile'){ front.px(2, 6, lip); front.px(5, 6, lip); front.px(3, 7, lip, 2, 1); front.px(2, 6, lip); }
  if (m === 'Plain'){ front.px(3, 6, lip, 2, 1); }
  if (m === 'Grin'){ front.px(2, 6, lip, 4, 1); front.px(3, 6, '#ffffff', 2, 1); front.px(2, 7, lip, 4, 1); }
  if (m === 'Beard'){ front.px(1, 6, hc, 6, 2); front.px(0, 5, hc, 1, 3); front.px(7, 5, hc, 1, 3); front.px(3, 6, lip, 2, 1); bottom.px(0, 0, hc, 8, 8); left.px(0, 5, hc, 2, 3); right.px(6, 5, hc, 2, 3); }
  if (m === 'Moustache'){ front.px(2, 6, hc, 4, 1); front.px(1, 7, hc); front.px(6, 7, hc); }
  const ex = EXTRAS[s.extra];
  if (ex === 'Glasses'){ const g = '#222'; front.px(1, 4, g); front.px(4, 4, g); front.px(3, 4, g); front.px(7, 4, g); front.px(0, 4, g); left.px(0, 4, g, 7, 1); right.px(1, 4, g, 7, 1); }
  if (ex === 'Shades'){ const g = '#111'; front.px(0, 4, g, 8, 1); front.px(1, 5, g, 2, 1); front.px(5, 5, g, 2, 1); front.px(2, 4, '#3d4b66'); left.px(0, 4, g, 7, 1); right.px(1, 4, g, 7, 1); }
  if (ex === 'Headband'){ const a = CLOTH[s.accent]; for (const f of [front, left, right, back]) f.px(0, 2, a, 8, 1); }
  return [right, left, top, bottom, front, back].map(tex);
}
function shirtPic(s, w, h, side){
  const c = CLOTH[s.shirtC], a = CLOTH[s.accent], st = SHIRTS[s.shirt], p = pic(w, h, c);
  if (st === 'Stripes') for (let y = 1; y < h; y += 3) p.px(0, y, a, w, 1);
  if (st === 'Suit' && side === 'front'){ p.px(3, 0, '#f2f2f2', 2, h); p.px(3, 1, a, 2, 7); }
  if (st === 'Hoodie'){ if (side === 'front'){ p.px(2, 7, shade(c, .82), 4, 3); p.px(3, 0, a, 1, 4); p.px(4, 0, a, 1, 4); } if (side === 'back') p.px(1, 0, shade(c, .85), 6, 2); }
  if (st === 'T-shirt' && side === 'front') p.px(3, 0, shade(c, .75), 2, 1);
  if (st === 'Jersey'){ p.px(0, h - 1, a, w, 1); if (side === 'front' || side === 'back'){ p.px(0, 0, a, w, 1); const n = String(s.num), sc = side === 'back' ? 1 : 1, ox = n.length === 1 ? 3 : 1;
    [...n].forEach((d, i) => { const g = DIG[+d]; for (let k = 0; k < 15; k++) if (g[k] === '1') p.px(ox + i * 4 + (k % 3), 3 + Math.floor(k / 3), a); }); } }
  return p;
}
function torsoFaces(s){ const side = shirtPic(s, 4, 12, 'side'); return [side, shirtPic(s, 4, 12, 'side'), shirtPic(s, 8, 4, 'top'), shirtPic(s, 8, 4, 'top'), shirtPic(s, 8, 12, 'front'), shirtPic(s, 8, 12, 'back')].map(tex); }
function armFaces(s){
  const st = SHIRTS[s.shirt], sleeve = st === 'T-shirt' || st === 'Jersey' ? 4 : 10, sk = SKIN[s.skin];
  const one = () => { const p = shirtPic(s, 4, 12, 'side'); p.px(0, sleeve, sk, 4, 12 - sleeve); if (st === 'Suit') p.px(0, 9, '#f2f2f2', 4, 1); return p; };
  const top = shirtPic(s, 4, 4, 'top'), bot = pic(4, 4, sk);
  return [one(), one(), top, bot, one(), one()].map(tex);
}
function legFaces(s){
  const pc = CLOTH[s.pants], sh = CLOTH[s.shoes];
  const one = () => { const p = pic(4, 12, pc); p.px(0, 10, sh, 4, 2); p.px(0, 11, shade(sh, .7), 4, 1); return p; };
  return [one(), one(), pic(4, 4, pc), pic(4, 4, shade(sh, .7)), one(), one()].map(tex);
}

/* the blocky figure: 1.8 tall, front facing +z, feet at y = 0. Returns the group and its moving parts */
export function body(s){
  s = clean(s);
  const g = new THREE.Group(), lam = ts => ts.map(t => new THREE.MeshLambertMaterial({map:t}));
  const head = new THREE.Group(); head.position.set(0, 1.5, 0); g.add(head);
  const hm = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .5), lam(headFaces(s))); hm.position.y = .25; head.add(hm);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(.5, .75, .25), lam(torsoFaces(s))); torso.position.y = 1.125; g.add(torso);
  const am = lam(armFaces(s)), lm = lam(legFaces(s));
  const limb = (x, y, h, mats) => { const a = new THREE.Group(); a.position.set(x, y, 0); const m = new THREE.Mesh(new THREE.BoxGeometry(.25, h, .25), mats); m.position.y = -h / 2 + .05; a.add(m); g.add(a); return a; };
  const la = limb(-.375, 1.45, .75, am), ra = limb(.375, 1.45, .75, am), ll = limb(-.125, .8, .8, lm), rl = limb(.125, .8, .8, lm);
  return {group:g, head, la, ra, ll, rl, dispose(){ g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) for (const m of [].concat(o.material)){ if (m.map) m.map.dispose(); m.dispose(); } }); }};
}
