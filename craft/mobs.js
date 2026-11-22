/* BDB Craft: everything that walks about. Animals graze and wander and run when hit; villagers keep to their villages; when it gets dark (and the
   setting is on) zombies, skeletons, creepers and spiders come out, chase whoever is near, hit them, shoot arrows or blow up; endermen leave you
   alone unless you hit them. Everything has health and shows a bar over its head when hurt. Built from boxes with little pixel faces drawn here.
   In a shared world only the host runs them and sends where they are; friends draw them and send their hits to the host. */
import * as THREE from '../chess/vendor/three.module.min.js?v=c22';
import { B, SOLID, LIQUID, OPAQUE } from './blocks.js?v=c22';

/* ---------- looks ---------- */
function pic(w, h, fill){ const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = fill; x.fillRect(0, 0, w, h); return {c, px(a, b, col, ww = 1, hh = 1){ x.fillStyle = col; x.fillRect(a, b, ww, hh); }}; }
const tex = p => { const t = new THREE.CanvasTexture(p.c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; };
const M = c => new THREE.MeshLambertMaterial(typeof c === 'string' ? {color:new THREE.Color(c)} : {map:tex(c)});
const speckle = (base, dots, n = 10, w = 8, h = 8) => { const p = pic(w, h, base); for (let i = 0; i < n; i++) p.px((i * 5 + 3) % w, (i * 3 + 1) % h, dots[i % dots.length]); return p; };
const faceOf = (base, eye, opts = {}) => { const p = pic(8, 8, base); p.px(1, 3, opts.white || eye); p.px(2, 3, eye); p.px(5, 3, eye); p.px(6, 3, opts.white || eye); if (opts.mouth) p.px(2, 6, opts.mouth, 4, 1); if (opts.nose) p.px(3, 5, opts.nose, 2, 1); if (opts.brow) { p.px(1, 2, opts.brow, 2, 1); p.px(5, 2, opts.brow, 2, 1); } return p; };
// a kind: body parts as boxes [w, h, d, x, y, z, material key, part], plus size, speed, health, what it does
const KINDS = {};
function kind(name, def){ KINDS[name] = def; }
const quad = (legH, w, len, legW, mat) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b], i) => ({leg:i, box:[legW, legH, legW, a * (w / 2 - legW / 2), legH / 2, b * (len / 2 - legW / 2)], mat}));
kind('cow', {mats:() => ({hide:M(speckle('#f2efe8', ['#2a2522', '#2a2522'], 14)), face:M(faceOf('#f2efe8', '#111', {nose:'#d9a6a0'})), leg:M('#2a2522'), horn:M('#d9d3c0')}),
  parts:[{box:[.9, .9, 1.3, 0, 1.05, 0], mat:'hide'}, {head:1, box:[.55, .55, .45, 0, 1.3, .8], mat:'hide', face:'face'}, ...quad(.6, .9, 1.3, .26, 'leg')], speed:1.4, hp:10, h:1.4, w:.9});
kind('pig', {mats:() => ({skin:M('#eda7a6'), face:M(faceOf('#eda7a6', '#111', {nose:'#c76f6e'})), leg:M('#d98d8c')}), parts:[{box:[.62, .55, 1, 0, .62, 0], mat:'skin'}, {head:1, box:[.5, .5, .45, 0, .75, .65], mat:'skin', face:'face'}, ...quad(.35, .62, 1, .22, 'leg')], speed:1.5, hp:10, h:.9, w:.7});
kind('sheep', {mats:() => ({wool:M(speckle('#efece6', ['#dcd8cf'], 12)), face:M(faceOf('#cdbba8', '#111')), leg:M('#cdbba8')}), parts:[{box:[.8, .75, 1.15, 0, .95, 0], mat:'wool'}, {head:1, box:[.42, .42, .42, 0, 1.15, .7], mat:'wool', face:'face'}, ...quad(.55, .8, 1.15, .22, 'leg')], speed:1.3, hp:8, h:1.3, w:.8});
kind('chicken', {mats:() => ({body:M('#fbfbf7'), face:M(faceOf('#fbfbf7', '#111', {nose:'#f0a12e'})), leg:M('#f0a12e'), comb:M('#d12b2b')}),
  parts:[{box:[.38, .38, .48, 0, .5, 0], mat:'body'}, {head:1, box:[.28, .34, .25, 0, .82, .22], mat:'body', face:'face'}, {box:[.08, .1, .1, 0, .98, .3], mat:'comb', head:1}, {leg:0, box:[.06, .3, .06, -.08, .15, 0], mat:'leg'}, {leg:3, box:[.06, .3, .06, .08, .15, 0], mat:'leg'}], speed:1.8, hp:4, h:.8, w:.4});
