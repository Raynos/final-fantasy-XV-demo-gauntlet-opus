/**
 * Character stat model, FFXV level curve, EXP banking and the damage formula.
 *
 * Faithful bits we model:
 *  - Six core stats: HP, MP, Strength, Vitality, Magic, Spirit.
 *  - Levels 1..99 on a steep late-game EXP curve (~26M total EXP to cap).
 *  - EXP *banks* while you are in the field. It only converts into levels when
 *    the party rests at a haven, caravan or hotel, and the lodging's bonus
 *    multiplies the banked total (Galdin Quay's Mother of Pearl suite = x3.0).
 *  - A damage pipeline with defence mitigation, elemental
 *    resist / weakness / immunity / absorption, critical hits, stagger
 *    multipliers and weapon-type weaknesses.
 *  - Daemons: enemies scale up at night, hard, and gain a dark affinity.
 *
 * Everything here is pure data + pure functions so the combat and UI systems
 * can call it from anywhere without owning any of the state.
 */

import { Rng } from '../../util/Rng.ts';

/* ------------------------------------------------------------------------ */
/* Elements & damage types                                                   */
/* ------------------------------------------------------------------------ */

/** Elemental affinities used by spells, enemies and accessories. */
export const ELEMENTS = ['physical', 'fire', 'ice', 'lightning', 'dark', 'light'];

/** Noctis' five weapon classes plus the party-only classes. */
export const WEAPON_CLASSES = ['sword', 'greatsword', 'polearm', 'dagger', 'firearm', 'shield', 'machinery'];

/**
 * Resistance values are read as "percent of damage taken".
 *   200 = doubly weak, 100 = neutral, 50 = resistant, 0 = immune,
 *   negative = absorbed (heals the target for that fraction).
 */
export const RESIST_NEUTRAL = 100;

/* ------------------------------------------------------------------------ */
/* EXP curve                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Anchor points of the FFXV "EXP required for the next level" curve. Levels in
 * between are log-interpolated, which reproduces the game's smooth
 * multiplicative ramp (roughly x1.14 per level in the mid game, flattening in
 * the eighties) without shipping a 99-entry hand table.
 */
const EXP_ANCHORS: Array<[number, number]> = [
  [1, 50], [2, 130], [3, 220], [4, 320], [5, 430],
  [6, 560], [8, 860], [10, 1200], [13, 2000], [16, 3100],
  [20, 4700], [25, 8000], [30, 12000], [35, 17500], [40, 25000],
  [45, 40000], [50, 60000], [55, 90000], [60, 130000], [65, 190000],
  [70, 270000], [75, 380000], [80, 520000], [85, 700000], [90, 920000],
  [95, 1180000], [98, 1400000],
];

export const MAX_LEVEL = 99;

/** EXP required to go from `level` to `level + 1`. 0 at the cap. */
export function expToNext(level: any) {
  if (level >= MAX_LEVEL) return 0;
  if (level <= EXP_ANCHORS[0][0]) return EXP_ANCHORS[0][1];
  for (let i = 0; i < EXP_ANCHORS.length - 1; i++) {
    const [l0, e0] = EXP_ANCHORS[i];
    const [l1, e1] = EXP_ANCHORS[i + 1];
    if (level >= l0 && level <= l1) {
      if (level === l0) return e0;
      if (level === l1) return e1;
      const t = (level - l0) / (l1 - l0);
      // geometric interpolation keeps the curve smooth in log space
      return Math.round(e0 * Math.pow(e1 / e0, t) / 10) * 10;
    }
  }
  const last = EXP_ANCHORS[EXP_ANCHORS.length - 1];
  return Math.round(last[1] * Math.pow(1.06, level - last[0]) / 10) * 10;
}

/** Cumulative EXP needed to reach `level` from level 1. */
export function totalExpFor(level: any) {
  let sum = 0;
  for (let l = 1; l < Math.min(level, MAX_LEVEL); l++) sum += expToNext(l);
  return sum;
}

/** Prebuilt cumulative table — the menu draws a curve from this. */
export const EXP_TABLE = (() => {
  const t = [];
  let sum = 0;
  for (let l = 1; l <= MAX_LEVEL; l++) {
    t.push({ level: l, toNext: expToNext(l), total: sum });
    sum += expToNext(l);
  }
  return t;
})();

