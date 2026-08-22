import * as THREE from 'three';
import { Noise } from '../util/Noise.ts';
import type { Game } from './Game.ts';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Third-person game camera.
 *
 * A spring arm with real collision (a swept probe against the terrain — see
 * `_armDistance` for why props are not in it — with a fast push-in and a slow
 * recover), separate position and rotation damping, velocity look-ahead,
 * speed-reactive FOV, a handheld noise layer, combat framing that keeps the
 * player and the lock-on target in the same frame, and a trauma-driven shake
 * model.
 *
 * Harness contract (unchanged):
 *   rig.setShot({ pos:[x,y,z], target:[x,y,z], fov })   -> freeze camera
 *   rig.clearShot()
 *   rig.followShot = shot                                -> track the player
 */
export class CameraRig {
  _desired!: THREE.Vector3;
  _dir!: THREE.Vector3;
  _first!: boolean;
  _focus!: THREE.Vector3;
  _focusSmooth!: THREE.Vector3;
  _lookAt!: THREE.Vector3;
  _noise!: Noise;
  _smooth!: THREE.Vector3;
  _t!: number;
  _tmp!: THREE.Vector3;
  _tmp2!: THREE.Vector3;
  _traumaDir!: THREE.Vector3;
  baseFov!: number;
  cam!: any;
  combatFraming!: number;
  distance!: number;
  followShot!: any;
  fov!: number;
  fovMax!: number;
  fovSpeedGain!: number;
  game!: Game;
  handheld!: number;
  height!: number;
  lockOn!: any;
  lookAhead!: number;
  lookAheadMax!: number;
  lookDamp!: number;
  maxDistance!: number;
  minDistance!: number;
  pitch!: number;
  pitchMax!: number;
  pitchMin!: number;
  pitchTarget!: number;
  posDamp!: number;
  posDampY!: number;
  probeRadius!: number;
  restDistance!: number;
  rotDamp!: number;
  sensitivity!: number;
  shakeFreq!: number;
  shakePos!: number;
  shakeRot!: number;
  shot!: any;
  shoulder!: number;
  sprintFov!: number;
  targetDistance!: number;
  trauma!: number;
  traumaDecay!: number;
  traumaMax!: number;
  yaw!: number;
  yawTarget!: number;
  async init(game: Game) {
    this.game = game;
    this.cam = game.camera;

    // orbit state
    this.yaw = Math.PI * 0.15;
    this.pitch = 0.22;
    this.yawTarget = this.yaw;
    this.pitchTarget = this.pitch;
    this.sensitivity = 0.0026;
    this.pitchMin = -0.62;
    this.pitchMax = 1.15;

    // arm
    this.distance = 5.6;
    this.restDistance = 5.6;
    this.targetDistance = 5.6;
    this.minDistance = 1.1;
    this.maxDistance = 12;
    this.probeRadius = 0.32;
    this.height = 1.62;
    this.shoulder = 0.55;

    // damping (separate rates: position lags, aim is crisp)
    this.posDamp = 11.0;
    this.posDampY = 7.0;
    this.rotDamp = 16.0;
    this.lookDamp = 13.0;

    // framing
    this.lookAhead = 0.34;        // metres per m/s of player velocity
    this.lookAheadMax = 2.2;
    this.lockOn = null;
    this.combatFraming = 0.6;

    // lens
    this.baseFov = 50;
    this.fov = 50;
    this.fovSpeedGain = 1.15;     // degrees per m/s over the walk speed
    this.fovMax = 14;             // max extra degrees
    this.sprintFov = 4.0;

    // handheld + shake
    this.handheld = 1.0;
    this.trauma = 0;
    this.traumaDecay = 1.35;
    this.traumaMax = 1.0;
    this.shakeFreq = 13.0;
    this.shakePos = 0.26;
    this.shakeRot = 0.055;
    this._traumaDir = new THREE.Vector3(0, 0, 0);
    this._noise = new Noise(20166);
    this._t = 0;

    this.shot = null;
    this.followShot = null;

    this._focus = new THREE.Vector3();
    this._focusSmooth = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._smooth = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
    this._first = true;
  }

