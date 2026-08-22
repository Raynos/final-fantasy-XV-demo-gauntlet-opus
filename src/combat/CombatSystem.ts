import * as THREE from 'three';
import { Rng } from '../util/Rng.ts';
import { WEAPONS, Weapon, Armiger } from './Weapons.ts';
import { Elemancy } from './Elemancy.ts';
import type { CombatEvents, CombatEventName } from './CombatEvents.ts';
import type { ArmigerLayout, ComboStep, WeaponClass } from './Weapons.ts';
import type { Game } from '../game/Game.ts';
import type { Enemy } from '../characters/enemies/EnemyBase.ts';
import type { Enemies } from '../characters/Enemies.ts';
import type { Player } from '../characters/Player.ts';
import type { Terrain } from '../world/Terrain.ts';
import type { RpgSystem } from '../game/rpg/RpgSystem.ts';
import type { Input } from '../engine/Input.ts';
import type { VFX } from './VFX.ts';
import type { TrailRibbon } from './Trails.ts';

/** The three castable elements. */
export type ElementKind = 'fire' | 'ice' | 'lightning';

/**
 * Every state the combat machine can be in.
 *
 * Six, not seven: the comment on `this.state` used to list a `hurt` state as
 * well, and nothing in the tree has ever assigned it — being hit is a hitstop
 * and a flinch on the *enemy* side, never a state of Noctis'.
 */
export type CombatState = 'idle' | 'attack' | 'dodge' | 'phase' | 'warp' | 'stasis';

/**
 * The phase one link of a combo is in. `none` is between swings.
 *
 * `CombatAnim.PHASE_KEY` maps each of these onto the `ComboStep` field that
 * holds its duration, and it can lose its `Record<string, ...>` fallback now
 * that the set is closed.
 */
export type ComboPhase = 'none' | 'wind' | 'active' | 'rec';

/** A subscriber to one combat event. */
export type CombatListener<K extends CombatEventName> = (detail: CombatEvents[K]) => void;

/**
 * A listener as the subscriber *table* holds it.
 *
 * Written in method syntax on purpose: method parameters are bivariant, and
 * that is what lets one `Set` hold the handlers for a single event without the
 * table having to be a map of correlated types. `emit` only ever calls these
 * with that event's own payload, so the bivariance is not load-bearing for
 * soundness — `on()` is the typed door everything comes through.
 */
type StoredListener = { call(detail: CombatEvents[CombatEventName]): void }['call'];

/**
 * `lockOn` is a verb *and* a view of the current target — see
 * `_installLockOnShim` for why, and for what has to happen before it can go.
 */
export interface LockOnShim {
  (enemy: Enemy | null): void;
  readonly target: Enemy | null;
  readonly position: THREE.Vector3 | undefined;
  /** Always `undefined`. Present because a reader may probe `pos` first. */
  readonly pos: undefined;
  readonly root: THREE.Group | undefined;
  readonly height: number;
  readonly name: string;
}

/**
 * Has `_installLockOnShim` finished hanging the view accessors on `fn`?
 *
 * `Object.defineProperties` answers the object it was given, which types away
 * everything it just installed. Asking the value is what a cast would have
 * hidden, and it is the only thing that would notice the shim breaking.
 */
function isLockOnShim(fn: (enemy: Enemy | null) => void): fn is LockOnShim {
  return 'target' in fn && 'position' in fn && 'root' in fn && 'height' in fn && 'name' in fn;
}

/** The in-flight warp-strike: the blink, and whether the blow has landed yet. */
export interface WarpState {
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** `VFX.clock` when the blink began. */
  t0: number;
  /** `VFX.clock` at which the blade arrives, as `VFX.warpStrike` reports it. */
  impactT: number;
  enemy: Enemy | null;
  struck: boolean;
  /** Length of the dash, seconds. */
  dash: number;
}

/** A deferred beat queued by `schedule` and drained in `update`. */
interface CombatBeat {
  /** Seconds of simulated time left before `fn` runs. */
  t: number;
  fn: (arg: number) => void;
  arg: number;
}

/**
 * How `computeDamage` arrived at its number. Every field is optional because
 * the no-RPG fallback roll in `resolve()` produces a damage figure without one.
 */
export interface DamageBreakdown {
  offence?: number;
  defence?: number;
  motion?: number;
  levelMod?: number;
  mitigation?: number;
  elementMult?: number;
  staggerMult?: number;
}

/** One resolved hit, as `resolve()` answers it and `lastRoll` remembers it. */
export interface DamageRoll {
  damage: number;
  crit: boolean;
  weakness: boolean;
  /** `'weak' | 'resist' | 'immune' | 'absorb' | 'neutral'` from `Stats`. */
  elementKind: string;
  element: string;
  breakdown?: DamageBreakdown;
}

/**
 * What a caller may say about a blow before `resolve()` rolls it.
 * Everything here is a *modifier*: the weapon, the level and the target are
 * read off the system and the enemy, never passed in.
 */
export interface HitOpts {
  /** Motion value: what this particular swing is worth. Defaults to 1. */
  motion?: number;
  /** Poise damage. Defaults to 10 in `_applyDamage`. */
  poise?: number;
  /** Set for a spell; a spell rolls as magical and claims no weapon class. */
  element?: ElementKind | null;
  /** Overrides the drawn weapon's class in the weakness lookup. */
  weaponClass?: string | null;
  /** Behind the target. `_applyDamage` works it out when it is not given. */
  blindside?: boolean;
  warp?: boolean;
  aerial?: boolean;
  technique?: boolean;
  /** Suppress the flinch animation on the target. */
  noFlinch?: boolean;
}

/** The knobs `cast()` takes when something other than the table decides them. */
export interface CastOpts {
  /** Scales the burst: radius, particle counts and light. Defaults to 1. */
  power?: number;
  motion?: number;
  radius?: number;
  poise?: number;
}

/** One derived side-effect of a crafted flask, as combat applies it. */
export interface SpellEffect {
  name: string;
  desc: string;
  payload: {
    /** Fraction of max HP restored to every party member. */
    healAllies?: number;
    /** Chance, 0..1, that a non-boss caught in the blast simply dies. */
    instantDeath?: number;
    /** Ailment written onto everything in the blast. */
    status?: string;
    /** How long that ailment lasts, seconds. Defaults to 10. */
    duration?: number;
  };
}

/**
 * A crafted flask, as `castSpell` reads it. `rpg/Elemancy.craftSpell` is what
 * builds one; this is the slice of it that turns into damage in the world.
 */
export interface CraftedSpell {
  element: ElementKind;
  /** 1..5. Scales the poise damage. */
  tier: number;
  damage: number;
  radius: number;
  mpCost: number;
  /** Dualcast / Tricast: how many times the flask detonates. */
  multicast: number;
  effects?: SpellEffect[];
}

/** What `castSpell` and `castSlot` answer. `reason` is set only when `!ok`. */
export interface CastResult {
  ok: boolean;
  reason?: string;
  spell?: CraftedSpell;
  damage?: number;
  /** Casts left on the flask. */
  remaining?: number;
  motion?: number;
}

/**
 * The armament sitting in one of Noctis' four weapon slots.
 *
 * `Inventory` owns the real item definition and is still untyped; this is the
 * part combat reads — the class it maps onto and the attack rating that
 * replaces the strongest-equipped one in `_attacker`.
 */
export interface WeaponItem {
  id?: string;
  name?: string;
  /** `Inventory`'s class name, mapped through `ITEM_CLASS_TO_KIND`. */
  class?: string;
  attack?: number;
}

/** One of Noctis' four weapon slots, resolved onto a class this system draws. */
export interface WeaponSlot {
  kind: string;
  item: WeaponItem | null;
}

/**
 * An enemy as combat sees it.
 *
 * `vulnerable` is written straight onto the boss by
 * `BossFight._tickBoss` and `EnemyBase` does not declare it, so it is optional
 * here rather than invented there. It belongs on `Enemy`.
 */
export interface CombatTarget extends Enemy {
  /** Set for the length of a boss' recovery window; worth x1.5 damage. */
  vulnerable?: boolean;
}

/**
 * Real-time action combat.
 *
 * Hold-to-attack auto-combos with per-weapon arcs and timing, dodge-roll,
 * hold-to-phase (MP-draining parry with a slow-motion counter window),
 * blindside bonuses, link-strikes, warp-strike / warp-to-point with a Stasis
 * recovery state, Armiger burst, and elemancy.
 *
 * Everything that other systems care about is surfaced as an event (see
 * `on()` / the mirrored `combat:*` window events) — damage numbers, hit
 * confirms, lock-on changes, warp start/impact, stagger, death and MP.
 */
