/**
 * Items, weapons, accessories, equipment slots and the shop API.
 *
 * The table below is the game's whole item economy: curatives, elemancy
 * catalysts, treasures (sell fodder and catalysts), cooking ingredients, key
 * items, thirty-odd weapons across FFXV's weapon classes, and accessories.
 *
 * Design notes:
 *  - Items are immutable definitions; the `Inventory` instance only ever holds
 *    `{ id, count }` stacks, so a save file is tiny.
 *  - Equipment is per character: Noctis has four weapon slots (his phantom
 *    arsenal), everyone else has two, and everyone has three accessory slots.
 *  - `modsFor(charId)` folds equipment into a `Stats` modifier bucket, which is
 *    exactly what `Stats.gear` expects.
 */

import { emptyMods, addMods } from './Stats.ts';
import type { Emitter } from './Emitter.ts';

/* ------------------------------------------------------------------------ */
/* Categories                                                                */
/* ------------------------------------------------------------------------ */

export const CATEGORIES = ['curative', 'catalyst', 'treasure', 'ingredient', 'key', 'weapon', 'accessory', 'spell'];

/** Default stack limits per category. Key items never stack past one. */
export const STACK_LIMITS = {
  curative: 99, catalyst: 99, treasure: 99, ingredient: 99,
  key: 1, weapon: 20, accessory: 20, spell: 9,
};

/* ------------------------------------------------------------------------ */
/* Curatives                                                                 */
/* ------------------------------------------------------------------------ */

const CURATIVES = [
  { id: 'potion',        name: 'Potion',         price: 100,   desc: 'Restores 1000 HP to one ally.',                 use: { type: 'heal', amount: 1000, target: 'ally' } },
  { id: 'hi_potion',     name: 'Hi-Potion',      price: 400,   desc: 'Restores 3000 HP to one ally.',                 use: { type: 'heal', amount: 3000, target: 'ally' } },
  { id: 'mega_potion',   name: 'Mega-Potion',    price: 1000,  desc: 'Restores 3000 HP to the whole party.',          use: { type: 'heal', amount: 3000, target: 'party' } },
  { id: 'elixir',        name: 'Elixir',         price: 1500,  desc: 'Fully restores HP and MP to one ally.',         use: { type: 'full', target: 'ally' } },
  { id: 'hi_elixir',     name: 'Hi-Elixir',      price: 4000,  desc: 'Fully restores HP and MP to one ally and revives them.', use: { type: 'full', revive: true, target: 'ally' } },
  { id: 'megalixir',     name: 'Megalixir',      price: 12000, desc: 'Fully restores and revives the entire party.',  use: { type: 'full', revive: true, target: 'party' } },
  { id: 'phoenix_down',  name: 'Phoenix Down',   price: 1000,  desc: 'Revives a downed ally with 50% HP.',            use: { type: 'revive', percent: 0.5, target: 'downed' } },
  { id: 'antidote',      name: 'Antidote',       price: 50,    desc: 'Cures poison.',                                  use: { type: 'cure', status: ['poison'], target: 'ally' } },
  { id: 'gold_needle',   name: 'Gold Needle',    price: 100,   desc: 'Cures petrification.',                           use: { type: 'cure', status: ['stone'], target: 'ally' } },
  { id: 'smelling_salts',name: 'Smelling Salts', price: 100,   desc: 'Cures confusion and toad.',                      use: { type: 'cure', status: ['confuse', 'toad'], target: 'ally' } },
  { id: 'remedy',        name: 'Remedy',         price: 400,   desc: 'Cures every status ailment on one ally.',        use: { type: 'cure', status: ['*'], target: 'ally' } },
  { id: 'hyper_potion',  name: 'Hyper Potion',   price: 2000,  desc: 'Restores 6000 HP and grants a brief attack-up.',  use: { type: 'heal', amount: 6000, buff: { strength: 30, seconds: 60 }, target: 'ally' } },
  { id: 'ether',         name: 'Ether',          price: 500,   desc: 'Restores 50 MP and clears Stasis.',              use: { type: 'mp', amount: 50, clearStasis: true, target: 'ally' } },
  { id: 'mega_ether',    name: 'Mega-Ether',     price: 2000,  desc: 'Fully restores MP to the whole party.',          use: { type: 'mp', amount: 999, clearStasis: true, target: 'party' } },
];

/* ------------------------------------------------------------------------ */
/* Catalysts & treasures                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Catalyst payloads drive Elemancy. `potency` adds to spell potency per unit,
 * `effect` names the derived side-effect, and `thresholds` map "how many did
 * you throw in" to the strength of that effect.
 */
