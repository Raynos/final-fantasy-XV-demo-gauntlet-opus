import type { Emitter } from './Emitter.ts';
import { worldMap } from '../../world/map/WorldMap.ts';
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

/** A region of Lucis. */
export interface Region {
  name: string;
  desc: string;
}

export const REGIONS = {
  leide:    { name: 'Leide',    desc: 'Red-ochre badlands and long empty highway.' },
  duscae:   { name: 'Duscae',   desc: 'Humid green lowlands under the Meteor\'s glow.' },
  cleigne:  { name: 'Cleigne',  desc: 'Rolling farmland and the road to Altissia.' },
  insomnia: { name: 'Insomnia', desc: 'The Crown City, and what is left of it.' },
} satisfies Record<string, Region>;

/** One of {@link REGIONS}. */
export type RegionId = keyof typeof REGIONS;

/** Someone who hands out bounties, and the tome they keep them in. */
export interface Tipster {
  id: string;
  name: string;
  place: string;
  region: RegionId;
  tome: string;
}

/** Tipsters who hand out hunts, and the tome each one keeps. */
export const TIPSTERS = {
  takka:    { id: 'takka',    name: 'Takka',      place: 'Hammerhead',        region: 'leide',   tome: 'Leide Bounty Ledger' },
  longwythe:{ id: 'longwythe',name: 'Kimya',      place: 'Longwythe Rest Area', region: 'leide', tome: 'Leide Bounty Ledger' },
  prairie:  { id: 'prairie',  name: 'Old Lestif', place: 'Prairie Outpost',   region: 'duscae',  tome: 'Duscae Bounty Ledger' },
  lestallum:{ id: 'lestallum',name: 'Tony',       place: 'Surgate\'s Beanmine', region: 'duscae',tome: 'Duscae Bounty Ledger' },
  meldacio: { id: 'meldacio', name: 'Ezma',       place: 'Meldacio Hunter HQ',region: 'cleigne', tome: 'Meldacio Master Tome' },
  galdin:   { id: 'galdin',   name: 'Coctura',    place: 'Galdin Quay',       region: 'leide',   tome: 'Coastal Bounty Ledger' },
} satisfies Record<string, Tipster>;

/** One of {@link TIPSTERS}. */
export type TipsterId = keyof typeof TIPSTERS;

/** What a hunt rank is worth. */
export interface HuntRankInfo {
  stars: string;
  name: string;
  /** Multiplier folded into the AP payout. */
  gilMult: number;
  hunterPoints: number;
}

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
} satisfies Record<number, HuntRankInfo>;

/** A rank the table actually has an entry for. Note the gaps: no 7 and no 9. */
export type HuntRank = keyof typeof HUNT_RANKS;

/* ------------------------------------------------------------------------ */
/* Objective helpers                                                         */
/* ------------------------------------------------------------------------ */

/**
 * A waypoint, named rather than typed.
 *
 * Every objective's marker used to be a literal triple written against the
 * 3 km world — `[8, 0, -102]` for "push the Regalia to Hammerhead", against a
 * Hammerhead the map puts at `(576, 10)`. The world grew to 8 km and the quest
 * log did not, so the compass pointed into empty desert, the distance the HUD
 * printed was fiction, and no `reach` objective could ever tick over because
 * `checkProximity` measured against a place that is not there.
 *
 * Naming the POI instead means the marker follows the world. If the road moves,
 * the quest moves with it. An unknown id throws at load rather than silently
 * pointing at the origin — a wrong waypoint is exactly the kind of thing that
 * survives for months otherwise.
 */
const at = (poiId: string): number[] => {
  const p = worldMap.poiById(poiId);
  if (!p) throw new Error(`Quests: waypoint anchored to unknown POI "${poiId}"`);
  return [p.x, 0, p.z];
};

const kill  = (id: string, target: string, count: number, desc: string, waypoint?: number[]): Objective => ({ id, type: 'kill', target, count, desc, waypoint });
const fetch_= (id: string, target: string, count: number, desc: string, waypoint?: number[]): Objective => ({ id, type: 'fetch', target, count, desc, waypoint });
const reach = (id: string, target: string, desc: string, waypoint: number[], radius = 12): Objective => ({ id, type: 'reach', target, count: 1, desc, waypoint, radius });
const talk  = (id: string, target: string, desc: string, waypoint: number[]): Objective => ({ id, type: 'talk', target, count: 1, desc, waypoint });
const photo = (id: string, target: string, count: number, desc: string, waypoint?: number[]): Objective => ({ id, type: 'photo', target, count, desc, waypoint });
const escort= (id: string, target: string, desc: string, waypoint: number[]): Objective => ({ id, type: 'escort', target, count: 1, desc, waypoint, failable: true });
const craft = (id: string, target: string, count: number, desc: string): Objective => ({ id, type: 'craft', target, count, desc });
const rest  = (id: string, desc: string, waypoint?: number[]): Objective => ({ id, type: 'rest', target: 'any', count: 1, desc, waypoint });

