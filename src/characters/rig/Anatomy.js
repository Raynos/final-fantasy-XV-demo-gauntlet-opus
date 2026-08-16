import * as THREE from 'three';
import { crScalar, weightsAt, clamp01, abump, bump, smoothIn } from './Geo.js';

/**
 * The single source of truth for a character's body sweeps.
 *
 * Both the skin (Body.js) and every garment (Outfit.js) are generated from
 * these node lists, so a jacket is guaranteed to sit *outside* the torso it
 * covers and to carry compatible skin weights — clothing deforms with the body
 * instead of shearing through it.
 */

/** Torso sweep: pelvis -> shoulder line. */
export function torsoNodes(rig) {
  const { index: I, dims } = rig;
  const s = dims.s;
  const m = rig.profile.muscle;
  const y = (v) => v * s;
  const chestW = (0.163 + 0.030 * m) * s * rig.profile.shoulder;
  const chestD = (0.118 + 0.020 * m) * s;
  const waistW = (0.132 + 0.020 * m) * s;
  const waistD = (0.100 + 0.014 * m) * s;
  const hipW = (0.150 + 0.012 * m) * s * rig.profile.hip;
  const hipD = (0.122 + 0.010 * m) * s;
  return [
    { p: [0, y(0.795), 0.004 * s], rx: hipW * 0.86, rz: hipD * 0.86, w: [[I.hips, 1]] },
    { p: [0, y(0.875), 0.002 * s], rx: hipW, rz: hipD, w: [[I.hips, 1]] },
    { p: [0, y(0.965), 0.004 * s], rx: hipW * 0.96, rz: hipD * 0.95, w: [[I.hips, 0.86], [I.spine01, 0.14]] },
    { p: [0, y(1.055), 0.008 * s], rx: waistW, rz: waistD, w: [[I.hips, 0.34], [I.spine01, 0.66]] },
    { p: [0, y(1.145), 0.012 * s], rx: waistW * 1.03, rz: waistD, w: [[I.spine01, 0.55], [I.spine02, 0.45]] },
    { p: [0, y(1.245), 0.010 * s], rx: chestW * 0.92, rz: chestD * 0.95, w: [[I.spine02, 0.72], [I.spine03, 0.28]] },
    { p: [0, y(1.335), 0.004 * s], rx: chestW, rz: chestD, w: [[I.spine02, 0.18], [I.spine03, 0.82]] },
    { p: [0, y(1.415), -0.006 * s], rx: chestW * 0.90, rz: chestD * 0.88, w: [[I.spine03, 1]] },
    // neck base: the trapezius must fall away to roughly neck width here, or
    // every garment cut across the top gains a wide horizontal shelf
    { p: [0, y(1.482), -0.014 * s], rx: chestW * 0.44, rz: chestD * 0.56, w: [[I.spine03, 0.8], [I.neck, 0.2]] },
  ];
}

/** Arm sweep: inside the ribcage -> wrist. */
export function armNodes(rig, side) {
  const { index: I, P, dims } = rig;
  const s = dims.s;
  const m = rig.profile.muscle;
  const sh = P[`upperArm${side}`], el = P[`lowerArm${side}`], wr = P[`hand${side}`];
  const at = (a, b, t) => new THREE.Vector3().lerpVectors(a, b, t).toArray();
  const R = (v) => v * s;
  return [
    // the sweep starts just inside the joint: run it further up and a bare
    // cylinder of shoulder pokes above the trapezius like an epaulette
    { p: at(sh, el, -0.05), rx: R(0.048 + 0.018 * m), w: [[I[`clavicle${side}`], 0.55], [I.spine03, 0.45]] },
    { p: at(sh, el, 0.06), rx: R(0.056 + 0.026 * m), w: [[I[`upperArm${side}`], 0.6], [I[`clavicle${side}`], 0.28], [I.spine03, 0.12]] },
    { p: at(sh, el, 0.26), rx: R(0.052 + 0.028 * m), w: [[I[`upperArm${side}`], 1]] },
    { p: at(sh, el, 0.62), rx: R(0.046 + 0.026 * m), w: [[I[`upperArm${side}`], 1]] },
    { p: at(sh, el, 0.94), rx: R(0.040 + 0.012 * m), w: [[I[`upperArm${side}`], 0.6], [I[`lowerArm${side}`], 0.4]] },
    { p: at(el, wr, 0.14), rx: R(0.043 + 0.020 * m), w: [[I[`upperArm${side}`], 0.12], [I[`lowerArm${side}`], 0.88]] },
    { p: at(el, wr, 0.42), rx: R(0.041 + 0.018 * m), w: [[I[`lowerArm${side}`], 0.72], [I[`twist${side}`], 0.28]] },
    { p: at(el, wr, 0.74), rx: R(0.033 + 0.008 * m), w: [[I[`lowerArm${side}`], 0.3], [I[`twist${side}`], 0.7]] },
    { p: at(el, wr, 0.99), rx: R(0.027 + 0.004 * m), w: [[I[`twist${side}`], 0.45], [I[`hand${side}`], 0.55]] },
  ];
}

