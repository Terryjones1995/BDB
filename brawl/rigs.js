/* Break Room Brawl: character models loaded from files, only when a match needs them.
   KayKit Adventurers, Skeletons and Mystery Monthly characters by Kay Lousberg (CC0): mesh and skeleton per file, sharing one clip library (am.glb / al.glb) and one weapon rack (wp.glb).
   Ultimate Monsters by Quaternius (CC0): each file carries its own clips. The forty-odd heroes (Bellkeeper, Jadefang, Glacius, King Bellow, Solaris and the rest: every file a rig marked R below loads) were made for this game.
   The T_ files were made for this game with Tripo and rigged here: each carries a mesh and a 20-joint skeleton and no clips of its own.
   They all play one shared library (aG.glb: idle, walk, sprint, punch, kick, throw, two deaths, a cheer), built in the same bone frames.
   If a file fails to load, makeModel falls back to a stand-in built from shapes, so the game still runs. */
import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/libs/meshopt_decoder.module.js';
import { clone as cloneRig } from './vendor/utils/SkeletonUtils.js';
let rimFn = null; export const useRim = f => { rimFn = f; };

const NATIVE = {m:2.2, l:4.0};            // how tall the two KayKit rigs stand, in their own units. Any other family is measured file by file.
/* f: file. h: height on the field. fam: 'm' or 'l' = a KayKit rig that takes its clips from the shared library; none = the file has its own.
   walk / atk / idle / death / cheer: clip names. at: seconds one attack swing takes. rh / lh: what is in each hand. tint: recolour. fly: how high it hovers.
   lift: how much of its own painted colour a dark model gives off, so it does not go to black in the shade. */
