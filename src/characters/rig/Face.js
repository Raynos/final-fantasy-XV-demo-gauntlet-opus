import * as THREE from 'three';
import { MeshBuilder, applyBrushes, expandMirrors, blob, ribbon, clamp01, smooth, lerp } from './Geo.js';
import { canvasTexture } from '../../util/TextureGen.js';
import { Rng } from '../../util/Rng.js';
import { Noise } from '../../util/Noise.js';

/**
 * Head, face and eyes.
 *
 * The skull starts as an ellipsoid and is pushed into a face by ~30 sculpt
 * brushes (brow ridge, sockets, nasal bridge, philtrum, lips, jaw angle...).
 * Eyelids are separate lid-bone-weighted shells riding just outside the
 * eyeball, so the character can blink; the eyeballs themselves are one mesh on
 * a gaze pivot under the head bone.
 *
 * All authoring happens in canonical head space (origin = skull centre,
 * +Z forward) and is placed onto the skeleton at the end.
 */

/**
 * Upper / lower lid opening fractions. Below about 0.7 the aperture is
 * narrower than the iris and the eye reads as a dark bead with no sclera —
 * which is the difference between a person and a doll at any distance.
 */
export const LID_OPEN = [0.70, 0.17];

/** Canonical head half-extents before sculpting. */
const HR = [0.0785, 0.1130, 0.0960];

/**
 * Feature anchors in canonical head space, laid out on classical proportions:
 * the eye line sits at the vertical centre of the skull, and hairline → brow →
 * nose base → chin divide the face into equal thirds. Getting this wrong is
 * what makes a procedural head read as a doll.
 */
export const FACE = {
  eye: [0.0335, -0.006, 0.0646],
  eyeR: 0.0107,
  brow: [0.031, 0.005, 0.081],
  noseTip: [0, -0.046, 0.104],
  mouth: [0, -0.079, 0.084],
  chin: [0, -0.108, 0.074],
  ear: [0.0725, -0.026, -0.006],
  yMin: -0.122,
  yMax: 0.116,
};

