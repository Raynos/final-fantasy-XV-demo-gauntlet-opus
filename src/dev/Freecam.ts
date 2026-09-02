import * as THREE from 'three';
import type { PostFX } from '../engine/PostFX.ts';
import type { Input } from '../engine/Input.ts';

/**
 * A detached fly camera for reviewing the world.
 *
 * **It deliberately does not go through `CameraRig.setShot()`.** That path
 * re-clamps the camera to `terrain.heightAt(...) + 1.35` every frame
 * (`CameraRig.lateUpdate`), which is right for an authored shot and fatal for a
 * review camera: you could never drop below the surface to check a cave roof,
 * sit under an overhang, or look up at a cliff face from the valley floor.
 * Instead `DevSuite` runs last and writes `game.camera` directly *after*
 * `CameraRig` has already had its say, so whatever the rig computed is simply
 * overwritten.
 *
 * Two modes, matching the distinction every mature engine draws:
 *   - **eject** — detach the camera, simulation keeps running. For watching AI,
 *     animation and streaming behave from an angle the shot list never covers.
 *   - **pause** — `game.paused = true` first. `Game.frame()` skips `update()`
 *     but still runs every `lateUpdate()`, so the world freezes while this
 *     camera keeps flying. That property is why the freecam lives in
 *     `lateUpdate` and not `update`.
 *
 * Mouse look is handled here rather than through `Input`, because `Input.update`
 * zeroes `look` whenever `input.enabled === false` — which is exactly what we do
 * to stop WASD also walking the player around while we fly.
 */
export class Freecam {
  _dx!: number;
  _dy!: number;
  _e!: THREE.Euler;
  _fwd!: THREE.Vector3;
  _look!: boolean;
  _onDown!: (e: MouseEvent) => void;
  _onMove!: (e: MouseEvent) => void;
  _onUp!: (e: MouseEvent) => void;
  _onWheel!: (e: WheelEvent) => void;
  _q!: THREE.Quaternion;
  _right!: THREE.Vector3;
  _vel!: THREE.Vector3;
  boost!: number;
  crawl!: number;
  damping!: number;
  enabled!: boolean;
  fov!: number;
  pitch!: number;
  pos!: THREE.Vector3;
  roll!: number;
  sensitivity!: number;
  speed!: number;
  yaw!: number;
  /**
   * Analogue travel, added to the keyboard's — for a device with no keyboard.
   *
   * `update` reads `input.key('KeyW')` and friends, which is right for the dev
   * suite and answers nothing at all on a phone. The studio's mobile shell
   * writes these instead, in the same -1..1 the key pair produces, so one
   * integrator serves both and a thumb and a keyboard cannot drift apart.
   *
   * Summed rather than switched: a tablet with a keyboard attached should be
   * able to use both, and the sum is clamped to the unit box below.
   */
  axes!: { fwd: number, strafe: number, lift: number };
  constructor() {
    this.enabled = false;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.fov = 50;

    /** Metres per second at neutral throttle. Scroll wheel scales it. */
    this.speed = 24;
    this.boost = 8;      // Shift
    this.crawl = 0.12;   // Ctrl — for inspecting a face at arm's length
    this.damping = 12;   // higher is snappier; low values drift like a drone
    this.sensitivity = 0.0022;

    this._vel = new THREE.Vector3();
    this.axes = { fwd: 0, strafe: 0, lift: 0 };
    this._dx = 0;
    this._dy = 0;
    this._look = false;
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();

    this._onMove = (e: MouseEvent) => {
      // Look while the pointer is locked, or while a button is held if it is
      // not. Requiring a drag is the only thing that works when a menu screen
      // has released the lock, and it costs nothing when the lock is active.
      if (!this._look && !document.pointerLockElement) return;
      this._dx += e.movementX || 0;
      this._dy += e.movementY || 0;
    };
    this._onDown = (e: MouseEvent) => { if (e.button === 0 || e.button === 2) this._look = true; };
    this._onUp = (e: MouseEvent) => { if (e.button === 0 || e.button === 2) this._look = false; };
    this._onWheel = (e: WheelEvent) => {
      if (!this.enabled) return;
      // Wheel trims travel speed rather than dollying: on an 8 km world the
      // useful range spans three orders of magnitude and a fixed speed is
      // either uselessly slow or uncontrollable.
      this.speed = THREE.MathUtils.clamp(this.speed * (e.deltaY < 0 ? 1.25 : 0.8), 0.25, 4000);
    };
  }

  /**
   * Turn the camera by a raw pointer delta, in the same units `mousemove`
   * reports. For a drag on a touchscreen, where there is no `movementX`.
   */
  look(dx: number, dy: number) {
    this._dx += dx;
    this._dy += dy;
  }

  /**
   * Adopt a camera's current transform as the flying pose — this is "eject".
   * Framing continues from exactly where the shot left off rather than snapping
   * to some arbitrary default, which is the whole point of ejecting.
   */
  adopt(camera: THREE.Camera) {
    this.pos.copy(camera.position);
    this._e.setFromQuaternion(camera.quaternion, 'YXZ');
    this.yaw = this._e.y;
    this.pitch = this._e.x;
    this.roll = 0;
    // Round on adopt: a raw perspective fov carries 14 decimals and every
    // console listing and exported framing would inherit them.
    const persp = camera as THREE.PerspectiveCamera;
    if (persp.fov) this.fov = Math.round(persp.fov * 10) / 10;
    this._vel.set(0, 0, 0);
    this._dx = this._dy = 0;
  }

