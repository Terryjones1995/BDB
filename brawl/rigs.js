/* Break Room Brawl: character models loaded from files.
   KayKit Adventurers and KayKit Skeletons by Kay Lousberg (CC0), trimmed to the clips the game uses, plus characters made for the game.
   A model with a skeleton plays its clips. A model without one (a statue) is moved by code: it waddles, leans into a hit and breathes.
   If a file fails to load, makeModel falls back to the built-from-shapes version, so the game still runs. */
import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { clone as cloneRig } from './vendor/utils/SkeletonUtils.js';
let rimFn = null; export const useRim = f => { rimFn = f; };

const NATIVE = 2.2;                       // how tall the pack's characters stand, in their own units
const FILES = ['Knight', 'Mage', 'Rogue', 'Rogue_Hooded', 'Barbarian', 'Skeleton_Minion', 'Skeleton_Mage', 'Skeleton_Warrior', 'Skeleton_Rogue', 'Bellkeeper'];
/* f: file. h: height on the field. show: which props stay on (all: every part). walk / atk / idle / death / cheer: clip names. tint: recolour. at: seconds one attack swing takes.
   lift: how much of its own painted colour a dark model gives off, so it does not go to black in the shade. */
export const RIGS = {
  skel:     {f:'Skeleton_Minion',  h:1.0,  walk:'Running_A', atk:'Unarmed_Melee_Attack_Punch_A', at:.45},
  gob:      {f:'Skeleton_Rogue',   h:1.0,  walk:'Running_A', atk:'Unarmed_Melee_Attack_Punch_A', at:.45, show:['Skeleton_Rogue_Hood'], tint:0x58c23a, k:.55},
  bench:    {f:'Knight',           h:1.5,  walk:'Walking_A', atk:'1H_Melee_Attack_Chop', show:['1H_Sword', 'Round_Shield', 'Knight_Helmet']},
  fast:     {f:'Knight',           h:1.6,  walk:'Running_A', atk:'2H_Melee_Attack_Chop', show:['2H_Sword', 'Knight_Cape'], tint:0xffc93a, k:.3},
  shooter:  {f:'Rogue_Hooded',     h:1.3,  walk:'Walking_A', atk:'2H_Ranged_Shoot', show:['2H_Crossbow']},
  ref:      {f:'Rogue',            h:1.45, walk:'Walking_A', atk:'1H_Ranged_Shoot', show:['1H_Crossbow', 'Rogue_Cape'], tint:0x2a2f3a, k:.4},
  barista:  {f:'Mage',             h:1.5,  walk:'Walking_A', atk:'Spellcast_Shoot', show:['Mage_Hat', '2H_Staff', 'Mage_Cape']},
  trainer:  {f:'Mage',             h:1.4,  walk:'Walking_A', atk:'Throw', show:['Spellbook_open'], tint:0x6dff9a, k:.4},
  witch:    {f:'Skeleton_Mage',    h:1.5,  walk:'Walking_A', atk:'Spellcast_Shoot', show:['Skeleton_Mage_Hat'], tint:0x8a4fd8, k:.4},
  mascot:   {f:'Barbarian',        h:2.3,  walk:'Walking_A', atk:'2H_Melee_Attack_Chop', show:['2H_Axe', 'Barbarian_Hat'], at:.7},
  buzzer:   {f:'Skeleton_Warrior', h:2.4,  walk:'Walking_A', atk:'Unarmed_Melee_Attack_Kick', show:['Skeleton_Warrior_Helmet'], at:.6},
  fivestar: {f:'Barbarian',        h:2.7,  walk:'Walking_A', atk:'2H_Melee_Attack_Spin', show:['2H_Axe', 'Barbarian_Cape'], tint:0x2a5bd7, k:.35, at:.75, bighead:true},
  bell:     {f:'Bellkeeper',       h:1.8,  all:true, lift:.5, walk:'Walk', atk:'Attack', death:'Death', at:.7}
};
const lib = {}, mats = new Map();
/* ink outline: the same mesh drawn inside out, pushed out along its normals, so it follows the skeleton */
const INK = new THREE.MeshBasicMaterial({color:0x160d07, side:THREE.BackSide});
INK.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed += normalize( normal ) * 0.032;'); };
const qa = new THREE.Quaternion(), va = new THREE.Vector3();
/* how tall a model stands as loaded. A skinned mesh is measured through its skeleton: its raw vertices can be in other units entirely. */
const tb = new THREE.Box3(), tb2 = new THREE.Box3();
function tallOf(scene){
  scene.updateMatrixWorld(true); tb.makeEmpty();
  scene.traverse(o => { if (o.isSkinnedMesh){ o.computeBoundingBox(); tb.union(tb2.copy(o.boundingBox).applyMatrix4(o.matrixWorld)); } else if (o.isMesh) tb.expandByObject(o); });
  return tb.isEmpty() ? NATIVE : tb.getSize(va).y || NATIVE;
}
export function loadRigs(){
  const L = new GLTFLoader();
  return Promise.all(FILES.map(f => new Promise(res => L.load(`models/${f}.glb`, g => { g.tall = tallOf(g.scene); lib[f] = g; res(); }, undefined, () => res()))));
}
export const hasRig = k => !!(RIGS[k] && lib[RIGS[k].f]);

