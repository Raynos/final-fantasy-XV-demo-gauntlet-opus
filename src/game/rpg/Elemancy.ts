/**
 * Elemancy — FFXV's spellcrafting.
 *
 * The loop: find an elemental deposit in the world, *draw* Fire / Ice /
 * Lightning energy from it, then mix energy with an optional catalyst item and
 * a potency to craft a flask. Everything about the resulting spell — its name,
 * tier, damage, blast radius, number of casts and its side-effects — is
 * *computed* from the mixture. Nothing here is a lookup of a finished spell.
 *
 * Potency tiers follow the games's thresholds:
 *   1..99   -> Fire      / Blizzard  / Thunder
 *   100..199-> Fira      / Blizzara  / Thundara
 *   200+    -> Firaga    / Blizzaga  / Thundaga
 *
 * Because each element caps at 99 units, a pure single-element flask tops out
 * at tier one unless you feed it catalysts — exactly as in the game.
 */

import { ITEMS } from './Inventory.ts';
import type { Emitter } from './Emitter.ts';
import type { Inventory, CatalystDef } from './Inventory.ts';
import type { Ascension } from './Ascension.ts';

/* ------------------------------------------------------------------------ */
/* Elements                                                                  */
/* ------------------------------------------------------------------------ */

export const MAGIC_ELEMENTS: MagicElement[] = ['fire', 'ice', 'lightning'];

/** Tier names per element. Index 0 = tier 1. */
export const SPELL_NAMES: Record<MagicElement, string[]> = {
  fire:      ['Fire', 'Fira', 'Firaga'],
  ice:       ['Blizzard', 'Blizzara', 'Blizzaga'],
  lightning: ['Thunder', 'Thundara', 'Thundaga'],
};

/** Colour hints so the VFX system doesn't need its own table. */
export const ELEMENT_COLOR = { fire: '#ff6a2a', ice: '#7fd8ff', lightning: '#ffe36a' };

/** Named combinations when a second element makes up a real share of the mix. */
const HYBRIDS = {
  'fire+ice':        { name: 'Thermal Shock', desc: 'Alternating heat and frost cracks armour.', payload: { defenseBreak: 0.25 } },
  'fire+lightning':  { name: 'Plasma Burst',  desc: 'Superheated arc. Chains between nearby foes.', payload: { chain: 3 } },
  'ice+lightning':   { name: 'Superconductor',desc: 'Frozen targets take a doubled shock.', payload: { critBonus: 0.25 } },
  'fire+ice+lightning': { name: 'Elemental Chaos', desc: 'All three elements at once. Wildly unstable.', payload: { randomElement: true, damage: 0.35 } },
};

/** Base energy cap per element (raised by the Elemental Reserve node). */
export const BASE_ENERGY_CAP = 99;

/* ------------------------------------------------------------------------ */
/* Deposits                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Elemental deposits scattered around the map, in world coordinates. `yield`
 * is the base number of units a full draw gives; deposits deplete and refill
 * over in-game hours.
 */
/** A place in the world energy can be drawn from. */
export interface Deposit {
  id: string;
  name: string;
  element: MagicElement;
  /** World position `[x, y, z]`. */
  pos: number[];
  /** Units available before it runs dry. */
  capacity: number;
  /** In-game hours it takes to refill. */
  refill: number;
}