kind('horse', {mats:() => ({coat:M(speckle('#8a5a32', ['#7a4d2a'], 10)), face:M(faceOf('#8a5a32', '#111')), mane:M('#3a2614'), leg:M('#6e4626')}),
  parts:[{box:[.7, .7, 1.5, 0, 1.25, 0], mat:'coat'}, {head:1, box:[.4, .5, .7, 0, 1.85, .9], mat:'coat', face:'face'}, {box:[.12, .5, .7, 0, 1.75, .55], mat:'mane'}, ...quad(.9, .7, 1.5, .24, 'leg')], speed:2.6, hp:20, h:1.9, w:.9});
kind('rabbit', {mats:() => ({fur:M('#b0906a'), face:M(faceOf('#b0906a', '#111', {nose:'#e8a0a0'})), ear:M('#c9a882')}),
  parts:[{box:[.3, .3, .4, 0, .25, 0], mat:'fur'}, {head:1, box:[.26, .26, .26, 0, .42, .22], mat:'fur', face:'face'}, {head:1, box:[.06, .22, .04, -.06, .66, .2], mat:'ear'}, {head:1, box:[.06, .22, .04, .06, .66, .2], mat:'ear'}], speed:2.4, hp:3, h:.5, w:.4, hop:true});
kind('wolf', {mats:() => ({fur:M(speckle('#d8d4cf', ['#c4c0ba'], 8)), face:M(faceOf('#d8d4cf', '#111', {nose:'#222'})), leg:M('#c4c0ba')}),
  parts:[{box:[.4, .4, .9, 0, .62, 0], mat:'fur'}, {head:1, box:[.4, .4, .4, 0, .75, .6], mat:'fur', face:'face'}, ...quad(.42, .4, .9, .14, 'leg')], speed:2.2, hp:8, h:.85, w:.6});
kind('fox', {mats:() => ({fur:M('#e07a2a'), face:M(faceOf('#e07a2a', '#111', {nose:'#222', mouth:'#f2f2f2'})), leg:M('#3a2a1a'), tail:M('#f2f2f2')}),
  parts:[{box:[.34, .32, .7, 0, .45, 0], mat:'fur'}, {head:1, box:[.36, .3, .3, 0, .55, .45], mat:'fur', face:'face'}, {box:[.18, .18, .45, 0, .45, -.55], mat:'tail'}, ...quad(.3, .34, .7, .1, 'leg')], speed:2.3, hp:8, h:.7, w:.5});
kind('cat', {mats:() => ({fur:M(speckle('#e3c48a', ['#c9a060'], 10)), face:M(faceOf('#e3c48a', '#2a8a2a', {nose:'#e89090'})), leg:M('#c9a060')}),
  parts:[{box:[.3, .3, .7, 0, .45, 0], mat:'fur'}, {head:1, box:[.32, .3, .3, 0, .55, .45], mat:'fur', face:'face'}, {box:[.08, .08, .5, 0, .55, -.55], mat:'fur'}, ...quad(.3, .3, .7, .1, 'leg')], speed:2, hp:8, h:.7, w:.45});
kind('goat', {mats:() => ({fur:M('#e8e4dc'), face:M(faceOf('#e8e4dc', '#111')), leg:M('#d8d0c4'), horn:M('#8a8070')}),
  parts:[{box:[.6, .6, 1, 0, .95, 0], mat:'fur'}, {head:1, box:[.36, .4, .5, 0, 1.2, .6], mat:'fur', face:'face'}, {head:1, box:[.08, .25, .08, -.12, 1.5, .5], mat:'horn'}, {head:1, box:[.08, .25, .08, .12, 1.5, .5], mat:'horn'}, ...quad(.65, .6, 1, .2, 'leg')], speed:1.6, hp:10, h:1.3, w:.8});
