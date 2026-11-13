import { initOnline, initials } from '../chess/online.js';
import { N, CELLS, SHIPS, SHIP_BY_ID, ROWS, coord, cellsOf, canPlace, randomLayout, validLayout, makeShooter, makeFleet, answerShot, afloat, layoutText, auditAnswers } from './ai.js';

/* =========================================================
   Sink BDB: hide your fleet, hunt his. vs BDB (three brains) or online 1v1 through the chess lobby code.
   Grid index = row * 10 + col (rows A to J, columns 1 to 10).
   Logic updates right away; what you see (pegs, fire, sinking) plays out through a small animation queue.
   ========================================================= */

const $ = id => document.getElementById(id);
const pick = BDB.pick, store = BDB.store, REDUCED = BDB.reduced;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const LEVELS = [
  {key:'rec',     name:'Rec League', short:'REC', mult:1,   note:'Fires wherever. Wanders back to old spots. Never the same square twice, somehow.'},
  {key:'varsity', name:'Varsity',    short:'VAR', mult:1.6, note:'Hunts at random. Once he hits, he works the neighbours and follows the line.'},
  {key:'d1',      name:'D1',         short:'D1',  mult:2.5, note:'Runs the odds on every square. Parity hunting, smart targeting. Genuinely nasty.'}
];

/* ---------- trash talk ---------- */
const EXTRA_ROASTS = [
  "BDB says he's an admiral now. His lanyard still says night shift.",
  "BDB has never sunk anything. Not a jumper, not a free throw, not a ship.",
  "BDB named his flagship after a scholarship. Both went down without a fight.",
  "BDB's court vision was never great. His radar is somehow worse.",
  "BDB's navy has more benchwarmers than his old team. That's saying something.",
  "BDB calls the bottom corner his spot. It's where he sat for four years too."
];
const SNAME = id => SHIP_BY_ID[id].name.replace(/^The /, '');   // "your Scholarship", not "your The Scholarship"
const LN = {
  start:["Fleet's out. BDB named every ship after something he never got.",
    "BDB says he's a naval genius. Biggest boat he's driven is a pedal boat.",
    "Welcome to BDB's waters. The lifeguard's on break. So is BDB.",
    "BDB drew up this battle plan on a break room napkin. It shows.",
    "BDB's navy is ready. Lots of hulls, no hustle. Just like his rec team.",
    "Admiral BDB reporting for duty. He clocked in four minutes early for this."],
  setup:["Hide your ships. BDB hid his like he hid from defence: badly.",
    "Take your time. BDB took four years to find the end of the bench.",
    "Spread them out. BDB's watching. Through the glasses. Barely."],
  ready:["Ships are set. BDB set his an hour ago and then took his break.",
    "Locked in. BDB's pretending he didn't peek. He did not peek. He can't read a grid."],
  badSpot:["Can't park it there. Even BDB knows ships don't stack.",
    "No room. That's tighter than BDB's shooting window."],
  youHit:["Direct hit. BDB hasn't been hit that hard since the scholarship letter didn't come.",
    "That's a hit. BDB's checking if his lanyard floats.",
    "Boom. BDB says that was part of the plan. It was not.",
    "You found one. BDB's calling it a decoy.",
    "Hit! BDB wants a timeout. He used them all in 2014.",
    "Right on the deck. BDB felt that through the glasses."],
  youMiss:["Splash. That's BDB-level shot selection.",
    "Miss. His ships hide better than his jump shot ever did.",
    "Water. Lots of it. BDB's laughing from the bridge.",
    "Nothing but ocean. BDB calls that an airball at sea.",
    "Missed. BDB says even he hits the rim sometimes. He doesn't.",
    "Wet. BDB's fleet is untouched and he's unbearable about it."],
  youNear:["So close BDB's beard got wet.",
    "One square off. BDB's sweating through the track jacket.",
    "Near miss. BDB swears he heard it whistle past.",
    "That one scraped paint. BDB's pretending it didn't."],
  youSink:{
    sch:["You sank The Scholarship. Second time BDB has watched that one go down.",
      "The Scholarship is gone. Folded into employee benefits. Again."],
    lan:["Lanyard Cruiser down. BDB's holding the real one for comfort.",
      "You sank the Lanyard Cruiser. His most elite asset, gone."],
    brk:["Break Room Barge sunk. BDB lost his favourite spot twice in one day.",
      "The Barge is down. BDB's staring at the clock like it's five to close."],
    sub:["Shot Clock Sub sunk. Ran out of time, just like BDB's career.",
      "You got the Sub. BDB never saw it coming. He never sees anything coming."],
    bnc:["Bench Boat sunk. First time the bench ever saw action.",
      "You sank the Bench Boat. BDB's taking it personally. That was his seat."]
  },
  youStreak:["Three straight hits. BDB's never made three straight anything.",
    "You're on a heater. BDB's averaging 2.0 points in this one too.",
    "Another hit. BDB's asking the ref to check your stick. It's a grid. There's no ref."],
  youCold:["Five misses in a row. BDB's taking notes. Finally, someone he can coach.",
    "Cold streak. BDB says welcome to his whole career.",
    "That's a lot of water. BDB's fleet is in the other direction. Probably."],
  bdbHit:["BDB hit you. He'll tell this story longer than his basketball ones.",
    "BDB connected. Write the date down. It's a career first.",
    "Hit for BDB. He's doing finger guns at the radar.",
    "BDB found your ship. Couldn't find the open man, but he found that.",
    "Boom. BDB says he called it. He calls everything after."],
  bdbMiss:["BDB misses. Same form as his free throws.",
    "Splash. BDB's aim is consistent. Consistently off.",
    "BDB fired at nothing. Classic part-time scorer.",
    "Miss. BDB's blaming the wind. It's a grid. There's no wind.",
    "BDB airballed into the ocean."],
  bdbNear:["BDB missed by one square. He's counting it as an assist.",
    "Close one. BDB's glasses fogged up mid-shot.",
    "BDB just grazed you. He's going to call that a hit at work tomorrow."],
  bdbSink:[s => `BDB sank your ${s}. He's doing a lap of the break room.`,
    s => `Down goes your ${s}. BDB has never finished anything that well.`,
    s => `BDB sank your ${s}. Check the scoreboard, he's actually scoring.`,
    s => `Your ${s} is gone. BDB's adding it to the highlight reel. Still nine seconds long.`],
  bdbStreak:["BDB's hit three in a row. Scouts, if you're going to call, now's the time.",
    "BDB's on fire. Not literally. That's your ship."],
  youWin:["Fleet's gone. BDB's swimming back to clock in. Wet.",
    "You sank all of BDB's navy. He's calling it a strategic retreat.",
    "Game over. BDB's ships are at the bottom with his D1 dreams.",
    "Total victory. BDB wants a rematch and a bigger ocean."],
  youWinClean:["Flawless. BDB didn't even scratch you. Very on brand for his defence.",
    "Not one ship lost. BDB's hiding in the break room until his shift ends."],
  bdbWin:["BDB sank your whole fleet. He'll never shut up about this. Never.",
    "BDB wins. Same guy. Different league. Somehow better at this one.",
    "Your fleet's gone. BDB's framing the screenshot.",
    "BDB won. Built for the spotlight. Scheduled for Tuesday. It's Tuesday somewhere."],
  think:["BDB is running the numbers. First time he's done math on the clock.",
    "Hold on. BDB's checking his odds. He's never been good at odds.",
    "BDB is thinking. Rare footage."],
  salvo:["Salvo rules. BDB gets one shot per ship. Most shots he's taken in years."],
  // announcer lines for online games: x shoots, y gets shot
  pvStart:[(a, b) => `${a} vs ${b}. BDB's on the radio, closest he's been to a broadcast gig.`,
    (a, b) => `${a} and ${b} hide their fleets. Loser gets compared to BDB for a week.`,
    (a, b) => `Fleets in the water. ${a} vs ${b}. BDB's calling it from the break room.`],
  pvHit:[(x, y) => `${x} lands one on ${y}. BDB felt that from shore.`,
    (x, y) => `Hit for ${x}. ${y} is pretending that was the plan.`,
    (x, y) => `${x} found a ship. ${y}'s radar is pure BDB.`],
  pvMiss:[(x, y) => `${x} splashes water. BDB knows that look well.`,
    (x, y) => `Miss by ${x}. ${y} breathes again.`,
    (x, y) => `${x} fires at nothing. BDB calls that his signature move.`],
  pvSink:[(x, y, s) => `${x} sank ${y}'s ${s}. BDB is lowering the flag. His face is on it.`,
    (x, y, s) => `${y}'s ${s} is gone. ${x} is cooking.`,
    (x, y, s) => `Down goes the ${s}. ${y}, BDB says welcome to the club.`],
  pvWin:[(w, l) => `${w} wins. ${l} is officially the BDB of the high seas.`,
    (w, l) => `${w} sinks the last ship. ${l} is swimming home.`,
    (w, l) => `Game. ${w} rules the waves. ${l}, BDB saved you a seat on the bench.`]
};
BDB.init({game:'fleet', extra:EXTRA_ROASTS});

let lastTalk = 0;
const lastPick = new Map();
function lineFrom(arr, args){
  let i, tries = 0;
  do { i = Math.floor(Math.random() * arr.length); } while (arr.length > 1 && i === lastPick.get(arr) && ++tries < 8);
  lastPick.set(arr, i);
  const t = arr[i];
  return typeof t === 'function' ? t(...(args || [])) : t;
}
function talk(arr, {force = false, args, tag} = {}){
  const now = Date.now();
  if (!force && now - lastTalk < 3800) return false;
  lastTalk = now;
  const text = lineFrom(arr, args);
  BDB.say(text, tag || (mode === 'pvp' ? 'BDB on the radio' : ''));
  if (mode === 'pvp') post('bdb', text, 'BDB · Turn ' + (turnNo + 1));
  return true;
}
function roastMaybe(force){
  const now = Date.now();
  if (!force && now - lastTalk < 5000) return;
  lastTalk = now; BDB.roast();
}

/* ---------- sound: kit blips plus our own booms and splashes ---------- */
let actx = null, noiseBuf = null;
function audio(){
  if (BDB.sfx.muted) return null;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (!noiseBuf){
      noiseBuf = actx.createBuffer(1, actx.sampleRate * 1.6, actx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return actx;
  } catch(e){ return null; }
}
function noise({dur = .3, vol = .2, type = 'lowpass', f0 = 1000, f1 = 200, q = .7, delay = 0}){
  const a = audio(); if (!a) return;
  const t = a.currentTime + delay, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f).connect(g).connect(a.destination); s.start(t); s.stop(t + dur + .05);
}
function tone({f0 = 400, f1 = 0, dur = .2, vol = .05, type = 'sine', delay = 0}){
  const a = audio(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .03);
}
const snd = {
  whistle(){ tone({f0:1500, f1:520, dur:REDUCED ? .15 : .4, vol:.025}); },
  splash(){ noise({dur:.35, vol:.16, type:'bandpass', f0:2200, f1:700, q:.9}); tone({f0:300, f1:120, dur:.12, vol:.04, type:'triangle'}); },
  boom(big){ noise({dur:big ? .9 : .55, vol:big ? .45 : .32, f0:1400, f1:90}); tone({f0:110, f1:38, dur:big ? .6 : .4, vol:.16}); },
  sink(){ noise({dur:1.5, vol:.22, f0:420, f1:60, delay:.2}); tone({f0:170, f1:45, dur:1.4, vol:.05, type:'sawtooth', delay:.25});
    for (let k = 0; k < 6; k++) tone({f0:500 + Math.random() * 500, f1:900 + Math.random() * 700, dur:.06, vol:.025, delay:.6 + k * .14 + Math.random() * .08}); },
  clunk(){ tone({f0:190, f1:80, dur:.09, vol:.09, type:'triangle'}); noise({dur:.05, vol:.06, f0:1800, f1:600}); },
  nope(){ BDB.sfx.bad(); }
};

/* ---------- state ---------- */
let mode = 'bdb';                 // bdb | pvp
let state = 'menu';               // menu | setup | play | over
let rules = store.get('fleet-rules') === 'salvo' ? 'salvo' : 'classic';
let level = LEVELS.find(l => l.key === store.get('fleet-level')) || LEVELS[1];
let setupShips = blankSetup();    // [{id,len,r,c,v,placed}]
let sel = 0;                      // selected ship in setup
let my = null, foe = null;        // fleets. foe is only known locally vs BDB
let view = new Int8Array(CELLS);  // my knowledge of their grid: 0 unknown, 1 miss, 2 hit, 3 sunk
let foeSunk = [];                 // [{id, cells}]
let foeReveal = null;             // their full layout once known (vs BDB at the end, or their reveal online)
let shooter = null;
let turn = 'me', turnNo = 0, first = 'me';
let marks = [];                   // salvo targets picked so far
let st = freshStats();
let winner = null, paused = false, lastScore = 0, swapView = false, kb = {r:4, c:4, on:false}, hover = -1;
let pvp = null;
let T3 = null, FLAT = false, visVer = 0;      // 3D renderer (fleet3d.js) when it's on
const vis = {me:new Uint8Array(CELLS), foe:new Uint8Array(CELLS), sunk:{me:new Map(), foe:new Map()}};

function blankSetup(){ return SHIPS.map(d => ({id:d.id, len:d.len, r:0, c:0, v:false, placed:false})); }
function freshStats(){ return {shots:0, hits:0, streak:0, best:0, cold:0, foeShots:0, foeHits:0, foeStreak:0, sunkBy:0}; }
const myAfloat = () => my ? afloat(my) : 5;
const foeAfloat = () => 5 - foeSunk.length;
const ownerOf = t => (t % 2 === 0) ? first : (first === 'me' ? 'foe' : 'me');
function freeCount(arr){ let n = 0; for (let i = 0; i < CELLS; i++) if (!arr[i]) n++; return n; }
function allowed(side){
  if (rules === 'classic') return 1;
  if (side === 'me') return Math.min(myAfloat(), freeCount(view));
  return Math.max(1, Math.min(foeAfloat(), my ? CELLS - my.shot.reduce((a, b) => a + b, 0) : 100));
}
function shipFromCells(id, cells){
  const s = cells.slice().sort((a, b) => a - b);
  return {id, len:s.length, r:(s[0] / 10) | 0, c:s[0] % 10, v:s.length > 1 && s[1] - s[0] === 10};
}
function nearShip(fleet, i){
  const r = (i / 10) | 0, c = i % 10;
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
    const rr = r + dr, cc = c + dc; if (rr < 0 || rr > 9 || cc < 0 || cc > 9) continue;
    const o = fleet.occ[rr * 10 + cc]; if (o && !fleet.sunk.has(fleet.ships[o - 1].id)) return true;
  }
  return false;
}

