/* BDB Craft: the game. Start screen (your worlds, friends building right now), then the world: walking, flying, breaking and placing, the hotbar and
   every block in the inventory, chat, and the pause screen with invites and settings. The heavy lifting is elsewhere: world.js (chunks), mesh.js (shapes),
   gen.js (the land), render.js (the look), player.js (moving), store.js (saving), party.js (friends). */
import * as THREE from '../chess/vendor/three.module.min.js?v=c22';
import { BLOCKS, B, N, CATS, SOLID, PLANT, LIQUID, FACE, CH, SH, SHAPE, STATE, FIRST, WET, FULL, TURN, AXIS, ROOT, ITEM, OPAQUE, DMG } from './blocks.js?v=c22';
import { paintAll, icon, TS } from './tex.js?v=c22';
import { column } from './gen.js?v=c22';
import { column as column2, villagesNear, citiesNear, cityLanding } from './gen2.js?v=c22';
import { createCitySigns } from './city.js?v=c22';
import { createWorld } from './world.js?v=c22';
import { blockMaterials, outline, avatar, HORIZON } from './render.js?v=c22';
import { createSky, createClouds, DAY_SECONDS } from './sky.js?v=c22';
import { createHand } from './hand.js?v=c22';
import { createPlayer, EYE } from './player.js?v=c22';
import { createMobs } from './mobs.js?v=c22';
import { createRedstone } from './redstone.js?v=c22';
import { createCarts } from './carts.js?v=c22';
import { createLiquids } from './liquids.js?v=c22';
import { createWeather, tearUp } from './weather.js?v=c22';
import { body, clean as cleanSkin, random as randomSkin, PARTS, SHIRTS } from './skin.js?v=c22';
import { Cloud, Local, session, pack, unpack } from './store.js?v=c22';
import { openParty, newCode, cleanCode } from './party.js?v=c22';

const Q = new URLSearchParams(location.search), LOCALNET = Q.get('net') === 'local', NOLOCK = Q.has('nolock');
const $ = id => document.getElementById(id);
const store = { get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } }, set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} } };
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const hashSeed = s => { s = String(s).trim(); if (/^-?\d{1,9}$/.test(s)) return +s; let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619); return h | 0; };

/* ---------- settings ---------- */
const S = Object.assign({dist:8, fov:75, sens:100, invert:false, clouds:true, hand:true, animals:true, cycle:true, monsters:true, hurt:true}, store.get('craft-settings', {}));
const saveSettings = () => store.set('craft-settings', S);

/* ---------- three.js ---------- */
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({canvas, antialias:false, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(S.fov, 1, .05, 1200);
const citySigns = createCitySigns(scene);
camera.rotation.order = 'YXZ';
const hemi = new THREE.HemisphereLight(0xdfeeff, 0x6b5a45, 2.2); scene.add(hemi); const sunL = new THREE.DirectionalLight(0xfff2dd, 1.4); sunL.position.set(-3, 5, -4); scene.add(sunL);
const layers = paintAll(), mats = blockMaterials(layers), theSky = createSky(scene), weather = createWeather(scene), cloud = createClouds(scene, 1234), hl = outline(scene);
const icons = []; const iconOf = id => icons[id] || (icons[id] = icon(layers, id, 64));
function resize(){ const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); handCam.aspect = w / h; handCam.updateProjectionMatrix(); }

/* the block in your hand, bottom right, drawn on top of everything */
const handScene = new THREE.Scene(), handCam = new THREE.PerspectiveCamera(70, 1, .01, 10);
handScene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2.6));
{ const d = new THREE.DirectionalLight(0xffffff, 1.2); d.position.set(1, 2, 1); handScene.add(d); }
const hand = createHand(handScene, layers);

/* ---------- screens ---------- */
const screens = ['menu', 'newp', 'joinp', 'signp', 'charp', 'load', 'pause', 'invite', 'settings', 'keysp', 'telep', 'inv', 'msg', 'dead'];
function show(...ids){ for (const s of screens) $(s).hidden = !ids.includes(s); }
let toastT = 0;
let titleT = 0;
function title(big, small, under = '', ms = 4200){ const e = $('title'); e.querySelector('b').textContent = big; e.querySelector('span').textContent = small; e.querySelector('i').textContent = under; e.hidden = false; e.classList.remove('go'); void e.offsetWidth; e.classList.add('go'); clearTimeout(titleT); titleT = setTimeout(() => { e.hidden = true; }, ms); }
function toast(t, ms = 2200){ const e = $('toast'); e.textContent = t; e.hidden = false; e.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => { e.style.opacity = 0; setTimeout(() => e.hidden = true, 400); }, ms); }

/* ---------- the start screen, with a world turning slowly behind it ---------- */
let G = null, backdrop = null, tab = 'mine', lists = {mine:[], local:[], live:[], cloudErr:null};
function startBackdrop(){
  if (backdrop) return; const w = createWorld({seed:hashSeed('bdb craft'), kind:'normal2', scene, matSolid:mats.solid, matClear:mats.clear, workers:2}); w.R = 6;
  backdrop = {w, a:0}; mats.fog(6 * 16 * .55, 6 * 16 - 4);
}
function stopBackdrop(){ if (backdrop){ backdrop.w.dispose(); backdrop = null; } }
const ICON_W = () => iconOf(B.grass), ICON_F = () => iconOf(B.grass), ICON_L = () => iconOf(B.bricks);
const SVG = {
  pen:'<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  bin:'<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
};
function ago(t){ const s = (Date.now() - new Date(t).getTime()) / 1000; if (!(s >= 0)) return ''; if (s < 90) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400 * 1.5) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' days ago'; }
function renderAcct(){
  const s = session(), e = $('acct');
  const face = skinNow ? `<img alt="" src="${headPic(skinNow)}" style="width:40px;height:40px;image-rendering:pixelated;border-radius:6px;flex:none">` : '';
  if (s) e.innerHTML = `${face}<span style="flex:1">Signed in as <b>${esc(s.name)}</b>. Your character and worlds are kept online.</span><button type="button" class="k-btn" id="achar">Character</button><button type="button" class="k-btn" id="aout">Sign out</button>`;
  else e.innerHTML = `${face}<span style="flex:1">Playing as <b>${esc(myName())}</b> on this computer. Sign in to keep worlds online and see friends building.</span><button type="button" class="k-btn" id="achar">Character</button><button type="button" class="k-btn primary" id="ain">Sign in</button>`;
  const o = $('aout'), i = $('ain'); if (o) o.onclick = () => { Cloud.signOut(); skinNow = null; welcome(); }; if (i) i.onclick = () => openSign(false);
  $('achar').onclick = () => openCreator(false, 'menu');
}
async function refreshMenu(){
  renderAcct(); renderList();
  try { lists.local = await Local.list(); } catch(e){ lists.local = []; }
  lists.cloudErr = null;
  if (session() && Cloud.on){ try { const r = await Cloud.list(); lists.mine = r.mine || []; lists.live = r.live || []; } catch(e){ lists.mine = []; lists.live = []; lists.cloudErr = e.kind || 'net'; if (e.kind === 'signin'){ Cloud.signOut(); renderAcct(); } } }
  else { lists.mine = []; lists.live = []; }
  renderList();
}
function renderList(){
  for (const b of document.querySelectorAll('#menu .tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
  const lc = $('livec'); lc.hidden = !lists.live.length; lc.textContent = lists.live.length;
  const el = $('list'); el.innerHTML = '';
  if (tab === 'live'){
    if (!session()){ el.innerHTML = `<div class="empty">Sign in to see the worlds your friends have open right now.<br>Or ask them for their code and use Join with a code.</div>`; return; }
    if (lists.cloudErr === 'setup'){ el.innerHTML = `<div class="empty">The BDB server is not set up for Craft yet (craft/supabase.sql has to be run once). Join with a code still works.</div>`; return; }
    if (!lists.live.length){ el.innerHTML = `<div class="empty">No friends building right now.<br>When someone opens a world to friends, it shows up here.</div>`; return; }
    for (const w of lists.live){
      const r = document.createElement('div'); r.className = 'row'; r.tabIndex = 0;
      r.innerHTML = `<img alt="" src="${ICON_L()}"><div style="min-width:0"><div class="nm">${esc(w.name)}</div><div class="sub">${esc(w.host)} is building. ${w.kind === 'flat' ? 'Flat world' : 'Normal world'}</div></div><div class="acts"><button type="button" class="k-btn primary">Join</button></div>`;
      r.onclick = () => joinWorld(w.code); r.onkeydown = e => { if (e.key === 'Enter') joinWorld(w.code); };
      el.append(r);
    }
    return;
  }
  const all = [...lists.mine.map(w => ({...w, where:'cloud'})), ...lists.local.map(w => ({...w, where:'local'}))];
  if (!all.length){
    el.innerHTML = `<div class="empty">${lists.cloudErr === 'setup' ? 'The BDB server is not set up for Craft yet, so new worlds are kept on this computer for now.<br>' : lists.cloudErr === 'net' ? 'Could not reach the BDB server. Worlds on this computer still work.<br>' : ''}No worlds yet. Make your first one.</div>`; return;
  }
  if (lists.cloudErr && lists.cloudErr !== 'signin'){ const n = document.createElement('p'); n.className = 'note'; n.textContent = lists.cloudErr === 'setup' ? 'The BDB server is not set up for Craft yet, so your online worlds are not showing.' : 'Could not reach the BDB server, so your online worlds are not showing.'; el.append(n); }
  for (const w of all){
    const r = document.createElement('div'); r.className = 'row'; r.tabIndex = 0;
    r.innerHTML = `<img alt="" src="${w.kind === 'flat' ? ICON_F() : ICON_W()}"><div style="min-width:0"><div class="nm">${esc(w.name)}</div><div class="sub">${w.kind === 'flat' ? 'Flat' : 'Normal'}. ${w.where === 'cloud' ? 'Online' : 'This computer'}. ${esc(ago(w.updated))}</div></div>
      <div class="acts"><button type="button" class="icon-btn" data-a="ren" aria-label="Rename">${SVG.pen}</button><button type="button" class="icon-btn" data-a="del" aria-label="Delete">${SVG.bin}</button></div>`;
    r.onclick = e => { const a = e.target.closest('[data-a]'); if (a) return act(a.dataset.a, w, r); playWorld(w); };
    r.onkeydown = e => { if (e.key === 'Enter' && e.target === r) playWorld(w); };
    el.append(r);
  }
}
function act(a, w, r){
  const acts = r.querySelector('.acts');
  if (a === 'del'){
    acts.innerHTML = `<span class="sure">Delete for good? <button type="button" class="k-btn" data-y>Delete</button><button type="button" class="k-btn" data-n>Keep</button></span>`;
    acts.querySelector('[data-n]').onclick = e => { e.stopPropagation(); renderList(); };
    acts.querySelector('[data-y]').onclick = async e => { e.stopPropagation(); try { await (w.where === 'cloud' ? Cloud.remove(w.id) : Local.remove(w.id)); } catch(err){ toast('Could not delete it. Try again.'); } refreshMenu(); };
  } else {
    const nm = r.querySelector('.nm'), inp = document.createElement('input'); inp.value = w.name; inp.maxLength = 40; inp.style.cssText = 'height:32px;border-radius:7px;border:1px solid var(--edge);background:rgba(0,0,0,.35);color:var(--ink);font:700 15px var(--f-body);padding:0 8px;width:100%';
    nm.replaceWith(inp); inp.focus(); inp.select(); inp.onclick = e => e.stopPropagation();
    const done = async ok => { const v = inp.value.trim(); if (ok && v && v !== w.name){ try { await (w.where === 'cloud' ? Cloud.rename(w.id, v) : Local.rename(w.id, v)); } catch(e){ toast('Could not rename it.'); } } refreshMenu(); };
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); }; inp.onblur = () => done(true);
  }
}
for (const b of document.querySelectorAll('#menu .tabs button')) b.onclick = () => { tab = b.dataset.tab; renderList(); };
for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => show('menu');
const segVal = id => $(id).querySelector('.on').dataset.v;
for (const id of ['nkind', 'nwhere']) $(id).onclick = e => { const b = e.target.closest('button'); if (!b) return; for (const x of $(id).children) x.classList.toggle('on', x === b); };
$('bnew').onclick = () => {
  const n = lists.mine.length + lists.local.length + 1; $('nname').value = 'World ' + n; $('nseed').value = '';
  const s = session(), cloudOk = s && Cloud.on && lists.cloudErr !== 'setup';
  $('nwhere-f').hidden = !cloudOk; $('nnote').className = 'note';
  $('nnote').textContent = !s ? 'Not signed in, so this world is kept on this computer. Sign in first to keep it online.' : !cloudOk ? 'The BDB server is not set up for Craft yet, so this world is kept on this computer.' : '';
  for (const x of $('nwhere').children) x.classList.toggle('on', x.dataset.v === 'cloud');
  show('newp'); $('nname').focus(); $('nname').select();
};
$('newf').onsubmit = async e => {
  e.preventDefault();
  const name = $('nname').value.trim() || 'World', seedTxt = $('nseed').value.trim(), seed = seedTxt ? hashSeed(seedTxt) : (crypto.getRandomValues(new Int32Array(1))[0]), kind = segVal('nkind');
  const cloud = !$('nwhere-f').hidden && segVal('nwhere') === 'cloud';
  try {
    const w = cloud ? await Cloud.create({name, seed, kind}) : await Local.create({name, seed, kind});
    playWorld({...w, where:cloud ? 'cloud' : 'local', fresh:true});
  } catch(err){ $('nnote').className = 'note bad'; $('nnote').textContent = err.kind === 'said' && err.said === 'too_many' ? 'You have 40 online worlds already. Delete one first.' : 'Could not make it online. Try again, or pick Only on this computer.'; }
};
$('bjoin').onclick = () => { $('jcode').value = ''; $('jnote').textContent = ''; $('jnote').className = 'note'; const s = session(); $('jname-f').hidden = !!s; $('jname').value = store.get('craft-name', ''); show('joinp'); $('jcode').focus(); };
$('jcode').oninput = () => { const v = cleanCode($('jcode').value); if (v !== $('jcode').value) $('jcode').value = v; };
$('joinf').onsubmit = e => { e.preventDefault(); const c = cleanCode($('jcode').value); if (c.length !== 6){ $('jnote').className = 'note bad'; $('jnote').textContent = 'Codes are six letters and numbers.'; return; } if (!session()) store.set('craft-name', $('jname').value.trim().slice(0, 20)); joinWorld(c); };
$('signf').onsubmit = async e => { e.preventDefault(); await sign(false); };
$('sreg').onclick = () => sign(true);
async function sign(reg){
  const n = $('sname').value.trim(), p = $('spass').value, note = $('snote'); note.className = 'note'; note.textContent = reg ? 'Making your account...' : 'Signing in...';
  if (n.length < 2 || p.length < 4){ note.className = 'note bad'; note.textContent = 'Names need 2 letters or more, passwords 4 or more.'; return; }
  try {
    const r = reg ? await Cloud.register(n, p) : await Cloud.login(n, p);
    if (r && r.token){ $('spass').value = ''; note.textContent = ''; afterSign(); return; }
    note.className = 'note bad'; note.textContent = r && r.error === 'taken' ? 'That name is taken. If it is yours, sign in instead.' : 'That name and password do not match.';
  } catch(err){ note.className = 'note bad'; note.textContent = err.kind === 'said' ? (err.said === 'taken' ? 'That name is taken. If it is yours, sign in instead.' : 'That name and password do not match.') : 'Could not reach the BDB server. Try again in a minute.'; if (err.kind !== 'said') $('slocal-f').hidden = false; }
}
$('slocal').onclick = () => { const n = $('sname').value.trim().slice(0, 20); if (n.length < 2){ $('snote').className = 'note bad'; $('snote').textContent = 'Put in a name first, 2 letters or more.'; $('sname').focus(); return; } store.set('craft-name', n); afterSign(); };
function openSign(first){
  $('stitle').textContent = first ? 'Welcome to BDB Craft' : 'Sign in';
  $('stext').textContent = first ? 'Sign in with your BDB account (the same one as Break Room Brawl), or make one. Your character and your worlds are kept on it, and friends can find the worlds you open to them.' : 'Same account as Break Room Brawl. Your character and worlds are kept on it, and friends can find the worlds you open to them.';
  $('scancel').hidden = first; $('slocal-f').hidden = true; $('snote').textContent = ''; show('signp'); setTimeout(() => $('sname').focus(), 0);
}
const welcome = () => openSign(true);

