/* Break Room Brawl: screens, saves, the match loop and online play. Rules live in sim.js, drawing in view.js. */
import { CARDS, CARD_IDS, BASE_IDS, baseName, baseOf, UNITS, AFF, AFF_IDS, RAR, RAR_IDS, TYPES, TYPE_IDS, typeBonus, typeCount, SET_AT, SET_MUL, ROLE_NAME, MAPS, MAP_IDS, DECK_SIZE, HAND, MAX_LEGEND, MAX_GOD, DECK_SLOTS, MAX_LVL, START_COINS, START_GIFT, FREE_RARES,
  lvlMul, LVL_STEP, GRADES, gradeOf, capProblem, RAR_CAP, PACE, upgradeCost, SELL, SELL_GOD, sellPrice, deckProblem, DRAW_W, weightedPick, rollCard, crateRoll, STARTER_DECKS, SKILLS, randomCpu, ladderCpu, levelPrize, tierOf, LEVELS, TIERS, PACKS, TYPE_PACK, openPack, THEME_DECKS, PERKS, PERK_IDS, unitsOf, ODDS, TEAM_ODDS, TEAM_TOWERS, CROWN_PAY, backupCpus, brainName, JOBS, rollJobs, jobPay, MILESTONES, MS_IDS, MS_PRIZE, RAMPAGE, RAMP_AT, goalsOf, goalText, GOAL_COUNT,
  BOOSTS, BOOST_IDS, BOOST_FX, BOOST_DECK, BOOST_HAND, BOOST_EVERY, BOOST_R, TIER_NAME, boostName, deckTypes, starterBoosts, pickBoosts, cpuBoosts, BOOST_BOX, openBoostBox } from './cards.js?v=1119e';
import { createSim, decodeEnts, decodeTraps, canPlace, orderProblem, DT, MAX_EL, manaRate, PATIENT, TRIG, OT_MANA } from './sim.js?v=1119e';
import { createAI } from './ai.js?v=1119e';
import { Accounts, fresh, sanitize, isOwner, giftsFor } from './store.js?v=1119e';
import { Cloud, cloudWhy } from './cloud.js?v=1119e';
import { sayFor, sayWhen } from './talk.js?v=1119e';
import { createAudio } from './audio.js?v=1119e';
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
const BEEP = {drop:() => tone(190, .14, 'triangle', .09, -90), spell:() => tone(520, .3, 'sine', .06, 400), boom:() => tone(95, .4, 'sawtooth', .08, -55), horn:() => { tone(233, .5, 'square', .04); tone(311, .5, 'square', .03); },
  trapSet:() => tone(150, .1, 'triangle', .07, -50), trap:() => { tone(880, .07, 'square', .045); tone(1320, .16, 'square', .045, 0, .07); tone(110, .3, 'sawtooth', .06, -40, .05); }, negate:() => { tone(1700, .09, 'sine', .07); tone(1500, .32, 'sine', .07, -700, .1); },
  rip:() => { tone(900, .16, 'sawtooth', .05, -700); tone(140, .3, 'triangle', .08, -60, .08); [660, 880, 1175].forEach((f, i) => tone(f, .22, 'triangle', .05, 0, .16 + i * .07)); },
  legend:() => { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, .5, 'triangle', .07, 0, i * .09)); tone(98, .9, 'sawtooth', .06, -30); },
  crack:() => { tone(1500, .07, 'sawtooth', .035, -1200); tone(80, .22, 'sawtooth', .05, -35, .03); },
  god:() => { tone(55, 1.6, 'sawtooth', .1, -18); tone(82, 1.2, 'square', .05, -40, .05); [262, 392, 523, 784, 1046, 1568].forEach((f, i) => tone(f, .9, 'triangle', .07, 0, .1 + i * .11)); tone(1800, .25, 'sawtooth', .04, -1500, .02); }};
/* Recorded effects and music come from audio.js. Until they have loaded (or if they never do) the beeps above stand in. */
const A = createAudio({muted:() => BDB.sfx.muted});
const buzz = p => { try { if (navigator.vibrate && A.prefs.fx && !BDB.sfx.muted) navigator.vibrate(p); } catch(e){} };
const fx = (name, o, beep) => { if (A.play(name, o || undefined)) return true; if (beep) beep(); return false; };
const SND = {drop:() => fx('drop', null, BEEP.drop), spell:() => fx('spell', null, BEEP.spell), boom:() => fx('boom', null, BEEP.boom), horn:() => fx('horn', null, BEEP.horn), trapSet:() => fx('trapset', null, BEEP.trapSet), trap:() => fx('trap', null, BEEP.trap),
  negate:() => fx('whistle', null, BEEP.negate), rip:() => fx('chest', null, BEEP.rip), legend:() => { A.duck(.35, 2.4); fx('legend', null, BEEP.legend); }, crack:() => fx('thunder', null, BEEP.crack), god:() => { A.duck(.25, 3.2); fx('god', null, BEEP.god); }};
{ const k = BDB.sfx, was = {tick:k.tick, good:k.good, bad:k.bad, big:k.big, pop:k.pop};      // the menus' own clicks, in the same voice as everything else
  k.tick = () => fx('tap', null, was.tick); k.good = () => fx('ok', null, was.good); k.bad = () => fx('bad', null, was.bad); k.big = () => fx('big', null, was.big); k.pop = () => fx('pop', null, was.pop); }
A.music('menu');      // nothing plays until the first touch: browsers insist on that

