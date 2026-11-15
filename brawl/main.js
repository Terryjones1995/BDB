/* Break Room Brawl: screens, saves, the match loop and online play. Rules live in sim.js, drawing in view.js. */
import { CARDS, CARD_IDS, BASE_IDS, baseName, baseOf, UNITS, AFF, AFF_IDS, RAR, RAR_IDS, TYPES, TYPE_IDS, typeBonus, typeCount, SET_AT, SET_MUL, ROLE_NAME, MAPS, MAP_IDS, DECK_SIZE, HAND, MAX_LEGEND, MAX_GOD, DECK_SLOTS, MAX_LVL, START_COINS, FREE_RARES,
  lvlMul, LVL_STEP, GRADES, gradeOf, capProblem, RAR_CAP, PACE, upgradeCost, deckProblem, DRAW_W, weightedPick, rollCard, crateRoll, STARTER_DECKS, SKILLS, randomCpu, ladderCpu, levelPrize, tierOf, LEVELS, TIERS, PACKS, TYPE_PACK, openPack, THEME_DECKS, PERKS, PERK_IDS, unitsOf, ODDS, TEAM_ODDS, TEAM_TOWERS, CROWN_PAY, backupCpus } from './cards.js?v=1115t';
import { createSim, decodeEnts, decodeTraps, canPlace, DT, MAX_EL, manaRate, PATIENT, TRIG, OT_MANA } from './sim.js?v=1115t';
import { createAI } from './ai.js?v=1115t';
import { Accounts, fresh, sanitize, isOwner } from './store.js?v=1115t';
import { Cloud, cloudWhy } from './cloud.js?v=1115t';
import { sayFor, sayWhen } from './talk.js?v=1115t';
import { openTransport } from '../chess/net.js';

const $ = id => document.getElementById(id), Q = new URLSearchParams(location.search), BDB = window.BDB;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const fmt = n => Math.round(n).toLocaleString('en-CA'), pick = a => a[Math.floor(Math.random() * a.length)];
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029<>]/g, '').trim().slice(0, n);
const rid = (n = 6) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
const okCode = c => typeof c === 'string' && /^[a-z0-9]{4,12}$/.test(c);
const mmss = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const DEAL = .7, PAGE = 40, PAUSE_S = 300, SMALL = matchMedia('(max-width: 760px)').matches || (navigator.deviceMemory || 8) <= 4;
const COIN = '<span class="coin"></span>';
BDB.init({game:'brawl'});

/* ---------- trash talk ---------- */
const TALK = {
  start:["Welcome to my arena. Try not to cry on the hardwood.", "I drew this deck up on a napkin in the break room. You're done.", "Five-star prospect versus you. Bold of you to show up.", "I've got ten minutes and nowhere to be. Classic me.", "Scouts are watching this one. Probably.", "Deal the cards. I've been warming up since my last break."],
  heScores:["Tower down! Somebody call a scout, I'm heating up.", "That's more damage than I did all of last season.", "Write that down. BDB actually scored.", "One tower. I'm basically averaging 2.0 now.", "Did you see that? Nobody saw that? Typical.", "Clocked in, knocked it down. Signature move.", "Put that on the Jumbotron and loop it."],
  youScore:["That tower was a walk-on anyway.", "Lucky bounce. I was on my break.", "My defence is more of a suggestion.", "I let you have that. Confidence still at 99.", "Ref! That has to be a foul somewhere.", "Fine. I only needed two towers.", "That tower never listened to my coaching."],
  king:["You woke up the king. He was mid nap in the break room.", "Now the big tower's up. He hates extra work as much as I do."],
  ot:["Overtime? I don't do overtime. Check my timesheet.", "Sudden death. Next tower wins and my shift ends in two minutes.", "Two more minutes and four times the Mana. Somebody is getting a highlight."],
  late:["Double Mana already. This is where I usually clock out.", "Mana's flowing twice as fast. Finally, my kind of conditions."],
  last:["Two minutes left. Triple Mana. Even I can afford something now.", "Triple Mana. Everybody panic. I already am.", "Two minutes on the clock. Empty the bench."],
  legend:["Here comes a Legendary. Avert your eyes.", "Roll out the big card. Put my highlights on. Both of them.", "Legendary on the floor. Just like my scouting report said."],
  win:["Good game. I'm telling everyone the tablet was lagging.", "You beat me. The scouts weren't watching, right?", "I'm not mad. I'm just clocking out early.", "Enjoy it. My comeback tour starts Tuesday.", "That deck was a prototype. The real one is in my locker.", "You're taking my card? That one had sentimental value."],
  lose:["And that's why they called me a five-star prospect. Once.", "Ball game. Somebody get me a Jumbotron.", "I'd like to thank the break room for believing in me.", "Take notes. That's 2.0 points per game of pure heart.", "Undefeated since about four minutes ago."],
  trapSet:["I left something on the floor for you. Watch your step.", "That's a trap. I'm not telling you where.", "One card, face down. Read my playbook, I dare you.", "Something's waiting for you out there. Could be anything."],
  trapHit:["You activated my trap card. I've always wanted to say that.", "Walked right into it. Even I saw that coming.", "That's called coaching. Look it up.", "I've been holding that one since the first quarter."],
  trapOnHim:["Who put that there? Ref!", "A trap? In MY arena?", "That one's on the floor crew, not me.", "I meant to step on that. I was scouting it."],
  foulOnHim:["A technical? On ME? I didn't even say anything.", "You can't wave that off. I practised that shot."],
  foulOnYou:["Whistle! No basket. Read the rulebook.", "Denied. Put that one on the highlight reel."],
  emo:["Emojis won't save your towers.", "Cute. I'm still a five-star prospect.", "Less typing, more defending.", "I'd reply but I'm on my break."],
  pvpUp:["Crown for you. BDB could never.", "Tower down. BDB is taking notes he won't read."], pvpDown:["Your tower just got benched.", "That's a tower gone. BDB felt that from the break room."],
  start2:["Two of me, one of you. I like these odds.", "I brought backup. He's also me.", "Outnumbered already? We haven't even started.", "Double coverage. Coach would be proud, if I had one."],
  start3:["Three of me. That's a full shift.", "Three on one. Finally, a fair fight for me.", "You picked three of us. Bold. Wrong, but bold."],
  winMany:["You beat all of us. We're blaming each other.", "That many of me and still no win. Film session is going to be short.", "We lost? I was the good one. The other guy missed his rotation."],
  loseMany:["It only took a few of me. Efficient.", "Teamwork. I passed to myself and I scored.", "That's what a deep bench looks like."]
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
  trapSet:() => tone(150, .1, 'triangle', .07, -50), trap:() => { tone(880, .07, 'square', .045); tone(1320, .16, 'square', .045, 0, .07); tone(110, .3, 'sawtooth', .06, -40, .05); }, negate:() => { tone(1700, .09, 'sine', .07); tone(1500, .32, 'sine', .07, -700, .1); },
  rip:() => { tone(900, .16, 'sawtooth', .05, -700); tone(140, .3, 'triangle', .08, -60, .08); [660, 880, 1175].forEach((f, i) => tone(f, .22, 'triangle', .05, 0, .16 + i * .07)); },
  legend:() => { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, .5, 'triangle', .07, 0, i * .09)); tone(98, .9, 'sawtooth', .06, -30); },
  crack:() => { tone(1500, .07, 'sawtooth', .035, -1200); tone(80, .22, 'sawtooth', .05, -35, .03); },
  god:() => { tone(55, 1.6, 'sawtooth', .1, -18); tone(82, 1.2, 'square', .05, -40, .05); [262, 392, 523, 784, 1046, 1568].forEach((f, i) => tone(f, .9, 'triangle', .07, 0, .1 + i * .11)); tone(1800, .25, 'sawtooth', .04, -1500, .02); }};

/* ---------- the 3D view (menus work without it: card art is a set of pictures) ---------- */
let V = null, MD = null, ready3d = false;
const NOVIEW = Q.get('noview') === '1';
async function initView(){
  if (NOVIEW) return;
  try {
    const [vw, md] = await Promise.all([import('./view.js?v=1115t'), import('./models.js?v=1115t')]);
    await md.preload(); MD = md;
    V = vw.createView($('arena'), {low:SMALL, reduced:BDB.reduced, numbers:true, pid:() => B ? B.me : -1, gfx:Q.get('gfx') != null ? +Q.get('gfx') : null, onGfx:() => { if (curTab === 'Profile' && !B) gfxUI(); }});
    ready3d = true;
    V.loadProps('field');
  } catch(e){ console.warn('3D view unavailable', e); V = null; }
}

/* ---------- profile ---------- */
let P = null;
/* The owner's account (store.js knows which it is): its coins never run out, no limit on Legendary or God cards applies to its decks, and the first time it signs in it is handed Thor and the
   strongest deck testing could find, every card at full level. (Found by search, CPU against CPU: the fifteen characters win 99% of their matches against
   every ready-made deck and the top of the ladder, and these builds of them beat the plain builds 69% of the time.) */
const OWN_COINS = 99999999;
const OWN_DECK = 'thor-std jade-std manager-std phoenix-iron queen-vamp wraith-std archon-iron winter-vamp oathkeeper-std baron-std tempus-std plum-std zap-std arrows-std gremlins-tox'.split(' ');
let OWN = false, ownGift = -1, ownOver = false;
function ownerPerks(){
  if (!OWN || !P) return;
  P.coins = OWN_COINS;
  if (P.flags.own1 || !P.onboarded || OWN_DECK.some(id => !CARDS[id])) return;
  for (const id of OWN_DECK) P.cards[id] = MAX_LVL;
  let i = P.decks.findIndex((d, k) => k > 0 && !d.length);                     // an empty spare deck, or failing that the least finished one; never Deck 1
  if (i < 0) i = P.decks.reduce((b, d, k) => k > 0 && (b < 0 || d.length < P.decks[b].length) ? k : b, -1);
  ownOver = P.decks[i].length > 0; P.decks[i] = OWN_DECK.slice(); P.deck = i; P.flags.own1 = 1; ownGift = i;
}
const save = () => { ownerPerks(); Accounts.save(P); Cloud.push(P); top(); };
const lvl = id => P.cards[id] || 0;
const curDeck = () => P.decks[P.deck];
const myDeck = () => curDeck().map(id => ({id, lvl:Math.max(1, lvl(id))}));
const myTower = () => Math.round(curDeck().reduce((a, id) => a + Math.max(1, lvl(id)), 0) / DECK_SIZE);
/* On the ladder BDB scouts the deck in front of him: his cards and towers come up to within two levels of yours, so a deck upgraded far past its place on the ladder still gets a fight. */
const CPU_GAP = 2, cpuLvl = c => c.rand ? c.lvl : Math.min(MAX_LVL, Math.max(c.lvl, myTower() - CPU_GAP)), cpuTower = c => c.rand ? c.tower || c.lvl : Math.max(c.tower || c.lvl, myTower() - CPU_GAP);
/* and the soft towers of the first tier are for decks that belong there: bring cards more than a level above his and his towers are at full health */
const cpuSoft = c => c.rand || !(c.soft < 1) || myTower() > c.lvl + 1 ? 1 : c.soft;
/* a deck can stand part-built while it is being put together. These are the rules a part-built one still keeps, and the test for one that is ready to play. */
const limitProblem = d => new Set(d.map(i => CARDS[i].base)).size !== d.length ? 'Only one version of each character per deck.' : OWN ? '' : capProblem(d);
const deckOK = (d = curDeck()) => d.length === DECK_SIZE && !deckProblem(d, !OWN);
let deckMsg = '', pend = null, clearT = 0, slotOn = false;      // a line to show under the deck; a card waiting to take a place in a full deck; when "clear" was first pressed; an empty place was clicked
/* a match needs a whole deck: true (and it says so, on the Deck tab) when the one in use is not finished */
function noDeck(){
  const d = curDeck(); if (deckOK(d)) return false;
  deckMsg = (d.length < DECK_SIZE ? `Deck ${P.deck + 1} has ${d.length} of ${DECK_SIZE} cards.` : deckProblem(d, !OWN)) + ' Finish it, or pick another deck, before you play.';
  BDB.sfx.bad(); dlgClose(); tab('Deck'); return true;
}
const coinsTxt = () => OWN ? '\u221e' : fmt(P.coins);
function top(){ $('hCoins').textContent = coinsTxt(); $('hCoins').title = OWN ? 'Coins never run out on this account' : ''; $('hTro').textContent = fmt(P.trophies); }

/* a card: the picture, what it costs, its type, its name. A build other than the standard one washes the picture in its colour. */
const artOf = c => `art/${c.art}.webp`, hex = n => '#' + n.toString(16).padStart(6, '0');
function cardEl(id, o = {}){
  const c = CARDS[id], b = document.createElement(o.div ? 'div' : 'button'), A = AFF[c.aff], T = TYPES[c.type], src = artOf(c);
  if (!o.div) b.type = 'button';
  b.className = `card r-${c.rar}` + (o.lvl ? ' g' + gradeOf(o.lvl) : '') + (o.cls ? ' ' + o.cls : ''); b.dataset.id = id; b.setAttribute('aria-label', c.name);
  b.innerHTML = `<span class="cost">${c.cost}</span><img alt="" ${o.now ? '' : 'loading="lazy" '}decoding="async" src="${src}" onerror="this.style.visibility='hidden'">` + (A.tint != null ? `<i class="tint" style="--tc:${hex(A.tint)};-webkit-mask-image:url(${src});mask-image:url(${src})"></i>` : '') +
    `<i class="ty" style="--ty:${T.col}"></i>` + (c.n > 1 ? `<span class="cnt">x${c.n}</span>` : '') +
    (o.lvl ? `<span class="lv">Lv ${o.lvl}</span>` : '') + (o.tag ? `<span class="tagc${o.sale ? ' sale' : ''}">${o.tag}</span>` : `<span class="nm">${esc(c.name)}</span>`) + '<span class="veil"></span>' +
    (o.price ? `<span class="pr${o.sale ? ' sale' : ''}${o.own ? ' own' : ''}">${o.own ? '' : COIN}${o.was ? `<s>${o.was}</s>` : ''}${o.price}</span>` : '');
  return b;
}
const typeChip = t => `<span class="tchip" style="--ty:${TYPES[t].col}">${esc(TYPES[t].name)}</span>`;
/* which types a deck has enough of to earn their bonus, and how close the others are */
function setsHTML(deck, brief){
  const n = typeCount(deck), bon = typeBonus(deck);
  return Object.keys(n).sort((a, b) => n[b] - n[a]).filter((t, i) => !brief || bon[t] || (n[t] >= 2 && i < 4)).map(t => { const nx = SET_AT.find(v => v > n[t]); return `<span class="set${bon[t] ? ' on' : ''}" style="--ty:${TYPES[t].col}"><b>${n[t]}</b>${esc(TYPES[t].name)}${bon[t] ? `<em>+${Math.round((bon[t] - 1) * 100)}%</em>` : nx ? `<small>${nx - n[t]} more for +${Math.round((SET_MUL[SET_AT.indexOf(nx)] - 1) * 100)}%</small>` : ''}</span>`; }).join('');
}

/* ---------- dialogs ---------- */
function dlg(html, o = {}){ const w = $('dlg'), b = $('dlgBox'); b.innerHTML = html; w.hidden = false; dlg.lock = !!o.lock; return b; }
const dlgClose = () => { $('dlg').hidden = true; $('dlgBox').innerHTML = ''; };
function backdrop(w, close){ let d = false; w.addEventListener('pointerdown', e => { d = e.target === w; }); w.addEventListener('click', e => { if (d && e.target === w) close(); d = false; }); }
backdrop($('sheet'), () => { $('sheet').hidden = true; });
backdrop($('dlg'), () => { if (!dlg.lock) dlgClose(); });
function confirmBox(title, text, yes, fn){ const b = dlg(`<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="k-row"><button type="button" class="k-btn primary" id="cy">${esc(yes)}</button><button type="button" class="k-btn" id="cn">Cancel</button></div>`); b.querySelector('#cy').onclick = () => { dlgClose(); fn(); }; b.querySelector('#cn').onclick = dlgClose; }
function msgBox(title, text){ const b = dlg(`<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="k-row"><button type="button" class="k-btn primary" id="nf">OK</button></div>`); b.querySelector('#nf').onclick = dlgClose; }

/* ---------- rewards that do not hang on one match: the daily one, the win streak and the tower bounty ---------- */
const DAILY = [{coins:150}, {pack:'bronze'}, {coins:300}, {pack:'silver'}, {coins:500, token:1}, {pack:'gold'}, {pack:'diamond', token:2}];      // seven days running, then round again. Miss a day and it starts over
const BOUNTY = 10;                                        // enemy towers to take for a bounty pack
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayGap = (a, b) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 864e5);
/* ready: can be taken now. day: the day (1 to 7) that is next to take. done: how many of this run are already in the bag */
function dailyState(){
  const d = P.daily, gap = d.day ? dayGap(d.day, today()) : 99;
  return gap === 0 ? {ready:false, day:d.n % 7 + 1, done:d.n} : gap === 1 ? {ready:true, day:d.n % 7 + 1, done:d.n % 7} : {ready:true, day:1, done:0};
}
const streakMul = n => 1 + .1 * Math.min(5, Math.max(0, n - 1));      // the second win in a row pays 10% more coins, the sixth and every one after it 50% more
const bountyPack = () => { const t = Math.floor(P.ladder / 100); return t < 2 ? 'silver' : t < 5 ? 'gold' : 'diamond'; };
const rewardText = r => [r.coins ? `${fmt(r.coins)} coins` : '', r.pack ? `a ${PACK[r.pack].name}` : '', r.token ? `${r.token} upgrade ${r.token > 1 ? 'tokens' : 'token'}` : ''].filter(Boolean).join(' and ');
function claimDaily(){
  const st = dailyState(); if (!st.ready) return;
  const r = DAILY[st.day - 1]; P.daily = {day:today(), n:st.day};
  if (r.coins) P.coins += r.coins; if (r.token) P.tokens += r.token;
  if (r.pack){ const got = openPack(PACK[r.pack]).map(grant); P.stats.packs++; save(); packReveal(PACK[r.pack], got, () => { dlgClose(); hub(); }); }
  else { save(); BDB.sfx.big(); hub(); const b = dlg(`<div class="k-eyebrow">Daily reward, day ${st.day} of 7</div><h3>${esc(rewardText(r).replace(/^./, c => c.toUpperCase()))}</h3><p class="note">Come back tomorrow for day ${st.day % 7 + 1}: ${esc(rewardText(DAILY[st.day % 7]))}. Miss a day and it starts again from day 1.</p><div class="k-row"><button type="button" class="k-btn primary" id="dyX">Good</button></div>`); b.querySelector('#dyX').onclick = dlgClose; }
}
function claimBounty(){
  if (P.bounty < BOUNTY) return;
  const pk = PACK[bountyPack()]; P.bounty -= BOUNTY; P.bn++; P.stats.packs++;
  const got = openPack(pk).map(grant); save(); packReveal(pk, got, () => { dlgClose(); hub(); });
}
function boonsUI(){
  const el = $('boons'); if (!el) return;
  const d = dailyState(), bp = PACK[bountyPack()], full = P.bounty >= BOUNTY, sb = Math.round((streakMul(P.streak + 1) - 1) * 100);
  el.innerHTML = `<div class="boon${d.ready ? ' go' : ''}"><div class="ic day">${d.day}</div><div><b>Daily reward</b><small>${d.ready ? `Day ${d.day} of 7: ${esc(rewardText(DAILY[d.day - 1]))}.` : `Taken today. Tomorrow is day ${d.day}: ${esc(rewardText(DAILY[d.day - 1]))}.`}</small><div class="pips">${DAILY.map((_, i) => `<i${i < d.done ? ' class="on"' : ''}></i>`).join('')}</div></div>${d.ready ? '<button type="button" class="k-btn primary" id="dayGo">Claim</button>' : ''}</div>
    <div class="boon"><div class="ic fire${P.streak ? '' : ' cold'}">${P.streak}</div><div><b>Win streak</b><small>${P.streak ? `${P.streak} in a row${P.best > P.streak ? `, best ${P.best}` : ''}. ${sb ? `The next win pays ${sb}% more coins.` : ''}` : 'Win two in a row and every win after pays extra coins, up to half as much again.'}</small></div></div>
    <div class="boon${full ? ' go' : ''}"><div class="ic pack" style="--pc:${bp.col}">${Math.min(P.bounty, BOUNTY)}</div><div><b>Tower bounty</b><small>${full ? `Ten towers down. A ${esc(bp.name)} is yours.` : `${P.bounty} of ${BOUNTY} enemy towers taken. Ten earns a ${esc(bp.name)}.`}</small><div class="bar"><i style="width:${Math.min(100, P.bounty / BOUNTY * 100)}%"></i></div></div>${full ? '<button type="button" class="k-btn primary" id="bntGo">Open</button>' : ''}</div>`;
  const dg = $('dayGo'), bg = $('bntGo'); if (dg) dg.onclick = claimDaily; if (bg) bg.onclick = claimBounty;
}

