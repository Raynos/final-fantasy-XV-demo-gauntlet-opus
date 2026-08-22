/**
 * The UI's single read-side adapter over the RPG model.
 *
 * `src/game/rpg/**` owns every number the game actually simulates — levels,
 * HP/MP, gil, AP, the 137-item bag, the 106-node grid, the 30-quest log and the
 * clock. This module is the *only* place `src/ui` is allowed to reach into it,
 * so every screen and widget reads one shape and none of them care whether the
 * system is present.
 *
 * Every reader takes `game` and degrades gracefully: if `game.get('Rpg')` is
 * missing (the screenshot harness may boot a partial world, and other agents
 * run this file with their systems half-built) the fallback tables below keep
 * the HUD renderable and screenshot-able. The *live* path is always preferred.
 */

import { NODES, EDGES, CONSTELLATION_INFO } from '../game/rpg/Ascension.ts';
import type { Game } from '../game/Game.ts';
import type { QuestLog, Quest, QuestView, ObjectiveView } from '../game/rpg/Quests.ts';
import type { ItemDef } from '../game/rpg/Inventory.ts';
import type { StatMods, computeDamage } from '../game/rpg/Stats.ts';
import type { Enemy } from '../characters/enemies/EnemyBase.ts';
import type { RpgSystem } from '../game/rpg/RpgSystem.ts';

/* ------------------------------------------------------------------------ */
/* The HUD contract                                                          */
/* ------------------------------------------------------------------------ */

/**
 * One quest hydrated with its live state, and one objective row inside it.
 *
 * Re-exported from the quest log rather than restated: `src/ui` is not allowed
 * to import `src/game/rpg/**` anywhere but here, and a second declaration of
 * the same shape is a second thing to keep in step.
 */
export type { QuestView, ObjectiveView as QuestObjectiveView } from '../game/rpg/Quests.ts';

/** One waypoint marker, as `QuestLog.waypoints()` publishes it. */
export type QuestWaypoint = ReturnType<QuestLog['waypoints']>[number];

/**
 * The tracked-quest line the compass strip, the hint bar and the pause menu
 * all print. The optional fields are the ones the offline `QUEST` fallback
 * table cannot know.
 */
export interface QuestLine {
  id?: string;
  title: string;
  /** The current objective's label, or the quest summary when all are done. */
  step: string;
  /** Metres to the waypoint; 0 when there is no waypoint or no player. */
  dist: number;
  progress?: number;
  count?: number;
  region: string;
  type: Quest['type'];
  waypoint: number[] | null;
  /** False when this came from the fallback table rather than the quest log. */
  live?: boolean;
}

/** One active meal/spell buff, flattened for the HUD. */
export interface HudBuff {
  name: string;
  /** Human-readable effect lines — `statusIcons` pattern-matches these. */
  effects: string[];
  hoursLeft: number;
}

/** One roster member's live vitals. Cosmetics (hue, role) are not in here. */
export interface HudMember {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  ko: boolean;
  level: number;
  bond: { level: number, name: string };
}

/**
 * Everything a HUD widget may read for one frame — the whole of what
 * `RpgSystem.hudState()` publishes, and the only shape `src/ui` sees of it.
 *
 * This is the UI's contract, not a restatement of the model: a field appears
 * here because something in `src/ui` reads it. `RpgSystem.hudState()` must
 * remain assignable to it, so a rename on either side is a compile error.
 */
export interface HudState {
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  /** 0..1 through the current level. */
  expProgress: number;
  /** Unredeemed EXP, banked until the party sleeps. */
  banked: number;
  gil: number;
  ap: number;
  techBars: number;
  maxTechBars: number;
  /** "07:42" — already formatted. */
  clock: string;
  day: number;
  /** The *name* of the day phase ("Dawn"), not its id. */
  phase: string;
  isNight: boolean;
  /** 0..1, how deep into the night it is. */
  nightDepth: number;
  buffs: HudBuff[];
  /** The tracked quest, or null when nothing is tracked. */
  tracked: QuestView | null;
  waypoints: QuestWaypoint[];
  /** Equipped elemancy, one entry per quick slot; null for an empty slot. */
  spells: unknown[];
  party: HudMember[];
}

/** `hudState()`'s per-frame memo. Lives on `Game` so `resetClock` can drop it. */
export interface HudCache {
  frame: number;
  state: HudState;
}

