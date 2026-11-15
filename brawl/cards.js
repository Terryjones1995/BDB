/* Break Room Brawl: every card, unit, map, pack, deck and CPU opponent. Pure data, no DOM, shared by the rules, the CPU and the screens.
   246 characters, spells, buildings and traps, each in 10 builds = 2,460 cards. Every character has one fixed rarity and one type. */

export const RAR = {
  c:{name:'Common',    w:60, col:'#9fb3d9', base:50,   per:15},
  r:{name:'Rare',      w:28, col:'#ff9d3c', base:260,  per:30},
  e:{name:'Epic',      w:10, col:'#c77dff', base:900,  per:100},
  l:{name:'Legendary', w:2,  col:'#ffd95a', base:3600, per:200},
  g:{name:'God',       w:0,  col:'#dff4ff', base:24000, per:800}      // one to a deck. They do something to the whole field. Never in a daily deal: packs, prizes or the Market only
};
export const RAR_IDS = ['c', 'r', 'e', 'l', 'g'];
export const MAX_LVL = 10;
export const lvlMul = l => 1 + .08 * (Math.max(1, l) - 1);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* Types. Four or more cards of one type in a deck and that type fights harder (see typeBonus). */
export const TYPES = {
  dragon:{name:'Dragon',     col:'#35c46a'}, fire:{name:'Fire',     col:'#ff6a2b'}, frost:{name:'Frost',  col:'#63c8ff'}, arcane:{name:'Wizard', col:'#a678ff'},
  dark:  {name:'Dark Arts',  col:'#8d6bd1'}, shadow:{name:'Shadow', col:'#7c8aa8'}, beast:{name:'Beast',  col:'#c98a4b'}, nature:{name:'Nature', col:'#7ccf4a'},
  horde: {name:'Horde',      col:'#d6583a'}, order:{name:'Order',   col:'#f2c14e'}, tech:{name:'Machine', col:'#5fd6d0'}, crew:{name:'Break Room', col:'#ff7aa8'}
};
export const TYPE_IDS = Object.keys(TYPES);
export const SET_AT = [4, 7, 10], SET_MUL = [1.06, 1.12, 1.18];
export function typeBonus(ids){
  const n = {}, out = {}; for (const id of ids || []){ const c = CARDS[id]; if (c) n[c.type] = (n[c.type] || 0) + 1; }
  for (const t in n){ let m = 1; for (let i = 0; i < SET_AT.length; i++) if (n[t] >= SET_AT[i]) m = SET_MUL[i]; if (m > 1) out[t] = m; }
  return out;
}
export const typeCount = ids => { const n = {}; for (const id of ids || []){ const c = CARDS[id]; if (c) n[c.type] = (n[c.type] || 0) + 1; } return n; };

/* Builds: the same character with a different build. w: how often a pack turns one up. pm: price. */
export const AFF = {
  std:  {name:'',        tint:null,     cost:0,  hp:1,    dmg:1,    spd:1,    size:1,    w:50, pm:1,   note:''},
  rook: {name:'Rookie',  tint:0xb6e39a, cost:-1, hp:.74,  dmg:.78,  spd:1.05, size:.86,  w:8,  pm:.9,  note:'Rookie: costs 1 less Mana and is a little weaker.'},
  ice:  {name:'Frozen',  tint:0x7fd4ff, cost:0,  hp:1,    dmg:.9,   spd:.95,  size:1,    w:7,  pm:1.4, note:'Frozen: every hit slows the target.', chill:1.8},
  fire: {name:'Blazing', tint:0xff5a1f, cost:0,  hp:.88,  dmg:1.05, spd:1.05, size:1,    w:7,  pm:1.4, note:'Blazing: every hit sets the target on fire.', burn:.3},
  quick:{name:'Turbo',   tint:0xc8f53a, cost:0,  hp:.82,  dmg:.95,  spd:1.4,  size:.94,  w:7,  pm:1.4, note:'Turbo: much faster on its feet and on the attack, but fragile.', haste:.85},
  iron: {name:'Iron',    tint:0x8f99ad, cost:0,  hp:1.5,  dmg:.9,   spd:.8,   size:1.05, w:7,  pm:1.3, note:'Iron: far more health, but slower.'},
  tox:  {name:'Toxic',   tint:0x58d848, cost:0,  hp:.95,  dmg:.95,  spd:1,    size:1,    w:5,  pm:1.5, note:'Toxic: bursts and hurts everything nearby when it is defeated.', toxic:1},
  vamp: {name:'Vampire', tint:0x8a4fd8, cost:0,  hp:.92,  dmg:1,    spd:1,    size:1,    w:4,  pm:1.6, note:'Vampire: heals itself with every hit.', steal:.35},
  gold: {name:'Golden',  tint:0xffcf3a, cost:1,  hp:1.25, dmg:1.28, spd:1.08, size:1.05, w:3,  pm:2,   note:'Golden: stronger and quicker. Costs 1 more Mana.'},
  giant:{name:'Giant',   tint:0xff7aa8, cost:2,  hp:1.8,  dmg:1.35, spd:.85,  size:1.32, w:2,  pm:2.2, note:'Giant: huge, tough and slow. Costs 2 more Mana.'}
};
export const AFF_IDS = Object.keys(AFF);

/* What each job gets per Mana spent. A horde splits a little health between a lot of bodies; a giant is one enormous health bar.
   [health, damage per second, seconds per hit, reach, speed, body radius] */
const ROLE = {
  swarm:  [100, 85, 1.0, .5,  1.9,  .28], runner: [150, 70, .9,  .5,  2.3,  .32], brawler:[300, 27, 1.2, .7,  1.3,  .5],  bruiser:[225, 36, 1.4, .8,  1.3,  .55],
  tank:   [400, 18, 1.5, .8,  1.05, .75], giant:  [460, 14, 2.0, .8,  .85,  .95], archer: [110, 36, 1.1, 5,   1.3,  .34], sniper: [105, 30, 1.2, 6.2, 1.25, .4],
  caster: [85,  22, 1.5, 5,   1.25, .4],  support:[150, 14, 1.3, 3.5, 1.3,  .4],  flyer:  [185, 32, 1.3, .7,  1.9,  .45], flock:  [95,  75, 1.2, .6,  2.3,  .3],
  killer: [140, 42, 1.0, .7,  1.8,  .4],  build:  [190, 28, .9,  5.5, 0,    .8]
};
export const ROLE_NAME = {swarm:'Horde', runner:'Runner', brawler:'Brawler', bruiser:'Heavy hitter', tank:'Tank', giant:'Giant', archer:'Ranged', sniper:'Sniper', caster:'Caster', support:'Support',
  flyer:'Flyer', flock:'Flying horde', killer:'Assassin', build:'Building'};

/* The roster: [key, name, type, rarity, job, Mana, how many, extras, description]. Mana 0 is a unit that only ever arrives through another card.
   Extras: hm / dm scale health and damage; fly:1 puts it in the air whatever its job; the rest are abilities the rules know (see sim.js). */
