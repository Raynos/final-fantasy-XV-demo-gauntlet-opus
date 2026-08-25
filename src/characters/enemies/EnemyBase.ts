import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { normalFromHeight, makeDataMap } from '../../util/TextureGen.ts';
import { Noise } from '../../util/Noise.ts';
import { isBone, isMesh, isSkinnedMesh } from '../../util/three-guards.ts';
import { CreatureAnim } from '../rig/CreatureAnim.ts';
import type { AttackTiming } from '../rig/CreatureAnim.ts';
import type { Element, WeaponClass } from '../../game/rpg/Stats.ts';

/**
 * Re-exported because they are part of the enemy contract: an attack's
 * element, a species' `weakTo` and the `weaponClass` of a blow all live in
 * these two closed sets, which the damage formula in `game/rpg/Stats.ts`
 * owns. **`WeaponClass` here is the damage-formula class (`dagger`), not the
 * equipped-weapon kind in `combat/Weapons.ts` (`daggers`)**; the two unions
 * spell it differently and `CombatSystem.weaponClass` translates between them.
 */
export type { Element, WeaponClass };

/* ------------------------------------------------------------ contracts
 *
 * Three shapes carry the whole bestiary, and they are deliberately separate:
 *
 *   `SpeciesDef`  what an author writes in `Sabertusk.ts` — data plus two
 *                 factories. Immutable once the module has evaluated, except
 *                 for the one measured cache noted on it.
 *   `SpawnOpts`   what a *spawn* varies: which instance, how big, how strong.
 *   `EnemyCtx`    what the world hands the AI every frame.
 *
 * Splitting them is what makes the defaults visible. `SpeciesDef.senses.sight`
 * is optional because the species may leave it to `stats.aggroRange`; the
 * resolved `Enemy.sight` is a plain `number`, because by then the default has
 * been applied and there is nothing left to be undefined.
 */

/** Which roster a species belongs to. Drives spawn windows and light weakness. */
export type Faction = 'beast' | 'daemon' | 'imperial' | 'astral';

/** EXP bucket read by `Stats.expForKill`. */
export type ExpClass = 'trash' | 'normal' | 'elite' | 'daemon' | 'boss';

/** The states the AI switch in `update()` dispatches on. */
export type AiState =
  | 'sleep' | 'idle' | 'patrol' | 'alert' | 'return'
  | 'chase' | 'approach' | 'strafe'
  | 'telegraph' | 'attack' | 'recover'
  | 'flinch' | 'stagger' | 'death';

/**
 * The pose vocabulary `pose()` is called with.
 *
 * `POSE_MAP` folds the richer AI vocabulary down onto this, so a species only
 * ever has to answer these names. `run`, `walk` and `pounce` are not AI states
 * at all — `freeze()` passes a scenario's pose name straight through, which is
 * how `src/tools/creaturecheck.mts` and `game/Shots.ts` reach them.
 */
export type PoseName =
  | 'idle' | 'approach' | 'run' | 'walk' | 'pounce'
  | 'telegraph' | 'attack' | 'flinch' | 'stagger' | 'death';

/** What `Enemy.state` may hold: an AI state, or a pose forced by `freeze()`. */
export type EnemyState = AiState | PoseName;

/** Every pose name, for the tools that offer them as a list. */
export const POSE_NAMES: readonly PoseName[] = [
  'idle', 'approach', 'run', 'walk', 'pounce',
  'telegraph', 'attack', 'flinch', 'stagger', 'death',
];

/**
 * Is `s` a pose a species will answer to? The dev browser and the capture
 * scenarios name poses in strings that cross a boundary the compiler cannot
 * follow, so this is where the string becomes a `PoseName`.
 */
export function isPoseName(s: string): s is PoseName {
  return (POSE_NAMES as readonly string[]).includes(s);
}

/** Whether the pack is letting this member close, or holding it on the ring. */
export type PackRole = 'engage' | 'flank';

/** Percent-of-damage-taken per element. 100 is neutral, 0 immune. */
export type ResistTable = Partial<Record<Element, number>>;

/** The numbers that make a species that creature. Every species states all of them. */
export interface EnemyStats {
  name: string;
  hp: number;
  poise: number;
  /** metres per second at a full run. */
  speed: number;
  /** metres; the fallback for an attack that does not state its own `range`. */
  attackRange: number;
  aggroRange: number;
  /** metres; the capsule the melee queries use. */
  radius: number;
  height: number;
  damage: number;
  level: number;
}

/**
 * Perception. Every field has a default in the constructor, so a species
 * states only what makes it different from the average animal.
 */
export interface SpeciesSenses {
  /** metres; defaults to `stats.aggroRange`. */
  sight?: number;
  /** half-angle of the sight cone, radians. 1.9 if absent. */
  fov?: number;
  /** metres, scaled by how fast the target is moving. 12 if absent. */
  hearing?: number;
  /** awake at night rather than by day. Defaults to `faction === 'daemon'`. */
  nocturnal?: boolean;
}

/** One line of a species' drop table. */
export interface EnemyDrop {
  id: string;
  /** 0..1. */
  chance: number;
  count: number;
}

/**
 * One attack in a species' repertoire.
 *
 * The four timing fields are optional here and required on
 * `SpeciesDef.timing`: an attack that states none inherits the species'
 * default, which is what `_timing()` resolves.
 */
export interface EnemyAttack extends Partial<AttackTiming> {
  id: string;
  /** metres; the AI will not open this attack from further out. */
  range: number;
  /** metres; nor from closer in. */
  minRange?: number;
  /** selection weight against the other attacks currently in range. */
  weight: number;
  /** damage multiplier on the species' `stats.damage`. */
  mult: number;
  /** poise damage dealt to whatever it lands on. */
  poise: number;
  /** metres; the sphere the strike sweeps. Read by `EncounterDirector`. */
  hitRadius: number;
  /** seconds before this enemy may act again. */
  cooldown: number;
  /** radians; the horizontal wedge the strike covers. */
  arc?: number;
  /** how hard the enemy keeps turning onto its target during the wind-up. */
  tracking?: number;
  /** metres per second carried forward through the active window. */
  lunge?: number;
  /** boss phase this attack unlocks at; absent means from the start. */
  phase?: number;
  /** fires a projectile instead of sweeping an arc. */
  ranged?: boolean;
  /**
   * Shots before a reload. Ranged only; absent means the weapon never reloads.
   *
   * This is the head-down window, and it is the point of the whole fire model:
   * a shooter on a flat cooldown offers the player nothing to time against, so
   * a firefight is a damage race decided by stats. Three exploitable gaps,
   * MGS5's list: the aim settle (our `telegraph`), the rest between bursts
   * (our `cooldown`), and this one — long, obvious, and worth crossing ground
   * for.
   */
  magazine?: number;
  /** seconds head-down when {@link magazine} runs out. 2.6-3.4 is the reference. */
  reload?: number;
  /** hits everything inside `hitRadius`, not only what is inside `arc`. */
  aoe?: boolean;
  /** cannot be phase-blocked. */
  unblockable?: boolean;
  element?: Element;
  /** the strike goes out behind the creature — the anak's panicked kick. */
  backward?: boolean;
}

/**
 * A species as its author writes it: `Sabertusk.ts` and its twenty siblings.
 *
 * `variant()` in `Bestiary.ts` derives a re-statted mark from one of these
 * without duplicating a triangle, which is why `protoKey` is part of the
 * contract rather than something the spawner infers.
 */
export interface SpeciesDef {
  /** registry key in `TYPES`. */
  key: string;
  /** stable id the quest log matches kill objectives against; `key` if absent. */
  questId?: string;
  faction: Faction;
  expClass: ExpClass;
  stats: EnemyStats;
  senses: SpeciesSenses;
  /** the species' default attack timing, for attacks that state none. */
  timing: AttackTiming;
  attacks: EnemyAttack[];
  drops: EnemyDrop[];
  /** shorthand for a 160% entry in `resistPct`. */
  weakness?: Element;
  /** shorthand for a 50% entry in `resistPct`. */
  resist?: Element;
  /** the explicit table, which wins over `weakness`/`resist`. */
  resistPct?: ResistTable;
  /** weapon classes this creature is soft against. */
  weakTo?: WeaponClass[];
  /** weapon classes that bounce off it. */
  resistsWeapon?: WeaponClass[];
  /** seconds a stagger holds; 2.4 if absent. */
  staggerDuration?: number;
  /** flinches are suppressed, and poise only breaks below 35% HP. */
  superArmour?: boolean;
  /** drives the boss HP bar and `BossFight`'s phases. */
  boss?: boolean;
  /** geometry to share with another species — see `variant()`. */
  protoKey?: string;
  /**
   * Modelled from the waist up, so the bottom of the mesh is *meant* to be
   * below the ground. Opts the species out of `calibrateGround`.
   */
  buriedBase?: boolean;
  /**
   * Authored hints for the encounter code: never opens hostilities, and bolts.
   * **Nothing reads either of them yet** — see `project/handoff/no-any.md`.
   */
  passive?: boolean;
  skittish?: boolean;
  /** Geometry, rig and material, built once and instanced by skeleton cloning. */
  buildPrototype(): EnemyPrototype;
  /** Construct one instance of this species' `Enemy` subclass. */
  make(opts?: SpawnOpts): Enemy;
  /**
   * Ground-lift curves, measured off the model by `calibrateGround()` on the
   * frame the species first spawns. The one mutable field on a definition:
   * it is a per-species cache, and it lives here because it is per *species*.
   */
  _groundCal?: GroundCal;
}

/** Per-pose lift curves over `GROUND_CAL_T`, keyed `pose` or `pose:attackId`. */
export type GroundCal = Record<string, Float64Array>;

/** What `buildPrototype()` returns — exactly what `Rig.build()` produces. */
export interface EnemyPrototype {
  group: THREE.Group;
  mesh: THREE.SkinnedMesh;
  bones: Map<string, THREE.Bone>;
}

/**
 * The cloned skeleton one instance owns, and the bind rotations `pose()`
 * writes its offsets against. Satisfies `CreatureAnimTarget['rig']`.
 */