/* ---------- clock, timers, animation queue (all frozen while paused or hidden) ---------- */
let gt = 0;
const timers = [];
function after(ms, fn){ timers.push({at:gt + ms, fn}); }
const jobs = []; let jobOn = false, jobToken = 0;
function enqueue(fn){ jobs.push(fn); pump(); }
function pump(){
  if (jobOn || !jobs.length) return;
  jobOn = true; const tok = jobToken; const fn = jobs.shift();
  fn(() => { if (tok !== jobToken) return; jobOn = false; pump(); });
}
const idle = () => !jobOn && !jobs.length;
function whenIdle(fn){ enqueue(done => { done(); fn(); }); }
function resetAnim(){ jobToken++; jobs.length = 0; jobOn = false; timers.length = 0; shells.length = 0; fx.length = 0; aim = null; }

/* ---------- canvas + layout ---------- */
const cv = $('cv'), cx = cv.getContext('2d'), stage = $('stage');
let W = 0, H = 0, DPR = 1;
const chatSideMQ = matchMedia('(min-width:1100px)');
const LY = {phone:false, grids:{me:null, foe:null}, tray:null, slots:[], inset:false};
function resize(){
  const r = stage.getBoundingClientRect();
  DPR = Math.min(window.devicePixelRatio || 1, T3 ? 1.5 : 2);
  W = r.width; H = r.height;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  layout();
}
function mkGrid(key, x, y, cell, big){
  return {key, x, y, cell, big, lab: big ? Math.max(12, cell * .5) : 12, hd: big ? (LY.phone ? 20 : 26) : 15};
}
function layout(){
  const phone = W < 700;
  LY.phone = phone;
  const chatW = mode === 'pvp' && chatSideMQ.matches && (state === 'play' || state === 'setup' || state === 'over') ? 336 : 0;
  LY.chatW = chatW;
  const top = phone ? 62 : 78, bottom = phone ? 146 : 100;
  const left = 12, availW = W - 24 - chatW, availH = Math.max(160, H - top - bottom);
  LY.grids.me = LY.grids.foe = null; LY.tray = null; LY.slots = []; LY.inset = false;
  if (state === 'setup' || state === 'menu'){
    if (!phone){
      const hd = 26, rows = 10;
      let cell = Math.min((availH - hd - 14) / (rows + .5), (availW - 14 - 40) / 14.4, 56);
      cell = Math.max(22, cell);
      const lab = Math.max(12, cell * .5), trayW = cell * 4.4;
      const totalW = lab + cell * 10 + 40 + trayW;
      const gx = left + (availW - totalW) / 2 + lab;
      const gy = top + hd + lab + Math.max(0, (availH - (hd + lab + cell * 10)) / 2);
      LY.grids.me = mkGrid('me', gx, gy, cell, true);
      LY.tray = {x:gx + cell * 10 + 40, y:gy, w:trayW, h:cell * 10, tc:cell * .8};
      const tc = LY.tray.tc, slotH = cell * 2;
      SHIPS.forEach((d, k) => LY.slots.push({id:d.id, x:LY.tray.x, y:LY.tray.y + k * slotH + cell * .62, tc, labelY:LY.tray.y + k * slotH + cell * .38}));
    } else {
      const hd = 20;
      let cell = Math.min((W - 24 - 14) / 10, (availH - hd - 14 - 140) / 10, 40);
      cell = Math.max(20, cell);
      const lab = Math.max(12, cell * .5);
      const gw = lab + cell * 10;
      const gx = (W - gw) / 2 + lab, gy = top + hd + lab;
      LY.grids.me = mkGrid('me', gx, gy, cell, true);
      const tc = Math.min(cell * .72, 26);
      const ty = gy + cell * 10 + 12;
      LY.tray = {x:12, y:ty, w:W - 24, h:H - bottom - ty, tc};
      const colW = (W - 24) / 2, rowH = Math.max(tc + 20, Math.min(46, (H - bottom + 60 - ty) / 3));
      const pos = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1]];
      SHIPS.forEach((d, k) => {
        const [col, row] = pos[k];
        LY.slots.push({id:d.id, x:12 + col * colW + 6, y:ty + row * rowH + 16, tc, labelY:ty + row * rowH + 8});
      });
    }
    return;
  }
  // play / over
  if (!phone){
    const hd = 26, rosterH = 40;
    const gap = 44;
    let cell = Math.min((availH - hd - rosterH - 14) / 10.5, (availW - gap - 28) / 21, 56);
    cell = Math.max(18, cell);
    const lab = Math.max(12, cell * .5), gw = lab + cell * 10;
    const totalW = gw * 2 + gap;
    const x0 = left + (availW - totalW) / 2;
    const gy = top + hd + lab + Math.max(0, (availH - (hd + lab + cell * 10 + rosterH)) / 2);
    LY.grids.me = mkGrid('me', x0 + lab, gy, cell, true);
    LY.grids.foe = mkGrid('foe', x0 + gw + gap + lab, gy, cell, true);
  } else {
    const hd = 20, rosterH = 34;
    const ic = clamp(W * .036, 12, 15), labS = 12;
    const insetBlock = 15 + labS + ic * 10 + 6;
    let cell = Math.min((W - 24 - 14) / 10, (availH - hd - 14 - rosterH - insetBlock) / 10, 42);
    let inset = true;
    if (cell < 26){ inset = false; cell = Math.min((W - 24 - 14) / 10, (availH - hd - 14 - rosterH) / 10, 42); }
    cell = Math.max(18, cell);
    const lab = Math.max(12, cell * .5), gw = lab + cell * 10;
    const gx = (W - gw) / 2 + lab, gy = top + hd + lab;
    const bigKey = swapView ? 'me' : 'foe', smallKey = swapView ? 'foe' : 'me';
    LY.grids[bigKey] = mkGrid(bigKey, gx, gy, cell, true);
    LY.inset = inset;
    if (inset){
      const iy = gy + cell * 10 + rosterH + 15 + labS + 4;
      LY.grids[smallKey] = mkGrid(smallKey, gx - lab + labS + 2, iy, ic, false);
    }
  }
}
const grid = key => LY.grids[key];
function cellAt(g, px, py, slack = 0){
  if (!g) return -1;
  const c = Math.floor((px - g.x) / g.cell), r = Math.floor((py - g.y) / g.cell);
  if (px < g.x - slack || py < g.y - slack || px > g.x + g.cell * 10 + slack || py > g.y + g.cell * 10 + slack) return -1;
  return clamp(r, 0, 9) * 10 + clamp(c, 0, 9);
}
new ResizeObserver(resize).observe(stage);

/* ---------- drawing helpers ---------- */
const FONT_LED = '"Teko","Arial Narrow",sans-serif', FONT_BODY = '"Figtree",system-ui,sans-serif';
function faceCircle(g, x, y, r, ring = '#f2c14e'){
  const img = BDB.faceImg;
  g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.closePath();
  g.fillStyle = '#14254d'; g.fill();
  if (img.complete && img.naturalWidth){
    g.clip();
    const iw = img.naturalWidth, ih = img.naturalHeight, side = Math.min(iw, ih);
    const sx = (iw - side) / 2, sy = Math.max(0, Math.min(ih - side, (ih - side) * .32));
    g.drawImage(img, sx, sy, side, side, x - r, y - r, r * 2, r * 2);
  }
  g.restore();
  if (ring){ g.strokeStyle = ring; g.lineWidth = Math.max(1, r * .16); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); }
}
const STYLE = {
  mine:{a:'#a3b1c9', b:'#4f5f7e', deck:'rgba(230,236,246,.5)', trim:'#ff8a2b', edge:'#1b2234', bridge:'#e9eef6'},
  foe:{a:'#3563c0', b:'#112a5e', deck:'rgba(120,160,240,.32)', trim:'#f2c14e', edge:'#050d22', bridge:'#c9d8ff'}
};
function hullPath(g, id, Lp, cell){
  const p = cell * .13, t = p, b = cell - p, m = cell / 2;
  g.beginPath();
  if (id === 'sub'){
    const rr = (b - t) / 2 - cell * .03;
    g.moveTo(cell * .5, m - rr); g.lineTo(Lp - cell * .5, m - rr);
    g.arc(Lp - cell * .5, m, rr, -Math.PI / 2, Math.PI / 2);
    g.lineTo(cell * .5, m + rr);
    g.arc(cell * .5, m, rr, Math.PI / 2, Math.PI * 1.5);
  } else if (id === 'brk'){
    g.roundRect(p * .7, t, Lp - p * 1.4, b - t, cell * .16);
  } else {
    const bow = cell * .66;
    g.moveTo(p * 1.1, t + cell * .04); g.lineTo(Lp - bow, t);
    g.quadraticCurveTo(Lp - p * .9, t + cell * .03, Lp - p * .5, m);
    g.quadraticCurveTo(Lp - p * .9, b - cell * .03, Lp - bow, b);
    g.lineTo(p * 1.1, b - cell * .04);
    g.quadraticCurveTo(p * .5, m, p * 1.1, t + cell * .04);
  }
  g.closePath();
}
/* draws a ship. opts: alpha, wreck (0..1 darkness), invalid, ghost, sink (0..1 progress), lift */
function drawShip(g, sh, cell, styleKey, o = {}){
  const st = STYLE[styleKey], len = sh.len, Lp = len * cell, x = g.x + sh.c * cell, y = g.y + sh.r * cell;
  const id = sh.id;
  cx.save();
  cx.globalAlpha = o.alpha ?? 1;
  // local frame: x along the ship (bow at +x), y across. vertical ships point up.
  const cxm = sh.v ? x + cell / 2 : x + Lp / 2, cym = sh.v ? y + Lp / 2 : y + cell / 2;
  cx.translate(cxm, cym);
  if (sh.v) cx.rotate(-Math.PI / 2);
  if (o.sink !== undefined){
    const k = o.sink;
    cx.rotate(Math.sin(k * 5) * .05 * (1 - k) + k * .09);
    cx.scale(1 - k * .16, 1 - k * .24);
  }
  if (o.lift){ cx.shadowColor = 'rgba(0,0,0,.55)'; cx.shadowBlur = cell * .5; cx.shadowOffsetY = cell * .18; }
  cx.translate(-Lp / 2, -cell / 2);
  hullPath(cx, id, Lp, cell);
  const gr = cx.createLinearGradient(0, cell * .1, 0, cell * .9);
  gr.addColorStop(0, o.invalid ? '#ff8a7d' : st.a); gr.addColorStop(1, o.invalid ? '#8a1d12' : st.b);
  cx.fillStyle = gr; cx.fill();
  cx.shadowColor = 'transparent';
  cx.lineWidth = Math.max(1, cell * .05); cx.strokeStyle = st.edge; cx.stroke();
  cx.save(); hullPath(cx, id, Lp, cell); cx.clip();
  const m = cell / 2;
  // deck centre band + trim stripe
  cx.fillStyle = st.deck; cx.fillRect(0, m - cell * .15, Lp, cell * .3);
  cx.strokeStyle = st.trim; cx.lineWidth = Math.max(1, cell * .045);
  cx.beginPath(); cx.moveTo(cell * .25, m + cell * .25); cx.lineTo(Lp - cell * .45, m + cell * .25); cx.stroke();
  cx.restore();
  // per-ship details
  cx.fillStyle = st.bridge; cx.strokeStyle = st.edge; cx.lineWidth = Math.max(1, cell * .035);
  const turret = (fx) => { cx.beginPath(); cx.arc(fx, m, cell * .15, 0, Math.PI * 2); cx.fill(); cx.stroke(); cx.fillStyle = st.edge; cx.fillRect(fx, m - cell * .03, cell * .3, cell * .06); cx.fillStyle = st.bridge; };
  if (id === 'sch'){
    cx.strokeStyle = 'rgba(255,255,255,.55)'; cx.setLineDash([cell * .14, cell * .12]); cx.lineWidth = Math.max(1, cell * .04);
    cx.beginPath(); cx.moveTo(cell * .4, m); cx.lineTo(Lp - cell * .7, m); cx.stroke(); cx.setLineDash([]);
    cx.fillStyle = st.bridge; cx.strokeStyle = st.edge;
    cx.beginPath(); cx.roundRect(Lp * .52, cell * .14, cell * .8, cell * .26, cell * .06); cx.fill(); cx.stroke();
  } else if (id === 'lan'){
    turret(cell * .55); turret(Lp - cell * 1.15);
    cx.beginPath(); cx.roundRect(Lp * .38, m - cell * .2, cell * .8, cell * .4, cell * .08); cx.fill(); cx.stroke();
    cx.strokeStyle = st.trim; cx.lineWidth = Math.max(1, cell * .05);
    cx.beginPath(); cx.ellipse(Lp * .38 + cell * .4, m + cell * .02, cell * .32, cell * .14, 0, 0, Math.PI); cx.stroke();
  } else if (id === 'brk'){
    for (let k = 0; k < 3; k++){
      cx.fillStyle = k === 1 ? st.trim : st.bridge;
      cx.beginPath(); cx.roundRect(cell * .35 + k * cell * .78, m - cell * .2, cell * .58, cell * .4, cell * .05); cx.fill(); cx.stroke();
    }
  } else if (id === 'sub'){
    cx.beginPath(); cx.ellipse(Lp * .45, m, cell * .38, cell * .17, 0, 0, Math.PI * 2); cx.fill(); cx.stroke();
    cx.strokeStyle = st.trim; cx.lineWidth = Math.max(1, cell * .04);
    cx.beginPath(); cx.arc(Lp * .45, m, cell * .08, 0, Math.PI * 2); cx.stroke();
  } else if (id === 'bnc'){
    cx.fillStyle = '#9a6a3c'; cx.strokeStyle = '#3a2410';
    cx.beginPath(); cx.roundRect(cell * .42, m - cell * .17, cell * .95, cell * .34, cell * .05); cx.fill(); cx.stroke();
    cx.strokeStyle = 'rgba(58,36,16,.7)'; cx.beginPath(); cx.moveTo(cell * .45, m); cx.lineTo(cell * 1.34, m); cx.stroke();
  }
  // darkening for wrecks, sinking and ghosts
  const dark = o.wreck ?? (o.sink !== undefined ? o.sink * .7 : 0);
  if (dark > 0){ hullPath(cx, id, Lp, cell); cx.fillStyle = `rgba(4,8,18,${dark})`; cx.fill(); }
  cx.restore();
  // flag (always upright so the face reads right way up)
  if (!o.noFlag && cell >= 16){
    const fl = sh.v ? {x:x + cell * .5, y:y + Lp - cell * .45} : {x:x + cell * .45, y:y + cell * .5};
    if (id === 'sch'){ if (sh.v){ fl.y = y + Lp * .4; } else fl.x = x + Lp * .6; }
    const r = cell * (id === 'sch' ? .3 : .25);
    cx.save(); cx.globalAlpha = (o.alpha ?? 1) * (1 - (o.sink ?? 0));
    if (styleKey === 'foe') faceCircle(cx, fl.x, fl.y, r, '#f2c14e');
    else {
      const bg = cx.createRadialGradient(fl.x - r * .3, fl.y - r * .35, r * .1, fl.x, fl.y, r);
      bg.addColorStop(0, '#ffc583'); bg.addColorStop(.5, '#ff8a2b'); bg.addColorStop(1, '#a34c0c');
      cx.fillStyle = bg; cx.beginPath(); cx.arc(fl.x, fl.y, r, 0, Math.PI * 2); cx.fill();
      cx.strokeStyle = 'rgba(58,22,2,.7)'; cx.lineWidth = Math.max(1, r * .14);
      cx.beginPath(); cx.moveTo(fl.x - r, fl.y); cx.lineTo(fl.x + r, fl.y); cx.moveTo(fl.x, fl.y - r); cx.lineTo(fl.x, fl.y + r); cx.stroke();
    }
    cx.restore();
  }
}

