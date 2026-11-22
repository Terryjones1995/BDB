/* BDB Craft: the bigger world (worlds made after the world update; older worlds keep gen.js so nothing they saved ever meets new ground).
   Land: plains, meadows, sunflower fields, forests (oak, birch, dark oak, flower), taiga and snowy taiga, snowy plains, jungle, bamboo, savanna,
   desert, badlands (bands of coloured terracotta), swamp, cherry groves, mushroom islands, stony and snowy peaks; beaches, stony shores, rivers;
   oceans warm (coral), cold and frozen (icebergs). Under it: caves, lava pools deep down, deepslate below 12, every ore, mineshafts with rails.
   On it: waterfalls and lava falls from cliffs, villages (houses, paths, a well, lamp posts, farms), desert wells, igloos, ruined portals, shipwrecks. */
import { CH, H, SEA, B, COLOURS } from './blocks.js';
import { makeNoise, hash3 } from './noise.js';
export const idx = (x, y, z) => (y * CH + z) * CH + x;
const cache = new Map();
function noiseFor(seed){ let n = cache.get(seed); if (!n){ n = {a:makeNoise(seed), b:makeNoise(seed ^ 0x5bd1e995), c:makeNoise(seed + 7919), d:makeNoise(seed * 31 + 17)}; cache.set(seed, n); } return n; }
const smooth = (a, b, t) => { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); };

/* the shape of the land at one spot: its height, its biome, and whether a river runs through */
export function column(seed, x, z){
  const {a, b, c, d} = noiseFor(seed);
  const cont = a.fbm2(x * .0014, z * .0014, 5) * 1.35 + .16;
  const ero = b.fbm2(x * .0042 + 300, z * .0042 - 200, 3);
  const ridge = Math.pow(1 - Math.abs(c.n2(x * .003, z * .003)), 3);
  const hills = a.fbm2(x * .012 + 50, z * .012 - 70, 4) * (3 + 8 * smooth(-.4, .6, ero));
  let h = SEA + 1 + cont * 14 + hills + Math.max(0, cont - .04) * ridge * 90 * smooth(-.35, .35, ero);
  const temp = b.fbm2(x * .0009 - 900, z * .0009 + 400, 3), wet = c.fbm2(x * .001 + 640, z * .001 + 1300, 3), weird = d.fbm2(x * .0016, z * .0016, 2);
  // rivers: a thin line where one noise crosses zero, cut down to just under sea level (not through mountains or the sea)
  const rv = Math.abs(d.fbm2(x * .0021 + 77, z * .0021 - 33, 3)), river = rv < .028 && cont > -.22 && h < SEA + 24;
  if (river){ const k = 1 - rv / .028; h = Math.round(h - (h - (SEA - 2)) * smooth(0, .55, k)); }
  if (cont < -.3) h = Math.min(h, SEA - 3 - (-.3 - cont) * 34);
  h = Math.max(4, Math.min(H - 6, Math.round(h)));
  const t = temp - (h > 90 ? (h - 90) * .02 : 0);
  let biome;
  if (river && h < SEA) biome = t < -.4 ? 'frozenriver' : 'river';
  else if (h < SEA - 1){ biome = t < -.4 ? 'frozen' : t > .38 ? 'warmocean' : 'ocean'; if (weird > .55 && cont < -.35) biome = 'mushroom'; }
  else if (h <= SEA + 1 && cont < -.1) biome = t < -.4 ? 'snowbeach' : (ridge > .7 ? 'stonyshore' : 'beach');
  else if (weird > .55 && cont < -.2) biome = 'mushroom';
  else if (h > 100) biome = t < .1 ? 'snowpeak' : 'peak';
  else if (h > 88 && wet > .1 && t > -.1 && t < .3) biome = 'cherry';
  else if (t > .38){ biome = wet < -.1 ? (weird > .25 ? 'badlands' : 'desert') : wet < .12 ? 'savanna' : (weird > .3 ? 'bamboo' : 'jungle'); }
  else if (t < -.42) biome = wet > .05 ? 'snowtaiga' : 'snowy';
  else if (t < -.18) biome = 'taiga';
  else if (wet > .3) biome = h <= SEA + 3 ? 'swamp' : (t > .15 ? 'darkforest' : 'forest');
  else if (wet > .18) biome = weird > .3 ? 'flowerforest' : 'forest';
  else if (wet > .06) biome = 'birch';
  else biome = weird < -.4 ? 'sunflower' : h > 80 ? 'meadow' : 'plains';
  if (biome === 'swamp' && h > SEA) h = Math.min(h, SEA + 1);
  return {h, biome, river};
}

