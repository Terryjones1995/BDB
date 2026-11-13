/* =========================================================
   BDB Tycoon 3D board (three.js).
   Draws the same board as the flat version onto one big texture, cuts it into raised tiles,
   and adds 3D tokens, houses, hotels, owner plates and dice that actually roll.
   game.js keeps all the rules and UI; this file only shows things and reports tile clicks.
   Board units: one plain space is 1 wide, corners are 1.6, the whole board is 12.2 across.
   ========================================================= */
import * as THREE from 'three';
import { RoomEnvironment } from '../chess/vendor/RoomEnvironment.js';

const U = 1, C = 1.6, SIZE = 12.2, HALF = SIZE / 2;
const TILE_H = .12;          // tile top sits at this height
const COURT_Y = .03;         // centre court top
const cellOf = i => i === 0 ? [11, 11] : i < 10 ? [11, 11 - i] : i === 10 ? [11, 1] : i < 20 ? [21 - i, 1] : i === 20 ? [1, 1] : i < 30 ? [1, i - 19] : i === 30 ? [1, 11] : [i - 29, 11];
const sideOf = i => i % 10 === 0 ? 'c' : i < 10 ? 'b' : i < 20 ? 'l' : i < 30 ? 't' : 'r';
function rectU(i){
  const [r, c] = cellOf(i);
  const at = k => k === 1 ? 0 : k === 11 ? C + 9 * U : C + (k - 2) * U;
  const sz = k => k === 1 || k === 11 ? C : U;
  return {x:at(c), y:at(r), w:sz(c), h:sz(r)};
}
// outward direction (towards the board edge) for each side, in world x/z
const OUT = {b:[0, 1], t:[0, -1], l:[-1, 0], r:[1, 0]};
// card piles on the centre court (world x/z) and where the dice settle
const DECKS = [[-3.05, .7], [3.05, .7]];
const DICE_X = [-1.35, -.3], DICE_Z = .85;

const svgImg = (paths, stroke, sw = 1.8) => new Promise(res => {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="256" height="256" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  const img = new Image();
  img.onload = () => res(img); img.onerror = () => res(null);
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
});
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const easeOut = t => 1 - Math.pow(1 - t, 3);