const c1 = new THREE.Color(), c2 = new THREE.Color();
function matFor(src, def, tint, grad){
  const key = src.uuid + '|' + (def.tint ?? '') + '|' + (tint ?? '');
  let m = mats.get(key);
  if (m) return m;
  if (/glow/i.test(src.name)) m = new THREE.MeshBasicMaterial({color:tint ?? def.tint ?? 0x7dffb0});          // the skeletons' eyes
  else {
    // a recolour is part multiply, part glow: multiplying alone turns a red hood under a green tint into mud
    c1.copy(src.map ? c2.set(0xffffff) : src.color); if (def.tint != null) c1.lerp(c2.set(def.tint), (def.k ?? .4) * .6); if (tint != null) c1.lerp(c2.set(tint), .3);
    const em = tint ?? def.tint;
    m = new THREE.MeshToonMaterial({map:src.map || null, normalMap:src.normalMap || null, color:c1.getHex(), gradientMap:grad, emissive:em ?? 0, emissiveIntensity:em != null ? (tint != null ? .3 : (def.k ?? .4) * .55) : 0});
    if (src.normalMap && src.normalScale) m.normalScale.copy(src.normalScale);
    if (def.lift && src.map && em == null){ m.emissive.set(0xffffff); m.emissiveMap = src.map; m.emissiveIntensity = def.lift; }
    if (rimFn) rimFn(m);
  }
  mats.set(key, m); return m;
}

export function makeRig(key, o, grad, extras){
  const def = RIGS[key], gl = lib[def.f], root = cloneRig(gl.scene), g = new THREE.Group(), sc = def.h / (def.all ? gl.tall : NATIVE);
  root.scale.setScalar(sc); g.add(root);
  let head = null;
  root.traverse(n => {
    if (n.isBone && n.name === 'head') head = n;
    if (!n.isMesh) return;
    n.castShadow = true; n.frustumCulled = false;
    if (!n.isSkinnedMesh && !def.all) n.visible = !!(def.show && def.show.includes(n.name));
    n.material = matFor(n.material, def, o && o.tint, grad);
  });
  if (def.bighead && head && extras && extras.bighead){             // stand the cutout upright and facing forward whatever way the head bone's own axes point
    const b = extras.bighead(); root.updateMatrixWorld(true);
    b.quaternion.copy(head.getWorldQuaternion(qa).invert()); b.position.copy(head.worldToLocal(head.getWorldPosition(va).add(new THREE.Vector3(0, .62 * sc, 0)))); b.scale.setScalar(1.1); head.add(b);
  }
  if (o && o.ink){
    const list = []; root.traverse(n => { if (n.isMesh && n.visible && n.material !== INK) list.push(n); });
    for (const n of list){ let h; if (n.isSkinnedMesh){ h = new THREE.SkinnedMesh(n.geometry, INK); h.bind(n.skeleton, n.bindMatrix); } else h = new THREE.Mesh(n.geometry, INK); h.frustumCulled = false; n.add(h); }
  }
  g.userData.inked = true;
  if (!gl.animations.length){                                    // no skeleton: a statue that code brings to life
    const seed = Math.random() * 6;
    return {g, h:def.h * 1.02, rig:true, die(){ return false; }, cheer(){}, anim(t, s){
      const a = s.atk < .32 ? Math.sin(s.atk / .32 * Math.PI) : 0, w = s.mv ? Math.sin(s.ph) : 0;
      root.rotation.z = w * .1; root.rotation.y = w * .12;                                   // a waddle: rocks side to side and twists with each step
      root.rotation.x = a * .42 + (s.mv ? .07 : 0);                                         // leans into the hit
      root.position.y = s.mv ? Math.abs(Math.sin(s.ph)) * .09 : 0;
      root.scale.set(sc * (1 + a * .06), sc * (1 - a * .08 + (s.mv ? 0 : Math.sin(t * 2.4 + seed) * .014)), sc * (1 + a * .06));   // breathes at rest, squashes on the swing
    }};
  }
  const mixer = new THREE.AnimationMixer(root), clip = n => THREE.AnimationClip.findByName(gl.animations, n);
  const idle = mixer.clipAction(clip(def.idle || 'Idle')), walk = mixer.clipAction(clip(def.walk)), ac = clip(def.atk), atk = mixer.clipAction(ac), at = def.at || .55;
  const dc = clip(def.death || 'Death_A'), death = dc && mixer.clipAction(dc), cc = clip(def.cheer || 'Cheer'), cheer = cc && mixer.clipAction(cc); let state = '';
  if (death){ death.setLoop(THREE.LoopOnce, 1); death.clampWhenFinished = true; death.timeScale = 1.5; }
  atk.setLoop(THREE.LoopOnce, 1); atk.clampWhenFinished = true; atk.timeScale = ac.duration / at;
  let cur = null, last = 0, lastAtk = 99;
  const go = (a, fade) => { if (cur === a) return; if (cur) cur.fadeOut(fade); a.reset().setEffectiveWeight(1).fadeIn(fade).play(); cur = a; };
  idle.time = Math.random() * 2; go(idle, 0);
  return {g, h:def.h * 1.02, rig:true, die(){ if (death){ state = 'dead'; go(death, .08); } return !!death; }, cheer(){ if (cheer && state !== 'dead'){ state = 'cheer'; go(cheer, .15); } }, anim(t, s){
    const dt = Math.min(.1, Math.max(0, t - last)); last = t;
    if (state){ mixer.update(dt); return; }
    if (s.atk < lastAtk){ if (cur === atk) atk.reset().play(); else go(atk, .06); }
    lastAtk = s.atk;
    if (s.atk >= at) go(s.mv ? walk : idle, .14);
    if (cur === walk) walk.timeScale = Math.max(.7, Math.min(2.4, (s.spd || 1.3) / (def.walk === 'Running_A' ? 1.9 : 1.05))) * (s.chg ? 1.6 : 1);     // feet keep pace with the ground speed
    mixer.update(dt);
  }};
}
