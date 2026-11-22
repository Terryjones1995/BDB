/* BDB Craft: every block texture, drawn pixel by pixel in code at 16 x 16 and doubled to 32 (the BDB Block is the one drawn at full size, from his photo).
   Nothing is copied from any other game: each one is a little recipe of colours, noise and shapes. Also the cube icons for the hotbar and inventory. */
import { TEX, T, COLOURS, BLOCKS, FACE, SHAPE, SH } from './blocks.js?v=c12';
import { boxes } from './shapes.js?v=c12';
export const TS = 32;
const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const mul = (c, f) => c.map(v => v * f);
function rng(seed){ let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hashStr = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
/* a 16 x 16 picture: rgba per pixel */
class Pic {
  constructor(seed){ this.d = new Float32Array(16 * 16 * 4); this.r = rng(seed); }
  set(x, y, c, a = 255){ if (x < 0 || y < 0 || x > 15 || y > 15) return; const i = ((y & 15) * 16 + (x & 15)) * 4; this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a; }
  get(x, y){ const i = ((y & 15) * 16 + (x & 15)) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2]]; }
  alpha(x, y){ return this.d[((y & 15) * 16 + (x & 15)) * 4 + 3]; }
  fill(c, v = 0, a = 255){ for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) this.set(x, y, mul(c, 1 + (this.r() - .5) * v), a); return this; }
  each(f){ for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f(x, y); return this; }
  speck(c, n, v = .1, size = 1){ for (let k = 0; k < n; k++){ const x = this.r() * 16 | 0, y = this.r() * 16 | 0, cc = mul(c, 1 + (this.r() - .5) * v); for (let i = 0; i < size; i++) this.set(x + (i % 2), y + (i >> 1), cc); } return this; }
  blob(c, n, r0, r1, v = .1){ for (let k = 0; k < n; k++){ const cx = this.r() * 16, cy = this.r() * 16, r = r0 + this.r() * (r1 - r0), cc = mul(c, 1 + (this.r() - .5) * v);
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx + .5) ** 2 + (y - cy + .5) ** 2 <= r * r + this.r() * .8) this.set((x + 16) % 16, (y + 16) % 16, mul(cc, 1 + (this.r() - .5) * v)); } return this; }
}
/* cells: each pixel takes the colour of its nearest seed point, with dark seams between (cobblestone, gravel) */
function cells(p, n, pal, seam){
  const pts = Array.from({length:n}, () => [p.r() * 16, p.r() * 16, pal[p.r() * pal.length | 0], .85 + p.r() * .3]);
  p.each((x, y) => { let a = 1e9, b = 1e9, ia = 0; for (let i = 0; i < n; i++) for (const ox of [-16, 0, 16]) for (const oy of [-16, 0, 16]){ const d = (x + .5 - pts[i][0] - ox) ** 2 + (y + .5 - pts[i][1] - oy) ** 2; if (d < a){ b = a; a = d; ia = i; } else if (d < b) b = d; }
    const edge = Math.sqrt(b) - Math.sqrt(a) < 1.1; p.set(x, y, edge ? mul(seam, .9 + p.r() * .2) : mul(pts[ia][2], pts[ia][3] * (.93 + p.r() * .14))); });
  return p;
}
function planks(p, base){
  const c = rgb(base), tone = [1, .92, 1.04, .96];
  p.each((x, y) => { const b = y >> 2, row = y & 3, k = tone[b]; let f = k * (.94 + p.r() * .1); if (row === 3) f *= .62; else if (row === 0) f *= 1.06; if (((x + b * 5) % 16) === 0 && row !== 3) f *= .7; p.set(x, y, mul(c, f)); });
  for (let k = 0; k < 10; k++){ const y = p.r() * 16 | 0; if ((y & 3) === 3) continue; const x = p.r() * 14 | 0; p.set(x, y, mul(p.get(x, y), .85)); p.set(x + 1, y, mul(p.get(x + 1, y), .85)); }
  return p;
}
function bark(p, base, light){ const c = rgb(base), l = light ? rgb(light) : null;
  p.each((x, y) => { const s = Math.sin(x * 1.7 + p.r() * .6) * .5 + .5; let f = .78 + s * .3 + (p.r() - .5) * .12; p.set(x, y, mul(c, f)); });
  if (l){ for (let k = 0; k < 14; k++){ const x = p.r() * 16 | 0, y = p.r() * 16 | 0, w = 1 + (p.r() * 3 | 0); for (let i = 0; i < w; i++) p.set(x + i, y, mul(l, .9 + p.r() * .15)); } }
  return p;
}
function rings(p, wood, barkC){ const w = rgb(wood), b = rgb(barkC);
  p.each((x, y) => { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)), r = Math.hypot(x - 7.5, y - 7.5) * .55 + d * .45;
    if (d >= 7) p.set(x, y, mul(b, .8 + p.r() * .25)); else p.set(x, y, mul(w, (Math.floor(r) % 2 ? .86 : 1.02) * (.95 + p.r() * .08))); });
  return p;
}
function leaves(p, base){ const c = rgb(base);
  p.each((x, y) => { const v = p.r(); if (v < .2) p.set(x, y, [0, 0, 0], 0); else p.set(x, y, mul(c, .72 + p.r() * .5)); });
  return p.blob(mul(c, 1.25), 4, .8, 1.5, .1);
}
function ore(seed, colour, dark){ const p = stone(seed), c = rgb(colour), d = rgb(dark);
  for (let k = 0; k < 5; k++){ const x = 2 + p.r() * 12 | 0, y = 2 + p.r() * 12 | 0; p.set(x, y, c); p.set(x + 1, y, mul(c, .85)); p.set(x, y + 1, d); if (p.r() < .6) p.set(x + 1, y + 1, c); if (p.r() < .4) p.set(x - 1, y, mul(c, 1.1)); }
  return p;
}
function stone(seed){ const p = new Pic(seed); p.fill(rgb('#7f7f7f'), .1); p.blob(rgb('#6d6d6d'), 7, .6, 1.6, .08); p.blob(rgb('#8f8f8f'), 5, .5, 1.2, .06); return p; }
function metal(seed, base, hi, lo){ const p = new Pic(seed), c = rgb(base), h = rgb(hi), l = rgb(lo);
  p.each((x, y) => { let col = mul(c, .96 + p.r() * .06); if (x === 0 || y === 0) col = h; else if (x === 15 || y === 15) col = l; else if ((x === 1 && y < 15) || (y === 1 && x < 15)) col = mix(c, h, .5); p.set(x, y, col); });
  for (let k = 0; k < 3; k++){ const x = 3 + p.r() * 10 | 0, y = 3 + p.r() * 10 | 0; p.set(x, y, h); p.set(x + 1, y + 1, mix(c, h, .4)); }
  return p;
}
function bricks(p, brick, mortar, tall = 4, wide = 8){ const b = rgb(brick), m = rgb(mortar);
  p.each((x, y) => { const row = Math.floor(y / tall), off = row % 2 ? wide / 2 : 0, bx = (x + off) % wide; if (y % tall === tall - 1 || bx === wide - 1) p.set(x, y, mul(m, .95 + p.r() * .1)); else p.set(x, y, mul(b, (.9 + p.r() * .16) * (1 + ((row * 7 + Math.floor((x + off) / wide) * 3) % 5 - 2) * .03))); });
  return p;
}
function cross(p, draw){ p.each((x, y) => p.set(x, y, [0, 0, 0], 0)); draw(p); return p; }
function glassPane(p, tint, a){ const c = tint ? rgb(tint) : [235, 245, 250];
  p.each((x, y) => { const edge = x === 0 || y === 0 || x === 15 || y === 15; if (edge) p.set(x, y, tint ? mul(c, .75) : [196, 214, 222], tint ? 235 : 255); else p.set(x, y, tint ? c : [214, 232, 240], tint ? a : 34); });
  for (const [x, y] of [[3, 4], [4, 3], [5, 2], [10, 11], [11, 10], [12, 9], [4, 5]]) p.set(x, y, tint ? mul(c, 1.35) : [255, 255, 255], tint ? Math.min(255, a + 60) : 200);
  return p;
}
const R = {
  stone:s => stone(s),
  dirt:s => new Pic(s).fill(rgb('#86603f'), .16).blob(rgb('#6f4d33'), 6, .5, 1.1, .1).speck(rgb('#a07c58'), 10, .1),
  grass_top:s => { const p = new Pic(s).fill(rgb('#5c9e35'), .3); p.speck(rgb('#79c24c'), 22, .15); p.speck(rgb('#467e28'), 18, .15); return p; },
  grass_side:s => { const p = R.dirt(s), g = rgb('#5c9e35'); for (let x = 0; x < 16; x++){ const h = 3 + (p.r() * 2.4 | 0); for (let y = 0; y < h; y++) p.set(x, y, mul(g, .8 + p.r() * .4)); if (p.r() < .3) p.set(x, h, mul(g, .7)); } return p; },
  cobble:s => cells(new Pic(s), 11, [rgb('#7c7c7c'), rgb('#8f8f8f'), rgb('#6c6c6c'), rgb('#999999')], rgb('#4a4a4a')),
  planks_oak:s => planks(new Pic(s), '#a3824f'), planks_birch:s => planks(new Pic(s), '#d5c58c'), planks_spruce:s => planks(new Pic(s), '#6f5233'), planks_dark:s => planks(new Pic(s), '#4b3219'),
  log_oak:s => bark(new Pic(s), '#6b5132'), log_oak_top:s => rings(new Pic(s), '#b29262', '#5f4529'),
  log_birch:s => { const p = new Pic(s).fill(rgb('#e3e0d3'), .08); for (let k = 0; k < 9; k++){ const x = p.r() * 14 | 0, y = p.r() * 16 | 0, w = 2 + (p.r() * 3 | 0); for (let i = 0; i < w; i++) p.set(x + i, y, rgb('#2e2b25')); } return p; },
  log_birch_top:s => rings(new Pic(s), '#d6c79a', '#e0ddd0'),
  log_spruce:s => bark(new Pic(s), '#3d2b17'), log_spruce_top:s => rings(new Pic(s), '#7d5c38', '#3a2914'),
  log_dark:s => bark(new Pic(s), '#3a2817'), log_dark_top:s => rings(new Pic(s), '#5a3e22', '#2f2010'),
  leaves_oak:s => leaves(new Pic(s), '#3f8a2c'), leaves_birch:s => leaves(new Pic(s), '#6c9a3c'), leaves_spruce:s => leaves(new Pic(s), '#2f5b33'), leaves_dark:s => leaves(new Pic(s), '#2e6a1f'),
  sand:s => new Pic(s).fill(rgb('#dccf9c'), .1).speck(rgb('#c9b981'), 16, .1).speck(rgb('#efe6bd'), 10, .05),
  sandstone:s => { const p = new Pic(s).fill(rgb('#d8c88f'), .08); for (let x = 0; x < 16; x++){ p.set(x, 0, rgb('#e6d9a6')); p.set(x, 3, rgb('#c4b277')); p.set(x, 12, rgb('#c4b277')); p.set(x, 15, rgb('#bfac70')); } return p.speck(rgb('#cdbb80'), 8, .1); },
  sandstone_top:s => new Pic(s).fill(rgb('#ddd09a'), .06).speck(rgb('#cfc088'), 8, .1),
  gravel:s => cells(new Pic(s), 14, [rgb('#8a8580'), rgb('#6f6a66'), rgb('#9e958d'), rgb('#7d746c')], rgb('#5a5450')),
  snow:s => new Pic(s).fill(rgb('#f2fafa'), .04).speck(rgb('#dbecf2'), 12, .05),
  grass_snow:s => { const p = R.dirt(s); for (let x = 0; x < 16; x++){ const h = 3 + (p.r() * 2.6 | 0); for (let y = 0; y < h; y++) p.set(x, y, mul(rgb('#f2fafa'), .94 + p.r() * .06)); } return p; },
  ice:s => { const p = new Pic(s).fill(rgb('#93b8f0'), .06); for (let k = 0; k < 4; k++){ const x0 = p.r() * 16 | 0, y0 = p.r() * 16 | 0, n = 3 + (p.r() * 4 | 0); for (let i = 0; i < n; i++) p.set(x0 + i, y0 - i, rgb('#d8e8fc')); } return p; },
  water:s => { const p = new Pic(s); p.each((x, y) => p.set(x, y, mul(rgb('#2f63c8'), .9 + Math.sin((x + y * .5) * .8 + p.r() * .5) * .08 + p.r() * .05), 170)); for (let k = 0; k < 6; k++){ const x = p.r() * 13 | 0, y = p.r() * 16 | 0; for (let i = 0; i < 3; i++) p.set(x + i, y, rgb('#6f9be8'), 190); } return p; },
  glass:s => glassPane(new Pic(s)),
  bricks:s => bricks(new Pic(s), '#9a4b3a', '#b8ab9c'), stone_bricks:s => bricks(new Pic(s), '#7b7b7b', '#5c5c5c', 8, 16),
  mossy_cobble:s => { const p = R.cobble(s); p.blob(rgb('#57793a'), 5, .8, 1.8, .2); return p; },
  clay:s => new Pic(s).fill(rgb('#a1a7b3'), .06).speck(rgb('#8f95a2'), 10, .05),
  ore_coal:s => ore(s, '#2b2b2b', '#151515'), ore_iron:s => ore(s, '#d8af93', '#a87e62'), ore_gold:s => ore(s, '#f6d33d', '#c49a1c'), ore_diamond:s => ore(s, '#6ff0e4', '#2fb5ab'),
  ore_emerald:s => ore(s, '#3ee07a', '#1d9a4c'), ore_ruby:s => ore(s, '#e8384a', '#a1162a'),
  block_gold:s => metal(s, '#f5c934', '#fff3a6', '#b78a16'), block_iron:s => metal(s, '#d8d8d8', '#ffffff', '#9a9a9a'), block_diamond:s => metal(s, '#5fe3d6', '#d6fffb', '#2a9e95'), block_emerald:s => metal(s, '#2fcf6c', '#b9ffd0', '#17834a'),
  bookshelf:s => { const p = planks(new Pic(s), '#a3824f'), cols = ['#8e2a2a', '#2d4f8e', '#2e7a3a', '#a8862c', '#6b2f7a', '#7a4a22'];
    for (const y0 of [1, 9]){ let x = 1; while (x < 15){ const w = 1 + (p.r() * 2 | 0), c = rgb(cols[p.r() * cols.length | 0]), h = 5 + (p.r() * 2 | 0); for (let i = 0; i < w && x < 15; i++, x++) for (let y = y0 + 6 - h; y < y0 + 6; y++) p.set(x, y, mul(c, (i === 0 ? 1.15 : .95) * (.95 + p.r() * .1))); } } return p; },
  lamp:s => { const p = new Pic(s).fill(rgb('#f2b84b'), .1); p.each((x, y) => { if (x % 5 === 0 || y % 5 === 0) p.set(x, y, mul(rgb('#a8692a'), .9 + p.r() * .2)); }); p.blob(rgb('#fff1b8'), 6, .5, 1.1, .05); return p; },
  obsidian:s => new Pic(s).fill(rgb('#1a1226'), .2).blob(rgb('#3b2856'), 5, .5, 1.2, .2).speck(rgb('#5a3d82'), 6, .1),
  bedrock:s => cells(new Pic(s), 12, [rgb('#555555'), rgb('#2e2e2e'), rgb('#777777'), rgb('#404040')], rgb('#151515')),
  cactus_side:s => { const p = new Pic(s); p.each((x, y) => { const rib = x % 4 === 0 ? .7 : x % 4 === 2 ? 1.12 : 1; p.set(x, y, mul(rgb('#4e8b2e'), rib * (.92 + p.r() * .14))); }); for (let k = 0; k < 10; k++) p.set((p.r() * 4 | 0) * 4 + 2, p.r() * 16 | 0, rgb('#e8e3b0')); return p; },
  cactus_top:s => { const p = new Pic(s); p.each((x, y) => { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); p.set(x, y, mul(rgb('#5a9a36'), (d > 6.5 ? .7 : Math.floor(d) % 3 === 0 ? 1.12 : 1) * (.93 + p.r() * .1))); }); return p; },
  pumpkin_side:s => { const p = new Pic(s); p.each((x, y) => p.set(x, y, mul(rgb('#d9821c'), (x % 5 === 0 ? .72 : 1) * (.92 + p.r() * .12) * (y === 0 || y === 15 ? .85 : 1)))); return p; },
  pumpkin_top:s => { const p = R.pumpkin_side(s); for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) p.set(x, y, mul(rgb('#5c7a26'), .9 + p.r() * .2)); return p; },
  melon_side:s => { const p = new Pic(s); p.each((x, y) => p.set(x, y, mul(x % 4 < 2 ? rgb('#5b8f24') : rgb('#3f6c18'), .9 + p.r() * .15))); return p; },
  melon_top:s => { const p = new Pic(s).fill(rgb('#4e7f20'), .12); p.blob(rgb('#6b9e2c'), 4, 1, 2, .1); return p; },
  hay_side:s => { const p = new Pic(s); p.each((x, y) => p.set(x, y, mul(rgb('#c9a83b'), (x % 3 === 0 ? .8 : 1) * (.9 + p.r() * .16)))); for (const y of [3, 4, 11, 12]) for (let x = 0; x < 16; x++) p.set(x, y, mul(rgb('#8a4b2a'), .9 + p.r() * .2)); return p; },
  hay_top:s => { const p = new Pic(s).fill(rgb('#c9a83b'), .18); p.each((x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); if (Math.floor(d * 1.3) % 2) p.set(x, y, mul(p.get(x, y), .85)); }); return p; },
  smooth_stone:s => { const p = new Pic(s).fill(rgb('#a3a3a3'), .04); for (let i = 0; i < 16; i++){ p.set(i, 0, rgb('#b8b8b8')); p.set(0, i, rgb('#b8b8b8')); p.set(i, 15, rgb('#808080')); p.set(15, i, rgb('#808080')); } return p; },
  terracotta:s => new Pic(s).fill(rgb('#9c5a3c'), .08).speck(rgb('#8c4e32'), 10, .05),
  chiseled:s => { const p = new Pic(s).fill(rgb('#7d7d7d'), .06), hi = rgb('#9a9a9a'), lo = rgb('#555555');
    p.each((x, y) => { if (x === 0 || y === 0) p.set(x, y, hi); else if (x === 15 || y === 15) p.set(x, y, lo); });
    for (let i = 3; i <= 12; i++){ p.set(i, 3, lo); p.set(3, i, lo); p.set(i, 12, hi); p.set(12, i, hi); }
    for (let i = 6; i <= 9; i++){ p.set(i, 6, lo); p.set(6, i, lo); p.set(i, 9, hi); p.set(9, i, hi); }
    return p; },
  tall_grass:s => cross(new Pic(s), p => { for (let k = 0; k < 7; k++){ let x = 1 + p.r() * 14, h = 7 + p.r() * 8; const dx = (p.r() - .5) * .5, c = mul(rgb('#5c9e35'), .75 + p.r() * .5); for (let y = 15; y > 15 - h; y--){ p.set(x | 0, y, mul(c, .8 + (15 - y) / h * .4)); x += dx; } } }),
  flower_red:s => cross(new Pic(s), p => { for (let y = 8; y < 16; y++) p.set(8, y, rgb('#3f7f2a')); p.set(7, 12, rgb('#4f9a33')); p.set(9, 11, rgb('#4f9a33')); for (const [x, y] of [[8, 4], [7, 5], [9, 5], [8, 6], [7, 4], [9, 6], [6, 5], [10, 5], [8, 3], [7, 6], [9, 4]]) p.set(x, y, mul(rgb('#d8282e'), .9 + p.r() * .2)); p.set(8, 5, rgb('#f5d23a')); }),
  flower_yellow:s => cross(new Pic(s), p => { for (let y = 9; y < 16; y++) p.set(8, y, rgb('#3f7f2a')); p.set(9, 13, rgb('#4f9a33')); for (const [x, y] of [[8, 6], [7, 7], [9, 7], [8, 8], [7, 6], [9, 8], [6, 7], [10, 7], [8, 5]]) p.set(x, y, mul(rgb('#f2cf2b'), .9 + p.r() * .2)); p.set(8, 7, rgb('#c46b1a')); }),
  dead_bush:s => cross(new Pic(s), p => { const c = rgb('#7b5a32'); const branch = (x, y, dx, n) => { for (let i = 0; i < n; i++){ p.set(Math.round(x), y, mul(c, .85 + p.r() * .3)); x += dx; y--; } }; branch(8, 15, 0, 6); branch(8, 11, -.7, 6); branch(8, 12, .8, 5); branch(5, 8, .3, 3); branch(11, 9, -.2, 4); }),
  mushroom:s => cross(new Pic(s), p => { for (let y = 10; y < 16; y++){ p.set(7, y, rgb('#e8dcc8')); p.set(8, y, rgb('#d8ccb5')); } for (let y = 5; y < 10; y++) for (let x = 4 + Math.max(0, 7 - y); x < 12 - Math.max(0, 7 - y); x++) p.set(x, y, mul(rgb('#cf2a2a'), .9 + p.r() * .15)); for (const [x, y] of [[6, 6], [9, 7], [7, 8], [10, 8]]) p.set(x, y, rgb('#f4f0e8')); }),
  quartz:s => { const p = new Pic(s).fill(rgb('#ebe5dc'), .03); for (let y = 0; y < 16; y++){ p.set(0, y, rgb('#f7f3ec')); p.set(15, y, rgb('#d3cbbe')); } return p; },
  quartz_top:s => { const p = new Pic(s).fill(rgb('#ede7de'), .03); for (let i = 0; i < 16; i++){ p.set(i, 0, rgb('#f7f3ec')); p.set(0, i, rgb('#f7f3ec')); p.set(i, 15, rgb('#d3cbbe')); p.set(15, i, rgb('#d3cbbe')); } return p; },
  basalt:s => { const p = new Pic(s); p.each((x, y) => p.set(x, y, mul(rgb('#4a4a50'), (.8 + Math.sin(x * 2.1 + y * .15) * .12) * (.92 + p.r() * .14)))); return p; },
  granite:s => new Pic(s).fill(rgb('#9a6a58'), .12).speck(rgb('#c09080'), 18, .1).speck(rgb('#6e4a3e'), 14, .1),
  mud_bricks:s => bricks(new Pic(s), '#8c6b4a', '#6d533a', 4, 8),
  crate:s => { const p = planks(new Pic(s), '#b08a52'), f = rgb('#6d5131'); for (let i = 0; i < 16; i++){ for (const k of [0, 1, 14, 15]){ p.set(i, k, mul(f, .9 + p.r() * .2)); p.set(k, i, mul(f, .9 + p.r() * .2)); } p.set(i, i, mul(f, 1.1)); p.set(i, 15 - i, mul(f, 1.1)); } return p; },
  brick_red:s => bricks(new Pic(s), '#b04a32', '#d8cfc2', 5, 8),
  tiles:s => { const p = new Pic(s); p.each((x, y) => { const g = x % 8 === 7 || y % 8 === 7, k = ((x >> 3) + (y >> 3)) % 2; p.set(x, y, g ? rgb('#8d8a80') : mul(k ? rgb('#e9e3d2') : rgb('#c9c3b2'), .96 + p.r() * .06)); }); return p; },
};
for (const [c, h] of COLOURS){
  R['wool_' + c] = s => { const p = new Pic(s), b = rgb(h); p.each((x, y) => p.set(x, y, mul(b, ((x + y) % 4 === 0 ? .9 : (x - y + 16) % 4 === 0 ? 1.06 : 1) * (.93 + p.r() * .1)))); return p; };
  R['concrete_' + c] = s => new Pic(s).fill(rgb(h), .035);
  R['glass_' + c] = s => glassPane(new Pic(s), h, 130);
}
/* ---------- the big block update: more recipes ---------- */
const P = s => new Pic(s);
function noiseFill(p, base, v = .12, dark, light, n1 = 7, n2 = 5){ p.fill(rgb(base), v); if (dark) p.blob(rgb(dark), n1, .6, 1.5, .08); if (light) p.blob(rgb(light), n2, .5, 1.2, .06); return p; }
function bevel(p, hi = 1.18, lo = .78){ p.each((x, y) => { if (x === 0 || y === 0) p.set(x, y, mul(p.get(x, y), hi)); else if (x === 15 || y === 15) p.set(x, y, mul(p.get(x, y), lo)); }); return p; }
const polishedT = (s, base, v = .05) => bevel(P(s).fill(rgb(base), v));
function tilesT(s, base, seam, n = 8){ const p = P(s).fill(rgb(base), .1), sc = rgb(seam); p.each((x, y) => { if (x % n === n - 1 || y % n === n - 1) p.set(x, y, mul(sc, .9 + p.r() * .2)); else if (x % n === 0 || y % n === 0) p.set(x, y, mul(p.get(x, y), 1.1)); }); return p; }
function pillarSide(s, base){ const p = P(s).fill(rgb(base), .05); p.each((x, y) => { if (x === 0 || x === 15) p.set(x, y, mul(rgb(base), .78)); else if (x === 1 || x === 14) p.set(x, y, mul(rgb(base), 1.1)); else if (x % 5 === 2) p.set(x, y, mul(p.get(x, y), .94)); }); return p; }
function pillarTop(s, base){ const p = P(s).fill(rgb(base), .05); p.each((x, y) => { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); if (d > 6.5) p.set(x, y, mul(rgb(base), .8)); else if (Math.floor(d) === 4) p.set(x, y, mul(rgb(base), .9)); else if (Math.floor(d) === 2) p.set(x, y, mul(rgb(base), 1.08)); }); return p; }
function chiseledT(s, base){ const p = polishedT(s, base), lo = mul(rgb(base), .7), hi = mul(rgb(base), 1.15);
  for (let i = 3; i <= 12; i++){ p.set(i, 3, lo); p.set(3, i, lo); p.set(i, 12, hi); p.set(12, i, hi); }
  for (const [x, y] of [[6, 6], [9, 6], [6, 9], [9, 9], [7, 7], [8, 8], [7, 8], [8, 7]]) p.set(x, y, lo); return p; }
