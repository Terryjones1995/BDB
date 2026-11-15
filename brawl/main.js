/* Break Room Brawl: screens, saves, the match loop and online play. Rules live in sim.js, drawing in view.js. */
import { CARDS, CARD_IDS, BASE_IDS, baseName, AFF, AFF_IDS, RAR, RAR_IDS, MAPS, MAP_IDS, CPUS, DECK_SIZE, HAND, MAX_LEGEND, DECK_SLOTS, MAX_LVL, lvlMul, upgradeCost, deckProblem, DRAW_W, weightedPick, crateRoll } from './cards.js';
import { createSim, decodeEnts, canPlace, DT, MAX_EL, DOUBLE_AT, PATIENT } from './sim.js';
import { createAI } from './ai.js';
import { Accounts, fresh } from './store.js';
import { openTransport } from '../chess/net.js';

const $ = id => document.getElementById(id), Q = new URLSearchParams(location.search), BDB = window.BDB;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const fmt = n => Math.round(n).toLocaleString('en-CA'), pick = a => a[Math.floor(Math.random() * a.length)];
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029<>]/g, '').trim().slice(0, n);
const rid = (n = 6) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
const okCode = c => typeof c === 'string' && /^[a-z0-9]{4,12}$/.test(c);
const mmss = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const CRATE = 600, DEAL = .7, PAGE = 40, PAUSE_S = 300, SMALL = matchMedia('(max-width: 760px)').matches || (navigator.deviceMemory || 8) <= 4;
BDB.init({game:'brawl'});

/* ---------- trash talk ---------- */
const TALK = {
  start:["Welcome to my arena. Try not to cry on the hardwood.", "I drew this deck up on a napkin in the break room. You're done.", "Five-star prospect versus you. Bold of you to show up.", "I've got ten minutes and nowhere to be. Classic me.", "Scouts are watching this one. Probably.", "Deal the cards. I've been warming up since my last break."],
  heScores:["Tower down! Somebody call a scout, I'm heating up.", "That's more damage than I did all of last season.", "Write that down. BDB actually scored.", "One tower. I'm basically averaging 2.0 now.", "Did you see that? Nobody saw that? Typical.", "Clocked in, knocked it down. Signature move.", "Put that on the Jumbotron and loop it."],
  youScore:["That tower was a walk-on anyway.", "Lucky bounce. I was on my break.", "My defence is more of a suggestion.", "I let you have that. Confidence still at 99.", "Ref! That has to be a foul somewhere.", "Fine. I only needed two towers.", "That tower never listened to my coaching."],
  king:["You woke up the king. He was mid nap in the break room.", "Now the big tower's up. He hates extra work as much as I do."],
  ot:["Overtime? I don't do overtime. Check my timesheet.", "Sudden death. Next tower wins and my shift ends in five."],
  late:["Two minutes left and double Mana. This is where I usually clock out.", "Mana's flowing twice as fast. Finally, my kind of conditions."],
  legend:["Here comes a Legendary. Avert your eyes.", "Roll out the big card. Put my highlights on. Both of them.", "Legendary on the floor. Just like my scouting report said."],
  win:["Good game. I'm telling everyone the tablet was lagging.", "You beat me. The scouts weren't watching, right?", "I'm not mad. I'm just clocking out early.", "Enjoy it. My comeback tour starts Tuesday.", "That deck was a prototype. The real one is in my locker.", "You're taking my card? That one had sentimental value."],
  lose:["And that's why they called me a five-star prospect. Once.", "Ball game. Somebody get me a Jumbotron.", "I'd like to thank the break room for believing in me.", "Take notes. That's 2.0 points per game of pure heart.", "Undefeated since about four minutes ago."],
  emo:["Emojis won't save your towers.", "Cute. I'm still a five-star prospect.", "Less typing, more defending.", "I'd reply but I'm on my break."],
  pvpUp:["Crown for you. BDB could never.", "Tower down. BDB is taking notes he won't read."], pvpDown:["Your tower just got benched.", "That's a tower gone. BDB felt that from the break room."]
};
const EMO = ['😂', '😭', '😎', '🔥', '🤡', '👏'], CHAT = ['Good game.', 'Nice move.', 'Clock out already.', "That's 2.0 PPG energy.", 'The scouts saw that.', 'Break room is that way.', 'Oops.', 'Rematch after this?'];
let lastTalk = 0;
function talk(arr, force){ const now = performance.now(); if (!force && now - lastTalk < 5000) return; lastTalk = now; BDB.line(arr); }

/* ---------- sound ---------- */
let AC = null;
function tone(f, d, type = 'sine', v = .05, slide = 0, at = 0){
  if (BDB.sfx.muted) return;
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + at;
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + .02); } catch(e){}
}
const SND = {drop:() => tone(190, .14, 'triangle', .09, -90), spell:() => tone(520, .3, 'sine', .06, 400), boom:() => tone(95, .4, 'sawtooth', .08, -55), horn:() => { tone(233, .5, 'square', .04); tone(311, .5, 'square', .03); },
  legend:() => { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, .5, 'triangle', .07, 0, i * .09)); tone(98, .9, 'sawtooth', .06, -30); }};

/* ---------- the 3D view and card art (menus still work without it) ---------- */
let V = null, ready3d = false; const THUMB = {}, tq = [];
const NOVIEW = Q.get('noview') === '1';
async function initView(){
  if (NOVIEW) return;
  try {
    const [vw, md] = await Promise.all([import('./view.js?v=1114e'), import('./models.js?v=1114e')]);
    await md.preload();
    V = vw.createView($('arena'), {low:SMALL, reduced:BDB.reduced});
    ready3d = true; for (const el of document.querySelectorAll('.card[data-tk]')) want(el.dataset.tk);
  } catch(e){ console.warn('3D view unavailable', e); V = null; }
}
const tkOf = c => c.art + '|' + c.aff;
function drawThumb(tk){ if (THUMB[tk] || !V) return; const [art, aff] = tk.split('|'); try { THUMB[tk] = V.thumb(art, aff); } catch(e){ THUMB[tk] = ''; } }
function want(tk){ if (THUMB[tk] != null || !V || tq.includes(tk)) return; tq.push(tk); if (tq.length === 1) setTimeout(pumpThumbs, 0); }
function pumpThumbs(){
  for (let k = 0; k < 3 && tq.length; k++){
    const tk = tq[0]; drawThumb(tk); tq.shift();
    if (THUMB[tk]) for (const ph of document.querySelectorAll(`.card[data-tk="${tk}"] .ph`)){ const im = new Image(); im.alt = ''; im.src = THUMB[tk]; ph.replaceWith(im); }
  }
  if (tq.length) setTimeout(pumpThumbs, 0);
}

/* ---------- profile ---------- */
let P = null;
const save = () => { Accounts.save(P); top(); };
const lvl = id => P.cards[id] || 0;
const curDeck = () => P.decks[P.deck];
const myDeck = () => curDeck().map(id => ({id, lvl:Math.max(1, lvl(id))}));
const myTower = () => Math.round(curDeck().reduce((a, id) => a + Math.max(1, lvl(id)), 0) / DECK_SIZE);
function top(){ $('hCoins').textContent = fmt(P.coins); $('hTro').textContent = fmt(P.trophies); }

function cardEl(id, o = {}){
  const c = CARDS[id], b = document.createElement(o.div ? 'div' : 'button'), tk = tkOf(c);
  if (!o.div) b.type = 'button';
  if (o.now) drawThumb(tk); else want(tk);
  b.className = `card r-${c.rar}` + (o.cls ? ' ' + o.cls : ''); b.dataset.id = id; b.dataset.tk = tk; b.setAttribute('aria-label', c.name);
  b.innerHTML = `<span class="cost">${c.cost}</span>` + (THUMB[tk] ? `<img alt="" src="${THUMB[tk]}">` : `<span class="ph">${esc(c.baseName.split(' ').map(w => w[0]).join('').slice(0, 2))}</span>`) +
    (o.lvl ? `<span class="lv">Lv ${o.lvl}</span>` : '') + (o.tag ? `<span class="tagc${o.sale ? ' sale' : ''}">${o.tag}</span>` : `<span class="nm">${esc(c.name)}</span>`);
  return b;
}