const CATALYSTS = [
  { id: 'debased_coin',      name: 'Debased Coin',       price: 20,   desc: 'A worn coin from a fallen kingdom. Smells faintly of EXP.',
    catalyst: { potency: 2,  effect: 'Expericast', tags: ['exp'],      thresholds: [[1, 1], [9, 2], [33, 3]] } },
  { id: 'debased_silver',    name: 'Debased Silverpiece',price: 60,   desc: 'Tarnished silver. Elemancers pay well for it.',
    catalyst: { potency: 4,  effect: 'Expericast', tags: ['exp'],      thresholds: [[1, 2], [9, 3], [33, 4]] } },
  { id: 'debased_banknote',  name: 'Debased Banknote',   price: 180,  desc: 'Old Lucian scrip. Worthless as money, priceless as a catalyst.',
    catalyst: { potency: 8,  effect: 'Expericast', tags: ['exp'],      thresholds: [[1, 3], [9, 4], [33, 5]] } },
  { id: 'rare_coin',         name: 'Rare Coin',          price: 1500, desc: 'A collector\'s piece. Wildly potent in a spell flask.',
    catalyst: { potency: 20, effect: 'Expericast', tags: ['exp'],      thresholds: [[1, 4], [5, 5], [20, 6]] } },
  { id: 'magitek_booster',   name: 'Magitek Booster',    price: 800,  desc: 'Niflheim battery cell. Makes a spell go off more than once.',
    catalyst: { potency: 6,  effect: 'Multicast',  tags: ['multi'],    thresholds: [[1, 1], [9, 2], [33, 3]] } },
  { id: 'zu_beak',           name: 'Zu Beak',            price: 900,  desc: 'Keratin from a giant\'s bill. Sharpens a spell into a lance.',
    catalyst: { potency: 14, effect: 'Ruinous',    tags: ['pierce'],   thresholds: [[1, 1], [10, 2], [30, 3]] } },
  { id: 'sky_gemstone',      name: 'Sky Gemstone',       price: 1200, desc: 'A stone that hums when lightning is near.',
    catalyst: { potency: 12, effect: 'Stormcast',  tags: ['lightning'],thresholds: [[1, 1], [10, 2], [30, 3]] } },
  { id: 'earth_gemstone',    name: 'Earth Gemstone',     price: 1200, desc: 'Dense and cold. Anchors a spell to the ground.',
    catalyst: { potency: 12, effect: 'Quakecast',  tags: ['area'],     thresholds: [[1, 1], [10, 2], [30, 3]] } },
  { id: 'rainbow_frog',      name: 'Rainbow Frog',       price: 700,  desc: 'It is not, technically, a frog.',
    catalyst: { potency: 6,  effect: 'Toadcast',   tags: ['status'],   thresholds: [[1, 1], [12, 2], [40, 3]] } },
  { id: 'venom_fang',        name: 'Venom Fang',         price: 320,  desc: 'A hollow sabertusk fang, still wet.',
    catalyst: { potency: 5,  effect: 'Venomcast',  tags: ['status', 'poison'], thresholds: [[1, 1], [10, 2], [30, 3]] } },
  { id: 'coeurl_whiskers',   name: 'Coeurl Whiskers',    price: 1100, desc: 'They twitch on their own. Best not to think about it.',
    catalyst: { potency: 16, effect: 'Stopcast',   tags: ['status', 'stop'], thresholds: [[1, 1], [8, 2], [24, 3]] } },
  { id: 'behemoth_horn',     name: 'Behemoth Horn',      price: 2500, desc: 'A trophy from something that should not have died.',
    catalyst: { potency: 26, effect: 'Limit Break',tags: ['limit'],    thresholds: [[1, 1], [5, 2], [15, 3]] } },
  { id: 'adamantite',        name: 'Adamantite',         price: 6000, desc: 'Shard of an impossible shell. Refuses to melt.',
    catalyst: { potency: 40, effect: 'Maxicast',   tags: ['limit', 'area'], thresholds: [[1, 2], [3, 3], [9, 4]] } },
  { id: 'sturdy_helixhorn',  name: 'Sturdy Helixhorn',   price: 480,  desc: 'A spiral horn, warm to the touch.',
    catalyst: { potency: 9,  effect: 'Healcast',   tags: ['heal'],     thresholds: [[1, 1], [10, 2], [30, 3]] } },
  { id: 'rotten_splinterbone',name:'Rotten Splinterbone',price: 240,  desc: 'Daemon bone. Do not keep it near food.',
    catalyst: { potency: 11, effect: 'Killcast',   tags: ['death'],    thresholds: [[1, 1], [10, 2], [30, 3]] } },
  { id: 'chrome_bit',        name: 'Chrome Bit',         price: 380,  desc: 'Machine-tooled scrap from an MT trooper.',
    catalyst: { potency: 7,  effect: 'Dispelcast', tags: ['dispel'],   thresholds: [[1, 1], [10, 2], [30, 3]] } },
  { id: 'moogle_charm_frag', name: 'Charm Fragment',     price: 2200, desc: 'A scrap of pom-pom. Impossibly lucky.',
    catalyst: { potency: 18, effect: 'Expericast', tags: ['exp', 'multi'], thresholds: [[1, 4], [4, 5], [12, 6]] } },
];

const TREASURES = [
  { id: 'rusted_bit',      name: 'Rusted Bit',        price: 30,   desc: 'Scrap metal. Sells for a pittance.' },
  { id: 'beautiful_bottle',name: 'Beautiful Bottle',  price: 120,  desc: 'Sea-worn glass from the Cygillan coast.' },
  { id: 'old_book',        name: 'Old Book',          price: 200,  desc: 'A pre-Fall novel. Collectors in Lestallum pay well.' },
  { id: 'garula_fur',      name: 'Garula Fur',        price: 260,  desc: 'Coarse, warm, and faintly musky.' },
  { id: 'sabertusk_fang',  name: 'Sabertusk Fang',    price: 180,  desc: 'Snapped clean off. Still sharp.' },
  { id: 'voretooth_tail',  name: 'Voretooth Tail',    price: 220,  desc: 'Kept twitching for an hour after.' },
  { id: 'mesmenir_mane',   name: 'Mesmenir Mane',     price: 640,  desc: 'Silver horsehair with a static charge.' },
  { id: 'naga_nail',       name: 'Naga Nail',         price: 900,  desc: 'A claw from a daemon that used to be a woman.' },
  { id: 'griffon_feather', name: 'Griffon Feather',   price: 750,  desc: 'Longer than a man\'s arm.' },
  { id: 'bandersnatch_fur',name: 'Bandersnatch Fur',  price: 1300, desc: 'Black as a starless night.' },
  { id: 'imperial_relay',  name: 'Imperial Relay Unit',price: 1600,desc: 'Pulled from a downed dropship. Still warm.' },
  { id: 'mythril_shaft',   name: 'Mythril Shaft',     price: 2400, desc: 'A machine part of pre-Fall craftsmanship.' },
];

