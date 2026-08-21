import * as THREE from 'three';
import { clamp01, smooth, lerp } from './Geo.js';

/**
 * The player's combat body.
 *
 * `CombatSystem` swings a weapon anchor — a Group parented to the player root
 * that traces the arc, carries the trail and drives hit detection. Until now
 * nothing connected that anchor to Noctis: he stood in his locomotion idle
 * while a sword swept past him on its own. This layer closes the loop from
 * both ends.
 *
 * **The arm follows the weapon.** Rather than animating an arm and hoping the
 * blade ends up somewhere useful, the anchor stays authoritative (so every
 * hitbox, trail and VFX position is unchanged) and a two-bone IK puts the hand
 * on it. The swing arc the combat system already computes therefore *becomes*
 * the arm animation, for free, for every weapon class.
 *
 * **The body drives into the swing.** On top of that sits a hand-authored
 * layer per state — wind-up torque through the hips, the step into a
 * greatsword cleave, the tuck and rotation of a dodge, the javelin extension
 * of a warp-strike and the crouch it lands in, the parry flourish, and a
 * high-frequency judder while hitstop is holding the frame.
 *
 * Everything is written *after* the animator has posed the skeleton and is
 * recomputed from scratch each frame, so it composes with locomotion instead
 * of fighting it.
 */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4();
const _tgt = new THREE.Vector3();
const _tgt2 = new THREE.Vector3();
const _gripQ = new THREE.Quaternion();

/** Per-weapon body language. This is what makes a class feel different. */
const STYLE = {
  sword: { twist: 0.52, step: 0.11, lean: 0.10, drop: 0.030, settle: 1.0, wind: 0.85, twoHand: 0 },
  greatsword: { twist: 0.86, step: 0.24, lean: 0.24, drop: 0.075, settle: 1.7, wind: 1.15, twoHand: 0.30 },
  polearm: { twist: 0.44, step: 0.28, lean: 0.15, drop: 0.055, settle: 1.1, wind: 0.90, twoHand: 0.52 },
  daggers: { twist: 0.38, step: 0.09, lean: 0.07, drop: 0.020, settle: 0.7, wind: 0.65, twoHand: 0 },
  firearm: { twist: 0.16, step: 0.02, lean: 0.04, drop: 0.010, settle: 0.8, wind: 0.35, twoHand: 0.34 },
};
const DEFAULT_STYLE = STYLE.sword;

export class CombatAnim {
  /** @param {Object} game */
  constructor(game) {
    this.game = game;
    this.combat = game.get('Combat');
    this.player = game.get('Player');
    this.parry = 0;
    this.land = 0;
    this._prevState = 'idle';
    this._warpK = 0;
    this._bound = false;
    if (this.combat && this.combat.on) {
      this.combat.on('parry', () => { this.parry = 1; });
      this.combat.on('warp', (d) => { if (d.phase === 'impact') this.land = 1; });
      this.combat.on('playerHit', (d) => this._onHit(d));
    }
  }

  _onHit(d) {
    const c = this.player && this.player.character;
    if (!c || !c.hit) return;
    // route the enemy's blow into the existing recoil + cloth impulse
    _v.subVectors(this.player.position, d.enemy ? d.enemy.root.position : this.player.position).normalize();
    c.hit(_v, THREE.MathUtils.clamp(d.damage / 400, 0.5, 1.6));
  }