function brushes(look) {
  const jaw = look.jaw ?? 0;          // -1 fine .. +1 square/heavy
  const cheek = look.cheek ?? 0;
  const nose = look.nose ?? 0;
  const brow = look.brow ?? 0;
  const b = [];
  const add = (o) => b.push(o);

  // cranium shaping
  add({ p: [0, 0.070, -0.075], r: [0.12, 0.10, 0.07], amt: -0.010, dir: [0, 0, 1] });
  // occiput tuck: the back of the skull must fall away above the neck,
  // otherwise the head reads as a ball with a face painted on the front
  add({ p: [0, -0.062, -0.082], r: [0.085, 0.060, 0.062], amt: -0.020, dir: 'normal' });
  add({ p: [0, -0.096, -0.062], r: [0.086, 0.052, 0.070], amt: -0.030, dir: 'normal' });
  add({ p: [0.052, -0.086, -0.030], r: [0.050, 0.045, 0.060], amt: -0.014, dir: 'normal', mirror: true });
  add({ p: [0, 0.104, 0.02], r: [0.10, 0.06, 0.10], amt: -0.005, dir: 'normal' });
  add({ p: [0.072, 0.048, 0.028], r: [0.044, 0.062, 0.058], amt: -0.006, dir: 'normal', mirror: true });
  add({ p: [0.064, 0.014, 0.050], r: [0.038, 0.038, 0.048], amt: -0.005, dir: 'normal', mirror: true });

  // brow ridge + glabella
  add({ p: [0.030, 0.0155, 0.079], r: [0.048, 0.017, 0.052], amt: 0.0125 + 0.006 * brow, dir: [0, 0, 1], mirror: true });
  add({ p: [0, 0.009, 0.082], r: [0.022, 0.016, 0.040], amt: 0.0045 + 0.002 * brow, dir: [0, 0, 1] });
  add({ p: [0.049, 0.010, 0.067], r: [0.028, 0.020, 0.042], amt: 0.0045, dir: 'normal', mirror: true });
  // shadowed hollow directly under the brow
  add({ p: [0.033, 0.0035, 0.078], r: [0.036, 0.009, 0.040], amt: -0.0075, dir: [0, 0, 1], mirror: true });

  // eye sockets
  // A socket is a shallow dish, not a crater. At -46 mm the skin fell 4 cm
  // behind the eyeball and the globe stood proud of the face like a marble
  // glued on; the lids could not reach it and the whole lower hemisphere was
  // visible. The globe now sits *inside* the head and only the aperture shows.
  add({ p: [0.0335, -0.008, 0.078], r: [0.036, 0.024, 0.046], amt: -0.0285, dir: [0, 0, 1], mirror: true });
  add({ p: [0.0335, -0.006, 0.072], r: [0.026, 0.018, 0.040], amt: -0.0115, dir: [0, 0, 1], mirror: true });
  add({ p: [0.0150, -0.004, 0.072], r: [0.017, 0.020, 0.030], amt: -0.0060, dir: [0, 0, 1], mirror: true });
  // lower orbital rim: this is what stops a crescent of sclera showing under
  // the iris and giving every character a permanently startled stare
  add({ p: [0.0335, -0.0175, 0.0735], r: [0.030, 0.0090, 0.034], amt: 0.0112, dir: [0, 0, 1], mirror: true });
  add({ p: [0.058, -0.004, 0.056], r: [0.020, 0.024, 0.032], amt: -0.0035, dir: 'normal', mirror: true });

  // cheeks
  add({ p: [0.059, -0.014, 0.056], r: [0.038, 0.024, 0.050], amt: 0.0115 + 0.007 * cheek, dir: 'normal', mirror: true });
  add({ p: [0.050, -0.050, 0.052], r: [0.034, 0.030, 0.046], amt: -0.0120 + 0.006 * cheek, dir: 'normal', mirror: true });
  add({ p: [0.038, -0.062, 0.064], r: [0.018, 0.022, 0.032], amt: -0.0035, dir: 'normal', mirror: true });

  // nose
  add({ p: [0, -0.014, 0.089], r: [0.0175, 0.032, 0.030], amt: 0.0100 + 0.004 * nose, dir: [0, 0, 1] });
  add({ p: [0, -0.042, 0.095], r: [0.0165, 0.019, 0.028], amt: 0.0205 + 0.005 * nose, dir: [0, 0.14, 1] });
  add({ p: [0, -0.049, 0.098], r: [0.0115, 0.010, 0.020], amt: 0.0070, dir: [0, -0.2, 1] });
  // alar wings: a real ball of cartilage each side of the tip, and the crease
  // that curls around it. Without these the nose is a triangular smear.
  add({ p: [0.0155, -0.0495, 0.0855], r: [0.0105, 0.0110, 0.0195], amt: 0.0115, dir: 'normal', mirror: true });
  add({ p: [0.0225, -0.0505, 0.0790], r: [0.0055, 0.0090, 0.0140], amt: -0.0055, dir: 'normal', mirror: true });
  add({ p: [0, -0.058, 0.087], r: [0.017, 0.010, 0.024], amt: -0.0095, dir: [0, 0, 1] });
  // nostril openings, cut upward into the underside of the nose
  add({ p: [0.0092, -0.0562, 0.0885], r: [0.0052, 0.0058, 0.0125], amt: -0.0090, dir: [0, 0.55, 1], mirror: true });

  // mouth — the lips are volumes, not a painted line. Upper lip rolls forward
  // under a real philtrum; the lower lip carries a fuller, rounder mass with a
  // shadowed mentolabial crease beneath it.
  add({ p: [0, -0.0630, 0.0875], r: [0.0075, 0.0105, 0.019], amt: -0.0060, dir: [0, 0, 1] });    // philtrum groove
  add({ p: [0.0090, -0.0640, 0.0865], r: [0.0050, 0.0090, 0.017], amt: 0.0042, dir: [0, 0, 1], mirror: true }); // philtrum columns
  add({ p: [0, -0.0735, 0.0855], r: [0.026, 0.0095, 0.026], amt: 0.0115, dir: [0, 0.18, 1] });   // upper vermilion
  add({ p: [0, -0.0700, 0.0862], r: [0.010, 0.0055, 0.020], amt: 0.0038, dir: [0, 0, 1] });      // cupid's bow
  add({ p: [0, -0.0788, 0.0850], r: [0.030, 0.0032, 0.026], amt: -0.0092, dir: [0, 0, 1] });     // mouth line
  add({ p: [0, -0.0855, 0.0845], r: [0.023, 0.0105, 0.027], amt: 0.0105, dir: [0, -0.10, 1] });  // lower vermilion
  add({ p: [0.026, -0.0790, 0.076], r: [0.012, 0.012, 0.021], amt: -0.0070, dir: 'normal', mirror: true });

  // chin + jaw
  add({ p: [0, -0.0945, 0.0785], r: [0.022, 0.0085, 0.024], amt: -0.0072, dir: [0, 0, 1] });
  add({ p: [0, -0.1075, 0.0735], r: [0.028, 0.026, 0.040], amt: 0.0215 + 0.009 * jaw, dir: [0, 0.06, 1] });
  // mandible: a ramus block plus an undercut that carves the jawline edge
  add({ p: [0.064, -0.056, -0.004], r: [0.028, 0.034, 0.052], amt: 0.008 + 0.014 * jaw, dir: 'normal', mirror: true });
  // gonial angle — the corner where the ramus turns forward into the body of
  // the mandible. Without it the lower face is a rounded egg and the character
  // reads as a child no matter what the rest of the sculpt does.
  add({ p: [0.0605, -0.0800, 0.0075], r: [0.0165, 0.0165, 0.026], amt: 0.0135 + 0.010 * jaw, dir: 'normal', mirror: true });
  add({ p: [0.0575, -0.0915, 0.0245], r: [0.020, 0.0130, 0.030], amt: 0.0068 + 0.008 * jaw, dir: 'normal', mirror: true });
  add({ p: [0.054, -0.078, 0.038], r: [0.034, 0.026, 0.054], amt: 0.004 + 0.008 * jaw, dir: 'normal', mirror: true });
  add({ p: [0.050, -0.101, 0.030], r: [0.046, 0.030, 0.062], amt: -0.021 + 0.005 * jaw, dir: 'normal', mirror: true });
  add({ p: [0.042, -0.036, 0.030], r: [0.030, 0.028, 0.040], amt: -0.003 - 0.004 * cheek, dir: 'normal', mirror: true });

  // neck tie-in — tuck the underside so the jawline reads as an edge
  add({ p: [0, -0.108, -0.030], r: [0.076, 0.042, 0.072], amt: -0.010, dir: 'normal' });
  return expandMirrors(b);
}

/**
 * Vertical width profile of the skull. A plain ellipsoid tapers to a point at
 * the chin, which leaves a head with no mandible — and lets the neck push out
 * through the face. Below the equator the profile is deliberately fuller so the
 * jaw keeps real mass all the way down to the chin line.
 */
function profileW(yn) {
  if (yn >= 0) return Math.sqrt(Math.max(0, 1 - yn * yn));
  const a = Math.min(1, Math.abs(yn) / 1.055);
  return Math.pow(Math.max(0, 1 - Math.pow(a, 2.6)), 0.46);
}

/** Un-sculpted skull surface point for a spherical coordinate. */
function shellPoint(theta, phi, rr, out) {
  const yn = Math.cos(phi);
  const w = profileW(yn);
  return out.set(w * Math.sin(theta) * rr[0], yn * rr[1], w * Math.cos(theta) * rr[2]);
}

