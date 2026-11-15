/* Break Room Brawl: every card, unit, map and CPU opponent. Pure data, no DOM, shared by the rules, the CPU and the screens.
   24 characters x 12 styles x 4 rarities = 1,152 cards, all generated from the tables below. */

export const RAR = {
  c:{name:'Common',    price:200,  w:60, col:'#9fb3d9', mul:1},
  r:{name:'Rare',      price:800,  w:28, col:'#ff9d3c', mul:1.1},
  e:{name:'Epic',      price:2500, w:10, col:'#c77dff', mul:1.2},
  l:{name:'Legendary', price:8000, w:2,  col:'#ffd95a', mul:1.32}
};
export const RAR_IDS = ['c', 'r', 'e', 'l'];
const TIER = {c:1, r:1.5, e:2.2, l:4};                  // how prized the character itself is
export const MAX_LVL = 10;
export const lvlMul = l => 1 + .08 * (Math.max(1, l) - 1);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* Styles: the same character with a different build. chill slows what it hits, steal heals it on every hit. */
export const AFF = {
  std:  {name:'',        tint:null,     cost:0,  hp:1,    dmg:1,    spd:1,    size:1,    note:''},
  rook: {name:'Rookie',  tint:0xb6e39a, cost:-1, hp:.74,  dmg:.78,  spd:1.05, size:.86,  note:'Rookie: costs 1 less Mana and is a little weaker.'},
  vet:  {name:'Veteran', tint:0x8a6a4a, cost:1,  hp:1.32, dmg:1.28, spd:1,    size:1.08, note:'Veteran: costs 1 more, hits harder and lasts longer.'},
  ice:  {name:'Frozen',  tint:0x7fd4ff, cost:0,  hp:1,    dmg:.9,   spd:.95,  size:1,    note:'Frozen: every hit slows the target.', chill:1.8},
  fire: {name:'Blazing', tint:0xff5a1f, cost:0,  hp:.85,  dmg:1.3,  spd:1.05, size:1,    note:'Blazing: more damage, less health.'},
  gold: {name:'Golden',  tint:0xffcf3a, cost:1,  hp:1.2,  dmg:1.2,  spd:1.1,  size:1.04, note:'Golden: stronger and quicker. Costs 1 more.'},
  quick:{name:'Turbo',   tint:0xc8f53a, cost:0,  hp:.82,  dmg:.95,  spd:1.4,  size:.94,  note:'Turbo: much faster on its feet and on the attack, but fragile.', haste:.85},
  iron: {name:'Iron',    tint:0x8f99ad, cost:0,  hp:1.5,  dmg:.9,   spd:.8,   size:1.05, note:'Iron: far more health, but slower.'},
  vamp: {name:'Vampire', tint:0x8a4fd8, cost:0,  hp:.92,  dmg:1,    spd:1,    size:1,    note:'Vampire: heals itself with every hit.', steal:.35},
  elite:{name:'Elite',   tint:0xd8263c, cost:1,  hp:1.12, dmg:1.42, spd:1,    size:1.03, note:'Elite: hits much harder. Costs 1 more.'},
  tox:  {name:'Toxic',   tint:0x58d848, cost:0,  hp:.95,  dmg:.95,  spd:1,    size:1,    note:'Toxic: bursts and hurts everything nearby when it is defeated.', toxic:1},
  giant:{name:'Giant',   tint:0xff7aa8, cost:2,  hp:1.8,  dmg:1.35, spd:.85,  size:1.32, note:'Giant: huge, tough and slow. Costs 2 more.'}
};
export const AFF_IDS = Object.keys(AFF);

/* Units. Speeds are arena units per second, hit is seconds between attacks, rng is reach beyond the bodies.
   air: can hit flyers. only:'b': walks past troops and only hits buildings. splash: hit radius. */
