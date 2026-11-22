/* BDB Craft: minecarts. Put one on a rail, right click to get in, W to push it along, Shift to get out. Carts follow straight rails, corners and
   slopes, roll downhill and slow uphill, speed up on powered rails that are switched on and brake on ones that are off, and stop at the end of the
   line. The host (or a player on their own) moves them and sends where they are, five times a second; friends ride by asking the host. */
import * as THREE from '../chess/vendor/three.module.min.js?v=c21';
import { SHAPE, STATE, FIRST, OPAQUE, SH, B } from './blocks.js?v=c21';

const N = [0, -1], E = [1, 0], S = [0, 1], Wd = [-1, 0];
// the two ways each rail goes: straight n-s, e-w, sloping up east, west, north, south, then the corners se, sw, nw, ne
const CONN = [[N, S], [E, Wd], [E, Wd], [Wd, E], [N, S], [S, N], [S, E], [S, Wd], [N, Wd], [N, E]];
const UP = [null, null, E, Wd, N, S];               // which way a sloping rail climbs
const MAX = 8;

function cartMesh(){
  const g = new THREE.Group(), iron = new THREE.MeshLambertMaterial({color:0x8a8f96}), dark = new THREE.MeshLambertMaterial({color:0x4a4f56}), wheel = new THREE.MeshLambertMaterial({color:0x2a2a2a});
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); };
  box(.9, .08, 1.15, dark, 0, .18, 0); box(.9, .5, .08, iron, 0, .4, .56); box(.9, .5, .08, iron, 0, .4, -.56); box(.08, .5, 1.2, iron, .45, .4, 0); box(.08, .5, 1.2, iron, -.45, .4, 0);
  for (const x of [-.4, .4]) for (const z of [-.4, .4]) box(.08, .22, .22, wheel, x, .1, z);
  return g;
}
export function createCarts(scene, world){
  const list = new Map(); let nid = 1;
  const railAt = (x, y, z) => { const b = world.get(x, y, z); return b > 0 && SHAPE[b] === SH.rail ? b : 0; };
  const shapeOf = b => FIRST[b] === B.rail_powered ? STATE[b] % 6 : STATE[b];
  const poweredOn = b => FIRST[b] === B.rail_powered && STATE[b] >= 6, poweredOff = b => FIRST[b] === B.rail_powered && STATE[b] < 6;
  function add(x, y, z, id){
    const m = cartMesh(); scene.add(m);
    const c = {id:id || nid++, x, y, z, hx:0, hz:-1, s:0, m, rider:null, yaw:0}; list.set(c.id, c); m.position.set(x, y, z); return c;
  }
  function remove(c){ scene.remove(c.m); c.m.traverse(o => { if (o.geometry) o.geometry.dispose(); }); list.delete(c.id); }
  /* the rail a cart is on: the one in its cell, or the one just under it at the top of a slope */
  function railFor(c){ const x = Math.floor(c.x), z = Math.floor(c.z); let y = Math.floor(c.y + .05); let b = railAt(x, y, z); if (!b){ b = railAt(x, y - 1, z); if (b) y--; } return b ? {b, x, y, z} : null; }
  function stepCart(c, dt, push){
    let r = railFor(c); if (!r){ c.s = 0; return; }
    // speed: rolling slows a little, slopes pull, powered rails push or brake, the rider pushes
    const sh = shapeOf(r.b), up = UP[sh];
    c.s *= Math.exp(-dt * .3);
    if (up){ const along = c.hx * up[0] + c.hz * up[1]; c.s -= along * 9 * dt; }
    if (poweredOn(r.b)){ if (c.s < .2){ const [a, bb] = CONN[sh]; const blockedA = OPAQUE[Math.max(0, world.get(r.x + a[0], r.y, r.z + a[1]))]; const d = blockedA ? bb : a; c.hx = d[0]; c.hz = d[1]; } c.s = Math.min(MAX, c.s + 14 * dt); }
    else if (poweredOff(r.b)) c.s *= Math.exp(-dt * 10);
    if (push){ const [a, bb] = CONN[sh], da = a[0] * push[0] + a[1] * push[1], db = bb[0] * push[0] + bb[1] * push[1], d = da > db ? a : bb;
      if (c.s < .3){ c.hx = d[0]; c.hz = d[1]; } if (c.hx * push[0] + c.hz * push[1] > 0) c.s = Math.min(MAX * .7, c.s + 5 * dt); }
    if (c.s < 0){ c.s = -c.s; c.hx = -c.hx; c.hz = -c.hz; }
    // move in small steps, steering for the edge the rail leads out of
    let left = c.s * dt;
    while (left > 1e-4){
      r = railFor(c); if (!r){ c.s = 0; return; }
      const sh2 = shapeOf(r.b), [a, bb] = CONN[sh2], da = a[0] * c.hx + a[1] * c.hz, db = bb[0] * c.hx + bb[1] * c.hz, e = da >= db ? a : bb;
      const cx = r.x + .5, cz = r.z + .5, tx = cx + e[0] * .5, tz = cz + e[1] * .5;
      // keep to the middle of the track: aim at the centre first if not on the line yet (corners turn there)
      const onLine = Math.abs(e[0] ? c.z - cz : c.x - cx) < .02, ax = onLine ? tx : cx + e[0] * .01, az = onLine ? tz : cz + e[1] * .01;
      let dx = ax - c.x, dz = az - c.z, d = Math.hypot(dx, dz);
      const step = Math.min(left, .1, Math.max(d, .001)); if (d > 1e-6){ c.hx = dx / d; c.hz = dz / d; }
      c.x += c.hx * step; c.z += c.hz * step; left -= step;
      // height: on a slope the cart climbs with it
      const u = UP[sh2], lx = c.x - r.x, lz = c.z - r.z;
      c.y = r.y + .0625 + (u ? Math.max(0, Math.min(1, u[0] > 0 ? lx : u[0] < 0 ? 1 - lx : u[1] > 0 ? lz : 1 - lz)) : 0);
      // into the next cell: is there track there (level, one up, one down)?
      const nx = Math.floor(c.x), nz = Math.floor(c.z);
      if (nx !== r.x || nz !== r.z){
        const goingUp = u && u[0] === e[0] && u[1] === e[1];
        const ny = [goingUp ? r.y + 1 : r.y, r.y, r.y - 1].find(yy => railAt(nx, yy, nz));
        if (ny === undefined){ c.x -= c.hx * step; c.z -= c.hz * step; c.s = 0; return; }       // the end of the line
        c.y = Math.max(c.y, ny + .0625); if (ny < r.y) c.y = ny + 1.0625;
      }
      if (d < .02 && onLine) { /* reached the edge: carry on into the next cell next round */ }
    }
  }
  return {
    list, add, remove,
    /* place a cart on the rail at x, y, z */
    put(x, y, z){ const b = railAt(x, y, z); if (!b) return null; const c = add(x + .5, y + .0625, z + .5); const [a] = CONN[shapeOf(b)]; c.hx = a[0]; c.hz = a[1]; return c; },
    update(dt, host, pushes){
      for (const c of list.values()){
        if (host) stepCart(c, dt, pushes && pushes.get(c.id));
        else if (c.target){ const k = Math.min(1, dt * 10); c.x += (c.target[0] - c.x) * k; c.y += (c.target[1] - c.y) * k; c.z += (c.target[2] - c.z) * k; c.hx = c.target[3]; c.hz = c.target[4]; }
        const yaw = Math.atan2(c.hx, c.hz); let dy = yaw - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.yaw += dy * Math.min(1, dt * 12);
        c.m.position.set(c.x, c.y, c.z); c.m.rotation.y = c.yaw;
        const u = railFor(c), sh = u ? shapeOf(u.b) : 0, up = UP[sh]; c.m.rotation.x = 0; c.m.rotation.z = 0;
        if (up){ const ang = Math.PI / 4 * ((up[0] * c.hx + up[1] * c.hz) >= 0 ? 1 : -1); c.m.rotation.order = 'YXZ'; c.m.rotation.x = -ang * (Math.abs(Math.cos(c.yaw)) > .5 ? 1 : 1); }
      }
    },
    pick(o, dir, max){
      let best = null, bt = max;
      for (const c of list.values()){ const cx = c.x - o.x, cy = c.y + .35 - o.y, cz = c.z - o.z, t = cx * dir.x + cy * dir.y + cz * dir.z; if (t < 0 || t > bt) continue;
        const dx = cx - dir.x * t, dy = cy - dir.y * t, dz = cz - dir.z * t; if (dx * dx + dy * dy + dz * dz < .5){ best = c; bt = t; } }
      return best;
    },
    state(){ return [...list.values()].map(c => [c.id, +c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2), +c.hx.toFixed(2), +c.hz.toFixed(2), c.rider || 0]); },
    apply(st){
      const seen = new Set();
      for (const [id, x, y, z, hx, hz, rider] of st){ seen.add(id); let c = list.get(id); if (!c){ c = add(x, y, z, id); } c.target = [x, y, z, hx, hz]; c.rider = rider || null; }
      for (const c of [...list.values()]) if (!seen.has(c.id)) remove(c);
    },
    clear(){ for (const c of [...list.values()]) remove(c); }
  };
}
