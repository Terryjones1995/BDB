/* Break Room Brawl: the battle rules. No DOM, no drawing. One sim runs per match (on the host when online);
   screens read its entities and events. Team 0 defends z > 0, team 1 defends z < 0. */
import { UNITS, CARDS, MAPS, lvlMul, unitVar, HAND, AFF_IDS, typeBonus } from './cards.js?v=1116h';

export const TPS = 20, DT = 1 / TPS, W = 9, L = 21, RIVER = 1;      // a long field: more ground to cover, more time to react
export const riverOf = map => map.river ? map.rw || RIVER : 0;      // how far the river reaches either side of the halfway line: a painted map brings its own
export const MATCH = 600, OVERTIME = 120, MANA_STEP = 120, MAX_EL = 10, SIGHT = 6.5, HELP = 9.5;   // a 10 minute match, and two minutes of overtime if it is level. Mana comes in faster every two minutes: x1, x1.5, x2, x2.5, then x3 for the last two
export const TOWER_AT = [['king', 0, L - 3], ['princess', -5.5, L - 6.5], ['princess', 5.5, L - 6.5]];
const DEPLOY = TPS, PROJ_SPD = 11, SKY_WIND = .45;      // SKY_WIND: how long a hammer is in the air before the sky answers it
export const PATIENT = 3 * TPS;
export const MAX_TRAPS = 3, TRIG = 1.1;            // traps each player can have face down at once, and how close a troop has to step to spring one
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const T = s => Math.max(1, Math.round(s * TPS));
export const KEYS = Object.keys(UNITS);
export const OT_MANA = 4;
export const manaRate = (left, ot) => ot ? OT_MANA : 1 + .5 * Math.min(4, Math.max(0, Math.floor((MATCH - left) / MANA_STEP)));      // and x4 for the whole of overtime