/* ---------- the 3D view (menus work without it: card art is a set of pictures) ---------- */
let V = null, MD = null, ready3d = false;
const NOVIEW = Q.get('noview') === '1';
async function initView(){
  if (NOVIEW) return;
  try {
    const [vw, md] = await Promise.all([import('./view.js?v=1119e'), import('./models.js?v=1119e')]);
    await md.preload(); MD = md;
    V = vw.createView($('arena'), {low:SMALL, reduced:BDB.reduced, numbers:true, pid:() => B ? B.me : -1, onDie:hearDeath, gfx:Q.get('gfx') != null ? +Q.get('gfx') : null, onGfx:() => { if (curTab === 'Profile' && !B) gfxUI(); }});
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
/* ---------- selling: the Market buys back any card you want rid of, for a price set by its rarity ----------
   A card is one entry in the collection however many levels it has, so the card and its levels go together.
   Three things cannot be sold: a card that is in one of your decks (take it out first), anything while a trade is open, and the last deck's worth of cards. */
const inDecks = id => P.decks.map((d, i) => d.includes(id) ? i + 1 : 0).filter(Boolean);
function sellWhy(id, going = 0){      // why this card cannot be sold right now, or '' if it can. going: how many others are already picked to go with it
  if (!P || !lvl(id) || !CARDS[id]) return 'That card is not yours to sell.';
  if (TR) return 'Finish the trade first.';
  if (B && !B.done) return 'Not in the middle of a match.';
  const dk = inDecks(id); if (dk.length) return `It is in Deck ${dk.join(' and ')}. Take it out to sell it.`;
  if (Object.keys(P.cards).length - going <= DECK_SIZE) return `A deck takes ${DECK_SIZE} cards, so your last ${DECK_SIZE} stay.`;
  return '';
}
function sellCards(ids){              // sells every one of these that can be sold, and says how many went and for how much
  let n = 0, coins = 0;
  for (const id of ids){ if (sellWhy(id)) continue; coins += sellPrice(id); delete P.cards[id]; if (pend === id) pend = null; n++; }
  if (!n) return {n, coins};
  P.coins += coins; P.stats.sold = (P.stats.sold || 0) + n; save(); fx('coins', null, BDB.sfx.good);
  return {n, coins};
}
const bigN = n => n >= 1e6 ? +(n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M' : fmt(n);      // the top bar has no room for seven digits
const tierPic = t => `ui/tier-${t.id}.webp`;
const kN = n => n >= 1e6 ? bigN(n) : n >= 1e5 ? Math.floor(n / 1e3) + 'K' : n >= 1e4 ? Math.floor(n / 100) / 10 + 'K' : fmt(n);      // and less still on a narrow phone: 152K, 48.2K
function top(){
  const pt = $('tabbar').querySelector('[data-tab="Profile"]'); if (pt) pt.classList.toggle('has', msDue().length > 0);      // a dot on the Profile tab while a milestone is waiting to be collected
  const num = (id, full, short) => { const el = $(id); el.textContent = full; if (short !== full) el.dataset.s = short; else delete el.dataset.s; };
  num('hCoins', OWN ? coinsTxt() : bigN(P.coins), OWN ? coinsTxt() : kN(P.coins)); num('hTro', fmt(P.trophies), kN(P.trophies)); $('hTok').textContent = fmt(P.tokens);
  $('resCoins').title = OWN ? 'Coins never run out on this account' : `${fmt(P.coins)} coins. Spend them in the Market`;
  $('hName').textContent = P.name; $('hAv').src = tierPic(tierOf(Math.min(LEVELS, P.ladder + 1))); $('hTier').textContent = P.ladder >= LEVELS ? 'Ladder cleared' : `${tierOf(P.ladder + 1).name}, level ${fmt(P.ladder + 1)}`;
  fitTop();
}
/* The top bar holds a logo, four tabs, three counters, a name and two round buttons, and how wide the counters are depends on how rich the player is.
   No list of screen widths gets that right for everyone, so start with the roomiest layout and step down until the row fits (the steps are in the stylesheet). */
const FIT_STEPS = 6;
let fitKey = '';
function fitTop(force){
  const el = $('topBar'), row = el.firstElementChild; if (!row.clientWidth) return;      // the hub is not on screen: it is fitted when it comes back
  const key = [innerWidth, $('hCoins').textContent, $('hTok').textContent, $('hTro').textContent, $('hName').textContent, $('hTier').textContent].join('|');
  if (key === fitKey && !force) return; fitKey = key;
  const fits = () => {                                                                    // nothing in the row reaches past the row's own right-hand padding
    const lim = row.getBoundingClientRect().right - parseFloat(getComputedStyle(row).paddingRight) + .5;
    for (const c of row.children) if (c.offsetParent && c.getBoundingClientRect().right > lim) return false;
    return true;
  };
  for (let n = 0; n <= FIT_STEPS; n++){
    for (let k = 1; k <= FIT_STEPS; k++) el.classList.toggle('f' + k, k <= n);
    if (fits()) break;
  }
}
addEventListener('resize', () => fitTop());
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => fitTop(true));      // the game font is wider than the one that stands in for it while it loads

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
function setsHTML(deck, brief, pairs){      // brief: only what earns a bonus or is close. pairs: leave out a type the deck has a single card of, once there is anything better to show
  const n = typeCount(deck), bon = typeBonus(deck), some = Object.keys(n).some(t => bon[t] || n[t] >= 2);
  return Object.keys(n).sort((a, b) => n[b] - n[a]).filter((t, i) => brief ? bon[t] || (n[t] >= 2 && i < 4) : !pairs || !some || bon[t] || n[t] >= 2).map(t => { const nx = SET_AT.find(v => v > n[t]); return `<span class="set${bon[t] ? ' on' : ''}" style="--ty:${TYPES[t].col}"><b>${n[t]}</b>${esc(TYPES[t].name)}${bon[t] ? `<em>+${Math.round((bon[t] - 1) * 100)}%</em>` : nx ? `<small>${nx - n[t]} more for +${Math.round((SET_MUL[SET_AT.indexOf(nx)] - 1) * 100)}%</small>` : ''}</span>`; }).join('');
}

/* ---------- dialogs ---------- */
function dlg(html, o = {}){ const w = $('dlg'), b = $('dlgBox'); if (w.hidden) fx('open'); b.innerHTML = html; b.scrollTop = 0; w.hidden = false; dlg.lock = !!o.lock; $('hubToast').hidden = true; return b; }
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
  if (r.pack){ const got = openPack(PACK[r.pack]).map(grant); P.stats.packs++; jobTick('chest'); save(); packReveal(PACK[r.pack], got, () => { dlgClose(); hub(); }); }
  else { save(); BDB.sfx.big(); fx('coins', {delay:.45}); hub(); const b = dlg(`<div class="k-eyebrow">Daily reward, day ${st.day} of 7</div>${r.coins ? '<div class="pilepic" aria-hidden="true"></div>' : ''}<h3>${esc(rewardText(r).replace(/^./, c => c.toUpperCase()))}</h3><p class="note">Come back tomorrow for day ${st.day % 7 + 1}: ${esc(rewardText(DAILY[st.day % 7]))}. Miss a day and it starts again from day 1.</p><div class="k-row"><button type="button" class="k-btn primary" id="dyX">Good</button></div>`); b.querySelector('#dyX').onclick = dlgClose; }
}
function claimBounty(){
  if (P.bounty < BOUNTY) return;
  const pk = PACK[bountyPack()]; P.bounty -= BOUNTY; P.bn++; P.stats.packs++; jobTick('chest');
  const got = openPack(pk).map(grant); save(); packReveal(pk, got, () => { dlgClose(); hub(); });
}
/* ---------- today's jobs: three things to do. Each pays coins, and all three pay a chest on top ---------- */
function jobs(){                                         // today's list, dealt the first time it is asked for each day (the same three however often the page is reloaded)
  const d = today();
  if (P.jobs.day !== d || P.jobs.list.length !== 3){
    let h = 2166136261; for (const ch of d + '|' + P.name){ h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    const rnd = () => { h = h + 0x6D2B79F5 | 0; let t = Math.imul(h ^ h >>> 15, 1 | h); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    P.jobs = {day:d, list:rollJobs(rnd, {online:!!Cloud.session(), cleared:P.ladder >= LEVELS, rookie:P.ladder < 100}).map(id => ({id, n:0, got:0})), all:0};
  }
  return P.jobs.list;
}
function jobTick(k, n = 1){                              // something happened that a job may be counting
  const out = []; if (!P || !P.onboarded || !P.jobs) return out;
  for (const j of jobs()){ const J = JOBS[j.id]; if (J.k !== k || j.n >= J.need) continue; j.n = Math.min(J.need, j.n + n); if (j.n >= J.need){ out.push(J.text); if (B && !B.done && !$('scrBattle').hidden){ note('Job done: ' + J.text); fx('ok'); } } }
  return out;                                            // the jobs this finished, for whoever wants to say so
}
function jobsBox(){
  const L = jobs(), pk = PACK[bountyPack()], left = L.filter(j => !j.got).length;
  const b = dlg(`<div class="k-eyebrow">Today's jobs</div><h3>${left ? 'Three jobs, three pay packets' : 'All three done'}</h3>
    <div class="jobs">${L.map((j, i) => { const J = JOBS[j.id], done = j.n >= J.need; return `<div class="job${j.got ? ' got' : done ? ' done' : ''}"><div><b>${esc(J.text)}</b><div class="bar"><i style="width:${j.n / J.need * 100}%"></i></div><small>${j.got ? 'Collected' : `${j.n} of ${J.need}`}</small></div>${done && !j.got ? `<button type="button" class="k-btn primary" data-i="${i}">${COIN}${fmt(jobPay(j.id, P.ladder))}</button>` : `<span class="pay">${COIN}${fmt(jobPay(j.id, P.ladder))}</span>`}</div>`; }).join('')}</div>
    <p class="note">${P.jobs.all ? `The ${esc(pk.name)} for all three is already yours. New jobs tomorrow.` : `Collect all three and a ${esc(pk.name)} comes with the last one. New jobs every day.`}</p>
    <div class="k-row"><button type="button" class="k-btn" id="jbX">Close</button></div>`);
  b.querySelector('#jbX').onclick = dlgClose;
  for (const q of b.querySelectorAll('button[data-i]')) q.onclick = () => {
    const j = L[+q.dataset.i]; if (!j || j.got || j.n < JOBS[j.id].need) return;
    j.got = 1; P.coins += jobPay(j.id, P.ladder); fx('coins', null, BDB.sfx.big);
    if (L.every(x => x.got) && !P.jobs.all){ P.jobs.all = 1; P.stats.packs++; const got = openPack(pk).map(grant); save(); hub(); return packReveal(pk, got, () => { dlgClose(); hub(); }); }
    save(); hub(); jobsBox();
  };
}
/* ---------- Boosts: a second, small deck that costs no Mana (the list is made in cards.js) ----------
   P.boosts: the ones owned. P.bdecks: a Boost deck for each deck slot, eight at most. Everyone is given twelve plain ones for the types of their first deck. */
const BICON = {
  speed:'<path d="M13.5 1.5 4 13.5h6L8.5 22.5 20 9.5h-6.5z"/>', haste:'<path d="M3 4.5 10.5 12 3 19.5zM12.5 4.5 20 12l-7.5 7.5z"/>',
  power:'<g transform="rotate(40 12 12)"><path d="M12 .8 14.6 4.8V14H9.4V4.8zM6 14h12v2.8H6zM10.6 16.8h2.800v3.4h-2.800z"/><circle cx="12" cy="21.6" r="1.9"/></g>',
  guard:'<path d="M12 1.8 20.5 5v6.2c0 5.3-3.6 9.5-8.5 11-4.9-1.5-8.5-5.7-8.5-11V5z"/>', health:'<path d="M12 21.5C6.2 17.6 2.5 13.9 2.5 9.4 2.5 6.3 4.9 4 7.8 4c1.7 0 3.2.8 4.2 2.2C13 4.800 14.5 4 16.200 4c2.9 0 5.3 2.3 5.3 5.4 0 4.5-3.700 8.200-9.500 12.100z"/>',
  heal:'<path d="M9 2.500h6V9h6.500v6H15v6.500H9V15H2.500V9H9z"/>', shield:'<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3.200a6.800 6.800 0 1 1 0 13.600 6.800 6.800 0 0 1 0-13.600zM9.300 7.600a5 5 0 0 0-2.200 3.500l1.900.3a3.100 3.100 0 0 1 1.400-2.200z"/>',
  regen:'<path d="M12 3.500a8.500 8.500 0 0 1 8 5.600l1.600-1.300.4 6.200-5.800-1.900 1.600-1.300A5.600 5.600 0 0 0 6.700 10L3.900 9A8.500 8.500 0 0 1 12 3.500zm0 17a8.500 8.500 0 0 1-8-5.600l-1.600 1.300-.4-6.200 5.800 1.900-1.600 1.300a5.600 5.600 0 0 0 11.100.800l2.800 1A8.500 8.500 0 0 1 12 20.500z"/>',
  leech:'<path d="M12 1.800s7.200 7.900 7.200 13A7.200 7.200 0 0 1 4.800 14.800C4.800 9.700 12 1.800 12 1.800zM8 14.500a4 4 0 0 0 3.200 4l.4-1.800a2.200 2.200 0 0 1-1.800-2.200z"/>',
  dodge:'<path d="M1.500 6.200h9v2.600h-9zM4 10.700h7.500v2.600H4zM1.500 15.200h9v2.600h-9zM17.500 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"/>',
  flame:'<path d="M12.600 1.500c.6 3.700 5.900 6 5.900 11.600a6.500 6.500 0 0 1-13 0c0-2.200.9-3.900 2.100-5.100.2 1.600.9 2.700 2 3.200-.4-3.600.9-7.200 3-9.700zM12 14c-1.500 1.300-2.200 2.500-2.200 3.800a2.200 2.200 0 0 0 4.400 0c0-1.300-.7-2.500-2.200-3.800z"/>',
  frost:'<g><rect x="10.7" y="1.5" width="2.6" height="21" rx="1.2"/><rect x="10.7" y="1.5" width="2.6" height="21" rx="1.2" transform="rotate(60 12 12)"/><rect x="10.7" y="1.5" width="2.6" height="21" rx="1.2" transform="rotate(120 12 12)"/><path d="M12 7.2 9.2 4.6l1.3-1.400L12 4.500l1.500-1.300 1.300 1.400zM12 16.800l2.800 2.600-1.300 1.400L12 19.500l-1.500 1.300-1.300-1.400z"/></g>',
  cleanse:'<path d="M10 2l2.300 6.700L19 11l-6.700 2.300L10 20l-2.300-6.700L1 11l6.700-2.300zM19 14.500l1.100 2.900 2.900 1.100-2.900 1.100-1.100 2.900-1.100-2.900-2.900-1.100 2.900-1.100z"/>',
  revive:'<path d="M12 1.500 19.500 10H15v6.500H9V10H4.500zM5 19h14v3.200H5z"/>'
};
const bIcon = fx => `<svg viewBox="0 0 24 24" aria-hidden="true">${BICON[fx] || ''}</svg>`;
const curBoosts = () => (P.bdecks[P.deck] || []).filter(id => BOOSTS[id] && P.boosts[id]).slice(0, BOOST_DECK);
const boostSay = id => { const b = BOOSTS[id]; return BOOST_FX[b.fx].text(b.v, b.t); };
const boostRow = (id, tail, cls) => { const b = BOOSTS[id]; return `<div class="brow${cls ? ' ' + cls : ''}" style="--ty:${TYPES[b.type].col}" data-id="${id}"><span class="bic">${bIcon(b.fx)}</span><div><b>${esc(b.name)}<i>${TIER_NAME[b.tier - 1]}</i></b><small><em>${esc(TYPES[b.type].name)}.</em> ${esc(boostSay(id))}</small></div>${tail || ''}</div>`; };
const boostTile = (id, cls) => { const b = BOOSTS[id]; return `<button type="button" class="btile${cls ? ' ' + cls : ''}" style="--ty:${TYPES[b.type].col}" data-id="${id}" title="${esc(boostName(id))}, ${esc(TYPES[b.type].name)}. ${esc(boostSay(id))}" aria-label="${esc(boostName(id))}, ${esc(TYPES[b.type].name)}">${bIcon(b.fx)}<span class="pip">${'<i></i>'.repeat(b.tier)}</span></button>`; };
/* once for every account, old or new: the starter set, and a Boost deck picked for every deck that has cards in it */
function boostStart(){
  if (!P || !P.onboarded || P.flags.bs1) return false;
  const first = P.decks.find(d => d.length) || [];
  for (const id of starterBoosts(first)) P.boosts[id] = 1;
  for (let i = 0; i < DECK_SLOTS; i++) if (!P.bdecks[i].length) P.bdecks[i] = pickBoosts(Object.keys(P.boosts), P.decks[i].length ? P.decks[i] : first);
  P.flags.bs1 = 1; save(); return true;
}
/* the strip under the deck on the Deck tab: the eight for this deck at a glance */
function boostStrip(){
  const el = $('bstIcons'); if (!el) return;
  const d = curBoosts(), ty = deckTypes(curDeck()), dead = d.filter(id => !ty.includes(BOOSTS[id].type));
  $('bstLbl').textContent = `Boosts for this deck, ${d.length} of ${BOOST_DECK}`;
  el.innerHTML = d.map(id => boostTile(id, ty.includes(BOOSTS[id].type) ? '' : 'off')).join('') + '<button type="button" class="btile empty" aria-label="Empty place. Pick a Boost for it">+</button>'.repeat(BOOST_DECK - d.length);
  $('bstNote').textContent = dead.length ? `${dead.length === 1 ? 'One of these has' : dead.length + ' of these have'} no troops of ${dead.length === 1 ? 'its' : 'their'} type in this deck, so ${dead.length === 1 ? 'it' : 'they'} would do nothing.` : d.length ? `No Mana. One is dealt every ${BOOST_EVERY} seconds of a match, and you hold ${BOOST_HAND} at most.` : 'Empty. Tap Change to pick some: they cost no Mana in a match.';
  for (const b of el.children) b.onclick = boostBox;
  $('bstEdit').onclick = boostBox;
}
let bstType = '';                                           // which of your Boosts the editor lists: '' is the types of the deck in hand
function boostBox(){
  const d = curBoosts(), ty = deckTypes(curDeck()), rest = Object.keys(P.boosts).filter(id => BOOSTS[id] && !d.includes(id));
  const types = TYPE_IDS.filter(t => rest.some(id => BOOSTS[id].type === t)), fxI = id => Object.keys(BOOST_FX).indexOf(BOOSTS[id].fx);
  if (bstType && !types.includes(bstType)) bstType = '';
  const show = rest.filter(id => bstType ? BOOSTS[id].type === bstType : ty.includes(BOOSTS[id].type)).sort((a, b) => (bstType ? 0 : ty.indexOf(BOOSTS[a].type) - ty.indexOf(BOOSTS[b].type)) || fxI(a) - fxI(b) || BOOSTS[b].tier - BOOSTS[a].tier);
  const full = d.length >= BOOST_DECK;
  const b = dlg(`<div class="k-eyebrow">Boosts for Deck ${P.deck + 1}</div><h3>${d.length} of ${BOOST_DECK} in</h3>
    <p class="note" style="margin:0">A Boost costs no Mana. In a match one is dealt every ${BOOST_EVERY} seconds and you hold ${BOOST_HAND} at most. Drop it on your troops: it only works on the type it names.</p>
    <div class="bsec">In this deck</div><div class="brows" id="bbIn">${d.length ? d.map(id => boostRow(id, '<button type="button" class="k-btn" data-a="out">Take out</button>', ty.includes(BOOSTS[id].type) ? '' : 'off')).join('') : '<p class="note" style="margin:0">Nothing yet. Add some from below.</p>'}</div>
    <div class="bsec">Your other Boosts</div>
    <div class="tfilter" id="bbF" role="group" aria-label="Type"><button type="button" data-t="" aria-pressed="${!bstType}">This deck's types</button>${types.map(t => `<button type="button" data-t="${t}" style="--ty:${TYPES[t].col}" aria-pressed="${bstType === t}">${esc(TYPES[t].name)}</button>`).join('')}</div>
    <div class="brows" id="bbOwn">${show.length ? show.map(id => boostRow(id, `<button type="button" class="k-btn${full ? '' : ' primary'}" data-a="in"${full ? ' disabled' : ''}>Add</button>`)).join('') : `<p class="note" style="margin:0">${rest.length ? 'None of your other Boosts are for the types in this deck. Pick a type above to see the rest.' : 'Every Boost you own is in this deck. The Market has more.'}</p>`}</div>
    <div class="k-row" style="margin-top:14px"><button type="button" class="k-btn" id="bbAuto">Pick for me</button><button type="button" class="k-btn" id="bbShop">Get more</button><button type="button" class="k-btn primary" id="bbX">Done</button></div>`);
  const set = list => { const sc = $('dlgBox').scrollTop; P.bdecks[P.deck] = list.slice(0, BOOST_DECK); save(); if (curTab === 'Deck') boostStrip(); boostBox(); $('dlgBox').scrollTop = sc; };      // the list stays where it was scrolled to
  b.querySelector('#bbX').onclick = dlgClose;
  b.querySelector('#bbAuto').onclick = () => { fx('place', null, BDB.sfx.tick); set(pickBoosts(Object.keys(P.boosts), curDeck())); };
  b.querySelector('#bbShop').onclick = () => { dlgClose(); tab('Market'); const q = $('bstShop'); if (q) q.scrollIntoView({block:'center'}); };
  b.querySelector('#bbF').onclick = e => { const q = e.target.closest('button'); if (!q) return; const sc = $('dlgBox').scrollTop; bstType = q.dataset.t; boostBox(); $('dlgBox').scrollTop = sc; };
  for (const q of b.querySelectorAll('button[data-a]')) q.onclick = () => { const id = q.closest('.brow').dataset.id; if (q.dataset.a === 'out'){ fx('card', null, BDB.sfx.tick); set(d.filter(x => x !== id)); } else if (d.length < BOOST_DECK){ fx('place', null, BDB.sfx.tick); set(d.concat([id])); } };
}
/* the Market: the Boost Box, and every Boost there is, a type at a time */
const boostBack = id => Math.round(BOOSTS[id].price * .4 / 10) * 10;       // what a Boost you already own turns into
function boostShelf(){
  const el = $('bstShop'); if (!el) return;
  const own = Object.keys(P.boosts).filter(id => BOOSTS[id]).length;
  el.innerHTML = `<div class="bstbox"><div class="box" aria-hidden="true">${['speed', 'guard', 'health'].map(bIcon).join('')}</div><button type="button" class="k-btn primary" id="bxBuy">${COIN}${fmt(BOOST_BOX.price)}</button></div>
    <div class="bstside"><b>${esc(BOOST_BOX.name)}</b><p class="note" style="margin:0">${esc(BOOST_BOX.blurb)} Mostly plain ones, sometimes a II, now and then a III. One you already own comes back as coins. You own ${fmt(own)} of ${fmt(BOOST_IDS.length)}.</p><div class="k-row"><button type="button" class="k-btn" id="bxAll">See every Boost</button><button type="button" class="k-btn" id="bxDeck">My Boost deck</button></div></div>`;
  const bb = $('bxBuy'); bb.disabled = P.coins < BOOST_BOX.price; bb.onclick = buyBoostBox; $('bxAll').onclick = () => boostShop(); $('bxDeck').onclick = boostBox;
  $('bstEvery').textContent = BOOST_EVERY;
}
function buyBoostBox(){
  if (P.coins < BOOST_BOX.price) return;
  P.coins -= BOOST_BOX.price; let back = 0;
  const got = openBoostBox(curDeck()).map(id => { const had = !!P.boosts[id]; if (had){ back += boostBack(id); } else P.boosts[id] = 1; return {id, had}; });
  P.coins += back; save(); fx('chest', null, BDB.sfx.big); hub();
  const b = dlg(`<div class="k-eyebrow">${esc(BOOST_BOX.name)}</div><h3>${got.every(g => g.had) ? 'Nothing new this time' : got.some(g => g.had) ? `${got.filter(g => !g.had).length} new` : 'Three new Boosts'}</h3>
    <div class="brows">${got.map(g => boostRow(g.id, `<span class="own">${g.had ? `Had it: +${fmt(boostBack(g.id))}` : 'New'}</span>`, g.had ? 'off' : '')).join('')}</div>
    <p class="note">${back ? `${fmt(back)} coins back for the ${got.filter(g => g.had).length === 1 ? 'one' : 'ones'} you already had. ` : ''}New ones are in your collection, not in a deck yet.</p>
    <div class="k-row"><button type="button" class="k-btn primary" id="bxAgain"${P.coins < BOOST_BOX.price ? ' disabled' : ''}>Another ${COIN}${fmt(BOOST_BOX.price)}</button><button type="button" class="k-btn" id="bxPut">Boost deck</button><button type="button" class="k-btn" id="bxDone">Done</button></div>`);
  b.querySelector('#bxAgain').onclick = buyBoostBox; b.querySelector('#bxDone').onclick = dlgClose; b.querySelector('#bxPut').onclick = boostBox;
}
let shopType = '';
function boostShop(t){
  if (t) shopType = t; if (!shopType) shopType = deckTypes(curDeck())[0] || TYPE_IDS[0];
  const list = BOOST_IDS.filter(id => BOOSTS[id].type === shopType), own = list.filter(id => P.boosts[id]).length;
  const b = dlg(`<div class="k-eyebrow">Every Boost</div><h3>${esc(TYPES[shopType].name)}: ${own} of ${list.length}</h3>
    <div class="tfilter" id="bsF" role="group" aria-label="Type">${TYPE_IDS.map(q => `<button type="button" data-t="${q}" style="--ty:${TYPES[q].col}" aria-pressed="${q === shopType}">${esc(TYPES[q].name)}</button>`).join('')}</div>
    <div class="brows">${list.map(id => boostRow(id, P.boosts[id] ? '<span class="own">Owned</span>' : `<button type="button" class="k-btn primary" data-a="buy"${P.coins < BOOSTS[id].price ? ' disabled' : ''}>${COIN}${fmt(BOOSTS[id].price)}</button>`)).join('')}</div>
    <div class="k-row" style="margin-top:14px"><button type="button" class="k-btn" id="bsDeck">My Boost deck</button><button type="button" class="k-btn primary" id="bsX">Done</button></div>`);
  b.querySelector('#bsX').onclick = dlgClose; b.querySelector('#bsDeck').onclick = boostBox;
  b.querySelector('#bsF').onclick = e => { const q = e.target.closest('button'); if (q) boostShop(q.dataset.t); };
  for (const q of b.querySelectorAll('button[data-a="buy"]')) q.onclick = () => { const id = q.closest('.brow').dataset.id, pr = BOOSTS[id].price; if (P.boosts[id] || P.coins < pr) return; const sc = $('dlgBox').scrollTop; P.coins -= pr; P.boosts[id] = 1; save(); fx('coins', null, BDB.sfx.good); hub(); boostShop(); $('dlgBox').scrollTop = sc; };
}
/* ---------- goals: four for every card, each paid once (the list is made in cards.js) ----------
   P.goals holds how far each has got, by card: [a, b, c, d]. One that has reached its number is done and was paid when it got there. */
const goalAt = (b, i) => Math.min(goalsOf(b)[i].n, (P.goals[b] || [])[i] || 0);
const goalsDone = () => { let n = 0; for (const b in P.goals){ const G = goalsOf(b); for (let i = 0; i < G.length; i++) if (goalAt(b, i) >= G[i].n) n++; } return n; };
const goalRow = (b, i) => { const g = goalsOf(b)[i], v = goalAt(b, i), done = v >= g.n; return `<div class="goal${done ? ' got' : ''}"><span class="gt">${esc(goalText(b, g))}</span><span class="gn">${done ? 'Done' : `${fmt(v)} of ${fmt(g.n)}`}</span><span class="gp">${COIN}${fmt(g.pay)}</span><div class="bar"><i style="width:${v / g.n * 100}%"></i></div></div>`; };
/* A match is over: move every goal that belongs to a card in the deck that played it. ft: what each of this player's cards did (plays, kills, damage, towers finished).
   Returns the goals this finished, each with its pay. The caller hands over the coins. */
function goalTick(ft, o){
  const done = [], num = (v, hi) => Number.isFinite(v) ? clamp(Math.round(v), 0, hi) : 0;
  for (const b of new Set(o.deck.map(id => CARDS[id] && CARDS[id].base).filter(Boolean))){
    const G = goalsOf(b), f = (ft && typeof ft === 'object' && ft[b]) || {}, v = [0, 1, 2, 3].map(i => goalAt(b, i)); let moved = false;
    G.forEach((g, i) => {
      if (v[i] >= g.n) return;
      const add = g.k === 'play' ? num(f.p, 400) : g.k === 'win' ? +o.win : g.k === 'kill' ? num(f.k, 4000) : g.k === 'crown' ? o.crowns : g.k === 'tower' ? num(f.t, 3) : g.k === 'dmg' ? num(f.d, 5e6) : +(o.win && o.crowns >= 3);
      if (add > 0){ v[i] = Math.min(g.n, v[i] + add); moved = true; if (v[i] >= g.n) done.push({b, i, pay:g.pay, text:goalText(b, g)}); }
    });
    if (moved) P.goals[b] = v;
  }
  return done;
}
/* the goals nearest to done among the cards of the deck in use: what the Battle tab shows */
function goalsNear(n = 3){
  const out = [];
  for (const id of curDeck()){ const b = CARDS[id].base; goalsOf(b).forEach((g, i) => { const v = goalAt(b, i); if (v < g.n) out.push({b, i, k:v / g.n}); }); }
  return out.sort((x, y) => y.k - x.k).slice(0, n);
}
function goalsBox(){
  const deck = curDeck(), total = deck.reduce((s, id) => s + goalsOf(CARDS[id].base).reduce((q, g, i) => q + (goalAt(CARDS[id].base, i) >= g.n ? 0 : g.pay), 0), 0);
  const b = dlg(`<div class="k-eyebrow">Card goals</div><h3>${fmt(goalsDone())} of ${fmt(GOAL_COUNT)} done</h3>
    <p class="note" style="margin:0 0 10px">Every card has four, and each pays once. They count in any match, whichever build of the card you play. ${deck.length ? `The cards in this deck still have ${fmt(total)} coins to give.` : 'Put some cards in a deck to start on them.'}</p>
    <div class="goalwrap">${deck.map(id => { const c = CARDS[id]; return `<div class="gcard r-${c.rar}"><div class="gh"><img alt="" loading="lazy" src="${artOf(c)}"><b>${esc(c.baseName)}</b><button type="button" class="k-btn" data-id="${id}">Card</button></div>${[0, 1, 2, 3].map(i => goalRow(c.base, i)).join('')}</div>`; }).join('')}</div>
    <div class="k-row"><button type="button" class="k-btn" id="glX">Close</button></div>`);
  b.querySelector('#glX').onclick = dlgClose;
  for (const q of b.querySelectorAll('button[data-id]')) q.onclick = () => sheet(q.dataset.id);
}
/* milestones: career totals with rungs. msDue: the ones with a rung reached and not yet collected. */
const msAt = k => (P.ms && P.ms[k]) || 0;
const msDue = () => MS_IDS.filter(k => { const M = MILESTONES[k], n = msAt(k); return n < M.at.length && M.of(P) >= M.at[n]; });
const msPrize = n => { const R = MS_PRIZE[Math.min(n, MS_PRIZE.length - 1)]; return {...R, pk:PACK[R.pack], text:PACK[R.pack].name + (R.tok ? ` and ${R.tok} upgrade token${R.tok > 1 ? 's' : ''}` : '')}; };
function msCollect(k){
  const M = MILESTONES[k], n = msAt(k); if (!M || n >= M.at.length || M.of(P) < M.at[n]) return;
  const R = msPrize(n);
  if (!P.ms) P.ms = {};
  P.ms[k] = n + 1; if (R.tok) P.tokens += R.tok; P.stats.packs++; jobTick('chest');
  const got = openPack(R.pk).map(grant); save(); hub();
  packReveal(R.pk, got, () => { dlgClose(); hub(); if (R.tok) hubToast(`${R.tok} upgrade token${R.tok > 1 ? 's' : ''} added. Spend ${R.tok > 1 ? 'them' : 'it'} on your Profile.`); });
}
function msUI(){
  const el = $('msList'); if (!el) return;
  el.innerHTML = MS_IDS.map(k => {
    const M = MILESTONES[k], n = msAt(k), v = M.of(P), max = n >= M.at.length, goal = max ? M.at[M.at.length - 1] : M.at[n], due = !max && v >= goal, R = max ? null : msPrize(n);
    return `<div class="job ms${due ? ' done' : max ? ' got' : ''}"><img alt="" loading="lazy" src="${chestPic(max ? PACK.divine : R.pk)}"><div><b>${esc(M.name)}</b><div class="bar"><i style="width:${max ? 100 : clamp(v / goal * 100, 0, 100)}%"></i></div>
      <small>${max ? `All ${M.at.length} rungs done, at ${fmt(v)}` : `${fmt(Math.min(v, goal))} of ${fmt(goal)}. ${esc(R.text)}`}</small></div>${due ? `<button type="button" class="k-btn primary" data-ms="${k}">Collect</button>` : `<span class="rung">${n} of ${M.at.length}</span>`}</div>`; }).join('');
  for (const q of el.querySelectorAll('button[data-ms]')) q.onclick = () => msCollect(q.dataset.ms);
}
function boonsUI(){
  const el = $('boons'); if (!el) return;
  const d = dailyState(), bp = PACK[bountyPack()], full = P.bounty >= BOUNTY, sb = Math.round((streakMul(P.streak + 1) - 1) * 100);
  const J = jobs(), jGot = J.filter(j => j.got).length, jDue = J.find(j => !j.got && j.n >= JOBS[j.id].need), jNext = J.find(j => j.n < JOBS[j.id].need);
  el.innerHTML = `<div class="boon${d.ready ? ' go' : ''}"><div class="ic day">${d.day}</div><div><b>Daily reward</b><small>${d.ready ? `Day ${d.day} of 7: ${esc(rewardText(DAILY[d.day - 1]))}.` : `Taken today. Tomorrow is day ${d.day}: ${esc(rewardText(DAILY[d.day - 1]))}.`}</small><div class="pips">${DAILY.map((_, i) => `<i${i < d.done ? ' class="on"' : ''}></i>`).join('')}</div></div>${d.ready ? '<button type="button" class="k-btn primary" id="dayGo">Claim</button>' : ''}</div>
    <div class="boon${jDue ? ' go' : ''}"><div class="ic job">${jGot}</div><div><b>Today's jobs</b><small>${jDue ? `${esc(JOBS[jDue.id].text)}: done. ${fmt(jobPay(jDue.id, P.ladder))} coins to collect.` : jNext ? `${esc(JOBS[jNext.id].text)}: ${jNext.n} of ${JOBS[jNext.id].need}.` : 'All three done. New jobs tomorrow.'}</small><div class="pips">${J.map(j => `<i${j.got ? ' class="on"' : j.n >= JOBS[j.id].need ? ' class="due"' : ''}></i>`).join('')}</div></div><button type="button" class="k-btn${jDue ? ' primary' : ''}" id="jobGo">${jDue ? 'Collect' : 'See'}</button></div>
    <div class="boon"><div class="ic fire${P.streak ? '' : ' cold'}">${P.streak}</div><div><b>Win streak</b><small>${P.streak ? `${P.streak} in a row${P.best > P.streak ? `, best ${P.best}` : ''}. ${sb ? `The next win pays ${sb}% more coins.` : ''}` : 'Win two in a row and every win after pays extra coins, up to half as much again.'}</small></div></div>
    <div class="boon${full ? ' go' : ''}"><div class="ic pack" style="--pc:${bp.col}">${Math.min(P.bounty, BOUNTY)}</div><div><b>Tower bounty</b><small>${full ? `Ten towers down. A ${esc(bp.name)} is yours.` : `${P.bounty} of ${BOUNTY} enemy towers taken. Ten earns a ${esc(bp.name)}.`}</small><div class="bar"><i style="width:${Math.min(100, P.bounty / BOUNTY * 100)}%"></i></div></div>${full ? '<button type="button" class="k-btn primary" id="bntGo">Open</button>' : ''}</div>`;
  const gd = goalsDone(), gn = goalsNear(1)[0], gg = gn && goalsOf(gn.b)[gn.i];
  el.innerHTML += `<div class="boon wide"><div class="ic goal">${gd}</div><div><b>Card goals</b><small>${gg ? `${esc(goalText(gn.b, gg))}: ${fmt(goalAt(gn.b, gn.i))} of ${fmt(gg.n)}. Pays ${fmt(gg.pay)} coins.` : curDeck().length ? 'Every goal for the cards in this deck is done. Try some others.' : 'Every card has four goals, and each one pays coins once.'}</small><div class="bar"><i style="width:${gg ? gn.k * 100 : curDeck().length ? 100 : 0}%"></i></div></div><button type="button" class="k-btn" id="goalGo">See</button></div>`;
  const dg = $('dayGo'), bg = $('bntGo'); if (dg) dg.onclick = claimDaily; if (bg) bg.onclick = claimBounty; $('jobGo').onclick = jobsBox; $('goalGo').onclick = goalsBox;
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
  const ramp = U && !U.bld && c.kind === 'unit' && (c.us || [c.u]).some(k => UNITS[k].dmg > 0) ? RAMPAGE[c.type] : null;
  const pct = Math.round(LVL_STEP * 100), G = gradeOf(Math.max(1, L)), up2 = L < MAX_LVL && gradeOf(L + 1) > G ? ` and moves it up to ${GRADES[gradeOf(L + 1)]}` : '';
  const lvNote = !L ? 'You do not own this card yet.' : `Level ${L} of ${MAX_LVL}, ${GRADES[G]} grade. ` + (L >= MAX_LVL ? 'Maxed out.' : c.trap ? (c.trap.dmg || c.trap.burst || c.trap.heal ? `The next level adds ${pct}% to what it does${up2}.` : 'Levels do not change this trap.') : c.spell && !(c.spell.dmg || c.spell.heal || c.spell.shield) ? 'Levels do not change this spell.' : `The next level adds ${pct}% health and damage${up2}.`);
  box.className = 'k-box sheetx r-' + c.rar;
  box.innerHTML = `<div class="sheet-top"><div></div><div><div class="rar">${R.name} ${KIND[c.kind]}, ${c.cost} Mana</div><h3>${esc(c.name)}</h3>
      <div class="chips">${typeChip(c.type)}${U ? `<span class="rchip">${esc(ROLE_NAME[U.role] || 'Troop')}</span>` : ''}</div></div></div>
    <p class="sdesc">${esc(c.desc)}</p><p class="quote" style="--ty:${TYPES[c.type].col}">${esc(sayFor(c.base, c.type, hash(c.base)))}</p>
    <div class="stats">${statHTML(statRows(id, Math.max(1, L)))}</div>
    ${lines.length || ramp ? `<ul class="abil">${lines.map(l => `<li>${esc(l)}</li>`).join('')}${ramp ? `<li class="ramp" style="--ty:${TYPES[c.type].col}"><b>Rampage: ${esc(ramp.name)}.</b> ${RAMP_AT[0]} enemies down in one life and it goes on one. ${esc(ramp.text)} At ${RAMP_AT[1]} it steps up again.</li>` : ''}</ul>` : ''}${c.note ? `<p class="bnote2">${esc(c.note)}</p>` : ''}
    <div style="width:100%"><div class="note" style="margin-bottom:6px">${lvNote}</div><div class="prog"><i style="width:${L / MAX_LVL * 100}%"></i></div></div>
    ${P && P.onboarded ? `<div class="goals"><div class="gl">Goals for ${esc(c.baseName)}</div>${[0, 1, 2, 3].map(i => goalRow(c.base, i)).join('')}</div>` : ''}
    <div class="k-row" id="shAct"></div><div class="note" id="shNote"></div>`;
  box.querySelector('.sheet-top > div').replaceWith(cardEl(id, {div:true, lvl:L, now:true}));
  const act = box.querySelector('#shAct');
  const btn = (t, cls, fn, dis) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'k-btn ' + cls; b.innerHTML = t; b.disabled = !!dis; b.onclick = fn; act.appendChild(b); return b; };
  const say = t => { box.querySelector('#shNote').textContent = t; }, close = () => { $('sheet').hidden = true; }, short = n => say(`You need ${fmt(n - P.coins)} more coins.`);
  if (!P || !P.onboarded || (B && !B.done)){ /* mid-match, or just looking: the facts and nothing to buy */ }
  else if (!L){ btn(`Buy ${COIN}${fmt(price)}`, 'primary', () => { if (P.coins < price) return; P.coins -= price; P.cards[id] = 1; save(); fx('coins', null, BDB.sfx.good); hub(); sheet(id); }, P.coins < price); if (P.coins < price) short(price); }
  else {
    if (L < MAX_LVL){ btn(`Upgrade ${COIN}${fmt(up)}`, 'primary', () => { if (P.coins < up) return; P.coins -= up; P.cards[id] = L + 1; P.stats.up++; jobTick('up'); save(); fx('upgrade', null, BDB.sfx.big); hub(); sheet(id); }, P.coins < up); if (P.coins < up) short(up); }
    if (!curDeck().includes(id)) btn('Put in deck', L < MAX_LVL ? '' : 'primary', () => { close(); if (curTab !== 'Deck') tab('Deck'); addCard(id); });
    else btn('Take out of deck', '', () => { close(); takeOut(curDeck().indexOf(id)); });
    // sell it: one tap says what goes and what comes back, a second tap does it
    const sp = sellPrice(id), face = `Sell ${COIN}${fmt(sp)}`; let armed = 0;
    const sb = btn(face, 'sell', () => {
      const why = sellWhy(id); if (why){ say(why); BDB.sfx.bad(); return; }
      if (!armed){ armed = setTimeout(() => { armed = 0; if (sb.isConnected){ sb.innerHTML = face; sb.classList.remove('arm'); say(''); } }, 4200); sb.textContent = 'Tap again to sell'; sb.classList.add('arm'); BDB.sfx.tick();
        return say(`${c.name} leaves your collection for good${L > 1 ? `, level ${L} and all` : ''}, and you get ${fmt(sp)} coins: what the Market pays for any ${R.name} card.`); }
      clearTimeout(armed); const r = sellCards([id]); if (!r.n) return; close(); hub(); hubToast(`Sold ${c.name} for ${fmt(r.coins)} coins.`);
    });
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
    const g = $(key + 'Grid'), dl = key === 'shop' ? deals() : [], dk = curDeck(), used = key === 'own' && sellOn ? new Set(P.decks.flat()) : null; g.innerHTML = '';
    for (const id of ids.slice(0, st.n)){
      const c = cardEl(id, key === 'shop' ? {price:lvl(id) ? 'Owned' : fmt(priceNow(id)), own:!!lvl(id), sale:dl.includes(id) && !lvl(id), was:dl.includes(id) && !lvl(id) ? fmt(CARDS[id].price) : '', lvl:lvl(id), cls:lvl(id) ? 'dim' : ''}
        : key === 'own' && sellOn ? {lvl:lvl(id), cls:(used.has(id) ? 'inuse' : '') + (sellSet.has(id) ? ' sellp' : '')} : {lvl:lvl(id), cls:(dk.includes(id) ? 'inuse' : '') + (pend === id ? ' pend' : '')});
      if (key === 'own'){ withInfo(c, id); c.onclick = e => { if (e.target.closest('.inf')) return sheet(id); if (sellOn) return sellPick(id, c); const i = curDeck().indexOf(id); if (i >= 0) takeOut(i); else addCard(id); }; }
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
function tab(t){ curTab = t; for (const k of ['Battle', 'Deck', 'Market', 'Profile']) $('tab' + k).hidden = k !== t; for (const b of $('tabbar').children) b.setAttribute('aria-selected', b.dataset.tab === t); if (t !== 'Deck'){ pend = null; deckMsg = ''; clearT = 0; slotOn = false; sellOn = false; sellSet.clear(); } hub(); $('hubBody').scrollTop = 0; }
$('tabbar').onclick = e => { const b = e.target.closest('button'); if (b){ if (b.dataset.tab !== curTab) fx('tab'); tab(b.dataset.tab); } };
$('toDeck').onclick = () => tab('Deck');
const avgCost = d => d.length ? (d.reduce((a, id) => a + CARDS[id].cost, 0) / d.length).toFixed(1) : '0';
const PACK = Object.fromEntries(PACKS.map(p => [p.id, p]));
const chestPic = p => `ui/chest-${p.type ? 't-' + p.type : p.id}.webp`;      // a chest of cards: one picture for each of the six, and one in each type's colour
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
  boostStart(); top();
  if (curTab === 'Battle'){
    const n = nextLevel(), all = P.ladder >= LEVELS, cpu = ladderCpu(n), T = TIERS[cpu.tier], h = $('hero');
    h.style.setProperty('--tc', T.col);
    h.innerHTML = `${PAINTED.has(cpu.map) ? `<div class="hero-map" aria-hidden="true"><img alt="" src="maps/${cpu.map}.webp"></div>` : ''}<div class="pic"><b>${n}</b></div><div><small><img class="tb" alt="" src="${tierPic(T)}">${all ? 'All 1,000 beaten. Run the last one back' : `Level ${fmt(n)} of ${fmt(LEVELS)}, ${esc(T.name)} tier`}</small><h2>${esc(cpu.name)}</h2><p>${esc(cpu.tag)} ${esc(MAPS[cpu.map].name)}, level ${cpuLvl(cpu)} cards.</p><div class="pzrow">${prizeChips(cpu, !all)}</div><button type="button" class="k-btn primary big" id="heroGo">Battle</button></div>`;
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
    if (gapN >= 1){ $('skipNote').textContent = `Level ${fmt(boss)}, ${ladderCpu(boss).name}. Beat him and the ${gapN} ${gapN > 1 ? 'levels' : 'level'} before him ${gapN > 1 ? 'are' : 'is'} cleared, for half their coins and none of their chests or cards.`; $('skipGo').onclick = () => preCpu(ladderCpu(boss)); }
    $('tiers').innerHTML = TIERS.map((t, i) => { const got = clamp(P.ladder - i * 100, 0, 100); return `<div class="tier${got >= 100 ? ' done' : got > 0 || i === cpu.tier ? ' on' : ''}" style="--tc:${t.col}"><img alt="" src="${tierPic(t)}" loading="lazy"><b>${esc(t.name)}</b><span>${fmt(i * 100 + 1)} to ${fmt((i + 1) * 100)}</span><div class="prog"><i style="width:${got}%"></i></div></div>`; }).join('');
    $('bDeckLbl').textContent = deckOK() ? `Deck ${P.deck + 1}, average ${avgCost(curDeck())} Mana` : `Deck ${P.deck + 1} is not finished: ${curDeck().length} of ${DECK_SIZE} cards`;
    const bd = $('bDeck'); bd.innerHTML = ''; for (const id of curDeck()){ const c = cardEl(id, {lvl:lvl(id)}); c.onclick = () => sheet(id); bd.appendChild(c); }
    $('bSets').innerHTML = setsHTML(curDeck(), true);
    const qr = $('quickRow'); qr.innerHTML = '';
    for (const sk of SKILLS){ const b = document.createElement('button'); b.type = 'button'; b.className = 'k-btn sk-' + sk.id; b.innerHTML = `${sk.name}<small>${COIN}${sk.coins}</small><em>${sk.pack ? 'card and a chest' : sk.card ? 'and a card' : 'coins'}</em>`; b.onclick = () => preCpu(randomCpu(sk.id, myTower())); qr.appendChild(b); }
  } else if (curTab === 'Deck'){
    const d = curDeck(), seg = $('deckSeg'); seg.innerHTML = '';
    for (let i = 0; i < DECK_SLOTS; i++){ const n = P.decks[i].length, b = document.createElement('button'); b.type = 'button'; b.innerHTML = `Deck ${i + 1}${n === DECK_SIZE ? '' : ` <small>${n}/${DECK_SIZE}</small>`}`; b.setAttribute('aria-pressed', i === P.deck); b.onclick = () => { P.deck = i; pend = null; deckMsg = ''; slotOn = false; save(); hub(); }; seg.appendChild(b); }
    $('deckAvg').textContent = d.length ? `${d.length} of ${DECK_SIZE} cards, average ${avgCost(d)} Mana` : 'Nothing in it yet';
    $('deckSets').innerHTML = setsHTML(d, false, true);
    const g = $('deckGrid'); g.innerHTML = '';
    d.forEach((id, i) => { const c = withInfo(cardEl(id, {lvl:lvl(id), cls:pend ? 'pickme' : ''}), id); c.onclick = e => { if (e.target.closest('.inf')) return sheet(id); if (pend) putIn(pend, i); else takeOut(i); }; g.appendChild(c); });
    for (let i = d.length; i < DECK_SIZE; i++){ const sl = document.createElement('button'); sl.type = 'button'; sl.className = 'slot' + (slotOn && i === d.length ? ' on' : ''); sl.textContent = '+'; sl.setAttribute('aria-label', 'Empty place. Pick a card for it'); sl.onclick = pickForSlot; g.appendChild(sl); }
    $('deckFill').disabled = d.length >= DECK_SIZE; $('deckClear').disabled = !d.length; $('deckClear').textContent = clearT ? 'Tap again to clear' : 'Clear deck';
    const side = matchMedia('(min-width:1100px)').matches;
    $('deckHint').innerHTML = deckMsg ? `<span class="err">${esc(deckMsg)}</span>${pend ? ' <button type="button" class="link" id="swapX" style="padding:2px 6px">Cancel</button>' : ''}`
      : slotOn && d.length < DECK_SIZE ? `<b>Now pick a card from ${side ? 'your cards on the right' : 'your cards below'}.</b> It goes in the lit place.`
      : `Tap a card on ${matchMedia('(min-width:1100px)').matches ? 'the right' : 'the list below'} to put it in, and a card in the deck to take it out. The <b>i</b> on a card opens its sheet. ${DECK_SIZE} cards make a deck: one version of each character${OWN ? '. The limits on Rare, Epic, Legendary and God cards do not apply to this account' : `, and no more than ${RAR_CAP.r} Rare, ${RAR_CAP.e} Epic, ${RAR_CAP.l} Legendary and one God`}. ${SET_AT.join(', ').replace(/, (\d+)$/, ' or $1')} cards of one type give that type ${SET_MUL.map(m => Math.round((m - 1) * 100) + '%').join(', ').replace(/, (\d+%)$/, ' or $1')} more health and damage.`;
    const sx = $('swapX'); if (sx) sx.onclick = () => { pend = null; deckMsg = ''; hub(); };
    boostStrip(); sellUI(); lists.own.draw();
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
  else if (d.length >= DECK_SIZE){ pend = pend === id ? null : id; deckMsg = pend ? `The deck is full. Tap the card in it that ${C.name} should replace.` : ''; BDB.sfx.tick(); return hub(); }
  else d.push(id);
  const bad = limitProblem(d); if (bad){ deckMsg = bad; pend = null; BDB.sfx.bad(); return hub(); }
  fx('place', null, BDB.sfx.tick); setDeck(d);
}
function takeOut(i){ if (i < 0) return; const d = curDeck().slice(); d.splice(i, 1); fx('card', null, BDB.sfx.tick); setDeck(d); }
function putIn(id, i){ const d = curDeck().slice(); d[i] = id; const bad = limitProblem(d); if (bad){ deckMsg = bad; pend = null; BDB.sfx.bad(); return hub(); } fx('place', null, BDB.sfx.good); setDeck(d); }
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
/* selling from the list of your cards: switch it on, tap the ones to go, and one button sells the lot */
let sellOn = false, sellArm = 0, sellMsg = ''; const sellSet = new Set();
const sellTotal = () => [...sellSet].reduce((a, id) => a + (CARDS[id] ? sellPrice(id) : 0), 0);
function sellUI(){
  const bar = $('sellBar'), mb = $('sellMode'); if (!bar || !mb) return;
  for (const id of [...sellSet]) if (!lvl(id) || inDecks(id).length) sellSet.delete(id);      // put in a deck, traded or sold since it was picked
  mb.hidden = sellOn; bar.hidden = $('sellInfo').hidden = !sellOn; document.querySelector('.dk-own').classList.toggle('selling', sellOn);
  if (!sellOn) return;
  const n = sellSet.size, go = $('sellGo');
  $('sellSum').innerHTML = n ? `${n} ${n > 1 ? 'cards' : 'card'} picked: ${COIN}${fmt(sellTotal())}` : 'Tap the cards you want to sell.';
  go.disabled = !n; go.classList.toggle('arm', !!sellArm && n > 0); go.innerHTML = !n ? 'Sell' : sellArm ? 'Tap again to sell' : `Sell for ${COIN}${fmt(sellTotal())}`;
  $('sellErr').textContent = sellMsg; $('sellErr').hidden = !sellMsg;
}
function sellPick(id, el){
  clearTimeout(sellArm); sellArm = 0; sellMsg = '';
  if (sellSet.has(id)) sellSet.delete(id);
  else { const why = sellWhy(id, sellSet.size); if (why){ sellMsg = why; BDB.sfx.bad(); return sellUI(); } sellSet.add(id); }
  BDB.sfx.tick(); if (el) el.classList.toggle('sellp', sellSet.has(id)); sellUI();
}
$('sellMode').onclick = () => { sellOn = true; sellSet.clear(); sellMsg = ''; pend = null; deckMsg = ''; slotOn = false; BDB.sfx.tick(); hub(); };
$('sellX').onclick = () => { sellOn = false; sellSet.clear(); sellMsg = ''; clearTimeout(sellArm); sellArm = 0; BDB.sfx.tick(); hub(); };
$('sellGo').onclick = () => {
  if (!sellSet.size) return;
  if (!sellArm){ sellArm = setTimeout(() => { sellArm = 0; if (sellOn && curTab === 'Deck' && !B) sellUI(); }, 3600); BDB.sfx.tick(); return sellUI(); }
  clearTimeout(sellArm); sellArm = 0;
  const r = sellCards([...sellSet]); sellSet.clear(); sellMsg = '';
  hub(); if (r.n) hubToast(`Sold ${r.n} ${r.n > 1 ? 'cards' : 'card'} for ${fmt(r.coins)} coins.`);
};
$('deckClear').onclick = () => { if (!curDeck().length) return; if (!clearT){ clearT = setTimeout(() => { clearT = 0; if (curTab === 'Deck' && !B) hub(); }, 2600); BDB.sfx.tick(); return hub(); } clearTimeout(clearT); BDB.sfx.bad(); setDeck([]); };

/* ---------- profile: the numbers, and the upgrades bought with tokens from the ladder ---------- */
function profile(){
  $('pName').textContent = P.name;
  $('accNote').textContent = Cloud.session() ? 'Signed in. Your save is kept online, so it follows you to any device.' : Cloud.on ? 'This player is saved on this device only. An account keeps it online, lets you sign in anywhere, and puts you on your friends\' list.' : 'Saved on this device.';
  $('accMakeRow').hidden = !Cloud.on || !!Cloud.session();
  const s = P.stats, own = Object.keys(P.cards).length, lv = nextLevel(), T = tierOf(lv), ti = TIERS.indexOf(T), done = P.ladder >= LEVELS, played = s.w + s.l + s.d;
  $('pName').textContent = P.name; $('pBadge').src = tierPic(T); $('pTier').textContent = `${T.name} tier`; $('pTier').style.color = T.col;
  $('pBar').style.width = (done ? 100 : (P.ladder - ti * 100) / 100 * 100) + '%'; $('pBar').style.background = T.col;
  $('pLv').textContent = done ? `All ${fmt(LEVELS)} levels beaten.` : `Level ${fmt(lv)} of ${fmt(LEVELS)}.` + (ti < TIERS.length - 1 ? ` ${TIERS[ti + 1].name} starts at ${fmt((ti + 1) * 100 + 1)}.` : ' The last tier.');
  $('pTiles').innerHTML = [[fmt(s.w), 'BDB beaten'], [played ? Math.round(s.w / played * 100) + '%' : '0%', 'Win rate'], [fmt(P.best), 'Best streak'], [fmt(s.ow), 'Online wins'], [fmt(own), `Cards of ${fmt(CARD_IDS.length)}`], [fmt(P.trophies), 'Trophies']]
    .map(([v, k]) => `<div><b>${v}</b><small>${k}</small></div>`).join('');
  $('pStats').innerHTML = [['Lost to BDB', fmt(s.l)], ['Online losses', fmt(s.ol)], ['Cards won from BDB', fmt(s.won)], ['Chests opened', fmt(s.packs)], ['Card upgrades', fmt(s.up)], ['Trades made', fmt(s.tr || 0)], ['Cards sold', fmt(s.sold || 0)], ['Card goals done', `${fmt(goalsDone())} of ${fmt(GOAL_COUNT)}`], ['Boosts owned', `${fmt(Object.keys(P.boosts).filter(id => BOOSTS[id]).length)} of ${fmt(BOOST_IDS.length)}`]].map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
  const riv = Object.entries(P.vs || {}).map(([n, v]) => ({n, w:v[0], l:v[1], d:v[2], g:v[0] + v[1] + v[2]})).filter(o => o.g).sort((a, b) => b.g - a.g || b.w - a.w).slice(0, 12);
  msUI();
  $('vsPanel').hidden = !riv.length;
  $('vsList').innerHTML = riv.map(o => `<div class="vsr"><b>${esc(o.n)}</b><span class="bar${o.w + o.l ? '' : ' none'}" title="${o.w} won, ${o.l} lost${o.d ? `, ${o.d} drawn` : ''}"><i style="width:${o.w + o.l ? Math.round(o.w / (o.w + o.l) * 100) : 0}%"></i></span><small>${fmt(o.w)} to ${fmt(o.l)}${o.d ? `, ${fmt(o.d)} drawn` : ''}</small></div>`).join('');
  $('tokN').textContent = P.tokens;
  const pk = $('perks'); pk.innerHTML = '';
  for (const k of PERK_IDS){
    const K = PERKS[k], r = P.perks[k], cost = r + 1, max = r >= K.max, can = !max && P.tokens >= cost, row = document.createElement('div'); row.className = 'perk' + (max ? ' max' : '');
    row.innerHTML = `<div><h4>${esc(K.name)}</h4><p>${r ? esc(K.text(r)) : 'Not bought yet.'}${max ? '' : ' Next level: ' + esc(K.text(r + 1))}</p><div class="pips">${Array.from({length:K.max}, (_, i) => `<i${i < r ? ' class="on"' : ''}></i>`).join('')}</div></div>
      <button type="button" class="k-btn${can ? ' primary' : ''}" ${can ? '' : 'disabled'}>${max ? 'Maxed' : `${cost} ${cost > 1 ? 'tokens' : 'token'}`}</button>`;
    row.querySelector('button').onclick = () => { if (P.tokens < cost || P.perks[k] >= K.max) return; P.tokens -= cost; P.perks[k]++; save(); fx('upgrade', null, BDB.sfx.big); hub(); };
    pk.appendChild(row);
  }
  $('codeOut').value = Accounts.code(P); gfxUI(); sndSet(); appUI();
}
/* the game can sit on a phone's home screen and open like an app. Android offers an install prompt we can trigger; on an iPhone it is done from Safari's share menu, so there we say how */
let installEv = null;
const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEv = e; appUI(); });
addEventListener('appinstalled', () => { installEv = null; appUI(); });
function appUI(){
  const p = $('appPanel'); if (!p) return;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  p.hidden = standalone() || !(installEv || ios);
  $('appGo').hidden = !installEv; $('appGo').parentElement.hidden = !installEv;
  $('appNote').textContent = installEv ? 'Brawl gets its own icon and opens full screen, without the browser around it. Your save stays as it is.' : 'In Safari, tap the Share button, then "Add to Home Screen". Brawl gets its own icon and opens full screen. That copy starts empty: sign in there, or paste your save code, and everything comes back.';
}
$('appGo').onclick = async () => { if (!installEv) return; const e = installEv; installEv = null; try { e.prompt(); await e.userChoice; } catch(er){} appUI(); };
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
  boostShelf();
  const pr = $('packRow'); pr.innerHTML = '';
  for (const p of PACKS){
    const el = document.createElement('div'); el.className = 'pack'; el.style.setProperty('--pc', p.col);
    el.innerHTML = `<button type="button" class="foil" aria-label="What is in the ${esc(p.name)}"><img alt="" loading="lazy" src="${chestPic(p)}"><b>${p.n}<small>cards</small></b></button><h4>${esc(p.name).replace(/ Chest$/, '<span> Chest</span>')}</h4><p>${esc(p.blurb)}</p><button type="button" class="k-btn primary buy">${COIN}${fmt(p.price)}</button>`;
    el.querySelector('.foil').onclick = () => packInfo(p);
    const b = el.querySelector('.buy'); b.disabled = P.coins < p.price; b.onclick = () => buyPack(p);
    pr.appendChild(el);
  }
  const tp = $('tpackRow'); tp.innerHTML = '';
  for (const t of TYPE_IDS){
    const b = document.createElement('button'), p = {...TYPE_PACK, id:'type-' + t, type:t, name:TYPES[t].name + ' Chest', col:TYPES[t].col, blurb:`Four ${TYPES[t].name} cards. One Rare or better, guaranteed.`};
    b.type = 'button'; b.className = 'tpack'; b.style.setProperty('--pc', p.col);
    b.innerHTML = `<img alt="" loading="lazy" src="${chestPic(p)}"><b>${esc(TYPES[t].name)}</b><span>${COIN}${fmt(p.price)}</span>`;
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
    <div class="grid deck dk15" id="dbGrid"></div><div class="sets">${setsHTML(d.deck, false, true)}</div>
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
  const b = dlg(`<div class="k-eyebrow">What is inside</div><div class="foil big" style="--pc:${p.col}"><img alt="" src="${chestPic(p)}"><b>${p.n}<small>cards</small></b></div><h3>${esc(p.name)}</h3><p>${esc(p.blurb)}</p>
    <div class="oddsx">${RAR_IDS.filter(r => r !== 'g' || p.odds.g > 0).map(r => `<div class="r-${r}"><b>${share(r)}</b><span>${RAR[r].name}</span></div>`).join('')}</div>
    <p class="note">That is the chance for each card. ${p.min ? `The last card is always ${RAR[p.min].name} or better${p.two ? `, and the one before it ${RAR[p.two].name} or better` : ''}. ` : ''}Builds are random, no chest holds the same character twice, and a card you already own goes up a level.</p>
    <div class="k-row"><button type="button" class="k-btn primary" id="pkBuy" ${P.coins < p.price ? 'disabled' : ''}>Open for ${COIN}${fmt(p.price)}</button><button type="button" class="k-btn" id="pkX">Close</button></div>
    ${P.coins < p.price ? `<p class="note">You need ${fmt(p.price - P.coins)} more coins.</p>` : ''}`);
  b.querySelector('#pkX').onclick = dlgClose; b.querySelector('#pkBuy').onclick = () => buyPack(p, type);
}
function buyPack(p, type){
  if (P.coins < p.price) return;
  P.coins -= p.price; P.stats.packs++; jobTick('chest');
  const got = openPack(p, type).map(grant); save();
  packReveal(p, got, () => { dlgClose(); hub(); }, () => buyPack(p, type));
}
/* tear the pack open, then the cards turn over one at a time, best last */
function packReveal(p, got, done, again){
  const b = dlg(`<div class="k-eyebrow">${esc(p.name)}</div><div class="opener" id="opn" style="--pc:${p.col}"><button type="button" class="foil big shake" id="opnPack" aria-label="Open the chest"><img alt="" src="${chestPic(p)}"><b>${got.length}<small>cards</small></b></button></div>
    <p class="note" id="opnLine">Tap the chest to open it.</p><div class="k-row" id="opnRow"></div>`, {lock:true});
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
      r === 'g' ? SND.god() : r === 'l' ? SND.legend() : r === 'e' ? fx('epic', null, BDB.sfx.big) : r === 'r' ? fx('rare', null, BDB.sfx.good) : fx('place', null, BDB.sfx.pop);
      setTimeout(next, fast ? 30 : r === 'l' ? 1500 : r === 'e' ? 950 : 430);
    };
    setTimeout(next, fast ? 0 : 520);
  };
  b.querySelector('#opnPack').onclick = open;
}

/* ---------- sign in ---------- */
function show(scr){ for (const s of ['scrLogin', 'scrOnb', 'scrHub', 'scrBattle']) $(s).hidden = s !== scr; if (scr === 'scrHub') fitTop(true); else $('hubToast').hidden = true; }
function loginScreen(){
  show('scrLogin'); P = null;
  const w = $('whoList'); w.innerHTML = '';
  for (const p of Accounts.all()){ const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<span>${esc(p.name)}</span><small>${fmt(p.coins)} coins, ${Object.keys(p.cards).length} cards</small>`; b.onclick = () => signIn(p); w.appendChild(b); }
  $('loginErr').textContent = '';
}
function signIn(p){
  P = p; OWN = isOwner(P.name); ownGift = -1; hallWas = null; ownerPerks(); Accounts.save(P);
  if (!P.onboarded && !Q.get('skip')) return onboard();
  P.onboarded = true; if (OWN) save();
  show('scrHub'); tab('Battle'); hallStart();
  const j = Q.get('join'), gift = takeGifts(); if (j && okCode(j) && !signIn.joined){ signIn.joined = true; joinFriend(j); } else if (!ownerHello() && !giftHello(gift) && !whatsNew() && !rulesNote()) newsNote();
}
/* a present from the owner, waiting for this account: taken once, and said out loud */
function takeGifts(){ let n = 0; for (const g of giftsFor(P.name)) if (!P.flags[g.id]){ P.flags[g.id] = 1; P.coins += g.coins || 0; n += g.coins || 0; } if (n) save(); return n; }
function giftHello(n){
  if (!n) return false;
  const b = dlg(`<div class="k-eyebrow">A present</div><h3>${fmt(n)} coins, ${esc(P.name)}</h3><div class="pilepic" aria-hidden="true"></div><div class="bigcoin">+${fmt(n)}</div><p>From the owner of the game. They are in your account now. Chests and ready-made decks are in the Market.</p>
    <div class="k-row"><button type="button" class="k-btn primary" id="gfShop">Go to the Market</button><button type="button" class="k-btn" id="gfX">Close</button></div>`);
  b.querySelector('#gfX').onclick = dlgClose; b.querySelector('#gfShop').onclick = () => { dlgClose(); tab('Market'); };
  BDB.sfx.big(); fx('coins', {delay:.4}); return true;
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
    <ul class="abil"><li>Every character now has one rarity and one of twelve types. Stack a type in your deck and it fights harder.</li><li>The ladder is 1,000 levels, with chests, cards and tower upgrades along the way.</li>
    <li>The Market sells chests of cards and ${THEME_DECKS.length} ready-made decks.</li><li>Mana comes in faster every two minutes of a match: x1.5, x2, x2.5, then triple for the last two.</li></ul>
    <div class="k-row"><button type="button" class="k-btn primary" id="wnOk">Show me</button></div>`);
  b.querySelector('#wnOk').onclick = () => { dlgClose(); tab('Market'); };
  return true;
}
/* What is new is told once, and only the parts a save has not heard yet: Boosts (n18), then orders, rampages and card goals (n17), then the odds and real sound (n16). */
function newsNote(){
  if (P.flags.n18) return false;
  const mid = !P.flags.n17, old = !P.flags.n16, due = msDue().length;
  P.flags.n15 = P.flags.n16 = P.flags.n17 = P.flags.n18 = 1; save();
  const b = dlg(`<div class="k-eyebrow">New since you last played</div><h3>More ways to win, ${esc(P.name)}</h3>
    <ul class="abil"><li><b>Boosts.</b> A second, small deck that costs no Mana. One Boost is dealt every ${BOOST_EVERY} seconds of a match. Tap it, then tap your troops: it works on the type it names. Speed, a shield, health back, a second chance. You have been given twelve, and they are under your deck on the Deck tab. The Market has the other ${fmt(BOOST_IDS.length - 12)}.</li>
    ${mid ? `<li><b>Give orders.</b> In a match, tap one of your troops, then tap an enemy troop, building or tower. It goes for that and nothing else. Tap the troop again to call it off.</li>
    <li><b>Rampage.</b> A troop that takes down ${RAMP_AT[0]} enemies in one life goes on a rampage. Its type decides what it gets, and at ${RAMP_AT[1]} it steps up again. Every troop's card says which.</li>
    <li><b>Card goals.</b> Every card has four goals that each pay coins once, ${fmt(GOAL_COUNT)} in all. They are on the Battle tab and on every card.</li>
    <li><b>Sell cards.</b> The Deck tab has a Sell cards button, and so does every card you own. The price goes by rarity.</li>
    <li><b>Better endings.</b> Troops go down the way they were beaten: thrown, burnt, frozen, melted, or in a way of their type's own.</li>` : ''}
    ${old ? `<li><b>Milestones.</b> Your Profile keeps eight career totals, and every rung is a chest.${due ? ` You have ${due === 1 ? 'one' : due} waiting.` : ''}</li>
    <li><b>Raise the odds.</b> Before a match, pick two or three BDBs at once for double or triple, and every tower you take raises the pay: x${CROWN_PAY[1]}, x${CROWN_PAY[2]}, x${CROWN_PAY[3]}.</li>
    <li><b>Sound.</b> Music and proper effects. The speaker button at the top mutes it.</li>` : ''}</ul>
    <div class="k-row"><button type="button" class="k-btn primary" id="nnOk">Got it</button></div>`);
  b.querySelector('#nnOk').onclick = dlgClose;
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
    <li>New on the Battle tab: a daily reward, a win streak that pays extra coins, a chest for every ten towers you take, and a way to skip to the tier boss.</li>
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
/* a player who started on this device only can turn into an account without leaving: a password is all it takes, and everything they have goes with them */
$('accMake').onclick = () => {
  const b = dlg(`<div class="k-eyebrow">Account</div><h3>Keep ${esc(P.name)} online</h3><p>Pick a password. Everything this player has goes with it. After that, sign in with this name and password on any device, and your friends can see when you are on.</p>
    <input class="field" id="amPass" type="password" placeholder="Password" autocomplete="new-password" maxlength="60" aria-label="Password"><div class="err" id="amErr"></div>
    <div class="k-row"><button type="button" class="k-btn primary" id="amGo">Create account</button><button type="button" class="k-btn" id="amX">Cancel</button></div>`);
  const err = t => { const e = b.querySelector('#amErr'); if (e) e.textContent = t; }, go = b.querySelector('#amGo');
  b.querySelector('#amX').onclick = dlgClose;
  go.onclick = async () => {
    const pw = b.querySelector('#amPass').value; if (pw.length < 4) return err('Use a password with at least four characters.');
    err('Creating your account.'); go.disabled = true;
    try {
      const r = await Cloud.register(P.name, pw, P);
      if (r.error){ go.disabled = false; return err(r.error === 'taken' ? 'Someone already has an account under that name. If it is yours, use Switch player and sign in.' : 'That did not work. Try again in a moment.'); }
      P.name = r.name; save(); dlgClose(); hallStart(); hub(); BDB.sfx.big();
      msgBox('Account made', `Sign in as ${P.name} with that password on any device. You are on your friends' list from now on.`);
    } catch(e){ go.disabled = false; err(cloudWhy(e)); }
  };
  b.querySelector('#amPass').onkeydown = e => { if (e.key === 'Enter') go.click(); };
};
$('newPass').addEventListener('keydown', e => { if (e.key === 'Enter') accSign(false); });
if (!Cloud.on){ document.querySelector('.login').classList.add('nocloud'); $('newGo').textContent = 'Play'; $('newGo').classList.add('primary'); }
$('newName').addEventListener('keydown', e => { if (e.key === 'Enter') $('newGo').click(); });
$('codeToggle').onclick = () => { $('codeBox').hidden = !$('codeBox').hidden; };
$('codeGo').onclick = () => { try { signIn(Accounts.fromCode($('codeIn').value)); } catch(e){ $('loginErr').textContent = e.message; } };
$('codeCopy').onclick = async () => { try { await navigator.clipboard.writeText($('codeOut').value); $('codeCopy').textContent = 'Copied'; } catch(e){ $('codeOut').select(); } setTimeout(() => { $('codeCopy').textContent = 'Copy code'; }, 1500); };
$('signOut').onclick = () => { Cloud.flush(); Cloud.signOut(); Accounts.signOut(); clearInterval(hallT); LEAGUE = null; loginScreen(); };
$('wipe').onclick = () => confirmBox('Delete this player?', `${P.name}'s cards, coins and decks will be gone from this device.`, 'Delete', () => { Accounts.remove(P.name); loginScreen(); });
const sndUI = () => { const on = !BDB.sfx.muted; $('mute').setAttribute('aria-pressed', on); $('mute').title = on ? 'Sound is on' : 'Sound is off'; sndSet(); };
function sndSet(){
  const seg = $('sndSeg'); if (!seg) return; const p = A.prefs;
  for (const b of seg.children) b.setAttribute('aria-pressed', !!p[b.dataset.k]);
  $('sndNote').textContent = BDB.sfx.muted ? 'Everything is muted by the speaker button at the top of the screen.' : p.music && p.fx ? 'In the menus the music is the match next door, heard through the wall.' : p.music ? 'Music only.' : p.fx ? 'Effects only.' : 'Both are off.';
}
$('sndSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; const k = b.dataset.k; A.set(k, !A.prefs[k]); if (k === 'fx') BDB.sfx.tick(); sndSet(); };
$('mute').onclick = () => { BDB.sfx.toggle(); A.refresh(); sndUI(); if (!BDB.sfx.muted) BDB.sfx.tick(); };
sndUI();
$('resCoins').onclick = () => tab('Market'); $('resTok').onclick = () => tab('Profile'); $('resTro').onclick = () => tab('Profile'); $('whoChip').onclick = () => tab('Profile');

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
      <p class="note">Epic and Legendary cards come from chests, the ladder and the Market once you are in.</p>`;
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
      P.cards = {}; for (const id of deck) P.cards[id] = 1; P.decks = Array.from({length:DECK_SLOTS}, (_, i) => i ? [] : deck.slice()); P.deck = 0; P.coins = START_COINS - spent() + START_GIFT; save(); BDB.sfx.big(); fx('coin', {delay:.35}); step4();      // the deck is built: here is a proper purse to start on
    };
    draw();
  };
  const step4 = () => {
    const over = P.coins - START_GIFT;
    box.innerHTML = `<div class="k-eyebrow">You are in</div><h2>${fmt(START_GIFT)} coins to start</h2><p class="note" style="max-width:540px;margin:0 auto 6px">A welcome gift${over > 0 ? `, on top of the ${fmt(over)} you had left over` : ''}. Spend it in the Market on chests, ready-made decks and upgrades. Win on the ladder for more coins, chests and BDB's own cards. There are ${fmt(CARD_IDS.length)} cards to collect.</p>
      <div class="pilepic"></div><div class="bigcoin">${fmt(P.coins)}</div>
      <div class="k-row"><button type="button" class="k-btn primary big" id="onFight">Fight level 1</button><button type="button" class="k-btn big" id="onShop">See the Market</button></div>`;
    const done = t => { P.onboarded = true; save(); show('scrHub'); tab(t); hallStart(); const gift = takeGifts(); return ownerHello() || giftHello(gift); };
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
    b.querySelector('#vsFacts').innerHTML = [ladder ? `Level ${fmt(cpu.level)}, ${T.name}` : cpu.tag.replace(/\..*$/, ''), n > 1 ? '' : ladder ? cpu.tag.replace(/\.$/, '') : '', `Plays at ${brainName(cpu.ai)}`, `Cards level ${lv}${lv > cpu.lvl ? ', matched to yours' : ''}`, soft < 1 ? `Towers at ${Math.round(soft * 100)}% health` : '']
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
/* BDB's Boost deck: none while a new player is finding their feet (the first ten rungs, and Easy), then stronger the higher his cards are */
const bdbBoosts = c => (c.level && c.level <= 10) || c.skill === 'easy' ? [] : cpuBoosts(c.deck, c.lvl >= 8 ? 3 : c.lvl >= 4 ? 2 : 1);
async function begin(o){
  A.music('off');
  const me = B = {...o, team:o.mode === 'guest' && !o.coop ? 1 : 0, me:o.mode === 'guest' ? 1 : 0, sel:-1, bsel:-1, bstKey:'', over:false, run:false, acc:0, ents:[], traps:[], prev:new Map(), netEv:[], handKey:'', info:null, said:{}, pz:null, pzUsed:[false, false], ready:null};
  B.coach = o.mode === 'cpu' && (Q.get('coach') || (!P.flags.coach && !Q.get('skip') && !Q.get('fast') && P.stats.w + P.stats.l + P.stats.d === 0)) ? {step:0, at:0} : null; B.hold = !!B.coach; coachOff();
  if (o.mode === 'host') B.ready = new Promise(res => { B.rdRes = res; });
  ordSel = 0; show('scrBattle'); $('emoPanel').hidden = true; $('insp').hidden = true; $('bstBar').hidden = true; $('bstTray').innerHTML = ''; $('scrBattle').classList.remove('boosts'); $('btPause').disabled = false; $('hand').innerHTML = ''; $('nextCard').innerHTML = '';
  $('oppName').textContent = o.oppName; $('meName').textContent = P.name; $('meDot').textContent = P.name[0].toUpperCase();
  $('oppDot').style.cssText = o.mode === 'cpu' ? '' : 'background:#5a1320;display:grid;place-items:center;font:800 11px/1 var(--f-body)'; $('oppDot').textContent = o.mode === 'cpu' ? '' : o.oppName[0].toUpperCase();
  const w = $('wait'), tip = `<p class="tip"><em>Tip</em>${esc(pick(TIPS))}</p>`; w.hidden = false; w.innerHTML = vsCard(o, tip + '<p class="ld">Bringing both decks onto the field.</p>');
  if (MD && V && o.units) try { await Promise.all([MD.needModels(o.units, Q.get('fast') ? 60000 : 25000), V.needFloor(o.map)]); } catch(e){}
  if (B !== me) return;                                   // they backed out while it loaded
  if (V) V.reset(B.team, o.map);
  if (V && o.units){ try { await Promise.race([V.warm(o.units), sleep(9000)]); } catch(e){} if (B !== me) return; }      // build every shader and send every model to the graphics card now, not mid-match
  B.ais = [];
  if (o.coop && o.mode === 'host'){                       // you and a friend against two BDBs, or three for a handicap. Two decks a side, so both sides' towers are tougher
    const cs = o.cpus, O = TEAM_ODDS[cs.length], dk = c => c.deck.map(id => ({id, lvl:c.lvl}));
    B.sim = createSim({map:o.map, decks:[myDeck(), o.oppDeck, ...cs.map(dk)], teams:[0, 0, ...cs.map(() => 1)], seed:(Math.random() * 2 ** 31) | 0, elMul:[1, 1, ...cs.map(c => c.ai.el * O.el)], start:[5, 5, ...cs.map(() => 5 * O.el)], boosts:[curBoosts(), o.oppBoosts || [], ...cs.map(bdbBoosts)],
      towerLvl:[o.teamTower || myTower(), cs[0].tower || cs[0].lvl], boost:[{hp:TEAM_TOWERS}, {hp:TEAM_TOWERS * (cs[0].soft || 1)}]});
    B.ais = cs.map((c, i) => createAI(B.sim, 1, c.ai, Math.random, 2 + i));
  } else if (o.mode === 'host'){
    B.sim = createSim({map:o.map, decks:[myDeck(), o.oppDeck], seed:(Math.random() * 2 ** 31) | 0, towerLvl:[myTower(), o.oppTower], boosts:[curBoosts(), o.oppBoosts || []]});
  } else if (o.mode === 'cpu'){                           // against BDB your player upgrades count; online everyone is even
    const c = o.cpu, k = P.perks, all = [c, ...(o.more || [])], O = ODDS[all.length];      // raised odds: every BDB has his own deck and Mana bar, and a share of the usual Mana
    B.sim = createSim({map:o.map, decks:[myDeck(), ...all.map(q => q.deck.map(id => ({id, lvl:c.lvl})))], teams:[0, ...all.map(() => 1)], seed:(Math.random() * 2 ** 31) | 0, boosts:[curBoosts(), ...all.map(bdbBoosts)],
      elMul:[1 + k.flow * PERKS.flow.per, ...all.map(q => q.ai.el * O.el)], start:[5 + k.start * PERKS.start.per, ...all.map(() => 5 * O.el)], towerLvl:[myTower(), c.tower || c.lvl],
      boost:[{hp:1 + k.hp * PERKS.hp.per, dmg:1 + k.dmg * PERKS.dmg.per}, {hp:c.soft || 1}]});
    B.ais = all.map((q, i) => createAI(B.sim, 1, q.ai, Math.random, 1 + i));
  }
  hud(true);
  cancelAnimationFrame(raf); lastT = performance.now(); raf = requestAnimationFrame(loop);
  if (o.mode === 'guest' && room) room.send('rd', {}, OL && OL.opp);
  if (o.mode === 'host'){ const ld = w.querySelector('.ld'); if (ld) ld.textContent = `Waiting for ${o.mate || o.oppName} to load in.`; await Promise.race([B.ready, sleep(20000)]); if (B !== me) return; }
  let n = 3;
  const cd = () => { if (B !== me) return; if (n > 0){ if (n === 3) w.innerHTML = vsCard(o, '<b class="cnt"></b>'); const q = w.querySelector('.cnt'); if (q){ q.textContent = n; q.classList.remove('tk'); void q.offsetWidth; q.classList.add('tk'); } fx('tock', null, () => tone(1200, .03, 'square', .02)); n--; setTimeout(cd, Q.get('fast') ? 60 : 800); } else { w.hidden = true; B.run = true; B.t0 = performance.now(); SND.horn(); A.music('battle'); if (B.coach) setTimeout(() => { if (B === me) coach(0); }, 700); talk(o.mode === 'cpu' ? (o.odds === 3 ? TALK.start3 : o.odds === 2 ? TALK.start2 : TALK.start) : o.coop ? [`Two of you? Fine. There are ${o.coop === 3 ? 'three' : 'two'} of me. You're teamed with ${o.mate}.`] : ["Two real players. BDB is watching from the break room."], true); if (o.mode === 'host') startTicker(); } };
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
    if (B.hold) B.acc = 0;                               // a first match waits for the player's first card
    else if (B.mode === 'cpu'){ B.acc += dt; let n = 0; while (B.acc >= DT && n++ < 6 && !B.sim.over){ for (const a of B.ais) a.tick(); B.sim.step(); B.acc -= DT; pump(); } if (n >= 6) B.acc = 0; }
    else if (B.mode === 'host') hostPump();
  }
  if (V){ V.setTraps(myTraps()); V.frame(B.pz || (B.mode === 'cpu' && !B.run) ? 0 : dt, B.mode === 'guest' ? B.ents : B.sim.ents); stepBubbles(); }
  hud();
  raf = requestAnimationFrame(loop);
}
/* the traps this player is allowed to see: their own team's, and any Instant Replay that has already been sprung */
const myTraps = () => !B ? [] : B.mode === 'guest' ? B.traps : !B.sim ? [] : B.sim.traps.filter(t => t.team === B.team || t.live > 0);
/* ---------- a player's first match: four short tips, each shown when it is about to matter ---------- */
const COACH = ['Tap a card, then tap your half of the field. The match starts when you do.',
  'That cost Mana. The bar under your cards fills back up by itself, and faster as the match goes on.',
  "BDB's troops go for your towers. Drop a troop in their way.",
  'Every tower you take is a crown. Most crowns when time runs out wins. Take his King Tower and it is over on the spot.'];
