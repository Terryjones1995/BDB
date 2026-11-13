/* =========================================================
   Sink BDB: fleet rules + BDB's targeting brains. No DOM in here, so it also runs in Node for simulations.
   Grid index = row * 10 + col. Rows are A to J, columns 1 to 10.
   Knowledge grid used by the shooters: 0 unknown, 1 miss, 2 hit (ship not sunk yet), 3 part of a sunk ship.
   ========================================================= */

export const N = 10, CELLS = 100;
export const SHIPS = [
  {id:'sch', name:'The Scholarship',  short:'Scholarship', len:5},
  {id:'lan', name:'Lanyard Cruiser',  short:'Lanyard',     len:4},
  {id:'brk', name:'Break Room Barge', short:'Barge',       len:3},
  {id:'sub', name:'Shot Clock Sub',   short:'Sub',         len:3},
  {id:'bnc', name:'Bench Boat',       short:'Bench',       len:2}
];
export const SHIP_BY_ID = Object.fromEntries(SHIPS.map(s => [s.id, s]));
export const ROWS = 'ABCDEFGHIJ';
export const coord = i => ROWS[(i / 10) | 0] + ((i % 10) + 1);

export function cellsOf(r, c, v, len){
  const out = [];
  for (let k = 0; k < len; k++) out.push((r + (v ? k : 0)) * 10 + c + (v ? 0 : k));
  return out;
}
export const inBounds = (r, c, v, len) => r >= 0 && c >= 0 && (v ? r + len <= N && c < N : c + len <= N && r < N);

/* occ: Int8Array(100), 0 empty or ship index + 1. skip: ship index to ignore (the one being moved). */
export function canPlace(occ, r, c, v, len, skip = -1, noTouch = false){
  if (!inBounds(r, c, v, len)) return false;
  for (const i of cellsOf(r, c, v, len)){
    if (occ[i] && occ[i] - 1 !== skip) return false;
    if (noTouch){
      const rr = (i / 10) | 0, cc = i % 10;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
        const r2 = rr + dr, c2 = cc + dc;
        if (r2 < 0 || r2 >= N || c2 < 0 || c2 >= N) continue;
        const o = occ[r2 * 10 + c2];
        if (o && o - 1 !== skip) return false;
      }
    }
  }
  return true;
}

/* a full random fleet: [{id, len, r, c, v}] in SHIPS order */
export function randomLayout(rng = Math.random, {noTouch = false} = {}){
  for (let attempt = 0; attempt < 200; attempt++){
    const occ = new Int8Array(CELLS), out = [];
    let ok = true;
    for (let s = 0; s < SHIPS.length && ok; s++){
      const len = SHIPS[s].len;
      let placed = false;
      for (let t = 0; t < 300 && !placed; t++){
        const v = rng() < .5, r = Math.floor(rng() * (v ? N - len + 1 : N)), c = Math.floor(rng() * (v ? N : N - len + 1));
        if (!canPlace(occ, r, c, v, len, -1, noTouch)) continue;
        for (const i of cellsOf(r, c, v, len)) occ[i] = s + 1;
        out.push({id:SHIPS[s].id, len, r, c, v});
        placed = true;
      }
      ok = placed;
    }
    if (ok) return out;
  }
  return randomLayout(rng, {noTouch:false});
}

/* a layout is legal when it has each ship once, the right lengths, inside the grid, no overlaps */
export function validLayout(ships){
  if (!Array.isArray(ships) || ships.length !== SHIPS.length) return false;
  const occ = new Int8Array(CELLS), seen = new Set();
  for (const s of ships){
    if (!s || typeof s !== 'object') return false;
    const def = SHIP_BY_ID[s.id];
    if (!def || seen.has(s.id)) return false;
    seen.add(s.id);
    const r = s.r, c = s.c, v = !!s.v;
    if (!Number.isInteger(r) || !Number.isInteger(c)) return false;
    if (!canPlace(occ, r, c, v, def.len)) return false;
    for (const i of cellsOf(r, c, v, def.len)) occ[i] = 1;
  }
  return true;
}