export interface EnemyRig {
  byName: Map<string, THREE.Bone>;
  rest: Map<string, THREE.Quaternion>;
}

/** What varies between two spawns of the same species. */
export interface SpawnOpts {
  /** per-instance id; de-phases gaits and idle timers between copies. */
  id?: number;
  heading?: number;
  scale?: number;
  level?: number;
  maxHp?: number;
  damage?: number;
  name?: string;
  expClass?: ExpClass;
  /** seconds between attacks when the attack itself does not say. */
  cooldown?: number;
  /** metres from home before the enemy gives up and walks back. */
  leash?: number;
}

/**
 * Something an enemy may notice and attack.
 *
 * Both transform arms are live, which is why this is a union of two optional
 * fields rather than one required one: the player publishes a `position`
 * getter, while a companion is the plain formation record `Party.members`
 * holds, whose transform is its `root`.
 */
export interface Threat {
  position?: THREE.Vector3;
  root?: THREE.Object3D;
  /** ground speed in m/s — which is to say, how loud it is. */
  speed?: number;
  /** the player, once `Downed` has taken them out of the fight. */
  downed?: boolean;
  /** pull on aggro: 1 is Noctis, 0.45 a companion, 2.4 one that has taunted. */
  threatWeight?: number;
}

/** A route an enemy walks when it has nothing better to do. */
export interface PatrolRoute {
  points: THREE.Vector3[];
  index: number;
  /** seconds held at each point. */
  wait: number;
  waitTimer: number;
}

/**
 * What an enemy asks of the pack that owns it — see `game/encounters/Pack.ts`.
 * Only the five calls `Enemy` makes; the pack's own bookkeeping is its business.
 */
export interface EnemyPack {
  add(e: Enemy): unknown;
  remove(e: Enemy): unknown;
  /** hand `e` a role for the next second or so. */
  assign(e: Enemy): unknown;
  /** one member noticed something — bring the rest in. */
  alert(by: Enemy, target: Threat): unknown;
  onDeath(e: Enemy): unknown;
}

/** The heightfield an enemy stands on. */
export interface GroundSampler {
  heightAt(x: number, z: number): number;
}

/**
 * Everything the world hands the AI each frame.
 *
 * The first three are `?` rather than required because they are filled from
 * `Game.get()`, which returns `undefined` for a system that is not registered
 * in the current scenario — a bestiary capture runs with no terrain at all.
 */
/**
 * The most sight can ever be suppressed by vegetation. Below 1 on purpose --
 * see `_concealFactor`: an enemy that a bush can permanently blind is a bug.
 */
const MAX_CONCEALMENT = 0.72;

export interface EnemyCtx {
  terrain?: GroundSampler | null;
  player?: Threat | null;
  /** everything attackable; `player` alone if the director has not set it. */
  threats?: Threat[] | null;
  /** the other enemies, for separation. */
  others: Enemy[];
  /** 0..1 night depth; widens a daemon's sight and narrows an animal's. */
  night: number;
  /**
   * How much cover the vegetation gives at a world point, 0..1.
   *
   * Sibling-ports Wave 4 asks for a concealment term in the perception model
   * and notes that the repo it came from never wrote one, because it had no
   * real vegetation to sample. We do. Optional and duck-typed on purpose: the
   * enemies must not depend on `world/veg/`, and an encounter with no
   * vegetation system wired simply has no concealment.
   */
  concealment?: ((x: number, z: number) => number) | null;
  /** called as `onStrike(enemy, attack)` when an attack's active frame lands. */
  onStrike: ((e: Enemy, a: EnemyAttack | null) => void) | null;
  /** the legacy single-argument hook `CombatSystem` installs. */
  onEnemyStrike: ((e: Enemy) => void) | null;
  rng: () => number;
}

/** What a blow says about itself. */
export interface HitOpts {
  /** poise damage; 10 if absent. */
  poise?: number;
  /** struck from behind: 1.35x, and it counts as a crit. */
  blindside?: boolean;
  element?: Element | null;
  weaponClass?: WeaponClass | null;
  /** skip the flinch, so a combo does not re-flinch on every tick. */
  noFlinch?: boolean;
  /** who swung, so an unaware enemy turns on them. */
  source?: Threat | null;
  killer?: Threat | null;
}

/** What `hit()` returns, which the combat system turns into events. */
export interface HitResult {
  enemy: Enemy;
  damage: number;
  staggered: boolean;
  killed: boolean;
  crit: boolean;
  element: Element | null;
}

/** The pose held by `freeze()` and re-applied every frame by `repose()`. */
export interface FrozenPose {
  state: PoseName;
  phase: number;
}

/**
 * Where a threat is standing.
 *
 * Both arms are live and this is the one place that knows it: the player
 * publishes a `position` getter onto its root, while a companion is the plain
 * formation record `Party.members` holds, which has no `position` of its own
 * and keeps its transform on `root`.
 */
export function threatPos(t: Threat | null | undefined): THREE.Vector3 | null {
  return t ? (t.position ?? t.root?.position ?? null) : null;
}

/**
 * Shared enemy behaviour.
 *
 * An enemy runs a small perception → decision → action loop:
 *
 *   sleep ─(wake hour)─▶ patrol ─(see/hear)─▶ alert ─(confirm)─▶ combat
 *     ▲                    ▲                                      │
 *     └──────── return ◀───┴──────────────(lost target, leashed)◀─┘
 *
 * In combat the pack (see `game/encounters/Pack.ts`) hands out roles so a
 * group flanks and takes turns instead of queueing: only a couple of members
 * hold the `engage` token at once, everyone else circles to a ring slot.
 *
 * Subclasses supply `buildPrototype()` (geometry + rig, built once per type
 * and instanced via skeleton cloning) and `pose(state, phase, ctx)`. `pose` is
 * always called with the *legacy* state vocabulary
 * (`idle|approach|run|telegraph|attack|flinch|stagger|death`) so the four
 * original species keep working; richer species can read `this.state` and
 * `this.attackId` directly for extra variants.
 */
export class Enemy {
  /* ---- identity -------------------------------------------------- */
  /** The species definition this instance was built from. */
  type!: SpeciesDef;
  /** Per-instance id. De-phases gaits, idle timers and sense ticks. */
  id!: number;
  /** Display name; the mark's name for a variant. */
  name!: string;
  /** Stable id the quest log matches kill objectives against. */
  speciesId!: string;
  faction!: Faction;
  expClass!: ExpClass;
  level!: number;
  boss!: boolean;
  superArmour!: boolean;

  /* ---- body ------------------------------------------------------ */
  root!: THREE.Group;
  /** The cloned prototype group, parented to `root`. */
  visual!: THREE.Object3D;
  /** The one `SkinnedMesh` the whole creature is, or null before `attachVisual`. */
  mesh!: THREE.SkinnedMesh | null;
  rig!: EnemyRig;
  anim!: CreatureAnim;
  scale!: number;
  radius!: number;
  height!: number;
  heading!: number;
  velocity!: THREE.Vector3;

  /* ---- vitals ---------------------------------------------------- */
  hp!: number;
  maxHp!: number;
  /** `stats.hp`, so `reset()` can undo a spawn-time HP override. */
  baseMaxHp!: number;
  poise!: number;
  maxPoise!: number;
  damage!: number;
  dead!: boolean;
  invulnerable!: boolean;
  killer!: Threat | null;

  /* ---- state ----------------------------------------------------- */
  state!: EnemyState;
  stateTime!: number;
  /** Animation clock, seconds. Never resets; `stateTime` is the one that does. */
  phase!: number;
  /** Boss phase, driven by `BossFight`. */
  phaseIndex!: number;
  staggered!: boolean;
  staggerTime!: number;
  flinchTime!: number;
  flinchDir!: THREE.Vector3;
  /** 0..1.6 severity of the last blow; drives the impact layer. */
  hitPower!: number;
  lastHitAt!: number;
  corpseTime!: number;
  deathPush!: number;
  deathSide!: number;
  /** The player has lock-on. */
  locked!: boolean;
  /** Scenario override: hold this pose and stop the AI. */
  frozenPose!: FrozenPose | null;
  /** Off the ground — set by `Dropship` while a trooper is still falling. */
  airborne!: boolean;

  /* ---- perception / territory ------------------------------------ */
  sight!: number;
  /** Half-angle of the sight cone, radians. */
  fov!: number;
  hearing!: number;
  nocturnal!: boolean;
  aggroRange!: number;
  /** Rises while the enemy is noticing something, falls when it is not. */
  awareness!: number;
  target!: Threat | null;
  home!: THREE.Vector3;
  leash!: number;
  patrol!: PatrolRoute | null;
  pack!: EnemyPack | null;
  packRole!: PackRole;
  /** Bearing on the pack's ring, radians. */
  slotAngle!: number;

  /* ---- combat ---------------------------------------------------- */
  attacks!: EnemyAttack[];
  /** The attack currently being performed. */
  attack!: EnemyAttack | null;
  attackId!: string | null;
  attackRange!: number;
  attackCooldown!: number;
  speed!: number;
  /** Ground speed this frame — the gait reads its stride off it. */
  moveSpeed!: number;

