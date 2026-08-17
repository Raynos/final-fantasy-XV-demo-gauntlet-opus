/**
 * The wire between `CombatSystem` and the RPG model.
 *
 * `CombatSystem` already emits everything that matters — `damage`, `hit`,
 * `warp`, `parry`, `link`, `stagger`, `death`, `playerHit`, `spell`, `mp` — and
 * before this file existed nothing listened. This bridge subscribes once and:
 *
 *  - re-resolves every hit through `Stats.computeDamage()` with Noctis' real
 *    Strength, his equipped weapon's attack, the level differential, night
 *    scaling, the target's defence and the Ascension multipliers, so the number
 *    the HUD prints is the model's number and not a combat-feel literal;
 *  - reconciles the enemy's HP to that number, so the nameplate agrees with the
 *    damage that floated off it;
 *  - banks EXP, awards AP and rolls drops on a kill;
 *  - awards AP for warp-strikes, parries, staggers and link-strikes;
 *  - routes damage the player takes through `Stats.applyDamage()`;
 *  - pushes `combat.inCombat` into `rpg.inCombat` so the tech bar only charges
 *    in a fight (the flag was computed every frame and thrown away).
 *
 * It deliberately lives here rather than in `CombatSystem`, so the encounters
 * agent and this one never edit the same lines.
 */

import { Rng } from '../../util/Rng.js';

/** CombatSystem weapon kinds -> the RPG's `WEAPON_CLASSES` names. */
const WEAPON_CLASS = {
  sword: 'sword', greatsword: 'greatsword', polearm: 'polearm',
  daggers: 'dagger', dagger: 'dagger', firearm: 'firearm', shield: 'shield',
};

/**
 * Per-species RPG facts the scene-graph enemies do not carry: how much EXP the
 * kill is worth, what it drops, and which weapon classes it hates. Keyed on the
 * species display name so it survives whatever the encounters agent does to the
 * spawn tables.
 */
const SPECIES = {
  'Sabertusk': {
    expClass: 'normal', defenseScale: 1.0,
    weakTo: ['dagger', 'polearm'],
    drops: [{ id: 'sabertusk_fang', chance: 0.55 }, { id: 'venom_fang', chance: 0.22 }, { id: 'anak_meat', chance: 0.18 }],
  },
  'Goblin': {
    expClass: 'trash', defenseScale: 0.8, isDaemon: true,
    weakTo: ['greatsword'],
    drops: [{ id: 'rotten_splinterbone', chance: 0.4 }, { id: 'debased_coin', chance: 0.3 }],
  },
  'Magitek Trooper': {
    expClass: 'normal', defenseScale: 1.25,
    weakTo: ['greatsword', 'firearm'],
    drops: [{ id: 'chrome_bit', chance: 0.5 }, { id: 'magitek_booster', chance: 0.2 }, { id: 'imperial_relay', chance: 0.06 }],
  },
  'Iron Giant': {
    expClass: 'boss', defenseScale: 1.6, isDaemon: true,
    weakTo: ['greatsword'],
    drops: [{ id: 'rotten_splinterbone', chance: 1 }, { id: 'mythril_shaft', chance: 0.5 }, { id: 'adamantite', chance: 0.1 }],
  },
};

const DEFAULT_SPECIES = { expClass: 'normal', defenseScale: 1, weakTo: [], drops: [] };

export class CombatBridge {
  /** @param {import('./RpgSystem.js').RpgSystem} rpg */
  constructor(rpg) {
    this.rpg = rpg;
    this.combat = null;
    this.game = null;
    this._off = [];
    /** Seeded per hit so the roll depends only on sim state, never call order. */
    this._rng = new Rng(0xa53f11);
    this._warpUntil = -1;
    /** Last resolved damage roll, for anything that wants to inspect it. */
    this.lastRoll = null;
    /**
     * The Armiger gauge, 0..1. FFXV fills it from damage dealt and warp-strikes
     * and empties it over the burst; nothing else in the project modelled it,
     * so the HUD was drawing a clock-driven ramp. Now it is earned.
     */
    this.armiger = 0;
  }

