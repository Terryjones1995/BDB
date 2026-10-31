import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

/* =========================================================
   Charleston Chess: 3D chess vs BDB
   Rules: chess.js. Opponent: Stockfish.js in a Web Worker.
   ========================================================= */

const Chess = window.Chess;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = id => document.getElementById(id);
const store = {
  get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch(e){} }
};

/* ---------- levels ---------- */
const LEVELS = [
  {key:'rec',     name:'Rec League', short:'REC', skill:0,  go:'depth 1',       note:'Plays like BDB on a Tuesday. Hangs pieces.'},
  {key:'jv',      name:'JV',         short:'JV',  skill:4,  go:'depth 3',       note:'Knows how the pieces move. Mostly.'},
  {key:'varsity', name:'Varsity',    short:'VAR', skill:9,  go:'depth 6',       note:'Solid club player. Punishes free pieces.'},
  {key:'d1',      name:'D1',         short:'D1',  skill:15, go:'movetime 900',  note:'Strong. Most people lose here.'},
  {key:'pro',     name:'Pro',        short:'PRO', skill:20, go:'movetime 1800', note:'Full-strength Stockfish. BDB never made it to the pros. His engine did.'}
];

/* ---------- trash talk ---------- */
const L = {
  start:["Tip-off. BDB's playing like it's Florida tryouts. Same result incoming, hopefully.",
    "BDB studied for this. He watched one video on his break.",
    "New game. BDB's confidence: 99. His chess rating: classified.",
    "BDB says he's undefeated at chess. He's played twice. Both against the vending machine."],
  think:["BDB is thinking. Rare.","Hold on, he's checking the shift schedule.","Thinking. Same face he makes at the time clock.",
    "He's calculating. First time since he added up his points per game.","BDB is consulting a scout. The scout is a computer."],
  youTake:{
    p:["You took a pawn. BDB says it was a bench player anyway.","Pawn down. BDB's still up 99 confidence.","BDB lost a pawn. That pawn had more minutes than he did."],
    n:["You took his horse. BDB just lost his only fast break.","Knight's gone. His hops left with it."],
    b:["Bishop down. BDB never could cover the diagonals.","You took his bishop. He's blaming the ref."],
    r:["Rook gone. Like his scholarship.","You took his tower. Crumbling like his Florida story."],
    q:["You took his QUEEN. BDB hasn't been this shook since cut day.","No queen. He's about to ask for a takeback and a timeout."]
  },
  heTakes:{
    p:["BDB took a pawn and celebrated like it was a buzzer beater.","One pawn. That's about his points per game in material.","BDB took a pawn. He's calling his mom about it."],
    n:["BDB took your knight. First steal of his career.","Your horse is gone. BDB's acting like he planned that."],
    b:["BDB took your bishop. He's going to talk about this one at work.","Bishop gone. BDB says he saw it coming. He did not."],
    r:["BDB took your rook. Somebody check the engine, this can't be him.","Your rook's gone. BDB is doing a lap around the break room."],
    q:["BDB took your queen. He's going to tell this story for 10 years.","Your queen's gone. Added to his highlight reel. It's still 9 seconds long."]
  },
  checkHim:["Check! BDB's sweating through the lanyard.","Check. His king is running like it's the end of a shift.","Check. BDB is looking for the exit. Employee door's that way."],
  checkYou:["Check. First time BDB has ever pressured anyone.","BDB says check. He's been waiting all game to say something confident."],
  mateFor:[n=>`Mate in ${n}. Trash can.`, n=>`BDB's engine sees mate in ${n}. BDB doesn't, but the engine does.`, n=>`Mate in ${n}. Start packing up, trash can.`,
    n=>`Mate in ${n}. First time BDB's ever been ahead of schedule.`, n=>`Mate in ${n}. Should've stayed on the bench, trash can.`, n=>`Mate in ${n}. Clock out early, it's over.`],
  mateOne:["Mate in 1. Trash can. Say goodnight.","Mate in 1. BDB's already practising his celebration. It's bad."],
  mateAgainst:[n=>`Uh oh. BDB's engine sees mate in ${n}. Against BDB.`, n=>`Mate in ${n} for you. BDB's asking if he can clock out early.`, n=>`The engine says BDB's getting mated in ${n}. Feels like Florida.`],
  crushing:["BDB's engine says you're cooked. Trash can energy.","Engine says you're down big. Worse than BDB's tryout, and that's saying something."],
  losing:["BDB's engine says he's losing badly. Classic BDB.","Engine says BDB's down big. Feels like home for him."],
  castleHim:["BDB castled. Hiding his king like he hides his stats."],
  castleYou:["You castled. Smart. BDB thinks castling is a Disney ride."],
  promoteYou:["Pawn to queen. Bigger glow-up than BDB's whole career."],
  promoteHim:["BDB promoted a pawn. Only promotion he's ever gotten."],
  bad:["Can't go there. Like BDB can't go to his left.","Illegal. BDB knows that word from his jump shot.","Nope. Travelling."],
  undo:["Takeback? BDB asks for those every shift.","Undo. BDB wishes he had that button in Florida."],
  hint:["The scout says this one. First time a scout's talked to anyone around here.","Hint's lit up. BDB is furious, he never got coaching."],
  win:["You beat BDB. He's calling it a moral victory.","Checkmate. BDB wants a rematch and a better ref.","Game over. BDB's averaging zero wins per game now."],
  lose:["BDB won. Nobody tell him, he'll never shut up.","Checkmate. BDB's taking a victory lap around the break room.","BDB got you. He's bringing this up every shift."],
  draw:["Draw. BDB's counting it as a win anyway.","Nobody wins. BDB's used to that."]
};
const KILL = {
  p:{name:'PAWN SHIV',      sub:'Shattered'},
  n:{name:'HORSE KICK',     sub:'Launched off the court'},
  b:{name:'DIAGONAL SLICE', sub:'Cut in half'},
  r:{name:'TOWER SLAM',     sub:'Flattened'},
  q:{name:'ROYAL BLAST',    sub:'Vaporized'},
  k:{name:"KING'S STOMP",   sub:'Buried'}
};
const pick = a => a[Math.floor(Math.random()*a.length)];

const sayEl = $('sayText'), tallyEl = $('tally'), avEl = $('av');
let typeId = null, msgId = 0;
function sayText(t, tag){
  msgId++;
  tallyEl.textContent = tag || '';
  clearInterval(typeId);
  avEl.classList.remove('talk'); void avEl.offsetWidth; avEl.classList.add('talk');
  if (REDUCED){ sayEl.textContent = t; return; }
  let i = 0; sayEl.textContent = ''; sayEl.classList.add('typing');
  typeId = setInterval(()=>{ i = Math.min(t.length, i+2); sayEl.textContent = t.slice(0,i);
    if (i >= t.length){ clearInterval(typeId); sayEl.classList.remove('typing'); } }, 18);
}
const say = arr => sayText(pick(arr));
// say one line, then follow it with another (a roast by default) once it's had time to land
function sayThen(line, next){
  sayText(line);
  const id = msgId;
  setTimeout(()=>{ if (id === msgId) (typeof next === 'string' ? sayText(next) : roast()); }, 2600 + line.length*25);
}
// shared roast deck with solitaire
const ROASTS = window.ROASTS || [];
let roastOrder = null, roastPos = 0;
function shuffleRoasts(){ roastOrder = ROASTS.map((_,i)=>i); for (let i=roastOrder.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [roastOrder[i],roastOrder[j]]=[roastOrder[j],roastOrder[i]]; } roastPos = 0; }
try { const o = JSON.parse(store.get('cs-roasts')); if (o && o.order && o.order.length===ROASTS.length){ roastOrder=o.order; roastPos=o.pos||0; } } catch(e){}
if (!roastOrder) shuffleRoasts();
function roast(){
  if (!ROASTS.length) return;
  if (roastPos >= roastOrder.length) shuffleRoasts();
  const n = roastOrder[roastPos++];
  store.set('cs-roasts', JSON.stringify({order:roastOrder,pos:roastPos}));
  sayText(ROASTS[n], `Roast ${roastPos} / ${ROASTS.length}`);
}

