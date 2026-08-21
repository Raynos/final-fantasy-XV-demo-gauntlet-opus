import * as THREE from 'three';
import { clamp01, smooth, lerp } from './Geo.ts';
import { resolvePosture, POSTURE, GESTURES } from './Posture.ts';

/**
 * Procedural animation.
 *
 * There are no baked clips. Locomotion is one parametric gait function whose
 * *parameters* (stride, knee lift, lean, arm swing, stance fraction, bob) are
 * blended by speed — blending parameters instead of poses means walk, jog and
 * sprint interpolate without the foot-skate and limb popping you get from
 * cross-fading dissimilar cycles.
 *
 * On top of that sit additive layers (breathing, look-at, blink, arm sway),
 * a keyframed action layer for combat, two-bone foot IK against the terrain,
 * and spring bones for coat tails and long hair.
 */

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

/** Gait parameter sets, blended by speed. */
const IDLE_G = {
  stride: 0.05, kneeSwing: 0.20, stance: 0.68, lean: 0.0, arm: 0.06, elbow: 0.22,
  bob: 0.004, pelvisYaw: 0.02, chestYaw: 0.02, roll: 0.01, foot: 0.10, lift: 0.005,
};
const WALK_G = {
  stride: 0.40, kneeSwing: 0.95, stance: 0.62, lean: 0.045, arm: 0.30, elbow: 0.34,
  bob: 0.020, pelvisYaw: 0.10, chestYaw: 0.13, roll: 0.035, foot: 0.36, lift: 0.045,
};
const JOG_G = {
  stride: 0.60, kneeSwing: 1.35, stance: 0.44, lean: 0.13, arm: 0.62, elbow: 0.85,
  bob: 0.040, pelvisYaw: 0.13, chestYaw: 0.20, roll: 0.05, foot: 0.55, lift: 0.10,
};
const SPRINT_G = {
  stride: 0.80, kneeSwing: 1.75, stance: 0.34, lean: 0.26, arm: 0.92, elbow: 1.25,
  bob: 0.055, pelvisYaw: 0.16, chestYaw: 0.28, roll: 0.055, foot: 0.70, lift: 0.16,
};

function blendG(a: any, b: any, t: any, out: any) {
  for (const k in a) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

const TAU = Math.PI * 2;

/**
 * Saturate a −1..1 drive so it spends nearly all of its time *at* an extreme
 * and crosses quickly. A person shifting their weight is on one foot or the
 * other; a raw sine would leave them permanently mid-transfer, which is the
 * one place a body never rests.
 * @param x @returns −1..1
 */
function hold(x: number): number { return Math.tanh(x * 2.4); }

/**
 * A breath, 0 (fully exhaled) .. 1 (fully inhaled). Inhale occupies the first
 * 38% of the cycle and exhale the rest, because that asymmetry — not the
 * amplitude — is what makes a chest read as breathing rather than pulsing.
 * @param t seconds @param rate Hz @returns 
 */
function breathe(t: number, rate: number): number {
  const u = (t * rate) % 1;
  return u < 0.38 ? smooth(u / 0.38) : 1 - smooth((u - 0.38) / 0.62);
}

/** Bell envelope for a one-shot gesture: ease in, hold, ease out. */
function bell(u: any, holdFrac: any) {
  const inT = (1 - holdFrac) * 0.37;
  const outT = (1 - holdFrac) * 0.63;
  if (u <= 0 || u >= 1) return 0;
  if (u < inT) return smooth(u / inT);
  if (u > 1 - outT) return 1 - smooth((u - (1 - outT)) / outT);
  return 1;
}

/**
 * Which `POSTURE` entry a rig should use. The hero definitions carry display
 * names (`Gladiolus`) while NPC archetypes carry their own keys, and neither
 * stores the cast key it was built from.
 * @param character @returns 
 */
function postureKey(character: any): string {
  const n = String(character.name || '').toLowerCase();
  if (POSTURE[n as keyof typeof POSTURE]) return n;
  if (n.startsWith('glad')) return 'gladio';
  return n;
}

/** Keyframed action poses for combat. Values are XYZ Euler radians. */
export const ACTIONS = {
  attack_slash: {
    dur: 0.85, mask: 'upper',
    keys: [
      { t: 0, pose: {} },
      {
        t: 0.26,
        pose: {
          spine02: [0, -0.30, 0], spine03: [-0.10, -0.42, 0], neck: [0, 0.28, 0],
          upperArmR: [-0.85, -0.55, -0.85], lowerArmR: [-1.25, 0, 0], handR: [0, 0, 0.35],
          upperArmL: [-0.25, 0.4, 0.5], lowerArmL: [-0.85, 0, 0],
        },
      },
      {
        t: 0.42,
        pose: {
          spine02: [0.06, 0.42, 0], spine03: [0.14, 0.55, 0], neck: [0.05, -0.25, 0],
          upperArmR: [-0.55, 0.85, 0.95], lowerArmR: [-0.28, 0, 0], handR: [0, 0, -0.2],
          upperArmL: [-0.1, -0.3, 0.35], lowerArmL: [-0.55, 0, 0],
        },
      },
      {
        t: 0.62,
        pose: {
          spine02: [0.03, 0.24, 0], spine03: [0.08, 0.32, 0],
          upperArmR: [-0.2, 0.5, 0.65], lowerArmR: [-0.5, 0, 0],
          upperArmL: [-0.05, -0.15, 0.3], lowerArmL: [-0.5, 0, 0],
        },
      },
      { t: 0.85, pose: {} },
    ],
  },
  attack_thrust: {
    dur: 0.7, mask: 'upper',
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, pose: { spine03: [0, -0.35, 0], upperArmR: [-0.5, -0.5, -0.3], lowerArmR: [-1.7, 0, 0] } },
      { t: 0.36, pose: { spine03: [0.05, 0.22, 0], upperArmR: [-1.05, 0.15, 0.15], lowerArmR: [-0.15, 0, 0] } },
      { t: 0.7, pose: {} },
    ],
  },
  attack_overhead: {
    dur: 0.95, mask: 'upper',
    keys: [
      { t: 0, pose: {} },
      { t: 0.30, pose: { spine02: [-0.18, 0, 0], spine03: [-0.22, -0.12, 0], upperArmR: [-2.35, -0.2, -0.5], lowerArmR: [-1.1, 0, 0], upperArmL: [-2.0, 0.2, 0.5], lowerArmL: [-1.0, 0, 0] } },
      { t: 0.46, pose: { spine02: [0.30, 0, 0], spine03: [0.34, 0.05, 0], upperArmR: [-0.55, 0, 0.15], lowerArmR: [-0.15, 0, 0], upperArmL: [-0.5, 0, -0.15], lowerArmL: [-0.15, 0, 0] } },
      { t: 0.95, pose: {} },
    ],
  },
  guard: {
    dur: 0.6, hold: true, mask: 'upper',
    keys: [
      { t: 0, pose: {} },
      { t: 0.2, pose: { spine03: [0.05, -0.22, 0], neck: [0.06, 0.2, 0], upperArmR: [-1.15, -0.15, -0.35], lowerArmR: [-1.55, 0, 0], upperArmL: [-1.0, 0.2, 0.45], lowerArmL: [-1.65, 0, 0] } },
      { t: 0.6, pose: { spine03: [0.05, -0.22, 0], neck: [0.06, 0.2, 0], upperArmR: [-1.15, -0.15, -0.35], lowerArmR: [-1.55, 0, 0], upperArmL: [-1.0, 0.2, 0.45], lowerArmL: [-1.65, 0, 0] } },
    ],
  },
  hit: {
    dur: 0.5, mask: 'full',
    keys: [
      { t: 0, pose: {} },
      { t: 0.08, pose: { spine01: [-0.16, 0, 0], spine02: [-0.20, 0.06, 0], spine03: [-0.22, 0.1, 0], neck: [-0.30, 0, 0], upperArmR: [0.35, 0, -0.55], upperArmL: [0.35, 0, 0.55], thighL: [0.1, 0, 0], thighR: [0.12, 0, 0] } },
      { t: 0.24, pose: { spine02: [0.06, 0, 0], spine03: [0.08, -0.04, 0], neck: [0.10, 0, 0] } },
      { t: 0.5, pose: {} },
    ],
  },
  cast: {
    dur: 1.0, mask: 'upper',
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, pose: { spine03: [-0.05, 0.18, 0], upperArmL: [-1.25, 0.25, 0.55], lowerArmL: [-0.65, 0, 0], handL: [0.3, 0, 0], neck: [-0.06, -0.1, 0] } },
      { t: 0.7, pose: { spine03: [-0.05, 0.18, 0], upperArmL: [-1.35, 0.25, 0.5], lowerArmL: [-0.5, 0, 0], handL: [0.35, 0, 0] } },
      { t: 1.0, pose: {} },
    ],
  },
  warp: {
    dur: 0.8, mask: 'full',
    keys: [
      { t: 0, pose: {} },
      { t: 0.18, pose: { spine02: [-0.2, 0, 0], spine03: [-0.25, -0.3, 0], upperArmR: [-1.9, -0.3, -0.4], lowerArmR: [-0.7, 0, 0], thighL: [-0.5, 0, 0], shinL: [0.9, 0, 0], thighR: [0.25, 0, 0] } },
      { t: 0.42, pose: { spine02: [0.22, 0, 0], spine03: [0.3, 0.2, 0], upperArmR: [-1.1, 0.25, 0.3], lowerArmR: [-0.1, 0, 0], thighL: [-0.75, 0, 0], shinL: [1.2, 0, 0], thighR: [0.5, 0, 0] } },
      { t: 0.8, pose: {} },
    ],
  },
};

