import * as THREE from 'three';
import { Noise } from '../util/Noise.ts';
import { CameraOccluders } from './CameraOccluders.ts';
import { isVector3 } from '../util/three-guards.ts';
import type { Game } from './Game.ts';
import type { FollowShot } from './Shots.ts';


const UP = new THREE.Vector3(0, 1, 0);

/**
 * A framing the rig is locked to, as `setShot` receives it.
 *
 * `pos` and `target` are mutable `number[]`, not `Shots.Vec3`: a follow shot
 * rewrites both every frame, and the ground clamp in `lateUpdate` raises
 * `pos[1]`. `Game.applyShot` therefore hands over a *copy* of the authored
 * arrays — passing `SHOTS[name].pos` straight through meant the clamp wrote the
 * raised height back into the shot table.
 */
export interface CameraShot {
  pos: number[];
  target: number[];
  /** Vertical field of view in degrees; the current lens is kept if omitted. */
  fov?: number;
  /**
   * Camera roll in radians, applied after the look-at. Read by `lateUpdate`;
   * no caller in the tree passes it — the cutscene camera rolls through
   * `Cinematics`, which does not go via `setShot`.
   */
  roll?: number;
}

/**
 * Third-person game camera.
 *
 * A spring arm with real collision (a swept probe against the terrain and
 * against the near boulders `CameraOccluders` keeps, with a fast push-in and a
 * slow recover), separate position and rotation damping, velocity look-ahead,
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
  cam!: THREE.PerspectiveCamera;
  combatFraming!: number;
  distance!: number;
  followShot!: FollowShot | null;
  fov!: number;
  fovMax!: number;
  fovSpeedGain!: number;
  game!: Game;
  handheld!: number;
  height!: number;
  /**
   * Combat framing target — see `setLockOn`, which `CombatSystem._frameCombat`
   * feeds from the live encounter. (`CombatSystem.setLockOn` is a different
   * thing entirely: it drives the HUD reticle, not the camera.)
   */
  lockOn!: THREE.Object3D | THREE.Vector3 | null;
  /**
   * How tall the lock-on target is, metres. `setLockOn`'s second argument.
   *
   * The arm length in combat is a function of the target's own silhouette and
   * not of how far away it is — see the framing block in `lateUpdate`.
   */
  lockHeight!: number;
  /** Damped lock-on point. Raw enemy roots jitter at the animation rate. */
  _lockSmooth!: THREE.Vector3;
  /** True until `_lockSmooth` has been seeded, i.e. on a target change. */
  _lockFirst!: boolean;
  /** Damped combat arm length, so a target change is a glide and not a cut. */
  _framedDist!: number;
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
  /**
   * Metres of air the lens keeps above the ground directly under it.
   *
   * Named because the playtest measured it: "on a slope the camera sits 0.7 m
   * above the ground beneath it". It was `probeRadius + 0.42` written twice —
   * once in `_armDistance`'s hit test and once in the ground floor — and those
   * two must agree or the arm stops somewhere the floor then lifts out of.
   */
  groundClearance!: number;
  /**
   * Near-lens boulder proxies. `CameraRig` has never collided with a prop; see
   * `CameraOccluders` for why this is not `CollisionWorld`.
   */
  occluders!: CameraOccluders;
  /**
   * Ablation knob for the occluder push-out — `probes/fightcam.mts` turns it
   * off and on inside one run to price the fix against itself, which is the
   * only honest A/B on a world this deterministic.
   */
  occluderPush!: boolean;
  /**
   * Ablation knob for the slope lift — `probes/camview.mts --set
   * __CV_ABLATE=slopeLift` prices it against itself over the same poses.
   */
  slopeLift!: boolean;
  /**
   * Ablation knob for the focus-out-of-the-hillside clamp — `probes/camsteep.mts`
   * sprints the same slope twice with it off and on. It is the one that carries
   * the playtest's frame; see the block in `lateUpdate`.
   */
  focusClear!: boolean;
  /**
   * Radians of pitch the slope lift is currently adding, damped. Read-only
   * from outside; `_liftFor` computes where it is heading.
   */
  _lift!: number;
  /**
   * The one creature currently hidden because the lens is inside it, if any.
   * See the block at the end of `lateUpdate`.
   */
  _hidBody!: { root: THREE.Object3D } | null;
  restDistance!: number;
  rotDamp!: number;
  sensitivity!: number;
  shakeFreq!: number;
  shakePos!: number;
  shakeRot!: number;
  shot!: CameraShot | null;
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
    this.groundClearance = 0.74;
    this.occluders = new CameraOccluders();
    this.occluderPush = true;
    this.slopeLift = true;
    this.focusClear = true;
    this._hidBody = null;
    this._lift = 0;
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
    this.lockHeight = 1.6;
    this._lockSmooth = new THREE.Vector3();
    this._lockFirst = true;
    this._framedDist = this.restDistance;
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
  setShot(shot: CameraShot) {
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

  /**
   * Lock-on framing target (an `Object3D`, a world point, or null).
   *
   * @param target what to frame. An enemy's `root` sits at its FEET, so the
   *   framing block lifts the point by `0.55 * height` to put the body in
   *   frame rather than the ground under it.
   * @param [height] the target's height in metres. This is the arm-length
   *   knob: the camera comes IN for a sabertusk and backs off for a boss.
   */
  setLockOn(target: THREE.Object3D | THREE.Vector3 | null, height = 1.6) {
    const next = target || null;
    if (next !== this.lockOn) this._lockFirst = true;
    this.lockOn = next;
    this.lockHeight = Math.max(0.4, height);
  }

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
      const R = this.probeRadius;
      // Step no further than the probe radius, or the sphere tunnels straight
      // through a ridge thinner than one step. The old fixed 8 steps was 0.7 m
      // apart on a 5.5 m arm, more than twice the sphere it was meant to sweep.
      //
      // Lateral sampling around the arm axis -- four points on the sphere's
      // equator, the literal swept sphere -- was built and then removed as a
      // measured negative. It moved the lens-inside-terrain rate 4.77% -> 4.28%
      // for five times the terrain queries, and once the ground floor in
      // `lateUpdate` landed it was worth exactly nothing. See that floor.
      const steps = Math.max(8, Math.ceil(wanted / Math.max(R, 0.05)));

      for (let i = 1; i <= steps; i++) {
        const t = (i / steps) * wanted;
        const cx = focus.x + dir.x * t;
        const cy = focus.y + dir.y * t;
        const cz = focus.z + dir.z * t;
        const hit = cy < terrain.heightAt(cx, cz) + this.groundClearance;

        if (hit) {
          // Stop at the last step that was clear. With a step no coarser than
          // the probe radius the last-clear step is within R of the true
          // crossing, which is the accuracy the sphere has anyway.
          d = Math.max(this.minDistance, ((i - 1) / steps) * wanted);
          break;
        }
      }
    }

    // ---- and now the props, which for eighteen months were not swept at all.
    //
    // What used to be here was a raycast against `Props.cameraColliders ||
    // .colliders || .collisionMeshes`, none of which `Props` has ever had, so
    // the list was always empty and the ray never ran. That dead branch is the
    // whole of lane 11's `f-engage` frame — the camera inside a boulder at the
    // instant a fight starts — and of the playtest's "fights happen inside a
    // hill": `probes/camview.mts` clears the heightfield (0.00% of 2592 combat
    // poses put Noctis behind the ground), so the hill was a rock.
    //
    // `CameraOccluders` keeps the two dozen boulders within an arm's length as
    // bounding spheres, rebuilt twice a second, which is a ray-sphere test and
    // not a raycast against an instanced group — the reason the old comment
    // gave for not doing this at all.
    if (this.occluderPush && this.occluders.count) {
      // `minDistance` is NOT the floor here, and that was the first fix's own
      // bug: measured, it left 19.8% of combat frames still inside a rock.
      // 1.1 m is a *comfort* minimum for a camera being crowded by a hill; a
      // boulder 0.6 m behind Noctis' shoulder is not a comfort question, and
      // clamping to 1.1 m there puts the lens through the rock face rather
      // than short of it. Over the shoulder at 40 cm is a real shot. Being
      // inside the rock is not a shot at all -- and neither is the case
      // `CameraOccluders.arm` exists for, where Noctis is inside the rock
      // himself and the arm has to come out through the far side.
      d = this.occluders.arm(focus.x, focus.y, focus.z, dir.x, dir.y, dir.z,
        wanted, d, this.probeRadius, SOLID_MIN);
    }
    return d;
  }

  /**
   * The arm length at one candidate orbit, with no side effects the caller
   * has to unpick. `_liftFor` calls it up to six times a frame.
   */
  _armAt(game: Game, focus: THREE.Vector3, yaw: number, pitch: number, wanted: number) {
    const cp = Math.cos(pitch);
    _dirP.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).normalize();
    return this._armDistance(game, focus, _dirP, wanted);
  }

  /**
   * Radians of extra pitch that would let the arm out again — the fix for the
   * playtest's worst frame.
   *
   * **What it is for.** "Sprinting uphill: at 40 s the camera was 2.1 m behind
   * Noctis; by 60 s and still at 80 s the entire screen was a featureless wall
   * of brown dirt. Measured: camera distance collapsed 5.2 m -> 1.4 m as I
   * climbed." Both halves of that are one geometry. Behind a player on a
   * 30-degree slope the ground rises 0.58 m per metre and a 0.22 rad arm rises
   * 0.22, so the arm runs into the hillside at 2.5 m and there is no arm length
   * that fixes it: the lens is standing in the slope, and everything in front
   * of it is the slope. `probes/camview.mts` measures it as **10.59% of steep
   * poses with the arm crushed below 2.5 m and 9.15% of them WALLED**, no part
   * of the frame reaching the horizon at all.
   *
   * The arm is not the only degree of freedom. Pitch is the other one, and it
   * is the one the geometry is asking for: at 0.6 rad the same slope stops
   * blocking the same arm entirely, and a camera 34 degrees above a hillside is
   * a normal third-person shot that shows the hill, the way around it, and the
   * horizon past it. This is why the ground floor already exists — it is the
   * same instinct applied to the lens rather than to the orbit, and it lifts
   * the lens 0.74 m, which on a slope is nothing.
   *
   * Deliberately NOT a push: `probes/camlook.mts` photographed a radial push-out
   * turning a legible frame into a wall of rock, and the reason it gave is the
   * reason this is on the orbit — the shot cares about pitch and does not care
   * about a direction picked by an ellipsoid's gradient. The player's own pitch
   * is untouched, so this decays back to whatever they were holding.
   *
   * Pure in `_lift`: the search is run from the *player's* pitch, never from
   * the lifted one, so the applied lift cannot feed back into the lift it asks
   * for. The damping in `lateUpdate` is what makes it a glide.
   */
  _liftFor(game: Game, focus: THREE.Vector3, yaw: number, pitch: number, wanted: number) {
    if (!this.slopeLift) return 0;
    const want = wanted * LIFT_OK;
    let best = this._armAt(game, focus, yaw, pitch, wanted);
    if (best >= want) return 0;
    let bestLift = 0;
    for (let i = 1; i <= LIFT_STEPS; i++) {
      const lift = (i / LIFT_STEPS) * LIFT_MAX;
      const d = this._armAt(game, focus, yaw, Math.min(this.pitchMax, pitch + lift), wanted);
      // A tenth of a metre of arm is not worth a degree of pitch; without the
      // margin the lift creeps up on flat ground for rounding.
      if (d > best + 0.10) { best = d; bestLift = lift; }
      if (d >= want) return lift;
    }
    return bestLift;
  }

  /**
   * Where the lens ends up for a given focus, orbit and wanted arm length —
   * the whole placement rule, with no damping and no handheld, in one call.
   *
   * It exists for `probes/camview.mts`, which sweeps thousands of poses and
   * must place the lens *the way the rig does* rather than re-deriving the
   * arithmetic; a probe that re-implements the rule it measures grades a camera
   * the game does not have.
   *
   * @param out written with the lens position
   * @returns the arm length actually used
   */
  _solveLens(game: Game, focus: THREE.Vector3, yaw: number, pitch: number, wanted: number, out: THREE.Vector3) {
    this.occluders.update(game, focus, this.maxDistance + 4, this._t);
    // The lift first, then the real sweep at the lifted orbit: `_armDistance`
    // leaves `occluders.exiting` behind it, and the value that must survive is
    // the one from the arm actually used.
    const lifted = Math.min(this.pitchMax, pitch + this._liftFor(game, focus, yaw, pitch, wanted));
    const cp = Math.cos(lifted);
    const dir = this._tmp.set(Math.sin(yaw) * cp, Math.sin(lifted), Math.cos(yaw) * cp).normalize();
    const d = this._armDistance(game, focus, dir, wanted);
    out.copy(focus).addScaledVector(dir, d);
    const terrain = game.get('Terrain');
    const floor = () => {
      if (!terrain || !terrain.heightAt) return;
      const y = terrain.heightAt(out.x, out.z) + this.groundClearance;
      if (out.y < y) out.y = y;
    };
    floor();
    return d;
  }

  /**
   * Tangent-ratio look scale: `tan(fov/2) / tan(baseFov/2)`.
   *
   * 1.0 at the base FOV, above it when the lens is wider. Angles, not degrees,
   * because the screen distance a rotation covers goes as the tangent and not
   * as the angle -- at this rig's FOVs a linear ratio is wrong by several
   * percent, which is the difference between an aim that feels fixed and one
   * that drifts under the sprint kick.
   */
  _lookScale() {
    const half = (f: number) => Math.tan(THREE.MathUtils.degToRad(f) * 0.5);
    return half(this.fov) / Math.max(1e-4, half(this.baseFov));
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
    // Whatever the lens was standing inside last frame gets its mesh back
    // FIRST, before the posed-shot branch below can return past it. A creature
    // left hidden into a `setShot` is a corpus frame with a missing enemy in
    // it, and 166 of those are the `perf` gate.
    if (this._hidBody) { this._hidBody.root.visible = true; this._hidBody = null; }
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
    // Mouse movement is scaled by the tangent ratio against the base FOV, so a
    // given mouse delta always sweeps the same distance *on screen* rather than
    // the same angle in the world.
    //
    // Without it the sprint FOV kick silently retunes the player's aim: this
    // rig widens the lens by up to `fovMax + sprintFov` degrees while running,
    // and a flat sensitivity then makes the same flick cover visibly more
    // screen than it did at rest -- worst exactly when the player is moving
    // fastest and needs it least. Warp-strike aim rides on the same kick.
    // Ported from the sibling's `lookScale()` (sibling-ports section 5).
    const look = this.sensitivity * this._lookScale();
    this.yawTarget -= input.look.x * look;
    this.pitchTarget = THREE.MathUtils.clamp(
      this.pitchTarget + input.look.y * look, this.pitchMin, this.pitchMax);
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance + input.mouse.wheel * 0.5, 2.2, this.maxDistance);
    this.restDistance = this.targetDistance;

    // ---- combat framing: bias the orbit so the lock-on target is in frame
    //
    // Everything here is rate-limited and dead-zoned, and that is the whole
    // point of it. The first version steered `yawTarget` straight at the
    // bearing from the PLAYER to the target, which is the one quantity in the
    // fight that is unstable: a sabertusk two metres away swings its
    // player-relative bearing through ninety degrees in a third of a second
    // while barely moving on screen. `probes/armwhip.mts` measured what that
    // cost — in a real den fight the lens ran at **14.9 m/s at p95 and 59 m/s
    // peak**, against 3.9 m/s walking, and the decomposition put 14.5 of that
    // 14.9 in the ORBIT term with the arm contributing 5.3 and the focus 6.4.
    // The arm sweep was innocent: zero frames at the `minDistance` clamp.
    // That is the full-frame smear every `stagger` and `kill` frame came back
    // as, and it is this block, not `_armDistance`.
    const lock = this.lockOn;
    if (lock) {
      // Frame the body, not the ground under it: an enemy's `root` is at its
      // feet, so a Titan locked on his root points the camera at his ankles.
      const raw = isVector3(lock) ? this._tmp.copy(lock) : this._tmp.setFromMatrixPosition(lock.matrixWorld);
      if (!isVector3(lock)) raw.y += this.lockHeight * 0.55;
      // A raw enemy root jitters at the animation rate and a target change is
      // a jump; damping the point damps both, and it is what the look-at
      // lerp below reads too.
      if (this._lockFirst) { this._lockSmooth.copy(raw); this._lockFirst = false; }
      else {
        this._lockSmooth.x = THREE.MathUtils.damp(this._lockSmooth.x, raw.x, LOCK_DAMP, dt);
        this._lockSmooth.y = THREE.MathUtils.damp(this._lockSmooth.y, raw.y, LOCK_DAMP, dt);
        this._lockSmooth.z = THREE.MathUtils.damp(this._lockSmooth.z, raw.z, LOCK_DAMP, dt);
      }
      const lp = this._lockSmooth;
      const toTarget = this._tmp2.copy(lp).sub(player.position);
      const flat = Math.hypot(toTarget.x, toTarget.z);

      // Yaw, steered on the bearing from the LENS rather than from the player,
      // because where the target sits on screen is a lens-relative quantity.
      // Inside `FRAME_DEADZONE` — a box about the middle third of the frame —
      // the camera is not moved at all, which is what a lock-on camera does
      // and what stops a circling animal dragging the whole world with it.
      const wantYaw = Math.atan2(-(lp.x - this.cam.position.x), -(lp.z - this.cam.position.z));
      const err = shortestAngle(wantYaw - this.yawTarget);
      const over = Math.sign(err) * Math.max(0, Math.abs(err) - FRAME_DEADZONE);
      this.yawTarget += THREE.MathUtils.clamp(
        over * Math.min(1, dt * FRAME_YAW_GAIN) * this.combatFraming,
        -FRAME_YAW_RATE * dt, FRAME_YAW_RATE * dt);

      // Pitch: FFXV's combat camera comes in AND down. The 0.16 rad this
      // replaces is nine degrees, which for a metre-tall beast on flat ground
      // is barely a tilt at all; `FRAME_PITCH` is seventeen.
      const wantPitch = THREE.MathUtils.clamp(
        FRAME_PITCH + THREE.MathUtils.clamp(toTarget.y, -3, 14) * 0.02, -0.2, 0.7);
      this.pitchTarget += THREE.MathUtils.clamp(
        (wantPitch - this.pitchTarget) * Math.min(1, dt * 2.4) * this.combatFraming,
        -FRAME_PITCH_RATE * dt, FRAME_PITCH_RATE * dt);

      // Arm length is a function of the target's own silhouette, not of how
      // far away it is. `targetDistance + flat * 0.22` backed the arm off as
      // the target got FARTHER, which makes a far target *smaller* — the
      // opposite of framing it — and at sixteen metres pushed 5.6 m to 10 m.
      // It also multiplied the whip above: every degree of yaw is arm-length
      // metres of lens travel, and it ran the arm out to 7.9 m in a melee.
      const fit = THREE.MathUtils.clamp(0.62 + 0.20 * this.lockHeight, 0.62, 1.30);
      const wantDist = THREE.MathUtils.clamp(
        this.targetDistance * fit + Math.max(0, flat - 10) * 0.10,
        this.minDistance + 1.0, this.maxDistance);
      this._framedDist = THREE.MathUtils.damp(this._framedDist, wantDist, 2.4, dt);
      this.restDistance = THREE.MathUtils.lerp(this.targetDistance, this._framedDist, this.combatFraming);
    } else {
      this._framedDist = this.targetDistance;
      this._lockFirst = true;
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
    // shoulder offset, in camera space. The lift below does not belong here:
    // `right` is `dir x UP` normalised, which is `(-cos yaw, 0, sin yaw)` for
    // every pitch, so the shoulder is a yaw-only quantity and the arm can be
    // re-aimed after the focus is damped, where the focus is current.
    const cp = Math.cos(this.pitch);
    this._dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).normalize();
    const right = this._tmp.copy(this._dir).cross(UP).normalize();
    // The shoulder offset is a *composition*: it is 0.55 m because 0.55 m at a
    // 5.6 m arm puts Noctis a third of the way off centre. It is an ANGLE on
    // screen, and the angle goes as `shoulder / distance`, so at the 0.66 m arm
    // a boulder crowds the lens to it is eight times what it was authored as --
    // which is `probes/camlook.mts`' own after-frame, where the fight is finally
    // visible and Noctis' head is across a quarter of the screen. Scaling it
    // with the arm keeps the composition the composition. Last frame's
    // `distance` because this frame's is not solved until the arm is.
    const shoulderFit = THREE.MathUtils.clamp(
      this.distance / Math.max(0.5, this.restDistance), 0.3, 1);
    this._focus.addScaledVector(right, -this.shoulder * shoulderFit);

    // ---- and keep that focus point out of the hillside -------------------
    // **This is the whole of the playtest's worst frame**, and it is not the
    // arm. `probes/camsteep.mts` sprints at a steep face and reads, at the
    // frame in the picture: `focus (-302.3, 44.0, -266.8)  ground under focus
    // 46.2` — the point the camera is trying to orbit is **2.2 m inside the
    // hill**, because the look-ahead has walked it up to `lookAheadMax` = 2.2 m
    // in the direction of travel and the direction of travel is into a slope
    // that climbs 6 m over that distance. The shoulder offset adds another
    // 0.55 m of the same.
    //
    // Everything downstream follows from that one fact. `_armDistance` sweeps
    // outward from a buried origin, so its first step is already underground
    // and it returns `minDistance` — at EVERY orientation. The same probe
    // prints the sweep: `armAt +0.00:1.10 +0.11:1.10 +0.22:1.10 +0.33:1.10
    // +0.44:1.10 +0.55:1.10`. No arm length and no pitch can escape a hill the
    // orbit is centred inside, which is why the slope lift measured 10.59% ->
    // 1.68% on `camview`'s standing poses and did nothing whatsoever live:
    // `camview` grades a standing focus and has no look-ahead in it.
    //
    // So the look-ahead is halved until the point it produces has air around
    // it. Halving rather than clamping to the ground: raising the focus would
    // float it over Noctis' head, and the offset is the thing that is wrong,
    // not its height. Four halvings reach a sixteenth of the offset and the
    // player's own chest is clear by construction, so this terminates.
    const focusT = this.focusClear ? game.get('Terrain') : null;
    if (focusT && focusT.heightAt) {
      let ox = this._focus.x - player.position.x;
      let oz = this._focus.z - player.position.z;
      const need = this._focus.y - FOCUS_CLEAR;
      for (let k = 0; k < 4 && focusT.heightAt(player.position.x + ox, player.position.z + oz) > need; k++) {
        ox *= 0.5; oz *= 0.5;
      }
      this._focus.x = player.position.x + ox;
      this._focus.z = player.position.z + oz;
    }

    if (this._first) this._focusSmooth.copy(this._focus);
    else {
      this._focusSmooth.x = THREE.MathUtils.damp(this._focusSmooth.x, this._focus.x, this.lookDamp, dt);
      this._focusSmooth.y = THREE.MathUtils.damp(this._focusSmooth.y, this._focus.y, this.lookDamp * 0.6, dt);
      this._focusSmooth.z = THREE.MathUtils.damp(this._focusSmooth.z, this._focus.z, this.lookDamp, dt);
    }

    // ---- arm + collision ----------------------------------------------
    // Bring the boulder window to the player first: the sweep below reads it,
    // and a window centred on last frame's focus is a metre stale at a sprint.
    // `maxDistance + 4` covers the longest arm plus the distance the damped
    // lens can still be trailing behind it.
    this.occluders.update(game, this._focusSmooth, this.maxDistance + 4, this._t);
    const wanted = this.restDistance;

    // ---- slope lift: climb over the hillside rather than into it ---------
    // See `_liftFor`. It runs here, after the focus is damped, because it
    // sweeps the arm up to six times and every sweep is against this focus.
    const wantLift = this._liftFor(game, this._focusSmooth, this.yaw, this.pitch, wanted);
    // Asymmetric, and both rates are the arm's own argument. Up fast: the arm
    // is collapsing NOW and a slow rise is another second of the inside of a
    // hill. Down slow: a player running along a contour crosses the threshold
    // several times a second, and a symmetric rate turns that into a pump.
    this._lift = THREE.MathUtils.damp(this._lift, wantLift,
      wantLift > this._lift ? LIFT_UP : LIFT_DOWN, dt);
    if (this._lift > 1e-3) {
      const ap = Math.min(this.pitchMax, this.pitch + this._lift);
      const acp = Math.cos(ap);
      this._dir.set(Math.sin(this.yaw) * acp, Math.sin(ap), Math.cos(this.yaw) * acp).normalize();
    }

    const clear = this._armDistance(game, this._focusSmooth, this._dir, wanted);
    if (clear < this.distance) this.distance = clear;                       // push in now
    // ...and out now, when the arm is climbing out through the far face of a
    // rock Noctis is standing in. The 3.2/s recovery below is deliberately slow
    // so a camera crowded by a hillside eases back out rather than snapping,
    // and it is exactly wrong here: it is half a second of the inside of a
    // boulder. See `CameraOccluders.exiting`.
    else if (this.occluderPush && this.occluders.exiting) this.distance = clear;
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

    // ---- ground floor ----------------------------------------------------
    // The arm can be blocked closer than `minDistance`, and when it is, the
    // clamp in `_armDistance` wins and the lens ends up inside the hill. That
    // is not an edge case: over 13,872 sampled poses across the world, 4.28% of
    // them put the lens underground and **100% of those were at the clamp**.
    //
    // A swept sphere -- the fix the sibling repo used for its own 4.8% -- was
    // tried first and moved the rate 4.77% -> 4.28%, because the arm test was
    // never what was failing. There is no arm length that clears a slope the
    // camera is standing in; the answer is to stop pretending the arm is the
    // only degree of freedom and let the lens ride up over the ground.
    const groundT = game.get('Terrain');
    const floor = () => {
      if (!groundT || !groundT.heightAt) return;
      const floorY = groundT.heightAt(this._smooth.x, this._smooth.z) + this.groundClearance;
      if (this._smooth.y < floorY) this._smooth.y = floorY;
    };

    // ---- and out of any boulder --------------------------------------------
    // The arm sweep stops the lens *entering* a rock along the arm. It cannot
    // stop the lens being overtaken by one: `_smooth` lags `_desired` by a
    // damped frame or two (11/s is 17% of the error per frame, so a push-in
    // takes ten frames to arrive), the handheld layer adds a few centimetres of
    // its own, and a tor that streams in beside a running player arrives around
    // the lens rather than in front of it.
    //
    // The recovery is a JUMP TO `_desired` AND NOTHING ELSE, and that is a
    // correction: this first pushed the lens out radially, out of the deepest
    // ellipsoid it was in, and `probes/camlook.mts` photographed what that
    // does. At the outcrop at (180, 360) it lifted the lens two metres, out of
    // one proxy and flat against the face of the next one, and turned a frame
    // with the whole party legible in it into a full-screen wall of blurred
    // brown rock — the playtest's own complaint, manufactured by the fix for
    // it. Two reasons it was never going to work: an ellipsoid is not the
    // fractured hull it stands for, so "inside a proxy" is not "inside a rock";
    // and a radial direction is not a direction the shot has any interest in.
    //
    // `_desired` is on the arm line, which is the one direction the shot does
    // care about, and it is clear by construction — `arm` returns a length no
    // longer than the first entry into the union of proxies. When it is not
    // clear (Noctis inside an outcrop with no way out along this arm) the lens
    // is left exactly where the plain arm put it, because that frame, whatever
    // else is wrong with it, is the one the old camera gave and it showed the
    // party.
    floor();
    if (this.occluderPush && this.occluders.count
      && this.occluders.inside(this._smooth.x, this._smooth.y, this._smooth.z, this.probeRadius)
      && !this.occluders.inside(this._desired.x, this._desired.y, this._desired.z, this.probeRadius)) {
      this._smooth.copy(this._desired);
      floor();
    }

    // ---- commit ----------------------------------------------------------
    this._shakeOffset(dt, this._tmp, this._tmp2);
    this.cam.position.copy(this._smooth).add(this._tmp);

    this._lookAt.copy(this._focusSmooth);
    // The damped lock point, not the raw one: this term rotates the camera,
    // and reading the enemy's live root here put the animation's own jitter
    // straight into the lens.
    if (lock) this._lookAt.lerp(this._lockSmooth, 0.32 * this.combatFraming);
    this.cam.lookAt(this._lookAt);
    if (this._tmp2.lengthSq() > 0) {
      this.cam.rotateX(this._tmp2.x);
      this.cam.rotateY(this._tmp2.y);
      this.cam.rotateZ(this._tmp2.z);
    }

    // ---- and out of any animal ------------------------------------------
    // The playtest's second case: "mid-fight the camera ended up inside a
    // Voretooth — the creature filled the screen, Noctis not visible at all,
    // HUD still up." A creature is not swept by the arm and must not be, for
    // the reason `CameraOccluders.soft` gives — an arm that stops short of
    // every animal circling a melee is an arm at `SOLID_MIN` for the whole
    // fight, which is the frame lane 12a spent a lane escaping. So the animal
    // the lens is inside is hidden for the frame instead.
    //
    // This is `Player.cullNearCamera`'s argument, applied to the other half of
    // the cast: below about a metre a body is not a body, it is a wall of
    // out-of-focus hide with the world behind it, and the thing being hidden is
    // by construction the one thing in the frame you cannot see anyway. It is a
    // `visible` toggle and not a fade for that file's reason too — three's
    // program cache key includes `parameters.opaque`, so animating
    // `transparent` recompiles every program the creature touches.
    if (this.occluders.softCount) {
      const p = this.cam.position;
      const hit = this.occluders.creatureAt(p.x, p.y, p.z, this.probeRadius);
      if (hit) { hit.root.visible = false; this._hidBody = hit; }
    }

    if (Math.abs(this.cam.fov - this.fov) > 1e-3) {
      this.cam.fov = this.fov;
      this.cam.updateProjectionMatrix();
    }
    this.cam.updateMatrixWorld();
    this._drivePost(game, this._focusSmooth);
  }
}