const TREES = {plains:.003, sunflower:.001, meadow:.002, forest:.03, flowerforest:.02, birch:.025, darkforest:.06, taiga:.03, snowtaiga:.025, snowy:.004, jungle:.07, bamboo:.01, savanna:.008, swamp:.012, cherry:.02, mushroom:.008, badlands:0, desert:0};
function treeAt(seed, x, z, col){
  const d = TREES[col.biome]; if (!d || col.h <= SEA || col.river) return null;
  if (hash3(x, 7, z, seed) >= d) return null;
  const r = hash3(x, 11, z, seed), bm = col.biome;
  const kind = bm === 'taiga' || bm === 'snowtaiga' || bm === 'snowy' ? 'spruce' : bm === 'birch' ? (r < .8 ? 'birch' : 'oak') : bm === 'darkforest' ? (r < .7 ? 'dark' : r < .8 ? 'bigmush' : 'oak')
    : bm === 'forest' || bm === 'flowerforest' ? (r < .3 ? 'birch' : 'oak') : bm === 'jungle' || bm === 'bamboo' ? (r < .25 ? 'bigjungle' : 'jungle') : bm === 'savanna' ? 'acacia' : bm === 'swamp' ? 'swamp'
    : bm === 'cherry' ? 'cherry' : bm === 'mushroom' ? 'bigmush' : 'oak';
  const base = {spruce:6, birch:5, oak:4, dark:5, jungle:6, bigjungle:12, acacia:5, swamp:5, cherry:5, bigmush:5}[kind];
  return {kind, h:base + Math.floor(hash3(x, 13, z, seed) * (kind === 'bigjungle' ? 6 : 3))};
}
function plantTree(v, cx, cz, x, y, z, t, seed){
  const put = (wx, wy, wz, id, over) => { const lx = wx - cx * CH, lz = wz - cz * CH; if (lx < 0 || lz < 0 || lx >= CH || lz >= CH || wy < 0 || wy >= H) return; const i = idx(lx, wy, lz); if (over || !v[i] || v[i] === B.tall_grass) v[i] = id; };
  const LOG = {oak:B.log_oak, birch:B.log_birch, spruce:B.log_spruce, dark:B.log_dark, jungle:B.log_jungle, bigjungle:B.log_jungle, acacia:B.log_acacia, swamp:B.log_oak, cherry:B.log_cherry};
  const LEAF = {oak:B.leaves_oak, birch:B.leaves_birch, spruce:B.leaves_spruce, dark:B.leaves_dark, jungle:B.leaves_jungle, bigjungle:B.leaves_jungle, acacia:B.leaves_acacia, swamp:B.leaves_oak, cherry:B.leaves_cherry};
  const k = t.kind, top = y + t.h, log = LOG[k], leaf = LEAF[k], hr = (a, b) => hash3(x + a, b, z, seed);
  const blob = (cy, r, flat = 1) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++){ const dd = dx * dx + (dy / flat) ** 2 + dz * dz; if (dd <= r * r + .5 - hr(dx * 7 + dz, dy + 40) * 1.2) put(x + dx, cy + dy, z + dz, leaf); } };
  if (k === 'bigmush'){
    for (let ly = y; ly < top; ly++) put(x, ly, z, B.mushroom_stem, true);
    const red = hr(1, 1) < .5, cap = red ? B.mushroom_block_red : B.mushroom_block_brown;
    if (red){ for (let ly = top - 2; ly <= top; ly++){ const r = ly === top ? 1 : 2; for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (ly === top || Math.abs(dx) === r || Math.abs(dz) === r) put(x + dx, ly, z + dz, cap); } }
    else for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (Math.abs(dx) + Math.abs(dz) < 6) put(x + dx, top, z + dz, cap);
    return;
  }
  if (k === 'spruce'){
    for (let ly = y + 2; ly <= top + 1; ly++){ const r = Math.max(0, Math.round((top + 1 - ly) * .42 + ((top - ly) % 2) * .6)); for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (Math.abs(dx) + Math.abs(dz) <= r + (r > 1 ? 1 : 0)) put(x + dx, ly, z + dz, leaf); }
    put(x, top + 2, z, leaf);
  } else if (k === 'acacia'){
    const dx0 = hr(2, 2) < .5 ? 1 : -1, bend = Math.floor(t.h * .6); let bx = x;
    for (let ly = y; ly < top; ly++){ if (ly - y >= bend) bx = x + dx0 * Math.min(2, ly - y - bend + 1); put(bx, ly, z, log, true); }
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++){ if (Math.abs(dx) + Math.abs(dz) <= 4) put(bx + dx, top, z + dz, leaf); if (Math.abs(dx) + Math.abs(dz) <= 2) put(bx + dx, top + 1, z + dz, leaf); }
    return;
  } else if (k === 'bigjungle'){
    blob(top, 4, .6); blob(top - 4, 3, .5);
    for (let ly = y; ly < top; ly++) for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(x + ox, ly, z + oz, log, true);
    return;
  } else if (k === 'cherry'){
    blob(top, 3, .7); for (let ly = y; ly < top; ly++) put(x, ly, z, log, true); for (const [ox, oz] of [[2, 0], [-2, 1]]) { put(x + ox / 2, top - 1, z + oz / 2, log, true); blob(top, 2, .7); }
    return;
  } else {
    const w = k === 'dark' ? 3 : k === 'jungle' ? 2 : 2;
    for (let ly = top - 2; ly <= top + 1; ly++){ const r = ly > top ? 1 : ly === top ? w - 1 : w; for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++){ const corner = Math.abs(dx) === r && Math.abs(dz) === r; if (corner && (ly > top - 1 || hr(dx, ly + dz * 3) < .5)) continue; put(x + dx, ly, z + dz, leaf); } }
  }
  for (let ly = y; ly < top; ly++) put(x, ly, z, log, true);
}

