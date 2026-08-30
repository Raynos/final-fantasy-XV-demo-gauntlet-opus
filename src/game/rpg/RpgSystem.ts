/**
 * RpgSystem — the single system Game.ts registers. It owns every RPG
 * subsystem, wires them to each other, and republishes their events through
 * one emitter so the HUD, menus and combat code only need one subscription
 * point.
 *
 *   const rpg = game.get('RpgSystem');
 *   rpg.on('level-up', ({ member, to }) => hud.toast(`${member} reached ${to}`));
 *   rpg.quests.accept('hunt_killer_wasps');
 *   rpg.elemancy.craft({ fire: 99 }, { id: 'magitek_booster', count: 40 });
 *
 * Events emitted here:
 *   exp-gained, level-up, quest-updated, item-gained, item-lost, item-used,
 *   node-unlocked, ap-gained, buff-applied, buff-expired, meal-cooked,
 *   time-of-day-changed, hour-changed, day-changed, daemons-rising,
 *   daemons-receding, rested, spell-crafted, spell-cast, energy-drawn,
 *   equipment-changed, gil-changed, affinity-changed, tech-used, game-saved,
 *   game-loaded.
 */

import { Rng } from '../../util/Rng.ts';
import { Emitter } from './Emitter.ts';
import { CombatBridge } from './CombatBridge.ts';
import { HavenCamp } from './HavenCamp.ts';
import { Deposits } from './Deposits.ts';
import { Fishing } from '../fishing/Fishing.ts';
import { ExpBank, LODGINGS, computeDamage, expForKill, nightScaling, totalExpFor, MAX_LEVEL, EXP_TABLE } from './Stats.ts';
import { Ascension, AP_RULES, NODES, CONSTELLATION_INFO, EDGES } from './Ascension.ts';
import { Inventory, ITEMS, SHOPS } from './Inventory.ts';
import { Elemancy, DEPOSITS } from './Elemancy.ts';
import { QuestLog, QUESTS, HUNTS, HUNTER_RANKS, TIPSTERS } from './Quests.ts';
import { PartyState, MEMBERS, RECIPE_TABLE } from './PartyState.ts';
import { DayCycle, HAVENS } from './DayCycle.ts';
import * as SaveGame from './SaveGame.ts';
import { worldMap } from '../../world/map/WorldMap.ts';
import { fog } from '../../world/map/FogOfWar.ts';
import type { Game } from '../Game.ts';
import type { DamageOpts, DamageResult } from './Stats.ts';
import type { QuestUpdate } from './Quests.ts';
import type { RestSummary } from './DayCycle.ts';
import type { EmitterHandler } from './Emitter.ts';

/** How a fresh `RpgSystem` is dealt out. */
export interface RpgOpts {
  /** Level every member starts at. */
  startLevel?: number;
  startGil?: number;
  startAp?: number;
  /** Seconds between autosaves; 0 disables. */
  autosaveInterval?: number;
  /** Seed for drop rolls, so a capture is reproducible. */
  seed?: number;
}

/**
 * One roll through the damage formula as gameplay asks for it: the attacker
 * may be named rather than passed, and the four positional bonuses are folded
 * in here rather than by `computeDamage`.
 */
export interface DamageRequest extends Omit<DamageOpts, 'attacker'> {
  /** A member id, or an attacker block for something with no `Stats`. */
  attacker: string | DamageOpts['attacker'];
  isAerial?: boolean;
  isLink?: boolean;
  isTechnique?: boolean;
}

/**
 * Anything that pays out -- a quest, a chest, a story beat.
 *
 * Every field is optional because this is the *authored* shape: a chest gives
 * gil and items and nothing else. `QuestLog.rewardsFor` produces the resolved
 * `GrantedRewards`, which is one of these with every field filled in.
 */
export interface RewardBundle {
  gil?: number;
  exp?: number;
  ap?: number;
  items?: ReadonlyArray<{ id: string, count?: number }>;
  recipes?: readonly string[];
  /** Story flags set on payout. */
  unlocks?: readonly string[];
}

/** Enough of a corpse to pay out for it. */
export interface KilledEnemy {
  /** Species id, matched against `kill` objectives. */
  id: string;
  /** Display name, for the kill toast. */
  name?: string;
  level?: number;
  expClass?: 'trash' | 'normal' | 'elite' | 'boss' | 'daemon';
  drops?: Array<{ id: string, count?: number, chance?: number }>;
}

/** How the kill happened, for the AP rules. */
export interface KillContext {
  byWarpStrike?: boolean;
  byTechnique?: boolean;
  /**
   * The hunt this corpse was spawned as a mark for, if any.
   * @see QuestLog.creditMark — a mark counts towards its own hunt whatever the
   * bestiary calls it.
   */
  hunt?: string | null;
}

