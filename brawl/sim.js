/* Break Room Brawl: the battle rules. No DOM, no drawing. One sim runs per match (on the host when online);
   screens read its entities and events. Team 0 defends z > 0, team 1 defends z < 0. */
import { UNITS, CARDS, MAPS, lvlMul, unitVar, HAND, AFF_IDS, RAR_IDS } from './cards.js';

export const TPS = 20, DT = 1 / TPS, W = 9, L = 18, RIVER = 1;      // a longer field: more ground to cover, more time to react
export const MATCH = 600, OVERTIME = 60, DOUBLE_AT = 120, MAX_EL = 10, SIGHT = 5.5;   // a 10 minute match, double Coffee for the last two
export const TOWER_AT = [['king', 0, L - 3], ['princess', -5.5, L - 6.5], ['princess', 5.5, L - 6.5]];
const DEPLOY = TPS, PROJ_SPD = 11;
export const PATIENT = 3 * TPS;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const T = s => Math.max(1, Math.round(s * TPS));
export const KEYS = Object.keys(UNITS);

function mulberry(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* Can this team drop this card here? Pure, so the screens and the CPU can ask without a sim in hand. */
export function canPlace(map, team, card, x, z, pocket){
  if (Math.abs(x) > W - .4 || Math.abs(z) > L - .4) return false;
  if (card.type === 'spell') return true;
  const zz = team === 0 ? z : -z, edge = map.river ? RIVER + .6 : .6;
  if (zz >= edge) return true;
  // an enemy hoop tower is down: that side of their half opens up
  const side = (team === 0 ? x : -x) < 0 ? 0 : 1;
  return !!(pocket && pocket[side]) && zz >= -(L - 8.5) && zz <= -edge;
}

export function createSim({map:mapId, decks, seed = 1, elMul = [1, 1], towerLvl = [1, 1]}){
  const map = MAPS[mapId], rnd = mulberry(seed);
  let tick = 0, nid = 0, phase = 'play', over = false, winner = -1;
  const ents = [], byId = new Map(), projs = [], zones = [];
  let events = [];
  const crowns = [0, 0];
  const emit = o => events.push(o);

  const players = decks.map(d => {
    const q = d.map(c => ({id:c.id, lvl:c.lvl || 1}));
    for (let i = q.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }   // the draw order is a shuffle
    return {el:5, hand:q.splice(0, HAND), next:q.shift(), queue:q, played:0, idle:0};
  });

  const tm = pid => players.length > 2 ? (pid < 2 ? 0 : 1) : pid;
  function add(key, team, x, z, lvl, dep = DEPLOY, aff = 'std', rar = 'c'){
    const U = unitVar(key, aff, rar), m = lvlMul(lvl);
    const e = {id:++nid, key, U, team, x, z, lvl, hp:Math.round(U.hp * m), max:Math.round(U.hp * m), dmg:Math.round(U.dmg * m),
      cd:0, tgt:0, dep, frz:0, rage:0, slow:0, lock:false, fx:0, fz:team === 0 ? -1 : 1, mv:false, run:0, chg:false, active:key !== 'king'};
    if (U.spawn) e.sp = T(U.spawn.first ?? U.spawn.every);
    if (U.heal) e.hl = T(U.heal.every);
    ents.push(e); byId.set(e.id, e);
    return e;
  }
  const towers = [[], []];
  for (const team of [0, 1]) for (const [k, x, z] of TOWER_AT){ const s = team === 0 ? 1 : -1; towers[team].push(add(k, team, x * s, z * s, towerLvl[team], 0)); }
  const kingOf = t => towers[t][0];
  const pocket = team => { const en = towers[1 - team]; return team === 0 ? [en[2].hp <= 0, en[1].hp <= 0] : [en[2].hp <= 0, en[1].hp <= 0]; };
  // towers[1] sits mirrored: its index 1 is at +x, index 2 at -x. For team 0 looking at x<0 that is towers[1][2].

  /* ---------- river and bridges ---------- */
  const side = z => z >= RIVER ? 1 : z <= -RIVER ? -1 : 0;
  const bridgeAt = x => map.bridges.find(b => Math.abs(x - b.x) <= b.w / 2);
  function waypoint(e, tx, tz){
    if (e.U.fly || !map.river) return [tx, tz];
    const su = side(e.z), st = side(tz);
    if (su !== 0 && su === st) return [tx, tz];
    if (su === 0){
      const b = bridgeAt(e.x) || map.bridges[0], h = Math.max(.1, b.w / 2 - .2);
      return st === 0 ? [clamp(tx, b.x - h, b.x + h), tz] : [clamp(tx, b.x - h, b.x + h), st * (RIVER + .1)];
    }
    let b = null, bc = 1e9;
    for (const c of map.bridges){ const k = Math.abs(e.x - c.x) + Math.abs(tx - c.x); if (k < bc){ bc = k; b = c; } }
    const h = Math.max(.1, b.w / 2 - Math.min(e.U.r * .6, b.w / 2 - .1)), bx = clamp(e.x, b.x - h, b.x + h);
    if (Math.abs(e.x - bx) < .1) return st === 0 && Math.abs(tx - b.x) <= b.w / 2 ? [tx, tz] : [bx, -su * (RIVER + .1)];
    return [bx, su * (RIVER + .3)];
  }
  function constrain(e, px, pz){
    e.x = clamp(e.x, -W + e.U.r * .5, W - e.U.r * .5); e.z = clamp(e.z, -L + .3, L - .3);
    if (!map.river || e.U.fly || Math.abs(e.z) >= RIVER) return;
    if (bridgeAt(e.x)) return;
    if (Math.abs(pz) >= RIVER) e.z = (pz > 0 ? 1 : -1) * RIVER;
    else { const b = bridgeAt(px) || map.bridges[0]; e.x = clamp(e.x, b.x - b.w / 2, b.x + b.w / 2); }
  }

  /* ---------- damage ---------- */
  const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) - a.U.r - b.U.r;
  function hurt(o, dmg){
    if (o.hp <= 0 || dmg <= 0) return;
    o.hp -= dmg;
    if (o.key === 'king' && !o.active){ o.active = true; emit({e:'king', team:o.team}); }
    if (o.hp <= 0) kill(o);
  }
  function kill(o){
    o.hp = 0;
    const U = o.U;
    if (U.split) for (let i = 0; i < U.split.n; i++){ const a = i / U.split.n * 6.283 + .6; constrain(add(U.split.u, o.team, o.x + Math.cos(a) * .5, o.z + Math.sin(a) * .5, o.lvl, 6, U.aff, U.rar), o.x, o.z); }
    if (U.death){ const d = U.death.delay || .1; zones.push({kind:'blast', team:o.team, x:o.x, z:o.z, r:U.death.r, dmg:U.death.dmg * lvlMul(o.lvl), twr:.5, t:T(d)}); emit({e:'fuse', x:o.x, z:o.z, r:U.death.r, d, k:o.key}); }
    if (U.twr){
      crowns[1 - o.team] = o.key === 'king' ? 3 : Math.min(3, crowns[1 - o.team] + 1);
      emit({e:'tower', team:o.team, king:o.key === 'king', x:o.x, z:o.z});
      const k = kingOf(o.team);
      if (o.key === 'king'){ finish(1 - o.team); }
      else { if (!k.active && k.hp > 0){ k.active = true; emit({e:'king', team:o.team}); } if (phase === 'ot') finish(1 - o.team); }
    }
  }
  function area(x, z, r, dmg, team, air, twr = 1, chill = 0){
    for (const o of ents){
      if (o.team === team || o.hp <= 0 || o.dep > 0 || (o.U.fly && !air)) continue;
      if (Math.hypot(o.x - x, o.z - z) <= r + o.U.r * .5){ if (chill && !o.U.twr) o.slow = T(chill); hurt(o, dmg * (o.U.twr ? twr : 1)); }
    }
  }
  function finish(w){ if (over) return; over = true; winner = w; phase = 'over'; emit({e:'over', w, cr:crowns.slice()}); }

  /* ---------- targeting ---------- */
  const ok = (e, o) => o && o.hp > 0 && o.dep <= 0 && !(o.U.fly && !e.U.air) && !(e.U.only === 'b' && !o.U.bld);
  function acquire(e){
    const U = e.U, cur = byId.get(e.tgt);
    if (e.lock && ok(e, cur) && gap(e, cur) <= U.rng + .3) return;          // mid-fight: finish what you started
    e.lock = false;
    let best = null, bd = 1e9, twr = null, td = 1e9;
    for (const o of ents){
      if (o.team === e.team || !ok(e, o)) continue;
      const d = gap(e, o);
      if (d < bd){ bd = d; best = o; }
      if (o.U.twr && d < td){ td = d; twr = o; }
    }
    if (U.bld) e.tgt = best && bd <= U.rng ? best.id : 0;
    else if (best && (bd <= SIGHT || U.only === 'b')) e.tgt = best.id;
    else e.tgt = twr ? twr.id : 0;
  }
  function attack(e, t){
    const U = e.U;
    e.cd = U.hit * TPS; e.lock = true;
    let dmg = e.dmg;
    if (e.chg){ dmg *= U.charge.dmg; e.chg = false; }
    e.run = 0;
    if (U.steal && e.hp < e.max) e.hp = Math.min(e.max, e.hp + dmg * U.steal);
    emit({e:'atk', id:e.id, t:t.id});
    if (U.shot && U.rng > 1.5){
      const d = clamp((gap(e, t) + e.U.r) / PROJ_SPD, .14, .9);
      projs.push({tgt:t.id, x:t.x, z:t.z, t:T(d), dmg, splash:U.splash || 0, team:e.team, air:!!U.air, chill:U.chill});
      emit({e:'shot', id:e.id, t:t.id, d, k:U.shot});
    } else projs.push({tgt:t.id, x:t.x, z:t.z, t:T(U.wind ?? .24), dmg, splash:U.splash || 0, team:e.team, air:!!U.air, chill:U.chill, src:e.id});     // a melee hit lands when the swing does, and not at all if the attacker drops first
  }

  /* ---------- one tick ---------- */
  function step(){
    if (over) return;
    tick++;
    const left = timeLeft(), dbl = phase === 'ot' || left <= DOUBLE_AT;
    for (let i = 0; i < players.length; i++){ const p = players[i]; p.idle++; p.el = Math.min(MAX_EL, p.el + DT / 2.8 * (dbl ? 2 : 1) * (p.idle > PATIENT ? 1.3 : 1) * (elMul[i] ?? 1)); }   // holding off on summoning charges Mana faster

    for (let i = zones.length - 1; i >= 0; i--){
      const zn = zones[i];
      if (--zn.t > 0) continue;
      zones.splice(i, 1);
      if (zn.kind === 'rage'){ for (const o of ents) if (o.team === zn.team && o.hp > 0 && !o.U.twr && Math.hypot(o.x - zn.x, o.z - zn.z) <= zn.r + o.U.r * .5) o.rage = T(zn.rage); }
      else {
        if (zn.kind === 'freeze'){ for (const o of ents) if (o.team !== zn.team && o.hp > 0 && o.dep <= 0 && Math.hypot(o.x - zn.x, o.z - zn.z) <= zn.r + o.U.r * .5) o.frz = T(zn.freeze); }
        area(zn.x, zn.z, zn.r, zn.dmg, zn.team, true, zn.twr, zn.chill);
        if (zn.steal) for (const o of ents) if (o.team === zn.team && o.hp > 0 && !o.U.bld && Math.hypot(o.x - zn.x, o.z - zn.z) <= zn.r) o.hp = Math.min(o.max, o.hp + zn.dmg * zn.steal);
      }
      emit({e:'boom', k:zn.kind, x:zn.x, z:zn.z, r:zn.r, team:zn.team});
    }
    for (let i = projs.length - 1; i >= 0; i--){
      const p = projs[i], t = byId.get(p.tgt);
      if (t && t.hp > 0){ p.x = t.x; p.z = t.z; }
      if (--p.t > 0) continue;
      projs.splice(i, 1);
      if (p.src && !byId.has(p.src)) continue;
      if (p.splash) area(p.x, p.z, p.splash, p.dmg, p.team, p.air, 1, p.chill);
      else if (t && t.hp > 0){ if (p.chill && !t.U.twr) t.slow = T(p.chill); hurt(t, p.dmg); }
    }

    const n = ents.length;
    for (let i = 0; i < n; i++){
      const e = ents[i], U = e.U;
      if (e.hp <= 0) continue;
      if (e.dep > 0){ e.dep--; continue; }
      if (U.life){ e.hp -= e.max / (U.life * TPS); if (e.hp <= 0){ kill(e); continue; } }
      if (e.frz > 0){ e.frz--; e.mv = false; continue; }
      let fast = e.rage > 0 ? 1.35 : 1;
      if (e.rage > 0) e.rage--;
      if (e.slow > 0){ e.slow--; fast *= .62; }
      if (U.spawn && (e.sp -= fast) <= 0){
        e.sp = T(U.spawn.every);
        const s = e.team === 0 ? -1 : 1;
        for (let k = 0; k < U.spawn.n; k++){ const a = (k / U.spawn.n - .5) * 1.4; constrain(add(U.spawn.u, e.team, e.x + Math.sin(a) * 1.1, e.z + s * (U.r + .5) * Math.cos(a), e.lvl, 8, U.aff, U.rar), e.x, e.z); }
        emit({e:'summon', id:e.id});
      }
      if (U.heal && --e.hl <= 0){
        e.hl = T(U.heal.every);
        let any = false;
        for (const o of ents) if (o.team === e.team && o.hp > 0 && !o.U.bld && o.hp < o.max && Math.hypot(o.x - e.x, o.z - e.z) <= U.heal.r){ o.hp = Math.min(o.max, o.hp + U.heal.amt * lvlMul(e.lvl)); any = true; }
        if (any) emit({e:'heal', id:e.id, r:U.heal.r});
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
      if (d <= U.rng){
        e.mv = false; e.fx = dx0 / dl; e.fz = dz0 / dl;
        if (e.cd <= 0) attack(e, t);
      } else if (U.spd > 0){
        e.lock = false;
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
      if (a.hp <= 0 || a.U.bld || a.dep > 0) continue;
      const px = a.x, pz = a.z;
      for (let j = 0; j < ents.length; j++){
        if (i === j) continue;
        const b = ents[j];
        if (b.hp <= 0 || b.dep > 0 || !!b.U.fly !== !!a.U.fly) continue;
        const dx = a.x - b.x, dz = a.z - b.z, min = a.U.r + b.U.r, d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || .01, push = (min - d) * (b.U.bld ? 1 : b.U.r * b.U.r / (a.U.r * a.U.r + b.U.r * b.U.r)) * .6;
        a.x += (d2 ? dx / d : (a.id % 2 ? .7 : -.7)) * push; a.z += (d2 ? dz / d : .7) * push;
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
  /* pid is the player. With four decks it is 2v2: players 0 and 1 share team 0, players 2 and 3 share team 1. */
  function play(pid, slot, x, z){
    const p = players[pid], team = tm(pid), c = p && p.hand[slot];
    if (over || !c) return false;
    const card = CARDS[c.id];
    if (p.el < card.cost || !canPlace(map, team, card, x, z, pocket(team))) return false;
    if (card.type === 'build') for (const o of ents) if (o.U.bld && Math.hypot(o.x - x, o.z - z) < o.U.r + card.U.r + .1) return false;
    p.el -= card.cost; p.played++; p.idle = 0;
    p.hand[slot] = p.next; p.queue.push(c); p.next = p.queue.shift();
    if (card.type === 'spell'){
      const s = card.spell, m = lvlMul(c.lvl);
      zones.push({kind:s.kind, team, x, z, r:s.r, dmg:(s.dmg || 0) * m, twr:s.twr || 1, freeze:s.freeze, rage:s.rage, chill:s.chill, steal:s.steal, t:T(s.delay)});
      emit({e:'spell', k:s.kind, id:c.id, x, z, r:s.r, d:s.delay, team, t:s.rage || s.freeze || 0, rar:card.rar, aff:card.aff});
    } else {
      const n = card.n, rad = n > 1 ? .3 + .13 * n : 0;
      for (let i = 0; i < n; i++){ const a = i / n * 6.283 + .5; const e = add(card.u, team, x + Math.cos(a) * rad, z + Math.sin(a) * rad, c.lvl, card.rar === 'l' ? DEPLOY + 14 : DEPLOY, card.aff, card.rar); constrain(e, x, z); }
      emit({e:'drop', id:c.id, x, z, team, rar:card.rar});
    }
    return true;
  }

  /* ---------- for the screens and the wire ---------- */
  const FL = e => (e.dep > 0 ? 1 : 0) | (e.frz > 0 ? 2 : 0) | (e.rage > 0 ? 4 : 0) | (e.active ? 8 : 0) | (e.mv ? 16 : 0) | (e.chg ? 32 : 0) | (e.slow > 0 ? 64 : 0);
  function encode(pid){
    const p = players[pid], team = tm(pid);
    return {k:tick, l:Math.max(0, Math.ceil(timeLeft())), ph:phase, cr:crowns, el:Math.round(p.el * 100) / 100, h:p.hand.map(c => c.id), hl:p.hand.map(c => c.lvl), n:p.next.id, pk:pocket(team),
      e:ents.map(e => [e.id, KEYS.indexOf(e.key), e.team, Math.round(e.x * 100), Math.round(e.z * 100), Math.ceil(e.hp), e.max, FL(e), e.tgt, e.lvl, AFF_IDS.indexOf(e.U.aff), RAR_IDS.indexOf(e.U.rar)]), bo:p.idle > PATIENT};
  }

  return {
    map, mapId, ents, byId, players, crowns, towers, step, play, encode, pocket,
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
    const o = prev.get(a[0]) || {id:a[0], key, U:unitVar(key, AFF_IDS[a[10]] || 'std', RAR_IDS[a[11]] || 'c'), team:a[2], fx:0, fz:a[2] === 0 ? -1 : 1};
    o.x = a[3] / 100; o.z = a[4] / 100; o.hp = a[5]; o.max = a[6]; o.dep = f & 1; o.frz = f & 2; o.rage = f & 4; o.active = !!(f & 8); o.mv = !!(f & 16); o.chg = !!(f & 32); o.slow = f & 64; o.tgt = a[8]; o.lvl = a[9];
    out.push(o);
  }
  return out;
}
