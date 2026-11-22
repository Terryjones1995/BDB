/* BDB Craft: you. A 0.6 by 1.8 box that walks, sprints, sneaks, swims, climbs ladders, jumps and (this is creative) flies, and never goes through
   anything solid: whole blocks or the boxes of shaped ones (slabs, stairs, fences, doors). It steps up slabs and stair steps on its own, and sneaking
   keeps you from walking off an edge. Eye height 1.62, like the real thing. */
import { LIQUID } from './blocks.js?v=c22';
import { CLIMB } from './shapes.js?v=c22';
export const W = .3, HGT = 1.8, EYE = 1.62, STEP = .6;
export function createPlayer(world){
  const p = {x:.5, y:80, z:.5, vx:0, vy:0, vz:0, yaw:0, pitch:0, fly:false, ground:false, sprint:false, sneak:false, inWater:false, eyeWater:false,
    get eye(){ return this.y + (this.sneak ? EYE - .3 : EYE); }};
  /* every solid box near a region */
  function near(x0, y0, z0, x1, y1, z1){
    const out = [];
    for (let y = Math.floor(y0) - 1; y <= Math.floor(y1); y++) for (let z = Math.floor(z0); z <= Math.floor(z1); z++) for (let x = Math.floor(x0); x <= Math.floor(x1); x++){
      const q = world.boxesAt(x, y, z); if (q) for (const b of q) out.push(b);
    }
    return out;
  }
  const overlap = (b, x0, y0, z0, x1, y1, z1) => b[0] < x1 - 1e-6 && b[3] > x0 + 1e-6 && b[1] < y1 - 1e-6 && b[4] > y0 + 1e-6 && b[2] < z1 - 1e-6 && b[5] > z0 + 1e-6;
  p.blocked = (x, y, z) => near(x - W, y, z - W, x + W, y + HGT, z + W).some(b => overlap(b, x - W, y, z - W, x + W, y + HGT, z + W));
  /* move along one axis as far as the boxes allow; returns how far it went */
  function slide(ax, d){
    if (!d) return 0;
    const x0 = p.x - W, x1 = p.x + W, y0 = p.y, y1 = p.y + HGT, z0 = p.z - W, z1 = p.z + W;
    const bx = near(Math.min(x0, x0 + (ax === 0 ? d : 0)), Math.min(y0, y0 + (ax === 1 ? d : 0)), Math.min(z0, z0 + (ax === 2 ? d : 0)), Math.max(x1, x1 + (ax === 0 ? d : 0)), Math.max(y1, y1 + (ax === 1 ? d : 0)), Math.max(z1, z1 + (ax === 2 ? d : 0)));
    const lo = [x0, y0, z0], hi = [x1, y1, z1];
    for (const b of bx){
      let ok = true; for (let i = 0; i < 3; i++) if (i !== ax && !(b[i] < hi[i] - 1e-6 && b[i + 3] > lo[i] + 1e-6)){ ok = false; break; }
      if (!ok) continue;
      if (d > 0 && b[ax] >= hi[ax] - 1e-6) d = Math.min(d, b[ax] - hi[ax]); else if (d < 0 && b[ax + 3] <= lo[ax] + 1e-6) d = Math.max(d, b[ax + 3] - lo[ax]);
    }
    if (ax === 0) p.x += d; else if (ax === 1) p.y += d; else p.z += d;
    return d;
  }
  const standingOn = (x, z) => near(x - W, p.y - .6, z - W, x + W, p.y, z + W).some(b => overlap(b, x - W, p.y - .6, z - W, x + W, p.y + .01, z + W));
  const climbing = () => { for (let y = Math.floor(p.y); y <= Math.floor(p.y + 1.2); y++) for (const [dx, dz] of [[0, 0], [W, 0], [-W, 0], [0, W], [0, -W]]){ const b = world.get(Math.floor(p.x + dx * .9), y, Math.floor(p.z + dz * .9)); if (b > 0 && CLIMB(b)) return true; } return false; };
  /* one step. keys: {f, b, l, r, up, down, sprint}. dt in seconds */
  p.step = (dt, k) => {
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    const sink = p.fly && k.ad && k.up;                                 // flying: Space + Down arrow sinks slowly (instead of going back)
    let mx = (k.r ? 1 : 0) - (k.l ? 1 : 0), mz = (k.b && !sink ? 1 : 0) - (k.f ? 1 : 0); const ml = Math.hypot(mx, mz); if (ml){ mx /= ml; mz /= ml; }
    p.sneak = !p.fly && !!k.down;
    if (!k.f || p.sneak) p.sprint = false; else if (k.sprint) p.sprint = true;
    const wx = mx * cos + mz * sin, wz = -mx * sin + mz * cos;
    const feet = world.get(Math.floor(p.x), Math.floor(p.y + .4), Math.floor(p.z)), head = world.get(Math.floor(p.x), Math.floor(p.eye), Math.floor(p.z));
    p.inWater = feet > 0 && LIQUID[feet] > 0; p.eyeWater = head > 0 && LIQUID[head] === 1; p.eyeLava = head > 0 && LIQUID[head] === 2;
    const climb = !p.fly && climbing();
    if (p.fly){
      const sp = p.sprint && !k.down ? 21.6 : 10.9, a = 1 - Math.exp(-dt * 10);
      p.vx += (wx * sp - p.vx) * a; p.vz += (wz * sp - p.vz) * a; p.vy += ((sink ? -2.5 : k.down ? (k.up ? -2.5 : k.sprint ? -16 : -8) : k.up ? 8 : 0) - p.vy) * a;     // Shift down, Shift or Down arrow + Space down slowly, Ctrl + Shift down fast
    } else {
      const sp = (p.sneak ? 1.3 : p.sprint ? 5.6 : 4.317) * (p.inWater ? .55 : 1), a = 1 - Math.exp(-dt * (p.ground ? 16 : 4.5));
      p.vx += (wx * sp - p.vx) * a; p.vz += (wz * sp - p.vz) * a;
      if (climb){ p.vy = k.f || k.up ? 2.4 : p.sneak ? 0 : Math.max(p.vy - 32 * dt, -2.2); }
      else if (p.inWater){ p.vy -= 10 * dt; p.vy *= Math.exp(-dt * 3); if (k.up) p.vy = Math.min(p.vy + 26 * dt, 3.2); }
      else { p.vy -= 32 * dt; if (p.vy < -78) p.vy = -78; if (k.up && p.ground) p.vy = 9.2; }
    }
    const was = p.ground; p.ground = false;
    for (const ax of [0, 2]){
      const d = (ax === 0 ? p.vx : p.vz) * dt; if (!d) continue;
      const ox = p.x, oz = p.z, oy = p.y, got = slide(ax, d);
      // stepping up: a slab, a stair, anything up to 0.6 high, when walking on the ground
      if (Math.abs(got) < Math.abs(d) - 1e-4 && was && !p.fly){
        const up = slide(1, STEP); const more = slide(ax, d - got); const down = slide(1, -up - .01);
        if (Math.abs(more) < 1e-4 || up < .05){ p.x = ox; p.z = oz; p.y = oy; slide(ax, d); }
      }
      // sneaking: no stepping off an edge
      if (p.sneak && was && !standingOn(p.x, p.z)){ p.x = ox; p.z = oz; p.y = oy; }
      if (Math.abs((ax === 0 ? p.x - ox : p.z - oz)) < Math.abs(d) - 1e-4){ if (ax === 0) p.vx = 0; else p.vz = 0; }
    }
    const dy = p.vy * dt, gy = slide(1, dy);
    if (gy !== dy){ if (dy < 0) p.ground = true; p.vy = 0; }
    if (p.fly && p.ground) p.fly = false;                                // flying down onto the ground lands you
    if (p.y < -20){ p.y = 140; p.vy = 0; }
  };
  /* would a block at (x, y, z) sit inside you? (you cannot place one there) */
  p.overlaps = (x, y, z) => x + 1 > p.x - W && x < p.x + W && z + 1 > p.z - W && z < p.z + W && y + 1 > p.y && y < p.y + HGT;
  return p;
}