/** What a camp attempt did. */
export type CampResult =
  | (RestSummary & { meal: import('./PartyState.ts').Buff | null })
  | { ok: false, reason: string, haven?: unknown, missing?: import('./PartyState.ts').MissingIngredient[] };

/** Starting kit — what the four of them drive out of Insomnia with. */
const STARTING_ITEMS: [string, number][] = [
  ['potion', 6], ['hi_potion', 2], ['phoenix_down', 2], ['antidote', 3],
  ['engine_blade', 1], ['iron_sword', 1], ['bronze_spear', 1], ['handgun', 1],
  ['hardedge', 1], ['buckler', 1], ['plunderers', 1], ['auto_crossbow', 1],
  ['bronze_bangle', 2], ['debased_coin', 8], ['magitek_booster', 3],
  ['lucian_tomato', 2], ['leiden_pepper', 2], ['anak_meat', 1], ['cup_noodles', 1],
  ['regalia_key', 1], ['hunter_licence', 1], ['cookbook', 1], ['camera', 1], ['fishing_rod', 1],
];

/** Default equipment for each member at the start of the game. */
const STARTING_EQUIPMENT = {
  noctis:  { weapon: ['engine_blade', 'bronze_spear', 'handgun', null], accessory: ['bronze_bangle', null, null] },
  gladio:  { weapon: ['hardedge', 'buckler'], accessory: [null, null, null] },
  ignis:   { weapon: ['plunderers', null], accessory: [null, null, null] },
  prompto: { weapon: ['handgun', 'auto_crossbow'], accessory: [null, null, null] },
};

/**
 * The Ascension nodes a mid-game save is assumed to have already bought, in
 * purchase order. `startLevel > 1` walks this list so a capture shows a grid
 * that has genuinely been played rather than an empty star map.
 */
const STARTER_PATH = [
  'arm_awaken', 'arm_charge1', 'cbt_airstep', 'cbt_warpdmg1', 'cbt_warpfactor',
  'cbt_parry', 'cbt_riposte', 'cbt_dodge', 'cbt_deathblow',
  'st_hp1', 'st_hp2', 'st_mp1', 'st_str1', 'st_vit1', 'st_mag1',
  'rec_first', 'rec_quick', 'rec_second',
  'tec_bar1', 'tec_dmg1', 'tec_libra', 'tec_gladio', 'tec_ignis', 'tec_prompto',
  'tw_link1', 'tw_linkrate', 'tw_rescue',
  'mag_power1', 'mag_draw1',
  'exp_camp1', 'exp_car1', 'wait_libra',
];

/** Quests a mid-game save has already been through, and what it is carrying. */
const STARTER_QUESTS = {
  complete: ['main_ch1_departure', 'hunt_killer_wasps'],
  accept: ['main_ch1_pauper', 'side_engine_blade', 'hunt_sabertusks', 'hunt_dualhorn'],
  track: 'side_engine_blade',
};