const UPPER = new Set([
  'spine01', 'spine02', 'spine03', 'neck', 'head', 'clavicleL', 'clavicleR',
  'upperArmL', 'lowerArmL', 'handL', 'fingersL', 'thumbL', 'twistL',
  'upperArmR', 'lowerArmR', 'handR', 'fingersR', 'thumbR', 'twistR',
]);

/** A critically-ish damped angular spring used for cloth and hair bones. */
class Spring {
  c!: any;
  k!: any;
  v!: number;
  x!: number;
  constructor(k = 90, c = 13) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  step(target: any, dt: any) {
    const a = this.k * (target - this.x) - this.c * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    if (!Number.isFinite(this.x)) { this.x = 0; this.v = 0; }
    return this.x;
  }
  kick(v: any) { this.v += v; }
}

export class Animator {
  lookTarget!: any;
  _gestureSeq!: number;
  _up!: THREE.Vector3;
  accel!: THREE.Vector3;
  action!: any;
  actionEnv!: any;
  actionMask!: any;
  blink!: number;
  blinkSeq!: number;
  blinkTimer!: number;
  blinkTimer0!: any;
  bobY!: number;
  bones!: any;
  char!: any;
  coat!: any;
  combatW!: number;
  eyePitch!: number;
  eyeYaw!: number;
  footYaw!: number[];
  g!: any;
  gesture!: any;
  gestureTimer!: number;
  gestureTimer0!: any;
  hipShift!: number;
  lean!: number;
  leanSpring!: Spring;
  lidClose!: number;
  look!: any;
  lookW!: number;
  p!: any;
  pelvisIK!: number;
  phase!: number;
  phase0!: any;
  plant!: number[];
  pose!: Map<any, any>;
  prevVel!: THREE.Vector3;
  rig!: any;
  speed!: number;
  stanceBias!: any;
  stanceDrop!: number;
  sway!: any;
  t!: number;
  t0!: any;
  tail!: any;
  turnSpring!: Spring;
  /**
   * @param character owning Character instance
   */
  constructor(character: any) {
    this.char = character;
    this.rig = character.rig;
    this.bones = this.rig.byName;
    this.phase = character.seedRnd ? character.seedRnd.next() : 0;
    this.t = character.seedRnd ? character.seedRnd.next() * 40 : 0;
    // kept so `rest()` can wind the clock back to exactly here
    this.phase0 = this.phase;
    this.t0 = this.t;
    this.g = { ...IDLE_G };
    this.pose = new Map();
    this.speed = 0;
    this.plant = [0, 0];
    this.pelvisIK = 0;
    this.lean = 0;
    this.leanSpring = new Spring(120, 16);
    this.turnSpring = new Spring(80, 12);
    this.sway = { x: new Spring(70, 11), z: new Spring(70, 11) };
    this.coat = { x: new Spring(110, 12), z: new Spring(110, 12) };
    this.tail = { x: new Spring(130, 13), z: new Spring(130, 13) };
    this.blinkTimer = 1 + (character.seedRnd ? character.seedRnd.next() * 3 : 1.5);
    this.blinkTimer0 = this.blinkTimer;
    this.blink = 0;
    // which leg carries the weight at rest; deterministic, per character
    this.stanceBias = (character.look && character.look.stance) ??
      (character.seedRnd ? character.seedRnd.next() * 1.4 - 0.7 : 0.4);
    /**
     * Structured posture (see `Posture.js`). Anyone without a named entry —
     * every NPC archetype — keeps their hand-authored `look.idle` bag at full
     * strength and takes their weight bias from the deterministic draw above,
     * so the four heroes gain a body without the townspeople losing theirs.
     */
    const key = postureKey(character);
    this.p = resolvePosture(key);
    if (!POSTURE[key as keyof typeof POSTURE]) {
      this.p.weight = THREE.MathUtils.clamp(this.stanceBias, -0.8, 0.8);
      this.p.biasW = 1;
    }
    this.hipShift = 0;
    /**
     * How far the pelvis sinks into a fighting stance, in rig units. Kept as
     * its own field rather than folded into `bobY` — see the note at the end
     * of `evalIdle` for what happened the last time an idle layer accumulated
     * into the pelvis height.
     */
    this.stanceDrop = 0;
    /** Damped 0..1 combat readiness, so the stance eases in instead of snapping. */
    this.combatW = 0;
    this.gesture = null;
    this._gestureSeq = 0;
    this.gestureTimer = 2 + (character.seedRnd ? character.seedRnd.next() * 6 : 3);
    this.gestureTimer0 = this.gestureTimer;
    this.action = null;
    this.lookTarget = null;
    this.lookW = 0;
    this.look = { yaw: 0, pitch: 0 };
    this.prevVel = new THREE.Vector3();
    this.accel = new THREE.Vector3();
    this.footYaw = [0, 0];
    this._up = new THREE.Vector3(0, 1, 0);
  }

