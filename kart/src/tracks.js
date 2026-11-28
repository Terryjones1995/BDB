// Track catalogue (Agent 1 — World). Pure data + a little path maths, no three.js, so menus can import it cheaply.
//
// Each entry: { id, name, theme, difficulty: 'normal'|'hard', blurb, color, ... layout, features, look, env }.
// Layout is either `cp` (Catmull-Rom control points [x, y, z], x/z multiplied by `scale`) or `path` (turtle
// commands, see buildPath). Feature positions (`at`) are fractions along that list: CP index + fraction for `cp`
// layouts, command index + fraction for `path` layouts (3.5 = halfway through command 3).
// createTrack(scene, renderer, id) in track.js builds any of them; `palm` is the original Palm Cove Circuit.

const D2R = Math.PI / 180;

/**
 * Turtle path -> closed loop.
 *   ['S', length, opts]            straight
 *   ['L', degrees, radius, opts]   arc to the driver's left (heading increases)
 *   ['R', degrees, radius, opts]   arc to the driver's right
 * opts: { y } road height at the END of the command (heights between keys ease smoothly; the loop starts at y0),
 *       { free: true } on exactly two non-parallel straights whose lengths are solved so the loop closes.
 * Starts at the origin heading +Z (the start/finish line). Turns must add up to ±360°.
 * Returns { points: [[x, y, z], ...] (no duplicate end point), length, at(f) -> [x, y, z], segs, headingError }.
 */
export function buildPath(path, { y0 = 0, step = 9 } = {}) {
  const cmds = path.map((c) => {
    const [k, a, b, o] = c;
    if (k === 'S') return { k, len: a, opts: b || {} };
    return { k, deg: a, r: b, len: Math.abs(a) * D2R * b, opts: o || {} };
  });
  // heading closure: nudge the last turn so the loop closes exactly (validator reports the error)
  let turn = 0;
  for (const c of cmds) if (c.k !== 'S') turn += (c.k === 'L' ? 1 : -1) * c.deg;
  const target = turn >= 0 ? 360 : -360;
  const headingError = turn - target;
  if (Math.abs(headingError) > 1e-9) {
    for (let i = cmds.length - 1; i >= 0; i--) {
      const c = cmds[i];
      if (c.k === 'S') continue;
      c.deg -= (c.k === 'L' ? 1 : -1) * headingError;
      c.len = Math.abs(c.deg) * D2R * c.r;
      break;
    }
  }
  // headings at the start of each command
  let h = 0;
  for (const c of cmds) {
    c.h0 = h;
    if (c.k !== 'S') h += (c.k === 'L' ? 1 : -1) * c.deg * D2R;
    c.h1 = h;
  }
  const endOf = () => {
    let x = 0, z = 0;
    for (const c of cmds) {
      if (c.k === 'S') { x += Math.sin(c.h0) * c.len; z += Math.cos(c.h0) * c.len; continue; }
      const s = c.k === 'L' ? 1 : -1;
      // exact arc chord
      x += s * c.r * (Math.cos(c.h0) - Math.cos(c.h1));
      z += s * c.r * (Math.sin(c.h1) - Math.sin(c.h0));
    }
    return [x, z];
  };
  const free = cmds.filter((c) => c.k === 'S' && c.opts.free);
  if (free.length === 2) {
    const [ex, ez] = endOf();
    const a1 = [Math.sin(free[0].h0), Math.cos(free[0].h0)], a2 = [Math.sin(free[1].h0), Math.cos(free[1].h0)];
    const det = a1[0] * a2[1] - a1[1] * a2[0];
    if (Math.abs(det) > 1e-6) {
      const da = (-ex * a2[1] + ez * a2[0]) / det;
      const db = (-a1[0] * ez + a1[1] * ex) / det;
      free[0].len += da; free[1].len += db;
    }
  }
  // distances + height keys
  let d = 0;
  const keys = [[0, y0]];
  for (const c of cmds) { c.d0 = d; d += c.len; c.d1 = d; if (typeof c.opts.y === 'number') keys.push([d, c.opts.y]); }
  const length = d;
  keys.push([length, y0]);
  const yAt = (s) => {
    for (let k = 1; k < keys.length; k++) {
      if (s <= keys[k][0] || k === keys.length - 1) {
        const [da, ya] = keys[k - 1], [db, yb] = keys[k];
        const f = db > da ? Math.min(1, Math.max(0, (s - da) / (db - da))) : 1;
        return ya + (yb - ya) * (0.5 - 0.5 * Math.cos(Math.PI * f));
      }
    }
    return y0;
  };
  // walk each command
  const pointIn = (c, s) => {   // s = distance into command
    let x = c.x0, z = c.z0;
    if (c.k === 'S') { x += Math.sin(c.h0) * s; z += Math.cos(c.h0) * s; }
    else {
      const sg = c.k === 'L' ? 1 : -1;
      const hh = c.h0 + sg * s / c.r;
      x += sg * c.r * (Math.cos(c.h0) - Math.cos(hh));
      z += sg * c.r * (Math.sin(hh) - Math.sin(c.h0));
    }
    return [x, yAt(c.d0 + s), z];
  };
  let x = 0, z = 0;
  for (const c of cmds) {
    c.x0 = x; c.z0 = z;
    const e = pointIn(c, c.len);
    x = e[0]; z = e[2];
  }
  const points = [];
  for (const c of cmds) {
    const st = c.k === 'S' ? step : Math.min(step, Math.max(3, c.r / 3));
    const n = Math.max(1, Math.round(c.len / st));
    for (let k = 0; k < n; k++) points.push(pointIn(c, (k / n) * c.len));
  }
  const at = (f) => {
    const i = Math.max(0, Math.min(cmds.length - 1, Math.floor(f)));
    const c = cmds[i];
    return pointIn(c, Math.min(1, Math.max(0, f - i)) * c.len);
  };
  return { points, length, at, segs: cmds, headingError, closure: [x, z] };
}

