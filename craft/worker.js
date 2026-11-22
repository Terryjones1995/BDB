/* BDB Craft: the background worker. Makes chunks and meshes them, so the page never stutters while the world loads. */
import { genChunk } from './gen.js?v=c15';
import { genChunk as genChunk2 } from './gen2.js?v=c15';
import { meshChunk } from './mesh.js?v=c15';
onmessage = e => {
  const m = e.data;
  if (m.t === 'gen'){ const v = m.kind === 'normal2' ? genChunk2(m.seed, m.cx, m.cz) : genChunk(m.seed, m.cx, m.cz, m.kind); postMessage({t:'gen', id:m.id, v}, [v.buffer]); }
  else if (m.t === 'mesh'){ const r = meshChunk(m.v); const list = []; for (const k of ['solid', 'clear']) for (const a of Object.values(r[k])) list.push(a.buffer); postMessage({t:'mesh', id:m.id, r}, list); }
};
