/**
 * BDB City online: accounts and cities kept in Supabase, through the SQL functions in
 * city/supabase.sql. Plain fetch to the REST endpoint, no SDK, the same way Brawl does it.
 *
 * Every call can fail (offline, the server not set up yet). Callers catch that and the game
 * carries on with the copy saved on this device; nothing here is ever required to play.
 */
import { SUPABASE_URL, SUPABASE_KEY } from '../../config.js';

const params = new URLSearchParams(location.search);
// ?api= and ?apikey= point the game at another server (a local one, for tests)
const base = (params.get('api') || SUPABASE_URL || '').replace(/\/+$/, '');
const key = params.get('apikey') || SUPABASE_KEY || '';
const SKEY = 'city-session';
const OUT_KEY = 'city-signed-out';   // set by an explicit sign-out, so a Brawl sign-in does not quietly undo it

let sess = null;
try {
  const s = JSON.parse(localStorage.getItem(SKEY));
  if (s && typeof s.name === 'string' && typeof s.token === 'string') sess = s;
} catch (_) { /* no storage, or nothing stored */ }

/**
 * Why a call failed, so the screen can say something useful. `kind`:
 *   net    never got an answer (offline, server down, blocked)
 *   setup  the server answered but the city functions are not installed: supabase.sql has not been run
 *   route  something answered at that address, but not a Supabase REST API
 *   key    it turned the game's key down
 *   http   anything else it said no to
 */
function fail(kind, status, code = '', msg = '') {
  const e = new Error(kind + ' ' + status);
  e.kind = kind; e.status = status; e.code = code; e.msg = msg;
  return e;
}

async function rpc(fn, args = {}, timeoutMs = 9000) {
  if (!base) throw fail('net', 0);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    let r;
    try {
      r = await fetch(`${base}/rest/v1/rpc/${fn}`, {
        method: 'POST', signal: ac.signal,
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key },
        body: JSON.stringify(args),
      });
    } catch (_) { throw fail('net', 0); }
    if (!r.ok) {
      let code = '', msg = '';
      try { const j = await r.json(); code = String(j.code || ''); msg = String(j.message || j.msg || ''); } catch (_) { /* no body */ }
      const lost = code === 'PGRST202' || (code === '42883' && msg.includes('city_'));
      throw fail(lost ? 'setup' : r.status === 404 && !code ? 'route' : r.status === 401 || r.status === 403 ? 'key' : 'http', r.status, code, msg);
    }
    return await r.json();
  } finally { clearTimeout(timer); }
}

/** A sentence for the player about a failed call. */
export function cloudWhy(e) {
  const k = e && e.kind;
  return k === 'setup' ? 'Online saving is not switched on yet. Your city is saved on this device.'
    : k === 'route' || k === 'key' ? 'The account server is not answering properly. Your city is saved on this device.'
    : k === 'http' ? 'The account server had a problem. Try again in a minute. Your city is saved on this device.'
    : 'No answer from the account server. Check your connection. Your city is saved on this device.';
}

/** What an `{ error }` answer from the server means, in a sentence. */
export function cloudSays(code) {
  return ({
    bad_input: 'Names are 2 to 20 characters and passwords at least 4.',
    taken: 'That name is taken. If it is yours from Brawl, use your Brawl password.',
    bad_login: 'That name and password do not match.',
    bad_token: 'You have been signed out. Sign in again.',
    too_big: 'This city is too big to keep online. It is still saved on this device.',
    too_many: 'You have 12 cities online, which is the most an account can hold. Delete one to make room.',
    not_yours: 'That city belongs to another account.',
    not_found: 'That city is not online any more.',
  })[code] || 'The account server said no.';
}

function keep(s) {
  sess = s;
  try {
    if (s) { localStorage.setItem(SKEY, JSON.stringify(s)); localStorage.removeItem(OUT_KEY); }
    else localStorage.removeItem(SKEY);
  } catch (_) { /* no storage */ }
}
const mine = () => ({ p_name: sess.name, p_token: sess.token });
/** Any answer of `{ error: 'bad_token' }` means the stored sign-in is dead. */
const checked = (r) => { if (r && r.error === 'bad_token') keep(null); return r || { error: 'empty' }; };

export const Cloud = {
  /** Is there a server address at all? */
  on: !!base,
  /** 'unknown' until probe() has run; then 'ready', 'setup' (SQL not installed) or 'offline'. */
  state: base ? 'unknown' : 'off',
  session: () => sess,
  signOut() { keep(null); try { localStorage.setItem(OUT_KEY, '1'); } catch (_) { /* no storage */ } },

  /** Ask the server whether it is set up for cities. Never throws. → the new state. */
  async probe() {
    if (!base) return (this.state = 'off');
    // Two tries, with room to breathe: the first one goes out while the page is at its busiest
    // (start-up, the start screen's backdrop), and on a slow machine a short timeout can fire before
    // the answer that is already waiting has been looked at.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await rpc('city_ping', {}, 12000);
        this.limits = r && r.ok ? { cities: r.max_cities || 12, bytes: r.max_bytes || 1500000 } : this.limits;
        return (this.state = r && r.ok ? 'ready' : 'offline');
      } catch (e) {
        if (e.kind === 'setup') return (this.state = 'setup');
        this.state = 'offline';
        if (e.kind !== 'net') break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
    return this.state;
  },
  limits: { cities: 12, bytes: 1500000 },

  async register(name, pass) {
    const r = await rpc('city_register', { p_name: name, p_pass: pass });
    if (r && r.token) keep({ name: r.name, token: r.token });
    return r || { error: 'empty' };
  },
  async login(name, pass) {
    const r = await rpc('city_login', { p_name: name, p_pass: pass });
    if (r && r.token) keep({ name: r.name, token: r.token });
    return r || { error: 'empty' };
  },
  /** Signed in to Brawl in this browser? That sign-in opens the same account here. → true if it did. */
  async adoptBrawl() {
    if (sess) return true;
    let b = null;
    try {
      if (localStorage.getItem(OUT_KEY)) return false;      // the player signed out of City on purpose
      b = JSON.parse(localStorage.getItem('brawl-session'));
    } catch (_) { /* nothing stored */ }
    if (!b || typeof b.name !== 'string' || typeof b.token !== 'string') return false;
    try {
      const r = await rpc('city_adopt', { p_name: b.name, p_brawl_token: b.token });
      if (r && r.token) { keep({ name: r.name, token: r.token }); return true; }
    } catch (_) { /* not set up, offline: stay signed out */ }
    return false;
  },

  async list() { return checked(await rpc('city_list', mine())); },
  async load(id) { return checked(await rpc('city_load', { ...mine(), p_id: id }, 30000)); },
  /** `rec` is a device record: { id, name, seed, start, summary, data }. */
  async save(rec) {
    const s = rec.summary || {};
    return checked(await rpc('city_save', {
      ...mine(), p_id: rec.id, p_city: rec.name || 'New city', p_seed: rec.seed | 0, p_start: rec.start || null,
      p_population: Math.round(s.population || 0), p_money: Math.round(s.money || 0), p_happiness: Math.round(s.happiness || 0),
      p_day: Math.round(s.day || 0), p_data: rec.data,
    }, 30000));
  },
  async remove(id) { return checked(await rpc('city_delete', { ...mine(), p_id: id })); },
  async top() { return checked(await rpc('city_top', mine())); },
  async visit(id) { return checked(await rpc('city_visit', { ...mine(), p_id: id }, 30000)); },
};