  // ------------------------------------------------------------------ API

  /** Freeze the camera on a cinematic shot. */
  setShot(shot: any) {
    this.shot = shot;
    this._cut();
  }

  /** Return to gameplay control. */
  clearShot() {
    this.shot = null;
    this.followShot = null;
    this._first = true;
    this._cut();
  }

  /**
   * Add screen shake. Trauma decays quadratically so small hits read as a
   * tick and big ones as a real impact.
   * @param amount 0..1
   * @param [dir] world direction to bias the kick along
   */
  addTrauma(amount: number, dir?: THREE.Vector3) {
    this.trauma = Math.min(this.traumaMax, this.trauma + amount);
    if (dir) this._traumaDir.copy(dir).normalize();
    else this._traumaDir.set(0, 0, 0);
  }

  /** Lock-on framing target (an Object3D or null). */
  setLockOn(target: any) { this.lockOn = target || null; }

  /** Nudge the orbit directly (used by cutscenes / auto-follow). */
  setOrbit(yaw: number, pitch: number) {
    this.yawTarget = yaw;
    this.pitchTarget = THREE.MathUtils.clamp(pitch, this.pitchMin, this.pitchMax);
  }

  // ------------------------------------------------------------- internals

  _cut() {
    const post = this.game && this.game.post;
    if (post) { post.resetHistory(); if (post.snapFocus) post.snapFocus(); }
  }

  /**
   * Sweep the arm from the focus point outward and return the first distance
   * at which the camera would clip something.
   */
  _armDistance(game: Game, focus: THREE.Vector3, dir: THREE.Vector3, wanted: number) {
    let d = wanted;
    const terrain = game.get('Terrain');
    if (terrain && terrain.heightAt) {
      const steps = 8;
      for (let i = 1; i <= steps; i++) {
        const t = (i / steps) * wanted;
        const x = focus.x + dir.x * t;
        const y = focus.y + dir.y * t;
        const z = focus.z + dir.z * t;
        const h = terrain.heightAt(x, z) + this.probeRadius + 0.42;
        if (y < h) {
          // pull in until the arm clears the ground, but never below the min
          const slope = dir.y;
          const need = slope < -1e-3 ? (h - focus.y) / slope : t;
          d = Math.min(d, Math.max(this.minDistance, Math.min(t, need)));
          break;
        }
      }
    }

    // There is no prop-collision sweep here. There used to be a raycast against
    // `Props.cameraColliders || .colliders || .collisionMeshes` — none of which
    // `Props` has ever had, so the list was always empty and the ray never ran.
    // To restore it, `Props` needs to publish a real, opt-in
    // `cameraColliders: THREE.Object3D[]` (opt-in because raycasting a whole
    // prop group — instanced foliage and the rest — every frame costs more than
    // the camera is worth), and this is where it would be swept.
    return d;
  }

  _shakeOffset(dt: number, out: THREE.Vector3, rot: THREE.Vector3) {
    const tr = this.trauma;
    if (tr <= 0.0001) { out.set(0, 0, 0); rot.set(0, 0, 0); return; }
    const s = tr * tr;                       // quadratic falloff reads better
    const t = this._t * this.shakeFreq;
    const n = (o: number) => this._noise.simplex2(t, o);
    out.set(n(0.0), n(11.3), n(23.7)).multiplyScalar(s * this.shakePos);
    if (this._traumaDir.lengthSq() > 0.01) {
      out.addScaledVector(this._traumaDir, s * this.shakePos * 0.9 * n(31.1));
    }
    rot.set(n(41.2) * this.shakeRot * s, n(53.9) * this.shakeRot * s, n(67.5) * this.shakeRot * 1.6 * s);
  }

