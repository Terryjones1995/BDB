import * as THREE from 'three';
import { OrbitControls } from '../chess/vendor/OrbitControls.js';
import { RoomEnvironment } from '../chess/vendor/RoomEnvironment.js';

/* =========================================================
   BDB Tycoon: the 3D table.
   One WebGL scene: a framed board (canvas-drawn surface), six token models, dice, card decks, houses and hotels.
   game.js owns the rules and the event queue; this file only shows things. Nothing here can stall the game:
   every animation is a time-based tween, and a watchdog finishes them if frames stop coming (hidden tab, lost GL).
   Rendering is on demand: no frames are drawn while nothing moves and the camera is still.
   World units: one side space is 1 wide, a corner is 1.6, the playing surface is 12.2 square, y is up,
   space 0 (Clock In) sits at +x +z, the default camera looks from +z.
   ========================================================= */

const U = 1, C = 1.6, HALF = C + 4.5 * U, BAND = .4, TOP = .07, FR = .64;
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mod40 = i => ((i % 40) + 40) % 40;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const ease = {
  io: p => p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2,
  out: p => 1 - Math.pow(1 - p, 3),
  in: p => p * p * p,
  lin: p => p,
  back: p => { const c = 1.9, c3 = c + 1; return 1 + c3 * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); },
  bounce: p => { const n = 7.5625, d = 2.75; if (p < 1 / d) return n * p * p; if (p < 2 / d) return n * (p -= 1.5 / d) * p + .75; if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + .9375; return n * (p -= 2.625 / d) * p + .984375; }
};

export function webglOK(){
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch(e){ return false; }
}

/* ---------- track geometry (pure) ---------- */
const sideOf = i => i % 10 === 0 ? 'c' : i < 10 ? 'b' : i < 20 ? 'l' : i < 30 ? 't' : 'r';
const OUT = {b:[0, 1], l:[-1, 0], t:[0, -1], r:[1, 0]};
const SIDE_ROT = {b:0, l:-Math.PI / 2, t:0, r:Math.PI / 2};      // spin of a flat decal so it matches the printed space
const K = HALF - C / 2;
function cellOf(i){
  const s = sideOf(i);
  if (s === 'c') return {x: i === 0 || i === 30 ? K : -K, z: i === 0 || i === 10 ? K : -K, w:C, d:C, s};
  if (s === 'b') return {x:5 - i, z:K, w:U, d:C, s};
  if (s === 'l') return {x:-K, z:15 - i, w:C, d:U, s};
  if (s === 't') return {x:i - 25, z:-K, w:U, d:C, s};
  return {x:K, z:i - 35, w:C, d:U, s};
}
const outOf = i => { const s = sideOf(i); return s !== 'c' ? OUT[s] : i === 0 ? [1, 1] : i === 10 ? [-1, 1] : i === 20 ? [-1, -1] : [1, -1]; };
// where a token touches down while passing through a space (an outer lane, clear of whoever is parked there)
function lanePt(i){ const c = cellOf(i), o = outOf(i), k = c.s !== 'c' ? .5 : i === 10 ? .55 : .36; return {x:c.x + o[0] * k, z:c.z + o[1] * k}; }
// parking spots for n tokens on a space (jailed = inside the Benched cell)
function slotsFor(i, n, jailed){
  const c = cellOf(i), o = outOf(i), out = [];
  if (i === 10 && !jailed){                       // just visiting: line up along the L-shaped strip
    const sp = n <= 3 ? .62 : 2.3 / (n - 1), s = n <= 3 ? .78 : n === 4 ? .7 : .6, e = -HALF + .26, f = HALF - .26;
    for (let k = 0; k < n; k++){ const t = (k - (n - 1) / 2) * sp; out.push(t < 0 ? {x:e - t, z:f, s} : {x:e, z:f - t, s}); }
    return out;
  }
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
  if (i === 10){                                  // in the cell
    const cx = -HALF + C * .32 + C * .34, cz = HALF - C * .32 - C * .34, s = n <= 1 ? .85 : n <= 4 ? .72 : .58, g = n <= 4 ? .46 : .34;
    for (let k = 0; k < n; k++) out.push({x:cx + ((k % cols) - (cols - 1) / 2) * g, z:cz + (Math.floor(k / cols) - (rows - 1) / 2) * g, s});
    return out;
  }
  if (c.s === 'c'){
    const s = n <= 2 ? 1 : n <= 4 ? .9 : .74, g = n <= 4 ? .58 : .46, cx = c.x - o[0] * .12, cz = c.z - o[1] * .12;
    for (let k = 0; k < n; k++) out.push({x:cx + ((k % cols) - (cols - 1) / 2) * g, z:cz + (Math.floor(k / cols) - (rows - 1) / 2) * g, s});
    return out;
  }
  const a = [o[1], o[0]], s = n <= 1 ? 1 : n === 2 ? .8 : n <= 4 ? .72 : .56, ga = cols === 2 ? .46 : .32, go = .44;
  const cx = c.x + o[0] * (rows > 1 ? .12 : .08), cz = c.z + o[1] * (rows > 1 ? .12 : .08);
  for (let k = 0; k < n; k++){
    const ca = ((k % cols) - (cols - 1) / 2) * ga, ro = (Math.floor(k / cols) - (rows - 1) / 2) * go;
    out.push({x:cx + a[0] * ca + o[0] * ro, z:cz + a[1] * ca + o[1] * ro, s});
  }
  return out;
}
// which space is under a point on the board (-1 = the middle)
function spaceAt(x, z){
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return -1;
  const f = v => v < -HALF + C ? 0 : v > HALF - C ? 10 : 1 + clamp(Math.floor(v + HALF - C), 0, 8);
  const col = f(x), row = f(z);
  if (row === 10) return 10 - col;
  if (col === 0) return 20 - row;
  if (row === 0) return 20 + col;
  if (col === 10) return 30 + row;
  return -1;
}

/* ---------- canvas helpers ---------- */
const F_BODY = 'Figtree, system-ui, -apple-system, "Segoe UI", sans-serif';
const F_LED = 'Teko, "Barlow Condensed", "Arial Narrow", "DejaVu Sans Condensed", sans-serif';
const F_DISP = '"Bowlby One", "Arial Black", Impact, "DejaVu Sans", sans-serif';
function rrect(x, a, b, w, h, r){
  x.beginPath();
  if (x.roundRect) x.roundRect(a, b, w, h, r);
  else { x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
}
function drawIcon(x, markup, cx, cy, size, color, lw = 1.8){
  if (!markup) return;
  x.save(); x.translate(cx - size / 2, cy - size / 2); x.scale(size / 24, size / 24);
  x.strokeStyle = color; x.lineWidth = lw; x.lineCap = 'round'; x.lineJoin = 'round';
  const re = /<(path|circle|rect)\s+([^>]*?)\/>/g; let m;
  while ((m = re.exec(markup))){
    const a = {}; m[2].replace(/([\w-]+)="([^"]*)"/g, (_, k, v) => { a[k] = v; return ''; });
    if (m[1] === 'path') x.stroke(new Path2D(a.d));
    else if (m[1] === 'circle'){ x.beginPath(); x.arc(+a.cx, +a.cy, +a.r, 0, TAU); x.stroke(); }
    else { rrect(x, +a.x, +a.y, +a.width, +a.height, +(a.rx || 0)); x.stroke(); }
  }
  x.restore();
}
function wrap2(name){
  const w = name.split(' ');
  if (w.length < 2) return [name];
  let best = null;
  for (let k = 1; k < w.length; k++){ const a = w.slice(0, k).join(' '), b = w.slice(k).join(' '), m = Math.max(a.length, b.length); if (!best || m < best.m) best = {m, l:[a, b]}; }
  return name.length <= 7 ? [name] : best.l;
}
function fitFont(x, lines, weight, fam, px, maxW, min = .5){
  const lo = px * min;
  for (;;){ x.font = `${weight} ${px.toFixed(1)}px ${fam}`; if (px <= lo || Math.max(...lines.map(l => x.measureText(l).width)) <= maxW) return px; px *= .95; }
}
function spaced(x, v){ try { x.letterSpacing = v; } catch(e){} }
// the lights and tone mapping wash colours out a little, so print them a touch deeper than the flat board does
function deep(hex, sat = 1.25, lum = .86){
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0, l = (mx + mn) / 2, s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return `hsl(${(h * 60).toFixed(0)},${(Math.min(1, s * sat) * 100).toFixed(0)}%,${(l * lum * 100).toFixed(0)}%)`;
}