/**
 * One roster member as the party widgets draw them: live vitals plus the
 * cosmetic overlay (`hue`, `role`, short name) the model has no opinion on.
 *
 * The optional fields are exactly the ones the offline `PARTY` fallback table
 * omits — a partial world has no bond, no KO state and no MP for the three
 * companions. Widgets already default them, so they stay optional rather than
 * being invented here.
 */
export interface PartyView {
  id: string;
  /** Short name, as the HUD prints it. */
  name: string;
  /** Full roster name; live path only. */
  fullName?: string;
  role: string;
  hue: number;
  level: number;
  hp: number;
  maxHp: number;
  mp?: number;
  maxMp?: number;
  ko?: boolean;
  bond?: HudMember['bond'];
  /** Icon keys for `Icons.ts`, at most three. */
  status: string[];
}

/** One armiger slot on the weapon wheel's diamond. */
export interface WeaponView {
  /** Wheel direction. */
  slot: string;
  /** Icon key. */
  key: string;
  name: string;
  /** Class label ("Greatsword"), or "No armament" for an empty slot. */
  kind: string;
  atk: number;
  element: string | null;
  /** Inventory id; null for an empty slot, absent in the fallback table. */
  id?: string | null;
}

/** One item stack, in the shape the inventory screen draws. */
export interface ItemView {
  id: string;
  name: string;
  qty: number;
  /** Icon key. */
  icon: string;
  /** Category tag line printed above the name. */
  tag: string;
  /** "Restore 1,000 HP". */
  effect: string;
  /** "One ally" / "All allies" / "—". */
  target: string;
  /** Usable outside battle. */
  field: boolean;
  desc: string;
}

/** One equipment slot on a gear card. */
export interface GearSlotView {
  /** "Weapon" or "Accessory". */
  slot: string;
  name: string;
  /** The stat line under the name. */
  stat: string;
  empty?: boolean;
  id?: string | null;
}

/** One companion technique on the combat HUD's rack. */
export interface TechniqueView {
  name: string;
  owner: string;
  /** Tech bars it costs. */
  cost: number;
  /** Icon key. */
  icon: string;
  /** 0..1 charge toward being affordable. */
  ready: number;
}

/** What the damage formula hands back for one resolved hit. */
export type DamageRoll = ReturnType<typeof computeDamage>;

/** Everything `CombatBridge.roll` accepts about how a hit was landed. */
export interface RollOpts {
  /** Motion value of the swing; 1.0 is a neutral light attack. */
  motion?: number;
  /** Set for a spell; leaves `weaponClass` unused. */
  element?: string;
  weaponClass?: string;
  isWarpStrike?: boolean;
  isBackAttack?: boolean;
  staggerMult?: number;
  /** Folded into the seeded RNG so a replayed frame rolls the same number. */
  seed?: number;
}

/**
 * What one Ascension node does. The four arms are the payload shapes
 * `Ascension.activeEffects()` sums, documented at the top of `Ascension.ts`.
 */
export type AscensionEffect =
  | { stat: string, value: number }
  | { mult: string, value: number }
  | { flag: string }
  | { value: string, amount: number };

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

/** Why a node can or cannot be bought right now. */
export interface UnlockCheck {
  ok: boolean;
  /** `ok` | `unknown` | `already-unlocked` | `locked` | `not-enough-ap`. */
  reason: string;
  /** Prerequisite ids still missing. */
  missing: string[];
  /** The node's AP cost. */
  ap: number;
}

/**
 * The star map plus whatever live state there is to overlay on it. The tables
 * are pure data, so the grid draws with no `RpgSystem`; only the wallet and
 * the unlocked set need one, which is why the three verbs are closures.
 */
export interface AscensionView {
  nodes: Record<string, AscensionNode>;
  edges: AscensionEdge[];
  constellations: ConstellationInfo[];
  /** AP on hand; 0 with no RPG system. */
  ap: number;
  /** AP to clear the whole grid. */
  total: number;
  unlockedCount: number;
  isUnlocked(id: string): boolean;
  canUnlock(id: string): UnlockCheck;
  unlock(id: string): boolean;
}

/** One marker the world map and the compass strip both draw. */
export interface MarkerView {
  kind: string;
  name: string;
  x: number;
  z: number;
  tracked?: boolean;
  questId?: string;
}

