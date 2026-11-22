/* BDB Craft: every block, what it looks like and how it behaves. Shared by the page and the workers, so no DOM here.
   A block id is one byte. Faces go +x, -x, +y, -y, +z, -z. Every texture is drawn in code by tex.js: nothing here comes from any other game. */
export const CH = 16, H = 128, SEA = 62;
export const COLOURS = [['white', '#e9ecec'], ['orange', '#f07613'], ['magenta', '#bd44b3'], ['light blue', '#3aafd9'], ['yellow', '#f8c527'], ['lime', '#70b919'], ['pink', '#ed8dac'], ['grey', '#3e4447'],
  ['light grey', '#8e8e86'], ['cyan', '#158991'], ['purple', '#792aac'], ['blue', '#35399d'], ['brown', '#724728'], ['green', '#546d1b'], ['red', '#a12722'], ['black', '#141519']];
/* textures: one layer each in the texture array, in this order */
export const TEX = ['stone', 'dirt', 'grass_top', 'grass_side', 'cobble', 'planks_oak', 'planks_birch', 'planks_spruce', 'log_oak', 'log_oak_top', 'log_birch', 'log_birch_top', 'log_spruce', 'log_spruce_top',
  'leaves_oak', 'leaves_birch', 'leaves_spruce', 'sand', 'sandstone', 'sandstone_top', 'gravel', 'snow', 'grass_snow', 'ice', 'water', 'glass', 'bricks', 'stone_bricks', 'mossy_cobble', 'clay',
  'ore_coal', 'ore_iron', 'ore_gold', 'ore_diamond', 'ore_emerald', 'ore_ruby', 'block_gold', 'block_iron', 'block_diamond', 'block_emerald', 'bookshelf', 'lamp', 'obsidian', 'bedrock',
  'cactus_side', 'cactus_top', 'pumpkin_side', 'pumpkin_top', 'melon_side', 'melon_top', 'hay_side', 'hay_top', 'smooth_stone', 'terracotta', 'bdb', 'tall_grass', 'flower_red', 'flower_yellow',
  'dead_bush', 'mushroom', 'quartz', 'quartz_top', 'planks_dark', 'log_dark', 'log_dark_top', 'leaves_dark', 'basalt', 'granite', 'mud_bricks', 'crate', 'brick_red', 'tiles',
  ...COLOURS.map(c => 'wool_' + c[0]), ...COLOURS.map(c => 'concrete_' + c[0]), ...COLOURS.map(c => 'glass_' + c[0])];
export const T = Object.fromEntries(TEX.map((n, i) => [n, i]));
/* the blocks. tex: one name for all six faces, or {top, side, bottom}. kind: solid (default), cutout (leaves, clear glass: holes you see through), glass (tinted,
   drawn see-through after everything else), plant (an X of two pictures, walk-through), liquid. self: no faces between two of the same. cat: the creative tab it sits in */