/* ---------- engine ---------- */
class Engine {
  constructor(){
    this.pending = null; this.skip = 0; this.w = null;
    try {
      this.w = new Worker('engine/stockfish.js');
      this.w.onmessage = e => this.line(String(e.data ?? ''));
      this.w.onerror = () => { this.w = null; if (this.pending){ const r=this.pending; this.pending=null; r(null); } };
      this.w.postMessage('uci'); this.w.postMessage('isready');
    } catch(e){ this.w = null; }
  }
  line(s){
    if (s.startsWith('info') && !this.skip){
      const m = s.match(/score (cp|mate) (-?\d+)/);
      if (m && !/(lower|upper)bound/.test(s)) this.score = {type:m[1], v:+m[2]};
      return;
    }
    if (!s.startsWith('bestmove')) return;
    if (this.skip > 0){ this.skip--; return; }
    if (!this.pending) return;
    const r = this.pending; this.pending = null; clearTimeout(this.timer);
    const m = s.split(/\s+/)[1];
    r(m && m !== '(none)' ? m : null);
  }
  best(fen, skill, go){
    return new Promise(res=>{
      if (!this.w){ res(null); return; }
      if (this.pending){ const r=this.pending; this.pending=null; this.skip++; this.w.postMessage('stop'); r(null); }
      this.pending = res; this.score = null;
      this.w.postMessage('setoption name Skill Level value ' + skill);
      this.w.postMessage('position fen ' + fen);
      this.w.postMessage('go ' + go);
      clearTimeout(this.timer);
      this.timer = setTimeout(()=>{ if (this.pending) this.w && this.w.postMessage('stop'); }, 9000);
    });
  }
  cancel(){ if (this.pending && this.w){ const r=this.pending; this.pending=null; this.skip++; this.w.postMessage('stop'); r(null); } }
  newGame(){ this.w && this.w.postMessage('ucinewgame'); }
}
const engine = new Engine();

/* ---------- renderer / scene ---------- */
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .82;
renderer.localClippingEnabled = true;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x050c1c, 22, 46);
// studio reflections so the lacquer and ivory read as real materials
{ const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose(); }
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
camera.position.set(0, 10.5, 10.2);
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, {enablePan:false, enableDamping:true, dampingFactor:.08, minDistance:8, maxDistance:34,
  minPolarAngle:.2, maxPolarAngle:1.28, rotateSpeed:.6, autoRotateSpeed:.7});
controls.target.set(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x120c06, .25));
const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
key.position.set(4, 12, 6); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, {left:-7, right:7, top:7, bottom:-7, near:1, far:32});
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
scene.add(key);
const fill = new THREE.DirectionalLight(0x9fc0ff, .55); fill.position.set(-6, 5, -8); scene.add(fill);
for (const x of [-10, 10]){
  const s = new THREE.SpotLight(0x6aa2ff, 220, 40, .45, .6, 1.4);
  s.position.set(x, 11, -7); scene.add(s);
}
const warm = new THREE.PointLight(0xff8a2b, 30, 26, 1.6); warm.position.set(0, 3, 10); scene.add(warm);

/* ---------- textures ---------- */
function woodTex(base, streak, vertical){
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0,0,256,256);
  for (let i=0;i<80;i++){
    x.strokeStyle = streak; x.globalAlpha = Math.random()*.16; x.lineWidth = Math.random()*3+.5;
    const o = Math.random()*256; x.beginPath();
    for (let k=0;k<=256;k+=8){ const w = o + Math.sin(k*.025+i)*4; vertical ? x.lineTo(w,k) : x.lineTo(k,w); }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function dotTex(){
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); const g = x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(.35,'rgba(255,255,255,.7)'); g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}
function labelTex(ch){
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); x.fillStyle = '#f2c14e'; x.font = '700 40px Figtree, system-ui, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const DOT = dotTex();
const faceTex = new THREE.TextureLoader().load('../assets/face.jpg'); faceTex.colorSpace = THREE.SRGBColorSpace;

/* ---------- board ---------- */
const FILES = 'abcdefgh';
const sqPos = sq => new THREE.Vector3(FILES.indexOf(sq[0]) - 3.5, 0, 3.5 - (+sq[1] - 1));
const tiles = [];
{
  const geo = new THREE.BoxGeometry(1, .2, 1);
  const light = [false, true].map(v => new THREE.MeshStandardMaterial({map:woodTex('#c99b5f','#6e4216',v), roughness:.5, envMapIntensity:.45}));
  const dark = [false, true].map(v => new THREE.MeshStandardMaterial({map:woodTex('#183d88','#081a3e',v), roughness:.42, envMapIntensity:.55}));
  for (let f=0;f<8;f++) for (let r=0;r<8;r++){
    const isLight = (f + r) % 2 === 1;
    const m = new THREE.Mesh(geo, (isLight ? light : dark)[(f*3+r)%2]);
    m.position.set(f-3.5, -.1, 3.5-r); m.receiveShadow = true;
    m.userData.square = FILES[f] + (r+1);
    scene.add(m); tiles.push(m);
  }
  const frameMat = new THREE.MeshStandardMaterial({map:woodTex('#3e240b','#1a0e03',false), roughness:.38, envMapIntensity:.7});
  const goldMat = new THREE.MeshStandardMaterial({color:0xf2c14e, metalness:.85, roughness:.3});
  const bar = (w,d,x,z,mat,h=.36,y=-.12) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat); b.position.set(x,y,z); b.receiveShadow = b.castShadow = true; scene.add(b); };
  bar(9.3,.65,0,4.33,frameMat); bar(9.3,.65,0,-4.33,frameMat); bar(.65,8,4.33,0,frameMat); bar(.65,8,-4.33,0,frameMat);
  bar(8.12,.06,0,4.03,goldMat,.05,.04); bar(8.12,.06,0,-4.03,goldMat,.05,.04); bar(.06,8.12,4.03,0,goldMat,.05,.04); bar(.06,8.12,-4.03,0,goldMat,.05,.04);
  const lg = new THREE.PlaneGeometry(.34,.34);
  for (let i=0;i<8;i++){
    for (const side of [1,-1]){
      const fl = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({map:labelTex(FILES[i]), transparent:true}));
      fl.rotation.x = -Math.PI/2; if (side<0) fl.rotation.z = Math.PI; fl.position.set(i-3.5, .065, side*4.36); scene.add(fl);
      const rl = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({map:labelTex(String(i+1)), transparent:true}));
      rl.rotation.x = -Math.PI/2; if (side<0) rl.rotation.z = Math.PI; rl.position.set(side*4.36, .065, 3.5-i); scene.add(rl);
    }
  }
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({color:0x060d1d, roughness:.85, envMapIntensity:.2}));
  floor.rotation.x = -Math.PI/2; floor.position.y = -.31; floor.receiveShadow = true; scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(6.6, 6.7, 96), new THREE.MeshBasicMaterial({color:0x2a4a86, transparent:true, opacity:.5}));
  ring.rotation.x = -Math.PI/2; ring.position.y = -.3; scene.add(ring);
}