export class RpgSystem {
  _newGameAp!: number;
  party!: PartyState;
  _autosaveTimer!: number;
  _newGameGil!: number;
  _newGameLevel!: number;
  ascension!: Ascension;
  autosaveInterval!: number;
  chapter!: number;
  /** Highest hunter rung already paid out. @see _checkHunterRank */
  _rankSeen?: number;
  combatBridge!: CombatBridge;
  havenCamp!: HavenCamp;
  deposits!: Deposits;
  fishing!: Fishing;
  day!: DayCycle;
  elemancy!: Elemancy;
  emitter!: Emitter;
  expBank!: ExpBank;
  game!: Game;
  inCombat!: boolean;
  inventory!: Inventory;
  playTime!: number;
  quests!: QuestLog;
  rng!: Rng;
  /** Static tables re-exported so the UI never imports six modules. */
  tables!: {
    items: typeof ITEMS, shops: typeof SHOPS, nodes: typeof NODES,
    constellations: typeof CONSTELLATION_INFO, edges: typeof EDGES,
    quests: typeof QUESTS, hunts: typeof HUNTS, tipsters: typeof TIPSTERS,
    recipes: typeof RECIPE_TABLE, havens: typeof HAVENS, deposits: typeof DEPOSITS,
    members: typeof MEMBERS, lodgings: typeof LODGINGS, apRules: typeof AP_RULES,
    expTable: typeof EXP_TABLE,
  };
  constructor(opts: RpgOpts = {}) {
    this.emitter = new Emitter();
    this.party = new PartyState(this.emitter);
    this.expBank = new ExpBank();
    this.ascension = new Ascension(this.emitter);
    this.inventory = new Inventory(this.emitter);
    this.elemancy = new Elemancy(this.emitter, this.inventory);
    this.quests = new QuestLog(this.emitter);
    this.day = new DayCycle(this.emitter);

    this.tables = {
      items: ITEMS, shops: SHOPS, nodes: NODES, constellations: CONSTELLATION_INFO,
      edges: EDGES, quests: QUESTS, hunts: HUNTS, tipsters: TIPSTERS,
      recipes: RECIPE_TABLE, havens: HAVENS, deposits: DEPOSITS, members: MEMBERS,
      lodgings: LODGINGS, apRules: AP_RULES, expTable: EXP_TABLE,
    };

    /** Story chapter, mirrored from the main-quest line. */
    this.chapter = 1;
    /** Seconds of real play time, for the save file. */
    this.playTime = 0;
    /** Set true by CombatSystem so the tech bar only charges in a fight. */
    this.inCombat = false;
    /** Autosave every N seconds of play; 0 disables. */
    this.autosaveInterval = opts.autosaveInterval ?? 180;
    this._autosaveTimer = 0;
    this._newGameLevel = opts.startLevel ?? 1;
    this._newGameGil = opts.startGil ?? 0;
    this._newGameAp = opts.startAp ?? 0;
    /** Seeded so drops, and therefore every capture, are reproducible. */
    this.rng = new Rng(opts.seed ?? 0x9e3779b1);
    /** Subscribes to CombatSystem and routes hits through the damage formula. */
    this.combatBridge = new CombatBridge(this);
    /** The "Camp" prompt at every haven. Installed on the first tick — see below. */
    this.havenCamp = new HavenCamp(this);
    /** The "Fish" prompt at every fishing hole that has real water under it. */
    this.fishing = new Fishing(this);
    /** The twelve elemental deposits, as objects you can see and draw from. */
    this.deposits = new Deposits(this);
  }

  /* -- Lifecycle --------------------------------------------------------- */

  /**
   * Wire everything up. If `?rpgsave` is present in the URL and a save exists,
   * it is loaded; otherwise a fresh game is dealt out.
   */
  async init(game: Game) {
    this.game = game;
    this._wire();

    const wantsLoad = typeof location !== 'undefined'
      && new URLSearchParams(location.search).has('continue');
    if (wantsLoad && SaveGame.hasSave()) this.loadGame();
    else this.newGame();

    this.refreshDerived();
    this.combatBridge.attach(game);
    this.emitter.emit('rpg-ready', { rpg: this });
    return this;
  }

  /** Deal out a fresh game: starting kit, starting quests, level 1 party. */
  newGame() {
    for (const [id, n] of STARTING_ITEMS) this.inventory.add(id, n, 'start');
    this.inventory.addGil(500, 'start');
    for (const m of MEMBERS) {
      const eq = STARTING_EQUIPMENT[m.id as keyof typeof STARTING_EQUIPMENT];
      if (!eq) continue;
      eq.weapon.forEach((id: string | null, i: number) => { if (id) this.inventory.equip(m.id, 'weapon', i, id); });
      eq.accessory.forEach((id: string | null, i: number) => { if (id) this.inventory.equip(m.id, 'accessory', i, id); });
      if (this._newGameLevel > 1) this.party.stats[m.id].applyExp(this._expToReach(this._newGameLevel));
    }
    this.quests.refresh();
    this.quests.accept('main_ch1_departure');
    this.day.setHour(9);
    if (this._newGameLevel > 1) this._seedMidGame();
    // Levelling raises max HP/MP but not the current pools, so a party dealt out
    // above level 1 would otherwise start on its level-1 MP.
    this.refreshDerived();
    this.party.restoreAll();
    return this;
  }