const K = (f, h, atk, o = {}) => ({f, h, fam:'m', walk:'Walk', atk, ...o}), KL = (f, h, atk, o = {}) => ({f, h, fam:'l', walk:'Walk', atk, at:.85, ...o});
const Q = (f, h, o = {}) => ({f, h, walk:'Walk', atk:'Punch', ...o}), R = (f, h, o = {}) => ({f, h, walk:'Walk', atk:'Attack', death:'Death', at:.7, ...o});
/* T: one of the T_ characters on the shared library. S: the same, for someone who sprints everywhere. C: someone who throws, casts or swings overhand. F: someone who floats. */
const T = (f, h, o = {}) => ({f:'T_' + f, h, fam:'G', idle:'Idle', walk:'Walk', atk:'Punch', death:'Death', cheer:'Cheer', at:.6, lift:.22, ...o});
const S = (f, h, o = {}) => T(f, h, {walk:'Sprint', ws:2.6, at:.5, ...o}), C = (f, h, o = {}) => T(f, h, {atk:'Throw', at:.75, ...o}), F = (f, h, o = {}) => T(f, h, {walk:'Idle', fly:1.4, ...o});
export const RIGS = {
  ironclad:K('Knight', 1.5, 'Chop1', {rh:'sword', lh:'shield'}), longshots:K('Ranger', 1.35, 'Bow', {lh:'bow', at:.6}), dawnhammer:K('Paladin', 1.75, 'Chop1', {rh:'palHammer', lh:'palShield', at:.65}),
  oathkeeper:K('Paladin_with_Helmet', 1.7, 'Slice1', {rh:'palHammer', lh:'palShield'}), bell:R('Bellkeeper', 1.8, {lift:.5}), 
  cutpurse:K('Rogue', 1.35, 'Stab1', {walk:'Run', rh:'dagger'}), nightbolt:K('Rogue_Hooded', 1.35, 'Shoot2', {rh:'xbow2'}), vesper:R('Assassin', 1.45, {lift:.6, at:.5, ws:1.9}), kage:K('Ninja', 1.4, 'Slice1', {walk:'Run', rh:'katana'}),
  shinobi:S('NinjaRed', 1.5, {atk:'Kick', idle:'IdleB'}), 
  skel:K('Skeleton_Minion', 1.0, 'Stab1', {walk:'Run', rh:'sDagger', at:.45}), boneknight:K('Skeleton_Warrior', 1.5, 'Chop1', {rh:'sBlade', lh:'sShield'}), bonearchers:K('Skeleton_Rogue', 1.3, 'Shoot2', {rh:'sXbow'}),
  gravewitch:K('Skeleton_Mage', 1.5, 'Cast', {rh:'sStaff'}), mort:K('Necromancer', 1.55, 'Cast2', {rh:'sScythe'}), colossus:KL('Skeleton_Golem', 2.6, 'Chop2', {rh:'sGolemAxe'}), sanguine:K('Vampire', 1.55, 'Slice1', {rh:'vSword'}),
  lostsoul:Q('Flying_Ghost', 1.1), wraith:Q('Flying_Ghost_Skull', 1.25), gbat:F('Bat', .62, {fly:1.2, lift:.45}), terror:F('Bat', 1.3, {lift:.45}), nightfall:KL('BlackKnight', 2.5, 'Chop1', {rh:'bkSword', lh:'bkShield'}), lich:R('Lich', 2.0, {lift:.4}),
  hellion:T('RedDevil', 1.75, {idle:'IdleB'}), imps:F('Imp', .85, {fly:1.3}), cinder:K('Tiefling', 1.45, 'Slice1', {walk:'Run', rh:'tSword'}), magmaw:R('Golem', 2.7, {lift:.5, at:.9}),
  glacius:R('Troll', 2.1, {lift:.35}), permafrost:KL('FrostGolem', 2.7, 'Punch'), yeti:T('Yeti', 1.7, {idle:'IdleB'}), frostbeak:S('Penguin', 1.35, {atk:'Throw', at:.6}), tundra:T('BlueOgre', 2.0, {at:.8}),
  zephyr:R('Wizard', 1.7, {lift:.4}), hexa:K('Mage', 1.5, 'Cast', {rh:'staff'}), tonic:K('Witch', 1.45, 'Throw', {lh:'broom', at:.6}), wizlings:C('KidWizard', 1.0), stalker:T('Alien', 1.5), 
  hexsprite:F('Fairy', 1.0, {atk:'Throw', at:.7}), mindsquid:F('SquidKid', 1.25, {atk:'Throw', at:.8, fly:1.3}), sentinel:Q('Flying_Alpaking', .95), archon:Q('Flying_Alpaking_Evolved', 1.35),
  lycan:K('Werewolf_Wolf', 1.7, 'Dual', {walk:'Run', at:.5}), woodsman:K('Werewolf_Man', 1.55, 'Chop2', {rh:'woodAxe'}), 
  thumper:S('Kangaroo', 1.5, {idle:'IdleB'}), monkroose:C('Gorilla', 1.7), landshark:Q('Big_Fish', 1.55),
  piranhas:Q('Blob_Fish', .6), 
  thornweaver:K('Druid', 1.55, 'Cast', {rh:'dstaff'}), mushking:Q('Big_MushroomKing', 2.0, {atk:'Weapon'}), mushnub:Q('Blob_Mushnub', .6), sporecap:T('Mushroom', 1.2), cactoro:T('Cactus', 1.55), prickles:Q('Blob_Cactoro', .68),
  dartfrog:S('FrogRonin', 1.3, {atk:'Kick'}), slime:Q('Blob_GreenBlob', 1.0), slimelet:Q('Blob_GreenBlob', .6), spikeslime:Q('Blob_GreenSpikyBlob', 1.25), bee:Q('Flying_Armabee', .55),
  queen:Q('Flying_Armabee_Evolved', 1.2), cluckers:Q('Blob_Chicken', .58), pigeons:Q('Flying_Pigeon', .55),
  gorak:R('Orc', 1.9, {lift:.3}), gronk:R('Ogre', 2.3, {lift:.3, at:.8}), gorehorn:R('Minotaur', 2.0, {lift:.3}), elderbark:R('Treant', 2.4, {lift:.35, at:.8}), brassbolt:R('Clockwork', 1.9, {lift:.4}), janitor:R('Janitor', 1.6, {lift:.3}), infernus:R('RedDragon', 2.3, {lift:.3, at:.6}), raider:K('OrcRaider', 1.5, 'Chop1', {rh:'orcAxe'}), skullcrusher:T('WolfskullOrc', 1.7, {idle:'IdleB'}), mauler:C('Cyclops', 1.8), orclings:R('Goblin', .8, {ws:2.6, lift:.3, at:.5}),
  witchdoc:C('GoblinShaman', 1.5), skytotem:Q('Flying_Tribal', 1.3), gremlins:Q('Flying_Goleling', .6), gremking:Q('Flying_Goleling_Evolved', 1.0), bloodaxe:K('Barbarian', 1.6, 'Chop2', {walk:'Run', rh:'axe2'}),
  goliath:KL('Barbarian_Large', 2.8, 'Chop2', {rh:'axe2L'}), ugg:K('Caveman', 1.35, 'Punch'),
  tinker:K('Engineer', 1.45, 'Chop1', {rh:'wrench'}), scrapbot:K('Robot_One', 1.45, 'Shoot1'), shockbot:K('Robot_Two', 1.6, 'Punch'), titan:K('CombatMech', 1.9, 'Shoot2', {rh:'minigun', at:.3}), clanker:KL('Clanker', 2.7, 'Punch'),
  starranger:K('SpaceRanger', 1.4, 'Shoot2', {rh:'srRifle'}), jetace:K('SpaceRanger_FlightMode', 1.3, 'Shoot2', {rh:'srRifle', walk:'Idle'}), sarge:K('ActionFigure', 1.4, 'Shoot1', {rh:'gun', at:.3}),
  prepper:K('Survivalist', 1.45, 'Shoot2', {rh:'shotgun', lh:'riot'}), funbear:K('Animatronic_Normal', 1.55, 'Chop2', {rh:'guitar'}), afterhours:K('Animatronic_Creepy', 1.6, 'Dual', {walk:'Run'}),
  courier:K('Driver', 1.35, 'Punch', {walk:'Run'}), trailboss:K('Hiker', 1.6, 'Punch'), internA:K('Protagonist_A', 1.3, 'Punch', {walk:'Run'}), internB:K('Protagonist_B', 1.3, 'Kick', {walk:'Run'}),
  captain:K('Superhero', 1.55, 'Punch', {walk:'Idle'}), helpers:K('Helper_A', 1.15, 'Throw', {rh:'candy', at:.6}), giggles:K('Clown', 1.5, 'Throw', {rh:'clownBomb', at:.6}), mascot:K('MonsterCostume', 2.3, 'Punch', {at:.7}),
  bdb:K('Barbarian', 2.7, 'Spin2', {rh:'axe2', tint:0x2a5bd7, k:.35, at:.75, bighead:true}), 
  /* the second and third waves of heroes made for this game */
  whitemane:R('HorseKnight', 1.95, {walk:'Run', lift:.3, at:.6}), brynja:R('Valkyrie', 1.5, {walk:'Idle', lift:.3, at:.6}), kingbellow:R('King', 2.2, {lift:.3, at:.8}), kguard:K('Knight', 1.25, 'Chop1', {rh:'sword', lh:'shield'}),
  akaoni:R('Samurai', 1.6, {lift:.3, at:.5}), redbeard:R('Pirate', 1.65, {lift:.3}), tatters:R('Mummy', 1.9, {lift:.3, at:.8}), jackhollow:R('Scarecrow', 1.65, {lift:.35, at:.5}), miasma:R('PlagueDoctor', 1.6, {lift:.45, at:.8}),
  ashjaw:R('Hellhound', 1.45, {ws:2.6, lift:.5, at:.5}), azar:R('Ifrit', 1.85, {lift:.35}), phoenix:{f:'Phoenix', h:1.5, idle:'Fly', walk:'Fly', atk:'Hover', at:.5, lift:.4, fly:1.8},
  rimeguard:R('FrostKnight', 1.6, {lift:.35}), neve:R('IceMage', 1.4, {lift:.3, at:.8}), hoot:R('OwlWizard', 1.45, {lift:.3, at:.8}), geode:R('CrystalGolem', 2.3, {lift:.5, at:.85}),
  wolfpack:R('WolfWarrior', 1.15, {ws:2.6, lift:.35, at:.5}), ironhide:R('Bear', 2.0, {lift:.3, at:.8}), bao:R('Panda', 1.5, {lift:.3, at:.5}), siegehorn:R('Rhino', 2.3, {lift:.35, at:.9}), bramblehorn:R('Faun', 1.5, {lift:.3, at:.8}),
  bjorn:R('Dwarf', 1.3, {lift:.3, at:.9}), redline:R('Mech', 2.4, {lift:.3, at:.8}), scraplet:K('Robot_One', 1.0, 'Shoot1'), hank:R('Guard', 1.75, {lift:.3}), vending:R('Vending', 2.0, {lift:.35, at:.8}),
  kobolds:R('Kobold', .9, {ws:2.6, lift:.3, at:.5}), sirscorch:R('DragonKnight', 1.75, {lift:.3}), shiver:R('IceDragon', 1.7, {lift:.3, at:.8}),
  /* the Tripo wave */
  heartstone:T('StoneGolem', 2.2, {at:.8}), pridemane:T('LionPaladin', 1.6, {idle:'IdleB'}), brother:C('Monk', 1.45), halo:F('Cherub', 1.2), scarlet:T('ShieldMaiden', 1.4, {idle:'IdleB'}), halberd:T('SpearMaiden', 1.45), hilda:C('HammerValkyrie', 1.6),
  voidplate:T('ShadowKnight', 1.9, {idle:'IdleB', at:.7, lift:.5}), bandit:T('Bandit', 1.5, {idle:'IdleB'}), reynard:S('Fox', 1.3, {atk:'Kick'}), viper:S('HoodRogue', 1.4, {idle:'IdleB'}), corvus:F('CrowMan', 1.4, {fly:1.5, lift:.5}), whiskers:S('CatBurglar', 1.4, {atk:'Kick', lift:.45}),
  kitsune:S('Kunoichi', 1.4, {atk:'Kick', idle:'IdleB', at:.45}), kitshade:S('Kunoichi', 1.4, {atk:'Kick', idle:'IdleB', at:.45, tint:0x9a6bff, k:.7}),
  baron:T('Vampire', 1.6, {idle:'IdleB'}), rotter:T('Zombie', 1.5), shambler:T('Zombie', 1.0), acolyte:C('Cultist', 1.5), grinn:S('Jester', 1.5, {atk:'Kick'}), rattlecage:C('SkeletonKnight', 1.6, {at:.7}), pins:T('VoodooDoll', 1.2), nocturne:C('DarkMage', 1.55),
  flicker:S('FireGirl', 1.35, {atk:'Kick'}), obsidian:T('LavaKnight', 2.0, {idle:'IdleB', at:.8, lift:.5}), kindle:C('FireMage', 1.4),
  nix:F('IceGhost', 1.35, {fly:1.2}), mohawk:T('BlueTroll', 1.6, {idle:'IdleB'}), winter:C('IceSage', 1.5), tusk:T('Walrus', 1.8, {at:.8}), isolde:C('IceQueen', 1.75), frosty:T('Snowman', 1.6), woolly:T('Mammoth', 2.2, {at:.9}),
  hagatha:C('GreenWitch', 1.45), vex:C('PurpleMage', 1.4, {at:.5}), stargazer:T('StarSpear', 1.45), fizzle:C('Alchemist', 1.4, {at:.7}), tempus:C('ClockWizard', 1.6), genie:C('Genie', 1.8),
  squeak:C('MouseKing', 1.5, {at:.7}), mouseling:S('MouseKing', .7), pridelord:T('LionWarrior', 2.0, {idle:'IdleB', at:.7}), hogwild:S('Boar', 1.4), cackle:S('Hyena', 1.4, {idle:'IdleB'}), stripes:T('TigerGi', 1.6, {atk:'Kick', idle:'IdleB', at:.45}),
  greenhorn:T('LeafSpirit', 1.6), bogmaw:T('MossMonster', 2.2, {at:.9}), mudling:T('MossMonster', 1.0), beekeeper:C('Beekeeper', 1.5), sunny:C('Sunflower', 1.3, {at:.7}), willow:C('Dryad', 1.5), mossback:T('SpearTurtle', 1.5),
  finn:S('Explorer', 1.3, {atk:'Throw', at:.6}), lagspike:C('Gamer', 1.35, {at:.6}), chef:C('Chef', 1.55, {at:.6}), crusty:C('Baker', 1.5, {at:.7}), gert:C('LunchLady', 1.45), ref:C('Referee', 1.55, {at:.6}), manager:C('Boss', 1.9, {at:.7, idle:'IdleB'}),
  goldmask:T('Wrestler', 1.65, {idle:'IdleB'}), pizza:S('PizzaGuy', 1.45, {atk:'Throw', at:.7}), flint:C('Firefighter', 1.55, {at:.7}), blitz:S('Linebacker', 1.5),
  fuse:S('GoblinBomber', 1.2), rattatat:T('Drummer', 1.2), stubbeard:C('Viking', 1.4, {at:.6, idle:'IdleB'}), howl:T('WolfPelt', 1.5, {idle:'IdleB'}), furball:T('FurKing', 2.1, {at:.8}), shortbows:C('GoblinArcher', 1.1, {at:.6}),
  smokey:C('FurnaceBot', 1.8), rivet:C('Mechanic', 1.35, {at:.6}), shrinkwell:C('Scientist', 1.5, {at:.7}), gearheart:T('GoldBot', 1.6), nugget:C('Gnome', 1.1, {at:.6}), ironbeard:C('Blacksmith', 1.6, {at:.7}),
  scald:T('Salamander', 1.7, {idle:'IdleB'}), razorback:T('LizardPunk', 1.5, {idle:'IdleB'}), kai:T('DragonKid', 1.35, {atk:'Kick', idle:'IdleB', at:.45}), spikeback:T('SpikeTurtle', 1.6), plum:C('PurpleDragon', 1.2, {at:.7}),
  noir:S('CoatDuelist', 1.45, {atk:'Throw', idle:'IdleB', lift:.4}), onyx:S('HornNinja', 1.4, {atk:'Kick', idle:'IdleB', lift:.35}), midnight:T('HatRogue', 1.7, {idle:'IdleB', lift:.5}), prior:T('RedCultist', 1.9, {idle:'IdleB', lift:.4}),
  malgrave:F('PurpleWraith', 1.8, {atk:'Throw', at:.8, fly:1.2, lift:.4}), turnkey:F('KeyWraith', 1.9, {atk:'Throw', at:.9, fly:1.3, lift:.5}), auditor:T('HaloMan', 2.1, {lift:.55}), slagmaw:T('LavaDemon', 2.1, {idle:'IdleB', lift:.55}),
  nightmare:R('BlackHorse', 1.7, {walk:'Run', lift:.55, at:.6}), horseman:{f:'T_Horseman', h:2.5, gallop:true, lift:.4},
  jade:R('Dragon', 1.7, {lift:.25, at:.6}), emberwing:Q('Flying_Dragon', 1.2), elder:Q('Flying_Dragon_Evolved', 2.1), raptor:Q('Big_Dino', 1.5, {walk:'Run'}), kaiju:K('Monster', 1.7, 'Kick'), whelp:Q('Flying_Dragon', .7)
};
const lib = {}, clips = {}, pending = {}, mats = new Map(), inks = new Map();
let rack = null;                          // wp.glb: one named node per weapon
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const qa = new THREE.Quaternion(), va = new THREE.Vector3();
/* how tall a model stands as loaded, and how far below (or above) its own origin its feet are: some files are built around their middle, not their feet.
   A skinned mesh is measured through its skeleton: its raw vertices can be in other units entirely. */