/* ---------- pieces ---------- */
const MAT = {
  w: new THREE.MeshPhysicalMaterial({color:0xefe3cc, roughness:.36, clearcoat:.5, clearcoatRoughness:.2, envMapIntensity:.9}),
  b: new THREE.MeshPhysicalMaterial({color:0x0e121d, roughness:.2, metalness:.1, clearcoat:1, clearcoatRoughness:.06, envMapIntensity:1.5}),
  bandw: new THREE.MeshStandardMaterial({color:0xff8a2b, roughness:.4}),
  bandb: new THREE.MeshStandardMaterial({color:0xf2c14e, metalness:.6, roughness:.3}),
  gold: new THREE.MeshStandardMaterial({color:0xf2c14e, metalness:.85, roughness:.25}),
  eye: new THREE.MeshStandardMaterial({color:0x0a0a0a, roughness:.2}),
  face: new THREE.MeshStandardMaterial({map:faceTex, roughness:.55}),
  contact: new THREE.MeshBasicMaterial({map:DOT, color:0x000000, transparent:true, opacity:.55, depthWrite:false})
};
const lathe = pts => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), 40);
const BASE = [[0,0],[.38,0],[.39,.03],[.38,.08],[.33,.1],[.3,.13]];
const GEO = {
  p: lathe([...BASE,[.22,.17],[.17,.24],[.14,.36],[.2,.39],[.2,.42],[.12,.45],[0,.45]]),
  r: lathe([...BASE,[.27,.18],[.25,.25],[.23,.6],[.29,.64],[.3,.82],[.24,.82],[.24,.76],[0,.76]]),
  b: lathe([...BASE,[.24,.18],[.18,.26],[.13,.5],[.21,.55],[.21,.59],[.11,.62],[0,.62]]),
  q: lathe([...BASE,[.26,.18],[.2,.26],[.13,.66],[.24,.72],[.24,.76],[.15,.79],[.2,.92],[.25,.98],[.22,1],[0,.94]]),
  k: lathe([...BASE,[.27,.18],[.21,.27],[.14,.72],[.25,.78],[.25,.82],[.16,.85],[.22,.99],[.19,1.05],[0,1.07]]),
  nBase: lathe([...BASE,[.27,.18],[.25,.24],[0,.24]]),
  pawnHead: new THREE.SphereGeometry(.16, 32, 20),
  mitre: new THREE.SphereGeometry(.16, 32, 24),
  ball: new THREE.SphereGeometry(.055, 16, 12),
  bigBall: new THREE.SphereGeometry(.075, 16, 12),
  crenel: new THREE.BoxGeometry(.11, .12, .09),
  crossV: new THREE.BoxGeometry(.07, .28, .07),
  crossH: new THREE.BoxGeometry(.21, .07, .07),
  band: new THREE.TorusGeometry(.36, .028, 10, 48),
  medal: new THREE.CircleGeometry(.125, 32),
  medalRing: new THREE.TorusGeometry(.128, .016, 8, 40),
  eye: new THREE.SphereGeometry(.028, 10, 8),
  contact: new THREE.PlaneGeometry(1.05, 1.05)
};
GEO.horse = (()=>{
  const s = new THREE.Shape();
  s.moveTo(-.22, 0); s.lineTo(.22, 0);
  s.quadraticCurveTo(.25, .1, .14, .2);     // chest into neck
  s.quadraticCurveTo(.1, .27, .2, .33);     // throat
  s.lineTo(.36, .37);                       // jaw
  s.quadraticCurveTo(.43, .39, .42, .46);   // muzzle
  s.quadraticCurveTo(.41, .53, .31, .55);   // nose
  s.quadraticCurveTo(.2, .58, .15, .66);    // forehead
  s.lineTo(.13, .8); s.lineTo(.05, .71);    // ear
  s.quadraticCurveTo(-.04, .71, -.12, .63); // poll
  s.quadraticCurveTo(-.23, .5, -.25, .32);  // mane
  s.quadraticCurveTo(-.28, .15, -.22, 0);
  const g = new THREE.ExtrudeGeometry(s, {depth:.24, bevelEnabled:true, bevelThickness:.04, bevelSize:.035, bevelSegments:3, curveSegments:14});
  g.translate(0, 0, -.12); return g;
})();

function mesh(geo, mat, x=0, y=0, z=0){ const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true; return m; }
const innerOf = o => o.children[0];
let playerColor = 'w';

function makePiece(type, color, sq){
  const outer = new THREE.Group(), inner = new THREE.Group();
  outer.add(inner);
  const M = MAT[color];
  const band = mesh(GEO.band, MAT['band'+color], 0, .065, 0); band.rotation.x = Math.PI/2; inner.add(band);
  if (type === 'n'){
    inner.add(mesh(GEO.nBase, M));
    const head = mesh(GEO.horse, M, 0, .2, 0); inner.add(head);
    inner.add(mesh(GEO.eye, MAT.eye, .24, .73, .145), mesh(GEO.eye, MAT.eye, .24, .73, -.145));
    // three-quarter turn so the horse's profile shows from either side of the board
    for (let k=0;k<5;k++){ const t = k/4; inner.add(mesh(GEO.ball, MAT['band'+color], -.25 + t*.13 - Math.sin(t*Math.PI)*.03, .5 + t*.38, 0)); }
    outer.rotation.y = color === 'w' ? Math.PI*.75 : -Math.PI*.25;
  } else {
    inner.add(mesh(GEO[type], M));
    if (type === 'p') inner.add(mesh(GEO.pawnHead, M, 0, .58, 0));
    if (type === 'r') for (let k=0;k<6;k++){ const a = k*Math.PI/3; const c = mesh(GEO.crenel, M, Math.sin(a)*.25, .88, Math.cos(a)*.25); c.rotation.y = a; inner.add(c); }
    if (type === 'b'){ const m = mesh(GEO.mitre, M, 0, .8, 0); m.scale.set(1, 1.4, 1); inner.add(m, mesh(GEO.ball, M, 0, 1.04, 0)); }
    if (type === 'q'){ for (let k=0;k<8;k++){ const a = k*Math.PI/4; inner.add(mesh(GEO.ball, MAT.gold, Math.sin(a)*.22, 1.0, Math.cos(a)*.22)); } inner.add(mesh(GEO.bigBall, MAT.gold, 0, 1.03, 0)); }
    if (type === 'k'){ inner.add(mesh(GEO.crossV, MAT.gold, 0, 1.22, 0), mesh(GEO.crossH, MAT.gold, 0, 1.25, 0)); }
    if (type === 'k' || type === 'q'){
      const y = type === 'k' ? .5 : .46, z = type === 'k' ? .175 : .17;
      const medal = new THREE.Mesh(GEO.medal, MAT.face); medal.position.set(0, y, z+.012); medal.rotation.x = -.16; inner.add(medal);
      const ring = mesh(GEO.medalRing, MAT.gold, 0, y, z+.01); ring.rotation.x = -.16; inner.add(ring);
    }
    outer.rotation.y = playerColor === 'w' ? 0 : Math.PI; // face medallions toward the player
  }
  const contact = new THREE.Mesh(GEO.contact, MAT.contact); contact.rotation.x = -Math.PI/2; contact.position.y = .003; contact.renderOrder = 1; outer.add(contact);
  outer.userData = {type, color, square:sq};
  outer.position.copy(sqPos(sq));
  scene.add(outer);
  return outer;
}

