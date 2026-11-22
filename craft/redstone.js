/* BDB Craft: redstone. Levers, buttons, pressure plates, redstone torches and blocks of redstone make power; dust carries it (15 at the source, one less
   every block); repeaters carry it on in one direction a moment later; lamps light, doors, trapdoors and gates open, TNT is lit and powered rails push.
   Only the host (or a player on their own) runs it, ten ticks a second, near whatever changed; the results are ordinary block changes, so friends see
   them like any other edit. It is a simpler version of the real thing: no quasi-connectivity, no comparators yet, torches burn out never. */
import { B, BLOCKS, SHAPE, STATE, FIRST, WET, OPAQUE, SH } from './blocks.js?v=c15';

const DIR6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const DIR4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];            // facing 0 north, 1 east, 2 south, 3 west
const k3 = (x, y, z) => x + ',' + y + ',' + z;

export function createRedstone(world, edit, opts = {}){
  const dirty = new Map();       // spots to look round on the next tick
  const timers = [];             // buttons letting go, TNT going off: [time, fn]
  let tickT = 0, now = 0;
  const id = (x, y, z) => world.get(x, y, z);
  const first = b => b > 0 ? FIRST[b] || b : 0;
  const isDust = b => b > 0 && SHAPE[b] === SH.dust;
  const isLever = b => b > 0 && SHAPE[b] === SH.lever, isButton = b => b > 0 && SHAPE[b] === SH.button, isPlate = b => b > 0 && SHAPE[b] === SH.plate;
  const isRTorch = b => b > 0 && (first(b) === B.redstone_torch || first(b) === B.redstone_torch_off), torchOn = b => first(b) === B.redstone_torch;
  const isRep = b => b > 0 && SHAPE[b] === SH.repeater;
  const on = b => isLever(b) || isButton(b) ? STATE[b] >= 6 : isPlate(b) ? STATE[b] === 1 : isRep(b) ? STATE[b] >= 4 : false;
  const attachDir = b => { const s = STATE[b] % 6; return s < 4 ? [-DIR4[s][0], 0, -DIR4[s][1]].map(v => -v) : s === 4 ? [0, -1, 0] : [0, 1, 0]; };     // where a lever or button is stuck on
  function torchAttach(b){ const s = STATE[b] % 5; return s === 0 ? [0, -1, 0] : [DIR4[s - 1][0], 0, DIR4[s - 1][1]]; }
  /* power straight from a source sitting at (x, y, z), into the spot next to it */
  function sourceAt(x, y, z){
    const b = id(x, y, z); if (!(b > 0)) return false;
    if (b === B.block_redstone) return true;
    if (isLever(b) || isButton(b) || isPlate(b)) return on(b);
    if (isRTorch(b)) return torchOn(b);
    return false;
  }
  /* is a solid block "powered": something switched on is stuck to it, a torch is under it, powered dust is on it or points into it, a repeater points into it */
  function blockPowered(x, y, z, dust){
    const b = id(x, y, z); if (!(b > 0) || !OPAQUE[b]) return false;
    for (const [dx, dy, dz] of DIR6){
      const n = id(x + dx, y + dy, z + dz); if (!(n > 0)) continue;
      if ((isLever(n) || isButton(n)) && on(n)){ const a = attachDir(n); if (a[0] === -dx && a[1] === -dy && a[2] === -dz) return true; }
      if (isPlate(n) && on(n) && dy === 1) return true;
      if (isRTorch(n) && torchOn(n) && dy === -1) return true;
      if (isRep(n) && on(n)){ const f = STATE[n] & 3; if (DIR4[f][0] === -dx && DIR4[f][1] === -dz && dy === 0) return true; }
      if (dust && isDust(n) && (dust.get(k3(x + dx, y + dy, z + dz)) | 0) > 0 && dy === 1) return true;
    }
    return false;
  }
  /* work out the dust round a spot: 15 next to a source or a powered block, one less each step along the line */
  function solveDust(cx, cy, cz, R = 18){
    const dust = new Map(), q = [];
    for (let y = cy - 6; y <= cy + 6; y++) for (let z = cz - R; z <= cz + R; z++) for (let x = cx - R; x <= cx + R; x++){
      if (!isDust(id(x, y, z))) continue;
      let p = 0;
      for (const [dx, dy, dz] of DIR6){ if (sourceAt(x + dx, y + dy, z + dz)) p = 15; else if (dy !== 1 && blockPowered(x + dx, y + dy, z + dz, null)) p = 15;
        const n = id(x + dx, y + dy, z + dz); if (isRep(n) && on(n)){ const f = STATE[n] & 3; if (DIR4[f][0] === -dx && DIR4[f][1] === -dz) p = 15; } }
      dust.set(k3(x, y, z), p); if (p) q.push([x, y, z, p]);
    }
    while (q.length){
      const [x, y, z, p] = q.shift(); if (p <= 1) continue;
      for (const [dx, dz] of DIR4) for (const dy of [0, 1, -1]){
        const nx = x + dx, ny = y + dy, nz = z + dz, k = k3(nx, ny, nz); if (!dust.has(k)) continue;
        if (dy === 1 && OPAQUE[id(x, y + 1, z)] ) continue;                 // a block over the dust cuts the step up
        if (dy === -1 && OPAQUE[id(nx, y, nz)]) continue;                    // and a block beside it cuts the step down
        if ((dust.get(k) | 0) < p - 1){ dust.set(k, p - 1); q.push([nx, ny, nz, p - 1]); }
      }
    }
    return dust;
  }
  /* is something that uses power (lamp, door, TNT, rail) getting any */
  function poweredAt(x, y, z, dust){
    for (const [dx, dy, dz] of DIR6){
      const nx = x + dx, ny = y + dy, nz = z + dz, n = id(nx, ny, nz);
      if (sourceAt(nx, ny, nz)) return true;
      if (isDust(n) && (dust.get(k3(nx, ny, nz)) | 0) > 0 && dy !== -1) return true;
      if (isRep(n) && on(n)){ const f = STATE[n] & 3; if (DIR4[f][0] === -dx && DIR4[f][1] === -dz && dy === 0) return true; }
      if (n > 0 && OPAQUE[n] && blockPowered(nx, ny, nz, dust)) return true;
    }
    return false;
  }
  const withState = (b, s) => FIRST[b] + (WET[b] ? BLOCKS[FIRST[b]].n : 0) + s;
  function tick(){
    if (!dirty.size) return;
    const spots = [...dirty.values()]; dirty.clear();
    const seen = new Set();
    for (const [cx, cy, cz] of spots){
      const key = (cx >> 3) + ',' + (cy >> 3) + ',' + (cz >> 3); if (seen.has(key)) continue; seen.add(key);
      const dust = solveDust(cx, cy, cz);
      const R = 16;
      for (let y = cy - 6; y <= cy + 6; y++) for (let z = cz - R; z <= cz + R; z++) for (let x = cx - R; x <= cx + R; x++){
        const b = id(x, y, z); if (!(b > 0)) continue;
        if (isDust(b)){ const p = dust.get(k3(x, y, z)) | 0; if (STATE[b] !== p) edit(x, y, z, FIRST[b] + p); continue; }
        if (b === B.redstone_lamp_off || b === B.redstone_lamp_lit){ const pw = poweredAt(x, y, z, dust); if (pw && b === B.redstone_lamp_off) edit(x, y, z, B.redstone_lamp_lit); else if (!pw && b === B.redstone_lamp_lit) edit(x, y, z, B.redstone_lamp_off); continue; }
        if (isRTorch(b)){ const a = torchAttach(b), pw = blockPowered(x + a[0], y + a[1], z + a[2], dust), want = pw ? B.redstone_torch_off : B.redstone_torch; if (first(b) !== want){ later(.1, () => { const c = id(x, y, z); if (isRTorch(c)) { edit(x, y, z, want + STATE[c]); mark(x, y, z); } }); } continue; }
        if (isRep(b)){ const f = STATE[b] & 3, bx = x - DIR4[f][0], bz = z - DIR4[f][1], n = id(bx, y, bz);
          const pw = sourceAt(bx, y, bz) || (isDust(n) && (dust.get(k3(bx, y, bz)) | 0) > 0) || (n > 0 && OPAQUE[n] && blockPowered(bx, y, bz, dust)) || (isRep(n) && on(n) && (STATE[n] & 3) === f);
          if (pw !== on(b)) later(.1, () => { const c = id(x, y, z); if (isRep(c)){ edit(x, y, z, withState(c, (STATE[c] & 3) + (pw ? 4 : 0))); mark(x + DIR4[f][0], y, z + DIR4[f][1]); mark(x, y, z); } });
          continue; }
        const sh = SHAPE[b];
        if (sh === SH.door || sh === SH.trapdoor || sh === SH.gate){
          if (sh === SH.door && STATE[b] >> 3) continue;                     // the bottom half decides
          const pw = poweredAt(x, y, z, dust) || (sh === SH.door && poweredAt(x, y + 1, z, dust)), was = world.powered && world.powered.get(k3(x, y, z));
          if (pw === !!was) continue; (world.powered || (world.powered = new Map())).set(k3(x, y, z), pw);
          const bit = sh === SH.trapdoor ? 8 : 4, s = STATE[b], open = !!(s & bit);
          if (open !== pw){ edit(x, y, z, withState(b, s ^ bit)); if (sh === SH.door){ const u = id(x, y + 1, z); if (u > 0 && SHAPE[u] === SH.door) edit(x, y + 1, z, withState(u, STATE[u] ^ 4)); } }
          continue;
        }
        if (b === B.tnt && poweredAt(x, y, z, dust)){ if (opts.ignite) opts.ignite(x, y, z); continue; }
        if (sh === SH.rail && first(b) === B.rail_powered){ const pw = poweredAt(x, y, z, dust) || poweredAt(x, y - 1, z, dust); const s = STATE[b]; if ((s >= 6) !== pw) edit(x, y, z, withState(b, (s % 6) + (pw ? 6 : 0))); continue; }
      }
    }
  }
  function later(sec, fn){ timers.push([now + sec, fn]); }
  function mark(x, y, z){ dirty.set(k3(x, y, z), [x, y, z]); }
  return {
    mark, later,
    /* a click on a lever or button */
    press(x, y, z){
      const b = id(x, y, z);
      if (isLever(b)){ edit(x, y, z, withState(b, (STATE[b] + 6) % 12)); mark(x, y, z); return true; }
      if (isButton(b) && STATE[b] < 6){ edit(x, y, z, withState(b, STATE[b] + 6)); mark(x, y, z);
        later(first(b) === B.button_oak ? 1.5 : 1, () => { const c = id(x, y, z); if (isButton(c) && STATE[c] >= 6){ edit(x, y, z, withState(c, STATE[c] - 6)); mark(x, y, z); } }); return true; }
      return false;
    },
    /* a button a friend pressed: let it go again in a moment */
    release(x, y, z){ const b = id(x, y, z); later(first(b) === B.button_oak ? 1.5 : 1, () => { const c = id(x, y, z); if (isButton(c) && STATE[c] >= 6){ edit(x, y, z, withState(c, STATE[c] - 6)); mark(x, y, z); } }); },
    /* someone (or something) standing at x, y, z: pressure plates go down, and come up when they leave */
    step(people){
      for (const p of people){ const x = Math.floor(p.x), y = Math.floor(p.y + .05), z = Math.floor(p.z), b = id(x, y, z);
        if (isPlate(b) && STATE[b] === 0){ edit(x, y, z, withState(b, 1)); mark(x, y, z);
          const check = () => { const c = id(x, y, z); if (!isPlate(c) || STATE[c] === 0) return; if (people.some(q => Math.floor(q.x) === x && Math.floor(q.z) === z && Math.abs(q.y - y) < 1)) later(.5, check); else { edit(x, y, z, withState(c, 0)); mark(x, y, z); } };
          later(.5, check); } }
    },
    update(dt, people){
      now += dt; tickT += dt;
      for (let i = timers.length - 1; i >= 0; i--) if (timers[i][0] <= now){ const fn = timers[i][1]; timers.splice(i, 1); fn(); }
      if (tickT >= .1){ tickT = 0; tick(); }
    },
    get busy(){ return dirty.size + timers.length; }
  };
}
