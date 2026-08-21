/**
 * The wire between `CombatSystem` and the RPG model.
 *
 * This file used to *re-resolve* every hit after the fact: `CombatSystem` rolled
 * a number off a weapon literal, emitted it, and the bridge listened, rolled the
 * real number through `Stats.computeDamage`, rewrote the event and then nudged
 * the enemy's HP back to agree. Two damage models, reconciled once a frame.
 *
 * That is gone. `CombatSystem.resolve()` now calls `computeDamage` **at source**,
 * for every swing, warp, counter, link, Armiger arm and spell, so there is one
 * number and everyone sees the same one.
 *
 * What is left here is the RPG-side consequences of a fight:
 *
 *  - the **Armiger gauge**, filled by damage dealt and by warping;
 *  - the **tech bar**, charged by damage dealt and damage taken (in FFXV it is
 *    a fight meter, not a stopwatch — it used to fill purely on elapsed time);
 *  - **AP** for warp-strikes, parries, staggers and link-strikes;
 *  - kill payouts *only when nobody else is running the fight* — the live
 *    `EncounterDirector` owns EXP, gil, drops and quest ticks, and paying twice
 *    was doubling every reward;
 *  - the damage-taken flash on the HUD, and the technique call-out banner.
 *
 * It also still owns `roll()`, the public one-shot damage resolver the capture
 * stand-in in `CombatHUD` uses to print genuine numbers over posed enemies.
 */

import { Rng } from '../../util/Rng.ts';

export class CombatBridge {
  _off!: any[];
  _onTech!: any;
  _rng!: Rng;
  _warpUntil!: number;
  armiger!: number;
  combat!: any;
  game!: any;
  lastRoll!: any;
  rpg!: any;
  constructor(rpg: import('./RpgSystem.ts').RpgSystem) {
    this.rpg = rpg;
    this.combat = null;
    this.game = null;
    this._off = [];
    /** Seeded per hit so a posed capture's roll depends only on sim state. */
    this._rng = new Rng(0xa53f11);
    this._warpUntil = -1;
    /** Last resolved damage roll, for anything that wants to inspect it. */
    this.lastRoll = null;
    /**
     * The Armiger gauge, 0..1. FFXV fills it from damage dealt and warp-strikes
     * and empties it over the burst. `CombatSystem.tryArmiger` will not fire
     * until this reads 1.
     */
    this.armiger = 0;
  }

  /**
   * Subscribe to the combat system. Safe to call when there isn't one.
   */
  attach(game: any) {
    this.game = game;
    const combat = game?.get?.('Combat');
    if (!combat || typeof combat.on !== 'function') return false;
    this.combat = combat;
    const on = (n: any, fn: any) => this._off.push(combat.on(n, fn));

    on('damage', (ev: any) => this._onDamage(ev));
    on('death', (ev: any) => this._onDeath(ev));
    on('warp', (ev: any) => this._onWarp(ev));
    on('parry', () => this.rpg.parry());
    on('stagger', () => this.rpg.stagger());
    on('link', () => this.rpg.linkStrike(2));
    on('playerHit', (ev: any) => this._onPlayerHit(ev));

    // Techniques are fired by `PartyAI`, which announces on the window bus.
    // Give each one a cinematic beat: a banner and a sliver of slow motion.
    this._onTech = (e: any) => this._techBeat(e.detail || {});
    window.addEventListener('encounter:tech', this._onTech);
    this._off.push(() => window.removeEventListener('encounter:tech', this._onTech));
    return true;
  }

  /** Drop every subscription. */
  detach() { for (const off of this._off) off(); this._off.length = 0; }

