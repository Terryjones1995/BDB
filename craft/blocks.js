/* BDB Craft: every block, what it looks like and how it behaves. Shared by the page and the workers, so no DOM here.
   A block id is two bytes (ids are kept forever: new blocks only ever go on the end, or saved worlds would change). Faces go +x, -x, +y, -y, +z, -z. Every texture is drawn in code by tex.js: nothing here comes from any other game. */
export const CH = 16, H = 128, SEA = 62;
export const COLOURS = [['white', '#e9ecec'], ['orange', '#f07613'], ['magenta', '#bd44b3'], ['light blue', '#3aafd9'], ['yellow', '#f8c527'], ['lime', '#70b919'], ['pink', '#ed8dac'], ['grey', '#3e4447'],
  ['light grey', '#8e8e86'], ['cyan', '#158991'], ['purple', '#792aac'], ['blue', '#35399d'], ['brown', '#724728'], ['green', '#546d1b'], ['red', '#a12722'], ['black', '#141519']];

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
add('bookshelf', 'Bookshelf', {top:'planks_oak', side:'bookshelf'}, 'decor'); add('lamp', 'Lamp', 'lamp', 'decor', {glow:8}); add('obsidian', 'Obsidian', 'obsidian', 'build'); add('bedrock', 'Bedrock', 'bedrock', 'build');
add('cactus', 'Cactus', {top:'cactus_top', side:'cactus_side'}, 'nature'); add('pumpkin', 'Pumpkin', {top:'pumpkin_top', side:'pumpkin_side'}, 'decor'); add('melon', 'Melon', {top:'melon_top', side:'melon_side'}, 'decor');
add('hay', 'Hay Bale', {top:'hay_top', side:'hay_side'}, 'decor'); add('smooth_stone', 'Smooth Stone', 'smooth_stone', 'build'); add('terracotta', 'Terracotta', 'terracotta', 'build');
add('chiseled', 'Chiseled Stone Bricks', 'chiseled', 'build');      // this slot was once a block with a face on it; worlds saved then show this instead
add('tall_grass', 'Tall Grass', 'tall_grass', 'nature', {kind:'plant'}); add('flower_red', 'Red Flower', 'flower_red', 'nature', {kind:'plant'}); add('flower_yellow', 'Yellow Flower', 'flower_yellow', 'nature', {kind:'plant'});
add('dead_bush', 'Dead Bush', 'dead_bush', 'nature', {kind:'plant'}); add('mushroom', 'Red Mushroom', 'mushroom', 'nature', {kind:'plant'});
add('quartz', 'Quartz Block', {top:'quartz_top', side:'quartz'}, 'build'); add('planks_dark', 'Dark Oak Planks', 'planks_dark', 'build'); add('log_dark', 'Dark Oak Log', {top:'log_dark_top', side:'log_dark'}, 'nature');
add('leaves_dark', 'Dark Oak Leaves', 'leaves_dark', 'nature', {kind:'cutout'}); add('basalt', 'Basalt', 'basalt', 'build'); add('granite', 'Granite', 'granite', 'build'); add('mud_bricks', 'Mud Bricks', 'mud_bricks', 'build');
add('crate', 'Break Room Crate', 'crate', 'decor'); add('brick_red', 'Red Brick Wall', 'brick_red', 'build'); add('tiles', 'Break Room Tiles', 'tiles', 'build');
for (const [c] of COLOURS) add('wool_' + c.replace(' ', '_'), c[0].toUpperCase() + c.slice(1) + ' Wool', 'wool_' + c, 'colour');
for (const [c] of COLOURS) add('concrete_' + c.replace(' ', '_'), c[0].toUpperCase() + c.slice(1) + ' Concrete', 'concrete_' + c, 'colour');
for (const [c] of COLOURS) add('glass_' + c.replace(' ', '_'), c[0].toUpperCase() + c.slice(1) + ' Stained Glass', 'glass_' + c, 'colour', {kind:'glass', self:true});

