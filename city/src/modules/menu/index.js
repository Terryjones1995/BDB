/**
 * menu module — the start screen.
 *
 * Unlike every other module this one is imported DIRECTLY by src/main.js *before* the module loop,
 * so the player's choice of seed reaches the terrain generator. Its `init()` is therefore a no-op:
 * by the time the registry gets here the screen has already been shown and dismissed.
 *
 * Contract (called by core):
 *   showStartScreen(ctx) -> Promise<{ mode:'village'|'town'|'new'|'demo', seed:number, cityName:string, quality?:string }>
 *     village / town = a starter city (demo/StarterTown.js), new = bare land, demo = the big generated city
 *   setProgress(fraction, text)   optional, mirrors the core loading bar
 *   hide()
 *
 * The screen is skipped entirely when the URL pins the world (?demo=, ?showcase=, ?headless=),
 * so all screenshot tooling keeps working. See Config.menu.
 *
 * Notes on two deliberate choices:
 *  - The overlay is appended to <body>, not ctx.uiRoot, because core re-shows its own #loading
 *    (z-index 100) as soon as the choice resolves. Sitting above it lets the panel keep showing
 *    progress instead of the player staring at a bare bar.
 *  - The promise resolves on click but the overlay stays up, turns into a loading card and mirrors
 *    core's progress, then fades out on `game:ready`.
 */
import { injectStyles } from './styles.js';
import { suggestName, randomSeed } from './names.js';
import { makeHeightSource } from './heightsource.js';
import { paintRelief } from './Minimap.js';
import { Store, newCityId } from '../../save/store.js';
import { Cloud, cloudWhy, cloudSays } from '../../save/cloud.js';
import { unpack } from '../../save/codec.js';
import { fromRescue, whyNotLoadable } from '../../save/snapshot.js';
import { ago } from '../../save/session.js';
import { RESCUE_KEY } from '../../rescue-key.js';

export const name = 'menu';

const STORE_KEY = 'fable.menu.v2';
const QUALITIES = [
  ['low', 'Low', 'Fastest. No ambient occlusion, no reflections.'],
  ['medium', 'Medium', 'For laptops and integrated graphics.'],
  ['high', 'High', 'Recommended. Soft shadows, AO, water reflections.'],
  ['ultra', 'Ultra', '4K shadows and the longest draw distance.'],
];

let root = null;
let els = null;
let backdrop = null;
let source = null;
let resolveChoice = null;
let progress = { target: 0.02, shown: 0, text: 'Preparing', stamp: 0, timer: 0 };
let observers = [];
let cleanups = [];
let disposed = false;

export async function init() {
  /* the start screen already ran; nothing to do at module-init time */
}

export function update() {}

// -------------------------------------------------------------------------------------- contract

/**
 * Show the start screen and resolve once the player picks a world.
 * `opts.preview` (used by showcase.js) resolves and dismisses instead of entering the loading phase,
 * because in a showcase the world is already built.
 */
