/* BDB Craft: the shapes of blocks that are not plain cubes. Every shape is a few boxes inside the 1 x 1 x 1 cell (x0, y0, z0, x1, y1, z1, then how far
   the picture is slid up, so a wall torch still shows the torch). Fences, walls and panes join up with what is next to them, so they need to see their
   neighbours: nb(dx, dy, dz) gives the block there. Facing: 0 north (-z), 1 east (+x), 2 south (+z), 3 west (-x); the way you look when you place it.
   Shared by the mesher (in the workers), collision and picking (on the page). */
import { SH, SHAPE, STATE, OPAQUE, FIRST, B } from './blocks.js?v=c22';

/* turn a box a quarter clockwise (seen from above) f times about the middle of the cell */
export function turn(b, f){
  let [x0, y0, z0, x1, y1, z1] = b;
  for (let i = 0; i < (f & 3); i++){ const nx0 = 1 - z1, nx1 = 1 - z0, nz0 = x0, nz1 = x1; x0 = nx0; x1 = nx1; z0 = nz0; z1 = nz1; }
  return [x0, y0, z0, x1, y1, z1, b[6] || 0];
}
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const joinsFence = n => n > 0 && (SHAPE[n] === SH.fence || SHAPE[n] === SH.gate || OPAQUE[n] === 1);
const joinsWall = n => n > 0 && (SHAPE[n] === SH.wall || SHAPE[n] === SH.pane || SHAPE[n] === SH.gate || OPAQUE[n] === 1);
/* which ways redstone dust runs: [dx, dz, level] for each side it joins (level 1: up onto the block beside, -1: down off it) */
export function dustLinks(nb){
  const out = [], up = nb(0, 1, 0);
  DIRS.forEach(([dx, dz], f) => {
    const n = nb(dx, 0, dz), hi = nb(dx, 1, dz), lo = nb(dx, -1, dz);
    if (redstoneish(n, f)) out.push([dx, dz, 0]);
    else if (SHAPE[hi] === SH.dust && !OPAQUE[up] && OPAQUE[n]) out.push([dx, dz, 1]);
    else if (SHAPE[lo] === SH.dust && !OPAQUE[n]) out.push([dx, dz, -1]);
  });
  return out;
}
const redstoneish = (n, f) => n > 0 && (SHAPE[n] === SH.dust || SHAPE[n] === SH.lever || SHAPE[n] === SH.button || SHAPE[n] === SH.plate || (SHAPE[n] === SH.repeater && ((STATE[n] & 3) % 2 === f % 2)) || n === B.block_redstone || n === B.redstone_lamp_off || n === B.redstone_lamp_lit || FIRST[n] === B.redstone_torch || FIRST[n] === B.redstone_torch_off);
const joinsPane = n => n > 0 && (SHAPE[n] === SH.pane || SHAPE[n] === SH.wall || OPAQUE[n] === 1);