export class CombatSystem {
  _sweepTmp!: THREE.Vector3;
  weaponSlot!: number;
  _armigerBeat!: number;
  /** Set by `Director` for a scenario shot; absent in normal play. */
  _armigerCentre?: THREE.Vector3;
  _armigerOpts?: ArmigerLayout;
  _axis!: THREE.Vector3;
  _base!: THREE.Vector3;
  _fwd!: THREE.Vector3;
  /** Scratch list every sphere/sweep query writes into. Never escapes. */
  _hits!: Enemy[];
  _listeners!: Map<CombatEventName, Set<StoredListener>>;
  _mirAxis!: THREE.Vector3;
  _prevTip!: THREE.Vector3;
  _q!: THREE.Quaternion;
  _qt!: THREE.Quaternion;
  _sched!: CombatBeat[];
  _shotFired!: boolean;
  _tip!: THREE.Vector3;
  _tmp!: THREE.Vector3;
  armiger!: Armiger;
  armigerTimer!: number;
  comboIndex!: number;
  comboPhase!: ComboPhase;
  comboQueued!: boolean;
  comboStep!: ComboStep | null;
  comboTimer!: number;
  counterWindow!: number;
  dodgeDir!: THREE.Vector3;
  /**
   * Raw elemental bursts. Null in a world booted without `VFX`, because every
   * spell it authors is written against the VFX effect clock — there is
   * nothing for it to draw on and nothing for `pin` to freeze.
   */
  elemancy!: Elemancy | null;
  enemies!: Enemies | null;
  game!: Game;
  hand!: THREE.Group;
  heavySwing!: boolean;
  hitThisSwing!: Set<Enemy>;
  hitstop!: number;
  inCombat!: boolean;
  lastRoll!: DamageRoll | null;
  linkCooldown!: number;
  lockOn!: LockOnShim;
  lockTarget!: Enemy | null;
  mpRegenDelay!: number;
  perch!: number;
  phaseCharge!: number;
  player!: Player | null;
  rng!: Rng;
  rpg!: RpgSystem | null;
  /** `Director` freezes the sim for an authored shot. Absent until it does. */
  scenarioLock?: boolean;
  slowmo!: number;
  stasis!: boolean;
  state!: CombatState;
  stateTime!: number;
  terrain!: Terrain | null;
  trail!: TrailRibbon | null;
  vfx!: VFX | null;
  warp!: WarpState | null;
  /**
   * The drawn weapon. `init` puts the Engine Blade in his hand before anything
   * can read this, and `setWeapon` never clears it, so it is never null after
   * boot — the one caller that runs before then is `setWeapon` itself, which
   * checks.
   */
  weapon!: Weapon;
  weaponCache!: Map<string, Weapon>;
  weaponItem!: WeaponItem | null;
  async init(game: Game) {
    this.game = game;
    this.rng = new Rng(51221);
    this.inCombat = false;

    this.vfx = game.get('VFX') ?? null;
    this.enemies = game.get('Enemies') ?? null;
    this.player = game.get('Player') ?? null;
    this.terrain = game.get('Terrain') ?? null;
    this.elemancy = this.vfx ? new Elemancy(this.vfx, game) : null;

    /* ---- weapon rig: an anchor the player's "hand" drives ------------ */
    this.hand = new THREE.Group();
    this.hand.position.set(HAND_X, 1.12, 0.12);
    if (this.player && this.player.root) this.player.root.add(this.hand);
    else game.scene.add(this.hand);

    this._prevTip = new THREE.Vector3();
    this._tip = new THREE.Vector3();
    this._base = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._axis = new THREE.Vector3(0, 1, 0);
    /** `_axis` mirrored into Noctis' sword hand; see `HAND_X`. */
    this._mirAxis = new THREE.Vector3(0, 1, 0);
    this._q = new THREE.Quaternion();
    this._qt = new THREE.Quaternion();
    this._hits = [];
    this._sweepTmp = new THREE.Vector3();

    this.weaponCache = new Map();
    this._prebuildWeapons(game);
    this.setWeapon('sword', { materialise: false });

    this.armiger = new Armiger({ count: 6 });
    // parented under the VFX root so it is excluded from the AO G-buffer
    (this.vfx ? this.vfx.root : game.scene).add(this.armiger.group);

    /* ---- state ------------------------------------------------------- */
    this.state = 'idle';
    this.stateTime = 0;
    this.comboIndex = -1;
    this.comboStep = null;
    this.comboPhase = 'none';   // wind | active | rec
    this.comboTimer = 0;
    this.comboQueued = false;
    this.hitThisSwing = new Set();
    this.trail = null;
    this.lockTarget = null;
    this.hitstop = 0;
    this.slowmo = 0;
    this.phaseCharge = 0;
    this.counterWindow = 0;
    this.stasis = false;
    this.mpRegenDelay = 0;
    this.armigerTimer = 0;
    this.linkCooldown = 0;
    this.warp = null;
    this._listeners = new Map();

    /** Resolved lazily — `Rpg` is constructed after `Combat`. */
    this.rpg = null;
    /** Seconds of accelerated MP recovery bought by a point-warp perch. */
    this.perch = 0;
    /** The last `computeDamage` result, so anything can inspect the maths. */
    this.lastRoll = null;
    /** Which equipment slot the drawn weapon came from, and its item def. */
    this.weaponSlot = 0;
    this.weaponItem = null;
    this._armigerBeat = 0;
    /** Deferred beats (multicast detonations), drained in `update`. */
    this._sched = [];
    this.heavySwing = false;

    this._installLockOnShim();

    if (this.enemies) this.enemies.onEnemyStrike = (e: Enemy) => this._enemyStrike(e);
  }

  /**
   * `CombatHUD._updateReticle` reads `game.get('Combat').lockOn` as if it were
   * the *target*, while every other caller (`Director`, `Downed`, this class)
   * uses `lockOn(enemy)` as a verb. One name, two contracts, and the UI is
   * owned by another agent this week.
   *
   * So `lockOn` is installed as a callable that is also a thin view of the
   * current target: calling it sets the lock, reading `.position` / `.height`
   * off it describes whatever is locked, and both sides get what they expect.
   * Delete this the moment the HUD reads `lockTarget` instead.
   */
  _installLockOnShim() {
    const self = this;
    const fn = (enemy: Enemy | null) => self.setLockOn(enemy);
    Object.defineProperties(fn, {
      target: { get: () => self.lockTarget },
      position: { get: () => (self.lockTarget ? self.lockTarget.root.position : undefined) },
      pos: { get: () => undefined },
      root: { get: () => (self.lockTarget ? self.lockTarget.root : undefined) },
      height: { get: () => (self.lockTarget ? self.lockTarget.height * self.lockTarget.scale : 1.7) },
      name: { get: () => (self.lockTarget ? self.lockTarget.name : '') },
    });
    // `defineProperties` answers the plain function it was handed, so the
    // accessors it just installed are invisible to the type. Ask the value
    // itself rather than asserting: the throw is unreachable, and it is the
    // one thing that would tell us if this shim ever stopped installing.
    if (!isLockOnShim(fn)) throw new Error('CombatSystem: lock-on shim failed to install');
    this.lockOn = fn;
  }

  /** The RPG model, or null in a world booted without it. */
  get model() {
    if (!this.rpg) this.rpg = (this.game && this.game.get('Rpg')) || null;
    return this.rpg;
  }

  /* --------------------------------------------------------- events */

  /**
   * Subscribe to a combat event.
   * Events: `damage` {enemy,damage,position,crit,element,killed}
   *         `hit` {position,normal,weapon}
   *         `lockon` {enemy|null}
   *         `warp` {phase:'start'|'impact', from, to, enemy}
   *         `stagger` {enemy}  `death` {enemy}
   *         `mp` {mp,maxMp,stasis}  `combo` {index,weapon}
   *         `parry` {enemy,position}  `link` {enemy,ally}
   */
  on<K extends CombatEventName>(name: K, fn: CombatListener<K>): () => void {
    let set = this._listeners.get(name);
    // the line above is the only place this map is filled, so the set exists
    if (!set) { set = new Set(); this._listeners.set(name, set); }
    set.add(fn);
    return () => this.off(name, fn);
  }

  off<K extends CombatEventName>(name: K, fn: CombatListener<K>) { this._listeners.get(name)?.delete(fn); }

