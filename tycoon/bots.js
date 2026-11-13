/* BDB bots. decide(state, pid, level, mem) returns the next action for that seat, or null when it has nothing to do.
   level 1 Rec League (loose), 2 Varsity (sensible), 3 Pro Scout (sharp). mem is a small per-bot scratch object the caller keeps. */
(function(G){
'use strict';
const TY = G.TY = G.TY || {};
const D = TY.data, E = TY.engine;
const S = D.spaces, GR = D.groups;
const rand = () => Math.random();

const LV = {
  1: {buffer:40, noise:.3, bid:.8, build:.55, trade:false, fair:-40},
  2: {buffer:110, noise:.12, bid:1, build:.9, trade:true, fair:0},
  3: {buffer:0, noise:.04, bid:1.12, build:1, trade:true, fair:25}
};

/* biggest rent an opponent could charge right now: how much cash a bot should keep around */
function danger(s, pid){
  let m = 0;
  for (let i = 0; i < 40; i++){
    const o = s.own[i];
    if (o < 0 || o === pid || s.mort[i]) continue;
    const r = S[i].k === 'util' ? 70 : E.rentFor(s, i, {dice:7});
    if (r > m) m = r;
  }
  return m;
}
function buffer(s, pid, lv){
  const d = danger(s, pid);
  if (lv === 1) return LV[1].buffer;
  if (lv === 2) return Math.min(320, LV[2].buffer + d * .3);
  return Math.max(80, Math.min(450, 60 + d * .55));
}
const unownedCount = s => S.filter(x => E.isOwnable(x.i) && s.own[x.i] === -1).length;

/* value of owning space i, for this bot, right now */
function value(s, pid, i, lv){
  const sp = S[i]; let v = sp.price;
  if (sp.k === 'prop'){
    const g = GR[sp.g], others = g.sp.filter(j => j !== i);
    const mine = others.filter(j => s.own[j] === pid).length;
    if (mine === others.length) v += sp.price * 1.7;
    else if (mine > 0) v += sp.price * .4;
    for (let o = 0; o < s.players.length; o++){
      if (o === pid || s.players[o].out) continue;
      if (others.filter(j => s.own[j] === o).length === others.length) v += sp.price * (lv >= 3 ? 1 : .7);
    }
    if (sp.g >= 3 && sp.g <= 5) v *= 1.08;   // the middle of the board gets landed on the most
  } else if (sp.k === 'transit'){
    v += E.countKind(s, pid, 'transit') * 55;
  } else if (sp.k === 'util'){
    v = 140 + E.countKind(s, pid, 'util') * 60;
  }
  return v * (1 + (rand() * 2 - 1) * LV[lv].noise);
}

/* position score used to judge trades */
function position(s, own, pid){
  let v = 0;
  for (let i = 0; i < 40; i++) if (own[i] === pid) v += S[i].price * (s.mort[i] ? .55 : 1);
  GR.forEach((g, gi) => {
    const n = g.sp.filter(i => own[i] === pid).length, sum = g.sp.reduce((t, i) => t + S[i].price, 0);
    if (n === g.sp.length) v += sum * 1.6 + 200;
    else if (n === g.sp.length - 1 && n > 0 && !g.sp.some(i => own[i] >= 0 && own[i] !== pid)) v += sum * .15;
  });
  const t = S.filter(x => x.k === 'transit' && own[x.i] === pid).length;
  v += t > 1 ? (t - 1) * 70 : 0;
  if (S.filter(x => x.k === 'util' && own[x.i] === pid).length === 2) v += 60;
  return v;
}
function tradeGain(s, t){
  const own = s.own.slice();
  for (const i of t.give.props) own[i] = t.to;
  for (const i of t.get.props) own[i] = t.from;
  const fromGain = position(s, own, t.from) - position(s, s.own, t.from) + t.get.cash - t.give.cash + (t.get.cards - t.give.cards) * 30;
  const toGain = position(s, own, t.to) - position(s, s.own, t.to) + t.give.cash - t.get.cash + (t.give.cards - t.get.cards) * 30;
  const newSets = (p) => GR.map((g, gi) => gi).filter(gi => GR[gi].sp.every(i => own[i] === p) && !GR[gi].sp.every(i => s.own[i] === p));
  return {fromGain, toGain, fromSets: newSets(t.from), toSets: newSets(t.to)};
}
function leader(s){
  let best = -1, bw = -1;
  s.players.forEach((p, i) => { if (!p.out){ const w = E.worth(s, i); if (w > bw){ bw = w; best = i; } } });
  return best;
}

/* the bot is t.to: should it take this offer? */
function judgeTrade(s, pid, lv){
  const t = s.trade;
  const g = tradeGain(s, t);
  const me = g.toGain, them = g.fromGain;
  const p = s.players[pid];
  const cashAfter = p.cash - t.get.cash + t.give.cash;
  if (cashAfter < Math.min(60, buffer(s, pid, lv) * .4)) return false;
  if (lv === 1) return me > LV[1].fair + (rand() - .5) * 80;
  // never hand someone a set without getting one back, unless they pay through the nose
  if (g.fromSets.length && !g.toSets.length){
    if (lv >= 3 && leader(s) === pid) return false;
    if (me < them * (lv >= 3 ? 1.1 : .9)) return false;
  }
  if (me <= LV[lv].fair) return false;
  return me >= them * (lv >= 3 ? .9 : .7) - (lv >= 3 ? 0 : 40);
}

/* build a trade for a set we are one piece away from */
function proposeTrade(s, pid, lv, mem){
  if (!LV[lv].trade || s.trade) return null;
  mem.tried = mem.tried || {};
  const p = s.players[pid], buf = buffer(s, pid, lv);
  for (let gi = 0; gi < GR.length; gi++){
    const g = GR[gi];
    const missing = g.sp.filter(i => s.own[i] !== pid);
    if (missing.length !== 1 || g.sp.length - missing.length < 1) continue;
    const want = missing[0], o = s.own[want];
    if (o < 0 || s.players[o].out || E.groupBuilt(s, gi)) continue;
    const key = want + ':' + o;
    if (mem.tried[key] && s.turnNo - mem.tried[key] < s.players.length * 6) continue;
    mem.tried[key] = s.turnNo;
    // 1) a swap where both of us finish a set
    for (let hi = 0; hi < GR.length; hi++){
      if (hi === gi) continue;
      const h = GR[hi], miss = h.sp.filter(i => s.own[i] !== o);
      if (miss.length === 1 && s.own[miss[0]] === pid && !E.groupBuilt(s, hi)){
        const diff = S[miss[0]].price - S[want].price;
        const give = {cash: diff < 0 ? Math.floor(Math.min(-diff, Math.max(0, p.cash - buf))) : 0, props:[miss[0]], cards:0};
        const get = {cash: diff > 0 ? Math.floor(Math.min(diff, s.players[o].cash)) : 0, props:[want], cards:0};
        if (!E.validTrade(s, pid, o, give, get)) return {t:'propose', to:o, give, get};
      }
    }
    // 2) cash, plus a spare street if we are short
    const base = S[want].price * (lv >= 3 ? 1.45 : 1.65) + (s.mort[want] ? -S[want].price * .35 : 0);
    let cash = Math.round(base / 10) * 10;
    const spare = Math.max(0, p.cash - buf * .6);
    const give = {cash: 0, props: [], cards: 0};
    if (spare >= cash) give.cash = cash;
    else {
      give.cash = Math.floor(spare / 10) * 10;
      const sweet = S.filter(x => E.isOwnable(x.i) && s.own[x.i] === pid && !s.mort[x.i] && x.i !== want &&
        !(x.k === 'prop' && (E.ownsGroup(s, pid, x.g) || GR[x.g].sp.filter(j => s.own[j] === pid).length > 1)) &&
        !(x.k === 'prop' && GR[x.g].sp.filter(j => j !== x.i).every(j => s.own[j] === o)))
        .sort((a, b) => b.price - a.price);
      let short = cash - give.cash;
      for (const x of sweet){ if (short <= 0) break; give.props.push(x.i); short -= x.price; }
      if (short > 0) continue;
    }
    const get = {cash:0, props:[want], cards:0};
    if (!E.validTrade(s, pid, o, give, get)) return {t:'propose', to:o, give, get};
  }
  const nobodySet = s.players.every((x, i) => x.out || !E.setsOf(s, i).length);
  // 3) board is split up: buy a lone piece to get closer to a set
  for (let gi = 0; gi < GR.length; gi++){
    const g = GR[gi];
    const mine = g.sp.filter(i => s.own[i] === pid).length;
    if (!mine || mine >= g.sp.length - 1 || E.groupBuilt(s, gi)) continue;
    for (const j of g.sp){
      const o = s.own[j];
      if (o < 0 || o === pid || s.players[o].out || g.sp.filter(i => s.own[i] === o).length !== 1) continue;
      const key = 'c' + j + ':' + o;
      if (mem.tried[key] && s.turnNo - mem.tried[key] < s.players.length * 5) continue;
      mem.tried[key] = s.turnNo;
      const cash = Math.round(S[j].price * (nobodySet ? 1.45 : 1.3) / 10) * 10;
      if (p.cash - cash < buf * .7) continue;
      const give = {cash, props:[], cards:0}, get = {cash:0, props:[j], cards:0};
      if (!E.validTrade(s, pid, o, give, get)) return {t:'propose', to:o, give, get};
    }
  }
  // 4) long stalemate: sell someone the last piece of their set at a big markup
  if (nobodySet || s.round > 45){
    for (let gi = 0; gi < GR.length; gi++){
      const g = GR[gi];
      for (const j of g.sp){
        if (s.own[j] !== pid || E.groupBuilt(s, gi)) continue;
        const others = g.sp.filter(i => i !== j);
        const o = s.own[others[0]];
        if (o < 0 || o === pid || s.players[o].out || !others.every(i => s.own[i] === o)) continue;
        const key = 's' + j + ':' + o;
        if (mem.tried[key] && s.turnNo - mem.tried[key] < s.players.length * 6) continue;
        mem.tried[key] = s.turnNo;
        const cash = Math.min(Math.round(S[j].price * 2.4 / 10) * 10, Math.floor((s.players[o].cash - 40) / 10) * 10);
        if (cash < S[j].price * 1.6) continue;
        const give = {cash:0, props:[j], cards:0}, get = {cash, props:[], cards:0};
        if (!E.validTrade(s, pid, o, give, get)) return {t:'propose', to:o, give, get};
      }
    }
  }
  return null;
}

/* raise cash in debt: mortgage loose streets first, then sell buildings, then mortgage the rest */
function raise(s, pid, need){
  const mine = S.filter(x => E.isOwnable(x.i) && s.own[x.i] === pid);
  const loose = mine.filter(x => !E.canMortgage(s, pid, x.i) && !(x.k === 'prop' && E.ownsGroup(s, pid, x.g)))
    .sort((a, b) => a.price - b.price);
  if (loose.length) return {t:'mortgage', sp:loose[0].i};
  const sells = mine.filter(x => !E.canSell(s, pid, x.i)).sort((a, b) => GR[a.g].hc - GR[b.g].hc || a.price - b.price);
  if (sells.length) return {t:'sell', sp:sells[0].i};
  const rest = mine.filter(x => !E.canMortgage(s, pid, x.i)).sort((a, b) => a.price - b.price);
  if (rest.length) return {t:'mortgage', sp:rest[0].i};
  return null;
}

function develop(s, pid, lv){
  const p = s.players[pid], buf = buffer(s, pid, lv);
  // unmortgage when comfortable, set pieces first
  const morts = S.filter(x => E.isOwnable(x.i) && s.own[x.i] === pid && s.mort[x.i] && !E.canUnmortgage(s, pid, x.i))
    .sort((a, b) => (b.k === 'prop' && E.ownsGroup(s, pid, b.g) ? 1 : 0) - (a.k === 'prop' && E.ownsGroup(s, pid, a.g) ? 1 : 0));
  for (const x of morts){ if (p.cash - E.unmortCost(x.i) >= buf * 1.6 + 60) return {t:'unmortgage', sp:x.i}; }
  // build: lowest houses first, priciest set first (they pay more per landing)
  if (rand() > LV[lv].build) return null;
  const scarce = s.bank.h <= 3;
  // houses are scarce: push the furthest-along set to hotels (that hands 4 houses back), otherwise spread evenly
  const opts = S.filter(x => x.k === 'prop' && s.own[x.i] === pid && !E.canBuild(s, pid, x.i))
    .sort((a, b) => (scarce ? s.bld[b.i] - s.bld[a.i] : s.bld[a.i] - s.bld[b.i]) || b.g - a.g);
  for (const x of opts){
    if (p.cash - GR[x.g].hc >= buf) return {t:'build', sp:x.i};
  }
  // bank is out of houses and we're rich: move a house from a weak set to a strong one so it can reach hotels
  if (s.bank.h === 0 && p.cash > buf + 500){
    const sets = E.setsOf(s, pid).filter(g => GR[g].sp.every(i => !s.mort[i]));
    const lvl = g => Math.min(...GR[g].sp.map(i => s.bld[i]));
    const target = sets.filter(g => lvl(g) >= 1 && lvl(g) < 4).sort((a, b) => lvl(b) - lvl(a) || b - a)[0];
    if (target !== undefined){
      const donor = sets.filter(g => g !== target && GR[g].sp.some(i => s.bld[i] > 0 && s.bld[i] < 5) && lvl(g) <= lvl(target))
        .sort((a, b) => lvl(a) - lvl(b) || a - b)[0];
      if (donor !== undefined){
        const sp = GR[donor].sp.find(i => !E.canSell(s, pid, i) && s.bld[i] < 5);
        if (sp !== undefined) return {t:'sell', sp};
      }
    }
  }
  return null;
}

function decide(s, pid, lv, mem){
  lv = LV[lv] ? lv : 2; mem = mem || {};
  if (!s || s.phase === 'over' || !s.players[pid] || s.players[pid].out) return null;
  const p = s.players[pid];

  if (s.phase === 'debt'){
    const d = s.debts[0];
    if (d.pid !== pid) return null;
    const total = d.items.reduce((t, x) => t + x.amt, 0);
    if (p.cash >= total) return {t:'pay'};
    if (E.liquid(s, pid) < total) return {t:'bankrupt'};
    return raise(s, pid, total - p.cash) || {t:'bankrupt'};
  }

  if (s.trade && s.trade.to === pid) return judgeTrade(s, pid, lv) ? {t:'accept', id:s.trade.id} : {t:'reject'};

  if (s.phase === 'auction'){
    const a = s.auction;
    if (!a.active.includes(pid) || a.by === pid) return null;
    const buf = buffer(s, pid, lv);
    const cap = Math.min(p.cash - (lv === 1 ? 0 : buf * .5), value(s, pid, a.sp, lv) * LV[lv].bid);
    const step = a.high < 60 ? 10 : a.high < 300 ? 20 : 25;
    const amt = Math.max(a.high + step, lv === 1 ? 10 : Math.round(S[a.sp].price * .3 / 10) * 10);
    if (amt <= cap && amt <= p.cash) return {t:'bid', amt};
    return {t:'pass'};
  }

  if (s.cur !== pid) return null;

  if (s.phase === 'buy'){
    const i = s.buy, price = S[i].price, v = value(s, pid, i, lv);
    const buf = unownedCount(s) > 14 ? Math.min(buffer(s, pid, lv), 90) : buffer(s, pid, lv);
    const keen = v > price * 1.5;
    if (p.cash >= price){
      if (p.cash - price >= buf) return lv === 1 && rand() > .85 ? {t:'decline'} : {t:'buy'};
      if (keen && p.cash - price >= buf * .25) return {t:'buy'};
      if (lv >= 2 && p.cash - price >= 0 && v > price * 1.25 && E.liquid(s, pid) - price > buf * 2) return {t:'buy'};
      return {t:'decline'};
    }
    if (lv >= 2 && keen && E.liquid(s, pid) - price > buf){
      const m = raise(s, pid, price - p.cash);
      if (m && m.t === 'mortgage') return m;
    }
    return {t:'decline'};
  }

  if (s.phase === 'roll' || s.phase === 'end'){
    if (s.trade && s.trade.from === pid && mem.tradeTurn !== s.turnNo) return {t:'cancel'};
    const dev = develop(s, pid, lv);
    if (dev) return dev;
    if (s.phase === 'roll' && mem.tradeTurn !== s.turnNo && !s.trade && lv >= 2){
      mem.tradeTurn = s.turnNo;
      const t = proposeTrade(s, pid, lv, mem);
      if (t) return t;
    }
    if (s.phase === 'end') return {t:'end'};
    if (p.jail){
      const early = unownedCount(s) > 6, d = danger(s, pid);
      if (p.cards.length && (early || lv === 1)) return {t:'jailCard'};
      if (early && p.cash >= E.JAIL_FEE + buffer(s, pid, lv) * .5) return {t:'jailPay'};
      if (lv === 1 && p.cash >= 150 && rand() < .5) return {t:'jailPay'};
      if (!early && d > 250) return {t:'roll'};
      if (p.cash >= E.JAIL_FEE + 200 && lv < 3) return {t:'jailPay'};
    }
    return {t:'roll'};
  }
  return null;
}

TY.bot = {decide, value, judgeTrade, tradeGain};
})(typeof window !== 'undefined' ? window : globalThis);
