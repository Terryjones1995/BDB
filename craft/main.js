/* BDB Craft: the game. Start screen (your worlds, friends building right now), then the world: walking, flying, breaking and placing, the hotbar and
   every block in the inventory, chat, and the pause screen with invites and settings. The heavy lifting is elsewhere: world.js (chunks), mesh.js (shapes),
   gen.js (the land), render.js (the look), player.js (moving), store.js (saving), party.js (friends). */
import * as THREE from '../chess/vendor/three.module.min.js?v=c2';
import { BLOCKS, B, N, CATS, SOLID, PLANT, LIQUID, FACE, CH } from './blocks.js?v=c2';
import { paintAll, icon, TS } from './tex.js?v=c2';
import { column } from './gen.js?v=c2';
import { createWorld } from './world.js?v=c2';
import { blockMaterials, sky, clouds, outline, avatar, HORIZON } from './render.js?v=c2';
import { createPlayer, EYE } from './player.js?v=c2';
import { Cloud, Local, session, pack, unpack } from './store.js?v=c2';
import { openParty, newCode, cleanCode } from './party.js?v=c2';

const Q = new URLSearchParams(location.search), LOCALNET = Q.get('net') === 'local', NOLOCK = Q.has('nolock');
const $ = id => document.getElementById(id);
const store = { get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } }, set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} } };
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const hashSeed = s => { s = String(s).trim(); if (/^-?\d{1,9}$/.test(s)) return +s; let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619); return h | 0; };

/* ---------- settings ---------- */
const S = Object.assign({dist:8, fov:75, sens:100, invert:false, clouds:true, hand:true}, store.get('craft-settings', {}));
const saveSettings = () => store.set('craft-settings', S);

/* ---------- three.js ---------- */
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({canvas, antialias:false, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(S.fov, 1, .05, 1200);
camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6b5a45, 2.2)); const sunL = new THREE.DirectionalLight(0xfff2dd, 1.4); sunL.position.set(-3, 5, -4); scene.add(sunL);
const layers = paintAll(), mats = blockMaterials(layers), theSky = sky(scene), cloud = clouds(scene, 1234), hl = outline(scene);
const icons = []; const iconOf = id => icons[id] || (icons[id] = icon(layers, id, 64));
const faceImg = new Image(); faceImg.src = '../assets/face.jpg';
function resize(){ const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); handCam.aspect = w / h; handCam.updateProjectionMatrix(); }

/* the block in your hand, bottom right, drawn on top of everything */
const handScene = new THREE.Scene(), handCam = new THREE.PerspectiveCamera(70, 1, .01, 10);
handScene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2.6));
const hand = (() => {
  const cache = new Map(); let mesh = null, cur = -1, swing = 0, bob = 0;
  const tex = l => { const c = document.createElement('canvas'); c.width = c.height = TS; const x = c.getContext('2d'), im = x.createImageData(TS, TS); im.data.set(layers.subarray(l * TS * TS * 4, (l + 1) * TS * TS * 4)); x.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; };
  function make(id){
    const b = BLOCKS[id];
    if (b.kind === 'plant'){ const m = new THREE.Mesh(new THREE.PlaneGeometry(.3, .3), new THREE.MeshLambertMaterial({map:tex(FACE[id * 6]), transparent:true, alphaTest:.5, side:THREE.DoubleSide})); return m; }
    const order = [0, 1, 2, 3, 4, 5].map(f => FACE[id * 6 + f]);
    const ms = order.map(l => new THREE.MeshLambertMaterial({map:tex(l), transparent:b.kind !== 'solid', alphaTest:b.kind === 'cutout' ? .5 : 0, opacity:1}));
    return new THREE.Mesh(new THREE.BoxGeometry(.2, .2, .2), ms);
  }
  return {
    set(id){ if (id === cur && mesh) return; if (mesh) handScene.remove(mesh); cur = id; if (!id){ mesh = null; return; } if (!cache.has(id)) cache.set(id, make(id)); mesh = cache.get(id); handScene.add(mesh); },
    drop(id){ if (cache.has(id)){ if (cur === id && mesh) handScene.remove(mesh); cache.delete(id); if (cur === id){ cur = -1; } } },
    swing(){ swing = 1; },
    update(dt, moving){ if (!mesh) return; swing = Math.max(0, swing - dt * 5); bob += dt * (moving ? 9 : 0);
      const s = Math.sin(swing * Math.PI);
      mesh.position.set(.62 + Math.sin(bob) * .012, -.5 + Math.abs(Math.cos(bob)) * .018 - s * .1, -1 + s * .06); mesh.rotation.set(.18 - s * .7, .72, 0); },
    get on(){ return !!mesh; }
  };
})();

