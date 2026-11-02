/* Charleston Four: BDB's brain.
   Negamax with alpha-beta, a transposition table, centre-first move ordering and iterative deepening under a time cap.
   engineSrc is self-contained so it can run in a Web Worker built from a Blob, or on the main thread as a fallback.
   Board: Int8Array(42), index = col * 6 + row (row 0 is the bottom), values 0 empty, 1 or 2.
   Request:  {id, board:[42], toMove:1|2, maxDepth, timeMs, shuffle}
   Response: {id, best, score, depth, nodes, ms, wins:[cols], blocks:[cols]} */
export function engineSrc(self){
  const COLS = 7, ROWS = 6, N = 42, WIN = 1000000;
  const ORDER = [3, 2, 4, 1, 5, 0, 6];
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const at = (c, r) => c * ROWS + r;

  // every line of four on the board
  const WINDOWS = [];
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++)
    for (const [dc, dr] of DIRS){
      const ec = c + dc * 3, er = r + dr * 3;
      if (ec < 0 || ec >= COLS || er < 0 || er >= ROWS) continue;
      WINDOWS.push([at(c, r), at(c + dc, r + dr), at(c + dc * 2, r + dr * 2), at(ec, er)]);
    }
  const WIN_FLAT = new Int8Array(WINDOWS.length * 4);
  WINDOWS.forEach((w, i) => w.forEach((x, j) => { WIN_FLAT[i * 4 + j] = x; }));
  const NW = WINDOWS.length;

  // zobrist keys: two 26-bit halves per cell per player, combined into one safe integer
  const ZA = new Int32Array(N * 3), ZB = new Int32Array(N * 3);
  let seed = 0x2b0b1e;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) & 0x3ffffff; };
  for (let i = 0; i < N * 3; i++){ ZA[i] = rnd(); ZB[i] = rnd(); }

  let B, H, hA, hB, count, nodes, deadline, aborted, tt;

  function wins(idx, p){
    const c = (idx / ROWS) | 0, r = idx % ROWS;
    for (const [dc, dr] of DIRS){
      let n = 1;
      for (let k = 1; k < 4; k++){ const cc = c + dc * k, rr = r + dr * k; if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS || B[at(cc, rr)] !== p) break; n++; }
      for (let k = 1; k < 4; k++){ const cc = c - dc * k, rr = r - dr * k; if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS || B[at(cc, rr)] !== p) break; n++; }
      if (n >= 4) return true;
    }
    return false;
  }
  // would p win by dropping in column c (column must have room)
  function winsAt(c, p){
    const idx = at(c, H[c]);
    B[idx] = p; const w = wins(idx, p); B[idx] = 0;
    return w;
  }
  function play(c, p){ const idx = at(c, H[c]); B[idx] = p; H[c]++; count++; hA ^= ZA[idx * 3 + p]; hB ^= ZB[idx * 3 + p]; }
  function undo(c, p){ H[c]--; const idx = at(c, H[c]); B[idx] = 0; count--; hA ^= ZA[idx * 3 + p]; hB ^= ZB[idx * 3 + p]; }

  const threatMark = new Int8Array(N * 3);
  // static score from p's point of view
  function evaluate(p){
    const o = 3 - p;
    let s = 0;
    for (let r = 0; r < ROWS; r++){ const v = B[at(3, r)]; if (v === p) s += 6; else if (v === o) s -= 6; }
    for (let r = 0; r < ROWS; r++){ let v = B[at(2, r)]; if (v === p) s += 2; else if (v === o) s -= 2; v = B[at(4, r)]; if (v === p) s += 2; else if (v === o) s -= 2; }
    threatMark.fill(0);
    for (let w = 0; w < NW; w++){
      let np = 0, no = 0, empty = -1;
      for (let j = 0; j < 4; j++){ const v = B[WIN_FLAT[w * 4 + j]]; if (v === p) np++; else if (v === o) no++; else empty = WIN_FLAT[w * 4 + j]; }
      if (np && no) continue;
      if (np === 2) s += 8; else if (np === 1) s += 1;
      else if (no === 2) s -= 8; else if (no === 1) s -= 1;
      if (np === 3) threatMark[empty * 3 + p] = 1;
      else if (no === 3) threatMark[empty * 3 + o] = 1;
    }
    // threats: the first player wants them on odd rows (1st, 3rd, 5th from the bottom), the second player on even rows
    const first = count % 2 === 0 ? p : o;
    for (let c = 0; c < COLS; c++){
      for (let r = H[c]; r < ROWS; r++){
        const idx = at(c, r);
        for (const x of [p, o]){
          if (!threatMark[idx * 3 + x]) continue;
          let v = 40;
          if ((r % 2 === 0) === (x === first)) v += 35;
          if (r > 0 && r - 1 >= H[c] && threatMark[(idx - 1) * 3 + x]) v += 120;   // stacked threats usually win
          s += x === p ? v : -v;
        }
      }
    }
    return s;
  }

  function negamax(depth, alpha, beta, p, ply){
    nodes++;
    if ((nodes & 2047) === 0 && Date.now() > deadline){ aborted = true; return 0; }
    if (aborted) return 0;
    if (count >= N) return 0;
    const o = 3 - p;
    for (let i = 0; i < 7; i++){ const c = ORDER[i]; if (H[c] < ROWS && winsAt(c, p)) return WIN - ply; }
    if (count >= N - 1) return 0;
    // opponent threats we have to answer right now
    let forced = -1, nThreat = 0;
    for (let i = 0; i < 7; i++){ const c = ORDER[i]; if (H[c] < ROWS && winsAt(c, o)){ nThreat++; forced = c; } }
    if (nThreat > 1) return -(WIN - ply - 1);
    if (depth <= 0) return evaluate(p);

    const key = hA * 67108864 + hB;
    const hit = tt.get(key);
    let ttMove = -1;
    if (hit){
      ttMove = hit.m;
      if (hit.d >= depth){
        if (hit.f === 0) return hit.v;
        if (hit.f === 1 && hit.v >= beta) return hit.v;
        if (hit.f === 2 && hit.v <= alpha) return hit.v;
      }
    }
    const a0 = alpha;
    const moves = [];
    if (forced >= 0) moves.push(forced);
    else {
      if (ttMove >= 0 && H[ttMove] < ROWS) moves.push(ttMove);
      const late = [];
      for (let i = 0; i < 7; i++){
        const c = ORDER[i];
        if (H[c] >= ROWS || c === ttMove) continue;
        // dropping under the opponent's winning cell hands them the game: try it last
        if (H[c] + 1 < ROWS){ const above = at(c, H[c] + 1); B[at(c, H[c])] = p; B[above] = o; const bad = wins(above, o); B[above] = 0; B[at(c, H[c])] = 0; if (bad){ late.push(c); continue; } }
        moves.push(c);
      }
      moves.push(...late);
    }
    let best = -Infinity, bestMove = moves[0];
    for (const c of moves){
      play(c, p);
      const v = -negamax(depth - 1, -beta, -alpha, o, ply + 1);
      undo(c, p);
      if (aborted) return 0;
      if (v > best){ best = v; bestMove = c; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    if (tt.size > 900000) tt.clear();
    tt.set(key, {d:depth, v:best, f: best <= a0 ? 2 : best >= beta ? 1 : 0, m:bestMove});
    return best;
  }

  function search(req){
    const t0 = Date.now();
    B = new Int8Array(N); H = new Int8Array(COLS); hA = 0; hB = 0; count = 0;
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++){
      const v = req.board[at(c, r)] | 0;
      if (v === 1 || v === 2){ B[at(c, r)] = v; H[c] = r + 1; count++; hA ^= ZA[at(c, r) * 3 + v]; hB ^= ZB[at(c, r) * 3 + v]; }
    }
    const p = req.toMove === 2 ? 2 : 1, o = 3 - p;
    const legal = ORDER.filter(c => H[c] < ROWS);
    const winCols = legal.filter(c => winsAt(c, p));
    const blockCols = legal.filter(c => winsAt(c, o));
    const out = {id:req.id, best:legal[0] ?? -1, score:0, depth:0, nodes:0, ms:0, wins:winCols, blocks:blockCols};
    if (!legal.length) return out;
    if (winCols.length){ out.best = winCols[0]; out.score = WIN; return out; }
    if (count === 0){ out.best = 3; return out; }
    nodes = 0; aborted = false; tt = new Map();
    deadline = t0 + Math.max(30, req.timeMs || 600);
    let root = legal.slice();
    if (req.shuffle){
      // keep the centre bias but break ties differently each game
      root = root.map((c, i) => [c, i + Math.random() * 2.5]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
    }
    if (blockCols.length === 1) root = blockCols.concat(root.filter(c => c !== blockCols[0]));
    const maxDepth = Math.min(req.maxDepth || 8, N - count);
    for (let d = 1; d <= maxDepth; d++){
      let alpha = -Infinity, best = -Infinity, bestMove = root[0];
      const scored = [];
      for (const c of root){
        play(c, p);
        const v = -negamax(d - 1, -Infinity, -alpha, o, 1);
        undo(c, p);
        if (aborted) break;
        scored.push([c, v]);
        if (v > best){ best = v; bestMove = c; }
        if (v > alpha) alpha = v;
      }
      if (aborted && d > 1) break;
      out.best = bestMove; out.score = best; out.depth = d;
      // search the best move first next iteration
      root = [bestMove].concat(root.filter(c => c !== bestMove));
      if (Math.abs(best) > WIN - 100) break;            // forced result found
      if (Date.now() > deadline) break;
    }
    out.nodes = nodes; out.ms = Date.now() - t0;
    return out;
  }

  self.onmessage = e => { const d = e.data || {}; self.postMessage(search(d)); };
  self.search = search;
}
