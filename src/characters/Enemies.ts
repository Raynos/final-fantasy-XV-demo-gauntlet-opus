import * as THREE from 'three';
import { Rng } from '../util/Rng.ts';
import { BESTIARY, TYPES, speciesKeys } from './enemies/Bestiary.ts';
import { CombatAnim } from './rig/CombatAnim.ts';
import type {
  Enemy, EnemyCtx, EnemyPack, EnemyPrototype, ExpClass, Threat,
} from './enemies/EnemyBase.ts';
import type { Game } from '../game/Game.ts';

/**
 * Bestiary + spawner + AI tick.
 *
 * Each species is built once as a prototype (geometry, rig, material) and
 * instanced by cloning the skeleton, so N enemies of a type share one
 * BufferGeometry and one material — a fully articulated enemy is exactly one
 * draw call. Prototypes are built **lazily on first spawn** so a 20-species
 * bestiary costs nothing at boot.
 *
 * Dead enemies are recycled into a per-species pool rather than rebuilt, so a
 * long session never allocates a second skeleton for the same creature.
 */
/**
 * One placement of one species — where it stands, what it belongs to and who
 * asked for it.
 *
 * Deliberately *not* `SpawnOpts`, which is what varies between two instances
 * of a creature (`id`, `heading`, `scale`, `level`). This is what varies
 * between two *placements*: the world position, the pack, the patrol route,
 * and the encounter that owns it and will despawn it again.
 */
export interface SpawnPlacement {
  /** world position; an array is read as `[x, y, z]`. */
  pos?: THREE.Vector3 | number[];
  heading?: number;
  scale?: number;
  level?: number;
  /** overrides the species' `stats.hp`. */
  hp?: number;
  /** overrides the species' `stats.damage`. */
  damage?: number;
  /** the point it leashes back to; defaults to where it spawned. */
  home?: THREE.Vector3;
  /** patrol nodes; sets the enemy walking a route from the first frame. */
  patrol?: THREE.Vector3[] | null;
  /** seconds held at each patrol node. */
  patrolWait?: number;
  /** starts asleep — a night camp, or a daemon that has not risen yet. */
  asleep?: boolean;
  /**
   * A grazing animal: it notices the party and will not start a fight.
   *
   * `Territory.passive` has carried this meaning since the spawn tables were
   * written and nothing read it. See `Enemy.passive`.
   */
  passive?: boolean;
  pack?: EnemyPack | null;
  leash?: number;
  /** display name, for a named mark. */
  name?: string;
  expClass?: ExpClass;
  /**
   * The encounter that owns this spawn. `EncounterDirector` and `BossFight`
   * despawn by matching it, so it must survive nothing but `despawn()`.
   */
  owner?: string;
}

/**
 * How much bigger a creature is one level up.
 *
 * **`Enemy.level` was decoration.** It was carried on the instance, printed on
 * the nameplate, written by every spawn table and read by the EXP formula —
 * and *nothing scaled a creature by it*. A `level: 7` sabertusk and a level-45
 * one were byte-identical: same HP, same damage, same fight. So the danger
 * gradient that `SpawnTables` spends 140 lines authoring, and the promise in
 * `WildTerritories` that "a coeurl in Leide is a level 22 coeurl and the same
 * coeurl in Cleigne is a level 45 coeurl", were both cosmetic.
 *
 * The curve is **fitted to the bestiary's own table** rather than invented: a
 * log-linear fit of all 23 shipped species against their own listed levels —
 * Goblin (lv 11, 420 hp) through Titan (lv 45, 180 000 hp) — comes out at
 * ×1.087 per level for HP and ×1.048 for damage, and ships as ×1.085/×1.058.
 *
 * **The factor is exactly 1 at the species' own listed level**, which is what
 * makes this safe to land: every posed capture, every `creaturecheck` pose and
 * every `combatloop` assertion spawns at the listed level or overrides HP
 * outright, so none of them moves. Only a spawn that asks for a *different*
 * level — which is every wild den and every territory — feels it.
 */