/* ---------- screens ---------- */
const screens = ['menu', 'newp', 'joinp', 'signp', 'load', 'pause', 'invite', 'settings', 'inv', 'msg'];
function show(...ids){ for (const s of screens) $(s).hidden = !ids.includes(s); }
let toastT = 0;
function toast(t, ms = 2200){ const e = $('toast'); e.textContent = t; e.hidden = false; e.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => { e.style.opacity = 0; setTimeout(() => e.hidden = true, 400); }, ms); }

/* ---------- the start screen, with a world turning slowly behind it ---------- */
let G = null, backdrop = null, tab = 'mine', lists = {mine:[], local:[], live:[], cloudErr:null};
function startBackdrop(){
  if (backdrop) return; const w = createWorld({seed:hashSeed('bdb craft'), kind:'normal', scene, matSolid:mats.solid, matClear:mats.clear, workers:2}); w.R = 6;
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
  if (s) e.innerHTML = `<span>Signed in as <b>${esc(s.name)}</b>. Your worlds are kept online.</span><button type="button" class="k-btn" id="aout">Sign out</button>`;
  else e.innerHTML = `<span>Sign in to keep worlds online and see friends building.</span><button type="button" class="k-btn primary" id="ain">Sign in</button>`;
  const o = $('aout'), i = $('ain'); if (o) o.onclick = () => { Cloud.signOut(); refreshMenu(); }; if (i) i.onclick = () => { $('snote').textContent = ''; show('signp'); $('sname').focus(); };
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
    if (r && r.token){ $('spass').value = ''; show('menu'); refreshMenu(); return; }
    note.className = 'note bad'; note.textContent = r && r.error === 'taken' ? 'That name is taken. If it is yours, sign in instead.' : 'That name and password do not match.';
  } catch(err){ note.className = 'note bad'; note.textContent = err.kind === 'said' ? (err.said === 'taken' ? 'That name is taken. If it is yours, sign in instead.' : 'That name and password do not match.') : 'Could not reach the BDB server. Try again in a minute.'; }
}

