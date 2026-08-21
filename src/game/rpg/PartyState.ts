/**
 * Party roster, techniques, the tech bar, affinity/bond levels and Ignis'
 * cooking.
 *
 * Named `PartyState` so it does not collide with the scene-graph `Party` in
 * src/characters/. This module owns *rules*, never transforms or meshes.
 *
 * Cooking is the heart of it: at a haven Ignis turns ingredients into a meal
 * whose buffs last a fixed number of in-game hours, and every meal he cooks
 * pushes his Cooking level, which unlocks better recipes.
 */

import { Stats, emptyMods, addMods } from './Stats.ts';

/* ------------------------------------------------------------------------ */
/* Roster                                                                    */
/* ------------------------------------------------------------------------ */

/** The four of them, and what each one is for. */
export const MEMBERS = [
  { id: 'noctis',  name: 'Noctis Lucis Caelum', role: 'Prince',    weapon: 'sword',      desc: 'Warps, wields the phantom arsenal, and is genuinely bad at mornings.' },
  { id: 'gladio',  name: 'Gladiolus Amicitia',  role: 'Shield',    weapon: 'greatsword', desc: 'The King\'s Shield. Hits things until they stop being a problem.' },
  { id: 'ignis',   name: 'Ignis Scientia',      role: 'Strategist',weapon: 'dagger',     desc: 'Advisor, driver, cook. Has come up with a new recipeh.' },
  { id: 'prompto', name: 'Prompto Argentum',    role: 'Marksman',  weapon: 'firearm',    desc: 'Guns, gadgets, photographs and relentless commentary.' },
];

/* ------------------------------------------------------------------------ */
/* Techniques                                                                */
/* ------------------------------------------------------------------------ */

/**
 * Party techniques. `bars` is the tech-bar cost (the bar has three segments,
 * four with the Tech Reserve node). `motion` feeds straight into
 * `computeDamage`. `advanced` techniques need an Ascension node.
 */
export const TECHNIQUES = {
  gladio: [
    { id: 'tempest',    name: 'Tempest',       bars: 1, motion: 2.4, element: 'physical', desc: 'A spinning sweep that hits everything nearby.', tags: ['aoe'] },
    { id: 'impulse',    name: 'Impulse',       bars: 2, motion: 3.6, element: 'physical', desc: 'A rising cleave that launches the target.', tags: ['launch'], advanced: true },
    { id: 'dawnhammer', name: 'Dawnhammer',    bars: 3, motion: 6.2, element: 'physical', desc: 'An overhead smash. Enormous stagger damage.', tags: ['stagger', 'aoe'], advanced: true },
    { id: 'coverage',   name: 'Coverage',      bars: 1, motion: 0,   element: 'physical', desc: 'Gladio draws every enemy onto himself for fifteen seconds.', tags: ['taunt'] },
  ],
  ignis: [
    { id: 'analyse',    name: 'Analyse',       bars: 1, motion: 0.4, element: 'physical', desc: 'Reveals the target\'s weaknesses to the whole party.', tags: ['libra'] },
    { id: 'enhancement',name: 'Enhancement',   bars: 1, motion: 0,   element: 'physical', desc: 'Ignis coats Noctis\' blade in an element for a time.', tags: ['buff', 'enchant'] },
    { id: 'regroup',    name: 'Regroup',       bars: 2, motion: 0,   element: 'physical', desc: 'Restores HP to the whole party and clears status ailments.', tags: ['heal'], advanced: true },
    { id: 'overwhelm',  name: 'Overwhelm',     bars: 3, motion: 4.8, element: 'physical', desc: 'A flurry of daggers on a single target.', tags: ['single'], advanced: true },
  ],
  prompto: [
    { id: 'piercer',    name: 'Piercer',       bars: 1, motion: 2.0, element: 'physical', desc: 'A single armour-piercing round.', tags: ['pierce', 'ranged'] },
    { id: 'recoil',     name: 'Recoil',        bars: 2, motion: 3.0, element: 'physical', desc: 'A close-range shotgun blast that knocks the target back.', tags: ['ranged', 'knockback'] },
    { id: 'starshell',  name: 'Starshell',     bars: 2, motion: 0.6, element: 'light',    desc: 'A flare that lights the field and burns daemons.', tags: ['light', 'anti-daemon'], advanced: true },
    { id: 'gravisphere',name: 'Gravisphere',   bars: 3, motion: 1.2, element: 'physical', desc: 'Drags every enemy in range into one screaming pile.', tags: ['aoe', 'pull'], advanced: true },
  ],
  noctis: [
    { id: 'armiger',    name: 'Armiger',       bars: 0, motion: 0,   element: 'physical', desc: 'Unleash the royal arms. Uses the Armiger gauge, not the tech bar.', tags: ['armiger'], requiresFlag: 'armiger' },
  ],
};

