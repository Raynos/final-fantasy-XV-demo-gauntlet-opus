import * as THREE from 'three';
import { crScalar, weightsAt, clamp01, abump, bump, smoothIn } from './Geo.ts';

/**
 * The single source of truth for a character's body sweeps.
 *
 * Both the skin (Body.js) and every garment (Outfit.js) are generated from
 * these node lists, so a jacket is guaranteed to sit *outside* the torso it
 * covers and to carry compatible skin weights — clothing deforms with the body
 * instead of shearing through it.
 */

/** Torso sweep: pelvis -> shoulder line. */
export function torsoNodes(rig: any) {
  const { index: I, dims } = rig;
  const s = dims.s;
  const m = rig.profile.muscle;
  const y = (v: any) => v * s;
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
    // Neck base. The ring itself stays close to neck width — a wide ring here is
    // a horizontal shelf — but `torsoShape` ramps it back out along ±X only, so
    // the trapezius rises from C7 to the acromion as a slope rather than the
    // 90° step that made every neck read twice its real length.
    { p: [0, y(1.478), -0.014 * s], rx: chestW * 0.48, rz: chestD * 0.54, w: [[I.spine03, 0.8], [I.neck, 0.2]] },
  ];
}

/** Arm sweep: inside the ribcage -> wrist. */
export function armNodes(rig: any, side: any) {
  const { index: I, P, dims } = rig;
  const s = dims.s;
  const m = rig.profile.muscle;
  const sh = P[`upperArm${side}`], el = P[`lowerArm${side}`], wr = P[`hand${side}`];
  const at = (a: any, b: any, t: any) => new THREE.Vector3().lerpVectors(a, b, t).toArray();
  const R = (v: any) => v * s;
  // The proximal end runs *inboard along the clavicle*, not backwards along the
  // arm axis. In an A-pose that axis is nearly vertical, so extrapolating it
  // negatively put the first two nodes 9 cm ABOVE the shoulder line and outboard
  // of the acromion: a spike rising off each corner of the yoke, and any sleeve
  // draped on it capped into a pointed wing. The deltoid now begins *below* the
  // acromion and rounds downward, which is what a shoulder actually does.
  const acx = sh.x, shY = sh.y;
  return [
    { p: [acx * 0.20, shY + 0.026 * s, 0.012 * s], rx: R(0.050 + 0.014 * m), rz: R(0.062 + 0.014 * m), w: [[I.spine03, 0.94], [I[`clavicle${side}`], 0.06]] },
    { p: [acx * 0.58, shY + 0.022 * s, 0.008 * s], rx: R(0.048 + 0.016 * m), rz: R(0.058 + 0.014 * m), w: [[I.spine03, 0.56], [I[`clavicle${side}`], 0.44]] },
    // acromion: the cap of the shoulder, a rounded capsule, not a shelf corner
    { p: [acx * 0.93, shY + 0.004 * s, 0.004 * s], rx: R(0.047 + 0.020 * m), rz: R(0.052 + 0.017 * m), w: [[I[`upperArm${side}`], 0.46], [I[`clavicle${side}`], 0.42], [I.spine03, 0.12]] },
    { p: at(sh, el, 0.17), rx: R(0.049 + 0.026 * m), w: [[I[`upperArm${side}`], 0.92], [I[`clavicle${side}`], 0.08]] },
    { p: at(sh, el, 0.46), rx: R(0.047 + 0.027 * m), w: [[I[`upperArm${side}`], 1]] },
    { p: at(sh, el, 0.78), rx: R(0.043 + 0.020 * m), w: [[I[`upperArm${side}`], 1]] },
    { p: at(sh, el, 0.99), rx: R(0.039 + 0.011 * m), w: [[I[`upperArm${side}`], 0.55], [I[`lowerArm${side}`], 0.45]] },
    { p: at(el, wr, 0.30), rx: R(0.042 + 0.019 * m), w: [[I[`lowerArm${side}`], 0.82], [I[`twist${side}`], 0.18]] },
    { p: at(el, wr, 0.68), rx: R(0.034 + 0.009 * m), w: [[I[`lowerArm${side}`], 0.32], [I[`twist${side}`], 0.68]] },
    { p: at(el, wr, 0.99), rx: R(0.026 + 0.004 * m), w: [[I[`twist${side}`], 0.45], [I[`hand${side}`], 0.55]] },
  ];
}

