import { Enemy } from './EnemyBase.js';
import { poseBone } from './RigBuilder.js';
import { attackEnvelope, hitCurve, clamp01, smooth, decelerate } from '../rig/CreatureAnim.js';

/**
 * Shared four-legged animation.
 *
 * Every quadruped in the bestiary answers the same questions — where are the
 * feet, how deep is the crouch before it commits, how does the spine whip
 * through the strike, which way does it fall — so all of that lives here and
 * a species supplies only the numbers that make it *that* animal: a sabertusk
 * coils and springs, a garula plants and shoves, a coeurl rears back.
 *
 * A subclass provides `A` (the tuning block below) and, optionally, overrides
 * `poseAttack` / `poseTelegraph` for a signature move.
 *
 * ```
 * A = {
 *   legs:   { fL:[...], fR:[...], bL:[...], bR:[...] }  bone chains
 *   trunk:  ['hips','spine','chest','neck','head']
 *   tails:  ['tail1','tail2','tail3']
 *   stride, lift, strideLen        gait geometry, metres
 *   crouch, lunge, drop            attack displacement, metres
 *   heavy                          true = never leaves the ground
 *   headDown, jaw                  how far the head drops / the mouth opens
 *   deathDrop, deathRoll           collapse depth and roll angle
 * }
 * ```
 */
export class QuadrupedEnemy extends Enemy {
  constructor(type, opts) {
    super(type, opts);
    this.autoResetVisual = true;
  }

  /** @returns {Object} tuning block; subclasses must define it. */
  get A() { return this.constructor.ANIM; }

  setupAnim(anim) {
    const A = this.A;
    anim.setTrunk(A.trunk);
    for (const id of ['fL', 'fR', 'bL', 'bR']) if (A.legs[id]) anim.leg(id, A.legs[id]);
  }

  /**
   * @param {string} state legacy pose vocabulary
   * @param {number} t phase seconds
   */
  pose(state, t) {
    if (!this.rig) return;
    const S = (n, x, y, z) => poseBone(this.rig, n, x, y, z);
    switch (state) {
      case 'run':
      case 'approach': this.poseLocomotion(S, t); break;
      case 'telegraph': this.poseTelegraph(S, t); break;
      case 'attack': this.poseAttack(S, t); break;
      case 'flinch': this.poseFlinch(S, t); break;
      case 'stagger': this.poseStagger(S, t); break;
      case 'death': this.poseDeath(S, t); break;
      default: this.poseIdle(S, t); break;
    }
  }

  /* ------------------------------------------------------------ helpers */

  /**
   * Place all four feet relative to bind. `drop` lowers the body while the
   * feet stay planted — which is what crouching is. Shortening the legs alone
   * lifts the paws and the animal appears to hover.
   * @param {Function} S pose writer
   * @param {Object} o {drop, front:{reach,lift,splay}, back:{...}}
   */
  stance(S, o) {
    const a = this.anim, A = this.A;
    const drop = o.drop || 0;
    const f = o.front || {}, b = o.back || {};
    for (const id of ['fL', 'fR']) {
      a.solveLeg(id, f.reach || 0, (f.lift || 0) + drop, S, {
        kneeSign: A.kneeF ?? 1, footPitch: A.footPitchF ?? -0.12,
        splay: (f.splay || 0) * (id === 'fL' ? -1 : 1),
      });
    }
    for (const id of ['bL', 'bR']) {
      a.solveLeg(id, b.reach || 0, (b.lift || 0) + drop, S, {
        kneeSign: A.kneeB ?? -1, footPitch: A.footPitchB ?? 0.10,
        splay: (b.splay || 0) * (id === 'bL' ? -1 : 1),
      });
    }
    if (drop) this.visual.position.y -= drop;
  }

  /** Bend the spine chain by a total angle, distributed along its length. */
  spine(S, pitch, yaw = 0, roll = 0, w = SPINE_W) {
    const t = this.A.trunk;
    for (let i = 0; i < t.length; i++) {
      const k = w[Math.min(w.length - 1, i)];
      S(t[i], pitch * k, yaw * k, roll * k);
    }
  }

  /** Tail bones as a lagging travelling wave. */
  tail(t, base, amp, freq, curl = 0) {
    const names = this.A.tails;
    if (!names) return;
    for (let i = 0; i < names.length; i++) {
      const lag = i * 0.55;
      poseBone(this.rig, names[i],
        base * (1 - i * 0.2) + curl * (i + 1) / names.length,
        Math.sin(t * freq - lag) * amp * (0.55 + i * 0.3), 0);
    }
  }

