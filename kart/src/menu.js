// Title screen, character select (with difficulty / laps options + controls help), pause menu, gamepad navigation.
import { bus } from './events.js';
import { CHARACTERS, GAME_TITLE } from './config.js';
const goHome = () => { location.href = '../'; }; // back to the BDB Games list

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);
const DIFFS = ['easy', 'normal', 'hard'];
const DIFF_LABEL = { easy: '50cc · EASY', normal: '100cc · NORMAL', hard: '150cc · HARD' };
const LAPS = [1, 3, 5];
const STAT_KEYS = [['speed', 'SPEED', 'SPD'], ['accel', 'ACCEL', 'ACC'], ['handling', 'HANDLING', 'HDL'], ['weight', 'WEIGHT', 'WGT']];

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
const statBar = (v) => `<div class="bar">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</div>`;

const CONTROLS_HTML = `
  <div class="ctl"><span class="kc">↑</span><span class="kc">W</span> Accelerate</div>
  <div class="ctl"><span class="kc">↓</span><span class="kc">S</span> Brake / Reverse</div>
  <div class="ctl"><span class="kc">←→</span><span class="kc">A D</span> Steer</div>
  <div class="ctl"><span class="kc wide">SPACE</span> Hop / Drift</div>
  <div class="ctl"><span class="kc">E</span><span class="kc">X</span><span class="kc wide">L-SHIFT</span> Item · hold it behind you, release to throw</div>
  <div class="ctl"><span class="kc">↓</span><span class="kc">S</span> Hold as you release: shell backwards</div>
  <div class="ctl"><span class="kc">C</span> Look back</div>
  <div class="ctl"><span class="kc wide">ESC</span><span class="kc">P</span> Pause</div>
  <div class="ctl"><span class="kc">M</span> Mute</div>`;