function coach(i, ms){
  if (!B || !B.coach || B.over || B.coach.step > i) return;
  B.coach.step = i + 1; B.coach.at = performance.now();
  const el = $('coach'); el.innerHTML = `<small>Tip ${i + 1} of ${COACH.length}</small>${esc(COACH[i])}`; el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
  clearTimeout(coach.t); if (ms) coach.t = setTimeout(coachOff, ms);
  fx('pop');
}
function coachOff(){ clearTimeout(coach.t); const el = $('coach'); if (el) el.hidden = true; }
/* while a match loads and counts down: who is playing whom, where, and one thing worth knowing */
const TIPS = ['A full Mana bar is wasted Mana. Spend it.', 'Spells do far less to towers than to troops.', 'Take one of his towers and your troops can land on that side of his half.',
  'Swords cannot reach flyers. Bring something that shoots.', `${SET_AT[0]} cards of one type in a deck fight ${Math.round((SET_MUL[0] - 1) * 100)}% harder. ${SET_AT[1]} of them, ${Math.round((SET_MUL[1] - 1) * 100)}%.`,
  'He cannot see your traps until one goes off.', `Every tower you take raises what a win pays: x${CROWN_PAY[1]}, x${CROWN_PAY[2]}, then x${CROWN_PAY[3]}.`, 'Mana comes in faster every two minutes.',
  'In overtime the next tower wins it.', 'Drag a card over the field to see where it will land before you let go.', 'Tap any troop on the field to see what it is and what it does.'];
