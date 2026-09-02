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
  /**
   * The subject's yaw, fixed at selection.
   *
   * **Not `yaw + faceOffset` read live**, which is what it used to be and what
   * made it impossible to orbit anything except an enemy. `pinFacing` writes
   * this onto the subject every frame; when it tracked the camera's own yaw the
   * subject turned exactly as fast as the camera did, so a drag moved the lens
   * and the model together and the silhouette never changed. Enemies were the
   * only family that worked, and only because `pinFacing` skips them.
   *
   * Captured once in `show()`, so the three-quarter is chosen relative to
   * wherever the camera was when the subject was staged — and after that the
   * camera is free to go anywhere around it, which is the entire point of a
   * turntable.
   */
  facing: number;
  _lights: THREE.Object3D[];
  /** The cyclorama floor. @see enter */
  _floor: THREE.Mesh | null;
  /** The contact shadow, resized per subject. @see show */
  _shadow: THREE.Mesh | null;
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
    this.facing = Math.PI + 0.7;
    this._lights = [];
    this._floor = null;
    this._shadow = null;
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

    // The key is 3.4, not 2.6, and the rim 1.4, not 1.1.
    //
    // The v2 audit's finding 7: "model lighting is flat, the frame is dominated
    // by the mid-grey backdrop sphere and auto-exposure keys off it; the model
    // reads muddy with no rim." Both halves of that are true and both are fixed
    // here — the backdrop's luminance comes down (see the shader below) and the
    // key comes up, so the lit side of a subject is measurably brighter than
    // the ground it stands against rather than merely different from it.
    // `studiocheck` asserts that ratio; @see the backdrop's own comment.
    const key = new THREE.DirectionalLight(0xfff2df, 3.4);
    key.position.set(4, 6, 5);
    const fill = new THREE.DirectionalLight(0x9fc0e4, 0.55);
    fill.position.set(-5, 2, -3);
    const rim = new THREE.DirectionalLight(0xcfe6ff, 1.4);
    rim.position.set(-2, 3.5, -6);
    const amb = new THREE.HemisphereLight(0xbcd6f5, 0x2a2622, 0.55);
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
            // Lifted about 1.6x from the values that fixed the audit's
            // "muddy, no rim" finding, and it is the EXPOSURE PIN that makes
            // that safe: with metering frozen -- StudioShell.pinExposure -- a
            // brighter ground no longer drags the whole frame down to meet it,
            // so the backdrop can be a room rather than a void. The measured
            // subject-to-backdrop ratio has the headroom -- 2.50x against a
            // bar of 1.3 -- and studiocheck holds it there.
            //
            // Still a GROUND and not a light. Dark enough that the key wins,
            // light enough that a model's own dark values are separable from
            // it, which is the thing a black background destroys and the whole
            // reason this sphere exists.
            vec3 lo = vec3(0.038, 0.044, 0.055);
            vec3 hi = vec3(0.108, 0.126, 0.155);
            gl_FragColor = vec4(mix(lo, hi, pow(h, 0.85)), 1.0);
          }`,
      }),
    );
    backdrop.name = 'studioBackdrop';
    backdrop.frustumCulled = false;
    this.group.add(backdrop);

    /*
     * The floor, and why the model was floating without it.
     *
     * A subject on a gradient with nothing under it reads as a cut-out, not as
     * an object: there is no scale, no contact, and no way to tell a creature
     * standing from a creature hovering — which is precisely what a review pass
     * is meant to catch. A photographer's answer to this is an infinity cove,
     * and that is what this is: a floor whose brightness falls off with
     * distance until it is indistinguishable from the wall behind it, so there
     * is a surface underfoot and no horizon line anywhere in frame.
     *
     * A disc rather than a plane, so the falloff is radial from the subject and
     * the same at every camera azimuth — a square floor shows its corners the
     * moment you orbit past 45 degrees.
     *
     * `RADIUS` is 60 m against a roster whose largest subject is a Titan: far
     * enough that the fade completes off-frame at every dolly distance
     * `fitFactor` produces, near enough that it never z-fights the 400 m
     * backdrop sphere.
     */
    const RADIUS = 60;
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(RADIUS, 64),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uFade: { value: 0.16 } },
        vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */`
          varying vec2 vP;
          uniform float uFade;
          void main(){
            // Distance from the subject, normalised on the disc's radius.
            float d = length(vP) / ${RADIUS.toFixed(1)};
            // Two falloffs multiplied: a tight one that keeps the pool of light
            // near the subject, and a wide one that carries the last of it to
            // the rim so the disc's edge never becomes a visible line.
            float near = 1.0 - smoothstep(0.0, 0.10, d);
            float far  = 1.0 - smoothstep(0.05, 1.0, d);
            float a = clamp(near * 0.55 + far * 0.45, 0.0, 1.0);
            // The disc has to DISSOLVE, not end. Without this the alpha never
            // reaches zero and the rim draws a hard straight line across the
            // frame -- a horizon, in the one kind of picture that must not have
            // one. An infinity cove is defined by the absence of that seam.
            float rim = 1.0 - smoothstep(0.42, 0.95, d);
            // Warmer than the wall by a hair. A neutral floor under a warm key
            // reads as grey card; a trace of the key's own colour in the bounce
            // is what makes it read as a floor in a room.
            vec3 lit  = vec3(0.150, 0.150, 0.152);
            vec3 cold = vec3(0.040, 0.046, 0.058);
            gl_FragColor = vec4(mix(cold, lit, a), (a * uFade + 0.55) * rim);
          }`,
      }),
    );
    floor.name = 'studioFloor';
    floor.rotation.x = -Math.PI / 2;
    floor.renderOrder = -1;
    this._floor = floor;
    this.group.add(floor);

    /*
     * The contact shadow, which is a painted ellipse and not a shadow map.
     *
     * A real shadow needs `renderer.shadowMap` on, and the studio inherits the
     * quality tier the page booted with — `?q=low` on a phone, where
     * `mobile-10x` recorded that shadows had been switched *off* for the
     * project's whole life. A stage whose contact shadow appears only on a
     * desktop is a stage that answers "is it touching the ground" differently
     * on the two devices it is reviewed on.
     *
     * So it is drawn: a radial falloff, scaled per subject from its own
     * footprint in `show()`. Deterministic, one draw call, identical at every
     * tier, and for a single object on a flat floor it is what a real shadow
     * would have looked like anyway.
     */
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {},
        vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */`
          varying vec2 vP;
          void main(){
            float d = length(vP);
            // Dense and small under the body, thinning fast: a contact shadow
            // is an occlusion term, not a silhouette projected onto the floor,
            // and a soft even disc reads as a stain rather than as contact.
            float a = (1.0 - smoothstep(0.0, 1.0, d));
            a = pow(a, 1.9) * 0.62;
            gl_FragColor = vec4(0.004, 0.006, 0.010, a);
          }`,
      }),
    );
    shadow.name = 'studioContact';
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 0;
    this._shadow = shadow;
    this.group.add(shadow);
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

    /*
     * Put the floor under the subject's feet, and the shadow under its
     * footprint.
     *
     * `box.min.y` rather than 0: most rigs are authored with the feet at the
     * origin, but a weapon is not, and a floor at 0 under a sword posed at
     * chest height would put the blade through it. The subject's own lowest
     * point is the only definition that is right for all five families.
     */
    const floorY = box.min.y;
    if (this._floor) this._floor.position.set(centre.x, floorY, centre.z);
    if (this._shadow) {
      // 0.62 of the wider horizontal axis. A quadruped's shadow should be the
      // length of the animal, not of a circle drawn around its diagonal, so it
      // is scaled per axis rather than uniformly.
      this._shadow.position.set(centre.x, floorY + 0.004, centre.z);
      this._shadow.scale.set(Math.max(0.2, size.x * 0.62), Math.max(0.2, size.z * 0.62), 1);
    }

    this.pivot.copy(centre);
    // On a tall viewport, aim slightly BELOW the subject's centre so it sits
    // higher in frame. The chrome is asymmetric on a phone — a 44 px header
    // against a bottom sheet and a 56 px action row — so the visible band's
    // centre is above the frame's, and a subject centred in the frame reads as
    // sitting in the bottom third. Which is exactly what the audit's finding 5
    // photographed. Zero on any landscape viewport, so no capture moves.
    if (aspectOf() < 1) this.pivot.y -= radius * 0.16;
    this.dist = Math.max(1.4, radius * fitFactor());
    this._needFrame = true;
    const quadruped = size.z > size.y * 1.3 || size.x > size.y * 1.3;
    this.faceOffset = quadruped ? 1.25 : 0.7;
    // Fixed here, and not moved again by an orbit. @see facing
    this.facing = this.yaw + this.faceOffset;
    return { size: Math.max(size.x, size.y, size.z), centre, radius };
  }

  /**
   * The yaw that turns the subject to a three-quarter, as chosen at selection.
   *
   * A constant between selections, deliberately. @see facing
   */
  subjectYaw() { return this.facing; }

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

/** The viewport's aspect. The renderer fills it, so this is the frustum's. */
function aspectOf(): number {
  if (typeof window === 'undefined') return 16 / 9;
  const w = window.innerWidth || 16;
  const h = window.innerHeight || 9;
  return h > 0 ? w / h : 16 / 9;
}

/**
 * Dolly distance as a multiple of the subject's radius, for THIS viewport.
 *
 * ## Why it is not 2.4 any more
 *
 * It was, and 2.4 is right — for a landscape frustum. The camera is a 50°
 * VERTICAL fov, so the horizontal half-angle is `atan(tan(25°) * aspect)`: at
 * 16:9 that is 39.7° and the vertical 25° is the binding constraint, which is
 * where 1/sin(25°) = 2.37 came from. Turn the phone upright and the aspect is
 * 0.6, the horizontal half-angle collapses to 15.6°, and the binding constraint
 * is now the *width* — a subject framed at 2.4 radii overflows the sides.
 *
 * So: fit whichever half-angle is smaller. **Measured**, with the 1.06 margin
 * that keeps a subject framed rather than jammed against the edges: 16:9 and a
 * landscape handset's 2.17 both return **2.508**, and a portrait phone at 0.60
 * returns **3.956** — 58% further back, which is the whole of the bug. The
 * landscape number is 4.5% wider than the 2.4 it replaces; nothing in the
 * corpus moves, because `?shoot` never opens the studio.
 *
 * The audit's finding 5 said "`ModelStage.show` frames from radius alone and
 * assumes a landscape frustum". This is that sentence, arithmetically.
 */
function fitFactor(): number {
  const FOV = 50;                                   // `Freecam.fov`'s default
  const vHalf = (FOV / 2) * Math.PI / 180;
  const hHalf = Math.atan(Math.tan(vHalf) * aspectOf());
  const bind = Math.min(vHalf, hHalf);
  // A margin, so a subject is framed rather than jammed against the edges.
  return 1.06 / Math.sin(bind);
}
