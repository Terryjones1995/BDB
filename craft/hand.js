/* BDB Craft: your arm in the bottom right, in your own character's skin and sleeve, holding whatever is in your hand. It bobs as you walk and swings
   down and in when you break or place, the way it does in Minecraft. Drawn in its own little scene on top of the world so it never sinks into a wall. */
import * as THREE from '../chess/vendor/three.module.min.js';
import { BLOCKS, FACE } from './blocks.js';
import { TS } from './tex.js';
import { body } from './skin.js';

export const A = {rx:2.05, ry:-.35, rz:.28};      // the resting angle of the arm
export function createHand(scene, layers){
  const root = new THREE.Group(); scene.add(root);                       // follows the bob and the swing
  const armPivot = new THREE.Group(); root.add(armPivot);
  let arm = null, item = null, itemId = -1, skinKey = '', swing = 0, bob = 0, lift = 0;
  const cache = new Map();
  const tex = l => { const c = document.createElement('canvas'); c.width = c.height = TS; const x = c.getContext('2d'), im = x.createImageData(TS, TS); im.data.set(layers.subarray(l * TS * TS * 4, (l + 1) * TS * TS * 4)); x.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; };
  function makeItem(id){
    const b = BLOCKS[id];
    if (b.kind === 'plant' || b.kind === 'item') return new THREE.Mesh(new THREE.PlaneGeometry(.34, .34), new THREE.MeshLambertMaterial({map:tex(FACE[id * 6]), transparent:true, alphaTest:.5, side:THREE.DoubleSide}));
    const ms = [0, 1, 2, 3, 4, 5].map(f => new THREE.MeshLambertMaterial({map:tex(FACE[id * 6 + f]), transparent:b.kind !== 'solid', alphaTest:b.kind === 'cutout' ? .5 : 0}));
    return new THREE.Mesh(new THREE.BoxGeometry(.24, .24, .24), ms);
  }
  return {
    setSkin(s){
      const k = JSON.stringify(s || null); if (k === skinKey && arm) return; skinKey = k;
      if (arm){ armPivot.remove(arm.mesh); arm.bd.dispose(); }
      const bd = body(s), m = bd.ra.children[0]; bd.ra.remove(m);
      m.position.set(0, 0, 0); m.scale.set(.82, .95, .82); armPivot.add(m); arm = {bd, mesh:m};
    },
    set(id){
      if (id === itemId) return; itemId = id;
      if (item){ armPivot.remove(item); item = null; }
      if (!id) return;
      if (!cache.has(id)) cache.set(id, makeItem(id)); item = cache.get(id);
      // in the fist: at the end of the arm, turned so you see the top and two sides
      if (BLOCKS[id].kind === 'plant' || BLOCKS[id].kind === 'item'){ item.position.set(0, -.44, -.08); item.rotation.set(0, Math.PI / 2, 0); }
      else { item.position.set(.0, -.42, -.13); item.rotation.set(.1, .6, .05); item.scale.setScalar(.8); }
      armPivot.add(item);
      lift = 1;                                                           // the arm dips and comes back up when you change what you hold
    },
    drop(id){ if (cache.has(id)){ if (itemId === id){ armPivot.remove(item); item = null; itemId = -1; } cache.delete(id); } },
    swing(){ swing = 1; },
    light(k){ scene.traverse(o => { if (o.isHemisphereLight) o.intensity = 2.6 * k; if (o.isDirectionalLight) o.intensity = 1.2 * k; }); },
    update(dt, moving){
      swing = Math.max(0, swing - dt * 4.2); lift = Math.max(0, lift - dt * 5); bob += dt * (moving ? 8.5 : 0);
      const s = Math.sin(swing * Math.PI), s2 = Math.sin(Math.sqrt(swing) * Math.PI);
      // the arm reaches in from the lower right, pointing up and forward, the hand in view
      armPivot.position.set(.56 - s2 * .16, -.57 - lift * .25 + Math.abs(Math.cos(bob)) * .02 - s * .06, -.62 - s * .12);
      armPivot.rotation.set(A.rx - s * .55 + Math.sin(bob) * .01, A.ry + s2 * .35, A.rz - s * .15);
      root.position.x = Math.sin(bob) * .012;
    },
    get on(){ return !!arm; }
  };
}
