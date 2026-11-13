import { openTransport } from '../chess/net.js';

/* =========================================================
   Online tables for BDB Tycoon, on top of the shared chess transport.
   - 'tycoon-lobby' room: hosts announce their open tables, everyone on the page sees the list.
   - 'tycoon-<code>' room: one table. The host is authoritative; game.js speaks the table protocol.
   Everything that arrives here is untrusted: shapes are checked and strings cleaned before use.
   ========================================================= */

export const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, '').trim().slice(0, max);
export const rid = (n = 6) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
export const okCode = c => typeof c === 'string' && /^[a-z0-9]{4,12}$/.test(c);
const int = (v, lo, hi, d) => Number.isInteger(v) && v >= lo && v <= hi ? v : d;

export function initNet({local, onTables, onStatus}){
  let net = null, lobby = null, failed = false;
  const tables = new Map();        // code -> {code, peer, name, n, max, started, seen}
  let hosting = null;              // listing we keep announcing
  const emit = () => { try { onTables && onTables([...tables.values()].sort((a, b) => a.name.localeCompare(b.name))); } catch(e){} };

  const ready = (async () => {
    try { net = await openTransport(local); }
    catch(e){ failed = true; onStatus && onStatus('failed'); return false; }
    lobby = net.join('tycoon-lobby');
    lobby.onJoin(id => { if (hosting) lobby.send('tbl', hosting, id); });
    lobby.onLeave(id => { let ch = false; for (const [c, t] of tables) if (t.peer === id){ tables.delete(c); ch = true; } if (ch) emit(); });
    lobby.onMessage((t, d, from) => {
      if (!d || typeof d !== 'object') return;
      if (t === 'tbl'){
        if (!okCode(d.code)) return;
        const prev = tables.get(d.code);
        if (prev && prev.peer !== from) return;         // first announcer owns the code
        tables.set(d.code, {code:d.code, peer:from, name:clean(d.name, 24) || 'Someone', n:int(d.n, 0, 6, 0), max:int(d.max, 2, 6, 6), started:!!d.started, seen:Date.now()});
        emit();
      } else if (t === 'tbl-x'){
        const tb = tables.get(d.code);
        if (tb && tb.peer === from){ tables.delete(d.code); emit(); }
      }
    });
    setInterval(() => {
      if (hosting) lobby.send('tbl', hosting);
      const now = Date.now(); let ch = false;
      for (const [c, t] of tables) if (now - t.seen > 35000){ tables.delete(c); ch = true; }
      if (ch) emit();
    }, 10000);
    onStatus && onStatus('ready');
    return true;
  })();

  return {
    ready,
    get failed(){ return failed; },
    get selfId(){ return net ? net.selfId : null; },
    list: () => [...tables.values()],
    announce(info){ hosting = {code:info.code, name:clean(info.name, 24), n:info.n, max:info.max, started:!!info.started}; if (lobby) lobby.send('tbl', hosting); },
    unannounce(){ if (hosting && lobby) lobby.send('tbl-x', {code:hosting.code}); hosting = null; },
    room(code){ return net.join('tycoon-' + code); }
  };
}
