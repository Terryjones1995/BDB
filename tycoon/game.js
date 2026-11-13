import { initNet, clean, rid, okCode } from './table.js';

/* =========================================================
   BDB Tycoon: board, panels, animations, BDB on the mic, bots, save/resume and online tables.
   Rules live in engine.js (pure), bot brains in bots.js. This file never changes game state directly:
   everything goes through E.step on this device (local / host) or is sent to the host (guest).
   ========================================================= */

const {data:D, engine:E, bot:BOT} = window.TY;
const S = D.spaces, GR = D.groups;
const $ = id => document.getElementById(id);
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const money = n => '$' + Math.round(n).toLocaleString('en-CA');
const wait = ms => new Promise(r => setTimeout(r, ms));
const params = new URLSearchParams(location.search);
const LOCAL_NET = params.get('net') === 'local';
BDB.init({game:'tycoon', extra:D.extra});

/* ---------- icons (static markup only) ---------- */
const ICON = {
  ball:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6c3.2 3.4 3.2 9.4 0 12.8M18.4 5.6c-3.2 3.4-3.2 9.4 0 12.8"/>',
  lanyard:'<path d="M7 2l5 9 5-9"/><rect x="7" y="11" width="10" height="11" rx="2"/><path d="M10 16h4M10 19h3"/>',
  coffee:'<path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 11h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M8 2.5c0 2 2 2 2 4M12 2.5c0 2 2 2 2 4"/>',
  clock:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6M12 2v3"/>',
  sneaker:'<path d="M2 17v-6l4-1 3 3 4-1 5 3c2.2.6 4 1.6 4 3v1H2z"/><path d="M2 19.5h20M8 12.5l1.2-2M11 12l1.2-2"/>',
  whistle:'<circle cx="9" cy="14" r="6"/><path d="M12.5 9.2L21 5v4.5l-5.6 2.4"/><circle cx="9" cy="14" r="1.6"/>',
  phone:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2M3 8c0-2 1-3.5 2-4.5M21 8c0-2-1-3.5-2-4.5"/>',
  fridge:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M6 9h12M9 4.5v2.5M9 12v4"/>',
  bus:'<rect x="4" y="3" width="16" height="15" rx="2.5"/><path d="M4 11h16M8 18v3M16 18v3M9 6.5h6"/><circle cx="8" cy="14.5" r=".9"/><circle cx="16" cy="14.5" r=".9"/>',
  vend:'<rect x="5" y="2" width="14" height="20" rx="1.5"/><path d="M8 6h5M8 9.5h5M8 13h5M16 6v7M8 18h8"/>',
  receipt:'<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  bench:'<path d="M3 9h18M3 13h18M5 13v7M19 13v7M6 9V5h12v4"/>',
  couch:'<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M2 12a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2z"/><path d="M5 17v2.5M19 17v2.5"/>',
  arrow:'<path d="M19 12H5M11 6l-6 6 6 6"/>'
};
const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k] || ''}</svg>`;
const TOKEN_IDS = D.tokens.map(t => t.id);
const spIcon = sp => sp.k === 'card' ? (sp.deck === 'scout' ? 'phone' : 'fridge') : sp.k === 'transit' ? 'bus' : sp.k === 'util' ? (sp.i === 12 ? 'coffee' : 'vend') :
  sp.k === 'tax' ? 'receipt' : sp.k === 'go' ? 'clock' : sp.k === 'jail' ? 'bench' : sp.k === 'free' ? 'couch' : sp.k === 'gojail' ? 'whistle' : '';
const tokIcon = id => svg(TOKEN_IDS.includes(id) ? id : 'ball');

/* ---------- state ---------- */
const SPEEDS = [{n:'Chill', bot:1400, step:200, anim:1.3}, {n:'Normal', bot:800, step:135, anim:1}, {n:'Fast', bot:330, step:80, anim:.6}, {n:'Turbo', bot:70, step:26, anim:.22}];
let mode = 'menu';            // menu | play | over
let role = 'local';           // local | host | guest
let state = null;             // the real game (local/host) or the host's latest copy (guest)
let shown = null;             // what the screen shows; lags behind state while tokens move
let seats = [];               // per pid: {kind:'you'|'human'|'bot'|'remote'|'open', level, name, token, color, peer, tok, away}
let mySeat = -1;
let speed = +(BDB.store.get('ty-speed') ?? 1); if (!SPEEDS[speed]) speed = 1;
let paused = false;
let busy = false;
const Q = [];
let vpos = [], vjail = [];
let slot = null;              // centre card: {k:'card', deck, id}
let lastLogN = 0;
let nextBotAt = 0;
const botMem = [];
const clock = {acc:0, since:null};
let overShown = false;
let lastTradeSeen = 0;

/* ---------- setup screen ---------- */
const SEAT_TYPES = [['you','You'], ['human','Local player'], ['bot1','Bot: Rec League'], ['bot2','Bot: Varsity'], ['bot3','Bot: Pro Scout'], ['open','Open (online)'], ['off','Empty']];
const NA = ['Bench','Lanyard','Clock-In','Break Room','Air Ball','Free Throw','Fast Break','Rec League','Sixth Man','Shot Clock'];
const NB = ['Legend','Warmer','Prospect','Specialist','Captain','Rookie','Phenom','Walk-On','Scout','MVP'];
let myName = clean(BDB.store.get('ty-name'), 20) || `${BDB.pick(NA)} ${BDB.pick(NB)}`;
let setup = null;
try { setup = JSON.parse(BDB.store.get('ty-setup')); } catch(e){}
if (!setup || !Array.isArray(setup.seats) || setup.seats.length !== 6) setup = {
  seats:[{type:'you'}, {type:'bot2', name:'Bench BDB'}, {type:'bot2', name:'Night Shift BDB'}, {type:'off'}, {type:'off'}, {type:'off'}],
  tok:[0, 1, 2, 3, 4, 5], cash:1500, limit:'0', auctions:'1', jackpot:'0'
};
setup.seats.forEach((s, i) => { if (!SEAT_TYPES.some(t => t[0] === s.type)) s.type = 'off'; s.name = clean(s.name, 20); if (!Number.isInteger(setup.tok[i]) || !D.tokens[setup.tok[i]]) setup.tok[i] = i; });
const saveSetup = () => BDB.store.set('ty-setup', JSON.stringify(setup));

function defaultName(i, type){
  if (type === 'you') return myName;
  if (type.startsWith('bot')) return D.botNames[i];
  if (type === 'open') return 'Open seat';
  return 'Player ' + (i + 1);
}
function renderSetup(){
  const box = $('seats'); box.innerHTML = '';
  setup.seats.forEach((st, i) => {
    const row = mk('div', 'seat' + (st.type === 'off' ? ' off' : ''));
    const tb = mk('button', 'stok'); tb.type = 'button'; tb.style.setProperty('--pc', D.colors[i]);
    tb.innerHTML = tokIcon(D.tokens[setup.tok[i]].id); tb.setAttribute('aria-label', `Seat ${i + 1} token: ${D.tokens[setup.tok[i]].name}. Tap to change`);
    tb.onclick = () => {
      const used = new Set(setup.seats.map((s, j) => j !== i && s.type !== 'off' ? setup.tok[j] : -1));
      let t = setup.tok[i];
      for (let k = 0; k < 6; k++){ t = (t + 1) % 6; if (!used.has(t)) break; }
      setup.tok[i] = t; saveSetup(); renderSetup();
    };
    const inp = mk('input', 'inp'); inp.maxLength = 20; inp.autocomplete = 'off'; inp.setAttribute('aria-label', `Seat ${i + 1} name`);
    inp.value = st.type === 'you' ? myName : (st.name || defaultName(i, st.type));
    inp.disabled = st.type === 'off' || st.type === 'open';
    inp.onchange = () => {
      const v = clean(inp.value, 20);
      if (st.type === 'you'){ if (v){ myName = v; BDB.store.set('ty-name', v); $('myName').value = v; } }
      else st.name = v;
      saveSetup(); renderSetup();
    };
    const sel = mk('select', 'sel'); sel.setAttribute('aria-label', `Seat ${i + 1} type`);
    for (const [v, l] of SEAT_TYPES){ const o = mk('option', null, l); o.value = v; sel.appendChild(o); }
    sel.value = st.type;
    sel.onchange = () => {
      if (sel.value === 'you') setup.seats.forEach(s => { if (s.type === 'you') s.type = 'human'; });
      st.type = sel.value;
      if (!st.name || D.botNames.includes(st.name) || /^Player \d$/.test(st.name)) st.name = '';
      saveSetup(); renderSetup();
    };
    row.append(tb, inp, sel); box.appendChild(row);
  });
  const on = setup.seats.filter(s => s.type !== 'off');
  const open = on.filter(s => s.type === 'open').length;
  $('seatCount').textContent = `${on.length} of 6 seats`;
  const note = $('setNote');
  note.className = 'setnote';
  if (on.length < 2){ note.textContent = 'You need at least 2 seats filled.'; note.classList.add('bad'); }
  else if (open && NET && NET.failed){ note.textContent = "Online play couldn't start in this browser, so open seats won't work here."; note.classList.add('bad'); }
  else if (open) note.textContent = `${open} open ${open === 1 ? 'seat' : 'seats'}: you'll get an invite link. Seats nobody takes get a BDB bot.`;
  else if (!on.some(s => s.type === 'you' || s.type === 'human')) note.textContent = 'All bots. Sit back and watch BDB lose to himself.';
  else note.textContent = '';
  $('play').textContent = open ? 'Open online table' : 'Start game';
  $('play').disabled = on.length < 2;
  $('optCash').value = String(setup.cash); $('optLimit').value = setup.limit; $('optAuction').value = setup.auctions; $('optJackpot').value = setup.jackpot;
  $('optSpeed').value = String(speed);
  const sv = loadSave();
  $('resume').hidden = !sv;
  if (sv) $('resume').textContent = `Resume (round ${sv.state.round})`;
}
for (const [id, key] of [['optCash', 'cash'], ['optLimit', 'limit'], ['optAuction', 'auctions'], ['optJackpot', 'jackpot']])
  $(id).onchange = () => { setup[key] = key === 'cash' ? +$(id).value : $(id).value; saveSetup(); };
$('optSpeed').onchange = () => setSpeed(+$('optSpeed').value);
$('myName').value = myName;
$('myName').onchange = () => { const v = clean($('myName').value, 20); if (v){ myName = v; BDB.store.set('ty-name', v); } $('myName').value = myName; renderSetup(); };

function optsFromSetup(){
  const lim = setup.limit;
  return {cash:setup.cash, auctions:setup.auctions === '1', jackpot:setup.jackpot === '1',
    limitMin: lim[0] === 't' ? +lim.slice(1) : 0, limitRounds: lim[0] === 'r' ? +lim.slice(1) : 0};
}
function seatsFromSetup(){
  const out = [];
  setup.seats.forEach((st, i) => {
    if (st.type === 'off') return;
    const name = st.type === 'you' ? myName : (st.name || defaultName(i, st.type));
    out.push({kind: st.type.startsWith('bot') ? 'bot' : st.type, level: st.type.startsWith('bot') ? +st.type[3] : 0,
      name, token: D.tokens[setup.tok[i]].id, color: D.colors[i]});
  });
  return out;
}

/* ---------- board ---------- */
const board = $('board'), wrap = $('wrap'), panel = $('panel');
const spEls = [];
const cellOf = i => i === 0 ? [11, 11] : i < 10 ? [11, 11 - i] : i === 10 ? [11, 1] : i < 20 ? [21 - i, 1] : i === 20 ? [1, 1] : i < 30 ? [1, i - 19] : i === 30 ? [1, 11] : [i - 29, 11];
const sideOf = i => i % 10 === 0 ? 'c' : i < 10 ? 'b' : i < 20 ? 'l' : i < 30 ? 't' : 'r';
function buildBoard(){
  S.forEach((sp, i) => {
    const [r, c] = cellOf(i);
    const d = mk('div', `sp ${sideOf(i)} ${sp.k}`); d.style.gridRow = r; d.style.gridColumn = c; d.dataset.i = i;
    d.setAttribute('role', 'button'); d.setAttribute('aria-label', sp.name); d.tabIndex = -1;
    const inn = mk('div', 'in'); d.appendChild(inn);
    const e = {el:d, band:null, own:null, pr:null, key:''};
    if (sp.k === 'prop'){
      e.band = mk('div', 'band'); e.band.style.background = GR[sp.g].color;
      inn.append(e.band, mk('div', 'nm', sp.sh), (e.pr = mk('div', 'pr', '$' + sp.price)));
    } else if (i % 10 === 0){
      const ic = mk('div', 'ic'); ic.innerHTML = svg(spIcon(sp));
      inn.append(ic, mk('div', 'nm', sp.name));
      if (sp.k === 'go') inn.append(mk('div', 'sub', 'Collect $200'));
      if (sp.k === 'jail'){ inn.innerHTML = ''; const cell = mk('div', 'cell'); cell.append(ic, mk('div', 'nm', sp.name)); d.insertBefore(cell, inn); inn.append(mk('div', 'sub', 'Just visiting')); }
      if (sp.k === 'free') inn.append((e.pr = mk('div', 'sub', 'Rest stop')));
      if (sp.k === 'gojail') inn.append(mk('div', 'sub', 'Go to Benched'));
    } else {
      const ic = mk('div', 'ic'); ic.innerHTML = svg(spIcon(sp));
      inn.append(mk('div', 'nm', sp.sh), ic, (e.pr = mk('div', 'pr', sp.price ? '$' + sp.price : sp.amt ? '$' + sp.amt : '')));
    }
    if (E.isOwnable(i)){ e.own = mk('i', 'ownr'); e.own.hidden = true; inn.appendChild(e.own); }
    d.onclick = () => openSheet('deed', i);
    board.appendChild(d); spEls[i] = e;
  });
}
buildBoard();