export class Menu {
  constructor(uiRoot, handlers = {}) {
    this.uiRoot = uiRoot;
    this.h = handlers; // { onStart({characterIndex, difficulty, laps}), onResume, onRestart, onQuit }
    this.screen = null; // 'title' | 'select' | 'pause' | null
    this.portraitFn = null;
    this.charIndex = 0;
    this.diffIndex = 1;
    this.lapsIndex = 1;
    this.zone = 'grid';
    this.optIndex = 0;
    this.pauseIndex = 0;
    this.modeIndex = 0;            // title: 0 = RACE, 1 = ONLINE, 2 = ALL GAMES (back to BDB Games)
    this.onlineAvailable = true;
    this.pauseOnline = false;
    this._pad = { prev: {}, repeatT: 0, dir: null };
    this.gameState = 'title';
    try {
      const s = JSON.parse(localStorage.getItem('tkr-settings') || '{}');
      if (s.charIndex >= 0 && s.charIndex < CHARACTERS.length) this.charIndex = s.charIndex;
      if (s.diffIndex >= 0 && s.diffIndex < DIFFS.length) this.diffIndex = s.diffIndex;
      if (s.lapsIndex >= 0 && s.lapsIndex < LAPS.length) this.lapsIndex = s.lapsIndex;
    } catch (e) { /* storage unavailable */ }

    this._buildTitle();
    this._buildSelect();
    this._buildPause();
    this._buildLoading();

    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey);
  }

  setPortraitProvider(fn) {
    this.portraitFn = fn;
    this._portraits = new Map();
    this.cards.forEach((c, i) => {
      const url = this.portrait(CHARACTERS[i]);
      if (url) { c.img.src = url; c.img.style.display = ''; c.initial.style.display = 'none'; }
    });
    this._refreshPreview();
  }
  portrait(ch) {
    if (!ch || !this.portraitFn) return '';
    this._portraits = this._portraits || new Map();
    if (this._portraits.has(ch.id)) return this._portraits.get(ch.id);
    let url = '';
    try { url = this.portraitFn(ch) || ''; } catch (e) { url = ''; }
    this._portraits.set(ch.id, url);
    return url;
  }

  // ------------------------------------------------------------------ build
  _buildTitle() {
    const t = this.titleEl = el('div', 'screen title-screen', this.uiRoot);
    const words = GAME_TITLE.toUpperCase().split(' ');
    const first = words.shift();
    t.innerHTML = `
      <div class="title-vignette"></div>
      <div class="logo">
        <div class="logo-line l1" data-text="${first}">${first}</div>
        <div class="logo-line l2" data-text="${words.join(' ')}">${words.join(' ')}</div>
        <div class="logo-swoosh"></div>
      </div>
      <div class="title-modes">
        <button class="btn primary mode-btn" data-mode="race">RACE</button>
        <button class="btn mode-btn" data-mode="online">ONLINE</button>
        <button class="btn mode-btn" data-mode="home">ALL GAMES</button>
      </div>
      <div class="title-foot">
        <span>BDB Karts · based on Turbo Kart Rally by BridgeMind</span>
        <span class="kc">M</span> mute
      </div>`;
    t.addEventListener('click', () => { if (this.screen === 'title') this._toSelect(); });
    this.modeBtns = [...t.querySelectorAll('.mode-btn')];
    this.modeBtns.forEach((b, i) => {
      b.addEventListener('mouseenter', () => { if (this.screen === 'title' && this.modeIndex !== i) { this.modeIndex = i; this._refreshModes(); bus.emit('ui:move'); } });
      b.addEventListener('click', (e) => { e.stopPropagation(); if (this.screen === 'title') { this.modeIndex = i; this._activateMode(); } });
    });
    this._refreshModes();
  }

  /** Hide the ONLINE choice if the network module failed to load. */
  setOnlineAvailable(v) {
    this.onlineAvailable = !!v;
    this.modeBtns[1].classList.toggle('hidden', !v);
    if (!v) this.modeIndex = 0;
    this._refreshModes();
  }
  _refreshModes() { this.modeBtns.forEach((b, i) => b.classList.toggle('focus', i === this.modeIndex)); }
  _activateMode() {
    const mode = this.modeBtns[this.modeIndex] && this.modeBtns[this.modeIndex].dataset.mode;
    if (mode === 'home') { bus.emit('ui:confirm'); goHome(); }
    else if (mode === 'online' && this.onlineAvailable) { bus.emit('ui:confirm'); this.h.onOnline && this.h.onOnline(); }
    else this._toSelect();
  }

  _buildSelect() {
    const s = this.selectEl = el('div', 'screen select-screen', this.uiRoot);
    s.innerHTML = `
      <div class="sel-header"><div class="sel-title">CHOOSE YOUR RACER</div><div class="sel-back">ESC · BACK</div></div>
      <div class="sel-body">
        <div class="sel-grid"></div>
        <div class="sel-side">
          <div class="preview">
            <div class="pv-portrait"><img alt=""><span class="pv-initial"></span></div>
            <div class="pv-info">
              <div class="pv-name"></div>
              <div class="pv-kart"><span class="swatch"></span><span class="pv-kart-lbl"></span></div>
              <div class="pv-stats"></div>
            </div>
          </div>
          <div class="opts">
            <div class="opt" data-i="0"><span class="opt-lbl">CLASS</span><span class="opt-arrow l">◀</span><span class="opt-val"></span><span class="opt-arrow r">▶</span></div>
            <div class="opt" data-i="1"><span class="opt-lbl">LAPS</span><span class="opt-arrow l">◀</span><span class="opt-val"></span><span class="opt-arrow r">▶</span></div>
            <button class="btn primary race-btn" data-i="2">RACE!</button>
          </div>
        </div>
      </div>
      <div class="controls-help">${CONTROLS_HTML}</div>`;
    const grid = s.querySelector('.sel-grid');
    this.cards = CHARACTERS.map((ch, i) => {
      const card = el('div', 'card', grid);
      card.style.setProperty('--kc', hex(ch.color));
      card.style.setProperty('--ka', hex(ch.accent));
      card.innerHTML = `
        <div class="card-portrait"><img alt="" style="display:none"><span class="initial">${ch.name[0]}</span></div>
        <div class="card-name">${ch.name}</div>
        <div class="card-stats">${STAT_KEYS.map(([k, , sh]) => `<div class="st"><span>${sh}</span>${statBar(ch.stats[k])}</div>`).join('')}</div>`;
      card.addEventListener('mouseenter', () => { if (this.screen === 'select') { this.zone = 'grid'; this._setChar(i); } });
      card.addEventListener('click', () => { if (this.screen === 'select') { this._setChar(i); this._confirmChar(); } });
      card.addEventListener('dblclick', () => { if (this.screen === 'select') this._start(); });
      return { card, img: card.querySelector('img'), initial: card.querySelector('.initial') };
    });
    this.pv = {
      img: s.querySelector('.pv-portrait img'),
      initial: s.querySelector('.pv-initial'),
      portrait: s.querySelector('.pv-portrait'),
      name: s.querySelector('.pv-name'),
      swatch: s.querySelector('.swatch'),
      kartLbl: s.querySelector('.pv-kart-lbl'),
      stats: s.querySelector('.pv-stats'),
    };
    this.optEls = [...s.querySelectorAll('.opts [data-i]')];
    this.optEls.forEach((o, i) => {
      o.addEventListener('mouseenter', () => { if (this.screen === 'select') { this.zone = 'opts'; this.optIndex = i; this._refreshFocus(); } });
      if (i < 2) {
        o.querySelector('.l').addEventListener('click', (e) => { e.stopPropagation(); this.zone = 'opts'; this.optIndex = i; this._changeOpt(-1); });
        o.querySelector('.r').addEventListener('click', (e) => { e.stopPropagation(); this.zone = 'opts'; this.optIndex = i; this._changeOpt(1); });
        o.querySelector('.opt-val').addEventListener('click', () => { this.zone = 'opts'; this.optIndex = i; this._changeOpt(1); });
      } else {
        o.addEventListener('click', () => this._start());
      }
    });
    s.querySelector('.sel-back').addEventListener('click', () => this._toTitle());
    this._refreshPreview();
    this._refreshOpts();
  }

  _buildPause() {
    const p = this.pauseEl = el('div', 'screen pause-screen', this.uiRoot);
    p.innerHTML = `
      <div class="pause-panel">
        <div class="pause-title">PAUSED</div>
        <button class="btn" data-a="resume">RESUME</button>
        <button class="btn" data-a="restart">RESTART</button>
        <button class="btn hidden" data-a="netpause">PAUSE RACE</button>
        <button class="btn" data-a="quit">QUIT TO MENU</button>
        <button class="btn" data-a="home">ALL GAMES</button>
        <div class="controls-help compact">${CONTROLS_HTML}</div>
      </div>`;
    this.pauseBtns = [...p.querySelectorAll('.btn')];
    this.pauseBtns.forEach((b, i) => {
      b.addEventListener('mouseenter', () => { const vi = this._pauseVisible.indexOf(b); if (vi >= 0 && this.pauseIndex !== vi) { this.pauseIndex = vi; this._refreshPause(); bus.emit('ui:move'); } });
      b.addEventListener('click', () => this._pauseAct(b.dataset.a));
    });
  }

  _buildLoading() {
    this.loadingEl = el('div', 'screen loading-screen', this.uiRoot, '<div class="spinner"></div><div class="loading-text">LOADING</div>');
  }

  // ------------------------------------------------------------------ screens
  _showOnly(elm) {
    for (const s of [this.titleEl, this.selectEl, this.pauseEl, this.loadingEl]) s.classList.toggle('active', s === elm);
  }
  showTitle() { this.screen = 'title'; this.modeIndex = 0; this._refreshModes(); this._showOnly(this.titleEl); }
  /** A screen owned by another module (the online lobby): hide ours, keep gamepad navigation. */
  showExternal(name) { this.screen = name; this._showOnly(null); }
  showSelect() {
    this.screen = 'select'; this.zone = 'grid';
    this._showOnly(this.selectEl);
    this._setChar(this.charIndex, true);
    this._refreshOpts();
  }
  /**
   * online: the race keeps running unless someone pauses it for everyone, so offer RESUME (close this menu),
   * PAUSE RACE (netPause = { left, can, paused }) and LEAVE RACE.
   */
  showPause({ online = false, netPause = null } = {}) {
    this.pauseOnline = !!online;
    for (const b of this.pauseBtns) {
      if (b.dataset.a === 'restart' || b.dataset.a === 'home') b.classList.toggle('hidden', this.pauseOnline);
      if (b.dataset.a === 'netpause') b.classList.toggle('hidden', !this.pauseOnline);
      if (b.dataset.a === 'quit') b.textContent = this.pauseOnline ? 'LEAVE RACE' : 'QUIT TO MENU';
    }
    this.setNetPause(netPause);
    this.pauseEl.querySelector('.pause-title').textContent = this.pauseOnline ? 'MENU' : 'PAUSED';
    this.screen = 'pause'; this.pauseIndex = 0; this._refreshPause(); this._showOnly(this.pauseEl);
  }
  /**
   * Online PAUSE RACE button: how many pauses this racer has left, and whether it can pause right now. While
   * the race is paused for everyone the first button only closes this menu (BACK), it doesn't resume.
   */
  setNetPause(np) {
    const r = this.pauseBtns.find((x) => x.dataset.a === 'resume');
    if (r) r.textContent = this.pauseOnline && np && np.paused ? 'BACK' : 'RESUME';
    const b = this.pauseBtns.find((x) => x.dataset.a === 'netpause');
    if (!b) return;
    const left = np ? Math.max(0, np.left | 0) : 0;
    b.textContent = np && np.paused ? 'RACE PAUSED' : `PAUSE RACE · ${left} LEFT`;
    b.disabled = !(np && np.can);
    if (this.screen === 'pause') { this.pauseIndex = Math.min(this.pauseIndex, Math.max(0, this._pauseVisible.length - 1)); this._refreshPause(); }
  }
  get _pauseVisible() { return this.pauseBtns.filter((b) => !b.classList.contains('hidden') && !b.disabled); }
  showLoading(text = 'LOADING') {
    this.screen = 'loading';
    this.loadingEl.querySelector('.loading-text').textContent = text;
    this._showOnly(this.loadingEl);
  }
  hideAll() { this.screen = null; this._showOnly(null); }
  get settings() {
    return { characterIndex: this.charIndex, difficulty: DIFFS[this.diffIndex], laps: LAPS[this.lapsIndex] };
  }

  _toSelect() { bus.emit('ui:confirm'); this.showSelect(); this.h.onScreen && this.h.onScreen('select'); }
  _toTitle() { bus.emit('ui:back'); this.showTitle(); this.h.onScreen && this.h.onScreen('title'); }

  _setChar(i, silent) {
    i = (i + CHARACTERS.length) % CHARACTERS.length;
    if (i !== this.charIndex && !silent) bus.emit('ui:move');
    this.charIndex = i;
    this.cards.forEach((c, j) => c.card.classList.toggle('selected', j === i));
    this._refreshPreview();
    this._refreshFocus();
  }
  _confirmChar() {
    bus.emit('ui:confirm');
    this.zone = 'opts'; this.optIndex = 2;
    const c = this.cards[this.charIndex].card;
    c.classList.remove('picked'); void c.offsetWidth; c.classList.add('picked');
    this._refreshFocus();
  }
  _refreshPreview() {
    if (!this.pv) return;
    const ch = CHARACTERS[this.charIndex];
    const url = this.portrait(ch);
    if (url) { this.pv.img.src = url; this.pv.img.style.display = ''; this.pv.initial.style.display = 'none'; }
    else { this.pv.img.style.display = 'none'; this.pv.initial.style.display = ''; this.pv.initial.textContent = ch.name[0]; }
    this.pv.portrait.style.setProperty('--kc', hex(ch.color));
    this.pv.name.textContent = ch.name.toUpperCase();
    this.pv.swatch.style.background = `linear-gradient(135deg, ${hex(ch.color)} 60%, ${hex(ch.accent)} 60%)`;
    this.pv.kartLbl.textContent = `${ch.hat.toUpperCase()} · KART`;
    this.pv.stats.innerHTML = STAT_KEYS.map(([k, l]) => `<div class="st big"><span>${l}</span>${statBar(ch.stats[k])}</div>`).join('');
    this.pv.portrait.classList.remove('pop'); void this.pv.portrait.offsetWidth; this.pv.portrait.classList.add('pop');
  }
  _refreshOpts() {
    if (!this.optEls) return;
    this.optEls[0].querySelector('.opt-val').textContent = DIFF_LABEL[DIFFS[this.diffIndex]];
    this.optEls[1].querySelector('.opt-val').textContent = `${LAPS[this.lapsIndex]} LAP${LAPS[this.lapsIndex] > 1 ? 'S' : ''}`;
  }
  _refreshFocus() {
    this.cards.forEach((c, j) => c.card.classList.toggle('focus', this.zone === 'grid' && j === this.charIndex));
    this.optEls.forEach((o, j) => o.classList.toggle('focus', this.zone === 'opts' && j === this.optIndex));
  }
  _changeOpt(d) {
    if (this.optIndex === 0) this.diffIndex = (this.diffIndex + d + DIFFS.length) % DIFFS.length;
    else if (this.optIndex === 1) this.lapsIndex = (this.lapsIndex + d + LAPS.length) % LAPS.length;
    else return;
    bus.emit('ui:move');
    this._refreshOpts(); this._refreshFocus();
    const v = this.optEls[this.optIndex].querySelector('.opt-val');
    v.classList.remove('bump'); void v.offsetWidth; v.classList.add('bump');
  }
  _start() {
    if (this.screen !== 'select') return;
    try { localStorage.setItem('tkr-settings', JSON.stringify({ charIndex: this.charIndex, diffIndex: this.diffIndex, lapsIndex: this.lapsIndex })); } catch (e) { /* ignore */ }
    bus.emit('ui:confirm');
    this.h.onStart && this.h.onStart(this.settings);
  }
  _gridCols() {
    try {
      const g = this.selectEl.querySelector('.sel-grid');
      const n = getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length;
      return n >= 1 && n <= 8 ? n : 2;
    } catch (e) { return 2; }
  }
  _refreshPause() { const vis = this._pauseVisible; this.pauseBtns.forEach((b) => b.classList.toggle('focus', b === vis[this.pauseIndex])); }
  _pauseAct(a) {
    if (this.screen !== 'pause') return;
    const btn = this.pauseBtns.find((x) => x.dataset.a === a);
    if (btn && btn.disabled) return;
    bus.emit('ui:confirm');
    if (a === 'resume') this.h.onResume && this.h.onResume();
    else if (a === 'netpause') this.h.onNetPause && this.h.onNetPause();
    else if (a === 'restart') this.h.onRestart && this.h.onRestart();
    else if (a === 'quit') this.h.onQuit && this.h.onQuit();
    else if (a === 'home') goHome();
  }

  // ------------------------------------------------------------------ input
  _key(e) {
    const c = e.code;
    const isEnter = c === 'Enter' || c === 'NumpadEnter' || c === 'Space';
    if (this.screen === 'title') {
      if ((isEnter || c === 'KeyE') && !e.repeat) { e.preventDefault(); this._activateMode(); }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(c)) {
        e.preventDefault();
        const vis = this.modeBtns.map((b, i) => i).filter((i) => !this.modeBtns[i].classList.contains('hidden'));
        const back = c === 'ArrowLeft' || c === 'ArrowUp' || c === 'KeyA' || c === 'KeyW';
        const at = Math.max(0, vis.indexOf(this.modeIndex));
        this.modeIndex = vis[(at + (back ? -1 : 1) + vis.length) % vis.length];
        this._refreshModes(); bus.emit('ui:move');
      }
      return;
    }
    if (this.screen === 'select') {
      const up = c === 'ArrowUp' || c === 'KeyW', down = c === 'ArrowDown' || c === 'KeyS';
      const left = c === 'ArrowLeft' || c === 'KeyA', right = c === 'ArrowRight' || c === 'KeyD';
      if (up || down || left || right || isEnter) e.preventDefault();
      if (c === 'Escape' || c === 'Backspace') {
        if (this.zone === 'opts') { this.zone = 'grid'; this._refreshFocus(); bus.emit('ui:back'); }
        else this._toTitle();
        return;
      }
      if (this.zone === 'grid') {
        const cols = this._gridCols(), i = this.charIndex, col = i % cols, row = Math.floor(i / cols), rows = Math.ceil(CHARACTERS.length / cols);
        if (left) this._setChar(col === 0 ? i + cols - 1 : i - 1);
        else if (right) {
          if (col === cols - 1) { this.zone = 'opts'; this.optIndex = 0; bus.emit('ui:move'); this._refreshFocus(); }
          else this._setChar(i + 1);
        } else if (up) this._setChar(((row - 1 + rows) % rows) * cols + col);
        else if (down) this._setChar(((row + 1) % rows) * cols + col);
        else if (isEnter && !e.repeat) this._confirmChar();
      } else {
        if (up) {
          if (this.optIndex === 0) { this.zone = 'grid'; } else this.optIndex--;
          bus.emit('ui:move'); this._refreshFocus();
        } else if (down) { this.optIndex = Math.min(2, this.optIndex + 1); bus.emit('ui:move'); this._refreshFocus(); }
        else if (left) {
          if (this.optIndex === 2) { this.zone = 'grid'; bus.emit('ui:move'); this._refreshFocus(); } else this._changeOpt(-1);
        } else if (right) { if (this.optIndex < 2) this._changeOpt(1); }
        else if (isEnter && !e.repeat) { if (this.optIndex === 2) this._start(); else this._changeOpt(1); }
      }
      return;
    }
    if (this.screen === 'pause') {
      const vis = this._pauseVisible, n = vis.length || 1;
      if (c === 'ArrowUp' || c === 'KeyW') { this.pauseIndex = (this.pauseIndex + n - 1) % n; this._refreshPause(); bus.emit('ui:move'); e.preventDefault(); }
      else if (c === 'ArrowDown' || c === 'KeyS') { this.pauseIndex = (this.pauseIndex + 1) % n; this._refreshPause(); bus.emit('ui:move'); e.preventDefault(); }
      else if (isEnter && !e.repeat && vis[this.pauseIndex]) { e.preventDefault(); this._pauseAct(vis[this.pauseIndex].dataset.a); }
    }
  }

  /** Poll gamepads; translate to synthetic key presses for menus (and Start -> Escape for pause). */
  update(dt, gameState) {
    this.gameState = gameState;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads || []) if (p && p.connected) { gp = p; break; }
    if (!gp) return;
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const now = {
      up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6,
      a: b(0), b: b(1), start: b(9),
    };
    const prev = this._pad.prev;
    // netpause: an online race paused for everyone (A = RESUME on the pause overlay)
    const inMenu = this.screen === 'title' || this.screen === 'select' || this.screen === 'pause' || this.screen === 'lobby' || gameState === 'results' || gameState === 'netpause';
    // cancelable, so a handler can tell (defaultPrevented) that the menu already used the press
    const fire = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }));
    if (inMenu) {
      const dirs = [['up', 'ArrowUp'], ['down', 'ArrowDown'], ['left', 'ArrowLeft'], ['right', 'ArrowRight']];
      let held = null;
      for (const [k, code] of dirs) {
        if (now[k] && !prev[k]) { fire(code); this._pad.repeatT = 0.4; }
        if (now[k]) held = code;
      }
      if (held) { this._pad.repeatT -= dt; if (this._pad.repeatT <= 0) { fire(held); this._pad.repeatT = 0.14; } }
      if (now.a && !prev.a) fire('Enter');
      if (now.b && !prev.b) fire(this.screen === 'pause' ? 'Escape' : 'Backspace');
    }
    // Start = confirm on title / lobby (in the lobby Escape would mean "leave the room"), pause elsewhere
    if (now.start && !prev.start) fire(this.screen === 'title' || this.screen === 'lobby' ? 'Enter' : 'Escape');
    if (gameState === 'intro' && now.a && !prev.a) fire('Enter');
    this._pad.prev = now;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    for (const s of [this.titleEl, this.selectEl, this.pauseEl, this.loadingEl]) s.remove();
  }
}