const ROSTER = [
  /* ----- Order ----- */
  ['ironclad', 'Ironclad', 'order', 'c', 'brawler', 3, 1, {shield:220}, 'Sword, shield and no days off. His shield soaks up the first few hits for free.'],
  ['longshots', 'Longshots', 'order', 'c', 'archer', 3, 2, {shot:'arrow'}, 'Two archers who hit ground and air from way back. Keep something big in front of them.'],
  ['dawnhammer', 'Dawnhammer', 'order', 'r', 'tank', 5, 1, {heal:{amt:55, r:3, every:1}, splash:1, dm:.9}, 'A walking wall with a war hammer. Everyone standing near her keeps getting patched up.'],
  ['oathkeeper', 'Oathkeeper', 'order', 'e', 'brawler', 4, 1, {dm:1.25, land:{r:3.2, shield:350}, taunt:3.2, hm:1.38}, 'Lands and hands every teammate nearby a shield, then dares the other side to hit him first.'],
  ['bell', 'Bellkeeper', 'order', 'r', 'bruiser', 5, 1, {splash:1.15, dm:.62, land:{r:2.6, dmg:90, stun:1.6}, stun:{every:4, t:.8}}, 'Rings the bell when he lands: everything close is stunned. Every fourth swing rings it again.'],
  ['whitemane', 'Whitemane', 'order', 'e', 'bruiser', 5, 1, {charge:{after:2.5, spd:1.7, dmg:3, dash:1}, knock:1.2, spd:1.9, r:.65, hm:1.25}, 'A lancer at full gallop from the moment she lands. The first hit of every charge lands triple and throws the target back.'],
  ['brynja', 'Brynja, Sky Maiden', 'order', 'e', 'flyer', 5, 1, {leap:{min:2, max:5.5, mul:2}, shield:200, hm:1.05}, 'Flies over everything, picks a target and dives on it from a long way out. The dive lands double.'],
  ['kingbellow', 'King Bellow', 'order', 'l', 'tank', 6, 1, {land:{r:3, summon:{u:'kguard', n:2}}, aura:{r:4, haste:1}, hm:.99, dm:1.52, splash:1}, 'The king himself, with two royal guards. Everyone fighting near him moves and hits a third faster, and he is not shy with the sceptre.'],
  ['heartstone', 'Heartstone', 'order', 'e', 'tank', 6, 1, {regen:.02, taunt:3.2, armor:20, hm:.85}, 'A stone guardian with a crystal heart. It mends itself, small hits bounce off, and enemies close by cannot look away from it.'],
  ['pridemane', 'Sir Pridemane', 'order', 'r', 'brawler', 4, 1, {stoic:1, hm:1.1}, 'A lion in full plate. Nothing stops him: he cannot be stunned, frozen, slowed or rattled.'],
  ['brother', 'Brother Tome', 'order', 'c', 'support', 3, 1, {heal:{amt:34, r:3, every:1, cure:1}, rng:1, dm:1.3, hit:1.2}, 'Reads from the good book. Teammates near him heal, and fire, poison, slows and curses come right off them.'],
  ['halo', 'Halo', 'order', 'r', 'flyer', 4, 1, {shield:180, land:{r:3, shield:220}, hm:.9, dm:.85}, 'A very small angel. Arrives with a shield for himself and one for every teammate close by.'],
  ['scarlet', 'Dame Scarlet', 'order', 'c', 'brawler', 3, 1, {shield:200, stun:{every:3, t:.8}, dm:.9}, 'Shield first, questions later. Every third hit is a shield bash that stuns.'],
  ['halberd', 'Dame Halberd', 'order', 'c', 'brawler', 3, 1, {rng:1.4, hm:.9}, 'Her spear reaches over the shoulder of whoever is standing in front of her.'],
  ['hilda', 'Hilda Hammerfall', 'order', 'e', 'bruiser', 4, 1, {hm:1.25, splash:1.2, knock:1.1, stun:{every:3, t:.9}, raze:1.5, dm:.94}, 'The hammer comes down and everything around the target goes flying. Every third swing stuns, and walls do not last long.'],
  /* ----- Shadow ----- */
  ['voidplate', 'Voidplate', 'shadow', 'e', 'tank', 5, 1, {deflect:.6, steal:.2, hm:.96, dm:1.44}, 'Armour with nothing inside it. Arrows, bolts and spells mostly pass straight through, and every swing feeds it.'],
  ['bandit', 'Stickup Stan', 'shadow', 'c', 'bruiser', 3, 1, {rob:.15, hm:1.05}, 'Your Mana or your life. Every hit on a troop picks its owner’s pocket and hands the Mana to you.'],
  ['reynard', 'Reynard', 'shadow', 'r', 'killer', 3, 1, {stealth:{mul:2, re:5}, dodge:.2, spd:2.2}, 'A fox in a hood. Unseen until he strikes, double damage from the dark, and hard to pin down after.'],
  ['viper', 'Viper', 'shadow', 'c', 'killer', 3, 1, {psn:{dps:30, t:4}, spd:2.1, dm:.8}, 'Fast, quiet and never without a poisoned blade.'],
  ['corvus', 'Corvus', 'shadow', 'r', 'flyer', 4, 1, {exec:{at:.5, mul:2}, mark:{t:3}, hm:.9}, 'Circles overhead and drops on anything already hurt: double damage below half health. Whatever he pecks is marked.'],
  ['whiskers', 'Whiskers', 'shadow', 'r', 'killer', 3, 1, {any:1, leech:.5, hm:1.4}, 'A cat burglar. Drops in anywhere on the field, and every hit on a tower steals Mana for you.'],
  ['kitsune', 'Kitsune', 'shadow', 'e', 'killer', 4, 1, {land:{r:2, summon:{u:'kitshade', n:2}}, crit:{every:3, mul:2.2}, dodge:.2, spd:2}, 'Arrives with two copies of herself. They hit hard and vanish at a touch. Good luck picking the right one.'],
  ['noir', 'Noir', 'shadow', 'r', 'killer', 4, 1, {crit:{every:2, mul:1.7}, steal:.2, spd:1.9}, 'A duellist in a long coat. Every second cut lands hard, and every cut feeds him.'],
  ['onyx', 'Onyx', 'shadow', 'r', 'killer', 3, 1, {stealth:{mul:2.5, re:4}, mark:{t:3}, spd:2.1}, 'Unseen until the first cut, which lands for two and a half times. Whatever she cuts is marked for everyone else.'],
  ['midnight', 'Mister Midnight', 'shadow', 'e', 'bruiser', 5, 1, {crit:{every:3, mul:2.5}, steal:.25, deflect:.3, hm:1.05}, 'Wide hat, cursed arm. Every third punch lands for two and a half times, every punch feeds him, and arrows find him hard to hit.'],
  ['akaoni', 'Akaoni, the Red Blade', 'shadow', 'e', 'bruiser', 4, 1, {dm:1.25, first:{mul:3}, hm:1.31, spd:1.5, hit:1.1}, 'Draws on every new opponent: his first cut on anything lands triple. Send him at their biggest troop.'],
  ['redbeard', 'Captain Redbeard', 'shadow', 'r', 'bruiser', 4, 1, {loot:.5, hm:1.1}, 'Every kill is plunder. Half a Mana for you each time he finishes something off.'],
  ['cutpurse', 'Cutpurse', 'shadow', 'r', 'killer', 3, 1, {hm:1.25, spd:2.2, leech:.35}, 'Quick hands. Every hit he lands on a tower lifts a little Mana for you.'],
  ['nightbolt', 'Nightbolt', 'shadow', 'c', 'sniper', 4, 1, {shot:'bolt'}, 'One crossbow, one target, a very long way off.'],
  ['vesper', 'Vesper', 'shadow', 'r', 'killer', 4, 1, {stealth:{mul:3, re:3.5}}, 'Nobody sees her coming. Her first strike from the dark lands triple, then she slips away again.'],
  ['kage', 'Kage', 'shadow', 'e', 'killer', 3, 1, {dm:1.33, hm:1.33, any:1, dodge:.3, crit:{every:3, mul:2}}, 'Drops in anywhere on the field, their side included. Dodges, and every third cut lands double.'],
  ['shinobi', 'Shinobi', 'shadow', 'r', 'bruiser', 4, 1, {crit:{every:3, mul:2.2}}, 'Fast feet and a short fuse. Every third strike is a monster.'],
  /* ----- Dark Arts ----- */
  ['bonecrew', 'Bone Crew', 'dark', 'c', 'swarm', 2, 4, {u:'skel'}, 'Four skeletons on the night shift. Cheap, fast, and gone in one hit.'],
  ['boneknight', 'Bone Knight', 'dark', 'c', 'brawler', 3, 1, {revive:.35, hm:.85}, 'Knock him down and he gets back up. Once.'],
  ['bonearchers', 'Bone Archers', 'dark', 'c', 'archer', 3, 2, {shot:'bolt'}, 'Two dead-eyed crossbows. No lungs, so they never breathe before the shot.'],
  ['gravewitch', 'Grave Witch', 'dark', 'e', 'caster', 5, 1, {splash:.8, dm:.75, spawn:{u:'skel', every:6.5, n:3, first:1}, shot:'magic'}, 'Splash magic from range, and three fresh skeletons every few seconds.'],
  ['mort', 'Mort the Necromancer', 'dark', 'r', 'support', 5, 1, {rng:5, dm:1.3, raise:{u:'skel', r:4.5, max:6, cd:1}, mark:{t:4}, shot:'magic'}, 'Anything that dies near him gets back up as his skeleton. His curse makes targets take extra damage.'],
  ['colossus', 'Bone Colossus', 'dark', 'e', 'giant', 5, 1, {dm:1.26, hm:1.39, revive:.4}, 'A giant that only wants towers. Break it and it pulls itself back together for another go.'],
  ['sanguine', 'Count Sanguine', 'dark', 'e', 'bruiser', 5, 1, {steal:.5, grow:{per:.12, max:6}}, 'Drinks back half of every hit, and every kill makes him hit harder for the rest of the match.'],
  ['lostsoul', 'Lost Soul', 'dark', 'c', 'flyer', 3, 1, {}, 'Floats over everything and hits hard. Still looking for whoever owes it money.'],
  ['wraith', 'Skullwraith', 'dark', 'r', 'flyer', 4, 1, {chill:2, steal:.3, rng:2.5, shot:'magic'}, 'Flies, chills what it hits and feeds on it.'],
  ['gloombats', 'Gloom Bats', 'dark', 'c', 'flock', 2, 4, {u:'gbat'}, 'Four flying pests. Ground troops without range cannot touch them.'],
  ['terror', 'Night Terror', 'dark', 'r', 'flyer', 4, 1, {split:{u:'gbat', n:3}, hm:.9}, 'One big bat. Kill it and three smaller problems fall out.'],
  ['nightfall', 'Nightfall', 'dark', 'e', 'tank', 6, 1, {armor:45, splash:1.4, dm:1.1}, 'The Black Knight. Small hits barely scratch the armour, and the sword clears a whole crowd.'],
  ['lich', 'Mortis, the Lich King', 'dark', 'l', 'caster', 7, 1, {hm:1.65, dm:1.15, splash:1.2, raise:{u:'skel', r:5.5, max:6, cd:1}, land:{r:3, summon:{u:'skel', n:3}}, shot:'magic'}, 'Arrives with three skeletons and raises another from everything that dies near him. The longer the fight, the bigger his army.'],
  ['tatters', 'King Tatters', 'dark', 'r', 'tank', 5, 1, {curse:4, hm:.95}, 'Wrapped in a curse. Whoever hits him up close is cursed too, and takes extra damage from everything.'],
  ['jackhollow', 'Jack Hollow', 'dark', 'r', 'killer', 4, 1, {aura:{r:3, weak:1}, hm:1.45}, 'A pumpkin-headed nightmare. Enemies near him lose their nerve and hit a third softer.'],
  ['miasma', 'Doctor Miasma', 'dark', 'e', 'caster', 5, 1, {psn:{dps:32, t:4}, aura:{r:2.2, psn:20}, hm:1.3, shot:'vial'}, 'Throws vials that poison everything they splash, and walks in a cloud that poisons whatever gets close.'],
  ['baron', 'Baron Dusk', 'dark', 'e', 'bruiser', 5, 1, {steal:.4, morph:{u:'terror', at:.35}, hm:1.05}, 'Heals with every bite. Get him down to a third and he turns into a giant bat and keeps coming.'],
  ['rotter', 'Rotter', 'dark', 'c', 'brawler', 3, 1, {infect:{u:'shambler', max:4}, hm:.95, spd:1.1}, 'Slow, patient and catching. Whatever he kills gets back up as a Shambler on your side.'],
  ['acolyte', 'The Acolyte', 'dark', 'r', 'caster', 4, 1, {sap:4, shot:'magic'}, 'His hexes splash, and everything they touch goes weak at the knees: 30 percent less damage for a while.'],
  ['grinn', 'Grinn', 'dark', 'r', 'killer', 4, 1, {wild:1, dodge:.2, dm:.62}, 'A jester with a skull for a face. Every hit is a coin toss: a tap, or a haymaker for triple.'],
  ['rattlecage', 'Rattlecage', 'dark', 'r', 'brawler', 4, 1, {split:{u:'skel', n:3}, armor:15}, 'A skeleton in a helmet. Break him and three more climb out of the pile.'],
  ['pins', 'Pins', 'dark', 'r', 'brawler', 3, 1, {mirror:.5, dm:.7, hm:1.2}, 'A voodoo doll. Whoever hits it, from any distance, feels half of it themselves.'],
  ['nocturne', 'Nocturne', 'dark', 'e', 'caster', 5, 1, {splash:0, siphon:{r:5, frac:.5}, dm:1.3, hm:1.2, shot:'magic'}, 'Takes from them and gives to you: half of the damage he deals goes to your most hurt troop as healing.'],
  ['prior', 'The Crimson Prior', 'dark', 'e', 'bruiser', 5, 1, {psn:{dps:38, t:4}, berserk:1, hm:1.05}, 'Long claws under red robes. Every scratch keeps hurting long after, and the more wounded he is the faster they come.'],
  ['malgrave', 'Malgrave', 'dark', 'e', 'flyer', 5, 1, {rng:3, chain:{n:2, r:2.8, fall:.7}, chill:2, shot:'magic', dm:.8, hm:1.1}, 'A wraith in purple rags. He floats over everything, his bolts jump to two more targets, and all of them slow down.'],
  ['turnkey', 'The Turnkey', 'dark', 'e', 'flyer', 4, 1, {only:'b', lock:.8, hit:1.9, dm:1.46, hm:1.5}, 'Floats past every troop, straight to the nearest building or tower, and locks it: after each blow it cannot fire for most of a second.'],
  ['horseman', 'The Headless Horseman', 'dark', 'l', 'bruiser', 5, 1, {dm:1.14, charge:{after:2.2, spd:1.7, dmg:3, dash:1}, knock:1.3, burn:{dps:30, t:3}, aura:{r:2, burn:30}, land:{r:2.4, dmg:120, burn:1}, spd:1.9, r:.7, hm:1.71}, 'Arrives at a gallop on burning hooves. The first hit of every charge lands triple and throws the target back, and everything near him burns.'],
  /* ----- Fire ----- */
  ['slagmaw', 'Slagmaw', 'fire', 'e', 'bruiser', 5, 1, {fireproof:1, land:{r:2.6, dmg:150, burn:1}, burn:{dps:34, t:3}, death:{dmg:160, r:2.4, delay:.4, pool:{dps:60, t:4}}}, 'Lands in a burst of flame, burns everything he touches, and leaves a pool of fire where he falls.'],
  ['flicker', 'Flicker', 'fire', 'c', 'killer', 3, 1, {burn:{dps:22, t:3}, spd:2.2, fireproof:1, death:{dmg:140, r:1.8, delay:.3}, hm:.9}, 'Fast, bright and gone in a flash. Every hit burns, and she goes out with a bang.'],
  ['obsidian', 'Obsidian', 'fire', 'e', 'tank', 5, 1, {dm:1.2, fireproof:1, armor:25, sear:{dps:28, t:3}, hm:1.02}, 'A knight of cooled lava. Small hits bounce off, fire does nothing, and whatever hits him up close catches light.'],
  ['kindle', 'Kindle', 'fire', 'r', 'caster', 4, 1, {burn:{dps:26, t:3}, pyre:{dmg:120, r:2}, fireproof:1, shot:'fire'}, 'His fire splashes and sticks. Anything he finishes off while it is burning explodes over its friends.'],
  ['ashjaw', 'Ashjaw', 'fire', 'r', 'killer', 3, 1, {charge:{after:2, spd:1.5, dmg:2}, burn:{dps:24, t:3}, hm:1.2, spd:2.3}, 'A hellhound that runs everything down. The first bite of a sprint lands double, and every bite sets the target alight.'],
  ['azar', 'Azar, Flame Djinn', 'fire', 'e', 'bruiser', 4, 1, {dm:1.25, ramp:{step:.25, max:1.5}, aura:{r:2.2, burn:40}, hm:1.44}, 'Burns everything standing near him, and every hit on the same target lands harder than the last.'],
  ['phoenix', 'Solaris, the Phoenix', 'fire', 'l', 'flyer', 4, 1, {revive:.6, rise:{dmg:220, r:2.8, burn:30}, rng:2.5, splash:1.2, burn:{dps:35, t:3}, dm:.7, hm:.92, r:.6, shot:'fire'}, 'Breathes fire from above and leaves everything burning. Shoot it down and it goes up in a blast of flame, then rises from the ashes for a second go.'],
  ['hellion', 'Hellion', 'fire', 'r', 'bruiser', 5, 1, {land:{r:2.4, dmg:160, burn:1}, burn:{dps:38, t:3}}, 'Lands in a burst of fire that burns everything close, then keeps setting things alight with his bare hands.'],
  ['imps', 'Fire Imps', 'fire', 'c', 'flock', 3, 3, {burn:{dps:18, t:3}, hm:1.2}, 'Three flying imps. Whatever they touch keeps burning after they leave.'],
  ['cinder', 'Cinder', 'fire', 'r', 'killer', 4, 1, {burn:{dps:30, t:3}, berserk:1}, 'A flaming sword and a temper. The more hurt she is, the faster she swings.'],
  ['magmaw', 'Magmaw', 'fire', 'e', 'giant', 5, 1, {dm:1.26, hm:1.26, aura:{r:2.2, burn:45}, death:{dmg:260, r:2.6, delay:.5, pool:{dps:70, t:5}}}, 'A lava giant that walks at towers and burns everything beside it. It leaves a pool of fire where it falls.'],
  /* ----- Frost ----- */
  ['glacius', 'Glacius', 'frost', 'r', 'tank', 5, 1, {regen:.025, chill:2, dm:1.15, land:{r:2.8, dmg:70, slow:3.5}}, 'Lands with a blast of cold that slows everything near. Heals himself the whole time he is standing.'],
  ['permafrost', 'Permafrost', 'frost', 'e', 'giant', 5, 1, {dm:1.2, hm:1.2, numb:2, death:{dmg:120, r:2.8, delay:.3, frz:1.6}}, 'An ice giant bound for towers. Anything that hits it slows down, and it freezes the area solid when it shatters.'],
  ['yeti', 'Yeti', 'frost', 'c', 'brawler', 4, 1, {chill:1.6}, 'Big, furry and cold to the touch. Every hit slows the target.'],
  ['frostbeak', 'Frostbeak', 'frost', 'c', 'bruiser', 3, 1, {leap:{min:2, max:4.5, mul:1.6}}, 'A penguin in a helmet. Belly-slides onto whatever it is hunting, and the landing hits extra hard.'],
  ['tundra', 'Tundra Ogre', 'frost', 'r', 'tank', 5, 1, {knock:1.3, dm:1.3, hit:1.7}, 'Hits like a rockslide. Every punch knocks the target back.'],
  ['rimeguard', 'Rimeguard', 'frost', 'r', 'brawler', 4, 1, {shield:240, chill:1.8, numb:1.5}, 'A knight in living ice. A shield for the first hits, a blade that slows, and anyone who hits him up close slows down too.'],
  ['neve', 'Neve, Snow Mage', 'frost', 'r', 'caster', 4, 1, {chill:2, stun:{every:4, t:1.3}, shot:'ice'}, 'Her ice splashes and slows everything near the target. Every fourth spell freezes it solid.'],
  ['nix', 'Nix', 'frost', 'r', 'flyer', 4, 1, {chill:2, stun:{every:3, t:1}, dodge:.2, dm:.8}, 'A little ghost made of frost. She floats over everything, slows what she touches and freezes it on every third hit.'],
  ['mohawk', 'Mohawk', 'frost', 'c', 'bruiser', 3, 1, {regen:.03, chill:1.5}, 'An ice troll with a haircut. Heals the whole time he is standing, and every punch slows.'],
  ['winter', 'Old Man Winter', 'frost', 'e', 'caster', 4, 1, {dm:1.25, chill:2.5, mark:{t:4}, hm:1.62, shot:'ice'}, 'His ice splashes. Whatever it touches is slowed and turns brittle: it takes extra damage from everyone.'],
  ['tusk', 'Admiral Tusk', 'frost', 'r', 'tank', 5, 1, {leap:{min:2, max:4.5, mul:1.7}, splash:1.2, chill:2, dm:.7}, 'A walrus in uniform. Belly-flops onto his target from a long way off and slows everything under him.'],
  ['isolde', 'Isolde, Winter Queen', 'frost', 'l', 'caster', 5, 1, {dm:1.14, hm:2.74, chill:2.5, land:{r:3.2, stun:2}, shatter:{r:4.5, br:2, t:1.3, dmg:40}, shot:'ice'}, 'She lands and everything near stops dead. Her ice splashes and slows, and any enemy that dies near her bursts and freezes its friends.'],
  ['frosty', 'Sir Melts-a-Lot', 'frost', 'c', 'tank', 2, 1, {life:22, numb:2, hm:1.5, dm:.6}, 'A lot of snowman for two Mana. Whoever hits him slows down. He melts in about twenty seconds, so use him now.'],
  ['woolly', 'Woolly', 'frost', 'r', 'giant', 5, 1, {stoic:1, chill:2, hm:1.05}, 'A mammoth bound for the nearest building. Too heavy to stun, freeze, slow or scare, and every hit chills.'],
  /* ----- Wizard ----- */
  ['hagatha', 'Hagatha', 'arcane', 'r', 'caster', 4, 1, {psn:{dps:22, t:4}, mend:60, dm:.8, shot:'vial'}, 'One cauldron, two recipes. Her brew poisons every enemy it splashes and mends every teammate it splashes.'],
  ['vex', 'Vex', 'arcane', 'c', 'sniper', 3, 1, {hit:.55, rng:5, shot:'magic', hm:1.1}, 'Three quick bolts where anyone else gets one. Cheap, fast and always casting.'],
  ['stargazer', 'Stargazer', 'arcane', 'r', 'brawler', 4, 1, {crit:{every:4, mul:2.6}, stun:{every:4, t:1}, dm:1.05}, 'Reads the sky between swings. Every fourth hit a star comes down with it: big damage and a stun.'],
  ['fizzle', 'Doc Fizzle', 'arcane', 'r', 'caster', 4, 1, {brew:28, hm:1.2, shot:'vial'}, 'Throws whatever is bubbling. Every flask burns, slows or poisons everything it splashes, and not even he knows which.'],
  ['tempus', 'Tempus', 'arcane', 'e', 'caster', 5, 1, {land:{r:3.2, stun:2}, chill:2.5, aura:{r:3.5, haste:1}, hm:1.5, dm:.85, shot:'magic'}, 'Stops the clock when he lands: everything near is frozen in place. After that your side runs fast and theirs runs slow.'],
  ['genie', 'The Genie', 'arcane', 'l', 'caster', 4, 1, {hm:2.2, bless:{r:4.5, n:3, hp:.5}, splash:1.2, dm:.85, shot:'magic'}, 'Three wishes. The next three teammates to fall near him get straight back up at half health.'],
  ['hoot', 'Professor Hoot', 'arcane', 'r', 'sniper', 4, 1, {pierce:1, shot:'magic', hm:1.1}, 'An owl with tenure. One spell, one target, a very long way off, and it goes straight through shields and armour.'],
  ['geode', 'Geode', 'arcane', 'e', 'tank', 5, 1, {dm:1.2, thorns:.4, armor:30, hm:.96, death:{dmg:200, r:2.6, delay:.4}}, 'A golem grown from crystal. Small hits bounce off, nearly half of every punch comes back at whoever threw it, and he shatters over everything nearby when he breaks.'],
  ['zephyr', 'Zephyr, Stormcaller', 'arcane', 'e', 'caster', 5, 1, {splash:0, chain:{n:3, r:3, fall:.75}, stun:{every:3, t:.5}, dm:1.1, hit:1.4, shot:'zap'}, 'His lightning jumps from the target to three more. Every third bolt stuns.'],
  ['hexa', 'Hexa', 'arcane', 'c', 'caster', 4, 1, {shot:'magic'}, 'Throws spells that splash everything near the target, ground or air.'],
  ['tonic', 'Tonic', 'arcane', 'r', 'support', 4, 1, {heal:{amt:48, r:3, every:1}, shot:'potion'}, 'A witch with a potion for everything. Keeps everyone around her topped up.'],
  ['wizlings', 'Wizlings', 'arcane', 'c', 'archer', 3, 2, {shot:'magic', hm:.9}, 'Two apprentice wizards. Small hats, real spells.'],
  ['stalker', 'Zorp the Abductor', 'arcane', 'r', 'bruiser', 4, 1, {mark:{t:4}}, 'Came a very long way to tag your troops. Whatever Zorp hits is marked, and marked targets take extra damage from everyone.'],
  ['hexsprite', 'Hex Sprite', 'arcane', 'c', 'flyer', 3, 1, {rng:3.5, shot:'magic', mark:{t:3}, dm:.8, hm:.8}, 'Flies and throws hexes. Whatever it tags takes extra damage.'],
  ['mindsquid', 'Mind Squid', 'arcane', 'r', 'flyer', 4, 1, {rng:3.5, splash:1.2, chill:2.2, dm:.6, shot:'ink'}, 'Sprays ink from above. Everything it splashes slows right down.'],
  ['sentinel', 'Star Sentinel', 'arcane', 'c', 'flyer', 3, 1, {shield:160, hm:.85}, 'A flyer with a shield. The first hits are on the house.'],
  ['archon', 'Astral Archon', 'arcane', 'e', 'flyer', 5, 1, {rng:3, chain:{n:2, r:2.6, fall:.7}, shield:260, shot:'zap', dm:.85}, 'Shielded, airborne, and its bolts jump to two more targets.'],
  /* ----- Beast ----- */
  ['gorehorn', 'Gorehorn', 'beast', 'e', 'bruiser', 5, 1, {charge:{after:2, spd:2, dmg:2.4, dash:1}, knock:1.4, hm:1.25, r:.7}, 'A minotaur who is already charging when he arrives. The first hit lands for more than double and flattens whoever is in the way.'],
  ['lycan', 'Lycan', 'beast', 'e', 'bruiser', 5, 1, {leap:{min:2, max:5, mul:1.8}, steal:.3, spd:1.7}, 'Leaps onto its target and heals with every bite.'],
  ['woodsman', 'Woodsman', 'beast', 'r', 'brawler', 4, 1, {morph:{u:'lycan', at:.5}, hm:.8}, 'A man with an axe, until you get him down to half health. Then he is a werewolf.'],
  ['thumper', 'Thumper', 'beast', 'c', 'bruiser', 3, 1, {leap:{min:2, max:4.5, mul:1.5}}, 'A boxing kangaroo. Jumps on things. Hits them with both gloves.'],
  ['monkroose', 'Silverback', 'beast', 'c', 'caster', 4, 1, {rng:4.5, splash:1.1, hm:1.6, shot:'rock'}, 'A gorilla who lobs rocks that splash. Tougher than most things that fight from range.'],
  ['landshark', 'Landshark', 'beast', 'r', 'bruiser', 4, 1, {exec:{at:.4, mul:2}}, 'Smells blood. Hits anything below 40 percent health for double.'],
  ['piranhas', 'Piranha Pack', 'beast', 'c', 'swarm', 2, 4, {exec:{at:.5, mul:1.6}}, 'Four of them. They go faster through anything already half finished.'],
  ['wolfpack', 'Moonfang Pack', 'beast', 'r', 'swarm', 4, 3, {pack:{r:3.2, per:.15, max:2}, exec:{at:.4, mul:1.6}, hm:1.6, dm:.8, spd:2.1, r:.34}, 'Three wolves that hunt together. Each hits harder for every packmate beside it, and they tear through anything already wounded.'],
  ['ironhide', 'Ironhide', 'beast', 'r', 'tank', 5, 1, {armor:25, land:{r:3, weak:5, dmg:40}}, 'A bear in plate armour. Small hits bounce off, and his roar on arrival rattles every enemy close: they hit a third softer for five seconds.'],
  ['bao', 'Master Bao', 'beast', 'r', 'brawler', 4, 1, {dodge:.3, riposte:1.5, hit:.9, hm:.9}, 'A monk who is never quite where the punch lands. Nearly a third of all attacks miss him, and every punch he slips is answered at once with a kick.'],
  ['siegehorn', 'Siegehorn', 'beast', 'e', 'giant', 6, 1, {charge:{after:2, spd:2.2, dmg:3, dash:1}, armor:25, hm:.85}, 'An armoured rhino with one idea: the nearest building. Arrives at full charge, and the first hit of every charge lands triple.'],
  ['squeak', 'King Squeak', 'beast', 'e', 'support', 4, 1, {land:{r:2, summon:{u:'mouseling', n:3}}, spawn:{u:'mouseling', every:5.5, n:1}, rng:1, hm:1.88, dm:1.62, hit:1.2}, 'A very small king with a very large family. Arrives with three Mouselings and another turns up every few seconds.'],
  ['pridelord', 'Pridelord', 'beast', 'l', 'bruiser', 5, 1, {dm:1.35, land:{r:3.4, weak:6, dmg:90}, aura:{r:3.6, might:1}, crit:{every:3, mul:2}, hm:1.8, r:.65}, 'The king of the beasts. His roar on arrival rattles everything near, teammates beside him hit a quarter harder, and every third swing lands double.'],
  ['hogwild', 'Hogwild', 'beast', 'c', 'bruiser', 3, 1, {charge:{after:2.2, spd:1.6, dmg:2}, knock:.9, hm:.95}, 'A boar with a run-up. The first hit of a charge lands double and sends the target backwards.'],
  ['cackle', 'Cackle', 'beast', 'r', 'killer', 3, 1, {feast:.2, exec:{at:.35, mul:1.6}, spd:2}, 'A hyena who eats well. He heals a fifth of his health whenever anything dies close by, friend or foe.'],
  ['stripes', 'Sensei Stripes', 'beast', 'e', 'brawler', 5, 1, {ramp:{step:.2, max:1.2}, hit:.7, leap:{min:2, max:4.2, mul:1.6}, dodge:.15}, 'A tiger in a black belt. Kicks fast, each kick on the same target lands harder than the last, and the first one arrives from the air.'],
  ['nightmare', 'Nightmare', 'beast', 'r', 'killer', 3, 1, {charge:{after:2, spd:1.6, dmg:2.5, dash:1}, spd:2.4, hm:1.3, r:.5}, 'A black horse with no rider and no brakes. Arrives at a full gallop, and the first hit of every charge lands for two and a half times.'],
  /* ----- Nature ----- */
  ['greenhorn', 'Greenhorn', 'nature', 'r', 'bruiser', 4, 1, {grow:{per:.12, max:6}, regen:.02}, 'A forest spirit in antlers. Mends himself as he goes, and every kill makes him hit harder for the rest of the match.'],
  ['bogmaw', 'Bogmaw', 'nature', 'e', 'tank', 6, 1, {regen:.025, land:{r:3, slow:4, dmg:50}, split:{u:'mudling', n:2}, hm:.85}, 'A walking swamp. Mud slows everything where he lands, he mends himself, and he falls apart into two Mudlings when he is beaten.'],
  ['beekeeper', 'The Beekeeper', 'nature', 'r', 'support', 4, 1, {spawn:{u:'bee', every:4.5, n:2, first:1}, rng:1, hm:1.4, dm:1.2, hit:1.2}, 'Calm man, angry bees. Two more fly out of the suit every few seconds.'],
  ['sunny', 'Sunny', 'nature', 'r', 'archer', 3, 1, {mana:{every:14, amt:1}, regen:.02, dm:.7, shot:'leaf'}, 'Soaks up the light and hands you a Mana every fourteen seconds for as long as she is standing. Spits seeds at whatever objects.'],
  ['willow', 'Willow', 'nature', 'r', 'support', 4, 1, {heal:{amt:38, r:3.2, every:1}, aura:{r:3.2, thorns:1}, dm:1.2, hm:1.25, shot:'leaf'}, 'A dryad. Teammates near her heal, and brambles grow over them: a third of every melee hit goes back at whoever threw it.'],
  ['mossback', 'Old Mossback', 'nature', 'r', 'brawler', 4, 1, {rng:1.4, shield:220, dm:1.05}, 'A turtle with a spear and all the time in the world. Shell for the first hits, and a reach that goes over the front line.'],
  ['bramblehorn', 'Bramblehorn', 'nature', 'r', 'support', 4, 1, {heal:{amt:40, r:3, every:1}, aura:{r:3.2, slow:1}, shot:'leaf', dm:1.2}, 'A faun with a tune for everything. It mends your troops near him and makes enemies near him drowsy and slow.'],
  ['thornweaver', 'Thornweaver', 'nature', 'r', 'support', 4, 1, {heal:{amt:40, r:3, every:1}, chill:2, rng:4.5, dm:1.3, shot:'leaf'}, 'A druid who heals everyone near him and tangles whatever he hits in roots.'],
  ['elderbark', 'Elderbark', 'nature', 'e', 'tank', 5, 1, {dm:1.2, regen:.02, heal:{amt:45, r:3.2, every:1}, land:{r:3, slow:3.5, dmg:60}, hm:1.11}, 'A walking tree. Roots burst out where he lands and slow everything near, he mends himself, and he heals everyone beside him.'],
  ['mushking', 'Mushroom King', 'nature', 'e', 'tank', 5, 1, {dm:1.2, spawn:{u:'mushnub', every:6, n:2, first:2}, hm:1.02}, 'Wide, slow and never alone. Two more Mushnubs pop up beside him every few seconds.'],
  ['mushnubs', 'Mushnubs', 'nature', 'c', 'swarm', 2, 4, {u:'mushnub'}, 'Four little mushrooms with a poisonous bite.'],
  ['sporecap', 'Sporecap', 'nature', 'r', 'brawler', 3, 1, {aura:{r:2, psn:22}}, 'Walks in a cloud of spores. Standing next to it is the mistake.'],
  ['cactoro', 'Cactoro', 'nature', 'r', 'brawler', 4, 1, {thorns:.45}, 'Punch a cactus and see what happens. Nearly half of every hit comes straight back.'],
  ['prickles', 'Prickles', 'nature', 'c', 'swarm', 2, 3, {thorns:.3, hm:1.2}, 'Three small cacti in big hats. They hurt to hit.'],
  ['dartfrog', 'Dart Frog Ronin', 'nature', 'c', 'bruiser', 3, 1, {psn:{dps:28, t:4}, leap:{min:2, max:4, mul:1.3}, dm:.8}, 'A frog in a straw hat with a poisoned blade. Hops onto its target and leaves it poisoned.'],
  ['slime', 'Slime', 'nature', 'c', 'brawler', 3, 1, {split:{u:'slimelet', n:2}, hm:.6, r:.6, spd:1.1}, 'Pop it and it splits into two smaller ones.'],
  ['spikeslime', 'Spike Slime', 'nature', 'r', 'tank', 4, 1, {thorns:.35, split:{u:'slimelet', n:3}, hm:.7}, 'Hurts to hit, and breaks into three Slimelets when it finally goes.'],
  ['bees', 'Bee Swarm', 'nature', 'c', 'flock', 2, 4, {u:'bee'}, 'Four bees. The sting keeps hurting after they are gone.'],
  ['queen', 'Hive Queen', 'nature', 'e', 'flyer', 5, 1, {spawn:{u:'bee', every:5.5, n:2, first:1.5}, rng:2.5, shot:'sting', psn:{dps:20, t:3}, hm:1.1, dm:.7}, 'Flies, stings from range, and sends out two more bees every few seconds.'],
  ['cluckers', 'Cluckers', 'nature', 'c', 'swarm', 2, 5, {hm:.9}, 'Five angry chickens. Nobody knows who let them in.'],
  ['pigeons', 'Pigeon Flock', 'nature', 'c', 'flock', 2, 4, {dodge:.25}, 'Four pigeons with a grudge. They fly, and a quarter of everything aimed at them misses.'],
  /* ----- Horde ----- */
  ['gorak', 'Gorak, Warchief', 'horde', 'r', 'bruiser', 5, 1, {aura:{r:3.6, haste:1}, hm:1.15, splash:.9, dm:.8}, 'Everyone fighting near him moves and hits a third faster. He hits a few of them at once himself.'],
  ['raider', 'Orc Raider', 'horde', 'c', 'brawler', 3, 1, {dm:1.15, hm:.92}, 'An axe and an attitude. Good at the front of anything.'],
  ['skullcrusher', 'Skullcrusher', 'horde', 'r', 'bruiser', 4, 1, {stun:{every:3, t:1}}, 'Every third hit leaves the target seeing stars.'],
  ['mauler', 'Cyclops Mauler', 'horde', 'c', 'bruiser', 4, 1, {splash:1, dm:.7}, 'One eye, one club, one very wide swing. Catches everything around him.'],
  ['orclings', 'Goblin Gang', 'horde', 'c', 'swarm', 2, 4, {pack:{r:3, per:.1, max:3}}, 'Four goblins who raid towers the way BDB raids the vending machine. They hit harder when the mob stays together.'],
  ['witchdoc', 'Witch Doctor', 'horde', 'r', 'caster', 4, 1, {mark:{t:5}, splash:.9, shot:'magic'}, 'His hexes splash, and everything they touch takes extra damage for a while.'],
  ['skytotem', 'Sky Totem', 'horde', 'r', 'flyer', 4, 1, {aura:{r:3.2, haste:1}, hm:1.1, dm:.6}, 'A flying mask that drums. Your troops beneath it move and hit a third faster.'],
  ['gremlins', 'Gremlins', 'horde', 'c', 'flock', 2, 3, {hm:1.3, dm:1.1}, 'Three flying gremlins. A little tougher than the usual pests.'],
  ['gremking', 'Gremlin King', 'horde', 'r', 'flyer', 4, 1, {leech:.4, hm:1.05}, 'Flies straight for towers, and every hit on one steals Mana for you.'],
  ['bloodaxe', 'Bloodaxe', 'horde', 'c', 'bruiser', 4, 1, {berserk:1}, 'The closer he is to dropping, the faster the axe comes round.'],
  ['goliath', 'Goliath', 'horde', 'e', 'giant', 5, 1, {dm:1.26, hm:1.45, land:{r:2.6, dmg:180, stun:1.2}}, 'Lands hard enough to stun and hurt everything close, then walks at the nearest tower and ignores everything else.'],
  ['gronk', 'Gronk', 'horde', 'e', 'tank', 6, 1, {steal:.25, knock:1.2, hm:1.05, dm:1.2}, 'An ogre who eats what he hits. Every swing heals him and knocks the target back.'],
  ['ugg', 'Ugg', 'horde', 'c', 'brawler', 2, 1, {knock:.7}, 'Two Mana of caveman. Hits things. Things go backwards.'],
  ['fuse', 'Fuse', 'horde', 'r', 'killer', 3, 1, {only:'b', kamikaze:1, death:{dmg:520, r:2.2, delay:.15}, spd:2.5, hm:.8}, 'A goblin carrying a bomb bigger than he is. Runs straight at the nearest building, ignores everything else and goes off when he gets there.'],
  ['rattatat', 'Rattatat', 'horde', 'c', 'support', 2, 1, {aura:{r:3.4, haste:1}, rng:1, hm:1.6, hit:1.2}, 'A goblin with a drum. Everyone near him moves and hits a third faster. Protect the drummer.'],
  ['stubbeard', 'Stubbeard', 'horde', 'r', 'bruiser', 4, 1, {frenzy:4, raze:1.4, hm:1.05}, 'Short, loud and never calmer than after a kill: each one sends him into a rage for four seconds.'],
  ['howl', 'Howl', 'horde', 'c', 'brawler', 3, 1, {land:{r:3.2, rage:4}, dm:1.05}, 'Arrives with a war cry that sends every teammate close by into a rage for four seconds.'],
  ['furball', 'King Furball', 'horde', 'e', 'tank', 5, 1, {dm:1.2, spawn:{u:'orclings', every:5.5, n:2, first:2}, hm:.96}, 'Wide, loud and never alone. Two more goblins fall out of the coat every few seconds.'],
  ['shortbows', 'Shortbows', 'horde', 'c', 'archer', 3, 2, {shot:'arrow', pack:{r:3, per:.15, max:1}}, 'Two goblin archers. They hit ground and air, and they shoot better standing together.'],
  /* ----- Machine ----- */
  ['smokey', 'Old Smokey', 'tech', 'r', 'archer', 4, 1, {hm:2, rng:4, burn:{dps:22, t:3}, fireproof:1, dm:.8, r:.5, shot:'fire'}, 'A furnace on legs. Lobs hot coals from range, and takes a lot more punishment than anything else that does.'],
  ['rivet', 'Rivet', 'tech', 'c', 'support', 3, 1, {aura:{r:3.6, haste:1, bld:1}, heal:{amt:40, r:3.6, every:1, bld:1}, rng:1, dm:1.2, hit:1.2}, 'Overclocks your buildings: anything of yours near her fires and builds a third faster, and she patches it up while she is there.'],
  ['shrinkwell', 'Professor Shrinkwell', 'tech', 'e', 'sniper', 5, 1, {sap:4, mark:{t:4}, hm:1.2, shot:'laser'}, 'Shrink ray. Whatever he hits is cut down to size for four seconds: it deals less damage and takes more.'],
  ['gearheart', 'Gearheart', 'tech', 'r', 'brawler', 4, 1, {shield:220, recharge:{amt:220, every:7}, hm:.9}, 'A brass gentleman with a wind-up shield. Break it and it winds itself back up seven seconds later.'],
  ['nugget', 'Nugget', 'tech', 'r', 'brawler', 3, 1, {any:1, raze:1.6, hm:.9}, 'A miner. Tunnels up anywhere on the field and takes a pickaxe to the nearest building.'],
  ['ironbeard', 'Ironbeard', 'tech', 'r', 'support', 4, 1, {aura:{r:3.5, guard:1}, rng:1, hm:1.6, dm:1.5, hit:1.3}, 'The blacksmith. Everyone fighting near him takes a fifth less damage, and the hammer is not just for show.'],
  ['tinker', 'Tinker', 'tech', 'r', 'support', 4, 1, {heal:{amt:70, r:3.5, every:1, bld:1}, rng:1, dm:1.4, hit:1.2}, 'Repairs your towers and buildings while he stands near them. Swings a wrench at anything that objects.'],
  ['brassbolt', 'Brassbolt', 'tech', 'e', 'brawler', 5, 1, {armor:35, berserk:1, hm:1.15}, 'A brass diving suit with something angry inside. Small hits bounce off the plating, and the more damage he takes the faster he swings.'],
  ['scrapbot', 'Scrap Bot', 'tech', 'c', 'archer', 3, 1, {hm:1.5, hit:1.3, r:.45, shot:'laser'}, 'One sturdy robot with an arm cannon. Hits ground and air.'],
  ['shockbot', 'Shock Bot', 'tech', 'r', 'brawler', 4, 1, {stun:{every:3, t:.9}}, 'Every third punch carries enough current to stun.'],
  ['titan', 'Titan Mech', 'tech', 'e', 'sniper', 6, 1, {hm:1.8, hit:.35, rng:5.5, ramp:{step:.12, max:1.8}, dm:.8, r:.6, shot:'bullet'}, 'A minigun that spins up. The longer it stays on one target, the harder every round hits.'],
  ['clanker', 'Clanker', 'tech', 'e', 'giant', 5, 1, {dm:1.26, armor:40, hm:1.13, death:{dmg:240, r:2.4, delay:.6}}, 'A boiler on legs that only wants towers. Small hits bounce off, and it blows up when it breaks.'],
  ['starranger', 'Star Ranger', 'tech', 'c', 'archer', 3, 1, {hm:1.4, dm:1.05, rng:5.5, shot:'laser'}, 'One rifle, long range, ground or air.'],
  ['jetace', 'Jetpack Ace', 'tech', 'r', 'flyer', 4, 1, {rng:4.5, shot:'laser', dm:.9, hm:.8}, 'Flies and shoots from range, which is two things most troops cannot answer.'],
  ['sarge', 'Sarge', 'tech', 'c', 'archer', 3, 1, {hit:.45, hm:1.5, rng:4.5, shot:'bullet'}, 'Fires fast and does not stop. Chews through hordes.'],
  ['prepper', 'Prepper', 'tech', 'c', 'bruiser', 4, 1, {rng:2.2, splash:1, shield:260, dm:.75, shot:'bullet'}, 'A riot shield in front and a shotgun that hits everything in a short spread.'],
  ['funbear', 'Funhouse Bear', 'tech', 'c', 'brawler', 3, 1, {hm:1.05}, 'Used to play guitar at birthday parties. Now uses the guitar differently.'],
  ['afterhours', 'After Hours', 'tech', 'r', 'killer', 4, 1, {land:{r:2.8, stun:1.8}, hm:1.3}, 'The bear nobody switched off. It appears, everything near it freezes in fright, and then it gets to work.'],
  ['bjorn', 'Boomstick Bjorn', 'tech', 'e', 'sniper', 3, 1, {only:'b', rng:8.2, splash:1.3, hit:3.2, dm:.93, hm:1.67, spd:1, shot:'shell'}, 'A walking mortar. Ignores troops and lobs shells at towers and buildings from further away than they can shoot back. Helpless up close.'],
  ['redline', 'Redline', 'tech', 'e', 'tank', 5, 1, {knock:1.2, dm:1.5, hm:1.02, split:{u:'scraplet', n:2}}, 'A war machine with fists like wrecking balls. Every punch throws the target back, and two Scraplets climb out of the wreck when it goes down.'],
  /* ----- Break Room ----- */
  ['auditor', 'The Auditor', 'crew', 'e', 'bruiser', 5, 1, {rob:.3, aura:{r:3.2, slow:1}, hm:1.1, dm:.9}, 'From head office. Everything near him slows to a crawl while he goes through the books, and every hit takes Mana straight out of their pocket.'],
  ['finn', 'Field Trip Finn', 'crew', 'c', 'brawler', 2, 1, {raze:2, spd:1.9, hm:.9}, 'Two Mana of enthusiasm and a shovel. Digs through buildings and towers at double damage.'],
  ['lagspike', 'Lag Spike', 'crew', 'r', 'sniper', 4, 1, {chill:2, stun:{every:4, t:.9}, shot:'laser'}, 'Plays from the back with a headset on. His target stutters: slowed on every shot, frozen on the fourth.'],
  ['chef', 'Chef Sizzle', 'crew', 'r', 'bruiser', 4, 1, {burn:{dps:26, t:3}, stun:{every:3, t:.8}}, 'A hot pan and a short temper. Every hit burns, and every third one rings like a dinner bell.'],
  ['crusty', 'Crusty', 'crew', 'c', 'support', 3, 1, {land:{r:3, shield:160}, heal:{amt:22, r:3, every:1}, rng:1, dm:1.2, hit:1.2}, 'The baker. Arrives with fresh shields for everyone close by and keeps them topped up after.'],
  ['gert', 'Lunch Lady Gert', 'crew', 'r', 'caster', 4, 1, {chill:2.2, psn:{dps:14, t:3}, hm:1.3, shot:'spit'}, 'Mystery meat, served at range. It splashes, it slows, and it does not agree with anyone.'],
  ['ref', 'The Ref', 'crew', 'e', 'brawler', 3, 1, {dm:1.33, eject:{every:4}, land:{r:2.8, stun:1.2}, hm:1.47}, 'Blows the whistle when he lands and everything near stops. Every fourth hit is a red card: the target is sent back to its own king tower.'],
  ['manager', 'The Regional Manager', 'crew', 'l', 'tank', 5, 1, {aura:{r:3.8, haste:1, slow:1}, land:{r:2.5, summon:{u:'internA', n:2}}, hm:1, dm:1.44}, 'Arrives with two interns and a clipboard. Your side works a third faster while he is watching. Theirs slows right down.'],
  ['goldmask', 'Goldmask', 'crew', 'e', 'brawler', 4, 1, {dm:1.25, crit:{every:3, mul:2.5}, stun:{every:3, t:1}, hm:1.38}, 'Undefeated at the office party. Every third hit is a body slam: big damage and a stun.'],
  ['pizza', 'Pizza Pete', 'crew', 'c', 'support', 3, 1, {heal:{amt:36, r:3, every:1}, spd:2, rng:1, dm:1.2, hit:1.2}, 'Thirty minutes or less. Keeps up with any push and feeds everyone near him back to health.'],
  ['flint', 'Fire Warden Flint', 'crew', 'r', 'bruiser', 4, 1, {fireproof:1, raze:2, hm:1.1, dm:.9}, 'Cannot be set on fire, which is the job. His axe goes through buildings and towers at double damage.'],
  ['blitz', 'Blitz', 'crew', 'c', 'killer', 3, 1, {charge:{after:2.2, spd:1.6, dmg:2, dash:1, stun:1}, hm:1.3, dm:.8}, 'Arrives at a sprint. The tackle lands double and leaves the target seeing stars.'],
  ['hank', 'Officer Hank', 'crew', 'r', 'tank', 4, 1, {taunt:3.5, armor:20}, 'Building security. One blast on the whistle and every enemy nearby has to deal with him first. Small hits bounce off the vest.'],
  ['vending', 'The Vending Machine', 'crew', 'e', 'tank', 5, 1, {mana:{every:10, amt:1}, hm:.7, dm:.8, spd:.75}, 'It finally grew legs. One extra Mana every ten seconds for as long as it stays standing, and it body-checks anything in its way.'],
  ['janitor', 'The Night Janitor', 'crew', 'r', 'brawler', 4, 1, {chill:2, land:{r:2.4, stun:1.4, dmg:40}}, 'Mops the floor on his way in: everything near slips and is stunned. Whatever he hits after that slows right down.'],
  ['courier', 'Courier', 'crew', 'c', 'bruiser', 3, 1, {only:'b', hm:1.35, r:.42, spd:2.2, charge:{after:2.5, spd:1.5, dmg:1.8, dash:1}}, 'Arrives at a sprint and runs straight at the nearest building, ignoring everybody on the way. The first hit lands nearly double.'],
  ['trailboss', 'Trail Boss', 'crew', 'c', 'tank', 3, 1, {}, 'Carries everything he owns on his back. A cheap, patient wall.'],
  ['interns', 'The Interns', 'crew', 'c', 'swarm', 2, 2, {us:['internA', 'internB'], hm:1.5, dm:1.2}, 'Two interns. Unpaid, underprepared and somehow still more productive than BDB.'],
  ['captain', 'Captain Overtime', 'crew', 'e', 'flyer', 5, 1, {land:{r:2.4, dmg:220, push:1.2}, hm:1.15}, 'Lands like a meteor: heavy damage and everything thrown back. Then he flies around punching things.'],
  ['helpers', 'Seasonal Help', 'crew', 'c', 'archer', 2, 2, {hm:.9, dm:.8, rng:4, shot:'candy'}, 'Two temps who throw candy canes from range. Cheap, cheerful, gone by January.'],
  ['giggles', 'Giggles', 'crew', 'r', 'caster', 4, 1, {rng:4.2, splash:1.5, hm:1.3, death:{dmg:150, r:2, delay:1}, shot:'bomb'}, 'Throws bombs that splash wide. Drops one last bomb when he goes down.'],
  ['mascot', 'The Mascot', 'crew', 'r', 'giant', 5, 1, {}, 'Huge, slow and only interested in buildings. Protect him and towers fall.'],
  ['bdb', 'Five-Star BDB', 'crew', 'l', 'tank', 6, 1, {splash:1.7, dm:1.81, hm:1.26, rng:1, spd:1.2, r:.9, land:{r:2.6, dmg:140, push:1}}, 'The prospect himself. Huge health, a landing that clears space, and a slam that hits everything around him.'],
  /* ----- Gods: one to a deck, and each does something to the whole field ----- */
  ['thor', 'Thor, God of Thunder', 'order', 'g', 'bruiser', 7, 1, {smite:{dmg:400, stun:1.5, twr:.4}, chain:{n:4, r:3.4, fall:.85}, stun:{every:3, t:.8}, hm:1.55, dm:1.1, r:.7, spd:1.45}, 'He arrives and lightning hits every enemy on the field at once, wherever it stands, and stops it dead for a moment. After that his fists carry the storm: every blow jumps to four more.'],
  ['deathgod', 'Death', 'dark', 'g', 'bruiser', 7, 1, {reap:.25, land:{r:3.4, summon:{u:'skel', n:20}}, raise:{u:'skel', r:99, max:26, cd:.5}, splash:1.3, hm:1.05, dm:.75, r:.75, spd:1.15}, 'Arrives in a ring of twenty skeletons, and every enemy troop on the field loses a quarter of its health on the spot. From then on whatever dies, anywhere, on either side, gets up as one of his.'],
  ['zeus', 'Zeus, King of Olympus', 'arcane', 'g', 'sniper', 7, 1, {land:{r:99, shield:150, rage:5}, wrath:{every:6, first:2.5, dmg:300, r:1.5}, chain:{n:2, r:3, fall:.6}, hm:1.7, dm:.8, r:.6, shot:'zap'}, 'His arrival shields every troop you have, wherever it is, and sends them all into a rage. Every six seconds a bolt from the sky finds the biggest enemy on the field, and his own thunderbolts jump to two more.'],
  /* ----- Dragon ----- */
  ['infernus', 'Infernus', 'dragon', 'l', 'caster', 7, 1, {fly:1, hm:2.65, rng:3.4, splash:1.6, burn:{dps:40, t:3}, dm:1.1, r:.8, spd:1.4, land:{r:2.8, dmg:190, burn:1}, shot:'fire'}, 'The red dragon. Drops out of the sky in a ring of fire, then breathes across everything under him, ground or air, and leaves it all burning.'],
  ['jade', 'Jadefang', 'dragon', 'l', 'caster', 5, 1, {fly:1, hm:2.5, rng:3.5, splash:1.6, burn:{dps:35, t:3}, dm:1.1, r:.8, spd:1.5, land:{r:2.8, dmg:170, burn:1}, pyre:{dmg:120, r:2}, feast:.08, shot:'fire'}, 'The green dragon, and she never lands. Arrives in a ring of fire and breathes over everything under her. Whatever dies burning blows up, and every death nearby heals her.'],
  ['emberwing', 'Emberwing', 'dragon', 'c', 'flyer', 4, 1, {rng:3, splash:1.3, dm:.55, r:.6, spd:1.6, shot:'fire'}, 'Flies over the river and breathes splash fire on ground and air.'],
  ['elder', 'Elder Wyrm', 'dragon', 'e', 'flyer', 6, 1, {rng:3.5, splash:1.5, burn:{dps:35, t:3}, dm:.6, hm:1.15, r:.8, spd:1.4, shot:'fire'}, 'The biggest thing in the sky. A wide breath of fire, and everything it catches keeps burning.'],
  ['raptor', 'Raptor', 'dragon', 'c', 'bruiser', 3, 1, {spd:1.9, leap:{min:2.2, max:4.5, mul:1.5}, hm:.9}, 'Fast on its feet and faster in the air. Pounces from a long way out.'],
  ['kaiju', 'Kaiju Kid', 'dragon', 'r', 'bruiser', 4, 1, {splash:1.1, dm:.8, grow:{per:.1, max:8}}, 'Hits everything around it, and gets stronger with every kill. Leave it alone and it becomes a problem.'],
  ['kobolds', 'Ember Kobolds', 'dragon', 'c', 'swarm', 3, 3, {burn:{dps:14, t:3}, hm:1.3, dm:.75}, 'Three little dragon-kin with matches. Whatever they bite keeps burning.'],
  ['sirscorch', 'Sir Scorch', 'dragon', 'e', 'bruiser', 4, 1, {hm:1.25, splash:1.1, dm:.81, burn:{dps:26, t:3}, armor:20}, 'A dragon in knight’s armour. Small hits glance off, and his burning blade catches everyone around the target.'],
  ['shiver', 'Shiver', 'dragon', 'e', 'caster', 5, 1, {fly:1, hm:2, rng:3.2, splash:1.4, chill:2.2, brittle:2, dm:.6, r:.6, spd:1.45, shot:'ice'}, 'An ice drake on the wing. Breathes frost over everything under him, ground or air, and anything already slowed or frozen takes double.'],
  ['scald', 'Scald', 'dragon', 'r', 'bruiser', 4, 1, {fireproof:1, burn:{dps:24, t:3}, regen:.025}, 'A fire salamander. Grows back whatever you cut off, cannot be burned, and leaves everything he hits alight.'],
  ['razorback', 'Razorback', 'dragon', 'c', 'bruiser', 3, 1, {thorns:.3, hm:1.05}, 'A lizard with spikes where it counts. Nearly a third of every punch thrown at him comes back.'],
  ['kai', 'Kai, Dragon Disciple', 'dragon', 'r', 'brawler', 3, 1, {leap:{min:2, max:4.5, mul:1.8}, crit:{every:3, mul:1.8}, hit:.9}, 'Opens with a flying kick, and every third hit after that lands nearly double.'],
  ['spikeback', 'Spikeback', 'dragon', 'r', 'tank', 4, 1, {thorns:.35, tough:{at:.5, cut:.5}}, 'Hurts to hit, and below half health he pulls into his shell and takes half damage.'],
  ['plum', 'Plum', 'dragon', 'c', 'archer', 3, 1, {fly:1, psn:{dps:22, t:4}, hm:1.05, shot:'spit'}, 'A small purple dragon who has not learned fire yet. Flies anyway, and spits venom at ground and air.'],
  /* ----- buildings ----- */
  ['cannon', 'Cannon', 'order', 'c', 'build', 3, 1, {dm:1.15, life:30, air:0, shot:'ball'}, 'A defence you can put down anywhere on your side. Fires at ground troops and pulls giants toward it.'],
  ['watchtower', 'Watchtower', 'order', 'r', 'build', 4, 1, {rng:6.5, hm:1.15, dm:.8, life:34, air:1, shot:'arrow'}, 'A guard tower with a long reach. Shoots ground and air.'],
  ['manawell', 'Mana Well', 'arcane', 'r', 'build', 5, 1, {nodmg:1, life:56, mana:{every:7, amt:1}}, 'A Mana farm. One extra Mana every seven seconds until it runs dry. They will come for it.'],
  ['crypt', 'Crypt', 'dark', 'r', 'build', 5, 1, {nodmg:1, hm:.85, life:36, spawn:{u:'skel', every:4, n:2, first:1}}, 'A building that keeps sending out skeletons, two at a time.'],
  ['flamespire', 'Flame Spire', 'fire', 'e', 'build', 4, 1, {hm:1.25, rng:5, air:1, ramp:{step:.35, max:6}, hit:.4, dm:.44, life:32, shot:'beam'}, 'A beam that starts as a tickle and ends as a blowtorch. The answer to anything huge.'],
  ['stormcoil', 'Storm Coil', 'arcane', 'e', 'build', 4, 1, {rng:4.5, air:1, chain:{n:3, r:2.8, fall:.7}, stun:{every:3, t:.5}, life:30, hit:1.6, dm:1.1, shot:'zap'}, 'Zaps one target and the bolt jumps to three more. Every third zap stuns.'],
  ['barricade', 'Barricade', 'order', 'c', 'build', 2, 1, {nodmg:1, hm:3.2, life:40}, 'Two Mana of wall. It does nothing except stand in the way, and giants cannot walk past it.'],
  ['shrine', 'Healing Shrine', 'nature', 'r', 'build', 4, 1, {nodmg:1, hm:.9, life:36, heal:{amt:45, r:3.5, every:1}}, 'Heals every teammate standing near it. Park a fight on top of it.'],
  ['wardrum', 'War Drum', 'horde', 'r', 'build', 4, 1, {nodmg:1, hm:.9, life:36, aura:{r:4, haste:1}}, 'While it beats, your troops near it move and hit a third faster.'],
  ['nest', 'Dragon Nest', 'dragon', 'e', 'build', 5, 1, {nodmg:1, hm:1.44, life:40, spawn:{u:'whelp', every:6.5, n:1, first:1.5}}, 'Hatches a flying Whelp every few seconds.'],
  /* ----- units that only arrive through another card ----- */
  ['skel', 'Skeleton', 'dark', 'c', 'swarm', 0, 1, {as:.5}, ''],
  ['gbat', 'Gloom Bat', 'dark', 'c', 'flock', 0, 1, {as:.5}, ''],
  ['slimelet', 'Slimelet', 'nature', 'c', 'brawler', 0, 1, {as:.6, r:.38, spd:1.5, hit:1.1, dm:1.4}, ''],
  ['mushnub', 'Mushnub', 'nature', 'c', 'swarm', 0, 1, {as:.5, psn:{dps:10, t:3}}, ''],
  ['bee', 'Bee', 'nature', 'c', 'flock', 0, 1, {as:.5, psn:{dps:8, t:3}}, ''],
  ['whelp', 'Whelp', 'dragon', 'c', 'flyer', 0, 1, {as:1.4, rng:2.5, splash:.9, dm:.6, r:.4, shot:'fire'}, ''],
  ['internA', 'Intern', 'crew', 'c', 'swarm', 0, 1, {as:1, hm:1.4}, ''],
  ['internB', 'Intern', 'crew', 'c', 'swarm', 0, 1, {as:1, hm:1.4}, ''],
  ['kguard', 'Royal Guard', 'order', 'c', 'brawler', 0, 1, {as:1.6, shield:120}, ''],
  ['scraplet', 'Scraplet', 'tech', 'c', 'archer', 0, 1, {as:1.3, hm:1.4, r:.36, shot:'laser'}, ''],
  ['kitshade', 'Illusion', 'shadow', 'c', 'killer', 0, 1, {as:2.2, hm:.05, spd:2, dodge:.2}, ''],
  ['shambler', 'Shambler', 'dark', 'c', 'brawler', 0, 1, {as:1.1, spd:1.1}, ''],
  ['mouseling', 'Mouseling', 'beast', 'c', 'swarm', 0, 1, {as:.6, spd:2.2}, ''],
  ['mudling', 'Mudling', 'nature', 'c', 'brawler', 0, 1, {as:1.4, regen:.02}, '']
];
const ABIL = ['shield', 'heal', 'land', 'taunt', 'stun', 'charge', 'knock', 'pack', 'leech', 'stealth', 'any', 'dodge', 'crit', 'revive', 'spawn', 'raise', 'mark', 'steal', 'grow', 'chill', 'split', 'armor', 'burn', 'psn', 'berserk', 'aura',
  'death', 'regen', 'numb', 'leap', 'thorns', 'chain', 'morph', 'exec', 'mana', 'ramp', 'only', 'life', 'shot', 'splash', 'first', 'curse', 'loot', 'rise', 'pierce', 'brittle', 'riposte',
  'stoic', 'deflect', 'rob', 'infect', 'sap', 'wild', 'mirror', 'siphon', 'fireproof', 'sear', 'pyre', 'shatter', 'mend', 'brew', 'bless', 'feast', 'kamikaze', 'frenzy', 'recharge', 'eject', 'raze', 'tough', 'lock',
  'smite', 'reap', 'wrath'];