/* ---------- everything added in the big block update (ids from 110 on) ---------- */
const cap = s => s.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
// woods: the four old ones get stripped logs; the new ones get the lot
for (const [w, n] of [['oak', 'Oak'], ['birch', 'Birch'], ['spruce', 'Spruce'], ['dark', 'Dark Oak']]) add('stripped_' + w, 'Stripped ' + n + ' Log', {top:'stripped_' + w + '_top', side:'stripped_' + w}, 'nature');
for (const [w, n, leaf] of [['jungle', 'Jungle', 'Leaves'], ['acacia', 'Acacia', 'Leaves'], ['mangrove', 'Mangrove', 'Leaves'], ['cherry', 'Cherry', 'Leaves'], ['crimson', 'Crimson', 'Wart Block'], ['warped', 'Warped', 'Wart Block']]){
  const stem = w === 'crimson' || w === 'warped';
  add('planks_' + w, n + ' Planks', 'planks_' + w, 'build');
  add('log_' + w, n + (stem ? ' Stem' : ' Log'), {top:'log_' + w + '_top', side:'log_' + w}, 'nature');
  add('stripped_' + w, 'Stripped ' + n + (stem ? ' Stem' : ' Log'), {top:'stripped_' + w + '_top', side:'stripped_' + w}, 'nature');
  add('leaves_' + w, stem ? (w === 'crimson' ? 'Nether Wart Block' : 'Warped Wart Block') : n + ' Leaves', 'leaves_' + w, 'nature', stem ? {} : {kind:'cutout'});
}
add('planks_bamboo', 'Bamboo Planks', 'planks_bamboo', 'build'); add('bamboo_block', 'Block of Bamboo', {top:'bamboo_block_top', side:'bamboo_block'}, 'build');
// stones
const st = (k, n, t, cat = 'build', o) => add(k, n, t || k, cat, o);
st('andesite', 'Andesite'); st('polished_andesite', 'Polished Andesite'); st('diorite', 'Diorite'); st('polished_diorite', 'Polished Diorite'); st('polished_granite', 'Polished Granite');
st('deepslate', 'Deepslate', {top:'deepslate_top', side:'deepslate'}); st('cobbled_deepslate', 'Cobbled Deepslate'); st('deepslate_bricks', 'Deepslate Bricks'); st('deepslate_tiles', 'Deepslate Tiles');
st('polished_deepslate', 'Polished Deepslate'); st('chiseled_deepslate', 'Chiseled Deepslate'); st('tuff', 'Tuff'); st('calcite', 'Calcite');
st('blackstone', 'Blackstone', {top:'blackstone_top', side:'blackstone'}); st('polished_blackstone', 'Polished Blackstone'); st('blackstone_bricks', 'Polished Blackstone Bricks'); st('gilded_blackstone', 'Gilded Blackstone');
st('netherrack', 'Netherrack', null, 'nature'); st('nether_bricks', 'Nether Bricks'); st('red_nether_bricks', 'Red Nether Bricks'); st('end_stone', 'End Stone', null, 'nature'); st('end_stone_bricks', 'End Stone Bricks');
st('purpur', 'Purpur Block'); st('purpur_pillar', 'Purpur Pillar', {top:'purpur_pillar_top', side:'purpur_pillar'}); st('prismarine', 'Prismarine'); st('prismarine_bricks', 'Prismarine Bricks'); st('dark_prismarine', 'Dark Prismarine');
st('red_sandstone', 'Red Sandstone', {top:'red_sandstone_top', side:'red_sandstone'}); st('cut_sandstone', 'Cut Sandstone', {top:'sandstone_top', side:'cut_sandstone'}); st('chiseled_sandstone', 'Chiseled Sandstone', {top:'sandstone_top', side:'chiseled_sandstone'});
st('smooth_sandstone', 'Smooth Sandstone', 'sandstone_top'); st('cut_red_sandstone', 'Cut Red Sandstone', {top:'red_sandstone_top', side:'cut_red_sandstone'}); st('smooth_red_sandstone', 'Smooth Red Sandstone', 'red_sandstone_top');
st('smooth_quartz', 'Smooth Quartz Block', 'quartz_top'); st('quartz_bricks', 'Quartz Bricks'); st('quartz_pillar', 'Quartz Pillar', {top:'quartz_pillar_top', side:'quartz_pillar'}); st('chiseled_quartz', 'Chiseled Quartz Block', {top:'quartz_top', side:'chiseled_quartz'});
st('mossy_stone_bricks', 'Mossy Stone Bricks'); st('cracked_stone_bricks', 'Cracked Stone Bricks'); st('packed_mud', 'Packed Mud'); st('crying_obsidian', 'Crying Obsidian', null, 'build', {glow:4});
st('amethyst', 'Block of Amethyst'); st('copper_block', 'Block of Copper', null, 'ores'); st('copper_exposed', 'Exposed Copper', null, 'ores'); st('copper_weathered', 'Weathered Copper', null, 'ores'); st('copper_oxidized', 'Oxidized Copper', null, 'ores');
st('cut_copper', 'Cut Copper', null, 'ores'); st('smooth_basalt', 'Smooth Basalt'); st('polished_basalt', 'Polished Basalt', {top:'polished_basalt_top', side:'polished_basalt'});
// colours: concrete powder, terracotta and glazed terracotta in all 16
for (const [c] of COLOURS) add('powder_' + c.replace(' ', '_'), cap(c) + ' Concrete Powder', 'powder_' + c, 'colour');
for (const [c] of COLOURS) add('terracotta_' + c.replace(' ', '_'), cap(c) + ' Terracotta', 'terracotta_' + c, 'colour');
for (const [c] of COLOURS) add('glazed_' + c.replace(' ', '_'), cap(c) + ' Glazed Terracotta', 'glazed_' + c, 'colour');
// natural
st('coarse_dirt', 'Coarse Dirt', null, 'nature'); st('podzol', 'Podzol', {top:'podzol_top', side:'podzol_side', bottom:'dirt'}, 'nature'); st('mycelium', 'Mycelium', {top:'mycelium_top', side:'mycelium_side', bottom:'dirt'}, 'nature');
st('rooted_dirt', 'Rooted Dirt', null, 'nature'); st('mud', 'Mud', null, 'nature'); st('moss', 'Moss Block', null, 'nature'); st('red_sand', 'Red Sand', null, 'nature');
st('packed_ice', 'Packed Ice', null, 'nature'); st('blue_ice', 'Blue Ice', null, 'nature'); st('magma', 'Magma Block', null, 'nature', {glow:3}); st('soul_sand', 'Soul Sand', null, 'nature'); st('soul_soil', 'Soul Soil', null, 'nature');
st('sponge', 'Sponge', null, 'nature'); st('dirt_path', 'Dirt Path', {top:'dirt_path_top', side:'dirt_path_side', bottom:'dirt'}, 'nature');
st('crimson_nylium', 'Crimson Nylium', {top:'crimson_nylium', side:'crimson_nylium_side', bottom:'netherrack'}, 'nature'); st('warped_nylium', 'Warped Nylium', {top:'warped_nylium', side:'warped_nylium_side', bottom:'netherrack'}, 'nature');
st('bone_block', 'Bone Block', {top:'bone_block_top', side:'bone_block'}, 'nature');
for (const [k, n] of [['tube', 'Tube'], ['brain', 'Brain'], ['bubble', 'Bubble'], ['fire', 'Fire'], ['horn', 'Horn']]) add('coral_' + k, n + ' Coral Block', 'coral_' + k, 'nature');
add('lava', 'Lava', 'lava', 'nature', {kind:'liquid', lava:true, glow:8, self:true});
// lights
st('glowstone', 'Glowstone', null, 'decor', {glow:8}); st('sea_lantern', 'Sea Lantern', null, 'decor', {glow:8}); st('shroomlight', 'Shroomlight', null, 'decor', {glow:8});
st('jack_o_lantern', "Jack o'Lantern", {top:'pumpkin_top', side:'pumpkin_side', front:'jack_face'}, 'decor', {glow:8}); st('redstone_lamp', 'Redstone Lamp', null, 'decor', {glow:8});
st('froglight_ochre', 'Ochre Froglight', {top:'froglight_ochre_top', side:'froglight_ochre'}, 'decor', {glow:8}); st('froglight_verdant', 'Verdant Froglight', {top:'froglight_verdant_top', side:'froglight_verdant'}, 'decor', {glow:8});
st('froglight_pearl', 'Pearlescent Froglight', {top:'froglight_pearl_top', side:'froglight_pearl'}, 'decor', {glow:8}); st('beacon', 'Beacon', null, 'decor', {kind:'cutout', glow:8});
// ores and minerals
for (const [k, n] of [['coal', 'Coal'], ['iron', 'Iron'], ['gold', 'Gold'], ['diamond', 'Diamond'], ['emerald', 'Emerald'], ['copper', 'Copper'], ['lapis', 'Lapis Lazuli'], ['redstone', 'Redstone']]) add('deep_ore_' + k, 'Deepslate ' + n + ' Ore', 'deep_ore_' + k, 'ores');
st('ore_copper', 'Copper Ore', null, 'ores'); st('ore_lapis', 'Lapis Lazuli Ore', null, 'ores'); st('ore_redstone', 'Redstone Ore', null, 'ores'); st('ore_nether_gold', 'Nether Gold Ore', null, 'ores'); st('ore_quartz', 'Nether Quartz Ore', null, 'ores');
st('ancient_debris', 'Ancient Debris', {top:'ancient_debris_top', side:'ancient_debris'}, 'ores');
st('block_coal', 'Block of Coal', null, 'ores'); st('block_lapis', 'Block of Lapis Lazuli', null, 'ores'); st('block_redstone', 'Block of Redstone', null, 'ores'); st('block_netherite', 'Block of Netherite', null, 'ores');
st('raw_iron', 'Block of Raw Iron', null, 'ores'); st('raw_gold', 'Block of Raw Gold', null, 'ores'); st('raw_copper', 'Block of Raw Copper', null, 'ores'); st('block_ruby', 'Block of Ruby', null, 'ores');
// plants
const pl = (k, n) => add(k, n, k, 'nature', {kind:'plant'});
pl('fern', 'Fern'); for (const [k, n] of [['oak', 'Oak'], ['birch', 'Birch'], ['spruce', 'Spruce'], ['jungle', 'Jungle'], ['acacia', 'Acacia'], ['dark', 'Dark Oak'], ['cherry', 'Cherry']]) pl('sapling_' + k, n + ' Sapling');
pl('blue_orchid', 'Blue Orchid'); pl('allium', 'Allium'); pl('azure_bluet', 'Azure Bluet'); pl('tulip_red', 'Red Tulip'); pl('tulip_orange', 'Orange Tulip'); pl('tulip_white', 'White Tulip'); pl('tulip_pink', 'Pink Tulip');
pl('oxeye_daisy', 'Oxeye Daisy'); pl('cornflower', 'Cornflower'); pl('lily_valley', 'Lily of the Valley'); pl('sunflower', 'Sunflower'); pl('rose_bush', 'Rose Bush'); pl('peony', 'Peony'); pl('lilac', 'Lilac');
pl('brown_mushroom', 'Brown Mushroom'); pl('sugar_cane', 'Sugar Cane'); pl('bamboo', 'Bamboo'); pl('berry_bush', 'Sweet Berry Bush'); pl('crimson_fungus', 'Crimson Fungus'); pl('warped_fungus', 'Warped Fungus');
pl('crimson_roots', 'Crimson Roots'); pl('warped_roots', 'Warped Roots'); pl('wither_rose', 'Wither Rose'); pl('torchflower', 'Torchflower');
for (const [k, n] of [['tube', 'Tube'], ['brain', 'Brain'], ['bubble', 'Bubble'], ['fire', 'Fire'], ['horn', 'Horn']]) pl('coral_plant_' + k, n + ' Coral');
// useful-looking blocks
st('crafting_table', 'Crafting Table', {top:'crafting_top', side:'crafting_side', front:'crafting_front', bottom:'planks_oak'}, 'decor'); st('furnace', 'Furnace', {top:'furnace_top', side:'furnace_side', front:'furnace_front'}, 'decor');
st('chest', 'Chest', {top:'chest_top', side:'chest_side', front:'chest_front'}, 'decor'); st('barrel', 'Barrel', {top:'barrel_top', side:'barrel_side', bottom:'barrel_top'}, 'decor');
st('jukebox', 'Jukebox', {top:'jukebox_top', side:'jukebox_side'}, 'decor'); st('note_block', 'Note Block', null, 'decor'); st('tnt', 'TNT', {top:'tnt_top', side:'tnt_side', bottom:'tnt_bottom'}, 'decor');
st('target', 'Target', {top:'target_top', side:'target_side'}, 'decor'); st('honey', 'Honey Block', null, 'decor', {kind:'glass', self:true}); st('slime', 'Slime Block', null, 'decor', {kind:'glass', self:true});
st('smithing_table', 'Smithing Table', {top:'smithing_top', side:'smithing_side'}, 'decor'); st('fletching_table', 'Fletching Table', {top:'fletching_top', side:'fletching_side'}, 'decor');
st('cartography_table', 'Cartography Table', {top:'cartography_top', side:'cartography_side'}, 'decor'); st('loom', 'Loom', {top:'loom_top', side:'loom_side', front:'loom_front'}, 'decor');
st('beehive', 'Beehive', {top:'beehive_top', side:'beehive_side', front:'beehive_front'}, 'decor'); st('dispenser', 'Dispenser', {top:'furnace_top', side:'furnace_side', front:'dispenser_front'}, 'decor');
st('observer', 'Observer', {top:'observer_top', side:'observer_side', front:'observer_front'}, 'decor'); st('piston', 'Piston', {top:'piston_top', side:'piston_side', bottom:'piston_bottom'}, 'decor');
st('mushroom_block_red', 'Red Mushroom Block', null, 'nature'); st('mushroom_block_brown', 'Brown Mushroom Block', null, 'nature'); st('mushroom_stem', 'Mushroom Stem', null, 'nature');
st('dried_kelp', 'Dried Kelp Block', {top:'dried_kelp_top', side:'dried_kelp'}, 'decor'); st('honeycomb', 'Honeycomb Block', null, 'decor'); st('reinforced_deepslate', 'Reinforced Deepslate', {top:'reinforced_top', side:'reinforced_side'}, 'build');
st('tinted_glass', 'Tinted Glass', null, 'build', {kind:'glass', self:true});

