/* seeded simplex noise, 2D and 3D (after Stefan Gustavson's public domain version), plus layered "fractal" noise */
export function makeNoise(seed){
  const p = new Uint8Array(512), perm = new Uint8Array(256);
  let s = (seed >>> 0) || 1; const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--){ const j = Math.floor(r() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const G3 = new Float32Array([1,1,0, -1,1,0, 1,-1,0, -1,-1,0, 1,0,1, -1,0,1, 1,0,-1, -1,0,-1, 0,1,1, 0,-1,1, 0,1,-1, 0,-1,-1]);
  const F2 = .5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6, F3 = 1 / 3, G3c = 1 / 6;
  function n2(x, y){
    const s2 = (x + y) * F2, i = Math.floor(x + s2), j = Math.floor(y + s2), t = (i + j) * G2, x0 = x - i + t, y0 = y - j + t;
    const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1, x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2, ii = i & 255, jj = j & 255;
    let n = 0, t0 = .5 - x0 * x0 - y0 * y0, t1 = .5 - x1 * x1 - y1 * y1, t2 = .5 - x2 * x2 - y2 * y2;
    if (t0 > 0){ const g = (p[ii + p[jj]] % 12) * 3; t0 *= t0; n += t0 * t0 * (G3[g] * x0 + G3[g + 1] * y0); }
    if (t1 > 0){ const g = (p[ii + i1 + p[jj + j1]] % 12) * 3; t1 *= t1; n += t1 * t1 * (G3[g] * x1 + G3[g + 1] * y1); }
    if (t2 > 0){ const g = (p[ii + 1 + p[jj + 1]] % 12) * 3; t2 *= t2; n += t2 * t2 * (G3[g] * x2 + G3[g + 1] * y2); }
    return 70 * n;
  }
  function n3(x, y, z){
    const s3 = (x + y + z) * F3, i = Math.floor(x + s3), j = Math.floor(y + s3), k = Math.floor(z + s3), t = (i + j + k) * G3c;
    const x0 = x - i + t, y0 = y - j + t, z0 = z - k + t; let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0){ if (y0 >= z0){ i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } else if (x0 >= z0){ i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; } else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; } }
    else { if (y0 < z0){ i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; } else if (x0 < z0){ i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; } else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } }
    const x1 = x0 - i1 + G3c, y1 = y0 - j1 + G3c, z1 = z0 - k1 + G3c, x2 = x0 - i2 + 2 * G3c, y2 = y0 - j2 + 2 * G3c, z2 = z0 - k2 + 2 * G3c, x3 = x0 - 1 + .5, y3 = y0 - 1 + .5, z3 = z0 - 1 + .5;
    const ii = i & 255, jj = j & 255, kk = k & 255; let n = 0, g;
    let t0 = .6 - x0 * x0 - y0 * y0 - z0 * z0; if (t0 > 0){ g = (p[ii + p[jj + p[kk]]] % 12) * 3; t0 *= t0; n += t0 * t0 * (G3[g] * x0 + G3[g + 1] * y0 + G3[g + 2] * z0); }
    let t1 = .6 - x1 * x1 - y1 * y1 - z1 * z1; if (t1 > 0){ g = (p[ii + i1 + p[jj + j1 + p[kk + k1]]] % 12) * 3; t1 *= t1; n += t1 * t1 * (G3[g] * x1 + G3[g + 1] * y1 + G3[g + 2] * z1); }
    let t2 = .6 - x2 * x2 - y2 * y2 - z2 * z2; if (t2 > 0){ g = (p[ii + i2 + p[jj + j2 + p[kk + k2]]] % 12) * 3; t2 *= t2; n += t2 * t2 * (G3[g] * x2 + G3[g + 1] * y2 + G3[g + 2] * z2); }
    let t3 = .6 - x3 * x3 - y3 * y3 - z3 * z3; if (t3 > 0){ g = (p[ii + 1 + p[jj + 1 + p[kk + 1]]] % 12) * 3; t3 *= t3; n += t3 * t3 * (G3[g] * x3 + G3[g + 1] * y3 + G3[g + 2] * z3); }
    return 32 * n;
  }
  const fbm2 = (x, y, oct, lac = 2, gain = .5) => { let a = 1, f = 1, s = 0, m = 0; for (let o = 0; o < oct; o++){ s += a * n2(x * f, y * f); m += a; a *= gain; f *= lac; } return s / m; };
  return {n2, n3, fbm2};
}
/* a repeatable 0..1 number for a spot in the world */
export const hash3 = (x, y, z, s) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(s, 1274126177); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