/* Units. Speeds are arena units per second, hit is seconds between attacks, rng is reach beyond the bodies.
   air: can hit flyers. only:'b': walks past troops and only hits buildings. splash: hit radius. */
export const UNITS = {};
const BASE = {};
for (const [key, name, type, rar, role, cost, n, x, desc] of ROSTER){
  const R = ROLE[role], k = cost || x.as, cnt = n || 1, hit = x.hit || R[2];
  const U = {name, role, type, hp:Math.max(5, Math.round(R[0] * k / cnt * (x.hm || 1) / 5) * 5), dmg:x.nodmg ? 0 : Math.max(1, Math.round(R[1] * k / cnt * hit * (x.dm || 1))), hit, rng:x.rng ?? R[3], spd:x.spd ?? R[4], r:x.r ?? R[5]};
  if (role === 'flyer' || role === 'flock' || x.fly) U.fly = 1;
  if (U.fly || U.rng > 1.5) U.air = 1;
  if (x.air != null){ if (x.air) U.air = 1; else delete U.air; }
  if (role === 'caster' && x.splash == null) U.splash = 1.3;
  if (role === 'giant') U.only = 'b';
  if (role === 'build') U.bld = 1;
  if (U.rng > 1.5 && !x.shot) U.shot = 'ball';
  for (const a of ABIL) if (x[a] != null && x[a] !== 0) U[a] = x[a];
  UNITS[key] = U;
  if (cost) BASE[key] = {name, cost, tier:rar, type, u:x.u || key, us:x.us || null, n:cnt, desc};
}
for (const k of ['bonecrew', 'gloombats', 'mushnubs', 'bees']) delete UNITS[k];          // those cards drop the shared small unit, not one of their own
delete UNITS.interns;
UNITS.princess = {name:'Guard Tower', role:'build', type:'order', hp:1500, dmg:55, hit:.8, rng:7.5, spd:0, r:1.15, bld:1, air:1, shot:'ball', twr:1};
UNITS.king     = {name:'King Tower',  role:'build', type:'order', hp:2600, dmg:60, hit:1.0, rng:7,  spd:0, r:1.5,  bld:1, air:1, shot:'ball', twr:1};