/* ---------- card sheet: what it is, what it does, buy, upgrade, put in deck ---------- */
const KIND = {unit:'troop', build:'building', spell:'spell', trap:'trap'};
const SPD = v => { const s = v / PACE; return s <= 0 ? 'None' : s < 1.1 ? 'Slow' : s < 1.5 ? 'Medium' : s < 2 ? 'Fast' : 'Very fast'; };      // named from the listed speed, before the field-wide pace is applied
const ORD = ['', '', 'second', 'third', 'fourth', 'fifth', 'sixth'];
const pc = v => Math.round(v * 100) + '%', x10 = v => +(+v).toFixed(1), sec = v => x10(v) + 's';
const uName = (k, n) => { const s = UNITS[k] ? UNITS[k].name : 'unit'; return n === 1 ? s : s + 's'; };
/* everything special a unit does, one short line each. m: what the card's level multiplies health and damage by */
function abil(U, m = 1){
  const a = [], d = v => Math.round(v * m);
  if (U.smite) a.push(`Arrives with lightning: ${d(U.smite.dmg)} damage to every enemy on the field, wherever it stands, and a ${sec(U.smite.stun)} stun. Towers take ${pc(U.smite.twr ?? .3)} of it.`);
  if (U.reap) a.push(`Arrives, and every enemy troop on the field loses ${pc(U.reap)} of its full health on the spot.`);
  if (U.wrath) a.push(`Every ${sec(U.wrath.every)} a bolt from the sky strikes the enemy troop with the most health left, anywhere on the field: ${d(U.wrath.dmg)} damage within ${U.wrath.r}.`);
  if (U.fly) a.push('Flies. Swords and fists cannot reach it: only other flyers, anything that shoots or throws, towers and spells.');
  if (U.only) a.push('Ignores troops and goes straight for buildings and towers.');
  if (U.chip) a.push(`Made for fighting troops: only ${Math.round(U.chip * 100)}% of its damage lands on a tower.`);
  if (U.kamikaze) a.push('Blows itself up on whatever it reaches. The blast is its only attack.');
  if (U.life && !U.bld) a.push(`Melts away after ${sec(U.life)}, whatever happens.`);
  if (U.any) a.push('Can be dropped anywhere on the field, their side included. Does a third of its damage to towers.');
  if (U.land){ const l = U.land, b = [];
    if (l.dmg) b.push(d(l.dmg) + ' damage'); if (l.stun) b.push(`a ${sec(l.stun)} stun`); if (l.slow) b.push(`a ${sec(l.slow)} slow`); if (l.weak) b.push(`a roar that makes them hit 30% softer for ${sec(l.weak)}`); if (l.push) b.push('a shove back'); if (l.burn) b.push('fire');
    if (b.length) a.push(`Lands with ${b.join(', ')} for every enemy within ${l.r}.`);
    const who = l.r >= 50 ? 'every troop you have, wherever it is,' : `every teammate within ${l.r}`;
    if (l.shield) a.push(`Lands and hands ${who} a ${d(l.shield)} shield.`);
    if (l.rage) a.push(`Lands with a war cry: ${l.r >= 50 ? 'all your troops' : 'teammates within ' + l.r} move and hit a third faster for ${sec(l.rage)}.`);
    if (l.summon) a.push(`Arrives with ${l.summon.n} ${uName(l.summon.u, l.summon.n)}.`); }
  if (U.charge) a.push(`${U.charge.dash ? 'Arrives already sprinting, and winds up again after a run-up' : 'Breaks into a sprint after a run-up'}. A sprint hit lands for ${x10(U.charge.dmg)}x${U.charge.stun ? ` and stuns for ${sec(U.charge.stun)}` : ''}.`);
  if (U.leap) a.push(`Pounces on targets ${U.leap.min} to ${U.leap.max} away. The landing hits for ${x10(U.leap.mul)}x.`);
  if (U.stealth) a.push(`Unseen until it strikes. The hit from the dark lands for ${x10(U.stealth.mul)}x, and it fades again ${sec(U.stealth.re)} later. Half damage to towers.`);
  if (U.shield) a.push(`Starts with a ${d(U.shield)} shield${U.recharge ? ` that winds itself back up ${sec(U.recharge.every)} after it is broken` : ''}.`);
  if (U.stoic) a.push('Cannot be stunned, frozen, slowed or rattled.');
  if (U.fireproof) a.push('Cannot be set on fire.');
  if (U.deflect) a.push(`Takes ${pc(U.deflect)} less damage from arrows, bolts and spells.`);
  if (U.tough) a.push(`Below ${pc(U.tough.at)} health it takes ${pc(U.tough.cut)} less damage.`);
  if (U.armor) a.push(`Armour knocks ${d(U.armor)} off every hit it takes.`);
  if (U.dodge) a.push(`${pc(U.dodge)} of attacks miss it.`);
  if (U.regen) a.push(`Heals ${x10(U.regen * 100)}% of its health every second.`);
  if (U.revive) a.push(`Gets back up once, at ${pc(U.revive)} health${U.rise ? `, in a blast of ${d(U.rise.dmg)} damage to every enemy within ${U.rise.r}` : ''}.`);
  if (U.thorns) a.push(`Sends ${pc(U.thorns)} of every melee hit back at the attacker.`);
  if (U.mirror) a.push(`Whoever hits it, from any distance, takes ${pc(U.mirror)} of that hit themselves.`);
  if (U.sear) a.push(`Whatever hits it up close catches fire: ${d(U.sear.dps)} a second for ${sec(U.sear.t)}.`);
  if (U.numb) a.push(`Whatever hits it up close is slowed for ${sec(U.numb)}.`);
  if (U.taunt) a.push(`Enemies within ${U.taunt} have to go for it first.`);
  if (U.stun) a.push(`Every ${ORD[U.stun.every] || 'few'} hit stuns for ${sec(U.stun.t)}.`);
  if (U.crit) a.push(`Every ${ORD[U.crit.every] || 'few'} hit lands for ${x10(U.crit.mul)}x.`);
  if (U.exec) a.push(`${x10(U.exec.mul)}x damage to anything under ${pc(U.exec.at)} health.`);
  if (U.lock) a.push(`Every hit locks the building or tower it lands on: it cannot fire for ${sec(U.lock)}.`);
  if (U.raze) a.push(`${x10(U.raze)}x damage to buildings and towers.`);
  if (U.wild) a.push('Every hit does anywhere from half to triple damage.');
  if (U.eject) a.push(`Every ${ORD[U.eject.every] || 'few'} hit is a red card: the target is sent back to its own king tower.`);
  if (U.sap) a.push(`Whatever it hits is weakened for ${sec(U.sap)} and deals 30% less damage.`);
  if (U.brew) a.push('Every hit burns, slows or poisons the target. Not even he knows which.');
  if (U.rob) a.push(`Every hit on a troop lifts ${x10(U.rob)} Mana from its owner and hands it to you.`);
  if (U.mend) a.push(`Its splash also heals your own troops for ${d(U.mend)}.`);
  if (U.siphon) a.push(`${pc(U.siphon.frac)} of the damage it deals goes to your most hurt troop within ${U.siphon.r} as healing.`);
  if (U.frenzy) a.push(`Every kill sends it into a rage for ${sec(U.frenzy)}: faster on its feet and on the swing.`);
  if (U.infect) a.push(`Whatever it kills gets back up as ${uName(U.infect.u, 1)} on your side, up to ${U.infect.max || 4} at a time.`);
  if (U.pyre) a.push(`Anything it finishes off while burning explodes: ${d(U.pyre.dmg)} damage within ${U.pyre.r}.`);
  if (U.feast) a.push(`Heals ${pc(U.feast)} of its health whenever anything dies close by.`);
  if (U.first) a.push(`The first hit on every new target lands for ${x10(U.first.mul)}x. Not on towers.`);
  if (U.brittle) a.push(`${x10(U.brittle)}x damage to anything slowed or frozen.`);
  if (U.pierce) a.push('Its attacks ignore shields and armour.');
  if (U.riposte) a.push(`Every melee attack it dodges is answered at once for ${x10(U.riposte)}x.`);
  if (U.curse) a.push(`Whatever hits it up close is cursed for ${sec(U.curse)} and takes 30% more damage from everyone.`);
  if (U.loot) a.push(`Every kill pays you ${x10(U.loot)} Mana.`);
  if (U.ramp) a.push(`Hits harder the longer it stays on one target, up to ${x10(1 + U.ramp.max)}x.`);
  if (U.pack) a.push(`${pc(U.pack.per)} more damage for each of its own kind close by, up to ${pc(U.pack.per * U.pack.max)}.`);
  if (U.berserk) a.push('Attacks faster the more hurt it is, up to nearly double.');
  if (U.grow) a.push(`Every kill adds ${pc(U.grow.per)} damage, up to ${U.grow.max} times.`);
  if (U.knock) a.push('Every hit knocks the target back.');
  if (U.chill) a.push(`Every hit slows the target for ${sec(U.chill)}.`);
  if (U.burn) a.push(`Sets targets on fire: ${d(U.burn.dps)} a second for ${sec(U.burn.t)}.`);
  if (U.psn) a.push(`Poisons targets: ${d(U.psn.dps)} a second for ${sec(U.psn.t)}.`);
  if (U.mark) a.push(`Marks targets for ${sec(U.mark.t)}. Marked targets take 30% more damage from everyone.`);
  if (U.shot === 'sky') a.push('Does not swing: the hammer goes up and a bolt drops out of the sky onto the target, flyers included.');
  if (U.chain) a.push(`Each attack jumps to ${U.chain.n} more ${U.chain.n === 1 ? 'target' : 'targets'}.`);
  if (U.steal) a.push(`Heals itself for ${pc(U.steal)} of the damage it deals.`);
  if (U.leech) a.push('Every hit on a tower steals Mana for you.');
  if (U.heal) a.push(`Heals ${U.heal.bld ? 'your towers and buildings' : 'teammates'} within ${U.heal.r} for ${d(U.heal.amt / (U.heal.every || 1))} a second${U.heal.cure ? ', and clears fire, poison, slows and curses off them' : ''}.`);
  if (U.aura){ const A = U.aura;
    if (A.haste) a.push(`Your ${A.bld ? 'buildings' : 'troops'} within ${A.r} ${A.bld ? 'fire and build' : 'move and hit'} a third faster.`);
    if (A.might) a.push(`Teammates within ${A.r} hit 25% harder.`);
    if (A.guard) a.push(`Teammates within ${A.r} take 20% less damage.`);
    if (A.thorns) a.push(`Teammates within ${A.r} send 30% of every melee hit back at the attacker.`);
    if (A.burn) a.push(`Burns every enemy within ${A.r} for ${d(A.burn)} a second.`);
    if (A.psn) a.push(`Poisons every enemy within ${A.r} for ${d(A.psn)} a second.`);
    if (A.weak) a.push(`Enemy troops within ${A.r} hit 30% softer.`);
    if (A.slow) a.push(`Enemy troops within ${A.r} move and hit slower.`); }
  if (U.shatter) a.push(`Any enemy that dies within ${U.shatter.r} of her bursts into ice: everything of theirs within ${U.shatter.br} freezes for ${sec(U.shatter.t)}.`);
  if (U.bless) a.push(`Grants ${U.bless.n} wishes: the next ${U.bless.n} teammates to fall within ${U.bless.r} get straight back up at ${pc(U.bless.hp)} health.`);
  if (U.spawn) a.push(`Sends out ${U.spawn.n} ${uName(U.spawn.u, U.spawn.n)} every ${sec(U.spawn.every)}.`);
  if (U.raise) a.push(U.raise.r >= 50 ? `Whatever dies, anywhere on the field and on either side, gets back up as its ${uName(U.raise.u, 1)}. Up to ${U.raise.max} of them at once.` : `Anything that dies within ${U.raise.r} gets back up as its ${uName(U.raise.u, 1)}, up to ${U.raise.max} times.`);
  if (U.split) a.push(`Breaks into ${U.split.n} ${uName(U.split.u, U.split.n)} when it is defeated.`);
  if (U.morph) a.push(`Turns into ${uName(U.morph.u, 1)} at ${pc(U.morph.at)} health.`);
  if (U.mana) a.push(`Makes ${U.mana.amt} Mana every ${sec(U.mana.every)}.`);
  if (U.death){ const z = U.death; a.push(`When it falls: ${d(z.dmg)} damage within ${z.r}${z.frz ? `, and everything there freezes for ${sec(z.frz)}` : ''}${z.pool ? ', and the ground keeps burning' : ''}.`); }
  return a;
}
function statRows(id, L){
  const c = CARDS[id], m = lvlMul(L), r = [], n = v => Math.round(v * m);
  if (c.spell){ const s = c.spell;
    r.push(['Radius', s.r]);
    if (s.dmg) r.push([s.dur ? 'Damage a second' : s.n ? 'Each bolt' : 'Damage', n(s.dmg)]);
    if (s.dmg && s.twr && s.twr !== 1) r.push(['To towers', n(s.dmg * s.twr)]);
    if (s.dmg && s.bld) r.push(['To buildings', n(s.dmg * s.bld)]);
    if (s.n) r.push(['Bolts', s.n]);
    if (s.heal) r.push(['Heal a second', n(s.heal)]);
    if (s.shield) r.push(['Shield', n(s.shield)]);
    if (s.freeze) r.push(['Freeze', sec(s.freeze)]);
    if (s.stun) r.push(['Stun', sec(s.stun)]);
    if (s.slow && s.kind !== 'poison') r.push(['Slow', sec(s.slow)]);
    if (s.rage) r.push(['Boost', '+35%'], ['Lasts', sec(s.rage)]);
    if (s.dur) r.push(['Lasts', sec(s.dur)]);
    if (s.pool) r.push(['Burning ground', `${n(s.pool.dps)} a second`]);
    if (s.u) r.push(['Summons', uName(s.u, 2)]);
    r.push(['Lands in', sec(s.delay)]);
    return r; }
  if (c.trap){ const t = c.trap;
    r.push([t.kind === 'counter' ? 'Covers' : 'Reach', t.r], ['Arms in', t.arm + 's'], ['Stays set', t.life + 's']);
    if (t.dmg) r.push([t.kind === 'bounce' ? 'Damage' : 'Area damage', n(t.dmg)]);
    if (t.stun) r.push([t.kind === 'bounce' ? 'Dazed for' : 'Stun', t.stun + 's']);
    if (t.refl) r.push(['Thrown back', Math.round(t.refl * 100) + '%'], ['Lasts', t.dur + 's']);
    if (t.burn) r.push(['Mana burned', t.burn]);
    if (t.burst) r.push(['Toxic burst', n(t.burst)]); if (t.heal) r.push(['Tower heal', n(t.heal)]); if (t.chill) r.push(['Slow', t.chill + 's']);
    r.push(['Catches', t.kind === 'counter' ? 'Spells' : 'Ground troops']);
    return r; }
  const U = c.U;
  r.push(['Health', n(U.hp)]);
  if (U.dmg) r.push([U.splash ? 'Area damage' : 'Damage', n(U.dmg)], ['Hit speed', U.hit + 's'], ['Range', U.rng <= 1.5 ? 'Melee' : U.rng]);
  if (!U.bld) r.push(['Speed', SPD(U.spd)]); else r.push(['Lasts', U.life + 's']);
  r.push(['Targets', U.only ? 'Buildings' : !U.dmg ? 'None' : U.air ? 'Air and ground' : 'Ground']);
  if (c.n > 1) r.push(['Count', 'x' + c.n]);
  if (U.fly) r.push(['Moves', 'Flying']);
  return r;
}
const statHTML = rows => rows.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
function sheet(id){
  const c = CARDS[id]; if (!c) return;
  const L = lvl(id), R = RAR[c.rar], price = priceNow(id), up = upgradeCost(id, L), box = $('sheetBox'), U = c.U, lines = U ? abil(U, lvlMul(Math.max(1, L))) : [];
  const pct = Math.round(LVL_STEP * 100), G = gradeOf(Math.max(1, L)), up2 = L < MAX_LVL && gradeOf(L + 1) > G ? ` and moves it up to ${GRADES[gradeOf(L + 1)]}` : '';
  const lvNote = !L ? 'You do not own this card yet.' : `Level ${L} of ${MAX_LVL}, ${GRADES[G]} grade. ` + (L >= MAX_LVL ? 'Maxed out.' : c.trap ? (c.trap.dmg || c.trap.burst || c.trap.heal ? `The next level adds ${pct}% to what it does${up2}.` : 'Levels do not change this trap.') : c.spell && !(c.spell.dmg || c.spell.heal || c.spell.shield) ? 'Levels do not change this spell.' : `The next level adds ${pct}% health and damage${up2}.`);
  box.className = 'k-box sheetx r-' + c.rar;
  box.innerHTML = `<div class="sheet-top"><div></div><div><div class="rar">${R.name} ${KIND[c.kind]}, ${c.cost} Mana</div><h3>${esc(c.name)}</h3>
      <div class="chips">${typeChip(c.type)}${U ? `<span class="rchip">${esc(ROLE_NAME[U.role] || 'Troop')}</span>` : ''}</div></div></div>
    <p class="sdesc">${esc(c.desc)}</p><p class="quote" style="--ty:${TYPES[c.type].col}">${esc(sayFor(c.base, c.type, hash(c.base)))}</p>
    <div class="stats">${statHTML(statRows(id, Math.max(1, L)))}</div>
    ${lines.length ? `<ul class="abil">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}${c.note ? `<p class="bnote2">${esc(c.note)}</p>` : ''}
    <div style="width:100%"><div class="note" style="margin-bottom:6px">${lvNote}</div><div class="prog"><i style="width:${L / MAX_LVL * 100}%"></i></div></div>
    <div class="k-row" id="shAct"></div><div class="note" id="shNote"></div>`;
  box.querySelector('.sheet-top > div').replaceWith(cardEl(id, {div:true, lvl:L, now:true}));
  const act = box.querySelector('#shAct');
  const btn = (t, cls, fn, dis) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'k-btn ' + cls; b.innerHTML = t; b.disabled = !!dis; b.onclick = fn; act.appendChild(b); return b; };
  const close = () => { $('sheet').hidden = true; }, short = n => { box.querySelector('#shNote').textContent = `You need ${fmt(n - P.coins)} more coins.`; };
  if (!P || !P.onboarded || (B && !B.done)){ /* mid-match, or just looking: the facts and nothing to buy */ }
  else if (!L){ btn(`Buy ${COIN}${fmt(price)}`, 'primary', () => { if (P.coins < price) return; P.coins -= price; P.cards[id] = 1; save(); BDB.sfx.good(); hub(); sheet(id); }, P.coins < price); if (P.coins < price) short(price); }
  else {
    if (L < MAX_LVL){ btn(`Upgrade ${COIN}${fmt(up)}`, 'primary', () => { if (P.coins < up) return; P.coins -= up; P.cards[id] = L + 1; P.stats.up++; save(); BDB.sfx.big(); hub(); sheet(id); }, P.coins < up); if (P.coins < up) short(up); }
    if (!curDeck().includes(id)) btn('Put in deck', L < MAX_LVL ? '' : 'primary', () => { close(); if (curTab !== 'Deck') tab('Deck'); addCard(id); });
    else btn('Take out of deck', '', () => { close(); takeOut(curDeck().indexOf(id)); });
  }
  btn('Close', '', close);
  $('sheet').hidden = false;
}

/* ---------- a filterable, paged list of cards (well over a thousand of them, so never all at once) ---------- */
const lists = {}, RO = {c:0, r:1, e:2, l:3};
function listUI(key, source, label){
  const st = lists[key] = {q:'', kind:'', rar:'', type:'', aff:'', sort:'cost', n:PAGE}, box = $(key + 'F');
  box.innerHTML = `<div class="tfilter" role="group" aria-label="Type">${TYPE_IDS.map(t => `<button type="button" data-t="${t}" style="--ty:${TYPES[t].col}" aria-pressed="false">${esc(TYPES[t].name)}</button>`).join('')}</div>
    <input class="field" type="search" placeholder="Search cards" autocomplete="off" spellcheck="false" aria-label="Search cards">
    <select class="field" data-k="kind" aria-label="Kind"><option value="">Any kind</option><option value="unit">Troops</option><option value="build">Buildings</option><option value="spell">Spells</option><option value="trap">Traps</option></select>
    <select class="field" data-k="rar" aria-label="Rarity"><option value="">Any rarity</option>${RAR_IDS.map(r => `<option value="${r}">${RAR[r].name}</option>`).join('')}</select>
    <select class="field" data-k="aff" aria-label="Build"><option value="">Any build</option>${AFF_IDS.map(a => `<option value="${a}">${AFF[a].name || 'Standard'}</option>`).join('')}</select>
    <select class="field" data-k="sort" aria-label="Sort"><option value="cost">Sort by Mana</option><option value="rar">Sort by rarity</option><option value="price">Sort by price</option><option value="name">Sort by name</option><option value="lvl">Sort by level</option></select>`;
  const draw = () => {
    const q = st.q.toLowerCase();
    const ids = source().filter(id => { const c = CARDS[id]; return (!st.kind || c.kind === st.kind) && (!st.rar || c.rar === st.rar) && (!st.type || c.type === st.type) && (!st.aff || c.aff === st.aff) && (!q || c.name.toLowerCase().includes(q)); });
    const byCost = (a, b) => CARDS[a].cost - CARDS[b].cost || RO[CARDS[a].rar] - RO[CARDS[b].rar] || CARDS[a].name.localeCompare(CARDS[b].name);
    ids.sort(st.sort === 'price' ? (a, b) => CARDS[a].price - CARDS[b].price : st.sort === 'name' ? (a, b) => CARDS[a].name.localeCompare(CARDS[b].name) : st.sort === 'lvl' ? (a, b) => lvl(b) - lvl(a) || byCost(a, b) : st.sort === 'rar' ? (a, b) => RO[CARDS[b].rar] - RO[CARDS[a].rar] || byCost(a, b) : byCost);
    const g = $(key + 'Grid'), dl = key === 'shop' ? deals() : [], dk = curDeck(); g.innerHTML = '';
    for (const id of ids.slice(0, st.n)){
      const c = cardEl(id, key === 'shop' ? {price:lvl(id) ? 'Owned' : fmt(priceNow(id)), own:!!lvl(id), sale:dl.includes(id) && !lvl(id), was:dl.includes(id) && !lvl(id) ? fmt(CARDS[id].price) : '', lvl:lvl(id), cls:lvl(id) ? 'dim' : ''} : {lvl:lvl(id), cls:(dk.includes(id) ? 'inuse' : '') + (pend === id ? ' pend' : '')});
      if (key === 'own'){ withInfo(c, id); c.onclick = e => { if (e.target.closest('.inf')) return sheet(id); const i = curDeck().indexOf(id); if (i >= 0) takeOut(i); else addCard(id); }; }
      else c.onclick = () => sheet(id);
      g.appendChild(c);
    }
    if (!ids.length) g.innerHTML = '<p class="note">No cards match that. Clear a filter to see more.</p>';
    $(key + 'Lbl').textContent = `${label}: ${fmt(ids.length)}`; $(key + 'More').hidden = ids.length <= st.n;
  };
  st.draw = draw;
  box.querySelector('input').oninput = e => { st.q = e.target.value; st.n = PAGE; draw(); };
  for (const s of box.querySelectorAll('select')) s.onchange = () => { st[s.dataset.k] = s.value; st.n = PAGE; draw(); };
  box.querySelector('.tfilter').onclick = e => { const b = e.target.closest('button'); if (!b) return; st.type = st.type === b.dataset.t ? '' : b.dataset.t; for (const o of box.querySelectorAll('.tfilter button')) o.setAttribute('aria-pressed', o.dataset.t === st.type); st.n = PAGE; draw(); };
  $(key + 'More').onclick = () => { st.n += PAGE; draw(); };
}

/* ---------- hub ---------- */
let curTab = 'Battle', deckType = '', deckAll = false;
function tab(t){ curTab = t; for (const k of ['Battle', 'Deck', 'Market', 'Profile']) $('tab' + k).hidden = k !== t; for (const b of $('tabbar').children) b.setAttribute('aria-selected', b.dataset.tab === t); if (t !== 'Deck'){ pend = null; deckMsg = ''; clearT = 0; slotOn = false; } hub(); $('hubBody').scrollTop = 0; }
$('tabbar').onclick = e => { const b = e.target.closest('button'); if (b) tab(b.dataset.tab); };
$('toDeck').onclick = () => tab('Deck');
const avgCost = d => d.length ? (d.reduce((a, id) => a + CARDS[id].cost, 0) / d.length).toFixed(1) : '0';
const PACK = Object.fromEntries(PACKS.map(p => [p.id, p]));
const PACK_ART = {bronze:'scarlet', silver:'bell', gold:'kingbellow', diamond:'infernus', mythic:'isolde', divine:'zeus'};
const TYPE_ART = {dragon:'jade', fire:'phoenix', frost:'isolde', arcane:'genie', dark:'baron', shadow:'kitsune', beast:'pridelord', nature:'elderbark', horde:'gorak', order:'kingbellow', tech:'brassbolt', crew:'manager'};
const nextLevel = () => Math.min(LEVELS, P.ladder + 1), NUM = ['No', 'One', 'Two', 'Three'];
/* what a win is worth, as a row of chips. first: the first-win extras are still there to be won */
function prizeChips(cpu, first, n = 1){
  const f = cpu.first || {}, out = [`<span class="pz">${COIN}${fmt((first || cpu.rand ? cpu.coins : cpu.coins / 2) * ODDS[n].pay)}</span>`];
  if (first || cpu.card) out.push(`<span class="pz cardz">${n === 3 ? 'A card from all three' : n === 2 ? 'A card from both' : 'One of his cards'}</span>`);
  const pk = cpu.rand ? cpu.pack : first ? f.pack : null; if (pk) out.push(`<span class="pz packz" style="--pc:${PACK[pk].col}">${esc(PACK[pk].name)}</span>`);
  if (first && f.rar) out.push(`<span class="pz r-${f.rar}">${RAR[f.rar].name} card</span>`);
  if (first && f.token) out.push(`<span class="pz tokz">${f.token} upgrade ${f.token > 1 ? 'tokens' : 'token'}</span>`);
  return out.join('');
}
const PAINTED = new Set(['ruins', 'glacier', 'citadel', 'yard', 'temple', 'keep', 'hollow', 'foundry', 'cinder', 'heavens']);      // the arenas with a painted floor: the next fight's is laid out beside it on the hub
function hub(){
  if (!P) return;
  top();
  if (curTab === 'Battle'){
    const n = nextLevel(), all = P.ladder >= LEVELS, cpu = ladderCpu(n), T = TIERS[cpu.tier], h = $('hero');
    h.style.setProperty('--tc', T.col);
    h.innerHTML = `${PAINTED.has(cpu.map) ? `<div class="hero-map" aria-hidden="true"><img alt="" src="maps/${cpu.map}.webp"></div>` : ''}<div class="pic"><b>${n}</b></div><div><small>${all ? 'All 1,000 beaten. Run the last one back' : `Level ${fmt(n)} of ${fmt(LEVELS)}, ${esc(T.name)} tier`}</small><h2>${esc(cpu.name)}</h2><p>${esc(cpu.tag)} ${esc(MAPS[cpu.map].name)}, level ${cpuLvl(cpu)} cards.</p><div class="pzrow">${prizeChips(cpu, !all)}</div><button type="button" class="k-btn primary big" id="heroGo">Battle</button></div>`;
    $('heroGo').onclick = () => preCpu(cpu);
    boonsUI();
    const road = $('road'), a = Math.max(1, Math.min(n - 2, LEVELS - 11)); road.innerHTML = '';
    for (let i = a; i < a + 12 && i <= LEVELS; i++){
      const pr = levelPrize(i), f = pr.first, st = i <= P.ladder ? 'done' : i === n ? 'next' : 'lock', b = document.createElement('button');
      b.type = 'button'; b.className = 'node ' + st + (i % 100 === 0 ? ' boss' : ''); b.disabled = st === 'lock'; b.setAttribute('aria-label', `Level ${i}${st === 'done' ? ', beaten' : st === 'lock' ? ', locked' : ''}`);
      b.innerHTML = `<b>${i}</b><span>${f.pack ? `<i class="pk" style="--pc:${PACK[f.pack].col}" title="${esc(PACK[f.pack].name)}"></i>` : ''}${f.token ? '<i class="tk" title="Upgrade token"></i>' : ''}${!f.pack && !f.token ? '<i class="cd" title="One of his cards"></i>' : ''}</span><small>${st === 'done' ? 'Beaten' : fmt(pr.coins)}</small>`;
      b.onclick = () => preCpu(ladderCpu(i));
      road.appendChild(b);
    }
    $('tierLbl').textContent = `The ladder: ${fmt(P.ladder)} of ${fmt(LEVELS)}`;
    // too strong for where you are? The tier's boss can be challenged at any time: beat him and every level under him is cleared
    const boss = Math.ceil(n / 100) * 100, gapN = boss - n; $('skipRow').hidden = all || gapN < 1;
    if (gapN >= 1){ $('skipNote').textContent = `Level ${fmt(boss)}, ${ladderCpu(boss).name}. Beat him and the ${gapN} ${gapN > 1 ? 'levels' : 'level'} before him ${gapN > 1 ? 'are' : 'is'} cleared, for half their coins and none of their packs or cards.`; $('skipGo').onclick = () => preCpu(ladderCpu(boss)); }
    $('tiers').innerHTML = TIERS.map((t, i) => { const got = clamp(P.ladder - i * 100, 0, 100); return `<div class="tier${got >= 100 ? ' done' : got > 0 || i === cpu.tier ? ' on' : ''}" style="--tc:${t.col}"><b>${esc(t.name)}</b><span>${i * 100 + 1} to ${(i + 1) * 100}</span><div class="prog"><i style="width:${got}%"></i></div></div>`; }).join('');
    $('bDeckLbl').textContent = deckOK() ? `Deck ${P.deck + 1}, average ${avgCost(curDeck())} Mana` : `Deck ${P.deck + 1} is not finished: ${curDeck().length} of ${DECK_SIZE} cards`;
    const bd = $('bDeck'); bd.innerHTML = ''; for (const id of curDeck()){ const c = cardEl(id, {lvl:lvl(id)}); c.onclick = () => sheet(id); bd.appendChild(c); }
    $('bSets').innerHTML = setsHTML(curDeck(), true);
    const qr = $('quickRow'); qr.innerHTML = '';
    for (const sk of SKILLS){ const b = document.createElement('button'); b.type = 'button'; b.className = 'k-btn sk-' + sk.id; b.innerHTML = `${sk.name}<small>${COIN}${sk.coins}</small><em>${sk.pack ? 'card and a pack' : sk.card ? 'and a card' : 'coins'}</em>`; b.onclick = () => preCpu(randomCpu(sk.id, myTower())); qr.appendChild(b); }
  } else if (curTab === 'Deck'){
    const d = curDeck(), seg = $('deckSeg'); seg.innerHTML = '';
    for (let i = 0; i < DECK_SLOTS; i++){ const n = P.decks[i].length, b = document.createElement('button'); b.type = 'button'; b.innerHTML = `Deck ${i + 1}${n === DECK_SIZE ? '' : ` <small>${n}/${DECK_SIZE}</small>`}`; b.setAttribute('aria-pressed', i === P.deck); b.onclick = () => { P.deck = i; pend = null; deckMsg = ''; slotOn = false; save(); hub(); }; seg.appendChild(b); }
    $('deckAvg').textContent = d.length ? `${d.length} of ${DECK_SIZE} cards, average ${avgCost(d)} Mana` : 'Nothing in it yet';
    $('deckSets').innerHTML = setsHTML(d);
    const g = $('deckGrid'); g.innerHTML = '';
    d.forEach((id, i) => { const c = withInfo(cardEl(id, {lvl:lvl(id), cls:pend ? 'pickme' : ''}), id); c.onclick = e => { if (e.target.closest('.inf')) return sheet(id); if (pend) putIn(pend, i); else takeOut(i); }; g.appendChild(c); });
    for (let i = d.length; i < DECK_SIZE; i++){ const sl = document.createElement('button'); sl.type = 'button'; sl.className = 'slot' + (slotOn && i === d.length ? ' on' : ''); sl.textContent = '+'; sl.setAttribute('aria-label', 'Empty place. Pick a card for it'); sl.onclick = pickForSlot; g.appendChild(sl); }
    $('deckFill').disabled = d.length >= DECK_SIZE; $('deckClear').disabled = !d.length; $('deckClear').textContent = clearT ? 'Press again to empty it' : 'Clear this deck';
    const side = matchMedia('(min-width:1100px)').matches;
    $('deckHint').innerHTML = deckMsg ? `<span class="err">${esc(deckMsg)}</span>${pend ? ' <button type="button" class="link" id="swapX" style="padding:2px 6px">Cancel</button>' : ''}`
      : slotOn && d.length < DECK_SIZE ? `<b>Now pick a card from ${side ? 'your cards on the right' : 'your cards below'}.</b> It goes in the lit place.`
      : `Click a card on ${matchMedia('(min-width:1100px)').matches ? 'the right' : 'the list below'} to put it in, and a card in the deck to take it out. The <b>i</b> on a card opens its sheet. ${DECK_SIZE} cards make a deck: one version of each character${OWN ? '. The limits on Rare, Epic, Legendary and God cards do not apply to this account' : `, and no more than ${RAR_CAP.r} Rare, ${RAR_CAP.e} Epic, ${RAR_CAP.l} Legendary and one God`}. ${SET_AT.join(', ').replace(/, (\d+)$/, ' or $1')} cards of one type give that type ${SET_MUL.map(m => Math.round((m - 1) * 100) + '%').join(', ').replace(/, (\d+%)$/, ' or $1')} more health and damage.`;
    const sx = $('swapX'); if (sx) sx.onclick = () => { pend = null; deckMsg = ''; hub(); };
    lists.own.draw();
  } else if (curTab === 'Market') market();
  else profile();
}
/* the little i on a card in the deck builder: the card itself is the button that moves it, so its sheet needs a handle of its own (I on the keyboard) */
function withInfo(c, id){ const s = document.createElement('span'); s.className = 'inf'; s.textContent = 'i'; s.title = 'What it does'; c.appendChild(s); c.addEventListener('keydown', e => { if (e.key === 'i' || e.key === 'I'){ e.preventDefault(); sheet(id); } }); return c; }
const setDeck = d => { P.decks[P.deck] = d; pend = null; deckMsg = ''; clearT = 0; slotOn = false; save(); hub(); };
/* an empty place in the deck was clicked: light the next free one and show where the cards are */
function pickForSlot(){
  slotOn = true; deckMsg = ''; pend = null; BDB.sfx.tick(); hub();
  const own = document.querySelector('.dk-own'); if (!own) return;
  own.classList.remove('nudge'); void own.offsetWidth; own.classList.add('nudge');
  if (!matchMedia('(min-width:1100px)').matches) own.scrollIntoView({behavior:BDB.reduced ? 'auto' : 'smooth', block:'start'});
  else { const q = own.querySelector('input[type=search], input'); if (q && matchMedia('(hover:hover)').matches) q.focus({preventScroll:true}); }
}
function addCard(id){
  const d = curDeck().slice(), C = CARDS[id], same = d.findIndex(x => CARDS[x].base === C.base);
  if (same >= 0) d[same] = id;                                       // another build of a character already in the deck takes that one's place
  else if (d.length >= DECK_SIZE){ pend = pend === id ? null : id; deckMsg = pend ? `The deck is full. Click the card in it that ${C.name} should replace.` : ''; BDB.sfx.tick(); return hub(); }
  else d.push(id);
  const bad = limitProblem(d); if (bad){ deckMsg = bad; pend = null; BDB.sfx.bad(); return hub(); }
  BDB.sfx.tick(); setDeck(d);
}
function takeOut(i){ if (i < 0) return; const d = curDeck().slice(); d.splice(i, 1); BDB.sfx.tick(); setDeck(d); }
function putIn(id, i){ const d = curDeck().slice(); d[i] = id; const bad = limitProblem(d); if (bad){ deckMsg = bad; pend = null; BDB.sfx.bad(); return hub(); } BDB.sfx.good(); setDeck(d); }
/* fill the empty places from what the player owns: two spells, something for the air, a few cheap troops and a big one first, then the best of the rest */
function fillDeck(){
  const d = curDeck().slice(), have = new Set(d.map(i => CARDS[i].base)), RW = {c:1, r:2, e:3.2, l:4.6, g:6}, score = id => RW[CARDS[id].rar] + lvl(id) * .35;
  const owned = Object.keys(P.cards).filter(id => CARDS[id] && P.cards[id] > 0).sort((a, b) => score(b) - score(a) || CARDS[a].cost - CARDS[b].cost);
  const add = f => { for (const id of owned){ const C = CARDS[id]; if (have.has(C.base) || (f && !f(C))) continue; if (limitProblem(d.concat([id]))) continue; d.push(id); have.add(C.base); return true; } return false; };
  const want = (f, n) => { while (d.length < DECK_SIZE && d.filter(i => f(CARDS[i])).length < n && add(f)); };
  want(C => C.kind === 'spell', 2); want(C => C.kind === 'unit' && C.U && C.U.air && !C.U.fly, 2); want(C => C.kind === 'unit' && C.cost <= 3, 4); want(C => C.kind === 'unit' && C.U && C.U.hp >= 900, 2);
  while (d.length < DECK_SIZE && add(C => C.kind === 'unit' && (avgCost(d) < 4.1 || C.cost <= 3)));
  while (d.length < DECK_SIZE && add(null));
  if (d.length < DECK_SIZE) deckMsg = `You only own enough for ${d.length} of the ${DECK_SIZE}. The Market has the rest.`;
  const m = deckMsg; setDeck(d); if (m && d.length < DECK_SIZE){ deckMsg = m; hub(); }
}
$('deckFill').onclick = fillDeck;
$('deckClear').onclick = () => { if (!curDeck().length) return; if (!clearT){ clearT = setTimeout(() => { clearT = 0; if (curTab === 'Deck' && !B) hub(); }, 2600); BDB.sfx.tick(); return hub(); } clearTimeout(clearT); BDB.sfx.bad(); setDeck([]); };

/* ---------- profile: the numbers, and the upgrades bought with tokens from the ladder ---------- */
function profile(){
  $('pName').textContent = P.name;
  $('accNote').textContent = Cloud.session() ? 'Signed in. Your save is kept online, so it follows you to any device.' : Cloud.on ? 'This player is saved on this device only. Create an account from the sign in screen to keep it online and show up for friends.' : 'Saved on this device.';
  const s = P.stats, own = Object.keys(P.cards).length;
  $('pStats').innerHTML = [['Coins', coinsTxt()], ['Trophies', fmt(P.trophies)], ['Ladder', `${fmt(P.ladder)} of ${fmt(LEVELS)}`], ['Tier', tierOf(nextLevel()).name], ['Wins against BDB', s.w], ['Losses against BDB', s.l], ['Online wins', s.ow], ['Online losses', s.ol],
    ['Cards collected', `${fmt(own)} of ${fmt(CARD_IDS.length)}`], ['Cards won from BDB', s.won], ['Packs opened', s.packs], ['Card upgrades', s.up]].map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
  $('tokN').textContent = P.tokens;
  const pk = $('perks'); pk.innerHTML = '';
  for (const k of PERK_IDS){
    const K = PERKS[k], r = P.perks[k], cost = r + 1, max = r >= K.max, can = !max && P.tokens >= cost, row = document.createElement('div'); row.className = 'perk' + (max ? ' max' : '');
    row.innerHTML = `<div><h4>${esc(K.name)}</h4><p>${r ? esc(K.text(r)) : 'Not bought yet.'}${max ? '' : ' Next level: ' + esc(K.text(r + 1))}</p><div class="pips">${Array.from({length:K.max}, (_, i) => `<i${i < r ? ' class="on"' : ''}></i>`).join('')}</div></div>
      <button type="button" class="k-btn${can ? ' primary' : ''}" ${can ? '' : 'disabled'}>${max ? 'Maxed' : `${cost} ${cost > 1 ? 'tokens' : 'token'}`}</button>`;
    row.querySelector('button').onclick = () => { if (P.tokens < cost || P.perks[k] >= K.max) return; P.tokens -= cost; P.perks[k]++; save(); BDB.sfx.big(); hub(); };
    pk.appendChild(row);
  }
  $('codeOut').value = Accounts.code(P); gfxUI();
}
/* graphics quality: Auto finds the level this device can hold; the player can pin one */
function gfxUI(){
  const g = V && V.gfx, seg = $('gfxSeg'); if (!seg) return;
  for (const b of seg.children) b.setAttribute('aria-pressed', !!g && String(g.mode) === b.dataset.g);
  $('gfxNote').textContent = !g ? '3D is still loading.' : (g.soft ? 'This browser is drawing without a graphics card, which is slow at any setting. Turn on "graphics acceleration" in the browser\'s settings and restart it. ' : '')
    + (g.mode === 'auto' ? `Auto steps the detail down when matches run slowly. Right now: ${g.name}.` : `Fixed at ${g.name}.`) + (g.card ? ` Graphics: ${g.card.replace(/^ANGLE \((.*)\)$/, '$1').slice(0, 90)}.` : '');
}
$('gfxSeg').onclick = e => { const b = e.target.closest('button'); if (!b || !V) return; V.setGfx(b.dataset.g === 'auto' ? 'auto' : +b.dataset.g); BDB.sfx.tick(); gfxUI(); };

/* codes typed into the Profile tab. What each one does is here; the codes themselves are not, only their fingerprints. */
const fprint = s => { let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const CODES = {'1frqvji':p => { p.coins = 99999999; return 'Done. 99,999,999 coins. Enter it again whenever you run low.'; }};
$('promoGo').onclick = () => {
  const f = CODES[fprint($('promoIn').value.trim().toUpperCase())];
  if (!f){ $('promoMsg').textContent = 'That code does nothing.'; BDB.sfx.bad(); return; }
  const msg = f(P); save(); BDB.sfx.big(); hub(); $('promoIn').value = ''; $('promoMsg').textContent = msg;
};
$('promoIn').onkeydown = e => { if (e.key === 'Enter') $('promoGo').click(); };
$('tdeckMoreB').onclick = () => { deckAll = true; BDB.sfx.tick(); market(); };

/* ---------- market: packs, type packs, ready-made decks, today's deals, every card ---------- */
let dealDay = -1, dealIds = [];
function deals(){ const day = Math.floor(Date.now() / 864e5); if (day !== dealDay){ dealDay = day; let a = day * 2654435761 >>> 0; const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; dealIds = []; while (dealIds.length < 6){ const id = crateRoll(r); if (!dealIds.includes(id)) dealIds.push(id); } } return dealIds; }
const priceNow = id => Math.round(CARDS[id].price * (deals().includes(id) ? DEAL : 1) / 5) * 5;
/* a ready-made deck costs what the cards you are missing would, less a fifth */
const deckCost = d => Math.round(d.deck.reduce((a, id) => a + (lvl(id) ? 0 : CARDS[id].price), 0) * .8 / 10) * 10;
/* a card arrives: new at level 1, or one level up if you already have it, or coins if it is maxed */
function grant(id){
  const L = lvl(id);
  if (!L){ P.cards[id] = 1; return {id, lvl:1, tag:'New', line:'New card'}; }
  if (L < MAX_LVL){ P.cards[id] = L + 1; return {id, lvl:L + 1, tag:'Level ' + (L + 1), line:`Already yours, so it goes up to level ${L + 1}`}; }
  const c = Math.round(CARDS[id].price * .2 / 5) * 5; P.coins += c; return {id, lvl:L, tag:'+' + fmt(c), line:`Already maxed, so you get ${fmt(c)} coins instead`};
}
function market(){
  const pr = $('packRow'); pr.innerHTML = '';
  for (const p of PACKS){
    const el = document.createElement('div'); el.className = 'pack'; el.style.setProperty('--pc', p.col);
    el.innerHTML = `<button type="button" class="foil" aria-label="What is in the ${esc(p.name)}"><img alt="" loading="lazy" src="art/${PACK_ART[p.id]}.webp"><b>${p.n}<small>cards</small></b></button><h4>${esc(p.name)}</h4><p>${esc(p.blurb)}</p><button type="button" class="k-btn primary buy">${COIN}${fmt(p.price)}</button>`;
    el.querySelector('.foil').onclick = () => packInfo(p);
    const b = el.querySelector('.buy'); b.disabled = P.coins < p.price; b.onclick = () => buyPack(p);
    pr.appendChild(el);
  }
  const tp = $('tpackRow'); tp.innerHTML = '';
  for (const t of TYPE_IDS){
    const b = document.createElement('button'), p = {...TYPE_PACK, id:'type-' + t, name:TYPES[t].name + ' Pack', col:TYPES[t].col, art:TYPE_ART[t], blurb:`Four ${TYPES[t].name} cards. One Rare or better, guaranteed.`};
    b.type = 'button'; b.className = 'tpack'; b.style.setProperty('--pc', p.col);
    b.innerHTML = `<img alt="" loading="lazy" src="art/${p.art}.webp"><b>${esc(TYPES[t].name)}</b><span>${COIN}${fmt(p.price)}</span>`;
    b.onclick = () => packInfo(p, t);
    tp.appendChild(b);
  }
  const tf = $('tdeckF'); if (!tf.children.length){ tf.innerHTML = `<button type="button" data-t="" aria-pressed="true">All ${THEME_DECKS.length}</button>` + TYPE_IDS.filter(t => THEME_DECKS.some(d => d.type === t)).map(t => `<button type="button" data-t="${t}" style="--ty:${TYPES[t].col}" aria-pressed="false">${esc(TYPES[t].name)}</button>`).join('');
    tf.onclick = e => { const b = e.target.closest('button'); if (!b) return; deckType = b.dataset.t; deckAll = false; for (const o of tf.children) o.setAttribute('aria-pressed', o.dataset.t === deckType); market(); }; }
  const td = $('tdeckRow'); td.innerHTML = '';
  const sample = !deckType && !deckAll, shown = new Set(); let nd = 0;
  for (const d of THEME_DECKS){
    if (deckType && d.type !== deckType) continue;
    if (sample){ if (shown.has(d.type) || nd >= 8) continue; shown.add(d.type); }
    nd++;
    const miss = d.deck.filter(id => !lvl(id)).length, el = document.createElement('button'), top5 = d.deck.slice().sort((a, b) => CARDS[b].price - CARDS[a].price).slice(0, 5);
    el.type = 'button'; el.className = 'tdeck' + (miss ? '' : ' own'); el.style.setProperty('--ty', TYPES[d.type].col);
    el.innerHTML = `<div class="fan"></div><h4>${esc(d.name)}</h4><p>${esc(d.blurb)}</p><div class="foot">${typeChip(d.type)}<span class="pr">${miss ? COIN + fmt(deckCost(d)) : 'Owned'}</span></div>`;
    const fan = el.querySelector('.fan'); top5.forEach((id, i) => { const c = cardEl(id, {div:true}); c.style.setProperty('--i', i - 2); fan.appendChild(c); });
    el.onclick = () => deckBox(d);
    td.appendChild(el);
  }
  $('tdeckMore').hidden = !sample; $('tdeckMoreB').textContent = `Show all ${THEME_DECKS.length} decks`;
  const dg = $('dealGrid'); dg.innerHTML = '';
  for (const id of deals()){ const c = cardEl(id, {price:lvl(id) ? 'Owned' : fmt(priceNow(id)), own:!!lvl(id), sale:!lvl(id), was:lvl(id) ? '' : fmt(CARDS[id].price), lvl:lvl(id)}); c.onclick = () => sheet(id); dg.appendChild(c); }
  lists.shop.draw();
}
/* one ready-made deck: every card in it, what it costs, buy it, use it */
function deckBox(d){
  const miss = d.deck.filter(id => !lvl(id)), cost = deckCost(d), inUse = curDeck().join() === d.deck.join();
  const b = dlg(`<div class="k-eyebrow">Ready-made deck</div><h3>${esc(d.name)}</h3><p>${esc(d.blurb)}</p>
    <div class="grid deck dk15" id="dbGrid"></div><div class="sets">${setsHTML(d.deck)}</div>
    <p class="note">Average ${avgCost(d.deck)} Mana. ${miss.length ? `You are missing ${miss.length} of the 15, so that is all you pay for.` : 'You own every card in it.'}</p>
    <div class="k-row">${miss.length ? `<button type="button" class="k-btn primary" id="dbBuy" ${P.coins < cost ? 'disabled' : ''}>Buy for ${COIN}${fmt(cost)}</button>` : `<button type="button" class="k-btn primary" id="dbUse" ${inUse ? 'disabled' : ''}>${inUse ? 'In use' : `Use as Deck ${P.deck + 1}`}</button>`}<button type="button" class="k-btn" id="dbX">Close</button></div>
    ${miss.length && P.coins < cost ? `<p class="note">You need ${fmt(cost - P.coins)} more coins.</p>` : ''}`);
  const g = b.querySelector('#dbGrid'); for (const id of d.deck){ const c = cardEl(id, {lvl:lvl(id), cls:lvl(id) ? '' : 'dim'}); c.onclick = () => sheet(id); g.appendChild(c); }
  b.querySelector('#dbX').onclick = dlgClose;
  const buy = b.querySelector('#dbBuy'), use = b.querySelector('#dbUse');
  if (buy) buy.onclick = () => { if (P.coins < cost) return; P.coins -= cost; for (const id of miss) P.cards[id] = 1; save(); BDB.sfx.big(); hub(); deckBox(d); };
  if (use) use.onclick = () => { P.decks[P.deck] = d.deck.slice(); save(); BDB.sfx.good(); dlgClose(); tab('Deck'); };
}
/* what a pack can hold, with the real odds, and the button that opens one */
function packInfo(p, type){
  const tot = RAR_IDS.reduce((a, r) => a + p.odds[r], 0), share = r => { const v = p.odds[r] / tot * 100; return (v && v < 1 ? v.toFixed(1) : Math.round(v)) + '%'; };
  const b = dlg(`<div class="k-eyebrow">What is inside</div><div class="foil big" style="--pc:${p.col}"><img alt="" src="art/${p.art || PACK_ART[p.id]}.webp"><b>${p.n}<small>cards</small></b></div><h3>${esc(p.name)}</h3><p>${esc(p.blurb)}</p>
    <div class="oddsx">${RAR_IDS.filter(r => r !== 'g' || p.odds.g > 0).map(r => `<div class="r-${r}"><b>${share(r)}</b><span>${RAR[r].name}</span></div>`).join('')}</div>
    <p class="note">That is the chance for each card. ${p.min ? `The last card is always ${RAR[p.min].name} or better${p.two ? `, and the one before it ${RAR[p.two].name} or better` : ''}. ` : ''}Builds are random, no pack holds the same character twice, and a card you already own goes up a level.</p>
    <div class="k-row"><button type="button" class="k-btn primary" id="pkBuy" ${P.coins < p.price ? 'disabled' : ''}>Open for ${COIN}${fmt(p.price)}</button><button type="button" class="k-btn" id="pkX">Close</button></div>
    ${P.coins < p.price ? `<p class="note">You need ${fmt(p.price - P.coins)} more coins.</p>` : ''}`);
  b.querySelector('#pkX').onclick = dlgClose; b.querySelector('#pkBuy').onclick = () => buyPack(p, type);
}
function buyPack(p, type){
  if (P.coins < p.price) return;
  P.coins -= p.price; P.stats.packs++;
  const got = openPack(p, type).map(grant); save();
  packReveal(p, got, () => { dlgClose(); hub(); }, () => buyPack(p, type));
}
/* tear the pack open, then the cards turn over one at a time, best last */
function packReveal(p, got, done, again){
  const b = dlg(`<div class="k-eyebrow">${esc(p.name)}</div><div class="opener" id="opn" style="--pc:${p.col}"><button type="button" class="foil big shake" id="opnPack" aria-label="Open the pack"><img alt="" src="art/${p.art || PACK_ART[p.id]}.webp"><b>${got.length}<small>cards</small></b></button></div>
    <p class="note" id="opnLine">Tap the pack to tear it open.</p><div class="k-row" id="opnRow"></div>`, {lock:true});
  const stage = b.querySelector('#opn'), line = b.querySelector('#opnLine'), row = b.querySelector('#opnRow'), fast = BDB.reduced || Q.get('fast');
  const finish2 = () => {
    const fresh2 = got.filter(g => g.tag === 'New').length;
    line.textContent = fresh2 === got.length ? 'All new.' : fresh2 ? `${fresh2} new, and the rest level up cards you already had.` : 'Nothing new this time, but every one of them made a card you own stronger.';
    row.innerHTML = `${again ? `<button type="button" class="k-btn" id="opnAgain" ${P.coins < p.price ? 'disabled' : ''}>Another for ${COIN}${fmt(p.price)}</button>` : ''}<button type="button" class="k-btn primary" id="opnOk">Done</button>`;
    row.querySelector('#opnOk').onclick = done; const ag = row.querySelector('#opnAgain'); if (ag) ag.onclick = again;
  };
  const open = () => {
    stage.innerHTML = '<div class="burst"></div><div class="pulled"></div>'; SND.rip(); line.textContent = ' ';
    const wrap = stage.querySelector('.pulled'); let i = 0;
    const els = got.map(g => { const s = document.createElement('div'); s.className = 'pull r-' + CARDS[g.id].rar; s.innerHTML = '<div class="flip"><div class="bk"></div><div class="ft"></div></div><small>&nbsp;</small>'; const c = cardEl(g.id, {lvl:g.lvl, now:true}); c.onclick = () => sheet(g.id); s.querySelector('.ft').appendChild(c); wrap.appendChild(s); return s; });
    const next = () => {
      if (!b.isConnected) return;
      if (i >= got.length) return finish2();
      const g = got[i], el = els[i++], r = CARDS[g.id].rar; el.classList.add('on'); el.querySelector('small').textContent = g.tag;
      r === 'l' ? SND.legend() : r === 'e' ? BDB.sfx.big() : r === 'r' ? BDB.sfx.good() : BDB.sfx.pop();
      setTimeout(next, fast ? 30 : r === 'l' ? 1500 : r === 'e' ? 950 : 430);
    };
    setTimeout(next, fast ? 0 : 520);
  };
  b.querySelector('#opnPack').onclick = open;
}

/* ---------- sign in ---------- */
function show(scr){ for (const s of ['scrLogin', 'scrOnb', 'scrHub', 'scrBattle']) $(s).hidden = s !== scr; }
function loginScreen(){
  show('scrLogin'); P = null;
  const w = $('whoList'); w.innerHTML = '';
  for (const p of Accounts.all()){ const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<span>${esc(p.name)}</span><small>${fmt(p.coins)} coins, ${Object.keys(p.cards).length} cards</small>`; b.onclick = () => signIn(p); w.appendChild(b); }
  $('loginErr').textContent = '';
}
function signIn(p){
  P = p; OWN = isOwner(P.name); ownGift = -1; ownerPerks(); Accounts.save(P);
  if (!P.onboarded && !Q.get('skip')) return onboard();
  P.onboarded = true; if (OWN) save();
  show('scrHub'); tab('Battle'); hallStart();
  const j = Q.get('join'); if (j && okCode(j) && !signIn.joined){ signIn.joined = true; joinFriend(j); } else if (!ownerHello() && !whatsNew()) rulesNote();
}
/* the owner is told once what the account came with */
function ownerHello(){
  if (ownGift < 0) return false;
  const slot = ownGift; ownGift = -1;
  const b = dlg(`<div class="k-eyebrow">Owner's account</div><h3>It is all yours, ${esc(P.name)}</h3>
    <ul class="abil"><li>Coins never run out here. Spend what you like and the counter fills itself back up.</li><li>${esc(CARDS[OWN_DECK[0]].name)} is in your collection, along with the rest of this deck. Every card in it is level ${MAX_LVL}.</li>
    <li>It is saved as Deck ${slot + 1} and picked. In testing it beat every ready-made deck in the Market and the top of the ladder. ${ownOver ? `It took the place of what was in Deck ${slot + 1}, the least finished of your spare decks.` : 'Your other decks are untouched.'}</li></ul>
    <div class="grid deck dk15" id="owGrid"></div>
    <div class="k-row"><button type="button" class="k-btn primary" id="owDeck">See the deck</button><button type="button" class="k-btn" id="owX">Close</button></div>`);
  const g = b.querySelector('#owGrid'); for (const id of OWN_DECK){ const c = cardEl(id, {lvl:lvl(id)}); c.onclick = () => sheet(id); g.appendChild(c); }
  b.querySelector('#owX').onclick = dlgClose; b.querySelector('#owDeck').onclick = () => { dlgClose(); tab('Deck'); };
  BDB.sfx.big(); return true;
}
/* anyone whose save came from the game as it was gets told, once, what changed */
function whatsNew(){
  if (!P.flags.moved || P.flags.told) return false;
  P.flags.told = 1; P.flags.bal1 = 1; save();
  const b = dlg(`<div class="k-eyebrow">Big update</div><h3>Welcome back, ${esc(P.name)}</h3>
    <p>The game has been rebuilt around your save. Your cards came across as their new versions, and any character that left the game was paid out at 150 coins.</p>
    <ul class="abil"><li>Every character now has one rarity and one of twelve types. Stack a type in your deck and it fights harder.</li><li>The ladder is 1,000 levels, with packs, cards and tower upgrades along the way.</li>
    <li>The Market sells card packs and ${THEME_DECKS.length} ready-made decks.</li><li>Mana comes in faster every two minutes of a match: x1.5, x2, x2.5, then triple for the last two.</li></ul>
    <div class="k-row"><button type="button" class="k-btn primary" id="wnOk">Show me</button></div>`);
  b.querySelector('#wnOk').onclick = () => { dlgClose(); tab('Market'); };
  return true;
}
/* a save from before the rebalance is told once what changed */
function rulesNote(){
  if (P.flags.bal1) return false;
  P.flags.bal1 = 1; save();
  const short = P.decks.some(d => d.length && d.length < DECK_SIZE);
  const b = dlg(`<div class="k-eyebrow">Rebalanced</div><h3>The rules changed, ${esc(P.name)}</h3>
    <ul class="abil"><li>Towers are much tougher and troops walk slower, so a match is a fight and not a sprint.</li>
    <li>Flyers pay for their wings with less health, damage and speed. Nothing with a sword can reach them, and they had been winning far too much.</li>
    <li>A card level adds ${Math.round(LVL_STEP * 100)}% now, not 8%. Every two levels a card changes colour: bronze, silver, gold, diamond.</li>
    <li>${OWN ? 'Decks are limited to 7 Rare, 5 Epic, 3 Legendary and 1 God. Not yours: this account has no limits.' : `A deck holds at most ${RAR_CAP.r} Rare, ${RAR_CAP.e} Epic, ${RAR_CAP.l} Legendary and 1 God.${short ? ' A deck of yours was over that and has lost cards: fill it back up on the Deck tab.' : ''}`}</li>
    <li>New on the Battle tab: a daily reward, a win streak that pays extra coins, a pack for every ten towers you take, and a way to skip to the tier boss.</li>
    <li>BDB plays quicker at the bottom of the ladder and saves up for proper pushes at the top.</li></ul>
    <div class="k-row"><button type="button" class="k-btn primary" id="rnOk">Got it</button></div>`);
  b.querySelector('#rnOk').onclick = dlgClose;
  return true;
}
$('newGo').onclick = () => {
  const n = Accounts.cleanName($('newName').value);
  if (n.length < 2){ $('loginErr').textContent = 'Pick a name with at least two letters.'; return; }
  signIn(Accounts.get(n) || fresh(n));
};
async function accSign(create){
  const n = Accounts.cleanName($('newName').value), pw = $('newPass').value, err = t => { $('loginErr').textContent = t; };
  if (n.length < 2) return err('Pick a name with at least two letters.');
  if (pw.length < 4) return err('Use a password with at least four characters.');
  err(create ? 'Creating your account.' : 'Signing in.');
  try {
    if (create){
      const local = Accounts.get(n) || fresh(n), r = await Cloud.register(n, pw, local);
      if (r.error) return err(r.error === 'taken' ? 'That name is taken. Sign in instead, or pick another.' : 'That did not work. Check the name and password.');
      local.name = r.name; signIn(local);
    } else {
      const r = await Cloud.login(n, pw);
      if (r.error) return err('Wrong name or password.');
      signIn(r.data && r.data.cards ? sanitize({...r.data, name:r.name}) : fresh(r.name));
    }
  } catch(e){ err(cloudWhy(e)); }
}
$('accIn').onclick = () => accSign(false); $('accNew').onclick = () => accSign(true);
$('newPass').addEventListener('keydown', e => { if (e.key === 'Enter') accSign(false); });
if (!Cloud.on){ document.querySelector('.login').classList.add('nocloud'); $('newGo').textContent = 'Play'; $('newGo').classList.add('primary'); }
$('newName').addEventListener('keydown', e => { if (e.key === 'Enter') $('newGo').click(); });
$('codeToggle').onclick = () => { $('codeBox').hidden = !$('codeBox').hidden; };
$('codeGo').onclick = () => { try { signIn(Accounts.fromCode($('codeIn').value)); } catch(e){ $('loginErr').textContent = e.message; } };
$('codeCopy').onclick = async () => { try { await navigator.clipboard.writeText($('codeOut').value); $('codeCopy').textContent = 'Copied'; } catch(e){ $('codeOut').select(); } setTimeout(() => { $('codeCopy').textContent = 'Copy code'; }, 1500); };
$('signOut').onclick = () => { Cloud.flush(); Cloud.signOut(); Accounts.signOut(); clearInterval(hallT); loginScreen(); };
$('wipe').onclick = () => confirmBox('Delete this player?', `${P.name}'s cards, coins and decks will be gone from this device.`, 'Delete', () => { Accounts.remove(P.name); loginScreen(); });
$('mute').onclick = () => { $('mute').textContent = BDB.sfx.toggle() ? 'Sound off' : 'Sound on'; };
$('mute').textContent = BDB.sfx.muted ? 'Sound off' : 'Sound on';