export const DEPOSITS: Deposit[] = [
  { id: 'dep_hammerhead',  name: 'Hammerhead Verge',    element: 'fire',      pos: [42, 0, -118], capacity: 40, refill: 6 },
  { id: 'dep_prairie',     name: 'Prairie Outpost Vent', element: 'lightning', pos: [-96, 0, 64],  capacity: 32, refill: 6 },
  { id: 'dep_longwythe',   name: 'Longwythe Scarp',     element: 'ice',       pos: [130, 0, 88],  capacity: 36, refill: 8 },
  { id: 'dep_keycatrich',  name: 'Keycatrich Ruin',     element: 'fire',      pos: [-160, 0, -140], capacity: 55, refill: 10 },
  { id: 'dep_galdin',      name: 'Galdin Tidepool',     element: 'ice',       pos: [210, 0, 260], capacity: 60, refill: 8 },
  { id: 'dep_disc',        name: 'Disc of Cauthess',    element: 'fire',      pos: [-320, 0, 180], capacity: 99, refill: 12 },
  { id: 'dep_vesperpool',  name: 'Vesperpool Shallows', element: 'lightning', pos: [-40, 0, 320], capacity: 80, refill: 10 },
  { id: 'dep_ravatogh',    name: 'Rock of Ravatogh',    element: 'fire',      pos: [380, 0, -260], capacity: 99, refill: 14 },
  { id: 'dep_glacial',     name: 'Greyshire Glacial Grotto', element: 'ice',  pos: [-260, 0, 340], capacity: 90, refill: 12 },
  { id: 'dep_fociaugh',    name: 'Fociaugh Hollow',     element: 'lightning', pos: [96, 0, 410],  capacity: 70, refill: 10 },
];

/* ------------------------------------------------------------------------ */
/* Crafting maths                                                            */
/* ------------------------------------------------------------------------ */

/** Potency -> tier index (0..2). */
export function tierFor(potency: number) {
  if (potency >= 200) return 2;
  if (potency >= 100) return 1;
  return 0;
}

/** Roman-ish suffix used when a derived effect stacks above level 3. */
const LEVEL_SUFFIX = ['', '', '+', '++', 'X', 'XX', 'Ω'];

/** The three elements a flask can hold. */
export type MagicElement = 'fire' | 'ice' | 'lightning';

/** How much of each element went into a flask. */
export type EnergyMix = Record<MagicElement, number>;

/** An energy request; missing elements are read as zero. */
export type EnergyRequest = Partial<Record<MagicElement, number>>;

/**
 * What a derived effect actually does. Every field is optional because one
 * effect sets one or two of them -- `craftSpell` folds the whole list down.
 */
export interface EffectPayload {
  /** Times the spell detonates. */
  multicast?: number;
  /** EXP multiplier on kills. */
  expMultiplier?: number;
  /** Fraction of max HP allies in the blast are healed for. */
  healAllies?: number;
  status?: string;
  duration?: number;
  chance?: number;
  instantDeath?: number;
  dispel?: boolean;
  armourPierce?: number;
  /** Fractional change to the blast radius. */
  radius?: number;
  followUp?: string;
  /** Fractional change to the damage multiplier. */
  damage?: number;
  damageCap?: number;
  /** Maxicast: treat potency as at least this. */
  potencyFloor?: number;
  /** Hybrids. */
  defenseBreak?: number;
  chain?: number;
  critBonus?: number;
  randomElement?: boolean;
}

/** @see Elemancy.draw */
export type DrawResult =
  | { ok: true, element: MagicElement, gained: number, remaining: number }
  | { ok: false, reason: 'unknown-deposit' }
  | { ok: false, reason: 'depleted', refillAt: number };

/**
 * @see Elemancy.craft
 *
 * Annotated rather than inferred: a bare `return { ok: false, ... }` widens
 * `ok` to `boolean`, which stops `if (!res.ok)` narrowing at every call site.
 */
export type CraftResult =
  | { ok: true, spell: CarriedSpell }
  | SpellRefused;

/** @see Elemancy.cast */
export type CastResult =
  | { ok: true, spell: CarriedSpell, remaining: number }
  | { ok: false, reason: 'unknown-spell' | 'no-casts-left' };

/** The serialised flask. */
export interface ElemancySave {
  energy?: Partial<EnergyMix>;
  deposits?: Record<string, { drawn: number, refillAt: number }>;
  spells?: CarriedSpell[];
  equipped?: (string | null)[];
}

/** One derived side effect of a flask. */
export interface SpellEffect {
  name: string;
  level: number;
  desc: string;
  payload: EffectPayload;
}

