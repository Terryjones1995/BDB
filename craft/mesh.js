/* BDB Craft: turning a chunk of blocks into what the graphics card draws. The input is padded: PAD blocks of each neighbour round the sides, a row of
   bedrock under the bottom (y = -1) and a row of air over the top (y = 128). Only faces that can be seen are made, and flat runs of the same face with the
   same light are merged into one big rectangle ("greedy" meshing). Every corner gets a little shadow where blocks meet (ambient occlusion) and two kinds of
   light: from the sky (leaves and water dim it, solid blocks stop it, it spreads a few blocks under roofs and into caves) and from blocks that glow
   (torches, lanterns, glowstone, lava: up to 8 blocks out, one level less each block). The border is as wide as light can reach, so nothing changes at
   the edge of a chunk. Output: two meshes, the solid one (leaves and plants cut out by the shader) and the see-through one (water, stained glass).
   Each corner carries [sky, block] light; the shader picks the brighter of the sky (times the time of day) and the warm block light. */
import { CH, H, OPAQUE, CUTOUT, PLANT, LIQUID, TRANS, SELF, GLOW, EMIT, FACE } from './blocks.js?v=c9';
export const PAD = 8, PW = CH + 2 * PAD, PH = H + 2;
export const pidx = (x, y, z) => ((y + 1) * PW + (z + PAD)) * PW + (x + PAD);
const LSTEP = .2, SKY_ROUNDS = 5;      // sky light lost for each block it spreads sideways out of the open sky
const SHADE = [.8, .8, 1, .5, .64, .64], AOF = [.5, .68, .84, 1];
class Buf { constructor(n){ this.a = new Float32Array(n); this.n = 0; } push(...v){ if (this.n + v.length > this.a.length){ const b = new Float32Array(this.a.length * 2 + v.length); b.set(this.a); this.a = b; } for (const x of v) this.a[this.n++] = x; } out(){ return this.a.slice(0, this.n); } }
class Mesh {
  constructor(){ this.p = new Buf(8192); this.t = new Buf(8192); this.l = new Buf(5462); this.q = 0; this.flip = []; }
  quad(c, uv, layer, L, flip){      // c: 4 corners (x, y, z), uv: 4 (u, v), L: 4 x [sky, block]. flip: split along the other diagonal
    for (let i = 0; i < 4; i++){ this.p.push(c[i * 3], c[i * 3 + 1], c[i * 3 + 2]); this.t.push(uv[i * 2], uv[i * 2 + 1], layer); this.l.push(L[i * 2], L[i * 2 + 1]); }
    this.q++; this.flip.push(flip ? 1 : 0);
  }
  out(){
    const idx = new Uint32Array(this.q * 6);
    for (let k = 0; k < this.q; k++){ const b = k * 4, o = k * 6; if (this.flip[k]) idx.set([b + 1, b + 2, b + 3, b + 1, b + 3, b], o); else idx.set([b, b + 1, b + 2, b, b + 2, b + 3], o); }
    return {pos:this.p.out(), tex:this.t.out(), light:this.l.out(), idx};
  }
}
const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], UV = [[2, 1], [0, 2], [0, 1]], DIM = [CH, H, CH];
const LV = [0, .2, .36, .5, .63, .75, .85, .93, 1];      // block light level -> brightness