  /** Called from `RpgSystem.update`. */
  update(dt: any, game: any) {
    const combat = this.combat || game?.get?.('Combat');
    if (!combat) return;
    // The tech bar only charges in a fight. `EncounterDirector` overwrites this
    // later in the same frame with its own, stricter, encounter state.
    this.rpg.inCombat = !!combat.inCombat;
    // An active Armiger burst spends the gauge over its duration.
    if (combat.armigerTimer > 0) this.armiger = Math.max(0, this.armiger - dt / 8);

    // With no live encounter loop running, nothing else claims a corpse. Sweep
    // for kills that came in through a back door — a scenario, a script, a
    // debug hit — so a death is never silently worth nothing.
    const dir = game?.get?.('Encounters');
    if (dir && dir.enabled && !dir.enemies?.frozen) return;
    const list = game?.get?.('Enemies')?.list;
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead && !e._looted) this._onDeath({ enemy: e });
    }
  }

  /* -- events ------------------------------------------------------------ */

  _onWarp(ev: any) {
    if (ev?.phase !== 'impact') return;
    // A window rather than a flag: the Director's frozen scenarios emit the
    // damage event after the warp impact rather than before it.
    this._warpUntil = (this.game?.time?.now ?? 0) + 0.35;
    this.rpg.warpStrike();
  }

  /**
   * A hit landed. The number is already the model's — `CombatSystem` rolled it
   * through `computeDamage` before it ever left the swing. All that is owed
   * here is the meters it feeds.
   */
  _onDamage(ev: any) {
    const dmg = ev?.damage;
    if (!dmg || dmg <= 0) return;
    const byPlayer = !ev.source;               // `PartyAI` stamps a member id

    // Armiger charges against a pool scaled off Noctis' own attack, so it takes
    // roughly a dozen good hits regardless of what he is fighting. Only his own
    // damage counts — it is his arsenal.
    if (byPlayer) {
      const pool = Math.max(1, this.rpg.noctis.attack * 26);
      const now = this.game?.time?.now ?? 0;
      const warped = this.combat?.state === 'warp' || now <= this._warpUntil;
      const charge = (dmg / pool) * (1 + this.rpg.ascension.value('armigerCharge'));
      this.armiger = Math.min(1, this.armiger + charge + (warped ? 0.06 : 0));
    }
    // The tech bar is a fight meter: dealing damage fills it. A dozen or so
    // clean hits buys one segment.
    this._chargeTech(dmg / Math.max(1, this.rpg.noctis.attack * 12));
  }

  /**
   * Something died.
   *
   * `EncounterDirector.onDeath` is the real payout — EXP, gil, rolled drops,
   * quest kill objectives, hunt top-ups, boss phase-out. It marks the corpse
   * `_looted`. This only steps in when the live loop is not running at all
   * (a posed scenario, a bare harness world), so a kill is never paid twice
   * and never paid zero.
   */
  _onDeath(ev: any) {
    const e = ev?.enemy;
    if (!e || e._looted) return;
    const dir = this.game?.get?.('Encounters');
    if (dir && dir.enabled && !dir.enemies?.frozen) return;
    e._looted = true;
    const now = this.game?.time?.now ?? 0;
    this.rpg.enemyKilled({
      id: e.speciesId || String(e.name || 'enemy').toLowerCase().replace(/\s+/g, '_'),
      name: e.name,
      level: e.level,
      expClass: e.expClass,
      drops: e.type?.drops || [],
    }, { byWarpStrike: now <= this._warpUntil });
  }

  /**
   * Noctis took a hit.
   *
   * The HP has *already* come off — either `EncounterDirector.damageThreat`
   * applied it to the model or `CombatSystem._enemyStrike` did. Applying it
   * again here (which is what this used to do) meant every enemy blow landed
   * twice. All that is owed is the screen flash and the tech-bar charge.
   */
  _onPlayerHit(ev: any) {
    const dmg = Math.max(0, Math.round(ev?.damage || 0));
    if (!dmg) return;
    const n = this.rpg.noctis;
    this._chargeTech(dmg / Math.max(1, n.maxHp * 0.5));
    const hud = this.game?.get?.('HUD');
    if (hud?.hit) hud.hit(Math.min(1, dmg / Math.max(1, n.maxHp * 0.22)));
  }

  /** Add to the shared tech bar, clamped to its segment count. */
  _chargeTech(bars: any) {
    if (!(bars > 0)) return;
    const p = this.rpg.party;
    p.techCharge = Math.min(p.maxTechBars, p.techCharge + Math.min(0.5, bars));
  }

  /** A technique fired: banner it and drop a beat of slow motion under it. */
  _techBeat(d: any) {
    const hud = this.game?.get?.('HUD');
    if (hud?.callOut) hud.callOut(d.name || 'Technique', `${d.member || ''}`.toUpperCase());
    if (this.combat) this.combat.slowmo = Math.max(this.combat.slowmo, 0.22);
  }

  /* -- public resolver --------------------------------------------------- */

  /**
   * Resolve a hypothetical hit on a scene-graph enemy through the real damage
   * formula. Public so the capture stand-in in `CombatHUD` can print genuine
   * numbers over posed enemies without swinging at them.
   *
   * The enemy *is* the `computeDamage` target: `EnemyBase` carries `level`,
   * `defense`, `magicDefense`, `resistance()`, `weakTo` and `resistsWeapon`
   * already, so there is no per-species table to drift out of date.
   *
   * @param enemy an `Enemy` from `src/characters/enemies/**`
   * @param [o] `{ motion, element, weaponClass, isWarpStrike,
   *                        isBackAttack, staggerMult, seed }`
   * @returns the `computeDamage` result
   */
  roll(enemy: any, o: any = {}): any {
    // Seeded from sim state so identical frames give identical numbers, no
    // matter what order the shots were captured in.
    this._rng.s = (Math.imul((enemy.id ?? 0) + 1, 0x9e3779b1)
      ^ Math.imul(Math.round(enemy.hp || 0) + 7, 0x85ebca6b)
      ^ Math.imul(Math.round(o.seed || 0) + 13, 0xc2b2ae35)) >>> 0;
    const res = this.rpg.damage({
      attacker: this.rpg.noctis,
      target: enemy,
      motion: o.motion ?? 1.05,
      kind: o.element ? 'magical' : 'physical',
      element: o.element || 'physical',
      weaponClass: o.element ? null : (o.weaponClass || 'sword'),
      staggerMult: o.staggerMult ?? (enemy.staggerMult ?? 1),
      isBackAttack: !!o.isBackAttack,
      isWarpStrike: !!o.isWarpStrike,
      targetIsDaemon: enemy.faction === 'daemon',
      rng: this._rng,
    });
    this.lastRoll = res;
    return res;
  }
}

export default CombatBridge;
