/**
 * The Ascension Grid — FFXV's constellation-shaped skill tree.
 *
 * Nine constellations (Armiger, Combat, Teamwork, Techniques, Recovery, Magic,
 * Stats, Exploration, Wait), ~95 nodes, each with an AP cost, prerequisites and
 * an effect payload. AP is earned by *playing well*, not by grinding: warp
 * strikes, parries, link-strikes, quest turn-ins and long drives in the Regalia.
 *
 * The data carries 2D layout coordinates in a normalised -1..1 space so the UI
 * can draw the whole thing as a star map without knowing any of the rules.
 *
 * Effect payloads (consumed via `activeEffects()`):
 *   { stat: 'hp', value: 500 }            flat stat modifier
 *   { mult: 'strength', value: 0.05 }     multiplicative stat modifier
 *   { flag: 'warp-strike-air' }           an ability switch other systems read
 *   { value: 'apGain', amount: 0.10 }     scalar tunable
 */

import { emptyMods, CORE_STATS } from './Stats.ts';
import type { StatKey, StatMods } from './Stats.ts';
import type { Emitter } from './Emitter.ts';

/**
 * What one Ascension node does. Five exclusive arms — a node authors exactly
 * one shape, which is why `activeEffects` dispatches on the first match rather
 * than testing all five.
 */
export type AscensionEffect =
  | { stat: StatKey, value: number }
  | { mult: StatKey, value: number }
  /** Multiply all six core stats by the same amount. */
  | { multAll: number }
  | { flag: string }
  | { value: string, amount: number };

/**
 * A node **as authored** in `CONSTELLATIONS`: no layout resolved, no owning
 * constellation stamped on it yet. `NODES` is the resolved form.
 */
interface AuthoredNode {
  id: string;
  name: string;
  ap: number;
  /** Offset from the constellation origin, roughly -1..1. */
  at: number[];
  /** Prerequisite node ids. Absent on a constellation's root. */
  req?: string[];
  desc: string;
  effect: AscensionEffect;
}

/** One constellation as authored, with its node payloads. */
interface AuthoredConstellation {
  id: string;
  name: string;
  color: string;
  /** Centre in star-map space, `[x, y]`. */
  origin: number[];
  desc: string;
  nodes: AuthoredNode[];
}

/** One node of the Ascension grid, with its layout resolved. */
export interface AscensionNode {
  id: string;
  name: string;
  /** AP it costs to unlock. */
  ap: number;
  /** Offset from the constellation origin, roughly -1..1. */
  at: number[];
  /** Prerequisite node ids. */
  req: string[];
  desc: string;
  effect: AscensionEffect;
  /** Owning constellation id, and its display name and colour. */
  constellation: string;
  constellationName: string;
  color: string;
  /** Absolute star-map position, `[x, y]`. */
  pos: number[];
}

/** One prerequisite line between two nodes. */
export interface AscensionEdge {
  from: string;
  to: string;
  constellation: string;
}

/** One constellation, without its node payloads. */
export interface ConstellationInfo {
  id: string;
  name: string;
  color: string;
  /** Centre in star-map space, `[x, y]`. */
  origin: number[];
  desc: string;
  nodeIds: string[];
  totalAp: number;
}

/** Every unlocked node's effects, folded into one bundle. */
export interface AscensionEffects {
  mods: StatMods;
  flags: Set<string>;
  values: Record<string, number>;
  nodes: string[];
}

/** The serialised Ascension state. */
export interface AscensionSave {
  ap?: number;
  apSpent?: number;
  apLifetime?: number;
  unlocked?: string[];
  /** Part-metres banked toward the next distance award, per rule. */
  distance?: Record<string, number>;
}

/* ------------------------------------------------------------------------ */
/* AP earning rules                                                          */
/* ------------------------------------------------------------------------ */

/**
 * How the party earns Ability Points. Values are per-event unless noted.
 * Keys are the `reason` strings passed to `Ascension.awardAp()`.
 */
/** One way to earn AP. */
export interface ApRule {
  ap: number;
  name: string;
  /** Seconds before the same reason can pay out again. 0 is uncapped. */
  cooldown: number;
  desc: string;
  /** For distance rules: metres per award, accumulated in `_distance`. */
  perUnit?: number;
}