  /**
   * Fast-forward a fresh save to something that looks like it has been played:
   * a walked Ascension path, a chapter behind it, a live quest log and a wallet.
   * Only runs when `startLevel > 1`.
   */
  _seedMidGame() {
    for (const id of STARTER_QUESTS.complete) {
      this.quests.accept(id);
      this.quests.complete(id);
    }
    for (const id of STARTER_QUESTS.accept) this.quests.accept(id);
    if (this.quests.states[STARTER_QUESTS.track]?.status === 'active') this.quests.track(STARTER_QUESTS.track);

    // Buy the starter path outright, then leave the wallet at the requested AP.
    for (const id of STARTER_PATH) {
      const n = this.ascension.node(id);
      if (!n || this.ascension.isUnlocked(id)) continue;
      if (this.ascension.ap < n.ap) this.ascension.grantRaw(n.ap - this.ascension.ap, 'seed');
      this.ascension.unlock(id);
    }
    if (this._newGameAp > 0) this.ascension.ap = this._newGameAp;
    if (this._newGameGil > 0) this.inventory.addGil(this._newGameGil - this.inventory.gil, 'seed');

    // A party this far in has picked things up along the road.
    const kit: [string, number][] = [
      ['hi_potion', 12], ['mega_potion', 4], ['elixir', 3], ['phoenix_down', 2],
      ['remedy', 4], ['ether', 5], ['sabertusk_fang', 6], ['rusted_bit', 2],
      ['debased_silver', 5], ['sky_gemstone', 1], ['venom_fang', 4],
      ['lucian_tomato', 5], ['anak_meat', 3], ['leiden_potato', 4], ['wild_onion', 3],
      ['zwill_crossblades', 1], ['hardedge', 1], ['silver_bangle', 1], ['circlet', 1],
    ];
    for (const [id, n] of kit) this.inventory.add(id, n, 'seed');
    // Allies have been landing hits all afternoon: the tech bar sits part-full.
    this.party.techCharge = 2.35;
    // Ignis has cooked at every haven since Hammerhead. Without this his
    // cooking level sits at 1 and three of the four recipes he *starts* the
    // game knowing are rank 2, so he cannot cook them.
    this.party.mealsCooked = 9;
    this.party.cookingLevel = 5;
    for (const r of ['grilled_wild_trout', 'lestallum_skewers', 'birdbeast_omelette',
      'mother_child_rice', 'croque_madame', 'multi_meat_sandwich', 'lasagna_al_forno']) {
      this.party.learnRecipe(r);
    }
    this.inventory.equip('noctis', 'weapon', 3, 'zwill_crossblades');
    this.inventory.equip('noctis', 'accessory', 1, 'silver_bangle');
    this.inventory.equip('ignis', 'accessory', 0, 'circlet');

    // Ignis cooked this morning: the party is carrying a real meal buff.
    this.party.cook('lucian_tomato_stew', this.inventory, this.day.absoluteHour);

    // A save this far in has hours on it; the menu prints this as play time.
    this.playTime = 27 * 3600 + 14 * 60;
  }

  /** Subscribe our own cross-system reactions. */
  _wire() {
    // Unlocking a node changes stats, techniques, magic and shop prices.
    this.emitter.on('node-unlocked', () => this.refreshDerived());
    this.emitter.on('equipment-changed', () => this.refreshGear());

    // Teach the quest log to read the bag and the wallet. Ten of the eleven
    // `fetch` objectives in the table had no notifier at all -- the only
    // `notify('fetch')` in the repo is Cid's hand-over line -- so picking a
    // Rusted Bit up off a dead MT trooper moved nothing and the log printed
    // 0/3 with three in the bag. @see QuestLog.settle
    this._attachHoldings();
    this.emitter.on('item-gained', () => this.quests.settleAll());
    // `buy` is event-only -- `settle()` cannot ask the bag "was this bought" --
    // so this listener is the whole of the notifier. Weapons report as
    // `weapon` so an objective can ask for "a weapon, any weapon".
    this.emitter.on('item-bought', (p: { id: string; def?: { category?: string } }) => {
      this.quests.notify('buy', { target: p.def?.category === 'weapon' ? 'weapon' : p.id });
    });
    this.emitter.on('gil-changed', () => this.quests.settleAll());

    // Record the rung the save is already on, so the first hunt of the session
    // pays its rank-up instead of being swallowed as "the baseline".
    this._checkHunterRank();

    // Quest completion pays out.
    this.emitter.on('quest-updated', (p: QuestUpdate) => {
      if (p.phase !== 'complete') return;
      this.grantRewards(p.rewards, `quest:${p.quest.id}`);
      if (p.quest.type === 'hunt') { this.ascension.awardAp('hunt-complete'); this._checkHunterRank(); }
      else if (p.quest.type === 'main') {
        this.ascension.awardAp('chapter-complete');
        this.chapter = Math.max(this.chapter, (p.quest.chapter || this.chapter) + 1);
      } else this.ascension.awardAp('quest-complete');
    });

    // A rest is the only thing that turns banked EXP into levels.
    this.emitter.on('rested', (summary: RestSummary) => {
      if (!summary.exp) return;
      for (const m of summary.exp.perMember) {
        for (const lv of m.levels) {
          this.emitter.emit('level-up', { member: m.id, name: m.name, to: lv, from: m.from, stats: this.party.stats[m.id] });
        }
      }
      this.refreshDerived();
      this.save('auto');
    });
  }