export const UNITS = {
  skel:     {name:'Skeleton',        hp:45,   dmg:45,  hit:1.0, rng:.5,  spd:1.9,  r:.28},
  bench:    {name:'Benchwarmer',     hp:900,  dmg:100, hit:1.2, rng:.7,  spd:1.3,  r:.5},
  shooter:  {name:'Shooter',         hp:170,  dmg:60,  hit:1.1, rng:5,   spd:1.3,  r:.34, air:1, shot:'ball'},
  gob:      {name:'Snack Goblin',    hp:110,  dmg:65,  hit:1.0, rng:.5,  spd:2.3,  r:.3},
  bat:      {name:'Night Bat',       hp:50,   dmg:45,  hit:1.2, rng:.6,  spd:2.3,  r:.3,  fly:1, air:1},
  slime:    {name:'Mop Slime',       hp:520,  dmg:70,  hit:1.3, rng:.6,  spd:1.1,  r:.6,  split:{u:'slimelet', n:2}},
  slimelet: {name:'Slimelet',        hp:180,  dmg:40,  hit:1.1, rng:.5,  spd:1.5,  r:.38},
  hoop:     {name:'Hoop Cannon',     hp:560,  dmg:80,  hit:.9,  rng:5.5, spd:0,    r:.8,  bld:1, life:30, shot:'ball'},
  mascot:   {name:'The Mascot',      hp:2200, dmg:150, hit:1.5, rng:.8,  spd:.95,  r:.85, only:'b'},
  barista:  {name:'Barista Wizard',  hp:400,  dmg:150, hit:1.5, rng:5,   spd:1.3,  r:.4,  air:1, splash:1.4, shot:'coffee'},
  golem:    {name:'Stone Golem',     hp:3200, dmg:190, hit:2.2, rng:.8,  spd:.8,   r:1.0, only:'b', death:{dmg:200, r:2.2}},
  ref:      {name:'Sniper Ref',      hp:420,  dmg:130, hit:1.1, rng:6,   spd:1.3,  r:.4,  air:1, shot:'flag'},
  vending:  {name:'Vending Machine', hp:800,  dmg:0,   hit:1,   rng:0,   spd:0,    r:.8,  bld:1, life:36, spawn:{u:'gob', every:4.2, n:1, first:1}},
  trainer:  {name:'The Trainer',     hp:620,  dmg:55,  hit:1.3, rng:3.5, spd:1.3,  r:.4,  air:1, shot:'water', heal:{amt:45, r:3, every:1}},
  fast:     {name:'Fast Break',      hp:1050, dmg:190, hit:1.4, rng:.8,  spd:1.35, r:.55, charge:{after:2.5, spd:2, dmg:2}},
  dragon:   {name:'Arena Dragon',    hp:720,  dmg:95,  hit:1.5, rng:3,   spd:1.6,  r:.7,  fly:1, air:1, splash:1.3, shot:'fire'},
  ghost:    {name:'Night Shift Ghost', hp:560, dmg:150, hit:1.4, rng:.7, spd:1.9,  r:.45, fly:1, air:1},
  buzzer:   {name:'Buzzer Beater',   hp:1900, dmg:130, hit:1.4, rng:.8,  spd:1.3,  r:.75, death:{dmg:520, r:3, delay:1.4}},
  witch:    {name:'Graveyard Witch', hp:520,  dmg:80,  hit:1.0, rng:5,   spd:1.3,  r:.4,  air:1, splash:.8, shot:'magic', spawn:{u:'skel', every:6.5, n:3, first:1}},
  fivestar: {name:'Five-Star BDB',   hp:3000, dmg:260, hit:1.6, rng:1.0, spd:1.2,  r:.9,  splash:1.7},
  jumbo:    {name:'The Jumbotron',   hp:1200, dmg:900, hit:4.5, rng:4.5, spd:.95,  r:.8,  splash:1.8, shot:'beam', load:3},
  princess: {name:'Hoop Tower',      hp:1500, dmg:55,  hit:.8,  rng:7.5, spd:0,    r:1.15, bld:1, air:1, shot:'ball', twr:1},
  king:     {name:'King Tower',      hp:2600, dmg:60,  hit:1.0, rng:7,   spd:0,    r:1.5,  bld:1, air:1, shot:'ball', twr:1}
};