  /**
   * Runs in the lateUpdate pass, which is the only place the combat state for
   * *this* frame is already settled — driving the body from the update pass
   * would leave the arm one frame behind a blade moving at 20 rad/s.
   * @param {number} dt
   */
  lateUpdate(dt) {
    const combat = this.combat;
    const player = this.player;
    if (!combat || !player || !player.character || !player.character.rig) return;
    const char = player.character;
    const rig = char.rig;
    const B = rig.byName;
    const s = rig.dims.s;

    this.parry = Math.max(0, this.parry - dt * 1.6);
    this.land = Math.max(0, this.land - dt * 2.6);

    // start from a clean body transform every frame
    char.root.position.set(0, 0, 0);
    char.root.rotation.set(0, 0, 0);

    const style = STYLE[combat.weapon ? combat.weapon.kind : 'sword'] || DEFAULT_STYLE;
    const st = combat.state;
    let ikWeight = 1;

    if (st === 'attack' && combat.comboStep) ikWeight = this.poseSwing(B, s, combat, style, dt);
    else if (st === 'dodge') ikWeight = this.poseDodge(B, char, s, combat);
    else if (st === 'warp') ikWeight = this.poseWarp(B, char, s, combat);
    else if (st === 'phase') ikWeight = this.posePhase(B, s, combat);
    else if (st === 'stasis') ikWeight = this.poseStasis(B, s, combat);
    else ikWeight = this.poseReady(B, s, combat, style);

    if (this.parry > 0.01) this.poseParry(B, s);
    if (this.land > 0.01) this.poseLanding(B, char, s);
    this.poseHitstop(B, combat);

    char.root.updateMatrixWorld(true);
    if (ikWeight > 0.01 && combat.weapon && combat.weapon.root.visible !== false) {
      this.weaponIK(rig, combat, style, ikWeight);
    }
    char.root.updateMatrixWorld(true);
    this._prevState = st;
  }

  /* ------------------------------------------------------- pose layers */

  /** Additive Euler offset onto whatever the animator produced. */
  add(B, name, x, y, z) {
    const b = B[name];
    if (!b) return;
    _e.set(x, y, z, 'YXZ');
    _q.setFromEuler(_e);
    b.quaternion.multiply(_q);
  }

  /** Absolute override — used where the base layer must not show through. */
  set(B, name, x, y, z) {
    const b = B[name];
    if (!b) return;
    _e.set(x, y, z, 'YXZ');
    b.quaternion.setFromEuler(_e);
  }

  /**
   * The commitment curve of a swing, running −1 (fully wound up, coiled away
   * from the target) through 0 to +1 (followed all the way through).
   * @returns {number}
   */
  swingCurve(combat, style) {
    const step = combat.comboStep;
    if (!step) return 0;
    const n = clamp01(combat.comboTimer / Math.max(0.02, step[PHASE_KEY[combat.comboPhase]] || 0.2));
    if (combat.comboPhase === 'wind') {
      // ease out into the coil and hold there — the hold is the telegraph
      return -style.wind * (n < 0.6 ? 1 - Math.pow(1 - n / 0.6, 2.4) : 1);
    }
    if (combat.comboPhase === 'active') {
      // accelerate through, then overshoot slightly past the target
      const e = 1 - Math.pow(1 - n, 3.4);
      return lerp(-style.wind, 1, e) + Math.sin(n * Math.PI) * 0.12;
    }
    // recovery rings back down through neutral
    return (1 - smooth(n)) * Math.cos(n * Math.PI * 1.1) * 0.55;
  }