export const AP_RULES: Record<string, ApRule> = {
  'warp-strike':        { ap: 1,  name: 'Warp-strike',              cooldown: 4,  desc: 'Land a warp-strike on an enemy.' },
  'warp-strike-kill':   { ap: 3,  name: 'Warp-strike takedown',     cooldown: 0,  desc: 'Finish an enemy with a warp-strike.' },
  'point-warp':         { ap: 1,  name: 'Point warp',               cooldown: 12, desc: 'Warp to a hanging point and recover MP.' },
  'parry':              { ap: 2,  name: 'Parry',                    cooldown: 2,  desc: 'Parry an incoming attack at the last moment.' },
  'blindside':          { ap: 1,  name: 'Blindside strike',         cooldown: 3,  desc: 'Strike an enemy from behind.' },
  'link-strike':        { ap: 3,  name: 'Link-strike',              cooldown: 0,  desc: 'Chain a blindside link with a party member.' },
  'cross-chain':        { ap: 5,  name: 'Cross chain',              cooldown: 0,  desc: 'Three-way link-strike.' },
  'tech-finish':        { ap: 2,  name: 'Technique finish',         cooldown: 0,  desc: 'Kill with a party technique.' },
  'stagger':            { ap: 2,  name: 'Stagger',                  cooldown: 1,  desc: 'Break an enemy\'s poise.' },
  'boss-kill':          { ap: 25, name: 'Vanquish a great beast',   cooldown: 0,  desc: 'Defeat a boss or hunt target.' },
  'quest-complete':     { ap: 10, name: 'Quest complete',           cooldown: 0,  desc: 'Finish a side quest.' },
  'hunt-complete':      { ap: 15, name: 'Hunt complete',            cooldown: 0,  desc: 'Turn in a hunt at the tipster.' },
  'chapter-complete':   { ap: 50, name: 'Chapter complete',         cooldown: 0,  desc: 'Clear a main-story chapter.' },
  'discovery':          { ap: 5,  name: 'Discovery',                cooldown: 0,  desc: 'Find a new haven, outpost or dungeon.' },
  // Paid by `rpg/Tombs.ts`. Its own rule rather than a multiple of
  // `discovery` because the ascension screen lists the reason it paid for, and
  // "Discovery x5" for the Sword of the Father is not what happened.
  'royal-arm':          { ap: 25, name: 'A royal arm claimed',       cooldown: 0,  desc: 'Take a Lucian king\'s weapon from his tomb.' },
  'regalia-distance':   { ap: 1,  name: 'Road trip',                cooldown: 0,  desc: 'Per 500m driven in the Regalia.', perUnit: 500 },
  'chocobo-distance':   { ap: 1,  name: 'Chocobo ride',             cooldown: 0,  desc: 'Per 400m ridden on a chocobo.', perUnit: 400 },
  'fishing':            { ap: 2,  name: 'Catch of the day',         cooldown: 0,  desc: 'Land a fish.' },
  'photo':              { ap: 1,  name: 'Prompto\'s photo',         cooldown: 0,  desc: 'Keep one of Prompto\'s shots.' },
  'cook':               { ap: 3,  name: 'New recipe',               cooldown: 0,  desc: 'Ignis learns a recipe.' },
  'camp':               { ap: 2,  name: 'A night under the stars',  cooldown: 0,  desc: 'Rest at a haven.' },
};

/* ------------------------------------------------------------------------ */
/* Constellations                                                            */
/* ------------------------------------------------------------------------ */

/**
 * Raw constellation data. `origin` is the constellation's centre in the star
 * map; each node's `at` is an offset from that centre. Both are in a
 * roughly -1..1 space; the UI scales it to whatever canvas it has.
 */