/* ------------------------------------------------------------------------ */
/* Presentation metadata — colour and role, which the model has no opinion on */
/* ------------------------------------------------------------------------ */

/** Portrait hue + HUD role per roster id. Purely cosmetic. */
export const MEMBER_UI = {
  noctis:  { hue: 218, role: 'lead',      short: 'Noctis' },
  gladio:  { hue: 24,  role: 'guard',     short: 'Gladiolus' },
  ignis:   { hue: 268, role: 'tactician', short: 'Ignis' },
  prompto: { hue: 44,  role: 'marksman',  short: 'Prompto' },
};

/** RPG weapon class -> the icon key `Icons.ts` draws. */
export const CLASS_ICON = {
  sword: 'sword', greatsword: 'greatsword', polearm: 'lance', dagger: 'daggers',
  firearm: 'firearm', shield: 'shield', machinery: 'machinery',
};

/** RPG weapon class -> the label FFXV prints under the weapon name. */
export const CLASS_LABEL = {
  sword: 'Sword', greatsword: 'Greatsword', polearm: 'Polearm', dagger: 'Daggers',
  firearm: 'Firearm', shield: 'Shield', machinery: 'Machinery',
};

/** Item category -> icon key, so 137 items need no per-item art. */
const CATEGORY_ICON = {
  curative: 'potion', catalyst: 'lightning', treasure: 'ap', ingredient: 'regen',
  key: 'items', weapon: 'sword', accessory: 'ap', spell: 'fire',
};

/** Item category -> the tag line printed above the item name. */
const CATEGORY_TAG = {
  curative: 'Consumable', catalyst: 'Catalyst', treasure: 'Treasure',
  ingredient: 'Ingredient', key: 'Key Item', weapon: 'Weapon', accessory: 'Accessory',
  spell: 'Magic',
};

/** Inventory screen tabs and the model categories each one gathers. */
export const ITEM_TABS = [
  { name: 'Consumables', cats: ['curative'] },
  { name: 'Materials', cats: ['catalyst', 'treasure'] },
  { name: 'Provisions', cats: ['ingredient'] },
  { name: 'Equipment', cats: ['weapon', 'accessory'] },
  { name: 'Key Items', cats: ['key'] },
];

/* ------------------------------------------------------------------------ */
/* Fallbacks — used only when no RpgSystem is registered                     */
/* ------------------------------------------------------------------------ */

export const PARTY = [
  { id: 'noctis', name: 'Noctis', role: 'lead', level: 27, hue: 218,
    hp: 3040, maxHp: 3200, mp: 74, maxMp: 100, status: ['haste'] },
  { id: 'gladio', name: 'Gladiolus', role: 'guard', level: 28, hue: 24, hp: 4180, maxHp: 4600, status: ['shieldUp'] },
  { id: 'ignis', name: 'Ignis', role: 'tactician', level: 27, hue: 268, hp: 2560, maxHp: 2900, status: [] },
  { id: 'prompto', name: 'Prompto', role: 'marksman', level: 26, hue: 44, hp: 1980, maxHp: 2650, status: ['swordUp', 'poison'] },
];

export const WEAPONS = [
  { slot: 'up', key: 'sword', name: 'Engine Blade', kind: 'Sword', atk: 168, element: null },
  { slot: 'right', key: 'greatsword', name: 'Rusted Bit', kind: 'Greatsword', atk: 214, element: 'ice' },
  { slot: 'down', key: 'daggers', name: 'Zwill Crossblades', kind: 'Daggers', atk: 142, element: 'lightning' },
  { slot: 'left', key: 'firearm', name: 'Auto Crossbow', kind: 'Machinery', atk: 96, element: 'fire' },
];

export const TECHNIQUES = [
  { name: 'Tempest', owner: 'Gladiolus', cost: 2, icon: 'greatsword', ready: 1 },
  { name: 'Enhancement', owner: 'Ignis', cost: 1, icon: 'lance', ready: 0.62 },
  { name: 'Starshell', owner: 'Prompto', cost: 3, icon: 'firearm', ready: 0.24 },
];

export const ENEMY_TEMPLATES = [
  { name: 'Sabertusk', level: 14, hp: 620, maxHp: 900, weak: 'fire', resist: null },
  { name: 'Voretooth', level: 12, hp: 410, maxHp: 640, weak: 'ice', resist: null },
  { name: 'Dualhorn', level: 22, hp: 3120, maxHp: 4400, weak: 'lightning', resist: 'fire' },
];