  _timingAll() {
    return {
      telegraph: this._timing('telegraph'), strike: this._timing('strike'),
      attack: this._timing('attack'), recover: this._timing('recover'),
    };
  }

  /* -------------------------------------------------------------- poses */

  poseLocomotion(S, t) {
    const A = this.A, a = this.anim;
    const sp = this.moveSpeed || 0;
    const norm = clamp01(sp / this.speed);
    const gait = a.pickGait(norm, A.heavy);
    a.stride(this._dt || 0, sp, A.strideLen * gait.stride);
    a.quadGait(gait, S, {
      stride: A.stride, lift: A.lift, splay: A.splay || 0.02,
      kneeF: A.kneeF ?? 1, kneeB: A.kneeB ?? -1,
      footPitch: A.footPitchF ?? -0.12, bodyScale: A.bodyScale || 1,
      frontScale: A.frontScale || 1, backScale: A.backScale || 1,
    });
    const ph = a.gaitPhase * Math.PI * 2;
    // the spine flexes and extends with the stride once the animal is running
    const flex = Math.max(0, norm - 0.35) * (A.flex ?? 1.0);
    this.spine(S,
      a.bodyPitch * 1.4 + Math.sin(ph * 2) * 0.06 * flex,
      Math.sin(ph) * 0.03 * (A.headSway ?? 1),
      0);
    S(A.trunk[A.trunk.length - 2] || 'neck', -0.05 - norm * (A.runNeck ?? 0.14), 0, 0);
    S(A.trunk[A.trunk.length - 1] || 'head', 0.05 + norm * (A.runHead ?? 0.12) + Math.sin(ph * 2) * 0.04, Math.sin(ph) * 0.03, 0);
    if (A.jawBone) S(A.jawBone, clamp01(norm - 0.55) * (A.jaw ?? 0.34));
    this.tail(t, A.tailRun ?? -0.3, 0.2 + norm * 0.14, 4 + norm * 4);
  }

  poseTelegraph(S, t) {
    const A = this.A;
    const env = attackEnvelope('telegraph', this.stateTime, this._timingAll());
    const k = env.tension;
    const c = k * this.telegraphScale();
    this.stance(S, {
      drop: A.crouch * c,
      front: { reach: A.crouchFront * c },
      back: { reach: A.crouchBack * c },
    });
    this.spine(S, A.crouchPitch * c + env.shake, 0, 0);
    S(A.trunk[A.trunk.length - 1], -A.headDown * c, 0, 0);
    if (A.jawBone) S(A.jawBone, (A.jaw ?? 0.3) * k);
    this.tail(t, A.tailTel ?? 0.4 * k, 0.1, 3);
  }

  /** Species multiplier on how deep the wind-up goes for the chosen attack. */
  telegraphScale() { return 1; }

  /** Species multiplier on how far the strike leaves the ground. */
  leapScale() { return 1; }

  poseAttack(S, t) {
    const A = this.A;
    const env = attackEnvelope(this.state === 'recover' ? 'recover' : 'attack', this.stateTime, this._timingAll());
    const k = env.k;
    const kp = clamp01(k);
    const leap = this.leapScale();
    this.stance(S, {
      front: { reach: A.lunge * k, lift: A.lungeLift * leap * kp },
      back: { reach: -A.lunge * 0.85 * k, lift: (A.lungeLiftBack || 0) * leap * kp },
    });
    this.spine(S, -A.strikePitch * k, 0, 0);
    S(A.trunk[A.trunk.length - 1], A.headThrust * k, 0, 0);
    if (A.jawBone) {
      // the jaw snaps shut *through* the contact frame, not at it
      const bite = env.phase === 'strike' ? 1 - env.f : (env.phase === 'follow' ? 0 : 0.75);
      S(A.jawBone, (A.jawBite ?? 0.95) * bite * clamp01(k + 0.4));
    }
    this.tail(t, -0.5 * kp, 0.12, 4);
    this.visual.position.y += (A.hop || 0) * leap * Math.max(0, k);
    this.visual.rotation.x += -(A.pitchThrough ?? 0.10) * k;
  }

  poseFlinch(S, t) {
    const A = this.A;
    const k = hitCurve(this.stateTime, 0.35, 0);
    const p = Math.min(1.3, this.hitPower || 0.5);
    this.stance(S, {
      drop: A.crouch * 0.35 * k * p,
      front: { reach: -0.03 * k * p },
      back: { reach: 0.02 * k * p },
    });
    this.spine(S, 0.22 * k * p, 0, 0);
    S(A.trunk[A.trunk.length - 1], -0.40 * k * p, 0, 0.20 * k * p * Math.sign(this.anim.hitYaw.x || 1));
    if (A.jawBone) S(A.jawBone, 0.45 * k);
    this.tail(t, 0.25 * k, 0.2, 6);
  }