  /* ---- owned by the encounter layer ------------------------------ */
  /**
   * Set from outside, by whatever spawned this instance. Declared here
   * because a pooled instance must have them cleared on despawn, which is
   * `Enemies.despawn`'s job and impossible to get right if they are invisible.
   */
  spawnedBy!: string | null;
  /** Territory id, set by `EncounterDirector`. */
  territory!: string | null;
  /** Hunt quest id, set by `EncounterDirector`; `HuntRuntime` matches on it. */
  hunt!: string | null;
  /** The drop table has already paid out. */
  _looted!: boolean;
  /** Corpse survives `corpseLinger` — a boss stays on the field. */
  keepCorpse!: boolean;
  /**
   * Seconds left on Ignis' Analyse read; everything hits a read target 15%
   * harder. Written by `characters/ai/Techniques.analyse`, decayed by
   * `EncounterDirector`, read by `PartyAI.strike`. Declared here for the same
   * reason as the fields above: it outlives a despawn, and `despawn()` does
   * **not** clear it, so a pooled instance comes back still analysed.
   */
  analysed!: number;
  /**
   * The ailment a crafted flask inflicted, and when it lapses. Written by
   * `CombatSystem._applySpellEffects` and **read by nothing** — see the fuller
   * note on `CombatTarget.status`, which narrows this. Optional because the
   * write is the field's only trace: an enemy that has never been hit by a
   * status catalyst does not carry the key at all.
   */
  status?: { kind: string, until: number } | null;
  /**
   * Set for the length of a boss' recovery window, when the fight is wide
   * open: `CombatSystem.resolve` multiplies the stagger term by 1.5 while it
   * is true. Written only by `BossFight.update`, which is why it is optional —
   * an enemy that has never been a boss does not carry the key at all.
   * `despawn()` does **not** clear it, like the two fields above.
   */
  vulnerable?: boolean;
  /**
   * Seconds this trooper has been falling out of a dropship's bay. Written,
   * read and finished with entirely inside `encounters/Dropship.ts`; absent
   * until the bay opens, which is how the drop loop tells who is still inside.
   */
  _fall?: number;
  /** Seconds this member has waited for an engage token. Owned by `Pack`. */
  _waited!: number;

  /* ---- internals ------------------------------------------------- */
  _dt!: number;
  _kb!: THREE.Vector3 | null;
  _atkCooldown!: number;
  _lostTimer!: number;
  /** Rounds left before {@link StrikeSpec.reload}; per attack id. */
  _mag!: Map<string, number>;
  /** Seconds this shooter has been settled on its current target. */
  _settled!: number;
  /** True while head-down reloading — the window the player is meant to use. */
  reloading!: boolean;
  _roleTimer!: number;
  _senseTimer!: number;
  _strafeDir!: number;
  _swung!: boolean;
  _wanderAngle!: number;
  _wanderTimer!: number;

  constructor(type: SpeciesDef, opts: SpawnOpts = {}) {
    this.type = type;
    this.id = opts.id ?? 0;
    this.root = new THREE.Group();
    this.velocity = new THREE.Vector3();
    this.heading = opts.heading ?? 0;

    const s = type.stats;
    this.baseMaxHp = s.hp;
    this.maxHp = opts.maxHp ?? s.hp;
    this.hp = this.maxHp;
    this.maxPoise = s.poise;
    this.poise = this.maxPoise;
    this.speed = s.speed;
    this.attackRange = s.attackRange;
    this.aggroRange = s.aggroRange;
    this.radius = s.radius;
    this.height = s.height;
    this.damage = s.damage;
    this.scale = opts.scale ?? 1;
    this.level = opts.level ?? s.level;
    this.name = opts.name || s.name;

    /** 'beast' | 'daemon' | 'imperial' — drives spawn windows and light weakness. */
    this.faction = type.faction;
    /** EXP bucket read by `Stats.expForKill`. */
    this.expClass = opts.expClass || type.expClass;
    /** Stable id the quest log matches kill objectives against. */
    this.speciesId = type.questId || type.key;

    this.state = 'idle';
    this.stateTime = 0;
    this.phase = 0;              // animation phase, seconds
    this.target = null;
    this.dead = false;
    this.staggered = false;
    this.staggerTime = 0;
    this.flinchTime = 0;
    this.attackCooldown = opts.cooldown ?? 1.2;
    this.locked = false;         // player has lock-on
    this.frozenPose = null;      // scenario override
    this.corpseTime = 0;

    /* ---- perception / territory ------------------------------------- */
    const sense = type.senses;
    this.sight = sense.sight ?? s.aggroRange;
    this.fov = sense.fov ?? 1.9;               // half-angle, radians
    this.hearing = sense.hearing ?? 12;
    this.nocturnal = sense.nocturnal ?? (type.faction === 'daemon');
    /** Rises while the enemy is noticing something, falls when it is not. */
    this.awareness = 0;
    this.home = new THREE.Vector3();
    this.leash = opts.leash ?? 44;
    this.patrol = null;          // {points:[Vector3], index, wait, waitTimer}
    this.packRole = 'engage';
    this.slotAngle = 0;
    this.pack = null;
    this._senseTimer = (this.id % 7) * 0.037;
    this._roleTimer = 0;
    this._lostTimer = 0;
    this._strafeDir = (this.id % 2) ? 1 : -1;
    this._wanderTimer = 0;
    this._wanderAngle = 0;

    /* ---- attacks ----------------------------------------------------- */
    this.attacks = type.attacks;
    this.attack = null;          // the attack currently being performed
    this.attackId = null;
    this._swung = false;
    this._atkCooldown = 0;
    this._mag = new Map();
    this._settled = 0;
    this.reloading = false;

    this.boss = !!type.boss;
    this.phaseIndex = 0;         // boss phase, driven by BossFight
    this.invulnerable = false;
    this.superArmour = !!type.superArmour;

    this.mesh = null;
    this.killer = null;
    this._kb = null;
    this.airborne = false;
    this.moveSpeed = 0;
    this.hitPower = 0;
    this.lastHitAt = 0;
    this.flinchTime = 0;
    this.flinchDir = new THREE.Vector3(0, 0, 1);
    this.deathPush = 0;
    this.deathSide = 1;
    this._dt = 0;
    this._waited = 0;
    this.spawnedBy = null;
    this.territory = null;
    this.hunt = null;
    this._looted = false;
    this.keepCorpse = false;
    this.analysed = 0;
  }

  get position() { return this.root.position; }

  /** Fraction of max HP remaining, 0..1. */
  get hpFraction() { return this.maxHp > 0 ? this.hp / this.maxHp : 0; }