export function showStartScreen(ctx, opts = {}) {
  const { world, config, events } = ctx;
  const preview = !!opts.preview;
  disposed = false;
  injectStyles();

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const restored = readStore();
  const currentQuality = config.quality || 'high';
  // Every new game gets its own map: a fresh random seed, unless the address names one (?seed=) or this
  // is the reload a quality change makes, in which case the seed the player was looking at comes back.
  const seed0 = clampSeed(restored && Number.isFinite(restored.seed) ? restored.seed
    : (config.seedPinned ? config.seed : randomSeed()));
  const name0 = (restored && restored.cityName) || '';

  root = document.createElement('div');
  root.className = 'fm-root';
  root.dataset.phase = 'choose';
  root.innerHTML = markup(seed0, suggestName(seed0), name0, currentQuality);
  document.body.appendChild(root);

  const $ = (sel) => root.querySelector(sel);
  els = {
    bg: $('#fm-bg'),
    fallback: $('#fm-bg-fallback'),
    form: $('#fm-form'),
    nameInput: $('#fm-name'),
    seedInput: $('#fm-seed'),
    reroll: $('#fm-reroll'),
    seedmap: $('#fm-seedmap'),
    seedTag: $('#fm-seed-tag'),
    qnote: $('#fm-qnote'),
    newBtn: $('#fm-new'),
    villageBtn: $('#fm-village'),
    townBtn: $('#fm-town'),
    demoBtn: $('#fm-demo'),
    help: $('#fm-help'),
    helpNote: $('#fm-help-note'),
    loadName: $('#fm-load-name'),
    loadMeta: $('#fm-load-meta'),
    bar: $('#fm-bar'),
    status: $('#fm-status-text'),
    pct: $('#fm-pct'),
    applyTxt: $('#fm-apply-txt'),
    foot: $('#fm-foot-seed'),
    tabCities: $('#fm-tab-cities'), tabNew: $('#fm-tab-new'), count: $('#fm-count'),
    account: $('#fm-account'), cityList: $('#fm-citylist'), citiesNote: $('#fm-cities-note'),
    fileBtn: $('#fm-file'), fileInput: $('#fm-file-input'),
  };

  // ---- backdrop + seed preview ------------------------------------------------------------
  bootVisuals(seed0, reduced);

  // ---- seed field -------------------------------------------------------------------------
  let mapTimer = 0;
  let bgTimer = 0;
  const onSeedChanged = (seed, immediate) => {
    els.seedTag.textContent = `Seed ${seed}`;
    els.foot.textContent = `Seed ${seed} · 2048 m`;
    els.nameInput.dataset.suggested = suggestName(seed);
    clearTimeout(mapTimer);
    clearTimeout(bgTimer);
    mapTimer = setTimeout(() => refreshSource(seed, 'map'), immediate ? 0 : 140);
    bgTimer = setTimeout(() => refreshSource(seed, 'backdrop'), immediate ? 60 : 460);
  };
  on(els.seedInput, 'input', () => {
    const v = els.seedInput.value.trim();
    if (v === '') return;
    const parsed = parseInt(v, 10);
    const seed = clampSeed(parsed);
    // a number input ignores maxlength, so keep the field honest about what it is generating
    if (!Number.isFinite(parsed) || parsed !== seed) els.seedInput.value = String(seed);
    onSeedChanged(seed, false);
  });
  on(els.seedInput, 'blur', () => {
    const s = clampSeed(parseInt(els.seedInput.value, 10));
    els.seedInput.value = String(s);
    onSeedChanged(s, false);
  });
  on(els.reroll, 'click', () => {
    const s = randomSeed();
    els.seedInput.value = String(s);
    els.reroll.dataset.spin = '1';
    setTimeout(() => { if (els && els.reroll) delete els.reroll.dataset.spin; }, 520);
    onSeedChanged(s, true);
  });

  // ---- quality ----------------------------------------------------------------------------
  const setNote = (q, prefix) => {
    const row = QUALITIES.find((r) => r[0] === q);
    els.qnote.textContent = (prefix || '') + (row ? row[2] : '');
  };
  setNote(currentQuality);
  if (restored && restored.appliedQuality && restored.appliedQuality === currentQuality) {
    setNote(currentQuality, `${cap(currentQuality)} quality applied — `);
    els.qnote.dataset.ok = '1';
    setTimeout(() => { if (els) { setNote(currentQuality); delete els.qnote.dataset.ok; } }, 7000);
  }
  for (const input of root.querySelectorAll('input[name="fm-quality"]')) {
    on(input, 'change', () => {
      const q = input.value;
      setNote(q);
      if (q === currentQuality) return;
      applyQuality(q, ctx);
    });
  }

  // ---- choices ----------------------------------------------------------------------------
  const wasPaused = world.time.paused;
  const choose = (mode) => {
    if (!root || root.dataset.phase !== 'choose') return;
    const seed = clampSeed(parseInt(els.seedInput.value, 10));
    const cityName = (els.nameInput.value || els.nameInput.dataset.suggested || 'New Charleston').trim().slice(0, 28);
    world.time.paused = wasPaused;
    if (preview) { setTimeout(hide, 60); }
    else { enterLoading(mode, seed, cityName); watchCoreProgress(events); }
    // every start but the demo city is a city that will be kept, and so needs a name of its own in the saves
    const city = mode === 'demo' ? null : { id: newCityId(), start: mode === 'new' ? 'empty' : mode, owner: '', cloudRev: 0, cloudAt: null };
    const choice = { mode, seed, cityName, quality: currentQuality, city };
    if (resolveChoice) { const r = resolveChoice; resolveChoice = null; r(choice); }
  };
  /** Open a saved city: `snap` is the unpacked snapshot, `city` what the saves need to know about it. */
  const openCity = (snap, city) => {
    if (!root || root.dataset.phase !== 'choose') return;
    world.time.paused = wasPaused;
    const cityName = String(snap.name || 'City').slice(0, 40);
    if (preview) { setTimeout(hide, 60); }
    else { enterLoading('load', snap.seed, cityName); watchCoreProgress(events); }
    const choice = { mode: 'load', seed: snap.seed, cityName, quality: currentQuality, snapshot: snap, city };
    if (resolveChoice) { const r = resolveChoice; resolveChoice = null; r(choice); }
  };
  setupCities({ on, openCity, world });
  on(els.villageBtn, 'click', () => choose('village'));
  on(els.townBtn, 'click', () => choose('town'));
  on(els.newBtn, 'click', () => choose('new'));
  on(els.demoBtn, 'click', () => choose('demo'));
  // Enter takes the recommended start: a village, the gentlest way in
  on(els.form, 'submit', (e) => { e.preventDefault(); choose('village'); });

  // ---- keyboard -----------------------------------------------------------------------------
  on(root, 'keydown', (e) => {
    if (e.key !== 'Tab' || root.dataset.phase !== 'choose') return;
    const f = focusables();
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  on(window, 'resize', () => { if (backdrop) backdrop.resize(); });

  if (!preview) world.time.paused = true;
  setTimeout(() => { if (els && els.villageBtn && root.dataset.tab !== 'cities') els.villageBtn.focus({ preventScroll: true }); }, 80);

  return new Promise((resolve) => { resolveChoice = resolve; });
}

/** Mirrors the core loading bar into the panel. Safe to call before or after the choice. */
export function setProgress(fraction, text) {
  if (Number.isFinite(fraction)) {
    progress.target = Math.max(progress.target, Math.min(1, Math.max(0, fraction)));
    progress.stamp = performance.now();
  }
  if (text) progress.text = String(text);
  paintProgress();
}

/** Tear the screen down (fade, then remove). Core may call this; the menu also calls it itself. */
export function hide() {
  if (!root || disposed) return;
  disposed = true;
  const el = root;
  el.dataset.hidden = '1';
  el.setAttribute('aria-hidden', 'true');
  for (const fn of cleanups) { try { fn(); } catch (e) { /* teardown must not throw */ } }
  cleanups = [];
  for (const o of observers) { try { o.disconnect(); } catch (e) { /* idem */ } }
  observers = [];
  clearInterval(progress.timer);
  progress.timer = 0;
  const bd = backdrop;
  backdrop = null;
  root = null;
  els = null;
  setTimeout(() => {
    if (bd) bd.dispose();
    el.remove();
    const canvas = document.getElementById('game');
    if (canvas && document.activeElement === document.body) canvas.focus({ preventScroll: true });
  }, 620);
}

// ------------------------------------------------------------------------------------- internals

function bootVisuals(seed, reduced) {
  makeHeightSource(seed).then(async (src) => {
    if (!root) return;
    source = src;
    paintSeedMap();
    const tier = (window.innerWidth * window.innerHeight) < 620000 || (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'high';
    try {
      const { Backdrop } = await import('./Backdrop.js');
      if (!root) return;
      backdrop = new Backdrop(els.bg, { reducedMotion: reduced, tier });
      if (!backdrop.ok) { backdrop = null; return; }
      backdrop.resize();
      await backdrop.setSource(src);
      if (!root || !backdrop) return;
      root.dataset.bg = '1';
      if (!reduced) backdrop.start(); else backdrop.renderOnce();
    } catch (err) {
      // no WebGL for a second context — the CSS sky + the relief chart already carry the screen
      backdrop = null;
      console.info('[menu] 3D backdrop unavailable', err && err.message);
    }
  });
}

function refreshSource(seed, what) {
  makeHeightSource(seed).then((src) => {
    if (!root) return;
    source = src;
    if (what === 'map') paintSeedMap();
    else if (backdrop) backdrop.setSource(src);
  });
}

function paintSeedMap() {
  if (!els || !els.seedmap || !source) return;
  try { paintRelief(els.seedmap, source, { grid: 168 }); } catch (e) { /* preview is decorative */ }
}

function applyQuality(q, ctx) {
  // A reload is the only bulletproof way to change quality: Engine reads it once, at construction.
  writeStore({
    seed: clampSeed(parseInt(els.seedInput.value, 10)),
    cityName: els.nameInput.value.trim(),
    appliedQuality: q,
  });
  root.dataset.phase = 'applying';
  els.applyTxt.textContent = `Applying ${cap(q)} quality…`;
  const url = new URL(window.location.href);
  url.searchParams.set('quality', q);
  setTimeout(() => window.location.replace(url.toString()), 380);
}

// ---------------------------------------------------------------------------- your cities
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = (n) => Math.round(n || 0).toLocaleString('en-US');

/**
 * The "Your cities" tab: cities saved on this device, cities saved online, a city rescued out of
 * an old tab, and the account that ties them together. Nothing here is needed to play: with no
 * storage and no server the tab is simply empty and "New city" works as before.
 */
function setupCities({ on, openCity, world }) {
  let rows = [];            // what the list shows: { id, name, summary, when, where, source, meta }
  let touched = false;      // the player picked a tab themselves: stop choosing one for them
  let busyId = null;
  const note = (text, bad) => { if (els && els.citiesNote) { els.citiesNote.textContent = text || ''; els.citiesNote.dataset.bad = bad ? '1' : ''; } };
  const setTab = (tab, byPlayer) => {
    if (!root) return;
    if (byPlayer) touched = true;
    root.dataset.tab = tab;
    els.tabCities.setAttribute('aria-selected', String(tab === 'cities'));
    els.tabNew.setAttribute('aria-selected', String(tab === 'new'));
  };
  setTab('new', false);
  on(els.tabCities, 'click', () => setTab('cities', true));
  on(els.tabNew, 'click', () => setTab('new', true));

  // ---- the rescued city, if this browser holds one
  const rescueRow = () => {
    let doc = null;
    try { doc = JSON.parse(localStorage.getItem(RESCUE_KEY)); } catch (_) { /* nothing stored */ }
    const snap = doc ? fromRescue(doc) : null;
    if (!snap) return null;
    return { id: 'rescue', name: snap.name, summary: snap.summary, when: Date.parse(snap.savedAt) || 0, where: 'rescued from an open tab', source: 'rescue', snap };
  };

  const paint = () => {
    if (!els || !els.cityList) return;
    els.count.textContent = rows.length ? String(rows.length) : '';
    if (!rows.length) {
      els.cityList.innerHTML = '<p class="fm-empty">No saved cities yet. Start one under <b>New city</b> and it will be kept here.</p>';
      return;
    }
    els.cityList.innerHTML = rows.map((r) => {
      const s = r.summary || {};
      const facts = [`${fmtN(s.population)} people`, r.when ? ago(r.when) : null, r.where].filter(Boolean).join(' · ');
      return `<div class="fm-city" role="listitem" data-id="${esc(r.id)}"${busyId === r.id ? ' data-busy="1"' : ''}>
        <button class="fm-city__open" type="button" data-open="${esc(r.id)}">
          <span class="fm-city__name">${esc(r.name)}</span>
          <span class="fm-city__meta">${esc(facts)}</span>
        </button>
        <button class="fm-city__del" type="button" data-del="${esc(r.id)}" aria-label="Delete ${esc(r.name)}" title="Delete">&times;</button>
      </div>`;
    }).join('');
  };

  /** Device and online lists merged: one row per city, pointing at whichever copy is newer. */
  const refresh = async () => {
    const out = [];
    const r = rescueRow();
    if (r) out.push(r);
    const device = await Store.list().catch(() => []);
    const byId = new Map();
    const sess = Cloud.session();
    const me = sess ? sess.name.toLowerCase() : null;
    for (const m of device) {
      // on a shared computer, a city that belongs to another account is not listed for this one
      if (me && m.owner && m.owner !== me) continue;
      byId.set(m.id, { id: m.id, name: m.name, summary: m.summary, when: m.updatedAt, where: 'on this device', source: 'device', meta: m });
    }
    if (Cloud.state === 'ready' && sess) {
      try {
        const res = await Cloud.list();
        for (const c of (res && res.cities) || []) {
          const d = byId.get(c.id);
          const when = Date.parse(c.updated_at) || 0;
          const online = { id: c.id, name: c.name, summary: { population: c.population, money: c.money, happiness: c.happiness, day: c.day }, when, where: 'online', source: 'cloud', cloud: c, meta: d ? d.meta : null };
          // the device copy wins while it has changes that have not gone up; otherwise a higher revision online wins
          if (!d) byId.set(c.id, online);
          else if (!d.meta.dirty && c.rev > (d.meta.cloudRev || 0)) byId.set(c.id, online);
          else d.where = d.meta.dirty ? 'on this device, not yet online' : 'on this device and online';
        }
      } catch (e) { note(cloudWhy(e), true); }
    }
    rows = out.concat([...byId.values()].sort((a, b) => (b.when || 0) - (a.when || 0)));
    paint();
    if (!touched && rows.length) setTab('cities', false);
  };

  // ---- the account line
  const paintAccount = () => {
    if (!els || !els.account) return;
    const sess = Cloud.session();
    if (Cloud.state === 'unknown') { els.account.innerHTML = '<p class="fm-account__line">Looking for online saves…</p>'; return; }
    if (Cloud.state !== 'ready') {
      els.account.innerHTML = `<p class="fm-account__line">${Cloud.state === 'setup' || Cloud.state === 'off'
        ? 'Cities are kept on this device. Online saving is not switched on yet.'
        : 'Cities are kept on this device. The account server cannot be reached right now. <button class="fm-link" type="button" id="fm-retry">Try again</button>'}</p>`;
      return;
    }
    if (sess) {
      els.account.innerHTML = `<p class="fm-account__line">Signed in as <b>${esc(sess.name)}</b>. Your cities are kept online too. <button class="fm-link" type="button" id="fm-signout">Sign out</button></p>`;
      return;
    }
    els.account.innerHTML = `<p class="fm-account__line">Sign in to keep your cities online and open them on any computer. A Brawl account works here too.</p>
      <div class="fm-signin">
        <input class="fm-input" id="fm-acc-name" type="text" maxlength="20" autocomplete="username" spellcheck="false" placeholder="Name" aria-label="Account name">
        <input class="fm-input" id="fm-acc-pass" type="password" maxlength="72" autocomplete="current-password" placeholder="Password" aria-label="Password">
        <button class="fm-btn" type="button" id="fm-acc-in">Sign in</button>
        <button class="fm-btn fm-btn--quiet" type="button" id="fm-acc-new">Create account</button>
      </div>`;
  };
  const sign = async (create) => {
    const name = (root.querySelector('#fm-acc-name') || {}).value || '', pass = (root.querySelector('#fm-acc-pass') || {}).value || '';
    if (name.trim().length < 2 || pass.length < 4) { note(cloudSays('bad_input'), true); return; }
    note(create ? 'Creating your account…' : 'Signing in…');
    try {
      const r = create ? await Cloud.register(name, pass) : await Cloud.login(name, pass);
      if (r && r.token) { note(''); paintAccount(); await claim(); await refresh(); }
      else note(cloudSays(r && r.error), true);
    } catch (e) { note(cloudWhy(e), true); }
  };
  /** Cities made on this device before anyone signed in belong to whoever signs in first. */
  const claim = async () => {
    const sess = Cloud.session();
    if (!sess) return;
    const me = sess.name.toLowerCase();
    for (const m of await Store.list().catch(() => [])) if (!m.owner) await Store.patch(m.id, { owner: me, dirty: true }).catch(() => {});
    // and anything waiting on this device goes up now, quietly, so it is there from any computer
    for (const m of await Store.list().catch(() => [])) {
      if (m.owner !== me || !m.dirty) continue;
      const rec = await Store.get(m.id);
      if (!rec || rec.data.length > Cloud.limits.bytes) continue;
      try {
        const r = await Cloud.save(rec);
        if (r && r.ok) await Store.patch(m.id, { cloudRev: r.rev, cloudAt: r.updated_at, dirty: false });
      } catch (_) { break; }      // offline: the game will try again while playing
    }
  };

  on(els.account, 'click', (e) => {
    const t = e.target;
    if (t.id === 'fm-signout') { Cloud.signOut(); paintAccount(); refresh(); }
    else if (t.id === 'fm-retry') { Cloud.state = 'unknown'; paintAccount(); connect(); }
    else if (t.id === 'fm-acc-in') sign(false);
    else if (t.id === 'fm-acc-new') sign(true);
  });
  on(els.account, 'keydown', (e) => { if (e.key === 'Enter' && (e.target.id === 'fm-acc-name' || e.target.id === 'fm-acc-pass')) { e.preventDefault(); e.stopPropagation(); sign(false); } });

  // ---- opening and deleting
  const open = async (row) => {
    if (busyId) return;
    busyId = row.id;
    paint();
    note(`Opening ${row.name}…`);
    try {
      let snap = null, city = null;
      if (row.source === 'rescue') {
        snap = row.snap;
        city = { id: newCityId(), start: snap.start || 'empty', owner: '', cloudRev: 0, cloudAt: null, rescued: true };
      } else if (row.source === 'cloud') {
        const res = await Cloud.load(row.id);
        if (!res || res.error) throw new Error(cloudSays(res && res.error));
        snap = await unpack(res.data);
        const sess = Cloud.session();
        city = { id: row.id, start: res.start || snap.start || 'empty', owner: sess ? sess.name.toLowerCase() : '', cloudRev: res.rev || 0, cloudAt: res.updated_at || null };
        // keep a copy here straight away: the next save only has to add to it
        await Store.put({ id: row.id, name: res.name, seed: res.seed, start: city.start, owner: city.owner, updatedAt: Date.parse(res.updated_at) || Date.now(),
          summary: snap.summary, data: res.data, cloudRev: city.cloudRev, cloudAt: city.cloudAt, dirty: false }).catch(() => {});
      } else {
        const rec = await Store.get(row.id);
        if (!rec) throw new Error('That city is no longer on this device.');
        snap = await unpack(rec.data);
        city = { id: rec.id, start: rec.start || snap.start || 'empty', owner: rec.owner || '', cloudRev: rec.cloudRev || 0, cloudAt: rec.cloudAt || null };
      }
      const why = whyNotLoadable(snap, world);
      if (why) throw new Error(`This city cannot be opened: ${why}.`);
      note('');
      openCity(snap, city);
    } catch (err) {
      busyId = null;
      paint();
      note(err && err.kind ? cloudWhy(err) : (err && err.message) || 'That city could not be opened.', true);
    }
  };
  let confirmId = null;
  on(els.cityList, 'click', async (e) => {
    const openBtn = e.target.closest('[data-open]'), delBtn = e.target.closest('[data-del]');
    if (openBtn) { const row = rows.find((r) => r.id === openBtn.dataset.open); if (row) open(row); return; }
    if (!delBtn) return;
    const row = rows.find((r) => r.id === delBtn.dataset.del);
    if (!row) return;
    if (confirmId !== row.id) {            // first press asks, second press does it
      confirmId = row.id;
      note(`Delete ${row.name} for good? Press × again to confirm.`, true);
      setTimeout(() => { if (confirmId === row.id) { confirmId = null; note(''); } }, 6000);
      return;
    }
    confirmId = null;
    note(`Deleting ${row.name}…`);
    try {
      if (row.source === 'rescue') localStorage.removeItem(RESCUE_KEY);
      else {
        await Store.remove(row.id).catch(() => {});
        if (Cloud.state === 'ready' && Cloud.session() && (row.source === 'cloud' || (row.meta && row.meta.cloudRev))) await Cloud.remove(row.id).catch(() => {});
      }
      note(`${row.name} was deleted.`);
    } catch (_) { note('That city could not be deleted.', true); }
    refresh();
  });

  // ---- a city from a file: a save, or a rescue file from the first build
  on(els.fileBtn, 'click', () => els.fileInput.click());
  on(els.fileInput, 'change', async () => {
    const file = els.fileInput.files && els.fileInput.files[0];
    els.fileInput.value = '';
    if (!file) return;
    note(`Reading ${file.name}…`);
    try {
      if (file.size > 40 * 1024 * 1024) throw new Error('That file is too big to be a city.');
      const raw = await unpack((await file.text()).trim());
      const snap = raw && raw.format === 'bdb-city-rescue' ? fromRescue(raw) : raw;
      const why = whyNotLoadable(snap, world);
      if (why) throw new Error(`That file cannot be opened: ${why}.`);
      note('');
      openCity(snap, { id: newCityId(), start: snap.start || 'empty', owner: '', cloudRev: 0, cloudAt: null });
    } catch (err) { note((err && err.message) || 'That file is not a saved city.', true); }
  });

  // ---- go: what is on this device first (instant), then the server
  paintAccount();
  paint();
  refresh();
  function connect() {
    Cloud.probe().then(async () => {
      if (!root) return;
      if (Cloud.state === 'ready') { await Cloud.adoptBrawl(); await claim(); }
      paintAccount();
      await refresh();
    }).catch(() => { paintAccount(); });
  }
  connect();
}

const LOAD_LABEL = { village: 'Starter village', town: 'Starter town', new: 'Empty map', demo: 'Demo city', load: 'Your city' };

function enterLoading(mode, seed, cityName) {
  root.dataset.phase = 'loading';
  els.loadName.textContent = cityName;
  els.loadMeta.textContent = `${LOAD_LABEL[mode] || LOAD_LABEL.new} · seed ${seed}`;
  els.help.dataset.emph = '1';
  els.helpNote.textContent = 'Read this while it builds';
  progress = { target: 0.03, shown: 0, text: mode === 'demo' ? 'Waking the city' : mode === 'new' ? 'Shaping the land' : mode === 'load' ? 'Opening your city' : 'Raising the town', stamp: performance.now(), timer: 0 };
  paintProgress();
  if (backdrop) backdrop.stop();          // a still frame costs nothing while the world is built
  progress.timer = setInterval(tickProgress, 180);
  if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur();
}

function tickProgress() {
  if (!root) return;
  const idle = (performance.now() - progress.stamp) / 1000;
  const creep = Math.min(0.09, idle * 0.018);
  const goal = Math.min(0.99, progress.target + creep);
  progress.shown += (goal - progress.shown) * 0.22;
  paintProgress();
}

function paintProgress() {
  if (!els || !els.bar) return;
  const shown = Math.max(progress.shown, Math.min(progress.target, 0.995));
  progress.shown = shown;
  els.bar.style.width = `${(shown * 100).toFixed(1)}%`;
  els.status.textContent = progress.text;
  els.pct.textContent = `${Math.round(shown * 100)}%`;
}

/**
 * Core does not call setProgress (see docs/requests/menu.md) — it writes into the #loading bar in
 * index.html. Mirror that read-only so the wait after the choice is never a blank screen.
 */
function watchCoreProgress(events) {
  const bar = document.getElementById('loading-bar');
  const status = document.getElementById('loading-status');
  const read = () => {
    const w = bar ? parseFloat(bar.style.width) : NaN;
    setProgress(Number.isFinite(w) ? w / 100 : undefined, status ? prettify(status.textContent) : undefined);
  };
  if (bar && window.MutationObserver) {
    const o = new MutationObserver(read);
    o.observe(bar, { attributes: true, attributeFilter: ['style'] });
    observers.push(o);
  }
  if (status && window.MutationObserver) {
    const o = new MutationObserver(read);
    o.observe(status, { childList: true, characterData: true, subtree: true });
    observers.push(o);
  }
  read();

  const finish = () => { setProgress(1, 'Ready'); setTimeout(hide, 420); };
  if (events && events.on) {
    events.on('game:ready', finish);
    if (events.off) cleanups.push(() => events.off('game:ready', finish));
  }
  // last resort: never leave a player stuck behind the overlay
  const bail = setTimeout(() => { if (root) hide(); }, 120000);
  cleanups.push(() => clearTimeout(bail));
}

function prettify(text) {
  if (!text) return undefined;
  const t = String(text).trim();
  if (!t || t === 'Ready') return t || undefined;
  return /[.…!?]$/.test(t) ? t : `${t}…`;
}

function focusables() {
  if (!root) return [];
  return Array.from(root.querySelectorAll('button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter((el) => !el.disabled && el.offsetParent !== null);
}

function on(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  cleanups.push(() => target.removeEventListener(type, fn, opts));
}

function clampSeed(v) {
  const n = Number.isFinite(v) ? Math.abs(Math.round(v)) : 1337;
  return n % 1000000;
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function readStore() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORE_KEY);
    return JSON.parse(raw);
  } catch (e) { return null; }
}
function writeStore(obj) {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(obj)); } catch (e) { /* private mode */ }
}

// ------------------------------------------------------------------------------------------ view

/** Thumbnails for the starter cities: drawn, because there is nothing to photograph until the town exists. */
const thumbFrame = (inner) => `<svg viewBox="0 0 216 156" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs><linearGradient id="fm-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb6e6"/><stop offset="1" stop-color="#cfe6f7"/></linearGradient></defs>
  <rect width="216" height="156" fill="url(#fm-sky)"/><rect y="64" width="216" height="92" fill="#5f9a54"/>${inner}</svg>`;
const house = (x, y, w, h, wall, roof) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${wall}"/><path d="M${x - 3} ${y}L${x + w / 2} ${y - h * 0.62}L${x + w + 3} ${y}z" fill="${roof}"/>`;
const block = (x, y, w, h, wall) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${wall}"/><rect x="${x}" y="${y}" width="${w}" height="3" fill="rgba(0,0,0,.22)"/>`;
const tree = (x, y) => `<rect x="${x - 1.5}" y="${y}" width="3" height="9" fill="#5a4630"/><circle cx="${x}" cy="${y - 3}" r="8" fill="#3f7d3c"/>`;
const THUMB_VILLAGE = thumbFrame(
  `<rect y="104" width="216" height="15" fill="#4b5057"/><rect y="111" width="216" height="1.4" fill="#e9d36b" opacity=".8"/>` +
  house(18, 80, 30, 22, '#f1ece2', '#b5503c') + house(62, 76, 34, 26, '#e7dcc8', '#7c4a36') + house(112, 82, 28, 20, '#f4efe6', '#b5503c') +
  house(156, 78, 36, 24, '#dfe6ea', '#56677a') + house(34, 126, 30, 20, '#f1ece2', '#7c4a36') + house(128, 128, 34, 20, '#e7dcc8', '#b5503c') +
  tree(102, 84) + tree(202, 88) + tree(86, 138) + tree(186, 140));
const THUMB_TOWN = thumbFrame(
  `<rect y="100" width="216" height="13" fill="#4b5057"/><rect x="100" y="64" width="13" height="92" fill="#4b5057"/>` +
  `<rect y="106" width="216" height="1.2" fill="#e9d36b" opacity=".8"/>` +
  block(12, 58, 26, 40, '#d9dfe5') + block(44, 44, 22, 54, '#9fb7cc') + block(72, 66, 22, 32, '#e7dcc8') +
  block(120, 36, 26, 62, '#7f9bb5') + block(152, 56, 24, 42, '#d9dfe5') + block(182, 68, 24, 30, '#c9b79c') +
  house(14, 124, 26, 18, '#f1ece2', '#b5503c') + house(52, 122, 30, 20, '#e7dcc8', '#7c4a36') +
  block(122, 118, 30, 30, '#b9c6d2') + house(164, 126, 30, 18, '#f1ece2', '#56677a') + tree(92, 132) + tree(206, 136));

function markup(seed, suggested, cityName, quality) {
  const arrow = '<svg class="fm-choice__go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M12 5l7 7-7 7"/></svg>';
  const q = QUALITIES.map(([id, label]) => `
        <input type="radio" name="fm-quality" id="fm-q-${id}" value="${id}"${id === quality ? ' checked' : ''}>
        <label for="fm-q-${id}">${label}</label>`).join('');

  return `
  <div id="fm-bg-fallback" class="fm-bg-fallback" aria-hidden="true"></div>
  <canvas id="fm-bg" class="fm-bg" aria-hidden="true"></canvas>
  <div class="fm-grade" aria-hidden="true"></div>

  <div class="fm-stage" role="dialog" aria-modal="true" aria-labelledby="fm-title" aria-describedby="fm-tag">
    <div class="fm-left">
      <div class="fm-brand">
        <a class="fm-home" href="../">&larr; All games</a>
        <div class="fm-kicker"><i></i>A city builder in your browser</div>
        <h1 class="fm-title" id="fm-title"><span>BDB</span><span>City</span></h1>
        <p class="fm-tag" id="fm-tag">Draw one road across empty land, and a city grows along it — traffic, districts, skyline and all.</p>
      </div>

      <div class="fm-help" id="fm-help">
        <div class="fm-help__hd"><b>Controls</b><em id="fm-help-note">Everything you need</em></div>
        <dl class="fm-keys">
          <dt><span class="fm-k">W</span><span class="fm-k">A</span><span class="fm-k">S</span><span class="fm-k">D</span></dt>
          <dd>Pan across the map</dd>
          <dt><span class="fm-k">Right-drag</span></dt>
          <dd>Rotate and tilt the camera</dd>
          <dt><span class="fm-k">Wheel</span></dt>
          <dd>Zoom in and out</dd>
          <dt><span class="fm-k">1</span><span class="fm-k">2</span><span class="fm-k">3</span><span class="fm-k">4</span></dt>
          <dd>Roads · Zoning · Services · Bulldoze</dd>
          <dt><span class="fm-k">Esc</span></dt>
          <dd>Cancel the current tool</dd>
        </dl>
        <p class="fm-help__tip"><b>Start here</b> Pick the road tool, click a start and an end point on the ground — then zone beside it. Nothing else can be built until a road exists.</p>
      </div>
    </div>

    <div class="fm-panel">
      <form id="fm-form" class="fm-choose" novalidate>
        <div class="fm-panel__hd">
          <div class="fm-tabs" role="tablist" aria-label="Start">
            <button class="fm-tab" id="fm-tab-cities" type="button" role="tab" aria-controls="fm-cities">Your cities<b id="fm-count"></b></button>
            <button class="fm-tab" id="fm-tab-new" type="button" role="tab" aria-controls="fm-new-pane">New city</button>
          </div>
        </div>

        <div class="fm-pane fm-pane--cities" id="fm-cities" role="tabpanel">
          <div class="fm-account" id="fm-account"></div>
          <div class="fm-citylist" id="fm-citylist" role="list"></div>
          <div class="fm-cities__foot">
            <button class="fm-link" id="fm-file" type="button">Load a city from a file</button>
            <input id="fm-file-input" type="file" accept=".json,.txt,application/json,text/plain" hidden>
          </div>
          <p class="fm-cities__note" id="fm-cities-note" role="status" aria-live="polite"></p>
        </div>

        <div class="fm-pane fm-pane--new" id="fm-new-pane" role="tabpanel">
        <div class="fm-fields">
          <div class="fm-field">
            <label for="fm-name">Name your city</label>
            <input class="fm-input" id="fm-name" type="text" maxlength="28" autocomplete="off"
                   spellcheck="false" placeholder="Type a name" data-suggested="${escapeAttr(suggested)}" value="${escapeAttr(cityName)}">
          </div>
          <div class="fm-field">
            <label for="fm-seed">Map seed</label>
            <div class="fm-seedrow">
              <input class="fm-input" id="fm-seed" type="number" inputmode="numeric" min="0" max="999999"
                     step="1" autocomplete="off" value="${seed}">
              <button class="fm-icon-btn" id="fm-reroll" type="button" title="Roll a new seed" aria-label="Roll a new map seed">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>
              </button>
            </div>
          </div>
        </div>

        <fieldset class="fm-quality">
          <legend class="fm-legend">Graphics quality</legend>
          <div class="fm-seg">${q}</div>
          <p class="fm-qnote" id="fm-qnote"></p>
        </fieldset>

        <div class="fm-choices fm-choices--four">
          <button class="fm-choice fm-choice--primary" id="fm-village" type="button">
            <span class="fm-choice__thumb">${THUMB_VILLAGE}<span class="fm-choice__tag">Easiest</span></span>
            <span class="fm-choice__body">
              <span class="fm-choice__title">Starter village</span>
              <span class="fm-choice__desc">A main street, a few blocks of homes and shops, power and water already on.</span>
            </span>${arrow}
          </button>
          <button class="fm-choice" id="fm-town" type="button">
            <span class="fm-choice__thumb">${THUMB_TOWN}<span class="fm-choice__tag">More to run</span></span>
            <span class="fm-choice__body">
              <span class="fm-choice__title">Starter town</span>
              <span class="fm-choice__desc">Two dozen blocks with a school, police, a fire house and a clinic.</span>
            </span>${arrow}
          </button>
          <button class="fm-choice" id="fm-new" type="button">
            <span class="fm-choice__thumb">
              <canvas id="fm-seedmap" width="216" height="156" aria-hidden="true"></canvas>
              <span class="fm-choice__tag" id="fm-seed-tag">Seed ${seed}</span>
            </span>
            <span class="fm-choice__body">
              <span class="fm-choice__title">Empty land</span>
              <span class="fm-choice__desc">Nothing but the map. You lay the first road.</span>
            </span>${arrow}
          </button>
          <button class="fm-choice" id="fm-demo" type="button">
            <span class="fm-choice__thumb">
              <img src="assets/menu/demo-city.jpg" alt="" width="640" height="480" loading="eager" decoding="async">
              <span class="fm-choice__tag">Grown city</span>
            </span>
            <span class="fm-choice__body">
              <span class="fm-choice__title">Load demo city</span>
              <span class="fm-choice__desc">Thousands of residents, live traffic and services. Good for a look around.</span>
            </span>${arrow}
          </button>
        </div>
        </div>

        <div class="fm-foot"><span id="fm-foot-seed">Seed ${seed} · 2048 m</span><span>Built on <a href="https://github.com/rawprogress/fable-cities" target="_blank" rel="noopener">Fable Cities</a></span></div>
      </form>

      <div class="fm-load" id="fm-load">
        <div class="fm-load__eyebrow">Building your world</div>
        <div class="fm-load__name" id="fm-load-name">New Charleston</div>
        <div class="fm-load__meta" id="fm-load-meta"></div>
        <div class="fm-bar"><i id="fm-bar"></i></div>
        <div class="fm-status" role="status" aria-live="polite">
          <i aria-hidden="true"></i><span id="fm-status-text">Preparing</span><span class="fm-load__pct" id="fm-pct">0%</span>
        </div>
      </div>

      <div class="fm-apply" role="status" aria-live="polite">
        <div class="fm-apply__ring"></div>
        <div class="fm-apply__txt" id="fm-apply-txt">Applying quality…</div>
      </div>
    </div>
  </div>`;
}

function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
