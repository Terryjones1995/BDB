/* BDB Craft: the bigger world (worlds made after the world update; older worlds keep gen.js so nothing they saved ever meets new ground).
   Land: plains, meadows, sunflower fields, forests (oak, birch, dark oak, flower), taiga and snowy taiga, snowy plains, jungle, bamboo, savanna,
   desert, badlands (bands of coloured terracotta), swamp, cherry groves, mushroom islands, stony and snowy peaks; beaches, stony shores, rivers;
   oceans warm (coral), cold and frozen (icebergs). Under it: caves, lava pools deep down, deepslate below 12, every ore, mineshafts with rails.
   On it: waterfalls and lava falls from cliffs, villages (houses, paths, a well, lamp posts, farms), desert wells, igloos, ruined portals, shipwrecks. */
import { CH, H, SEA, B, COLOURS } from './blocks.js?v=c22';
import { makeNoise, hash3 } from './noise.js?v=c22';
export const idx = (x, y, z) => (y * CH + z) * CH + x;
const cache = new Map();
function noiseFor(seed){ let n = cache.get(seed); if (!n){ n = {a:makeNoise(seed), b:makeNoise(seed ^ 0x5bd1e995), c:makeNoise(seed + 7919), d:makeNoise(seed * 31 + 17)}; cache.set(seed, n); } return n; }
const smooth = (a, b, t) => { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); };

/* the shape of the land at one spot: its height, its biome, and whether a river runs through */
function landColumn(seed, x, z){
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

/* ---------- cities and towns. One may stand in each 1024 x 1024 region, on dry land that is flat enough. Three sizes: towns (a few streets of
   low buildings and houses), cities, and huge cities whose downtowns reach the height limit. Each is named after a real place of its size.
   Two are built to look like the real places, near where every world starts: Belleville, Ontario, and Kingston, Ontario, a little east of it.
   Everything here is worked out from the column alone, so every chunk agrees with its neighbours. ---------- */
const TOWNS = ['Trenton|Ontario', 'Picton|Ontario', 'Napanee|Ontario', 'Brighton|Ontario', 'Cobourg|Ontario', 'Port Hope|Ontario', 'Gananoque|Ontario', 'Madoc|Ontario', 'Stirling|Ontario', 'Tweed|Ontario', 'Bancroft|Ontario',
  'Banff|Alberta', 'Canmore|Alberta', 'Jasper|Alberta', 'Whistler|British Columbia', 'Tofino|British Columbia', 'Moose Jaw|Saskatchewan', 'Lunenburg|Nova Scotia', 'Niagara-on-the-Lake|Ontario', 'Huntsville|Ontario',
  'Collingwood|Ontario', 'Stratford|Ontario', 'Gimli|Manitoba', 'Dawson City|Yukon', 'Aspen|Colorado', 'Sedona|Arizona', 'Key West|Florida', 'Bar Harbor|Maine', 'Hallstatt|Austria', 'Giethoorn|Netherlands', 'Portree|Scotland'];
const CITIES = ['Ottawa|Ontario', 'Hamilton|Ontario', 'London|Ontario', 'Windsor|Ontario', 'Peterborough|Ontario', 'Oshawa|Ontario', 'Barrie|Ontario', 'Sudbury|Ontario', 'Thunder Bay|Ontario', 'Halifax|Nova Scotia',
  'Quebec City|Quebec', 'Victoria|British Columbia', 'Winnipeg|Manitoba', 'Saskatoon|Saskatchewan', 'Regina|Saskatchewan', 'St. John\'s|Newfoundland', 'Edmonton|Alberta', 'Boston|Massachusetts', 'Seattle|Washington',
  'Denver|Colorado', 'Detroit|Michigan', 'Buffalo|New York', 'Nashville|Tennessee', 'New Orleans|Louisiana', 'Dublin|Ireland', 'Lisbon|Portugal', 'Prague|Czechia', 'Vienna|Austria', 'Amsterdam|Netherlands',
  'Copenhagen|Denmark', 'Oslo|Norway', 'Stockholm|Sweden', 'Athens|Greece', 'Edinburgh|Scotland', 'Auckland|New Zealand', 'Havana|Cuba', 'Cape Town|South Africa'];
const MEGAS = ['Toronto|Ontario', 'Montreal|Quebec', 'Vancouver|British Columbia', 'Calgary|Alberta', 'New York|New York', 'Chicago|Illinois', 'Los Angeles|California', 'Miami|Florida', 'Houston|Texas',
  'London|England', 'Paris|France', 'Berlin|Germany', 'Madrid|Spain', 'Rome|Italy', 'Istanbul|Turkey', 'Tokyo|Japan', 'Osaka|Japan', 'Seoul|South Korea', 'Shanghai|China', 'Hong Kong|China', 'Singapore|Singapore',
  'Dubai|UAE', 'Mumbai|India', 'Bangkok|Thailand', 'Sydney|Australia', 'Mexico City|Mexico', 'Sao Paulo|Brazil', 'Buenos Aires|Argentina', 'Cairo|Egypt', 'Lagos|Nigeria'];
export const CREG = 1024;
const SIZES = {town:[40, 60], city:[95, 145], mega:[190, 250]};
const FIXED = {'0,0':{name:'Belleville', place:'Ontario', special:'belleville', size:'city', r:150, style:'brick'}, '1,0':{name:'Kingston', place:'Ontario', special:'kingston', size:'city', r:175, style:'limestone'}};
const cityCache = new Map();
export function cityIn(seed, rx, rz){
  const key = seed + ':' + rx + ',' + rz; if (cityCache.has(key)) return cityCache.get(key);
  const fixed = FIXED[rx + ',' + rz]; let city = null;
  if (fixed || hash3(rx, 301, rz, seed) < .55){
    const roll = hash3(rx, 322, rz, seed), size = fixed ? fixed.size : roll < .4 ? 'town' : roll < .75 ? 'city' : 'mega';
    const r = fixed ? fixed.r : SIZES[size][0] + Math.floor(hash3(rx, 320, rz, seed) * (SIZES[size][1] - SIZES[size][0])), room = CREG - 2 * (r + 60);
    for (let tries = 0; tries < (fixed ? 40 : 8) && !city; tries++){
      const x = rx * CREG + r + 60 + Math.floor(hash3(rx, 302 + tries, rz, seed) * room), z = rz * CREG + r + 60 + Math.floor(hash3(rx, 360 + tries, rz, seed) * room);
      const c = landColumn(seed, x, z), wet = c.h <= SEA + 1 || c.river || ['ocean', 'warmocean', 'frozen', 'mushroom', 'swamp'].includes(c.biome);
      if (!fixed && (wet || c.h > 86 || c.biome === 'peak' || c.biome === 'snowpeak')) continue;
      if (fixed && wet && tries < 39) continue;
      let ok = 0; const lim = size === 'town' ? 16 : 24;
      for (let a = 0; a < 8; a++){ const e = landColumn(seed, x + Math.cos(a * .785) * r * .8, z + Math.sin(a * .785) * r * .8); if (e.h > SEA && Math.abs(e.h - c.h) < lim) ok++; }
      if (ok < (fixed ? 0 : 6)) continue;
      const list = size === 'town' ? TOWNS : size === 'city' ? CITIES : MEGAS, [name, place] = (fixed ? fixed.name + '|' + fixed.place : list[Math.floor(hash3(rx, 321, rz, seed) * list.length)]).split('|');
      city = {x, z, r, name, place, size, rx, rz, special:fixed ? fixed.special : null, y:fixed ? SEA + 3 : Math.max(SEA + 2, Math.min(size === 'mega' ? 72 : 84, c.h)),
        style:fixed ? fixed.style : c.biome === 'desert' || c.biome === 'badlands' ? 'desert' : size === 'town' ? 'town' : 'modern'};
      city.blend = 16 + Math.round(r * .08); city.marks = landmarks(city);
    }
  }
  cityCache.set(key, city); return city;
}
export function citiesNear(seed, x, z){ const rx = Math.floor(x / CREG), rz = Math.floor(z / CREG), out = []; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++){ const c = cityIn(seed, rx + dx, rz + dz); if (c) out.push(c); } return out; }
export function column(seed, x, z){
  const c = landColumn(seed, x, z), city = cityIn(seed, Math.floor(x / CREG), Math.floor(z / CREG)); if (!city) return c;
  const d = Math.max(Math.abs(x - city.x), Math.abs(z - city.z));
  if (d <= city.r) return {h:city.y, biome:'city', river:false, city};
  if (d <= city.r + city.blend){ const k = (d - city.r) / city.blend, h = Math.round(city.y + (c.h - city.y) * k * k * (3 - 2 * k)); return {...c, h, river:c.river && k > .8}; }
  return c;
}