export const ITEMS = [
  { id: 'potion', name: 'Potion', qty: 32, icon: 'potion', tag: 'Consumable', effect: 'Restore 1,000 HP', target: 'One ally', field: true,
    desc: 'Restores 1,000 HP to one ally. Standard field issue from the Crown City infirmary — Ignis buys them by the crate.' },
  { id: 'hi_potion', name: 'Hi-Potion', qty: 14, icon: 'potion', tag: 'Consumable', effect: 'Restore 3,000 HP', target: 'One ally', field: true,
    desc: 'A denser draught of the same. Worth holding back until someone is genuinely in trouble.' },
  { id: 'mega_potion', name: 'Mega-Potion', qty: 6, icon: 'potion', tag: 'Consumable', effect: 'Restore 5,000 HP', target: 'All allies', field: true,
    desc: 'Vapourises on contact with air, restoring the whole retinue at once.' },
  { id: 'elixir', name: 'Elixir', qty: 5, icon: 'potion', tag: 'Consumable', effect: 'Full HP / MP', target: 'One ally', field: true,
    desc: 'Fully restores HP and MP to one ally and clears every ailment. Rare enough to be worth the pocket space.' },
  { id: 'phoenix_down', name: 'Phoenix Down', qty: 3, icon: 'regen', tag: 'Consumable', effect: 'Revive · 50% HP', target: 'One ally', field: false,
    desc: 'A single feather that pulls a downed ally back to their feet with half their health restored.' },
  { id: 'antidote', name: 'Antidote', qty: 9, icon: 'poison', tag: 'Remedy', effect: 'Cure poison', target: 'One ally', field: true,
    desc: 'Neutralises venom from sabertusk and voretooth bites alike.' },
  { id: 'gold_needle', name: 'Gold Needle', qty: 4, icon: 'shieldUp', tag: 'Remedy', effect: 'Cure stone', target: 'One ally', field: true,
    desc: 'Breaks petrifaction. Unpleasant for everyone involved, including the person holding the needle.' },
  { id: 'smelling_salts', name: 'Smelling Salts', qty: 6, icon: 'haste', tag: 'Remedy', effect: 'Cure confusion', target: 'One ally', field: true,
    desc: 'Sharp enough to clear a daemon\'s influence out of a clouded head.' },
  { id: 'hunters_medal', name: 'Hunter\'s Medal', qty: 7, icon: 'ap', tag: 'Treasure', effect: 'Sells for 300 gil', target: '—', field: false,
    desc: 'Proof of a hunt completed. Traded at outposts for gil, or kept as a quiet boast.' },
  { id: 'rare_metal', name: 'Rare Metal', qty: 1, icon: 'machinery', tag: 'Key Item', effect: 'Quest item', target: '—', field: false,
    desc: 'A dense ingot Cid asked for. He was not specific about what he intends to do with it.' },
  { id: 'fire_flask', name: 'Fire Flask', qty: 2, icon: 'fire', tag: 'Magic', effect: 'Fire · 180 potency', target: 'Area', field: false,
    desc: 'A flask of unstable elemancy. Deals fire damage in a wide radius — mind the grass.' },
  { id: 'sky_gemstone', name: 'Sky Gemstone', qty: 1, icon: 'lightning', tag: 'Catalyst', effect: 'Spellcraft catalyst', target: '—', field: false,
    desc: 'A shard humming with stored lightning. Folded into a spell it raises the potency considerably.' },
];

export const GEAR_SLOTS = ['Weapon', 'Weapon', 'Accessory', 'Accessory'];