/* ---------- your character ---------- */
let skinNow = null, creator = null;
const myName = () => { const s = session(); return s ? s.name : (store.get('craft-name', '') || 'Player'); };
const skinKey = () => 'craft-skin:' + myName().toLowerCase();
async function loadSkin(){
  const local = store.get(skinKey(), null); skinNow = local ? cleanSkin(local) : null;
  if (session() && Cloud.on){
    try { const r = await Cloud.me(); if (r && r.skin){ skinNow = cleanSkin(r.skin); store.set(skinKey(), skinNow); } else if (skinNow) Cloud.setSkin(skinNow).catch(() => {}); }
    catch(e){ if (e.kind === 'signin'){ Cloud.signOut(); skinNow = null; } }
  }
  return skinNow;
}
async function afterSign(){ await loadSkin(); if (!skinNow) openCreator(true); else toMenu(); }
/* the front of the head, as a little picture for the start screen */
const headCache = new Map();
function headPic(sk){
  const k = JSON.stringify(sk); if (headCache.has(k)) return headCache.get(k);
  const b = body(sk), m = b.head.children[0].material[4].map.image, c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(m, 0, 0, 32, 32);
  const u = c.toDataURL(); b.dispose(); headCache.set(k, u); return u;
}
function openCreator(first, back){
  const draft = cleanSkin(skinNow || randomSkin());
  creator = {draft, first, back:back || 'menu', rot:.5, drag:null, bd:null};
  $('ctitle').textContent = first ? 'Make your character' : 'Your character';
  $('ctext').textContent = first ? `Playing as ${myName()}. This is how friends see you when you build together. You can change it any time.` : `Playing as ${myName()}. Friends see the change straight away.`;
  $('cback').hidden = first; $('csave').textContent = first ? 'Start building' : 'Save character';
  if (!creator.r){
    const cv = $('charview');
    creator.r = charR || (charR = new THREE.WebGLRenderer({canvas:cv, antialias:true, alpha:true}));
  }
  show('charp'); renderOpts(); rebuildBody(); requestAnimationFrame(charFrame);
}
let charR = null; const charScene = new THREE.Scene(), charCam = new THREE.PerspectiveCamera(28, 270 / 380, .1, 50);
charScene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 2.4)); { const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(2, 4, 5); charScene.add(d); }
charCam.position.set(0, 1.05, 4.6); charCam.lookAt(0, .92, 0);
function rebuildBody(){ const c = creator; if (c.bd){ charScene.remove(c.bd.group); c.bd.dispose(); } c.bd = body(c.draft); charScene.add(c.bd.group); }
function charFrame(t){
  const c = creator; if (!c || $('charp').hidden) return; requestAnimationFrame(charFrame);
  const cv = $('charview'), w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * devicePixelRatio)){ charR.setPixelRatio(devicePixelRatio); charR.setSize(w, h, false); charCam.aspect = w / h; charCam.updateProjectionMatrix(); }
  if (!c.drag) c.rot += .006;
  const g = c.bd.group; g.rotation.y = c.rot; const sw = Math.sin(t / 420) * .12; c.bd.la.rotation.x = sw; c.bd.ra.rotation.x = -sw; c.bd.head.rotation.y = Math.sin(t / 1300) * .25;
  charR.render(charScene, charCam);
}
$('charview').addEventListener('pointerdown', e => { if (!creator) return; creator.drag = {x:e.clientX, r:creator.rot}; $('charview').setPointerCapture(e.pointerId); });
$('charview').addEventListener('pointermove', e => { const c = creator; if (c && c.drag) c.rot = c.drag.r + (e.clientX - c.drag.x) * .012; });
$('charview').addEventListener('pointerup', () => { if (creator) creator.drag = null; });
function renderOpts(){
  const c = creator, box = $('copts'); box.innerHTML = '';
  for (const [k, label, list, kind] of PARTS){
    const row = document.createElement('div'); row.className = 'opt'; row.innerHTML = `<span>${label}</span><div class="chips" role="radiogroup" aria-label="${label}"></div>`;
    const chips = row.querySelector('.chips');
    list.forEach((v, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', c.draft[k] === i ? 'true' : 'false');
      if (kind === 'swatch'){ b.className = 'sw' + (c.draft[k] === i ? ' on' : ''); b.style.background = v; b.setAttribute('aria-label', label + ' ' + (i + 1)); }
      else { b.className = 'tx' + (c.draft[k] === i ? ' on' : ''); b.textContent = v; }
      b.onclick = () => { c.draft[k] = i; renderOpts(); rebuildBody(); };
      chips.append(b);
    });
    if (k === 'shirt' && SHIRTS[c.draft.shirt] === 'Jersey'){
      const n = document.createElement('input'); n.type = 'number'; n.min = 0; n.max = 99; n.value = c.draft.num; n.setAttribute('aria-label', 'Jersey number');
      n.oninput = () => { c.draft.num = Math.max(0, Math.min(99, n.value | 0)); rebuildBody(); }; chips.append(n);
    }
    box.append(row);
  }
}
$('crand').onclick = () => { creator.draft = randomSkin(); renderOpts(); rebuildBody(); };
$('cback').onclick = () => { const b = creator.back; creator = null; show(b); };
$('csave').onclick = async () => {
  const c = creator; skinNow = cleanSkin(c.draft); store.set(skinKey(), skinNow); creator = null;
  if (session() && Cloud.on) Cloud.setSkin(skinNow).catch(() => {});
  hand.setSkin(skinNow);
  if (G){ if (G.party) G.party.setSkin(skinNow); if (G.me){ G.me.dispose(); G.me = null; } }
  if (c.first || c.back === 'menu') toMenu(); else show(c.back);
};

