// Procedural CanvasTextures for the track (Agent 1 — World). No external assets.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat = true, anisotropy = 8, srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(c);
  if (repeat) { tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; }
  tex.anisotropy = anisotropy;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function speckle(ctx, w, h, count, colors, rand, minS = 1, maxS = 2.5) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(rand() * colors.length) | 0];
    const s = minS + rand() * (maxS - minS);
    ctx.fillRect(rand() * w, rand() * h, s, s);
  }
}

// Asphalt: u across road (0 = left edge, 1 = right edge), v along the road.
export function makeAsphaltTexture(o = {}) {
  const W = 512, H = 512;
  const [c, ctx] = canvas(W, H);
  const rand = rng(11);
  ctx.fillStyle = o.base || '#5b5f68';
  ctx.fillRect(0, 0, W, H);
  // large soft blotches
  for (let i = 0; i < 60; i++) {
    const x = rand() * W, y = rand() * H, r = 20 + rand() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rand() < 0.5;
    g.addColorStop(0, dark ? (o.blotchDark || 'rgba(40,42,48,0.18)') : (o.blotchLight || 'rgba(120,124,132,0.14)'));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  speckle(ctx, W, H, 9000, o.specks || ['#4a4e56', '#6d717b', '#7d818a', '#3f424a', '#62666f'], rand, 1, 2.2);
  // subtle tire-wear darker lanes along the racing grooves
  for (const cx of [0.3, 0.7]) {
    const g = ctx.createLinearGradient(W * (cx - 0.12), 0, W * (cx + 0.12), 0);
    g.addColorStop(0, 'rgba(30,30,36,0)');
    g.addColorStop(0.5, 'rgba(30,30,36,0.16)');
    g.addColorStop(1, 'rgba(30,30,36,0)');
    ctx.fillStyle = g;
    ctx.fillRect(W * (cx - 0.12), 0, W * 0.24, H);
  }
  // edge lines (solid white)
  ctx.fillStyle = o.edge || '#f4f4f0';
  ctx.fillRect(W * 0.035, 0, W * 0.022, H);
  ctx.fillRect(W * (1 - 0.057), 0, W * 0.022, H);
  // dashed centre line (yellow)
  ctx.fillStyle = o.centre || '#ffd54a';
  for (let y = 0; y < H; y += 256) ctx.fillRect(W * 0.5 - 5, y + 40, 10, 150);
  // faint lane dashes (white)
  ctx.fillStyle = o.lane || 'rgba(245,245,240,0.55)';
  for (const lx of [0.27, 0.73]) for (let y = 0; y < H; y += 256) ctx.fillRect(W * lx - 3, y + 170, 6, 70);
  return finish(c, { anisotropy: 16 });
}

// Red/white rumble strip: u across (0..1), v along (one red + one white block per repeat)
export function makeCurbTexture(cols) {
  const [c, ctx] = canvas(64, 128);
  ctx.fillStyle = (cols && cols[0]) || '#e8322f'; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = (cols && cols[1]) || '#fbfbf7'; ctx.fillRect(0, 64, 64, 64);
  // bevel shading
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.25)');
  g.addColorStop(0.2, 'rgba(0,0,0,0)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.1)');
  g.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 128);
  return finish(c);
}

// Offroad band grass: tileable noisy grass with mowing stripes along v.
export function makeGrassTexture(o = {}) {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const rand = rng(23);
  ctx.fillStyle = o.base || '#6fbf3f'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, 0, W, H / 2);
  speckle(ctx, W, H, 5000, o.specks || ['#5eae34', '#7fcf4b', '#68b83a', '#8ad656', '#57a22f'], rand, 1, 3);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = (o.flowers || ['#ffe66b', '#ffffff', '#ff8fb1'])[(rand() * 3) | 0];
    ctx.fillRect(rand() * W, rand() * H, 2, 2);
  }
  return finish(c);
}

export function makeSandTexture(o = {}) {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const rand = rng(31);
  ctx.fillStyle = o.base || '#e9cf92'; ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 6000, o.specks || ['#dcc080', '#f3dca6', '#d2b574', '#efd79c'], rand, 1, 2.5);
  if (o.ripples) {
    ctx.strokeStyle = o.ripples; ctx.lineWidth = 2;
    for (let y = 8; y < H; y += 22) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) ctx.lineTo(x, y + Math.sin((x / W) * Math.PI * 4 + y) * 4);
      ctx.stroke();
    }
  }
  return finish(c);
}

