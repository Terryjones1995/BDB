import { initOnline, initials, backdropClose } from '../chess/online.js';
import { engineSrc } from './ai.js';

/* =========================================================
   Charleston Four: four in a row vs BDB, pass-and-play, or online through the chess lobby code.
   Board: Int8Array(42), index = col * 6 + row (row 0 at the bottom). 1 = orange (you / player one), 2 = navy BDB-face discs.
   ========================================================= */

const $ = id => document.getElementById(id);
const COLS = 7, ROWS = 6, N = 42;
const at = (c, r) => c * ROWS + r;
const pick = BDB.pick, store = BDB.store, REDUCED = BDB.reduced;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

/* ---------- levels ---------- */
const LEVELS = [
  {key:'rec',     name:'Rec League', short:'REC', base:100,  depth:2,  time:150, note:'Tuesday pickup energy. Forgets to block. Sometimes forgets to win.'},
  {key:'jv',      name:'JV',         short:'JV',  base:250,  depth:4,  time:250, note:'Blocks the obvious stuff. Mostly. Still drifts off on defence.'},
  {key:'varsity', name:'Varsity',    short:'VAR', base:500,  depth:6,  time:450, note:'Sees six drops ahead. Punishes lazy columns.'},
  {key:'d1',      name:'D1',         short:'D1',  base:1000, depth:12, time:800, note:'Full brain. The scholarship he never got went straight into this.'}
];

/* ---------- trash talk ---------- */
const EXTRA_ROASTS = [
  "BDB's best four in a row is four straight shifts.",
  "BDB has never connected on anything. Not a pass, not a jumper, not a disc.",
  "BDB says he plays this for the cardio. He's sitting down.",
  "The discs have his face on them because no trading card company would.",
  "BDB calls the middle column the paint. He never got there either."
];
const L = {
  start:["Tip-off. BDB's been practising this on the break room table. Against himself. He lost.",
    "Four in a row? BDB's never even hit two in a row.",
    "New game. BDB stretched for this. Hamstring's fine. Ego's fragile.",
    "BDB says this is basically basketball. It is not.",
    "BDB's confidence: 99. His four in a row record: classified."],
  youDrop:["Bold column. BDB's pretending he saw that coming.",
    "BDB's nodding like he understands what you just did.",
    "Interesting. BDB calls that a look.",
    "BDB just wrote that down. In crayon.",
    "That drop had more arc than any BDB jumper."],
  bdbDrop:["BDB drops one in. First thing he's dropped in all year.",
    "BDB with the slow-motion drop. Same speed as his first step.",
    "That one's for the scouts. Still none in the building.",
    "BDB's face is on that disc. Most screen time he's ever had.",
    "BDB put it there on purpose. Probably.",
    "Another BDB disc. Glasses on, ready to read your next mistake."],
  youCentre:["Middle column. Even BDB knows that's the paint. He just never got there.",
    "Straight down the middle. BDB respects it. He'd never try it."],
  youEdge:["Corner column? That's where BDB sat for four years.",
    "Edge of the board. Bench end. BDB knows it well."],
  youBlock:["Blocked. BDB hasn't been rejected like that since tryouts.",
    "You stuffed him. BDB's calling for a foul.",
    "That's a block. BDB averaged zero of those, so he's impressed.",
    "Denied. BDB's heading to the break room to think about it."],
  bdbBlock:["BDB blocked it. First defensive stop of his career. Frame it.",
    "Nope. BDB saw that one. He'll mention it every shift.",
    "Blocked. BDB's doing the finger wag. Somebody stop him.",
    "BDB closed the lane. Clock-watching rated 100, board-watching rated 101."],
  youThreat:["Three lined up. BDB's sweating through the lanyard.",
    "You've got a threat. BDB's eyeing the exit like it's five to close.",
    "Three in a row. BDB's glasses just fogged up."],
  bdbThreat:["BDB has three lined up. Look at the board. Look at it.",
    "That's a threat. BDB's never been called a threat before. He loves it.",
    "Three for BDB. Block it or hear about it forever."],
  youDouble:["Two ways to win. BDB's checking if he can clock out mid-game.",
    "Double threat. BDB's asking for a timeout he doesn't have."],
  bdbDouble:["Two ways to win. BDB set a trap. Who taught him that?",
    "Double threat. BDB's already practising his victory speech. It's bad."],
  youMissed:["You had four right there and passed. Pure BDB.",
    "Missed the win. BDB's been doing that since Florida.",
    "Open lane, no dunk. BDB is honoured. You played like him."],
  bdbBlunder:["BDB left the lane wide open. Classic Rec League defence.",
    "BDB forgot to block. He forgot to box out for four years too.",
    "BDB had it and passed. Shot selection rated 2.0."],
  youWin:["You got four. BDB's calling it a moral victory.",
    "Four in a row. BDB's going to tell everyone it was three.",
    "You beat BDB. He wants a rematch and a new ref.",
    "Game. BDB's taking the long way back from break."],
  youWinFast:["That was quick. BDB's been on longer breaks than that game.",
    "Done already? BDB didn't even get his warmup jacket off."],
  bdbWin:["BDB got four. Nobody tell him, he'll never shut up.",
    "BDB wins. He's doing a lap around the break room.",
    "Four in a row for BDB. Most consistent he's ever been.",
    "BDB won. Add it to the highlight reel. Still nine seconds long."],
  draw:["Board's full. Nobody wins. BDB calls that a moral victory.",
    "Draw. BDB's counting it as a W anyway.",
    "Forty-two discs, zero winners. Feels like BDB's old team."],
  undo:["Takeback? BDB wishes he had that button in Florida.",
    "Undo. Leaderboard won't count this one. BDB's rules.",
    "Rewind. BDB asks for those every shift."],
  full:["Column's full. Like BDB's folder of excuses.", "No room there. Pick another lane."],
  think:["BDB is thinking. Rare.", "Hold on, he's checking the shift schedule.", "Thinking. Same face he makes at the time clock."],
  // announcer lines: x is the player who just moved, y the other one
  pvStart:[(a, b) => `${a} vs ${b}. BDB's on the call, closest he's ever been to a broadcast job.`,
    (a, b) => `Tip-off: ${a} and ${b}. Loser gets compared to BDB for a week.`,
    (a, b) => `${a} and ${b} are live. BDB's calling this one from the break room.`],
  pvDrop:[(x, y) => `${x} drops one in. ${y} is pretending to have a plan.`,
    (x, y) => `Nice drop, ${x}. BDB would've put it in the wrong column.`,
    (x, y) => `${x} going to the paint. ${y} better rotate.`,
    (x, y) => `${y}, your move. BDB's watching the clock for you.`,
    (x, y) => `${x} with a BDB face disc. Bold. Ugly, but bold.`],
  pvBlock:[(x, y) => `${x} blocks ${y}. BDB hasn't seen defence like that since he stopped playing it.`,
    (x, y) => `Denied. ${y} just got rejected like BDB at tryouts.`,
    (x, y) => `${x} shut the lane. ${y} is looking for a ref.`],
  pvThreat:[(x, y) => `${x} has three lined up. ${y}, look at the board.`,
    (x, y) => `Threat from ${x}. ${y} is sweating like BDB at a fitness test.`,
    (x, y) => `${x} is cooking. ${y}, this is where you block.`],
  pvDouble:[(x, y) => `${x} has two ways to win. ${y} is officially cooked.`,
    (x, y) => `Double threat by ${x}. ${y}, it was nice knowing you.`],
  pvMissed:[(x, y) => `${x} had the win and passed it up. Pure BDB shot selection.`,
    (x, y) => `${x} missed four in a row. ${y} owes BDB a thank you.`],
  pvWin:[(w, l) => `${w} wins. ${l} is officially the BDB of this lobby.`,
    (w, l) => `Four in a row for ${w}. ${l}, BDB says welcome to the club.`,
    (w, l) => `${w} closes it out. ${l} is taking the long way back to the bench.`],
  pvDraw:[(a, b) => `Full board. ${a} and ${b} both played like BDB today.`,
    (a, b) => `Draw. ${a} and ${b} split it like a break room pizza.`]
};
BDB.init({game:'connect4', extra:EXTRA_ROASTS});

