/**
 * The main story, as a spine.
 *
 * `rpg.quests` already holds the main-line quests as data — objectives,
 * waypoints, rewards, prerequisites. What it does not hold is the *shape* of a
 * chapter: which quests belong to it, what card announces it, where in the
 * world it happens, what time of day it opens on, which cutscenes hang off
 * which objective, and what it means for a chapter to be finished.
 *
 * That is all here, keyed to the quest ids that already exist. Nothing in this
 * table duplicates quest data; it points at it.
 */

/** An area / chapter card, as `Letterbox` and the HUD draw it. */
export interface AreaCard {
  name: string;
  sub: string;
  meta: string;
}

/** One chapter of the main line. */
export interface Chapter {
  n: number;
  name: string;
  /** Region id, keying `Quests.REGIONS`. */
  region: string;
  area: AreaCard;
  /** Quests, in the order the chapter expects them. */
  quests: string[];
  /** Hour the chapter opens on, so a chapter always starts in its own light. */
  hour: number;
  summary: string;
  /**
   * Scenes bound to story moments inside this chapter, keyed by moment:
   * `'start'`, `'quest:<id>:<phase>'` or `'objective:<quest>:<objective>'`.
   */
  scenes: Record<string, string>;
}

export const CHAPTERS: Chapter[] = [
  {
    n: 1,
    name: 'Departure',
    region: 'leide',
    area: { name: 'Leide', sub: 'Chapter I — Departure', meta: 'The Longwythe Region' },
    /** Quests, in the order the chapter expects them. */
    quests: ['main_ch1_departure', 'main_ch1_pauper'],
    /** Hour the chapter opens on, so a chapter always starts in its own light. */
    hour: 18.25,
    summary: 'Four young men, one dead car, and eighty kilometres of Leide highway.',
    /** Scenes bound to story moments inside this chapter. */
    scenes: {
      start: 'ch1_opening_push',
      'objective:main_ch1_departure:push': 'ch1_hammerhead',
      'quest:main_ch1_pauper:accepted': 'ch1_longwythe_hunt',
    },
  },
  {
    n: 2,
    name: 'No Turning Back',
    region: 'leide',
    area: { name: 'Galdin Quay', sub: 'Chapter II — No Turning Back', meta: 'The Cape of Leide' },
    quests: ['main_ch2_galdin'],
    hour: 16.4,
    summary: 'A ferry to Altissia, a wedding to get to, and a war that has other plans.',
    scenes: { start: 'ch2_blockade' },
  },
  {
    n: 3,
    name: 'The Open World',
    region: 'leide',
    area: { name: 'Keycatrich', sub: 'Chapter III — The Open World', meta: 'Leide, after the fall' },
    quests: ['main_ch3_openworld', 'main_ch3_deadeye'],
    hour: 7.1,
    summary: 'Insomnia has fallen. Cor Leonis leads the king who is left to the tomb of the Wise.',
    scenes: { start: 'ch3_the_fall' },
  },
  {
    n: 4,
    name: 'Living Legend',
    region: 'duscae',
    area: { name: 'Lestallum', sub: 'Chapter IV — Living Legend', meta: 'Duscae, beneath the Meteor' },
    quests: ['main_ch4_lestallum'],
    hour: 19.0,
    summary: 'A city built on the heat of a fallen star, and the first friendly face in weeks.',
    scenes: {},
  },
  {
    n: 5,
    name: 'Dark Clouds',
    region: 'duscae',
    area: { name: 'The Disc of Cauthess', sub: 'Chapter V — Dark Clouds', meta: 'The Archaean stirs' },
    quests: ['main_ch5_titan'],
    hour: 13.2,
    summary: 'The Archaean has been holding the Meteor up for two thousand years. He would like a word.',
    scenes: { start: 'ch5_astral_awakening' },
  },
];

/** Chapter lookup by number. */
export const CHAPTER_BY_N = Object.fromEntries(CHAPTERS.map((c) => [c.n, c]));

/** The chapter a main-line quest belongs to. */
export function chapterOfQuest(questId: string): Chapter | null {
  return CHAPTERS.find((c) => c.quests.includes(questId)) || null;
}

/**
 * Region title cards, so entering a region announces itself the way FFXV does.
 * Bounds are generous circles in world XZ — Leide is the default everywhere
 * else, which is correct: this world *is* Leide.
 */
