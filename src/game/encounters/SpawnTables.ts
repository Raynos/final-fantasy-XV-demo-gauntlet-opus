/**
 * Where things live, and when.
 *
 * A **territory** is a persistent patch of the world with a home anchor, a
 * patrol loop and a spawn window. The director streams territories in and out
 * as the player moves, so the world is populated everywhere but only ~40
 * enemies are ever simulated.
 *
 * `when` is the spawn window:
 *   `'day'`   06:00–19:00 only
 *   `'night'` after dark only, and gated on `rpg.daemonPressure().spawn`
 *   `'any'`   always
 *
 * Levels are a *base*; the director scales them by region danger and by how
 * deep into the night it is (`nightScaling` in `rpg/Stats.ts`).
 */

/** When a spawn is allowed to exist. */
export type SpawnWindow = 'day' | 'night' | 'any';

/** Who a spawn belongs to; `beast` is the default and is never written. */
export type Faction = 'beast' | 'imperial' | 'daemon';

/** One species line of a spawn list. `count` is fixed, or a `[min, max]` roll. */
export interface SpawnLine {
  /** Bestiary key. */
  key: string;
  count: number | [number, number];
  /** Overrides the territory's base level for this line. */
  level?: number;
}

/** What `daemonPressure()` publishes, and what a spawn window is judged against. */
export interface Pressure {
  /** Are daemons out? */
  spawn: boolean;
  /** 0..1 how many. */
  density: number;
  /** 0..1 how deep into the night it is. */
  depth: number;
  levelBonus: number;
  level?: number;
  attack?: number;
  defense?: number;
  hp?: number;
}

/**
 * A persistent patch of the world, **as resolved**: `T()` fills in every
 * default, so nothing downstream has to guess what a missing `respawn` means.
 */
export interface Territory {
  id: string;
  name: string;
  /** World anchor `[x, z]`. */
  at: [number, number];
  radius: number;
  when: SpawnWindow;
  level: number;
  /** 0..4 -- how dangerous this patch reads on the map. */
  danger: number;
  spawn: SpawnLine[];
  /** Radius of the patrol loop; 0 means the pack stands its ground. */
  patrolRadius: number;
  /** Seconds before a cleared territory comes back. */
  respawn: number;
  /** How many members may close and attack at once. */
  maxEngaged: number;
  faction?: Faction;
  /** A grazing herd: it is scenery until something provokes it. */
  passive?: boolean;
  /** Hold off until the night is at least this deep. */
  nightDepth?: number;
}

/** A territory **as authored**: everything `T()` defaults may be left out. */
export type TerritorySpec =
  Omit<Territory, 'radius' | 'when' | 'patrolRadius' | 'respawn' | 'maxEngaged'>
  & Partial<Pick<Territory, 'radius' | 'when' | 'patrolRadius' | 'respawn' | 'maxEngaged'>>;

/**
 * @returns a territory definition
 */
const T = (o: TerritorySpec): Territory => ({
  respawn: 150, radius: 26, when: 'any', maxEngaged: 2, patrolRadius: 0, ...o,
});