/* ---- water in the two real cities: the bay or the lake to the south, and a river ---- */
function shoreZ(city, dx){ return city.special === 'belleville' ? city.r * .42 + Math.sin(dx * .03) * 6 + Math.sin(dx * .011) * 9 : city.r * .36 + Math.sin(dx * .025) * 4; }
function riverAt(city, dx, dz){
  if (city.special === 'belleville'){ const c = -city.r * .22 + Math.sin(dz * .035) * 6; return Math.abs(dx - c) <= 4 ? Math.abs(dx - c) : -1; }        // the Moira River, running down to the bay
  if (city.special === 'kingston'){ const c = city.r * .5 + Math.sin(dz * .02) * 3; return Math.abs(dx - c) <= 13 ? Math.abs(dx - c) : -1; }          // the Cataraqui River, wide where it meets the lake
  return -1;
}
const isWater = (city, dx, dz) => city.special && (dz > shoreZ(city, dx) || (riverAt(city, dx, dz) >= 0 && dz > -city.r));

/* ---- the landmarks: a box on the map and how to fill each column of it ---- */
function landmarks(city){
  const L = [], R = city.r, mark = (name, cx, cz, hw, hd, col) => (cx = Math.round(cx), cz = Math.round(cz), hw = Math.round(hw), hd = Math.round(hd), L.push({name, x0:city.x + cx - hw, x1:city.x + cx + hw, z0:city.z + cz - hd, z1:city.z + cz + hd, cx:city.x + cx, cz:city.z + cz, col}));
  if (city.special === 'belleville'){
    // City Hall (1873): red brick, limestone trim, tall Gothic windows, a mansard roof, and a 144 foot clock tower with four clock faces
    const hx = -R * .22 + 22, hz = -6;
    mark('city hall', hx, hz, 14, 20, (put, lx, lz, Y, dx, dz) => {
      if (isWater(city, dx, dz) || riverAt(city, dx, dz) >= 0) return false;
      const ax = Math.abs(lx), tower = lz <= -9 && lz >= -14 && ax <= 3;
      for (let y = Y - 1; y <= Y; y++) put(y, 'smooth_stone');
      // the square round it: paving, benches, lamps, a few trees in planters
      if (ax > 9 || lz < -14 || lz > 15 || (lz < -8 && ax > 3)){ put(Y, ((lx + lz) & 1) ? 'polished_andesite' : 'smooth_stone');
        if ((ax === 12) && (lz % 6 === 0)){ for (let k = 1; k <= 3; k++) put(Y + k, 'fence_dark'); put(Y + 4, 'lantern'); }
        else if (ax === 12 && (lz % 6 === 3)){ put(Y, 'grass'); for (let k = 1; k <= 3; k++) put(Y + k, 'log_oak'); put(Y + 4, 'leaves_oak'); put(Y + 5, 'leaves_oak'); }
        else if ((ax === 13 || ax === 11) && (lz % 6 === 3)) { put(Y + 3, 'leaves_oak'); put(Y + 4, 'leaves_oak'); }
        return; }
      if (tower){
        const edge = ax === 3 || lz === -9 || lz === -14, corner = ax === 3 && (lz === -9 || lz === -14), face = edge && !corner;
        const facePos = ax === 3 ? lz + 11.5 : lx, onFace = Math.abs(facePos) <= 1.5;
        for (let y = Y + 1; y <= Y + 30; y++){ if (!edge) { if ((y - Y) % 6 === 0) put(y, 'planks_dark'); continue; }
          let k = corner ? 'stone_bricks' : 'bricks'; if (face && (y - Y) % 6 >= 2 && (y - Y) % 6 <= 4 && Math.abs(facePos) < .6 && y < Y + 26) k = 'glass'; if (face && y <= Y + 3 && lz === -14 && ax <= 1) k = y <= Y + 2 ? 0 : 'stone_bricks'; put(y, k); }
        // the clock: a white face on every side, black hands at ten past
        for (let y = Y + 31; y <= Y + 35; y++){ let k = corner ? 'stone_bricks' : edge ? 'bricks' : 0;
          if (face && onFace && y >= Y + 32 && y <= Y + 34){ k = 'smooth_quartz'; const fx = Math.round(facePos + 1), fy = y - Y - 32; if ((fx === 1 && fy === 1) || (fx === 1 && fy === 2) || (fx === 2 && fy === 1)) k = 'concrete_black'; }
          put(y, k); }
        put(Y + 36, edge ? 'stone_bricks' : 'planks_dark');
        // the belfry, then the steep mansard spire
        for (let y = Y + 37; y <= Y + 39; y++) put(y, corner ? 'stone_bricks' : edge ? (y === Y + 39 ? 'stone_bricks' : 'iron_bars') : 0);
        const lzz = lz + 11.5, rr = Math.max(Math.abs(lx), Math.abs(lzz));
        for (let s = 0; s < 6; s++){ const y = Y + 40 + s * 1, lim = 3 - s * .5; if (rr <= lim + .01) put(y, s < 2 && rr > lim - .99 ? 'polished_deepslate' : 'deepslate_tiles'); }
        if (Math.abs(lx) < .6 && Math.abs(lzz) < .6){ for (let y = Y + 46; y <= Y + 49; y++) put(y, 'iron_bars'); put(Y + 50, 'block_gold'); }
        return;
      }
      if (lz < -8) return;
      // the hall: three storeys of brick with stone bands, pointed windows, a mansard roof with dormers
      const edge = ax === 9 || lz === -8 || lz === 15, corner = ax === 9 && (lz === -8 || lz === 15);
      for (let y = Y + 1; y <= Y + 13; y++){
        const fl = (y - Y) % 5;
        if (edge){ let k = corner ? 'stone_bricks' : fl === 0 ? 'smooth_stone' : 'bricks'; const along = ax === 9 ? lz : lx; if (!corner && fl >= 2 && fl <= 4 && ((along % 3) + 3) % 3 === 0) k = fl === 4 && y > Y + 5 ? 'bricks' : 'glass'; if (lz === -8 && ax <= 1 && y <= Y + 3) k = 0; put(y, k); }
        else if (fl === 0) put(y, 'planks_dark'); else if (fl === 4 && lx % 4 === 0 && lz % 4 === 0) put(y, 'glowstone');
      }
      for (let s = 0; s < 4; s++){ const inset = s, y = Y + 14 + s; if (ax <= 9 - inset && lz >= -8 + inset && lz <= 15 - inset){ const rim = ax === 9 - inset || lz === -8 + inset || lz === 15 - inset; put(y, rim ? (s === 1 && (lx + lz) % 4 === 0 ? 'glass' : 'deepslate_tiles') : s === 3 ? 'deepslate_tiles' : 0); } }
    });
    // the Bay Bridge (Norris Whitney Bridge) out over the Bay of Quinte towards Prince Edward County
    mark('bay bridge', R * .3, R * .42 + R * .34, 3, R * .34 + 14, (put, lx, lz, Y, dx, dz) => {
      const sz = shoreZ(city, dx), past = dz - sz; if (past < -6) return false;
      const deck = Y + Math.max(0, Math.min(7, Math.floor((past + 6) / 3))), ax = Math.abs(lx);
      if (dz > sz){ for (let y = SEA - 8; y <= SEA; y++) put(y, y < SEA - 6 ? 'sand' : 'water'); }
      for (let y = deck + 1; y < deck + 4; y++) put(y, 0);
      put(deck, ax === 3 ? 'smooth_stone' : ax === 0 && Math.floor(dz / 2) % 3 === 0 ? 'concrete_yellow' : 'concrete_grey');
      if (ax === 3) put(deck + 1, 'iron_bars');
      if (dz > sz && Math.round(past) % 14 === 0 && ax !== 1) for (let y = SEA - 6; y < deck; y++) put(y, 'smooth_stone');
      if (ax === 3 && Math.round(past) % 14 === 7){ for (let k = 2; k <= 4; k++) put(deck + k, 'iron_bars'); put(deck + 5, 'lantern'); }
    });
  }
  if (city.special === 'kingston'){
    // City Hall (1844): a whole block of limestone facing the lake, a columned portico, and a tall drum and dome
    const cz = R * .36 - 24;
    mark('city hall', -R * .05, cz, 24, 9, (put, lx, lz, Y) => {
      const ax = Math.abs(lx); for (let y = Y - 1; y <= Y; y++) put(y, 'smooth_stone');
      const portico = lz >= 6 && ax <= 7, main = lz <= 5 && lz >= -9;
      if (portico){ for (let y = Y + 1; y <= Y + 11; y++){ let k = 0; if (lz === 9 && ax % 2 === 1 && y <= Y + 9) k = 'quartz_pillar'; if (y >= Y + 10) k = y === Y + 11 && ax > 5 ? 0 : 'smooth_quartz'; if (y === Y + 12 - 0 && ax <= 3) k = 'smooth_quartz'; put(y, k); } if (ax <= 4) put(Y + 12, 'smooth_quartz'); if (ax <= 1) put(Y + 13, 'smooth_quartz'); return; }
      if (!main) return;
      const edge = ax === 24 || lz === 5 || lz === -9, corner = ax === 24 && (lz === 5 || lz === -9), wing = ax >= 20;
      const top = wing ? 13 : 12;
      for (let y = Y + 1; y <= Y + top; y++){ const fl = (y - Y) % 4;
        if (edge){ let k = corner ? 'calcite' : fl === 0 ? 'smooth_stone' : 'polished_diorite'; const along = ax === 24 ? lz : lx; if (!corner && fl >= 1 && fl <= 3 && ((along % 2) + 2) % 2 === 0 && y < Y + top - 1) k = fl === 3 ? 'polished_diorite' : 'glass'; if (lz === 5 && ax <= 1 && y <= Y + 3) k = 0; put(y, k); }
        else if (fl === 0) put(y, 'planks_oak'); else if (fl === 3 && lx % 4 === 0 && lz % 4 === 0) put(y, 'glowstone'); }
      put(Y + top + 1, edge ? 'polished_diorite' : 'smooth_stone');
      // the drum: a ring of columns, then the dome, a lantern and a little spire
      const dz2 = lz + 2, rr = Math.hypot(lx, dz2);
      if (rr <= 7.5){ for (let y = Y + top + 2; y <= Y + top + 4; y++) put(y, rr > 6.5 ? 'smooth_stone' : 0);
        for (let y = Y + top + 5; y <= Y + top + 10; y++){ const ring = rr > 6.5; put(y, ring ? (Math.round(Math.atan2(dz2, lx) * 4) % 2 === 0 ? 'quartz_pillar' : 'glass') : 0); }
        put(Y + top + 11, rr > 6.5 ? 'smooth_quartz' : 0);
        for (let s = 0; s <= 7; s++){ const rad = 7.2 * Math.cos(s / 8 * Math.PI / 2), y = Y + top + 12 + s; if (rr <= rad && rr > rad - 1.6) put(y, 'block_iron'); else if (rr <= rad) put(y, 0); if (s === 7 && rr <= rad) put(y, 'block_iron'); }
        if (rr <= 1.5){ for (let y = Y + top + 20; y <= Y + top + 22; y++) put(y, rr < .6 ? 0 : 'quartz_pillar'); put(Y + top + 23, 'block_iron'); if (rr < .6) for (let y = Y + top + 24; y <= Y + top + 27; y++) put(y, 'iron_bars'); } }
    });
    // Confederation Park, between City Hall and the water, with a fountain
    mark('confederation park', -R * .05, R * .36 - 8, 22, 6, (put, lx, lz, Y, dx, dz) => { if (dz > shoreZ(city, dx) - 2) return false; put(Y, Math.abs(lx) <= 1 || lz === 0 ? 'gravel' : 'grass'); put(Y - 1, 'dirt');
      const fr = Math.hypot(lx, lz); if (fr <= 2.5){ put(Y, fr > 1.5 ? 'stone_bricks' : 'water'); if (fr > 1.5) put(Y + 1, 'stone_brick_wall' in B ? 'stone_brick_wall' : 'wall_stone_bricks'); }
      if (fr < .6){ put(Y + 1, 'stone_bricks'); put(Y + 2, 'water'); }
      if (hash3(dx, 77, dz, 1) < .02 && fr > 4 && lz !== 0 && Math.abs(lx) > 1){ for (let k = 1; k <= 4; k++) put(Y + k, 'log_oak'); for (let k = 4; k <= 6; k++) put(Y + k, k === 4 ? 'log_oak' : 'leaves_oak'); } });
    // Market Square behind City Hall: open stone, with market stalls under coloured awnings
    mark('market square', -R * .05, cz - 18, 18, 7, (put, lx, lz, Y) => { put(Y, ((lx + lz) & 3) === 0 ? 'polished_andesite' : 'smooth_stone');
      const sx = ((lx + 40) % 7), sz = ((lz + 40) % 5); if (Math.abs(lz) <= 4 && Math.abs(lx) <= 16 && sx <= 2 && sz <= 2){ if ((sx === 0 || sx === 2) && (sz === 0 || sz === 2)) for (let k = 1; k <= 2; k++) put(Y + k, 'fence_spruce' in B ? 'fence_spruce' : 'fence_oak'); put(Y + 3, ['wool_red', 'wool_white', 'wool_blue', 'wool_yellow', 'wool_lime'][((lx + 40) / 7 | 0) % 5]); if (sx === 1 && sz === 1) put(Y + 1, 'barrel' in B ? 'barrel' : 'planks_spruce'); } });
    // Fort Henry on Point Henry, across the river: limestone walls on a high point, a ditch round them, the parade ground, a flag
    const fx = R * .8, fz = R * .02;
    mark('point henry', fx, fz, R * .2 - 2, R * .3, (put, lx, lz, Y, dx, dz) => {
      if (isWater(city, dx, dz)) return false;
      const hw = Math.round(R * .2 - 2), hd = Math.round(R * .3), edgeD = Math.min(hw - Math.abs(lx), hd - Math.abs(lz)), t = Math.max(0, Math.min(1, edgeD / 16)), top = Y + Math.round(10 * t * t * (3 - 2 * t));
      for (let y = Y; y <= top; y++) put(y, y === top ? 'grass' : y > top - 3 ? 'dirt' : 'stone');
      // the fort: a long limestone redoubt with pointed bastions at the corners, a dry ditch round it, casemates inside, a gate on the south side
      const W = 20, D = 13, inside = (x, z, g = 0) => { const ax = Math.abs(x), az = Math.abs(z); return (ax <= W + g && az <= D + g) || (Math.abs(ax - W) + Math.abs(az - D) <= 7 + g); };
      const F = top, inF = inside(lx, lz), ditch = !inF && inside(lx, lz, 4), gate = Math.abs(lx) <= 1 && lz > 0;
      if (ditch){ if (gate){ put(F, 'planks_spruce'); put(F + 1, Math.abs(lx) === 1 ? 'fence_spruce' : 0); for (let y = F - 3; y < F; y++) put(y, 0); put(F - 4, 'grass'); return; }
        const outerWall = !inside(lx + 1, lz, 4) || !inside(lx - 1, lz, 4) || !inside(lx, lz + 1, 4) || !inside(lx, lz - 1, 4);
        for (let y = F - 4; y <= F; y++) put(y, y === F - 4 ? 'grass' : outerWall ? 'polished_diorite' : 0); return; }
      if (!inF){ if (hash3(dx, 79, dz, 1) < .012 && edgeD > 3){ for (let k = 1; k <= 4; k++) put(F + k, 'log_oak'); put(F + 5, 'leaves_oak'); put(F + 6, 'leaves_oak'); }
        else if (hash3(dx, 80, dz, 1) < .2) put(F + 1, 'tall_grass'); return; }
      const wall = !inside(lx + 2, lz) || !inside(lx - 2, lz) || !inside(lx, lz + 2) || !inside(lx, lz - 2);
      if (wall){ for (let y = F - 3; y <= F + 7; y++) put(y, y === F + 7 ? (((lx + lz) & 1) ? 'polished_diorite' : 0) : y < F + 2 ? 'stone_bricks' : 'polished_diorite');
        if (gate && Math.abs(lx) <= 1) for (let y = F + 1; y <= F + 3; y++) put(y, 0);
        if (gate && Math.abs(lx) === 2) for (let y = F + 1; y <= F + 4; y++) put(y, 'calcite');
        return; }
      put(F, 'gravel');
      // casemates along the north side: two storeys of stone rooms with arched doors, grass on the roof
      if (lz <= -D + 8 && Math.abs(lx) <= W - 2){ const front = lz === -D + 8; for (let y = F + 1; y <= F + 6; y++){ let k = 0;
          if (front) k = (Math.abs(lx) % 4 === 0 && y <= F + 2) ? 0 : (Math.abs(lx) % 4 === 2 && (y === F + 4 || y === F + 5)) ? 'glass' : y === F + 3 && Math.abs(lx) % 4 === 0 ? 'calcite' : 'polished_diorite';
          else if (y === F + 6) k = 'polished_diorite'; else if (y === F + 3) k = 'planks_spruce'; put(y, k); }
        put(F + 7, 'grass'); return; }
      // the flag: red, white with a red maple leaf, red
      if (lx === 0 && lz === 0){ for (let y = F + 1; y <= F + 19; y++) put(y, 'iron_bars'); put(F + 20, 'block_gold'); }
      if (lz === 0 && lx >= 1 && lx <= 12){ const LEAF = ['..#...', '..##..', '.####.', '######', '#.##.#', '..##..'];
        for (let fy = 0; fy < 6; fy++){ const c = lx <= 3 || lx >= 10 ? 'wool_red' : LEAF[fy][lx - 4] === '#' ? 'wool_red' : 'wool_white'; put(F + 13 + fy, c); } }
      // a row of old cannons on the parade ground
      if (lz === 7 && Math.abs(lx) >= 4 && Math.abs(lx) <= 16 && lx % 4 === 0){ put(F + 1, 'block_coal'); }
    });
    // the LaSalle Causeway: the road over the Cataraqui River
    mark('causeway', R * .5, R * .26, 16, 3, (put, lx, lz, Y, dx, dz) => { if (riverAt(city, dx, dz) < 0) return false; const ax = Math.abs(lz); for (let y = SEA - 4; y <= SEA; y++) put(y, y < SEA - 3 ? 'gravel' : 'water'); for (let y = Y + 1; y <= Y + 3; y++) put(y, 0);
      put(Y, ax === 3 ? 'stone_bricks' : ax === 0 && Math.floor(dx / 2) % 3 === 0 ? 'concrete_yellow' : 'concrete_black'); if (ax === 3) put(Y + 1, 'iron_bars'); if (lx % 8 === 0) for (let y = SEA - 3; y < Y; y++) put(y, 'stone_bricks'); });
    // Murney Tower: a squat round limestone Martello tower on raised ground by the water, with a pointed snow roof
    const mz = shoreZ(city, -R * .62) - 9;
    mark('murney tower', -R * .62, mz, 9, 9, (put, lx, lz, Y) => { const rr = Math.hypot(lx, lz); put(Y, 'grass'); if (rr > 8.5) return; put(Y + 1, rr < 7.5 ? 'grass' : 'grass'); put(Y, 'dirt');
      if (rr <= 6){ for (let y = Y + 1; y <= Y + 9; y++) put(y, rr > 4.8 ? ((y === Y + 4 || y === Y + 7) && Math.round(Math.atan2(lz, lx) * 3) % 3 === 0 ? 'glass' : 'stone_bricks') : y === Y + 5 ? 'planks_spruce' : 0);
        for (let s = 0; s < 5; s++){ const rad = 6 - s * 1.3; if (rr <= rad) put(Y + 10 + s, s === 0 ? 'stone_bricks' : 'deepslate_tiles'); } if (rr < .7) put(Y + 15, 'iron_bars'); } });
    // Queen's University: Grant Hall and its clock tower, in limestone
    mark('grant hall', -R * .38, R * .02, 9, 13, (put, lx, lz, Y) => { const ax = Math.abs(lx); put(Y, 'smooth_stone');
      const tower = ax <= 2 && lz >= 7 && lz <= 11;
      if (tower){ const edge = ax === 2 || lz === 7 || lz === 11, f = edge && !(ax === 2 && (lz === 7 || lz === 11));
        for (let y = Y + 1; y <= Y + 24; y++){ let k = edge ? 'stone_bricks' : 0; if (f && y >= Y + 19 && y <= Y + 21){ const fp = ax === 2 ? lz - 9 : lx; if (Math.abs(fp) <= 1) k = (fp === 0 && y === Y + 20) || (fp === 0 && y === Y + 21) || (fp === 1 && y === Y + 20) ? 'concrete_black' : 'smooth_quartz'; } if (f && y >= Y + 22 && Math.abs(ax === 2 ? lz - 9 : lx) < 1) k = 'iron_bars'; if (lz === 11 && ax === 0 && y <= Y + 3) k = y <= Y + 2 ? 0 : 'stone_bricks'; put(y, k); }
        put(Y + 25, edge ? 'chiseled' : 'stone_bricks'); if (edge && (ax + lz) % 2 === 0) put(Y + 26, 'stone_bricks'); if (ax <= 1 && lz >= 8 && lz <= 10){ put(Y + 26, 'deepslate_tiles'); if (ax === 0 && lz === 9){ put(Y + 27, 'deepslate_tiles'); put(Y + 28, 'iron_bars'); } } return; }
      if (lz > 6 || lz < -13) return;
      const edge = ax === 9 || lz === 6 || lz === -13, corner = ax === 9 && (lz === 6 || lz === -13);
      for (let y = Y + 1; y <= Y + 10; y++){ let k = 0; if (edge){ k = corner ? 'chiseled' : 'stone_bricks'; const al = ax === 9 ? lz : lx; if (!corner && y >= Y + 2 && y <= Y + 8 && ((al % 3) + 3) % 3 === 0) k = 'glass'; } else if (y === Y + 5) k = 'planks_oak'; put(y, k); }
      for (let s = 0; s < 4; s++){ if (ax <= 9 - s * 2.4) put(Y + 11 + s, ax > 9 - s * 2.4 - 2.4 || s === 3 ? 'deepslate_tiles' : 0); } });
  }
  return L;
}