function strippedSide(s, wood){ const p = P(s), c = rgb(wood); p.each((x, y) => { const g = Math.sin(x * 1.3 + Math.sin(y * .4) * .8) * .5 + .5; p.set(x, y, mul(c, (.88 + g * .16) * (.96 + p.r() * .06))); }); return p; }
const strippedTop = (s, wood) => rings(P(s), wood, mix(rgb(wood), [0, 0, 0], .1).map(v => v | 0).reduce((a, v) => a + v.toString(16).padStart(2, '0'), '#'));
function oreOn(p, colour, dark){ const c = rgb(colour), d = rgb(dark);
  for (let k = 0; k < 5; k++){ const x = 2 + p.r() * 12 | 0, y = 2 + p.r() * 12 | 0; p.set(x, y, c); p.set(x + 1, y, mul(c, .85)); p.set(x, y + 1, d); if (p.r() < .6) p.set(x + 1, y + 1, c); if (p.r() < .4) p.set(x - 1, y, mul(c, 1.1)); }
  return p; }
const deepslate = s => { const p = P(s); p.each((x, y) => p.set(x, y, mul(rgb('#4f4f55'), (.86 + Math.sin(y * 1.9 + (p.r() - .5)) * .06) * (.92 + p.r() * .14)))); return p; };
const netherrack = s => noiseFill(P(s), '#6e2b2b', .18, '#4f1b1d', '#8a3a36', 9, 7);
function flower(s, petal, centre, shape = 'round', stem = '#3f7f2a'){
  return cross(P(s), p => {
    const st = rgb(stem), pc = rgb(petal), cc = centre ? rgb(centre) : null;
    const top = shape === 'tall' ? 3 : shape === 'cluster' ? 5 : 6;
    for (let y = top + 2; y < 16; y++) p.set(8, y, mul(st, .9 + p.r() * .2)); p.set(7, 12, st); p.set(9, 13, st); p.set(6, 11, mul(st, 1.1)); p.set(10, 12, mul(st, 1.1));
    const put = (x, y, c) => p.set(x, y, mul(c, .9 + p.r() * .2));
    if (shape === 'round'){ for (const [dx, dy] of [[0, -2], [-1, -1], [1, -1], [-2, 0], [2, 0], [-1, 1], [1, 1], [0, 2], [0, -1], [-1, 0], [1, 0], [0, 1]]) put(8 + dx, top + dx * 0 + dy, pc); if (cc) p.set(8, top, cc); }
    else if (shape === 'tulip'){ for (let y = top - 1; y < top + 3; y++) for (let x = 7; x <= 9; x++) put(x, y, pc); put(6, top - 1, pc); put(10, top - 1, pc); put(8, top - 2, pc); }
    else if (shape === 'cluster'){ for (const [x, y] of [[6, 3], [8, 2], [10, 3], [7, 5], [9, 5], [5, 5], [11, 5], [8, 4], [6, 7], [10, 7]]){ put(x, y, pc); if (cc) p.set(x, y + 1, cc); } }
    else if (shape === 'bell'){ for (const [x, y] of [[7, 5], [10, 7], [6, 9]]){ put(x, y, pc); put(x + 1, y, pc); put(x, y + 1, pc); put(x + 1, y + 1, mul(pc, .8)); } }
    else if (shape === 'tall'){ for (let y = top; y < top + 8; y++){ if (y % 2) put(7, y, pc); else put(9, y, pc); put(8, y, mul(pc, .85)); } }
    else if (shape === 'big'){ for (let y = top - 2; y < top + 4; y++) for (let x = 5; x <= 11; x++) if ((x - 8) ** 2 + (y - top - 1) ** 2 < 10) put(x, y, pc); if (cc) for (const [x, y] of [[8, top], [7, top + 1], [8, top + 1], [9, top]]) p.set(x, y, cc); }
  });
}
function sapling(s, trunk, leaf){ return cross(P(s), p => { const t = rgb(trunk), l = rgb(leaf); for (let y = 10; y < 16; y++) p.set(8, y, mul(t, .9 + p.r() * .2)); for (let k = 0; k < 26; k++){ const x = 4 + p.r() * 9 | 0, y = 2 + p.r() * 9 | 0; if ((x - 8.5) ** 2 + (y - 6.5) ** 2 < 18) p.set(x, y, mul(l, .75 + p.r() * .5)); } }); }
function glazed(s, colour){ const c = rgb(colour), lt = mix(c, [255, 255, 255], .45), dk = mul(c, .62), p = P(s);
  const q = (x, y) => { const v = (x * 7 + y * 3) % 9, ring = Math.max(x, y); if (ring === 7) return dk; if (x === y || x + y === 9) return lt; if (v < 3) return dk; if (ring < 3) return lt; return c; };
  p.each((x, y) => { const a = x < 8 ? x : 15 - x, b = y < 8 ? y : 15 - y, k = (x < 8) !== (y < 8); p.set(x, y, mul(k ? q(b, a) : q(a, b), .95 + p.r() * .08)); }); return p; }