  /**
   * Drop the animator back to a settled standing pose, deterministically.
   *
   * Every piece of state that *integrates* — the clock the posture drive reads,
   * the cloth and lean springs, the foot-IK dip, the blink and gesture timers,
   * the look-at blend — is restored to what it was at construction. A posed
   * capture applied after five other captures therefore renders the same frame
   * as one applied first; without this, `t` alone carries minutes of history
   * from shot to shot and no two runs of a corpus agree.
   */
  rest() {
    this.t = this.t0;
    this.phase = this.phase0;
    this.speed = 0;
    this.plant[0] = 0; this.plant[1] = 0;
    this.pelvisIK = 0;
    this.bobY = 0;
    this.hipShift = 0;
    this.stanceDrop = 0;
    this.footYaw[0] = 0; this.footYaw[1] = 0;
    this.combatW = 0;
    this.gesture = null;
    this._gestureSeq = 0;
    this.gestureTimer = this.gestureTimer0;
    this.blinkTimer = this.blinkTimer0;
    this.blinkSeq = 0;
    this.blink = 0;
    this.lidClose = 0;
    this.action = null;
    this.lookTarget = null;
    this.lookW = 0;
    this.look.yaw = 0; this.look.pitch = 0;
    this.eyeYaw = 0; this.eyePitch = 0;
    this.prevVel.set(0, 0, 0);
    this.accel.set(0, 0, 0);
    for (const s of [this.leanSpring, this.turnSpring, this.sway.x, this.sway.z,
      this.coat.x, this.coat.z, this.tail.x, this.tail.z]) { s.x = 0; s.v = 0; }
  }

  /** Start a keyframed action. @param name @param opts */
  play(name: string, opts: any = {}) {
    const def = ACTIONS[name as keyof typeof ACTIONS];
    if (!def) return;
    this.action = { def, name, t: 0, speed: opts.speed || 1, w: 0, hold: !!def.hold && opts.hold !== false };
  }

  stopAction() { if (this.action) this.action.hold = false; }

  /** Where the character should be looking, or null to release. */
  setLookTarget(v: any) { this.lookTarget = v; }

  // -- pose accumulation ---------------------------------------------------
  set(name: any, x: any, y: any, z: any) {
    let e = this.pose.get(name);
    if (!e) { e = [0, 0, 0]; this.pose.set(name, e); }
    e[0] = x; e[1] = y; e[2] = z;
  }

  add(name: any, x: any, y: any, z: any, w = 1) {
    let e = this.pose.get(name);
    if (!e) { e = [0, 0, 0]; this.pose.set(name, e); }
    e[0] += x * w; e[1] += y * w; e[2] += z * w;
  }

  /**
   * Advance and apply the whole animation stack.
   * @param st { speed, velocity, grounded, airTime, turnRate, terrain,
   *   wind, combat (0..1), weaponHand ('L'|'R') }
   */
  update(dt: number, st: any) {
    this.t += dt;
    const s = this.rig.dims.s;
    const speed = st.speed || 0;
    this.speed = speed;

    // --- gait parameters by speed ----------------------------------------
    const norm = speed / s;
    const moveW = clamp01((norm - 0.25) / 0.85);
    const g = this.g;
    if (norm < 2.2) blendG(WALK_G, JOG_G, clamp01((norm - 1.1) / 1.1), g);
    else blendG(JOG_G, SPRINT_G, clamp01((norm - 2.2) / 3.0), g);
    blendG(IDLE_G, g, moveW, g);

    const cycle = lerp(1.30, 2.85, clamp01((norm - 1.0) / 5.0)) * s;
    this.phase = (this.phase + (speed * dt) / Math.max(0.2, cycle)) % 1;
    if (moveW < 0.02) this.phase = (this.phase + dt * 0.12) % 1;

    // Every per-frame accumulator is cleared here, not inside the layer that
    // writes it. `bobY` used to be assigned by `evalGait`, which returns early
    // when the character is standing still — so the idle layer's `-=` had
    // nothing to reset it and integrated without bound (see `evalIdle`).
    this.pose.clear();
    this.hipShift = 0;
    this.bobY = 0;
    this.stanceDrop = 0;
    this.footYaw[0] = 0;
    this.footYaw[1] = 0;

    // Three weight bands. Contrapposto needs both feet planted and no fight on;
    // personality and breathing survive into a walk; the fighting stance fades
    // out again as the character breaks into a run.
    const restW = clamp01(1 - moveW * 1.35);
    this.combatW = THREE.MathUtils.damp(this.combatW, clamp01(st.combat || 0), 2.6, dt);

    this.evalGait(this.phase, g, moveW, st);
    this.evalIdle(this.t, moveW, restW);
    this.evalStance(this.t, restW, st);
    this.evalGesture(dt, moveW, st);
    this.evalAdditive(dt, st, moveW);
    this.evalAction(dt);

    this.apply(st);
    this.springs(dt, st);
    this.char.root.updateMatrixWorld(true);
    if (st.terrain) this.footIK(dt, st);
  }