let U = 50, C = 80, TS = 28;
function layout(){
  const r = $('stage').getBoundingClientRect(), W = r.width, H = r.height;
  const side = W >= 760 && W >= H * 1.05;
  wrap.classList.toggle('stack', !side);
  let size;
  if (side){
    const pw = Math.round(Math.max(290, Math.min(390, W * .3)));
    size = Math.floor(Math.min(H - 20, W - pw - 38));
    panel.style.width = pw + 'px'; panel.style.height = size + 'px';
  } else {
    size = Math.floor(Math.max(Math.min(W - 12, 300), Math.min(W - 12, (H - 236) / (T3 ? .8 : 1))));
  }
  // a tilted 3D board is shorter than it is wide, so on phones give the spare height to the panel
  const bh = T3 && !side ? Math.round(size * .8) : size;
  board.style.height = bh !== size ? bh + 'px' : '';
  if (!side){ panel.style.width = Math.min(W - 12, 640) + 'px'; panel.style.height = Math.max(150, H - bh - 22) + 'px'; }
  const n = state ? state.players.length : 4;
  $('players').classList.toggle('one', !side && (H - bh - 22) - 150 >= n * 58);
  U = size / 12.2; C = U * 1.6; TS = Math.max(15, Math.min(34, U * .62));
  board.style.setProperty('--u', U + 'px'); board.style.setProperty('--c', C + 'px'); board.style.setProperty('--ts', TS + 'px');
  const fx = $('fx'), dpr = Math.min(devicePixelRatio || 1, 2);
  fx.width = Math.round(W * dpr); fx.height = Math.round(H * dpr); fxc.setTransform(dpr, 0, 0, dpr, 0, 0);
  placeCentre3D();
  placeTokens();
}
const fxc = $('fx').getContext('2d');
new ResizeObserver(layout).observe($('stage'));

/* ---------- 3D board (three.js) ---------- */
// The flat board stays in the page as the fallback; the 3D one draws over it when WebGL works.
let T3 = null, t3Loading = false;
let want3D = BDB.store.get('ty-3d') !== '0';
function paint3DPill(){ const b = $('view3d'); if (b){ b.textContent = T3 ? '3D on' : '3D off'; b.setAttribute('aria-pressed', String(!!T3)); } }
async function start3D(){
  if (T3 || t3Loading) return;
  t3Loading = true; board.classList.add('b3wait');
  try {
    const {createBoard3D} = await import('./board3d.js');
    if (!want3D) return;
    T3 = await createBoard3D({host:board, S, GR, ICON, spIcon, isOwnable:E.isOwnable, reduced:BDB.reduced, onPick:i => openSheet('deed', i)});
    board.classList.add('b3');
    const s = shown || state;
    if (s){ T3.buildTokens(s.players).then(() => placeTokens()); T3.update(s); T3.setDice(s.dice); }
  } catch(e){ console.warn('3D board unavailable, using the flat one', e); T3 = null; want3D = false; }
  finally { t3Loading = false; board.classList.remove('b3wait'); paint3DPill(); layout(); }
}
function stop3D(){
  if (T3){ T3.dispose(); T3 = null; }
  board.classList.remove('b3'); $('center').style.cssText = '';
  paint3DPill(); layout(); if (shown) render();
}
function toggle3D(){
  want3D = !want3D; BDB.store.set('ty-3d', want3D ? '1' : '0');
  if (want3D) start3D(); else stop3D();
}
// keep the centre panel (BDB's mic, cards, log) floating over the court in 3D
function placeCentre3D(){
  if (!T3) return;
  T3.resize();
  const r = T3.innerRect(), c = $('center');
  c.style.left = r.l + 'px'; c.style.top = r.t + 'px'; c.style.width = Math.max(0, r.r - r.l) + 'px'; c.style.height = Math.max(0, r.b - r.t) + 'px';
}

function cellRect(i){
  const [r, c] = cellOf(i);
  const at = k => k === 1 ? 0 : k === 11 ? C + 9 * U : C + (k - 2) * U;
  const sz = k => k === 1 || k === 11 ? C : U;
  return {x:at(c), y:at(r), w:sz(c), h:sz(r)};
}
function spaceCentre(i){ if (T3) return T3.project(i); const b = cellRect(i); return {x:b.x + b.w / 2, y:b.y + b.h / 2}; }