/* The whole playing surface as one texture. */
function drawBoard(cv, {S, GR, icons, face}){
  const x = cv.getContext('2d'), N = cv.width, u = N / (HALF * 2), c = u * C, gap = Math.max(1, N / 1100);
  const INK = '#1a1f2e';
  x.fillStyle = '#5a3d16'; x.fillRect(0, 0, N, N);
  /* centre court */
  const cw = N - 2 * c, mid = N / 2;
  let g = x.createRadialGradient(mid, mid, 0, mid, mid, cw * .74);
  g.addColorStop(0, '#1d4797'); g.addColorStop(.55, '#102c63'); g.addColorStop(1, '#081a3c');
  x.fillStyle = g; x.fillRect(c, c, cw, cw);
  x.strokeStyle = 'rgba(255,255,255,.09)'; x.lineWidth = u * .04;
  x.beginPath(); x.arc(mid, mid - .1 * u, 2.25 * u, 0, TAU); x.stroke();
  x.strokeRect(c + .22 * u, c + .22 * u, cw - .44 * u, cw - .44 * u);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  // logo
  spaced(x, (.03 * u).toFixed(1) + 'px');
  x.fillStyle = '#f2c14e'; x.font = `800 ${(.19 * u).toFixed(1)}px ${F_BODY}`;
  x.fillText('BDB ENTERTAINMENT PRESENTS', mid, mid - 3.72 * u);
  spaced(x, '0px');
  { const px = fitFont(x, ['BDB TYCOON'], '400', F_DISP, 1.02 * u, 7.4 * u), a = x.measureText('BDB ').width, b = x.measureText('TYCOON').width, x0 = mid - (a + b) / 2, y = mid - 2.86 * u;
    x.textAlign = 'left';
    x.fillStyle = '#071634'; x.fillText('BDB ', x0, y + px * .09); x.fillStyle = '#7a3706'; x.fillText('TYCOON', x0 + a, y + px * .09);
    x.fillStyle = '#eef2fb'; x.fillText('BDB ', x0, y); x.fillStyle = '#ff8a2b'; x.fillText('TYCOON', x0 + a, y);
    x.textAlign = 'center'; }
  // his face, front and centre
  { const cy = mid - .1 * u, r = 1.5 * u;
    x.fillStyle = '#071634'; x.beginPath(); x.arc(mid, cy + .06 * u, r + .2 * u, 0, TAU); x.fill();
    x.fillStyle = '#f2c14e'; x.beginPath(); x.arc(mid, cy, r + .13 * u, 0, TAU); x.fill();
    x.fillStyle = '#ff8a2b'; x.beginPath(); x.arc(mid, cy, r + .05 * u, 0, TAU); x.fill();
    x.save(); x.beginPath(); x.arc(mid, cy, r, 0, TAU); x.clip();
    x.fillStyle = '#17306a'; x.fillRect(mid - r, cy - r, 2 * r, 2 * r);
    if (face && face.complete && face.naturalWidth){ const s = Math.min(face.naturalWidth, face.naturalHeight); x.imageSmoothingQuality = 'high'; x.drawImage(face, (face.naturalWidth - s) / 2, (face.naturalHeight - s) * .32, s, s, mid - r, cy - r, 2 * r, 2 * r); }
    x.restore(); }
  spaced(x, (.035 * u).toFixed(1) + 'px');
  x.fillStyle = '#f2c14e'; x.font = `800 ${(.2 * u).toFixed(1)}px ${F_BODY}`;
  x.fillText('SAME GUY. DIFFERENT LEAGUE.', mid, mid + 1.98 * u);
  // card deck pads and the dice tray
  for (const [dx, col, label] of [[-3, '#ff8a2b', 'SCOUT CALL'], [3, '#4fb3ff', 'BREAK ROOM FRIDGE']]){
    const px = mid + dx * u, py = mid + .1 * u, w = 2.04 * u, h = 1.44 * u;
    x.fillStyle = 'rgba(3,8,20,.4)'; rrect(x, px - w / 2, py - h / 2, w, h, .14 * u); x.fill();
    x.strokeStyle = col; x.lineWidth = u * .035; x.setLineDash([u * .12, u * .08]); rrect(x, px - w / 2, py - h / 2, w, h, .14 * u); x.stroke(); x.setLineDash([]);
    x.fillStyle = col; x.font = `800 ${(.155 * u).toFixed(1)}px ${F_BODY}`; x.fillText(label, px, py + h / 2 + .2 * u);
  }
  spaced(x, '0px');
  x.fillStyle = 'rgba(3,8,20,.3)'; rrect(x, mid - 1.7 * u, mid + 2.4 * u, 3.4 * u, 1.5 * u, .3 * u); x.fill();
  x.strokeStyle = 'rgba(255,255,255,.1)'; x.lineWidth = u * .03; rrect(x, mid - 1.7 * u, mid + 2.4 * u, 3.4 * u, 1.5 * u, .3 * u); x.stroke();

  /* spaces */
  const paper = (W, H, a, b) => { const gr = x.createLinearGradient(-W / 2, -H / 2, W / 2, H / 2); gr.addColorStop(0, a); gr.addColorStop(1, b); x.fillStyle = gr; x.fillRect(-W / 2 + gap, -H / 2 + gap, W - 2 * gap, H - 2 * gap); };
  const lines = (arr, weight, fam, px, maxW, y, color, lh = 1.06) => {
    px = fitFont(x, arr, weight, fam, px, maxW); x.fillStyle = color;
    arr.forEach((l, k) => x.fillText(l, 0, y + (k - (arr.length - 1) / 2) * px * lh));
    return px;
  };
  function side(sp, W, H, flip){
    const Y = t => flip ? H / 2 - t : -H / 2 + t;
    paper(W, H, sp.k === 'card' ? (sp.deck === 'scout' ? '#f7cf96' : '#b5d6f5') : '#e8cc98', sp.k === 'card' ? (sp.deck === 'scout' ? '#eab06a' : '#8fbde8') : '#d6b070');
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (sp.k === 'prop'){
      const b = BAND * W, y0 = Math.min(Y(0), Y(b));
      x.fillStyle = deep(GR[sp.g].color); x.fillRect(-W / 2 + gap, y0 + (flip ? 0 : gap), W - 2 * gap, b - gap);
      const sh = x.createLinearGradient(0, y0, 0, y0 + b); sh.addColorStop(0, 'rgba(255,255,255,.1)'); sh.addColorStop(1, 'rgba(0,0,0,.16)');
      x.fillStyle = sh; x.fillRect(-W / 2 + gap, y0 + (flip ? 0 : gap), W - 2 * gap, b - gap);
      x.fillStyle = 'rgba(26,31,46,.75)'; x.fillRect(-W / 2 + gap, Y(b) - gap, W - 2 * gap, gap * 2);
      lines(wrap2(sp.sh), '800', F_BODY, .225 * W, .92 * W, Y(.78 * W), INK);
      x.font = `600 ${(.31 * W).toFixed(1)}px ${F_LED}`; x.fillStyle = '#3a2a10'; x.fillText('$' + sp.price, 0, Y(H - .2 * W) + .02 * W);
    } else {
      const tint = sp.k === 'card' ? (sp.deck === 'scout' ? '#a8480a' : '#155d9e') : INK;
      lines(wrap2(sp.sh), '800', F_BODY, .22 * W, .92 * W, Y(.28 * W), INK);
      drawIcon(x, icons[sp.k === 'card' ? (sp.deck === 'scout' ? 'phone' : 'fridge') : sp.k === 'transit' ? 'bus' : sp.k === 'util' ? (sp.i === 12 ? 'coffee' : 'vend') : 'receipt'], 0, Y(.88 * W), .58 * W, tint, 1.9);
      const pr = sp.price ? '$' + sp.price : sp.amt ? 'PAY $' + sp.amt : 'DRAW';
      x.font = `600 ${((sp.price ? .31 : .25) * W).toFixed(1)}px ${F_LED}`; x.fillStyle = sp.price ? '#3a2a10' : tint; x.fillText(pr, 0, Y(H - .2 * W) + .02 * W);
    }
  }
  function corner(i, sp, W){
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (i === 0){
      paper(W, W, '#ffd596', '#f39a3d');
      drawIcon(x, icons.clock, 0, -.36 * W, .34 * W, INK, 1.9);
      lines(['CLOCK IN'], '400', F_DISP, .185 * W, .9 * W, -.06 * W, INK);
      lines(['COLLECT $200'], '800', F_BODY, .095 * W, .86 * W, .12 * W, '#5b3206');
      x.strokeStyle = '#b3260f'; x.fillStyle = '#b3260f'; x.lineWidth = .05 * W; x.lineCap = 'round';
      x.beginPath(); x.moveTo(.3 * W, .32 * W); x.lineTo(-.2 * W, .32 * W); x.stroke();
      x.beginPath(); x.moveTo(-.34 * W, .32 * W); x.lineTo(-.18 * W, .23 * W); x.lineTo(-.18 * W, .41 * W); x.closePath(); x.fill();
    } else if (i === 10){
      paper(W, W, '#ffe9ae', '#f0c453');
      const a = .32 * W, bx = -W / 2 + a, bs = W - a - gap;          // the cell: inner top-right
      const gr = x.createLinearGradient(bx, -W / 2, bx + bs, -W / 2 + bs); gr.addColorStop(0, '#ff9a3c'); gr.addColorStop(1, '#c4530c');
      x.fillStyle = gr; x.fillRect(bx, -W / 2 + gap, bs, bs);
      x.fillStyle = 'rgba(10,14,24,.42)'; for (let k = 0; k < 7; k++) x.fillRect(bx + bs * (k + .5) / 7 - gap * 1.5, -W / 2 + gap, gap * 3, bs);
      x.strokeStyle = INK; x.lineWidth = gap * 3; x.strokeRect(bx, -W / 2 + gap, bs, bs);
      const mx = bx + bs / 2, my = -W / 2 + bs / 2;
      drawIcon(x, icons.bench, mx, my - .1 * W, .3 * W, '#fff', 2);
      x.save(); x.translate(mx, my + .16 * W); x.shadowColor = 'rgba(0,0,0,.7)'; x.shadowBlur = .02 * W; lines(['BENCHED'], '400', F_DISP, .12 * W, bs * .9, 0, '#fff'); x.restore();
      x.save(); x.translate(.14 * W, W / 2 - a / 2); lines(['VISITING'], '800', F_BODY, .09 * W, bs * .8, 0, '#5b4420'); x.restore();
      x.save(); x.translate(-W / 2 + a / 2, -.16 * W); x.rotate(Math.PI / 2); lines(['JUST'], '800', F_BODY, .09 * W, bs * .8, 0, '#5b4420'); x.restore();
    } else if (i === 20){
      paper(W, W, '#cdf4d8', '#8fd6a7');
      drawIcon(x, icons.couch, 0, -.3 * W, .4 * W, INK, 1.9);
      lines(['BREAK ROOM'], '400', F_DISP, .15 * W, .9 * W, -.02 * W, INK);
      lines(['REST STOP'], '800', F_BODY, .095 * W, .8 * W, .27 * W, '#27563a');
    } else {
      paper(W, W, '#ffbcb2', '#ee7b69');
      drawIcon(x, icons.whistle, 0, -.3 * W, .38 * W, INK, 1.9);
      lines(['COACH SAYS', 'SIT DOWN'], '400', F_DISP, .13 * W, .9 * W, .06 * W, INK, 1.1);
      lines(['GO TO BENCHED'], '800', F_BODY, .09 * W, .86 * W, .34 * W, '#6b150b');
    }
  }
  for (let i = 0; i < 40; i++){
    const cl = cellOf(i);
    x.save(); x.translate((cl.x + HALF) * u, (cl.z + HALF) * u);
    if (cl.s === 'c') corner(i, S[i], c);
    else { x.rotate(cl.s === 'l' ? Math.PI / 2 : cl.s === 'r' ? -Math.PI / 2 : 0); side(S[i], u, c, cl.s === 't'); }
    x.restore();
  }
}