/** Maximum tech bar segments before Ascension. */
export const BASE_TECH_BARS = 3;

/* ------------------------------------------------------------------------ */
/* Affinity                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Bond levels. Affinity rises from fighting alongside someone, link-strikes,
 * camping and eating what they like. Each level grants a passive.
 */
export const BOND_LEVELS = [
  { level: 0, at: 0,   name: 'Travelling Companion', desc: 'You share a car.' },
  { level: 1, at: 100, name: 'Trusted',              desc: 'Link-strike offers come 15% more often.', effect: { linkRate: 0.15 } },
  { level: 2, at: 280, name: 'Reliable',             desc: 'Their techniques deal 10% more damage.', effect: { techDamage: 0.10 } },
  { level: 3, at: 620, name: 'Kindred',              desc: 'They revive you 50% faster.', effect: { reviveSpeed: 0.50 } },
  { level: 4, at: 1200,name: 'Brother-in-Arms',      desc: 'The tech bar charges 15% faster in their presence.', effect: { techCharge: 0.15 } },
  { level: 5, at: 2200,name: 'Sworn',                desc: 'All their stats +8%, and link-strikes always crit.', effect: { statMult: 0.08, linkCrit: true } },
];

/** Bond level object for a raw affinity value. */
export function bondFor(affinity: any) {
  let out = BOND_LEVELS[0];
  for (const b of BOND_LEVELS) if (affinity >= b.at) out = b;
  return out;
}

/* ------------------------------------------------------------------------ */
/* Recipes                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * @param rank cooking level required (1..10)
 * @param ing ingredient id / count pairs
 * @param buffs Stats modifier bucket contributions
 * @param effects human-readable buff lines for the HUD
 * @param hours in-game hours the buff lasts
 */
const R = (id: string, name: string, rank: number, ing: Array<[string, number]>, buffs: any, effects: string[], hours: number, desc: string) => ({
  id, name, rank, hours, desc, effects,
  ingredients: ing.map(([i, c]) => ({ id: i, count: c })),
  buffs,
});

