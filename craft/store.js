/* BDB Craft: where worlds are kept. Signed in (the same account as Break Room Brawl), worlds live on the BDB server in Supabase, so they follow you to
   any computer and friends can join. Not signed in, or the server is not set up for Craft yet, they live in this browser (IndexedDB).
   A world is its settings (name, seed, type, where you were standing) plus every chunk anyone changed, each squeezed with deflate and sent as base64. */
import { SUPABASE_URL, SUPABASE_KEY } from '../brawl/config.js?v=c13';
const base = (new URLSearchParams(location.search).get('api') || SUPABASE_URL || '').replace(/\/+$/, '');
const SKEY = 'brawl-session';
export function session(){ try { const s = JSON.parse(localStorage.getItem(SKEY)); if (s && typeof s.name === 'string' && typeof s.token === 'string') return s; } catch(e){} return null; }
function keep(s){ try { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); } catch(e){} }

/* chunk <-> text */
async function pipe(bytes, stream){ const r = new Response(new Blob([bytes]).stream().pipeThrough(stream)); return new Uint8Array(await r.arrayBuffer()); }
const b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
export async function pack(v){ return b64(await pipe(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), new CompressionStream('deflate-raw'))); }
/* chunks are 16 x 16 x 128 block numbers of two bytes each; worlds saved before there were more than 256 blocks have one byte each and are widened here */
export async function unpack(s){ const u = await pipe(unb64(s), new DecompressionStream('deflate-raw'));
  if (u.length === 65536) return new Uint16Array(u.buffer, u.byteOffset, 32768).slice();
  if (u.length === 32768) return Uint16Array.from(u);
  throw new Error('bad chunk'); }

/* the server */
async function rpc(fn, args){
  if (!base) throw Object.assign(new Error('off'), {kind:'off'});
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 15000);
  try {
    let r;
    try { r = await fetch(`${base}/rest/v1/rpc/${fn}`, {method:'POST', signal:ac.signal, headers:{'Content-Type':'application/json', apikey:SUPABASE_KEY, Authorization:'Bearer ' + SUPABASE_KEY}, body:JSON.stringify(args)}); }
    catch(e){ throw Object.assign(new Error('net'), {kind:'net'}); }
    if (!r.ok){ let code = '', msg = ''; try { const j = await r.json(); code = String(j.code || ''); msg = String(j.message || ''); } catch(e){}
      throw Object.assign(new Error(code || String(r.status)), {kind:code === 'PGRST202' || (code === '42883' && msg.includes('craft_')) ? 'setup' : 'http', status:r.status}); }
    const j = await r.json(); if (j && j.error) throw Object.assign(new Error(j.error), {kind:j.error === 'bad_token' ? 'signin' : 'said', said:j.error}); return j;
  } finally { clearTimeout(t); }
}
const me = () => { const s = session(); if (!s) throw Object.assign(new Error('signin'), {kind:'signin'}); return {p_name:s.name, p_token:s.token}; };

export const Cloud = {
  on:!!base,
  async login(name, pass){ const r = await rpc('brawl_login', {p_name:name, p_pass:pass}); if (r && r.token) keep({name:r.name, token:r.token}); return r; },
  async register(name, pass){ const r = await rpc('brawl_register', {p_name:name, p_pass:pass, p_data:{}}); if (r && r.token) keep({name:r.name, token:r.token}); return r; },
  signOut(){ keep(null); },
  list(){ return rpc('craft_list', me()); },
  me(){ return rpc('craft_me', me()); },
  setSkin(skin){ return rpc('craft_set_skin', {...me(), p_skin:skin}); },
  create(w){ return rpc('craft_new', {...me(), p_title:w.name, p_seed:w.seed, p_kind:w.kind}); },
  rename(id, name){ return rpc('craft_rename', {...me(), p_id:id, p_title:name}); },
  remove(id){ return rpc('craft_delete', {...me(), p_id:id}); },
  async load(id){
    const w = await rpc('craft_load', {...me(), p_id:id, p_after:0}); const chunks = [...(w.chunks || [])];
    let more = w.more; while (more){ const r = await rpc('craft_load', {...me(), p_id:id, p_after:more}); chunks.push(...(r.chunks || [])); more = r.more; }
    return {...w.world, chunks};
  },
  save(id, chunks, meta){ return rpc('craft_save', {...me(), p_id:id, p_chunks:chunks, p_meta:meta}); },
  live(id, code){ return rpc('craft_live', {...me(), p_id:id, p_code:code || ''}); },
};

/* this browser */
let dbp = null;
function db(){
  if (!dbp) dbp = new Promise((ok, no) => { const r = indexedDB.open('bdb-craft', 1); r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('worlds', {keyPath:'id'}); d.createObjectStore('chunks'); }; r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  return dbp;
}
const req = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
export const Local = {
  async list(){ const d = await db(); return (await req(d.transaction('worlds').objectStore('worlds').getAll())).sort((a, b) => b.updated - a.updated); },
  async create(w){ const d = await db(), id = 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); const row = {id, name:w.name, seed:w.seed, kind:w.kind, meta:{}, updated:Date.now(), created:Date.now()}; await req(d.transaction('worlds', 'readwrite').objectStore('worlds').put(row)); return row; },
  async rename(id, name){ const d = await db(), s = d.transaction('worlds', 'readwrite').objectStore('worlds'), w = await req(s.get(id)); if (w){ w.name = name; await req(s.put(w)); } },
  async remove(id){ const d = await db(), t = d.transaction(['worlds', 'chunks'], 'readwrite'); t.objectStore('worlds').delete(id); t.objectStore('chunks').delete(IDBKeyRange.bound(id + '|', id + '|￿')); await new Promise(ok => t.oncomplete = ok); },
  async load(id){
    const d = await db(), w = await req(d.transaction('worlds').objectStore('worlds').get(id)); if (!w) throw new Error('gone');
    const t = d.transaction('chunks').objectStore('chunks'), keys = await req(t.getAllKeys(IDBKeyRange.bound(id + '|', id + '|￿'))), vals = await req(d.transaction('chunks').objectStore('chunks').getAll(IDBKeyRange.bound(id + '|', id + '|￿')));
    return {...w, chunks:keys.map((k, i) => { const [cx, cz] = k.split('|')[1].split(',').map(Number); return {cx, cz, d:vals[i]}; })};
  },
  async save(id, chunks, meta){
    const d = await db(), t = d.transaction(['worlds', 'chunks'], 'readwrite'), s = t.objectStore('worlds');
    for (const c of chunks) t.objectStore('chunks').put(c.d, id + '|' + c.cx + ',' + c.cz);
    const w = await req(s.get(id)); if (w){ w.meta = meta; w.updated = Date.now(); s.put(w); }
    await new Promise((ok, no) => { t.oncomplete = ok; t.onerror = () => no(t.error); });
  },
};