/* speech: big moments always talk, small ones wait a few seconds */
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
  if (!force && now - lastTalk < 4000) return false;
  lastTalk = now;
  const text = lineFrom(arr, args);
  BDB.say(text, tag || (announcing() ? 'BDB on the call' : ''));
  if (mode === 'pvp') post('bdb', text, 'BDB · Move ' + (moves.length + 1));
  return true;
}
function roastMaybe(force){
  const now = Date.now();
  if (!force && now - lastTalk < 5000) return;
  lastTalk = now; BDB.roast();
}

/* ---------- sound: kit sfx plus a disc clack ---------- */
let actx = null;
function clack(strength = 1){
  if (BDB.sfx.muted) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(260 + Math.random() * 40, t); o.frequency.exponentialRampToValueAtTime(90, t + .09);
    g.gain.setValueAtTime(.12 * strength, t); g.gain.exponentialRampToValueAtTime(.0001, t + .12);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + .14);
    const len = Math.floor(actx.sampleRate * .04), buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const s = actx.createBufferSource(), g2 = actx.createGain(); s.buffer = buf; g2.gain.value = .09 * strength;
    s.connect(g2).connect(actx.destination); s.start(t);
  } catch(e){}
}

/* ---------- canvas ---------- */
const cv = $('cv'), cx = cv.getContext('2d'), stage = $('stage');
let W = 0, H = 0, DPR = 1;
let cell = 60, pad = 9, bx = 0, by = 0, bw = 0, bh = 0, ghostH = 60;
let spriteO = null, spriteN = null, frameC = null;
const coarse = matchMedia('(pointer: coarse)').matches;
const chatSideMQ = matchMedia('(min-width:1100px)');
function resize(){
  const r = stage.getBoundingClientRect();
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = r.width; H = r.height;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  layout();
}
function layout(){
  const phone = W < 641;
  const top = phone ? 62 : 74, bottom = phone ? 166 : 98;
  let availW = W - 24, left = 12;
  if (mode === 'pvp' && chatSideMQ.matches) availW = W - 24 - 336;
  const availH = Math.max(120, H - top - bottom);
  cell = Math.max(24, Math.min(availW / 7.3, availH / 7.45, 96));
  pad = cell * .15; ghostH = cell * 1.05;
  bw = cell * COLS + pad * 2; bh = cell * ROWS + pad * 2;
  bx = left + (availW - bw) / 2;
  by = top + Math.max(0, (availH - bh - ghostH - cell * .3) / 2) + ghostH;
  if (phone) by = Math.min(by, top + ghostH + (availH - bh - ghostH) * .42);
  buildSprites();
  for (const d of drops) d.ty = cellY(d.r);
}
const colX = c => bx + pad + c * cell + cell / 2;
const cellY = r => by + pad + (ROWS - 1 - r) * cell + cell / 2;
const ghostY = () => by - ghostH * .52;
function colAt(x){
  if (x < bx - cell * .4 || x > bx + bw + cell * .4) return -1;
  return Math.max(0, Math.min(COLS - 1, Math.floor((x - bx - pad) / cell)));
}