export const GEAR = {
  noctis: [
    { slot: 'Weapon', name: 'Engine Blade', stat: 'ATK +168' },
    { slot: 'Weapon', name: 'Zwill Crossblades', stat: 'ATK +142' },
    { slot: 'Accessory', name: 'Ribbon', stat: 'Resist all ailments' },
    { slot: 'Accessory', name: 'Moogle Charm', stat: 'AP gain +50%' },
  ],
  gladio: [
    { slot: 'Weapon', name: 'Ziedrich', stat: 'ATK +231' },
    { slot: 'Weapon', name: 'Bronze Shield', stat: 'DEF +64' },
    { slot: 'Accessory', name: 'Power Wristbands', stat: 'STR +80' },
    { slot: 'Accessory', name: 'Talisman', stat: 'HP +500' },
  ],
  ignis: [
    { slot: 'Weapon', name: 'Orichalcum', stat: 'ATK +186' },
    { slot: 'Weapon', name: 'Javelin', stat: 'ATK +154' },
    { slot: 'Accessory', name: 'Circlet', stat: 'MAG +72' },
    { slot: 'Accessory', name: 'Hypno Crown', stat: 'MP cost -20%' },
  ],
  prompto: [
    { slot: 'Weapon', name: 'Auto Crossbow', stat: 'ATK +96' },
    { slot: 'Weapon', name: 'Quicksilver', stat: 'ATK +128' },
    { slot: 'Accessory', name: 'Sniper\'s Sight', stat: 'Crit rate +18%' },
    { slot: 'Accessory', name: 'Bulletproof Vest', stat: 'DEF +44' },
  ],
};

// map-space coordinates are normalised to the 1600x900 chart and kept inside
// the generated coastline in MapScreen
export const REGIONS = [
  { name: 'Leide', sub: 'Longwythe Region', x: 0.300, y: 0.625 },
  { name: 'Duscae', sub: 'Alstor Slough', x: 0.545, y: 0.265 },
  { name: 'Cleigne', sub: 'Vesperpool', x: 0.735, y: 0.375 },
  { name: 'Lucis Coast', sub: 'Galdin Quay', x: 0.395, y: 0.800 },
];

export const MAP_PINS = [
  { kind: 'quest', name: 'A Better Engine Blade', x: 0.352, y: 0.545 },
  { kind: 'hunt', name: 'Sabertusk Pack', x: 0.434, y: 0.645 },
  { kind: 'haven', name: 'Prairie Outpost', x: 0.283, y: 0.470 },
  { kind: 'dungeon', name: 'Keycatrich Trench', x: 0.470, y: 0.310 },
  { kind: 'haven', name: 'Kelbass Grasslands', x: 0.598, y: 0.505 },
  { kind: 'quest', name: 'Party of Three', x: 0.652, y: 0.375 },
];

export const BANTER = [
  { who: 'Prompto', line: 'Whoa — that view! Hold up, gotta get a shot of this.' },
  { who: 'Gladiolus', line: 'Keep your head up, Noct. Something\'s moving out there.' },
  { who: 'Ignis', line: 'I\'ve come up with a new recipe. We\'ll try it at camp.' },
  { who: 'Prompto', line: 'Anyone else starvin\'? Just me? Cool. Cool cool cool.' },
];

export const SUBTITLES = [
  { who: 'Ignis', line: 'The road ahead narrows past the outpost. We should press on before dark.' },
  { who: 'Noctis', line: 'Yeah. Let\'s not give the daemons a head start.' },
];

export const QUEST = {
  title: 'A Better Engine Blade',
  step: 'Deliver the Rare Metal to Cid at Hammerhead',
  dist: 1240,
};

/* ------------------------------------------------------------------------ */
/* Live reads                                                                */
/* ------------------------------------------------------------------------ */

/** The RpgSystem, or null when the world was booted without it. */
export function rpg(game: Game) {
  const r = game?.get?.('Rpg');
  return r && r.party ? r : null;
}

/**
 * `rpg.hudState()` for this frame, memoised.
 *
 * `hudState()` rebuilds four party records, the buff list and the waypoint list
 * every call, and half a dozen widgets want it in the same frame. The cache is
 * keyed on the frame counter and cleared by `Game.resetClock()`.
 */
export function hudState(game: Game): HudState | null {
  const r = rpg(game);
  if (!r) return null;
  const frame = game.time ? game.time.frame : -1;
  const c = game._hudCache;
  if (c && c.frame === frame) return c.state;
  const state: HudState = r.hudState();
  game._hudCache = { frame, state };
  return state;
}

/**
 * The four-member roster the HUD, the pause menu and the gear screen all draw.
 * Live values come from `hudState().party`; hue/role are cosmetic overlays.
 */