  /** The parametric locomotion cycle. */
  evalGait(p: any, g: any, w: any, st: any) {
    if (w <= 0.001) return;
    const legs = ['L', 'R'];
    for (let i = 0; i < 2; i++) {
      const side = legs[i];
      const u = (p + (i === 0 ? 0 : 0.5)) % 1;
      const stance = g.stance;
      let thigh, knee, ankle, plant;
      if (u < stance) {
        const f = u / stance;
        const e = smooth(f);
        thigh = lerp(g.stride, -g.stride * 0.85, e);
        knee = 0.10 + 0.26 * Math.sin(Math.PI * f) * (0.4 + g.kneeSwing * 0.35);
        ankle = -0.22 * Math.sin(Math.PI * f) + 0.20 * smooth((f - 0.7) / 0.3);
        plant = f < 0.92 ? 1 : 1 - (f - 0.92) / 0.08;
      } else {
        const f = (u - stance) / (1 - stance);
        const e = smooth(f);
        thigh = lerp(-g.stride * 0.85, g.stride, e);
        knee = 0.12 + g.kneeSwing * Math.pow(Math.sin(Math.PI * Math.pow(f, 0.85)), 1.1);
        ankle = -0.28 + 0.36 * smooth(f);
        plant = f > 0.9 ? (f - 0.9) / 0.1 : 0;
      }
      this.plant[i] = plant * w;
      this.add(`thigh${side}`, -thigh, 0, (side === 'L' ? 1 : -1) * 0.03, w);
      this.add(`shin${side}`, knee, 0, 0, w);
      this.add(`foot${side}`, ankle * g.foot / 0.36, 0, 0, w);
      this.add(`toe${side}`, Math.max(0, -ankle) * 0.6, 0, 0, w);

      // arms swing opposite the same-side leg
      const other = i === 0 ? 1 : -1;
      const q = Math.sin((u + 0.5) * Math.PI * 2);
      const aSide = side === 'L' ? 'L' : 'R';
      this.add(`upperArm${aSide}`, q * g.arm, 0, 0, w);
      this.add(`lowerArm${aSide}`, -(g.elbow * (0.55 + 0.45 * Math.max(0, q))), 0, 0, w);
      this.add(`clavicle${aSide}`, q * g.arm * 0.10, 0, 0, w);
    }

    const q2 = Math.sin(p * Math.PI * 4);
    const q1 = Math.sin(p * Math.PI * 2);
    this.add('hips', -g.lean * 0.35, q1 * g.pelvisYaw, q1 * g.roll, w);
    this.add('spine01', g.lean * 0.30, -q1 * g.chestYaw * 0.35, -q1 * g.roll * 0.5, w);
    this.add('spine02', g.lean * 0.35, -q1 * g.chestYaw * 0.55, 0, w);
    this.add('spine03', g.lean * 0.30, -q1 * g.chestYaw, 0, w);
    this.add('neck', -g.lean * 0.55, q1 * g.chestYaw * 0.5, 0, w);
    this.add('head', -g.lean * 0.35 + q2 * 0.012, q1 * g.chestYaw * 0.25, 0, w);
    this.bobY += (Math.cos(p * Math.PI * 4) * 0.5 - 0.5) * g.bob * w;
  }