function makeDisc(kind){
  const R = cell * .4, s = Math.ceil((R * 2 + 4) * DPR);
  const c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'); g.scale(DPR, DPR);
  const m = s / DPR / 2;
  g.save(); g.beginPath(); g.arc(m, m, R, 0, Math.PI * 2); g.clip();
  if (kind === 'o'){
    const gr = g.createRadialGradient(m - R * .35, m - R * .4, R * .1, m, m, R * 1.05);
    gr.addColorStop(0, '#ffc583'); gr.addColorStop(.45, '#ff8a2b'); gr.addColorStop(1, '#a34c0c');
    g.fillStyle = gr; g.fillRect(0, 0, m * 2, m * 2);
    // basketball seams
    g.strokeStyle = 'rgba(58,22,2,.62)'; g.lineWidth = Math.max(1, R * .075); g.lineCap = 'round';
    g.beginPath(); g.moveTo(m, m - R); g.lineTo(m, m + R); g.moveTo(m - R, m); g.lineTo(m + R, m); g.stroke();
    g.beginPath(); g.ellipse(m - R * 1.02, m, R * .62, R * 1.02, 0, -Math.PI / 2, Math.PI / 2); g.stroke();
    g.beginPath(); g.ellipse(m + R * 1.02, m, R * .62, R * 1.02, 0, Math.PI / 2, Math.PI * 1.5); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = R * .14; g.beginPath(); g.arc(m, m, R - R * .07, 0, Math.PI * 2); g.stroke();
  } else {
    const gr = g.createRadialGradient(m - R * .3, m - R * .35, R * .1, m, m, R * 1.05);
    gr.addColorStop(0, '#2d4f96'); gr.addColorStop(.55, '#15285a'); gr.addColorStop(1, '#081430');
    g.fillStyle = gr; g.fillRect(0, 0, m * 2, m * 2);
    const fr = R * .78, img = BDB.faceImg;
    if (img.complete && img.naturalWidth){
      g.save(); g.beginPath(); g.arc(m, m, fr, 0, Math.PI * 2); g.clip();
      const iw = img.naturalWidth, ih = img.naturalHeight, side = Math.min(iw, ih);
      const sx = (iw - side) / 2, sy = Math.max(0, Math.min(ih - side, (ih - side) * .32));
      g.drawImage(img, sx, sy, side, side, m - fr, m - fr, fr * 2, fr * 2);
      const v = g.createRadialGradient(m, m, fr * .55, m, m, fr);
      v.addColorStop(0, 'rgba(10,22,52,0)'); v.addColorStop(1, 'rgba(10,22,52,.6)');
      g.fillStyle = v; g.fillRect(m - fr, m - fr, fr * 2, fr * 2);
      g.restore();
    }
    g.strokeStyle = '#5b82cf'; g.lineWidth = Math.max(1, R * .06); g.beginPath(); g.arc(m, m, fr + R * .03, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = R * .12; g.beginPath(); g.arc(m, m, R - R * .06, 0, Math.PI * 2); g.stroke();
  }
  // gloss
  const hl = g.createLinearGradient(0, m - R, 0, m);
  hl.addColorStop(0, 'rgba(255,255,255,.34)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl; g.beginPath(); g.ellipse(m - R * .12, m - R * .45, R * .62, R * .38, -.35, 0, Math.PI * 2); g.fill();
  g.restore();
  return c;
}
function makeFrame(){
  const c = document.createElement('canvas');
  c.width = Math.ceil(bw * DPR); c.height = Math.ceil(bh * DPR);
  const g = c.getContext('2d'); g.scale(DPR, DPR);
  const rr = cell * .28;
  const gr = g.createLinearGradient(0, 0, 0, bh);
  gr.addColorStop(0, '#2a59b8'); gr.addColorStop(.5, '#1d4596'); gr.addColorStop(1, '#122f6c');
  g.fillStyle = gr; g.beginPath(); g.roundRect(0, 0, bw, bh, rr); g.fill();
  g.globalCompositeOperation = 'destination-out';
  const hr = cell * .41;
  for (let col = 0; col < COLS; col++) for (let r = 0; r < ROWS; r++){
    g.beginPath(); g.arc(pad + col * cell + cell / 2, pad + r * cell + cell / 2, hr, 0, Math.PI * 2); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  for (let col = 0; col < COLS; col++) for (let r = 0; r < ROWS; r++){
    const x = pad + col * cell + cell / 2, y = pad + r * cell + cell / 2;
    g.lineWidth = cell * .05;
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.arc(x, y, hr + cell * .02, Math.PI * .85, Math.PI * 1.85); g.stroke();
    g.strokeStyle = 'rgba(140,180,255,.28)'; g.beginPath(); g.arc(x, y, hr + cell * .02, Math.PI * -.15, Math.PI * .85); g.stroke();
  }
  g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.roundRect(1, 1, bw - 2, bh - 2, rr); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.roundRect(0, 0, bw, bh, rr); g.stroke();
  return c;
}
function buildSprites(){ spriteO = makeDisc('o'); spriteN = makeDisc('n'); frameC = makeFrame(); }
BDB.faceImg.addEventListener('load', () => { if (cell) spriteN = makeDisc('n'); });
new ResizeObserver(resize).observe(stage);

/* ---------- game state ---------- */
let mode = 'bdb';                 // bdb | pass | pvp
let state = 'menu';               // menu | play | over
let board = new Int8Array(N), heights = new Int8Array(COLS), moves = [];
let first = 1;                    // piece that drops first (1 orange, 2 navy)
let over = false, winner = 0, winCells = null, winT = 0, assisted = false;
let level = LEVELS.find(l => l.key === store.get('c4-level')) || LEVELS[1];
let firstChoice = store.get('c4-first') || 'you';
let names = {a:'Player 1', b:'Player 2'};
let tally = {a:0, b:0};           // session wins for pass and online
let pvp = null;                   // {mid, oppName, rematch, gone}
let lastScore = 0;
let hoverCol = -1, kbCol = 3, kbActive = false;
const drops = [], parts = [];
let shake = 0, aiBusy = false, aiToken = 0, aiGhost = null, lastAI = null;

const turnPiece = () => moves.length % 2 === 0 ? first : 3 - first;
const legal = c => c >= 0 && c < COLS && heights[c] < ROWS;
const announcing = () => mode !== 'bdb';
function nameOf(piece){
  if (mode === 'bdb') return piece === 1 ? 'You' : 'BDB';
  if (mode === 'pass') return piece === 1 ? names.a : names.b;
  return piece === 1 ? (clean(online && online.name, 24) || 'You') : (pvp ? pvp.oppName : 'Opponent');
}
function humanTurn(){
  if (state !== 'play' || over) return false;
  if (mode === 'pass') return true;
  return turnPiece() === 1 && !aiBusy;
}
function lineAt(idx, p){
  const c = (idx / ROWS) | 0, r = idx % ROWS;
  for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]){
    const cells = [idx];
    for (let k = 1; k < 4; k++){ const cc = c + dc * k, rr = r + dr * k; if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS || board[at(cc, rr)] !== p) break; cells.push(at(cc, rr)); }
    for (let k = 1; k < 4; k++){ const cc = c - dc * k, rr = r - dr * k; if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS || board[at(cc, rr)] !== p) break; cells.unshift(at(cc, rr)); }
    if (cells.length >= 4) return cells;
  }
  return null;
}
function winningCols(p){
  const out = [];
  for (let c = 0; c < COLS; c++){
    if (!legal(c)) continue;
    const idx = at(c, heights[c]); board[idx] = p;
    if (lineAt(idx, p)) out.push(c);
    board[idx] = 0;
  }
  return out;
}
function resetBoard(){
  board = new Int8Array(N); heights = new Int8Array(COLS); moves = [];
  over = false; winner = 0; winCells = null; assisted = false;
  drops.length = 0; parts.length = 0; aiGhost = null;
}

/* place a disc. Returns what happened so callers can talk about it. */
function place(c, piece, {animate = true} = {}){
  const o = 3 - piece;
  const myWins = winningCols(piece), oppWins = winningCols(o);
  const r = heights[c], idx = at(c, r);
  board[idx] = piece; heights[c]++; moves.push(c);
  const line = lineAt(idx, piece);
  const full = moves.length >= N;
  const res = {c, r, piece, line, full, missed: myWins.length > 0 && !line, blocked: oppWins.includes(c),
    left: oppWins.filter(x => x !== c).length > 0, threats: line ? [] : winningCols(piece)};
  if (animate) drop(c, r, piece, line || full ? () => endAfterLanding(res) : null);
  return res;
}
function drop(c, r, piece, onDone){
  const startY = aiGhost && piece === 2 && mode === 'bdb' ? aiGhost.y : ghostY();
  drops.push({c, r, piece, y:startY, vy:cell * 2, ty:cellY(r), b:0, onDone});
}
function stepDrops(dt){
  const g = cell * 62;
  for (let i = drops.length - 1; i >= 0; i--){
    const d = drops[i];
    d.vy += g * dt; d.y += d.vy * dt;
    if (d.y >= d.ty){
      d.y = d.ty;
      const speed = d.vy / cell;
      if (d.b === 0){ clack(Math.min(1, speed / 18)); hit(colX(d.c), d.ty + cell * .38, d.piece); if (!REDUCED) shake = Math.max(shake, Math.min(5, speed * .22)); }
      if (d.b < 2 && speed > 4){ d.vy = -d.vy * .3; d.b++; }
      else { drops.splice(i, 1); if (d.onDone) d.onDone(); }
    }
  }
}
function hit(x, y, piece){
  if (REDUCED) return;
  const col = piece === 1 ? ['#ffb547', '#ff8a2b', '#fff3d6'] : ['#7aa2ff', '#c9d8ff', '#3a5fa8'];
  for (let i = 0; i < 10; i++){
    const a = Math.PI + Math.random() * Math.PI;
    parts.push({x, y, vx:Math.cos(a) * cell * (1 + Math.random() * 2.5), vy:Math.sin(a) * cell * (1 + Math.random() * 2), life:.45 + Math.random() * .3, t:0, s:2 + Math.random() * 2.5, c:pick(col)});
  }
}
function confetti(){
  if (REDUCED) return;
  const col = ['#f2c14e', '#ff8a2b', '#ffffff', '#6aa2ff', '#4ade80'];
  for (let i = 0; i < 140; i++){
    parts.push({x:W / 2 + (Math.random() - .5) * W * .6, y:H * .25 + Math.random() * 40, vx:(Math.random() - .5) * 600, vy:-200 - Math.random() * 500,
      life:1.6 + Math.random(), t:0, s:3 + Math.random() * 4, c:pick(col), rect:true, rot:Math.random() * 6});
  }
}