const L = [];
const add = (key, name, tex, cat, o = {}) => L.push({key, name, tex, cat, ...o});
add('air', 'Air', 'stone', '', {kind:'air'});
add('stone', 'Stone', 'stone', 'build'); add('dirt', 'Dirt', 'dirt', 'nature'); add('grass', 'Grass Block', {top:'grass_top', side:'grass_side', bottom:'dirt'}, 'nature');
add('cobble', 'Cobblestone', 'cobble', 'build');
add('planks_oak', 'Oak Planks', 'planks_oak', 'build'); add('planks_birch', 'Birch Planks', 'planks_birch', 'build'); add('planks_spruce', 'Spruce Planks', 'planks_spruce', 'build');
add('log_oak', 'Oak Log', {top:'log_oak_top', side:'log_oak'}, 'nature'); add('log_birch', 'Birch Log', {top:'log_birch_top', side:'log_birch'}, 'nature'); add('log_spruce', 'Spruce Log', {top:'log_spruce_top', side:'log_spruce'}, 'nature');
add('leaves_oak', 'Oak Leaves', 'leaves_oak', 'nature', {kind:'cutout'}); add('leaves_birch', 'Birch Leaves', 'leaves_birch', 'nature', {kind:'cutout'}); add('leaves_spruce', 'Spruce Leaves', 'leaves_spruce', 'nature', {kind:'cutout'});
add('sand', 'Sand', 'sand', 'nature'); add('sandstone', 'Sandstone', {top:'sandstone_top', side:'sandstone'}, 'build'); add('gravel', 'Gravel', 'gravel', 'nature');
add('snow', 'Snow', 'snow', 'nature'); add('grass_snow', 'Snowy Grass', {top:'snow', side:'grass_snow', bottom:'dirt'}, 'nature'); add('ice', 'Ice', 'ice', 'nature');
add('water', 'Water', 'water', 'nature', {kind:'liquid', self:true}); add('glass', 'Glass', 'glass', 'build', {kind:'cutout', self:true});
add('bricks', 'Bricks', 'bricks', 'build'); add('stone_bricks', 'Stone Bricks', 'stone_bricks', 'build'); add('mossy_cobble', 'Mossy Cobblestone', 'mossy_cobble', 'build'); add('clay', 'Clay', 'clay', 'nature');
add('ore_coal', 'Coal Ore', 'ore_coal', 'ores'); add('ore_iron', 'Iron Ore', 'ore_iron', 'ores'); add('ore_gold', 'Gold Ore', 'ore_gold', 'ores'); add('ore_diamond', 'Diamond Ore', 'ore_diamond', 'ores');
add('ore_emerald', 'Emerald Ore', 'ore_emerald', 'ores'); add('ore_ruby', 'Ruby Ore', 'ore_ruby', 'ores');
add('block_gold', 'Block of Gold', 'block_gold', 'ores'); add('block_iron', 'Block of Iron', 'block_iron', 'ores'); add('block_diamond', 'Block of Diamond', 'block_diamond', 'ores'); add('block_emerald', 'Block of Emerald', 'block_emerald', 'ores');
add('bookshelf', 'Bookshelf', {top:'planks_oak', side:'bookshelf'}, 'decor'); add('lamp', 'Lamp', 'lamp', 'decor', {glow:true}); add('obsidian', 'Obsidian', 'obsidian', 'build'); add('bedrock', 'Bedrock', 'bedrock', 'build');
add('cactus', 'Cactus', {top:'cactus_top', side:'cactus_side'}, 'nature'); add('pumpkin', 'Pumpkin', {top:'pumpkin_top', side:'pumpkin_side'}, 'decor'); add('melon', 'Melon', {top:'melon_top', side:'melon_side'}, 'decor');
add('hay', 'Hay Bale', {top:'hay_top', side:'hay_side'}, 'decor'); add('smooth_stone', 'Smooth Stone', 'smooth_stone', 'build'); add('terracotta', 'Terracotta', 'terracotta', 'build');
add('bdb', 'BDB Block', 'bdb', 'decor');
add('tall_grass', 'Tall Grass', 'tall_grass', 'nature', {kind:'plant'}); add('flower_red', 'Red Flower', 'flower_red', 'nature', {kind:'plant'}); add('flower_yellow', 'Yellow Flower', 'flower_yellow', 'nature', {kind:'plant'});
add('dead_bush', 'Dead Bush', 'dead_bush', 'nature', {kind:'plant'}); add('mushroom', 'Red Mushroom', 'mushroom', 'nature', {kind:'plant'});
add('quartz', 'Quartz Block', {top:'quartz_top', side:'quartz'}, 'build'); add('planks_dark', 'Dark Oak Planks', 'planks_dark', 'build'); add('log_dark', 'Dark Oak Log', {top:'log_dark_top', side:'log_dark'}, 'nature');
add('leaves_dark', 'Dark Oak Leaves', 'leaves_dark', 'nature', {kind:'cutout'}); add('basalt', 'Basalt', 'basalt', 'build'); add('granite', 'Granite', 'granite', 'build'); add('mud_bricks', 'Mud Bricks', 'mud_bricks', 'build');
add('crate', 'Break Room Crate', 'crate', 'decor'); add('brick_red', 'Red Brick Wall', 'brick_red', 'build'); add('tiles', 'Break Room Tiles', 'tiles', 'build');
for (const [c] of COLOURS) add('wool_' + c.replace(' ', '_'), c[0].toUpperCase() + c.slice(1) + ' Wool', 'wool_' + c, 'colour');
for (const [c] of COLOURS) add('concrete_' + c.replace(' ', '_'), c[0].toUpperCase() + c.slice(1) + ' Concrete', 'concrete_' + c, 'colour');
for (const [c] of COLOURS) add('glass_' + c.replace(' ', '_'), c[0].toUpperCase() + c.slice(1) + ' Stained Glass', 'glass_' + c, 'colour', {kind:'glass', self:true});
L.forEach((b, i) => { b.id = i; b.kind = b.kind || 'solid'; });
export const BLOCKS = L;
export const B = Object.fromEntries(L.map(b => [b.key, b.id]));
export const N = L.length;
/* flat tables for the hot loops */
export const OPAQUE = new Uint8Array(256), SOLID = new Uint8Array(256), CUTOUT = new Uint8Array(256), PLANT = new Uint8Array(256), LIQUID = new Uint8Array(256), SELF = new Uint8Array(256), GLOW = new Uint8Array(256), TRANS = new Uint8Array(256);
export const FACE = new Uint16Array(256 * 6);
for (const b of L){
  const i = b.id; if (!i) continue;
  OPAQUE[i] = b.kind === 'solid' ? 1 : 0; SOLID[i] = b.kind === 'solid' || b.kind === 'cutout' || b.kind === 'glass' ? 1 : 0; TRANS[i] = b.kind === 'glass' || b.kind === 'liquid' ? 1 : 0; CUTOUT[i] = b.kind === 'cutout' ? 1 : 0; PLANT[i] = b.kind === 'plant' ? 1 : 0; LIQUID[i] = b.kind === 'liquid' ? 1 : 0;
  SELF[i] = b.self ? 1 : 0; GLOW[i] = b.glow ? 1 : 0;
  const t = typeof b.tex === 'string' ? {top:b.tex, side:b.tex, bottom:b.tex} : {top:b.tex.top, side:b.tex.side, bottom:b.tex.bottom || b.tex.top};
  for (const n of [t.top, t.side, t.bottom]) if (T[n] == null) throw new Error('no texture ' + n);
  FACE[i * 6] = FACE[i * 6 + 1] = FACE[i * 6 + 4] = FACE[i * 6 + 5] = T[t.side]; FACE[i * 6 + 2] = T[t.top]; FACE[i * 6 + 3] = T[t.bottom];
}
export const CATS = [['build', 'Building'], ['nature', 'Nature'], ['colour', 'Colours'], ['ores', 'Ores and metals'], ['decor', 'Decoration']];