function terracottaC(s, colour){ return P(s).fill(mix(rgb(colour), rgb('#9c5a3c'), .42), .07).speck(mix(rgb(colour), rgb('#7d4630'), .4), 8, .05); }
function powderC(s, colour){ const p = P(s).fill(rgb(colour), .06); p.speck(mul(rgb(colour), 1.15), 30, .05); p.speck(mul(rgb(colour), .82), 26, .05); return p; }
function coral(s, base){ const p = P(s).fill(rgb(base), .14); p.each((x, y) => { if ((x * 3 + y * 5) % 7 === 0) p.set(x, y, mul(rgb(base), 1.25)); else if ((x + y * 2) % 9 === 0) p.set(x, y, mul(rgb(base), .72)); }); return p; }
function coralPlant(s, base){ return cross(P(s), p => { const c = rgb(base); const br = (x, y, dx, n) => { for (let i = 0; i < n; i++){ p.set(Math.round(x), y, mul(c, .85 + p.r() * .3)); x += dx; y--; } p.set(Math.round(x), y, mul(c, 1.3)); }; br(8, 15, 0, 9); br(8, 12, -.7, 6); br(8, 11, .8, 6); br(5, 9, -.2, 4); br(11, 8, .3, 4); }); }
function front(s, base, draw){ const p = P(s); draw(p); return p; }
function nylium(s, top){ const p = netherrack(s); p.speck(rgb(top), 70, .25); return p; }
function nyliumSide(s, top){ const p = netherrack(s); for (let x = 0; x < 16; x++){ const h = 2 + (p.r() * 3 | 0); for (let y = 0; y < h; y++) p.set(x, y, mul(rgb(top), .85 + p.r() * .3)); } return p; }
function bricksOn(s, brick, mortar, tall, wide){ return bricks(P(s), brick, mortar, tall, wide); }
function lightGrid(s, base, lineC, glow){ const p = P(s).fill(rgb(base), .08); p.each((x, y) => { if (x % 4 === 0 || y % 4 === 0) p.set(x, y, mul(rgb(lineC), .9 + p.r() * .2)); }); if (glow) p.blob(rgb(glow), 5, .5, 1, .05); return p; }
const fr = (top, side) => ({top:s => polishedT(s, top, .06), side:s => { const p = P(s).fill(rgb(side), .06); p.each((x, y) => { if (y % 4 === 0) p.set(x, y, mul(rgb(side), 1.12)); else if (x % 4 === 2) p.set(x, y, mul(p.get(x, y), .92)); }); return p; }});
const WOOD = {jungle:['#a07450', '#574521', '#c49a6b', '#3c8f1d'], acacia:['#b05d34', '#6a645b', '#c56a3e', '#5a8f2a'], mangrove:['#773933', '#5a4630', '#8a4a40', '#4f8a2b'],
  cherry:['#e3b3ad', '#3b2128', '#e6bcb4', '#f0b6cf'], crimson:['#6b344a', '#5c1a1e', '#8a3b55', '#7d0e0e'], warped:['#2b6963', '#3a2b45', '#3a8a82', '#167e76']};