/* ---------- tokens ---------- */
const tokEls = [];
function buildTokens(s){
  $('tokens').innerHTML = ''; tokEls.length = 0;
  s.players.forEach((p, i) => {
    const t = mk('div', 'tok'); t.style.setProperty('--pc', p.color); t.innerHTML = tokIcon(p.token);
    $('tokens').appendChild(t); tokEls[i] = t;
  });
  if (T3) T3.buildTokens(s.players).then(() => placeTokens());
}
function placeTokens(hop){
  const s = shown || state; if (!s) return;
  const groups = new Map();
  s.players.forEach((p, i) => {
    if (!tokEls[i]) return;
    tokEls[i].hidden = p.out;
    if (p.out) return;
    const key = vpos[i] + (vpos[i] === 10 && vjail[i] ? 'j' : '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });
  for (const [key, list] of groups){
    const i = parseInt(key, 10), b = cellRect(i);
    let cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (i === 10){ if (key.endsWith('j')){ cx = b.x + b.w * .67; cy = b.y + b.h * .33; } else { cx = b.x + b.w * .3; cy = b.y + b.h * .74; } }
    else if (i % 10){ // nudge away from the colour band
      const side = sideOf(i), k = U * .12;
      if (side === 'b') cy += k; else if (side === 't') cy -= k; else if (side === 'l') cx -= k; else cx += k;
    }
    const n = list.length, cols = n <= 1 ? 1 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols), g = TS * .58;
    list.forEach((pid, k) => {
      const col = k % cols, row = Math.floor(k / cols);
      const x = cx + (col - (cols - 1) / 2) * g, y = cy + (row - (rows - 1) / 2) * g;
      tokEls[pid].style.transform = `translate(${(x - TS / 2).toFixed(1)}px,${(y - TS / 2).toFixed(1)}px)`;
      if (T3) T3.setToken(pid, x / U, y / U, {on:s.phase !== 'over' && pid === s.cur, hop});
    });
  }
  if (T3) s.players.forEach((p, i) => { if (p.out) T3.setToken(i, 0, 0, {hidden:true}); });
  tokEls.forEach((t, i) => t && t.classList.toggle('on', s.phase !== 'over' && i === s.cur));
}

/* ---------- render ---------- */
function render(){
  const s = shown;
  if (!s) return;
  try {
    renderBoard(s); renderPlayers(s); renderTurn(s); renderCentre(s); placeTokens();
    $('roundN').textContent = s.round;
    if (sheet) drawSheet(false);
    drawAuction();
  } catch(e){ console.warn('render', e); }
}
function renderBoard(s){
  const hl = s.phase === 'buy' ? s.buy : s.phase === 'auction' && s.auction ? s.auction.sp : -1;
  for (let i = 0; i < 40; i++){
    const e = spEls[i];
    e.el.classList.toggle('hl', i === hl);
    if (!e.own) continue;
    const o = s.own[i];
    e.el.classList.toggle('owned', o >= 0);
    e.el.classList.toggle('mort', !!s.mort[i]);
    e.own.hidden = o < 0;
    if (o >= 0) e.own.style.setProperty('--oc', s.players[o].color);
    if (e.band){
      const key = String(s.bld[i]);
      if (e.key !== key){ e.key = key; e.band.innerHTML = s.bld[i] === 5 ? '<i class="H"></i>' : '<i></i>'.repeat(s.bld[i]); }
    }
  }
  const fr = spEls[20];
  if (fr.pr) fr.pr.textContent = s.opts.jackpot ? `Jackpot ${money(s.jackpot)}` : 'Rest stop';
  if (T3) T3.update(s);
}
const plEls = [];
const prevCash = [];
function kindLabel(pid){
  const st = seats[pid]; if (!st) return '';
  if (st.kind === 'bot') return 'BDB bot · ' + (D.levels[st.level] || D.levels[2]).name;
  if (st.kind === 'you') return role === 'local' ? 'You' : 'You · host';
  if (st.kind === 'human') return 'Pass and play';
  if (st.kind === 'remote') return st.away ? 'Away · bot covering' : (role === 'guest' && pid === mySeat ? 'You' : 'Online');
  if (st.kind === 'guest') return pid === mySeat ? 'You' : 'Online';
  if (st.kind === 'host') return 'Host';
  if (st.kind === 'local') return "On the host's device";
  if (st.kind === 'away') return 'Away · bot covering';
  return '';
}
function renderPlayers(s){
  const box = $('players');
  if (plEls.length !== s.players.length){
    box.innerHTML = ''; plEls.length = 0;
    s.players.forEach((p, i) => {
      const b = mk('button', 'pl'); b.type = 'button'; b.style.setProperty('--pc', p.color);
      const tk = mk('span', 'ptok'); tk.innerHTML = tokIcon(p.token);
      const pn = mk('span', 'pn'); pn.append(mk('b'), mk('small'));
      const pc = mk('span', 'pc');
      const ch = mk('span', 'chips');
      b.append(tk, pn, pc, ch); b.onclick = () => openSheet('player', i);
      box.appendChild(b); plEls[i] = {b, pn, pc, ch, key:''};
    });
  }
  s.players.forEach((p, i) => {
    const e = plEls[i];
    e.b.classList.toggle('on', s.phase !== 'over' && i === s.cur);
    e.b.classList.toggle('out', p.out);
    e.pn.firstChild.textContent = p.name;
    const bits = [];
    if (p.out) bits.push('Bankrupt'); else { if (p.jail) bits.push('Benched'); bits.push(kindLabel(i)); }
    e.pn.lastChild.textContent = bits.filter(Boolean).join(' · ');
    const cash = money(p.cash);
    if (e.pc.textContent !== cash){ e.pc.textContent = cash; if (prevCash[i] != null){ e.pc.classList.remove('flash'); void e.pc.offsetWidth; e.pc.classList.add('flash'); } prevCash[i] = p.cash; }
    const key = s.own.map((o, j) => o === i ? j + ':' + s.bld[j] + (s.mort[j] ? 'm' : '') : '').join(',') + '|' + p.cards.length;
    if (key !== e.key){
      e.key = key; e.ch.innerHTML = '';
      for (let j = 0; j < 40; j++) if (s.own[j] === i){
        const c = mk('i'); c.style.setProperty('--gc', S[j].k === 'prop' ? GR[S[j].g].color : S[j].k === 'transit' ? '#cfd6e6' : '#8a93a8');
        if (s.mort[j]) c.classList.add('m'); if (s.bld[j] === 5) c.classList.add('h'); else if (s.bld[j]) c.classList.add('b');
        c.title = S[j].name; e.ch.appendChild(c);
      }
      if (p.cards.length) e.ch.appendChild(mk('i', 'gj', `+${p.cards.length} card`));
    }
  });
}
function actorPid(){
  const s = state; if (!s) return -1;
  if (role === 'guest') return mySeat >= 0 && !s.players[mySeat].out ? mySeat : -1;
  if (controls(s.cur) && !s.players[s.cur].out) return s.cur;
  const you = seats.findIndex((x, i) => x.kind === 'you' && !s.players[i].out);
  if (you >= 0) return you;
  return seats.findIndex((x, i) => controls(i) && !s.players[i].out);
}
function btn(label, cls, fn, dis){ const b = mk('button', 'k-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.onclick = fn; if (dis) b.disabled = true; return b; }
function renderTurn(s){
  const tb = $('turnbar'), ac = $('actions');
  tb.innerHTML = ''; ac.innerHTML = '';
  const cur = s.players[s.cur];
  let who = s.cur, prompt = '';
  const wait = busy || Q.length > 0;
  if (s.phase === 'over'){
    const w = s.players[s.over.winner];
    who = s.over.winner; prompt = 'Wins on ' + (s.over.why === 'last' ? 'last one standing' : 'net worth');
  } else if (s.phase === 'debt'){
    const d = s.debts[0]; who = d.pid;
    prompt = `Owes ${money(d.items.reduce((t, x) => t + x.amt, 0))}. Mortgage or sell, then pay. Or go bankrupt.`;
  } else if (s.phase === 'auction'){
    const a = s.auction;
    prompt = `Auction: ${S[a.sp].name}. ${a.by >= 0 ? `High bid ${money(a.high)} by ${s.players[a.by].name}` : 'No bids yet'}`;
  } else if (s.phase === 'buy'){
    prompt = `Landed on ${S[s.buy].name}. Buy it for ${money(S[s.buy].price)} or send it to ${s.opts.auctions ? 'auction' : 'the bank'}.`;
  } else if (s.phase === 'roll'){
    prompt = cur.jail ? `Benched. Roll doubles, pay ${money(E.JAIL_FEE)}${cur.cards.length ? ' or use your card' : ''}.` : s.dbl ? 'Doubles. Roll again.' : 'Roll the dice.';
  } else if (s.phase === 'end') prompt = 'Build, trade or mortgage. Then end the turn.';
  const wp = s.players[who];
  const tk = mk('span', 'mtok'); tk.style.setProperty('--pc', wp.color); tk.innerHTML = tokIcon(wp.token);
  const tt = mk('div', 'tt');
  const mine = controls(who) && s.phase !== 'over';
  tt.append(mk('b', null, s.phase === 'over' ? `${wp.name} wins` : (mine && seats.filter((x, i) => controls(i)).length > 1 ? `${wp.name}, you're up` : mine ? 'Your turn' : `${wp.name}'s turn`)),
    mk('small', null, !mine && isBotSeat(who) && s.phase !== 'over' ? (paused ? 'Bots paused. Press P to resume.' : 'BDB bot is thinking…') : prompt));
  const tm = mk('div', 'tm');
  const lim = s.opts.limitMin ? Math.max(0, s.opts.limitMin * 60000 - elapsed()) : null;
  tm.innerHTML = '';
  if (lim != null){ tm.append(mk('b', null, BDB.fmtTime(lim)), document.createElement('br'), document.createTextNode('left')); tm.id = 'tleft'; }
  else if (s.opts.limitRounds){ tm.append(mk('b', null, `${s.round}/${s.opts.limitRounds}`), document.createElement('br'), document.createTextNode('rounds')); }
  else { tm.append(mk('b', null, String(s.round)), document.createElement('br'), document.createTextNode('round')); }
  tb.append(tk, tt, tm);

  if (s.phase === 'over'){
    ac.append(btn('Results', 'primary', showOver), btn('New game', '', backToSetup));
    return;
  }
  const me = actorPid();
  if (s.phase === 'roll' && controls(s.cur)){
    ac.append(btn('Roll dice', 'primary', () => act(s.cur, {t:'roll'}), wait));
    if (cur.jail){
      ac.append(btn(`Pay ${money(E.JAIL_FEE)}`, '', () => act(s.cur, {t:'jailPay'}), wait || cur.cash < E.JAIL_FEE));
      if (cur.cards.length) ac.append(btn('Use card', '', () => act(s.cur, {t:'jailCard'}), wait));
    }
  } else if (s.phase === 'buy' && controls(s.cur)){
    const pr = S[s.buy].price;
    ac.append(btn(`Buy ${money(pr)}`, 'primary', () => act(s.cur, {t:'buy'}), wait || cur.cash < pr),
      btn(s.opts.auctions ? 'Auction it' : 'Pass', '', () => act(s.cur, {t:'decline'}), wait));
  } else if (s.phase === 'end' && controls(s.cur)){
    ac.append(btn('End turn', 'primary', () => act(s.cur, {t:'end'}), wait));
  } else if (s.phase === 'debt' && controls(s.debts[0].pid)){
    const d = s.debts[0], tot = d.items.reduce((t, x) => t + x.amt, 0), p = s.players[d.pid];
    ac.append(btn(`Pay ${money(tot)}`, 'primary', () => act(d.pid, {t:'pay'}), wait || p.cash < tot),
      btn('Go bankrupt', '', () => confirmSheet(`Go bankrupt, ${p.name}?`, E.liquid(s, d.pid) >= tot ? `You could still raise ${money(E.liquid(s, d.pid))} by selling and mortgaging. Bankrupt anyway?` : "You can't raise enough. BDB will hold your lanyard.", 'Go bankrupt', () => act(d.pid, {t:'bankrupt'})), wait));
  } else if (s.phase === 'auction' && s.auction.active.some(controls)){
    ac.append(btn('Open auction', 'primary', () => { aucHidden = false; drawAuction(); }));
  }
  if (me >= 0){
    if (s.trade && s.trade.from === me) ac.append(btn('Cancel offer', 'sm', () => act(me, {t:'cancel'})));
    else if (s.trade && controls(s.trade.to)) ac.append(btn('See offer', 'sm', () => openSheet('offer')));
    else ac.append(btn('Trade', 'sm', () => openTrade(me), s.phase === 'auction'));
    ac.append(btn(controls(s.cur) && s.cur !== me ? 'Properties' : 'My properties', 'sm', () => openSheet('player', me)));
  }
}
function renderCentre(s){
  setDice(s.dice);
  renderCard(s);
  const info = $('cinfo'); info.innerHTML = '';
  if (s.opts.jackpot){ info.append(document.createTextNode('Jackpot '), mk('b', null, money(s.jackpot)), document.createElement('br')); }
  info.append(document.createTextNode(`Bank: ${s.bank.h} houses · ${s.bank.H} hotels`));
  syncLog(s);
}
function renderCard(s){
  s = s || shown; const box = $('cardslot');
  let key = '', node = null;
  if (s && s.phase === 'buy'){
    const sp = S[s.buy]; key = 'sale' + s.buy;
    if (box.dataset.key !== key){
      node = mk('div', 'gcard sale'); node.style.setProperty('--gb', sp.k === 'prop' ? GR[sp.g].color : '#cfd6e6');
      node.append(mk('small', null, 'For sale'), mk('p', null, sp.name), mk('div', 'gp', money(sp.price)));
    }
  } else if (slot && slot.k === 'card'){
    key = 'card' + slot.deck + slot.id + ':' + slot.n;
    if (box.dataset.key !== key){
      const c = D.cards[slot.deck][slot.id];
      node = mk('div', 'gcard ' + slot.deck); node.append(mk('small', null, D.deckName[slot.deck]), mk('p', null, c.x));
    }
  }
  if (box.dataset.key === key) return;
  box.dataset.key = key; box.innerHTML = '';
  if (node) box.appendChild(node);
}
let feedLen = 0;
function addFeed(text, cls, color, batch){
  const li = mk('li', cls || null);
  if (Array.isArray(text)){ li.append(mk('b', null, text[0] + ': '), document.createTextNode(text[1])); }
  else li.textContent = text;
  if (color) li.style.setProperty('--pc', color);
  const log = $('log');
  const stick = batch || log.scrollTop + log.clientHeight >= log.scrollHeight - 40;
  log.appendChild(li);
  while (log.children.length > 140) log.firstChild.remove();
  if (stick) log.scrollTop = log.scrollHeight;
}
function syncLog(s){
  const log = $('log'), stick = !log.clientHeight || log.scrollTop + log.clientHeight >= log.scrollHeight - 40;
  for (const l of s.log){ if (l.n > lastLogN){ addFeed(l.x, null, null, stick); lastLogN = l.n; } }
}

/* ---------- dice ---------- */
const PIPS = {1:[4], 2:[0, 8], 3:[0, 4, 8], 4:[0, 2, 6, 8], 5:[0, 2, 4, 6, 8], 6:[0, 2, 3, 5, 6, 8]};
for (const d of [$('d0'), $('d1')]) for (let k = 0; k < 9; k++) d.appendChild(mk('i'));
function face(el, n){ [...el.children].forEach((p, k) => p.classList.toggle('on', !!n && PIPS[n].includes(k))); }
function setDice(d){ face($('d0'), d[0]); face($('d1'), d[1]); if (T3) T3.setDice(d); }
async function rollDice(d, m){
  if (!m){ setDice(d); return; }
  if (T3){
    let done = false; const p = T3.roll(d, m).then(() => { done = true; });
    for (let k = 0; !done && k < 40; k++){ if (k % 2 === 0) BDB.sfx.tick(); await wait(70); }
    await p; face($('d0'), d[0]); face($('d1'), d[1]); return;
  }
  const a = $('d0'), b = $('d1');
  a.classList.remove('roll'); b.classList.remove('roll'); void a.offsetWidth; a.classList.add('roll'); b.classList.add('roll');
  const end = performance.now() + 480 * m;
  while (performance.now() < end){ face(a, 1 + (Math.random() * 6 | 0)); face(b, 1 + (Math.random() * 6 | 0)); BDB.sfx.tick(); await wait(60); }
  setDice(d);
}

/* ---------- fx: particles + floating money ---------- */
const parts = []; let fxRaf = 0;
function boardToStage(x, y){ const br = board.getBoundingClientRect(), sr = $('stage').getBoundingClientRect(); return {x: x + br.left - sr.left, y: y + br.top - sr.top}; }
function burst(i, color, n = 22){
  if (BDB.reduced) return;
  const c = spaceCentre(i), p = boardToStage(c.x, c.y);
  for (let k = 0; k < n; k++){ const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 160; parts.push({x:p.x, y:p.y, vx:Math.cos(a) * v, vy:Math.sin(a) * v - 60, life:.9 + Math.random() * .4, c:color, r:2 + Math.random() * 3}); }
  runFx();
}
function floatText(i, text, color){
  const c = spaceCentre(i), p = boardToStage(c.x, c.y);
  parts.push({x:p.x, y:p.y - 6, vx:0, vy:-38, life:1.5, c:color, text});
  runFx();
}
function runFx(){ if (!fxRaf){ let last = performance.now(); const tick = now => { const dt = Math.min(.05, (now - last) / 1000); last = now; drawFx(dt); fxRaf = parts.length ? requestAnimationFrame(tick) : 0; }; fxRaf = requestAnimationFrame(tick); } }
function drawFx(dt){
  const r = $('stage').getBoundingClientRect();
  fxc.clearRect(0, 0, r.width, r.height);
  for (let k = parts.length - 1; k >= 0; k--){
    const p = parts[k]; p.life -= dt;
    if (p.life <= 0){ parts.splice(k, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    fxc.globalAlpha = Math.min(1, p.life * 1.6);
    if (p.text){
      fxc.font = `600 ${Math.max(20, U * .55)}px Teko, "Arial Narrow", sans-serif`; fxc.textAlign = 'center';
      fxc.lineWidth = 4; fxc.strokeStyle = 'rgba(5,12,28,.9)'; fxc.strokeText(p.text, p.x, p.y); fxc.fillStyle = p.c; fxc.fillText(p.text, p.x, p.y);
    } else { p.vy += 420 * dt; fxc.fillStyle = p.c; fxc.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r * 1.6); }
  }
  fxc.globalAlpha = 1;
}
function shake(){ if (BDB.reduced) return; board.classList.remove('shake'); void board.offsetWidth; board.classList.add('shake'); }

/* ---------- animation queue ---------- */
function enqueue(s, ev){ Q.push({s, ev}); if (!busy) pump(); }
async function pump(){
  busy = true; renderTurnSafe();
  while (Q.length){
    const {s, ev} = Q.shift();
    try { await playEvents(s, ev); } catch(e){ console.warn('anim', e); }
    shown = s;
    s.players.forEach((p, i) => { vpos[i] = p.pos; vjail[i] = !!p.jail; });
    render();
    try { react(ev, s); } catch(e){ console.warn('react', e); }
  }
  busy = false;
  render();
  checkPrompts();
  if (shown && shown.phase === 'over') setTimeout(showOver, 900);
}
function renderTurnSafe(){ try { if (shown) renderTurn(shown); } catch(e){} }
async function playEvents(s, ev){
  const m = (Q.length > 2 || document.hidden) ? 0 : SPEEDS[speed].anim;
  const step = SPEEDS[speed].step;
  for (const e of ev){
    switch (e.t){
      case 'roll': await rollDice(e.d, m); if (m) await wait(120 * m); break;
      case 'move': {
        const dir = Math.sign(e.n) || 1, n = Math.abs(e.n);
        vjail[e.pid] = false;
        if (!m || n === 0){ vpos[e.pid] = e.to; placeTokens(); break; }
        for (let k = 1; k <= n; k++){
          vpos[e.pid] = ((e.from + dir * k) % 40 + 40) % 40;
          placeTokens(step * .95);
          const t = tokEls[e.pid]; if (t){ t.classList.remove('hop'); void t.offsetWidth; t.classList.add('hop'); }
          if (k % 2) BDB.sfx.tick();
          await wait(step);
        }
        await wait(90 * m);
        break;
      }
      case 'jail': vpos[e.pid] = 10; vjail[e.pid] = true; placeTokens(Math.max(260, 600 * m)); BDB.sfx.bad(); if (m) await wait(420 * m); break;
      case 'unjail': vjail[e.pid] = false; placeTokens(); break;
      case 'card': slot = {k:'card', deck:e.deck, id:e.id, n:Math.random()}; renderCard(s); BDB.sfx.pop(); if (m) await wait(1500 * m); break;
      case 'turn': slot = null; break;
      case 'go': floatText(0, '+$' + e.amt, '#f2c14e'); break;
      case 'buy': case 'won': burst(e.sp, s.players[e.pid].color); BDB.sfx.good(); break;
      case 'rent': floatText(e.sp, '-' + money(e.amt), '#ff7a6b'); if (e.amt >= 400) shake(); BDB.sfx.bad(); break;
      case 'tax': floatText(e.sp, '-' + money(e.amt), '#ff7a6b'); break;
      case 'jackpot': floatText(20, '+' + money(e.amt), '#4ade80'); burst(20, '#f2c14e', 40); BDB.sfx.big(); break;
      case 'build': burst(e.sp, e.n === 5 ? '#ff5a4a' : '#2fbf5b', 12); BDB.sfx.pop(); break;
      case 'set': BDB.sfx.big(); for (const i of GR[e.g].sp) burst(i, GR[e.g].color, 14); if (m) await wait(300 * m); break;
      case 'bankrupt': shake(); BDB.sfx.bad(); break;
      case 'trade': BDB.sfx.good(); break;
    }
  }
}

/* ---------- BDB on the mic ---------- */
let lastSay = 0, turnsQuiet = 0;
const lastPick = {};
function say(key, vars, tag){
  const arr = D.lines[key]; if (!arr) return;
  let k; do { k = Math.floor(Math.random() * arr.length); } while (arr.length > 1 && k === lastPick[key]);
  lastPick[key] = k;
  const text = arr[k].replace(/\{(\w+)\}/g, (_, v) => vars[v] != null ? vars[v] : '');
  BDB.say(text, tag || 'BDB on the mic'); lastSay = performance.now(); turnsQuiet = 0;
}
function react(ev, s){
  let best = null;
  const P = i => (s.players[i] || {}).name || '';
  const cand = (pri, key, vars, opt = {}) => { if (opt.chance != null && Math.random() > opt.chance) return; if (!best || pri > best.pri) best = {pri, key, vars, ...opt}; };
  for (const e of ev){
    const v = {p:P(e.pid), o:e.to != null && e.to >= 0 ? P(e.to) : 'the bank', sp: e.sp != null ? S[e.sp].name : '', amt: e.amt != null ? Math.round(e.amt).toLocaleString('en-CA') : '', g: e.g != null ? GR[e.g].name : ''};
    switch (e.t){
      case 'over': cand(100, 'win', {p:P(e.pid)}, {crit:true}); break;
      case 'timeup': cand(95, 'timeup', v, {crit:true, shout:'FINAL TURN'}); break;
      case 'bankrupt': cand(90, 'bankrupt', v, {crit:true, shout:'BANKRUPT', bad:true}); break;
      case 'set': cand(85, 'set', v, {crit:true, shout:'FULL SET'}); break;
      case 'jail': cand(e.why === 'speeding' ? 80 : 70, e.why === 'speeding' ? 'speeding' : 'jail', v, {crit:true, shout:'BENCHED', bad:true}); break;
      case 'trade': cand(75, 'trade', v, {crit:true}); break;
      case 'rent': if (e.amt >= 300) cand(72, 'rentBig', v, {crit:true}); else cand(38, 'rent', v, {chance:.55}); break;
      case 'jackpot': cand(68, 'jackpot', v, {crit:true, shout:'JACKPOT'}); break;
      case 'auction': cand(60, 'auction', v, {crit:true}); break;
      case 'won': cand(58, 'won', v); break;
      case 'nobid': cand(50, 'nobid', v); break;
      case 'build': if (e.n === 5) cand(55, 'hotel', v, {shout:'HOTEL'}); else cand(28, 'build', v, {chance:.45}); break;
      case 'buy': if (e.amt >= 300) cand(52, 'buyBig', v); else cand(45, 'buy', v, {chance:.75}); break;
      case 'reject': cand(44, 'reject', {o:P(e.to)}); break;
      case 'unjail': if (e.how !== 'forced') cand(40, 'jailOut', v, {chance:.7}); break;
      case 'roll': if (!e.util && e.d[0] === e.d[1]) cand(36, 'doubles', v, {chance:.55, shout:'DOUBLES'}); break;
      case 'mortgage': cand(34, 'mortgage', v, {chance:.5}); break;
      case 'card': cand(30, 'card', v, {chance:.3}); break;
      case 'tax': cand(30, 'tax', v, {chance:.6}); break;
      case 'go': cand(25, 'go', v, {chance:.3}); break;
      case 'rest': cand(20, 'rest', v, {chance:.6}); break;
      case 'turn': turnsQuiet++; break;
    }
  }
  const now = performance.now();
  if (best && best.shout) BDB.shout(best.shout, best.bad);
  if (best && (best.crit || now - lastSay > 4500)) say(best.key, best.vars);
  else if (!best && turnsQuiet >= 8 && now - lastSay > 6000){ BDB.roast(); lastSay = now; turnsQuiet = 0; }
}

/* ---------- acting ---------- */
function controls(pid){
  const st = seats[pid]; if (!st || !state) return false;
  if (role === 'guest') return pid === mySeat;
  return st.kind === 'you' || st.kind === 'human';
}
function isBotSeat(pid){
  const st = seats[pid]; if (!st) return false;
  return st.kind === 'bot' || ((st.kind === 'remote' || st.kind === 'away') && !!st.away) || st.kind === 'away';
}
const isBot = pid => role !== 'guest' && isBotSeat(pid);
const MGMT = new Set(['build', 'sell', 'mortgage', 'unmortgage', 'propose', 'accept', 'reject', 'cancel', 'bid', 'pass']);
function act(pid, a){
  if (!state || pid < 0 || !controls(pid) || mode !== 'play') return;
  if ((busy || Q.length) && !MGMT.has(a.t)) return;
  if (role === 'guest'){ if (room && hostPeer) room.send('act', {a}, hostPeer); return; }
  commit(pid, a);
}
function commit(pid, a, peer){
  const r = E.step(state, pid, a);
  if (r.err){
    if (peer){ room && room.send('err', {msg:r.err}, peer); }
    else if (pid >= 0 && !isBot(pid)) toast(r.err, true);
    return false;
  }
  state = r.state;
  if (role === 'host') broadcastState(r.ev);
  if (role === 'local') saveGame();
  enqueue(state, r.ev);
  return true;
}
function checkPrompts(){
  const s = state; if (!s || mode !== 'play') return;
  if (s.trade && s.trade.id !== lastTradeSeen && controls(s.trade.to)){ lastTradeSeen = s.trade.id; openSheet('offer'); }
  if (sheet && sheet.kind === 'offer' && (!s.trade || !controls(s.trade.to))) closeSheet();
}

/* ---------- sheets ---------- */
let sheet = null;               // {kind, arg}
let tr = null;                  // trade being written
function openSheet(kind, arg){ if (mode === 'menu' && kind !== 'room') return; sheet = {kind, arg}; drawSheet(true); $('sheetWrap').hidden = false; }
function closeSheet(){ sheet = null; $('sheetWrap').hidden = true; $('sheet').innerHTML = ''; }
$('sheetWrap').addEventListener('pointerdown', e => { $('sheetWrap')._down = e.target === $('sheetWrap'); });
$('sheetWrap').addEventListener('click', e => { if ($('sheetWrap')._down && e.target === $('sheetWrap') && !(sheet && sheet.kind === 'room')) closeSheet(); });
function head(title, sub){
  const hd = mk('div', 'sh-head'); const t = mk('div'); t.style.flex = '1'; t.style.minWidth = '0';
  const h3 = mk('h3', null, title); t.appendChild(h3); if (sub) t.appendChild(mk('div', 'sub', sub));
  const x = mk('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.onclick = () => { if (sheet && sheet.kind === 'room') leaveTable(); else closeSheet(); };
  hd.append(t, x); return hd;
}
function drawSheet(force){
  if (!sheet) return;
  if (!force && (sheet.kind === 'trade' || sheet.kind === 'menu' || sheet.kind === 'confirm')) return;
  const box = $('sheet');
  const scroll = box.querySelector('.sh-body') ? box.querySelector('.sh-body').scrollTop : 0;
  box.innerHTML = '';
  const fn = {deed:sheetDeed, player:sheetPlayer, trade:sheetTrade, offer:sheetOffer, menu:sheetMenu, room:sheetRoom, confirm:sheetConfirm}[sheet.kind];
  if (!fn || fn(box) === false){ closeSheet(); return; }
  const b = box.querySelector('.sh-body'); if (b && !force) b.scrollTop = scroll;
}
const gcol = i => S[i].k === 'prop' ? GR[S[i].g].color : S[i].k === 'transit' ? '#cfd6e6' : S[i].k === 'util' ? '#aab3c6' : '#efe3cc';
function deedCard(s, i){
  const sp = S[i], d = mk('div', 'deed');
  const db = mk('div', 'db'); db.style.setProperty('--gc', gcol(i));
  db.append(mk('small', null, sp.k === 'prop' ? GR[sp.g].name : sp.k === 'transit' ? 'Transit' : sp.k === 'util' ? 'Utility' : 'Space'), mk('b', null, sp.name));
  d.appendChild(db);
  const tb = mk('table'), row = (a, b, now) => { const r = mk('tr', now ? 'now' : null); r.append(mk('td', null, a), mk('td', null, b)); tb.appendChild(r); };
  const o = s ? s.own[i] : -1;
  if (sp.k === 'prop'){
    const set = o >= 0 && E.ownsGroup(s, o, sp.g), b = o >= 0 ? s.bld[i] : -1;
    row('Rent', money(sp.rent[0]), b === 0 && !set);
    row('With the full set', money(sp.rent[0] * 2), b === 0 && set);
    for (let k = 1; k <= 4; k++) row(`With ${k} house${k > 1 ? 's' : ''}`, money(sp.rent[k]), b === k);
    row('With a hotel', money(sp.rent[5]), b === 5);
    d.appendChild(tb);
    const f = mk('div', 'df'); f.innerHTML = '';
    f.append(mk('b', null, `Houses ${money(GR[sp.g].hc)} each`), document.createTextNode(`. A hotel is 4 houses plus ${money(GR[sp.g].hc)}. Buildings sell back for half. `),
      mk('b', null, `Mortgage ${money(E.mortVal(i))}`), document.createTextNode(`, unmortgage ${money(E.unmortCost(i))}.`));
    d.appendChild(f);
  } else if (sp.k === 'transit'){
    const n = o >= 0 ? E.countKind(s, o, 'transit') : 0;
    [1, 2, 3, 4].forEach(k => row(`${k} transit owned`, money(25 * (1 << (k - 1))), n === k));
    d.appendChild(tb);
    const f = mk('div', 'df'); f.append(mk('b', null, `Price ${money(sp.price)}`), document.createTextNode(`. Mortgage ${money(E.mortVal(i))}, unmortgage ${money(E.unmortCost(i))}.`)); d.appendChild(f);
  } else if (sp.k === 'util'){
    const n = o >= 0 ? E.countKind(s, o, 'util') : 0;
    row('One machine owned', '4 × dice', n === 1); row('Both machines owned', '10 × dice', n === 2);
    d.appendChild(tb);
    const f = mk('div', 'df'); f.append(mk('b', null, `Price ${money(sp.price)}`), document.createTextNode(`. Mortgage ${money(E.mortVal(i))}, unmortgage ${money(E.unmortCost(i))}.`)); d.appendChild(f);
  } else {
    const txt = {go:'Collect $200 every time you pass or land here. BDB says this is the only lap he finishes.',
      jail:'Just visiting, or Benched. Get out by rolling doubles (3 tries), paying $50, or using a get-off-the-bench card. On the third miss you pay $50 and move.',
      free: s && s.opts.jackpot ? `Land here to take the Break Room jackpot. Right now: ${money(s.jackpot)}.` : 'Free rest stop. Nothing happens. BDB naps here.',
      gojail:'Go straight to Benched. Do not pass Clock In, do not collect $200.',
      tax:`Pay ${money(sp.amt || 0)}${s && s.opts.jackpot ? ' into the Break Room jackpot' : ''}.`,
      card:`Draw a ${D.deckName[sp.deck]} card and do what it says.`}[sp.k];
    const f = mk('div', 'df', txt); d.appendChild(f);
  }
  return d;
}
function sheetDeed(box){
  const s = shown || state, i = sheet.arg, sp = S[i];
  box.appendChild(head(sp.name, sp.k === 'prop' ? GR[sp.g].name + ' set' : null));
  const body = mk('div', 'sh-body'); box.appendChild(body);
  body.appendChild(deedCard(s, i));
  if (!s || !E.isOwnable(i)) return;
  const o = s.own[i];
  const ow = mk('div', 'owner');
  if (o >= 0){ const dot = mk('i'); dot.style.setProperty('--pc', s.players[o].color); ow.append(dot, document.createTextNode(`Owned by ${s.players[o].name}${s.mort[i] ? ' · mortgaged' : ''}${s.bld[i] ? ` · ${s.bld[i] === 5 ? 'hotel' : s.bld[i] + ' house' + (s.bld[i] > 1 ? 's' : '')}` : ''}`)); }
  else ow.textContent = 'Owned by the bank. Land on it to buy it.';
  body.appendChild(ow);
  if (o >= 0 && controls(o) && s.phase !== 'over'){
    const note = mk('p', 'note'); body.appendChild(note);
    const foot = mk('div', 'sh-foot'); box.appendChild(foot);
    const mkb = (label, a, err) => { const b = btn(label, '', () => act(o, {t:a, sp:i}), !!err); if (err) b.title = err; return b; };
    if (sp.k === 'prop'){
      const eb = E.canBuild(s, o, i), es = E.canSell(s, o, i);
      foot.append(mkb(s.bld[i] === 4 ? `Build hotel ${money(GR[sp.g].hc)}` : `Build house ${money(GR[sp.g].hc)}`, 'build', eb), mkb(`Sell ${money(GR[sp.g].hc / 2)}`, 'sell', es));
      if (eb && eb !== 'Already has a hotel') note.textContent = eb === 'You need the full set first' ? 'Own the whole set to build here.' : eb + '.';
    }
    if (s.mort[i]){ const e = E.canUnmortgage(s, o, i); foot.append(mkb(`Unmortgage ${money(E.unmortCost(i))}`, 'unmortgage', e)); }
    else { const e = E.canMortgage(s, o, i); foot.append(mkb(`Mortgage +${money(E.mortVal(i))}`, 'mortgage', e)); if (e && !note.textContent) note.textContent = e + '.'; }
    if (!note.textContent) note.remove();
  }
}
function sheetPlayer(box){
  const s = shown || state, pid = sheet.arg, p = s.players[pid];
  if (!p) return false;
  box.appendChild(head(p.name, p.out ? 'Bankrupt' : kindLabel(pid)));
  const body = mk('div', 'sh-body'); box.appendChild(body);
  const st = mk('div', 'statrow'); const j = mk('div', 'k-jumbo');
  for (const [a, b] of [['Cash', money(p.cash)], ['Net worth', money(E.worth(s, pid))], ['Cards', String(p.cards.length)]]){ const c = mk('div', 'cell'); c.append(mk('small', null, a), mk('b', null, b)); j.appendChild(c); }
  st.appendChild(j); body.appendChild(st);
  const port = mk('div', 'port');
  for (let i = 0; i < 40; i++) if (s.own[i] === pid){
    const m = mk('button', 'mini' + (s.mort[i] ? ' m' : '')); m.type = 'button'; m.style.setProperty('--gc', gcol(i));
    m.append(mk('i', 'mb'), mk('b', null, S[i].name), mk('small', null, s.mort[i] ? 'Mortgaged' : s.bld[i] === 5 ? 'Hotel' : s.bld[i] ? `${s.bld[i]} house${s.bld[i] > 1 ? 's' : ''}` : `Rent ${money(E.rentFor(s, i, {dice:7}))}${S[i].k === 'util' ? ' at 7' : ''}`));
    m.onclick = () => openSheet('deed', i);
    port.appendChild(m);
  }
  if (!port.children.length) body.appendChild(mk('p', 'note', p.out ? 'Out of the game.' : 'No property yet. BDB can relate.'));
  else body.appendChild(port);
  if (controls(pid) && port.children.length) body.appendChild(mk('p', 'note', 'Tap a property to build, sell or mortgage.'));
  const me = actorPid();
  if (s.phase !== 'over' && me >= 0 && me !== pid && !p.out && !s.trade && s.phase !== 'auction'){
    const foot = mk('div', 'sh-foot'); foot.appendChild(btn(`Trade with ${p.name}`, 'primary', () => openTrade(me, pid))); box.appendChild(foot);
  }
}
function confirmSheet(title, text, yes, fn){ sheet = {kind:'confirm', arg:{title, text, yes, fn}}; drawSheet(true); $('sheetWrap').hidden = false; }
function sheetConfirm(box){
  const a = sheet.arg;
  box.appendChild(head(a.title));
  const body = mk('div', 'sh-body'); body.appendChild(mk('p', 'note', a.text)); box.appendChild(body);
  const foot = mk('div', 'sh-foot'); foot.append(btn(a.yes, 'primary', () => { closeSheet(); a.fn(); }), btn('Never mind', '', closeSheet)); box.appendChild(foot);
}

/* trade editor */
function openTrade(from, to, pre){
  const s = state; if (!s || s.phase === 'over') return;
  const others = s.players.map((p, i) => i).filter(i => i !== from && !s.players[i].out);
  if (!others.length) return;
  tr = pre || {from, to: to != null ? to : others[0], give:{cash:0, props:new Set(), cards:0}, get:{cash:0, props:new Set(), cards:0}};
  openSheet('trade');
}
const sideOut = x => ({cash: Math.max(0, Math.floor(+x.cash || 0)), props:[...x.props].sort((a, b) => a - b), cards:x.cards});
function sheetTrade(box){
  const s = state, A = s.players[tr.from], B = s.players[tr.to];
  if (!A || !B || A.out) return false;
  const multi = seats.filter((x, i) => controls(i)).length > 1;
  box.appendChild(head(multi ? `${A.name}'s trade` : 'Make a trade', 'Pick what moves each way, then send it.'));
  const body = mk('div', 'sh-body'); box.appendChild(body);
  const who = mk('div', 'who');
  s.players.forEach((p, i) => {
    if (i === tr.from || p.out) return;
    const b = mk('button'); b.type = 'button'; b.setAttribute('aria-pressed', i === tr.to);
    const tk = mk('span', 'ptok'); tk.style.setProperty('--pc', p.color); tk.innerHTML = tokIcon(p.token);
    b.append(tk, document.createTextNode(p.name));
    b.onclick = () => { if (i !== tr.to){ tr.to = i; tr.get = {cash:0, props:new Set(), cards:0}; drawSheet(true); } };
    who.appendChild(b);
  });
  body.appendChild(who);
  const cols = mk('div', 'tcols');
  const col = (title, owner, side) => {
    const c = mk('div', 'tcol'); c.appendChild(mk('h5', null, title));
    const chips = mk('div', 'tchips');
    for (let i = 0; i < 40; i++) if (s.own[i] === owner){
      const b = mk('button', 'tchip' + (s.mort[i] ? ' m' : ''), S[i].sh); b.type = 'button'; b.style.setProperty('--gc', gcol(i)); b.title = S[i].name;
      const built = S[i].k === 'prop' && E.groupBuilt(s, S[i].g);
      b.disabled = built; if (built) b.title = 'Sell the buildings in this set first';
      b.setAttribute('aria-pressed', side.props.has(i));
      b.onclick = () => { if (side.props.has(i)) side.props.delete(i); else side.props.add(i); b.setAttribute('aria-pressed', side.props.has(i)); validate(); };
      chips.appendChild(b);
    }
    if (!chips.children.length) chips.appendChild(mk('span', 'note', 'No property'));
    c.appendChild(chips);
    const cr = mk('div', 'cashrow');
    const minus = mk('button', null, '−'), plus = mk('button', null, '+'), inp = mk('input');
    minus.type = plus.type = 'button'; inp.inputMode = 'numeric'; inp.value = side.cash ? String(side.cash) : ''; inp.placeholder = '$0'; inp.setAttribute('aria-label', title + ' cash');
    const max = s.players[owner].cash;
    const setC = v => { side.cash = Math.max(0, Math.min(max, Math.round(v) || 0)); inp.value = side.cash ? String(side.cash) : ''; validate(); };
    minus.onclick = () => setC(side.cash - 50); plus.onclick = () => setC(side.cash + 50);
    inp.oninput = () => { side.cash = Math.max(0, Math.min(max, parseInt(inp.value.replace(/\D/g, ''), 10) || 0)); validate(); };
    inp.onchange = () => setC(side.cash);
    cr.append(minus, inp, plus); c.appendChild(cr);
    c.appendChild(mk('span', 'note', `Has ${money(max)}`));
    if (s.players[owner].cards.length){
      const cb = mk('button', 'tchip', `Get-off-the-bench card`); cb.type = 'button'; cb.style.setProperty('--gc', '#f2c14e');
      cb.setAttribute('aria-pressed', side.cards > 0);
      cb.onclick = () => { side.cards = side.cards ? 0 : 1; cb.setAttribute('aria-pressed', side.cards > 0); validate(); };
      c.appendChild(cb);
    }
    return c;
  };
  cols.append(col(multi ? `${A.name} gives` : 'You give', tr.from, tr.give), col(`${B.name} gives`, tr.to, tr.get));
  body.appendChild(cols);
  const note = mk('p', 'note'); body.appendChild(note);
  const foot = mk('div', 'sh-foot');
  const send = btn('Send offer', 'primary', () => {
    const a = {t:'propose', to:tr.to, give:sideOut(tr.give), get:sideOut(tr.get)};
    act(tr.from, a); closeSheet();
  });
  foot.append(send, btn('Cancel', '', closeSheet)); box.appendChild(foot);
  function validate(){
    const e = state.phase === 'auction' ? 'Wait for the auction to finish' : (state.trade && state.trade.from !== tr.from && !(state.trade.to === tr.from && state.trade.from === tr.to)) ? 'Another trade is already on the table' :
      E.validTrade(state, tr.from, tr.to, E.cleanSide(sideOut(tr.give)), E.cleanSide(sideOut(tr.get)));
    note.textContent = e ? e + '.' : (isBotSeat(tr.to) ? 'BDB bots answer right away. Make it worth their while.' : `${B.name} gets to accept, counter or decline.`);
    note.className = 'note' + (e ? ' bad' : '');
    send.disabled = !!e;
  }
  validate();
}
function sheetOffer(box){
  const s = state, t = s && s.trade;
  if (!t || !controls(t.to)) return false;
  const A = s.players[t.from], B = s.players[t.to];
  const multi = seats.filter((x, i) => controls(i)).length > 1;
  box.appendChild(head(`${t.counter ? 'Counter' : 'Offer'} from ${A.name}`, multi ? `For ${B.name}` : null));
  const body = mk('div', 'sh-body'); box.appendChild(body);
  const list = (title, side) => {
    const w = mk('div', 'tcol'); w.appendChild(mk('h5', null, title));
    const ul = mk('ul', 'tlist');
    for (const i of side.props){ const li = mk('li', null, S[i].name + (s.mort[i] ? ' (mortgaged, 10% interest due)' : '')); li.style.setProperty('--gc', gcol(i)); ul.appendChild(li); }
    if (side.cash) ul.appendChild(mk('li', null, money(side.cash)));
    if (side.cards) ul.appendChild(mk('li', null, 'Get-off-the-bench card'));
    if (!ul.children.length) ul.appendChild(mk('li', null, 'Nothing'));
    w.appendChild(ul); return w;
  };
  const cols = mk('div', 'tcols'); cols.append(list(multi ? `${B.name} gets` : 'You get', t.give), list(multi ? `${B.name} gives` : 'You give', t.get)); body.appendChild(cols);
  const e = E.validTrade(s, t.from, t.to, t.give, t.get);
  if (e) body.appendChild(mk('p', 'note bad', e + '.'));
  const foot = mk('div', 'sh-foot');
  foot.append(btn('Accept', 'primary', () => { act(t.to, {t:'accept', id:t.id}); closeSheet(); }, !!e),
    btn('Counter', '', () => { openTrade(t.to, t.from, {from:t.to, to:t.from, give:{cash:t.get.cash, props:new Set(t.get.props), cards:t.get.cards}, get:{cash:t.give.cash, props:new Set(t.give.props), cards:t.give.cards}}); }),
    btn('Decline', '', () => { act(t.to, {t:'reject'}); closeSheet(); }));
  box.appendChild(foot);
}
function sheetMenu(box){
  box.appendChild(head('Menu'));
  const body = mk('div', 'sh-body'); box.appendChild(body);
  const sp = mk('div', 'k-seg');
  SPEEDS.forEach((x, i) => { const b = mk('button', null, x.n); b.type = 'button'; b.setAttribute('aria-pressed', i === speed); b.onclick = () => { setSpeed(i); drawSheet(true); }; sp.appendChild(b); });
  const l1 = mk('div', 'k-label', 'Bot and animation speed'); body.append(l1, sp);
  const rules = mk('ul', 'k-how');
  const o = state ? state.opts : optsFromSetup();
  for (const t of [`Start with ${money(o.cash)}. Pass Clock In for $200.`, `Auctions ${o.auctions ? 'on' : 'off'}. Break Room jackpot ${o.jackpot ? 'on' : 'off'}.`,
    o.limitMin ? `${o.limitMin} minute game, highest net worth wins.` : o.limitRounds ? `${o.limitRounds} rounds, highest net worth wins.` : 'No time limit: last one solvent wins.',
    'Full set doubles rent on empty streets. Build evenly. 32 houses, 12 hotels.', 'Mortgage for half the price, unmortgage for that plus 10%.', 'Benched: doubles, $50 or a card. Three doubles in a row gets you Benched.'])
    rules.appendChild(mk('li', null, t));
  body.append(mk('div', 'k-label', 'Rules'), rules);
  const foot = mk('div', 'sh-foot');
  if (role !== 'guest' && mode === 'play' && state && state.phase !== 'over') foot.appendChild(btn(paused ? 'Resume bots' : 'Pause bots', '', () => { togglePause(); drawSheet(true); }));
  foot.appendChild(btn(role === 'host' ? 'Close the table' : role === 'guest' ? 'Leave the table' : 'Save and quit', '', () => {
    closeSheet();
    if (role === 'local') backToSetup();
    else confirmSheet(role === 'host' ? 'Close the table?' : 'Leave the table?', role === 'host' ? 'Everyone at the table gets sent home. The game ends.' : 'A BDB bot takes your seat. Rejoin from this browser to take it back.', role === 'host' ? 'Close it' : 'Leave', () => { leaveTable(); });
  }));
  foot.appendChild(btn('Close', 'primary', closeSheet));
  box.appendChild(foot);
}

/* ---------- auction sheet ---------- */
let aucHidden = false, aucSp = -1;
const auc = {key:'', deadline:0, botAt:{}, total:1};
let aucTimerEl = null;
let aucDom = null;               // built once per auction, then updated in place so buttons never vanish under a finger
function drawAuction(){
  const s = shown, w = $('aucWrap'), box = $('auc');
  if (!s || s.phase !== 'auction' || !s.auction || mode !== 'play'){ w.hidden = true; aucSp = -1; aucDom = null; return; }
  const a = s.auction;
  if (a.sp !== aucSp){ aucSp = a.sp; aucHidden = false; aucDom = null; }
  if (aucHidden){ w.hidden = true; return; }
  w.hidden = false;
  const mine = s.players.map((p, i) => i).filter(i => !s.players[i].out && controls(i) && (a.active.includes(i) || a.by === i));
  const key = a.sp + '|' + mine.join(',') + '|' + s.players.map(p => p.out ? 1 : 0).join('');
  if (!aucDom || aucDom.key !== key){
    box.innerHTML = '';
    const d = aucDom = {key, rows:[]};
    const hd = head('Auction', S[a.sp].name); hd.querySelector('.x').onclick = () => { aucHidden = true; drawAuction(); }; box.appendChild(hd);
    const body = mk('div', 'sh-body'); box.appendChild(body);
    const top = mk('div', 'au-top');
    const mini = mk('button', 'mini'); mini.type = 'button'; mini.style.width = '130px'; mini.style.flex = 'none'; mini.style.setProperty('--gc', gcol(a.sp));
    mini.append(mk('i', 'mb'), mk('b', null, S[a.sp].name), mk('small', null, `List ${money(S[a.sp].price)}`)); mini.onclick = () => openSheet('deed', a.sp);
    const hi = mk('div', 'au-high'); d.high = mk('b'); d.by = mk('span'); hi.append(mk('small', null, 'High bid'), d.high, d.by);
    top.append(mini, hi); body.appendChild(top);
    const bar = mk('div', 'au-bar'); aucTimerEl = mk('i'); bar.appendChild(aucTimerEl); body.appendChild(bar);
    d.ppl = mk('div', 'au-ppl'); body.appendChild(d.ppl);
    d.pp = [];
    s.players.forEach((p, i) => { if (p.out) return; const sp = mk('span'); const dot = mk('i'); dot.style.setProperty('--pc', p.color); sp.append(dot, document.createTextNode(p.name)); d.ppl.appendChild(sp); d.pp[i] = sp; });
    const meBox = mk('div', 'au-me');
    const named = mine.length > 1 || seats.filter((x, i) => controls(i)).length > 1;
    for (const pid of mine){
      const row = mk('div', 'au-row'), r = {pid, bids:[]};
      if (named){ r.nm = mk('div', 'nmx'); row.appendChild(r.nm); }
      for (const inc of [10, 50, 100]){
        const b = btn('', inc === 10 ? 'primary' : '', () => {
          const au = state && state.auction; if (!au) return;
          const want = +b.dataset.amt;
          act(pid, {t:'bid', amt: want > au.high ? want : au.high + inc});
        });
        b.dataset.inc = inc; row.appendChild(b); r.bids.push(b);
      }
      r.pass = btn('Pass', '', () => act(pid, {t:'pass'})); row.appendChild(r.pass);
      meBox.appendChild(row); d.rows.push(r);
    }
    if (mine.length) body.appendChild(meBox);
    else body.appendChild(mk('p', 'note', controls(s.cur) || role === 'guest' ? "You're out of this one. Watch the bidding." : 'Bidding in progress.'));
  }
  const d = aucDom;
  d.high.textContent = money(a.high);
  d.by.textContent = a.by >= 0 ? s.players[a.by].name : 'No bids yet';
  d.pp.forEach((sp, i) => { if (sp) sp.className = a.by === i ? 'hi' : a.active.includes(i) ? '' : 'outp'; });
  for (const r of d.rows){
    const p = s.players[r.pid], inIt = a.active.includes(r.pid);
    if (r.nm) r.nm.textContent = p.name + (a.by === r.pid ? ' · high bid' : !inIt ? ' · passed' : '');
    for (const b of r.bids){ const amt = a.high + +b.dataset.inc; b.dataset.amt = amt; b.textContent = money(amt); b.disabled = !inIt || a.by === r.pid || amt > p.cash; }
    r.pass.disabled = !inIt || a.by === r.pid;
  }
  updateAucBar();
}
function updateAucBar(){
  if (!aucTimerEl || $('aucWrap').hidden) return;
  const left = Math.max(0, auc.deadline - performance.now());
  aucTimerEl.style.transform = `scaleX(${Math.min(1, left / (auc.total || 1)).toFixed(3)})`;
}

/* ---------- bots + timers ---------- */
function mem(pid){ return botMem[pid] || (botMem[pid] = {}); }
function botDelay(a){
  const b = SPEEDS[speed].bot;
  return ['build', 'sell', 'mortgage', 'unmortgage'].includes(a.t) ? b * .45 : a.t === 'end' ? b * .55 : a.t === 'accept' || a.t === 'reject' ? b * .8 : b;
}
const FALLBACK = {roll:{t:'roll'}, end:{t:'end'}, buy:{t:'decline'}, debt:{t:'bankrupt'}};
function elapsed(){ return clock.acc + (clock.since != null ? Date.now() - clock.since : 0); }
function clockRun(on){ if (on && clock.since == null) clock.since = Date.now(); if (!on && clock.since != null){ clock.acc += Date.now() - clock.since; clock.since = null; } }
function loop(){
  if (mode !== 'play' || !state) return;
  updateAucBar();
  const tl = $('tleft'); if (tl && state.opts.limitMin && shown) tl.firstChild.textContent = BDB.fmtTime(Math.max(0, state.opts.limitMin * 60000 - elapsed()));
  if (role === 'guest' || state.phase === 'over') return;
  const hidden = document.hidden && role === 'local';
  clockRun(!paused && !hidden);
  if (paused || hidden || busy || Q.length) return;
  const now = performance.now();
  if (state.opts.limitMin && !state.timeUp && elapsed() >= state.opts.limitMin * 60000){ commit(-1, {t:'timeUp'}); return; }
  if (state.phase === 'auction') return auctionLoop(now);
  if (now < nextBotAt) return;
  const order = [];
  if (state.trade) order.push(state.trade.to);
  if (state.phase === 'debt') order.push(state.debts[0].pid); else order.push(state.cur);
  for (const pid of order){
    if (!isBot(pid)) continue;
    const lv = seats[pid].level || 2;
    let a = null;
    try { a = BOT.decide(state, pid, lv, mem(pid)); } catch(e){ console.warn('bot', e); }
    if (!a) continue;
    nextBotAt = now + botDelay(a);
    if (!commit(pid, a)){
      const m = mem(pid); m.fails = (m.fails || 0) + 1;
      if (m.fails > 2 && pid === state.cur && FALLBACK[state.phase]){ m.fails = 0; commit(pid, FALLBACK[state.phase]); }
      if (state.trade && state.trade.to === pid) commit(pid, {t:'reject'});
    } else mem(pid).fails = 0;
    return;
  }
}
function auctionLoop(now){
  const a = state.auction;
  const key = a.sp + ':' + a.n + ':' + state.seq;
  if (key !== auc.key){
    auc.key = key;
    const humans = a.active.filter(p => !isBot(p) && p !== a.by);
    auc.total = humans.length ? (a.n === 0 ? 12000 : 7000) : 2500;
    auc.deadline = now + auc.total;
    auc.botAt = {};
    for (const p of a.active) auc.botAt[p] = now + SPEEDS[speed].bot * (.5 + Math.random() * .9) * (humans.length ? 1 : .6);
    if (role === 'host') broadcastAuction();
  }
  for (const pid of a.active){
    if (!isBot(pid) || pid === a.by || now < auc.botAt[pid]) continue;
    let d = null;
    try { d = BOT.decide(state, pid, seats[pid].level || 2, mem(pid)); } catch(e){}
    auc.botAt[pid] = Infinity;
    if (d && commit(pid, d)) return;
    if (!d || d.t !== 'pass'){ if (commit(pid, {t:'pass'})) return; }
  }
  if (now >= auc.deadline) commit(-1, {t:'auctionEnd'});
}
setInterval(loop, 60);
function togglePause(){
  if (mode !== 'play' || role === 'guest' || !state || state.phase === 'over') return;
  paused = !paused;
  auc.key = '';
  let tag = document.querySelector('.paused-tag');
  if (paused && !tag){ tag = mk('div', 'paused-tag', 'Bots paused · P to resume'); $('stage').appendChild(tag); }
  if (!paused && tag) tag.remove();
  render();
}
function setSpeed(i){ speed = SPEEDS[i] ? i : 1; BDB.store.set('ty-speed', String(speed)); $('optSpeed').value = String(speed); }

/* ---------- local save ---------- */
function saveGame(){
  if (role !== 'local' || !state) return;
  if (state.phase === 'over'){ BDB.store.set('ty-save', ''); return; }
  BDB.store.set('ty-save', JSON.stringify({v:1, state, seats: seats.map(x => ({kind:x.kind, level:x.level, name:x.name})), elapsed: elapsed()}));
}
function loadSave(){
  try {
    const sv = JSON.parse(BDB.store.get('ty-save'));
    if (!sv || sv.v !== 1 || !validState(sv.state) || sv.state.phase === 'over' || !Array.isArray(sv.seats) || sv.seats.length !== sv.state.players.length) return null;
    return sv;
  } catch(e){ return null; }
}
function resumeGame(){
  const sv = loadSave(); if (!sv) return;
  role = 'local';
  seats = sv.seats.map((x, i) => ({kind: ['you', 'human', 'bot'].includes(x.kind) ? x.kind : 'bot', level: [1, 2, 3].includes(x.level) ? x.level : 2, name: sv.state.players[i].name}));
  state = sv.state;
  if (state.phase === 'auction') auc.key = '';
  clock.acc = +sv.elapsed || 0; clock.since = null;
  beginPlay(true);
}

/* ---------- start / end ---------- */
function newSeed(){ return crypto.getRandomValues(new Uint32Array(1))[0] || 1; }
function beginPlay(resumed){
  mode = 'play'; overShown = false; paused = false; Q.length = 0; busy = false;
  document.querySelector('.paused-tag')?.remove();
  BDB.hideSplash(); BDB.hideEnd(); closeSheet();
  shown = state; vpos = state.players.map(p => p.pos); vjail = state.players.map(p => !!p.jail);
  slot = null; lastLogN = 0; $('log').innerHTML = ''; plEls.length = 0; prevCash.length = 0; botMem.length = 0;
  lastTradeSeen = state.trade ? state.trade.id : 0;
  if (!resumed && role !== 'guest'){ clock.acc = 0; clock.since = null; }
  nextBotAt = performance.now() + 900;
  spEls.forEach(e => e.key = '');
  $('cardslot').dataset.key = '';
  buildTokens(state); layout(); render();
  $('chatForm').hidden = role === 'local';
  say('start', {});
  BDB.sfx.big();
  checkPrompts();
}
function startFromSetup(){
  const cfg = seatsFromSetup();
  if (cfg.length < 2) return;
  if (cfg.some(x => x.kind === 'open')){ hostTable(cfg); return; }
  role = 'local'; seats = cfg; mySeat = seats.findIndex(x => x.kind === 'you');
  state = E.newGame({players: seats.map(x => ({name:x.name, token:x.token, color:x.color})), opts: optsFromSetup(), seed: newSeed()});
  beginPlay();
}
function backToSetup(){
  if (role === 'host' || role === 'guest') leaveTable(true);
  saveGame();
  mode = 'menu'; role = 'local'; state = null; shown = null; Q.length = 0;
  closeSheet(); $('aucWrap').hidden = true; BDB.hideEnd();
  document.querySelector('.paused-tag')?.remove();
  renderSetup(); renderTables(); BDB.showSplash();
}
function myPid(){ return role === 'guest' ? mySeat : seats.findIndex(x => x.kind === 'you'); }
function showOver(){
  const s = shown; if (!s || s.phase !== 'over') return;
  const first = !overShown; overShown = true; mode = 'play';
  const w = s.over.winner, me = myPid();
  const myW = me >= 0 ? s.over.worth[me] : null;
  let res = null;
  if (first && me >= 0){ res = BDB.addScore(myW); $('best').textContent = BDB.fmt(res.list[0].s); }
  else if (me >= 0) res = {rank:-1, isBest:false, list:BDB.scores()};
  if (first){ if (me === w) BDB.sfx.big(); else BDB.sfx.bad(); }
  const youWon = me >= 0 && me === w;
  BDB.showEnd({
    eyebrow: s.over.why === 'last' ? 'Last one standing' : s.over.why === 'time' ? 'Time is up' : 'Final round',
    title: youWon ? 'You win BDB Tycoon' : `${s.players[w].name} wins`,
    line: youWon ? BDB.pick(["BDB is already asking you for a loan.", "Real estate mogul. BDB still rents a locker.", "You own the board. BDB owns a lanyard."]) : me >= 0 ? BDB.pick(D.lines.youLose) : BDB.pick(D.lines.win).replace('{p}', s.players[w].name),
    stats: [['Winner', money(s.over.worth[w])]].concat(me >= 0 && me !== w ? [['You', money(myW)]] : []).concat([['Rounds', String(s.round)]]),
    scores: res, format: v => money(v)
  });
  if (first) say('win', {p:s.players[w].name});
  BDB.store.set('ty-save', '');
}
$('again').onclick = () => { BDB.hideEnd(); if (role === 'local' && state){ startFromSetup(); } else backToSetup(); };
$('endBoard').onclick = () => BDB.hideEnd();
$('play').onclick = startFromSetup;
$('resume').onclick = resumeGame;
$('menuBtn').onclick = () => { if (mode === 'menu') return; openSheet('menu'); };
$('mute').onclick = () => { $('mute').textContent = BDB.sfx.toggle() ? 'Sound off' : 'Sound on'; };
$('mute').textContent = BDB.sfx.muted ? 'Sound off' : 'Sound on';
$('best').textContent = BDB.fmt((BDB.scores()[0] || {s:0}).s);

/* ---------- keyboard ---------- */
addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
  const k = e.key.toLowerCase();
  if (k === 'escape'){ if (sheet && sheet.kind !== 'room') closeSheet(); else if (!$('aucWrap').hidden){ aucHidden = true; drawAuction(); } return; }
  if (mode === 'menu'){ if (k === 'enter' && document.activeElement === document.body){ e.preventDefault(); startFromSetup(); } return; }
  if (!$('end').hidden){ if (k === 'enter'){ e.preventDefault(); $('again').click(); } return; }
  const s = state; if (!s) return;
  if (k === ' ' || k === 'p'){ e.preventDefault(); togglePause(); return; }
  if (sheet) return;
  if ((k === 'enter' || k === 'r') && controls(s.cur)){ if (s.phase === 'roll'){ e.preventDefault(); act(s.cur, {t:'roll'}); } else if (s.phase === 'end'){ e.preventDefault(); act(s.cur, {t:'end'}); } }
  else if (k === 'e' && s.phase === 'end') act(s.cur, {t:'end'});
  else if (k === 'b' && s.phase === 'buy') act(s.cur, {t:'buy'});
  else if (k === 'a' && s.phase === 'buy') act(s.cur, {t:'decline'});
  else if (k === 't'){ const me = actorPid(); if (me >= 0 && !s.trade && s.phase !== 'auction') openTrade(me); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && role === 'local' && mode === 'play') saveGame(); });

/* ---------- toasts ---------- */
function toast(text, bad){
  const t = mk('div', 'toast' + (bad ? ' bad' : ''), text);
  $('toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
}

/* =========================================================
   Online tables
   Host: authoritative. Guests send intents ('act'), host runs E.step and broadcasts the full state ('st').
   ========================================================= */
let NET = null, room = null, tableCode = null, hostPeer = null, expectHost = null, started = false, joinTimer = null, roomOpts = null;
let guestSeats = [];
const chatRate = new Map(), actRate = new Map();
function renderTables(list){
  list = list || (NET ? NET.list() : []);
  const box = $('tables'); box.innerHTML = '';
  const st = $('netStatus');
  st.textContent = !NET ? 'Off' : NET.failed ? 'Unavailable in this browser' : NET.selfId ? `${list.length} open` : 'Connecting…';
  const open = list.filter(t => !t.started && t.code !== tableCode);
  if (!open.length){ box.appendChild(mk('div', 'tempty', NET && NET.failed ? "Online play couldn't start here." : 'No open tables right now. Set a seat to Open and host one.')); return; }
  for (const t of open){
    const r = mk('div', 'trow'), m = mk('div', 'tm');
    m.append(mk('b', null, `${t.name}'s table`), mk('small', null, `${t.n} of ${t.max} seats taken`));
    r.append(m, btn('Join', 'primary', () => joinTable(t.code, t.peer), t.n >= t.max));
    box.appendChild(r);
  }
}
NET = initNet({local:LOCAL_NET, onTables:renderTables, onStatus:() => { renderTables(); renderSetup(); }});

function seatInfo(){
  return seats.map(x => ({name:x.name, color:x.color, token:x.token, level:x.level || 0,
    kind: x.kind === 'remote' ? (x.away ? 'away' : 'guest') : x.kind === 'you' ? 'host' : x.kind === 'human' ? 'local' : x.kind}));
}
function inviteUrl(){
  const u = new URL(location.href); u.search = ''; u.hash = '';
  u.searchParams.set('t', tableCode); if (NET.selfId) u.searchParams.set('h', NET.selfId); if (LOCAL_NET) u.searchParams.set('net', 'local');
  return u.toString();
}
async function hostTable(cfg){
  $('play').disabled = true;
  const ok = await NET.ready; $('play').disabled = false;
  if (!ok){ toast("Online play couldn't start in this browser.", true); return; }
  role = 'host'; tableCode = rid(6); started = false; roomOpts = optsFromSetup();
  seats = cfg.map(x => x.kind === 'open' ? {...x, name:'Open seat'} : x);
  mySeat = seats.findIndex(x => x.kind === 'you');
  room = NET.room(tableCode);
  room.onJoin(() => {});
  room.onLeave(id => hostPeerLeft(id));
  room.onMessage((t, d, from) => { try { hostMsg(t, d && typeof d === 'object' ? d : {}, from); } catch(e){ console.warn('host msg', e); } });
  announce();
  openSheet('room');
}
function announce(){
  if (role !== 'host') return;
  NET.announce({code:tableCode, name:myName, n:seats.filter(x => x.kind !== 'open').length, max:seats.length, started});
}
function broadcastTable(){ if (room) room.send('table', {code:tableCode, started, seats:seatInfo()}); if (sheet && sheet.kind === 'room') drawSheet(true); }
function broadcastState(ev, to){
  if (!room || !started) return;
  room.send('st', {s:state, ev:ev || [], seats:seatInfo(), aLeft: state.phase === 'auction' ? Math.max(0, auc.deadline - performance.now()) : 0, aTotal:auc.total}, to);
}
function broadcastAuction(){ if (room && started) room.send('auc', {left:Math.max(0, auc.deadline - performance.now()), total:auc.total, seq:state.seq}); }
function hostSys(text){ addFeed(text, 'sys'); if (room) room.send('sys', {text}); }
const SAFE_ACTS = new Set(['roll', 'jailPay', 'jailCard', 'buy', 'decline', 'bid', 'pass', 'end', 'build', 'sell', 'mortgage', 'unmortgage', 'pay', 'bankrupt', 'propose', 'accept', 'reject', 'cancel']);
function sanitizeAct(a){
  if (!a || typeof a !== 'object' || typeof a.t !== 'string' || !SAFE_ACTS.has(a.t)) return null;
  const o = {t:a.t};
  if (['build', 'sell', 'mortgage', 'unmortgage'].includes(a.t)){ if (!Number.isInteger(a.sp) || a.sp < 0 || a.sp > 39) return null; o.sp = a.sp; }
  if (a.t === 'bid'){ if (!Number.isInteger(a.amt) || a.amt < 1 || a.amt > 1e6) return null; o.amt = a.amt; }
  if (a.t === 'accept' && Number.isInteger(a.id)) o.id = a.id;
  if (a.t === 'propose'){ if (!Number.isInteger(a.to) || a.to < 0 || a.to > 5) return null; o.to = a.to; o.give = E.cleanSide(a.give); o.get = E.cleanSide(a.get); }
  return o;
}
function hostMsg(t, d, from){
  if (role !== 'host') return;
  const seatOf = () => seats.findIndex(x => x.kind === 'remote' && x.peer === from && !x.away);
  if (t === 'join'){
    const name = clean(d.name, 20) || 'Guest';
    const tokens = Array.isArray(d.tokens) ? d.tokens.filter(x => typeof x === 'string' && /^[a-z0-9]{8,24}$/.test(x)).slice(0, 8) : [];
    let pid = seats.findIndex(x => x.peer === from);
    if (pid < 0) pid = seats.findIndex(x => x.kind === 'remote' && x.away && tokens.includes(x.tok));
    if (pid >= 0 && seats[pid].peer !== from){
      const x = seats[pid]; x.peer = from; x.away = false;
      hostSys(`${x.name} is back and takes their seat from the bot.`);
    } else if (pid < 0 && !started){
      pid = seats.findIndex(x => x.kind === 'open');
      if (pid >= 0){
        let nm = name, k = 2;
        while (seats.some(y => y.kind !== 'open' && y.name === nm)) nm = `${name.slice(0, 17)} ${k++}`;
        const x = seats[pid]; x.kind = 'remote'; x.peer = from; x.tok = rid(12); x.name = nm; x.away = false; addFeed(`${nm} sat down.`, 'sys');
      }
    }
    room.send('welcome', {seat:pid, token: pid >= 0 ? seats[pid].tok : null, code:tableCode}, from);
    broadcastTable(); announce();
    if (started){ broadcastState([]); render(); }
    return;
  }
  if (t === 'act'){
    if (!started) return;
    const now = Date.now(), r = actRate.get(from) || {t:now, n:0};
    if (now - r.t > 1000){ r.t = now; r.n = 0; }
    if (++r.n > 15) return;                       // flood guard: 15 moves a second is plenty
    actRate.set(from, r);
    const pid = seatOf(); if (pid < 0) return;
    const a = sanitizeAct(d.a); if (!a) return;
    commit(pid, a, from);
    return;
  }
  if (t === 'chat'){
    const text = clean(d.text, 140); if (!text) return;
    const now = Date.now(); if (now - (chatRate.get(from) || 0) < 800) return; chatRate.set(from, now);
    const pid = seats.findIndex(x => x.peer === from);
    const name = pid >= 0 ? seats[pid].name : 'Spectator', color = pid >= 0 ? seats[pid].color : '#8fa3cc';
    room.send('chat', {name, color, text});
    addFeed([name, text], 'chat', color);
    return;
  }
  if (t === 'bye') hostPeerLeft(from);
}
function hostPeerLeft(id){
  if (role !== 'host') return;
  const pid = seats.findIndex(x => x.peer === id);
  if (pid < 0) return;
  const x = seats[pid];
  if (!started){ seats[pid] = {kind:'open', name:'Open seat', color:x.color, token:x.token, level:0}; addFeed(`${x.name} left.`, 'sys'); broadcastTable(); announce(); return; }
  x.away = true; x.peer = null;
  hostSys(`${x.name} dropped out. A BDB bot is holding the seat until they're back.`);
  broadcastState([]); render();
}
function startOnline(){
  if (role !== 'host' || started) return;
  let b = 0;
  seats = seats.map((x, i) => x.kind === 'open' ? {kind:'bot', level:2, name:D.botNames.find(n => !seats.some(y => y.name === n)) || 'BDB ' + (++b), token:x.token, color:x.color} : x);
  state = E.newGame({players: seats.map(x => ({name:x.name, token:x.token, color:x.color})), opts: roomOpts, seed:newSeed()});
  started = true; announce();
  broadcastTable();
  beginPlay();
  broadcastState([]);
}
function sheetRoom(box){
  const host = role === 'host';
  const info = host ? seatInfo() : guestSeats;
  box.appendChild(head(host ? 'Your table' : 'Table', host ? `Code ${tableCode}` : (hostPeer ? 'Waiting for the host to start' : 'Connecting to the host…')));
  const body = mk('div', 'sh-body'); box.appendChild(body);
  if (host){
    body.appendChild(mk('p', 'note', 'Send this link. Anyone on this page can also see your table in the lobby.'));
    const lr = mk('div', 'linkrow'), inp = mk('input'); inp.readOnly = true; inp.value = inviteUrl(); inp.id = 'inviteLink';
    const cp = btn('Copy', 'primary', async () => { try { await navigator.clipboard.writeText(inp.value); cp.textContent = 'Copied'; } catch(e){ inp.focus(); inp.select(); cp.textContent = 'Ctrl+C'; } setTimeout(() => cp.textContent = 'Copy', 1600); });
    lr.append(inp, cp); body.appendChild(lr);
  }
  const rs = mk('div', 'rseats');
  info.forEach((x, i) => {
    const r = mk('div', 'rseat' + (x.kind === 'open' ? ' wait' : '') + ((host ? i === mySeat : i === mySeat) ? ' me' : ''));
    const tk = mk('span', 'ptok'); tk.style.setProperty('--pc', x.color); tk.innerHTML = tokIcon(x.token);
    const lbl = {open:'Waiting…', guest:'Online', host:'Host', local:'This device', bot:'BDB bot', away:'Away', you:'Host', human:'This device', remote:'Online'}[x.kind] || '';
    r.append(tk, document.createTextNode(x.kind === 'open' ? 'Open seat' : x.name), mk('small', null, (i === mySeat ? 'You · ' : '') + lbl));
    rs.appendChild(r);
  });
  body.appendChild(rs);
  if (host) body.appendChild(mk('p', 'note', 'Start whenever you like. Empty seats get BDB bots. If you leave, the table closes for everyone.'));
  else if (hostPeer && mySeat < 0) body.appendChild(mk('p', 'note', 'The table is full, so you are watching.'));
  const foot = mk('div', 'sh-foot');
  if (host) foot.append(btn('Start game', 'primary', startOnline), btn('Close table', '', () => leaveTable()));
  else foot.append(btn('Leave', '', () => leaveTable()));
  box.appendChild(foot);
}
function leaveTable(quiet){
  if (role === 'host' && room){ room.send('end', {why:'host'}); NET.unannounce(); }
  if (role === 'guest' && room && hostPeer) room.send('bye', {}, hostPeer);
  const r = room; room = null; if (r) setTimeout(() => r.leave(), 300);
  clearTimeout(joinTimer);
  tableCode = null; hostPeer = null; started = false; guestSeats = [];
  if (params.has('t')){ params.delete('t'); params.delete('h'); history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '')); }
  if (!quiet){ role = 'local'; closeSheet(); if (mode === 'play' && state && state.phase !== 'over'){ backToSetup(); } else if (mode === 'menu'){ renderSetup(); } }
  role = 'local';
}
addEventListener('pagehide', () => { if (role === 'host' && room) room.send('end', {why:'host'}); if (role === 'guest' && room && hostPeer) room.send('bye', {}, hostPeer); });

/* guest side */
function myTokens(code){ try { const a = JSON.parse(BDB.store.get('ty-seat-' + code)); return Array.isArray(a) ? a.filter(x => typeof x === 'string').slice(-8) : []; } catch(e){ return []; } }
function addToken(code, tok){ const a = myTokens(code); if (!a.includes(tok)){ a.push(tok); BDB.store.set('ty-seat-' + code, JSON.stringify(a.slice(-8))); } }
async function joinTable(code, hostId){
  if (!okCode(code)) return;
  const ok = await NET.ready;
  if (!ok){ toast("Online play couldn't start in this browser.", true); return; }
  if (role !== 'local' || mode === 'play') return;
  role = 'guest'; tableCode = code; hostPeer = null; expectHost = typeof hostId === 'string' && hostId.length < 64 ? hostId : null; mySeat = -1; started = false; guestSeats = [];
  room = NET.room(code);
  const hello = id => { if (!hostPeer && (!expectHost || id === expectHost)) room.send('join', {name:myName, tokens:myTokens(code)}, id); };
  room.onJoin(hello);
  room.onLeave(id => { if (id === hostPeer) hostGone(); });
  room.onMessage((t, d, from) => { try { guestMsg(t, d && typeof d === 'object' ? d : {}, from); } catch(e){ console.warn('guest msg', e); } });
  room.peers().forEach(hello);
  joinTimer = setTimeout(() => { if (!hostPeer){ toast("Couldn't find that table. It only works while the host has the game open.", true); leaveTable(); } }, 30000);
  openSheet('room');
}
function okHex(c){ return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : '#8fa3cc'; }
function readSeats(arr, n){
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 6).map(x => ({name: clean(x && x.name, 20) || 'Player', color: okHex(x && x.color), token: TOKEN_IDS.includes(x && x.token) ? x.token : 'ball',
    kind: ['open', 'guest', 'host', 'local', 'bot', 'away'].includes(x && x.kind) ? x.kind : 'guest', level: [1, 2, 3].includes(x && x.level) ? x.level : 0}));
}
function validState(s){
  try {
    if (!s || typeof s !== 'object' || !Array.isArray(s.players) || s.players.length < 2 || s.players.length > 6) return false;
    for (const k of ['own', 'bld', 'mort']) if (!Array.isArray(s[k]) || s[k].length !== 40) return false;
    if (!s.own.every(o => Number.isInteger(o) && o >= -1 && o < s.players.length) || !s.bld.every(b => Number.isInteger(b) && b >= 0 && b <= 5)) return false;
    if (typeof s.phase !== 'string' || !Number.isInteger(s.cur) || s.cur < 0 || s.cur >= s.players.length || !Array.isArray(s.log) || !Array.isArray(s.dice)) return false;
    if (!s.opts || !s.bank || !s.decks || !Array.isArray(s.debts)) return false;
    if (s.phase === 'auction' && (!s.auction || !Array.isArray(s.auction.active) || !S[s.auction.sp])) return false;
    if (s.phase === 'buy' && !E.isOwnable(s.buy)) return false;
    if (s.phase === 'debt' && (!s.debts[0] || !Array.isArray(s.debts[0].items))) return false;
    if (s.phase === 'over' && (!s.over || !Array.isArray(s.over.worth))) return false;
    if (s.card && !(D.cards[s.card.deck] && D.cards[s.card.deck][s.card.id])) return false;
    if (s.trade && (!s.trade.give || !s.trade.get || !Array.isArray(s.trade.give.props) || !Array.isArray(s.trade.get.props))) return false;
    return s.players.every(p => p && typeof p.name === 'string' && p.name.length <= 24 && Number.isFinite(p.cash) && Number.isInteger(p.pos) && p.pos >= 0 && p.pos < 40 &&
      /^#[0-9a-f]{6}$/i.test(p.color) && TOKEN_IDS.includes(p.token) && Array.isArray(p.cards)) && s.log.every(l => l && typeof l.x === 'string' && Number.isInteger(l.n));
  } catch(e){ return false; }
}
function cleanEvents(ev){
  if (!Array.isArray(ev)) return [];
  return ev.slice(0, 200).filter(e => e && typeof e.t === 'string' && (e.pid == null || Number.isInteger(e.pid)) && (e.sp == null || (Number.isInteger(e.sp) && S[e.sp])) &&
    (e.g == null || GR[e.g]) && (e.t !== 'roll' || (Array.isArray(e.d) && e.d.every(n => Number.isInteger(n) && n >= 1 && n <= 6))) &&
    (e.t !== 'move' || (Number.isInteger(e.from) && Number.isInteger(e.n) && Math.abs(e.n) < 40 && Number.isInteger(e.to))) &&
    (e.t !== 'card' || (D.cards[e.deck] && D.cards[e.deck][e.id])));
}
function guestMsg(t, d, from){
  if (role !== 'guest') return;
  if (t === 'welcome'){
    if (hostPeer && from !== hostPeer) return;
    if (expectHost && from !== expectHost) return;
    if (d.code !== tableCode) return;
    hostPeer = from; clearTimeout(joinTimer);
    mySeat = Number.isInteger(d.seat) && d.seat >= 0 && d.seat < 6 ? d.seat : -1;
    if (typeof d.token === 'string' && /^[a-z0-9]{8,24}$/.test(d.token)) addToken(tableCode, d.token);
    if (sheet && sheet.kind === 'room') drawSheet(true);
    return;
  }
  if (from !== hostPeer) return;
  if (t === 'table'){
    guestSeats = readSeats(d.seats);
    if (!started && sheet && sheet.kind === 'room') drawSheet(true);
    return;
  }
  if (t === 'st'){
    if (!validState(d.s)) return;
    const s = d.s, ev = cleanEvents(d.ev);
    guestSeats = readSeats(d.seats);
    seats = s.players.map((p, i) => ({kind: (guestSeats[i] || {}).kind || 'guest', level:(guestSeats[i] || {}).level || 0, name:p.name, away:(guestSeats[i] || {}).kind === 'away'}));
    setAuc(d.aLeft, d.aTotal);
    if (!started || mode !== 'play'){ started = true; state = s; beginPlay(); return; }
    if (s.seq < state.seq) return;
    state = s; enqueue(s, ev);
    return;
  }
  if (t === 'auc'){ setAuc(d.left, d.total); return; }
  if (t === 'chat'){ const text = clean(d.text, 140); if (text) addFeed([clean(d.name, 20) || 'Someone', text], 'chat', okHex(d.color)); return; }
  if (t === 'sys'){ const text = clean(d.text, 160); if (text) addFeed(text, 'sys'); return; }
  if (t === 'err'){ toast(clean(d.msg, 120) || 'That move did not work', true); return; }
  if (t === 'end') hostGone();
}
function setAuc(left, total){
  if (Number.isFinite(left) && left >= 0 && left <= 60000){ auc.deadline = performance.now() + left; auc.total = Number.isFinite(total) && total > 0 && total <= 60000 ? total : 7000; }
}
function hostGone(){
  if (role !== 'guest') return;
  const playing = mode === 'play' && state && state.phase !== 'over';
  const wasWaiting = !started;
  leaveTable(true);
  closeSheet(); $('aucWrap').hidden = true;
  if (playing){
    mode = 'over';
    BDB.showEnd({eyebrow:'Table closed', title:'The host left', line:"The host closed the table, so this game is over. Nobody wins. BDB calls that a moral victory.", stats:[], scores:null});
    $('again').textContent = 'Back to setup';
    $('again').onclick = () => { $('again').textContent = 'Run it back'; $('again').onclick = againDefault; backToSetup(); };
  } else if (wasWaiting){ toast('The host closed the table.', true); mode = 'menu'; renderSetup(); }
}
const againDefault = $('again').onclick;

$('chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = clean($('chatIn').value, 140); if (!text) return;
  $('chatIn').value = '';
  if (role === 'guest' && room && hostPeer) room.send('chat', {text}, hostPeer);
  else if (role === 'host' && room){
    const me = seats[mySeat] || {name:myName, color:'#ff8a2b'};
    room.send('chat', {name:me.name, color:me.color, text}); addFeed([me.name, text], 'chat', me.color);
  }
});

/* ---------- boot ---------- */
renderSetup(); renderTables(); layout();
$('view3d').onclick = () => { toggle3D(); $('view3d').blur(); };
paint3DPill();
if (want3D) start3D();
if (params.get('t') && okCode(params.get('t'))) joinTable(params.get('t'), params.get('h'));

window.__game = {
  get state(){ return mode === 'play' && state && state.phase === 'over' ? 'over' : mode; },
  get score(){ const s = state; const me = myPid(); return s && me >= 0 && s.players[me] ? E.worth(s, me) : 0; },
  get s(){ return state; }, get shown(){ return shown; },
  get busy(){ return busy || Q.length > 0; },
  get role(){ return role; }, get mySeat(){ return mySeat; }, get code(){ return tableCode; },
  get seats(){ return seats.map(x => ({kind:x.kind, name:x.name, away:!!x.away, level:x.level || 0})); },
  get paused(){ return paused; },
  act(a, pid){ act(pid != null ? pid : actorPid(), a); },
  setSpeed, togglePause,
  force(d){ if (state && role !== 'guest') state.force = d.slice(); },
  // test-only: hand property to a seat in a local game (needs ?test in the URL)
  give(pid, sps){ if (!params.has('test') || role !== 'local' || !state) return; const s = JSON.parse(JSON.stringify(state)); sps.forEach(i => { s.own[i] = pid; }); state = s; shown = s; saveGame(); render(); },
  inviteUrl: () => tableCode ? inviteUrl() : null
};