/* ---------- villages and other places: where they are is worked out the same way everywhere, so every chunk agrees ---------- */
const REGION = 256;
export function villageIn(seed, rx, rz){
  if (hash3(rx, 91, rz, seed) > .55) return null;
  const x = rx * REGION + 48 + Math.floor(hash3(rx, 92, rz, seed) * (REGION - 96)), z = rz * REGION + 48 + Math.floor(hash3(rx, 93, rz, seed) * (REGION - 96));
  const col = column(seed, x, z), style = {plains:'oak', meadow:'oak', sunflower:'oak', forest:'oak', flowerforest:'oak', birch:'birch', desert:'desert', savanna:'acacia', taiga:'spruce', snowy:'snow', snowtaiga:'snow'}[col.biome];
  if (!style || col.h <= SEA || col.h > 96 || col.river) return null;
  // the plan: two crossing roads, a well in the middle, houses along the roads, farms, lamp posts
  const plan = {x, z, y:col.h, style, roads:[], houses:[], seed};
  const arm = (dx, dz, n) => { for (let i = 3; i < n; i++) plan.roads.push([x + dx * i, z + dz * i]); };
  const L = [14 + (hash3(rx, 94, rz, seed) * 14 | 0), 14 + (hash3(rx, 95, rz, seed) * 14 | 0), 14 + (hash3(rx, 96, rz, seed) * 14 | 0), 14 + (hash3(rx, 97, rz, seed) * 14 | 0)];
  arm(1, 0, L[0]); arm(-1, 0, L[1]); arm(0, 1, L[2]); arm(0, -1, L[3]);
  let n = 0;
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz], a) => {
    for (let i = 6; i < L[a] - 2; i += 8){ for (const side of [-1, 1]){ const r = hash3(x + i * 13, a * 7 + side, z, seed); if (r < .25) continue;
      const kind = r < .42 ? 'farm' : r < .52 ? 'lamp' : r < .82 ? 'house' : 'big';
      const hx = dx ? x + dx * i : x + side * 6, hz = dz ? z + dz * i : z + side * 6, door = dx ? (side > 0 ? 'n' : 's') : (side > 0 ? 'w' : 'e');      // the door faces the road
      plan.houses.push({kind, x:hx, z:hz, door, n:n++}); } }
  });
  return plan;
}
export function villagesNear(seed, x, z, r = 1){
  const out = [], rx = Math.floor(x / REGION), rz = Math.floor(z / REGION);
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++){ const v = villageIn(seed, rx + dx, rz + dz); if (v) out.push(v); }
  return out;
}
const VSTYLE = {
  oak:{wall:'planks_oak', post:'log_oak', floor:'cobble', roof:'stairs_planks_oak', roofs:'slab_planks_oak', door:'door_oak', path:'dirt_path', glass:'pane_glass'},
  birch:{wall:'planks_birch', post:'log_birch', floor:'cobble', roof:'stairs_planks_spruce', roofs:'slab_planks_spruce', door:'door_birch', path:'dirt_path', glass:'pane_glass'},
  spruce:{wall:'planks_spruce', post:'log_spruce', floor:'cobble', roof:'stairs_planks_dark', roofs:'slab_planks_dark', door:'door_spruce', path:'dirt_path', glass:'pane_glass'},
  acacia:{wall:'planks_acacia', post:'log_acacia', floor:'terracotta', roof:'stairs_planks_acacia', roofs:'slab_planks_acacia', door:'door_acacia', path:'dirt_path', glass:'pane_glass'},
  desert:{wall:'sandstone', post:'cut_sandstone', floor:'smooth_sandstone', roof:'slab_smooth_sandstone', roofs:'slab_smooth_sandstone', door:'door_jungle', path:'smooth_sandstone', glass:'pane_glass'},
  snow:{wall:'planks_spruce', post:'log_spruce', floor:'cobble', roof:'stairs_planks_spruce', roofs:'slab_planks_spruce', door:'door_spruce', path:'dirt_path', glass:'pane_glass'},
};
/* stamp a village (only what falls inside this chunk) */
function stampVillage(v, cx, cz, plan, seed){
  const S = VSTYLE[plan.style], put = (wx, wy, wz, id) => { const lx = wx - cx * CH, lz = wz - cz * CH; if (lx < 0 || lz < 0 || lx >= CH || lz >= CH || wy < 1 || wy >= H) return; v[idx(lx, wy, lz)] = id; };
  const get = (wx, wy, wz) => { const lx = wx - cx * CH, lz = wz - cz * CH; if (lx < 0 || lz < 0 || lx >= CH || lz >= CH || wy < 0 || wy >= H) return -1; return v[idx(lx, wy, lz)]; };
  const inside = (x0, z0, x1, z1) => x1 >= cx * CH && x0 < cx * CH + CH && z1 >= cz * CH && z0 < cz * CH + CH;
  const ground = (wx, wz) => column(seed, wx, wz).h;
  // roads follow the ground
  for (const [rx, rz] of plan.roads){ if (!inside(rx - 1, rz - 1, rx + 1, rz + 1)) continue; for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]){ const gx = rx + ox, gz = rz + oz, gy = ground(gx, gz); if (gy <= SEA) continue; put(gx, gy, gz, B[S.path]); for (let y = gy + 1; y < gy + 4; y++) if (get(gx, y, gz) > 0 && get(gx, y, gz) !== -1) put(gx, y, gz, 0); } }
  // the well
  if (inside(plan.x - 3, plan.z - 3, plan.x + 3, plan.z + 3)){ const y = plan.y;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++){ for (let yy = y - 4; yy <= y; yy++) put(plan.x + dx, yy, plan.z + dz, B.cobble); for (let yy = y + 1; yy < y + 6; yy++) put(plan.x + dx, yy, plan.z + dz, 0); }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let yy = y - 3; yy <= y; yy++) put(plan.x + dx, yy, plan.z + dz, B.water);
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]){ put(plan.x + dx, y + 1, plan.z + dz, B.fence_oak); put(plan.x + dx, y + 2, plan.z + dz, B.fence_oak); }
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) put(plan.x + dx, y + 3, plan.z + dz, B.slab_cobble); }
  for (const hs of plan.houses){
    const big = hs.kind === 'big', w = big ? 4 : 3, x0 = hs.x - w, x1 = hs.x + w, z0 = hs.z - w, z1 = hs.z + w;
    if (!inside(x0 - 1, z0 - 1, x1 + 1, z1 + 1)) continue;
    const gy = ground(hs.x, hs.z); if (gy <= SEA) continue;
    if (hs.kind === 'lamp'){ for (let y = gy + 1; y < gy + 4; y++) put(hs.x, y, hs.z, B.fence_oak); put(hs.x, gy + 4, hs.z, B.glowstone); put(hs.x, gy, hs.z, B.cobble); continue; }
    if (hs.kind === 'farm'){
      for (let x = x0; x <= x1; x++) for (let z = z0 + 1; z <= z1 - 1; z++){ const edge = x === x0 || x === x1 || z === z0 + 1 || z === z1 - 1; put(x, gy, z, edge ? B.log_oak : (x === hs.x ? B.water : B.dirt)); for (let y = gy + 1; y < gy + 4; y++) put(x, y, z, 0);
        if (!edge && x !== hs.x) put(x, gy + 1, z, hash3(x, 3, z, seed) < .5 ? B.hay : B.tall_grass); }
      for (let x = x0; x <= x1; x++) for (const z of [z0, z1]) for (let y = gy - 3; y <= gy; y++) if (get(x, y, z) === 0) put(x, y, z, B.dirt);
      continue;
    }
    // a house: a floor on a foundation, walls with posts at the corners, windows, a door facing the road, a roof, a torch inside
    const top = gy + 4;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++){
      for (let y = gy - 4; y < gy; y++) if (get(x, y, z) === 0 || get(x, y, z) === B.water || get(x, y, z) === B.tall_grass) put(x, y, z, B[S.floor]);
      put(x, gy, z, B[S.floor]);
      for (let y = gy + 1; y < top + w + 2; y++) put(x, y, z, 0);
      const edge = x === x0 || x === x1 || z === z0 || z === z1, corner = (x === x0 || x === x1) && (z === z0 || z === z1);
      if (edge) for (let y = gy + 1; y <= top; y++){ let id = corner ? B[S.post] : B[S.wall]; if (y === top) id = corner ? B[S.post] : B[S.post] + (x === x0 || x === x1 ? 0 : 0); if (!corner && y === gy + 2 && ((x + z) % 2 === 0)) id = B[S.glass]; put(x, y, z, id); }
    }
    // the door, on the side towards the road
    const dX = hs.door === 'w' ? x0 : hs.door === 'e' ? x1 : hs.x, dZ = hs.door === 'n' ? z0 : hs.door === 's' ? z1 : hs.z, f = {n:0, e:1, s:2, w:3}[hs.door];
    for (let k = 1; k <= 2; k++){ const ox = hs.door === 'w' ? -k : hs.door === 'e' ? k : 0, oz = hs.door === 'n' ? -k : hs.door === 's' ? k : 0, py = ground(dX + ox, dZ + oz); if (py > SEA && Math.abs(py - gy) < 3) put(dX + ox, py, dZ + oz, B[S.path]); }
    put(dX, gy + 1, dZ, B[S.door] + f); put(dX, gy + 2, dZ, B[S.door] + f + 8);
    // roof: steps up from each side, or a flat slab roof in the desert
    if (plan.style === 'desert'){ for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) put(x, top + 1, z, B[S.roofs]); }
    else for (let i = 0; i <= w; i++){ for (let x = x0 - 1 + i; x <= x1 + 1 - i; x++){ put(x, top + 1 + i, z0 - 1 + i, B[S.roof] + 2); put(x, top + 1 + i, z1 + 1 - i, B[S.roof] + 0); }
      for (let z = z0 + i; z <= z1 - i; z++){ put(x0 - 1 + i, top + 1 + i, z, B[S.roof] + 1); put(x1 + 1 - i, top + 1 + i, z, B[S.roof] + 3); }
      if (i === w) for (let x = x0 - 1 + i; x <= x1 + 1 - i; x++) for (let z = z0 - 1 + i; z <= z1 + 1 - i; z++) put(x, top + 1 + i, z, B[S.roofs]); }
    put(hs.x, gy + 1, hs.z, B.crafting_table); put(x0 + 1, top - 1, z0 + 1, B.lantern + 1);
    if (big){ put(x1 - 1, gy + 1, z1 - 1, B.chest); put(x1 - 1, gy + 1, z0 + 1, B.bookshelf); put(x0 + 1, gy + 1, z1 - 1, B.furnace); }
  }
}

