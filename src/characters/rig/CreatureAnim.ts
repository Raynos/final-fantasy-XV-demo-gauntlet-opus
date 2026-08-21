import * as THREE from 'three';

/**
 * Creature animation core.
 *
 * Enemy `pose()` functions used to be pose-lerps: a target set of Euler angles
 * multiplied by a ramp. That reads as a slide-show — no anticipation, no
 * follow-through, no weight, and a skeleton that snaps to the next pose the
 * instant a state changes. This module supplies the four things that turn that
 * into animation:
 *
 * 1. **Analytic leg IK.** A foot is given a *position* (fore/aft reach, lift,
 *    splay) and the hip/knee/hock angles are solved for it. Feet plant on the
 *    ground and stay there through stance, so a gait stops skating.
 * 2. **Real gait phasing.** Quadrupeds have named footfall sequences — a walk
 *    is lateral, a trot is diagonal couplets, a gallop is a transverse
 *    four-beat with a suspension phase. Sine waves at 180° are none of these.
 * 3. **Attack envelopes.** One continuous curve across telegraph → strike →
 *    recover with anticipation before the blow and overshoot after it, so the
 *    player reads the wind-up as a wind-up.
 * 4. **Impact springs.** Damage pushes the body; the body oscillates back.
 *    A hit is absorbed over time instead of teleporting the skeleton.
 *
 * Everything is additive on top of whatever the species authored, and is
 * applied by `Enemy` after `pose()` returns, so a species opts in per feature.
 */


/** Critically-ish damped angular spring. */
export class Spring {
  c!: any;
  k!: any;
  v!: number;
  x!: number;
  constructor(k = 90, c = 14) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  step(target: any, dt: any) {
    // sub-step so a long frame (or a hitstop leaving and re-entering) stays stable
    const n = dt > 0.033 ? Math.ceil(dt / 0.016) : 1;
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (this.k * (target - this.x) - this.c * this.v) * h;
      this.x += this.v * h;
    }
    if (!Number.isFinite(this.x)) { this.x = 0; this.v = 0; }
    return this.x;
  }
  kick(v: any) { this.v += v; return this; }
  reset() { this.x = 0; this.v = 0; return this; }
}

/**
 * Quadruped footfall sequences. Each entry is the fraction of the stride cycle
 * at which that foot touches down, ordered [frontL, frontR, backL, backR],
 * plus `duty` — the fraction of the cycle the foot spends on the ground.
 * Below 0.5 the animal has airborne moments, which is what a gallop *is*.
 */
export const GAITS = {
  /** Lateral-sequence walk: BL, FL, BR, FR. Always two or three feet down. */
  walk: { touch: [0.25, 0.75, 0.0, 0.5], duty: 0.68, lift: 0.55, stride: 1.0, bob: 0.35, sway: 1.0 },
  /** Diagonal couplets. The signature two-beat of a dog or horse trotting. */
  trot: { touch: [0.0, 0.5, 0.5, 0.0], duty: 0.46, lift: 0.95, stride: 1.25, bob: 1.0, sway: 0.45 },
  /** Three-beat canter, right lead. */
  canter: { touch: [0.32, 0.62, 0.0, 0.32], duty: 0.38, lift: 1.2, stride: 1.5, bob: 1.5, sway: 0.5 },
  /** Transverse gallop with a gathered suspension. Full sprint. */
  gallop: { touch: [0.50, 0.64, 0.0, 0.15], duty: 0.31, lift: 1.5, stride: 1.85, bob: 2.0, sway: 0.3 },
  /** Heavy animals never leave the ground; they just get faster and rock more. */
  lumber: { touch: [0.25, 0.75, 0.0, 0.5], duty: 0.74, lift: 0.42, stride: 0.85, bob: 0.55, sway: 1.5 },
};

const LEG_ORDER = ['fL', 'fR', 'bL', 'bR'];

/**
 * Where one foot is in its cycle.
 * @returns
 *  `reach` is +1 fully forward, -1 fully back; `load` is 0..1 weight carried.
 */
export function legPhase(u: any, gait: any): {stance:boolean, f:number, reach:number, lift:number, load:number} {
  let t = u % 1; if (t < 0) t += 1;
  const duty = gait.duty;
  if (t < duty) {
    // stance: the foot is planted, so it travels backward under the body at a
    // constant rate — this is the part that must be linear or the gait skates
    const f = t / duty;
    return { stance: true, f, reach: 1 - 2 * f, lift: 0, load: Math.sin(Math.PI * Math.min(1, f * 1.15)) * 0.85 + 0.15 };
  }
  const f = (t - duty) / (1 - duty);
  // swing: fast recovery forward with a lifted, front-loaded arc
  const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
  return { stance: false, f, reach: -1 + 2 * e, lift: Math.pow(Math.sin(Math.PI * f), 0.8), load: 0 };
}