  _drivePost(game: Game, focusPoint: THREE.Vector3) {
    const post = game.post;
    if (!post) return;
    if (!post.game && post.attach) post.attach(game);
    if (post.setFocusDistance) {
      post.setFocusDistance(this.cam.position.distanceTo(focusPoint));
    }
  }

  // ------------------------------------------------------------- main tick

  lateUpdate(dt: number, game: Game) {
    this._t += dt;
    if (this.trauma > 0) this.trauma = Math.max(0, this.trauma - this.traumaDecay * dt);

    if (this.shot) {
      const s = this.shot;
      if (this.followShot) {
        const f = this.followShot;
        const p = game.followAnchor(f.follow);
        s.pos = [p.x + f.offset[0], p.y + f.offset[1], p.z + f.offset[2]];
        s.target = [
          p.x + (f.lookOffset?.[0] ?? 0),
          p.y + (f.lookOffset?.[1] ?? 1.2),
          p.z + (f.lookOffset?.[2] ?? 0),
        ];
      }
      // Keep a framed shot clear of the ground even where the terrain rises
      // between the anchor and the subject.
      const terrain = game.get('Terrain');
      if (terrain && terrain.heightAt) {
        const floor = terrain.heightAt(s.pos[0], s.pos[2]) + 1.35;
        if (s.pos[1] < floor) s.pos[1] = floor;
      }
      this.cam.position.fromArray(s.pos);
      this._lookAt.fromArray(s.target);
      this.cam.lookAt(this._lookAt);
      if (s.fov && s.fov !== this.cam.fov) { this.cam.fov = s.fov; this.cam.updateProjectionMatrix(); }
      if (s.roll) this.cam.rotateZ(s.roll);

      // shake still applies to cinematics (trauma is zero in captures)
      this._shakeOffset(dt, this._tmp, this._tmp2);
      if (this._tmp.lengthSq() > 0) {
        this.cam.position.add(this._tmp);
        this.cam.rotateX(this._tmp2.x);
        this.cam.rotateY(this._tmp2.y);
        this.cam.rotateZ(this._tmp2.z);
      }
      this.cam.updateMatrixWorld();
      this._drivePost(game, this._lookAt);
      return;
    }

    const input = game.input;
    const player = game.get('Player');
    if (!player) return;

    // ---- orbit ---------------------------------------------------------
    this.yawTarget -= input.look.x * this.sensitivity;
    this.pitchTarget = THREE.MathUtils.clamp(
      this.pitchTarget + input.look.y * this.sensitivity, this.pitchMin, this.pitchMax);
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance + input.mouse.wheel * 0.5, 2.2, this.maxDistance);
    this.restDistance = this.targetDistance;

    // ---- combat framing: bias the orbit so the lock-on target is in frame
    const lock = this.lockOn;
    if (lock) {
      const lp = lock.isVector3 ? lock : this._tmp.setFromMatrixPosition(lock.matrixWorld);
      const toTarget = this._tmp2.copy(lp).sub(player.position);
      const flat = Math.hypot(toTarget.x, toTarget.z);
      const wantYaw = Math.atan2(-toTarget.x, -toTarget.z);
      const wantPitch = THREE.MathUtils.clamp(0.16 + toTarget.y * 0.03, -0.2, 0.7);
      this.yawTarget = angleLerp(this.yawTarget, wantYaw, this.combatFraming * Math.min(1, dt * 4));
      this.pitchTarget = THREE.MathUtils.lerp(
        this.pitchTarget, wantPitch, this.combatFraming * Math.min(1, dt * 3));
      // back off so both silhouettes fit
      this.restDistance = THREE.MathUtils.clamp(
        this.targetDistance + flat * 0.22, this.targetDistance, this.maxDistance);
    }

    this.yaw = angleLerp(this.yaw, this.yawTarget, 1 - Math.exp(-this.rotDamp * dt));
    this.pitch = THREE.MathUtils.damp(this.pitch, this.pitchTarget, this.rotDamp, dt);