/* ---------- first time in: how it works, pick a free Rare, build a deck out of your starting coins ---------- */
function onboard(){
  show('scrOnb'); const box = $('onbBox'); let hero = null, picks = [], ft = '', fk = '';
  const pool = CARD_IDS.filter(id => { const c = CARDS[id]; return c.aff === 'std' && (c.rar === 'c' || c.rar === 'r'); }).sort((a, b) => CARDS[a].cost - CARDS[b].cost || RO[CARDS[a].rar] - RO[CARDS[b].rar] || CARDS[a].name.localeCompare(CARDS[b].name));
  const spent = () => picks.reduce((a, id) => a + CARDS[id].price, 0), NEED = DECK_SIZE - 1;
  const step1 = () => {
    box.innerHTML = `<div class="k-eyebrow">Welcome, ${esc(P.name)}</div><h2>How a brawl works</h2>
      <div class="tips"><div><b>1</b><h4>Drop cards on your half</h4><p>Drag a card onto the field, or tap the card and then the spot. Stronger cards cost more Mana.</p></div>
      <div><b>2</b><h4>Mind your Mana</h4><p>It refills on its own, and half as fast again every two minutes, up to triple for the last two. The longer the match, the bigger the plays.</p></div>
      <div><b>3</b><h4>Take his towers</h4><p>Knock down more towers than he does in ten minutes. Take the king tower and it ends on the spot. Level at the bell means two minutes of overtime at four times the Mana, and the next tower wins.</p></div>
      <div><b>4</b><h4>Build around a type</h4><p>Every card has a type: Dragon, Fire, Dark Arts and nine more. Four or more of one type in your deck and that type fights harder.</p></div></div>
      <div class="k-row"><button type="button" class="k-btn primary big" id="onNext">Pick my free Rare</button></div>`;
    $('onNext').onclick = step2;
  };
  const step2 = () => {
    box.innerHTML = `<div class="k-eyebrow">Step 1 of 2</div><h2>Pick your free Rare</h2><p class="note">One of these six is yours to keep. Each does something no Common can.</p><div class="heroes" id="onHeroes"></div>
      <div class="k-row"><button type="button" class="k-btn" id="onBack">Back</button><button type="button" class="k-btn primary big" id="onNext" ${hero ? '' : 'disabled'}>Take this one</button></div>`;
    const wrap = $('onHeroes');
    for (const hb of FREE_RARES){
      const id = hb + '-std', c = CARDS[id], el = document.createElement('button'); el.type = 'button'; el.className = 'hpick' + (hero === id ? ' on' : ''); el.style.setProperty('--ty', TYPES[c.type].col);
      el.innerHTML = `<div class="hc"></div><div><h4>${esc(c.name)}</h4><div class="chips">${typeChip(c.type)}<span class="rchip">${esc(ROLE_NAME[c.U.role])}</span><span class="rchip">${c.cost} Mana</span></div><p>${esc(c.desc)}</p></div>`;
      el.querySelector('.hc').appendChild(cardEl(id, {div:true, now:true}));
      el.onclick = () => { hero = id; picks = picks.filter(p => CARDS[p].base !== c.base); for (const o of wrap.children) o.classList.toggle('on', o === el); $('onNext').disabled = false; BDB.sfx.tick(); };
      wrap.appendChild(el);
    }
    $('onBack').onclick = step1; $('onNext').onclick = () => { if (hero) step3(); };
  };
  const step3 = () => {
    box.innerHTML = `<div class="k-eyebrow">Step 2 of 2</div><h2>Build your deck</h2><p class="note">${esc(CARDS[hero].name)} is in. Pick ${NEED} more cards with your ${fmt(START_COINS)} coins. Whatever you do not spend, you keep. Hold a card, or right-click it, to read what it does.</p>
      <div class="bbar"><div class="budget">${COIN}<b id="obLeft"></b><small>left to spend</small></div><div class="bcount"><b id="obN"></b><small>of ${DECK_SIZE} cards</small></div><div class="sets" id="obSets"></div></div>
      <div class="grid deck dk15" id="obDeck"></div>
      <div class="qfill"><span class="note">Or start from a ready one:</span>${STARTER_DECKS.map((d, i) => `<button type="button" class="k-btn" data-i="${i}">${esc(d.name)}</button>`).join('')}<button type="button" class="link" id="obClear">Clear</button></div>
      <div class="filters"><div class="tfilter" id="obT" role="group" aria-label="Type">${TYPE_IDS.map(t => `<button type="button" data-t="${t}" style="--ty:${TYPES[t].col}" aria-pressed="false">${esc(TYPES[t].name)}</button>`).join('')}</div>
        <select class="field" id="obK" aria-label="Kind"><option value="">Any kind</option><option value="unit">Troops</option><option value="build">Buildings</option><option value="spell">Spells</option><option value="trap">Traps</option></select></div>
      <div class="grid priced" id="obPool"></div><p class="err" id="obErr"></p>
      <div class="k-row"><button type="button" class="k-btn" id="onBack">Back</button><button type="button" class="k-btn primary big" id="onDone">Start playing</button></div>
      <p class="note">Epic and Legendary cards come from packs, the ladder and the Market once you are in.</p>`;
    const say = t => { $('obErr').textContent = t; if (t) BDB.sfx.bad(); };
    const draw = () => {
      const left = START_COINS - spent(), dk = $('obDeck'), pl = $('obPool'), bases = new Set([hero, ...picks].map(id => CARDS[id].base));
      $('obLeft').textContent = fmt(left); $('obN').textContent = picks.length + 1; $('obSets').innerHTML = setsHTML([hero, ...picks]); $('onDone').disabled = picks.length < NEED;
      dk.innerHTML = '';
      const h = cardEl(hero, {tag:'Free'}); h.onclick = () => sheet(hero); dk.appendChild(h);
      for (const id of picks){ const c = cardEl(id, {tag:fmt(CARDS[id].price)}); c.onclick = () => { picks = picks.filter(p => p !== id); say(''); BDB.sfx.tick(); draw(); }; dk.appendChild(c); }
      for (let i = picks.length; i < NEED; i++){ const e = document.createElement('div'); e.className = 'card empty'; dk.appendChild(e); }
      pl.innerHTML = '';
      for (const id of pool){
        const c = CARDS[id]; if (c.base === CARDS[hero].base || (ft && c.type !== ft) || (fk && c.kind !== fk)) continue;
        const inDeck = picks.includes(id), cant = !inDeck && (c.price > left || picks.length >= NEED), el = cardEl(id, {price:fmt(c.price), cls:inDeck ? 'inuse' : cant ? 'dim' : ''});
        el.onclick = () => {
          if (inDeck) picks = picks.filter(p => p !== id);
          else if (picks.length >= NEED) return say('Your deck is full. Tap a card in it to take it out.');
          else if (c.price > left) return say(`${c.name} costs ${fmt(c.price)} and you have ${fmt(left)} left.`);
          else if (bases.has(c.base)) return say('That character is already in your deck.');
          else picks.push(id);
          say(''); BDB.sfx.tick(); draw();
        };
        pl.appendChild(el);
      }
      if (!pl.children.length) pl.innerHTML = '<p class="note">Nothing matches that. Clear a filter to see more.</p>';
    };
    $('obT').onclick = e => { const b = e.target.closest('button'); if (!b) return; ft = ft === b.dataset.t ? '' : b.dataset.t; for (const o of $('obT').children) o.setAttribute('aria-pressed', o.dataset.t === ft); draw(); };
    $('obK').onchange = e => { fk = e.target.value; draw(); };
    box.querySelector('.qfill').onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.id === 'obClear') picks = []; else picks = STARTER_DECKS[+b.dataset.i].deck.filter(id => CARDS[id].base !== CARDS[hero].base && !FREE_RARES.includes(CARDS[id].base)).slice(0, NEED); say(''); BDB.sfx.good(); draw(); };
    $('onBack').onclick = step2;
    $('onDone').onclick = () => {
      const deck = [hero, ...picks], bad = deckProblem(deck);
      if (bad || spent() > START_COINS) return say(bad || 'That deck costs more than you have.');
      P.cards = {}; for (const id of deck) P.cards[id] = 1; P.decks = Array.from({length:DECK_SLOTS}, (_, i) => i ? [] : deck.slice()); P.deck = 0; P.coins = START_COINS - spent(); save(); BDB.sfx.big(); step4();
    };
    draw();
  };
  const step4 = () => {
    box.innerHTML = `<div class="k-eyebrow">You are in</div><h2>${P.coins ? `${fmt(P.coins)} coins left over` : 'Every coin spent'}</h2><p class="note" style="max-width:540px;margin:0 auto 6px">Win on the ladder for coins, packs and BDB's own cards. Spend coins in the Market on packs, ready-made decks and upgrades. There are ${fmt(CARD_IDS.length)} cards to collect.</p>
      <div class="bigcoin"><span class="coin"></span>${fmt(P.coins)}</div>
      <div class="k-row"><button type="button" class="k-btn primary big" id="onFight">Fight level 1</button><button type="button" class="k-btn big" id="onShop">See the Market</button></div>`;
    const done = t => { P.onboarded = true; save(); show('scrHub'); tab(t); hallStart(); return ownerHello(); };
    $('onShop').onclick = () => done('Market'); $('onFight').onclick = () => { if (!done('Battle')) preCpu(ladderCpu(1)); };
  };
  step1();
}

