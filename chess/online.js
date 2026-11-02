import { openTransport } from './net.js';

/* =========================================================
   Online lobby: who's here, challenges, invite links, match relay.
   Game rules and the board stay in game.js; this file only moves messages.
   ========================================================= */

const A = ['Bench','Lanyard','Clock-In','Break Room','Air Ball','Free Throw','Fast Break','Rec League','Two-Point','Sixth Man','Shot Clock','Practice Squad'];
const B = ['Legend','Warmer','Merchant','Prospect','Specialist','Captain','Rookie','Hero','Phenom','Walk-On','Scout','MVP'];
const pick = a => a[Math.floor(Math.random()*a.length)];
const rid = (n = 8) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const initials = n => clean(n, 40).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
export { initials };

// Close a modal from its dark backdrop only when the press both starts and ends there,
// so drag-selecting text in an input and letting go outside the box doesn't close it.
export function backdropClose(wrap, close){
  let downOnBackdrop = false;
  wrap.addEventListener('pointerdown', e => { downOnBackdrop = e.target === wrap; });
  wrap.addEventListener('click', e => { if (downOnBackdrop && e.target === wrap) close(); downOnBackdrop = false; });
}

export function initOnline(G){
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const local = params.get('net') === 'local';
  const invPrefix = (G.lobbyRoom && G.lobbyRoom !== 'lobby' ? G.lobbyRoom + '-' : '') + 'inv-';

  let net = null, lobby = null, state = 'connecting';
  let myName = clean(G.store.get('cc-name'), 24) || `${pick(A)} ${pick(B)} ${10 + Math.floor(Math.random()*90)}`;
  let prefs = {tc:'5+0', color:'r'};
  try { Object.assign(prefs, JSON.parse(G.store.get('cc-online') || '{}')); } catch(e){}
  let status = 'idle';                   // idle | bdb | pvp
  const peers = new Map();               // lobby peers: id -> {name, status}
  let outgoing = null;                   // {id, to, tc, color, timer}
  const incoming = new Map();            // id -> {from, toast, timer}
  const accepted = new Set();            // challenge ids we said yes to
  let match = null;                      // {mid, room, opp, oppName, myColor, tc}
  let invite = null;                     // {code, room, host, tc, color, timer}
  let firstSeenTimer = null;

  /* ---------- toasts ---------- */
  function toast({title, sub, actions = [], timeout = 0, onTimeout, kind = ''}){
    const box = document.createElement('div');
    box.className = 'toast ' + kind;
    box.innerHTML = '<div class="tt"></div><div class="ts"></div><div class="ta"></div><i class="tbar"></i>';
    box.querySelector('.tt').textContent = title;
    const s = box.querySelector('.ts'); if (sub) s.textContent = sub; else s.remove();
    const row = box.querySelector('.ta');
    let done = false, timer = null;
    const close = () => { if (done) return; done = true; clearTimeout(timer); box.classList.add('out'); setTimeout(() => box.remove(), 250); };
    for (const a of actions){
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tbtn' + (a.primary ? ' primary' : ''); b.textContent = a.label;
      b.onclick = () => { close(); a.fn && a.fn(); };
      row.appendChild(b);
    }
    if (!actions.length) row.remove();
    const bar = box.querySelector('.tbar');
    if (timeout){ bar.style.animationDuration = timeout + 'ms'; timer = setTimeout(() => { close(); onTimeout && onTimeout(); }, timeout); }
    else bar.remove();
    $('toasts').appendChild(box);
    return {close};
  }

  /* ---------- connect ---------- */
  async function connect(){
    try { net = await openTransport(local); }
    catch(e){ state = 'failed'; paint(); return; }
    lobby = net.join(G.lobbyRoom || 'lobby');   // each game has its own lobby so chess and Connect 4 players don't mix
    wire(lobby, 'lobby');
    state = 'ready';
    firstSeenTimer = setTimeout(paint, 9000);
    paint();
    const code = clean(params.get('vs'), 16);
    if (code) joinInvite(code);
  }

  function wire(room, kind){
    room.onJoin(id => {
      room.send('hi', hello(), id);
      if (kind === 'lobby') paint();
      // a guest who has found the host stops the "couldn't find that game" countdown
      if (kind === 'invite' && invite && !invite.host && room === invite.room){ clearTimeout(invite.timer); invite.timer = setTimeout(giveUpInvite, 60000); }
    });
    room.onLeave(id => peerGone(room, kind, id));
    room.onMessage((t, d, from) => { try { handle(room, kind, t, d || {}, from); } catch(e){ console.warn('online message', e); } });
  }
  const hello = () => ({name: myName, status, v:1});
  function broadcastHello(){ if (lobby) lobby.send('hi', hello()); }

  function peerGone(room, kind, id){
    if (match && room === match.room && id === match.opp){ G.oppLeft(); }
    if (kind === 'lobby'){
      peers.delete(id);
      if (outgoing && outgoing.to === id){ clearTimeout(outgoing.timer); outgoing = null; }
      const inc = [...incoming].find(([, v]) => v.from === id);
      if (inc){ inc[1].toast.close(); clearTimeout(inc[1].timer); incoming.delete(inc[0]); }
      paint();
    }
  }

  /* ---------- messages ---------- */
  function handle(room, kind, t, d, from){
    if (t === 'hi'){
      const name = clean(d.name, 24) || 'Someone';
      const st = ['idle','bdb','pvp'].includes(d.status) ? d.status : 'idle';
      if (kind === 'lobby'){ if (!peers.has(from)) room.send('hi', hello(), from); peers.set(from, {name, status:st}); paint(); }
      if (kind === 'invite' && invite && invite.host && room === invite.room && !match){
        const white = invite.color === 'w' ? net.selfId : invite.color === 'b' ? from : (Math.random() < .5 ? net.selfId : from);
        const mid = invite.code + '-' + rid(4);
        room.send('start', {mid, white, tc:invite.tc, name:myName}, from);
        clearTimeout(invite.timer);
        begin({mid, room, opp:from, oppName:name, white, tc:invite.tc});
      }
      if (match && room === match.room && from === match.opp) match.oppName = name;
      return;
    }
    if (t === 'g'){
      if (!match || room !== match.room || from !== match.opp || d.mid !== match.mid || typeof d.t !== 'string') return;
      if (d.t === 'rematch-yes'){ rematchStart(); return; }
      G.remote(d.t, d.d || {});
      return;
    }
    if (t === 'start'){
      const ok = (kind === 'lobby' && accepted.has(d.mid)) || (kind === 'invite' && invite && !invite.host && room === invite.room);
      if (!ok || typeof d.mid !== 'string') return;
      accepted.delete(d.mid);
      if (invite && !invite.host){ clearTimeout(invite.timer); if (invite.toast) invite.toast.close(); }
      begin({mid:d.mid, room, opp:from, oppName:clean(d.name, 24) || peers.get(from)?.name || 'Opponent', white:d.white, tc:G.validTc(d.tc)});
      return;
    }
    if (kind !== 'lobby') return;
    const who = peers.get(from)?.name || clean(d.name, 24) || 'Someone';
    if (t === 'ch'){
      if (typeof d.id !== 'string' || incoming.has(d.id)) return;
      if (status === 'pvp' && match && !G.isOver()){ room.send('ch-no', {id:d.id, why:'busy'}, from); return; }
      const tc = G.validTc(d.tc);
      const youPlay = d.color === 'w' ? 'Black' : d.color === 'b' ? 'White' : 'Random colors';
      const entry = {from};
      entry.toast = toast({
        title: `${who} challenges you`, sub: `${G.tcName(tc)} · ${d.color === 'r' ? youPlay : 'You play ' + youPlay}`,
        timeout: 30000, kind: 'challenge',
        actions: [
          {label:'Accept', primary:true, fn: () => { clearTimeout(entry.timer); incoming.delete(d.id); accepted.add(d.id); room.send('ch-yes', {id:d.id}, from); }},
          {label:'Decline', fn: () => { clearTimeout(entry.timer); incoming.delete(d.id); room.send('ch-no', {id:d.id, why:'no'}, from); }}
        ],
        onTimeout: () => { incoming.delete(d.id); room.send('ch-no', {id:d.id, why:'timeout'}, from); }
      });
      incoming.set(d.id, entry);
      G.ping && G.ping(`${who} challenged you`);
      return;
    }
    if (t === 'ch-cancel'){
      const e = incoming.get(d.id); if (!e) return;
      e.toast.close(); incoming.delete(d.id);
      toast({title:`${who} cancelled the challenge`, timeout:3500});
      return;
    }
    if (t === 'ch-no'){
      if (!outgoing || outgoing.id !== d.id) return;
      clearTimeout(outgoing.timer); outgoing = null; paint();
      toast({title: d.why === 'busy' ? `${who} is in a match` : d.why === 'timeout' ? `No answer from ${who}` : `${who} declined`, timeout:4000});
      return;
    }
    if (t === 'ch-yes'){
      if (!outgoing || outgoing.id !== d.id || outgoing.to !== from){ room.send('ch-gone', {id:d.id}, from); return; }
      clearTimeout(outgoing.timer);
      const o = outgoing; outgoing = null;
      const white = o.color === 'w' ? net.selfId : o.color === 'b' ? from : (Math.random() < .5 ? net.selfId : from);
      room.send('start', {mid:o.id, white, tc:o.tc, name:myName}, from);
      begin({mid:o.id, room, opp:from, oppName:who, white, tc:o.tc});
      return;
    }
    if (t === 'ch-gone'){ accepted.delete(d.id); toast({title:'That challenge expired', timeout:3500}); }
  }

  /* ---------- matches ---------- */
  function begin({mid, room, opp, oppName, white, tc}){
    if (match && match.opp !== opp) match.room.send('g', {mid:match.mid, t:'leave', d:{}}, match.opp);
    if (match && match.room !== room && match.room !== lobby) leaveRoomLater(match.room);
    match = {mid, room, opp, oppName, myColor: white === net.selfId ? 'w' : 'b', tc};
    for (const [, e] of incoming){ e.toast.close(); clearTimeout(e.timer); }
    incoming.clear();
    if (outgoing){ lobby.send('ch-cancel', {id:outgoing.id}, outgoing.to); clearTimeout(outgoing.timer); outgoing = null; }
    if (params.has('vs')){ params.delete('vs'); history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '')); }
    closeLobby();
    setStatus('pvp');
    G.startMatch({mid, myColor:match.myColor, tc, oppName});
  }
  function leaveRoomLater(room){ setTimeout(() => room.leave(), 1500); }
  function send(t, d){ if (match) match.room.send('g', {mid:match.mid, t, d}, match.opp); }
  function leaveMatch(){
    if (!match) return;
    send('leave', {});
    if (match.room !== lobby){ leaveRoomLater(match.room); if (invite && invite.room === match.room) invite = null; }
    match = null; setStatus('idle'); paint();
  }
  function offerRematch(){ send('rematch', {}); }
  function acceptRematch(){ send('rematch-yes', {}); rematchStart(); }
  function rematchStart(){
    if (!match) return;
    const mid = match.mid + 'r';
    match.mid = mid; match.myColor = match.myColor === 'w' ? 'b' : 'w';
    setStatus('pvp');
    G.startMatch({mid, myColor:match.myColor, tc:match.tc, oppName:match.oppName});
  }

  /* ---------- challenges + invites ---------- */
  function challenge(id){
    const p = peers.get(id);
    if (!p || outgoing || (match && !G.isOver()) || p.status === 'pvp') return;
    const ch = {id: rid(10), to:id, tc:prefs.tc, color:prefs.color};
    ch.timer = setTimeout(() => {
      if (outgoing !== ch) return;
      lobby.send('ch-cancel', {id:ch.id}, id); outgoing = null; paint();
      toast({title:`No answer from ${p.name}`, timeout:4000});
    }, 30000);
    outgoing = ch;
    lobby.send('ch', {id:ch.id, tc:ch.tc, color:ch.color, name:myName}, id);
    paint();
  }
  function cancelChallenge(){
    if (!outgoing) return;
    lobby.send('ch-cancel', {id:outgoing.id}, outgoing.to);
    clearTimeout(outgoing.timer); outgoing = null; paint();
  }
  function inviteUrl(code){
    const u = new URL(location.href); u.search = ''; u.hash = '';
    u.searchParams.set('vs', code); if (local) u.searchParams.set('net', 'local');
    return u.toString();
  }
  function createInvite(){
    if (!net) return;
    if (invite && invite.host && !match){ paint(); return; }
    const code = rid(8);
    invite = {code, room: net.join(invPrefix + code), host:true, tc:prefs.tc, color:prefs.color};
    wire(invite.room, 'invite');
    paint();
  }
  function cancelInvite(){
    if (!invite || !invite.host || (match && match.room === invite.room)) return;
    invite.room.leave(); invite = null; paint();
  }
  function joinInvite(code){
    invite = {code, room: net.join(invPrefix + code), host:false};
    wire(invite.room, 'invite');
    invite.toast = toast({title:'Joining your friend’s game…', sub:'Hang tight. Connecting straight to them.'});
    invite.timer = setTimeout(giveUpInvite, 45000);
  }
  function giveUpInvite(){
    if (match || !invite || invite.host) return;
    invite.toast.close();
    toast({title:"Couldn't find that game", sub:'Invite links only work while your friend has the game open. Ask them for a fresh link.', timeout:9000, kind:'bad'});
    invite.room.leave(); invite = null;
  }

  /* ---------- status ---------- */
  function setStatus(s){ if (status === s) return; status = s; broadcastHello(); paint(); }

  /* ---------- lobby UI ---------- */
  const nameIn = $('onName');
  nameIn.value = myName;
  nameIn.addEventListener('change', () => {
    myName = clean(nameIn.value, 24) || myName; nameIn.value = myName;
    G.store.set('cc-name', myName); broadcastHello(); paint();
  });
  function seg(el, opts, key){
    el.innerHTML = '';
    for (const [v, label] of opts){
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.v = v;
      b.onclick = () => { prefs[key] = v; G.store.set('cc-online', JSON.stringify(prefs)); paint(); };
      el.appendChild(b);
    }
  }
  seg($('onTc'), G.tcOptions().filter(([k]) => k !== 'off').concat([['off','No clock']]), 'tc');
  seg($('onColor'), [['r','Random'],['w','White'],['b','Black']], 'color');

  function paint(){
    const others = [...peers].filter(([, p]) => p);
    const n = others.length;
    $('onCount').textContent = state === 'failed' ? '!' : String(n);
    $('onlinePill').classList.toggle('has', n > 0);
    $('onTc').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === prefs.tc));
    $('onColor').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === prefs.color));
    const st = $('onStatus');
    if (state === 'connecting') st.textContent = 'Connecting to the lobby…';
    else if (state === 'failed') st.textContent = "Online play couldn't start in this browser. Try another browser or network.";
    else if (!n) st.textContent = firstSeenTimer ? 'Looking for players… If nobody shows up, send a friend an invite link.' : 'Looking for players…';
    else st.textContent = `${n} other ${n === 1 ? 'player' : 'players'} online`;
    const busyMe = match && !G.isOver();
    $('onBusy').hidden = !busyMe;
    const list = $('onList'); list.innerHTML = '';
    for (const [id, p] of others.sort((a, b) => a[1].name.localeCompare(b[1].name))){
      const li = document.createElement('li'); li.className = 'prow';
      li.innerHTML = '<span class="pini"></span><div class="pmeta"><b></b><small></small></div><button type="button" class="btn sm"></button>';
      li.querySelector('.pini').textContent = initials(p.name);
      li.querySelector('b').textContent = p.name;
      li.querySelector('small').textContent = p.status === 'pvp' ? 'In a match' : p.status === 'bdb' ? 'Playing BDB' : 'In the lobby';
      li.querySelector('small').className = p.status === 'pvp' ? 'busy' : '';
      const b = li.querySelector('button');
      if (outgoing && outgoing.to === id){ b.textContent = 'Cancel'; b.classList.add('ghost'); b.onclick = cancelChallenge; li.classList.add('waiting'); li.querySelector('small').textContent = 'Waiting for an answer…'; }
      else { b.textContent = 'Challenge'; b.classList.add('primary'); b.disabled = !!outgoing || busyMe || p.status === 'pvp'; b.onclick = () => challenge(id); }
      list.appendChild(li);
    }
    $('onEmpty').hidden = n > 0;
    const hosting = invite && invite.host && !(match && match.room === invite.room);
    $('onInviteBox').hidden = !hosting;
    $('onInvite').hidden = !!hosting;
    $('onInvite').disabled = state !== 'ready' || busyMe;
    if (hosting){ $('onLink').value = inviteUrl(invite.code); $('onInviteMeta').textContent = `${G.tcName(invite.tc)} · ${invite.color === 'r' ? 'Random colors' : invite.color === 'w' ? 'You play White' : 'You play Black'} · Waiting for your friend…`; }
  }
  $('onInvite').onclick = createInvite;
  $('onCancelInvite').onclick = cancelInvite;
  $('onCopy').onclick = async () => {
    const inp = $('onLink');
    try { await navigator.clipboard.writeText(inp.value); $('onCopy').textContent = 'Copied'; }
    catch(e){ inp.focus(); inp.select(); $('onCopy').textContent = 'Press Ctrl+C'; }
    setTimeout(() => { $('onCopy').textContent = 'Copy link'; }, 1800);
  };
  function openLobby(){ paint(); $('online').hidden = false; }
  function closeLobby(){ $('online').hidden = true; }
  $('onClose').onclick = closeLobby;
  backdropClose($('online'), closeLobby);
  $('onlinePill').onclick = openLobby;

  connect();

  return {
    send, leaveMatch, offerRematch, acceptRematch, openLobby, closeLobby, toast,
    setStatus: s => { if (!(match && s !== 'pvp' && !G.isOver())) setStatus(s); },
    get name(){ return myName; },
    get inMatch(){ return !!match; },
    get lobbyOpen(){ return !$('online').hidden; }
  };
}