/* ------------------------------------------------------------------------ */
/* Ingredients                                                               */
/* ------------------------------------------------------------------------ */

const ING = (id: any, name: any, price: any, desc: any, tags: any) => ({ id, name, price, desc, tags });

const INGREDIENTS = [
  ING('lucian_tomato',   'Lucian Tomato',        60,   'Sun-fat and sweet. Grows wild along the Leide roadside.', ['vegetable']),
  ING('leiden_pepper',   'Leiden Pepper',        80,   'Fierce heat, red as the badlands.',                        ['vegetable', 'spice']),
  ING('leiden_potato',   'Leiden Potato',        50,   'Dusty-skinned, keeps for months.',                         ['vegetable']),
  ING('duscaen_olives',  'Duscaen Olives',       120,  'Cured in brine and Cleigne wine.',                         ['vegetable']),
  ING('lucian_carrot',   'Lucian Carrot',        40,   'Crown City stock. Absurdly orange.',                       ['vegetable']),
  ING('wild_onion',      'Wild Onion',           30,   'Dug up beside the highway.',                               ['vegetable']),
  ING('allural_shallot', 'Allural Shallot',      180,  'Alstor\'s prize allium. Sweet when roasted.',              ['vegetable']),
  ING('sylkis_greens',   'Sylkis Greens',        600,  'Chocobo-grade greens. Humans can eat them too.',           ['vegetable', 'rare']),
  ING('curiel_greens',   'Curiel Greens',        420,  'Bitter, fibrous, extraordinarily good for you.',           ['vegetable']),
  ING('kettier_ginger',  'Kettier Ginger',       160,  'Numbing and floral.',                                       ['spice']),
  ING('schier_turmeric', 'Schier Turmeric',      140,  'Stains everything it touches gold.',                        ['spice']),
  ING('saxham_rice',     'Saxham Rice',          90,   'Short-grain, grown in the Duscae paddies.',                 ['grain']),
  ING('cleigne_wheat',   'Cleigne Wheat',        110,  'Mill it yourself; the bread is worth it.',                 ['grain']),
  ING('birdbeast_egg',   'Birdbeast Egg',        70,   'A single egg feeds four.',                                  ['egg']),
  ING('cleigne_darkshell','Cleigne Darkshell',   340,  'A black-shelled mussel from the Vesperpool.',               ['seafood']),
  ING('alstor_trout',    'Alstor Slough Trout',  260,  'Silver-flanked, caught at dawn.',                            ['seafood', 'fish']),
  ING('vesproom',        'Vesproom',             300,  'A luminous fungus from the Vesperpool shallows.',            ['mushroom']),
  ING('malmashroom',     'Malmashroom',          380,  'Grows only in Malmalam Thicket. Faintly narcotic.',          ['mushroom']),
  ING('anak_meat',       'Anak Meat',            200,  'Lean and gamey. The staple of every outpost grill.',         ['meat']),
  ING('garula_tenderloin','Garula Tenderloin',   520,  'The one good cut on an otherwise stringy beast.',            ['meat']),
  ING('dualhorn_steak',  'Dualhorn Steak',       460,  'Thick, marbled, needs a hot pan.',                           ['meat']),
  ING('daggerquill_breast','Daggerquill Breast', 280,  'Dark poultry with a mineral edge.',                          ['meat', 'poultry']),
  ING('chickatrice_breast','Chickatrice Breast', 240,  'Tastes like chicken. Is not chicken.',                       ['meat', 'poultry']),
  ING('basilisk_ribs',   'Basilisk Ribs',        900,  'Slow-cook for six hours or break your teeth.',               ['meat', 'rare']),
  ING('aegir_root',      'Aegir Root',           260,  'A sea tuber. Salty, starchy, strangely addictive.',          ['vegetable', 'seafood']),
  ING('ulwaat_berries',  'Ulwaat Berries',       1200, 'Accordo\'s finest. Sold by the handful.',                    ['fruit', 'rare']),
  ING('sweet_pepper',    'Sweet Pepper',         70,   'Mild, crunchy, the opposite of a Leiden pepper.',            ['vegetable']),
  ING('luncheon_meat',   'Luncheon Meat',        150,  'A tin of pink certainty.',                                    ['meat']),
  ING('cup_noodles',     'Cup Noodles',          200,  'Gladio\'s one true weakness.',                                ['grain']),
  ING('fine_cleigne_wheat','Fine Cleigne Wheat', 480,  'Stone-ground and sifted twice.',                              ['grain', 'rare']),
];

/* ------------------------------------------------------------------------ */
/* Key items                                                                 */
/* ------------------------------------------------------------------------ */

const KEY_ITEMS = [
  { id: 'regalia_key',    name: 'Regalia Key',        desc: 'The key to King Regis\' car. Do not scratch it.' },
  { id: 'ring_of_lucii',  name: 'Ring of the Lucii',  desc: 'The soul of every Lucian king. It will take a toll.' },
  { id: 'sword_wise_hint',name: 'Royal Tomb Map',     desc: 'Marks the resting places of the old kings.' },
  { id: 'hunter_licence', name: 'Hunter Licence',     desc: 'Lets you take bounties at any tipster in Lucis.' },
  { id: 'fishing_rod',    name: 'Tranquility Rod',    desc: 'A hunter-grade rod. Noctis\' actual hobby.' },
  { id: 'camera',         name: 'Prompto\'s Camera',  desc: 'Nobody else is allowed to hold it.' },
  { id: 'cookbook',       name: 'Ignis\' Notebook',   desc: 'Every recipe he has ever thought up.' },
  { id: 'chocobo_whistle',name: 'Chocobo Whistle',    desc: 'Wark.' },
  { id: 'meteorshard',    name: 'Meteorshard',        desc: 'A splinter of the Disc of Cauthess. Warm, always.' },
];