/* The 24 characters. tier is how prized the character is; u = unit key, n = how many drop. */
const BASE = {
  skels:   {name:'Skeleton Crew',    cost:2, tier:'c', u:'skel', n:4,    desc:'Four skeletons on the night shift. Cheap, fast, and gone in one hit.'},
  bench:   {name:'Benchwarmer',      cost:3, tier:'c', u:'bench', n:1,   desc:'Sturdy all-rounder who finally got off the bench. Swings a folding chair.'},
  shooters:{name:'Three-Point Shooters', cost:3, tier:'c', u:'shooter', n:2, desc:'Two shooters who hit from range, ground or air. Better percentage than BDB.'},
  gobs:    {name:'Snack Goblins',    cost:2, tier:'c', u:'gob', n:3,     desc:'Three quick goblins who raid towers the way BDB raids the vending machine.'},
  bats:    {name:'Night Bats',       cost:2, tier:'c', u:'bat', n:4,     desc:'Four flying pests. Ground troops without range cannot touch them.'},
  airball: {name:'Airball Barrage',  cost:3, tier:'c', spell:{kind:'rain', r:3.6, dmg:150, twr:.35, delay:.9}, desc:'A wide shower of missed shots. Clears swarms anywhere on the map.'},
  slime:   {name:'Mop Slime',        cost:3, tier:'c', u:'slime', n:1,   desc:'A walking mop bucket spill. Pop it and it splits into two smaller ones.'},
  hoop:    {name:'Hoop Cannon',      cost:3, tier:'c', u:'hoop', n:1,    desc:'A building that fires basketballs at ground troops and pulls tanks toward it.'},
  mascot:  {name:'The Mascot',       cost:5, tier:'r', u:'mascot', n:1,  desc:'Huge, slow and only interested in buildings. Protect him and towers fall.'},
  barista: {name:'Barista Wizard',   cost:5, tier:'r', u:'barista', n:1, desc:'Throws scalding coffee that splashes everything near the target.'},
  golem:   {name:'Stone Golem',      cost:7, tier:'r', u:'golem', n:1,   desc:'A mountain of health that walks at towers and bursts when it breaks.'},
  ref:     {name:'Sniper Ref',       cost:4, tier:'r', u:'ref', n:1,     desc:'Long range, hard hits, one target at a time. Throws flags at everything.'},
  coffee:  {name:'Hot Coffee',       cost:4, tier:'r', spell:{kind:'bomb', r:2.4, dmg:380, twr:.35, delay:1.0}, desc:'One giant cup lobbed across the map. Big damage in a small circle.'},
  vending: {name:'Vending Machine',  cost:5, tier:'r', u:'vending', n:1, desc:'A building that keeps dropping Snack Goblins until it runs out.'},
  trainer: {name:'The Trainer',      cost:4, tier:'r', u:'trainer', n:1, desc:'Keeps nearby teammates topped up with water. Heals everyone around her.'},
  fast:    {name:'Fast Break',       cost:5, tier:'r', u:'fast', n:1,    desc:'Builds up to a sprint, and the first hit after a sprint lands double.'},
  dragon:  {name:'Arena Dragon',     cost:4, tier:'e', u:'dragon', n:1,  desc:'Flies over the river and breathes splash fire on ground and air.'},
  ghost:   {name:'Night Shift Ghost',cost:3, tier:'e', u:'ghost', n:1,   desc:'Floats over everything and hits hard. Still wearing the lanyard.'},
  clockout:{name:'Clock Out',        cost:4, tier:'e', spell:{kind:'freeze', r:3, dmg:60, twr:.35, freeze:4, delay:.35}, desc:'Everything in the circle stops working for four seconds. Towers too.'},
  overtime:{name:'Overtime',         cost:2, tier:'e', spell:{kind:'rage', r:4, rage:7, delay:.3}, desc:'Your troops in the circle move and hit a third faster for seven seconds.'},
  buzzer:  {name:'Buzzer Beater',    cost:6, tier:'e', u:'buzzer', n:1,  desc:'Carries a shot clock that goes off when he drops. Stand back.'},
  witch:   {name:'Graveyard Witch',  cost:5, tier:'e', u:'witch', n:1,   desc:'Splash magic from range, and three fresh skeletons every few seconds.'},
  fivestar:{name:'Five-Star BDB',    cost:7, tier:'l', u:'fivestar', n:1, desc:'The prospect himself. Huge health and a slam that hits everything around him.'},
  jumbo:   {name:'The Jumbotron',    cost:6, tier:'l', u:'jumbo', n:1,   desc:'Charges up slowly, then one highlight reel blast wipes out a whole push.'}
};

/* One stat block per character + style + rarity, built on first use. */
const UV = new Map();
export function unitVar(key, aff = 'std', rar = 'c'){
  const k = key + '|' + aff + '|' + rar; let U = UV.get(k);
  if (U) return U;
  const b = UNITS[key], a = AFF[aff] || AFF.std, m = (RAR[rar] || RAR.c).mul;
  U = {...b, key, aff:AFF[aff] ? aff : 'std', rar:RAR[rar] ? rar : 'c', hp:Math.round(b.hp * a.hp * m), dmg:Math.round(b.dmg * a.dmg * m), spd:b.spd * a.spd, hit:+(b.hit * (a.haste || 1)).toFixed(2),
    r:b.r * (1 + (a.size - 1) * .6), size:a.size, chill:a.chill || 0, steal:a.steal || 0};
  if (b.death) U.death = {...b.death, dmg:Math.round(b.death.dmg * a.dmg * m)};
  else if (a.toxic && !b.twr) U.death = {dmg:Math.round(U.dmg * .9) + 40, r:1.5 + b.r * .5};
  if (b.heal) U.heal = {...b.heal, amt:Math.round(b.heal.amt * m)};
  UV.set(k, U); return U;
}