/* ---------- effects (positions in cell units, relative to a grid) ---------- */
const fx = [], shells = [];
let aim = null, lastAim = -1, shake = 0;
function spawn(p){ if (fx.length < 600) fx.push(p); }
function splashFx(key, x, y){
  if (T3) T3.fx('splash', key, x, y);
  spawn({key, kind:'ring', x, y, t:0, life:.9, s:.15, grow:.9, c:'200,230,255'});
  spawn({key, kind:'ring', x, y, t:-.12, life:.9, s:.1, grow:.6, c:'200,230,255'});
  if (REDUCED) return;
  for (let k = 0; k < 14; k++){
    const a = Math.random() * Math.PI * 2, sp = .8 + Math.random() * 1.8;
    spawn({key, kind:'drop', x, y, vx:Math.cos(a) * sp * .6, vy:-1.5 - Math.random() * 2.5, z:0, t:0, life:.55 + Math.random() * .3, s:.04 + Math.random() * .05, c:Math.random() < .5 ? '#e8f4ff' : '#8fc8ff'});
  }
}
function explodeFx(key, x, y, big){
  if (T3) T3.fx('boom', key, x, y, big);
  spawn({key, kind:'flash', x, y, t:0, life:.35, s:big ? 1.3 : .9});
  spawn({key, kind:'ring', x, y, t:0, life:.6, s:.2, grow:1.1, c:'255,190,110'});
  if (REDUCED) return;
  const n = big ? 26 : 18;
  for (let k = 0; k < n; k++){
    const a = Math.random() * Math.PI * 2, sp = (big ? 2.6 : 1.8) * (.3 + Math.random());
    spawn({key, kind:'spark', x, y, vx:Math.cos(a) * sp, vy:Math.sin(a) * sp - .4, t:0, life:.35 + Math.random() * .4, s:.05 + Math.random() * .06, c:pick(['#fff3c4', '#ffb547', '#ff8a2b', '#ff5a2b'])});
  }
  for (let k = 0; k < 6; k++){
    const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 1.5;
    spawn({key, kind:'debris', x, y, vx:Math.cos(a) * sp, vy:Math.sin(a) * sp - 1, t:0, life:.6 + Math.random() * .4, s:.05 + Math.random() * .05, rot:Math.random() * 6});
  }
  for (let k = 0; k < 4; k++) spawn({key, kind:'smoke', x:x + (Math.random() - .5) * .3, y, vx:(Math.random() - .5) * .2, vy:-.35 - Math.random() * .3, t:0, life:1.4 + Math.random(), s:.22 + Math.random() * .15, dark:.55});
}
function sinkFx(key, sh){
  if (T3) T3.fx('sink', key, sh);
  const cells = cellsOf(sh.r, sh.c, sh.v, sh.len);
  cells.forEach((i, k) => after(k * 110, () => { explodeFx(key, i % 10 + .5, ((i / 10) | 0) + .5, true); if (!REDUCED) shake = Math.max(shake, 6); }));
  const mx = sh.c + (sh.v ? .5 : sh.len / 2), my = sh.r + (sh.v ? sh.len / 2 : .5);
  for (let k = 0; k < 3; k++) after(300 + k * 260, () => spawn({key, kind:'ring', x:mx, y:my, t:0, life:1.3, s:sh.len * .35, grow:1.4, c:'180,215,255'}));
  if (REDUCED) return;
  for (let k = 0; k < 20; k++) after(350 + Math.random() * 1300, () => {
    const i = pick(cells);
    spawn({key, kind:'bubble', x:i % 10 + .2 + Math.random() * .6, y:((i / 10) | 0) + .2 + Math.random() * .6, vx:(Math.random() - .5) * .1, vy:-.2 - Math.random() * .3, t:0, life:.7 + Math.random() * .6, s:.04 + Math.random() * .06});
  });
}
const SHELL_MS = REDUCED ? 160 : 460, SINK_MS = REDUCED ? 400 : 1700;

/* fire a visual volley at a grid. res = answers in order. cb when everything has landed and settled. */
function volley(key, res, cb, aimFirst){
  // short phones have no inset: flip to the grid being shot at, and back to the target afterwards
  const auto = LY.phone && !LY.inset;
  if (auto && swapView !== (key === 'me')){ swapView = key === 'me'; layout(); refreshDock(); }
  const done = cb;
  cb = () => {
    if (auto && key === 'me') after(REDUCED ? 100 : 650, () => { if (state === 'play' && swapView){ swapView = false; layout(); refreshDock(); } done(); });
    else done();
  };
  const go = () => {
    if (aim){ lastAim = aim.to; aim = null; }
    const gap = res.length > 1 ? (REDUCED ? 80 : 230) : 0;
    let sunk = false;
    res.forEach((a, k) => {
      after(k * gap, () => { snd.whistle(); shells.push({key, i:a.i, t0:gt, dur:SHELL_MS, done:false, onLand:() => land(key, a)}); });
      if (a.r === 'sunk') sunk = true;
    });
    after((res.length - 1) * gap + SHELL_MS + (sunk ? SINK_MS * .85 : (REDUCED ? 120 : 420)), cb);
  };
  if (aimFirst && !REDUCED){
    const from = lastAim >= 0 ? lastAim : 44 + Math.floor(Math.random() * 12);
    aim = {key, from, to:res[0].i, t0:gt, dur:520 + Math.random() * 260};
    after(aim.dur + 140, go);
  } else go();
}
function land(key, a){
  vis[key][a.i] = a.r === 'miss' ? 1 : 2; visVer++;
  const x = a.i % 10 + .5, y = ((a.i / 10) | 0) + .5;
  if (a.r === 'miss'){ splashFx(key, x, y); snd.splash(); return; }
  explodeFx(key, x, y, a.r === 'sunk'); snd.boom(a.r === 'sunk');
  if (!REDUCED) shake = Math.max(shake, key === 'me' ? 8 : 5);
  if (a.r === 'sunk'){
    const sh = key === 'me' ? my.ships.find(s => s.id === a.ship) : shipFromCells(a.ship, a.cells);
    vis.sunk[key].set(a.ship, {sh, t0:gt});
    sinkFx(key, sh); snd.sink();
    BDB.shout(key === 'foe' ? 'SUNK!' : 'HIT AND SUNK', key === 'me');
  }
}