/* ------------------------------------------------------------------------ */
/* Weapons                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * @param cls one of WEAPON_CLASSES
 * @param mods extra stat modifiers
 * @param special free-text special effect (combat reads `tags`)
 * @param tags machine-readable effect tags
 */
const W = (id: string, name: string, cls: string, attack: number, price: number, mods: any, special: string, tags: string[], desc: string, wielders: any = null) => ({
  id, name, category: 'weapon', class: cls, attack, price, mods: mods || {},
  special, tags: tags || [], desc,
  // null = anyone whose class permission covers it; royal arms are Noctis-only.
  wielders: wielders || ((tags || []).includes('royal') ? ['noctis'] : null),
});

const WEAPONS = [
  // --- swords ---------------------------------------------------------
  W('engine_blade',   'Engine Blade',        'sword', 62,  0,     {},                                'Noctis\' first blade. Balanced, quick, sentimental.', [],                 'Forged from a Regalia piston. It has never once let him down.'),
  W('iron_sword',     'Iron Sword',          'sword', 48,  600,   {},                                'Cheap, heavy, dependable.',                            [],                 'Outpost stock. Every hunter starts with one.'),
  W('rune_saber',     'Rune Saber',          'sword', 96,  4200,  { magic: 24 },                     'Converts a little Magic into damage.',                 ['magic-scaling'],  'Etched with Solheim script that still faintly glows.'),
  W('blazefire',      'Blazefire Saber',     'sword', 128, 9800,  { magicAttack: 20 },               'Attacks carry a fire element.',                        ['element:fire'],   'A gunblade pattern out of Insomnia\'s armoury.'),
  W('drain_sword',    'Drain Sword',         'sword', 112, 8600,  {},                                'Restores HP with every hit.',                          ['lifesteal'],      'The blade is faintly warm, like it just ate.'),
  W('ultima_blade',   'Ultima Blade',        'sword', 268, 48000, { strength: 40, critRate: 0.06 },  'The peak of Lucian smithing.',                          [],                 'Upgraded from the Engine Blade by a Lestallum genius.'),
  W('sword_wise',     'Sword of the Wise',   'sword', 210, 0,     { magic: 60 },                     'Royal arm. Drains HP while equipped.',                 ['royal', 'drain'], 'The Wise King\'s blade. It fights beside you on its own.'),
  W('blade_mystic',   'Blade of the Mystic', 'sword', 232, 0,     { spirit: 50 },                    'Royal arm. Slow, enormous reach.',                     ['royal', 'drain'], 'A sword as long as its bearer was patient.'),

  // --- greatswords ----------------------------------------------------
  W('hardedge',       'Hardedge',            'greatsword', 88,  2400,  { vitality: 10 },              'Heavy swing, good stagger damage.',                    ['stagger+'],        'A slab of steel with an edge as an afterthought.'),
  W('iron_duke',      'Iron Duke',           'greatsword', 142, 12000, { vitality: 24 },              'Massive poise damage.',                                ['stagger+'],        'A duelling greatsword from the Duscae foundries.'),
  W('apocalypse',     'Apocalypse',          'greatsword', 236, 42000, { strength: 30 },              'Damage rises as your HP falls.',                       ['berserk'],         'It is honestly a bit much.'),
  W('balmung',        'Balmung',             'greatsword', 258, 56000, { strength: 44, critDamage: 0.2 }, 'Critical hits cleave through armour.',             ['armour-pierce'],   'A dragonslayer\'s blade out of legend.'),
  W('sword_father',   'Sword of the Father', 'greatsword', 246, 0,     { strength: 55 },              'Royal arm. Regis\' own blade.',                        ['royal', 'drain'],  'The last thing his father gave him.'),
  W('axe_conqueror',  'Axe of the Conqueror','greatsword', 288, 0,     { strength: 70, vitality: -20 },'Royal arm. Colossal damage, glacial swing.',           ['royal', 'drain'],  'It takes a full second to land and it does not matter.'),

  // --- polearms -------------------------------------------------------
  W('bronze_spear',   'Bronze Spear',        'polearm', 54,  700,   {},                               'Long reach, safe pokes.',                              [],                  'Standard militia issue, still perfectly good.'),
  W('partisan',       'Partisan',            'polearm', 102, 5600,  { critRate: 0.03 },               'Thrust attacks pierce two enemies.',                   ['pierce'],          'A hunter\'s spear with a wicked crossguard.'),
  W('dragoon_lance',  'Dragoon Lance',       'polearm', 176, 21000, { strength: 20 },                 'Airborne attacks deal 30% more damage.',               ['air+'],            'Named for men who jumped and did not come down.'),
  W('flesh_harvester','Flesh Harvester',     'polearm', 208, 33000, { magic: 30 },                    'Restores MP on kill.',                                 ['mp-on-kill'],      'A scythe, if we are being honest about it.'),
  W('trident_oracle', 'Trident of the Oracle','polearm',224, 0,     { magic: 55, spirit: 30 },        'Royal arm. Attacks carry holy light.',                 ['royal', 'drain', 'element:light'], 'The Oracle\'s trident, older than the Wall.'),

  // --- daggers --------------------------------------------------------
  W('plunderers',     'Plunderers',          'dagger', 44,  900,   { critRate: 0.04 },                'Fast, low damage, high crit.',                         [],                  'Twin knives with mismatched grips.'),
  W('orichalcum_dirk','Orichalcum Dirk',     'dagger', 78,  4800,  { critRate: 0.06 },                'Blindside strikes deal double.',                       ['blindside+'],      'Light enough to forget you are holding it.'),
  W('ulrics_kukris',  'Ulric\'s Kukris',     'dagger', 138, 16000, { critRate: 0.08 },                'Warp-strikes chain into a second slash.',              ['warp-chain'],      'Nyx Ulric\'s blades. They still smell of ozone.'),
  W('zwill_crossblades','Zwill Crossblades', 'dagger', 196, 38000, { critRate: 0.12, critDamage: 0.25 }, 'The fastest combo in the arsenal.',                ['combo+'],          'Accordan steel, folded past reason.'),
  W('star_rogue',     'Star of the Rogue',   'dagger', 188, 0,     { critRate: 0.10 },                'Royal arm. A thrown star that returns.',               ['royal', 'drain', 'ranged'], 'The Rogue never once fought fair.'),

  // --- firearms -------------------------------------------------------
  W('handgun',        'Handgun',             'firearm', 40,  500,   {},                               'Chip damage at range.',                                ['ranged'],          'Prompto\'s spare. Noctis can hold one competently.', ['noctis', 'prompto']),
  W('quicksilver',    'Quicksilver',         'firearm', 92,  7400,  { critRate: 0.05 },               'Rapid fire, generous magazine.',                       ['ranged'],          'Chrome and mother-of-pearl. Prompto\'s favourite.', ['noctis', 'prompto']),
  W('valiant',        'Valiant',             'firearm', 148, 19000, { strength: 18 },                 'Shots stagger smaller enemies.',                       ['ranged', 'stagger+'], 'A hunter\'s big-bore rifle.', ['noctis', 'prompto']),
  W('death_penalty',  'Death Penalty',       'firearm', 232, 52000, { critRate: 0.14, critDamage: 0.4 }, 'Critical shots can instantly finish weakened foes.', ['ranged', 'execute'], 'Nobody will say where it came from.', ['noctis', 'prompto']),
  W('bow_clever',     'Bow of the Clever',   'firearm', 202, 0,     { magic: 40 },                    'Royal arm. Warps you to whatever it hits.',            ['royal', 'drain', 'ranged'], 'The Clever King never needed to be close.'),

  // --- shields (Gladiolus) --------------------------------------------
  W('buckler',        'Buckler',             'shield', 24,  400,   { vitality: 20 },                  'Blocks more, swings less.',                            ['guard'],           'Battered, dented, still doing its job.', ['gladio']),
  W('kite_shield',    'Kite Shield',         'shield', 36,  3200,  { vitality: 48, defense: 20 },     'Perfect guards stagger the attacker.',                 ['guard', 'riposte'],'Crownsguard issue.', ['gladio']),
  W('shield_just',    'Shield of the Just',  'shield', 96,  0,     { vitality: 90, defense: 60 },     'Royal arm. Nothing gets past it.',                     ['royal', 'drain', 'guard'], 'The Just King never lost a man.', ['noctis', 'gladio']),

  // --- machinery (Prompto) --------------------------------------------
  W('auto_crossbow',  'Auto Crossbow',       'machinery', 120, 6800,  {},                             'Sprays bolts in a wide arc.',                          ['ranged', 'aoe'],   'Prompto built it in an afternoon.', ['prompto']),
  W('bio_blaster',    'Bio Blaster',         'machinery', 96,  9200,  {},                             'Poisons everything in the cloud.',                     ['ranged', 'aoe', 'poison'], 'Do not stand downwind.', ['prompto']),
  W('circular_saw',   'Circular Saw',        'machinery', 184, 15000, {},                             'Grinds through armour at point-blank.',                ['armour-pierce'],   'Loud, messy, deeply effective.', ['prompto']),
  W('gravity_well',   'Gravity Well',        'machinery', 88,  22000, {},                             'Drags enemies into one screaming pile.',               ['aoe', 'pull'],     'Recovered Niflheim tech.', ['prompto']),
  W('infinity_rocket','Infinity Rocket',     'machinery', 312, 68000, {},                             'Exactly what it sounds like.',                         ['ranged', 'aoe'],   'Cindy said not to ask.', ['prompto']),
];

