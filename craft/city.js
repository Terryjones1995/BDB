/* BDB Craft: the name of the city you are near, in huge letters hanging in the sky over it, and a title when you walk in.
   The letters turn to face you (left and right only, so they stay upright) and fade in as you come close. */
import * as THREE from '../chess/vendor/three.module.min.js?v=c22';

function letters(name){
  const c = document.createElement('canvas'), x = c.getContext('2d'), font = '200px "Bowlby One", Impact, "Arial Black", sans-serif';
  x.font = font; const w = Math.ceil(x.measureText(name.toUpperCase()).width) + 120;
  c.width = Math.min(4096, w); c.height = 300;
  x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  const t = name.toUpperCase(), cx = c.width / 2, cy = c.height / 2 + 8;
  x.lineWidth = 26; x.strokeStyle = 'rgba(20,24,40,.85)'; x.strokeText(t, cx, cy);
  const g = x.createLinearGradient(0, 40, 0, 260); g.addColorStop(0, '#fff6d8'); g.addColorStop(.55, '#ffd463'); g.addColorStop(1, '#f39b2f');
  x.fillStyle = g; x.fillText(t, cx, cy);
  x.lineWidth = 4; x.strokeStyle = 'rgba(255,255,255,.6)'; x.strokeText(t, cx, cy - 3);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return {tex, aspect:c.width / c.height};
}

export function createCitySigns(scene){
  const signs = new Map();
  function sign(city){
    const key = city.x + ',' + city.z; let s = signs.get(key); if (s) return s;
    const {tex, aspect} = letters(city.name), hgt = Math.max(34, city.r * .42);
    // drawn over the clouds and high above the tallest towers, so it reads as a sign hung in the sky
    const m = new THREE.Mesh(new THREE.PlaneGeometry(hgt * aspect, hgt), new THREE.MeshBasicMaterial({map:tex, transparent:true, depthWrite:false, depthTest:false, fog:false, side:THREE.DoubleSide, opacity:0, toneMapped:false}));
    m.position.set(city.x, 182, city.z); m.renderOrder = 20; m.frustumCulled = false; scene.add(m);
    if (document.fonts && document.fonts.check && !document.fonts.check('200px "Bowlby One"')) document.fonts.load('200px "Bowlby One"').then(() => { if (!signs.has(key)) return; const n = letters(city.name); m.material.map.dispose(); m.material.map = n.tex; m.material.needsUpdate = true; }).catch(() => {});
    s = {m, city}; signs.set(key, s); return s;
  }
  let inside = null;
  return {
    /* cities: the ones near here; at: where you are. Calls entered(city) when you walk into one */
    update(cam, cities, at, entered){
      const keep = new Set();
      for (const c of cities){
        const s = sign(c), d = Math.hypot(at.x - c.x, at.z - c.z); keep.add(c.x + ',' + c.z);
        const want = d < c.r + 420 ? Math.min(1, (c.r + 420 - d) / 120) : 0;
        s.m.material.opacity += (want - s.m.material.opacity) * .05; s.m.visible = s.m.material.opacity > .01;
        s.m.rotation.y = Math.atan2(cam.position.x - c.x, cam.position.z - c.z);
      }
      for (const [k, s] of signs) if (!keep.has(k)){ scene.remove(s.m); s.m.geometry.dispose(); s.m.material.map.dispose(); s.m.material.dispose(); signs.delete(k); }
      const now = cities.find(c => Math.max(Math.abs(at.x - c.x), Math.abs(at.z - c.z)) <= c.r) || null;
      if (now && (!inside || inside.name !== now.name || inside.x !== now.x)) entered && entered(now);
      inside = now ? now : (inside && cities.some(c => c === inside && Math.max(Math.abs(at.x - c.x), Math.abs(at.z - c.z)) <= c.r + 30) ? inside : null);
      return inside;
    },
    clear(){ for (const s of signs.values()){ scene.remove(s.m); s.m.geometry.dispose(); s.m.material.map.dispose(); s.m.material.dispose(); } signs.clear(); inside = null; }
  };
}
