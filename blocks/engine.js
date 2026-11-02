/* Break Room Blocks: game rules, no DOM. Browser: window.Blocks. Node: require('./engine.js').
   10 x 20 field (+2 hidden rows on top), the seven four-square pieces, 7-bag randomizer, SRS rotation with wall kicks,
   hold (once per piece), next queue, ghost, soft/hard drop, 0.5s lock delay with 15 move resets,
   level up every 10 lines, guideline-style scoring: 100/300/500/800 x level, quad back-to-back x1.5,
   combo 50 x combo x level, soft drop 1 per row, hard drop 2 per row. */
(function(root){
  const COLS = 10, ROWS = 22, HIDDEN = 2, LOCK_DELAY = 0.5, MAX_RESETS = 15, CLEAR_DELAY = 0.32;
  const TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
  const BASE = {
    I: {n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]]},
    J: {n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]]},
    L: {n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]]},
    O: {n: 2, c: [[0, 0], [1, 0], [0, 1], [1, 1]]},
    S: {n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]]},
    T: {n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]]},
    Z: {n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]]}
  };
  // rotation states 0, R, 2, L: rotate clockwise inside the piece's box (y down)
  const SHAPES = {};
  for (const t of TYPES){
    const {n, c} = BASE[t], st = [c];
    for (let r = 1; r < 4; r++) st.push(st[r - 1].map(([x, y]) => [n - 1 - y, x]));
    SHAPES[t] = st;
  }
  // SRS kick offsets, written y-up as in the standard tables; applied as (x + kx, y - ky)
  const KICK = {
    '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],     '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],    '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
  };
  const KICK_I = {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],   '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],   '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],   '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],   '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
  };
  const LINE_PTS = [0, 100, 300, 500, 800];
  // seconds per row (guideline curve), levels past 20 stay at 20's speed
  const gravity = level => { const l = Math.min(20, Math.max(1, level)) - 1; return Math.pow(0.8 - l * 0.007, l); };

  function createGame(opts = {}){
    const rng = opts.rng || Math.random, emit = opts.on || (() => {});
    const g = {
      board: Array.from({length: ROWS}, () => Array(COLS).fill(0)),
      cur: null, held: null, holdUsed: false, queue: [], score: 0, lines: 0, level: opts.level || 1, startLevel: opts.level || 1,
      combo: -1, b2b: false, over: false, lockT: 0, resets: 0, lowest: 0, gravT: 0, soft: false, clearing: null, clearT: 0,
      pieces: 0, quads: 0, maxCombo: 0
    };
    function refill(){
      while (g.queue.length < 7){
        const bag = TYPES.slice();
        for (let i = bag.length - 1; i > 0; i--){ const j = Math.floor(rng() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
        g.queue.push(...bag);
      }
    }
    const cellsOf = (t, r, x, y) => SHAPES[t][r].map(([cx, cy]) => [x + cx, y + cy]);
    function fits(t, r, x, y){
      for (const [cx, cy] of SHAPES[t][r]){
        const X = x + cx, Y = y + cy;
        if (X < 0 || X >= COLS || Y >= ROWS) return false;
        if (Y >= 0 && g.board[Y][X]) return false;
      }
      return true;
    }
    const grounded = () => !!g.cur && !fits(g.cur.t, g.cur.r, g.cur.x, g.cur.y + 1);
    function spawn(t){
      const p = {t, r: 0, x: t === 'O' ? 4 : 3, y: 0};
      if (!fits(p.t, p.r, p.x, p.y)){ g.cur = null; end('blockout'); return false; }
      if (fits(p.t, p.r, p.x, p.y + 1)) p.y++;
      g.cur = p; g.lockT = 0; g.resets = 0; g.lowest = p.y; g.gravT = 0;
      emit('spawn', {t});
      return true;
    }
    function spawnNext(){ refill(); const t = g.queue.shift(); refill(); return spawn(t); }
    function end(why){ if (g.over) return; g.over = true; g.cur = null; emit('over', {why}); }
    function moved(){
      if (grounded() || g.lockT > 0){ if (g.resets < MAX_RESETS){ g.lockT = 0; g.resets++; } }
    }
    function move(dx){
      const p = g.cur; if (!p || g.over) return false;
      if (!fits(p.t, p.r, p.x + dx, p.y)) return false;
      p.x += dx; moved(); emit('move', {dx}); return true;
    }
    function rotate(dir){
      const p = g.cur; if (!p || g.over) return false;
      if (p.t === 'O'){ emit('rotate', {kick: 0}); return true; }
      const to = (p.r + dir + 4) % 4, table = p.t === 'I' ? KICK_I : KICK;
      const kicks = table[p.r + '>' + to];
      for (let k = 0; k < kicks.length; k++){
        const [kx, ky] = kicks[k];
        if (fits(p.t, to, p.x + kx, p.y - ky)){
          p.x += kx; p.y -= ky; p.r = to;
          if (p.y > g.lowest){ g.lowest = p.y; g.resets = 0; }
          moved(); emit('rotate', {kick: k}); return true;
        }
      }
      return false;
    }
    // one row of manual soft drop (touch drag): 1 point
    function stepDown(){
      const p = g.cur; if (!p || g.over || !fits(p.t, p.r, p.x, p.y + 1)) return false;
      p.y++; g.score += 1; g.lockT = 0;
      if (p.y > g.lowest){ g.lowest = p.y; g.resets = 0; }
      emit('soft', {}); return true;
    }
    function ghostY(){ const p = g.cur; if (!p) return 0; let y = p.y; while (fits(p.t, p.r, p.x, y + 1)) y++; return y; }
    function hardDrop(){
      const p = g.cur; if (!p || g.over) return 0;
      const y = ghostY(), d = y - p.y; p.y = y; g.score += 2 * d;
      emit('hard', {d, cells: cellsOf(p.t, p.r, p.x, p.y), t: p.t});
      lock(); return d;
    }
    function hold(){
      const p = g.cur; if (!p || g.holdUsed || g.over) return false;
      g.holdUsed = true;
      const prev = g.held; g.held = p.t;
      if (prev) spawn(prev); else spawnNext();
      emit('hold', {t: p.t}); return true;
    }
    function lock(){
      const p = g.cur; if (!p) return;
      const cs = cellsOf(p.t, p.r, p.x, p.y), id = TYPES.indexOf(p.t) + 1;
      let hidden = true;
      for (const [x, y] of cs){ if (y >= 0) g.board[y][x] = id; if (y >= HIDDEN) hidden = false; }
      g.cur = null; g.pieces++; g.holdUsed = false;
      emit('lock', {cells: cs, t: p.t});
      if (hidden){ end('lockout'); return; }
      const full = [];
      for (let y = 0; y < ROWS; y++) if (g.board[y].every(v => v)) full.push(y);
      if (full.length){
        const n = full.length, lvl = g.level;
        let pts = LINE_PTS[n] * lvl, b2b = false;
        if (n === 4){ if (g.b2b){ pts *= 1.5; b2b = true; } g.b2b = true; g.quads++; } else g.b2b = false;
        g.combo++; g.maxCombo = Math.max(g.maxCombo, g.combo);
        const comboPts = g.combo > 0 ? 50 * g.combo * lvl : 0;
        g.score += pts + comboPts; g.lines += n;
        g.clearing = full; g.clearT = opts.clearDelay != null ? opts.clearDelay : CLEAR_DELAY;
        emit('clear', {n, rows: full, pts: pts + comboPts, b2b, combo: g.combo});
        const nl = g.startLevel + Math.floor(g.lines / 10);
        if (nl > g.level){ g.level = nl; emit('level', {level: nl}); }
        if (g.clearT <= 0) finishClear();
      } else { g.combo = -1; spawnNext(); }
    }
    function finishClear(){
      const rows = g.clearing; g.clearing = null; g.clearT = 0;
      g.board = g.board.filter((_, i) => !rows.includes(i));
      while (g.board.length < ROWS) g.board.unshift(Array(COLS).fill(0));
      spawnNext();
    }
    function update(dt){
      if (g.over) return;
      if (g.clearing){ g.clearT -= dt; if (g.clearT <= 0) finishClear(); return; }
      const p = g.cur; if (!p) return;
      const grav = gravity(g.level), every = g.soft ? Math.min(grav / 20, 0.05) : grav;
      g.gravT += dt;
      while (g.gravT >= every){
        if (fits(p.t, p.r, p.x, p.y + 1)){
          g.gravT -= every; p.y++; g.lockT = 0;
          if (g.soft){ g.score += 1; emit('soft', {}); }
          if (p.y > g.lowest){ g.lowest = p.y; g.resets = 0; }
        } else { g.gravT = 0; break; }
      }
      if (grounded()){ g.lockT += dt; if (g.lockT >= LOCK_DELAY) lock(); }
    }
    // rows of stack showing in the 20 visible rows (0 = empty field)
    function height(){ for (let y = 0; y < ROWS; y++) if (g.board[y].some(v => v)) return ROWS - y; return 0; }
    function start(){ refill(); spawnNext(); }

    return Object.assign(g, {start, update, move, rotate, hardDrop, hold, stepDown, ghostY, height, fits, cellsOf, grounded, lock,
      setSoft(on){ g.soft = !!on; }});
  }

  const Blocks = {COLS, ROWS, HIDDEN, TYPES, SHAPES, KICK, KICK_I, LINE_PTS, LOCK_DELAY, gravity, createGame};
  if (typeof module !== 'undefined' && module.exports) module.exports = Blocks; else root.Blocks = Blocks;
})(typeof window !== 'undefined' ? window : this);