/* ---------- the chunk ---------- */
const BANDS = ['terracotta', 'terracotta_orange', 'terracotta_yellow', 'terracotta_brown', 'terracotta_red', 'terracotta_white', 'terracotta_light_grey', 'terracotta_orange', 'terracotta'];
export function genChunk(seed, cx, cz){
  const v = new Uint16Array(CH * H * CH);
  const {a, b, c} = noiseFor(seed), x0 = cx * CH, z0 = cz * CH;
  const cols = []; for (let z = -3; z < CH + 3; z++) for (let x = -3; x < CH + 3; x++) cols.push(column(seed, x0 + x, z0 + z));
  const C = (x, z) => cols[(z + 3) * (CH + 6) + x + 3];
  for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++){
    const wx = x0 + x, wz = z0 + z, {h, biome, river} = C(x, z);
    const steep = Math.max(Math.abs(C(x + 1, z).h - C(x - 1, z).h), Math.abs(C(x, z + 1).h - C(x, z - 1).h));
    let top = B.grass, under = B.dirt, depth = 3 + (hash3(wx, 1, wz, seed) * 2 | 0);
    const ocean = biome === 'ocean' || biome === 'warmocean' || biome === 'frozen' || biome === 'river' || biome === 'frozenriver';
    if (ocean){ top = h < SEA - 14 ? B.gravel : (biome === 'river' && hash3(wx, 2, wz, seed) < .3 ? B.clay : B.sand); under = B.sand; if (biome === 'ocean' && hash3(wx, 2, wz, seed) < .08) top = B.clay; }
    else if (biome === 'beach' || biome === 'desert'){ top = B.sand; under = B.sand; depth = biome === 'desert' ? 6 : 3; }
    else if (biome === 'snowbeach'){ top = B.sand; under = B.sand; }
    else if (biome === 'stonyshore'){ top = B.stone; under = B.stone; }
    else if (biome === 'badlands'){ top = B.red_sand; under = B.terracotta; depth = 1; }
    else if (biome === 'snowy' || biome === 'snowtaiga' || biome === 'snowpeak') top = B.grass_snow;
    else if (biome === 'taiga' && hash3(wx, 9, wz, seed) < .3) top = B.podzol;
    else if (biome === 'mushroom') top = B.mycelium;
    else if (biome === 'swamp' && hash3(wx, 9, wz, seed) < .2) top = B.mud;
    else if (biome === 'peak'){ top = h > 110 ? B.snow : B.stone; under = B.stone; }
    if (steep >= 5 && biome !== 'desert' && biome !== 'badlands' && h > SEA + 2){ top = h > 106 ? B.snow : (hash3(wx, 4, wz, seed) < .2 ? B.gravel : B.stone); under = B.stone; }
    for (let y = 0; y <= h; y++){
      let id = y < 12 ? B.deepslate : B.stone;
      if (y < 12 && y > 9 && hash3(wx, y, wz, seed) < .5) id = B.stone;
      if (y === h) id = top; else if (y > h - depth) id = under;
      if (biome === 'desert' && y <= h - depth && y > h - depth - 4) id = B.sandstone;
      if (biome === 'badlands' && y < h && y > h - 30) id = B[BANDS[((y + Math.floor(Math.sin(wx * .05) * 2)) % BANDS.length + BANDS.length) % BANDS.length]];
      if (y === 0 || (y < 3 && hash3(wx, y, wz, seed) < .5)) id = B.bedrock;
      v[idx(x, y, z)] = id;
    }
    const frozen = biome === 'frozen' || biome === 'snowbeach' || biome === 'frozenriver';
    for (let y = h + 1; y <= SEA; y++) v[idx(x, y, z)] = (y === SEA && frozen) ? B.ice : B.water;
    if (biome === 'frozen' && h < SEA - 6 && b.n2(wx * .05, wz * .05) > .55){ const tall = Math.floor((b.n2(wx * .05, wz * .05) - .55) * 40); for (let y = SEA - 4; y <= SEA + tall; y++) v[idx(x, y, z)] = y > SEA + tall - 2 ? B.snow : B.packed_ice; }
    // caves: winding tunnels and open caverns; the deepest air turns to lava
    const roof = h < SEA + 2 ? h - 8 : h - 2;
    for (let y = 4; y < roof; y++){
      const t1 = a.n3(wx * .028, y * .042, wz * .028), t2 = b.n3(wx * .028 + 91, y * .042, wz * .028 - 47), room = a.n3(wx * .012 + 500, y * .025, wz * .012);
      if (t1 * t1 + t2 * t2 < .0075 + (y < 30 ? .004 : 0) || room > .62 - (y < 24 ? .08 : 0)){ const i = idx(x, y, z); if (v[i] !== B.bedrock) v[i] = y <= 8 ? B.lava : 0; }
    }
    // springs: water (or lava low down) coming out of a cliff face
    if (h > SEA + 6){ const lowest = Math.min(C(x + 1, z).h, C(x - 1, z).h, C(x, z + 1).h, C(x, z - 1).h);
      if (h - lowest >= 4 && hash3(wx, 5, wz, seed) < .08){ const y = lowest + 1 + Math.floor(hash3(wx, 6, wz, seed) * Math.max(1, h - lowest - 2)); if (y < h - 1) v[idx(x, y, z)] = hash3(wx, 8, wz, seed) < .12 && y < 72 ? B.lava : B.water; } }
    // ore, and patches of other stone
    for (let y = 2; y < Math.min(h - 3, 120); y++){
      const i = idx(x, y, z), here = v[i]; if (here !== B.stone && here !== B.deepslate) continue; const r = hash3(wx, y, wz, seed ^ 99), deep = here === B.deepslate;
      const ore = (k) => { v[i] = deep ? B['deep_ore_' + k] : B['ore_' + k]; };
      if (y < 16 && r < .0018) ore('diamond'); else if (y < 30 && r < .004) ore('redstone'); else if (y < 32 && r < .0055) ore('gold'); else if (y < 34 && r < .0075) ore('lapis');
      else if (y < 22 && r < .0085 && !deep) v[i] = B.ore_ruby; else if (y < 70 && r < .016) ore('iron'); else if (y > 40 && y < 96 && r < .024) ore('copper'); else if (r < .033) ore('coal');
      else if ((biome === 'peak' || biome === 'snowpeak') && r < .0345) ore('emerald');
      else { const s = c.n3(wx * .06, y * .06, wz * .06); if (s > .62) v[i] = y < 20 ? B.tuff : B.andesite; else if (s < -.64) v[i] = B.diorite; else if (Math.abs(s) < .02 && y < 60) v[i] = B.granite; else if (y < 20 && r > .996) v[i] = B.gravel; }
    }
    // what grows on top
    const above = h + 1, here = v[idx(x, h, z)], r = hash3(wx, 3, wz, seed), r2 = hash3(wx, 12, wz, seed);
    if (above < H && !v[idx(x, above, z)]){
      const plant = id => { v[idx(x, above, z)] = id; };
      if ((biome === 'desert' || biome === 'badlands') && (here === B.sand || here === B.red_sand)){ if (r < .006 && biome === 'desert'){ const n = 1 + (r2 * 3 | 0); for (let k = 0; k < n; k++) v[idx(x, above + k, z)] = B.cactus; } else if (r < .02) plant(B.dead_bush); }
      else if (here === B.grass || here === B.podzol || here === B.grass_snow){
        const FL = {flowerforest:[B.tulip_red, B.tulip_orange, B.tulip_white, B.tulip_pink, B.allium, B.azure_bluet, B.oxeye_daisy, B.cornflower, B.lily_valley, B.flower_red, B.flower_yellow],
          meadow:[B.cornflower, B.allium, B.azure_bluet, B.oxeye_daisy, B.flower_yellow], plains:[B.flower_red, B.flower_yellow, B.azure_bluet, B.oxeye_daisy, B.tulip_red], sunflower:[B.sunflower, B.sunflower, B.flower_yellow],
          swamp:[B.blue_orchid], cherry:[B.tulip_pink, B.peony, B.allium], forest:[B.lilac, B.rose_bush, B.peony, B.flower_red], birch:[B.flower_yellow, B.lily_valley], darkforest:[B.brown_mushroom, B.mushroom]}[biome];
        const fr = biome === 'flowerforest' ? .2 : biome === 'meadow' || biome === 'sunflower' ? .1 : .02;
        if (biome === 'snowy' || biome === 'snowtaiga') { if (r < .02) plant(B.fern); }
        else if (biome === 'bamboo' && r < .2){ const n = 3 + (r2 * 8 | 0); for (let k = 0; k < n && above + k < H; k++) v[idx(x, above + k, z)] = B.bamboo; }
        else if (FL && r < fr) plant(FL[Math.floor(r2 * FL.length)]);
        else if (r < (biome === 'jungle' ? .4 : biome === 'savanna' ? .25 : .14)) plant(biome === 'taiga' || biome === 'jungle' ? (r2 < .5 ? B.fern : B.tall_grass) : B.tall_grass);
        else if (biome === 'jungle' && r < .41) plant(B.melon);
      }
      else if (here === B.mycelium && r < .03) plant(r2 < .5 ? B.mushroom : B.brown_mushroom);
      
    }
    // sugar cane by rivers, coral and plants on warm sea floors
    if (biome === 'warmocean' && h < SEA - 2 && h > SEA - 14){ const rr = hash3(wx, 14, wz, seed); const kinds = ['tube', 'brain', 'bubble', 'fire', 'horn'], k = kinds[Math.floor(hash3(wx, 15, wz, seed) * 5)];
      if (rr < .25) v[idx(x, h, z)] = B['coral_' + k]; else if (rr < .45) v[idx(x, h + 1, z)] = B['coral_plant_' + k]; }
    if (h === SEA && (top === B.sand || top === B.grass) && hash3(wx, 16, wz, seed) < .03){ const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => C(x + dx, z + dz).h < SEA); if (nearWater) for (let k = 1; k <= 1 + (hash3(wx, 17, wz, seed) * 3 | 0); k++) if (h + k < H) v[idx(x, h + k, z)] = B.sugar_cane; }
  }
  // mineshafts: long tunnels held up with planks, with a rail down the middle
  { const sx = Math.floor(cx / 4), sz = Math.floor(cz / 4), on = hash3(sx, 41, sz, seed) < .35;
    if (on){ const my = 18 + Math.floor(hash3(sx, 42, sz, seed) * 20), alongX = hash3(sx, 43, sz, seed) < .5, line = (alongX ? sz : sx) * 64 + 8 + Math.floor(hash3(sx, 44, sz, seed) * 48);
      for (let i = 0; i < CH; i++){ const wx = alongX ? x0 + i : line, wz = alongX ? line : z0 + i, lx = wx - x0, lz = wz - z0; if (lx < 0 || lz < 0 || lx >= CH || lz >= CH) continue;
        for (let w = -1; w <= 1; w++) for (let y = my; y < my + 3; y++){ const ax = alongX ? lx : lx + w, az = alongX ? lz + w : lz; if (ax < 0 || az < 0 || ax >= CH || az >= CH) continue; const j = idx(ax, y, az); if (v[j] !== B.bedrock) v[j] = 0; }
        v[idx(lx, my, lz)] = B.rail + (alongX ? 1 : 0);
        if ((alongX ? wx : wz) % 4 === 0) for (const w of [-1, 1]){ const ax = alongX ? lx : lx + w, az = alongX ? lz + w : lz; if (ax < 0 || az < 0 || ax >= CH || az >= CH) continue; v[idx(ax, my, az)] = B.fence_oak; v[idx(ax, my + 1, az)] = B.fence_oak; }
        if ((alongX ? wx : wz) % 4 === 0) for (let w = -1; w <= 1; w++){ const ax = alongX ? lx : lx + w, az = alongX ? lz + w : lz; if (ax < 0 || az < 0 || ax >= CH || az >= CH) continue; v[idx(ax, my + 2, az)] = B.planks_oak; }
        if ((alongX ? wx : wz) % 12 === 0) v[idx(lx, my + 1, lz)] = B.torch; } } }
  // trees, including the edges of ones that stand in the next chunk over
  const vills = villagesNear(seed, x0 + 8, z0 + 8), inVillage = (wx, wz) => vills.some(p => Math.abs(wx - p.x) < 36 && Math.abs(wz - p.z) < 36);
  for (let z = -3; z < CH + 3; z++) for (let x = -3; x < CH + 3; x++){
    const col = C(x, z), t = treeAt(seed, x0 + x, z0 + z, col); if (!t || inVillage(x0 + x, z0 + z)) continue;
    if (x >= 0 && z >= 0 && x < CH && z < CH){ const g = v[idx(x, col.h, z)]; if (g !== B.grass && g !== B.grass_snow && g !== B.podzol && g !== B.mycelium && g !== B.mud && g !== B.dirt) continue; if (t.kind !== 'bigmush') v[idx(x, col.h, z)] = B.dirt; }
    else if (col.h <= SEA) continue;
    plantTree(v, cx, cz, x0 + x, col.h + 1, z0 + z, t, seed);
  }
  // places
  for (const p of vills) stampVillage(v, cx, cz, p, seed);
  smallPlaces(v, cx, cz, seed);
  return v;
}
/* one-off places: desert wells, igloos, ruined portals, shipwrecks. One may sit in each 6 x 6 chunk square */
function smallPlaces(v, cx, cz, seed){
  const sx = Math.floor(cx / 6), sz = Math.floor(cz / 6); if (hash3(sx, 61, sz, seed) > .6) return;
  const wx = sx * 96 + 16 + Math.floor(hash3(sx, 62, sz, seed) * 64), wz = sz * 96 + 16 + Math.floor(hash3(sx, 63, sz, seed) * 64), col = column(seed, wx, wz), y = col.h;
  const put = (x, yy, z, id) => { const lx = x - cx * CH, lz = z - cz * CH; if (lx < 0 || lz < 0 || lx >= CH || lz >= CH || yy < 1 || yy >= H) return; v[idx(lx, yy, lz)] = id; };
  if (Math.abs(wx - (cx * CH + 8)) > 24 || Math.abs(wz - (cz * CH + 8)) > 24) return;
  if (col.biome === 'desert'){
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++){ put(wx + dx, y, wz + dz, B.sandstone); for (let k = 1; k < 5; k++) put(wx + dx, y + k, wz + dz, 0); }
    for (let k = 0; k < 3; k++) put(wx, y - k, wz, B.water); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(wx + dx, y + 1, wz + dz, B.slab_sandstone);
    for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]){ put(wx + dx, y + 1, wz + dz, B.sandstone); put(wx + dx, y + 2, wz + dz, B.sandstone); }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) put(wx + dx, y + 3, wz + dz, B.slab_sandstone);
  } else if (col.biome === 'snowy' || col.biome === 'snowtaiga'){
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let k = 0; k < 4; k++){ const d = Math.hypot(dx, k * 1.2, dz); if (d < 3.4 && d > 2.4) put(wx + dx, y + 1 + k, wz + dz, B.snow); else if (d <= 2.4) put(wx + dx, y + 1 + k, wz + dz, 0); }
    put(wx + 3, y + 1, wz, 0); put(wx + 3, y + 2, wz, 0); put(wx - 1, y + 1, wz, B.furnace); put(wx, y + 1, wz + 1, B.carpet_white); put(wx + 1, y + 1, wz - 1, B.torch);
  } else if (col.biome === 'ocean' || col.biome === 'warmocean'){
    // a shipwreck lying on the bottom
    const by = y + 1; for (let i = -5; i <= 5; i++){ const w = 2 - Math.floor(Math.abs(i) / 3); for (let dz = -w; dz <= w; dz++){ put(wx + i, by, wz + dz, B.planks_spruce); if (Math.abs(dz) === w) { put(wx + i, by + 1, wz + dz, B.planks_spruce); put(wx + i, by + 2, wz + dz, Math.abs(i) < 4 ? B.fence_spruce + 1 : B.planks_spruce); } } }
    for (let k = 1; k < 7; k++) put(wx - 1, by + k, wz, B.log_spruce); put(wx + 2, by + 1, wz, B.chest);
  } else if (y > SEA + 1){
    // a ruined portal: a broken obsidian frame with some crying obsidian and netherrack round it
    for (let k = 0; k < 5; k++){ if (hash3(wx, 70 + k, wz, seed) > .2) put(wx, y + 1 + k, wz, k % 3 ? B.obsidian : B.crying_obsidian); if (hash3(wx + 3, 70 + k, wz, seed) > .4) put(wx + 3, y + 1 + k, wz, B.obsidian); }
    for (let dx = 0; dx <= 3; dx++){ put(wx + dx, y + 1, wz, B.obsidian); if (hash3(wx + dx, 77, wz, seed) > .5) put(wx + dx, y + 5, wz, B.obsidian); }
    for (let dx = -2; dx <= 5; dx++) for (let dz = -2; dz <= 2; dz++) if (hash3(wx + dx, 79, wz + dz, seed) < .35) put(wx + dx, y, wz + dz, hash3(wx + dx, 80, wz + dz, seed) < .5 ? B.netherrack : B.magma);
  }
}