function vsCard(o, below){
  const T = tierOf(nextLevel()), solo = o.mode === 'cpu', bdb = solo || o.coop, c = o.cpu, rec = bdb ? '' : vsLine(o.oppName);      // rec: the score so far against a real opponent
  const sub = solo ? (c.rand ? `${(SKILLS.find(k => k.id === c.skill) || {name:'Quick'}).name} quick battle` : `Level ${fmt(c.level)}, ${TIERS[c.tier].name} tier`) + (o.odds > 1 ? `. ${o.odds} against 1` : '') : o.coop ? `${teamSkName(o.skill)}, ${o.coop} against 2` : 'Online, even cards' + (rec ? '. ' + rec[0].toUpperCase() + rec.slice(1) : '');
  return `<div class="vs2"><div class="plate opp"><span class="pav${bdb ? ' bdb' : ''}">${bdb ? '' : esc(o.oppName[0].toUpperCase())}</span><div><strong>${esc(o.oppName)}</strong><small>${esc(sub)}</small></div></div>
    <div class="vsb" aria-hidden="true">VS</div>
    <div class="plate me"><img class="pav" alt="" src="${tierPic(T)}"><div><strong>${esc(o.coop && o.mate ? `${P.name} and ${o.mate}` : P.name)}</strong><small>${esc(T.name)} tier</small></div></div>
    <div class="where">${esc(MAPS[o.map].name)}</div>${below}</div>`;
}
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
/* what the fight sounds like. Shots and blows are placed left or right by where they happen on the screen. */
const SHOT = {arrow:'arrow', bolt:'arrow', sting:'arrow', leaf:'arrow', bullet:'gun', shell:'gun', fire:'fire', zap:'zap', vial:'throw', potion:'throw', spit:'throw', ball:'throw', rock:'throw', bomb:'throw'};      // anything else is magic
const BOOM = {rage:'rage', heal:'heal', grave:'raise', tornado:'wind', fire:'fire', ward:'spell', zap:'thunder', rain:'rain', quake:'quake', poison:'poison', tox:'poison', meteor:'boombig', freeze:'freeze', snap:'freeze'};
const LAND = {fire:'fire', frost:'freeze', roar:'rage', shield:'clang', summon:'raise'};
const entOf = id => !B ? null : B.mode === 'guest' ? B.prev.get(id) : B.sim ? B.sim.byId.get(id) || B.sim.ents.find(o => o.id === id) : null;
const panAt = (x, z) => { if (!V) return 0; try { return clamp(V.panOf(x, z), -1, 1) * .55; } catch(e){ return 0; } };
function hear(e){
  const k = e.e;
  if (k === 'atk'){ const o = entOf(e.id); if (!o) return; const r = o.U.role;
    fx(e.big ? 'crit' : r === 'swarm' || r === 'flock' ? 'tapx' : r === 'killer' ? 'slash' : r === 'giant' || r === 'tank' ? 'thud' : 'hit', {pan:panAt(o.x, o.z)}); }
  else if (k === 'shot'){ const o = entOf(e.id); if (o) fx(o.U.twr ? 'shotx' : SHOT[e.k] || 'magic', {pan:panAt(o.x, o.z)}); }
  else if (k === 'boom'){ if (e.k !== 'bolt') fx(BOOM[e.k] || 'boom', {pan:panAt(e.x, e.z), vol:e.k === 'fire' ? 2 : 1}, e.k === 'rage' ? null : BEEP.boom); }
  else if (k === 'bolt'){ const p = e.pts && e.pts[0]; fx('thunder', p ? {pan:panAt(p[0], p[1])} : null, e.q ? BEEP.crack : null); }
  else if (k === 'chain') fx('zap');
  else if (k === 'godfall'){ fx('thunder'); fx('boombig', {delay:.15}); }
  else if (k === 'land') fx(LAND[e.k] || 'dropbig', {pan:panAt(e.x, e.z), vol:e.k === 'shield' ? .5 : 1});
  else if (k === 'heal' || k === 'wish' || k === 'revive') fx('heal');
  else if (k === 'mana') fx('coin');
  else if (k === 'raise') fx('raise', {pan:panAt(e.x, e.z)});
  else if (k === 'summon') fx('raise');
  else if (k === 'warp' || k === 'morph') fx('warp');
  else if (k === 'leap' || k === 'charge' || k === 'dodge') fx('throw', {rate:k === 'charge' ? .8 : 1, vol:1.3});
  else if (k === 'boost'){ const b = BOOSTS[e.id], f = b ? b.fx : ''; fx(f === 'heal' || f === 'regen' || f === 'health' || f === 'revive' || f === 'cleanse' ? 'heal' : f === 'frost' ? 'freeze' : f === 'flame' ? 'fire' : f === 'shield' || f === 'guard' ? 'spell' : 'rage', {pan:panAt(e.x, e.z), vol:.8, rate:1.2, gap:.2}); }
  else if (k === 'bdeal'){ if (e.pid === B.me) fx('card', {vol:.8, rate:1.3}); }
  else if (k === 'rampage'){ const o = entOf(e.id); fx('rage', {pan:o ? panAt(o.x, o.z) : 0, vol:e.n > 1 ? 1 : .75, rate:e.n > 1 ? .85 : 1.12, gap:.25}); }
  else if (k === 'order'){ if (e.pid === B.me) fx('place', {vol:.7, rate:1.25}, BDB.sfx.tick); }
  else if (k === 'reflect' || k === 'shbreak' || k === 'trapx') fx('clang', {vol:k === 'shbreak' ? 1 : .6});
}
function hearDeath(o, how){                              // the view calls this as a troop or a building goes, with what became of it
  if (!B || !o || !o.U || o.U.twr) return;
  const U = o.U, p = {pan:panAt(o.x, o.z)};
  if (U.bld) fx('crash', p);
  else if (how === 'bones' || /^skel/.test(o.key)) fx('bones', p);
  else if (how === 'shards') fx('freeze', {...p, vol:.55, rate:1.6});          // ice breaking
  else if (how === 'scrap'){ fx('clang', p); fx('boom', {...p, vol:.4, rate:1.3}); }
  else { fx('poof', p); if (U.role === 'giant' || U.role === 'tank') fx('thud', p); }
}
function onEvents(ev){
  for (const e of ev){
    hear(e);
    if (e.e === 'tower' && !e.king && B.coach) setTimeout(() => coach(3, 10000), 1600);
    if (e.e === 'tower'){
      const mine = e.team === B.team; fx('tower', {pan:panAt(e.x || 0, e.z || 0) * .6}, BEEP.boom); A.duck(.45, 1.5); buzz(mine ? [50, 40, 110] : [25, 35, 25]);
      if (!e.king){ stamp(mine ? 'Tower down' : 'Crown!', mine); if (!mine){ fx('crown', {delay:.6}); const I = info(), n = I ? I.crowns[B.team] | 0 : 0; if (n >= 1 && n <= 2) note(`A win now pays x${CROWN_PAY[n]}`); } talk(B.mode === 'cpu' ? (mine ? TALK.heScores : TALK.youScore) : (mine ? TALK.pvpDown : TALK.pvpUp), true); if (B.mode === 'cpu' && Math.random() < .6) setTimeout(() => showEmote(mine ? pick([0, 2, 3]) : pick([1, 4]), false), 900); }
    } else if (e.e === 'king'){ if (e.team !== B.team && B.mode === 'cpu') talk(TALK.king); }
    else if (e.e === 'ot'){ stamp('Overtime'); note(`Two minutes, Mana x${OT_MANA}. The next tower wins`); fx('hornot', null, BEEP.horn); A.hurry(true); if (B.mode === 'cpu') talk(TALK.ot, true); }
    else if (e.e === 'drop' || e.e === 'spell'){
      const c = CARDS[e.id];
      if ((e.rar === 'l' || e.rar === 'g') && c){ const god = e.rar === 'g'; if (god) SND.god(); else SND.legend(); const d = document.createElement('div'); d.className = 'legend-banner' + (god ? ' god' : ''); d.innerHTML = `<small>${god ? 'A God takes the field' : 'Legendary'}</small><b>${esc(c.name)}</b>`; $('scrBattle').appendChild(d); setTimeout(() => d.remove(), 2000); if (e.team !== B.team && B.mode === 'cpu') talk(TALK.legend); }
      else if (e.e === 'spell') fx('spell', {pan:panAt(e.x, e.z)}, BEEP.spell);
      else fx(c && c.U && c.U.bld ? 'build' : c && c.U && (c.U.role === 'giant' || c.U.role === 'tank') ? 'dropbig' : 'drop', {pan:panAt(e.x, e.z), rate:e.team === B.team ? 1 : .92}, BEEP.drop);
      if (c && e.e === 'drop' && e.u && c.kind === 'unit' && (c.rar !== 'c' || Math.random() < .6)){ const uid = e.u, line = sayFor(c.base, c.type), mine = e.team === B.team, big = c.rar === 'l' || c.rar === 'e' || c.rar === 'g'; setTimeout(() => { if (B && !B.over) bubble(uid, line, mine, big); }, 420); }
    }
    else if (e.e === 'grow'){ if (Math.random() < .45) bubble(e.id, sayWhen('kill'), true); }
    else if (e.e === 'bdeal'){ if (e.pid === B.me && !P.flags.bt1){ P.flags.bt1 = 1; save(); note('A Boost arrived. Tap it, then tap your troops of its type'); } }
    else if (e.e === 'boost'){ const b = BOOSTS[e.id]; if (b && e.team !== B.team) note(`${B.mode === 'cpu' ? 'He' : 'They'} used ${b.name} on ${B.mode === 'cpu' ? 'his' : 'their'} ${TYPES[b.type].name} troops`); }
    else if (e.e === 'rampage'){ const o = entOf(e.id), R = RAMPAGE[e.k]; if (o && R){ const mine = o.team === B.team; note(`${mine ? 'Your' : B.mode === 'cpu' ? 'His' : 'Their'} ${o.U.name} ${e.n > 1 ? 'is unstoppable' : 'is on a rampage'}: ${R.name}`); if (mine){ bubble(e.id, sayWhen('kill'), true, true); buzz(18); } else if (B.mode === 'cpu' && e.n > 1) talk(TALK.legend); } }
    else if (e.e === 'revive'){ bubble(e.id, sayWhen('low'), true); }
    else if (e.e === 'trapset'){ if (e.team === B.team) SND.trapSet(); else { note(B.mode === 'cpu' ? 'He set a trap' : 'They set a trap'); if (B.mode === 'cpu') talk(TALK.trapSet); } }
    else if (e.e === 'trap'){
      const mine = e.team === B.team, c = CARDS[e.id]; SND.trap();
      if (e.k !== 'counter'){ stamp(mine ? 'Trap!' : "It's a trap!", !mine); note(c ? c.name : 'Trap'); if (B.mode === 'cpu') talk(mine ? TALK.trapOnHim : TALK.trapHit, true); }
    } else if (e.e === 'negate'){ const mine = e.team !== B.team; SND.negate(); stamp(mine ? 'Waved off!' : 'No basket!', !mine); if (e.burn && e.pid === B.me) note(`You lose ${e.burn} Mana`); if (B.mode === 'cpu') talk(mine ? TALK.foulOnHim : TALK.foulOnYou, true); }
    else if (e.e === 'trapx'){ note(e.team === B.team ? 'Your trap was cleared' : 'You cleared a trap'); }
    else if (e.e === 'shbreak'){ if (e.twr) note(e.team === B.team ? 'Your tower shield broke' : 'His tower shield broke'); }
    else if (e.e === 'over' && !B.over){ B.over = true; B.mv = e.mv; B.ft = e.ft; A.music('off'); if (V){ V.setGhost(false); V.setNoGo(false); } const w = e.w, cr = e.cr; setTimeout(() => finish(w, cr), Q.get('fast') ? 50 : 1700); }
  }
}
const info = () => { if (B.mode === 'guest') return B.info; const s = B.sim; if (!s) return null; const p = s.players[B.me]; return {el:p.el, hand:p.hand, next:p.next, left:s.left, phase:s.phase, crowns:s.crowns, pocket:s.pocket(B.team), bonus:p.idle > PATIENT, bh:p.bh, bn:Math.ceil(p.bn * DT), bq:p.bq.length}; };
function hud(force){
  const I = info(); if (!I) return;
  const key = I.hand.map(c => c.id).join() + '|' + I.next.id;
  if (force || key !== B.handKey){
    B.handKey = key;
    const hd = $('hand'); hd.innerHTML = ''; I.hand.forEach((c, i) => { const el = cardEl(c.id, {lvl:c.lvl, now:true}); el.dataset.slot = i; if (i === B.sel) el.classList.add('sel'); hd.appendChild(el); });
    const nx = $('nextCard'); nx.innerHTML = ''; nx.appendChild(cardEl(I.next.id, {div:true, now:true}));
  }
  // the Boosts in hand: a small tray above the cards, and how long until the next one
  const bh = I.bh || [], bkey = bh.join(), bar = $('bstBar'), any = bh.length > 0 || (I.bq > 0 && B.run);
  if (bar.hidden === any){ bar.hidden = !any; $('scrBattle').classList.toggle('boosts', any); }
  if (any){
    if (bkey !== B.bstKey){
      const was = (B.bstKey || '').split(',').filter(Boolean); B.bstKey = bkey; if (B.bsel >= bh.length) bselect(-1);
      $('bstTray').innerHTML = bh.map((id, i) => boostTile(id, (i === B.bsel ? 'sel' : '') + (i >= was.length && B.run ? ' new' : ''))).join(''); [...$('bstTray').children].forEach((el, i) => { el.dataset.slot = i; });
    }
    const full = bh.length >= BOOST_HAND, nx = $('bstNext'); nx.classList.toggle('full', full); $('bstNextN').textContent = full ? 'Full' : I.bq > 0 ? I.bn : '';
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
    if (rate > (B.said.rate || 1)){ B.said.rate = rate; stamp('Mana x' + rate); fx('hornup', null, BEEP.horn); if (B.mode === 'cpu' && rate === 2) talk(TALK.late, true); else if (B.mode === 'cpu' && rate === 3) talk(TALK.last, true); }
  }
  const t = Math.ceil(I.left); $('clockT').textContent = mmss(t);
  if (B.run && !B.over && t <= 10 && t > 0 && B.said.tk !== t){ B.said.tk = t; fx('tock'); }
  if (B.coach && B.coach.step === 2 && B.sim && performance.now() - B.coach.at > 9000 && B.sim.tick % 10 === 0 && B.sim.ents.some(o => o.team !== B.team && !o.U.twr && !o.U.bld && o.z > 1.5)) coach(2, 9000);      // the last ten seconds tick
  $('clockLbl').textContent = I.phase === 'ot' ? 'Overtime' : rate > 1 ? 'Mana x' + rate : 'Time left'; $('clock').classList.toggle('hot', I.phase === 'ot' || t <= 30);
  $('meCr').textContent = I.crowns[B.team]; $('oppCr').textContent = I.crowns[1 - B.team];
  if (B.run && !B.over && B.mode === 'cpu' && performance.now() - lastTalk > 38000){ lastTalk = performance.now(); BDB.roast(); }
}

