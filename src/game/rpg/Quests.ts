/**
 * Quest engine: main-story chapters, side quests and bounty hunts.
 *
 * A quest is a small state machine — `locked -> available -> active ->
 * complete` (with `failed` for timed or escort failures) — over a list of
 * objectives. Objectives are data-driven: kill, fetch, reach, talk, escort,
 * photo, craft and rest. Gameplay code never has to know what a quest is; it
 * just calls `quests.notify('kill', { enemy: 'sabertusk' })` and the log works
 * out what that means.
 *
 * Every objective can carry a world-space waypoint so the HUD can draw a
 * marker without any extra bookkeeping.
 */

/* ------------------------------------------------------------------------ */
/* Regions & tipsters                                                        */
/* ------------------------------------------------------------------------ */

export const REGIONS = {
  leide:    { name: 'Leide',    desc: 'Red-ochre badlands and long empty highway.' },
  duscae:   { name: 'Duscae',   desc: 'Humid green lowlands under the Meteor\'s glow.' },
  cleigne:  { name: 'Cleigne',  desc: 'Rolling farmland and the road to Altissia.' },
  insomnia: { name: 'Insomnia', desc: 'The Crown City, and what is left of it.' },
};

/** Tipsters who hand out hunts, and the tome each one keeps. */
export const TIPSTERS = {
  takka:    { id: 'takka',    name: 'Takka',      place: 'Hammerhead',        region: 'leide',   tome: 'Leide Bounty Ledger' },
  longwythe:{ id: 'longwythe',name: 'Kimya',      place: 'Longwythe Rest Area', region: 'leide', tome: 'Leide Bounty Ledger' },
  prairie:  { id: 'prairie',  name: 'Old Lestif', place: 'Prairie Outpost',   region: 'duscae',  tome: 'Duscae Bounty Ledger' },
  lestallum:{ id: 'lestallum',name: 'Tony',       place: 'Surgate\'s Beanmine', region: 'duscae',tome: 'Duscae Bounty Ledger' },
  meldacio: { id: 'meldacio', name: 'Ezma',       place: 'Meldacio Hunter HQ',region: 'cleigne', tome: 'Meldacio Master Tome' },
  galdin:   { id: 'galdin',   name: 'Coctura',    place: 'Galdin Quay',       region: 'leide',   tome: 'Coastal Bounty Ledger' },
};

/** Hunt rank -> display and payout scaling. FFXV goes to ten stars. */
export const HUNT_RANKS = {
  1:  { stars: '★',           name: 'Rank 1',  gilMult: 1.0,  hunterPoints: 1 },
  2:  { stars: '★★',          name: 'Rank 2',  gilMult: 1.8,  hunterPoints: 2 },
  3:  { stars: '★★★',         name: 'Rank 3',  gilMult: 3.0,  hunterPoints: 4 },
  4:  { stars: '★★★★',        name: 'Rank 4',  gilMult: 5.0,  hunterPoints: 7 },
  5:  { stars: '★★★★★',       name: 'Rank 5',  gilMult: 8.0,  hunterPoints: 12 },
  6:  { stars: '★★★★★★',      name: 'Rank 6',  gilMult: 12.0, hunterPoints: 18 },
  8:  { stars: '★★★★★★★★',    name: 'Rank 8',  gilMult: 22.0, hunterPoints: 30 },
  10: { stars: '★★★★★★★★★★',  name: 'Rank 10', gilMult: 40.0, hunterPoints: 60 },
};

/* ------------------------------------------------------------------------ */
/* Objective helpers                                                         */
/* ------------------------------------------------------------------------ */

const kill  = (id: any, target: any, count: any, desc: any, waypoint: any) => ({ id, type: 'kill', target, count, desc, waypoint });
const fetch_= (id: any, target: any, count: any, desc: any, waypoint: any) => ({ id, type: 'fetch', target, count, desc, waypoint });
const reach = (id: any, target: any, desc: any, waypoint: any, radius = 12) => ({ id, type: 'reach', target, count: 1, desc, waypoint, radius });
const talk  = (id: any, target: any, desc: any, waypoint: any) => ({ id, type: 'talk', target, count: 1, desc, waypoint });
const photo = (id: any, target: any, count: any, desc: any, waypoint: any) => ({ id, type: 'photo', target, count, desc, waypoint });
const escort= (id: any, target: any, desc: any, waypoint: any) => ({ id, type: 'escort', target, count: 1, desc, waypoint, failable: true });
const craft = (id: any, target: any, count: any, desc: any) => ({ id, type: 'craft', target, count, desc });
const rest  = (id: any, desc: any, waypoint: any) => ({ id, type: 'rest', target: 'any', count: 1, desc, waypoint });

/* ------------------------------------------------------------------------ */
/* The quest table                                                           */
/* ------------------------------------------------------------------------ */