/* ---------- turn flow ---------- */
function humanDrop(c){
  if (!humanTurn()) return;
  if (!legal(c)){ BDB.sfx.bad(); talk(L.full); return; }
  const piece = mode === 'pass' ? turnPiece() : 1;
  const res = place(c, piece);
  if (mode === 'pvp') online.send('move', {n:moves.length, c});
  afterMove(res, 'human');
}
function afterMove(res, who){
  refreshHud();
  if (res.line){ over = true; winner = res.piece; winCells = res.line; return; }
  if (res.full){ over = true; winner = 0; return; }
  commentary(res, who);
  if (mode === 'bdb' && turnPiece() === 2) bdbTurn();
}
function commentary(res, who){
  const p = res.piece;
  if (mode === 'bdb'){
    const you = p === 1;
    if (res.threats.length > 1) return talk(you ? L.youDouble : L.bdbDouble, {force:true});
    if (res.missed) return talk(you ? L.youMissed : L.bdbBlunder, {force:true});
    if (!you && res.left) return talk(L.bdbBlunder, {force:true});
    if (res.blocked) return talk(you ? L.youBlock : L.bdbBlock, {force:true});
    if (res.threats.length) return talk(you ? L.youThreat : L.bdbThreat, {force:true});
    if (moves.length === 1 && you) return talk(res.c === 3 ? L.youCentre : (res.c === 0 || res.c === 6) ? L.youEdge : L.youDrop);
    if (moves.length % 9 === 0) return roastMaybe();
    if (Math.random() < (you ? .22 : .3)) talk(you ? L.youDrop : L.bdbDrop);
    return;
  }
  const x = nameOf(p), y = nameOf(3 - p), args = [x, y];
  if (res.threats.length > 1) return talk(L.pvDouble, {force:true, args});
  if (res.missed) return talk(L.pvMissed, {force:true, args});
  if (res.blocked) return talk(L.pvBlock, {force:true, args});
  if (res.threats.length) return talk(L.pvThreat, {force:true, args});
  if (moves.length % 10 === 0) return roastMaybe();
  if (Math.random() < .25) talk(L.pvDrop, {args});
}

/* BDB's move: search in a worker, wander the ghost disc while he "thinks", then drop */
let worker = null;
const localEngine = {}; engineSrc(localEngine);
try {
  const url = URL.createObjectURL(new Blob(['(' + engineSrc.toString() + ')(self)'], {type:'text/javascript'}));
  worker = new Worker(url);
  worker.onmessage = e => onAI(e.data);
  worker.onerror = () => { worker = null; if (pendingReq) runLocal(pendingReq); };
} catch(e){ worker = null; }
let pendingReq = null;
function runLocal(req){ setTimeout(() => onAI(localEngine.search(req)), 20); }
function bdbTurn(){
  if (state !== 'play' || over || mode !== 'bdb') return;
  aiBusy = true; refreshHud();
  const id = ++aiToken;
  aiGhost = {x:colX(3), y:ghostY(), target:Math.floor(Math.random() * COLS), t0:performance.now(), chosen:-1, wander:.4};
  const req = {id, board:Array.from(board), toMove:2, maxDepth:level.depth, timeMs:level.time, shuffle:true};
  pendingReq = req;
  req.started = performance.now();
  if (worker) worker.postMessage(req); else runLocal(req);
  if (level.key === 'd1' && Math.random() < .15 && moves.length > 4) talk(L.think);
}
function weightedRandom(){
  const w = [1, 2, 3, 4, 3, 2, 1];
  const opts = []; for (let c = 0; c < COLS; c++) if (legal(c)) for (let k = 0; k < w[c]; k++) opts.push(c);
  return pick(opts);
}
function chooseMove(res){
  const k = level.key, R = Math.random;
  if (k === 'rec'){
    if (res.wins.length) return R() < .7 ? res.wins[0] : weightedRandom();
    if (res.blocks.length) return R() < .5 ? res.blocks[0] : weightedRandom();
    return R() < .45 ? weightedRandom() : res.best;
  }
  if (k === 'jv'){
    if (res.wins.length) return res.wins[0];
    if (res.blocks.length) return R() < .88 ? res.blocks[0] : weightedRandom();
    return R() < .12 ? weightedRandom() : res.best;
  }
  return res.best;
}
function onAI(res){
  if (!res || res.id !== aiToken || !pendingReq) return;
  const req = pendingReq; pendingReq = null;
  if (state !== 'play' || over || mode !== 'bdb') { aiBusy = false; aiGhost = null; return; }
  lastAI = {depth:res.depth, ms:res.ms, nodes:res.nodes, score:res.score, best:res.best};
  let c = chooseMove(res);
  if (!legal(c)) c = res.best;
  if (!legal(c)) c = weightedRandom();
  const minThink = 520 + Math.random() * 380;
  const wait = Math.max(0, minThink - (performance.now() - req.started));
  const id = res.id;
  setTimeout(() => whenVisible(() => {
    if (id !== aiToken || !aiGhost) return;
    aiGhost.chosen = c; aiGhost.target = c; aiGhost.t0 = performance.now();
    setTimeout(() => whenVisible(() => {
      if (id !== aiToken || state !== 'play' || over) return;
      aiBusy = false;
      const r = place(c, 2);
      aiGhost = null;
      afterMove(r, 'bdb');
    }), REDUCED ? 60 : 300);
  }), wait);
}
function whenVisible(fn){
  if (!document.hidden) return fn();
  const h = () => { if (!document.hidden){ document.removeEventListener('visibilitychange', h); setTimeout(fn, 250); } };
  document.addEventListener('visibilitychange', h);
}