/** What `craftSpell` produced, when it produced something. */
export interface SpellDef {
  ok: true;
  id: string;
  name: string;
  /** The tier name without the effect prefix -- 'Fira', 'Blizzaga'. */
  family: string;
  element: MagicElement;
  /** 1..4, one higher than the internal tier index. */
  tier: number;
  potency: number;
  purity: number;
  damage: number;
  damageCap: number;
  radius: number;
  casts: number;
  multicast: number;
  mpCost: number;
  effects: SpellEffect[];
  mix: EnergyMix;
  catalyst: { id: string, name: string, count: number, level: number } | null;
  description: string;
}

/** Why a craft produced nothing. */
export interface SpellRefused {
  ok: false;
  reason: string;
  element?: string;
}

/** A crafted spell once it is in the bag: it has an identity and a charge. */
export interface CarriedSpell extends SpellDef {
  /** Unique per instance, so two identical flasks are still two flasks. */
  uid: string;
  /** Casts left. */
  remaining: number;
}

/**
 * Turn a catalyst's threshold table into a concrete level for a given count.
 * @param cat catalyst payload from the item table
 * @param count how many were thrown in
 * @param bonus fractional bonus from the Ascension grid
 */
function catalystLevel(cat: CatalystDef, count: number, bonus: number = 0) {
  const effective = count * (1 + bonus);
  let level = 0;
  for (const [need, lv] of cat.thresholds) if (effective >= need) level = lv;
  return level;
}

/**
 * Derived side effects, computed from catalyst tags, catalyst level, the
 * element mix and the tier. This is the heart of Elemancy: the same catalyst
 * behaves very differently at 1 unit and at 40.
 *
 */
function deriveEffects({ cat, catLevel, tier, mix, dominant, purity, total }: {
  cat: CatalystDef | null,
  catLevel: number,
  tier: number,
  mix: EnergyMix,
  dominant: MagicElement,
  purity: number,
  total: number,
}): SpellEffect[] {
  const effects: SpellEffect[] = [];
  const add = (name: string, level: number, desc: string, payload: EffectPayload) => effects.push({ name, level, desc, payload });

  if (cat && catLevel > 0) {
    const tags = cat.tags || [];
    const suffix = LEVEL_SUFFIX[Math.min(catLevel, LEVEL_SUFFIX.length - 1)];

    if (tags.includes('multi')) {
      const casts = Math.min(5, 1 + catLevel);
      const MULTI = { 2: 'Dualcast', 3: 'Tricast', 4: 'Quadcast', 5: 'Quintcast' };
      add(MULTI[casts as keyof typeof MULTI] || 'Dualcast', catLevel, `The spell detonates ${casts} times in succession.`, { multicast: casts });
    }
    if (tags.includes('exp')) {
      const mult = 1 + catLevel * 0.5;
      add(`Expericast${suffix}`, catLevel, `Kills with this spell yield ${Math.round(mult * 100)}% EXP.`, { expMultiplier: mult });
    }
    if (tags.includes('heal')) {
      const pct = 0.1 * catLevel + tier * 0.05;
      add(`Healcast${suffix}`, catLevel, `Allies caught in the blast are healed for ${Math.round(pct * 100)}% of their max HP instead of harmed.`, { healAllies: pct });
    }
    if (tags.includes('poison') || (tags.includes('status') && cat.effect === 'Venomcast')) {
      const NAMES = ['', 'Poison', 'Poisonra', 'Poisonga'];
      add(NAMES[Math.min(3, catLevel)], catLevel, 'Inflicts poison on everything in the blast.', { status: 'poison', duration: 20 + catLevel * 10 });
    }
    if (cat.effect === 'Toadcast') {
      add(`Toadcast${suffix}`, catLevel, 'A chance to turn the target into something small and damp.', { status: 'toad', chance: 0.1 * catLevel });
    }
    if (cat.effect === 'Stopcast') {
      add(`Stopcast${suffix}`, catLevel, 'Freezes the target in time on impact.', { status: 'stop', chance: 0.08 * catLevel, duration: 3 + catLevel });
    }
    if (tags.includes('death')) {
      add(`Killcast${suffix}`, catLevel, 'A chance to instantly finish anything that is not a boss.', { instantDeath: 0.05 * catLevel });
    }
    if (tags.includes('dispel')) {
      add(`Dispelcast${suffix}`, catLevel, 'Strips enemy buffs and magitek shields.', { dispel: true });
    }
    if (tags.includes('pierce')) {
      add(`Ruinous${suffix}`, catLevel, 'The blast punches through armour and cover.', { armourPierce: 0.25 * catLevel });
    }
    if (tags.includes('area')) {
      add(`Quakecast${suffix}`, catLevel, 'Widens the blast radius considerably.', { radius: 0.5 * catLevel });
    }
    if (tags.includes('lightning')) {
      add(`Stormcast${suffix}`, catLevel, 'Calls a follow-up bolt on the largest target.', { followUp: 'lightning', damage: 0.2 * catLevel });
    }
    if (tags.includes('limit')) {
      add(`Limit Break${suffix}`, catLevel, 'Raises the damage cap from 9,999 to 99,999.', { damageCap: 99999, damage: 0.15 * catLevel });
    }
    if (cat.effect === 'Maxicast') {
      add('Maxicast', catLevel, 'Potency is treated as if it were maxed out.', { potencyFloor: 200 });
    }
  }

  // Hybrid element interactions — only when a second element is a real share.
  const present = MAGIC_ELEMENTS.filter((e) => mix[e] > 0 && mix[e] / Math.max(1, total) >= 0.2);
  if (present.length > 1) {
    const key = present.sort().join('+');
    const hybrid = HYBRIDS[key as keyof typeof HYBRIDS] || HYBRIDS[MAGIC_ELEMENTS.slice().sort().join('+') as keyof typeof HYBRIDS];
    if (hybrid) add(hybrid.name, present.length, hybrid.desc, hybrid.payload);
  }

  // A very pure, very strong flask focuses into a tight, brutal blast.
  if (purity > 0.95 && tier >= 2) {
    add('Focused', 3, `A pure ${dominant} flask. Smaller blast, far more damage.`, { damage: 0.25, radius: -0.3 });
  }

  return effects;
}