  /**
   * Point the quest log at the live bag and wallet.
   *
   * Re-run after `loadGame`, which swaps in a brand-new `QuestLog` — the
   * subscriptions above read `this.quests` late so they survive the swap, but
   * the holdings live on the object itself and do not.
   */
  _attachHoldings() {
    this.quests.holdings = {
      bag: (id: string) => this.inventory.count(id),
      gil: () => this.inventory.gil,
    };
  }

  /** Recompute every derived bucket. Cheap enough to call on any change. */
  refreshDerived() {
    this.party.applyAscension(this.ascension);
    this.elemancy.applyAscension(this.ascension);
    this.inventory.sellBonus = this.ascension.value('sellPrice');
    this.expBank.multiplier = this.party.expMultiplier
      * (this.inventory.tagsFor('noctis').has('exp+20') ? 1.2 : 1);
    this.refreshGear();
  }

  /** Fold equipment into each member's `Stats.gear`. */
  refreshGear() {
    for (const m of MEMBERS) {
      const s = this.party.stats[m.id];
      s.gear = this.inventory.modsFor(m.id);
      s.hp = Math.min(s.hp, s.maxHp);
      s.mp = Math.min(s.mp, s.maxMp);
    }
  }

  /**
   * Per-frame tick.
   * @param dt seconds
   */
  update(dt: number, game: Game) {
    this.playTime += dt;
    // `Interaction` boots six systems after this one, so the camp prompts
    // cannot be registered in `init()`. This is a no-op after the first tick.
    this.havenCamp.install(game);
    // Same first-tick install, then a per-frame pulse and distance cull.
    this.deposits.install(game);
    this.deposits.update(dt, game);
    // Installs itself the same way, and owns the input while a cast is live.
    this.fishing.update(dt, game);
    this.combatBridge.update(dt, game);
    this.day.update(dt, game);
    this.ascension.update(dt);
    this.party.chargeTech(dt, this.inCombat);
    this.party.expireBuffs(this.day.absoluteHour);

    // Quest waypoints react to where the player is standing.
    const player = game?.get?.('Player');
    if (player?.position) this.quests.checkProximity(player.position);

    // Mirror Noctis' vitals onto the Player handle the HUD already reads.
    // CombatSystem writes damage straight onto this object; anything it took
    // off is folded back into the model here so `Stats` stays authoritative.
    if (player?.stats) {
      const n = this.noctis;
      const lost = Math.max(0, Math.round(n.hp) - player.stats.hp);
      if (lost > 0 && player.stats.maxHp === n.maxHp) n.applyDamage(lost);
      const spent = Math.max(0, Math.round(n.mp) - player.stats.mp);
      if (spent > 0 && player.stats.maxMp === n.maxMp) n.mp = Math.max(0, n.mp - spent);
      player.stats.hp = Math.round(n.hp);
      player.stats.maxHp = n.maxHp;
      player.stats.mp = Math.round(n.mp);
      player.stats.maxMp = n.maxMp;
      player.stats.level = n.level;
    }

    // Mirror the three companions onto the scene-graph Party the same way, so
    // `Party.members[i].stats` is the model rather than a literal.
    const party = game?.get?.('Party');
    if (party?.members) {
      for (const m of party.members) {
        const s = this.party.stats[m.key];
        if (!s) continue;
        m.stats = m.stats || {};
        m.stats.hp = Math.round(s.hp);
        m.stats.maxHp = s.maxHp;
        m.stats.mp = Math.round(s.mp);
        m.stats.maxMp = s.maxMp;
        m.stats.level = s.level;
        m.stats.ko = s.ko;
      }
    }

    if (this.autosaveInterval > 0) {
      this._autosaveTimer += dt;
      if (this._autosaveTimer >= this.autosaveInterval) { this._autosaveTimer = 0; this.save('auto'); }
    }
  }

  /**
   * After everything has moved.
   *
   * Only the fishing tackle needs this, and it needs it for two reasons that
   * are worth naming because both were invisible defects in a working frame:
   * the rod hangs off a **bone socket**, whose world matrix is stale during
   * `update`, and `Menus` boots after `Rpg`, so a `setMenuOpen` written in
   * `update` is overwritten in the same frame.
   */
  lateUpdate(dt: number, game: Game) {
    this.fishing.lateUpdate(dt, game);
  }

  /* -- Event API --------------------------------------------------------- */

  /** Subscribe. Returns an unsubscribe function. */
  on<P = unknown>(event: string, fn: EmitterHandler<P>) { return this.emitter.on<P>(event, fn); }
  /** Subscribe once. */
  once<P = unknown>(event: string, fn: EmitterHandler<P>) { return this.emitter.once<P>(event, fn); }
  /** Unsubscribe. */
  off(event: string, fn: EmitterHandler<never>) { return this.emitter.off(event, fn); }
  /** Fire an event (mostly for other systems to announce things). */
  emit<P>(event: string, payload: P) { return this.emitter.emit<P>(event, payload); }