/**
 * @typedef {object} Quest
 * @property {string} id
 * @property {'main'|'side'|'hunt'} type
 * @property {string} name
 * @property {number} level  recommended party level
 * @property {string[]} requires  quest ids that must be complete first
 */

const QUEST_TABLE: Quest[] = [
  /* ----------------------------- main story ---------------------------- */
  {
    id: 'main_ch1_departure', type: 'main', chapter: 1, name: 'Departure',
    region: 'leide', level: 1, giver: 'Regis', requires: [], autoAvailable: true,
    summary: 'The Regalia has broken down on the highway out of Insomnia. Push it to Hammerhead.',
    objectives: [
      reach('push', 'hammerhead', 'Push the Regalia to Hammerhead', [8, 0, -102], 20),
      talk('cindy', 'cindy', 'Speak to Cindy about repairs', [12, 0, -108]),
    ],
    rewards: { gil: 0, exp: 300, ap: 5, items: [{ id: 'potion', count: 3 }] },
  },
  {
    id: 'main_ch1_pauper', type: 'main', chapter: 1, name: 'The Pauper Prince',
    region: 'leide', level: 2, giver: 'Cid', requires: ['main_ch1_departure'],
    summary: 'Repairs cost gil the prince does not have. Take a bounty and earn it.',
    objectives: [
      talk('tipster', 'takka', 'Ask Takka about hunting work', [16, 0, -110]),
      { id: 'bounty', type: 'quest', target: 'hunt_killer_wasps', count: 1, desc: 'Complete any bounty' },
      fetch_('gil', 'gil:1500', 1, 'Earn 1,500 gil for the repairs'),
    ],
    rewards: { gil: 0, exp: 600, ap: 8, items: [{ id: 'hi_potion', count: 2 }], unlocks: ['regalia'] },
  },
  {
    id: 'main_ch2_galdin', type: 'main', chapter: 2, name: 'No Turning Back',
    region: 'leide', level: 4, giver: 'Ignis', requires: ['main_ch1_pauper'],
    summary: 'Drive south to Galdin Quay and take the ferry to Altissia. Nothing goes to plan.',
    objectives: [
      reach('galdin', 'galdin_quay', 'Drive to Galdin Quay', [210, 0, 262], 25),
      talk('dino', 'dino', 'Speak to Dino at the pier', [214, 0, 268]),
      rest('sleep', 'Stay the night at the Quay', [212, 0, 266]),
    ],
    rewards: { gil: 500, exp: 1400, ap: 12, items: [{ id: 'debased_coin', count: 5 }] },
  },
  {
    id: 'main_ch3_openworld', type: 'main', chapter: 3, name: 'The Open World',
    region: 'leide', level: 8, giver: 'Cor', requires: ['main_ch2_galdin'],
    summary: 'Insomnia has fallen. Cor Leonis leads you to the tomb of the Wise.',
    objectives: [
      reach('trench', 'keycatrich_trench', 'Meet Cor at Keycatrich Trench', [-158, 0, -138], 20),
      kill('mts', 'magitek_trooper', 8, 'Clear the imperial patrol', [-160, 0, -142]),
      fetch_('sword', 'sword_wise', 1, 'Claim the Sword of the Wise', [-166, 0, -150]),
    ],
    rewards: { gil: 1200, exp: 4000, ap: 25, items: [{ id: 'sword_wise', count: 1 }], unlocks: ['armiger'] },
  },
  {
    id: 'main_ch3_deadeye', type: 'main', chapter: 3, name: 'A Behemoth Undying',
    region: 'duscae', level: 14, giver: 'Dave', requires: ['main_ch3_openworld'],
    summary: 'Deadeye has been killing hunters in Duscae for years. Finish it.',
    objectives: [
      talk('dave', 'dave', 'Take the job from Dave', [-88, 0, 58]),
      reach('trail', 'deadeye_trail', 'Follow the trail into the Nebulawood', [-120, 0, 96], 18),
      kill('deadeye', 'deadeye', 1, 'Slay Deadeye', [-134, 0, 112]),
    ],
    rewards: { gil: 4000, exp: 9000, ap: 40, items: [{ id: 'behemoth_horn', count: 2 }, { id: 'hi_elixir', count: 1 }], unlocks: ['chocobo_rental'] },
  },
  {
    id: 'main_ch4_lestallum', type: 'main', chapter: 4, name: 'Living Legend',
    region: 'duscae', level: 18, giver: 'Iris', requires: ['main_ch3_deadeye'],
    summary: 'Reach Lestallum, see the Meteor of the Six, and find Iris Amicitia.',
    objectives: [
      reach('lestallum', 'lestallum', 'Drive to Lestallum', [-40, 0, 200], 30),
      talk('iris', 'iris', 'Find Iris at the Leville', [-44, 0, 206]),
      photo('meteor', 'meteor', 1, 'Let Prompto photograph the Meteor', [-52, 0, 214]),
    ],
    rewards: { gil: 2000, exp: 7000, ap: 30, items: [{ id: 'circlet', count: 1 }] },
  },
  {
    id: 'main_ch5_titan', type: 'main', chapter: 5, name: 'Dark Clouds',
    region: 'duscae', level: 25, giver: 'Ignis', requires: ['main_ch4_lestallum'],
    summary: 'The Archaean stirs beneath the Disc of Cauthess. Answer the summons.',
    objectives: [
      reach('disc', 'disc_of_cauthess', 'Descend into the Disc of Cauthess', [-320, 0, 180], 30),
      kill('titan', 'titan', 1, 'Endure the Archaean\'s trial', [-326, 0, 188]),
    ],
    rewards: { gil: 8000, exp: 26000, ap: 80, items: [{ id: 'meteorshard', count: 1 }, { id: 'megalixir', count: 1 }], unlocks: ['titan'] },
  },

  /* ------------------------------- hunts -------------------------------- */
  {
    id: 'hunt_killer_wasps', type: 'hunt', name: 'Killer Wasp Nest',
    region: 'leide', level: 3, rank: 1, tipster: 'takka', requires: [], autoAvailable: true,
    target: 'Killer Wasps', timeOfDay: 'day',
    summary: 'A nest has gone up beside the Longwythe road and the truckers are complaining.',
    objectives: [kill('wasps', 'killer_wasp', 8, 'Exterminate the Killer Wasps', [58, 0, -60])],
    rewards: { gil: 800, exp: 900, ap: 15, items: [{ id: 'potion', count: 3 }, { id: 'venom_fang', count: 2 }] },
  },
  {
    id: 'hunt_sabertusks', type: 'hunt', name: 'Fangs of the Wasteland',
    region: 'leide', level: 5, rank: 1, tipster: 'longwythe', requires: [], autoAvailable: true,
    target: 'Sabertusk Pack', timeOfDay: 'any',
    summary: 'A pack has taken to running down anything on two legs between the outposts.',
    objectives: [kill('tusks', 'sabertusk', 12, 'Cull the Sabertusk pack', [96, 0, 22])],
    rewards: { gil: 1100, exp: 1400, ap: 15, items: [{ id: 'sabertusk_fang', count: 3 }, { id: 'hi_potion', count: 2 }] },
  },
  {
    id: 'hunt_dualhorn', type: 'hunt', name: 'Beasts of Burden',
    region: 'leide', level: 8, rank: 2, tipster: 'takka', requires: ['hunt_killer_wasps'],
    target: 'Dualhorns', timeOfDay: 'day',
    summary: 'Dualhorns have wandered onto the grazing land and will not be moved politely.',
    objectives: [kill('dualhorns', 'dualhorn', 4, 'Drive off the Dualhorns', [-30, 0, -40])],
    rewards: { gil: 2200, exp: 3200, ap: 15, items: [{ id: 'dualhorn_steak', count: 2 }, { id: 'silver_bangle', count: 1 }] },
  },
  {
    id: 'hunt_voretooth', type: 'hunt', name: 'Bloodthirsty Beasts',
    region: 'duscae', level: 11, rank: 2, tipster: 'prairie', requires: [],
    target: 'Voretooth Pack', timeOfDay: 'any',
    summary: 'Something is taking the Prairie Outpost\'s goats. It is not subtle about it.',
    objectives: [kill('vore', 'voretooth', 10, 'Hunt down the Voretooth pack', [-104, 0, 74])],
    rewards: { gil: 2800, exp: 4200, ap: 15, items: [{ id: 'voretooth_tail', count: 3 }, { id: 'debased_silver', count: 4 }] },
  },
  {
    id: 'hunt_garulessa', type: 'hunt', name: 'The Matron\'s Wrath',
    region: 'duscae', level: 16, rank: 3, tipster: 'prairie', requires: ['hunt_voretooth'],
    target: 'Garulessa', timeOfDay: 'day',
    summary: 'A matriarch garula has flattened two fences and one hunter.',
    objectives: [
      reach('field', 'garula_field', 'Reach the grazing grounds', [-140, 0, 130], 18),
      kill('garulessa', 'garulessa', 1, 'Bring down the Garulessa', [-146, 0, 136]),
    ],
    rewards: { gil: 5200, exp: 8000, ap: 15, items: [{ id: 'garula_fur', count: 3 }, { id: 'garula_tenderloin', count: 2 }] },
  },
  {
    id: 'hunt_coeurl', type: 'hunt', name: 'Whiskers of Doom',
    region: 'duscae', level: 22, rank: 4, tipster: 'lestallum', requires: ['hunt_garulessa'],
    target: 'Coeurl', timeOfDay: 'any',
    summary: 'It kills with its whiskers. Do not let it look at you for too long.',
    objectives: [kill('coeurl', 'coeurl', 2, 'Slay the coeurls', [-190, 0, 240])],
    rewards: { gil: 9000, exp: 15000, ap: 15, items: [{ id: 'coeurl_whiskers', count: 3 }, { id: 'topaz_bracelet', count: 1 }] },
  },
  {
    id: 'hunt_mesmenir', type: 'hunt', name: 'Nightmare on the Moors',
    region: 'cleigne', level: 26, rank: 4, tipster: 'meldacio', requires: [],
    target: 'Mesmenir', timeOfDay: 'night',
    summary: 'A spectral steed runs the moors after dark. Riders have not come back.',
    objectives: [kill('mesmenir', 'mesmenir', 3, 'Destroy the Mesmenir herd', [-240, 0, 300])],
    rewards: { gil: 12000, exp: 19000, ap: 15, items: [{ id: 'mesmenir_mane', count: 2 }, { id: 'sages_stone', count: 1 }] },
  },
  {
    id: 'hunt_zu', type: 'hunt', name: 'Tyrant of the Skies',
    region: 'cleigne', level: 32, rank: 5, tipster: 'meldacio', requires: ['hunt_coeurl'],
    target: 'Zu', timeOfDay: 'day',
    summary: 'It carries off chocobos. Whole ones.',
    objectives: [
      reach('cliff', 'zu_cliff', 'Climb to the nesting cliff', [-300, 0, 360], 20),
      kill('zu', 'zu', 1, 'Bring the Zu down', [-306, 0, 368]),
    ],
    rewards: { gil: 22000, exp: 34000, ap: 15, items: [{ id: 'zu_beak', count: 2 }, { id: 'griffon_feather', count: 2 }] },
  },
  {
    id: 'hunt_naga', type: 'hunt', name: 'The Weeping Woman',
    region: 'cleigne', level: 38, rank: 5, tipster: 'meldacio', requires: ['hunt_mesmenir'],
    target: 'Naga', timeOfDay: 'night', daemon: true,
    summary: 'She was somebody\'s mother once. She only comes out after dark.',
    objectives: [kill('naga', 'naga', 1, 'Put the Naga to rest', [-280, 0, 420])],
    rewards: { gil: 30000, exp: 46000, ap: 15, items: [{ id: 'naga_nail', count: 2 }, { id: 'obsidian_torque', count: 1 }] },
  },
  {
    id: 'hunt_iron_giant', type: 'hunt', name: 'Steel Colossus',
    region: 'cleigne', level: 45, rank: 6, tipster: 'meldacio', requires: ['hunt_naga'],
    target: 'Iron Giant', timeOfDay: 'night', daemon: true,
    summary: 'Three of them, and they only rise when the sun is gone.',
    objectives: [kill('giants', 'iron_giant', 3, 'Destroy the Iron Giants', [-330, 0, 460])],
    rewards: { gil: 48000, exp: 78000, ap: 15, items: [{ id: 'rotten_splinterbone', count: 5 }, { id: 'platinum_bangle', count: 1 }] },
  },
  {
    id: 'hunt_bandersnatch', type: 'hunt', name: 'Beware the Bandersnatch',
    region: 'cleigne', level: 52, rank: 6, tipster: 'meldacio', requires: ['hunt_zu'],
    target: 'Bandersnatch', timeOfDay: 'any',
    summary: 'Faster than a chocobo, meaner than a coeurl.',
    objectives: [kill('bander', 'bandersnatch', 1, 'Run down the Bandersnatch', [-360, 0, 500])],
    rewards: { gil: 60000, exp: 96000, ap: 15, items: [{ id: 'bandersnatch_fur', count: 2 }, { id: 'champions_anklet', count: 1 }] },
  },
  {
    id: 'hunt_adamantoise', type: 'hunt', name: 'Lonely Rumblings in Longwythe',
    region: 'leide', level: 99, rank: 10, tipster: 'longwythe', requires: ['hunt_bandersnatch'],
    target: 'Adamantoise', timeOfDay: 'any',
    summary: 'The tremors under Longwythe Peak are not an earthquake. They are a footstep.',
    objectives: [
      reach('peak', 'longwythe_peak', 'Climb Longwythe Peak', [136, 0, 92], 30),
      kill('toise', 'adamantoise', 1, 'Defeat the Adamantoise'),
    ],
    rewards: { gil: 500000, exp: 900000, ap: 15, items: [{ id: 'adamantite', count: 3 }, { id: 'ribbon', count: 1 }] },
  },

  /* ----------------------------- side quests ---------------------------- */
  {
    id: 'side_engine_blade', type: 'side', name: 'A Better Engine Blade',
    region: 'leide', level: 3, giver: 'Cid Sophiar', requires: ['main_ch1_departure'],
    summary: 'Cid can improve the Engine Blade if you bring him something worth melting down.',
    objectives: [
      fetch_('scrap', 'rusted_bit', 3, 'Collect Rusted Bits from the wastes'),
      talk('cid', 'cid', 'Bring them to Cid at Hammerhead', [14, 0, -106]),
    ],
    rewards: { gil: 0, exp: 800, ap: 10, items: [{ id: 'rune_saber', count: 1 }] },
  },
  {
    id: 'side_meat_magnificent', type: 'side', name: 'A Meat Most Magnificent',
    region: 'leide', level: 6, giver: 'Takka', requires: ['main_ch1_pauper'],
    summary: 'Takka wants a cut of dualhorn for the diner\'s special.',
    objectives: [
      kill('hunt', 'dualhorn', 2, 'Hunt a pair of Dualhorns', [-28, 0, -44]),
      fetch_('steak', 'dualhorn_steak', 2, 'Recover the steaks'),
      talk('takka', 'takka', 'Deliver them to Takka', [16, 0, -110]),
    ],
    rewards: { gil: 1500, exp: 1200, ap: 10, items: [{ id: 'hi_potion', count: 3 }], recipes: ['bulette_steak'] },
  },
  {
    id: 'side_dog_tags', type: 'side', name: 'The Fading Hunter',
    region: 'leide', level: 7, giver: 'Dave', requires: ['main_ch2_galdin'],
    summary: 'Dave has lost another friend out past the Prairie. He wants the dog tag back.',
    objectives: [
      reach('site', 'crash_site', 'Search the ravine east of Longwythe', [124, 0, 60], 15),
      fetch_('tag', 'rusted_bit', 1, 'Recover the hunter\'s dog tag'),
      talk('dave', 'dave', 'Return the tag to Dave', [-88, 0, 58]),
    ],
    rewards: { gil: 900, exp: 1600, ap: 10, items: [{ id: 'debased_banknote', count: 2 }] },
  },
  {
    id: 'side_nice_shot', type: 'side', name: 'Nice Shot',
    region: 'duscae', level: 10, giver: 'Prompto', requires: ['main_ch3_openworld'],
    summary: 'Prompto wants three photographs he can actually be proud of.',
    objectives: [
      photo('vista', 'vista', 1, 'Photograph a Duscae vista at golden hour', [-100, 0, 140]),
      photo('beast', 'beast', 1, 'Photograph a beast mid-battle'),
      photo('party', 'party', 1, 'Photograph all four of you at camp'),
    ],
    rewards: { gil: 600, exp: 2000, ap: 20, items: [{ id: 'quicksilver', count: 1 }] },
  },
  {
    id: 'side_scraps', type: 'side', name: 'Scraps of Mystery',
    region: 'leide', level: 9, giver: 'Sania', requires: ['main_ch2_galdin'],
    summary: 'Five torn map fragments. Assemble them and something buried turns up.',
    objectives: [fetch_('scraps', 'old_book', 5, 'Find all five map scraps')],
    rewards: { gil: 3000, exp: 2600, ap: 10, items: [{ id: 'rare_coin', count: 1 }, { id: 'sages_stone', count: 1 }] },
  },
  {
    id: 'side_elemancy_lesson', type: 'side', name: 'Power in Numbers',
    region: 'leide', level: 5, giver: 'Ignis', requires: ['main_ch1_pauper'],
    summary: 'Ignis walks you through drawing energy and folding a catalyst into a flask.',
    objectives: [
      { id: 'draw', type: 'draw', target: 'fire', count: 20, desc: 'Draw 20 units of fire energy', waypoint: [42, 0, -118] },
      craft('craft', 'any', 1, 'Craft your first spell'),
    ],
    rewards: { gil: 0, exp: 900, ap: 12, items: [{ id: 'magitek_booster', count: 4 }] },
  },
  {
    id: 'side_chocobo', type: 'side', name: 'The Ever Elusive Chocobo',
    region: 'duscae', level: 15, giver: 'Wiz', requires: ['main_ch3_deadeye'],
    summary: 'With Deadeye dead the chocobos will come back — if you walk one home first.',
    objectives: [
      talk('wiz', 'wiz', 'Speak to Wiz at the chocobo post', [-70, 0, 120]),
      escort('escort', 'chocobo', 'Escort the chocobo back to the post', [-92, 0, 148]),
    ],
    rewards: { gil: 1800, exp: 3400, ap: 20, items: [{ id: 'chocobo_whistle', count: 1 }, { id: 'sylkis_greens', count: 3 }] },
  },
  {
    id: 'side_power_play', type: 'side', name: 'Power Play',
    region: 'duscae', level: 20, giver: 'Holly', requires: ['main_ch4_lestallum'],
    summary: 'The Exineris plant is losing pressure and Holly suspects sabotage.',
    objectives: [
      talk('holly', 'holly', 'Meet Holly at the power plant', [-46, 0, 210]),
      kill('mts', 'magitek_trooper', 12, 'Clear the intruders from the substation', [-58, 0, 226]),
      fetch_('relay', 'imperial_relay', 1, 'Recover the imperial relay unit'),
    ],
    rewards: { gil: 6000, exp: 9000, ap: 20, items: [{ id: 'magitek_suit', count: 1 }] },
  },
  {
    id: 'side_legendary_fish', type: 'side', name: 'The One That Got Away',
    region: 'duscae', level: 18, giver: 'Navyth', requires: ['main_ch4_lestallum'],
    summary: 'Navyth has been after the Alstor trout for eleven years. He is not proud.',
    objectives: [
      reach('pier', 'alstor_pier', 'Find Navyth at the Alstor Slough pier', [-20, 0, 300], 12),
      { id: 'catch', type: 'fish', target: 'alstor_trout', count: 1, desc: 'Land the Alstor Slough trout' },
    ],
    rewards: { gil: 2400, exp: 5200, ap: 20, items: [{ id: 'alstor_trout', count: 2 }], recipes: ['sea_bass_meuniere'] },
  },
  {
    id: 'side_gemstone_run', type: 'side', name: 'Gemstone Errand',
    region: 'cleigne', level: 24, giver: 'Randolph', requires: ['main_ch4_lestallum'],
    summary: 'A Lestallum smith needs a sky gemstone and will not go and get one himself.',
    objectives: [
      fetch_('gem', 'sky_gemstone', 2, 'Recover two sky gemstones'),
      talk('smith', 'randolph', 'Deliver them to Randolph', [-42, 0, 204]),
    ],
    rewards: { gil: 5000, exp: 6800, ap: 20, items: [{ id: 'ulrics_kukris', count: 1 }] },
  },
  {
    id: 'side_camp_cook', type: 'side', name: 'The Cook\'s Apprentice',
    region: 'duscae', level: 12, giver: 'Ignis', requires: ['main_ch3_openworld'],
    summary: 'Ignis wants to try something new. He needs ingredients and a haven.',
    objectives: [
      fetch_('ing', 'lucian_tomato', 3, 'Gather Lucian Tomatoes'),
      fetch_('meat', 'anak_meat', 2, 'Gather Anak Meat'),
      rest('camp', 'Camp at a haven and let Ignis cook'),
    ],
    rewards: { gil: 400, exp: 1800, ap: 15, items: [{ id: 'leiden_pepper', count: 3 }], recipes: ['lasagna_al_forno'] },
  },
];