/* ---------- drawing ---------- */
function drawWater(g, now){
  const c = g.cell, S = c * 10;
  if (!FLAT){
  cx.save();
  cx.beginPath(); cx.roundRect(g.x - 3, g.y - 3, S + 6, S + 6, Math.max(4, c * .18));
  const gr = cx.createLinearGradient(g.x, g.y, g.x + S, g.y + S);
  gr.addColorStop(0, '#0d3a74'); gr.addColorStop(.55, '#082b5c'); gr.addColorStop(1, '#061f45');
  cx.fillStyle = gr; cx.fill();
  cx.clip();
  if (!REDUCED || true){
    cx.strokeStyle = 'rgba(140,200,255,.07)'; cx.lineWidth = Math.max(1, c * .05);
    const t = now / 1000;
    for (let k = 0; k < 9; k++){
      const yy = g.y + (k + .5) * S / 9;
      cx.beginPath();
      for (let s = 0; s <= 24; s++){
        const xx = g.x + s * S / 24;
        const w = Math.sin(s * .7 + k * 1.3 + (REDUCED ? 0 : t * 1.4)) * c * .12;
        if (s === 0) cx.moveTo(xx, yy + w); else cx.lineTo(xx, yy + w);
      }
      cx.stroke();
    }
  }
  cx.restore();
  }
  cx.strokeStyle = FLAT ? 'rgba(170,210,255,.2)' : 'rgba(160,200,255,.13)'; cx.lineWidth = 1;
  cx.beginPath();
  for (let k = 1; k < 10; k++){ cx.moveTo(g.x + k * c + .5, g.y); cx.lineTo(g.x + k * c + .5, g.y + S); cx.moveTo(g.x, g.y + k * c + .5); cx.lineTo(g.x + S, g.y + k * c + .5); }
  cx.stroke();
}
function drawLabels(g, title, active, isFoe){
  const c = g.cell, S = c * 10;
  cx.fillStyle = 'rgba(143,163,204,.75)';
  cx.font = `500 ${g.big ? Math.round(clamp(g.lab * .95, 10, 22)) : 9}px ${FONT_LED}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  for (let k = 0; k < 10; k++){
    cx.fillText(String(k + 1), g.x + (k + .5) * c, g.y - g.lab * .5 + 1);
    cx.fillText(ROWS[k], g.x - g.lab * (g.big ? .52 : .55), g.y + (k + .5) * c + 1);
  }
  // header
  const hy = g.y - g.lab - g.hd * .5;
  cx.textAlign = 'left';
  cx.font = `800 ${g.big ? (LY.phone ? 11 : 12) : 9}px ${FONT_BODY}`;
  let tx = g.x;
  if (isFoe && g.big){
    const r = g.hd * .42;
    if (mode === 'pvp' && pvp){
      cx.fillStyle = '#1f3c78'; cx.beginPath(); cx.arc(g.x + r, hy, r, 0, Math.PI * 2); cx.fill();
      cx.strokeStyle = active ? '#f2c14e' : '#3a5fa8'; cx.lineWidth = 1.5; cx.stroke();
      cx.save(); cx.fillStyle = '#eef2fb'; cx.font = `800 ${Math.round(r * .9)}px ${FONT_BODY}`; cx.textAlign = 'center'; cx.fillText(initials(pvp.oppName), g.x + r, hy + 1); cx.restore();
    } else faceCircle(cx, g.x + r, hy, r, active ? '#f2c14e' : '#3a5fa8');
    tx += r * 2 + 7;
  }
  cx.fillStyle = active ? '#f2c14e' : '#8fa3cc';
  cx.save(); cx.translate(tx, hy + 1);
  const txt = title.toUpperCase().split('').join(String.fromCharCode(8202));
  cx.fillText(txt, 0, 0); cx.restore();
  if (active){
    cx.save(); cx.strokeStyle = 'rgba(242,193,78,.75)'; cx.lineWidth = 2; cx.shadowColor = 'rgba(242,193,78,.6)'; cx.shadowBlur = 14;
    cx.beginPath(); cx.roundRect(g.x - 4, g.y - 4, S + 8, S + 8, Math.max(5, c * .2)); cx.stroke(); cx.restore();
  }
}
function drawFire(x, y, c, t){
  const f = .75 + Math.sin(t * 13) * .12 + Math.sin(t * 7.3) * .08;
  for (let k = 0; k < 3; k++){
    const ox = (k - 1) * c * .1, h = c * (.34 - Math.abs(k - 1) * .08) * f;
    const gr = cx.createRadialGradient(x + ox, y - h * .2, 0, x + ox, y - h * .1, h);
    gr.addColorStop(0, 'rgba(255,248,200,.95)'); gr.addColorStop(.35, 'rgba(255,170,60,.85)'); gr.addColorStop(1, 'rgba(255,60,20,0)');
    cx.fillStyle = gr; cx.beginPath(); cx.ellipse(x + ox, y - h * .25, h * .45, h * .8, 0, 0, Math.PI * 2); cx.fill();
  }
}
function drawPegs(g, key, now){
  const c = g.cell, arr = vis[key];
  const sunkCells = new Set();
  for (const [, v] of vis.sunk[key]) for (const i of cellsOf(v.sh.r, v.sh.c, v.sh.v, v.sh.len)) sunkCells.add(i);
  for (let i = 0; i < CELLS; i++){
    const v = arr[i]; if (!v) continue;
    const x = g.x + (i % 10 + .5) * c, y = g.y + (((i / 10) | 0) + .5) * c;
    if (FLAT && v === 1) continue;
    if (v === 1){
      cx.fillStyle = 'rgba(220,235,255,.18)'; cx.beginPath(); cx.arc(x, y, c * .26, 0, Math.PI * 2); cx.fill();
      cx.fillStyle = '#e6eefc'; cx.beginPath(); cx.arc(x, y, c * .11, 0, Math.PI * 2); cx.fill();
    } else if (sunkCells.has(i)){
      cx.strokeStyle = 'rgba(255,90,74,.9)'; cx.lineWidth = Math.max(1.5, c * .08); cx.lineCap = 'round';
      const d = c * .2;
      cx.beginPath(); cx.moveTo(x - d, y - d); cx.lineTo(x + d, y + d); cx.moveTo(x + d, y - d); cx.lineTo(x - d, y + d); cx.stroke();
    } else {
      cx.fillStyle = 'rgba(255,90,60,.16)'; cx.fillRect(g.x + (i % 10) * c + 1, g.y + ((i / 10) | 0) * c + 1, c - 2, c - 2);
      if (FLAT) continue;
      cx.save(); cx.shadowColor = 'rgba(255,80,40,.9)'; cx.shadowBlur = c * .4;
      cx.fillStyle = '#ff4b33'; cx.beginPath(); cx.arc(x, y + c * .08, c * .13, 0, Math.PI * 2); cx.fill(); cx.restore();
      drawFire(x, y + c * .05, c, now / 1000 + i * 1.7);
    }
  }
}
function drawGridFull(g, key, now){
  const isFoe = key === 'foe';
  const active = state === 'play' && ((isFoe && turn === 'me') || (!isFoe && turn === 'foe'));
  const oppName = mode === 'pvp' ? (pvp ? pvp.oppName : 'Opponent') : 'BDB';
  const title = isFoe ? `${oppName}'s waters` : (state === 'setup' ? 'Your waters' : 'Your fleet');
  drawWater(g, now);
  drawLabels(g, g.big ? title : (isFoe ? 'Target' : 'Your fleet'), active, isFoe);
  const c = g.cell;
  // ships
  if (FLAT){} else if (key === 'me'){
    const ships = state === 'setup' || state === 'menu' ? setupShips.filter(s => s.placed && !(drag && drag.ship === s)) : (my ? my.ships : []);
    for (const s of ships){
      const sk = vis.sunk.me.get(s.id);
      if (sk){ const k = clamp((gt - sk.t0) / SINK_MS, 0, 1); drawShip(g, s, c, 'mine', k < 1 ? {sink:k, alpha:1 - k * .45} : {wreck:.6, alpha:.6, noFlag:true}); }
      else drawShip(g, s, c, 'mine', {lift: state === 'setup' && setupShips[sel] === s && !drag});
    }
  } else {
    for (const [, v] of vis.sunk.foe){
      const k = clamp((gt - v.t0) / SINK_MS, 0, 1);
      drawShip(g, v.sh, c, 'foe', k < 1 ? {sink:k, alpha:1 - k * .45} : {wreck:.55, alpha:.62, noFlag:true});
    }
    if (state === 'over' && foeReveal){
      for (const s of foeReveal) if (!vis.sunk.foe.has(s.id)) drawShip(g, s, c, 'foe', {alpha:.55 + Math.sin(now / 300) * .08});
    }
  }
  drawPegs(g, key, now);
  // aiming aids on the target grid
  if (isFoe && state === 'play'){
    const mine = turn === 'me' && idle() && !(pvp && pvp.pending) && !paused;
    for (let k = 0; k < marks.length; k++) reticle(g, marks[k], '#f2c14e', String(k + 1), now);
    if (pvp && pvp.pending) for (const i of pvp.pending.cells) reticle(g, i, '#ff8a2b', '', now, true);
    if (mine){
      const hc = kb.on ? kb.r * 10 + kb.c : hover;
      if (hc >= 0){
        const x = g.x + (hc % 10) * c, y = g.y + ((hc / 10) | 0) * c;
        const ok = !view[hc];
        cx.fillStyle = ok ? 'rgba(242,193,78,.16)' : 'rgba(255,90,74,.12)';
        cx.fillRect(x + 1, y + 1, c - 2, c - 2);
        reticle(g, hc, ok ? 'rgba(242,193,78,.95)' : 'rgba(255,120,100,.7)', '', now);
        if (g.big && c >= 24){
          cx.font = `500 ${Math.round(c * .42)}px ${FONT_LED}`; cx.textAlign = 'center'; cx.textBaseline = 'bottom';
          cx.fillStyle = 'rgba(242,193,78,.9)'; cx.fillText(coord(hc), x + c / 2, y - 2);
        }
      }
    }
  }
  if (aim && aim.key === key){
    const k = clamp((gt - aim.t0) / aim.dur, 0, 1), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const fr = aim.from, to = aim.to;
    const ax = (fr % 10) + ((to % 10) - (fr % 10)) * e + .5, ay = ((fr / 10) | 0) + (((to / 10) | 0) - ((fr / 10) | 0)) * e + .5;
    reticleAt(g, g.x + ax * c, g.y + ay * c, c, '#ff5a4a', now);
  }
  // shells
  if (!FLAT) for (const s of shells){
    if (s.key !== key || s.done) continue;
    const k = clamp((gt - s.t0) / s.dur, 0, 1);
    const x = g.x + (s.i % 10 + .5) * c, y = g.y + (((s.i / 10) | 0) + .5) * c;
    cx.strokeStyle = `rgba(255,255,255,${.25 + k * .5})`; cx.lineWidth = 1.5;
    cx.beginPath(); cx.arc(x, y, c * (.55 - k * .3), 0, Math.PI * 2); cx.stroke();
    const h = (1 - k) * c * 3.2, sx = x - (1 - k) * c * .8, sy = y - h;
    cx.fillStyle = 'rgba(0,0,0,.35)'; cx.beginPath(); cx.ellipse(x, y, c * .1 * (.5 + k), c * .06 * (.5 + k), 0, 0, Math.PI * 2); cx.fill();
    cx.strokeStyle = 'rgba(255,220,160,.35)'; cx.lineWidth = Math.max(1, c * .06);
    cx.beginPath(); cx.moveTo(sx - c * .4 * (1 - k), sy - c * .5 * (1 - k)); cx.lineTo(sx, sy); cx.stroke();
    cx.fillStyle = '#20283a'; cx.beginPath(); cx.arc(sx, sy, c * (.08 + (1 - k) * .05), 0, Math.PI * 2); cx.fill();
    cx.fillStyle = 'rgba(255,255,255,.6)'; cx.beginPath(); cx.arc(sx - c * .03, sy - c * .03, c * .03, 0, Math.PI * 2); cx.fill();
  }
  // particles
  if (!FLAT) for (const p of fx){
    if (p.key !== key || p.t < 0) continue;
    const a = clamp(1 - p.t / p.life, 0, 1), x = g.x + p.x * c, y = g.y + p.y * c;
    if (p.kind === 'ring'){ cx.strokeStyle = `rgba(${p.c},${a * .7})`; cx.lineWidth = Math.max(1, c * .05); cx.beginPath(); cx.arc(x, y, (p.s + p.grow * p.t) * c, 0, Math.PI * 2); cx.stroke(); }
    else if (p.kind === 'flash'){ const r = p.s * c * (.5 + p.t / p.life); const gr = cx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,250,220,${a})`); gr.addColorStop(.4, `rgba(255,170,60,${a * .8})`); gr.addColorStop(1, 'rgba(255,80,20,0)'); cx.fillStyle = gr; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill(); }
    else if (p.kind === 'smoke'){ const r = (p.s + p.t * .3) * c; cx.fillStyle = `rgba(${p.dark ? '40,44,56' : '120,130,150'},${a * .45})`; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill(); }
    else if (p.kind === 'bubble'){ cx.strokeStyle = `rgba(200,230,255,${a * .8})`; cx.lineWidth = 1; cx.beginPath(); cx.arc(x, y, p.s * c, 0, Math.PI * 2); cx.stroke(); }
    else if (p.kind === 'debris'){ cx.save(); cx.translate(x, y); cx.rotate(p.rot + p.t * 8); cx.fillStyle = `rgba(30,34,44,${a})`; cx.fillRect(-p.s * c, -p.s * c * .5, p.s * c * 2, p.s * c); cx.restore(); }
    else { cx.globalAlpha = a; cx.fillStyle = p.c; cx.beginPath(); cx.arc(x, y, Math.max(.8, p.s * c), 0, Math.PI * 2); cx.fill(); cx.globalAlpha = 1; }
  }
  // inset hint
  if (!g.big){
    cx.font = `700 9px ${FONT_BODY}`; cx.textAlign = 'right'; cx.textBaseline = 'middle'; cx.fillStyle = 'rgba(143,163,204,.7)';
    cx.fillText('Tap to enlarge', g.x + c * 10, g.y - g.lab - g.hd * .5 + 1);
  }
}
function reticle(g, i, col, label, now, pulse){
  const c = g.cell;
  reticleAt(g, g.x + (i % 10 + .5) * c, g.y + (((i / 10) | 0) + .5) * c, c, col, now, label, pulse);
}
function reticleAt(g, x, y, c, col, now, label = '', pulse = false){
  const r = c * (.36 + (pulse ? Math.sin(now / 120) * .05 : 0));
  cx.strokeStyle = col; cx.lineWidth = Math.max(1.5, c * .06);
  cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.stroke();
  cx.beginPath();
  cx.moveTo(x - r - c * .1, y); cx.lineTo(x - r * .45, y); cx.moveTo(x + r * .45, y); cx.lineTo(x + r + c * .1, y);
  cx.moveTo(x, y - r - c * .1); cx.lineTo(x, y - r * .45); cx.moveTo(x, y + r * .45); cx.lineTo(x, y + r + c * .1);
  cx.stroke();
  if (label){ cx.fillStyle = col; cx.font = `500 ${Math.round(c * .5)}px ${FONT_LED}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(label, x, y + 1); }
}
/* fleet roster: which ships are still afloat */
function drawRoster(g, key){
  if (!g) return;
  const c = g.cell, isFoe = key === 'foe';
  const pip = g.big ? clamp(c * .26, 6, 13) : 7, gap = pip * .25;
  const vertical = !g.big;
  let x = g.x, y = g.y + c * 10 + (g.big ? (LY.phone ? 9 : 12) : 0);
  if (vertical){ x = g.x + c * 10 + 16; y = g.y + 2; }
  const fontPx = g.big ? (LY.phone ? 9 : 10) : 10;
  cx.font = `800 ${fontPx}px ${FONT_BODY}`; cx.textBaseline = 'top'; cx.textAlign = 'left';
  const items = SHIPS.map(d => {
    let sunk, hitsN = 0;
    if (isFoe){ sunk = vis.sunk.foe.has(d.id); hitsN = sunk ? d.len : 0; }
    else {
      sunk = vis.sunk.me.has(d.id);
      const s = my ? my.ships.find(q => q.id === d.id) : null;
      if (s) for (const i of cellsOf(s.r, s.c, s.v, s.len)) if (vis.me[i] === 2) hitsN++;
    }
    return {d, sunk, hitsN, w:Math.max(d.len * (pip + gap), cx.measureText(d.short.toUpperCase()).width + 2)};
  });
  if (!vertical){
    const total = items.reduce((a, b) => a + b.w, 0);
    const space = Math.max(6, (c * 10 - total) / 4);
    for (const it of items){
      for (let k = 0; k < it.d.len; k++){
        cx.fillStyle = it.sunk ? 'rgba(255,90,74,.85)' : k < it.hitsN ? '#ff8a2b' : (isFoe ? '#3a5fa8' : '#a3b1c9');
        cx.beginPath(); cx.roundRect(x + k * (pip + gap), y, pip, pip * .8, 2); cx.fill();
      }
      cx.fillStyle = it.sunk ? 'rgba(255,120,100,.75)' : 'rgba(143,163,204,.9)';
      cx.fillText(it.d.short.toUpperCase(), x, y + pip + 4);
      if (it.sunk){ cx.strokeStyle = 'rgba(255,120,100,.8)'; cx.lineWidth = 1.5; const tw = cx.measureText(it.d.short.toUpperCase()).width; cx.beginPath(); cx.moveTo(x - 1, y + pip + 4 + fontPx * .55); cx.lineTo(x + tw + 1, y + pip + 4 + fontPx * .55); cx.stroke(); }
      x += it.w + space;
    }
  } else {
    const rowH = Math.min(26, (c * 10) / 5);
    for (const it of items){
      cx.fillStyle = it.sunk ? 'rgba(255,120,100,.75)' : 'rgba(200,212,235,.9)';
      cx.fillText(it.d.short.toUpperCase(), x, y);
      for (let k = 0; k < it.d.len; k++){
        cx.fillStyle = it.sunk ? 'rgba(255,90,74,.85)' : k < it.hitsN ? '#ff8a2b' : (isFoe ? '#3a5fa8' : '#a3b1c9');
        cx.beginPath(); cx.roundRect(x + k * (pip + gap), y + fontPx + 3, pip, pip * .7, 2); cx.fill();
      }
      y += rowH;
    }
  }
}
function drawTray(now){
  const T = LY.tray; if (!T) return;
  cx.textAlign = 'left'; cx.textBaseline = 'middle';
  for (const sl of LY.slots){
    const s = setupShips.find(q => q.id === sl.id);
    const d = SHIP_BY_ID[sl.id];
    const active = setupShips[sel] === s;
    cx.font = `800 ${LY.phone ? 9 : 10}px ${FONT_BODY}`;
    cx.fillStyle = s.placed ? 'rgba(143,163,204,.45)' : active ? '#f2c14e' : 'rgba(200,212,235,.9)';
    cx.fillText(`${SHIPS.indexOf(d) + 1}  ${d.name.toUpperCase()}`, sl.x, sl.labelY);
    const box = {x:sl.x, y:sl.y, w:d.len * sl.tc, h:sl.tc};
    cx.strokeStyle = active ? 'rgba(242,193,78,.6)' : 'rgba(255,255,255,.1)'; cx.setLineDash([4, 4]); cx.lineWidth = 1;
    cx.beginPath(); cx.roundRect(box.x - 2, box.y - 2, box.w + 4, box.h + 4, 6); cx.stroke(); cx.setLineDash([]);
    if (!FLAT && !s.placed && !(drag && drag.ship === s)){
      drawShip({x:sl.x, y:sl.y}, {id:s.id, len:s.len, r:0, c:0, v:false}, sl.tc, 'mine', {lift:active});
    }
  }
  if (LY.phone){
    cx.font = `600 11px ${FONT_BODY}`; cx.fillStyle = 'rgba(143,163,204,.6)'; cx.textAlign = 'right'; cx.textBaseline = 'top';
    const last = LY.slots[4];
    cx.fillText('Drag onto the grid. Tap to rotate.', W - 12, last.y + last.tc + 10);
  } else {
    cx.font = `600 12px ${FONT_BODY}`; cx.fillStyle = 'rgba(143,163,204,.6)'; cx.textAlign = 'left'; cx.textBaseline = 'top';
    cx.fillText('Drag ships onto the grid.', T.x, T.y + T.h + 6);
    cx.fillText('Tap or R to rotate. Arrows move.', T.x, T.y + T.h + 22);
  }
}
function drawDrag(now){
  if (!drag || !drag.moved) return;
  const g = grid('me'), s = drag.ship;
  if (drag.cand){
    const ok = drag.cand.ok;
    for (const i of cellsOf(drag.cand.r, drag.cand.c, s.v, s.len)){
      if (i < 0 || i >= CELLS) continue;
      cx.fillStyle = ok ? 'rgba(74,222,128,.2)' : 'rgba(255,90,74,.25)';
      cx.fillRect(g.x + (i % 10) * g.cell + 1, g.y + ((i / 10) | 0) * g.cell + 1, g.cell - 2, g.cell - 2);
    }
    const inb = drag.cand.inb;
    if (FLAT) return;
    if (inb) drawShip(g, {id:s.id, len:s.len, r:drag.cand.r, c:drag.cand.c, v:s.v}, g.cell, 'mine', {alpha:.92, invalid:!ok, lift:true});
  }
  if (!drag.cand || !drag.cand.inb){
    const c = g.cell, gx = drag.px - (s.v ? .5 : drag.k + .5) * c, gy = drag.py - (s.v ? drag.k + .5 : .5) * c;
    drawShip({x:gx, y:gy}, {id:s.id, len:s.len, r:0, c:0, v:s.v}, c, 'mine', {alpha:.9, lift:true});
  }
}
/* 3D: redraw the flat layer only when something on it changed, then let three.js draw the scene */
let flatSig = '', fontsV = 0;
function flatSignature(now){
  if (aim || (pvp && pvp.pending) || (drag && drag.moved) || paused) return 'a' + now;
  return [W, H, DPR, state, mode, rules, turn, hover, kb.on ? kb.r * 10 + kb.c : -1, marks.join('.'), visVer, sel, swapView, LY.inset, idle() ? 1 : 0,
    setupShips.map(q => q.placed ? `${q.r},${q.c},${q.v ? 1 : 0}` : 'x').join(';'), drag ? 1 : 0, foeReveal ? 1 : 0, pvp ? pvp.oppName : '', fontsV].join('|');
}
function draw(now){
  if (T3){
    const sig = flatSignature(now), changed = sig !== flatSig;
    if (changed){ flatSig = sig; FLAT = true; draw2D(now); }
    T3.render(now, changed);
    return;
  }
  FLAT = false; draw2D(now);
}
function draw2D(now){
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  cx.clearRect(0, 0, W, H);
  if (!FLAT && shake > .3 && !REDUCED) cx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
  for (const key of ['me', 'foe']){ const g = grid(key); if (g){ drawGridFull(g, key, now); if (state !== 'setup' && state !== 'menu') drawRoster(g, key); } }
  if (state === 'setup'){ drawTray(now); drawDrag(now); }
  if (paused){
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx.fillStyle = 'rgba(3,8,20,.62)'; cx.fillRect(0, 0, W, H);
    cx.fillStyle = '#f2c14e'; cx.font = `400 ${LY.phone ? 34 : 48}px "Bowlby One", Impact, sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText('PAUSED', W / 2, H * .45);
    cx.font = `700 14px ${FONT_BODY}`; cx.fillStyle = '#8fa3cc'; cx.fillText('Press P or tap to keep firing', W / 2, H * .45 + 40);
  }
}

/* ---------- setup: drag, rotate, randomize ---------- */
let drag = null;
function setupOcc(skip){
  const occ = new Int8Array(CELLS);
  setupShips.forEach((s, k) => { if (s.placed && s !== skip) for (const i of cellsOf(s.r, s.c, s.v, s.len)) occ[i] = k + 1; });
  return occ;
}
const allPlaced = () => setupShips.every(s => s.placed);
function randomize(){
  if (state !== 'setup' || (pvp && pvp.myH)) return;
  const lay = randomLayout();
  setupShips = lay.map(s => ({...s, placed:true}));
  snd.clunk(); refreshDock(); refreshHud();
}
function clearShips(){
  if (state !== 'setup' || (pvp && pvp.myH)) return;
  setupShips = blankSetup(); sel = 0; BDB.sfx.tick(); refreshDock(); refreshHud();
}
function rotateShip(s){
  if (state !== 'setup' || (pvp && pvp.myH)) return false;
  if (!s.placed){ s.v = !s.v; BDB.sfx.tick(); return true; }
  const nv = !s.v, occ = setupOcc(s);
  let r = s.r, c = s.c;
  if (nv) r = Math.min(r, N - s.len); else c = Math.min(c, N - s.len);
  const tries = [[0, 0], [-1, 0], [0, -1], [1, 0], [0, 1], [-2, 0], [0, -2]];
  for (const [dr, dc] of tries){
    if (canPlace(occ, r + dr, c + dc, nv, s.len)){ s.r = r + dr; s.c = c + dc; s.v = nv; BDB.sfx.tick(); return true; }
  }
  snd.nope(); talk(LN.badSpot); if (!REDUCED) shake = 4;
  return false;
}
function moveSel(dr, dc){
  if (state !== 'setup' || (pvp && pvp.myH)) return;
  const s = setupShips[sel], occ = setupOcc(s);
  if (!s.placed){
    for (let i = 0; i < CELLS; i++){ const r = (i / 10) | 0, c = i % 10; if (canPlace(occ, r, c, s.v, s.len)){ s.r = r; s.c = c; s.placed = true; snd.clunk(); break; } }
    refreshDock(); return;
  }
  let r = s.r + dr, c = s.c + dc;
  // hop over other ships in the way
  for (let k = 0; k < 10; k++){
    if (canPlace(occ, r, c, s.v, s.len)){ s.r = r; s.c = c; BDB.sfx.tick(); return; }
    if (r < 0 || c < 0 || r > 9 || c > 9) break;
    r += dr; c += dc;
  }
  snd.nope();
}
function candFor(px, py, d = drag){
  const g = grid('me'), s = d.ship, c = g.cell;
  if (px < g.x - c * .6 || py < g.y - c * .6 || px > g.x + c * 10.6 || py > g.y + c * 10.6) return null;
  const r0 = Math.floor((py - g.y) / c), c0 = Math.floor((px - g.x) / c);
  let r = s.v ? r0 - d.k : r0, cc = s.v ? c0 : c0 - d.k;
  // nudge inside when only slightly hanging off
  if (s.v) r = clamp(r, 0, N - s.len); else cc = clamp(cc, 0, N - s.len);
  r = clamp(r, 0, 9); cc = clamp(cc, 0, 9);
  const ok = canPlace(setupOcc(s), r, cc, s.v, s.len);
  return {r, c:cc, ok, inb:true};
}
function setupDown(px, py, pid){
  if (pvp && pvp.myH) return;
  const g = grid('me');
  let ship = null, k = 0;
  const i = cellAt(g, px, py);
  if (i >= 0){
    const occ = setupOcc(null), o = occ[i];
    if (o){ ship = setupShips[o - 1]; k = ship.v ? ((i / 10) | 0) - ship.r : (i % 10) - ship.c; }
  }
  if (!ship){
    for (const sl of LY.slots){
      const s = setupShips.find(q => q.id === sl.id);
      if (s.placed) continue;
      const w = s.len * sl.tc;
      if (px >= sl.x - 6 && px <= sl.x + w + 6 && py >= sl.y - 10 && py <= sl.y + sl.tc + 10){ ship = s; s.v = false; k = clamp(Math.floor((px - sl.x) / sl.tc), 0, s.len - 1); break; }
    }
  }
  if (!ship) return;
  sel = setupShips.indexOf(ship);
  drag = {ship, k, px, py, sx:px, sy:py, moved:false, pid, from:{placed:ship.placed, r:ship.r, c:ship.c, v:ship.v}, cand:null};
}
function setupMove(px, py){
  if (!drag) return;
  drag.px = px; drag.py = py;
  if (!drag.moved && Math.hypot(px - drag.sx, py - drag.sy) > 6) drag.moved = true;
  if (drag.moved) drag.cand = candFor(px, py);
}
function setupUp(px, py){
  if (!drag) return;
  const d = drag; drag = null;
  const s = d.ship;
  if (!d.moved){
    if (d.from.placed) rotateShip(s);
    refreshDock(); return;
  }
  const cand = candFor(px, py, d);
  if (cand && cand.ok){ s.r = cand.r; s.c = cand.c; s.placed = true; snd.clunk(); if (allPlaced()) talk(LN.ready); }
  else if (cand && !cand.ok){
    snd.nope(); talk(LN.badSpot);
    if (d.from.placed){ s.r = d.from.r; s.c = d.from.c; s.v = d.from.v; s.placed = true; } else s.placed = false;
  } else { s.placed = false; s.v = false; BDB.sfx.tick(); }
  refreshDock(); refreshHud();
}
function rotateDragging(){
  if (drag){ drag.ship.v = !drag.ship.v; drag.k = Math.min(drag.k, drag.ship.len - 1); if (drag.moved) drag.cand = candFor(drag.px, drag.py); BDB.sfx.tick(); return; }
  rotateShip(setupShips[sel]);
}

/* ---------- starting games ---------- */
function blurFocus(){ const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); }
function resetMatchState(){
  resetAnim();
  my = null; foe = null; view = new Int8Array(CELLS); foeSunk = []; foeReveal = null; shooter = null;
  turnNo = 0; marks = []; st = freshStats(); paused = false; winner = null; endInfo = null; lastAim = -1; swapView = false; drag = null; hover = -1;
  vis.me.fill(0); vis.foe.fill(0); vis.sunk.me.clear(); vis.sunk.foe.clear();
  visVer++; if (T3) T3.clear();
}
function loadLayout(){
  try {
    const l = JSON.parse(store.get('fleet-layout'));
    if (validLayout(l)) return SHIPS.map(d => { const s = l.find(q => q.id === d.id); return {id:d.id, len:d.len, r:s.r, c:s.c, v:!!s.v, placed:true}; });
  } catch(e){}
  return blankSetup();
}
function startBdb(){
  exitPvp(); blurFocus();
  mode = 'bdb'; state = 'setup';
  rules = store.get('fleet-rules') === 'salvo' ? 'salvo' : 'classic';
  resetMatchState();
  setupShips = loadLayout(); sel = 0;
  BDB.hideSplash(); BDB.hideEnd();
  applyMode(); online.setStatus('bdb');
  lastTalk = 0;
  talk(LN.setup, {force:true});
}
function ready(){
  if (state !== 'setup' || !allPlaced() || drag || (pvp && pvp.myH)) return;
  const layout = setupShips.map(s => ({id:s.id, len:s.len, r:s.r, c:s.c, v:s.v}));
  store.set('fleet-layout', JSON.stringify(layout));
  my = makeFleet(layout);
  if (mode === 'pvp') return pvpReady(layout);
  foe = makeFleet(randomLayout(Math.random, {noTouch: level.key !== 'rec'}));
  shooter = makeShooter(level.key);
  first = 'me'; turnNo = 0; turn = 'me';
  state = 'play';
  applyMode();
  BDB.shout('FIRE AWAY');
  lastTalk = 0;
  if (rules === 'salvo' && Math.random() < .5) talk(LN.salvo, {force:true});
  else if (Math.random() < .3) roastMaybe(true); else talk(LN.start, {force:true});
  kb.r = 4; kb.c = 4;
}

/* ---------- firing ---------- */
const canAim = () => state === 'play' && turn === 'me' && idle() && !paused && !(pvp && (pvp.pending || pvp.gone));
function aimAt(i){
  if (!canAim() || i < 0 || i >= CELLS) return;
  if (view[i]){ snd.nope(); return; }
  if (rules === 'classic'){ fire([i]); return; }
  const k = marks.indexOf(i);
  if (k >= 0){ marks.splice(k, 1); BDB.sfx.tick(); refreshDock(); return; }
  if (marks.length >= allowed('me')){ snd.nope(); return; }
  marks.push(i); BDB.sfx.tick();
  refreshDock();
}
function fireMarks(){
  if (!canAim() || rules !== 'salvo') return;
  if (marks.length < allowed('me')){ snd.nope(); BDB.shout(`${allowed('me') - marks.length} MORE`, true); return; }
  fire(marks.slice());
}
function fire(cells){
  cells = [...new Set(cells)].filter(i => Number.isInteger(i) && i >= 0 && i < CELLS && !view[i]);
  if (!cells.length || cells.length !== allowed('me')) return;
  marks = [];
  if (mode === 'pvp'){ pvpShoot(cells); refreshDock(); return; }
  const res = cells.map(i => answerShot(foe, i));
  myResults(res);
}
/* results of my shots, from BDB's fleet or from the other player's answers */
function myResults(res){
  const before = st.streak;
  for (const a of res){
    st.shots++;
    if (a.r === 'miss'){ view[a.i] = 1; st.streak = 0; st.cold++; }
    else { view[a.i] = 2; st.hits++; st.streak++; st.cold = 0; st.best = Math.max(st.best, st.streak); }
    if (a.r === 'sunk'){ for (const c of a.cells) view[c] = 3; foeSunk.push({id:a.ship, cells:a.cells.slice()}); }
  }
  const won = foeSunk.length >= 5;
  turnNo++;
  turn = won ? 'me' : ownerOf(turnNo);
  enqueue(done => volley('foe', res, () => { refreshHud(); commentMine(res, before); done(); }));
  if (won) whenIdle(() => finish('win'));
  else if (mode === 'bdb') whenIdle(() => after(REDUCED ? 150 : 420, bdbTurn));
  refreshHud(); refreshDock();
}
function commentMine(res, before){
  if (state !== 'play') return;
  const sunk = res.filter(a => a.r === 'sunk'), hitsN = res.filter(a => a.r !== 'miss').length;
  if (mode === 'pvp'){
    const me = myName(), them = pvp.oppName;
    if (sunk.length) return talk(LN.pvSink, {force:true, args:[me, them, SNAME(sunk[sunk.length - 1].ship)]});
    if (hitsN) return talk(LN.pvHit, {args:[me, them]});
    if (Math.random() < .3) talk(LN.pvMiss, {args:[me, them]});
    return;
  }
  if (sunk.length){ const s = sunk[sunk.length - 1]; if (foeSunk.length < 5) talk(LN.youSink[s.ship], {force:true}); return; }
  if (hitsN && st.streak >= 3 && before < 3) return talk(LN.youStreak, {force:true});
  if (hitsN) return talk(LN.youHit, {force: st.hits === hitsN});
  if (st.cold >= 5 && st.cold - res.length < 5) return talk(LN.youCold, {force:true});
  if (foe && res.some(a => a.r === 'miss' && nearShip(foe, a.i)) && Math.random() < .55) return talk(LN.youNear);
  if (st.shots >= 12 && st.shots % 14 < res.length) return roastMaybe();
  if (Math.random() < .3) talk(LN.youMiss);
}
function bdbTurn(){
  if (state !== 'play' || mode !== 'bdb' || turn !== 'foe') return;
  if (paused){ after(300, bdbTurn); return; }
  const n = allowed('foe');
  const cells = shooter.pick(n);
  if (level.key === 'd1' && Math.random() < .12) talk(LN.think);
  const res = cells.map(i => { const a = answerShot(my, i); shooter.record(i, a.r, a.r === 'sunk' ? {id:a.ship, cells:a.cells} : null); return a; });
  foeResults(res, true);
}
function foeResults(res, aimFirst){
  const before = st.foeStreak;
  for (const a of res){
    st.foeShots++;
    if (a.r === 'miss') st.foeStreak = 0; else { st.foeHits++; st.foeStreak++; }
  }
  const lost = afloat(my) === 0;
  turnNo++;
  turn = lost ? 'foe' : ownerOf(turnNo);
  enqueue(done => volley('me', res, () => { refreshHud(); commentFoe(res, before); done(); }, aimFirst));
  if (lost) whenIdle(() => finish('loss'));
  else if (mode === 'pvp' && turn === 'foe') {} // waiting on them
  refreshHud(); refreshDock();
}
function commentFoe(res, before){
  if (state !== 'play') return;
  const sunk = res.filter(a => a.r === 'sunk'), hitsN = res.filter(a => a.r !== 'miss').length;
  if (mode === 'pvp'){
    const me = myName(), them = pvp.oppName;
    if (sunk.length) return talk(LN.pvSink, {force:true, args:[them, me, SNAME(sunk[sunk.length - 1].ship)]});
    if (hitsN) return talk(LN.pvHit, {args:[them, me]});
    if (Math.random() < .25) talk(LN.pvMiss, {args:[them, me]});
    return;
  }
  if (sunk.length){ if (afloat(my) > 0) talk(LN.bdbSink, {force:true, args:[SNAME(sunk[sunk.length - 1].ship)]}); return; }
  if (hitsN && st.foeStreak >= 3 && before < 3) return talk(LN.bdbStreak, {force:true});
  if (hitsN){ if (Math.random() < .7) talk(LN.bdbHit); return; }
  if (res.some(a => nearShip(my, a.i)) && Math.random() < .5) return talk(LN.bdbNear);
  if (Math.random() < .3) talk(LN.bdbMiss);
}

/* ---------- endings ---------- */
function loadRecord(){ try { return JSON.parse(store.get('fleet-record')) || {}; } catch(e){ return {}; } }
function recOf(all, key){ return Object.assign({w:0, l:0, streak:0, best:0}, all[key] || {}); }
const acc = () => st.shots ? st.hits / st.shots : 0;
function finish(reason){
  if (state === 'over' || state === 'menu') return;
  const wasSetup = state === 'setup';
  state = 'over'; marks = []; paused = false; drag = null;
  if (mode === 'bdb'){ foeReveal = foe ? foe.ships : null; }
  online.setStatus('idle');
  if (mode === 'bdb') finishBdb(reason);
  else finishPvp(reason, wasSetup);
  applyMode();
}
function finishBdb(reason){
  const all = loadRecord(), rec = recOf(all, level.key);
  const a = acc(), left = afloat(my);
  const stats = [['Shots', String(st.shots)], ['Hits', String(st.hits)], ['Accuracy', Math.round(a * 100) + '%'], ['Afloat', `${left}/5`]];
  let scores = null, title, line, eyebrow;
  winner = reason === 'win' ? 'me' : 'foe';
  if (reason === 'win'){
    rec.w++; rec.streak = Math.max(1, rec.streak + 1); rec.best = Math.max(rec.best, rec.streak);
    const score = Math.round((a * 1000 + left * 150) * level.mult);
    lastScore = score;
    scores = BDB.addScore(score);
    stats.push(['Score', BDB.fmt(score)]);
    eyebrow = 'Fleet destroyed'; title = scores.isBest ? 'New best. BDB sunk' : 'You sank BDB';
    line = lineFrom(left === 5 ? LN.youWinClean : LN.youWin);
    BDB.shout('VICTORY'); scores.isBest ? BDB.sfx.big() : BDB.sfx.good(); confetti();
  } else {
    rec.l++; rec.streak = 0;
    eyebrow = 'Fleet lost'; title = 'BDB sank you';
    line = lineFrom(LN.bdbWin);
    BDB.shout('BDB WINS', true); BDB.sfx.bad(); if (!REDUCED) shake = 10;
  }
  if (rec.streak > 1) stats.push(['Streak', String(rec.streak)]);
  all[level.key] = rec; store.set('fleet-record', JSON.stringify(all));
  if (!scores){ const l = BDB.scores(); scores = l.length ? {rank:-1, isBest:false, list:l} : null; }
  BDB.say(line); lastTalk = Date.now();
  setBest();
  const recLine = `Record vs BDB on ${level.name}${rules === 'salvo' ? '' : ''}: ${rec.w}W ${rec.l}L` + (rec.best > 1 ? ` · best streak ${rec.best}` : '');
  showEnd({eyebrow, title, line, stats, scores, rec:recLine,
    recSmall:`Score = accuracy × 1000 + 150 per ship still afloat, times the level (Rec ×1, Varsity ×1.6, D1 ×2.5). Only wins count.`});
  if (reason !== 'win' && Math.random() < .5) setTimeout(() => { if (state === 'over') BDB.roast(); }, 3600);
}
function confetti(){
  if (REDUCED) return;
  const g = grid('foe') || grid('me'); if (!g) return;
  for (let k = 0; k < 90; k++) spawn({key:g.key, kind:'spark', x:Math.random() * 10, y:Math.random() * 3, vx:(Math.random() - .5) * 4, vy:-2 - Math.random() * 3, t:0, life:1.4 + Math.random(), s:.06 + Math.random() * .06, c:pick(['#f2c14e', '#ff8a2b', '#ffffff', '#6aa2ff', '#4ade80']), grav:true});
}
let endInfo = null;
function showEnd(o){
  endInfo = o;
  const delay = REDUCED ? 200 : 1300;
  setTimeout(() => {
    if (state !== 'over') return;
    BDB.showEnd({eyebrow:o.eyebrow, title:o.title, line:o.line, stats:o.stats, scores:o.scores});
    paintEndRec();
    paintEnd();
  }, delay);
}
function paintEndRec(){
  const el = $('endRec'), o = endInfo;
  if (!o){ el.hidden = true; return; }
  el.innerHTML = '';
  if (o.rec){ el.appendChild(document.createTextNode(o.rec)); }
  if (mode === 'pvp' && pvp){
    const v = document.createElement('span');
    const vd = pvp.verdict;
    v.className = vd === 'ok' ? 'fair' : vd && vd !== 'wait' ? 'unfair' : '';
    v.textContent = verdictText();
    if (o.rec) el.appendChild(document.createElement('br'));
    el.appendChild(v);
  }
  if (o.recSmall){ const s = document.createElement('small'); s.textContent = o.recSmall; el.appendChild(s); }
  el.hidden = !el.childNodes.length;
}
function paintEnd(){
  const again = $('again'), menu = $('endMenu');
  if (mode === 'bdb'){ again.textContent = 'Run it back'; again.disabled = false; menu.textContent = 'Change level'; return; }
  menu.textContent = 'Back to lobby';
  const p = pvp || {gone:true};
  again.disabled = !!p.gone || p.rematch === 'sent';
  again.textContent = p.gone ? 'Opponent left' : p.rematch === 'sent' ? 'Waiting…' : p.rematch === 'got' ? 'Accept rematch' : 'Rematch';
}

/* =========================================================
   Online 1v1. Fleets never cross the wire up front.
   1. Ready: each side sends SHA-256(layout text + random salt).
   2. Shots go one way, answers come back (miss / hit / sunk + that ship's squares).
   3. At the end both reveal layout + salt; each side checks the hash and replays every answer it got.
   ========================================================= */
const myName = () => clean(online && online.name, 24) || 'You';
function randHex(n){ return Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join(''); }
async function sha256(text){
  if (!(window.crypto && crypto.subtle)) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}
function startMatch({mid, myColor, tc, oppName}){
  const nm = clean(oppName, 24) || 'Opponent';
  const same = pvp && pvp.oppName === nm;
  if (!same){ $('feed').innerHTML = ''; tally = {me:0, them:0}; }
  clearInterval(pvp && pvp.resend);
  mode = 'pvp'; state = 'setup';
  rules = tc === 'salvo' ? 'salvo' : 'classic';
  resetMatchState();
  first = myColor === 'w' ? 'me' : 'foe'; turn = first;
  pvp = {mid, oppName:nm, rules, myH:null, oppH:null, acked:false, salt:null, layout:null,
    answersGot:[], answered:new Map(), log:[], pending:null, gone:false, rematch:null, reveal:null, revealSent:false, verdict:null, flags:0, resend:null};
  setupShips = loadLayout(); sel = 0;
  $('splash').hidden = true; BDB.hideEnd(); blurFocus();
  applyMode();
  post('sys', `Online · You vs ${nm} · ${rules === 'salvo' ? 'Salvo' : 'Classic'} · You fire ${first === 'me' ? 'first' : 'second'}`);
  lastTalk = 0;
  talk(LN.pvStart, {force:true, args:[myName(), nm]});
  BDB.shout('HIDE YOUR FLEET');
  pvp.resend = setInterval(pvpTick, 2500);
}
function send(t, d){ online.send(t, d); }
async function pvpReady(layout){
  const p = pvp; if (!p || p.myH) return;
  p.layout = layout; p.salt = randHex(16);
  p.myH = 'pending';
  refreshDock(); refreshHud();
  const h = await sha256(layoutText(layout, p.salt));
  if (pvp !== p || state !== 'setup') return;
  p.myH = h || 'none';
  send('ready', {h:p.myH, got:!!p.oppH});
  post('sys', 'Fleet sealed. Fingerprint sent');
  talk(LN.ready, {force:true});
  maybeBegin();
  refreshDock(); refreshHud();
}
function maybeBegin(){
  const p = pvp;
  if (!p || state !== 'setup' || !p.myH || p.myH === 'pending' || !p.oppH) return;
  state = 'play'; turnNo = 0; turn = ownerOf(0);
  applyMode();
  BDB.shout(turn === 'me' ? 'YOU FIRE FIRST' : 'THEY FIRE FIRST');
  post('sys', turn === 'me' ? 'Both fleets sealed. You fire first' : `Both fleets sealed. ${p.oppName} fires first`);
}
function pvpTick(){
  const p = pvp; if (!p || mode !== 'pvp') return;
  if (state === 'setup' && p.myH && p.myH !== 'pending' && !p.acked) send('ready', {h:p.myH, got:!!p.oppH});
  if (state === 'play' && p.pending){ p.pending.tries++; if (p.pending.tries <= 8) send('shot', {t:p.pending.t, cells:p.pending.cells}); else if (p.pending.tries === 9) send('sync-req', {n:turnNo}); }
  if (state === 'over' && p.revealSent && !p.reveal && p.revealTries < 4 && !p.gone){ p.revealTries++; send('reveal', p.revealMsg); }
}
function pvpShoot(cells){
  const p = pvp;
  p.pending = {t:turnNo, cells, tries:0};
  send('shot', {t:turnNo, cells});
  snd.whistle();
  refreshHud();
}
function flag(text){ if (!pvp) return; pvp.flags++; post('sys', text, null, null, 'bad'); }
function validCells(arr, max){
  return Array.isArray(arr) && arr.length >= 1 && arr.length <= max && arr.every(i => Number.isInteger(i) && i >= 0 && i < CELLS) && new Set(arr).size === arr.length;
}
function onShot(d){
  const p = pvp, t = d.t, cells = d.cells;
  if (!Number.isInteger(t) || t < 0 || t > 400 || !validCells(cells, 5)) return;
  p.acked = true;
  const prev = p.answered.get(t);
  if (prev){
    if (prev.cells.join() === cells.join()) send('answer', {t, res:prev.res});
    else flag(`${p.oppName} tried to change an old shot. Ignored`);
    return;
  }
  if (state === 'setup'){ if (p.myH && p.myH !== 'pending') send('ready', {h:p.myH, got:!!p.oppH}); return; }
  if (state !== 'play') return;
  if (t !== turnNo || ownerOf(t) !== 'foe'){ if (t > turnNo) send('sync-req', {n:turnNo}); return; }
  const need = allowed('foe');
  if (cells.length !== need || cells.some(i => my.shot[i])){ flag(`Bad shot from ${p.oppName} ignored`); send('sync-req', {n:turnNo}); return; }
  const res = cells.map(i => answerShot(my, i));
  p.answered.set(t, {cells:cells.slice(), res});
  p.log.push({t, by:'foe', cells:cells.slice(), res});
  send('answer', {t, res});
  foeResults(res, false);
}
function checkAnswer(cells, res){
  if (!Array.isArray(res) || res.length !== cells.length) return null;
  const v2 = view.slice(), sunkIds = new Set(foeSunk.map(s => s.id)), out = [];
  for (let k = 0; k < res.length; k++){
    const a = res[k];
    if (!a || typeof a !== 'object' || a.i !== cells[k] || !['miss', 'hit', 'sunk'].includes(a.r)) return null;
    if (a.r === 'miss'){ v2[a.i] = 1; out.push({i:a.i, r:'miss'}); continue; }
    v2[a.i] = 2;
    if (a.r === 'hit'){ out.push({i:a.i, r:'hit'}); continue; }
    const def = SHIP_BY_ID[a.ship];
    if (!def || sunkIds.has(a.ship) || !validCells(a.cells, 5) || a.cells.length !== def.len || !a.cells.includes(a.i)) return null;
    const s = a.cells.slice().sort((x, y) => x - y), step = s.length > 1 ? s[1] - s[0] : 1;
    if (step !== 1 && step !== 10) return null;
    for (let j = 1; j < s.length; j++) if (s[j] - s[j - 1] !== step) return null;
    if (step === 1 && ((s[0] / 10) | 0) !== ((s[s.length - 1] / 10) | 0)) return null;
    if (s.some(i => v2[i] !== 2)) return null;
    for (const i of s) v2[i] = 3;
    sunkIds.add(a.ship);
    out.push({i:a.i, r:'sunk', ship:a.ship, cells:s});
  }
  return out;
}
function onAnswer(d){
  const p = pvp;
  if (!p.pending || d.t !== p.pending.t || state !== 'play') return;
  const res = checkAnswer(p.pending.cells, d.res);
  if (!res){ flag(`${p.oppName}'s answer didn't add up`); finish('cheat'); return; }
  p.pending = null; p.acked = true;
  p.answersGot.push(...res);
  p.log.push({t:d.t, by:'me', cells:res.map(a => a.i), res});
  myResults(res);
  if (foeSunk.length < 5 && freeCount(view) === 0){ flag('Every square is shot and their fleet is still afloat'); whenIdle(() => finish('cheat')); }
}
function onSync(d){
  const p = pvp;
  if (!Array.isArray(d.log) || d.log.length > 400) return;
  for (const e of d.log){
    if (!e || !Number.isInteger(e.t) || e.t < turnNo) continue;
    if (e.t !== turnNo) break;
    if (e.by === 'foe' && p.pending && p.pending.t === e.t) onAnswer({t:e.t, res:e.res});       // they answered me
    else if (e.by === 'me' && ownerOf(e.t) === 'foe') onShot({t:e.t, cells:e.cells});          // they shot me
    else break;
  }
  // if they're behind, replay what they missed
  if (Number.isInteger(d.n) && d.n < turnNo) for (const e of p.log) if (e.t >= d.n && e.by === 'foe') send('answer', {t:e.t, res:e.res});
}
async function onReveal(d){
  const p = pvp;
  if (p.reveal || !d || !Array.isArray(d.ships) || typeof d.salt !== 'string' || d.salt.length > 64) return;
  const ships = d.ships.slice(0, 5).map(s => ({id:String(s && s.id), r:s && s.r, c:s && s.c, v:!!(s && s.v), len:(SHIP_BY_ID[s && s.id] || {}).len}));
  p.reveal = {ships, salt:d.salt};
  let verdict = 'ok';
  if (!validLayout(ships)) verdict = 'layout';
  else {
    const h = await sha256(layoutText(ships, d.salt));
    if (!p.oppH || p.oppH === 'none' || !h) verdict = 'nohash';
    else if (h !== p.oppH) verdict = 'hash';
    else if (auditAnswers(ships, p.answersGot)) verdict = 'answers';
  }
  if (pvp !== p) return;
  p.verdict = verdict;
  if (verdict !== 'layout') foeReveal = ships.map(s => ({...s}));
  post('sys', verdictText(), null, null, verdict === 'ok' ? 'good' : 'bad');
  if (state === 'over') paintEndRec();
}
function verdictText(){
  const p = pvp; if (!p) return '';
  const o = p.oppName;
  switch (p.verdict){
    case 'ok': return `Verified fair. ${o}'s fleet matches the sealed fingerprint and every answer checks out.`;
    case 'hash': return `Fair-play check failed: ${o}'s fleet doesn't match the fingerprint they sealed.`;
    case 'answers': return `Fair-play check failed: some of ${o}'s answers don't match their fleet.`;
    case 'layout': return `Fair-play check failed: ${o} revealed an impossible fleet.`;
    case 'nohash': return `Couldn't run the fair-play check (no fingerprint from ${o}).`;
    default: return p.revealSent ? `Checking ${o}'s fleet…` : '';
  }
}
function sendReveal(){
  const p = pvp;
  if (!p || p.revealSent || !p.layout || !p.myH || p.myH === 'pending') return;
  p.revealSent = true; p.revealTries = 0;
  p.revealMsg = {ships:p.layout.map(s => ({id:s.id, r:s.r, c:s.c, v:s.v})), salt:p.salt};
  send('reveal', p.revealMsg);
}
let tally = {me:0, them:0};
function finishPvp(reason, wasSetup){
  const o = pvp ? pvp.oppName : 'Opponent';
  let title, line, eyebrow = 'Fleet destroyed', w = 0;
  if (reason === 'win'){ w = 1; title = `You beat ${o}`; line = lineFrom(LN.pvWin, [myName(), o]); }
  else if (reason === 'loss'){ w = 2; eyebrow = 'Fleet lost'; title = `${o} wins`; line = lineFrom(LN.pvWin, [o, myName()]); }
  else if (reason === 'resign-me'){ w = 2; eyebrow = 'Resigned'; title = `${o} wins`; line = `You struck your colours. BDB respects it. He's been cut before too.`; }
  else if (reason === 'resign-opp'){ w = 1; eyebrow = 'Resigned'; title = `You beat ${o}`; line = `${o} surrendered the fleet. Didn't even make it to the final buzzer.`; }
  else if (reason === 'left'){ w = 1; eyebrow = 'Opponent left'; title = `You beat ${o}`; line = `${o} abandoned ship. BDB calls that a forfeit. He'd know.`; }
  else if (reason === 'cheat'){ w = 1; eyebrow = 'Fair-play stop'; title = `Match stopped`; line = `${o}'s answers stopped adding up. BDB has called a timeout on the whole ocean.`; send('stop', {}); }
  else if (reason === 'stopped'){ w = 2; eyebrow = 'Fair-play stop'; title = `Match stopped`; line = `${o} says your answers didn't add up. Both fleets get checked now.`; }
  winner = w === 1 ? 'me' : w === 2 ? 'foe' : null;
  if (w === 1){ tally.me++; BDB.shout(reason === 'win' ? 'VICTORY' : 'W'); BDB.sfx.big(); confetti(); }
  else if (w === 2){ tally.them++; BDB.shout(reason === 'loss' ? 'SUNK' : 'L', true); BDB.sfx.bad(); }
  BDB.say(line, 'BDB on the radio'); lastTalk = Date.now();
  post('sys', `${eyebrow} · ${title}`);
  post('bdb', line, 'BDB · Final');
  if (pvp){ pvp.rematch = null; pvp.pending = null; }
  if (reason !== 'left' && !wasSetup) sendReveal();
  const stats = [['Shots', String(st.shots)], ['Accuracy', st.shots ? Math.round(acc() * 100) + '%' : '-'], ['You', String(tally.me)], [o.slice(0, 12), String(tally.them)]];
  showEnd({eyebrow, title, line, stats, scores:null, rec:null});
}
function onRemote(t, d){
  if (mode !== 'pvp' || !pvp || !d || typeof d !== 'object') return;
  const p = pvp, o = p.oppName;
  switch (t){
    case 'ready': {
      if (typeof d.h !== 'string' || !/^([0-9a-f]{64}|none)$/.test(d.h)) return;
      if (p.oppH && p.oppH !== d.h){ flag(`${o} tried to swap fleets after sealing. Ignored`); return; }
      const fresh = !p.oppH;
      p.oppH = d.h;
      if (d.got) p.acked = true;
      if (p.myH && p.myH !== 'pending' && !d.got) send('ready', {h:p.myH, got:true});
      if (fresh){ post('sys', `${o}'s fleet is sealed`); refreshHud(); }
      maybeBegin(); refreshHud();
      break;
    }
    case 'shot': onShot(d); break;
    case 'answer': onAnswer(d); break;
    case 'sync-req': send('sync', {n:turnNo, log:p.log.map(e => ({t:e.t, by:e.by, cells:e.cells, res:e.res}))}); break;
    case 'sync': onSync(d); break;
    case 'reveal': onReveal(d); break;
    case 'chat': {
      const text = typeof d.text === 'string' ? clean(d.text, 140) : '';
      if (text){ post('opp', text, o, o); peekMsg(o, text); }
      break;
    }
    case 'resign': if (state === 'play' || state === 'setup') finish('resign-opp'); break;
    case 'stop': if (state === 'play') finish('stopped'); break;
    case 'leave':
      if (state === 'play' || state === 'setup'){ p.gone = true; finish('left'); }
      else { p.gone = true; post('sys', `${o} left`); paintEnd(); }
      break;
    case 'rematch':
      if (state !== 'over') break;
      if (p.rematch === 'sent'){ online.acceptRematch(); break; }
      p.rematch = 'got'; paintEnd();
      post('sys', `${o} wants a rematch`);
      online.toast({title:`${o} wants a rematch`, sub:'Who fires first swaps.', timeout:30000, actions:[
        {label:'Run it back', primary:true, fn:() => { if (mode === 'pvp' && pvp && state === 'over') online.acceptRematch(); }},
        {label:'No thanks', fn:() => {}}
      ]});
      break;
  }
}
function oppLeft(){
  if (mode !== 'pvp' || !pvp) return;
  pvp.gone = true;
  if (state === 'play' || state === 'setup') finish('left');
  else { post('sys', `${pvp.oppName} left`); paintEnd(); }
}
function exitPvp(){
  if (mode !== 'pvp' || !pvp) return;
  if (state === 'play' || state === 'setup') send('resign', {});
  clearInterval(pvp.resend);
  online.leaveMatch();
  pvp = null; mode = 'bdb'; state = 'menu';
  closeChat();
}
function showMenu(){
  exitPvp();
  resetMatchState();
  mode = 'bdb'; state = 'menu'; BDB.hideEnd(); BDB.showSplash();
  setupShips = blankSetup();
  online.setStatus('idle');
  paintSplash(); applyMode();
}