export function readParty(game: Game): PartyView[] {
  const hs = hudState(game);
  if (!hs || !hs.party || !hs.party.length) return PARTY.map((p) => ({ ...p }));
  return hs.party.map((m) => {
    const ui = MEMBER_UI[m.id as keyof typeof MEMBER_UI] || MEMBER_UI.noctis;
    return {
      id: m.id,
      name: ui.short,
      fullName: m.name,
      role: ui.role,
      hue: ui.hue,
      level: m.level,
      hp: m.hp, maxHp: m.maxHp,
      mp: m.mp, maxMp: m.maxMp,
      ko: m.ko,
      bond: m.bond,
      status: statusIcons(hs, m),
    };
  });
}

/**
 * Status icons for one member. Real state only: a KO badge, a critical-HP
 * warning, and one icon per active meal/spell buff mapped onto the icon set.
 */
function statusIcons(hs: HudState, m: HudMember): string[] {
  const out: string[] = [];
  if (m.ko) out.push('poison');
  for (const b of hs.buffs || []) {
    const e = (b.effects || []).join(' ');
    if (/Strength/.test(e)) out.push('swordUp');
    else if (/Vitality|Max HP/.test(e)) out.push('shieldUp');
    else if (/Magic|Spirit/.test(e)) out.push('haste');
    else out.push('regen');
  }
  if (!m.ko && m.maxHp && m.hp / m.maxHp < 0.25) out.push('poison');
  return [...new Set(out)].slice(0, 3);
}

/**
 * Noctis' phantom arsenal, laid out on the weapon wheel's diamond.
 * Reads the four real equipment slots from `Inventory`.
 */
export function readWeapons(game: Game): WeaponView[] {
  const r = rpg(game);
  const slots = ['up', 'right', 'down', 'left'];
  if (!r) return WEAPONS.map((w) => ({ ...w }));
  const rack = r.inventory.equipped('noctis').weapon;
  return slots.map((slot, i) => {
    const def = rack[i];
    if (!def) return { slot, key: 'sword', name: 'Empty', kind: 'No armament', atk: 0, element: null, id: null };
    const el = (def.tags || []).find((t) => t.startsWith('element:'));
    return {
      slot, id: def.id,
      key: CLASS_ICON[def.class as keyof typeof CLASS_ICON] || 'sword',
      name: def.name,
      kind: CLASS_LABEL[def.class as keyof typeof CLASS_LABEL] || 'Arm',
      atk: def.attack || 0,
      element: el ? el.slice(8) : null,
    };
  });
}

/**
 * The bag, in the shape the item screen draws.
 * @param [tab] index into `ITEM_TABS`; omit for everything
 */
export function readItems(game: Game, tab: number = -1): ItemView[] {
  const r = rpg(game);
  if (!r) {
    if (tab < 0) return ITEMS.map((i) => ({ ...i }));
    const want = ITEM_TABS[tab]?.name;
    const map = { Consumables: ['Consumable', 'Remedy'], Materials: ['Treasure', 'Catalyst'], Provisions: [], Equipment: [], 'Key Items': ['Key Item', 'Magic'] };
    const tags: string[] = map[want as keyof typeof map] || [];
    const out = ITEMS.filter((i) => tags.includes(i.tag)).map((i) => ({ ...i }));
    return out.length ? out : ITEMS.map((i) => ({ ...i }));
  }
  const cats = tab < 0 ? null : (ITEM_TABS[tab]?.cats || null);
  return r.inventory.list()
    .filter((e) => !cats || cats.includes(e.def.category))
    .map((e) => itemView(e.def, e.count, r));
}

/** One item stack, hydrated for the detail column. */
function itemView(def: ItemDef, count: number, r: RpgSystem): ItemView {
  const use = def.use || null;
  let effect = '—';
  if (use) {
    if (use.type === 'heal') effect = `Restore ${use.amount.toLocaleString()} HP`;
    else if (use.type === 'mp') effect = `Restore ${use.amount} MP`;
    else if (use.type === 'full') effect = 'Full HP / MP';
    else if (use.type === 'revive') effect = `Revive · ${Math.round((use.percent || 0.5) * 100)}% HP`;
    else if (use.type === 'cure') effect = `Cure ${use.status.join(', ').replace('*', 'all ailments')}`;
  } else if (def.category === 'weapon') effect = `ATK +${def.attack}`;
  else if (def.category === 'accessory') effect = modLine(def.mods) || 'Passive';
  else if (def.catalyst) effect = `${def.catalyst.effect} · potency ${def.catalyst.potency}`;
  else if (def.sell > 0) effect = `Sells for ${r.inventory.sellPrice(def.id).toLocaleString()} gil`;

  return {
    id: def.id,
    name: def.name,
    qty: count,
    icon: itemIcon(def),
    tag: CATEGORY_TAG[def.category as keyof typeof CATEGORY_TAG] || 'Item',
    effect,
    target: use ? (use.target === 'party' ? 'All allies' : use.target === 'downed' ? 'Downed ally' : 'One ally') : '—',
    field: !!use,
    desc: def.desc || '',
  };
}