/* ---------- dialogs ---------- */
function dlg(html, o = {}){ const w = $('dlg'), b = $('dlgBox'); b.innerHTML = html; w.hidden = false; dlg.lock = !!o.lock; return b; }
const dlgClose = () => { $('dlg').hidden = true; $('dlgBox').innerHTML = ''; };
function backdrop(w, close){ let d = false; w.addEventListener('pointerdown', e => { d = e.target === w; }); w.addEventListener('click', e => { if (d && e.target === w) close(); d = false; }); }
backdrop($('sheet'), () => { $('sheet').hidden = true; });
backdrop($('dlg'), () => { if (!dlg.lock) dlgClose(); });
function confirmBox(title, text, yes, fn){ const b = dlg(`<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="k-row"><button type="button" class="k-btn primary" id="cy">${esc(yes)}</button><button type="button" class="k-btn" id="cn">Cancel</button></div>`); b.querySelector('#cy').onclick = () => { dlgClose(); fn(); }; b.querySelector('#cn').onclick = dlgClose; }
function msgBox(title, text){ const b = dlg(`<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="k-row"><button type="button" class="k-btn primary" id="nf">OK</button></div>`); b.querySelector('#nf').onclick = dlgClose; }

/* ---------- card sheet: stats, buy, upgrade, put in deck ---------- */
const SPD = s => s <= 0 ? 'None' : s < 1 ? 'Slow' : s < 1.5 ? 'Medium' : s < 2 ? 'Fast' : 'Very fast';
function statRows(id, L){
  const c = CARDS[id], m = lvlMul(L), r = [];
  if (c.spell){ const s = c.spell; r.push(['Radius', s.r]); if (s.dmg) r.push(['Damage', Math.round(s.dmg * m)], ['Tower damage', Math.round(s.dmg * m * s.twr)]); if (s.freeze) r.push(['Freeze', s.freeze + 's']); if (s.rage) r.push(['Boost', '+35%'], ['Lasts', s.rage + 's']); return r; }
  const U = c.U;
  r.push(['Health', Math.round(U.hp * m)]);
  if (U.dmg) r.push([U.splash ? 'Area damage' : 'Damage', Math.round(U.dmg * m)], ['Hit speed', U.hit + 's'], ['Range', U.rng <= 1.5 ? 'Melee' : U.rng]);
  if (!U.bld) r.push(['Speed', SPD(U.spd)]); else r.push(['Lasts', U.life + 's']);
  r.push(['Targets', U.only ? 'Buildings' : !U.dmg ? 'None' : U.air ? 'Air and ground' : 'Ground']);
  if (c.n > 1) r.push(['Count', 'x' + c.n]);
  if (U.fly) r.push(['Moves', 'Flying']);
  if (U.spawn) r.push(['Spawns', `${U.spawn.n} every ${U.spawn.every}s`]);
  if (U.death) r.push(['On defeat', Math.round(U.death.dmg * m) + ' blast']);
  if (U.heal) r.push(['Heals', Math.round(U.heal.amt * m) + '/s']);
  if (U.charge) r.push(['Sprint hit', 'x2']);
  return r;
}
function sheet(id){
  const c = CARDS[id], L = lvl(id), R = RAR[c.rar], price = priceOf(id), up = upgradeCost(id, L), box = $('sheetBox');
  box.className = 'k-box r-' + c.rar;
  box.innerHTML = `<div class="sheet-top"><div></div><div><div class="rar">${R.name} ${c.type === 'spell' ? 'spell' : c.type === 'build' ? 'building' : 'troop'} · ${c.cost} Mana</div><h3>${esc(c.name)}</h3><p class="note" style="margin:0">${esc(c.desc)}${c.note ? ' <b style="color:var(--gold)">' + esc(c.note) + '</b>' : ''}</p></div></div>
    <div class="stats">${statRows(id, Math.max(1, L)).map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>
    <div style="width:100%"><div class="note" style="margin-bottom:6px">${L ? `Level ${L} of ${MAX_LVL}${L < MAX_LVL ? ' · next level adds 8% health and damage' : ' · maxed out'}` : 'You do not own this card yet.'}</div><div class="prog"><i style="width:${L / MAX_LVL * 100}%"></i></div></div>
    <div class="k-row" id="shAct"></div><div class="note" id="shNote"></div>`;
  box.querySelector('.sheet-top > div').replaceWith(cardEl(id, {div:true, lvl:L, now:true}));
  const act = box.querySelector('#shAct'), coin = '<span class="coin" style="margin-left:6px"></span>';
  const btn = (t, cls, fn, dis) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'k-btn ' + cls; b.innerHTML = t; b.disabled = !!dis; b.onclick = fn; act.appendChild(b); return b; };
  const close = () => { $('sheet').hidden = true; }, short = n => { box.querySelector('#shNote').textContent = `You need ${fmt(n - P.coins)} more coins.`; };
  if (B && !B.done){ /* mid-match: just the facts */ }
  else if (!L){ btn(`Buy ${coin}${fmt(price)}`, 'primary', () => { if (P.coins < price) return; P.coins -= price; P.cards[id] = 1; save(); BDB.sfx.good(); hub(); sheet(id); }, P.coins < price); if (P.coins < price) short(price); }
  else {
    if (L < MAX_LVL){ btn(`Upgrade ${coin}${fmt(up)}`, 'primary', () => { if (P.coins < up) return; P.coins -= up; P.cards[id] = L + 1; P.stats.up++; save(); BDB.sfx.big(); hub(); sheet(id); }, P.coins < up); if (P.coins < up) short(up); }
    if (!curDeck().includes(id)) btn('Put in deck', L < MAX_LVL ? '' : 'primary', () => { swap = id; close(); tab('Deck'); });
  }
  btn('Close', '', close);
  $('sheet').hidden = false;
}

/* ---------- a filterable, paged list of cards (1,152 of them, so never all at once) ---------- */
const lists = {};
function listUI(key, source, label){
  const st = lists[key] = {q:'', rar:'', base:'', aff:'', sort:'cost', n:PAGE}, box = $(key + 'F');
  box.innerHTML = `<input class="field" type="search" placeholder="Search cards" autocomplete="off" spellcheck="false">
    <select class="field" data-k="rar"><option value="">Any rarity</option>${RAR_IDS.map(r => `<option value="${r}">${RAR[r].name}</option>`).join('')}</select>
    <select class="field" data-k="base"><option value="">Any character</option>${BASE_IDS.map(b => `<option value="${b}">${esc(baseName(b))}</option>`).join('')}</select>
    <select class="field" data-k="aff"><option value="">Any style</option>${AFF_IDS.map(a => `<option value="${a}">${AFF[a].name || 'Standard'}</option>`).join('')}</select>
    <select class="field" data-k="sort"><option value="cost">Sort by Mana</option><option value="price">Sort by price</option><option value="name">Sort by name</option><option value="lvl">Sort by level</option></select>`;
  const draw = () => {
    const q = st.q.toLowerCase(), ro = {c:0, r:1, e:2, l:3};
    let ids = source().filter(id => { const c = CARDS[id]; return (!st.rar || c.rar === st.rar) && (!st.base || c.base === st.base) && (!st.aff || c.aff === st.aff) && (!q || c.name.toLowerCase().includes(q)); });
    ids.sort(st.sort === 'price' ? (a, b) => CARDS[a].price - CARDS[b].price : st.sort === 'name' ? (a, b) => CARDS[a].name.localeCompare(CARDS[b].name) : st.sort === 'lvl' ? (a, b) => lvl(b) - lvl(a) || CARDS[a].cost - CARDS[b].cost : (a, b) => CARDS[a].cost - CARDS[b].cost || ro[CARDS[a].rar] - ro[CARDS[b].rar] || CARDS[a].name.localeCompare(CARDS[b].name));
    const g = $(key + 'Grid'), dl = key === 'shop' ? deals() : [], dk = curDeck(); g.innerHTML = '';
    for (const id of ids.slice(0, st.n)){ const c = cardEl(id, key === 'shop' ? {tag:lvl(id) ? 'Owned' : fmt(priceOf(id)), sale:dl.includes(id) && !lvl(id), lvl:lvl(id), cls:lvl(id) ? 'dim' : ''} : {lvl:lvl(id), cls:dk.includes(id) ? 'inuse' : ''}); c.onclick = () => sheet(id); g.appendChild(c); }
    if (!ids.length) g.innerHTML = '<p class="note">No cards match that.</p>';
    $(key + 'Lbl').textContent = `${label} · ${fmt(ids.length)}`; $(key + 'More').hidden = ids.length <= st.n;
  };
  st.draw = draw;
  box.querySelector('input').oninput = e => { st.q = e.target.value; st.n = PAGE; draw(); };
  for (const s of box.querySelectorAll('select')) s.onchange = () => { st[s.dataset.k] = s.value; st.n = PAGE; draw(); };
  $(key + 'More').onclick = () => { st.n += PAGE; draw(); };
}