/* ---------- turned blocks: furnaces and the like face you, logs and pillars lie on their side ---------- */
const keyOf = k => L.find(b => b.key === k);
for (const k of ['furnace', 'chest', 'jack_o_lantern', 'loom', 'beehive', 'dispenser', 'observer', 'crafting_table', 'pumpkin']){
  const b0 = keyOf(k); for (let r = 1; r < 4; r++) L.push({...b0, key:k + '#f' + r, cat:'', turn:r, base:b0.id === undefined ? null : null, of:k});
}
for (const k of L.filter(b => /^(log_|stripped_)/.test(b.key) || ['quartz_pillar', 'purpur_pillar', 'bone_block', 'polished_basalt', 'hay', 'bamboo_block', 'basalt', 'deepslate'].includes(b.key)).map(b => b.key)){
  const b0 = keyOf(k); for (const ax of [1, 2]) L.push({...b0, key:k + '#a' + ax, cat:'', axis:ax, of:k});
}

/* ---------- shaped blocks. Each one takes a run of ids: one per state (which way it faces, open or shut, top or bottom), and the same again
   standing in water ("waterlogged", so you can build them under water). Only the first id of a run shows in the inventory ---------- */
export const SH = {slab:1, stairs:2, fence:3, gate:4, wall:5, pane:6, door:7, trapdoor:8, carpet:9, torch:10, lantern:11, ladder:12, chain:13};
const texOf = k => { const b = keyOf(k); if (!b) throw new Error('no block ' + k); return b.tex; };
function shape(key, name, tex, cat, sh, n, o = {}){
  const runs = o.wet === false ? 1 : 2, first = L.length;
  for (let w = 0; w < runs; w++) for (let s = 0; s < n; s++) L.push({key:s || w ? key + '#' + (w * n + s) : key, name, tex, cat:s || w ? '' : cat, kind:o.kind || 'shape', shape:sh, state:s, wet:w, first, n, glow:o.glow, full:o.full, mat:o.mat});
}
const MATS = ['stone', 'cobble', 'mossy_cobble', 'smooth_stone', 'stone_bricks', 'mossy_stone_bricks', 'andesite', 'polished_andesite', 'diorite', 'polished_diorite', 'granite', 'polished_granite',
  'cobbled_deepslate', 'polished_deepslate', 'deepslate_bricks', 'deepslate_tiles', 'tuff', 'bricks', 'mud_bricks', 'sandstone', 'cut_sandstone', 'smooth_sandstone', 'red_sandstone', 'cut_red_sandstone',
  'smooth_red_sandstone', 'quartz', 'smooth_quartz', 'prismarine', 'prismarine_bricks', 'dark_prismarine', 'nether_bricks', 'red_nether_bricks', 'blackstone', 'polished_blackstone', 'blackstone_bricks',
  'end_stone_bricks', 'purpur', 'cut_copper', 'planks_oak', 'planks_birch', 'planks_spruce', 'planks_dark', 'planks_jungle', 'planks_acacia', 'planks_mangrove', 'planks_cherry', 'planks_crimson', 'planks_warped', 'planks_bamboo'];
