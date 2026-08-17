/**
 * RpgSystem — the single system Game.js registers. It owns every RPG
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

import { Rng } from '../../util/Rng.js';
import { Emitter } from './Emitter.js';
import { CombatBridge } from './CombatBridge.js';
import { ExpBank, LODGINGS, computeDamage, expForKill, nightScaling, totalExpFor, MAX_LEVEL, EXP_TABLE } from './Stats.js';
import { Ascension, AP_RULES, NODES, CONSTELLATION_INFO, EDGES } from './Ascension.js';
import { Inventory, ITEMS, SHOPS } from './Inventory.js';
import { Elemancy, DEPOSITS } from './Elemancy.js';
import { QuestLog, QUESTS, HUNTS, TIPSTERS } from './Quests.js';
import { PartyState, MEMBERS, RECIPE_TABLE } from './PartyState.js';
import { DayCycle, HAVENS } from './DayCycle.js';
import * as SaveGame from './SaveGame.js';

/** Starting kit — what the four of them drive out of Insomnia with. */
const STARTING_ITEMS = [
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
  constructor(opts = {}) {
    this.emitter = new Emitter();
    this.party = new PartyState(this.emitter);
    this.expBank = new ExpBank();
    this.ascension = new Ascension(this.emitter);
    this.inventory = new Inventory(this.emitter);
    this.elemancy = new Elemancy(this.emitter, this.inventory);
    this.quests = new QuestLog(this.emitter);
    this.day = new DayCycle(this.emitter);

    /** Static tables re-exported so the UI never imports six modules. */
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
  }

  /* -- Lifecycle --------------------------------------------------------- */

  /**
   * Wire everything up. If `?rpgsave` is present in the URL and a save exists,
   * it is loaded; otherwise a fresh game is dealt out.
   * @param {object} game
   */
  async init(game) {
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
      const eq = STARTING_EQUIPMENT[m.id];
      if (!eq) continue;
      eq.weapon.forEach((id, i) => { if (id) this.inventory.equip(m.id, 'weapon', i, id); });
      eq.accessory.forEach((id, i) => { if (id) this.inventory.equip(m.id, 'accessory', i, id); });
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
    const kit = [
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

    // Quest completion pays out.
    this.emitter.on('quest-updated', (p) => {
      if (p.phase !== 'complete') return;
      this.grantRewards(p.rewards, `quest:${p.quest.id}`);
      if (p.quest.type === 'hunt') this.ascension.awardAp('hunt-complete');
      else if (p.quest.type === 'main') {
        this.ascension.awardAp('chapter-complete');
        this.chapter = Math.max(this.chapter, (p.quest.chapter || this.chapter) + 1);
      } else this.ascension.awardAp('quest-complete');
    });

    // A rest is the only thing that turns banked EXP into levels.
    this.emitter.on('rested', (summary) => {
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
   * @param {number} dt seconds
   * @param {object} game
   */
  update(dt, game) {
    this.playTime += dt;
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

  /* -- Event API --------------------------------------------------------- */

  /** Subscribe. Returns an unsubscribe function. */
  on(event, fn) { return this.emitter.on(event, fn); }
  /** Subscribe once. */
  once(event, fn) { return this.emitter.once(event, fn); }
  /** Unsubscribe. */
  off(event, fn) { return this.emitter.off(event, fn); }
  /** Fire an event (mostly for other systems to announce things). */
  emit(event, payload) { return this.emitter.emit(event, payload); }

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
      spells: this.elemancy.equipped.map((uid) => (uid ? this.elemancy.spell(uid) : null)),
      party: MEMBERS.map((m) => {
        const s = this.party.stats[m.id];
        return { id: m.id, name: m.name, hp: Math.round(s.hp), maxHp: s.maxHp, mp: Math.round(s.mp), maxMp: s.maxMp, ko: s.ko, level: s.level, bond: this.party.bond(m.id) };
      }),
    };
  }

  /* -- Gameplay hooks ---------------------------------------------------- */

  /**
   * Award EXP into the bank (it does not level anyone until they sleep).
   * @param {number} amount
   * @param {string} [source]
   */
  gainExp(amount, source = 'battle') {
    const gained = this.expBank.add(amount, source);
    this.emitter.emit('exp-gained', { amount: gained, source, banked: this.expBank.banked });
    return gained;
  }

  /**
   * Call when something dies. Banks EXP, awards AP, ticks kill objectives and
   * rolls drops.
   * @param {object} enemy `{ id, level, expClass, drops? }`
   * @param {object} [ctx] `{ byWarpStrike, byTechnique }`
   */
  enemyKilled(enemy, ctx = {}) {
    const exp = expForKill(enemy, this.day.hour);
    this.gainExp(exp, 'battle');
    if (ctx.byWarpStrike) this.ascension.awardAp('warp-strike-kill');
    if (ctx.byTechnique) this.ascension.awardAp('tech-finish');
    if (enemy.expClass === 'boss') this.ascension.awardAp('boss-kill');
    this.quests.notify('kill', { target: enemy.id, count: 1 });
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
  drove(metres) { return this.ascension.awardAp('regalia-distance', metres); }
  rode(metres) { return this.ascension.awardAp('chocobo-distance', metres); }

  /**
   * Roll a hit through the damage formula with all the current modifiers
   * folded in — night scaling, ascension bonuses, weapon class weakness.
   * @param {object} opts see `computeDamage`; `attacker` may be a member id
   */
  damage(opts) {
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
  giveItem(id, count = 1, source = 'reward') { return this.inventory.add(id, count, source); }

  /** Apply a quest/story reward bundle. */
  grantRewards(rewards, source = 'reward') {
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
   * @param {object} [opts] `{ pos, recipe, lodging, force }`
   */
  camp(opts = {}) {
    const pos = opts.pos || this.game?.get?.('Player')?.position;
    const lodging = opts.lodging || 'haven';
    if (lodging === 'haven' && !opts.force) {
      const check = this.day.canCamp(pos || { x: 0, z: 0 });
      if (!check.ok) return { ok: false, reason: check.reason, haven: check.haven };
    }

    let meal = null;
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
  restAt(lodgingId, opts = {}) { return this.camp({ ...opts, lodging: lodgingId, force: true }); }

  /**
   * Draw elemental energy from the nearest deposit to a point.
   * @param {{x:number, z:number}} pos
   * @param {number} [radius=8]
   */
  drawNearby(pos, radius = 8) {
    let best = null, bestD = Infinity;
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
   * @param {object} energy `{ fire, ice, lightning }`
   * @param {object} [catalyst] `{ id, count }`
   */
  craftSpell(energy, catalyst = null) {
    const res = this.elemancy.craft(energy, catalyst, this.noctis.magic);
    if (res.ok) this.quests.notify('craft', { target: 'any' });
    return res;
  }

  /** Buy an Ascension node. */
  unlockNode(id) { return this.ascension.unlock(id); }

  /** Fire a party technique. */
  useTechnique(memberId, techId) { return this.party.useTechnique(memberId, techId); }

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
   * @param {string} [slot='auto']
   */
  loadGame(slot = 'auto') {
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
    this.chapter = d.chapter || 1;
    this.playTime = d.playTime || 0;
    this.refreshDerived();
    this.emitter.emit('game-loaded', { slot, migrated: res.migrated, from: res.from, meta: d.meta });
    return { ok: true, migrated: res.migrated, meta: d.meta };
  }

  /** Saved slots, for the title screen. */
  listSaves() { return SaveGame.listSaves(); }

  /** Total EXP needed to reach a level from scratch — used by newGame. */
  _expToReach(level) { return totalExpFor(Math.min(level, MAX_LEVEL)); }
}

export default RpgSystem;
