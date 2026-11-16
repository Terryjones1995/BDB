/* Break Room Brawl: keeps a copy of the game on the device, so it opens at once and still opens with no signal.
   - The page itself is asked for fresh every time, and the copy is only used when the network does not answer.
   - A file with a version in its address (main.js?v=1116m) never changes, so the copy is used without asking.
   - Everything else (models, pictures, fonts) is shown from the copy and refreshed behind the scenes for next time.
   If this file ever needs to go away, replace it with one that unregisters itself and deletes the cache. */
const CACHE = 'brawl-1', FONTS = ['fonts.googleapis.com', 'fonts.gstatic.com'], PAGE_WAIT = 4000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const open = () => caches.open(CACHE);
const find = async key => { try { return await (await open()).match(key, {ignoreVary:true}); } catch(e){ return undefined; } };
/* keep a good answer for next time, without holding up the one going to the page. A redirect, an error or half a file is not a good answer. */
function keep(e, key, res){
  if (!res || res.redirected || res.status === 206) return res;
  const good = res.type === 'basic' ? res.ok : res.type === 'cors' ? res.ok : res.type === 'opaque';
  if (!good) return res;
  const copy = res.clone();
  e.waitUntil(open().then(c => c.put(key, copy)).catch(() => {}));
  return res;
}
/* an older version of the same file is no use to anyone */
async function prune(url){
  try {
    const c = await open(), path = url.origin + url.pathname;
    for (const k of await c.keys()){ const u = new URL(k.url); if (u.origin + u.pathname === path && u.search !== url.search) await c.delete(k); }
  } catch(e){}
}

async function page(e, req){
  const url = new URL(req.url), key = url.origin + url.pathname;      // one copy of the page, whatever comes after the question mark
  const net = fetch(req).then(res => keep(e, key, res));
  try {
    return await Promise.race([net, new Promise((_, no) => setTimeout(() => no(new Error('slow')), PAGE_WAIT))]);
  } catch(err){
    const hit = await find(key);
    if (hit){ e.waitUntil(net.catch(() => {})); return hit; }
    return net;                                                       // nothing kept yet: wait for the network, and let the browser say what it says
  }
}
async function versioned(e, req){
  const hit = await find(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok){ keep(e, req, res); e.waitUntil(prune(new URL(req.url))); }
  return res;
}
async function refreshed(e, req){
  const hit = await find(req), net = fetch(req).then(res => keep(e, req, res));
  if (hit){ e.waitUntil(net.catch(() => {})); return hit; }
  return net;
}

/* The first visit is over before this worker is in charge, so nothing it loaded came through here. The page sends the list of what it loaded,
   and whatever is not kept yet is fetched (out of the browser's own cache, as a rule) and kept: one visit is enough to open with no signal. */
self.addEventListener('message', e => {
  const list = e.data && e.data.keep; if (!Array.isArray(list)) return;
  e.waitUntil((async () => {
    const c = await open();
    for (const u of list.slice(0, 400)){
      try {
        if (typeof u !== 'string' || new URL(u).origin !== self.location.origin || await c.match(u, {ignoreVary:true})) continue;
        const res = await fetch(u);
        if (res.ok && res.type === 'basic' && !res.redirected) await c.put(u, res);
      } catch(err){}
    }
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  let url; try { url = new URL(req.url); } catch(err){ return; }
  const mine = url.origin === self.location.origin;
  if (!mine && !FONTS.includes(url.hostname)) return;                 // the account server and everything else go straight out
  if (mine && req.mode === 'navigate') e.respondWith(page(e, req));
  else if (mine && url.searchParams.has('v')) e.respondWith(versioned(e, req));
  else e.respondWith(refreshed(e, req));
});