/* ------------------------------------------------------------------------ */
/* Lodging                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Places you can sleep, and the EXP multiplier they apply to the banked total.
 * Havens are free but give no bonus; the fancier the bed the fatter the payout.
 */
export const LODGINGS = {
  haven:            { id: 'haven',            name: 'Haven',                          gil: 0,     bonus: 1.0,  cooking: true,  desc: 'A rune-marked campsite. Safe from daemons; Ignis can cook.' },
  caravan:          { id: 'caravan',          name: 'Trailer',                        gil: 30,   bonus: 1.2,  cooking: false, desc: 'A cramped outpost trailer. Cheap and cheerful.' },
  motel:            { id: 'motel',            name: 'Motel',                          gil: 300,   bonus: 1.5,  cooking: false, desc: 'Roadside beds with actual mattresses.' },
  leville_std:      { id: 'leville_std',      name: 'The Leville — Standard',         gil: 1000,  bonus: 1.5,  cooking: false, desc: 'Lestallum\'s grand old hotel.' },
  leville_deluxe:   { id: 'leville_deluxe',   name: 'The Leville — Deluxe',           gil: 3000,  bonus: 2.0,  cooking: false, desc: 'A suite with a view of the Meteor.' },
  galdin_std:       { id: 'galdin_std',       name: 'Galdin Quay — Bayside',          gil: 5000,  bonus: 2.0,  cooking: false, desc: 'Sea air and a wooden pier.' },
  galdin_pearl:     { id: 'galdin_pearl',     name: 'Galdin Quay — Mother of Pearl',  gil: 10000, bonus: 3.0,  cooking: false, desc: 'The most expensive sleep on Eos, and worth it.' },
  altissia_suite:   { id: 'altissia_suite',   name: 'Maagho Suite, Altissia',         gil: 8000,  bonus: 2.5,  cooking: false, desc: 'Canal-side luxury in Accordo.' },
  regalia:          { id: 'regalia',          name: 'The Regalia',                    gil: 0,     bonus: 1.0,  cooking: false, desc: 'Ignis drives while you doze. Not really rest.' },
};

/* ------------------------------------------------------------------------ */
/* Growth profiles                                                           */
/* ------------------------------------------------------------------------ */

/**
 * Per-character growth. `base` is the level-1 value, `peak` the level-99 value,
 * `curve` shapes the ramp (>1 = back-loaded, <1 = front-loaded). Interpolation
 * is deterministic so a level-53 Gladio is identical in every save.
 */
export const GROWTH = {
  noctis:  { name: 'Noctis',   hp: [520, 8600], mp: [80, 220], strength: [42, 240], vitality: [30, 190], magic: [38, 250], spirit: [30, 200], curve: 1.15 },
  gladio:  { name: 'Gladiolus', hp: [760, 11800], mp: [40, 120], strength: [58, 300], vitality: [46, 260], magic: [16, 90], spirit: [24, 150], curve: 1.10 },
  ignis:   { name: 'Ignis',    hp: [480, 7600], mp: [70, 200], strength: [40, 210], vitality: [28, 170], magic: [34, 230], spirit: [36, 240], curve: 1.12 },
  prompto: { name: 'Prompto',  hp: [440, 6900], mp: [60, 180], strength: [36, 196], vitality: [24, 150], magic: [28, 170], spirit: [26, 165], curve: 1.18 },
};

/** Interpolate a growth pair at a level, rounded to a whole number. */
function growAt(pair: any, level: any, curve: any) {
  const t = Math.pow(Math.max(0, Math.min(1, (level - 1) / (MAX_LEVEL - 1))), curve);
  return Math.round(pair[0] + (pair[1] - pair[0]) * t);
}

/* ------------------------------------------------------------------------ */
/* Stats                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * One character's stat block. Base values come from the growth profile; gear
 * and buffs are layered on top as additive/multiplicative modifiers so nothing
 * ever permanently corrupts the base numbers.
 */