// Fresh snow with blue shadows and sparkles.
export function makeSnowTexture() {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const rand = rng(37);
  ctx.fillStyle = '#eef5fb'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    const x = rand() * W, y = rand() * H, r = 10 + rand() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(170,200,230,0.25)'); g.addColorStop(1, 'rgba(170,200,230,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  speckle(ctx, W, H, 3000, ['#dfeaf5', '#ffffff', '#d3e2f0', '#f6fbff'], rand, 1, 2.5);
  return finish(c);
}

// City sidewalk: light concrete slabs with joints.
export function makePavementTexture() {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const rand = rng(43);
  ctx.fillStyle = '#8d929c'; ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 4000, ['#7f848e', '#9a9fa8', '#858a94', '#a3a8b0'], rand, 1, 2);
  ctx.strokeStyle = 'rgba(40,44,52,0.55)'; ctx.lineWidth = 2;
  for (let x = 0; x <= W; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  return finish(c);
}

// Cooled basalt shoulder (volcano): dark rock with faint orange cracks.
export function makeBasaltTexture() {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const rand = rng(47);
  ctx.fillStyle = '#3a3233'; ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 5000, ['#2b2526', '#463c3c', '#332c2d', '#4e4343'], rand, 1, 3);
  ctx.strokeStyle = 'rgba(255,110,30,0.55)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 18; i++) {
    let x = rand() * W, y = rand() * H;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (rand() - 0.5) * 40; y += (rand() - 0.5) * 40; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  return finish(c);
}

// Molten lava: bright orange/yellow flow with dark crust plates. Scrolled in update().
export function makeLavaTexture() {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const rand = rng(53);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#ff5a00'); g.addColorStop(0.5, '#ffb000'); g.addColorStop(1, '#ff5a00');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    const x = rand() * W, y = rand() * H, r = 6 + rand() * 22;
    const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
    gg.addColorStop(0, 'rgba(255,240,150,0.7)'); gg.addColorStop(1, 'rgba(255,240,150,0)');
    ctx.fillStyle = gg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 26; i++) {
    const x = rand() * W, y = rand() * H, w = 10 + rand() * 30, h = 6 + rand() * 18;
    ctx.fillStyle = `rgba(${60 + rand() * 40 | 0},${20 + rand() * 20 | 0},15,0.85)`;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; ctx.lineTo(x + Math.cos(a) * w * (0.6 + rand() * 0.4), y + Math.sin(a) * h * (0.6 + rand() * 0.4)); }
    ctx.closePath(); ctx.fill();
  }
  return finish(c);
}

// Rough rock (gap floor / cliff faces).
export function makeRockTexture(o = {}) {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const rand = rng(59);
  ctx.fillStyle = o.base || '#b0643a'; ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 5000, o.specks || ['#9a5530', '#c27447', '#a35b33', '#8a4a2a', '#cc8a5c'], rand, 1, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < H; y += 32) ctx.fillRect(0, y + rand() * 8, W, 3);
  return finish(c);
}

// Building facade: a 4x4 grid of windows, some lit. `lit` builds the matching emissive map (only lit panes glow).
export function makeWindowTexture({ lit = false, seed = 61 } = {}) {
  const W = 128, H = 128;
  const [c, ctx] = canvas(W, H);
  const rand = rng(seed);
  ctx.fillStyle = lit ? '#000000' : '#30364a'; ctx.fillRect(0, 0, W, H);
  const cols = ['#ffe9a8', '#fff4d6', '#9fe8ff', '#ffc9f0', '#ffd27a'];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const on = rand() < 0.55;
    const col = cols[(rand() * cols.length) | 0];
    if (lit) ctx.fillStyle = on ? col : '#000000';
    else ctx.fillStyle = on ? col : '#475071';
    ctx.fillRect(x * 32 + 6, y * 32 + 7, 20, 18);
  }
  return finish(c);
}

// Weathered temple stone blocks (jungle).
export function makeStoneTexture() {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const rand = rng(67);
  ctx.fillStyle = '#9c9a86'; ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 4000, ['#8b8975', '#aaa894', '#7f7d6b', '#b5b39f'], rand, 1, 3);
  ctx.strokeStyle = 'rgba(50,50,40,0.6)'; ctx.lineWidth = 3;
  for (let r = 0; r < 4; r++) {
    const y = r * 64;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    for (let x = (r % 2) * 48; x < W; x += 96) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 64); ctx.stroke(); }
  }
  ctx.fillStyle = 'rgba(70,120,50,0.35)';
  for (let i = 0; i < 30; i++) ctx.fillRect(rand() * W, rand() * H, 4 + rand() * 18, 3 + rand() * 8);
  return finish(c);
}

export function makeConcreteTexture() {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const rand = rng(41);
  ctx.fillStyle = '#b9bcc2'; ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 4000, ['#a8abb2', '#c7cad0', '#9fa3aa'], rand, 1, 2);
  ctx.strokeStyle = 'rgba(80,80,90,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(W, 1); ctx.stroke();
  return finish(c);
}