const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3();

/** Surface point plus a numerically differentiated outward normal. */
function skullPoint(theta, phi, rr) {
  const e = 0.01;
  const ph = Math.min(Math.PI - e, Math.max(e, phi));   // poles have no tangent frame
  const p = shellPoint(theta, phi, rr, new THREE.Vector3());
  const q = shellPoint(theta, ph, rr, _p0);
  shellPoint(theta + e, ph, rr, _p1).sub(q);
  shellPoint(theta, ph + e, rr, _p2).sub(q);
  const n = new THREE.Vector3().crossVectors(_p2, _p1);
  if (n.lengthSq() < 1e-18) n.set(0, phi < Math.PI / 2 ? 1 : -1, 0);
  n.normalize();
  if (n.dot(q) < 0) n.negate();
  return { p, n };
}

/**
 * Sample the sculpted skull surface. Hair uses this so the scalp shell and
 * strand roots sit exactly on the head, whatever the face shape.
 * @returns {(theta:number, phi:number)=>{p:THREE.Vector3, n:THREE.Vector3}}
 */
export function skullSampler(look) {
  const brs = brushes(look);
  const hw = look.headWidth ?? 1;
  const rr = [HR[0] * hw, HR[1], HR[2]];
  return (theta, phi) => {
    const { p, n } = skullPoint(theta, phi, rr);
    applyBrushes(p, n, brs);
    return { p, n };
  };
}

export { skullPoint };

/** Canonical head radii, exposed for hair layout. */
export const HEAD_R = HR;

/** Canonical-space UV, shared by the mesh and the texture painter. */
function uvOf(x, y, z) {
  return [
    0.5 + Math.atan2(x, z) / (Math.PI * 2),
    clamp01((y - FACE.yMin) / (FACE.yMax - FACE.yMin)),
  ];
}

/**
 * Build the head mesh (skull + lids + ears) in character space.
 * @returns {{geometry:THREE.BufferGeometry, map:THREE.Texture, eyes:Object}}
 */
export function buildHead(rig, look) {
  const { index: I, P, dims } = rig;
  const scale = dims.headScale;
  const origin = dims.headOrigin;
  // accepts either a Vector3 or an [x,y,z] triple
  const put = (p) => new THREE.Vector3(
    p.x !== undefined ? p.x : p[0],
    p.y !== undefined ? p.y : p[1],
    p.z !== undefined ? p.z : p[2]
  ).multiplyScalar(scale).add(origin);

  const B = new MeshBuilder('head');
  B.color(0xffffff).mat(0.5, 0).skin([[I.head, 1]]);

  const brs = brushes(look);
  const segU = 76, segV = 56;
  const hw = look.headWidth ?? 1;
  const rr = [HR[0] * hw, HR[1], HR[2]];

  const grid = [];
  for (let v = 0; v <= segV; v++) {
    const phi = (v / segV) * Math.PI;
    const row = [];
    for (let u = 0; u <= segU; u++) {
      const th = Math.PI + (u / segU) * Math.PI * 2;   // seam at the back of the skull
      const { p, n } = skullPoint(th, phi, rr);
      applyBrushes(p, n, brs);
      row.push(p);
    }
    grid.push(row);
  }

  // How thin the flesh is at a given canonical-space point — drives the
  // back-scatter term, so ear rims and nose wings glow red against the sun and
  // a forehead does not.
  const thicknessAt = (p) => {
    const ear = Math.exp(-(Math.pow((Math.abs(p.x) - FACE.ear[0] * hw) / 0.026, 2)
      + Math.pow((p.y - FACE.ear[1]) / 0.034, 2)
      + Math.pow((p.z - FACE.ear[2]) / 0.030, 2)));
    const nose = Math.exp(-(Math.pow(p.x / 0.020, 2)
      + Math.pow((p.y + 0.050) / 0.020, 2)
      + Math.pow((p.z - 0.094) / 0.020, 2)));
    const lip = Math.exp(-(Math.pow(p.x / 0.030, 2)
      + Math.pow((p.y + 0.079) / 0.013, 2)
      + Math.pow((p.z - 0.085) / 0.018, 2)));
    return clamp01(ear * 1.0 + nose * 0.85 + lip * 0.7);
  };

  const idx = [];
  for (let v = 0; v <= segV; v++) {
    const row = [];
    for (let u = 0; u <= segU; u++) {
      const p = grid[v][u];
      const [tu, tv] = uvOf(p.x, p.y, p.z);
      const w = put(p);
      // lips are wetter than cheeks; the whole face is glossier than the crown
      const th = thicknessAt(p);
      B.mat(0.50 - 0.16 * th, 0, th);
      row.push(B.v(w.x, w.y, w.z, u === segU ? 1 : tu, tv));
    }
    idx.push(row);
  }
  B.mat(0.5, 0, 0);
  for (let v = 0; v < segV; v++) {
    for (let u = 0; u < segU; u++) {
      B.quad(idx[v][u], idx[v][u + 1], idx[v + 1][u + 1], idx[v + 1][u]);
    }
  }
  // the jaw profile leaves an open ring under the chin — cap it (the neck
  // sweep sits inside, so this is never seen, but the mesh stays closed)
  {
    const c = put([0, -HR[1] * 1.055, -0.014]);
    const centre = B.v(c.x, c.y, c.z, 0.5, 0);
    const last = idx[segV];
    for (let u = 0; u < segU; u++) B.tri(centre, last[u + 1], last[u]);
  }

  // ---- ears --------------------------------------------------------------
  for (const sg of [1, -1]) {
    const e = FACE.ear;
    const c = put([e[0] * sg * hw * 0.97, e[1], e[2]]);
    B.group(2);
    B.mat(0.46, 0, 1);           // an ear is two sheets of skin and a wafer of cartilage
    blob(B, {
      center: [c.x, c.y, c.z], scale: [0.0092 * scale, 0.0305 * scale, 0.0192 * scale],
      rot: [0.15, sg * 0.30, sg * 0.12], segU: 12, segV: 9,
    });
    const c2 = put([e[0] * sg * hw * 0.92, e[1] - 0.004, e[2] + 0.003]);
    B.color(0xbfbfbf);
    blob(B, {
      center: [c2.x, c2.y, c2.z], scale: [0.0050 * scale, 0.0182 * scale, 0.0105 * scale],
      rot: [0.15, sg * 0.35, sg * 0.12], segU: 10, segV: 7,
    });
    B.color(0xffffff);
    B.mat(0.5, 0, 0);
    B.group(0);
  }

  // ---- eyelids + lashes --------------------------------------------------
  for (const side of ['L', 'R']) {
    const sg = side === 'L' ? 1 : -1;
    const ec = [FACE.eye[0] * sg * hw, FACE.eye[1], FACE.eye[2]];
    buildLid(B, { put, scale, ec, sg, upper: true, bone: I[`lid${side}`], head: I.head, look });
    buildLid(B, { put, scale, ec, sg, upper: false, bone: I[`lid${side}`], head: I.head, look });
    B.skin([[I[`lid${side}`], 0.85], [I.head, 0.15]]);
    buildLashes(B, { put, scale, ec, sg, look });
    B.skin([[I.head, 1]]);
  }

  const geometry = B.build();
  const map = paintFace(look, uvOf);
  return { geometry, map, origin, scale, uvOf };
}