const LEVEL_HP = 1.085;
const LEVEL_DMG = 1.058;
/**
 * And **poise**, which was left behind when HP and damage were scaled.
 *
 * A log-linear fit over all 23 shipped species against their own listed levels
 * gives x1.087 for HP, x1.053 for poise and x1.048 for damage — so the poise
 * column of the bestiary rises with level exactly as the other two do, and
 * nothing was reading it. That is not cosmetic the way an unread nameplate is:
 * `hurt()` spends `maxPoise` and staggers at zero, so a den lifted to the
 * party's level got 1.8x the HP and **the same poise it had at level 14**, and
 * therefore staggered just as often while taking nearly twice as long to kill.
 *
 * `probes/fightshape.mts` measured the consequence on the tree that had HP
 * scaling and not this: a sabertusk den spent **28% of its enemy-frames
 * staggered** and opened **0.27 attacks per second** across seven animals,
 * against 0.99/s for the imperial patrol that is not lifted at all. A creature
 * that is stagger-locked cannot have a rhythm, and the rhythm is the thing the
 * combat lane's approach beat, camera and telegraphs exist to serve.
 */
const LEVEL_POISE = 1.053;

/** The HP, poise and damage multipliers for `level` against a species' own. */
export function levelScale(baseLevel: number, level: number) {
  const d = level - baseLevel;
  return {
    hp: Math.pow(LEVEL_HP, d),
    poise: Math.pow(LEVEL_POISE, d),
    damage: Math.pow(LEVEL_DMG, d),
  };
}

export class Enemies {
  /** species geometry, keyed on `SpeciesDef.protoKey ?? key`. */
  prototypes!: Map<string, EnemyPrototype>;
  _ctx!: EnemyCtx;
  /** Cached vegetation-density sampler; see `update`. */
  _conceal!: ((x: number, z: number) => number) | null;
  _dir!: THREE.Vector3;
  _tmp!: THREE.Vector3;
  combatAnim!: CombatAnim;
  corpseLinger!: number;
  frozen!: boolean;
  game!: Game;
  list!: Enemy[];
  night!: number;
  onEnemyStrike!: EnemyCtx['onEnemyStrike'];
  onStrike!: EnemyCtx['onStrike'];
  /** retired instances, keyed on species key, ready to be re-spawned. */
  pool!: Map<string, Enemy[]>;
  rng!: Rng;
  root!: THREE.Group;
  threats!: Threat[] | null;
  async init(game: Game) {
    this.game = game;
    this.list = [];
    this.rng = new Rng(60613);
    this.root = new THREE.Group();
    this.root.name = 'Enemies';
    game.scene.add(this.root);

    this.prototypes = new Map();
    this.pool = new Map();
    this._tmp = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this.frozen = false;
    /** Everything an enemy may decide to attack. Set by the EncounterDirector. */
    this.threats = null;
    /** 0..1 night depth, drives sight ranges. Set by the EncounterDirector. */
    this.night = 0;
    /** Called as `onStrike(enemy, attack)` when an attack's active frame lands. */
    this.onStrike = null;
    /** Legacy single-argument hook CombatSystem installs. */
    this.onEnemyStrike = null;
    this._conceal = null;
    this._ctx = {
      terrain: null, player: null, others: this.list, threats: null,
      night: 0, concealment: null,
      onStrike: null, onEnemyStrike: null, rng: () => this.rng.next(),
    };
    /** Seconds a corpse lingers before it is recycled. */
    this.corpseLinger = 6;
  }

  /** @returns available species keys */
  get species(): string[] { return speciesKeys(); }

  /** Species definition by key. @param key */
  def(key: string) { return TYPES[key as keyof typeof TYPES] || null; }

