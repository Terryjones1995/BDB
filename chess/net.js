/* Transport for online play.
   Default: WebRTC peer-to-peer through Trystero, using public Nostr relays only to find each other.
   ?net=local: BroadcastChannel between tabs of the same browser (used for testing, no internet needed).
   Both expose the same tiny room API: send / onMessage / onJoin / onLeave / peers / leave. */

const APP_ID = 'bdb-games-charleston-chess-v1';

export async function openTransport(local){
  if (local) return localTransport();
  const T = await import('./vendor/trystero-nostr.mjs');
  return {
    selfId: T.selfId,
    join(roomId, onError){
      const room = T.joinRoom({appId: APP_ID}, roomId, {onJoinError: d => { if (onError) onError(d); }});
      const act = room.makeAction('m');
      let onMsg = null;
      act.onMessage = (data, meta) => {
        if (!onMsg || !data || typeof data.t !== 'string') return;
        onMsg(data.t, data.d, meta && meta.peerId);
      };
      return {
        send(t, d, target){ Promise.resolve(act.send({t, d}, target ? {target} : undefined)).catch(()=>{}); },
        onMessage(cb){ onMsg = cb; },
        onJoin(cb){ room.onPeerJoin = cb; },
        onLeave(cb){ room.onPeerLeave = cb; },
        peers(){ try { return Object.keys(room.getPeers() || {}); } catch(e){ return []; } },
        leave(){ try { room.leave(); } catch(e){} }
      };
    }
  };
}

function localTransport(){
  const selfId = 'L' + Math.random().toString(36).slice(2, 10);
  return {
    selfId,
    join(roomId){
      const ch = new BroadcastChannel('bdb-chess-' + roomId);
      const known = new Set();
      let onMsg = null, onJoin = null, onLeave = null, closed = false;
      const post = o => { if (!closed) ch.postMessage({...o, from:selfId}); };
      ch.onmessage = e => {
        const m = e.data;
        if (!m || m.from === selfId || (m.to && m.to !== selfId)) return;
        if (m.k === 'hello' || m.k === 'ack'){
          if (m.k === 'hello') post({k:'ack', to:m.from});   // ack first, so they know us before our first message lands
          if (!known.has(m.from)){ known.add(m.from); if (onJoin) onJoin(m.from); }
          return;
        }
        if (m.k === 'bye'){ if (known.delete(m.from) && onLeave) onLeave(m.from); return; }
        if (m.k === 'msg'){
          if (!known.has(m.from)){ known.add(m.from); if (onJoin) onJoin(m.from); }
          if (onMsg) onMsg(m.t, m.d, m.from);
        }
      };
      setTimeout(() => post({k:'hello'}), 0);
      addEventListener('pagehide', () => post({k:'bye'}));
      return {
        send(t, d, target){ post({k:'msg', t, d, to: target || null}); },
        onMessage(cb){ onMsg = cb; },
        onJoin(cb){ onJoin = cb; },
        onLeave(cb){ onLeave = cb; },
        peers(){ return [...known]; },
        leave(){ post({k:'bye'}); closed = true; ch.close(); }
      };
    }
  };
}