/* ---------- markers ---------- */
const overlayGeo = new THREE.PlaneGeometry(1, 1);
function tileOverlay(color, opacity){
  const m = new THREE.Mesh(overlayGeo, new THREE.MeshBasicMaterial({color, transparent:true, opacity, depthWrite:false}));
  m.rotation.x = -Math.PI/2; m.position.y = .004; m.visible = false; m.renderOrder = 1; scene.add(m); return m;
}
const lastFrom = tileOverlay(0xf2c14e, .28), lastTo = tileOverlay(0xf2c14e, .38);
const checkMark = tileOverlay(0xff3b2f, .55);
const hintFrom = tileOverlay(0x4ade80, .45), hintTo = tileOverlay(0x4ade80, .45);
const selRing = new THREE.Mesh(new THREE.RingGeometry(.4, .48, 48), new THREE.MeshBasicMaterial({color:0xf2c14e, transparent:true, opacity:.95, depthWrite:false}));
selRing.rotation.x = -Math.PI/2; selRing.position.y = .006; selRing.visible = false; scene.add(selRing);
const dotGeo = new THREE.CircleGeometry(.14, 32), capGeo = new THREE.RingGeometry(.36, .46, 48);
const dotMat = new THREE.MeshBasicMaterial({color:0xf2c14e, transparent:true, opacity:.85, depthWrite:false});
const capMat = new THREE.MeshBasicMaterial({color:0xff6b3d, transparent:true, opacity:.9, depthWrite:false});
const targetGroup = new THREE.Group(); scene.add(targetGroup);

/* ---------- tiny animation kit ---------- */
const tweens = [];
const ease = {
  io: p => p<.5 ? 2*p*p : 1-Math.pow(-2*p+2,2)/2,
  out: p => 1-Math.pow(1-p,3),
  in: p => p*p*p,
  lin: p => p,
  back: p => { const c=1.70158, c3=c+1; return 1 + c3*Math.pow(p-1,3) + c*Math.pow(p-1,2); }
};
function tween(dur, fn, e = ease.io){
  if (REDUCED || dur <= 0){ fn(1, 1); return Promise.resolve(); }
  return new Promise(res => tweens.push({t:0, dur, fn, e, res}));
}
const wait = s => tween(s, ()=>{}, ease.lin);
const updaters = new Set();
let shakeAmt = 0, shakeDecay = 0;
function shake(a, d){ if (REDUCED) return; shakeAmt = Math.max(shakeAmt, a); shakeDecay = a / d; }

function glide(obj, to, arc = .3, dur = .42){
  const from = obj.position.clone();
  return tween(dur, p => { obj.position.lerpVectors(from, to, p); obj.position.y = from.y + (to.y-from.y)*p + Math.sin(Math.PI*p)*arc; });
}
function ownMaterials(obj){
  obj.traverse(m => { if (m.isMesh && !m.userData.own){ m.material = m.material.clone(); m.material.transparent = true; m.userData.own = true; } });
}
function fade(obj, dur, delay = 0){
  ownMaterials(obj);
  return wait(delay).then(()=>tween(dur, p => obj.traverse(m => { if (m.isMesh) m.material.opacity = 1-p; }), ease.lin));
}
function dispose(obj){
  scene.remove(obj);
  obj.traverse(m => { if (m.isMesh && m.userData.own) m.material.dispose(); });
}
function burst({pos, count = 40, color = 0xffffff, speed = 3, up = 2, gravity = 6, size = .14, life = 1, spread = 1, rise = 0, additive = true}){
  if (REDUCED) return;
  const g = new THREE.BufferGeometry();
  const P = new Float32Array(count*3), V = new Float32Array(count*3);
  for (let i=0;i<count;i++){
    P[i*3] = pos.x + (Math.random()-.5)*.2*spread; P[i*3+1] = pos.y + Math.random()*.2; P[i*3+2] = pos.z + (Math.random()-.5)*.2*spread;
    const a = Math.random()*Math.PI*2, s = speed*(.4+Math.random()*.8);
    V[i*3] = Math.cos(a)*s*spread; V[i*3+1] = up*(.3+Math.random()) + rise; V[i*3+2] = Math.sin(a)*s*spread;
  }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  const m = new THREE.PointsMaterial({color, size, map:DOT, transparent:true, depthWrite:false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending});
  const pts = new THREE.Points(g, m); scene.add(pts);
  let t = 0;
  updaters.add(function u(dt){
    t += dt;
    for (let i=0;i<count;i++){
      V[i*3+1] -= gravity*dt; V[i*3] *= .985; V[i*3+2] *= .985;
      P[i*3] += V[i*3]*dt; P[i*3+1] += V[i*3+1]*dt; P[i*3+2] += V[i*3+2]*dt;
      if (P[i*3+1] < .02 && gravity > 0){ P[i*3+1] = .02; V[i*3+1] *= -.3; }
    }
    g.attributes.position.needsUpdate = true;
    m.opacity = Math.max(0, 1 - t/life);
    if (t >= life){ scene.remove(pts); g.dispose(); m.dispose(); updaters.delete(u); }
  });
}
const shardGeo = new THREE.TetrahedronGeometry(.08);
function shatter(victim, count = 26, power = 3){
  if (REDUCED) return;
  const base = victim.position.clone();
  let mat; victim.traverse(m => { if (!mat && m.isMesh && m.geometry !== GEO.band) mat = m.material; });
  const sm = mat.clone(); sm.transparent = true;
  const parts = [];
  for (let i=0;i<count;i++){
    const s = new THREE.Mesh(shardGeo, sm); s.castShadow = true;
    s.position.set(base.x + (Math.random()-.5)*.4, .1 + Math.random()*.7, base.z + (Math.random()-.5)*.4);
    s.scale.setScalar(.6 + Math.random()*1.1);
    const a = Math.random()*Math.PI*2, sp = power*(.4+Math.random());
    parts.push({s, v:new THREE.Vector3(Math.cos(a)*sp, 2+Math.random()*power*1.2, Math.sin(a)*sp), w:new THREE.Vector3(Math.random()*12, Math.random()*12, Math.random()*12)});
    scene.add(s);
  }
  let t = 0;
  updaters.add(function u(dt){
    t += dt;
    for (const p of parts){
      p.v.y -= 9.8*dt; p.s.position.addScaledVector(p.v, dt);
      p.s.rotation.x += p.w.x*dt; p.s.rotation.y += p.w.y*dt; p.s.rotation.z += p.w.z*dt;
      const onBoard = Math.abs(p.s.position.x) < 4.6 && Math.abs(p.s.position.z) < 4.6;
      const floorY = onBoard ? .05 : -.27;
      if (p.s.position.y < floorY){ p.s.position.y = floorY; p.v.y *= -.35; p.v.x *= .6; p.v.z *= .6; p.w.multiplyScalar(.6); }
    }
    sm.opacity = t < 1.1 ? 1 : Math.max(0, 1 - (t-1.1)/.6);
    if (t > 1.75){ parts.forEach(p => scene.remove(p.s)); sm.dispose(); updaters.delete(u); }
  });
}
function shockwave(pos, color, maxScale = 5, dur = .6){
  if (REDUCED) return;
  const r = new THREE.Mesh(new THREE.RingGeometry(.3, .42, 64), new THREE.MeshBasicMaterial({color, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide}));
  r.rotation.x = -Math.PI/2; r.position.set(pos.x, .03, pos.z); scene.add(r);
  tween(dur, p => { r.scale.setScalar(1 + p*maxScale); r.material.opacity = 1-p; }, ease.out).then(()=>{ scene.remove(r); r.geometry.dispose(); r.material.dispose(); });
}
function flash(pos, color, intensity = 60, dur = .35){
  if (REDUCED) return;
  const l = new THREE.PointLight(color, intensity, 9, 1.5); l.position.set(pos.x, 1.2, pos.z); scene.add(l);
  tween(dur, p => { l.intensity = intensity*(1-p); }, ease.out).then(()=>scene.remove(l));
}
function banner(type, who){
  if (REDUCED) return;
  const d = document.createElement('div');
  d.className = 'kill' + (who === 'bdb' ? ' bdb' : '');
  d.innerHTML = `${KILL[type].name}<small>${KILL[type].sub}</small>`;
  stage.appendChild(d); setTimeout(()=>d.remove(), 1300);
}
function bolt(from, to){
  const pts = [from.clone()];
  for (let i=1;i<9;i++){
    const p = from.clone().lerp(to, i/9);
    p.x += (Math.random()-.5)*.55; p.z += (Math.random()-.5)*.55;
    pts.push(p);
  }
  pts.push(to.clone());
  const path = new THREE.CurvePath();
  for (let i=0;i<pts.length-1;i++) path.add(new THREE.LineCurve3(pts[i], pts[i+1]));
  return new THREE.Mesh(new THREE.TubeGeometry(path, 60, .035, 5, false),
    new THREE.MeshBasicMaterial({color:0xcfe9ff, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false}));
}