export class Stats {
  ascension!: any;
  buff!: any;
  exp!: number;
  gear!: any;
  hp!: any;
  hpDrain!: number;
  id!: any;
  ko!: boolean;
  level!: number;
  mp!: number;
  name!: any;
  profile!: any;
  /**
   * @param id character key, e.g. 'noctis'
   * @param {object} [opts]
   * 
   */
  constructor(id: string, opts: { level?: number } = {}) {
    this.id = id;
    this.profile = GROWTH[id as keyof typeof GROWTH] || GROWTH.noctis;
    this.name = this.profile.name;
    this.level = Math.max(1, Math.min(MAX_LEVEL, opts.level || 1));
    /** EXP already applied toward the current level. */
    this.exp = opts.exp || 0;
    /** Modifiers contributed by equipment (recomputed by Inventory). */
    this.gear = emptyMods();
    /** Modifiers contributed by meals / spell buffs (recomputed by PartyState). */
    this.buff = emptyMods();
    /** Modifiers contributed by unlocked Ascension nodes. */
    this.ascension = emptyMods();
    /** Max-HP temporarily lost to damage-over-time (FFXV's grey bar).
     *  Must be set before `maxHp` is first read — it is a term in that getter. */
    this.hpDrain = 0;
    this.hp = this.maxHp;
    this.mp = this.maxMp;
    this.ko = false;
  }

  /** Base (pre-gear) value of a core stat at the current level. */
  base(stat: any) {
    const p = this.profile;
    if (!p[stat]) return 0;
    return growAt(p[stat], this.level, p.curve);
  }

  /** Sum of gear + buff + ascension modifiers for a stat. */
  bonus(stat: any) {
    return (this.gear[stat] || 0) + (this.buff[stat] || 0) + (this.ascension[stat] || 0);
  }

  /** Final value of a stat including every modifier. Never below 1. */
  get(stat: any) {
    const flat = this.base(stat) + this.bonus(stat);
    const mult = 1 + ((this.gear.mult?.[stat] || 0) + (this.buff.mult?.[stat] || 0) + (this.ascension.mult?.[stat] || 0));
    return Math.max(stat === 'hp' || stat === 'mp' ? 1 : 0, Math.round(flat * mult));
  }

  get maxHp() { return this.get('hp') - this.hpDrain; }
  get maxMp() { return this.get('mp'); }
  get strength() { return this.get('strength'); }
  get vitality() { return this.get('vitality'); }
  get magic() { return this.get('magic'); }
  get spirit() { return this.get('spirit'); }

  /** Physical attack power = strength + weapon attack. */
  get attack() { return this.strength + (this.gear.attack || 0) + (this.buff.attack || 0) + (this.ascension.attack || 0); }
  /** Magic attack power = magic + gear magic attack. */
  get magicAttack() { return this.magic + (this.gear.magicAttack || 0) + (this.buff.magicAttack || 0); }
  /** Physical mitigation. */
  get defense() { return this.vitality + (this.gear.defense || 0) + (this.buff.defense || 0) + (this.ascension.defense || 0); }
  /** Magical mitigation. */
  get magicDefense() { return this.spirit + (this.gear.magicDefense || 0) + (this.buff.magicDefense || 0); }
  /** Critical rate, 0..1. */
  get critRate() { return clamp01(0.05 + (this.gear.critRate || 0) + (this.buff.critRate || 0) + (this.ascension.critRate || 0)); }
  /** Critical multiplier. */
  get critDamage() { return 1.5 + (this.gear.critDamage || 0) + (this.buff.critDamage || 0) + (this.ascension.critDamage || 0); }

  /** Elemental resistance percent for one element (100 = neutral). */
  resistance(element: any) {
    const g = this.gear.resist?.[element] ?? 0;
    const b = this.buff.resist?.[element] ?? 0;
    const a = this.ascension.resist?.[element] ?? 0;
    return RESIST_NEUTRAL - g - b - a;
  }

  /* -- HP / MP ----------------------------------------------------------- */

  /** Apply damage. Returns the amount actually lost. Sets `ko` at zero. */
  applyDamage(amount: any) {
    const before = this.hp;
    this.hp = Math.max(0, this.hp - Math.max(0, Math.round(amount)));
    if (this.hp === 0) this.ko = true;
    return before - this.hp;
  }