  poseStagger(S, t) {
    const A = this.A;
    const total = this.type.staggerDuration || 2.4;
    const k = smooth(this.stateTime / 0.18) * clamp01(1 - (this.stateTime - total * 0.72) / (total * 0.28));
    const wob = Math.sin(this.stateTime * (A.heavy ? 4.2 : 7.5)) * k;
    this.stance(S, {
      drop: A.crouch * 1.15 * k,
      front: { reach: 0.10 * k, splay: 0.22 * k },
      back: { reach: -0.06 * k, splay: 0.18 * k },
    });
    this.spine(S, 0.26 * k, wob * 0.20, wob * 0.20);
    S(A.trunk[A.trunk.length - 1], -0.50 * k, wob * 0.26, wob * 0.20);
    if (A.jawBone) S(A.jawBone, 0.55 * k);
    this.tail(t, 0.20 * k, 0.28, 5);
    this.visual.rotation.z += wob * 0.08;
  }

  poseDeath(S, t) {
    const A = this.A;
    const T = this.stateTime;
    const sl = A.deathSlow || 1;
    // Three beats: the legs give way, the mass drops, the body topples onto
    // its flank — then a late twitch so the corpse is not simply switched off.
    const buckle = smooth(clamp01(T / (0.20 * sl)));
    const fall = decelerate(clamp01((T - 0.10 * sl) / (0.40 * sl)), 2.2);
    const roll = decelerate(clamp01((T - 0.20 * sl) / (0.52 * sl)), 2.4);
    const side = this.deathSide || 1;
    const th = roll * A.deathRoll * side;
    const sink = A.bodyY - A.bodyR;
    const tw = T > 0.9 * sl && T < 2.0 * sl
      ? Math.exp(-(T - 0.9 * sl) * 3.4) * Math.sin((T - 0.9 * sl) * 20) * 0.05 : 0;
    // the legs fold under rather than staying planted: lifting the feet by the
    // same distance the body drops keeps them on the ground while it collapses
    this.stance(S, {
      front: { reach: 0.16 * buckle - 0.12 * roll, lift: sink * fall, splay: 0.5 * roll },
      back: { reach: -0.14 * fall, lift: sink * fall, splay: 0.45 * roll },
    });
    this.spine(S, 0.22 * fall + tw, 0.26 * roll * side, 0);
    S(A.trunk[A.trunk.length - 1], -0.28 * buckle + 0.10 * roll, 0.22 * roll * side, 0.30 * roll * side);
    if (A.jawBone) S(A.jawBone, 0.42 * buckle * (1 - roll * 0.5));
    this.tail(t, 0.10 - 0.35 * fall, 0.28 * (1 - roll), 3);
    // `visual` pivots at ground level, so a roll about it swings the body
    // *through* the floor. Solve for where the body centre should end up and
    // translate by the difference instead of guessing an offset.
    const centre = A.bodyY - sink * fall;
    this.visual.rotation.z += th;
    this.visual.rotation.x += fall * 0.06;
    this.visual.position.y += centre - A.bodyY * Math.cos(th);
    this.visual.position.x += A.bodyY * Math.sin(th) * 0.5;
  }

  poseIdle(S, t) {
    const A = this.A;
    const br = Math.sin(t * (A.breath ?? 1.5)) * 0.03 + Math.sin(t * 0.61) * 0.012;
    this.stance(S, {
      drop: A.crouch * 0.10 + br * 0.2 * (A.breathY ?? 1),
      front: { reach: 0.015 * Math.sin(t * 0.8) },
      back: { reach: -0.02, splay: 0.02 },
    });
    this.spine(S, br, Math.sin(t * 0.31) * 0.06, Math.sin(t * 0.4) * 0.012);
    S(A.trunk[A.trunk.length - 1], 0.04 + (A.idleHead || 0), Math.sin(t * 0.23 + this.id) * 0.20, Math.sin(t * 0.19) * 0.05);
    if (A.jawBone) S(A.jawBone, 0.05 + Math.max(0, Math.sin(t * 0.4 - 1.2)) * 0.10);
    this.tail(t, A.tailIdle ?? -0.12, 0.2, 1.1);
  }
}

/** How much of a spine bend each link takes, root first. */
const SPINE_W = [0.9, 1.0, 0.85, 0.7, 0.6];