/** The Leide basin, as it is actually built. */
export const TERRITORIES: Territory[] = [

  /* ---- the road and the flats around the start ---------------------- */
  T({
    id: 'weaverwilds_tusks', name: 'The Weaverwilds', at: [46, -58], radius: 30,
    when: 'day', level: 6, danger: 1,
    spawn: [{ key: 'sabertusk', count: [3, 5] }],
    patrolRadius: 22, respawn: 140,
  }),
  T({
    id: 'roadside_tusks', name: 'Longwythe Roadside', at: [-38, 74], radius: 26,
    when: 'day', level: 5, danger: 1,
    spawn: [{ key: 'sabertusk', count: [2, 4] }],
    patrolRadius: 18,
  }),
  T({
    id: 'graze_anak', name: 'Anak Grazing Ground', at: [118, 64], radius: 40,
    when: 'day', level: 9, danger: 0, passive: true,
    spawn: [{ key: 'anak', count: [3, 5] }],
    patrolRadius: 34, respawn: 300,
  }),
  T({
    id: 'dualhorn_pair', name: 'Kelbass Grasslands', at: [-96, -132], radius: 30,
    when: 'day', level: 12, danger: 2,
    spawn: [{ key: 'dualhorn', count: [2, 3] }],
    patrolRadius: 20, respawn: 260,
  }),
  T({
    id: 'vore_pack', name: 'The Three Valleys', at: [186, -212], radius: 32,
    when: 'any', level: 11, danger: 2,
    spawn: [{ key: 'voretooth', count: [4, 6] }],
    patrolRadius: 26, maxEngaged: 3,
  }),
  T({
    id: 'garula_herd', name: 'Alstor Slough Edge', at: [-208, 148], radius: 36,
    when: 'day', level: 16, danger: 2,
    spawn: [{ key: 'garula', count: [2, 3] }, { key: 'anak', count: [0, 2] }],
    patrolRadius: 28, respawn: 300,
  }),
  T({
    id: 'coeurl_pair', name: 'Saulhend Pass', at: [-296, 262], radius: 34,
    when: 'any', level: 22, danger: 3,
    spawn: [{ key: 'coeurl', count: [1, 2] }],
    patrolRadius: 30, respawn: 420,
  }),
  T({
    id: 'bander_lair', name: 'Callnegh Steps', at: [-470, 318], radius: 30,
    when: 'any', level: 34, danger: 4,
    spawn: [{ key: 'bandersnatch', count: [1, 1] }],
    respawn: 600,
  }),

  /* ---- imperial presence -------------------------------------------- */
  T({
    id: 'blockade_patrol', name: 'Norduscaen Blockade', at: [34, 72], radius: 30,
    when: 'any', level: 16, danger: 2, faction: 'imperial',
    spawn: [
      { key: 'mt', count: [3, 4] },
      { key: 'axeman', count: [1, 1] },
      { key: 'sniper', count: [0, 1] },
    ],
    patrolRadius: 20, respawn: 240, maxEngaged: 3,
  }),
  T({
    id: 'crashsite_mt', name: 'Keycatrich Ruins', at: [-60, -230], radius: 34,
    when: 'any', level: 20, danger: 3, faction: 'imperial',
    spawn: [
      { key: 'mt', count: [2, 4] },
      { key: 'sniper', count: [1, 2] },
    ],
    patrolRadius: 24, respawn: 300,
  }),
  T({
    id: 'outpost_garrison', name: 'Formouth Garrison', at: [-150, -350], radius: 40,
    when: 'any', level: 24, danger: 3, faction: 'imperial',
    spawn: [
      { key: 'mt', count: [3, 5] },
      { key: 'axeman', count: [1, 2] },
      { key: 'sniper', count: [1, 2] },
    ],
    patrolRadius: 30, respawn: 360, maxEngaged: 3,
  }),

  /* ---- what comes out after dark ------------------------------------ */
  T({
    id: 'night_goblins_road', name: 'The Long Night — roadside', at: [12, 30], radius: 40,
    when: 'night', level: 12, danger: 2, faction: 'daemon',
    spawn: [{ key: 'goblin', count: [4, 6] }, { key: 'hobgoblin', count: [0, 1] }],
    respawn: 90, maxEngaged: 3,
  }),
  T({
    id: 'night_goblins_flats', name: 'The Long Night — flats', at: [-120, 40], radius: 44,
    when: 'night', level: 14, danger: 2, faction: 'daemon',
    spawn: [{ key: 'goblin', count: [3, 6] }, { key: 'bussemand', count: [0, 1] }],
    respawn: 90, maxEngaged: 3,
  }),
  T({
    id: 'night_ruins', name: 'Keycatrich after dark', at: [-72, -246], radius: 40,
    when: 'night', level: 26, danger: 3, faction: 'daemon',
    spawn: [
      { key: 'hobgoblin', count: [2, 3] },
      { key: 'arachne', count: [0, 1] },
      { key: 'necromancer', count: [0, 1] },
    ],
    respawn: 140, maxEngaged: 3,
  }),
  T({
    id: 'night_moor', name: 'The moors', at: [-244, 302], radius: 44,
    when: 'night', level: 28, danger: 3, faction: 'daemon',
    spawn: [{ key: 'mesmenir', count: [1, 3] }],
    respawn: 200,
  }),
  T({
    id: 'night_ronin', name: 'Balouve approach', at: [-500, 330], radius: 34,
    when: 'night', level: 45, danger: 5, faction: 'daemon',
    spawn: [{ key: 'ronin', count: [1, 2] }],
    respawn: 300,
  }),
  T({
    id: 'night_giant', name: 'The Pride of the King', at: [40, 96], radius: 30,
    when: 'night', level: 46, danger: 5, faction: 'daemon',
    nightDepth: 0.55,                 // only in the small hours
    spawn: [{ key: 'irongiant', count: [1, 1] }],
    respawn: 600,
  }),
  T({
    id: 'night_redgiant', name: 'The furnace', at: [-330, -300], radius: 34,
    when: 'night', level: 50, danger: 5, faction: 'daemon',
    nightDepth: 0.7,
    spawn: [{ key: 'redgiant', count: [1, 1] }],
    respawn: 900,
  }),
];