  /** Heal, clamped to max HP. Returns the amount actually restored. */
  heal(amount: any) {
    if (this.ko && amount > 0) this.ko = false;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, Math.round(amount)));
    return this.hp - before;
  }

  /** Spend MP. Returns false (and spends nothing) if there isn't enough. */
  spendMp(amount: any) {
    if (this.mp < amount) return false;
    this.mp -= amount;
    return true;
  }

  restoreMp(amount: any) {
    const before = this.mp;
    this.mp = Math.min(this.maxMp, this.mp + Math.max(0, amount));
    return this.mp - before;
  }

  /** Full heal + revive, as after resting. */
  fullRestore() {
    this.hpDrain = 0;
    this.hp = this.maxHp;
    this.mp = this.maxMp;
    this.ko = false;
  }

  /* -- Levelling --------------------------------------------------------- */

  /**
   * Immediately apply EXP (used by the banking step, not by field kills).
   * @returns levels gained
   */
  applyExp(amount: number): {levels:number[], from:number, to:number} {
    const from = this.level;
    const levels = [];
    let pool = Math.max(0, Math.round(amount));
    this.exp += pool;
    while (this.level < MAX_LEVEL) {
      const need = expToNext(this.level);
      if (this.exp < need) break;
      this.exp -= need;
      this.level++;
      levels.push(this.level);
    }
    if (this.level >= MAX_LEVEL) this.exp = 0;
    // Levelling restores the newly gained HP.
    this.hp = Math.min(this.maxHp, this.hp + (levels.length ? this.get('hp') * 0.15 * levels.length : 0));
    return { levels, from, to: this.level };
  }

  /** Fraction of the way to the next level, 0..1. */
  get expProgress() {
    const need = expToNext(this.level);
    return need === 0 ? 1 : clamp01(this.exp / need);
  }

  /* -- Serialisation ----------------------------------------------------- */

  toJSON() {
    return { id: this.id, level: this.level, exp: this.exp, hp: this.hp, mp: this.mp, ko: this.ko, hpDrain: this.hpDrain };
  }

  static fromJSON(data: any) {
    const s = new Stats(data.id, { level: data.level, exp: data.exp });
    s.hpDrain = data.hpDrain || 0;
    s.hp = data.hp != null ? data.hp : s.maxHp;
    s.mp = data.mp != null ? data.mp : s.maxMp;
    s.ko = !!data.ko;
    return s;
  }
}

/** A blank modifier bucket. */
export function emptyMods() {
  return {
    hp: 0, mp: 0, strength: 0, vitality: 0, magic: 0, spirit: 0,
    attack: 0, magicAttack: 0, defense: 0, magicDefense: 0,
    critRate: 0, critDamage: 0,
    resist: { fire: 0, ice: 0, lightning: 0, dark: 0, light: 0, physical: 0 },
    mult: {},
  };
}

/** Add `src` into `dst` in place (used to fold gear lists into one bucket). */
export function addMods(dst: any, src: any) {
  if (!src) return dst;
  for (const k of Object.keys(src)) {
    if (k === 'resist') {
      for (const e of Object.keys(src.resist || {})) dst.resist[e] = (dst.resist[e] || 0) + src.resist[e];
    } else if (k === 'mult') {
      for (const e of Object.keys(src.mult || {})) dst.mult[e] = (dst.mult[e] || 0) + src.mult[e];
    } else if (typeof src[k] === 'number') {
      dst[k] = (dst[k] || 0) + src[k];
    }
  }
  return dst;
}

/* ------------------------------------------------------------------------ */
/* EXP banking                                                               */
/* ------------------------------------------------------------------------ */

/**
 * The FFXV EXP bank. Field kills, quests and discoveries pile up here; only a
 * night's sleep converts them, multiplied by the lodging bonus.
 */
export class ExpBank {
  banked!: number;
  lifetime!: number;
  multiplier!: number;
  sources!: any;
  constructor() {
    this.banked = 0;
    /** Breakdown by source for the "Camp / Rest" results screen. */
    this.sources = {};
    /** Multiplier from Expericast spells, meals and the Moogle Charm. */
    this.multiplier = 1;
    this.lifetime = 0;
  }

  /**
   * Bank EXP earned in the field.
   * @param [source] label shown on the rest summary
   */
  add(amount: number, source: string = 'battle') {
    const gained = Math.max(0, Math.round(amount * this.multiplier));
    this.banked += gained;
    this.lifetime += gained;
    this.sources[source] = (this.sources[source] || 0) + gained;
    return gained;
  }