/* ---------- before a CPU match: who he is, what is on the line, the odds you want, and the draw for which of his cards is up for grabs ---------- */
/* what towers are worth, as a picture: one crown, two, three, and what each multiplies a win's coins by */
const crownPay = () => `<div class="crpay" role="img" aria-label="Towers taken multiply the coins of a win: one tower by ${CROWN_PAY[1]}, two by ${CROWN_PAY[2]}, all three by ${CROWN_PAY[3]}"><span>Towers pay</span>${[1, 2, 3].map(k => `<div>${'<i></i>'.repeat(k)}<b>x${CROWN_PAY[k]}</b></div>`).join('')}</div>`;
function preCpu(cpu, odds = 1){
  if (noDeck()) return;
  const ladder = !cpu.rand, first = ladder && cpu.level > P.ladder, carded = first || cpu.card, map = MAPS[cpu.map], T = ladder ? TIERS[cpu.tier] : null;
  const squad = [cpu, ...backupCpus(cpu, 3, myTower())], prizes = carded ? squad.map(c => weightedPick(c.deck, id => DRAW_W[CARDS[id].rar])) : [];
  let n = clamp(odds | 0, 1, 3);
  const b = dlg(`<div class="k-eyebrow">${esc(map.name)}. ${esc(map.blurb)}</div>
    <div class="vs"><div class="side"><div class="av me">${esc(P.name[0].toUpperCase())}</div>${esc(P.name)}</div><div class="mid">VS</div><div class="side" id="vsThem"></div></div>
    <div class="odds" id="vsOdds" role="group" aria-label="Odds">${[1, 2, 3].map(k => `<button type="button" data-n="${k}"><b>1 v ${k}</b><small>${esc(ODDS[k].name)}</small><em>${k > 1 ? 'x' + ODDS[k].pay + ' coins' : 'fair fight'}</em></button>`).join('')}</div>
    <p class="vs-note" id="vsNote"></p>
    <div class="facts" id="vsFacts"></div>
    <div class="pzrow" id="vsChips"></div>
    ${crownPay()}
    ${carded ? '<div class="vs-prizes" id="vsPrizes"></div><p class="note" id="vsLine">Drawing the cards.</p>' : `<p class="note">${ladder ? 'You have beaten this level before, so it pays half the coins and no card.' : 'Lose and you still get a few coins for showing up.'}</p>`}
    <div class="k-row"><button type="button" class="k-btn primary big" id="vsGo">Start</button><button type="button" class="k-btn" id="vsNo">Back</button></div>`);
  const slots = [], box = b.querySelector('#vsPrizes'); let spun = !carded, iv = 0, k = 0;
  if (box) for (let i = 0; i < 3; i++){ const d = document.createElement('div'); d.className = 'big-card spin'; box.appendChild(d); slots.push(d); }
  const line = () => { const l = b.querySelector('#vsLine'); if (l && spun) l.textContent = n > 1 ? `Beat ${n === 2 ? 'both' : 'all three'} and these ${NUM[n].toLowerCase()} cards are yours. Lose and you keep everything.` : `Beat him and ${CARDS[prizes[0]].name} is yours. Lose and you keep everything.`; };
  const draw = () => {
    for (const q of b.querySelectorAll('#vsOdds button')) q.setAttribute('aria-pressed', +q.dataset.n === n);
    b.querySelector('#vsThem').innerHTML = `<div class="avs">${squad.slice(0, n).map(() => `<div class="av"${T ? ` style="--tc:${T.col}"` : ''}></div>`).join('')}</div>${n > 1 ? `${NUM[n]} BDBs<small>${esc(squad.slice(0, n).map(c => c.name.replace(/ BDB$/, '')).join(', '))}</small>` : esc(cpu.name)}`;
    const O = ODDS[n], lv = cpuLvl(cpu), soft = cpuSoft(cpu);
    const nt = b.querySelector('#vsNote'); nt.hidden = n < 2; nt.textContent = n > 1 ? `${NUM[n]} BDBs at once. Each has a deck of his own and ${Math.round(O.el * 100)}% of the usual Mana.` : '';
    b.querySelector('#vsFacts').innerHTML = [ladder ? `Level ${fmt(cpu.level)}, ${T.name}` : cpu.tag.replace(/\..*$/, ''), n > 1 ? '' : ladder ? cpu.tag.replace(/\.$/, '') : '', `Cards level ${lv}${lv > cpu.lvl ? ', matched to yours' : ''}`, soft < 1 ? `Towers at ${Math.round(soft * 100)}% health` : '']
      .filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('');
    b.querySelector('#vsChips').innerHTML = prizeChips(cpu, first, n);
    slots.forEach((d, i) => { d.hidden = i >= n; });
    line();
  };
  b.querySelector('#vsOdds').onclick = e => { const q = e.target.closest('button[data-n]'); if (!q || +q.dataset.n === n) return; n = +q.dataset.n; BDB.sfx.tick(); draw(); };
  if (carded) iv = setInterval(() => { const fin = ++k >= 10; slots.forEach((d, i) => { d.innerHTML = ''; d.appendChild(cardEl(fin ? prizes[i] : pick(squad[i].deck), {div:true, now:true})); if (fin) d.classList.remove('spin'); });
    if (fin){ clearInterval(iv); spun = true; BDB.sfx.pop(); line(); } else BDB.sfx.tick(); }, BDB.reduced ? 10 : 110);
  draw();
  b.querySelector('#vsNo').onclick = () => { clearInterval(iv); dlgClose(); };
  b.querySelector('#vsGo').onclick = () => {
    clearInterval(iv); dlgClose();
    const lead = {...cpu, lvl:cpuLvl(cpu), tower:cpuTower(cpu), soft:cpuSoft(cpu)}, more = squad.slice(1, n).map(c => ({...c, lvl:lead.lvl, tower:lead.tower}));
    begin({mode:'cpu', cpu:lead, more, odds:n, first, prize:prizes.slice(0, n), map:cpu.map, oppName:n > 1 ? NUM[n] + ' BDBs' : cpu.name, units:unitsOf([...curDeck(), ...squad.slice(0, n).flatMap(c => c.deck)])});
  };
}