/* Spells and traps: [key, name, type, rarity, Mana, spell or trap, description] */
const MAGIC = [
  ['arrows',    'Arrow Storm',     'order',  'c', 3, {spell:{kind:'rain',   r:3.6, dmg:150, twr:.35, delay:.9}}, 'A wide shower of arrows. Clears hordes anywhere on the map.'],
  ['zap',       'Zap',             'arcane', 'c', 2, {spell:{kind:'zap',    r:2.4, dmg:110, twr:.35, delay:.15, stun:.6}}, 'Instant. A little damage and a short stun for everything in the circle.'],
  ['quake',     'Earthquake',      'nature', 'c', 3, {spell:{kind:'quake',  r:3.6, dmg:95, twr:1.5, bld:3.2, slow:3, delay:.5, ground:1}}, 'Shakes the ground. Light damage to troops on foot, heavy damage to buildings and towers, and everything slows.'],
  ['fireball',  'Fireball',        'fire',   'r', 4, {spell:{kind:'bomb',   r:2.4, dmg:380, twr:.35, delay:1, knock:.8}}, 'Big damage in a small circle, and whatever survives is knocked back.'],
  ['rage',      'War Cry',         'horde',  'r', 2, {spell:{kind:'rage',   r:4, rage:7, delay:.3}}, 'Your troops in the circle move and hit a third faster for a few seconds.'],
  ['poison',    'Plague Cloud',    'dark',   'r', 4, {spell:{kind:'poison', r:3.4, dmg:75, twr:.35, delay:.5, dur:8, slow:1}}, 'A cloud that hangs around. Everything standing in it is slowed and keeps taking damage.'],
  ['heal',      'Second Wind',     'nature', 'r', 3, {spell:{kind:'heal',   r:3.4, heal:110, delay:.3, dur:5}}, 'Heals your troops in the circle every second for five seconds.'],
  ['ward',      'Tower Shield',    'order',  'r', 3, {spell:{kind:'ward',   r:3.4, shield:700, delay:.2, dur:12}}, 'Puts a shield over your towers, buildings and troops in the circle. It soaks up a fireball and then some.'],
  ['freeze',    'Deep Freeze',     'frost',  'e', 3, {spell:{kind:'freeze', r:3, dmg:60, twr:.35, freeze:4, delay:.35}}, 'Everything in the circle stops for a few seconds. Towers too.'],
  ['lightning', 'Lightning Storm', 'arcane', 'e', 4, {spell:{kind:'bolt',   r:3.4, dmg:520, twr:.35, delay:.5, n:3, stun:.5}}, 'Three bolts strike the three toughest things in the circle. Huge damage and a short stun.'],
  ['tornado',   'Twister',         'arcane', 'e', 2, {spell:{kind:'tornado', r:4, dmg:45, twr:0, delay:.3, dur:3}}, 'Drags every enemy troop in the circle into the middle and holds them there. Line them up for something worse.'],
  ['meteor',    'Meteor',          'fire',   'e', 5, {spell:{kind:'meteor', r:3.2, dmg:640, twr:.5, delay:2.2, knock:1.2, pool:{dps:60, t:4}}}, 'Slow to arrive and impossible to ignore. Massive damage in a wide circle, and the ground keeps burning.'],
  ['graveyard', 'Graveyard',       'dark',   'l', 4, {spell:{kind:'grave',  r:3.6, delay:.6, dur:9, every:.5, u:'skel'}}, 'Skeletons climb out of the ground anywhere on the map, one after another, for nine seconds.'],
  /* traps: set face down on your own half, unseen by the other side, and sprung by the first enemy on foot to walk over them */
  ['wetfloor',  'Wet Floor Sign',    'shadow', 'c', 2, {trap:{kind:'slip',    r:2.4, dmg:80, stun:2.6}},  'A hidden trap. The first enemy on foot to step on it sends everyone nearby sliding: stunned, with a little damage.'],
  ['screen',    'Hard Screen',       'shadow', 'r', 3, {trap:{kind:'snap',    r:1.8, dmg:420}},           'A hidden trap. The first enemy on foot to run into it gets flattened, along with everyone right beside them.'],
  ['techfoul',  'Technical Foul',    'shadow', 'r', 2, {trap:{kind:'counter', r:3.2, burn:2}},            'A hidden trap. It cancels the next enemy spell that lands near it, and whoever cast it loses Mana on top.'],
  ['replay',    'Instant Replay',    'shadow', 'e', 3, {trap:{kind:'mirror',  r:3, dur:6, refl:.6}},       'A hidden trap. Once it is sprung, enemies standing in the circle take back most of the damage they deal.'],
  ['benched',   'Back to the Bench', 'shadow', 'e', 4, {trap:{kind:'bounce',  r:1.2, dmg:100, stun:1.5}}, 'A hidden trap. Whoever springs it is sent straight back to their own king tower, where they land hard and dazed.']
];
for (const [key, name, type, rar, cost, x, desc] of MAGIC) BASE[key] = {name, cost, tier:rar, type, desc, ...x};