/**
 * Craft a spell from a mixture. Pure function — call it to preview a result
 * before committing energy.
 *
 * @param {object} opts
 * @returns the crafted spell definition
 */
export function craftSpell(opts: { energy: EnergyRequest, catalyst?: {id:string, count:number} | null, spellPower?: number, catalystPower?: number, triElemental?: boolean, magic?: number }): SpellDef | SpellRefused {
  const energy = opts.energy || {};
  const mix = {
    fire: Math.max(0, Math.floor(energy.fire || 0)),
    ice: Math.max(0, Math.floor(energy.ice || 0)),
    lightning: Math.max(0, Math.floor(energy.lightning || 0)),
  };
  const total = mix.fire + mix.ice + mix.lightning;
  if (total <= 0) return { ok: false, reason: 'no-energy' };

  const spellPower = opts.spellPower || 0;
  const catalystPower = opts.catalystPower || 0;
  const magic = opts.magic ?? 100;

  // Dominant element decides the spell family. Ties resolve fire > ice > lightning.
  let dominant: MagicElement = 'fire';
  for (const e of MAGIC_ELEMENTS) if (mix[e] > mix[dominant]) dominant = e;
  const purity = mix[dominant] / total;

  // Mixing dilutes potency slightly unless Tri-Elemental is unlocked.
  const mixPenalty = opts.triElemental ? 1 : 0.85 + 0.15 * purity;

  // Catalyst contribution.
  const catDef = opts.catalyst?.id ? ITEMS[opts.catalyst.id] : null;
  const cat = catDef?.catalyst || null;
  const catCount = Math.max(0, Math.floor(opts.catalyst?.count || 0));
  const catLevel = cat && catCount > 0 ? catalystLevel(cat, catCount, catalystPower) : 0;
  const catPotency = cat ? cat.potency * catCount * (1 + catalystPower) : 0;

  let potency = Math.round((total + catPotency) * mixPenalty * (1 + spellPower));

  // Effects can floor the potency (Maxicast) — derive once, apply, derive again
  // so names reflect the final tier.
  let tier = tierFor(potency);
  let effects = deriveEffects({ cat, catLevel, tier, mix, dominant, purity, total });
  const floor = effects.find((e) => e.payload.potencyFloor);
  if (floor && floor.payload.potencyFloor != null) { potency = Math.max(potency, floor.payload.potencyFloor); tier = tierFor(potency); }
  effects = deriveEffects({ cat, catLevel, tier, mix, dominant, purity, total });

  // Damage: potency drives the curve, the caster's Magic scales it.
  let damageMult = 1;
  let radius = 4 + tier * 2;
  let casts = Math.max(1, 1 + Math.floor(catCount / 12) + (tier === 0 ? 2 : tier === 1 ? 1 : 0));
  let multicast = 1;
  let damageCap = 9999;
  for (const e of effects) {
    if (e.payload.damage) damageMult += e.payload.damage;
    if (e.payload.radius) radius *= 1 + e.payload.radius;
    if (e.payload.multicast) multicast = Math.max(multicast, e.payload.multicast);
    if (e.payload.damageCap) damageCap = Math.max(damageCap, e.payload.damageCap);
  }

  const basePower = Math.pow(potency, 1.25) * 0.9;
  const damage = Math.min(damageCap, Math.round(basePower * (0.6 + magic / 160) * damageMult));

  // Name: [primary effect] [tier name]. Multicast wins the prefix if present.
  const family = SPELL_NAMES[dominant][tier];
  const prefixEffect = effects.find((e) => e.payload.multicast)
    || effects.find((e) => e.payload.healAllies)
    || effects.find((e) => e.payload.expMultiplier)
    || effects[0];
  const name = prefixEffect ? `${prefixEffect.name} ${family}` : family;

  return {
    ok: true,
    id: `spell_${dominant}_${tier}_${potency}_${(prefixEffect?.name || 'plain').replace(/\W/g, '')}`.toLowerCase(),
    name,
    family,
    element: dominant,
    tier: tier + 1,
    potency,
    purity: +purity.toFixed(3),
    damage,
    damageCap,
    radius: +radius.toFixed(1),
    casts: Math.min(9, casts),
    multicast,
    mpCost: 10 + tier * 15,
    effects,
    mix,
    catalyst: catDef ? { id: catDef.id, name: catDef.name, count: catCount, level: catLevel } : null,
    description: buildDescription({ name, dominant, tier, damage, radius, effects }),
  };
}

