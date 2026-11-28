// Online lobby screen: name, racer, create / join a room, invite link, live player list, host options.
// Same visual language as the other menus (styles.css). Keyboard: arrows move / change, Enter acts,
// Esc goes back; gamepad arrives as synthetic arrow / Enter / Backspace presses from Menu.update().
// Remote names are only ever written with textContent.
import { bus } from './events.js';
import { CHARACTERS } from './config.js';
import { LAP_CHOICES, sanitizeName, defaultName, filterCodeInput } from './online.js';
import { TRACKS } from './tracks.js';

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export class Lobby {
  /**
   * h: { onCreate(), onJoin(code), onLeave(), onBack(), onStart(), onProfile({name, char}), onOptions({laps, ai}) }
   */
  constructor(uiRoot, h = {}) {
    this.h = h;
    this.visible = false;
    this.portraitFn = null;
    this.model = { phase: 'menu', status: '', statusKind: '', code: '', link: '', players: [], isHost: false, laps: 3, ai: true, track: 'palm', canStart: false, waiting: '' };
    let name = '';
    let ci = 0;
    try { name = localStorage.getItem('tkr-name') || ''; } catch (e) { /* storage unavailable */ }
    try {
      const v = parseInt(localStorage.getItem('tkr-online-char'), 10);
      if (v >= 0 && v < CHARACTERS.length) ci = v;
      else {
        const s = JSON.parse(localStorage.getItem('tkr-settings') || '{}');
        if (s.charIndex >= 0 && s.charIndex < CHARACTERS.length) ci = s.charIndex;
      }
    } catch (e) { /* ignore */ }
    this.name = sanitizeName(name, '') || defaultName();
    this.charIndex = ci;
    this.navIndex = 0;
    this._build(uiRoot);
    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey);
  }

  get profile() { return { name: this.name, char: CHARACTERS[this.charIndex].id }; }

  /** Programmatic profile change (tests / restore). */
  setProfile({ name, char } = {}) {
    if (name != null) { this.name = sanitizeName(String(name), this.name); this.nameIn.value = this.name; this._saveName(); }
    if (char != null) {
      const i = typeof char === 'number' ? char : CHARACTERS.findIndex((c) => c.id === char);
      if (i >= 0 && i < CHARACTERS.length) this._setChar(i, true);
    }
  }

  setPortraitProvider(fn) {
    this.portraitFn = fn;
    this.charBtns.forEach((b, i) => {
      let url = '';
      try { url = fn ? fn(CHARACTERS[i]) || '' : ''; } catch (e) { url = ''; }
      if (url) { b.img.src = url; b.img.hidden = false; b.initial.hidden = true; }
    });
  }

  // ------------------------------------------------------------------ DOM
  _build(uiRoot) {
    const root = this.el = el('div', 'screen lobby-screen', uiRoot);
    const panel = el('div', 'lobby-panel', root);
    const head = el('div', 'lobby-head', panel);
    el('div', 'lobby-title', head, 'ONLINE RACE');
    this.statusEl = el('div', 'lobby-status', head);
    this.statusEl.setAttribute('role', 'status');

    const cols = el('div', 'lobby-cols', panel);
    const me = el('div', 'lobby-col lobby-me', cols);
    el('label', 'lobby-lbl', me, 'YOUR NAME').htmlFor = 'tkr-lobby-name';
    const nameIn = this.nameIn = el('input', 'lobby-input lobby-name', me);
    Object.assign(nameIn, { id: 'tkr-lobby-name', maxLength: 16, autocomplete: 'off', spellcheck: false, value: this.name });
    nameIn.dataset.nav = 'name';
    nameIn.addEventListener('change', () => this._commitName());
    nameIn.addEventListener('blur', () => this._commitName());

    el('div', 'lobby-lbl', me, 'RACER');
    const pick = el('div', 'lobby-charpick', me);
    pick.dataset.nav = 'char';
    const la = el('span', 'opt-arrow l', pick, '◀');
    const chars = el('div', 'lobby-chars', pick);
    const ra = el('span', 'opt-arrow r', pick, '▶');
    la.addEventListener('click', () => this._setChar(this.charIndex - 1));
    ra.addEventListener('click', () => this._setChar(this.charIndex + 1));
    this.charBtns = CHARACTERS.map((ch, i) => {
      const b = el('div', 'lobby-char', chars);
      b.style.setProperty('--kc', hex(ch.color));
      b.title = ch.name;
      const img = el('img', '', b); img.alt = ''; img.hidden = true;
      const initial = el('span', '', b, ch.name[0]);
      b.addEventListener('click', () => this._setChar(i));
      return { b, img, initial };
    });
    this.charName = el('div', 'lobby-charname', me);

    const main = el('div', 'lobby-col lobby-main', cols);
    // not in a room yet
    const secMenu = this.secMenu = el('div', 'lobby-sec', main);
    const create = el('button', 'btn primary lobby-create', secMenu, 'CREATE ROOM');
    create.dataset.nav = 'create';
    create.addEventListener('click', () => this.h.onCreate && this.h.onCreate());
    el('div', 'lobby-or', secMenu, 'OR JOIN WITH A CODE');
    const jr = el('div', 'lobby-row', secMenu);
    const code = this.codeIn = el('input', 'lobby-input lobby-code', jr);
    Object.assign(code, { maxLength: 6, placeholder: 'CODE', autocomplete: 'off', spellcheck: false });
    code.dataset.nav = 'code';
    code.addEventListener('input', () => { const v = filterCodeInput(code.value); if (v !== code.value) code.value = v; });
    const join = el('button', 'btn', jr, 'JOIN');
    join.dataset.nav = 'join';
    join.addEventListener('click', () => this.h.onJoin && this.h.onJoin(this.codeIn.value));

    // in a room
    const secRoom = this.secRoom = el('div', 'lobby-sec', main);
    const rc = el('div', 'lobby-roomcode', secRoom);
    el('span', 'lbl', rc, 'ROOM');
    this.roomCodeEl = el('span', 'code', rc);
    const inv = el('div', 'lobby-row', secRoom);
    const link = this.linkIn = el('input', 'lobby-input lobby-link', inv);
    link.readOnly = true;
    link.dataset.nav = 'link';
    link.addEventListener('focus', () => { try { link.select(); } catch (e) { /* ignore */ } });
    const copy = el('button', 'btn small', inv, 'COPY LINK');
    copy.dataset.nav = 'copy';
    copy.addEventListener('click', () => this._copy());
    this.copiedEl = el('div', 'lobby-note', secRoom);
    this.playersEl = el('div', 'lobby-players', secRoom);
    const hostBox = this.hostBox = el('div', 'lobby-host', secRoom);
    this.trackOpt = this._opt(hostBox, 'track', 'TRACK', (d) => this._changeTrack(d));
    this.lapsOpt = this._opt(hostBox, 'laps', 'LAPS', (d) => this._changeLaps(d));
    this.aiOpt = this._opt(hostBox, 'ai', 'AI RACERS', () => this._toggleAI());
    const start = this.startBtn = el('button', 'btn primary lobby-start', hostBox, 'START RACE');
    start.dataset.nav = 'start';
    start.addEventListener('click', () => { if (!start.disabled) this.h.onStart && this.h.onStart(); });
    this.waitEl = el('div', 'lobby-wait', secRoom);

    const foot = el('div', 'lobby-foot', panel);
    const back = this.backBtn = el('button', 'btn', foot, 'BACK');
    back.dataset.nav = 'back';
    back.addEventListener('click', () => this._back());

    // pointer hover / focus keeps the keyboard focus in sync
    root.addEventListener('mouseover', (e) => {
      const t = e.target.closest && e.target.closest('[data-nav]');
      if (t) this._focusEl(t, false);
    });
    root.addEventListener('focusin', (e) => {
      const t = e.target.closest && e.target.closest('[data-nav]');
      if (t) this._focusEl(t, false);
    });
    this._setChar(this.charIndex, true);
    this.render({});
  }

  _opt(parent, nav, label, change) {
    const o = el('div', 'opt', parent);
    o.dataset.nav = nav;
    el('span', 'opt-lbl', o, label);
    const l = el('span', 'opt-arrow l', o, '◀');
    const val = el('span', 'opt-val', o);
    const r = el('span', 'opt-arrow r', o, '▶');
    l.addEventListener('click', (e) => { e.stopPropagation(); change(-1); });
    r.addEventListener('click', (e) => { e.stopPropagation(); change(1); });
    val.addEventListener('click', () => change(1));
    return { o, val };
  }

  // ------------------------------------------------------------------ state
  show() {
    this.visible = true;
    this.el.classList.add('active');
    this._navToDefault();
    this._refreshFocus(false);
  }

  /** Start keyboard nav on the screen's main button, never on a text field that isn't really focused. */
  _navToDefault() {
    const list = this._navEls();
    for (const nav of ['start', 'copy', 'create']) {
      const i = list.findIndex((e) => e.dataset.nav === nav);
      if (i >= 0) { this.navIndex = i; return; }
    }
    this.navIndex = 0;
  }
  hide() {
    this.visible = false;
    this.el.classList.remove('active');
    if (document.activeElement && this.el.contains(document.activeElement)) document.activeElement.blur();
  }

  setStatus(text, kind = '') { this.model.status = text; this.model.statusKind = kind; this._renderStatus(); }

  /** model: { phase: 'menu'|'room', status, statusKind, code, link, players: [{id,name,char,host,me}], isHost, laps, ai, canStart, waiting } */
  render(model) {
    const prevPhase = this.model.phase, prevHost = this.model.isHost;
    Object.assign(this.model, model);
    const m = this.model;
    const room = m.phase === 'room';
    this.secMenu.hidden = room;
    this.secRoom.hidden = !room;
    this.backBtn.textContent = room ? 'LEAVE ROOM' : 'BACK';
    this._renderStatus();
    if (room) {
      this.roomCodeEl.textContent = m.code || '';
      if (this.linkIn.value !== m.link) { this.linkIn.value = m.link || ''; this.copiedEl.textContent = ''; }
      this._renderPlayers(m.players || []);
      this.hostBox.hidden = !m.isHost;
      const tr = TRACKS.find((t) => t.id === m.track) || TRACKS[0];
      const hard = tr.difficulty === 'hard';
      this.trackOpt.val.textContent = tr.name.toUpperCase();
      this.trackOpt.o.querySelector('.opt-lbl').textContent = hard ? 'HARD TRACK' : 'TRACK';
      this.trackOpt.o.classList.toggle('hard', hard);
      this.lapsOpt.val.textContent = `${m.laps} LAP${m.laps > 1 ? 'S' : ''}`;
      this.aiOpt.val.textContent = m.ai ? 'FILL TO 8' : 'OFF';
      this.startBtn.disabled = !m.canStart;
      this.waitEl.hidden = m.isHost;
      this.waitEl.textContent = m.waiting || '';
    }
    // the set of controls changed (entered / left a room, became host): move nav to the new main button,
    // unless the player is typing in a field right now
    const ae = document.activeElement;
    const typingNow = !!(ae && ae.tagName === 'INPUT' && this.el.contains(ae) && !ae.closest('[hidden]'));
    if ((m.phase !== prevPhase || m.isHost !== prevHost) && !typingNow) this._navToDefault();
    this._refreshFocus(false);
  }

  _renderStatus() {
    this.statusEl.textContent = this.model.status || '';
    this.statusEl.className = 'lobby-status' + (this.model.statusKind ? ' ' + this.model.statusKind : '');
  }

  _renderPlayers(players) {
    const P = this.playersEl;
    P.textContent = '';
    for (const p of players) {
      const ch = CHARACTERS.find((c) => c.id === p.char) || CHARACTERS[0];
      const row = el('div', 'lobby-player' + (p.me ? ' me' : ''), P);
      const chip = el('span', 'st-chip', row);
      chip.style.background = hex(ch.color);
      el('span', 'lp-name', row, p.name);
      el('span', 'lp-char', row, ch.name);
      if (p.host) el('span', 'lp-badge host', row, 'HOST');
      if (p.me) el('span', 'lp-badge', row, 'YOU');
    }
    const n = players.length;
    el('div', 'lobby-count', P, `${n} / 8 RACER${n === 1 ? '' : 'S'}`);
  }

  _setChar(i, silent = false) {
    const n = CHARACTERS.length;
    i = ((i % n) + n) % n;
    const changed = i !== this.charIndex;
    this.charIndex = i;
    this.charBtns.forEach((c, j) => c.b.classList.toggle('selected', j === i));
    this.charName.textContent = CHARACTERS[i].name.toUpperCase();
    try { localStorage.setItem('tkr-online-char', String(i)); } catch (e) { /* ignore */ }
    if (!silent) {
      if (changed) bus.emit('ui:move');
      this.h.onProfile && this.h.onProfile(this.profile);
    }
  }

  _commitName() {
    const n = sanitizeName(this.nameIn.value, '') || defaultName();
    this.nameIn.value = n;
    if (n === this.name) return;
    this.name = n;
    this._saveName();
    this.h.onProfile && this.h.onProfile(this.profile);
  }
  _saveName() { try { localStorage.setItem('tkr-name', this.name); } catch (e) { /* ignore */ } }

  _changeLaps(d) {
    if (!this.model.isHost) return;
    const i = LAP_CHOICES.indexOf(this.model.laps);
    const laps = LAP_CHOICES[(Math.max(0, i) + d + LAP_CHOICES.length) % LAP_CHOICES.length];
    bus.emit('ui:move');
    this.h.onOptions && this.h.onOptions({ laps });
  }
  _changeTrack(d) {
    if (!this.model.isHost) return;
    const i = TRACKS.findIndex((t) => t.id === this.model.track);
    const track = TRACKS[(Math.max(0, i) + d + TRACKS.length) % TRACKS.length].id;
    bus.emit('ui:move');
    this.h.onOptions && this.h.onOptions({ track });
  }
  _toggleAI() {
    if (!this.model.isHost) return;
    bus.emit('ui:move');
    this.h.onOptions && this.h.onOptions({ ai: !this.model.ai });
  }

  _copy() {
    const link = this.model.link || '';
    const fallback = () => {
      try { this.linkIn.focus(); this.linkIn.select(); } catch (e) { /* ignore */ }
      this.copiedEl.textContent = 'Copy the link above and send it to your friends.';
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(() => { this.copiedEl.textContent = 'Link copied! Send it to your friends.'; }, fallback);
      } else fallback();
    } catch (e) { fallback(); }
    bus.emit('ui:confirm');
  }

  _back() {
    bus.emit('ui:back');
    if (this.model.phase === 'room') this.h.onLeave && this.h.onLeave();
    else this.h.onBack && this.h.onBack();
  }

  // ------------------------------------------------------------------ focus / keys
  _navEls() {
    return [...this.el.querySelectorAll('[data-nav]')].filter((e) => !e.closest('[hidden]') && !e.disabled);
  }
  _current() { return this._navEls()[this.navIndex] || null; }
  _focusEl(t, domFocus = true) {
    const list = this._navEls();
    const i = list.indexOf(t);
    if (i < 0) return;
    if (i !== this.navIndex) { this.navIndex = i; this._refreshFocus(domFocus); }
  }
  _refreshFocus(domFocus = true) {
    const list = this._navEls();
    if (this.navIndex >= list.length) this.navIndex = Math.max(0, list.length - 1);
    const cur = list[this.navIndex];
    for (const e of this.el.querySelectorAll('[data-nav]')) e.classList.toggle('focus', e === cur);
    if (!domFocus) return;
    const active = document.activeElement;
    if (cur && cur.tagName === 'INPUT') { if (active !== cur) cur.focus(); }
    else if (active && active.tagName === 'INPUT' && this.el.contains(active)) active.blur();
  }
  _move(d) {
    const n = this._navEls().length;
    if (!n) return;
    this.navIndex = (this.navIndex + d + n) % n;
    bus.emit('ui:move');
    this._refreshFocus(true);
  }

  _key(e) {
    if (!this.visible) return;
    const c = e.code;
    const tgt = e.target;
    const typing = !!(tgt && tgt.tagName === 'INPUT' && !tgt.readOnly);
    // keys belong to the field that really has focus, not to whatever the mouse last hovered
    if (tgt && tgt.tagName === 'INPUT' && tgt.dataset && tgt.dataset.nav && this.el.contains(tgt)) {
      const i = this._navEls().indexOf(tgt);
      if (i >= 0 && i !== this.navIndex) { this.navIndex = i; this._refreshFocus(false); }
    }
    const cur = this._current();
    const nav = cur ? cur.dataset.nav : '';
    if (c === 'ArrowDown' || (c === 'Tab' && !e.shiftKey)) { e.preventDefault(); this._move(1); return; }
    if (c === 'ArrowUp' || (c === 'Tab' && e.shiftKey)) { e.preventDefault(); this._move(-1); return; }
    if (c === 'ArrowLeft' || c === 'ArrowRight') {
      if (typing) return; // caret movement inside a text field
      e.preventDefault();
      const d = c === 'ArrowLeft' ? -1 : 1;
      if (nav === 'char') this._setChar(this.charIndex + d);
      else if (nav === 'laps') this._changeLaps(d);
      else if (nav === 'track') this._changeTrack(d);
      else if (nav === 'ai') this._toggleAI();
      else if (nav === 'join' || nav === 'copy' || nav === 'code' || nav === 'link') this._move(d);
      return;
    }
    if (c === 'Enter' || c === 'NumpadEnter' || (c === 'Space' && !typing)) {
      if (e.repeat) return;
      e.preventDefault();
      if (nav === 'name') { this._commitName(); this._move(1); }
      else if (nav === 'char') this._move(1);
      else if (nav === 'code') this.h.onJoin && this.h.onJoin(this.codeIn.value);
      else if (nav === 'laps') this._changeLaps(1);
      else if (nav === 'track') this._changeTrack(1);
      else if (nav === 'ai') this._toggleAI();
      else if (nav === 'link') this._copy();
      else if (cur && cur.tagName === 'BUTTON' && !cur.disabled) cur.click();
      return;
    }
    // Backspace is "back" only away from text fields (a highlighted-but-unfocused field must not leave the room)
    if (c === 'Escape' || (c === 'Backspace' && !typing && !(cur && cur.tagName === 'INPUT'))) {
      e.preventDefault();
      if (typing && c === 'Escape') { tgt.blur(); return; }
      this._back();
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    this.el.remove();
  }
}