/* ---------- playing a world ---------- */
const HOTBAR0 = ['grass', 'stone', 'planks_oak', 'log_oak', 'glass', 'bricks', 'wool_red', 'lamp', 'quartz'].map(k => B[k] || B.stone);
function makeGame(opt){
  // opt: {name, seed, kind, where, id, chunks, meta, guest, party}
  const world = createWorld({seed:opt.seed, kind:opt.kind, scene, matSolid:mats.solid, matClear:mats.clear, wait:opt.wait});
  world.R = S.dist;
  const p = createPlayer(world), meta = opt.meta || {};
  const g = {opt, world, p, bar:(Array.isArray(meta.bar) && meta.bar.length === 9 ? meta.bar.map(b => (b > 0 && b < N && BLOCKS[b].kind !== 'air') ? b : B.stone) : HOTBAR0.slice()), sel:meta.sel | 0 || 0,
    keys:{}, ready:false, spawned:false, lastSave:performance.now(), avatars:new Map(), party:opt.party || null, code:opt.code || null, hud:true, dbg:false, lastTapSpace:0, lastTapW:0, liveT:0, posT:0, saving:null};
  if (meta.p){ Object.assign(p, {x:meta.p[0], y:meta.p[1], z:meta.p[2], yaw:meta.p[3] || 0, pitch:meta.p[4] || 0, fly:!!meta.p[5]}); g.spawned = true; }
  else if (opt.spawn){ Object.assign(p, opt.spawn); g.spawned = true; g.needUp = true; }
  else {
    // the nearest dry land to the middle, from the land shape alone (no chunks needed yet)
    let best = null;
    for (let r = 0; r < 400 && !best; r += 8) for (let a = 0; a < Math.max(1, r); a += 8){ const ang = a / Math.max(1, r) * Math.PI * 2, x = Math.round(Math.cos(ang) * r) + 8, z = Math.round(Math.sin(ang) * r) + 8, c = column(opt.seed, x, z); if (opt.kind === 'flat' || (c.h > 63 && c.h < 100 && !['ocean', 'frozen', 'peak'].includes(c.biome))){ best = {x, z}; break; } }
    best = best || {x:8, z:8}; p.x = best.x + .5; p.z = best.z + .5; p.y = 120; g.needUp = true;
  }
  for (const c of opt.chunks || []) if (c.v) world.mods.set(c.cx + ',' + c.cz, c.v);
  g.refreshBar = () => {
    const bar = $('bar'); bar.innerHTML = '';
    g.bar.forEach((b, i) => { const s = document.createElement('div'); s.className = 'slot' + (i === g.sel ? ' on' : ''); s.innerHTML = `<i>${i + 1}</i><img alt="" src="${iconOf(b)}">`; bar.append(s); });
    hand.set(S.hand ? g.bar[g.sel] : 0);
  };
  g.pick = (i, quiet) => { g.sel = (i + 9) % 9; g.refreshBar(); if (!quiet){ const e = $('bname'); e.textContent = BLOCKS[g.bar[g.sel]].name; e.style.opacity = 1; clearTimeout(g.bnT); g.bnT = setTimeout(() => e.style.opacity = 0, 1600); } };
  g.metaNow = () => ({p:[+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(3), +p.pitch.toFixed(3), p.fly ? 1 : 0], bar:g.bar, sel:g.sel});
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
  enter(makeGame({name:data.name, seed:+data.seed, kind:data.kind, where:w.where, id:data.id, chunks:data.chunks, meta:data.meta}));
}
let joinTimer = 0;
async function joinWorld(code){
  show('load'); $('ltitle').textContent = 'Joining ' + code; $('lnote').textContent = 'Looking for whoever is hosting...'; $('lbar').style.width = '3%';
  const s = session(), name = s ? s.name : (store.get('craft-name', '') || 'Guest ' + (100 + Math.floor(Math.random() * 900)));
  let party = null, waiting = null, total = 0, g = null, early = [];
  const fail = (t, x) => { clearTimeout(joinTimer); if (party) party.leave(); if (g) leaveGame(); msg(t, x); };
  joinTimer = setTimeout(() => fail('No one is hosting that code', 'Check the code with your friend. Their world has to be open (Invite friends on their pause screen).'), 20000);
  pendingCancel = () => { clearTimeout(joinTimer); if (party) party.leave(); party = null; };
  try {
    party = await openParty({local:LOCALNET, code, host:false, name, on:{
      error(){ fail('Could not connect', 'Your browser could not reach your friend. Try again.'); },
      hi(d){
        clearTimeout(joinTimer);
        waiting = new Set(d.mods || []); total = waiting.size;
        g = makeGame({name:d.name, seed:+d.seed, kind:d.kind, where:'guest', guest:true, party, code, spawn:d.spawn ? {x:d.spawn[0], y:d.spawn[1], z:d.spawn[2]} : null, wait:k => waiting.has(k)});
        g.host = d.host; g.waiting = waiting;
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
      hostLeft(){ const h = G && G.host || 'The host'; if (G) leaveGame(true); msg(h + ' stopped hosting', 'The world is saved on their side. Join again when they open it.'); }
    }});
  } catch(e){ fail('Could not connect', 'Your browser could not reach your friend. Try again.'); }
}
let pendingCancel = null;
$('lcancel').onclick = () => { if (pendingCancel){ pendingCancel(); pendingCancel = null; } if (G) leaveGame(true); toMenu(); };
function msg(t, x){ $('mtitle').textContent = t; $('mtext').textContent = x; show('msg'); }
$('mok').onclick = () => toMenu();

function enter(g){
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
  const g = G; g.started = true; show(); $('hud').hidden = false; lock();
  if (g.opt.guest) sys('You joined ' + g.host + "'s world. Press T to chat.");
}

/* ---------- friends ---------- */
function seeFriend(id, d){
  const g = G; if (!g || !Array.isArray(d)) return;
  let a = g.avatars.get(id);
  if (!a){ const pp = g.party && g.party.people.get(id); a = avatar(scene, pp ? pp.name : 'Friend', faceImg, pp ? pp.n : g.avatars.size + 1); g.avatars.set(id, a); }
  a.set({x:+d[0], y:+d[1], z:+d[2], yaw:+d[3], pitch:+d[4]});
}
function dropFriend(id){ const g = G; if (!g) return; const a = g.avatars.get(id); if (a){ a.dispose(); g.avatars.delete(id); } }
function peopleChanged(l){
  const g = G; if (!g) return;
  $('who').innerHTML = l.length > 1 ? l.map(p => `<div class="${p.host ? 'h' : ''}">${esc(p.name)}</div>`).join('') : '';
  for (const id of [...g.avatars.keys()]) if (!l.some(p => p.id === id)) dropFriend(id);
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
    g.party = await openParty({local:LOCALNET, code, host:true, name:session() ? session().name : (store.get('craft-name', '') || 'Host'), on:{
      async welcome(){
        const mods = [...g.world.mods.keys()], chunks = [];
        for (const k of mods){ const v = g.world.mods.get(k).slice(); chunks.push({k, d:await pack(v)}); }
        return {hi:{name:g.opt.name, seed:g.opt.seed, kind:g.opt.kind, host:g.party.list()[0].name, mods, spawn:[+(g.p.x + 1).toFixed(2), +g.p.y.toFixed(2), +g.p.z.toFixed(2)]}, chunks};
      },
      edit(x, y, z, b){ if (!(b >= 0 && b < N)) return false; g.world.set(x, y, z, b); return true; },
      pos(id, d){ seeFriend(id, d); },
      people(l){ peopleChanged(l); },
      joined(id, nm){ sys(nm + ' joined'); },
      left(id, nm){ sys(nm + ' left'); dropFriend(id); },
      chat(nm, t){ chatLine(nm, t); }
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
  for (const a of g.avatars.values()) a.dispose();
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
canvas.addEventListener('mousedown', e => {
  if (!active()) return; e.preventDefault();
  if (e.button === 0){ mouse.l = true; mouse.t = 0; use('break'); }
  else if (e.button === 2){ mouse.r = true; mouse.t = 0; use('place'); }
  else if (e.button === 1) use('pick');
});
addEventListener('mouseup', e => { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
addEventListener('contextmenu', e => { if (G && G.started) e.preventDefault(); });
addEventListener('wheel', e => { if (!active()) return; G.pick(G.sel + (e.deltaY > 0 ? 1 : -1)); }, {passive:true});
const KEYMAP = {KeyW:'f', ArrowUp:'f', KeyS:'b', ArrowDown:'b', KeyA:'l', ArrowLeft:'l', KeyD:'r', ArrowRight:'r', Space:'up', ShiftLeft:'down', ShiftRight:'down', ControlLeft:'sprint', ControlRight:'sprint'};
addEventListener('keydown', e => {
  const g = G;
  if (e.target === $('chatin')){
    if (e.key === 'Enter'){ const t = $('chatin').value.trim(); $('chatin').value = ''; $('chatin').hidden = true; if (t && g){ chatLine(session() ? session().name : g.party ? g.party.list()[0].name : 'You', t); if (g.party) g.party.chat(t); else if (!g.party) sys('No one else is here. Invite friends from the pause screen.'); } lock(); }
    if (e.key === 'Escape'){ $('chatin').value = ''; $('chatin').hidden = true; setTimeout(() => { if (!active()) pause(); }, 0); }
    return;
  }
  if (e.target && (e.target.tagName === 'INPUT') && e.target.id !== 'invq') return;
  if (!$('inv').hidden){
    if (e.code === 'Escape' || (e.code === 'KeyE' && e.target.id !== 'invq')){ e.preventDefault(); closeInv(); }
    else if (/^Digit[1-9]$/.test(e.code) && e.target.id !== 'invq'){ g.pick(+e.code.slice(5) - 1, true); renderInvBar(); }
    return;
  }
  if (!g || !g.started) return;
  if (!active()){ if (e.code === 'Escape' && !$('pause').hidden && NOLOCK) lock(); return; }
  if (e.code === 'Escape' && NOLOCK){ pause(); return; }
  if (e.code === 'Tab' || e.code === 'F1' || e.code === 'F3' || e.code === 'Space' || e.ctrlKey && e.code === 'KeyW') e.preventDefault();
  const k = KEYMAP[e.code];
  if (k){
    if (k === 'up' && !e.repeat){ const t = performance.now(); if (t - g.lastTapSpace < 300){ g.p.fly = !g.p.fly; g.p.vy = 0; g.lastTapSpace = 0; } else g.lastTapSpace = t; }
    if (k === 'f' && !e.repeat){ const t = performance.now(); if (t - g.lastTapW < 280) g.p.sprint = true; g.lastTapW = t; }
    g.keys[k] = true; return;
  }
  if (/^Digit[1-9]$/.test(e.code)){ g.pick(+e.code.slice(5) - 1); return; }
  if (e.code === 'KeyE'){ openInv(); return; }
  if (e.code === 'KeyT' || e.code === 'Enter' || e.code === 'Slash'){ e.preventDefault(); $('chatin').hidden = false; if (e.code === 'Slash') $('chatin').value = '/'; if (!NOLOCK && document.pointerLockElement) document.exitPointerLock(); setTimeout(() => $('chatin').focus(), 0); return; }
  if (e.code === 'F1'){ g.hud = !g.hud; $('hud').classList.toggle('off', !g.hud); hand.set(g.hud && S.hand ? g.bar[g.sel] : 0); return; }
  if (e.code === 'F3'){ g.dbg = !g.dbg; $('dbg').hidden = !g.dbg; return; }
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k && G) G.keys[k] = false; });
addEventListener('blur', () => { if (G){ G.keys = {}; mouse.l = mouse.r = false; } });

/* break, place, pick */
function use(what){
  const g = G; if (!g) return; const hit = g.hit; if (!hit) return;
  if (what === 'break'){ if (hit.y < 1) return; edit(hit.x, hit.y, hit.z, 0); hand.swing(); return; }
  if (what === 'pick'){ const b = hit.b; const i = g.bar.indexOf(b); if (i >= 0) g.pick(i); else { g.bar[g.sel] = b; g.pick(g.sel); } return; }
  const b = g.bar[g.sel]; if (!b) return;
  let x = hit.px, y = hit.py, z = hit.pz;
  if (PLANT[hit.b]){ x = hit.x; y = hit.y; z = hit.z; }                     // clicking tall grass swaps it for the block
  if (y < 1 || y > 127) return;
  const there = g.world.get(x, y, z); if (there > 0 && !LIQUID[there] && !PLANT[there]) return;
  if (SOLID[b] && g.p.overlaps(x, y, z)) return;
  if (PLANT[b]){ const under = g.world.get(x, y - 1, z); if (!(under > 0 && SOLID[under])) return; }
  edit(x, y, z, b); hand.swing();
}
function edit(x, y, z, b){
  const g = G; if (!g.world.set(x, y, z, b)) return;
  // a plant standing on a block that just went goes with it
  if (b === 0){ const up = g.world.get(x, y + 1, z); if (up > 0 && PLANT[up]){ g.world.set(x, y + 1, z, 0); if (g.party) g.party.edit(x, y + 1, z, 0); } }
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

/* settings */
function renderSettings(){
  $('sdist').value = S.dist; $('odist').textContent = S.dist; $('sfov').value = S.fov; $('ofov').textContent = S.fov; $('ssens').value = S.sens; $('osens').textContent = S.sens + '%';
  $('sinv').checked = S.invert; $('sclouds').checked = S.clouds; $('shand').checked = S.hand;
}
$('psettings').onclick = () => { renderSettings(); show('settings'); };
$('sdist').oninput = () => { S.dist = +$('sdist').value; $('odist').textContent = S.dist; if (G){ G.world.R = S.dist; mats.fog(Math.max(16, S.dist * 16 * .62), S.dist * 16 - 2); } saveSettings(); };
$('sfov').oninput = () => { S.fov = +$('sfov').value; $('ofov').textContent = S.fov; saveSettings(); };
$('ssens').oninput = () => { S.sens = +$('ssens').value; $('osens').textContent = S.sens + '%'; saveSettings(); };
$('sinv').onchange = () => { S.invert = $('sinv').checked; saveSettings(); };
$('sclouds').onchange = () => { S.clouds = $('sclouds').checked; saveSettings(); };
$('shand').onchange = () => { S.hand = $('shand').checked; saveSettings(); if (G) G.refreshBar(); };

/* ---------- the frame ---------- */
let last = performance.now(), fpsN = 0, fpsT = 0, fps = 0;
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
        started();
      }
    }
    if (g.started && w.loadedAround(p.x, p.z, 0)){
      p.step(dt, active() ? g.keys : {});
      if (mouse.l || mouse.r){ mouse.t += dt; if (mouse.t > .22){ mouse.t = 0; use(mouse.l ? 'break' : 'place'); } }
    }
    camera.position.set(p.x, p.eye, p.z); camera.rotation.set(p.pitch, p.yaw, 0);
    camera.getWorldDirection(dir); eye.copy(camera.position);
    g.hit = g.started ? w.ray(eye, dir, 6) : null; hl.show(active() || NOLOCK ? g.hit : null);
    for (const a of g.avatars.values()) a.update(dt);
    if (g.party && t - g.posT > 100){ g.posT = t; g.party.pos([+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(2), +p.pitch.toFixed(2)]); }
    if (!g.opt.guest && g.started && t - g.lastSave > 30000){ g.lastSave = t; if (g.world.dirty.size || !g.savedAt) saveNow(); }
    if (g.code && g.opt.where === 'cloud' && t - g.liveT > 20000){ g.liveT = t; live(true); }
    if (g.dbg){ const b = g.hit ? BLOCKS[g.hit.b].name + ' at ' + g.hit.x + ' ' + g.hit.y + ' ' + g.hit.z : 'nothing'; $('dbg').innerHTML = `${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)} &nbsp; chunk ${Math.floor(p.x / CH)} ${Math.floor(p.z / CH)}<br>${fps} fps &nbsp; ${w.loaded()} chunks &nbsp; ${p.fly ? 'flying' : 'walking'}<br>looking at ${esc(b)}`; }
    hand.update(dt, active() && (g.keys.f || g.keys.b || g.keys.l || g.keys.r) && p.ground);
  }
  theSky.follow(camera); cloud.mesh.visible = S.clouds; cloud.update(camera, dt);
  renderer.autoClear = true; renderer.render(scene, camera);
  if (g && g.started && hand.on && g.hud){ renderer.autoClear = false; renderer.clearDepth(); renderer.render(handScene, handCam); }
}
addEventListener('resize', resize); resize();
renderer.setClearColor(HORIZON);
requestAnimationFrame(frame);
toMenu();
if (matchMedia('(pointer:coarse)').matches && !matchMedia('(pointer:fine)').matches){ $('bnew').disabled = true; $('bjoin').disabled = true; }

/* a handle for the tests */
window.craft = {hand, handScene, handCam, scene, faceImg, get G(){ return G; }, get backdrop(){ return backdrop; }, B, BLOCKS, use, edit, openToFriends, joinWorld, playWorld, saveNow, show, lock, pause, S, openInv, closeInv, refreshMenu, Local, Cloud, toMenu, leaveGame};