const OLD = {oak:'#b29262', birch:'#d6c79a', spruce:'#7d5c38', dark:'#5a3e22'};
for (const [w, c] of Object.entries(OLD)){ R['stripped_' + w] = s => strippedSide(s, c); R['stripped_' + w + '_top'] = s => strippedTop(s, c); }
for (const [w, [pl, bk, str, lf]] of Object.entries(WOOD)){
  R['planks_' + w] = s => planks(P(s), pl);
  R['log_' + w] = w === 'crimson' ? (s => { const p = bark(P(s), bk); p.speck(rgb('#c52a3a'), 18, .2); return p; }) : w === 'warped' ? (s => { const p = bark(P(s), bk); p.speck(rgb('#2fb5a2'), 18, .2); return p; })
    : w === 'cherry' ? (s => { const p = bark(P(s), bk); for (let y = 2; y < 16; y += 5) for (let x = 0; x < 16; x++) p.set(x, y, mul(rgb('#5a3542'), .9 + p.r() * .2)); return p; }) : (s => bark(P(s), bk, w === 'jungle' ? '#7a6a2a' : w === 'acacia' ? '#7d776c' : null));
  R['log_' + w + '_top'] = s => rings(P(s), str, bk); R['stripped_' + w] = s => strippedSide(s, str); R['stripped_' + w + '_top'] = s => strippedTop(s, str);
  R['leaves_' + w] = w === 'crimson' || w === 'warped' ? (s => noiseFill(P(s), lf, .2, w === 'crimson' ? '#5a0a0a' : '#0e5a53', w === 'crimson' ? '#a01a1a' : '#26a094', 9, 9)) : (s => { const p = leaves(P(s), lf); if (w === 'cherry') p.speck(rgb('#ffd7e6'), 10, .1); return p; });
}
Object.assign(R, {
  planks_bamboo:s => { const p = P(s); p.each((x, y) => p.set(x, y, mul(rgb('#c9b55a'), (x % 4 === 3 ? .72 : x % 4 === 0 ? 1.08 : 1) * (.94 + p.r() * .08)))); return p; },
  bamboo_block:s => { const p = P(s); p.each((x, y) => p.set(x, y, mul(rgb('#7f9a2c'), (x % 4 === 3 ? .7 : 1) * (y % 8 === 0 ? .8 : 1) * (.93 + p.r() * .1)))); return p; },
  bamboo_block_top:s => { const p = P(s).fill(rgb('#c9b55a'), .06); for (const [cx, cy] of [[4, 4], [11, 4], [4, 11], [11, 11]]) for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++){ const d = x * x + y * y; if (d <= 5) p.set(cx + x, cy + y, d >= 3 ? rgb('#6f8a26') : rgb('#e3d79a')); } return p; },
  andesite:s => noiseFill(P(s), '#8a8b8b', .12, '#6f7070', '#a6a7a7', 9, 8), polished_andesite:s => polishedT(s, '#8b8d8d'),
  diorite:s => { const p = noiseFill(P(s), '#cfcfcf', .08); p.speck(rgb('#7d7d7d'), 22, .1); p.speck(rgb('#f2f2f2'), 14, .05); return p; }, polished_diorite:s => polishedT(s, '#d0d0cf'),
  polished_granite:s => polishedT(s, '#9a6a58', .07),
  deepslate:s => deepslate(s), deepslate_top:s => { const p = deepslate(s); p.each((x, y) => { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); if (Math.floor(d) % 3 === 0) p.set(x, y, mul(p.get(x, y), .88)); }); return p; },
  cobbled_deepslate:s => cells(P(s), 12, [rgb('#4a4a50'), rgb('#56565c'), rgb('#3e3e44'), rgb('#5e5e64')], rgb('#2a2a2e')),
  deepslate_bricks:s => bricksOn(s, '#4c4c52', '#2d2d32', 4, 8), deepslate_tiles:s => tilesT(s, '#3e3e44', '#232327', 4), polished_deepslate:s => polishedT(s, '#4a4a50'), chiseled_deepslate:s => chiseledT(s, '#4a4a50'),
  tuff:s => noiseFill(P(s), '#6c6d66', .14, '#575852', '#80817a', 10, 9), calcite:s => noiseFill(P(s), '#dfe0dc', .05, '#c8c9c4', '#f2f2ef', 5, 5),
  blackstone:s => noiseFill(P(s), '#2c2629', .2, '#1c181a', '#3e3639'), blackstone_top:s => { const p = noiseFill(P(s), '#2c2629', .15); p.each((x, y) => { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); if (Math.floor(d) % 3 === 0) p.set(x, y, mul(p.get(x, y), .8)); }); return p; },
  polished_blackstone:s => polishedT(s, '#35303a'), blackstone_bricks:s => bricksOn(s, '#33303a', '#1a181c', 4, 8), gilded_blackstone:s => { const p = noiseFill(P(s), '#2c2629', .2); p.blob(rgb('#e3a52a'), 4, .6, 1.2, .2); return p; },
  netherrack:s => netherrack(s), nether_bricks:s => bricksOn(s, '#2f1519', '#160a0c', 4, 8), red_nether_bricks:s => bricksOn(s, '#4a0e12', '#24070a', 4, 8),
  end_stone:s => noiseFill(P(s), '#dcdc9e', .1, '#c4c486', '#ececb8', 7, 6), end_stone_bricks:s => bricksOn(s, '#e0e0a6', '#b4b47c', 8, 8),
  purpur:s => tilesT(s, '#a97ca9', '#7b557b', 8), purpur_pillar:s => pillarSide(s, '#ab80ab'), purpur_pillar_top:s => pillarTop(s, '#ab80ab'),
  prismarine:s => { const p = noiseFill(P(s), '#5d9e8f', .2, '#3f7f72', '#7fbfae', 8, 7); return p; }, prismarine_bricks:s => bricksOn(s, '#64ab9b', '#3d7368', 8, 8), dark_prismarine:s => tilesT(s, '#33604f', '#1d3a30', 8),
  red_sandstone:s => { const p = P(s).fill(rgb('#b9601f'), .08); for (let x = 0; x < 16; x++){ p.set(x, 0, rgb('#cc7530')); p.set(x, 3, rgb('#9e4d17')); p.set(x, 12, rgb('#9e4d17')); p.set(x, 15, rgb('#954914')); } return p; },
  red_sandstone_top:s => P(s).fill(rgb('#bd6522'), .06), cut_sandstone:s => bevel(P(s).fill(rgb('#d9ca91'), .05)), cut_red_sandstone:s => bevel(P(s).fill(rgb('#ba621f'), .05)),
  chiseled_sandstone:s => chiseledT(s, '#d6c58b'), quartz_bricks:s => bricksOn(s, '#ece6dd', '#cfc7ba', 8, 8), quartz_pillar:s => pillarSide(s, '#ebe5dc'), quartz_pillar_top:s => pillarTop(s, '#ebe5dc'), chiseled_quartz:s => chiseledT(s, '#ebe5dc'),
  mossy_stone_bricks:s => { const p = bricksOn(s, '#7b7b7b', '#5c5c5c', 8, 16); p.blob(rgb('#57793a'), 6, .7, 1.6, .2); return p; },
  cracked_stone_bricks:s => { const p = bricksOn(s, '#7b7b7b', '#5c5c5c', 8, 16); let x = 3, y = 1; for (let i = 0; i < 14; i++){ p.set(x, y, rgb('#4a4a4a')); y++; x += p.r() < .5 ? 1 : -1; x = Math.max(0, Math.min(15, x)); } return p; },
  packed_mud:s => noiseFill(P(s), '#8e6b4e', .1, '#7a5a40', '#a07c5c'), crying_obsidian:s => { const p = R.obsidian(s); p.speck(rgb('#a43cf0'), 14, .2); p.speck(rgb('#d27cff'), 6, .1); return p; },
  amethyst:s => { const p = P(s); p.each((x, y) => p.set(x, y, mul(rgb('#8c62c4'), .85 + ((x * 5 + y * 3) % 7) * .05 + p.r() * .06))); p.speck(rgb('#d2b6ff'), 12, .1); return p; },
  copper_block:s => metal(s, '#c16f4f', '#e79a7a', '#8e4a33'), copper_exposed:s => metal(s, '#a68569', '#c9a98e', '#7a5f4a'), copper_weathered:s => metal(s, '#6d9b78', '#94c2a0', '#4c7254'), copper_oxidized:s => metal(s, '#52a28a', '#7cc9b1', '#367a65'),
  cut_copper:s => tilesT(s, '#bf6c4c', '#8e4a33', 8), smooth_basalt:s => noiseFill(P(s), '#4a4a4f', .08, '#3c3c40', '#58585e'),
  polished_basalt:s => { const p = P(s); p.each((x, y) => p.set(x, y, mul(rgb('#5a5a60'), (.85 + Math.sin(x * 1.4) * .08) * (.95 + p.r() * .08)))); return p; }, polished_basalt_top:s => pillarTop(s, '#5c5c62'),
  coarse_dirt:s => { const p = R.dirt(s); p.speck(rgb('#5c4330'), 30, .15); p.speck(rgb('#8a8580'), 10, .1); return p; },
  podzol_top:s => { const p = P(s).fill(rgb('#5e4122'), .2); p.speck(rgb('#8a6234'), 24, .2); p.speck(rgb('#3e2c16'), 20, .2); return p; },
  podzol_side:s => { const p = R.dirt(s); for (let x = 0; x < 16; x++){ const h = 2 + (p.r() * 3 | 0); for (let y = 0; y < h; y++) p.set(x, y, mul(rgb('#5e4122'), .85 + p.r() * .3)); } return p; },
  mycelium_top:s => { const p = P(s).fill(rgb('#73636b'), .18); p.speck(rgb('#9a8a96'), 20, .15); p.speck(rgb('#564a50'), 14, .15); return p; },
  mycelium_side:s => { const p = R.dirt(s); for (let x = 0; x < 16; x++){ const h = 2 + (p.r() * 3 | 0); for (let y = 0; y < h; y++) p.set(x, y, mul(rgb('#73636b'), .85 + p.r() * .3)); } return p; },
  rooted_dirt:s => { const p = R.dirt(s); for (let k = 0; k < 5; k++){ let x = p.r() * 16 | 0; for (let y = p.r() * 6 | 0; y < 16; y += 1){ p.set(x, y, rgb('#a58b6a')); if (p.r() < .3) x++; if (p.r() < .4) y++; } } return p; },
  mud:s => noiseFill(P(s), '#3c3936', .1, '#2e2b29', '#4a4643'), moss:s => noiseFill(P(s), '#5a7c2a', .22, '#46651e', '#73983a', 9, 8),
  red_sand:s => P(s).fill(rgb('#be6621'), .1).speck(rgb('#a65819'), 16, .1).speck(rgb('#d88a44'), 10, .05),
  packed_ice:s => { const p = P(s).fill(rgb('#8db4ec'), .05); for (let k = 0; k < 5; k++){ const x0 = p.r() * 16 | 0, y0 = p.r() * 16 | 0; for (let i = 0; i < 4; i++) p.set(x0 + i, y0 + (i >> 1), rgb('#c0d8fa')); } return p; },
  blue_ice:s => { const p = P(s).fill(rgb('#73a9f3'), .06); for (let k = 0; k < 6; k++){ const x0 = p.r() * 16 | 0, y0 = p.r() * 16 | 0; for (let i = 0; i < 3; i++) p.set(x0 + i, y0 - i, rgb('#b3d4ff')); } return p; },
  magma:s => { const p = P(s).fill(rgb('#5a1d0e'), .2); p.each((x, y) => { if ((x * 3 + y * 7) % 11 < 2 || (x * 5 + y) % 13 === 0) p.set(x, y, mul(rgb('#ff8a1e'), .85 + p.r() * .3)); }); return p; },
  soul_sand:s => { const p = P(s).fill(rgb('#51402f'), .14); for (const [x, y] of [[3, 4], [10, 3], [6, 10], [12, 11]]){ p.set(x, y, rgb('#2d2219')); p.set(x + 2, y, rgb('#2d2219')); p.set(x + 1, y + 2, rgb('#2d2219')); } return p; },
  soul_soil:s => noiseFill(P(s), '#4a3a2c', .14, '#3a2c20', '#5a4838'), sponge:s => { const p = P(s).fill(rgb('#c9c34a'), .1); p.speck(rgb('#9e9830'), 30, .1); p.speck(rgb('#e3dd66'), 14, .05); return p; },
  dirt_path_top:s => P(s).fill(rgb('#9a7e48'), .12).speck(rgb('#7d6538'), 14, .1), dirt_path_side:s => { const p = R.dirt(s); for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) p.set(x, y, mul(rgb('#9a7e48'), .9 + p.r() * .2)); return p; },
  crimson_nylium:s => nylium(s, '#a31a1a'), crimson_nylium_side:s => nyliumSide(s, '#a31a1a'), warped_nylium:s => nylium(s, '#1d8a7c'), warped_nylium_side:s => nyliumSide(s, '#1d8a7c'),
  bone_block:s => { const p = P(s).fill(rgb('#e4dfc6'), .05); p.each((x, y) => { if (x % 5 === 0) p.set(x, y, mul(rgb('#c9c3a6'), .95 + p.r() * .1)); }); return p; }, bone_block_top:s => pillarTop(s, '#e1dcc2'),
  coral_tube:s => coral(s, '#3156d8'), coral_brain:s => coral(s, '#cf5aa4'), coral_bubble:s => coral(s, '#a51aa1'), coral_fire:s => coral(s, '#c52a33'), coral_horn:s => coral(s, '#d8c240'),
  lava:s => { const p = P(s); p.each((x, y) => { const v = Math.sin(x * .9 + Math.sin(y * .7) * 2) * .5 + .5; p.set(x, y, mix(rgb('#c43a08'), rgb('#ffb21e'), v * .8 + p.r() * .2)); }); p.speck(rgb('#fff09a'), 6, .05); return p; },
  glowstone:s => { const p = P(s).fill(rgb('#a8803e'), .15); p.blob(rgb('#f7d683'), 8, .6, 1.4, .1); p.speck(rgb('#fff6c8'), 10, .05); return p; },
  sea_lantern:s => { const p = P(s).fill(rgb('#a9c9c0'), .08); p.each((x, y) => { if (x === 0 || y === 0 || x === 15 || y === 15) p.set(x, y, rgb('#6c968c')); else if (x % 5 === 0 || y % 5 === 0) p.set(x, y, rgb('#d8f2ea')); }); p.blob(rgb('#f2fffa'), 4, .6, 1.2, .05); return p; },
  shroomlight:s => { const p = P(s).fill(rgb('#f19645'), .15); p.blob(rgb('#ffd27a'), 6, .7, 1.4, .1); p.speck(rgb('#c96520'), 12, .1); return p; },
  jack_face:s => { const p = R.pumpkin_side(s), f = rgb('#ffd34a'); for (const [x, y] of [[4, 5], [5, 5], [10, 5], [11, 5], [4, 6], [5, 6], [10, 6], [11, 6]]) p.set(x, y, f); for (let x = 3; x <= 12; x++) p.set(x, 10, f); for (const x of [4, 6, 8, 10, 12]) p.set(x, 11, f); for (const x of [3, 5, 7, 9, 11]) p.set(x, 9, f); return p; },
  redstone_lamp:s => lightGrid(s, '#d9a45a', '#7a4a22', '#fff0b0'),
  froglight_ochre:s => lightGrid(s, '#f4d483', '#d0a64a'), froglight_ochre_top:s => polishedT(s, '#f8de95'), froglight_verdant:s => lightGrid(s, '#d6ecb0', '#9ec46e'), froglight_verdant_top:s => polishedT(s, '#e2f2c4'),
  froglight_pearl:s => lightGrid(s, '#f2dde6', '#c9a3b6'), froglight_pearl_top:s => polishedT(s, '#f7e8ee'),
  beacon:s => { const p = glassPane(P(s)); for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) p.set(x, y, mul(rgb('#7ff0ea'), .9 + p.r() * .2)); for (let x = 2; x < 14; x++){ p.set(x, 13, rgb('#1a1226')); p.set(x, 14, rgb('#1a1226')); } return p; },
  ore_copper:s => oreOn(stone(s), '#e0864e', '#9c5430'), ore_lapis:s => oreOn(stone(s), '#2a4fc4', '#1a3088'), ore_redstone:s => oreOn(stone(s), '#e0261e', '#901410'),
  ore_nether_gold:s => oreOn(netherrack(s), '#f6d33d', '#c49a1c'), ore_quartz:s => oreOn(netherrack(s), '#ece6dd', '#bfb5a6'),
  ancient_debris:s => { const p = P(s); p.each((x, y) => p.set(x, y, mul(rgb('#5e4339'), (y % 4 === 0 ? .7 : 1) * (.85 + p.r() * .25)))); return p; }, ancient_debris_top:s => { const p = P(s).fill(rgb('#5e4339'), .2); p.each((x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); if (Math.floor(d) % 3 === 0) p.set(x, y, mul(p.get(x, y), .7)); }); return p; },
  block_coal:s => noiseFill(P(s), '#191919', .25, '#0c0c0c', '#2c2c2c'), block_lapis:s => metal(s, '#2a4fc4', '#6f92ff', '#18307a'), block_redstone:s => metal(s, '#b4150e', '#ff5a4a', '#6e0c08'),
  block_netherite:s => metal(s, '#3c3a3c', '#5e5b5e', '#232123'), block_ruby:s => metal(s, '#c8213a', '#ff7a8a', '#7e0f1e'),
  raw_iron:s => noiseFill(P(s), '#a88a76', .2, '#8a6c58', '#c9ab94'), raw_gold:s => noiseFill(P(s), '#d4a52c', .2, '#a8801a', '#f2cf5a'), raw_copper:s => noiseFill(P(s), '#a85a3e', .2, '#7e3e28', '#d07a5a'),
  fern:s => cross(P(s), p => { for (let k = 0; k < 4; k++){ let x = 4 + k * 2.5, y = 15; const c = mul(rgb('#4f8f34'), .8 + p.r() * .4), dx = (k - 1.5) * .25; for (let i = 0; i < 11; i++){ p.set(x | 0, y, c); if (i % 2) { p.set((x | 0) - 1, y, mul(c, .85)); p.set((x | 0) + 1, y, mul(c, .85)); } x += dx; y--; } } }),
  sapling_oak:s => sapling(s, '#6b5132', '#3f8a2c'), sapling_birch:s => sapling(s, '#e3e0d3', '#6c9a3c'), sapling_spruce:s => sapling(s, '#3d2b17', '#2f5b33'), sapling_jungle:s => sapling(s, '#574521', '#3c8f1d'),
  sapling_acacia:s => sapling(s, '#6a645b', '#5a8f2a'), sapling_dark:s => sapling(s, '#3a2817', '#2e6a1f'), sapling_cherry:s => sapling(s, '#3b2128', '#f0b6cf'),
  blue_orchid:s => flower(s, '#3aa8e8', '#a8e0ff', 'cluster'), allium:s => flower(s, '#b765d8', '#e3a6f2', 'big'), azure_bluet:s => flower(s, '#e8eef2', '#f2d24a', 'cluster'),
  tulip_red:s => flower(s, '#d8282e', null, 'tulip'), tulip_orange:s => flower(s, '#ee7a1e', null, 'tulip'), tulip_white:s => flower(s, '#eef2f2', null, 'tulip'), tulip_pink:s => flower(s, '#f2a3c6', null, 'tulip'),
  oxeye_daisy:s => flower(s, '#f4f4ee', '#f0c22a', 'round'), cornflower:s => flower(s, '#4a6fe8', '#2a3fa8', 'round'), lily_valley:s => flower(s, '#ffffff', null, 'bell'),
  sunflower:s => flower(s, '#f6cf2a', '#6b4224', 'big'), rose_bush:s => flower(s, '#c41f2a', null, 'cluster', '#2f6a22'), peony:s => flower(s, '#e8a6d0', '#d27cb6', 'big'), lilac:s => flower(s, '#c793d8', null, 'cluster'),
  brown_mushroom:s => cross(P(s), p => { for (let y = 11; y < 16; y++){ p.set(7, y, rgb('#e8dcc8')); p.set(8, y, rgb('#d8ccb5')); } for (let y = 7; y < 11; y++) for (let x = 4 + Math.max(0, 9 - y); x < 12 - Math.max(0, 9 - y); x++) p.set(x, y, mul(rgb('#9a6b4a'), .9 + p.r() * .15)); }),
  sugar_cane:s => cross(P(s), p => { for (const x0 of [4, 8, 11]) for (let y = 0; y < 16; y++){ p.set(x0, y, mul(rgb('#8fc75a'), y % 5 === 0 ? .7 : .95 + p.r() * .1)); p.set(x0 + 1, y, mul(rgb('#a6dc6a'), .9 + p.r() * .1)); if (y % 5 === 2) p.set(x0 + 2, y, rgb('#6fa83e')); } }),
  bamboo:s => cross(P(s), p => { for (let y = 0; y < 16; y++){ const c = y % 6 === 0 ? rgb('#5a7a1e') : rgb('#7f9a2c'); p.set(7, y, c); p.set(8, y, mul(c, 1.1)); } for (const [x, y] of [[9, 3], [10, 2], [11, 2], [6, 8], [5, 7], [4, 7]]) p.set(x, y, rgb('#5c9e35')); }),
  berry_bush:s => { const p = sapling(s, '#3f6a22', '#356b2a'); for (const [x, y] of [[5, 5], [10, 4], [7, 8], [11, 9], [4, 9]]) p.set(x, y, rgb('#c41f3a')); return p; },
  crimson_fungus:s => cross(P(s), p => { for (let y = 10; y < 16; y++) p.set(8, y, rgb('#e8b080')); for (let y = 5; y < 10; y++) for (let x = 5; x < 12; x++) if ((x - 8) ** 2 + (y - 8) ** 2 < 11) p.set(x, y, mul(rgb('#b0282a'), .9 + p.r() * .2)); p.set(6, 6, rgb('#f2c040')); }),
  warped_fungus:s => cross(P(s), p => { for (let y = 10; y < 16; y++) p.set(8, y, rgb('#e8b080')); for (let y = 5; y < 10; y++) for (let x = 5; x < 12; x++) if ((x - 8) ** 2 + (y - 8) ** 2 < 11) p.set(x, y, mul(rgb('#1d8a7c'), .9 + p.r() * .2)); p.set(9, 7, rgb('#f2a040')); }),
  crimson_roots:s => { const p = R.tall_grass(s); p.each((x, y) => { if (p.alpha(x, y)) p.set(x, y, mul(rgb('#a82a3a'), .8 + p.r() * .3)); }); return p; },
  warped_roots:s => { const p = R.tall_grass(s); p.each((x, y) => { if (p.alpha(x, y)) p.set(x, y, mul(rgb('#22a08e'), .8 + p.r() * .3)); }); return p; },
  wither_rose:s => flower(s, '#2a2224', '#1a1416', 'round', '#3a3a2a'), torchflower:s => flower(s, '#f2a03a', '#ffe08a', 'big'),
  coral_plant_tube:s => coralPlant(s, '#3156d8'), coral_plant_brain:s => coralPlant(s, '#cf5aa4'), coral_plant_bubble:s => coralPlant(s, '#a51aa1'), coral_plant_fire:s => coralPlant(s, '#c52a33'), coral_plant_horn:s => coralPlant(s, '#d8c240'),
  crafting_top:s => { const p = planks(P(s), '#a3824f'); for (let i = 0; i < 16; i++){ p.set(i, 0, rgb('#5a4225')); p.set(0, i, rgb('#5a4225')); p.set(i, 15, rgb('#5a4225')); p.set(15, i, rgb('#5a4225')); } for (const v of [5, 10]) for (let i = 1; i < 15; i++){ p.set(v, i, rgb('#6b5132')); p.set(i, v, rgb('#6b5132')); } return p; },
  crafting_side:s => { const p = planks(P(s), '#8e6b40'); for (let x = 0; x < 16; x++){ p.set(x, 0, rgb('#5a4225')); p.set(x, 1, rgb('#6b5132')); } for (let y = 4; y < 9; y++){ p.set(3, y, rgb('#8a8a8a')); p.set(4, y, rgb('#6a6a6a')); } p.set(2, 4, rgb('#9a9a9a')); p.set(5, 4, rgb('#9a9a9a')); return p; },
  crafting_front:s => { const p = R.crafting_side(s); for (let y = 3; y < 12; y++) p.set(11, y, rgb('#6b5132')); for (let x = 9; x < 14; x++) p.set(x, 3, rgb('#9a9a9a')); return p; },
  furnace_top:s => polishedT(s, '#808080'), furnace_side:s => { const p = R.cobble(s); return p; },
  furnace_front:s => { const p = R.cobble(s); for (let y = 7; y < 14; y++) for (let x = 4; x < 12; x++) p.set(x, y, y > 10 ? rgb('#2a2a2a') : rgb('#1a1a1a')); for (let x = 3; x < 13; x++){ p.set(x, 6, rgb('#5a5a5a')); p.set(x, 14, rgb('#5a5a5a')); } return p; },
  chest_top:s => { const p = planks(P(s), '#a36b2a'); for (let i = 0; i < 16; i++){ p.set(i, 0, rgb('#4a2e12')); p.set(0, i, rgb('#4a2e12')); p.set(i, 15, rgb('#4a2e12')); p.set(15, i, rgb('#4a2e12')); } return p; },
  chest_side:s => { const p = R.chest_top(s); for (let x = 0; x < 16; x++){ p.set(x, 5, rgb('#4a2e12')); p.set(x, 6, rgb('#3a240e')); } return p; },
  chest_front:s => { const p = R.chest_side(s); for (let y = 4; y < 9; y++) for (let x = 7; x < 9; x++) p.set(x, y, y === 4 ? rgb('#e8e8e8') : rgb('#b8b8b8')); return p; },
  barrel_side:s => { const p = planks(P(s), '#7a5530'); for (let x = 0; x < 16; x++){ p.set(x, 2, rgb('#4a4a4a')); p.set(x, 13, rgb('#4a4a4a')); } return p; },
  barrel_top:s => { const p = rings(P(s), '#8a6438', '#4a3218'); for (let x = 5; x < 11; x++){ p.set(x, 5, rgb('#3a2a14')); p.set(x, 10, rgb('#3a2a14')); } return p; },
  jukebox_side:s => { const p = planks(P(s), '#6b4428'); bevel(p, 1.3, .6); return p; }, jukebox_top:s => { const p = R.jukebox_side(s); for (let x = 4; x < 12; x++){ p.set(x, 7, rgb('#1a1a1a')); p.set(x, 8, rgb('#1a1a1a')); } return p; },
  note_block:s => { const p = planks(P(s), '#6b4428'); bevel(p, 1.3, .6); for (const [x, y] of [[6, 4], [6, 5], [6, 6], [6, 7], [6, 8], [7, 4], [8, 5], [5, 9], [4, 9], [4, 8], [5, 8]]) p.set(x, y, rgb('#1a1a1a')); return p; },
  tnt_side:s => { const p = P(s); p.each((x, y) => p.set(x, y, y >= 5 && y <= 10 ? rgb('#e9e4d6') : mul(rgb('#c4271e'), x % 4 === 0 ? .75 : .95 + p.r() * .1))); for (const [x, y] of [[2, 6], [3, 6], [2, 7], [2, 8], [3, 8], [2, 9], [5, 6], [5, 7], [5, 8], [5, 9], [6, 6], [7, 7], [7, 8], [7, 9], [9, 6], [10, 6], [11, 6], [10, 7], [10, 8], [10, 9]]) p.set(x + 1, y, rgb('#1a1a1a')); return p; },
  tnt_top:s => { const p = P(s).fill(rgb('#c4271e'), .1); for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) p.set(x, y, rgb('#e9e4d6')); p.set(8, 7, rgb('#1a1a1a')); p.set(7, 8, rgb('#1a1a1a')); return p; },
  tnt_bottom:s => P(s).fill(rgb('#a8221a'), .1),
  target_side:s => { const p = P(s).fill(rgb('#e9e4d6'), .06); p.each((x, y) => { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); if (Math.floor(d) % 4 === 0 || d < 1) p.set(x, y, rgb('#c4271e')); }); return p; },
  target_top:s => { const p = P(s).fill(rgb('#d8cc8a'), .15); return p; },
  honey:s => { const p = P(s); p.each((x, y) => p.set(x, y, mul(rgb('#f2a92a'), .9 + p.r() * .1), x === 0 || y === 0 || x === 15 || y === 15 ? 240 : 190)); return p; },
  slime:s => { const p = P(s); p.each((x, y) => { const edge = x === 0 || y === 0 || x === 15 || y === 15, inner = x > 3 && x < 12 && y > 3 && y < 12; p.set(x, y, mul(rgb('#73c262'), edge || inner ? .85 : 1.05), edge ? 235 : inner ? 230 : 170); }); return p; },
  smithing_top:s => { const p = polishedT(s, '#3a3a40'); for (let x = 2; x < 14; x++) p.set(x, 7, rgb('#6a6a72')); return p; }, smithing_side:s => { const p = planks(P(s), '#4a3420'); for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) p.set(x, y, mul(rgb('#3a3a40'), .9 + p.r() * .2)); return p; },
  fletching_top:s => { const p = planks(P(s), '#d6c58c'); for (let i = 3; i < 13; i++) p.set(i, i, rgb('#6b5132')); return p; }, fletching_side:s => { const p = planks(P(s), '#c9b67a'); for (const [x, y] of [[4, 4], [5, 5], [6, 6], [10, 4], [11, 5]]) p.set(x, y, rgb('#e8e8e8')); return p; },
  cartography_top:s => { const p = P(s).fill(rgb('#e3d7b0'), .08); for (let k = 0; k < 6; k++){ const x = 2 + p.r() * 12 | 0, y = 2 + p.r() * 12 | 0; p.set(x, y, rgb('#4a7ac4')); p.set(x + 1, y, rgb('#4a9a4a')); } bevel(p, 1, .55); return p; }, cartography_side:s => planks(P(s), '#6b4428'),
  loom_top:s => planks(P(s), '#c9b67a'), loom_side:s => planks(P(s), '#a8925e'), loom_front:s => { const p = planks(P(s), '#a8925e'); for (let y = 2; y < 10; y++) for (let x = 3; x < 13; x++) if (x % 2) p.set(x, y, rgb('#e8e8e8')); return p; },
  beehive_top:s => { const p = planks(P(s), '#c9a85a'); bevel(p, 1, .6); return p; }, beehive_side:s => { const p = planks(P(s), '#c9a85a'); for (let x = 0; x < 16; x++) p.set(x, 0, rgb('#8a6a30')); return p; },
  beehive_front:s => { const p = R.beehive_side(s); for (let y = 8; y < 12; y++) for (let x = 6; x < 10; x++) p.set(x, y, rgb('#2a1a08')); return p; },
  dispenser_front:s => { const p = R.cobble(s); for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) p.set(x, y, (x - 7.5) ** 2 + (y - 7.5) ** 2 < 8 ? rgb('#1a1a1a') : rgb('#5a5a5a')); return p; },
  observer_top:s => { const p = polishedT(s, '#6a6a6a'); for (let x = 3; x < 13; x++) p.set(x, 8, rgb('#3a3a3a')); return p; }, observer_side:s => polishedT(s, '#5e5e5e'),
  observer_front:s => { const p = polishedT(s, '#5a5a5a'); for (const [x, y] of [[4, 6], [5, 6], [10, 6], [11, 6], [4, 7], [5, 7], [10, 7], [11, 7]]) p.set(x, y, rgb('#1a1a1a')); for (let x = 3; x < 13; x++) p.set(x, 11, rgb('#3a3a3a')); return p; },
  piston_top:s => { const p = planks(P(s), '#a3824f'); p.set(7, 7, rgb('#8a8a8a')); p.set(8, 8, rgb('#8a8a8a')); return p; }, piston_side:s => { const p = R.cobble(s); for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) p.set(x, y, mul(rgb('#a3824f'), .9 + p.r() * .2)); return p; },
  piston_bottom:s => polishedT(s, '#6a6a6a'),
  mushroom_block_red:s => { const p = P(s).fill(rgb('#b8262a'), .1); p.blob(rgb('#e8dcc8'), 5, .8, 1.6, .05); return p; }, mushroom_block_brown:s => P(s).fill(rgb('#946a4a'), .1).speck(rgb('#7a5638'), 14, .1),
  mushroom_stem:s => P(s).fill(rgb('#d8ceb6'), .06).speck(rgb('#c4b89c'), 12, .05),
  dried_kelp:s => { const p = P(s); p.each((x, y) => p.set(x, y, mul(rgb('#3a4a24'), (y % 4 === 0 ? .7 : 1) * (.85 + p.r() * .3)))); return p; }, dried_kelp_top:s => { const p = P(s).fill(rgb('#3a4a24'), .2); p.each((x, y) => { if (Math.floor(Math.hypot(x - 7.5, y - 7.5)) % 2) p.set(x, y, mul(p.get(x, y), .7)); }); return p; },
  honeycomb:s => { const p = P(s).fill(rgb('#e39a2a'), .08); p.each((x, y) => { if ((y % 4 === 0) || ((x + (y >> 2) * 2) % 4 === 0)) p.set(x, y, rgb('#b8721a')); }); return p; },
  reinforced_side:s => { const p = deepslate(s); for (let i = 0; i < 16; i++){ p.set(i, 0, rgb('#c9c9b0')); p.set(i, 15, rgb('#c9c9b0')); } return p; }, reinforced_top:s => { const p = R.reinforced_side(s); for (let i = 0; i < 16; i++){ p.set(0, i, rgb('#c9c9b0')); p.set(15, i, rgb('#c9c9b0')); } return p; },
  tinted_glass:s => { const p = P(s); p.each((x, y) => { const edge = x === 0 || y === 0 || x === 15 || y === 15; p.set(x, y, edge ? rgb('#3a3040') : rgb('#2a2230'), edge ? 250 : 200); }); return p; },
});
for (const [k, c, d] of [['coal', '#2b2b2b', '#151515'], ['iron', '#d8af93', '#a87e62'], ['gold', '#f6d33d', '#c49a1c'], ['diamond', '#6ff0e4', '#2fb5ab'], ['emerald', '#3ee07a', '#1d9a4c'], ['copper', '#e0864e', '#9c5430'], ['lapis', '#2a4fc4', '#1a3088'], ['redstone', '#e0261e', '#901410']]) R['deep_ore_' + k] = s => oreOn(deepslate(s), c, d);
for (const [c, h] of COLOURS){ R['powder_' + c] = s => powderC(s, h); R['terracotta_' + c] = s => terracottaC(s, h); R['glazed_' + c] = s => glazed(s, h); }