/* ---- buildings ---- */
const BLOCK = 26, ROAD = 3, WALK = 2;
const PALS = {
  modern:[{wall:'glass_light_blue', frame:'block_iron', floor:'smooth_stone', roof:'smooth_stone', base:'polished_andesite'}, {wall:'glass_cyan', frame:'smooth_quartz', floor:'smooth_stone', roof:'smooth_quartz', base:'smooth_quartz'},
    {wall:'glass_black', frame:'concrete_black', floor:'smooth_stone', roof:'concrete_grey', base:'polished_blackstone'}, {wall:'glass_light_grey', frame:'concrete_white', floor:'smooth_stone', roof:'concrete_light_grey', base:'concrete_white'},
    {wall:'glass_blue', frame:'polished_deepslate', floor:'smooth_stone', roof:'polished_deepslate', base:'polished_deepslate'}, {wall:'glass_brown', frame:'terracotta_brown', floor:'smooth_stone', roof:'terracotta_brown', base:'terracotta_white'},
    {frame:'bricks', floor:'planks_spruce', roof:'bricks', base:'stone_bricks', brick:true}, {frame:'red_nether_bricks', floor:'planks_dark', roof:'nether_bricks', base:'polished_granite', brick:true}],
  brick:[{frame:'bricks', floor:'planks_spruce', roof:'bricks', base:'smooth_stone', brick:true, shop:true}, {frame:'terracotta_red', floor:'planks_oak', roof:'bricks', base:'smooth_stone', brick:true, shop:true},
    {frame:'terracotta_brown', floor:'planks_dark', roof:'terracotta_brown', base:'smooth_stone', brick:true, shop:true}, {frame:'terracotta_yellow', floor:'planks_oak', roof:'bricks', base:'smooth_stone', brick:true, shop:true},
    {frame:'stone_bricks', floor:'planks_oak', roof:'smooth_stone', base:'smooth_stone', brick:true, shop:true}, {wall:'glass_light_grey', frame:'concrete_white', floor:'smooth_stone', roof:'concrete_light_grey', base:'concrete_white'}],
  limestone:[{frame:'stone_bricks', floor:'planks_oak', roof:'smooth_stone', base:'smooth_stone', brick:true, shop:true}, {frame:'polished_andesite', floor:'planks_spruce', roof:'stone_bricks', base:'smooth_stone', brick:true, shop:true},
    {frame:'cobble', floor:'planks_oak', roof:'stone_bricks', base:'smooth_stone', brick:true}, {frame:'smooth_stone', floor:'planks_oak', roof:'polished_andesite', base:'smooth_stone', brick:true, shop:true},
    {frame:'bricks', floor:'planks_spruce', roof:'bricks', base:'smooth_stone', brick:true, shop:true}, {wall:'glass_light_blue', frame:'block_iron', floor:'smooth_stone', roof:'smooth_stone', base:'polished_andesite'}],
  town:[{frame:'planks_oak', floor:'planks_spruce', roof:'planks_spruce', base:'grass', brick:true, house:true}, {frame:'planks_birch', floor:'planks_oak', roof:'bricks', base:'grass', brick:true, house:true},
    {frame:'bricks', floor:'planks_oak', roof:'deepslate_tiles', base:'grass', brick:true, house:true}, {frame:'concrete_white', floor:'planks_oak', roof:'planks_dark', base:'grass', brick:true, house:true},
    {frame:'stone_bricks', floor:'planks_oak', roof:'smooth_stone', base:'smooth_stone', brick:true, shop:true}, {frame:'terracotta_white', floor:'planks_oak', roof:'bricks', base:'grass', brick:true, house:true}],
  desert:[{frame:'sandstone', floor:'smooth_sandstone', roof:'cut_sandstone', base:'cut_sandstone', brick:true}, {frame:'terracotta_white', floor:'smooth_sandstone', roof:'terracotta_orange', base:'cut_sandstone', brick:true},
    {wall:'glass_brown', frame:'smooth_sandstone', floor:'smooth_stone', roof:'cut_sandstone', base:'smooth_sandstone'}],
};
/* where to put someone who teleports to a city: a street corner near the middle that is not under water or a landmark */
export function cityLanding(city){
  const x0 = city.x - city.r, z0 = city.z - city.r, gx = Math.round((city.x - x0) / BLOCK), gz = Math.round((city.z - z0) / BLOCK);
  for (let ring = 0; ring < 6; ring++) for (let a = -ring; a <= ring; a++) for (const [i, j] of [[gx + a, gz - ring], [gx + a, gz + ring], [gx - ring, gz + a], [gx + ring, gz + a]]){
    const x = x0 + i * BLOCK + 1, z = z0 + j * BLOCK + 1;
    if (Math.max(Math.abs(x - city.x), Math.abs(z - city.z)) < city.r - 4 && !isWater(city, x - city.x, z - city.z) && !markAt(city, x, z)) return {x:x + .5, y:city.y + 1, z:z + .5};
  }
  return {x:city.x + .5, y:city.y + 40, z:city.z + .5};
}
function lotOf(city, wx, wz){ const lx = wx - (city.x - city.r), lz = wz - (city.z - city.r), bx = Math.floor(lx / BLOCK), bz = Math.floor(lz / BLOCK); return {bx, bz, ix:lx - bx * BLOCK, iz:lz - bz * BLOCK}; }
const markAt = (city, wx, wz) => city.marks.find(m => wx >= m.x0 && wx <= m.x1 && wz >= m.z0 && wz <= m.z1);
function building(city, bx, bz, seed){
  const h = (a) => hash3(city.x + bx * 7, a, city.z + bz * 13, seed), cx = city.x - city.r + bx * BLOCK + BLOCK / 2, cz = city.z - city.r + bz * BLOCK + BLOCK / 2;
  const far = Math.hypot(cx - city.x, cz - city.z) / city.r, room = 126 - city.y - 10;
  let tall, size;
  if (city.size === 'town'){ tall = 4 + h(2) * (far < .4 ? 8 : 5); size = 3 + Math.floor(h(3) * 2); }
  else if (city.size === 'mega'){ tall = far < .3 ? room * (.55 + h(2) * .45) : far < .6 ? 24 + h(2) * 24 : far < .85 ? 10 + h(2) * 16 : 6 + h(2) * 8; size = far < .3 ? 8 + Math.floor(h(3) * 2) : 6 + Math.floor(h(3) * 4); }
  else if (city.special){ tall = far < .3 ? 10 + h(2) * (h(6) < .3 ? 30 : 10) : 6 + h(2) * 10; size = 5 + Math.floor(h(3) * 4); }
  else { tall = far < .35 ? 26 + h(2) * Math.max(10, room - 26) : far < .7 ? 12 + h(2) * 22 : 6 + h(2) * 10; size = far < .35 ? 7 + Math.floor(h(3) * 3) : 5 + Math.floor(h(3) * 4); }
  const pals = PALS[city.style] || PALS.modern, pal = pals[Math.floor(h(4) * pals.length)];
  const b = {park:false, h:Math.min(room, Math.max(4, Math.floor(tall / 4) * 4 + (city.size === 'town' ? 0 : 4))), half:size, pal, antenna:city.size !== 'town' && !city.special && far < .3 && h(5) < .6, cx, cz};
  // no building on the water or under a landmark: a little park there instead
  for (const [ox, oz] of [[0, 0], [-size, -size], [size, -size], [-size, size], [size, size]]) if (isWater(city, cx + ox - city.x, cz + oz - city.z) || markAt(city, cx + ox, cz + oz)) return {park:true, plain:true};
  if (h(1) < (city.size === 'town' ? .08 : .1 + far * .15)) return {park:true};
  return b;
}
const CAR = ['concrete_red', 'concrete_blue', 'concrete_white', 'concrete_black', 'concrete_yellow', 'concrete_lime', 'concrete_light_grey'];
function cityColumn(v, x, z, wx, wz, city, seed){
  const Y = city.y, put = (y, k) => { if (y > 0 && y < H) v[idx(x, y, z)] = typeof k === 'number' ? k : B[k]; };
  for (let y = Y + 1; y < H; y++) v[idx(x, y, z)] = 0;
  for (let y = Math.max(1, Y - 8); y <= Y; y++) if (!v[idx(x, y, z)] || v[idx(x, y, z)] === B.water || y > Y - 3) put(y, y === Y ? 'dirt' : 'stone');
  const dx = wx - city.x, dz = wz - city.z;
  // landmarks first (a landmark may say the column is not its own after all)
  const m = city.marks.length ? markAt(city, wx, wz) : null;
  if (m && m.col(put, wx - m.cx, wz - m.cz, Y, dx, dz) !== false) return;
  const {bx, bz, ix, iz} = lotOf(city, wx, wz), edgeR = ix < ROAD || iz < ROAD, walk = !edgeR && (ix < ROAD + WALK || iz < ROAD + WALK || ix >= BLOCK - WALK || iz >= BLOCK - WALK);
  // the bay or lake, with a stone sea wall and a boardwalk along the shore
  if (city.special){
    const sz = shoreZ(city, dx);
    if (dz > sz){ const deep = Math.min(9, 3 + Math.floor((dz - sz) / 4)); for (let y = Y; y > SEA - deep - 1 && y > 0; y--) put(y, y > SEA ? 0 : y > SEA - deep ? 'water' : (hash3(wx, 5, wz, seed) < .3 ? 'gravel' : 'sand')); return; }
    if (dz > sz - 1.5){ for (let y = SEA - 3; y <= Y; y++) put(y, 'stone_bricks'); if (hash3(wx, 6, wz, seed) < .5 || (wx & 1)) put(Y + 1, 'iron_bars'); return; }
    if (dz > sz - 5){ put(Y, 'planks_spruce'); if ((wx % 11) === 0){ for (let k = 1; k <= 3; k++) put(Y + k, 'fence_oak'); put(Y + 4, 'lantern'); } return; }
    const rv = riverAt(city, dx, dz);
    if (rv >= 0){
      const bank = rv > (city.special === 'kingston' ? 12 : 3);
      for (let y = SEA - 3; y <= Y; y++) put(y, bank ? 'stone_bricks' : y <= SEA - 3 ? 'gravel' : y <= SEA ? 'water' : 0);
      if (!bank && edgeR && city.special === 'belleville'){ put(Y, ix === 1 || iz === 1 ? 'concrete_yellow' : 'concrete_black'); }                // a bridge where a street crosses
      else if (!bank && walk && city.special === 'belleville' && (ix < ROAD + WALK || iz < ROAD + WALK)){ put(Y, 'smooth_stone'); put(Y + 1, 'iron_bars'); }
      if (bank) put(Y + 1, 'iron_bars');
      return;
    }
  }
  if (edgeR){
    put(Y, 'concrete_black'); put(Y - 1, 'stone');
    const along = ix < ROAD && iz >= ROAD ? 'z' : iz < ROAD && ix >= ROAD ? 'x' : 'both';
    if (along === 'z' && ix === 1 && (wz >> 1) % 3 === 0) put(Y, 'concrete_yellow');
    if (along === 'x' && iz === 1 && (wx >> 1) % 3 === 0) put(Y, 'concrete_yellow');
    if (along === 'z' && iz >= ROAD && iz < ROAD + 3 && wx % 2 === 0) put(Y, 'concrete_white');
    if (along === 'x' && ix >= ROAD && ix < ROAD + 3 && wz % 2 === 0) put(Y, 'concrete_white');
    const ch = hash3(bx * 31 + (along === 'x' ? 1 : 0), 401, bz * 17, seed);
    if (along !== 'both' && ch < (city.size === 'town' ? .25 : .45)){ const pos = along === 'x' ? ix : iz, lane = along === 'x' ? iz : ix, start = 8 + Math.floor(ch * 20) % 10;
      if (lane === 2 && pos >= start && pos < start + 4){ const c = CAR[Math.floor(ch * 97) % CAR.length], end = pos === start || pos === start + 3; put(Y + 1, end ? 'wool_black' : c); put(Y + 2, end ? c : 'glass_light_grey'); if (!end) put(Y + 3, c); } }
    return;
  }
  if (walk){
    put(Y, city.size === 'town' ? 'gravel' : 'smooth_stone');
    if ((ix === ROAD || iz === ROAD) && (wx + wz) % 9 === 0){ for (let k = 1; k <= 3; k++) put(Y + k, 'fence_oak'); put(Y + 4, 'lantern'); }
    return;
  }
  const b = building(city, bx, bz, seed);
  if (b.park){
    put(Y, 'grass'); put(Y - 1, 'dirt');
    const r = hash3(wx, 403, wz, seed), mid = Math.abs(ix - BLOCK / 2) < 3 && Math.abs(iz - BLOCK / 2) < 3;
    if (mid && !b.plain && hash3(bx, 404, bz, seed) < .5){ put(Y, 'water'); return; }
    if (ix === Math.floor(BLOCK / 2) || iz === Math.floor(BLOCK / 2)){ put(Y, 'gravel'); return; }
    const trunk = (X, Z) => { const jx = ix + X - wx, jz = iz + Z - wz; return hash3(X, 403, Z, seed) < .025 && jx >= ROAD + WALK && jz >= ROAD + WALK && jx < BLOCK - WALK && jz < BLOCK - WALK && Math.abs(jx - BLOCK / 2) > 3 && Math.abs(jz - BLOCK / 2) > 3 && !isWater(city, X - city.x, Z - city.z) && !markAt(city, X, Z); };
    if (trunk(wx, wz)){ for (let k = 1; k < 6; k++) put(Y + k, 'log_oak'); }
    else if (r < .2) put(Y + 1, 'tall_grass'); else if (r < .3) put(Y + 1, ['flower_red', 'flower_yellow', 'tulip_pink', 'cornflower'][Math.floor(r * 100) % 4]);
    // leaves round the trunks (a column near a trunk gets part of its crown)
    for (let ez = -2; ez <= 2; ez++) for (let ex = -2; ex <= 2; ex++){ if (!trunk(wx + ex, wz + ez)) continue; const far2 = Math.max(Math.abs(ex), Math.abs(ez)), cor = Math.abs(ex) === 2 && Math.abs(ez) === 2;
      for (let k = 4; k <= 7; k++){ if (far2 === 0 && k < 6) continue; const rad = k <= 5 ? 2 : k === 6 ? 1 : 0; if (far2 > rad || (cor && hash3(wx, k, wz, seed) < .6) || (k === 7 && far2 === 1 && Math.abs(ex) + Math.abs(ez) === 2)) continue; put(Y + k, 'leaves_oak'); } }
    return;
  }
  // a building: walls with windows floor by floor (shops have glass fronts at street level), floors and lights inside, a door, a roof with a ledge
  put(Y, b.pal.base);
  const lx = wx - b.cx, lz = wz - b.cz, ax = Math.abs(lx + .5), az = Math.abs(lz + .5), in_ = ax <= b.half && az <= b.half;
  if (!in_){ if (b.pal.house && hash3(wx, 405, wz, seed) < .08) put(Y + 1, ['flower_red', 'flower_yellow', 'tall_grass'][Math.floor(hash3(wx, 406, wz, seed) * 3)]); return; }
  const edge = Math.abs(ax - b.half) < .6 || Math.abs(az - b.half) < .6, corner = Math.abs(ax - b.half) < .6 && Math.abs(az - b.half) < .6;
  const door = edge && !corner && ((Math.abs(lz + .5) < 1 && Math.abs(ax - b.half) < .6) || (Math.abs(lx + .5) < 1 && Math.abs(az - b.half) < .6));
  for (let y = Y + 1; y <= Y + b.h; y++){
    const fl = (y - Y) % 4;
    if (edge){
      if (door && y <= Y + 2) continue;
      let k = b.pal.frame;
      if (!corner && fl !== 0 && !(!b.pal.brick && (lx + lz) % 3 === 0)){
        if (b.pal.brick){ k = (b.pal.shop && y - Y <= 3 && fl !== 0) ? (fl === 3 ? 'wool_' + ['red', 'green', 'blue', 'white'][Math.floor(hash3(bx, 407, bz, seed) * 4)] : 'glass') : (lx + lz) % 3 !== 0 && fl !== 3 ? 'glass' : b.pal.frame; }
        else k = b.pal.wall;
      }
      put(y, k);
    } else if (fl === 0) put(y, b.pal.floor);
    else if (fl === 3 && (lx % 5 === 0) && (lz % 5 === 0)) put(y, 'glowstone');
  }
  const top = Y + b.h + 1;
  if (b.pal.house){
    // a pitched roof on houses
    const d = Math.floor(b.half - Math.max(ax, az) + .5);                 // a hipped roof: one step up for each block in from the walls
    put(top, d === 0 ? b.pal.roof : b.pal.floor); if (d > 0) put(top + d, b.pal.roof);
    return;
  }
  put(top, edge ? b.pal.frame : b.pal.roof); if (edge) put(top + 1, b.pal.frame);
  if (!edge && Math.abs(lx) === 2 && Math.abs(lz) === 1 && b.h > 10){ put(top + 1, 'block_iron'); put(top + 2, 'smooth_stone'); }
  if (b.antenna && lx === 0 && lz === 0){ for (let k = 1; k < 9 && top + k < H - 1; k++) put(top + k, 'iron_bars'); put(Math.min(H - 1, top + 9), 'glowstone'); }
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
  { const c = cityIn(seed, Math.floor(x / CREG), Math.floor(z / CREG)); if (c && Math.max(Math.abs(x - c.x), Math.abs(z - c.z)) < c.r + c.blend + 40) return null; }
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
    if (biome === 'city'){ for (let y = 0; y <= h; y++) v[idx(x, y, z)] = y === 0 ? B.bedrock : B.stone; cityColumn(v, x, z, wx, wz, C(x, z).city, seed); continue; }
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
  if (col.biome === 'city' || column(seed, wx + 20, wz).biome === 'city' || column(seed, wx - 20, wz).biome === 'city') return;
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