/* ---------- playing cards: drag from the hand, or tap a card then tap the floor ---------- */
let aim = null;
/* a Boost is picked from the tray the same way a card is, and dropped on the field: the circle is green when a troop of its type is inside it */
function bselect(i){
  if (i >= 0){ if (B.sel >= 0) select(-1); if (ordSel){ ordPick(0); $('insp').hidden = true; } }
  B.bsel = i; for (const c of $('bstTray').children) c.classList.toggle('sel', +c.dataset.slot === i);
  if (V && i < 0) V.setGhost(false);
}
const boostHits = (id, p) => { const b = BOOSTS[id]; return (B.mode === 'guest' ? B.ents : B.sim.ents).filter(e => e.team === B.team && e.hp > 0 && !e.dep && !e.U.bld && !e.U.twr && e.U.type === b.type && Math.hypot(e.x - p.x, e.z - p.z) <= BOOST_R + e.U.r * .5).length; };
function tryBoost(slot, p){
  if (!B || !B.run || B.over || B.pz || slot < 0 || !p) return false;
  const I = info(), id = I && I.bh && I.bh[slot]; if (!id) return false;
  const b = BOOSTS[id]; let ok = boostHits(id, p) > 0;
  if (ok){ if (B.mode === 'guest') room.send('b', {slot, id, x:Math.round(p.x * 100) / 100, z:Math.round(p.z * 100) / 100}, OL.opp); else ok = B.sim.boost(B.me, slot, p.x, p.z); }
  if (!ok){ BDB.sfx.bad(); note(`No ${TYPES[b.type].name} troops of yours there`); const el = $('bstTray').children[slot]; if (el){ el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); } return false; }
  buzz(10); bselect(-1); return true;
}
$('bstTray').addEventListener('pointerdown', e => {
  const c = e.target.closest('.btile'); if (!c || !B || B.over || e.button === 2) return;
  e.preventDefault(); const i = +c.dataset.slot;
  if (B.bsel === i){ bselect(-1); return; }
  bselect(i); fx('card', null, BDB.sfx.tick); const I = info(), id = I && I.bh[i]; if (id) note(`${boostName(id)}: drop it on your ${TYPES[BOOSTS[id].type].name} troops`);
});
function select(i){
  if (i >= 0 && ordSel){ ordPick(0); $('insp').hidden = true; }
  if (i >= 0 && B.bsel >= 0) bselect(-1);
  B.sel = i; for (const c of $('hand').children) c.classList.toggle('sel', +c.dataset.slot === i);
  const I = info(), c = i >= 0 && I ? CARDS[I.hand[i].id] : null; if (V){ V.setNoGo(!!c && c.kind !== 'spell' && !(c.U && c.U.any), I ? I.pocket : null); if (i < 0) V.setGhost(false); }
}
function ghostAt(cx, cy){
  const I = info(); if (!V || !I) return null;
  if (B.bsel >= 0){ const p = V.pick(cx, cy), id = I.bh && I.bh[B.bsel]; if (!p || !id){ V.setGhost(false); return null; } V.setGhost(true, p.x, p.z, BOOST_R, boostHits(id, p) > 0, null); return p; }
  if (B.sel < 0) return null;
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
  buzz(10); jobTick('play'); if (CARDS[c.id] && CARDS[c.id].kind === 'spell') jobTick('spell');
  select(-1); if (B.coach && B.hold){ B.hold = false; B.coach.step = 1; coach(1, 8000); } return true;
}
const overArena = (x, y) => { const r = $('arena').getBoundingClientRect(); return y < r.bottom && y > r.top && x > r.left && x < r.right; };
$('hand').addEventListener('pointerdown', e => {
  const c = e.target.closest('.card'); if (!c || !B || B.over || e.button === 2) return;
  const i = +c.dataset.slot; e.preventDefault();
  if (B.sel === i && !aim){ select(-1); return; }
  select(i); fx('card', null, BDB.sfx.tick);
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
  else if (B.sel >= 0 || B.bsel >= 0){ floorAim = true; ghostAt(e.clientX, e.clientY); }
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
  if (floorAim){ floorAim = false; const p = ghostAt(e.clientX, e.clientY); if (!(B.bsel >= 0 ? tryBoost(B.bsel, p) : tryPlay(B.sel, p)) && V) V.setGhost(false); }
  else if (pan){ const moved = pan.moved; pan = null; if (!moved && e.type === 'pointerup') tapField(e.clientX, e.clientY); }
};
$('arena').addEventListener('pointerup', arenaUp); $('arena').addEventListener('pointercancel', arenaUp);
$('arena').addEventListener('wheel', e => { if (!B || !V) return; e.preventDefault(); V.zoomBy(e.deltaY < 0 ? 1.14 : 1 / 1.14); }, {passive:false});
$('btView').onclick = () => { if (V) V.resetCam(); };

/* Orders. Tap one of your side's troops (or a building that shoots), then tap what it should go for: an enemy troop, building or tower. It goes for that, past
   anything nearer, until one of them is gone. Tap the troop again to call the order off; tap the ground to let go of it. */
let ordSel = 0;
const WHYNOT = {air:'It cannot reach anything that flies', only:'It only goes for buildings and towers', far:'That is out of its reach', gone:'It cannot get at that', none:'That one does not take orders'};
const unitNow = id => !B ? null : (B.mode === 'guest' ? B.ents : B.sim ? B.sim.ents : []).find(o => o.id === id) || null;
function ordPick(id){ ordSel = id || 0; if (V) V.setSel(ordSel); }
function sendOrder(uid, tid){
  if (B.mode === 'guest'){ room.send('o', {u:uid, t:tid}, OL.opp); return true; }
  return B.sim.order(B.me, uid, tid);
}
function tapField(cx, cy){
  const e = V && V.entityAt(cx, cy), live = B.run && !B.over && !B.pz;
  if (ordSel && live){
    const u = unitNow(ordSel);
    if (!u || u.hp <= 0) ordPick(0);
    else if (e && e.team !== B.team){                                        // the order itself
      const why = orderProblem(u, e); if (why){ note(WHYNOT[why] || WHYNOT.gone); BDB.sfx.bad(); return; }
      if (!sendOrder(u.id, e.id)){ note(WHYNOT.gone); BDB.sfx.bad(); return; }
      buzz(12); ordPick(0); $('insp').hidden = true; return;
    }
    else if (e && e.id === ordSel){ const had = u.ord; if (had || B.mode === 'guest') sendOrder(u.id, 0); if (had) note('Order called off'); ordPick(0); $('insp').hidden = true; return; }
    else if (!e){ ordPick(0); $('insp').hidden = true; return; }
  }
  ordPick(e && live && e.team === B.team && !e.U.twr && e.U.dmg > 0 ? e.id : 0);
  inspect(cx, cy);
}
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
  const R = !U.twr && !U.bld && U.dmg ? RAMPAGE[U.type] : null, tg = e.ord ? unitNow(e.ord) : null;
  const more = (R ? `<p class="iramp${e.ram ? ' on' : ''}" style="--ty:${TYPES[U.type].col}"><b>${e.ram ? (e.ram > 1 ? 'Unstoppable' : 'On a rampage') : `Rampage at ${RAMP_AT[0]} kills${e.kc ? `, ${Math.min(e.kc, RAMP_AT[0])} so far` : ''}`}: ${esc(R.name)}.</b> ${esc(R.text)}</p>` : '')
    + (ordSel === e.id ? `<p class="iord">${tg ? `Sent after ${esc(tg.U.name)}. Tap it again to call that off, or tap` : 'Tap'} an enemy troop, building or tower to send it there.</p>` : '');
  const pick = ordSel === e.id, title = c && (!c.n || c.n === 1) ? c.name : (AFF[U.aff].name ? AFF[U.aff].name + ' ' : '') + U.name;
  box.className = 'insp ' + (mine ? 'mine' : 'theirs') + (c ? ' r-' + c.rar : '') + (pick ? ' pick' : '');
  // a troop picked to be given an order gets a short box that leaves the field in view: the full facts are on its card
  box.innerHTML = pick ? `<div class="ih"><b>${esc(title)}</b><span>Level ${e.lvl || 1}, ${Math.max(0, Math.ceil(e.hp))} of ${e.max} health</span></div>${more}`
    : `<div class="ih"><b>${esc(title)}</b><span>${mine ? 'Yours' : 'Enemy'}, level ${e.lvl || 1}${c ? ', ' + RAR[c.rar].name + ' ' + TYPES[c.type].name : ''}</span></div><p>${esc(what)}</p><div class="ig">${rows.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>${more}`;
  box.hidden = false; clearTimeout(inspT); inspT = setTimeout(() => { box.hidden = true; if (ordSel === e.id) ordPick(0); }, ordSel === e.id ? 9000 : 7000);      // a troop left picked and not sent anywhere is let go of
}
addEventListener('keydown', e => { if (!B || $('scrBattle').hidden) return; if (e.key >= '1' && e.key <= String(HAND)) select(B.sel === +e.key - 1 ? -1 : +e.key - 1); else if (e.key === 'Escape'){ select(-1); bselect(-1); } });
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
  if (!B || B.done) return; B.done = true; B.over = true; const ms0 = new Set(msDue()); if (B.coach){ P.flags.coach = 1; coachOff(); } clearInterval(pzIv); B.pz = null; $('wait').hidden = true; clearBubbles();
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
      pay = payout(win ? B.base || 120 : draw ? 50 : 30, mine, {...up, label:win ? `${n === 3 ? '2 v 3' : '2 v 2'} won, ${teamSkName(B.skill)}` : draw ? 'A draw' : 'Showing up', pay:O.pay, payLabel:'Outnumbered, 2 v 3'}); }
    else {
      if (win){ P.trophies += 30; P.stats.ow++; lines.push('+30 trophies.'); } else if (!draw){ P.trophies = Math.max(0, P.trophies - 20); P.stats.ol++; lines.push('-20 trophies.'); }
      const who = vsAdd(B.oppName, win ? 0 : draw ? 2 : 1); if (who) lines.push(`Against ${who}: ${vsLine(who)}.`);
      pay = payout(win ? 150 : draw ? 50 : 25, mine, {...up, label:win ? 'Online win' : draw ? 'A draw' : 'Showing up'});
    }
    if (OL) OL.again = {me:false, them:false};      // the room stays open on the result screen, so either player can ask for another one
  }
  // every tower taken also counts towards the bounty pack
  if (mine > 0){ P.bounty = Math.min(999, P.bounty + mine); lines.push(P.bounty >= BOUNTY ? `Tower bounty full: a ${PACK[bountyPack()].name} is waiting on the Battle tab.` : `Tower bounty ${P.bounty} of ${BOUNTY}.`); }
  const packGot = pack ? openPack(pack).map(grant) : null; const jd = [], jt = (k, n) => jd.push(...jobTick(k, n));
  if (pack){ P.stats.packs++; jt('chest'); }
  if (mine > 0) jt('tower', mine);
  if (win){ jt('win'); if (mine >= 3) jt('king');
    if (B.mode === 'cpu'){ const c = B.cpu; if (c.rand){ if (c.skill !== 'easy') jt('quick'); if (c.skill === 'insane' || c.skill === 'legend') jt('hard'); } else if (B.first) jt('ladder'); if ((B.odds || 1) > 1) jt('odds'); }
    else jt('online'); }
  for (const t of jd) lines.push(`Job done: ${t}. Collect it on the Battle tab.`);
  for (const k of msDue()) if (!ms0.has(k)) lines.push(`Milestone: ${MILESTONES[k].name}, ${fmt(MILESTONES[k].at[msAt(k)])}. A ${msPrize(msAt(k)).pk.name} is waiting on your Profile.`);
  if (why) lines.unshift(why);
  // goals: counted from what each card in the deck did this match (from the rules where they ran here, from the host's last word where they did not)
  const fts = B.sim && B.sim.feats ? B.sim.feats : B.ft, gdone = goalTick(Array.isArray(fts) ? fts[B.me] : null, {win, crowns:mine, deck:curDeck()}), gpay = gdone.reduce((a, g) => a + g.pay, 0);
  for (const g of gdone.slice(0, 4)) pay.rows.push(['Goal: ' + g.text, '+' + fmt(g.pay)]);
  if (gdone.length > 4) pay.rows.push([`${gdone.length - 4} more goal${gdone.length > 5 ? 's' : ''}`, '+' + fmt(gdone.slice(4).reduce((a, g) => a + g.pay, 0))]);
  const coins = pay.coins + gpay; P.coins += coins; save();
  A.music('off'); fx(win ? 'win' : draw ? 'draw' : 'lose', null, win ? BDB.sfx.big : BDB.sfx.bad); buzz(win ? [30, 50, 30, 50, 120] : draw ? 60 : 180); if (win && coins > 0) fx('coins', {delay:2.6});
  setTimeout(() => { if (!B || B.done) A.music('menu'); }, 3800);
  const many = B.mode === 'cpu' && B.odds > 1;
  const line = B.mode === 'cpu' ? pick(win ? (many ? TALK.winMany : TALK.win) : draw ? ["A draw. We'll both tell people we won."] : many ? TALK.loseMany : TALK.lose) : (win ? 'BDB watched the whole thing and learned nothing.' : draw ? 'A draw. BDB is counting it as a win for him anyway.' : 'BDB says he could have won that one. He could not.');
  const c = B.cpu, wasCpu = B.mode === 'cpu', ladder = wasCpu && !c.rand, nextUp = ladder && win && c.level < LEVELS && c.level + 1 <= P.ladder + 1, odds = B.odds || 1;
  // the troop that did the most damage for this player: from the sim where it ran here, from the last event where it ran on the host
  const mvs = B.sim && B.sim.mvp ? B.sim.mvp() : B.mv, mv = Array.isArray(mvs) && Array.isArray(mvs[B.me]) && UNITS[mvs[B.me][0]] ? mvs[B.me] : null;
  const mvCard = mv ? myDeck().map(d => CARDS[d.id]).find(q => q && q.U && q.U.key === mv[0]) || CARD_IDS.map(id => CARDS[id]).find(q => q.U && q.U.key === mv[0]) : null;
  // the result: who took how many towers and what each was worth, what BDB has to say about it, everything won laid out in one even row, and how the coins add up
  const theirN = crowns[1 - B.team] | 0, crownRow = n => Array.from({length:3}, (_, i) => `<span class="${i < n ? 'on' : ''}${i === n - 1 ? ' now' : ''}" style="--i:${i}"><i></i>${win ? `<b>x${CROWN_PAY[i + 1]}</b>` : ''}</span>`).join('');
  const rw = [`<div class="rw"><div class="rw-pic"><span class="coin${coins >= 300 ? ' pile' : ''}"></span></div><b>+${fmt(coins)}</b><small>Coins</small></div>`]
    .concat(got.map((g, i) => `<div class="rw cardz" data-i="${i}"><div class="rw-pic"></div><b>${esc(CARDS[g.id].name)}</b><small>${esc(g.tag === 'New' ? 'New card' : g.tag)}</small></div>`))
    .concat(pack ? [`<div class="rw"><div class="rw-pic"><div class="foil" style="--pc:${pack.col}"><img alt="" src="${chestPic(pack)}"></div></div><b>${esc(pack.name)}</b><small>${pack.n} cards inside</small></div>`] : [])
    .concat(tokens ? [`<div class="rw"><div class="rw-pic"><span class="tokbig"></span></div><b>+${tokens}</b><small>Upgrade ${tokens > 1 ? 'tokens' : 'token'}</small></div>`] : []);
  const b = dlg(`<div class="res ${win ? 'win' : draw ? 'draw' : 'loss'}">
    <div class="res-top"><div class="res-crowns${win ? ' paid' : ''}" aria-hidden="true">${crownRow(mine)}</div><h3>${title}</h3>
      <div class="res-score"><span>${esc(P.name)}<b>${mine}</b></span><em>towers</em><span><b>${theirN}</b>${esc(B.oppName || 'BDB')}</span></div></div>
    <div class="res-say"><span class="av"></span><p>${esc(line)}</p></div>
    ${mv ? `<div class="res-mvp">${mvCard ? `<img alt="" src="${artOf(mvCard)}">` : ''}<p><b>${esc(UNITS[mv[0]].name)}</b> did the most damage for you: ${fmt(mv[1])}.</p></div>` : ''}
    <div class="res-loot">${rw.join('')}</div>
    <dl class="res-sum">${pay.rows.map(r => `<div><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join('')}<div class="tot"><dt>Coins</dt><dd>+${fmt(coins)}</dd></div></dl>
    ${lines.length || tokens ? `<p class="note">${lines.map(esc).join(' ')}${tokens ? ' Spend tokens on tower and Mana upgrades in your Profile.' : ''}</p>` : ''}
    ${!wasCpu && OL && OL.host && B.coop ? `<div class="res-team" id="rsTeam"><span>Next match</span><div class="k-seg">${TEAM_SK.map(([k, nm]) => `<button type="button" data-sk="${k}" aria-pressed="${k === OL.skill}">${esc(nm)}</button>`).join('')}</div><div class="k-seg">${[2, 3].map(k => `<button type="button" data-co="${k}" aria-pressed="${k === OL.coop}">2 v ${k}${k === 3 ? ', x2' : ''}</button>`).join('')}</div></div>` : ''}
    <p class="note" id="rsNote2" hidden></p>
    <div class="res-btns">${pack ? `<button type="button" class="k-btn primary big" id="rsPack">Open the ${esc(pack.name)}</button>` : wasCpu ? `<button type="button" class="k-btn primary big" id="rsAgain">${c.rand ? 'Another one' : nextUp ? 'Next level' : 'Rematch'}</button>` : `<button type="button" class="k-btn primary big" id="rsAgain2">Play again</button>`}<button type="button" class="k-btn" id="rsBack">Back to menu</button></div></div>`, {lock:true});
  for (const el of b.querySelectorAll('.rw.cardz')){ const g = got[+el.dataset.i], cd = cardEl(g.id, {lvl:g.lvl, now:true}); cd.onclick = () => sheet(g.id); el.querySelector('.rw-pic').appendChild(cd); }
  const leave = () => { if (!wasCpu){ if (room && OL && OL.opp) room.send('bye', {}, OL.opp); endOnline(); } dlgClose(); stopBattle(); show('scrHub'); hub(); };
  const a2 = b.querySelector('#rsAgain2'), tm = b.querySelector('#rsTeam');
  if (a2){ a2.onclick = playAgain; againUI(); }
  if (tm) tm.onclick = e => { const q = e.target.closest('button'); if (!q || !OL || q.disabled) return; if (q.dataset.sk) OL.skill = q.dataset.sk; else if (q.dataset.co) OL.coop = +q.dataset.co; for (const o of q.parentNode.children) o.setAttribute('aria-pressed', o === q); BDB.sfx.tick(); };
  const again = () => { leave(); preCpu(c.rand ? randomCpu(c.skill, myTower()) : ladderCpu(nextUp ? c.level + 1 : c.level), odds); };      // the same odds as last time, until you change them
  b.querySelector('#rsBack').onclick = leave;
  const ra = b.querySelector('#rsAgain'), rp = b.querySelector('#rsPack');
  if (ra) ra.onclick = again;
  if (rp) rp.onclick = () => { stopBattle(); show('scrHub'); hub(); packReveal(pack, packGot, () => { dlgClose(); hub(); }); };
}
function stopBattle(){ A.music('menu'); coachOff(); setTimeout(() => league(true), 3500); cancelAnimationFrame(raf); clearInterval(pzIv); if (ticker){ ticker.terminate(); ticker = null; } B = null; aim = null; floorAim = false; $('wait').hidden = true; clearBubbles(); for (const e of document.querySelectorAll('.emote,.stamp,.legend-banner,.bnote')) e.remove(); }

/* ---------- online ---------- */
let net = null, lobby = null, room = null, OL = null;
async function netUp(){ if (!net) net = await openTransport(Q.get('net') === 'local'); return net; }
function endOnline(){ const r = room, l = lobby; room = lobby = null; if (OL){ clearInterval(OL.iv); clearInterval(OL.hiIv); clearTimeout(OL.pt); clearTimeout(OL.to); } OL = null; setTimeout(() => { try { r && r.leave(); } catch(e){} try { l && l.leave(); } catch(e){} }, 400); }
function waitBox(title, text, extra = ''){ const b = dlg(`<div class="k-eyebrow">Online</div><h3>${esc(title)}</h3><p id="olText">${esc(text)}</p>${extra}<div class="k-row"><button type="button" class="k-btn" id="olX">Cancel</button></div>`, {lock:true}); b.querySelector('#olX').onclick = () => { endOnline(); dlgClose(); }; return b; }
const netFail = () => { endOnline(); msgBox('No connection', 'Could not reach the matchmaking relays. Check your internet and try again.'); };
/* Players connect straight to each other. Two networks that both refuse that (mobile data, some office and school Wi-Fi) find each other and then cannot link up:
   the transport says so, and the player is told, instead of being left to think nobody answered. */
const NET_TRYING = 'Found them, but a direct connection between your two networks is not getting through. Still trying.';
const NET_CANT = 'A direct connection between your two networks did not get through. Mobile data and some office or school Wi-Fi block it. If one of you can switch to home Wi-Fi, try again.';
$('olQuick').onclick = async () => {
  if (noDeck()) return;
  waitBox('Looking for a player', 'Waiting for someone else to hit Quick match. Send a friend the link to this page to speed it up.');
  try { await netUp(); } catch(e){ return netFail(); }
  if ($('dlg').hidden) return;
  lobby = net.join('brawl2-lobby', () => { const t = $('olText'); if (OL && OL.state === 'look' && t) t.textContent = 'Someone else is looking too, but a direct connection between your two networks is not getting through. Still looking for a player.'; }); OL = {state:'look', pending:null};
  const hello = to => lobby && lobby.send('look', {n:P.name}, to);
  lobby.onJoin(id => hello(id)); OL.iv = setInterval(() => hello(), 2500); hello();
  lobby.onMessage((t, d, from) => {
    if (!OL || OL.state !== 'look' || !d) return;
    if (t === 'look' && !OL.pending && net.selfId < from){ OL.pending = from; OL.code = rid(8); lobby.send('pair', {c:OL.code}, from); OL.pt = setTimeout(() => { if (OL) OL.pending = null; }, 5000); }
    else if (t === 'pair' && !OL.pending && okCode(d.c)){ lobby.send('ok', {c:d.c}, from); enterMatch(d.c, false); }
    else if (t === 'ok' && OL.pending === from && d.c === OL.code) enterMatch(OL.code, true);
  });
};
/* Teaming up: how good the BDBs are (the host's place on the ladder, or one of the quick-battle levels) and how many of them there are. */
const TEAM_SK = [['ladder', 'Ladder'], ...SKILLS.map(k => [k.id, k.name])];
const teamBase = sk => { const k = SKILLS.find(q => q.id === sk); return k ? k.coins : Math.max(120, levelPrize(Math.max(1, P.ladder)).coins); };
const teamSkName = sk => { const k = SKILLS.find(q => q.id === sk); return k ? k.name : 'Ladder'; };
function teamOpts(sk = 'ladder'){
  return `<div class="tm"><span class="k-label">Team up against BDBs</span>
    <div class="k-seg tm-sk" role="group" aria-label="How good the BDBs are">${TEAM_SK.map(([k, n]) => `<button type="button" data-sk="${k}" aria-pressed="${k === sk}">${esc(n)}</button>`).join('')}</div>
    <p class="note tm-note"></p>
    <div class="k-row"><button type="button" class="k-btn primary" data-co="2">2 v 2</button><button type="button" class="k-btn primary" data-co="3">2 v 3, coins x2</button></div></div>`;
}
/* wires a block made by teamOpts: go(n, skill) is called with the number of BDBs and the level picked */
function teamBind(root, go){
  const seg = root.querySelector('.tm-sk'), note = root.querySelector('.tm-note'), cur = () => seg.querySelector('[aria-pressed="true"]').dataset.sk;
  const say = () => { const sk = cur(), k = SKILLS.find(q => q.id === sk); note.textContent = k ? `${k.name}: decks dealt at random, a win pays ${fmt(k.coins)} coins before towers.` : `BDBs from your place on the ladder, a win pays ${fmt(teamBase('ladder'))} coins before towers.`; };
  seg.onclick = e => { const q = e.target.closest('button[data-sk]'); if (!q) return; for (const o of seg.children) o.setAttribute('aria-pressed', o === q); BDB.sfx.tick(); say(); };
  for (const q of root.querySelectorAll('button[data-co]')) q.onclick = () => go(+q.dataset.co, cur());
  say(); return cur;
}
/* the BDBs a pair is up against. Ladder: from the host's place on it, scouting the two decks the way a ladder BDB does (cards and towers within two levels of the pair's).
   A quick-battle level: decks dealt at random, cards that many levels above or below the pair's. */
function teamCpus(n, sk, team){
  if (SKILLS.some(q => q.id === sk)){ const lead = randomCpu(sk, team); return [lead, ...backupCpus(lead, n, team)]; }
  const lead = ladderCpu(Math.max(1, P.ladder));
  return [lead, ...backupCpus(lead, n)].map(c => ({...c, lvl:Math.min(MAX_LVL, Math.max(lead.lvl, team - CPU_GAP)), tower:Math.max(lead.tower, team - CPU_GAP), soft:team > lead.lvl + 1 ? 1 : lead.soft}));
}
$('olFriend').onclick = () => {
  if (noDeck()) return;
  const b = dlg(`<div class="k-eyebrow">Online</div><h3>Play a friend</h3><p>Start a match and send your friend the code, or type in the code they sent you.</p>
    <div class="k-row"><button type="button" class="k-btn primary" id="frNew">Start a 1 v 1</button></div>
    ${teamOpts()}
    <span class="k-label">Or join theirs</span>
    <div class="rowx" style="width:100%;margin-top:0"><input class="field" id="frCode" maxlength="12" placeholder="Friend's code" autocomplete="off" autocapitalize="off" spellcheck="false"><button type="button" class="k-btn" id="frJoin">Join</button></div><div class="err" id="frErr"></div>
    <div class="k-row"><button type="button" class="k-btn" id="frX">Close</button></div>`);
  b.querySelector('#frX').onclick = dlgClose;
  const startFr = async (coop, sk) => {
    const code = rid(5), url = location.origin + location.pathname + '?join=' + code;
    const w = waitBox('Waiting for your friend', 'Send them this code, or the link.', `<div class="codebox">${code.toUpperCase()}</div><div class="k-row"><button type="button" class="k-btn" id="frCopy">Copy link</button></div>`);
    w.querySelector('#frCopy').onclick = async () => { try { await navigator.clipboard.writeText(url); w.querySelector('#frCopy').textContent = 'Copied'; } catch(e){ prompt('Copy this link', url); } };
    try { await netUp(); } catch(e){ return netFail(); }
    if (!$('dlg').hidden) enterMatch(code, true, true, coop, sk);
  };
  b.querySelector('#frNew').onclick = () => startFr(0); teamBind(b, (n, sk) => startFr(n, sk));
  b.querySelector('#frJoin').onclick = () => { const c = b.querySelector('#frCode').value.trim().toLowerCase(); if (!okCode(c)){ b.querySelector('#frErr').textContent = 'That code does not look right.'; return; } joinFriend(c); };
};
async function joinFriend(code){
  if (noDeck()) return;
  waitBox('Joining the match', 'Connecting to your friend.');
  try { await netUp(); } catch(e){ return netFail(); }
  if ($('dlg').hidden) return;
  enterMatch(code, false, true);
  OL.to = setTimeout(() => { if (OL && !OL.opp){ const bl = OL.blocked; endOnline(); if (bl) msgBox('Could not connect', NET_CANT); else msgBox('Nobody there', 'No match was found with that code. Ask your friend to start a new one.'); } }, 30000);
}
function okDeck(d){ return Array.isArray(d) && d.every(c => c && typeof c.id === 'string') && !deckProblem(d.map(c => c.id), false) && d.every(c => Number.isInteger(c.lvl) && c.lvl >= 1 && c.lvl <= MAX_LVL); }
function enterMatch(code, host, keepBox, coop, skill){
  if (lobby){ clearInterval(OL && OL.iv); const l = lobby; lobby = null; setTimeout(() => { try { l.leave(); } catch(e){} }, 300); }
  if (OL) clearTimeout(OL.pt);
  // coop: how many BDBs the two of you are up against, 0 for a duel. skill: how good they are. od, tw, mate: the other player's deck, tower level and name, kept for a rematch
  OL = {state:'wait', code, host, opp:null, coop:coop === true ? 2 : [2, 3].includes(coop) ? coop : 0, skill:skill || 'ladder', od:null, tw:1, mate:'', again:{me:false, them:false}};
  room = net.join('brawl2-m-' + code, () => { if (OL && !OL.opp){ OL.blocked = true; const t = $('olText'); if (t) t.textContent = NET_TRYING; } });
  if (!keepBox){ const t = $('olText'); if (t) t.textContent = 'Found someone. Setting up the match.'; }
  const hi = to => room && room.send('hi', {n:P.name, d:myDeck(), tw:myTower(), b:curBoosts()}, to);
  room.onJoin(id => hi(id)); hi(); OL.hiIv = setInterval(() => { if (OL && !OL.opp) hi(); }, 1500);
  room.onLeave(id => { if (OL && id === OL.opp){ OL.gone = true; oppLeft(); } });      // gone for good, as opposed to quitting a match and staying for the result
  room.onMessage((t, d, from) => {
    if (!OL || !d || typeof d !== 'object') return;
    if (t === 'hi'){
      if (!OL.host || OL.opp || !okDeck(d.d)) return;
      OL.opp = from; clearInterval(OL.hiIv);
      OL.mate = clean(d.n, 20) || 'Player'; OL.od = d.d.map(c => ({id:c.id, lvl:c.lvl})); OL.tw = Number.isInteger(d.tw) ? Math.max(1, Math.min(MAX_LVL, d.tw)) : 1; OL.ob = Array.isArray(d.b) ? [...new Set(d.b)].filter(id => typeof id === 'string' && Object.hasOwn(BOOSTS, id)).slice(0, BOOST_DECK) : [];
      dlgClose(); hostStart();
    } else if (t === 'go'){
      const again = OL.opp === from && B && B.done;                           // the host started another one from the result screen
      if (OL.host || (OL.opp && !again) || !MAPS[d.map]) return;
      OL.opp = from; clearInterval(OL.hiIv); clearTimeout(OL.to); dlgClose(); if (again) stopBattle();
      const uk = Array.isArray(d.uk) ? d.uk.filter(k => typeof k === 'string' && Object.hasOwn(UNITS, k)).slice(0, 260) : [];
      const co = d.co === 3 ? 3 : d.co ? 2 : 0; OL.coop = co; OL.skill = TEAM_SK.some(q => q[0] === d.sk) ? d.sk : 'ladder'; OL.mate = clean(d.n, 20) || 'Player'; OL.again = {me:false, them:false};
      begin({mode:'guest', map:d.map, coop:co, skill:OL.skill, base:clamp(d.pb | 0, 30, 5000), mate:OL.mate, oppName:co ? NUM[co] + ' BDBs' : OL.mate, units:[...new Set([...uk, ...unitsOf(curDeck())])]});
    } else if (from !== OL.opp || !B) return;
    else if (t === 'ag'){ if (!B.done) return; OL.again.them = !!d.on; if (OL.host && d.on && OL.again.me) hostStart(); else againUI(); }      // they want another one
    else if (t === 'rd'){ if (B.mode === 'host' && B.rdRes) B.rdRes(); }
    else if (t === 's' && B.mode === 'guest') snap(d);
    else if (t === 'p' && B.mode === 'host'){ const s = d.slot, h = B.sim.players[1].hand; if (B.run && B.sim && Number.isInteger(s) && s >= 0 && s < HAND && h[s] && h[s].id === d.id && Number.isFinite(d.x) && Number.isFinite(d.z)) B.sim.play(1, s, d.x, d.z); }
    else if (t === 'b' && B.mode === 'host'){ const h = B.sim && B.sim.players[1].bh; if (B.run && h && Number.isInteger(d.slot) && h[d.slot] === d.id && Number.isFinite(d.x) && Number.isFinite(d.z)) B.sim.boost(1, d.slot, d.x, d.z); }
    else if (t === 'o' && B.mode === 'host'){ if (B.run && B.sim && Number.isInteger(d.u) && Number.isInteger(d.t) && d.u > 0 && d.t >= 0) B.sim.order(1, d.u, d.t); }
    else if (t === 'em') showEmote(d.i, false);
    else if (t === 'pq' && B.mode === 'host'){ if (['pause', 'resume', 'ext', 'yes', 'no'].includes(d.a)) pzDo(d.a, 1); }
    else if (t === 'pz' && B.mode === 'guest'){ B.pz = d.on ? {by:d.by === 1 ? 1 : 0, left:Math.max(0, Math.min(3600, +d.left || 0)), ask:[0, 1, 2].includes(d.ask) ? d.ask : 0} : null; if (!B.pz) $('wait').hidden = true; pzUI(); }
    else if (t === 'bye') oppLeft();
  });
}
/* the host sets a match up and tells the other player: the first one, and every one after it from the result screen */
function hostStart(){
  if (!OL || !OL.host || !OL.opp || !OL.od || !room) return;
  if (B){ dlgClose(); stopBattle(); }
  OL.again = {me:false, them:false};
  const map = pick(MAP_IDS), team = Math.round((myTower() + OL.tw) / 2), cpus = OL.coop ? teamCpus(OL.coop, OL.skill, team) : null, base = OL.coop ? teamBase(OL.skill) : 150;
  const units = unitsOf([...curDeck(), ...OL.od.map(c => c.id), ...(cpus ? cpus.flatMap(c => c.deck) : [])]);
  room.send('go', {map, n:P.name, co:OL.coop, sk:OL.skill, pb:base, uk:units}, OL.opp);
  begin({mode:'host', map, coop:OL.coop, skill:OL.skill, base, cpus, teamTower:team, mate:OL.mate, oppName:OL.coop ? NUM[OL.coop] + ' BDBs' : OL.mate, oppDeck:OL.od, oppBoosts:OL.ob || [], oppTower:OL.tw, units});
}
/* the result screen of an online match: who wants another one */
function againUI(){
  const b = $('rsAgain2'), n = $('rsNote2'); if (!b || !n || !B) return;
  const gone = !OL || !OL.opp || OL.gone, who = (B.mate || B.oppName || 'They');
  b.disabled = gone || OL.again.me; b.textContent = gone ? 'Play again' : OL.again.me ? `Waiting for ${who}` : OL.again.them ? `Play again: ${who} is in` : 'Play again';
  n.textContent = gone ? `${who} has left.` : OL.again.them && !OL.again.me ? `${who} wants another one.` : ''; n.hidden = !n.textContent;
  for (const q of document.querySelectorAll('#rsTeam button')) q.disabled = gone || OL.again.me;
}
function playAgain(){
  if (!OL || !OL.opp || OL.gone || !room || !B || !B.done) return;
  OL.again.me = true; room.send('ag', {on:1}, OL.opp);
  if (OL.host && OL.again.them) hostStart(); else againUI();
}
function snap(d){
  const s = d.s; if (!s || !Array.isArray(s.e) || !Array.isArray(s.h) || !B || B.done || typeof s.n !== 'string') return;
  const ok = id => CARDS[id] ? id : CARD_IDS[0];
  B.ents = decodeEnts(s.e, B.prev); B.prev = new Map(B.ents.map(e => [e.id, e])); B.traps = decodeTraps(s.tr);
  B.info = {el:+s.el || 0, hand:s.h.slice(0, HAND).map((id, i) => ({id:ok(id), lvl:(s.hl && s.hl[i]) || 1})), next:{id:ok(s.n)}, left:+s.l || 0, phase:s.ph === 'ot' ? 'ot' : s.ph === 'over' ? 'over' : 'play', crowns:Array.isArray(s.cr) ? s.cr : [0, 0], pocket:Array.isArray(s.pk) ? s.pk : [false, false], bonus:!!s.bo,
    bh:Array.isArray(s.bh) ? s.bh.filter(id => typeof id === 'string' && Object.hasOwn(BOOSTS, id)).slice(0, BOOST_HAND) : [], bn:clamp(+s.bn || 0, 0, 999), bq:clamp(s.bq | 0, 0, 99)};
  if (Array.isArray(d.ev) && d.ev.length){ if (V) V.events(d.ev); onEvents(d.ev); }
}
const STANDIN = {react:1.3, hold:6.5, derp:.04, smart:.75, el:1};      // who plays a teammate's cards once they have gone
function oppLeft(){
  if (B && B.done){ endOnline(); againUI(); return; }      // they left from the result screen: no rematch to be had
  if (!B) return;
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

/* the running score against each real person you have fought one against one: [won, lost, drawn] under their name. It keeps the sixty you have played most. */
function vsAdd(name, i){
  const k = clean(name, 20); if (!k) return '';
  if (!P.vs) P.vs = {};
  (P.vs[k] || (P.vs[k] = [0, 0, 0]))[i]++;
  const all = Object.keys(P.vs); if (all.length > 60){ const few = all.filter(n => n !== k).sort((a, b) => P.vs[a].reduce((x, y) => x + y) - P.vs[b].reduce((x, y) => x + y))[0]; delete P.vs[few]; }
  return k;
}
function vsLine(name){
  const v = P.vs && P.vs[clean(name, 20)]; if (!v || !(v[0] + v[1] + v[2])) return '';
  return v[0] > v[1] ? `you lead ${fmt(v[0])} to ${fmt(v[1])}` : v[1] > v[0] ? `you trail ${fmt(v[0])} to ${fmt(v[1])}` : v[0] ? `level at ${fmt(v[0])} each` : 'no winner yet';
}

/* ---------- who's on: everyone signed in shows up, and everyone you see becomes a friend ---------- */
let hallT = 0, hallGen = 0, hallHTML = '', hallWas = null, toastT = 0, HALL = {online:[], invites:[]}; const seenInv = new Set();
/* a line at the bottom of the menus for a few seconds. Tapping it goes where it points. */
function hubToast(text, go){
  const t = $('hubToast'); if (B || TR || $('scrHub').hidden || !$('dlg').hidden) return;
  t.textContent = text; t.hidden = false; t.onclick = () => { t.hidden = true; if (go) go(); };
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 5500); fx('pop');
}
function hallStart(){
  clearTimeout(hallT); const gen = ++hallGen; renderHall();
  if (!Cloud.session()) return;
  const tick = async () => {
    if (!P || !Cloud.session()) return;
    try {
      const r = await Cloud.ping(B ? 'battle' : TR ? 'trading' : 'menu'); if (!r || r.error || !Array.isArray(r.online)) return;
      HALL = r; let fresh2 = false; for (const o of r.online){ const nm = clean(o.name, 20); if (nm && !P.friends[nm]) fresh2 = true; if (nm) P.friends[nm] = Date.now(); }
      if (fresh2) save();
      const now = new Set(r.online.map(o => clean(o.name, 20)).filter(Boolean)), came = hallWas ? [...now].filter(n => !hallWas.has(n)) : []; hallWas = now;      // who has come on since the last look (nobody, the first time)
      if (came.length) hubToast(came.length === 1 ? `${came[0]} is on` : came.length === 2 ? `${came[0]} and ${came[1]} are on` : `${came[0]} and ${came.length - 1} more are on`, () => { if (curTab !== 'Battle') tab('Battle'); $('hall').scrollIntoView({block:'center', behavior:'smooth'}); });
      renderHall();
      for (const iv of r.invites || []) if (iv && !seenInv.has(iv.id)){ seenInv.add(iv.id); gotInvite(iv); }
    } catch(e){}
  };
  // in the menus an invite should land within a few seconds; in a match the ping only has to say "still here"
  const loop = async () => { await tick(); if (gen === hallGen) hallT = setTimeout(loop, (+Q.get('ping') || (B ? 12 : 5)) * 1000); };
  loop();
  league();
}
/* the league table: asked for when the hub opens and every few minutes after. A server that was set up before it existed has no such function:
   then the panel stays away (and the owner is told what to do about it) */
let LEAGUE = null, leagueAt = 0, leagueOff = false;
async function league(force){
  const box = $('leaguePanel'); if (!box) return;
  if (!P || !Cloud.session() || leagueOff){ box.hidden = !(leagueOff && OWN && Cloud.session()); if (!box.hidden) $('league').innerHTML = '<p class="note" style="margin:0">The league table needs one more function on the account server. Run brawl/supabase.sql in the Supabase SQL editor again (it is safe to run twice) and it will appear here.</p>'; return; }
  if (!force && LEAGUE && Date.now() - leagueAt < 150000) return leagueUI();
  try { const r = await Cloud.top(); if (r && Array.isArray(r.top)){ LEAGUE = r.top; leagueAt = Date.now(); } }
  catch(e){ if (e && e.kind === 'setup'){ leagueOff = true; return league(); } }
  leagueUI();
}
function leagueUI(){
  const box = $('leaguePanel'); if (!box) return;
  const rows = (LEAGUE || []).map(o => ({name:clean(o.name, 20), ladder:clamp(o.ladder | 0, 0, LEVELS), tr:Math.max(0, o.trophies | 0), wins:Math.max(0, o.wins | 0), on:!!o.on})).filter(o => o.name);
  box.hidden = rows.length < 2;                         // a table of one is not a table
  if (box.hidden) return;
  const me = P.name.toLowerCase(), at = rows.findIndex(o => o.name.toLowerCase() === me), show = rows.slice(0, 10); if (at >= 10) show.push(rows[at]);
  $('league').innerHTML = show.map(o => { const i = rows.indexOf(o), T = tierOf(Math.min(LEVELS, o.ladder + 1)), mine = i === at;
    return `<div class="lg${mine ? ' me' : ''}"><span class="rk">${i + 1}</span><img alt="" src="${tierPic(T)}"><b><span>${esc(o.name)}</span>${o.on && !mine ? '<i title="On now"></i>' : ''}</b><small><em>Level ${fmt(o.ladder)}</em>${fmt(o.tr)} trophies, ${fmt(o.wins)} wins</small></div>`; }).join('');
}
const ago = t => { const m = Math.max(1, Math.round((Date.now() - t) / 60000)); return m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
function renderHall(){
  const box = $('hall'); if (!box || !P) return;
  if (!Cloud.session()){ $('hallLbl').textContent = "Who's on"; hallHTML = ''; box.innerHTML = `<p class="note" style="margin:0">${Cloud.on ? 'With an account you can see who is online, challenge them and trade cards. Everyone you play alongside is added as a friend automatically.' : 'Accounts are not set up on this copy of the game.'}</p>${Cloud.on ? '<div class="k-row" style="justify-content:flex-start;margin-top:10px"><button type="button" class="k-btn primary" id="hallAcc">Create an account</button></div>' : ''}`; const q = $('hallAcc'); if (q) q.onclick = () => $('accMake').click(); return; }
  const on = (HALL.online || []).map(o => ({name:clean(o.name, 20), status:o.status, tr:o.trophies | 0})).filter(o => o.name), names = new Set(on.map(o => o.name));
  const off = Object.keys(P.friends).filter(n => !names.has(n) && n.toLowerCase() !== P.name.toLowerCase()).sort((a, b) => P.friends[b] - P.friends[a]).slice(0, 12);
  $('hallLbl').textContent = `Who's on: ${on.length}`;
  const html = (on.length ? '' : '<p class="note" style="margin:0 0 10px">Nobody else is on right now. They show up here the moment they sign in.</p>') +
    on.map(o => `<div class="pl on"><i></i><div><b>${esc(o.name)}</b><small>${o.status === 'battle' ? 'In a match' : o.status === 'trading' ? 'Trading' : 'In the menus'}, ${fmt(o.tr)} trophies${vsLine(o.name) ? ', ' + vsLine(o.name) : ''}</small></div><div class="acts" data-n="${esc(o.name)}">${o.status === 'menu' ? '<button type="button" class="k-btn primary" data-k="duel">Fight</button><button type="button" class="k-btn" data-k="coop">Team up</button><button type="button" class="k-btn" data-k="trade">Trade</button>' : ''}</div></div>`).join('') +
    off.map(n => `<div class="pl"><i></i><div><b>${esc(n)}</b><small>Friend, seen ${ago(P.friends[n])}${vsLine(n) ? ', ' + vsLine(n) : ''}</small></div><div></div></div>`).join('');
  if (html !== hallHTML) box.innerHTML = hallHTML = html;      // only when something changed: a list rebuilt under a finger loses the tap
}
$('hall').onclick = e => {
  const q = e.target.closest('button[data-k]'); if (!q || B) return; const to = q.parentNode.dataset.n;
  if (q.dataset.k !== 'coop') return sendInvite(to, q.dataset.k);
  if (noDeck()) return;
  const b = dlg(`<div class="k-eyebrow">Team up</div><h3>You and ${esc(to)}</h3><p>You share a side. Three BDBs is a handicap match: it pays double.</p>${teamOpts()}<div class="k-row"><button type="button" class="k-btn" id="tuX">Cancel</button></div>`);
  b.querySelector('#tuX').onclick = dlgClose;
  teamBind(b, (n, sk) => { dlgClose(); sendInvite(to, 'coop', n, sk); });
};
async function sendInvite(to, kind, n = 2, sk = 'ladder'){
  if (kind !== 'trade' && noDeck()) return;
  const code = rid(6);
  if (kind === 'trade') openTrade(code, to);
  else { waitBox(`Waiting for ${to}`, kind === 'coop' ? `Asking them to team up against ${NUM[n].toLowerCase()} BDBs. They have a minute to answer.` : 'Asking them for a 1v1. They have a minute to answer.'); try { await netUp(); } catch(e){ return netFail(); } if ($('dlg').hidden) return; enterMatch(code, true, true, kind === 'coop' ? n : 0, sk); OL.to = setTimeout(() => { if (OL && !OL.opp){ const bl = OL.blocked; endOnline(); if (bl) msgBox('Could not connect', NET_CANT); else msgBox('No answer', `${to} did not pick up. Try again in a bit.`); } }, 70000); }
  try { const r = await Cloud.invite(to, kind, code); if (!r || r.error) throw new Error(r && r.error ? String(r.error) : 'no answer'); }
  catch(e){ if (kind === 'trade') closeTrade(); else { endOnline(); dlgClose(); } msgBox('Could not send', `The invite did not go through (${e && e.kind ? cloudWhy(e) : String(e && e.message || e).slice(0, 80)}). Try again.`); }
}
/* An invite that arrives while you are reading something else waits its turn (for most of the minute the other side waits). In a match or a trade it lapses. */
let heldInv = null;
function gotInvite(iv){
  const what = {duel:'wants a 1v1', coop:'wants to team up against BDBs', trade:'wants to trade cards'}[iv.kind], from = clean(iv.from, 20);
  if (!what || !okCode(iv.code) || !from) return;
  if (B || TR){ Cloud.inviteDone(iv.id); return; }
  fx('invite');
  if (!$('dlg').hidden || $('scrHub').hidden){ heldInv = {iv, at:Date.now()}; return; }
  const rec = vsLine(from);
  const b = dlg(`<div class="k-eyebrow">Invite</div><h3>${esc(from)}</h3><p>${what}.${iv.kind === 'duel' && rec ? ` So far ${rec}.` : ''}</p><div class="k-row"><button type="button" class="k-btn primary" id="ivY">Accept</button><button type="button" class="k-btn" id="ivN">Not now</button></div>`, {lock:true});
  BDB.sfx.big();
  const row = b.querySelector('.k-row'); row.style.pointerEvents = 'none'; setTimeout(() => { row.style.pointerEvents = ''; }, 500);      // it appears unasked: a tap already on its way to something else must not answer it
  b.querySelector('#ivY').onclick = () => { Cloud.inviteDone(iv.id); dlgClose(); if (iv.kind === 'trade') openTrade(iv.code, from); else joinFriend(iv.code); };
  b.querySelector('#ivN').onclick = () => { Cloud.inviteDone(iv.id); dlgClose(); };
}
setInterval(() => {
  if (!heldInv) return; const h = heldInv;
  if (B || TR || Date.now() - h.at > 50000){ heldInv = null; Cloud.inviteDone(h.iv.id); }
  else if (P && $('dlg').hidden && !$('scrHub').hidden){ heldInv = null; gotInvite(h.iv); }
}, 1000);