const nameOf = k => keyOf(k).name.replace(/ Block$/, '').replace(/^Block of /, '').replace(/ Planks$/, '');
for (const m of MATS) shape('slab_' + m, nameOf(m) + ' Slab', texOf(m), 'build', SH.slab, 2, {full:m, mat:m});
for (const m of MATS) shape('stairs_' + m, nameOf(m) + ' Stairs', texOf(m), 'build', SH.stairs, 8, {mat:m});
const WOODS = ['oak', 'birch', 'spruce', 'dark', 'jungle', 'acacia', 'mangrove', 'cherry', 'crimson', 'warped', 'bamboo'];
for (const w of WOODS) shape('fence_' + w, nameOf('planks_' + w) + ' Fence', texOf('planks_' + w), 'build', SH.fence, 1, {mat:'planks_' + w});
shape('fence_nether', 'Nether Brick Fence', texOf('nether_bricks'), 'build', SH.fence, 1);
for (const w of WOODS) shape('gate_' + w, nameOf('planks_' + w) + ' Fence Gate', texOf('planks_' + w), 'build', SH.gate, 8);
for (const m of ['cobble', 'mossy_cobble', 'stone_bricks', 'mossy_stone_bricks', 'andesite', 'diorite', 'granite', 'cobbled_deepslate', 'polished_deepslate', 'deepslate_bricks', 'deepslate_tiles', 'tuff',
  'bricks', 'mud_bricks', 'sandstone', 'red_sandstone', 'prismarine', 'nether_bricks', 'red_nether_bricks', 'blackstone', 'polished_blackstone', 'blackstone_bricks', 'end_stone_bricks']) shape('wall_' + m, nameOf(m) + ' Wall', texOf(m), 'build', SH.wall, 1);