  /** Emit locally and mirror onto `window` as `combat:<name>` for HUD/audio. */
  emit<K extends CombatEventName>(name: K, detail: CombatEvents[K]) {
    const set = this._listeners.get(name);
    if (set) for (const fn of set) fn(detail);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`combat:${name}`, { detail }));
    }
  }

  /* -------------------------------------------------------- weapons */

  /**
   * Build every weapon class up front and leave all of them parented to the
   * hand, dematerialised.
   *
   * Building one lazily on first swap looked harmless — the geometry is a
   * couple of thousand triangles and takes 0.2 ms to generate — but the mesh
   * then reaches its first render with an uncompiled program, and the driver
   * compiles it synchronously in the middle of the frame. Worse, the material
   * is only picked up by the sky's atmosphere patch on its next scan, so it
   * compiles *twice*: once bare, once patched. Two half-second stalls the
   * instant the player pressed a number key.
   *
   * Constructing them here means they are in the scene graph before Game's
   * boot-time `renderer.compile()`, and patching them here means the program
   * that compile warms is the final, atmosphere-patched one. All five then
   * share a single program (the material's `customProgramCacheKey` is
   * constant), so a swap costs one visibility flip.
   *
   */
  _prebuildWeapons(game: Game) {
    const sky = game.get('Sky');
    const patch = sky && sky.patch;
    for (const kind of Object.keys(WEAPONS)) {
      const w = new Weapon(kind);
      w.setReveal(0);
      this.hand.add(w.root);
      if (patch) patch.patch(w.material);
      this.weaponCache.set(kind, w);
    }
  }

  /**
   * The `WEAPON_CLASSES` name of the drawn weapon, for weakness lookups.
   */
  get weaponClass(): string {
    const k = this.weapon ? this.weapon.kind : 'sword';
    return k === 'daggers' ? 'dagger' : k;
  }

  /**
   * The drawn weapon's base motion value. This is where a class's *feel*
   * enters the damage formula now that the raw `damage` literal no longer
   * does: a greatsword swing is worth nearly four dagger swings, and takes
   * about that long to come out.
   */
  get weaponMotion() { return (this.weapon && this.weapon.def.motion) || 1; }

  /**
   * Noctis' four equipped weapon slots, mapped onto the classes this system
   * can actually draw. A slot with no armament in it stays null.
   */
  weaponSlots(): Array<WeaponSlot | null> {
    const rpg = this.model;
    if (!rpg || !rpg.inventory) {
      return ['sword', 'greatsword', 'polearm', 'daggers'].map((kind) => ({ kind, item: null }));
    }
    return rpg.inventory.equipped('noctis').weapon.map((def: WeaponItem | null) => {
      if (!def) return null;
      const kind = ITEM_CLASS_TO_KIND[def.class as keyof typeof ITEM_CLASS_TO_KIND] || 'sword';
      return { kind, item: def };
    });
  }

  /**
   * Draw the weapon sitting in one of Noctis' four equipment slots.
   * @param slot 0..3
   */
  drawSlot(slot: number) {
    const slots = this.weaponSlots();
    const s = slots[slot];
    if (!s) return false;
    this.weaponSlot = slot;
    this.weaponItem = s.item;
    this.setWeapon(s.kind as WeaponClass);
    this.emit('weapon', { slot, kind: s.kind, item: s.item });
    return true;
  }

  setWeapon(kind: WeaponClass, { materialise = true }: { materialise?: boolean } = {}) {
    if (this.weapon && this.weapon.kind === kind) return this.weapon;
    let w = this.weaponCache.get(kind);
    if (!w) {
      // A kind outside WEAPONS (Armiger fillers, modded gear): still cached,
      // but it pays a one-frame compile the first time it is drawn.
      w = new Weapon(kind);
      this.hand.add(w.root);
      const sky = this.game.get('Sky');
      const patch = sky && sky.patch;
      if (patch) patch.patch(w.material);
      this.weaponCache.set(kind, w);
    }
    if (this.weapon) this.weapon.setReveal(0);
    this.weapon = w;
    if (materialise) this.materialise();
    else w.setReveal(1);
    this.comboIndex = -1;
    return w;
  }

  /** Blue-crystal draw: the blade assembles out of light from hilt to tip. */
  materialise(t0 = this.vfx ? this.vfx.clock : 0) {
    const w = this.weapon;
    if (!w) return;
    w.setReveal(0);
    if (!this.vfx) { w.setReveal(1); return; }
    this.vfx.track(t0, 0.34, (n: number) => {
      // A second swap during the draw must not resurrect the blade we put away
      if (this.weapon !== w) return;
      w.setReveal(n < 0 ? 0 : n > 1 ? 1 : n);
    });
    this.hand.updateWorldMatrix(true, false);
    const p = this._tmp.setFromMatrixPosition(this.hand.matrixWorld);
    this.vfx.crystalBurst({ pos: p, count: 16, speed: 3.2, t0, life: 0.5, size: 0.16, gravity: -3 });
    this.vfx.moteBurst({ pos: p, count: 22, speed: 2.2, color: 0x5fc0ff, life: 0.7, t0, size: 0.18, intensity: 4 });
    this.vfx.flash({ pos: p, color: 0x59b8ff, intensity: 18, distance: 6, life: 0.3, t0 });
    this.emit('materialise', { position: p });
  }

  /* ------------------------------------------------------ targeting */

  /** Set (or clear) the lock-on target and emit `lockon`. */
  setLockOn(enemy: Enemy | null) {
    if (this.lockTarget === enemy) return;
    this.lockTarget = enemy || null;
    if (this.enemies) for (const e of this.enemies.list) e.locked = (e === this.lockTarget);
    this.emit('lockon', { enemy: this.lockTarget });
    // `HUD` always declares `setLockOn`; the old `&& hud.setLockOn` guard was
    // a name nothing verified.
    const hud = this.game.get('HUD');
    if (hud) hud.setLockOn(this.lockTarget);
  }

  /** Nearest valid enemy in front of the camera. */
  autoTarget(maxDist = 30): Enemy | null {
    if (!this.enemies || !this.player) return null;
    this.game.camera.getWorldDirection(this._fwd);
    this._fwd.y = 0; this._fwd.normalize();
    return this.enemies.pickTarget(this.player.position, this._fwd, maxDist, -0.2);
  }

  /* -------------------------------------------------------- combat */

  /**
   * Run `fn` in `delay` seconds of simulated time. Multicast beats and any
   * other choreography keep time here rather than owning a clock each.
   *
   * `arg` is the beat index the one caller (`castSpell`'s multicast) needs; it
   * is passed straight back to `fn` when the beat comes due.
   */
  schedule(delay: number, fn: (arg: number) => void, arg: number) { this._sched.push({ t: delay, fn, arg }); }

  _drain(dt: number) {
    const s = this._sched;
    for (let i = s.length - 1; i >= 0; i--) {
      s[i].t -= dt;
      if (s[i].t > 0) continue;
      const { fn, arg } = s[i];
      s.splice(i, 1);
      try { fn(arg); } catch (err) { console.warn('combat beat failed', err); }
    }
  }

  /** Begin (or continue) the auto-combo. */
  attack() {
    if (this.state === 'warp' || this.state === 'dodge') return;
    if (this.state === 'attack') { this.comboQueued = true; return; }
    this._startSwing(0);
  }

  /**
   * The heavy: open straight on the weapon's finisher. Slower to come out,
   * far more poise damage, and it is what actually breaks a big enemy.
   */
  heavy() {
    if (this.state === 'warp' || this.state === 'dodge' || this.state === 'attack') return false;
    const def = this.weapon.def;
    this._startSwing(def.combo.length - 1);
    this.heavySwing = true;
    this.emit('heavy', { weapon: this.weapon.kind });
    return true;
  }

  _startSwing(index: number) {
    const def = this.weapon.def;
    const step = def.combo[index % def.combo.length];
    this.heavySwing = false;
    this.state = 'attack';
    this.stateTime = 0;
    this.comboIndex = index;
    this.comboStep = step;
    this.comboPhase = 'wind';
    this.comboTimer = 0;
    this.comboQueued = false;
    this.hitThisSwing.clear();
    this._axis.fromArray(step.axis).normalize();

    if (this.vfx && !def.ranged) {
      this.trail = this.vfx.trails.acquire();
      const t = def.trail;
      this.trail.setColors(t.head, t.tail, 0xffffff);
      this.trail.life = t.life;
      this.trail.uniforms.uLife.value = t.life;
    }
    this.emit('combo', { index, weapon: this.weapon.kind, step });
  }

  /** Evasive roll in the current movement direction. */
  dodge() {
    if (this.state === 'warp' || this.state === 'dodge') return;
    this.state = 'dodge';
    this.stateTime = 0;
    this._endSwing();
    this.emit('dodge', {});
    const p = this.player;
    if (p) {
      const in2 = this.game.input.move;
      this._tmp.set(in2.x, 0, in2.y);
      if (this._tmp.lengthSq() < 0.01) this._tmp.set(-Math.sin(p.heading), 0, -Math.cos(p.heading));
      this._tmp.normalize();
      this.dodgeDir = this._tmp.clone();
      if (this.vfx) {
        const gp = p.position.clone();
        this.vfx.dustPuff({ pos: gp, count: 16, radius: 0.35, speed: 3.0, life: 0.9, size: 0.45, grow: 3 });
      }
    }
  }

  /* ------------------------------------------------------------- the MP */

  /**
   * Noctis' MP right now. The RPG `Stats` block is authoritative when it
   * exists; `Player.stats` is only its mirror.
   */
  get mp() {
    const r = this.model;
    if (r) return r.noctis.mp;
    return this.player && this.player.stats ? this.player.stats.mp : 0;
  }

  get maxMp() {
    const r = this.model;
    if (r) return r.noctis.maxMp;
    return this.player && this.player.stats ? this.player.stats.maxMp : 1;
  }

  /**
   * Write MP through to whichever model owns it.
   *
   * `RpgSystem.update` folds any *decrease* it sees on `Player.stats` back into
   * the model and then overwrites the mirror from the model — so an increase
   * written only to `Player.stats` is erased on the same frame, which is why MP
   * never used to come back. Write both ends.
   *
   */
  setMp(v: number) {
    const max = this.maxMp;
    const mp = Math.max(0, Math.min(max, v));
    const r = this.model;
    if (r) r.noctis.mp = mp;
    if (this.player && this.player.stats) {
      this.player.stats.mp = Math.round(mp);
      this.player.stats.maxMp = max;
    }
    return mp;
  }

  /**
   * Try to pay an MP cost. Drops into Stasis (and pays nothing) if the pool is
   * too shallow — the FFXV rule that makes warping a budget rather than a toy.
   */
  spendMp(cost: number) {
    if (this.stasis) return false;
    if (this.mp < cost) { this._enterStasis(); return false; }
    this.setMp(this.mp - cost);
    this.emit('mp', { mp: this.mp, maxMp: this.maxMp, stasis: false });
    return true;
  }

  /**
   * The signature move. Blink to a target, land the hit, spend MP.
   * @param [enemy] defaults to the lock-on / auto target
   */
  warpStrike(enemy: Enemy | null = this.lockTarget || this.autoTarget()) {
    const p = this.player;
    const vfx = this.vfx;
    if (!p || !vfx || this.stasis || this.state === 'warp') return false;
    if (!this.spendMp(WARP_STRIKE_MP)) return false;
    const target = enemy;
    const from = p.position.clone(); from.y += 1.1;
    const to = target
      ? target.centre().add(this._tmp.set(0, 0, 0))
      : from.clone().addScaledVector(this._fwd.set(Math.sin(p.heading), 0.25, Math.cos(p.heading)), 9);
    // stop just short so the player lands *at* the enemy, not inside it
    if (target) {
      const back = new THREE.Vector3().subVectors(from, to).setY(0).normalize();
      to.addScaledVector(back, target.radius * target.scale + 0.7);
    }

    const t0 = vfx.clock;
    const impactT = vfx.warpStrike({ from, to, t0, dash: 0.16, terrain: this.terrain });
    this.emit('warp', { phase: 'start', from, to, enemy: target });

    this.state = 'warp';
    this.stateTime = 0;
    this.warp = { from, to, t0, impactT, enemy: target, struck: false, dash: 0.16 };
    if (this.weapon) this.weapon.setReveal(0.0);
    return true;
  }

  /**
   * Repositioning warp to a point (no strike).
   *
   * Perching is how you get MP back in FFXV: land on a vantage point and the
   * pool refills fast for a few seconds. `perch` is that window.
   */
  warpTo(point: THREE.Vector3) {
    const p = this.player;
    const vfx = this.vfx;
    if (!p || !vfx || this.stasis) return false;
    if (!this.spendMp(WARP_POINT_MP)) return false;
    const from = p.position.clone(); from.y += 1.1;
    vfx.warpTo({ from, to: point, t0: vfx.clock, terrain: this.terrain });
    p.root.position.copy(point);
    this.perch = PERCH_SECONDS;
    this.mpRegenDelay = 0;
    this.emit('warp', { phase: 'point', from, to: point, perch: this.perch });
    return true;
  }

  _enterStasis() {
    if (this.stasis) return;
    this.stasis = true;
    this.state = 'stasis';
    this.stateTime = 0;
    this.mpRegenDelay = 1.2;
    this.setMp(0);
    this.armigerTimer = 0;
    this.emit('mp', { mp: 0, maxMp: this.maxMp, stasis: true });
    if (this.vfx && this.player) {
      const p = this.player.position.clone(); p.y += 1.1;
      this.vfx.moteBurst({ pos: p, count: 16, speed: 1.4, color: 0x4a6a8a, life: 1.2, size: 0.16, intensity: 1.6 });
    }
  }

  /** The Armiger gauge, 0..1 — earned from damage dealt (see `CombatBridge`). */
  get armigerGauge() {
    const r = this.model;
    return r && r.combatBridge ? r.combatBridge.armiger : 0;
  }

  /** True when the gauge is full and there is MP to burn. */
  get armigerReady() {
    return this.armigerTimer <= 0 && this.armigerGauge >= 0.999 && this.mp >= ARMIGER_MP * 2;
  }

  /**
   * Player-facing Armiger trigger: it costs a full gauge, and then it costs MP
   * for as long as it is up.
   */
  tryArmiger() {
    if (this.armigerTimer > 0) return false;
    if (!this.armigerReady) {
      this.emit('armigerDenied', { gauge: this.armigerGauge, mp: this.mp });
      return false;
    }
    this.armigerBurst();
    return true;
  }

  /** Fire the Armiger burst: phantom arms orbit, then rain in. */
  armigerBurst(duration = 8) {
    this.armigerTimer = duration;
    this._armigerBeat = 0;
    if (this.vfx && this.player) {
      const p = this.player.position.clone(); p.y += 1.0;
      this.vfx.crystalBurst({ pos: p, count: 34, speed: 7, life: 0.9, size: 0.30 });
      this.vfx.flash({ pos: p, color: 0x59b8ff, intensity: 70, distance: 16, life: 0.6, priority: 6 });
      if (this.terrain) this.vfx.ground.ring({ pos: this.player.position, terrain: this.terrain, radius: 4, color: 0x8ed4ff, life: 0.9 });
    }
    this.emit('armiger', { duration });
    return true;
  }

  /**
   * One phantom arm comes down on something while the Armiger is up. Called on
   * a fixed beat from `update`.
   */
  _tickArmigerStrikes(dt: number, p: Player) {
    this._armigerBeat -= dt;
    if (this._armigerBeat > 0) return;
    this._armigerBeat = 0.28;
    const target: Enemy | null = this.lockTarget && !this.lockTarget.dead
      ? this.lockTarget
      : (this.enemies ? this.enemies.nearest(p.position, 14) : null);
    if (!target) return;
    const c = target.centre();
    const from = c.clone();
    from.x += this.rng.range(-3, 3);
    from.z += this.rng.range(-3, 3);
    from.y += 6;
    if (this.vfx) {
      this.vfx.warpStrike({ from, to: c, t0: this.vfx.clock, dash: 0.10, terrain: this.terrain, color: 0x8ed4ff, scale: 0.7 });
    }
    this._applyDamage(target, from, { motion: ARMIGER_MOTION, poise: 26, blindside: false });
    // `AudioSystem` has always listened for `armigerHit` and nothing has ever
    // sent it, so `Sfx.armigerHit` has only been heard in the offline render.
    // The event is a real part of `CombatEvents` now and this is where the
    // emitter goes -- but it is deliberately not emitting yet. On the strike's
    // own 0.28 s beat that is ~28 plays across an eight-second Armiger, and
    // nobody has listened to what that sounds like. Uncomment, listen, keep or
    // thin the beat. Same hold as `DungeonAmbience.ENABLED` and the Regalia
    // radio's routing.
    // this.emit('armigerHit', { position: c });
  }

  /* ------------------------------------------------------------ elemancy */

  /**
   * Cast a raw element at a world point (or at the lock target). This is the
   * uncrafted fallback — see `castSpell` for a real flask.
   * @param [o] `{power, motion, radius, poise}`
   */
  cast(element: ElementKind, at?: THREE.Vector3, o: CastOpts = {}) {
    const p = this.player;
    const vfx = this.vfx;
    const elemancy = this.elemancy;
    if (!p || !vfx || !elemancy) return null;
    const pos = at || (this.lockTarget ? this.lockTarget.centre() : elemancy.defaultTarget());
    if (!pos) return null;
    const from = p.position.clone(); from.y += 1.3;
    const power = o.power ?? 1;
    const res = elemancy.cast(element, { pos, t0: vfx.clock, power, terrain: this.terrain, from });
    const radius = o.radius ?? res.radius;
    if (this.enemies) {
      for (const e of this.enemies.sphereQuery(pos, radius, this._hits)) {
        this._applyDamage(e, pos, {
          element, motion: o.motion ?? SPELL_MOTION, poise: o.poise ?? 30, blindside: false,
        });
      }
    }
    this.emit('spell', { element, position: pos, reaction: res.reaction, radius });
    return res;
  }

  /**
   * Cast one of the three crafted flasks in the quick-cast slots.
   *
   * The whole Elemancy loop lands here: energy drawn from a deposit was mixed
   * into a spell whose potency, blast radius, cast count and side-effects were
   * *computed*, and this is where those numbers become damage in the world.
   *
   * @param slot 0..2
   */
  castSpell(slot: number, at?: THREE.Vector3): CastResult {
    const rpg = this.model;
    if (!rpg || !rpg.elemancy) return { ok: false, reason: 'no-elemancy' };
    const uid = rpg.elemancy.equipped[slot];
    if (!uid) return { ok: false, reason: 'empty-slot' };
    const spell: CraftedSpell | null = rpg.elemancy.spell(uid);
    if (!spell) return { ok: false, reason: 'empty-slot' };
    if (this.mp < spell.mpCost) { this._enterStasis(); return { ok: false, reason: 'no-mp' }; }

    const used = rpg.elemancy.cast(uid);
    if (!used.ok) return used;
    this.setMp(this.mp - spell.mpCost);
    this.emit('mp', { mp: this.mp, maxMp: this.maxMp, stasis: false });

    const pos = at || (this.lockTarget ? this.lockTarget.centre() : this.elemancy?.defaultTarget());
    if (!pos) return { ok: false, reason: 'no-target' };
    // Potency is a motion value: the crafted damage divided by what one point
    // of Noctis' magic attack is worth, so the flask scales with him too.
    const motion = Math.max(0.5, spell.damage / Math.max(1, rpg.noctis.magicAttack));
    const power = Math.max(0.6, Math.min(2.2, spell.radius / 4));
    const bursts = Math.max(1, spell.multicast || 1);

    const fire = (i: number) => {
      const p = pos.clone();
      if (i > 0) { p.x += this.rng.range(-2, 2); p.z += this.rng.range(-2, 2); }
      this.cast(spell.element, p, { power, motion, radius: spell.radius, poise: 30 + spell.tier * 20 });
    };
    fire(0);
    // Dualcast / Tricast: the flask detonates again, a beat later, off-centre.
    for (let i = 1; i < bursts; i++) this.schedule(i * 0.22, fire, i);
    this._applySpellEffects(spell, pos, rpg);

    this.emit('castSpell', { slot, spell, remaining: used.remaining, position: pos, damage: spell.damage });
    return { ok: true, spell, remaining: used.remaining, damage: spell.damage, motion };
  }

  /**
   * The crafted side-effects that are not just "more damage in a bigger circle".
   * @param spell @param pos @param rpg
   */
  _applySpellEffects(spell: CraftedSpell, pos: THREE.Vector3, rpg: RpgSystem) {
    for (const e of spell.effects || []) {
      const pay = e.payload || {};
      if (pay.healAllies) {
        for (const s of rpg.roster) s.heal(s.maxHp * pay.healAllies);
        const p = this.player;
        if (this.vfx && p) this.vfx.airRing({ pos: p.position.clone().setY(pos.y + 0.4), color: 0x90ffb0, from: 0.5, to: 7, life: 0.7, intensity: 3 });
      }
      if (pay.instantDeath && this.enemies) {
        for (const en of this.enemies.sphereQuery(pos, spell.radius, this._hits)) {
          if (en.boss || en.dead) continue;
          if (this.rng.next() >= pay.instantDeath) continue;
          this._applyDamage(en, pos, { element: spell.element, motion: 999, poise: 200 });
        }
      }
      if (pay.status) {
        for (const en of this.enemies ? this.enemies.sphereQuery(pos, spell.radius, this._hits) : []) {
          en.status = { kind: pay.status, until: (this.game.time.now || 0) + (pay.duration || 10) };
        }
      }
    }
  }

  /**
   * Draw elemental energy out of the nearest deposit. The first half of the
   * Elemancy loop; crafting happens in the menu, casting in `castSpell`.
   */
  drawEnergy() {
    const rpg = this.model;
    const player = this.player;
    if (!rpg || !player) return { ok: false, reason: 'no-elemancy' };
    const res = rpg.drawNearby(player.position, 12);
    if (res.ok && this.vfx) {
      const p = player.position.clone(); p.y += 1.0;
      // `drawNearby` answers one of two shapes and only the success arm names
      // an element; ask the value rather than trusting `ok` to imply it.
      const element = 'element' in res ? res.element : null;
      const colour = element === 'fire' ? 0xff7a1e : element === 'ice' ? 0x7fd6ff : 0xa8c8ff;
      this.vfx.moteBurst({ pos: p, count: 30, speed: 2.4, color: colour, life: 1.2, size: 0.22, gravity: -1.4, intensity: 5 });
      this.vfx.flare({ pos: p, color: colour, size: 1.6, life: 0.45, intensity: 5 });
    }
    this.emit('draw', res);
    return res;
  }

  /* --------------------------------------------------------- damage */

  /**
   * Noctis as `computeDamage` sees him **with the weapon currently drawn**.
   *
   * `Inventory.modsFor` folds the *strongest* equipped weapon into `Stats.gear`
   * because it has no idea which one is in his hand. Here we do: swap the
   * strongest one back out and the drawn one in, so pulling the daggers really
   * does hit for less than the greatsword.
   *
   * @returns an attacker for `computeDamage`
   */
  _attacker(rpg: RpgSystem) {
    const n = rpg.noctis;
    let strongest = 0;
    let active = 0;
    if (rpg.inventory) {
      for (const w of rpg.inventory.equipped('noctis').weapon as Array<WeaponItem | null>) {
        if (w && (w.attack || 0) > strongest) strongest = w.attack || 0;
      }
      active = this.weaponItem ? (this.weaponItem.attack || 0) : strongest;
    }
    return {
      level: n.level,
      attack: Math.max(1, n.attack - strongest + active),
      magicAttack: n.magicAttack,
      magic: n.magic,
      strength: n.strength,
      critRate: n.critRate,
      critDamage: n.critDamage,
    };
  }

  /**
   * Resolve one hit through the real damage pipeline: Noctis' Strength and
   * the drawn weapon's attack, the level differential and night scaling, the
   * target's defence, its elemental affinity and weapon-class weakness, the
   * stagger / vulnerability multiplier and the crit roll.
   *
   * This is the *only* place a physical or magical number is produced. Nothing
   * downstream is allowed to re-roll it.
   *
   * @param [o] `{motion, element, weaponClass, blindside, warp, aerial}`
   */
  resolve(enemy: CombatTarget, o: HitOpts = {}): DamageRoll {
    const motion = o.motion ?? 1;
    const rpg = this.model;
    if (!rpg) {
      // No RPG model (a bare harness world): fall back to the weapon table so
      // combat still has weight rather than silently doing nothing.
      const base = (this.weapon ? this.weapon.def.damage : 100) * motion;
      const roll = { damage: Math.max(1, Math.round(base)), crit: false, weakness: false, elementKind: 'neutral', element: o.element || 'physical' };
      this.lastRoll = roll;
      return roll;
    }
    const stagger = (enemy.staggerMult ?? 1) * (enemy.vulnerable ? 1.5 : 1);
    const res = rpg.damage({
      attacker: this._attacker(rpg),
      target: enemy,
      motion,
      kind: o.element ? 'magical' : 'physical',
      element: o.element || 'physical',
      // Spells identify by element and must not also claim a weapon class.
      weaponClass: o.element ? null : (o.weaponClass || this.weaponClass),
      staggerMult: stagger,
      isBackAttack: !!o.blindside,
      isWarpStrike: !!o.warp,
      isAerial: !!o.aerial,
      isTechnique: !!o.technique,
      targetIsDaemon: enemy.faction === 'daemon',
    });
    this.lastRoll = res;
    return res;
  }

  /**
   * Land a resolved hit on an enemy.
   *
   * @param at where the blow came from (sets the knockback dir)
   * @param [opts] `{motion, poise, element, blindside, warp, weaponClass}`
   */
  _applyDamage(enemy: CombatTarget, at: THREE.Vector3, opts: HitOpts = {}) {
    if (!enemy || enemy.dead) return null;
    const dir = this._tmp.subVectors(enemy.centre(), at);
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
    dir.normalize();
    const blindside = opts.blindside !== undefined ? opts.blindside : this._isBlindside(enemy);
    const roll = this.resolve(enemy, { ...opts, blindside });

    // `Enemy.hit` applies its own ×1.7 to a staggered target, and `resolve`
    // has already folded the model's stagger multiplier in. Divide the one we
    // know about back out so the HP that comes off equals the number printed.
    const doubleCount = enemy.staggered ? 1.7 : 1;
    const res = enemy.hit(roll.damage / doubleCount, dir, {
      poise: opts.poise ?? 10,
      noFlinch: opts.noFlinch,
      source: this.player,           // being hit is what pulls an idle pack onto you
      // Was the string `'noctis'`, which `Enemy.killer` (a `Threat`) is not.
      // Nothing in the tree reads `killer`, so this names the same thing the
      // string meant without changing anything that can be observed.
      killer: this.player,
    });
    if (!res) return null;
    res.damage = roll.damage;
    res.crit = roll.crit;

    this.emit('damage', {
      enemy, damage: roll.damage, position: enemy.centre(),
      crit: roll.crit, element: opts.element || null,
      killed: res.killed, staggered: res.staggered,
      weakness: roll.weakness, elementKind: roll.elementKind,
      rolled: true,
    });
    if (res.staggered) this._onStagger(enemy);
    if (res.killed) {
      this.emit('death', { enemy });
      if (this.vfx) {
        const c = enemy.centre();
        this.vfx.moteBurst({ pos: c, count: 26, speed: 3.2, color: 0x8fc8ff, life: 1.4, size: 0.3, gravity: 1.2, intensity: 3 });
        this.vfx.smokePlume({ pos: c, count: 14, speed: 1.6, life: 2.4, color: 0x1a1620, size: 0.6, rise: 1.6 });
      }
      if (enemy === this.lockTarget) this.setLockOn(this.autoTarget());
    }
    return res;
  }

  /**
   * Poise broke. Make the window legible: a ring, a flash, a beat of slow
   * motion, and the `stagger` event the HUD banners off.
   */
  _onStagger(enemy: Enemy) {
    this.emit('stagger', { enemy });
    this.hitstop = Math.max(this.hitstop, 0.1);
    this.slowmo = Math.max(this.slowmo, 0.3);
    if (!this.vfx) return;
    const c = enemy.centre();
    this.vfx.airRing({ pos: c, color: 0xffd08a, from: 0.4, to: 3.6 * enemy.scale, life: 0.5, intensity: 3.2 });
    this.vfx.flash({ pos: c, color: 0xffc070, intensity: 34, distance: 10, life: 0.35, priority: 5 });
    if (this.terrain) {
      this.vfx.ground.ring({ pos: enemy.root.position, terrain: this.terrain, radius: 2.4 * enemy.scale, color: 0xffc888, life: 0.7 });
    }
  }

  /** True when the player is behind the enemy's facing — blindside bonus. */
  _isBlindside(enemy: Enemy) {
    if (!this.player) return false;
    const ef = this._tmp.set(Math.sin(enemy.heading), 0, Math.cos(enemy.heading));
    const toPlayer = this._fwd.subVectors(this.player.position, enemy.root.position).setY(0);
    if (toPlayer.lengthSq() < 1e-5) return false;
    return ef.dot(toPlayer.normalize()) < -0.35;
  }

  _enemyStrike(enemy: Enemy) {
    const p = this.player;
    if (!p) return;
    const d = enemy.root.position.distanceTo(p.position);
    if (d > enemy.attackRange + 1.2) return;
    if (this.state === 'phase' && this.phaseCharge > 0.05) {
      this._perfectParry(enemy, p);
      return;
    }
    if (this.state === 'dodge' && this.stateTime < 0.32) return;   // i-frames
    const rpg = this.model;
    let dmg;
    if (rpg && rpg.damage) {
      const res = rpg.damage({
        attacker: { attack: enemy.damage * 0.9, level: enemy.level, critRate: 0.06, critDamage: 1.5 },
        target: rpg.noctis, motion: 1, element: 'physical',
      });
      dmg = Math.max(1, Math.round(res.damage * 0.55));
      rpg.noctis.applyDamage(dmg);
      p.stats.hp = Math.round(rpg.noctis.hp);
    } else {
      dmg = Math.round(enemy.damage * (0.85 + this.rng.next() * 0.3));
      p.stats.hp = Math.max(0, p.stats.hp - dmg);
    }
    const at = p.position.clone(); at.y += 1.1;
    if (this.vfx) {
      this.vfx.impact({
        pos: at, dir: this._tmp.subVectors(at, enemy.centre()).normalize(),
        scale: 1.1, color: 0xff5a3a, blood: true, terrain: this.terrain,
      });
    }
    this.hitstop = 0.06;
    this.emit('playerHit', { enemy, damage: dmg, hp: p.stats.hp, position: at });
  }

  _perfectParry(enemy: Enemy, p: Player) {
    const at = p.position.clone(); at.y += 1.2;
    if (this.vfx) {
      this.vfx.flare({ pos: at, color: 0xdff4ff, size: 4.0, life: 0.35, intensity: 10 });
      this.vfx.crystalBurst({ pos: at, count: 22, speed: 6.5, life: 0.7, size: 0.22 });
      this.vfx.sparkBurst({
        pos: at, dir: this._tmp.subVectors(at, enemy.centre()).normalize(),
        count: 40, speed: 13, color: 0xcfeaff, size: 0.11, intensity: 8,
      });
      this.vfx.flash({ pos: at, color: 0x8fd8ff, intensity: 90, distance: 16, life: 0.45, priority: 7 });
      if (this.terrain) this.vfx.ground.ring({ pos: p.position, terrain: this.terrain, radius: 3.2, color: 0xbfe8ff, life: 0.6 });
    }
    this.slowmo = 0.55;
    this.counterWindow = 0.9;
    this.emit('parry', { enemy, position: at });
  }

  /** Counter-attack: a free, heavy, guaranteed-blindside riposte. */
  counter(enemy: Enemy | null = this.lockTarget || this.autoTarget()) {
    const p = this.player;
    if (this.counterWindow <= 0 || !enemy || !p) return false;
    this.counterWindow = 0;
    this._applyDamage(enemy, p.position, {
      motion: this.weaponMotion * 2.4, poise: 60, blindside: true,
    });
    if (this.vfx) {
      const c = enemy.centre();
      this.vfx.impact({ pos: c, dir: this._tmp.subVectors(c, p.position).normalize(), scale: 1.8, color: 0xbfe8ff, terrain: this.terrain, blood: true });
    }
    this.hitstop = 0.11;
    return true;
  }

  /** A party member joins the attack for bonus damage. */
  _tryLinkStrike(enemy: Enemy) {
    if (this.linkCooldown > 0 || !enemy) return;
    if (this.rng.next() > 0.22) return;
    this.linkCooldown = 8;
    const party = this.game.get('Party');
    const ally = party && party.members ? party.members[Math.floor(this.rng.next() * party.members.length)] : null;
    const c = enemy.centre();
    const dir = this._tmp.set(Math.cos(this.rng.next() * 6.28), 0.2, Math.sin(this.rng.next() * 6.28)).normalize();
    const from = c.clone().addScaledVector(dir, 5.5);
    if (this.vfx) {
      this.vfx.warpStrike({ from, to: c, t0: this.vfx.clock + 0.06, dash: 0.14, terrain: this.terrain, color: 0xffcf6a, scale: 0.8 });
    }
    this._applyDamage(enemy, from, { motion: this.weaponMotion * 1.8, poise: 45 });
    this.emit('link', { enemy, ally });
  }

  /* ----------------------------------------------------------- tick */

  update(dt: number, game: Game) {
    const raw = game.time.rawDt;
    const input = game.input;
    const p = this.player;

    /* time dilation ------------------------------------------------- */
    if (this.hitstop > 0) {
      this.hitstop -= raw;
      game.time.scale = 0.06;
    } else if (this.slowmo > 0) {
      this.slowmo -= raw;
      game.time.scale = 0.28;
    } else if (game.time.scale !== 1) {
      game.time.scale = THREE.MathUtils.damp(game.time.scale, 1, 12, raw);
      if (game.time.scale > 0.985) game.time.scale = 1;
    }
    if (this.counterWindow > 0) this.counterWindow -= raw;
    if (this.linkCooldown > 0) this.linkCooldown -= dt;

    if (!p) return;
    this.inCombat = !!(this.enemies && this.enemies.alive().some(
      (e: Enemy) => e.root.position.distanceTo(p.position) < 34
    ));

    // scenario shots author the pose directly; keep the sim from unwinding it
    if (this.scenarioLock) {
      if (this.vfx && this.armiger.active > 0.001) {
        this.armiger.setClock(this.vfx.clock);
        this.armiger.layout(this._armigerCentre || p.position, this.vfx.clock, this._armigerOpts);
      }
      return;
    }

    /* input --------------------------------------------------------- */
    if (input.enabled !== false && !this.scenarioLock) this._readInput(input, dt);

    /* MP ------------------------------------------------------------ */
    this._drain(dt);
    if (this.perch > 0) this.perch -= dt;
    const maxMp = this.maxMp;
    if (this.state === 'phase') {
      this.setMp(this.mp - PHASE_MP_PER_SECOND * dt);
      this.phaseCharge = Math.min(1, this.phaseCharge + dt * 3);
      if (this.mp <= 0) this._enterStasis();
    } else {
      this.phaseCharge = Math.max(0, this.phaseCharge - dt * 4);
      if (this.armigerTimer > 0) {
        this.setMp(this.mp - ARMIGER_MP * dt);
        if (this.mp <= 0) { this.armigerTimer = 0; this._enterStasis(); }
      } else if (this.mpRegenDelay > 0) {
        this.mpRegenDelay -= dt;
      } else if (this.mp < maxMp) {
        // Perching after a point-warp is the fast way back — that is what
        // makes warping to a vantage a tactic rather than a taxi.
        const rate = this.stasis ? STASIS_REGEN : (this.perch > 0 ? PERCH_REGEN : MP_REGEN);
        this.setMp(this.mp + rate * dt);
        if (this.stasis && this.mp >= maxMp * 0.999) {
          this.stasis = false;
          this.state = 'idle';
          this.emit('mp', { mp: this.mp, maxMp, stasis: false });
        }
      }
    }

    /* state machine ------------------------------------------------- */
    this.stateTime += dt;
    switch (this.state) {
      case 'attack': this._tickSwing(dt); break;
      case 'dodge': this._tickDodge(dt, p); break;
      case 'warp': this._tickWarp(dt, p); break;
      case 'phase': this._tickPhase(dt); break;
      case 'stasis': if (!this.stasis) this.state = 'idle'; break;
      default: this._restPose(dt); break;
    }

    /* armiger ------------------------------------------------------- */
    if (this.armigerTimer > 0) {
      this.armigerTimer -= dt;
      this.armiger.active = THREE.MathUtils.damp(this.armiger.active, 1, 6, dt);
      this._tickArmigerStrikes(dt, p);
    } else if (this.armiger.active > 0.001) {
      this.armiger.active = THREE.MathUtils.damp(this.armiger.active, 0, 6, dt);
    }
    if (this.vfx && this.armiger.active > 0.001) {
      this.armiger.setClock(this.vfx.clock);
      this.armiger.layout(p.position, this.vfx.clock);
    } else {
      this.armiger.group.visible = false;
    }

    this.elemancy?.update();
  }

  /**
   * The whole verb list, bound.
   *
   * | input | verb |
   * |---|---|
   * | hold LMB | light attack — auto-combo through the weapon's chain |
   * | `F` | heavy attack — open on the finisher, big poise damage |
   * | `Space` | dodge roll (i-frames for 0.32 s) |
   * | hold RMB | phase / parry — drains MP, perfect guard opens a counter |
   * | `Q` | warp-strike, or the counter while the parry window is open |
   * | `E` | warp to a point near the target, and perch to recover MP |
   * | `V` | lock on / off |
   * | `R` | Armiger (needs a full gauge; then burns MP) |
   * | `1`-`4` | draw the weapon in that equipment slot |
   * | `5` | Noctis' firearm, whatever is equipped |
   * | `Z` `X` `B` | cast the crafted spell in quick-slot 1 / 2 / 3 |
   * | `T` | draw elemental energy from a nearby deposit |
   * | `G` `J` `K` | Gladiolus / Ignis / Prompto technique (see `PartyAI`) |
   */
  _readInput(input: Input, dt: number) {
    const m = input.mouse;
    // Gamepad face buttons mirror the keyboard verbs one for one, so the
    // controls card can print both columns without either being a promise the
    // game does not keep. `gpDown` is a real rising edge tracked by Input, and
    // both of these already answer false when no pad is connected -- the old
    // `const pad = input.gpDown ? input : null` guarded on a method that is
    // always defined, so it was never anything but `input`.
    const gpHeld = (i: number) => input.gpButton(i);
    const gpEdge = (i: number) => input.gpDown(i);

    // Circle taps to dodge and holds to phase, exactly as FFXV does it. A/Cross
    // stays free for the interact verb, which owns it everywhere else.
    if (m.left || gpHeld(2)) this.attack();
    if (input.keyDown('KeyF')) this.heavy();
    if (input.keyDown('Space') || gpEdge(1)) this.dodge();
    if (gpEdge(3)) { if (this.counterWindow > 0) this.counter(); else this.warpStrike(); }
    if (gpEdge(4)) this.tryArmiger();
    if (gpEdge(5)) this.setLockOn(this.lockTarget ? null : this.autoTarget());
    if (gpEdge(12)) this.drawSlot(0);
    if (gpEdge(15)) this.drawSlot(1);
    if (gpEdge(13)) this.drawSlot(2);
    if (gpEdge(14)) this.drawSlot(3);
    if ((m.right || gpHeld(1)) && !this.stasis) {
      if (this.state !== 'phase' && this.state !== 'warp') { this.state = 'phase'; this.stateTime = 0; }
    } else if (this.state === 'phase') { this.state = 'idle'; }
    if (input.keyDown('KeyQ')) {
      if (this.counterWindow > 0) this.counter();
      else this.warpStrike();
    }
    // R armiger, E point-warp, V lock-on: Tab is the pause menu and C is photo
    // mode, both owned by `Menus`, so the older bindings opened a screen
    // instead of locking on or casting.
    if (input.keyDown('KeyE')) this.warpToPoint();
    if (input.keyDown('KeyV')) this.setLockOn(this.lockTarget ? null : this.autoTarget());
    if (input.keyDown('KeyR')) this.tryArmiger();
    for (let i = 0; i < 4; i++) if (input.keyDown(`Digit${i + 1}`)) this.drawSlot(i);
    if (input.keyDown('Digit5')) this.setWeapon('firearm');
    if (input.keyDown('KeyZ')) this.castSlot(0);
    if (input.keyDown('KeyX')) this.castSlot(1);
    if (input.keyDown('KeyB')) this.castSlot(2);
    if (input.keyDown('KeyT')) this.drawEnergy();
  }

  /**
   * Warp to a perch near the auto target (or straight ahead when the field is
   * empty), which is also how MP comes back.
   */
  warpToPoint() {
    const p = this.player;
    if (!p) return false;
    const t = this.autoTarget(40);
    const to = t
      ? t.root.position.clone().add(this._tmp.set(0, 0, 3))
      : p.position.clone().addScaledVector(
        this._tmp.set(Math.sin(p.heading), 0, Math.cos(p.heading)), 12);
    if (this.terrain) to.y = this.terrain.heightAt(to.x, to.z);
    return this.warpTo(to);
  }

  /**
   * Cast quick-slot `n`. Falls back to the raw element when nothing has been
   * crafted yet, so the three magic keys are never dead.
   * @param n 0..2
   */
  castSlot(n: number) {
    const res = this.castSpell(n);
    if (res && res.ok) return res;
    if (res && (res.reason === 'no-mp')) return res;
    return this.cast(FALLBACK_ELEMENTS[n] || 'fire');
  }

  /* -------------------------------------------------------- swings */

  _tickSwing(dt: number) {
    const step = this.comboStep;
    if (!step) { this._endSwing(); this.state = 'idle'; return; }
    this.comboTimer += dt;
    let n = 0;
    if (this.comboPhase === 'wind') {
      n = this.comboTimer / step.wind;
      if (n >= 1) { this.comboPhase = 'active'; this.comboTimer = 0; n = 0; }
    }
    if (this.comboPhase === 'active') {
      n = this.comboTimer / step.active;
      if (n >= 1) { this.comboPhase = 'rec'; this.comboTimer = 0; n = 0; }
    }
    if (this.comboPhase === 'rec') {
      n = this.comboTimer / step.rec;
      if (n >= 1) {
        const def = this.weapon.def;
        if (this.comboQueued && this.comboIndex + 1 < def.combo.length) this._startSwing(this.comboIndex + 1);
        else { this._endSwing(); this.state = 'idle'; }
        return;
      }
    }

    // swing pose: ease into the arc during wind, snap through it while active
    let ang;
    const [a0, a1] = step.arc;
    if (this.comboPhase === 'wind') ang = THREE.MathUtils.lerp(a0 * 0.6, a0, ease(n));
    else if (this.comboPhase === 'active') ang = THREE.MathUtils.lerp(a0, a1, snap(n));
    else ang = THREE.MathUtils.lerp(a1, a1 * 0.7, ease(n));

    this._poseHand(ang, step, this.comboPhase, n);

    if (this.comboPhase === 'active') {
      if (step.shoot) this._fireShot(n);
      else this._sweepHits();
      if (this.trail) {
        this.hand.updateWorldMatrix(true, true);
        this.trail.push(this.weapon.base(), this.weapon.tip());
      }
    } else if (this.trail && this.comboPhase === 'rec') {
      this.trail.release();
    }
  }

  /**
   * Place the weapon anchor for a given swing angle.
   *
   * The `lay` term matters more than it looks. Every combo step rotates the
   * blade about an axis that is very nearly +Y, and the blade points along +Y
   * in its own frame — so with the blade held near-vertical the swing arc is a
   * tight cone beside Noctis' head that never leaves his own capsule. The hit
   * sweep samples base → tip, so that arc *is* the reach: a sword with 2.05 m
   * of stated reach was landing on nothing more than half a metre away.
   *
   * Laying the blade over through the active window puts the tip out where the
   * arc is, which is both how a sword is actually swung and what makes the
   * trail ribbon read as a sweep rather than a flick.
   */
  _poseHand(ang: number, step: ComboStep, phase: ComboPhase, n: number) {
    const h = this.hand;
    const k = THREE.MathUtils.clamp(n, 0, 1);
    // near-vertical at rest, laid right over through the active window
    let lay;
    if (phase === 'wind') lay = -0.35 - 0.30 * ease(k);
    else if (phase === 'active') lay = -0.65 - 0.80 * ease(Math.min(1, k * 3.5));
    else lay = -1.45 + 0.90 * ease(k);
    // Mirrored into the right hand (see `HAND_X`). Reflecting through x = 0
    // maps a rotation about (nx, ny, nz) to one about (nx, -ny, -nz) at the
    // same angle, and an XYZ euler (rx, ry, rz) to (rx, -ry, -rz) -- so the
    // combo's authored `axis` data and `tilt` stay as they are and only the
    // signs change here.
    this._mirAxis.set(this._axis.x, -this._axis.y, -this._axis.z);
    this._q.setFromAxisAngle(this._mirAxis, ang);
    this._qt.setFromEuler(EULER.set(step.tilt || 0, 0, -lay));
    h.quaternion.copy(this._q).multiply(this._qt);
    const lean = phase === 'active' ? 0.24 * Math.sin(k * Math.PI) : 0;
    const reach = step.thrust ? (phase === 'active' ? 0.55 * Math.sin(k * Math.PI) : 0) : 0;
    h.position.set(HAND_X, 1.12 - lean * 0.5, 0.12 + reach + lean);
  }

  _restPose(dt: number) {
    const h = this.hand;
    IDLE_Q.setFromEuler(EULER.set(-0.22, -0.3, 1.9));
    h.quaternion.slerp(IDLE_Q, Math.min(1, dt * 9));
    h.position.lerp(REST_POS, Math.min(1, dt * 9));
  }

  _endSwing() {
    if (this.trail) { this.trail.release(); this.trail = null; }
    this.comboPhase = 'none';
    this.comboStep = null;
  }

  /**
   * Swept-capsule query for the blade arc.
   *
   * `Enemies.sweepQuery` exists and does almost this, but its vertical window
   * is `[foot - 0.5, head + 0.3]` — measured against the *creature*, not
   * against the swing. Noctis' blade travels at chest height, so on any slope
   * steeper than about fifteen degrees a downhill sabertusk sits entirely
   * below the segment and the swing passes clean over it, which is what a
   * player experiences as "my sword does nothing".
   *
   * A swing is a body movement, not a laser: it covers roughly hip to overhead.
   * Widening the window to `[foot - 1.3, head + 0.9]` is what makes melee land
   * where the animation says it lands.
   *
   * @param a @param b @param radius
   */
  _sweep(a: THREE.Vector3, b: THREE.Vector3, radius: number): Enemy[] {
    const out = this._hits;
    out.length = 0;
    if (!this.enemies) return out;
    const steps = 5;
    const p = this._sweepTmp;
    for (const e of this.enemies.list) {
      if (e.dead) continue;
      const er = e.radius * e.scale + radius;
      const lo = e.root.position.y - 1.3;
      const hi = e.root.position.y + e.height * e.scale + 0.9;
      for (let i = 0; i <= steps; i++) {
        p.lerpVectors(a, b, i / steps);
        if (p.y < lo || p.y > hi) continue;
        const dx = e.root.position.x - p.x, dz = e.root.position.z - p.z;
        if (dx * dx + dz * dz > er * er) continue;
        out.push(e);
        break;
      }
    }
    return out;
  }

  _sweepHits() {
    if (!this.enemies || !this.weapon) return;
    this.hand.updateWorldMatrix(true, true);
    this._tip.copy(this.weapon.tip());
    this._base.copy(this.weapon.base());
    const list = this._sweep(this._base, this._tip, this.weapon.def.hitbox);
    const heavy = this.heavySwing;
    for (const e of list) {
      if (this.hitThisSwing.has(e)) continue;
      this.hitThisSwing.add(e);
      const blindside = this._isBlindside(e);
      this._applyDamage(e, this._base, {
        blindside,
        motion: this.weaponMotion * (this.comboStep ? this.comboStep.dmg : 1) * (heavy ? 1.35 : 1),
        poise: this.weapon.def.poise * (heavy ? 2.2 : 1),
      });
      const at = this._closestOn(e, this._tip);
      if (this.vfx) {
        this.vfx.impact({
          pos: at, dir: this._tmp.subVectors(this._tip, this._base).normalize(),
          scale: blindside ? 1.5 : 1.0,
          color: blindside ? 0xbfe8ff : 0xffcf8a,
          blood: true, terrain: null,
        });
      }
      this.hitstop = blindside ? 0.085 : 0.055;
      this.emit('hit', { enemy: e, position: at, weapon: this.weapon.kind, blindside });
      if (this.comboIndex === this.weapon.def.combo.length - 1) this._tryLinkStrike(e);
    }
  }

  _closestOn(enemy: Enemy, p: THREE.Vector3) {
    const c = enemy.centre();
    return c.lerp(p, 0.55);
  }

  _fireShot(n: number) {
    if (this._shotFired) return;
    const p = this.player;
    if (!p) return;
    this._shotFired = true;
    const target = this.lockTarget || this.autoTarget(30);
    this.hand.updateWorldMatrix(true, true);
    const muzzle = this.weapon.tip();
    this.emit('shot', { position: muzzle });
    const to = target ? target.centre() : muzzle.clone().addScaledVector(
      this._tmp.set(Math.sin(p.heading), 0, Math.cos(p.heading)), 26
    );
    if (this.vfx) {
      const b = this.vfx.acquireBeam();
      b.uniforms.uHead.value.set(0xfff0d0);
      b.uniforms.uTail.value.set(0xffb060);
      b.uniforms.uTaper.value = 0.0;
      b.uniforms.uFalloff.value = 0.0;
      b.uniforms.uIntensity.value = 3.0;
      b.width = 0.045;
      b.setLine(muzzle, to);
      this.vfx.track(this.vfx.clock, 0.09, (k: number) => { b.strength = k < 0 || k > 1 ? 0 : (1 - k); });
      this.vfx.sparkBurst({
        pos: muzzle, dir: this._tmp.subVectors(to, muzzle).normalize(), count: 12,
        speed: 10, spread: 0.45, color: 0xffc070, size: 0.07, life: 0.2, intensity: 7,
      });
      this.vfx.flash({ pos: muzzle, color: 0xffb060, intensity: 22, distance: 5, life: 0.08 });
    }
    if (target) {
      this._applyDamage(target, muzzle, {
        motion: this.weaponMotion * (this.comboStep ? this.comboStep.dmg : 1), poise: 6,
      });
      if (this.vfx) this.vfx.impact({ pos: target.centre(), dir: this._tmp.subVectors(target.centre(), muzzle).normalize(), scale: 0.7, color: 0xffcf8a, blood: true });
    }
    setTimeout(() => { this._shotFired = false; }, 0);
  }

  /* --------------------------------------------------------- dodge */

  _tickDodge(dt: number, p: Player) {
    const T = 0.46;
    const n = Math.min(1, this.stateTime / T);
    const speed = 11 * Math.pow(1 - n, 1.6);
    p.root.position.addScaledVector(this.dodgeDir, speed * dt);
    if (this.terrain) p.root.position.y = this.terrain.heightAt(p.root.position.x, p.root.position.z);
    if (n >= 1) this.state = 'idle';
  }

  /* ---------------------------------------------------------- warp */

  _tickWarp(dt: number, p: Player) {
    const w = this.warp;
    const vfx = this.vfx;
    if (!w || !vfx) { this.state = 'idle'; return; }
    const t = vfx.clock - w.t0;
    const k = THREE.MathUtils.clamp(t / w.dash, 0, 1);
    // ease-in so the blink reads as an accelerating streak
    const e = k * k;
    this._tmp.lerpVectors(w.from, w.to, e);
    p.root.position.set(this._tmp.x, this._tmp.y - 1.1, this._tmp.z);
    p.velocity.set(0, 0, 0);
    if (this.weapon) this.weapon.setReveal(Math.max(0, (k - 0.55) / 0.45));

    if (!w.struck && t >= w.dash) {
      w.struck = true;
      if (w.enemy) {
        this._applyDamage(w.enemy, w.from, {
          motion: this.weaponMotion * 2.9, poise: 80, warp: true,
          blindside: this._isBlindside(w.enemy),
        });
      }
      this.hitstop = 0.12;
      this.emit('warp', { phase: 'impact', from: w.from, to: w.to, enemy: w.enemy });
    }
    if (t > w.dash + 0.28) {
      this.state = 'idle';
      this.warp = null;
      if (this.weapon) this.weapon.setReveal(1);
      if (this.terrain) p.root.position.y = this.terrain.heightAt(p.root.position.x, p.root.position.z);
    }
  }

  /* --------------------------------------------------------- phase */

  _tickPhase(dt: number) {
    // a faint crystal shimmer around the player while phasing
    if (this.vfx && this.player && this.rng.next() < dt * 40) {
      const a = this.rng.next() * Math.PI * 2;
      const pos = this.player.position.clone();
      pos.x += Math.cos(a) * 0.45; pos.z += Math.sin(a) * 0.45;
      pos.y += this.rng.range(0.2, 1.7);
      this.vfx.motes.emit({
        pos, vel: { x: 0, y: 0.6, z: 0 }, color: new THREE.Color(0x5fb6ff),
        t0: this.vfx.clock, life: 0.5, size0: 0.16, size1: 0.02,
        drag: 1, gravity: 0.4, intensity: 3.5, fade: 1.4,
      });
    }
    this._restPose(dt);
  }
}