function mulberry(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* Can this team drop this card here? Pure, so the screens and the CPU can ask without a sim in hand. */
export function canPlace(map, team, card, x, z, pocket){
  if (Math.abs(x) > W - .4 || Math.abs(z) > L - .4) return false;
  if (card.kind === 'spell' || (card.U && card.U.any)) return true;            // spells land anywhere, and so does anyone who can drop in behind the lines
  const zz = team === 0 ? z : -z, edge = riverOf(map) + .6;
  if (zz >= edge) return true;
  // an enemy guard tower is down: that side of their half opens up
  const side = (team === 0 ? x : -x) < 0 ? 0 : 1;
  return !!(pocket && pocket[side]) && zz >= -(L - 8.5) && zz <= -edge;
}

/* boost: per team {hp, dmg} for towers. start: Mana each player begins with. teams: which side each deck fights for, so the sides need not be the same size
   (one against two, two against three). Left out, two decks are a duel and four are two a side. */
export function createSim({map:mapId, decks, seed = 1, elMul = [1, 1], towerLvl = [1, 1], boost = [], start = [], teams}){
  const map = MAPS[mapId], rnd = mulberry(seed), RW = riverOf(map) || RIVER;
  let tick = 0, nid = 0, phase = 'play', over = false, winner = -1;
  const ents = [], byId = new Map(), projs = [], zones = [], traps = [];
  let events = [];
  const crowns = [0, 0];
  const emit = o => events.push(o);

  const tally = decks.map(() => ({}));                     // per player: damage done to the other side, by the kind of troop that did it
  const players = decks.map((d, i) => {
    const q = d.map(c => ({id:c.id, lvl:c.lvl || 1}));
    const bon = typeBonus(d.map(c => c.id));                                   // enough cards of one type and that type fights harder
    for (let k = q.length - 1; k > 0; k--){ const j = Math.floor(rnd() * (k + 1)); [q[k], q[j]] = [q[j], q[k]]; }   // the draw order is a shuffle
    return {el:clamp(start[i] ?? 5, 0, MAX_EL), hand:q.splice(0, HAND), next:q.shift(), queue:q, played:0, idle:0, bon};
  });

  const sides = teams || (decks.length > 2 ? decks.map((d, i) => i < decks.length / 2 ? 0 : 1) : [0, 1]);
  const tm = pid => sides[pid];
  function add(key, team, x, z, lvl, dep = DEPLOY, aff = 'std', pid = team, bm = 1){
    const U = unitVar(key, aff), m = lvlMul(lvl) * bm, hp = Math.round(U.hp * m);
    const e = {id:++nid, key, U, team, pid, bm, x, z, lvl, hp, max:hp, dmg:Math.round(U.dmg * m), d0:Math.round(U.dmg * m),
      cd:0, tgt:0, dep, frz:0, rage:0, slow:0, lock:false, fx:0, fz:team === 0 ? -1 : 1, mv:false, run:0, chg:false, active:key !== 'king',
      sh:U.shield ? Math.round(U.shield * m) : 0, wd:0, bt:0, bd:0, pt:0, pd:0, mk:0, hid:!!U.stealth, ht:0, hits:0, rs:0, rt:0, gs:0, rev:0, lp:0, jmp:false, rn:0, rc:0, by:0, wk:0, ft:0, mt:0, gd:0, tb:0, ln:Math.abs(x) >= 1.2 ? (x > 0 ? 1 : -1) : 0};
    if (U.spawn) e.sp = T(U.spawn.first ?? U.spawn.every);
    if (U.heal) e.hl = T(U.heal.every);
    if (U.mana) e.mn = T(U.mana.every);
    if (U.bless) e.wish = U.bless.n;
    if (U.recharge) e.rg = T(U.recharge.every);
    if (U.wrath) e.wr = T(U.wrath.first ?? U.wrath.every);
    ents.push(e); byId.set(e.id, e);
    return e;
  }
  const towers = [[], []];
  for (const team of [0, 1]) for (const [k, x, z] of TOWER_AT){
    const s = team === 0 ? 1 : -1, b = boost[team] || {}, e = add(k, team, x * s, z * s, towerLvl[team], 0);
    if (b.hp){ e.hp = e.max = Math.round(e.max * b.hp); } if (b.dmg) e.dmg = e.d0 = Math.round(e.dmg * b.dmg);
    towers[team].push(e);
  }
  const kingOf = t => towers[t][0];
  const pocket = team => { const en = towers[1 - team]; return [en[2].hp <= 0, en[1].hp <= 0]; };
  // towers[1] sits mirrored: its index 1 is at +x, index 2 at -x. For team 0 looking at x<0 that is towers[1][2].

  /* ---------- river and bridges ---------- */
  const side = z => z >= RW ? 1 : z <= -RW ? -1 : 0;
  const bridgeAt = x => map.bridges.find(b => Math.abs(x - b.x) <= b.w / 2);
  function waypoint(e, tx, tz){
    if (e.U.fly || !map.river) return [tx, tz];
    const su = side(e.z), st = side(tz);
    if (su !== 0 && su === st) return [tx, tz];
    if (su === 0){
      const b = bridgeAt(e.x) || map.bridges[0], h = Math.max(.1, b.w / 2 - .2);
      return st === 0 ? [clamp(tx, b.x - h, b.x + h), tz] : [clamp(tx, b.x - h, b.x + h), st * (RW + .1)];
    }
    let b = null, bc = 1e9;
    for (const c of map.bridges){ const k = Math.abs(e.x - c.x) + Math.abs(tx - c.x); if (k < bc){ bc = k; b = c; } }
    const h = Math.max(.1, b.w / 2 - Math.min(e.U.r * .6, b.w / 2 - .1)), bx = clamp(e.x, b.x - h, b.x + h);
    if (Math.abs(e.x - bx) < .1) return st === 0 && Math.abs(tx - b.x) <= b.w / 2 ? [tx, tz] : [bx, -su * (RW + .1)];
    return [bx, su * (RW + .3)];
  }
  function constrain(e, px, pz){
    e.x = clamp(e.x, -W + e.U.r * .5, W - e.U.r * .5); e.z = clamp(e.z, -L + .3, L - .3);
    if (!map.river || e.U.fly || Math.abs(e.z) >= RW) return;
    if (bridgeAt(e.x)) return;
    if (Math.abs(pz) >= RW) e.z = (pz > 0 ? 1 : -1) * RW;
    else { const b = bridgeAt(px) || map.bridges[0]; e.x = clamp(e.x, b.x - b.w / 2, b.x + b.w / 2); }
  }
  /* thrown, pulled or landed somewhere it cannot stand: put it on the nearer bank */
  function ashore(e, toward){
    e.x = clamp(e.x, -W + e.U.r * .5, W - e.U.r * .5); e.z = clamp(e.z, -L + .3, L - .3);
    if (map.river && !e.U.fly && Math.abs(e.z) < RW && !bridgeAt(e.x)) e.z = ((toward ?? e.z) >= 0 ? 1 : -1) * RW;
  }

  /* ---------- damage ---------- */
  const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) - a.U.r - b.U.r;
  const near = (o, x, z, r) => Math.hypot(o.x - x, o.z - z) <= r + o.U.r * .5;
  const ignite = (o, t, dps) => { if (o.U.fireproof) return; o.bt = Math.max(o.bt, t); o.bd = Math.max(o.bd, dps); };      // set alight, unless it cannot be
  /* how: 'hit' (an attack), 'area' (a spell or blast), 'dot' (burning, poison, thorns) */
  function hurt(o, dmg, src, how = 'hit'){
    if (o.hp <= 0 || dmg <= 0) return;
    if (o.mk > 0) dmg *= 1.3;                                                 // marked: everything hurts more
    if (how !== 'dot'){
      if (o.gd > 0) dmg *= .8;                                                // standing near someone who toughens his side up
      if (o.U.tough && o.hp < o.max * o.U.tough.at) dmg *= 1 - o.U.tough.cut;  // pulled into its shell
      if (o.U.deflect && (how === 'area' || (src && src.U.rng > 1.5))) dmg *= 1 - o.U.deflect;      // arrows and spells mostly pass through
    }
    const thru = how === 'hit' && src && src.U.pierce;                        // some attacks go straight through armour and shields
    if (o.U.armor && how !== 'dot' && !thru) dmg = Math.max(dmg * .3, dmg - o.U.armor * lvlMul(o.lvl));     // armour takes a flat bite out of every hit: hordes bounce off
    if (o.sh > 0 && !thru){ const a = Math.min(o.sh, dmg); o.sh -= a; dmg -= a; if (o.sh <= 0){ o.sh = 0; o.wd = 0; emit({e:'shbreak', id:o.id}); } if (dmg <= 0) return; }
    if (src && !src.U.twr && src.team !== o.team && tally[src.pid]) tally[src.pid][src.key] = (tally[src.pid][src.key] || 0) + Math.min(dmg, o.hp);      // who did the work, for the result screen
    o.hp -= dmg;
    if (o.key === 'king' && !o.active){ o.active = true; emit({e:'king', team:o.team}); }
    if (o.hp <= 0){ kill(o, src); return; }
    if (o.U.morph && o.hp <= o.max * o.U.morph.at){ morph(o); return; }
    // someone is hitting me: unless I am busy with a fight of my own, turn on them rather than walk on
    if (src && src.hp > 0 && how === 'hit' && !o.U.bld && o.U.only !== 'b' && o.U.dmg && ok(o, src) && !(src.key === 'princess' && o.ln && (src.x > 0) !== (o.ln > 0))){      // (not on the far guard tower: a troop keeps to its side even under fire)
      const cur = byId.get(o.tgt);
      if (!(o.lock && cur && cur.hp > 0 && !cur.U.bld) && gap(o, src) <= SIGHT + 3){ o.tgt = src.id; o.lock = false; }
    }
  }
  function morph(o){
    const n = add(o.U.morph.u, o.team, o.x, o.z, o.lvl, 8, o.U.aff, o.pid, o.bm);
    emit({e:'morph', id:o.id, to:n.id}); o.hp = 0; o.gone = true;
  }
  function kill(o, killer){
    const U = o.U;
    if (U.revive && !o.rev && !o.gone){ o.rev = 1; o.hp = Math.max(1, Math.round(o.max * U.revive)); o.frz = T(1.4); o.bt = o.pt = o.mk = o.wk = 0; emit({e:'revive', id:o.id});
      if (U.rise){ zones.push({kind:'blast', team:o.team, pid:o.pid, x:o.x, z:o.z, r:U.rise.r, dmg:U.rise.dmg * lvlMul(o.lvl) * o.bm, twr:.4, t:T(.35), frz:0, pool:null, lvl:o.lvl, air:1, burn:U.rise.burn ? U.rise.burn * lvlMul(o.lvl) : 0}); emit({e:'fuse', x:o.x, z:o.z, r:U.rise.r, d:.35, k:o.key}); }   // it goes up in flames, and comes back out of them
      return; }
    if (!U.bld && !o.gone && !o.wished && !U.kamikaze && !U.life && o.max >= 240){                       // a genie nearby with a wish left: back on its feet
      const g = ents.find(e => e.U.bless && e.wish > 0 && e.hp > 0 && e.dep <= 0 && e !== o && e.team === o.team && Math.hypot(e.x - o.x, e.z - o.z) <= e.U.bless.r);
      if (g){ g.wish--; o.wished = 1; o.hp = Math.max(1, Math.round(o.max * g.U.bless.hp)); o.frz = T(1.2); o.bt = o.pt = o.mk = o.wk = 0; emit({e:'revive', id:o.id}); emit({e:'wish', id:g.id, n:g.wish}); return; }
    }
    o.hp = 0;
    if (o.by){ const r = byId.get(o.by); if (r) r.rn = Math.max(0, r.rn - 1); }
    if (U.split) for (let i = 0; i < U.split.n; i++){ const a = i / U.split.n * 6.283 + .6; constrain(add(U.split.u, o.team, o.x + Math.cos(a) * .5, o.z + Math.sin(a) * .5, o.lvl, 6, U.aff, o.pid, o.bm), o.x, o.z); }
    if (U.death){ const d = U.death.delay || .1; zones.push({kind:'blast', team:o.team, pid:o.pid, x:o.x, z:o.z, r:U.death.r, dmg:U.death.dmg * lvlMul(o.lvl) * o.bm, twr:.5, t:T(d), frz:U.death.frz || 0, pool:U.death.pool || null, lvl:o.lvl}); emit({e:'fuse', x:o.x, z:o.z, r:U.death.r, d, k:o.key}); }
    if (killer && killer.hp > 0 && killer.U.grow && killer.gs < killer.U.grow.max && !U.twr){ killer.gs++; killer.dmg = Math.round(killer.d0 * (1 + killer.U.grow.per * killer.gs)); emit({e:'grow', id:killer.id, n:killer.gs}); }
    if (killer && killer.hp > 0 && !U.twr){
      const K = killer.U;
      if (K.frenzy) killer.rage = Math.max(killer.rage, T(K.frenzy));          // every kill is a second wind
      if (K.infect && !U.bld && !o.gone && o.key !== K.infect.u && killer.rn < (K.infect.max || 4)){ const n = add(K.infect.u, killer.team, o.x, o.z, killer.lvl, 14, K.aff, killer.pid, killer.bm); n.by = killer.id; killer.rn++; constrain(n, o.x, o.z); emit({e:'raise', id:killer.id, x:o.x, z:o.z}); }
      if (K.pyre && o.bt > 0 && !U.bld){ zones.push({kind:'blast', team:killer.team, pid:killer.pid, x:o.x, z:o.z, r:K.pyre.r, dmg:K.pyre.dmg * lvlMul(killer.lvl) * killer.bm, twr:.3, t:T(.25), frz:0, pool:null, lvl:killer.lvl, burn:K.burn ? K.burn.dps * lvlMul(killer.lvl) : 0}); emit({e:'fuse', x:o.x, z:o.z, r:K.pyre.r, d:.25, k:killer.key}); }
    }
    if (!U.bld && !U.twr) for (const e of ents){
      if (e.hp <= 0 || e.dep > 0 || e === o) continue;
      const d = Math.hypot(e.x - o.x, e.z - o.z);
      if (e.U.feast && d <= 4.5 && e.hp < e.max){ e.hp = Math.min(e.max, e.hp + e.max * e.U.feast); emit({e:'heal', id:e.id, r:1}); }      // a scavenger eats well
      if (e.U.shatter && e.team !== o.team && d <= e.U.shatter.r){ zones.push({kind:'blast', team:e.team, pid:e.pid, x:o.x, z:o.z, r:e.U.shatter.br, dmg:(e.U.shatter.dmg || 0) * lvlMul(e.lvl) * e.bm, twr:0, t:T(.2), frz:e.U.shatter.t, pool:null, lvl:e.lvl}); emit({e:'fuse', x:o.x, z:o.z, r:e.U.shatter.br, d:.2, k:e.key}); }
    }
    if (killer && killer.hp > 0 && killer.U.loot && !U.twr){ const pl = players[killer.pid]; if (pl){ pl.el = Math.min(MAX_EL, pl.el + killer.U.loot); emit({e:'mana', id:killer.id, amt:killer.U.loot, pid:killer.pid}); } }   // plunder
    if (!U.bld){                                                               // the dead do not stay down near a necromancer
      for (const e of ents) if (e.U.raise && e.hp > 0 && e.dep <= 0 && e !== o && e.rn < e.U.raise.max && e.rc <= tick && Math.hypot(e.x - o.x, e.z - o.z) <= e.U.raise.r){
        const n = add(e.U.raise.u, e.team, o.x, o.z, e.lvl, 12, e.U.aff, e.pid, e.bm); n.by = e.id; e.rn++; e.rc = tick + T(e.U.raise.cd); constrain(n, o.x, o.z);
        emit({e:'raise', id:e.id, x:o.x, z:o.z}); break;
      }
    }
    if (U.twr){
      crowns[1 - o.team] = o.key === 'king' ? 3 : Math.min(3, crowns[1 - o.team] + 1);
      emit({e:'tower', team:o.team, king:o.key === 'king', x:o.x, z:o.z});
      const k = kingOf(o.team);
      if (o.key === 'king'){ finish(1 - o.team); }
      else { if (!k.active && k.hp > 0){ k.active = true; emit({e:'king', team:o.team}); } if (phase === 'ot') finish(1 - o.team); }
    }
  }
  /* what an attack leaves behind on whatever it hits. u: the attacker's stats. */
  function afflict(o, u, lv, src, st){
    if (o.hp <= 0 || o.U.twr) return;
    if (u.chill) o.slow = Math.max(o.slow, T(u.chill));
    if (u.burn) ignite(o, T(u.burn.t), u.burn.dps * lv);
    if (u.sap && !o.U.bld) o.wk = Math.max(o.wk, T(u.sap));
    if (u.brew){ const k = Math.floor(rnd() * 3); if (k === 0) ignite(o, T(3), u.brew * lv); else if (k === 1) o.slow = Math.max(o.slow, T(2.5)); else { o.pt = Math.max(o.pt, T(4)); o.pd = Math.max(o.pd, u.brew * lv); } }      // nobody knows what is in the flask, him included
    if (u.psn){ o.pt = Math.max(o.pt, T(u.psn.t)); o.pd = Math.max(o.pd, u.psn.dps * lv); }
    if (u.mark) o.mk = Math.max(o.mk, T(u.mark.t));
    if (st) o.frz = Math.max(o.frz, T(st));
    if (u.knock && src && !o.U.bld && o.U.r < .9){ const dx = o.x - src.x, dz = o.z - src.z, d = Math.hypot(dx, dz) || 1; o.x += dx / d * u.knock; o.z += dz / d * u.knock; ashore(o, src.z); o.run = 0; o.chg = false; }
  }
  /* everything of the other side inside a circle. o: {air, twr, bld, chill, src, how, each(ent)} */
  function area(x, z, r, dmg, team, o = {}){
    for (const e of ents.slice()){
      if (e.team === team || e.hp <= 0 || e.dep > 0 || (e.U.fly && !o.air) || (o.fire && e.U.fireproof)) continue;
      if (!near(e, x, z, r)) continue;
      if (o.chill && !e.U.twr) e.slow = Math.max(e.slow, T(o.chill));
      hurt(e, dmg * (e.U.twr ? o.twr ?? 1 : e.U.bld ? o.bld ?? 1 : 1), o.src, o.how || 'area');
      if (o.each && e.hp > 0) o.each(e);
    }
  }
  /* ---------- traps ---------- */
  const foot = (o, team) => o.team !== team && o.hp > 0 && o.dep <= 0 && !o.U.bld && !o.U.twr && !o.U.fly;      // who a trap can catch: enemy troops on the ground
  function spring(tr, hit){
    emit({e:'trap', k:tr.kind, x:tr.x, z:tr.z, r:tr.r, team:tr.team, id:tr.card, t:tr.dur || 0});
    const all = ents.filter(o => foot(o, tr.team) && near(o, tr.x, tr.z, tr.r));
    if (hit && !all.includes(hit)) all.push(hit);
    if (tr.kind === 'mirror') tr.live = T(tr.dur); else traps.splice(traps.indexOf(tr), 1);        // Instant Replay stays up as a zone that throws damage back
    if (tr.chill) for (const o of all) o.slow = Math.max(o.slow, T(tr.chill + tr.stun));
    if (tr.kind === 'slip'){ for (const o of all){ o.frz = Math.max(o.frz, T(tr.stun)); hurt(o, tr.dmg, null, 'area'); } }
    else if (tr.kind === 'snap'){ for (const o of all) hurt(o, tr.dmg, null, 'area'); }
    else if (tr.kind === 'bounce' && hit.hp > 0){                                                 // back to in front of their own king tower
      hit.x = clamp(hit.x * .45, -2.6, 2.6); hit.z = (hit.team === 0 ? 1 : -1) * (L - 5.6); hit.frz = Math.max(hit.frz, T(tr.stun)); hit.tgt = 0; hit.lock = false; hit.run = 0; hit.chg = false; hit.lp = 0;
      emit({e:'warp', id:hit.id, x:hit.x, z:hit.z});
      hurt(hit, tr.dmg, null, 'area');
    }
    if (tr.burst){ for (const o of all) hurt(o, tr.burst, null, 'area'); emit({e:'boom', k:'tox', x:tr.x, z:tr.z, r:tr.r, team:tr.team}); }
    if (tr.heal){
      let w = null; for (const o of ents) if (o.U.twr && o.team === tr.team && o.hp > 0 && o.hp < o.max && (!w || o.hp / o.max < w.hp / w.max)) w = o;
      if (w){ w.hp = Math.min(w.max, w.hp + tr.heal); emit({e:'heal', id:w.id, r:2.4}); }
    }
  }
  /* each player's troop that did the most damage in the match: [unit key, damage], or null if nothing of theirs landed a blow */
  const mvp = () => tally.map(t => { let k = null, v = 0; for (const q in t) if (t[q] > v){ v = t[q]; k = q; } return k ? [k, Math.round(v)] : null; });
  function finish(w){ if (over) return; over = true; winner = w; phase = 'over'; emit({e:'over', w, cr:crowns.slice(), mv:mvp()}); }

  /* ---------- targeting ---------- */
  const ok = (e, o) => o && o.hp > 0 && o.dep <= 0 && !o.hid && !(o.U.fly && !e.U.air) && !(e.U.only === 'b' && !o.U.bld);
  function acquire(e){
    const U = e.U, cur = byId.get(e.tgt);
    if (e.lock && ok(e, cur) && gap(e, cur) <= U.rng + .3) return;          // mid-fight: finish what you started
    e.lock = false;
    let best = null, bd = 1e9, twr = null, td = 1e9, call = null, cd = 1e9, help = null, hd = 1e9;
    const lt = U.bld ? null : laneTower(e);
    for (const o of ents){
      if (o.team === e.team || !ok(e, o)) continue;
      if (o.key === 'princess' && e.ln && (o.x > 0) !== (e.ln > 0)) continue;      // the guard tower on the other side of the field is not this troop's business
      const d = gap(e, o);
      if (d < bd){ bd = d; best = o; }
      if (o.U.twr && d < td){ td = d; twr = o; }
      if (o.U.taunt && d <= o.U.taunt && d < cd){ cd = d; call = o; }             // some things are impossible to ignore
      if (!o.U.bld && d <= HELP && d < hd && (o.lock || o.cd > 0)){ hd = d; help = o; }   // an enemy busy hitting my side, a little further off
    }
    if (U.bld) e.tgt = best && bd <= U.rng ? best.id : 0;
    else if (call) e.tgt = call.id;
    else if (best && (bd <= SIGHT || U.only === 'b')) e.tgt = (bd > (best.U.twr ? SIGHT : 9) ? lt || best : best).id;      // a building far across the field does not drag a giant out of its lane
    else if (help && U.only !== 'b') e.tgt = help.id;                          // nothing in front of me, but a teammate is in a fight nearby: go and help
    else { const t = lt || twr; e.tgt = t ? t.id : 0; }
  }
  /* Where a troop with nothing better to do is headed: the guard tower on its own side of the field, and once that one is down, the king.
     Never across the field to the other guard tower, however near it happens to be. Its side is the one it was last on (e.ln), so a troop
     funnelled over a bridge in the middle still knows where it came from; one that has only ever been in the middle takes the nearer guard tower. */
  function laneTower(e){
    if (Math.abs(e.x) >= 1.2) e.ln = e.x > 0 ? 1 : -1;
    const en = towers[1 - e.team]; let g = null;
    for (const t of [en[1], en[2]]) if (t.hp > 0 && (!e.ln || (t.x > 0) === (e.ln > 0)) && (!g || gap(e, t) < gap(e, g))) g = t;
    return g || (en[0].hp > 0 ? en[0] : null);
  }
  function attack(e, t){
    const U = e.U;
    if (U.kamikaze){ kill(e); return; }                                         // he is the bomb: what he leaves behind does the damage
    e.cd = U.hit * TPS; e.lock = true;
    let dmg = e.dmg, st = 0, big = false;
    if (e.chg){ dmg *= U.charge.dmg; if (U.charge.stun) st = U.charge.stun; e.chg = false; big = true; }
    if (e.jmp){ dmg *= U.leap.mul; e.jmp = false; big = true; }
    if (e.hid){ dmg *= U.stealth.mul; e.hid = false; big = true; emit({e:'reveal', id:e.id}); }
    if (U.stealth) e.ht = T(U.stealth.re);
    e.hits++;
    if (U.crit && e.hits % U.crit.every === 0){ dmg *= U.crit.mul; big = true; }
    if (U.stun && e.hits % U.stun.every === 0) st = Math.max(st, U.stun.t);
    if (U.exec && t.hp < t.max * U.exec.at && !t.U.twr){ dmg *= U.exec.mul; big = true; }
    if (U.first && e.ft !== t.id){ e.ft = t.id; if (!t.U.twr){ dmg *= U.first.mul; big = true; } }      // the opening cut on every new opponent
    if (U.brittle && !t.U.twr && (t.slow > 0 || t.frz > 0)){ dmg *= U.brittle; big = true; }      // cold things shatter
    if (U.raze && t.U.bld) dmg *= U.raze;                                     // built for knocking things down
    if (U.wild){ const k = .5 + rnd() * 2.5; dmg *= k; if (k > 2.2) big = true; }      // anything from a tap to a haymaker
    if (e.mt > 0) dmg *= 1.25;                                                // fighting beside someone who makes the whole side hit harder
    if (e.wk > 0) dmg *= .7;                                                  // rattled: standing near something that frightens it
    if (t.U.twr && (U.any || U.stealth)) dmg *= U.any ? .35 : .5;              // whoever sneaks up on a tower is there for the troops, not the masonry
    if (t.U.twr && U.chip) dmg *= U.chip;                                     // and bones only chip at stone
    if (U.pack){ let n = 0; for (const o of ents) if (o !== e && o.team === e.team && o.key === e.key && o.hp > 0 && Math.hypot(o.x - e.x, o.z - e.z) <= U.pack.r) n++; dmg *= 1 + U.pack.per * Math.min(U.pack.max, n); }
    if (U.ramp){ if (e.rt === t.id) e.rs = Math.min(U.ramp.max, e.rs + U.ramp.step); else { e.rs = 0; e.rt = t.id; } dmg *= 1 + e.rs; }
    e.run = 0;
    if (U.steal && e.hp < e.max) e.hp = Math.min(e.max, e.hp + dmg * U.steal);
    emit(big ? {e:'atk', id:e.id, t:t.id, big:1} : {e:'atk', id:e.id, t:t.id});
    const p = {tgt:t.id, x:t.x, z:t.z, dmg, splash:U.splash || 0, team:e.team, air:!!U.air, src:e.id, u:U, lv:lvlMul(e.lvl), st};
    if (U.eject && e.hits % U.eject.every === 0 && !t.U.bld && t.U.r < .9) p.eject = 1;      // red card
    if (U.shot && U.rng > 1.5){
      const d = U.shot === 'sky' ? SKY_WIND : U.shot === 'shell' ? 1.3 : clamp((gap(e, t) + e.U.r) / PROJ_SPD, .14, .9);      // nothing flies from a raised hammer: the bolt lands when it lands. A mortar shell goes up before it comes down
      p.t = T(U.shot === 'beam' || U.shot === 'zap' ? .08 : d);
      emit({e:'shot', id:e.id, t:t.id, d:U.shot === 'beam' || U.shot === 'zap' ? .08 : d, k:U.shot});
    } else { p.t = T(U.wind ?? .24); p.melee = 1; }       // a melee hit lands when the swing does, and not at all if the attacker drops first
    projs.push(p);
  }
  /* an attack arrives */
  function land(p){
    const t = byId.get(p.tgt), src = p.src ? byId.get(p.src) : null, u = p.u;
    if (p.melee && !src) return;
    if (src && src.hp > 0 && !src.U.twr) for (const tr of traps) if (tr.live > 0 && tr.team !== src.team && Math.hypot(src.x - tr.x, src.z - tr.z) <= tr.r){ emit({e:'reflect', id:src.id}); hurt(src, p.dmg * tr.refl, null, 'dot'); break; }   // standing in the other side's Instant Replay
    if (p.splash){
      area(p.x, p.z, p.splash, p.dmg, p.team, {air:p.air, src, how:'hit', each:o => afflict(o, u, p.lv, src, p.st)});
      if (u.mend){ let any = false; for (const o of ents) if (o.team === p.team && o.hp > 0 && !o.U.bld && o.hp < o.max && near(o, p.x, p.z, p.splash + .8)){ o.hp = Math.min(o.max, o.hp + u.mend * p.lv); any = true; } if (any) emit({e:'heal', x:p.x, z:p.z, r:p.splash + .8}); }      // the same brew mends her own side
      return;
    }
    if (!t || t.hp <= 0) return;
    if (t.U.dodge && rnd() < t.U.dodge){
      emit({e:'dodge', id:t.id});
      if (t.U.riposte && p.melee && src && src.hp > 0 && t.frz <= 0){ emit({e:'atk', id:t.id, t:src.id, big:1}); hurt(src, t.dmg * t.U.riposte, t); }      // slips the punch and answers it
      return;
    }
    hurt(t, p.dmg, src); afflict(t, u, p.lv, src, p.st);
    if (src && src.hp > 0){
      if (p.melee && (t.U.thorns || t.tb > 0)) hurt(src, p.dmg * Math.max(t.U.thorns || 0, t.tb > 0 ? .3 : 0), null, 'dot');
      if (t.U.mirror && !src.U.twr && src.hp > 0) hurt(src, p.dmg * t.U.mirror, null, 'dot');      // whatever is done to the doll is done to whoever did it
      if (p.melee && t.U.sear && src.hp > 0) ignite(src, T(t.U.sear.t), t.U.sear.dps * lvlMul(t.lvl));
      if (p.melee && t.U.numb) src.slow = Math.max(src.slow, T(t.U.numb));
      if (p.melee && t.U.curse && !src.U.twr) src.mk = Math.max(src.mk, T(t.U.curse));
      if (u.rob && !t.U.bld && src.hp > 0){ const vp = players[t.pid], mp = players[src.pid]; if (vp && mp && tm(t.pid) !== tm(src.pid)){ const a = Math.min(vp.el, u.rob); if (a > 0){ vp.el -= a; mp.el = Math.min(MAX_EL, mp.el + a); emit({e:'mana', id:src.id, amt:+a.toFixed(2), pid:src.pid, steal:1}); } } }
      if (u.siphon && src.hp > 0){ let w = null; for (const o of ents) if (o.team === src.team && o !== src && o.hp > 0 && !o.U.bld && o.hp < o.max && Math.hypot(o.x - src.x, o.z - src.z) <= u.siphon.r && (!w || o.hp / o.max < w.hp / w.max)) w = o; if (w){ w.hp = Math.min(w.max, w.hp + p.dmg * u.siphon.frac); emit({e:'heal', id:w.id, r:1}); } }
      if (u.lock && t.U.bld && t.hp > 0) t.frz = Math.max(t.frz, T(u.lock));      // the door is locked: that building or tower cannot fire for a moment
      if (u.leech && t.U.twr){ const pl = players[src.pid]; if (pl){ pl.el = Math.min(MAX_EL, pl.el + u.leech); emit({e:'mana', id:src.id, amt:u.leech, pid:src.pid, steal:1}); } }
    }
    if (p.eject && t.hp > 0 && !t.U.twr){ t.x = clamp(t.x * .45, -2.6, 2.6); t.z = (t.team === 0 ? 1 : -1) * (L - 5.6); t.frz = Math.max(t.frz, T(1)); t.tgt = 0; t.lock = false; t.run = 0; t.chg = false; t.lp = 0; emit({e:'warp', id:t.id, x:t.x, z:t.z}); }      // sent off: back to its own king tower
    const sky = u.shot === 'sky';
    if (u.chain || sky){                                                    // the bolt jumps on to whoever is nearest, a little weaker each time
      const done = new Set([t.id]), pts = [[t.x, t.z, t.U.fly ? 1 : 0]]; let from = t, d = p.dmg;
      for (let i = 0; i < (u.chain ? u.chain.n : 0); i++){
        let nx = null, nd = u.chain.r;
        for (const o of ents){ if (o.team === p.team || o.hp <= 0 || o.dep > 0 || o.hid || done.has(o.id) || (o.U.fly && !p.air)) continue; const q = Math.hypot(o.x - from.x, o.z - from.z); if (q <= nd){ nd = q; nx = o; } }
        if (!nx) break;
        d *= u.chain.fall; done.add(nx.id); pts.push([nx.x, nx.z, nx.U.fly ? 1 : 0]); hurt(nx, d, src); afflict(nx, u, p.lv, src, p.st); from = nx;
      }
      if (sky) emit({e:'bolt', pts, q:1});                                // called down from the sky: every one of them gets a bolt of its own
      else if (pts.length > 1) emit({e:'chain', pts});
    }
  }
  /* a unit finishes dropping in: whatever it does on arrival happens now */
  function arrive(e){
    const U = e.U, a = U.land, lv = lvlMul(e.lvl) * e.bm;
    if (U.charge && U.charge.dash){ e.chg = true; emit({e:'charge', id:e.id}); }
    if (U.smite || U.reap){                                  // a god arrives, and the whole field feels it: every enemy, wherever it stands
      const pts = [];
      for (const o of ents.slice()){
        if (o.team === e.team || o.hp <= 0 || o.dep > 0) continue;
        if (U.smite){ hurt(o, U.smite.dmg * lv * (o.U.twr ? U.smite.twr ?? .3 : 1), e, 'area'); if (U.smite.stun && !o.U.twr && o.hp > 0) o.frz = Math.max(o.frz, T(U.smite.stun)); pts.push([o.x, o.z]); }
        else if (!o.U.twr){ hurt(o, o.max * U.reap, e, 'area'); pts.push([o.x, o.z]); }      // the reaping takes a share of what each one started with. Towers are not his to take
      }
      emit({e:'godfall', id:e.id, x:e.x, z:e.z, team:e.team, k:U.smite ? 'smite' : 'reap', pts});
    }
    if (!a) return;
    if (a.dmg || a.stun || a.slow || a.push || a.weak) area(e.x, e.z, a.r, (a.dmg || 0) * lv, e.team, {air:!!U.air, twr:.4, src:e, each:o => {      // a troop that cannot reach the sky does not shake it by landing either
      if (o.U.twr) return;
      if (a.stun) o.frz = Math.max(o.frz, T(a.stun));
      if (a.slow) o.slow = Math.max(o.slow, T(a.slow));
      if (a.weak && !o.U.bld) o.wk = Math.max(o.wk, T(a.weak));
      if (a.burn && U.burn) ignite(o, T(U.burn.t), U.burn.dps * lv);
      if (a.push && !o.U.bld && o.U.r < .9){ const dx = o.x - e.x, dz = o.z - e.z, d = Math.hypot(dx, dz) || 1; o.x += dx / d * a.push; o.z += dz / d * a.push; ashore(o, e.z); }
    }});
    if (a.shield) for (const o of ents) if (o.team === e.team && o.hp > 0 && !o.U.twr && near(o, e.x, e.z, a.r)) o.sh = Math.max(o.sh, Math.round(a.shield * lv));
    if (a.rage) for (const o of ents) if (o.team === e.team && o.hp > 0 && !o.U.bld && near(o, e.x, e.z, a.r)) o.rage = Math.max(o.rage, T(a.rage));
    if (a.summon) for (let i = 0; i < a.summon.n; i++){ const ring = Math.floor(i / 10), per = Math.min(10, a.summon.n - ring * 10), q = 1.3 + ring * .85, an = (i % 10) / per * 6.283 + .4 + ring * .31;      // ten to a ring, each ring further out
      const n = add(a.summon.u, e.team, clamp(e.x + Math.cos(an) * q, -W + .4, W - .4), clamp(e.z + Math.sin(an) * q, -L + .4, L - .4), e.lvl, 8 + ring * 3, U.aff, e.pid, e.bm); n.by = e.id; e.rn++; ashore(n, e.z); }
    emit({e:'land', id:e.id, x:e.x, z:e.z, r:a.r, k:a.stun ? 'stun' : a.burn ? 'fire' : a.slow ? 'frost' : a.weak || a.rage ? 'roar' : a.shield ? 'shield' : a.summon ? 'summon' : 'slam'});
  }

  /* ---------- spells and the things they leave on the ground ---------- */
  function strike(zn){                                     // the moment a spell lands
    const k = zn.kind, mine = o => o.team === zn.team && o.hp > 0 && near(o, zn.x, zn.z, zn.r);
    if (k === 'rage'){ for (const o of ents) if (mine(o) && !o.U.twr) o.rage = T(zn.rage); }
    else if (k === 'heal' || k === 'grave' || k === 'tornado' || k === 'fire'){ /* these work over time: see pulse */ }
    else if (k === 'ward'){ for (const o of ents) if (mine(o)){ o.sh = Math.max(o.sh, Math.round(zn.shield)); o.wd = zn.dur; } }
    else if (k === 'bolt'){
      const hit = ents.filter(o => o.team !== zn.team && o.hp > 0 && o.dep <= 0 && near(o, zn.x, zn.z, zn.r)).sort((a, b) => b.hp - a.hp).slice(0, zn.n || 3);
      emit({e:'bolt', pts:hit.map(o => [o.x, o.z])});
      for (const o of hit){ hurt(o, zn.dmg * (o.U.twr ? zn.twr : 1), null, 'area'); if (o.hp > 0 && zn.stun) o.frz = Math.max(o.frz, T(zn.stun)); }
    } else {
      if (k === 'freeze'){ for (const o of ents) if (o.team !== zn.team && o.hp > 0 && o.dep <= 0 && near(o, zn.x, zn.z, zn.r)) o.frz = Math.max(o.frz, T(zn.freeze)); }
      area(zn.x, zn.z, zn.r, zn.dmg, zn.team, {air:!zn.ground, twr:zn.twr, bld:zn.bld, chill:zn.chill || (zn.slow && k !== 'poison' ? zn.slow : 0), each:o => {
        if (o.U.twr) return;
        if (zn.stun) o.frz = Math.max(o.frz, T(zn.stun));
        if (zn.frz) o.frz = Math.max(o.frz, T(zn.frz));
        if (zn.burn) ignite(o, T(3), zn.burn);
        if (zn.knock && !o.U.bld && o.U.r < .9){ const dx = o.x - zn.x, dz = o.z - zn.z, d = Math.hypot(dx, dz) || 1; o.x += dx / d * zn.knock; o.z += dz / d * zn.knock; ashore(o, zn.z); }
      }});
      if (zn.steal) for (const o of ents) if (mine(o) && !o.U.bld) o.hp = Math.min(o.max, o.hp + zn.dmg * zn.steal);
      if (zn.pool){ zones.push({kind:'fire', team:zn.team, pid:zn.pid, x:zn.x, z:zn.z, r:zn.r * .8, dmg:zn.pool.dps * lvlMul(zn.lvl || 1), twr:.2, t:0, live:T(zn.pool.t), every:TPS, tk:0}); emit({e:'pool', x:zn.x, z:zn.z, r:zn.r * .8, t:zn.pool.t, team:zn.team}); }
    }
    emit({e:'boom', k, x:zn.x, z:zn.z, r:zn.r, team:zn.team});
  }
  function pulse(zn){                                      // once a second for as long as it lasts
    const k = zn.kind;
    if (k === 'poison') area(zn.x, zn.z, zn.r, zn.dmg, zn.team, {air:true, twr:zn.twr, how:'dot', chill:1.2});
    else if (k === 'fire') area(zn.x, zn.z, zn.r, zn.dmg, zn.team, {air:false, twr:zn.twr, how:'dot', fire:1});
    else if (k === 'tornado') area(zn.x, zn.z, zn.r, zn.dmg, zn.team, {air:true, twr:0, bld:0, how:'dot'});
    else if (k === 'heal'){ let any = false; for (const o of ents) if (o.team === zn.team && o.hp > 0 && !o.U.bld && o.hp < o.max && near(o, zn.x, zn.z, zn.r)){ o.hp = Math.min(o.max, o.hp + zn.heal); any = true; } if (any) emit({e:'heal', x:zn.x, z:zn.z, r:zn.r}); }
    else if (k === 'grave'){ const a = rnd() * 6.283, q = Math.sqrt(rnd()) * zn.r * .85, n = add(zn.u, zn.team, clamp(zn.x + Math.cos(a) * q, -W + .5, W - .5), clamp(zn.z + Math.sin(a) * q, -L + .5, L - .5), zn.lvl, 12, zn.aff, zn.pid, zn.bm); ashore(n, zn.team === 0 ? 1 : -1); emit({e:'raise', id:0, x:n.x, z:n.z}); }
  }

  /* ---------- one tick ---------- */
  function step(){
    if (over) return;
    tick++;
    const left = timeLeft(), rate = manaRate(left, phase === 'ot');
    for (let i = 0; i < players.length; i++){ const p = players[i]; p.idle++; p.el = Math.min(MAX_EL, p.el + DT / 2.8 * rate * (p.idle > PATIENT ? 1.3 : 1) * (elMul[i] ?? 1)); }   // holding off on summoning charges Mana faster

    for (let i = zones.length - 1; i >= 0; i--){
      const zn = zones[i];
      if (zn.t > 0){
        if (--zn.t > 0) continue;
        if (zn.spell){                                           // a Technical Foul near where it lands cancels it
          const tr = traps.find(q => q.kind === 'counter' && q.team !== zn.team && q.arm <= 0 && Math.hypot(q.x - zn.x, q.z - zn.z) <= q.r + zn.r * .5);
          if (tr){ const pl = players[zn.pid]; if (pl && tr.burn) pl.el = Math.max(0, pl.el - tr.burn); spring(tr, null); emit({e:'negate', x:zn.x, z:zn.z, r:zn.r, team:zn.team, pid:zn.pid, burn:tr.burn}); zones.splice(i, 1); continue; }
          if (zn.dmg > 0) for (let j = traps.length - 1; j >= 0; j--){ const q = traps[j];               // a spell that does damage clears any hidden trap it lands on
            if (q.team !== zn.team && !q.live && Math.hypot(q.x - zn.x, q.z - zn.z) <= zn.r){ traps.splice(j, 1); emit({e:'trapx', x:q.x, z:q.z, team:q.team, id:q.card}); } }
        }
        strike(zn);
        if (zn.live > 0){ zn.tk = 0; continue; }
        zones.splice(i, 1); continue;
      }
      if (--zn.live <= 0){ zones.splice(i, 1); continue; }
      if (zn.kind === 'tornado') for (const o of ents){                         // dragged toward the middle
        if (o.team === zn.team || o.hp <= 0 || o.dep > 0 || o.U.bld || !near(o, zn.x, zn.z, zn.r)) continue;
        const dx = zn.x - o.x, dz = zn.z - o.z, d = Math.hypot(dx, dz); if (d > .25){ const s = Math.min(d, 4.6 * DT); o.x += dx / d * s; o.z += dz / d * s; ashore(o, zn.z); o.lock = false; }
      }
      if (++zn.tk >= zn.every){ zn.tk = 0; pulse(zn); }
    }
    for (let i = projs.length - 1; i >= 0; i--){
      const p = projs[i], t = byId.get(p.tgt);
      if (t && t.hp > 0){ p.x = t.x; p.z = t.z; }
      if (--p.t > 0) continue;
      projs.splice(i, 1); land(p);
    }

    // traps: armed a moment after they are set, then sprung by the first enemy on foot to walk over them
    for (let i = traps.length - 1; i >= 0; i--){
      const tr = traps[i];
      if (tr.arm > 0){ tr.arm--; continue; }
      if (tr.live > 0){ if (--tr.live <= 0) traps.splice(i, 1); continue; }
      if (--tr.life <= 0){ traps.splice(i, 1); continue; }
      if (tr.kind === 'counter') continue;                     // that one waits for a spell, not for feet
      for (const o of ents) if (foot(o, tr.team) && Math.hypot(o.x - tr.x, o.z - tr.z) <= TRIG + o.U.r * .5){ spring(tr, o); break; }
    }
    const n = ents.length;
    for (let i = 0; i < n; i++){
      const e = ents[i], U = e.U;
      if (e.hp <= 0) continue;
      if (e.dep > 0){ if (--e.dep <= 0) arrive(e); continue; }
      if (U.life){ e.hp -= e.max / (U.life * TPS); if (e.hp <= 0){ kill(e); continue; } }
      const beat = (tick + e.id) % 10 === 0;                                   // twice a second: burning, poison, healing over time, auras
      if (e.bt > 0){ e.bt--; if (beat) hurt(e, e.bd * .5, null, 'dot'); if (e.bt <= 0) e.bd = 0; }
      if (e.pt > 0){ e.pt--; if (beat) hurt(e, e.pd * .5, null, 'dot'); if (e.pt <= 0) e.pd = 0; }
      if (e.hp <= 0) continue;
      if (e.mk > 0) e.mk--;
      if (e.wk > 0) e.wk--;
      if (e.mt > 0) e.mt--; if (e.gd > 0) e.gd--; if (e.tb > 0) e.tb--;
      if (U.stoic) e.frz = e.slow = e.wk = 0;                                 // nothing stops it, slows it or shakes it
      if (U.recharge && e.sh < U.recharge.amt && --e.rg <= 0){ e.rg = T(U.recharge.every); e.sh = Math.round(U.recharge.amt * lvlMul(e.lvl) * e.bm); emit({e:'land', id:e.id, x:e.x, z:e.z, r:1, k:'shield'}); }
      if (e.wd > 0 && --e.wd <= 0){ e.sh = 0; emit({e:'shbreak', id:e.id}); }      // a Tower Shield runs out
      if (beat){
        if (U.regen && e.hp < e.max) e.hp = Math.min(e.max, e.hp + e.max * U.regen * .5);
        if (U.aura && e.frz <= 0){ const a = U.aura, lv = lvlMul(e.lvl) * e.bm;
          for (const o of ents){
            if (o.hp <= 0 || o.dep > 0 || o.U.twr || !near(o, e.x, e.z, a.r)) continue;
            if (o.team === e.team){ if (a.haste && (a.bld ? o.U.bld : !o.U.bld)) o.rage = Math.max(o.rage, 14); if (o !== e && !o.U.bld){ if (a.might) o.mt = Math.max(o.mt, 14); if (a.guard) o.gd = Math.max(o.gd, 14); if (a.thorns) o.tb = Math.max(o.tb, 14); } }
            else if (o !== e){ if (a.burn) ignite(o, 20, a.burn * lv); if (a.psn){ o.pt = Math.max(o.pt, 20); o.pd = Math.max(o.pd, a.psn * lv); }
              if (a.weak && !o.U.bld) o.wk = Math.max(o.wk, 14); if (a.slow && !o.U.bld) o.slow = Math.max(o.slow, 14); }
          }
        }
      }
      if (U.mana && --e.mn <= 0){ e.mn = T(U.mana.every); const p = players[e.pid]; if (p){ p.el = Math.min(MAX_EL, p.el + U.mana.amt); emit({e:'mana', id:e.id, amt:U.mana.amt, pid:e.pid}); } }
      if (U.stealth && !e.hid && e.ht > 0 && --e.ht <= 0){ e.hid = true; emit({e:'cloak', id:e.id}); }
      if (e.frz > 0){ e.frz--; e.mv = false; continue; }
      let fast = e.rage > 0 ? 1.35 : 1;
      if (e.rage > 0) e.rage--;
      if (e.slow > 0){ e.slow--; fast *= .62; }
      if (U.berserk) fast *= 1 + (1 - e.hp / e.max) * .9;
      if (U.spawn && (e.sp -= fast) <= 0){
        e.sp = T(U.spawn.every);
        const s = e.team === 0 ? -1 : 1;
        for (let k = 0; k < U.spawn.n; k++){ const a = (k / U.spawn.n - .5) * 1.4; constrain(add(U.spawn.u, e.team, e.x + Math.sin(a) * 1.1, e.z + s * (U.r + .5) * Math.cos(a), e.lvl, 8, U.aff, e.pid, e.bm), e.x, e.z); }
        emit({e:'summon', id:e.id});
      }
      if (U.heal && --e.hl <= 0){
        e.hl = T(U.heal.every);
        let any = false;
        for (const o of ents) if (o.team === e.team && o.hp > 0 && o !== e && (U.heal.bld ? o.U.bld : !o.U.bld) && o.hp < o.max && Math.hypot(o.x - e.x, o.z - e.z) <= U.heal.r + o.U.r * .5){ o.hp = Math.min(o.max, o.hp + U.heal.amt * lvlMul(e.lvl) * e.bm); any = true; }
        if (U.heal.cure) for (const o of ents) if (o.team === e.team && o.hp > 0 && !o.U.bld && Math.hypot(o.x - e.x, o.z - e.z) <= U.heal.r + o.U.r * .5){ o.bt = o.pt = o.bd = o.pd = 0; o.slow = 0; o.mk = 0; o.wk = 0; }      // and whatever ails them is gone
        if (any) emit({e:'heal', id:e.id, r:U.heal.r});
      }
      if (U.wrath && (e.wr -= 1) <= 0){                                       // a bolt out of a clear sky, on whichever enemy troop has the most health left, anywhere at all
        e.wr = T(U.wrath.every); let w = null;
        for (const o of ents) if (o.team !== e.team && o.hp > 0 && o.dep <= 0 && !o.U.twr && !o.hid && (!w || o.hp > w.hp)) w = o;
        if (w){ emit({e:'bolt', pts:[[w.x, w.z]]}); area(w.x, w.z, U.wrath.r, U.wrath.dmg * lvlMul(e.lvl) * e.bm, e.team, {air:true, twr:0, src:e}); }
      }
      if (e.cd > 0) e.cd -= fast;
      if (!e.active || !U.dmg){ e.mv = false; continue; }
      const old = e.tgt;
      if ((tick + e.id) % 4 === 0 || !ok(e, byId.get(e.tgt))) acquire(e);
      const t = byId.get(e.tgt);
      if (!t){ e.mv = false; continue; }
      if (e.tgt !== old && U.load) e.cd = Math.max(e.cd, U.load * TPS);
      else if (e.tgt !== old) e.cd = Math.max(e.cd, 6);
      const d = gap(e, t);
      const dx0 = t.x - e.x, dz0 = t.z - e.z, dl = Math.hypot(dx0, dz0) || 1;
      if (e.lp > 0){                                                          // in the air: straight at the target, over anything in the way
        const sp = Math.min(Math.max(0, d - U.rng * .5), 9 * DT); e.x += dx0 / dl * sp; e.z += dz0 / dl * sp; e.fx = dx0 / dl; e.fz = dz0 / dl; e.mv = true;
        if (--e.lp <= 0 || d <= U.rng){ e.lp = 0; e.jmp = true; e.cd = 0; ashore(e, t.z); }
        continue;
      }
      if (d <= U.rng){
        e.mv = false; e.fx = dx0 / dl; e.fz = dz0 / dl;
        if (e.cd <= 0) attack(e, t);
      } else if (U.spd > 0){
        e.lock = false;
        if (U.leap && e.cd <= 0 && d >= U.leap.min && d <= U.leap.max && (!t.U.fly || U.air)){ e.lp = T(.5); e.cd = T(1.2); emit({e:'leap', id:e.id, t:Math.min(.5, d / 9)}); continue; }
        const [wx, wz] = waypoint(e, t.x, t.z);
        const dx = wx - e.x, dz = wz - e.z, dd = Math.hypot(dx, dz);
        if (dd > 1e-4){
          const sp = Math.min(dd, U.spd * fast * (e.chg ? U.charge.spd : 1) * DT), px = e.x, pz = e.z;
          e.x += dx / dd * sp; e.z += dz / dd * sp; e.fx = dx / dd; e.fz = dz / dd; e.mv = true;
          constrain(e, px, pz);
          if (U.charge && !e.chg && (e.run += sp) >= U.charge.after){ e.chg = true; emit({e:'charge', id:e.id}); }
        }
      }
    }

    // bodies push each other apart; buildings do not move
    for (let i = 0; i < ents.length; i++){
      const a = ents[i];
      if (a.hp <= 0 || a.U.bld || a.dep > 0 || a.lp > 0) continue;
      const px = a.x, pz = a.z;
      for (let j = 0; j < ents.length; j++){
        if (i === j) continue;
        const b = ents[j];
        if (b.hp <= 0 || b.dep > 0 || b.lp > 0 || !!b.U.fly !== !!a.U.fly) continue;
        const dx = a.x - b.x, dz = a.z - b.z, min = a.U.r + b.U.r, d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || .01, push = (min - d) * (b.U.bld ? 1 : b.U.r * b.U.r / (a.U.r * a.U.r + b.U.r * b.U.r)) * .6;
        const nx = d2 ? dx / d : (a.id % 2 ? .7 : -.7), nz = d2 ? dz / d : .7;
        a.x += nx * push; a.z += nz * push;
        if (b.U.bld && a.mv){                                  // walking into something that will not move: slide round it rather than lean on it forever
          let tx = -nz, tz = nx; const k = tx * a.fx + tz * a.fz, tg = byId.get(a.tgt), want = tg ? (tg.x - a.x) * tx + (tg.z - a.z) * tz : 0;
          if (Math.abs(k) > .15 ? k < 0 : Math.abs(want) > .3 ? want < 0 : a.id % 2){ tx = -tx; tz = -tz; }
          a.x += tx * push * .9; a.z += tz * push * .9;
        }
      }
      constrain(a, px, pz);
    }

    for (let i = ents.length - 1; i >= 0; i--) if (ents[i].hp <= 0){ byId.delete(ents[i].id); ents.splice(i, 1); }

    if (!over){
      if (phase === 'play' && tick >= MATCH * TPS){
        if (crowns[0] !== crowns[1]) finish(crowns[0] > crowns[1] ? 0 : 1);
        else { phase = 'ot'; emit({e:'ot'}); }
      } else if (phase === 'ot' && tick >= (MATCH + OVERTIME) * TPS){
        const hp = t => towers[t].reduce((s, o) => s + Math.max(0, o.hp) / o.max, 0), a = hp(0), b = hp(1);
        finish(Math.abs(a - b) < .005 ? -1 : a > b ? 0 : 1);
      }
    }
  }
  const timeLeft = () => phase === 'ot' ? MATCH + OVERTIME - tick / TPS : phase === 'over' ? 0 : MATCH - tick / TPS;

  /* ---------- playing a card ---------- */
  /* pid is the player, and tm(pid) the side he is on: with four decks, players 0 and 1 share team 0 and players 2 and 3 share team 1. */
  function play(pid, slot, x, z){
    const p = players[pid], team = tm(pid), c = p && p.hand[slot];
    if (over || !c) return false;
    const card = CARDS[c.id], bm = p.bon[card.type] || 1;
    if (p.el < card.cost || !canPlace(map, team, card, x, z, pocket(team))) return false;
    if (card.kind === 'build') for (const o of ents) if (o.U.bld && Math.hypot(o.x - x, o.z - z) < o.U.r + card.U.r + .1) return false;
    p.el -= card.cost; p.played++; p.idle = 0;
    p.hand[slot] = p.next; p.queue.push(c); p.next = p.queue.shift();
    if (card.kind === 'trap'){
      const t = card.trap, own = traps.filter(q => q.pid === pid && !q.live), m = lvlMul(c.lvl) * bm;
      if (own.length >= MAX_TRAPS) traps.splice(traps.indexOf(own[0]), 1);            // three face down each; a fourth replaces your oldest
      traps.push({id:++nid, kind:t.kind, team, pid, x, z, r:t.r, dmg:t.dmg * m, stun:t.stun, dur:t.dur, refl:t.refl, chill:t.chill, heal:t.heal * m, burst:t.burst * m, burn:t.burn,
        arm:T(t.arm), life:T(t.life), live:0, card:c.id});
      emit({e:'trapset', team, pid});                          // the other side learns a trap went down, not where
    } else if (card.kind === 'spell'){
      const s = card.spell, m = lvlMul(c.lvl) * bm;
      const zn = {kind:s.kind, team, pid, x, z, r:s.r, dmg:(s.dmg || 0) * m, twr:s.twr ?? 1, bld:s.bld, ground:s.ground, freeze:s.freeze, rage:s.rage, chill:s.chill, slow:s.slow, steal:s.steal, stun:s.stun, knock:s.knock, n:s.n,
        burn:s.burn * m, heal:s.heal * m, shield:s.shield * m, dur:s.dur ? T(s.dur) : 0, pool:s.pool, u:s.u, aff:card.aff, bm, lvl:c.lvl, t:T(s.delay), spell:true,
        live:s.dur && s.kind !== 'ward' ? T(s.dur) : 0, every:s.every ? T(s.every) : TPS, tk:0};
      zones.push(zn);
      if (s.again) zones.push({...zn, dmg:zn.dmg * s.again, t:T(s.delay + 1.3), spell:false, live:0, pool:null});     // Toxic: it lingers and lands again
      emit({e:'spell', k:s.kind, id:c.id, x, z, r:s.r, d:s.delay, team, t:s.rage || s.freeze || s.dur || 0, rar:card.rar, aff:card.aff});
    } else {
      const n = card.n, crowd = n > 8; let first = 0;                          // a few stand in a ring; a crowd fills a disc from the middle out
      for (let i = 0; i < n; i++){ const a = crowd ? i * 2.39996 + .5 : i / n * 6.283 + .5, rad = crowd ? .34 * Math.sqrt(i + .6) : n > 1 ? .3 + .13 * n : 0; const e = add(card.us ? card.us[i % card.us.length] : card.u, team, x + Math.cos(a) * rad, z + Math.sin(a) * rad, c.lvl, card.rar === 'g' ? DEPLOY + 24 : card.rar === 'l' ? DEPLOY + 14 : DEPLOY, card.aff, pid, bm); if (card.U.any) ashore(e, z); else constrain(e, x, z); first = first || e.id; }
      emit({e:'drop', id:c.id, x, z, team, rar:card.rar, u:first, pid});
    }
    return true;
  }

  /* ---------- for the screens and the wire ---------- */
  const FL = e => (e.dep > 0 ? 1 : 0) | (e.frz > 0 ? 2 : 0) | (e.rage > 0 ? 4 : 0) | (e.active ? 8 : 0) | (e.mv ? 16 : 0) | (e.chg ? 32 : 0) | (e.slow > 0 ? 64 : 0) | (e.bt > 0 ? 128 : 0) | (e.pt > 0 ? 256 : 0) | (e.hid ? 512 : 0) | (e.mk > 0 ? 1024 : 0) | (e.lp > 0 ? 2048 : 0) | (e.wk > 0 ? 4096 : 0);
  function encode(pid){
    const p = players[pid], team = tm(pid);
    return {k:tick, l:Math.max(0, Math.ceil(timeLeft())), ph:phase, cr:crowns, el:Math.round(p.el * 100) / 100, h:p.hand.map(c => c.id), hl:p.hand.map(c => c.lvl), n:p.next.id, pk:pocket(team),
      tr:traps.filter(t => t.team === team || t.live > 0).map(t => [t.id, t.card, Math.round(t.x * 100), Math.round(t.z * 100), t.live > 0 ? 1 : 0, t.team]),      // your own traps, and any sprung Instant Replay
      e:ents.filter(e => !e.hid || e.team === team).map(e => [e.id, KEYS.indexOf(e.key), e.team, Math.round(e.x * 100), Math.round(e.z * 100), Math.ceil(e.hp), e.max, FL(e), e.tgt, e.lvl, AFF_IDS.indexOf(e.U.aff), Math.ceil(e.sh), e.gs]), bo:p.idle > PATIENT};
  }

  return {
    map, mapId, ents, byId, players, crowns, towers, traps, zones, step, play, encode, pocket, sides, mvp,
    canPlace:(team, card, x, z) => canPlace(map, team, card, x, z, pocket(team)),
    drain(){ const ev = events; events = []; return ev; },
    get tick(){ return tick; }, get phase(){ return phase; }, get over(){ return over; }, get winner(){ return winner; },
    get left(){ return Math.max(0, timeLeft()); }
  };
}