/** Quest definitions keyed by id. */
export const QUESTS = Object.fromEntries(QUEST_TABLE.map((q) => [q.id, q]));

/** All hunts, for the tipster board UI. */
export const HUNTS = QUEST_TABLE.filter((q) => q.type === 'hunt');

/* ------------------------------------------------------------------------ */
/* Quest log                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Live quest state. Emits `quest-updated` for every transition and objective
 * tick, with `{ quest, status, phase, objective? }`.
 */
export class QuestLog {
  emitter!: any;
  flags!: Set<any>;
  hunterPoints!: number;
  constructor(emitter: import('./Emitter.ts').Emitter = null) {
    this.emitter = emitter;
    /** @type {Record<string, object>} runtime state per quest id */
    this.states = {};
    for (const q of QUEST_TABLE) {
      this.states[q.id] = {
        id: q.id,
        status: q.autoAvailable ? 'available' : 'locked',
        objectives: q.objectives.map((o: any) => ({ id: o.id, progress: 0, done: false })),
      };
    }
    /** The quest whose waypoint the compass points at. */
    this.tracked = null;
    /** Hunter rank points, earned from hunts. */
    this.hunterPoints = 0;
    /** Arbitrary story flags other systems can set and quests can require. */
    this.flags = new Set();
    this.refresh();
  }