  /**
   * The standing body: contrapposto, breath, personality, arms and idle gaze.
   *
   * @param t seconds
   * @param moveW 0..1 locomotion blend
   * @param restW 0..1 how planted the feet are
   */
  evalIdle(t: number, moveW: number, restW: number) {
    const p = this.p;
    // Contrapposto cannot survive a walk — you cannot stand on one leg while
    // both feet are moving — but breathing and personality can.
    const fw = restW * (1 - this.combatW);
    const rw = (1 - moveW * 0.75) * (1 - 0.85 * this.combatW);
    if (fw <= 0.001 && rw <= 0.001) return;

    // ---- weight -----------------------------------------------------------
    // Two incommensurate slow sines so the crossover never finds a rhythm,
    // saturated by `hold()` so the weight is nearly always *on* a foot.
    const ph = t * p.shiftRate;
    const drive = Math.sin(ph * TAU) * 0.75 + Math.sin(ph * TAU * 0.517 + 1.3) * 0.25;
    const load = THREE.MathUtils.clamp(p.weight + p.shift * hold(drive), -1, 1) * fw;
    const onL = clamp01(load), onR = clamp01(-load);   // which leg carries
    const freeL = onR, freeR = onL;
    const lock = clamp01(Math.abs(load));

    // ---- the contrapposto chain -------------------------------------------
    // The weighted hip rides UP: the standing femur pushes that side of the
    // pelvis up while the free side drops. +Z raises the +X (left) side, so the
    // sign of the pelvic roll follows `load` directly. Getting this backwards
    // is invisible in the numbers and unmistakable in a screenshot.
    this.hipShift = load * 0.105 * this.rig.dims.s;
    this.add('hips', 0.012 * fw, load * 0.060, load * 0.155);
    // lumbar and thoracic counter-curve, over-cancelling the pelvis so the
    // shoulder line ends up tilted the other way
    this.add('spine01', -0.010 * fw, -load * 0.014, -load * 0.090);
    this.add('spine02', -0.006 * fw, -load * 0.014, -load * 0.060);
    this.add('spine03', 0.010 * fw, -load * 0.012, -load * 0.042);
    // Shoulder line. +Z raises the left clavicle and *lowers* the right, so the
    // same sign on both is a tilt, not a shrug — and the tilt has to oppose the
    // pelvis. The weighted hip is high, the shoulder above it is low.
    this.add('clavicleL', 0, 0, -load * 0.075);
    this.add('clavicleR', 0, 0, -load * 0.075);
    this.add('neck', 0, load * 0.014, load * 0.020);
    this.add('head', 0, 0, load * 0.030);

    // ---- legs -------------------------------------------------------------
    // Loaded leg near-locked and adducted under the mass; free leg broken at
    // the knee and drifting out. Stance width comes from the thigh abduction.
    // Femur abduction is *solved*, not authored. `hipShift` has just moved the
    // loaded hip joint ~10 cm outboard; adding a fixed abduction on top of that
    // puts the weighted foot further from the midline than the free one, which
    // reads as a wide neutral stance — the opposite of contrapposto. Instead,
    // pick where each ankle should land and ask what angle puts it there: the
    // loaded leg then leans *inward* under the displaced pelvis and the free
    // one swings out, which is the whole silhouette.
    const stW = p.stanceW;
    const legLen = this.rig.P.footL.distanceTo(this.rig.P.thighL);
    const hipX = Math.abs(this.rig.P.thighL.x);
    const hipDy = this.rig.P.thighL.y - this.rig.P.hips.y;
    // The femur is a child of the pelvis, so it inherits the pelvic roll — a
    // thigh authored at +0.09 under a pelvis rolled −0.09 is, in world space,
    // vertical. Solve in the root's frame and take the roll back out.
    const roll = (this.pose.get('hips') || [0, 0, 0])[2];
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const solveZ = (sgn: any, free: any) => {
      const bind = sgn * hipX;
      const joint = this.hipShift + bind * cr - hipDy * sr;
      const want = lerp(bind, sgn * (0.055 + free * 0.120) * stW * this.rig.dims.s, fw);
      const d = THREE.MathUtils.clamp((want - joint) / legLen, -0.55, 0.55);
      return (Math.asin(d) - roll) * fw;         // +Z swings the leg toward +X
    };
    this.add('thighL', -freeL * 0.18 + 0.02 * fw, 0, solveZ(1, freeL));
    this.add('thighR', -freeR * 0.18 + 0.02 * fw, 0, solveZ(-1, freeR));
    this.add('shinL', (0.05 + freeL * 0.40) * fw - lock * 0.035, 0, 0);
    this.add('shinR', (0.05 + freeR * 0.40) * fw - lock * 0.035, 0, 0);
    this.add('footL', -freeL * 0.24, 0, 0);
    this.add('footR', -freeR * 0.24, 0, 0);
    // Toe-out, with more splay on the unweighted foot. `footIK` re-aims the
    // ankle at the root's forward vector, so unless it is told about this the
    // solver erases every degree of it and the feet point dead ahead.
    this.footYaw[0] = p.toeOut * (0.75 + 0.55 * freeL) * fw;
    this.footYaw[1] = -p.toeOut * (0.75 + 0.55 * freeR) * fw;

    // ---- breath -----------------------------------------------------------
    // Chest-led: the ribcage extends and the shoulders ride on it, with only a
    // token counter at the pelvis. A uniform whole-body bob reads as a machine.
    const br = breathe(t + this.phase * 3.1, p.breathRate);
    const bd = p.breathDepth * rw;
    this.add('hips', 0.008 * br * bd, 0, 0);
    this.add('spine01', -0.006 * br * bd, 0, 0);
    this.add('spine02', -0.016 * br * bd, 0, 0);
    this.add('spine03', -0.022 * br * bd, 0, 0);
    this.add('clavicleL', -0.012 * br * bd, 0, 0.026 * br * bd);
    this.add('clavicleR', -0.012 * br * bd, 0, -0.026 * br * bd);
    this.add('neck', 0.012 * br * bd, 0, 0);

    // ---- personality: slouch vs open chest --------------------------------
    const sl = p.slouch * rw, ch = p.chest * rw;
    this.add('spine01', sl * 0.040 - ch * 0.052, 0, 0);
    this.add('spine02', sl * 0.105 - ch * 0.055, 0, 0);
    this.add('spine03', sl * 0.125 - ch * 0.065, 0, 0);
    this.add('neck', -sl * 0.075 + ch * 0.042, 0, 0);
    this.add('head', -sl * 0.050 + ch * 0.034, 0, 0);
    // resting shoulder drop, protracted forward when slouched and pulled back
    // and down when the chest is open
    this.add('clavicleL', -sl * 0.30 + ch * 0.20, -sl * 0.19 + ch * 0.11, -0.030 - sl * 0.060 + ch * 0.075);
    this.add('clavicleR', -sl * 0.30 + ch * 0.20, sl * 0.19 - ch * 0.11, 0.030 + sl * 0.060 - ch * 0.075);

    // ---- arms -------------------------------------------------------------
    // Nobody hangs both arms identically and nobody hangs them straight. The
    // hip that carries the weight juts out and pushes that arm clear of it.
    const asy = p.asym;
    const outL = 0.10 + p.armOut + asy * 0.090 + onL * 0.055;
    const outR = 0.10 + p.armOut - asy * 0.055 + onR * 0.055;
    const elbL = p.elbow * (1 + asy * 0.50);
    const elbR = p.elbow * (1 - asy * 0.40);
    const swayL = load * 0.035 + br * bd * 0.014;
    const swayR = load * 0.035 - br * bd * 0.010;
    this.add('upperArmL', (0.04 + sl * 0.12 + asy * 0.070 + swayL) * rw, p.armTwist * rw, outL * rw);
    this.add('upperArmR', (0.04 + sl * 0.12 - asy * 0.090 + swayR) * rw, -p.armTwist * 0.7 * rw, -outR * rw);
    this.add('lowerArmL', -elbL * rw, (0.10 + p.armTwist) * rw, 0.05 * rw);
    this.add('lowerArmR', -elbR * rw, (-0.10 - p.armTwist * 1.6) * rw, -0.05 * rw);
    this.add('handL', 0.05 * rw, 0, 0.12 * rw);
    this.add('handR', 0.05 * rw, 0, -0.12 * rw);
    // Positive X curls the fingers toward the palm — `front` in the hand
    // builder is +Z and the fingertips are modelled bending back through it.
    // This was −0.24, which opened every hand into a flat paddle and meant no
    // character in the game ever closed a fist around a grip.
    this.add('fingersL', 0.26 * rw, 0, 0);
    this.add('fingersR', 0.26 * rw, 0, 0);

    // ---- gaze -------------------------------------------------------------
    // Held turns, not a sine: eyes and head move in saccades and then stay.
    // The sub-degree drift on top keeps the head alive between them.
    const hy = hold(Math.sin(t * p.headRate * TAU) * 1.3 + Math.sin(t * p.headRate * TAU * 0.43 + 1.9) * 0.55);
    const dr = Math.sin(t * 0.53 + this.phase * 5.1) * 0.008 + Math.sin(t * 0.29 + 1.1) * 0.006;
    this.add('neck', p.headDown * 0.35 * rw, hy * p.headAmp * 0.35 * rw, p.headTilt * 0.30 * rw);
    this.add('head', (p.headDown * 0.65 + dr) * rw, (hy * p.headAmp * 0.65 + dr * 0.8) * rw,
      (p.headTilt * 0.70 + dr * 0.5) * rw);

    // ---- fidget -----------------------------------------------------------
    const fg = p.fidget * rw;
    const f1 = Math.sin(t * 0.83 + this.phase * 6.1);
    const f2 = Math.sin(t * 1.27 + this.phase * 2.3);
    this.add('hips', f2 * 0.004 * fg, f1 * 0.006 * fg, f1 * 0.005 * fg);
    this.add('spine02', -f2 * 0.005 * fg, -f1 * 0.005 * fg, -f1 * 0.004 * fg);

    // ---- legacy per-character flavour -------------------------------------
    // `look.idle` predates this layer and was authored against a flat pose, so
    // the heroes take it at a fraction (`biasW`) while NPCs, who have nothing
    // else, keep all of it.
    const bias = this.char.look && this.char.look.idle;
    if (bias) {
      const bw = p.biasW * rw;
      for (const n in bias) this.add(n, bias[n][0], bias[n][1], bias[n][2], bw);
    }

    // Bounded, and reset each frame in `update`. This layer used `-=` against a
    // `bobY` that `evalGait` only assigns while moving, so standing still
    // integrated about -0.0013 m per frame with no bound. Over a long session
    // the party sank into the ground — measured hips-bone local Y going +0.844
    // at boot to -9.667 after 139 shots, monotonic, while their root stayed
    // exactly on `Terrain.heightAt`. It read as the terrain rising and cost
    // three separate investigations before it was traced here.
    this.bobY += (-0.006 + br * 0.004) * rw;
  }

