import * as THREE from 'three';
import { MeshBuilder, sweepTube, blob, abump, bump, clamp01 } from './Geo.ts';
import { torsoNodes, armNodes, legNodes, torsoShape, armShape, legShape, drape } from './Anatomy.ts';
import { SKIN_BASE } from './Face.ts';

const _ink = new THREE.Color();

/**
 * Skinned body geometry.
 *
 * The body is a set of swept tubes whose cross-sections are shaped by the
 * character's profile: `muscle` inflates deltoids, pecs, lats, biceps and
 * calves, `shoulder` widens the yoke. Skin weights are authored per sweep node
 * and interpolated along the sweep, which keeps shoulders, elbows, hips and
 * knees free of candy-wrapper collapse.
 */

/**
 * @param rig result of buildSkeleton()
 * @param look { skin:THREE.Color, muscle:number }
 */
export function buildBody(rig: any, look: any): THREE.BufferGeometry {
  const { index: I, P, dims } = rig;
  const s = dims.s;
  const m = rig.profile.muscle;
  const B = new MeshBuilder('body');
  // the *same* base tone the face texture is painted from — the body used to
  // sit 12% lighter, which put a hard tonal seam along the jaw
  const base = look.skin.clone().multiplyScalar(SKIN_BASE);
  B.color(base).mat(0.57, 0);

  const y = (v: number) => v * s;

  // ---- torso -------------------------------------------------------------
  const torso = torsoNodes(rig);
  const tShape = torsoShape(m);

  sweepTube(B, { nodes: torso, steps: 30, seg: 26, shape: tShape, uvScale: [1, 2.2] });

  // ink sits on its own dense patch a couple of millimetres proud of the skin,
  // in the same mesh and material so it shades exactly like the body
  if (look.tattoo) {
    const u0 = 0.42, u1 = 1.0;
    sweepTube(B, {
      nodes: drape(torso, u0, u1, 8, 0.0022),
      steps: 30, seg: 46,
      theta0: Math.PI - 1.6, theta1: Math.PI + 1.6,
      shape: (th, t) => tShape(th, u0 + (u1 - u0) * t),
      colorAt: (th: any, t: any) => _ink.copy(base).multiplyScalar(1 - 0.86 * clamp01(look.tattoo(th, u0 + (u1 - u0) * t))),
      uvScale: [1, 1],
    });
    B.color(base);
  }

  // ---- neck --------------------------------------------------------------
  // a 9cm neck makes every head look detached; real male necks are 12-13cm
  // across, and the sternocleidomastoid keeps it from reading as a pipe
  const neckR = (0.0505 + 0.0125 * m) * s * rig.profile.neck;
  sweepTube(B, {
    nodes: [
      { p: [0, y(1.406), -0.010 * s], rx: neckR * 1.62, rz: neckR * 1.52, w: [[I.spine03, 0.9], [I.neck, 0.1]] },
      { p: [0, y(1.458), -0.014 * s], rx: neckR * 1.14, rz: neckR * 1.14, w: [[I.spine03, 0.35], [I.neck, 0.65]] },
      { p: [0, y(1.500), -0.008 * s], rx: neckR * 0.99, rz: neckR * 1.04, w: [[I.neck, 0.72], [I.head, 0.28]] },
      { p: [0, y(1.542), -0.002 * s], rx: neckR * 0.92, rz: neckR * 0.98, w: [[I.neck, 0.2], [I.head, 0.8]] },
      { p: [0, y(1.568), 0.002 * s], rx: neckR * 0.68, rz: neckR * 0.74, w: [[I.head, 1]] },
    ],
    steps: 8, seg: 18,
    shape: (th, t) => 1
      + 0.20 * abump(th, Math.PI, 1.1) * (1 - t) * 1.2     // nape into the trapezius
      + 0.10 * (abump(th, 1.15, 0.5) + abump(th, -1.15, 0.5)) * (1 - t * 0.7) // sternocleidomastoid
      + 0.34 * (abump(th, Math.PI * 0.5, 0.7) + abump(th, -Math.PI * 0.5, 0.7)) * Math.pow(1 - t, 2.2)
      - 0.06 * abump(th, 0, 0.5) * bump(t, 0.75, 0.3),
    uvScale: [1, 0.6],
  });

  // ---- arms --------------------------------------------------------------
  for (const side of ['L', 'R']) {
    const sg = side === 'L' ? 1 : -1;
    const sh = P[`upperArm${side}`];
    const R = (v: number) => v * s;

    sweepTube(B, {
      nodes: armNodes(rig, side), steps: 22, seg: 16,
      shape: armShape(m, sg),
      uvScale: [1, 1.6],
    });

    // A small joint filler, buried well inside the sweep. It exists only to
    // keep the armpit closed when the arm lifts; anything proud of the surface
    // here immediately reads as a ball-jointed doll.
    B.skin([[I[`upperArm${side}`], 0.7], [I[`clavicle${side}`], 0.3]]);
    blob(B, {
      center: [sh.x - sg * R(0.020), sh.y - R(0.026), sh.z],
      scale: [R(0.026 + 0.010 * m), R(0.030 + 0.010 * m), R(0.029 + 0.009 * m)],
      segU: 10, segV: 6,
    });

    buildHand(B, rig, side, look);
    B.color(base).mat(0.57, 0);
  }

  // ---- legs --------------------------------------------------------------
  for (const side of ['L', 'R']) {
    sweepTube(B, { nodes: legNodes(rig, side), steps: 20, seg: 16, shape: legShape(m), uvScale: [1, 2.0] });
  }

  // subtle warm shading in the deep creases
  const armpitY = dims.shoulderY - 0.08 * s;
  B.occlude(dims.shoulderX * 0.75, armpitY, 0, 0.10 * s, 0.28);
  B.occlude(-dims.shoulderX * 0.75, armpitY, 0, 0.10 * s, 0.28);
  B.occlude(0, y(1.40), -0.04 * s, 0.09 * s, 0.22);
  // The jaw's cast shadow on the throat. Without it the neck reads at the same
  // value as the face, the chin loses its edge, and a head at 30 px turns into
  // one continuous flesh-coloured column — which is what makes distant
  // characters look like mannequins more than any amount of face detail.
  B.occlude(0, y(1.545), 0.030 * s, 0.075 * s, 0.44);
  B.occlude(0, y(1.520), 0.010 * s, 0.070 * s, 0.30);

  return B.build();
}