function buildDescription({ name, dominant, tier, damage, radius, effects }: {
  name: string, dominant: string, tier: number, damage: number, radius: number, effects: SpellEffect[],
}) {
  const bits = [`${name} — a tier-${tier + 1} ${dominant} flask dealing about ${damage.toLocaleString()} damage in a ${radius.toFixed(0)}m blast.`];
  for (const e of effects) bits.push(`${e.name}: ${e.desc}`);
  return bits.join(' ');
}

/* ------------------------------------------------------------------------ */
/* Elemancy state                                                            */
/* ------------------------------------------------------------------------ */

/**
 * The party's magic flask: stored elemental energy, deposit depletion state and
 * the crafted spells they are carrying. Emits `energy-drawn`, `spell-crafted`
 * and `spell-cast`.
 */
export class Elemancy {
  /** Crafted spells the party is carrying. */
  spells!: CarriedSpell[];
  /** Bonuses read from the Ascension grid, refreshed by `RpgSystem`. */
  bonuses!: {
    drawYield: number, spellPower: number, catalystPower: number,
    triElemental: boolean, spellSlots: number,
  };
  capBonus!: number;
  /** Deposit id -> how much has been taken and when it refills. */
  deposits!: Record<string, { drawn: number, refillAt: number }>;
  emitter!: Emitter | null;
  /** Stored energy per element. */
  energy!: EnergyMix;
  /** Spell uids in the quick-cast slots; null is an empty slot. */
  equipped!: (string | null)[];
  inventory!: Inventory | null;
  /**
   * @param [inventory] used to consume catalysts on craft
   */
  constructor(emitter: import('./Emitter.ts').Emitter | null = null, inventory: import('./Inventory.ts').Inventory | null = null) {
    this.emitter = emitter;
    this.inventory = inventory;
    this.energy = { fire: 0, ice: 0, lightning: 0 };
    /** Extra cap from the Ascension grid. */
    this.capBonus = 0;
    this.bonuses = { drawYield: 0, spellPower: 0, catalystPower: 0, triElemental: false, spellSlots: 0 };
    this.deposits = {};
    for (const d of DEPOSITS) this.deposits[d.id] = { drawn: 0, refillAt: 0 };
    this.spells = [];
    this.equipped = [null, null, null];
  }