// online.js keeps its prefs in 'cc-online' (shared with chess). Give Sink BDB its own copy so rules don't leak into chess.
const onStore = {
  get: k => store.get(k === 'cc-online' ? 'fleet-online' : k),
  set: (k, v) => store.set(k === 'cc-online' ? 'fleet-online' : k, v)
};
try { const pr = JSON.parse(store.get('fleet-online') || '{}'); if (!['classic', 'salvo'].includes(pr.tc)){ pr.tc = 'classic'; pr.color = pr.color || 'r'; store.set('fleet-online', JSON.stringify(pr)); } } catch(e){ store.set('fleet-online', JSON.stringify({tc:'classic', color:'r'})); }
const online = initOnline({
  store:onStore, lobbyRoom:'fleet',
  tcName: tc => tc === 'salvo' ? 'Salvo rules' : 'Classic rules',
  tcOptions: () => [['classic', 'Classic'], ['salvo', 'Salvo']],
  validTc: tc => tc === 'salvo' ? 'salvo' : 'classic',
  isOver: () => mode !== 'pvp' || (state !== 'play' && state !== 'setup'),
  startMatch, remote:onRemote, oppLeft,
  ping: () => BDB.sfx.pop()
});
// the shared lobby talks in chess colours; translate them
const RENAME = [[/You play White/g, 'You fire first'], [/You play Black/g, 'You fire second'], [/Random colors/g, 'Random first shot']];
function fixText(root){
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), hits = [];
  while (w.nextNode()) if (/White|Black|colors/.test(w.currentNode.nodeValue)) hits.push(w.currentNode);
  for (const n of hits){ let v = n.nodeValue; for (const [re, s] of RENAME) v = v.replace(re, s); if (v !== n.nodeValue) n.nodeValue = v; }
}
const relabel = () => { $('onColor').querySelectorAll('button').forEach(b => { const t = {r:'Random', w:'Me first', b:'Them first'}[b.dataset.v]; if (t && b.textContent !== t) b.textContent = t; }); };
const mo = new MutationObserver(() => { fixText($('toasts')); fixText($('onInviteMeta')); relabel(); });
mo.observe($('toasts'), {childList:true, subtree:true, characterData:true});
mo.observe($('onInviteMeta'), {childList:true, subtree:true, characterData:true});
mo.observe($('onColor'), {childList:true, subtree:true});
relabel();

