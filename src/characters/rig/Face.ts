import * as THREE from 'three';
import { MeshBuilder, applyBrushes, expandMirrors, blob, ribbon, clamp01, smooth, lerp } from './Geo.ts';
import { Rng } from '../../util/Rng.ts';
import { Noise } from '../../util/Noise.ts';

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
export const LID_OPEN = [0.76, 0.62];

/**
 * Eye geometry constants, shared by the lids, the lashes, the globe and the
 * cornea shader in `Materials.js`. They are one system: if the lid shell rides
 * inside the corneal dome the cornea pokes through the closed lid and renders
 * as a bright white slab above and below the iris, and if the shader's iris
 * angle disagrees with the geometric limbus the limbal ring lands on flat
 * sclera. Both of those were happening.
 */
export const EYE = {
  /** Half-angle of the iris measured from the gaze axis. */
  iris: 0.500,
  /** How far the cornea domes over the iris, as a fraction of globe radius. */
  dome: 0.072,
  /** Radius of the lid shell at its margin, as a fraction of globe radius. */
  lidR: 1.105,
  /** Azimuthal span of the palpebral fissure: inner canthus .. outer canthus. */
  arc: [-1.02, 1.30],
  /** Extra x-spread at the canthi — a real fissure is wider than the globe. */
  canthusSpread: 0.30,
};

/**
 * Elevation of a lid margin at fissure fraction `f` (0 = inner canthus).
 *
 * The two lids must **meet** at both canthi. The lower lid used to carry a
 * constant 0.30 rad rest offset, so a 17-degree slot of bare sclera ran right
 * through both corners of every eye — which is the "blank white bead" the far
 * eye renders as in any three-quarter frame, and most of the startled read
 * head-on. Now both lids run to a hairline at f=0 and f=1 and the aperture is
 * a real almond: the upper lid peaks slightly nasal of centre, the lower lid
 * troughs slightly temporal of it.
 */
export function lidMargin(f: any, upper: any, openU: any) {
  const peak = upper ? 0.44 : 0.60;
  // a cosine lobe skewed toward `peak`, zero at both canthi
  const g = f < peak ? f / peak : (1 - f) / (1 - peak);
  const shape = Math.sin(Math.PI * 0.5 * clamp01(g));
  const lift = upper ? 0.545 : 0.700;
  return (upper ? 1 : -1) * (0.012 + lift * openU * Math.pow(shape, 0.72));
}

/**
 * The value the painted face texture and the body's vertex colour both start
 * from, as a multiplier on `look.skin`.
 *
 * These were 0.88 and 1.0 respectively, i.e. the face was 12% darker than the
 * neck it sits on — a hard tonal break running along the jaw in every frame,
 * which no amount of normal-map or roughness matching can hide. They are one
 * number now, and `Body.js` reads it from here.
 */
export const SKIN_BASE = 0.88;

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