  /**
   * Build (or fetch) the shared prototype for a species. Named marks derived
   * with `variant()` carry a `protoKey`, so a boss shares its base species'
   * geometry rather than building a second copy of it.
   */
  prototype(key: string) {
    const type = TYPES[key as keyof typeof TYPES];
    if (!type) throw new Error(`unknown enemy ${key}`);
    const pk = type.protoKey || key;
    let p = this.prototypes.get(pk);
    if (!p) {
      p = type.buildPrototype();
      this.prototypes.set(pk, p);
    }
    return p;
  }

  /**
   * Spawn one enemy.
   * @param key species key — see `Bestiary.ts`
   * @param o {pos:[x,y,z]|Vector3, heading, scale, level, hp, damage,
   *                    home, patrol, pack, leash, name, expClass}
   */
  spawn(key: string, o: SpawnPlacement = {}): Enemy {
    const type = TYPES[key as keyof typeof TYPES];
    if (!type) throw new Error(`unknown enemy ${key}`);

    const pooled = this.pool.get(key);
    const recycled = pooled && pooled.length ? pooled.pop() : undefined;
    let e: Enemy;
    if (recycled) {
      e = recycled;
      e.heading = o.heading ?? 0;
      e.scale = o.scale ?? 1;
      e.reset({ maxHp: o.hp, level: o.level, damage: o.damage });
    } else {
      e = type.make({
        id: this.list.length, heading: o.heading ?? 0,
        scale: o.scale ?? 1, level: o.level,
      });
      e.attachVisual(this.prototype(key));
      // Once per species, on the frame it first appears: measure how far its
      // settle poses reach below the ground so they can be corrected from the
      // model instead of from a hand-picked constant. See `calibrateGround`.
      e.calibrateGround();
      if (o.hp) { e.maxHp = o.hp; e.hp = o.hp; }
      if (o.damage) e.damage = o.damage;
    }

    /**
     * Make the level mean something — **after** the recycled/fresh branches,
     * because they are where the two writers that used to defeat this live.
     *
     * The fresh path assigns `maxHp`/`damage` from `o.hp`/`o.damage`, and
     * `reset()` on the recycled path does the same; a scale applied inside
     * either branch was overwritten by the other. Applying it here, once, on
     * the value both branches have finished writing, is the only place it
     * holds for both.
     *
     * Multiplicative on whatever is there, so a caller that has already
     * decided an absolute HP — a boss, a hunt mark, `EncounterDirector`'s
     * daemon-pressure scaling — keeps its intent and gets the level on top of
     * it rather than instead of it.
     */
    const wantLevel = o.level ?? type.stats.level;
    if (wantLevel !== type.stats.level) {
      const k = levelScale(type.stats.level, wantLevel);
      e.maxHp = Math.max(1, Math.round(e.maxHp * k.hp));
      e.hp = e.maxHp;
      e.damage = Math.max(1, Math.round(e.damage * k.damage));
      e.maxPoise = Math.max(1, Math.round(e.maxPoise * k.poise));
      e.poise = e.maxPoise;
    }

    const terrain = this.game.get('Terrain');
    const p = o.pos
      ? (Array.isArray(o.pos) ? this._tmp.fromArray(o.pos) : o.pos)
      : this._tmp.set(0, 0, 0);
    e.root.position.copy(p);
    // Spawn on the highest support, not the raw heightfield: an enemy placed on
    // Hammerhead's graded pad or a dungeon floor would otherwise stand inside
    // it while the party walks on top.
    const col = this.game.get('Collision');
    const g = col && col.ready ? col.groundAt(p.x, p.z, p.y + 3, 1.2, 6) : null;
    if (g) e.root.position.y = g.y;
    else if (terrain) e.root.position.y = terrain.heightAt(p.x, p.z);
    e.root.rotation.y = e.heading;
    e.home.copy(e.root.position);
    if (o.home) e.home.copy(o.home);
    if (o.leash) e.leash = o.leash;
    if (o.name) e.name = o.name;
    if (o.expClass) e.expClass = o.expClass;
    if (o.scale) { e.scale = o.scale; if (e.visual) e.visual.scale.setScalar(o.scale); }
    if (o.patrol && o.patrol.length) {
      e.patrol = { points: o.patrol, index: 0, wait: o.patrolWait ?? 3, waitTimer: o.patrolWait ?? 3 };
      e.setState('patrol');
    }
    // Species may declare themselves grazers; a territory may make one of a
    // species that usually is not. Either is enough — and the reset is
    // explicit because these instances are pooled and recycled.
    e.passive = !!(o.passive || type.passive);
    if (o.asleep) e.setState('sleep');
    if (o.pack) { e.pack = o.pack; o.pack.add(e); }
    e.spawnedBy = o.owner || null;

    this.root.add(e.root);
    this.list.push(e);
    return e;
  }

