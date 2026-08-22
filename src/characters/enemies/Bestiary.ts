import { SABERTUSK } from './Sabertusk.ts';
import { GOBLIN } from './Goblin.ts';
import { MT_SOLDIER } from './MTSoldier.ts';
import { IRON_GIANT } from './IronGiant.ts';
import { DUALHORN } from './Dualhorn.ts';
import { VORETOOTH } from './Voretooth.ts';
import { ANAK } from './Anak.ts';
import { GARULA } from './Garula.ts';
import { COEURL } from './Coeurl.ts';
import { MESMENIR } from './Mesmenir.ts';
import { BANDERSNATCH } from './Bandersnatch.ts';
import { ARACHNE } from './Arachne.ts';
import { RONIN } from './Ronin.ts';
import { IMPERIAL_AXEMAN } from './ImperialAxeman.ts';
import { IMPERIAL_SNIPER } from './ImperialSniper.ts';
import { MAGITEK_ARMOUR } from './MagitekArmour.ts';
import { BUSSEMAND } from './Bussemand.ts';
import { HOBGOBLIN } from './Hobgoblin.ts';
import { NECROMANCER } from './Necromancer.ts';
import { RED_GIANT } from './RedGiant.ts';
import { TITAN } from './Titan.ts';
import type { EnemyStats, Faction, SpawnOpts, SpeciesDef } from './EnemyBase.ts';
import type { Element } from '../../game/rpg/Stats.ts';

/**
 * The bestiary registry.
 *
 * Every species is a plain data object plus a `buildPrototype()` and a
 * `make()`; nothing here is instantiated until something spawns it, so the
 * cost of a twenty-species roster at boot is one module evaluation.
 *
 * `variant()` derives a named mark (a hunt boss) from a base species without
 * duplicating a single triangle — the derived type carries `protoKey` so the
 * spawner reuses the base species' geometry and skeleton.
 */

/**
 * What a mark may say about itself: everything on a species except the two
 * factories and the measured cache, and its stats only in part — `variant()`
 * merges them over the base's, so `Bloodhorn` may restate `hp` without
 * restating `attackRange`.
 */
export type SpeciesOverride =
  Partial<Omit<SpeciesDef, 'stats' | 'make' | 'buildPrototype' | '_groundCal'>>
  & { stats?: Partial<EnemyStats> };

/**
 * Derive a re-statted variant of a species.
 * @param base a species definition
 * @param key the new registry key
 * @param over `{ stats, ...anything else to override }`
 */
export function variant(base: SpeciesDef, key: string, over: SpeciesOverride = {}): SpeciesDef {
  const def: SpeciesDef = {
    ...base,
    ...over,
    key,
    protoKey: base.protoKey || base.key,
    stats: { ...base.stats, ...over.stats },
    // A derived type is a *fresh* definition, so it must not inherit the base's
    // measured ground curves: it is re-statted, not re-modelled, but it is
    // scaled and posed on its own instance and `calibrateGround` fills this in
    // the first time one spawns.
    _groundCal: undefined,
    make: (opts: SpawnOpts = {}) => {
      // `base.make` builds the base class, so re-point the instance at the
      // variant's data afterwards — one geometry, two creatures.
      const e = base.make(opts);
      e.type = def;
      e.name = def.stats.name;
      e.speciesId = def.questId || key;
      e.expClass = def.expClass;
      e.boss = !!def.boss;
      e.superArmour = !!def.superArmour;
      e.attacks = def.attacks;
      const s = def.stats;
      e.baseMaxHp = s.hp;
      e.maxHp = opts.maxHp ?? s.hp;
      e.hp = e.maxHp;
      e.maxPoise = s.poise; e.poise = s.poise;
      e.speed = s.speed; e.damage = s.damage;
      e.attackRange = s.attackRange; e.aggroRange = s.aggroRange;
      e.radius = s.radius; e.height = s.height;
      e.level = opts.level ?? s.level;
      e.faction = def.faction;
      return e;
    },
  };
  return def;
}

/* ------------------------------------------------------------ marks */