/** Ignis' notebook — thirty recipes, from roadside skewers to Altissian cake. */
export const RECIPES = [
  R('cup_noodles', 'Cup Noodles', 1, [['cup_noodles', 1]],
    { hp: 200, strength: 20 }, ['Max HP +200', 'Strength +20'], 6,
    'Gladio insists. Nobody argues twice.'),
  R('skewered_trout', 'Skewered Wild Trout', 1, [['alstor_trout', 1], ['leiden_pepper', 1]],
    { hp: 300, spirit: 20 }, ['Max HP +300', 'Spirit +20'], 8,
    'Trout, a stick, and a fire. The first thing Ignis ever cooked outdoors.'),
  R('grilled_wild_trout', 'Grilled Wild Trout', 2, [['alstor_trout', 2], ['duscaen_olives', 1]],
    { hp: 500, magic: 30 }, ['Max HP +500', 'Magic +30'], 10,
    'Crisped skin, olive oil, a squeeze of something sharp.'),
  R('toadstool_skewers', 'Toadstool Meat Skewers', 2, [['anak_meat', 1], ['vesproom', 2]],
    { hp: 400, strength: 30, vitality: 15 }, ['Max HP +400', 'Strength +30', 'Vitality +15'], 8,
    'The mushrooms glow faintly. Ignis says that is fine.'),
  R('lestallum_skewers', 'Lestallum-Style Mystery Meat Skewers', 2, [['luncheon_meat', 2], ['leiden_pepper', 1]],
    { strength: 45 }, ['Strength +45'], 8,
    'Nobody in Lestallum will say what the meat is.'),
  R('lucian_tomato_stew', 'Lucian Tomato Stew', 2, [['lucian_tomato', 3], ['wild_onion', 1]],
    { hp: 600, vitality: 25 }, ['Max HP +600', 'Vitality +25'], 10,
    'Slow-simmered until the tomatoes give up entirely.'),
  R('birdbeast_omelette', 'Birdbeast Egg Omelette', 2, [['birdbeast_egg', 2], ['kettier_ginger', 1]],
    { mp: 20, magic: 25 }, ['Max MP +20', 'Magic +25'], 8,
    'Three folds, no colour. Ignis is very particular.'),
  R('mother_child_rice', 'Mother & Child Rice Bowl', 3, [['chickatrice_breast', 1], ['birdbeast_egg', 2], ['saxham_rice', 1]],
    { hp: 800, strength: 40, vitality: 30 }, ['Max HP +800', 'Strength +40', 'Vitality +30'], 12,
    'A dish with an unfortunate name and an excellent flavour.'),
  R('peppery_daggerquill', 'Peppery Daggerquill Rice', 3, [['daggerquill_breast', 2], ['leiden_pepper', 2], ['saxham_rice', 1]],
    { hp: 700, strength: 50, critRate: 0.04 }, ['Max HP +700', 'Strength +50', 'Critical rate +4%'], 12,
    'Enough pepper to make Prompto cry, which is half the point.'),
  R('croque_madame', 'Croque Madame', 3, [['cleigne_wheat', 1], ['luncheon_meat', 1], ['birdbeast_egg', 1]],
    { hp: 600, mp: 15, spirit: 30 }, ['Max HP +600', 'Max MP +15', 'Spirit +30'], 10,
    'Camp breakfast, executed with unreasonable precision.'),
  R('multi_meat_sandwich', 'Multi-Meat Sandwich', 3, [['anak_meat', 1], ['garula_tenderloin', 1], ['cleigne_wheat', 1]],
    { hp: 1000, strength: 45 }, ['Max HP +1000', 'Strength +45'], 12,
    'Four kinds of meat. Gladio calls it lunch.'),
  R('mushroom_medley', 'Mushroom Medley Skewers', 3, [['vesproom', 2], ['malmashroom', 1], ['schier_turmeric', 1]],
    { mp: 25, magic: 55, resist: { fire: 15 } }, ['Max MP +25', 'Magic +55', 'Fire resistance +15%'], 12,
    'Earthy, faintly narcotic, and very good with turmeric.'),
  R('anchovies_olive_oil', 'Anchovies in Olive Oil', 3, [['cleigne_darkshell', 2], ['duscaen_olives', 2]],
    { spirit: 60, resist: { ice: 20 } }, ['Spirit +60', 'Ice resistance +20%'], 10,
    'A tiny plate that punches enormously above its weight.'),
  R('lasagna_al_forno', 'Lasagna al Forno', 4, [['garula_tenderloin', 1], ['lucian_tomato', 2], ['cleigne_wheat', 2]],
    { hp: 1400, strength: 70, vitality: 40 }, ['Max HP +1400', 'Strength +70', 'Vitality +40'], 14,
    'Six layers. Ignis counted.'),
  R('bulette_steak', 'Bulette Steak', 4, [['dualhorn_steak', 2], ['leiden_pepper', 1], ['wild_onion', 1]],
    { hp: 1600, strength: 85 }, ['Max HP +1600', 'Strength +85'], 14,
    'Seared hard, rested properly, sliced against the grain.'),
  R('chargrilled_herb_fillet', 'Chargrilled Herb Fillet', 4, [['dualhorn_steak', 1], ['kettier_ginger', 2], ['allural_shallot', 1]],
    { hp: 1200, strength: 60, critRate: 0.06 }, ['Max HP +1200', 'Strength +60', 'Critical rate +6%'], 14,
    'Herb crust, pink centre, absolutely no arguments.'),
  R('sea_bass_meuniere', 'Sea Bass Meunière', 4, [['alstor_trout', 2], ['fine_cleigne_wheat', 1], ['duscaen_olives', 1]],
    { mp: 30, magic: 80, spirit: 40 }, ['Max MP +30', 'Magic +80', 'Spirit +40'], 14,
    'Browned butter and a great deal of patience.'),
  R('golden_tail_soup', 'Golden Tail Soup', 5, [['basilisk_ribs', 1], ['schier_turmeric', 2], ['aegir_root', 1]],
    { hp: 1800, vitality: 90, spirit: 60 }, ['Max HP +1800', 'Vitality +90', 'Spirit +60'], 16,
    'Clear, golden, and simmered for most of the night.'),
  R('kennys_original', 'Kenny\'s Original Recipe', 5, [['daggerquill_breast', 3], ['leiden_pepper', 2], ['cleigne_wheat', 1]],
    { hp: 1500, strength: 90, critRate: 0.05 }, ['Max HP +1500', 'Strength +90', 'Critical rate +5%'], 16,
    'Eleven herbs, allegedly. Kenny Crow is not a reliable source.'),
  R('maagho_meat_pie', 'Maagho-Style Meat Pie', 5, [['garula_tenderloin', 2], ['fine_cleigne_wheat', 2], ['wild_onion', 2]],
    { hp: 2200, strength: 75, vitality: 70 }, ['Max HP +2200', 'Strength +75', 'Vitality +70'], 16,
    'Weightlifter\'s pastry from an Altissian bar.'),
  R('fishermans_paella', 'Fisherman\'s Favorite Paella', 5, [['cleigne_darkshell', 3], ['saxham_rice', 2], ['schier_turmeric', 1]],
    { hp: 1400, mp: 35, magic: 95, spirit: 50 }, ['Max HP +1400', 'Max MP +35', 'Magic +95', 'Spirit +50'], 16,
    'A pan the size of a wheel, and not a grain left over.'),
  R('crown_city_fish', 'Crown City Grilled Fish', 6, [['alstor_trout', 3], ['allural_shallot', 2], ['duscaen_olives', 1]],
    { hp: 1600, magic: 110, resist: { lightning: 25 } }, ['Max HP +1600', 'Magic +110', 'Lightning resistance +25%'], 18,
    'The way they did it back home, before the Wall came down.'),
  R('sylkis_salad', 'Sylkis Greens Salad', 6, [['sylkis_greens', 2], ['curiel_greens', 1], ['duscaen_olives', 1]],
    { hp: 1000, mult: { hp: 0.05 } }, ['Max HP +1000 and +5%', 'EXP earned +20%'], 18,
    'Chocobo food, dressed properly. It works on people too.'),
  R('rainbow_sylkis', 'Rainbow Sylkis Salad', 7, [['sylkis_greens', 3], ['curiel_greens', 2], ['ulwaat_berries', 1]],
    { hp: 1800, magic: 60, spirit: 60, mult: { hp: 0.08 } }, ['Max HP +1800 and +8%', 'EXP earned +50%'], 18,
    'Every colour Eos still has, on one plate.'),
  R('garula_steak', 'Garula Tenderloin Steak', 6, [['garula_tenderloin', 3], ['leiden_pepper', 2]],
    { hp: 2600, strength: 120 }, ['Max HP +2600', 'Strength +120'], 18,
    'Three inches thick and cooked exactly once.'),
  R('vesproom_risotto', 'Vesproom Risotto', 7, [['vesproom', 3], ['saxham_rice', 2], ['fine_cleigne_wheat', 1]],
    { mp: 50, magic: 140, spirit: 80 }, ['Max MP +50', 'Magic +140', 'Spirit +80'], 20,
    'Stirred without stopping for twenty minutes. Ignis did not complain.'),
  R('fluffy_chiffon', 'Fluffy Chiffon Cake', 7, [['birdbeast_egg', 3], ['fine_cleigne_wheat', 2], ['ulwaat_berries', 1]],
    { hp: 1200, mp: 60, spirit: 120 }, ['Max HP +1200', 'Max MP +60', 'Spirit +120', 'MP costs reduced by 20%'], 20,
    'Somehow, at a campsite, with a camp stove.'),
  R('ulwaat_cheesecake', 'Ulwaat Berry Cheesecake', 8, [['ulwaat_berries', 2], ['fine_cleigne_wheat', 2], ['birdbeast_egg', 2]],
    { hp: 2000, mp: 60, magic: 100, spirit: 100 }, ['Max HP +2000', 'Max MP +60', 'Magic +100', 'Spirit +100'], 22,
    'Accordo\'s finest berries on Lucian pastry. Diplomatically perfect.'),
  R('memory_lane_pastry', 'Memory Lane Pastry', 9, [['ulwaat_berries', 2], ['fine_cleigne_wheat', 3], ['sylkis_greens', 1]],
    { hp: 2500, mp: 80, strength: 100, magic: 120, spirit: 120 }, ['Max HP +2500', 'Max MP +80', 'Strength +100', 'Magic +120', 'Spirit +120', 'EXP earned +100%'], 24,
    'The dessert Ignis remembers from the Citadel. He got it right on the fourth try.'),
  R('ignis_special', 'A New Recipeh', 10, [['basilisk_ribs', 2], ['ulwaat_berries', 2], ['adamantite', 1], ['sylkis_greens', 2]],
    { hp: 4000, mp: 100, strength: 150, vitality: 130, magic: 150, spirit: 150, critRate: 0.1, resist: { fire: 30, ice: 30, lightning: 30, dark: 30 } },
    ['All stats massively increased', 'All elemental resistance +30%', 'Critical rate +10%', 'EXP earned +100%'], 24,
    'He has been working on this since Hammerhead.'),
];

