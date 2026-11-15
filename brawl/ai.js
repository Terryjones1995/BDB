/* Break Room Brawl: the CPU. It plays through the same sim.play() a person does and sees nothing a person cannot.
   prof: {react, hold, derp, smart} from cards.js CPUS. */
import { CARDS, UNITS, lvlMul } from './cards.js?v=1114n';
import { TPS, W, L, RIVER } from './sim.js?v=1114n';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export function createAI(sim, team, prof, rnd = Math.random, pid = team){
  const s = team === 0 ? 1 : -1;                 // f = z * s is "how deep on my own side"
  const edge = (sim.map.river ? RIVER : 0) + .8;
  let wait = Math.round((2.5 + prof.react) * TPS), hot = null;      // hot: the lane the other side last pushed down
  const P = () => sim.players[pid];

  function put(h, x, f){
    x = clamp(x, -W + 1, W - 1); f = clamp(f, -L + 1, L - 1);
    if (h.card.type !== 'spell' && !sim.canPlace(team, h.card, x, f * s)) f = Math.max(f, edge);
    for (let k = 0; k < 6; k++){
      if (sim.play(pid, h.i, x, f * s)) return true;
      x = clamp(x + (rnd() - .5) * 3, -W + 1, W - 1); f = clamp(f + rnd() * 1.5, edge, L - 1);   // blocked (a building in the way): nudge
    }
    return false;
  }
  const dpsOf = (U, n = 1) => U.dmg / U.hit * n;
  const myTraps = () => sim.traps.filter(t => t.pid === pid && !t.live).length;      // his own, which he is allowed to know about

  /* best place for an area spell and what it is worth there */
  function spellSpot(sp, lvl, foes, towers){
    let best = null, bv = 0;
    const m = lvlMul(lvl);
    for (const c of foes.concat(towers)){
      let v = 0;
      for (const o of foes) if (Math.hypot(o.x - c.x, o.z - c.z) <= sp.r) v += sp.kind === 'freeze' ? Math.min(o.hp, 400) * .55 + o.dmg : Math.min(o.hp, sp.dmg * m);
      for (const o of towers) if (Math.hypot(o.x - c.x, o.z - c.z) <= sp.r){ const d = (sp.dmg || 0) * m * (sp.twr || 1); v += o.hp <= d ? 2000 : d * .6; }
      if (v > bv){ bv = v; best = c; }
    }
    return {v:bv, at:best};
  }

  function decide(){
    const p = P();
    const hand = p.hand.map((c, i) => ({i, c, card:CARDS[c.id], U:CARDS[c.id].U || null})).filter(h => h.card.cost <= p.el);
    if (!hand.length) return;
    const foes = [], mine = [], eTw = [], myTw = [];
    for (const e of sim.ents){ if (e.hp <= 0) continue; (e.U.twr ? (e.team === team ? myTw : eTw) : (e.team === team ? mine : foes)).push(e); }

    if (rnd() < prof.derp){                       // the "I meant to do that" play
      if (p.el < Math.min(prof.hold, 9.5)) return;
      const h = hand[Math.floor(rnd() * hand.length)];
      if (h.card.type === 'spell'){ const t = foes.length ? foes[Math.floor(rnd() * foes.length)] : eTw[Math.floor(rnd() * eTw.length)]; return put(h, t.x + (rnd() - .5) * 4, t.z * s + (rnd() - .5) * 4); }
      return put(h, (rnd() * 2 - 1) * 7, edge + rnd() * 10);
    }

    // 1. a spell that finishes a tower or lands on a crowd
    let pick = null, ps = 0;
    for (const h of hand){
      if (h.card.type !== 'spell') continue;
      const sp = h.card.spell;
      if (sp.kind === 'rage'){
        const fwd = mine.filter(o => o.z * s < 4 && !o.U.bld);
        if (fwd.length >= 3 && p.el >= 5){ const c = fwd[0]; const sc = .9 + fwd.length * .1; if (sc > ps){ ps = sc; pick = {h, x:c.x, f:c.z * s}; } }
        continue;
      }
      const {v, at} = spellSpot(sp, h.c.lvl, foes, eTw);
      const sc = v / (h.card.cost * 95);
      if (at && sc >= 1.75 - prof.smart * .6 && sc > ps){ ps = sc; pick = {h, x:at.x, f:at.z * s}; }
    }
    if (pick && (ps >= 1.6 || p.el >= 6)) return put(pick.h, pick.x, pick.f);

    // 2. defend: something is on my half
    const threats = foes.filter(o => o.z * s > -1.5 && o.dep <= 0);
    if (threats.length){
      threats.sort((a, b) => b.z * s - a.z * s);
      const lead = threats[0], near = lead.z * s > 4;
      hot = lead.x;
      const onFoot = threats.filter(o => !o.U.fly && !o.U.bld), big = onFoot.find(o => o.max >= 700) || onFoot[0];
      if (onFoot.length && myTraps() < 2 && rnd() < .25 + prof.smart * .6){                       // a push on foot: set a trap where it will be standing when the trap arms
        const home = o => myTw.reduce((a, t) => Math.hypot(t.x - o.x, t.z - o.z) < Math.hypot(a.x - o.x, a.z - o.z) ? t : a, myTw[0]);
        const ahead = (o, h) => { const k = home(o), dx = k.x - o.x, df = (k.z - o.z) * s, d = Math.hypot(dx, df) || 1, a = Math.min(d * .7, o.U.spd * h.card.trap.arm + .2); return put(h, o.x + dx / d * a, Math.max(edge, o.z * s + df / d * a)); };
        const tr = k => hand.find(h => h.card.type === 'trap' && h.card.trap.kind === k);
        const mir = tr('mirror'), bnc = tr('bounce'), snp = tr('snap'), slp = tr('slip');
        if (mir && near){ const k = home(lead); return put(mir, k.x + clamp(lead.x - k.x, -1, 1), Math.max(edge, k.z * s - 1.7)); }      // Instant Replay goes where they will stand and swing at the tower
        if (bnc && big.max >= 700) return ahead(big, bnc);
        if (slp && onFoot.length >= 3) return ahead(onFoot[0], slp);
        if (snp) return ahead(big, snp);
        if (slp) return ahead(onFoot[0], slp);
      }
      const power = threats.reduce((a, o) => a + o.hp * .4 + o.dmg, 0), have = mine.filter(o => o.z * s > -2).reduce((a, o) => a + o.hp * .4 + o.dmg, 0);
      if (have < power * 1.15 && (near || p.el >= prof.hold - 2.5 || power > 900)){
        const air = threats.filter(o => o.U.fly).length / threats.length, many = threats.length >= 4, big = threats.some(o => o.hp > 800), pull = threats.some(o => o.U.only === 'b');
        let best = null, bs = -1;
        for (const h of hand){
          if (!h.U) continue;
          const U = h.U, n = h.card.n;
          let sc = 1 + (rnd() - .5) * (1.2 - prof.smart);
          if (!U.air) sc *= 1 - air * .95;
          if (!U.dmg && !U.spawn) sc *= .2;
          if (many && U.splash) sc *= 1.7;
          if (many && n >= 3) sc *= .8;
          if (big && (n >= 3 || dpsOf(U, n) > 110)) sc *= 1.45;
          if (pull && U.bld) sc *= 1.6;
          if (U.only === 'b') sc *= .15;
          const worth = power / 260;                                   // rough Coffee value of what is coming
          if (h.card.cost > worth + 2.5) sc *= .55;
          sc = sc * prof.smart + (1 - prof.smart) * (.6 + rnd() * .8);
          if (sc > bs){ bs = sc; best = h; }
        }
        if (best){
          const U = best.U, k = myTw.reduce((a, o) => Math.abs(o.x - lead.x) + Math.abs(o.z - lead.z) < Math.abs(a.x - lead.x) + Math.abs(a.z - lead.z) ? o : a, myTw[0]);
          const dx = k.x - lead.x, df = (k.z - lead.z) * s, d = Math.hypot(dx, df) || 1;
          const back = U.bld ? 4 : U.rng > 2 ? 3.6 : 1.4;
          let x = lead.x + dx / d * back, f = lead.z * s + df / d * back;
          if (U.bld){ x = lead.x * .45; f = Math.max(edge + 2.2, Math.min(f, 6.5)); }
          return put(best, x, Math.max(f, edge));
        }
      }
    }

    // 3. attack when the cup is full enough
    const trapH = hand.find(h => h.card.type === 'trap');     // nothing coming: leave a trap on the lane he expects you down next
    if (trapH && p.el >= Math.max(6, trapH.card.cost + 3) && rnd() < .2 + prof.smart * .3 && myTraps() < 2){
      const k = trapH.card.trap.kind, weak = myTw.filter(o => o.key === 'princess').sort((a, b) => a.hp - b.hp)[0] || myTw[0];
      if (k === 'counter') return put(trapH, weak.x + (rnd() - .5) * 2, Math.max(edge, weak.z * s - 1.5));                              // by the tower a spell would finish
      const lanes = sim.map.bridges.length ? sim.map.bridges.map(b => b.x) : [-5.5, 5.5], want = hot ?? weak.x, lane = lanes.reduce((a, b) => Math.abs(b - want) < Math.abs(a - want) ? b : a);
      if (k === 'mirror') return put(trapH, weak.x + (rnd() - .5), Math.max(edge, weak.z * s - 1.7));
      return put(trapH, lane + (rnd() - .5) * 1.2, edge + 1.2 + rnd() * 3.5);
    }
    if (p.el < prof.hold && p.el < 9.6) return;
    const front = mine.filter(o => !o.U.bld).sort((a, b) => a.z * s - b.z * s)[0];      // my troop furthest up the field
    const pr = eTw.filter(o => o.key === 'princess');
    const tgt = pr.length ? pr.reduce((a, o) => o.hp < a.hp ? o : a) : eTw[0];
    const laneX = front && rnd() < .7 ? (front.x < 0 ? -1 : 1) * 5.5 : tgt ? (Math.abs(tgt.x) < 1 ? (rnd() < .5 ? -5.5 : 5.5) : tgt.x) : 5.5;
    const tanks = hand.filter(h => h.U && !h.U.bld && (h.U.only === 'b' || h.U.hp >= 900));
    const hasTank = mine.some(o => !o.U.bld && o.max >= 900 && o.z * s < 9);
    const troops = hand.filter(h => h.U && !h.U.bld);
    const saving = p.hand.some(c => { const k = CARDS[c.id], U = k.U; return U && !U.bld && (U.only === 'b' || U.hp >= 900) && k.cost > p.el; });
    if (!hasTank && !tanks.length && saving && p.el < 9.6 && rnd() < prof.smart) return;      // a big card is in hand: wait for it
    if (tanks.length && !hasTank){
      const h = tanks[Math.floor(rnd() * tanks.length)];
      return put(h, laneX, p.el >= 9 && rnd() < prof.smart ? L - 2.5 : edge + .4);     // patient: start him behind the king so support can build up
    }
    if (front && troops.length){
      const sup = troops.filter(h => h.U.rng > 2 || h.U.splash || h.card.n >= 3);
      const h = (sup.length ? sup : troops)[Math.floor(rnd() * (sup.length || troops.length))];
      return put(h, front.x + (rnd() - .5) * 1.6, Math.max(edge, front.z * s + (h.U.rng > 2 ? 2.6 : 1.2)));
    }
    const bl = hand.filter(h => h.U && h.U.bld && h.U.spawn);
    if (bl.length && rnd() < .6) return put(bl[0], laneX * .5, 6 + rnd() * 2);
    if (troops.length){ const h = troops.sort((a, b) => b.card.cost - a.card.cost)[rnd() < .6 ? 0 : troops.length - 1]; return put(h, laneX + (rnd() - .5), edge + .4); }
  }

  return { tick(){ if (sim.over) return; if (--wait > 0) return; wait = Math.round(prof.react * (.7 + rnd() * .6) * TPS); decide(); } };
}