/* ---------- endings ---------- */
function endAfterLanding(res){
  winT = performance.now();
  setTimeout(() => finish(res), res.line ? 900 : 500);
}
function loadRecord(){ try { return JSON.parse(store.get('c4-record')) || {}; } catch(e){ return {}; } }
function recOf(all, key){ return Object.assign({w:0, l:0, d:0, streak:0, best:0}, all[key] || {}); }
function finish(res, reason){
  if (state === 'over') return;
  state = 'over'; over = true; aiBusy = false; aiGhost = null; aiToken++;
  const w = res ? (res.line ? res.piece : 0) : winner;
  winner = w;
  online.setStatus('idle');
  if (mode === 'bdb') finishBdb(w);
  else if (mode === 'pass') finishPass(w);
  else finishPvp(w, reason);
  refreshHud();
}
function finishBdb(w){
  const all = loadRecord(), rec = recOf(all, level.key);
  const myMoves = Math.ceil(moves.filter((_, i) => (i % 2 === 0 ? first : 3 - first) === 1).length);
  let scores = null, title, line, eyebrow, stats = [['Your drops', String(myMoves)]];
  if (w === 1){
    rec.w++; rec.streak = Math.max(1, rec.streak + 1); rec.best = Math.max(rec.best, rec.streak);
    const score = Math.round(level.base * (1 + Math.max(0, 21 - myMoves) / 21) * (first === 2 ? 1.15 : 1));
    lastScore = score;
    if (!assisted){ scores = BDB.addScore(score); stats.push(['Score', BDB.fmt(score)]); }
    else { stats.push(['Score', 'Takeback']); const l = BDB.scores(); scores = l.length ? {rank:-1, isBest:false, list:l} : null; }
    eyebrow = 'Four in a row'; title = scores && scores.isBest && !assisted ? 'New best. You beat BDB' : 'You beat BDB';
    line = lineFrom(myMoves <= 6 ? L.youWinFast : L.youWin);
    BDB.shout('FOUR!'); scores && scores.isBest ? BDB.sfx.big() : BDB.sfx.good(); confetti();
  } else if (w === 2){
    rec.l++; rec.streak = 0;
    eyebrow = 'Four in a row'; title = 'BDB got you'; line = lineFrom(L.bdbWin);
    BDB.shout('BDB WINS', true); BDB.sfx.bad(); if (!REDUCED) shake = 9;
  } else {
    rec.d++;
    eyebrow = 'Board full'; title = 'Nobody wins'; line = lineFrom(L.draw);
    BDB.shout('DRAW'); BDB.sfx.tick();
  }
  if (rec.streak > 1) stats.push(['Streak', String(rec.streak)]);
  all[level.key] = rec; store.set('c4-record', JSON.stringify(all));
  if (!scores){ const l = BDB.scores(); scores = l.length ? {rank:-1, isBest:false, list:l} : null; }
  BDB.say(line); lastTalk = Date.now();
  setBest();
  showEnd({eyebrow, title, line, stats, scores,
    rec:`Record vs BDB on ${level.name}: ${rec.w}W ${rec.l}L ${rec.d}D` + (rec.best > 1 ? ` · best streak ${rec.best}` : '')});
  if (w !== 1 && Math.random() < .5) setTimeout(() => { if (state === 'over') BDB.roast(); }, 3200);
}
function finishPass(w){
  const a = names.a, b = names.b;
  let title, line;
  if (w){ const wn = w === 1 ? a : b, ln = w === 1 ? b : a; tally[w === 1 ? 'a' : 'b']++; title = `${wn} wins`; line = lineFrom(L.pvWin, [wn, ln]); BDB.shout('FOUR!'); BDB.sfx.big(); confetti(); }
  else { title = 'Nobody wins'; line = lineFrom(L.pvDraw, [a, b]); BDB.shout('DRAW'); BDB.sfx.tick(); }
  BDB.say(line, 'BDB on the call'); lastTalk = Date.now();
  showEnd({eyebrow: w ? 'Four in a row' : 'Board full', title, line, stats:[['Drops', String(moves.length)], [a, String(tally.a)], [b, String(tally.b)]], scores:null, rec:null});
}
function finishPvp(w, reason){
  const o = pvp ? pvp.oppName : 'Opponent';
  let title, line, eyebrow = w ? 'Four in a row' : 'Board full';
  if (reason === 'resign-me'){ w = 2; eyebrow = 'Resigned'; title = `${o} wins`; line = `You resigned. BDB respects it. He's been cut before too.`; }
  else if (reason === 'resign-opp'){ w = 1; eyebrow = 'Resigned'; title = `You beat ${o}`; line = `${o} resigned. Didn't even make it to the final buzzer.`; }
  else if (reason === 'left'){ w = 1; eyebrow = 'Opponent left'; title = `You beat ${o}`; line = `${o} left the building. BDB calls that a forfeit. He'd know.`; }
  else if (w === 1){ title = `You beat ${o}`; line = lineFrom(L.pvWin, [nameOf(1), o]); }
  else if (w === 2){ title = `${o} wins`; line = lineFrom(L.pvWin, [o, nameOf(1)]); }
  else { title = 'Nobody wins'; line = lineFrom(L.pvDraw, [nameOf(1), o]); }
  winner = w;
  if (w === 1){ tally.a++; BDB.shout(reason ? 'W' : 'FOUR!'); BDB.sfx.big(); confetti(); }
  else if (w === 2){ tally.b++; BDB.shout(reason ? 'L' : 'FOUR', true); BDB.sfx.bad(); }
  else { BDB.shout('DRAW'); BDB.sfx.tick(); }
  BDB.say(line, 'BDB on the call'); lastTalk = Date.now();
  post('sys', `${eyebrow} · ${title}`);
  post('bdb', line, 'BDB · Final');
  if (pvp) pvp.rematch = null;
  showEnd({eyebrow, title, line, stats:[['You', String(tally.a)], [o.slice(0, 12), String(tally.b)]], scores:null, rec:null});
}
function showEnd(o){
  const delay = REDUCED ? 200 : 1100;
  setTimeout(() => {
    if (state !== 'over') return;
    BDB.showEnd({eyebrow:o.eyebrow, title:o.title, line:o.line, stats:o.stats, scores:o.scores});
    $('endRec').hidden = !o.rec; $('endRec').textContent = o.rec || '';
    paintEnd();
  }, delay);
}
function paintEnd(){
  const again = $('again'), menu = $('endMenu');
  if (mode === 'bdb'){ again.textContent = 'Run it back'; again.disabled = false; menu.textContent = 'Change level'; return; }
  if (mode === 'pass'){ again.textContent = 'Rematch'; again.disabled = false; menu.textContent = 'Menu'; return; }
  menu.textContent = 'Back to lobby';
  const p = pvp || {gone:true};
  again.disabled = !!p.gone || p.rematch === 'sent';
  again.textContent = p.gone ? 'Opponent left' : p.rematch === 'sent' ? 'Waiting…' : p.rematch === 'got' ? 'Accept rematch' : 'Rematch';
}

/* ---------- starting games ---------- */
function blurFocus(){ const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); }
function startBdb(){
  exitPvp(); blurFocus();
  mode = 'bdb'; state = 'play'; aiToken++; aiBusy = false;
  resetBoard();
  first = firstChoice === 'bdb' ? 2 : firstChoice === 'r' ? (Math.random() < .5 ? 1 : 2) : 1;
  BDB.hideSplash(); BDB.hideEnd();
  applyMode(); online.setStatus('bdb');
  lastTalk = 0;
  if (Math.random() < .3) roastMaybe(true); else talk(L.start, {force:true});
  BDB.shout(first === 1 ? 'YOUR DROP' : 'BDB FIRST');
  if (first === 2) setTimeout(() => { if (state === 'play' && mode === 'bdb' && !moves.length && !aiBusy) bdbTurn(); }, 700);
}
function startPass(rematch){
  exitPvp(); blurFocus();
  if (!rematch){
    let a = clean($('nameA').value, 16) || 'Player 1', b = clean($('nameB').value, 16) || 'Player 2';
    if (a.toLowerCase() === b.toLowerCase()) b = b + ' 2';
    if (names.a !== a || names.b !== b) tally = {a:0, b:0};
    names = {a, b};
    store.set('c4-names', JSON.stringify(names));
    first = 2;                       // flipped below so player 1 starts the first game
  }
  mode = 'pass'; state = 'play'; aiToken++; aiBusy = false;
  const prevFirst = first;
  resetBoard();
  first = 3 - prevFirst;
  BDB.hideSplash(); BDB.hideEnd();
  applyMode(); online.setStatus('idle');
  lastTalk = 0;
  talk(L.pvStart, {force:true, args:[nameOf(first), nameOf(3 - first)]});
  BDB.shout(nameOf(first).toUpperCase().slice(0, 12) + ' FIRST');
}
function startMatch({mid, myColor, oppName}){
  aiToken++; aiBusy = false;
  const nm = clean(oppName, 24) || 'Opponent';
  if (!pvp || pvp.oppName !== nm) tally = {a:0, b:0};
  if (!pvp || pvp.oppName !== nm) $('feed').innerHTML = '';
  pvp = {mid, oppName:nm, rematch:null, gone:false};
  mode = 'pvp'; state = 'play';
  resetBoard();
  first = myColor === 'w' ? 1 : 2;
  $('splash').hidden = true; BDB.hideEnd(); blurFocus();
  applyMode();
  post('sys', `Online · You vs ${nm} · You drop ${first === 1 ? 'first' : 'second'}`);
  lastTalk = 0;
  talk(L.pvStart, {force:true, args:[nameOf(first), nameOf(3 - first)]});
  BDB.shout(first === 1 ? 'YOUR DROP' : 'THEIR DROP');
}
function exitPvp(){
  if (mode !== 'pvp' || !pvp) return;
  if (!over && state === 'play') online.send('resign', {});
  online.leaveMatch();
  pvp = null; mode = 'bdb'; state = 'menu';
  closeChat();
}
function showMenu(){
  exitPvp();
  aiToken++; aiBusy = false; aiGhost = null;
  state = 'menu'; BDB.hideEnd(); BDB.showSplash();
  online.setStatus('idle');
  paintSplash();
  refreshHud();
}

