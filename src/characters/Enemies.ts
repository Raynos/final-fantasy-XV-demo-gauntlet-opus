import * as THREE from 'three';
import { Rng } from '../util/Rng.ts';
import { BESTIARY, TYPES, speciesKeys } from './enemies/Bestiary.ts';
import { CombatAnim } from './rig/CombatAnim.ts';

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
export class Enemies {
  prototypes!: Map<any, any>;
  _ctx!: any;
  _dir!: THREE.Vector3;
  _tmp!: THREE.Vector3;
  combatAnim!: CombatAnim;
  corpseLinger!: number;
  frozen!: boolean;
  game!: any;
  list!: any[];
  night!: number;
  onEnemyStrike!: any;
  onStrike!: any;
  pool!: Map<any, any>;
  rng!: Rng;
  root!: THREE.Group;
  threats!: any;
  async init(game: any) {
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
    this._ctx = {
      terrain: null, player: null, others: this.list, threats: null,
      night: 0, onStrike: null, onEnemyStrike: null, rng: () => this.rng.next(),
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
  prototype(key: any) {
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
   * @param key species key — see `Bestiary.js`
   * @param o {pos:[x,y,z]|Vector3, heading, scale, level, hp, damage,
   *                    home, patrol, pack, leash, name, expClass}
   */
  spawn(key: string, o: any = {}) {
    const type = TYPES[key as keyof typeof TYPES];
    if (!type) throw new Error(`unknown enemy ${key}`);

    const pooled = this.pool.get(key);
    let e;
    if (pooled && pooled.length) {
      e = pooled.pop();
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

    const terrain = this.game.get('Terrain');
    const p = o.pos ? (o.pos.isVector3 ? o.pos : this._tmp.fromArray(o.pos)) : this._tmp.set(0, 0, 0);
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
  despawn(e: any) {
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

  /** Remove everything (scenario switches). */
  clear() {
    for (const e of this.list.slice()) this.despawn(e);
    this.list.length = 0;
  }

  /** Live (non-dead) enemies. */
  alive(out: any = null) {
    const o = out || [];
    o.length = 0;
    for (const e of this.list) if (!e.dead) o.push(e);
    return o;
  }

  /** Count of live enemies within `r` of a point. */
  countNear(p: any, r: any) {
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
  sphereQuery(centre: THREE.Vector3, radius: number, out = []) {
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
  sweepQuery(a: any, b: any, radius: any, out = []) {
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
  pickTarget(from: any, forward: any, maxDist = 30, coneDot = 0.1) {
    let best: any = null, bestScore = Infinity;
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
  nearest(p: any, maxDist = Infinity) {
    let best: any = null, bestD = maxDist;
    for (const e of this.list) {
      if (e.dead) continue;
      const d = e.root.position.distanceTo(p);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  update(dt: any, game: any) {
    const ctx = this._ctx;
    ctx.terrain = game.get('Terrain');
    ctx.player = game.get('Player');
    ctx.threats = this.threats;
    ctx.night = this.night;
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
   * Drive the player's combat body (`rig/CombatAnim.js`).
   *
   * It has to run in the **lateUpdate** pass: `CombatSystem` updates after
   * `Player`, so a layer driven from the update pass would read last frame's
   * swing angle and the arm would trail the blade. This system is hosted here
   * only because it is the character-animation system that already ticks late;
   * it belongs on `CombatSystem` or `Player` once those owners can take a
   * one-line call, and nothing else in here depends on it.
   */
  lateUpdate(dt: any, game: any) {
    if (!this.combatAnim && game.get('Combat') && game.get('Player')) {
      this.combatAnim = new CombatAnim(game);
    }
    if (this.combatAnim) this.combatAnim.lateUpdate(dt);
  }
}

export { BESTIARY, TYPES };