export const CARDS = {};
for (const b in BASE) for (const a of AFF_IDS) for (const r of RAR_IDS){
  const B = BASE[b], A = AFF[a], m = RAR[r].mul, id = `${b}-${a}-${r}`;
  const c = {id, base:b, aff:a, rar:r, tier:B.tier, name:(A.name ? A.name + ' ' : '') + B.name, baseName:B.name, cost:clamp(B.cost + A.cost, 1, 10), desc:B.desc, note:A.note, price:Math.round(RAR[r].price * TIER[B.tier] / 10) * 10};
  if (B.spell){
    const s = B.spell;
    c.type = 'spell'; c.art = b;
    c.spell = {kind:s.kind, r:+(s.r * (1 + (A.size - 1) * .8)).toFixed(2), dmg:Math.round((s.dmg || 0) * A.dmg * m), twr:(s.twr || 1) * (A.hp >= 1.3 ? 1.5 : 1), delay:+(s.delay * (A.spd > 1.2 ? .6 : 1)).toFixed(2),
      freeze:s.freeze ? +(s.freeze * (a === 'ice' ? 1.35 : 1) * (.9 + m * .1)).toFixed(1) : 0, rage:s.rage ? +(s.rage * (.7 + m * .3) * A.hp).toFixed(1) : 0, chill:A.chill || 0, steal:A.steal || 0};
  } else { c.u = B.u; c.n = B.n; c.U = unitVar(B.u, a, r); c.art = B.u; c.type = c.U.bld ? 'build' : 'unit'; }
  CARDS[id] = c;
}
export const CARD_IDS = Object.keys(CARDS), BASE_IDS = Object.keys(BASE);
export const baseName = b => BASE[b].name;
export const STARTERS = ['skels', 'bench', 'shooters', 'gobs', 'bats', 'airball', 'slime', 'hoop', 'mascot', 'barista', 'ref', 'trainer', 'coffee', 'vending', 'dragon'].map(b => b + '-std-c');
export const DECK_SIZE = 15, HAND = 5, MAX_LEGEND = 3, DECK_SLOTS = 3;
export const upgradeCost = (id, lvl) => Math.max(40, Math.round(CARDS[id].price * .15 * lvl / 10) * 10);

export function deckProblem(ids, strict = true){
  if (!Array.isArray(ids) || ids.length !== DECK_SIZE || ids.some(i => !i)) return `A deck needs ${DECK_SIZE} cards.`;
  if (ids.some(i => !CARDS[i])) return 'Unknown card.';
  if (new Set(ids.map(i => CARDS[i].base)).size !== ids.length) return 'Only one version of each character per deck.';
  if (strict && ids.filter(i => CARDS[i].rar === 'l').length > MAX_LEGEND) return `No more than ${MAX_LEGEND} Legendary cards per deck.`;
  return null;
}

/* Maps. bridges: where ground troops can cross the river (centre x and width). river:false is an open field. */
export const MAPS = {
  field:   {name:'Staff Picnic Field', river:true, bridges:[{x:-5.5, w:2.6}, {x:5.5, w:2.6}],          blurb:'Grass, a river and two bridges.'},
  court:   {name:'Centre Court',  river:true,  bridges:[{x:-5.5, w:2.6}, {x:5.5, w:2.6}],             blurb:'Two bridges. The classic.'},
  casino:  {name:'Casino Floor',  river:true,  bridges:[{x:-6.4, w:2.2}, {x:0, w:2.2}, {x:6.4, w:2.2}], blurb:'Three narrow bridges. Watch the middle.'},
  breakrm: {name:'Break Room',    river:true,  bridges:[{x:0, w:6}],                                  blurb:'One wide crossing. Everything meets in the middle.'},
  lot:     {name:'Parking Lot',   river:false, bridges:[],                                            blurb:'No river. Troops walk straight at you.'}
};
export const MAP_IDS = Object.keys(MAPS);