/** scratch colours for the hand's palmar/dorsal tone split */
const _hc = new THREE.Color();

/**
 * Palm, four knuckled fingers and an opposed thumb.
 *
 * The previous build was a mitten for four measurable reasons, all of them
 * arithmetic rather than shading, and all four are fixed here:
 *
 * 1. **It was 40% too short.** The whole hand ran from the wrist to 0.107·s
 *    while a hand is ~0.11 of stature — 0.19·s on a 1.73·s skeleton. The
 *    skeleton already knew this (`fingers` at 0.085·s, `fingerTip` at 0.157·s);
 *    only the geometry disagreed, so the two distal bones drove vertices that
 *    were nowhere near them. A short wide hand is the definition of a mitten.
 * 2. **The fingers were fused.** Pitch was 13.5 mm between centres and the
 *    proximal diameter was 20-21 mm, so every finger overlapped both its
 *    neighbours by 3 mm a side. What rendered was one wedge with four grooves
 *    scored into it. The palm is now wide enough (74 mm across the knuckles,
 *    0.44 of hand length, which is the real ratio) to seat four fingers that
 *    touch at the base and separate as they taper and splay.
 * 3. **The fingers had no joints.** Three nodes and a constant radius is a
 *    tapered cone; a finger is three phalanges with a swelling at each joint
 *    and a flat pad on the palmar side, and it is the joints that read at any
 *    distance where the hand is visible at all.
 * 4. **The knuckle line was a straight row.** All four fingers left the palm at
 *    the same distance, in the same plane. The real metacarpal heads form an
 *    oblique arch — middle furthest and proudest, little finger 15 mm shorter
 *    and lower — which is what gives a relaxed hand its silhouette.
 *
 * Two non-geometric fixes ride along. The UVs were unscaled, so the shared pore
 * normal map (`repeat(15,23)`) tiled fifteen times across one 70 mm palm and
 * the whole map aliased to flat; the sweeps now carry a `uvScale` that puts the
 * hand at the same ~13 mm/tile as the torso and the arm. And the tone is split
 * palmar/dorsal — a palm is paler, pinker and drier than the back of the hand,
 * and that value break is most of what stops a hand reading as a wax casting.
 *
 * When the character wears gloves the same geometry is re-coloured and given a
 * cloth response, with the seam and knuckle darkening kept and the skin tone
 * split dropped, which is what a thin leather glove actually looks like.
 */
