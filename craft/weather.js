/* BDB Craft: weather. Clear spells, rain, and thunderstorms come and go (the host decides; friends get it with the time of day). What falls depends
   on where you are: snow in cold places and high up, rain elsewhere, nothing in deserts, badlands and savannas. Rain and snow stop under a roof.
   Storms darken the sky and throw lightning; in open country a storm can spin up a tornado that wanders across the land, throws you and the
   animals about and tears up plants and leaves in its path. */
import * as THREE from '../chess/vendor/three.module.min.js?v=c20';
import { PLANT } from './blocks.js?v=c20';

const COLD = new Set(['snowy', 'snowtaiga', 'snowpeak', 'frozen', 'frozenriver', 'snowbeach']), DRY = new Set(['desert', 'badlands', 'savanna']);
const OPEN = new Set(['plains', 'sunflower', 'meadow', 'savanna', 'desert', 'badlands']);
const N = 1400, R = 22;

export function createWeather(scene){
  // rain: thin streaks; snow: little flakes. One instanced mesh each, moved round the camera
  const rainM = new THREE.InstancedMesh(new THREE.BoxGeometry(.03, .7, .03), new THREE.MeshBasicMaterial({color:0x9ab4dc, transparent:true, opacity:.55, depthWrite:false}), N);
  const snowM = new THREE.InstancedMesh(new THREE.BoxGeometry(.1, .1, .1), new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.9, depthWrite:false}), N);
  for (const m of [rainM, snowM]){ m.frustumCulled = false; m.visible = false; m.renderOrder = 4; scene.add(m); }
  const drops = Array.from({length:N}, () => ({x:0, y:-999, z:0, v:0, ph:Math.random() * 6}));
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
  // lightning: a jagged white line, and the sky flashes
  const bolts = [];
  function bolt(x, y, z){
    const pts = []; let px = x, pz = z; for (let yy = y + 90; yy > y; yy -= 4 + Math.random() * 4){ pts.push(new THREE.Vector3(px, yy, pz)); px += (Math.random() - .5) * 3; pz += (Math.random() - .5) * 3; } pts.push(new THREE.Vector3(x, y, z));
    const g = new THREE.BufferGeometry().setFromPoints(pts), l = new THREE.Line(g, new THREE.LineBasicMaterial({color:0xf2f6ff, transparent:true, opacity:1, fog:false}));
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, 90, 6), new THREE.MeshBasicMaterial({color:0xdfe8ff, transparent:true, opacity:.5, depthWrite:false, fog:false})); glow.position.set(x, y + 45, z);
    scene.add(l); scene.add(glow); bolts.push({l, glow, t:0});
  }
  // a tornado: rings of dust and bits turning and climbing, wide at the top
  const funnel = new THREE.Group(); funnel.visible = false; scene.add(funnel);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(15, 1.4, 48, 28, 6, true), new THREE.MeshLambertMaterial({color:0x6e6a64, transparent:true, opacity:.42, side:THREE.DoubleSide, depthWrite:false}));
  cone.position.y = 24; funnel.add(cone);
  const cone2 = new THREE.Mesh(new THREE.CylinderGeometry(11, 1, 46, 20, 4, true), new THREE.MeshLambertMaterial({color:0x8a857c, transparent:true, opacity:.3, side:THREE.DoubleSide, depthWrite:false}));
  cone2.position.y = 23; funnel.add(cone2);
  const dustM = new THREE.InstancedMesh(new THREE.BoxGeometry(.5, .5, .5), new THREE.MeshLambertMaterial({color:0x8a8478, transparent:true, opacity:.75}), 900); dustM.frustumCulled = false; funnel.add(dustM);
  const bits = Array.from({length:900}, (_, i) => ({h:Math.random() * 48, a:Math.random() * 6.28, s:.6 + Math.random() * .8, c:i}));
  const col = new THREE.Color(); for (let i = 0; i < 900; i++){ col.setHSL(.08, .1 + Math.random() * .15, .35 + Math.random() * .25); dustM.setColorAt(i, col); }
  const st = {kind:'clear', left:300 + Math.random() * 400, rain:0, storm:0, tornado:null, flash:0, local:'none', strikeT:5};
  return {
    get kind(){ return st.kind; }, get tornado(){ return st.tornado; }, get flash(){ return st.flash; }, get rain(){ return st.rain; }, get storm(){ return st.storm; }, get local(){ return st.local; },
    set(kind, extra){ st.kind = kind; st.left = kind === 'clear' ? 400 + Math.random() * 500 : kind === 'rain' ? 180 + Math.random() * 300 : 120 + Math.random() * 200; if (extra !== undefined) st.tornado = extra; },
    bolt,
    /* the host: change the weather now and then, start tornadoes, choose where lightning strikes */
    host(dt, here, onStrike, onTornado){
      st.left -= dt;
      if (st.left <= 0){ const r = Math.random(); this.set(st.kind === 'clear' ? (r < .3 ? 'thunder' : 'rain') : 'clear'); if (st.kind !== 'thunder') st.tornado = null; }
      if (st.kind === 'thunder' && here){
        st.strikeT -= dt; if (st.strikeT <= 0){ st.strikeT = 4 + Math.random() * 14; const a = Math.random() * 6.28, d = 10 + Math.random() * 60; onStrike(here.x + Math.cos(a) * d, here.z + Math.sin(a) * d); }
        if (!st.tornado && OPEN.has(here.biome) && Math.random() < dt / 90){ const a = Math.random() * 6.28; st.tornado = {x:here.x + Math.cos(a) * 60, z:here.z + Math.sin(a) * 60, vx:-Math.cos(a) * 3 + (Math.random() - .5) * 2, vz:-Math.sin(a) * 3 + (Math.random() - .5) * 2, life:90 + Math.random() * 60}; onTornado && onTornado(st.tornado); }
      }
      if (st.tornado){ const t = st.tornado; t.x += t.vx * dt; t.z += t.vz * dt; t.life -= dt; if (Math.random() < dt * .2){ t.vx += (Math.random() - .5) * 2; t.vz += (Math.random() - .5) * 2; } if (t.life <= 0) st.tornado = null; }
    },
    /* every frame: rain or snow round the camera, the funnel, the bolts */
    update(dt, cam, biome, world, groundY){
      const wet = st.kind !== 'clear', cold = COLD.has(biome) || cam.position.y > 104, dry = DRY.has(biome);
      st.local = !wet || dry ? 'none' : cold ? 'snow' : 'rain';
      st.rain += ((st.local !== 'none' ? 1 : 0) - st.rain) * Math.min(1, dt * .5);
      st.storm += ((st.kind === 'thunder' ? 1 : wet ? .5 : 0) - st.storm) * Math.min(1, dt * .3);
      st.flash = Math.max(0, st.flash - dt * 3);
      const m = st.local === 'snow' ? snowM : rainM, other = m === snowM ? rainM : snowM;
      other.visible = false; m.visible = st.rain > .02;
      if (m.visible){
        const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z, snow = m === snowM, count = Math.floor(N * Math.min(1, st.rain));
        for (let i = 0; i < N; i++){
          const d = drops[i];
          if (i >= count){ mtx.makeScale(0, 0, 0); m.setMatrixAt(i, mtx); continue; }
          d.y -= (snow ? 2.2 : 18) * dt;
          if (d.y < d.floor || Math.abs(d.x - cx) > R || Math.abs(d.z - cz) > R || d.y > cy + 30){
            d.x = cx + (Math.random() - .5) * 2 * R; d.z = cz + (Math.random() - .5) * 2 * R; d.y = cy + 6 + Math.random() * 18;
            const top = world.surface(Math.floor(d.x), Math.floor(d.z)); d.floor = top > 0 ? top : -999;                 // stops on the first thing it meets
          }
          const sx = snow ? Math.sin(d.ph + d.y * .7) * .4 : 0; pos.set(d.x + sx, d.y, d.z + (snow ? Math.cos(d.ph + d.y * .5) * .4 : 0));
          mtx.compose(pos, q, one); m.setMatrixAt(i, mtx);
        }
        m.instanceMatrix.needsUpdate = true; m.material.opacity = (snow ? .9 : .5) * Math.min(1, st.rain);
      }
      // the tornado
      const t = st.tornado; funnel.visible = !!t;
      if (t){
        const gy = groundY(t.x, t.z); funnel.position.set(t.x, gy, t.z);
        for (const b of bits){ b.a += dt * (3.2 - b.h * .03) * b.s; b.h += dt * (5 + b.s * 4); if (b.h > 48) b.h -= 48; const r = 1.4 + b.h * .3 + Math.sin(b.a * 3) * .5; pos.set(Math.cos(b.a) * r, b.h, Math.sin(b.a) * r); const k = .4 + b.h / 40; mtx.compose(pos, q, new THREE.Vector3(k, k, k)); dustM.setMatrixAt(b.c, mtx); }
        dustM.instanceMatrix.needsUpdate = true; cone.rotation.y += dt * 2.4; cone2.rotation.y -= dt * 3.1; cone.scale.x = cone.scale.z = 1 + Math.sin(performance.now() / 300) * .05;
      }
      for (let i = bolts.length - 1; i >= 0; i--){ const b = bolts[i]; b.t += dt; const o = Math.max(0, 1 - b.t * 3); b.l.material.opacity = o; b.glow.material.opacity = o * .5; if (b.t > .35){ scene.remove(b.l); scene.remove(b.glow); b.l.geometry.dispose(); bolts.splice(i, 1); } }
    },
    strikeFlash(){ st.flash = 1; },
    /* what a tornado does to anything near it: lifts, spins, throws */
    pull(x, y, z, gy){
      const t = st.tornado; if (!t) return null;
      const dx = x - t.x, dz = z - t.z, d = Math.hypot(dx, dz); if (d > 9 || y > gy + 50) return null;
      const k = 1 - d / 9; return {vx:(-dz / (d || 1)) * 14 * k - dx * 1.2 * k, vz:(dx / (d || 1)) * 14 * k - dz * 1.2 * k, vy:12 * k};
    },
    clear(){ funnel.visible = false; rainM.visible = snowM.visible = false; for (const b of bolts){ scene.remove(b.l); scene.remove(b.glow); } bolts.length = 0; st.tornado = null; }
  };
}
/* the host tears up what a tornado passes over: plants, leaves and snow on top (never what people built from solid blocks) */
export function tearUp(world, t, edit, leaves){
  for (let i = 0; i < 6; i++){
    const x = Math.floor(t.x + (Math.random() - .5) * 8), z = Math.floor(t.z + (Math.random() - .5) * 8), top = world.surface(x, z);
    for (let y = top + 3; y > top - 8 && y > 1; y--){ const b = world.get(x, y, z); if (b > 0 && (PLANT[b] || leaves.has(b))){ edit(x, y, z, 0); break; } }
  }
}