/* A build means something different on a spell or a trap than it does on a troop, so those say so. */
const SPELL_NOTE = {
  ice:'Frozen: also slows everything it hits.', fire:'Blazing: also sets what it hits on fire.', gold:'Golden: stronger and lands sooner. Costs 1 more Mana.', quick:'Turbo: lands much sooner.',
  iron:'Iron: hits towers and buildings harder, or lasts longer.', vamp:'Vampire: also heals your troops in the circle.', tox:'Toxic: lingers, and hits a second time a moment later.', giant:'Giant: a much wider circle. Costs 2 more Mana.'
};
const TRAP_NOTE = {
  ice:'Frozen: everything it catches is slowed as well.', fire:'Blazing: hits harder.', gold:'Golden: stronger, and armed sooner. Costs 1 more Mana.', quick:'Turbo: armed almost at once.',
  iron:'Iron: stays set much longer.', vamp:'Vampire: heals your weakest tower when it springs.', tox:'Toxic: bursts for extra damage when it springs.', giant:'Giant: a much wider trap. Costs 2 more Mana.'
};
/* which prop stands for each kind of trap on the field */
export const TRAP_ART = {slip:'wetfloor', snap:'screen', mirror:'replay', bounce:'benched', counter:'techfoul'};

/* One stat block per character + build, made on first use. */
const UV = new Map();
const scale = (o, f, keys) => { const c = {...o}; for (const k of keys) if (c[k]) c[k] = Math.round(c[k] * f); return c; };
export function unitVar(key, aff = 'std'){
  const k = key + '|' + aff; let U = UV.get(k);
  if (U) return U;
  const b = UNITS[key], a = AFF[aff] || AFF.std;
  U = {...b, key, aff:AFF[aff] ? aff : 'std', hp:Math.round(b.hp * a.hp), dmg:Math.round(b.dmg * a.dmg), spd:b.spd * a.spd, hit:+(b.hit * (a.haste || 1)).toFixed(2),
    r:b.r * (1 + (a.size - 1) * .6), size:a.size, chill:Math.max(b.chill || 0, a.chill || 0), steal:Math.max(b.steal || 0, a.steal || 0)};
  if (b.death) U.death = scale(b.death, a.dmg, ['dmg']);
  else if (a.toxic && !b.twr) U.death = {dmg:Math.round(U.dmg * .9) + 40, r:1.5 + b.r * .5};
  if (b.land) U.land = scale(b.land, a.dmg, ['dmg']);
  if (b.rise) U.rise = scale(b.rise, a.dmg, ['dmg', 'burn']);
  if (b.burn) U.burn = scale(b.burn, a.dmg, ['dps']);
  else if (a.burn && b.dmg && !b.twr) U.burn = {dps:Math.max(6, Math.round(b.dmg / b.hit * a.burn)), t:3};
  if (b.psn) U.psn = scale(b.psn, a.dmg, ['dps']);
  if (b.shield) U.shield = Math.round(b.shield * a.hp);
  UV.set(k, U); return U;
}