  /**
   * The swing itself: hips and shoulders counter-rotate into the arc, the
   * front foot steps into it, and the whole mass drops slightly on contact.
   */
  poseSwing(B, s, combat, style, dt) {
    const k = this.swingCurve(combat, style);
    const step = combat.comboStep;
    // the arc's sign says whether this link of the combo goes left or right;
    // a combo that always swings the same way reads as a loop
    const dir = Math.sign((step.arc[1] - step.arc[0]) || 1);
    const y = k * style.twist * dir;
    const contact = combat.comboPhase === 'active' ? Math.sin(clamp01(combat.comboTimer / Math.max(0.02, step.active)) * Math.PI) : 0;

    this.add(B, 'hips', -style.lean * 0.25 * Math.abs(k), y * 0.42, 0);
    this.add(B, 'spine01', style.lean * 0.35 * k, y * 0.30, 0);
    this.add(B, 'spine02', style.lean * 0.40 * k, y * 0.55, 0);
    this.add(B, 'spine03', style.lean * 0.35 * k, y * 0.85, -y * 0.12);
    this.add(B, 'neck', -style.lean * 0.30 * k, -y * 0.30, 0);
    this.add(B, 'head', -style.lean * 0.25 * k, -y * 0.45, 0);
    this.add(B, 'clavicleL', 0, y * 0.20, -y * 0.10);
    this.add(B, 'clavicleR', 0, y * 0.20, y * 0.10);

    // step into the blow: the lead leg drives, the trail leg extends
    const stepK = style.step * clamp01(k);
    this.add(B, 'thighL', -stepK * (dir > 0 ? 1.0 : 0.35), y * 0.20, 0);
    this.add(B, 'thighR', -stepK * (dir > 0 ? 0.35 : 1.0), y * 0.20, 0);
    this.add(B, 'shinL', stepK * 0.5, 0, 0);
    this.add(B, 'shinR', stepK * 0.5, 0, 0);
    // a heavy weapon compresses the stance on contact
    this.player.character.root.position.y -= (style.drop * (0.35 + 0.65 * contact) * clamp01(k)) * s;
    return 1;
  }

  /**
   * Idle / moving with a weapon out.
   *
   * `Anim.evalStance` now owns the whole-body guard — bladed hips, wide base,
   * dropped pelvis, guard rock — for all four characters, so this layer is
   * only what the *weapon* does on top of it. Both layers are additive, so
   * leaving the old spine twist here simply doubled the blading on Noctis and
   * on nobody else.
   */
  poseReady(B, s, combat, style) {
    const t = this.game.time.now;
    const near = combat.inCombat ? 1 : 0.3;
    // 0 for daggers, ~0.6 for the greatsword: how much mass is hanging off the
    // carrying shoulder
    const heavy = (style.twoHand + style.drop * 4) * near;
    const sway = (0.5 + 0.5 * Math.sin(t * 0.9)) * near;
    // the loaded shoulder is dragged down and forward, the other pulls back
    this.add(B, 'clavicleR', 0.035 * heavy, 0, 0.055 * heavy);
    this.add(B, 'clavicleL', -0.020 * heavy, 0, 0.030 * heavy);
    this.add(B, 'spine03', 0.025 * heavy, 0, -0.035 * heavy);
    this.add(B, 'spine02', 0.015 * heavy, 0, -0.020 * heavy);
    // the blade carries: a slow roll through the shoulder line so it is never
    // hanging dead in frame
    this.add(B, 'clavicleL', 0, 0, -sway * 0.014);
    this.add(B, 'clavicleR', 0, 0, sway * 0.014);
    return 1;
  }

