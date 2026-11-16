/**
 * Keeps the running city saved.
 *
 *   on this device   half a minute after the last save, and whenever the tab is hidden or closed
 *   online           a couple of minutes apart, when signed in; at once when the player asks
 *
 * The device copy is the one the game trusts: it is written first, every time, and an online
 * save is only ever a copy of it. If the online save fails the city is marked as waiting and
 * goes up the next time round, or the next time the game is opened.
 *
 * Everything the HUD needs is in `status()`, and every change is announced as `save:status`.
 */
import { captureCity } from './snapshot.js';
import { pack } from './codec.js';
import { Store } from './store.js';
import { Cloud, cloudWhy, cloudSays } from './cloud.js';
import { RESCUE_KEY } from '../rescue-key.js';

const DEVICE_EVERY = 30000;   // ms between automatic saves on this device
const CLOUD_EVERY = 150000;   // ms between automatic online saves
const SAVE_LIMIT = 90000;     // ms after which a save that has not finished is given up on

/** "a moment ago", "3 minutes ago" … */
export function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 10) return 'a moment ago';
  if (s < 60) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? 'a minute ago' : `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? 'an hour ago' : `${h} hours ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/**
 * `city` is `{ id, start, owner, cloudRev, cloudAt, rescued }` for a city that is kept, or null
 * for one that is not (the demo city). → the saves api, also at `world.saves.api`.
 */