/* ---------- kill moves (picked by the attacking piece) ---------- */
const KILLS = {
  // Pawn Shiv: quick lunge, the victim wobbles and shatters
  async p(A, V, to, who){
    banner('p', who);
    const dir = to.clone().sub(A.position).setY(0).normalize();
    await glide(A, to.clone().addScaledVector(dir, -.55), .12, .22);
    const vi = innerOf(V);
    await tween(.2, p => { vi.rotation.z = Math.sin(p*Math.PI*5)*.22*(1-p); vi.rotation.x = Math.sin(p*Math.PI*4)*.12*(1-p); }, ease.lin);
    shatter(V, 30, 3.2); burst({pos:to.clone().setY(.5), count:40, color:0xffe6a8, speed:3.5, up:2.5, life:.8});
    flash(to, 0xffd38a, 45); shake(.08, .25); dispose(V);
    await glide(A, to, 0, .2);
  },
  // Horse Kick: big hop, rears up, launches the victim off the board
  async n(A, V, to, who){
    banner('n', who);
    const from = A.position.clone(), ai = innerOf(A);
    const dir = to.clone().sub(from).setY(0).normalize();
    let kicked = false;
    await tween(.6, p => {
      A.position.lerpVectors(from, to, p); A.position.y = Math.sin(Math.PI*p)*2.1;
      ai.rotation.z = Math.sin(Math.PI*Math.min(1,p*1.2))*.7;
      if (p > .78 && !kicked){ kicked = true; launch(V, dir); }
    }, ease.io);
    ai.rotation.z = 0;
    burst({pos:to.clone(), count:55, color:0xc89a5a, speed:4, up:1.2, gravity:4, size:.18, life:.9, additive:false});
    shockwave(to, 0xffffff, 3.5, .45); flash(to, 0xff8a2b, 70); shake(.24, .45);
    await tween(.22, p => { ai.scale.set(1+.15*(1-p), 1-.2*(1-p), 1+.15*(1-p)); }, ease.out);
  },
  // Diagonal Slice: a blade of light cuts the victim in half, the halves slide apart
  async b(A, V, to, who){
    banner('b', who);
    const center = V.position.clone().setY(.5);
    const camR = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const camU = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const camF = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
    const ang = .65;
    const d = camR.clone().multiplyScalar(Math.cos(ang)).addScaledVector(camU, Math.sin(ang)).normalize();
    const n = new THREE.Vector3().crossVectors(d, camF).normalize();
    if (!REDUCED){
      const slash = new THREE.Mesh(new THREE.PlaneGeometry(2.4, .07), new THREE.MeshBasicMaterial({color:0xfff3c4, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide}));
      slash.position.copy(center); slash.quaternion.copy(camera.quaternion); slash.rotateZ(ang); scene.add(slash);
      await glide(A, to.clone().addScaledVector(to.clone().sub(A.position).setY(0).normalize(), -.6), .1, .2);
      await tween(.16, p => { slash.scale.set(p, 1+p*2, 1); }, ease.out);
      tween(.3, p => { slash.material.opacity = 1-p; }, ease.lin).then(()=>{ scene.remove(slash); slash.geometry.dispose(); slash.material.dispose(); });
      burst({pos:center, count:30, color:0xffe28a, speed:2.5, up:1, life:.6, spread:.8});
      const halves = [1, -1].map(sgn => {
        const h = V.clone(true); scene.add(h);
        const plane = new THREE.Plane(n.clone().multiplyScalar(sgn), 0);
        h.traverse(m => { if (m.isMesh){ m.material = m.material.clone(); m.material.clippingPlanes = [plane]; m.material.side = THREE.DoubleSide; m.material.transparent = true; m.userData.own = true; } });
        return {h, plane, sgn};
      });
      dispose(V);
      shake(.1, .25); flash(center, 0xfff3c4, 50);
      const off = new THREE.Vector3();
      const glideIn = glide(A, to, 0, .35);
      await tween(.9, p => {
        for (const {h, plane, sgn} of halves){
          off.copy(n).multiplyScalar(sgn * .55 * ease.out(p)); off.y -= 1.2*p*p;
          h.position.copy(V.position).add(off);
          plane.constant = -plane.normal.dot(center.clone().add(off));
          h.traverse(m => { if (m.isMesh) m.material.opacity = p < .55 ? 1 : 1 - (p-.55)/.45; });
        }
      }, ease.lin);
      halves.forEach(({h}) => dispose(h));
      await glideIn;
    } else { dispose(V); await glide(A, to); }
  },
  // Tower Slam: the rook rises high and drops on the victim
  async r(A, V, to, who){
    banner('r', who);
    const from = A.position.clone(), H = 2.6, ai = innerOf(A);
    await tween(.24, p => { A.position.set(from.x, H*p, from.z); }, ease.out);
    await tween(.24, p => { A.position.set(from.x + (to.x-from.x)*p, H, from.z + (to.z-from.z)*p); }, ease.io);
    await wait(.08);
    await tween(.14, p => { A.position.y = H*(1-p); }, ease.in);
    const vi = innerOf(V);
    tween(.12, p => { vi.scale.set(1+.6*p, 1-.92*p, 1+.6*p); }, ease.out).then(()=>fade(V, .3).then(()=>dispose(V)));
    shockwave(to, 0xff8a2b, 6, .7); shockwave(to, 0xffffff, 3, .45);
    shatter(V, 16, 2.5);
    burst({pos:to.clone(), count:60, color:0x9fb1d6, speed:5, up:.8, gravity:3, size:.2, life:1, additive:false});
    flash(to, 0xff8a2b, 90, .5); shake(.4, .55);
    await tween(.26, p => { ai.scale.set(1+.2*(1-p), 1-.25*(1-p), 1+.2*(1-p)); }, ease.out);
  },
  // Royal Blast: lightning from above, the victim disintegrates into light
  async q(A, V, to, who){
    banner('q', who);
    ownMaterials(V);
    await tween(.25, p => V.traverse(m => { if (m.isMesh && m.material.emissive){ m.material.emissive.setRGB(.2*p, .6*p, 1.2*p); } }), ease.in);
    const top = to.clone().setY(7.5), hit = to.clone().setY(.55);
    for (let i=0;i<4 && !REDUCED;i++){
      const bs = [bolt(top.clone().add(new THREE.Vector3((Math.random()-.5)*2, 0, (Math.random()-.5)*2)), hit), bolt(top, hit)];
      bs.forEach(b => scene.add(b));
      flash(to, 0x9fd4ff, 120, .12);
      await wait(.07);
      bs.forEach(b => { scene.remove(b); b.geometry.dispose(); b.material.dispose(); });
      await wait(.03);
    }
    dispose(V);
    burst({pos:hit, count:180, color:0x9fe0ff, speed:1.8, up:.6, gravity:-1.4, size:.12, life:1.3, spread:.9});
    burst({pos:hit, count:60, color:0xffffff, speed:3, up:1, gravity:0, size:.09, life:.6});
    shockwave(to, 0x7cc8ff, 4, .6); shake(.16, .35);
    await glide(A, to, .35, .42);
  },
  // King's Stomp: hop and stomp, the victim spins and sinks through the floor
  async k(A, V, to, who){
    banner('k', who);
    const from = A.position.clone();
    let stomped = false;
    await tween(.45, p => {
      A.position.lerpVectors(from, to, p); A.position.y = Math.sin(Math.PI*p)*1.1;
      if (p > .85 && !stomped){ stomped = true; sink(V); }
    }, ease.io);
    burst({pos:to.clone(), count:70, color:0xf2c14e, speed:4, up:2.2, life:1});
    shockwave(to, 0xf2c14e, 4.5, .6); flash(to, 0xf2c14e, 80); shake(.25, .4);
  }
};
function launch(V, dir){
  const v = new THREE.Vector3(dir.x*7, 7.5, dir.z*7), w = new THREE.Vector3(8 + Math.random()*6, Math.random()*4, 6);
  let t = 0;
  ownMaterials(V);
  updaters.add(function u(dt){
    t += dt; v.y -= 12*dt;
    V.position.addScaledVector(v, dt);
    V.rotation.x += w.x*dt; V.rotation.z += w.z*dt;
    if (t > .9) V.traverse(m => { if (m.isMesh) m.material.opacity = Math.max(0, 1-(t-.9)/.5); });
    if (t > 1.4){ dispose(V); updaters.delete(u); }
  });
  if (REDUCED) dispose(V);
}
function sink(V){
  const vi = innerOf(V);
  tween(.85, p => { vi.rotation.y += .5 + p*.8; V.position.y = -1.4*p*p; }, ease.lin).then(()=>dispose(V));
}