/** Recipes keyed by id. */
export const RECIPE_TABLE = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

/** Extra effect tags parsed out of the human-readable effect lines. */
function recipeTags(recipe: any) {
  const tags: any = {};
  for (const line of recipe.effects) {
    const exp = /EXP earned \+(\d+)%/.exec(line);
    if (exp) tags.expMultiplier = 1 + Number(exp[1]) / 100;
    if (/MP costs reduced/.test(line)) tags.mpCostMult = 0.8;
  }
  return tags;
}

/* ------------------------------------------------------------------------ */
/* Party state                                                               */
/* ------------------------------------------------------------------------ */

/**
 * The party's rules-side state. Emits `tech-used`, `affinity-changed`,
 * `recipe-learned`, `meal-cooked`, `buff-applied` and `buff-expired`.
 */
export class PartyState {
  techBarBonus!: number;
  activeBuffs!: any[];
  bonuses!: any;
  cookingLevel!: number;
  emitter!: any;
  flags!: Set<any>;
  knownRecipes!: Set<any>;
  mealsCooked!: number;
  members!: any;
  stats!: any;
  techCharge!: number;
  techChargeRate!: number;
  constructor(emitter: import('./Emitter.ts').Emitter | null = null) {
    this.emitter = emitter;

    /** @type {Record<string, Stats>} */
    this.stats = {};
    /** @type {Record<string, {affinity:number, techniques:string[]}>} */
    this.members = {};
    for (const m of MEMBERS) {
      this.stats[m.id] = new Stats(m.id, { level: 1 });
      this.members[m.id] = { ...m, affinity: 0, techniques: TECHNIQUES[m.id as keyof typeof TECHNIQUES].filter((t: any) => !t.advanced && !t.requiresFlag).map((t: any) => t.id) };
    }

    /** Tech bar, 0..maxTechBars in continuous units. */
    this.techCharge = 0;
    this.techBarBonus = 0;
    this.techChargeRate = 0.09;   // bars per second in combat
    /** Ascension tunables, refreshed by RpgSystem. */
    this.bonuses = { techCharge: 0, techDamage: 0, affinityGain: 0, mealDuration: 0 };
    /** Ability flags from the grid. */
    this.flags = new Set();

    /** Ignis' cooking level (1..10) and how many meals he has cooked. */
    this.cookingLevel = 1;
    this.mealsCooked = 0;
    /** @type {Set<string>} recipes Ignis actually knows */
    this.knownRecipes = new Set(['cup_noodles', 'skewered_trout', 'toadstool_skewers', 'lucian_tomato_stew']);
    /** @type {Array<{recipe:object, expiresAt:number, appliedAt:number}>} */
    this.activeBuffs = [];
  }