/* ---------- online ---------- */
function onRemote(t, d){
  if (mode !== 'pvp' || !pvp || !d || typeof d !== 'object') return;
  const o = pvp.oppName;
  switch (t){
    case 'move': {
      const c = d.c, n = d.n;
      if (!Number.isInteger(c) || !Number.isInteger(n) || c < 0 || c >= COLS || n < 1 || n > N) return;
      if (n <= moves.length) return;                                    // old or repeated message
      if (over || n !== moves.length + 1 || turnPiece() !== 2 || !legal(c)){ online.send('sync-req', {}); return; }
      const res = place(c, 2);
      afterMove(res, 'opp');
      break;
    }
    case 'sync-req': online.send('sync', {moves:moves.slice()}); break;
    case 'sync': adopt(d.moves); break;
    case 'chat': {
      const text = typeof d.text === 'string' ? clean(d.text, 140) : '';
      if (text){ post('opp', text, o, o); peekMsg(o, text); }
      break;
    }
    case 'resign': if (state === 'play') finish(null, 'resign-opp'); break;
    case 'leave':
      if (state === 'play') finish(null, 'left');
      else { pvp.gone = true; post('sys', `${o} left`); paintEnd(); }
      break;
    case 'rematch':
      if (state !== 'over') break;
      if (pvp.rematch === 'sent'){ online.acceptRematch(); break; }
      pvp.rematch = 'got'; paintEnd();
      post('sys', `${o} wants a rematch`);
      online.toast({title:`${o} wants a rematch`, sub:'First drop swaps.', timeout:30000, actions:[
        {label:'Run it back', primary:true, fn:() => { if (mode === 'pvp' && pvp && state === 'over') online.acceptRematch(); }},
        {label:'No thanks', fn:() => {}}
      ]});
      break;
  }
}
// rebuild from the opponent's move list when we've drifted out of step
function adopt(list){
  if (!Array.isArray(list) || list.length > N || list.length < moves.length) return;
  if (!list.every(c => Number.isInteger(c) && c >= 0 && c < COLS)) return;
  if (list.length === moves.length && list.every((c, i) => c === moves[i])) return;
  const save = {board, heights, moves};
  board = new Int8Array(N); heights = new Int8Array(COLS); moves = [];
  let res = null;
  for (let i = 0; i < list.length; i++){
    const c = list[i];
    if (!legal(c) || (res && (res.line || res.full))){ board = save.board; heights = save.heights; moves = save.moves; return; }
    res = place(c, turnPiece(), {animate:false});
  }
  drops.length = 0; winCells = null;
  refreshHud();
  if (res && (res.line || res.full)){ over = true; winner = res.line ? res.piece : 0; winCells = res.line; winT = performance.now(); finish(res); }
}
function oppLeft(){
  if (mode !== 'pvp' || !pvp) return;
  pvp.gone = true;
  if (state === 'play') finish(null, 'left');
  else { post('sys', `${pvp.oppName} left`); paintEnd(); }
}
const online = initOnline({
  store, lobbyRoom:'connect4',
  tcName: () => 'Four in a row', tcOptions: () => [['off', 'Off']], validTc: () => 'off',
  isOver: () => mode !== 'pvp' || state !== 'play',
  startMatch, remote:onRemote, oppLeft,
  ping: () => BDB.sfx.pop()
});
// the shared lobby talks in chess colours; translate them for four in a row
const RENAME = [[/You play White/g, 'You drop first'], [/You play Black/g, 'You drop second'], [/Random colors/g, 'Random first drop']];
function fixText(root){
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits = [];
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
function post(kind, text, meta, who){
  const li = document.createElement('li');
  if (kind === 'sys'){ li.className = 'msg event'; li.innerHTML = '<span class="ev"></span>'; li.querySelector('.ev').textContent = text; }
  else {
    li.className = 'msg' + (kind === 'you' ? ' you' : kind === 'opp' ? ' oppmsg' : '');
    li.innerHTML = (kind === 'you' ? '' : '<span class="mav" aria-hidden="true"></span>') + '<div class="mb"><span class="meta"></span><span class="t"></span></div>';
    if (kind === 'opp'){ const m = li.querySelector('.mav'); m.classList.add('opp'); m.textContent = initials(who || '?'); }
    li.querySelector('.meta').textContent = meta || ''; li.querySelector('.t').textContent = text;
  }
  feed.appendChild(li);
  while (feed.children.length > 120) feed.firstChild.remove();
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
  online.send('chat', {text}); post('you', text, 'You'); inp.value = '';
});
const TAUNTS = ['You play like BDB.', 'Block that.', 'Nice drop… not.', 'Is that your best?', 'Lucky.', 'GG', 'Rematch?', 'BDB would’ve seen that.'];
let chipLock = 0;
for (const t of TAUNTS){
  const b = document.createElement('button'); b.type = 'button'; b.textContent = t;
  b.onclick = () => {
    if (Date.now() < chipLock || mode !== 'pvp' || !pvp) return;
    chipLock = Date.now() + 1200;
    online.send('chat', {text:t}); post('you', t, 'You');
  };
  $('chips').appendChild(b);
}

/* ---------- HUD ---------- */
function setBest(){ $('best').textContent = BDB.fmt((BDB.scores()[0] || {s:0}).s); }
function applyMode(){
  const on = mode === 'pvp';
  document.body.classList.toggle('pvp', on);
  $('say').classList.toggle('announcer', mode !== 'bdb');
  $('chat').hidden = !on; if (!on) closeChat();
  $('chatBtn').hidden = !on; $('resignBtn').hidden = !on;
  $('newBtn').hidden = on; $('undoBtn').hidden = on;
  $('menuBtn').querySelector('span').textContent = on ? 'Lobby' : 'Menu';
  $('peek').hidden = true; $('chatDot').hidden = true;
  layout(); refreshHud();
}
function refreshHud(){
  $('hMove').textContent = String(Math.min(N, moves.length + (over ? 0 : 1)));
  const tp = turnPiece();
  $('nameAEl').textContent = nameOf(1);
  $('nameBEl').textContent = nameOf(2);
  $('lvlBadge').hidden = mode === 'pass';
  $('lvlBadge').textContent = mode === 'pvp' ? 'Live' : level.short;
  const dB = $('discB');
  dB.className = 'pdisc n';
  let sa, sb;
  if (state !== 'play'){ sa = winner === 1 ? 'Winner' : ''; sb = winner === 2 ? 'Winner' : ''; }
  else if (over){ sa = sb = ''; }
  else if (mode === 'bdb'){ sa = tp === 1 ? 'Your drop' : 'Waiting'; sb = tp === 2 ? 'Thinking…' : 'Waiting'; }
  else if (mode === 'pass'){ sa = tp === 1 ? 'Your drop' : 'Waiting'; sb = tp === 2 ? 'Your drop' : 'Waiting'; }
  else { sa = tp === 1 ? 'Your drop' : 'Waiting'; sb = tp === 2 ? 'Their drop' : 'Waiting'; }
  $('subA').textContent = sa || (state === 'menu' ? '' : 'Done'); $('subB').textContent = sb || (state === 'menu' ? '' : 'Done');
  $('plateA').classList.toggle('on', state === 'play' && !over && tp === 1);
  $('plateB').classList.toggle('on', state === 'play' && !over && tp === 2);
  if (mode === 'bdb'){
    const rec = recOf(loadRecord(), level.key);
    $('scoreA').textContent = rec.w; $('scoreB').textContent = rec.l;
  } else { $('scoreA').textContent = tally.a; $('scoreB').textContent = tally.b; }
  $('scoreALbl').textContent = 'W'; $('scoreBLbl').textContent = 'W';
  $('undoBtn').disabled = !(state === 'play' && !over && moves.length && (mode === 'pass' || moves.some((_, i) => (i % 2 === 0 ? first : 3 - first) === 1)));
}