/* ---------- game state ---------- */
let game = new Chess();
let level = LEVELS[3];
let pieces = new Map();
let busy = false, over = false, selected = null, targets = [], token = 0, splashUp = true;

function rebuildPieces(){
  for (const o of pieces.values()) dispose(o);
  pieces = new Map();
  const b = game.board();
  for (let r=0;r<8;r++) for (let c=0;c<8;c++){
    const cell = b[r][c]; if (!cell) continue;
    const sq = FILES[c] + (8-r);
    pieces.set(sq, makePiece(cell.type, cell.color, sq));
  }
}
function setOverlay(m, sq){ if (!sq){ m.visible = false; return; } const p = sqPos(sq); m.position.x = p.x; m.position.z = p.z; m.visible = true; }
function kingSquare(color){
  const b = game.board();
  for (let r=0;r<8;r++) for (let c=0;c<8;c++){ const x = b[r][c]; if (x && x.type==='k' && x.color===color) return FILES[c]+(8-r); }
  return null;
}
function refreshMarks(){
  const h = game.history({verbose:true}), last = h[h.length-1];
  setOverlay(lastFrom, last && last.from); setOverlay(lastTo, last && last.to);
  setOverlay(checkMark, game.in_check() ? kingSquare(game.turn()) : null);
}
const VAL = {p:1, n:3, b:3, r:5, q:9, k:0};
const GLYPH = {p:'♟', n:'♞', b:'♝', r:'♜', q:'♛'};
function refreshHud(){
  $('hLevel').textContent = level.short;
  $('hMove').textContent = game.fen().split(' ')[5];
  let mat = 0;
  for (const row of game.board()) for (const c of row) if (c) mat += (c.color===playerColor ? 1 : -1) * VAL[c.type];
  $('hMat').textContent = (mat>0?'+':'') + mat;
  const took = {you:[], bdb:[]};
  for (const m of game.history({verbose:true})) if (m.captured) (m.color===playerColor ? took.you : took.bdb).push(m.captured);
  const order = t => 'qrbnp'.indexOf(t);
  const bdbColor = playerColor === 'w' ? 'b' : 'w';
  const fill = (el, list, colorCls) => { el.className = 'pcs ' + colorCls; el.textContent = list.sort((a,b)=>order(a)-order(b)).map(t=>GLYPH[t]+'︎').join(''); };
  fill($('trayYou'), took.you, bdbColor); fill($('trayBdb'), took.bdb, playerColor);
  $('adv').textContent = mat > 0 ? '+' + mat : '';
  $('undoBtn').disabled = busy || !game.history().length;
  $('hintBtn').disabled = busy || over || game.turn() !== playerColor;
}
function setStatus(kind, text){
  const s = $('status'); s.className = 'status' + (kind ? ' ' + kind : ''); $('statusText').textContent = text;
}
function statusForTurn(){
  if (over) return;
  if (game.turn() === playerColor) setStatus(game.in_check() ? 'check' : '', game.in_check() ? 'Check! Your move' : 'Your move');
}

