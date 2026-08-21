import * as THREE from 'three';
import { clamp01, smooth, lerp } from './Geo.js';

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

function blendG(a, b, t, out) {
  for (const k in a) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
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
  constructor(k = 90, c = 13) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  step(target, dt) {
    const a = this.k * (target - this.x) - this.c * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    if (!Number.isFinite(this.x)) { this.x = 0; this.v = 0; }
    return this.x;
  }
  kick(v) { this.v += v; }
}

export class Animator {
  /**
   * @param {Object} character owning Character instance
   */
  constructor(character) {
    this.char = character;
    this.rig = character.rig;
    this.bones = this.rig.byName;
    this.phase = character.seedRnd ? character.seedRnd.next() : 0;
    this.t = character.seedRnd ? character.seedRnd.next() * 40 : 0;
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
    this.blink = 0;
    // which leg carries the weight at rest; deterministic, per character
    this.stanceBias = (character.look && character.look.stance) ??
      (character.seedRnd ? character.seedRnd.next() * 1.4 - 0.7 : 0.4);
    this.hipShift = 0;
    this.action = null;
    this.lookTarget = null;
    this.lookW = 0;
    this.look = { yaw: 0, pitch: 0 };
    this.prevVel = new THREE.Vector3();
    this.accel = new THREE.Vector3();
    this.footYaw = [0, 0];
    this._up = new THREE.Vector3(0, 1, 0);
  }

  /** Start a keyframed action. @param {string} name @param {Object} opts */
  play(name, opts = {}) {
    const def = ACTIONS[name];
    if (!def) return;
    this.action = { def, name, t: 0, speed: opts.speed || 1, w: 0, hold: !!def.hold && opts.hold !== false };
  }

  stopAction() { if (this.action) this.action.hold = false; }

  /** Where the character should be looking, or null to release. */
  setLookTarget(v) { this.lookTarget = v; }

  // -- pose accumulation ---------------------------------------------------
  set(name, x, y, z) {
    let e = this.pose.get(name);
    if (!e) { e = [0, 0, 0]; this.pose.set(name, e); }
    e[0] = x; e[1] = y; e[2] = z;
  }

  add(name, x, y, z, w = 1) {
    let e = this.pose.get(name);
    if (!e) { e = [0, 0, 0]; this.pose.set(name, e); }
    e[0] += x * w; e[1] += y * w; e[2] += z * w;
  }

  /**
   * Advance and apply the whole animation stack.
   * @param {number} dt
   * @param {Object} st { speed, velocity, grounded, airTime, turnRate, terrain, wind }
   */
  update(dt, st) {
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

    this.pose.clear();
    this.hipShift = 0;
    this.evalGait(this.phase, g, moveW, st);
    this.evalIdle(this.t, 1 - moveW * 0.75);
    this.evalAdditive(dt, st, moveW);
    this.evalAction(dt);

    this.apply(st);
    this.springs(dt, st);
    this.char.root.updateMatrixWorld(true);
    if (st.terrain) this.footIK(dt, st);
  }

  /** The parametric locomotion cycle. */
  evalGait(p, g, w, st) {
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
    this.bobY = (Math.cos(p * Math.PI * 4) * 0.5 - 0.5) * g.bob * w;
  }