  /* -- Handy accessors --------------------------------------------------- */

  /** Noctis' Stats block. */
  get noctis() { return this.party.stats.noctis; }
  /** All four Stats blocks. */
  get roster() { return this.party.roster; }
  /** Gil on hand. */
  get gil() { return this.inventory.gil; }
  /** AP on hand. */
  get ap() { return this.ascension.ap; }
  /** Banked, unredeemed EXP. */
  get bankedExp() { return this.expBank.banked; }
  /** Current hour, 0..24. */
  get hour() { return this.day.hour; }
  /** True after dark. */
  get isNight() { return this.day.isNight; }

  /**
   * One object with everything a HUD needs this frame.
   */
  hudState() {
    const n = this.noctis;
    return {
      level: n.level, hp: Math.round(n.hp), maxHp: n.maxHp, mp: Math.round(n.mp), maxMp: n.maxMp,
      expProgress: n.expProgress, banked: this.expBank.banked,
      gil: this.inventory.gil, ap: this.ascension.ap,
      techBars: this.party.techBars, maxTechBars: this.party.maxTechBars,
      clock: this.day.clockString, day: this.day.day, phase: this.day.phase.name,
      isNight: this.day.isNight, nightDepth: this.day.nightDepth,
      buffs: this.party.activeBuffs.map((b) => ({ name: b.name, effects: b.effects, hoursLeft: Math.max(0, b.expiresAt - this.day.absoluteHour) })),
      tracked: this.quests.tracked ? this.quests.view(this.quests.tracked) : null,
      waypoints: this.quests.waypoints(),
      spells: this.elemancy.equipped.map((uid: string | null) => (uid ? this.elemancy.spell(uid) : null)),
      party: MEMBERS.map((m) => {
        const s = this.party.stats[m.id];
        return { id: m.id, name: m.name, hp: Math.round(s.hp), maxHp: s.maxHp, mp: Math.round(s.mp), maxMp: s.maxMp, ko: s.ko, level: s.level, bond: this.party.bond(m.id) };
      }),
    };
  }

  /* -- Gameplay hooks ---------------------------------------------------- */

  /**
   * Award EXP into the bank (it does not level anyone until they sleep).
   */
  gainExp(amount: number, source: string = 'battle') {
    const gained = this.expBank.add(amount, source);
    this.emitter.emit('exp-gained', { amount: gained, source, banked: this.expBank.banked });
    return gained;
  }

  /**
   * Call when something dies. Banks EXP, awards AP, ticks kill objectives and
   * rolls drops.
   */
  enemyKilled(enemy: KilledEnemy, ctx: KillContext = {}) {
    const exp = expForKill(enemy, this.day.hour);
    this.gainExp(exp, 'battle');
    if (ctx.byWarpStrike) this.ascension.awardAp('warp-strike-kill');
    if (ctx.byTechnique) this.ascension.awardAp('tech-finish');
    if (enemy.expClass === 'boss') this.ascension.awardAp('boss-kill');
    const credited = this.quests.notify('kill', { target: enemy.id, count: 1 });
    // A hunt's mark counts towards its own hunt even when the board calls it
    // something the bestiary does not — but only if the species line above did
    // not already pay this quest, so a matching hunt is never paid twice.
    if (ctx.hunt && !credited.some((v) => v.id === ctx.hunt)) this.quests.creditMark(ctx.hunt);
    for (const m of MEMBERS) this.party.addAffinity(m.id, 1);

    const drops = [];
    const rate = 1 + this.ascension.value('dropRate');
    for (const d of enemy.drops || []) {
      if (this.rng.next() < Math.min(1, (d.chance ?? 0.3) * rate)) {
        this.inventory.add(d.id, d.count || 1, 'drop');
        drops.push(d.id);
      }
    }
    return { exp, drops };
  }

  /** Combat verbs that earn AP. See AP_RULES for the full list. */
  warpStrike() { return this.ascension.awardAp('warp-strike'); }
  parry() { return this.ascension.awardAp('parry'); }
  linkStrike(members = 2) { return this.ascension.awardAp(members > 2 ? 'cross-chain' : 'link-strike'); }
  stagger() { return this.ascension.awardAp('stagger'); }
  drove(metres: number) { return this.ascension.awardAp('regalia-distance', metres); }
  rode(metres: number) { return this.ascension.awardAp('chocobo-distance', metres); }

