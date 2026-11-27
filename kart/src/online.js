// Online races over the BDB Supabase Realtime server (Phoenix protocol vsn 1.0.0), hand-rolled:
// no supabase-js, no CDN. One channel per room (`realtime:kart-<CODE>`), broadcast for game messages,
// presence for the player list. Everything that arrives from the network is untrusted: validators below
// check types, ranges, lengths and ownership, and anything that fails is dropped silently.
import { SUPABASE_URL, SUPABASE_KEY } from './net-config.js';
import { CHARACTERS, ITEMS } from './config.js';

export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_HUMANS = 8;
export const MAX_KARTS = 8;
export const LAP_CHOICES = [1, 2, 3, 5];
const MAX_FRAME = 16384;          // bytes; larger game frames are dropped unparsed
const MAX_PRESENCE_FRAME = 262144; // presence frames may be bigger (one oversized meta must not hide the room)
const MAX_SEND = 8000;            // bytes; we never send more than this
const HEARTBEAT_MS = 25000;
const RATE_PER_SEC = 40;          // per sender; a 10 Hz client sends ~11/s
const CHAR_IDS = new Set(CHARACTERS.map((c) => c.id));
const ITEM_SET = new Set(ITEMS);
const ID_RE = /^[A-Za-z0-9]{6,24}$/;
const RACE_RE = /^[A-Za-z0-9]{4,16}$/;

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const isInt = (v) => fin(v) && Math.floor(v) === v;

function rand(n) {
  const out = new Uint32Array(n);
  try { crypto.getRandomValues(out); } catch (e) { for (let i = 0; i < n; i++) out[i] = (Math.random() * 2 ** 32) >>> 0; }
  return out;
}
export function randomId(len = 12) {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from(rand(len), (x) => a[x % a.length]).join('');
}
export function makeRoomCode() {
  return Array.from(rand(6), (x) => ROOM_ALPHABET[x % ROOM_ALPHABET.length]).join('');
}
/** Uppercase + keep only room-alphabet characters. Returns the code if it is a full 6-char code, else ''. */
export function normalizeCode(s) {
  const c = String(s == null ? '' : s).toUpperCase().split('').filter((ch) => ROOM_ALPHABET.includes(ch)).join('').slice(0, 6);
  return c.length === 6 ? c : '';
}
export function filterCodeInput(s) {
  return String(s == null ? '' : s).toUpperCase().split('').filter((ch) => ROOM_ALPHABET.includes(ch)).join('').slice(0, 6);
}
/** Strip control / bidi-override characters, collapse whitespace, max 16 chars. */
export function sanitizeName(s, fallback = '') {
  let n = typeof s === 'string' ? s : '';
  n = n.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  n = Array.from(n).slice(0, 16).join('').trim();
  return n || fallback;
}
export function defaultName() {
  return 'Racer' + String(100 + (rand(1)[0] % 900));
}

// ---------------------------------------------------------------------------------------------
// Message validators. Each returns a clean object or null.
// ctx = { hostId, players: Map, raceId, grid: Array<{k, owner}>|null, laps }
// ---------------------------------------------------------------------------------------------
export function validateStart(p, from, ctx) {
  if (!p || typeof p !== 'object' || from !== ctx.hostId) return null;
  if (typeof p.race !== 'string' || !RACE_RE.test(p.race)) return null;
  if (!LAP_CHOICES.includes(p.laps)) return null;
  if (!Array.isArray(p.grid) || p.grid.length < 1 || p.grid.length > MAX_KARTS) return null;
  const n = p.grid.length;
  const seenK = new Set(), seenOwner = new Set();
  const grid = [];
  for (const g of p.grid) {
    if (!g || typeof g !== 'object') return null;
    if (!isInt(g.k) || g.k < 0 || g.k >= n || seenK.has(g.k)) return null;
    seenK.add(g.k);
    if (typeof g.owner !== 'string') return null;
    if (g.owner !== 'ai') {
      if (!ID_RE.test(g.owner) || !ctx.players.has(g.owner) || seenOwner.has(g.owner)) return null;
      seenOwner.add(g.owner);
    }
    if (typeof g.char !== 'string' || !CHAR_IDS.has(g.char)) return null;
    grid.push({ k: g.k, owner: g.owner, char: g.char, name: sanitizeName(g.name, 'Racer') });
  }
  if (!seenOwner.size) return null;
  return { race: p.race, laps: p.laps, grid };
}

