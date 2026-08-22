import * as THREE from 'three';
import { makeCharacter } from './Cast.ts';
import { updateSun } from './rig/Materials.ts';
import { CollisionWorld } from '../world/collision/CollisionWorld.ts';
import { CharacterController } from '../world/collision/CharacterController.ts';
import type { Character } from './rig/Character.ts';

/**
 * Noctis — the playable character.
 *
 * Locomotion drives a procedural animator (see rig/Anim.js): speed selects the
 * gait, the terrain plants the feet with IK, and the camera-relative input sets
 * the heading. The public contract other systems rely on is unchanged:
 *
 *   .root .position .velocity .heading .stats
 *
 * Combat additions:
 *   .character   the Character (attach points, actions, hit reactions)
 *   .play(name)  forward an action
 */
/** Shots whose framing implies the party is on the move. */
const WALK_SHOTS = new Set(['party_walk', 'hud_field', 'vista_dusk']);

export class Player {
  _gazeOn!: boolean;
  _gazeT!: number;
  _fwd!: THREE.Vector3;
  _gait!: number;
  _gazeSeq!: any;
  _look!: THREE.Vector3;
  _prevHeading!: number;
  _right!: THREE.Vector3;
  _wish!: THREE.Vector3;
  body!: CharacterController;
  character!: Character;
  collision!: any;
  game!: any;
  grounded!: boolean;
  heading!: number;
  mesh!: any;
  root!: THREE.Group;
  runSpeed!: number;
  speed!: number;
  stats!: any;
  terrain!: any;
  velocity!: THREE.Vector3;
  walkSpeed!: number;
  async init(game: any) {
    this.game = game;
    this.root = new THREE.Group();
    this.velocity = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.grounded = true;
    /**
     * Noctis' vitals. **Owned by `RpgSystem`** — it mirrors the real `Stats`
     * block onto this object every frame and folds anything combat subtracts
     * back into the model. These are placeholders for the single frame before
     * the RPG system's first tick, and for worlds booted without it.
     */
    this.stats = { hp: 0, maxHp: 0, mp: 0, maxMp: 0, level: 1 };

    this.character = makeCharacter('noctis');
    this.root.add(this.character.root);
    this.mesh = this.character.body;

    const terrain = game.get('Terrain');
    this.terrain = terrain;
    this.root.position.set(0, terrain.heightAt(0, 0), 0);
    this.root.rotation.y = Math.PI * 0.15;
    this.heading = this.root.rotation.y;
    game.scene.add(this.root);

    this._prevHeading = this.heading;
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._wish = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this.runSpeed = 7.4;
    this.walkSpeed = 3.6;

    /**
     * The world's static collision. Owned here rather than by `Game` because
     * the systems list is shared and this workstream may not edit it; it is
     * registered so `game.get('Collision')` finds it, and it harvests itself
     * incrementally off the first frames (the town, the props and the dungeon
     * entrances are all built *after* this system's `init`).
     */
    let world = game.get('Collision');
    if (!world) {
      world = new CollisionWorld();
      // init *before* registering: `BootProfile` wraps `Game.add` and replaces
      // the system's `init` with an async profiling shim, so calling it through
      // the registration would hand back a Promise instead of the world.
      world.init(game);
      game.add(world, 'Collision');
    }
    this.collision = world;
    this.body = new CharacterController(this.collision, {
      radius: 0.36, height: 1.78, stepUp: 0.45, stepDown: 0.55,
    });
    this._gait = 0;
  }

  get position() { return this.root.position; }

  /** Forward a combat action to the rig. @param name */
  play(name: string, opts: any) { this.character.play(name, opts); }

  /** Weapon sockets for the combat system. */
  get attach() { return this.character.attach; }

  update(dt: any, game: any) {
    const input = game.input;
    const cam = game.camera;
    const mv = input.move;
    const run = input.key('ShiftLeft') || input.gpButton(10);

    cam.getWorldDirection(this._fwd);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() < 1e-6) this._fwd.set(0, 0, 1);
    this._fwd.normalize();
    this._right.crossVectors(this._fwd, new THREE.Vector3(0, 1, 0));
    const wish = this._wish.set(0, 0, 0)
      .addScaledVector(this._right, mv.x)
      .addScaledVector(this._fwd, mv.y);
    let mag = wish.length();

