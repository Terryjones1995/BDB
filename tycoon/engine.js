/* BDB Tycoon rules engine. Pure: step(state, pid, action) returns {state, ev} (a new state plus events) or {err}.
   State is plain JSON so the online host can broadcast it. Dice and decks use a seeded RNG stored in the state.
   pid -1 is the system (host timers: auction end, time limit). */
(function(G){
'use strict';
const TY = G.TY = G.TY || {};
const D = TY.data;
const S = D.spaces, GR = D.groups;
const BANK = -1, JACK = -2;
const HOUSES = 32, HOTELS = 12, GO_PAY = 200, JAIL_FEE = 50;
const isOwnable = i => S[i] && (S[i].k === 'prop' || S[i].k === 'transit' || S[i].k === 'util');
const mortVal = i => S[i].price / 2;
const unmortCost = i => Math.ceil(S[i].price * 11 / 20);   // mortgage value plus 10%, in whole dollars
const interest = i => Math.ceil(S[i].price / 20);
const freeId = deck => D.cards[deck].findIndex(c => c.k === 'free');
const clone = o => JSON.parse(JSON.stringify(o));
const isInt = n => Number.isInteger(n);

/* ---------- rng ---------- */
function rnd(s){
  let t = (s.rng = (s.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const die = s => (s.force && s.force.length) ? s.force.shift() : 1 + Math.floor(rnd(s) * 6);   // force: test hook only
function shuffled(s, n){
  const a = Array.from({length:n}, (_, i) => i);
  for (let i = n - 1; i > 0; i--){ const j = Math.floor(rnd(s) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* ---------- new game ---------- */
function newGame(cfg){
  const o = cfg.opts || {};
  const opts = {
    cash: [1000, 1500, 2000, 2500].includes(o.cash) ? o.cash : 1500,
    jackpot: !!o.jackpot,
    auctions: o.auctions !== false,
    limitMin: [0, 20, 30, 45, 60, 90].includes(o.limitMin) ? o.limitMin : 0,
    limitRounds: [0, 15, 20, 25, 30, 40].includes(o.limitRounds) ? o.limitRounds : 0
  };
  const s = {
    v: 1, seq: 0, rng: (cfg.seed >>> 0) || 1,
    opts,
    players: cfg.players.map((p, i) => ({name: String(p.name || 'Player ' + (i + 1)).slice(0, 24), token: p.token || D.tokens[i % 6].id,
      color: p.color || D.colors[i % 6], cash: opts.cash, pos: 0, jail: 0, cards: [], out: false})),
    own: Array(40).fill(-1), bld: Array(40).fill(0), mort: Array(40).fill(false),
    bank: {h: HOUSES, H: HOTELS},
    cur: 0, phase: 'roll', dice: [0, 0], dbl: 0, again: false,
    buy: -1, auction: null, aq: [], debts: [], resume: null, trade: null, tradeN: 0,
    decks: null, card: null, jackpot: 0, round: 1, turnNo: 1, timeUp: false, over: null,
    log: [], logN: 0
  };
  s.decks = {scout: shuffled(s, D.cards.scout.length), fridge: shuffled(s, D.cards.fridge.length)};
  log(s, `Game on. ${s.players.length} players, $${opts.cash} each. ${s.players[0].name} rolls first.`);
  return s;
}

/* ---------- helpers ---------- */
function log(s, x){ s.log.push({n: ++s.logN, x}); if (s.log.length > 80) s.log.shift(); }
const nm = (s, pid) => pid === BANK ? 'the bank' : pid === JACK ? 'the Break Room jackpot' : s.players[pid].name;
const alive = (s, pid) => isInt(pid) && pid >= 0 && pid < s.players.length && !s.players[pid].out;
const aliveList = s => s.players.map((p, i) => i).filter(i => !s.players[i].out);
const feeTo = s => s.opts.jackpot ? JACK : BANK;
const ownsGroup = (s, pid, g) => GR[g].sp.every(i => s.own[i] === pid);
const groupBuilt = (s, g) => GR[g].sp.some(i => s.bld[i] > 0);
const countKind = (s, pid, k) => S.filter(x => x.k === k && s.own[x.i] === pid).length;
function setsOf(s, pid){ return GR.map((g, i) => i).filter(g => ownsGroup(s, pid, g)); }
function worth(s, pid){
  const p = s.players[pid]; if (p.out) return 0;
  let w = p.cash;
  for (let i = 0; i < 40; i++) if (s.own[i] === pid){
    w += s.mort[i] ? mortVal(i) : S[i].price;
    if (s.bld[i]) w += s.bld[i] * GR[S[i].g].hc;
  }
  return w;
}
/* cash you could raise right now: sell every building at half, mortgage everything */
function liquid(s, pid){
  let v = s.players[pid].cash;
  for (let i = 0; i < 40; i++) if (s.own[i] === pid){
    if (s.bld[i]) v += s.bld[i] * GR[S[i].g].hc / 2;
    if (!s.mort[i]) v += mortVal(i);
  }
  return v;
}
function rentFor(s, i, mod){
  mod = mod || {};
  const sp = S[i], o = s.own[i];
  if (o < 0 || s.mort[i]) return 0;
  if (sp.k === 'prop'){ const b = s.bld[i]; return b ? sp.rent[b] : sp.rent[0] * (ownsGroup(s, o, sp.g) ? 2 : 1); }
  if (sp.k === 'transit') return 25 * (1 << (countKind(s, o, 'transit') - 1)) * (mod.near === 'transit' ? 2 : 1);
  if (sp.k === 'util'){
    const sum = mod.dice || (s.dice[0] + s.dice[1]);
    return sum * (mod.near === 'util' || countKind(s, o, 'util') >= 2 ? 10 : 4);
  }
  return 0;
}
function gainSets(s, pid, before, ev){
  if (!alive(s, pid)) return;
  for (const g of setsOf(s, pid)) if (!before.includes(g)){ ev.push({t:'set', pid, g}); log(s, `${nm(s, pid)} owns the full ${GR[g].name} set.`); }
}

/* ---------- building and mortgage checks (shared with UI and bots): return an error string or null ---------- */
function canBuild(s, pid, i){
  if (!isInt(i) || !S[i] || S[i].k !== 'prop') return 'Only streets take houses';
  if (s.own[i] !== pid) return 'Not yours';
  const g = S[i].g, sp = GR[g].sp;
  if (!ownsGroup(s, pid, g)) return 'You need the full set first';
  if (sp.some(j => s.mort[j])) return 'Unmortgage the whole set first';
  const b = s.bld[i];
  if (b >= 5) return 'Already has a hotel';
  if (b > Math.min(...sp.map(j => s.bld[j]))) return 'Build evenly across the set';
  if (s.players[pid].cash < GR[g].hc) return 'Not enough cash';
  if (b < 4 && s.bank.h < 1) return 'The bank is out of houses';
  if (b === 4 && s.bank.H < 1) return 'The bank is out of hotels';
  return null;
}
function canSell(s, pid, i){
  if (!isInt(i) || !S[i] || S[i].k !== 'prop') return 'Nothing to sell';
  if (s.own[i] !== pid) return 'Not yours';
  if (!s.bld[i]) return 'No buildings here';
  if (s.bld[i] < Math.max(...GR[S[i].g].sp.map(j => s.bld[j]))) return 'Sell evenly across the set';
  return null;
}
function canMortgage(s, pid, i){
  if (!isInt(i) || !isOwnable(i)) return 'Not a property';
  if (s.own[i] !== pid) return 'Not yours';
  if (s.mort[i]) return 'Already mortgaged';
  if (S[i].k === 'prop' && groupBuilt(s, S[i].g)) return 'Sell the buildings in this set first';
  return null;
}
function canUnmortgage(s, pid, i){
  if (!isInt(i) || !isOwnable(i)) return 'Not a property';
  if (s.own[i] !== pid) return 'Not yours';
  if (!s.mort[i]) return 'Not mortgaged';
  if (s.players[pid].cash < unmortCost(i)) return 'Not enough cash';
  return null;
}

/* ---------- trades ---------- */
function cleanSide(x){
  x = x && typeof x === 'object' ? x : {};
  const cash = isInt(x.cash) && x.cash > 0 ? Math.min(x.cash, 1e6) : 0;
  const props = Array.isArray(x.props) ? [...new Set(x.props.filter(i => isInt(i) && isOwnable(i)))].sort((a, b) => a - b).slice(0, 28) : [];
  const cards = isInt(x.cards) && x.cards > 0 ? Math.min(x.cards, 2) : 0;
  return {cash, props, cards};
}
function validTrade(s, from, to, give, get){
  if (!alive(s, from) || !alive(s, to) || from === to) return 'Pick another player still in the game';
  if (!give.cash && !get.cash && !give.props.length && !get.props.length && !give.cards && !get.cards) return 'Put something on the table';
  for (const i of give.props) if (s.own[i] !== from) return `${S[i].name} isn't ${nm(s, from)}'s to trade`;
  for (const i of get.props) if (s.own[i] !== to) return `${S[i].name} isn't ${nm(s, to)}'s to trade`;
  for (const i of give.props.concat(get.props)) if (S[i].k === 'prop' && groupBuilt(s, S[i].g)) return `Sell the buildings on the ${GR[S[i].g].name} set first`;
  const A = s.players[from], B = s.players[to];
  if (give.cash > A.cash) return `${A.name} doesn't have $${give.cash}`;
  if (get.cash > B.cash) return `${B.name} doesn't have $${get.cash}`;
  if (give.cards > A.cards.length || get.cards > B.cards.length) return 'Not enough get-off-the-bench cards';
  const feeA = get.props.filter(i => s.mort[i]).reduce((t, i) => t + interest(i), 0);
  const feeB = give.props.filter(i => s.mort[i]).reduce((t, i) => t + interest(i), 0);
  if (A.cash - give.cash + get.cash < feeA) return `${A.name} can't cover the 10% interest on mortgaged property`;
  if (B.cash - get.cash + give.cash < feeB) return `${B.name} can't cover the 10% interest on mortgaged property`;
  return null;
}

/* ---------- movement and landing ---------- */
function passGo(s, pid, ev){ s.players[pid].cash += GO_PAY; ev.push({t:'go', pid, amt:GO_PAY}); log(s, `${nm(s, pid)} clocks in and collects $${GO_PAY}.`); }
function moveBy(s, pid, n, ev, mod){
  const p = s.players[pid], from = p.pos;
  const to = ((from + n) % 40 + 40) % 40;
  ev.push({t:'move', pid, from, to, n});
  p.pos = to;
  if (n > 0 && to < from) passGo(s, pid, ev);
  land(s, pid, ev, mod || {});
}
function moveTo(s, pid, to, ev, mod){ moveBy(s, pid, ((to - s.players[pid].pos) % 40 + 40) % 40, ev, mod); }
function sendJail(s, pid, ev, why){
  const p = s.players[pid];
  ev.push({t:'jail', pid, from:p.pos, why});
  p.pos = 10; p.jail = 1;
  if (pid === s.cur){ s.again = false; s.dbl = 0; }
  log(s, `${p.name} is Benched${why === 'speeding' ? ' for rolling three doubles' : ''}.`);
}
function charge(s, pid, amt, to, why){
  if (amt <= 0) return true;
  const p = s.players[pid];
  if (p.cash >= amt){ pay(s, pid, amt, to); return true; }
  s.debts.push({pid, items:[{to, amt}], why});
  log(s, `${p.name} owes $${amt} and needs to raise cash.`);
  return false;
}
function pay(s, pid, amt, to){
  s.players[pid].cash -= amt;
  if (to >= 0) s.players[to].cash += amt;
  else if (to === JACK) s.jackpot += amt;
}
function land(s, pid, ev, mod){
  const p = s.players[pid], i = p.pos, sp = S[i];
  switch (sp.k){
    case 'go': case 'jail': return;
    case 'free':
      if (s.opts.jackpot && s.jackpot > 0){ const amt = s.jackpot; p.cash += amt; s.jackpot = 0; ev.push({t:'jackpot', pid, amt}); log(s, `${p.name} takes the Break Room jackpot: $${amt}.`); }
      else ev.push({t:'rest', pid});
      return;
    case 'gojail': sendJail(s, pid, ev, 'space'); return;
    case 'tax':
      ev.push({t:'tax', pid, sp:i, amt:sp.amt}); log(s, `${p.name} pays $${sp.amt} for ${sp.name}.`);
      charge(s, pid, sp.amt, feeTo(s), 'tax'); return;
    case 'card': drawCard(s, pid, sp.deck, ev); return;
  }
  const o = s.own[i];
  if (o === -1){ s.phase = 'buy'; s.buy = i; ev.push({t:'offer', pid, sp:i}); return; }
  if (o === pid) return;
  if (s.mort[i]){ ev.push({t:'mortfree', pid, sp:i}); log(s, `${sp.name} is mortgaged. No rent for ${nm(s, o)}.`); return; }
  if (sp.k === 'util' && mod.near === 'util'){
    const d = [die(s), die(s)]; mod = Object.assign({}, mod, {dice: d[0] + d[1]});
    ev.push({t:'roll', pid, d, util:true});
  }
  const amt = rentFor(s, i, mod);
  ev.push({t:'rent', pid, to:o, sp:i, amt});
  log(s, `${p.name} pays ${nm(s, o)} $${amt} at ${sp.name}.`);
  charge(s, pid, amt, o, 'rent');
}
function drawCard(s, pid, deck, ev){
  const p = s.players[pid];
  const id = s.decks[deck].shift();
  const c = D.cards[deck][id];
  if (c.k === 'free') p.cards.push(deck); else s.decks[deck].push(id);
  s.card = {deck, id, pid};
  ev.push({t:'card', pid, deck, id});
  log(s, `${p.name} draws ${D.deckName[deck]}: ${c.x}`);
  switch (c.k){
    case 'goto': moveTo(s, pid, c.to, ev); break;
    case 'near': { let i = p.pos; do { i = (i + 1) % 40; } while (S[i].k !== c.w); moveTo(s, pid, i, ev, {near:c.w}); break; }
    case 'back': moveBy(s, pid, -c.n, ev); break;
    case 'jail': sendJail(s, pid, ev, 'card'); break;
    case 'money': if (c.amt > 0) p.cash += c.amt; else charge(s, pid, -c.amt, feeTo(s), 'card'); break;
    case 'repair': {
      let h = 0, H = 0;
      for (let i = 0; i < 40; i++) if (s.own[i] === pid){ if (s.bld[i] === 5) H++; else h += s.bld[i]; }
      const amt = h * c.h + H * c.H;
      if (amt){ log(s, `${p.name} owes $${amt} for repairs.`); charge(s, pid, amt, feeTo(s), 'card'); }
      break;
    }
    case 'each': {
      const others = aliveList(s).filter(o => o !== pid);
      if (c.amt > 0){ for (const o of others) charge(s, o, c.amt, pid, 'card'); }
      else {
        const amt = -c.amt, total = amt * others.length;
        if (p.cash >= total) others.forEach(o => pay(s, pid, amt, o));
        else { s.debts.push({pid, items: others.map(o => ({to:o, amt})), why:'card'}); log(s, `${p.name} owes $${total} and needs to raise cash.`); }
      }
      break;
    }
  }
}

/* ---------- turn flow ---------- */
function advance(s, ev){
  if (s.phase === 'over') return;
  if (aliveList(s).length <= 1) return finish(s, ev, 'last');
  if (s.debts.length){ s.phase = 'debt'; return; }
  if (s.resume){ const r = s.resume; s.resume = null; s.phase = 'resolve'; if (alive(s, r.pid)) moveBy(s, r.pid, r.n, ev); return advance(s, ev); }
  if (s.phase === 'buy' || s.phase === 'auction') return;
  if (s.aq.length){ startAuction(s, s.aq.shift(), ev); return; }
  const p = s.players[s.cur];
  if (p.out) return nextTurn(s, ev);
  if (s.again && !p.jail){ s.phase = 'roll'; } else s.phase = 'end';
  s.again = false;
}
function nextTurn(s, ev){
  if (s.timeUp) return finish(s, ev, 'time');
  const n = s.players.length;
  let i = s.cur, wrapped = false;
  for (let k = 0; k < n; k++){ i = (i + 1) % n; if (i === 0) wrapped = true; if (!s.players[i].out) break; }
  if (wrapped){ s.round++; if (s.opts.limitRounds && s.round > s.opts.limitRounds){ s.round--; return finish(s, ev, 'rounds'); } }
  s.cur = i; s.dbl = 0; s.again = false; s.phase = 'roll'; s.buy = -1; s.turnNo++;
  ev.push({t:'turn', pid:i});
}
function finish(s, ev, why){
  const w = s.players.map((p, i) => worth(s, i));
  const al = aliveList(s);
  let win = al[0];
  for (const i of al) if (w[i] > w[win]) win = i;
  s.phase = 'over'; s.auction = null; s.trade = null; s.debts = [];
  s.over = {winner: win, why, worth: w};
  ev.push({t:'over', pid:win, why});
  log(s, why === 'last' ? `${nm(s, win)} is the last one standing and wins.` : `${why === 'time' ? 'Time is up' : 'Last round done'}. ${nm(s, win)} wins on net worth with $${w[win]}.`);
}
function startAuction(s, i, ev){
  s.auction = {sp:i, high:0, by:-1, active: aliveList(s), n:0};
  s.phase = 'auction';
  ev.push({t:'auction', sp:i});
  log(s, `${S[i].name} goes to auction.`);
}
function closeAuction(s, ev){
  const a = s.auction; s.auction = null; s.phase = 'resolve';
  if (a.by >= 0 && alive(s, a.by)){
    const before = setsOf(s, a.by);
    s.own[a.sp] = a.by;
    ev.push({t:'won', pid:a.by, sp:a.sp, amt:a.high});
    log(s, `${nm(s, a.by)} wins ${S[a.sp].name} at auction for $${a.high}.`);
    charge(s, a.by, a.high, BANK, 'auction');
    gainSets(s, a.by, before, ev);
  } else { ev.push({t:'nobid', sp:a.sp}); log(s, `No bids. ${S[a.sp].name} stays with the bank.`); }
  advance(s, ev);
}
function bankrupt(s, pid, ev){
  const d = s.debts.shift(), p = s.players[pid];
  const c0 = d.items.length === 1 ? d.items[0].to : BANK;
  const cred = c0 >= 0 && alive(s, c0) ? c0 : BANK;
  for (let i = 0; i < 40; i++) if (s.own[i] === pid && s.bld[i]){
    p.cash += s.bld[i] * GR[S[i].g].hc / 2;
    if (s.bld[i] === 5) s.bank.H++; else s.bank.h += s.bld[i];
    s.bld[i] = 0;
  }
  const before = cred >= 0 ? setsOf(s, cred) : [];
  if (cred >= 0){
    const c = s.players[cred];
    c.cash += p.cash;
    for (let i = 0; i < 40; i++) if (s.own[i] === pid){ s.own[i] = cred; if (s.mort[i]){ const f = Math.min(c.cash, interest(i)); c.cash -= f; } }
    c.cards.push(...p.cards);
  } else {
    for (let i = 0; i < 40; i++) if (s.own[i] === pid){ s.own[i] = -1; s.mort[i] = false; if (s.opts.auctions) s.aq.push(i); }
    for (const deck of p.cards) s.decks[deck].push(freeId(deck));
  }
  p.cash = 0; p.cards = []; p.out = true; p.jail = 0;
  s.debts = s.debts.filter(x => x.pid !== pid);
  for (const x of s.debts) for (const it of x.items) if (it.to === pid) it.to = BANK;
  if (s.trade && (s.trade.from === pid || s.trade.to === pid)) s.trade = null;
  if (s.resume && s.resume.pid === pid) s.resume = null;
  if (pid === s.cur) s.again = false;
  ev.push({t:'bankrupt', pid, to:cred});
  log(s, `${p.name} is bankrupt${cred >= 0 ? `. Everything goes to ${nm(s, cred)}` : '. Their property goes back to the bank'}.`);
  if (cred >= 0) gainSets(s, cred, before, ev);
  s.phase = 'resolve';
  advance(s, ev);
}

/* ---------- actions ---------- */
const A = {
  roll(s, pid, a, ev){
    if (s.phase !== 'roll' || pid !== s.cur) return 'Not your roll';
    const p = s.players[pid];
    const d1 = die(s), d2 = die(s), dbl = d1 === d2;
    s.dice = [d1, d2];
    ev.push({t:'roll', pid, d:[d1, d2]});
    log(s, `${p.name} rolls ${d1} + ${d2}${dbl ? ', doubles' : ''}.`);
    s.phase = 'resolve';
    if (p.jail){
      if (dbl){ p.jail = 0; s.again = false; ev.push({t:'unjail', pid, how:'doubles'}); log(s, `${p.name} rolls out of Benched.`); moveBy(s, pid, d1 + d2, ev); }
      else if (p.jail >= 3){
        p.jail = 0; ev.push({t:'unjail', pid, how:'forced'}); log(s, `${p.name} has to pay $${JAIL_FEE} to leave Benched.`);
        if (charge(s, pid, JAIL_FEE, feeTo(s), 'jail')) moveBy(s, pid, d1 + d2, ev);
        else s.resume = {pid, n: d1 + d2};
      } else { p.jail++; ev.push({t:'stay', pid}); }
    } else if (dbl){
      s.dbl++;
      if (s.dbl >= 3){ sendJail(s, pid, ev, 'speeding'); }
      else { s.again = true; moveBy(s, pid, d1 + d2, ev); }
    } else { s.again = false; moveBy(s, pid, d1 + d2, ev); }
    advance(s, ev);
  },
  jailPay(s, pid, a, ev){
    const p = s.players[pid];
    if (s.phase !== 'roll' || pid !== s.cur || !p.jail) return 'Not Benched';
    if (p.cash < JAIL_FEE) return 'Not enough cash';
    pay(s, pid, JAIL_FEE, feeTo(s)); p.jail = 0;
    ev.push({t:'unjail', pid, how:'paid'}); log(s, `${p.name} pays $${JAIL_FEE} to get off the bench.`);
  },
  jailCard(s, pid, a, ev){
    const p = s.players[pid];
    if (s.phase !== 'roll' || pid !== s.cur || !p.jail) return 'Not Benched';
    if (!p.cards.length) return 'No card to use';
    const deck = p.cards.shift(); s.decks[deck].push(freeId(deck)); p.jail = 0;
    ev.push({t:'unjail', pid, how:'card'}); log(s, `${p.name} uses a get-off-the-bench card.`);
  },
  buy(s, pid, a, ev){
    if (s.phase !== 'buy' || pid !== s.cur) return 'Nothing to buy';
    const i = s.buy, p = s.players[pid];
    if (p.cash < S[i].price) return 'Not enough cash. Mortgage something or send it to auction';
    const before = setsOf(s, pid);
    pay(s, pid, S[i].price, BANK); s.own[i] = pid; s.buy = -1;
    ev.push({t:'buy', pid, sp:i, amt:S[i].price}); log(s, `${p.name} buys ${S[i].name} for $${S[i].price}.`);
    gainSets(s, pid, before, ev);
    s.phase = 'resolve'; advance(s, ev);
  },
  decline(s, pid, a, ev){
    if (s.phase !== 'buy' || pid !== s.cur) return 'Nothing to pass on';
    const i = s.buy; s.buy = -1;
    if (s.opts.auctions) startAuction(s, i, ev);
    else { ev.push({t:'skip', pid, sp:i}); log(s, `${nm(s, pid)} passes on ${S[i].name}.`); s.phase = 'resolve'; advance(s, ev); }
  },
  bid(s, pid, a, ev){
    const au = s.auction;
    if (s.phase !== 'auction' || !au || !au.active.includes(pid)) return 'You are out of this auction';
    if (au.by === pid) return 'You already have the high bid';
    const amt = a.amt;
    if (!isInt(amt) || amt <= au.high) return `Bid more than $${au.high}`;
    if (amt > s.players[pid].cash) return 'You do not have that much cash';
    au.high = amt; au.by = pid; au.n++;
    ev.push({t:'bid', pid, amt}); log(s, `${nm(s, pid)} bids $${amt}.`);
    if (au.active.length === 1) closeAuction(s, ev);
  },
  pass(s, pid, a, ev){
    const au = s.auction;
    if (s.phase !== 'auction' || !au || !au.active.includes(pid)) return 'You are out of this auction';
    if (au.by === pid) return 'You have the high bid';
    au.active = au.active.filter(x => x !== pid); au.n++;
    ev.push({t:'pass', pid});
    if (!au.active.length || (au.active.length === 1 && au.active[0] === au.by)) closeAuction(s, ev);
  },
  auctionEnd(s, pid, a, ev){
    if (pid !== -1) return 'Only the auctioneer ends it';
    if (s.phase !== 'auction') return 'No auction';
    closeAuction(s, ev);
  },
  end(s, pid, a, ev){
    if (s.phase !== 'end' || pid !== s.cur) return 'Not your turn to end';
    ev.push({t:'endturn', pid});
    nextTurn(s, ev);
  },
  build(s, pid, a, ev){
    const e = canBuild(s, pid, a.sp); if (e) return e;
    const i = a.sp, g = GR[S[i].g];
    if (s.bld[i] === 4){ s.bank.H--; s.bank.h += 4; } else s.bank.h--;
    s.bld[i]++; s.players[pid].cash -= g.hc;
    ev.push({t:'build', pid, sp:i, n:s.bld[i]});
    log(s, `${nm(s, pid)} builds ${s.bld[i] === 5 ? 'a hotel' : 'a house'} on ${S[i].name}.`);
  },
  sell(s, pid, a, ev){
    const e = canSell(s, pid, a.sp); if (e) return e;
    const i = a.sp, half = GR[S[i].g].hc / 2;
    let got;
    if (s.bld[i] === 5){
      const k = Math.min(4, s.bank.h);
      s.bank.H++; s.bank.h -= k; got = half * (5 - k); s.bld[i] = k;
    } else { s.bank.h++; s.bld[i]--; got = half; }
    s.players[pid].cash += got;
    ev.push({t:'sell', pid, sp:i, amt:got});
    log(s, `${nm(s, pid)} sells a building on ${S[i].name} for $${got}.`);
  },
  mortgage(s, pid, a, ev){
    const e = canMortgage(s, pid, a.sp); if (e) return e;
    s.mort[a.sp] = true; s.players[pid].cash += mortVal(a.sp);
    ev.push({t:'mortgage', pid, sp:a.sp, amt:mortVal(a.sp)});
    log(s, `${nm(s, pid)} mortgages ${S[a.sp].name} for $${mortVal(a.sp)}.`);
  },
  unmortgage(s, pid, a, ev){
    const e = canUnmortgage(s, pid, a.sp); if (e) return e;
    const c = unmortCost(a.sp);
    s.mort[a.sp] = false; s.players[pid].cash -= c;
    ev.push({t:'unmortgage', pid, sp:a.sp, amt:c});
    log(s, `${nm(s, pid)} pays $${c} to unmortgage ${S[a.sp].name}.`);
  },
  pay(s, pid, a, ev){
    const d = s.debts[0];
    if (s.phase !== 'debt' || !d || d.pid !== pid) return 'You do not owe anything';
    const total = d.items.reduce((t, x) => t + x.amt, 0);
    if (s.players[pid].cash < total) return `You need $${total - s.players[pid].cash} more`;
    for (const it of d.items) pay(s, pid, it.amt, it.to);
    s.debts.shift();
    ev.push({t:'paid', pid, amt:total}); log(s, `${nm(s, pid)} pays the $${total}.`);
    s.phase = 'resolve'; advance(s, ev);
  },
  bankrupt(s, pid, a, ev){
    const d = s.debts[0];
    if (s.phase !== 'debt' || !d || d.pid !== pid) return 'Only someone in debt can go bankrupt';
    bankrupt(s, pid, ev);
  },
  propose(s, pid, a, ev){
    if (!alive(s, pid)) return 'You are out';
    if (s.phase === 'auction') return 'Wait for the auction to finish';
    const to = a.to, t = s.trade;
    if (t && !(t.from === pid || (t.to === pid && to === t.from))) return 'Another trade is already on the table';
    const give = cleanSide(a.give), get = cleanSide(a.get);
    const e = validTrade(s, pid, to, give, get); if (e) return e;
    const counter = !!(t && t.to === pid);
    s.trade = {id: ++s.tradeN, from:pid, to, give, get, counter, turn:s.turnNo};
    ev.push({t:'offer-trade', pid, to, counter});
    log(s, `${nm(s, pid)} ${counter ? 'counters' : 'offers a trade to'} ${nm(s, to)}.`);
  },
  accept(s, pid, a, ev){
    const t = s.trade;
    if (!t || t.to !== pid) return 'No offer for you';
    if (isInt(a.id) && a.id !== t.id) return 'That offer changed. Take another look';
    s.trade = null;
    const e = validTrade(s, t.from, t.to, t.give, t.get);
    if (e){ ev.push({t:'trade-void', pid:t.from, to:t.to}); log(s, `Trade fell through: ${e}.`); return; }
    const A_ = s.players[t.from], B = s.players[t.to];
    const bA = setsOf(s, t.from), bB = setsOf(s, t.to);
    A_.cash += t.get.cash - t.give.cash; B.cash += t.give.cash - t.get.cash;
    for (const i of t.give.props){ s.own[i] = t.to; if (s.mort[i]) B.cash -= interest(i); }
    for (const i of t.get.props){ s.own[i] = t.from; if (s.mort[i]) A_.cash -= interest(i); }
    B.cards.push(...A_.cards.splice(0, t.give.cards));
    A_.cards.push(...B.cards.splice(0, t.get.cards));
    ev.push({t:'trade', pid:t.from, to:t.to, give:t.give, get:t.get});
    log(s, `${A_.name} and ${B.name} make a trade.`);
    gainSets(s, t.from, bA, ev); gainSets(s, t.to, bB, ev);
  },
  reject(s, pid, a, ev){
    const t = s.trade;
    if (!t || t.to !== pid) return 'No offer for you';
    s.trade = null; ev.push({t:'reject', pid:t.from, to:pid}); log(s, `${nm(s, pid)} turns down ${nm(s, t.from)}'s offer.`);
  },
  cancel(s, pid, a, ev){
    const t = s.trade;
    if (!t || t.from !== pid) return 'No offer to cancel';
    s.trade = null; ev.push({t:'cancel-trade', pid});
  },
  timeUp(s, pid, a, ev){
    if (pid !== -1) return 'Only the clock can do that';
    if (s.timeUp) return 'Already called';
    s.timeUp = true; ev.push({t:'timeup'}); log(s, 'Time is up. This is the last turn.');
  }
};

function step(state, pid, act){
  if (!state || !act || typeof act !== 'object' || typeof act.t !== 'string' || !Object.prototype.hasOwnProperty.call(A, act.t)) return {err:'Unknown move'};
  if (state.phase === 'over') return {err:'The game is over'};
  if (pid !== -1 && !alive(state, pid)) return {err:'You are out of the game'};
  const s = clone(state), ev = [];
  const e = A[act.t](s, pid, act, ev);
  if (e) return {err:e};
  s.seq++;
  return {state:s, ev};
}

/* who the game is waiting on right now (for the UI and bots) */
function waitingOn(s){
  if (s.phase === 'over') return [];
  if (s.phase === 'debt') return [s.debts[0].pid];
  if (s.phase === 'auction') return s.auction.active.filter(p => p !== s.auction.by);
  return [s.cur];
}

TY.engine = {newGame, step, rentFor, canBuild, canSell, canMortgage, canUnmortgage, validTrade, cleanSide, worth, liquid, ownsGroup, groupBuilt,
  setsOf, countKind, waitingOn, unmortCost, mortVal, interest, isOwnable, BANK, JACK, JAIL_FEE};
})(typeof window !== 'undefined' ? window : globalThis);