  /** The four Stats blocks, in roster order. */
  get roster() { return MEMBERS.map((m) => this.stats[m.id]); }

  /** Party average level — used for enemy scaling and quest gating. */
  get averageLevel() {
    return Math.round(this.roster.reduce((a, s) => a + s.level, 0) / this.roster.length);
  }

  /* -- Techniques -------------------------------------------------------- */

  /** Tech bar segments available (3, or 4 with Tech Reserve). */
  get maxTechBars() { return BASE_TECH_BARS + this.techBarBonus; }
  /** Whole segments currently filled. */
  get techBars() { return Math.floor(this.techCharge); }

  /**
   * The technique the HUD shows as this member's signature move: the best one
   * they have actually learned, in authored preference order.
   */
  signatureTechnique(id: string) {
    const prefs = {
      gladio: ['dawnhammer', 'impulse', 'tempest', 'coverage'],
      ignis: ['regroup', 'overwhelm', 'enhancement', 'analyse'],
      prompto: ['starshell', 'gravisphere', 'recoil', 'piercer'],
      noctis: ['armiger'],
    }[id] || [];
    const known = this.techniquesFor(id);
    for (const p of prefs) {
      const t = known.find((k: any) => k.id === p);
      if (t) return t;
    }
    return known[0] || null;
  }