  /** Definition lookup. */
  def(id: any) { return QUESTS[id] || null; }
  /** Runtime state lookup. */
  state(id: any) { return this.states[id] || null; }
  /** Status string for a quest. */
  status(id: any) { return this.states[id]?.status || 'unknown'; }

  /** Recompute which locked quests have become available. */
  refresh() {
    for (const q of QUEST_TABLE) {
      const st = this.states[q.id];
      if (st.status !== 'locked') continue;
      const ready = (q.requires || []).every((r: any) => this.states[r]?.status === 'complete');
      const flagsOk = (q.requiresFlags || []).every((f: any) => this.flags.has(f));
      if (ready && flagsOk) {
        st.status = 'available';
        this.emitter?.emit('quest-updated', { quest: q, status: 'available', phase: 'available' });
      }
    }
  }

  /** Set a story flag and re-evaluate availability. */
  setFlag(flag: any) { this.flags.add(flag); this.refresh(); }

  /** Quests in a given status, hydrated with their definitions. */
  byStatus(status: any) {
    return QUEST_TABLE.filter((q) => this.states[q.id].status === status)
      .map((q) => this.view(q.id));
  }

  /** Everything the UI needs to draw one quest. */
  view(id: any) {
    const q = QUESTS[id];
    const st = this.states[id];
    if (!q || !st) return null;
    return {
      ...q,
      status: st.status,
      rank: q.rank ? { ...HUNT_RANKS[q.rank], rank: q.rank } : null,
      tipster: q.tipster ? TIPSTERS[q.tipster] : null,
      objectives: q.objectives.map((o: any, i: any) => ({
        ...o,
        progress: st.objectives[i].progress,
        done: st.objectives[i].done,
        label: `${o.desc}${o.count > 1 ? ` (${st.objectives[i].progress}/${o.count})` : ''}`,
      })),
      progress: st.objectives.filter((o: any) => o.done).length / Math.max(1, st.objectives.length),
    };
  }

