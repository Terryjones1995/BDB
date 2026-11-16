/**
 * Turning a city snapshot into one string, and back.
 *
 *   bdbz1:<base64 of gzip(JSON)>     the normal form
 *   bdbj1:<JSON>                     browsers without CompressionStream (and readable by hand)
 *
 * One string is what both stores want: a single IndexedDB value on the device, a single text
 * column in Supabase. The server never looks inside it.
 */

export function bytesToBase64(bytes) {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}

export function base64ToBytes(str) {
  const bin = atob(str || '');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const canZip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function' && typeof Response === 'function';

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

/** Snapshot object → string. */
export async function pack(obj) {
  const json = JSON.stringify(obj);
  if (canZip()) {
    try { return 'bdbz1:' + bytesToBase64(await pipe(new TextEncoder().encode(json), new CompressionStream('gzip'))); }
    catch (_) { /* fall through to plain JSON */ }
  }
  return 'bdbj1:' + json;
}

/** String → snapshot object. Throws with a plain message if the string is not a save. */
export async function unpack(str) {
  if (typeof str !== 'string') throw new Error('not a saved city');
  if (str.startsWith('bdbz1:')) {
    if (!canZip()) throw new Error('this browser cannot open compressed saves');
    const bytes = await pipe(base64ToBytes(str.slice(6)), new DecompressionStream('gzip'));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  if (str.startsWith('bdbj1:')) return JSON.parse(str.slice(6));
  if (str.trimStart().startsWith('{')) return JSON.parse(str);          // a raw snapshot or a rescue file
  throw new Error('not a saved city');
}
