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

  const y = (v: any) => v * s;

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
    const R = (v: any) => v * s;

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

/**
 * Palm + fingers + thumb, gently curled so the hand never reads as a mitten.
 * When the character wears gloves the same geometry is re-coloured and given a
 * cloth response, which is what a thin glove actually looks like.
 */
function buildHand(B: any, rig: any, side: any, look: any) {
  const { index: I, P, dims } = rig;
  const gl = look.gloves;
  if (gl) B.color(gl.color).mat(gl.rough ?? 0.72, 0);
  else B.color(look.skin.clone().multiplyScalar(SKIN_BASE)).mat(0.57, 0);
  const s = dims.s;
  const sg = side === 'L' ? 1 : -1;
  const R = (v: any) => v * s;
  const wr = P[`hand${side}`];
  const kn = P[`fingers${side}`];
  const dir = new THREE.Vector3().subVectors(kn, wr).normalize();
  const sideAxis = new THREE.Vector3(1, 0, 0);
  const front = new THREE.Vector3().crossVectors(sideAxis, dir).normalize().multiplyScalar(-1);

  const pt = (along: any, across: any, depth: any) => new THREE.Vector3()
    .copy(wr)
    .addScaledVector(dir, along * s)
    .addScaledVector(sideAxis, across * s * sg)
    .addScaledVector(front, depth * s);

  // palm
  B.skin([[I[`hand${side}`], 1]]);
  sweepTube(B, {
    nodes: [
      { p: pt(-0.008, 0, 0).toArray(), rx: R(0.026), rz: R(0.017), w: [[I[`hand${side}`], 0.75], [I[`twist${side}`], 0.25]] },
      { p: pt(0.026, 0.002, 0.002).toArray(), rx: R(0.032), rz: R(0.018), w: [[I[`hand${side}`], 1]] },
      { p: pt(0.058, 0.0, 0.004).toArray(), rx: R(0.033), rz: R(0.015), w: [[I[`hand${side}`], 0.85], [I[`fingers${side}`], 0.15]] },
    ],
    steps: 6, seg: 12, ref: front.toArray(),
    shape: (th) => 1 + 0.12 * abump(th, Math.PI, 1.0),
  });

  // four fingers, progressively shorter and more curled. Bare fingers are the
  // one part of a body light shines clean through, so they carry full
  // translucent thickness; a glove blocks that entirely.
  if (!gl) B.mat(0.54, 0, 0.85);
  const fl = [0.046, 0.051, 0.047, 0.039];
  const fr = [0.0100, 0.0107, 0.0100, 0.0086];
  for (let i = 0; i < 4; i++) {
    const across = (-0.019 + i * 0.0135);
    const curl = 1.7 + i * 0.14;
    const p0 = pt(0.060, across, 0.004);
    const p1 = new THREE.Vector3().copy(p0).addScaledVector(dir, fl[i] * 0.5 * s).addScaledVector(front, -fl[i] * 0.16 * s * curl);
    const p2 = new THREE.Vector3().copy(p1).addScaledVector(dir, fl[i] * 0.42 * s).addScaledVector(front, -fl[i] * 0.42 * s * curl);
    sweepTube(B, {
      nodes: [
        { p: p0.toArray(), rx: R(fr[i] * 1.12), w: [[I[`fingers${side}`], 0.7], [I[`hand${side}`], 0.3]] },
        { p: p1.toArray(), rx: R(fr[i]), w: [[I[`fingers${side}`], 1]] },
        { p: p2.toArray(), rx: R(fr[i] * 0.82), w: [[I[`fingerTip${side}`], 0.75], [I[`fingers${side}`], 0.25]] },
      ],
      steps: 6, seg: 8, ref: front.toArray(),
    });
    // fingertip cap
    B.skin([[I[`fingerTip${side}`], 1]]);
    blob(B, { center: p2.toArray(), scale: [R(fr[i] * 0.82), R(fr[i] * 0.82), R(fr[i] * 0.82)], segU: 8, segV: 5 });
  }

  // thumb
  const t0 = pt(0.012, -0.026, 0.010);
  const t1 = pt(0.036, -0.040, 0.024);
  const t2 = pt(0.054, -0.042, 0.042);
  sweepTube(B, {
    nodes: [
      { p: t0.toArray(), rx: R(0.015), w: [[I[`hand${side}`], 0.8], [I[`thumb${side}`], 0.2]] },
      { p: t1.toArray(), rx: R(0.0120), w: [[I[`thumb${side}`], 1]] },
      { p: t2.toArray(), rx: R(0.0102), w: [[I[`thumb${side}`], 1]] },
    ],
    steps: 6, seg: 8, ref: front.toArray(),
  });
  B.skin([[I[`thumb${side}`], 1]]);
  blob(B, { center: t2.toArray(), scale: [R(0.0102), R(0.0102), R(0.0102)], segU: 8, segV: 5 });
  B.mat(0.57, 0, 0);
}