/* ---------- the match ---------- */
let B = null, raf = 0, lastT = 0, ticker = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function begin(o){
  const me = B = {...o, team:o.mode === 'guest' && !o.coop ? 1 : 0, me:o.mode === 'guest' ? 1 : 0, sel:-1, over:false, run:false, acc:0, ents:[], traps:[], prev:new Map(), netEv:[], handKey:'', info:null, said:{}, pz:null, pzUsed:[false, false], ready:null};
  if (o.mode === 'host') B.ready = new Promise(res => { B.rdRes = res; });
  show('scrBattle'); $('emoPanel').hidden = true; $('insp').hidden = true; $('btPause').disabled = false; $('hand').innerHTML = ''; $('nextCard').innerHTML = '';
  $('oppName').textContent = o.oppName; $('meName').textContent = P.name; $('meDot').textContent = P.name[0].toUpperCase();
  $('oppDot').style.cssText = o.mode === 'cpu' ? '' : 'background:#5a1320;display:grid;place-items:center;font:800 11px/1 var(--f-body)'; $('oppDot').textContent = o.mode === 'cpu' ? '' : o.oppName[0].toUpperCase();
  const w = $('wait'); w.hidden = false; w.innerHTML = `<div>${esc(MAPS[o.map].name)}<div class="note">Bringing both decks onto the field.</div></div>`;
  if (MD && V && o.units) try { await Promise.all([MD.needModels(o.units, Q.get('fast') ? 60000 : 25000), V.needFloor(o.map)]); } catch(e){}
  if (B !== me) return;                                   // they backed out while it loaded
  if (V) V.reset(B.team, o.map);
  if (V && o.units){ try { await Promise.race([V.warm(o.units), sleep(9000)]); } catch(e){} if (B !== me) return; }      // build every shader and send every model to the graphics card now, not mid-match
  B.ais = [];
  if (o.coop && o.mode === 'host'){                       // you and a friend against two BDBs, or three for a handicap. Two decks a side, so both sides' towers are tougher
    const cs = o.cpus, O = TEAM_ODDS[cs.length], dk = c => c.deck.map(id => ({id, lvl:c.lvl}));
    B.sim = createSim({map:o.map, decks:[myDeck(), o.oppDeck, ...cs.map(dk)], teams:[0, 0, ...cs.map(() => 1)], seed:(Math.random() * 2 ** 31) | 0, elMul:[1, 1, ...cs.map(c => c.ai.el * O.el)], start:[5, 5, ...cs.map(() => 5 * O.el)],
      towerLvl:[o.teamTower || myTower(), cs[0].tower || cs[0].lvl], boost:[{hp:TEAM_TOWERS}, {hp:TEAM_TOWERS * (cs[0].soft || 1)}]});
    B.ais = cs.map((c, i) => createAI(B.sim, 1, c.ai, Math.random, 2 + i));
  } else if (o.mode === 'host'){
    B.sim = createSim({map:o.map, decks:[myDeck(), o.oppDeck], seed:(Math.random() * 2 ** 31) | 0, towerLvl:[myTower(), o.oppTower]});
  } else if (o.mode === 'cpu'){                           // against BDB your player upgrades count; online everyone is even
    const c = o.cpu, k = P.perks, all = [c, ...(o.more || [])], O = ODDS[all.length];      // raised odds: every BDB has his own deck and Mana bar, and a share of the usual Mana
    B.sim = createSim({map:o.map, decks:[myDeck(), ...all.map(q => q.deck.map(id => ({id, lvl:c.lvl})))], teams:[0, ...all.map(() => 1)], seed:(Math.random() * 2 ** 31) | 0,
      elMul:[1 + k.flow * PERKS.flow.per, ...all.map(q => q.ai.el * O.el)], start:[5 + k.start * PERKS.start.per, ...all.map(() => 5 * O.el)], towerLvl:[myTower(), c.tower || c.lvl],
      boost:[{hp:1 + k.hp * PERKS.hp.per, dmg:1 + k.dmg * PERKS.dmg.per}, {hp:c.soft || 1}]});
    B.ais = all.map((q, i) => createAI(B.sim, 1, q.ai, Math.random, 1 + i));
  }
  hud(true);
  cancelAnimationFrame(raf); lastT = performance.now(); raf = requestAnimationFrame(loop);
  if (o.mode === 'guest' && room) room.send('rd', {}, OL && OL.opp);
  if (o.mode === 'host'){ w.innerHTML = `<div>${esc(MAPS[o.map].name)}<div class="note">Waiting for ${esc(o.mate || o.oppName)} to load in.</div></div>`; await Promise.race([B.ready, sleep(20000)]); if (B !== me) return; }
  let n = 3;
  const cd = () => { if (B !== me) return; if (n > 0){ w.innerHTML = `<div>${esc(MAPS[o.map].name)}<b>${n}</b></div>`; BDB.sfx.tick(); n--; setTimeout(cd, Q.get('fast') ? 60 : 800); } else { w.hidden = true; B.run = true; B.t0 = performance.now(); SND.horn(); talk(o.mode === 'cpu' ? (o.odds === 3 ? TALK.start3 : o.odds === 2 ? TALK.start2 : TALK.start) : o.coop ? [`Two of you? Fine. There are ${o.coop === 3 ? 'three' : 'two'} of me. You're teamed with ${o.mate}.`] : ["Two real players. BDB is watching from the break room."], true); if (o.mode === 'host') startTicker(); } };
  cd();
}
function startTicker(){ try { ticker = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),100)'], {type:'text/javascript'}))); ticker.onmessage = () => { if (document.hidden) hostPump(); }; } catch(e){} }
function hostPump(){
  if (!B || B.mode !== 'host' || !B.run) return;
  const target = Math.floor((performance.now() - B.t0) / 50); let n = 0;
  while (B.sim.tick < target && n++ < 60 && !B.simDone){
    for (const a of B.ais) a.tick();
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
    if (B.mode === 'cpu'){ B.acc += dt; let n = 0; while (B.acc >= DT && n++ < 6 && !B.sim.over){ for (const a of B.ais) a.tick(); B.sim.step(); B.acc -= DT; pump(); } if (n >= 6) B.acc = 0; }
    else if (B.mode === 'host') hostPump();
  }
  if (V){ V.setTraps(myTraps()); V.frame(B.pz || (B.mode === 'cpu' && !B.run) ? 0 : dt, B.mode === 'guest' ? B.ents : B.sim.ents); stepBubbles(); }
  hud();
  raf = requestAnimationFrame(loop);
}
/* the traps this player is allowed to see: their own team's, and any Instant Replay that has already been sprung */
const myTraps = () => !B ? [] : B.mode === 'guest' ? B.traps : !B.sim ? [] : B.sim.traps.filter(t => t.team === B.team || t.live > 0);
function note(text){ const d = document.createElement('div'); d.className = 'bnote'; d.textContent = text; for (const o of document.querySelectorAll('.bnote')) o.remove(); $('scrBattle').appendChild(d); setTimeout(() => d.remove(), 2200); }
function stamp(text, bad){ const d = document.createElement('div'); d.className = 'stamp' + (bad ? ' bad' : ''); d.textContent = text; $('scrBattle').appendChild(d); setTimeout(() => d.remove(), 1600); }