  /**
   * The dodge. FFXV's evade is a low, fast displacement with the whole body
   * committed to it — a lateral vault when the input is sideways, a tucked
   * roll when it is fore-and-aft. Legs are *overridden* here rather than
   * added to, because the locomotion gait and the foot IK have no idea the
   * character has left the ground.
   */
  poseDodge(B, char, s, combat) {
    const n = clamp01(combat.stateTime / 0.46);
    const d = combat.dodgeDir || _v.set(0, 0, -1);
    // resolve the dodge into the character's own frame
    const h = this.player.root.rotation.y;
    const cs = Math.cos(-h), sn = Math.sin(-h);
    const lx = d.x * cs - d.z * sn;
    const lz = d.x * sn + d.z * cs;
    const lateral = clamp01(Math.abs(lx) / (Math.abs(lx) + Math.abs(lz) + 1e-4));

    // Half a rotation, not a full one: FFXV's evade is a fast low displacement
    // with a body turn, not a circus tumble. The turn unwinds over the second
    // half so the landing is square to the camera again.
    const turn = Math.sin(smooth(n) * Math.PI) * Math.PI * 0.55;
    const tuck = Math.sin(clamp01(n / 0.88) * Math.PI);
    const hipY = 0.985 * s;
    // rolling: about the axis perpendicular to travel. Vaulting: about travel.
    const roll = turn * lateral * -Math.sign(lx || 1);
    const pitch = turn * (1 - lateral) * Math.sign(lz || 1);
    char.root.rotation.set(pitch, 0, roll);
    // keep the body near ball height instead of swinging it through the floor
    // Rotating `char.root` pivots at the feet, which would swing the body
    // through the floor. Put the pivot back at the hips by translating the
    // root by the offset that rotation introduced, then lift for the tuck.
    const ang = Math.hypot(pitch, roll);
    // the hips travel low through the evade and come back up on the landing
    const wantHip = lerp(hipY, 0.52 * s, tuck);
    char.root.position.y = wantHip - hipY * Math.cos(ang);
    char.root.position.z = -hipY * Math.sin(pitch) * 0.85;
    char.root.position.x = hipY * Math.sin(roll) * 0.85;

    // tuck: knees to chest, arms in, chin down
    this.set(B, 'hips', -0.35 * tuck, 0, 0);
    this.set(B, 'spine01', -0.30 * tuck, 0, 0);
    this.set(B, 'spine02', -0.32 * tuck, 0.12 * lx, 0);
    this.set(B, 'spine03', -0.26 * tuck, 0.16 * lx, 0);
    this.set(B, 'neck', -0.28 * tuck, 0, 0);
    this.set(B, 'head', -0.30 * tuck, 0.2 * lx, 0);
    for (const side of ['L', 'R']) {
      const m = side === 'L' ? 1 : -1;
      this.set(B, `thigh${side}`, -1.55 * tuck - 0.15, 0, 0.14 * m * tuck);
      this.set(B, `shin${side}`, 1.85 * tuck, 0, 0);
      this.set(B, `foot${side}`, -0.55 * tuck, 0, 0);
      this.set(B, `toe${side}`, 0.2 * tuck, 0, 0);
      this.set(B, `clavicle${side}`, 0, 0, 0.10 * m * tuck);
      this.set(B, `upperArm${side}`, -0.9 * tuck, 0.4 * m * tuck, 0.5 * m * tuck);
      this.set(B, `lowerArm${side}`, -1.7 * tuck, 0, 0);
    }
    // the weapon is stowed mid-roll, so the arm must not be dragged to it
    return 1 - tuck * 0.85;
  }

  /**
   * Warp-strike. The dash is a javelin — everything trailing behind the
   * weapon — and the arrival is a crouch that has to absorb it. The
   * anticipation is folded into the first 25% of the dash because the combat
   * system teleports the position immediately and there is no earlier window.
   */
  poseWarp(B, char, s, combat) {
    const w = combat.warp;
    const vfx = this.game.get('VFX');
    const k = w && vfx ? clamp01((vfx.clock - w.t0) / Math.max(0.02, w.dash)) : 1;
    const post = w && vfx ? clamp01((vfx.clock - w.t0 - w.dash) / 0.28) : 1;
    this._warpK = k;
    // anticipation: a hard coil in the first fifth, then the extension
    const coil = clamp01(k / 0.22);
    const ext = smooth(clamp01((k - 0.10) / 0.75)) * (1 - post);
    const landK = post > 0 ? Math.sin(clamp01(post) * Math.PI) : 0;

    char.root.rotation.x = -0.55 * ext + 0.28 * landK;
    char.root.position.y = -0.10 * s * landK;

    this.set(B, 'hips', 0.22 * ext + 0.30 * landK, 0, 0);
    this.set(B, 'spine01', 0.10 * ext + 0.18 * landK, 0, 0);
    this.set(B, 'spine02', 0.05 * ext + 0.14 * landK, -0.20 * ext, 0);
    this.set(B, 'spine03', -0.10 * ext + 0.10 * landK, -0.32 * ext, 0);
    this.set(B, 'neck', 0.20 * ext - 0.24 * landK, 0.16 * ext, 0);
    this.set(B, 'head', 0.28 * ext - 0.30 * landK, 0.24 * ext, 0);
    // legs stream behind during the dash, then catch the weight on landing
    for (const side of ['L', 'R']) {
      const m = side === 'L' ? 1 : -1;
      const trail = side === 'L' ? 1 : 0.62;
      this.set(B, `thigh${side}`, (0.85 * ext) * trail - 1.05 * landK, 0, 0.10 * m * landK);
      this.set(B, `shin${side}`, -0.45 * ext * trail + 1.35 * landK, 0, 0);
      this.set(B, `foot${side}`, 0.35 * ext - 0.30 * landK, 0, 0);
      this.set(B, `clavicle${side}`, 0, 0, 0.06 * m * ext);
    }
    // the off hand streams back
    const off = 'L';
    this.set(B, `upperArm${off}`, 0.95 * ext - 0.5 * landK, 0.35 * ext, 0.45 * ext);
    this.set(B, `lowerArm${off}`, -0.5 * ext - 0.8 * landK, 0, 0);
    // no arm IK during the pure dash (the blade is dematerialised), full on landing
    return Math.max(coil * 0.4, landK);
  }