/* ---------- playing a world ---------- */
const HOTBAR0 = ['grass', 'stone', 'planks_oak', 'log_oak', 'glass', 'bricks', 'wool_red', 'lamp', 'quartz'].map(k => B[k] || B.stone);
function makeGame(opt){
  // worlds made before the world update keep the old land; new ones get the bigger world (biomes, rivers, villages)
  opt.gen = opt.gen || (opt.meta && opt.meta.gen) || (opt.fresh ? 2 : 1); const wkind = opt.kind === 'normal' && opt.gen === 2 ? 'normal2' : opt.kind, col = opt.gen === 2 ? column2 : column;
  // opt: {name, seed, kind, where, id, chunks, meta, guest, party}
  let gref = null;
  const world = createWorld({seed:opt.seed, kind:wkind, scene, matSolid:mats.solid, matClear:mats.clear, wait:opt.wait, onGen:(cx, cz, v) => { if (gref && !opt.guest) gref.liq.wake(cx, cz, v); }});
  world.R = S.dist;
  const p = createPlayer(world), meta = opt.meta || {};
  const g = {opt, world, p, bar:(Array.isArray(meta.bar) && meta.bar.length === 9 ? meta.bar.map(b => (b > 0 && b < N && BLOCKS[b].kind !== 'air') ? b : B.stone) : HOTBAR0.slice()), sel:meta.sel | 0 || 0,
    keys:{}, ready:false, spawned:false, lastSave:performance.now(), avatars:new Map(), party:opt.party || null, code:opt.code || null, hud:true, dbg:false, lastTapSpace:0, lastTapW:0, liveT:0, posT:0, saving:null};
  g.animals = createMobs(scene, world, {poof:(x, y, z) => poof(x, y, z), explode:(x, y, z) => { if (G === g) explode(g, x, y, z); },
    hitPlayer:(who, dmg, from) => { if (who.me) hurtMe(dmg, from); else if (g.party && who.id) g.party.hurt(who.id, [dmg, from ? +from.x.toFixed(1) : 0, from ? +from.z.toFixed(1) : 0]); }});
  g.hp = meta.hp > 0 ? meta.hp : 20; g.spawnAt = meta.spawn || null;
  g.red = createRedstone(world, (x, y, z, b) => edit(x, y, z, b, true), {ignite:(x, y, z) => ignite(g, x, y, z, 4)});
  g.carts = createCarts(scene, world); g.tnts = []; g.pushes = new Map(); g.falling = [];
  g.liq = createLiquids(world, (x, y, z, b) => edit(x, y, z, b, 'liq'), (x, y, z, toY, b) => fallBlock(g, x, y, z, toY, b)); gref = g;
  g.time = typeof meta.time === 'number' ? meta.time % 1 : .08; g.day = meta.day | 0;
  if (meta.p){ Object.assign(p, {x:meta.p[0], y:meta.p[1], z:meta.p[2], yaw:meta.p[3] || 0, pitch:meta.p[4] || 0, fly:!!meta.p[5]}); g.spawned = true; }
  else if (opt.spawn){ Object.assign(p, opt.spawn); g.spawned = true; g.needUp = true; }
  else {
    // the nearest dry land to the middle, from the land shape alone (no chunks needed yet)
    let best = null;
    for (let r = 0; r < 400 && !best; r += 8) for (let a = 0; a < Math.max(1, r); a += 8){ const ang = a / Math.max(1, r) * Math.PI * 2, x = Math.round(Math.cos(ang) * r) + 8, z = Math.round(Math.sin(ang) * r) + 8, c = col(opt.seed, x, z); if (opt.kind === 'flat' || (c.h > 63 && c.h < 100 && !c.river && !['ocean', 'frozen', 'peak', 'warmocean', 'snowpeak', 'swamp', 'mushroom'].includes(c.biome))){ best = {x, z}; break; } }
    best = best || {x:8, z:8}; p.x = best.x + .5; p.z = best.z + .5; p.y = 120; g.needUp = true;
  }
  for (const c of opt.chunks || []) if (c.v) world.mods.set(c.cx + ',' + c.cz, c.v);
  g.colAt = (x, z) => col(opt.seed, x, z);
  g.refreshBar = () => {
    const bar = $('bar'); bar.innerHTML = '';
    g.bar.forEach((b, i) => { const s = document.createElement('div'); s.className = 'slot' + (i === g.sel ? ' on' : ''); s.innerHTML = `<i>${i + 1}</i><img alt="" src="${iconOf(b)}">`; bar.append(s); });
    hand.set(g.bar[g.sel]);
  };
  g.pick = (i, quiet) => { g.sel = (i + 9) % 9; g.refreshBar(); if (!quiet){ const e = $('bname'); e.textContent = g.bar[g.sel] ? BLOCKS[g.bar[g.sel]].name : ''; e.style.opacity = 1; clearTimeout(g.bnT); g.bnT = setTimeout(() => e.style.opacity = 0, 1600); } };
  g.metaNow = () => ({gen:opt.gen, hp:g.hp, spawn:g.spawnAt || g.firstSpawn, time:+g.time.toFixed(4), day:g.day, p:[+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(3), +p.pitch.toFixed(3), p.fly ? 1 : 0], bar:g.bar, sel:g.sel});
  return g;
}
async function playWorld(w){
  show('load'); $('ltitle').textContent = 'Opening ' + w.name; $('lnote').textContent = ''; $('lbar').style.width = '4%';
  let data = {...w, chunks:[], meta:{}};
  if (!w.fresh){
    try {
      $('lnote').textContent = w.where === 'cloud' ? 'Fetching your world from the BDB server...' : 'Reading your world...';
      const r = w.where === 'cloud' ? await Cloud.load(w.id) : await Local.load(w.id);
      const chunks = [];
      for (const c of r.chunks){ try { chunks.push({cx:c.cx, cz:c.cz, v:await unpack(c.d)}); } catch(e){} }
      data = {...w, ...r, where:w.where, chunks, meta:r.meta || {}};
    } catch(e){ msg('Could not open that world', w.where === 'cloud' ? 'The BDB server did not answer. Check your connection and try again.' : 'This browser could not read it.'); return; }
  }
  enter(makeGame({name:data.name, seed:+data.seed, kind:data.kind, where:w.where, id:data.id, chunks:data.chunks, meta:data.meta, fresh:!!w.fresh}));
}
let joinTimer = 0;
async function joinWorld(code){
  show('load'); $('ltitle').textContent = 'Joining ' + code; $('lnote').textContent = 'Looking for whoever is hosting...'; $('lbar').style.width = '3%';
  const name = myName();
  let party = null, waiting = null, total = 0, g = null, early = [];
  const fail = (t, x) => { clearTimeout(joinTimer); if (party) party.leave(); if (g) leaveGame(); msg(t, x); };
  joinTimer = setTimeout(() => fail('No one is hosting that code', 'Check the code with your friend. Their world has to be open (Invite friends on their pause screen).'), 20000);
  pendingCancel = () => { clearTimeout(joinTimer); if (party) party.leave(); party = null; };
  try {
    party = await openParty({local:LOCALNET, code, host:false, name, skin:skinNow, on:{
      error(){ fail('Could not connect', 'Your browser could not reach your friend. Try again.'); },
      hi(d){
        clearTimeout(joinTimer);
        waiting = new Set(d.mods || []); total = waiting.size;
        g = makeGame({name:d.name, seed:+d.seed, kind:d.kind, gen:d.gen || 1, where:'guest', guest:true, party, code, spawn:d.spawn ? {x:d.spawn[0], y:d.spawn[1], z:d.spawn[2]} : null, wait:k => waiting.has(k)});
        g.host = d.host; g.waiting = waiting; if (Array.isArray(d.time)){ g.timeHost = +d.time[0] || 0; g.time = g.timeHost; g.day = d.time[1] | 0; g.timeAt = d.time[2] ? performance.now() : 0; }
        $('ltitle').textContent = 'Joining ' + d.host + "'s world"; $('lnote').textContent = total ? `Getting the parts that were built on: 0 of ${total}` : '';
        for (const c of early) this.chunk(c); early = [];
        if (!total) enter(g);
      },
      async chunk(c){
        if (!g){ early.push(c); return; }
        try { const v = await unpack(c.d); g.world.setMod(c.k, v); } catch(e){}
        waiting.delete(c.k); const got = total - waiting.size; $('lnote').textContent = `Getting the parts that were built on: ${got} of ${total}`; $('lbar').style.width = (5 + 60 * got / Math.max(1, total)) + '%';
        if (!waiting.size && G !== g) enter(g);
      },
      ready(){ if (g && !waiting.size && G !== g) enter(g); },
      edit(x, y, z, b){ if (G && G.world) G.world.set(x, y, z, b); },
      pos(id, d){ if (G) seeFriend(id, d); },
      people(l){ if (G) peopleChanged(l); },
      joined(id, nm){ if (G && G.started) sys(nm + ' joined'); },
      left(id, nm){ if (G){ sys(nm + ' left'); dropFriend(id); } },
      chat(nm, t){ if (G) chatLine(nm, t); },
      animals(st){ if (G && G.animals && Array.isArray(st)) G.animals.apply(st); },
      hurt(d){ if (G && Array.isArray(d)) hurtMe(+d[0] || 1, {x:+d[1], z:+d[2]}); },
      carts(st){ if (G && G.carts && Array.isArray(st)){ G.carts.apply(st); } },
      time(d){ const g2 = G || g; if (g2 && Array.isArray(d)){ g2.timeHost = +d[0] || 0; g2.day = d[1] | 0; g2.timeAt = d[2] ? performance.now() : 0; g2.time = g2.timeHost; if (typeof d[3] === 'string' && d[3] !== weather.kind) weather.set(d[3]); if (d[4] !== undefined) weather.set(d[3] || weather.kind, Array.isArray(d[4]) ? {x:+d[4][0], z:+d[4][1], vx:+d[4][2], vz:+d[4][3], life:+d[4][4]} : null); } },
      lightning(d){ if (Array.isArray(d)){ weather.bolt(+d[0], +d[1], +d[2]); weather.strikeFlash(); if (G && Math.hypot(G.p.x - d[0], G.p.z - d[2]) < 3) hurtMe(5, {x:+d[0], z:+d[2]}); } },
      hostLeft(){ const h = G && G.host || 'The host'; if (G) leaveGame(true); msg(h + ' stopped hosting', 'The world is saved on their side. Join again when they open it.'); }
    }});
  } catch(e){ fail('Could not connect', 'Your browser could not reach your friend. Try again.'); }
}
let pendingCancel = null;
$('lcancel').onclick = () => { if (pendingCancel){ pendingCancel(); pendingCancel = null; } if (G) leaveGame(true); toMenu(); };
function msg(t, x){ $('mtitle').textContent = t; $('mtext').textContent = x; show('msg'); }
$('mok').onclick = () => toMenu();

function enter(g){
  hand.setSkin(skinNow);
  pendingCancel = () => { leaveGame(true); };
  stopBackdrop(); G = g; g.started = false;
  $('wname').textContent = g.opt.name; whoLine(); g.refreshBar(); $('chat').innerHTML = '';
  mats.fog(Math.max(16, S.dist * 16 * .62), S.dist * 16 - 2);
  show('load'); $('ltitle').textContent = g.opt.guest ? 'Joining ' + g.host + "'s world" : 'Opening ' + g.opt.name;
}
function whoLine(){
  const g = G; if (!g) return;
  $('wsub').textContent = g.opt.guest ? 'Building with ' + g.host : g.code ? 'Open to friends. Code ' + g.code : g.opt.where === 'cloud' ? 'Saved online' : 'Saved on this computer';
}
function started(){
  const g = G; g.started = true; show(); $('hud').hidden = false; lock(); hearts();
  if (g.opt.guest) sys('You joined ' + g.host + "'s world. Press T to chat.");
}