const CONSTELLATIONS: AuthoredConstellation[] = [
  /* ------------------------------------------------------------------ */
  {
    id: 'armiger', name: 'Armiger', color: '#6fd0ff', origin: [0, 0],
    desc: 'The Armiger — the arsenal of the Lucian kings, summoned from the void.',
    nodes: [
      { id: 'arm_awaken',      name: 'Armiger Awakening',   ap: 20,  at: [0, 0],        req: [],                 desc: 'Unlock the Armiger. Fill the gauge in battle and unleash the royal arms.', effect: { flag: 'armiger' } },
      { id: 'arm_gauge1',      name: 'Armiger Extension',   ap: 32,  at: [0.10, -0.12], req: ['arm_awaken'],     desc: 'Armiger lasts 20% longer.', effect: { value: 'armigerDuration', amount: 0.20 } },
      { id: 'arm_gauge2',      name: 'Armiger Extension+',  ap: 66,  at: [0.20, -0.22], req: ['arm_gauge1'],     desc: 'Armiger lasts a further 25% longer.', effect: { value: 'armigerDuration', amount: 0.25 } },
      { id: 'arm_charge1',     name: 'Armiger Charge',      ap: 28,  at: [-0.10, -0.12],req: ['arm_awaken'],     desc: 'The Armiger gauge fills 15% faster.', effect: { value: 'armigerCharge', amount: 0.15 } },
      { id: 'arm_charge2',     name: 'Royal Momentum',      ap: 60,  at: [-0.20, -0.22],req: ['arm_charge1'],    desc: 'Warp-strikes and parries add bonus Armiger charge.', effect: { value: 'armigerCharge', amount: 0.25 } },
      { id: 'arm_phantom',     name: 'Phantom Chain',       ap: 45,  at: [0.14, 0.12],  req: ['arm_awaken'],     desc: 'Extend the royal arms combo by two additional hits.', effect: { value: 'armigerCombo', amount: 2 } },
      { id: 'arm_regen',       name: 'Armiger Regeneration',ap: 55,  at: [-0.14, 0.12], req: ['arm_awaken'],     desc: 'Restore HP for every royal arm that strikes home.', effect: { flag: 'armiger-lifesteal' } },
      { id: 'arm_shield',      name: 'Armiger Barrier',     ap: 48,  at: [0, 0.20],     req: ['arm_awaken'],     desc: 'Damage taken is halved while the Armiger is active.', effect: { value: 'armigerDefense', amount: 0.5 } },
      { id: 'arm_norefund',    name: 'Sovereign Toll',      ap: 72,  at: [0.24, 0.02],  req: ['arm_phantom'],    desc: 'The royal arms no longer drain HP outside the Armiger.', effect: { flag: 'no-royal-arm-drain' } },
      { id: 'arm_unleashed',   name: 'Armiger Unleashed',   ap: 333, at: [0, -0.34],    req: ['arm_gauge2', 'arm_charge2'], desc: 'The full Armiger — thirteen blades at once, and the Lucii at your back.', effect: { flag: 'armiger-unleashed' } },
      { id: 'arm_wardstone',   name: 'Wardstone',           ap: 90,  at: [-0.26, 0.02], req: ['arm_regen'],      desc: 'Surviving a fatal blow leaves you at 1 HP once per battle.', effect: { flag: 'wardstone' } },
      { id: 'arm_kings',       name: 'Kings of Yore',       ap: 200, at: [0, 0.32],     req: ['arm_shield', 'arm_regen'], desc: 'The Lucii lend their strength: +10% damage with every weapon.', effect: { mult: 'strength', value: 0.10 } },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'combat', name: 'Combat', color: '#ff8a5c', origin: [-1.15, -0.55],
    desc: 'Blade, warp and the space between them.',
    nodes: [
      { id: 'cbt_airstep',     name: 'Airstepper',          ap: 8,   at: [0, 0],        req: [],                 desc: 'Chain a second attack in mid-air.', effect: { flag: 'air-step' } },
      { id: 'cbt_airdance',    name: 'Air Dance',           ap: 18,  at: [0.14, -0.10], req: ['cbt_airstep'],    desc: 'Chain a third and fourth aerial attack.', effect: { value: 'airCombo', amount: 2 } },
      { id: 'cbt_aerialace',   name: 'Aerial Ace',          ap: 42,  at: [0.28, -0.18], req: ['cbt_airdance'],   desc: 'Aerial attacks deal 25% more damage.', effect: { value: 'airDamage', amount: 0.25 } },
      { id: 'cbt_warpdmg1',    name: 'Warp-Strike Focus',   ap: 12,  at: [-0.14, -0.10],req: [],                 desc: 'Warp-strike damage +15%.', effect: { value: 'warpDamage', amount: 0.15 } },
      { id: 'cbt_warpdmg2',    name: 'Warp-Strike Mastery', ap: 40,  at: [-0.28, -0.18],req: ['cbt_warpdmg1'],   desc: 'Warp-strike damage +25% more.', effect: { value: 'warpDamage', amount: 0.25 } },
      { id: 'cbt_warpfactor',  name: 'Warp Factor',         ap: 30,  at: [-0.30, 0.02], req: ['cbt_warpdmg1'],   desc: 'Warping costs 20% less MP.', effect: { value: 'warpCost', amount: -0.20 } },
      { id: 'cbt_warpfactor2', name: 'Warp Factor+',        ap: 68,  at: [-0.42, 0.10], req: ['cbt_warpfactor'], desc: 'Warping costs a further 20% less MP.', effect: { value: 'warpCost', amount: -0.20 } },
      { id: 'cbt_deathblow',   name: 'Death Blow',          ap: 25,  at: [0.06, 0.14],  req: [],                 desc: 'Hold the attack button for a heavy finisher.', effect: { flag: 'death-blow' } },
      { id: 'cbt_ripper',      name: 'Ripper',              ap: 55,  at: [0.18, 0.22],  req: ['cbt_deathblow'],  desc: 'Death Blow rends armour, reducing enemy defence.', effect: { flag: 'armour-rend' } },
      { id: 'cbt_parry',       name: 'Rebuff',              ap: 14,  at: [-0.06, 0.16], req: [],                 desc: 'Widen the parry window by 30%.', effect: { value: 'parryWindow', amount: 0.30 } },
      { id: 'cbt_riposte',     name: 'Riposte',             ap: 36,  at: [-0.18, 0.24], req: ['cbt_parry'],      desc: 'A successful parry opens an automatic counter.', effect: { flag: 'riposte' } },
      { id: 'cbt_impulse',     name: 'Blind Impulse',       ap: 48,  at: [0, 0.32],     req: ['cbt_riposte'],    desc: 'Counters from a parry always crit.', effect: { flag: 'counter-crit' } },
      { id: 'cbt_dodge',       name: 'Evasive Footwork',    ap: 20,  at: [0.30, 0.06],  req: [],                 desc: 'Phasing out of an attack costs 25% less MP.', effect: { value: 'phaseCost', amount: -0.25 } },
      { id: 'cbt_stamina',     name: 'Endless Stamina',     ap: 44,  at: [0.42, 0.14],  req: ['cbt_dodge'],      desc: 'Sprint and hang without draining stamina as fast.', effect: { value: 'stamina', amount: 0.35 } },
      { id: 'cbt_crit',        name: 'Killer Instinct',     ap: 58,  at: [0.34, -0.30], req: ['cbt_aerialace'],  desc: 'Critical rate +8%.', effect: { stat: 'critRate', value: 0.08 } },
      { id: 'cbt_critdmg',     name: 'Deathblow Precision', ap: 96,  at: [0.44, -0.38], req: ['cbt_crit'],       desc: 'Critical damage +30%.', effect: { stat: 'critDamage', value: 0.30 } },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'teamwork', name: 'Teamwork', color: '#ffd479', origin: [1.15, -0.55],
    desc: 'Four men, one road. The bonds that make a party more than a crowd.',
    nodes: [
      { id: 'tw_link1',        name: 'Link Boost',          ap: 12,  at: [0, 0],        req: [],                 desc: 'Link-strike damage +20%.', effect: { value: 'linkDamage', amount: 0.20 } },
      { id: 'tw_link2',        name: 'Link Boost+',         ap: 38,  at: [0.14, -0.12], req: ['tw_link1'],       desc: 'Link-strike damage +30% more.', effect: { value: 'linkDamage', amount: 0.30 } },
      { id: 'tw_linkrate',     name: 'Link-Up',             ap: 26,  at: [-0.14, -0.12],req: ['tw_link1'],       desc: 'Allies offer link-strikes far more often.', effect: { value: 'linkRate', amount: 0.5 } },
      { id: 'tw_cross',        name: 'Cross Chain',         ap: 72,  at: [0, -0.24],    req: ['tw_link2', 'tw_linkrate'], desc: 'Three party members can chain a single link.', effect: { flag: 'cross-chain' } },
      { id: 'tw_rescue',       name: 'Rescue',              ap: 18,  at: [0.16, 0.12],  req: [],                 desc: 'Allies revive you faster when you go down.', effect: { value: 'reviveSpeed', amount: 0.4 } },
      { id: 'tw_rescue2',      name: 'Comrade\'s Cry',      ap: 46,  at: [0.28, 0.20],  req: ['tw_rescue'],      desc: 'A revived ally returns with 50% HP.', effect: { value: 'reviveHp', amount: 0.5 } },
      { id: 'tw_bond1',        name: 'Bond of Trust',       ap: 34,  at: [-0.16, 0.12], req: [],                 desc: 'Affinity with each companion rises 30% faster.', effect: { value: 'affinityGain', amount: 0.30 } },
      { id: 'tw_bond2',        name: 'Brothers in Arms',    ap: 88,  at: [-0.28, 0.20], req: ['tw_bond1'],       desc: 'At max affinity, allies gain +10% to all stats.', effect: { flag: 'bond-mastery' } },
      { id: 'tw_ai_aggr',      name: 'Aggressive Stance',   ap: 30,  at: [0.30, -0.06], req: ['tw_link1'],       desc: 'Allies press the attack when you stagger a foe.', effect: { flag: 'ai-aggressive' } },
      { id: 'tw_ai_guard',     name: 'Guardian Stance',     ap: 30,  at: [-0.30, -0.06],req: ['tw_link1'],       desc: 'Allies cover you when your HP falls below 30%.', effect: { flag: 'ai-guardian' } },
      { id: 'tw_share',        name: 'Shared Spoils',       ap: 40,  at: [0, 0.26],     req: ['tw_rescue'],      desc: 'Allies pick up dropped items automatically.', effect: { flag: 'auto-pickup' } },
      { id: 'tw_finale',       name: 'Four as One',         ap: 150, at: [0, 0.38],     req: ['tw_cross', 'tw_bond2'], desc: 'Cross chains end with a full-party finisher.', effect: { flag: 'party-finisher' } },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'techniques', name: 'Techniques', color: '#c39bff', origin: [-1.35, 0.65],
    desc: 'The tech bar, and what your friends do with it.',
    nodes: [
      { id: 'tec_bar1',        name: 'Tech Boost',          ap: 15,  at: [0, 0],        req: [],                 desc: 'The tech bar fills 20% faster.', effect: { value: 'techCharge', amount: 0.20 } },
      { id: 'tec_bar2',        name: 'Tech Boost+',         ap: 48,  at: [0.14, -0.12], req: ['tec_bar1'],       desc: 'The tech bar fills a further 25% faster.', effect: { value: 'techCharge', amount: 0.25 } },
      { id: 'tec_bar3',        name: 'Tech Reserve',        ap: 110, at: [0.26, -0.22], req: ['tec_bar2'],       desc: 'A fourth tech bar segment.', effect: { value: 'techBars', amount: 1 } },
      { id: 'tec_dmg1',        name: 'Tech Strike',         ap: 22,  at: [-0.14, -0.12],req: ['tec_bar1'],       desc: 'Techniques deal 20% more damage.', effect: { value: 'techDamage', amount: 0.20 } },
      { id: 'tec_dmg2',        name: 'Tech Strike+',        ap: 62,  at: [-0.26, -0.22],req: ['tec_dmg1'],       desc: 'Techniques deal 30% more damage.', effect: { value: 'techDamage', amount: 0.30 } },
      { id: 'tec_gladio',      name: 'Bladed Blitz',        ap: 44,  at: [0.20, 0.14],  req: ['tec_bar1'],       desc: 'Gladiolus learns Impulse and Dawnhammer.', effect: { flag: 'tech-gladio-advanced' } },
      { id: 'tec_ignis',       name: 'Tactical Mind',       ap: 44,  at: [0, 0.18],     req: ['tec_bar1'],       desc: 'Ignis learns Overwhelm and Regroup.', effect: { flag: 'tech-ignis-advanced' } },
      { id: 'tec_prompto',     name: 'Trigger Discipline',  ap: 44,  at: [-0.20, 0.14], req: ['tec_bar1'],       desc: 'Prompto learns Gravisphere and Starshell.', effect: { flag: 'tech-prompto-advanced' } },
      { id: 'tec_chain',       name: 'Tech Chain',          ap: 90,  at: [0, 0.30],     req: ['tec_gladio', 'tec_ignis', 'tec_prompto'], desc: 'Firing a technique refunds a quarter of a bar on a kill.', effect: { flag: 'tech-refund' } },
      { id: 'tec_libra',       name: 'Analyse',             ap: 20,  at: [0.30, 0.02],  req: [],                 desc: 'Ignis reveals enemy weaknesses on sight.', effect: { flag: 'libra' } },
      { id: 'tec_slowmo',      name: 'Tactical Focus',      ap: 76,  at: [-0.32, 0.02], req: ['tec_dmg1'],       desc: 'Time slows while you choose a technique target.', effect: { flag: 'tech-slowmo' } },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'recovery', name: 'Recovery', color: '#8fe8a8', origin: [1.35, 0.65],
    desc: 'Staying upright long enough to matter.',
    nodes: [
      { id: 'rec_first',       name: 'First Aid',           ap: 10,  at: [0, 0],        req: [],                 desc: 'Curatives restore 20% more HP.', effect: { value: 'curativePower', amount: 0.20 } },
      { id: 'rec_second',      name: 'Second Wind',         ap: 32,  at: [0.14, -0.12], req: ['rec_first'],      desc: 'Curatives restore a further 30%.', effect: { value: 'curativePower', amount: 0.30 } },
      { id: 'rec_quick',       name: 'Quick Hands',         ap: 26,  at: [-0.14, -0.12],req: ['rec_first'],      desc: 'Using an item takes half as long.', effect: { value: 'itemSpeed', amount: 0.5 } },
      { id: 'rec_regen',       name: 'Slow and Steady',     ap: 40,  at: [0, -0.24],    req: ['rec_second'],     desc: 'Regenerate HP out of combat.', effect: { flag: 'field-regen' } },
      { id: 'rec_danger',      name: 'Death\'s Door',       ap: 55,  at: [0.20, 0.14],  req: ['rec_first'],      desc: 'Below 30% HP, damage taken is cut by 25%.', effect: { flag: 'pinch-guard' } },
      { id: 'rec_ko',          name: 'Never Give Up',       ap: 70,  at: [0.32, 0.22],  req: ['rec_danger'],     desc: 'Maximum HP no longer drains while downed.', effect: { flag: 'no-hp-drain' } },
      { id: 'rec_mp1',         name: 'Mind Over Matter',    ap: 24,  at: [-0.20, 0.14], req: [],                 desc: 'MP regenerates 25% faster.', effect: { value: 'mpRegen', amount: 0.25 } },
      { id: 'rec_mp2',         name: 'Clarity',             ap: 58,  at: [-0.32, 0.22], req: ['rec_mp1'],        desc: 'Stasis (empty MP) recovers twice as fast.', effect: { value: 'stasisRecovery', amount: 1.0 } },
      { id: 'rec_camp',        name: 'Restful Repose',      ap: 36,  at: [0, 0.28],     req: ['rec_regen'],      desc: 'Resting also cures every status ailment.', effect: { flag: 'rest-cures-status' } },
      { id: 'rec_status',      name: 'Iron Constitution',   ap: 64,  at: [0.14, 0.34],  req: ['rec_camp'],       desc: 'Status ailments last 40% less time.', effect: { value: 'statusDuration', amount: -0.40 } },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'magic', name: 'Magic', color: '#7ea6ff', origin: [-0.55, 1.25],
    desc: 'Elemancy, and the discipline not to catch your friends in the blast.',
    nodes: [
      { id: 'mag_power1',      name: 'Powercraft',          ap: 18,  at: [0, 0],        req: [],                 desc: 'Crafted spells are 15% more potent.', effect: { value: 'spellPower', amount: 0.15 } },
      { id: 'mag_power2',      name: 'Powercraft+',         ap: 54,  at: [0.14, -0.12], req: ['mag_power1'],     desc: 'Crafted spells are a further 25% more potent.', effect: { value: 'spellPower', amount: 0.25 } },
      { id: 'mag_draw1',       name: 'Deep Draw',           ap: 22,  at: [-0.14, -0.12],req: ['mag_power1'],     desc: 'Draw 30% more energy from an elemental deposit.', effect: { value: 'drawYield', amount: 0.30 } },
      { id: 'mag_draw2',       name: 'Deep Draw+',          ap: 66,  at: [-0.26, -0.22],req: ['mag_draw1'],      desc: 'Draw a further 40% more energy.', effect: { value: 'drawYield', amount: 0.40 } },
      { id: 'mag_capacity',    name: 'Elemental Reserve',   ap: 40,  at: [0.26, -0.22], req: ['mag_power2'],     desc: 'Carry 198 units of each element instead of 99.', effect: { value: 'energyCap', amount: 99 } },
      { id: 'mag_friendly',    name: 'Ruinous Restraint',   ap: 46,  at: [0.20, 0.14],  req: ['mag_power1'],     desc: 'Spells no longer harm your companions.', effect: { flag: 'no-friendly-fire' } },
      { id: 'mag_cast',        name: 'Swift Casting',       ap: 30,  at: [-0.20, 0.14], req: ['mag_power1'],     desc: 'Spells wind up 30% faster.', effect: { value: 'castSpeed', amount: 0.30 } },
      { id: 'mag_catalyst',    name: 'Catalyst Insight',    ap: 58,  at: [0, 0.24],     req: ['mag_friendly', 'mag_cast'], desc: 'Catalysts contribute 25% more potency and unlock at lower counts.', effect: { value: 'catalystPower', amount: 0.25 } },
      { id: 'mag_tri',         name: 'Tri-Elemental',       ap: 120, at: [0, 0.36],     req: ['mag_catalyst'],   desc: 'Mixing all three elements no longer dilutes potency.', effect: { flag: 'tri-elemental' } },
      { id: 'mag_slots',       name: 'Spell Satchel',       ap: 44,  at: [0.32, 0.02],  req: ['mag_power1'],     desc: 'Carry a fourth crafted spell into battle.', effect: { value: 'spellSlots', amount: 1 } },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'stats', name: 'Stats', color: '#ff9fc4', origin: [0.55, 1.25],
    desc: 'The unglamorous constellation. Buy it anyway.',
    nodes: [
      { id: 'st_hp1',          name: 'Health Boost',        ap: 15,  at: [0, 0],        req: [],                 desc: 'Maximum HP +300 for all party members.', effect: { stat: 'hp', value: 300 } },
      { id: 'st_hp2',          name: 'Health Boost+',       ap: 45,  at: [0.12, -0.12], req: ['st_hp1'],         desc: 'Maximum HP +600.', effect: { stat: 'hp', value: 600 } },
      { id: 'st_hp3',          name: 'Health Mastery',      ap: 140, at: [0.24, -0.22], req: ['st_hp2'],         desc: 'Maximum HP +1500.', effect: { stat: 'hp', value: 1500 } },
      { id: 'st_mp1',          name: 'Magic Reserve',       ap: 15,  at: [-0.12, -0.12],req: [],                 desc: 'Maximum MP +20.', effect: { stat: 'mp', value: 20 } },
      { id: 'st_mp2',          name: 'Magic Reserve+',      ap: 50,  at: [-0.24, -0.22],req: ['st_mp1'],         desc: 'Maximum MP +40.', effect: { stat: 'mp', value: 40 } },
      { id: 'st_str1',         name: 'Strength Boost',      ap: 20,  at: [0.18, 0.10],  req: [],                 desc: 'Strength +15.', effect: { stat: 'strength', value: 15 } },
      { id: 'st_str2',         name: 'Strength Boost+',     ap: 66,  at: [0.30, 0.18],  req: ['st_str1'],        desc: 'Strength +30.', effect: { stat: 'strength', value: 30 } },
      { id: 'st_vit1',         name: 'Vitality Boost',      ap: 20,  at: [-0.18, 0.10], req: [],                 desc: 'Vitality +15.', effect: { stat: 'vitality', value: 15 } },
      { id: 'st_vit2',         name: 'Vitality Boost+',     ap: 66,  at: [-0.30, 0.18], req: ['st_vit1'],        desc: 'Vitality +30.', effect: { stat: 'vitality', value: 30 } },
      { id: 'st_mag1',         name: 'Magic Boost',         ap: 20,  at: [0.10, 0.24],  req: [],                 desc: 'Magic +15.', effect: { stat: 'magic', value: 15 } },
      { id: 'st_mag2',         name: 'Magic Boost+',        ap: 66,  at: [0.20, 0.32],  req: ['st_mag1'],        desc: 'Magic +30.', effect: { stat: 'magic', value: 30 } },
      { id: 'st_spr1',         name: 'Spirit Boost',        ap: 20,  at: [-0.10, 0.24], req: [],                 desc: 'Spirit +15.', effect: { stat: 'spirit', value: 15 } },
      { id: 'st_spr2',         name: 'Spirit Boost+',       ap: 66,  at: [-0.20, 0.32], req: ['st_spr1'],        desc: 'Spirit +30.', effect: { stat: 'spirit', value: 30 } },
      { id: 'st_apex',         name: 'Apex of Kings',       ap: 250, at: [0, -0.32],    req: ['st_hp3', 'st_str2', 'st_mag2'], desc: 'All stats +8%.', effect: { multAll: 0.08 } },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'exploration', name: 'Exploration', color: '#a8e4d8', origin: [-1.15, 1.85],
    desc: 'The road, the Regalia, the chocobos and everything you find along the way.',
    nodes: [
      { id: 'exp_camp1',       name: 'Happy Camping',       ap: 15,  at: [0, 0],        req: [],                 desc: 'Camping restores full HP and MP to everyone.', effect: { flag: 'camp-full-restore' } },
      { id: 'exp_camp2',       name: 'Home Away From Home', ap: 48,  at: [0.14, -0.12], req: ['exp_camp1'],      desc: 'Meal buffs last 4 extra in-game hours.', effect: { value: 'mealDuration', amount: 4 } },
      { id: 'exp_camp3',       name: 'Regal Repose',        ap: 120, at: [0.26, -0.22], req: ['exp_camp2'],      desc: 'Resting at a haven grants a 1.3x EXP bonus.', effect: { value: 'havenExpBonus', amount: 0.30 } },
      { id: 'exp_car1',        name: 'Regalia Fanatic',     ap: 20,  at: [-0.14, -0.12],req: [],                 desc: 'Earn AP for every 500m driven.', effect: { flag: 'ap-driving' } },
      { id: 'exp_car2',        name: 'Chauffeur',           ap: 44,  at: [-0.26, -0.22],req: ['exp_car1'],       desc: 'Double the AP earned on the road.', effect: { value: 'drivingAp', amount: 1.0 } },
      { id: 'exp_car3',        name: 'Grease Monkey',       ap: 66,  at: [-0.38, -0.30],req: ['exp_car2'],       desc: 'The Regalia\'s fuel lasts twice as long.', effect: { value: 'fuelEfficiency', amount: 1.0 } },
      { id: 'exp_choco1',      name: 'Chocobo Rider',       ap: 24,  at: [0.20, 0.12],  req: [],                 desc: 'Earn AP while riding a chocobo.', effect: { flag: 'ap-chocobo' } },
      { id: 'exp_choco2',      name: 'Chocobo Whisperer',   ap: 52,  at: [0.32, 0.20],  req: ['exp_choco1'],     desc: 'Chocobo stamina lasts 50% longer and jumps go higher.', effect: { value: 'chocoboStamina', amount: 0.50 } },
      { id: 'exp_fish',        name: 'Angler\'s Eye',       ap: 28,  at: [-0.20, 0.12], req: [],                 desc: 'Fish tire 25% faster and the line holds longer.', effect: { value: 'fishing', amount: 0.25 } },
      { id: 'exp_photo',       name: 'Shutterbug',          ap: 30,  at: [-0.32, 0.20], req: [],                 desc: 'Prompto takes photos twice as often and keeps more of them.', effect: { value: 'photoRate', amount: 1.0 } },
      { id: 'exp_treasure',    name: 'Treasure Hunter',     ap: 40,  at: [0, 0.24],     req: ['exp_camp1'],      desc: 'Treasure glints are visible at twice the distance.', effect: { value: 'treasureRadius', amount: 1.0 } },
      { id: 'exp_scavenge',    name: 'Scavenger',           ap: 74,  at: [0, 0.36],     req: ['exp_treasure'],   desc: 'Enemies drop 50% more ingredients and treasures.', effect: { value: 'dropRate', amount: 0.50 } },
      { id: 'exp_gil',         name: 'Bargain Hunter',      ap: 56,  at: [0.14, 0.34],  req: ['exp_treasure'],   desc: 'Shops buy treasures at 30% above the going rate.', effect: { value: 'sellPrice', amount: 0.30 } },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'wait', name: 'Wait', color: '#d9d2c5', origin: [1.15, 1.85],
    desc: 'Wait Mode — the world holds its breath while you pick your moment.',
    nodes: [
      { id: 'wait_libra',      name: 'Libra',               ap: 12,  at: [0, 0],        req: [],                 desc: 'Wait Mode reveals enemy names, levels and HP.', effect: { flag: 'wait-libra' } },
      { id: 'wait_weak',       name: 'Weakness Scan',       ap: 34,  at: [0.14, -0.12], req: ['wait_libra'],     desc: 'Wait Mode also reveals elemental and weapon weaknesses.', effect: { flag: 'wait-weakness' } },
      { id: 'wait_time1',      name: 'Steady Nerves',       ap: 24,  at: [-0.14, -0.12],req: ['wait_libra'],     desc: 'Wait Mode lasts 30% longer before the world resumes.', effect: { value: 'waitDuration', amount: 0.30 } },
      { id: 'wait_time2',      name: 'Perfect Stillness',   ap: 70,  at: [-0.26, -0.22],req: ['wait_time1'],     desc: 'Wait Mode lasts a further 50% longer.', effect: { value: 'waitDuration', amount: 0.50 } },
      { id: 'wait_vision',     name: 'Perfect Vision',      ap: 46,  at: [0.26, -0.22], req: ['wait_weak'],      desc: 'See through walls and foliage while waiting.', effect: { flag: 'wait-xray' } },
      { id: 'wait_prince',     name: 'Lucian Prince',       ap: 88,  at: [0, 0.16],     req: ['wait_weak', 'wait_time1'], desc: 'Attacks launched from Wait Mode deal 30% more damage.', effect: { value: 'waitDamage', amount: 0.30 } },
      { id: 'wait_mark',       name: 'Point Marking',       ap: 40,  at: [0.18, 0.12],  req: ['wait_libra'],     desc: 'Mark a warp point in Wait Mode and warp to it instantly.', effect: { flag: 'wait-mark' } },
      { id: 'wait_free',       name: 'Timeless Focus',      ap: 130, at: [0, 0.28],     req: ['wait_prince', 'wait_time2'], desc: 'Wait Mode no longer drains the wait gauge in the air.', effect: { flag: 'wait-free-air' } },
    ],
  },
];

/* ------------------------------------------------------------------------ */
/* Flattened graph                                                           */
/* ------------------------------------------------------------------------ */

/** Every node, keyed by id, with absolute layout coordinates resolved. */
export const NODES = (() => {
  const map: Record<string, AscensionNode> = {};
  for (const c of CONSTELLATIONS) {
    for (const n of c.nodes) {
      map[n.id] = {
        ...n,
        constellation: c.id,
        constellationName: c.name,
        color: c.color,
        pos: [c.origin[0] + n.at[0] * 1.6, c.origin[1] + n.at[1] * 1.6],
        req: n.req || [],
      };
    }
  }
  return map;
})();

/** Constellation metadata for the star-map UI (no node payloads). */
export const CONSTELLATION_INFO: ConstellationInfo[] = CONSTELLATIONS.map((c) => ({
  id: c.id, name: c.name, color: c.color, origin: c.origin, desc: c.desc,
  nodeIds: c.nodes.map((n) => n.id),
  totalAp: c.nodes.reduce((a, n) => a + n.ap, 0),
}));

/** Every prerequisite edge, for drawing the constellation lines. */
export const EDGES: AscensionEdge[] = (() => {
  const out: AscensionEdge[] = [];
  for (const id of Object.keys(NODES)) {
    for (const r of NODES[id].req) {
      if (NODES[r]) out.push({ from: r, to: id, constellation: NODES[id].constellation });
    }
  }
  return out;
})();

/* ------------------------------------------------------------------------ */
/* Ascension state                                                           */
/* ------------------------------------------------------------------------ */

/**
 * Live Ascension state: AP wallet, unlocked node set and the derived effect
 * bundle. Emits `node-unlocked` and `ap-gained` through the injected emitter.
 */
export class Ascension {
  unlocked!: Set<string>;
  /** Cooldown timers keyed by AP reason, so warp-strike spam doesn't print AP. */
  _cooldowns!: Record<string, number>;
  /** Accumulators for distance-based rules, in metres. */
  _distance!: Record<string, number>;
  _effectsCache!: AscensionEffects | null;
  ap!: number;
  apLifetime!: number;
  apSpent!: number;
  emitter!: Emitter | null;
  constructor(emitter: import('./Emitter.ts').Emitter | null = null) {
    this.emitter = emitter;
    this.ap = 0;
    this.apSpent = 0;
    this.apLifetime = 0;
    this.unlocked = new Set();
    this._cooldowns = {};
    this._distance = { 'regalia-distance': 0, 'chocobo-distance': 0 };
    this._effectsCache = null;
  }

  /** All node ids. */
  get allNodes() { return Object.keys(NODES); }

  /** Look one node up. */
  node(id: string): AscensionNode | null { return NODES[id] || null; }

  /** Total AP required to fully clear the grid. */
  get totalApRequired() { return Object.values(NODES).reduce((a, n) => a + n.ap, 0); }

  /** 0..1 completion. */
  get completion() { return this.unlocked.size / this.allNodes.length; }

  /* -- AP ---------------------------------------------------------------- */

  /**
   * Award AP for a gameplay event.
   * @param reason key in AP_RULES
   * @param [times=1] number of occurrences (or metres for distance rules)
   * @returns AP actually granted
   */
  awardAp(reason: string, times: number = 1): number {
    const rule = AP_RULES[reason as keyof typeof AP_RULES];
    if (!rule) return 0;

    // Distance rules accumulate metres and pay out per completed unit.
    if (rule.perUnit) {
      this._distance[reason] = (this._distance[reason] || 0) + times;
      const units = Math.floor(this._distance[reason] / rule.perUnit);
      if (units <= 0) return 0;
      this._distance[reason] -= units * rule.perUnit;
      return this._grant(rule.ap * units * (1 + this.value('drivingAp') * (reason === 'regalia-distance' ? 1 : 0)), reason);
    }

    if (rule.cooldown && (this._cooldowns[reason] || 0) > 0) return 0;
    if (rule.cooldown) this._cooldowns[reason] = rule.cooldown;
    return this._grant(rule.ap * times, reason);
  }

  /** Grant raw AP outside the rule table (debug, story rewards). */
  grantRaw(amount: number, reason = 'reward') { return this._grant(amount, reason); }

  _grant(amount: number, reason: string) {
    const gained = Math.max(0, Math.round(amount * (1 + this.value('apGain'))));
    if (gained <= 0) return 0;
    this.ap += gained;
    this.apLifetime += gained;
    this.emitter?.emit('ap-gained', { amount: gained, reason, total: this.ap });
    return gained;
  }

  /** Tick AP cooldowns. Called from RpgSystem.update. */
  update(dt: number) {
    for (const k of Object.keys(this._cooldowns)) {
      if (this._cooldowns[k] > 0) this._cooldowns[k] = Math.max(0, this._cooldowns[k] - dt);
    }
  }

  /* -- Unlocking --------------------------------------------------------- */

  /** Has this node been bought? */
  isUnlocked(id: string) { return this.unlocked.has(id); }

  /**
   * Why a node can or can't be bought right now.
   */
  canUnlock(id: string): {ok:boolean, reason:string, missing:string[], ap:number} {
    const n = NODES[id];
    if (!n) return { ok: false, reason: 'unknown', missing: [], ap: 0 };
    if (this.unlocked.has(id)) return { ok: false, reason: 'already-unlocked', missing: [], ap: n.ap };
    const missing = n.req.filter((r) => !this.unlocked.has(r));
    if (missing.length) return { ok: false, reason: 'locked', missing, ap: n.ap };
    if (this.ap < n.ap) return { ok: false, reason: 'not-enough-ap', missing: [], ap: n.ap };
    return { ok: true, reason: 'ok', missing: [], ap: n.ap };
  }

  /**
   * Buy a node. No-op (returns false) if `canUnlock` says no.
   */
  unlock(id: string): boolean {
    const check = this.canUnlock(id);
    if (!check.ok) return false;
    const n = NODES[id];
    this.ap -= n.ap;
    this.apSpent += n.ap;
    this.unlocked.add(id);
    this._effectsCache = null;
    this.emitter?.emit('node-unlocked', { id, node: n, apRemaining: this.ap });
    return true;
  }

  /** Nodes that are affordable and unblocked right now — the UI highlights these. */
  availableNodes() {
    return this.allNodes.filter((id) => this.canUnlock(id).ok).map((id) => NODES[id]);
  }

  /** Nodes whose prerequisites are met (affordable or not) — the "frontier". */
  frontier() {
    return this.allNodes
      .filter((id) => !this.unlocked.has(id) && NODES[id].req.every((r) => this.unlocked.has(r)))
      .map((id) => NODES[id]);
  }

  /**
   * Cheapest prerequisite chain to reach a node, in purchase order.
   */
  pathTo(id: string): {path:string[], ap:number} {
    const path: string[] = [];
    const seen = new Set<string>();
    const walk = (nid: string) => {
      if (seen.has(nid) || this.unlocked.has(nid)) return;
      seen.add(nid);
      const n = NODES[nid];
      if (!n) return;
      for (const r of n.req) walk(r);
      path.push(nid);
    };
    walk(id);
    return { path, ap: path.reduce((a, p) => a + (NODES[p]?.ap || 0), 0) };
  }

  /* -- Derived effects --------------------------------------------------- */

  /**
   * Fold every unlocked node into one payload.
   */
  activeEffects(): AscensionEffects {
    if (this._effectsCache) return this._effectsCache;
    const mods = emptyMods();
    const flags = new Set<string>();
    const values: Record<string, number> = {};
    for (const id of this.unlocked) {
      const e = NODES[id]?.effect;
      if (!e) continue;
      // One arm each, tested in order. This used to be five independent `if`s
      // over an untyped payload, and `{ stat, value }` / `{ mult, value }` both
      // fell into the `value` arm as well -- writing `values['500'] = NaN` for
      // every flat stat node. Nothing ever read those keys (`value()` returns
      // `NaN || 0`), so dropping them changes no number the game uses.
      if ('stat' in e) mods[e.stat] = (mods[e.stat] || 0) + e.value;
      else if ('mult' in e) mods.mult[e.mult] = (mods.mult[e.mult] || 0) + e.value;
      else if ('multAll' in e) for (const st of CORE_STATS) mods.mult[st] = (mods.mult[st] || 0) + e.multAll;
      else if ('flag' in e) flags.add(e.flag);
      else values[e.value] = (values[e.value] || 0) + e.amount;
    }
    this._effectsCache = { mods, flags, values, nodes: [...this.unlocked] };
    return this._effectsCache;
  }

  /** Convenience: does the party have this ability flag? */
  has(flag: string) { return this.activeEffects().flags.has(flag); }
  /** Convenience: read a scalar tunable, defaulting to 0. */
  value(key: string) { return this.activeEffects().values[key] || 0; }

  /* -- Serialisation ----------------------------------------------------- */

  toJSON() {
    return { ap: this.ap, apSpent: this.apSpent, apLifetime: this.apLifetime, unlocked: [...this.unlocked], distance: this._distance };
  }

  static fromJSON(data: AscensionSave | null | undefined, emitter: Emitter | null = null) {
    const a = new Ascension(emitter);
    if (!data) return a;
    a.ap = data.ap || 0;
    a.apSpent = data.apSpent || 0;
    a.apLifetime = data.apLifetime || 0;
    a.unlocked = new Set((data.unlocked || []).filter((id) => NODES[id]));
    a._distance = data.distance || a._distance;
    return a;
  }
}

export default Ascension;