/* ------------------------------------------------------------------------ */
/* Accessories                                                               */
/* ------------------------------------------------------------------------ */

const A = (id: any, name: any, price: any, mods: any, desc: any, tags: any[] = []) => ({ id, name, category: 'accessory', price, mods, desc, tags });

const ACCESSORIES = [
  A('bronze_bangle',   'Bronze Bangle',     400,   { hp: 300 },                                'A plain band. Adds a little padding.'),
  A('silver_bangle',   'Silver Bangle',     1200,  { hp: 800 },                                'Better metal, better cushion.'),
  A('gold_bangle',     'Gold Bangle',       4000,  { hp: 2000 },                               'Ostentatious and effective.'),
  A('platinum_bangle', 'Platinum Bangle',   12000, { hp: 5000 },                               'The last word in staying alive.'),
  A('power_wristband', 'Power Wristband',   1800,  { strength: 40 },                           'Weighted leather. Gladio swears by them.'),
  A('champions_anklet','Champion\'s Anklet',9000,  { strength: 100, hp: 500 },                 'Awarded for a hundred hunts.'),
  A('magitek_suit',    'Magitek Suit',      7000,  { vitality: 80, defense: 40, resist: { fire: 20, lightning: 20 } }, 'Salvaged imperial plating. Heavy but proof against a lot.'),
  A('circlet',         'Circlet',           2600,  { magic: 60, mp: 20 },                      'A thin silver band that clears the head.'),
  A('sages_stone',     'Sage\'s Stone',     8500,  { magic: 120, magicAttack: 30 },            'Elemancers fight over these.'),
  A('black_hood',      'Black Hood',        5200,  { critRate: 0.08, spirit: 30 },             'Makes you harder to see and harder to hit.'),
  A('ruby_bracelet',   'Ruby Bracelet',     3400,  { resist: { fire: 60 } },                   'Fire runs off it like water.'),
  A('sapphire_bracelet','Sapphire Bracelet',3400,  { resist: { ice: 60 } },                    'Never frosts over, no matter the cold.'),
  A('topaz_bracelet',  'Topaz Bracelet',    3400,  { resist: { lightning: 60 } },              'Hair stops standing up when you wear it.'),
  A('obsidian_torque', 'Obsidian Torque',   6800,  { resist: { dark: 70 }, spirit: 40 },       'Daemons hate the sight of it.'),
  A('moogle_charm',    'Moogle Charm',      0,     { mult: { hp: 0.05 } },                     'Boosts all EXP earned by 20%. Kupo.', ['exp+20']),
  A('ribbon',          'Ribbon',            0,     { spirit: 80, resist: { fire: 30, ice: 30, lightning: 30, dark: 30 } }, 'Immunity to every status ailment. The best accessory in any Final Fantasy.', ['status-immune']),
  A('talisman',        'Talisman',          2200,  { mp: 40, spirit: 40 },                     'Regenerates MP noticeably faster.', ['mp-regen']),
  A('hypno_crown',     'Hypno Crown',       5600,  { magic: 70, critRate: 0.04 },              'Spells cast from it linger a beat longer.'),
];