/* ---------- moving ---------- */
async function animateMove(mv, who){
  const A = pieces.get(mv.from);
  if (!A){ rebuildPieces(); refreshMarks(); return; }
  const victimSq = mv.flags.includes('e') ? mv.to[0] + mv.from[1] : mv.to;
  const V = mv.captured ? pieces.get(victimSq) : null;
  pieces.delete(mv.from); if (V) pieces.delete(victimSq);
  pieces.set(mv.to, A); A.userData.square = mv.to;
  innerOf(A).position.y = 0;
  const to = sqPos(mv.to);
  if (V){
    if (REDUCED){ dispose(V); A.position.copy(to); }
    else await KILLS[mv.piece](A, V, to, who);
  } else if (mv.piece === 'n'){
    const ai = innerOf(A);
    await glide(A, to, 1.1, .5);
    ai.rotation.z = 0;
    burst({pos:to.clone(), count:18, color:0xc89a5a, speed:2, up:.6, gravity:3, size:.14, life:.5, additive:false});
  } else {
    await glide(A, to, .28, .42);
  }
  A.position.copy(to);
  if (mv.flags.includes('k') || mv.flags.includes('q')){
    const rank = mv.from[1], rf = (mv.flags.includes('k') ? 'h' : 'a') + rank, rt = (mv.flags.includes('k') ? 'f' : 'd') + rank;
    const R = pieces.get(rf);
    if (R){ pieces.delete(rf); pieces.set(rt, R); R.userData.square = rt; await glide(R, sqPos(rt), 1.2, .45); }
  }
  if (mv.promotion){
    const np = makePiece(mv.promotion, mv.color, mv.to);
    np.scale.setScalar(.01);
    dispose(A); pieces.set(mv.to, np);
    burst({pos:to.clone().setY(.6), count:90, color:0xf2c14e, speed:2.5, up:3, life:1.1});
    shockwave(to, 0xf2c14e, 3, .5); flash(to, 0xf2c14e, 90, .6);
    await tween(.45, p => np.scale.setScalar(Math.max(.01, p)), ease.back);
  }
  refreshMarks();
}
let evalState = 0; // 1 = BDB crushing, -1 = BDB losing, announced once per swing
function engineCall(score){
  if (!score) return null;
  if (score.type === 'mate'){
    if (score.v === 1) return pick(L.mateOne);
    if (score.v > 0) return pick(L.mateFor)(score.v);
    if (score.v < 0) return pick(L.mateAgainst)(-score.v);
  }
  // score is from BDB's side (he was to move). Only call it when it crosses a big line.
  if (score.v >= 500 && evalState !== 1){ evalState = 1; return pick(L.crushing); }
  if (score.v <= -500 && evalState !== -1){ evalState = -1; return pick(L.losing); }
  if (Math.abs(score.v) < 250) evalState = 0;
  return null;
}
function talkAfter(mv, who, score){
  const you = who === 'you';
  if (game.in_checkmate() || game.in_draw()) return;
  const call = you ? null : engineCall(score);
  // every capture, either way, gets a roast, then a deck roast (or the engine's mate call) right after
  if (mv.captured) return sayThen(pick(you ? L.youTake[mv.captured] : L.heTakes[mv.captured]), call || undefined);
  if (call) return sayText(call);
  if (mv.promotion) return say(you ? L.promoteYou : L.promoteHim);
  if (game.in_check()) return say(you ? L.checkHim : L.checkYou);
  if (mv.flags.includes('k') || mv.flags.includes('q')) return say(you ? L.castleYou : L.castleHim);
  if (Math.random() < (you ? .18 : .5)) roast();
}
function checkEnd(){
  if (!game.game_over()) return false;
  over = true; busy = false; clearSelection();
  let eyebrow, title, line;
  if (game.in_checkmate()){
    const youWon = game.turn() !== playerColor;
    eyebrow = 'Checkmate'; title = youWon ? 'You beat BDB' : 'BDB got you'; line = pick(youWon ? L.win : L.lose);
    if (youWon && !REDUCED){
      for (let i=0;i<5;i++) setTimeout(()=>burst({pos:new THREE.Vector3((Math.random()-.5)*6, 1, (Math.random()-.5)*6), count:80, color:pick([0xf2c14e,0xff8a2b,0xffffff,0x6aa2ff]), speed:4, up:6, life:1.6}), i*220);
    }
  } else {
    eyebrow = game.in_stalemate() ? 'Stalemate' : game.in_threefold_repetition() ? 'Draw by repetition' : game.insufficient_material() ? 'Draw, not enough pieces' : 'Draw by 50-move rule';
    title = 'Nobody wins'; line = pick(L.draw);
  }
  sayText(line);
  setStatus('', eyebrow);
  $('endEyebrow').textContent = eyebrow; $('endTitle').textContent = title; $('endLine').textContent = line;
  setTimeout(()=>{ if (over) $('end').hidden = false; }, REDUCED ? 0 : 1400);
  refreshHud();
  return true;
}
async function playerMove(from, to, promotion){
  const mv = game.move({from, to, promotion});
  if (!mv) return;
  clearSelection(); busy = true; refreshHud();
  const tok = token;
  await animateMove(mv, 'you');
  if (tok !== token) return;
  talkAfter(mv, 'you'); refreshHud();
  if (checkEnd()) return;
  bdbMove();
}
function fallbackMove(){
  const ms = game.moves({verbose:true});
  const caps = ms.filter(m => m.captured).sort((a,b) => VAL[b.captured]-VAL[a.captured]);
  return caps[0] || ms[Math.floor(Math.random()*ms.length)];
}
async function bdbMove(){
  const tok = token;
  busy = true; refreshHud();
  setStatus('think', 'BDB is thinking');
  if (Math.random() < .3) say(L.think);
  const started = performance.now();
  const uci = await engine.best(game.fen(), level.skill, level.go);
  if (tok !== token) return;
  const elapsed = performance.now() - started;
  if (elapsed < 450) await wait((450 - elapsed)/1000);
  if (tok !== token) return;
  let mv = null;
  const score = engine.score;
  if (uci) mv = game.move({from:uci.slice(0,2), to:uci.slice(2,4), promotion:uci[4] || undefined});
  if (!mv){ const f = fallbackMove(); if (!f) return; mv = game.move({from:f.from, to:f.to, promotion:f.promotion}); }
  await animateMove(mv, 'bdb');
  if (tok !== token) return;
  talkAfter(mv, 'bdb', score);
  busy = false; refreshHud();
  if (checkEnd()) return;
  statusForTurn();
}

/* ---------- selection / input ---------- */
function clearSelection(){
  if (selected){ const p = pieces.get(selected); if (p) tween(.15, t => { innerOf(p).position.y = .25*(1-t); }, ease.out); }
  selected = null; targets = []; selRing.visible = false;
  while (targetGroup.children.length) targetGroup.remove(targetGroup.children[0]);
}
function select(sq){
  clearSelection();
  selected = sq; targets = game.moves({square:sq, verbose:true});
  const p = pieces.get(sq);
  if (p) tween(.18, t => { innerOf(p).position.y = .25*t; }, ease.out);
  setOverlay(selRing, sq);
  for (const m of targets){
    if (targetGroup.children.some(c => c.userData.sq === m.to)) continue;
    const isCap = !!m.captured;
    const d = new THREE.Mesh(isCap ? capGeo : dotGeo, isCap ? capMat : dotMat);
    d.rotation.x = -Math.PI/2; const pos = sqPos(m.to); d.position.set(pos.x, .008, pos.z); d.userData.sq = m.to; d.renderOrder = 2;
    targetGroup.add(d);
  }
}
function promoChoice(){
  return new Promise(res => {
    const box = $('promo'); box.hidden = false;
    box.querySelectorAll('button').forEach(b => {
      b.style.color = playerColor === 'w' ? '#f3eadb' : '#1a2238';
      b.style.webkitTextStroke = playerColor === 'w' ? '0' : '1px #9fb1d6';
      b.onclick = () => { box.hidden = true; res(b.dataset.p); };
    });
  });
}
async function onSquare(sq){
  if (splashUp || busy || over || game.turn() !== playerColor) return;
  setOverlay(hintFrom, null); setOverlay(hintTo, null);
  const cell = game.get(sq);
  if (selected){
    const ms = targets.filter(m => m.to === sq);
    if (ms.length){
      let promo;
      if (ms.some(m => m.flags.includes('p'))) promo = await promoChoice();
      return playerMove(selected, sq, promo);
    }
  }
  if (cell && cell.color === playerColor){
    if (selected === sq){ clearSelection(); return; }
    select(sq); return;
  }
  if (selected){
    const p = pieces.get(selected);
    if (p) tween(.3, t => { innerOf(p).rotation.z = Math.sin(t*Math.PI*4)*.12*(1-t); }, ease.lin);
    if (Math.random() < .6) say(L.bad);
    clearSelection();
  }
}
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = {x:e.clientX, y:e.clientY}; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!down) return;
  const moved = Math.hypot(e.clientX-down.x, e.clientY-down.y); down = null;
  if (moved > 8) return;
  const r = renderer.domElement.getBoundingClientRect();
  ptr.set(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1);
  ray.setFromCamera(ptr, camera);
  const hits = ray.intersectObjects([...tiles, ...pieces.values()], true);
  for (const h of hits){
    let o = h.object;
    while (o && !(o.userData && o.userData.square)) o = o.parent;
    if (o){ onSquare(o.userData.square); return; }
  }
});

