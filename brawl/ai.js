/* Break Room Brawl: the CPU. It plays through the same sim.play() a person does and sees nothing a person cannot:
   no hidden traps, no cloaked assassins, not the other side's hand or Mana. prof: {react, hold, derp, smart} from cards.js. */
import { CARDS, lvlMul } from './cards.js?v=1115h';
import { TPS, W, L, riverOf } from './sim.js?v=1115h';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export function createAI(sim, team, prof, rnd = Math.random, pid = team){
  const s = team === 0 ? 1 : -1;                 // f = z * s is "how deep on my own side"
  const edge = riverOf(sim.map) + .8;
  let wait = Math.round((2.5 + prof.react) * TPS), hot = null;      // hot: the lane the other side last pushed down
  const seen = new Set(), warded = new Set();    // spells he has watched the other side cast, and the ones he has already answered
  const P = () => sim.players[pid];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  function put(h, x, f){
    x = clamp(x, -W + 1, W - 1); f = clamp(f, -L + 1, L - 1);
    if (h.card.kind !== 'spell' && !sim.canPlace(team, h.card, x, f * s)) f = Math.max(f, edge);
    for (let k = 0; k < 6; k++){
      if (sim.play(pid, h.i, x, f * s)) return true;
      x = clamp(x + (rnd() - .5) * 3, -W + 1, W - 1); f = clamp(f + rnd() * 1.5, edge, L - 1);   // blocked (a building in the way): nudge
    }
    return false;
  }
  const dpsOf = (U, n = 1) => U.dmg / U.hit * n;
  const myTraps = () => sim.traps.filter(t => t.pid === pid && !t.live).length;      // his own, which he is allowed to know about
  const handNow = () => { const p = P(); return p.hand.map((c, i) => ({i, c, card:CARDS[c.id], U:CARDS[c.id].U || null})).filter(h => h.card.cost <= p.el); };

  /* what a spell is worth, and where. Damage it would actually do, with a bonus for finishing a tower or a Mana farm. */
  function cast(h, foes, eTw, eBld, mine, myTw){
    const sp = h.card.spell, k = sp.kind, m = lvlMul(h.c.lvl), r = sp.r;
    if (k === 'ward') return null;
    if (k === 'rage'){
      const fwd = mine.filter(o => o.z * s < 4 && !o.U.bld); if (fwd.length < 3) return null;
      let c = fwd[0], n = 0; for (const a of fwd){ const q = fwd.filter(o => dist(o, a) <= r).length; if (q > n){ n = q; c = a; } }
      return n >= 3 ? {v:n * 150, x:c.x, f:c.z * s} : null;
    }
    if (k === 'heal'){
      let best = null, bv = 0;
      for (const a of mine){ if (a.U.bld) continue; let v = 0; for (const o of mine) if (!o.U.bld && dist(o, a) <= r) v += Math.min(o.max - o.hp, sp.heal * m * sp.dur * .7); if (v > bv){ bv = v; best = a; } }
      return best && bv >= 420 ? {v:bv * .8, x:best.x, f:best.z * s} : null;
    }
    if (k === 'grave'){                                                       // skeletons out of the ground beside a tower nobody is guarding
      const t = eTw.filter(o => o.key === 'princess').sort((a, b) => a.hp - b.hp)[0] || eTw[0]; if (!t) return null;
      const guards = foes.filter(o => dist(o, t) < 5).length;
      return {v:guards > 2 ? 150 : 520, x:t.x, f:t.z * s + 1.6};
    }
    const dmg = (sp.dmg || 0) * m * (k === 'poison' ? 1 + sp.dur * .55 : 1);
    let best = null, bv = 0;
    for (const c of foes.concat(eBld, eTw)){
      let v = 0;
      if (k === 'bolt'){
        const hit = foes.concat(eBld, eTw).filter(o => dist(o, c) <= r).sort((a, b) => b.hp - a.hp).slice(0, sp.n || 3);
        for (const o of hit){ const d = dmg * (o.U.twr ? sp.twr : 1); v += o.U.twr ? (o.hp <= d ? 2000 : d * .6) : Math.min(o.hp, d) + (o.hp <= d && o.max > 900 ? 200 : 0); }
      } else {
        for (const o of foes){
          if (dist(o, c) > r || (sp.ground && o.U.fly)) continue;
          if (k === 'freeze') v += Math.min(o.hp, 400) * .55 + o.dmg;
          else if (k === 'tornado') v += 60 + (myTw.some(t => dist(t, c) < 6.5) ? 60 : 0);
          else if (k === 'zap') v += Math.min(o.hp, dmg) + o.dmg * .4;
          else v += Math.min(o.hp, dmg) * (sp.delay > 1.5 && o.mv && !o.lock ? .4 : 1);           // a slow spell misses anything still walking
        }
        for (const o of eBld) if (dist(o, c) <= r){ const d = dmg * (sp.bld || 1); v += Math.min(o.hp, d) * (o.U.mana ? 1.7 : 1) + (o.hp <= d ? 160 : 0); }
        for (const o of eTw) if (dist(o, c) <= r){ const d = dmg * (sp.twr ?? 1); v += o.hp <= d ? 2000 : d * .6; }
      }
      if (v > bv){ bv = v; best = c; }
    }
    return best ? {v:bv, x:best.x, f:best.z * s} : null;
  }

  /* Things he can do in a blink: throw a Tower Shield over a tower that a spell is about to land on. */
  function reflex(){
    for (const zn of sim.zones){
      if (zn.team === team || !zn.spell || zn.t <= 0) continue;
      seen.add(zn.kind);
      if (!(zn.dmg > 0) || warded.has(zn) || zn.t < 6) continue;
      warded.add(zn);
      if (rnd() > prof.smart * .9) continue;
      const tw = sim.towers[team].filter(o => o.hp > 0 && dist(o, zn) <= zn.r + o.U.r * .5).sort((a, b) => a.hp - b.hp)[0]; if (!tw) continue;
      const h = handNow().find(q => q.card.kind === 'spell' && q.card.spell.kind === 'ward'); if (h) return put(h, tw.x, tw.z * s);
    }
  }

  function decide(){
    const p = P(), hand = handNow();
    if (!hand.length) return;
    const foes = [], mine = [], eTw = [], myTw = [], eBld = [], myBld = [];
    for (const e of sim.ents){ if (e.hp <= 0 || (e.hid && e.team !== team)) continue; (e.U.twr ? (e.team === team ? myTw : eTw) : e.U.bld ? (e.team === team ? myBld : eBld) : (e.team === team ? mine : foes)).push(e); }
    const is = (h, f) => h.U && f(h.U), kind = k => hand.find(h => h.card.kind === 'spell' && h.card.spell.kind === k);

    if (rnd() < prof.derp){                       // the "I meant to do that" play
      if (p.el < Math.min(prof.hold, 9.5)) return;
      const h = hand[Math.floor(rnd() * hand.length)];
      if (h.card.kind === 'spell'){ const all = foes.concat(eTw), t = all[Math.floor(rnd() * all.length)]; return t ? put(h, t.x + (rnd() - .5) * 4, t.z * s + (rnd() - .5) * 4) : false; }
      return put(h, (rnd() * 2 - 1) * 7, edge + rnd() * 10);
    }

    // 1. a spell that finishes a tower, lands on a crowd, or takes out a Mana farm
    let pick = null, ps = 0;
    for (const h of hand){
      if (h.card.kind !== 'spell') continue;
      const c = cast(h, foes, eTw, eBld, mine, myTw); if (!c) continue;
      const sc = c.v / (h.card.cost * 95);
      if (sc >= 1.75 - prof.smart * .6 && sc > ps){ ps = sc; pick = {h, x:c.x, f:c.f}; }
    }
    if (pick && (ps >= 1.6 || p.el >= 6)) return put(pick.h, pick.x, pick.f);
    // a tower on its last legs and he has watched them throw damage spells: shield it before the next one
    const wardH = kind('ward'), weakT = myTw.filter(o => o.hp < o.max * .38).sort((a, b) => a.hp - b.hp)[0];
    if (wardH && weakT && !(weakT.sh > 0) && (seen.size || foes.some(o => dist(o, weakT) < 6)) && rnd() < prof.smart) return put(wardH, weakT.x, weakT.z * s);

    // 2. defend: something is on my half
    const threats = foes.filter(o => o.z * s > -1.5 && o.dep <= 0);
    if (threats.length){
      threats.sort((a, b) => b.z * s - a.z * s);
      const lead = threats[0], near = lead.z * s > 4;
      hot = lead.x;
      const onFoot = threats.filter(o => !o.U.fly), big = onFoot.find(o => o.max >= 700) || onFoot[0];
      if (onFoot.length && myTraps() < 2 && rnd() < .25 + prof.smart * .6){                       // a push on foot: set a trap where it will be standing when the trap arms
        const home = o => myTw.reduce((a, t) => dist(t, o) < dist(a, o) ? t : a, myTw[0]);
        const ahead = (o, h) => { const k = home(o), dx = k.x - o.x, df = (k.z - o.z) * s, d = Math.hypot(dx, df) || 1, a = Math.min(d * .7, o.U.spd * h.card.trap.arm + .2); return put(h, o.x + dx / d * a, Math.max(edge, o.z * s + df / d * a)); };
        const tr = k => hand.find(h => h.card.kind === 'trap' && h.card.trap.kind === k);
        const mir = tr('mirror'), bnc = tr('bounce'), snp = tr('snap'), slp = tr('slip');
        if (mir && near){ const k = home(lead); return put(mir, k.x + clamp(lead.x - k.x, -1, 1), Math.max(edge, k.z * s - 1.7)); }      // Instant Replay goes where they will stand and swing at the tower
        if (bnc && big.max >= 700) return ahead(big, bnc);
        if (slp && onFoot.length >= 3) return ahead(onFoot[0], slp);
        if (snp) return ahead(big, snp);
        if (slp) return ahead(onFoot[0], slp);
      }
      const power = threats.reduce((a, o) => a + o.hp * .4 + o.dmg, 0), have = mine.filter(o => o.z * s > -2).reduce((a, o) => a + o.hp * .4 + o.dmg, 0) + myBld.reduce((a, o) => a + (o.U.dmg ? o.hp * .3 + o.dmg : 0), 0);
      if (have < power * 1.15 && (near || p.el >= prof.hold - 2.5 || power > 900)){
        const air = threats.filter(o => o.U.fly).length / threats.length, many = threats.length >= 4, huge = threats.some(o => o.hp > 800), pull = threats.some(o => o.U.only === 'b');
        const worth = power / 260;                                   // rough Mana value of what is coming
        let best = null, bs = -1;
        for (const h of hand){
          if (!h.U) continue;
          const U = h.U, n = h.card.n;
          let sc = 1 + (rnd() - .5) * (1.2 - prof.smart);
          if (!U.air) sc *= 1 - air * .95;
          if (!U.dmg) sc *= U.spawn ? .6 : pull && U.bld && !U.mana && !U.heal && !U.aura ? 1.9 : .05;        // a wall is only worth it in front of something that only wants buildings
          if (U.mana) sc *= .05;
          if (many && (U.splash || U.chain)) sc *= 1.7;
          if (many && n >= 3) sc *= .8;
          if (huge && (n >= 3 || dpsOf(U, n) > 110 || U.ramp)) sc *= U.ramp ? 1.9 : 1.45;
          if (pull && U.bld && U.dmg) sc *= 1.6;
          if (U.only === 'b') sc *= .15;
          if (U.land && (U.land.dmg || U.land.stun || U.land.slow) && threats.filter(o => dist(o, lead) <= U.land.r).length >= 2) sc *= 1.6;       // lands on top of them
          if (U.taunt || U.thorns || U.numb) sc *= 1.2;
          if (U.stealth || U.any) sc *= .6;
          if (h.card.cost > worth + 2.5) sc *= .55;
          sc = sc * prof.smart + (1 - prof.smart) * (.6 + rnd() * .8);
          if (sc > bs){ bs = sc; best = h; }
        }
        if (best && bs > .12){
          const U = best.U, k = myTw.reduce((a, o) => Math.abs(o.x - lead.x) + Math.abs(o.z - lead.z) < Math.abs(a.x - lead.x) + Math.abs(a.z - lead.z) ? o : a, myTw[0]);
          const dx = k.x - lead.x, df = (k.z - lead.z) * s, d = Math.hypot(dx, df) || 1;
          const back = U.bld ? 4 : U.land && (U.land.dmg || U.land.stun || U.land.slow) ? 0 : U.rng > 2 ? 3.6 : 1.4;
          let x = lead.x + dx / d * back, f = lead.z * s + df / d * back;
          if (U.bld){ x = lead.x * .45; f = Math.max(edge + 2.2, Math.min(f, 6.5)); }
          return put(best, x, Math.max(f, edge));
        }
      }
    }

    // 3. nothing urgent: build the economy. A Mana farm behind the king pays for everything that comes after it.
    const quiet = !threats.some(o => o.z * s > 3), farms = myBld.filter(o => o.U.mana).length + mine.filter(o => o.U.mana).length;
    const farm = hand.find(h => is(h, U => !!U.mana));
    if (farm && quiet && farms < 2 && p.el >= farm.card.cost + (prof.smart > .6 ? 1 : 3) && rnd() < .35 + prof.smart * .6){
      const k = myTw.find(o => o.key === 'king') || myTw[0], sx = rnd() < .5 ? -1 : 1;
      return farm.U.bld ? put(farm, k.x + sx * (3 + rnd()), k.z * s - .5 + rnd() * 1.5) : put(farm, sx * (2 + rnd() * 3), L - 1.6);
    }
    // a mechanic goes to the tower that needs him
    const fix = hand.find(h => is(h, U => U.heal && U.heal.bld)), hurtT = myTw.filter(o => o.hp < o.max * .75).sort((a, b) => a.hp / a.max - b.hp / b.max)[0];
    if (fix && hurtT && quiet && p.el >= fix.card.cost + 2 && rnd() < prof.smart) return put(fix, hurtT.x + (rnd() - .5), Math.max(edge, hurtT.z * s - 1.2));

    const trapH = hand.find(h => h.card.kind === 'trap');     // nothing coming: leave a trap on the lane he expects you down next
    if (trapH && p.el >= Math.max(6, trapH.card.cost + 3) && rnd() < .2 + prof.smart * .3 && myTraps() < 2){
      const k = trapH.card.trap.kind, weak = myTw.filter(o => o.key === 'princess').sort((a, b) => a.hp - b.hp)[0] || myTw[0];
      if (k === 'counter') return put(trapH, weak.x + (rnd() - .5) * 2, Math.max(edge, weak.z * s - 1.5));                              // by the tower a spell would finish
      const lanes = sim.map.bridges.length ? sim.map.bridges.map(b => b.x) : [-5.5, 5.5], want = hot ?? weak.x, lane = lanes.reduce((a, b) => Math.abs(b - want) < Math.abs(a - want) ? b : a);
      if (k === 'mirror') return put(trapH, weak.x + (rnd() - .5), Math.max(edge, weak.z * s - 1.7));
      return put(trapH, lane + (rnd() - .5) * 1.2, edge + 1.2 + rnd() * 3.5);
    }

    // 4. attack when there is Mana to spend (sooner once Mana is coming in double and triple)
    const rate = sim.left <= 60 ? 3 : sim.left <= 120 ? 2 : 1, hold = Math.max(4, prof.hold - (rate - 1) * 1.2);
    if (p.el < hold && p.el < 9.6) return;
    const front = mine.filter(o => !o.U.bld).sort((a, b) => a.z * s - b.z * s)[0];      // my troop furthest up the field
    const pr = eTw.filter(o => o.key === 'princess');
    const tgt = pr.length ? pr.reduce((a, o) => o.hp < a.hp ? o : a) : eTw[0];
    const laneX = front && rnd() < .7 ? (front.x < 0 ? -1 : 1) * 5.5 : tgt ? (Math.abs(tgt.x) < 1 ? (rnd() < .5 ? -5.5 : 5.5) : tgt.x) : 5.5;
    const isTank = U => !U.bld && (U.only === 'b' || U.hp >= 900);
    const tanks = hand.filter(h => h.U && isTank(h.U));
    const hasTank = mine.some(o => o.max >= 900 && o.z * s < 9);
    const troops = hand.filter(h => h.U && !h.U.bld && !h.U.mana);
    const saving = p.hand.some(c => { const k = CARDS[c.id], U = k.U; return U && isTank(U) && k.cost > p.el; });
    // someone who can drop in behind the lines goes for whatever is feeding them: a Mana farm, then anything fragile at the back
    const drop = hand.find(h => is(h, U => !!U.any));
    if (drop && rnd() < prof.smart){
      const soft = eBld.filter(o => o.U.mana)[0] || foes.filter(o => o.U.rng > 2 && o.max < 700 && o.z * s < -2).sort((a, b) => a.hp - b.hp)[0] || (rnd() < .4 && tgt);
      if (soft) return put(drop, soft.x + (rnd() - .5), soft.z * s - 1.1);
    }
    if (!hasTank && !tanks.length && saving && p.el < 9.6 && rnd() < prof.smart) return;      // a big card is in hand: wait for it
    if (tanks.length && !hasTank){
      const h = tanks[Math.floor(rnd() * tanks.length)];
      return put(h, laneX, p.el >= 9 && rnd() < prof.smart ? L - 2.5 : edge + .4);     // patient: start him behind the king so support can build up
    }
    if (front && troops.length){
      const sup = troops.filter(h => h.U.rng > 2 || h.U.splash || h.card.n >= 3 || h.U.heal || h.U.aura);
      const h = (sup.length ? sup : troops)[Math.floor(rnd() * (sup.length || troops.length))];
      return put(h, front.x + (rnd() - .5) * 1.6, Math.max(edge, front.z * s + (h.U.rng > 2 || h.U.heal ? 2.6 : 1.2)));
    }
    const bl = hand.filter(h => h.U && h.U.bld && (h.U.spawn || (front && (h.U.aura || h.U.heal))));
    if (bl.length && rnd() < .6) return put(bl[0], bl[0].U.spawn ? laneX * .5 : front.x, bl[0].U.spawn ? 6 + rnd() * 2 : Math.max(edge + 1, front.z * s + 1.5));
    if (troops.length){ const h = troops.sort((a, b) => b.card.cost - a.card.cost)[rnd() < .6 ? 0 : troops.length - 1]; return put(h, laneX + (rnd() - .5), edge + .4); }
    // only spells and buildings left and Mana to burn: put a defence down, or throw the spell at a tower
    if (p.el >= 9.5){
      const d = hand.find(h => h.U && h.U.bld && h.U.dmg); if (d) return put(d, laneX * .45, edge + 3 + rnd() * 2);
      const sh = hand.find(h => h.card.kind === 'spell' && h.card.spell.dmg > 0 && h.card.spell.twr > 0); if (sh && tgt) return put(sh, tgt.x, tgt.z * s);
    }
  }

  return { tick(){ if (sim.over) return; if (prof.smart >= .35) reflex(); else for (const zn of sim.zones) if (zn.team !== team && zn.spell) seen.add(zn.kind); if (--wait > 0) return; wait = Math.round(prof.react * (.7 + rnd() * .6) * TPS); decide(); } };
}