/* ---------- chat ---------- */
const feed = $('feed'), pane = $('pane');
function post(kind, text, meta, who, tone){
  const li = document.createElement('li');
  if (kind === 'sys'){ li.className = 'msg event' + (tone ? ' ' + tone : ''); li.innerHTML = '<span class="ev"></span>'; li.querySelector('.ev').textContent = text; }
  else {
    li.className = 'msg' + (kind === 'you' ? ' you' : kind === 'opp' ? ' oppmsg' : '');
    li.innerHTML = (kind === 'you' ? '' : '<span class="mav" aria-hidden="true"></span>') + '<div class="mb"><span class="meta"></span><span class="t"></span></div>';
    if (kind === 'opp'){ const m = li.querySelector('.mav'); m.classList.add('opp'); m.textContent = initials(who || '?'); }
    li.querySelector('.meta').textContent = meta || ''; li.querySelector('.t').textContent = text;
  }
  feed.appendChild(li);
  while (feed.children.length > 150) feed.firstChild.remove();
  pane.scrollTop = pane.scrollHeight;
}
const chatVisible = () => !$('chat').hidden && (chatSideMQ.matches || $('chat').classList.contains('open'));
let peekT = null;
function peekMsg(who, text){
  if (chatVisible()) return;
  $('chatDot').hidden = false;
  $('peekWho').textContent = who; $('peekText').textContent = text;
  $('peek').hidden = false; clearTimeout(peekT);
  peekT = setTimeout(() => { $('peek').hidden = true; }, 4500);
}
function openChat(){ $('chat').classList.add('open'); $('chatDot').hidden = true; $('peek').hidden = true; pane.scrollTop = pane.scrollHeight; }
function closeChat(){ $('chat').classList.remove('open'); }
$('chatBtn').onclick = () => { if ($('chat').classList.contains('open')) closeChat(); else openChat(); };
$('chatClose').onclick = closeChat;
$('peek').onclick = openChat;
$('chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const inp = $('chatIn'), text = clean(inp.value, 140);
  if (!text || mode !== 'pvp' || !pvp) return;
  send('chat', {text}); post('you', text, 'You'); inp.value = '';
});
const TAUNTS = ['You fire like BDB.', 'Splash.', 'Getting warm…', 'Not even close.', 'Lucky shot.', 'GG', 'Rematch?', 'BDB would’ve found it.'];
let chipLock = 0;
for (const t of TAUNTS){
  const b = document.createElement('button'); b.type = 'button'; b.textContent = t;
  b.onclick = () => { if (Date.now() < chipLock || mode !== 'pvp' || !pvp) return; chipLock = Date.now() + 1200; send('chat', {text:t}); post('you', t, 'You'); };
  $('chips').appendChild(b);
}