/**
 * One eyelid: a band wrapped on a sphere slightly larger than the eyeball,
 * running from the inner canthus to the outer, with the margin dipping at both
 * corners so the opening reads as an almond rather than a circle.
 */
function buildLid(B, o) {
  const { put, scale, ec, sg, upper, bone, head, look } = o;
  const R = FACE.eyeR;
  const openU = (look.eyeOpen ?? 1) * (upper ? LID_OPEN[0] : LID_OPEN[1]);
  const cols = 14, rows = 4;
  const arc = upper ? [-1.15, 1.19] : [-1.09, 1.13];

  const pt = (a, e, rad) => {
    // a: around the vertical axis of the eye, e: elevation from the equator
    const x = Math.sin(a * sg) * Math.cos(e) * rad;
    const y = Math.sin(e) * rad;
    const z = Math.cos(a) * Math.cos(e) * rad;
    return [ec[0] + x, ec[1] + y * 1.02, ec[2] + z * 0.92];
  };

  const dark = new THREE.Color().setHex(upper ? 0x140f10 : 0x3a2620, THREE.SRGBColorSpace);
  const skinC = new THREE.Color(1, 1, 1);
  const gridIdx = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const row = [];
    for (let c = 0; c <= cols; c++) {
      const f = c / cols;
      const a = lerp(arc[0], arc[1], f);
      // margin elevation: high in the middle, dipping at the corners.
      // The two lids need *different* rest offsets: a shared +0.16 base pushed
      // the whole aperture above the gaze axis, so the iris sat behind the lower
      // lid and only a crescent of it was ever visible.
      const shape = Math.sin(Math.PI * clamp01((f - 0.02) / 0.96));
      const mBase = upper ? 0.020 : 0.300;
      const mSpan = upper ? 0.500 : 0.720;
      const margin = (upper ? 1 : -1) * (mBase + mSpan * openU * Math.pow(shape, 0.75));
      const outer = (upper ? 1 : -1) * (1.12 + 0.30 * shape);
      const e = lerp(margin, outer, smooth(t));
      const rad = R * lerp(1.045, 1.34, t * t);
      const p = pt(a, e, rad);
      const w = put(p);
      // lid margin is dark (lash line), blending to skin toward the socket;
      // the margin itself is wet, the lid skin above it is not
      B.color(skinC.clone().lerp(dark, Math.pow(1 - t, 2.2) * (upper ? 1.0 : 0.72)));
      B.mat(0.24 + 0.30 * t, 0, 0.55 * (1 - t));
      B.skin(r === rows ? [[head, 1]] : [[bone, 1 - t * 0.5], [head, t * 0.5]]);
      row.push(B.v(w.x, w.y, w.z, 0.5 + (f - 0.5) * 0.04, 0.5));
    }
    gridIdx.push(row);
  }
  B.group(upper ? 3 : 4);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (upper === (sg > 0)) B.quad(gridIdx[r][c], gridIdx[r][c + 1], gridIdx[r + 1][c + 1], gridIdx[r + 1][c]);
      else B.quad(gridIdx[r][c + 1], gridIdx[r][c], gridIdx[r + 1][c], gridIdx[r + 1][c + 1]);
    }
  }
  B.group(0).color(0xffffff);
}

/**
 * Both eyeballs as one mesh, authored around the origin of a gaze pivot placed
 * between them. Poles face +Z so the polar UV puts the iris at the front.
 */