/* ---------- the view ---------- */
export function createBoard3D(o){
  const {host, floatLayer, cardEl, data:D, engine:E, icons, onSpace, onToken, onLost, sfx = {}, reduced = false, face = null} = o;
  const S = D.spaces, GR = D.groups;
  const small = o.small != null ? !!o.small : (Math.min(screen.width, screen.height) < 700 || (navigator.deviceMemory || 8) < 4);
  const calm = !!reduced;
  let dead = false, lost = false, lostTimer = 0;
  const stat = {frames:0, taps:0, tex:small ? 1024 : 2048};
  const snd = k => { try { sfx[k] && sfx[k](); } catch(e){} };

  /* resources we own; everything in here is disposed with the view */
  const trash = new Set();
  const keep = x => { trash.add(x); return x; };
  const geo = {}, mats = {};
  const G = (k, f) => geo[k] || (geo[k] = keep(f()));
  const MAT = (k, f) => mats[k] || (mats[k] = keep(f()));
  const std = (color, rough = .5, metal = 0, extra) => new THREE.MeshStandardMaterial(Object.assign({color, roughness:rough, metalness:metal}, extra));
  const mesh = (g, m, x = 0, y = 0, z = 0) => { const q = new THREE.Mesh(g, m); q.position.set(x, y, z); q.castShadow = true; return q; };
  const ctex = (cv, aniso = 4) => { const t = keep(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t; };
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  /* ---------- renderer / scene ---------- */
  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .86;
  const el = renderer.domElement;
  el.setAttribute('aria-label', 'Game board. Drag to turn it, pinch or scroll to zoom, tap a space or a token for details.');
  host.appendChild(el);
  const MAXA = Math.min(small ? 4 : 12, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050c1c, 34, 80);
  { const pm = new THREE.PMREMGenerator(renderer); scene.environment = keep(pm.fromScene(new RoomEnvironment(), .04).texture); pm.dispose(); }
  const camera = new THREE.PerspectiveCamera(38, 1, 1, 140);
  camera.position.set(0, 18, 12);
  const controls = new OrbitControls(camera, el);
  Object.assign(controls, {enablePan:false, enableDamping:true, dampingFactor:.1, minDistance:8, maxDistance:44, minPolarAngle:.1, maxPolarAngle:1.24, rotateSpeed:.55, zoomSpeed:.85, autoRotateSpeed:1.3});
  controls.target.set(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xc8dcff, 0x1a1208, .34));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.05);
  key.position.set(5.5, 15, 8.5); key.castShadow = true;
  key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(key.shadow.camera, {left:-10, right:10, top:10, bottom:-10, near:2, far:44});
  key.shadow.bias = -.0005; key.shadow.normalBias = .03; key.shadow.radius = 3;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fc0ff, .6); fill.position.set(-8, 7, -9); scene.add(fill);
  for (const x of [-13, 13]){ const s = new THREE.SpotLight(0x6aa2ff, 320, 54, .5, .6, 1.4); s.position.set(x, 13, -11); scene.add(s); }
  const warm = new THREE.PointLight(0xff8a2b, 46, 34, 1.6); warm.position.set(0, 4, 13); scene.add(warm);

  /* ---------- textures ---------- */
  function woodTex(base, streak){
    const c = canvas(512, 512), x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 150; i++){
      x.strokeStyle = streak; x.globalAlpha = Math.random() * .17; x.lineWidth = Math.random() * 3 + .5;
      const y0 = Math.random() * 512; x.beginPath();
      for (let k = 0; k <= 512; k += 8) x.lineTo(k, y0 + Math.sin(k * .02 + i) * 5);
      x.stroke();
    }
    const t = ctex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(.21, .21); return t;
  }
  const DOT = (() => { const c = canvas(64, 64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.65)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return keep(new THREE.CanvasTexture(c)); })();
  const boardCv = canvas(stat.tex, stat.tex);
  const boardTex = ctex(boardCv, MAXA);
  const faceTex = keep(new THREE.Texture(face || undefined)); faceTex.colorSpace = THREE.SRGBColorSpace;
  function paintBoard(){
    if (dead) return;
    drawBoard(boardCv, {S, GR, icons, face});
    boardTex.needsUpdate = true;
    if (face && face.complete && face.naturalWidth){ faceTex.image = face; faceTex.needsUpdate = true; }
    invalidate();
  }

  /* ---------- on-demand loop + tweens ---------- */
  const tweens = new Set(), updaters = new Set();
  let raf = 0, rafAt = 0, inFrame = false, again = false, lastT = performance.now();
  function invalidate(){ if (dead) return; if (inFrame){ again = true; return; } if (!raf){ raf = requestAnimationFrame(frame); rafAt = performance.now(); } }
  // dur in seconds. Resolves when done; never hangs (see the watchdog).
  function tween(dur, fn, e = ease.io){
    if (dead) return Promise.resolve();
    if (!(dur > 0) || lost || document.hidden){ try { fn(1, 1); } catch(err){} invalidate(); return Promise.resolve(); }
    return new Promise(res => { tweens.add({t0:performance.now(), dur:dur * 1000 * slowmo, fn, e, res}); invalidate(); });
  }
  const pause = s => tween(s, () => {}, ease.lin);
  let frozenAt = 0, slowmo = 1;     // test hooks: stop or stretch the clock so a screenshot can catch a hop in mid-air
  function stepTweens(t, force){
    if (frozenAt && !force) return;
    for (const tw of [...tweens]){
      const p = force ? 1 : clamp((t - tw.t0) / tw.dur, 0, 1);
      try { tw.fn(tw.e(p), p); } catch(err){ console.warn('tween', err); }
      if (p >= 1){ tweens.delete(tw); tw.res(); }
    }
  }
  function flush(){ let n = 0; while (tweens.size && n++ < 60) stepTweens(0, true); for (const u of [...updaters]){ try { u(99, true); } catch(e){} } updaters.clear(); }
  // Watchdog. Hidden tab or dead GL: finish everything now. Frames asked for but not arriving (a throttled or covered
  // window that is not "hidden"): run the clock from a timer instead, so tweens still end on time and the game keeps its pace.
  let starve = 0, lastFrameAt = 0;
  const dog = setInterval(() => {
    if (dead || frozenAt || (!tweens.size && !updaters.size)) return;
    if (document.hidden || lost){ flush(); return; }
    if (!raf) invalidate();
    else if (!starve && performance.now() - rafAt > 450){
      let last = performance.now();
      starve = setInterval(() => {
        const t = performance.now(), dt = Math.min(.1, (t - last) / 1000); last = t;
        if (dead || frozenAt || document.hidden || lost || (!tweens.size && !updaters.size)){ clearInterval(starve); starve = 0; return; }
        if (t - lastFrameAt < 220) return;                    // frames are flowing again; leave it to them
        stepTweens(t); for (const u of [...updaters]) u(dt, false);
      }, 50);
    }
  }, 250);
  const onVis = () => { if (document.hidden) flush(); else invalidate(); };
  document.addEventListener('visibilitychange', onVis);

  /* ---------- camera ---------- */
  const homePos = camera.position.clone(), fGoal = new THREE.Vector3(), fCur = new THREE.Vector3(), disp = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  // the orbit controls own "home"; follow-cam and shake are a displacement added on top for each frame and taken off again before the controls run
  function setHome(v){ homePos.copy(v); camera.position.copy(v); disp.set(0, 0, 0); camera.lookAt(0, 0, 0); }
  let zGoal = 0, zCur = 0, flying = false, custom = false, shakeAmt = 0, shakeDecay = 0, autoUntil = 0, relaxT = 0;
  const FIT = [];
  { const h = HALF + FR + .12; for (const x of [-h, h]) for (const z of [-h, h]) FIT.push(new THREE.Vector3(x, -.3, z), new THREE.Vector3(x, .1, z));
    for (const x of [-K, K]) for (const z of [-K, K]) FIT.push(new THREE.Vector3(x, .95, z)); }
  const fitCam = new THREE.PerspectiveCamera();
  function fitDistance(dir){
    fitCam.fov = camera.fov; fitCam.aspect = camera.aspect; fitCam.near = 1; fitCam.far = 200; fitCam.updateProjectionMatrix();
    let lo = 6, hi = 90;
    for (let i = 0; i < 24; i++){
      const d = (lo + hi) / 2;
      fitCam.position.copy(dir).multiplyScalar(d); fitCam.lookAt(0, 0, 0); fitCam.updateMatrixWorld(); fitCam.matrixWorldInverse.copy(fitCam.matrixWorld).invert();
      const ok = FIT.every(c => { const p = tmpV.copy(c).project(fitCam); return Math.abs(p.x) < .965 && p.y < .95 && p.y > -.955; });
      if (ok) hi = d; else lo = d;
    }
    return hi;
  }
  // wide stages look across the board; tall or square ones look more from above so the board fills the width
  function viewDir(){ const t = clamp((camera.aspect - .82) / .5, 0, 1); return new THREE.Vector3(0, 1, lerp(.36, .7, t)).normalize(); }
  function viewHome(){ const d = viewDir(); return d.multiplyScalar(fitDistance(d)); }
  function setLimits(){ const f = fitDistance(viewDir()); controls.minDistance = f * .4; controls.maxDistance = f * 1.5; }
  // throw away whatever spin the damping still has queued, without moving the camera
  function killSpin(){ tmpV.copy(camera.position); controls.enableDamping = false; controls.update(); controls.enableDamping = true; camera.position.copy(tmpV); camera.lookAt(controls.target); }
  function flyHome(dur = .7){
    custom = false; controls.autoRotate = false; killSpin();
    const to = viewHome(), from = homePos.clone();
    if (calm || from.distanceTo(to) < .02){ setHome(to); invalidate(); return Promise.resolve(); }
    flying = true; controls.enabled = false;
    // go round the board rather than through it
    const a0 = Math.atan2(from.x, from.z), a1 = Math.atan2(to.x, to.z), da = angDiff(a0, a1), r0 = Math.hypot(from.x, from.z), r1 = Math.hypot(to.x, to.z);
    return tween(dur, e => { const a = a0 + da * e, r = lerp(r0, r1, e); homePos.set(Math.sin(a) * r, lerp(from.y, to.y, e), Math.cos(a) * r); }).then(() => { flying = false; controls.enabled = true; if (!dead && !custom) setHome(to); invalidate(); });
  }
  function focusOn(p, zoom = .2){
    if (calm || dead) return;
    clearTimeout(relaxT);
    if (!p){ fGoal.set(0, 0, 0); zGoal = 0; } else { const k = camera.aspect < 1 ? .22 : .42; fGoal.set(p.x * k, 0, p.z * k); zGoal = camera.aspect < 1 ? zoom * .7 : zoom; }   // phones: the board already fills the width, so follow less
    invalidate();
  }
  function relax(ms = 900){ clearTimeout(relaxT); relaxT = setTimeout(() => focusOn(null), ms); }
  function shake(a = .12, d = .35){ if (calm || dead) return; shakeAmt = Math.max(shakeAmt, a); shakeDecay = a / d; invalidate(); }
  controls.addEventListener('change', invalidate);
  controls.addEventListener('start', () => { custom = true; controls.autoRotate = false; });
  controls.addEventListener('end', () => { faceAll(true); });

  function resize(){
    if (dead) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = w < 520 ? 44 : 38; camera.updateProjectionMatrix();
    setLimits();
    if (!custom && !flying) setHome(viewHome());
    layoutCardEl();
    invalidate();
  }

  function frame(t){
    raf = 0; if (dead) return;
    inFrame = true; again = false;
    t = performance.now();
    const real = Math.min(.25, (t - lastT) / 1000), dt = Math.min(.05, real); lastT = t; lastFrameAt = t;
    stepTweens(t);
    if (!frozenAt) for (const u of [...updaters]) u(dt, false);
    camera.position.sub(disp); disp.set(0, 0, 0);
    if (controls.autoRotate && t > autoUntil) controls.autoRotate = false;
    let moved = false;
    if (flying){ camera.position.copy(homePos); camera.lookAt(0, 0, 0); } else { moved = controls.update(real); homePos.copy(camera.position); }
    const k = 1 - Math.exp(-real * 3.4);
    fCur.lerp(fGoal, k); zCur += (zGoal - zCur) * k;
    let camBusy = fCur.distanceToSquared(fGoal) > 2e-5 || Math.abs(zGoal - zCur) > 1e-3;
    if (!camBusy){ fCur.copy(fGoal); zCur = zGoal; }
    if (zCur || fCur.lengthSq()){ camera.updateMatrixWorld(); camera.getWorldDirection(tmpV); disp.addScaledVector(tmpV, zCur * homePos.length()).add(fCur); }
    if (shakeAmt > 0){ disp.x += (Math.random() - .5) * shakeAmt; disp.y += (Math.random() - .5) * shakeAmt; shakeAmt = Math.max(0, shakeAmt - shakeDecay * real); camBusy = true; }
    camera.position.add(disp); camera.updateMatrixWorld();
    if (cardS.on) poseCard(cardS.k);
    if (!lost){ renderer.render(scene, camera); stat.frames++; }
    inFrame = false;
    if (again || moved || camBusy || tweens.size || updaters.size || controls.autoRotate){ raf = requestAnimationFrame(frame); rafAt = performance.now(); }
  }

  /* ---------- the board, frame and table ---------- */
  const goldMat = MAT('gold', () => std(0xf2c14e, .28, .85));
  const inkMat = MAT('ink', () => std(0x161a26, .6));
  const whiteMat = MAT('white', () => std(0xf6f1e6, .45, 0, {envMapIntensity:.6}));
  {
    const surf = new THREE.Mesh(keep(new THREE.PlaneGeometry(HALF * 2, HALF * 2)), keep(std(0xffffff, .66, 0, {map:boardTex, envMapIntensity:.2})));
    surf.rotation.x = -Math.PI / 2; surf.receiveShadow = true; scene.add(surf);
    const HO = HALF + FR, r = .34, sh = new THREE.Shape();
    sh.moveTo(-HO + r, -HO); sh.lineTo(HO - r, -HO); sh.quadraticCurveTo(HO, -HO, HO, -HO + r); sh.lineTo(HO, HO - r); sh.quadraticCurveTo(HO, HO, HO - r, HO);
    sh.lineTo(-HO + r, HO); sh.quadraticCurveTo(-HO, HO, -HO, HO - r); sh.lineTo(-HO, -HO + r); sh.quadraticCurveTo(-HO, -HO, -HO + r, -HO);
    const hh = HALF + .05, hole = new THREE.Path(); hole.moveTo(-hh, -hh); hole.lineTo(-hh, hh); hole.lineTo(hh, hh); hole.lineTo(hh, -hh); hole.closePath(); sh.holes.push(hole);
    const depth = .44, bt = .05;
    const fg = keep(new THREE.ExtrudeGeometry(sh, {depth, bevelEnabled:true, bevelThickness:bt, bevelSize:.05, bevelSegments:3, curveSegments:10}));
    const fm = keep(std(0xffffff, .36, 0, {map:woodTex('#4a2b0d', '#1c0f03'), envMapIntensity:.75}));
    const rim = new THREE.Mesh(fg, fm); rim.rotation.x = -Math.PI / 2; rim.position.y = TOP - depth - bt; rim.castShadow = rim.receiveShadow = true; scene.add(rim);
    const under = new THREE.Mesh(keep(new THREE.BoxGeometry(HALF * 2 + .2, .3, HALF * 2 + .2)), inkMat); under.position.y = -.16; scene.add(under);
    const L = (HALF + .15) * 2 + .05, ig = keep(new THREE.BoxGeometry(L, .014, .05));
    for (const [x, z, ry] of [[0, HALF + .15, 0], [0, -HALF - .15, 0], [HALF + .15, 0, Math.PI / 2], [-HALF - .15, 0, Math.PI / 2]]){ const b = new THREE.Mesh(ig, goldMat); b.position.set(x, TOP + .004, z); b.rotation.y = ry; scene.add(b); }
    const floor = new THREE.Mesh(keep(new THREE.CircleGeometry(70, 64)), keep(std(0x071022, .8, 0, {envMapIntensity:.25})));
    floor.rotation.x = -Math.PI / 2; floor.position.y = TOP - depth - bt * 2 - .005; floor.receiveShadow = true; scene.add(floor);
    for (const [a, b, op] of [[9.6, 9.72, .5], [12.4, 12.46, .25]]){
      const ring = new THREE.Mesh(keep(new THREE.RingGeometry(a, b, 96)), keep(new THREE.MeshBasicMaterial({color:0x2a4a86, transparent:true, opacity:op})));
      ring.rotation.x = -Math.PI / 2; ring.position.y = floor.position.y + .004; scene.add(ring);
    }
    // the bench cage on the Benched corner
    const cx = -HALF + C * .32 + C * .34, cz = HALF - C * .32 - C * .34, hs = C * .34 - .02, H = .78, per = 6;
    const barG = keep(new THREE.CylinderGeometry(.014, .014, H, 6)), barM = MAT('bar', () => std(0x2a3040, .35, .8));
    const bars = new THREE.InstancedMesh(barG, barM, per * 4), m4 = new THREE.Matrix4();
    let n = 0;
    for (let k = 0; k < per; k++){ const t = -hs + (2 * hs) * k / per;
      for (const [x, z] of [[cx + t, cz - hs], [cx + hs, cz + t], [cx - t, cz + hs], [cx - hs, cz - t]]){ m4.makeTranslation(x, H / 2, z); bars.setMatrixAt(n++, m4); } }
    bars.castShadow = true; scene.add(bars);
    const railG = keep(new THREE.BoxGeometry(hs * 2 + .04, .03, .04));
    for (const [x, z, ry] of [[cx, cz - hs, 0], [cx, cz + hs, 0], [cx - hs, cz, Math.PI / 2], [cx + hs, cz, Math.PI / 2]]){ const b = mesh(railG, barM, x, H, z); b.rotation.y = ry; scene.add(b); }
  }

  /* flat marks on the surface: hover, for-sale frame, mortgage, set glow */
  const flatG = G('flat', () => new THREE.PlaneGeometry(1, 1));
  function decal(mat, i, y, inset = 0){
    const c = cellOf(i), m = new THREE.Mesh(flatG, mat), tall = c.s === 'l' || c.s === 'r';
    m.rotation.set(-Math.PI / 2, 0, c.s === 'c' ? 0 : SIDE_ROT[c.s]);
    m.scale.set((tall ? c.d : c.w) - inset, (tall ? c.w : c.d) - inset, 1);
    m.position.set(c.x, y, c.z); m.renderOrder = 2; return m;
  }
  const hoverTex = (() => { const c = canvas(128, 128), x = c.getContext('2d'); x.fillStyle = 'rgba(255,255,255,.22)'; x.fillRect(0, 0, 128, 128); x.strokeStyle = 'rgba(255,255,255,.95)'; x.lineWidth = 10; x.strokeRect(5, 5, 118, 118); return ctex(c); })();
  const hoverM = keep(new THREE.MeshBasicMaterial({map:hoverTex, transparent:true, depthWrite:false}));
  const hover = new THREE.Mesh(flatG, hoverM); hover.rotation.x = -Math.PI / 2; hover.position.y = .012; hover.visible = false; hover.renderOrder = 3; scene.add(hover);
  const saleTex = (() => { const c = canvas(160, 256), x = c.getContext('2d'); x.fillStyle = 'rgba(242,193,78,.2)'; x.fillRect(0, 0, 160, 256); x.strokeStyle = '#ffd35a'; x.lineWidth = 16; x.strokeRect(8, 8, 144, 240); x.strokeStyle = '#fff6c9'; x.lineWidth = 3; x.strokeRect(17, 17, 126, 222); return ctex(c); })();
  const saleM = keep(new THREE.MeshBasicMaterial({map:saleTex, transparent:true, depthWrite:false}));
  const mortTex = (() => { const c = canvas(160, 256), x = c.getContext('2d'); x.fillStyle = 'rgba(10,16,34,.62)'; x.fillRect(0, 0, 160, 256);
    x.strokeStyle = 'rgba(255,255,255,.1)'; x.lineWidth = 5; for (let k = -260; k < 260; k += 22){ x.beginPath(); x.moveTo(k, 0); x.lineTo(k + 256, 256); x.stroke(); }
    x.translate(80, 150); x.rotate(-.5); x.fillStyle = 'rgba(180,20,10,.92)'; rrect(x, -84, -19, 168, 38, 6); x.fill();
    x.fillStyle = '#fff'; x.font = `800 22px ${F_BODY}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('MORTGAGED', 0, 1); return ctex(c); })();
  const mortM = keep(new THREE.MeshBasicMaterial({map:mortTex, transparent:true, depthWrite:false}));

  /* ---------- token models (origin on the ground, front toward +z) ---------- */
  const pmat = (hex, rough = .38, metal = .12, tag = '') => MAT('p' + hex + rough + metal + tag, () => std(new THREE.Color(hex), rough, metal, {envMapIntensity:.9}));
  function roundedBox(w, h, d, r, seg = 4){
    const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position, nm = g.attributes.normal, v = new THREE.Vector3(), q = new THREE.Vector3();
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    for (let i = 0; i < p.count; i++){
      v.fromBufferAttribute(p, i); q.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz)); v.sub(q);
      if (v.lengthSq() > 1e-12){ v.normalize(); p.setXYZ(i, q.x + v.x * r, q.y + v.y * r, q.z + v.z * r); nm.setXYZ(i, v.x, v.y, v.z); }
    }
    return g;
  }
  const BUILD = {
    ball(col){
      const g = new THREE.Group(), r = .2, spin = new THREE.Group(); spin.position.y = r + .03;
      spin.add(mesh(G('ball', () => new THREE.SphereGeometry(r, 28, 20)), MAT('ballM', () => std(0xe8701a, .6, 0, {envMapIntensity:.5}))));
      const t1 = G('seam', () => new THREE.TorusGeometry(r + .001, .009, 6, 40)), r2 = Math.sqrt(r * r - .105 * .105) + .001, t2 = G('seam2', () => new THREE.TorusGeometry(r2, .009, 6, 36));
      const a = mesh(t1, inkMat), b = mesh(t1, inkMat), c = mesh(t2, inkMat, .105), d = mesh(t2, inkMat, -.105);
      b.rotation.x = Math.PI / 2; c.rotation.y = d.rotation.y = Math.PI / 2; spin.add(a, b, c, d); g.add(spin); g.userData.roll = spin;
      const st = mesh(G('stand', () => new THREE.TorusGeometry(.11, .028, 8, 28)), pmat(col)); st.rotation.x = Math.PI / 2; st.position.y = .022; g.add(st);
      return g;
    },
    lanyard(col){
      const g = new THREE.Group(), card = new THREE.Group(); card.position.y = .02; card.rotation.x = -.13;
      card.add(mesh(G('badge', () => roundedBox(.28, .37, .036, .014, 3)), whiteMat, 0, .185, 0));
      card.add(mesh(G('badgeTop', () => new THREE.BoxGeometry(.284, .095, .042)), pmat(col), 0, .31, 0));
      const ph = new THREE.Mesh(G('photo', () => new THREE.PlaneGeometry(.125, .135)), MAT('faceM', () => new THREE.MeshBasicMaterial({map:faceTex, color:0xdddddd}))); ph.position.set(-.06, .175, .0186); card.add(ph);
      const ln = G('bline', () => new THREE.BoxGeometry(.09, .018, .004));
      for (const y of [.215, .175, .135]) card.add(mesh(ln, inkMat, .075, y, .0186));
      card.add(mesh(G('bcode', () => new THREE.BoxGeometry(.21, .028, .004)), inkMat, 0, .055, .0186));
      card.add(mesh(G('clip', () => new THREE.BoxGeometry(.07, .05, .05)), MAT('steel', () => std(0xb9c2d0, .3, .8)), 0, .385, 0));
      const strap = mesh(G('strap', () => new THREE.TorusGeometry(.1, .017, 8, 30)), pmat(col)); strap.position.set(0, .52, 0); strap.scale.set(.78, 1.25, 1.3); card.add(strap);
      g.add(card); return g;
    },
    coffee(col){
      const g = new THREE.Group();
      g.add(mesh(G('mug', () => new THREE.CylinderGeometry(.155, .13, .31, 30)), pmat(col, .28, .05), 0, .155, 0));
      const rim = mesh(G('mugRim', () => new THREE.TorusGeometry(.148, .014, 8, 30)), whiteMat, 0, .31, 0); rim.rotation.x = Math.PI / 2; g.add(rim);
      const cof = mesh(G('mugTop', () => new THREE.CircleGeometry(.14, 26)), MAT('coffeeM', () => std(0x3a1f0c, .2)), 0, .303, 0); cof.rotation.x = -Math.PI / 2; cof.castShadow = false; g.add(cof);
      const h = mesh(G('mugH', () => new THREE.TorusGeometry(.085, .025, 8, 18, Math.PI * 1.2)), pmat(col, .28, .05), .135, .16, 0); h.rotation.z = -Math.PI * .6; g.add(h);
      g.add(mesh(G('mugBand', () => new THREE.CylinderGeometry(.151, .141, .1, 30, 1, true)), whiteMat, 0, .14, 0));
      const steam = MAT('steam', () => new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.5, depthWrite:false})), sg = G('steamG', () => new THREE.SphereGeometry(.035, 10, 8));
      for (const [x, y, s] of [[-.04, .4, 1], [.03, .47, .8], [-.01, .54, .6]]){ const p = new THREE.Mesh(sg, steam); p.position.set(x, y, 0); p.scale.setScalar(s); g.add(p); }
      return g;
    },
    clock(col){
      const g = new THREE.Group(), cy = .27;
      const body = mesh(G('clockB', () => new THREE.CylinderGeometry(.2, .2, .12, 36)), pmat(col, .32, .3), 0, cy, 0); body.rotation.x = Math.PI / 2; g.add(body);
      const fg = G('clockF', () => new THREE.CircleGeometry(.168, 36));
      const f = mesh(fg, whiteMat, 0, cy, .0615); f.castShadow = false; g.add(f);
      const bk = mesh(fg, whiteMat, 0, cy, -.0615); bk.rotation.y = Math.PI; bk.castShadow = false; g.add(bk);
      const rg = G('clockR', () => new THREE.TorusGeometry(.186, .02, 8, 36));
      g.add(mesh(rg, goldMat, 0, cy, .055), mesh(rg, goldMat, 0, cy, -.055));
      const tg = G('tick', () => new THREE.BoxGeometry(.016, .04, .005));
      for (let k = 0; k < 12; k += 3){ const a = k / 12 * TAU, t = mesh(tg, inkMat, Math.sin(a) * .135, cy + Math.cos(a) * .135, .064); t.rotation.z = -a; g.add(t); }
      const hand = (len, w, rot) => { const p = new THREE.Group(); p.position.set(0, cy, .066); p.rotation.z = rot; p.add(mesh(G('hand' + len, () => new THREE.BoxGeometry(w, len, .006)), inkMat, 0, len / 2 - .012, 0)); g.add(p); };
      hand(.095, .024, 1.05); hand(.14, .017, -1.05);
      const hub = mesh(G('hub', () => new THREE.CylinderGeometry(.018, .018, .012, 12)), MAT('red', () => std(0xd23a22, .4)), 0, cy, .07); hub.rotation.x = Math.PI / 2; g.add(hub);
      g.add(mesh(G('btn', () => new THREE.CylinderGeometry(.035, .035, .06, 14)), goldMat, 0, cy + .225, 0));
      const ft = G('foot', () => new THREE.CylinderGeometry(.03, .04, .09, 10));
      for (const x of [-.11, .11]){ const q = mesh(ft, inkMat, x, .05, 0); q.rotation.z = x > 0 ? .5 : -.5; g.add(q); }
      return g;
    },
    sneaker(col){
      const g = new THREE.Group(), inn = new THREE.Group(); inn.rotation.y = -Math.PI / 2; inn.position.z = -.01;
      const up = G('snUp', () => { const s = new THREE.Shape(); s.moveTo(-.21, .05); s.lineTo(-.22, .27); s.quadraticCurveTo(-.22, .32, -.17, .32); s.lineTo(-.07, .31); s.quadraticCurveTo(-.03, .3, -.01, .255);
        s.lineTo(.1, .165); s.quadraticCurveTo(.2, .135, .235, .095); s.quadraticCurveTo(.25, .065, .24, .05); s.lineTo(-.21, .05);
        const e = new THREE.ExtrudeGeometry(s, {depth:.13, bevelEnabled:true, bevelThickness:.02, bevelSize:.02, bevelSegments:2, curveSegments:8}); e.translate(0, 0, -.065); return e; });
      inn.add(mesh(up, pmat(col, .5, 0)));
      const sole = G('snSole', () => { const s = new THREE.Shape(); s.moveTo(-.235, 0); s.lineTo(.245, 0); s.quadraticCurveTo(.275, .03, .255, .06); s.lineTo(-.235, .06); s.lineTo(-.235, 0);
        const e = new THREE.ExtrudeGeometry(s, {depth:.16, bevelEnabled:true, bevelThickness:.015, bevelSize:.012, bevelSegments:2, curveSegments:6}); e.translate(0, 0, -.08); return e; });
      inn.add(mesh(sole, whiteMat));
      const lg = G('lace', () => new THREE.BoxGeometry(.014, .014, .155));
      for (const t of [.15, .45, .75]){ const l = mesh(lg, whiteMat, lerp(-.01, .1, t) + .012, lerp(.255, .165, t) + .022, 0); l.rotation.z = -.68; inn.add(l); }
      const st = mesh(G('stripe', () => new THREE.BoxGeometry(.13, .032, .178)), whiteMat, -.085, .15, 0); st.rotation.z = .55; inn.add(st);
      inn.add(mesh(G('toe', () => new THREE.BoxGeometry(.06, .045, .176)), whiteMat, .2, .08, 0));
      const hl = mesh(G('collar', () => new THREE.CircleGeometry(.05, 16)), inkMat, -.13, .342, 0); hl.rotation.x = -Math.PI / 2; hl.scale.set(1.5, 1, 1); hl.castShadow = false; inn.add(hl);
      g.add(inn); g.userData.rest = 1.15; return g;
    },
    whistle(col){
      const g = new THREE.Group(), cy = .17, metal = pmat(col, .22, .78, 'm');
      const drum = mesh(G('whD', () => new THREE.CylinderGeometry(.15, .15, .135, 30)), metal, -.07, cy, 0); drum.rotation.x = Math.PI / 2; g.add(drum);
      g.add(mesh(G('whM', () => roundedBox(.27, .095, .135, .02, 2)), metal, .13, cy + .0575, 0));
      g.add(mesh(G('whS', () => new THREE.BoxGeometry(.075, .012, .095)), inkMat, .02, cy + .106, 0));
      const hg = G('whH', () => new THREE.CircleGeometry(.055, 18));
      const h1 = mesh(hg, inkMat, -.07, cy, .0685); h1.castShadow = false; const h2 = mesh(hg, inkMat, -.07, cy, -.0685); h2.rotation.y = Math.PI; h2.castShadow = false; g.add(h1, h2);
      const ring = mesh(G('whR', () => new THREE.TorusGeometry(.045, .012, 6, 18)), goldMat, -.2, cy + .13, 0); g.add(ring);
      g.add(mesh(G('whTip', () => new THREE.BoxGeometry(.03, .1, .14)), goldMat, .262, cy + .0575, 0));
      return g;
    }
  };
  const TS = 1.42;                 // tokens are built small and scaled up; slot sizes below are multiples of this
  let epoch = 0;                   // bumped on reset, so a move left over from the last game stops at its next hop
  const toks = [];                 // per pid: {root, body, shadow, ring, model, rest, gone, busy}
  const tpos = [], tjail = [];     // where each token logically is
  let curPid = -1;
  const blobM = MAT('blob', () => new THREE.MeshBasicMaterial({map:DOT, color:0x000000, transparent:true, opacity:.5, depthWrite:false}));
  const ringM = MAT('ring', () => new THREE.MeshBasicMaterial({color:0xffe08a, transparent:true, opacity:.95, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide}));
  const hitM = MAT('hit', () => new THREE.MeshBasicMaterial({visible:false}));
  function makeToken(p, pid){
    const root = new THREE.Group(), body = new THREE.Group();
    const base = mesh(G('base', () => new THREE.CylinderGeometry(.22, .245, .055, 40)), MAT('base' + p.color, () => std(new THREE.Color(p.color), .34, .2, {emissive:new THREE.Color(p.color), emissiveIntensity:.22})), 0, .0275, 0);
    base.receiveShadow = true;
    const lip = mesh(G('lip', () => new THREE.TorusGeometry(.232, .012, 6, 40)), whiteMat, 0, .012, 0); lip.rotation.x = Math.PI / 2;
    const model = (BUILD[p.token] || BUILD.ball)(p.color); model.position.y = .055;
    body.add(base, lip, model);
    const shadow = new THREE.Mesh(flatG, blobM); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .009; shadow.scale.setScalar(.82); shadow.renderOrder = 1;
    const ring = new THREE.Mesh(G('ringG', () => new THREE.RingGeometry(.275, .36, 44)), ringM); ring.rotation.x = -Math.PI / 2; ring.position.y = .012; ring.visible = false; ring.renderOrder = 3;
    const hit = new THREE.Mesh(G('hitG', () => new THREE.CylinderGeometry(.3, .3, .85, 10)), hitM); hit.position.y = .42;
    shadow.raycast = ring.raycast = () => {};
    root.add(shadow, ring, body, hit); root.userData.pid = pid;
    scene.add(root);
    return {root, body, shadow, ring, model, roll:model.userData.roll || null, rest:model.userData.rest || 0, gone:false, busy:false, gid:0, own:null};
  }
  const camYaw = () => Math.atan2(homePos.x, homePos.z);
  const restYaw = tk => camYaw() + tk.rest;
  function faceAll(anim){
    for (const tk of toks){
      if (!tk || tk.gone || tk.busy) continue;
      const y0 = tk.root.rotation.y, d = angDiff(y0, restYaw(tk));
      if (Math.abs(d) < .02) continue;
      if (anim && !calm) tween(.3, e => { if (!tk.busy) tk.root.rotation.y = y0 + d * e; }); else tk.root.rotation.y = y0 + d;
    }
    invalidate();
  }
  function groupOf(pid){ const g = []; for (let i = 0; i < toks.length; i++) if (toks[i] && !toks[i].gone && !toks[i].win && tpos[i] === tpos[pid] && (tpos[i] !== 10 || !!tjail[i] === !!tjail[pid])) g.push(i); return g; }
  function slotOf(pid){ const g = groupOf(pid), sl = slotsFor(tpos[pid], g.length, tpos[pid] === 10 && !!tjail[pid]); return sl[Math.max(0, g.indexOf(pid))]; }
  // everyone who is not mid-move shuffles to their spot
  function settleAll(anim, only){
    for (let pid = 0; pid < toks.length; pid++){
      const tk = toks[pid]; if (!tk || tk.gone || tk.busy || tk.win) continue;
      if (only != null && tpos[pid] !== only) continue;
      const s = slotOf(pid), r = tk.root, dx = s.x - r.position.x, dz = s.z - r.position.z;
      if (Math.hypot(dx, dz) < .012 && Math.abs(r.scale.x - s.s * TS) < .01){ continue; }
      const id = ++tk.gid;
      if (!anim || calm || lost){ r.position.set(s.x, 0, s.z); r.scale.setScalar(s.s * TS); tk.body.position.y = 0; continue; }
      const x0 = r.position.x, z0 = r.position.z, s0 = r.scale.x, far = Math.hypot(dx, dz) > .9;
      tween(far ? .34 : .22, (e, p) => { if (tk.gid !== id || tk.busy) return; r.position.x = x0 + dx * e; r.position.z = z0 + dz * e; r.scale.setScalar(lerp(s0, s.s * TS, e)); tk.body.position.y = Math.sin(Math.PI * p) * (far ? .9 : .1); });
    }
    invalidate();
  }
  function place(vp, vj, anim){
    if (dead) return;
    for (let i = 0; i < toks.length; i++){ if (toks[i] && !toks[i].busy){ tpos[i] = vp[i]; tjail[i] = !!vj[i]; } }
    settleAll(anim);
  }

  /* fades need private materials; made on first use */
  function ownMats(tk){
    if (tk.own) return tk.own;
    tk.own = [];
    tk.body.traverse(m => { if (m.isMesh){ m.material = m.material.clone(); tk.own.push(m.material); } });
    return tk.own;
  }
  function setAlpha(tk, a){ for (const m of ownMats(tk)){ const o0 = m.userData.o0 != null ? m.userData.o0 : (m.userData.o0 = m.opacity); m.transparent = a < 1 || o0 < 1; m.opacity = a * o0; } tk.shadow.visible = a > .5; }

  function hop(tk, to, dur, arc, {spin = false, yawTo = null} = {}){
    const r = tk.root, b = tk.body, x0 = r.position.x, z0 = r.position.z, dx = to.x - x0, dz = to.z - z0, dist = Math.hypot(dx, dz);
    const y0 = r.rotation.y, travel = dist > .02 ? Math.atan2(dx, dz) : y0, d1 = angDiff(y0, travel), s0 = r.scale.x, s1 = to.s ? to.s * TS : s0;
    const roll0 = tk.roll ? tk.roll.rotation.x : 0;
    tk.gid++;
    return tween(dur, (e, p) => {
      r.position.x = x0 + dx * p; r.position.z = z0 + dz * p;
      const h = 4 * p * (1 - p); b.position.y = arc * h;
      let yaw = y0 + d1 * Math.min(1, p * 3.2);
      if (yawTo != null){ const q = ease.io(clamp((p - .3) / .7, 0, 1)); yaw += angDiff(yaw, yawTo) * q + (spin ? TAU * ease.io(p) : 0); }
      r.rotation.y = yaw;
      const st = p < .18 ? lerp(.82, 1.15, p / .18) : p < .78 ? lerp(1.15, 1, (p - .18) / .6) : lerp(1, .8, (p - .78) / .22), w = 1 / Math.sqrt(st);
      b.scale.set(w, st, w); b.rotation.x = Math.sin(p * TAU) * .2;
      r.scale.setScalar(lerp(s0, s1, p));
      tk.shadow.scale.setScalar(.82 * (1 - .35 * h));
      if (tk.roll) tk.roll.rotation.x = roll0 + dist * p / .2;
    }, ease.lin).then(() => { r.rotation.y = yawTo != null ? yawTo : travel; });
  }
  function bounceBack(tk){
    const b = tk.body;
    return tween(.2, e => { const st = lerp(.8, 1, ease.back(e)), w = 1 / Math.sqrt(st); b.scale.set(w, st, w); b.rotation.x = 0; b.position.y = 0; tk.shadow.scale.setScalar(.82); }, ease.lin);
  }
  async function fadeMove(tk, pid){             // reduced motion: no travel, just a quick fade to the new spot
    await tween(.12, e => setAlpha(tk, 1 - e), ease.lin);
    const s = slotOf(pid); tk.root.position.set(s.x, 0, s.z); tk.root.scale.setScalar(s.s * TS); tk.root.rotation.y = restYaw(tk);
    await tween(.14, e => setAlpha(tk, e), ease.lin);
    setAlpha(tk, 1);
  }
  async function move(pid, from, n, to, {m = 1, quick = false, onGo = null} = {}){
    const tk = toks[pid]; if (dead || !tk) return;
    const dir = Math.sign(n) || 1, cnt = Math.abs(n), wasJail = !!tjail[pid];
    tpos[pid] = to; tjail[pid] = false;
    const passes = dir > 0 && cnt > 0 && to < from;
    if (!m || cnt === 0 || lost || document.hidden || tk.gone){ settleAll(false); if (passes && onGo) onGo(); return; }
    tk.busy = true; settleAll(true, from);
    try {
      if (calm){ await fadeMove(tk, pid); settleAll(false, to); if (passes && onGo) onGo(); return; }
      if (m <= .3){                                // turbo: one skim to the spot
        const s = slotOf(pid); settleAll(true, to);
        await hop(tk, s, .2, cnt > 3 ? .7 : .35, {yawTo:restYaw(tk)}); snd('tap'); if (passes && onGo) onGo();
        tk.body.scale.set(1, 1, 1); tk.body.rotation.x = 0; tk.body.position.y = 0;
        return;
      }
      const durs = []; let sum = 0;
      for (let k = 1; k <= cnt; k++){ const d = (quick ? .15 : .25) * Math.max(.45, 1 - .11 * Math.max(0, k - 3)); durs.push(d); sum += d; }   // the first few hops are full ones, then it picks up speed
      const cap = quick ? 1.5 : 1.95, f = sum > cap ? cap / sum : 1;
      const ep = epoch;
      for (let k = 1; k <= cnt; k++){
        if (dead || ep !== epoch) return;
        const idx = mod40(from + dir * k), last = k === cnt;
        let target = lanePt(idx);
        if (last){ settleAll(true, to); target = slotOf(pid); }
        const d = Math.max(.05, durs[k - 1] * f) * m, tiny = d < .09 * m;
        const arc = k === 1 && wasJail ? 1.05 : last ? .52 : tiny ? .2 : .36;
        focusOn(target);
        await hop(tk, target, last ? d * 1.25 : d, arc, last ? {spin:cnt > 1 && !tiny, yawTo:restYaw(tk)} : {});
        if (!tiny || k % 2 === 0 || last) snd('tap');
        if (!tiny || last) puff(target, last ? 9 : 5);
        if (idx === 0 && dir > 0 && onGo) onGo();
      }
      await bounceBack(tk);
    } finally { tk.busy = false; }
  }
  async function toJail(pid, m = 1){
    const tk = toks[pid]; if (dead || !tk) return;
    const from = tpos[pid]; tpos[pid] = 10; tjail[pid] = true;
    if (!m || lost || document.hidden || tk.gone){ settleAll(false); return; }
    tk.busy = true; settleAll(true, from);
    try {
      if (calm){ await fadeMove(tk, pid); settleAll(false, 10); return; }
      settleAll(true, 10);
      const s = slotOf(pid), r = tk.root, b = tk.body, x0 = r.position.x, z0 = r.position.z, y0 = r.rotation.y, s0 = r.scale.x, endYaw = restYaw(tk), dist = Math.hypot(s.x - x0, s.z - z0);
      focusOn(s, .1); snd('whoosh'); tk.gid++;
      await tween(Math.max(.28, (.55 + dist * .035) * m), (e, p) => {
        r.position.x = lerp(x0, s.x, e); r.position.z = lerp(z0, s.z, e); b.position.y = Math.sin(Math.PI * p) * (1.9 + dist * .08);
        r.rotation.y = y0 + angDiff(y0, endYaw) * e + TAU * 2 * e; b.rotation.z = Math.sin(Math.PI * p) * .5; r.scale.setScalar(lerp(s0, s.s * TS, e));
        tk.shadow.scale.setScalar(.82 * (1 - .4 * Math.sin(Math.PI * p)));
      }, ease.io);
      r.rotation.y = endYaw; b.rotation.z = 0; b.scale.set(1.2, .7, 1.2);
      snd('thud'); puff(s, 16, .9); shake(.07, .25); burst({pos:new THREE.Vector3(s.x, .3, s.z), count:18, color:0xff7a6b, speed:1.6, up:2.2, size:.12, life:.7});
      await bounceBack(tk);
    } finally { tk.busy = false; }
  }
  // out of the cell without a roll (paid, or used a card): hop over the bars to the visiting strip
  async function leaveJail(pid, m = 1){
    const tk = toks[pid]; if (dead || !tk) return;
    tjail[pid] = false;
    if (!m || calm || lost || tk.gone){ settleAll(false); return; }
    tk.busy = true; settleAll(true, 10);
    try { await hop(tk, slotOf(pid), .34 * Math.max(m, .4), 1.05, {yawTo:restYaw(tk)}); snd('tap'); puff(slotOf(pid), 6); await bounceBack(tk); }
    finally { tk.busy = false; settleAll(true, 10); }
  }

  /* ---------- particles ---------- */
  function burst({pos, count = 30, color = 0xffffff, colors = null, speed = 3, up = 2, gravity = 7, size = .14, life = 1, spread = 1, additive = true, floorY = .03}){
    if (calm || dead || lost) return;
    const g = new THREE.BufferGeometry(), P = new Float32Array(count * 3), V = new Float32Array(count * 3);
    for (let i = 0; i < count; i++){
      P[i * 3] = pos.x + (Math.random() - .5) * .2 * spread; P[i * 3 + 1] = pos.y + Math.random() * .15; P[i * 3 + 2] = pos.z + (Math.random() - .5) * .2 * spread;
      const a = Math.random() * TAU, s = speed * (.35 + Math.random() * .8);
      V[i * 3] = Math.cos(a) * s; V[i * 3 + 1] = up * (.3 + Math.random()); V[i * 3 + 2] = Math.sin(a) * s;
    }
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    if (colors){ const Cc = new Float32Array(count * 3), c = new THREE.Color(); for (let i = 0; i < count; i++){ c.set(colors[i % colors.length]); Cc[i * 3] = c.r; Cc[i * 3 + 1] = c.g; Cc[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(Cc, 3)); }
    const m = new THREE.PointsMaterial({color:colors ? 0xffffff : color, vertexColors:!!colors, size, map:DOT, transparent:true, depthWrite:false, blending:additive ? THREE.AdditiveBlending : THREE.NormalBlending});
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
    let t = 0;
    updaters.add(function u(dt, kill){
      t += dt;
      if (kill || t >= life){ scene.remove(pts); g.dispose(); m.dispose(); updaters.delete(u); return; }
      for (let i = 0; i < count; i++){
        V[i * 3 + 1] -= gravity * dt; V[i * 3] *= .985; V[i * 3 + 2] *= .985;
        P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
        if (P[i * 3 + 1] < floorY && gravity > 0){ P[i * 3 + 1] = floorY; V[i * 3 + 1] *= -.3; }
      }
      g.attributes.position.needsUpdate = true;
      m.opacity = Math.max(0, 1 - t / life);
    });
    invalidate();
  }
  const puff = (p, n = 6, sp = .55) => burst({pos:new THREE.Vector3(p.x, .04, p.z), count:n, color:0xd9cdb8, speed:sp, up:.5, gravity:1.2, size:.2, life:.42, additive:false, spread:1.6});
  const tokPos = (pid, y = .5) => { const tk = toks[pid]; return tk ? new THREE.Vector3(tk.root.position.x, tk.root.position.y + y * tk.root.scale.x, tk.root.position.z) : new THREE.Vector3(); };
  const spPos = (i, y = .1) => { const c = cellOf(i); return new THREE.Vector3(c.x, y, c.z); };
  function burstSpace(i, color, n = 22){ burst({pos:spPos(i, .15), count:n, color:new THREE.Color(color), speed:2, up:2.8, size:.15, life:.9}); }
  function shock(pos, color, max = 4, dur = .5){
    if (calm || dead || lost) return;
    const r = new THREE.Mesh(G('shockG', () => new THREE.RingGeometry(.3, .4, 48)), new THREE.MeshBasicMaterial({color, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide}));
    r.rotation.x = -Math.PI / 2; r.position.set(pos.x, .03, pos.z); r.renderOrder = 4; scene.add(r);
    tween(dur, p => { r.scale.setScalar(1 + p * max); r.material.opacity = 1 - p; }, ease.out).then(() => { scene.remove(r); r.material.dispose(); });
  }
  function flash(pos, color, intensity = 60, dur = .4){
    if (calm || dead || lost) return;
    const l = new THREE.PointLight(color, intensity, 9, 1.5); l.position.set(pos.x, 1.3, pos.z); scene.add(l);
    tween(dur, p => { l.intensity = intensity * (1 - p); }, ease.out).then(() => scene.remove(l));
  }

  /* ---------- coins ---------- */
  const coinG = G('coin', () => new THREE.CylinderGeometry(.085, .085, .024, 14)), coinPool = [];
  function coin(){ const c = coinPool.pop() || mesh(coinG, goldMat); c.visible = false; scene.add(c); return c; }
  const coinDone = c => { scene.remove(c); coinPool.push(c); };
  function coins(from, to, n = 6, m = 1){
    if (dead || calm || !m || lost || document.hidden) return Promise.resolve();
    n = clamp(Math.round(n), 2, 12);
    const dur = .5 * Math.max(m, .4), dist = Math.hypot(to.x - from.x, to.z - from.z), jobs = [];
    for (let k = 0; k < n; k++){
      const c = coin(), jx = (Math.random() - .5) * .35, jz = (Math.random() - .5) * .35, arc = 1.1 + dist * .12 + Math.random() * .5, sp = 6 + Math.random() * 6;
      jobs.push(pause(k * .05 * Math.max(m, .4)).then(() => { c.visible = true; return tween(dur, (e, p) => {
        c.position.set(lerp(from.x + jx, to.x + jx * .3, e), lerp(from.y, to.y, e) + Math.sin(Math.PI * p) * arc, lerp(from.z + jz, to.z + jz * .3, e)); c.rotation.x = p * sp; c.rotation.z = p * sp * .6;
      }); }).then(() => coinDone(c)));
    }
    return Promise.all(jobs).then(() => { snd('coin'); burst({pos:to, count:10, color:0xffd35a, speed:1.2, up:1.6, size:.1, life:.5}); });
  }
  function fountain(pos, n = 9){
    if (dead || calm || lost) return;
    burst({pos, count:26, color:0xffd35a, speed:1.8, up:4.2, size:.13, life:1});
    for (let k = 0; k < n; k++){
      const c = coin(); c.visible = true; c.position.copy(pos);
      const a = Math.random() * TAU, s = .8 + Math.random() * 1.4, v = new THREE.Vector3(Math.cos(a) * s, 3.2 + Math.random() * 2.2, Math.sin(a) * s), w = 6 + Math.random() * 8;
      let t = 0;
      updaters.add(function u(dt, kill){
        t += dt; v.y -= 11 * dt; c.position.addScaledVector(v, dt); c.rotation.x += w * dt; c.rotation.z += w * .5 * dt;
        if (c.position.y < .05 && v.y < 0){ c.position.y = .05; v.y *= -.35; v.x *= .5; v.z *= .5; }
        if (t > .95) c.scale.setScalar(Math.max(.01, 1 - (t - .95) / .25));
        if (kill || t > 1.2){ c.scale.setScalar(1); coinDone(c); updaters.delete(u); }
      });
    }
    invalidate();
  }

  /* ---------- floating money (DOM, pinned to a spot on the board) ---------- */
  const fstack = new Map();
  function screenOf(v){ const p = tmpV2.copy(v).project(camera); return {x:(p.x + 1) / 2 * host.clientWidth, y:(1 - p.y) / 2 * host.clientHeight}; }
  function float(v, text, color){
    if (dead || !floatLayer) return;
    const p = screenOf(v), key = Math.round(p.x / 30) + ':' + Math.round(p.y / 30), n = fstack.get(key) || 0;
    fstack.set(key, n + 1); setTimeout(() => fstack.set(key, Math.max(0, (fstack.get(key) || 1) - 1)), 700);
    const d = document.createElement('div'); d.className = 'fl3'; d.textContent = text; d.style.color = color || '#f2c14e';
    d.style.left = clamp(p.x, 30, host.clientWidth - 30).toFixed(0) + 'px'; d.style.top = clamp(p.y - n * 24, 24, host.clientHeight - 10).toFixed(0) + 'px';
    floatLayer.appendChild(d); setTimeout(() => d.remove(), 1500);
  }
  const floatTok = (pid, text, color) => { if (toks[pid]) float(tokPos(pid, .95), text, color); };
  const floatSp = (i, text, color) => float(spPos(i, .5), text, color);

  /* ---------- dice ---------- */
  const DIE = .46;
  const FACE = [2, 5, 1, 6, 3, 4];                // BoxGeometry material order: +x -x +y -y +z -z
  const NORM = {1:new THREE.Vector3(0, 1, 0), 6:new THREE.Vector3(0, -1, 0), 2:new THREE.Vector3(1, 0, 0), 5:new THREE.Vector3(-1, 0, 0), 3:new THREE.Vector3(0, 0, 1), 4:new THREE.Vector3(0, 0, -1)};
  const PIP = {1:[4], 2:[0, 8], 3:[0, 4, 8], 4:[0, 2, 6, 8], 5:[0, 2, 4, 6, 8], 6:[0, 2, 3, 5, 6, 8]};
  const dieMats = FACE.map(v => { const c = canvas(128, 128), x = c.getContext('2d'); const g = x.createRadialGradient(64, 50, 10, 64, 64, 96); g.addColorStop(0, '#fffdf6'); g.addColorStop(1, '#ebe3d2'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    for (const k of PIP[v]){ x.fillStyle = v === 1 ? '#e2541b' : '#1a1f2e'; x.beginPath(); x.arc(30 + (k % 3) * 34, 30 + Math.floor(k / 3) * 34, v === 1 ? 17 : 12.5, 0, TAU); x.fill(); }
    return keep(std(0xffffff, .28, 0, {map:ctex(c), envMapIntensity:.7, emissive:new THREE.Color(0xffc24a), emissiveIntensity:0})); });
  const dieG = keep(roundedBox(DIE, DIE, DIE, .075, 8));
  const dice = [0, 1].map(k => { const d = new THREE.Mesh(dieG, dieMats); d.castShadow = true; d.visible = false; d.userData.rest = new THREE.Vector3(k ? .5 : -.5, DIE / 2, k ? 3.3 : 3); scene.add(d); return d; });
  const UP = new THREE.Vector3(0, 1, 0), qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
  let diceVal = [0, 0], rolling = false;
  function dieQuat(v, yaw, out){ out.setFromUnitVectors(NORM[v], UP); qB.setFromAxisAngle(UP, yaw); return out.premultiply(qB); }
  function faceUp(d){ let best = 0, by = -2; for (const v of [1, 2, 3, 4, 5, 6]){ const y = tmpV2.copy(NORM[v]).applyQuaternion(d.quaternion).y; if (y > by){ by = y; best = v; } } return best; }
  function setDice(d, force){
    if (dead || rolling) return;
    if (!d || !d[0] || !d[1]){ if (diceVal[0] || !dice[0].visible){ diceVal = [0, 0]; dice.forEach((x, k) => { x.visible = true; x.position.copy(x.userData.rest); dieQuat(k ? 2 : 5, k ? -.5 : .35, x.quaternion); }); invalidate(); } return; }   // nobody has rolled yet: the dice just sit in the tray
    if (!force && d[0] === diceVal[0] && d[1] === diceVal[1] && dice[0].visible) return;
    diceVal = [d[0], d[1]];
    dice.forEach((x, k) => { x.visible = true; x.position.copy(x.userData.rest); dieQuat(d[k], k ? -.5 : .35, x.quaternion); });
    invalidate();
  }
  const bounceY = p => p < .42 ? 1 - (p / .42) * (p / .42) : p < .68 ? .26 * 4 * ((p - .42) / .26) * (1 - (p - .42) / .26) : p < .85 ? .09 * 4 * ((p - .68) / .17) * (1 - (p - .68) / .17) : .02 * 4 * ((p - .85) / .15) * (1 - (p - .85) / .15);
  async function roll(d, m = 1){
    if (dead) return;
    if (!m || lost || calm || document.hidden){ rolling = false; setDice(d, true); if (calm && m && !lost) await pause(.25 * m); return; }
    rolling = true; diceVal = [d[0], d[1]];
    const dur = m <= .3 ? .26 : .98 * m, jobs = [];
    try {
      dice.forEach((die, k) => {
        const rest = die.userData.rest.clone(); rest.x += (Math.random() - .5) * .34; rest.z += (Math.random() - .5) * .3;
        const start = new THREE.Vector3(rest.x + 4.6 + k * .5, 0, rest.z + 3.4 - k * .9), dirv = rest.clone().sub(start).setY(0).normalize();
        const axis = new THREE.Vector3(dirv.z, 0, -dirv.x).add(new THREE.Vector3((Math.random() - .5) * .5, (Math.random() - .5) * .5, (Math.random() - .5) * .5)).normalize();
        const qT = dieQuat(d[k], (Math.random() - .5) * 1.6, new THREE.Quaternion()), turns = (4.5 + Math.random() * 2.5) * Math.PI, h0 = 2.3 + k * .3, hit = [.42, .68, .85]; let hi = 0;
        die.visible = true;
        jobs.push(pause(k * .05 * m).then(() => tween(dur, (e, p) => {
          const hp = 1 - Math.pow(1 - p, 2.3);
          die.position.set(lerp(start.x, rest.x, hp), DIE / 2 + h0 * bounceY(p), lerp(start.z, rest.z, hp));
          qA.setFromAxisAngle(axis, -turns * Math.pow(1 - p, 2)); die.quaternion.copy(qT).premultiply(qA);
          while (hi < 3 && p >= hit[hi]){ hi++; snd('dice'); }
        }, ease.lin)).then(() => { die.quaternion.copy(qT); die.position.set(rest.x, DIE / 2, rest.z); }));
      });
      await Promise.all(jobs);
    } finally { rolling = false; }
    if (d[0] === d[1]){
      const c = dice[0].position.clone().add(dice[1].position).multiplyScalar(.5);
      flash(c, 0xffd35a, 90, .5); shock(c, 0xffd35a, 5, .55); burst({pos:c.clone().setY(.4), count:26, color:0xffd35a, speed:2.2, up:2.6, size:.13, life:.8});
      tween(.5 * Math.max(m, .4), (e, p) => { const s = Math.sin(Math.PI * p); dieMats.forEach(mt => { mt.emissiveIntensity = s * .9; }); dice.forEach(x => { x.position.y = DIE / 2 + s * .35; }); }, ease.lin).then(() => dieMats.forEach(mt => { mt.emissiveIntensity = 0; }));
    }
  }
  const diceFaces = () => dice.map(d => d.visible ? faceUp(d) : 0);   // read back from the meshes, for tests

  /* ---------- decks + the drawn card ---------- */
  const DECK = {scout:{x:-3, col:'#ff8a2b', deep:'#a34c0c', icon:'phone', name:'SCOUT CALL'}, fridge:{x:3, col:'#4fb3ff', deep:'#14508a', icon:'fridge', name:'BREAK ROOM FRIDGE'}};
  const CW = 1.86, CD = 1.26;
  const edgeM = MAT('edge', () => std(0xe9e2d2, .7));
  for (const k of ['scout', 'fridge']){
    const dk = DECK[k], c = canvas(384, 256), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 384, 256); g.addColorStop(0, dk.col); g.addColorStop(1, dk.deep); x.fillStyle = g; x.fillRect(0, 0, 384, 256);
    x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 6; rrect(x, 14, 14, 356, 228, 16); x.stroke();
    drawIcon(x, icons[dk.icon], 192, 104, 120, '#fff', 1.7);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `800 ${k === 'scout' ? 34 : 27}px ${F_BODY}`; x.fillText(dk.name, 192, 204);
    dk.back = keep(std(0xffffff, .5, 0, {map:ctex(c), envMapIntensity:.4}));
    const f = canvas(384, 256), y = f.getContext('2d'); y.fillStyle = '#fbf8f2'; y.fillRect(0, 0, 384, 256); y.fillStyle = dk.col; y.fillRect(0, 0, 384, 26);
    dk.front = keep(std(0xffffff, .55, 0, {map:ctex(f), envMapIntensity:.3}));
    const stack = new THREE.Mesh(G('deckG', () => new THREE.BoxGeometry(CW, .16, CD)), [edgeM, edgeM, dk.back, edgeM, edgeM, edgeM]);
    stack.position.set(dk.x, .081, .1); stack.rotation.y = dk.x < 0 ? .05 : -.04; stack.castShadow = stack.receiveShadow = true; scene.add(stack);
    dk.pos = new THREE.Vector3(dk.x, .175, .1); dk.yaw = stack.rotation.y;
  }
  const cardMesh = new THREE.Mesh(G('cardG', () => new THREE.BoxGeometry(CW, .012, CD)), [edgeM, edgeM, DECK.scout.back, DECK.scout.front, edgeM, edgeM]);
  cardMesh.visible = false; cardMesh.castShadow = true; scene.add(cardMesh);
  const cardS = {on:false, k:0, deck:'scout', skip:null, turbo:0};
  const qDeck = new THREE.Quaternion(), qShow = new THREE.Quaternion(), qAlign = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  function cardFrac(){ const w = host.clientWidth || 600; return clamp(400 / w, .36, .82); }
  function layoutCardEl(){
    if (!cardEl) return;
    const w = host.clientWidth || 600, cw = Math.round(cardFrac() * w);
    cardEl.style.width = cw + 'px'; cardEl.style.minHeight = Math.round(cw * CD / CW) + 'px'; cardEl.style.fontSize = Math.max(12, cw / 17.5).toFixed(1) + 'px';
  }
  function poseCard(k){
    const dk = DECK[cardS.deck], dist = 7, vh = 2 * dist * Math.tan(camera.fov * Math.PI / 360), sc = cardFrac() * vh * camera.aspect / CW;
    camera.getWorldDirection(tmpV); const show = tmpV2.copy(camera.position).addScaledVector(tmpV, dist);
    cardMesh.position.lerpVectors(dk.pos, show, k); cardMesh.position.y += Math.sin(Math.PI * k) * 1.2;
    qDeck.setFromAxisAngle(UP, dk.yaw); qShow.copy(camera.quaternion).multiply(qAlign);
    cardMesh.quaternion.slerpQuaternions(qDeck, qShow, ease.io(k)); cardMesh.scale.setScalar(lerp(1, sc, k));
  }
  function hideCard(){ cardS.on = false; cardS.turbo = 0; cardMesh.visible = false; if (cardEl){ cardEl.classList.remove('on'); cardEl.hidden = true; } if (cardS.skip) cardS.skip(); invalidate(); }
  async function card(deck, title, text, m = 1){
    if (dead || !DECK[deck]) return;
    if (!m || lost || document.hidden){ hideCard(); return; }
    const dk = DECK[deck], hold = clamp(1.2 + text.length * .028, 1.7, 4.4) * Math.max(m, .28) * 1000;
    if (cardEl){
      cardEl.className = 'v3-card ' + deck; cardEl.innerHTML = '';
      const a = document.createElement('small'), b = document.createElement('p'); a.textContent = title; b.textContent = text; cardEl.append(a, b); layoutCardEl();
    }
    const wait = () => new Promise(res => { const t = setTimeout(done, hold); function done(){ clearTimeout(t); cardS.skip = null; res(); } cardS.skip = done; });
    if (calm){ if (cardEl){ cardEl.hidden = false; cardEl.classList.add('on'); } await wait(); hideCard(); return; }
    if (m <= .3){                                 // turbo: no flight. The card pops up, the game carries on, and it clears itself a moment later
      if (cardEl){ cardEl.hidden = false; cardEl.classList.add('on'); }
      const id = cardS.turbo = (cardS.turbo || 0) + 1; setTimeout(() => { if (cardS.turbo === id && !cardS.on && !dead && cardEl){ cardEl.classList.remove('on'); cardEl.hidden = true; } }, 2400);
      await pause(.3); return;
    }
    cardS.deck = deck; cardS.k = 0; cardS.on = true;
    cardMesh.material = [edgeM, edgeM, dk.back, dk.front, edgeM, edgeM]; cardMesh.visible = true; poseCard(0);
    snd('card');
    await tween(.55 * Math.max(m, .4), e => { cardS.k = e; }, ease.lin);
    if (dead || !cardS.on) return;
    cardS.k = 1; if (cardEl){ cardEl.hidden = false; void cardEl.offsetWidth; cardEl.classList.add('on'); }
    await wait();
    if (dead || !cardS.on) return;
    if (cardEl){ cardEl.classList.remove('on'); cardEl.hidden = true; }
    await tween(.32 * Math.max(m, .4), e => { cardS.k = 1 - e; }, ease.lin);
    cardS.on = false; cardMesh.visible = false; invalidate();
  }

  /* ---------- ownership, buildings, mortgages ---------- */
  const own = [], bld = [], mort = [];
  const barG = G('ownBar', () => roundedBox(.86, .08, .25, .03, 2));
  function popIn(obj, anim, delay = 0, drop = .4){
    const id = obj.userData.aid = (obj.userData.aid || 0) + 1, y = obj.userData.y || 0; obj.userData.on = true;
    if (!anim){ obj.visible = true; obj.scale.copy(obj.userData.s); obj.position.y = y; return; }
    obj.visible = true; obj.scale.setScalar(.001);
    pause(delay).then(() => tween(.42, (e, p) => { if (obj.userData.aid !== id) return; obj.scale.copy(obj.userData.s).multiplyScalar(Math.max(.001, ease.back(Math.min(1, p * 1.6)))); obj.position.y = y + drop * (1 - ease.bounce(p)); }, ease.lin));
  }
  function popOut(obj, anim, delay = 0){
    const id = obj.userData.aid = (obj.userData.aid || 0) + 1; obj.userData.on = false;
    if (!anim){ obj.visible = false; return; }
    pause(delay).then(() => tween(.22, e => { if (obj.userData.aid !== id) return; obj.scale.copy(obj.userData.s).multiplyScalar(Math.max(.001, 1 - e)); }, ease.in)).then(() => { if (obj.userData.aid === id) obj.visible = false; });
  }
  function setOwner(i, pid, players, anim){
    const cur = own[i] ? own[i].pid : -1; if (cur === pid) return;
    let e = own[i];
    if (!e){
      const c = cellOf(i), ou = OUT[c.s], m = mesh(barG, goldMat), d = HALF + .36;
      m.position.set(ou[0] ? ou[0] * d : c.x, TOP + .04, ou[1] ? ou[1] * d : c.z); m.rotation.y = ou[0] ? Math.PI / 2 : 0;
      m.userData.s = new THREE.Vector3(1, 1, 1); m.userData.y = TOP + .04; m.visible = false; scene.add(m);
      e = own[i] = {m, pid:-1};
    }
    e.pid = pid;
    if (pid < 0 || !players[pid]){ popOut(e.m, anim); return; }
    const col = players[pid].color;
    e.m.material = MAT('own' + col, () => std(new THREE.Color(col), .35, .15, {emissive:new THREE.Color(col), emissiveIntensity:.35}));
    popIn(e.m, anim, 0, .3);
  }
  function setMort(i, on, anim){
    if (!mort[i]){ if (!on) return; const d = decal(mortM, i, .007, .04); d.userData.s = d.scale.clone(); d.userData.y = .007; d.visible = false; scene.add(d); mort[i] = {m:d, on:false}; }
    const e = mort[i]; if (e.on === on) return; e.on = on;
    if (on) popIn(e.m, anim, 0, 0); else popOut(e.m, anim);
  }
  const wallG = G('houseW', () => { const g = new THREE.BoxGeometry(1, .58, 1); g.translate(0, .29, 0); return g; });
  const roofG = G('houseR', () => { const s = new THREE.Shape(); s.moveTo(-.58, 0); s.lineTo(.58, 0); s.lineTo(0, .46); s.lineTo(-.58, 0); const g = new THREE.ExtrudeGeometry(s, {depth:1.12, bevelEnabled:false}); g.translate(0, .58, -.56); return g; });
  function mkHouse(hotel){
    const g = new THREE.Group();
    g.add(mesh(wallG, hotel ? MAT('hotelW', () => std(0xff4a3a, .42, 0, {emissive:new THREE.Color(0x7a0e06), emissiveIntensity:.25})) : MAT('houseWm', () => std(0x2fc45e, .45, 0, {emissive:new THREE.Color(0x0b4a1f), emissiveIntensity:.25}))),
      mesh(roofG, hotel ? MAT('hotelR', () => std(0xa3150b, .5)) : MAT('houseRm', () => std(0x147a35, .5))));
    g.userData.s = hotel ? new THREE.Vector3(.52, .33, .3) : new THREE.Vector3(.185, .2, .24); g.userData.y = .001; g.visible = false; scene.add(g); return g;
  }
  function bandPos(i, k, n){
    const c = cellOf(i), ou = OUT[c.s], a = [ou[1], ou[0]], off = (k - (n - 1) / 2) * .236, d = C / 2 - BAND / 2;
    return {x:c.x - ou[0] * d + a[0] * off, z:c.z - ou[1] * d + a[1] * off, yaw:c.s === 'b' ? 0 : c.s === 'l' ? -Math.PI / 2 : c.s === 't' ? Math.PI : Math.PI / 2};
  }
  function setBld(i, n, anim){
    const e = bld[i] || (bld[i] = {n:0, houses:[], hotel:null}); if (e.n === n) return;
    const old = e.n, want = n === 5 ? 0 : n; e.n = n;
    for (let k = 0; k < 4; k++){
      let h = e.houses[k];
      if (k < want){
        const p = bandPos(i, k, want);
        if (!h) h = e.houses[k] = mkHouse(false);
        h.rotation.y = p.yaw;
        if (!h.userData.on){ h.position.set(p.x, .001, p.z); popIn(h, anim, k * .07 + (old === 5 ? .16 : 0)); }
        else if (anim){ const x0 = h.position.x, z0 = h.position.z; tween(.22, t => { h.position.x = lerp(x0, p.x, t); h.position.z = lerp(z0, p.z, t); }); }
        else h.position.set(p.x, .001, p.z);
      } else if (h && h.userData.on) popOut(h, anim, k * .04);
    }
    if (n === 5){
      if (!e.hotel) e.hotel = mkHouse(true);
      const p = bandPos(i, 0, 1); e.hotel.position.set(p.x, .001, p.z); e.hotel.rotation.y = p.yaw; popIn(e.hotel, anim, old ? .22 : 0, .7);
    } else if (e.hotel && e.hotel.userData.on) popOut(e.hotel, anim);
  }

  /* jackpot plate on the Break Room corner, for-sale sign */
  const jackCv = canvas(320, 112), jackTex = ctex(jackCv);
  const jack = new THREE.Mesh(flatG, keep(new THREE.MeshBasicMaterial({map:jackTex, transparent:true, depthWrite:false})));
  jack.rotation.x = -Math.PI / 2; jack.scale.set(1.42, .5, 1); jack.position.set(-K, .008, -K + .44); jack.visible = false; jack.renderOrder = 2; scene.add(jack);
  let jackKey = null;
  function setJackpot(v){
    const key = v == null ? null : String(v); if (key === jackKey) return; const first = jackKey == null; jackKey = key;
    if (v == null){ jack.visible = false; return; }
    const x = jackCv.getContext('2d'); x.clearRect(0, 0, 320, 112);
    x.fillStyle = '#070b13'; rrect(x, 3, 3, 314, 106, 16); x.fill(); x.strokeStyle = '#f2c14e'; x.lineWidth = 5; rrect(x, 5, 5, 310, 102, 15); x.stroke();
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#8fa3cc'; x.font = `800 24px ${F_BODY}`; x.fillText('JACKPOT', 160, 28);
    x.fillStyle = '#ffb547'; x.font = `600 68px ${F_LED}`; x.fillText('$' + Math.round(v).toLocaleString('en-CA'), 160, 74);
    jackTex.needsUpdate = true; jack.visible = true;
    if (!first && !calm) tween(.35, (e, p) => { jack.scale.set(1.42 * (1 + .18 * Math.sin(Math.PI * p)), .5 * (1 + .18 * Math.sin(Math.PI * p)), 1); }, ease.lin);
  }
  const saleFrame = new THREE.Mesh(flatG, saleM); saleFrame.visible = false; saleFrame.renderOrder = 3; scene.add(saleFrame);
  const signCv = canvas(384, 208), signTex = ctex(signCv);
  const sign = new THREE.Sprite(keep(new THREE.SpriteMaterial({map:signTex, transparent:true, depthWrite:false}))); sign.scale.set(1.85, 1, 1); sign.center.set(.5, 0); sign.visible = false; sign.renderOrder = 6; scene.add(sign);
  const post = new THREE.Mesh(G('post', () => new THREE.CylinderGeometry(.022, .022, 1, 8)), whiteMat); post.visible = false; scene.add(post);
  let saleKey = '';
  function setSale(i, label, sub){
    const key = i < 0 ? '' : i + label + sub; if (key === saleKey) return; saleKey = key;
    if (i < 0){ saleFrame.visible = sign.visible = post.visible = false; return; }
    const c = cellOf(i), tall = c.s === 'l' || c.s === 'r', sp = S[i];
    saleFrame.rotation.set(-Math.PI / 2, 0, SIDE_ROT[c.s] || 0); saleFrame.scale.set(tall ? c.d : c.w, tall ? c.w : c.d, 1); saleFrame.position.set(c.x, .011, c.z); saleFrame.visible = true;
    const x = signCv.getContext('2d'); x.clearRect(0, 0, 384, 208);
    x.fillStyle = 'rgba(0,0,0,.35)'; rrect(x, 8, 12, 372, 192, 22); x.fill();
    x.fillStyle = '#fbf8f2'; rrect(x, 4, 4, 372, 192, 22); x.fill();
    x.save(); rrect(x, 4, 4, 372, 192, 22); x.clip(); x.fillStyle = sp.k === 'prop' ? GR[sp.g].color : '#cfd6e6'; x.fillRect(0, 0, 384, 52); x.restore();
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#141a2b'; x.font = `800 26px ${F_BODY}`; spaced(x, '4px'); x.fillText(label, 192, 30); spaced(x, '0px');
    fitFont(x, [sp.name], '800', F_BODY, 34, 340); x.fillText(sp.name, 192, 88);
    x.fillStyle = '#a34c0c'; x.font = `600 78px ${F_LED}`; x.fillText(sub, 192, 152);
    signTex.needsUpdate = true;
    const ou = OUT[c.s], px = c.x - ou[0] * .45, pz = c.z - ou[1] * .45;
    sign.position.set(px, 1.05, pz); sign.visible = true; post.position.set(px, .52, pz); post.scale.set(1, 1.05, 1); post.visible = true;
    if (!calm){ sign.scale.set(.01, .01, 1); tween(.3, e => { const k = Math.max(.01, ease.back(e)); sign.scale.set(1.85 * k, k, 1); }, ease.lin); }
  }

  function sync(s, anim = true){
    if (dead || !s) return;
    const an = anim && !calm && !lost && !document.hidden;
    curPid = s.phase === 'over' ? -1 : s.cur;
    toks.forEach((tk, i) => {
      if (!tk) return; const out = !!s.players[i].out;
      if (out && !tk.gone && !tk.dying){ tk.gone = true; tk.root.visible = false; }
      tk.ring.visible = i === curPid && !out;
    });
    for (let i = 0; i < 40; i++){
      if (!E.isOwnable(i)) continue;
      setOwner(i, s.own[i], s.players, an); setMort(i, !!s.mort[i], an);
      if (S[i].k === 'prop') setBld(i, s.bld[i], an);
    }
    setJackpot(s.opts && s.opts.jackpot ? s.jackpot : null);
    if (s.phase === 'buy' && S[s.buy]) setSale(s.buy, 'FOR SALE', '$' + S[s.buy].price);
    else if (s.phase === 'auction' && s.auction) setSale(s.auction.sp, 'AUCTION', s.auction.high ? '$' + s.auction.high : 'NO BIDS');
    else setSale(-1);
    invalidate();
  }

  /* ---------- big moments ---------- */
  function passGo(pid, amt){
    if (dead) return;
    const p = tokPos(pid, .3);
    fountain(p); snd('coin'); floatTok(pid, '+$' + amt, '#f2c14e'); shock(p, 0xffd35a, 3.5, .5);
  }
  function glowGroup(g, m = 1){
    if (dead || !GR[g]) return Promise.resolve();
    const col = new THREE.Color(GR[g].color);
    for (const i of GR[g].sp) burstSpace(i, col, 16);
    if (calm || !m || lost) return Promise.resolve();
    const mat = new THREE.MeshBasicMaterial({color:col, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending});
    const ms = GR[g].sp.map(i => { const d = decal(mat, i, .013); d.renderOrder = 4; scene.add(d); return d; });
    return tween(1.25 * Math.max(m, .45), (e, p) => { mat.opacity = Math.abs(Math.sin(p * Math.PI * 3)) * .85 * (1 - p * .4); }, ease.lin).then(() => { ms.forEach(d => scene.remove(d)); mat.dispose(); });
  }
  async function bankrupt(pid, m = 1){
    const tk = toks[pid]; if (dead || !tk || tk.gone) return;
    if (!m || calm || lost || document.hidden){ tk.gone = true; tk.root.visible = false; invalidate(); return; }
    tk.dying = true; tk.busy = true; tk.ring.visible = false; shake(.1, .3);
    const b = tk.body, r = tk.root, k = Math.max(m, .4);
    await tween(.55 * k, e => { b.rotation.z = (Math.PI / 2) * e; b.position.y = Math.sin(b.rotation.z) * .23; }, ease.bounce);
    snd('thud'); puff(r.position, 10, .8);
    await pause(.18 * k);
    await tween(.6 * k, e => { r.position.y = -.5 * e; setAlpha(tk, 1 - e); }, ease.in);
    tk.gone = true; tk.dying = false; tk.busy = false; r.visible = false; invalidate();
  }
  const party = {objs:[], timers:[]};
  function celebrate(pid){
    const tk = toks[pid]; if (dead || !tk || tk.win) return;
    tk.win = true; tk.busy = true; tk.ring.visible = false; focusOn(null); clearTimeout(relaxT);
    const ped = new THREE.Group();
    ped.add(mesh(G('ped', () => new THREE.CylinderGeometry(.7, .85, .5, 44)), goldMat, 0, .25, 0), mesh(G('ped2', () => new THREE.CylinderGeometry(.9, .98, .14, 44)), MAT('pedB', () => std(0x16305f, .4, .3)), 0, .07, 0));
    ped.children.forEach(c => { c.receiveShadow = true; });
    ped.position.set(0, -.1, -.1); ped.scale.set(1, .001, 1); scene.add(ped); party.objs.push(ped);
    const spot = new THREE.SpotLight(0xfff0c8, 0, 18, .3, .55, 1.1); spot.position.set(1.5, 9, 3); spot.target = ped; scene.add(spot); party.objs.push(spot);
    const glow = new THREE.Mesh(flatG, new THREE.MeshBasicMaterial({map:DOT, color:0xffd35a, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending}));
    glow.rotation.x = -Math.PI / 2; glow.position.set(0, .016, -.1); glow.scale.setScalar(5.5); glow.renderOrder = 4; scene.add(glow); party.objs.push(glow);
    const r = tk.root, b = tk.body, x0 = r.position.x, z0 = r.position.z, y0 = r.rotation.y, s0 = r.scale.x, end = camYaw() + tk.rest;
    settleAll(true, tpos[pid]);
    const land = () => { r.position.set(0, .5, -.1); r.scale.setScalar(1.85); r.rotation.y = end; b.position.y = 0; b.rotation.set(0, 0, 0); b.scale.set(1, 1, 1); ped.scale.set(1, 1, 1); ped.position.y = 0; spot.intensity = 260; glow.material.opacity = .3; tk.shadow.visible = false; invalidate(); };
    if (calm || lost){ land(); return; }
    tween(.5, e => { ped.scale.y = Math.max(.001, ease.back(e)); spot.intensity = 260 * e; glow.material.opacity = .3 * e; }, ease.lin);
    tk.gid++;
    tween(.95, (e, p) => {
      r.position.x = lerp(x0, 0, e); r.position.z = lerp(z0, -.1, e); r.position.y = .5 * e; b.position.y = Math.sin(Math.PI * p) * 2.6;
      r.rotation.y = y0 + angDiff(y0, end) * e + TAU * 2 * e; r.scale.setScalar(lerp(s0, 1.85, e));
    }).then(() => { if (dead) return; land(); snd('thud'); shock(new THREE.Vector3(0, 0, -.1), 0xffd35a, 9, .8); bounceBack(tk); });
    const COL = ['#ff8a2b', '#f2c14e', '#4fb3ff', '#4ade80', '#ff6fae', '#ffffff', '#b18cff'];
    for (let k = 0; k < 7; k++) party.timers.push(setTimeout(() => {
      if (dead) return;
      burst({pos:new THREE.Vector3((Math.random() - .5) * 9, 5 + Math.random() * 2.5, (Math.random() - .5) * 8), count:70, colors:COL, speed:3.2, up:1.5, gravity:2.6, size:.2, life:3, additive:false, spread:6, floorY:.04});
    }, 350 + k * 520));
    controls.autoRotate = true; autoUntil = performance.now() + 15000; invalidate();
  }
  function endParty(){
    party.timers.forEach(clearTimeout); party.timers.length = 0;
    party.objs.forEach(x => { scene.remove(x); if (x.isMesh && x.material.blending === THREE.AdditiveBlending) x.material.dispose(); if (x.dispose) x.dispose(); }); party.objs.length = 0;
    controls.autoRotate = false;
  }

  /* ---------- reset to a state (new game, resume, or the view was just built) ---------- */
  function reset(s, vp, vj){
    if (dead) return;
    epoch++; flush(); endParty(); hideCard(); clearTimeout(relaxT);
    for (const tk of toks){ if (!tk) continue; scene.remove(tk.root); if (tk.own) tk.own.forEach(m => m.dispose()); }
    toks.length = 0; tpos.length = 0; tjail.length = 0;
    fGoal.set(0, 0, 0); fCur.set(0, 0, 0); zGoal = zCur = 0; shakeAmt = 0;
    s.players.forEach((p, i) => { toks[i] = makeToken(p, i); tpos[i] = vp ? vp[i] : p.pos; tjail[i] = vj ? !!vj[i] : !!p.jail; if (p.out){ toks[i].gone = true; toks[i].root.visible = false; } });
    custom = false; flying = false; controls.enabled = true;
    resize();
    setHome(viewHome());
    toks.forEach(tk => { tk.root.rotation.y = restYaw(tk); });
    settleAll(false);
    rolling = false; diceVal = [0, 0]; setDice(s.dice, true);
    sync(s, false);
    if (s.phase === 'over' && s.over && toks[s.over.winner] && !s.players[s.over.winner].out) celebrate(s.over.winner);
    invalidate();
  }

  /* ---------- pointer: tap a space or a token, hover on desktop; a drag is never a tap ---------- */
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitV = new THREE.Vector3();
  const downs = new Map(); let multi = false, hov = null;
  function pick(cx, cy){
    const r = el.getBoundingClientRect();
    ptr.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const roots = toks.filter(tk => tk && !tk.gone && tk.root.visible).map(tk => tk.root);
    const hit = ray.intersectObjects(roots, true)[0];
    if (hit){ let q = hit.object; while (q && q.userData.pid == null) q = q.parent; if (q) return {pid:q.userData.pid}; }
    if (ray.ray.intersectPlane(plane, hitV)){ const i = spaceAt(hitV.x, hitV.z); if (i >= 0) return {sp:i}; }
    return null;
  }
  function setHover(h){
    const key = h ? (h.pid != null ? 'p' + h.pid : 's' + h.sp) : '';
    if (key === (hov || '')) return; hov = key;
    el.style.cursor = h ? 'pointer' : 'grab';
    if (h && h.sp != null){ const c = cellOf(h.sp); hover.scale.set(c.w - .04, c.d - .04, 1); hover.position.set(c.x, .012, c.z); hover.visible = true; } else hover.visible = false;
    toks.forEach((tk, i) => { if (tk && !tk.busy && !tk.win) tk.body.position.y = h && h.pid === i ? .09 : 0; });
    invalidate();
  }
  const onDown = e => { if (downs.size) multi = true; downs.set(e.pointerId, {x:e.clientX, y:e.clientY, t:performance.now(), moved:false}); if (e.pointerType === 'mouse') el.style.cursor = 'grabbing'; };
  const onMove = e => {
    const d = downs.get(e.pointerId);
    if (d){ if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 7) d.moved = true; if (d.moved) setHover(null); return; }
    if (e.pointerType === 'mouse' && !downs.size) setHover(pick(e.clientX, e.clientY));
  };
  const onUp = e => {
    const d = downs.get(e.pointerId); downs.delete(e.pointerId);
    const wasMulti = multi; if (!downs.size) multi = false;
    if (e.pointerType === 'mouse') el.style.cursor = hov ? 'pointer' : 'grab';
    if (!d || d.moved || wasMulti || e.type === 'pointercancel' || performance.now() - d.t > 650 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 7) return;
    if (e.button > 0) return;
    stat.taps++;
    if (cardS.skip){ cardS.skip(); return; }
    const h = pick(e.clientX, e.clientY);
    if (!h) return;
    if (h.pid != null) onToken && onToken(h.pid); else onSpace && onSpace(h.sp);
  };
  const onLeave = () => setHover(null);
  el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp); el.addEventListener('pointerleave', onLeave);
  el.style.cursor = 'grab';

  /* ---------- lost GL ---------- */
  const onGLLost = e => { e.preventDefault(); lost = true; flush(); clearTimeout(lostTimer); lostTimer = setTimeout(() => { if (lost && !dead && onLost) onLost(); }, 2500); };
  const onGLBack = () => { lost = false; clearTimeout(lostTimer); boardTex.needsUpdate = true; invalidate(); };
  el.addEventListener('webglcontextlost', onGLLost); el.addEventListener('webglcontextrestored', onGLBack);

  /* ---------- fonts: repaint the board once the real typefaces are in ---------- */
  paintBoard();
  if (face && !face.complete) face.addEventListener('load', paintBoard, {once:true});
  if (document.fonts && document.fonts.load){
    Promise.all([document.fonts.load('800 20px Figtree'), document.fonts.load('600 20px Teko'), document.fonts.load('400 20px "Bowlby One"')].map(p => p.catch(() => [])))
      .then(r => { if (!dead && r.some(a => a && a.length)) paintBoard(); });
  }
  const ro = new ResizeObserver(resize); ro.observe(host);
  resize();

  function dispose(){
    if (dead) return; dead = true;
    cancelAnimationFrame(raf); clearInterval(dog); clearInterval(starve); clearTimeout(relaxT); clearTimeout(lostTimer);
    document.removeEventListener('visibilitychange', onVis);
    stepTweens(0, true); for (const tw of [...tweens]) tw.res(); tweens.clear();
    for (const u of [...updaters]){ try { u(99, true); } catch(e){} } updaters.clear();
    endParty(); ro.disconnect(); controls.dispose();
    el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp); el.removeEventListener('pointerleave', onLeave);
    el.removeEventListener('webglcontextlost', onGLLost); el.removeEventListener('webglcontextrestored', onGLBack);
    for (const tk of toks) if (tk && tk.own) tk.own.forEach(m => m.dispose());
    for (const x of trash){ try { x.dispose(); } catch(e){} }
    trash.clear();
    if (cardS.skip) cardS.skip();
    if (cardEl){ cardEl.hidden = true; cardEl.classList.remove('on'); }
    if (floatLayer) floatLayer.innerHTML = '';
    try { renderer.dispose(); renderer.forceContextLoss(); } catch(e){}
    el.remove();
  }

  return {
    get dead(){ return dead; }, get lost(){ return lost; }, small,
    resize, dispose, reset, sync, place, setDice, roll, move, toJail, leaveJail, card, hideCard,
    coins, passGo, glowGroup, bankrupt, celebrate, shake, burstSpace, floatTok, floatSp, tokPos, spPos,
    focus:focusOn, relax, resetView:() => { focusOn(null); controls.target.set(0, 0, 0); setLimits(); return flyHome(); },
    orbit:(ms = 12000) => { if (calm || dead) return; controls.autoRotate = true; autoUntil = performance.now() + ms; invalidate(); },
    /* test hooks */
    diceFaces, stat, slow:k => { slowmo = k > 0 ? k : 1; },
    loseGL:() => { const x = renderer.getContext().getExtension('WEBGL_lose_context'); if (x) x.loseContext(); return !!x; },
    freeze:on => { const t = performance.now(); if (on && !frozenAt) frozenAt = t; else if (!on && frozenAt){ for (const tw of tweens) tw.t0 += t - frozenAt; frozenAt = 0; } invalidate(); },
    diceWorld:() => dice.map(d => ({x:+d.position.x.toFixed(2), y:+d.position.y.toFixed(2), z:+d.position.z.toFixed(2)})),
    lookFrom:(x, y, z, tx = 0, tz = 0) => { custom = true; controls.minDistance = 2; controls.target.set(tx, 0, tz); homePos.set(x, y, z); camera.position.set(x, y, z); disp.set(0, 0, 0); camera.lookAt(tx, 0, tz); invalidate(); },
    idle:() => !raf && !tweens.size && !updaters.size,
    tokenWorld:pid => { const tk = toks[pid]; return tk ? {x:+tk.root.position.x.toFixed(3), y:+(tk.root.position.y + tk.body.position.y).toFixed(3), z:+tk.root.position.z.toFixed(3), s:+tk.root.scale.x.toFixed(2), tilt:+tk.body.rotation.z.toFixed(2), visible:tk.root.visible, space:tpos[pid], jail:!!tjail[pid]} : null; },
    tokenScreen:pid => { const p = screenOf(tokPos(pid, .35)), r = el.getBoundingClientRect(); return {x:r.left + p.x, y:r.top + p.y}; },
    spaceScreen:i => { const c = cellOf(i), o = outOf(i), k = sideOf(i) === 'c' ? 0 : -.45, p = screenOf(new THREE.Vector3(c.x + o[0] * k, 0, c.z + o[1] * k)), r = el.getBoundingClientRect(); return {x:r.left + p.x, y:r.top + p.y}; },
    cam:() => ({pos:camera.position.toArray().map(v => +v.toFixed(2)), home:homePos.toArray().map(v => +v.toFixed(2)), fov:camera.fov, custom, auto:controls.autoRotate, hover:hov || '', cursor:el.style.cursor}),
    view:() => ({owners:own.map(e => e ? e.pid : -1), bld:bld.map(e => e ? e.n : 0), mort:mort.map(e => !!(e && e.on)), jackpot:jackKey, sale:saleKey, dice:diceVal.slice(), card:cardS.on, tokens:toks.length})
  };
}