/* ---------- placements index, shared by every shooter ---------- */
const PLACEMENTS = {};          // len -> [cells[]]
const BY_CELL = {};             // len -> cell -> [placement index]
for (const len of [2, 3, 4, 5]){
  const list = [], by = Array.from({length:CELLS}, () => []);
  for (const v of [false, true]) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++){
    if (!inBounds(r, c, v, len)) continue;
    const cells = cellsOf(r, c, v, len);
    for (const i of cells) by[i].push(list.length);
    list.push(cells);
  }
  PLACEMENTS[len] = list; BY_CELL[len] = by;
}

/* ---------- shooters ---------- */
export const LEVEL_KEYS = ['rec', 'varsity', 'd1'];

export function makeShooter(level, rng = Math.random){
  const K = new Int8Array(CELLS);
  let left = SHIPS.map(s => ({id:s.id, len:s.len}));
  const parityOff = {2: Math.floor(rng() * 2), 3: Math.floor(rng() * 3), 4: Math.floor(rng() * 4), 5: Math.floor(rng() * 5)};
  let lastInfo = '';

  const unknown = ex => { const o = []; for (let i = 0; i < CELLS; i++) if (K[i] === 0 && !ex.has(i)) o.push(i); return o; };
  const rand = a => a[Math.floor(rng() * a.length)];
  const hits = () => { const o = []; for (let i = 0; i < CELLS; i++) if (K[i] === 2) o.push(i); return o; };
  const nb4 = i => { const r = (i / 10) | 0, c = i % 10, o = []; if (r > 0) o.push(i - 10); if (r < 9) o.push(i + 10); if (c > 0) o.push(i - 1); if (c < 9) o.push(i + 1); return o; };

  /* Rec League: mostly random. Sometimes wanders back to "search" around an earlier shot, sloppily. Never the same cell twice. */
  function pickRec(ex){
    if (rng() < .35){
      const shots = []; for (let i = 0; i < CELLS; i++) if (K[i] === 2 || K[i] === 1) shots.push(i);
      if (shots.length){
        const hs = shots.filter(i => K[i] === 2);
        const base = hs.length && rng() < .6 ? rand(hs) : rand(shots);
        const br = (base / 10) | 0, bc = base % 10, near = [];
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++){
          const r = br + dr, c = bc + dc;
          if (r < 0 || r > 9 || c < 0 || c > 9) continue;
          const i = r * 10 + c; if (K[i] === 0 && !ex.has(i)) near.push(i);
        }
        if (near.length){ lastInfo = 'sloppy search'; return rand(near); }
      }
    }
    lastInfo = 'random';
    return rand(unknown(ex));
  }

  /* Varsity: classic hunt and target. Random hunting; after a hit it works the neighbours, and once two hits line up it follows the line. */
  function targetCandidates(ex){
    const hs = hits();
    if (!hs.length) return [];
    const line = new Set();
    for (const h of hs){
      const r = (h / 10) | 0, c = h % 10;
      for (const [dr, dc] of [[0, 1], [1, 0]]){
        const isHit = (rr, cc) => rr >= 0 && rr < N && cc >= 0 && cc < N && K[rr * 10 + cc] === 2;
        if (!isHit(r + dr, c + dc) && !isHit(r - dr, c - dc)) continue;
        let a = 0; while (isHit(r - dr * (a + 1), c - dc * (a + 1))) a++;
        let b = 0; while (isHit(r + dr * (b + 1), c + dc * (b + 1))) b++;
        for (const k of [-(a + 1), b + 1]){
          const rr = r + dr * k, cc = c + dc * k;
          if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
          const i = rr * 10 + cc; if (K[i] === 0 && !ex.has(i)) line.add(i);
        }
      }
    }
    if (line.size) return [...line];
    const out = new Set();
    for (const h of hs) for (const n of nb4(h)) if (K[n] === 0 && !ex.has(n)) out.add(n);
    return [...out];
  }
  function pickVarsity(ex){
    const t = targetCandidates(ex);
    if (t.length){ lastInfo = 'target'; return rand(t); }
    lastInfo = 'hunt';
    return rand(unknown(ex));
  }

  /* D1: probability density over every way the remaining ships could still fit.
     Hunting sticks to a parity lattice for the smallest ship left; targeting samples whole fleets that explain every hit. */
  function density(requireHits){
    const d = new Float64Array(CELLS);
    for (const s of left){
      for (const cells of PLACEMENTS[s.len]){
        let blocked = false, h = 0;
        for (const i of cells){ if (K[i] === 1 || K[i] === 3){ blocked = true; break; } if (K[i] === 2) h++; }
        if (blocked || (requireHits && !h)) continue;
        const w = h ? Math.pow(24, h) : 1;
        for (const i of cells) if (K[i] === 0) d[i] += w;
      }
    }
    return d;
  }
  function sampleFleets(budgetMs = 14){
    const hs = hits(), freq = new Float64Array(CELLS), t0 = Date.now();
    const occ = new Uint8Array(CELLS);
    const okPl = {};
    for (const s of left) if (!okPl[s.len]) okPl[s.len] = PLACEMENTS[s.len].map(cells => cells.every(i => K[i] !== 1 && K[i] !== 3));
    let good = 0, tries = 0;
    while (good < 700 && tries < 6000 && (tries < 300 || Date.now() - t0 < budgetMs)){
      tries++;
      occ.fill(0);
      const todo = left.slice(), placed = [];
      let fail = false;
      // cover each uncovered hit with some remaining ship
      for (const h of hs){
        if (occ[h]) continue;
        const opts = [];
        for (let si = 0; si < todo.length; si++){
          const len = todo[si].len;
          for (const pi of BY_CELL[len][h]){
            if (!okPl[len][pi]) continue;
            const cells = PLACEMENTS[len][pi];
            if (cells.some(i => occ[i])) continue;
            opts.push([si, cells]);
          }
        }
        if (!opts.length){ fail = true; break; }
        const [si, cells] = opts[Math.floor(rng() * opts.length)];
        for (const i of cells) occ[i] = 1;
        placed.push(cells); todo.splice(si, 1);
      }
      if (fail) continue;
      for (const s of todo){
        const list = PLACEMENTS[s.len], ok = okPl[s.len];
        let cells = null;
        for (let k = 0; k < 40; k++){
          const pi = Math.floor(rng() * list.length);
          if (!ok[pi]) continue;
          const cand = list[pi];
          if (cand.some(i => occ[i] || K[i] === 2)) continue;   // spare ships can't sit on a hit that's already explained
          cells = cand; break;
        }
        if (!cells){ fail = true; break; }
        for (const i of cells) occ[i] = 1;
        placed.push(cells);
      }
      if (fail) continue;
      good++;
      for (const cells of placed) for (const i of cells) if (K[i] === 0) freq[i]++;
    }
    return {freq, good};
  }
  function ranked(scores, ex, parity){
    const minLen = Math.min(...left.map(s => s.len));
    const off = parityOff[minLen] ?? 0;
    const list = [];
    for (let i = 0; i < CELLS; i++){
      if (K[i] !== 0 || ex.has(i)) continue;
      const r = (i / 10) | 0, c = i % 10;
      const onLattice = (r + c) % minLen === off;
      list.push({i, s:scores[i] * (1 + rng() * .04) + (parity && onLattice ? 1e9 : 0) * (scores[i] > 0 ? 1 : 0)});
    }
    list.sort((a, b) => b.s - a.s);
    return list.map(o => o.i);
  }
  function pickD1(ex, n){
    const hs = hits();
    if (hs.length){
      const {freq, good} = sampleFleets();
      if (good >= 40){
        lastInfo = `target (${good} fleets sampled)`;
        return ranked(freq, ex, false).slice(0, n);
      }
      lastInfo = 'target (density)';
      return ranked(density(true), ex, false).slice(0, n);
    }
    lastInfo = 'hunt (density + parity)';
    return ranked(density(false), ex, true).slice(0, n);
  }

  return {
    level,
    /* n shots, never a cell already shot or already in this volley */
    pick(n = 1){
      const ex = new Set(), out = [];
      let free = 0; for (let i = 0; i < CELLS; i++) if (K[i] === 0) free++;
      n = Math.max(0, Math.min(n, free));
      if (level === 'd1') return pickD1(ex, n);
      while (out.length < n){
        const c = level === 'rec' ? pickRec(ex) : pickVarsity(ex);
        if (c === undefined) break;
        out.push(c); ex.add(c);
      }
      return out;
    },
    /* res: 'miss' | 'hit' | 'sunk'. sunk: {id, cells} */
    record(cell, res, sunk){
      K[cell] = res === 'miss' ? 1 : 2;
      if (res === 'sunk' && sunk){
        for (const i of sunk.cells) K[i] = 3;
        left = left.filter(s => s.id !== sunk.id);
      }
    },
    get info(){ return lastInfo; },
    get knowledge(){ return Array.from(K); },
    get left(){ return left.map(s => s.id); }
  };
}

