/* BDB Craft: every block texture, drawn pixel by pixel in code at 16 x 16 and doubled to 32 (the BDB Block is the one drawn at full size, from his photo).
   Nothing is copied from any other game: each one is a little recipe of colours, noise and shapes. Also the cube icons for the hotbar and inventory. */
import { TEX, T, COLOURS, BLOCKS, FACE } from './blocks.js?v=c4';
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
  p.each((x, y) => { const edge = x === 0 || y === 0 || x === 15 || y === 15; if (edge) p.set(x, y, tint ? mul(c, .75) : [210, 228, 235], tint ? 235 : 255); else p.set(x, y, c, tint ? a : 0); });
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
  if (b.kind === 'plant'){ x.drawImage(face(FACE[id * 6]), size * .1, size * .1, size * .8, size * .8); return c.toDataURL(); }
  const s = size / 2, top = face(FACE[id * 6 + 2]), side = face(FACE[id * 6]), w = s * .86, h = s * .5;
  const draw = (img, a, b2, c2, d, e, f, shade) => { x.save(); x.setTransform(a, b2, c2, d, e, f); x.drawImage(img, 0, 0, 1, 1); if (shade){ x.fillStyle = `rgba(0,0,0,${shade})`; x.fillRect(0, 0, 1, 1); } x.restore(); };
  const cx = size / 2, top0 = size * .1;
  draw(top, w, h, -w, h, cx, top0, 0);                                         // the top: a diamond
  draw(side, w, h, 0, s, cx - w, top0 + h, .22);                                // the left face
  draw(side, w, -h, 0, s, cx, top0 + 2 * h, .4);                                // the right face
  return c.toDataURL();
}