  /** Techniques a member currently has, hydrated. */
  techniquesFor(id: any) {
    const known = this.members[id]?.techniques || [];
    return (TECHNIQUES[id as keyof typeof TECHNIQUES] || []).filter((t: any) => known.includes(t.id));
  }

  /** Every technique the party could fire right now, with affordability. */
  availableTechniques() {
    const out = [];
    for (const m of MEMBERS) {
      for (const t of this.techniquesFor(m.id)) {
        out.push({ ...t, member: m.id, memberName: m.name, affordable: this.techBars >= t.bars });
      }
    }
    return out;
  }

  /** Charge the tech bar (call with dt while in combat). */
  chargeTech(dt: any, inCombat = true) {
    if (!inCombat) return;
    const rate = this.techChargeRate * (1 + this.bonuses.techCharge + this.bondBonus('techCharge'));
    this.techCharge = Math.min(this.maxTechBars, this.techCharge + rate * dt);
  }

  /**
   * Fire a technique. Spends bars and awards affinity.
   */
  useTechnique(memberId: string, techId: string) {
    const tech = (TECHNIQUES[memberId as keyof typeof TECHNIQUES] || []).find((t: any) => t.id === techId);
    if (!tech) return { ok: false, reason: 'unknown-technique' };
    if (!this.members[memberId]?.techniques.includes(techId)) return { ok: false, reason: 'not-learned' };
    if (this.techCharge < tech.bars) return { ok: false, reason: 'not-enough-tech' };
    this.techCharge -= tech.bars;
    this.addAffinity(memberId, 8 + tech.bars * 6);
    const damageMult = 1 + this.bonuses.techDamage + this.bondBonus('techDamage');
    this.emitter?.emit('tech-used', { member: memberId, tech, damageMult, barsLeft: this.techBars });
    return { ok: true, tech, damageMult };
  }

  /** Teach a technique (from an Ascension node). */
  learnTechnique(memberId: any, techId: any) {
    const list = this.members[memberId]?.techniques;
    if (!list || list.includes(techId)) return false;
    if (!(TECHNIQUES[memberId as keyof typeof TECHNIQUES] || []).some((t: any) => t.id === techId)) return false;
    list.push(techId);
    return true;
  }

  /* -- Affinity ---------------------------------------------------------- */

  /** Raise a companion's affinity. */
  addAffinity(memberId: any, amount: any) {
    const m = this.members[memberId];
    if (!m || memberId === 'noctis') return 0;
    const before = bondFor(m.affinity).level;
    const gained = Math.max(0, Math.round(amount * (1 + this.bonuses.affinityGain)));
    m.affinity += gained;
    const bond = bondFor(m.affinity);
    if (bond.level !== before) {
      this.emitter?.emit('affinity-changed', { member: memberId, affinity: m.affinity, bond, levelUp: true });
    }
    return gained;
  }

  /** Bond level object for a member. */
  bond(memberId: any) { return bondFor(this.members[memberId]?.affinity || 0); }

  /** Sum of one bond effect across the three companions. */
  bondBonus(key: any) {
    let sum = 0;
    for (const m of MEMBERS) {
      if (m.id === 'noctis') continue;
      const b = this.bond(m.id);
      for (const level of BOND_LEVELS) {
        if (level.level <= b.level && level.effect?.[key as keyof typeof level.effect]) sum += level.effect[key as keyof typeof level.effect];
      }
    }
    return sum;
  }