export function startSaves(ctx, city, why = null) {
  const { events, world } = ctx;
  const S = {
    city, busy: false,
    device: city ? 'idle' : 'off', deviceAt: 0, deviceNote: null,
    cloud: 'off', cloudAt: 0, cloudNote: null,
  };
  const cloudIdle = () => (Cloud.state !== 'ready' ? 'off' : Cloud.session() ? (S.cloudAt ? 'saved' : 'waiting') : 'signed-out');
  if (city) S.cloud = cloudIdle();

  const api = {
    get city() { return S.city; },
    /**
     * `kept` false: nothing is saved (and `why` says so). Otherwise `device` is idle | saving |
     * saved | error and `cloud` is off | signed-out | waiting | saving | saved | error.
     */
    status() {
      if (!S.city) return { kept: false, level: 'off', title: 'Not saved', lines: [why || 'This city is not saved.'] };
      const lines = [];
      lines.push(S.device === 'error' ? `Not saved on this device: ${S.deviceNote}`
        : S.device === 'saving' ? 'Saving on this device…'
        : S.deviceAt ? `Saved on this device ${ago(S.deviceAt)}.` : 'Not saved yet. The first save happens in a few seconds.');
      const sess = Cloud.session();
      lines.push(S.cloud === 'off' ? (Cloud.state === 'setup' ? 'Online saving is not switched on yet.' : Cloud.state === 'ready' ? '' : 'The account server cannot be reached; online saving is paused.')
        : S.cloud === 'signed-out' ? 'Sign in on the start screen to keep this city online too.'
        : S.cloud === 'saving' ? 'Saving online…'
        : S.cloud === 'error' ? `Not saved online: ${S.cloudNote}`
        : S.cloud === 'saved' ? `Saved online ${ago(S.cloudAt)}${sess ? `, as ${sess.name}` : ''}.`
        : `Waiting to save online${sess ? ` as ${sess.name}` : ''}.`);
      const level = S.device === 'error' ? 'bad' : S.busy ? 'busy' : S.cloud === 'error' ? 'warn' : S.deviceAt ? 'ok' : 'busy';
      const title = S.device === 'error' ? 'Could not save' : S.busy ? 'Saving…' : S.deviceAt ? 'Saved' : 'Not saved yet';
      return { kept: true, level, title, lines: lines.filter(Boolean), device: S.device, cloud: S.cloud, deviceAt: S.deviceAt, cloudAt: S.cloudAt };
    },
    /** Save now. `reason`: auto | manual | hide. → status() once it is done. */
    async saveNow(reason = 'auto') {
      if (!S.city) return api.status();
      // one save at a time: a second request waits for the one in flight and reports how that went
      if (S.inflight) { await S.inflight.catch(() => {}); return api.status(); }
      if (!window.__game || !window.__game.ready) return api.status();
      // A save that never finishes (storage that stops answering) must not block every save after it.
      const limit = new Promise((_, reject) => setTimeout(() => reject(new Error('the save took too long')), SAVE_LIMIT));
      S.inflight = Promise.race([run(reason), limit]).catch((err) => {
        console.warn('[save] abandoned', err);
        S.busy = false;
        if (S.device === 'saving') { S.device = 'error'; S.deviceNote = 'the save took too long and was abandoned. It will be tried again.'; }
        emit();
      });
      try { await S.inflight; } finally { S.inflight = null; }
      return api.status();
    },
    stop() {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
    },
  };
  function emit() { try { events.emit('save:status', api.status()); } catch (_) { /* no listeners yet */ } }

  async function run(reason) {
    {
      S.busy = true;
      S.device = 'saving';
      emit();
      let rec = null;
      try {
        const snap = captureCity(ctx, { start: S.city.start });
        const data = await pack(snap);
        const sess = Cloud.session();
        if (sess) S.city.owner = sess.name.toLowerCase();
        rec = {
          id: S.city.id, name: snap.name, seed: snap.seed, start: S.city.start, owner: S.city.owner || '',
          updatedAt: Date.now(), summary: snap.summary, data, cloudRev: S.city.cloudRev || 0, cloudAt: S.city.cloudAt || null, dirty: true,
        };
        await Store.put(rec);
        S.device = 'saved'; S.deviceAt = rec.updatedAt; S.deviceNote = null;
        // a rescued city is safe in its own right now: the rescue copy has done its job
        if (S.city.rescued) { try { localStorage.removeItem(RESCUE_KEY); } catch (_) { /* no storage */ } S.city.rescued = false; }
      } catch (err) {
        S.device = 'error';
        S.deviceNote = /quota|full/i.test(String(err && (err.name + err.message))) ? 'the browser\'s storage is full.' : 'the browser would not store it.';
        rec = null;
        console.warn('[save] device save failed', err);
      }
      if (rec && Cloud.state === 'ready' && Cloud.session()) {
        const due = reason !== 'auto' || !S.cloudAt || Date.now() - S.cloudAt > CLOUD_EVERY;
        if (!due) S.cloud = 'waiting';
        else if (rec.data.length > Cloud.limits.bytes) { S.cloud = 'error'; S.cloudNote = cloudSays('too_big'); }
        else {
          S.cloud = 'saving';
          emit();
          try {
            const r = await Cloud.save(rec);
            if (r && r.ok) {
              S.cloud = 'saved'; S.cloudAt = Date.now(); S.cloudNote = null;
              S.city.cloudRev = r.rev; S.city.cloudAt = r.updated_at;
              await Store.patch(rec.id, { cloudRev: r.rev, cloudAt: r.updated_at, dirty: false, owner: S.city.owner || '' }).catch(() => {});
            } else { S.cloud = 'error'; S.cloudNote = cloudSays(r && r.error); }
          } catch (e) { S.cloud = 'error'; S.cloudNote = cloudWhy(e); }
        }
      } else if (rec) S.cloud = cloudIdle();
      S.busy = false;
      emit();
    }
  }

  const onHide = () => { if (document.hidden) api.saveNow('hide'); };
  const onLeave = () => { api.saveNow('hide'); };
  let timer = 0;
  if (city) {
    timer = setInterval(() => { if (!document.hidden && Date.now() - S.deviceAt >= DEVICE_EVERY - 2000) api.saveNow('auto'); }, 10000);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
    // the first save comes early, so a new city is on the start screen's list from the beginning
    setTimeout(() => api.saveNow('manual'), 4000);
  }
  world.saves = { api };
  emit();
  return api;
}
