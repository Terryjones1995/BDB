/* =========================================================
   Sink BDB in 3D (three.js).
   The game keeps its flat layout (grid positions in screen pixels) and keeps drawing the flat stuff
   (labels, rosters, reticles, the tray text) onto its own canvas. Here that canvas becomes the
   texture of a table top, seen through a tilted camera, and everything with height is real 3D:
   rolling water, ships, pegs, shells, fire, smoke and splashes.
   World units are layout pixels: x = layout x, z = layout y, y = up.
   Pointer positions are turned back into layout pixels by casting a ray onto the table.
   ========================================================= */
import * as THREE from 'three';
import { RoomEnvironment } from '../chess/vendor/RoomEnvironment.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const STYLE = {
  mine:{hull:0x4f5f7e, deck:0xa3b1c9, bits:0xe9eef6, trim:0xff8a2b, dark:0x1b2234},
  foe:{hull:0x112a5e, deck:0x3563c0, bits:0xc9d8ff, trim:0xf2c14e, dark:0x050d22}
};

export async function createFleet3D(o){
  const {host, flat, api, cellsOf, SINK_MS, reduced} = o;

  /* ---------- renderer, scene, lights ---------- */
  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const cvs = renderer.domElement; cvs.className = 'f3cv';
  host.insertBefore(cvs, host.firstChild);

  const scene = new THREE.Scene();
  { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose(); }
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 20000);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x0a1430, .7));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .5;
  scene.add(sun, sun.target);
  const SUN_DIR = new THREE.Vector3(-.45, 1, .55).normalize();

  /* ---------- the table: flat layer + a shadow catcher ---------- */
  const flatTex = new THREE.CanvasTexture(flat);
  flatTex.colorSpace = THREE.SRGBColorSpace; flatTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  flatTex.minFilter = THREE.LinearFilter; flatTex.generateMipmaps = false;
  const flatMat = new THREE.MeshBasicMaterial({map:flatTex, transparent:true, depthWrite:false, toneMapped:false});
  const flatMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), flatMat);
  flatMesh.renderOrder = 5; scene.add(flatMesh);
  const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({opacity:.35, depthWrite:false}));
  shadowMesh.receiveShadow = true; shadowMesh.renderOrder = 1; scene.add(shadowMesh);

  /* ---------- water ---------- */
  const waterMat = () => new THREE.ShaderMaterial({
    transparent:true, depthWrite:false,
    uniforms:{uTime:{value:0}, uC:{value:40}, uSun:{value:SUN_DIR}, uCam:{value:new THREE.Vector3()}, uActive:{value:0}},
    vertexShader:`
      uniform float uTime; uniform float uC;
      varying vec3 vW; varying vec2 vUv; varying float vH;
      void main(){
        vUv = uv; vec3 p = position;
        float t = uTime;
        float h = sin(p.x / uC * 1.25 + t * 1.3) * .5 + sin(p.z / uC * 1.6 - t * 1.05) * .35 + sin((p.x - p.z) / uC * .8 + t * .6) * .45;
        p.y += h * uC * .03;
        vH = h;
        vec4 w = modelMatrix * vec4(p, 1.);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader:`
      uniform vec3 uSun; uniform vec3 uCam; uniform float uActive;
      varying vec3 vW; varying vec2 vUv; varying float vH;
      void main(){
        vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
        if (n.y < 0.) n = -n;
        vec3 v = normalize(uCam - vW);
        vec3 deep = vec3(.004, .02, .07), shallow = vec3(.014, .07, .2);
        float k = clamp(.55 + vH * .18 + (vUv.x - vUv.y) * .15, 0., 1.);
        vec3 col = mix(deep, shallow, k);
        float fres = pow(1. - max(dot(n, v), 0.), 3.);
        col += vec3(.2, .35, .6) * fres * .35;
        vec3 hv = normalize(uSun + v);
        float sp = pow(max(dot(n, hv), 0.), 90.);
        col += vec3(1., .95, .85) * sp * 1.1;
        float ripple = smoothstep(.55, 1., vH) * .035;
        col += vec3(.4, .6, .9) * ripple;
        col += vec3(.95, .76, .3) * uActive * .008;
        gl_FragColor = vec4(col, .86);
        #include <colorspace_fragment>
      }`
  });

  /* ---------- per-grid basins ---------- */
  const grids = {me:null, foe:null};
  const rimMat = new THREE.MeshStandardMaterial({color:0x0b1834, roughness:.45, metalness:.2});
  const floorMat = new THREE.MeshStandardMaterial({color:0x020a1c, roughness:1});
  function buildGrid(key, g){
    const old = grids[key];
    if (old && old.x === g.x && old.y === g.y && old.c === g.cell) return old;
    if (old) scene.remove(old.grp);
    const c = g.cell, S = c * 10, grp = new THREE.Group();
    grp.position.set(g.x, 0, g.y);
    const segs = g.big ? 48 : 20;
    const wm = waterMat(); wm.uniforms.uC.value = c;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(S, S, segs, segs).rotateX(-Math.PI / 2), wm);
    water.position.set(S / 2, 0, S / 2); water.renderOrder = 3; grp.add(water);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2), floorMat);
    floor.position.set(S / 2, -c * .9, S / 2); floor.receiveShadow = true; grp.add(floor);
    const t = Math.max(3, c * .14), h = c * .95, top = -c * .02;
    for (const [w, d, x, z] of [[S + t * 2, t, S / 2, -t / 2], [S + t * 2, t, S / 2, S + t / 2], [t, S, -t / 2, S / 2], [t, S, S + t / 2, S / 2]]){
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rimMat);
      m.position.set(x, top - h / 2, z); m.castShadow = true; m.receiveShadow = true; grp.add(m);
    }
    scene.add(grp);
    const rec = {key, x:g.x, y:g.y, c, grp, water, pegs:new Map()};
    grids[key] = rec; return rec;
  }
  function dropGrid(key){ const r = grids[key]; if (r){ scene.remove(r.grp); grids[key] = null; } }

  /* ---------- ships ---------- */
  function hullShape(id, L){
    // same outlines as the flat ships, in cell units: x along the ship (bow at +x), y across
    const s = new THREE.Shape(), p = .13, t = p, b = 1 - p, m = .5;
    const X = x => x - L / 2, Y = y => m - y;
    if (id === 'sub'){
      const rr = (b - t) / 2 - .03;
      s.moveTo(X(.5), Y(m - rr)); s.lineTo(X(L - .5), Y(m - rr));
      s.absarc(X(L - .5), 0, rr, Math.PI / 2, -Math.PI / 2, true);
      s.lineTo(X(.5), Y(m + rr));
      s.absarc(X(.5), 0, rr, -Math.PI / 2, -Math.PI * 1.5, true);
    } else if (id === 'brk'){
      const x0 = X(p * .7), x1 = X(L - p * .7), y0 = Y(b), y1 = Y(t), r = .16;
      s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
      s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
    } else {
      const bow = .66;
      s.moveTo(X(p * 1.1), Y(t + .04)); s.lineTo(X(L - bow), Y(t));
      s.quadraticCurveTo(X(L - p * .9), Y(t + .03), X(L - p * .5), Y(m));
      s.quadraticCurveTo(X(L - p * .9), Y(b - .03), X(L - bow), Y(b));
      s.lineTo(X(p * 1.1), Y(b - .04));
      s.quadraticCurveTo(X(p * .5), Y(m), X(p * 1.1), Y(t + .04));
    }
    return s;
  }
  const hullGeo = {};
  function getHull(id, len){
    if (!hullGeo[id]){
      const deep = id === 'sub' ? .16 : .28;
      const g = new THREE.ExtrudeGeometry(hullShape(id, len), {depth:deep, bevelEnabled:true, bevelThickness:.04, bevelSize:.035, bevelSegments:2, curveSegments:10});
      g.rotateX(-Math.PI / 2);       // shape plane → horizontal, extrusion → up
      g.translate(0, -.13, 0);
      hullGeo[id] = g;
    }
    return hullGeo[id];
  }
  const tex = {};
  function discTex(kind){
    if (tex[kind]) return tex[kind];
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.beginPath(); x.arc(64, 64, 58, 0, Math.PI * 2); x.closePath();
    if (kind === 'face'){
      x.fillStyle = '#14254d'; x.fill();
      const img = o.faceImg;
      if (img && img.complete && img.naturalWidth){
        x.save(); x.clip();
        const iw = img.naturalWidth, ih = img.naturalHeight, side = Math.min(iw, ih);
        x.drawImage(img, (iw - side) / 2, Math.max(0, Math.min(ih - side, (ih - side) * .32)), side, side, 6, 6, 116, 116);
        x.restore();
      }
      x.lineWidth = 9; x.strokeStyle = '#f2c14e'; x.beginPath(); x.arc(64, 64, 58, 0, Math.PI * 2); x.stroke();
    } else {
      const gr = x.createRadialGradient(46, 42, 6, 64, 64, 60); gr.addColorStop(0, '#ffc583'); gr.addColorStop(.5, '#ff8a2b'); gr.addColorStop(1, '#a34c0c');
      x.fillStyle = gr; x.fill();
      x.strokeStyle = 'rgba(58,22,2,.8)'; x.lineWidth = 6;
      x.beginPath(); x.moveTo(6, 64); x.lineTo(122, 64); x.moveTo(64, 6); x.lineTo(64, 122); x.stroke();
      x.beginPath(); x.arc(64, 64, 58, 0, Math.PI * 2); x.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    tex[kind] = t; return t;
  }
  function makeShip(id, len, style){
    const st = STYLE[style], mats = [];
    const M = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({color, roughness:.45, metalness:.35, ...extra}); m.userData.base = new THREE.Color(color); mats.push(m); return m; };
    const deck = M(st.deck), hull = M(st.hull), bits = M(st.bits, {metalness:.2}), trim = M(st.trim, {metalness:.1, roughness:.4}), dark = M(st.dark);
    const grp = new THREE.Group(), body = new THREE.Group(); grp.add(body);
    const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; body.add(m); return m; };
    add(getHull(id, len), [deck, hull], 0, 0, 0);
    const H = id === 'sub' ? .07 : .19;   // deck height
    const X = x => x - len / 2;
    add(new THREE.BoxGeometry(len * .62, .02, .045), trim, X(len * .45), H + .01, .24);
    const turret = x => {
      add(new THREE.CylinderGeometry(.15, .17, .1, 18), bits, X(x), H + .05, 0);
      const br = add(new THREE.CylinderGeometry(.025, .025, .34, 8), dark, X(x) + .2, H + .07, 0); br.rotation.z = Math.PI / 2;
    };
    if (id === 'sch'){
      for (let k = 0; k < 7; k++) add(new THREE.BoxGeometry(.18, .012, .035), bits, X(.5 + k * .5), H + .01, 0);
      add(new THREE.BoxGeometry(.8, .34, .24), bits, X(len * .52 + .4), H + .17, -.25);
      add(new THREE.CylinderGeometry(.02, .02, .35, 6), dark, X(len * .52 + .55), H + .5, -.25);
    } else if (id === 'lan'){
      turret(.55); turret(len - 1.15);
      add(new THREE.BoxGeometry(.8, .26, .4), bits, X(len * .38 + .4), H + .13, 0);
      add(new THREE.BoxGeometry(.45, .14, .3), bits, X(len * .38 + .35), H + .33, 0);
      add(new THREE.CylinderGeometry(.09, .11, .3, 14), trim, X(len * .38 + 1.05), H + .15, 0);
    } else if (id === 'brk'){
      for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(.58, .26, .4), k === 1 ? trim : bits, X(.35 + k * .78 + .29), H + .13, 0);
    } else if (id === 'sub'){
      const tw = add(new THREE.CylinderGeometry(.17, .17, .24, 20), bits, X(len * .45), H + .12, 0); tw.scale.set(2.2, 1, 1);
      add(new THREE.CylinderGeometry(.018, .018, .28, 6), dark, X(len * .45 + .12), H + .36, 0);
    } else if (id === 'bnc'){
      const wood = M(0x9a6a3c, {metalness:0, roughness:.8});
      add(new THREE.BoxGeometry(.95, .06, .34), wood, X(.9), H + .2, 0);
      add(new THREE.BoxGeometry(.95, .22, .05), wood, X(.9), H + .3, -.16);
      for (const lx of [.5, 1.3]) for (const lz of [-.13, .13]) add(new THREE.BoxGeometry(.05, .18, .05), wood, X(lx), H + .09, lz);
    }
    // flag on a pole; the disc always faces the camera
    const fx = id === 'sch' ? X(len * .6) : X(.45);
    add(new THREE.CylinderGeometry(.018, .018, .62, 6), dark, fx, H + .31, 0);
    const sm = new THREE.SpriteMaterial({map:discTex(style === 'foe' ? 'face' : 'ball')});
    const flag = new THREE.Sprite(sm); flag.scale.setScalar(.52); flag.position.set(fx, H + .74, 0); body.add(flag);
    mats.push(sm); sm.userData.base = new THREE.Color(0xffffff);
    grp.userData = {mats, flag, look:''};
    return grp;
  }
  const pool = new Map();   // key → ship group
  function shipObj(key, id, len, style){
    let s = pool.get(key);
    if (!s || s.userData.style !== style){
      if (s) scene.remove(s);
      s = makeShip(id, len, style); s.userData.style = style;
      pool.set(key, s); scene.add(s);
    }
    s.userData.used = true; s.visible = true;
    return s;
  }
  const RED = new THREE.Color(0xff5a4a), BLACK = new THREE.Color(0x02060f);
  function lookShip(s, {alpha = 1, dark = 0, invalid = false} = {}){
    const look = `${alpha.toFixed(2)}|${dark.toFixed(2)}|${invalid}`;
    if (s.userData.look === look) return;
    s.userData.look = look;
    for (const m of s.userData.mats){
      m.color.copy(m.userData.base);
      if (invalid) m.color.lerp(RED, .65);
      if (dark) m.color.lerp(BLACK, dark);
      m.opacity = alpha;
      if (m.isSpriteMaterial) continue;     // sprites stay transparent so the disc has no box around it
      m.transparent = alpha < 1; m.depthWrite = alpha >= .99;
      m.needsUpdate = true;
    }
    s.userData.flag.visible = dark < .5;
  }
  // place a ship: (ox, oy) is the layout pixel of cell (0,0), c the cell size
  function placeShip(s, sh, ox, oy, c, lift = 0, sink){
    const L = sh.len;
    const cx = ox + (sh.v ? .5 : L / 2) * c + sh.c * c, cz = oy + (sh.v ? L / 2 : .5) * c + sh.r * c;
    s.position.set(cx, lift * c, cz);
    s.scale.setScalar(c);
    s.rotation.set(0, sh.v ? Math.PI / 2 : 0, 0);
    if (sink !== undefined){
      const k = sink;
      s.position.y = -k * .62 * c;
      s.rotation.z = Math.sin(k * 5) * .05 * (1 - k) - k * .28;
    }
  }

  /* ---------- pegs ---------- */
  const pegGeo = {post:new THREE.CylinderGeometry(.08, .1, .5, 12), cap:new THREE.SphereGeometry(.13, 14, 10)};
  const pegMat = {miss:new THREE.MeshStandardMaterial({color:0xe6eefc, roughness:.35}), hit:new THREE.MeshStandardMaterial({color:0xff4b33, roughness:.35, emissive:0xff2a10, emissiveIntensity:.6})};
  function peg(kind){
    const grp = new THREE.Group();
    const a = new THREE.Mesh(pegGeo.post, pegMat[kind]); a.position.y = .05; a.castShadow = true;
    const b = new THREE.Mesh(pegGeo.cap, pegMat[kind]); b.position.y = .32; b.castShadow = true;
    grp.add(a, b); grp.userData.kind = kind; return grp;
  }
  function syncPegs(rec, key, sunkCells, now){
    const arr = api.vis[key], c = rec.c;
    for (const [i, p] of rec.pegs){
      const v = arr[i], want = v === 1 ? 'miss' : v === 2 && !sunkCells.has(i) ? 'hit' : '';
      if (want !== p.userData.kind){ rec.grp.remove(p); rec.pegs.delete(i); }
    }
    for (let i = 0; i < arr.length; i++){
      const v = arr[i]; if (!v) continue;
      const want = v === 1 ? 'miss' : !sunkCells.has(i) ? 'hit' : '';
      if (!want || rec.pegs.has(i)) continue;
      const p = peg(want); p.scale.setScalar(c * (rec.c < 20 ? 1.1 : 1));
      p.position.set((i % 10 + .5) * c, 0, (((i / 10) | 0) + .5) * c);
      p.userData.born = now; rec.grp.add(p); rec.pegs.set(i, p);
    }
    for (const [i, p] of rec.pegs){
      const age = (now - p.userData.born) / 1000;
      const drop = age < .25 ? (1 - age / .25) * c * .8 : 0;
      p.position.y = drop + (reduced ? 0 : Math.sin(now / 520 + i) * c * .02) - c * .04;
    }
  }

  /* ---------- particles ---------- */
  const MAXP = 2600;
  function particleLayer(additive){
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAXP * 3), col = new Float32Array(MAXP * 4), size = new Float32Array(MAXP);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('psize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, blending:additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms:{uScale:{value:600}},
      vertexShader:`
        attribute vec4 pcolor; attribute float psize; uniform float uScale; varying vec4 vC;
        void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = psize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader:`
        varying vec4 vC;
        void main(){ vec2 d = gl_PointCoord - .5; float r = dot(d, d) * 4.; if (r > 1.) discard; float a = vC.a * (1. - r) * (1. - r * .3); gl_FragColor = vec4(vC.rgb, a);
        #include <colorspace_fragment>
        }`
    });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = additive ? 9 : 8;
    scene.add(pts);
    return {pts, geo, pos, col, size, mat, list:[]};
  }
  const glow = particleLayer(true), soot = particleLayer(false);
  const C3 = new THREE.Color();
  function emit(layer, p){ if (layer.list.length < MAXP) layer.list.push(p); }
  // p: {x,y,z, vx,vy,vz, life, t, s, s1, col:[r,g,b] or fn, a0, g (gravity, px/s² as multiple of c), drag, c}
  function stepLayer(L, dt){
    const {list, pos, col, size} = L;
    let n = 0;
    for (let k = list.length - 1; k >= 0; k--){
      const p = list[k];
      p.t += dt;
      if (p.t >= p.life){ list[k] = list[list.length - 1]; list.pop(); continue; }
      if (p.t < 0) continue;
      if (p.g) p.vy -= p.g * dt;
      if (p.drag){ const f = Math.pow(p.drag, dt); p.vx *= f; p.vy *= f; p.vz *= f; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor !== undefined && p.y < p.floor){ p.y = p.floor; if (p.die) { p.t = p.life; } p.vy = 0; p.vx *= .5; p.vz *= .5; }
    }
    for (const p of list){
      if (p.t < 0) continue;
      const k = p.t / p.life;
      pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
      if (p.ramp){ const r = p.ramp(k); C3.setRGB(r[0], r[1], r[2]); } else C3.setRGB(p.col[0], p.col[1], p.col[2]);
      col[n * 4] = C3.r; col[n * 4 + 1] = C3.g; col[n * 4 + 2] = C3.b;
      col[n * 4 + 3] = (p.a0 ?? 1) * (p.fade ? p.fade(k) : 1 - k);
      size[n] = p.s + (p.s1 - p.s) * k;
      n++;
    }
    L.geo.setDrawRange(0, n);
    L.geo.attributes.position.needsUpdate = true; L.geo.attributes.pcolor.needsUpdate = true; L.geo.attributes.psize.needsUpdate = true;
  }
  const fireRamp = k => k < .25 ? [1, .97, .75] : k < .55 ? [1, .62 - (k - .25) * .6, .18] : [.85, .22, .08];
  const smokeFade = k => k < .15 ? k / .15 : 1 - (k - .15) / .85;

  // splash rings on the water
  const ringGeo = new THREE.RingGeometry(.86, 1, 48).rotateX(-Math.PI / 2);
  const rings = [];
  function ring(x, z, c, {r0 = .2, grow = 1, life = .9, color = 0xc8e6ff, delay = 0, y = .03} = {}){
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({color, transparent:true, opacity:.8, depthWrite:false, toneMapped:false}));
    m.position.set(x, y * c, z); m.renderOrder = 6; m.visible = false; scene.add(m);
    rings.push({m, c, r0, grow, life, t:-delay});
  }
  function stepRings(dt){
    for (let k = rings.length - 1; k >= 0; k--){
      const r = rings[k]; r.t += dt;
      if (r.t >= r.life){ scene.remove(r.m); r.m.material.dispose(); rings.splice(k, 1); continue; }
      if (r.t < 0) continue;
      r.m.visible = true;
      const s = (r.r0 + r.grow * r.t) * r.c;
      r.m.scale.set(s, 1, s);
      r.m.material.opacity = .75 * (1 - r.t / r.life);
    }
  }

  const gridOf = key => { const g = api.LY.grids[key]; return g ? {ox:g.x, oy:g.y, c:g.cell} : null; };
  function fxSplash(key, x, y){
    const G = gridOf(key); if (!G) return;
    const {ox, oy, c} = G, wx = ox + x * c, wz = oy + y * c;
    ring(wx, wz, c, {r0:.15, grow:.9}); ring(wx, wz, c, {r0:.1, grow:.6, delay:.12});
    if (reduced) return;
    for (let k = 0; k < 34; k++){
      const a = Math.random() * Math.PI * 2, sp = rnd(.2, 1.4) * c, up = rnd(4.5, 8.5) * c;
      emit(soot, {x:wx + Math.cos(a) * c * .08, y:0, z:wz + Math.sin(a) * c * .08, vx:Math.cos(a) * sp, vy:up, vz:Math.sin(a) * sp, g:16 * c, life:rnd(.6, 1), t:0, s:rnd(.1, .2) * c, s1:rnd(.05, .12) * c, col:Math.random() < .5 ? [.92, .96, 1] : [.6, .8, 1], a0:.95, floor:0, die:true});
    }
    for (let k = 0; k < 8; k++) emit(soot, {x:wx + rnd(-.2, .2) * c, y:c * .2, z:wz + rnd(-.2, .2) * c, vx:rnd(-.3, .3) * c, vy:rnd(.6, 1.4) * c, vz:rnd(-.3, .3) * c, life:rnd(.8, 1.3), t:0, s:.5 * c, s1:1.2 * c, col:[.85, .92, 1], a0:.35, fade:smokeFade});
  }
  function fxBoom(key, x, y, big){
    const G = gridOf(key); if (!G) return;
    const {ox, oy, c} = G, wx = ox + x * c, wz = oy + y * c;
    emit(glow, {x:wx, y:c * .35, z:wz, vx:0, vy:0, vz:0, life:.32, t:0, s:(big ? 3.2 : 2.3) * c, s1:(big ? 4 : 3) * c, col:[1, .85, .5], a0:1});
    emit(glow, {x:wx, y:c * .4, z:wz, vx:0, vy:c * .5, vz:0, life:.5, t:0, s:1.4 * c, s1:2.2 * c, ramp:fireRamp, a0:.9});
    ring(wx, wz, c, {r0:.2, grow:1.2, life:.6, color:0xffbe6e});
    if (reduced) return;
    const n = big ? 46 : 30;
    for (let k = 0; k < n; k++){
      const a = Math.random() * Math.PI * 2, sp = rnd(1, big ? 5 : 3.6) * c;
      emit(glow, {x:wx, y:c * .3, z:wz, vx:Math.cos(a) * sp, vy:rnd(1.5, 6) * c, vz:Math.sin(a) * sp, g:9 * c, drag:.25, life:rnd(.35, .8), t:0, s:rnd(.08, .16) * c, s1:.03 * c, ramp:fireRamp, a0:1});
    }
    for (let k = 0; k < 9; k++){
      const a = Math.random() * Math.PI * 2, sp = rnd(.8, 2.4) * c;
      emit(soot, {x:wx, y:c * .3, z:wz, vx:Math.cos(a) * sp, vy:rnd(3, 6) * c, vz:Math.sin(a) * sp, g:14 * c, life:rnd(.6, 1), t:0, s:.12 * c, s1:.1 * c, col:[.1, .11, .14], a0:1, floor:0, die:true});
    }
    for (let k = 0; k < 6; k++) emit(soot, {x:wx + rnd(-.2, .2) * c, y:c * .4, z:wz + rnd(-.2, .2) * c, vx:rnd(-.2, .2) * c, vy:rnd(.8, 1.5) * c, vz:rnd(-.2, .2) * c, life:rnd(1.4, 2.2), t:-rnd(0, .2), s:.5 * c, s1:1.6 * c, col:[.16, .17, .21], a0:.7, fade:smokeFade});
  }
  function fxSink(key, sh){
    const G = gridOf(key); if (!G) return;
    const {ox, oy, c} = G;
    const mx = ox + (sh.c + (sh.v ? .5 : sh.len / 2)) * c, mz = oy + (sh.r + (sh.v ? sh.len / 2 : .5)) * c;
    for (let k = 0; k < 3; k++) ring(mx, mz, c, {r0:sh.len * .35, grow:1.4, life:1.3, delay:.3 + k * .26});
    if (reduced) return;
    const cells = cellsOf(sh.r, sh.c, sh.v, sh.len);
    for (let k = 0; k < 40; k++){
      const i = cells[(Math.random() * cells.length) | 0];
      emit(soot, {x:ox + (i % 10 + rnd(.2, .8)) * c, y:0, z:oy + (((i / 10) | 0) + rnd(.2, .8)) * c, vx:0, vy:rnd(.3, .9) * c, vz:0, life:rnd(.5, 1), t:-rnd(.3, 1.6), s:rnd(.06, .14) * c, s1:.02 * c, col:[.85, .95, 1], a0:.9});
    }
  }
  // fire + smoke on burning squares
  let emitAcc = 0;
  function burn(dt){
    if (reduced) return;
    emitAcc += dt;
    const steps = Math.min(4, Math.floor(emitAcc / .05)); if (!steps) return;
    emitAcc -= steps * .05;
    for (const key of ['me', 'foe']){
      const rec = grids[key]; if (!rec) continue;
      const arr = api.vis[key], c = rec.c;
      const sunk = sunkSet(key);
      for (let i = 0; i < arr.length; i++){
        if (arr[i] !== 2) continue;
        const wx = rec.x + (i % 10 + .5) * c, wz = rec.y + (((i / 10) | 0) + .5) * c;
        const s = sunk.has(i);
        for (let k = 0; k < steps; k++){
          if (!s){
            emit(glow, {x:wx + rnd(-.12, .12) * c, y:c * .25, z:wz + rnd(-.12, .12) * c, vx:rnd(-.1, .1) * c, vy:rnd(1, 1.8) * c, vz:rnd(-.1, .1) * c, life:rnd(.35, .6), t:0, s:rnd(.32, .45) * c, s1:.08 * c, ramp:fireRamp, a0:.85});
            if (Math.random() < .3) emit(soot, {x:wx, y:c * .55, z:wz, vx:rnd(.1, .3) * c, vy:rnd(.8, 1.3) * c, vz:rnd(-.1, .1) * c, life:rnd(1.3, 2), t:0, s:.25 * c, s1:1.1 * c, col:[.14, .15, .18], a0:.55, fade:smokeFade});
          } else if (Math.random() < .04) emit(soot, {x:wx, y:0, z:wz, vx:rnd(.05, .2) * c, vy:rnd(.4, .8) * c, vz:0, life:rnd(1.5, 2.2), t:0, s:.25 * c, s1:.9 * c, col:[.5, .54, .6], a0:.3, fade:smokeFade});
        }
      }
    }
  }
  function sunkSet(key){
    const s = new Set();
    for (const [, v] of api.vis.sunk[key]) for (const i of cellsOf(v.sh.r, v.sh.c, v.sh.v, v.sh.len)) s.add(i);
    return s;
  }

  /* ---------- shells ---------- */
  const shellGeo = new THREE.SphereGeometry(1, 14, 10);
  const shellMat = new THREE.MeshStandardMaterial({color:0x20283a, roughness:.3, metalness:.6});
  const shellMeshes = [];
  const targetRings = [];
  function drawShells(dt){
    const list = api.shells.filter(s => !s.done);
    while (shellMeshes.length < list.length){ const m = new THREE.Mesh(shellGeo, shellMat); m.castShadow = true; scene.add(m); shellMeshes.push(m); }
    while (targetRings.length < list.length){ const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, depthWrite:false, toneMapped:false})); m.renderOrder = 6; scene.add(m); targetRings.push(m); }
    shellMeshes.forEach((m, k) => m.visible = k < list.length);
    targetRings.forEach((m, k) => m.visible = k < list.length);
    list.forEach((s, k) => {
      const G = gridOf(s.key); if (!G){ shellMeshes[k].visible = targetRings[k].visible = false; return; }
      const {ox, oy, c} = G;
      const p = clamp((api.gt - s.t0) / s.dur, 0, 1);
      const tx = ox + (s.i % 10 + .5) * c, tz = oy + (((s.i / 10) | 0) + .5) * c;
      // lob in from the shooter's side
      const dir = s.key === 'foe' ? -1 : 1;
      const sx = tx + dir * c * 5, sz = tz + c * 3.5, sy = c * 9;
      const x = sx + (tx - sx) * p, z = sz + (tz - sz) * p;
      const y = sy * (1 - p) * (1 - p) + Math.sin(p * Math.PI) * c * 2.4 * (1 - p) + c * .1;
      const m = shellMeshes[k]; m.position.set(x, y, z); m.scale.setScalar(c * .14);
      if (!reduced && Math.random() < .9) emit(glow, {x, y, z, vx:0, vy:0, vz:0, life:.28, t:0, s:.32 * c, s1:.05 * c, col:[1, .78, .45], a0:.7});
      const r = targetRings[k], rr = c * (.55 - p * .3);
      r.position.set(tx, c * .08, tz); r.scale.set(rr, 1, rr); r.material.opacity = .25 + p * .6;
    });
  }

  /* ---------- camera fit ---------- */
  let W = 1, H = 1, layoutKey = '';
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const PITCH = 60 * Math.PI / 180;
  const v3 = new THREE.Vector3();
  function contentBox(){
    const LY = api.LY;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const add = (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); };
    for (const key of ['me', 'foe']){
      const g = LY.grids[key]; if (!g) continue;
      const S = g.cell * 10;
      add(g.x - g.lab - 6, g.y - g.lab - g.hd - 6, g.x + S + (g.big ? 6 : 110), g.y + S + (g.big ? (api.state === 'setup' || api.state === 'menu' ? 8 : 44) : 8));
    }
    if (LY.tray && (api.state === 'setup' || api.state === 'menu')){
      const T = LY.tray;
      add(T.x - 4, T.y - 24, T.x + T.w + 4, LY.phone ? Math.max(...LY.slots.map(s => s.y + s.tc)) + 26 : T.y + T.h + 38);
    }
    if (x0 > x1) add(0, 0, W, H);
    return {x0, y0, x1, y1};
  }
  function fit(){
    const LY = api.LY, B = contentBox();
    const top = LY.phone ? 62 : 78, bottom = LY.phone ? 146 : 100;
    const right = api.chatW || 0;
    // where on screen the content may go
    const R = {x0:8, y0:top - 10, x1:W - right - 8, y1:H - bottom + 6};
    const rw = (R.x1 - R.x0) / W * 2, rh = (R.y1 - R.y0) / H * 2;
    const rcx = ((R.x0 + R.x1) / W) - 1, rcy = 1 - ((R.y0 + R.y1) / H);
    const tgt = new THREE.Vector3((B.x0 + B.x1) / 2, 0, (B.y0 + B.y1) / 2);
    const dir = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
    const pts = [];
    for (const x of [B.x0, B.x1]) for (const z of [B.y0, B.y1]) for (const y of [-.0, 40]) pts.push(new THREE.Vector3(x, y, z));
    camera.aspect = W / H; camera.clearViewOffset();
    let dist = Math.max(B.x1 - B.x0, B.y1 - B.y0) * 2;
    let cx = 0, cy = 0;
    for (let it = 0; it < 8; it++){
      camera.position.copy(tgt).addScaledVector(dir, dist); camera.lookAt(tgt);
      camera.near = dist * .05; camera.far = dist * 6;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
      for (const p of pts){ v3.copy(p).project(camera); a = Math.min(a, v3.x); b = Math.max(b, v3.x); c = Math.min(c, v3.y); d = Math.max(d, v3.y); }
      const k = Math.max((b - a) / rw, (d - c) / rh);
      cx = (a + b) / 2; cy = (c + d) / 2;
      dist *= k;
    }
    const P = camera.projectionMatrix.elements;
    P[8] += cx - rcx; P[9] += cy - rcy;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.userData.base = camera.position.clone();
    // sun + shadow box follow the content
    const span = Math.max(B.x1 - B.x0, B.y1 - B.y0) * .75 + 80;
    sun.target.position.copy(tgt);
    sun.position.copy(tgt).addScaledVector(SUN_DIR, span * 2.5);
    Object.assign(sun.shadow.camera, {left:-span, right:span, top:span, bottom:-span, near:10, far:span * 6});
    sun.shadow.camera.updateProjectionMatrix();
    const ps = particlesScale();
    glow.mat.uniforms.uScale.value = soot.mat.uniforms.uScale.value = ps;
  }
  function particlesScale(){ return H * renderer.getPixelRatio() * camera.projectionMatrix.elements[5] / 2; }
  function resize(){
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    flatMesh.scale.set(W, 1, H); flatMesh.position.set(W / 2, 0, H / 2);
    shadowMesh.scale.set(W * 3, 1, H * 3); shadowMesh.position.set(W / 2, -.5, H / 2);
    layoutKey = '';
  }
  function toLayout(clientX, clientY){
    const r = cvs.getBoundingClientRect();
    ndc.set((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hit)) return [-99999, -99999];
    return [hit.x, hit.z];
  }

  // layout pixel → client (page) pixel, for test hooks
  function toClient(x, y){
    const r = cvs.getBoundingClientRect();
    v3.set(x, 0, y).project(camera);
    return [r.left + (v3.x + 1) / 2 * r.width, r.top + (1 - v3.y) / 2 * r.height];
  }

  /* ---------- per frame ---------- */
  let last = performance.now();
  const shakeV = new THREE.Vector3();
  function render(now, flatChanged){
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const LY = api.LY, st = api.state;
    const lk = JSON.stringify([W, H, st === 'setup' || st === 'menu', api.chatW, ...['me', 'foe'].map(k => LY.grids[k] ? [LY.grids[k].x, LY.grids[k].y, LY.grids[k].cell] : 0)]);
    if (lk !== layoutKey){ layoutKey = lk; fit(); }
    if (flatChanged) flatTex.needsUpdate = true;

    // grids
    for (const key of ['me', 'foe']){ const g = LY.grids[key]; if (g) buildGrid(key, g); else dropGrid(key); }
    for (const key of ['me', 'foe']){
      const rec = grids[key]; if (!rec) continue;
      const u = rec.water.material.uniforms;
      u.uTime.value = reduced ? 0 : now / 1000; u.uCam.value.copy(camera.position);
      u.uActive.value = st === 'play' && ((key === 'foe' && api.turn === 'me') || (key === 'me' && api.turn === 'foe')) ? 1 : 0;
      syncPegs(rec, key, sunkSet(key), now);
    }

    // ships
    for (const s of pool.values()) s.userData.used = false;
    const gt = api.gt;
    const gm = LY.grids.me, gf = LY.grids.foe;
    if (gm){
      if (st === 'setup' || st === 'menu'){
        const sel = api.setupShips[api.sel];
        for (const s of api.setupShips){
          if (!s.placed || (api.drag && api.drag.ship === s)) continue;
          const o3 = shipObj('m:' + s.id, s.id, s.len, 'mine');
          const lift = s === sel && !api.drag && st === 'setup' ? .35 + Math.sin(now / 300) * .05 : 0;
          placeShip(o3, s, gm.x, gm.y, gm.cell, lift); lookShip(o3);
        }
      } else if (api.my){
        for (const s of api.my.ships){
          const o3 = shipObj('m:' + s.id, s.id, s.len, 'mine');
          const sk = api.vis.sunk.me.get(s.id);
          if (sk){ const k = clamp((gt - sk.t0) / SINK_MS, 0, 1); placeShip(o3, s, gm.x, gm.y, gm.cell, 0, k); lookShip(o3, {dark:k * .7, alpha:k < 1 ? 1 : .85}); }
          else { placeShip(o3, s, gm.x, gm.y, gm.cell); lookShip(o3); }
        }
      }
    }
    if (gf){
      for (const [id, v] of api.vis.sunk.foe){
        const o3 = shipObj('f:' + id, id, v.sh.len, 'foe');
        const k = clamp((gt - v.t0) / SINK_MS, 0, 1);
        placeShip(o3, v.sh, gf.x, gf.y, gf.cell, 0, k); lookShip(o3, {dark:k * .7, alpha:k < 1 ? 1 : .85});
      }
      if (st === 'over' && api.foeReveal){
        for (const s of api.foeReveal){
          if (api.vis.sunk.foe.has(s.id)) continue;
          const o3 = shipObj('f:' + s.id, s.id, s.len, 'foe');
          placeShip(o3, s, gf.x, gf.y, gf.cell); lookShip(o3, {alpha:.7});
        }
      }
    }
    // tray + the ship being dragged
    if (st === 'setup' && LY.tray){
      const sel = api.setupShips[api.sel];
      for (const sl of LY.slots){
        const s = api.setupShips.find(q => q.id === sl.id);
        if (s.placed || (api.drag && api.drag.ship === s)) continue;
        const o3 = shipObj('t:' + s.id, s.id, s.len, 'mine');
        placeShip(o3, {len:s.len, r:0, c:0, v:false}, sl.x, sl.y, sl.tc, s === sel ? .3 + Math.sin(now / 300) * .05 : .02); lookShip(o3);
      }
      const d = api.drag;
      if (d && d.moved && gm){
        const s = d.ship, o3 = shipObj('d:' + s.id, s.id, s.len, 'mine');
        if (d.cand && d.cand.inb){ placeShip(o3, {len:s.len, r:d.cand.r, c:d.cand.c, v:s.v}, gm.x, gm.y, gm.cell, .45); lookShip(o3, {invalid:!d.cand.ok}); }
        else {
          const c = gm.cell;
          placeShip(o3, {len:s.len, r:0, c:0, v:s.v}, d.px - (s.v ? .5 : d.k + .5) * c, d.py - (s.v ? d.k + .5 : .5) * c, c, .7); lookShip(o3);
        }
      }
    }
    for (const s of pool.values()) if (!s.userData.used) s.visible = false;

    if (!api.paused){
      drawShells(dt);
      burn(dt);
      stepLayer(glow, dt); stepLayer(soot, dt); stepRings(dt);
    }
    // camera shake
    const base = camera.userData.base;
    if (base){
      const k = reduced ? 0 : api.shake;
      if (k > .3){ shakeV.set(rnd(-1, 1), rnd(-.5, .5), rnd(-1, 1)).multiplyScalar(k * .9); camera.position.copy(base).add(shakeV); }
      else camera.position.copy(base);
      camera.updateMatrixWorld();
    }
    renderer.render(scene, camera);
  }

  new ResizeObserver(() => resize()).observe(host);
  resize();

  return {
    render, resize, toLayout, toClient,
    fx(kind, key, a, b, c){ try { if (kind === 'splash') fxSplash(key, a, b); else if (kind === 'boom') fxBoom(key, a, b, c); else if (kind === 'sink') fxSink(key, a); } catch(e){ console.warn(e); } },
    clear(){ glow.list.length = 0; soot.list.length = 0; for (const r of rings) scene.remove(r.m); rings.length = 0; for (const k of ['me', 'foe']) if (grids[k]){ for (const p of grids[k].pegs.values()) grids[k].grp.remove(p); grids[k].pegs.clear(); } },
    get canvas(){ return cvs; },
    dispose(){ renderer.dispose(); cvs.remove(); }
  };
}