export const REGION_CARDS: Record<string, AreaCard> = {
  leide: { name: 'Leide', sub: 'The Longwythe Region', meta: 'Kingdom of Lucis' },
  duscae: { name: 'Duscae', sub: 'The Nebulawood', meta: 'Kingdom of Lucis' },
  cleigne: { name: 'Cleigne', sub: 'The Vesperpool Road', meta: 'Kingdom of Lucis' },
};

/**
 * Named places in this world, resolved against the Ecology's site list where
 * one exists so nothing here hard-codes a coordinate another agent owns.
 * `site` is an Ecology site type; `pos` is the fallback.
 */
/** A named location, resolved against an Ecology site so nothing hard-codes a coordinate. */
export interface Place {
  id: string;
  name: string;
  sub: string;
  /**
   * Ecology site type this place sits on. `Triggers.places()` takes the FIRST
   * site of the type, so this can only ever name a *kind* of place — "a
   * haven", "a blockade" — never a particular one.
   */
  site: string;
  /**
   * A `WorldMap` POI id, which names a particular one.
   *
   * The seven rows above are all `site` rows and every one of them is generic
   * for that reason: there was no way to say *this* landmark. That is fine for
   * "Haven" and useless for the nine places tasks 57-62 added, which are the
   * whole reason to drive into an empty sector — arriving at the Adamantoise
   * Graveyard has to announce the Adamantoise Graveyard. When `poi` is set,
   * `Triggers.places()` resolves it against `worldMap` and `site` is ignored.
   */
  poi?: string;
  /** Metres from the site that count as "here". */
  radius: number;
}

export const PLACES: Place[] = [
  { id: 'hammerhead', name: 'Hammerhead', sub: 'Cid Sophiar, Mechanic', site: 'reststop', radius: 42 },
  { id: 'longwythe', name: 'Longwythe Rest Area', sub: 'Leide', site: 'shack', radius: 34 },
  { id: 'haven', name: 'Haven', sub: 'Safe ground', site: 'haven', radius: 20 },
  { id: 'blockade', name: 'Imperial Checkpoint', sub: 'Niflheim', site: 'blockade', radius: 40 },
  { id: 'crashsite', name: 'Crash Site', sub: 'Magitek dropship', site: 'crashsite', radius: 44 },
  { id: 'outpost', name: 'Blackrock Outpost', sub: 'Leide', site: 'outpost', radius: 40 },
  { id: 'ruins', name: 'Solheim Ruins', sub: 'Under the Spire Ridge', site: 'ruins', radius: 46 },

  /*
   * The nine POI-anchored places, one per landmark tasks 57-62 built.
   *
   * A landmark with no row here can never fire a `place` trigger and therefore
   * can never show an area card, however good its geometry is: `places()`
   * resolves this table and nothing else. The radii are the landmark's own
   * composition, not its discovery radius (`r` on the POI row is 260-340 m and
   * a card at 300 m fires while you are still driving past).
   */
  { id: 'threshold_stones', name: 'The Threshold Stones', sub: 'The old pilgrim road', site: '', poi: 'threshold_stones', radius: 62 },
  { id: 'saltgrass_flats', name: 'The Saltgrass Flats', sub: 'Leide', site: '', poi: 'saltgrass_flats', radius: 96 },
  { id: 'kingsroad_end', name: 'Old Kingsroad End', sub: 'Where the road gives up', site: '', poi: 'old_kingsroad_end', radius: 44 },
  { id: 'peak_overlook', name: 'The Northwatch Overlook', sub: 'Longwythe Peak', site: '', poi: 'peak_overlook', radius: 62 },
  { id: 'adamantoise_graveyard', name: 'The Adamantoise Graveyard', sub: 'Beyond Ravenscrag', site: '', poi: 'adamantoise_graveyard', radius: 96 },
  { id: 'mencemoor_obelisks', name: 'The Mencemoor Obelisks', sub: 'Keycatrich', site: '', poi: 'mencemoor_obelisks', radius: 62 },
  { id: 'northwatch_ruin', name: 'Northwatch Garrison', sub: 'Niflheim', site: '', poi: 'northwatch_ruin', radius: 78 },
  { id: 'washes_lookout', name: 'The Washes Lookout', sub: 'The Three Valleys', site: '', poi: 'washes_lookout', radius: 62 },
  { id: 'saulhend_overlook', name: 'The Saulhend Overlook', sub: 'The Kelbass Grasslands', site: '', poi: 'saulhend_overlook', radius: 62 },
];

export default CHAPTERS;