function ownsKart(from, k, ctx) {
  const g = ctx.grid && ctx.grid.find((e) => e.k === k);
  if (!g) return false;
  if (g.owner === 'ai') return !!ctx.aiOwner && from === ctx.aiOwner; // the racer running the AI, not the lobby host
  return g.owner === from;
}

/** Item held behind a kart, as sent in a state snapshot's `hd` (index = wire code; 0 = nothing). */
export const HELD_ITEMS = [null, 'banana', 'green_shell', 'red_shell'];
const BLOCKABLE = new Set(['banana', 'green_shell', 'red_shell']);

/**
 * State snapshot: {r, t, k:[[kartIndex, x, y, z, heading, speed, vx, vz, flags, driftDir, lapCount, trackT, finished, finishTime], ...],
 * hd?:[heldItemCode per k entry], z?:pause tuple} (hd is omitted when none of the sender's karts holds an item,
 * z until the race's first pause)
 */
export function validateState(p, from, ctx) {
  if (!p || typeof p !== 'object' || p.r !== ctx.raceId || !ctx.grid) return null;
  if (!fin(p.t) || !Array.isArray(p.k) || p.k.length < 1 || p.k.length > MAX_KARTS) return null;
  let pz = null;
  if (p.z !== undefined && !(pz = validatePause(p.z, ctx))) return null;
  const hd = p.hd;
  if (hd !== undefined) {
    if (!Array.isArray(hd) || hd.length !== p.k.length) return null;
    for (const c of hd) if (!isInt(c) || c < 0 || c >= HELD_ITEMS.length) return null;
  }
  const out = [];
  for (let n = 0; n < p.k.length; n++) {
    const e = p.k[n];
    if (!Array.isArray(e) || e.length !== 14) return null;
    for (let i = 0; i < 14; i++) if (!fin(e[i])) return null;
    const k = e[0];
    if (!isInt(k) || !ownsKart(from, k, ctx)) return null;
    out.push({
      k,
      x: clamp(e[1], -5000, 5000), y: clamp(e[2], -1000, 1000), z: clamp(e[3], -5000, 5000),
      h: Math.atan2(Math.sin(e[4]), Math.cos(e[4])),
      speed: clamp(e[5], -200, 200), vx: clamp(e[6], -200, 200), vz: clamp(e[7], -200, 200),
      flags: clamp(e[8] | 0, 0, 1023), driftDir: e[9] < 0 ? -1 : 1,
      lap: clamp(Math.round(e[10]), -1, (ctx.laps || 3) + 1), tt: ((e[11] % 1) + 1) % 1,
      fin: e[12] ? 1 : 0, ft: clamp(e[13], 0, 36000),
      hd: hd ? hd[n] : 0,
    });
  }
  return { t: p.t, karts: out, z: pz };
}

/**
 * The race's latest pause, carried by `pause`, `resume` and state messages as z = [n, a, g, pt, k]:
 * n = pause number in this race (1, 2, ...), a = when the race froze and g = when it resumes (0 = still paused),
 * both in ms since `start` arrived (the shared race clock), pt = ms of all the earlier pauses together,
 * k = kart index of the racer who paused (a human kart of this race).
 */
