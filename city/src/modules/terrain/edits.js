/**
 * The ground as a save sees it: only the samples that differ from freshly generated terrain.
 *
 * Everything that reshapes land ends up in the heightmap: a road cutting its corridor, a building
 * levelling its plot, a starter town terracing its blocks, a player's landscaping. Rather than log
 * those operations and replay them (their blends depend on the order they happened in), a save
 * stores the result. Loading puts every stored sample back, so the ground is the ground that was
 * saved, and everything derived from it (which zoning cells are too steep, where a plot sits)
 * comes out the same.
 *
 * Packed form, one stream of LEB128 varints in scan order (row by row):
 *     skip, take, d1 … d_take,   skip, take, d1 …
 * `skip` unchanged samples, then `take` changed ones. Each changed height is stored in whole
 * centimetres as the zig-zag difference from the previous changed sample. Graded ground is flat or
 * an even ramp, so those differences are mostly 0 or a small constant, and the stream compresses
 * to very little.
 */

/** A sample counts as changed when it is more than this many metres from the generated height. */
const EPS = 0.004;
/** Changed samples are reported back in tiles of this many samples a side (128 m). */
const TILE = 64;

class Bytes {
  constructor() { this.buf = new Uint8Array(4096); this.n = 0; }
  byte(b) {
    if (this.n === this.buf.length) { const next = new Uint8Array(this.buf.length * 2); next.set(this.buf); this.buf = next; }
    this.buf[this.n++] = b;
  }
  varint(v) {
    v = Math.max(0, Math.floor(v));
    while (v >= 0x80) { this.byte((v % 0x80) | 0x80); v = Math.floor(v / 0x80); }
    this.byte(v);
  }
  zigzag(v) { this.varint(v < 0 ? -2 * v - 1 : 2 * v); }
  done() { return this.buf.slice(0, this.n); }
}

/** → `{ bytes: Uint8Array, count }`; `count` is how many samples differ from `pristine`. */
export function packEdits(hm, pristine) {
  const data = hm.data, total = data.length;
  const out = new Bytes();
  let i = 0, prev = 0, count = 0;
  while (i < total) {
    let skip = 0;
    while (i < total && Math.abs(data[i] - pristine[i]) <= EPS) { i++; skip++; }
    if (i >= total) break;
    const start = i;
    while (i < total && Math.abs(data[i] - pristine[i]) > EPS) i++;
    out.varint(skip);
    out.varint(i - start);
    for (let k = start; k < i; k++) {
      const q = Math.round(data[k] * 100);
      out.zigzag(q - prev);
      prev = q;
    }
    count += i - start;
  }
  return { bytes: out.done(), count };
}

/**
 * Write packed edits into the heightmap.
 * → `{ count, tiles }`; each tile is `{ i0, i1, j0, j1 }`, the bounds of the changed samples inside
 * one TILE×TILE square, for the caller to re-mesh. Malformed input stops quietly at the bad byte.
 */
export function unpackEdits(hm, bytes) {
  const data = hm.data, N = hm.N, total = data.length;
  const tiles = new Map();
  let pos = 0, i = 0, prev = 0, count = 0;
  const varint = () => {
    let v = 0, mul = 1;
    for (;;) {
      if (pos >= bytes.length) return -1;
      const b = bytes[pos++];
      v += (b & 0x7f) * mul;
      if (b < 0x80) return v;
      mul *= 0x80;
      if (mul > 2 ** 42) return -1;
    }
  };
  while (pos < bytes.length) {
    const skip = varint(), take = varint();
    if (skip < 0 || take < 0) break;
    i += skip;
    for (let k = 0; k < take; k++) {
      const z = varint();
      if (z < 0) return { count, tiles: [...tiles.values()] };
      prev += z % 2 ? -(z + 1) / 2 : z / 2;
      if (i < total) {
        const h = prev / 100;
        data[i] = h;
        if (h > hm.maxH) hm.maxH = h;
        if (h < hm.minH) hm.minH = h;
        const ci = i % N, cj = (i - ci) / N;
        const key = Math.floor(cj / TILE) * 4096 + Math.floor(ci / TILE);
        let t = tiles.get(key);
        if (!t) tiles.set(key, (t = { i0: ci, i1: ci, j0: cj, j1: cj }));
        else { if (ci < t.i0) t.i0 = ci; if (ci > t.i1) t.i1 = ci; if (cj < t.j0) t.j0 = cj; if (cj > t.j1) t.j1 = cj; }
        count++;
      }
      i++;
    }
  }
  if (count) hm.version++;
  return { count, tiles: [...tiles.values()] };
}