/**
 * A solved leg: rotations for a 3- or 4-bone chain that put the foot at a
 * requested offset from its bind position.
 */
export class LegChain {
  L1!: any;
  L2!: any;
  footRel!: any;
  hasHock!: boolean;
  names!: any;
  ok!: any;
  reachLen!: any;
  seg!: any[];
  /**
   * @param names hip → knee → (hock) → foot
   */
  constructor(bones: Map<string, THREE.Bone>, names: string[]) {
    this.names = names;
    const b = names.map((n) => bones.get(n));
    this.ok = b.every(Boolean);
    if (!this.ok) return;
    // In bind pose every enemy bone has identity rotation, so a child's local
    // position *is* its world-space offset — the whole chain can be measured
    // straight off the skeleton with no bind-matrix bookkeeping.
    this.seg = [];
    for (let i = 1; i < b.length; i++) {
      const p = b[i]!.position;
      this.seg.push({ len: p.length(), phi: Math.atan2(p.z, -p.y), y: p.y, z: p.z });
    }
    // The IK solves the *upper* two segments only. On a digitigrade leg the
    // third segment is the pastern, which stays near-vertical and is levelled
    // afterwards — solving through it would let the ankle hyper-extend.
    this.footRel = new THREE.Vector3().copy(b[1]!.position);
    if (b[2]) this.footRel.add(b[2].position);
    this.L1 = this.seg[0].len;
    this.L2 = this.seg.length > 1 ? this.seg[1].len : 0;
    this.hasHock = this.seg.length > 2;
    this.reachLen = this.L1 + this.L2;
  }
}

/**
 * Per-creature animation state: gait phase, leg chains, impact springs and the
 * additive layer that survives whatever the species pose function did.
 */
export class CreatureAnim {
  legs!: Map<any, any>;
  airPos!: THREE.Vector3;
  airVel!: THREE.Vector3;
  airborne!: boolean;
  bodyPitch!: number;
  bodyRoll!: number;
  bodyY!: number;
  enemy!: any;
  gaitBlend!: number;
  gaitName!: string;
  gaitPhase!: number;
  hitAmount!: number;
  hitPitch!: Spring;
  hitRoll!: Spring;
  hitYaw!: Spring;
  load!: number[];
  pushLocal!: any;
  pushX!: Spring;
  pushZ!: Spring;
  responsiveness!: number;
  rig!: any;
  shake!: number;
  smooth!: Map<any, any>;
  speed!: number;
  spin!: number;
  spinVel!: number;
  trunk!: any[];
  /** @param enemy owning Enemy */
  constructor(enemy: any) {
    this.enemy = enemy;
    this.rig = enemy.rig;
    this.legs = new Map();
    this.gaitPhase = (enemy.id % 8) / 8;
    this.gaitName = 'walk';
    this.gaitBlend = 0;
    this.speed = 0;

    /* impact: the body absorbing a blow, then recovering */
    this.hitPitch = new Spring(150, 15);
    this.hitRoll = new Spring(150, 15);
    this.hitYaw = new Spring(140, 15);
    this.pushZ = new Spring(80, 12);
    this.pushX = new Spring(80, 12);
    this.hitAmount = 0;          // 0..1, drives how deep the flinch is
    this.shake = 0;              // high-frequency tremor right at the impact

    /* ballistics for knockback / launch */
    this.airVel = new THREE.Vector3();
    this.airPos = new THREE.Vector3();
    this.airborne = false;
    this.spin = 0;
    this.spinVel = 0;

    /* smoothing: the applied skeleton chases the authored target */
    this.smooth = new Map();
    this.responsiveness = 26;
    this.trunk = [];
    /** Per-foot ground load, [fL, fR, bL, bR]. Read by dust/step effects. */
    this.load = [0, 0, 0, 0];
    this.bodyY = 0;
    this.bodyRoll = 0;
    this.bodyPitch = 0;
    this.pushLocal = { x: 0, z: 0 };
  }

  /** Register a leg. @param id 'fL'|'fR'|'bL'|'bR' @param chain */
  leg(id: string, chain: string[]) {
    const c = new LegChain(this.rig.byName, chain);
    if (c.ok) this.legs.set(id, c);
    return this;
  }

  /** Bones the additive impact layer leans. Root of the spine first. */
  setTrunk(names: any) { this.trunk = names.filter((n: any) => this.rig.byName.has(n)); return this; }