kind('llama', {mats:() => ({fur:M(speckle('#e8dcc0', ['#d8ccb0'], 10)), face:M(faceOf('#e8dcc0', '#111')), leg:M('#d8ccb0')}),
  parts:[{box:[.7, .7, 1.1, 0, 1.15, 0], mat:'fur'}, {head:1, box:[.36, .9, .36, 0, 1.75, .55], mat:'fur', face:'face'}, ...quad(.8, .7, 1.1, .22, 'leg')], speed:1.5, hp:15, h:1.9, w:.9});
// villagers: a robe, a big nose, folded arms
kind('villager', {mats:() => ({robe:M(speckle('#7a5034', ['#6a4428'], 8, 8, 12)), skin:M('#c99a72'), face:M(faceOf('#c99a72', '#2a7a2a', {white:'#f2f2f2', brow:'#4a3020'})), nose:M('#b08060')}),
  parts:[{box:[.5, 1.1, .32, 0, .55, 0], mat:'robe'}, {box:[.62, .2, .3, 0, 1.0, .15], mat:'robe'}, {head:1, box:[.48, .58, .48, 0, 1.4, 0], mat:'skin', face:'face'}, {head:1, box:[.1, .22, .12, 0, 1.3, .29], mat:'nose'}], speed:1.1, hp:20, h:1.95, w:.6, biped:false});
// monsters
const zombieM = () => ({skin:M('#5a8a4a'), face:M(faceOf('#5a8a4a', '#1a1a1a', {mouth:'#2a3a20'})), shirt:M('#2a8aa8'), pants:M('#3a3a8a')});
const biped = (head, body, arm, leg) => [{head:1, box:[.5, .5, .5, 0, 1.75, 0], mat:head, face:'face'}, {box:[.5, .75, .26, 0, 1.13, 0], mat:body}, {arm:0, box:[.24, .74, .24, -.37, 1.13, 0], mat:arm}, {arm:1, box:[.24, .74, .24, .37, 1.13, 0], mat:arm}, {leg:0, box:[.25, .76, .25, -.125, .38, 0], mat:leg}, {leg:3, box:[.25, .76, .25, .125, .38, 0], mat:leg}];
kind('zombie', {mats:zombieM, parts:biped('skin', 'shirt', 'skin', 'pants'), speed:1.7, hp:20, h:1.95, w:.6, hostile:true, melee:3, armsOut:true, burns:true});
kind('husk', {mats:() => ({skin:M('#9a8a5a'), face:M(faceOf('#9a8a5a', '#1a1a1a', {mouth:'#5a4a2a'})), shirt:M('#7a6a4a'), pants:M('#5a4a3a')}), parts:biped('skin', 'shirt', 'skin', 'pants'), speed:1.7, hp:20, h:1.95, w:.6, hostile:true, melee:3, armsOut:true});
kind('skeleton', {mats:() => ({bone:M('#d8d8d0'), face:M(faceOf('#d8d8d0', '#1a1a1a', {mouth:'#3a3a3a', white:'#1a1a1a'})), rib:M(speckle('#c8c8c0', ['#3a3a3a'], 10, 8, 12))}),
  parts:biped('bone', 'rib', 'bone', 'bone').map(p => p.arm !== undefined || p.leg !== undefined ? {...p, box:[.12, p.box[1], .12, p.box[3] * (p.arm !== undefined ? .85 : 1), p.box[4], 0]} : p), speed:1.6, hp:20, h:1.95, w:.6, hostile:true, shoots:true, burns:true});
kind('creeper', {mats:() => ({skin:M(speckle('#5aa84a', ['#3a8a2a', '#7ac46a', '#2a6a1a'], 26, 8, 8)), face:M((() => { const p = speckle('#5aa84a', ['#3a8a2a', '#7ac46a'], 12); p.px(1, 2, '#111', 2, 2); p.px(5, 2, '#111', 2, 2); p.px(3, 4, '#111', 2, 3); p.px(2, 5, '#111', 1, 3); p.px(5, 5, '#111', 1, 3); return p; })())}),
  parts:[{head:1, box:[.5, .5, .5, 0, 1.45, 0], mat:'skin', face:'face'}, {box:[.5, .8, .3, 0, .82, 0], mat:'skin'}, ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b], i) => ({leg:i, box:[.22, .42, .22, a * .14, .21, b * .22], mat:'skin'}))], speed:1.5, hp:20, h:1.7, w:.6, hostile:true, explodes:true});