export function meshChunk(v){
  const N = v.length, ST = [1, -1, PW, -PW, PW * PW, -PW * PW];
  // ---- light from the sky, column by column, then spreading sideways a few rounds
  const sky = new Float32Array(N);
  for (let z = -PAD; z < CH + PAD; z++) for (let x = -PAD; x < CH + PAD; x++){
    let s = 1;
    for (let y = H; y >= -1; y--){ const i = pidx(x, y, z), b = v[i]; if (OPAQUE[b]){ s = 0; continue; } sky[i] = s; if (CUTOUT[b]) s *= .74; else if (LIQUID[b]) s *= .84; else if (TRANS[b]) s *= .9; }
  }
  let top = 0; for (let i = N - 1; i >= 0; i--) if (OPAQUE[v[i]]){ top = Math.floor(i / (PW * PW)); break; }
  const y1 = Math.min(PH - 2, top + 1), tmp = new Float32Array(N);
  for (let r = 0; r < SKY_ROUNDS; r++){
    tmp.set(sky);
    for (let yy = 1; yy <= y1; yy++) for (let z = 1; z < PW - 1; z++){ const row = (yy * PW + z) * PW;
      for (let x = 1; x < PW - 1; x++){ const i = row + x; if (OPAQUE[v[i]] || sky[i] >= 1) continue;
        let m = sky[i]; for (let k = 0; k < 6; k++){ const n = sky[i + ST[k]] - LSTEP; if (n > m) m = n; }
        tmp[i] = m; } }
    sky.set(tmp);
  }
  // ---- light from glowing blocks: a flood out from each one, a level less per block, through anything that is not solid
  const lvl = new Uint8Array(N), q = new Int32Array(N); let qh = 0, qt = 0;
  for (let i = 0; i < N; i++){ const e = EMIT[v[i]]; if (e){ lvl[i] = e; q[qt++] = i; } }
  while (qh < qt){
    const i = q[qh++], l = lvl[i] - 1; if (l <= 0) continue;
    for (let k = 0; k < 6; k++){ const j = i + ST[k]; if (j < 0 || j >= N || lvl[j] >= l || OPAQUE[v[j]]) continue; lvl[j] = l; q[qt++] = j; }
  }
  const bl = i => LV[lvl[i]];
  const at = (x, y, z) => y < 0 ? 1 : y >= H ? 0 : v[pidx(x, y, z)];
  const sk = (x, y, z) => y < 0 ? 0 : y >= H ? 1 : sky[pidx(x, y, z)];
  const bk = (x, y, z) => y < 0 || y >= H ? 0 : bl(pidx(x, y, z));
  const solid = new Mesh(), clear = new Mesh();
  const S = [1, PW * PW, PW], MS = [1, 64, 4096, 262144];      // steps through the padded volume along x, y, z; where each corner's light sits in the key
  for (let d = 0; d < 3; d++){
    const [uA, vA] = UV[d], U = DIM[uA], V = DIM[vA], D = DIM[d], su = S[uA], sv = S[vA];
    const mask = new Float64Array(U * V), lay = new Uint16Array(U * V), tran = new Uint8Array(U * V);
    for (const s of [1, -1]){
      const f = d * 2 + (s > 0 ? 0 : 1), sh = SHADE[f], sd = S[d] * s;
      for (let k = 0; k < D; k++){
        mask.fill(0);
        for (let iv = 0; iv < V; iv++) for (let iu = 0; iu < U; iu++){
          const x = d === 0 ? k : iu, y = d === 1 ? k : iv, z = d === 2 ? k : d === 0 ? iu : iv;
          const ci = pidx(x, y, z), b = v[ci]; if (!b || PLANT[b] || LIQUID[b]) continue;
          const ai = ci + sd, n = v[ai];
          if (OPAQUE[n] || (SELF[b] && n === b)) continue;
          let skey = 0, bkey = 0;
          for (let c = 0; c < 4; c++){
            const ou = (c === 1 || c === 2 ? su : -su), ov = (c >= 2 ? sv : -sv);
            const s1 = OPAQUE[v[ai + ou]], s2 = OPAQUE[v[ai + ov]], s3 = OPAQUE[v[ai + ou + ov]], ao = s1 && s2 ? 0 : 3 - s1 - s2 - s3;
            let ss = sky[ai], bs = bl(ai), cnt = 1;
            if (!s1){ ss += sky[ai + ou]; bs += bl(ai + ou); cnt++; } if (!s2){ ss += sky[ai + ov]; bs += bl(ai + ov); cnt++; } if (!s3 && !(s1 && s2)){ ss += sky[ai + ou + ov]; bs += bl(ai + ou + ov); cnt++; }
            const a = sh * AOF[ao], Ls = GLOW[b] ? 1 : a * (.28 + .72 * ss / cnt), Lb = GLOW[b] ? 1 : (.45 + .55 * sh) * AOF[ao] * bs / cnt;      // block light cares less which way a face points
            skey += Math.min(63, Math.round(Ls * 63)) * MS[c]; bkey += Math.min(63, Math.round(Lb * 63)) * MS[c];
          }
          const m = iv * U + iu; mask[m] = skey * 16777216 + bkey + 1; lay[m] = FACE[b * 6 + f]; tran[m] = TRANS[b];
        }
        for (let iv = 0; iv < V; iv++) for (let iu = 0; iu < U; ){
          const m0 = iv * U + iu, key = mask[m0]; if (!key){ iu++; continue; }
          const L0 = lay[m0], T0 = tran[m0], same = j => mask[j] === key && lay[j] === L0 && tran[j] === T0;
          let w = 1; while (iu + w < U && same(m0 + w)) w++;
          let h = 1; grow: while (iv + h < V){ for (let j = 0; j < w; j++) if (!same((iv + h) * U + iu + j)) break grow; h++; }
          for (let y = 0; y < h; y++) for (let j = 0; j < w; j++) mask[(iv + y) * U + iu + j] = 0;
          const kk = key - 1, sk2 = Math.floor(kk / 16777216), bk2 = kk - sk2 * 16777216, L = [];
          for (let c = 0; c < 4; c++){ L.push(Math.floor(sk2 / MS[c]) % 64 / 63, Math.floor(bk2 / MS[c]) % 64 / 63); }
          const pl = s > 0 ? k + 1 : k, P = [];
          for (const [cu, cv] of [[iu, iv], [iu + w, iv], [iu + w, iv + h], [iu, iv + h]]){ const p = [0, 0, 0]; p[d] = pl; p[uA] = cu; p[vA] = cv; P.push(p); }
          const tu = cu => d === 1 ? cu : (f === 0 || f === 5 ? -cu : cu), tv = cv => d === 1 ? cv : -cv;      // pictures stand upright on the sides
          const uvs = [[iu, iv], [iu + w, iv], [iu + w, iv + h], [iu, iv + h]].map(([a, b2]) => [tu(a), tv(b2)]);
          let order = [0, 1, 2, 3]; const ccw = (d === 2) === (s > 0);      // the corners as listed face -x, -y and +z: turn them round for the other three
          if (!ccw) order = [0, 3, 2, 1];
          const br = c => Math.max(L[c * 2], L[c * 2 + 1]), flip = br(order[0]) + br(order[2]) < br(order[1]) + br(order[3]);
          (T0 ? clear : solid).quad(order.flatMap(i => P[i]), order.flatMap(i => uvs[i]), L0, order.flatMap(i => [L[i * 2], L[i * 2 + 1]]), flip);
        }
      }
    }
  }
  // plants: two pictures crossed, seen from both sides
  for (let y = 0; y < H; y++) for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++){
    const b = v[pidx(x, y, z)]; if (!PLANT[b]) continue;
    const ls = .2 + .8 * (.28 + .72 * sk(x, y, z)), lb = GLOW[b] ? 1 : bk(x, y, z), L = [ls * .9, lb * .9, ls * .9, lb * .9, ls, lb, ls, lb], layer = FACE[b * 6], i = .15, j = .85;
    for (const [ax, az, bx, bz] of [[i, i, j, j], [j, i, i, j]]){
      solid.quad([x + ax, y, z + az, x + bx, y, z + bz, x + bx, y + 1, z + bz, x + ax, y + 1, z + az], [0, 0, 1, 0, 1, -1, 0, -1], layer, L, false);
      solid.quad([x + bx, y, z + bz, x + ax, y, z + az, x + ax, y + 1, z + az, x + bx, y + 1, z + bz], [0, 0, 1, 0, 1, -1, 0, -1], layer, L, false);
    }
  }
  // water and lava: the top sits a little low unless there is more of it above. Lava is drawn solid and glows
  for (let y = 0; y < H; y++) for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++){
    const b = v[pidx(x, y, z)]; if (!LIQUID[b]) continue;
    const up = at(x, y + 1, z), same = n => LIQUID[n] && LIQUID[n] === LIQUID[b], top = same(up) ? 1 : .875, ls = .25 + .75 * sk(x, y, z), lbv = GLOW[b] ? 1 : bk(x, y, z), out = TRANS[b] ? clear : solid, W = FACE[b * 6 + 2];
    for (let f = 0; f < 6; f++){
      const d = f >> 1, s = f & 1 ? -1 : 1, n = at(x + AX[d][0] * s, y + AX[d][1] * s, z + AX[d][2] * s);
      if (same(n) || (OPAQUE[n] && !(f === 2 && top < 1))) continue;
      if (f === 2 && same(up)) continue;
      const Ls = GLOW[b] ? 1 : SHADE[f] * ls, Lb = GLOW[b] ? 1 : SHADE[f] * lbv, y1 = y + top, P =
        f === 0 ? [x + 1, y, z + 1, x + 1, y, z, x + 1, y1, z, x + 1, y1, z + 1] : f === 1 ? [x, y, z, x, y, z + 1, x, y1, z + 1, x, y1, z] :
        f === 2 ? [x, y1, z + 1, x + 1, y1, z + 1, x + 1, y1, z, x, y1, z] : f === 3 ? [x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z + 1] :
        f === 4 ? [x, y, z + 1, x + 1, y, z + 1, x + 1, y1, z + 1, x, y1, z + 1] : [x + 1, y, z, x, y, z, x, y1, z, x + 1, y1, z];
      const uv = d === 1 ? [P[0], P[2], P[3], P[5], P[6], P[8], P[9], P[11]] : [P[0] + P[2], -P[1], P[3] + P[5], -P[4], P[6] + P[8], -P[7], P[9] + P[11], -P[10]];
      out.quad(P, uv, W, [Ls, Lb, Ls, Lb, Ls, Lb, Ls, Lb], false);
    }
  }
  return {solid:solid.out(), clear:clear.out()};
}
