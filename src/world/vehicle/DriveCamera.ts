import * as THREE from 'three';
import { Noise } from '../../util/Noise.ts';
import type { VehicleBody } from './VehicleBody.ts';

/**
 * The driving camera.
 *
 * A separate rig from the on-foot `CameraRig` — it never touches it, it just
 * writes the camera transform later in the frame while the car is being
 * driven, and hands control straight back on exit.
 *
 * What makes a chase camera feel like a car rather than a floating gimbal:
 *
 * - **A long arm that grows with speed.** Standing still it sits close over the
 *   boot; at 180 km/h it is eight metres back and low, so the road fills the
 *   frame and the car reads as small and fast.
 * - **Look-ahead into corners.** The camera's yaw target leads the car's
 *   heading by a fraction of its yaw rate, so it swings toward the exit of a
 *   bend before the car gets there. Under a slide it does the opposite and
 *   hangs back toward the direction of travel, which is what makes the tail
 *   stepping out read as a slide instead of a steering input.
 * - **Speed FOV and speed shake.** Both scale off road speed, and the shake
 *   picks up hard the moment the tyres leave tarmac.
 *
 * Modes: `chase` (default), `cinematic` (low and long, for capture), `bonnet`
 * (first person over the wing mirrors).
 */


export class DriveCamera {
  _first!: boolean;
  _focus!: THREE.Vector3;
  _look!: THREE.Vector3;
  _lookSmooth!: THREE.Vector3;
  _noise!: Noise;
  _pos!: THREE.Vector3;
  _smooth!: THREE.Vector3;
  _t!: number;
  _terrain!: any;
  _tmp!: THREE.Vector3;
  armFar!: number;
  armNear!: number;
  baseFov!: number;
  cam!: THREE.PerspectiveCamera;
  cinOffset!: number;
  fov!: any;
  fovGain!: number;
  fovMax!: number;
  freePitch!: number;
  freeYaw!: number;
  heightFar!: number;
  heightNear!: number;
  mode!: string;
  modes!: string[];
  pitch!: number;
  trauma!: number;
  yaw!: number;
  constructor(camera: THREE.PerspectiveCamera) {
    this.cam = camera;
    this.mode = 'chase';
    this.modes = ['chase', 'cinematic', 'bonnet'];

    this.yaw = 0;
    this.freeYaw = 0;          // player look offset, recentres itself
    this.freePitch = 0;
    this.pitch = 0.13;

    // The Regalia is 6.4 m long, so an arm that would frame a hatchback puts
    // the lens on the boot lid. These are measured back from the *centre* of
    // the car, which means the tail is already 3.2 m of it.
    this.armNear = 8.1;
    this.armFar = 10.8;
    this.heightNear = 2.55;
    this.heightFar = 2.35;
    this.baseFov = 46;
    this.fovGain = 0.26;       // degrees per m/s
    this.fovMax = 14;
    /** Sideways offset of the cinematic angle — a three-quarter, not astern. */
    this.cinOffset = 3.4;

    this.fov = this.baseFov;
    this.trauma = 0;

    this._pos = new THREE.Vector3();
    this._focus = new THREE.Vector3();
    this._smooth = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._lookSmooth = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._noise = new Noise(77451);
    this._t = 0;
    this._first = true;
  }

  /** Snap the rig to the car — call on entry so there is no swoop. */
  reset(body: VehicleBody) {
    this.yaw = body.heading;
    this.freeYaw = 0; this.freePitch = 0;
    this._first = true;
    this.fov = this.baseFov;
  }

  /** @param m one of `modes` */
  setMode(m: string) { if (this.modes.includes(m)) this.mode = m; }

  /** Cycle to the next mode. @returns */
  cycleMode(): string {
    this.mode = this.modes[(this.modes.indexOf(this.mode) + 1) % this.modes.length];
    return this.mode;
  }

  /** Add camera shake, 0..1. */
  addTrauma(v: number) { this.trauma = Math.min(1, this.trauma + v); }

  /**
   * @param [look] free-look delta this frame
   */
  update(dt: number, body: import('./VehicleBody.ts').VehicleBody, look?: {lookX?:number, lookY?:number} | null) {
    this._t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const speed = body.speed;
    const t = Math.min(1, speed / body.vMax);

    // free look decays back to centre
    if (look) {
      this.freeYaw -= (look.lookX || 0) * 0.0032;
      this.freePitch = clamp(this.freePitch + (look.lookY || 0) * 0.0024, -0.35, 0.62);
    }
    this.freeYaw = damp(this.freeYaw, 0, 1.4, dt);
    this.freePitch = damp(this.freePitch, 0, 1.2, dt);

    if (this.mode === 'bonnet') { this._bonnet(dt, body); return; }

    // ---- yaw: follow the car, lead into corners, hang back in a slide ------
    // The direction of travel and the direction the car points diverge in a
    // slide; blending toward travel is what sells it.
    const travelYaw = speed > 2 ? Math.atan2(body.vel.x, body.vel.z) : body.heading;
    let want = angleLerp(body.heading, travelYaw, Math.min(0.55, body.slide * 0.9));
    want += clamp(body.yawRate * 0.30, -0.34, 0.34);      // look-ahead into the bend
    want += this.freeYaw;
    const follow = this.mode === 'cinematic' ? 2.6 : 3.4 + t * 3.2;
    this.yaw = angleLerp(this.yaw, want, 1 - Math.exp(-follow * dt));

    // ---- arm ---------------------------------------------------------------
    const cin = this.mode === 'cinematic';
    const arm = lerp(cin ? 8.4 : this.armNear, cin ? 11.0 : this.armFar, t) + body.slide * 1.4;
    const h = lerp(cin ? 0.95 : this.heightNear, cin ? 1.15 : this.heightFar, t);
    const pitchWant = (cin ? 0.005 : 0.075) + this.freePitch - body.pitch * 0.35;
    this.pitch = damp(this.pitch, pitchWant, 6, dt);

    // The camera hangs behind the *car*, and looks well ahead of it, so the
    // road ahead is the subject and the Regalia is the foreground it runs on.
    const f = body.forward();
    const cp = Math.cos(this.pitch);
    this._tmp.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).normalize();
    this._pos.copy(body.pos).addScaledVector(this._tmp, -arm);
    this._pos.y += h;
    if (cin) {
      // step off the centreline so the car presents a flank as well as a tail
      const r = body.right();
      this._pos.addScaledVector(r, this.cinOffset);
    }