  /** Instantiate the shared prototype for this enemy. */
  attachVisual(proto: EnemyPrototype) {
    const group = cloneSkinned(proto.group);
    const byName = new Map<string, THREE.Bone>(), rest = new Map<string, THREE.Quaternion>();
    const skinned: THREE.SkinnedMesh[] = [];
    group.traverse((o) => {
      if (isBone(o)) { byName.set(o.name, o); rest.set(o.name, o.quaternion.clone()); }
      if (isSkinnedMesh(o)) skinned.push(o);
    });
    const mesh = skinned[0] ?? null;
    if (mesh) { mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; }
    this.rig = { byName, rest };
    this.mesh = mesh;
    this.visual = group;
    group.scale.setScalar(this.scale);
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);
    this.root.add(group);
    /**
     * Shared animation state — gait phase, solved leg chains, impact springs.
     * `setupAnim()` is where a species declares its legs and spine; species
     * that do not override it simply get the additive impact layer.
     */
    this.anim = new CreatureAnim(this);
    this.setupAnim(this.anim);
    return group;
  }

  /** Species hook: register leg chains and the trunk for the impact layer. */
  setupAnim(anim: CreatureAnim) {
    const has = (n: string) => this.rig.byName.has(n);
    const trunk = ['hips', 'pelvis', 'spine', 'spineA', 'spineB', 'chest', 'core', 'pod', 'neck', 'head'];
    anim.setTrunk(trunk.filter(has));
  }

  /** Reset a pooled instance back to a spawnable state. */
  reset(opts: SpawnOpts = {}) {
    this.maxHp = opts.maxHp ?? this.baseMaxHp;
    this.hp = this.maxHp;
    this.poise = this.maxPoise;
    this.level = opts.level ?? this.type.stats.level;
    this.damage = opts.damage ?? this.type.stats.damage;
    this.dead = false;
    this.staggered = false;
    this.corpseTime = 0;
    this.awareness = 0;
    this.target = null;
    this.pack = null;
    this.patrol = null;
    this.attack = null;
    this.attackId = null;
    this.invulnerable = false;
    this.frozenPose = null;
    this.phaseIndex = 0;
    this.setState('idle');
    this.stateTime = 0;
    this.hitPower = 0;
    this.restBones();
    if (this._kb) this._kb.set(0, 0, 0);
    if (this.anim) {
      for (const s of [this.anim.hitPitch, this.anim.hitRoll, this.anim.hitYaw, this.anim.pushZ, this.anim.pushX]) s.reset();
      this.anim.hitAmount = 0;
      this.anim.shake = 0;
      this.anim.airborne = false;
      this.anim.bodyY = this.anim.bodyRoll = this.anim.bodyPitch = 0;
    }
    if (this.visual) {
      this.visual.rotation.set(0, 0, 0);
      this.visual.position.set(0, 0, 0);
      this.visual.visible = true;
      this.visual.scale.setScalar(this.scale);
    }
    return this;
  }

  /**
   * Put every bone back in its bind rotation.
   *
   * `pose()` only writes the bones it cares about, so whatever the previous
   * pose left in the others carries over. That is usually wanted — a goblin's
   * attack deliberately keeps the crouch its telegraph put in the legs — but
   * it is wrong across a *discontinuity*: a pooled sabertusk respawning must
   * not begin life folded into the corpse the last one died in, a corpse must
   * not inherit the bent ankles of the stagger that preceded it, and a
   * screenshot pose must not depend on which pose the instance happened to
   * hold before it. Called at those four boundaries only, never per frame.
   */
  restBones() {
    if (!this.rig) return;
    for (const [name, bone] of this.rig.byName) {
      const r = this.rig.rest.get(name);
      if (r) bone.quaternion.copy(r);
    }
  }

  /** Centre of mass in world space — the point VFX and lock-on aim at. */
  centre(out = new THREE.Vector3()) {
    return out.set(this.root.position.x, this.root.position.y + this.height * 0.55 * this.scale, this.root.position.z);
  }

  /**
   * Lowest point the *skinned* body currently reaches, in metres relative to
   * the root — which sits on the terrain. Zero means the model is standing
   * exactly on the ground; negative is underground.
   *
   * Every vertex goes through `applyBoneTransform`: `Box3.setFromObject` on a
   * `SkinnedMesh` reads `geometry.boundingBox`, which is the *bind* pose, so
   * it cannot see a skeleton that has folded through the floor — the whole
   * question being asked here.
   *
   * Two passes, because a body is up to 50k vertices and this is asked a few
   * hundred times per species: a strided sweep to find roughly where the low
   * point is, then an exhaustive sweep of the vertices *around* it. Parts are
   * built one after another, so neighbouring indices are neighbouring
   * geometry and the refinement lands on the same foot the coarse pass found.
   * Strided sampling alone is not enough — it under-reports depth by up to
   * half a metre on a big machine, which is precisely the error it is being
   * used to correct.
   *
   * @returns metres; negative is underground
   */
  poseFloor(): number {
    if (!this.visual) return 0;
    this.root.updateMatrixWorld(true);
    const ry = this.root.matrixWorld.elements[13];
    const v = _calV;
    let minY = Infinity, bestIdx = 0, bestStep = 1;
    const best: THREE.Mesh[] = [];
    this.visual.traverse((o) => {
      if (!isMesh(o)) return;
      const pos = o.geometry.getAttribute('position');
      if (!pos) return;
      if (isSkinnedMesh(o) && o.skeleton) o.skeleton.update();
      const step = Math.max(1, Math.floor(pos.count / 900));
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i);
        if (isSkinnedMesh(o)) o.applyBoneTransform(i, v);
        v.applyMatrix4(o.matrixWorld);
        if (v.y < minY) { minY = v.y; best[0] = o; bestIdx = i; bestStep = step; }
      }
    });
    const bestObj = best[0];
    if (bestObj && bestStep > 1) {
      const pos = bestObj.geometry.getAttribute('position');
      const lo = Math.max(0, bestIdx - bestStep * 3);
      const hi = Math.min(pos.count, bestIdx + bestStep * 3);
      for (let i = lo; i < hi; i++) {
        v.fromBufferAttribute(pos, i);
        if (isSkinnedMesh(bestObj)) bestObj.applyBoneTransform(i, v);
        v.applyMatrix4(bestObj.matrixWorld);
        if (v.y < minY) minY = v.y;
      }
    }
    if (!isFinite(minY)) return 0;
    return minY - ry;
  }

  /**
   * Measure, once per species, how far each named pose actually reaches below
   * the ground, and cache the lift that puts it back on it.
   *
   * The poses that settle a body — a corpse going over, a stagger crouching —
   * were authored as a *downward translation* with a hand-picked constant:
   * `visual.position.y = -0.80 * e`. That is not a settle, it is a burial. The
   * body rotates about `visual`, which sits on the terrain, so the roll
   * already swings the model down through the floor; subtracting a constant on
   * top of it put fifteen corpses between 0.5 m and 1.3 m underground and the
   * magitek walker 1.7 m under during a stagger. A corpse lingers six seconds
   * in live combat, so this is visible in play, not only in captures.
   *
   * Constants also cannot be right for long: the offset a pose needs scales
   * with the creature's size and with its silhouette, so every sculpt change
   * invalidates every number. Measuring the model instead means the correction
   * follows the model. The pose runs at a spread of `stateTime` values and the
   * shortfall is stored as a curve, because the amount needed changes
   * throughout the pose and a single worst-case number would hold a corpse in
   * the air for the first half of its fall.
   *
   * Cheap: a few hundred vertices × twelve samples × a handful of poses, once
   * per species, on the frame that species first spawns.
   *
   * @param poses pose names to calibrate
   */
  calibrateGround(poses: readonly PoseName[] = GROUND_CAL_POSES) {
    if (this.type._groundCal || !this.rig || !this.visual) return;
    // A creature whose model deliberately continues below the ground has no
    // "foot" to measure — see `TITAN.buriedBase`.
    if (this.type.buriedBase) { this.type._groundCal = {}; return; }
    const cal: Record<string, Float64Array> = {};
    // Published before posing, so `groundLift()` reads zero for the pose it is
    // currently measuring and the measurement stays a measurement.
    this.type._groundCal = cal;

    const bones = [...this.rig.byName.values()];
    const saved = bones.map((b) => b.quaternion.clone());
    const savePos = this.visual.position.clone();
    const saveRot = this.visual.rotation.clone();
    const saveState = this.stateTime, savePhase = this.phase;
    const saveHit = this.hitPower;
    this.hitPower = 1;

    const saveAtk = this.attack, saveAtkId = this.attackId;
    for (const pose of poses) {
      // A telegraph and a strike are a different shape for every attack the
      // species owns, so each gets its own curve; `groundLift` prefers the
      // specific one and falls back to the generic.
      const cases: Array<{ key: string, atk: EnemyAttack | null }> = [{ key: pose, atk: null }];
      if (POSE_PER_ATTACK.has(pose)) {
        for (const a of this.attacks) cases.push({ key: `${pose}:${a.id}`, atk: a });
      }
      for (const { key, atk } of cases) {
        this.attack = atk;
        this.attackId = atk ? atk.id : null;
        const curve = new Float64Array(GROUND_CAL_T.length);
        let reaches = false;
        for (let i = 0; i < GROUND_CAL_T.length; i++) {
          this.stateTime = GROUND_CAL_T[i];
          this.phase = GROUND_CAL_T[i];
          // Same entry conditions the live and frozen paths give the pose, so
          // the number measured here is the number that will be needed there.
          this.restBones();
          this._resetVisual();
          this.pose(pose, this.phase, null);
          const lift = Math.max(0, -this.poseFloor() - GROUND_SINK) / (this.scale || 1);
          curve[i] = lift;
          if (lift > 1e-4) reaches = true;
        }
        if (reaches) cal[key] = curve;
      }
    }
    this.attack = saveAtk;
    this.attackId = saveAtkId;

    for (let i = 0; i < bones.length; i++) bones[i].quaternion.copy(saved[i]);
    this.visual.position.copy(savePos);
    this.visual.rotation.copy(saveRot);
    this.stateTime = saveState;
    this.phase = savePhase;
    this.hitPower = saveHit;
    this.root.updateMatrixWorld(true);
  }

  /**
   * Metres to add to `visual.position.y` so the named pose stands on the
   * ground at the current `stateTime`. Zero until `calibrateGround()` has run,
   * and zero for any pose that never reached below it.
   *
   * @param pose pose name, as passed to `pose()`
   */
  groundLift(pose: PoseName) {
    const cal = this.type._groundCal;
    if (!cal) return 0;
    const curve = (this.attackId && cal[`${pose}:${this.attackId}`]) || cal[pose];
    if (!curve) return 0;
    const T = GROUND_CAL_T;
    const t = this.stateTime;
    const s = this.scale || 1;
    if (t <= T[0]) return curve[0] * s;
    for (let i = 1; i < T.length; i++) {
      if (t <= T[i]) {
        const f = (t - T[i - 1]) / (T[i] - T[i - 1]);
        return (curve[i - 1] + (curve[i] - curve[i - 1]) * f) * s;
      }
    }
    return curve[T.length - 1] * s;
  }

  /**
   * Percent-of-damage-taken for an element. 100 = neutral, >100 weak,
   * <100 resistant, 0 immune. Feeds `Stats.computeDamage` unchanged.
   */
  resistance(element: Element) {
    const t = this.type;
    if (t.resistPct && t.resistPct[element] != null) return t.resistPct[element];
    if (t.weakness === element) return 160;
    if (t.resist === element) return 50;
    if (element === 'light' && this.faction === 'daemon') return 175;
    return 100;
  }

  /** Weapon classes this creature is soft against (`computeDamage`). */
  get weakTo(): readonly WeaponClass[] { return this.type.weakTo ?? NO_WEAPONS; }
  /** Weapon classes that bounce off it. */
  get resistsWeapon(): readonly WeaponClass[] { return this.type.resistsWeapon ?? NO_WEAPONS; }
  /** Stagger multiplier the damage formula uses. */
  get staggerMult() { return this.staggered ? 2.0 : (this.state === 'telegraph' ? 1.25 : 1); }
  /**
   * Physical mitigation, so `computeDamage` has something to bite on.
   *
   * Derived from level alone. These used to read `this.type.defense` and
   * `this.type.magicDefense` on top — fields **no species has ever declared**,
   * so the term was always zero. Removed rather than declared: a per-species
   * mitigation knob nobody has used is a knob to add when it is wanted, not a
   * `|| 0` that makes it look as though it already exists.
   */
  get defense() { return Math.round(8 + this.level * 3.1); }
  get magicDefense() { return Math.round(6 + this.level * 2.6); }

  /**
   * Apply damage. Returns a result the combat system turns into events.
   * @param dir world-space direction of the blow
   * @param o {poise, blindside, element, weaponClass, noFlinch}
   */
  hit(amount: number, dir: THREE.Vector3, o: HitOpts = {}): HitResult | null {
    if (this.dead || this.invulnerable) return null;
    let dmg = amount;
    if (o.blindside) dmg *= 1.35;

    const el = o.element || 'physical';
    if (el !== 'physical') dmg *= this.resistance(el) / 100;
    if (o.weaponClass) {
      if (this.weakTo.includes(o.weaponClass)) dmg *= 1.4;
      else if (this.resistsWeapon.includes(o.weaponClass)) dmg *= 0.6;
    }
    if (this.staggered) dmg *= 1.7;
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;

    let staggered = false;
    if (!this.superArmour || this.hp <= this.maxHp * 0.35) {
      this.poise -= (o.poise ?? 10);
      if (this.poise <= 0) {
        this.poise = this.maxPoise;
        staggered = true;
        this.staggered = true;
        this.staggerTime = this.type.staggerDuration || 2.4;
        this._endAttack();
        this.restBones();
        this.setState('stagger');
      } else if (this.state !== 'stagger' && !o.noFlinch && !this.superArmour
        && this.state !== 'attack' && this.state !== 'telegraph') {
        this.setState('flinch');
      }
    }
    this.flinchDir = dir ? dir.clone().normalize() : new THREE.Vector3(0, 0, 1);

    /* ---- physical reaction ------------------------------------------- */
    // Severity is a blend of how big the hit was relative to this creature's
    // own health pool and how much poise it broke — a chip of a Titan must not
    // rock it the way the same number rocks a sabertusk.
    const frac = dmg / Math.max(1, this.maxHp);
    let power = Math.min(1.6, frac * 9 + (o.poise ?? 10) / 55);
    if (staggered) power = Math.max(power, 1.15);
    if (this.superArmour) power *= 0.35;
    this.hitPower = power;
    if (this.anim) this.anim.impact(this.flinchDir, power, this.heading);
    // knockback: a slide the creature has to arrest, not a teleport
    const kb = Math.min(KNOCKBACK_CAP, power * (staggered ? 3.2 : 1.5)) / (1 + this.radius * 0.9);
    if (kb > 0.05) {
      this._kb = this._kb || new THREE.Vector3();
      this._kb.copy(this.flinchDir).setY(0).normalize().multiplyScalar(kb);
    }
    this.lastHitAt = this.phase;

    // being hit is the loudest possible cue
    if (!this.target && o.source) this.target = o.source;
    this.awareness = 1;
    if (this.state === 'idle' || this.state === 'patrol' || this.state === 'sleep' || this.state === 'alert') {
      this.setState('chase');
    }

    if (this.hp <= 0) { this.hp = 0; this.die(o.killer || null); }
    return {
      enemy: this, damage: dmg, staggered, killed: this.dead,
      crit: !!o.blindside, element: o.element || null,
    };
  }

  die(killer: Threat | null = null) {
    this.dead = true;
    this.killer = killer;
    this.invulnerable = true;
    this.corpseTime = 0;
    this.attack = null;
    this.restBones();
    /**
     * Which way the corpse goes down. A death that always folds the same way
     * looks scripted; taking the side from the killing blow means the same
     * animation reads differently every time.
     */
    const d = this.flinchDir || new THREE.Vector3(0, 0, 1);
    const cs = Math.cos(-this.heading), sn = Math.sin(-this.heading);
    this.deathSide = (d.x * cs - d.z * sn) >= 0 ? 1 : -1;
    this.deathPush = d.x * sn + d.z * cs;   // +1 hit from the front, -1 from behind
    this.setState('death');
    if (this.pack) this.pack.onDeath(this);
  }

  setState(s: AiState) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
  }

  /* ------------------------------------------------------------ senses */

  /**
   * Can this enemy perceive `t` right now? Sight is a cone, narrowed at
   * night for daylight animals and widened for daemons; hearing is a plain
   * radius scaled by how fast the target is moving.
   * @param t something with `.position` and optional `.speed`
   */
  perceives(t: Threat, ctx: EnemyCtx | null) {
    const p = threatPos(t);
    if (!p) return 0;
    const dx = p.x - this.root.position.x, dz = p.z - this.root.position.z;
    const d2 = dx * dx + dz * dz;
    const night = ctx && ctx.night ? ctx.night : 0;
    const sightRange = this.sight * (this.nocturnal ? 1 + night * 0.45 : 1 - night * 0.3);
    if (d2 < sightRange * sightRange) {
      const d = Math.sqrt(d2) || 1e-4;
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const dot = (dx / d) * fx + (dz / d) * fz;
      // very close range is felt, not seen
      if (d < this.radius * 3 + 2.5 || dot > Math.cos(this.fov)) {
        const seen = THREE.MathUtils.clamp(1.6 - d / sightRange, 0.25, 1);
        return seen * this._concealFactor(t, p, d, ctx);
      }
    }
    const noise = t.speed != null ? THREE.MathUtils.clamp(t.speed / 5, 0.25, 1.4) : 0.8;
    const hear = this.hearing * noise;
    if (d2 < hear * hear) return 0.45;
    return 0;
  }

  /**
   * How much the vegetation at the target's feet hides it from *sight*.
   * 1 is fully exposed, 0 fully hidden.
   *
   * Three terms, each of them a rule the genre already obeys:
   *
   * - **Cover only helps at range.** Inside the "felt, not seen" radius it does
   *   nothing; it ramps in over the next fifteen metres or so. Grass does not
   *   hide someone standing on top of you.
   * - **Moving gives you away.** Concealment scales down with the target's
   *   speed and is gone by a run. Thrashing vegetation is *more* visible than
   *   still vegetation, which is why the walk-and-stop rhythm is the whole
   *   texture of stalking.
   * - **It never reaches zero.** Capped so a target in the deepest grass is
   *   still eventually noticed; an enemy that can be permanently blinded by
   *   standing in a bush is a bug, not a stealth system.
   *
   * Hearing is deliberately untouched. You can hear someone in long grass, and
   * in fact rather better.
   */
  _concealFactor(t: Threat, p: THREE.Vector3, d: number, ctx: EnemyCtx | null) {
    const at = ctx && ctx.concealment;
    if (!at) return 1;
    const cover = THREE.MathUtils.clamp(at(p.x, p.z), 0, 1);
    if (cover <= 0) return 1;
    const nearR = this.radius * 3 + 2.5;
    const ranged = THREE.MathUtils.clamp((d - nearR) / 15, 0, 1);
    const still = t.speed != null ? THREE.MathUtils.clamp(1 - t.speed / 3.4, 0, 1) : 0.6;
    return 1 - MAX_CONCEALMENT * cover * ranged * still;
  }

  /* ------------------------------------------------------------ combat */

  /** Pick the next attack whose range covers `dist`, weighted. */
  _chooseAttack(dist: number, rng: (() => number) | null) {
    const list = this.attacks;
    if (!list || !list.length) return null;
    let total = 0;
    for (const a of list) {
      if (a.phase != null && a.phase > this.phaseIndex) continue;
      if (dist > (a.range || this.attackRange) * this.scale) continue;
      if (a.minRange && dist < a.minRange * this.scale) continue;
      total += a.weight || 1;
    }
    if (total <= 0) return null;
    let r = (rng ? rng() : Math.random()) * total;
    for (const a of list) {
      if (a.phase != null && a.phase > this.phaseIndex) continue;
      if (dist > (a.range || this.attackRange) * this.scale) continue;
      if (a.minRange && dist < a.minRange * this.scale) continue;
      r -= (a.weight || 1);
      if (r <= 0) return a;
    }
    return null;
  }

  /** Longest range any currently usable attack reaches. */
  get reach() {
    if (!this.attacks) return this.attackRange * this.scale;
    let m = 0;
    for (const a of this.attacks) {
      if (a.phase != null && a.phase > this.phaseIndex) continue;
      m = Math.max(m, (a.range || this.attackRange));
    }
    return (m || this.attackRange) * this.scale;
  }

  /**
   * The distance this creature actually wants to fight at — the range of its
   * *shortest* attack, not its longest. Without this a melee enemy parks at
   * the edge of its leap range and swings at nothing.
   *
   * **Unless it has a gun.** Taking the shortest attack unconditionally meant
   * an MT soldier stationed at its *bayonet's* 2.6 m and its rifle was
   * decoration: measured over 15 s of live fight, 18 bayonet strikes against 2
   * volleys. A firefight cannot have a rhythm if the shooter closes to melee
   * inside the first burst, so the whole of Wave 4's cover-and-fire model was
   * running on a tenth of the attacks and nobody had counted.
   *
   * So a shooter stations in its shortest *ranged* band instead. The melee is
   * not removed and is still chosen when the player closes into it — that is
   * the answer to being rushed, which is what a bayonet is for.
   */
  get fightRange() {
    if (!this.attacks || !this.attacks.length) return this.attackRange * this.scale;
    let m = Infinity, r = Infinity;
    for (const a of this.attacks) {
      if (a.phase != null && a.phase > this.phaseIndex) continue;
      if (a.lunge) continue;                     // a leap is an opener, not a station
      const range = a.range || this.attackRange;
      m = Math.min(m, range);
      if (a.ranged) r = Math.min(r, range);
    }
    if (Number.isFinite(r)) m = r;
    if (!Number.isFinite(m)) m = this.reach / this.scale;
    return m * this.scale;
  }

  _beginAttack(a: EnemyAttack | null) {
    this.attack = a;
    this.attackId = a ? a.id : null;
    this._swung = false;
    // A fresh wind-up is a fresh aim: the settle clock starts here, so a
    // shooter that has just re-acquired shoots worse than one that has been
    // holding the same lane. That is the term the player is playing against
    // when they break line and re-enter somewhere else.
    this._settled = 0;
    this.setState('telegraph');
  }

  /**
   * Take a round out of the magazine; true when that emptied it.
   *
   * Per attack id rather than per enemy: a sniper's rifle and its sidearm are
   * not one magazine, and keying it on the enemy would make switching attacks a
   * free reload.
   */
  _spendRound(a: EnemyAttack): boolean {
    if (!a.ranged || !a.magazine) return false;
    const id = a.id || 'anon';
    const left = (this._mag.get(id) ?? a.magazine) - 1;
    this._mag.set(id, left > 0 ? left : a.magazine);
    return left <= 0;
  }

  _endAttack() {
    this.attack = null;
    this.attackId = null;
    this._swung = false;
  }

  /** Timing for the current attack, falling back to the legacy table. */
  _timing(field: keyof AttackTiming): number {
    const own = this.attack ? this.attack[field] : undefined;
    if (own != null) return own;
    const t = this.type.timing;
    return t[field] != null ? t[field] : DEFAULT_TIMING[field];
  }

  /* -------------------------------------------------------------- tick */

  /**
   * @param ctx {terrain, player, allies, others, night, onStrike, rng}
   */
  update(dt: number, ctx: EnemyCtx) {
    this.stateTime += dt;
    this.phase += dt;
    /** Frame delta, so `pose()` can advance stride phase and springs. */
    this._dt = dt;
    if (this.frozenPose) return;
    if (this._atkCooldown > 0) {
      this._atkCooldown -= dt;
      if (this._atkCooldown <= 0) this.reloading = false;
    }
    this.moveSpeed = 0;

    if (this.dead) {
      this.corpseTime += dt;
      if (ctx && ctx.terrain) {
        this.root.position.y = ctx.terrain.heightAt(this.root.position.x, this.root.position.z);
      }
      this._slide(dt, ctx);
      this._resetVisual();
      this.pose('death', this.phase, ctx);
      this.visual.position.y += this.groundLift('death');
      this._postPose(dt);
      return;
    }

    if (this.staggered) {
      this.staggerTime -= dt;
      if (this.staggerTime <= 0) { this.staggered = false; this.setState('chase'); }
    }

    this._sense(dt, ctx);

    const target = this.target;
    const tp = threatPos(target);
    const dist = tp ? Math.hypot(tp.x - this.root.position.x, tp.z - this.root.position.z) : Infinity;

    switch (this.state) {
      case 'sleep': break;
      case 'idle': this._tickIdle(dt, ctx); break;
      case 'patrol': this._tickPatrol(dt, ctx); break;
      case 'alert': this._tickAlert(dt, ctx, tp); break;
      case 'return': this._tickReturn(dt, ctx); break;
      case 'chase':
      case 'approach': this._tickChase(dt, ctx, target, tp, dist); break;
      case 'strafe': this._tickStrafe(dt, ctx, target, tp, dist); break;
      case 'telegraph': this._tickTelegraph(dt, ctx, tp, dist); break;
      case 'attack': this._tickAttack(dt, ctx, target, tp, dist); break;
      case 'recover':
        this._face(tp, dt, 2.0);
        if (this.stateTime > this._timing('recover')) {
          this._endAttack();
          this.setState(target ? 'strafe' : 'return');
        }
        break;
      case 'flinch':
        if (this.stateTime > 0.35) this.setState(target ? 'chase' : 'idle');
        break;
      case 'stagger':
        if (!this.staggered) this.setState(target ? 'chase' : 'idle');
        break;
      default: this.setState('idle'); break;
    }

    this._slide(dt, ctx);

    // terrain follow
    if (ctx && ctx.terrain) {
      const gy = ctx.terrain.heightAt(this.root.position.x, this.root.position.z);
      this.root.position.y = this.airborne ? Math.max(gy, this.root.position.y) : gy;
    }
    this.root.rotation.y = this.heading;
    const pose = POSE_MAP[this.state] ?? 'idle';
    this._resetVisual();
    this.pose(pose, this.phase, ctx);
    this.visual.position.y += this.groundLift(pose);
    this._postPose(dt);
  }

  /**
   * Clear the body transform so every `pose()` authors it from zero.
   *
   * This is unconditional on purpose. It used to be opt-in per species
   * (`autoResetVisual`), on the theory that the older assign-style species
   * carried state across frames and must not be reset under them — but they
   * assign `visual.position`/`rotation` outright in every branch, so a reset
   * to zero is invisible to them, while the newer base classes write
   * `visual.position.y -= drop` and are only correct *because* of it. An
   * opt-in reset means the two conventions coexist and the wrong one silently
   * integrates: hold a `-=` pose for N frames without a reset and the
   * creature sinks N × drop metres. Making it universal is what makes that
   * class of bug impossible rather than merely unlikely.
   */
  _resetVisual() {
    if (!this.visual) return;
    this.visual.position.set(0, 0, 0);
    this.visual.rotation.set(0, 0, 0);
    if (this.anim) { this.anim.bodyY = 0; this.anim.bodyRoll = 0; this.anim.bodyPitch = 0; }
  }

  /**
   * Knockback decay. Being hit shoves a creature and it has to dig in and stop
   * — that friction is a large part of why a hit reads as having landed.
   */
  _slide(dt: number, ctx: EnemyCtx) {
    const kb = this._kb;
    if (!kb || kb.lengthSq() < 1e-5) return;
    this.root.position.x += kb.x * dt;
    this.root.position.z += kb.z * dt;
    kb.multiplyScalar(Math.max(0, 1 - dt * (this.dead ? 5.5 : 9)));
    if (kb.lengthSq() < 1e-5) kb.set(0, 0, 0);
  }

  /**
   * Additive layer applied after the species pose: impact springs whipping
   * through the spine, the gait's vertical bounce, and the residual shove.
   */
  _postPose(dt: number) {
    const a = this.anim;
    if (!a || !this.rig) return;
    a.commit(dt, (name: string, x: number, y: number, z: number) => {
      const b = this.rig.byName.get(name);
      if (!b) return;
      _addEuler.set(x, y, z, 'XYZ');
      _addQ.setFromEuler(_addEuler);
      b.quaternion.multiply(_addQ);
    });
    const v = this.visual;
    if (!v) return;
    if (a.bodyY) v.position.y += a.bodyY;
    if (a.bodyRoll || a.bodyPitch) {
      v.rotation.z += a.bodyRoll;
      v.rotation.x += a.bodyPitch;
    }
    const p = a.pushLocal;
    if (p && (p.x || p.z)) { v.position.x += p.x; v.position.z += p.z; }
  }

  /** Notice things, lose interest in things. */
  _sense(dt: number, ctx: EnemyCtx) {
    this._senseTimer -= dt;
    if (this._senseTimer > 0) return;
    this._senseTimer = 0.22;
    const step = 0.22;

    if (this.state === 'sleep') {
      // daemons sleep by day, beasts by night — until something walks into them
      const wake = this.nocturnal ? (ctx.night > 0.05) : (ctx.night < 0.4);
      if (wake) this.setState('patrol');
      else {
        const pp = threatPos(ctx.player);
        if (pp && this.root.position.distanceTo(pp) < 6) this.setState('alert');
      }
      return;
    }

    let best: Threat | null = null, bestScore = 0;
    const cands: readonly Threat[] = ctx.threats ?? (ctx.player ? [ctx.player] : NO_THREATS);
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      if (!c || c.downed) continue;
      // Noctis is the fight. Companions only pull aggro when they are much
      // closer, or when Gladio has deliberately taken it with Coverage.
      const score = this.perceives(c, ctx) * (c.threatWeight != null ? c.threatWeight : 1);
      if (score > bestScore) { bestScore = score; best = c; }
    }

    if (best) {
      this.awareness = Math.min(1, this.awareness + bestScore * step * 3.2);
      this.target = best;
      this._lostTimer = 0;
      if (this.awareness >= 0.55 && (this.state === 'idle' || this.state === 'patrol' || this.state === 'alert')) {
        this.setState('chase');
        if (this.pack) this.pack.alert(this, best);
      } else if (this.awareness > 0.12 && (this.state === 'idle' || this.state === 'patrol')) {
        this.setState('alert');
      }
    } else {
      this.awareness = Math.max(0, this.awareness - step * 0.45);
      if (this.inCombat) {
        this._lostTimer += step;
        if (this._lostTimer > 8) this._giveUp();
      } else if (this.state === 'alert' && this.awareness <= 0.02) {
        this.setState('patrol');
      }
    }

    // leashing: never chase forever
    if (this.inCombat && this.home.lengthSq() > 0) {
      const dh = Math.hypot(this.root.position.x - this.home.x, this.root.position.z - this.home.z);
      if (dh > this.leash) this._giveUp();
    }
  }

  /** True while this enemy is actively pursuing or attacking something. */
  get inCombat() {
    const s = this.state;
    return s === 'chase' || s === 'approach' || s === 'strafe'
      || s === 'telegraph' || s === 'attack' || s === 'recover';
  }

  /**
   * True while this enemy counts as part of a live fight. Wider than
   * `inCombat`: an enemy reeling from a hit has not stopped fighting, it is
   * just not in a position to act — the encounter must not declare victory
   * over something that is mid-stagger.
   */
  get fighting() {
    return this.inCombat || this.state === 'flinch' || this.state === 'stagger';
  }

  _giveUp() {
    this.target = null;
    this.awareness = 0;
    this._lostTimer = 0;
    this._endAttack();
    this.setState('return');
  }

  _tickIdle(dt: number, _ctx: EnemyCtx) {
    if (this.patrol) { this.setState('patrol'); return; }
    this._wanderTimer -= dt;
    if (this._wanderTimer <= 0) {
      this._wanderTimer = 3 + (this.id % 5);
      this._wanderAngle = this.heading + ((this.id * 37 % 100) / 100 - 0.5) * 2.2;
    }
    this.heading += (this._wanderAngle - this.heading) * Math.min(1, dt * 0.8);
  }

  _tickPatrol(dt: number, ctx: EnemyCtx) {
    const p = this.patrol;
    if (!p || !p.points.length) { this.setState('idle'); return; }
    const wp = p.points[p.index % p.points.length];
    const dx = wp.x - this.root.position.x, dz = wp.z - this.root.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.2) {
      p.waitTimer -= dt;
      if (p.waitTimer <= 0) { p.index++; p.waitTimer = p.wait; }
      this._tickIdle(dt, ctx);
      return;
    }
    this._face(wp, dt, 2.4);
    this._move(dt, dx / d, dz / d, this.speed * 0.32, ctx);
  }

  _tickAlert(dt: number, _ctx: EnemyCtx, tp: THREE.Vector3 | null) {
    // stand up, look toward whatever it was
    if (tp) this._face(tp, dt, 3.0);
    if (this.stateTime > 4.5 && this.awareness < 0.2) this.setState('patrol');
  }

  _tickReturn(dt: number, ctx: EnemyCtx) {
    if (this.home.lengthSq() === 0) { this.setState('idle'); return; }
    const dx = this.home.x - this.root.position.x, dz = this.home.z - this.root.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.5) { this.setState(this.patrol ? 'patrol' : 'idle'); return; }
    this._face(this.home, dt, 3.0);
    this._move(dt, dx / d, dz / d, this.speed * 0.55, ctx);
  }

  _tickChase(dt: number, ctx: EnemyCtx, target: Threat | null, tp: THREE.Vector3 | null, dist: number) {
    if (!target || !tp) { this.setState('return'); return; }
    this._role(dt);
    this._face(tp, dt, 5);

    const want = this.fightRange * 0.85;
    if (this.packRole === 'engage' && this._atkCooldown <= 0 && dist <= this.reach) {
      const a = this._chooseAttack(dist, ctx.rng);
      if (a) { this._beginAttack(a); return; }
    }
    if (this.packRole !== 'engage' && dist < want * 1.4) { this.setState('strafe'); return; }

    // Everyone closes along their own bearing, not down the same line: the
    // attackers come in on their slot, the flankers hold the ring on theirs.
    // That is the whole difference between a pack and a queue.
    const r = this.packRole === 'engage'
      ? want * 0.7
      : want * 1.6 + this.radius * this.scale;
    const gx = tp.x + Math.sin(this.slotAngle) * r;
    const gz = tp.z + Math.cos(this.slotAngle) * r;
    const dx = gx - this.root.position.x, dz = gz - this.root.position.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d < 0.6) { this.setState('strafe'); return; }
    this._move(dt, dx / d, dz / d, this.speed, ctx);
  }

  /** Circle the target waiting for a turn. This is what stops the conga line. */
  _tickStrafe(dt: number, ctx: EnemyCtx, target: Threat | null, tp: THREE.Vector3 | null, dist: number) {
    if (!target || !tp) { this.setState('return'); return; }
    this._role(dt);
    this._face(tp, dt, 4.5);
    const want = this.fightRange * 0.85;
    if (this.packRole === 'engage' && this._atkCooldown <= 0) {
      if (dist <= this.reach) {
        const a = this._chooseAttack(dist, ctx.rng);
        if (a) { this._beginAttack(a); return; }
      }
      this.setState('chase');
      return;
    }
    if (dist > want * 2.6 + 4) { this.setState('chase'); return; }

    // Head down, so get into something. This is MGS5's "cover scored as
    // *between* self and threat", built on the concealment sampler rather than
    // on an obstacle graph the enemies do not have and should not grow: what
    // makes a spot good is that it hides you from where the shot is coming
    // from, and vegetation cover already answers exactly that question, with
    // the same law perception uses.
    //
    // It runs only while reloading on purpose. A shooter that seeks cover
    // whenever it can never presents a shot, and a firefight where nobody is
    // ever exposed is not a rhythm, it is a stalemate. The reload is when
    // being in the open is *expensive*, so it is when moving is worth the
    // animation.
    if (this.reloading && ctx.concealment) {
      const at = ctx.concealment;
      const p = this.root.position;
      const lx = (p.x - tp.x) / Math.max(dist, 1e-3), lz = (p.z - tp.z) / Math.max(dist, 1e-3);
      let bx = 0, bz = 0, best = at(p.x, p.z) + 0.05;   // hysteresis: staying put wins ties
      for (let i = 0; i < 6; i++) {
        const ang = this.slotAngle * 0.7 + (i / 6) * Math.PI * 2;
        const cx = p.x + Math.sin(ang) * 6.5, cz = p.z + Math.cos(ang) * 6.5;
        // Cover you have to cross the shooter's line to reach is not cover.
        const away = (Math.sin(ang) * lx + Math.cos(ang) * lz) * 0.5 + 0.5;
        const score = at(cx, cz) * (0.55 + 0.45 * away);
        if (score > best) { best = score; bx = cx - p.x; bz = cz - p.z; }
      }
      const bl = Math.hypot(bx, bz);
      if (bl > 0.35) { this._move(dt, bx / bl, bz / bl, this.speed * 0.9, ctx); return; }
    }

    // Hold the assigned bearing on the ring, and let the whole ring rotate
    // slowly, so the pressure on the player keeps coming from a new angle.
    this.slotAngle += this._strafeDir * dt * 0.45;
    const ring = want * 1.5 + this.radius * this.scale;
    const gx = tp.x + Math.sin(this.slotAngle) * ring;
    const gz = tp.z + Math.cos(this.slotAngle) * ring;
    const dx = gx - this.root.position.x, dz = gz - this.root.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.35) this._move(dt, dx / d, dz / d, this.speed * 0.62, ctx);
    if (this.stateTime > 4.5) { this._strafeDir *= -1; this.stateTime = 0; }
  }

  _tickTelegraph(dt: number, ctx: EnemyCtx, tp: THREE.Vector3 | null, _dist: number) {
    const a = this.attack;
    this._settled += dt;
    this._face(tp, dt, a && a.tracking != null ? a.tracking : 2.4);
    // There used to be an `a.approachDuring` branch here that closed the
    // distance through the wind-up. **No attack in the bestiary declares that
    // field**, so it has never run; it is gone rather than declared, because a
    // telegraph that walks is a design decision to take deliberately.
    if (this.stateTime > this._timing('telegraph')) this.setState('attack');
  }

  _tickAttack(dt: number, ctx: EnemyCtx, _target: Threat | null, _tp: THREE.Vector3 | null, _dist: number) {
    const a = this.attack;
    // a lunge carries all the way through the active window, decaying, so a
    // leap actually arrives instead of stopping short of its own target
    if (a && a.lunge) {
      const T = this._timing('attack');
      const k = Math.max(0, 1 - this.stateTime / Math.max(0.05, T));
      if (k > 0) {
        const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
        this._move(dt, fx, fz, a.lunge * k, ctx, true);
      }
    }
    if (!this._swung && this.stateTime > this._timing('strike')) {
      this._swung = true;
      if (ctx && ctx.onStrike) ctx.onStrike(this, a);
      else if (ctx && ctx.onEnemyStrike) ctx.onEnemyStrike(this);
    }
    if (this.stateTime > this._timing('attack')) {
      const dry = a ? this._spendRound(a) : false;
      // Head down. Long enough to be worth crossing ground for, and long
      // enough that the player can *see* it is different from a burst rest --
      // a reload the same length as a cooldown is not a gap, it is a pause.
      this._atkCooldown = dry
        ? (a && a.reload != null ? a.reload : 3.0)
        : (a && a.cooldown != null ? a.cooldown : this.attackCooldown);
      this.reloading = dry;
      this.setState('recover');
    }
  }

  /** Ask the pack whether we hold the engage token. */
  _role(dt: number) {
    this._roleTimer -= dt;
    if (this._roleTimer > 0) return;
    this._roleTimer = 0.55;
    if (this.pack) this.pack.assign(this);
    else this.packRole = 'engage';
  }

  _face(p: THREE.Vector3 | null, dt: number, k = 6) {
    if (!p) return;
    const want = Math.atan2(p.x - this.root.position.x, p.z - this.root.position.z);
    let d = want - this.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.heading += d * Math.min(1, k * dt);
  }

  /** Move along a unit direction with pack separation. */
  _move(dt: number, nx: number, nz: number, sp: number, ctx: EnemyCtx, skipSeparation = false) {
    this.root.position.x += nx * sp * dt;
    this.root.position.z += nz * sp * dt;
    this.velocity.set(nx * sp, 0, nz * sp);
    // the gait reads its stride from ground speed, so record what we actually
    // travelled rather than what the AI intended
    this.moveSpeed = sp;
    if (skipSeparation || !ctx || !ctx.others) return;
    const others = ctx.others;
    for (let i = 0; i < others.length; i++) {
      const o = others[i];
      if (o === this || o.dead) continue;
      const ox = this.root.position.x - o.root.position.x;
      const oz = this.root.position.z - o.root.position.z;
      const d2 = ox * ox + oz * oz;
      const minD = (this.radius * this.scale + o.radius * o.scale) * 1.05;
      if (d2 < minD * minD && d2 > 1e-4) {
        const d = Math.sqrt(d2), push = (minD - d) * 2.4 * dt;
        this.root.position.x += (ox / d) * push;
        this.root.position.z += (oz / d) * push;
      }
    }
  }

  /**
   * Subclasses override. Called with the pose name, the stride/animation phase
   * and a per-frame context. A species that needs fewer of them simply
   * declares fewer parameters; the base does nothing at all, which is what an
   * unrigged or still-being-built species wants.
   */
  pose(_state: PoseName, _phase: number, _ctx: EnemyCtx | null): void {}

  /** Force a specific pose/phase and stop the AI (screenshot scenarios). */
  freeze(state: PoseName, phase: number, ctx: EnemyCtx | null = null) {
    this.frozenPose = { state, phase };
    this.state = state;
    this.phase = phase;
    this.root.rotation.y = this.heading;
    this.restBones();
    this.repose(0, ctx);
  }

  /**
   * Re-apply the held pose for one frame.
   *
   * A frozen enemy still has to be re-posed every frame — the pose reads
   * `stateTime`, the impact springs and (for a boss) `phaseIndex`, and a
   * capture settles for scores of frames before it shoots. That makes the
   * frozen path exactly as sensitive to a missing `_resetVisual()` as the live
   * one, and for a long time it did not have one: it called `pose()` straight
   * out of `Enemies.update`, so the Iron Giant's telegraph crouch subtracted
   * its 0.1 m drop once per settle frame and put the model 8.4 m underground
   * by capture time. Everything a held pose needs goes through here.
   */
  repose(dt = 0, ctx: EnemyCtx | null = null) {
    if (!this.frozenPose || !this.visual) return;
    this._resetVisual();
    this.pose(this.frozenPose.state, this.frozenPose.phase, ctx);
    this.visual.position.y += this.groundLift(this.frozenPose.state);
    this._postPose(dt);
  }

  unfreeze() { this.frozenPose = null; }
}