export const PAUSE_MAX_N = 64;
export const PAUSE_MAX_MS = 75000; // longest real pause: 60 s auto-resume + the 3 s resume countdown + clock slack
const RACE_MAX_MS = 4 * 3600 * 1000;
export function validatePause(z, ctx) {
  if (!Array.isArray(z) || z.length !== 5 || !ctx.grid) return null;
  for (const v of z) if (!fin(v)) return null;
  const n = z[0], a = Math.round(z[1]), g = Math.round(z[2]), pt = Math.round(z[3]), k = z[4];
  if (!isInt(n) || n < 1 || n > PAUSE_MAX_N || !isInt(k)) return null;
  if (a < 0 || a > RACE_MAX_MS) return null;
  if (g !== 0 && (g <= a || g - a > PAUSE_MAX_MS)) return null;
  if (pt < 0 || pt > a || pt > (n - 1) * PAUSE_MAX_MS) return null;
  const e = ctx.grid.find((x) => x.k === k);
  if (!e || e.owner === 'ai') return null;
  return { n, a, g, pt, k };
}

/** Pause: {r, z} — a racer pauses the race for everyone; only for themselves (k = their own kart), g = 0. */
export function validatePauseMsg(p, from, ctx) {
  if (!p || typeof p !== 'object' || p.r !== ctx.raceId || !ctx.grid) return null;
  const z = validatePause(p.z, ctx);
  if (!z || z.g !== 0) return null;
  const e = ctx.grid.find((x) => x.k === z.k);
  return e && e.owner === from ? z : null;
}

/** Resume: {r, z} — any racer of this race; g is the resume instant (after a countdown of at least 1 s). */
export function validateResumeMsg(p, from, ctx) {
  if (!p || typeof p !== 'object' || p.r !== ctx.raceId || !ctx.grid) return null;
  const z = validatePause(p.z, ctx);
  if (!z || z.g - z.a < 1000) return null;
  return ctx.grid.some((x) => x.owner === from) ? z : null;
}

/** Item use: {r, k, item, fw, bk} (fw = banana thrown forward, bk = shell thrown backwards; never both) */
export function validateItemUse(p, from, ctx) {
  if (!p || typeof p !== 'object' || p.r !== ctx.raceId || !ctx.grid) return null;
  if (!isInt(p.k) || !ownsKart(from, p.k, ctx)) return null;
  if (typeof p.item !== 'string' || !ITEM_SET.has(p.item)) return null;
  const fw = p.fw === true, bk = p.bk === true;
  return { k: p.k, item: p.item, fw: fw && !bk, bk: bk && !fw };
}

/**
 * Item block: {r, k, o, t, x, z} — kart k's held item stopped a projectile of type t owned by kart o,
 * last seen at (x, z). Only k's owner may say so (the victim's client decides, as with hits).
 */
export function validateItemBlock(p, from, ctx) {
  if (!p || typeof p !== 'object' || p.r !== ctx.raceId || !ctx.grid) return null;
  if (!isInt(p.k) || !ownsKart(from, p.k, ctx)) return null;
  if (!isInt(p.o) || !ctx.grid.some((g) => g.k === p.o)) return null;
  if (typeof p.t !== 'string' || !BLOCKABLE.has(p.t)) return null;
  if (!fin(p.x) || !fin(p.z)) return null;
  return { k: p.k, o: p.o, t: p.t, x: clamp(p.x, -5000, 5000), z: clamp(p.z, -5000, 5000) };
}

function validMeta(key, m) {
  if (!m || typeof m !== 'object' || m.v !== 1 || m.id !== key || !ID_RE.test(key)) return null;
  if (!fin(m.joinedAt)) return null;
  return {
    id: key,
    name: sanitizeName(m.name, 'Racer'),
    char: typeof m.char === 'string' && CHAR_IDS.has(m.char) ? m.char : CHARACTERS[0].id,
    joinedAt: m.joinedAt,
    st: m.st === 'race' || m.st === 'done' ? m.st : 'lobby', // race = driving, done = finished, lobby = out
  };
}