/* ---------- trading: each side offers cards and coins, both lock, both confirm ---------- */
let TR = null;
const TRADE_MAX = 5, COIN_CAP = 1e6, POOL_PAGE = 150;
const coinCap = () => Math.min(COIN_CAP, P.coins);
async function openTrade(code, name){
  TR = {code, name, opp:null, mine:{cards:[], coins:0, lock:false}, theirs:{cards:[], coins:0, lock:false}, okMine:false, okTheirs:false, done:false, find:'', max:0, note:''};
  drawTrade();
  try { await netUp(); } catch(e){ TR = null; return netFail(); }
  if (!TR) return;
  const room = TR.room = net.join('brawl2-t-' + code, () => { if (TR && !TR.opp){ TR.blocked = true; drawTrade(); } }), hello = to => TR && room.send('th', {n:P.name}, to);
  room.onJoin(id => hello(id)); hello(); TR.iv = setInterval(() => { if (TR && !TR.opp) hello(); }, 1500);
  TR.to = setTimeout(() => { if (TR && !TR.opp) closeTrade(TR.blocked ? NET_CANT : `${name} did not pick up.`); }, 70000);
  room.onLeave(id => { if (TR && id === TR.opp && !TR.done) closeTrade(`${TR.name} left the trade.`); });
  room.onMessage((t, d, from) => {
    if (!TR || !d || typeof d !== 'object') return;
    if (t === 'th'){ if (!TR.opp){ TR.opp = from; TR.name = clean(d.n, 20) || TR.name; clearInterval(TR.iv); clearTimeout(TR.to); hello(from); sendOffer(); drawTrade(); } return; }
    if (from !== TR.opp || TR.done) return;
    if (t === 'to'){
      const cs = Array.isArray(d.cards) ? d.cards.filter(c => c && CARDS[c.id] && Number.isInteger(c.lvl) && c.lvl >= 1 && c.lvl <= MAX_LVL).slice(0, TRADE_MAX).map(c => ({id:c.id, lvl:c.lvl})) : [], coins = Math.max(0, Math.min(COIN_CAP, d.coins | 0));
      if (JSON.stringify(cs) !== JSON.stringify(TR.theirs.cards) || coins !== TR.theirs.coins){      // their offer changed: nothing is agreed any more
        const was = TR.mine.lock; TR.okMine = TR.okTheirs = false;
        if (was){ TR.mine.lock = false; sendOffer(); }
        TR.theirs = {cards:cs, coins, lock:!!d.lock};
        if (was) return tradeNote(`${TR.name} changed their offer, so yours is unlocked again. Look it over and lock.`);
      }
      TR.theirs = {cards:cs, coins, lock:!!d.lock}; if (!TR.theirs.lock) TR.okMine = TR.okTheirs = false;      // they unlocked: a confirm either way is off
      drawTrade();
    } else if (t === 'tc'){
      if (!TR.mine.lock || !TR.theirs.lock || TR.okTheirs) return;
      // a confirm only counts for the two offers as they stand on this side too. If they differ, both go back to unlocked rather than swap something nobody agreed to
      if (d.g !== undefined && (d.g !== offerSig(TR.theirs) || d.t !== offerSig(myOffer()))){ TR.mine.lock = false; TR.okMine = false; sendOffer(); return tradeNote('The two offers changed while you were confirming. Check them and lock again.'); }
      TR.okTheirs = true; finishTrade(); drawTrade();
    }
    else if (t === 'tx') closeTrade(`${TR.name} called it off.`);
  });
}
const offerSig = o => o.cards.map(c => c.id + ':' + c.lvl).join(',') + '|' + o.coins, myOffer = () => ({cards:TR.mine.cards.map(id => ({id, lvl:lvl(id)})), coins:TR.mine.coins});
function sendOffer(){ if (TR && TR.opp) TR.room.send('to', {...myOffer(), lock:TR.mine.lock}, TR.opp); }
function changed(){ TR.mine.lock = false; TR.okMine = TR.okTheirs = false; sendOffer(); drawTrade(); }
function closeTrade(msg){ const t = TR; TR = null; if (t){ clearInterval(t.iv); clearTimeout(t.to); clearTimeout(t.nt); if (t.room){ if (t.opp && !t.done) t.room.send('tx', {}, t.opp); setTimeout(() => { try { t.room.leave(); } catch(e){} }, t.done ? 3500 : 400); } } dlgClose(); if (msg) msgBox('Trade', msg); hub(); }
const sayOk = () => {
  const t = TR; if (!t || !t.opp) return;
  const d = {g:offerSig(myOffer()), t:offerSig(t.theirs)};      // what I give and what I get, as I see them
  const go = () => { try { if (t.done || (TR === t && t.okMine)) t.room.send('tc', d, t.opp); } catch(e){} }; go(); setTimeout(go, 500); setTimeout(go, 1500);      // said three times: a swap that only one side made is the worst outcome
};
function finishTrade(){
  if (!TR || TR.done || !TR.okMine || !TR.okTheirs) return;
  TR.done = true;
  for (const id of TR.mine.cards) delete P.cards[id];
  for (const c of TR.theirs.cards) P.cards[c.id] = Math.max(lvl(c.id), c.lvl);
  const short = []; P.decks = P.decks.map((d, i) => { const k = d.filter(id => P.cards[id]); if (k.length < d.length) short.push(i + 1); return k; });      // a card that was traded away leaves every deck it was in
  P.coins += TR.theirs.coins - TR.mine.coins; P.stats.tr = (P.stats.tr || 0) + 1; save(); BDB.sfx.big();
  const got = TR.theirs.cards.map(c => CARDS[c.id].name).concat(TR.theirs.coins ? [fmt(TR.theirs.coins) + ' coins'] : []).join(', ') || 'nothing';
  closeTrade(`Done. You got ${got} from ${TR.name}.${short.length ? ` Deck ${short.join(' and ')} lost a card in the trade: top ${short.length > 1 ? 'them' : 'it'} up on the Deck tab.` : ''}`);
}
/* a line under the two offers that says what just happened, for a few seconds */
function tradeNote(msg){ if (!TR) return; TR.note = msg; clearTimeout(TR.nt); const t = TR; TR.nt = setTimeout(() => { if (TR === t){ t.note = ''; drawTrade(); } }, 5000); drawTrade(); }
function tradePick(id){
  const me = TR.mine; if (!TR.opp || TR.okMine) return;
  if (me.lock){ BDB.sfx.bad(); return tradeNote('Your offer is locked. Unlock it to change it.'); }
  if (me.cards.includes(id)) me.cards = me.cards.filter(x => x !== id);
  else { if (me.cards.length >= TRADE_MAX){ BDB.sfx.bad(); return tradeNote('Five cards is the most one trade can carry.'); } if (!P.cards[id]) return; me.cards.push(id); }
  TR.note = ''; BDB.sfx.tick(); changed();
}
/* your cards to pick from: spare ones first, dearest first, and a search box because a collection runs to hundreds */
function tradePool(){
  const box = $('dlgBox'), pool = box.querySelector('#tPool'); if (!pool || !TR) return;
  const used = new Set(P.decks.flat()), q = (TR.find || '').trim().toLowerCase(), mine = Object.keys(P.cards).filter(id => CARDS[id]);
  const all = mine.filter(id => !q || CARDS[id].name.toLowerCase().includes(q) || TYPES[CARDS[id].type].name.toLowerCase().includes(q)).sort((a, c) => used.has(a) - used.has(c) || CARDS[c].price - CARDS[a].price || (a < c ? -1 : 1));
  const show = all.slice(0, TR.max || POOL_PAGE);
  pool.textContent = '';
  for (const id of show) pool.appendChild(cardEl(id, {lvl:lvl(id), cls:(used.has(id) ? 'inuse' : '') + (TR.mine.cards.includes(id) ? ' picked' : '')}));
  if (!all.length) pool.innerHTML = `<p class="note">${q ? 'None of your cards match that.' : 'You have no cards to offer.'}</p>`;
  else if (all.length > show.length){ const m = document.createElement('button'); m.type = 'button'; m.className = 'k-btn'; m.id = 'tMore'; m.textContent = `Show ${Math.min(POOL_PAGE, all.length - show.length)} more`; pool.appendChild(m); }
  box.querySelector('#tCount').textContent = q ? `${fmt(all.length)} of ${fmt(mine.length)}` : `${fmt(mine.length)} cards`;
}
/* The pop-up is built once and then kept up to date in place. Rebuilding it on every change threw away the scroll position and whatever was being typed,
   and swallowed any tap that was half way down when the other side's offer arrived. */