export async function createBoard3D(o){
  const {host, S, GR, ICON, spIcon, isOwnable, onPick, reduced} = o;

  /* ---------- renderer ---------- */
  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const cvs = renderer.domElement; cvs.className = 'b3cv';
  host.appendChild(cvs);

  const scene = new THREE.Scene();
  { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose(); }
  const camera = new THREE.PerspectiveCamera(26, 1, .1, 200);

  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a2a14, .55));
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.55);
  sun.position.set(-6, 14, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {left:-8.5, right:8.5, top:8.5, bottom:-8.5, near:1, far:40});
  sun.shadow.bias = -.0006; sun.shadow.normalBias = .02;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9fb8ff, .35); fill.position.set(8, 6, -6); scene.add(fill);

  /* ---------- board texture ---------- */
  const N = 2048, K = N / SIZE;
  const atlas = document.createElement('canvas'); atlas.width = atlas.height = N;
  const g = atlas.getContext('2d');
  const tex = new THREE.CanvasTexture(atlas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const icons = {}, iconsW = {};
  await Promise.all(Object.keys(ICON).map(async k => { icons[k] = await svgImg(ICON[k], '#1a1f2e'); iconsW[k] = await svgImg(ICON[k], '#ffffff'); }));
  const face = await loadImg('../assets/face.jpg');
  try { await Promise.race([Promise.all([document.fonts.load('800 24px Figtree'), document.fonts.load('600 40px Teko'), document.fonts.load('400 60px "Bowlby One"')]), new Promise(r => setTimeout(r, 2500))]); } catch(e){}

  const px = v => v * K;
  function wrap(text, maxW, font, size){
    // shrink until every word fits, then wrap into lines
    let s = size;
    for (;;){
      g.font = `${font} ${s}px Figtree, system-ui, sans-serif`;
      const words = text.split(' ');
      if (words.every(w => g.measureText(w).width <= maxW) || s < 10){
        const lines = []; let cur = '';
        for (const w of words){ const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } }
        if (cur) lines.push(cur);
        return {lines, s};
      }
      s -= 1;
    }
  }
  function textBlock(text, cx, cy, maxW, font, size, color, lh = 1.05){
    const {lines, s} = wrap(text, maxW, font, size);
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    const h = s * lh;
    lines.forEach((l, k) => g.fillText(l, cx, cy + (k - (lines.length - 1) / 2) * h));
  }
  function drawIcon(k, cx, cy, sz, white){ const im = (white ? iconsW : icons)[k]; if (im) g.drawImage(im, cx - sz / 2, cy - sz / 2, sz, sz); }

  const BG = {go:['#ffcf8a', '#f5a24b'], gojail:['#ffb4aa', '#f0806f'], free:['#c8f1d4', '#94d9ab'], jail:['#ffe7a8', '#f3c95d']};
  let jackpotText = 'Rest stop';
  function drawTile(i){
    const sp = S[i], r = rectU(i), side = sideOf(i);
    const x = px(r.x), y = px(r.y), w = px(r.w), h = px(r.h);
    g.save();
    const bg = BG[sp.k] || ['#ecd3a3', '#e2c18a'];
    const gr = g.createLinearGradient(x, y, x + w * .35, y + h); gr.addColorStop(0, bg[0]); gr.addColorStop(1, bg[1]);
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.translate(x + w / 2, y + h / 2);
    if (side === 'c'){
      const c = px(C);
      if (sp.k === 'jail'){
        // the bench cell sits in the inner corner (top-right of this tile)
        const cw = c * .68;
        g.save(); g.translate(c / 2 - cw, -c / 2);
        const og = g.createLinearGradient(0, 0, cw * .4, cw); og.addColorStop(0, '#ff9a3c'); og.addColorStop(1, '#c9580f');
        g.fillStyle = og; g.fillRect(0, 0, cw, cw);
        g.fillStyle = 'rgba(10,14,24,.55)';
        for (let bx = 0; bx < cw; bx += px(.22)) g.fillRect(bx, 0, px(.02), cw);
        g.fillStyle = '#1a1f2e'; g.fillRect(0, 0, px(.03), cw); g.fillRect(0, cw - px(.03), cw, px(.03));
        drawIcon('bench', cw / 2, cw * .4, px(.7), true);
        g.save(); g.shadowColor = '#000'; g.shadowBlur = 6; textBlock(sp.name, cw / 2, cw * .76, cw * .9, '800', px(.2), '#fff'); g.restore();
        g.restore();
        g.font = `700 ${px(.12)}px Figtree, system-ui, sans-serif`; g.fillStyle = '#5b4420'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('JUST VISITING', 0, c / 2 - px(.14));
      } else {
        drawIcon(spIcon(sp), 0, -px(.3), px(.78));
        textBlock(sp.name, 0, px(.24), c * .88, '800', px(.22), '#141a2b');
        const sub = sp.k === 'go' ? 'COLLECT $200' : sp.k === 'gojail' ? 'GO TO BENCHED' : sp.k === 'free' ? jackpotText.toUpperCase() : '';
        g.font = `700 ${px(.12)}px Figtree, system-ui, sans-serif`; g.fillStyle = '#5b4420'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(sub, 0, px(.58));
      }
      g.restore(); return;
    }
    g.rotate(side === 'l' ? Math.PI / 2 : side === 'r' ? -Math.PI / 2 : 0);
    // local frame: 1 wide, 1.6 tall, inner edge at the top (bottom for the top row)
    const lw = px(U), lh = px(C), top = -lh / 2, flip = side === 't';
    const Y = v => flip ? -v : v;   // mirror vertical placement for the top row so the band still faces in
    const priceTxt = sp.price ? '$' + sp.price : sp.amt ? '$' + sp.amt : '';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (sp.k === 'prop'){
      const bh = px(.36);
      g.fillStyle = GR[sp.g].color;
      g.fillRect(-lw / 2, flip ? lh / 2 - bh : top, lw, bh);
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-lw / 2, flip ? lh / 2 - bh : top + bh - 2, lw, 2);
      textBlock(sp.sh, 0, Y(top + bh + (lh - bh - px(.36)) / 2), lw * .92, '800', px(.2), '#141a2b', 1.02);
    } else {
      textBlock(sp.sh, 0, Y(top + px(.36)), lw * .92, '800', px(.19), '#141a2b', 1.02);
      drawIcon(spIcon(sp), 0, Y(top + px(.92)), px(.5));
    }
    if (priceTxt){ g.font = `600 ${px(.27)}px Teko, "Arial Narrow", sans-serif`; g.fillStyle = '#3a2a10'; g.fillText(priceTxt, 0, Y(lh / 2 - px(.19)) + px(.02)); }
    g.restore();
  }
  function drawCentre(){
    const x = px(C), w = px(9 * U);
    const cx = x + w / 2, cy = cx;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, w * .72);
    gr.addColorStop(0, '#1b4590'); gr.addColorStop(.55, '#0d2552'); gr.addColorStop(1, '#061230');
    g.fillStyle = gr; g.fillRect(x, x, w, w);
    // hardwood-ish rings, keys and the centre circle
    g.strokeStyle = 'rgba(255,255,255,.09)'; g.lineWidth = px(.04);
    g.beginPath(); g.arc(cx, cy, w * .31, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, w * .12, 0, Math.PI * 2); g.stroke();
    g.strokeRect(x + px(.25), x + px(.25), w - px(.5), w - px(.5));
    if (face){
      g.save(); g.beginPath(); g.arc(cx, cy, w * .24, 0, Math.PI * 2); g.clip();
      g.globalAlpha = .16; g.filter = 'grayscale(.3) contrast(1.1)';
      const s = Math.min(face.naturalWidth, face.naturalHeight), sy = (face.naturalHeight - s) * .32;
      g.drawImage(face, (face.naturalWidth - s) / 2, sy, s, s, cx - w * .24, cy - w * .24, w * .48, w * .48);
      g.restore();
    }
    // diagonal logo, like the real thing
    g.save(); g.translate(cx, cy); g.rotate(-Math.PI / 4); g.globalAlpha = .6;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `400 ${px(.85)}px "Bowlby One", Impact, sans-serif`;
    const a = 'BDB ', b = 'TYCOON', wa = g.measureText(a).width, wb = g.measureText(b).width, sx = -(wa + wb) / 2;
    g.textAlign = 'left';
    g.fillStyle = '#0b1f45'; g.fillText(a, sx, px(.06)); g.fillText(b, sx + wa, px(.06));
    g.fillStyle = '#eef2fb'; g.fillText(a, sx, 0);
    g.fillStyle = '#c95e0c'; g.fillText(b, sx + wa, px(.06));
    g.fillStyle = '#ff8a2b'; g.fillText(b, sx + wa, 0);
    g.restore();
    // deck spots
    const spot = (dx, dy, label, col) => {
      g.save(); g.translate(cx + dx, cy + dy); g.rotate(.12);
      g.setLineDash([px(.1), px(.08)]); g.strokeStyle = col; g.lineWidth = px(.035);
      g.strokeRect(-px(.75), -px(.5), px(1.5), px(1));
      g.restore();
      g.save(); g.translate(cx + dx, cy + dy); g.rotate(.12);
      g.font = `800 ${px(.13)}px Figtree, system-ui, sans-serif`; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, 0, px(.68)); g.restore();
    };
    spot(px(DECKS[0][0]), px(DECKS[0][1]), 'SCOUT CALL', 'rgba(255,138,43,.6)');
    spot(px(DECKS[1][0]), px(DECKS[1][1]), 'FRIDGE', 'rgba(79,179,255,.6)');
  }
  function paintAtlas(){
    g.fillStyle = '#6b4b1f'; g.fillRect(0, 0, N, N);
    drawCentre();
    for (let i = 0; i < 40; i++) drawTile(i);
    tex.needsUpdate = true;
  }
  paintAtlas();

  /* ---------- geometry ---------- */
  const board = new THREE.Group(); scene.add(board);
  const woodMat = new THREE.MeshStandardMaterial({color:0x3b260c, roughness:.55, metalness:.05});
  const rimMat = new THREE.MeshStandardMaterial({color:0x1d1206, roughness:.5});
  const base = new THREE.Mesh(new THREE.BoxGeometry(SIZE + .5, .42, SIZE + .5), [rimMat, rimMat, woodMat, rimMat, rimMat, rimMat]);
  base.position.y = -.21; base.receiveShadow = true; base.castShadow = true; board.add(base);
  const table = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({opacity:.38}));
  table.rotation.x = -Math.PI / 2; table.position.y = -.42; table.receiveShadow = true; scene.add(table);

  // map a box's top face onto its patch of the atlas
  function topUV(geo, cxW, czW){
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let v = 8; v < 12; v++){   // +y face
      const wx = pos.getX(v) + cxW, wz = pos.getZ(v) + czW;
      uv.setXY(v, (wx + HALF) / SIZE, 1 - (wz + HALF) / SIZE);
    }
    uv.needsUpdate = true;
  }
  const sideMat = new THREE.MeshStandardMaterial({color:0xc9a466, roughness:.7});
  const GAP = .035;
  const tiles = [];
  for (let i = 0; i < 40; i++){
    const r = rectU(i), w = r.w - GAP, d = r.h - GAP;
    const geo = new THREE.BoxGeometry(w, TILE_H, d);
    const cxW = r.x + r.w / 2 - HALF, czW = r.y + r.h / 2 - HALF;
    topUV(geo, cxW, czW);
    const top = new THREE.MeshStandardMaterial({map:tex, roughness:.62, metalness:0, emissive:0xf2c14e, emissiveIntensity:0});
    const m = new THREE.Mesh(geo, [sideMat, sideMat, top, sideMat, sideMat, sideMat]);
    m.position.set(cxW, TILE_H / 2, czW);
    m.castShadow = true; m.receiveShadow = true;
    m.userData = {i, top, baseY:TILE_H / 2, y:TILE_H / 2, lift:0};
    board.add(m); tiles.push(m);
  }
  {
    const geo = new THREE.BoxGeometry(9 * U - GAP, COURT_Y, 9 * U - GAP);
    topUV(geo, 0, 0);
    const m = new THREE.Mesh(geo, [sideMat, sideMat, new THREE.MeshStandardMaterial({map:tex, roughness:.4, metalness:.05}), sideMat, sideMat, sideMat]);
    m.position.y = COURT_Y / 2; m.receiveShadow = true; board.add(m);
  }
  // card decks on the court
  function deck(x, z, col){
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({color:col, roughness:.45});
    const edge = new THREE.MeshStandardMaterial({color:0xf3ead8, roughness:.8});
    for (let k = 0; k < 6; k++){
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.4, .025, .92), [edge, edge, mat, edge, edge, edge]);
      c.position.y = COURT_Y + .0125 + k * .027; c.rotation.y = (Math.random() - .5) * .06;
      c.castShadow = true; c.receiveShadow = true; grp.add(c);
    }
    grp.position.set(x, 0, z); grp.rotation.y = -.12; board.add(grp);
  }
  deck(DECKS[0][0], DECKS[0][1], 0xff8a2b);
  deck(DECKS[1][0], DECKS[1][1], 0x2a6fd6);

  /* ---------- owner plates, houses, hotels ---------- */
  const plates = [], blds = [];
  const houseMat = new THREE.MeshStandardMaterial({color:0x2fbf5b, roughness:.4});
  const roofMat = new THREE.MeshStandardMaterial({color:0x1d8a3e, roughness:.5});
  const hotelMat = new THREE.MeshStandardMaterial({color:0xff5a4a, roughness:.4});
  const hotelRoof = new THREE.MeshStandardMaterial({color:0xb3261a, roughness:.5});
  const houseGeo = new THREE.BoxGeometry(.19, .16, .22), roofGeo = new THREE.ConeGeometry(.17, .13, 4);
  const hotelGeo = new THREE.BoxGeometry(.6, .26, .28), hotelTop = new THREE.BoxGeometry(.64, .05, .32);
  function makeHouse(){
    const grp = new THREE.Group();
    const b = new THREE.Mesh(houseGeo, houseMat); b.position.y = .08; b.castShadow = true;
    const r = new THREE.Mesh(roofGeo, roofMat); r.position.y = .225; r.rotation.y = Math.PI / 4; r.castShadow = true;
    grp.add(b, r); return grp;
  }
  function makeHotel(){
    const grp = new THREE.Group();
    const b = new THREE.Mesh(hotelGeo, hotelMat); b.position.y = .13; b.castShadow = true;
    const t = new THREE.Mesh(hotelTop, hotelRoof); t.position.y = .285; t.castShadow = true;
    grp.add(b, t); return grp;
  }
  for (let i = 0; i < 40; i++){
    if (!isOwnable(i)) continue;
    const side = sideOf(i), [ox, oz] = OUT[side], t = tiles[i];
    const along = side === 'l' || side === 'r';      // tile is long along x
    const p = new THREE.Mesh(new THREE.BoxGeometry(along ? .3 : .88, .025, along ? .88 : .3), new THREE.MeshStandardMaterial({color:0xffffff, roughness:.35, metalness:.1, emissive:0x000000}));
    p.position.set(ox * (C / 2 - .19), TILE_H / 2 + .013, oz * (C / 2 - .19));
    p.visible = false; p.castShadow = true; t.add(p); plates[i] = p;
    if (S[i].k === 'prop'){
      const grp = new THREE.Group(); grp.position.set(-ox * (C / 2 - .18), TILE_H / 2, -oz * (C / 2 - .18));
      if (along) grp.rotation.y = Math.PI / 2;
      t.add(grp); blds[i] = {grp, n:0, born:0};
    }
  }
  function setBuildings(i, n){
    const b = blds[i]; if (!b || b.n === n) return;
    const grew = n > b.n;
    b.grp.clear(); b.n = n;
    if (n === 5){ const h = makeHotel(); b.grp.add(h); }
    else for (let k = 0; k < n; k++){ const h = makeHouse(); h.position.x = (k - (n - 1) / 2) * .225; b.grp.add(h); }
    if (grew && !reduced){ b.born = performance.now(); b.grp.scale.setScalar(.01); }
  }

  /* ---------- tokens ---------- */
  const toks = [];
  const lathePts = [[0, 0], [.2, 0], [.21, .035], [.17, .06], [.11, .1], [.085, .2], [.075, .3], [.13, .33], [.13, .36], [.06, .38], [0, .38]].map(([x, y]) => new THREE.Vector2(x, y));
  const tokGeo = new THREE.LatheGeometry(lathePts, 40);
  const ringGeo = new THREE.RingGeometry(.24, .3, 48);
  async function tokenSprite(color, iconKey){
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.beginPath(); x.arc(64, 64, 58, 0, Math.PI * 2); x.fillStyle = color; x.fill();
    x.lineWidth = 7; x.strokeStyle = '#0b1430'; x.stroke();
    x.beginPath(); x.arc(64, 64, 52, 0, Math.PI * 2); x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,.85)'; x.stroke();
    const im = await svgImg(ICON[iconKey] || ICON.ball, '#141a2b', 2.2);
    if (im) x.drawImage(im, 26, 26, 76, 76);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  async function buildTokens(players){
    for (const t of toks) board.remove(t.grp);
    toks.length = 0;
    for (const p of players){
      const grp = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({color:p.color, roughness:.28, metalness:.35});
      const body = new THREE.Mesh(tokGeo, mat); body.castShadow = true; grp.add(body);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:await tokenSprite(p.color, p.token), depthTest:true}));
      sp.scale.setScalar(.31); sp.position.y = .58; grp.add(sp);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({color:0xfff3c4, transparent:true, opacity:.9, side:THREE.DoubleSide, depthWrite:false}));
      ring.rotation.x = -Math.PI / 2; ring.position.y = .01; ring.visible = false; grp.add(ring);
      grp.position.set(0, TILE_H, 0); grp.visible = false;
      board.add(grp);
      toks.push({grp, body, sp, ring, from:new THREE.Vector3(), to:new THREE.Vector3(), t0:0, dur:0, placed:false, on:false});
    }
  }
  function setToken(pid, x, z, {hidden, on, hop = 160} = {}){
    const t = toks[pid]; if (!t) return;
    t.grp.visible = !hidden; t.on = !!on;
    if (hidden) return;
    const nx = x - HALF, nz = z - HALF;
    if (!t.placed){ t.grp.position.set(nx, TILE_H, nz); t.to.set(nx, TILE_H, nz); t.placed = true; return; }
    if (Math.abs(t.to.x - nx) < 1e-4 && Math.abs(t.to.z - nz) < 1e-4) return;
    t.from.copy(t.grp.position); t.from.y = TILE_H;
    t.to.set(nx, TILE_H, nz); t.t0 = performance.now(); t.dur = reduced ? 1 : Math.max(60, hop);
  }

  /* ---------- dice ---------- */
  function pipTex(n){
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 20, 64, 64, 92); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#e5ddcd');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    const P = {1:[[64, 64]], 2:[[34, 34], [94, 94]], 3:[[34, 34], [64, 64], [94, 94]], 4:[[34, 34], [94, 34], [34, 94], [94, 94]], 5:[[34, 34], [94, 34], [64, 64], [34, 94], [94, 94]], 6:[[34, 30], [94, 30], [34, 64], [94, 64], [34, 98], [94, 98]]}[n];
    for (const [a, b] of P){ x.beginPath(); x.arc(a, b, n === 1 ? 14 : 11, 0, Math.PI * 2); x.fillStyle = n === 1 ? '#d8402f' : '#1a1f2e'; x.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // box faces: +x, -x, +y, -y, +z, -z  →  3, 4, 1, 6, 2, 5
  const dieMats = [3, 4, 1, 6, 2, 5].map(n => new THREE.MeshStandardMaterial({map:pipTex(n), roughness:.3, metalness:0}));
  const DS = .52;
  const dieGeo = new THREE.BoxGeometry(DS, DS, DS);
  const FACE_Q = {
    1:new THREE.Quaternion(),
    6:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI),
    2:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
    5:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
    3:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
    4:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2)
  };
  const Yax = new THREE.Vector3(0, 1, 0);
  const dice = [0, 1].map(k => {
    const m = new THREE.Mesh(dieGeo, dieMats); m.castShadow = true; m.receiveShadow = true;
    const rest = new THREE.Vector3(DICE_X[k], COURT_Y + DS / 2, DICE_Z);
    m.position.copy(rest);
    board.add(m);
    return {m, rest, val:0, yaw:(Math.random() - .5) * .8, anim:null};
  });
  const qTmp = new THREE.Quaternion(), qYaw = new THREE.Quaternion(), qSpin = new THREE.Quaternion();
  function restQ(d, n){ qYaw.setFromAxisAngle(Yax, d.yaw); return new THREE.Quaternion().multiplyQuaternions(qYaw, FACE_Q[n] || FACE_Q[1]); }
  function setDice(vals){
    dice.forEach((d, k) => {
      const n = vals && vals[k] >= 1 && vals[k] <= 6 ? vals[k] : 0;
      if (d.anim || n === d.val) return;
      d.val = n;
      d.m.quaternion.copy(restQ(d, n || (k ? 4 : 3)));
      d.m.position.copy(d.rest);
    });
  }
  setDice([0, 0]);
  function roll(vals, m){
    if (!m || reduced){ dice.forEach(d => { d.anim = null; d.val = -1; }); setDice(vals); return Promise.resolve(); }
    const dur = Math.max(320, 950 * m);
    return new Promise(res => {
      let left = 2;
      dice.forEach((d, k) => {
        d.yaw = (Math.random() - .5) * 1.1;
        d.rest.set(DICE_X[k] + (Math.random() - .5) * .2, COURT_Y + DS / 2, DICE_Z + (Math.random() - .5) * .3);
        const from = new THREE.Vector3(1.6 + k * .5 + Math.random() * .4, 1.5 + Math.random() * .4, 2.6 - k * .3);
        const axis = new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize();
        d.anim = {t0:performance.now() + k * 45, dur, from, axis, spin:(5 + Math.random() * 3) * Math.PI, end:restQ(d, vals[k]), res:() => { d.val = vals[k]; if (!--left) res(); }};
      });
    });
  }
  function stepDice(now){
    let busy = false;
    for (const d of dice){
      const a = d.anim; if (!a) continue;
      busy = true;
      const p = Math.min(1, Math.max(0, (now - a.t0) / a.dur));
      const e = easeOut(p);
      d.m.position.lerpVectors(a.from, d.rest, e);
      // drop in from the throw height, then a few shrinking bounces
      const b = Math.pow(1 - p, 1.6) * Math.abs(Math.cos(p * Math.PI * 2.5)) * (a.from.y - d.rest.y + .3);
      d.m.position.y = d.rest.y + b;
      qSpin.setFromAxisAngle(a.axis, a.spin * (1 - e));
      d.m.quaternion.multiplyQuaternions(a.end, qSpin);
      if (p >= 1){ d.m.quaternion.copy(a.end); d.m.position.copy(d.rest); d.anim = null; a.res(); }
    }
    return busy;
  }

  /* ---------- camera fit ---------- */
  let W = 1, H = 1;
  const corners = [];
  for (const x of [-HALF - .25, HALF + .25]) for (const z of [-HALF - .25, HALF + .25]) for (const y of [-.42, .5]) corners.push(new THREE.Vector3(x, y, z));
  const PITCH = 61 * Math.PI / 180;   // camera elevation above the table
  const target = new THREE.Vector3(0, 0, 0);
  const v3 = new THREE.Vector3();
  function fit(){
    camera.aspect = W / H;
    camera.clearViewOffset();
    let dist = 30;
    const dir = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
    let cxN = 0, cyN = 0;
    for (let it = 0; it < 6; it++){
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.lookAt(target);
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const c of corners){ v3.copy(c).project(camera); x0 = Math.min(x0, v3.x); x1 = Math.max(x1, v3.x); y0 = Math.min(y0, v3.y); y1 = Math.max(y1, v3.y); }
      const half = Math.max((x1 - x0) / 2, (y1 - y0) / 2);
      cxN = (x0 + x1) / 2; cyN = (y0 + y1) / 2;
      dist *= half / .985;
    }
    // shift the frame so the board sits dead centre
    const P = camera.projectionMatrix.elements;
    P[8] += cxN; P[9] += cyN;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  function resize(){
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    fit(); dirty = 3;
  }
  function project(i, y = TILE_H){
    const r = rectU(i);
    v3.set(r.x + r.w / 2 - HALF, y, r.y + r.h / 2 - HALF).project(camera);
    return {x:(v3.x + 1) / 2 * W, y:(1 - v3.y) / 2 * H};
  }
  function projW(x, y, z){ v3.set(x, y, z).project(camera); return {x:(v3.x + 1) / 2 * W, y:(1 - v3.y) / 2 * H}; }
  // the biggest flat rectangle that fits inside the centre court on screen
  function innerRect(){
    const h = 4.5 * U - .1;
    const tl = projW(-h, COURT_Y, -h), tr = projW(h, COURT_Y, -h), bl = projW(-h, COURT_Y, h);
    return {l:tl.x, t:tl.y, r:tr.x, b:bl.y};
  }

  /* ---------- picking ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function tileAt(e){
    const r = cvs.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(tiles, false)[0];
    return hit ? hit.object.userData.i : -1;
  }
  let hover = -1, down = null;
  cvs.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const i = tileAt(e);
    if (i !== hover){ hover = i; cvs.style.cursor = i >= 0 ? 'pointer' : ''; dirty = 3; }
  });
  cvs.addEventListener('pointerleave', () => { if (hover >= 0){ hover = -1; cvs.style.cursor = ''; dirty = 3; } });
  cvs.addEventListener('pointerdown', e => { down = {x:e.clientX, y:e.clientY}; });
  cvs.addEventListener('pointerup', e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10; down = null;
    if (moved) return;
    const i = tileAt(e); if (i >= 0) onPick(i);
  });

  /* ---------- per-render board state ---------- */
  let hl = -1;
  function update(s){
    hl = s.phase === 'buy' ? s.buy : s.phase === 'auction' && s.auction ? s.auction.sp : -1;
    for (let i = 0; i < 40; i++){
      const t = tiles[i], top = t.userData.top;
      const mort = !!(s.mort && s.mort[i]);
      top.color.setHex(mort ? 0x8d8a86 : 0xffffff);
      t.userData.mort = mort;
      if (plates[i]){
        const o = s.own[i];
        plates[i].visible = o >= 0;
        if (o >= 0){ plates[i].material.color.set(s.players[o].color); plates[i].material.emissive.set(s.players[o].color); plates[i].material.emissiveIntensity = .18; }
      }
      if (blds[i]) setBuildings(i, s.bld[i] || 0);
    }
    const jt = s.opts && s.opts.jackpot ? `Jackpot $${Math.round(s.jackpot).toLocaleString('en-CA')}` : 'Rest stop';
    if (jt !== jackpotText){ jackpotText = jt; paintAtlas(); }
    dirty = 3;
  }

  /* ---------- loop ---------- */
  let dirty = 3, raf = 0, lastDraw = 0, alive = true;
  function frame(now){
    raf = requestAnimationFrame(frame);
    let moving = stepDice(now);
    for (const t of toks){
      if (!t.grp.visible) continue;
      if (t.dur){
        const p = Math.min(1, (now - t.t0) / t.dur);
        t.grp.position.lerpVectors(t.from, t.to, p);
        t.grp.position.y = TILE_H + Math.sin(p * Math.PI) * .35;
        if (p >= 1){ t.dur = 0; t.grp.position.copy(t.to); }
        moving = true;
      } else t.grp.position.y = TILE_H + (t.on && !reduced ? (Math.sin(now / 260) + 1) * .025 : 0);
      t.ring.visible = t.on;
      if (t.on){ const k = 1 + Math.sin(now / 300) * .08; t.ring.scale.setScalar(k); t.ring.material.opacity = .55 + Math.sin(now / 300) * .3; }
    }
    for (let i = 0; i < 40; i++){
      const t = tiles[i], u = t.userData;
      const want = (i === hl ? .14 : i === hover ? .06 : 0) - (u.mort ? .03 : 0);
      if (Math.abs(u.lift - want) > .001){ u.lift += (want - u.lift) * .2; moving = true; } else u.lift = want;
      t.position.y = u.baseY + u.lift;
      u.top.emissiveIntensity = i === hl ? .22 + Math.sin(now / 220) * .12 : i === hover ? .08 : 0;
    }
    for (const b of blds){
      if (!b || !b.born) continue;
      const p = Math.min(1, (now - b.born) / 420);
      const s = p < 1 ? 1 + Math.sin(p * Math.PI) * .35 - (1 - p) * (1 - p) : 1;
      b.grp.scale.setScalar(Math.max(.01, s));
      if (p >= 1) b.born = 0;
      moving = true;
    }
    const active = moving || dirty > 0 || hl >= 0 || toks.some(t => t.on && t.grp.visible);
    if (!active) return;
    // idle pulses only need ~30fps
    if (!moving && dirty <= 0 && now - lastDraw < 32) return;
    if (dirty > 0) dirty--;
    lastDraw = now;
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);
  new ResizeObserver(() => { if (alive) resize(); }).observe(host);
  resize();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { paintAtlas(); dirty = 3; });

  return {
    resize, update, buildTokens, setToken, setDice, roll, project, innerRect,
    get canvas(){ return cvs; },
    poke(){ dirty = 3; },
    dispose(){ alive = false; cancelAnimationFrame(raf); renderer.dispose(); cvs.remove(); }
  };
}