  /** Every quest currently in progress. */
  get active() { return this.byStatus('active'); }
  /** Every quest that can be accepted right now. */
  get available() { return this.byStatus('available'); }
  /** Every quest already finished. */
  get completed() { return this.byStatus('complete'); }

  /** Hunts available at one tipster. */
  huntsAt(tipsterId: any) {
    return HUNTS.filter((h) => h.tipster === tipsterId && ['available', 'active'].includes(this.states[h.id].status))
      .map((h) => this.view(h.id));
  }

  /**
   * Accept a quest. Fails if it is not available.
   */
  accept(id: string) {
    const st = this.states[id];
    const q = QUESTS[id];
    if (!st || !q) return { ok: false, reason: 'unknown-quest' };
    if (st.status !== 'available') return { ok: false, reason: `not-available (${st.status})` };
    st.status = 'active';
    st.startedAt = Date.now();
    if (!this.tracked) this.tracked = id;
    this.emitter?.emit('quest-updated', { quest: q, status: 'active', phase: 'accepted' });
    return { ok: true, quest: this.view(id) };
  }

  /** Drop an active quest back to available. */
  abandon(id: any) {
    const st = this.states[id];
    if (!st || st.status !== 'active') return false;
    st.status = 'available';
    st.objectives.forEach((o: any) => { o.progress = 0; o.done = false; });
    if (this.tracked === id) this.tracked = this.active[0]?.id || null;
    this.emitter?.emit('quest-updated', { quest: QUESTS[id], status: 'available', phase: 'abandoned' });
    return true;
  }

