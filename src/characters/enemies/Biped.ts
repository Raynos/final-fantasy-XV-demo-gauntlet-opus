import { Enemy } from './EnemyBase.ts';
import { poseBone } from './RigBuilder.ts';
import { attackEnvelope, hitCurve, clamp01, smooth, lerp, decelerate, legPhase } from '../rig/CreatureAnim.ts';

/**
 * Shared two-legged animation — magitek troopers, imperial infantry, giants.
 *
 * A biped's whole read is weight transfer: which foot is carrying, how far the
 * pelvis has shifted over it, and how much the torso counter-rotates against
 * the arms. Feet are solved with IK against a stride so they plant instead of
 * swinging, and the pelvis rides the support leg, which is what separates a
 * march from a puppet bobbing on the spot.
 *
 * ```
 * A = {
 *   legs: {L:[hip,knee,foot], R:[...]}, arms: {L:[shoulder,elbow,hand], R:[...]}
 *   trunk: ['pelvis','spine','chest','neck','head']
 *   strideLen, stride, lift, duty     gait geometry, metres / fraction
 *   hipY, bodyR                       pelvis bind height, torso half-depth
 *   armSwing, torsoTwist, marchStiff  0 = loose animal, 1 = drilled machine
 * }
 * ```
 */
export class BipedEnemy extends Enemy {
  _chestPitch!: any;
  _chestYaw!: number;
  override _dt!: any;
  override anim!: any;
  override deathPush!: any;
  override deathSide!: any;
  override hitPower!: any;
  override id!: any;
  override moveSpeed!: any;
  override rig!: any;
  override speed!: any;
  override state!: any;
  override stateTime!: any;
  override type!: any;
  override visual!: any;
  get A() { return this.constructor.ANIM; }

  override setupAnim(anim: any) {
    const A = this.A;
    anim.setTrunk(A.trunk);
    if (A.legs.L) anim.leg('fL', A.legs.L);
    if (A.legs.R) anim.leg('fR', A.legs.R);
  }