const NO_WEAPONS: readonly WeaponClass[] = [];
const NO_THREATS: readonly Threat[] = [];
const DEFAULT_TIMING: AttackTiming = { telegraph: 0.5, strike: 0.18, attack: 0.5, recover: 0.7 };

/**
 * Metres per second a blow may shove a creature, before its own mass is
 * divided out. Was `this.knockbackCap ?? 3.6` against a field **nothing has
 * ever assigned** — so 3.6 is the only value it has ever had. A constant says
 * that; the field said the opposite.
 */
const KNOCKBACK_CAP = 3.6;
const _addEuler = new THREE.Euler();
const _calV = new THREE.Vector3();

/**
 * `stateTime` values the ground calibration samples, dense early where a
 * settle pose is actually moving and sparse late where it has converged.
 */
const GROUND_CAL_T = [0.04, 0.1, 0.18, 0.3, 0.45, 0.65, 0.9, 1.25, 1.7, 2.3, 3.0, 4.0];

/**
 * Poses the ground correction is measured for.
 *
 * All of them are driven by `stateTime`, which is what the correction is
 * indexed on. The gaits — `approach`, `run` — are deliberately absent: their
 * vertical motion is driven by `gaitPhase`, so a curve read off `stateTime`
 * would inject an arbitrary bob into the stride rather than remove a sink.
 * `pounce` is absent because being off the ground is the point of it.
 */