// ---------------------------------------------------------------------------------------------
// OnlineSession: socket + channel + presence + host election
// ---------------------------------------------------------------------------------------------
export class OnlineSession {
  /**
   * handlers: onStatus(status, detail), onPlayers(players[], hostId), onMessage(event, payload, from),
   *           onHostChange(newHostId, oldHostId)
   * status: 'idle' | 'connecting' | 'joined' | 'reconnecting' | 'unreachable' | 'full' | 'closed'
   */
  constructor(handlers = {}) {
    this.h = handlers;
    this.myId = randomId(12);
    this.status = 'idle';
    this.code = null;
    this.topic = null;
    this.ws = null;
    this.ref = 0;
    this.joinRef = null;
    this.joined = false;
    this.profile = { name: 'Racer', char: CHARACTERS[0].id, st: 'lobby' };
    this.joinedAt = 0;
    this.presence = new Map();   // key -> metas[]
    this.players = new Map();    // id -> player
    this.hostId = null;
    this.order = [];             // ids sorted by join order (first MAX_HUMANS are "in")
    this._hb = null;
    this._hbPending = null;
    this._retry = 0;
    this._retryT = null;
    this._everOpened = false;
    this._leaving = false;
    this._admitted = false;      // passed the room-full check for this join (never re-checked: no mid-race evictions)
    this._gotState = false;      // presence_state received on the current socket
    this._admitT = null;
    this._rate = new Map();
    this.lastRecv = 0;
    this.lastSend = 0;
    this.sentCount = 0;
    this.recvCount = 0;
  }

  get isHost() { return !!this.joined && this.hostId === this.myId; }

  join(code, profile = {}) {
    this.leave(true);
    this.code = code;
    this.topic = 'realtime:kart-' + code;
    this.joinedAt = Date.now();
    this._leaving = false;
    this._retry = 0;
    this._everOpened = false;
    this._admitted = false;
    this.setProfile(profile, false);
    this._setStatus('connecting');
    this._connect();
  }