/* the boxes to draw */
export function boxes(id, nb){
  const sh = SHAPE[id], s = STATE[id];
  switch (sh){
    case SH.slab: return [s ? [0, .5, 0, 1, 1, 1] : [0, 0, 0, 1, .5, 1]];
    case SH.stairs: { const up = s >> 2, f = s & 3; return [up ? [0, .5, 0, 1, 1, 1] : [0, 0, 0, 1, .5, 1], turn(up ? [0, 0, 0, 1, .5, .5] : [0, .5, 0, 1, 1, .5], f)]; }
    case SH.fence: { const out = [[.375, 0, .375, .625, 1, .625]];
      DIRS.forEach(([dx, dz], f) => { if (joinsFence(nb(dx, 0, dz))){ out.push(turn([.4375, .375, 0, .5625, .5625, .375], f), turn([.4375, .75, 0, .5625, .9375, .375], f)); } }); return out; }
    case SH.gate: { const f = s & 3, open = s >> 2;
      const posts = [turn([0, .3125, .4375, .125, 1, .5625], f), turn([.875, .3125, .4375, 1, 1, .5625], f)];
      if (!open) return [...posts, turn([.125, .375, .4375, .875, .5625, .5625], f), turn([.125, .75, .4375, .875, .9375, .5625], f), turn([.4375, .5625, .4375, .5625, .75, .5625], f)];
      return [...posts, turn([0, .375, .5625, .125, .9375, .9375], f), turn([.875, .375, .5625, 1, .9375, .9375], f)]; }
    case SH.wall: { const j = DIRS.map(([dx, dz]) => joinsWall(nb(dx, 0, dz))), up = nb(0, 1, 0);
      const straight = (j[0] && j[2] && !j[1] && !j[3]) || (j[1] && j[3] && !j[0] && !j[2]);
      if (straight && !(up > 0 && SHAPE[up] === SH.wall)) return [j[0] ? [.3125, 0, 0, .6875, .875, 1] : [0, 0, .3125, 1, .875, .6875]];
      const out = [[.25, 0, .25, .75, 1, .75]]; j.forEach((on, f) => { if (on) out.push(turn([.3125, 0, 0, .6875, .875, .25], f)); }); return out; }
    case SH.pane: { const j = DIRS.map(([dx, dz]) => joinsPane(nb(dx, 0, dz))), out = [[.4375, 0, .4375, .5625, 1, .5625]];
      j.forEach((on, f) => { if (on) out.push(turn([.4375, 0, 0, .5625, 1, .4375], f)); }); return out; }
    case SH.door: { const f = s & 3, open = (s >> 2) & 1; return [turn([0, 0, 0, 1, 1, .1875], open ? (f + 3) & 3 : f)]; }
    case SH.trapdoor: { const f = s & 3, top = (s >> 2) & 1, open = s >> 3; return [open ? turn([0, 0, .8125, 1, 1, 1], f) : top ? [0, .8125, 0, 1, 1, 1] : [0, 0, 0, 1, .1875, 1]]; }
    case SH.carpet: return [[0, 0, 0, 1, .0625, 1]];
    case SH.torch: return s ? [turn([.4375, .2, 0, .5625, .825, .125, .2], s - 1)] : [[.4375, 0, .4375, .5625, .625, .5625]];
    case SH.lantern: return s ? [[.3125, .0625, .3125, .6875, .5, .6875, .0625], [.375, .5, .375, .625, .625, .625, .0625], [.4375, .625, .4375, .5625, 1, .5625]] : [[.3125, 0, .3125, .6875, .4375, .6875], [.375, .4375, .375, .625, .5625, .625]];
    case SH.ladder: return [turn([0, 0, 0, 1, 1, .125], s)];
    case SH.chain: return [[.4375, 0, .4375, .5625, 1, .5625]];
    case SH.lever: { const a = s % 6, on = s >= 6;
      if (a >= 4){ const fl = b => a === 5 ? [b[0], 1 - b[4], b[2], b[3], 1 - b[1], b[5], 0, b[7]] : b; return [fl([.3125, 0, .25, .6875, .1875, .75, 0, 2]), fl(on ? [.4375, .1875, .5, .5625, .625, .625, 0, 1] : [.4375, .1875, .375, .5625, .625, .5, 0, 1])]; }
      return [[...turn([.3125, .25, 0, .6875, .75, .1875], a), 2], [...turn(on ? [.4375, .3125, .1875, .5625, .4375, .625] : [.4375, .5625, .1875, .5625, .6875, .625], a), 1]]; }
    case SH.button: { const a = s % 6, h = s >= 6 ? .0625 : .125;
      if (a === 4) return [[.3125, 0, .375, .6875, h, .625]]; if (a === 5) return [[.3125, 1 - h, .375, .6875, 1, .625]];
      return [turn([.3125, .375, 0, .6875, .625, h], a)]; }
    case SH.plate: return [[.0625, 0, .0625, .9375, s ? .03125 : .0625, .9375]];
    case SH.repeater: { const f = s & 3; return [[0, 0, 0, 1, .125, 1], [...turn([.4375, .125, .6875, .5625, .4375, .8125, -.1875], f), 3], [...turn([.4375, .125, .25, .5625, .4375, .375, -.1875], f), 3]]; }
    case SH.dust: return [[0, 0, 0, 1, .0625, 1]];       // drawn flat by the mesher; this box is for picking
    case SH.rail: return [[0, 0, 0, 1, .125, 1]];
  }
  return [[0, 0, 0, 1, 1, 1]];
}
/* the boxes you bump into (fences and walls are 1.5 high so nothing jumps them; torches, open gates and ladders you walk through) */
export function solidBoxes(id, nb){
  const sh = SHAPE[id], s = STATE[id];
  if (sh === SH.torch || sh === SH.ladder || sh === SH.lever || sh === SH.button || sh === SH.dust || sh === SH.rail) return [];
  if (sh === SH.gate) return s >> 2 ? [] : [turn([0, 0, .375, 1, 1.5, .625], s & 3)];
  if (sh === SH.fence || sh === SH.wall){ const join = sh === SH.fence ? joinsFence : joinsWall, w = sh === SH.fence ? [.375, .625] : [.25, .75], out = [[w[0], 0, w[0], w[1], 1.5, w[1]]];
    DIRS.forEach(([dx, dz], f) => { if (join(nb(dx, 0, dz))) out.push(turn([w[0], 0, 0, w[1], 1.5, w[0]], f)); }); return out; }
  return boxes(id, nb);
}
export const CLIMB = id => SHAPE[id] === SH.ladder;