const GROUND_CAL_POSES: readonly PoseName[] = ['idle', 'telegraph', 'attack', 'flinch', 'stagger', 'death'];

/**
 * Poses whose shape depends on *which* attack is being performed, so the
 * correction has to be measured per attack rather than once.
 */
const POSE_PER_ATTACK: ReadonlySet<PoseName> = new Set<PoseName>(['telegraph', 'attack']);

/**
 * Ground penetration left uncorrected, metres. A foot pressing a few
 * centimetres into dirt is how contact reads as weight rather than as a model
 * balanced on a plane; correcting to exactly zero makes everything look like
 * it is hovering. Well inside the 0.25 m gate in `src/tools/creaturecheck.mts`.
 */
const GROUND_SINK = 0.05;
const _addQ = new THREE.Quaternion();

/**
 * Map the richer AI vocabulary onto the pose vocabulary the original four
 * species were written against, so no existing `pose()` has to change.
 */
const POSE_MAP: Partial<Record<EnemyState, PoseName>> = {
  sleep: 'idle', idle: 'idle', patrol: 'approach', alert: 'idle',
  return: 'approach', chase: 'approach', approach: 'approach', strafe: 'approach',
  telegraph: 'telegraph', attack: 'attack', recover: 'attack',
  flinch: 'flinch', stagger: 'stagger', death: 'death',
};