  /**
   * Retire an enemy back into its species pool.
   *
   * Ownership is cleared here, and that matters: a pooled instance can come
   * straight back out as somebody else's spawn, so anything still holding the
   * old owner id must not be able to claim it again.
   */
  despawn(e: Enemy): Enemy {
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
    this.root.remove(e.root);
    if (e.pack) { e.pack.remove(e); e.pack = null; }
    e.spawnedBy = null;
    e.territory = null;
    e.hunt = null;
    e._looted = false;
    let p = this.pool.get(e.type.key);
    if (!p) { p = []; this.pool.set(e.type.key, p); }
    if (p.length < 12) p.push(e);
    return e;
  }

  /**
   * Build every species' prototype up front. See `System.warmup`.
   *
   * Deliberately swallows a species that fails to build: a bestiary entry with
   * a broken generator is `geocheck`'s problem and `silhouette`'s, and warmup
   * refusing to finish would take out every capture rather than the one shot
   * that species appears in.
   */
  warmup() {
    for (const k of speciesKeys()) {
      try { this.prototype(k); } catch { /* see the comment */ }
    }
  }

  /** Remove everything (scenario switches). */
  clear() {
    for (const e of this.list.slice()) this.despawn(e);
    this.list.length = 0;
  }

  /** Live (non-dead) enemies. */
  alive(out: Enemy[] | null = null): Enemy[] {
    const o = out || [];
    o.length = 0;
    for (const e of this.list) if (!e.dead) o.push(e);
    return o;
  }

  /** Count of live enemies within `r` of a point. */
  countNear(p: THREE.Vector3, r: number) {
    let n = 0;
    const r2 = r * r;
    for (const e of this.list) {
      if (e.dead) continue;
      const dx = e.root.position.x - p.x, dz = e.root.position.z - p.z;
      if (dx * dx + dz * dz < r2) n++;
    }
    return n;
  }

  /**
   * Enemies whose capsule intersects a sphere — the melee hit query.
   * @param centre @param radius
   */
  sphereQuery(centre: THREE.Vector3, radius: number, out: Enemy[] = []): Enemy[] {
    out.length = 0;
    for (const e of this.list) {
      if (e.dead) continue;
      const r = e.radius * e.scale + radius;
      const dx = e.root.position.x - centre.x;
      const dz = e.root.position.z - centre.z;
      const dy = Math.max(0, Math.max(e.root.position.y - centre.y, centre.y - (e.root.position.y + e.height * e.scale)));
      if (dx * dx + dz * dz <= r * r && dy <= radius + 0.4) out.push(e);
    }
    return out;
  }