  /** Phase: the MP-draining parry stance. Weight back, blade low and across. */
  posePhase(B, s, combat) {
    const t = this.game.time.now;
    const charge = clamp01(combat.phaseCharge);
    const sway = Math.sin(t * 7) * 0.012 * charge;
    this.add(B, 'hips', 0.06, 0.18, 0);
    this.add(B, 'spine01', -0.05, 0.14, 0);
    this.add(B, 'spine02', -0.08 - sway, 0.22, 0);
    this.add(B, 'spine03', -0.10 - sway, 0.30, 0);
    this.add(B, 'neck', 0.10, -0.24, 0);
    this.add(B, 'head', 0.06, -0.34, 0);
    this.add(B, 'thighL', -0.22, 0.14, 0.06);
    this.add(B, 'thighR', 0.16, 0.14, -0.06);
    this.add(B, 'shinL', 0.30, 0, 0);
    this.add(B, 'shinR', 0.18, 0, 0);
    this.player.character.root.position.y -= 0.05 * s;
    return 1;
  }

  /** Out of MP. Doubled over, gasping — the punishment has to read. */
  poseStasis(B, s, combat) {
    const t = this.game.time.now;
    const gasp = Math.sin(t * 4.2) * 0.5 + 0.5;
    const k = clamp01(combat.stateTime / 0.4);
    this.add(B, 'hips', 0.12 * k, 0, 0);
    this.add(B, 'spine01', 0.20 * k + gasp * 0.03, 0, 0);
    this.add(B, 'spine02', 0.22 * k + gasp * 0.04, 0, 0);
    this.add(B, 'spine03', 0.18 * k + gasp * 0.04, 0, 0);
    this.add(B, 'neck', 0.24 * k, 0, 0);
    this.add(B, 'head', 0.20 * k, 0, 0);
    this.add(B, 'clavicleL', 0.10 * k, 0, -0.10 * k);
    this.add(B, 'clavicleR', 0.10 * k, 0, 0.10 * k);
    this.add(B, 'thighL', -0.24 * k, 0, 0.08 * k);
    this.add(B, 'thighR', -0.20 * k, 0, -0.08 * k);
    this.add(B, 'shinL', 0.32 * k, 0, 0);
    this.add(B, 'shinR', 0.28 * k, 0, 0);
    this.player.character.root.position.y -= 0.07 * s * k;
    return 0.55;
  }

