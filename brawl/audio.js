/* Break Room Brawl: sound. One file holds every effect (snd/sfx.mp3), one holds the music (snd/battle.mp3).
   Nothing here knows about the game: main.js decides what an event should sound like and calls play().
   Where each sound came from is in snd/CREDITS.md. */
const TAG = new URL(import.meta.url).searchParams.get('v') || '';

/* name: [where it starts in the file, how long it is, the volume that puts it at its intended loudness]. Built by a script; do not edit by hand. */
const SPRITE = {tap:[0.1, 0.0544, 0.06], tab:[0.2944, 0.1101, 0.066], ok:[0.5445, 0.2946, 0.103], big:[0.9791, 0.7135, 0.186], bad:[1.8326, 0.2289, 0.164], pop:[2.2015, 0.1188, 0.168],
  open:[2.4604, 0.2184, 0.038], close:[2.8188, 0.2205, 0.04], invite:[3.1793, 0.9186, 0.083], tick:[4.2378, 0.0551, 0.119], tock:[4.433, 0.088, 0.168],
  card1:[4.661, 0.1817, 0.168], card2:[4.9827, 0.6271, 0.168], card3:[5.7498, 0.5555, 0.168], place1:[6.4453, 0.2445, 0.201], place2:[6.8298, 0.2501, 0.211],
  shove:[7.2198, 0.9911, 0.168], fan:[8.351, 0.7208, 0.163], coin1:[9.2118, 0.1395, 0.119], coin2:[9.4912, 0.1235, 0.119], coin3:[9.7548, 0.1011, 0.119],
  coins:[9.9959, 0.7043, 0.312], chest:[10.8402, 2.0709, 0.255], rare:[13.0512, 1.128, 0.131], epic:[14.3191, 1.4721, 0.175], legend:[15.9312, 2.3135, 0.286],
  god:[18.3846, 3.5822, 0.257], upgrade:[22.1068, 1.0617, 0.181], drop1:[23.3086, 0.2262, 0.376], drop2:[23.6748, 0.2671, 0.304], drop3:[24.0819, 0.2682, 0.294],
  dropbig:[24.4901, 0.7, 0.184], build:[25.3302, 0.35, 0.354], spell:[25.8202, 0.4305, 0.2], hit1:[26.3907, 0.2929, 0.216], hit2:[26.8235, 0.2535, 0.216],
  hit3:[27.2171, 0.2295, 0.335], hit4:[27.5866, 0.2482, 0.252], tapx1:[27.9748, 0.1914, 0.188], tapx2:[28.3062, 0.1655, 0.188], tapx3:[28.6117, 0.1809, 0.188],
  thud1:[28.9326, 0.4442, 0.241], thud2:[29.5167, 0.4591, 0.237], slash1:[30.1159, 0.3918, 0.135], slash2:[30.6477, 0.3352, 0.127], crit:[31.1229, 0.3254, 0.315],
  clang:[31.5883, 0.5813, 0.145], arrow1:[32.3096, 0.12, 0.188], arrow2:[32.5697, 0.12, 0.188], gun1:[32.8297, 0.17, 0.258], gun2:[33.1397, 0.1889, 0.237],
  magic1:[33.4686, 0.29, 0.079], magic2:[33.8986, 0.29, 0.089], fire1:[34.3286, 0.26, 0.187], fire2:[34.7286, 0.28, 0.171], zap1:[35.1486, 0.22, 0.299],
  zap2:[35.5086, 0.26, 0.299], throw1:[35.9086, 0.197, 0.106], throw2:[36.2456, 0.2178, 0.103], shotx:[36.6034, 0.2262, 0.266], poof1:[36.9696, 0.2, 0.222],
  poof2:[37.3096, 0.2, 0.266], poof3:[37.6496, 0.2, 0.261], bones1:[37.9896, 0.2338, 0.214], bones2:[38.3634, 0.1976, 0.212], crash:[38.7009, 0.8015, 0.231],
  boom1:[39.6424, 1.2997, 0.215], boom2:[41.0821, 1.1949, 0.238], boombig:[42.417, 2.0, 0.181], tower:[44.557, 2.3, 0.239], quake:[46.997, 1.9, 0.149],
  thunder1:[49.037, 1.5719, 0.254], thunder2:[50.749, 1.4727, 0.242], freeze:[52.3616, 0.8677, 0.307], heal:[53.3693, 1.6176, 0.13], rage:[55.1269, 1.4209, 0.308],
  poison:[56.6878, 0.4888, 0.259], raise:[57.3165, 1.2488, 0.162], wind:[58.7054, 1.0985, 0.231], warp:[59.9438, 0.3254, 0.148], rain:[60.4093, 0.395, 0.282],
  whistle:[60.9443, 1.3458, 0.177], trapset:[62.4301, 0.487, 0.208], trap:[63.0571, 0.9468, 0.21], horn:[64.1439, 2.1849, 0.187], hornot:[66.4688, 2.7741, 0.202],
  hornup:[69.3829, 1.5838, 0.175], crown:[71.1067, 1.6544, 0.234], win:[72.9012, 2.8281, 0.411], lose:[75.8693, 2.4645, 0.261], draw:[78.4737, 0.8506, 0.091]};

