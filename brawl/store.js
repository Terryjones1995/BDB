/* Break Room Brawl: player accounts.
   A player is a named save on this device (localStorage), with a save code to carry it to another device, and an online copy when they have an account (cloud.js).
   Everything that reads a save goes through sanitize(), so a bad or old save can never break the game: it is repaired or brought up to date instead. */
import { CARDS, STARTERS, DECK_SLOTS, DECK_SIZE, RAR_CAP, MAX_LVL, START_COINS, LEVELS, PERKS, PERK_IDS, JOBS, MILESTONES, MS_IDS, OLD_BASE, OLD_AFF, BASE_IDS, goalsOf } from './cards.js?v=1119c';

const KEY = 'brawl-accounts-v2';
function sum(s){ let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029<>]/g, '').trim().slice(0, n);
const int = (v, lo, hi, d) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d;
const id = n => clean(n, 20).toLowerCase();
/* The owner's account, known by the fingerprint of its name. The limits on Legendary and God cards in a deck do not apply to it (main.js has its other perks). */
const OWNERS = ['1vpdqid'];
export const isOwner = name => OWNERS.includes(sum(id(name)));
/* Presents from the owner: a one-off for a named account, again known by the fingerprint of its name. Handed over once, the next time that account signs in.
   id is the flag that marks it as taken (letters and digits, twelve at most). */
const GIFTS = {'1jqxccf':[{id:'g1', coins:150000}], '1i58gqb':[{id:'g1', coins:150000}]};
export const giftsFor = name => GIFTS[sum(id(name))] || [];

function read(){ try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && typeof d.list === 'object') return d; } catch(e){} return {last:null, list:{}}; }
function write(d){ try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch(e){ return false; } }

export function fresh(name){
  const cards = {}; for (const c of STARTERS) cards[c] = 1;
  return {v:3, name:clean(name, 20) || 'Player', coins:START_COINS, trophies:0, cards, decks:Array.from({length:DECK_SLOTS}, (_, i) => i ? [] : STARTERS.slice()), deck:0,
    ladder:0, tokens:0, perks:Object.fromEntries(PERK_IDS.map(k => [k, 0])), stats:{w:0, l:0, d:0, ow:0, ol:0, won:0, up:0, tr:0, packs:0, sold:0}, made:Date.now(), onboarded:false, friends:{}, flags:{traps:1, dk:1, bal1:1, n15:1, n16:1, n17:1},
    daily:{day:'', n:0}, streak:0, best:0, bounty:0, bn:0, jobs:{day:'', list:[], all:0}, vs:{}, ms:{}, goals:{}};
  // cards: id -> level. decks: the first holds the starter deck, the others start empty; a deck may be part-built (it only has to be whole to play a match).
  // ladder: the highest level beaten. tokens: unspent player upgrades. flags: one-off announcements already seen (dk: saved since decks could be part-built)
  // daily: the day (local, YYYY-MM-DD) the daily reward was last taken and how many days running. streak / best: wins in a row now and ever.
  // bounty: enemy towers taken since the last bounty pack. bn: bounty packs opened
  // jobs: today's three jobs (the day they were dealt, how far along each is, whether it has been collected) and whether the chest for all three has been given
  // vs: the running score against each real person fought one against one, by name: [won, lost, drawn]
  // ms: how many rungs of each milestone have been collected
  // goals: how far each card's four goals have got, by card: [a, b, c, d]. One that has reached its number is done, and was paid when it got there
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
  const partOK = !!(p.flags && p.flags.dk);              // saved by a version that lets a deck stand part-built, or empty
  if (Array.isArray(p.decks)) for (let i = 0; i < DECK_SLOTS; i++){
    const src = p.decks[i]; if (!Array.isArray(src)) continue;
    // keep every card that is real, owned and within the deck rules, in the order it was in
    const d = [], seen = new Set(), free = isOwner(o.name), n = {};
    for (const k of src){
      const c = cardId(k); if (!c || d.length >= DECK_SIZE || !(o.cards[c] > 0)) continue;
      const C = CARDS[c]; if (seen.has(C.base) || (!free && (n[C.rar] || 0) >= (RAR_CAP[C.rar] ?? 99))) continue;      // one version of a character, and no more of a rarity than a deck may hold
      seen.add(C.base); n[C.rar] = (n[C.rar] || 0) + 1; d.push(c);
    }
    if (partOK) o.decks[i] = d;
    else if (i > 0 && d.join() === STARTERS.join()) o.decks[i] = [];        // an older save filled every spare slot with the starter deck: hand those back empty
    else if (d.length === DECK_SIZE || i > 0) o.decks[i] = d;               // (an older save with a broken first deck keeps the starter deck)
  }
  for (const d of o.decks) for (const c of d) o.cards[c] = Math.max(1, o.cards[c] || 0);          // a deck slot that fell back to the starter deck brings its cards with it
  o.deck = int(p.deck, 0, DECK_SLOTS - 1, 0); o.onboarded = p.onboarded !== false;
  if (p.friends && typeof p.friends === 'object'){ let n = 0; for (const k in p.friends){ const nm = clean(k, 20); if (nm && n++ < 200) o.friends[nm] = int(p.friends[k], 0, 9e15, 0); } }
  if (p.vs && typeof p.vs === 'object'){ let n = 0; for (const k in p.vs){ const nm = clean(k, 20), v = p.vs[k]; if (nm && Array.isArray(v) && n++ < 60) o.vs[nm] = [0, 1, 2].map(i => int(v[i], 0, 99999, 0)); } }
  if (p.goals && typeof p.goals === 'object') for (const b of BASE_IDS){ const v = p.goals[b]; if (!Array.isArray(v)) continue; const a = goalsOf(b).map((g, i) => int(v[i], 0, g.n, 0)); if (a.some(Boolean)) o.goals[b] = a; }
  if (p.ms && typeof p.ms === 'object') for (const k of MS_IDS){ const n = int(p.ms[k], 0, MILESTONES[k].at.length, 0); if (n) o.ms[k] = n; }
  if (p.daily && typeof p.daily === 'object') o.daily = {day:/^\d{4}-\d{2}-\d{2}$/.test(p.daily.day) ? p.daily.day : '', n:int(p.daily.n, 0, 7, 0)};
  if (p.jobs && typeof p.jobs === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(p.jobs.day) && Array.isArray(p.jobs.list))
    o.jobs = {day:p.jobs.day, list:p.jobs.list.filter(j => j && JOBS[j.id]).slice(0, 3).map(j => ({id:j.id, n:int(j.n, 0, JOBS[j.id].need, 0), got:j.got ? 1 : 0})), all:p.jobs.all ? 1 : 0};
  o.streak = int(p.streak, 0, 99999, 0); o.best = Math.max(o.streak, int(p.best, 0, 99999, 0)); o.bounty = int(p.bounty, 0, 999, 0); o.bn = int(p.bn, 0, 99999, 0);
  o.flags = {}; if (p.flags && typeof p.flags === 'object') for (const k in p.flags) if (/^[a-z0-9]{1,12}$/.test(k) && p.flags[k]) o.flags[k] = 1;
  o.flags.dk = 1; if (!(p.flags && p.flags.bal1)) delete o.flags.bal1;      // bal1: has been told about the rebalance (a save from before it has not)
  if (old) o.flags.moved = 1;                             // tell them once what changed
  if (p.stats && typeof p.stats === 'object') for (const k in o.stats) o.stats[k] = int(p.stats[k], 0, 9999999, 0);
  return o;
}

const b64 = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

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
