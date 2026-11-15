/* Break Room Brawl: player accounts.
   A player is a named save on this device (localStorage), with a save code to carry it to another device, and an online copy when they have an account (cloud.js).
   Everything that reads a save goes through sanitize(), so a bad or old save can never break the game: it is repaired or brought up to date instead. */
import { CARDS, STARTERS, DECK_SLOTS, MAX_LVL, START_COINS, LEVELS, PERKS, PERK_IDS, OLD_BASE, OLD_AFF, deckProblem } from './cards.js?v=1115d';

const KEY = 'brawl-accounts-v2';
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029<>]/g, '').trim().slice(0, n);
const int = (v, lo, hi, d) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d;
const id = n => clean(n, 20).toLowerCase();

function read(){ try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && typeof d.list === 'object') return d; } catch(e){} return {last:null, list:{}}; }
function write(d){ try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch(e){ return false; } }

export function fresh(name){
  const cards = {}; for (const c of STARTERS) cards[c] = 1;
  return {v:3, name:clean(name, 20) || 'Player', coins:START_COINS, trophies:0, cards, decks:Array.from({length:DECK_SLOTS}, () => STARTERS.slice()), deck:0,
    ladder:0, tokens:0, perks:Object.fromEntries(PERK_IDS.map(k => [k, 0])), stats:{w:0, l:0, d:0, ow:0, ol:0, won:0, up:0, tr:0, packs:0}, made:Date.now(), onboarded:false, friends:{}, flags:{traps:1}};
  // cards: id -> level. ladder: the highest level beaten. tokens: unspent player upgrades. flags: one-off announcements already seen
}
/* a card id from any version of the game, as today's id (or null if that character is gone) */
export function cardId(k){
  if (Object.hasOwn(CARDS, k)) return k;
  const m = /^([a-z0-9]+)-([a-z]+)(?:-[crel])?$/.exec(String(k)); if (!m) return null;
  const b = OLD_BASE[m[1]] || m[1], a = OLD_AFF[m[2]] || m[2];
  return Object.hasOwn(CARDS, `${b}-${a}`) ? `${b}-${a}` : Object.hasOwn(CARDS, b + '-std') ? b + '-std' : null;
}
export function sanitize(p){
  const o = fresh(p && p.name);
  if (!p || typeof p !== 'object') return o;
  const old = p.v !== 3;                                  // made before characters had one fixed rarity and the ladder had a thousand levels
  o.coins = int(p.coins, 0, 99999999, START_COINS); o.trophies = int(p.trophies, 0, 99999, 0); o.made = int(p.made, 0, 9e15, Date.now());
  o.ladder = old ? int(p.ladder * 5, 0, LEVELS, 0) : int(p.ladder, 0, LEVELS, 0); o.tokens = int(p.tokens, 0, 9999, 0);
  if (p.perks && typeof p.perks === 'object') for (const k of PERK_IDS) o.perks[k] = int(p.perks[k], 0, PERKS[k].max, 0);
  let lost = 0;
  if (p.cards && typeof p.cards === 'object'){
    const mine = {};
    for (const k in p.cards){ const n = int(p.cards[k], 0, MAX_LVL, 0), c = cardId(k); if (n <= 0) continue; if (c) mine[c] = Math.max(mine[c] || 0, n); else lost++; }
    if (Object.keys(mine).length >= 1) o.cards = mine;                                    // only what they actually own
  }
  if (old && lost) o.coins += lost * 150;                 // a card whose character has left the game is paid for
  if (Array.isArray(p.decks)) for (let i = 0; i < DECK_SLOTS; i++){
    const src = p.decks[i]; if (!Array.isArray(src)) continue;
    const d = src.map(cardId), seen = new Set(), ok = d.length === STARTERS.length && d.every(c => { if (!c || seen.has(CARDS[c].base)) return false; seen.add(CARDS[c].base); return true; });
    if (ok && !deckProblem(d) && d.every(c => o.cards[c] > 0)) o.decks[i] = d;
  }
  for (const d of o.decks) for (const c of d) o.cards[c] = Math.max(1, o.cards[c] || 0);          // a deck slot that fell back to the starter deck brings its cards with it
  o.deck = int(p.deck, 0, DECK_SLOTS - 1, 0); o.onboarded = p.onboarded !== false;
  if (p.friends && typeof p.friends === 'object'){ let n = 0; for (const k in p.friends){ const nm = clean(k, 20); if (nm && n++ < 200) o.friends[nm] = int(p.friends[k], 0, 9e15, 0); } }
  o.flags = {}; if (p.flags && typeof p.flags === 'object') for (const k in p.flags) if (/^[a-z0-9]{1,12}$/.test(k) && p.flags[k]) o.flags[k] = 1;
  if (old) o.flags.moved = 1;                             // tell them once what changed
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