  /**
   * The fighting body.
   *
   * A stance is not an idle with a weapon in it: the pelvis blades away from
   * the target so the lead shoulder points at it, the shoulders counter-rotate
   * back, the weight drops between two widely separated feet, and none of it
   * ever stops moving. Everything here is scaled by `restW` so breaking into a
   * run still runs.
   *
   * @param t @param restW @param st
   */
  evalStance(t: number, restW: number, st: any) {
    const w = this.combatW * restW;
    if (w <= 0.002) return;
    const p = this.p;
    const lead = p.lead;                 // +1 = left foot leads
    const g = p.guard;

    // ---- torso: bladed, pitched forward, chin still on the target ----------
    this.add('hips', 0.04, -0.30 * lead, 0.02 * lead, w);
    this.add('spine01', 0.045, 0.045 * lead, 0, w);
    this.add('spine02', 0.045, 0.050 * lead, 0, w);
    this.add('spine03', 0.040, 0.045 * lead, 0, w);
    this.add('neck', -0.060, -0.060 * lead, 0, w);
    this.add('head', -0.090, -0.100 * lead, 0, w);

    // ---- base --------------------------------------------------------------
    const L = lead > 0 ? 'L' : 'R';
    const T = lead > 0 ? 'R' : 'L';
    const ls = lead > 0 ? 1 : -1;
    this.add(`thigh${L}`, -0.30, -0.10 * lead, ls * 0.10 * g, w);
    this.add(`shin${L}`, 0.42, 0, 0, w);
    this.add(`foot${L}`, -0.12, 0, 0, w);
    this.add(`thigh${T}`, 0.10, -0.10 * lead, -ls * 0.16 * g, w);
    this.add(`shin${T}`, 0.36, 0, 0, w);
    this.add(`foot${T}`, -0.16, 0, 0, w);
    // the trail foot turns out hard — that is what makes a stance a stance
    const iL = lead > 0 ? 0 : 1, iT = lead > 0 ? 1 : 0;
    const sL = iL === 0 ? 1 : -1, sT = iT === 0 ? 1 : -1;
    this.footYaw[iL] = lerp(this.footYaw[iL], sL * 0.18, w);
    this.footYaw[iT] = lerp(this.footYaw[iT], sT * 0.62, w);

    // ---- arms: weapon hand in tight, off hand out as a counterweight -------
    const H = st.weaponHand === 'L' ? 'L' : 'R';
    const O = H === 'R' ? 'L' : 'R';
    const hm = H === 'L' ? 1 : -1;
    const om = -hm;
    this.add(`clavicle${H}`, -0.10, 0, hm * 0.06, w);
    this.add(`upperArm${H}`, -0.26, hm * 0.22, hm * 0.16, w);
    this.add(`lowerArm${H}`, -0.95, hm * 0.20, 0, w);
    this.add(`hand${H}`, 0.10, 0, hm * 0.10, w);
    this.add(`fingers${H}`, 0.35, 0, 0, w);
    this.add(`clavicle${O}`, -0.04, 0, om * 0.05, w);
    this.add(`upperArm${O}`, 0.16, om * 0.10, om * 0.42, w);
    this.add(`lowerArm${O}`, -0.55, om * 0.14, 0, w);
    this.add(`fingers${O}`, 0.30, 0, 0, w);

    // ---- never static ------------------------------------------------------
    const rock = Math.sin(t * 3.45 + this.phase * TAU);
    const bounce = Math.sin(t * 6.90 + this.phase * TAU);
    this.add('hips', 0, rock * 0.030, rock * 0.022, w);
    this.add('spine02', bounce * 0.010, -rock * 0.022, -rock * 0.015, w);
    this.add('spine03', bounce * 0.012, -rock * 0.018, 0, w);
    this.add('head', -bounce * 0.010, rock * 0.030, 0, w);
    // combat breathing is faster and shallower than rest
    const cbr = breathe(t, 0.55);
    this.add('spine02', -0.014 * cbr, 0, 0, w);
    this.add('spine03', -0.018 * cbr, 0, 0, w);
    this.add('clavicleL', 0, 0, 0.020 * cbr, w);
    this.add('clavicleR', 0, 0, -0.020 * cbr, w);

    this.bobY += (bounce * 0.004 - 0.004) * w;
    // Its own field, combined in `apply` and `footIK`. Emphatically not
    // `bobY -= ...`: that is the exact pattern that sank the party ten metres.
    this.stanceDrop += 0.075 * g * w;
  }

  /**
   * Idle gestures — additive one-shot beats on a deterministic timer.
   *
   * Additive rather than an `ACTIONS` entry because an action's empty keyframe
   * means *identity*, so entering one would snap a relaxed arm dead straight on
   * the frame the gesture began. Always on the off hand: companion weapons are
   * socketed rigidly to `handR`, so a gesture on that arm swings a greatsword.
   *
   * @param dt @param moveW @param st
   */
  evalGesture(dt: number, moveW: number, st: any) {
    const list = this.p.gestures;
    if (!list || !list.length) return;
    const busy = moveW > 0.12 || this.combatW > 0.15 || !!this.action;

    if (!this.gesture) {
      if (busy) return;
      this.gestureTimer -= dt;
      if (this.gestureTimer > 0) return;
      this._gestureSeq++;
      const def = GESTURES[list[this._gestureSeq % list.length] as keyof typeof GESTURES];
      if (!def) return;
      this.gesture = { def, t: 0 };
      // deterministic spacing — two runs of the capture harness must match
      const [lo, hi] = this.p.gestureGap;
      const r = Math.sin(this._gestureSeq * 43.7 + this.stanceBias * 11.3) * 0.5 + 0.5;
      this.gestureTimer = lo + (hi - lo) * r;
    }

    const gs = this.gesture;
    gs.t += dt;
    const d = gs.def;
    if (gs.t >= d.dur) { this.gesture = null; return; }
    const env = bell(gs.t / d.dur, d.hold ?? 0.35) * (1 - clamp01(moveW * 2)) * (1 - this.combatW);
    if (env <= 0.001) return;

    const O = st.weaponHand === 'L' ? 'R' : 'L';
    const sg = O === 'L' ? 1 : -1;
    if (d.clav) this.add(`clavicle${O}`, d.clav[0], d.clav[1] * sg, d.clav[2] * sg, env);
    if (d.arm) this.add(`upperArm${O}`, d.arm[0], d.arm[1] * sg, d.arm[2] * sg, env);
    if (d.elbow) this.add(`lowerArm${O}`, -d.elbow, 0, 0, env);
    if (d.wrist) this.add(`hand${O}`, d.wrist[0], d.wrist[1] * sg, d.wrist[2] * sg, env);
    if (d.fingers) this.add(`fingers${O}`, d.fingers, 0, 0, env);
    if (d.spine) this.add('spine03', d.spine[0], d.spine[1] * sg, d.spine[2] * sg, env);
    if (d.neck) this.add('neck', d.neck[0], d.neck[1] * sg, d.neck[2] * sg, env);
    if (d.head) this.add('head', d.head[0], d.head[1] * sg, d.head[2] * sg, env);
  }

