/* BDB Games kit: shared helpers for every game page. Load after ../assets/roasts.js.
   window.BDB = {
     init({game, extra})        set the game key (for saved scores / roast order) and any game-only roast lines
     say(text, tag)             BDB's speech bubble types the line out (needs the .k-say markup)
     roast()                    next line from the shuffled deck (shared + game-only), no repeats until it runs out
     line(arr)                  say a random line from your own array, avoiding an instant repeat
     shout(text, bad)           big centred stamp over the stage (needs #stage)
     addScore(score, {lower})   save to this device's top 5; returns {rank, isBest, list}
     scores()                   this game's saved top 5
     showEnd({...}) / hideEnd() fill and show the end screen
     hideSplash() / showSplash()
     store.get/set, pick(arr), reduced, faceImg (Image for canvas), fmt(n), fmtTime(ms), sfx.*
   } */
(function(){
  const store = {
    get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
    set(k, v){ try { localStorage.setItem(k, v); } catch(e){} }
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const $ = id => document.getElementById(id);
  const faceImg = new Image(); faceImg.src = '../assets/face.jpg';

  let game = 'game', deck = [], order = null, pos = 0;
  function init(o){
    game = o.game || 'game';
    deck = (window.ROASTS || []).concat(o.extra || []);
    try { const s = JSON.parse(store.get('bdb-roasts-' + game)); if (s && s.n === deck.length && Array.isArray(s.order)){ order = s.order; pos = s.pos || 0; } } catch(e){}
    if (!order) shuffle();
  }
  function shuffle(){
    order = deck.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    pos = 0;
  }

  let typeT = null, quietT = null;
  function say(text, tag){
    const box = $('say'); if (!box) return;
    const txt = box.querySelector('.txt'), tg = box.querySelector('.tag'), bub = box.querySelector('.bub'), av = box.querySelector('.av');
    tg.textContent = tag || '';
    clearInterval(typeT); clearTimeout(quietT);
    box.classList.remove('quiet');
    bub.classList.remove('pop'); void bub.offsetWidth; bub.classList.add('pop');
    if (av){ av.classList.remove('talk'); void av.offsetWidth; av.classList.add('talk'); }
    quietT = setTimeout(() => box.classList.add('quiet'), 6000 + text.length * 40);
    if (reduced){ txt.textContent = text; return; }
    let i = 0; txt.textContent = ''; txt.classList.add('typing');
    typeT = setInterval(() => { i = Math.min(text.length, i + 2); txt.textContent = text.slice(0, i); if (i >= text.length){ clearInterval(typeT); txt.classList.remove('typing'); } }, 18);
  }
  function roast(){
    if (!deck.length) return;
    if (pos >= order.length) shuffle();
    const n = order[pos++];
    store.set('bdb-roasts-' + game, JSON.stringify({n:deck.length, order, pos}));
    say(deck[n], `Roast ${pos} / ${deck.length}`);
  }
  const lastLine = new WeakMap();
  function line(arr, tag){
    let t; do { t = pick(arr); } while (arr.length > 1 && t === lastLine.get(arr));
    lastLine.set(arr, t); say(t, tag);
  }
  function shout(text, bad){
    if (reduced) return;
    const st = $('stage'); if (!st) return;
    const d = document.createElement('div'); d.className = 'k-shout' + (bad ? ' bad' : ''); d.textContent = text;
    st.appendChild(d); setTimeout(() => d.remove(), 1150);
  }

  function scores(){ try { return JSON.parse(store.get('bdb-scores-' + game)) || []; } catch(e){ return []; } }
  function addScore(score, opt = {}){
    const list = scores();
    const entry = {s:score, d:Date.now()};
    list.push(entry);
    list.sort((a, b) => opt.lower ? a.s - b.s : b.s - a.s);
    const top = list.slice(0, 5);
    store.set('bdb-scores-' + game, JSON.stringify(top));
    const rank = top.indexOf(entry);
    return {rank, isBest: rank === 0, list: top};
  }
  const fmt = n => Math.round(n).toLocaleString();
  const fmtTime = ms => { const s = Math.max(0, ms) / 1000; return s < 60 ? s.toFixed(1) + 's' : Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); };

  // end screen: eyebrow, title, line, stats [[label, value]], scores (from addScore) with formatter, buttons are page-owned
  function showEnd(o){
    const m = $('end'); if (!m) return;
    $('endEyebrow').textContent = o.eyebrow || 'Final buzzer';
    $('endTitle').textContent = o.title || '';
    $('endLine').textContent = o.line || '';
    const st = $('endStats'); st.innerHTML = '';
    for (const [label, value] of (o.stats || [])){
      const c = document.createElement('div'); c.className = 'cell';
      c.innerHTML = '<small></small><b></b>'; c.querySelector('small').textContent = label; c.querySelector('b').textContent = value;
      st.appendChild(c);
    }
    st.hidden = !(o.stats && o.stats.length);
    const sc = $('endScores'); sc.innerHTML = '';
    if (o.scores){
      o.scores.list.forEach((e, i) => {
        const li = document.createElement('li'); if (i === o.scores.rank) li.className = 'me';
        li.innerHTML = '<span></span><span></span><b></b>';
        li.children[0].textContent = (i + 1) + '.';
        li.children[1].textContent = i === o.scores.rank ? 'This game' : new Date(e.d).toLocaleDateString(undefined, {month:'short', day:'numeric'});
        li.children[2].textContent = (o.format || fmt)(e.s);
        sc.appendChild(li);
      });
    }
    $('endScoresWrap').hidden = !o.scores;
    m.hidden = false;
    const b = m.querySelector('.k-btn.primary'); if (b) setTimeout(() => b.focus(), 50);
  }
  function hideEnd(){ const m = $('end'); if (m) m.hidden = true; }
  function hideSplash(){ const s = $('splash'); if (!s || s.hidden) return; s.classList.add('gone'); setTimeout(() => { s.hidden = true; s.classList.remove('gone'); }, reduced ? 0 : 400); }
  function showSplash(){ const s = $('splash'); if (s){ s.classList.remove('gone'); s.hidden = false; } }

  // tiny sound effects (WebAudio, start only after a tap); muted state is remembered
  let ctx = null, muted = store.get('bdb-muted') === '1';
  function tone(freq, dur = .08, type = 'square', vol = .05, slide = 0){
    if (muted) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + .02);
    } catch(e){}
  }
  const sfx = {
    good(){ tone(660, .07, 'square', .04); setTimeout(() => tone(990, .09, 'square', .04), 60); },
    bad(){ tone(220, .18, 'sawtooth', .04, -120); },
    tick(){ tone(1200, .03, 'square', .02); },
    pop(){ tone(500, .06, 'triangle', .06, 300); },
    big(){ [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .12, 'square', .04), i * 90)); },
    get muted(){ return muted; },
    toggle(){ muted = !muted; store.set('bdb-muted', muted ? '1' : '0'); return muted; }
  };

  window.BDB = {init, say, roast, line, shout, scores, addScore, showEnd, hideEnd, hideSplash, showSplash, store, pick, reduced, faceImg, fmt, fmtTime, sfx};
})();