const tb = new THREE.Box3(), tb2 = new THREE.Box3();
function tallOf(scene){
  scene.updateMatrixWorld(true); tb.makeEmpty();
  scene.traverse(o => { if (o.isSkinnedMesh){ o.computeBoundingBox(); tb.union(tb2.copy(o.boundingBox).applyMatrix4(o.matrixWorld)); } else if (o.isMesh) tb.expandByObject(o); });
  return tb.isEmpty() ? {tall:2, base:0} : {tall:tb.getSize(va).y || 2, base:tb.min.y};
}
const fetchOne = f => pending[f] || (pending[f] = new Promise(res => loader.load(`models/${f}.glb`, g => { res(g); }, undefined, () => res(null))));
/* load whatever these units need: their own files, plus the clip library and weapon rack if any of them uses one. Resolves when everything has either arrived or failed. */
export function needRigs(keys){
  const jobs = [];
  for (const k of new Set(keys)){
    const d = RIGS[k]; if (!d) continue;
    if (!lib[d.f]) jobs.push(fetchOne(d.f).then(g => { if (g && !lib[d.f]){ const m = tallOf(g.scene); g.tall = m.tall; g.base = m.base; lib[d.f] = g; } }));
    if (d.fam && !clips[d.fam]) jobs.push(fetchOne('a' + d.fam).then(g => { if (g) clips[d.fam] = g.animations; }));
    if ((d.rh || d.lh) && !rack) jobs.push(fetchOne('wp').then(g => { if (g) rack = g.scene; }));
  }
  return Promise.all(jobs);
}
export const hasRig = k => { const d = RIGS[k]; return !!(d && lib[d.f] && (!d.fam || clips[d.fam])); };
export const rigFile = k => RIGS[k] ? RIGS[k].f : null;