/**
 * Combat-framing constants. Every one of them is a rate or a deadband, and
 * they exist because the framing block that had none of them ran the lens at
 * 59 m/s — see `probes/armwhip.mts`.
 */
/** Half-width of the do-nothing box the target may sit in, radians. */
const FRAME_DEADZONE = 0.26;
/** Ceiling on the yaw the framing may add per second, radians. */
const FRAME_YAW_RATE = 1.5;
/** Proportional gain outside the deadzone, per second. */
const FRAME_YAW_GAIN = 4.0;
/** Ceiling on the pitch the framing may add per second, radians. */
const FRAME_PITCH_RATE = 0.9;
/** Resting combat pitch in radians — 17 degrees down, against 9 before. */
const FRAME_PITCH = 0.30;
/** Damping rate on the lock point itself. */
const LOCK_DAMP = 6.0;
/**
 * Shortest arm a solid may crowd the lens to, metres.
 *
 * Deliberately far below `minDistance`: see `_armDistance`.
 */
const SOLID_MIN = 0.4;
/**
 * Slope-lift constants. See `CameraRig._liftFor`.
 *
 * `LIFT_MAX` is 0.55 rad, 31 degrees, which is what a 30-degree slope needs to
 * stop blocking a 5.3 m arm — the geometry it was chosen from, not a taste.
 * Beyond about that the shot is a map view and the player has lost the horizon
 * a different way.
 */
const LIFT_MAX = 0.55;
/** Candidate lifts tried, evenly spaced up to `LIFT_MAX`. */
const LIFT_STEPS = 5;
/** Fraction of the wanted arm that counts as "the arm got out". */
const LIFT_OK = 0.85;
/** Damping rate while the lift is rising, per second. */
const LIFT_UP = 3.5;
/** ...and while it decays back to the player's own pitch. */
const LIFT_DOWN = 1.1;
/**
 * Metres of air the focus point keeps above the ground under it.
 *
 * The focus sits `height` = 1.62 m over the feet, so this is how much of that
 * the look-ahead and the shoulder are allowed to spend walking into a rise.
 * 0.9 m leaves the orbit centred on Noctis' waist at worst.
 */
const FOCUS_CLEAR = 0.9;
/** Scratch direction for `_armAt`, which is called inside `_solveLens`. */
const _dirP = new THREE.Vector3();

/** Shortest-arc difference between two angles, in `(-pi, pi]`. */
function shortestAngle(d: number) {
  d %= Math.PI * 2;
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Shortest-arc lerp between two angles. */
function angleLerp(a: number, b: number, t: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