  /* -- Cooking ----------------------------------------------------------- */

  /** Recipes Ignis knows, hydrated and sorted by rank. */
  get cookbook() {
    return [...this.knownRecipes].map((id) => RECIPE_TABLE[id]).filter(Boolean)
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  }

  /** Teach Ignis a recipe. */
  learnRecipe(id: any) {
    if (!RECIPE_TABLE[id] || this.knownRecipes.has(id)) return false;
    this.knownRecipes.add(id);
    this.emitter?.emit('recipe-learned', { recipe: RECIPE_TABLE[id] });
    return true;
  }

  /**
   * Can this meal be cooked right now?
   */
  canCook(recipeId: string, inventory: import('./Inventory.ts').Inventory): {ok:boolean, reason?:string, missing?:any[]} {
    const r = RECIPE_TABLE[recipeId];
    if (!r) return { ok: false, reason: 'unknown-recipe' };
    if (!this.knownRecipes.has(recipeId)) return { ok: false, reason: 'not-learned' };
    if (r.rank > this.cookingLevel) return { ok: false, reason: 'cooking-level-too-low' };
    const missing = r.ingredients.filter((i) => !inventory.has(i.id, i.count))
      .map((i) => ({ ...i, have: inventory.count(i.id) }));
    if (missing.length) return { ok: false, reason: 'missing-ingredients', missing };
    return { ok: true };
  }

  /** Every recipe Ignis could cook right now with the bag as it stands. */
  cookableNow(inventory: any) {
    return this.cookbook.filter((r) => this.canCook(r.id, inventory).ok);
  }

  /**
   * Cook a meal. Consumes ingredients, replaces the active meal buff (only one
   * meal at a time, as in the game) and pushes Ignis' cooking level.
   *
   * @param hour current world hour (absolute, monotonically rising)
   */
  cook(recipeId: string, inventory: import('./Inventory.ts').Inventory, hour: number = 0) {
    const check = this.canCook(recipeId, inventory);
    if (!check.ok) return check;
    const r = RECIPE_TABLE[recipeId];
    for (const i of r.ingredients) inventory.remove(i.id, i.count);

    // One meal buff at a time.
    this.activeBuffs = this.activeBuffs.filter((b) => b.kind !== 'meal');
    const duration = r.hours + this.bonuses.mealDuration;
    const buff = {
      kind: 'meal',
      id: r.id,
      name: r.name,
      recipe: r,
      mods: r.buffs,
      tags: recipeTags(r),
      effects: r.effects,
      appliedAt: hour,
      expiresAt: hour + duration,
      hours: duration,
    };
    this.activeBuffs.push(buff);

    this.mealsCooked++;
    const nextLevel = Math.min(10, 1 + Math.floor(Math.sqrt(this.mealsCooked) * 1.4));
    const levelled = nextLevel > this.cookingLevel;
    this.cookingLevel = Math.max(this.cookingLevel, nextLevel);

    // Sharing a meal deepens the bond.
    for (const m of MEMBERS) this.addAffinity(m.id, 20 + r.rank * 5);

    this.applyBuffs();
    this.emitter?.emit('buff-applied', { buff, source: 'meal', cookingLevel: this.cookingLevel, levelled });
    this.emitter?.emit('meal-cooked', { recipe: r, buff, cookingLevel: this.cookingLevel, levelled });
    return { ok: true, buff, cookingLevel: this.cookingLevel, levelled };
  }

  /**
   * Add a non-meal timed buff (a spell effect, an item, Ignis' Enhancement).
   * @param spec `{ id, name, mods, hours, effects }`
   */
  addBuff(spec: any, hour: number = 0) {
    const buff = {
      kind: spec.kind || 'effect',
      id: spec.id, name: spec.name,
      mods: spec.mods || {}, tags: spec.tags || {}, effects: spec.effects || [],
      appliedAt: hour, expiresAt: hour + (spec.hours ?? 1), hours: spec.hours ?? 1,
    };
    this.activeBuffs.push(buff);
    this.applyBuffs();
    this.emitter?.emit('buff-applied', { buff, source: spec.kind || 'effect' });
    return buff;
  }