// Colourful sponsor-style barrier panels. u along wall, v up the wall.
export function makeBarrierTexture(custom) {
  const W = 1024, H = 128;
  const [c, ctx] = canvas(W, H);
  const panels = custom || [
    { bg: '#1e6fe8', fg: '#ffffff', text: 'BDB' },
    { bg: '#ffd21f', fg: '#e8322f', text: 'KARTS' },
    { bg: '#e8322f', fg: '#ffffff', text: 'ONLINE' },
    { bg: '#ffffff', fg: '#1e6fe8', text: '★ GO! ★' },
  ];
  const pw = W / panels.length;
  panels.forEach((p, i) => {
    ctx.fillStyle = p.bg; ctx.fillRect(i * pw, 0, pw, H);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(i * pw, 0, pw, 18);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(i * pw, H - 18, pw, 18);
    ctx.fillStyle = p.fg;
    ctx.font = 'bold 72px "Lilita One", "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.text, i * pw + pw / 2, H / 2 + 4);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(i * pw, 0, 4, H);
  });
  return finish(c);
}

// Bridge parapet: blue & white chevron bands. u along, v up
export function makeRailTexture(cols) {
  const W = 256, H = 64;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = (cols && cols[0]) || '#f5f7fa'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = (cols && cols[1]) || '#2563d9';
  for (let x = -H; x < W + H; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, H); ctx.lineTo(x + 32, H); ctx.lineTo(x + 32 + H, 0); ctx.lineTo(x + H, 0);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#c9ced6'; ctx.fillRect(0, 0, W, 6); ctx.fillRect(0, H - 6, W, 6);
  return finish(c);
}

// Boost pad: chevrons pointing toward +v (race direction). Scrolled in update().
export function makeBoostTexture() {
  const W = 128, H = 256;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#ff7a00'); g.addColorStop(0.5, '#ffb300'); g.addColorStop(1, '#ff7a00');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 2; k++) {
    const y0 = k * 128;
    ctx.fillStyle = '#fff6c2';
    ctx.beginPath();
    ctx.moveTo(14, y0 + 96); ctx.lineTo(64, y0 + 30); ctx.lineTo(114, y0 + 96);
    ctx.lineTo(114, y0 + 124); ctx.lineTo(64, y0 + 58); ctx.lineTo(14, y0 + 124);
    ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = '#7a2a00'; ctx.lineWidth = 8; ctx.strokeRect(4, -10, W - 8, H + 20);
  return finish(c);
}

// Jump ramp top: blue/white stripes with yellow arrow; v along ramp.
export function makeRampTexture(cols) {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? ((cols && cols[0]) || '#1e88e5') : ((cols && cols[1]) || '#e3f2fd');
    ctx.fillRect(i * 32, 0, 32, H);
  }
  ctx.fillStyle = (cols && cols[2]) || '#ffd21f';
  ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(128, 20); ctx.lineTo(210, 120); ctx.lineTo(160, 120); ctx.lineTo(160, 236);
  ctx.lineTo(96, 236); ctx.lineTo(96, 120); ctx.lineTo(46, 120); ctx.closePath();
  ctx.fill(); ctx.stroke();
  return finish(c, { repeat: false });
}

export function makeCheckerTexture(cols = 8, rows = 2) {
  const S = 32;
  const [c, ctx] = canvas(cols * S, rows * S);
  for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) {
    ctx.fillStyle = (x + y) % 2 ? '#111318' : '#fafafa';
    ctx.fillRect(x * S, y * S, S, S);
  }
  const t = finish(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function makeBannerTexture(title, o = {}) {
  const W = 1024, H = 128;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, o.top || '#ff4d3d'); g.addColorStop(1, o.bottom || '#c81e1e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // checkered ends
  const S = 16;
  for (const x0 of [0, W - 96]) for (let x = 0; x < 6; x++) for (let y = 0; y < 8; y++) {
    ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff';
    ctx.fillRect(x0 + x * S, y * S, S, S);
  }
  ctx.fillStyle = o.band || '#ffd21f';
  ctx.fillRect(96, 0, W - 192, 8); ctx.fillRect(96, H - 8, W - 192, 8);
  ctx.font = 'bold 78px "Lilita One", "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 10; ctx.strokeStyle = o.stroke || '#7a0d0d';
  ctx.strokeText(title, W / 2, H / 2 + 5);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(title, W / 2, H / 2 + 5);
  return finish(c, { repeat: false });
}

// Stand canopy stripes
export function makeStripeTexture(a = '#ffffff', b = '#e8322f', n = 8) {
  const [c, ctx] = canvas(256, 16);
  for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? b : a; ctx.fillRect(i * 256 / n, 0, 256 / n, 16); }
  return finish(c);
}