shape('pane_glass', 'Glass Pane', 'glass', 'build', SH.pane, 1, {kind:'shapecut'});
for (const [c] of COLOURS) shape('pane_' + c.replace(' ', '_'), c[0].toUpperCase() + c.slice(1) + ' Stained Glass Pane', 'glass_' + c, 'colour', SH.pane, 1, {kind:'shapeglass'});
shape('iron_bars', 'Iron Bars', 'iron_bars', 'build', SH.pane, 1, {kind:'shapecut'});
for (const w of [...WOODS, 'iron']) shape('door_' + w, (w === 'iron' ? 'Iron' : nameOf('planks_' + w)) + ' Door', {top:'door_' + w + '_top', side:'door_' + w + '_bottom'}, 'build', SH.door, 16, {kind:'shapecut'});
for (const w of [...WOODS, 'iron']) shape('trapdoor_' + w, (w === 'iron' ? 'Iron' : nameOf('planks_' + w)) + ' Trapdoor', 'trapdoor_' + w, 'build', SH.trapdoor, 16, {kind:'shapecut'});
for (const [c] of COLOURS) shape('carpet_' + c.replace(' ', '_'), c[0].toUpperCase() + c.slice(1) + ' Carpet', 'wool_' + c, 'colour', SH.carpet, 1, {wet:false});
shape('carpet_moss', 'Moss Carpet', 'moss', 'nature', SH.carpet, 1, {wet:false});
shape('torch', 'Torch', 'torch', 'decor', SH.torch, 5, {kind:'shapecut', glow:8, wet:false}); shape('soul_torch', 'Soul Torch', 'soul_torch', 'decor', SH.torch, 5, {kind:'shapecut', glow:6, wet:false});
shape('lantern', 'Lantern', 'lantern', 'decor', SH.lantern, 2, {kind:'shapecut', glow:8}); shape('soul_lantern', 'Soul Lantern', 'soul_lantern', 'decor', SH.lantern, 2, {kind:'shapecut', glow:6});
shape('ladder', 'Ladder', 'ladder', 'decor', SH.ladder, 4, {kind:'shapecut'}); shape('chain', 'Chain', 'chain', 'decor', SH.chain, 1, {kind:'shapecut'});