  /** Fail a quest (a dead escort, a blown timer). */
  fail(id: any, reason = 'failed') {
    const st = this.states[id];
    if (!st || st.status !== 'active') return false;
    st.status = 'failed';
    this.emitter?.emit('quest-updated', { quest: QUESTS[id], status: 'failed', phase: 'failed', reason });
    return true;
  }

  /** Make the compass point at this quest. */
  track(id: any) {
    if (!this.states[id]) return false;
    this.tracked = id;
    this.emitter?.emit('quest-updated', { quest: QUESTS[id], status: this.states[id].status, phase: 'tracked' });
    return true;
  }

  /**
   * The generic progression hook. Gameplay systems call this and the log works
   * out which active objectives care.
   *
   * @param payload `{ target, count }` — target matches the objective's target
   * @returns the quests that changed
   */
  notify(type: 'kill' | 'fetch' | 'reach' | 'talk' | 'escort' | 'photo' | 'craft' | 'rest' | 'draw' | 'fish' | 'quest', payload: any = {}): any[] {
    const target = payload.target ?? payload.enemy ?? payload.item ?? payload.id ?? 'any';
    const amount = payload.count ?? 1;
    const changed = [];

    for (const q of QUEST_TABLE) {
      const st = this.states[q.id];
      if (st.status !== 'active') continue;
      let touched = false;

      for (let i = 0; i < q.objectives.length; i++) {
        const o = q.objectives[i];
        const os = st.objectives[i];
        if (os.done || o.type !== type) continue;
        // Objectives complete in order: an earlier unfinished objective blocks.
        if (st.objectives.slice(0, i).some((p: any) => !p.done)) continue;
        if (o.target !== 'any' && o.target !== target && !String(o.target).startsWith(`${target}:`)) continue;

        os.progress = Math.min(o.count, os.progress + amount);
        touched = true;
        if (os.progress >= o.count) {
          os.done = true;
          this.emitter?.emit('quest-updated', { quest: q, status: 'active', phase: 'objective', objective: { ...o, ...os } });
        }
      }

      if (touched) {
        changed.push(q.id);
        if (st.objectives.every((o: any) => o.done)) this.complete(q.id);
      }
    }
    return changed.map((id) => this.view(id));
  }

