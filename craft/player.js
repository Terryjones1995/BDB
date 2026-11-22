/* BDB Craft: you. A 0.6 by 1.8 box that walks, jumps, sprints and (this is creative) flies, and never goes through a solid block.
   Moves one axis at a time and stops at the first block in the way; walks up nothing taller than a jump. Eye height 1.62, like the real thing. */
export const W = .3, HGT = 1.8, EYE = 1.62;
export function createPlayer(world){
  const p = {x:.5, y:80, z:.5, vx:0, vy:0, vz:0, yaw:0, pitch:0, fly:false, ground:false, sprint:false, inWater:false,
    get eye(){ return this.y + EYE; }};
  const hit = (x0, y0, z0, x1, y1, z1) => {
    for (let y = Math.floor(y0); y <= Math.floor(y1 - 1e-6); y++) for (let z = Math.floor(z0); z <= Math.floor(z1 - 1e-6); z++) for (let x = Math.floor(x0); x <= Math.floor(x1 - 1e-6); x++) if (world.solidAt(x, y, z)) return true;
    return false;
  };
  p.blocked = (x, y, z) => hit(x - W, y, z - W, x + W, y + HGT, z + W);
  /* one step. keys: {f, b, l, r, up, down, sprint}. dt in seconds */
  p.step = (dt, k) => {
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    let mx = (k.r ? 1 : 0) - (k.l ? 1 : 0), mz = (k.b ? 1 : 0) - (k.f ? 1 : 0); const ml = Math.hypot(mx, mz); if (ml){ mx /= ml; mz /= ml; }
    if (!k.f) p.sprint = false; else if (k.sprint) p.sprint = true;
    const wx = mx * cos + mz * sin, wz = -mx * sin + mz * cos;
    const feet = world.get(Math.floor(p.x), Math.floor(p.y + .4), Math.floor(p.z)); p.inWater = feet === 20;
    if (p.fly){
      const sp = p.sprint ? 21.6 : 10.9, a = 1 - Math.exp(-dt * 10);
      p.vx += (wx * sp - p.vx) * a; p.vz += (wz * sp - p.vz) * a; p.vy += (((k.up ? 1 : 0) - (k.down ? 1 : 0)) * 8 - p.vy) * a;
    } else {
      const sp = (p.sprint ? 5.6 : 4.317) * (p.inWater ? .55 : 1), a = 1 - Math.exp(-dt * (p.ground ? 16 : 4.5));
      p.vx += (wx * sp - p.vx) * a; p.vz += (wz * sp - p.vz) * a;
      if (p.inWater){ p.vy -= 10 * dt; p.vy *= Math.exp(-dt * 3); if (k.up) p.vy = Math.min(p.vy + 26 * dt, 3.2); }
      else { p.vy -= 32 * dt; if (p.vy < -78) p.vy = -78; if (k.up && p.ground) p.vy = 9.2; }
    }
    p.ground = false;
    move('x', p.vx * dt); move('z', p.vz * dt); move('y', p.vy * dt);
    if (p.fly && p.ground) p.fly = false;                                // flying down onto the ground lands you
    if (p.y < -20){ p.y = 140; p.vy = 0; }
  };
  function move(ax, d){
    if (!d) return;
    const n = Math.ceil(Math.abs(d) / .45), s = d / n;
    for (let i = 0; i < n; i++){
      const o = p[ax]; p[ax] += s;
      if (p.blocked(p.x, p.y, p.z)){
        if (ax === 'y'){ if (s < 0){ p.y = Math.floor(o + s) + 1; if (p.blocked(p.x, p.y, p.z)) p.y = o; p.ground = true; } else { p.y = Math.ceil(o + HGT) - HGT; if (p.blocked(p.x, p.y, p.z)) p.y = o; } p.vy = 0; }
        else { p[ax] = s > 0 ? Math.ceil(o + W) - W - 1e-4 : Math.floor(o - W) + W + 1e-4; if (p.blocked(p.x, p.y, p.z)) p[ax] = o; p['v' + ax] = 0; }
        return;
      }
    }
  }
  /* would a block at (x, y, z) sit inside you? (you cannot place one there) */
  p.overlaps = (x, y, z) => x + 1 > p.x - W && x < p.x + W && z + 1 > p.z - W && z < p.z + W && y + 1 > p.y && y < p.y + HGT;
  return p;
}
