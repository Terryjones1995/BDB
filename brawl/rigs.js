/* Break Room Brawl: rigged, animated characters.
   Models are KayKit Adventurers and KayKit Skeletons by Kay Lousberg (CC0), trimmed to the clips the game uses.
   If a file fails to load, makeModel falls back to the built-from-shapes version, so the game still runs. */
import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { clone as cloneRig } from './vendor/utils/SkeletonUtils.js';

const NATIVE = 2.2;                       // how tall the pack's characters stand, in their own units
const FILES = ['Knight', 'Mage', 'Rogue', 'Rogue_Hooded', 'Barbarian', 'Skeleton_Minion', 'Skeleton_Mage', 'Skeleton_Warrior', 'Skeleton_Rogue'];
/* f: file. h: height on the field. show: which props stay on. walk / atk: clips. tint: recolour. at: seconds one attack swing takes. */
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
  fivestar: {f:'Barbarian',        h:2.7,  walk:'Walking_A', atk:'2H_Melee_Attack_Spin', show:['2H_Axe', 'Barbarian_Cape'], tint:0x2a5bd7, k:.35, at:.75, bighead:true}
};
const lib = {}, mats = new Map();
export function loadRigs(){
  const L = new GLTFLoader();
  return Promise.all(FILES.map(f => new Promise(res => L.load(`models/${f}.glb`, g => { lib[f] = g; res(); }, undefined, () => res()))));
}
export const hasRig = k => !!(RIGS[k] && lib[RIGS[k].f]);

const c1 = new THREE.Color(), c2 = new THREE.Color();
function matFor(src, def, tint, grad){
  const key = src.uuid + '|' + (def.tint ?? '') + '|' + (tint ?? '');
  let m = mats.get(key);
  if (m) return m;
  if (/glow/i.test(src.name)) m = new THREE.MeshBasicMaterial({color:tint ?? def.tint ?? 0x7dffb0});          // the skeletons' eyes
  else {
    c1.set(0xffffff); if (def.tint != null) c1.lerp(c2.set(def.tint), def.k ?? .4); if (tint != null) c1.lerp(c2.set(tint), .42);
    m = new THREE.MeshToonMaterial({map:src.map || null, color:c1.getHex(), gradientMap:grad});
  }
  mats.set(key, m); return m;
}

export function makeRig(key, o, grad, extras){
  const def = RIGS[key], gl = lib[def.f], root = cloneRig(gl.scene), g = new THREE.Group(), sc = def.h / NATIVE;
  root.scale.setScalar(sc); g.add(root);
  let head = null;
  root.traverse(n => {
    if (n.isBone && n.name === 'head') head = n;
    if (!n.isMesh) return;
    n.castShadow = true; n.frustumCulled = false;
    if (!n.isSkinnedMesh) n.visible = !!(def.show && def.show.includes(n.name));
    n.material = matFor(n.material, def, o && o.tint, grad);
  });
  if (def.bighead && head && extras && extras.bighead){ const b = extras.bighead(); b.scale.setScalar(1.15); b.position.set(0, .55, 0); head.add(b); }
  const mixer = new THREE.AnimationMixer(root), clip = n => THREE.AnimationClip.findByName(gl.animations, n);
  const idle = mixer.clipAction(clip('Idle')), walk = mixer.clipAction(clip(def.walk)), ac = clip(def.atk), atk = mixer.clipAction(ac), at = def.at || .55;
  atk.setLoop(THREE.LoopOnce, 1); atk.clampWhenFinished = true; atk.timeScale = ac.duration / at;
  let cur = null, last = 0, lastAtk = 99;
  const go = (a, fade) => { if (cur === a) return; if (cur) cur.fadeOut(fade); a.reset().setEffectiveWeight(1).fadeIn(fade).play(); cur = a; };
  idle.time = Math.random() * 2; go(idle, 0);
  return {g, h:def.h * 1.02, rig:true, anim(t, s){
    const dt = Math.min(.1, Math.max(0, t - last)); last = t;
    if (s.atk < lastAtk){ if (cur === atk) atk.reset().play(); else go(atk, .06); }
    lastAtk = s.atk;
    if (s.atk >= at) go(s.mv ? walk : idle, .14);
    if (cur === walk) walk.timeScale = Math.max(.7, Math.min(2.4, (s.spd || 1.3) / (def.walk === 'Running_A' ? 1.9 : 1.05))) * (s.chg ? 1.6 : 1);     // feet keep pace with the ground speed
    mixer.update(dt);
  }};
}