const c1 = new THREE.Color(), c2 = new THREE.Color();
function matFor(src, def, tint, grad){
  const key = src.uuid + '|' + (def.tint ?? '') + '|' + (tint ?? '') + '|' + (def.lift ?? '');
  let m = mats.get(key);
  if (m) return m;
  if (/glow/i.test(src.name)) m = new THREE.MeshBasicMaterial({color:tint ?? def.tint ?? 0x7dffb0});          // the skeletons' eyes
  else {
    // a recolour is part multiply, part glow: multiplying alone turns a red hood under a green tint into mud
    c1.copy(src.map ? c2.set(0xffffff) : src.color); if (def.tint != null) c1.lerp(c2.set(def.tint), (def.k ?? .4) * .6); if (tint != null) c1.lerp(c2.set(tint), src.map ? .3 : .45);
    const em = tint ?? def.tint;
    m = new THREE.MeshToonMaterial({map:src.map || null, normalMap:src.normalMap || null, color:c1.getHex(), gradientMap:grad, emissive:em ?? 0, emissiveIntensity:em != null ? (tint != null ? .3 : (def.k ?? .4) * .55) : 0, side:src.side});
    if (src.normalMap && src.normalScale) m.normalScale.copy(src.normalScale);
    if (def.lift && src.map && em == null){ m.emissive.set(0xffffff); m.emissiveMap = src.map; m.emissiveIntensity = def.lift; }
    if (rimFn) rimFn(m);
  }
  mats.set(key, m); return m;
}
/* ink outline: the same mesh drawn inside out, pushed out along its normals, so it follows the skeleton. One thickness on the field whatever units the model was made in. */
function inkFor(t){
  const k = t.toFixed(3); let m = inks.get(k); if (m) return m;
  m = new THREE.MeshBasicMaterial({color:0x160d07, side:THREE.BackSide});
  m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n\ttransformed += normalize( normal ) * ${k};`); };
  m.customProgramCacheKey = () => 'ink' + k;
  inks.set(k, m); return m;
}

export function makeRig(key, o, grad, extras){
  const def = RIGS[key], gl = lib[def.f], root = cloneRig(gl.scene), g = new THREE.Group(), sc = def.h / (def.fam && NATIVE[def.fam] ? NATIVE[def.fam] : gl.tall), anims = def.fam ? clips[def.fam] : gl.animations;
  const y0 = -(gl.base || 0) * sc;                        // feet on the ground, wherever the file put its origin
  root.scale.setScalar(sc); root.position.y = y0; g.add(root);
  let head = null, hr = null, hl = null, skin = null;
  root.traverse(n => {
    if (n.isBone){ if (n.name === 'head') head = n; else if (/^handslot\.?r$/.test(n.name)) hr = n; else if (/^handslot\.?l$/.test(n.name)) hl = n; }
    if (!n.isMesh) return;
    n.castShadow = true; n.frustumCulled = false;
    if (!skin && n.isSkinnedMesh) skin = n.material;
    n.material = matFor(n.material, def, o && o.tint, grad);
  });
  // what it carries: a weapon is painted from the same sheet as whoever holds it
  for (const [slot, name] of [[hr, def.rh], [hl, def.lh]]){
    const src = slot && name && rack && skin && rack.getObjectByName(name); if (!src) continue;
    const w = src.clone(true); w.position.set(0, 0, 0); w.rotation.set(0, 0, 0); w.scale.setScalar(1);
    w.traverse(n => { if (n.isMesh){ n.castShadow = true; n.frustumCulled = false; n.material = matFor(skin, def, o && o.tint, grad); } });
    slot.add(w);
  }
  if (def.bighead && head && extras && extras.bighead){             // stand the cutout upright and facing forward whatever way the head bone's own axes point
    const b = extras.bighead(); root.updateMatrixWorld(true);
    b.quaternion.copy(head.getWorldQuaternion(qa).invert()); b.position.copy(head.worldToLocal(head.getWorldPosition(va).add(new THREE.Vector3(0, .62 * sc, 0)))); b.scale.setScalar(1.1); b.userData.noInk = true; head.add(b);
  }
  if (o && o.ink){
    const INK = inkFor(clamp(.021 / sc, .004, .2)), list = [];
    root.traverse(n => { if (!n.isMesh || !n.visible || Array.isArray(n.material)) return; for (let q = n; q && q !== root; q = q.parent) if (q.userData.noInk) return; list.push(n); });
    for (const n of list){ let h; if (n.isSkinnedMesh){ h = new THREE.SkinnedMesh(n.geometry, INK); h.bind(n.skeleton, n.bindMatrix); } else h = new THREE.Mesh(n.geometry, INK); h.frustumCulled = false; n.add(h); }
  }
  g.userData.inked = true;
  const fly = o && o.fly ? def.fly ?? 1.5 : 0, H = def.h * 1.02;
  const clip = n => n && anims ? THREE.AnimationClip.findByName(anims, n) : null, wc = clip(def.walk), ac = clip(def.atk), ic = clip(def.idle || 'Idle');
  if (!ic || !wc || !ac){                                        // nothing to play: a statue that code brings to life
    const seed = Math.random() * 6;
    if (def.gallop) return {g, h:H, fly, rig:true, die(){ return false; }, cheer(){}, anim(t, s){                // a rider cast in one piece: he rocks like a horse at full stretch
      const a = s.atk < .4 ? Math.sin(s.atk / .4 * Math.PI) : 0, k = s.mv ? 1 : .12, w = s.mv ? s.ph * .55 : t * 1.6 + seed;
      root.rotation.x = Math.sin(w) * .17 * k - a * .3;                                    // nose down, nose up; rears into the hit
      root.position.y = y0 + (s.mv ? Math.abs(Math.sin(w * .5 + .6)) * .22 : 0) + a * .12;
      root.position.z = a * .28;
    }};
    return {g, h:H, fly, rig:true, die(){ return false; }, cheer(){}, anim(t, s){
      const a = s.atk < .32 ? Math.sin(s.atk / .32 * Math.PI) : 0, w = s.mv ? Math.sin(s.ph) : 0;
      root.rotation.z = w * .1; root.rotation.y = w * .12;                                   // a waddle: rocks side to side and twists with each step
      root.rotation.x = a * .42 + (s.mv ? .07 : 0);                                         // leans into the hit
      root.position.y = y0 + (s.mv ? Math.abs(Math.sin(s.ph)) * .09 : 0);
      root.scale.set(sc * (1 + a * .06), sc * (1 - a * .08 + (s.mv ? 0 : Math.sin(t * 2.4 + seed) * .014)), sc * (1 + a * .06));   // breathes at rest, squashes on the swing
    }};
  }
  const mixer = new THREE.AnimationMixer(root);
  const idle = mixer.clipAction(ic), walk = mixer.clipAction(wc), atk = mixer.clipAction(ac), at = def.at || .55;
  const dc = clip(def.death || 'Death'), death = dc && mixer.clipAction(dc), cc = clip(def.cheer || 'Cheer'), cheer = cc && mixer.clipAction(cc); let state = '';
  if (death){ death.setLoop(THREE.LoopOnce, 1); death.clampWhenFinished = true; death.timeScale = Math.max(1.5, dc.duration / .7); }
  atk.setLoop(THREE.LoopOnce, 1); atk.clampWhenFinished = true; atk.timeScale = ac.duration / at;
  const ws = def.ws || (def.walk === 'Run' ? 1.9 : 1.05);        // the ground speed the walk clip was made for
  let cur = null, last = 0, lastAtk = 99;
  const go = (a, fade) => { if (cur === a) return; if (cur) cur.fadeOut(fade); a.reset().setEffectiveWeight(1).fadeIn(fade).play(); cur = a; };
  idle.time = Math.random() * ic.duration; go(idle, 0);
  return {g, h:H, fly, rig:true, die(){ if (death){ state = 'dead'; go(death, .08); } return !!death; }, cheer(){ if (cheer && state !== 'dead'){ state = 'cheer'; go(cheer, .15); } }, anim(t, s){
    const dt = Math.min(.1, Math.max(0, t - last)); last = t;
    if (state){ mixer.update(dt); return; }
    if (s.atk < lastAtk){ if (cur === atk) atk.reset().play(); else go(atk, .06); }
    lastAtk = s.atk;
    if (s.atk >= at) go(s.mv && walk !== idle ? walk : idle, .14);
    if (cur === walk) walk.timeScale = Math.max(.7, Math.min(2.4, (s.spd || 1.3) / ws)) * (s.chg ? 1.6 : 1);     // feet keep pace with the ground speed
    mixer.update(dt);
  }};
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