  /**
   * Advance the stride. `speed` is metres/second, `stride` the distance one
   * full cycle covers — deriving phase from distance travelled is what keeps a
   * gait locked to the ground at every speed instead of only at one.
   * @param dt @param speed @param strideLen
   */
  stride(dt: number, speed: number, strideLen: number) {
    this.speed = speed;
    this.gaitPhase = (this.gaitPhase + (speed * dt) / Math.max(0.15, strideLen)) % 1;
    return this.gaitPhase;
  }

  /** Choose a gait by normalised speed (0 idle → 1 flat out). */
  pickGait(norm: any, heavy = false) {
    if (heavy) return norm < 0.55 ? GAITS.lumber : GAITS.walk;
    if (norm < 0.30) return GAITS.walk;
    if (norm < 0.62) return GAITS.trot;
    if (norm < 0.85) return GAITS.canter;
    return GAITS.gallop;
  }

  /**
   * Solve one leg so its foot sits at (side, lift, reach) from its bind
   * position, and write the rotations into `out(name, x, y, z)`.
   *
   * @param reach metres fore(+)/aft(-)
   * @param lift metres above the bind foot height
   * @param [o] {splay, compress, footPitch, kneeSign, twist,
   *                      rootPitch, rootDY, rootDZ}
   *
   * `rootPitch`/`rootDY`/`rootDZ` describe how the *trunk above this leg* has
   * moved this frame. Without them the solver places the foot relative to a
   * shoulder it believes is still in bind pose: pitch the chest 15° and the
   * whole front assembly swings, carrying a "planted" paw a hand's width
   * through the floor. Cancelling the parent transform out of the target is
   * what makes a planted foot actually stay planted.
   */
  solveLeg(id: string, reach: number, lift: number, out: ((...args: any[]) => any), o: any = {}) {
    const c = this.legs.get(id);
    if (!c) return;
    const kneeSign = o.kneeSign ?? 1;      // +1 knee forward, -1 knee back (hock)
    let dy = c.footRel.y + lift - (o.compress || 0) - (o.rootDY || 0);
    let dz = c.footRel.z + reach - (o.rootDZ || 0);
    const th = o.rootPitch || 0;
    if (th) {
      // re-express the world-space target in the root's *rotated* frame
      const cs = Math.cos(th), sn = Math.sin(th);
      const y2 = dy * cs + dz * sn;
      dz = -dy * sn + dz * cs;
      dy = y2;
    }
    let d = Math.hypot(dy, dz);
    const maxD = c.reachLen * 0.995;
    const minD = Math.abs(c.L1 - c.L2) + c.reachLen * 0.06;
    if (d > maxD) d = maxD;
    if (d < minD) d = minD;
    const phiTarget = Math.atan2(dz, -dy);

    // interior angle at the hip between the limb line and the upper segment
    const ca = (c.L1 * c.L1 + d * d - c.L2 * c.L2) / (2 * c.L1 * d);
    const a1 = Math.acos(THREE.MathUtils.clamp(ca, -1, 1));
    const phiUpper = phiTarget + a1 * kneeSign;
    // and the bend at the knee
    const cb = (c.L1 * c.L1 + c.L2 * c.L2 - d * d) / (2 * c.L1 * c.L2);
    const bend = Math.PI - Math.acos(THREE.MathUtils.clamp(cb, -1, 1));
    const phiLower = phiUpper - bend * kneeSign;

    const rHip = c.seg[0].phi - phiUpper;
    const rKnee = (c.seg[1] ? c.seg[1].phi : 0) - phiLower - rHip;
    // the pastern is levelled against the *world*, so the trunk's pitch has to
    // come back out of it too or the paw tips up with the shoulder
    const fp = (o.footPitch || 0) + th;
    out(c.names[0], rHip, o.twist || 0, o.splay || 0);
    if (c.names[1]) out(c.names[1], rKnee, 0, 0);
    if (c.hasHock && c.names[2]) {
      // a digitigrade hock takes up the remaining bend and levels the pastern
      const rHock = (c.seg[2].phi) - fp - rHip - rKnee;
      out(c.names[2], rHock * (o.hockK ?? 1), 0, 0);
      if (c.names[3]) out(c.names[3], (o.pawPitch || 0), 0, 0);
    } else if (c.names[2]) {
      out(c.names[2], (c.seg[2] ? c.seg[2].phi : 0) - fp - rHip - rKnee, 0, 0);
    }
  }

