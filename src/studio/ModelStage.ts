import * as THREE from 'three';
import type { Freecam } from '../dev/Freecam.ts';

/**
 * A turntable for one model, in an otherwise empty scene.
 *
 * ## Why this is not `dev/Stage`
 *
 * `dev/Stage` hides the world by walking `scene.children` and clearing
 * `visible` on everything that is not a light or the sky, then borrows the
 * game's sun. Every line of that exists because it is an overlay: there is a
 * world in the way and a light rig it must not disturb.
 *
 * Here there is no world. The Model Explorer boots **zero** game systems, so
 * the scene holds this group and nothing else, and there is nothing to hide.
 * What survives from `Stage` is the part that was actually about *looking at a
 * model*: bounds-derived framing, a three-quarter key, and a wider turn for a
 * long-bodied subject than for a biped.
 *
 * ## Why it may add its own lights
 *
 * `engine/LightBudget.ts` pins the game's light counts because changing them
 * re-keys every material's program, and one such toggle was measured
 * recompiling 43 programs in a 9.5 s freeze. That constraint is about *the
 * game's* scene and its hundreds of shared materials. This scene contains one
 * model built for this view; its three lights key three programs and nothing
 * else in the page recompiles, because there is nothing else in the page.
 */

/** Bounds and framing for whatever is on the turntable. */
export interface Framing {
  /** Longest axis of the bind-pose bounds, metres. */
  size: number;
  centre: THREE.Vector3;
  radius: number;
}

export class ModelStage {
  group: THREE.Group;
  /** The subject, or null between selections. */
  current: THREE.Object3D | null;
  pivot: THREE.Vector3;
  /** Orbit azimuth, radians. */
  yaw: number;
  pitch: number;
  dist: number;
  spin: boolean;
  rate: number;
  /**
   * How far off dead-on the subject is turned.
   *
   * Dead-on is the least informative angle there is. A long-bodied creature
   * needs much more of a turn than a biped, because head-on a quadruped is a
   * face and no body at all — so this is set from the bounds, not fixed.
   */
  faceOffset: number;
  _lights: THREE.Object3D[];
  _needFrame: boolean;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'studioStage';
    this.current = null;
    this.pivot = new THREE.Vector3();
    this.yaw = Math.PI;
    this.pitch = 0.18;
    this.dist = 6;
    this.spin = false;
    this.rate = 0.35;
    this.faceOffset = 0.7;
    this._lights = [];
    this._needFrame = false;
  }

  /**
   * Put the stage into a scene, with its own three-point rig.
   *
   * A key at three-quarters, a cool fill opposite to keep the shadow side from
   * going black, and a rim behind to separate the silhouette from the
   * background — the standard setup for judging form, and the reason a model
   * reviewed here reads the same way twice.
   */
  enter(scene: THREE.Scene) {
    if (this._lights.length) return;
    scene.add(this.group);

    const key = new THREE.DirectionalLight(0xfff2df, 2.6);
    key.position.set(4, 6, 5);
    const fill = new THREE.DirectionalLight(0x9fc0e4, 0.55);
    fill.position.set(-5, 2, -3);
    const rim = new THREE.DirectionalLight(0xcfe6ff, 1.1);
    rim.position.set(-2, 3.5, -6);
    const amb = new THREE.HemisphereLight(0xbcd6f5, 0x2a2622, 0.7);
    this._lights = [key, fill, rim, amb];
    for (const l of this._lights) this.group.add(l);

    // A neutral studio backdrop rather than the page's black: a model against
    // black loses its own dark values, which is precisely what you came to
    // judge. BRIEF rule 1 forbids an image, so it is a vertical gradient on a
    // large sphere rendered from the inside.
    const backdrop = new THREE.Mesh(
      new THREE.SphereGeometry(400, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {},
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec3 vP;
          void main(){
            float h = clamp(vP.y / 400.0 * 0.5 + 0.5, 0.0, 1.0);
            vec3 lo = vec3(0.055, 0.062, 0.075);
            vec3 hi = vec3(0.16, 0.19, 0.235);
            gl_FragColor = vec4(mix(lo, hi, pow(h, 0.85)), 1.0);
          }`,
      }),
    );
    backdrop.name = 'studioBackdrop';
    backdrop.frustumCulled = false;
    this.group.add(backdrop);
  }

  exit(scene: THREE.Scene) {
    this.clear();
    scene.remove(this.group);
    this.group.clear();
    this._lights = [];
  }

  /** Drop whatever is on the turntable. */
  clear() {
    if (this.current) {
      this.group.remove(this.current);
      this.current = null;
    }
  }

  /**
   * Put a subject on the turntable and frame it from its real bounds.
   *
   * From the bounds rather than a fixed dolly, because the roster spans a 0.9 m
   * goblin to a Titan and one distance cannot serve both. A degenerate box —
   * which a skinned mesh with no built bounding volume will happily report — is
   * caught rather than trusted, or the camera ends up hundreds of metres away
   * framing empty background.
   */
  show(obj: THREE.Object3D): Framing {
    this.clear();
    this.current = obj;
    this.group.add(obj);
    // Reparenting invalidates every descendant's world matrix, and
    // `Box3.setFromObject` reads world matrices.
    obj.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.5;

    if (!Number.isFinite(radius) || radius <= 0.01) {
      this.pivot.set(0, 1, 0);
      this.dist = 4;
      this._needFrame = true;
      return { size: 1, centre: this.pivot.clone(), radius: 1 };
    }

    this.pivot.copy(centre);
    // 2.4 rather than `dev/Stage`'s 3.1. That number was chosen for a model
    // standing in a world, where some context around it is the point; here the
    // frame holds one subject on an empty backdrop and the extra distance is
    // just wasted pixels.
    this.dist = Math.max(1.4, radius * 2.4);
    this._needFrame = true;
    const quadruped = size.z > size.y * 1.3 || size.x > size.y * 1.3;
    this.faceOffset = quadruped ? 1.25 : 0.7;
    return { size: Math.max(size.x, size.y, size.z), centre, radius };
  }

  /** The yaw that turns the subject to a three-quarter for this camera. */
  subjectYaw() { return this.yaw + this.faceOffset; }

  /**
   * Advance the turntable and park the camera.
   *
   * Only writes the camera when it has something to say — a spin step or a
   * re-frame after a selection — so manual orbiting is not fought for the
   * transform on every frame.
   */
  update(dt: number, cam: Freecam) {
    if (!this.spin && !this._needFrame) return;
    this._needFrame = false;
    if (this.spin) this.yaw += this.rate * dt;
    const cp = Math.cos(this.pitch);
    cam.pos.set(
      this.pivot.x + Math.sin(this.yaw) * this.dist * cp,
      this.pivot.y + Math.sin(this.pitch) * this.dist,
      this.pivot.z + Math.cos(this.yaw) * this.dist * cp,
    );
    cam.lookAt(this.pivot.x, this.pivot.y, this.pivot.z);
  }

  /** Orbit by hand. Radians; `d` is a drag delta already scaled by the shell. */
  orbit(dYaw: number, dPitch: number) {
    this.yaw += dYaw;
    this.pitch = Math.max(-1.2, Math.min(1.3, this.pitch + dPitch));
    this._needFrame = true;
  }

  /** Dolly. `k` is a multiplier, so a wheel notch is scale-free. */
  zoom(k: number) {
    this.dist = Math.max(0.4, Math.min(400, this.dist * k));
    this._needFrame = true;
  }
}