L.forEach((b, i) => { b.id = i; b.kind = b.kind || 'solid'; });
/* textures: one layer each in the texture array, every name a block uses, in the order first used */
export const TEX = [...new Set(L.slice(1).flatMap(b => typeof b.tex === 'string' ? [b.tex] : [b.tex.top, b.tex.side, b.tex.bottom || b.tex.top, b.tex.front || b.tex.side]))];
export const T = Object.fromEntries(TEX.map((n, i) => [n, i]));
export const BLOCKS = L;
export const B = Object.fromEntries(L.map(b => [b.key, b.id]));      // the first id of each block (the one in the inventory)
export const N = L.length;
/* flat tables for the hot loops */
export const MAXID = 8192;
export const OPAQUE = new Uint8Array(MAXID), SOLID = new Uint8Array(MAXID), CUTOUT = new Uint8Array(MAXID), PLANT = new Uint8Array(MAXID), LIQUID = new Uint8Array(MAXID), SELF = new Uint8Array(MAXID), GLOW = new Uint8Array(MAXID), TRANS = new Uint8Array(MAXID), EMIT = new Uint8Array(MAXID);
export const FACE = new Uint16Array(MAXID * 6), FROT = new Uint8Array(MAXID * 6);      // FROT: the picture on this face is turned a quarter (logs lying down)
export const SHAPE = new Uint8Array(MAXID), STATE = new Uint8Array(MAXID), FIRST = new Uint16Array(MAXID), WET = new Uint8Array(MAXID), FULL = new Uint16Array(MAXID), TURN = new Uint16Array(MAXID * 4), AXIS = new Uint16Array(MAXID * 3), ROOT = new Uint16Array(MAXID);
for (const b of L){
  const i = b.id; if (!i) continue;
  const shaped = b.kind === 'shape' || b.kind === 'shapecut' || b.kind === 'shapeglass';
  OPAQUE[i] = b.kind === 'solid' ? 1 : 0; SOLID[i] = b.kind === 'solid' || b.kind === 'cutout' || b.kind === 'glass' ? 1 : 0; TRANS[i] = b.kind === 'glass' || b.kind === 'shapeglass' || (b.kind === 'liquid' && !b.lava) ? 1 : 0;
  CUTOUT[i] = b.kind === 'cutout' || b.kind === 'shapecut' ? 1 : 0; PLANT[i] = b.kind === 'plant' ? 1 : 0; LIQUID[i] = b.kind === 'liquid' ? (b.lava ? 2 : 1) : 0;
  SELF[i] = b.self ? 1 : 0; GLOW[i] = b.glow ? 1 : 0; EMIT[i] = b.glow === true ? 8 : (b.glow | 0);
  if (shaped){ SHAPE[i] = b.shape; STATE[i] = b.state; FIRST[i] = b.first; WET[i] = b.wet; if (b.full) FULL[i] = B[b.full]; GLOW[i] = 0; }
  ROOT[i] = b.of ? B[b.of] : shaped ? b.first : i;
  const t = typeof b.tex === 'string' ? {top:b.tex, side:b.tex, bottom:b.tex} : {top:b.tex.top, side:b.tex.side, bottom:b.tex.bottom || b.tex.top, front:b.tex.front};
  for (const n of [t.top, t.side, t.bottom]) if (T[n] == null) throw new Error('no texture ' + n);
  const f = [T[t.side], T[t.side], T[t.top], T[t.bottom], T[t.front || t.side], T[t.side]];
  if (b.turn){ const fronts = [4, 0, 5, 1]; f[4] = T[t.side]; f[fronts[b.turn]] = T[t.front || t.side]; }      // the front on +z, then +x, -z, -x
  if (b.axis === 1){ f[0] = f[1] = T[t.top]; f[2] = f[3] = f[4] = f[5] = T[t.side]; for (const k of [2, 3, 4, 5]) FROT[i * 6 + k] = 1; }       // lying along x
  if (b.axis === 2){ f[4] = f[5] = T[t.top]; f[0] = f[1] = f[2] = f[3] = T[t.side]; for (const k of [0, 1]) FROT[i * 6 + k] = 1; }            // lying along z
  for (let k = 0; k < 6; k++) FACE[i * 6 + k] = f[k];
}
for (const b of L){ if (b.turn) TURN[B[b.of] * 4 + b.turn] = b.id; if (b.axis) AXIS[B[b.of] * 3 + b.axis] = b.id; }
for (const b of L) if (!b.turn && !b.axis && b.id){ TURN[b.id * 4] = b.id; AXIS[b.id * 3] = b.id; }
export const CATS = [['build', 'Building'], ['colour', 'Colours'], ['nature', 'Nature'], ['ores', 'Ores and minerals'], ['decor', 'Lights and decoration']];