/* ---------- shaped blocks: doors, trapdoors, torches, lanterns, ladders, bars, chains ---------- */
const DOORC = {oak:'#a3824f', birch:'#d5c58c', spruce:'#6f5233', dark:'#4b3219', jungle:'#a07450', acacia:'#b05d34', mangrove:'#773933', cherry:'#e3b3ad', crimson:'#6b344a', warped:'#2b6963', bamboo:'#c9b55a', iron:'#c8c8c8'};
const clearPic = s => { const p = new Pic(s); p.each((x, y) => p.set(x, y, [0, 0, 0], 0)); return p; };
for (const [w, c] of Object.entries(DOORC)){
  const iron = w === 'iron', frame = mul(rgb(c), .7);
  const door = (s, top) => { const p = iron ? metal(s, c, '#ececec', '#8a8a8a') : planks(new Pic(s), c);
    if (!iron) p.each((x, y) => { if (x === 0 || x === 15 || (top ? y === 0 : y === 15)) p.set(x, y, frame); });
    if (top) for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++){ if (x === 7 || x === 8 || y === 7 || y === 8) p.set(x, y, frame); else if (iron || ['oak', 'birch', 'jungle', 'acacia', 'cherry', 'bamboo'].includes(w)) p.set(x, y, [0, 0, 0], 0); }
    else { for (let x = 3; x < 13; x++){ p.set(x, 3, frame); p.set(x, 12, frame); } for (let y = 3; y < 13; y++){ p.set(3, y, frame); p.set(12, y, frame); } p.set(12, 1, iron ? rgb('#5a5a5a') : rgb('#3a3a3a')); }
    return p; };
  R['door_' + w + '_top'] = s => door(s, true); R['door_' + w + '_bottom'] = s => door(s, false);
  R['trapdoor_' + w] = s => { const p = iron ? metal(s, c, '#ececec', '#8a8a8a') : planks(new Pic(s), c);
    p.each((x, y) => { if (x === 0 || y === 0 || x === 15 || y === 15) p.set(x, y, frame); else if ((x % 5 === 2 || x % 5 === 3) && (y % 5 === 2 || y % 5 === 3) && w !== 'spruce' && w !== 'dark') p.set(x, y, [0, 0, 0], 0); }); return p; };
}
Object.assign(R, {
  torch:s => { const p = clearPic(s); for (let y = 9; y < 16; y++){ p.set(7, y, rgb('#7a5a34')); p.set(8, y, rgb('#5f4527')); } for (let y = 6; y < 9; y++){ p.set(7, y, rgb(y === 6 ? '#fff6b0' : '#ffb23a')); p.set(8, y, rgb(y === 6 ? '#ffe070' : '#ff8a1e')); } return p; },
  soul_torch:s => { const p = clearPic(s); for (let y = 9; y < 16; y++){ p.set(7, y, rgb('#7a5a34')); p.set(8, y, rgb('#5f4527')); } for (let y = 6; y < 9; y++){ p.set(7, y, rgb(y === 6 ? '#d8fcff' : '#5ad8e8')); p.set(8, y, rgb(y === 6 ? '#a8f2ff' : '#2ab8d0')); } return p; },
  lantern:s => { const p = clearPic(s); for (let y = 9; y < 16; y++) for (let x = 5; x < 11; x++){ const edge = x === 5 || x === 10 || y === 9 || y === 15; p.set(x, y, edge ? rgb('#3a3a40') : rgb(y < 12 ? '#ffe38a' : '#ffb24a')); }
    for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) if (p.alpha(x, y) === 0) p.set(x, y, rgb('#2f2f35')); for (let y = 6; y < 9; y++) for (let x = 7; x < 9; x++) p.set(x, y, rgb('#4a4a52')); return p; },
  soul_lantern:s => { const p = R.lantern(s); p.each((x, y) => { const c = p.get(x, y); if (p.alpha(x, y) && c[0] > 200) p.set(x, y, mix(c, rgb('#5ad8e8'), .8)); }); return p; },
  ladder:s => { const p = clearPic(s), c = rgb('#8a6a3a'); for (let y = 0; y < 16; y++){ p.set(2, y, mul(c, .85)); p.set(3, y, c); p.set(12, y, c); p.set(13, y, mul(c, .85)); } for (const y of [1, 5, 9, 13]) for (let x = 2; x < 14; x++){ p.set(x, y, mul(c, 1.1)); p.set(x, y + 1, mul(c, .8)); } return p; },
  iron_bars:s => { const p = clearPic(s); for (const x of [1, 5, 9, 13]) for (let y = 0; y < 16; y++){ p.set(x, y, rgb('#9a9a9a')); p.set(x + 1, y, rgb('#6a6a6a')); } for (let x = 0; x < 16; x++){ p.set(x, 0, rgb('#8a8a8a')); p.set(x, 15, rgb('#6a6a6a')); } return p; },
  chain:s => { const p = clearPic(s); for (let y = 0; y < 16; y++){ const link = Math.floor(y / 4) % 2; if (link){ p.set(7, y, rgb('#4a4f5a')); p.set(8, y, rgb('#3a3f4a')); } else if (y % 4 === 0 || y % 4 === 3){ p.set(7, y, rgb('#5a606c')); p.set(8, y, rgb('#5a606c')); } else { p.set(6, y, rgb('#4a4f5a')); p.set(9, y, rgb('#3a3f4a')); } } return p; },
});