  /**
   * Swept-capsule query for a weapon arc: samples the segment from `a` to `b`.
   * Cheap, deterministic, and good enough for readable melee.
   */
  sweepQuery(a: THREE.Vector3, b: THREE.Vector3, radius: number, out: Enemy[] = []): Enemy[] {
    out.length = 0;
    const steps = 5;
    const p = this._tmp;
    for (const e of this.list) {
      if (e.dead) continue;
      const er = e.radius * e.scale + radius;
      let hit = false;
      for (let i = 0; i <= steps && !hit; i++) {
        p.lerpVectors(a, b, i / steps);
        const dx = e.root.position.x - p.x, dz = e.root.position.z - p.z;
        if (dx * dx + dz * dz > er * er) continue;
        const lo = e.root.position.y, hi = lo + e.height * e.scale;
        if (p.y >= lo - 0.5 && p.y <= hi + 0.3) hit = true;
      }
      if (hit) out.push(e);
    }
    return out;
  }

  /**
   * Best lock-on candidate: closest enemy inside `maxDist` weighted toward
   * whatever is nearest the camera's forward axis.
   */
  pickTarget(from: THREE.Vector3, forward: THREE.Vector3, maxDist = 30, coneDot = 0.1): Enemy | null {
    let best: Enemy | null = null, bestScore = Infinity;
    for (const e of this.list) {
      if (e.dead) continue;
      this._dir.subVectors(e.root.position, from);
      const d = this._dir.length();
      if (d > maxDist || d < 1e-3) continue;
      this._dir.multiplyScalar(1 / d);
      const dot = this._dir.dot(forward);
      if (dot < coneDot) continue;
      const score = d * (1.6 - dot);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  /** Nearest live enemy to a point, or null. */
  nearest(p: THREE.Vector3, maxDist = Infinity): Enemy | null {
    let best: Enemy | null = null, bestD = maxDist;
    for (const e of this.list) {
      if (e.dead) continue;
      const d = e.root.position.distanceTo(p);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  update(dt: number, game: Game) {
    const ctx = this._ctx;
    ctx.terrain = game.get('Terrain') ?? null;
    ctx.player = game.get('Player') ?? null;
    ctx.threats = this.threats;
    ctx.night = this.night;
    // Vegetation concealment (sibling-ports Wave 4). Bound here rather than in
    // `EnemyBase` so the bestiary keeps no dependency on `world/veg/`, and
    // re-read per frame because `Vegetation` is built by a later boot step than
    // this one -- binding it once in the constructor would silently leave every
    // encounter with no concealment, which is exactly the class of dead system
    // `reachcheck` exists to catch.
    if (!this._conceal) {
      const veg = game.get('Vegetation');
      const eco = veg && veg.ecology;
      if (eco) this._conceal = (x: number, z: number) => eco.grassDensity(x, z);
    }
    ctx.concealment = this._conceal;
    ctx.onStrike = this.onStrike;
    ctx.onEnemyStrike = this.onEnemyStrike;

    if (this.frozen) {
      // `repose`, not `pose`: a held pose has to clear the body transform
      // before re-authoring it, or every relative write in the pose function
      // integrates once per settle frame. See `Enemy.repose`.
      for (const e of this.list) e.repose(dt, ctx);
      return;
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.update(dt, ctx);
      if (e.dead && e.corpseTime > this.corpseLinger && !e.keepCorpse) this.despawn(e);
    }
  }

  /**
   * Drive the player's combat body (`rig/CombatAnim.ts`).
   *
   * It has to run in the **lateUpdate** pass: `CombatSystem` updates after
   * `Player`, so a layer driven from the update pass would read last frame's
   * swing angle and the arm would trail the blade. This system is hosted here
   * only because it is the character-animation system that already ticks late;
   * it belongs on `CombatSystem` or `Player` once those owners can take a
   * one-line call, and nothing else in here depends on it.
   */
  lateUpdate(dt: number, game: Game) {
    if (!this.combatAnim && game.get('Combat') && game.get('Player')) {
      this.combatAnim = new CombatAnim(game);
    }
    if (this.combatAnim) this.combatAnim.lateUpdate(dt);
  }
}

export { BESTIARY, TYPES };