  /** Look-at, blink, lean and sway layers. */
  evalAdditive(dt: any, st: any, moveW: any) {
    // ---- look-at
    const head = this.bones.head;
    let yaw = 0, pitch = 0, want = 0;
    if (this.lookTarget) {
      this.char.root.updateMatrixWorld(true);
      _v.copy(this.lookTarget);
      this.char.root.worldToLocal(_v);
      _v.y -= this.rig.dims.headOrigin.y;
      const d = Math.hypot(_v.x, _v.z);
      yaw = Math.atan2(_v.x, _v.z);
      pitch = -Math.atan2(_v.y, d);
      if (Math.abs(yaw) < 1.5) want = 1;
      yaw = THREE.MathUtils.clamp(yaw, -1.0, 1.0);
      pitch = THREE.MathUtils.clamp(pitch, -0.5, 0.45);
    }
    this.lookW = THREE.MathUtils.damp(this.lookW, want, 4, dt);
    this.look.yaw = THREE.MathUtils.damp(this.look.yaw, yaw, 6, dt);
    this.look.pitch = THREE.MathUtils.damp(this.look.pitch, pitch, 6, dt);
    const lw = this.lookW;
    if (lw > 0.002) {
      this.add('spine03', 0, this.look.yaw * 0.14 * lw, 0);
      this.add('neck', this.look.pitch * 0.35 * lw, this.look.yaw * 0.32 * lw, 0);
      this.add('head', this.look.pitch * 0.60 * lw, this.look.yaw * 0.52 * lw, 0);
    }
    this.eyeYaw = this.look.yaw * 0.30 * lw;
    this.eyePitch = this.look.pitch * 0.35 * lw;

    // ---- blink
    // deterministic blink spacing — two runs of the capture harness must match
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkSeq = (this.blinkSeq || 0) + 1;
      this.blinkTimer = 2.4 + (Math.sin(this.blinkSeq * 12.9898 + this.stanceBias * 7.3) * 0.5 + 0.5) * 3.6;
      this.blink = 1;
    }
    if (this.blink > 0) this.blink = Math.max(0, this.blink - dt / 0.075);
    const lid = (1 - Math.abs(this.blink * 2 - 1)) * (this.blink > 0 ? 1 : 0);
    this.lidClose = lid;