  /**
   * Roll a hit through the damage formula with all the current modifiers
   * folded in — night scaling, ascension bonuses, weapon class weakness.
   * @param opts see `computeDamage`; `attacker` may be a member id
   */
  damage(opts: DamageRequest): DamageResult {
    const attacker = typeof opts.attacker === 'string' ? this.party.stats[opts.attacker] : opts.attacker;
    let motion = opts.motion ?? 1;
    if (opts.isWarpStrike) motion *= 1 + this.ascension.value('warpDamage');
    if (opts.isAerial) motion *= 1 + this.ascension.value('airDamage');
    if (opts.isLink) motion *= 1 + this.ascension.value('linkDamage');
    if (opts.isTechnique) motion *= 1 + this.ascension.value('techDamage');
    return computeDamage({
      ...opts, attacker, motion,
      hour: opts.hour ?? this.day.hour,
    });
  }

  /** Give the party an item and announce it. */
  giveItem(id: string, count = 1, source = 'reward') { return this.inventory.add(id, count, source); }

  /** Apply a quest/story reward bundle. */
  /**
   * Pay the hunter rank-up the board has always promised and never handed over.
   *
   * `HUNTER_RANKS` carried a `reward` string per rung and it was printed on the
   * board and never granted — so the ladder went up and nothing came of it,
   * which is the "fight -> reward -> spend -> fight better" loop stopping one
   * step short. Crossing a rung now pays its accessory once, and the crossing
   * itself is announced.
   *
   * `_rankSeen` is the highest rung already paid. It is derived from the points
   * on load rather than saved, so an existing save cannot be paid twice and a
   * new rung added later still pays out.
   */
  _checkHunterRank() {
    const pts = this.quests.hunterPoints;
    let seen = this._rankSeen;
    if (seen == null) seen = -1;
    let top = -1;
    for (let i = 0; i < HUNTER_RANKS.length; i++) if (pts >= HUNTER_RANKS[i].at) top = i;
    if (top <= seen) { this._rankSeen = Math.max(seen, top); return null; }
    const rung = HUNTER_RANKS[top];
    this._rankSeen = top;
    if (seen < 0) return null;               // first call on a loaded save: record, do not pay
    if (rung.item) this.inventory.add(rung.item, 1, 'hunter-rank');
    this.emit('hunter-rank-up', { rank: top, name: rung.name, points: pts, reward: rung.reward });
    window.dispatchEvent(new CustomEvent('ffxv-hunter-rank', {
      detail: { rank: top, name: rung.name, points: pts, reward: rung.reward, unlocks: rung.unlocks },
    }));
    return rung;
  }

  grantRewards(rewards: RewardBundle | null | undefined, source = 'reward') {
    if (!rewards) return null;
    if (rewards.gil) this.inventory.addGil(rewards.gil, source);
    if (rewards.exp) this.gainExp(rewards.exp, source);
    if (rewards.ap) this.ascension.grantRaw(rewards.ap, source);
    for (const it of rewards.items || []) this.inventory.add(it.id, it.count, source);
    for (const r of rewards.recipes || []) this.party.learnRecipe(r);
    for (const u of rewards.unlocks || []) this.quests.setFlag(u);
    return rewards;
  }

  /**
   * Camp at a haven: cook (optionally) and sleep.
   * @param [opts] `{ pos, recipe, lodging, force }`
   */
  camp(opts: { pos?: { x: number, z: number }, recipe?: string, lodging?: string, force?: boolean, wakeHour?: number } = {}): CampResult {
    const pos = opts.pos || this.game?.get?.('Player')?.position;
    const lodging = opts.lodging || 'haven';
    if (lodging === 'haven' && !opts.force) {
      const check = this.day.canCamp(pos || { x: 0, z: 0 });
      if (!check.ok) return { ok: false, reason: check.reason, haven: check.haven };
    }

    let meal: import('./PartyState.ts').Buff | null = null;
    if (opts.recipe) {
      const cooked = this.party.cook(opts.recipe, this.inventory, this.day.absoluteHour);
      if (!cooked.ok) return { ok: false, reason: cooked.reason, missing: cooked.missing };
      meal = cooked.buff;
      this.quests.notify('cook', { target: opts.recipe });
      this.ascension.awardAp('cook');
    }

    const rested = this.day.rest({
      pos, lodging, force: opts.force,
      party: this.party, expBank: this.expBank, inventory: this.inventory,
      havenExpBonus: this.ascension.value('havenExpBonus'),
      wakeHour: opts.wakeHour,
    });
    if (!rested.ok) return rested;

    // FFXV's rule: the meal you cook at camp is in effect when you *wake*.
    // Without this the buff's in-game hours are burned by the night's sleep and
    // cooking before bed does nothing at all.
    if (meal && !this.party.activeBuffs.includes(meal)) {
      meal = this.party.addBuff({
        kind: 'meal', id: meal.id, name: meal.name, mods: meal.mods,
        tags: meal.tags, effects: meal.effects, hours: meal.hours,
      }, this.day.absoluteHour);
    }

    if (lodging === 'haven') this.ascension.awardAp('camp');
    this.quests.notify('rest', { target: 'any' });
    if (this.ascension.has('camp-full-restore')) this.party.restoreAll();
    return { ...rested, meal };
  }

