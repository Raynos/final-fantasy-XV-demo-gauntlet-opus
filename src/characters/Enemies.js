import * as THREE from 'three';
import { Rng } from '../util/Rng.js';
import { SABERTUSK } from './enemies/Sabertusk.js';
import { GOBLIN } from './enemies/Goblin.js';
import { MT_SOLDIER } from './enemies/MTSoldier.js';
import { IRON_GIANT } from './enemies/IronGiant.js';

const TYPES = {
  sabertusk: SABERTUSK,
  goblin: GOBLIN,
  mt: MT_SOLDIER,
  irongiant: IRON_GIANT,
};

/**
 * Bestiary + spawner + AI tick.
 *
 * Each species is built once as a prototype (geometry, rig, material) and
 * instanced by cloning the skeleton, so N enemies of a type share one
 * BufferGeometry and one material — a fully articulated enemy is exactly one
 * draw call.
 */
export class Enemies {
  async init(game) {
    this.game = game;
    this.list = [];
    this.rng = new Rng(60613);
    this.root = new THREE.Group();
    this.root.name = 'Enemies';
    game.scene.add(this.root);

    this.prototypes = new Map();
    for (const [key, type] of Object.entries(TYPES)) {
      this.prototypes.set(key, type.buildPrototype());
    }
    this._tmp = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this.frozen = false;
  }

  /** @returns {string[]} available species keys */
  get species() { return Object.keys(TYPES); }

  /**
   * Spawn one enemy.
   * @param {string} key sabertusk | goblin | mt | irongiant
   * @param {object} o {pos:[x,y,z]|Vector3, heading, scale, level, hp}
   */
  spawn(key, o = {}) {
    const type = TYPES[key];
    if (!type) throw new Error(`unknown enemy ${key}`);
    const e = type.make({ id: this.list.length, heading: o.heading ?? 0, scale: o.scale ?? 1, level: o.level });
    e.attachVisual(this.prototypes.get(key));
    const terrain = this.game.get('Terrain');
    const p = o.pos ? (o.pos.isVector3 ? o.pos : new THREE.Vector3().fromArray(o.pos)) : new THREE.Vector3();
    if (terrain) p.y = terrain.heightAt(p.x, p.z);
    e.root.position.copy(p);
    e.root.rotation.y = e.heading;
    if (o.hp) { e.maxHp = o.hp; e.hp = o.hp; }
    this.root.add(e.root);
    this.list.push(e);
    return e;
  }

  /** Remove everything (scenario switches). */
  clear() {
    for (const e of this.list) {
      this.root.remove(e.root);
      if (e.mesh && e.mesh.skeleton) e.mesh.skeleton.dispose?.();
    }
    this.list.length = 0;
  }

  /** Live (non-dead) enemies. */
  alive() { return this.list.filter((e) => !e.dead); }

  /**
   * Enemies whose capsule intersects a sphere — the melee hit query.
   * @param {THREE.Vector3} centre @param {number} radius
   */
  sphereQuery(centre, radius, out = []) {
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
  sweepQuery(a, b, radius, out = []) {
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
  pickTarget(from, forward, maxDist = 30, coneDot = 0.1) {
    let best = null, bestScore = Infinity;
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

  update(dt, game) {
    if (this.frozen) {
      for (const e of this.list) if (e.frozenPose) e.pose(e.frozenPose.state, e.frozenPose.phase, null);
      return;
    }
    const terrain = game.get('Terrain');
    const player = game.get('Player');
    const ctx = { terrain, player, others: this.list, onEnemyStrike: this.onEnemyStrike };
    for (const e of this.list) {
      if (!e.target && player && !e.dead) e.target = player;
      e.update(dt, ctx);
    }
  }
}
