/* BDB Craft: making the world. One chunk column at a time (16 x 128 x 16), the same every time for the same seed, so the page only has to keep the blocks
   people have changed. Kinds: 'normal' (oceans, plains, forests, desert, snow, mountains, caves and ore) and 'flat' (a classic flat building world). */
import { CH, H, SEA, B } from './blocks.js?v=c13';
import { makeNoise, hash3 } from './noise.js?v=c13';
export const idx = (x, y, z) => (y * CH + z) * CH + x;
const cache = new Map();
function noiseFor(seed){ let n = cache.get(seed); if (!n){ n = {a:makeNoise(seed), b:makeNoise(seed ^ 0x5bd1e995), c:makeNoise(seed + 7919)}; cache.set(seed, n); } return n; }
const smooth = (a, b, t) => { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
/* the shape of the land at one spot: how high, and what grows there */
export function column(seed, x, z){
  const {a, b, c} = noiseFor(seed);
  const cont = a.fbm2(x * .0016, z * .0016, 4) * 1.3 + .14;                          // land and sea
  const ero = b.fbm2(x * .0045 + 300, z * .0045 - 200, 3);                      // flat or rough
  const ridge = Math.pow(1 - Math.abs(c.n2(x * .0032, z * .0032)), 3);           // mountain ridges
  const hills = a.fbm2(x * .013 + 50, z * .013 - 70, 4) * (4 + 7 * smooth(-.4, .6, ero));
  let h = SEA + 1 + cont * 14 + hills + Math.max(0, cont - .05) * ridge * 85 * smooth(-.35, .35, ero);
  if (cont < -.3) h = Math.min(h, SEA - 3 - (-.3 - cont) * 30);               // open ocean
  h = Math.max(4, Math.min(H - 6, Math.round(h)));
  const temp = b.fbm2(x * .0011 - 900, z * .0011 + 400, 3) - (h > 92 ? (h - 92) * .02 : 0), wet = c.fbm2(x * .0012 + 640, z * .0012 + 1300, 3);
  let biome = 'plains';
  if (h < SEA - 1) biome = temp < -.38 ? 'frozen' : 'ocean';
  else if (h <= SEA + 1 && cont < -.12) biome = temp < -.38 ? 'snowbeach' : 'beach';
  else if (h > 98) biome = 'peak';
  else if (temp > .32 && wet < .05) biome = 'desert';
  else if (temp < -.38) biome = 'snowy';
  else if (wet > .22) biome = temp > .15 ? 'darkforest' : 'forest';
  else if (wet > .05) biome = 'birch';
  return {h, biome};
}
const TREE = {plains:.004, forest:.035, darkforest:.05, birch:.025, snowy:.012, desert:0, beach:0, peak:0};
function treeAt(seed, x, z, col){
  const d = TREE[col.biome]; if (!d || col.h <= SEA) return null;
  if (hash3(x, 7, z, seed) >= d) return null;
  const r = hash3(x, 11, z, seed), kind = col.biome === 'snowy' ? 'spruce' : col.biome === 'birch' ? (r < .7 ? 'birch' : 'oak') : col.biome === 'darkforest' ? (r < .6 ? 'dark' : 'oak') : col.biome === 'forest' ? (r < .25 ? 'birch' : 'oak') : 'oak';
  return {kind, h:4 + Math.floor(hash3(x, 13, z, seed) * (kind === 'spruce' ? 5 : kind === 'birch' ? 3 : 3)) + (kind === 'spruce' ? 2 : 0)};
}
/* put one tree into the chunk: only the parts of it that land inside */
function plantTree(v, cx, cz, x, y, z, t, seed){
  const put = (wx, wy, wz, id, over) => { const lx = wx - cx * CH, lz = wz - cz * CH; if (lx < 0 || lz < 0 || lx >= CH || lz >= CH || wy < 0 || wy >= H) return; const i = idx(lx, wy, lz); if (over || !v[i]) v[i] = id; };
  const log = {oak:B.log_oak, birch:B.log_birch, spruce:B.log_spruce, dark:B.log_dark}[t.kind], leaf = {oak:B.leaves_oak, birch:B.leaves_birch, spruce:B.leaves_spruce, dark:B.leaves_dark}[t.kind];
  const top = y + t.h;
  if (t.kind === 'spruce'){
    for (let ly = y + 2; ly <= top + 1; ly++){ const r = Math.max(0, Math.round((top + 1 - ly) * .42 + ((top - ly) % 2) * .6)); for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (Math.abs(dx) + Math.abs(dz) <= r + (r > 1 ? 1 : 0)) put(x + dx, ly, z + dz, leaf); }
    put(x, top + 2, z, leaf);
  } else {
    const w = t.kind === 'dark' ? 3 : 2;
    for (let ly = top - 2; ly <= top + 1; ly++){ const r = ly > top ? 1 : ly === top ? w - 1 : w; for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++){ const corner = Math.abs(dx) === r && Math.abs(dz) === r; if (corner && (ly > top - 1 || hash3(x + dx, ly, z + dz, seed) < .5)) continue; put(x + dx, ly, z + dz, leaf); } }
  }
  for (let ly = y; ly < top; ly++) put(x, ly, z, log, true);
}
export function genChunk(seed, cx, cz, kind = 'normal'){
  const v = new Uint16Array(CH * H * CH);
  if (kind === 'flat'){ for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++){ v[idx(x, 0, z)] = B.bedrock; v[idx(x, 1, z)] = B.dirt; v[idx(x, 2, z)] = B.dirt; v[idx(x, 3, z)] = B.grass; } return v; }
  const {a, b} = noiseFor(seed), x0 = cx * CH, z0 = cz * CH;
  const cols = []; for (let z = -3; z < CH + 3; z++) for (let x = -3; x < CH + 3; x++) cols.push(column(seed, x0 + x, z0 + z));
  const C = (x, z) => cols[(z + 3) * (CH + 6) + x + 3];
  for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++){
    const wx = x0 + x, wz = z0 + z, {h, biome} = C(x, z);
    const steep = Math.max(Math.abs(C(x + 1, z).h - C(x - 1, z).h), Math.abs(C(x, z + 1).h - C(x, z - 1).h));
    let top = B.grass, under = B.dirt, depth = 3 + (hash3(wx, 1, wz, seed) * 2 | 0);
    if (biome === 'ocean' || biome === 'frozen') { top = h < SEA - 12 ? B.gravel : B.sand; under = B.sand; if (hash3(wx, 2, wz, seed) < .08) top = B.clay; }
    else if (biome === 'beach' || biome === 'desert'){ top = B.sand; under = B.sand; depth = biome === 'desert' ? 5 : 3; }
    else if (biome === 'snowbeach'){ top = B.sand; under = B.sand; }
    else if (biome === 'snowy') top = B.grass_snow;
    else if (biome === 'peak'){ top = h > 106 ? B.snow : B.stone; under = B.stone; }
    if (steep >= 5 && biome !== 'desert' && h > SEA + 2){ top = h > 104 ? B.snow : B.stone; under = B.stone; }
    for (let y = 0; y <= h; y++){
      let id = B.stone;
      if (y === h) id = top; else if (y > h - depth) id = under;
      if (biome === 'desert' && y <= h - depth && y > h - depth - 3) id = B.sandstone;
      if (y === 0 || (y < 3 && hash3(wx, y, wz, seed) < .5)) id = B.bedrock;
      v[idx(x, y, z)] = id;
    }
    for (let y = h + 1; y <= SEA; y++) v[idx(x, y, z)] = (y === SEA && (biome === 'frozen' || biome === 'snowbeach')) ? B.ice : B.water;
    // caves: two noise fields that meet in winding tunnels, and a few open caverns, kept away from the sea floor
    const roof = h < SEA + 2 ? h - 8 : h - 2;
    for (let y = 4; y < roof; y++){
      const t1 = a.n3(wx * .028, y * .042, wz * .028), t2 = b.n3(wx * .028 + 91, y * .042, wz * .028 - 47), room = a.n3(wx * .012 + 500, y * .025, wz * .012);
      if (t1 * t1 + t2 * t2 < .0075 + (y < 30 ? .004 : 0) || room > .62 - (y < 24 ? .08 : 0)){ const i = idx(x, y, z); if (v[i] !== B.bedrock) v[i] = 0; }
    }
    // ore, deeper is rarer
    for (let y = 2; y < Math.min(h - 3, 110); y++){
      const i = idx(x, y, z); if (v[i] !== B.stone) continue; const r = hash3(wx, y, wz, seed ^ 99);
      if (y < 15 && r < .0016) v[i] = B.ore_diamond; else if (y < 22 && r < .0045) v[i] = B.ore_ruby; else if (y < 32 && r < .0055) v[i] = B.ore_gold;
      else if (y < 64 && r < .012) v[i] = B.ore_iron; else if (r < .02) v[i] = B.ore_coal; else if (biome === 'peak' && r < .0215) v[i] = B.ore_emerald;
      else if (r > .997) v[i] = B.granite;
    }
    // what grows on top
    const above = h + 1, here = v[idx(x, h, z)], r = hash3(wx, 3, wz, seed);
    if (above < H && !v[idx(x, above, z)]){
      if (biome === 'desert' && here === B.sand){ if (r < .006){ const n = 1 + (hash3(wx, 4, wz, seed) * 3 | 0); for (let k = 0; k < n; k++) v[idx(x, above + k, z)] = B.cactus; } else if (r < .016) v[idx(x, above, z)] = B.dead_bush; }
      else if (here === B.grass){ if (r < .14) v[idx(x, above, z)] = B.tall_grass; else if (r < .155) v[idx(x, above, z)] = B.flower_red; else if (r < .17) v[idx(x, above, z)] = B.flower_yellow; else if (biome === 'darkforest' && r < .18) v[idx(x, above, z)] = B.mushroom; }
    }
  }
  // trees, including the edges of ones that stand in the next chunk over
  for (let z = -3; z < CH + 3; z++) for (let x = -3; x < CH + 3; x++){
    const col = C(x, z), t = treeAt(seed, x0 + x, z0 + z, col); if (!t) continue;
    if (x >= 0 && z >= 0 && x < CH && z < CH){ const g = v[idx(x, col.h, z)]; if (g !== B.grass && g !== B.grass_snow) continue; v[idx(x, col.h, z)] = B.dirt; }
    else { const g = col.biome === 'snowy' ? B.grass_snow : B.grass; if (col.h <= SEA) continue; }
    plantTree(v, cx, cz, x0 + x, col.h + 1, z0 + z, t, seed);
  }
  return v;
}
