/* BDB Craft: building with friends. Whoever opens the world hosts it: friends join with a six letter code, straight to each other over WebRTC
   (the same way Charleston Chess plays online), with nothing in between. The host's copy is the real one: friends send their changes to the host, the host
   puts them in and passes them on to everyone, and only the host saves. A friend makes the untouched parts of the world from the seed, the same as the host,
   so the only blocks that travel are the chunks someone has changed.
   Messages: hi (host to a new friend: the world and which chunks changed), ch (one changed chunk), me (my name), p (where I am), e (a block changed),
   c (chat), pl (who is here, from the host). */
import { openTransport } from '../chess/net.js?v=c1';
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => ABC[b % ABC.length]).join('');
export const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

export async function openParty({local, code, host, name, on}){
  const net = await openTransport(local), room = net.join('craft-' + code, () => on.error && on.error('join'));
  const people = new Map();             // peer id -> {name, n}
  let hostId = host ? net.selfId : null, n = 0, closed = false;
  const list = () => [{id:net.selfId, name, host:!!host}, ...[...people].map(([id, p]) => ({id, name:p.name, host:id === hostId}))];
  const tell = () => { if (host) room.send('pl', list().map(p => [p.id, p.name])); on.people && on.people(list()); };
  room.onJoin(id => {
    room.send('me', {name}, id);
    if (host) on.welcome(id).then(({hi, chunks}) => { if (closed) return; room.send('hi', hi, id); for (const c of chunks) room.send('ch', c, id); room.send('ready', 1, id); });
  });
  room.onLeave(id => {
    const p = people.get(id); people.delete(id);
    if (id === hostId && !host){ closed = true; on.hostLeft && on.hostLeft(); return; }
    if (p){ on.left && on.left(id, p.name); tell(); }
  });
  room.onMessage((t, d, from) => {
    if (closed || !d && d !== 0) return;
    if (t === 'me'){ const nm = String(d.name || 'Friend').slice(0, 20); const had = people.has(from); people.set(from, {name:nm, n:++n}); if (!had){ on.joined && on.joined(from, nm); } tell(); return; }
    if (t === 'hi' && !host){ hostId = from; on.hi && on.hi(d); return; }
    if (t === 'ch' && from === hostId){ on.chunk && on.chunk(d); return; }
    if (t === 'ready' && from === hostId){ on.ready && on.ready(); return; }
    if (t === 'pl' && from === hostId){ for (const [id, nm] of d) if (id !== net.selfId && !people.has(id)) people.set(id, {name:String(nm).slice(0, 20), n:++n}); on.people && on.people(list()); return; }
    if (t === 'p'){ on.pos && on.pos(from, d); return; }
    if (t === 'e'){
      const x = d[0] | 0, y = d[1] | 0, z = d[2] | 0, b = d[3] | 0; if (b < 0 || b > 255 || y < 1 || y > 127) return;
      if (host){ if (on.edit(x, y, z, b, from) !== false) room.send('e', [x, y, z, b]); }        // the host checks it, then everyone gets it
      else if (from === hostId) on.edit(x, y, z, b, from);
      return;
    }
    if (t === 'c'){ const p = people.get(from); on.chat && on.chat(p ? p.name : 'Friend', String(d).slice(0, 200)); return; }
  });
  return {
    code, selfId:net.selfId, get hostId(){ return hostId; }, list, people,
    edit(x, y, z, b){ if (host) room.send('e', [x, y, z, b]); else if (hostId) room.send('e', [x, y, z, b], hostId); },
    pos(p){ room.send('p', p); },
    chat(text){ room.send('c', text); },
    count:() => people.size,
    leave(){ closed = true; room.leave(); }
  };
}