export const priceOf = (rar, cost, aff = 'std') => Math.round((RAR[rar].base + RAR[rar].per * cost) * (AFF[aff] || AFF.std).pm / 5) * 5;
export const CARDS = {};
for (const b in BASE) for (const a of AFF_IDS){
  const B = BASE[b], A = AFF[a], id = `${b}-${a}`;
  const c = {id, base:b, aff:a, rar:B.tier, type:B.type, name:(A.name ? A.name + ' ' : '') + B.name, baseName:B.name, cost:clamp(B.cost + A.cost, 1, 10), desc:B.desc, note:A.note, price:priceOf(B.tier, B.cost, a)};
  if (B.spell){
    const s = B.spell, big = 1 + (A.size - 1) * .8, long = A.hp >= 1.3 ? 1.4 : 1;
    c.kind = 'spell'; c.art = b; c.note = SPELL_NOTE[a] ?? A.note;
    c.spell = {...s, r:+(s.r * big).toFixed(2), dmg:Math.round((s.dmg || 0) * A.dmg), twr:(s.twr ?? 1) * (A.hp >= 1.3 && !s.dur ? 1.5 : 1), delay:+(s.delay * (A.spd > 1.2 ? .6 : A.spd > 1.05 ? .8 : 1)).toFixed(2),
      freeze:s.freeze ? +(s.freeze * (a === 'ice' ? 1.35 : 1)).toFixed(1) : 0, rage:s.rage ? +(s.rage * A.hp).toFixed(1) : 0, dur:s.dur ? +(s.dur * long).toFixed(1) : 0, heal:s.heal ? Math.round(s.heal * A.dmg) : 0, shield:s.shield ? Math.round(s.shield * A.hp) : 0,
      chill:A.chill || 0, steal:A.steal || 0, again:A.toxic && s.dmg && !s.dur ? .4 : 0, burn:A.burn && s.dmg ? Math.round(s.dmg * .08) : 0};
  } else if (B.trap){
    const t = B.trap, pow = A.dmg, hold = .7 + .3 * A.hp;                   // pow: how hard it hits. hold: how long it keeps them.
    c.kind = 'trap'; c.art = b; c.note = TRAP_NOTE[a] ?? A.note;
    c.trap = {kind:t.kind, r:+(t.r * (1 + (A.size - 1) * .8) * (t.kind === 'counter' ? .85 + .15 * pow : 1)).toFixed(2), dmg:Math.round((t.dmg || 0) * pow),
      stun:t.stun ? +(t.stun * hold * (t.kind === 'bounce' ? .6 + .4 * pow : 1)).toFixed(1) : 0, dur:t.dur ? +(t.dur * hold).toFixed(1) : 0, refl:t.refl ? Math.min(1, +(t.refl * A.dmg).toFixed(2)) : 0,
      arm:a === 'quick' ? .35 : a === 'gold' ? .6 : 1, life:A.hp >= 1.3 ? 150 : 90, chill:A.chill ? 2.5 : 0, heal:A.steal ? 160 : 0, burst:A.toxic ? 110 : 0, burn:t.burn ? t.burn + (a === 'gold' || a === 'giant' ? 1 : 0) : 0};
  } else { c.u = B.u; c.us = B.us; c.n = B.n; c.U = unitVar(B.us ? B.us[0] : B.u, a); c.art = B.us ? B.us[0] : B.u; c.kind = c.U.bld ? 'build' : 'unit'; }
  CARDS[id] = c;
}
export const CARD_IDS = Object.keys(CARDS), BASE_IDS = Object.keys(BASE);
export const baseName = b => BASE[b].name;
export const baseOf = b => BASE[b];
/* every unit a set of cards can put on the field, including what those units spawn, split into, raise or turn into */
export function unitsOf(ids){
  const out = new Set(['princess', 'king']), add = k => { if (!k || out.has(k) || !UNITS[k]) return; out.add(k); const U = UNITS[k]; add(U.spawn && U.spawn.u); add(U.split && U.split.u); add(U.raise && U.raise.u); add(U.morph && U.morph.u); add(U.land && U.land.summon && U.land.summon.u); add(U.infect && U.infect.u); };
  for (const id of ids){ const c = CARDS[id]; if (!c) continue; if (c.us) c.us.forEach(add); else if (c.u) add(c.u); else if (c.spell && c.spell.u) add(c.spell.u); }
  return [...out];
}

export const DECK_SIZE = 15, HAND = 5, MAX_LEGEND = 3, MAX_GOD = 1, DECK_SLOTS = 3, START_COINS = 1500;
/* the Rares a new player picks one of for free: the characters made for this game */
export const FREE_RARES = ['bell', 'hoot', 'glacius', 'gorak', 'vesper', 'janitor'];
/* what a brand-new account holds before they have built a deck of their own, and the quick picks in the deck builder */
export const STARTER_DECKS = [
  {id:'balanced', name:'A bit of everything', blurb:'Solid troops, two spells, a cannon and a trap. The easiest deck to learn on.', hero:'bell',
    bases:'bonecrew scarlet longshots orclings gloombats arrows mohawk cannon hogwild vex plum yeti wetfloor pizza'},
  {id:'swarm', name:'Bury them in bodies', blurb:'Cheap, fast and everywhere. Never stop summoning.', hero:'gorak',
    bases:'bonecrew orclings gloombats shortbows piranhas cluckers rattatat pigeons raider howl zap arrows ugg bees'},
  {id:'heavy', name:'One giant push', blurb:'Slow, huge and hard to stop. Save up, then send everything at once.', hero:'glacius',
    bases:'trailboss ironclad yeti frosty mauler bloodaxe longshots hexa bonecrew arrows quake cannon barricade brother'},
  {id:'air', name:'Over their heads', blurb:'Flyers and spells. Go over the defence, then shut it down.', hero:'hoot',
    bases:'emberwing lostsoul gloombats imps pigeons sentinel hexsprite gremlins longshots wizlings arrows zap scarlet bonecrew'},
  {id:'sneak', name:'Tricks and traps', blurb:'A hidden trap, fast hitters and a hero nobody sees coming.', hero:'vesper',
    bases:'nightbolt wetfloor viper bandit bonecrew raider blitz sarge starranger zap arrows cannon thumper frostbeak'},
  {id:'crew', name:'The night shift', blurb:'The break room regulars, and a janitor who makes everyone slip.', hero:'janitor',
    bases:'interns helpers courier trailboss finn crusty pizza blitz cluckers arrows zap cannon wetfloor hexa'}
].map(d => ({...d, deck:d.bases.split(' ').concat(d.hero).map(b => b + '-std')}));
export const STARTERS = STARTER_DECKS[0].deck;
export const upgradeCost = (id, lvl) => Math.max(30, Math.round(CARDS[id].price * .22 * lvl / 10) * 10);

export function deckProblem(ids, strict = true){
  if (!Array.isArray(ids) || ids.length !== DECK_SIZE || ids.some(i => !i)) return `A deck needs ${DECK_SIZE} cards.`;
  if (ids.some(i => !CARDS[i])) return 'Unknown card.';
  if (new Set(ids.map(i => CARDS[i].base)).size !== ids.length) return 'Only one version of each character per deck.';
  if (strict && ids.filter(i => CARDS[i].rar === 'l').length > MAX_LEGEND) return `No more than ${MAX_LEGEND} Legendary cards per deck.`;
  if (ids.filter(i => CARDS[i].rar === 'g').length > MAX_GOD) return 'Only one God to a deck.';
  if (strict && !ids.some(i => CARDS[i].kind === 'unit')) return 'A deck needs at least one troop.';
  return null;
}

/* Maps. bridges: where ground troops can cross the river (centre x and width). river:false is an open field.
   rw: how far the river reaches either side of the halfway line (1 unless it says). The ten after the first five are painted floors (maps/<id>.webp):
   their rivers and bridges are where the painting has them. */