/* ------------------------------------------------------------------------ */
/* The master table                                                          */
/* ------------------------------------------------------------------------ */

/** Every item definition in the game, keyed by id. */
export const ITEMS = (() => {
  const map: Record<string, any> = {};
  const push = (list: any, category: any) => {
    for (const it of list) {
      const price = it.price ?? 0;
      map[it.id] = {
        sell: Math.max(1, Math.round(price * 0.5)),
        stack: STACK_LIMITS[(it.category || category) as keyof typeof STACK_LIMITS],
        tags: [],
        ...it,
        category: it.category || category,
        price,
      };
    }
  };
  push(CURATIVES, 'curative');
  push(CATALYSTS, 'catalyst');
  push(TREASURES, 'treasure');
  push(INGREDIENTS, 'ingredient');
  push(KEY_ITEMS, 'key');
  push(WEAPONS, 'weapon');
  push(ACCESSORIES, 'accessory');
  // Key items are never worth gil and never stack.
  for (const k of KEY_ITEMS) { map[k.id].price = 0; map[k.id].sell = 0; map[k.id].stack = 1; }
  return map;
})();

/** Total number of authored items — handy sanity check for tests. */
export const ITEM_COUNT = Object.keys(ITEMS).length;

/** Look an item definition up. Returns null for unknown ids. */
export function itemDef(id: any) { return ITEMS[id] || null; }

/** All items in a category. */
export function itemsInCategory(category: any) {
  return Object.values(ITEMS).filter((i) => i.category === category);
}

/* ------------------------------------------------------------------------ */
/* Equipment layout                                                          */
/* ------------------------------------------------------------------------ */

/** How many slots each character has. Noctis carries the phantom arsenal. */
export const SLOT_LAYOUT = {
  noctis:  { weapon: 4, accessory: 3 },
  gladio:  { weapon: 2, accessory: 3 },
  ignis:   { weapon: 2, accessory: 3 },
  prompto: { weapon: 2, accessory: 3 },
};

/** Which weapon classes each character is allowed to hold. */
export const CLASS_PERMISSION = {
  noctis:  ['sword', 'greatsword', 'polearm', 'dagger', 'firearm', 'shield'],
  gladio:  ['greatsword', 'shield'],
  ignis:   ['dagger', 'polearm'],
  prompto: ['firearm', 'machinery'],
};

/* ------------------------------------------------------------------------ */
/* Inventory                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * The party's shared bag plus everyone's equipment. Emits `item-gained`,
 * `item-lost`, `item-used`, `gil-changed` and `equipment-changed`.
 */
export class Inventory {
  bag!: any;
  emitter!: Emitter | null;
  equipment!: any;
  gil!: number;
  sellBonus!: number;
  constructor(emitter: import('./Emitter.ts').Emitter | null = null) {
    this.emitter = emitter;
    /** @type {Record<string, number>} id -> count */
    this.bag = {};
    this.gil = 0;
    /** @type {Record<string, {weapon:(string|null)[], accessory:(string|null)[]}>} */
    this.equipment = {};
    for (const id of Object.keys(SLOT_LAYOUT)) {
      this.equipment[id] = {
        weapon: new Array(SLOT_LAYOUT[id as keyof typeof SLOT_LAYOUT].weapon).fill(null),
        accessory: new Array(SLOT_LAYOUT[id as keyof typeof SLOT_LAYOUT].accessory).fill(null),
      };
    }
    /** Multiplier applied to sell prices (Bargain Hunter ascension node). */
    this.sellBonus = 0;
  }

  /* -- Bag --------------------------------------------------------------- */

  /** How many of an item the party is carrying. */
  count(id: any) { return this.bag[id] || 0; }

  /** True if the party has at least `n`. */
  has(id: any, n = 1) { return this.count(id) >= n; }

  /**
   * Add items. Respects stack limits; returns how many were actually taken.
   * @param [n=1]
   * @param [source] label for the toast ('drop', 'quest', 'shop', ...)
   */
  add(id: string, n: number = 1, source: string = 'pickup') {
    const def = ITEMS[id];
    if (!def || n <= 0) return 0;
    const limit = def.stack ?? 99;
    const have = this.count(id);
    const taken = Math.max(0, Math.min(n, limit - have));
    if (taken === 0) return 0;
    this.bag[id] = have + taken;
    this.emitter?.emit('item-gained', { id, name: def.name, count: taken, total: this.bag[id], source, def });
    return taken;
  }

  /**
   * Remove items. Returns how many were actually removed.
   * @param [n=1]
   */
  remove(id: string, n: number = 1) {
    const have = this.count(id);
    const gone = Math.min(have, Math.max(0, n));
    if (gone === 0) return 0;
    this.bag[id] = have - gone;
    if (this.bag[id] === 0) delete this.bag[id];
    this.emitter?.emit('item-lost', { id, name: ITEMS[id]?.name, count: gone, total: this.count(id) });
    return gone;
  }