  /** Current per-element cap. */
  get cap() { return BASE_ENERGY_CAP + this.capBonus; }

  /** Total stored energy across all three elements. */
  get totalEnergy() { return this.energy.fire + this.energy.ice + this.energy.lightning; }

  /** Number of spell slots available (3 base, 4 with Spell Satchel). */
  get slots() { return 3 + (this.bonuses.spellSlots || 0); }

  /** Deposit definitions with their live state merged in. */
  depositList(hour = 0) {
    return DEPOSITS.map((d) => {
      const st = this.deposits[d.id];
      const remaining = Math.max(0, d.capacity - st.drawn);
      return { ...d, remaining, depleted: remaining <= 0, refillAt: st.refillAt, ready: remaining > 0 || hour >= st.refillAt };
    });
  }

  /**
   * Draw energy from a deposit.
   * @param [opts] `{ units, hour }` — units defaults to a full draw
   */
  draw(depositId: string, opts: { units?: number, hour?: number } = {}): DrawResult {
    const def = DEPOSITS.find((d) => d.id === depositId);
    if (!def) return { ok: false, reason: 'unknown-deposit' };
    const st = this.deposits[depositId];
    const hour = opts.hour ?? 0;

    // Deposits recharge over in-game hours.
    if (st.drawn >= def.capacity && hour >= st.refillAt) { st.drawn = 0; st.refillAt = 0; }
    const remaining = def.capacity - st.drawn;
    if (remaining <= 0) return { ok: false, reason: 'depleted', refillAt: st.refillAt };

    const want = Math.max(1, Math.floor(opts.units ?? Math.min(remaining, 12)));
    const yieldMult = 1 + (this.bonuses.drawYield || 0);
    const raw = Math.min(remaining, want);
    const headroom = this.cap - this.energy[def.element];
    const gained = Math.max(0, Math.min(headroom, Math.round(raw * yieldMult)));

    st.drawn += raw;
    if (st.drawn >= def.capacity) st.refillAt = hour + def.refill;
    this.energy[def.element] += gained;

    this.emitter?.emit('energy-drawn', { deposit: def.id, element: def.element, gained, energy: { ...this.energy }, depleted: st.drawn >= def.capacity });
    return { ok: true, element: def.element, gained, remaining: def.capacity - st.drawn };
  }

  /** Add energy directly (enemy drops, story grants, debug). */
  addEnergy(element: MagicElement, units: number) {
    if (!MAGIC_ELEMENTS.includes(element)) return 0;
    const before = this.energy[element];
    this.energy[element] = Math.min(this.cap, before + Math.max(0, Math.floor(units)));
    const gained = this.energy[element] - before;
    if (gained) this.emitter?.emit('energy-drawn', { deposit: null, element, gained, energy: { ...this.energy } });
    return gained;
  }

  /** Preview a craft without spending anything. */
  preview(energy: EnergyRequest, catalyst: { id: string, count: number } | null = null, magic = 100) {
    return craftSpell({
      energy, catalyst, magic,
      spellPower: this.bonuses.spellPower,
      catalystPower: this.bonuses.catalystPower,
      triElemental: this.bonuses.triElemental,
    });
  }