/* ---------- friends ---------- */
function seeFriend(id, d){
  const g = G; if (!g || !Array.isArray(d)) return;
  let a = g.avatars.get(id);
  if (!a){ const pp = g.party && g.party.people.get(id); a = avatar(scene, pp ? pp.name : 'Friend', pp && pp.skin); a.skinKey = JSON.stringify(pp && pp.skin || null); g.avatars.set(id, a); }
  a.set({x:+d[0], y:+d[1], z:+d[2], yaw:+d[3], pitch:+d[4]});
}
function dropFriend(id){ const g = G; if (!g) return; const a = g.avatars.get(id); if (a){ a.dispose(); g.avatars.delete(id); } }
function peopleChanged(l){
  const g = G; if (!g) return;
  $('who').innerHTML = l.length > 1 ? l.map(p => `<div class="${p.host ? 'h' : ''}">${esc(p.name)}</div>`).join('') : '';
  for (const [id, a] of [...g.avatars]){ const p = l.find(q => q.id === id); if (!p || a.skinKey !== JSON.stringify(p.skin || null)) dropFriend(id); }      // gone, or changed their look: made again with the next position
}
function chatLine(nm, t, cls){
  const c = $('chat'), d = document.createElement('div'); if (cls) d.className = cls;
  d.innerHTML = nm ? `<b>${esc(nm)}</b> ${esc(t)}` : esc(t); c.append(d);
  while (c.children.length > 8) c.firstChild.remove();
  setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 700); }, 12000);
}
const sys = t => chatLine('', t, 'sys');
async function openToFriends(){
  const g = G; if (!g || g.party || g.opt.guest) return;
  const code = newCode();
  try {
    g.party = await openParty({local:LOCALNET, code, host:true, name:myName(), skin:skinNow, on:{
      async welcome(){
        const mods = [...g.world.mods.keys()], chunks = [];
        for (const k of mods){ const v = g.world.mods.get(k).slice(); chunks.push({k, d:await pack(v)}); }
        return {hi:{name:g.opt.name, seed:g.opt.seed, kind:g.opt.kind, host:g.party.list()[0].name, gen:g.opt.gen, time:[g.time, g.day, S.cycle ? 1 : 0], mods, spawn:[+(g.p.x + 1).toFixed(2), +g.p.y.toFixed(2), +g.p.z.toFixed(2)]}, chunks};
      },
      edit(x, y, z, b){ if (!(b >= 0 && b < N) || ITEM[b]) return false; g.world.set(x, y, z, b); g.red.mark(x, y, z); g.liq.mark(x, y, z); if (SHAPE[b] === SH.button && STATE[b] % 12 >= 6) g.red.release(x, y, z); return true; },
      act(d, from){ cartAct(g, d, from); },
      pos(id, d){ seeFriend(id, d); },
      people(l){ peopleChanged(l); },
      joined(id, nm){ sys(nm + ' joined'); },
      left(id, nm){ sys(nm + ' left'); dropFriend(id); },
      chat(nm, t){ chatLine(nm, t); },
      slap(id, from, dmg){ const a = g.animals.list.get(id), f = g.avatars.get(from); if (a) g.animals.hurt(a, dmg || 1, f ? f.group.position : g.p); }
    }});
    g.code = code; whoLine(); live(true);
  } catch(e){ toast('Could not open it to friends. Try again.'); }
  renderInvite();
}
function closeToFriends(){ const g = G; if (!g || !g.party) return; g.party.leave(); g.party = null; g.code = null; for (const id of [...g.avatars.keys()]) dropFriend(id); $('who').innerHTML = ''; live(false); whoLine(); renderInvite(); }
async function live(on, g = G){ if (!g || g.opt.where !== 'cloud' || !session()) return; try { await Cloud.live(g.opt.id, on ? g.code : ''); } catch(e){} }
function renderInvite(){
  const g = G; if (!g) return;
  const on = !!g.code; $('inv-off').hidden = on; $('inv-on').hidden = !on; $('iname-f').hidden = !!session(); if (!session() && !$('iname').value) $('iname').value = store.get('craft-name', '');
  if (on){ $('icode').textContent = g.code; $('inote').textContent = g.opt.where === 'cloud' && session() ? 'Friends signed in to BDB Craft also see this world under Friends building.' : 'This world is kept on this computer, so it is not listed. Send friends the code.'; }
}
$('pchar').onclick = () => openCreator(false, 'pause');
$('pinvite').onclick = () => { if (G && G.opt.guest){ toast('Only ' + G.host + ' can invite people. Share the code ' + G.code + '.', 3500); return; } renderInvite(); show('invite'); };
$('iopen').onclick = () => { if (!session()){ const n = $('iname').value.trim().slice(0, 20); if (!n){ $('iname').focus(); return; } store.set('craft-name', n); } openToFriends(); };
$('iclose').onclick = () => closeToFriends();
$('icopy').onclick = async () => { try { await navigator.clipboard.writeText(G.code); toast('Code copied'); } catch(e){ const r = document.createRange(); r.selectNodeContents($('icode')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Copy it with Ctrl+C'); } };
for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => show('pause');

/* ---------- saving ---------- */
async function saveNow(final){
  const g = G; if (!g || g.opt.guest) return true;
  if (g.saving) await g.saving;
  const keys = [...g.world.dirty]; g.world.dirty.clear();
  const run = (async () => {
    try {
      const out = []; for (const k of keys){ const v = g.world.mods.get(k); if (!v) continue; const [cx, cz] = k.split(',').map(Number); out.push({cx, cz, d:await pack(v)}); }
      const meta = g.metaNow();
      if (g.opt.where === 'cloud'){ for (let i = 0; i < out.length || i === 0; i += 200) await Cloud.save(g.opt.id, out.slice(i, i + 200), meta); }
      else await Local.save(g.opt.id, out, meta);
      g.savedAt = Date.now(); return true;
    } catch(e){ for (const k of keys) g.world.dirty.add(k); return false; }
  })();
  g.saving = run; const ok = await run; g.saving = null;
  $('psave').textContent = ok ? '' : g.opt.where === 'cloud' ? 'Could not reach the BDB server to save. It will keep trying.' : 'Could not save on this computer.';
  return ok;
}
$('pquit').onclick = async () => {
  const g = G; if (!g) return; $('pquit').disabled = true; $('psave').textContent = g.opt.guest ? '' : 'Saving...';
  const ok = await saveNow(true); $('pquit').disabled = false;
  if (!ok && !g.quitAnyway){ g.quitAnyway = true; $('psave').textContent += ' Press Save and quit again to leave without saving.'; return; }
  leaveGame(); toMenu();
};
addEventListener('pagehide', () => { if (G && !G.opt.guest && G.opt.where === 'local') saveNow(); if (G && G.party) G.party.leave(); if (G) live(false); });
function leaveGame(){
  const g = G; if (!g) return; G = null;
  if (g.party){ if (!g.opt.guest) live(false, g); g.party.leave(); }
  for (const a of g.avatars.values()) a.dispose(); if (g.me) g.me.dispose(); g.animals.clear(); g.carts.clear(); for (const t of g.tnts) scene.remove(t.m);
  g.world.dispose(); hl.show(null); hand.set(0); $('hud').hidden = true; $('who').innerHTML = '';
  if (document.pointerLockElement) document.exitPointerLock();
}
function toMenu(){ pendingCancel = null; show('menu'); startBackdrop(); refreshMenu(); }

/* ---------- input ---------- */
const active = () => G && G.started && (document.pointerLockElement === canvas || (NOLOCK && !paused));
let paused = false;
function lock(){ paused = false; if (NOLOCK){ show(); return; } try { const r = canvas.requestPointerLock({unadjustedMovement:true}); if (r && r.catch) r.catch(() => { try { canvas.requestPointerLock(); } catch(e){} }); } catch(e){ try { canvas.requestPointerLock(); } catch(e2){} } }
function pause(){ if (!G || !G.started) return; paused = true; G.keys = {}; mouse.l = mouse.r = false; show('pause'); $('psave').textContent = ''; $('presume').textContent = G.everLocked || NOLOCK ? 'Back to building' : 'Start building'; $('ptitle').textContent = G.opt.guest ? G.opt.name + ', ' + G.host + "'s world" : G.opt.name; }
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas){ paused = false; if (G) G.everLocked = true; show(); return; }
  if (!G || !G.started) return;
  if (!$('inv').hidden || !$('chatin').hidden) return;
  pause();
});
document.addEventListener('pointerlockerror', () => { if (G && G.started && $('inv').hidden && $('chatin').hidden) pause(); });
$('presume').onclick = () => lock();
canvas.addEventListener('click', () => { if (G && G.started && !active() && $('inv').hidden) lock(); });
const mouse = {l:false, r:false, t:0};
addEventListener('mousemove', e => {
  if (!active()) return; const g = G, k = .0022 * S.sens / 100;
  g.p.yaw -= e.movementX * k; g.p.pitch -= e.movementY * k * (S.invert ? -1 : 1); g.p.pitch = Math.max(-1.55, Math.min(1.55, g.p.pitch));
});
function press(a, down){
  const g = G;
  if (a === 'place' && g && g.bar[g.sel] === B.item_bow){ if (down) g.bowAt = performance.now(); else if (g.bowAt){ shootBow(g, Math.min(1, (performance.now() - g.bowAt) / 900)); g.bowAt = 0; } return; }
  if (a === 'place' && g && g.bar[g.sel] === B.item_trident && down){ shootBow(g, 1, 9); return; }
  if (a === 'break'){ mouse.l = down; if (down){ mouse.t = 0; use('break'); } }
  else if (a === 'place'){ mouse.r = down; if (down){ mouse.t = 0; use('place'); } }
  else if (a === 'pick' && down) use('pick');
}
addEventListener('mousedown', e => {
  if (rebind){ e.preventDefault(); setKey('Mouse' + e.button); return; }
  if (!active() || e.target !== canvas) return; e.preventDefault();
  const a = KEYMAP['Mouse' + e.button]; if (a) { if (MOVE.includes(a)) G.keys[a] = true; else press(a, true); }
});
addEventListener('mouseup', e => { const a = KEYMAP['Mouse' + e.button]; if (a === 'break' || a === 'place') press(a, false); else if (a && MOVE.includes(a) && G) G.keys[a] = false; });
addEventListener('contextmenu', e => { if (G && G.started) e.preventDefault(); });
// the scroll wheel: one slot per notch. Smooth wheels and trackpads send lots of small steps, so add them up and move at most one slot at a time
let wheelSum = 0, wheelT = 0, wheelLast = 0;
addEventListener('wheel', e => { if (!active()) return; const now = performance.now(); if (now - wheelLast > 250) wheelSum = 0; wheelLast = now;
  wheelSum += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
  if (Math.abs(wheelSum) >= 50 && now - wheelT > 90){ G.pick(G.sel + (wheelSum > 0 ? 1 : -1)); wheelSum = 0; wheelT = now; } else if (Math.abs(wheelSum) >= 50) wheelSum = Math.sign(wheelSum) * 49; }, {passive:true});
/* the keys: every action, what it does, its key. Changed on the Controls screen and kept in the settings. Arrow keys always walk too */
const ACTIONS = [['f', 'Walk forward', 'KeyW'], ['b', 'Walk back', 'KeyS'], ['l', 'Step left', 'KeyA'], ['r', 'Step right', 'KeyD'], ['up', 'Jump, swim up, fly up (double tap to fly)', 'Space'],
  ['down', 'Sneak, fly down (with Jump: slowly, with Sprint: fast). Space + Down arrow also flies down slowly', 'ShiftLeft'], ['sprint', 'Sprint', 'ControlLeft'], ['inv', 'Every block (inventory)', 'KeyE'], ['chat', 'Chat', 'KeyT'], ['cmd', 'Type a command', 'Slash'],
  ['view', 'See yourself (behind, in front)', 'F5'], ['hud', 'Hide the screen extras', 'F1'], ['dbg', 'Where you are, speed', 'F3'],
  ['break', 'Break a block, hit', 'Mouse0'], ['place', 'Place, use (doors, levers, carts)', 'Mouse2'], ['pick', 'Pick the block you look at', 'Mouse1']];
