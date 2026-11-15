/* Break Room Brawl: player accounts.
   Today an account is a named save on this device (localStorage), with a save code to carry it to another device.
   To add real logins later, keep this file's surface (all / get / save / remove / last / code / fromCode) and
   point `Accounts.remote` at a backend: save() already hands every change to remote.push(profile), and
   a login screen only needs remote.pull(name) -> profile, then Accounts.save(profile). Nothing else in the game touches storage. */
import { CARDS, STARTERS, DECK_SLOTS, MAX_LVL, deckProblem } from './cards.js';

const KEY = 'brawl-accounts-v2';
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029<>]/g, '').trim().slice(0, n);
const int = (v, lo, hi, d) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d;
const id = n => clean(n, 20).toLowerCase();

function read(){ try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && typeof d.list === 'object') return d; } catch(e){} return {last:null, list:{}}; }
function write(d){ try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch(e){ return false; } }

export function fresh(name){
  const cards = {}; for (const c of STARTERS) cards[c] = 1;
  return {v:2, name:clean(name, 20) || 'Player', coins:600, trophies:0, cards, decks:Array.from({length:DECK_SLOTS}, () => STARTERS.slice()), deck:0,
    ladder:0, beaten:{}, stats:{w:0, l:0, d:0, ow:0, ol:0, won:0, up:0}, made:Date.now()};   // cards: id -> level
}
/* Anything loaded from disk or a pasted code goes through here, so a bad save can never break the game. */
export function sanitize(p){
  const o = fresh(p && p.name);
  if (!p || typeof p !== 'object') return o;
  o.coins = int(p.coins, 0, 9999999, 500); o.trophies = int(p.trophies, 0, 99999, 0); o.ladder = int(p.ladder, 0, 99, 0); o.made = int(p.made, 0, 9e15, Date.now());
  if (p.cards && typeof p.cards === 'object') for (const k in p.cards) if (CARDS[k]){ const n = int(p.cards[k], 0, MAX_LVL, 0); if (n > 0) o.cards[k] = n; }
  for (const c of STARTERS) o.cards[c] = Math.max(1, o.cards[c] || 0);              // everyone always has the starter set
  if (Array.isArray(p.decks)) for (let i = 0; i < DECK_SLOTS; i++){ const d = p.decks[i]; if (Array.isArray(d) && !deckProblem(d) && d.every(c => o.cards[c] > 0)) o.decks[i] = d.slice(); }
  o.deck = int(p.deck, 0, DECK_SLOTS - 1, 0);
  if (p.beaten && typeof p.beaten === 'object') for (const k in p.beaten) if (/^[a-z0-9]{1,12}$/.test(k)) o.beaten[k] = int(p.beaten[k], 0, 99999, 0);
  if (p.stats && typeof p.stats === 'object') for (const k in o.stats) o.stats[k] = int(p.stats[k], 0, 9999999, 0);
  return o;
}

const b64 = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
const sum = s => { let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

export const Accounts = {
  remote:null,
  all(){ return Object.values(read().list).map(sanitize).sort((a, b) => a.name.localeCompare(b.name)); },
  get(name){ const p = read().list[id(name)]; return p ? sanitize(p) : null; },
  last(){ const d = read(); return d.last && d.list[d.last] ? sanitize(d.list[d.last]) : null; },
  save(p){ const d = read(); d.list[id(p.name)] = p; d.last = id(p.name); const ok = write(d); if (this.remote) try { this.remote.push(p); } catch(e){} return ok; },
  remove(name){ const d = read(); delete d.list[id(name)]; if (d.last === id(name)) d.last = null; write(d); },
  signOut(){ const d = read(); d.last = null; write(d); },
  code(p){ const body = b64(JSON.stringify(p)); return 'BRB1.' + body + '.' + sum(body); },
  fromCode(str){
    const m = /^BRB1\.([A-Za-z0-9_-]+)\.([a-z0-9]+)$/.exec(String(str).trim());
    if (!m || sum(m[1]) !== m[2]) throw new Error('That save code is not complete. Copy the whole thing and try again.');
    let p; try { p = JSON.parse(unb64(m[1])); } catch(e){ throw new Error('That save code could not be read.'); }
    return sanitize(p);
  },
  cleanName:n => clean(n, 20)
};