  /**
   * Craft a spell for real: spends energy and catalyst items and stores the
   * result in the spell list.
   *
   */
  craft(energy: {fire?:number, ice?:number, lightning?:number}, catalyst: {id:string, count:number} | null = null, magic: number = 100): CraftResult {
    const want = {
      fire: Math.max(0, Math.floor(energy?.fire || 0)),
      ice: Math.max(0, Math.floor(energy?.ice || 0)),
      lightning: Math.max(0, Math.floor(energy?.lightning || 0)),
    };
    for (const e of MAGIC_ELEMENTS) {
      if (want[e] > this.energy[e]) return { ok: false, reason: 'not-enough-energy', element: e };
    }
    if (want.fire + want.ice + want.lightning <= 0) return { ok: false, reason: 'no-energy' };

    if (catalyst?.id) {
      const def = ITEMS[catalyst.id];
      if (!def?.catalyst) return { ok: false, reason: 'not-a-catalyst' };
      if (this.inventory && !this.inventory.has(catalyst.id, catalyst.count || 1)) {
        return { ok: false, reason: 'not-enough-catalyst' };
      }
    }

    const rolled = this.preview(want, catalyst, magic);
    if (!rolled.ok) return rolled;

    for (const e of MAGIC_ELEMENTS) this.energy[e] -= want[e];
    if (catalyst?.id && this.inventory) this.inventory.remove(catalyst.id, catalyst.count || 1);

    const spell: CarriedSpell = {
      ...rolled,
      uid: `${rolled.id}_${this.spells.length}_${Date.now().toString(36)}`,
      remaining: rolled.casts,
    };
    this.spells.push(spell);

    // Auto-equip into the first free slot so it is immediately usable.
    const free = this.equipped.slice(0, this.slots).indexOf(null);
    if (free >= 0) this.equipped[free] = spell.uid;

    this.emitter?.emit('spell-crafted', { spell, energy: { ...this.energy } });
    return { ok: true, spell };
  }

  /** Find a carried spell by its unique id. */
  spell(uid: string): CarriedSpell | null { return this.spells.find((s) => s.uid === uid) || null; }

  /** Put a spell in a quick-cast slot. */
  equip(slot: number, uid: string | null) {
    if (slot < 0 || slot >= this.slots) return false;
    if (uid !== null && !this.spell(uid)) return false;
    this.equipped[slot] = uid;
    return true;
  }

  /**
   * Consume one cast of a spell.
   */
  cast(uid: string): CastResult {
    const s = this.spell(uid);
    if (!s) return { ok: false, reason: 'unknown-spell' };
    if (s.remaining <= 0) return { ok: false, reason: 'no-casts-left' };
    s.remaining--;
    if (s.remaining === 0) {
      const i = this.spells.indexOf(s);
      this.spells.splice(i, 1);
      for (let k = 0; k < this.equipped.length; k++) if (this.equipped[k] === uid) this.equipped[k] = null;
    }
    this.emitter?.emit('spell-cast', { spell: s, remaining: s.remaining });
    return { ok: true, spell: s, remaining: s.remaining };
  }

  /** Pull Ascension tunables in. Called by RpgSystem whenever a node unlocks. */
  applyAscension(ascension: Ascension) {
    this.bonuses.drawYield = ascension.value('drawYield');
    this.bonuses.spellPower = ascension.value('spellPower');
    this.bonuses.catalystPower = ascension.value('catalystPower');
    this.bonuses.spellSlots = ascension.value('spellSlots');
    this.bonuses.triElemental = ascension.has('tri-elemental');
    this.capBonus = ascension.value('energyCap');
    for (const e of MAGIC_ELEMENTS) this.energy[e] = Math.min(this.cap, this.energy[e]);
  }

  toJSON() {
    return { energy: { ...this.energy }, deposits: this.deposits, spells: this.spells, equipped: this.equipped };
  }

  static fromJSON(data: ElemancySave | null | undefined, emitter: Emitter | null = null, inventory: Inventory | null = null) {
    const el = new Elemancy(emitter, inventory);
    if (!data) return el;
    Object.assign(el.energy, data.energy || {});
    for (const id of Object.keys(el.deposits)) if (data.deposits?.[id]) el.deposits[id] = data.deposits[id];
    el.spells = (data.spells || []).slice();
    el.equipped = (data.equipped || [null, null, null]).slice();
    return el;
  }
}

export default Elemancy;
