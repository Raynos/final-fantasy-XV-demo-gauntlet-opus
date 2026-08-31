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
    const cp = Math.cos(pitch);
    const dir = this._tmp.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).normalize();
    this.occluders.update(game, focus, this.maxDistance + 4, this._t);
    const d = this._armDistance(game, focus, dir, wanted);
    out.copy(focus).addScaledVector(dir, d);
    const terrain = game.get('Terrain');
    const floor = () => {
      if (!terrain || !terrain.heightAt) return;
      const y = terrain.heightAt(out.x, out.z) + this.groundClearance;
      if (out.y < y) out.y = y;
    };
    floor();
    if (this.occluderPush && this.occluders.count) {
      for (let i = 0; i < 3; i++) {
        if (this.occluders.push(out, this.probeRadius) <= 0) break;
        floor();
      }
    }
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
    // Bring the boulder window to the player first: the sweep below reads it,
    // and a window centred on last frame's focus is a metre stale at a sprint.
    // `maxDistance + 4` covers the longest arm plus the distance the damped
    // lens can still be trailing behind it.
    this.occluders.update(game, this._focusSmooth, this.maxDistance + 4, this._t);
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
    // Floor and push alternate, because each can undo the other: a push out of
    // a half-buried boulder can put the lens under the hill, and the floor can
    // lift it into the block sitting on top. Three rounds settle it or nothing
    // will.
    floor();
    if (this.occluderPush && this.occluders.count) {
      for (let i = 0; i < 3; i++) {
        if (this.occluders.push(this._smooth, this.probeRadius) <= 0) break;
        floor();
      }
      // A tor is not one boulder: it is five to nine overlapping blocks, and
      // radial push-out of the deepest can land in a neighbour every time. The
      // swept point cannot -- `sweep` returns the first entry into the UNION
      // along the arm, so everything short of it is outside every proxy. Taking
      // it is a cut, and a cut is what you want here: the alternative on offer
      // is another frame of the inside of a rock.
      if (this.occluders.inside(this._smooth.x, this._smooth.y, this._smooth.z, this.probeRadius)
        && !this.occluders.inside(this._desired.x, this._desired.y, this._desired.z, this.probeRadius)) {
        this._smooth.copy(this._desired);
        floor();
      }
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