/* ---------- hub ---------- */
let curTab = 'Battle', swap = null;
function tab(t){ curTab = t; for (const k of ['Battle', 'Deck', 'Market', 'Profile']) $('tab' + k).hidden = k !== t; for (const b of $('tabbar').children) b.setAttribute('aria-selected', b.dataset.tab === t); if (t !== 'Deck') swap = null; hub(); $('hubBody').scrollTop = 0; }
$('tabbar').onclick = e => { const b = e.target.closest('button'); if (b) tab(b.dataset.tab); };
$('toDeck').onclick = () => tab('Deck');
const avgCost = d => (d.reduce((a, id) => a + CARDS[id].cost, 0) / d.length).toFixed(1);
const COLS = ['#9fb3d9', '#4ade80', '#4fb3ff', '#c77dff', '#ff9d3c', '#ff6fae', '#ff5a4a', '#ffd95a'];
function hub(){
  if (!P) return;
  top();
  if (curTab === 'Battle'){
    $('bDeckLbl').textContent = `Deck ${P.deck + 1} · average ${avgCost(curDeck())} Mana`;
    const bd = $('bDeck'); bd.innerHTML = ''; for (const id of curDeck()){ const c = cardEl(id, {lvl:lvl(id)}); c.onclick = () => sheet(id); bd.appendChild(c); }
    const ni = Math.min(P.ladder, CPUS.length - 1), nc = CPUS[ni];
    $('hero').innerHTML = `<div class="pic"></div><div><small>${P.ladder >= CPUS.length ? 'You beat them all. Run it back against' : 'Next up'}</small><h2>${esc(nc.name)}</h2><p>${esc(nc.tag)} ${esc(MAPS[nc.map].name)}, level ${nc.lvl} cards.</p><button type="button" class="k-btn primary big" id="heroGo">Battle</button></div>`;
    $('heroGo').onclick = () => preCpu(ni);
    const ld = $('ladder'); ld.innerHTML = '';
    CPUS.forEach((c, i) => {
      const locked = i > P.ladder, wins = P.beaten[c.id] || 0, row = document.createElement('div');
      row.className = 'cpu' + (locked ? ' locked' : ''); row.style.setProperty('--tc', COLS[i]);
      row.innerHTML = `<div class="av"><b>${i + 1}</b></div><div><h4>${esc(c.name)}</h4><p>${esc(c.tag)}</p><div class="meta">${esc(MAPS[c.map].name)} · Level ${c.lvl} cards · ${fmt(wins ? c.coins / 2 : c.coins)} coins</div></div>
        <div>${locked ? '<span class="note">Beat the one above</span>' : `<button type="button" class="k-btn ${wins ? '' : 'primary'}">${wins ? 'Rematch' : 'Fight'}</button>${wins ? `<span class="done">Beaten x${wins}</span>` : ''}`}</div>`;
      const b = row.querySelector('button'); if (b) b.onclick = () => preCpu(i);
      ld.appendChild(row);
    });
  } else if (curTab === 'Deck'){
    const seg = $('deckSeg'); seg.innerHTML = '';
    for (let i = 0; i < DECK_SLOTS; i++){ const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Deck ' + (i + 1); b.setAttribute('aria-pressed', i === P.deck); b.onclick = () => { P.deck = i; swap = null; save(); hub(); }; seg.appendChild(b); }
    $('deckAvg').textContent = `Average ${avgCost(curDeck())} Mana`;
    const g = $('deckGrid'); g.innerHTML = '';
    curDeck().forEach((id, i) => { const c = cardEl(id, {lvl:lvl(id), cls:swap ? 'pickme' : ''}); c.onclick = () => { if (swap) doSwap(i); else sheet(id); }; g.appendChild(c); });
    $('deckHint').innerHTML = swap ? `Tap the card above that <b>${esc(CARDS[swap].name)}</b> should replace. <button type="button" class="link" id="swapX" style="padding:2px 6px">Cancel</button>` : `${DECK_SIZE} cards, 5 in your hand at a time, and the deck keeps cycling. One version of each character, no more than ${MAX_LEGEND} Legendary. Tap a card below to swap it in.`;
    const sx = $('swapX'); if (sx) sx.onclick = () => { swap = null; hub(); };
    lists.own.draw();
  } else if (curTab === 'Market'){
    const dg = $('dealGrid'); dg.innerHTML = '';
    for (const id of deals()){ const c = cardEl(id, {tag:lvl(id) ? 'Owned' : fmt(priceOf(id)), sale:!lvl(id), lvl:lvl(id)}); c.onclick = () => sheet(id); dg.appendChild(c); }
    lists.shop.draw();
    const tot = RAR_IDS.reduce((a, r) => a + RAR[r].w, 0);
    $('odds').innerHTML = RAR_IDS.map(k => `<span class="r-${k}">${RAR[k].name} ${Math.round(RAR[k].w / tot * 100)}%</span>`).join('');
    $('crateBuy').innerHTML = `Open for <span class="coin" style="margin-left:6px"></span>${fmt(CRATE)}`; $('crateBuy').disabled = P.coins < CRATE;
  } else {
    $('pName').textContent = P.name;
    const s = P.stats, own = Object.keys(P.cards).length;
    $('pStats').innerHTML = [['Coins', fmt(P.coins)], ['Trophies', fmt(P.trophies)], ['BDBs beaten', `${Math.min(P.ladder, CPUS.length)} of ${CPUS.length}`], ['Wins against BDB', s.w], ['Losses against BDB', s.l], ['Online wins', s.ow], ['Online losses', s.ol], ['Cards collected', `${fmt(own)} of ${fmt(CARD_IDS.length)}`], ['Cards won from BDB', s.won], ['Upgrades bought', s.up]].map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
    $('codeOut').value = Accounts.code(P);
  }
}
function doSwap(i){
  const d = curDeck().slice(); d[i] = swap;
  const bad = deckProblem(d);
  if (bad){ BDB.sfx.bad(); $('deckHint').innerHTML = `<span class="err">${esc(bad)}</span>`; swap = null; setTimeout(hub, 2200); return; }
  P.decks[P.deck] = d; swap = null; save(); BDB.sfx.good(); hub();
}

/* ---------- market ---------- */
let dealDay = -1, dealIds = [];
function deals(){ const day = Math.floor(Date.now() / 864e5); if (day !== dealDay){ dealDay = day; let a = day * 2654435761 >>> 0; const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; dealIds = []; while (dealIds.length < 6){ const id = crateRoll(r); if (!dealIds.includes(id)) dealIds.push(id); } } return dealIds; }
const priceOf = id => Math.round(CARDS[id].price * (deals().includes(id) ? DEAL : 1) / 10) * 10;
/* a card arrives: new at level 1, or one level up if you already have it, or coins if it is maxed */
function grant(id){
  const L = lvl(id);
  if (!L){ P.cards[id] = 1; return 'New card'; }
  if (L < MAX_LVL){ P.cards[id] = L + 1; return `Already yours, so it goes up to level ${L + 1}`; }
  const c = Math.round(CARDS[id].price * .2); P.coins += c; return `Already maxed, so you get ${fmt(c)} coins instead`;
}
$('crateBuy').onclick = () => {
  if (P.coins < CRATE) return;
  P.coins -= CRATE; const id = crateRoll(), line = grant(id); save();
  reveal('Mystery crate', id, `${RAR[CARDS[id].rar].name}. ${line}.`, () => { dlgClose(); hub(); });
};
function reveal(title, id, line, done){
  const b = dlg(`<div class="k-eyebrow">${esc(title)}</div><div class="big-card spin" id="rv"></div><h3 id="rvN">&nbsp;</h3><p id="rvL">&nbsp;</p><div class="k-row"><button type="button" class="k-btn primary" id="rvOk" disabled>Nice</button></div>`, {lock:true});
  const slot = b.querySelector('#rv'); let n = 0;
  const iv = setInterval(() => {
    const fin = ++n >= 11; slot.innerHTML = ''; slot.appendChild(cardEl(fin ? id : pick(CARD_IDS), {div:true, now:fin}));
    if (fin){ clearInterval(iv); slot.classList.remove('spin'); b.querySelector('#rvN').textContent = CARDS[id].name; b.querySelector('#rvL').textContent = line; b.querySelector('#rvOk').disabled = false; CARDS[id].rar === 'l' ? SND.legend() : CARDS[id].rar === 'c' ? BDB.sfx.good() : BDB.sfx.big(); } else BDB.sfx.tick();
  }, BDB.reduced ? 20 : 110);
  b.querySelector('#rvOk').onclick = done;
}

/* ---------- sign in ---------- */
function show(scr){ for (const s of ['scrLogin', 'scrHub', 'scrBattle']) $(s).hidden = s !== scr; }
function loginScreen(){
  show('scrLogin'); P = null;
  const w = $('whoList'); w.innerHTML = '';
  for (const p of Accounts.all()){ const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<span>${esc(p.name)}</span><small>${fmt(p.coins)} coins · ${Object.keys(p.cards).length} cards</small>`; b.onclick = () => signIn(p); w.appendChild(b); }
  $('loginErr').textContent = '';
}
function signIn(p){ P = p; Accounts.save(P); show('scrHub'); tab('Battle'); const j = Q.get('join'); if (j && okCode(j) && !signIn.joined){ signIn.joined = true; joinFriend(j); } }
$('newGo').onclick = () => {
  const n = Accounts.cleanName($('newName').value);
  if (n.length < 2){ $('loginErr').textContent = 'Pick a name with at least two letters.'; return; }
  signIn(Accounts.get(n) || fresh(n));
};
$('newName').addEventListener('keydown', e => { if (e.key === 'Enter') $('newGo').click(); });
$('codeToggle').onclick = () => { $('codeBox').hidden = !$('codeBox').hidden; };
$('codeGo').onclick = () => { try { signIn(Accounts.fromCode($('codeIn').value)); } catch(e){ $('loginErr').textContent = e.message; } };
$('codeCopy').onclick = async () => { try { await navigator.clipboard.writeText($('codeOut').value); $('codeCopy').textContent = 'Copied'; } catch(e){ $('codeOut').select(); } setTimeout(() => { $('codeCopy').textContent = 'Copy code'; }, 1500); };
$('signOut').onclick = () => { Accounts.signOut(); loginScreen(); };
$('wipe').onclick = () => confirmBox('Delete this player?', `${P.name}'s cards, coins and decks will be gone from this device.`, 'Delete', () => { Accounts.remove(P.name); loginScreen(); });
$('mute').onclick = () => { $('mute').textContent = BDB.sfx.toggle() ? 'Sound off' : 'Sound on'; };
$('mute').textContent = BDB.sfx.muted ? 'Sound off' : 'Sound on';

/* ---------- before a CPU match: the draw for which of his cards is up for grabs ---------- */
function preCpu(i){
  const cpu = CPUS[i], prize = weightedPick(cpu.deck, id => DRAW_W[CARDS[id].rar]), map = MAPS[cpu.map];
  const b = dlg(`<div class="k-eyebrow">${esc(map.name)} · ${esc(map.blurb)}</div>
    <div class="vs"><div class="side"><div class="av me">${esc(P.name[0].toUpperCase())}</div>${esc(P.name)}</div><div class="mid">VS</div><div class="side"><div class="av"></div>${esc(cpu.name)}</div></div>
    <div class="k-label">Up for grabs</div><div class="big-card spin" id="vsPrize" style="width:112px"></div>
    <p class="note" id="vsLine">Drawing one of his cards.</p>
    <div class="k-row"><button type="button" class="k-btn primary big" id="vsGo">Start</button><button type="button" class="k-btn" id="vsNo">Back</button></div>`);
  const slot = b.querySelector('#vsPrize'); let n = 0;
  const iv = setInterval(() => { const fin = ++n >= 10; slot.innerHTML = ''; slot.appendChild(cardEl(fin ? prize : pick(cpu.deck), {div:true, now:fin})); if (fin){ clearInterval(iv); slot.classList.remove('spin'); BDB.sfx.pop(); const l = b.querySelector('#vsLine'); if (l) l.textContent = `Beat him and ${CARDS[prize].name} is yours. Lose and you keep everything.`; } else BDB.sfx.tick(); }, BDB.reduced ? 10 : 110);
  b.querySelector('#vsNo').onclick = () => { clearInterval(iv); dlgClose(); };
  b.querySelector('#vsGo').onclick = () => { clearInterval(iv); dlgClose(); begin({mode:'cpu', cpu, idx:i, prize, map:cpu.map, oppName:cpu.name}); };
}

/* ---------- the match ---------- */
let B = null, raf = 0, lastT = 0, ticker = null;
function begin(o){
  B = {...o, team:o.mode === 'guest' && !o.coop ? 1 : 0, me:o.mode === 'guest' ? 1 : 0, sel:-1, over:false, run:false, acc:0, ents:[], prev:new Map(), netEv:[], handKey:'', info:null, said:{}, pz:null, pzUsed:[false, false]};
  show('scrBattle'); $('emoPanel').hidden = true; $('btPause').disabled = false;
  $('oppName').textContent = o.oppName; $('meName').textContent = P.name; $('meDot').textContent = P.name[0].toUpperCase();
  $('oppDot').style.cssText = o.mode === 'cpu' ? '' : 'background:#5a1320;display:grid;place-items:center;font:800 11px/1 var(--f-body)'; $('oppDot').textContent = o.mode === 'cpu' ? '' : o.oppName[0].toUpperCase();
  if (V) V.reset(B.team, o.map);
  if (o.coop && o.mode === 'host'){                       // 2v2: you and a friend against two BDBs
    const [a, b] = o.cpus, dk = c => c.deck.map(id => ({id, lvl:c.lvl}));
    B.sim = createSim({map:o.map, decks:[myDeck(), o.oppDeck, dk(a), dk(b)], seed:(Math.random() * 2 ** 31) | 0, elMul:[1, 1, a.ai.el * .85, b.ai.el * .85], towerLvl:[myTower(), a.lvl]});
    B.ais = [createAI(B.sim, 1, a.ai, Math.random, 2), createAI(B.sim, 1, b.ai, Math.random, 3)];
  } else if (o.mode !== 'guest'){
    const oppDeck = o.mode === 'cpu' ? o.cpu.deck.map(id => ({id, lvl:o.cpu.lvl})) : o.oppDeck;
    B.sim = createSim({map:o.map, decks:[myDeck(), oppDeck], seed:(Math.random() * 2 ** 31) | 0, elMul:[1, o.mode === 'cpu' ? o.cpu.ai.el : 1], towerLvl:[myTower(), o.mode === 'cpu' ? o.cpu.lvl : o.oppTower]});
    if (o.mode === 'cpu') B.ai = createAI(B.sim, 1, o.cpu.ai);
  }
  hud(true);
  const w = $('wait'); w.hidden = false; let n = 3;
  const cd = () => { if (!B) return; if (n > 0){ w.innerHTML = `<div>${esc(MAPS[o.map].name)}<b>${n}</b></div>`; BDB.sfx.tick(); n--; setTimeout(cd, Q.get('fast') ? 60 : 800); } else { w.hidden = true; B.run = true; B.t0 = performance.now(); SND.horn(); talk(o.mode === 'cpu' ? TALK.start : o.coop ? [`Two of you? Fine. There are two of me. You're teamed with ${o.mate}.`] : ["Two real players. BDB is watching from the break room."], true); if (o.mode === 'host') startTicker(); } };
  cd();
  cancelAnimationFrame(raf); lastT = performance.now(); raf = requestAnimationFrame(loop);
}
function startTicker(){ try { ticker = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),100)'], {type:'text/javascript'}))); ticker.onmessage = () => { if (document.hidden) hostPump(); }; } catch(e){} }
function hostPump(){
  if (!B || B.mode !== 'host' || !B.run) return;
  const target = Math.floor((performance.now() - B.t0) / 50); let n = 0;
  while (B.sim.tick < target && n++ < 60 && !B.simDone){
    if (B.ais) for (const a of B.ais) a.tick();
    B.sim.step(); pump();
    if (B.sim.tick % 2 === 0 || B.sim.over){ room && room.send('s', {s:B.sim.encode(1), ev:B.netEv}, OL && OL.opp); B.netEv = []; }
    if (B.sim.over) B.simDone = true;
  }
}
function pump(){ const ev = B.sim.drain(); if (!ev.length) return; if (V) V.events(ev); if (B.mode === 'host') B.netEv.push(...ev); onEvents(ev); }
function loop(now){
  if (!B) return;
  const dt = Math.min(.1, (now - lastT) / 1000); lastT = now;
  if (B.run && !B.over){
    if (B.mode === 'cpu'){ B.acc += dt; let n = 0; while (B.acc >= DT && n++ < 6 && !B.sim.over){ B.ai.tick(); B.sim.step(); B.acc -= DT; pump(); } if (n >= 6) B.acc = 0; }
    else if (B.mode === 'host') hostPump();
  }
  if (V) V.frame(B.pz || (B.mode === 'cpu' && !B.run) ? 0 : dt, B.mode === 'guest' ? B.ents : B.sim.ents);
  hud();
  raf = requestAnimationFrame(loop);
}
function stamp(text, bad){ const d = document.createElement('div'); d.className = 'stamp' + (bad ? ' bad' : ''); d.textContent = text; $('scrBattle').appendChild(d); setTimeout(() => d.remove(), 1600); }
function onEvents(ev){
  for (const e of ev){
    if (e.e === 'tower'){
      const mine = e.team === B.team; SND.boom();
      if (!e.king){ stamp(mine ? 'Tower down' : 'Crown!', mine); if (!mine) BDB.sfx.big(); talk(B.mode === 'cpu' ? (mine ? TALK.heScores : TALK.youScore) : (mine ? TALK.pvpDown : TALK.pvpUp), true); if (B.mode === 'cpu' && Math.random() < .6) setTimeout(() => showEmote(mine ? pick([0, 2, 3]) : pick([1, 4]), false), 900); }
    } else if (e.e === 'king'){ if (e.team !== B.team && B.mode === 'cpu') talk(TALK.king); }
    else if (e.e === 'ot'){ stamp('Overtime'); SND.horn(); if (B.mode === 'cpu') talk(TALK.ot, true); }
    else if (e.e === 'drop' || e.e === 'spell'){
      if (e.rar === 'l' && CARDS[e.id]){ SND.legend(); const d = document.createElement('div'); d.className = 'legend-banner'; d.innerHTML = `<small>Legendary</small><b>${esc(CARDS[e.id].name)}</b>`; $('scrBattle').appendChild(d); setTimeout(() => d.remove(), 2000); if (e.team !== B.team && B.mode === 'cpu') talk(TALK.legend); }
      else e.e === 'drop' ? SND.drop() : SND.spell();
    } else if (e.e === 'boom' && e.k !== 'rage') SND.boom();
    else if (e.e === 'over' && !B.over){ B.over = true; if (V){ V.setGhost(false); V.setNoGo(false); } const w = e.w, cr = e.cr; setTimeout(() => finish(w, cr), Q.get('fast') ? 50 : 1700); }
  }
}
const info = () => { if (B.mode === 'guest') return B.info; const s = B.sim, p = s.players[B.team]; return {el:p.el, hand:p.hand, next:p.next, left:s.left, phase:s.phase, crowns:s.crowns, pocket:s.pocket(B.team), bonus:p.idle > PATIENT}; };
function hud(force){
  const I = info(); if (!I) return;
  const key = I.hand.map(c => c.id).join() + '|' + I.next.id;
  if (force || key !== B.handKey){
    B.handKey = key;
    const hd = $('hand'); hd.innerHTML = ''; I.hand.forEach((c, i) => { const el = cardEl(c.id, {lvl:c.lvl, now:true}); el.dataset.slot = i; if (i === B.sel) el.classList.add('sel'); hd.appendChild(el); });
    const nx = $('nextCard'); nx.innerHTML = ''; nx.appendChild(cardEl(I.next.id, {div:true, now:true}));
  }
  const cs = $('hand').children; for (let i = 0; i < cs.length; i++) cs[i].classList.toggle('poor', CARDS[I.hand[i].id].cost > I.el);
  $('coffeeFill').style.width = (I.el / MAX_EL * 100) + '%'; $('coffeeN').textContent = Math.floor(I.el);
  const dbl = I.phase === 'ot' || I.left <= DOUBLE_AT, bonus = I.bonus && I.el < MAX_EL;
  $('coffee').classList.toggle('dbl', dbl); $('coffee').classList.toggle('bonus', !!bonus); $('coffeeLbl').textContent = (dbl ? 'Mana x2' : 'Mana') + (bonus ? ' · charging +30%' : '');
  if (dbl && !B.said.dbl && I.phase === 'play' && B.run){ B.said.dbl = true; stamp('Double Mana'); if (B.mode === 'cpu') talk(TALK.late, true); }
  const t = Math.ceil(I.left); $('clockT').textContent = mmss(t);
  $('clockLbl').textContent = I.phase === 'ot' ? 'Overtime' : 'Time left'; $('clock').classList.toggle('hot', I.phase === 'ot' || t <= 30);
  $('meCr').textContent = I.crowns[B.team]; $('oppCr').textContent = I.crowns[1 - B.team];
  if (B.run && !B.over && B.mode === 'cpu' && performance.now() - lastTalk > 38000){ lastTalk = performance.now(); BDB.roast(); }
}

/* ---------- playing cards: drag from the hand, or tap a card then tap the floor ---------- */
let aim = null;
function select(i){
  B.sel = i; for (const c of $('hand').children) c.classList.toggle('sel', +c.dataset.slot === i);
  const I = info(); if (V){ V.setNoGo(i >= 0 && CARDS[I.hand[i].id].type !== 'spell', I.pocket); if (i < 0) V.setGhost(false); }
}
function ghostAt(cx, cy){
  const I = info(); if (!V || B.sel < 0 || !I) return null;
  const p = V.pick(cx, cy), c = CARDS[I.hand[B.sel].id];
  if (!p){ V.setGhost(false); return null; }
  const ok = canPlace(MAPS[B.map], B.team, c, p.x, p.z, I.pocket) && I.el >= c.cost;
  V.setGhost(true, p.x, p.z, c.spell ? c.spell.r : Math.max(.7, c.U.r * (c.n > 1 ? 2 : 1.2)), ok, c.spell ? null : c.U.key, c.aff);
  return p;
}
function tryPlay(slot, p){
  if (!B || !B.run || B.over || B.pz || slot < 0 || !p) return false;
  const I = info(), c = I.hand[slot];
  let ok;
  if (B.mode === 'guest'){ ok = I.el >= CARDS[c.id].cost && canPlace(MAPS[B.map], B.team, CARDS[c.id], p.x, p.z, I.pocket); if (ok) room.send('p', {slot, id:c.id, x:Math.round(p.x * 100) / 100, z:Math.round(p.z * 100) / 100}, OL.opp); }
  else ok = B.sim.play(B.team, slot, p.x, p.z);
  if (!ok){ BDB.sfx.bad(); const el = $('hand').children[slot]; if (el){ el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); } return false; }
  select(-1); return true;
}
const overArena = (x, y) => { const r = $('arena').getBoundingClientRect(); return y < r.bottom && y > r.top && x > r.left && x < r.right; };
$('hand').addEventListener('pointerdown', e => {
  const c = e.target.closest('.card'); if (!c || !B || B.over || e.button === 2) return;
  const i = +c.dataset.slot; e.preventDefault();
  if (B.sel === i && !aim){ select(-1); return; }
  select(i); BDB.sfx.tick();
  aim = {pid:e.pointerId, x:e.clientX, y:e.clientY, moved:false, card:c, id:c.dataset.id, lx:e.clientX, tilt:0};
  try { c.setPointerCapture(e.pointerId); } catch(er){}
});
addEventListener('pointermove', e => {
  if (!aim || e.pointerId !== aim.pid || !B) return;
  if (!aim.moved && Math.hypot(e.clientX - aim.x, e.clientY - aim.y) > 12){              // the card lifts out of the tray and follows your finger
    aim.moved = true; aim.el = cardEl(aim.id, {div:true, now:true}); aim.el.classList.add('dragcard'); document.body.appendChild(aim.el); aim.card.classList.add('lifting');
  }
  if (!aim.moved) return;
  const over = overArena(e.clientX, e.clientY);
  aim.tilt += (Math.max(-16, Math.min(16, (e.clientX - aim.lx) * 1.6)) - aim.tilt) * .35; aim.lx = e.clientX;
  aim.el.style.transform = `translate(${e.clientX - 44}px, ${e.clientY - (over ? 150 : 128)}px) rotate(${aim.tilt.toFixed(1)}deg) scale(${over ? .55 : 1.12})`;
  aim.el.classList.toggle('over', over);
  if (over) aim.p = ghostAt(e.clientX, e.clientY); else { aim.p = null; if (V) V.setGhost(false); }
});
const endAim = e => { if (!aim || e.pointerId !== aim.pid) return; const a = aim; aim = null; if (a.el){ a.el.classList.add('gone'); setTimeout(() => a.el.remove(), 160); } a.card.classList.remove('lifting'); if (!B) return; if (a.moved){ if (a.p && overArena(e.clientX, e.clientY) && e.type === 'pointerup') tryPlay(B.sel, a.p); else if (V) V.setGhost(false); } };
addEventListener('pointerup', endAim); addEventListener('pointercancel', endAim);
let floorAim = false;
$('arena').addEventListener('pointerdown', e => { if (!B || B.sel < 0 || aim) return; floorAim = true; ghostAt(e.clientX, e.clientY); });
$('arena').addEventListener('pointermove', e => { if (floorAim) ghostAt(e.clientX, e.clientY); });
$('arena').addEventListener('pointerup', e => { if (!floorAim) return; floorAim = false; const p = ghostAt(e.clientX, e.clientY); if (!tryPlay(B.sel, p) && V) V.setGhost(false); });
addEventListener('keydown', e => { if (!B || $('scrBattle').hidden) return; if (e.key >= '1' && e.key <= String(HAND)) select(B.sel === +e.key - 1 ? -1 : +e.key - 1); else if (e.key === 'Escape') select(-1); });
new ResizeObserver(() => { if (V && !$('scrBattle').hidden) V.resize(); }).observe($('arena'));
$('btQuit').onclick = () => { if (!B || B.over) return; confirmBox('Walk off the court?', 'Quitting counts as a loss.', 'Quit match', () => { if (!B || B.over) return; B.over = true; if (B.mode !== 'cpu' && room) room.send('bye', {}, OL && OL.opp); finish(1 - B.team, null, 'You walked off.'); }); };

/* ---------- emotes and quick chat ---------- */
$('emoPanel').innerHTML = `<div class="em">${EMO.map((e, i) => `<button type="button" data-i="${i}">${e}</button>`).join('')}</div>${CHAT.map((c, i) => `<button type="button" data-i="${i + EMO.length}">${esc(c)}</button>`).join('')}`;
$('btEmo').onclick = () => { $('emoPanel').hidden = !$('emoPanel').hidden; };
let emoAt = 0;
$('emoPanel').onclick = e => {
  const b = e.target.closest('button'); if (!b || !B) return;
  $('emoPanel').hidden = true;
  if (performance.now() - emoAt < 1500) return; emoAt = performance.now();
  const i = +b.dataset.i; showEmote(i, true);
  if (B.mode === 'cpu'){ if (Math.random() < .7) setTimeout(() => { if (B && !B.done){ showEmote(pick([0, 2, 4, EMO.length + 2, EMO.length + 3, EMO.length + 5]), false); talk(TALK.emo); } }, 900 + Math.random() * 900); }
  else if (room) room.send('em', {i}, OL && OL.opp);
};
function showEmote(i, mine){
  if (!Number.isInteger(i) || i < 0 || i >= EMO.length + CHAT.length || $('scrBattle').hidden) return;
  for (const o of document.querySelectorAll('.emote.' + (mine ? 'mine' : 'opp'))) o.remove();
  const d = document.createElement('div'); d.className = 'emote ' + (mine ? 'mine' : 'opp') + (i < EMO.length ? ' big' : ''); d.textContent = i < EMO.length ? EMO[i] : CHAT[i - EMO.length];
  $('scrBattle').appendChild(d); BDB.sfx.pop(); setTimeout(() => d.remove(), 2600);
}

/* ---------- pause. vs BDB: any time. Online: one 5 minute pause each, 5 more if the other player agrees ---------- */
let pzIv = 0;
$('btPause').onclick = () => {
  if (!B || B.over || B.done) return;
  if (B.mode === 'cpu'){ if (!B.run) return; B.run = false; B.pz = {by:B.team, left:0, ask:0, solo:true}; pzUI(); }
  else if (B.mode === 'host') pzDo('pause', 0); else room.send('pq', {a:'pause'}, OL.opp);
};
function pzDo(a, team){                        // host only: the one place pause state changes
  if (!B || B.mode !== 'host' || B.done) return;
  const z = B.pz;
  if (a === 'pause'){ if (z || B.pzUsed[team] || !B.run || B.over) return; B.pzUsed[team] = true; B.pz = {by:team, left:PAUSE_S, ask:0}; B.run = false; clearInterval(pzIv); pzIv = setInterval(() => { if (!B || !B.pz) return clearInterval(pzIv); if (--B.pz.left <= 0) pzDo('resume', B.pz.by); else pzSend(); }, 1000); }
  else if (!z) return;
  else if (a === 'resume'){ if (team !== z.by) return; clearInterval(pzIv); B.pz = null; B.t0 = performance.now() - B.sim.tick * 50; B.run = true; }
  else if (a === 'ext'){ if (team !== z.by || z.ask) return; z.ask = 1; }
  else if (a === 'yes' || a === 'no'){ if (team === z.by || z.ask !== 1) return; if (a === 'yes'){ z.left += PAUSE_S; z.ask = 0; } else z.ask = 2; }
  pzSend();
}
function pzSend(){ if (room) room.send('pz', B.pz ? {on:1, by:B.pz.by, left:B.pz.left, ask:B.pz.ask} : {on:0}, OL && OL.opp); pzUI(); }
function pzAct(a){ if (B.mode === 'host') pzDo(a, 0); else if (room) room.send('pq', {a}, OL.opp); }
function pzUI(){
  const w = $('wait'), z = B && B.pz;
  if (!z){ if (B && B.run) w.hidden = true; $('btPause').disabled = !!(B && B.mode !== 'cpu' && B.pzUsed[B.me]); return; }
  const mine = z.by === B.me; w.hidden = false;
  if (z.solo){ w.innerHTML = `<div><b>Paused</b><div class="k-row" style="margin-top:14px"><button type="button" class="k-btn primary" id="pzR">Resume</button></div></div>`; w.querySelector('#pzR').onclick = () => { B.pz = null; B.run = true; w.hidden = true; }; return; }
  w.innerHTML = `<div>${mine ? 'You paused the match' : esc(B.oppName) + ' paused the match'}<b>${mmss(z.left)}</b>
    ${mine ? `<div class="k-row" style="margin-top:14px"><button type="button" class="k-btn primary" data-a="resume">Resume</button><button type="button" class="k-btn" data-a="ext" ${z.ask ? 'disabled' : ''}>${z.ask === 1 ? 'Asked for 5 more' : z.ask === 2 ? 'They said no' : 'Ask for 5 more minutes'}</button></div>`
      : z.ask === 1 ? `<div style="margin-top:10px">They are asking for 5 more minutes.</div><div class="k-row" style="margin-top:10px"><button type="button" class="k-btn primary" data-a="yes">Give 5 more</button><button type="button" class="k-btn" data-a="no">No</button></div>` : '<div class="note" style="margin-top:10px">The match picks up where it stopped. Each player gets one pause.</div>'}</div>`;
  for (const b of w.querySelectorAll('button')) b.onclick = () => pzAct(b.dataset.a);
  if (mine) B.pzUsed[B.me] = true;
}

/* ---------- after the match ---------- */
function finish(w, cr, note){
  if (!B || B.done) return; B.done = true; B.over = true; clearInterval(pzIv); B.pz = null; $('wait').hidden = true;
  const I = info(), crowns = cr || (I ? I.crowns : [0, 0]), mine = crowns[B.team], win = w === B.team, draw = w < 0;
  let coins = 0, lines = [], prize = '', title = win ? 'Victory' : draw ? 'Draw' : 'Defeat';
  if (B.mode === 'cpu'){
    const c = B.cpu, first = !P.beaten[c.id];
    if (win){
      coins = (first ? c.coins : c.coins / 2) + mine * 10; P.stats.w++; P.beaten[c.id] = (P.beaten[c.id] || 0) + 1;
      lines.push(first ? `First win over ${c.name}.` : `Another win over ${c.name}.`);
      if (B.idx === P.ladder && P.ladder < CPUS.length){ P.ladder++; lines.push(P.ladder < CPUS.length ? `${CPUS[P.ladder].name} is unlocked.` : 'That was the last BDB. The ladder is yours.'); }
      prize = B.prize; P.stats.won++; lines.push(`You took his ${CARDS[prize].name}. ${grant(prize)}.`);
    } else if (draw){ coins = 30 + mine * 10; P.stats.d++; } else { coins = 15 + mine * 10; P.stats.l++; lines.push('You keep all your cards.'); }
  } else {
    if (B.coop){ coins = win ? 120 : draw ? 50 : 30; lines.push(win ? 'You and your friend beat two BDBs.' : draw ? 'Nobody blinked.' : 'Two BDBs were too many this time.'); }
    else if (win){ coins = 150; P.trophies += 30; P.stats.ow++; lines.push('+30 trophies'); } else if (draw){ coins = 50; } else { coins = 25; P.trophies = Math.max(0, P.trophies - 20); P.stats.ol++; lines.push('-20 trophies'); }
    endOnline();
  }
  if (note) lines.unshift(note);
  P.coins += Math.round(coins); save();
  win ? BDB.sfx.big() : BDB.sfx.bad();
  const line = B.mode === 'cpu' ? pick(win ? TALK.win : draw ? ["A draw. We'll both tell people we won."] : TALK.lose) : (win ? 'BDB watched the whole thing and learned nothing.' : 'BDB says he could have won that one. He could not.');
  const b = dlg(`<div class="bigav"></div><div class="k-eyebrow">${crowns[B.team]} crowns to ${crowns[1 - B.team]}</div><h3>${title}</h3><p>“${esc(line)}”</p>
    ${prize ? '<div class="big-card" id="rsCard" style="width:104px"></div>' : ''}
    <div class="k-jumbo k-stats"><div class="cell"><small>Coins</small><b>+${fmt(coins)}</b></div><div class="cell"><small>Total</small><b>${fmt(P.coins)}</b></div></div>
    <p class="note">${lines.map(esc).join(' ')}</p>
    <div class="k-row">${B.mode === 'cpu' ? `<button type="button" class="k-btn primary" id="rsAgain">${win && B.idx + 1 < CPUS.length && B.idx + 1 <= P.ladder ? 'Next BDB' : 'Rematch'}</button>` : ''}<button type="button" class="k-btn${B.mode === 'cpu' ? '' : ' primary'}" id="rsBack">Back to menu</button></div>`, {lock:true});
  if (prize) b.querySelector('#rsCard').appendChild(cardEl(prize, {div:true, lvl:lvl(prize), now:true}));
  const idx = B.idx, nextIdx = win && idx + 1 < CPUS.length && idx + 1 <= P.ladder ? idx + 1 : idx, wasCpu = B.mode === 'cpu';
  const leave = () => { dlgClose(); stopBattle(); show('scrHub'); hub(); };
  b.querySelector('#rsBack').onclick = leave;
  if (wasCpu) b.querySelector('#rsAgain').onclick = () => { leave(); preCpu(nextIdx); };
}
function stopBattle(){ cancelAnimationFrame(raf); clearInterval(pzIv); if (ticker){ ticker.terminate(); ticker = null; } B = null; aim = null; floorAim = false; $('wait').hidden = true; for (const e of document.querySelectorAll('.emote,.stamp,.legend-banner')) e.remove(); }

/* ---------- online ---------- */
let net = null, lobby = null, room = null, OL = null;
async function netUp(){ if (!net) net = await openTransport(Q.get('net') === 'local'); return net; }
function endOnline(){ const r = room, l = lobby; room = lobby = null; if (OL){ clearInterval(OL.iv); clearInterval(OL.hiIv); clearTimeout(OL.pt); clearTimeout(OL.to); } OL = null; setTimeout(() => { try { r && r.leave(); } catch(e){} try { l && l.leave(); } catch(e){} }, 400); }
function waitBox(title, text, extra = ''){ const b = dlg(`<div class="k-eyebrow">Online 1v1</div><h3>${esc(title)}</h3><p id="olText">${esc(text)}</p>${extra}<div class="k-row"><button type="button" class="k-btn" id="olX">Cancel</button></div>`, {lock:true}); b.querySelector('#olX').onclick = () => { endOnline(); dlgClose(); }; return b; }
const netFail = () => { endOnline(); msgBox('No connection', 'Could not reach the matchmaking relays. Check your internet and try again.'); };
$('olQuick').onclick = async () => {
  waitBox('Looking for a player', 'Waiting for someone else to hit Quick match. Send a friend the link to this page to speed it up.');
  try { await netUp(); } catch(e){ return netFail(); }
  if ($('dlg').hidden) return;
  lobby = net.join('brawl-lobby'); OL = {state:'look', pending:null};
  const hello = to => lobby && lobby.send('look', {n:P.name}, to);
  lobby.onJoin(id => hello(id)); OL.iv = setInterval(() => hello(), 2500); hello();
  lobby.onMessage((t, d, from) => {
    if (!OL || OL.state !== 'look' || !d) return;
    if (t === 'look' && !OL.pending && net.selfId < from){ OL.pending = from; OL.code = rid(8); lobby.send('pair', {c:OL.code}, from); OL.pt = setTimeout(() => { if (OL) OL.pending = null; }, 5000); }
    else if (t === 'pair' && !OL.pending && okCode(d.c)){ lobby.send('ok', {c:d.c}, from); enterMatch(d.c, false); }
    else if (t === 'ok' && OL.pending === from && d.c === OL.code) enterMatch(OL.code, true);
  });
};
$('olFriend').onclick = () => {
  const b = dlg(`<div class="k-eyebrow">Online 1v1</div><h3>Play a friend</h3><p>Start a match and send your friend the code, or type in the code they sent you. In 2v2 you share a side and take on two BDBs together.</p>
    <div class="k-row"><button type="button" class="k-btn primary" id="frNew">Start 1v1</button><button type="button" class="k-btn primary" id="frCo">Start 2v2 vs BDBs</button></div>
    <div class="rowx" style="width:100%"><input class="field" id="frCode" maxlength="12" placeholder="Friend's code" autocomplete="off" autocapitalize="off" spellcheck="false"><button type="button" class="k-btn" id="frJoin">Join</button></div><div class="err" id="frErr"></div>
    <div class="k-row"><button type="button" class="k-btn" id="frX">Close</button></div>`);
  b.querySelector('#frX').onclick = dlgClose;
  const startFr = async coop => {
    const code = rid(5), url = location.origin + location.pathname + '?join=' + code;
    const w = waitBox('Waiting for your friend', 'Send them this code, or the link.', `<div class="codebox">${code.toUpperCase()}</div><div class="k-row"><button type="button" class="k-btn" id="frCopy">Copy link</button></div>`);
    w.querySelector('#frCopy').onclick = async () => { try { await navigator.clipboard.writeText(url); w.querySelector('#frCopy').textContent = 'Copied'; } catch(e){ prompt('Copy this link', url); } };
    try { await netUp(); } catch(e){ return netFail(); }
    if (!$('dlg').hidden) enterMatch(code, true, true, coop);
  };
  b.querySelector('#frNew').onclick = () => startFr(false); b.querySelector('#frCo').onclick = () => startFr(true);
  b.querySelector('#frJoin').onclick = () => { const c = b.querySelector('#frCode').value.trim().toLowerCase(); if (!okCode(c)){ b.querySelector('#frErr').textContent = 'That code does not look right.'; return; } joinFriend(c); };
};
async function joinFriend(code){
  waitBox('Joining the match', 'Connecting to your friend.');
  try { await netUp(); } catch(e){ return netFail(); }
  if ($('dlg').hidden) return;
  enterMatch(code, false, true);
  OL.to = setTimeout(() => { if (OL && !OL.opp){ endOnline(); msgBox('Nobody there', 'No match was found with that code. Ask your friend to start a new one.'); } }, 30000);
}
function okDeck(d){ return Array.isArray(d) && d.every(c => c && typeof c.id === 'string') && !deckProblem(d.map(c => c.id)) && d.every(c => Number.isInteger(c.lvl) && c.lvl >= 1 && c.lvl <= MAX_LVL); }
function enterMatch(code, host, keepBox, coop){
  if (lobby){ clearInterval(OL && OL.iv); const l = lobby; lobby = null; setTimeout(() => { try { l.leave(); } catch(e){} }, 300); }
  if (OL) clearTimeout(OL.pt);
  OL = {state:'wait', code, host, opp:null, coop:!!coop};
  room = net.join('brawl-m-' + code);
  if (!keepBox){ const t = $('olText'); if (t) t.textContent = 'Found someone. Setting up the match.'; }
  const hi = to => room && room.send('hi', {n:P.name, d:myDeck(), tw:myTower()}, to);
  room.onJoin(id => hi(id)); hi(); OL.hiIv = setInterval(() => { if (OL && !OL.opp) hi(); }, 1500);
  room.onLeave(id => { if (OL && id === OL.opp) oppLeft(); });
  room.onMessage((t, d, from) => {
    if (!OL || !d || typeof d !== 'object') return;
    if (t === 'hi'){
      if (!OL.host || OL.opp || !okDeck(d.d)) return;
      OL.opp = from; clearInterval(OL.hiIv);
      const map = pick(MAP_IDS), name = clean(d.n, 20) || 'Player';
      room.send('go', {map, n:P.name, co:OL.coop ? 1 : 0}, from); dlgClose();
      const ci = Math.min(P.ladder, CPUS.length - 1);
      begin({mode:'host', map, coop:OL.coop, cpus:[CPUS[ci], CPUS[Math.max(0, ci - 1)]], mate:name, oppName:OL.coop ? 'Two BDBs' : name, oppDeck:d.d.map(c => ({id:c.id, lvl:c.lvl})), oppTower:Number.isInteger(d.tw) ? Math.max(1, Math.min(MAX_LVL, d.tw)) : 1});
    } else if (t === 'go'){
      if (OL.host || OL.opp || !MAPS[d.map]) return;
      OL.opp = from; clearInterval(OL.hiIv); clearTimeout(OL.to); dlgClose();
      begin({mode:'guest', map:d.map, coop:!!d.co, mate:clean(d.n, 20) || 'Player', oppName:d.co ? 'Two BDBs' : clean(d.n, 20) || 'Player'});
    } else if (from !== OL.opp || !B) return;
    else if (t === 's' && B.mode === 'guest') snap(d);
    else if (t === 'p' && B.mode === 'host'){ const s = d.slot, h = B.sim.players[1].hand; if (B.run && Number.isInteger(s) && s >= 0 && s < HAND && h[s] && h[s].id === d.id && Number.isFinite(d.x) && Number.isFinite(d.z)) B.sim.play(1, s, d.x, d.z); }
    else if (t === 'em') showEmote(d.i, false);
    else if (t === 'pq' && B.mode === 'host'){ if (['pause', 'resume', 'ext', 'yes', 'no'].includes(d.a)) pzDo(d.a, 1); }
    else if (t === 'pz' && B.mode === 'guest'){ B.pz = d.on ? {by:d.by === 1 ? 1 : 0, left:Math.max(0, Math.min(3600, +d.left || 0)), ask:[0, 1, 2].includes(d.ask) ? d.ask : 0} : null; if (!B.pz) $('wait').hidden = true; pzUI(); }
    else if (t === 'bye') oppLeft();
  });
}
function snap(d){
  const s = d.s; if (!s || !Array.isArray(s.e) || !Array.isArray(s.h) || !B || B.done) return;
  const ok = id => CARDS[id] ? id : CARD_IDS[0];
  B.ents = decodeEnts(s.e, B.prev); B.prev = new Map(B.ents.map(e => [e.id, e]));
  B.info = {el:+s.el || 0, hand:s.h.slice(0, HAND).map((id, i) => ({id:ok(id), lvl:(s.hl && s.hl[i]) || 1})), next:{id:ok(s.n)}, left:+s.l || 0, phase:s.ph === 'ot' ? 'ot' : s.ph === 'over' ? 'over' : 'play', crowns:Array.isArray(s.cr) ? s.cr : [0, 0], pocket:Array.isArray(s.pk) ? s.pk : [false, false], bonus:!!s.bo};
  if (Array.isArray(d.ev) && d.ev.length){ if (V) V.events(d.ev); onEvents(d.ev); }
}
function oppLeft(){ if (!B || B.done) return; B.over = true; if (B.coop) finish(-1, null, 'Your teammate left the match.'); else finish(B.team, null, 'Your opponent left the match.'); }

/* right-click (or long-press on Android) any card for what it does and its stats */
addEventListener('contextmenu', e => { const c = e.target.closest && e.target.closest('.card[data-id]'); if (!c) return; e.preventDefault(); sheet(c.dataset.id); });

/* ---------- start ---------- */
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('sheet').hidden) $('sheet').hidden = true; });
listUI('own', () => Object.keys(P.cards), 'Your cards');
listUI('shop', () => CARD_IDS, 'All cards');
window.__game = {
  get state(){ return B ? (B.done ? 'done' : B.over ? 'over' : B.pz ? 'paused' : B.run ? 'play' : 'wait') : P ? 'hub' : 'login'; }, get score(){ return P ? P.coins : 0; },
  get P(){ return P; }, get B(){ return B; }, get sim(){ return B && B.sim; }, get info(){ return B ? info() : null; }, get ready3d(){ return ready3d; }, get view(){ return V; }, get ol(){ return OL; }, get thumbsLeft(){ return tq.length; },
  play:(slot, x, z) => tryPlay(slot, {x, z}), give(n){ P.coins += n; save(); hub(); }, card(id, l = 1){ P.cards[id] = l; save(); hub(); }, unlock(){ P.ladder = CPUS.length; save(); hub(); },
  end(w){ if (B && B.sim){ B.over = true; finish(w, B.sim.crowns); } }, tab, preCpu, sheet, showEmote, pzAct
};
const last = Accounts.last();
if (last && !Q.get('fresh')) signIn(last); else loginScreen();
initView();