  /** Every stack, hydrated with its definition, optionally filtered. */
  list(category: any = null) {
    return Object.keys(this.bag)
      .map((id) => ({ id, count: this.bag[id], def: ITEMS[id] }))
      .filter((e) => e.def && (!category || e.def.category === category))
      .sort((a, b) => a.def.name.localeCompare(b.def.name));
  }

  /** Items grouped by category — the shape the item menu wants. */
  listByCategory() {
    const out: Record<string, any[]> = {};
    for (const e of this.list()) (out[e.def.category] ||= []).push(e);
    return out;
  }

  /* -- Gil --------------------------------------------------------------- */

  addGil(n: any, source = 'reward') {
    this.gil = Math.max(0, this.gil + Math.round(n));
    this.emitter?.emit('gil-changed', { gil: this.gil, delta: Math.round(n), source });
    return this.gil;
  }

  spendGil(n: any) {
    if (this.gil < n) return false;
    this.addGil(-n, 'spend');
    return true;
  }

  /* -- Using ------------------------------------------------------------- */

  /**
   * Use a consumable. The caller supplies the targets (Stats instances) since
   * Inventory has no idea who is in range.
   *
   * @param [opts] `{ curativePower }` from the Ascension grid
   */
  use(id: string, targets: import('./Stats.ts').Stats[] = [], opts: any = {}): {ok:boolean, reason?:string, results?:any[]} {
    const def = ITEMS[id];
    if (!def) return { ok: false, reason: 'unknown-item' };
    if (!def.use) return { ok: false, reason: 'not-usable' };
    if (!this.has(id)) return { ok: false, reason: 'none-left' };
    const power = 1 + (opts.curativePower || 0);
    const list = def.use.target === 'party' ? targets : targets.slice(0, 1);
    if (!list.length) return { ok: false, reason: 'no-target' };

    const results = [];
    for (const t of list) {
      const r = { id: t.id, healed: 0, mp: 0, revived: false, cured: [] };
      switch (def.use.type) {
        case 'heal':
          if (t.ko) break;
          r.healed = t.heal(def.use.amount * power);
          break;
        case 'mp':
          r.mp = t.restoreMp(def.use.amount);
          break;
        case 'full':
          if (t.ko && !def.use.revive) break;
          if (t.ko) { t.ko = false; r.revived = true; }
          r.healed = t.heal(t.maxHp);
          r.mp = t.restoreMp(t.maxMp);
          break;
        case 'revive':
          if (!t.ko) break;
          t.ko = false;
          r.revived = true;
          r.healed = t.heal(t.maxHp * (def.use.percent || 0.5));
          break;
        case 'cure':
          r.cured = def.use.status.slice();
          break;
        default: break;
      }
      results.push(r);
    }
    this.remove(id, 1);
    this.emitter?.emit('item-used', { id, name: def.name, results });
    return { ok: true, results };
  }

  /* -- Equipment --------------------------------------------------------- */

  /**
   * Equip a weapon or accessory. The item must be in the bag and the character
   * must be allowed to hold it.
   * @param itemId pass null to unequip
   */
  equip(charId: string, kind: 'weapon' | 'accessory', slot: number, itemId: string | null) {
    const rack = this.equipment[charId];
    if (!rack || !rack[kind] || slot < 0 || slot >= rack[kind].length) return { ok: false, reason: 'bad-slot' };

    // Unequip first: the old item goes back in the bag.
    const previous = rack[kind][slot];
    if (itemId === null) {
      rack[kind][slot] = null;
      if (previous) this.add(previous, 1, 'unequip');
      this.emitter?.emit('equipment-changed', { charId, kind, slot, itemId: null, previous });
      return { ok: true, previous };
    }

    const def = ITEMS[itemId];
    if (!def) return { ok: false, reason: 'unknown-item' };
    if (def.category !== kind) return { ok: false, reason: 'wrong-category' };
    if (kind === 'weapon') {
      const allowed = CLASS_PERMISSION[charId as keyof typeof CLASS_PERMISSION] || [];
      if (!allowed.includes(def.class)) return { ok: false, reason: 'class-not-allowed' };
      if (def.wielders && !def.wielders.includes(charId)) return { ok: false, reason: 'not-your-weapon' };
    }
    if (rack[kind].includes(itemId) && kind === 'accessory') return { ok: false, reason: 'already-equipped' };
    if (!this.has(itemId)) return { ok: false, reason: 'not-owned' };

    this.remove(itemId, 1);
    rack[kind][slot] = itemId;
    if (previous) this.add(previous, 1, 'unequip');
    this.emitter?.emit('equipment-changed', { charId, kind, slot, itemId, previous, def });
    return { ok: true, previous };
  }

  /** Equipped item definitions for a character. */
  equipped(charId: any) {
    const rack = this.equipment[charId];
    if (!rack) return { weapon: [], accessory: [] };
    return {
      weapon: rack.weapon.map((id: any) => (id ? ITEMS[id] : null)),
      accessory: rack.accessory.map((id: any) => (id ? ITEMS[id] : null)),
    };
  }

  /**
   * Fold a character's equipment into a `Stats.gear` modifier bucket.
   * Weapon attack uses the *strongest* equipped weapon (you swing one at a
   * time) while accessories all stack.
   */
  modsFor(charId: string) {
    const mods = emptyMods();
    const rack = this.equipment[charId];
    if (!rack) return mods;
    let bestAttack = 0;
    for (const id of rack.weapon) {
      const def = id ? ITEMS[id] : null;
      if (!def) continue;
      bestAttack = Math.max(bestAttack, def.attack || 0);
      addMods(mods, def.mods);
    }
    mods.attack += bestAttack;
    for (const id of rack.accessory) {
      const def = id ? ITEMS[id] : null;
      if (!def) continue;
      addMods(mods, def.mods);
    }
    return mods;
  }