/* The guest's copy of a host snapshot, shaped like live entities so the same drawing code works. */
export function decodeEnts(arr, prev){
  const out = [];
  for (const a of arr){
    const key = KEYS[a[1]], f = a[7];
    if (!UNITS[key]) continue;
    const o = prev.get(a[0]) || {id:a[0], key, U:unitVar(key, AFF_IDS[a[10]] || 'std'), team:a[2], fx:0, fz:a[2] === 0 ? -1 : 1};
    o.x = a[3] / 100; o.z = a[4] / 100; o.hp = a[5]; o.max = a[6]; o.dep = f & 1; o.frz = f & 2; o.rage = f & 4; o.active = !!(f & 8); o.mv = !!(f & 16); o.chg = !!(f & 32); o.slow = f & 64;
    o.bt = f & 128; o.pt = f & 256; o.hid = !!(f & 512); o.mk = f & 1024; o.lp = f & 2048; o.wk = f & 4096; o.tgt = a[8]; o.lvl = a[9]; o.sh = a[11] || 0; o.gs = a[12] || 0;
    out.push(o);
  }
  return out;
}
/* The traps in a snapshot from the host: checked field by field, since they arrive over the network. */
export function decodeTraps(arr){
  const out = [];
  if (Array.isArray(arr)) for (const a of arr.slice(0, 16)){
    const c = Array.isArray(a) && typeof a[1] === 'string' && Object.hasOwn(CARDS, a[1]) ? CARDS[a[1]] : null;
    if (!c || !c.trap || !Number.isFinite(a[0]) || !Number.isFinite(a[2]) || !Number.isFinite(a[3])) continue;
    out.push({id:a[0], card:c.id, kind:c.trap.kind, r:c.trap.r, x:clamp(a[2] / 100, -W, W), z:clamp(a[3] / 100, -L, L), live:a[4] ? 1 : 0, team:a[5] ? 1 : 0});
  }
  return out;
}