/** Territories keyed by id. */
export const TERRITORY_TABLE = Object.fromEntries(TERRITORIES.map((t) => [t.id, t]));

/**
 * Wandering encounters — the ones that come to *you*. Rolled on a timer while
 * the player is in the open, weighted by time of day.
 */
/** A wandering encounter: rolled on a timer and spawned around the player. */
export interface Roamer {
  id: string;
  when: SpawnWindow;
  /** Selection weight against the other roamers whose window is open. */
  weight: number;
  level: number;
  faction: Faction;
  spawn: SpawnLine[];
  /** Arrives by dropship rather than simply being there. */
  dropship?: boolean;
  /** Hold off until the night is at least this deep. */
  nightDepth?: number;
}

export const ROAMERS: Roamer[] = [
  { id: 'tusk_ambush', when: 'day', weight: 3, level: 6, faction: 'beast',
    spawn: [{ key: 'sabertusk', count: [3, 4] }] },
  { id: 'vore_ambush', when: 'day', weight: 2, level: 11, faction: 'beast',
    spawn: [{ key: 'voretooth', count: [3, 5] }] },
  { id: 'imperial_drop', when: 'any', weight: 2, level: 18, faction: 'imperial',
    dropship: true,
    spawn: [{ key: 'mt', count: [4, 5] }, { key: 'axeman', count: [1, 1] }] },
  { id: 'goblin_swarm', when: 'night', weight: 4, level: 14, faction: 'daemon',
    spawn: [{ key: 'goblin', count: [4, 7] }] },
  { id: 'daemon_pack', when: 'night', weight: 2, level: 24, faction: 'daemon',
    spawn: [{ key: 'hobgoblin', count: [2, 3] }, { key: 'bussemand', count: [1, 1] }] },
  { id: 'ronin_duel', when: 'night', weight: 1, level: 45, faction: 'daemon',
    nightDepth: 0.6, spawn: [{ key: 'ronin', count: [1, 1] }] },
];

/**
 * Named set-piece encounters. These are placed, not rolled, and each one has
 * a `BossFight` controller.
 */
