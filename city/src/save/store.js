/**
 * Cities saved on this device.
 *
 * IndexedDB, in two stores so that listing cities never has to read their contents:
 *   meta   { id, name, seed, start, owner, updatedAt, summary, bytes, cloudRev, cloudAt, dirty }
 *   data   id → the packed city (one string, see codec.js)
 * `dirty` means the device copy is newer than the online one; `owner` is the account it belongs
 * to ('' = nobody yet). If IndexedDB is not available (some private windows), the same records go
 * into localStorage, which holds a handful of towns and then says it is full.
 */
const DB = 'bdb-city', VERSION = 1, LS_INDEX = 'bdb.city.saves', LS_DATA = 'bdb.city.save.';

let dbPromise = null;
function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB, VERSION); } catch (_) { resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('data')) db.createObjectStore('data');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}
const done = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error || new Error('storage failed')); });
const finished = (tx) => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error || new Error('storage failed')); tx.onabort = () => reject(tx.error || new Error('storage is full')); });

// ---- localStorage fallback
const lsIndex = () => { try { const v = JSON.parse(localStorage.getItem(LS_INDEX)); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
const lsWriteIndex = (list) => localStorage.setItem(LS_INDEX, JSON.stringify(list));

const newest = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);
const metaOf = (rec) => ({
  id: rec.id, name: rec.name || 'New city', seed: rec.seed, start: rec.start || null, owner: rec.owner || '',
  updatedAt: rec.updatedAt || Date.now(), summary: rec.summary || {}, bytes: rec.data ? rec.data.length : rec.bytes || 0,
  cloudRev: rec.cloudRev || 0, cloudAt: rec.cloudAt || null, dirty: rec.dirty !== false,
});

export const Store = {
  /** Every city on this device, newest first, without contents. */
  async list() {
    const db = await open();
    if (!db) return lsIndex().sort(newest);
    try { return (await done(db.transaction('meta').objectStore('meta').getAll())).sort(newest); }
    catch (_) { return []; }
  },
  /** One city with its contents (`data`), or null. */
  async get(id) {
    const db = await open();
    if (!db) {
      const meta = lsIndex().find((m) => m.id === id);
      const data = meta ? localStorage.getItem(LS_DATA + id) : null;
      return meta && data ? { ...meta, data } : null;
    }
    try {
      const tx = db.transaction(['meta', 'data']);
      const [meta, data] = await Promise.all([done(tx.objectStore('meta').get(id)), done(tx.objectStore('data').get(id))]);
      return meta && typeof data === 'string' ? { ...meta, data } : null;
    } catch (_) { return null; }
  },
  /** Write a city. `rec.data` is the packed string. Throws if the device will not take it. */
  async put(rec) {
    const meta = metaOf(rec);
    const db = await open();
    if (!db) {
      localStorage.setItem(LS_DATA + rec.id, rec.data);
      lsWriteIndex([meta, ...lsIndex().filter((m) => m.id !== rec.id)]);
      return meta;
    }
    const tx = db.transaction(['meta', 'data'], 'readwrite');
    tx.objectStore('meta').put(meta);
    tx.objectStore('data').put(rec.data, rec.id);
    await finished(tx);
    return meta;
  },
  /** Change what is known about a city without rewriting its contents (after an online save, a rename). */
  async patch(id, changes) {
    const db = await open();
    if (!db) {
      const list = lsIndex(), i = list.findIndex((m) => m.id === id);
      if (i < 0) return null;
      list[i] = { ...list[i], ...changes };
      lsWriteIndex(list);
      return list[i];
    }
    const tx = db.transaction('meta', 'readwrite'), store = tx.objectStore('meta');
    const meta = await done(store.get(id));
    if (!meta) return null;
    const next = { ...meta, ...changes };
    store.put(next);
    await finished(tx);
    return next;
  },
  async remove(id) {
    const db = await open();
    if (!db) {
      try { localStorage.removeItem(LS_DATA + id); lsWriteIndex(lsIndex().filter((m) => m.id !== id)); } catch (_) { /* nothing to remove */ }
      return;
    }
    const tx = db.transaction(['meta', 'data'], 'readwrite');
    tx.objectStore('meta').delete(id);
    tx.objectStore('data').delete(id);
    await finished(tx);
  },
};

/** A new city's id. */
export function newCityId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