const MOVE = ['f', 'b', 'l', 'r', 'up', 'down', 'sprint'];
const MOUSE_ACTS = ['break', 'place', 'pick'];
let KEYMAP = {};
function buildKeys(){ S.keys = Object.assign(Object.fromEntries(ACTIONS.map(a => [a[0], a[2]])), S.keys || {}); KEYMAP = {ArrowUp:'f', ArrowDown:'b', ArrowLeft:'l', ArrowRight:'r', ShiftRight:'down', ControlRight:'sprint'}; for (const [a, c] of Object.entries(S.keys)) KEYMAP[c] = a; }
buildKeys();
const keyName = c => !c ? '' : c === 'Mouse0' ? 'Left click' : c === 'Mouse2' ? 'Right click' : c === 'Mouse1' ? 'Middle click' : c.startsWith('Mouse') ? 'Mouse ' + (+c.slice(5) + 1) : c.startsWith('Key') ? c.slice(3) : c.startsWith('Digit') ? c.slice(5) : ({Space:'Space', ShiftLeft:'Left Shift', ShiftRight:'Right Shift', ControlLeft:'Left Ctrl', ControlRight:'Right Ctrl', AltLeft:'Left Alt', Slash:'/', Enter:'Enter', Tab:'Tab', Backquote:'`', CapsLock:'Caps Lock'}[c] || c);
addEventListener('keydown', e => {
  const g = G;
  if (e.target === $('chatin')){
    if (e.key === 'Enter'){ const t = $('chatin').value.trim(); $('chatin').value = ''; $('chatin').hidden = true; if (t && g && t.startsWith('/time')){ const w = t.split(/\s+/)[1] || '', T = {day:.04, morning:.04, noon:.25, sunset:.47, evening:.47, night:.62, midnight:.75}; if (g.opt.guest) sys('Only ' + g.host + ' can change the time.'); else if (w in T){ g.time = T[w]; sys('Time set to ' + w + '.'); if (g.party) g.party.time([g.time, g.day, S.cycle ? 1 : 0]); } else sys('Try /time day, noon, sunset or night.'); lock(); return; }
    if (t && g && t.startsWith('/weather')){ const w = t.split(/\s+/)[1] || ''; if (g.opt.guest) sys('Only ' + g.host + ' can change the weather.'); else if (['clear', 'rain', 'thunder'].includes(w)){ weather.set(w); sys('Weather: ' + w + '.'); g.tmT = 0; }
      else if (w === 'tornado'){ weather.set('thunder', {x:g.p.x + 40, z:g.p.z + 10, vx:-2.5, vz:-.5, life:120}); sys('A tornado is coming.'); g.tmT = 0; } else sys('Try /weather clear, rain, thunder or tornado.'); lock(); return; }
    if (t && g && t.startsWith('/tp')){ const n = t.split(/\s+/).slice(1).map(Number); if (n.length === 3 && n.every(Number.isFinite)){ g.p.x = n[0] + .5; g.p.y = Math.max(2, Math.min(200, n[1])); g.p.z = n[2] + .5; g.p.vx = g.p.vy = g.p.vz = 0; g.p.fly = true; sys('Teleported.'); } else sys('Try /tp x y z.'); lock(); return; }
    if (t && g && t.startsWith('/city')){ if (g.opt.gen !== 2 || g.opt.kind !== 'normal'){ sys('This world has no cities. Make a new world to get them.'); lock(); return; }
      // /city goes to the nearest city you are not in; /city Kingston goes to that one if it is anywhere near
      const want = t.slice(5).trim().toLowerCase(); let best = null, bd = 1e9; const rx = Math.floor(g.p.x / 1024), rz = Math.floor(g.p.z / 1024), seen = new Set();
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) for (const c of citiesNear(g.opt.seed, (rx + dx) * 1024 + 512, (rz + dz) * 1024 + 512)){ if (seen.has(c)) continue; seen.add(c);
        const d = Math.hypot(c.x - g.p.x, c.z - g.p.z); if (want ? c.name.toLowerCase().startsWith(want) && d < bd : d < bd && d > c.r){ bd = d; best = c; } }
      if (!best){ sys(want ? 'No city called that near here. Cities near you: ' + [...seen].sort((a, b) => Math.hypot(a.x - g.p.x, a.z - g.p.z) - Math.hypot(b.x - g.p.x, b.z - g.p.z)).slice(0, 6).map(c => c.name).join(', ') + '.' : 'No city near here.'); lock(); return; }
      goCity(best); lock(); return; }
    if (t && g){ chatLine(session() ? session().name : g.party ? g.party.list()[0].name : 'You', t); if (g.party) g.party.chat(t); else if (!g.party) sys('No one else is here. Invite friends from the pause screen.'); } lock(); }
    if (e.key === 'Escape'){ $('chatin').value = ''; $('chatin').hidden = true; setTimeout(() => { if (!active()) pause(); }, 0); }
    return;
  }
  if (rebind){ e.preventDefault(); if (e.code !== 'Escape') setKey(e.code); else { rebind = null; renderKeys(); } return; }
  if (e.target && (e.target.tagName === 'INPUT') && e.target.id !== 'invq') return;
  if (!$('inv').hidden){
    if (e.code === 'Escape' || (KEYMAP[e.code] === 'inv' && e.target.id !== 'invq')){ e.preventDefault(); closeInv(); }
    else if (/^Digit[1-9]$/.test(e.code) && e.target.id !== 'invq'){ g.pick(+e.code.slice(5) - 1, true); renderInvBar(); }
    return;
  }
  if (!g || !g.started) return;
  if (!active()){ if (e.code === 'Escape' && !$('pause').hidden && NOLOCK) lock(); return; }
  if (e.code === 'Escape' && NOLOCK){ pause(); return; }
  if (e.code === 'Tab' || /^F\d+$/.test(e.code) || e.code === 'Space' || e.ctrlKey) e.preventDefault();
  const k = KEYMAP[e.code];
  if (e.code === 'ArrowDown') g.keys.ad = true;
  if (k && MOVE.includes(k)){
    if (k === 'up' && !e.repeat){ const t = performance.now(); if (t - g.lastTapSpace < 300){ g.p.fly = !g.p.fly; g.p.vy = 0; g.lastTapSpace = 0; } else g.lastTapSpace = t; }
    if (k === 'f' && !e.repeat){ const t = performance.now(); if (t - g.lastTapW < 280) g.p.sprint = true; g.lastTapW = t; }
    g.keys[k] = true; return;
  }
  if (/^Digit[1-9]$/.test(e.code)){ g.pick(+e.code.slice(5) - 1); return; }
  if (k && MOUSE_ACTS.includes(k)){ if (!e.repeat) press(k, true); return; }
  if (k === 'inv'){ openInv(); return; }
  if (k === 'chat' || k === 'cmd' || e.code === 'Enter'){ e.preventDefault(); $('chatin').hidden = false; if (k === 'cmd') $('chatin').value = '/'; if (!NOLOCK && document.pointerLockElement) document.exitPointerLock(); setTimeout(() => $('chatin').focus(), 0); return; }
  if (k === 'hud'){ g.hud = !g.hud; $('hud').classList.toggle('off', !g.hud); return; }
  if (k === 'dbg'){ g.dbg = !g.dbg; $('dbg').hidden = !g.dbg; return; }
  if (k === 'view'){ g.view = ((g.view | 0) + 1) % 3; return; }
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (e.code === 'ArrowDown' && G) G.keys.ad = false; if (k && MOUSE_ACTS.includes(k)) press(k, false); else if (k && G) G.keys[k] = false; });
addEventListener('blur', () => { if (G){ G.keys = {}; mouse.l = mouse.r = false; } });

