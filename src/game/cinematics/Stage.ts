import * as THREE from 'three';
import { setPose } from './Poses.ts';
import type { Game } from '../Game.ts';

/**
 * Actor staging for cutscenes.
 *
 * The four are owned by `Player` and `Party`, which steer them every frame.
 * A cutscene needs authored positions instead, so the stage *suspends* those
 * two systems for the duration — it installs a no-op `update` as an own
 * property on the instance and deletes it again on release. Nothing is patched
 * globally, nothing is edited on disk, and if the cutscene throws the release
 * in `Cinematics.stop()` still puts both systems back.
 *
 * While suspended the stage owns the transforms and calls `character.update()`
 * itself, once per frame, with a synthetic locomotion state. That is what makes
 * a staged actor still *animate*: the gait, the foot IK, the coat springs and
 * the blinks all run off the speed the stage feeds them.
 *
 * ```js
 * stage.acquire();
 * stage.place('noctis', [x, y, z], yaw);
 * stage.walk('noctis', dirVec, 1.15);
 * stage.pose('gladio', 'push_heavy');
 * stage.look('prompto', 'noctis');
 * stage.tick(dt);
 * stage.release();
 * ```
 */
export class Stage {
  _suspended!: any[];
  actors!: Map<any, any>;
  _restore!: any[] | null;
  _v!: THREE.Vector3;
  _v2!: THREE.Vector3;
  _weaponWas!: any;
  game!: Game;
  held!: boolean;
  party!: any;
  player!: any;
  constructor(game: Game) {
    this.game = game;
    this.held = false;
    this.actors = new Map();
    this._suspended = [];
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._restore = null;
  }

  /** Build (once) the actor table from Player + Party. */
  _bind() {
    if (this.actors.size) return this.actors;
    const game = this.game;
    const player = game.get('Player');
    const party = game.get('Party');
    const add = (id: any, root: any, character: any, name: any) => {
      if (!root || !character) return;
      this.actors.set(id, {
        id, name, root, character,
        pos: root.position.clone(),
        yaw: root.rotation.y,
        speed: 0,
        vel: new THREE.Vector3(),
        pose: null,
        look: null,
        _prevYaw: root.rotation.y,
      });
    };
    if (player) add('noctis', player.root, player.character, 'Noctis');
    if (party) {
      for (const m of party.members) add(m.key, m.root, m.character, m.name);
    }
    this.player = player;
    this.party = party;
    return this.actors;
  }

  /** @param id `noctis` | `gladio` | `ignis` | `prompto` */
  actor(id: string) { this._bind(); return this.actors.get(id); }

  /** Every bound actor id, in staging order. */
  get ids() { this._bind(); return [...this.actors.keys()]; }

  /* ----------------------------------------------------------- control -- */

  /** Suspend Player/Party steering and remember where everyone was. */
  acquire() {
    if (this.held) return;
    this._bind();
    this.held = true;
    this._restore = [];
    for (const a of this.actors.values()) {
      this._restore.push({
        a, pos: a.root.position.clone(), yaw: a.root.rotation.y,
      });
      a.pos.copy(a.root.position);
      a.yaw = a.root.rotation.y;
      a.speed = 0;
      a.vel.set(0, 0, 0);
    }
    this._suspend(this.player);
    this._suspend(this.party);
    const combat = this.game.get('Combat');
    // sheathe: a materialised blade in a dialogue scene is a continuity error
    if (combat && combat.weapon && combat.weapon.setReveal) {
      this._weaponWas = combat.weapon.reveal ?? 1;
      combat.weapon.setReveal(0);
    }
  }

  /** Give the systems back and put everyone where the scene left them. */
  release({ restorePositions = false } = {}) {
    if (!this.held) return;
    this.held = false;
    for (const a of this.actors.values()) {
      setPose(a.character, null);
      a.character.setLookTarget(null);
      a.pose = null;
      a.look = null;
    }
    if (restorePositions && this._restore) {
      for (const r of this._restore) {
        r.a.root.position.copy(r.pos);
        r.a.root.rotation.y = r.yaw;
      }
    }
    for (const s of this._suspended) {
      if (s.had) s.obj.update = s.fn; else delete s.obj.update;
    }
    this._suspended.length = 0;
    const combat = this.game.get('Combat');
    if (combat && combat.weapon && combat.weapon.setReveal) combat.weapon.setReveal(this._weaponWas ?? 1);
    this._restore = null;
  }