kind('spider', {mats:() => ({body:M(speckle('#3a3230', ['#2a2220'], 12)), face:M((() => { const p = pic(8, 8, '#3a3230'); for (const [x, y] of [[1, 3], [2, 2], [5, 2], [6, 3], [3, 4], [4, 4]]) p.px(x, y, '#d82a2a'); return p; })()), leg:M('#2a2220')}),
  parts:[{box:[.9, .55, .9, 0, .5, -.3], mat:'body'}, {head:1, box:[.55, .5, .5, 0, .5, .4], mat:'body', face:'face'}, ...[0, 1, 2, 3].flatMap(i => [-1, 1].map(s => ({leg:i % 2 ? 0 : 3, box:[1.1, .08, .08, s * .7, .45, -.3 + (i - 1.5) * .2], mat:'leg'})))], speed:2.6, hp:16, h:.9, w:1.3, hostile:true, melee:2});
kind('enderman', {mats:() => ({skin:M('#141218'), face:M((() => { const p = pic(8, 8, '#141218'); p.px(1, 4, '#d872f0', 2, 1); p.px(5, 4, '#d872f0', 2, 1); return p; })())}),
  parts:[{head:1, box:[.5, .5, .5, 0, 2.75, 0], mat:'skin', face:'face'}, {box:[.5, .75, .26, 0, 2.1, 0], mat:'skin'}, {arm:0, box:[.12, 1.5, .12, -.31, 1.95, 0], mat:'skin'}, {arm:1, box:[.12, 1.5, .12, .31, 1.95, 0], mat:'skin'}, {leg:0, box:[.12, 1.7, .12, -.125, .85, 0], mat:'skin'}, {leg:3, box:[.12, 1.7, .12, .125, .85, 0], mat:'skin'}], speed:2.2, hp:40, h:2.9, w:.6, neutral:true, melee:5});
export const PASSIVE = ['cow', 'pig', 'sheep', 'chicken', 'horse', 'rabbit', 'wolf', 'fox', 'cat', 'goat', 'llama'];
export const HOSTILE = ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'husk'];
export const ALL = [...PASSIVE, 'villager', ...HOSTILE];
export const KIND_NAMES = {cow:'Cow', pig:'Pig', sheep:'Sheep', chicken:'Chicken', horse:'Horse', rabbit:'Rabbit', wolf:'Wolf', fox:'Fox', cat:'Cat', goat:'Goat', llama:'Llama', villager:'Villager', zombie:'Zombie', skeleton:'Skeleton', creeper:'Creeper', spider:'Spider', enderman:'Enderman', husk:'Husk'};
const matCache = {};
function model(k){
  const K = KINDS[k], mats = matCache[k] || (matCache[k] = K.mats()), g = new THREE.Group(), head = new THREE.Group(), legs = [], arms = [];
  const hp = K.parts.find(p => p.head); head.position.set(0, hp.box[4], hp.box[5]); g.add(head);
  for (const p of K.parts){
    const [w, h, d, x, y, z] = p.box, mat = mats[p.mat];
    const mm = p.face ? [mat, mat, mat, mat, mats[p.face], mat] : mat;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mm);
    if (p.head){ m.position.set(x, y - hp.box[4], z - hp.box[5]); head.add(m); }
    else if (p.leg !== undefined || p.arm !== undefined){ const piv = new THREE.Group(); piv.position.set(x, y + h / 2, z); m.position.set(0, -h / 2, 0); piv.add(m); g.add(piv); (p.leg !== undefined ? legs : arms).push({piv, i:p.leg ?? p.arm, side:Math.sign(x) || 1}); }
    else { m.position.set(x, y, z); g.add(m); }
  }
  // a health bar, shown for a while after a hit
  const c = document.createElement('canvas'); c.width = 64; c.height = 8; const bar = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c), depthTest:false, transparent:true})); bar.scale.set(.9, .11, 1); bar.position.y = K.h + .35; bar.visible = false; bar.renderOrder = 6; g.add(bar);
  return {g, head, legs, arms, bar, barC:c, K};
}