/* what the characters say: a line over their head when they arrive, and now and then when something goes their way */
const bubbles = [], lastSay = [0, 0];
function bubble(uid, text, mine, force){
  if (!V || !text || !uid) return;
  const now = performance.now(), k = mine ? 0 : 1;
  if (!force && (now - lastSay[k] < 1700 || bubbles.length >= 4)) return;
  if (bubbles.some(b => b.uid === uid)) return;
  lastSay[k] = now;
  const d = document.createElement('div'); d.className = 'sayb' + (mine ? ' mine' : ''); d.textContent = text; d.style.opacity = 0; $('arena').appendChild(d);
  bubbles.push({d, uid, until:now + 2300 + text.length * 26});
}
function stepBubbles(){
  const now = performance.now();
  for (let i = bubbles.length - 1; i >= 0; i--){
    const b = bubbles[i], p = now < b.until ? V.headOf(b.uid) : null;
    if (!p){ b.d.remove(); bubbles.splice(i, 1); continue; }
    b.d.style.opacity = 1; b.d.style.transform = `translate(${Math.round(clamp(p.x, 76, Math.max(76, p.w - 76)))}px,${Math.round(Math.max(54, p.y))}px) translate(-50%,-100%)`;
  }
}
const clearBubbles = () => { for (const b of bubbles) b.d.remove(); bubbles.length = 0; };
function onEvents(ev){
  for (const e of ev){
    if (e.e === 'tower'){
      const mine = e.team === B.team; SND.boom();
      if (!e.king){ stamp(mine ? 'Tower down' : 'Crown!', mine); if (!mine){ BDB.sfx.big(); const I = info(), n = I ? I.crowns[B.team] | 0 : 0; if (n >= 1 && n <= 2) note(`A win now pays x${CROWN_PAY[n]}`); } talk(B.mode === 'cpu' ? (mine ? TALK.heScores : TALK.youScore) : (mine ? TALK.pvpDown : TALK.pvpUp), true); if (B.mode === 'cpu' && Math.random() < .6) setTimeout(() => showEmote(mine ? pick([0, 2, 3]) : pick([1, 4]), false), 900); }
    } else if (e.e === 'king'){ if (e.team !== B.team && B.mode === 'cpu') talk(TALK.king); }
    else if (e.e === 'ot'){ stamp('Overtime'); note(`Two minutes, Mana x${OT_MANA}. The next tower wins`); SND.horn(); if (B.mode === 'cpu') talk(TALK.ot, true); }
    else if (e.e === 'drop' || e.e === 'spell'){
      const c = CARDS[e.id];
      if ((e.rar === 'l' || e.rar === 'g') && c){ const god = e.rar === 'g'; if (god) SND.god(); else SND.legend(); const d = document.createElement('div'); d.className = 'legend-banner' + (god ? ' god' : ''); d.innerHTML = `<small>${god ? 'A God takes the field' : 'Legendary'}</small><b>${esc(c.name)}</b>`; $('scrBattle').appendChild(d); setTimeout(() => d.remove(), 2000); if (e.team !== B.team && B.mode === 'cpu') talk(TALK.legend); }
      else e.e === 'drop' ? SND.drop() : SND.spell();
      if (c && e.e === 'drop' && e.u && c.kind === 'unit' && (c.rar !== 'c' || Math.random() < .6)){ const uid = e.u, line = sayFor(c.base, c.type), mine = e.team === B.team, big = c.rar === 'l' || c.rar === 'e' || c.rar === 'g'; setTimeout(() => { if (B && !B.over) bubble(uid, line, mine, big); }, 420); }
    } else if (e.e === 'boom' && e.k !== 'rage') SND.boom();
    else if (e.e === 'bolt' && e.q) SND.crack();
    else if (e.e === 'grow'){ if (Math.random() < .45) bubble(e.id, sayWhen('kill'), true); }
    else if (e.e === 'revive'){ bubble(e.id, sayWhen('low'), true); }
    else if (e.e === 'trapset'){ if (e.team === B.team) SND.trapSet(); else { note(B.mode === 'cpu' ? 'He set a trap' : 'They set a trap'); if (B.mode === 'cpu') talk(TALK.trapSet); } }
    else if (e.e === 'trap'){
      const mine = e.team === B.team, c = CARDS[e.id]; SND.trap();
      if (e.k !== 'counter'){ stamp(mine ? 'Trap!' : "It's a trap!", !mine); note(c ? c.name : 'Trap'); if (B.mode === 'cpu') talk(mine ? TALK.trapOnHim : TALK.trapHit, true); }
    } else if (e.e === 'negate'){ const mine = e.team !== B.team; SND.negate(); stamp(mine ? 'Waved off!' : 'No basket!', !mine); if (e.burn && e.pid === B.me) note(`You lose ${e.burn} Mana`); if (B.mode === 'cpu') talk(mine ? TALK.foulOnHim : TALK.foulOnYou, true); }
    else if (e.e === 'trapx'){ note(e.team === B.team ? 'Your trap was cleared' : 'You cleared a trap'); }
    else if (e.e === 'shbreak'){ if (e.twr) note(e.team === B.team ? 'Your tower shield broke' : 'His tower shield broke'); }
    else if (e.e === 'over' && !B.over){ B.over = true; if (V){ V.setGhost(false); V.setNoGo(false); } const w = e.w, cr = e.cr; setTimeout(() => finish(w, cr), Q.get('fast') ? 50 : 1700); }
  }
}
const info = () => { if (B.mode === 'guest') return B.info; const s = B.sim; if (!s) return null; const p = s.players[B.me]; return {el:p.el, hand:p.hand, next:p.next, left:s.left, phase:s.phase, crowns:s.crowns, pocket:s.pocket(B.team), bonus:p.idle > PATIENT}; };
function hud(force){
  const I = info(); if (!I) return;
  const key = I.hand.map(c => c.id).join() + '|' + I.next.id;
  if (force || key !== B.handKey){
    B.handKey = key;
    const hd = $('hand'); hd.innerHTML = ''; I.hand.forEach((c, i) => { const el = cardEl(c.id, {lvl:c.lvl, now:true}); el.dataset.slot = i; if (i === B.sel) el.classList.add('sel'); hd.appendChild(el); });
    const nx = $('nextCard'); nx.innerHTML = ''; nx.appendChild(cardEl(I.next.id, {div:true, now:true}));
  }
  const cs = $('hand').children;
  for (let i = 0; i < cs.length; i++){ const cost = CARDS[I.hand[i].id].cost, poor = cost > I.el, was = cs[i].classList.contains('poor');
    if (poor !== was){ cs[i].classList.toggle('poor', poor); if (!poor && B.run){ cs[i].classList.remove('ready'); void cs[i].offsetWidth; cs[i].classList.add('ready'); } }
    if (poor) cs[i].style.setProperty('--p', Math.min(1, I.el / cost).toFixed(3)); }
  $('coffeeFill').style.width = (I.el / MAX_EL * 100) + '%'; $('coffeeN').textContent = Math.floor(I.el);
  const rate = manaRate(I.left, I.phase === 'ot'), bonus = I.bonus && I.el < MAX_EL;      // half as fast again every two minutes
  $('coffee').classList.toggle('dbl', rate > 1 && rate < 3); $('coffee').classList.toggle('tpl', rate >= 3); $('coffee').classList.toggle('bonus', !!bonus); const nt = B.run ? myTraps().filter(t => !t.live && t.team === B.team).length : 0;
  $('coffeeLbl').textContent = (rate > 1 ? 'Mana x' + rate : 'Mana') + (bonus ? ', charging +30%' : '') + (nt ? `, ${nt} trap${nt > 1 ? 's' : ''} set` : '');
  if (B.run && I.phase === 'play'){
    if (rate > (B.said.rate || 1)){ B.said.rate = rate; stamp('Mana x' + rate); SND.horn(); if (B.mode === 'cpu' && rate === 2) talk(TALK.late, true); else if (B.mode === 'cpu' && rate === 3) talk(TALK.last, true); }
  }
  const t = Math.ceil(I.left); $('clockT').textContent = mmss(t);
  $('clockLbl').textContent = I.phase === 'ot' ? 'Overtime' : rate > 1 ? 'Mana x' + rate : 'Time left'; $('clock').classList.toggle('hot', I.phase === 'ot' || t <= 30);
  $('meCr').textContent = I.crowns[B.team]; $('oppCr').textContent = I.crowns[1 - B.team];
  if (B.run && !B.over && B.mode === 'cpu' && performance.now() - lastTalk > 38000){ lastTalk = performance.now(); BDB.roast(); }
}

/* ---------- playing cards: drag from the hand, or tap a card then tap the floor ---------- */
let aim = null;
function select(i){
  B.sel = i; for (const c of $('hand').children) c.classList.toggle('sel', +c.dataset.slot === i);
  const I = info(), c = i >= 0 && I ? CARDS[I.hand[i].id] : null; if (V){ V.setNoGo(!!c && c.kind !== 'spell' && !(c.U && c.U.any), I ? I.pocket : null); if (i < 0) V.setGhost(false); }
}
function ghostAt(cx, cy){
  const I = info(); if (!V || B.sel < 0 || !I) return null;
  const p = V.pick(cx, cy), c = CARDS[I.hand[B.sel].id];
  if (!p){ V.setGhost(false); return null; }
  const ok = canPlace(MAPS[B.map], B.team, c, p.x, p.z, I.pocket) && I.el >= c.cost;
  V.setGhost(true, p.x, p.z, c.spell ? c.spell.r : c.trap ? c.trap.r : Math.max(.7, c.U.r * (c.n > 1 ? 2 : 1.2)), ok, c.spell ? null : c.trap ? c.art : c.U.key, c.aff);
  return p;
}
function tryPlay(slot, p){
  if (!B || !B.run || B.over || B.pz || slot < 0 || !p) return false;
  const I = info(); if (!I) return false; const c = I.hand[slot]; if (!c) return false;
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
let floorAim = false, pan = null, pinch = 0; const ptrs = new Map();
const KEYCARD = {}; for (const id of CARD_IDS){ const c = CARDS[id]; if (c.U) for (const k of c.us || [c.u]) KEYCARD[k + '|' + c.aff] ??= id; }
$('arena').addEventListener('pointerdown', e => {
  if (!B || aim) return;
  ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY}); try { $('arena').setPointerCapture(e.pointerId); } catch(er){}
  if (ptrs.size === 2){ const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); floorAim = false; pan = null; if (V) V.setGhost(false); }
  else if (B.sel >= 0){ floorAim = true; ghostAt(e.clientX, e.clientY); }
  else pan = {x:e.clientX, y:e.clientY, moved:false};
});
$('arena').addEventListener('pointermove', e => {
  if (!B || !V) return;
  const pt = ptrs.get(e.pointerId); if (pt){ pt.x = e.clientX; pt.y = e.clientY; }
  if (ptrs.size === 2 && pinch){ const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); V.zoomBy(d / pinch); pinch = d; }
  else if (floorAim) ghostAt(e.clientX, e.clientY);
  else if (pan){
    if (!pan.moved && Math.hypot(e.clientX - pan.x, e.clientY - pan.y) > 7) pan.moved = true;
    if (pan.moved){ const a = V.pickWorld(pan.x, pan.y), b = V.pickWorld(e.clientX, e.clientY); if (a && b) V.panBy(a.x - b.x, a.z - b.z); pan.x = e.clientX; pan.y = e.clientY; }
  }
});
const arenaUp = e => {
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0;
  if (!B) return;
  if (floorAim){ floorAim = false; const p = ghostAt(e.clientX, e.clientY); if (!tryPlay(B.sel, p) && V) V.setGhost(false); }
  else if (pan){ const moved = pan.moved; pan = null; if (!moved && e.type === 'pointerup') inspect(e.clientX, e.clientY); }
};
$('arena').addEventListener('pointerup', arenaUp); $('arena').addEventListener('pointercancel', arenaUp);
$('arena').addEventListener('wheel', e => { if (!B || !V) return; e.preventDefault(); V.zoomBy(e.deltaY < 0 ? 1.14 : 1 / 1.14); }, {passive:false});
$('btView').onclick = () => { if (V) V.resetCam(); };