  /** Drop buffs whose time is up. Call from the day cycle. */
  expireBuffs(hour: any) {
    const before = this.activeBuffs.length;
    const expired = this.activeBuffs.filter((b) => hour >= b.expiresAt);
    if (!expired.length) return [];
    this.activeBuffs = this.activeBuffs.filter((b) => hour < b.expiresAt);
    this.applyBuffs();
    for (const b of expired) this.emitter?.emit('buff-expired', { buff: b });
    return expired;
  }

  /** Fold every active buff into each character's `Stats.buff` bucket. */
  applyBuffs() {
    const merged = emptyMods();
    for (const b of this.activeBuffs) addMods(merged, b.mods);
    for (const s of this.roster) {
      s.buff = emptyMods();
      addMods(s.buff, merged);
      s.hp = Math.min(s.hp, s.maxHp);
      s.mp = Math.min(s.mp, s.maxMp);
    }
    return merged;
  }

  /** EXP multiplier contributed by the current meal. */
  get expMultiplier() {
    let m = 1;
    for (const b of this.activeBuffs) if (b.tags?.expMultiplier) m *= b.tags.expMultiplier;
    return m;
  }

  /** Pull Ascension tunables in. */
  applyAscension(ascension: any) {
    this.bonuses.techCharge = ascension.value('techCharge');
    this.bonuses.techDamage = ascension.value('techDamage');
    this.bonuses.affinityGain = ascension.value('affinityGain');
    this.bonuses.mealDuration = ascension.value('mealDuration');
    this.techBarBonus = ascension.value('techBars');
    this.flags = ascension.activeEffects().flags;

    if (this.flags.has('tech-gladio-advanced')) { this.learnTechnique('gladio', 'impulse'); this.learnTechnique('gladio', 'dawnhammer'); }
    if (this.flags.has('tech-ignis-advanced')) { this.learnTechnique('ignis', 'regroup'); this.learnTechnique('ignis', 'overwhelm'); }
    if (this.flags.has('tech-prompto-advanced')) { this.learnTechnique('prompto', 'starshell'); this.learnTechnique('prompto', 'gravisphere'); }
    if (this.flags.has('armiger')) this.learnTechnique('noctis', 'armiger');

    // Ascension stat nodes feed every member's ascension modifier bucket.
    const mods = ascension.activeEffects().mods;
    for (const s of this.roster) {
      s.ascension = emptyMods();
      addMods(s.ascension, mods);
    }
  }

  /** Full heal everyone (resting, camp nodes). */
  restoreAll() { for (const s of this.roster) s.fullRestore(); }

  toJSON() {
    return {
      stats: Object.fromEntries(MEMBERS.map((m) => [m.id, this.stats[m.id].toJSON()])),
      affinity: Object.fromEntries(MEMBERS.map((m) => [m.id, this.members[m.id].affinity])),
      techniques: Object.fromEntries(MEMBERS.map((m) => [m.id, this.members[m.id].techniques])),
      cookingLevel: this.cookingLevel,
      mealsCooked: this.mealsCooked,
      knownRecipes: [...this.knownRecipes],
      activeBuffs: this.activeBuffs.map((b) => ({ ...b, recipe: undefined })),
      techCharge: this.techCharge,
    };
  }

  static fromJSON(data: any, emitter: any = null) {
    const p = new PartyState(emitter);
    if (!data) return p;
    for (const m of MEMBERS) {
      if (data.stats?.[m.id]) p.stats[m.id] = Stats.fromJSON(data.stats[m.id]);
      if (data.affinity?.[m.id] != null) p.members[m.id].affinity = data.affinity[m.id];
      if (data.techniques?.[m.id]) p.members[m.id].techniques = data.techniques[m.id].slice();
    }
    p.cookingLevel = data.cookingLevel || 1;
    p.mealsCooked = data.mealsCooked || 0;
    p.knownRecipes = new Set(data.knownRecipes || [...p.knownRecipes]);
    p.activeBuffs = (data.activeBuffs || []).map((b: any) => ({ ...b, recipe: RECIPE_TABLE[b.id] || null }));
    p.techCharge = data.techCharge || 0;
    p.applyBuffs();
    return p;
  }
}

export default PartyState;