/* ---------- redstone, rails and items ---------- */
function dustPic(s, c1, c2){ const p = new Pic(s); p.each((x, y) => p.set(x, y, [0, 0, 0], 0)); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++){ const r = p.r(); if (r < .55) p.set(x, y, mix(rgb(c1), rgb(c2), p.r()), 255); } return p; }
function railPic(s, tie, rail, corner){ const p = new Pic(s); p.each((x, y) => p.set(x, y, [0, 0, 0], 0));
  if (!corner){ for (const y of [1, 4, 7, 10, 13]) for (let x = 2; x < 14; x++){ p.set(x, y, mul(rgb(tie), .9 + p.r() * .2)); p.set(x, y + 1, mul(rgb(tie), .7)); }
    for (let y = 0; y < 16; y++){ p.set(3, y, rgb(rail)); p.set(4, y, mul(rgb(rail), .7)); p.set(11, y, rgb(rail)); p.set(12, y, mul(rgb(rail), .7)); } }
  else { for (let k = 0; k < 5; k++){ const a = (k + .5) / 5 * Math.PI / 2; for (let r = 3; r < 14; r++){ const x = Math.round(Math.cos(a) * r), y = Math.round(Math.sin(a) * r); p.set(15 - x, 15 - y, mul(rgb(tie), .85 + p.r() * .2)); } }
    for (let i = 0; i < 64; i++){ const a = i / 63 * Math.PI / 2; for (const r of [4, 12]){ p.set(15 - Math.round(Math.cos(a) * r), 15 - Math.round(Math.sin(a) * r), rgb(rail)); p.set(15 - Math.round(Math.cos(a) * (r + 1)), 15 - Math.round(Math.sin(a) * (r + 1)), mul(rgb(rail), .7)); } } }
  return p; }