/**
 * Sideways offset of the weapon anchor on the player root.
 *
 * **Negative because the rig's right-hand side is -X** (`Skeleton.ts`: "The
 * character faces +Z. Its right-hand side is -X"). `CombatAnim.weaponIK` picks
 * the driving arm with `local.x >= 0 ? 'L' : 'R'`, so the +0.30 this used to be
 * put the Engine Blade in Noctis' *left* hand in every combat frame.
 *
 * Flipping the sign mirrors the whole weapon rig, so `_poseHand` and
 * `_restPose` mirror their rotations to match. If this ever goes positive
 * again, mirror those back with it.
 */
const HAND_X = -0.30;

const EULER = new THREE.Euler();
const IDLE_Q = new THREE.Quaternion();
const REST_POS = new THREE.Vector3(HAND_X, 1.05, 0.02);

/* ---------------------------------------------------------- MP economy */
/** Warping costs real MP; running the pool dry is what Stasis punishes. */
const WARP_STRIKE_MP = 12;
const WARP_POINT_MP = 8;
const PHASE_MP_PER_SECOND = 22;
const ARMIGER_MP = 9;
/** Passive regeneration, per second. */
const MP_REGEN = 13;
/** The Stasis crawl-back: fast, but you cannot act until it completes. */
const STASIS_REGEN = 26;
/** Perched on a warp point — the fast, tactical way to refill. */
const PERCH_REGEN = 52;
const PERCH_SECONDS = 3.2;

/** Motion value of one phantom arm coming down during the Armiger. */
const ARMIGER_MOTION = 1.2;
/** Motion value of an uncrafted elemental burst. */
const SPELL_MOTION = 2.2;

/** `Inventory` weapon classes -> the classes this system can draw. */
const ITEM_CLASS_TO_KIND = {
  sword: 'sword', greatsword: 'greatsword', polearm: 'polearm',
  dagger: 'daggers', firearm: 'firearm', machinery: 'firearm', shield: 'greatsword',
};

/** What the three magic keys do before anything has been crafted. */
const FALLBACK_ELEMENTS: ('fire' | 'ice' | 'lightning')[] = ['fire', 'ice', 'lightning'];

function ease(n: number) { const t = THREE.MathUtils.clamp(n, 0, 1); return t * t * (3 - 2 * t); }
/** Fast attack, slow settle — makes a swing feel like it has weight. */
function snap(n: number) { const t = THREE.MathUtils.clamp(n, 0, 1); return 1 - Math.pow(1 - t, 3.4); }

export { WEAPONS };