export const MAPS = {
  field:   {name:'Staff Picnic Field', river:true, bridges:[{x:-5.5, w:2.6}, {x:5.5, w:2.6}],          blurb:'Grass, a river and two bridges.'},
  court:   {name:'Centre Court',  river:true,  bridges:[{x:-5.5, w:2.6}, {x:5.5, w:2.6}],             blurb:'Two bridges. The classic.'},
  casino:  {name:'Casino Floor',  river:true,  bridges:[{x:-6.4, w:2.2}, {x:0, w:2.2}, {x:6.4, w:2.2}], blurb:'Three narrow bridges. Watch the middle.'},
  breakrm: {name:'Break Room',    river:true,  bridges:[{x:0, w:6}],                                  blurb:'One wide crossing. Everything meets in the middle.'},
  lot:     {name:'Parking Lot',   river:false, bridges:[],                                            blurb:'No river. Troops walk straight at you.'},
  ruins:   {name:'Mossy Ruins',    river:true, rw:2.03, bridges:[{x:-6.49, w:2.19}, {x:6.49, w:2.19}], blurb:'Stone heads in the jungle, and a slow green river that is wider than it looks.'},
  glacier: {name:'Frostcrack',     river:true, rw:1.27, bridges:[{x:-6.65, w:1.89}, {x:6.65, w:1.89}], blurb:'A split in the ice. Two short bridges.'},
  citadel: {name:'Cloud Citadel',  river:true, rw:1.4, bridges:[{x:-6.07, w:2.18}, {x:6.07, w:2.18}], blurb:'A castle yard in the sky. Two bridges and a long way down.'},
  yard:    {name:'Lantern Yard',   river:true, rw:1.41, bridges:[{x:-6.86, w:2.68}, {x:6.86, w:2.68}], blurb:'A graveyard after dark. Two broad stone bridges, set wide.'},
  temple:  {name:'Ember Temple',   river:true, rw:1.1, bridges:[{x:-7.88, w:1.66}, {x:7.88, w:1.66}], blurb:'Lava through the temple floor. Both bridges hug the walls.'},
  keep:    {name:'Winter Keep',    river:true, rw:1.39, bridges:[{x:-5.45, w:1.68}, {x:5.45, w:1.68}], blurb:'A frozen moat and two narrow bridges, straight up from your guard towers.'},
  hollow:  {name:'The Hollow',     river:true, rw:1.46, bridges:[{x:-6.46, w:2.14}, {x:6.46, w:2.14}], blurb:'Something green glows in the crack. Two bridges over it.'},
  foundry: {name:'The Foundry',    river:true, rw:1.05, bridges:[{x:-6.23, w:2.19}, {x:6.23, w:2.19}], blurb:'An iron floor and a thin river of fire. Easy to shoot across.'},
  cinder:  {name:'Cinder Keep',    river:true, rw:1.68, bridges:[{x:-6.69, w:2.85}, {x:6.69, w:2.85}], blurb:'A lot of lava, and the widest bridges there are.'},
  heavens: {name:'Marble Heavens', river:true, rw:1.3, bridges:[{x:-7.02, w:1.57}, {x:7.02, w:1.57}], blurb:'White stone above the clouds. The bridges are one troop wide.'}
};
export const MAP_IDS = Object.keys(MAPS);

/* ---------- drawing cards: packs, crates and CPU decks ---------- */
export function weightedPick(ids, weightOf, rnd = Math.random){
  let sum = 0; for (const i of ids) sum += weightOf(i);
  let k = rnd() * sum;
  for (const i of ids){ k -= weightOf(i); if (k <= 0) return i; }
  return ids[ids.length - 1];
}
const BY = {}; for (const b of BASE_IDS){ const B = BASE[b]; (BY[B.tier] = BY[B.tier] || []).push(b); (BY[B.tier + B.type] = BY[B.tier + B.type] || []).push(b); }
export const rollBuild = (rnd = Math.random) => weightedPick(AFF_IDS, a => AFF[a].w, rnd);
/* one card of this rarity (or the nearest rarity that type has), in a random build */
export function rollCard(rar, type, rnd = Math.random){
  let pool = null; const i0 = RAR_IDS.indexOf(rar);
  for (const d of [0, -1, 1, -2, 2, -3, 3, -4, 4]){ const r = RAR_IDS[i0 + d]; if (r && (pool = type ? BY[r + type] : BY[r]) && pool.length) break; pool = null; }
  if (!pool) pool = BASE_IDS;
  return pool[Math.floor(rnd() * pool.length)] + '-' + rollBuild(rnd);
}
/* Packs: the dearer the pack, the more cards and the better the odds. min: the rarity the last card is guaranteed to reach. */
export const PACKS = [
  {id:'bronze',  name:'Bronze Pack',  price:150,  n:3, odds:{c:86, r:13, e:1,  l:0, g:0},   min:null, col:'#c98a4b', blurb:'Three cards. Mostly Commons, now and then a surprise.'},
  {id:'silver',  name:'Silver Pack',  price:450,  n:4, odds:{c:68, r:27, e:4.5, l:.5, g:0}, min:'r',  col:'#c5cede', blurb:'Four cards. One Rare or better, guaranteed.'},
  {id:'gold',    name:'Gold Pack',    price:1200, n:5, odds:{c:48, r:37, e:13, l:2, g:0},   min:'e',  col:'#ffd23f', blurb:'Five cards. One Epic or better, guaranteed.'},
  {id:'diamond', name:'Diamond Pack', price:3000, n:6, odds:{c:26, r:42, e:25, l:7, g:.2},   min:'e',  two:'e', col:'#7fe3ff', blurb:'Six cards. Two Epics or better, guaranteed.'},
  {id:'mythic',  name:'Mythic Pack',  price:7500, n:8, odds:{c:8,  r:40, e:38, l:13, g:1},  min:'l',  two:'e', col:'#ff5fd2', blurb:'Eight cards. A Legendary, guaranteed, and an Epic to go with it.'},
  {id:'divine',  name:'Divine Pack',  price:30000, n:5, odds:{c:0, r:12, e:46, l:40, g:2},  min:'g',  two:'l', col:'#dff4ff', blurb:'Five cards. A God, guaranteed, with a Legendary beside it.'}
];
export const TYPE_PACK = {price:700, n:4, odds:{c:55, r:33, e:10, l:2, g:0}, min:'r'};      // four cards, all one type, one Rare or better
export function openPack(pack, type = null, rnd = Math.random){
  const out = [], up = (r, m) => m && RAR_IDS.indexOf(r) < RAR_IDS.indexOf(m) ? m : r;
  for (let i = 0; i < pack.n; i++){
    let r = weightedPick(RAR_IDS, k => pack.odds[k], rnd);
    if (i === pack.n - 1) r = up(r, pack.min); else if (i === pack.n - 2) r = up(r, pack.two);
    let id = rollCard(r, type, rnd), tries = 0;
    while (out.some(o => CARDS[o].base === CARDS[id].base) && tries++ < 8) id = rollCard(r, type, rnd);      // no two of one character in a pack
    out.push(id);
  }
  return out.sort((a, b) => RAR_IDS.indexOf(CARDS[a].rar) - RAR_IDS.indexOf(CARDS[b].rar));
}
export function crateRoll(rnd = Math.random){ return rollCard(weightedPick(RAR_IDS, r => RAR[r].w, rnd), null, rnd); }
export const DRAW_W = {c:50, r:30, e:15, l:5, g:1};

/* ---------- ready-made decks to buy, by theme ---------- */
const TD = (id, name, type, blurb, bases) => ({id, name, type, blurb, deck:bases.split(' ').map(b => b.includes('-') ? b : b + '-std')});
export const THEME_DECKS = [
  TD('dragon1', 'Dragon\u2019s Hoard', 'dragon', 'All ten dragons in one deck, the red one included, with a nest to hatch more. The full Dragon bonus.', 'jade emberwing elder infernus raptor kaiju nest kobolds sirscorch shiver fireball imps arrows longshots zap'),
  TD('dragon2', 'Wings and Teeth', 'dragon', 'Fast dragons up front, flyers overhead, nothing that waits around.', 'raptor emberwing kaiju jade gloombats lostsoul piranhas orclings courier zap arrows rage nest thumper sentinel'),
  TD('fire1', 'Inferno', 'fire', 'Everything burns. A phoenix that will not stay dead, a djinn, a lava giant, Fireball and Meteor.', 'hellion imps cinder magmaw phoenix ashjaw azar fireball meteor flamespire bonecrew orclings zap arrows longshots'),
  TD('fire2', 'Scorched Earth', 'fire', 'Blazing builds of the cheap stuff. Set the whole lane on fire and walk through it.', 'imps cinder hellion fireball bonecrew-fire orclings-fire mushnubs-fire raider-fire longshots-fire gloombats-fire flamespire zap ugg emberwing bloodaxe-fire'),
  TD('frost1', 'Whiteout', 'frost', 'Slow everything, freeze what is left, and let the ice drake shatter it.', 'glacius permafrost yeti frostbeak tundra freeze rimeguard neve shiver orclings-ice gloombats-ice raider-ice arrows longshots zap'),
  TD('frost2', 'Cold Shoulder', 'frost', 'A defensive wall of ice that wins late.', 'glacius tundra yeti frostbeak freeze trailboss barricade cannon watchtower longshots nightbolt arrows ward permafrost ironclad-ice'),
  TD('wizard1', 'Wizard Tower', 'arcane', 'Lightning that jumps, a Mana Well to pay for it, and a spell for every problem.', 'zephyr hexa tonic wizlings stalker mindsquid hexsprite manawell lightning zap tornado stormcoil hoot geode arrows'),
  TD('wizard2', 'Spellbook', 'arcane', 'More spells than troops. Control the field and let the storm do the work.', 'zephyr archon hexa wizlings lightning zap tornado freeze fireball arrows manawell stormcoil sentinel hexsprite mindsquid'),
  TD('dark1', 'Dark Arts', 'dark', 'Raise the dead, curse the living. The longer the fight, the bigger your army.', 'mort gravewitch bonecrew boneknight bonearchers lostsoul gloombats crypt poison nightfall wraith terror sanguine zap arrows'),
  TD('dark2', 'The Lich King', 'dark', 'Mortis himself, a Graveyard, and every skeleton you can fit in a deck.', 'lich graveyard mort gravewitch crypt bonecrew boneknight bonearchers colossus poison gloombats lostsoul zap arrows wraith'),
  TD('dark3', 'Bad Omens', 'dark', 'Curses, fear and poison. Everything that touches this deck regrets it.', 'tatters jackhollow miasma sanguine wraith terror lostsoul gloombats nightfall bonearchers bonecrew poison zap arrows boneknight'),
  TD('shadow1', 'Tricks and Traps', 'shadow', 'Five traps, an assassin, and a ninja who starts behind their lines.', 'vesper kage shinobi lostsoul cutpurse nightbolt wetfloor screen techfoul replay benched bonecrew zap arrows courier'),
  TD('shadow2', 'Smash and Grab', 'shadow', 'A pirate, a thief and a samurai. Every kill and every tower hit pays you Mana.', 'cutpurse gremking redbeard akaoni vesper shinobi kage orclings piranhas wetfloor screen zap rage nightbolt bonecrew'),
  TD('beast1', 'Full Moon', 'beast', 'A werewolf, the man who turns into one, a wolf pack and an armoured bear to open the door.', 'lycan woodsman wolfpack ironhide gorehorn landshark thumper monkroose piranhas orclings rage arrows zap bonecrew longshots'),
  TD('beast2', 'Stampede', 'beast', 'Everything charges or pounces. Whatever is in the way goes backwards.', 'gorehorn siegehorn whitemane bao courier raptor thumper frostbeak landshark lycan rage quake arrows piranhas monkroose'),
  TD('beast3', 'Feeding Time', 'nature', 'Cheap, quick and far too many of them.', 'piranhas cluckers pigeons bees mushnubs prickles orclings gremlins gloombats bonecrew thumper landshark zap arrows rage'),
  TD('nature1', 'Mushroom Kingdom', 'nature', 'A king who never stops growing an army, a walking tree, a faun to slow them down, and poison on everything.', 'mushking mushnubs sporecap dartfrog bees queen thornweaver bramblehorn heal shrine elderbark spikeslime poison quake arrows'),
  TD('nature2', 'Do Not Touch', 'nature', 'Thorns everywhere. Let them hurt themselves on the way in.', 'cactoro prickles spikeslime elderbark permafrost slime thornweaver heal shrine barricade cannon quake arrows longshots dartfrog'),
  TD('horde1', 'Orc Raid', 'horde', 'A Warchief, a War Drum and a mob that fights faster the closer it stands.', 'gorak raider mauler skullcrusher orclings bloodaxe witchdoc wardrum rage gremlins skytotem ugg arrows zap goliath'),
  TD('horde2', 'Goliath', 'horde', 'Two enormous problems, and a crowd to keep them busy while they walk.', 'goliath gorak skytotem orclings gremlins gremking ugg raider bloodaxe rage quake arrows wardrum gronk zap'),
  TD('order1', 'Hold the Line', 'order', 'Shields, walls, towers and a Tower Shield for the fireballs. Then counterpunch.', 'ironclad longshots dawnhammer oathkeeper bell brynja cannon watchtower barricade ward arrows courier nightbolt zap tinker'),
  TD('order2', 'Long Live the King', 'order', 'King Bellow and his guards, a lancer to open the lane and a sky maiden overhead. The full Order bonus.', 'kingbellow whitemane brynja bell dawnhammer oathkeeper ironclad longshots watchtower cannon barricade ward arrows zap heal'),
  TD('tech1', 'Machine Shop', 'tech', 'Robots, rifles, a walking mortar and a mechanic who keeps your towers standing.', 'tinker scrapbot shockbot starranger sarge prepper redline bjorn jetace titan cannon brassbolt zap arrows clanker'),
  TD('tech2', 'Heavy Metal', 'tech', 'Armour that shrugs off the small stuff and a minigun behind it.', 'clanker titan prepper shockbot scrapbot sarge afterhours brassbolt barricade cannon ward zap arrows starranger tinker'),
  TD('crew1', 'Break Room Regulars', 'crew', 'The whole office: security, the janitor, a vending machine with legs and the prospect himself.', 'bdb janitor hank vending courier trailboss interns captain helpers giggles mascot manawell arrows zap rage'),
  TD('crew2', 'Clock In', 'crew', 'Cheap, quick and relentless. Farm Mana and never stop sending bodies.', 'janitor manawell vending mushnubs interns helpers courier trailboss giggles cluckers orclings bonecrew zap arrows rage'),
  TD('mix1', 'Mana Bank', 'arcane', 'Three ways to make extra Mana and the biggest cards in the game to spend it on.', 'manawell vending redbeard gronk goliath colossus magmaw meteor lightning barricade cannon bonecrew zap arrows ward'),
  TD('mix2', 'Sky High', 'dragon', 'Fifteen cards and every one of them flies.', 'emberwing elder lostsoul wraith terror gloombats imps pigeons bees queen gremlins skytotem sentinel archon captain'),
  TD('mix3', 'Giants Only', 'horde', 'Seven giants that want towers and nothing else. Subtlety not included.', 'goliath colossus magmaw permafrost clanker mascot siegehorn rage heal ward bonecrew orclings zap arrows barricade'),
  TD('order3', 'Shining Armour', 'order', 'A stone guardian, a lion nobody can stop and a king to lead them. Shields and healing on everything.', 'heartstone pridemane brother halo scarlet halberd hilda kingbellow whitemane brynja bell ward arrows zap heal'),
  TD('shadow3', 'Smoke and Mirrors', 'shadow', 'Illusions, thieves and a suit of armour with nobody in it. They will never hit what they are aiming at.', 'kitsune voidplate reynard viper corvus whiskers bandit akaoni vesper kage shinobi redbeard wetfloor screen zap'),
  TD('dark4', 'Graveyard Shift', 'dark', 'A vampire who turns into a bat, a zombie who recruits, and a doll you really should not hit.', 'baron rotter acolyte grinn rattlecage pins nocturne mort bonecrew gloombats terror poison zap arrows crypt'),
  TD('fire3', 'Burn Notice', 'fire', 'A lava knight, a phoenix, and a mage whose victims explode. Stand well back.', 'obsidian kindle flicker phoenix azar ashjaw hellion imps cinder fireball meteor flamespire scald zap arrows'),
  TD('frost3', 'Long Winter', 'frost', 'The Winter Queen and her whole court. Thirteen Frost cards: the full bonus, and nothing of theirs moves at full speed again.', 'isolde winter nix mohawk tusk frosty woolly neve rimeguard glacius yeti freeze permafrost arrows zap'),
  TD('wizard3', 'Three Wishes', 'arcane', 'A genie who will not let your troops stay dead, a wizard who stops the clock, and a Mana Well to pay for it all.', 'genie tempus hagatha vex stargazer fizzle hoot geode zephyr hexa manawell lightning zap tornado arrows'),
  TD('beast4', 'The Pride', 'beast', 'The king of the beasts and everything that follows him. Roars, charges and a tiger with a black belt.', 'pridelord squeak hogwild cackle stripes ironhide wolfpack bao gorehorn thumper monkroose landshark rage arrows zap'),
  TD('nature3', 'Deep Woods', 'nature', 'Brambles, bees and a swamp that walks. Everything heals and everything bites back.', 'greenhorn bogmaw beekeeper sunny willow mossback bramblehorn elderbark thornweaver cactoro sporecap dartfrog heal quake arrows'),
  TD('horde3', 'Goblin Town', 'horde', 'A king with goblins in his coat, a drummer to hurry them up and one very large bomb.', 'furball fuse rattatat stubbeard howl shortbows orclings witchdoc skullcrusher mauler gorak wardrum rage arrows zap'),
  TD('tech3', 'The Workshop', 'tech', 'A walking mortar, a shrink ray and a mechanic who makes your buildings fire faster.', 'smokey rivet shrinkwell gearheart nugget ironbeard bjorn redline tinker cannon stormcoil watchtower scrapbot zap arrows'),
  TD('crew3', 'Office Party', 'crew', 'The Regional Manager brought everyone: the Ref, the chef, the lunch lady and a wrestler from accounts.', 'manager ref goldmask chef gert crusty pizza flint blitz lagspike finn hank vending janitor arrows'),
  TD('dragon3', 'Scales', 'dragon', 'Fifteen cards with scales, shells or both. A salamander who grows back, a turtle who hides, and three dragons who breathe on things.', 'scald razorback kai spikeback plum sirscorch shiver kobolds jade emberwing raptor kaiju nest fireball zap'),
  TD('dark5', 'Sleepy Hollow', 'dark', 'The Headless Horseman, a wraith who locks towers and a prior with very long claws. The nastiest deck in the Market.', 'horseman turnkey prior malgrave baron nocturne rotter pins acolyte grinn nightmare gloombats poison zap arrows'),
  TD('mix4', 'The Full Legend', 'crew', 'Three Legendaries in one deck, with the best support money can buy.', 'lich infernus kingbellow zephyr oathkeeper mort tonic lightning manawell bonecrew ironclad longshots zap arrows gravewitch')
];
export const deckPrice = d => Math.round(d.deck.reduce((a, id) => a + CARDS[id].price, 0) * .8 / 10) * 10;