  /** Perfect-guard flourish: the whole torso whips through the counter. */
  poseParry(B, s) {
    const p = this.parry;
    const swirl = Math.sin(p * Math.PI) * p;
    this.add(B, 'hips', 0, -0.30 * swirl, 0);
    this.add(B, 'spine01', -0.08 * swirl, -0.26 * swirl, 0);
    this.add(B, 'spine02', -0.10 * swirl, -0.40 * swirl, 0.10 * swirl);
    this.add(B, 'spine03', -0.12 * swirl, -0.55 * swirl, 0.14 * swirl);
    this.add(B, 'neck', 0.06 * swirl, 0.24 * swirl, 0);
    this.add(B, 'head', 0.10 * swirl, 0.40 * swirl, 0);
    this.add(B, 'clavicleL', -0.14 * swirl, 0, -0.16 * swirl);
    this.add(B, 'clavicleR', -0.10 * swirl, 0, 0.16 * swirl);
  }

  /** The moment a warp-strike arrives: a compression the legs have to eat. */
  poseLanding(B, char, s) {
    const k = this.land * this.land;
    this.add(B, 'hips', 0.24 * k, 0, 0);
    this.add(B, 'spine01', 0.14 * k, 0, 0);
    this.add(B, 'spine02', 0.10 * k, 0, 0);
    this.add(B, 'neck', -0.18 * k, 0, 0);
    this.add(B, 'thighL', -0.75 * k, 0, 0.10 * k);
    this.add(B, 'thighR', -0.60 * k, 0, -0.10 * k);
    this.add(B, 'shinL', 1.05 * k, 0, 0);
    this.add(B, 'shinR', 0.90 * k, 0, 0);
    char.root.position.y -= 0.16 * s * k;
  }

  /**
   * Sell the hitstop. The engine already freezes time on impact; without a
   * body response that just reads as a stutter. A short, high-frequency judder
   * through the spine — phased off *raw* time so it keeps moving while the
   * simulation clock is stopped — turns the same freeze into a collision.
   */
  poseHitstop(B, combat) {
    const h = combat.hitstop;
    if (h <= 0) return;
    const k = clamp01(h / 0.12);
    const t = this.game.time.raw;
    const j = Math.sin(t * 118) * k * k;
    this.add(B, 'spine02', j * 0.045, j * 0.030, 0);
    this.add(B, 'spine03', j * 0.055, j * 0.040, 0);
    this.add(B, 'head', -j * 0.050, -j * 0.030, 0);
    this.add(B, 'clavicleL', j * 0.05, 0, 0);
    this.add(B, 'clavicleR', j * 0.05, 0, 0);
  }

  /* ------------------------------------------------------------- arm IK */

  /**
   * Put the hand on the weapon anchor. Whichever arm is on the anchor's side
   * of the body is the one that drives; a two-handed class pulls the off hand
   * onto a point further down the shaft.
   */
  weaponIK(rig, combat, style, weight) {
    const anchor = combat.hand;
    if (!anchor) return;
    anchor.updateWorldMatrix(true, false);
    // dedicated temporaries: the solver scribbles on the shared scratch
    // vectors, and aliasing the target against them silently aims the arm at
    // its own shoulder
    _tgt.setFromMatrixPosition(anchor.matrixWorld);
    const local = this.player.root.worldToLocal(_v3.copy(_tgt));
    const main = local.x >= 0 ? 'L' : 'R';
    const off = main === 'L' ? 'R' : 'L';

    _gripQ.setFromRotationMatrix(_m.extractRotation(anchor.matrixWorld));
    this.solveArm(rig, main, _tgt, _gripQ, weight);

    if (style.twoHand > 0.01) {
      // a point back along the haft, in the anchor's own frame
      _tgt2.set(0, 0, -style.twoHand * 0.9).applyQuaternion(_gripQ).add(_tgt);
      this.solveArm(rig, off, _tgt2, _gripQ, weight * 0.9);
    }
  }