  /** @param on @param camera */
  setEnabled(on: boolean, camera: THREE.Camera) {
    if (on === this.enabled) return;
    this.enabled = on;
    if (on) {
      if (camera) this.adopt(camera);
      window.addEventListener('mousemove', this._onMove);
      window.addEventListener('mousedown', this._onDown);
      window.addEventListener('mouseup', this._onUp);
      window.addEventListener('wheel', this._onWheel, { passive: true });
    } else {
      window.removeEventListener('mousemove', this._onMove);
      window.removeEventListener('mousedown', this._onDown);
      window.removeEventListener('mouseup', this._onUp);
      window.removeEventListener('wheel', this._onWheel);
      this._look = false;
    }
  }

  /**
   * Integrate one frame of flight.
   *
   * Uses `input.key()` (the raw held-key set) rather than `input.move`, because
   * `DevSuite` sets `input.enabled = false` while flying so the same WASD press
   * does not also walk Noctis across the map — and that zeroes `input.move`.
   *
   * @param dt seconds
   * @param input the engine Input
   */
  update(dt: number, input: Input) {
    if (!this.enabled) return;

    this.yaw -= this._dx * this.sensitivity;
    this.pitch -= this._dy * this.sensitivity;
    this._dx = this._dy = 0;
    // Stop just short of the poles: at exactly +-90 degrees the YXZ decomposition
    // loses yaw entirely and the camera snaps to a random heading.
    this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);

    const k = (c: string) => (input.key(c) ? 1 : 0);
    const u = (v: number) => THREE.MathUtils.clamp(v, -1, 1);
    const fwd = u(k('KeyW') - k('KeyS') + this.axes.fwd);
    const strafe = u(k('KeyD') - k('KeyA') + this.axes.strafe);
    const lift = u(k('KeyE') - k('KeyQ') + this.axes.lift);

    let mul = this.speed;
    if (input.key('ShiftLeft') || input.key('ShiftRight')) mul *= this.boost;
    if (input.key('ControlLeft') || input.key('ControlRight')) mul *= this.crawl;

    this._e.set(this.pitch, this.yaw, 0, 'YXZ');
    this._q.setFromEuler(this._e);
    this._fwd.set(0, 0, -1).applyQuaternion(this._q);
    this._right.set(1, 0, 0).applyQuaternion(this._q);

    const want = this._fwd.clone().multiplyScalar(fwd)
      .addScaledVector(this._right, strafe);
    want.y += lift;                       // world-up lift, not camera-up: rising
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(mul);  // while pitched
                                          // down should still gain altitude
    // Critically-damped approach so the camera has weight. A raw position
    // integration reads as a jitter cam in any capture taken from it.
    const a = 1 - Math.exp(-this.damping * dt);
    this._vel.lerp(want, a);
    this.pos.addScaledVector(this._vel, dt);
  }

  /**
   * Write the flying pose onto the real camera. Called after `CameraRig` has
   * run, so it wins.
   */
  apply(camera: THREE.PerspectiveCamera) {
    if (!this.enabled) return;
    this._e.set(this.pitch, this.yaw, this.roll, 'YXZ');
    camera.position.copy(this.pos);
    camera.quaternion.setFromEuler(this._e);
    if (camera.fov !== this.fov) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
  }

  /**
   * Jump somewhere discontinuous.
   *
   * `post` must be cut as well as the transform: TAA history and the DOF focus
   * integrator both smear across a teleport otherwise. This is exactly what
   * `CameraRig._cut()` does for an authored shot change.
   * @param to @param [post]
   */
  jump(to: THREE.Vector3 | number[], post?: PostFX) {
    if (Array.isArray(to)) this.pos.set(to[0], to[1], to[2]);
    else this.pos.copy(to);
    this._vel.set(0, 0, 0);
    if (post) {
      if (post.resetHistory) post.resetHistory();
      if (post.snapFocus) post.snapFocus();
    }
  }

  /** Aim at a world point from where we are. */
  lookAt(x: number, y: number, z: number) {
    const dx = x - this.pos.x, dy = y - this.pos.y, dz = z - this.pos.z;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }

  /** `{pos, target, fov}` in the exact shape `Shots.ts` stores. */
  asShot() {
    this._e.set(this.pitch, this.yaw, 0, 'YXZ');
    this._q.setFromEuler(this._e);
    const f = this._fwd.set(0, 0, -1).applyQuaternion(this._q);
    const r = (n: number) => Number(n.toFixed(1));
    return {
      pos: [r(this.pos.x), r(this.pos.y), r(this.pos.z)],
      target: [r(this.pos.x + f.x * 30), r(this.pos.y + f.y * 30), r(this.pos.z + f.z * 30)],
      fov: Number(this.fov.toFixed(1)),
    };
  }
}