    this._focus.copy(body.pos);
    this._focus.y += cin ? 0.95 : 1.35;
    this._focus.addScaledVector(f, cin ? lerp(2.0, 5.0, t) : lerp(6.0, 20.0, t));

    // ---- terrain clearance --------------------------------------------------
    const terrain = this._terrain;
    if (terrain) {
      const gy = terrain.heightAt(this._pos.x, this._pos.z) + (cin ? 0.55 : 1.15);
      if (this._pos.y < gy) this._pos.y = gy;
    }

    if (this._first) { this._smooth.copy(this._pos); this._lookSmooth.copy(this._focus); this._first = false; }
    else {
      const lam = 11 + t * 6;
      this._smooth.x = damp(this._smooth.x, this._pos.x, lam, dt);
      this._smooth.y = damp(this._smooth.y, this._pos.y, lam * 0.62, dt);
      this._smooth.z = damp(this._smooth.z, this._pos.z, lam, dt);
      this._lookSmooth.x = damp(this._lookSmooth.x, this._focus.x, 13, dt);
      this._lookSmooth.y = damp(this._lookSmooth.y, this._focus.y, 8, dt);
      this._lookSmooth.z = damp(this._lookSmooth.z, this._focus.z, 13, dt);
    }

    // ---- speed shake ---------------------------------------------------------
    const jolt = this.trauma + body.rough * 0.55 * Math.min(1, speed / 12) + t * 0.16 + body.slide * 0.2;
    if (jolt > 0.002) {
      const s = jolt * jolt;
      const n = (o: number) => this._noise.simplex2(this._t * 15.0, o);
      this._smooth.x += n(0.0) * s * 0.30;
      this._smooth.y += n(11.3) * s * 0.24;
      this._smooth.z += n(23.7) * s * 0.30;
    }

    // ---- lens ---------------------------------------------------------------
    const wantFov = this.baseFov + Math.min(this.fovMax, speed * this.fovGain) + body.slide * 3.5;
    this.fov = damp(this.fov, cin ? wantFov - 10 : wantFov, 3.2, dt);

    this.cam.position.copy(this._smooth);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(this._lookSmooth);
    // roll the frame slightly with the car — a few degrees is plenty
    this.cam.rotateZ(-body.roll * 0.30 - clamp(body.yawRate * 0.035, -0.05, 0.05));
    this._commitFov();
  }

  /**
   * Bonnet cam. Mounted on the wing just ahead of the windscreen, not in the
   * driver's seat — a first-person camera placed at the driver's eyeline sits
   * *inside* Ignis's head, and the nose of the car in the bottom of frame is
   * what makes a bonnet view read as a car at all.
   */
  _bonnet(dt: number, body: VehicleBody) {
    const f = body.forward(), r = body.right();
    this._pos.copy(body.pos)
      .addScaledVector(f, 0.85)
      .addScaledVector(r, -0.26);
    this._pos.y += 1.52;
    // the head bobs with the body, not with the camera spring
    const jolt = body.rough * 0.35 * Math.min(1, body.speed / 12) + this.trauma;
    const n = (o: number) => this._noise.simplex2(this._t * 12.0, o);
    this._pos.y += n(3.3) * jolt * 0.10;

    this._look.copy(this._pos)
      .addScaledVector(f, 18)
      .addScaledVector(r, Math.sin(this.freeYaw) * 18);
    this._look.y += -body.pitch * 14 + this.freePitch * 9 - 2.4;

    if (this._first) { this._smooth.copy(this._pos); this._lookSmooth.copy(this._look); this._first = false; }
    else {
      this._smooth.lerp(this._pos, Math.min(1, dt * 26));
      this._lookSmooth.lerp(this._look, Math.min(1, dt * 14));
    }
    this.fov = damp(this.fov, 62 + Math.min(16, body.speed * 0.30), 3.2, dt);
    this.cam.position.copy(this._smooth);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(this._lookSmooth);
    this.cam.rotateZ(-body.roll * 0.55);
    this._commitFov();
  }

  _commitFov() {
    if (Math.abs(this.cam.fov - this.fov) > 1e-3) {
      this.cam.fov = this.fov;
      this.cam.updateProjectionMatrix();
    }
    this.cam.updateMatrixWorld();
  }
}

function clamp(v: number, a: number, b: number) { return v < a ? a : v > b ? b : v; }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function damp(a: any, b: number, lambda: number, dt: any) { return b + (a - b) * Math.exp(-lambda * dt); }
function angleLerp(a: number, b: any, t: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