/* ---------- camera ---------- */
// Fit the camera so the whole frame (and the tallest back-rank pieces) stays inside the view at any size.
const FIT_PTS = [];
for (const x of [-4.68, 4.68]) for (const z of [-4.68, 4.68]) for (const y of [-.3, .07]) FIT_PTS.push(new THREE.Vector3(x, y, z));
for (const x of [-3.5, 3.5]) for (const z of [-3.5, 3.5]) FIT_PTS.push(new THREE.Vector3(x, 1.4, z));
const fitCam = new THREE.PerspectiveCamera();
function fitDistance(dir){
  fitCam.copy(camera); fitCam.updateProjectionMatrix();
  let lo = 6, hi = 40;
  for (let i=0;i<22;i++){
    const d = (lo+hi)/2;
    fitCam.position.copy(dir).multiplyScalar(d); fitCam.lookAt(0,0,0); fitCam.updateMatrixWorld();
    const ok = FIT_PTS.every(c => { const p = c.clone().project(fitCam); return Math.abs(p.x) < .93 && Math.abs(p.y) < .93; });
    if (ok) hi = d; else lo = d;
  }
  return hi;
}
const VIEW = c => { const dir = new THREE.Vector3(0, 10.5, c === 'w' ? 10.2 : -10.2).normalize(); return dir.multiplyScalar(fitDistance(dir)); };
let flying = false;
function flyTo(pos, dur = 1.1){
  const from = camera.position.clone();
  flying = true; controls.enabled = false; controls.autoRotate = false;
  return tween(dur, p => { camera.position.lerpVectors(from, pos, p); camera.lookAt(0,0,0); }, ease.io).then(()=>{ flying = false; controls.enabled = true; });
}

/* ---------- game lifecycle ---------- */
function newGame(){
  token++; engine.cancel(); engine.newGame();
  game = new Chess(); over = false; busy = false; evalState = 0;
  $('end').hidden = true; $('promo').hidden = true;
  clearSelection(); setOverlay(hintFrom, null); setOverlay(hintTo, null);
  rebuildPieces(); refreshMarks(); refreshHud();
  say(L.start);
  if (playerColor === 'b'){ setTimeout(()=>{ if (!over && game.turn() !== playerColor) bdbMove(); }, 700); setStatus('think', 'BDB is thinking'); }
  else statusForTurn();
}
function undo(){
  if (busy || !game.history().length) return;
  token++; engine.cancel();
  game.undo();
  while (game.turn() !== playerColor && game.history().length) game.undo();
  over = false; $('end').hidden = true;
  clearSelection(); rebuildPieces(); refreshMarks(); refreshHud();
  say(L.undo);
  if (game.turn() !== playerColor) bdbMove(); else statusForTurn();
}
async function hint(){
  if (busy || over || game.turn() !== playerColor) return;
  busy = true; refreshHud(); setStatus('think', 'Scout is watching');
  const tok = token;
  const uci = await engine.best(game.fen(), 20, 'movetime 700');
  if (tok !== token) return;
  busy = false; refreshHud(); statusForTurn();
  let from, to;
  if (uci){ from = uci.slice(0,2); to = uci.slice(2,4); }
  else { const m = fallbackMove(); if (!m) return; from = m.from; to = m.to; }
  say(L.hint);
  select(from);
  setOverlay(hintFrom, from); setOverlay(hintTo, to);
}
$('newBtn').onclick = () => newGame();
$('againBtn').onclick = () => newGame();
$('undoBtn').onclick = undo;
$('hintBtn').onclick = hint;
$('viewBtn').onclick = () => { if (!flying) flyTo(VIEW(playerColor), .8); };
$('lvlBtn').onclick = () => { $('end').hidden = true; showSplash(); };

/* ---------- title screen ---------- */
let sideChoice = store.get('cc-side') || 'w';
level = LEVELS.find(l => l.key === store.get('cc-level')) || LEVELS[3];
const lvlSeg = $('lvlSeg');
for (const l of LEVELS){
  const b = document.createElement('button'); b.type = 'button'; b.textContent = l.name; b.dataset.key = l.key;
  b.onclick = () => { level = l; store.set('cc-level', l.key); paintSplash(); };
  lvlSeg.appendChild(b);
}
$('sideSeg').querySelectorAll('button').forEach(b => b.onclick = () => { sideChoice = b.dataset.side; store.set('cc-side', sideChoice); paintSplash(); });
function paintSplash(){
  lvlSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.key === level.key));
  $('sideSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.side === sideChoice));
  $('lvlNote').textContent = level.note;
}
function showSplash(){
  splashUp = true; token++; engine.cancel(); busy = false;
  const s = $('splash'); s.hidden = false; s.classList.remove('gone');
  controls.autoRotate = !REDUCED; paintSplash();
}
$('play').onclick = () => {
  splashUp = false;
  const s = $('splash'); s.classList.add('gone'); setTimeout(()=>{ s.hidden = true; }, REDUCED ? 0 : 450);
  playerColor = sideChoice === 'r' ? (Math.random() < .5 ? 'w' : 'b') : sideChoice;
  controls.autoRotate = false;
  newGame();
  flyTo(VIEW(playerColor));
};
document.addEventListener('keydown', e => {
  if (!$('splash').hidden && (e.key === 'Enter')){ $('play').click(); }
  if (e.key === 'Escape') clearSelection();
});

/* ---------- loop ---------- */
function resize(){
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < 520 ? 44 : 38;
  camera.updateProjectionMatrix();
  // if the frame no longer fits after a resize, back the camera off along its current angle
  if (!flying){
    const dir = camera.position.clone().normalize(), need = fitDistance(dir);
    if (camera.position.length() < need - .01) camera.position.copy(dir.multiplyScalar(need));
  }
}
new ResizeObserver(resize).observe(stage);
resize();
const clock = new THREE.Clock();
const shakeOff = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), .05);
  for (let i = tweens.length-1; i >= 0; i--){
    const tw = tweens[i]; tw.t += dt;
    const p = Math.min(1, tw.t / tw.dur);
    tw.fn(tw.e(p), p);
    if (p >= 1){ tweens.splice(i, 1); tw.res(); }
  }
  for (const u of [...updaters]) u(dt);
  if (selRing.visible) selRing.material.opacity = .65 + Math.sin(performance.now()/180)*.3;
  if (checkMark.visible) checkMark.material.opacity = .4 + Math.sin(performance.now()/150)*.2;
  if (!flying) controls.update();
  if (shakeAmt > 0){
    shakeOff.set((Math.random()-.5)*shakeAmt, (Math.random()-.5)*shakeAmt, (Math.random()-.5)*shakeAmt);
    camera.position.add(shakeOff); renderer.render(scene, camera); camera.position.sub(shakeOff);
    shakeAmt = Math.max(0, shakeAmt - shakeDecay*dt);
  } else renderer.render(scene, camera);
});

/* ---------- boot ---------- */
rebuildPieces(); refreshHud(); showSplash();
setStatus('', 'Pick a side');
// test hook for automated checks
window.__cc = { load(fen){ token++; engine.cancel(); game.load(fen); over=false; busy=false; clearSelection(); rebuildPieces(); refreshMarks(); refreshHud(); statusForTurn(); }, get game(){ return game; }, get busy(){ return busy; }, get over(){ return over; }, get pieces(){ return pieces; }, onSquare, newGame, undo, KILLS, engine, setPlayer(c){ playerColor = c; } };
