/* BDB Craft: water and lava that move, and blocks that fall. Water spreads up to 7 blocks out from a source and pours straight down anything open
   (that is a waterfall); lava creeps 3 out and slowly. Two water sources side by side over something solid make a new source. Water running into
   lava makes obsidian (lava source) or cobblestone (flowing lava); lava running onto water makes stone. Sand, red sand, gravel and concrete powder
   fall when nothing holds them up, and concrete powder touching water sets into concrete.
   Levels: 0 a source, 1 to 7 flowing (higher is weaker), 8 falling. Only the host (or a player on their own) runs this; friends get the block changes. */
import { B, BLOCKS, LIQUID, LEVEL, SOLID, OPAQUE, PLANT, SHAPE, WET, COLOURS } from './blocks.js?v=c21';

const H4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const k3 = (x, y, z) => x + ',' + y + ',' + z;
export function createLiquids(world, edit, fall){
  const due = [new Map(), new Map()];       // water, lava: spots to look at on their next tick
  let tw = 0, tl = 0;
  const WATER = [B.water, ...Array.from({length:8}, (_, i) => B.water_flow + i)], LAVA = [B.lava, ...Array.from({length:8}, (_, i) => B.lava_flow + i)];
  const id = (x, y, z) => world.get(x, y, z);
  const kind = b => b > 0 ? (LIQUID[b] || (WET[b] ? 1 : 0)) : 0;
  const level = b => WET[b] ? 0 : LEVEL[b];
  const open = b => b === 0 || (b > 0 && PLANT[b]) || (b > 0 && !SOLID[b] && !SHAPE[b] && !LIQUID[b] && !WET[b]);         // water can wash into it
  const POWDER = new Map(COLOURS.map(([c]) => [B['powder_' + c.replace(' ', '_')], B['concrete_' + c.replace(' ', '_')]]));
  const FALLS = new Set([B.sand, B.red_sand, B.gravel, ...POWDER.keys()]);
  function mark(x, y, z){
    for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]){
      const X = x + dx, Y = y + dy, Z = z + dz, b = id(X, Y, Z); if (Y < 1 || Y > 127) continue;
      const kd = kind(b); if (kd) due[kd - 1].set(k3(X, Y, Z), [X, Y, Z]);
      else if (FALLS.has(b) || POWDER.has(b)) due[0].set(k3(X, Y, Z), [X, Y, Z]);
    }
  }
  const set = (x, y, z, b) => { edit(x, y, z, b); mark(x, y, z); };
  function settle(x, y, z){
    const b = id(x, y, z); if (!(b > 0)) return;
    // concrete powder by water sets; falling blocks fall
    if (POWDER.has(b) && H4.concat([[0, 0]]).some(([dx, dz]) => kind(id(x + dx, y, z + dz)) === 1 || kind(id(x, y + 1, z)) === 1)){ set(x, y, z, POWDER.get(b)); return; }
    if (FALLS.has(b)){ const under = id(x, y - 1, z); if (under === 0 || (under > 0 && (LIQUID[under] || PLANT[under]))){ let yy = y - 1; while (yy > 1){ const n = id(x, yy - 1, z); if (!(n === 0 || (n > 0 && (LIQUID[n] || PLANT[n])))) break; yy--; } set(x, y, z, 0); if (fall) fall(x, y, z, yy, b); else set(x, yy, z, b); } return; }
    const kd = kind(b); if (!kd) return;
    const SRC = kd === 1 ? WATER : LAVA, step = kd === 1 ? 1 : 2, L = level(b);
    // flowing liquid: does something still feed it? (more of it above, or a stronger neighbour)
    if (L > 0){
      const up = id(x, y + 1, z); let want;
      if (kind(up) === kd) want = 8;
      else { let best = 99, srcN = 0; for (const [dx, dz] of H4){ const n = id(x + dx, y, z + dz); if (kind(n) !== kd) continue; const nl = level(n); if (nl === 0) srcN++; const eff = nl === 8 ? 0 : nl; best = Math.min(best, eff + step); }
        const below = id(x, y - 1, z); if (kd === 1 && srcN >= 2 && (SOLID[below] || level(below) === 0 && kind(below) === 1)) want = 0; else want = best <= 7 ? best : -1; }
      if (want === -1){ set(x, y, z, 0); return; }
      if (want !== L){ set(x, y, z, want === 0 ? SRC[0] : SRC[want]); return; }
    }
    if (WET[b]) return;                          // water inside a stair or fence stays put
    // pour down if it can, otherwise spread out
    const below = id(x, y - 1, z);
    if (y > 1 && open(below)){ set(x, y - 1, z, SRC[8]); return; }
    if (y > 1 && kind(below) && kind(below) !== kd){ meet(x, y - 1, z, kd, below, true); return; }
    if (y > 1 && kind(below) === kd && level(below) !== 0 && level(below) !== 8){ set(x, y - 1, z, SRC[8]); return; }
    const out = (L === 8 ? 0 : L) + step; if (out > 7 || (kind(below) === kd && L !== 8 && L !== 0 && level(below) === 8)) return;
    for (const [dx, dz] of H4){
      const X = x + dx, Z = z + dz, n = id(X, y, Z);
      if (open(n)) set(X, y, Z, SRC[out]);
      else if (kind(n) === kd && level(n) > out && level(n) !== 8) set(X, y, Z, SRC[out]);
      else if (kind(n) && kind(n) !== kd) meet(X, y, Z, kd, n, false);
    }
  }
  /* water and lava touching */
  function meet(x, y, z, comer, there, down){
    if (comer === 1){ set(x, y, z, level(there) === 0 ? B.obsidian : B.cobble); }
    else { set(x, y, z, down ? B.stone : (level(there) === 0 ? B.stone : B.cobble)); }
  }
  function run(map, max){
    if (!map.size) return; const spots = [...map.values()].slice(0, max); for (const s of spots) map.delete(k3(...s));
    for (const [x, y, z] of spots) settle(x, y, z);
  }
  return {
    mark,
    update(dt){ tw += dt; tl += dt; if (tw >= .25){ tw = 0; run(due[0], 400); } if (tl >= 1.5){ tl = 0; run(due[1], 200); } },
    /* a freshly loaded chunk: wake any water or lava that has open air beside it (springs in cliffs, so waterfalls start) */
    wake(cx, cz, v){
      for (let i = 0; i < v.length; i++){ const b = v[i]; if (!b || !LIQUID[b]) continue; const x = i & 15, z = (i >> 4) & 15, y = i >> 8, X = cx * 16 + x, Z = cz * 16 + z;
        if (H4.some(([dx, dz]) => id(X + dx, y, Z + dz) === 0) || id(X, y - 1, Z) === 0) due[LIQUID[b] - 1].set(k3(X, y, Z), [X, y, Z]); }
    },
    get busy(){ return due[0].size + due[1].size; }
  };
}