function buildHand(B: MeshBuilder, rig: any, side: string, look: any) {
  const { index: I, P, dims } = rig;
  const gl = look.gloves;
  const s = dims.s;
  const sg = side === 'L' ? 1 : -1;
  const R = (v: number) => v * s;
  const wr = P[`hand${side}`];
  const kn = P[`fingers${side}`];
  const dir = new THREE.Vector3().subVectors(kn, wr).normalize();
  const sideAxis = new THREE.Vector3(1, 0, 0);
  // `front` is the *dorsal* normal: the fingers flex toward -front, so -front
  // is the palm. The old thumb sat at +front, i.e. on the back of the hand.
  const front = new THREE.Vector3().crossVectors(sideAxis, dir).normalize().multiplyScalar(-1);

  const pt = (along: number, across: number, depth: number) => new THREE.Vector3()
    .copy(wr)
    .addScaledVector(dir, along * s)
    .addScaledVector(sideAxis, across * s * sg)
    .addScaledVector(front, depth * s);

  // In sweep frame, theta 0 is +front (dorsal) and PI is -front (palmar);
  // theta ±PI/2 is ±X, so which of them is the thumb side depends on the hand.
  const thRadial = -Math.PI * 0.5 * sg;   // thumb side
  const thUlnar = Math.PI * 0.5 * sg;     // little-finger side
  const thenar = Math.PI + 0.62 * sg;     // palmar-radial mound
  const hypo = Math.PI - 0.62 * sg;       // palmar-ulnar mound

  const skin = look.skin.clone().multiplyScalar(SKIN_BASE);
  // dorsal skin is a shade darker and warmer (it is the sunlit side of a hand);
  // palmar is paler, pinker and markedly drier
  const dorsalC = skin.clone().multiplyScalar(0.945);
  const palmarC = skin.clone().multiplyScalar(1.05).offsetHSL(-0.010, 0.05, 0);
  const gloveC = gl ? new THREE.Color(gl.color) : null;
  const gloveRough = gl ? (gl.rough ?? 0.72) : 0;

  /** dorsalness in 0..1 from the sweep angle. */
  const dorsalness = (th: number) => 0.5 + 0.5 * Math.cos(th);
  /** Skin (or glove) colour at a sweep sample, darkened by `shade`. */
  const tone = (th: number, shade: number) => {
    if (gloveC) return _hc.copy(gloveC).multiplyScalar(shade);
    return _hc.copy(palmarC).lerp(dorsalC, dorsalness(th)).multiplyScalar(shade);
  };
  /** Roughness / metalness / translucency at a sweep sample. */
  const finish = (th: number, thick: number) => {
    if (gl) return [gloveRough, 0, 0];
    const d = dorsalness(th);
    // palm skin is dry and matte, the back of the hand is oilier
    return [0.66 - 0.16 * d, 0, thick * (0.35 + 0.65 * (1 - d))];
  };

  // ---- palm --------------------------------------------------------------
  // 82 mm from the wrist to the middle knuckle, 74 mm across: a hand, not a
  // paddle. uvScale puts the pore map at ~13 mm/tile, matching the forearm.
  B.skin([[I[`hand${side}`], 1]]);
  sweepTube(B, {
    nodes: [
      { p: pt(-0.014, 0.001, 0.000).toArray(), rx: R(0.0248), rz: R(0.0158), w: [[I[`hand${side}`], 0.65], [I[`twist${side}`], 0.35]] },
      { p: pt(0.016, 0.002, 0.0015).toArray(), rx: R(0.0308), rz: R(0.0162), w: [[I[`hand${side}`], 1]] },
      { p: pt(0.046, 0.001, 0.0028).toArray(), rx: R(0.0356), rz: R(0.0146), w: [[I[`hand${side}`], 0.94], [I[`fingers${side}`], 0.06]] },
      { p: pt(0.070, -0.001, 0.0032).toArray(), rx: R(0.0366), rz: R(0.0116), w: [[I[`hand${side}`], 0.74], [I[`fingers${side}`], 0.26]] },
    ],
    steps: 10, seg: 20, ref: front.toArray(),
    uvScale: [0.78, 0.24],
    // thenar and hypothenar mounds either side of a hollow palm, a dorsal
    // metacarpal ridge under the knuckles, and the ulnar styloid at the wrist
    shape: (th, t) => 1
      + 0.20 * abump(th, thenar, 0.92) * (0.30 + 0.70 * bump(t, 0.34, 0.62))
      + 0.125 * abump(th, hypo, 0.80) * (1 - 0.45 * t)
      - 0.115 * abump(th, Math.PI, 0.62) * bump(t, 0.66, 0.52)
      + 0.055 * abump(th, 0, 1.05) * bump(t, 0.92, 0.34)
      + 0.10 * abump(th, thUlnar * 0.55, 0.55) * bump(t, 0.03, 0.22),
    colorAt: (th: number, t: number) => tone(th,
      // the web between the thumb and the index finger, and the crease across
      // the base of the fingers, are the two shadows a hand always has
      (1 - 0.16 * abump(th, thRadial, 0.85) * bump(t, 0.80, 0.34))
      * (1 - 0.10 * abump(th, Math.PI, 0.9) * bump(t, 0.66, 0.5))),
    matAt: (th: number, t: number) => finish(th, 0.20 + 0.35 * bump(t, 0.86, 0.4)),
  });

  // ---- four fingers ------------------------------------------------------
  // Each is three phalanges built by walking a frame: flex about the hand's
  // across-axis at every joint, splay about the dorsal axis at the knuckle.
  // Radii swell at each joint — a finger is widest at the knuckles, and that
  // is the whole difference between a finger and a cone.
  const F = [
    // across, along and depth of the metacarpal head, shaft radius, the three
    // phalanx lengths, the three joint flexions, and the splay at the knuckle
    { a: -0.0245, l: 0.0700, d: 0.0034, r: 0.0086, len: [0.0360, 0.0230, 0.0180], flex: [0.11, 0.30, 0.17], splay: -0.090 },
    { a: -0.0080, l: 0.0752, d: 0.0048, r: 0.0088, len: [0.0400, 0.0260, 0.0200], flex: [0.13, 0.33, 0.18], splay: -0.008 },
    { a: 0.0085, l: 0.0704, d: 0.0040, r: 0.0082, len: [0.0370, 0.0240, 0.0190], flex: [0.17, 0.37, 0.21], splay: 0.048 },
    { a: 0.0245, l: 0.0600, d: 0.0012, r: 0.0070, len: [0.0280, 0.0180, 0.0150], flex: [0.21, 0.42, 0.24], splay: 0.120 },
  ];
  const IF = I[`fingers${side}`], IH = I[`hand${side}`], IT = I[`fingerTip${side}`];
  const wF = [
    [[IF, 0.50], [IH, 0.50]], [[IF, 0.92], [IH, 0.08]], [[IF, 1]],
    [[IF, 0.72], [IT, 0.28]], [[IF, 0.38], [IT, 0.62]], [[IT, 1]], [[IT, 1]],
  ];
  for (const f of F) {
    const p = pt(f.l, f.a, f.d);
    const d = dir.clone();
    // splay first: a rotation about the dorsal normal fans the finger sideways
    d.applyAxisAngle(front, f.splay * sg);
    // a rotation about +X always tips the finger toward -front (the palm),
    // because `front` is itself defined from +X — so the sign is side-agnostic
    const flexAxis = new THREE.Vector3().crossVectors(front, d).normalize();
    const nodes: any[] = [];
    const push = (rMul: number, w: any) => nodes.push({
      p: p.toArray(), rx: R(f.r * rMul), rz: R(f.r * rMul * 0.88), w,
    });
    push(1.07, wF[0]);                                   // metacarpal head
    for (let ph = 0; ph < 3; ph++) {
      d.applyAxisAngle(flexAxis, f.flex[ph]);
      flexAxis.crossVectors(front, d).normalize();
      // mid-shaft, then the joint at the far end of the phalanx
      p.addScaledVector(d, f.len[ph] * 0.55 * s);
      if (ph < 2) push([0.92, 0.80][ph], wF[ph * 2 + 1]);
      else push(0.68, wF[5]);
      p.addScaledVector(d, f.len[ph] * 0.45 * s);
      if (ph < 2) push([1.02, 0.87][ph], wF[ph * 2 + 2]);
      else push(0.50, wF[6]);
    }
    sweepTube(B, {
      nodes, steps: 14, seg: 12, ref: front.toArray(),
      uvScale: [0.30, 0.30], capEnd: true, capHeight: 1.0,
      // a flat pad on the palmar side and a slightly flattened nail bed dorsally
      shape: (th, t) => 1
        - 0.10 * abump(th, Math.PI, 0.75) * (0.4 + 0.6 * t)
        - 0.06 * abump(th, 0, 0.6) * bump(t, 0.88, 0.24),
      colorAt: (th: number, t: number) => tone(th,
        // creases at the two interphalangeal joints, on the palmar half only.
        // The sweep has seven nodes, so the PIP is at u=2/6 and the DIP at 4/6:
        // guessing these puts a crease in the middle of a phalanx, which reads
        // as a dent rather than as a joint.
        (1 - 0.22 * (bump(t, 0.3333, 0.075) + bump(t, 0.6667, 0.065)) * (0.25 + 0.75 * abump(th, Math.PI, 1.5)))
        // and the nail: a pale, cool plate on the dorsal side of the last third
        * (gl ? 1 : 1 + 0.12 * abump(th, 0, 0.62) * bump(t, 0.87, 0.14))),
      matAt: (th: number, t: number) => {
        if (gl) return [gloveRough, 0, 0];
        const nail = abump(th, 0, 0.58) * bump(t, 0.87, 0.14);
        const q = finish(th, 0.85);
        // a nail is the one genuinely glossy patch on a hand
        return [q[0] * (1 - 0.62 * nail), 0, q[2] * (1 - nail)];
      },
    });
  }

  // ---- thumb -------------------------------------------------------------
  // It rotates *palmar* out of the thenar mound so the pad opposes the fingers.
  // It used to run to +front, i.e. straight out of the back of the hand, which
  // is why the relaxed pose read as a permanent thumbs-up.
  const IB = I[`thumb${side}`];
  sweepTube(B, {
    nodes: [
      { p: pt(0.004, -0.023, -0.003).toArray(), rx: R(0.0142), rz: R(0.0132), w: [[IH, 0.80], [IB, 0.20]] },
      { p: pt(0.026, -0.044, -0.009).toArray(), rx: R(0.0118), rz: R(0.0108), w: [[IH, 0.25], [IB, 0.75]] },
      { p: pt(0.044, -0.056, -0.016).toArray(), rx: R(0.0106), rz: R(0.0098), w: [[IB, 1]] },
      { p: pt(0.060, -0.063, -0.024).toArray(), rx: R(0.0098), rz: R(0.0090), w: [[IB, 1]] },
      { p: pt(0.074, -0.066, -0.031).toArray(), rx: R(0.0074), rz: R(0.0070), w: [[IB, 1]] },
    ],
    steps: 12, seg: 12, ref: front.toArray(),
    uvScale: [0.32, 0.30], capEnd: true, capHeight: 1.0,
    shape: (th, t) => 1
      - 0.11 * abump(th, Math.PI, 0.8) * (0.3 + 0.7 * t)
      + 0.07 * abump(th, 0, 0.9) * bump(t, 0.42, 0.24),
    colorAt: (th: number, t: number) => tone(th,
      // five nodes, so the interphalangeal joint is at u=3/4
      (1 - 0.18 * bump(t, 0.75, 0.10) * (0.3 + 0.7 * abump(th, Math.PI, 1.5)))
      * (gl ? 1 : 1 + 0.11 * abump(th, 0, 0.62) * bump(t, 0.91, 0.12))),
    matAt: (th: number, t: number) => {
      if (gl) return [gloveRough, 0, 0];
      const nail = abump(th, 0, 0.58) * bump(t, 0.91, 0.12);
      const q = finish(th, 0.75);
      return [q[0] * (1 - 0.62 * nail), 0, q[2] * (1 - nail)];
    },
  });
  // Contact shadow in the interdigital clefts and the palm hollow. Without it
  // four fingers that touch at the base read as one welded slab however well
  // the silhouette separates further out.
  for (let i = 0; i < 3; i++) {
    const a = (F[i].a + F[i + 1].a) * 0.5;
    const l = (F[i].l + F[i + 1].l) * 0.5;
    const c = pt(l + 0.004, a, -0.001);
    B.occlude(c.x, c.y, c.z, R(0.011), 0.20);
  }
  const web = pt(0.052, -0.036, -0.006);
  B.occlude(web.x, web.y, web.z, R(0.018), 0.18);
  const hollow = pt(0.040, -0.001, -0.016);
  B.occlude(hollow.x, hollow.y, hollow.z, R(0.024), 0.18);

  B.color(skin).mat(0.57, 0, 0);
}