/* ---------- HUD + dock ---------- */
function setBest(){ $('best').textContent = BDB.fmt((BDB.scores()[0] || {s:0}).s); }
function applyMode(){
  const on = mode === 'pvp';
  document.body.classList.toggle('pvp', on);
  $('say').classList.toggle('announcer', on);
  $('chat').hidden = !on; if (!on) closeChat();
  $('peek').hidden = true; if (!on) $('chatDot').hidden = true;
  layout(); refreshDock(); refreshHud();
}
function show(id, v){ $(id).hidden = !v; }
function refreshDock(){
  const setup = state === 'setup', play = state === 'play' || state === 'over', on = mode === 'pvp';
  const locked = !!(pvp && pvp.myH);
  show('rotBtn', setup); show('randBtn', setup); show('clearBtn', setup); show('readyBtn', setup);
  $('readyBtn').disabled = !allPlaced() || locked;
  $('rotBtn').disabled = $('randBtn').disabled = $('clearBtn').disabled = locked;
  $('readyBtn').querySelector('span').textContent = locked ? 'Sealed' : 'Ready';
  show('fireBtn', play && rules === 'salvo' && state === 'play');
  const need = state === 'play' ? allowed('me') : 0;
  $('fireLbl').textContent = state === 'play' ? `Fire ${marks.length}/${need}` : 'Fire';
  $('fireBtn').disabled = !(canAim() && marks.length === need);
  show('viewBtn', play && LY.phone);
  $('viewBtn').querySelector('span').textContent = swapView ? 'Target' : 'My fleet';
  show('newBtn', play && !on);
  show('resignBtn', on && (setup || state === 'play'));
  show('chatBtn', on);
  $('menuBtn').querySelector('span').textContent = on ? 'Lobby' : 'Menu';
  const w = on && setup && pvp && pvp.myH && !pvp.oppH;
  $('wait').hidden = !w;
  if (w){ $('waitT').textContent = `Waiting for ${pvp.oppName}`; $('waitS').textContent = 'Your fleet is sealed. They are still placing ships.'; }
}
function refreshHud(){
  const on = mode === 'pvp';
  $('nameAEl').textContent = on ? myName() : 'You';
  $('nameBEl').textContent = on ? (pvp ? pvp.oppName : 'Opponent') : 'BDB';
  $('lvlBadge').textContent = on ? (rules === 'salvo' ? 'Salvo' : 'Live') : level.short + (rules === 'salvo' ? ' · S' : '');
  const dB = $('discB');
  if (on){ dB.className = 'pdisc ini'; dB.textContent = initials(pvp ? pvp.oppName : '?'); }
  else { dB.className = 'pdisc n'; dB.textContent = ''; }
  $('discA').textContent = on ? initials(myName()) : '';
  $('shipsA').textContent = String(state === 'setup' || state === 'menu' ? setupShips.filter(s => s.placed).length : myAfloat());
  $('shipsB').textContent = String(foeAfloat());
  $('hMid').textContent = String(st.shots);
  $('midLbl').textContent = 'Shots';
  let sa = '', sb = '';
  if (state === 'setup'){
    sa = pvp && pvp.myH ? 'Sealed' : allPlaced() ? 'Hit Ready' : 'Deploying';
    sb = on ? (pvp && pvp.oppH ? 'Sealed' : 'Placing') : 'Hiding';
  } else if (state === 'play'){
    if (turn === 'me'){ sa = pvp && pvp.pending ? 'Firing…' : rules === 'salvo' ? `Salvo ×${allowed('me')}` : 'Your shot'; sb = 'Bracing'; }
    else { sa = 'Incoming'; sb = on ? 'Their shot' : 'Aiming…'; }
  } else if (state === 'over'){
    sa = winner === 'me' ? 'Winner' : winner === 'foe' ? 'Sunk' : 'Done'; sb = winner === 'foe' ? 'Winner' : winner === 'me' ? 'Sunk' : 'Done';
  }
  $('subA').textContent = sa; $('subB').textContent = sb;
  $('plateA').classList.toggle('on', state === 'play' && turn === 'me');
  $('plateB').classList.toggle('on', state === 'play' && turn === 'foe');
}