/* answer a shot against a fleet. fleet = {ships:[{id,len,r,c,v}], occ:Int8Array, shot:Uint8Array}
   returns {i, r:'miss'|'hit'|'sunk', ship?, cells?} and marks the shot */
export function makeFleet(ships){
  const occ = new Int8Array(CELLS);
  ships.forEach((s, k) => { for (const i of cellsOf(s.r, s.c, s.v, s.len)) occ[i] = k + 1; });
  return {ships: ships.map(s => ({...s})), occ, shot: new Uint8Array(CELLS), sunk: new Set()};
}
export function answerShot(fleet, i){
  fleet.shot[i] = 1;
  const o = fleet.occ[i];
  if (!o) return {i, r:'miss'};
  const s = fleet.ships[o - 1];
  const cells = cellsOf(s.r, s.c, s.v, s.len);
  if (cells.every(k => fleet.shot[k])){ fleet.sunk.add(s.id); return {i, r:'sunk', ship:s.id, cells}; }
  return {i, r:'hit'};
}
export const afloat = fleet => fleet.ships.length - fleet.sunk.size;

/* canonical text for the fair-play hash: ships in SHIPS order, then the salt */
export function layoutText(ships, salt){
  const by = Object.fromEntries(ships.map(s => [s.id, s]));
  return SHIPS.map(d => { const s = by[d.id]; return `${d.id}:${s.r},${s.c},${s.v ? 1 : 0}`; }).join(';') + '|' + salt;
}

/* replay every answer the other side gave against the layout they revealed. Returns null if all good, or the first bad one. */
export function auditAnswers(ships, answers){
  if (!validLayout(ships)) return {why:'layout'};
  const fleet = makeFleet(SHIPS.map(d => { const s = ships.find(x => x.id === d.id); return {id:d.id, len:d.len, r:s.r, c:s.c, v:!!s.v}; }));
  for (let k = 0; k < answers.length; k++){
    const a = answers[k];
    if (fleet.shot[a.i]) return {why:'repeat', k, a};
    const want = answerShot(fleet, a.i);
    if (want.r !== a.r) return {why:'answer', k, a, want};
    if (want.r === 'sunk' && (want.ship !== a.ship || want.cells.join() !== (a.cells || []).slice().sort((x, y) => x - y).join())) return {why:'sunk', k, a, want};
  }
  return null;
}