/* ---------- controls ---------- */
function undo(){
  if (state !== 'play' || over || mode === 'pvp' || !moves.length) return;
  aiToken++; aiBusy = false; aiGhost = null; pendingReq = null;
  const pop = () => { const c = moves.pop(); heights[c]--; board[at(c, heights[c])] = 0; };
  if (mode === 'pass') pop();
  else {
    if (!moves.some((_, i) => (i % 2 === 0 ? first : 3 - first) === 1)) return;
    pop(); while (moves.length && turnPiece() !== 1) pop();
    assisted = true;
  }
  drops.length = 0;
  BDB.sfx.tick(); talk(L.undo, {force:true});
  refreshHud();
  if (mode === 'bdb' && turnPiece() === 2) bdbTurn();
}
function armed(btn, label, fn){
  const sp = btn.querySelector('span');
  if (btn.classList.contains('armed')){ btn.classList.remove('armed'); sp.textContent = btn.dataset.label; fn(); return; }
  btn.dataset.label = sp.textContent; btn.classList.add('armed'); sp.textContent = label;
  setTimeout(() => { if (btn.classList.contains('armed')){ btn.classList.remove('armed'); sp.textContent = btn.dataset.label; } }, 3000);
}
$('newBtn').onclick = () => { if (mode === 'pass') startPass(true); else startBdb(); };
$('undoBtn').onclick = undo;
$('resignBtn').onclick = () => {
  if (mode !== 'pvp' || state !== 'play') return;
  armed($('resignBtn'), 'Sure?', () => { if (state !== 'play') return; online.send('resign', {}); finish(null, 'resign-me'); });
};
$('menuBtn').onclick = () => {
  if (mode !== 'pvp') return showMenu();
  if (state !== 'play'){ showMenu(); online.openLobby(); return; }
  armed($('menuBtn'), 'Resign?', () => { showMenu(); online.openLobby(); });
};
$('again').onclick = () => {
  if (mode === 'bdb') return startBdb();
  if (mode === 'pass') return startPass(true);
  if (!pvp || pvp.gone) return;
  if (pvp.rematch === 'got'){ online.acceptRematch(); return; }
  pvp.rematch = 'sent'; online.offerRematch(); post('sys', 'Rematch offered'); paintEnd();
};
$('endMenu').onclick = () => { if (mode === 'pvp'){ showMenu(); online.openLobby(); } else showMenu(); };
$('mute').onclick = () => { BDB.sfx.toggle(); paintMute(); };
function paintMute(){ const m = BDB.sfx.muted; $('mute').querySelector('.lbl').textContent = m ? 'Sound off' : 'Sound on'; $('muteWave').style.opacity = m ? .15 : 1; }
paintMute();

// pointer: hover shows the ghost disc, release drops it (drag across columns on touch to pick)
// tapped buttons give focus back, so Space and Enter keep dropping discs
document.addEventListener('pointerup', e => { const b = e.target.closest && e.target.closest('.k-dk, .k-pill'); if (b) setTimeout(() => b.blur(), 0); });
let downOnCanvas = false;
cv.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); hoverCol = colAt(e.clientX - r.left); kbActive = false; });
cv.addEventListener('pointerdown', e => { const r = cv.getBoundingClientRect(); hoverCol = colAt(e.clientX - r.left); downOnCanvas = true; kbActive = false; });
cv.addEventListener('pointerup', e => {
  if (!downOnCanvas) return; downOnCanvas = false;
  const r = cv.getBoundingClientRect(), c = colAt(e.clientX - r.left);
  if (c >= 0) humanDrop(c);
  if (e.pointerType !== 'mouse') hoverCol = -1;
});
cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hoverCol = -1; });
cv.addEventListener('pointercancel', () => { downOnCanvas = false; hoverCol = -1; });

addEventListener('keydown', e => {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (!$('online').hidden){ if (e.key === 'Escape') online.closeLobby(); return; }
  if (e.key === 'Escape' && $('chat').classList.contains('open')){ closeChat(); return; }
  if (!$('splash').hidden){ if (e.key === 'Enter'){ e.preventDefault(); $('play').click(); } return; }
  if (!$('end').hidden){ if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A'){ e.preventDefault(); $('again').click(); } return; }
  if (state !== 'play') return;
  if (/^[1-7]$/.test(e.key)){ e.preventDefault(); kbCol = +e.key - 1; kbActive = true; humanDrop(kbCol); return; }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight'){ e.preventDefault(); if (!kbActive && hoverCol >= 0) kbCol = hoverCol; kbActive = true; hoverCol = -1; kbCol = Math.max(0, Math.min(COLS - 1, kbCol + (e.key === 'ArrowLeft' ? -1 : 1))); return; }
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown'){
    if (tag === 'BUTTON' && e.key !== 'ArrowDown') return;
    e.preventDefault(); kbActive = true; humanDrop(hoverCol >= 0 ? hoverCol : kbCol);
  }
});

/* ---------- title screen ---------- */
let splashMode = store.get('c4-mode') === 'pass' ? 'pass' : 'bdb';
try { const n = JSON.parse(store.get('c4-names') || 'null'); if (n){ $('nameA').value = clean(n.a, 16); $('nameB').value = clean(n.b, 16); } } catch(e){}
const lvlSeg = $('lvlSeg');
for (const l of LEVELS){
  const b = document.createElement('button'); b.type = 'button'; b.textContent = l.name; b.dataset.key = l.key;
  b.onclick = () => { level = l; store.set('c4-level', l.key); paintSplash(); refreshHud(); };
  lvlSeg.appendChild(b);
}
$('firstSeg').querySelectorAll('button').forEach(b => b.onclick = () => { firstChoice = b.dataset.first; store.set('c4-first', firstChoice); paintSplash(); });
$('modeSeg').querySelectorAll('button').forEach(b => b.onclick = () => { splashMode = b.dataset.mode; store.set('c4-mode', splashMode); paintSplash(); });
function paintSplash(){
  $('modeSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === splashMode));
  lvlSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.key === level.key));
  $('firstSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.first === firstChoice));
  $('lvlNote').textContent = level.note;
  $('bdbOpts').hidden = splashMode !== 'bdb'; $('passOpts').hidden = splashMode !== 'pass';
  const rec = recOf(loadRecord(), level.key);
  $('splashRec').textContent = rec.w + rec.l + rec.d ? `Your record vs BDB on ${level.name}: ${rec.w}W ${rec.l}L ${rec.d}D` : `No games vs BDB on ${level.name} yet.`;
}
$('play').onclick = () => { if (splashMode === 'pass') startPass(false); else startBdb(); };
$('playOnline').onclick = () => online.openLobby();
paintSplash(); setBest(); refreshHud();