/** Leg sweep: hip -> ankle. */
export function legNodes(rig, side) {
  const { index: I, P, dims } = rig;
  const s = dims.s;
  const m = rig.profile.muscle;
  const hp = P[`thigh${side}`], kn = P[`shin${side}`], an = P[`foot${side}`];
  const at = (a, b, t) => new THREE.Vector3().lerpVectors(a, b, t).toArray();
  const R = (v) => v * s;
  return [
    { p: at(hp, kn, -0.10), rx: R(0.088 + 0.026 * m), w: [[I.hips, 0.72], [I[`thigh${side}`], 0.28]] },
    { p: at(hp, kn, 0.08), rx: R(0.086 + 0.030 * m), w: [[I.hips, 0.26], [I[`thigh${side}`], 0.74]] },
    { p: at(hp, kn, 0.34), rx: R(0.079 + 0.030 * m), w: [[I[`thigh${side}`], 1]] },
    { p: at(hp, kn, 0.70), rx: R(0.068 + 0.022 * m), w: [[I[`thigh${side}`], 1]] },
    { p: at(hp, kn, 0.98), rx: R(0.056 + 0.008 * m), w: [[I[`thigh${side}`], 0.5], [I[`shin${side}`], 0.5]] },
    { p: at(kn, an, 0.14), rx: R(0.058 + 0.016 * m), w: [[I[`shin${side}`], 1]] },
    { p: at(kn, an, 0.36), rx: R(0.053 + 0.016 * m), w: [[I[`shin${side}`], 1]] },
    { p: at(kn, an, 0.72), rx: R(0.038 + 0.006 * m), w: [[I[`shin${side}`], 1]] },
    { p: at(kn, an, 0.99), rx: R(0.031 + 0.004 * m), w: [[I[`shin${side}`], 0.72], [I[`foot${side}`], 0.28]] },
  ];
}

/**
 * Cross-section shaping for the torso — pecs, lats, spinal groove, glutes.
 * Garments reuse it (damped) so cloth follows the body it covers instead of
 * sinking into a pectoral or floating off a shoulder blade.
 * @param {number} m muscle 0..1
 */