/* break, place, pick */
function use(what){
  const g = G; if (!g) return;
  if (what === 'break' && g.critter){ const a = g.critter, dmg = DMG[g.bar[g.sel]] || 1; hand.swing(); if (g.opt.guest) g.party.slap(a.id, dmg); else g.animals.hurt(a, dmg, g.p); return; }
  if (g.cartHit){ hand.swing(); if (what === 'break') cartDo(g, {a:'break', id:g.cartHit.id}); else if (what === 'place') cartDo(g, {a:'ride', id:g.cartHit.id}); return; }
  const hit = g.hit; if (!hit) return;
  if (what === 'break'){
    if (hit.y < 1) return;
    const b = hit.b; edit(hit.x, hit.y, hit.z, WET[b] ? B.water : 0);       // a waterlogged block leaves its water behind
    if (SHAPE[b] === SH.door){ const oy = STATE[b] >> 3 ? -1 : 1, o = g.world.get(hit.x, hit.y + oy, hit.z); if (o > 0 && SHAPE[o] === SH.door) edit(hit.x, hit.y + oy, hit.z, WET[o] ? B.water : 0); }
    hand.swing(); return;
  }
  if (what === 'pick'){ const b = ROOT[hit.b] || hit.b; const i = g.bar.indexOf(b); if (i >= 0) g.pick(i); else { g.bar[g.sel] = b; g.pick(g.sel); } return; }
  const hb = hit.b, hs = SHAPE[hb], held = g.bar[g.sel];
  // things you hold that are not blocks
  if (ITEM[held]){
    if (held === B.item_minecart && hs === SH.rail) cartDo(g, {a:'put', x:hit.x, y:hit.y, z:hit.z});
    else if (held === B.item_water_bucket || held === B.item_lava_bucket){ const t = g.world.get(hit.px, hit.py, hit.pz); if (t === 0 || (t > 0 && (LIQUID[t] || PLANT[t]))) edit(hit.px, hit.py, hit.pz, held === B.item_water_bucket ? B.water : B.lava); }
    else if (held === B.item_bucket){ const wh = g.world.ray(eye, dir, 6, true); if (wh && LIQUID[wh.b]) edit(wh.x, wh.y, wh.z, 0); }
    else if (held === B.item_flint && hb === B.tnt) cartDo(g, {a:'ignite', x:hit.x, y:hit.y, z:hit.z});
    else if (BLOCKS[held].egg) cartDo(g, {a:'egg', k:BLOCKS[held].egg, x:hit.px + .5, y:hit.py, z:hit.pz + .5});
    hand.swing(); return;
  }
  // levers flip and buttons press with a right click
  if (!g.p.sneak && (hs === SH.lever || hs === SH.button)){
    if (!g.opt.guest) g.red.press(hit.x, hit.y, hit.z);
    else { const st = STATE[hb], n = BLOCKS[FIRST[hb]].n, wet = WET[hb] ? n : 0; if (hs === SH.lever) edit(hit.x, hit.y, hit.z, FIRST[hb] + wet + (st + 6) % 12); else if (st < 6) edit(hit.x, hit.y, hit.z, FIRST[hb] + wet + st + 6); }
    hand.swing(); return;
  }
  // doors, trapdoors and gates open and shut with a right click (sneak to place against them instead)
  if (!g.p.sneak && (hs === SH.door || hs === SH.trapdoor || hs === SH.gate) && !BLOCKS[FIRST[hb]].key.includes('iron')){
    const flip = id => { const st = STATE[id], n = BLOCKS[FIRST[id]].n, bit = hs === SH.door ? 4 : hs === SH.trapdoor ? 8 : 4; return FIRST[id] + (WET[id] ? n : 0) + (st ^ bit); };
    edit(hit.x, hit.y, hit.z, flip(hb));
    if (hs === SH.door){ const oy = STATE[hb] >> 3 ? -1 : 1, o = g.world.get(hit.x, hit.y + oy, hit.z); if (o > 0 && SHAPE[o] === SH.door) edit(hit.x, hit.y + oy, hit.z, flip(o)); }
    hand.swing(); return;
  }
  const b = g.bar[g.sel]; if (!b) return;
  let x = hit.px, y = hit.py, z = hit.pz;
  if (PLANT[hit.b]){ x = hit.x; y = hit.y; z = hit.z; }                     // clicking tall grass swaps it for the block
  const face = hit.face || [0, 1, 0], fy = face[1], frac = hit.hp ? hit.hp.y - Math.floor(hit.hp.y) : .5;
  // a slab on a slab of the same kind makes the whole block
  const sh = SHAPE[b];
  if (sh === SH.slab){
    const tryJoin = (cx, cy, cz) => { const t = g.world.get(cx, cy, cz); return t > 0 && SHAPE[t] === SH.slab && FIRST[t] === b; };
    if (SHAPE[hit.b] === SH.slab && FIRST[hit.b] === b && ((STATE[hit.b] === 0 && fy === 1) || (STATE[hit.b] === 1 && fy === -1))){ edit(hit.x, hit.y, hit.z, FULL[b]); hand.swing(); return; }
    if (tryJoin(x, y, z)){ edit(x, y, z, FULL[b]); hand.swing(); return; }
  }
  if (y < 1 || y > 127) return;
  const there = g.world.get(x, y, z); if (there > 0 && !LIQUID[there] && !PLANT[there]) return;
  if ((SOLID[b] || (sh && sh !== SH.torch && sh !== SH.ladder && sh !== SH.carpet)) && g.p.overlaps(x, y, z)) return;
  if (PLANT[b]){ const under = g.world.get(x, y - 1, z); if (!(under > 0 && SOLID[under])) return; }
  const F = lookFacing(g.p.yaw), wall = face[0] === 1 ? 3 : face[0] === -1 ? 1 : face[2] === 1 ? 0 : face[2] === -1 ? 2 : -1;
  const wetAdd = (LIQUID[there] === 1 || WET[there]) && sh && BLOCKS[b].wet === 0 && BLOCKS[b + BLOCKS[b].n] && BLOCKS[b + BLOCKS[b].n].wet === 1 ? BLOCKS[b].n : 0;
  let id = b;
  if (sh === SH.slab) id = b + (fy === -1 || (fy === 0 && frac > .5) ? 1 : 0);
  else if (sh === SH.stairs) id = b + F + (fy === -1 || (fy === 0 && frac > .5) ? 4 : 0);
  else if (sh === SH.trapdoor) id = b + F + (fy === -1 || (fy === 0 && frac > .5) ? 4 : 0);
  else if (sh === SH.gate) id = b + F;
  else if (sh === SH.torch){ if (fy === -1) return; id = b + (fy === 1 ? 0 : 1 + wall); }
  else if (sh === SH.lantern) id = b + (fy === -1 ? 1 : 0);
  else if (sh === SH.ladder){ if (wall < 0) return; id = b + wall; }
  else if (sh === SH.lever || sh === SH.button) id = b + (fy === 1 ? 4 : fy === -1 ? 5 : wall);
  else if (sh === SH.dust || sh === SH.plate || sh === SH.repeater || sh === SH.rail){ const under = g.world.get(x, y - 1, z); if (!(under > 0 && (OPAQUE[under] || (SHAPE[under] === SH.slab && STATE[under] === 1)))) return; id = sh === SH.repeater ? b + F : b; }
  else if (sh === SH.door){
    const above = g.world.get(x, y + 1, z); if (y > 126 || (above > 0 && !LIQUID[above] && !PLANT[above])) return;
    const wetUp = (LIQUID[above] === 1) ? BLOCKS[b].n : 0;
    edit(x, y, z, b + F + wetAdd); edit(x, y + 1, z, b + F + 8 + wetUp); hand.swing(); return;
  }
  else if (TURN[b * 4 + 1]){ const front = (F + 2) % 4, r = [2, 1, 0, 3][front]; id = r ? TURN[b * 4 + r] : b; }
  else if (AXIS[b * 3 + 1]){ id = face[0] ? AXIS[b * 3 + 1] : face[2] ? AXIS[b * 3 + 2] : b; }
  edit(x, y, z, id + wetAdd); hand.swing();
  if (sh === SH.rail){ setRail(g, x, y, z, F); for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) for (const dy of [0, -1, 1]){ const n = g.world.get(x + dx, y + dy, z + dz); if (n > 0 && SHAPE[n] === SH.rail && (dy === -1 || railLinks(g, x + dx, y + dy, z + dz) < 2)) setRail(g, x + dx, y + dy, z + dz, F); } }
}
/* lightning: a bolt, a flash, and it hurts anything right there */
const LEAVES = new Set(BLOCKS.filter(b => /^leaves_/.test(b.key)).map(b => b.id));
function strike(g, x, z){
  const y = g.world.surface(Math.floor(x), Math.floor(z)); if (y <= 0) return;
  weather.bolt(x, y, z); weather.strikeFlash(); if (g.party) g.party.lightning([+x.toFixed(1), y, +z.toFixed(1)]);
  for (const a of g.animals.list.values()) if (Math.hypot(a.x - x, a.z - z) < 3) g.animals.hurt(a, 8, {x, z});
  if (Math.hypot(g.p.x - x, g.p.z - z) < 3) hurtMe(5, {x, z});
}
/* the bow: the longer you hold, the faster and harder the arrow */
function shootBow(g, k, dmg){
  const sp = 10 + k * 28, v = [+eye.x.toFixed(2), +(eye.y - .1).toFixed(2), +eye.z.toFixed(2), +(dir.x * sp).toFixed(2), +(dir.y * sp).toFixed(2), +(dir.z * sp).toFixed(2), dmg || Math.round(2 + k * 7)];
  hand.swing(); cartDo(g, {a:'arrow', v});
}
/* getting hurt (only with "Monsters can hurt you" on): a red flash, a shove, hearts go down; at none you start again where the world began */
function hurtMe(dmg, from){
  const g = G; if (!g || !S.hurt || !S.monsters || g.dead) return;
  g.hp = Math.max(0, g.hp - dmg); g.regenT = 0; flashRed(); hearts();
  if (from){ const dx = g.p.x - from.x, dz = g.p.z - from.z, d = Math.hypot(dx, dz) || 1; g.p.vx += dx / d * 7; g.p.vz += dz / d * 7; g.p.vy = Math.max(g.p.vy, 5); }
  if (g.hp <= 0){ g.dead = true; if (document.pointerLockElement) document.exitPointerLock(); $('dtext').textContent = from && from.kind ? 'A ' + from.kind + ' got you.' : 'You ran out of hearts.'; show('dead'); }
}
function flashRed(){ const e = $('ouch'); e.style.opacity = .55; clearTimeout(flashRed.t); flashRed.t = setTimeout(() => e.style.opacity = 0, 160); }
function hearts(){
  const g = G, e = $('hearts'); if (!g || !S.hurt || !S.monsters){ e.hidden = true; return; } e.hidden = false;
  let h = ''; for (let i = 0; i < 10; i++){ const v = g.hp - i * 2; h += `<i class="${v >= 2 ? 'full' : v === 1 ? 'half' : ''}"></i>`; } e.innerHTML = h;
}
function respawn(){
  const g = G; if (!g) return; g.dead = false; g.hp = 20; hearts();
  const s = g.spawnAt || g.firstSpawn; if (s){ g.p.x = s[0]; g.p.y = s[1]; g.p.z = s[2]; } g.p.vx = g.p.vy = g.p.vz = 0; show(); lock();
}
$('drespawn').onclick = () => respawn();
/* a puff of smoke where something died */
const puffs = [], puffGeo = new THREE.BoxGeometry(.18, .18, .18), puffMat = new THREE.MeshBasicMaterial({color:0xe8e8e8, transparent:true, opacity:.9});
function poof(x, y, z){ for (let i = 0; i < 14; i++){ const m = new THREE.Mesh(puffGeo, puffMat.clone()); m.position.set(x + (Math.random() - .5) * .6, y + (Math.random() - .5) * .6, z + (Math.random() - .5) * .6); scene.add(m); puffs.push({m, v:[(Math.random() - .5) * 2, Math.random() * 2, (Math.random() - .5) * 2], t:0}); } }
/* rails lay themselves: towards the rails next to them, up a slope to one a block higher, round a corner when two meet at a right angle */
const RCONN = [[[0, -1], [0, 1]], [[1, 0], [-1, 0]], [[1, 0], [-1, 0]], [[-1, 0], [1, 0]], [[0, -1], [0, 1]], [[0, 1], [0, -1]], [[0, 1], [1, 0]], [[0, 1], [-1, 0]], [[0, -1], [-1, 0]], [[0, -1], [1, 0]]];
const isRail = (g, x, y, z) => { const b = g.world.get(x, y, z); return b > 0 && SHAPE[b] === SH.rail; };
const railShape = b => FIRST[b] === B.rail_powered ? STATE[b] % 6 : STATE[b];
function railLinks(g, x, y, z){ const b = g.world.get(x, y, z); return RCONN[railShape(b)].filter(([dx, dz]) => [0, 1, -1].some(dy => isRail(g, x + dx, y + dy, z + dz))).length; }
function setRail(g, x, y, z, F){
  const b = g.world.get(x, y, z); if (!(b > 0) || SHAPE[b] !== SH.rail) return;
  const powered = FIRST[b] === B.rail_powered, D = [[0, -1], [1, 0], [0, 1], [-1, 0]], conn = [], up = [];
  D.forEach(([dx, dz], i) => { if (isRail(g, x + dx, y + 1, z + dz)) up.push(i); if (isRail(g, x + dx, y, z + dz) || isRail(g, x + dx, y - 1, z + dz) || isRail(g, x + dx, y + 1, z + dz)) conn.push(i); });
  let r;
  if (up.length) r = [4, 2, 5, 3][up[0]];                                          // climbing north, east, south or west
  else if (!powered && conn.length >= 2 && conn[0] % 2 !== conn[1] % 2){ const has = i => conn.includes(i); r = has(2) && has(1) ? 6 : has(2) && has(3) ? 7 : has(0) && has(3) ? 8 : 9; }
  else if (conn.length) r = conn[0] % 2 ? 1 : 0;
  else r = F % 2 ? 1 : 0;
  const keep = powered && STATE[b] >= 6 ? 6 : 0, want = FIRST[b] + r + keep;
  if (want !== b) edit(x, y, z, want);
}
/* carts and TNT: the host does them; a friend asks the host */
function cartDo(g, d){ if (g.opt.guest){ g.party.act(d); if (d.a === 'ride') g.riding = d.id; if (d.a === 'leave') g.riding = null; } else cartAct(g, d, null); }
function cartAct(g, d, from){
  if (!d || typeof d !== 'object') return;
  if (d.a === 'put') g.carts.put(d.x | 0, d.y | 0, d.z | 0);
  else if (d.a === 'break'){ const c = g.carts.list.get(d.id); if (c){ if (c.rider === (from || 'me') && !from) g.riding = null; g.carts.remove(c); } }
  else if (d.a === 'ride'){ const c = g.carts.list.get(d.id); if (c && !c.rider){ c.rider = from || 'me'; if (!from) g.riding = c.id; } }
  else if (d.a === 'leave'){ for (const c of g.carts.list.values()) if (c.rider === (from || 'me')) c.rider = null; if (!from) g.riding = null; }
  else if (d.a === 'push' && Array.isArray(d.v)){ g.pushes.set(d.id, [+d.v[0] || 0, +d.v[1] || 0]); }
  else if (d.a === 'egg' && typeof d.k === 'string' && g.animals.KINDS[d.k]){ const m = g.animals.add(d.k, +d.x, +d.y, +d.z); if (m && d.k === 'villager') m.home = null; }
  else if (d.a === 'arrow' && Array.isArray(d.v)){ g.animals.arrow(+d.v[0], +d.v[1], +d.v[2], +d.v[3], +d.v[4], +d.v[5], false, Math.min(9, +d.v[6] || 2)); }
  else if (d.a === 'ignite'){ const b = g.world.get(d.x | 0, d.y | 0, d.z | 0); if (b === B.tnt) ignite(g, d.x | 0, d.y | 0, d.z | 0, 4); }
}
/* TNT: it goes out of the world as a flashing block for a few seconds, then blows a round hole, lights any TNT it reaches and throws you back */
const tntGeo = new THREE.BoxGeometry(.98, .98, .98);
function ignite(g, x, y, z, fuse){
  if (g.world.get(x, y, z) === B.tnt) edit(x, y, z, 0, true);
  const mats = [0, 1, 2, 3, 4, 5].map(f => new THREE.MeshLambertMaterial({map:faceTex(FACE[B.tnt * 6 + f]), emissive:new THREE.Color(0xffffff), emissiveIntensity:0}));
  const m = new THREE.Mesh(tntGeo, mats); m.position.set(x + .5, y + .5, z + .5); scene.add(m);
  g.tnts.push({x, y, z, t:fuse, m});
}
const texCache = new Map();
function faceTex(l){ if (texCache.has(l)) return texCache.get(l); const c = document.createElement('canvas'); c.width = c.height = TS; const x = c.getContext('2d'), im = x.createImageData(TS, TS); im.data.set(layers.subarray(l * TS * TS * 4, (l + 1) * TS * TS * 4)); x.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; texCache.set(l, t); return t; }
const HARD = new Set(['bedrock', 'obsidian', 'crying_obsidian', 'reinforced_deepslate', 'water', 'lava']);
function explode(g, cx, cy, cz){
  const R = 3.3;
  for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let z = Math.floor(cz - R); z <= cz + R; z++) for (let x = Math.floor(cx - R); x <= cx + R; x++){
    const d = Math.hypot(x + .5 - cx, y + .5 - cy, z + .5 - cz); if (d > R - Math.random() * .8 || y < 1) continue;
    const b = g.world.get(x, y, z); if (!(b > 0) || HARD.has(BLOCKS[ROOT[b] || b].key) || LIQUID[b]) continue;
    if (b === B.tnt){ ignite(g, x, y, z, .6 + Math.random()); continue; }
    edit(x, y, z, WET[b] ? B.water : 0);
  }
  const p = g.p, dx = p.x - cx, dy = p.y + 1 - cy, dz = p.z - cz, d = Math.hypot(dx, dy, dz);
  if (d < 7){ const k = (7 - d) * 3 / Math.max(d, .5); p.vx += dx * k; p.vy += Math.max(4, dy * k); p.vz += dz * k; }
  boom(cx, cy, cz);
}
const booms = [];
/* a block of sand or gravel dropping */
function fallBlock(g, x, y, z, toY, b){
  const mats = [0, 1, 2, 3, 4, 5].map(f => new THREE.MeshLambertMaterial({map:faceTex(FACE[b * 6 + f])}));
  const m = new THREE.Mesh(tntGeo, mats); m.position.set(x + .5, y + .5, z + .5); scene.add(m); g.falling.push({x, y, z, toY, b, m, vy:0});
}
function boom(x, y, z){
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({color:0xffe2a0, transparent:true, opacity:.9, depthWrite:false}));
  m.position.set(x, y, z); scene.add(m); booms.push({m, t:0});
}
/* which way you are looking, as 0 north (-z), 1 east, 2 south, 3 west */
function lookFacing(yaw){ const dx = -Math.sin(yaw), dz = -Math.cos(yaw); return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : (dz > 0 ? 2 : 0); }
function edit(x, y, z, b, src){
  const g = G; if (!g || !g.world.set(x, y, z, b)) return;
  if (!g.opt.guest){ if (src !== true && src !== 'red') g.red.mark(x, y, z); if (src !== 'liq') g.liq.mark(x, y, z); }
  // a plant, torch or carpet standing on a block that just went goes with it
  if (!b || LIQUID[b]){ const up = g.world.get(x, y + 1, z); if (up > 0 && (PLANT[up] || (SHAPE[up] === SH.torch && STATE[up] === 0) || SHAPE[up] === SH.carpet)){ g.world.set(x, y + 1, z, 0); if (g.party) g.party.edit(x, y + 1, z, 0); } }
  if (g.party) g.party.edit(x, y, z, b);
}