    // ---- focus point: shoulder offset + velocity look-ahead ------------
    const vel = player.velocity || this._tmp2.set(0, 0, 0);
    const speed = Math.hypot(vel.x, vel.z);
    this._focus.copy(player.position);
    this._focus.y += this.height;
    if (speed > 0.05) {
      const la = Math.min(this.lookAheadMax, speed * this.lookAhead);
      this._focus.x += (vel.x / speed) * la;
      this._focus.z += (vel.z / speed) * la;
    }
    // shoulder offset, in camera space
    const cp = Math.cos(this.pitch);
    this._dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).normalize();
    const right = this._tmp.copy(this._dir).cross(UP).normalize();
    this._focus.addScaledVector(right, -this.shoulder);

    if (this._first) this._focusSmooth.copy(this._focus);
    else {
      this._focusSmooth.x = THREE.MathUtils.damp(this._focusSmooth.x, this._focus.x, this.lookDamp, dt);
      this._focusSmooth.y = THREE.MathUtils.damp(this._focusSmooth.y, this._focus.y, this.lookDamp * 0.6, dt);
      this._focusSmooth.z = THREE.MathUtils.damp(this._focusSmooth.z, this._focus.z, this.lookDamp, dt);
    }

    // ---- arm + collision ----------------------------------------------
    const wanted = this.restDistance;
    const clear = this._armDistance(game, this._focusSmooth, this._dir, wanted);
    if (clear < this.distance) this.distance = clear;                       // push in now
    else this.distance = THREE.MathUtils.damp(this.distance, clear, 3.2, dt); // recover slowly

    this._desired.copy(this._focusSmooth).addScaledVector(this._dir, this.distance);

    if (this._first) { this._smooth.copy(this._desired); this._first = false; }
    else {
      this._smooth.x = THREE.MathUtils.damp(this._smooth.x, this._desired.x, this.posDamp, dt);
      this._smooth.y = THREE.MathUtils.damp(this._smooth.y, this._desired.y, this.posDampY, dt);
      this._smooth.z = THREE.MathUtils.damp(this._smooth.z, this._desired.z, this.posDamp, dt);
    }

    // ---- handheld -------------------------------------------------------
    const hh = this.handheld;
    if (hh > 0) {
      const t = this._t;
      const n = (o: number, f: number) => this._noise.simplex2(t * f, o);
      this._smooth.x += n(3.1, 0.42) * 0.020 * hh;
      this._smooth.y += n(9.7, 0.31) * 0.026 * hh;
      this._smooth.z += n(15.3, 0.37) * 0.020 * hh;
    }

    // ---- FOV -------------------------------------------------------------
    const sprint = speed > 5.2 ? 1 : 0;
    const extra = Math.min(this.fovMax, Math.max(0, speed - 3.2) * this.fovSpeedGain + sprint * this.sprintFov);
    this.fov = THREE.MathUtils.damp(this.fov, this.baseFov + extra, 4.0, dt);

    // ---- commit ----------------------------------------------------------
    this._shakeOffset(dt, this._tmp, this._tmp2);
    this.cam.position.copy(this._smooth).add(this._tmp);

    this._lookAt.copy(this._focusSmooth);
    if (lock) {
      const lp = lock.isVector3
        ? lock
        : new THREE.Vector3().setFromMatrixPosition(lock.matrixWorld);
      this._lookAt.lerp(lp, 0.32 * this.combatFraming);
    }
    this.cam.lookAt(this._lookAt);
    if (this._tmp2.lengthSq() > 0) {
      this.cam.rotateX(this._tmp2.x);
      this.cam.rotateY(this._tmp2.y);
      this.cam.rotateZ(this._tmp2.z);
    }

    if (Math.abs(this.cam.fov - this.fov) > 1e-3) {
      this.cam.fov = this.fov;
      this.cam.updateProjectionMatrix();
    }
    this.cam.updateMatrixWorld();
    this._drivePost(game, this._focusSmooth);
  }
}

/** Shortest-arc lerp between two angles. */
function angleLerp(a: number, b: number, t: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
