import { SABERTUSK } from './Sabertusk.js';
import { GOBLIN } from './Goblin.js';
import { MT_SOLDIER } from './MTSoldier.js';
import { IRON_GIANT } from './IronGiant.js';
import { DUALHORN } from './Dualhorn.js';
import { VORETOOTH } from './Voretooth.js';
import { ANAK } from './Anak.js';
import { GARULA } from './Garula.js';
import { COEURL } from './Coeurl.js';
import { MESMENIR } from './Mesmenir.js';
import { BANDERSNATCH } from './Bandersnatch.js';
import { ARACHNE } from './Arachne.js';
import { RONIN } from './Ronin.js';
import { IMPERIAL_AXEMAN } from './ImperialAxeman.js';
import { IMPERIAL_SNIPER } from './ImperialSniper.js';
import { MAGITEK_ARMOUR } from './MagitekArmour.js';
import { BUSSEMAND } from './Bussemand.js';
import { HOBGOBLIN } from './Hobgoblin.js';
import { NECROMANCER } from './Necromancer.js';
import { RED_GIANT } from './RedGiant.js';
import { TITAN } from './Titan.js';

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
 * Derive a re-statted variant of a species.
 * @param {object} base a species definition
 * @param {string} key the new registry key
 * @param {object} over `{ stats, ...anything else to override }`
 */
export function variant(base, key, over = {}) {
  const def = {
    ...base,
    ...over,
    key,
    protoKey: base.protoKey || base.key,
    stats: { ...base.stats, ...(over.stats || {}) },
  };
  // `base.make` builds the base class, so re-point the instance at the
  // variant's data afterwards — one geometry, two creatures.
  def.make = (opts = {}) => {
    const e = base.make(opts);
    e.type = def;
    e.name = def.stats.name;
    e.speciesId = def.questId || key;
    e.expClass = def.expClass || e.expClass;
    e.boss = !!def.boss;
    e.superArmour = !!def.superArmour;
    e.attacks = def.attacks || e.attacks;
    const s = def.stats;
    e.baseMaxHp = s.hp;
    e.maxHp = opts && opts.maxHp ? opts.maxHp : s.hp;
    e.hp = e.maxHp;
    e.maxPoise = s.poise; e.poise = s.poise;
    e.speed = s.speed; e.damage = s.damage;
    e.attackRange = s.attackRange; e.aggroRange = s.aggroRange;
    e.radius = s.radius; e.height = s.height;
    e.level = (opts && opts.level) || s.level;
    e.faction = def.faction || e.faction;
    return e;
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

/** Every spawnable species, keyed by its registry key. */
export const TYPES = {
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

/** @returns {string[]} */
export function speciesKeys() { return Object.keys(TYPES); }

/** Every species of a faction. @param {'beast'|'daemon'|'imperial'|'astral'} f */
export function byFaction(f) {
  return Object.values(TYPES).filter((t) => (t.faction || 'beast') === f);
}

/**
 * A player-facing bestiary entry, for the HUD / a future Libra scan.
 * @param {string} key
 */
export function entry(key) {
  const t = TYPES[key];
  if (!t) return null;
  const weak = [], strong = [];
  for (const el of ['fire', 'ice', 'lightning', 'dark', 'light']) {
    const pct = t.resistPct?.[el] ?? (t.weakness === el ? 160 : t.resist === el ? 50 : 100);
    if (pct > 110) weak.push(el);
    else if (pct < 90) strong.push(el);
  }
  return {
    key, name: t.stats.name, faction: t.faction || 'beast',
    level: t.stats.level, hp: t.stats.hp, expClass: t.expClass || 'normal',
    weak, strong, weakToWeapons: t.weakTo || [], drops: t.drops || [],
  };
}

export const BESTIARY = TYPES;