/* ------------------------------------------------------------------------ */
/* The quest table                                                           */
/* ------------------------------------------------------------------------ */

/**
 */

/**
 * Every event an objective can key off.
 *
 * `cook` is here because `RpgSystem.rest()` posts it when Ignis cooks, and no
 * objective in the table listens for it yet -- so the call is inert rather than
 * wrong. Leaving it out of the union would make the caller a compile error and
 * hide the fact that the hook exists.
 */
export type ObjectiveKind =
  | 'kill' | 'fetch' | 'reach' | 'talk' | 'escort' | 'photo'
  | 'craft' | 'cook' | 'rest' | 'draw' | 'fish' | 'quest';

/** One step of a quest, **as authored**. */
export interface Objective {
  id: string;
  type: ObjectiveKind;
  /**
   * What counts: an enemy key, an item id, a place, a person, or `'any'` for
   * "whatever satisfies the verb". `notify` also matches a `target:qualifier`
   * prefix, which is how `gil:1500` works.
   */
  target: string;
  /** How many of it are needed. */
  count: number;
  /** The line the quest log prints. */
  desc: string;
  /** `[x, y, z]` the compass and the minimap draw a marker at. */
  waypoint?: number[];
  /** `reach` only: how close counts, in metres. */
  radius?: number;
  /** Failing this fails the whole quest -- a dead escort. */
  failable?: boolean;
}

/** What finishing a quest pays out, **as authored**. */
export interface QuestRewards {
  gil?: number;
  exp?: number;
  ap?: number;
  items?: Array<{ id: string, count: number }>;
  /** Recipe ids handed to the cooking system. */
  recipes?: string[];
  /** Story flags set on completion; see `QuestLog.setFlag`. */
  unlocks?: string[];
}

/** Main story, a side quest, or a bounty. */
export type QuestType = 'main' | 'side' | 'hunt';

/** One quest as authored in the table below. */
export interface Quest {
  id: string;
  type: QuestType;
  name: string;
  /** One-line pitch, printed under the title on the quest card. */
  summary: string;
  /** Region id, keying `REGIONS`. */
  region: RegionId;
  /** Recommended party level. */
  level: number;
  /** Quest ids that must be complete first. */
  requires: string[];
  objectives: Objective[];
  rewards?: QuestRewards;
  /** Available from a fresh save, with no prerequisites. */
  autoAvailable?: boolean;
  /** Who hands it over, for the quest card. */
  giver?: string;
  /** `main` only: which chapter it belongs to. */
  chapter?: number;
  /** `hunt` only: star rank, keying `HUNT_RANKS`. */
  rank?: HuntRank;
  /** `hunt` only: the board it is posted on. */
  tipster?: TipsterId;
  /** `hunt` only: the mark, as the board words it. */
  target?: string;
  /** `hunt` only: when the mark is out. */
  timeOfDay?: 'day' | 'night' | 'any';
  /** `hunt` only: the mark is a daemon. The hunt board prints it as a caveat. */
  daemon?: boolean;
  /**
   * Story flags that must be set before this becomes available.
   *
   * `refresh()` honours it, but **no quest in the table sets it** -- so the
   * flags written by `setFlag` (the Astral scene, and every reward `unlocks`)
   * currently gate nothing. The hook is real; nothing has used it yet.
   */
  requiresFlags?: string[];
}