function buildTrade(){
  const b = dlg(`<div class="trd"><h3 id="tHead"></h3>
    <div class="trade"><div class="tside" id="tSideMine"><div class="thd"><span class="k-label">You give</span><em id="tLkMine" hidden>Locked</em><label class="tcoin"><span class="coin"></span><input class="field" id="tCoins" type="number" inputmode="numeric" min="0" placeholder="0" aria-label="Coins you give"></label></div><div class="tg" id="tMine"></div></div>
      <div class="tside" id="tSideTheirs"><div class="thd"><span class="k-label">You get</span><em id="tLkTheirs" hidden>Locked</em><span class="tcoin"><span class="coin"></span><b id="tTheirCoins">0</b></span></div><div class="tg" id="tTheirs"></div></div></div>
    <p class="note" id="tMsg" role="status"></p>
    <div class="tfind"><input class="field" id="tFind" type="search" placeholder="Search your cards" autocomplete="off" aria-label="Search your cards"><span class="note" id="tCount"></span></div>
    <div class="grid tpool" id="tPool"></div>
    <div class="k-row"><button type="button" class="k-btn primary" id="tLock">Lock offer</button><button type="button" class="k-btn primary" id="tOk">Confirm trade</button><button type="button" class="k-btn ghost" id="tX">Cancel</button></div></div>`, {lock:true});
  const q = id => b.querySelector('#' + id), me = TR.mine;
  const coins = () => { const v = Math.max(0, Math.min(coinCap(), Math.round(+q('tCoins').value || 0))); if (v === me.coins) return false; me.coins = v; return true; };
  q('tFind').value = TR.find; q('tFind').oninput = e => { TR.find = e.target.value; TR.max = 0; tradePool(); q('tPool').scrollTop = 0; };
  q('tPool').onclick = e => { if (e.target.closest('#tMore')){ TR.max = (TR.max || POOL_PAGE) + POOL_PAGE; return tradePool(); } const c = e.target.closest('.card'); if (c) tradePick(c.dataset.id); };
  q('tMine').onclick = e => { const c = e.target.closest('.card'); if (c) tradePick(c.dataset.id); };
  q('tCoins').onchange = () => { if (TR.opp && !me.lock && coins()) changed(); else drawTrade(); };
  q('tLock').onclick = () => { if (!TR.opp || TR.okMine) return; if (!me.lock) coins(); me.lock = !me.lock; TR.okMine = TR.okTheirs = false; TR.note = ''; BDB.sfx.tick(); sendOffer(); drawTrade(); };
  q('tOk').onclick = () => { if (!(me.lock && TR.theirs.lock) || TR.okMine) return; TR.okMine = true; TR.note = ''; sayOk(); finishTrade(); drawTrade(); };
  q('tX').onclick = () => closeTrade();
  tradePool();
}
function drawTrade(){
  if (!TR) return;
  const box = $('dlgBox'); if ($('dlg').hidden || !box.querySelector('.trd')) buildTrade();
  const q = id => box.querySelector('#' + id), linked = !!TR.opp, me = TR.mine, th = TR.theirs, both = me.lock && th.lock;
  q('tHead').textContent = `Trade with ${TR.name}`;
  const slots = (el, list, card) => { el.textContent = ''; for (let i = 0; i < TRADE_MAX; i++){ if (list[i]) el.appendChild(card(list[i])); else { const e = document.createElement('i'); e.className = 'tslot'; el.appendChild(e); } } };
  slots(q('tMine'), me.cards, id => cardEl(id, {lvl:lvl(id), now:true}));
  slots(q('tTheirs'), th.cards, c => cardEl(c.id, {div:true, lvl:c.lvl, now:true, cls:lvl(c.id) >= c.lvl ? 'have' : ''}));
  const ci = q('tCoins'); ci.disabled = !linked || me.lock; ci.max = coinCap(); if (document.activeElement !== ci) ci.value = me.coins || '';
  q('tTheirCoins').textContent = fmt(th.coins);
  q('tLkMine').hidden = !me.lock; q('tLkTheirs').hidden = !th.lock; q('tSideMine').classList.toggle('lk', me.lock); q('tSideTheirs').classList.toggle('lk', th.lock);
  q('tMsg').textContent = TR.note || (!linked ? (TR.blocked ? NET_TRYING : `Waiting for ${TR.name} to join. They have a minute to answer.`) : TR.okMine ? `Waiting for ${TR.name} to confirm.` : both && TR.okTheirs ? `${TR.name} has confirmed. Confirm to make the swap.` : both ? 'Both offers are locked. Confirm to make the swap.'
    : me.lock ? `Your offer is locked. Waiting for ${TR.name} to lock theirs.` : th.lock ? `${TR.name} has locked. Lock yours when you are happy with the deal.` : 'Tap up to five of your cards, add any coins, then lock your offer. Hold a card to read it.');
  const pool = q('tPool'); pool.classList.toggle('off', !linked || me.lock);
  for (const c of pool.querySelectorAll('.card')) c.classList.toggle('picked', me.cards.includes(c.dataset.id));
  const lk = q('tLock'); lk.textContent = me.lock ? 'Unlock' : 'Lock offer'; lk.classList.toggle('primary', !me.lock); lk.disabled = !linked || TR.okMine;
  q('tOk').disabled = !both || TR.okMine;
}