const LOOP = 92.08193, LEAD = 0.3;            // the music repeats every LOOP seconds; the file has LEAD seconds of the loop's end in front of it
const MASTER = 2, MUSIC = .17, MENU = .6;  // MENU: how much of the music's level the menus keep (it is also muffled there)
/* the least time between two sounds of the same family: a crowd of skeletons all hitting on one tick should be a few taps, not a wall of noise */
const GAP = {tap:.03, tab:.05, card:.03, coin:.035, hit:.06, tapx:.045, thud:.1, slash:.08, crit:.12, clang:.14, arrow:.05, gun:.07, magic:.06, fire:.07, zap:.09, throw:.07, shotx:.1,
  poof:.06, bones:.05, crash:.15, boom:.1, boombig:.2, thunder:.18, drop:.04, dropbig:.08, heal:2.2, raise:.35, freeze:.3, warp:.15, poison:.5, wind:.6, rage:.4, quake:.3, rain:.3, spell:.08, tock:.5};
const family = n => n.replace(/\d+$/, '');

export function createAudio({muted = () => false, base = 'snd/'} = {}){
  let ctx = null, master, outNode, fxBus, filt, duckG, musBus, fxBuf = null, musBuf = null, cur = null, want = 'off', mode = 'off', rate = 1, live = 0, woke = false;
  const loading = {}, last = {}, prev = {}, groups = {}, played = {};
  for (const k in SPRITE) (groups[family(k)] = groups[family(k)] || []).push(k);
  let prefs = {fx:true, music:true};
  try { const s = JSON.parse(localStorage.getItem('brawl-snd') || 'null'); if (s) prefs = {fx:s.fx !== 0, music:s.music !== 0}; } catch(e){}

  function init(){
    if (ctx) return true;
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return false;
    try { ctx = new C(); } catch(e){ return false; }
    /* the last thing before the speakers: a limiter, so a tower coming down on top of a horn cannot distort. The browser's compressor adds gain of its own
       (0.6 of what it would take off a full-scale signal), which the gain after it takes back out. */
    const TH = -3, RATIO = 20, lim = ctx.createDynamicsCompressor(), trim = ctx.createGain();
    lim.threshold.value = TH; lim.knee.value = 0; lim.ratio.value = RATIO; lim.attack.value = .001; lim.release.value = .09;
    trim.gain.value = Math.pow(10, TH * (1 - 1 / RATIO) * .6 / 20);
    master = ctx.createGain(); master.gain.value = MASTER; master.connect(lim); lim.connect(trim); trim.connect(ctx.destination); outNode = trim;
    fxBus = ctx.createGain(); fxBus.connect(master);
    filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 20000; filt.Q.value = .5;
    duckG = ctx.createGain(); musBus = ctx.createGain(); musBus.gain.value = MUSIC; filt.connect(duckG); duckG.connect(musBus); musBus.connect(master);
    return true;
  }
  /* Files are fetched and decoded as the page loads, on a decoder that needs no permission to make sound, so the first tap already has its click. */
  let decoder = null, failed = false;
  const fetchBuf = file => fetch(base + file + (TAG ? '?v=' + TAG : '')).then(r => { if (!r.ok) throw new Error(file + ' ' + r.status); return r.arrayBuffer(); }).then(b => new Promise((ok, no) => {
    if (!decoder){ const O = window.OfflineAudioContext || window.webkitOfflineAudioContext; try { decoder = O ? new O(1, 1, 44100) : null; } catch(e){ decoder = null; } }
    const d = decoder || ctx; if (!d) return no(new Error('nothing to decode with yet')); d.decodeAudioData(b, ok, no); }));
  function loadFx(){ if (fxBuf || loading.fx) return; loading.fx = fetchBuf('sfx.mp3').then(b => { fxBuf = b; failed = false; }).catch(e => { loading.fx = null; failed = true; console.warn('sound effects unavailable', e); }); }
  function loadMusic(){ if (musBuf || loading.mus) return; loading.mus = fetchBuf('battle.mp3').then(b => { musBuf = b; apply(); }).catch(e => { loading.mus = null; console.warn('music unavailable', e); }); }
  setTimeout(() => { if (!muted()){ if (prefs.fx) loadFx(); if (prefs.music) loadMusic(); } }, 900);

  /* browsers only let a page make sound after the player has touched it: this runs on every touch, and wakes things back up after a phone call or a locked screen */
  function wake(){
    if (!init()) return;
    if (ctx.state !== 'running' && !document.hidden) ctx.resume().then(apply, () => {});
    if (!woke){ woke = true; try { const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0); } catch(e){} }
    if (!muted()){ if (prefs.fx) loadFx(); if (prefs.music) loadMusic(); }
    apply();
  }
  for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, wake, {capture:true, passive:true});
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => {}); else if (woke) ctx.resume().then(apply, () => {}); });

  /* play('hit') picks one of hit1..hit4 and bends its pitch a little, so a fight never repeats itself. Returns false only when the effects could not be loaded at all (the caller may then fall back to a beep). */
  function play(name, o = {}){
    if (muted() || !prefs.fx) return true;
    if (!fxBuf || !ctx || ctx.state !== 'running') return !failed;
    const fam = SPRITE[name] && !groups[name] ? null : family(name), list = fam ? groups[fam] : [name];
    if (!list) return false;
    const key = fam || name, now = ctx.currentTime, gap = o.gap != null ? o.gap : GAP[key] != null ? GAP[key] : .02;
    if (now - (last[key] || -9) < gap) return true;
    let k = list[(Math.random() * list.length) | 0]; if (list.length > 1 && k === prev[key]) k = list[(list.indexOf(k) + 1) % list.length];
    const [t0, d, v] = SPRITE[k], vol = v * (o.vol != null ? o.vol : 1);
    if (live > 26 && vol < .25) return true;                    // too much going on for a quiet one to be heard
    last[key] = now; prev[key] = k; played[key] = (played[key] || 0) + 1;
    const src = ctx.createBufferSource(); src.buffer = fxBuf;
    src.playbackRate.value = (o.rate || 1) * (1 + (Math.random() * 2 - 1) * (o.vary != null ? o.vary : list.length > 1 ? .07 : 0));
    const g = ctx.createGain(); g.gain.value = vol; src.connect(g);
    if (o.pan && ctx.createStereoPanner){ const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); p.connect(fxBus); } else g.connect(fxBus);
    live++; src.onended = () => { live--; };
    src.start(now + (o.delay || 0), t0, d + .05);
    return true;
  }

  /* ---- music: 'battle' plays it as it is; 'menu' is the same band heard through the break room wall; 'off' is silence ---- */
  const glide = (p, v, tc) => { const t = ctx.currentTime; p.cancelScheduledValues(t); p.setTargetAtTime(v, t, tc); };
  function drop(tc = .12){ if (!cur) return; const c = cur; cur = null; glide(c.g.gain, 0, tc); setTimeout(() => { try { c.s.stop(); } catch(e){} }, tc * 6000 + 200); }
  function start(phase, fadeIn){
    drop();
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = musBuf; s.loop = true; s.loopStart = .12; s.loopEnd = .12 + LOOP; s.playbackRate.value = rate;
    g.gain.value = fadeIn ? 0 : 1; s.connect(g); g.connect(filt); s.start(0, LEAD + phase); cur = {s, g};
    if (fadeIn) glide(g.gain, 1, fadeIn);
  }
  function apply(){
    if (!ctx) return;
    const on = prefs.music && !muted() && want !== 'off';
    if (!on){ drop(want === 'off' ? .14 : .05); mode = 'off'; return; }
    if (!musBuf){ loadMusic(); return; }
    if (ctx.state !== 'running' || (mode === want && cur)) return;
    if (want === 'battle'){ filt.frequency.cancelScheduledValues(ctx.currentTime); filt.frequency.setValueAtTime(20000, ctx.currentTime); glide(musBus.gain, MUSIC, .05); start(.27, 0); }      // from the top: the pick-up hit, then the downbeat
    else { if (!cur) start(6 + Math.random() * 70, .9); glide(filt.frequency, 900, .35); glide(musBus.gain, MUSIC * MENU, .5); }      // 900 Hz: muffled, but still a tune on a phone's small speaker
    mode = want;
  }
  function music(m){ want = m; if (m !== 'battle') hurry(false); apply(); }
  function hurry(on){ rate = on ? 1.07 : 1; if (cur && ctx) glide(cur.s.playbackRate, rate, .5); }                // overtime: the band speeds up
  function duck(to = .3, hold = 2.2){ if (!ctx) return; const t = ctx.currentTime; duckG.gain.cancelScheduledValues(t); duckG.gain.setTargetAtTime(to, t, .04); duckG.gain.setTargetAtTime(1, t + hold, .5); }

  function set(k, on){ prefs[k] = !!on; try { localStorage.setItem('brawl-snd', JSON.stringify({fx:prefs.fx ? 1 : 0, music:prefs.music ? 1 : 0})); } catch(e){} if (on) wake(); apply(); }
  return {play, music, hurry, duck, wake, set, refresh:() => { if (!muted()) wake(); apply(); }, get prefs(){ return {...prefs}; }, get ready(){ return !!fxBuf; }, get state(){ return {ctx:ctx ? ctx.state : 'none', fx:!!fxBuf, music:!!musBuf, mode, want, live, rate, played:{...played}}; },
    tap(){ if (!init()) return null; const d = ctx.createMediaStreamDestination(); outNode.connect(d); return d.stream; },      // for tests: a recording of what the player would hear
    has:n => !!(SPRITE[n] || groups[family(n)])};
}