export function buildEyes(rig, look) {
  const { dims } = rig;
  const scale = dims.headScale;
  const hw = look.headWidth ?? 1;
  const R = FACE.eyeR * scale;
  const B = new MeshBuilder('eyes');
  B.color(0xffffff).mat(0.1, 0);

  // where the iris ends and the sclera begins, in polar angle from the front
  const IRIS = 0.405;

  for (const sg of [1, -1]) {
    const cx = FACE.eye[0] * sg * hw * scale;
    const segU = 28, segV = 22;
    const rows = [];
    for (let v = 0; v <= segV; v++) {
      // pack rings toward the front pole: the cornea and limbus carry every
      // silhouette cue an eye has, the back of the ball carries none
      const phi = Math.pow(v / segV, 1.35) * Math.PI;
      const row = [];
      for (let u = 0; u <= segU; u++) {
        const th = (u / segU) * Math.PI * 2;
        // Real eye profile: a clear cornea domed ~1.1x over the iris, breaking
        // at a hard limbus into the sclera. That break is what catches a bright
        // rim and stops the eyeball reading as a painted marble.
        const q = clamp01(1 - phi / IRIS);
        const dome = 0.115 * Math.pow(q, 0.55);
        const limbus = -0.028 * Math.exp(-Math.pow((phi - IRIS) / 0.10, 2));
        const r = R * (1 + dome + limbus);
        const p = new THREE.Vector3(
          Math.sin(phi) * Math.cos(th) * r + cx,
          Math.sin(phi) * Math.sin(th) * r,
          Math.cos(phi) * r
        );
        // the cornea is wet glass, the sclera is damp tissue
        B.mat(phi < IRIS ? 0.12 : 0.30, 0);
        row.push(B.v(p.x, p.y, p.z, u / segU, phi / Math.PI));
      }
      rows.push(row);
    }
    for (let v = 0; v < segV; v++) {
      for (let u = 0; u < segU; u++) B.quad(rows[v][u], rows[v][u + 1], rows[v + 1][u + 1], rows[v + 1][u]);
    }
  }
  return { geometry: B.build() };
}

/**
 * Upper eyelashes as geometry: a fan of fine tapered ribbons rising from the
 * lid margin and flicking out at the outer canthus. A painted lash line alone
 * disappears the moment the head turns; these hold the eye's dark accent from
 * every angle and are the cheapest "this is a person" cue on the whole model.
 */
function buildLashes(B, o) {
  const { put, scale, ec, sg, look } = o;
  const R = FACE.eyeR;
  const openU = (look.eyeOpen ?? 1) * LID_OPEN[0];
  const n = 11;
  const col = new THREE.Color().setHex(look.lashColor ?? 0x0d0a0c, THREE.SRGBColorSpace);
  const arc = [-1.11, 1.15];

  const pt = (a, e, rad) => new THREE.Vector3(
    ec[0] + Math.sin(a * sg) * Math.cos(e) * rad,
    ec[1] + Math.sin(e) * rad * 1.02,
    ec[2] + Math.cos(a) * Math.cos(e) * rad * 0.92
  );

  B.group(6).color(col).mat(0.42, 0, 0);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const a = lerp(arc[0], arc[1], f);
    const shape = Math.sin(Math.PI * clamp01((f - 0.02) / 0.96));
    const margin = 0.020 + 0.500 * openU * Math.pow(shape, 0.75);
    const root = pt(a, margin, R * 1.045);
    // lashes sweep up, forward and outward, longest at the outer third
    const grow = 0.55 + 0.75 * Math.pow(clamp01((f - 0.15) / 0.85), 0.8);
    const L = R * 0.36 * grow;
    const d = new THREE.Vector3(
      Math.sin(a * sg) * 0.42 + sg * 0.30 * f,
      0.72 + 0.20 * f,
      Math.cos(a) * 0.70
    ).normalize();
    const mid = root.clone().addScaledVector(d, L * 0.5);
    // curl: the tip bends further up and away from the eye
    const tipD = d.clone().add(new THREE.Vector3(sg * 0.16, 0.34, 0.10)).normalize();
    const tip = mid.clone().addScaledVector(tipD, L * 0.55);
    const w = R * (0.019 + 0.009 * shape);
    ribbon(B, {
      points: [root, mid, tip].map((q) => put(q).toArray()),
      steps: 3,
      width: w * scale,
      thick: w * scale * 0.30,
      up: [0, 0, 1],
      taper: (t) => Math.pow(1 - t, 0.55),
    });
  }
  B.group(0).color(0xffffff).mat(0.5, 0, 0);
}

/**
 * The painted face map.
 *
 * Everything here is authored in **canonical head metres** and converted to
 * texels at the last moment. That matters more than it sounds: the head UV is a
 * cylindrical projection, so a millimetre of face is 1917 texels/m across and
 * 4302 texels/m down — better than 2:1 anisotropy. Authoring radii directly in
 * texture fractions (which is what this used to do) silently squashes every
 * feature, which is why the mouth read as three stacked ellipses and the eye
 * sockets as wide grey bars.
 *
 * The map carries what lighting cannot resolve at gameplay distance: the value
 * structure of a face. Sockets, nostrils, the vermilion border, the shadow the
 * fringe throws on the forehead.
 */