  /** Tags contributed by everything a character has on (e.g. 'status-immune'). */
  tagsFor(charId: any) {
    const tags = new Set();
    const rack = this.equipment[charId];
    if (!rack) return tags;
    for (const list of [rack.weapon, rack.accessory]) {
      for (const id of list) for (const t of (id ? ITEMS[id]?.tags || [] : [])) tags.add(t);
    }
    return tags;
  }

  /* -- Shops ------------------------------------------------------------- */

  /**
   * Everything the party could sell right now. Empty array means the shop
   * clerk gets to say "you have nothing to sell".
   * @param [categories] restrict to certain categories
   */
  sellable(categories: string[] = ['treasure', 'catalyst', 'ingredient', 'weapon', 'accessory', 'curative']) {
    return this.list()
      .filter((e) => categories.includes(e.def.category) && e.def.sell > 0 && !e.def.tags.includes('royal'))
      .map((e) => ({ ...e, unitPrice: this.sellPrice(e.id), total: this.sellPrice(e.id) * e.count }));
  }

  /** Gil paid for one unit, including the Bargain Hunter bonus. */
  sellPrice(id: any) {
    const def = ITEMS[id];
    if (!def) return 0;
    return Math.round((def.sell || 0) * (1 + this.sellBonus));
  }

  /** True when there is literally nothing worth money in the bag. */
  get hasNothingToSell() { return this.sellable().length === 0; }

  /**
   * Sell items.
   */
  sell(id: any, n = 1): {ok:boolean, reason?:string, gil?:number} {
    const def = ITEMS[id];
    if (!def) return { ok: false, reason: 'unknown-item' };
    if (def.sell <= 0 || def.category === 'key') return { ok: false, reason: 'not-sellable' };
    if (!this.has(id, n)) return { ok: false, reason: 'not-enough' };
    this.remove(id, n);
    const gil = this.sellPrice(id) * n;
    this.addGil(gil, 'sale');
    return { ok: true, gil };
  }

  /**
   * Buy items from a shop's stock list.
   * @param [n=1]
   */
  buy(id: string, n: number = 1) {
    const def = ITEMS[id];
    if (!def) return { ok: false, reason: 'unknown-item' };
    if (!def.price) return { ok: false, reason: 'not-for-sale' };
    const cost = def.price * n;
    if (this.gil < cost) return { ok: false, reason: 'not-enough-gil', cost };
    const taken = this.add(id, n, 'shop');
    if (taken < n) { this.remove(id, taken); return { ok: false, reason: 'no-room' }; }
    this.spendGil(cost);
    return { ok: true, cost };
  }

  /* -- Serialisation ----------------------------------------------------- */

  toJSON() { return { bag: { ...this.bag }, gil: this.gil, equipment: this.equipment, sellBonus: this.sellBonus }; }

  static fromJSON(data: any, emitter: any = null) {
    const inv = new Inventory(emitter);
    if (!data) return inv;
    for (const id of Object.keys(data.bag || {})) if (ITEMS[id]) inv.bag[id] = data.bag[id];
    inv.gil = data.gil || 0;
    inv.sellBonus = data.sellBonus || 0;
    for (const c of Object.keys(inv.equipment)) {
      const src = data.equipment?.[c];
      if (!src) continue;
      for (const kind of ['weapon', 'accessory']) {
        const arr = src[kind] || [];
        for (let i = 0; i < inv.equipment[c][kind].length; i++) {
          inv.equipment[c][kind][i] = ITEMS[arr[i]] ? arr[i] : null;
        }
      }
    }
    return inv;
  }
}

/* ------------------------------------------------------------------------ */
/* Shop stock lists                                                          */
/* ------------------------------------------------------------------------ */

/** Named shops with their stock, used by outposts and the UI's shop screen. */
export const SHOPS = {
  hammerhead: {
    name: 'Hammerhead — Takka\'s Pit Stop',
    stock: ['potion', 'hi_potion', 'antidote', 'gold_needle', 'phoenix_down', 'iron_sword', 'bronze_spear', 'handgun', 'buckler', 'bronze_bangle', 'lucian_tomato', 'leiden_pepper', 'leiden_potato'],
  },
  longwythe: {
    name: 'Longwythe Rest Area',
    stock: ['potion', 'hi_potion', 'remedy', 'phoenix_down', 'hardedge', 'plunderers', 'silver_bangle', 'power_wristband', 'anak_meat', 'wild_onion'],
  },
  lestallum: {
    name: 'Lestallum Marketplace',
    stock: ['hi_potion', 'mega_potion', 'elixir', 'remedy', 'ether', 'rune_saber', 'partisan', 'orichalcum_dirk', 'quicksilver', 'kite_shield', 'gold_bangle', 'circlet', 'ruby_bracelet', 'sapphire_bracelet', 'topaz_bracelet', 'garula_tenderloin', 'saxham_rice', 'cleigne_wheat', 'kettier_ginger'],
  },
  galdin: {
    name: 'Galdin Quay — Coernix Station',
    stock: ['hi_potion', 'mega_potion', 'hi_elixir', 'blazefire', 'drain_sword', 'iron_duke', 'dragoon_lance', 'valiant', 'black_hood', 'talisman', 'alstor_trout', 'cleigne_darkshell', 'aegir_root'],
  },
  meldacio: {
    name: 'Meldacio Hunter HQ',
    stock: ['mega_potion', 'megalixir', 'remedy', 'mega_ether', 'apocalypse', 'balmung', 'zwill_crossblades', 'death_penalty', 'flesh_harvester', 'circular_saw', 'platinum_bangle', 'sages_stone', 'obsidian_torque', 'champions_anklet', 'basilisk_ribs', 'ulwaat_berries'],
  },
};

export default Inventory;