  /**
   * Subscribe to the combat system. Safe to call when there isn't one.
   * @param {object} game
   */
  attach(game) {
    this.game = game;
    const combat = game?.get?.('Combat');
    if (!combat || typeof combat.on !== 'function') return false;
    this.combat = combat;
    const on = (n, fn) => this._off.push(combat.on(n, fn));

    on('damage', (ev) => this._onDamage(ev));
    on('death', (ev) => this._onDeath(ev));
    on('warp', (ev) => this._onWarp(ev));
    on('parry', () => this.rpg.parry());
    on('stagger', () => this.rpg.stagger());
    on('link', () => this.rpg.linkStrike(2));
    on('playerHit', (ev) => this._onPlayerHit(ev));
    return true;
  }

  /** Drop every subscription. */
  detach() { for (const off of this._off) off(); this._off.length = 0; }

  /** Called from `RpgSystem.update`. */
  update(dt, game) {
    const combat = this.combat || game?.get?.('Combat');
    if (!combat) return;
    // the tech bar only charges in a fight — this flag was computed every frame
    // in CombatSystem.update and thrown away
    this.rpg.inCombat = !!combat.inCombat;
    // an active Armiger burst spends the gauge
    if (combat.armigerTimer > 0) this.armiger = Math.max(0, this.armiger - dt / 8);
  }

  /* -- events ------------------------------------------------------------ */

  _onWarp(ev) {
    if (ev?.phase !== 'impact') return;
    // A window rather than a flag: CombatSystem emits `damage` before the warp
    // impact, the Director's frozen scenarios emit it after.
    this._warpUntil = (this.game?.time?.now ?? 0) + 0.35;
    this.rpg.warpStrike();
  }

  /**
   * Resolve a hit on a scene-graph enemy through the real damage formula.
   *
   * Noctis' Strength and equipped weapon attack, the level differential, the
   * target's derived defence, its elemental and weapon-class weaknesses, night
   * scaling and every Ascension multiplier all land here. Public so the capture
   * stand-in in `CombatHUD` can print genuine numbers over posed enemies.
   *
   * @param {object} enemy an `Enemy` from `src/characters/enemies/**`
   * @param {object} [o] `{ motion, element, weaponClass, isWarpStrike,
   *                        isBackAttack, staggerMult, seed }`
   * @returns {object} the `computeDamage` result
   */
  roll(enemy, o = {}) {
    const spec = SPECIES[enemy.name] || DEFAULT_SPECIES;
    // Seeded from sim state so identical frames give identical numbers, no
    // matter what order the shots were captured in.
    this._rng.s = (Math.imul((enemy.id ?? 0) + 1, 0x9e3779b1)
      ^ Math.imul(Math.round(enemy.hp || 0) + 7, 0x85ebca6b)
      ^ Math.imul(Math.round(o.seed || 0) + 13, 0xc2b2ae35)) >>> 0;
    const res = this.rpg.damage({
      attacker: 'noctis',
      target: this._target(enemy, spec),
      motion: o.motion ?? 1.05,
      kind: o.element ? 'magical' : 'physical',
      element: o.element || 'physical',
      weaponClass: o.element ? null : (o.weaponClass || 'sword'),
      staggerMult: o.staggerMult ?? 1,
      isBackAttack: !!o.isBackAttack,
      isWarpStrike: !!o.isWarpStrike,
      targetIsDaemon: !!spec.isDaemon,
      rng: this._rng,
    });
    // Armiger charges with damage dealt against a pool scaled off Noctis' own
    // attack, so it takes roughly a dozen good hits regardless of what he is
    // fighting. Warping adds a bonus, as it does in FFXV.
    const pool = Math.max(1, this.rpg.noctis.attack * 26);
    const charge = (res.damage / pool) * (1 + this.rpg.ascension.value('armigerCharge'));
    this.armiger = Math.min(1, this.armiger + charge + (o.isWarpStrike ? 0.06 : 0));
    return res;
  }