  /** Sleep at a paid lodging (no haven check, costs gil). */
  restAt(lodgingId: string, opts: { wakeHour?: number, recipe?: string } = {}) { return this.camp({ ...opts, lodging: lodgingId, force: true }); }

  /**
   * Draw elemental energy from the nearest deposit to a point.
   * @param [radius=8]
   */
  drawNearby(pos: {x:number, z:number}, radius: number = 8) {
    let best: typeof DEPOSITS[number] | null = null, bestD = Infinity;
    for (const d of DEPOSITS) {
      const dist = Math.hypot(pos.x - d.pos[0], pos.z - d.pos[2]);
      if (dist < bestD) { bestD = dist; best = d; }
    }
    if (!best || bestD > radius) return { ok: false, reason: 'no-deposit-nearby', nearest: best, distance: bestD };
    const res = this.elemancy.draw(best.id, { hour: this.day.absoluteHour });
    if (res.ok) this.quests.notify('draw', { target: res.element, count: res.gained });
    return res;
  }

  /**
   * Craft a spell using Noctis' Magic stat.
   * @param energy `{ fire, ice, lightning }`
   * @param [catalyst] `{ id, count }`
   */
  craftSpell(energy: { fire?: number, ice?: number, lightning?: number }, catalyst: { id: string, count: number } | null = null) {
    const res = this.elemancy.craft(energy, catalyst, this.noctis.magic);
    if (res.ok) this.quests.notify('craft', { target: 'any' });
    return res;
  }

  /** Buy an Ascension node. */
  unlockNode(id: string) { return this.ascension.unlock(id); }

  /** Fire a party technique. */
  useTechnique(memberId: string, techId: string) { return this.party.useTechnique(memberId, techId); }

  /** Enemy stat scaling for right now, given the party's level. */
  enemyScaling(isDaemon = false) { return nightScaling(this.day.hour, isDaemon); }

  /** Daemon spawn pressure for the Enemies system. */
  daemonPressure() { return this.day.daemonPressure(this.party.averageLevel); }

  /* -- Saving ------------------------------------------------------------ */

  /** Write a save slot. */
  save(slot = 'auto') {
    const res = SaveGame.save(this, slot);
    if (res.ok) this.emitter.emit('game-saved', res);
    return res;
  }

  /**
   * Load a save slot in place, replacing every subsystem's state.
   * @param [slot='auto']
   */
  loadGame(slot: string = 'auto') {
    const res = SaveGame.load(slot);
    if (!res.ok) return res;
    const d = res.data;
    this.party = PartyState.fromJSON(d.party, this.emitter);
    this.expBank = ExpBank.fromJSON(d.expBank);
    this.ascension = Ascension.fromJSON(d.ascension, this.emitter);
    this.inventory = Inventory.fromJSON(d.inventory, this.emitter);
    this.elemancy = Elemancy.fromJSON(d.elemancy, this.emitter, this.inventory);
    this.quests = QuestLog.fromJSON(d.quests, this.emitter);
    this.day = DayCycle.fromJSON(d.day, this.emitter);
    // The map is a module singleton, not one of ours, so it restores here
    // rather than in a `fromJSON` of its own. Hammerhead and its layby stay in
    // regardless: they are what a new game starts with and no save should be
    // able to take them away.
    if (d.map) {
      if (d.map.discovered) for (const id of d.map.discovered) worldMap.discover(id);
      fog.fromJSON(d.map.fog);
    }
    this.chapter = d.chapter || 1;
    this.playTime = d.playTime || 0;
    this._attachHoldings();
    // A save written before `settle` existed can hold a quest whose standing
    // objectives were already true and never recorded. Bring it up to date on
    // load rather than waiting for the next coin to change hands.
    this.quests.settleAll();
    this.refreshDerived();
    this.emitter.emit('game-loaded', { slot, migrated: res.migrated, from: res.from, meta: d.meta });
    return { ok: true, migrated: res.migrated, meta: d.meta };
  }

  /** Saved slots, for the title screen. */
  listSaves() { return SaveGame.listSaves(); }

  /** Total EXP needed to reach a level from scratch — used by newGame. */
  _expToReach(level: number) { return totalExpFor(Math.min(level, MAX_LEVEL)); }
}

export default RpgSystem;