/* ---------- render loop ---------- */
let last = performance.now();
function frame(now){
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  stepDrops(dt);
  for (let i = parts.length - 1; i >= 0; i--){
    const p = parts[i]; p.t += dt;
    if (p.t >= p.life){ parts.splice(i, 1); continue; }
    p.vy += (p.rect ? 700 : cell * 30) * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.rect){ p.vx *= .99; p.rot += dt * 6; }
  }
  shake *= Math.pow(.02, dt);
  if (aiGhost){
    const ag = aiGhost, t = (now - ag.t0) / 1000;
    if (ag.chosen < 0 && t > ag.wander){ ag.target = Math.max(0, Math.min(COLS - 1, ag.target + pick([-2, -1, 1, 2]))); ag.t0 = now; ag.wander = .3 + Math.random() * .4; }
    ag.x += (colX(ag.target) - ag.x) * Math.min(1, dt * (ag.chosen >= 0 ? 16 : 7));
    ag.y = ghostY() + Math.sin(now / 160) * cell * .04;
  }
  draw(now);
  requestAnimationFrame(frame);
}
function drawDisc(piece, x, y, scale = 1){
  const s = piece === 1 ? spriteO : spriteN; if (!s) return;
  const w = s.width / DPR * scale;
  cx.drawImage(s, x - w / 2, y - w / 2, w, w);
}
function draw(now){
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  cx.clearRect(0, 0, W, H);
  if (shake > .3){ cx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake); }
  // legs and shadow
  cx.fillStyle = 'rgba(0,0,0,.35)'; cx.beginPath(); cx.ellipse(bx + bw / 2, by + bh + cell * .32, bw * .55, cell * .2, 0, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = '#0f275c';
  for (const fx of [bx + cell * .9, bx + bw - cell * .9]){
    const y0 = by + bh - 4, y1 = by + bh + cell * .3;
    cx.beginPath(); cx.moveTo(fx - cell * .28, y0); cx.lineTo(fx + cell * .28, y0); cx.lineTo(fx + cell * .5, y1); cx.lineTo(fx - cell * .5, y1); cx.closePath(); cx.fill();
  }
  // inside of the board
  cx.fillStyle = '#040a18'; cx.beginPath(); cx.roundRect(bx + 3, by + 3, bw - 6, bh - 6, cell * .25); cx.fill();
  const lifted = new Set(drops.map(d => at(d.c, d.r)));
  const pulse = winCells && performance.now() - winT > 0 ? 1 + Math.sin(now / 130) * .05 : 1;
  for (let c = 0; c < COLS; c++) for (let r = 0; r < heights[c]; r++){
    const idx = at(c, r); if (lifted.has(idx)) continue;
    drawDisc(board[idx], colX(c), cellY(r), winCells && winCells.includes(idx) && !drops.length ? pulse : 1);
  }
  for (const d of drops) drawDisc(d.piece, colX(d.c), d.y);
  if (frameC) cx.drawImage(frameC, bx, by, bw, bh);

  // column highlight + ghost disc
  const showCol = humanTurn() ? (kbActive ? kbCol : hoverCol) : -1;
  if (showCol >= 0){
    const x = bx + pad + showCol * cell;
    const g = cx.createLinearGradient(0, by, 0, by + bh);
    g.addColorStop(0, 'rgba(242,193,78,.16)'); g.addColorStop(1, 'rgba(242,193,78,.02)');
    cx.fillStyle = g; cx.fillRect(x + cell * .06, by + 2, cell * .88, bh - 4);
    if (legal(showCol)){
      cx.globalAlpha = .6 + Math.sin(now / 220) * .12;
      drawDisc(mode === 'pass' ? turnPiece() : 1, colX(showCol), ghostY() + Math.sin(now / 260) * cell * .05);
      cx.globalAlpha = 1;
      // landing spot marker
      cx.strokeStyle = 'rgba(242,193,78,.55)'; cx.lineWidth = 2; cx.setLineDash([4, 4]);
      cx.beginPath(); cx.arc(colX(showCol), cellY(heights[showCol]), cell * .36, 0, Math.PI * 2); cx.stroke(); cx.setLineDash([]);
    }
  } else if (!coarse && humanTurn() && !drops.length){
    cx.font = `500 ${Math.round(cell * .42)}px Teko, "Arial Narrow", sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillStyle = 'rgba(143,163,204,.35)';
    for (let c = 0; c < COLS; c++) cx.fillText(String(c + 1), colX(c), ghostY() + cell * .1);
  }
  if (aiGhost){ cx.globalAlpha = .85; drawDisc(2, aiGhost.x, aiGhost.y); cx.globalAlpha = 1; }

  // winning line
  if (winCells && !drops.length){
    const t = Math.min(1, (performance.now() - winT) / 420);
    const a = winCells[0], b = winCells[winCells.length - 1];
    const ax = colX((a / ROWS) | 0), ay = cellY(a % ROWS), bxx = colX((b / ROWS) | 0), byy = cellY(b % ROWS);
    cx.save();
    cx.lineCap = 'round'; cx.shadowColor = '#f2c14e'; cx.shadowBlur = cell * .5;
    cx.strokeStyle = `rgba(255,226,140,${.75 + Math.sin(now / 150) * .2})`; cx.lineWidth = cell * .16;
    cx.beginPath(); cx.moveTo(ax, ay); cx.lineTo(ax + (bxx - ax) * t, ay + (byy - ay) * t); cx.stroke();
    cx.shadowBlur = 0; cx.strokeStyle = '#fff6d8'; cx.lineWidth = cell * .05;
    cx.beginPath(); cx.moveTo(ax, ay); cx.lineTo(ax + (bxx - ax) * t, ay + (byy - ay) * t); cx.stroke();
    cx.strokeStyle = 'rgba(242,193,78,.9)'; cx.lineWidth = cell * .06;
    for (const idx of winCells){ cx.beginPath(); cx.arc(colX((idx / ROWS) | 0), cellY(idx % ROWS), cell * .42 * pulse, 0, Math.PI * 2); cx.stroke(); }
    cx.restore();
  }
  for (const p of parts){
    cx.globalAlpha = Math.max(0, 1 - p.t / p.life); cx.fillStyle = p.c;
    if (p.rect){ cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillRect(-p.s / 2, -p.s * .3, p.s, p.s * .6); cx.restore(); }
    else { cx.beginPath(); cx.arc(p.x, p.y, p.s, 0, Math.PI * 2); cx.fill(); }
  }
  cx.globalAlpha = 1;
}
resize();
requestAnimationFrame(frame);
chatSideMQ.addEventListener('change', layout);

/* ---------- test hook ---------- */
window.__game = {
  get state(){ return state; }, get score(){ return lastScore; }, get mode(){ return mode; }, get over(){ return over; },
  get winner(){ return winner; }, get moves(){ return moves.slice(); }, get turn(){ return turnPiece(); }, get first(){ return first; },
  get aiBusy(){ return aiBusy; }, get lastAI(){ return lastAI; }, get level(){ return level.key; }, get drops(){ return drops.length; },
  get pvp(){ return pvp && {...pvp}; }, get tally(){ return {...tally}; }, get worker(){ return !!worker; },
  board(){ return Array.from(board); }, drop: humanDrop, colX, cellY: r => cellY(r), get ghostY(){ return ghostY(); },
  setLevel(k){ const l = LEVELS.find(x => x.key === k); if (l){ level = l; paintSplash(); } },
  setFirst(f){ firstChoice = f; paintSplash(); }, startBdb, online
};