/* inventory */
let invTab = 'all';
function openInv(){ if (!G) return; paused = true; G.keys = {}; show('inv'); if (document.pointerLockElement) document.exitPointerLock(); renderInv(); $('invq').value = ''; renderGrid(); }
function closeInv(){ show(); lock(); }
function renderInv(){
  const t = $('invtabs'); t.innerHTML = '';
  for (const [k, n] of [['all', 'All'], ...CATS]){ const b = document.createElement('button'); b.type = 'button'; b.textContent = n; b.className = k === invTab ? 'on' : ''; b.onclick = () => { invTab = k; renderInv(); renderGrid(); }; t.append(b); }
  renderInvBar();
}
function renderInvBar(){
  const g = G, bar = $('invbar'); bar.innerHTML = '';
  g.bar.forEach((b, i) => { const s = document.createElement('button'); s.type = 'button'; s.className = 'slot' + (i === g.sel ? ' on' : ''); s.innerHTML = `<img alt="${esc(BLOCKS[b].name)}" src="${iconOf(b)}">`; s.onclick = () => { g.pick(i, true); renderInvBar(); }; s.onmouseenter = () => $('invname').textContent = BLOCKS[b].name; bar.append(s); });
}
function renderGrid(){
  const q = $('invq').value.trim().toLowerCase(), grid = $('grid'); grid.innerHTML = '';
  for (const b of BLOCKS){
    if (!b.id || !b.cat || (invTab !== 'all' && b.cat !== invTab) || (q && !b.name.toLowerCase().includes(q))) continue;
    const s = document.createElement('button'); s.type = 'button'; s.className = 'slot'; s.title = b.name; s.innerHTML = `<img alt="${esc(b.name)}" src="${iconOf(b.id)}">`;
    s.onclick = () => { G.bar[G.sel] = b.id; G.refreshBar(); renderInvBar(); $('invname').textContent = b.name + ' is in slot ' + (G.sel + 1); };
    s.onmouseenter = () => $('invname').textContent = b.name; grid.append(s);
  }
  if (!grid.children.length) grid.innerHTML = '<div class="empty" style="grid-column:1/-1">No blocks match that.</div>';
}
$('invq').oninput = renderGrid;

/* the controls screen: every key, click one and press the new key (or a mouse button) */
let rebind = null, keysBack = 'settings';
function setKey(code){ for (const [a, c] of Object.entries(S.keys)) if (c === code) S.keys[a] = ''; S.keys[rebind] = code; saveSettings(); buildKeys(); rebind = null; renderKeys(); }
function renderKeys(){
  const box = $('keylist'); box.innerHTML = '';
  for (const [a, label] of ACTIONS){
    const row = document.createElement('div'); row.className = 'keyrow';
    row.innerHTML = `<span>${label}</span><button type="button" class="kb${rebind === a ? ' wait' : ''}">${rebind === a ? 'Press a key' : esc(keyName(S.keys[a]) || 'None')}</button>`;
    row.querySelector('button').onclick = e => { e.stopPropagation(); setTimeout(() => { rebind = a; renderKeys(); }, 0); }; box.append(row);
  }
  for (const [k, label] of [['Scroll wheel, 1 to 9', 'Choose from the hotbar'], ['Esc', 'Pause']]){ const row = document.createElement('div'); row.className = 'keyrow fixed'; row.innerHTML = `<span>${label}</span><b>${k}</b>`; box.append(row); }
}
function openKeys(back){ keysBack = back; rebind = null; renderKeys(); show('keysp'); }
$('kreset').onclick = () => { S.keys = {}; buildKeys(); saveSettings(); renderKeys(); };
$('kdone').onclick = () => { rebind = null; show(keysBack); };
$('pkeys').onclick = () => openKeys('pause');
/* teleport: every city and town near you, nearest first; pick one and you are standing on a street corner in the middle of it */
const SIZE_NAME = {town:'Town', city:'City', mega:'Huge city'};
function citiesAround(g){ const rx = Math.floor(g.p.x / 1024), rz = Math.floor(g.p.z / 1024), seen = new Set();
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) for (const c of citiesNear(g.opt.seed, (rx + dx) * 1024 + 512, (rz + dz) * 1024 + 512)) seen.add(c);
  return [...seen].sort((a, b) => Math.hypot(a.x - g.p.x, a.z - g.p.z) - Math.hypot(b.x - g.p.x, b.z - g.p.z)); }
function goCity(c){ const g = G, at = cityLanding(c); g.p.x = at.x; g.p.y = at.y; g.p.z = at.z; g.p.vx = g.p.vy = g.p.vz = 0; g.p.fly = true; g.p.yaw = 0; g.p.pitch = .08; g.cityT = 0; sys('Off to ' + c.name + '.'); }
function renderTele(){
  const g = G, box = $('telelist'), want = $('telefind').value.trim().toLowerCase(); box.innerHTML = '';
  const list = citiesAround(g).filter(c => !want || c.name.toLowerCase().includes(want) || c.place.toLowerCase().includes(want));
  if (!list.length){ box.innerHTML = '<p class="note">' + (want ? 'No city by that name near here.' : 'No cities near here.') + '</p>'; return; }
  for (const c of list){ const d = Math.hypot(c.x - g.p.x, c.z - g.p.z), here = Math.max(Math.abs(g.p.x - c.x), Math.abs(g.p.z - c.z)) <= c.r;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'telerow';
    b.innerHTML = `<span><b>${esc(c.name)}</b><small>${esc(c.place)}</small></span><em>${SIZE_NAME[c.size]}<br>${here ? 'You are here' : Math.round(d / 10) * 10 + ' blocks'}</em>`;
    b.onclick = () => { goCity(c); lock(); }; box.append(b); }
}
function openTele(){ const g = G; if (!g) return; if (g.opt.gen !== 2 || g.opt.kind !== 'normal'){ $('telelist').innerHTML = '<p class="note">This world has no cities. Make a new world to get them.</p>'; $('telefind').hidden = true; }
  else { $('telefind').hidden = false; $('telefind').value = ''; renderTele(); } show('telep'); if (!$('telefind').hidden) setTimeout(() => $('telefind').focus(), 0); }
$('ptele').onclick = openTele; $('teledone').onclick = () => show('pause'); $('telefind').oninput = renderTele;
$('telefind').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter'){ const first = $('telelist').querySelector('.telerow'); if (first) first.click(); } if (e.key === 'Escape') show('pause'); };
$('skeys').onclick = () => openKeys('settings');

/* settings */
function renderSettings(){
  $('sdist').value = S.dist; $('odist').textContent = S.dist; $('sfov').value = S.fov; $('ofov').textContent = S.fov; $('ssens').value = S.sens; $('osens').textContent = S.sens + '%';
  $('sinv').checked = S.invert; $('sclouds').checked = S.clouds; $('shand').checked = S.hand; $('sanimals').checked = S.animals; $('smonsters').checked = S.monsters; $('shurt').checked = S.hurt; $('scycle').checked = S.cycle;
}
$('psettings').onclick = () => { renderSettings(); show('settings'); };
$('sdist').oninput = () => { S.dist = +$('sdist').value; $('odist').textContent = S.dist; if (G){ G.world.R = S.dist; mats.fog(Math.max(16, S.dist * 16 * .62), S.dist * 16 - 2); } saveSettings(); };
$('sfov').oninput = () => { S.fov = +$('sfov').value; $('ofov').textContent = S.fov; saveSettings(); };
$('ssens').oninput = () => { S.sens = +$('ssens').value; $('osens').textContent = S.sens + '%'; saveSettings(); };
$('sinv').onchange = () => { S.invert = $('sinv').checked; saveSettings(); };
$('sclouds').onchange = () => { S.clouds = $('sclouds').checked; saveSettings(); };
$('scycle').onchange = () => { S.cycle = $('scycle').checked; saveSettings(); if (!S.cycle && G && !G.opt.guest) G.time = .25; };
$('smonsters').onchange = () => { S.monsters = $('smonsters').checked; saveSettings(); hearts(); };
$('shurt').onchange = () => { S.hurt = $('shurt').checked; saveSettings(); hearts(); };
$('sanimals').onchange = () => { S.animals = $('sanimals').checked; saveSettings(); };
$('shand').onchange = () => { S.hand = $('shand').checked; saveSettings(); if (G) G.refreshBar(); };