/** Pick the icon that says the most about what an item actually does. */
function itemIcon(def: ItemDef): string {
  const u = def.use;
  if (u) {
    if (u.type === 'revive') return 'regen';
    if (u.type === 'mp') return 'lightning';
    if (u.type === 'full') return 'haste';
    if (u.type === 'cure') return u.status?.includes('poison') ? 'poison' : 'shieldUp';
    return 'potion';
  }
  if (def.category === 'weapon') return CLASS_ICON[def.class as keyof typeof CLASS_ICON] || 'sword';
  if (def.catalyst) {
    const t = def.catalyst.tags || [];
    if (t.includes('lightning')) return 'lightning';
    if (t.includes('heal')) return 'regen';
    if (t.includes('poison')) return 'poison';
    return 'ap';
  }
  return CATEGORY_ICON[def.category as keyof typeof CATEGORY_ICON] || 'items';
}

/** "STR +40  ·  HP +300" from a modifier bucket. */
function modLine(mods: Partial<StatMods> | undefined): string {
  if (!mods) return '';
  const K = { hp: 'HP', mp: 'MP', strength: 'STR', vitality: 'VIT', magic: 'MAG', spirit: 'SPR', attack: 'ATK', defense: 'DEF', magicAttack: 'M.ATK', magicDefense: 'M.DEF' };
  const bits: string[] = [];
  for (const k of Object.keys(K)) if (mods[k]) bits.push(`${K[k as keyof typeof K]} ${mods[k] > 0 ? '+' : ''}${mods[k]}`);
  if (mods.critRate) bits.push(`Crit +${Math.round(mods.critRate * 100)}%`);
  const resist = mods.resist || {};
  for (const e of Object.keys(resist)) if (resist[e]) bits.push(`${e} res +${resist[e]}%`);
  return bits.slice(0, 3).join('  ·  ');
}

/**
 * One member's equipment slots, in the order the gear card lays them out.
 * @param id roster id
 */
export function readGear(game: Game, id: string): GearSlotView[] {
  const r = rpg(game);
  if (!r) return (GEAR[id as keyof typeof GEAR] || GEAR.noctis).map((g) => ({ ...g }));
  const eq = r.inventory.equipped(id);
  const out: GearSlotView[] = [];
  eq.weapon.forEach((def) => out.push(slotView('Weapon', def)));
  eq.accessory.forEach((def) => out.push(slotView('Accessory', def)));
  return out;
}

function slotView(slot: string, def: ItemDef | null): GearSlotView {
  if (!def) return { slot, name: '— Empty —', stat: '', empty: true, id: null };
  return {
    slot, id: def.id, name: def.name,
    stat: slot === 'Weapon' ? `ATK +${def.attack}${modLine(def.mods) ? `  ·  ${modLine(def.mods)}` : ''}` : (modLine(def.mods) || def.special || ''),
  };
}

/**
 * The tracked quest, its current objective and the real distance to its
 * waypoint. Everything the compass strip and the pause menu print.
 */
export function readQuest(game: Game): QuestLine {
  const hs = hudState(game);
  if (!hs || !hs.tracked) return { ...QUEST, region: 'Leide', type: 'side', waypoint: null, live: false };
  const t = hs.tracked;
  const objectives: ObjectiveView[] = t.objectives || [];
  const obj = objectives.find((o) => !o.done) || objectives[objectives.length - 1];
  const wp = (hs.waypoints || []).find((w) => w.questId === t.id) || null;
  const p = game?.get?.('Player')?.position;
  let dist = 0;
  if (wp && p) dist = Math.round(Math.hypot(p.x - wp.pos[0], p.z - wp.pos[2]));
  return {
    id: t.id,
    title: t.name,
    step: obj ? obj.label : t.summary,
    dist,
    progress: obj ? obj.progress : 0,
    count: obj ? obj.count : 0,
    region: t.region || 'leide',
    type: t.type,
    waypoint: wp ? wp.pos : null,
    live: true,
  };
}