  /** Force an objective complete (debug / cutscene shortcuts). */
  forceObjective(questId: any, objectiveId: any) {
    const q = QUESTS[questId];
    const st = this.states[questId];
    if (!q || !st || st.status !== 'active') return false;
    const i = q.objectives.findIndex((o: any) => o.id === objectiveId);
    if (i < 0) return false;
    st.objectives[i].done = true;
    st.objectives[i].progress = q.objectives[i].count;
    if (st.objectives.every((o: any) => o.done)) this.complete(questId);
    return true;
  }

  /**
   * Mark a quest complete and emit its rewards. RpgSystem listens for the
   * `complete` phase and actually grants them.
   */
  complete(id: any) {
    const st = this.states[id];
    const q = QUESTS[id];
    if (!st || !q || st.status === 'complete') return false;
    st.status = 'complete';
    st.completedAt = Date.now();
    st.objectives.forEach((o: any, i: any) => { o.done = true; o.progress = q.objectives[i].count; });

    const rewards = this.rewardsFor(id);
    if (q.type === 'hunt' && q.rank) this.hunterPoints += HUNT_RANKS[q.rank].hunterPoints;
    if (this.tracked === id) this.tracked = this.active[0]?.id || null;

    this.emitter?.emit('quest-updated', { quest: q, status: 'complete', phase: 'complete', rewards });
    this.refresh();
    // Chained "complete quest X" objectives.
    this.notify('quest', { target: id });
    return true;
  }