  /**
   * Two-bone IK for an arm: analytic elbow placement with the pole pointing
   * away from the body, then the hand snapped to the weapon's orientation.
   * @param {string} side 'L' | 'R'
   * @param {THREE.Vector3} target world position for the hand
   * @param {THREE.Quaternion} grip world orientation for the hand
   * @param {number} w 0..1 blend
   */
  solveArm(rig, side, target, grip, w) {
    const B = rig.byName, P = rig.P;
    const up = B[`upperArm${side}`], lo = B[`lowerArm${side}`], hand = B[`hand${side}`];
    if (!up || !lo || !hand) return;
    const L1 = P[`lowerArm${side}`].distanceTo(P[`upperArm${side}`]);
    const L2 = P[`hand${side}`].distanceTo(P[`lowerArm${side}`]);

    up.updateMatrixWorld(true);
    _v.setFromMatrixPosition(up.matrixWorld);
    const toT = _v2.copy(target).sub(_v);
    let d = toT.length();
    if (d < 1e-5) return;
    const maxD = (L1 + L2) * 0.995, minD = Math.abs(L1 - L2) + L1 * 0.12;
    if (d > maxD) { toT.multiplyScalar(maxD / d); d = maxD; }
    if (d < minD) { toT.multiplyScalar(minD / d); d = minD; }
    const wrist = _v3.copy(_v).add(toT);

    // elbow pole: down and out from the shoulder, in the player's frame
    const m = side === 'L' ? 1 : -1;
    const pole = _pole.set(m * 0.55, -0.75, -0.35)
      .applyQuaternion(this.player.root.getWorldQuaternion(_q))
      .normalize();
    const axis = _axis.copy(toT).normalize();
    pole.addScaledVector(axis, -pole.dot(axis));
    if (pole.lengthSq() < 1e-6) pole.set(0, -1, 0);
    pole.normalize();

    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const hh = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const elbow = _elbow.copy(_v).addScaledVector(axis, a).addScaledVector(pole, hh);

    aimTo(up, P[`upperArm${side}`], P[`lowerArm${side}`], elbow, pole, w);
    up.updateMatrixWorld(true);
    aimTo(lo, P[`lowerArm${side}`], P[`hand${side}`], wrist, pole, w);
    lo.updateMatrixWorld(true);

    // hand orientation: match the weapon, keeping the bind offset
    lo.getWorldQuaternion(_q);
    _q.invert().multiply(grip);
    hand.quaternion.slerp(_q.multiply(GRIP_FIX), w);
  }
}

const _pole = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _bx = new THREE.Vector3();
const _by = new THREE.Vector3();
const _bz = new THREE.Vector3();

/** The blade leaves the fist along the hand's local −Y, not its +Z. */
const GRIP_FIX = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI * 0.5, 0, 0));

const PHASE_KEY = { wind: 'wind', active: 'active', rec: 'rec', none: 'rec' };

/** Rotate `bone` so its bind-space child direction points at `target`. */
function aimTo(bone, bindFrom, bindTo, target, pole, w) {
  bone.parent.updateMatrixWorld();
  _aim.copy(bindTo).sub(bindFrom).normalize();
  _worldP.setFromMatrixPosition(bone.matrixWorld);
  _want.copy(target).sub(_worldP);
  if (_want.lengthSq() < 1e-9) return;
  _want.normalize();
  basis(_m1, _aim, UP);
  basis(_m2, _want, pole);
  _qa.setFromRotationMatrix(_m1).invert();
  _qb.setFromRotationMatrix(_m2).multiply(_qa);      // bind -> world rotation
  bone.parent.getWorldQuaternion(_qc).invert();
  _qc.multiply(_qb);                                  // express it in parent space
  bone.quaternion.slerp(_qc, w);
}

const UP = new THREE.Vector3(0, 0, 1);
const _aim = new THREE.Vector3();
const _want = new THREE.Vector3();
const _worldP = new THREE.Vector3();
const _qc = new THREE.Quaternion();

function basis(mat, z, up) {
  _bz.copy(z).normalize();
  _by.copy(up).addScaledVector(_bz, -up.dot(_bz));
  if (_by.lengthSq() < 1e-8) _by.set(_bz.y, -_bz.x, 0);
  _by.normalize();
  _bx.crossVectors(_by, _bz).normalize();
  mat.makeBasis(_bx, _by, _bz);
  return mat;
}
