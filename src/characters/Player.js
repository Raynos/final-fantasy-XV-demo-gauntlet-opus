import * as THREE from 'three';
import { makeCharacter } from './Cast.js';
import { updateSun } from './rig/Materials.js';

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
  async init(game) {
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
  }

  get position() { return this.root.position; }

  /** Forward a combat action to the rig. @param {string} name */
  play(name, opts) { this.character.play(name, opts); }

  /** Weapon sockets for the combat system. */
  get attach() { return this.character.attach; }

  update(dt, game) {
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
    this.root.position.addScaledVector(this.velocity, dt);
    this.root.position.y = this.terrain.heightAt(this.root.position.x, this.root.position.z);

    const prev = this.root.rotation.y;
    this.root.rotation.y = dampAngle(prev, this.heading, this.speed > 0.2 ? 9 : 5, dt);
    const turnRate = angleDelta(prev, this.root.rotation.y) / Math.max(1e-4, dt);

    this.character.update(dt, {
      speed: this.speed,
      velocity: this.velocity,
      turnRate,
      terrain: this.terrain,
      wind: 0.3,
    });
  }

  lateUpdate(dt, game) {
    const sky = game.get('Sky');
    if (sky && sky.sun) updateSun(sky.sun, game.camera);
  }
}

/** Shortest-arc damped angle. */
export function dampAngle(a, b, lambda, dt) {
  return a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));
}

export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