/* ---------- start ---------- */
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('sheet').hidden) $('sheet').hidden = true; });
$('lvPct').textContent = Math.round(LVL_STEP * 100); $('lvMax').textContent = MAX_LVL; $('dealPct').textContent = Math.round((1 - DEAL) * 100);      // the numbers in the Market's small print come from the rules, so they cannot drift from them
listUI('own', () => Object.keys(P.cards), 'Your cards');
$('sellRates').innerHTML = RAR_IDS.map(r => `<span class="r-${r}">${RAR[r].name} ${SELL[r] ? COIN + fmt(SELL[r]) : Math.round(SELL_GOD * 100) + '% of its price'}</span>`).join('');
listUI('shop', () => CARD_IDS, 'All cards');
window.__game = {
  get state(){ return B ? (B.done ? 'done' : B.over ? 'over' : B.pz ? 'paused' : B.run ? 'play' : 'wait') : P ? (P.onboarded ? 'hub' : 'onboard') : 'login'; }, get score(){ return P ? P.coins : 0; },
  get P(){ return P; }, get B(){ return B; }, get TR(){ return TR; }, get hall(){ return HALL; }, cloud:Cloud, get sim(){ return B && B.sim; }, get info(){ return B ? info() : null; }, get ready3d(){ return ready3d; }, get view(){ return V; }, get ol(){ return OL; }, get bubbles(){ return bubbles.length; },
  play:(slot, x, z) => tryPlay(slot, {x, z}), give(n){ P.coins += n; save(); hub(); }, card(id, l = 1){ P.cards[id] = l; save(); hub(); }, unlock(n = LEVELS){ P.ladder = n; save(); hub(); }, tokens(n){ P.tokens += n; save(); hub(); },
  ff(n){ if (B && B.mode === 'cpu' && B.run) for (let i = 0; i < n && !B.sim.over; i++){ for (const a of B.ais) a.tick(); B.sim.step(); pump(); } return B ? B.sim.tick : 0; },
  deck(ids){ if (deckProblem(ids, false)) return deckProblem(ids, false); for (const id of ids) P.cards[id] = Math.max(1, P.cards[id] || 0); P.decks[P.deck] = ids.slice(); save(); hub(); return ''; },
  end(w){ if (B && B.sim){ B.over = true; finish(w, B.sim.crowns); } }, ev(l){ if (V) V.events(l); onEvents(l); }, tapField, order:(u, t) => sendOrder(u, t), get ordSel(){ return ordSel; }, goalsBox, boost:(slot, x, z) => tryBoost(slot, {x, z}), bselect, boostBox, boostShop, buyBoostBox, boosts:BOOSTS, tab, hub, preCpu, ladderCpu, randomCpu, sheet, showEmote, pzAct, buyPack, packs:PACKS, cards:CARDS, audio:A, fx, JOBS, sanitize, league
};
const last = Accounts.last(), sess0 = Cloud.session();
if (sess0 && !Q.get('fresh')){                                   // signed in before: fetch the online save, fall back to this device's copy if the server is out of reach
  loginScreen(); $('loginErr').textContent = 'Signing you in.';
  Cloud.load().then(r => { if (r.error){ Cloud.signOut(); loginScreen(); } else signIn(r.data && r.data.cards ? sanitize({...r.data, name:r.name}) : fresh(r.name)); })
    .catch(() => { const p = Accounts.get(sess0.name); if (p) signIn(p); else { loginScreen(); $('loginErr').textContent = 'Could not reach the account server.'; } });
} else if (last && !Q.get('fresh')) signIn(last); else loginScreen();
initView();
/* a copy of the game kept on the device (sw.js): it opens at once, and still opens with no signal. Not on a developer's machine unless asked for,
   so an edit is never hidden behind an old copy. */
if ('serviceWorker' in navigator && Q.get('nosw')){             // the way out, should a copy ever go bad: open the game once with ?nosw=1
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
  if (window.caches) caches.delete('brawl-1').catch(() => {});
} else if ('serviceWorker' in navigator && (location.protocol === 'https:' || Q.get('sw'))){
  // once it is running, hand it the list of what this visit loaded before it was in charge, so the very first visit is enough to open with no signal
  const shell = () => navigator.serviceWorker.ready.then(r => { if (r.active) r.active.postMessage({keep:[...new Set([location.origin + location.pathname, ...performance.getEntriesByType('resource').map(q => q.name).filter(u => u.startsWith(location.origin + '/'))])]}); });
  const reg = () => navigator.serviceWorker.register('sw.js').then(() => { shell(); for (const t of [5, 15, 40]) setTimeout(shell, t * 1000); }).catch(() => {});      // and again a little later: the 3D side loads after the page has
  try { performance.setResourceTimingBufferSize(600); } catch(e){}
  if (document.readyState === 'complete') reg(); else addEventListener('load', reg);
}