export function torsoShape(m) {
  return (th, t) => {
    let k = 1;
    k += (0.055 + 0.115 * m) * abump(th, 0.34, 0.55) * bump(t, 0.80, 0.15);
    k += (0.055 + 0.115 * m) * abump(th, -0.34, 0.55) * bump(t, 0.80, 0.15);
    k -= (0.010 + 0.030 * m) * (abump(th, 0.34, 0.5) + abump(th, -0.34, 0.5)) * bump(t, 0.695, 0.05);
    k -= 0.035 * abump(th, 0, 0.22) * bump(t, 0.78, 0.2);
    k += (0.02 + 0.09 * m) * (abump(th, Math.PI * 0.5, 0.75) + abump(th, -Math.PI * 0.5, 0.75)) * bump(t, 0.66, 0.24);
    k -= (0.03 + 0.02 * m) * abump(th, Math.PI, 0.2) * bump(t, 0.6, 0.45);
    k += (0.05 + 0.05 * m) * abump(th, Math.PI, 1.5) * smoothIn(0.86, 1.0, t) * 0.8;
    k += (0.012 + 0.05 * m) * abump(th, 0, 0.9) * bump(t, 0.42, 0.22);
    // abdominal segmentation, only meaningful on a heavy build
    k += (0.018 * m) * abump(th, 0, 0.8) * Math.cos((t - 0.42) * 62) * bump(t, 0.48, 0.20);
    k -= 0.02 * abump(th, 0, 0.5) * bump(t, 0.55, 0.10);
    k += (0.05 + 0.04 * m) * abump(th, Math.PI, 1.0) * bump(t, 0.10, 0.16);
    k -= 0.03 * (abump(th, Math.PI * 0.5, 0.9) + abump(th, -Math.PI * 0.5, 0.9)) * bump(t, 0.38, 0.16);
    return k;
  };
}

/** Deltoid / biceps / triceps / forearm shaping. */
export function armShape(m, sg) {
  return (th, t) => 1
    + (0.10 + 0.22 * m) * abump(th, sg * Math.PI * 0.5, 1.5) * bump(t, 0.10, 0.16)
    + (0.05 + 0.16 * m) * abump(th, 0, 1.2) * bump(t, 0.30, 0.16)
    + (0.04 + 0.12 * m) * abump(th, Math.PI, 1.2) * bump(t, 0.34, 0.18)
    + (0.05 + 0.10 * m) * bump(t, 0.62, 0.10)
    - 0.05 * bump(t, 0.46, 0.06);
}

/** Glute tie-in, quad sweep, calf. */
export function legShape(m) {
  return (th, t) => 1
    + (0.05 + 0.09 * m) * abump(th, Math.PI, 1.1) * bump(t, 0.14, 0.2)
    + (0.03 + 0.07 * m) * abump(th, 0, 1.0) * bump(t, 0.26, 0.2)
    + (0.04 + 0.10 * m) * abump(th, Math.PI, 1.0) * bump(t, 0.62, 0.12)
    - 0.045 * bump(t, 0.47, 0.07);
}

/**
 * Resample a node list into a new one covering [u0,u1] with `count` nodes,
 * padded outward — this is how a garment is cut from the body it covers.
 *
 * @param {Array} nodes source sweep
 * @param {number} u0 start parameter
 * @param {number} u1 end parameter
 * @param {number} count nodes to emit
 * @param {(u:number)=>number|number} pad radial padding in metres
 */
export function drape(nodes, u0, u1, count, pad, padZ) {
  const curve = new THREE.CatmullRomCurve3(nodes.map((n) => new THREE.Vector3().fromArray(n.p)), false, 'centripetal', 0.5);
  const rxs = nodes.map((n) => n.rx);
  const rzs = nodes.map((n) => n.rz ?? n.rx);
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const u = u0 + (u1 - u0) * t;
    const p = curve.getPoint(clamp01(u));
    const pd = typeof pad === 'function' ? pad(t, u) : pad;
    const pz = padZ == null ? pd : (typeof padZ === 'function' ? padZ(t, u) : padZ);
    out.push({
      p: [p.x, p.y, p.z],
      rx: crScalar(rxs, clamp01(u)) + pd,
      rz: crScalar(rzs, clamp01(u)) + pz,
      w: weightsAt(nodes, clamp01(u)),
      u,
    });
  }
  return out;
}

/** Sweep parameter whose sampled point is closest to height `y`. */
export function uAtY(nodes, y) {
  const curve = new THREE.CatmullRomCurve3(nodes.map((n) => new THREE.Vector3().fromArray(n.p)), false, 'centripetal', 0.5);
  let best = 0, bd = Infinity;
  for (let i = 0; i <= 200; i++) {
    const u = i / 200;
    const d = Math.abs(curve.getPoint(u).y - y);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