/* ------------------------------------------------------------ textures */

let _organic: THREE.Texture | null = null, _metal: THREE.Texture | null = null;
let _organicRough: THREE.Texture | null = null, _metalRough: THREE.Texture | null = null;
const texNoise = new Noise(777);

/**
 * Make a noise field periodic over the unit square by cross-fading it with its
 * own shifted copies.
 *
 * The detail maps now tile several times per metre (see `RigBuilder.detailUV`),
 * and simplex/worley are not periodic, so the discontinuity at u=1 that used to
 * hide inside one tile per body part is now a hard line repeating every 14 cm
 * down every limb. Four samples per texel, once, at bake time.
 *
 */
function tileable(f: (u:number, v:number) => number) {
  return (u: number, v: number) => {
    const a = f(u, v), b = f(u - 1, v), c = f(u, v - 1), d = f(u - 1, v - 1);
    const iu = 1 - u, iv = 1 - v;
    return a * iu * iv + b * u * iv + c * iu * v + d * u * v;
  };
}

/**
 * Hide and coat for the organic bestiary.
 *
 * Three layers, because a single noise octave is what makes a creature read as
 * a lump of clay: **guard hairs** as fine strokes lying along v and clumped
 * into locks by a slow warp across u; **pores and slack** under them; and
 * **loose folds** at body scale. `detailUV` fixes one tile at ~14 cm of animal,
 * so a strand here is about a millimetre wide on a real Bloodhorn instead of
 * the 3 cm curd the old one-tile-per-body-part mapping produced.
 */