/** Leg sweep: hip -> ankle. */
export function legNodes(rig: any, side: any) {
  const { index: I, P, dims } = rig;
  const s = dims.s;
  const m = rig.profile.muscle;
  const hp = P[`thigh${side}`], kn = P[`shin${side}`], an = P[`foot${side}`];
  const at = (a: any, b: any, t: any) => new THREE.Vector3().lerpVectors(a, b, t).toArray();
  const R = (v: any) => v * s;
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
 * @param m muscle 0..1
 */
export function torsoShape(m: number) {
  return (th: any, t: any) => {
    let k = 1;
    k += (0.045 + 0.062 * m) * abump(th, 0.40, 0.62) * bump(t, 0.79, 0.18);
    k += (0.045 + 0.062 * m) * abump(th, -0.40, 0.62) * bump(t, 0.79, 0.18);
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
    // Trapezius. Purely lateral (±X), ramping in over the top eighth of the
    // sweep, so the neck ring stays slim while the yoke slopes out to the
    // acromion. Without it the neck is a bare cylinder meeting a flat plate at
    // 90°, and that step is most of why the neck reads twice its real length.
    const trap = (abump(th, Math.PI * 0.5, 0.78) + abump(th, -Math.PI * 0.5, 0.78));
    k += (0.40 + 0.34 * m) * trap * smoothIn(0.80, 1.0, t);
    // and it carries a little of the same mass round the back of the neck
    k += (0.16 + 0.14 * m) * abump(th, Math.PI, 0.8) * smoothIn(0.84, 1.0, t);
    return k;
  };
}

/** Deltoid / biceps / triceps / forearm shaping. */
export function armShape(m: any, sg: any) {
  // t indices follow armNodes(): 0..0.22 clavicle, 0.22 acromion, 0.67 elbow,
  // 1.0 wrist.
  return (th: any, t: any) => 1
    + (0.045 + 0.10 * m) * abump(th, sg * Math.PI * 0.5, 1.5) * bump(t, 0.30, 0.15)
    + (0.05 + 0.16 * m) * abump(th, 0, 1.2) * bump(t, 0.44, 0.15)
    + (0.04 + 0.12 * m) * abump(th, Math.PI, 1.2) * bump(t, 0.47, 0.17)
    + (0.05 + 0.10 * m) * bump(t, 0.76, 0.09)
    - 0.05 * bump(t, 0.66, 0.05)
    - (0.05 + 0.05 * m) * bump(t, 0.98, 0.06);      // wrist taper
}

/** Glute tie-in, quad sweep, calf. */
export function legShape(m: any) {
  return (th: any, t: any) => 1
    + (0.05 + 0.09 * m) * abump(th, Math.PI, 1.1) * bump(t, 0.14, 0.2)
    + (0.03 + 0.07 * m) * abump(th, 0, 1.0) * bump(t, 0.26, 0.2)
    + (0.04 + 0.10 * m) * abump(th, Math.PI, 1.0) * bump(t, 0.62, 0.12)
    - 0.045 * bump(t, 0.47, 0.07);
}

/**
 * Resample a node list into a new one covering [u0,u1] with `count` nodes,
 * padded outward — this is how a garment is cut from the body it covers.
 *
 * @param nodes source sweep
 * @param u0 start parameter
 * @param u1 end parameter
 * @param count nodes to emit
 * @param pad radial padding in metres
 */
export function drape(nodes: any[], u0: number, u1: number, count: number, pad: (u:number)=>number|number, padZ: any) {
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
export function uAtY(nodes: any, y: any) {
  const curve = new THREE.CatmullRomCurve3(nodes.map((n: any) => new THREE.Vector3().fromArray(n.p)), false, 'centripetal', 0.5);
  let best = 0, bd = Infinity;
  for (let i = 0; i <= 200; i++) {
    const u = i / 200;
    const d = Math.abs(curve.getPoint(u).y - y);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