/* ---------- controls ---------- */
function armed(btn, label, fn){
  const sp = btn.querySelector('span');
  if (btn.classList.contains('armed')){ btn.classList.remove('armed'); sp.textContent = btn.dataset.label; fn(); return; }
  btn.dataset.label = sp.textContent; btn.classList.add('armed'); sp.textContent = label;
  setTimeout(() => { if (btn.classList.contains('armed')){ btn.classList.remove('armed'); sp.textContent = btn.dataset.label; } }, 3000);
}
function togglePause(){
  if (mode !== 'bdb' || state !== 'play') return;
  paused = !paused;
  if (paused) BDB.say('Paused. BDB is using this as an extra break.', 'Timeout');
}
$('rotBtn').onclick = rotateDragging;
$('randBtn').onclick = randomize;
$('clearBtn').onclick = clearShips;
$('readyBtn').onclick = ready;
$('fireBtn').onclick = fireMarks;
$('viewBtn').onclick = () => { swapView = !swapView; layout(); refreshDock(); };
$('newBtn').onclick = () => { if (mode === 'bdb') armed($('newBtn'), 'Sure?', startBdb); };
$('resignBtn').onclick = () => {
  if (mode !== 'pvp' || (state !== 'play' && state !== 'setup')) return;
  armed($('resignBtn'), 'Sure?', () => { if (state !== 'play' && state !== 'setup') return; send('resign', {}); finish('resign-me'); });
};
$('menuBtn').onclick = () => {
  if (mode !== 'pvp'){
    if (state === 'play') return armed($('menuBtn'), 'Quit?', showMenu);
    return showMenu();
  }
  if (state === 'over'){ showMenu(); online.openLobby(); return; }
  armed($('menuBtn'), 'Resign?', () => { showMenu(); online.openLobby(); });
};
$('again').onclick = () => {
  if (mode === 'bdb') return startBdb();
  if (!pvp || pvp.gone) return;
  if (pvp.rematch === 'got'){ online.acceptRematch(); return; }
  pvp.rematch = 'sent'; online.offerRematch(); post('sys', 'Rematch offered'); paintEnd();
};
$('endMenu').onclick = () => { if (mode === 'pvp'){ showMenu(); online.openLobby(); } else showMenu(); };
$('mute').onclick = () => { BDB.sfx.toggle(); paintMute(); };
function paintMute(){ const m = BDB.sfx.muted; $('mute').querySelector('.lbl').textContent = m ? 'Sound off' : 'Sound on'; $('muteWave').style.opacity = m ? .15 : 1; }
paintMute();

document.addEventListener('pointerup', e => { const b = e.target.closest && e.target.closest('.k-dk, .k-pill'); if (b) setTimeout(() => b.blur(), 0); });
function local(e){ if (T3) return T3.toLayout(e.clientX, e.clientY); const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
let downAt = null;
cv.addEventListener('pointerdown', e => {
  const [x, y] = local(e);
  if (paused){ togglePause(); return; }
  if (state === 'setup'){ try { cv.setPointerCapture(e.pointerId); } catch(err){} setupDown(x, y, e.pointerId); return; }
  downAt = {x, y, t:performance.now()};
  if (state === 'play'){ hover = cellAt(grid('foe'), x, y); kb.on = false; }
});
cv.addEventListener('pointermove', e => {
  const [x, y] = local(e);
  if (state === 'setup'){ setupMove(x, y); return; }
  if (state === 'play' && e.pointerType === 'mouse'){ const h = cellAt(grid('foe'), x, y); if (h !== hover){ hover = h; if (h >= 0) kb.on = false; } }
});
cv.addEventListener('pointerup', e => {
  const [x, y] = local(e);
  if (state === 'setup'){ setupUp(x, y); return; }
  if (!downAt) return;
  const moved = Math.hypot(x - downAt.x, y - downAt.y) > 14; downAt = null;
  if (state !== 'play' || moved) return;
  const fg = grid('foe'), mg = grid('me');
  if (fg && fg.big){ const i = cellAt(fg, x, y); if (i >= 0){ aimAt(i); if (e.pointerType !== 'mouse') hover = -1; return; } }
  if (LY.phone){
    const small = fg && !fg.big ? fg : mg && !mg.big ? mg : null;
    if (small && cellAt(small, x, y, 14) >= 0){ swapView = !swapView; layout(); refreshDock(); }
  }
});
cv.addEventListener('pointercancel', () => { if (drag){ const d = drag; drag = null; if (d.from.placed){ Object.assign(d.ship, {r:d.from.r, c:d.from.c, v:d.from.v, placed:true}); } } downAt = null; });
cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hover = -1; });

addEventListener('keydown', e => {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (!$('online').hidden){ if (e.key === 'Escape') online.closeLobby(); return; }
  if (e.key === 'Escape' && $('chat').classList.contains('open')){ closeChat(); return; }
  if (!$('splash').hidden){ if (e.key === 'Enter'){ e.preventDefault(); $('play').click(); } return; }
  if (!$('end').hidden){ if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A'){ e.preventDefault(); $('again').click(); } return; }
  const k = e.key;
  if (state === 'setup'){
    if (/^[1-5]$/.test(k)){ sel = +k - 1; BDB.sfx.tick(); return; }
    if (k === 'r' || k === 'R'){ e.preventDefault(); rotateDragging(); refreshDock(); return; }
    const dirs = {ArrowUp:[-1, 0], ArrowDown:[1, 0], ArrowLeft:[0, -1], ArrowRight:[0, 1]};
    if (dirs[k]){ e.preventDefault(); moveSel(...dirs[k]); refreshDock(); refreshHud(); return; }
    if (k === 'Enter' && tag !== 'BUTTON'){ e.preventDefault(); ready(); }
    return;
  }
  if (state !== 'play') return;
  if (k === 'p' || k === 'P'){ e.preventDefault(); togglePause(); return; }
  if (paused) return;
  const dirs = {ArrowUp:[-1, 0], ArrowDown:[1, 0], ArrowLeft:[0, -1], ArrowRight:[0, 1]};
  if (dirs[k]){
    e.preventDefault();
    if (!kb.on && hover >= 0){ kb.r = (hover / 10) | 0; kb.c = hover % 10; }
    kb.on = true; hover = -1;
    kb.r = clamp(kb.r + dirs[k][0], 0, 9); kb.c = clamp(kb.c + dirs[k][1], 0, 9);
    if (LY.phone && swapView){ swapView = false; layout(); refreshDock(); }
    return;
  }
  if (k === 'v' || k === 'V'){ if (LY.phone){ swapView = !swapView; layout(); refreshDock(); } return; }
  if (k === 'f' || k === 'F'){ e.preventDefault(); fireMarks(); return; }
  if (k === 'Enter' || k === ' '){
    if (tag === 'BUTTON') return;
    e.preventDefault();
    const i = kb.on ? kb.r * 10 + kb.c : hover >= 0 ? hover : kb.r * 10 + kb.c;
    kb.on = true; kb.r = (i / 10) | 0; kb.c = i % 10;
    if (rules === 'salvo' && marks.length >= allowed('me') && !marks.includes(i)) fireMarks();
    else aimAt(i);
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'bdb' && state === 'play' && !paused) togglePause(); });

/* ---------- title screen ---------- */
const lvlSeg = $('lvlSeg');
for (const l of LEVELS){
  const b = document.createElement('button'); b.type = 'button'; b.textContent = l.name; b.dataset.key = l.key;
  b.onclick = () => { level = l; store.set('fleet-level', l.key); paintSplash(); refreshHud(); };
  lvlSeg.appendChild(b);
}
$('rulesSeg').querySelectorAll('button').forEach(b => b.onclick = () => { rules = b.dataset.rules; store.set('fleet-rules', rules); paintSplash(); });
function paintSplash(){
  lvlSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.key === level.key));
  const r = store.get('fleet-rules') === 'salvo' ? 'salvo' : 'classic';
  if (mode === 'bdb') rules = r;
  $('rulesSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.rules === r));
  $('lvlNote').textContent = level.note;
  const rec = recOf(loadRecord(), level.key);
  $('splashRec').textContent = rec.w + rec.l ? `Your record vs BDB on ${level.name}: ${rec.w}W ${rec.l}L` : `No games vs BDB on ${level.name} yet.`;
}
$('play').onclick = startBdb;
$('playOnline').onclick = () => online.openLobby();
paintSplash(); setBest(); refreshHud(); refreshDock();

/* ---------- loop ---------- */
let last = performance.now(), smokeT = 0, hudT = 0;
function frame(now){
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (!paused){
    gt += dt * 1000;
    for (let i = 0; i < timers.length; i++){
      if (timers[i].at <= gt){ const t = timers.splice(i, 1)[0]; i--; try { t.fn(); } catch(err){ console.error(err); } }
    }
    for (const s of shells) if (!s.done && gt >= s.t0 + s.dur){ s.done = true; s.onLand(); }
    for (let i = shells.length - 1; i >= 0; i--) if (shells[i].done) shells.splice(i, 1);
    for (let i = fx.length - 1; i >= 0; i--){
      const p = fx[i]; p.t += dt;
      if (p.t >= p.life){ fx.splice(i, 1); continue; }
      if (p.t < 0) continue;
      if (p.vx !== undefined){ p.x += p.vx * dt; p.y += p.vy * dt; }
      if (p.kind === 'drop' || p.kind === 'debris' || p.grav) p.vy += 7 * dt;
      if (p.kind === 'spark' && !p.grav){ p.vx *= .96; p.vy *= .96; }
    }
    // smoke from burning squares
    smokeT -= dt;
    if (smokeT <= 0 && !REDUCED && (state === 'play' || state === 'over')){
      smokeT = .14;
      for (const key of ['me', 'foe']){
        if (!grid(key)) continue;
        const burning = [];
        const sunkCells = new Set(); for (const [, v] of vis.sunk[key]) for (const i of cellsOf(v.sh.r, v.sh.c, v.sh.v, v.sh.len)) sunkCells.add(i);
        for (let i = 0; i < CELLS; i++) if (vis[key][i] === 2 && (!sunkCells.has(i) || Math.random() < .15)) burning.push(i);
        if (burning.length){
          const i = pick(burning);
          spawn({key, kind:'smoke', x:i % 10 + .4 + Math.random() * .2, y:((i / 10) | 0) + .35, vx:.12 + Math.random() * .1, vy:-.45 - Math.random() * .25, t:0, life:1.3 + Math.random() * .7, s:.1 + Math.random() * .06, dark:sunkCells.has(i) ? 0 : .5});
        }
      }
    }
    shake *= Math.pow(.015, dt);
  }
  hudT -= dt; if (hudT <= 0){ hudT = .25; refreshDock(); refreshHud(); }
  draw(now);
  requestAnimationFrame(frame);
}
resize();

/* ---------- 3D view ---------- */
let want3D = store.get('fleet-3d') !== '0';
const API = {
  get LY(){ return LY; }, get state(){ return state; }, get setupShips(){ return setupShips; }, get sel(){ return sel; }, get drag(){ return drag; },
  get my(){ return my; }, get vis(){ return vis; }, get foeReveal(){ return foeReveal; }, get shells(){ return shells; }, get gt(){ return gt; },
  get shake(){ return shake; }, get paused(){ return paused; }, get turn(){ return turn; }, get chatW(){ return LY.chatW || 0; }
};
function paint3D(){ const b = $('view3d'); b.querySelector('.lbl').textContent = T3 ? '3D on' : '3D off'; b.setAttribute('aria-pressed', String(!!T3)); }
async function start3D(){
  try {
    const {createFleet3D} = await import('./fleet3d.js');
    if (!want3D || T3) return;
    T3 = await createFleet3D({host:stage, flat:cv, api:API, cellsOf, SINK_MS, reduced:REDUCED, faceImg:BDB.faceImg});
    stage.classList.add('f3'); flatSig = ''; resize();
  } catch(e){ console.warn('3D view unavailable, using the flat one', e); T3 = null; FLAT = false; want3D = false; stage.classList.remove('f3'); }
  paint3D();
}
function stop3D(){ if (T3){ T3.dispose(); T3 = null; } FLAT = false; stage.classList.remove('f3'); resize(); paint3D(); }
$('view3d').onclick = () => { want3D = !want3D; store.set('fleet-3d', want3D ? '1' : '0'); if (want3D) start3D(); else stop3D(); };
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fontsV++; });
paint3D();
if (want3D) start3D();
requestAnimationFrame(frame);
chatSideMQ.addEventListener('change', layout);

/* ---------- test hook ---------- */
function pagePt(x, y){ if (T3){ const [px, py] = T3.toClient(x, y); return {x:px, y:py}; } const r = cv.getBoundingClientRect(); return {x:r.left + x, y:r.top + y}; }
window.__game = {
  get state(){ return state; }, get score(){ return lastScore; }, get mode(){ return mode; }, get turn(){ return turn; }, get turnNo(){ return turnNo; },
  get rules(){ return rules; }, get level(){ return level.key; }, get idle(){ return idle(); }, get stats(){ return {...st}; }, get paused(){ return paused; },
  get myAfloat(){ return myAfloat(); }, get foeAfloat(){ return foeAfloat(); }, get marks(){ return marks.slice(); }, get allowed(){ return state === 'play' ? allowed('me') : 0; },
  get pvp(){ return pvp && {oppName:pvp.oppName, myH:pvp.myH, oppH:pvp.oppH, verdict:pvp.verdict, pending:!!pvp.pending, gone:pvp.gone, rematch:pvp.rematch, flags:pvp.flags, answers:pvp.answersGot.length}; },
  get setup(){ return setupShips.map(s => ({...s})); }, get layoutInfo(){ return JSON.parse(JSON.stringify({phone:LY.phone, inset:LY.inset, me:LY.grids.me, foe:LY.grids.foe, slots:LY.slots})); },
  view(){ return Array.from(view); }, myShots(){ return my ? Array.from(my.shot) : []; },
  foeCells(){ return foe ? foe.ships.flatMap(s => cellsOf(s.r, s.c, s.v, s.len)) : []; },      // vs BDB only, for tests
  myCells(){ return my ? my.ships.flatMap(s => cellsOf(s.r, s.c, s.v, s.len)) : []; },
  cellXY(key, i){ const g = grid(key); if (!g) return null; return pagePt(g.x + (i % 10 + .5) * g.cell, g.y + (((i / 10) | 0) + .5) * g.cell); },
  slotXY(id){ const sl = LY.slots.find(s => s.id === id); return sl && pagePt(sl.x + sl.tc * .5, sl.y + sl.tc * .5); },
  get view3d(){ return !!T3; },
  fire: i => aimAt(i), fireMarks, randomize, ready, startBdb,
  setLevel(k){ const l = LEVELS.find(x => x.key === k); if (l){ level = l; store.set('fleet-level', k); paintSplash(); } },
  setRules(r){ rules = r; store.set('fleet-rules', r); paintSplash(); },
  shooterPick: (lv, n) => makeShooter(lv).pick(n), online
};