  /**
   * Run a full quadruped gait, writing every leg.
   * @param gait one of GAITS
   * @param out pose writer
   * @param o {stride, lift, splay, footPitch, kneeSign:{f,b}}
   */
  quadGait(gait: any, out: ((...args: any[]) => any), o: any = {}) {
    const strideM = (o.stride || 0.3) * gait.stride;
    const liftM = (o.lift || 0.12) * gait.lift;
    const phases = [];
    for (let i = 0; i < 4; i++) {
      const ph = legPhase(this.gaitPhase - gait.touch[i], gait);
      phases.push(ph);
      this.load[i] = ph.load;
    }
    // Vertical bounce and lateral rock, derived from how many feet are loaded.
    // Solved *before* the legs, not after: the bob translates the whole body,
    // so a foot that does not know about it is planted relative to a body that
    // is about to move out from under it — every stance foot sinks by exactly
    // the bob depth. Feet through the floor is what that looks like.
    const support = this.load[0] + this.load[1] + this.load[2] + this.load[3];
    this.bodyY = (support / 2.6 - 1) * 0.055 * gait.bob * (o.bodyScale || 1);
    this.bodyRoll = ((this.load[0] + this.load[2]) - (this.load[1] + this.load[3]))
      * 0.035 * gait.sway * (o.bodyScale || 1);
    this.bodyPitch = ((this.load[0] + this.load[1]) - (this.load[2] + this.load[3]))
      * 0.030 * gait.bob * (o.bodyScale || 1);
    for (let i = 0; i < 4; i++) {
      const id = LEG_ORDER[i];
      if (!this.legs.has(id)) continue;
      const ph = phases[i];
      const front = i < 2;
      const s = front ? (o.frontScale ?? 1) : (o.backScale ?? 1);
      const cp = front ? o.compF : o.compB;
      // a planted foot holds world height, so it rises in body space by the bob
      const bob = ph.stance ? -this.bodyY : -this.bodyY * (1 - ph.lift);
      this.solveLeg(id, ph.reach * strideM * s, ph.lift * liftM * s + bob, out, {
        splay: (o.splay || 0) * (id.endsWith('L') ? -1 : 1),
        kneeSign: front ? (o.kneeF ?? 1) : (o.kneeB ?? -1),
        footPitch: (o.footPitch || 0) - (ph.stance ? 0 : ph.lift * 0.5),
        compress: ph.stance ? Math.sin(Math.PI * ph.f) * (o.compress || 0) : 0,
        hockK: o.hockK,
        pawPitch: ph.stance ? (o.pawPitch || 0) : (o.pawPitch || 0) - ph.lift * 0.6,
        rootPitch: cp ? cp.pitch : 0, rootDY: cp ? cp.dy : 0, rootDZ: cp ? cp.dz : 0,
      });
    }
    return this;
  }

  /* ------------------------------------------------------------ impact */

  /**
   * Absorb a blow. Direction is world-space; it is resolved into the
   * creature's own frame so a hit from behind pitches it forward and a hit
   * from the side rolls it.
   * @param dir world direction of the blow
   * @param power 0..1+ severity
   * @param heading creature heading
   */
  impact(dir: THREE.Vector3, power: number, heading: number) {
    const cs = Math.cos(-heading), sn = Math.sin(-heading);
    const lx = dir.x * cs - dir.z * sn;
    const lz = dir.x * sn + dir.z * cs;
    const p = Math.min(2.4, power);
    this.hitPitch.kick(lz * p * 9);
    this.hitRoll.kick(-lx * p * 7);
    this.hitYaw.kick(lx * p * 5);
    this.pushZ.kick(lz * p * 5.5);
    this.pushX.kick(lx * p * 5.5);
    this.hitAmount = Math.min(1.4, this.hitAmount + p * 0.7);
    this.shake = Math.min(1, this.shake + p * 0.8);
  }

  /** Send the creature off the ground — launcher hits and big deaths. */
  launch(dir: any, up: any, forward: any, heading: any) {
    const cs = Math.cos(-heading), sn = Math.sin(-heading);
    this.airVel.set(dir.x * forward, up, dir.z * forward);
    this.airPos.set(0, 0, 0);
    this.airborne = true;
    this.spinVel = (dir.x * cs - dir.z * sn) * 2.2 + 3.4;
  }