/** A named, placed boss encounter with its own `BossFight` controller. */
export interface SetPiece {
  id: string;
  name: string;
  kind: 'field' | 'imperial' | 'astral';
  /** World anchor `[x, z]`. */
  at: [number, number];
  radius: number;
  level: number;
  /** Bestiary key of the boss itself. */
  boss: string;
  /** The rank and file that come with it. */
  adds?: Array<{ key: string, count: number, level: number }>;
  /** The boss is delivered by dropship. */
  dropship?: boolean;
  /** Radius of the arena the fight is fenced into. */
  arena?: number;
  /**
   * Music cue put on the `encounter:boss` event.
   *
   * Deliberately **not** a `MusicStateName`: none of these three names is in
   * the score's state table, and nothing in the tree listens for
   * `encounter:boss`, so the field is inert. Typed as authored rather than
   * silently re-pointed at `'boss'`, which would be a behaviour change.
   */
  music: 'boss-field' | 'boss-imperial' | 'boss-astral';
}

export const SET_PIECES: Record<string, SetPiece> = {
  bloodhorn: {
    id: 'bloodhorn', name: 'Bloodhorn', kind: 'field',
    at: [-96, -132], radius: 40, level: 22, boss: 'bloodhorn',
    adds: [{ key: 'dualhorn', count: 2, level: 14 }],
    music: 'boss-field',
  },
  magitek_armour: {
    id: 'magitek_armour', name: 'MA-X Cuirass', kind: 'imperial',
    at: [34, 72], radius: 44, level: 30, boss: 'magitek_armour',
    dropship: true,
    adds: [{ key: 'mt', count: 4, level: 20 }, { key: 'axeman', count: 1, level: 24 }],
    music: 'boss-imperial',
  },
  titan: {
    id: 'titan', name: 'Titan, the Archaean', kind: 'astral',
    at: [-215, -395], radius: 70, level: 45, boss: 'titan',
    arena: 62,
    music: 'boss-astral',
  },
};

/**
 * Which set piece (if any) a hunt spawns, and where.
 * Everything else in `Quests.ts`'s hunt table spawns an ordinary pack of its
 * target species at the objective's waypoint.
 */
/** What a hunt spawns. */
export interface HuntTarget {
  /** Bestiary key. */
  key: string;
  count: number;
  level: number;
  /** Cap on how many are alive at once, for the long packs. */
  maxAlive?: number;
  /** Size multiplier, for the named beasts. */
  scale?: number;
  /** A proper name, shown instead of the species. */
  name?: string;
  /** Boss health and exp class. */
  boss?: boolean;
  /** A set piece from `SET_PIECES` rather than an ordinary pack. */
  setPiece?: string;
}

export const HUNT_TARGETS: Record<string, HuntTarget> = {
  hunt_killer_wasps: { key: 'voretooth', count: 8, level: 4 },
  hunt_sabertusks: { key: 'sabertusk', count: 12, level: 6, maxAlive: 6 },
  hunt_dualhorn: { key: 'dualhorn', count: 4, level: 10 },
  hunt_voretooth: { key: 'voretooth', count: 10, level: 12, maxAlive: 6 },
  hunt_garulessa: { key: 'garula', count: 1, level: 20, scale: 1.25, name: 'Garulessa', boss: true },
  hunt_coeurl: { key: 'coeurl', count: 2, level: 24 },
  hunt_mesmenir: { key: 'mesmenir', count: 3, level: 28 },
  hunt_zu: { key: 'bandersnatch', count: 1, level: 34, name: 'Zu', boss: true },
  hunt_naga: { key: 'arachne', count: 1, level: 40, scale: 1.3, name: 'Naga', boss: true },
  hunt_iron_giant: { key: 'irongiant', count: 3, level: 46, maxAlive: 2 },
  hunt_bandersnatch: { key: 'bandersnatch', count: 1, level: 52, boss: true },
  hunt_adamantoise: { key: 'titan', count: 1, level: 60, name: 'Adamantoise', boss: true },
};

/**
 * Is a spawn window open right now?
 * @param when 'day' | 'night' | 'any'
 * @param pressure `rpg.daemonPressure()`
 */
export function windowOpen(when: SpawnWindow, pressure: Pressure) {
  if (when === 'any') return true;
  if (when === 'night') return !!pressure.spawn;
  return !pressure.spawn;
}