/* ---------- the frame ---------- */
let lastNight = 0, last = performance.now(), fpsN = 0, fpsT = 0, fps = 0;
const dir = new THREE.Vector3(), eye = new THREE.Vector3();
function frame(t){
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (t - last) / 1000); last = t;
  fpsN++; fpsT += dt; if (fpsT > .5){ fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
  camera.fov += (((G && G.p.sprint && !paused) ? S.fov * 1.12 : S.fov) - camera.fov) * Math.min(1, dt * 10); camera.updateProjectionMatrix();
  if (backdrop && !G){
    backdrop.a += dt * .03; const w = backdrop.w, cx = 8, cz = 8;
    w.update(cx, cz);
    const y = Math.max(92, (w.surface(cx, cz) > 0 ? w.surface(cx, cz) : 70) + 26);
    camera.position.set(cx, y, cz); camera.rotation.set(-.3, backdrop.a, 0);
  }
  const g = G;
  if (g){
    const w = g.world, p = g.p;
    w.update(p.x, p.z);
    if (!g.started){
      const need = Math.PI * Math.min(S.dist, 4) ** 2, have = w.loaded();
      $('lbar').style.width = Math.min(100, 65 + 35 * have / need) + '%';
      if (!g.opt.guest || !g.waiting || !g.waiting.size) $('lnote').textContent = 'Building the land around you...';
      if (w.loadedAround(p.x, p.z, 2) && have >= need * .8 && (!g.waiting || !g.waiting.size)){
        if (g.needUp){ const s = w.surface(Math.floor(p.x), Math.floor(p.z)); if (s > 0) p.y = Math.max(s, g.opt.spawn ? p.y : 0); g.needUp = false; }
        while (p.blocked(p.x, p.y, p.z) && p.y < 126) p.y += 1;
        if (!g.firstSpawn) g.firstSpawn = [p.x, p.y, p.z];
        started();
      }
    }
    if (g.started && w.loadedAround(p.x, p.z, 0) && !g.riding){
      p.step(dt, active() ? g.keys : {});
      if (mouse.l || mouse.r){ mouse.t += dt; if (mouse.t > .22){ mouse.t = 0; use(mouse.l ? 'break' : 'place'); } }
    }
    camera.position.set(p.x, p.eye, p.z); camera.rotation.set(p.pitch, p.yaw, 0);
    camera.getWorldDirection(dir); eye.copy(camera.position);
    g.hit = g.started ? w.ray(eye, dir, 6) : null; hl.show(active() || NOLOCK ? g.hit : null, g.hit && w.bounds(g.hit.x, g.hit.y, g.hit.z));
    // F5: you, from behind or from the front. The camera backs off until a block is in the way
    const view = g.view | 0;
    if (view && g.started){
      if (!g.me){ g.me = avatar(scene, myName(), skinNow); g.me.tag.visible = false; g.me.snap = true; }
      g.me.group.visible = true; g.me.set({x:p.x, y:p.y, z:p.z, yaw:p.yaw, pitch:p.pitch}); g.me.update(dt);
      const back = view === 1 ? -1 : 1; let d = 0;
      for (; d < 4; d += .1){ const x = p.x + dir.x * back * (d + .3), y = p.eye + dir.y * back * (d + .3), z = p.z + dir.z * back * (d + .3); if (w.solidAt(Math.floor(x), Math.floor(y), Math.floor(z))) break; }
      camera.position.set(p.x + dir.x * back * d, p.eye + dir.y * back * d, p.z + dir.z * back * d);
      if (view === 2) camera.lookAt(p.x, p.eye, p.z);
    } else if (g.me) g.me.group.visible = false;
    for (const a of g.avatars.values()) a.update(dt);
    // redstone, pressure plates, carts, TNT (the host or a lone player runs them)
    const people = [{x:p.x, y:p.y, z:p.z}]; for (const a of g.avatars.values()) if (a.target) people.push(a.target);
    if (!g.opt.guest && g.started){
      g.red.step(people); g.red.update(dt);
      if (g.riding && active() && (g.keys.f || g.keys.b)){ const s = g.keys.f ? 1 : -1; g.pushes.set(g.riding, [-Math.sin(p.yaw) * s, -Math.cos(p.yaw) * s]); }
      g.carts.update(dt, true, g.pushes); g.pushes.clear();
      for (let i = g.tnts.length - 1; i >= 0; i--){ const tn = g.tnts[i]; tn.t -= dt; const flash = Math.sin(tn.t * 12) > 0 ? .8 : 0; for (const m of tn.m.material) m.emissiveIntensity = flash; tn.m.scale.setScalar(1 + Math.max(0, .6 - tn.t) * .25);
        if (tn.t <= 0){ scene.remove(tn.m); g.tnts.splice(i, 1); explode(g, tn.x + .5, tn.y + .5, tn.z + .5); } }
      if (g.party && t - (g.caT || 0) > 150 && (g.carts.list.size || g.caWas)){ g.caT = t; g.caWas = g.carts.list.size; g.party.carts(g.carts.state()); }
    } else if (g.started){
      g.carts.update(dt, false);
      if (g.riding && active() && (g.keys.f || g.keys.b) && t - (g.cpT || 0) > 120){ g.cpT = t; const s = g.keys.f ? 1 : -1; g.party.act({a:'push', id:g.riding, v:[+(-Math.sin(p.yaw) * s).toFixed(2), +(-Math.cos(p.yaw) * s).toFixed(2)]}); }
    }
    // riding: you sit in the cart; Shift gets you out
    if (g.riding){ const c = g.carts.list.get(g.riding);
      if (!c){ g.riding = null; }
      else if (g.keys.down){ cartDo(g, {a:'leave'}); p.y = c.y + 1; p.vy = 0; p.x = c.x; p.z = c.z; }
      else { p.x = c.x; p.z = c.z; p.y = c.y + .35; p.vx = p.vy = p.vz = 0; p.fly = false; } }
    for (let i = g.falling.length - 1; i >= 0; i--){ const f = g.falling[i]; f.vy -= 32 * dt; f.y += f.vy * dt; f.m.position.y = f.y + .5;
      if (f.y <= f.toY){ scene.remove(f.m); g.falling.splice(i, 1); const there = g.world.get(f.x, f.toY, f.z); if (there === 0 || (there > 0 && (LIQUID[there] || PLANT[there]))) edit(f.x, f.toY, f.z, f.b); } }
    if (!g.opt.guest && g.started) g.liq.update(dt);
    for (let i = booms.length - 1; i >= 0; i--){ const b = booms[i]; b.t += dt; b.m.scale.setScalar(1 + b.t * 14); b.m.material.opacity = Math.max(0, .9 - b.t * 2.6); if (b.t > .4){ scene.remove(b.m); b.m.geometry.dispose(); booms.splice(i, 1); } }
    g.cartHit = active() || NOLOCK ? g.carts.pick(eye, dir, g.hit ? g.hit.t : 5) : null;
    if (g.started){
      const host = !g.opt.guest, folk = [{x:p.x, y:p.y, z:p.z, moving:Math.hypot(p.vx, p.vz) > 1, me:true, dead:g.dead || p.fly && false}];
      for (const [id, a] of g.avatars) if (a.target) folk.push({x:a.target.x, y:a.target.y, z:a.target.z, moving:true, id});
      if (!host) g.animals.follow(dt);
      const env = {animals:S.animals, monsters:S.monsters, night:lastNight, biomeAt:(x, z) => g.colAt(x, z).biome, villages:g.opt.gen === 2 ? (x, z) => villagesNear(g.opt.seed, x, z, 1).concat(g.opt.kind === 'normal' ? g.cities || [] : []) : null};          // people walk city streets too
      g.animals.update(dt, folk, host, env);
      if (host && g.party && t - (g.anT || 0) > 200){ g.anT = t; g.party.animals(g.animals.state()); }
      g.critter = active() || NOLOCK ? g.animals.pick(eye, dir, g.hit ? g.hit.t : 4) : null;
    }
    for (let i = puffs.length - 1; i >= 0; i--){ const f = puffs[i]; f.t += dt; f.m.position.x += f.v[0] * dt; f.m.position.y += f.v[1] * dt; f.m.position.z += f.v[2] * dt; f.m.material.opacity = Math.max(0, .9 - f.t * 1.5); if (f.t > .6){ scene.remove(f.m); puffs.splice(i, 1); } }
    // hearts: they come back slowly; falls and lava hurt
    if (S.hurt && S.monsters && g.started && !g.dead){
      g.regenT = (g.regenT || 0) + dt; if (g.regenT > 4 && g.hp < 20){ g.regenT = 0; g.hp++; hearts(); }
      if (!p.fly && !p.inWater && p.vy < -1) g.fallFrom = Math.max(g.fallFrom || p.y, p.y); else if (p.ground){ if (g.fallFrom && g.fallFrom - p.y > 3.5) hurtMe(Math.floor(g.fallFrom - p.y - 3)); g.fallFrom = 0; }
      if (p.inWater || p.fly) g.fallFrom = 0;
      const feet = w.get(Math.floor(p.x), Math.floor(p.y + .2), Math.floor(p.z)); if (feet > 0 && LIQUID[feet] === 2){ g.lavaT = (g.lavaT || 0) + dt; if (g.lavaT > .5){ g.lavaT = 0; hurtMe(3); } }
    }
    if (g.party && t - g.posT > 100){ g.posT = t; g.party.pos([+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(2), +p.pitch.toFixed(2)]); }
    if (!g.opt.guest && g.started && t - g.lastSave > 30000){ g.lastSave = t; if (g.world.dirty.size || !g.savedAt) saveNow(); }
    if (g.code && g.opt.where === 'cloud' && t - g.liveT > 20000){ g.liveT = t; live(true); }
    if (g.dbg){ const b = g.hit ? BLOCKS[g.hit.b].name + ' at ' + g.hit.x + ' ' + g.hit.y + ' ' + g.hit.z : 'nothing'; $('dbg').innerHTML = `${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)} &nbsp; chunk ${Math.floor(p.x / CH)} ${Math.floor(p.z / CH)}<br>${fps} fps &nbsp; ${w.loaded()} chunks &nbsp; ${p.fly ? 'flying' : 'walking'}<br>looking at ${esc(b)}`; }
    hand.update(dt, active() && (g.keys.f || g.keys.b || g.keys.l || g.keys.r) && p.ground);
  }
  // the time of day: it moves on for the host (or on your own); friends get it from the host
  let time = .2, day = 0;
  if (g){ if (g.started && S.cycle && !g.opt.guest){ g.time += dt / DAY_SECONDS; if (g.time >= 1){ g.time -= 1; g.day++; } } if (g.opt.guest && g.timeAt){ g.time = (g.timeHost + (t - g.timeAt) / 1000 / DAY_SECONDS) % 1; } time = g.time; day = g.day; }
  // weather where you are
  if (g && g.started){
    if (!g.biomeT || t - g.biomeT > 500){ g.biomeT = t; g.biome = g.opt.kind === 'flat' ? 'plains' : g.colAt(Math.floor(g.p.x), Math.floor(g.p.z)).biome; }
    if (!g.opt.guest) weather.host(dt, {x:g.p.x, z:g.p.z, biome:g.biome}, (x, z) => strike(g, x, z), null);
    weather.update(dt, camera, g.biome, g.world, (x, z) => { const s = g.world.surface(Math.floor(x), Math.floor(z)); return s > 0 ? s : g.p.y; });
    const pull = weather.pull(g.p.x, g.p.y, g.p.z, g.world.surface(Math.floor(g.p.x), Math.floor(g.p.z)));
    if (pull && !g.riding){ g.p.vx += pull.vx * dt * 3; g.p.vz += pull.vz * dt * 3; g.p.vy = Math.max(g.p.vy, pull.vy); g.p.fly = false; }
    if (!g.opt.guest && weather.tornado){ g.tearT = (g.tearT || 0) + dt; if (g.tearT > .3){ g.tearT = 0; tearUp(g.world, weather.tornado, (x, y, z, b) => edit(x, y, z, b), LEAVES); }
      for (const a of g.animals.list.values()){ const pl = weather.pull(a.x, a.y, a.z, a.ty); if (pl){ a.kx = pl.vx; a.kz = pl.vz; a.vy = pl.vy * .8; } } }
    // cities: their names in the sky, and a title when you walk in
    if (g.opt.gen === 2 && g.opt.kind === 'normal'){ if (!g.cityT || t - g.cityT > 1000){ g.cityT = t; g.cities = citiesNear(g.opt.seed, g.p.x, g.p.z); }
      g.city = citySigns.update(camera, g.cities || [], g.p, c => title(c.name, 'Welcome to', c.place));
    }
  } else { weather.clear(); citySigns.clear(); }
  const sk = theSky.update(camera, time, day, weather.storm, weather.flash); mats.tick(dt); lastNight = sk.night;
  const under = g && g.started && !(g.view | 0) ? (g.p.eyeLava ? 2 : g.p.eyeWater ? 1 : 0) : 0, far = (G ? S.dist : 6) * 16 - 2;
  for (const m of [mats.solid, mats.clear]){
    m.uniforms.bright.value = sk.light;
    if (under === 1){ m.uniforms.fogColor.value.set(.08 * sk.light + .02, .2 * sk.light + .04, .45 * sk.light + .08); m.uniforms.fogNear.value = 1; m.uniforms.fogFar.value = 26; }       // under water: blue and murky
    else if (under === 2){ m.uniforms.fogColor.value.set(.9, .35, .05); m.uniforms.fogNear.value = 0; m.uniforms.fogFar.value = 2.5; }
    else { const wf = far * (1 - .4 * weather.rain); m.uniforms.fogColor.value.set(sk.hor.r, sk.hor.g, sk.hor.b); m.uniforms.fogNear.value = Math.max(12, wf * .55); m.uniforms.fogFar.value = wf; }
  }
  document.body.classList.toggle('wet', under === 1);
  hemi.intensity = 2.2 * sk.light; sunL.intensity = 1.4 * sk.light; hand.light(.35 + .65 * sk.light);
  cloud.group.visible = S.clouds; cloud.far = Math.max(260, (G ? S.dist : 6) * 16 * 2.2); cloud.update(camera, dt, sk);
  if (g && g.party && !g.opt.guest && t - (g.tmT || 0) > (weather.tornado ? 1000 : 5000)){ g.tmT = t; const tn = weather.tornado; g.party.time([g.time, g.day, S.cycle ? 1 : 0, weather.kind, tn ? [+tn.x.toFixed(1), +tn.z.toFixed(1), +tn.vx.toFixed(2), +tn.vz.toFixed(2), Math.round(tn.life)] : 0]); }
  renderer.autoClear = true; renderer.render(scene, camera);
  if (g && g.started && S.hand && hand.on && g.hud && !(g.view | 0)){ renderer.autoClear = false; renderer.clearDepth(); renderer.render(handScene, handCam); }
}
addEventListener('resize', resize); resize();
renderer.setClearColor(0x000000);
requestAnimationFrame(frame);
(async () => { startBackdrop(); if (!session() && !store.get('craft-name', '')){ welcome(); return; } await loadSkin(); if (!session() && !store.get('craft-name', '')){ welcome(); return; } if (!skinNow) openCreator(true); else toMenu(); })();
if (matchMedia('(pointer:coarse)').matches && !matchMedia('(pointer:fine)').matches){ $('bnew').disabled = true; $('bjoin').disabled = true; }

/* a handle for the tests */
window.craft = {hurtMe, weather, strike, gen2:{column:column2, villagesNear, citiesNear}, title, citySigns, hand, handScene, handCam, scene, get skin(){ return skinNow; }, openCreator, get creator(){ return creator; }, get G(){ return G; }, get backdrop(){ return backdrop; }, B, BLOCKS, use, edit, openToFriends, joinWorld, playWorld, saveNow, show, lock, pause, S, openInv, closeInv, refreshMenu, Local, Cloud, toMenu, leaveGame};