  _suspend(obj: any) {
    if (!obj) return;
    const had = Object.prototype.hasOwnProperty.call(obj, 'update');
    this._suspended.push({ obj, had, fn: had ? obj.update : null });
    obj.update = () => {};
  }

  /* ------------------------------------------------------------ posing -- */

  /**
   * Put an actor at a world position with a yaw.
   * @param [yaw] radians; omit to leave the facing alone
   * @param [snap=true] snap y to the terrain
   */
  place(id: string, pos: number[] | THREE.Vector3, yaw?: number, snap: boolean = true) {
    const a = this.actor(id);
    if (!a) return;
    if (Array.isArray(pos)) a.pos.set(pos[0], pos[1], pos[2]);
    else a.pos.copy(pos);
    if (snap) {
      const terrain = this.game.get('Terrain');
      if (terrain && terrain.heightAt) a.pos.y = terrain.heightAt(a.pos.x, a.pos.z);
    }
    if (yaw != null) a.yaw = yaw;
  }

  /** Face an actor toward a world point. */
  faceTo(id: string, target: any) {
    const a = this.actor(id);
    if (!a) return;
    const t = Array.isArray(target) ? this._v.set(target[0], target[1], target[2]) : target;
    a.yaw = Math.atan2(t.x - a.pos.x, t.z - a.pos.z);
  }

  /**
   * Drive the locomotion layer. Speed alone selects idle/walk/jog/sprint.
   * @param dir travel direction (need not be unit)
   * @param speed metres/second
   */
  walk(id: string, dir: THREE.Vector3 | number[] | null, speed: number) {
    const a = this.actor(id);
    if (!a) return;
    a.speed = speed;
    if (!dir || speed <= 0) { a.vel.set(0, 0, 0); return; }
    if (Array.isArray(dir)) a.vel.set(dir[0], 0, dir[2]);
    else a.vel.set(dir.x, 0, dir.z);
    if (a.vel.lengthSq() > 1e-8) a.vel.normalize().multiplyScalar(speed);
  }

  /** @param id @param name see `Poses.ts` */
  pose(id: string, name: string | null) {
    const a = this.actor(id);
    if (!a) return;
    a.pose = name;
    setPose(a.character, name);
  }

  /**
   * Head/eye tracking. Accepts another actor id, a world point, or null.
   */
  look(id: string, target: string | THREE.Vector3 | number[] | null) {
    const a = this.actor(id);
    if (!a) return;
    a.look = target ?? null;
  }

  /** World point an actor's eyes are at — the thing other actors look at. */
  eyeOf(id: string, out = new THREE.Vector3()) {
    const a = this.actor(id);
    if (!a) return out.set(0, 0, 0);
    const dims = a.character.rig && a.character.rig.dims;
    const h = dims ? dims.headOrigin.y * 0.99 : 1.6;
    return out.set(a.pos.x, a.pos.y + h, a.pos.z);
  }

  /** Chest height — a better aim point for wide shots than the feet. */
  chestOf(id: string, out = new THREE.Vector3()) {
    const a = this.actor(id);
    if (!a) return out.set(0, 0, 0);
    return out.set(a.pos.x, a.pos.y + 1.28, a.pos.z);
  }

  /* -------------------------------------------------------------- tick -- */

  /**
   * Commit every staged transform and advance the rigs.
   */
  tick(dt: number) {
    if (!this.held) return;
    const terrain = this.game.get('Terrain');
    for (const a of this.actors.values()) {
      a.root.position.copy(a.pos);
      // Yaw is damped, never snapped: a cutscene actor that changes facing on a
      // single frame reads as a teleport even when the position is continuous.
      const d = shortestAngle(a.root.rotation.y, a.yaw);
      a.root.rotation.y += d * (1 - Math.exp(-9 * dt));
      const turnRate = (a.root.rotation.y - a._prevYaw) / Math.max(1e-4, dt);
      a._prevYaw = a.root.rotation.y;

      if (a.look) {
        if (typeof a.look === 'string') a.character.setLookTarget(this.eyeOf(a.look, this._v2));
        else if (Array.isArray(a.look)) a.character.setLookTarget(this._v2.set(a.look[0], a.look[1], a.look[2]));
        else a.character.setLookTarget(a.look);
      } else {
        a.character.setLookTarget(null);
      }

      a.character.update(dt, {
        speed: a.speed,
        velocity: a.vel,
        turnRate,
        terrain,
        wind: 0.35,
      });
    }
  }
}

/** Shortest signed angular difference from `a` to `b`. */
function shortestAngle(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export default Stage;