  /** Idle: breathing, weight shift, relaxed arms. */
  evalIdle(t, w) {
    if (w <= 0.001) return;
    const br = Math.sin(t * 1.35) * 0.5 + Math.sin(t * 0.61 + 1.2) * 0.5;
    const shift = Math.sin(t * 0.42);
    const shift2 = Math.sin(t * 0.27 + 0.8);
    // Contrapposto. A standing person never splits their weight: one leg locks
    // and carries, that hip rides up and outward, the spine counter-curves and
    // the opposite shoulder drops. Without it four people stand like four shop
    // dummies no matter how good the gait is.
    const load = this.stanceBias + 0.55 * shift;      // >0 weight on the left leg
    const lock = clamp01(Math.abs(load));
    this.hipShift = load * 0.030 * this.rig.dims.s * w;
    this.add('hips', 0.015, shift * 0.045, shift * 0.030 - load * 0.085, w);
    this.add('spine01', -0.012 + br * 0.010, -shift * 0.02, -shift * 0.012 + load * 0.048, w);
    this.add('spine02', -0.010 + br * 0.014, -shift * 0.02, load * 0.030, w);
    this.add('spine03', 0.014 + br * 0.016, -shift2 * 0.03, load * 0.022, w);
    this.add('clavicleL', 0, 0, load * 0.05, w);
    this.add('clavicleR', 0, 0, load * 0.05, w);
    this.add('neck', -0.02 - br * 0.012, shift2 * 0.05, 0, w);
    this.add('head', 0.01 + Math.sin(t * 0.9) * 0.012, Math.sin(t * 0.33) * 0.06, Math.sin(t * 0.5) * 0.012, w);
    this.add('clavicleL', -br * 0.02, 0, -0.03, w);
    this.add('clavicleR', -br * 0.02, 0, 0.03, w);
    this.add('upperArmL', 0.03, 0.05, 0.055 + shift * 0.012, w);
    this.add('upperArmR', 0.03, -0.05, -0.055 - shift * 0.012, w);
    this.add('lowerArmL', -0.30, 0.12, 0.05, w);
    this.add('lowerArmR', -0.30, -0.12, -0.05, w);
    this.add('handL', 0.05, 0, 0.12, w);
    this.add('handR', 0.05, 0, -0.12, w);
    this.add('fingersL', -0.24, 0, 0, w);
    this.add('fingersR', -0.24, 0, 0, w);
    // per-character idle flavour: posture bias that keeps the four from
    // standing like identical mannequins
    const bias = this.char.look && this.char.look.idle;
    if (bias) for (const n in bias) this.add(n, bias[n][0], bias[n][1], bias[n][2], w);
    // the loaded leg straightens, the free leg bends and drifts out
    const freeL = clamp01(-load), freeR = clamp01(load);
    this.add('thighL', 0.02 + freeL * 0.10, 0, 0.02 + shift * 0.02 + freeL * 0.05, w);
    this.add('thighR', -0.02 + freeR * 0.10, 0, -0.02 + shift * 0.02 - freeR * 0.05, w);
    this.add('shinL', 0.04 + freeL * 0.22 - lock * 0.02, 0, 0, w);
    this.add('shinR', 0.04 + freeR * 0.22 - lock * 0.02, 0, 0, w);
    this.add('footL', -freeL * 0.10, 0, 0, w);
    this.add('footR', -freeR * 0.10, 0, 0, w);
    // Assign, never accumulate. The gait path (see the walk cycle above) sets
    // `bobY` outright; this idle layer used `-=`, so standing still integrated
    // about -0.0013 m per frame with no bound. Over a long session the party
    // sank into the ground — measured hips-bone local Y going +0.844 at boot to
    // -9.667 after 139 shots, monotonic, while their root stayed exactly on
    // `Terrain.heightAt`. It read as the terrain rising and cost three separate
    // investigations before it was traced here.
    this.bobY = -0.004 * w * (0.5 + 0.5 * br);
  }

  /** Look-at, blink, lean and sway layers. */
  evalAdditive(dt, st, moveW) {
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
  evalAction(dt) {
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
  apply(st) {
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
    // pelvis height: gait bob + IK dip
    const hips = bones.hips;
    hips.position.y = P.hips.y + (this.bobY || 0) * this.rig.dims.s + this.pelvisIK;
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
  springs(dt, st) {
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
  footIK(dt, st) {
    const terrain = st.terrain;
    const rig = this.rig;
    const root = this.char.root;
    const s = rig.dims.s;
    const ankleH = 0.028 * s;      // ankle bone height above the sole
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
    bones.hips.position.y = rig.P.hips.y + (this.bobY || 0) * s + this.pelvisIK;
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

      // knee pole: forward in world space, biased outward
      _v2.set(0, 0, 1).applyQuaternion(root.getWorldQuaternion(_q)).normalize();
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
function aimBone(bone, bindFrom, bindTo, target, pole) {
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

function basis(m, z, up) {
  _v.copy(z).normalize();
  _v2.copy(up).addScaledVector(_v, -up.dot(_v));
  if (_v2.lengthSq() < 1e-8) _v2.set(_v.y, -_v.x, 0);
  _v2.normalize();
  const x = new THREE.Vector3().crossVectors(_v2, _v).normalize();
  m.makeBasis(x, _v2, _v);
  return m;
}