  leave(silent = false) {
    this._leaving = true;
    clearTimeout(this._retryT); this._retryT = null;
    clearTimeout(this._admitT); this._admitT = null;
    this._stopHeartbeat();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try { if (ws.readyState === 1 && this.joined) this._raw(ws, this.topic, 'phx_leave', {}, this.joinRef); } catch (e) { /* ignore */ }
      try { ws.onopen = ws.onmessage = ws.onerror = null; ws.onclose = null; ws.close(); } catch (e) { /* ignore */ }
    }
    this.joined = false;
    this.presence.clear();
    this.players.clear();
    this.order = [];
    this.hostId = null;
    if (!silent) { this.code = null; this._setStatus('closed'); }
  }

  setProfile({ name, char, st } = {}, track = true) {
    if (name != null) this.profile.name = sanitizeName(name, this.profile.name || 'Racer');
    if (char != null && CHAR_IDS.has(char)) this.profile.char = char;
    if (st === 'race' || st === 'done' || st === 'lobby') this.profile.st = st;
    if (track && this.joined && this._admitted) this._track();
    this._recompute();
  }

  /** Broadcast a game message to the room. Returns false if not connected. */
  send(event, payload) {
    if (!this.joined || !this.ws || this.ws.readyState !== 1) return false;
    const body = { type: 'broadcast', event, payload: { ...payload, f: this.myId } };
    const json = JSON.stringify({ topic: this.topic, event: 'broadcast', payload: body, ref: String(++this.ref), join_ref: this.joinRef });
    if (json.length > MAX_SEND) return false;
    try { this.ws.send(json); } catch (e) { return false; }
    this.lastSend = performance.now();
    this.sentCount++;
    return true;
  }

  /** Players in join order (only the first MAX_HUMANS are in the room). */
  playerList() {
    return this.order.slice(0, MAX_HUMANS).map((id) => this.players.get(id)).filter(Boolean);
  }

  // ------------------------------------------------------------------ internals
  _setStatus(s, detail) {
    this.status = s;
    try { this.h.onStatus && this.h.onStatus(s, detail); } catch (e) { console.error('[online] status handler', e); }
  }

  _connect() {
    if (this._leaving) return;
    const base = SUPABASE_URL.replace(/^http/, 'ws').replace(/\/+$/, '');
    let ws;
    try {
      ws = new WebSocket(`${base}/realtime/v1/websocket?apikey=${encodeURIComponent(SUPABASE_KEY)}&vsn=1.0.0`);
    } catch (e) { this._scheduleReconnect(); return; }
    this.ws = ws;
    this.joined = false;
    this._gotState = false;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this._everOpened = true;
      this.joinRef = String(++this.ref);
      this._raw(ws, this.topic, 'phx_join', {
        config: { broadcast: { self: false, ack: false }, presence: { key: this.myId, enabled: true }, private: false },
        access_token: SUPABASE_KEY,
      }, this.joinRef, this.joinRef);
      this._startHeartbeat();
    };
    ws.onmessage = (ev) => { if (this.ws === ws) this._onFrame(ev.data); };
    ws.onerror = () => { /* onclose follows */ };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.joined = false;
      this._stopHeartbeat();
      this._scheduleReconnect();
    };
  }

  _scheduleReconnect() {
    if (this._leaving) return;
    clearTimeout(this._retryT);
    const delay = Math.min(10000, 1000 * 2 ** Math.min(this._retry, 4));
    this._retry++;
    this._setStatus(this._everOpened ? 'reconnecting' : (this._retry >= 2 ? 'unreachable' : 'connecting'));
    this._retryT = setTimeout(() => this._connect(), delay);
  }

  _raw(ws, topic, event, payload, joinRef = null, ref = null) {
    ws.send(JSON.stringify({ topic, event, payload, ref: ref || String(++this.ref), join_ref: joinRef }));
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._hb = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== 1) return;
      if (this._hbPending) { try { ws.close(); } catch (e) { /* ignore */ } return; } // missed a beat: reconnect
      this._hbPending = String(++this.ref);
      try { this._raw(ws, 'phoenix', 'heartbeat', {}, null, this._hbPending); } catch (e) { /* ignore */ }
    }, HEARTBEAT_MS);
  }
  _stopHeartbeat() { clearInterval(this._hb); this._hb = null; this._hbPending = null; }

  _track() {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return;
    const payload = { id: this.myId, name: this.profile.name, char: this.profile.char, joinedAt: this.joinedAt, st: this.profile.st, v: 1 };
    try { this._raw(ws, this.topic, 'presence', { type: 'presence', event: 'track', payload }, this.joinRef); } catch (e) { /* ignore */ }
  }

  _onFrame(data) {
    if (typeof data !== 'string') return;
    if (data.length > MAX_FRAME && (data.length > MAX_PRESENCE_FRAME || data.indexOf('"presence_') < 0)) return;
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m !== 'object' || typeof m.event !== 'string') return;
    this.lastRecv = performance.now();
    if (m.topic === 'phoenix') {
      if (m.event === 'phx_reply' && m.ref === this._hbPending) this._hbPending = null;
      return;
    }
    if (m.topic !== this.topic) return;
    const p = m.payload;
    switch (m.event) {
      case 'phx_reply':
        if (m.ref === this.joinRef) {
          if (p && p.status === 'ok') {
            this.joined = true;
            this._retry = 0;
            if (this._admitted) { // reconnect: we already hold our place in the room
              this._track();
              this._recompute();
              this._setStatus('joined');
            } else if (this._gotState) this._admit();
            else { clearTimeout(this._admitT); this._admitT = setTimeout(() => this._admit(), 1500); } // wait for presence_state
          } else {
            try { this.ws && this.ws.close(); } catch (e) { /* ignore */ }
          }
        }
        break;
      case 'presence_state':
        this.presence.clear();
        this._applyJoins(p);
        this._gotState = true;
        if (this.joined && !this._admitted) this._admit();
        else this._recompute();
        break;
      case 'presence_diff':
        if (p && typeof p === 'object') { this._applyJoins(p.joins); this._applyLeaves(p.leaves); }
        this._recompute();
        break;
      case 'broadcast':
        this._onBroadcast(p);
        break;
      case 'phx_error':
      case 'phx_close':
        try { this.ws && this.ws.close(); } catch (e) { /* ignore */ }
        break;
      default: break;
    }
  }

  _applyJoins(joins) {
    if (!joins || typeof joins !== 'object') return;
    let n = 0;
    for (const key of Object.keys(joins)) {
      if (++n > 64) break;
      const metas = joins[key] && Array.isArray(joins[key].metas) ? joins[key].metas : [];
      const list = this.presence.get(key) || [];
      for (const meta of metas.slice(0, 8)) {
        if (!meta || typeof meta.phx_ref !== 'string') continue;
        if (!list.some((x) => x.phx_ref === meta.phx_ref)) list.push(meta);
      }
      if (list.length) this.presence.set(key, list.slice(-8));
    }
  }
  _applyLeaves(leaves) {
    if (!leaves || typeof leaves !== 'object') return;
    for (const key of Object.keys(leaves)) {
      const list = this.presence.get(key);
      if (!list) continue;
      const refs = new Set((leaves[key] && Array.isArray(leaves[key].metas) ? leaves[key].metas : []).map((x) => x && x.phx_ref));
      const rest = list.filter((x) => !refs.has(x.phx_ref));
      if (rest.length) this.presence.set(key, rest); else this.presence.delete(key);
    }
  }

  /**
   * First join of this room, once presence_state is in (or after a timeout): sort after everyone already
   * here even if our clock is behind theirs (join order = host + room-full order), check the room isn't full,
   * then announce ourselves. Admission is decided once, so a later arrival can never evict a racer.
   */
  _admit() {
    clearTimeout(this._admitT); this._admitT = null;
    if (!this.joined || this._admitted) return;
    let max = -Infinity, n = 0;
    for (const [key, metas] of this.presence) {
      if (key === this.myId) continue;
      const pl = validMeta(key, metas[metas.length - 1]);
      if (!pl) continue;
      n++;
      if (pl.joinedAt > max) max = pl.joinedAt;
    }
    if (max >= this.joinedAt) this.joinedAt = Math.floor(max) + 1;
    if (n >= MAX_HUMANS) {
      const code = this.code;
      this.leave(true);
      this.code = code;
      this._setStatus('full');
      return;
    }
    this._admitted = true;
    this._track();
    this._recompute();
    this._setStatus('joined');
  }

  _recompute() {
    const players = new Map();
    for (const [key, metas] of this.presence) {
      const pl = validMeta(key, metas[metas.length - 1]);
      if (pl) players.set(key, pl);
    }
    if (this.joined && this._admitted) {
      // always include ourselves (the server echo of our own track may lag)
      players.set(this.myId, { id: this.myId, name: this.profile.name, char: this.profile.char, joinedAt: this.joinedAt, st: this.profile.st });
    }
    const order = [...players.values()].sort((a, b) => (a.joinedAt - b.joinedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((p) => p.id);
    const prevHost = this.hostId;
    this.players = players;
    this.order = order;
    this.hostId = order[0] || null;
    try { this.h.onPlayers && this.h.onPlayers(this.playerList(), this.hostId); } catch (e) { console.error('[online] players handler', e); }
    if (prevHost && this.hostId && prevHost !== this.hostId) {
      try { this.h.onHostChange && this.h.onHostChange(this.hostId, prevHost); } catch (e) { console.error('[online] host handler', e); }
    }
  }

  _onBroadcast(p) {
    if (!p || typeof p !== 'object' || typeof p.event !== 'string' || p.event.length > 8) return;
    const body = p.payload;
    if (!body || typeof body !== 'object') return;
    const from = body.f;
    if (typeof from !== 'string' || from === this.myId || !this.players.has(from)) return;
    if (this.order.indexOf(from) >= MAX_HUMANS) return;
    // per-sender rate cap
    const now = performance.now();
    let r = this._rate.get(from);
    if (!r || now - r.t0 > 1000) { r = { t0: now, n: 0 }; this._rate.set(from, r); }
    if (++r.n > RATE_PER_SEC) return;
    this.recvCount++;
    try { this.h.onMessage && this.h.onMessage(p.event, body, from); } catch (e) { console.error('[online] message handler', e); }
  }
}