  override pose(state: any, t: any) {
    if (!this.rig) return;
    const S = (n: any, x: any, y: any, z: any) => poseBone(this.rig, n, x, y, z);
    switch (state) {
      case 'run':
      case 'walk':
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

  /** Both feet at an offset from bind; `drop` lowers the body, not the legs. */
  stance(S: any, o: any) {
    const a = this.anim, A = this.A;
    const drop = o.drop || 0;
    const l = o.L || o, r = o.R || o;
    a.solveLeg('fL', l.reach || 0, (l.lift || 0) + drop, S, {
      kneeSign: A.kneeSign ?? 1, footPitch: (l.footPitch ?? A.footPitch ?? 0), splay: -(l.splay || 0),
    });
    a.solveLeg('fR', r.reach || 0, (r.lift || 0) + drop, S, {
      kneeSign: A.kneeSign ?? 1, footPitch: (r.footPitch ?? A.footPitch ?? 0), splay: (r.splay || 0),
    });
    if (drop) this.visual.position.y -= drop;
  }

  /** Arm pose as three joint angles per side. */
  arm(S: any, side: any, sh: any, el: any, hd: any) {
    const c = this.A.arms[side];
    if (!c) return;
    S(c[0], sh[0], sh[1], sh[2]);
    if (c[1]) S(c[1], el[0], el[1], el[2]);
    if (c[2] && hd) S(c[2], hd[0], hd[1], hd[2]);
  }

  /**
   * Bend the torso. The weights are shares of *one* bend, normalised over the
   * run from hips to chest — written raw they compound down the parent chain
   * and a 0.3 rad lean arrives at the shoulders as 1.1 rad.
   */
  spine(S: any, pitch: any, yaw = 0, roll = 0) {
    const t = this.A.trunk, w = this.A.spineW || SPINE_W;
    let sum = 0;
    for (let i = 0; i <= t.length - 3; i++) sum += w[Math.min(w.length - 1, i)];
    const n = sum > 1e-4 ? 1 / sum : 1;
    let acc = 0, chest = 0, chestF = 0;
    for (let i = 0; i < t.length; i++) {
      const k = w[Math.min(w.length - 1, i)] * n;
      S(t[i], pitch * k, yaw * k, roll * k);
      if (i <= t.length - 3) { chest = acc + pitch * k; chestF += k; }
      acc += pitch * k;
    }
    this._chestPitch = chest;
    this._chestYaw = yaw * chestF;
  }

  /**
   * Point the head in spite of the torso. Without this the skull rides every
   * lean and twist the body makes, so a soldier bracing to fire ends up
   * looking at his own boots.
   */
  aimHead(S: any, o = {}) {
    const t = this.A.trunk;
    const stab = (this._chestPitch || 0) * (o.stabilise ?? 0.9);
    const sy = (this._chestYaw || 0) * (o.stabilise ?? 0.9);
    const pitch = o.pitch || 0, yaw = o.yaw || 0, roll = o.roll || 0;
    if (t.length >= 2) S(t[t.length - 2], -stab * 0.55 + pitch * 0.4, -sy * 0.55 + yaw * 0.45, roll * 0.4);
    S(t[t.length - 1], -stab * 0.45 + pitch * 0.6, -sy * 0.45 + yaw * 0.55, roll * 0.6);
  }

  _timingAll() {
    return {
      telegraph: this._timing('telegraph'), strike: this._timing('strike'),
      attack: this._timing('attack'), recover: this._timing('recover'),
    };
  }

  /* -------------------------------------------------------------- poses */

  poseLocomotion(S: any, t: any) {
    const A = this.A, a = this.anim;
    const sp = this.moveSpeed || 0;
    const norm = clamp01(sp / this.speed);
    const gait = { duty: A.duty ?? 0.62, stride: 1, lift: 1, bob: 1, sway: 1 };
    a.stride(this._dt || 0, sp, A.strideLen);
    const pL = legPhase(a.gaitPhase, gait);
    const pR = legPhase(a.gaitPhase - 0.5, gait);
    const stride = A.stride * (0.55 + 0.45 * norm);
    const lift = A.lift * (0.4 + 0.6 * norm);
    // the pelvis rides over whichever foot is carrying: the single cue that
    // separates a walk from a torso sliding along on two pendulums
    const shift = (pL.load - pR.load) * (A.hipSway ?? 0.035);
    const support = pL.load + pR.load;
    this.stance(S, {
      L: { reach: pL.reach * stride, lift: pL.lift * lift, footPitch: (A.footPitch || 0) - pL.lift * 0.45 },
      R: { reach: pR.reach * stride, lift: pR.lift * lift, footPitch: (A.footPitch || 0) - pR.lift * 0.45 },
    });
    const bob = (support / 1.35 - 1) * (A.bob ?? 0.035) * (0.4 + 0.6 * norm);
    this.visual.position.y += bob;
    this.visual.position.x += shift;

    const swing = Math.sin(a.gaitPhase * Math.PI * 2);
    const sw = A.armSwing * (0.4 + 0.6 * norm);
    this.spine(S, (A.lean ?? 0.06) * norm, -swing * (A.torsoTwist ?? 0.10) * norm, shift * 0.6);
    this.poseArms(S, t, swing * sw, norm);
    a.load[0] = pL.load; a.load[1] = pR.load;
  }

  /**
   * Arms during locomotion. Default is a counter-swing; a species carrying a
   * weapon overrides this to keep the weapon on target instead.
   */
  poseArms(S: any, t: any, swing: any, norm: any) {
    const A = this.A;
    this.arm(S, 'L', [swing, 0, A.armOut ?? 0.10], [-(A.elbow ?? 0.4) - Math.max(0, swing) * 0.5, 0, 0], null);
    this.arm(S, 'R', [-swing, 0, -(A.armOut ?? 0.10)], [-(A.elbow ?? 0.4) - Math.max(0, -swing) * 0.5, 0, 0], null);
  }

  poseTelegraph(S: any, t: any) {
    const A = this.A;
    const env = attackEnvelope('telegraph', this.stateTime, this._timingAll());
    const k = env.tension;
    this.poseWindUp(S, t, k, env);
  }

  /** Species wind-up. Default: shoulders load back, weight onto the rear foot. */
  poseWindUp(S: any, t: any, k: any, env: any) {
    const A = this.A;
    this.stance(S, {
      drop: (A.crouch ?? 0.06) * k,
      L: { reach: -(A.step ?? 0.12) * k },
      R: { reach: (A.step ?? 0.12) * k },
    });
    this.spine(S, -0.10 * k + env.shake, -(A.windTwist ?? 0.35) * k, 0);
    this.arm(S, 'R', [-0.6 * k, -0.5 * k, -0.4 * k], [-1.5 * k, 0, 0], null);
    this.arm(S, 'L', [-0.3 * k, 0.35 * k, 0.4 * k], [-1.0 * k, 0, 0], null);
  }

  poseAttack(S: any, t: any) {
    const env = attackEnvelope(this.state === 'recover' ? 'recover' : 'attack', this.stateTime, this._timingAll());
    this.poseSwing(S, t, env.k, env);
  }

  /** Species strike. Default: a committed downward swing with follow-through. */
  poseSwing(S: any, t: any, k: any, env: any) {
    const A = this.A;
    const kp = clamp01(k);
    this.stance(S, {
      drop: (A.crouch ?? 0.06) * 0.5 * kp,
      L: { reach: (A.step ?? 0.12) * k },
      R: { reach: -(A.step ?? 0.12) * k },
    });
    this.spine(S, 0.18 * k, (A.windTwist ?? 0.35) * 0.9 * k, 0);
    this.arm(S, 'R', [-1.5 + 1.0 * k, 0.35 * k, 0.5 * k], [-0.9 + 0.7 * kp, 0, 0], null);
    this.arm(S, 'L', [-0.3 + 0.4 * k, -0.2 * k, -0.3 * k], [-0.8, 0, 0], null);
  }

  poseFlinch(S: any, t: any) {
    const A = this.A;
    const k = hitCurve(this.stateTime, 0.34, 0);
    const p = Math.min(1.3, this.hitPower || 0.5);
    const yaw = Math.sign(this.anim.hitYaw.x || 1);
    this.stance(S, {
      drop: 0.05 * k * p,
      L: { reach: -0.06 * k * p, splay: 0.06 * k },
      R: { reach: 0.06 * k * p, splay: 0.06 * k },
    });
    this.spine(S, 0.30 * k * p, 0.16 * k * yaw, 0.10 * k * yaw);
    this.arm(S, 'L', [0.5 * k * p, 0.3 * k, 0.6 * k * p], [-1.3 * k * p, 0, 0], null);
    this.arm(S, 'R', [0.5 * k * p, -0.3 * k, -0.6 * k * p], [-1.3 * k * p, 0, 0], null);
  }

  poseStagger(S: any, t: any) {
    const A = this.A;
    const total = this.type.staggerDuration || 2.4;
    const k = smooth(this.stateTime / 0.16) * clamp01(1 - (this.stateTime - total * 0.7) / (total * 0.3));
    const wob = Math.sin(this.stateTime * 5.2) * k;
    // reeling: the feet chase the centre of mass and never quite catch it
    this.stance(S, {
      drop: 0.12 * k,
      L: { reach: (0.18 + wob * 0.2) * k, splay: 0.16 * k },
      R: { reach: (-0.14 - wob * 0.2) * k, splay: 0.16 * k },
    });
    this.spine(S, 0.36 * k, wob * 0.30, wob * 0.26);
    this.arm(S, 'L', [0.9 * k, 0.5 * k + wob * 0.3, 0.9 * k], [-1.1 * k, 0, 0], null);
    this.arm(S, 'R', [0.9 * k, -0.5 * k + wob * 0.3, -0.9 * k], [-1.1 * k, 0, 0], null);
    this.visual.rotation.z += wob * 0.10;
    this.visual.rotation.x += 0.10 * k;
  }

  poseDeath(S: any, t: any) {
    const A = this.A;
    const T = this.stateTime;
    const sl = A.deathSlow || 1;
    // The knees go first, then the hips, then the whole body pitches over the
    // way the killing blow pushed it.
    const knee = smooth(clamp01(T / (0.18 * sl)));
    const fold = decelerate(clamp01((T - 0.10 * sl) / (0.36 * sl)), 2.0);
    const topple = decelerate(clamp01((T - 0.22 * sl) / (0.55 * sl)), 2.2);
    const fwd = (this.deathPush ?? 1) >= 0 ? -1 : 1;   // hit from the front = falls backward
    const side = this.deathSide || 1;
    const sink = A.hipY - A.bodyR;
    const tw = T > 0.85 * sl && T < 1.9 * sl
      ? Math.exp(-(T - 0.85 * sl) * 3.2) * Math.sin((T - 0.85 * sl) * 18) * 0.05 : 0;
    this.stance(S, {
      L: { reach: 0.10 * knee - 0.10 * topple, lift: sink * fold, splay: 0.26 * topple },
      R: { reach: -0.12 * knee + 0.08 * topple, lift: sink * fold, splay: 0.22 * topple },
    });
    this.spine(S, (0.35 * knee + tw) * -fwd, 0.20 * topple * side, 0.16 * topple * side);
    this.arm(S, 'L', [1.5 * topple * -fwd, 0.5 * topple, 0.7 * topple], [-0.7 * topple, 0, 0], null);
    this.arm(S, 'R', [1.5 * topple * -fwd, -0.5 * topple, -0.7 * topple], [-0.7 * topple, 0, 0], null);
    const th = topple * (A.deathPitch ?? 1.45) * fwd;
    const centre = A.hipY - sink * fold;
    this.visual.rotation.x += th;
    this.visual.rotation.z += topple * 0.25 * side;
    this.visual.position.y += centre - A.hipY * Math.cos(th);
    this.visual.position.z -= A.hipY * Math.sin(th) * 0.6;
  }

  poseIdle(S: any, t: any) {
    const A = this.A;
    const br = Math.sin(t * (A.breath ?? 1.4)) * 0.02;
    const load = Math.sin(t * 0.33 + this.id) * (A.marchStiff ? 0.15 : 0.6);
    this.stance(S, {
      drop: 0.012 + br * 0.4,
      L: { reach: 0.02 * load },
      R: { reach: -0.02 * load },
    });
    this.spine(S, br + (A.idleLean ?? 0), Math.sin(t * 0.21 + this.id) * 0.06, load * 0.02);
    this.poseArms(S, t, Math.sin(t * 0.5) * 0.03, 0);
  }
}

const SPINE_W = [0.7, 1.0, 0.9, 0.7, 0.7];
export { SPINE_W, lerp };