  /**
   * Re-resolve one live hit and hand the result back to whoever draws numbers.
   */
  _onDamage(ev) {
    const enemy = ev?.enemy;
    if (!enemy) return;
    const combat = this.combat;
    const now = this.game?.time?.now ?? 0;
    const isWarp = combat?.state === 'warp' || now <= this._warpUntil;

    let motion = 1.05 * (combat?.comboStep?.dmg || 1);
    if (isWarp) motion = 2.8;
    else if (ev.element) motion = 2.2;                    // an elemancy burst

    const res = this.roll(enemy, {
      motion,
      element: ev.element || null,
      weaponClass: WEAPON_CLASS[combat?.weapon?.kind] || 'sword',
      staggerMult: enemy.state === 'stagger' ? 1.9 : ev.staggered ? 1.4 : 1,
      isBackAttack: this._isBackAttack(enemy),
      isWarpStrike: isWarp,
      seed: ev.damage,
    });

    // Keep the health bar honest about the number we just printed. The kill is
    // still CombatSystem's to call, so we never push an enemy across zero.
    if (!ev.killed && !enemy.dead) {
      enemy.hp = Math.max(1, Math.min(enemy.maxHp, enemy.hp + ev.damage - res.damage));
    }

    ev.damage = res.damage;
    ev.crit = res.crit;
    ev.weakness = res.weakness;
    ev.elementKind = res.elementKind;
    ev.rolled = true;
    this.lastRoll = res;
    return res;
  }

  _onDeath(ev) {
    const enemy = ev?.enemy;
    if (!enemy) return;
    const spec = SPECIES[enemy.name] || DEFAULT_SPECIES;
    const now = this.game?.time?.now ?? 0;
    this.rpg.enemyKilled({
      id: String(enemy.name || 'enemy').toLowerCase().replace(/\s+/g, '_'),
      name: enemy.name,
      level: enemy.level,
      expClass: spec.expClass,
      drops: spec.drops,
    }, { byWarpStrike: now <= this._warpUntil });
  }

  _onPlayerHit(ev) {
    const dmg = Math.max(0, Math.round(ev?.damage || 0));
    if (!dmg) return;
    const n = this.rpg.noctis;
    // The model is authoritative; RpgSystem.update mirrors the result back onto
    // `Player.stats` on the same frame.
    n.applyDamage(dmg);
    const hud = this.game?.get?.('HUD');
    if (hud?.hit) hud.hit(Math.min(1, dmg / Math.max(1, n.maxHp * 0.22)));
  }

  /* -- helpers ----------------------------------------------------------- */

  /**
   * A `computeDamage` target built from a scene-graph enemy. Defence is derived
   * from the species' level and health pool — the enemy classes carry no stat
   * block of their own.
   */
  _target(enemy, spec) {
    const lv = enemy.level || 1;
    const def = Math.round((18 + lv * 2.4 + (enemy.maxHp || 400) / 240) * (spec.defenseScale || 1));
    const weakEl = enemy.type?.weakness || null;
    const resistEl = enemy.type?.resist || null;
    const resist = { physical: 100, fire: 100, ice: 100, lightning: 100, dark: 100, light: 100 };
    if (weakEl) resist[weakEl] = 160;
    if (resistEl) resist[resistEl] = 50;
    return {
      level: lv,
      defense: def,
      magicDefense: Math.round(def * 0.85),
      resist,
      weakTo: spec.weakTo || [],
      resistsWeapon: spec.resistsWeapon || [],
    };
  }

  /** True when Noctis is behind the enemy's facing. */
  _isBackAttack(enemy) {
    const p = this.combat?.player?.position;
    if (!p || !enemy.root) return false;
    const fx = Math.sin(enemy.heading), fz = Math.cos(enemy.heading);
    const dx = p.x - enemy.root.position.x, dz = p.z - enemy.root.position.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return false;
    return (fx * dx + fz * dz) / len < -0.35;
  }
}

export default CombatBridge;