/** Bloodhorn — the mutant Dualhorn Dave sends you after. The field boss. */
export const BLOODHORN = variant(DUALHORN, 'bloodhorn', {
  questId: 'bloodhorn', boss: true, expClass: 'boss', superArmour: true,
  staggerDuration: 3.4,
  stats: {
    name: 'Bloodhorn', hp: 26000, poise: 300, speed: 5.2, damage: 340,
    level: 22, radius: 1.5, height: 3.2, aggroRange: 46,
  },
  drops: [
    { id: 'dualhorn_steak', chance: 1, count: 3 },
    { id: 'beast_bone', chance: 1, count: 2 },
    { id: 'hi_potion', chance: 1, count: 2 },
  ],
});

/** Deadeye — the scarred one-eyed Behemoth, reskinned from the Bandersnatch. */
export const DEADEYE = variant(BANDERSNATCH, 'deadeye', {
  questId: 'deadeye', boss: true, expClass: 'boss', superArmour: true,
  stats: {
    name: 'Deadeye', hp: 34000, poise: 340, speed: 8.4, damage: 420,
    level: 28, radius: 1.3, height: 2.9, aggroRange: 50,
  },
});

/* ------------------------------------------------------------ registry */

const REGISTRY = {
  sabertusk: SABERTUSK,
  goblin: GOBLIN,
  mt: MT_SOLDIER,
  irongiant: IRON_GIANT,
  dualhorn: DUALHORN,
  voretooth: VORETOOTH,
  anak: ANAK,
  garula: GARULA,
  coeurl: COEURL,
  mesmenir: MESMENIR,
  bandersnatch: BANDERSNATCH,
  arachne: ARACHNE,
  ronin: RONIN,
  axeman: IMPERIAL_AXEMAN,
  sniper: IMPERIAL_SNIPER,
  magitek_armour: MAGITEK_ARMOUR,
  bussemand: BUSSEMAND,
  hobgoblin: HOBGOBLIN,
  necromancer: NECROMANCER,
  redgiant: RED_GIANT,
  titan: TITAN,
  bloodhorn: BLOODHORN,
  deadeye: DEADEYE,
};

/** Every registry key in `TYPES`. */
export type SpeciesKey = keyof typeof REGISTRY;

/**
 * Every spawnable species, keyed by its registry key.
 *
 * Declared as a `Record` over the key union rather than left as the literal:
 * the keys stay exact, so a typo in `spawn('sabertsuk')` is still catchable,
 * while a *lookup* is one `SpeciesDef` instead of a 23-arm union that nothing
 * can read a field off.
 */
export const TYPES: Record<SpeciesKey, SpeciesDef> = REGISTRY;

/** Species by key, for the string-keyed callers that cross a boundary. */
const BY_KEY: ReadonlyMap<string, SpeciesDef> = new Map(Object.entries(TYPES));

export function speciesKeys(): string[] { return Object.keys(REGISTRY); }

/** Every species of a faction. @param f */
export function byFaction(f: Faction): SpeciesDef[] {
  return Object.values(TYPES).filter((t) => t.faction === f);
}

/** The elements a bestiary entry reports on; `physical` is not one of them. */
const SCANNED: readonly Element[] = ['fire', 'ice', 'lightning', 'dark', 'light'];

/**
 * A player-facing bestiary entry, for the HUD / a future Libra scan.
 */
export function entry(key: string) {
  const t = BY_KEY.get(key);
  if (!t) return null;
  const weak: Element[] = [], strong: Element[] = [];
  for (const el of SCANNED) {
    const pct = t.resistPct?.[el] ?? (t.weakness === el ? 160 : t.resist === el ? 50 : 100);
    if (pct > 110) weak.push(el);
    else if (pct < 90) strong.push(el);
  }
  return {
    key, name: t.stats.name, faction: t.faction,
    level: t.stats.level, hp: t.stats.hp, expClass: t.expClass,
    weak, strong, weakToWeapons: t.weakTo ?? [], drops: t.drops,
  };
}

export const BESTIARY = TYPES;