/* CPU ladder. react: seconds between decisions. hold: Mana he likes to sit on before attacking.
   derp: chance of a random play. smart: 0 to 1, how well he counters. el: Mana speed multiplier.
   His 15 cards are his characters crossed with his favourite styles and rarities. */
const cpu = (id, name, tag, map, lvl, coins, ai, bases, affs, rars) => ({id, name, tag, map, lvl, coins, ai, deck:bases.split(' ').map((b, i) => `${b}-${affs[i % affs.length]}-${rars[i % rars.length]}`)});
export const CPUS = [
  cpu('trainee', 'Trainee BDB',      'First week. Still looking for the time clock.',          'field',   1, 80,  {react:3.2, hold:9,   derp:.45, smart:.15, el:.85},
    'skels bench shooters gobs bats airball slime hoop mascot barista ref trainer coffee vending dragon', ['std'], ['c']),
  cpu('breakrm', 'Break Room BDB',   'Defends the microwave line with his whole career.',      'breakrm', 1, 120, {react:2.6, hold:8,   derp:.3,  smart:.3,  el:.92},
    'skels gobs bats slime vending airball shooters bench hoop ref trainer barista mascot coffee ghost', ['std', 'rook', 'std'], ['c', 'c', 'r']),
  cpu('bench',   'Bench Warmer BDB', 'Best seat in the house, every single game.',             'court',   2, 170, {react:2.2, hold:8,   derp:.2,  smart:.45, el:1},
    'mascot bench shooters ref airball hoop gobs trainer golem barista fast skels coffee slime bats', ['iron', 'std', 'vet'], ['c', 'r']),
  cpu('night',   'Night Shift BDB',  'Wide awake at 4 a.m. and nothing to show for it.',       'casino',  3, 230, {react:1.9, hold:7.5, derp:.14, smart:.55, el:1},
    'bats ghost dragon skels bench clockout shooters airball witch ref gobs barista fast overtime slime', ['vamp', 'std', 'quick'], ['r', 'c', 'r']),
  cpu('rec',     'Rec League BDB',   'Captain, coach and leading scorer. Two points a night.', 'lot',     4, 300, {react:1.7, hold:7,   derp:.1,  smart:.65, el:1},
    'hoop vending coffee airball barista fast gobs ref mascot trainer dragon skels buzzer bench clockout', ['fire', 'std', 'gold'], ['r', 'r', 'e']),
  cpu('varsity', 'Varsity BDB',      'Made the team photo. Mostly the back row.',              'breakrm', 5, 380, {react:1.5, hold:7,   derp:.07, smart:.75, el:1.05},
    'golem witch barista skels coffee bats trainer overtime buzzer dragon ref bench hoop ghost airball', ['iron', 'ice', 'vet'], ['r', 'e']),
  cpu('d1',      'D1 Dream BDB',     'Florida was a great idea on paper.',                     'casino',  7, 480, {react:1.3, hold:6.5, derp:.04, smart:.85, el:1.1},
    'fast dragon jumbo buzzer ref clockout gobs airball witch golem ghost mascot coffee barista skels', ['quick', 'gold', 'fire', 'giant'], ['e', 'r', 'e', 'l']),
  cpu('five',    'Five-Star BDB',    'The prospect. The legend. The 2.0 points per game.',     'court',   9, 650, {react:1.1, hold:6,   derp:.02, smart:1,   el:1.2},
    'fivestar jumbo golem witch dragon coffee skels overtime buzzer fast ghost ref clockout barista mascot', ['gold', 'giant', 'vamp', 'ice'], ['e', 'e', 'l', 'e', 'e'])
];

/* Weighted draw: rarer cards come up less often. Used for the card you win and for crates. rnd is a 0..1 function. */
export const DRAW_W = {c:50, r:30, e:15, l:5};
export function weightedPick(ids, weightOf, rnd = Math.random){
  let sum = 0; for (const i of ids) sum += weightOf(i);
  let k = rnd() * sum;
  for (const i of ids){ k -= weightOf(i); if (k <= 0) return i; }
  return ids[ids.length - 1];
}
const BY_RAR = {}; for (const id of CARD_IDS) (BY_RAR[CARDS[id].rar] = BY_RAR[CARDS[id].rar] || []).push(id);
export function crateRoll(rnd = Math.random){ const pool = BY_RAR[weightedPick(RAR_IDS, r => RAR[r].w, rnd)]; return pool[Math.floor(rnd() * pool.length)]; }