const QUEST_TABLE: Quest[] = [
  /* ----------------------------- main story ---------------------------- */
  {
    id: 'main_ch1_departure', type: 'main', chapter: 1, name: 'Departure',
    region: 'leide', level: 1, giver: 'Regis', requires: [], autoAvailable: true,
    summary: 'The Regalia has broken down on the highway out of Insomnia. Push it to Hammerhead.',
    objectives: [
      reach('push', 'hammerhead', 'Push the Regalia to Hammerhead', at('hammerhead'), 20),
      talk('cindy', 'cindy', 'Speak to Cindy about repairs', at('hammerhead')),
    ],
    rewards: { gil: 0, exp: 300, ap: 5, items: [{ id: 'potion', count: 3 }] },
  },
  {
    id: 'main_ch1_pauper', type: 'main', chapter: 1, name: 'The Pauper Prince',
    region: 'leide', level: 2, giver: 'Cid', requires: ['main_ch1_departure'],
    summary: 'Repairs cost gil the prince does not have. Take a bounty and earn it.',
    objectives: [
      talk('tipster', 'takka', 'Ask Takka about hunting work', at('hammerhead')),
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
      reach('galdin', 'galdin_quay', 'Drive to Galdin Quay', at('galdin_quay'), 25),
      talk('dino', 'dino', 'Speak to Dino at the pier', at('galdin_pier')),
      rest('sleep', 'Stay the night at the Quay', at('galdin_quay')),
    ],
    rewards: { gil: 500, exp: 1400, ap: 12, items: [{ id: 'debased_coin', count: 5 }] },
  },
  {
    id: 'main_ch3_openworld', type: 'main', chapter: 3, name: 'The Open World',
    region: 'leide', level: 8, giver: 'Cor', requires: ['main_ch2_galdin'],
    summary: 'Insomnia has fallen. Cor Leonis leads you to the tomb of the Wise.',
    objectives: [
      reach('trench', 'keycatrich_trench', 'Meet Cor at Keycatrich Trench', at('keycatrich_trench'), 20),
      kill('mts', 'magitek_trooper', 8, 'Clear the imperial patrol', at('keycatrich_ruins')),
      fetch_('sword', 'sword_wise', 1, 'Claim the Sword of the Wise', at('tomb_wise')),
    ],
    rewards: { gil: 1200, exp: 4000, ap: 25, items: [{ id: 'sword_wise', count: 1 }], unlocks: ['armiger'] },
  },
  {
    id: 'main_ch3_deadeye', type: 'main', chapter: 3, name: 'A Behemoth Undying',
    region: 'duscae', level: 14, giver: 'Dave', requires: ['main_ch3_openworld'],
    summary: 'Deadeye has been killing hunters in Duscae for years. Finish it.',
    objectives: [
      talk('dave', 'dave', 'Take the job from Dave', at('longwythe_rest')),
      reach('trail', 'deadeye_trail', 'Follow the trail into the Nebulawood', at('nebulawood'), 18),
      kill('deadeye', 'deadeye', 1, 'Slay Deadeye', at('nebulawood')),
    ],
    rewards: { gil: 4000, exp: 9000, ap: 40, items: [{ id: 'behemoth_horn', count: 2 }, { id: 'hi_elixir', count: 1 }], unlocks: ['chocobo_rental'] },
  },
  {
    id: 'main_ch4_lestallum', type: 'main', chapter: 4, name: 'Living Legend',
    region: 'duscae', level: 18, giver: 'Iris', requires: ['main_ch3_deadeye'],
    summary: 'Reach Lestallum, see the Meteor of the Six, and find Iris Amicitia.',
    objectives: [
      reach('lestallum', 'lestallum', 'Drive to Lestallum', at('lestallum'), 30),
      talk('iris', 'iris', 'Find Iris at the Leville', at('lestallum')),
      photo('meteor', 'meteor', 1, 'Let Prompto photograph the Meteor', at('lestallum_lookout')),
    ],
    rewards: { gil: 2000, exp: 7000, ap: 30, items: [{ id: 'circlet', count: 1 }] },
  },
  {
    id: 'main_ch5_titan', type: 'main', chapter: 5, name: 'Dark Clouds',
    region: 'duscae', level: 25, giver: 'Ignis', requires: ['main_ch4_lestallum'],
    summary: 'The Archaean stirs beneath the Disc of Cauthess. Answer the summons.',
    objectives: [
      reach('disc', 'disc_of_cauthess', 'Descend into the Disc of Cauthess', at('disc_cauthess'), 30),
      kill('titan', 'titan', 1, 'Endure the Archaean\'s trial', at('disc_cauthess')),
    ],
    rewards: { gil: 8000, exp: 26000, ap: 80, items: [{ id: 'meteorshard', count: 1 }, { id: 'megalixir', count: 1 }], unlocks: ['titan'] },
  },

  /* ------------------------------- hunts -------------------------------- */
  {
    id: 'hunt_killer_wasps', type: 'hunt', name: 'Killer Wasp Nest',
    region: 'leide', level: 3, rank: 1, tipster: 'takka', requires: [], autoAvailable: true,
    target: 'Killer Wasps', timeOfDay: 'day',
    summary: 'A nest has gone up beside the Longwythe road and the truckers are complaining.',
    objectives: [kill('wasps', 'killer_wasp', 8, 'Exterminate the Killer Wasps', at('fossil_wood'))],
    rewards: { gil: 800, exp: 900, ap: 15, items: [{ id: 'potion', count: 3 }, { id: 'venom_fang', count: 2 }] },
  },
  {
    id: 'hunt_sabertusks', type: 'hunt', name: 'Fangs of the Wasteland',
    region: 'leide', level: 5, rank: 1, tipster: 'longwythe', requires: [], autoAvailable: true,
    target: 'Sabertusk Pack', timeOfDay: 'any',
    summary: 'A pack has taken to running down anything on two legs between the outposts.',
    objectives: [kill('tusks', 'sabertusk', 12, 'Cull the Sabertusk pack', at('three_valleys'))],
    rewards: { gil: 1100, exp: 1400, ap: 15, items: [{ id: 'sabertusk_fang', count: 3 }, { id: 'hi_potion', count: 2 }] },
  },
  {
    id: 'hunt_dualhorn', type: 'hunt', name: 'Beasts of Burden',
    region: 'leide', level: 8, rank: 2, tipster: 'takka', requires: ['hunt_killer_wasps'],
    target: 'Dualhorns', timeOfDay: 'day',
    summary: 'Dualhorns have wandered onto the grazing land and will not be moved politely.',
    objectives: [kill('dualhorns', 'dualhorn', 4, 'Drive off the Dualhorns', at('saxham'))],
    rewards: { gil: 2200, exp: 3200, ap: 15, items: [{ id: 'dualhorn_steak', count: 2 }, { id: 'silver_bangle', count: 1 }] },
  },
  {
    id: 'hunt_voretooth', type: 'hunt', name: 'Bloodthirsty Beasts',
    region: 'duscae', level: 11, rank: 2, tipster: 'prairie', requires: [],
    target: 'Voretooth Pack', timeOfDay: 'any',
    summary: 'Something is taking the Prairie Outpost\'s goats. It is not subtle about it.',
    objectives: [kill('vore', 'voretooth', 10, 'Hunt down the Voretooth pack', at('alstor_slough'))],
    rewards: { gil: 2800, exp: 4200, ap: 15, items: [{ id: 'voretooth_tail', count: 3 }, { id: 'debased_silver', count: 4 }] },
  },
  {
    id: 'hunt_garulessa', type: 'hunt', name: 'The Matron\'s Wrath',
    region: 'duscae', level: 16, rank: 3, tipster: 'prairie', requires: ['hunt_voretooth'],
    target: 'Garulessa', timeOfDay: 'day',
    summary: 'A matriarch garula has flattened two fences and one hunter.',
    objectives: [
      reach('field', 'garula_field', 'Reach the grazing grounds', at('weaverwilds'), 18),
      kill('garulessa', 'garulessa', 1, 'Bring down the Garulessa', at('weaverwilds')),
    ],
    rewards: { gil: 5200, exp: 8000, ap: 15, items: [{ id: 'garula_fur', count: 3 }, { id: 'garula_tenderloin', count: 2 }] },
  },
  {
    id: 'hunt_coeurl', type: 'hunt', name: 'Whiskers of Doom',
    region: 'duscae', level: 22, rank: 4, tipster: 'lestallum', requires: ['hunt_garulessa'],
    target: 'Coeurl', timeOfDay: 'any',
    summary: 'It kills with its whiskers. Do not let it look at you for too long.',
    objectives: [kill('coeurl', 'coeurl', 2, 'Slay the coeurls', at('nebulawood'))],
    rewards: { gil: 9000, exp: 15000, ap: 15, items: [{ id: 'coeurl_whiskers', count: 3 }, { id: 'topaz_bracelet', count: 1 }] },
  },
  {
    id: 'hunt_mesmenir', type: 'hunt', name: 'Nightmare on the Moors',
    region: 'cleigne', level: 26, rank: 4, tipster: 'meldacio', requires: [],
    target: 'Mesmenir', timeOfDay: 'night',
    summary: 'A spectral steed runs the moors after dark. Riders have not come back.',
    objectives: [kill('mesmenir', 'mesmenir', 3, 'Destroy the Mesmenir herd', at('taelpar_crag'))],
    rewards: { gil: 12000, exp: 19000, ap: 15, items: [{ id: 'mesmenir_mane', count: 2 }, { id: 'sages_stone', count: 1 }] },
  },
  {
    id: 'hunt_zu', type: 'hunt', name: 'Tyrant of the Skies',
    region: 'cleigne', level: 32, rank: 5, tipster: 'meldacio', requires: ['hunt_coeurl'],
    target: 'Zu', timeOfDay: 'day',
    summary: 'It carries off chocobos. Whole ones.',
    objectives: [
      reach('cliff', 'zu_cliff', 'Climb to the nesting cliff', at('rock_ravatogh'), 20),
      kill('zu', 'zu', 1, 'Bring the Zu down', at('rock_ravatogh')),
    ],
    rewards: { gil: 22000, exp: 34000, ap: 15, items: [{ id: 'zu_beak', count: 2 }, { id: 'griffon_feather', count: 2 }] },
  },
  {
    id: 'hunt_naga', type: 'hunt', name: 'The Weeping Woman',
    region: 'cleigne', level: 38, rank: 5, tipster: 'meldacio', requires: ['hunt_mesmenir'],
    target: 'Naga', timeOfDay: 'night', daemon: true,
    summary: 'She was somebody\'s mother once. She only comes out after dark.',
    objectives: [kill('naga', 'naga', 1, 'Put the Naga to rest', at('malmalam_thicket'))],
    rewards: { gil: 30000, exp: 46000, ap: 15, items: [{ id: 'naga_nail', count: 2 }, { id: 'obsidian_torque', count: 1 }] },
  },
  {
    id: 'hunt_iron_giant', type: 'hunt', name: 'Steel Colossus',
    region: 'cleigne', level: 45, rank: 6, tipster: 'meldacio', requires: ['hunt_naga'],
    target: 'Iron Giant', timeOfDay: 'night', daemon: true,
    summary: 'Three of them, and they only rise when the sun is gone.',
    objectives: [kill('giants', 'iron_giant', 3, 'Destroy the Iron Giants', at('costlemark'))],
    rewards: { gil: 48000, exp: 78000, ap: 15, items: [{ id: 'rotten_splinterbone', count: 5 }, { id: 'platinum_bangle', count: 1 }] },
  },
  {
    id: 'hunt_bandersnatch', type: 'hunt', name: 'Beware the Bandersnatch',
    region: 'cleigne', level: 52, rank: 6, tipster: 'meldacio', requires: ['hunt_zu'],
    target: 'Bandersnatch', timeOfDay: 'any',
    summary: 'Faster than a chocobo, meaner than a coeurl.',
    objectives: [kill('bander', 'bandersnatch', 1, 'Run down the Bandersnatch', at('myrlwood'))],
    rewards: { gil: 60000, exp: 96000, ap: 15, items: [{ id: 'bandersnatch_fur', count: 2 }, { id: 'champions_anklet', count: 1 }] },
  },
  {
    id: 'hunt_adamantoise', type: 'hunt', name: 'Lonely Rumblings in Longwythe',
    region: 'leide', level: 99, rank: 10, tipster: 'longwythe', requires: ['hunt_bandersnatch'],
    target: 'Adamantoise', timeOfDay: 'any',
    summary: 'The tremors under Longwythe Peak are not an earthquake. They are a footstep.',
    objectives: [
      reach('peak', 'longwythe_peak', 'Climb Longwythe Peak', at('longwythe_peak'), 30),
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
      talk('cid', 'cid', 'Bring them to Cid at Hammerhead', at('hammerhead')),
    ],
    rewards: { gil: 0, exp: 800, ap: 10, items: [{ id: 'rune_saber', count: 1 }] },
  },
  {
    id: 'side_meat_magnificent', type: 'side', name: 'A Meat Most Magnificent',
    region: 'leide', level: 6, giver: 'Takka', requires: ['main_ch1_pauper'],
    summary: 'Takka wants a cut of dualhorn for the diner\'s special.',
    objectives: [
      kill('hunt', 'dualhorn', 2, 'Hunt a pair of Dualhorns', at('saxham')),
      fetch_('steak', 'dualhorn_steak', 2, 'Recover the steaks'),
      talk('takka', 'takka', 'Deliver them to Takka', at('hammerhead')),
    ],
    rewards: { gil: 1500, exp: 1200, ap: 10, items: [{ id: 'hi_potion', count: 3 }], recipes: ['bulette_steak'] },
  },
  {
    id: 'side_dog_tags', type: 'side', name: 'The Fading Hunter',
    region: 'leide', level: 7, giver: 'Dave', requires: ['main_ch2_galdin'],
    summary: 'Dave has lost another friend out past the Prairie. He wants the dog tag back.',
    objectives: [
      reach('site', 'crash_site', 'Search the ravine east of Longwythe', at('fossil_wood'), 15),
      fetch_('tag', 'rusted_bit', 1, 'Recover the hunter\'s dog tag'),
      talk('dave', 'dave', 'Return the tag to Dave', at('longwythe_rest')),
    ],
    rewards: { gil: 900, exp: 1600, ap: 10, items: [{ id: 'debased_banknote', count: 2 }] },
  },
  {
    id: 'side_nice_shot', type: 'side', name: 'Nice Shot',
    region: 'duscae', level: 10, giver: 'Prompto', requires: ['main_ch3_openworld'],
    summary: 'Prompto wants three photographs he can actually be proud of.',
    objectives: [
      photo('vista', 'vista', 1, 'Photograph a Duscae vista at golden hour', at('nebulawood')),
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
      { id: 'draw', type: 'draw', target: 'fire', count: 20, desc: 'Draw 20 units of fire energy', waypoint: at('hammerhead_layby') },
      craft('craft', 'any', 1, 'Craft your first spell'),
    ],
    rewards: { gil: 0, exp: 900, ap: 12, items: [{ id: 'magitek_booster', count: 4 }] },
  },
  {
    id: 'side_chocobo', type: 'side', name: 'The Ever Elusive Chocobo',
    region: 'duscae', level: 15, giver: 'Wiz', requires: ['main_ch3_deadeye'],
    summary: 'With Deadeye dead the chocobos will come back — if you walk one home first.',
    objectives: [
      talk('wiz', 'wiz', 'Speak to Wiz at the chocobo post', at('wiz_chocobo')),
      escort('escort', 'chocobo', 'Escort the chocobo back to the post', at('wiz_paddocks')),
    ],
    rewards: { gil: 1800, exp: 3400, ap: 20, items: [{ id: 'chocobo_whistle', count: 1 }, { id: 'sylkis_greens', count: 3 }] },
  },
  {
    id: 'side_power_play', type: 'side', name: 'Power Play',
    region: 'duscae', level: 20, giver: 'Holly', requires: ['main_ch4_lestallum'],
    summary: 'The Exineris plant is losing pressure and Holly suspects sabotage.',
    objectives: [
      talk('holly', 'holly', 'Meet Holly at the power plant', at('exineris')),
      kill('mts', 'magitek_trooper', 12, 'Clear the intruders from the substation', at('exineris')),
      fetch_('relay', 'imperial_relay', 1, 'Recover the imperial relay unit'),
    ],
    rewards: { gil: 6000, exp: 9000, ap: 20, items: [{ id: 'magitek_suit', count: 1 }] },
  },
  {
    id: 'side_legendary_fish', type: 'side', name: 'The One That Got Away',
    region: 'duscae', level: 18, giver: 'Navyth', requires: ['main_ch4_lestallum'],
    summary: 'Navyth has been after the Alstor trout for eleven years. He is not proud.',
    objectives: [
      reach('pier', 'alstor_pier', 'Find Navyth at the Alstor Slough pier', at('alstor_dock'), 12),
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
      talk('smith', 'randolph', 'Deliver them to Randolph', at('lestallum')),
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

/** Where a quest is in its life. */
export type QuestStatus = 'locked' | 'available' | 'active' | 'complete' | 'failed';

/** One objective **as played**: how far along it is, and whether it is done. */
export interface ObjectiveState {
  id: string;
  progress: number;
  done: boolean;
}

/** One quest **as played**. `QuestLog.states` holds exactly one per table row. */
export interface QuestState {
  id: string;
  status: QuestStatus;
  /** Parallel to the quest's authored `objectives`, index for index. */
  objectives: ObjectiveState[];
  /** `Date.now()` when it was accepted. */
  startedAt?: number;
  /** `Date.now()` when it was completed. */
  completedAt?: number;
}

/** An objective merged with its state, which is what a screen draws. */
export interface ObjectiveView extends Objective {
  progress: number;
  done: boolean;
  /** `desc`, with `(2/8)` appended when the objective counts. */
  label: string;
}

/**
 * A quest merged with its state and its lookups resolved -- the authored `rank`
 * and `tipster` ids are replaced by the rows they name, which is why this is
 * not simply `Quest & QuestState`.
 */
export interface QuestView extends Omit<Quest, 'rank' | 'tipster' | 'objectives'> {
  status: QuestStatus;
  rank: (HuntRankInfo & { rank: HuntRank }) | null;
  tipster: Tipster | null;
  objectives: ObjectiveView[];
  /** 0..1 objectives done. */
  progress: number;
}

/** What `rewardsFor` hands `RpgSystem.grantRewards`: no optionals left. */
export interface GrantedRewards {
  gil: number;
  exp: number;
  ap: number;
  items: Array<{ id: string, count: number }>;
  recipes: string[];
  unlocks: string[];
  hunterPoints: number;
}

/** @see QuestLog.accept */
export type AcceptResult =
  | { ok: true; quest: QuestView | null }
  | { ok: false; reason: string };

/**
 * What a gameplay system tells the log happened.
 *
 * The four name fields are alternatives, not a fallback chain over a shape
 * nobody owns: each caller uses whichever word fits its own event, and
 * `notify` takes the first one present.
 */
export interface NotifyPayload {
  target?: string;
  enemy?: string;
  item?: string;
  id?: string;
  /** How many; defaults to one. */
  count?: number;
}

/** A marker the compass and the minimap draw. */
export interface Waypoint {
  questId: string;
  name: string;
  /** The objective's `desc`. */
  objective: string;
  /** `[x, y, z]`. */
  pos: number[];
  tracked: boolean;
  type: QuestType;
  /** How close counts, in metres. */
  radius?: number;
}

/**
 * The `quest-updated` payload. Every transition and every objective tick
 * carries one; `RpgSystem`, `StorySystem`, `HuntRuntime`, `HudBridge` and the
 * audio system all branch on `phase`.
 */
export interface QuestUpdate {
  quest: Quest;
  status: QuestStatus;
  phase: 'available' | 'accepted' | 'abandoned' | 'failed' | 'tracked' | 'objective' | 'complete';
  /** `phase: 'objective'` only: the objective that just ticked, with its state. */
  objective?: Objective & ObjectiveState;
  /** `phase: 'complete'` only. */
  rewards?: GrantedRewards | null;
  /** `phase: 'failed'` only. */
  reason?: string;
}

/** The serialised quest log. */
export interface QuestSave {
  states?: Record<string, QuestState>;
  tracked?: string | null;
  hunterPoints?: number;
  flags?: string[];
}

/**
 * Live quest state. Emits `quest-updated` for every transition and objective
 * tick, with `{ quest, status, phase, objective? }`.
 */
export class QuestLog {
  /** Runtime state per quest id. One entry per row of `QUEST_TABLE`. */
  states!: Record<string, QuestState>;
  tracked!: string | null;
  emitter!: Emitter | null;
  flags!: Set<string>;
  hunterPoints!: number;
  constructor(emitter: import('./Emitter.ts').Emitter | null = null) {
    this.emitter = emitter;
    this.states = {};
    for (const q of QUEST_TABLE) {
      this.states[q.id] = {
        id: q.id,
        status: q.autoAvailable ? 'available' : 'locked',
        objectives: q.objectives.map((o) => ({ id: o.id, progress: 0, done: false })),
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
  def(id: string): Quest | null { return QUESTS[id] || null; }
  /** Runtime state lookup. */
  state(id: string): QuestState | null { return this.states[id] || null; }
  /** Status string for a quest, or `'unknown'` if there is no such quest. */
  status(id: string): QuestStatus | 'unknown' { return this.states[id]?.status || 'unknown'; }

  /** Recompute which locked quests have become available. */
  refresh() {
    for (const q of QUEST_TABLE) {
      const st = this.states[q.id];
      if (st.status !== 'locked') continue;
      const ready = (q.requires || []).every((r) => this.states[r]?.status === 'complete');
      const flagsOk = (q.requiresFlags || []).every((f) => this.flags.has(f));
      if (ready && flagsOk) {
        st.status = 'available';
        this.emitter?.emit('quest-updated', { quest: q, status: 'available', phase: 'available' });
      }
    }
  }

  /** Set a story flag and re-evaluate availability. */
  setFlag(flag: string) { this.flags.add(flag); this.refresh(); }

  /**
   * Quests in a given status, hydrated with their definitions.
   *
   * Every row it walks is a `QUEST_TABLE` row, so `view()` can never miss --
   * the filter is there for the type, not for a case that happens.
   */
  byStatus(status: QuestStatus): QuestView[] {
    return QUEST_TABLE.filter((q) => this.states[q.id].status === status)
      .map((q) => this.view(q.id))
      .filter((v): v is QuestView => v != null);
  }

  /** Everything the UI needs to draw one quest. */
  view(id: string): QuestView | null {
    const q = QUESTS[id];
    const st = this.states[id];
    if (!q || !st) return null;
    return {
      ...q,
      status: st.status,
      rank: q.rank ? { ...HUNT_RANKS[q.rank], rank: q.rank } : null,
      tipster: q.tipster ? TIPSTERS[q.tipster] : null,
      objectives: q.objectives.map((o, i) => ({
        ...o,
        progress: st.objectives[i].progress,
        done: st.objectives[i].done,
        label: `${o.desc}${o.count > 1 ? ` (${st.objectives[i].progress}/${o.count})` : ''}`,
      })),
      progress: st.objectives.filter((o) => o.done).length / Math.max(1, st.objectives.length),
    };
  }

  /** Every quest currently in progress. */
  get active() { return this.byStatus('active'); }
  /** Every quest that can be accepted right now. */
  get available() { return this.byStatus('available'); }
  /** Every quest already finished. */
  get completed() { return this.byStatus('complete'); }

  /** Hunts available at one tipster. */
  huntsAt(tipsterId: TipsterId): QuestView[] {
    return HUNTS.filter((h) => h.tipster === tipsterId && ['available', 'active'].includes(this.states[h.id].status))
      .map((h) => this.view(h.id))
      .filter((v): v is QuestView => v != null);
  }

  /**
   * Accept a quest. Fails if it is not available.
   */
  accept(id: string): AcceptResult {
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
  abandon(id: string) {
    const st = this.states[id];
    if (!st || st.status !== 'active') return false;
    st.status = 'available';
    st.objectives.forEach((o) => { o.progress = 0; o.done = false; });
    if (this.tracked === id) this.tracked = this.active[0]?.id || null;
    this.emitter?.emit('quest-updated', { quest: QUESTS[id], status: 'available', phase: 'abandoned' });
    return true;
  }

  /** Fail a quest (a dead escort, a blown timer). */
  fail(id: string, reason = 'failed') {
    const st = this.states[id];
    if (!st || st.status !== 'active') return false;
    st.status = 'failed';
    this.emitter?.emit('quest-updated', { quest: QUESTS[id], status: 'failed', phase: 'failed', reason });
    return true;
  }

  /** Make the compass point at this quest. */
  track(id: string) {
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
  notify(type: ObjectiveKind, payload: NotifyPayload = {}): QuestView[] {
    const target = payload.target ?? payload.enemy ?? payload.item ?? payload.id ?? 'any';
    const amount = payload.count ?? 1;
    const changed: string[] = [];

    for (const q of QUEST_TABLE) {
      const st = this.states[q.id];
      if (st.status !== 'active') continue;
      let touched = false;

      for (let i = 0; i < q.objectives.length; i++) {
        const o = q.objectives[i];
        const os = st.objectives[i];
        if (os.done || o.type !== type) continue;
        // Objectives complete in order: an earlier unfinished objective blocks.
        if (st.objectives.slice(0, i).some((p) => !p.done)) continue;
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
        if (st.objectives.every((o) => o.done)) this.complete(q.id);
      }
    }
    return changed.map((id) => this.view(id)).filter((v): v is QuestView => v != null);
  }

  /** Force an objective complete (debug / cutscene shortcuts). */
  forceObjective(questId: string, objectiveId: string) {
    const q = QUESTS[questId];
    const st = this.states[questId];
    if (!q || !st || st.status !== 'active') return false;
    const i = q.objectives.findIndex((o) => o.id === objectiveId);
    if (i < 0) return false;
    st.objectives[i].done = true;
    st.objectives[i].progress = q.objectives[i].count;
    if (st.objectives.every((o) => o.done)) this.complete(questId);
    return true;
  }

  /**
   * Mark a quest complete and emit its rewards. RpgSystem listens for the
   * `complete` phase and actually grants them.
   */
  complete(id: string) {
    const st = this.states[id];
    const q = QUESTS[id];
    if (!st || !q || st.status === 'complete') return false;
    st.status = 'complete';
    st.completedAt = Date.now();
    st.objectives.forEach((o, i) => { o.done = true; o.progress = q.objectives[i].count; });

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
  rewardsFor(id: string): GrantedRewards | null {
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
  waypoints(): Waypoint[] {
    const out: Waypoint[] = [];
    for (const q of QUEST_TABLE) {
      const st = this.states[q.id];
      if (st.status !== 'active') continue;
      const i = st.objectives.findIndex((o) => !o.done);
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
      const i = st.objectives.findIndex((o) => !o.done);
      if (i < 0 || q.objectives[i].type !== 'reach') continue;
      const [x, , z] = w.pos;
      const d = Math.hypot(pos.x - x, pos.z - z);
      if (d <= (w.radius || 12)) this.notify('reach', { target: q.objectives[i].target });
    }
  }

  toJSON(): QuestSave {
    return { states: this.states, tracked: this.tracked, hunterPoints: this.hunterPoints, flags: [...this.flags] };
  }

  static fromJSON(data: QuestSave | null | undefined, emitter: Emitter | null = null) {
    const log = new QuestLog(emitter);
    if (!data) return log;
    for (const id of Object.keys(log.states)) {
      const src = data.states?.[id];
      if (!src) continue;
      log.states[id].status = src.status || log.states[id].status;
      const objs = src.objectives || [];
      log.states[id].objectives.forEach((o, i) => {
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