Object.assign(R, {
  dust_off:s => dustPic(s, '#4a0a0a', '#6e1210'), dust_on:s => dustPic(s, '#e01b10', '#ff5a3a'),
  redstone_lamp_off:s => lightGrid(s, '#6b4524', '#3e2614'),
  redstone_torch:s => { const p = R.torch(s); for (let y = 6; y < 9; y++){ p.set(7, y, rgb(y === 6 ? '#ff9a8a' : '#e01b10')); p.set(8, y, rgb(y === 6 ? '#ff6a5a' : '#b0120a')); } return p; },
  redstone_torch_off:s => { const p = R.torch(s); for (let y = 6; y < 9; y++){ p.set(7, y, rgb('#4a1410')); p.set(8, y, rgb('#3a0f0c')); } return p; },
  lever:s => { const p = new Pic(s); p.each((x, y) => p.set(x, y, mul(rgb('#7a5a34'), .9 + p.r() * .2))); return p; },
  repeater:s => { const p = R.smooth_stone(s); for (const [x, y] of [[7, 3], [8, 3], [7, 12], [8, 12]]) p.set(x, y, rgb('#4a1410')); for (let y = 4; y < 12; y++) p.set(7, y, rgb('#6e1210')); return p; },
  repeater_on:s => { const p = R.smooth_stone(s); for (const [x, y] of [[7, 3], [8, 3], [7, 12], [8, 12]]) p.set(x, y, rgb('#ff3a2a')); for (let y = 4; y < 12; y++) p.set(7, y, rgb('#e01b10')); return p; },
  rail:s => railPic(s, '#6b5132', '#a8a8a8'), rail_corner:s => railPic(s, '#6b5132', '#a8a8a8', true),
  rail_powered:s => { const p = railPic(s, '#6b5132', '#d8b83a'); for (let y = 0; y < 16; y += 3) p.set(8, y, rgb('#4a1410')); return p; },
  rail_powered_on:s => { const p = railPic(s, '#6b5132', '#f2d24a'); for (let y = 0; y < 16; y += 3){ p.set(7, y, rgb('#ff3a2a')); p.set(8, y, rgb('#ff3a2a')); } return p; },
  item_minecart:s => { const p = new Pic(s); p.each((x, y) => p.set(x, y, [0, 0, 0], 0)); for (let y = 5; y < 11; y++) for (let x = 2; x < 14; x++){ const edge = y === 5 || x === 2 || x === 13; p.set(x, y, edge ? rgb('#8a8f96') : rgb('#5a5f66')); } for (const cx of [4, 11]) for (let y = 10; y < 14; y++) for (let x = cx - 1; x <= cx + 1; x++) p.set(x, y, rgb('#2a2a2a')); return p; },
  item_flint:s => { const p = new Pic(s); p.each((x, y) => p.set(x, y, [0, 0, 0], 0)); for (let i = 0; i < 8; i++){ p.set(3 + i, 12 - i, rgb('#9a9a9a')); p.set(4 + i, 12 - i, rgb('#6a6a6a')); } for (const [x, y] of [[10, 3], [11, 3], [12, 4], [11, 5], [10, 4]]) p.set(x, y, rgb('#2a2a2a')); for (const [x, y] of [[4, 4], [5, 5], [3, 5]]) p.set(x, y, rgb('#ffb23a')); return p; },
});