/* ---------- CPU opponents ---------- */
/* A deck dealt from the pool: something cheap, something big, something that hits air and a spell are always in there.
   o: {types: favoured types, rare / epic / legend / god: how many of each he may hold, build: chance a card is a special build, traps: most traps} */
export function dealDeck(rnd, o = {}){
  const pick = a => a[Math.floor(rnd() * a.length)], pool = BASE_IDS.slice(), fav = o.types || [];
  for (let i = pool.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  if (fav.length) pool.sort((a, b) => (fav.includes(BASE[b].type) ? 1 : 0) - (fav.includes(BASE[a].type) ? 1 : 0));        // his own kind first
  const cap = {c:99, r:o.rare ?? 3, e:o.epic ?? 0, l:Math.min(MAX_LEGEND, o.legend ?? 0), g:Math.min(MAX_GOD, o.god ?? 0)}, have = {c:0, r:0, e:0, l:0, g:0}, bases = [];
  const U = b => BASE[b].us ? UNITS[BASE[b].us[0]] : BASE[b].u ? UNITS[BASE[b].u] : null, troop = b => { const u = U(b); return u && !u.bld; };
  const take = b => { const t = BASE[b].tier; if (bases.includes(b) || have[t] >= cap[t]) return false; have[t]++; bases.push(b); return true; };
  const need = [b => troop(b) && BASE[b].cost <= 2, b => troop(b) && BASE[b].cost <= 3, b => troop(b) && BASE[b].cost <= 3, b => !!BASE[b].spell && BASE[b].spell.dmg > 0, b => troop(b) && (U(b).only === 'b' || U(b).hp >= 900),
    b => troop(b) && U(b).air && BASE[b].cost <= 4, b => troop(b) && U(b).air, b => troop(b) && !!U(b).splash];
  for (const f of need){ const b = pool.find(x => f(x) && !bases.includes(x) && have[BASE[x].tier] < cap[BASE[x].tier]); if (b) take(b); }
  let traps = 0, blds = 0, spells = bases.filter(b => BASE[b].spell).length;
  for (const b of pool){
    if (bases.length >= DECK_SIZE) break;
    const B = BASE[b];
    if (B.trap && ++traps > (o.traps ?? 2)) continue;
    if (B.spell && ++spells > 4) continue;
    if (U(b) && U(b).bld && ++blds > 2) continue;
    take(b);
  }
  for (const b of BASE_IDS) if (bases.length < DECK_SIZE && BASE[b].tier === 'c' && !bases.includes(b) && troop(b)) bases.push(b);
  return bases.map(b => b + '-' + (rnd() < (o.build ?? 0) ? pick(AFF_IDS) : 'std'));
}
function mulberry(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const lerp = (a, b, t) => a + (b - a) * t;

/* The ladder: 1,000 levels in ten tiers of a hundred. Every level is a different deck; every hundredth is the tier boss.
   ai: react = seconds between decisions, hold = Mana he sits on before attacking, derp = chance of a random play, smart = 0 to 1, el = Mana speed. */
export const LEVELS = 1000;
export const TIERS = [
  {id:'trainee', name:'Trainee',      map:'ruins',   col:'#9fb3d9', tag:'First week. Still looking for the time clock.'},
  {id:'breakrm', name:'Break Room',   map:'glacier', col:'#7ccf4a', tag:'Defends the microwave line with his whole career.'},
  {id:'bench',   name:'Bench Warmer', map:'citadel', col:'#5fd6d0', tag:'Best seat in the house, every single game.'},
  {id:'night',   name:'Night Shift',  map:'yard',    col:'#63c8ff', tag:'Wide awake at 4 a.m. and nothing to show for it.'},
  {id:'rec',     name:'Rec League',   map:'temple',  col:'#a678ff', tag:'Captain, coach and leading scorer. Two points a night.'},
  {id:'varsity', name:'Varsity',      map:'keep',    col:'#ff7aa8', tag:'Made the team photo. Mostly the back row.'},
  {id:'d1',      name:'D1 Dream',     map:'hollow',  col:'#ff9d3c', tag:'Florida was a great idea on paper.'},
  {id:'pro',     name:'Pro Day',      map:'foundry', col:'#ff6a2b', tag:'Ran every drill. Nobody wrote anything down.'},
  {id:'allstar', name:'All-Star',     map:'cinder',  col:'#ffd23f', tag:'Voted in by one very loyal account.'},
  {id:'five',    name:'Five-Star',    map:'heavens', col:'#ffd95a', tag:'The prospect. The legend. The 2.0 points per game.'}
];
const MINIONS = ['Temp', 'Intern', 'Overtime', 'Double Shift', 'Lunch Break', 'Clipboard', 'Substitute', 'Pickup Game', 'Day Off', 'Sixth Man', 'Garbage Time', 'Preseason', 'Walk-On', 'Scout Team', 'Water Boy', 'Towel Guy',
  'Layup Line', 'Shootaround', 'Film Room', 'Carpool', 'Coffee Run', 'Time Sheet', 'Reply All', 'Out of Office', 'Open Gym', 'Warm-Up', 'Fast Food', 'Late Shift', 'Stat Sheet', 'Fan Vote'];
export const tierOf = n => TIERS[clamp(Math.floor((n - 1) / 100), 0, TIERS.length - 1)];
/* what beating level n pays, and what the first win there adds on top */
export function levelPrize(n){
  const boss = n % 100 === 0, coins = Math.round((30 + n * 1.1) * (boss ? 4 : n % 10 === 0 ? 1.6 : 1) / 5) * 5, t = Math.floor((n - 1) / 100);
  const first = {};
  if (boss){ first.pack = t >= 6 ? 'mythic' : t >= 2 ? 'diamond' : 'gold'; first.token = 2; first.rar = t >= 4 ? 'l' : 'e'; }
  else if (n % 25 === 0){ first.pack = t >= 5 ? 'diamond' : 'gold'; first.token = 1; }
  else if (n % 10 === 0){ first.pack = t >= 6 ? 'gold' : t >= 2 ? 'silver' : 'bronze'; first.token = 1; }
  else if (n % 5 === 0) first.pack = t >= 7 ? 'gold' : t >= 3 ? 'silver' : 'bronze';
  if (n === 1) first.pack = 'silver';
  return {coins, first, lose:Math.max(10, Math.round(coins * .18 / 5) * 5)};
}
export function ladderCpu(n){
  n = clamp(Math.round(n), 1, LEVELS);
  const rnd = mulberry(n * 7919 + 13), T = tierOf(n), t = TIERS.indexOf(T), boss = n % 100 === 0, g = (n - 1) / (LEVELS - 1), q = Math.min(1, g * 1.5);
  const types = [TYPE_IDS[Math.floor(rnd() * TYPE_IDS.length)], TYPE_IDS[Math.floor(rnd() * TYPE_IDS.length)]];
  const deck = dealDeck(rnd, {types, rare:1 + Math.round(g * 9) + (boss ? 1 : 0), epic:Math.floor(g * 7 + (boss ? 1.5 : n > 30 ? .5 : 0)), legend:Math.floor(g * 3.4 + (boss && t >= 2 ? 1 : 0)), god:t >= 7 && (boss || n % 10 === 0) ? 1 : 0, build:.08 + g * .5, traps:n < 20 ? 0 : n < 150 ? 1 : 3});
  const ai = {react:+lerp(3.2, .9, Math.pow(g, .6)).toFixed(2), hold:+lerp(9, 6, q).toFixed(1), derp:+lerp(.45, 0, Math.min(1, g * 2.2)).toFixed(2), smart:+lerp(.15, 1, Math.min(1, g * 1.8 + (boss ? .15 : 0))).toFixed(2), el:+lerp(.85, 1.3, g).toFixed(2) + (boss ? .05 : 0)};
  const name = boss ? T.name + ' BDB' : MINIONS[Math.floor(rnd() * MINIONS.length)] + ' BDB';
  return {id:'lv' + n, level:n, boss, tier:t, name, tag:boss ? T.tag : `${TYPES[types[0]].name}${types[1] !== types[0] ? ' and ' + TYPES[types[1]].name : ''} deck.`,
    map:(r => r < .75 ? T.map : MAP_IDS[Math.floor((r - .75) * 4 * MAP_IDS.length)])(boss ? 0 : rnd()),      // three games in four are on the tier's own arena
    lvl:clamp(1 + Math.floor(g * 9.6) + (boss ? 1 : 0), 1, MAX_LVL), tower:clamp(1 + Math.floor(g * 11) + (boss ? 1 : 0), 1, 14), ai, deck, types, ...levelPrize(n)};
}

/* Quick battle: a deck dealt at random, at one of four skill levels. dl: his card level relative to yours. The harder he is, the more a win pays:
   more coins, then one of his cards on top, then a pack as well. */
export const SKILLS = [
  {id:'easy',   name:'Easy',   coins:50,  lose:10, card:false, pack:null,     dl:-1, ai:{react:3,    hold:9,   derp:.4,  smart:.2,  el:.85}, deal:{rare:1, epic:0, legend:0, build:.05, traps:1}},
  {id:'medium', name:'Medium', coins:110, lose:20, card:true,  pack:null,     dl:0,  ai:{react:2.1,  hold:8,   derp:.18, smart:.5,  el:1},   deal:{rare:3, epic:1, legend:0, build:.2,  traps:2}},
  {id:'hard',   name:'Hard',   coins:220, lose:35, card:true,  pack:'bronze', dl:1,  ai:{react:1.5,  hold:7,   derp:.07, smart:.8,  el:1.05}, deal:{rare:5, epic:3, legend:1, build:.4, traps:3}},
  {id:'insane', name:'Insane', coins:420, lose:60, card:true,  pack:'silver', dl:2,  ai:{react:1.0,  hold:6,   derp:.02, smart:1,   el:1.2},  deal:{rare:6, epic:5, legend:3, build:.6, traps:3}}
];
export function randomCpu(skill, myLvl = 1, rnd = Math.random){
  const S = SKILLS.find(s => s.id === skill) || SKILLS[1], pick = a => a[Math.floor(rnd() * a.length)];
  return {id:'rand-' + S.id, rand:true, skill:S.id, name:pick(MINIONS) + ' BDB', tag:`${S.name}. A different deck every time.`, map:pick(MAP_IDS), lvl:clamp(Math.round(myLvl + S.dl), 1, MAX_LVL), tower:clamp(Math.round(myLvl + S.dl), 1, 14),
    coins:S.coins, lose:S.lose, card:S.card, pack:S.pack, ai:S.ai, deck:dealDeck(rnd, S.deal)};
}

/* Player upgrades, bought with tokens won on the ladder. They count against the CPU only; online matches are always even. */
export const PERKS = {
  hp:   {name:'Thicker Walls',  max:10, per:.04, text:r => `Your towers have ${Math.round(r * 4)}% more health.`},
  dmg:  {name:'Better Aim',     max:10, per:.05, text:r => `Your towers hit ${Math.round(r * 5)}% harder.`},
  flow: {name:'Mana Flow',      max:5,  per:.03, text:r => `Mana fills ${Math.round(r * 3)}% faster.`},
  start:{name:'Head Start',     max:4,  per:.75, text:r => `You start a match with ${(5 + r * .75).toFixed(2).replace(/\.?0+$/, '')} Mana.`},
  coin: {name:'Signing Bonus',  max:10, per:.06, text:r => `Wins pay ${Math.round(r * 6)}% more coins.`}
};
export const PERK_IDS = Object.keys(PERKS);
/* old saves held a card for every rarity of a character and used older names: where each of those went */
export const OLD_BASE = {skels:'bonecrew', bench:'ironclad', shooters:'longshots', gobs:'orclings', bats:'gloombats', airball:'arrows', slime:'slime', hoop:'cannon', mascot:'mascot', barista:'hexa', golem:'clanker', ref:'nightbolt',
  coffee:'fireball', vending:'crypt', trainer:'tonic', fast:'gorehorn', dragon:'emberwing', ghost:'lostsoul', clockout:'freeze', overtime:'rage', buzzer:'magmaw', witch:'gravewitch', fivestar:'bdb', jumbo:'lich', bell:'bell',
  wetfloor:'wetfloor', screen:'screen', replay:'replay', benched:'benched', techfoul:'techfoul'};
export const OLD_AFF = {vet:'gold', elite:'gold'};