/**
 * Every marker the world map and the compass strip should show: active quest
 * waypoints plus discovered havens.
 */
export function readMarkers(game: Game): MarkerView[] | null {
  const r = rpg(game);
  const hs = hudState(game);
  if (!r || !hs) return null;
  const out: MarkerView[] = [];
  for (const w of hs.waypoints || []) {
    // `questId` rides along so a map pin can be *selected* and made the tracked
    // objective, rather than being a decoration you can move a cursor over.
    out.push({
      kind: w.type === 'hunt' ? 'hunt' : 'quest', name: w.name,
      x: w.pos[0], z: w.pos[2], tracked: w.tracked, questId: w.questId,
    });
  }
  for (const h of r.day.havens()) {
    if (!h.discovered) continue;
    out.push({ kind: 'haven', name: h.name, x: h.pos[0], z: h.pos[2] });
  }
  for (const d of r.tables.deposits || []) {
    out.push({ kind: 'deposit', name: d.name || d.id, x: d.pos[0], z: d.pos[2] });
  }
  return out;
}

/**
 * Party techniques for the combat HUD's tech rack — one signature technique
 * per companion, with real bar costs and the real charge state.
 */
export function readTechniques(game: Game): TechniqueView[] {
  const r = rpg(game);
  if (!r) return TECHNIQUES.map((t) => ({ ...t }));
  const charge = r.party.techCharge;
  const out: TechniqueView[] = [];
  for (const id of ['gladio', 'ignis', 'prompto']) {
    const t = r.party.signatureTechnique(id);
    if (!t) continue;
    out.push({
      name: t.name,
      owner: MEMBER_UI[id as keyof typeof MEMBER_UI].short,
      cost: t.bars,
      icon: CLASS_ICON[r.party.members[id].weapon as keyof typeof CLASS_ICON] || 'sword',
      ready: t.bars > 0 ? Math.min(1, charge / t.bars) : 1,
    });
  }
  return out.length ? out : TECHNIQUES.map((t) => ({ ...t }));
}

/**
 * The Ascension grid: the authored 106-node graph plus whatever live state
 * there is to overlay on it.
 *
 * The layout tables are pure data, so the star map draws correctly even without
 * a running `RpgSystem`; only the AP wallet and the unlocked set need one.
 */
export function readAscension(game: Game): AscensionView {
  const r = rpg(game);
  const asc = r ? r.ascension : null;
  return {
    nodes: r ? r.tables.nodes : NODES,
    edges: r ? r.tables.edges : EDGES,
    constellations: r ? r.tables.constellations : CONSTELLATION_INFO,
    ap: asc ? asc.ap : 0,
    total: asc ? asc.totalApRequired : Object.values(NODES).reduce((a, n) => a + n.ap, 0),
    unlockedCount: asc ? asc.unlocked.size : 0,
    isUnlocked: (id: string) => !!asc && asc.isUnlocked(id),
    canUnlock: (id: string) => (asc ? asc.canUnlock(id) : { ok: false, reason: 'locked', missing: [] as string[], ap: 0 }),
    unlock: (id: string) => (r ? r.unlockNode(id) : false),
  };
}

/**
 * The Armiger gauge, 0..1, earned from damage dealt. Null with no RPG system.
 */
export function readArmiger(game: Game) {
  const r = rpg(game);
  return r && r.combatBridge ? r.combatBridge.armiger : null;
}

/**
 * Resolve a hit on a scene-graph enemy through the real damage formula.
 * Returns null when there is no RPG system to ask.
 * @param [opts] see `CombatBridge.roll`
 */
export function rollDamage(game: Game, enemy: Enemy | null, opts?: RollOpts): DamageRoll | null {
  const r = rpg(game);
  if (!r || !r.combatBridge || !enemy) return null;
  return r.combatBridge.roll(enemy, opts);
}

/**
 * World XZ -> the MapScreen's 1600x900 chart. North is -Z and up-screen; the
 * transform is anisotropic to match the chart's elliptical landmass.
 * @param x world x
 * @param z world z
 */
export function worldToChart(x: number, z: number) {
  return { x: 760 + (x / 430) * 396, y: 440 + (z / 430) * 248 };
}