    // ---- turn lean and lateral sway
    const turn = THREE.MathUtils.clamp(st.turnRate || 0, -3, 3);
    const tl = this.turnSpring.step(turn * 0.06 * clamp01(this.speed), dt);
    this.add('hips', 0, 0, -tl);
    this.add('spine02', 0, tl * 0.4, -tl * 0.5);
    this.add('head', 0, tl * 0.3, tl * 0.6);
  }

  /** Keyframed action layer. */
  evalAction(dt: any) {
    const a = this.action;
    if (!a) return;
    a.t += dt * a.speed;
    const def = a.def;
    const dur = def.dur;
    if (a.t >= dur && !a.hold) { this.action = null; return; }
    const t = a.hold ? Math.min(a.t, dur) : a.t;
    const keys = def.keys;
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1].t < t) i++;
    const k0 = keys[i], k1 = keys[Math.min(keys.length - 1, i + 1)];
    const f = k1.t > k0.t ? smooth((t - k0.t) / (k1.t - k0.t)) : 0;
    const names = new Set([...Object.keys(k0.pose), ...Object.keys(k1.pose)]);
    // blend out at the ends so actions never pop
    const env = a.hold ? clamp01(a.t / 0.18) : Math.min(clamp01(a.t / 0.10), clamp01((dur - a.t) / 0.16));
    this.actionMask = def.mask;
    this.actionEnv = env;
    for (const n of names) {
      const p0 = k0.pose[n] || [0, 0, 0];
      const p1 = k1.pose[n] || [0, 0, 0];
      const cur = this.pose.get(n) || [0, 0, 0];
      const tx = lerp(p0[0], p1[0], f), ty = lerp(p0[1], p1[1], f), tz = lerp(p0[2], p1[2], f);
      // actions override the base pose rather than adding to it
      this.set(n, lerp(cur[0], tx, env), lerp(cur[1], ty, env), lerp(cur[2], tz, env));
    }
  }

  /** Write the accumulated pose onto the skeleton. */
  apply(st: any) {
    const bones = this.rig.byName;
    const P = this.rig.P;
    for (const name in bones) {
      const b = bones[name];
      const e = this.pose.get(name);
      if (e) {
        _e.set(e[0], e[1], e[2], 'YXZ');
        b.quaternion.setFromEuler(_e);
      } else if (name !== 'tail' && name !== 'coatL' && name !== 'coatR' && name !== 'coatF'
        && name !== 'lidL' && name !== 'lidR') {
        b.quaternion.identity();
      }
    }
    // pelvis: gait bob, the fighting stance's sink, and the IK dip
    const hips = bones.hips;
    const s = this.rig.dims.s;
    hips.position.y = P.hips.y + ((this.bobY || 0) - (this.stanceDrop || 0)) * s + this.pelvisIK;
    hips.position.x = P.hips.x + (this.hipShift || 0);

    // eyelids
    const lid = this.lidClose || 0;
    bones.lidL.quaternion.setFromEuler(_e.set(lid * 1.15, 0, 0, 'YXZ'));
    bones.lidR.quaternion.setFromEuler(_e.set(lid * 1.15, 0, 0, 'YXZ'));

    // Eye gaze. The small constant downward bias is not a mistake: the lid
    // aperture opens slightly below the globe's equator (as a real one does),
    // so a mathematically level gaze parks the iris high and the character
    // reads as permanently startled.
    if (this.char.eyes) {
      this.char.eyes.rotation.set((this.eyePitch || 0) + 0.11, this.eyeYaw || 0, 0);
    }
  }

  /** Coat tails and long hair — angular springs driven by motion and wind. */
  springs(dt: any, st: any) {
    const vel = st.velocity || _v.set(0, 0, 0);
    const yawInv = -(this.char.root.rotation.y);
    const cos = Math.cos(yawInv), sin = Math.sin(yawInv);
    const lx = vel.x * cos - vel.z * sin;      // local-space velocity
    const lz = vel.x * sin + vel.z * cos;
    const wind = st.wind || 0;
    const s = this.rig.dims.s;

    const tgtX = THREE.MathUtils.clamp(-lz * 0.10 - wind * 0.05, -0.7, 0.7);
    const tgtZ = THREE.MathUtils.clamp(lx * 0.09, -0.5, 0.5);
    const cx = this.coat.x.step(tgtX, dt);
    const cz = this.coat.z.step(tgtZ, dt);
    const bob = Math.sin(this.phase * Math.PI * 4) * 0.05 * clamp01(this.speed / s);
    for (const [n, sgn] of [['coatL', 1], ['coatR', -1], ['coatF', 0]]) {
      const b = this.rig.byName[n];
      if (!b) continue;
      _e.set(cx + bob * (0.6 + 0.4 * sgn), 0, cz + sgn * 0.05 * cx, 'YXZ');
      b.quaternion.setFromEuler(_e);
    }
    const tx = this.tail.x.step(THREE.MathUtils.clamp(-lz * 0.13 - wind * 0.06, -0.8, 0.8) + bob * 0.6, dt);
    const tz = this.tail.z.step(THREE.MathUtils.clamp(lx * 0.11, -0.6, 0.6), dt);
    const tb = this.rig.byName.tail;
    if (tb) tb.quaternion.setFromEuler(_e.set(tx, 0, tz, 'YXZ'));
  }

  /**
   * Two-bone foot IK against the terrain: plants the feet, orients the ankles
   * to the slope and dips the pelvis when a foot needs to reach below the
   * animated pose.
   */
  footIK(dt: any, st: any) {
    const terrain = st.terrain;
    const rig = this.rig;
    const root = this.char.root;
    const s = rig.dims.s;
    // Ankle bone height above the sole, taken from the bind pose rather than
    // guessed. It was `0.028 * s` — about a third of the real 8.7 cm — so `gy`
    // sat 6 cm below where an ankle standing on the ground belongs, `need` came
    // out zero for anything short of a 6 cm sink, and the whole solver was
    // effectively inert: feet never tracked a slope and a crouch buried the
    // lead boot in the dirt instead of planting it.
    const ankleH = rig.P.footL.y;
    const bones = rig.byName;
    const need = [0, 0];
    const targets = [];

    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 'L' : 'R';
      const foot = bones[`foot${side}`];
      foot.getWorldPosition(_v);
      const gy = terrain.heightAt(_v.x, _v.z) + ankleH;
      const plant = clamp01(this.plant[i] + (1 - clamp01(this.speed / (0.35 * s))));
      let ty = lerp(_v.y, Math.max(_v.y, gy), plant);
      if (ty < gy) ty = gy;
      need[i] = ty - _v.y;
      targets.push({ side, world: _v.clone(), ty, plant, gy });
    }

    // if a foot needs to drop below the animation, lower the pelvis instead of
    // hyper-extending the leg
    const dip = Math.min(0, Math.min(need[0], need[1]));
    const rise = Math.min(need[0], need[1]);
    const wantPelvis = (rise > 0 ? rise * 0.55 : dip * 0.9);
    this.pelvisIK = THREE.MathUtils.damp(this.pelvisIK, wantPelvis, 9, dt);
    bones.hips.position.y = rig.P.hips.y + ((this.bobY || 0) - (this.stanceDrop || 0)) * s + this.pelvisIK;
    root.updateMatrixWorld(true);

    for (let i = 0; i < 2; i++) {
      const t = targets[i];
      const side = t.side;
      const thigh = bones[`thigh${side}`];
      const shin = bones[`shin${side}`];
      const foot = bones[`foot${side}`];
      foot.getWorldPosition(_v3);
      const target = _v3.clone();
      target.y = Math.max(t.ty, terrain.heightAt(target.x, target.z) + ankleH * 0.6);

      const L1 = rig.P[`shin${side}`].distanceTo(rig.P[`thigh${side}`]);
      const L2 = rig.P[`foot${side}`].distanceTo(rig.P[`shin${side}`]);
      thigh.getWorldPosition(_v);
      const hip = _v.clone();
      const toT = target.clone().sub(hip);
      let d = toT.length();
      const maxD = (L1 + L2) * 0.995, minD = Math.abs(L1 - L2) + 0.02 * s;
      if (d > maxD) { toT.multiplyScalar(maxD / d); d = maxD; }
      if (d < minD) { toT.multiplyScalar(minD / Math.max(1e-5, d)); d = minD; }
      const kneeTarget = hip.clone().add(toT);

      // Knee pole: forward in world space, yawed onto the toe direction. The
      // patella tracks over the second toe, so a foot turned out has to take
      // its knee with it — a splayed stance solved with both knees pointing
      // dead ahead is the reason the legs read as two parallel columns.
      _v2.set(0, 0, 1).applyQuaternion(root.getWorldQuaternion(_q)).normalize();
      const fyaw = this.footYaw[i] || 0;
      if (fyaw) _v2.applyAxisAngle(this._up, fyaw).normalize();
      const axis = toT.clone().normalize();
      const pole = _v2.clone().addScaledVector(axis, -_v2.dot(axis));
      if (pole.lengthSq() < 1e-6) pole.set(1, 0, 0);
      pole.normalize();

      const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      const knee = hip.clone().addScaledVector(axis, a).addScaledVector(pole, h);

      aimBone(thigh, rig.P[`thigh${side}`], rig.P[`shin${side}`], knee, pole);
      thigh.updateMatrixWorld(true);
      aimBone(shin, rig.P[`shin${side}`], rig.P[`foot${side}`], kneeTarget, pole);
      shin.updateMatrixWorld(true);

      // ankle orientation follows the ground plane while planted
      if (t.plant > 0.01 && terrain.normalAt) {
        foot.getWorldPosition(_v);
        const n = terrain.normalAt(_v.x, _v.z, _v2.clone());
        const parentQ = shin.getWorldQuaternion(_q2).clone();
        const bindDir = rig.P[`toe${side}`].clone().sub(rig.P[`foot${side}`]).normalize();
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(_q));
        const toe = fwd.clone().addScaledVector(n, -fwd.dot(n)).normalize();
        // Honour the pose's toe-out. Without this the solver aims every ankle
        // straight down the root forward vector, which silently erases the
        // splay the idle and stance layers just asked for and is why all four
        // characters stood with their feet exactly parallel.
        const fy = this.footYaw[i] || 0;
        if (fy) toe.applyAxisAngle(n, fy).normalize();
        const want = toe.clone().multiplyScalar(0.86).addScaledVector(n, 0.5).normalize();
        const cur = bindDir.clone().applyQuaternion(parentQ).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(cur, cur.clone().lerp(want, t.plant * 0.85).normalize());
        foot.quaternion.premultiply(new THREE.Quaternion().copy(parentQ).invert().multiply(q).multiply(parentQ));
        foot.updateMatrixWorld(true);
      }
    }
  }
}

/**
 * Rotate `bone` so the segment toward its child points at `target`, keeping the
 * given pole direction as the joint's forward reference.
 */
function aimBone(bone: any, bindFrom: any, bindTo: any, target: any, pole: any) {
  bone.parent.updateMatrixWorld();
  const parentQ = bone.parent.getWorldQuaternion(_q).clone();
  const worldPos = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
  const bindDir = bindTo.clone().sub(bindFrom).normalize();
  const want = target.clone().sub(worldPos);
  if (want.lengthSq() < 1e-9) return;
  want.normalize();

  basis(_m1, bindDir, new THREE.Vector3(0, 0, 1));
  basis(_m2, want, pole);
  const qBind = new THREE.Quaternion().setFromRotationMatrix(_m1);
  const qWant = new THREE.Quaternion().setFromRotationMatrix(_m2);
  const world = qWant.multiply(qBind.invert());
  bone.quaternion.copy(parentQ).invert().multiply(world);
}

function basis(m: any, z: any, up: any) {
  _v.copy(z).normalize();
  _v2.copy(up).addScaledVector(_v, -up.dot(_v));
  if (_v2.lengthSq() < 1e-8) _v2.set(_v.y, -_v.x, 0);
  _v2.normalize();
  const x = new THREE.Vector3().crossVectors(_v2, _v).normalize();
  m.makeBasis(x, _v2, _v);
  return m;
}