  /**
   * Convert the bank into levels for a party.
   * @param lodging one of LODGINGS
   */
  redeem(party: Stats[], lodging: any = LODGINGS.haven): {total:number, bonus:number, perMember:any[], sources:any} {
    const bonus = lodging?.bonus ?? 1;
    const total = Math.round(this.banked * bonus);
    const perMember = party.map((s) => {
      const before = s.level;
      const res = s.applyExp(total);
      return { id: s.id, name: s.name, gained: total, from: before, to: s.level, levels: res.levels };
    });
    const sources = { ...this.sources };
    this.banked = 0;
    this.sources = {};
    return { total, bonus, base: Math.round(total / bonus), perMember, sources };
  }

  toJSON() { return { banked: this.banked, sources: this.sources, multiplier: this.multiplier, lifetime: this.lifetime }; }
  static fromJSON(d: any) {
    const b = new ExpBank();
    if (d) Object.assign(b, { banked: d.banked || 0, sources: d.sources || {}, multiplier: d.multiplier ?? 1, lifetime: d.lifetime || 0 });
    return b;
  }
}

/* ------------------------------------------------------------------------ */
/* Night / daemon scaling                                                    */
/* ------------------------------------------------------------------------ */

/**
 * How much stronger things are after dark. FFXV's rule: the deeper into the
 * night, the higher the level of what crawls out of the ground. Daemons take a
 * further multiplier and become vulnerable to light.
 *
 * @param hour 0..24
 * @param [isDaemon=false]
 */
export function nightScaling(hour: number, isDaemon: boolean = false): {levelBonus:number, attack:number, defense:number, hp:number, dark:number, isNight:boolean, depth:number} {
  const h = ((hour % 24) + 24) % 24;
  // Night runs 19:00 -> 05:00. `depth` peaks at 0..1 in the small hours.
  let depth = 0;
  if (h >= 19) depth = (h - 19) / 5;              // 19:00 -> 00:00 ramps 0..1
  else if (h < 5) depth = 1 - (h / 5) * 0.5;      // 00:00 -> 05:00 falls 1..0.5
  else depth = 0;
  const isNight = depth > 0;
  const daemon = isDaemon ? 1 : 0;
  return {
    isNight,
    depth,
    levelBonus: Math.round(depth * (isDaemon ? 22 : 8)),
    attack: 1 + depth * (0.35 + 0.45 * daemon),
    defense: 1 + depth * (0.20 + 0.30 * daemon),
    hp: 1 + depth * (0.30 + 0.70 * daemon),
    dark: isDaemon ? 1 + depth * 0.5 : 1,
  };
}

/* ------------------------------------------------------------------------ */
/* Damage                                                                    */
/* ------------------------------------------------------------------------ */

const dmgRng = new Rng(0x5eed);

/**
 * Resolve an elemental interaction.
 * @param resistPercent target's resistance for the element
 */
export function resolveElement(resistPercent: number): {mult:number, kind:'absorb'|'immune'|'resist'|'neutral'|'weak'} {
  const p = resistPercent;
  if (p < 0) return { mult: p / 100, kind: 'absorb' };
  if (p === 0) return { mult: 0, kind: 'immune' };
  if (p < 100) return { mult: p / 100, kind: 'resist' };
  if (p > 100) return { mult: p / 100, kind: 'weak' };
  return { mult: 1, kind: 'neutral' };
}

/**
 * The damage pipeline. Physical and magical share a shape but read different
 * offence/defence stats, matching FFXV where Strength drives weapons and Magic
 * drives spells.
 *
 * @param {object} opts
 */