function paintFace(look, uv) {
  const S = 1024;
  // texels per metre, measured at the front of the face where the features are
  const PX = S / (0.085 * Math.PI * 2);
  const PY = S / (FACE.yMax - FACE.yMin);
  const skin = new THREE.Color().setHex(look.skin.getHex(THREE.SRGBColorSpace), THREE.SRGBColorSpace);
  const hexOf = (c) => `#${c.getHexString(THREE.SRGBColorSpace)}`;
  const rng = new Rng(look.seed || 7);
  const n = new Noise((look.seed || 7) + 11);

  const px = (p) => {
    const [u, v] = uv(p[0], p[1], p[2]);
    return [u * S, (1 - v) * S];
  };
  // canonical point -> texel, for points authored on the face plane
  const fx = (x, y) => px([x, y, 0.085 - Math.abs(x) * 2.6 * Math.abs(x)]);

  return canvasTexture(S, (ctx) => {
    ctx.fillStyle = hexOf(skin.clone().multiplyScalar(0.88));
    ctx.fillRect(0, 0, S, S);

    // large-scale tonal variation + fine mottling
    const img = ctx.getImageData(0, 0, S, S);
    const d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const f = 1 + 0.055 * n.fbm2(x * 0.012, y * 0.012, 4) + 0.024 * n.simplex2(x * 0.14, y * 0.14);
        d[i] = Math.min(255, d[i] * f);
        d[i + 1] = Math.min(255, d[i + 1] * (f * 0.99));
        d[i + 2] = Math.min(255, d[i + 2] * (f * 0.975));
      }
    }
    ctx.putImageData(img, 0, 0);

    /** Soft radial blob. `rx`/`ry` are half-widths in canonical metres. */
    const soft = (p, rx, ry, color, alpha = 1, mode = 'source-over') => {
      const [cx, cy] = px(p);
      const a = rx * PX, b = ry * PY;
      const r = Math.max(a, b);
      ctx.save();
      ctx.globalCompositeOperation = mode;
      ctx.translate(cx, cy);
      ctx.scale(a / r, b / r);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = alpha;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    /** Filled closed path through face-plane (x,y) points, cubic-smoothed. */
    const shape = (pts, style, { mode = 'source-over', alpha = 1, blur = 0 } = {}) => {
      const q = pts.map(([x, y]) => fx(x, y));
      ctx.save();
      ctx.globalCompositeOperation = mode;
      ctx.globalAlpha = alpha;
      if (blur) ctx.filter = `blur(${blur}px)`;
      ctx.fillStyle = style;
      ctx.beginPath();
      ctx.moveTo(q[0][0], q[0][1]);
      for (let i = 0; i < q.length; i++) {
        const p0 = q[i], p1 = q[(i + 1) % q.length], p2 = q[(i + 2) % q.length];
        ctx.quadraticCurveTo(p1[0], p1[1], (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    /** Stroked open curve through face-plane points. `w` in metres. */
    const stroke = (pts, style, w, { mode = 'source-over', alpha = 1, blur = 0, cap = 'round' } = {}) => {
      const q = pts.map(([x, y]) => fx(x, y));
      ctx.save();
      ctx.globalCompositeOperation = mode;
      ctx.globalAlpha = alpha;
      if (blur) ctx.filter = `blur(${blur}px)`;
      ctx.strokeStyle = style;
      ctx.lineWidth = w * PY;
      ctx.lineCap = cap;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(q[0][0], q[0][1]);
      for (let i = 1; i < q.length - 1; i++) {
        ctx.quadraticCurveTo(q[i][0], q[i][1], (q[i][0] + q[i + 1][0]) / 2, (q[i][1] + q[i + 1][1]) / 2);
      }
      ctx.lineTo(q[q.length - 1][0], q[q.length - 1][1]);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    // ---- tonal zones ------------------------------------------------------
    // A portrait painter's three bands: ochre forehead, red mid-face, blue-grey
    // jaw. Without them procedural skin is one flat plastic beige.
    soft([0, 0.058, 0.078], 0.058, 0.032, 'rgba(198,146,74,0.32)', 0.95);
    soft([0, -0.030, 0.092], 0.050, 0.030, 'rgba(190,72,52,0.34)', 1.0);
    soft([0, -0.100, 0.066], 0.048, 0.026, 'rgba(78,90,122,0.34)', 0.95);

    // warmth on cheeks, nose, ears
    const blush = look.blush || 'rgba(198,86,70,0.30)';
    soft([0.050, -0.024, 0.058], 0.030, 0.020, blush, 0.9);
    soft([-0.050, -0.024, 0.058], 0.030, 0.020, blush, 0.9);
    soft([0, -0.044, 0.099], 0.016, 0.012, blush, 0.85);
    // ears and nostril wings are two sheets of skin over nothing: always redder
    soft([0.070, -0.026, -0.004], 0.022, 0.026, 'rgba(206,88,66,0.50)', 1.0);
    soft([-0.070, -0.026, -0.004], 0.022, 0.026, 'rgba(206,88,66,0.50)', 1.0);

    // ---- occlusion --------------------------------------------------------
    const ao = (p, rx, ry, a, col = '104,68,62') => soft(p, rx, ry, `rgba(${col},${a})`, 1, 'multiply');
    // the orbit: a real socket is 40mm wide and 28mm tall, and it is the
    // strongest value on a face. Eyes read as eyes because they sit in a hole.
    ao([0.0335, -0.004, 0.070], 0.0175, 0.0115, 0.44, '116,80,76');
    ao([-0.0335, -0.004, 0.070], 0.0175, 0.0115, 0.44, '116,80,76');
    // the crease directly under the brow ridge, darker and tighter
    ao([0.0335, 0.0035, 0.076], 0.0145, 0.0050, 0.58, '88,56,56');
    ao([-0.0335, 0.0035, 0.076], 0.0145, 0.0050, 0.58, '88,56,56');
    // tear trough
    ao([0.0330, -0.0135, 0.073], 0.0120, 0.0042, 0.44, '124,80,72');
    ao([-0.0330, -0.0135, 0.073], 0.0120, 0.0042, 0.44, '124,80,72');
    // temples, jaw undercut, under the chin
    ao([0.062, 0.026, 0.048], 0.026, 0.028, 0.46);
    ao([-0.062, 0.026, 0.048], 0.026, 0.028, 0.46);
    // the hollow under the cheekbone — the single strongest age/sex cue on a
    // face after the jaw, and the thing whose absence read as "child"
    ao([0.0475, -0.0400, 0.0575], 0.0230, 0.0175, 0.42, '116,74,68');
    ao([-0.0475, -0.0400, 0.0575], 0.0230, 0.0175, 0.42, '116,74,68');
    ao([0.048, -0.074, 0.054], 0.020, 0.020, 0.44);
    ao([-0.048, -0.074, 0.054], 0.020, 0.020, 0.44);
    ao([0, -0.108, 0.030], 0.042, 0.016, 0.62);
    // brow-ridge cast shadow: the brow is a shelf and it shades the lid
    ao([0.032, 0.0085, 0.0780], 0.0210, 0.0058, 0.40, '96,64,60');
    ao([-0.032, 0.0085, 0.0780], 0.0210, 0.0058, 0.40, '96,64,60');

    // ---- nose -------------------------------------------------------------
    // bridge highlight, side planes in shadow, a lit tip
    soft([0, -0.014, 0.093], 0.005, 0.020, 'rgba(255,232,212,0.30)', 1);
    soft([0, -0.040, 0.098], 0.006, 0.008, 'rgba(255,236,218,0.34)', 1);
    ao([0.0115, -0.020, 0.086], 0.005, 0.020, 0.42, '126,84,76');
    ao([-0.0115, -0.020, 0.086], 0.005, 0.020, 0.42, '126,84,76');
    // the shadow the tip casts on the philtrum
    ao([0, -0.0575, 0.089], 0.011, 0.005, 0.72, '110,70,64');
    // nostril wings: a crease curling around each ala
    stroke([[0.0215, -0.0455], [0.0215, -0.0530], [0.0140, -0.0575]],
      'rgba(112,66,58,0.62)', 0.0022, { blur: 2 });
    stroke([[-0.0215, -0.0455], [-0.0215, -0.0530], [-0.0140, -0.0575]],
      'rgba(112,66,58,0.62)', 0.0022, { blur: 2 });
    // the openings themselves: comma-shaped, dark, tilted inward
    for (const sg of [1, -1]) {
      shape([
        [sg * 0.0055, -0.0560], [sg * 0.0110, -0.0548], [sg * 0.0135, -0.0568],
        [sg * 0.0100, -0.0588], [sg * 0.0058, -0.0582],
      ], 'rgba(48,26,26,0.80)', { blur: 1.5 });
    }
    // columella
    ao([0, -0.0565, 0.093], 0.0028, 0.0035, 0.5, '120,78,70');

    // ---- nasolabial fold + cheek plane ------------------------------------
    stroke([[0.0225, -0.0500], [0.0300, -0.0665], [0.0300, -0.0790]],
      'rgba(126,80,72,0.34)', 0.0055, { blur: 6 });
    stroke([[-0.0225, -0.0500], [-0.0300, -0.0665], [-0.0300, -0.0790]],
      'rgba(126,80,72,0.34)', 0.0055, { blur: 6 });

    // ---- mouth ------------------------------------------------------------
    // Two filled vermilion shapes with a real cupid's bow, not stacked blobs.
    // The upper lip faces down and away from the sky, so it is always the
    // darker of the two — that value break is most of what reads as a mouth.
    const lipHex = look.lip || 'rgba(158,84,80,0.55)';
    const cL = -0.0285, cR = 0.0285;          // corners
    const yC = -0.0788;                        // mouth line
    shape([
      [cL, yC + 0.0004],
      [-0.0170, -0.0724], [-0.0060, -0.0710], [0, -0.0730],
      [0.0060, -0.0710], [0.0170, -0.0724],
      [cR, yC + 0.0004],
      [0.0140, -0.0778], [0, -0.0786], [-0.0140, -0.0778],
    ], lipHex, { alpha: 1 });
    shape([
      [cL, yC + 0.0006],
      [-0.0150, -0.0800], [0, -0.0806], [0.0150, -0.0800],
      [cR, yC + 0.0006],
      [0.0165, -0.0868], [0, -0.0894], [-0.0165, -0.0868],
    ], lipHex, { alpha: 1 });
    // upper lip in its own shadow
    shape([
      [cL, yC], [-0.0170, -0.0722], [0, -0.0728], [0.0170, -0.0722], [cR, yC],
      [0.0140, -0.0776], [0, -0.0784], [-0.0140, -0.0776],
    ], 'rgba(58,26,30,0.58)', { mode: 'multiply', blur: 2 });
    // vermilion border: a fine light line where lip meets skin
    stroke([[cL, yC - 0.0022], [-0.0160, -0.0716], [0, -0.0734], [0.0160, -0.0716], [cR, yC - 0.0022]],
      'rgba(255,226,208,0.24)', 0.0016, { blur: 2 });
    // the mouth line itself
    stroke([[cL, yC], [-0.0130, -0.0796], [0, -0.0784], [0.0130, -0.0796], [cR, yC]],
      'rgba(46,18,22,0.95)', 0.0040, { blur: 0.6 });
    // wet highlight on the lower lip
    soft([0, -0.0852, 0.084], 0.008, 0.0022, 'rgba(255,224,208,0.34)', 1);
    // corner shadows and the mentolabial crease
    ao([cR, yC - 0.0004, 0.076], 0.004, 0.003, 0.62, '92,52,50');
    ao([cL, yC - 0.0004, 0.076], 0.004, 0.003, 0.62, '92,52,50');
    ao([0, -0.0930, 0.080], 0.014, 0.0035, 0.44, '124,82,74');
    soft([0, -0.1010, 0.079], 0.010, 0.006, 'rgba(255,230,214,0.16)', 1);

    // ---- brows ------------------------------------------------------------
    // A filled tapered shape, not a fat grey stroke: the brow is the darkest
    // horizontal in the upper face and it has to hold an edge.
    const browCol = look.browShadow || 'rgba(52,38,34,0.62)';
    for (const sg of [1, -1]) {
      shape([
        [sg * 0.0095, 0.0128], [sg * 0.0260, 0.0176], [sg * 0.0430, 0.0140],
        [sg * 0.0560, 0.0060], [sg * 0.0500, 0.0056],
        [sg * 0.0400, 0.0102], [sg * 0.0250, 0.0128], [sg * 0.0105, 0.0086],
      ], browCol, { blur: 3 });
    }

    // ---- eyes -------------------------------------------------------------
    for (const sg of [1, -1]) {
      // The painted lash line, crease and waterline are authored around the lid
      // geometry; when the palpebral fissure narrowed to adult proportions these
      // strokes kept their old span and read as smeared eyeliner reaching the
      // temple. Remap them onto the actual aperture instead of restating every
      // coordinate.
      const EX = 0.60, EY = 0.70, C = 0.0335;
      const ep = (x0, y0) => {
        const x = C + (x0 - C) * EX;
        const y = -0.006 + (y0 + 0.006) * EY;
        return px([sg * x, y, 0.079 - Math.abs(x - 0.033) * 0.35]);
      };
      ctx.save();
      ctx.lineCap = 'round';
      // a soft dark bed so the hard line reads as sitting in a socket
      ctx.strokeStyle = 'rgba(52,30,34,0.50)';
      ctx.lineWidth = 0.0060 * PY;
      ctx.beginPath();
      ctx.moveTo(...ep(0.0140, -0.0050));
      ctx.quadraticCurveTo(...ep(0.0335, 0.0042), ...ep(0.0525, -0.0030));
      ctx.stroke();
      // the lash line
      ctx.strokeStyle = look.lash || 'rgba(14,10,12,0.97)';
      ctx.lineWidth = 0.0026 * PY;
      ctx.beginPath();
      ctx.moveTo(...ep(0.0140, -0.0050));
      ctx.quadraticCurveTo(...ep(0.0335, 0.0042), ...ep(0.0525, -0.0030));
      ctx.stroke();
      // outer flick
      ctx.lineWidth = 0.0015 * PY;
      ctx.beginPath();
      ctx.moveTo(...ep(0.0470, -0.0012));
      ctx.lineTo(...ep(0.0590, -0.0014));
      ctx.stroke();
      // the lid crease — the fold that gives an eye its shape
      ctx.strokeStyle = 'rgba(96,60,58,0.40)';
      ctx.lineWidth = 0.0026 * PY;
      ctx.beginPath();
      ctx.moveTo(...ep(0.0155, 0.0032));
      ctx.quadraticCurveTo(...ep(0.0340, 0.0098), ...ep(0.0520, 0.0024));
      ctx.stroke();
      // lower lash and the wet line under it
      ctx.strokeStyle = 'rgba(62,36,36,0.55)';
      ctx.lineWidth = 0.0012 * PY;
      ctx.beginPath();
      ctx.moveTo(...ep(0.0165, -0.0098));
      ctx.quadraticCurveTo(...ep(0.0340, -0.0158), ...ep(0.0500, -0.0072));
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,230,216,0.20)';
      ctx.lineWidth = 0.0010 * PY;
      ctx.beginPath();
      ctx.moveTo(...ep(0.0180, -0.0112));
      ctx.quadraticCurveTo(...ep(0.0340, -0.0170), ...ep(0.0490, -0.0086));
      ctx.stroke();
      ctx.restore();
    }

    // ---- beard shadow -----------------------------------------------------
    if (look.stubble) {
      ctx.save();
      const [jx, jy] = px([0, -0.086, 0.077]);
      // a soft field first — sparse individual dots read as dirt, not stubble
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = look.stubble * 0.85;
      const g = ctx.createRadialGradient(jx, jy, 0, jx, jy, 0.036 * PY);
      g.addColorStop(0, look.stubbleColor || '#4b3a30');
      g.addColorStop(0.45, look.stubbleColor || '#4b3a30');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(jx, jy); ctx.scale(1.6, 1); ctx.translate(-jx, -jy);
      ctx.beginPath(); ctx.arc(jx, jy, 0.036 * PY, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // then the grain on top
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.min(0.55, look.stubble * 1.1);
      ctx.fillStyle = look.stubbleColor || '#4b3a30';
      for (let i = 0; i < 24000; i++) {
        const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next());
        const x = jx + Math.cos(a) * r * 0.058 * PY * 1.6;
        const y = jy + Math.sin(a) * r * 0.036 * PY - 0.008 * PY;
        if (rng.next() > (1 - r) * 0.9) continue;
        ctx.fillRect(x, y, 1.0, 1.0);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // ---- freckles ---------------------------------------------------------
    if (look.freckles) {
      ctx.save();
      const [fx0, fy0] = px([0, -0.030, 0.092]);
      ctx.fillStyle = look.freckleColor || 'rgba(150,88,58,0.55)';
      for (let i = 0; i < 320; i++) {
        const x = fx0 + rng.gauss(0, 0.028) * PY * 1.6;
        const y = fy0 + rng.gauss(0, 0.011) * PY;
        const r = rng.range(0.9, 2.2);
        ctx.globalAlpha = rng.range(0.22, 0.7);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // ---- scar -------------------------------------------------------------
    if (look.scar) {
      ctx.save();
      const s1 = px(look.scar.from), s2 = px(look.scar.to);
      ctx.strokeStyle = look.scar.color || 'rgba(148,96,84,0.85)';
      ctx.lineWidth = look.scar.width || 5;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,225,215,0.5)';
      ctx.lineWidth = (look.scar.width || 5) * 0.4;
      ctx.beginPath(); ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]); ctx.stroke();
      ctx.restore();
    }

    // ---- fringe shadow ----------------------------------------------------
    // hair throws a real shadow across the forehead; without it the hairstyle
    // sits on the skull like a wig on a stand
    if (look.hair) {
      const fs = look.fringeShadow ?? 0.55;
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const [, hy] = px([0, 0.048, 0.082]);
      const g = ctx.createLinearGradient(0, hy - 0.030 * PY, 0, hy + 0.040 * PY);
      g.addColorStop(0, `rgba(58,40,44,${fs})`);
      g.addColorStop(0.5, `rgba(96,70,68,${fs * 0.5})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, hy - 0.030 * PY, S, 0.070 * PY);
      ctx.restore();
    }
  }, { repeat: 1 });
}
