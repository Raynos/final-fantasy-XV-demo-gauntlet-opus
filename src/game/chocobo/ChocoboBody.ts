import * as THREE from 'three';
import { CharacterController } from '../../world/collision/CharacterController.ts';
import { WALKABLE_Y } from '../../world/collision/CollisionWorld.ts';
import type { CollisionWorld } from '../../world/collision/CollisionWorld.ts';

/**
 * The chocobo's locomotion.
 *
 * A `CharacterController`, not a `VehicleBody`. A bird runs; it does not have
 * wheels, a slip angle or a drivetrain, and every one of `VehicleBody`'s
 * affordances would have to be neutralised to stop it behaving like a car.
 * What it needs instead is exactly what a walker needs — capsule-vs-world,
 * slope refusal, a step-up onto a kerb, a ground snap — with bigger numbers.
 *
 * The speeds are not invented. `WorldMap.travel()`'s ETA table has priced
 * chocobo travel at **11.0 m/s** (`WorldMap.ts`:1170) since long before there
 * was a chocobo, and every estimate the world map has ever printed to the
 * player assumed it. Running at 11.0 makes the map instantly tell the truth;
 * running at anything else makes it a liar for free.
 */

/** Cruise, in m/s. The number `WorldMap.SPEED.chocobo` already promised. */
export const CHOCOBO_RUN = 11.0;
/** Held-back trot when the player is not asking for speed. */
export const CHOCOBO_WALK = 5.5;
/** Sprint burst, on stamina. */
export const CHOCOBO_SPRINT = 15.0;

/** Seconds of sprint from a full tank, before the Ascension multiplier. */
export const STAMINA_MAX = 6.0;

export class ChocoboBody {
  _fwd!: THREE.Vector3;
  _right!: THREE.Vector3;
  _wish!: THREE.Vector3;
  body!: CharacterController;
  collision!: CollisionWorld;
  grounded!: boolean;
  heading!: number;
  /** How hard the rider is asking, 0..1 — the animator's `effort`. */
  effort!: number;
  position!: THREE.Vector3;
  speed!: number;
  /** Seconds of burst left. */
  stamina!: number;
  /** Multiplier on `stamina` and the sprint ceiling, from Ascension. */
  staminaMul!: number;
  /** Damp targets, so `converge()` can snap them. See `Player.converge`. */
  _speedWant!: number;
  velocity!: THREE.Vector3;
  constructor(collision: CollisionWorld) {
    this.collision = collision;
    /**
     * A chocobo is wider and taller than Noctis and steps higher. `stepUp`
     * 0.55 is what gets it over the kerbs and the haven's lower treads without
     * a jump; `radius` 0.55 keeps it out of doorways it has no business in.
     */
    this.body = new CharacterController(collision, {
      radius: 0.55, height: 2.10, stepUp: 0.55, stepDown: 0.70, riseRate: 7.5,
    });
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._wish = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this._speedWant = 0;
    this.effort = 0;
    this.grounded = true;
    this.stamina = STAMINA_MAX;
    this.staminaMul = 1;
  }

  converge() { this.speed = this._speedWant; }

  /** Steepest ground this animal will stand on — the same 50° every walker gets. */
  static canStandOn(normalY: number) { return normalY >= WALKABLE_Y; }

  /**
   * One step, driven camera-relative exactly as `Player.update` drives Noctis.
   *
   * @param mv input.move, -1..1 on each axis
   * @param camDir the camera's world forward
   * @param sprint is the burst key held
   */
  step(dt: number, mv: {x: number, y: number}, camDir: THREE.Vector3, sprint: boolean) {
    this._fwd.copy(camDir);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() < 1e-6) this._fwd.set(0, 0, 1);
    this._fwd.normalize();
    this._right.crossVectors(this._fwd, new THREE.Vector3(0, 1, 0));
    const wish = this._wish.set(0, 0, 0)
      .addScaledVector(this._right, mv.x)
      .addScaledVector(this._fwd, mv.y);
    const mag = Math.min(1, wish.length());

    const burst = sprint && mag > 0.1 && this.stamina > 0;
    if (burst) this.stamina = Math.max(0, this.stamina - dt);
    // Recovery is deliberately slower than the burn, and only while not
    // bursting, so a sprint is a resource and not a second speed setting.
    else this.stamina = Math.min(STAMINA_MAX * this.staminaMul, this.stamina + dt * 0.55);

    if (mag > 0.001) {
      wish.normalize();
      this.heading = Math.atan2(wish.x, wish.z);
      const top = burst ? CHOCOBO_SPRINT : (mag > 0.55 ? CHOCOBO_RUN : CHOCOBO_WALK);
      this._speedWant = top * mag;
      // Acceleration is slower than Noctis'. Eleven metres a second on an
      // animal that reaches it in a fifth of a second reads as a hoverboard;
      // a bird has to gather itself, and 3.4 is the damp rate that makes the
      // gallop cycle visibly wind up rather than snap on.
      this.speed = THREE.MathUtils.damp(this.speed, this._speedWant, 3.4, dt);
    } else {
      this._speedWant = 0;
      this.speed = THREE.MathUtils.damp(this.speed, 0, 5.5, dt);
    }
    this.effort = THREE.MathUtils.clamp(this.speed / CHOCOBO_SPRINT, 0, 1) * (burst ? 1 : 0.6);

    this.velocity.set(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(this.speed);
    this.collision.ensure(4);
    this.body.move(this.position, this.velocity.x, this.velocity.z, dt);
    this.grounded = this.body.grounded;
    this.velocity.multiplyScalar(this.body.progress);
    return this.speed;
  }
}