function brushes(look: any) {
  const jaw = look.jaw ?? 0;          // -1 fine .. +1 square/heavy
  const cheek = look.cheek ?? 0;
  const nose = look.nose ?? 0;
  const brow = look.brow ?? 0;
  const b: any[] = [];
  const add = (o: any) => b.push(o);

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
  // Nasion. The single deepest point of the facial profile, at eye level
  // between the two orbits: the glabella above it comes forward, the nasal
  // bridge below it comes forward, and the notch between them is what makes a
  // profile read as a face rather than as a wedge. Without it the forehead and
  // the nose are one straight plane all the way from hairline to tip, which is
  // exactly what every `*_profile` frame showed.
  add({ p: [0, 0.0015, 0.0865], r: [0.0145, 0.0115, 0.030], amt: -0.0082, dir: [0, 0, 1] });
  add({ p: [0.049, 0.010, 0.067], r: [0.028, 0.020, 0.042], amt: 0.0045, dir: 'normal', mirror: true });
  // shadowed hollow directly under the brow
  add({ p: [0.033, 0.0035, 0.078], r: [0.036, 0.009, 0.040], amt: -0.0055, dir: [0, 0, 1], mirror: true });

  // Eye sockets.
  //
  // These three brushes stack, and they used to stack to **-46 mm** at the
  // aperture centre. The unsculpted skull sits at z = 86 mm there and the lid
  // margin at z = 75 mm, so the skin only has to fall ~12 mm for the aperture
  // to open at all — everything past that is a crater that drops the cheek
  // behind the entire eye assembly, and the lid shell then hangs in front of
  // the face as a pair of skin-coloured buckets. That, not the iris, is what
  // made every closeup in the game read as a doll with goggles on.
  //
  // 25 mm total: the socket depth *is* the aperture size, because the skull is
  // a closed shell and the eye only shows where the skull falls behind the lid
  // margin. Six millimetres of clearance behind the margin is an open, adult
  // palpebral fissure; two is a squint; forty is goggles.
  add({ p: [0.0335, -0.008, 0.078], r: [0.036, 0.024, 0.046], amt: -0.0300, dir: [0, 0, 1], mirror: true });
  add({ p: [0.0335, -0.006, 0.072], r: [0.026, 0.018, 0.040], amt: -0.0110, dir: [0, 0, 1], mirror: true });
  add({ p: [0.0150, -0.004, 0.072], r: [0.017, 0.020, 0.030], amt: -0.0055, dir: [0, 0, 1], mirror: true });
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
  add({ p: [0, -0.1075, 0.0735], r: [0.032, 0.026, 0.040], amt: 0.0200 + 0.009 * jaw, dir: [0, 0.06, 1] });
  // mental tubercles — a chin is a shelf with two corners, not a cone. One
  // central bump is what made every chin in the cast come to a point.
  add({ p: [0.0165, -0.1035, 0.0705], r: [0.0135, 0.0155, 0.026], amt: 0.0090 + 0.004 * jaw, dir: [0, 0.05, 1], mirror: true });
  // mandible: a ramus block plus an undercut that carves the jawline edge
  add({ p: [0.064, -0.056, -0.004], r: [0.028, 0.034, 0.052], amt: 0.008 + 0.014 * jaw, dir: 'normal', mirror: true });
  // gonial angle — the corner where the ramus turns forward into the body of
  // the mandible. Without it the lower face is a rounded egg and the character
  // reads as a child no matter what the rest of the sculpt does.
  add({ p: [0.0605, -0.0800, 0.0075], r: [0.0165, 0.0165, 0.026], amt: 0.0135 + 0.010 * jaw, dir: 'normal', mirror: true });
  add({ p: [0.0575, -0.0915, 0.0245], r: [0.020, 0.0130, 0.030], amt: 0.0068 + 0.008 * jaw, dir: 'normal', mirror: true });
  add({ p: [0.054, -0.078, 0.038], r: [0.034, 0.026, 0.054], amt: 0.004 + 0.008 * jaw, dir: 'normal', mirror: true });
  // Body of the mandible: the run from the gonial angle forward to the chin.
  // There was nothing here, so the lower face went straight from the jaw corner
  // to the chin point with a hollow between them and the profile lost its whole
  // lower third.
  add({ p: [0.0400, -0.0975, 0.0500], r: [0.0280, 0.0140, 0.0300], amt: 0.0105 + 0.008 * jaw, dir: 'normal', mirror: true });
  // The undercut below the jawline. At r_z 0.062 centred on z = 0.030 it reached
  // z = 0.092 — past the chin — and took the mandible body out with it; it now
  // cuts behind and below the jaw only.
  add({ p: [0.050, -0.1030, 0.0180], r: [0.046, 0.028, 0.0480], amt: -0.021 + 0.005 * jaw, dir: 'normal', mirror: true });
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
function profileW(yn: any) {
  if (yn >= 0) return Math.sqrt(Math.max(0, 1 - yn * yn));
  const a = Math.min(1, Math.abs(yn) / 1.055);
  return Math.pow(Math.max(0, 1 - Math.pow(a, 2.6)), 0.46);
}

/** Un-sculpted skull surface point for a spherical coordinate. */
function shellPoint(theta: any, phi: any, rr: any, out: any) {
  const yn = Math.cos(phi);
  const w = profileW(yn);
  return out.set(w * Math.sin(theta) * rr[0], yn * rr[1], w * Math.cos(theta) * rr[2]);
}

const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3();

/** Surface point plus a numerically differentiated outward normal. */
function skullPoint(theta: any, phi: any, rr: any) {
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
 */
export function skullSampler(look: any): (theta:number, phi:number)=>{p:THREE.Vector3, n:THREE.Vector3} {
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
function uvOf(x: any, y: any, z: any) {
  return [
    0.5 + Math.atan2(x, z) / (Math.PI * 2),
    clamp01((y - FACE.yMin) / (FACE.yMax - FACE.yMin)),
  ];
}

/**
 * Build the head mesh (skull + lids + ears) in character space.
 */
export function buildHead(rig: any, look: any): {geometry:THREE.BufferGeometry, map:THREE.Texture, eyes:any, origin?: any, scale?: any, uvOf?: any } {
  const { index: I, dims } = rig;
  const scale = dims.headScale;
  const origin = dims.headOrigin;
  // accepts either a Vector3 or an [x,y,z] triple
  const put = (p: any) => new THREE.Vector3(
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
  const thicknessAt = (p: any) => {
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
  // Two nested blobs is a mitten for the side of the head. An ear reads at any
  // distance because of exactly three ridges: the rolled outer rim (helix), the
  // Y-shaped ridge inside it (antihelix), and the flap over the canal (tragus).
  // Without them the profile has a bump where an ear should be, which is worse
  // than nothing because the eye goes looking for the detail and finds a lump.
  for (const sg of [1, -1]) {
    const e = FACE.ear;
    const ex = e[0] * sg * hw;
    const c = put([ex * 0.97, e[1], e[2]]);
    // Every piece of the ear pins to one texel of the face map — the ear's own.
    // A blob whose UV spans 0..1 samples the whole painted face, so the old ear
    // wore the lips and the nostrils and read as a mottled red lump.
    const eUV = uvOf(ex, e[1], e[2]);
    B.group(2);
    // An ear is two sheets of skin and a wafer of cartilage — but a *thickness*
    // of 1 is the maximum the subsurface term takes, and the whole ear pins to
    // one texel, so it had no internal value break at all and rendered as a
    // uniform back-lit pink smear with the helix and antihelix invisible on it.
    // Half the thickness, and the plate carries its own darker tone so the rims
    // have something to stand out from.
    B.mat(0.46, 0, 0.5);
    B.color(0xcdb4a6);
    // the auricular plate — the sheet the ridges sit on
    blob(B, {
      center: [c.x, c.y, c.z], scale: [0.0080 * scale, 0.0305 * scale, 0.0192 * scale],
      rot: [0.15, sg * 0.30, sg * 0.12], segU: 12, segV: 9, uv: eUV,
    });
    B.color(0xffffff);
    // concha: the bowl in front of the canal, in shadow at almost every angle
    const c2 = put([ex * 1.02, e[1] - 0.004, e[2] + 0.003]);
    // the concha is a bowl and it is in shadow from every angle a head is seen at
    B.color(0x8e8078);
    blob(B, {
      center: [c2.x, c2.y, c2.z], scale: [0.0046 * scale, 0.0170 * scale, 0.0098 * scale],
      rot: [0.15, sg * 0.35, sg * 0.12], segU: 10, segV: 7, uv: eUV,
    });
    B.color(0xffffff);

    // a ridge, authored in the ear's own (y, z) plane and swept as a ribbon
    const ridge = (a0: any, a1: any, ry: any, rz: any, cy: any, cz: any, out: any, wid: any, n: any) => {
      const pts = [];
      for (let k = 0; k <= n; k++) {
        const a = lerp(a0, a1, k / n);
        // the rim stands proudest at the top of its arc and folds back in at
        // both ends, which is what makes it read as *rolled*
        const bulge = out * Math.sin(Math.PI * (0.18 + 0.82 * (k / n)));
        pts.push(put([
          ex * (0.985 + bulge),
          e[1] + cy + Math.cos(a) * ry,
          e[2] + cz + Math.sin(a) * rz,
        ]).toArray());
      }
      ribbon(B, {
        points: pts, steps: n, sides: 6, uv: eUV,
        width: wid * scale, thick: wid * 0.85 * scale,
        up: [sg, 0, 0],
        taper: (t: any) => 0.42 + 0.58 * Math.sin(Math.PI * Math.pow(t, 0.9)),
      });
    };
    // Helix — front-top, over the crown of the ear, down the back to the lobe.
    // `out` is a fraction of `ex`, and the plate is 8 mm half-thick on a 72 mm
    // `ex`, i.e. 0.11 of it: at out=0.055 the rolled rim was *inside* the plate
    // it is supposed to roll over, so the ear rendered as a smooth almond with
    // no rim, no Y and no canal at any distance. Both ridges now clear the
    // plate.
    ridge(1.02, -2.55, 0.0282, 0.0176, 0.0000, -0.0010, 0.150, 0.0023, 11);
    // antihelix — the inner Y, set back from the rim and shallower
    ridge(0.72, -1.90, 0.0178, 0.0102, -0.0016, 0.0026, 0.118, 0.0018, 9);
    // tragus — the flap over the canal, pointing back into the concha
    const tg = put([ex * 1.045, e[1] - 0.0055, e[2] + 0.0135]);
    blob(B, {
      center: [tg.x, tg.y, tg.z], scale: [0.0042 * scale, 0.0062 * scale, 0.0032 * scale],
      rot: [0, sg * 0.5, 0], segU: 8, segV: 6, uv: eUV,
    });
    // lobe — a soft fleshy ball, no cartilage, so it is rounder than the rim
    const lb = put([ex * 1.035, e[1] - 0.0296, e[2] + 0.0026]);
    blob(B, {
      center: [lb.x, lb.y, lb.z], scale: [0.0062 * scale, 0.0075 * scale, 0.0068 * scale],
      rot: [0, sg * 0.25, 0], segU: 8, segV: 6, uv: eUV,
    });
    B.mat(0.5, 0, 0);
    B.group(0);
  }

  // ---- eyelids + lashes --------------------------------------------------
  for (const side of ['L', 'R']) {
    const sg = side === 'L' ? 1 : -1;
    const ec = [FACE.eye[0] * sg * hw, FACE.eye[1], FACE.eye[2]];
    const onSkull = skinSnap(look, hw);
    const lo = { put, scale, ec, sg, bone: I[`lid${side}`], head: I.head, look, onSkull, uv: uvOf };
    buildLid(B, { ...lo, upper: true });
    buildLid(B, { ...lo, upper: false });
    B.skin([[I[`lid${side}`], 0.85], [I.head, 0.15]]);
    buildLashes(B, { put, scale, ec, sg, look });
    B.skin([[I.head, 1]]);
  }

  const geometry = B.build();
  const map = paintFace(look, uvOf);
  return { geometry, map, origin, scale, uvOf };
}

/**
 * Project a canonical point onto the sculpted skull surface along its own
 * direction from the head centre.
 *
 * The eyelid band has to *end on the face*. Ending it on a sphere around the
 * eyeball instead — which is what it did — leaves a free edge whose position
 * depends entirely on how deep the socket brushes happen to cut, so any change
 * to the sculpt opens a lip of skin-coloured shell floating in front of the
 * cheek. Snapping the outer row to the skull makes the join unconditional.
 *
 * @param hw head-width multiplier
 */
function skinSnap(look: any, hw: number): (p:number[]) => number[] {
  const sample = skullSampler(look);
  const rr = [HR[0] * hw, HR[1], HR[2]];
  return (p) => {
    const theta = Math.atan2(p[0] / rr[0], p[2] / rr[2]);
    const phi = Math.acos(Math.max(-1, Math.min(1, p[1] / rr[1])));
    const { p: q, n } = sample(theta, phi);
    return q.addScaledVector(n, 0.0006).toArray();
  };
}

/**
 * A point on the eye's local sphere.
 *
 * `a` is azimuth from the gaze axis, `e` elevation from the equator, `rad` the
 * radius. `f` is the fissure fraction, used to spread the canthi off the sphere
 * — a real palpebral fissure is ~30 mm across on a 24 mm globe, so its corners
 * physically cannot lie on the globe and a pure spherical lid always reads too
 * round and too small.
 */
function eyePoint(ec: any, sg: any, a: any, e: any, rad: any, f: any) {
  const spread = f === undefined ? 1
    : 1 + EYE.canthusSpread * Math.pow(Math.abs(f * 2 - 1), 2.2);
  const x = Math.sin(a * sg) * Math.cos(e) * rad * spread;
  const y = Math.sin(e) * rad;
  const z = Math.cos(a) * Math.cos(e) * rad;
  return [ec[0] + x, ec[1] + y * 1.02, ec[2] + z * 0.92];
}

/**
 * One eyelid: a band wrapped on a sphere slightly larger than the eyeball,
 * running from the inner canthus to the outer, with the margin dipping at both
 * corners so the opening reads as an almond rather than a circle.
 */
function buildLid(B: any, o: any) {
  const { put, ec, sg, upper, bone, head, look, onSkull, uv } = o;
  const R = FACE.eyeR;
  const openU = (look.eyeOpen ?? 1) * (upper ? LID_OPEN[0] : LID_OPEN[1]);
  const cols = 20, rows = 5;
  const arc = EYE.arc;

  const pt = (a: any, e: any, rad: any, f: any) => eyePoint(ec, sg, a, e, rad, f);

  const dark = new THREE.Color().setHex(upper ? 0x140f10 : 0x3a2620, THREE.SRGBColorSpace);
  const skinC = new THREE.Color(1, 1, 1);
  const gridIdx = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const row = [];
    for (let c = 0; c <= cols; c++) {
      const f = c / cols;
      const a = lerp(arc[0], arc[1], f);
      const shape = Math.abs(lidMargin(f, upper, openU)) / Math.max(1e-4, Math.abs(lidMargin(0.5, upper, 1)));
      const margin = lidMargin(f, upper, openU);
      const outer = (upper ? 1 : -1) * (1.02 + 0.42 * shape);
      const e = lerp(margin, outer, smooth(t));
      // The lid rides *outside* the corneal dome. At 1.045 it rode inside it,
      // so the cornea burst through the closed part of the lid and rendered as
      // a bright white slab above and below the iris on every face in the game.
      const rad = R * lerp(EYE.lidR, 1.36, t * t);
      // the margin itself is a rolled edge: give it thickness rather than
      // letting the band end on a zero-width knife
      let p = pt(a, e, rad, r === 0 ? f : undefined);
      // the outermost two rows blend onto the sculpted skull, so the lid always
      // merges into the face instead of ending on a free edge in front of it
      if (r >= rows - 1 && onSkull) {
        const q = onSkull(p);
        const k = r === rows ? 1 : 0.55;
        p = [lerp(p[0], q[0], k), lerp(p[1], q[1], k), lerp(p[2], q[2], k)];
      }
      const w = put(p);
      // lid margin is dark (lash line), blending to skin toward the socket;
      // the margin itself is wet, the lid skin above it is not
      B.color(skinC.clone().lerp(dark, Math.pow(1 - t, 3.0) * (upper ? 0.50 : 0.24)));
      B.mat(0.24 + 0.30 * t, 0, 0.55 * (1 - t));
      B.skin(r === rows ? [[head, 1]] : [[bone, 1 - t * 0.5], [head, t * 0.5]]);
      // The lid takes the **real face UV**, not a fixed (0.5, 0.5). Pinned to
      // one texel it sampled mid-cheek, so both lids rendered as pale plates
      // laid over the painted socket — the exact thing that made the eye look
      // like a hole cut in a mask. With the true UV the painted lash line,
      // crease, waterline and socket occlusion all land on the lid itself.
      const [tu, tv] = uv(p[0], p[1], p[2]);
      row.push(B.v(w.x, w.y, w.z, tu, tv));
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

  // ---- waterline ---------------------------------------------------------
  // The wet strip of conjunctiva on the inside of the lower lid margin. It is
  // two millimetres of bright, near-white, very glossy tissue and it is the
  // single cue that separates an eye set into a face from a bead glued onto
  // one — a painted line cannot do it because it dies the moment the head
  // turns and the lid margin occludes it.
  if (!upper) {
    const wl = [];
    for (let k = 0; k <= 1; k++) {
      const row = [];
      for (let c = 0; c <= cols; c++) {
        const f = c / cols;
        const a = lerp(arc[0], arc[1], f);
        const m = lidMargin(f, upper, openU);
        // step inward (toward the globe) and up over the margin roll
        const e = m + 0.055 * k * Math.min(1, Math.abs(m) / 0.14);
        const p = pt(a, e, R * lerp(EYE.lidR, 1.012, k), k === 0 ? f : undefined);
        const w = put(p);
        B.color(k === 0 ? 0xe8dcd4 : 0xfffaf4);
        B.mat(0.06, 0, 0.2);
        B.skin([[bone, 0.85], [head, 0.15]]);
        const [tu, tv] = uv(p[0], p[1], p[2]);
        row.push(B.v(w.x, w.y, w.z, tu, tv));
      }
      wl.push(row);
    }
    for (let c = 0; c < cols; c++) {
      if (sg > 0) B.quad(wl[0][c], wl[0][c + 1], wl[1][c + 1], wl[1][c]);
      else B.quad(wl[0][c + 1], wl[0][c], wl[1][c], wl[1][c + 1]);
    }

    // ---- caruncle --------------------------------------------------------
    // The pink fleshy wedge in the inner canthus. Without it the two lids meet
    // at a geometric point and the inner corner reads as a seam in a mask.
    // `EYE.arc[0]` is the nasal end — `eyePoint` takes `sin(a * sg)`, and at
    // a = arc[0] that lands on the midline side of the globe for both signs, so
    // fissure fraction 0.05 is the inner canthus on both eyes. What was wrong
    // was the *size and standoff*: at 3.4 x 4.7 mm sitting a millimetre proud of
    // the lid shell it rendered as a dark bead stuck to the front of the eye at
    // 0.4 m. A caruncle is a 2 mm wedge tucked between the lid margins.
    const cf = 0.055;
    const ca = lerp(arc[0], arc[1], cf);
    const c0 = pt(ca, -0.012, R * 1.005, 0.03);
    const [cu, cv] = uv(c0[0], c0[1], c0[2]);
    B.group(4);
    B.color(0xe7b3a4).mat(0.30, 0, 0.55).skin([[head, 1]]);
    const cs = [R * 0.105, R * 0.150, R * 0.085];
    const cr = [];
    for (let v = 0; v <= 5; v++) {
      const ph = (v / 5) * Math.PI;
      const rw = [];
      for (let u = 0; u <= 7; u++) {
        const th = (u / 7) * Math.PI * 2;
        const q = put([
          c0[0] + Math.sin(ph) * Math.sin(th) * cs[0] * sg,
          c0[1] + Math.cos(ph) * cs[1],
          c0[2] + Math.sin(ph) * Math.cos(th) * cs[2],
        ]);
        rw.push(B.v(q.x, q.y, q.z, cu, cv));
      }
      cr.push(rw);
    }
    for (let v = 0; v < 5; v++) {
      for (let u = 0; u < 7; u++) B.quad(cr[v][u], cr[v][u + 1], cr[v + 1][u + 1], cr[v + 1][u]);
    }
    B.color(0xffffff).mat(0.5, 0, 0);
  }
  B.group(0).color(0xffffff);
}

/**
 * Both eyeballs as one mesh, authored around the origin of a gaze pivot placed
 * between them. Poles face +Z so the polar UV puts the iris at the front.
 */
export function buildEyes(rig: any, look: any) {
  const { dims } = rig;
  const scale = dims.headScale;
  const hw = look.headWidth ?? 1;
  const R = FACE.eyeR * scale;
  const B = new MeshBuilder('eyes');
  B.color(0xffffff).mat(0.1, 0);

  // where the iris ends and the sclera begins, in polar angle from the front.
  // 0.405 rad put an 18 mm iris on a 24 mm globe: too small by a third, which
  // is most of why the cast read wall-eyed. 0.500 rad is the real 11.7/24 mm.
  const IRIS = EYE.iris;

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
        // The dome has to stay inside `EYE.lidR` or the cornea bursts through
        // the closed lid. At 0.115 it did, on every character, all the time.
        const dome = EYE.dome * Math.pow(q, 0.55);
        const limbus = -0.022 * Math.exp(-Math.pow((phi - IRIS) / 0.09, 2));
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
function buildLashes(B: any, o: any) {
  const { put, scale, ec, sg, look } = o;
  const R = FACE.eyeR;
  const openU = (look.eyeOpen ?? 1) * LID_OPEN[0];
  const n = 17;
  const col = new THREE.Color().setHex(look.lashColor ?? 0x0d0a0c, THREE.SRGBColorSpace);
  const arc = EYE.arc;

  const pt = (a: any, e: any, rad: any) => new THREE.Vector3(
    ec[0] + Math.sin(a * sg) * Math.cos(e) * rad,
    ec[1] + Math.sin(e) * rad * 1.02,
    ec[2] + Math.cos(a) * Math.cos(e) * rad * 0.92
  );

  B.group(6).color(col).mat(0.42, 0, 0);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const a = lerp(arc[0], arc[1], f);
    const margin = lidMargin(f, true, openU);
    const shape = clamp01(margin / 0.42);
    const root = pt(a, margin, R * (EYE.lidR - 0.005));
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
      taper: (t: any) => Math.pow(1 - t, 0.55),
    });
  }
  B.group(0).color(0xffffff).mat(0.5, 0, 0);
}

/**
 * Contrast-preserving mip chain.
 *
 * This is the whole reason faces used to dissolve into a beige smear at
 * gameplay range. A face is 20–60 px tall at 4–8 m, which lands on mip 4–5;
 * a plain box filter averages the lash line, the socket and the brow into the
 * surrounding skin and the head arrives at the screen with no features left.
 *
 * Each level instead takes the *most deviant* of its four contributors and
 * mixes it back over the average, so a two-texel-wide black lash line survives
 * as a dark texel instead of a 12% grey tint. Mean luminance is restored per
 * level, so the face does not drift dark with distance — only more contrasty.
 */
function contrastMips(canvas: any) {
  const mips = [canvas];
  let src = canvas;
  let level = 0;
  while (src.width > 1 && src.height > 1) {
    level++;
    const sw = src.width, sh = src.height;
    const w = sw >> 1, h = sh >> 1;
    const sd = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
    const dst = document.createElement('canvas');
    dst.width = w; dst.height = h;
    const dctx = dst.getContext('2d', { willReadFrequently: true });
    const out = dctx!.createImageData(w, h);
    const od = out.data;
    // deviation is pushed harder the further down the chain we go: at mip 5 a
    // feature owns a single texel and nothing but the extreme is left of it
    const k = Math.min(0.66, 0.15 * level);
    let sumIn = 0, sumOut = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a0 = ((y * 2) * sw + x * 2) * 4;
        const a1 = a0 + 4;
        const a2 = a0 + sw * 4;
        const a3 = a2 + 4;
        const ar = (sd[a0] + sd[a1] + sd[a2] + sd[a3]) * 0.25;
        const ag = (sd[a0 + 1] + sd[a1 + 1] + sd[a2 + 1] + sd[a3 + 1]) * 0.25;
        const ab = (sd[a0 + 2] + sd[a1 + 2] + sd[a2 + 2] + sd[a3 + 2]) * 0.25;
        const al = ar * 0.30 + ag * 0.59 + ab * 0.11;
        let br = ar, bg = ag, bb = ab, bd = -1;
        for (let s = 0; s < 4; s++) {
          const i = s === 0 ? a0 : s === 1 ? a1 : s === 2 ? a2 : a3;
          const l = sd[i] * 0.30 + sd[i + 1] * 0.59 + sd[i + 2] * 0.11;
          const d = Math.abs(l - al);
          if (d > bd) { bd = d; br = sd[i]; bg = sd[i + 1]; bb = sd[i + 2]; }
        }
        const o = (y * w + x) * 4;
        od[o] = ar + (br - ar) * k;
        od[o + 1] = ag + (bg - ag) * k;
        od[o + 2] = ab + (bb - ab) * k;
        od[o + 3] = 255;
        sumIn += al;
        sumOut += od[o] * 0.30 + od[o + 1] * 0.59 + od[o + 2] * 0.11;
      }
    }
    const g = sumOut > 1e-4 ? sumIn / sumOut : 1;
    if (Math.abs(g - 1) > 0.002) {
      for (let i = 0; i < od.length; i += 4) {
        od[i] = Math.min(255, od[i] * g);
        od[i + 1] = Math.min(255, od[i + 1] * g);
        od[i + 2] = Math.min(255, od[i + 2] * g);
      }
    }
    dctx!.putImageData(out, 0, 0);
    mips.push(dst);
    src = dst;
  }
  return mips;
}

/** Canvas texture whose mip chain keeps facial value structure (see above). */
function faceTexture(size: any, draw: any) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d', { willReadFrequently: true }), size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 16;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.mipmaps = contrastMips(cv);
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
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
function paintFace(look: any, uv: any) {
  const S = 1024;
  // texels per metre, measured at the front of the face where the features are
  const PX = S / (0.085 * Math.PI * 2);
  const PY = S / (FACE.yMax - FACE.yMin);
  const skin = new THREE.Color().setHex(look.skin.getHex(THREE.SRGBColorSpace), THREE.SRGBColorSpace);
  // (the base tone itself is applied below via SKIN_BASE, shared with Body.js)
  const hexOf = (c: any) => `#${c.getHexString(THREE.SRGBColorSpace)}`;
  const rng = new Rng(look.seed || 7);
  const n = new Noise((look.seed || 7) + 11);

  const px = (p: any) => {
    const [u, v] = uv(p[0], p[1], p[2]);
    return [u * S, (1 - v) * S];
  };
  // canonical point -> texel, for points authored on the face plane
  const fx = (x: any, y: any) => px([x, y, 0.085 - Math.abs(x) * 2.6 * Math.abs(x)]);

  return faceTexture(S, (ctx: any) => {
    ctx.fillStyle = hexOf(skin.clone().multiplyScalar(SKIN_BASE));
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
    const soft = (p: any, rx: any, ry: any, color: any, alpha = 1, mode = 'source-over') => {
      const [cx, cy] = px(p);
      const a = rx * PX, b = ry * PY;
      const r = Math.max(a, b);
      ctx.save();
      ctx.globalCompositeOperation = mode;
      ctx.translate(cx, cy);
      ctx.scale(a / r, b / r);
      // A linear alpha ramp reads as a cone — a visible disc edge, and a face
      // covered in them looks bruised. A smoothstep-ish ramp dissolves.
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, color);
      g.addColorStop(0.35, color.replace(/([\d.]+)\)$/, (m: any, a: any) => `${(Number(a) * 0.82).toFixed(3)})`));
      g.addColorStop(0.70, color.replace(/([\d.]+)\)$/, (m: any, a: any) => `${(Number(a) * 0.34).toFixed(3)})`));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = alpha;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    /** Filled closed path through face-plane (x,y) points, cubic-smoothed. */
    const shape = (pts: any, style: any, { mode = 'source-over', alpha = 1, blur = 0 } = {}) => {
      const q = pts.map(([x, y]: any) => fx(x, y));
      ctx.save();
      ctx.globalCompositeOperation = mode;
      ctx.globalAlpha = alpha;
      if (blur) ctx.filter = `blur(${blur}px)`;
      ctx.fillStyle = style;
      ctx.beginPath();
      ctx.moveTo(q[0][0], q[0][1]);
      for (let i = 0; i < q.length; i++) {
        const p1 = q[(i + 1) % q.length], p2 = q[(i + 2) % q.length];
        ctx.quadraticCurveTo(p1[0], p1[1], (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    /** Stroked open curve through face-plane points. `w` in metres. */
    const stroke = (pts: any, style: any, w: any, { mode = 'source-over', alpha = 1, blur = 0, cap = 'round' } = {}) => {
      const q = pts.map(([x, y]: any) => fx(x, y));
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
    // jaw. Without them procedural skin is one flat plastic beige. These are
    // deliberately strong — they are the only face structure wide enough to
    // survive to mip 5, which is where a head sits at 6 m.
    soft([0, 0.058, 0.078], 0.070, 0.040, 'rgba(226,180,126,0.34)', 1.0);
    soft([0, -0.026, 0.092], 0.058, 0.036, 'rgba(190,108,88,0.20)', 1.0);
    soft([0, -0.100, 0.066], 0.056, 0.032, 'rgba(96,106,136,0.34)', 1.0);

    // The lit mask: a face is a bright central T over darker perimeter planes.
    // At 30 px this reads as "a head turned toward the light" long before any
    // individual feature resolves.
    soft([0, 0.030, 0.090], 0.026, 0.052, 'rgba(255,236,206,0.22)', 1);
    soft([0, -0.104, 0.072], 0.016, 0.012, 'rgba(255,232,204,0.20)', 1);

    // warmth on cheeks, nose, ears
    const blush = look.blush || 'rgba(198,86,70,0.30)';
    soft([0.050, -0.024, 0.058], 0.036, 0.026, blush, 0.68);
    soft([-0.050, -0.024, 0.058], 0.036, 0.026, blush, 0.68);
    soft([0, -0.044, 0.099], 0.018, 0.014, blush, 0.80);
    // Ears and nostril wings are two sheets of skin over nothing: always redder.
    // The ear meshes pin every one of their vertices to the single texel at
    // their own centre, so this blob only needs to *be* that texel — at
    // 24x28 mm it also painted a red bruise across the temple and the top of
    // the cheek on the skull itself, which is the blotch in every profile frame.
    // (No ear blob. The ear meshes pin *every* vertex to the single texel at
    // their own centre, so anything painted there floods the whole ear with one
    // flat colour — a 24 mm red blob painted a bruise across the temple *and*
    // turned the ear into a salmon lump. The ear carries its own warmth in
    // vertex colour instead, where it can vary across the helix and the concha.)

    // ---- occlusion --------------------------------------------------------
    // Every one of the occlusions below is a real value on a real face, and
    // each was tuned on its own against a mid-brown complexion. Stacked — the
    // socket over the brow shadow over the temple over the outer face plane —
    // they multiply, and on a pale skin the overlaps went to a saturated
    // grey-brown that reads as dirt or bruising rather than as shadow. Damping
    // the whole stack in one place keeps the relative structure (which is what
    // survives to mip 5) and stops the pile-up.
    const ao = (p: any, rx: any, ry: any, a: any, col = '104,68,62') => {
      const rgbv = col.split(',').map((k) => Math.round(+k + (205 - +k) * 0.22));
      return soft(p, rx, ry, `rgba(${rgbv.join(',')},${a * 0.80})`, 1, 'multiply');
    };
    // the orbit: a real socket is 40mm wide and 28mm tall, and it is the
    // strongest value on a face. Eyes read as eyes because they sit in a hole.
    // The socket is also the one feature that has to hold at 20 px, so it is
    // painted wider and roughly twice as deep as anatomy alone would ask for.
    // Half its old strength: this map is now sampled by the *lid geometry* as
    // well as the skull, so painting a 0.62 socket on top of a lid that is
    // already shaded and already carries a lash line stacked two occlusions on
    // the same pixels and turned every eye into a black slot.
    ao([0.0335, -0.003, 0.070], 0.0215, 0.0150, 0.34, '96,64,62');
    ao([-0.0335, -0.003, 0.070], 0.0215, 0.0150, 0.34, '96,64,62');
    // the crease directly under the brow ridge, darker and tighter
    ao([0.0335, 0.0040, 0.076], 0.0165, 0.0052, 0.30, '82,54,54');
    ao([-0.0335, 0.0040, 0.076], 0.0165, 0.0052, 0.30, '82,54,54');
    // The eye mass itself. The eyeball is 21 mm across, i.e. 2–4 px at
    // gameplay range: far too small to survive on its own. A painted dark
    // almond under the aperture keeps a definite dark accent exactly where the
    // eye is, so the geometry adds sclera and iris on top of a hole rather
    // than floating on flat cheek.
    for (const sg of [1, -1]) {
      shape([
        [sg * 0.0195, -0.0040], [sg * 0.0290, 0.0030], [sg * 0.0420, 0.0014],
        [sg * 0.0505, -0.0055], [sg * 0.0420, -0.0112], [sg * 0.0290, -0.0122],
      ], 'rgba(52,32,34,0.34)', { blur: 4 });
    }
    // tear trough
    ao([0.0330, -0.0150, 0.073], 0.0135, 0.0046, 0.34, '128,92,86');
    ao([-0.0330, -0.0150, 0.073], 0.0135, 0.0046, 0.34, '128,92,86');
    // temples, jaw undercut, under the chin
    ao([0.062, 0.026, 0.048], 0.038, 0.044, 0.34);
    ao([-0.062, 0.026, 0.048], 0.038, 0.044, 0.34);
    // the outer face planes turn away from the light: darkening them is what
    // gives a minified head a rounded, lit mass instead of a flat oval
    ao([0.070, -0.030, 0.020], 0.042, 0.066, 0.30, '104,76,72');
    ao([-0.070, -0.030, 0.020], 0.042, 0.066, 0.30, '104,76,72');
    // the hollow under the cheekbone — the single strongest age/sex cue on a
    // face after the jaw, and the thing whose absence read as "child"
    ao([0.0475, -0.0400, 0.0575], 0.0300, 0.0230, 0.34, '120,84,78');
    ao([-0.0475, -0.0400, 0.0575], 0.0300, 0.0230, 0.34, '120,84,78');
    ao([0.048, -0.074, 0.054], 0.028, 0.028, 0.32);
    ao([-0.048, -0.074, 0.054], 0.028, 0.028, 0.32);
    // the jaw shadow, run right along the mandible: the single value that keeps
    // a head from merging into the neck and shoulders at distance
    ao([0, -0.113, 0.024], 0.058, 0.022, 0.44, '112,86,82');
    ao([0.040, -0.110, 0.038], 0.034, 0.016, 0.30, '116,90,86');
    ao([-0.040, -0.110, 0.038], 0.034, 0.016, 0.30, '116,90,86');
    // brow-ridge cast shadow: the brow is a shelf and it shades the lid
    ao([0.032, 0.0090, 0.0780], 0.0230, 0.0060, 0.38, '92,62,60');
    ao([-0.032, 0.0090, 0.0780], 0.0230, 0.0060, 0.38, '92,62,60');

    // ---- nose -------------------------------------------------------------
    // bridge highlight, side planes in shadow, a lit tip
    soft([0, -0.014, 0.093], 0.0060, 0.024, 'rgba(255,238,218,0.30)', 1);
    soft([0, -0.040, 0.098], 0.0070, 0.010, 'rgba(255,242,224,0.34)', 1);
    ao([0.0125, -0.020, 0.086], 0.0060, 0.022, 0.56, '112,72,68');
    ao([-0.0125, -0.020, 0.086], 0.0060, 0.022, 0.56, '112,72,68');
    // the shadow the tip casts on the philtrum — the darkest small value in the
    // mid-face, and what stops the nose flattening into the upper lip
    ao([0, -0.0570, 0.089], 0.013, 0.0058, 0.70, '104,68,62');
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
      'rgba(140,98,88,0.22)', 0.0055, { blur: 7 });
    stroke([[-0.0225, -0.0500], [-0.0300, -0.0665], [-0.0300, -0.0790]],
      'rgba(140,98,88,0.22)', 0.0055, { blur: 7 });

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
    soft([0, -0.0852, 0.084], 0.009, 0.0026, 'rgba(255,228,212,0.46)', 1);
    // corner shadows and the mentolabial crease
    ao([cR, yC - 0.0004, 0.076], 0.0050, 0.0038, 0.80, '78,44,44');
    ao([cL, yC - 0.0004, 0.076], 0.0050, 0.0038, 0.80, '78,44,44');
    ao([0, -0.0930, 0.080], 0.016, 0.0042, 0.60, '112,72,68');
    soft([0, -0.1010, 0.079], 0.011, 0.007, 'rgba(255,232,216,0.26)', 1);

    // ---- brows ------------------------------------------------------------
    // A filled tapered shape, not a fat grey stroke: the brow is the darkest
    // horizontal in the upper face and it has to hold an edge.
    // Twice the mass it had: a brow that is one texel wide at mip 4 is a brow
    // that is gone, and the brow is the strongest horizontal in the upper face.
    const browCol = look.browShadow || 'rgba(52,38,34,0.62)';
    for (const sg of [1, -1]) {
      shape([
        [sg * 0.0090, 0.0175], [sg * 0.0260, 0.0231], [sg * 0.0440, 0.0193],
        [sg * 0.0580, 0.0093], [sg * 0.0490, 0.0075],
        [sg * 0.0390, 0.0121], [sg * 0.0245, 0.0145], [sg * 0.0100, 0.0099],
      ], browCol, { blur: 3 });
      // a denser core so the brow keeps a hard dark centre once minified
      shape([
        [sg * 0.0140, 0.0163], [sg * 0.0280, 0.0205], [sg * 0.0430, 0.0173],
        [sg * 0.0510, 0.0107], [sg * 0.0420, 0.0127],
        [sg * 0.0270, 0.0153], [sg * 0.0150, 0.0123],
      ], browCol, { blur: 1.5, alpha: 0.85 });
    }

    // ---- eyes -------------------------------------------------------------
    for (const sg of [1, -1]) {
      // The lash line, crease and waterline are *derived from the lid
      // geometry*, not restated as their own coordinates. Every previous pass
      // hand-tuned two remap constants against a lid shape that then changed
      // underneath them, which is how a lash line ended up four millimetres
      // above the actual margin and read as a second eyebrow.
      const eR = FACE.eyeR;
      const eC = [FACE.eye[0], FACE.eye[1]];
      /**
       * Canonical (x,y) of a point on the eye sphere at fissure fraction `f`,
       * elevation `e`, radius `eR * rk`.
       */
      const eq = (f: any, e: any, rk = EYE.lidR) => {
        const a = lerp(EYE.arc[0], EYE.arc[1], f);
        const spread = 1 + EYE.canthusSpread * Math.pow(Math.abs(f * 2 - 1), 2.2);
        return [
          eC[0] + Math.sin(a) * Math.cos(e) * eR * rk * spread,
          eC[1] + Math.sin(e) * eR * rk * 1.02,
        ];
      };
      /** Lid-margin point, pushed `d` radians further from the aperture. */
      const em = (f: any, upper: any, d = 0, rk = EYE.lidR) =>
        eq(f, lidMargin(f, upper, (look.eyeOpen ?? 1) * (upper ? LID_OPEN[0] : LID_OPEN[1]))
          + (upper ? d : -d), rk);
      const ep = (p: any) => px([sg * p[0], p[1], 0.0795 - Math.abs(p[0] - 0.033) * 0.42]);
      /** Stroke a curve sampled along the fissure. */
      const lidCurve = (upper: any, d: any, rk: any, f0 = 0.03, f1 = 0.97) => {
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
          const q = ep(em(lerp(f0, f1, i / 12), upper, d, rk));
          if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
        }
        ctx.stroke();
      };
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // a soft dark bed so the hard line reads as sitting in a socket
      ctx.strokeStyle = 'rgba(44,24,28,0.62)';
      ctx.lineWidth = 0.0072 * PY;
      lidCurve(true, 0.02, EYE.lidR);
      // The lash line, at 1.6x its anatomical width. This and the brow are the
      // two strokes that decide whether a 30 px head has a face on it.
      ctx.strokeStyle = look.lash || 'rgba(14,10,12,0.97)';
      ctx.lineWidth = 0.0040 * PY;
      lidCurve(true, 0.005, EYE.lidR);
      // outer flick, running past the lateral canthus
      ctx.lineWidth = 0.0016 * PY;
      ctx.beginPath();
      {
        const a0 = ep(em(0.90, true, 0.02));
        const a1 = ep(em(1.0, true, 0.02));
        ctx.moveTo(a0[0], a0[1]);
        ctx.lineTo(a1[0] + (a1[0] - a0[0]) * 0.9, a1[1] + (a1[1] - a0[1]) * 0.9);
      }
      ctx.stroke();
      // the lid crease — the fold that gives an eye its shape
      ctx.strokeStyle = 'rgba(96,60,58,0.40)';
      ctx.lineWidth = 0.0028 * PY;
      lidCurve(true, 0.30, EYE.lidR + 0.16, 0.10, 0.94);
      // lower lash and the wet waterline just inside it
      ctx.strokeStyle = 'rgba(58,32,34,0.62)';
      ctx.lineWidth = 0.0020 * PY;
      lidCurve(false, 0.030, EYE.lidR, 0.06, 0.94);
      ctx.strokeStyle = 'rgba(255,232,220,0.26)';
      ctx.lineWidth = 0.0011 * PY;
      lidCurve(false, 0.055, EYE.lidR + 0.03, 0.08, 0.92);
      // the tear trough, a soft value a couple of millimetres lower again
      ctx.strokeStyle = 'rgba(126,84,80,0.26)';
      ctx.lineWidth = 0.0042 * PY;
      ctx.filter = 'blur(4px)';
      lidCurve(false, 0.22, EYE.lidR + 0.10, 0.12, 0.90);
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
  });
}
