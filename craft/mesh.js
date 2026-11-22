/* BDB Craft: turning a chunk of blocks into what the graphics card draws. The input is padded: one block of each neighbour round the sides, a row of bedrock
   under the bottom (y = -1) and a row of air over the top (y = 128). Only faces that can be seen are made, and flat runs of the same face with the same
   light are merged into one big rectangle ("greedy" meshing). Every corner gets a little shadow where blocks meet (ambient occlusion) and light from the sky,
   which leaves and water dim and solid blocks stop, so caves are dark and trees cast shade. Input: the chunk plus a one-block border from its eight neighbours.
   Output: two meshes, the solid one (leaves and plants cut out by the shader) and the see-through one (water, stained glass). */
import { CH, H, OPAQUE, CUTOUT, PLANT, LIQUID, TRANS, SELF, GLOW, FACE, T } from './blocks.js?v=c2';
export const PAD = 4, PW = CH + 2 * PAD, PH = H + 2;
export const pidx = (x, y, z) => ((y + 1) * PW + (z + PAD)) * PW + (x + PAD);
const LSTEP = .2;      // light lost for each block it spreads sideways out of the open sky (under a roof, into a doorway, into a cave mouth)
const SHADE = [.8, .8, 1, .5, .64, .64], AOF = [.5, .68, .84, 1];
class Buf { constructor(n){ this.a = new Float32Array(n); this.n = 0; } push(...v){ if (this.n + v.length > this.a.length){ const b = new Float32Array(this.a.length * 2 + v.length); b.set(this.a); this.a = b; } for (const x of v) this.a[this.n++] = x; } out(){ return this.a.slice(0, this.n); } }
class Mesh {
  constructor(){ this.p = new Buf(8192); this.t = new Buf(8192); this.l = new Buf(2731); this.q = 0; }
  quad(c, uv, layer, L, flip){      // c: 4 corners (x, y, z), uv: 4 (u, v), L: 4 lights. flip: split along the other diagonal
    for (let i = 0; i < 4; i++){ this.p.push(c[i * 3], c[i * 3 + 1], c[i * 3 + 2]); this.t.push(uv[i * 2], uv[i * 2 + 1], layer); this.l.push(L[i]); }
    this.q++; this.flip = this.flip || []; this.flip.push(flip ? 1 : 0);
  }
  out(){
    const idx = new Uint32Array(this.q * 6);
    for (let k = 0; k < this.q; k++){ const b = k * 4, o = k * 6; if (this.flip[k]){ idx.set([b + 1, b + 2, b + 3, b + 1, b + 3, b], o); } else idx.set([b, b + 1, b + 2, b, b + 2, b + 3], o); }
    return {pos:this.p.out(), tex:this.t.out(), light:this.l.out(), idx};
  }
}
const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], UV = [[2, 1], [0, 2], [0, 1]], DIM = [CH, H, CH];
export function meshChunk(v){
  // light from the sky, column by column
  const sky = new Float32Array(v.length);
  for (let z = -PAD; z < CH + PAD; z++) for (let x = -PAD; x < CH + PAD; x++){
    let s = 1;
    for (let y = H; y >= -1; y--){ const i = pidx(x, y, z), b = v[i]; if (OPAQUE[b]){ s = 0; continue; } sky[i] = s; if (CUTOUT[b]) s *= .74; else if (LIQUID[b]) s *= .84; else if (TRANS[b]) s *= .9; }
  }
  // then it spreads: PAD rounds, each one block further. The border is PAD wide, so every block in the chunk itself comes out exactly as it would with
  // the whole world to hand (no seams between chunks). Only the rows near the ground and below need it: open air above the highest block is already 1
  let top = 0; for (let i = v.length - 1; i >= 0; i--) if (OPAQUE[v[i]]){ top = Math.floor(i / (PW * PW)); break; }
  const ST = [1, -1, PW, -PW, PW * PW, -PW * PW], y1 = Math.min(PH - 2, top + 1), tmp = new Float32Array(v.length);
  for (let r = 0; r < PAD; r++){
    tmp.set(sky);
    for (let yy = 1; yy <= y1; yy++) for (let z = 1; z < PW - 1; z++){ const row = (yy * PW + z) * PW;
      for (let x = 1; x < PW - 1; x++){ const i = row + x; if (OPAQUE[v[i]] || sky[i] >= 1) continue;
        let m = sky[i]; for (let k = 0; k < 6; k++){ const n = sky[i + ST[k]] - LSTEP; if (n > m) m = n; }
        tmp[i] = m; } }
    sky.set(tmp);
  }
  const at = (x, y, z) => y < 0 ? 1 : y >= H ? 0 : v[pidx(x, y, z)];
  const sk = (x, y, z) => y < 0 ? 0 : y >= H ? 1 : sky[pidx(x, y, z)];
  const solid = new Mesh(), clear = new Mesh();
  const S = [1, PW * PW, PW], MUL = [262144, 4096, 64, 1];      // steps through the padded volume along x, y, z; where each corner's light sits in the key
  for (let d = 0; d < 3; d++){
    const [uA, vA] = UV[d], U = DIM[uA], V = DIM[vA], D = DIM[d], mask = new Float64Array(U * V), tmask = new Float64Array(U * V), su = S[uA], sv = S[vA];
    for (const s of [1, -1]){
      const f = d * 2 + (s > 0 ? 0 : 1), sh = SHADE[f], sd = S[d] * s;
      for (let k = 0; k < D; k++){
        mask.fill(0); tmask.fill(0);
        for (let iv = 0; iv < V; iv++) for (let iu = 0; iu < U; iu++){
          const x = d === 0 ? k : iu, y = d === 1 ? k : iv, z = d === 2 ? k : d === 0 ? iu : iv;
          const ci = pidx(x, y, z), b = v[ci]; if (!b || PLANT[b] || LIQUID[b]) continue;
          const ai = ci + sd, n = v[ai];
          if (OPAQUE[n] || (SELF[b] && n === b)) continue;
          let key = FACE[b * 6 + f] * 16777216;
          for (let q = 0; q < 4; q++){
            const ou = (q === 1 || q === 2 ? su : -su), ov = (q >= 2 ? sv : -sv);
            const s1 = OPAQUE[v[ai + ou]], s2 = OPAQUE[v[ai + ov]], s3 = OPAQUE[v[ai + ou + ov]], ao = s1 && s2 ? 0 : 3 - s1 - s2 - s3;
            let sum = sky[ai], cnt = 1; if (!s1){ sum += sky[ai + ou]; cnt++; } if (!s2){ sum += sky[ai + ov]; cnt++; } if (!s3 && !(s1 && s2)){ sum += sky[ai + ou + ov]; cnt++; }
            const L = GLOW[b] ? 1 : sh * (.28 + .72 * sum / cnt) * AOF[ao];
            key += Math.min(63, Math.round(L * 63)) * MUL[q];
          }
          (TRANS[b] ? tmask : mask)[iv * U + iu] = key + 1;
        }
        for (const [m, out] of [[mask, solid], [tmask, clear]]){
          for (let iv = 0; iv < V; iv++) for (let iu = 0; iu < U; ){
            const key = m[iv * U + iu]; if (!key){ iu++; continue; }
            let w = 1; while (iu + w < U && m[iv * U + iu + w] === key) w++;
            let h = 1; grow: while (iv + h < V){ for (let j = 0; j < w; j++) if (m[(iv + h) * U + iu + j] !== key) break grow; h++; }
            for (let y = 0; y < h; y++) for (let j = 0; j < w; j++) m[(iv + y) * U + iu + j] = 0;
            const kk = key - 1, layer = Math.floor(kk / 16777216), r = kk % 16777216, L = [Math.floor(r / 262144) / 63, Math.floor(r / 4096) % 64 / 63, Math.floor(r / 64) % 64 / 63, r % 64 / 63];
            const pl = s > 0 ? k + 1 : k, P = [];
            for (const [cu, cv] of [[iu, iv], [iu + w, iv], [iu + w, iv + h], [iu, iv + h]]){ const p = [0, 0, 0]; p[d] = pl; p[uA] = cu; p[vA] = cv; P.push(p); }
            const tu = cu => d === 1 ? cu : (f === 0 || f === 5 ? -cu : cu), tv = cv => d === 1 ? cv : -cv;      // pictures stand upright on the sides
            const uvs = [[iu, iv], [iu + w, iv], [iu + w, iv + h], [iu, iv + h]].map(([a, b2]) => [tu(a), tv(b2)]);
            let order = [0, 1, 2, 3]; const ccw = (d === 2) === (s > 0);      // the corners as listed face -x, -y and +z: turn them round for the other three
            if (!ccw) order = [0, 3, 2, 1];
            const flip = L[order[0]] + L[order[2]] < L[order[1]] + L[order[3]];
            out.quad(order.flatMap(i => P[i]), order.flatMap(i => uvs[i]), layer, order.map(i => L[i]), flip);
          }
        }
      }
    }
  }
  // plants: two pictures crossed, seen from both sides
  for (let y = 0; y < H; y++) for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++){
    const b = v[pidx(x, y, z)]; if (!PLANT[b]) continue;
    const l = .2 + .8 * (.28 + .72 * sk(x, y, z)), L = [l * .9, l * .9, l, l], layer = FACE[b * 6], i = .15, j = .85;
    for (const [ax, az, bx, bz] of [[i, i, j, j], [j, i, i, j]]){
      out2(solid, [x + ax, y, z + az, x + bx, y, z + bz, x + bx, y + 1, z + bz, x + ax, y + 1, z + az], layer, L);
      out2(solid, [x + bx, y, z + bz, x + ax, y, z + az, x + ax, y + 1, z + az, x + bx, y + 1, z + bz], layer, L);
    }
  }
  // water: the top sits a little low unless there is more water above it
  const W = T.water;
  for (let y = 0; y < H; y++) for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++){
    const b = v[pidx(x, y, z)]; if (!LIQUID[b]) continue;
    const up = at(x, y + 1, z), top = LIQUID[up] ? 1 : .875, l = .25 + .75 * sk(x, y, z);
    for (let f = 0; f < 6; f++){
      const d = f >> 1, s = f & 1 ? -1 : 1, nx = x + AX[d][0] * s, ny = y + AX[d][1] * s, nz = z + AX[d][2] * s, n = at(nx, ny, nz);
      if (LIQUID[n] || (OPAQUE[n] && !(f === 2 && top < 1))) continue;
      if (f === 2 && LIQUID[up]) continue;
      const L = SHADE[f] * l, y1 = y + top, P =
        f === 0 ? [x + 1, y, z + 1, x + 1, y, z, x + 1, y1, z, x + 1, y1, z + 1] : f === 1 ? [x, y, z, x, y, z + 1, x, y1, z + 1, x, y1, z] :
        f === 2 ? [x, y1, z + 1, x + 1, y1, z + 1, x + 1, y1, z, x, y1, z] : f === 3 ? [x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z + 1] :
        f === 4 ? [x, y, z + 1, x + 1, y, z + 1, x + 1, y1, z + 1, x, y1, z + 1] : [x + 1, y, z, x, y, z, x, y1, z, x + 1, y1, z];
      const uv = d === 1 ? [P[0], P[2], P[3], P[5], P[6], P[8], P[9], P[11]] : [P[0] + P[2], -P[1], P[3] + P[5], -P[4], P[6] + P[8], -P[7], P[9] + P[11], -P[10]];
      clear.quad(P, uv, W, [L, L, L, L], false);
    }
  }
  return {solid:solid.out(), clear:clear.out()};
}
function out2(m, P, layer, L){ m.quad(P, [0, 0, 1, 0, 1, -1, 0, -1], layer, L, false); }