/* tap any character or tower on the field: who it is, what it does, how much health it has left */
let inspT = 0;
function inspect(cx, cy){
  const box = $('insp'), e = V && V.entityAt(cx, cy);
  if (!e){
    const p = V && V.pick(cx, cy), t = p && myTraps().find(q => Math.hypot(q.x - p.x, q.z - p.z) <= TRIG), c = t && CARDS[t.card];
    if (!c){ box.hidden = true; return; }
    const mine = t.team === B.team;
    box.className = 'insp ' + (mine ? 'mine' : 'theirs') + ' r-' + c.rar;
    box.innerHTML = `<div class="ih"><b>${esc(c.name)}</b><span>${mine ? 'Your trap' : 'Enemy trap'}, ${t.live ? 'sprung' : 'face down'}, ${RAR[c.rar].name}</span></div><p>${esc(c.desc + (c.note ? ' ' + c.note : ''))}</p><div class="ig">${statRows(c.id, 1).slice(0, 6).map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>`;
    box.hidden = false; clearTimeout(inspT); inspT = setTimeout(() => { box.hidden = true; }, 7000); return;
  }
  const U = e.U, id = KEYCARD[U.key + '|' + U.aff], c = id && CARDS[id], mine = e.team === B.team, m = lvlMul(e.lvl || 1);
  const rows = [['Health', `${Math.max(0, Math.ceil(e.hp))} / ${e.max}`]];
  if (U.dmg) rows.push([U.splash ? 'Area damage' : 'Damage', Math.round(U.dmg * m)], ['Hit speed', U.hit + 's'], ['Range', U.rng <= 1.5 ? 'Melee' : U.rng]);
  if (!U.bld) rows.push(['Speed', SPD(U.spd)]);
  rows.push(['Targets', U.only ? 'Buildings' : !U.dmg ? 'None' : U.air ? 'Air and ground' : 'Ground']);
  const what = U.twr ? (U.key === 'king' ? 'The king tower. Lose it and the match is over. It only wakes up once it is hit or a guard tower falls.' : 'A guard tower. It fires at anything in range, ground or air.') : c ? c.desc + (c.note ? ' ' + c.note : '') : 'Summoned by another card.';
  box.className = 'insp ' + (mine ? 'mine' : 'theirs') + (c ? ' r-' + c.rar : '');
  box.innerHTML = `<div class="ih"><b>${esc(c && (!c.n || c.n === 1) ? c.name : (AFF[U.aff].name ? AFF[U.aff].name + ' ' : '') + U.name)}</b><span>${mine ? 'Yours' : 'Enemy'}, level ${e.lvl || 1}${c ? ', ' + RAR[c.rar].name + ' ' + TYPES[c.type].name : ''}</span></div><p>${esc(what)}</p><div class="ig">${rows.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>`;
  box.hidden = false; clearTimeout(inspT); inspT = setTimeout(() => { box.hidden = true; }, 7000);
}
addEventListener('keydown', e => { if (!B || $('scrBattle').hidden) return; if (e.key >= '1' && e.key <= String(HAND)) select(B.sel === +e.key - 1 ? -1 : +e.key - 1); else if (e.key === 'Escape') select(-1); });
new ResizeObserver(() => { if (V && !$('scrBattle').hidden) V.resize(); }).observe($('arena'));
$('btQuit').onclick = () => { if (!B || B.over) return; confirmBox('Quit the match?', 'Quitting counts as a loss.', 'Quit match', () => { if (!B || B.over) return; B.over = true; if (B.mode !== 'cpu' && room) room.send('bye', {}, OL && OL.opp); finish(1 - B.team, null, 'You walked off.'); }); };

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

/* ---------- after the match: coins, cards, packs and upgrade tokens ---------- */
/* What the coins come to, and why. A win starts from what the match pays. Every tower taken raises it (CROWN_PAY), raised odds multiply it, then a win streak and
   the Signing Bonus upgrade add their share. A loss or a draw pays the showing-up money, half as much again for every tower you did take. */
function payout(base, crowns, o = {}){
  const rows = [[o.label || 'Match', fmt(base)]]; let c = base;
  const k = clamp(crowns | 0, 0, 3);
  if (o.win){
    if (k > 0){ c *= CROWN_PAY[k]; rows.push([k >= 3 ? 'All three towers' : k === 2 ? 'Two towers' : 'One tower', 'x' + CROWN_PAY[k]]); }
    if (o.pay > 1){ c *= o.pay; rows.push([o.payLabel, 'x' + o.pay]); }
    if (o.streak > 1){ c *= o.streak; rows.push([`Win streak of ${o.wins}`, '+' + Math.round((o.streak - 1) * 100) + '%']); }
    if (o.perk > 0){ c *= 1 + o.perk; rows.push(['Signing Bonus', '+' + Math.round(o.perk * 100) + '%']); }
  } else if (k > 0){ c *= 1 + .5 * k; rows.push([k >= 2 ? `${NUM[k]} towers taken` : 'One tower taken', '+' + 50 * k + '%']); }
  if (o.extra){ c += o.extra; rows.push([o.extraLabel, '+' + fmt(o.extra)]); }
  return {coins:Math.round(c), rows};
}
function finish(w, cr, why){
  if (!B || B.done) return; B.done = true; B.over = true; clearInterval(pzIv); B.pz = null; $('wait').hidden = true; clearBubbles();
  const I = info(), crowns = cr || (I ? I.crowns : [0, 0]), mine = clamp(crowns[B.team] | 0, 0, 3), win = w === B.team, draw = w < 0, lines = [], got = [];
  let pack = null, tokens = 0, pay, title = win ? 'Victory' : draw ? 'Draw' : 'Defeat';
  if (win){ P.streak++; P.best = Math.max(P.best, P.streak); } else if (!draw) P.streak = 0;
  const up = {win, wins:P.streak, streak:win ? streakMul(P.streak) : 1};
  if (B.mode === 'cpu'){
    const c = B.cpu, n = B.odds || 1, O = ODDS[n];
    if (win){
      P.stats.w++; let extra = 0, xl = '';
      for (const id of B.prize || []){ got.push(grant(id)); P.stats.won++; }
      if (c.rand){ if (c.pack) pack = PACK[c.pack]; }
      else if (B.first){
        const f = c.first || {}, was = P.ladder; P.ladder = Math.max(P.ladder, c.level);
        if (c.level > was + 1){ for (let i = was + 1; i < c.level; i++) extra += levelPrize(i).coins; extra = Math.round(extra / 2 / 10) * 10; xl = `${c.level - was - 1} levels skipped, at half pay`; }
        lines.push(c.level >= LEVELS ? 'That was the last one. The whole ladder is yours.' : c.boss ? `${c.name} is down. ${TIERS[c.tier + 1].name} tier is open.` : `Level ${fmt(c.level)} cleared.`);
        if (f.rar) got.push(grant(rollCard(f.rar)));
        if (f.token){ P.tokens += f.token; tokens = f.token; }
        if (f.pack) pack = PACK[f.pack];
      }
      pay = payout(B.first || c.rand ? c.coins : c.coins / 2, mine, {...up, label:c.rand ? `${SKILLS.find(k => k.id === c.skill).name} quick battle won` : B.first ? `Level ${fmt(c.level)} beaten` : `Level ${fmt(c.level)} again, at half pay`,
        pay:O.pay, payLabel:`${O.name}, 1 v ${n}`, perk:P.perks.coin * PERKS.coin.per, extra, extraLabel:xl});
    } else {
      if (draw) P.stats.d++; else P.stats.l++;
      lines.push(draw ? 'Nobody blinked. You keep everything.' : 'You keep all your cards.');
      pay = payout((c.lose || 10) * (draw ? 1.5 : 1), mine, {...up, label:draw ? 'A draw' : 'Showing up'});
    }
  } else {
    const n = B.coop | 0, O = TEAM_ODDS[n];
    if (n){ lines.push(win ? `You and ${B.mate || 'your friend'} beat ${NUM[n].toLowerCase()} BDBs.` : draw ? 'Nobody blinked.' : `${NUM[n]} BDBs were too many this time.`);
      pay = payout(win ? 120 : draw ? 50 : 30, mine, {...up, label:win ? `${n === 3 ? '2 v 3' : '2 v 2'} won` : draw ? 'A draw' : 'Showing up', pay:O.pay, payLabel:'Outnumbered, 2 v 3'}); }
    else {
      if (win){ P.trophies += 30; P.stats.ow++; lines.push('+30 trophies.'); } else if (!draw){ P.trophies = Math.max(0, P.trophies - 20); P.stats.ol++; lines.push('-20 trophies.'); }
      pay = payout(win ? 150 : draw ? 50 : 25, mine, {...up, label:win ? 'Online win' : draw ? 'A draw' : 'Showing up'});
    }
    endOnline();
  }
  // every tower taken also counts towards the bounty pack
  if (mine > 0){ P.bounty = Math.min(999, P.bounty + mine); lines.push(P.bounty >= BOUNTY ? `Tower bounty full: a ${PACK[bountyPack()].name} is waiting on the Battle tab.` : `Tower bounty ${P.bounty} of ${BOUNTY}.`); }
  const packGot = pack ? openPack(pack).map(grant) : null; if (pack) P.stats.packs++;
  if (why) lines.unshift(why);
  const coins = pay.coins; P.coins += coins; save();
  win ? BDB.sfx.big() : BDB.sfx.bad();
  const many = B.mode === 'cpu' && B.odds > 1;
  const line = B.mode === 'cpu' ? pick(win ? (many ? TALK.winMany : TALK.win) : draw ? ["A draw. We'll both tell people we won."] : many ? TALK.loseMany : TALK.lose) : (win ? 'BDB watched the whole thing and learned nothing.' : draw ? 'A draw. BDB is counting it as a win for him anyway.' : 'BDB says he could have won that one. He could not.');
  const c = B.cpu, wasCpu = B.mode === 'cpu', ladder = wasCpu && !c.rand, nextUp = ladder && win && c.level < LEVELS && c.level + 1 <= P.ladder + 1, odds = B.odds || 1;
  // the result: who took how many towers and what each was worth, what BDB has to say about it, everything won laid out in one even row, and how the coins add up
  const theirN = crowns[1 - B.team] | 0, crownRow = n => Array.from({length:3}, (_, i) => `<span class="${i < n ? 'on' : ''}${i === n - 1 ? ' now' : ''}" style="--i:${i}"><i></i>${win ? `<b>x${CROWN_PAY[i + 1]}</b>` : ''}</span>`).join('');
  const rw = [`<div class="rw"><div class="rw-pic"><span class="coin"></span></div><b>+${fmt(coins)}</b><small>Coins</small></div>`]
    .concat(got.map((g, i) => `<div class="rw cardz" data-i="${i}"><div class="rw-pic"></div><b>${esc(CARDS[g.id].name)}</b><small>${esc(g.tag === 'New' ? 'New card' : g.tag)}</small></div>`))
    .concat(pack ? [`<div class="rw"><div class="rw-pic"><div class="foil" style="--pc:${pack.col}"><img alt="" src="art/${PACK_ART[pack.id]}.webp"></div></div><b>${esc(pack.name)}</b><small>${pack.n} cards inside</small></div>`] : [])
    .concat(tokens ? [`<div class="rw"><div class="rw-pic"><span class="tokbig"></span></div><b>+${tokens}</b><small>Upgrade ${tokens > 1 ? 'tokens' : 'token'}</small></div>`] : []);
  const b = dlg(`<div class="res ${win ? 'win' : draw ? 'draw' : 'loss'}">
    <div class="res-top"><div class="res-crowns${win ? ' paid' : ''}" aria-hidden="true">${crownRow(mine)}</div><h3>${title}</h3>
      <div class="res-score"><span>${esc(P.name)}<b>${mine}</b></span><em>towers</em><span><b>${theirN}</b>${esc(B.oppName || 'BDB')}</span></div></div>
    <div class="res-say"><span class="av"></span><p>${esc(line)}</p></div>
    <div class="res-loot">${rw.join('')}</div>
    <dl class="res-sum">${pay.rows.map(r => `<div><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join('')}<div class="tot"><dt>Coins</dt><dd>+${fmt(coins)}</dd></div></dl>
    ${lines.length || tokens ? `<p class="note">${lines.map(esc).join(' ')}${tokens ? ' Spend tokens on tower and Mana upgrades in your Profile.' : ''}</p>` : ''}
    <div class="res-btns">${pack ? `<button type="button" class="k-btn primary big" id="rsPack">Open the ${esc(pack.name)}</button>` : wasCpu ? `<button type="button" class="k-btn primary big" id="rsAgain">${c.rand ? 'Another one' : nextUp ? 'Next level' : 'Rematch'}</button>` : ''}<button type="button" class="k-btn${wasCpu || pack ? '' : ' primary big'}" id="rsBack">Back to menu</button></div></div>`, {lock:true});
  for (const el of b.querySelectorAll('.rw.cardz')){ const g = got[+el.dataset.i], cd = cardEl(g.id, {lvl:g.lvl, now:true}); cd.onclick = () => sheet(g.id); el.querySelector('.rw-pic').appendChild(cd); }
  const leave = () => { dlgClose(); stopBattle(); show('scrHub'); hub(); };
  const again = () => { leave(); preCpu(c.rand ? randomCpu(c.skill, myTower()) : ladderCpu(nextUp ? c.level + 1 : c.level), odds); };      // the same odds as last time, until you change them
  b.querySelector('#rsBack').onclick = leave;
  const ra = b.querySelector('#rsAgain'), rp = b.querySelector('#rsPack');
  if (ra) ra.onclick = again;
  if (rp) rp.onclick = () => { stopBattle(); show('scrHub'); hub(); packReveal(pack, packGot, () => { dlgClose(); hub(); }); };
}
function stopBattle(){ cancelAnimationFrame(raf); clearInterval(pzIv); if (ticker){ ticker.terminate(); ticker = null; } B = null; aim = null; floorAim = false; $('wait').hidden = true; clearBubbles(); for (const e of document.querySelectorAll('.emote,.stamp,.legend-banner,.bnote')) e.remove(); }

/* ---------- online ---------- */
let net = null, lobby = null, room = null, OL = null;
async function netUp(){ if (!net) net = await openTransport(Q.get('net') === 'local'); return net; }
function endOnline(){ const r = room, l = lobby; room = lobby = null; if (OL){ clearInterval(OL.iv); clearInterval(OL.hiIv); clearTimeout(OL.pt); clearTimeout(OL.to); } OL = null; setTimeout(() => { try { r && r.leave(); } catch(e){} try { l && l.leave(); } catch(e){} }, 400); }
function waitBox(title, text, extra = ''){ const b = dlg(`<div class="k-eyebrow">Online</div><h3>${esc(title)}</h3><p id="olText">${esc(text)}</p>${extra}<div class="k-row"><button type="button" class="k-btn" id="olX">Cancel</button></div>`, {lock:true}); b.querySelector('#olX').onclick = () => { endOnline(); dlgClose(); }; return b; }
const netFail = () => { endOnline(); msgBox('No connection', 'Could not reach the matchmaking relays. Check your internet and try again.'); };
$('olQuick').onclick = async () => {
  if (noDeck()) return;
  waitBox('Looking for a player', 'Waiting for someone else to hit Quick match. Send a friend the link to this page to speed it up.');
  try { await netUp(); } catch(e){ return netFail(); }
  if ($('dlg').hidden) return;
  lobby = net.join('brawl2-lobby'); OL = {state:'look', pending:null};
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
  if (noDeck()) return;
  const b = dlg(`<div class="k-eyebrow">Online</div><h3>Play a friend</h3><p>Start a match and send your friend the code, or type in the code they sent you. Team up and you share a side against two BDBs, or against three for double the coins.</p>
    <div class="k-row"><button type="button" class="k-btn primary" id="frNew">Start 1v1</button><button type="button" class="k-btn primary" id="frCo">Team up, 2 v 2</button><button type="button" class="k-btn primary" id="frCo3">Team up, 2 v 3</button></div>
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
  b.querySelector('#frNew').onclick = () => startFr(0); b.querySelector('#frCo').onclick = () => startFr(2); b.querySelector('#frCo3').onclick = () => startFr(3);
  b.querySelector('#frJoin').onclick = () => { const c = b.querySelector('#frCode').value.trim().toLowerCase(); if (!okCode(c)){ b.querySelector('#frErr').textContent = 'That code does not look right.'; return; } joinFriend(c); };
};
async function joinFriend(code){
  if (noDeck()) return;
  waitBox('Joining the match', 'Connecting to your friend.');
  try { await netUp(); } catch(e){ return netFail(); }
  if ($('dlg').hidden) return;
  enterMatch(code, false, true);
  OL.to = setTimeout(() => { if (OL && !OL.opp){ endOnline(); msgBox('Nobody there', 'No match was found with that code. Ask your friend to start a new one.'); } }, 30000);
}
function okDeck(d){ return Array.isArray(d) && d.every(c => c && typeof c.id === 'string') && !deckProblem(d.map(c => c.id), false) && d.every(c => Number.isInteger(c.lvl) && c.lvl >= 1 && c.lvl <= MAX_LVL); }
function enterMatch(code, host, keepBox, coop){
  if (lobby){ clearInterval(OL && OL.iv); const l = lobby; lobby = null; setTimeout(() => { try { l.leave(); } catch(e){} }, 300); }
  if (OL) clearTimeout(OL.pt);
  OL = {state:'wait', code, host, opp:null, coop:coop === true ? 2 : [2, 3].includes(coop) ? coop : 0};      // coop: how many BDBs the two of you are up against, 0 for a duel
  room = net.join('brawl2-m-' + code);
  if (!keepBox){ const t = $('olText'); if (t) t.textContent = 'Found someone. Setting up the match.'; }
  const hi = to => room && room.send('hi', {n:P.name, d:myDeck(), tw:myTower()}, to);
  room.onJoin(id => hi(id)); hi(); OL.hiIv = setInterval(() => { if (OL && !OL.opp) hi(); }, 1500);
  room.onLeave(id => { if (OL && id === OL.opp) oppLeft(); });
  room.onMessage((t, d, from) => {
    if (!OL || !d || typeof d !== 'object') return;
    if (t === 'hi'){
      if (!OL.host || OL.opp || !okDeck(d.d)) return;
      OL.opp = from; clearInterval(OL.hiIv);
      const map = pick(MAP_IDS), name = clean(d.n, 20) || 'Player', od = d.d.map(c => ({id:c.id, lvl:c.lvl})), tw = Number.isInteger(d.tw) ? Math.max(1, Math.min(MAX_LVL, d.tw)) : 1;
      // teamed up, the BDBs come from the host's place on the ladder and scout the two decks in front of them the way a ladder BDB does: cards and towers within two levels of the pair's
      const team = Math.round((myTower() + tw) / 2), lead = OL.coop ? ladderCpu(Math.max(1, P.ladder)) : null;
      const cpus = lead ? [lead, ...backupCpus(lead, OL.coop)].map(c => ({...c, lvl:Math.min(MAX_LVL, Math.max(lead.lvl, team - CPU_GAP)), tower:Math.max(lead.tower, team - CPU_GAP), soft:team > lead.lvl + 1 ? 1 : lead.soft})) : null;
      const units = unitsOf([...curDeck(), ...od.map(c => c.id), ...(cpus ? cpus.flatMap(c => c.deck) : [])]);
      room.send('go', {map, n:P.name, co:OL.coop, uk:units}, from); dlgClose();
      begin({mode:'host', map, coop:OL.coop, cpus, teamTower:team, mate:name, oppName:OL.coop ? NUM[OL.coop] + ' BDBs' : name, oppDeck:od, oppTower:tw, units});
    } else if (t === 'go'){
      if (OL.host || OL.opp || !MAPS[d.map]) return;
      OL.opp = from; clearInterval(OL.hiIv); clearTimeout(OL.to); dlgClose();
      const uk = Array.isArray(d.uk) ? d.uk.filter(k => typeof k === 'string' && Object.hasOwn(UNITS, k)).slice(0, 260) : [];
      const co = d.co === 3 ? 3 : d.co ? 2 : 0;
      begin({mode:'guest', map:d.map, coop:co, mate:clean(d.n, 20) || 'Player', oppName:co ? NUM[co] + ' BDBs' : clean(d.n, 20) || 'Player', units:[...new Set([...uk, ...unitsOf(curDeck())])]});
    } else if (from !== OL.opp || !B) return;
    else if (t === 'rd'){ if (B.mode === 'host' && B.rdRes) B.rdRes(); }
    else if (t === 's' && B.mode === 'guest') snap(d);
    else if (t === 'p' && B.mode === 'host'){ const s = d.slot, h = B.sim.players[1].hand; if (B.run && B.sim && Number.isInteger(s) && s >= 0 && s < HAND && h[s] && h[s].id === d.id && Number.isFinite(d.x) && Number.isFinite(d.z)) B.sim.play(1, s, d.x, d.z); }
    else if (t === 'em') showEmote(d.i, false);
    else if (t === 'pq' && B.mode === 'host'){ if (['pause', 'resume', 'ext', 'yes', 'no'].includes(d.a)) pzDo(d.a, 1); }
    else if (t === 'pz' && B.mode === 'guest'){ B.pz = d.on ? {by:d.by === 1 ? 1 : 0, left:Math.max(0, Math.min(3600, +d.left || 0)), ask:[0, 1, 2].includes(d.ask) ? d.ask : 0} : null; if (!B.pz) $('wait').hidden = true; pzUI(); }
    else if (t === 'bye') oppLeft();
  });
}
function snap(d){
  const s = d.s; if (!s || !Array.isArray(s.e) || !Array.isArray(s.h) || !B || B.done || typeof s.n !== 'string') return;
  const ok = id => CARDS[id] ? id : CARD_IDS[0];
  B.ents = decodeEnts(s.e, B.prev); B.prev = new Map(B.ents.map(e => [e.id, e])); B.traps = decodeTraps(s.tr);
  B.info = {el:+s.el || 0, hand:s.h.slice(0, HAND).map((id, i) => ({id:ok(id), lvl:(s.hl && s.hl[i]) || 1})), next:{id:ok(s.n)}, left:+s.l || 0, phase:s.ph === 'ot' ? 'ot' : s.ph === 'over' ? 'over' : 'play', crowns:Array.isArray(s.cr) ? s.cr : [0, 0], pocket:Array.isArray(s.pk) ? s.pk : [false, false], bonus:!!s.bo};
  if (Array.isArray(d.ev) && d.ev.length){ if (V) V.events(d.ev); onEvents(d.ev); }
}
const STANDIN = {react:1.3, hold:6.5, derp:.04, smart:.75, el:1};      // who plays a teammate's cards once they have gone
function oppLeft(){
  if (!B || B.done) return;
  if (B.coop && B.mode === 'host' && B.sim && B.run && !B.sim.over){      // your teammate dropped out: a stand-in takes their hand and the match goes on
    B.ais.push(createAI(B.sim, 0, STANDIN, Math.random, 1)); endOnline(); note(`${B.mate || 'Your teammate'} left. A stand-in has their cards.`); return;
  }
  B.over = true; if (B.coop) finish(-1, null, 'Your teammate left the match.'); else finish(B.team, null, 'Your opponent left the match.');
}