/* ---------- the herd ---------- */
export function createMobs(scene, world, opts){
  const list = new Map(), arrows = []; let nid = 1, spawnT = 0, hostT = 0;
  const groundAt = (x, z, y0) => {
    for (let y = Math.min(127, Math.floor(y0) + 2); y > Math.floor(y0) - 5; y--){ const b = world.get(x, y - 1, z); if (b < 0) return null; if (b > 0 && SOLID[b]) { const a1 = world.get(x, y, z), a2 = world.get(x, y + 1, z); return (a1 <= 0 || !SOLID[a1]) && (a2 <= 0 || !SOLID[a2]) ? y : null; } }
    return null;
  };
  function add(k, x, y, z, id){
    const m = model(k); m.g.position.set(x, y, z); scene.add(m.g);
    const a = {id:id || nid++, kind:k, K:KINDS[k], x, y, z, ty:y, vy:0, yaw:Math.random() * 6.28, m, t:Math.random() * 3, go:0, run:0, walk:0, hp:KINDS[k].hp, hurtT:0, barT:0, cool:0, fuse:0, angry:false, home:null};
    list.set(a.id, a); return a;
  }
  function remove(a, poof){ scene.remove(a.m.g); list.delete(a.id); if (poof && opts.poof) opts.poof(a.x, a.y + a.K.h / 2, a.z); }
  function drawBar(a){ const c = a.m.barC, x = c.getContext('2d'), f = Math.max(0, a.hp / a.K.hp); x.clearRect(0, 0, 64, 8); x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(0, 0, 64, 8); x.fillStyle = f > .5 ? '#4ade80' : f > .25 ? '#f2c14e' : '#ff5a4a'; x.fillRect(1, 1, 62 * f, 6); a.m.bar.material.map.needsUpdate = true; a.m.bar.visible = true; a.barT = 4; }
  /* a hit: from a player (dmg) or an explosion. Animals run, endermen and wolves get angry, the dead go up in smoke */
  function hurt(a, dmg, from){
    a.hp -= dmg; a.hurtT = .35; drawBar(a);
    if (from){ const dx = a.x - from.x, dz = a.z - from.z, d = Math.hypot(dx, dz) || 1; a.kx = dx / d * 6; a.kz = dz / d * 6; a.vy = 5; }
    if (!a.K.hostile){ a.run = 3; if (from) a.yaw = Math.atan2(a.x - from.x, a.z - from.z); }
    if (a.K.neutral || a.kind === 'wolf') a.angry = true;
    if (a.kind === 'enderman' && Math.random() < .6) teleport(a);
    if (a.hp <= 0) remove(a, true);
  }
  function teleport(a){ for (let i = 0; i < 12; i++){ const x = Math.floor(a.x + (Math.random() - .5) * 24), z = Math.floor(a.z + (Math.random() - .5) * 24), y = groundAt(x, z, a.y + 6); if (y != null){ a.x = x + .5; a.z = z + .5; a.y = a.ty = y; return; } } }
  /* the host: spawn, think, move */
  function think(dt, people, env){
    const p0 = people[0]; spawnT -= dt; hostT -= dt;
    if (spawnT <= 0 && p0){
      spawnT = .6;
      for (const a of list.values()) if (!people.some(p => Math.hypot(p.x - a.x, p.z - a.z) < (a.K.hostile ? 64 : 96))) remove(a);
      const n = c => [...list.values()].filter(c).length;
      // animals on the grass
      if (env.animals && n(a => PASSIVE.includes(a.kind)) < 14){
        const p = people[Math.floor(Math.random() * people.length)], ang = Math.random() * 6.28, d = 24 + Math.random() * 40, x = Math.floor(p.x + Math.cos(ang) * d), z = Math.floor(p.z + Math.sin(ang) * d);
        const top = world.surface(x, z), under = top > 0 ? world.get(x, top - 1, z) : -1, b = env.biomeAt ? env.biomeAt(x, z) : 'plains';
        if (under === B.grass || under === B.grass_snow || under === B.podzol){
          const pool = b === 'city' ? ['cat', 'cat', 'rabbit', 'chicken'] : b === 'taiga' || b === 'snowtaiga' ? ['wolf', 'fox', 'rabbit'] : b === 'savanna' ? ['horse', 'llama', 'cow'] : b === 'snowy' || b === 'snowpeak' ? ['rabbit', 'goat', 'fox'] : b === 'meadow' || b === 'cherry' ? ['goat', 'rabbit', 'sheep', 'cat'] : b === 'jungle' ? ['chicken', 'cat'] : ['cow', 'pig', 'sheep', 'chicken', 'horse', 'rabbit', 'cow', 'pig', 'sheep'];
          const k = pool[Math.floor(Math.random() * pool.length)], herd = k === 'chicken' || k === 'rabbit' ? 3 : k === 'wolf' ? 3 : 2;
          for (let i = 0; i < herd; i++){ const xx = x + (i % 2), zz = z + (i >> 1), y = groundAt(xx, zz, top); if (y != null) add(k, xx + .5, y, zz + .5); }
        }
      }
      // villagers stay near their village
      if (env.villages) for (const v of env.villages(p0.x, p0.z)){ if (Math.hypot(v.x - p0.x, v.z - p0.z) > 80) continue; const here = n(a => a.kind === 'villager' && a.home === v); if (here < 6){ const x = v.x + Math.floor((Math.random() - .5) * 30), z = v.z + Math.floor((Math.random() - .5) * 30), y = groundAt(x, z, v.y + 4); if (y != null){ const a = add('villager', x + .5, y, z + .5); a.home = v; } } }
      // monsters in the dark
      if (env.monsters && env.night > .55 && n(a => a.K.hostile || a.K.neutral) < 12){
        const p = people[Math.floor(Math.random() * people.length)], ang = Math.random() * 6.28, d = 20 + Math.random() * 28, x = Math.floor(p.x + Math.cos(ang) * d), z = Math.floor(p.z + Math.sin(ang) * d);
        const top = world.surface(x, z); if (top > 0){ const y = groundAt(x, z, top); const under = world.get(x, top - 1, z);
          if (y != null && !LIQUID[under]){ const b = env.biomeAt ? env.biomeAt(x, z) : ''; const pool = ['zombie', 'zombie', 'skeleton', 'skeleton', 'creeper', 'creeper', 'spider', b === 'desert' ? 'husk' : 'zombie', 'enderman']; add(pool[Math.floor(Math.random() * pool.length)], x + .5, y, z + .5); } }
      }
    }
    for (const a of list.values()){
      const K = a.K; a.cool -= dt; a.hurtT -= dt; a.t -= dt;
      if (a.barT > 0 && (a.barT -= dt) <= 0) a.m.bar.visible = false;
      // daylight: monsters that burn give up and vanish
      if (K.burns && env.night < .3 && world.surface(Math.floor(a.x), Math.floor(a.z)) <= a.y + 1){ a.burnT = (a.burnT || 0) + dt; if (a.burnT > 1){ a.burnT = 0; hurt(a, 1); if (!list.has(a.id)) continue; } }      // in the sun they burn, a heart a second
      let target = null, td = 1e9;
      if (K.hostile || (a.angry && (K.neutral || a.kind === 'wolf'))) for (const p of people){ if (p.dead) continue; const d = Math.hypot(p.x - a.x, p.z - a.z); if (d < 18 && d < td && Math.abs(p.y - a.y) < 8){ td = d; target = p; } }
      let sp = 0;
      if (target){
        a.yaw = Math.atan2(target.x - a.x, target.z - a.z);
        if (K.shoots){ sp = td > 9 ? K.speed : td < 5 ? -K.speed * .7 : 0; if (td < 16 && a.cool <= 0){ a.cool = 2; shoot(a, target); } }
        else if (K.explodes){ sp = td > 1.8 ? K.speed : 0; if (td < 2.6){ a.fuse += dt; if (a.fuse > 1.5){ remove(a); if (opts.explode) opts.explode(a.x, a.y + .8, a.z); continue; } } else a.fuse = Math.max(0, a.fuse - dt); }
        else { sp = td > .9 ? K.speed * (a.kind === 'spider' ? 1.2 : 1) : 0; if (td < 1.4 && a.cool <= 0 && Math.abs(target.y - a.y) < 2){ a.cool = 1; if (opts.hitPlayer) opts.hitPlayer(target, K.melee || 2, a); } }
      } else {
        if (a.home && Math.hypot(a.home.x - a.x, a.home.z - a.z) > 28){ a.yaw = Math.atan2(a.home.x - a.x, a.home.z - a.z); a.go = 1; a.t = 2; }
        for (const p of people){ if (!K.hostile && Math.hypot(p.x - a.x, p.z - a.z) < 3 && a.run <= 0 && p.moving && !a.home && a.kind !== 'cat' && a.kind !== 'wolf'){ a.run = 2; a.yaw = Math.atan2(a.x - p.x, a.z - p.z); } }
        if (a.run > 0) a.run -= dt; else if (a.t <= 0){ a.go = Math.random() < .55 ? 1 : 0; a.t = 1.5 + Math.random() * 4; if (a.go) a.yaw += (Math.random() - .5) * 2.4; }
        sp = a.run > 0 ? K.speed * 2.2 : a.go ? K.speed * .7 : 0;
      }
      // move: up one block, not off cliffs, not into water (unless chasing)
      let mx = Math.sin(a.yaw) * sp * dt, mz = Math.cos(a.yaw) * sp * dt;
      if (a.kx){ mx += a.kx * dt; mz += a.kz * dt; a.kx *= Math.exp(-dt * 6); a.kz *= Math.exp(-dt * 6); if (Math.abs(a.kx) < .05){ a.kx = a.kz = 0; } }
      if (mx || mz){
        const nx = a.x + mx, nz = a.z + mz, ahead = Math.sign(sp || 1), bx = Math.floor(nx + Math.sin(a.yaw) * K.w * .5 * ahead), bz = Math.floor(nz + Math.cos(a.yaw) * K.w * .5 * ahead);
        const ny = groundAt(bx, bz, a.y), wet = world.get(bx, Math.floor(a.y), bz);
        if (ny == null || ny - a.y > 1.01 || (a.y - ny > 3.01 && !target) || (LIQUID[wet] && !target)){ if (!target){ a.yaw += 1.6 + Math.random(); a.t = Math.min(a.t, .4); } }
        else { a.x = nx; a.z = nz; const gy = groundAt(Math.floor(a.x), Math.floor(a.z), a.y + .5); if (gy != null){ if (gy > a.ty && K.hop) a.vy = 4; a.ty = gy; } }
      }
      if (a.vy){ a.y += a.vy * dt; a.vy -= 20 * dt; if (a.y <= a.ty){ a.y = a.ty; a.vy = 0; } } else a.y += (a.ty - a.y) * Math.min(1, dt * 10);
      a.walk += Math.abs(sp) * dt * 3; a.moving = sp ? 1 : 0;
    }
    // arrows: fly with gravity, stick in blocks, hurt whoever they hit
    for (let i = arrows.length - 1; i >= 0; i--){
      const r = arrows[i]; r.life -= dt; if (r.life <= 0){ scene.remove(r.m); arrows.splice(i, 1); continue; }
      if (r.stuck) continue;
      r.vy -= 16 * dt; const ox = r.x, oy = r.y, oz = r.z, dist = Math.hypot(r.vx, r.vy, r.vz) * dt, n = Math.max(1, Math.ceil(dist / .2));
      // move in small steps so a fast arrow cannot skip through anything
      let done = false;
      for (let s2 = 1; s2 <= n && !done; s2++){
        const f = s2 / n, x = ox + r.vx * dt * f, y = oy + r.vy * dt * f, z = oz + r.vz * dt * f;
        const b = world.get(Math.floor(x), Math.floor(y), Math.floor(z)); if (b > 0 && SOLID[b]){ r.stuck = true; r.life = 3; done = true; break; }
        r.x = x; r.y = y; r.z = z;
        if (r.fromMob){ for (const p of people){ if (Math.hypot(p.x - x, p.z - z) < .5 && y > p.y && y < p.y + 1.8){ if (opts.hitPlayer) opts.hitPlayer(p, 3, {x:ox, z:oz}); scene.remove(r.m); arrows.splice(i, 1); done = 2; break; } } }
        else for (const a of list.values()){ if (Math.hypot(a.x - x, a.z - z) < a.K.w * .6 + .1 && y > a.y && y < a.y + a.K.h + .1){ hurt(a, r.dmg, {x:ox, z:oz}); scene.remove(r.m); arrows.splice(i, 1); done = 2; break; } }
      }
      if (done !== 2){ r.m.position.set(r.x, r.y, r.z); r.m.lookAt(r.x + r.vx, r.y + r.vy, r.z + r.vz); }
    }
  }
  const arrowGeo = new THREE.BoxGeometry(.06, .06, .6), arrowMat = new THREE.MeshLambertMaterial({color:0x8a6a3a});
  function arrow(x, y, z, vx, vy, vz, fromMob, dmg = 6){ const m = new THREE.Mesh(arrowGeo, arrowMat); m.position.set(x, y, z); scene.add(m); arrows.push({x, y, z, vx, vy, vz, m, life:8, fromMob, dmg}); }
  function shoot(a, t){ const sx = a.x, sy = a.y + 1.5, sz = a.z, dx = t.x - sx, dy = t.y + 1.2 - sy, dz = t.z - sz, d = Math.hypot(dx, dz), v = 22; arrow(sx, sy, sz, dx / d * v, dy / d * v + d * .35, dz / d * v, true); }
  function draw(dt){
    for (const a of list.values()){
      const g = a.m.g; g.position.set(a.x, a.y, a.z);
      let dy = a.yaw - g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); g.rotation.y += dy * Math.min(1, dt * 12);
      const sw = Math.sin(a.walk) * (a.moving ? .6 : 0);
      for (const l of a.m.legs) l.piv.rotation.x = (l.i === 0 || l.i === 3 ? sw : -sw);
      for (const r of a.m.arms) r.piv.rotation.x = a.K.armsOut ? -1.4 + Math.sin(a.walk * .5) * .05 : (r.i ? sw : -sw) * .8;
      const grazing = !a.moving && !a.K.hostile && a.K.parts.length > 4 && a.kind !== 'villager';
      a.m.head.rotation.x = grazing ? .45 + Math.sin(performance.now() / 500 + a.id) * .1 : 0;
      const flash = a.hurtT > 0 || (a.fuse > 0 && Math.sin(a.fuse * 18) > 0);
      if (flash !== a.flashing){ a.flashing = flash; a.m.g.traverse(o => { if (o.isMesh) for (const mm of [].concat(o.material)) { mm.emissive = mm.emissive || new THREE.Color(); mm.emissive.set(flash ? (a.fuse > 0 && a.hurtT <= 0 ? 0x666666 : 0x7a0000) : 0x000000); } }); }
      if (a.fuse > 0) a.m.g.scale.setScalar(1 + a.fuse * .08); else a.m.g.scale.setScalar(1);
    }
  }
  return {
    list, arrows, KINDS,
    add(k, x, y, z){ const gy = groundAt(Math.floor(x), Math.floor(z), y + 1); return add(k, x, gy != null ? gy : y, z); },
    update(dt, people, host, env){ if (host) think(dt, people, env); draw(dt); },
    hurt, arrow,
    pick(o, dir, max){
      let best = null, bt = max;
      for (const a of list.values()){
        const K = a.K, r = K.w / 2 + .15, cx = a.x - o.x, cy = a.y + K.h / 2 - o.y, cz = a.z - o.z, t = cx * dir.x + cy * dir.y + cz * dir.z; if (t < 0 || t > bt) continue;
        const dx = cx - dir.x * t, dy = cy - dir.y * t, dz = cz - dir.z * t; if (dx * dx + dz * dz < r * r && Math.abs(dy) < K.h / 2 + .1){ best = a; bt = t; }
      }
      return best;
    },
    state(){ return [...list.values()].map(a => [a.id, ALL.indexOf(a.kind), +a.x.toFixed(2), +a.y.toFixed(2), +a.z.toFixed(2), +a.yaw.toFixed(2), a.moving ? 1 : 0, Math.round(a.hp), a.fuse > 0 ? 1 : 0]); },
    apply(s){
      const seen = new Set();
      for (const [id, k, x, y, z, yaw, mv, hp, fuse] of s){
        seen.add(id); let a = list.get(id); const kn = ALL[k] || 'pig';
        if (!a){ a = add(kn, x, y, z, id); a.yaw = yaw; }
        if (hp < a.hp){ a.hurtT = .35; a.hp = hp; drawBar(a); }
        a.tx = x; a.tz = z; a.ty2 = y; a.tyaw = yaw; a.moving = mv; a.remote = true; a.fuse = fuse ? (a.fuse || .1) + .02 : 0;
      }
      for (const a of [...list.values()]) if (!seen.has(a.id)) remove(a, a.hp <= 1);
    },
    follow(dt){ for (const a of list.values()) if (a.remote){ const k = Math.min(1, dt * 8), ox = a.x, oz = a.z; a.x += (a.tx - a.x) * k; a.z += (a.tz - a.z) * k; a.y += (a.ty2 - a.y) * k; a.yaw = a.tyaw; a.walk += Math.hypot(a.x - ox, a.z - oz) * 3; a.hurtT -= dt; if (a.barT > 0 && (a.barT -= dt) <= 0) a.m.bar.visible = false; } },
    clear(){ for (const a of [...list.values()]) remove(a); for (const r of arrows) scene.remove(r.m); arrows.length = 0; }
  };
}