export function computeDamage(opts: { attacker: Stats | any, target: any, motion?: number, kind?: 'physical' | 'magical', element?: string, weaponClass?: string, staggerMult?: number, isBackAttack?: boolean, isWarpStrike?: boolean, hour?: number, targetIsDaemon?: boolean, rng?: Rng }): {damage:number, crit:boolean, kind:string, element:string, elementKind:string, absorbed:boolean, weakness:boolean, breakdown:any} {
  const {
    attacker, target,
    motion = 1,
    kind = 'physical',
    element = 'physical',
    weaponClass = null,
    staggerMult = 1,
    isBackAttack = false,
    isWarpStrike = false,
    hour = null,
    targetIsDaemon = false,
    rng = dmgRng,
  } = opts;

  const magical = kind === 'magical';
  const offence = magical
    ? (attacker.magicAttack ?? attacker.magic ?? 1)
    : (attacker.attack ?? attacker.strength ?? 1);

  let defence = magical
    ? (target.magicDefense ?? target.spirit ?? 0)
    : (target.defense ?? target.vitality ?? 0);

  // Night makes everything out there tougher.
  const night = hour == null ? null : nightScaling(hour, targetIsDaemon);
  if (night) defence *= night.defense;

  // Level differential: hitting far above your weight class is punished.
  const lv = (attacker.level || 1) - ((target.level || 1) + (night ? night.levelBonus : 0));
  const levelMod = 1 + Math.max(-0.45, Math.min(0.35, lv * 0.012));

  // Core: attack scaled by the move, softened by defence on a hyperbolic curve
  // so armour never reaches full immunity.
  const raw = offence * motion * levelMod;
  const mitigation = 240 / (240 + Math.max(0, defence));
  let dmg = raw * mitigation;

  // Elemental interaction.
  const resistPct = typeof target.resistance === 'function'
    ? target.resistance(element)
    : (target.resist?.[element] ?? RESIST_NEUTRAL);
  const el = element === 'physical' ? { mult: 1, kind: 'neutral' } : resolveElement(resistPct);
  dmg *= el.mult;

  // Weapon-class weakness — FFXV's "this thing hates greatswords" tell.
  const weakList = target.weakTo || [];
  const weakness = !!(weaponClass && weakList.includes(weaponClass));
  if (weakness) dmg *= 1.5;
  const resistsWeapon = !!(weaponClass && (target.resistsWeapon || []).includes(weaponClass));
  if (resistsWeapon) dmg *= 0.6;

  // Stagger / vulnerable states.
  dmg *= Math.max(0.1, staggerMult);

  // Positional and warp bonuses.
  if (isBackAttack) dmg *= 1.35;
  if (isWarpStrike) dmg *= 1.6;

  // Critical hit.
  const critRate = clamp01((attacker.critRate ?? 0.05) + (isBackAttack ? 0.15 : 0) + (isWarpStrike ? 0.10 : 0));
  const crit = el.kind !== 'immune' && el.kind !== 'absorb' && rng.next() < critRate;
  if (crit) dmg *= (attacker.critDamage ?? 1.5);

  // ±7% variance keeps numbers alive without hiding the underlying maths.
  dmg *= 0.93 + rng.next() * 0.14;

  const absorbed = el.kind === 'absorb';
  const final = el.kind === 'immune' ? 0 : Math.max(absorbed ? -9999 : 1, Math.round(dmg));

  return {
    damage: Math.abs(final),
    healed: absorbed ? Math.abs(final) : 0,
    crit,
    kind,
    element,
    elementKind: el.kind,
    absorbed,
    weakness,
    breakdown: { offence, defence: Math.round(defence), motion, levelMod: +levelMod.toFixed(3), mitigation: +mitigation.toFixed(3), elementMult: el.mult, staggerMult },
  };
}

/**
 * EXP awarded for defeating an enemy. Scales with the enemy's level and a
 * per-archetype multiplier; night-boosted enemies pay out proportionally more.
 *
 * @param enemy {level, expClass?: 'trash'|'normal'|'elite'|'boss'|'daemon'}
 */
export function expForKill(enemy: any, hour: number = null) {
  const CLASS_MULT = { trash: 0.5, normal: 1, elite: 2.2, boss: 6, daemon: 1.6 };
  const m = CLASS_MULT[enemy.expClass as keyof typeof CLASS_MULT] ?? 1;
  const lv = enemy.level || 1;
  const base = 12 + Math.pow(lv, 1.85) * 1.6;
  const night = hour == null ? 1 : (1 + nightScaling(hour, enemy.expClass === 'daemon').depth * 0.6);
  return Math.round(base * m * night);
}

function clamp01(v: any) { return v < 0 ? 0 : v > 1 ? 1 : v; }

export default Stats;