/* all the textures, as one block of rgba: layer after layer, TS x TS each */
export function paintAll(){
  const out = new Uint8Array(TEX.length * TS * TS * 4), k = TS / 16;
  TEX.forEach((name, i) => {
    const f = R[name]; if (!f) throw new Error('no recipe for ' + name);
    const p = f(hashStr(name)), d = p.d, o = i * TS * TS * 4;
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++){ const s = ((y / k | 0) * 16 + (x / k | 0)) * 4, t = o + (y * TS + x) * 4; out[t] = Math.max(0, Math.min(255, d[s])); out[t + 1] = Math.max(0, Math.min(255, d[s + 1])); out[t + 2] = Math.max(0, Math.min(255, d[s + 2])); out[t + 3] = d[s + 3]; }
  });
  return out;
}
/* a cube icon (three faces, lit from the top left), or the flat picture for a plant: a data URL for the hotbar and inventory */
export function icon(layers, id, size = 64){
  const b = BLOCKS[id], c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  const face = l => { const t = document.createElement('canvas'); t.width = t.height = TS; const ctx = t.getContext('2d'); const im = ctx.createImageData(TS, TS); im.data.set(layers.subarray(l * TS * TS * 4, (l + 1) * TS * TS * 4)); ctx.putImageData(im, 0, 0); return t; };
  x.imageSmoothingEnabled = false;
  const sh = SHAPE[id];
  if (b.kind === 'plant' || b.kind === 'item' || sh === SH.torch || sh === SH.ladder || sh === SH.chain || sh === SH.pane){ x.drawImage(face(FACE[id * 6]), size * .1, size * .1, size * .8, size * .8); return c.toDataURL(); }
  if (sh === SH.door){ x.drawImage(face(FACE[id * 6 + 2]), size * .3, size * .04, size * .4, size * .46); x.drawImage(face(FACE[id * 6]), size * .3, size * .5, size * .4, size * .46); return c.toDataURL(); }
  const s = size / 2, w = s * .86, h = s * .5, cx = size / 2, top0 = size * .1, top = face(FACE[id * 6 + 2]), front = face(FACE[id * 6 + 4]), side = face(FACE[id * 6]);
  const P = (px, py, pz) => [cx + (px - pz) * w, top0 + (px + pz) * h + (1 - py) * s];
  const quad = (img, o, U, V, su, sv, sw, shh, shade) => { x.save(); x.setTransform(U[0], U[1], V[0], V[1], o[0], o[1]); x.drawImage(img, su * TS, sv * TS, Math.max(1, sw * TS), Math.max(1, shh * TS), 0, 0, 1, 1); if (shade){ x.fillStyle = `rgba(0,0,0,${shade})`; x.fillRect(0, 0, 1, 1); } x.restore(); };
  const bx = sh ? boxes(id, () => 0).slice().sort((a, b2) => (a[0] + a[2]) - (b2[0] + b2[2]) || a[1] - b2[1]) : [[0, 0, 0, 1, 1, 1]];
  for (const [x0, y0, z0, x1, y1, z1] of bx){
    quad(top, P(x0, y1, z0), [(x1 - x0) * w, (x1 - x0) * h], [-(z1 - z0) * w, (z1 - z0) * h], x0, z0, x1 - x0, z1 - z0, 0);                         // the top
    quad(front, P(x0, y1, z1), [(x1 - x0) * w, (x1 - x0) * h], [0, (y1 - y0) * s], x0, 1 - y1, x1 - x0, y1 - y0, .22);                              // the left face
    quad(side, P(x1, y1, z1), [(z1 - z0) * w, -(z1 - z0) * h], [0, (y1 - y0) * s], 1 - z1, 1 - y1, z1 - z0, y1 - y0, .4);                         // the right face
  }
  return c.toDataURL();
}
