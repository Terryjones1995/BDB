/* Break Room Brawl: online accounts, cloud saves, who's online and invites, through the SQL functions in supabase.sql.
   Everything is a plain fetch to Supabase's REST endpoint; no SDK. Every call can fail (offline, server not set up yet):
   callers catch that and the game carries on with the copy saved on this device. */
import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=1115d';

const base = (new URLSearchParams(location.search).get('api') || SUPABASE_URL || '').replace(/\/+$/, '');
const SKEY = 'brawl-session';
let sess = null, pushT = 0, pending = null;
try { const s = JSON.parse(localStorage.getItem(SKEY)); if (s && typeof s.name === 'string' && typeof s.token === 'string') sess = s; } catch(e){}

async function rpc(fn, args, keepalive){
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 9000);
  try {
    let r;
    try { r = await fetch(`${base}/rest/v1/rpc/${fn}`, {method:'POST', keepalive:!!keepalive, signal:ac.signal, headers:{'Content-Type':'application/json', apikey:SUPABASE_KEY, Authorization:'Bearer ' + SUPABASE_KEY}, body:JSON.stringify(args)}); }
    catch(e){ throw fail('net', 0); }                                   // no answer at all: offline, the server is down, or the browser was not allowed to ask
    if (!r.ok){
      let code = ''; try { code = String((await r.json()).code || ''); } catch(e){}
      throw fail(r.status === 404 || code === 'PGRST202' || code === '42883' ? 'setup' : r.status === 401 || r.status === 403 ? 'key' : 'http', r.status);
    }
    return await r.json();
  } finally { clearTimeout(t); }
}
/* why a call failed, so the screen can say something useful. kind: 'net' (never got an answer), 'setup' (the server answered but the game's functions
   are not installed on it: supabase.sql has not been run), 'key' (it turned the key down), 'http' (anything else it said no to) */
function fail(kind, status){ const e = new Error(kind + ' ' + status); e.kind = kind; e.status = status; return e; }
export const cloudWhy = e => { const k = e && e.kind, host = base.replace(/^https?:\/\//, '');
  return k === 'setup' ? `The account server (${host}) answered, but accounts are not set up on it yet: brawl/supabase.sql has to be run there once. Play on this device for now.`
    : k === 'key' ? `The account server (${host}) turned down the game's key (error ${e.status}). Play on this device for now.`
    : k === 'http' ? `The account server (${host}) had a problem (error ${e.status}). Try again in a minute, or play on this device only.`
    : `No answer from the account server (${host}). Check your connection, or play on this device only.`; };
function keep(s){ sess = s; try { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); } catch(e){} }
const mine = () => ({p_name:sess.name, p_token:sess.token});

export const Cloud = {
  on:!!base,
  session:() => sess,
  signOut(){ clearTimeout(pushT); pending = null; keep(null); },
  async register(name, pass, data){ const r = await rpc('brawl_register', {p_name:name, p_pass:pass, p_data:data}); if (r && r.token) keep({name:r.name, token:r.token}); return r || {error:'empty'}; },
  async login(name, pass){ const r = await rpc('brawl_login', {p_name:name, p_pass:pass}); if (r && r.token) keep({name:r.name, token:r.token}); return r || {error:'empty'}; },
  async load(){ return (await rpc('brawl_load', mine())) || {error:'empty'}; },
  /* saves are bundled: the latest copy goes up a moment after the last change */
  push(p){
    if (!sess || !p || p.name.toLowerCase() !== sess.name.toLowerCase()) return;
    pending = p; clearTimeout(pushT); pushT = setTimeout(() => Cloud.flush(), 1500);
  },
  flush(keepalive){ if (!sess || !pending) return; const d = pending; pending = null; clearTimeout(pushT); rpc('brawl_save', {...mine(), p_data:d}, keepalive).catch(() => { if (!pending) pending = d; }); },
  ping:status => rpc('brawl_ping', {...mine(), p_status:status}),
  invite:(to, kind, code) => rpc('brawl_invite', {...mine(), p_to:to, p_kind:kind, p_code:code}),
  inviteDone:id => rpc('brawl_invite_done', {...mine(), p_id:id}).catch(() => {})
};
addEventListener('pagehide', () => Cloud.flush(true));