  /**
   * Advance every spring and write the additive impact layer over whatever the
   * species already posed. Called by `Enemy.update` after `pose()`.
   */
  commit(dt: any, poseAdd: any) {
    if (dt <= 0) return;
    this.hitAmount = Math.max(0, this.hitAmount - dt * 1.9);
    this.shake = Math.max(0, this.shake - dt * 6.5);
    const pitch = this.hitPitch.step(0, dt);
    const roll = this.hitRoll.step(0, dt);
    const yaw = this.hitYaw.step(0, dt);
    const pz = this.pushZ.step(0, dt);
    const px = this.pushX.step(0, dt);

    const n = this.trunk.length;
    if (n && (Math.abs(pitch) > 1e-4 || Math.abs(roll) > 1e-4 || this.shake > 1e-3)) {
      const tr = this.shake * this.shake;
      for (let i = 0; i < n; i++) {
        // the further up the spine, the more the blow travels — a whip through
        // the body rather than a rigid tilt
        const k = 0.45 + 0.85 * (i / Math.max(1, n - 1));
        poseAdd(this.trunk[i], pitch * k * 0.16 + Math.sin(i * 2.3 + this.enemy.phase * 61) * tr * 0.05,
          yaw * k * 0.11, roll * k * 0.14);
      }
    }
    this.pushLocal = { x: px * 0.055, z: pz * 0.055 };
    return this;
  }
}

/* ---------------------------------------------------------------- curves */

export const clamp01 = (x: any) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (x: any) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
export const lerp = (a: any, b: any, t: any) => a + (b - a) * t;

/** Slow start, hard finish — a limb accelerating into a blow. */
export function accelerate(x: any, p = 2.6) { return Math.pow(clamp01(x), p); }
/** Hard start, long settle — the follow-through after one lands. */
export function decelerate(x: any, p = 3.2) { return 1 - Math.pow(1 - clamp01(x), p); }
/** Overshoot then settle. `s` is how far past the target it goes. */
export function overshoot(x: any, s = 1.5) {
  const t = clamp01(x);
  return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
}
/** Damped oscillation about 1 — a mass arriving and ringing down. */
export function settle(x: any, freq = 3.2, damp = 5.5) {
  const t = clamp01(x);
  return 1 - Math.exp(-damp * t) * Math.cos(freq * Math.PI * t);
}

/**
 * The shape of an attack, as one continuous number.
 *
 * Returns `k` running −1 (fully wound up, coiled away from the target)
 * through 0 (neutral) to +1 (fully committed, extended past the target), plus
 * the sub-phase so a species can trigger secondary motion.
 *
 * The wind-up *itself* eases out and holds — that hold is the telegraph the
 * player reads. The strike is an acceleration curve, and the recovery is a
 * damped return that overshoots slightly back through neutral.
 *
 * @param state 'telegraph'|'attack'|'recover'
 * @param t seconds inside the state
 * @param timing {telegraph, strike, attack, recover}
 */
export function attackEnvelope(state: string, t: number, timing: any) {
  const tel = Math.max(0.05, timing.telegraph);
  const atk = Math.max(0.05, timing.attack);
  const strike = Math.min(atk * 0.9, Math.max(0.02, timing.strike));
  const rec = Math.max(0.05, timing.recover);
  if (state === 'telegraph') {
    const f = clamp01(t / tel);
    // 70% of the wind-up happens in the first 45% of the window; the rest is
    // the coiled hold that gives the player time to react
    const w = f < 0.45 ? decelerate(f / 0.45, 2.4) * 0.86 : 0.86 + smooth((f - 0.45) / 0.55) * 0.14;
    // a tremor of held tension, strongest at full coil
    return { k: -w, phase: 'wind', f, tension: w, shake: Math.sin(t * 46) * 0.02 * w };
  }
  if (state === 'attack') {
    if (t < strike) {
      const f = clamp01(t / strike);
      return { k: lerp(-1, 1, accelerate(f, 2.2)), phase: 'strike', f, tension: 1 - f, shake: 0 };
    }
    const f = clamp01((t - strike) / Math.max(0.03, atk - strike));
    // past the contact frame the limb keeps going and slows: follow-through
    return { k: 1 + 0.28 * Math.sin(Math.PI * f) * (1 - f), phase: 'follow', f, tension: 0, shake: 0 };
  }
  // recover: ring back down through neutral
  const f = clamp01(t / rec);
  return { k: (1 - decelerate(f, 2.2)) * Math.cos(f * Math.PI * 1.15), phase: 'recover', f, tension: 0, shake: 0 };
}

/**
 * Hit-reaction shape. `level` 0 flinch → 3 launch. Returns the blend weight
 * of the reaction pose plus a recoil that decays with a bounce.
 */
export function hitCurve(t: any, dur: any, level = 0) {
  const f = clamp01(t / dur);
  const rise = clamp01(t / (0.04 + level * 0.02));
  const fall = 1 - smooth(clamp01((f - 0.35) / 0.65));
  return rise * fall;
}

export { LEG_ORDER };