/** Layout points for a track def (cp layouts are scaled; path layouts built). Cached on the def. */
export function trackPoints(def) {
  if (def._pts) return def._pts;
  let pts, at;
  if (def.path) {
    const p = buildPath(def.path, { y0: def.y0 || 0 });
    pts = p.points;
    at = p.at;
  } else {
    const S = def.scale || 1;
    pts = def.cp.map(([x, y, z]) => [x * S, y, z * S]);
    at = (cpf) => {
      const n = def.cp.length, i0 = Math.floor(cpf) % n, i1 = (i0 + 1) % n, f = cpf - Math.floor(cpf);
      return [(def.cp[i0][0] + (def.cp[i1][0] - def.cp[i0][0]) * f) * S, 0, (def.cp[i0][2] + (def.cp[i1][2] - def.cp[i0][2]) * f) * S];
    };
  }
  Object.defineProperty(def, '_pts', { value: { points: pts, at }, enumerable: false });
  return def._pts;
}

/** River polyline [[x, z], ...] for defs with `river: { through: [f, ...], width }`: straight runs through the
 *  given layout fractions (the course bridges it there), gently meandering, extended far past both ends. */
export function riverPolyline(def) {
  const R = def.river;
  if (!R) return null;
  if (R.points) return R.points;
  const { at } = trackPoints(def);
  const pts = R.through.map((f) => { const p = at(f); return [p[0], p[2]]; });
  const n = pts.length, ext = R.extend || 1100;
  const unit = (a, b) => { const dx = a[0] - b[0], dz = a[1] - b[1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
  const d0 = unit(pts[0], pts[1]), d1 = unit(pts[n - 1], pts[n - 2]);
  const out = [];
  const run = (a, b, wiggle) => {   // a -> b with sideways meanders (excluding b)
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.round(l / 120));
    const px = -(b[1] - a[1]) / (l || 1), pz = (b[0] - a[0]) / (l || 1);
    for (let i = 0; i < k; i++) {
      const f = i / k, w = i === 0 ? 0 : wiggle * Math.sin(i * 1.7);
      out.push([a[0] + (b[0] - a[0]) * f + px * w, a[1] + (b[1] - a[1]) * f + pz * w]);
    }
  };
  const start = [pts[0][0] + d0[0] * ext, pts[0][1] + d0[1] * ext];
  const end = [pts[n - 1][0] + d1[0] * ext, pts[n - 1][1] + d1[1] * ext];
  run(start, pts[0], 40);
  for (let i = 0; i < n - 1; i++) run(pts[i], pts[i + 1], 28);
  run(pts[n - 1], end, 40);
  out.push(end);
  return out;
}

/** Normalised outline for menu previews: [{x, y}] in 0..1 (y down = +Z), aspect kept. */
export function trackOutline(id, n = 96) {
  const def = getTrackDef(id);
  const { points } = trackPoints(def);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, , z] of points) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  const span = Math.max(maxX - minX, maxZ - minZ) || 1;
  const out = [];
  for (let k = 0; k < n; k++) {
    const [x, , z] = points[Math.floor((k / n) * points.length)];
    // same orientation as the in-game HUD minimap (screen x = world x, screen y = world z)
    out.push({ x: 0.5 + (x - (minX + maxX) / 2) / span, y: 0.5 + (z - (minZ + maxZ) / 2) / span });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------
export const TRACKS = [
  // ---------------------------------------------------------------- Palm Cove Circuit (the original)
  {
    id: 'palm',
    name: 'Palm Cove Circuit',
    theme: 'coast',
    difficulty: 'normal',
    blurb: 'Sunny island loop with a lagoon bridge.',
    color: 0x1e88e5,
    samples: 2000,
    scale: 1.15,
    halfWidth: 12,
    // Control points [x, y, z] (x/z scaled). Race direction = list order. CP0 = start/finish line.
    cp: [
      [0, 0, -60],      // 0  start / finish (main straight, heading +Z)
      [0, 0, 60],       // 1
      [2, 0, 175],      // 2
      [22, 1, 258],     // 3  big sweeping left
      [80, 3, 302],     // 4
      [160, 5, 296],    // 5
      [230, 6, 252],    // 6  sweeping right
      [262, 6, 182],    // 7
      [238, 5, 118],    // 8  S-bend
      [292, 4, 64],     // 9
      [258, 4, 4],      // 10
      [296, 6, -62],    // 11 climb to the bridge
      [304, 10, -140],  // 12 bridge over the lagoon
      [284, 10, -212],  // 13
      [226, 6, -262],   // 14 downhill jump
      [150, 3, -284],   // 15
      [66, 1, -300],    // 16
      [-20, 0, -318],   // 17 into the hairpin
      [-96, 0, -322],   // 18
      [-128, 0, -292],  // 19 hairpin apex
      [-106, 0, -256],  // 20
      [-50, 0, -236],   // 21
      [-8, 0, -196],    // 22
      [0, 0, -140],     // 23
    ],
    lake: { x: 405, z: -205, r: 125 },   // lagoon crossed by the bridge (world coords)
    waterLevel: -1,
    pads: [
      { at: 10.45, pads: [[0, -6], [1, 0], [2, 6]] },          // exit of the S-bend (staggered trio)
      { at: 20.55, pads: [[0, -4.5], [0, 4.5], [2, 0]] },      // hairpin exit (pair, then centre)
      { at: 4.15, pads: [[0, 'race'], [1, 'race']] },          // lined up before the sweeper jump
    ],
    ramps: [
      { at: 14.35 },                    // downhill after the bridge
      { at: 4.65, hw: 9, h: 1.5 },      // top of the big sweeper
    ],
    itemRows: [1.25, 6.5, 9.2, 12.5, 16.4, 21.6],
    itemLats: [-8, -4, 0, 4, 8],
    look: {},
    env: { kind: 'coast' },
  },

  // ---------------------------------------------------------------- Dune Canyon (desert)
  {
    id: 'dune',
    name: 'Dune Canyon',
    theme: 'desert',
    difficulty: 'normal',
    blurb: 'Fast sweepers between red mesas, with a canyon jump.',
    color: 0xf08a24,
    halfWidth: 12,
    path: [
      ['S', 280],                 // 0 start straight
      ['L', 70, 170],             // 1 sweeper
      ['S', 70],                  // 2
      ['R', 50, 200],             // 3
      ['L', 65, 150],             // 4
      ['S', 180, { free: true }], // 5
      ['L', 80, 130],             // 6
      ['S', 150],                 // 7 canyon entry
      ['R', 60, 160],             // 8 canyon
      ['L', 45, 180],             // 9 canyon
      ['S', 220],                 // 10 jump straight (ramp + gap)
      ['L', 95, 120],             // 11
      ['S', 120],                 // 12
      ['R', 70, 140],             // 13
      ['L', 60, 110],             // 14
      ['S', 200, { free: true }], // 15
      ['L', 85, 150],             // 16
      ['S', 120],                 // 17
      ['R', 35, 220],             // 18
      ['L', 75, 160],             // 19
      ['S', 160],                 // 20
    ],
    gaps: [{ at: 10.55, len: 22, depth: 7 }],   // canyon crevasse: full-width ramp, jump it or drop into the sand
    pads: [
      { at: 2.15, pads: [[0, 'race'], [1, 'race']] },
      { at: 12.3, pads: [[0, -5], [0, 5], [2, 0]] },
      { at: 17.15, pads: [[0, -6], [1, 0], [2, 6]] },
      { at: 20.25, pads: [[0, 0]] },
    ],
    ramps: [
      { at: 7.45, hw: 9, h: 1.6 },
      { at: 15.55, hw: 9, h: 1.5 },
    ],
    itemRows: [1.2, 4.55, 7.15, 9.55, 12.6, 14.8, 17.5, 19.8],
    look: {
      offroad: 'sand',
      offroadColors: { base: '#e9c48a', specks: ['#dbb377', '#f2d29f', '#d1a86c', '#efcf98'], ripples: 'rgba(170,110,60,0.16)' },
      asphalt: { base: '#6a625c', specks: ['#5a524c', '#7a716a', '#857b72', '#4e4842', '#6e655e'], centre: '#ffffff', edge: '#fff6e0' },
      curb: ['#e8642f', '#fbf3e3'],
      barrier: [
        { bg: '#f08a24', fg: '#ffffff', text: 'DUNE' },
        { bg: '#ffffff', fg: '#c8522a', text: 'CANYON' },
        { bg: '#c8522a', fg: '#ffe9b8', text: 'BDB' },
        { bg: '#ffd21f', fg: '#8a3a12', text: '★ GO! ★' },
      ],
      rail: ['#fbf3e3', '#e8642f'],
      tires: [0xf08a24, 0xfbf3e3, 0x8a3a12, 0xfbf3e3],
      wallTop: 0xfbf3e3,
      ramp: ['#e8642f', '#fff1d6', '#ffd21f'],
      rampSide: 0xc8522a,
      gantry: { stripeA: '#ffffff', stripeB: '#f08a24', beam: 0xc8522a, banner: { top: '#ff9a3d', bottom: '#d2551e', stroke: '#6a2408' } },
      gapRock: { base: '#a85a34' },
    },
    env: {
      kind: 'desert',
      sky: { top: 0x2f7ad8, horizon: 0xf8dfb4, bottom: 0xeacb98, sun: 0xfff1cc },
      sunDir: [0.45, 0.7, -0.35],
      fog: [450, 1900],
      hemi: [0xfff0d8, 0xc98a52, 1.2],
      sunLight: [0xfff0d0, 3.0],
      envGround: 0xd8a466,
      ground: { a: 0xe2b77a, b: 0xedc995, high: 0xc98450, rock: 0xb8693d, near: 0xe8c08a, low: 0xd9a86a, bands: [0xc0602f, 0xf2c48a, 0x9a4424, 0xe08d50, 0xf7dcae, 0xb5552e] },
      skirt: 0xe2b77a,
      baseLevel: -6,
      corridor: [3, 26],
      canyon: [[6.6, 11.3], [16.3, 18.7]],
      canyonH: 34,
      arch: { at: 8.5 },
      stands: [{ from: -150, to: 70, side: 1, tiers: 8 }, { from: -70, to: 45, side: -1, tiers: 6, setback: 10 }],   // setback: intro orbit clears the roof
      ring: { shape: 'mesa', colors: [0xc8693a, 0xe08d50, 0xb5552e, 0xf0b073], rad: 170, hgt: 300, count: 26, haze: 0.35 },
      clouds: { count: 12, color: 0xffffff, emissive: 0xb8a088, y: 240 },
      seatCols: [0xf08a24, 0xfbf3e3, 0xc8522a, 0xffd21f],
      roofCols: [0xf08a24, 0xfbf3e3],
      flagCols: [0xf08a24, 0xffd21f, 0xc8522a, 0xffffff, 0x2f7ad8],
    },
  },

  // ---------------------------------------------------------------- Frostpeak Pass (snow)
  {
    id: 'frost',
    name: 'Frostpeak Pass',
    theme: 'snow',
    difficulty: 'normal',
    blurb: 'Switchbacks up an icy mountain and a fast run back down.',
    color: 0x7fd0ff,
    halfWidth: 12,
    path: [
      ['S', 180],                          // 0 start straight
      ['L', 60, 140],                      // 1
      ['S', 110, { y: 6 }],                // 2 begin climb
      ['R', 40, 160, { y: 12 }],           // 3
      ['S', 110, { y: 22 }],               // 4
      ['L', 170, 42, { y: 28 }],           // 5 switchback 1
      ['S', 150, { y: 40 }],               // 6
      ['R', 170, 42, { y: 46 }],           // 7 switchback 2
      ['S', 120, { y: 56 }],               // 8
      ['L', 90, 90, { y: 62 }],            // 9 summit
      ['S', 130, { y: 62 }],               // 10 summit ridge
      ['L', 70, 120, { y: 56 }],           // 11
      ['S', 300, { y: 34, free: true }],   // 12 fast descent
      ['R', 60, 110, { y: 28 }],           // 13
      ['L', 120, 90, { y: 20 }],           // 14
      ['S', 160, { y: 10 }],               // 15
      ['L', 60, 150, { y: 4 }],            // 16
      ['S', 150, { y: 0, free: true }],    // 17
      ['L', 60, 120],                      // 18
      ['S', 120],                          // 19
    ],
    pads: [
      { at: 6.15, pads: [[0, -4.5], [0, 4.5]] },
      { at: 8.2, pads: [[0, 'race'], [1, 'race']] },
      { at: 12.15, pads: [[0, -6], [1, 0], [2, 6]] },
      { at: 17.3, pads: [[0, 0], [2, 0]] },
    ],
    ramps: [
      { at: 10.5, hw: 10, h: 1.8 },     // summit ridge
      { at: 12.6 },                     // fast descent
      { at: 17.7, hw: 9, h: 1.5 },
    ],
    itemRows: [1.3, 4.5, 6.6, 9.6, 12.4, 14.7, 16.5, 18.5],
    look: {
      offroad: 'snow',
      asphalt: { base: '#4f5866', specks: ['#434b57', '#5f6876', '#6b7482', '#3a414c', '#56606d'], centre: '#9fd8ff', edge: '#ffffff', lane: 'rgba(230,245,255,0.5)' },
      curb: ['#2f7fe0', '#f4f9ff'],
      barrier: [
        { bg: '#2f7fe0', fg: '#ffffff', text: 'FROST' },
        { bg: '#ffffff', fg: '#2f7fe0', text: 'PEAK' },
        { bg: '#7fd0ff', fg: '#1b3a66', text: 'BDB' },
        { bg: '#1b3a66', fg: '#ffffff', text: '★ GO! ★' },
      ],
      rail: ['#f4f9ff', '#2f7fe0'],
      tires: [0x2f7fe0, 0xf4f9ff, 0x7fd0ff, 0xf4f9ff],
      wallTop: 0xf4f9ff,
      ramp: ['#2f7fe0', '#e8f6ff', '#ffd21f'],
      rampSide: 0x2f7fe0,
      gantry: { stripeA: '#ffffff', stripeB: '#2f7fe0', beam: 0x1b4f9a, banner: { top: '#4fa3ff', bottom: '#1b4f9a', stroke: '#0b2448', band: '#bfe8ff' } },
      pier: 0xb8c4d4,
    },
    env: {
      kind: 'snow',
      sky: { top: 0x4f82c8, horizon: 0xdde9f5, bottom: 0xc5d6e8, sun: 0xfff6e8 },
      sunDir: [0.3, 0.55, -0.6],
      fog: [320, 1500],
      hemi: [0xe2eeff, 0x9fb2c8, 1.35],
      sunLight: [0xfff4ea, 2.4],
      envGround: 0xe8f0f8,
      ground: { a: 0xeef4fb, b: 0xf8fbff, high: 0xe4edf7, rock: 0x7d8696, rockFrom: 0.38, near: 0xf2f7fd, low: 0xdfe8f2 },
      skirt: 0xe6eef7,
      baseLevel: -8,
      corridor: [4, 50],
      peak: { at: 9.5, lat: -170, r: 210, h: 140 },
      stands: [{ from: -150, to: 70, side: 1, tiers: 8 }, { from: -70, to: 45, side: -1, tiers: 6, setback: 10 }],   // setback: intro orbit clears the roof
      ring: { colors: [0x8d9db2, 0xb9c7d8, 0xffffff], snowLine0: 0.25, snowLine: 0.45, rad: 170, hgt: 380, count: 24, haze: 0.28 },
      clouds: { count: 30, color: 0xf2f6fb, emissive: 0x8a96a8, y: 170 },
      seatCols: [0x2f7fe0, 0xf4f9ff, 0x7fd0ff, 0x1b3a66],
      roofCols: [0x2f7fe0, 0xf4f9ff],
      flagCols: [0x2f7fe0, 0x7fd0ff, 0xffffff, 0xe8322f, 0x1b3a66],
    },
  },

  // ---------------------------------------------------------------- Neon City (night street circuit)
  {
    id: 'neon',
    name: 'Neon City',
    theme: 'city',
    difficulty: 'normal',
    blurb: 'Night street circuit: square corners and a huge straight.',
    color: 0xff3df0,
    halfWidth: 12,
    path: [
      ['S', 340],                 // 0 main straight (start line mid-straight)
      ['R', 90, 26],              // 1
      ['S', 220],                 // 2
      ['R', 90, 26],              // 3
      ['S', 160],                 // 4
      ['L', 90, 24],              // 5
      ['S', 170, { free: true }], // 6
      ['L', 90, 24],              // 7
      ['S', 160],                 // 8
      ['R', 90, 26],              // 9
      ['S', 170],                 // 10
      ['R', 90, 30],              // 11
      ['S', 660, { free: true }], // 12 back straight
      ['R', 90, 26],              // 13
      ['S', 170],                 // 14
      ['L', 90, 24],              // 15
      ['S', 110],                 // 16
      ['R', 90, 24],              // 17
      ['S', 220],                 // 18
      ['R', 90, 26],              // 19
      ['S', 110],                 // 20
      ['L', 90, 24],              // 21
      ['S', 150],                 // 22
      ['R', 90, 26],              // 23
      ['S', 300],                 // 24
    ],
    pads: [
      { at: 4.15, pads: [[0, 'race']] },
      { at: 12.2, pads: [[0, -6], [1, 0], [2, 6]] },
      { at: 18.2, pads: [[0, -4.5], [0, 4.5]] },
      { at: 22.2, pads: [[0, 'race'], [1, 'race']] },
    ],
    ramps: [
      { at: 8.5, hw: 9, h: 1.5 },
      { at: 12.65, hw: 10, h: 1.7 },
    ],
    itemRows: [0.6, 2.5, 6.4, 8.65, 12.4, 14.5, 18.6, 22.6],
    look: {
      offroad: 'pavement',
      wallMargin: 3.5,
      noTires: true,
      asphalt: { base: '#2c2f38', specks: ['#24272f', '#353945', '#3d414d', '#1f2128', '#30343e'], blotchDark: 'rgba(10,10,14,0.2)', blotchLight: 'rgba(70,74,90,0.12)', centre: '#ffffff', edge: '#e8e8f0', lane: 'rgba(220,220,235,0.45)' },
      roadRoughness: 0.55,
      curb: ['#ff3df0', '#1b1d2a'],
      barrier: [
        { bg: '#12061f', fg: '#ff3df0', text: 'NEON' },
        { bg: '#06121f', fg: '#3dfcff', text: 'CITY' },
        { bg: '#1a1206', fg: '#ffe23d', text: 'KARTS' },
        { bg: '#061a0c', fg: '#5dff6a', text: '★ GO! ★' },
      ],
      barrierGlow: 1.6,
      rail: ['#1b1d2a', '#3dfcff'],
      wallTop: 0x2a2d3a,
      ramp: ['#ff3df0', '#1b1d2a', '#3dfcff'],
      rampSide: 0x3dfcff,
      gantry: { stripeA: '#1b1d2a', stripeB: '#ff3df0', beam: 0x1b1d2a, banner: { top: '#ff3df0', bottom: '#7a1a8a', stroke: '#2a0638', band: '#3dfcff' }, glow: 1.2 },
    },
    env: {
      kind: 'city',
      stars: true,
      sky: { top: 0x070a1e, horizon: 0x3a2457, bottom: 0x14102a, sun: 0xcfe0ff },
      sunDir: [-0.35, 0.6, 0.5],
      fog: [260, 1250],
      fogColor: 0x1d1735,
      hemi: [0x6a78c0, 0x2a2238, 1.0],
      sunLight: [0xb8c8ff, 1.15],
      envGround: 0x14121e,
      envIntensity: 0.45,
      ground: { a: 0x2a2d36, b: 0x31343e, high: 0x2a2d36, rock: 0x2a2d36, near: 0x3a3e4a, low: 0x2a2d36 },
      skirt: 0x22242c,
      baseLevel: -2,
      margin: 260,
      flags: false,
      ring: { shape: 'tower', colors: [0x232845, 0x2c2a4a, 0x1d2238], rad: 120, hgt: 260, count: 60, haze: 0.15, emissive: 0x0a0a18 },
      seatCols: [0xff3df0, 0x1b1d2a, 0x3dfcff, 0xffe23d],
      roofCols: [0x1b1d2a, 0xff3df0],
      standWall: 0x3a3e4a,
      standBack: 0x2a2d3a,
      stands: [{ from: -150, to: 70, side: 1, tiers: 6 }, { from: -70, to: 45, side: -1, tiers: 5, setback: 14 }],   // setback: intro orbit clears the roof
    },
  },

  // ---------------------------------------------------------------- Jungle Temple
  {
    id: 'jungle',
    name: 'Jungle Temple',
    theme: 'jungle',
    difficulty: 'normal',
    blurb: 'Twisty ruins run with bridges over the river.',
    color: 0x3fbf5a,
    halfWidth: 12,
    path: [
      ['S', 340],                 // 0 start
      ['L', 70, 75],              // 1
      ['R', 120, 60],             // 2
      ['L', 80, 67],              // 3
      ['S', 290],                 // 4 bridge 1
      ['L', 110, 83],             // 5
      ['R', 60, 67],              // 6
      ['L', 90, 75],              // 7
      ['S', 130, { free: true }], // 8 temple straight
      ['R', 40, 63],              // 9 temple esses
      ['L', 80, 63],              // 10
      ['R', 40, 63],              // 11
      ['S', 130],                 // 12
      ['R', 70, 60],              // 13
      ['L', 100, 67],             // 14
      ['R', 50, 90],              // 15
      ['L', 80, 75],              // 16
      ['S', 300],                 // 17 bridge 2
      ['R', 90, 67],              // 18
      ['L', 120, 75],             // 19
      ['S', 280, { free: true }], // 20
      ['L', 60, 90],              // 21
      ['R', 50, 75],              // 22
      ['L', 90, 90],              // 23
      ['S', 260],                 // 24
    ],
    river: { through: [4.5, 17.5], width: 46 },
    waterLevel: -1.5,
    pads: [
      { at: 3.4, pads: [[0, 'race'], [1, 'race']] },
      { at: 8.2, pads: [[0, -5], [0, 5], [2, 0]] },
      { at: 12.2, pads: [[0, -6], [1, 0], [2, 6]] },
      { at: 20.2, pads: [[0, 'race']] },
      { at: 24.3, pads: [[0, -5], [1, 5]] },
    ],
    ramps: [
      { at: 12.6, hw: 10 },
      { at: 20.6, hw: 9, h: 1.6 },
    ],
    itemRows: [1.2, 4.2, 7.5, 10.5, 13.6, 17.2, 19.6, 22.5],
    look: {
      offroadColors: { base: '#3f8030', specks: ['#336f26', '#4c9038', '#3a7a2b', '#56983f', '#2c6522'], flowers: ['#ff3d6d', '#ffd84a', '#ff8ad8'] },   // shaded jungle grass
      asphalt: { base: '#5d5a52', specks: ['#4f4c45', '#6c6960', '#78756b', '#45423c', '#625f57'], centre: '#f2e8c8', edge: '#f2e8c8' },
      curb: ['#e8b62f', '#3a6b2a'],
      barrier: [
        { bg: '#2f8f3a', fg: '#ffe36b', text: 'JUNGLE' },
        { bg: '#ffe36b', fg: '#2f6b2a', text: 'TEMPLE' },
        { bg: '#c8522a', fg: '#ffffff', text: 'BDB' },
        { bg: '#ffffff', fg: '#2f8f3a', text: '★ GO! ★' },
      ],
      rail: ['#f2ead2', '#8a5a2a'],
      tires: [0x2f8f3a, 0xf2ead2, 0xe8b62f, 0xf2ead2],
      wallTop: 0xd8d0b6,
      ramp: ['#2f8f3a', '#f2ead2', '#ffd21f'],
      rampSide: 0x8a5a2a,
      gantry: { stripeA: '#f2ead2', stripeB: '#2f8f3a', beam: 0x2f6b2a, banner: { top: '#4fae45', bottom: '#2a6b2a', stroke: '#123a12' } },
      pier: 0xa8a48c,
    },
    env: {
      kind: 'jungle',
      sky: { top: 0x6f9fb0, horizon: 0xeadfae, bottom: 0xcfc596, sun: 0xffe0a0 },   // warm, hazy, humid
      sunDir: [0.4, 0.68, 0.45],
      fog: [140, 900],
      fogColor: 0xdcd3a2,
      hemi: [0xfff0c4, 0x4a6428, 1.15],
      sunLight: [0xffd99a, 2.5],
      envGround: 0x3f7a2e,
      ground: { a: 0x2c6a24, b: 0x3a7c2c, high: 0x22581f, rock: 0x6f7a5a, near: 0x3a7c2c, low: 0x7a6a3a, lowFrom: 1.0, lowTo: -1.5 },   // shaded forest floor
      water: { deep: 0x1d6b5a, shallow: 0x52b39a, sky: 0xcfe8d0 },
      baseLevel: -8,
      corridor: [4, 50],
      temple: { at: 8.5, lat: 95 },
      gates: [8.3, 12.4],
      ruins: [7.5, 13],
      stands: [{ from: -150, to: 70, side: 1, tiers: 8 }, { from: -70, to: 45, side: -1, tiers: 6, setback: 10 }],   // setback: intro orbit clears the roof
      ring: { colors: [0x2f7a3a, 0x3f8a45, 0x5a9a55], snowLine0: 0.6, snowLine: 0.95, rad: 210, hgt: 170, count: 26, haze: 0.4 },
      clouds: { count: 40, color: 0xffffff, emissive: 0xa8b098, y: 150 },
      seatCols: [0x2f8f3a, 0xffe36b, 0xc8522a, 0xf2ead2],
      roofCols: [0x2f8f3a, 0xf2ead2],
      flagCols: [0x2f8f3a, 0xffe36b, 0xc8522a, 0xffffff, 0xff7a1a],
    },
  },

  // ---------------------------------------------------------------- Volcano Gauntlet (HARD)
  {
    id: 'volcano',
    name: 'Volcano Gauntlet',
    theme: 'volcano',
    difficulty: 'hard',
    blurb: 'HARD: narrow lava-lined road, hairpins and big jumps.',
    color: 0xff4a1a,
    halfWidth: 8.5,
    path: [
      ['S', 240],                          // 0 start
      ['L', 60, 60],                       // 1
      ['S', 120, { y: 6 }],                // 2
      ['R', 30, 40],                       // 3
      ['S', 140, { y: 16 }],               // 4 climb
      ['L', 150, 17, { y: 20 }],           // 5 hairpin 1
      ['S', 160, { y: 32 }],               // 6
      ['R', 150, 17, { y: 36 }],           // 7 hairpin 2
      ['S', 120, { y: 46 }],               // 8
      ['L', 150, 17, { y: 50 }],           // 9 hairpin 3
      ['S', 140, { y: 60 }],               // 10
      ['R', 150, 17, { y: 64 }],           // 11 hairpin 4
      ['S', 100, { y: 68 }],               // 12
      ['R', 40, 28],                       // 13 chicane
      ['L', 80, 28],                       // 14
      ['R', 40, 28, { y: 70 }],            // 15
      ['L', 60, 50],                       // 16
      ['S', 140, { y: 72 }],               // 17 crater rim (big jump)
      ['L', 90, 45, { y: 70 }],            // 18
      ['S', 160, { y: 60, free: true }],   // 19 steep descent
      ['R', 30, 26],                       // 20 chicane
      ['L', 60, 26],                       // 21
      ['R', 30, 26, { y: 54 }],            // 22
      ['S', 160, { y: 44 }],               // 23
      ['R', 150, 20, { y: 38 }],           // 24 switchback
      ['S', 70, { y: 32 }],                // 25
      ['L', 150, 20, { y: 26 }],           // 26 switchback
      ['S', 160, { y: 10 }],               // 27 descent + jump
      ['R', 45, 30],                       // 28 chicane
      ['L', 45, 30],                       // 29
      ['L', 90, 60, { y: 0 }],             // 30
      ['S', 120, { free: true }],          // 31 lava-lake straight
      ['R', 25, 70],                       // 32 lakeside esse
      ['L', 50, 70],                       // 33
      ['R', 25, 70],                       // 34
      ['S', 120],                          // 35
      ['L', 90, 60],                       // 36
      ['S', 100],                          // 37
    ],
    lava: { shoulder: 2 },   // lava beside the road: touch it and you're put back on the road
    pads: [
      { at: 4.3, pads: [[0, 'race'], [1, 'race']] },
      { at: 10.3, pads: [[0, 'race']] },
      { at: 17.15, pads: [[0, 'race']] },
      { at: 23.3, pads: [[0, 0]] },
      { at: 31.2, pads: [[0, -3.5], [1, 3.5]] },
    ],
    ramps: [
      { at: 17.55, hw: 8.5, h: 2.4 },   // crater rim: big jump
      { at: 27.45, hw: 8.5, h: 2.2 },   // descent jump
      { at: 31.55, hw: 8.5, h: 2.0 },   // lava lake straight
    ],
    itemRows: [1.3, 4.6, 8.4, 12.5, 17.3, 19.5, 23.5, 27.3, 31.4, 35.4],
    itemLats: [-5.5, -1.8, 1.8, 5.5],
    look: {
      offroad: 'basalt',
      asphalt: { base: '#3e3838', specks: ['#332e2e', '#4a4343', '#544c4b', '#2a2626', '#433d3c'], centre: '#ff7a1a', edge: '#ffd0a0', lane: 'rgba(255,170,90,0.35)' },
      curb: ['#ffb000', '#1f1a1a'],
      barrier: [
        { bg: '#1f1a1a', fg: '#ff7a1a', text: 'VOLCANO' },
        { bg: '#ff5a1a', fg: '#1f1a1a', text: 'DANGER' },
        { bg: '#ffb000', fg: '#1f1a1a', text: 'KARTS' },
        { bg: '#1f1a1a', fg: '#ffb000', text: '★ HOT ★' },
      ],
      barrierGlow: 0.5,
      rail: ['#2a2424', '#ff7a1a'],
      tires: [0xffb000, 0x1f1a1a, 0xff5a1a, 0x1f1a1a],
      tireDark: 0x111111,
      wallTop: 0x2a2424,
      ramp: ['#ff5a1a', '#2a2424', '#ffd21f'],
      rampSide: 0xff5a1a,
      gantry: { stripeA: '#1f1a1a', stripeB: '#ff7a1a', beam: 0x2a1a14, banner: { top: '#ff6a2a', bottom: '#8a1a0a', stroke: '#2a0602', band: '#ffd21f' }, glow: 0.8 },
    },
    env: {
      kind: 'volcano',
      sky: { top: 0x1a0606, horizon: 0xb8401f, bottom: 0x5a1a10, sun: 0xff9a50 },
      sunDir: [-0.4, 0.5, -0.55],
      fog: [240, 1150],
      fogColor: 0x5a2416,
      hemi: [0xffa880, 0x5a2418, 1.45],
      sunLight: [0xffb088, 2.5],
      envGround: 0x2a1410,
      envIntensity: 0.45,
      ground: { a: 0x5a4c4a, b: 0x6e5d58, high: 0x4a3e3d, rock: 0x3e3434, near: 0x66574f, low: 0x8a3a1c, lowFrom: 0.5, lowTo: -2.5 },
      baseLevel: -3,
      corridor: [4, 45],
      cone: { at: 17.5, lat: 150, r: 260, h: 185 },
      ring: { colors: [0x2a2224, 0x3a2e2e, 0x5a3a30], snowLine0: 0.5, snowLine: 0.97, rad: 150, hgt: 300, count: 24, haze: 0.35 },
      clouds: { count: 30, color: 0x3a2a2a, emissive: 0x401208, y: 200 },
      seatCols: [0xff7a1a, 0x1f1a1a, 0xffb000, 0x5a1a10],
      roofCols: [0x1f1a1a, 0xff5a1a],
      standWall: 0x3a3232,
      standBack: 0x2a2424,
      stands: [{ from: -90, to: 50, side: 1, tiers: 6 }, { from: -60, to: 40, side: -1, tiers: 5, setback: 14 }],   // setback: intro orbit clears the roof
      flagCols: [0xff7a1a, 0xffb000, 0x1f1a1a, 0xff3a1a],
    },
  },
];

export function getTrackDef(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}