    // Capture shots that are *about* movement drive themselves when no player
    // input is present, so the harness sees the gait and the party formation
    // rather than four people standing still.
    if (mag < 0.001 && WALK_SHOTS.has(game.currentShot)) {
      const t = game.time.raw;
      wish.set(Math.sin(0.10 * t + 0.6), 0, Math.cos(0.10 * t + 0.6));
      mag = 0.42;                       // a walk, not a sprint
      wish.normalize().multiplyScalar(mag);
    }
    if (mag > 0.001) {
      wish.normalize();
      this.heading = Math.atan2(wish.x, wish.z);
      const target = (run ? this.runSpeed : this.walkSpeed) * Math.min(1, mag);
      this.speed = THREE.MathUtils.damp(this.speed, target, 8, dt);
    } else {
      this.speed = THREE.MathUtils.damp(this.speed, 0, 12, dt);
    }

    this.velocity.set(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(this.speed);

    // Collide with the world instead of sliding through it. Inside a dungeon
    // the exterior soup is meaningless — `Dungeons` redirects `heightAt` to the
    // room floor and confines the party against its own Layout — so the static
    // world is switched off and only the ground snap runs.
    const dungeons = game.get('Dungeons');
    this.collision.enabled = !(dungeons && dungeons.isInside);
    this.collision.ensure(4);
    this.body.move(this.root.position, this.velocity.x, this.velocity.z, dt);
    this.grounded = this.body.grounded;
    this.velocity.multiplyScalar(this.body.progress);

    const prev = this.root.rotation.y;
    this.root.rotation.y = dampAngle(prev, this.heading, this.speed > 0.2 ? 9 : 5, dt);
    const turnRate = angleDelta(prev, this.root.rotation.y) / Math.max(1e-4, dt);

    // The gait follows the distance actually covered, so walking into a wall
    // stops the legs rather than moonwalking on the spot.
    this._gait = THREE.MathUtils.damp(this._gait, this.speed * this.body.progress, 10, dt);

    const combat = game.get('Combat');
    this._gaze(dt, game, combat);

    this.character.update(dt, {
      speed: this._gait,
      velocity: this.velocity,
      turnRate,
      terrain: this.terrain,
      wind: 0.3,
      // the animator needs to know a fight is happening — without this Noctis
      // holds his relaxed field idle in the middle of every battle
      combat: combat && combat.inCombat ? 1 : 0,
      weaponHand: 'R',
    });
  }

  /**
   * Where Noctis is looking.
   *
   * Nothing ever called `setLookTarget` on him, only on the companions, so in
   * every captured frame he stared rigidly down his own root forward axis
   * while the other three tracked each other. In combat he watches whatever he
   * is fighting; in the field he glances at one of the retinue and then looks
   * away again, on a deterministic timer so two capture runs match.
   */
  _gaze(dt: any, game: any, combat: any) {
    if (combat && combat.inCombat) {
      const lock = combat.lockTarget && !combat.lockTarget.dead ? combat.lockTarget : null;
      const e = lock || (combat.autoTarget ? combat.autoTarget(28) : null);
      if (e && e.root) {
        this.character.setLookTarget(e.centre ? e.centre(this._look) : this._look.copy(e.root.position));
        return;
      }
    }
    this._gazeT = (this._gazeT ?? 0) - dt;
    if (this._gazeT <= 0) {
      this._gazeSeq = (this._gazeSeq || 0) + 1;
      const r = Math.sin(this._gazeSeq * 17.31) * 0.5 + 0.5;
      this._gazeOn = !this._gazeOn;
      this._gazeT = this._gazeOn ? 1.5 + r * 2.1 : 4.5 + r * 6.0;
    }
    const party = this._gazeOn ? game.get('Party') : null;
    const m = party && party.members ? party.members[(this._gazeSeq || 0) % party.members.length] : null;
    if (!m) { this.character.setLookTarget(null); return; }
    const h = m.character.rig.dims.headOrigin.y;
    this.character.setLookTarget(this._look.set(m.root.position.x, m.root.position.y + h * 0.98, m.root.position.z));
  }

  lateUpdate(dt: any, game: any) {
    const sky = game.get('Sky');
    if (sky && sky.sun) updateSun(sky.sun, game.camera);
  }
}

/** Shortest-arc damped angle. */
export function dampAngle(a: any, b: number, lambda: number, dt: any) {
  return a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));
}

export function angleDelta(a: any, b: any) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