export function organicNormal() {
  if (!_organic) {
    const fold = tileable((u, v) => texNoise.warped2(u * 3.5 + 11, v * 3.5 + 5, 1.3, 4));
    const pore = tileable((u, v) => 1 - texNoise.worley2(u * 22 + 3, v * 22 + 7).f1);
    const clump = tileable((u, v) => texNoise.fbm2(u * 5 + 21, v * 2.5 + 2, 3));
    const flow = tileable((u, v) => texNoise.fbm2(u * 9 + 31, v * 9 + 13, 2));
    _organic = normalFromHeight(256, (u: number, v: number) => {
      // strands: a rectified sine across u, drifted so they gather into locks
      const strand = Math.sin((u + clump(u, v) * 0.06) * Math.PI * 2 * 44);
      // ...and broken along their length so they read as hair, not corduroy
      const along = 0.45 + 0.55 * Math.max(0, Math.sin(v * Math.PI * 2 * 7 + flow(u, v) * 5));
      const hair = Math.pow(Math.max(0, strand), 2.2) * along * 0.55;
      return hair + pore(u, v) * 0.16 + fold(u, v) * 0.34;
    }, 1.5, { repeat: 1 });
    _organic.wrapS = _organic.wrapT = THREE.RepeatWrapping;
    _organic.anisotropy = 8;
  }
  return _organic;
}

/**
 * Gloss variation for hide. Skin is not uniformly matte: the crown of a fold
 * catches light, the crease under it is dry and dark, and worn patches over
 * bone go smoother. Without this every surface on a creature answers the light
 * identically, which is one of the loudest tells that a model was assembled
 * from primitives.
 */
export function organicRoughness() {
  if (!_organicRough) {
    const broad = tileable((u, v) => texNoise.fbm2(u * 4 + 17, v * 4 + 29, 4));
    const fine = tileable((u, v) => texNoise.fbm2(u * 19 + 5, v * 19 + 41, 2));
    _organicRough = makeDataMap(256, (u: number, v: number) => {
      const b = broad(u, v) * 0.5 + 0.5;
      const f = fine(u, v) * 0.5 + 0.5;
      // 0.5 is a waxy, healthy hide; 0.95 is dry dusty fur in a crease
      return 0.50 + 0.34 * b + 0.14 * f;
    }, { repeat: 1 });
    _organicRough.wrapS = _organicRough.wrapT = THREE.RepeatWrapping;
  }
  return _organicRough;
}

/**
 * Plate for the magitek and iron constructs.
 *
 * Rolled steel, not stucco: a fine unidirectional brush, hammer dishing at
 * hand scale, rivet heads on a grid, and shallow panel seams. At `detailUV`
 * density one tile is ~14 cm, so the rivets land roughly a hand apart, which
 * is what makes a six-metre walker read as fabricated rather than extruded.
 */
export function metalNormal() {
  if (!_metal) {
    const dish = tileable((u, v) => texNoise.fbm2(u * 6 + 2, v * 6 + 19, 3));
    const grime = tileable((u, v) => texNoise.fbm2(u * 24 + 37, v * 24 + 3, 2));
    _metal = normalFromHeight(256, (u: number, v: number) => {
      // brushed grain: high frequency along u only
      const brush = Math.sin(u * Math.PI * 2 * 96 + grime(u, v) * 3) * 0.05;
      // rivets: a domed head every quarter tile, on the seam lines
      const ru = (u * 4) % 1 - 0.5, rv = (v * 4) % 1 - 0.5;
      const rd = Math.hypot(ru, rv) / 0.10;
      const rivet = rd < 1 ? Math.sqrt(1 - rd * rd) * 0.34 : 0;
      // panel seams: a narrow crease every half tile in both directions
      const su = Math.min(Math.abs((u * 2) % 1 - 0.5), 0.5);
      const sv = Math.min(Math.abs((v * 2) % 1 - 0.5), 0.5);
      const seam = -Math.max(Math.pow(Math.max(0, 1 - su * 26), 3), Math.pow(Math.max(0, 1 - sv * 26), 3)) * 0.30;
      return dish(u, v) * 0.22 + brush + rivet + seam;
    }, 1.4, { repeat: 1 });
    _metal.wrapS = _metal.wrapT = THREE.RepeatWrapping;
    _metal.anisotropy = 8;
  }
  return _metal;
}

/**
 * Wear map for plate. Paint holds a low roughness; where it has been scoured
 * off, bare metal underneath comes up glossier still, and the oxidised patches
 * between them go flat. Three levels, not a single noisy average.
 */
export function metalRoughness() {
  if (!_metalRough) {
    const patch = tileable((u, v) => texNoise.warped2(u * 5 + 43, v * 5 + 7, 1.4, 3));
    const grain = tileable((u, v) => texNoise.fbm2(u * 15 + 61, v * 15 + 23, 3));
    _metalRough = makeDataMap(256, (u: number, v: number) => {
      const p = patch(u, v);
      const rust = Math.max(0, p) * 0.9;          // oxidised, flat
      const scour = Math.max(0, -p - 0.25) * 1.4; // rubbed back to metal
      return Math.min(1, 0.40 + 0.42 * rust - 0.24 * scour + 0.10 * (grain(u, v) * 0.5 + 0.5));
    }, { repeat: 1 });
    _metalRough.wrapS = _metalRough.wrapT = THREE.RepeatWrapping;
  }
  return _metalRough;
}

/**
 * Field wear over the vertex colours a part has already authored.
 *
 * A flat enamel value is what makes a machine read as a toy: every plate
 * answers the light with the same number, so nothing but the silhouette
 * separates one from the next. Real issue plate has paint scoured off its
 * upstanding faces and edges — going warm and bare — and dust and oil packed
 * into everything facing down.
 *
 * This *modulates* rather than replaces, unlike `IronGiant.aged()`: the
 * species that use it already paint their own panel values per part, and
 * re-deriving those from position would flatten the chest plate into the
 * backpack. Three terms — wear on upward faces, a plate-scale streak toward
 * `scuff`, and a grime multiplier under everything facing down.
 *
 * @param geo must already carry a `color` attribute
 * @returns the same geometry, modified in place
 */
export function weatherPlate(geo: THREE.BufferGeometry, { scuff = 0x8a7f70, amount = 1, grime = 0.34 }: {scuff?:number, amount?:number, grime?:number} = {}): THREE.BufferGeometry {
  if (amount <= 0) return geo;
  const pos = geo.attributes.position, cl = geo.attributes.color, nr = geo.attributes.normal;
  if (!pos || !cl) return geo;
  _wc.setHex(scuff, THREE.SRGBColorSpace);
  for (let i = 0; i < cl.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const up = nr ? nr.getY(i) : 0;
    // a slow streak down the plate crossed by a fine one across it
    const streak = Math.sin(x * 11.3 + z * 7.7 + y * 1.9) * 0.55
      + Math.sin(x * 27.1 - z * 18.3) * 0.25;
    const wear = Math.min(1, (Math.max(0, up) * 0.55 + Math.max(0, streak) * 0.50)) * amount;
    const k = 1 - Math.max(0, -up) * grime * amount;
    const t = wear * 0.42;
    cl.setXYZ(i,
      (cl.getX(i) * (1 - t) + _wc.r * t) * k,
      (cl.getY(i) * (1 - t) + _wc.g * t) * k,
      (cl.getZ(i) * (1 - t) + _wc.b * t) * k);
  }
  return geo;
}

const _wc = new THREE.Color();