  /** Final reward payload, with hunt rank scaling applied. */
  rewardsFor(id: any) {
    const q = QUESTS[id];
    if (!q) return null;
    const r = q.rewards || {};
    const mult = q.type === 'hunt' && q.rank ? HUNT_RANKS[q.rank].gilMult : 1;
    return {
      gil: Math.round((r.gil || 0) * (q.type === 'hunt' ? 1 : 1)),
      exp: r.exp || 0,
      ap: Math.round((r.ap || 0) * (q.type === 'hunt' ? Math.min(3, mult / 2 + 0.5) : 1)),
      items: (r.items || []).slice(),
      recipes: (r.recipes || []).slice(),
      unlocks: (r.unlocks || []).slice(),
      hunterPoints: q.type === 'hunt' && q.rank ? HUNT_RANKS[q.rank].hunterPoints : 0,
    };
  }

  /**
   * Waypoint markers for the HUD: the next unfinished objective of every
   * active quest that has a position.
   */
  waypoints(): Array<{questId:string, name:string, objective:string, pos:number[], tracked:boolean}> {
    const out = [];
    for (const q of QUEST_TABLE) {
      const st = this.states[q.id];
      if (st.status !== 'active') continue;
      const i = st.objectives.findIndex((o: any) => !o.done);
      if (i < 0) continue;
      const o = q.objectives[i];
      if (!o.waypoint) continue;
      out.push({
        questId: q.id, name: q.name, objective: o.desc,
        pos: o.waypoint, radius: o.radius || 8,
        type: q.type, tracked: this.tracked === q.id,
      });
    }
    return out;
  }

  /**
   * Convenience for the world system: call every frame with the player's
   * position and any `reach` objective within range ticks over.
   */
  checkProximity(pos: {x:number, y:number, z:number}) {
    for (const w of this.waypoints()) {
      const st = this.states[w.questId];
      const q = QUESTS[w.questId];
      const i = st.objectives.findIndex((o: any) => !o.done);
      if (i < 0 || q.objectives[i].type !== 'reach') continue;
      const [x, , z] = w.pos;
      const d = Math.hypot(pos.x - x, pos.z - z);
      if (d <= (w.radius || 12)) this.notify('reach', { target: q.objectives[i].target });
    }
  }

  toJSON() {
    return { states: this.states, tracked: this.tracked, hunterPoints: this.hunterPoints, flags: [...this.flags] };
  }

  static fromJSON(data: any, emitter = null) {
    const log = new QuestLog(emitter);
    if (!data) return log;
    for (const id of Object.keys(log.states)) {
      const src = data.states?.[id];
      if (!src) continue;
      log.states[id].status = src.status || log.states[id].status;
      const objs = src.objectives || [];
      log.states[id].objectives.forEach((o: any, i: any) => {
        if (objs[i]) { o.progress = objs[i].progress || 0; o.done = !!objs[i].done; }
      });
      log.states[id].startedAt = src.startedAt;
      log.states[id].completedAt = src.completedAt;
    }
    log.tracked = data.tracked || null;
    log.hunterPoints = data.hunterPoints || 0;
    log.flags = new Set(data.flags || []);
    return log;
  }
}

export default QuestLog;