/* right-click any card, or hold your finger on it, for what it does and its stats */
addEventListener('contextmenu', e => { const c = e.target.closest && e.target.closest('.card[data-id]'); if (!c) return; e.preventDefault(); sheet(c.dataset.id); });
let holdT = 0, held = false;
addEventListener('pointerdown', e => { held = false; clearTimeout(holdT); const c = e.pointerType !== 'mouse' && e.target.closest && e.target.closest('.card[data-id]'); if (!c || c.closest('#hand')) return; const x = e.clientX, y = e.clientY, id = c.dataset.id;
  const off = () => { clearTimeout(holdT); removeEventListener('pointermove', mv); removeEventListener('pointerup', off); removeEventListener('pointercancel', off); }, mv = m => { if (Math.hypot(m.clientX - x, m.clientY - y) > 10) off(); };
  addEventListener('pointermove', mv); addEventListener('pointerup', off); addEventListener('pointercancel', off);
  holdT = setTimeout(() => { held = true; off(); sheet(id); }, 480); }, true);
addEventListener('click', e => { if (held){ held = false; e.stopPropagation(); e.preventDefault(); } }, true);

/* ---------- who's on: everyone signed in shows up, and everyone you see becomes a friend ---------- */
let hallT = 0, HALL = {online:[], invites:[]}; const seenInv = new Set();
function hallStart(){
  clearInterval(hallT); renderHall();
  if (!Cloud.session()) return;
  const tick = async () => {
    if (!P || !Cloud.session()) return;
    try {
      const r = await Cloud.ping(B ? 'battle' : TR ? 'trading' : 'menu'); if (!r || r.error || !Array.isArray(r.online)) return;
      HALL = r; let fresh2 = false; for (const o of r.online){ const nm = clean(o.name, 20); if (nm && !P.friends[nm]) fresh2 = true; if (nm) P.friends[nm] = Date.now(); }
      if (fresh2) save();
      renderHall();
      for (const iv of r.invites || []) if (iv && !seenInv.has(iv.id)){ seenInv.add(iv.id); gotInvite(iv); }
    } catch(e){}
  };
  tick(); hallT = setInterval(tick, (+Q.get('ping') || 8) * 1000);
}
const ago = t => { const m = Math.max(1, Math.round((Date.now() - t) / 60000)); return m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
function renderHall(){
  const box = $('hall'); if (!box || !P) return;
  if (!Cloud.session()){ $('hallLbl').textContent = "Who's on"; box.innerHTML = `<p class="note" style="margin:0">${Cloud.on ? 'Create an account on the sign in screen to see who is online, challenge them and trade cards. Everyone you play alongside is added as a friend automatically.' : 'Accounts are not set up on this copy of the game.'}</p>`; return; }
  const on = (HALL.online || []).map(o => ({name:clean(o.name, 20), status:o.status, tr:o.trophies | 0})).filter(o => o.name), names = new Set(on.map(o => o.name));
  const off = Object.keys(P.friends).filter(n => !names.has(n) && n.toLowerCase() !== P.name.toLowerCase()).sort((a, b) => P.friends[b] - P.friends[a]).slice(0, 12);
  $('hallLbl').textContent = `Who's on: ${on.length}`;
  box.innerHTML = (on.length ? '' : '<p class="note" style="margin:0 0 10px">Nobody else is on right now. They show up here the moment they sign in.</p>') +
    on.map(o => `<div class="pl on"><i></i><div><b>${esc(o.name)}</b><small>${o.status === 'battle' ? 'In a match' : o.status === 'trading' ? 'Trading' : 'In the menus'}, ${fmt(o.tr)} trophies</small></div><div class="acts" data-n="${esc(o.name)}">${o.status === 'menu' ? '<button type="button" class="k-btn primary" data-k="duel">Fight</button><button type="button" class="k-btn" data-k="coop">Team up</button><button type="button" class="k-btn" data-k="trade">Trade</button>' : ''}</div></div>`).join('') +
    off.map(n => `<div class="pl"><i></i><div><b>${esc(n)}</b><small>Friend, seen ${ago(P.friends[n])}</small></div><div></div></div>`).join('');
}
$('hall').onclick = e => {
  const q = e.target.closest('button[data-k]'); if (!q || B) return; const to = q.parentNode.dataset.n;
  if (q.dataset.k !== 'coop') return sendInvite(to, q.dataset.k);
  const b = dlg(`<div class="k-eyebrow">Team up</div><h3>You and ${esc(to)}</h3><p>You share a side against BDBs from your place on the ladder. Three of them is a handicap match: it pays double.</p>
    <div class="k-row"><button type="button" class="k-btn primary" data-n="2">2 v 2</button><button type="button" class="k-btn primary" data-n="3">2 v 3, coins x2</button><button type="button" class="k-btn" id="tuX">Cancel</button></div>`);
  b.querySelector('#tuX').onclick = dlgClose;
  for (const k of b.querySelectorAll('button[data-n]')) k.onclick = () => { dlgClose(); sendInvite(to, 'coop', +k.dataset.n); };
};
async function sendInvite(to, kind, n = 2){
  if (kind !== 'trade' && noDeck()) return;
  const code = rid(6);
  if (kind === 'trade') openTrade(code, to);
  else { waitBox(`Waiting for ${to}`, kind === 'coop' ? `Asking them to team up against ${NUM[n].toLowerCase()} BDBs. They have a minute to answer.` : 'Asking them for a 1v1. They have a minute to answer.'); try { await netUp(); } catch(e){ return netFail(); } if ($('dlg').hidden) return; enterMatch(code, true, true, kind === 'coop' ? n : 0); OL.to = setTimeout(() => { if (OL && !OL.opp){ endOnline(); msgBox('No answer', `${to} did not pick up. Try again in a bit.`); } }, 70000); }
  try { const r = await Cloud.invite(to, kind, code); if (!r || r.error) throw 0; } catch(e){ if (kind === 'trade') closeTrade(); else { endOnline(); dlgClose(); } msgBox('Could not send', 'The invite did not go through. Try again.'); }
}
function gotInvite(iv){
  const what = {duel:'wants a 1v1', coop:'wants to team up against BDBs', trade:'wants to trade cards'}[iv.kind], from = clean(iv.from, 20);
  if (!what || !okCode(iv.code) || !from) return;
  if (B || TR || !$('dlg').hidden || $('scrHub').hidden){ Cloud.inviteDone(iv.id); return; }        // busy: it lapses
  const b = dlg(`<div class="k-eyebrow">Invite</div><h3>${esc(from)}</h3><p>${what}.</p><div class="k-row"><button type="button" class="k-btn primary" id="ivY">Accept</button><button type="button" class="k-btn" id="ivN">Not now</button></div>`, {lock:true});
  BDB.sfx.big();
  b.querySelector('#ivY').onclick = () => { Cloud.inviteDone(iv.id); dlgClose(); if (iv.kind === 'trade') openTrade(iv.code, from); else joinFriend(iv.code); };
  b.querySelector('#ivN').onclick = () => { Cloud.inviteDone(iv.id); dlgClose(); };
}

/* ---------- trading: each side offers spare cards and coins, both lock, both confirm ---------- */
let TR = null;
const spare = () => { const used = new Set(P.decks.flat()); return Object.keys(P.cards).filter(id => !used.has(id)); };
async function openTrade(code, name){
  TR = {code, name, opp:null, mine:{cards:[], coins:0, lock:false}, theirs:{cards:[], coins:0, lock:false}, okMine:false, okTheirs:false, done:false};
  drawTrade();
  try { await netUp(); } catch(e){ TR = null; return netFail(); }
  if (!TR) return;
  const room = TR.room = net.join('brawl2-t-' + code), hello = to => TR && room.send('th', {n:P.name}, to);
  room.onJoin(id => hello(id)); hello(); TR.iv = setInterval(() => { if (TR && !TR.opp) hello(); }, 1500);
  TR.to = setTimeout(() => { if (TR && !TR.opp) closeTrade(`${name} did not pick up.`); }, 70000);
  room.onLeave(id => { if (TR && id === TR.opp && !TR.done) closeTrade(`${TR.name} left the trade.`); });
  room.onMessage((t, d, from) => {
    if (!TR || !d || typeof d !== 'object') return;
    if (t === 'th'){ if (!TR.opp){ TR.opp = from; TR.name = clean(d.n, 20) || TR.name; clearInterval(TR.iv); clearTimeout(TR.to); hello(from); sendOffer(); drawTrade(); } return; }
    if (from !== TR.opp || TR.done) return;
    if (t === 'to'){
      const cs = Array.isArray(d.cards) ? d.cards.filter(c => c && CARDS[c.id] && Number.isInteger(c.lvl) && c.lvl >= 1 && c.lvl <= MAX_LVL).slice(0, 5).map(c => ({id:c.id, lvl:c.lvl})) : [], coins = Math.max(0, Math.min(1e6, d.coins | 0));
      if (JSON.stringify(cs) !== JSON.stringify(TR.theirs.cards) || coins !== TR.theirs.coins){ TR.okMine = TR.okTheirs = false; if (TR.mine.lock){ TR.mine.lock = false; sendOffer(); } }      // their offer changed: nothing is agreed any more
      TR.theirs = {cards:cs, coins, lock:!!d.lock}; drawTrade();
    } else if (t === 'tc'){ if (TR.mine.lock && TR.theirs.lock){ TR.okTheirs = true; finishTrade(); drawTrade(); } }
    else if (t === 'tx') closeTrade(`${TR.name} called it off.`);
  });
}
function sendOffer(){ if (TR && TR.opp) TR.room.send('to', {cards:TR.mine.cards.map(id => ({id, lvl:lvl(id)})), coins:TR.mine.coins, lock:TR.mine.lock}, TR.opp); }
function changed(){ TR.mine.lock = false; TR.okMine = TR.okTheirs = false; sendOffer(); drawTrade(); }
function closeTrade(msg){ const t = TR; TR = null; if (t){ clearInterval(t.iv); clearTimeout(t.to); if (t.room){ if (t.opp && !t.done) t.room.send('tx', {}, t.opp); setTimeout(() => { try { t.room.leave(); } catch(e){} }, 400); } } dlgClose(); if (msg) msgBox('Trade', msg); hub(); }
function finishTrade(){
  if (!TR || TR.done || !TR.okMine || !TR.okTheirs) return;
  TR.done = true;
  for (const id of TR.mine.cards) delete P.cards[id];
  for (const c of TR.theirs.cards) P.cards[c.id] = Math.max(lvl(c.id), c.lvl);
  P.coins += TR.theirs.coins - TR.mine.coins; P.stats.tr = (P.stats.tr || 0) + 1; save(); BDB.sfx.big();
  const got = TR.theirs.cards.map(c => CARDS[c.id].name).concat(TR.theirs.coins ? [fmt(TR.theirs.coins) + ' coins'] : []).join(', ') || 'nothing';
  closeTrade(`Done. You got ${got} from ${TR.name}.`);
}
function drawTrade(){
  if (!TR) return;
  const linked = !!TR.opp, me = TR.mine, th = TR.theirs, both = me.lock && th.lock;
  const b = dlg(`<div class="k-eyebrow">Trade</div><h3>You and ${esc(TR.name)}</h3>
    <div class="trade"><div><span class="k-label">You give</span><div class="tg" id="tMine"></div><label class="tcoin"><span class="coin"></span><input class="field" id="tCoins" type="number" min="0" max="${P.coins}" value="${me.coins}" ${linked ? '' : 'disabled'}></label></div>
      <div><span class="k-label">You get</span><div class="tg" id="tTheirs"></div><div class="tcoin"><span class="coin"></span><b>${fmt(th.coins)}</b>${th.lock ? '<em>Locked</em>' : ''}</div></div></div>
    <p class="note" id="tMsg">${!linked ? `Waiting for ${esc(TR.name)} to join.` : TR.okMine ? `Waiting for ${esc(TR.name)} to confirm.` : both ? 'Both offers are locked. Confirm to make the swap.' : me.lock ? `Your offer is locked. Waiting for ${esc(TR.name)} to lock theirs.` : 'Tap spare cards to add them, set any coins, then lock your offer.'}</p>
    <span class="k-label">Your spare cards (not in a deck)</span><div class="grid tpool" id="tPool"></div>
    <div class="k-row"><button type="button" class="k-btn ${me.lock ? '' : 'primary'}" id="tLock" ${linked && !TR.okMine ? '' : 'disabled'}>${me.lock ? 'Unlock' : 'Lock my offer'}</button><button type="button" class="k-btn primary" id="tOk" ${both && !TR.okMine ? '' : 'disabled'}>Confirm trade</button><button type="button" class="k-btn ghost" id="tX">Cancel</button></div>`, {lock:true});
  const mineEl = b.querySelector('#tMine'), thEl = b.querySelector('#tTheirs'), pool = b.querySelector('#tPool');
  for (const id of me.cards){ const c = cardEl(id, {lvl:lvl(id)}); c.onclick = () => { if (TR.okMine) return; me.cards = me.cards.filter(x => x !== id); changed(); }; mineEl.appendChild(c); }
  for (const c of th.cards) thEl.appendChild(cardEl(c.id, {div:true, lvl:c.lvl}));
  if (!me.cards.length) mineEl.innerHTML = '<p class="note">Nothing yet.</p>'; if (!th.cards.length) thEl.innerHTML = '<p class="note">Nothing yet.</p>';
  const sp = spare().filter(id => !me.cards.includes(id)).sort((a, c) => CARDS[c].price - CARDS[a].price).slice(0, 40);
  for (const id of sp){ const c = cardEl(id, {lvl:lvl(id)}); c.onclick = () => { if (!linked || TR.okMine || me.cards.length >= 5) return; me.cards.push(id); changed(); }; pool.appendChild(c); }
  if (!sp.length) pool.innerHTML = '<p class="note">No spare cards. Cards in any of your three decks cannot be traded.</p>';
  b.querySelector('#tCoins').onchange = e => { me.coins = Math.max(0, Math.min(P.coins, Math.round(+e.target.value || 0))); changed(); };
  b.querySelector('#tLock').onclick = () => { me.lock = !me.lock; TR.okMine = TR.okTheirs = false; sendOffer(); drawTrade(); };
  b.querySelector('#tOk').onclick = () => { if (!(me.lock && th.lock)) return; TR.okMine = true; TR.room.send('tc', {}, TR.opp); finishTrade(); drawTrade(); };
  b.querySelector('#tX').onclick = () => closeTrade();
}

/* ---------- start ---------- */
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('sheet').hidden) $('sheet').hidden = true; });
listUI('own', () => Object.keys(P.cards), 'Your cards');
listUI('shop', () => CARD_IDS, 'All cards');
window.__game = {
  get state(){ return B ? (B.done ? 'done' : B.over ? 'over' : B.pz ? 'paused' : B.run ? 'play' : 'wait') : P ? (P.onboarded ? 'hub' : 'onboard') : 'login'; }, get score(){ return P ? P.coins : 0; },
  get P(){ return P; }, get B(){ return B; }, get TR(){ return TR; }, get hall(){ return HALL; }, cloud:Cloud, get sim(){ return B && B.sim; }, get info(){ return B ? info() : null; }, get ready3d(){ return ready3d; }, get view(){ return V; }, get ol(){ return OL; }, get bubbles(){ return bubbles.length; },
  play:(slot, x, z) => tryPlay(slot, {x, z}), give(n){ P.coins += n; save(); hub(); }, card(id, l = 1){ P.cards[id] = l; save(); hub(); }, unlock(n = LEVELS){ P.ladder = n; save(); hub(); }, tokens(n){ P.tokens += n; save(); hub(); },
  ff(n){ if (B && B.mode === 'cpu' && B.run) for (let i = 0; i < n && !B.sim.over; i++){ for (const a of B.ais) a.tick(); B.sim.step(); pump(); } return B ? B.sim.tick : 0; },
  deck(ids){ if (deckProblem(ids, false)) return deckProblem(ids, false); for (const id of ids) P.cards[id] = Math.max(1, P.cards[id] || 0); P.decks[P.deck] = ids.slice(); save(); hub(); return ''; },
  end(w){ if (B && B.sim){ B.over = true; finish(w, B.sim.crowns); } }, tab, hub, preCpu, ladderCpu, randomCpu, sheet, showEmote, pzAct, buyPack, packs:PACKS, cards:CARDS
};
const last = Accounts.last(), sess0 = Cloud.session();
if (sess0 && !Q.get('fresh')){                                   // signed in before: fetch the online save, fall back to this device's copy if the server is out of reach
  loginScreen(); $('loginErr').textContent = 'Signing you in.';
  Cloud.load().then(r => { if (r.error){ Cloud.signOut(); loginScreen(); } else signIn(r.data && r.data.cards ? sanitize({...r.data, name:r.name}) : fresh(r.name)); })
    .catch(() => { const p = Accounts.get(sess0.name); if (p) signIn(p); else { loginScreen(); $('loginErr').textContent = 'Could not reach the account server.'; } });
} else if (last && !Q.get('fresh')) signIn(last); else loginScreen();
initView();
