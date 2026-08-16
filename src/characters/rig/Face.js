import * as THREE from 'three';
import { MeshBuilder, applyBrushes, expandMirrors, blob, clamp01, smooth, lerp } from './Geo.js';
import { makeTexture, canvasTexture } from '../../util/TextureGen.js';
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

/** Canonical head half-extents before sculpting. */
const HR = [0.0785, 0.1130, 0.0960];

/**
 * Feature anchors in canonical head space, laid out on classical proportions:
 * the eye line sits at the vertical centre of the skull, and hairline → brow →
 * nose base → chin divide the face into equal thirds. Getting this wrong is
 * what makes a procedural head read as a doll.
 */
export const FACE = {
  eye: [0.0335, -0.006, 0.0670],
  eyeR: 0.0122,
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
  add({ p: [0.030, 0.006, 0.080], r: [0.048, 0.024, 0.052], amt: 0.0115 + 0.005 * brow, dir: [0, 0, 1], mirror: true });
  add({ p: [0, 0.001, 0.082], r: [0.022, 0.020, 0.040], amt: 0.0045 + 0.002 * brow, dir: [0, 0, 1] });
  add({ p: [0.047, 0.002, 0.068], r: [0.028, 0.024, 0.042], amt: 0.0045, dir: 'normal', mirror: true });
  // shadowed hollow directly under the brow
  add({ p: [0.031, -0.005, 0.078], r: [0.034, 0.011, 0.038], amt: -0.005, dir: [0, 0, 1], mirror: true });

  // eye sockets
  add({ p: [0.0335, -0.006, 0.076], r: [0.038, 0.027, 0.048], amt: -0.0215, dir: [0, 0, 1], mirror: true });
  add({ p: [0.0150, -0.004, 0.072], r: [0.017, 0.020, 0.030], amt: -0.0070, dir: [0, 0, 1], mirror: true });
  add({ p: [0.0335, -0.021, 0.074], r: [0.028, 0.013, 0.032], amt: 0.0040, dir: [0, 0, 1], mirror: true });
  add({ p: [0.058, -0.004, 0.056], r: [0.020, 0.024, 0.032], amt: -0.0035, dir: 'normal', mirror: true });

  // cheeks
  add({ p: [0.057, -0.018, 0.058], r: [0.042, 0.030, 0.054], amt: 0.0090 + 0.006 * cheek, dir: 'normal', mirror: true });
  add({ p: [0.051, -0.048, 0.052], r: [0.034, 0.030, 0.046], amt: -0.0075 + 0.005 * cheek, dir: 'normal', mirror: true });
  add({ p: [0.038, -0.062, 0.064], r: [0.018, 0.022, 0.032], amt: -0.0035, dir: 'normal', mirror: true });

  // nose
  add({ p: [0, -0.014, 0.089], r: [0.0175, 0.032, 0.030], amt: 0.0100 + 0.004 * nose, dir: [0, 0, 1] });
  add({ p: [0, -0.042, 0.095], r: [0.0165, 0.019, 0.028], amt: 0.0205 + 0.005 * nose, dir: [0, 0.14, 1] });
  add({ p: [0, -0.049, 0.098], r: [0.0115, 0.010, 0.020], amt: 0.0070, dir: [0, -0.2, 1] });
  add({ p: [0.017, -0.050, 0.083], r: [0.0145, 0.014, 0.024], amt: 0.0085, dir: 'normal', mirror: true });
  add({ p: [0, -0.058, 0.087], r: [0.017, 0.010, 0.024], amt: -0.0095, dir: [0, 0, 1] });
  add({ p: [0.011, -0.056, 0.089], r: [0.006, 0.007, 0.015], amt: -0.0045, dir: [0, 0, 1], mirror: true });

  // mouth
  add({ p: [0, -0.065, 0.086], r: [0.010, 0.011, 0.020], amt: -0.0045, dir: [0, 0, 1] });
  add({ p: [0, -0.0735, 0.085], r: [0.028, 0.0090, 0.026], amt: 0.0075, dir: [0, 0, 1] });
  add({ p: [0, -0.0790, 0.085], r: [0.030, 0.0035, 0.026], amt: -0.0075, dir: [0, 0, 1] });
  add({ p: [0, -0.0850, 0.084], r: [0.024, 0.0090, 0.026], amt: 0.0065, dir: [0, 0, 1] });
  add({ p: [0.026, -0.0790, 0.076], r: [0.012, 0.012, 0.021], amt: -0.0055, dir: 'normal', mirror: true });

  // chin + jaw
  add({ p: [0, -0.0935, 0.079], r: [0.022, 0.008, 0.024], amt: -0.0050, dir: [0, 0, 1] });
  add({ p: [0, -0.1015, 0.076], r: [0.030, 0.024, 0.040], amt: 0.0155 + 0.006 * jaw, dir: [0, 0.15, 1] });
  // mandible: a ramus block plus an undercut that carves the jawline edge
  add({ p: [0.063, -0.052, 0.000], r: [0.030, 0.036, 0.056], amt: 0.006 + 0.010 * jaw, dir: 'normal', mirror: true });
  add({ p: [0.054, -0.078, 0.038], r: [0.034, 0.026, 0.054], amt: 0.004 + 0.008 * jaw, dir: 'normal', mirror: true });
  add({ p: [0.050, -0.100, 0.030], r: [0.046, 0.030, 0.062], amt: -0.013 + 0.004 * jaw, dir: 'normal', mirror: true });
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
  return Math.pow(Math.max(0, 1 - Math.pow(a, 3.4)), 0.36);
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
  const segU = 60, segV = 44;
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

  const idx = [];
  for (let v = 0; v <= segV; v++) {
    const row = [];
    for (let u = 0; u <= segU; u++) {
      const p = grid[v][u];
      const [tu, tv] = uvOf(p.x, p.y, p.z);
      const w = put(p);
      row.push(B.v(w.x, w.y, w.z, u === segU ? 1 : tu, tv));
    }
    idx.push(row);
  }
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
    blob(B, {
      center: [c.x, c.y, c.z], scale: [0.0075 * scale, 0.0245 * scale, 0.0155 * scale],
      rot: [0.15, sg * 0.30, sg * 0.12], segU: 12, segV: 9,
    });
    const c2 = put([e[0] * sg * hw * 0.92, e[1] - 0.004, e[2] + 0.003]);
    B.color(0xbfbfbf);
    blob(B, {
      center: [c2.x, c2.y, c2.z], scale: [0.0042 * scale, 0.0145 * scale, 0.0085 * scale],
      rot: [0.15, sg * 0.35, sg * 0.12], segU: 10, segV: 7,
    });
    B.color(0xffffff);
    B.group(0);
  }

  // ---- eyelids -----------------------------------------------------------
  for (const side of ['L', 'R']) {
    const sg = side === 'L' ? 1 : -1;
    const ec = [FACE.eye[0] * sg * hw, FACE.eye[1], FACE.eye[2]];
    buildLid(B, { put, scale, ec, sg, upper: true, bone: I[`lid${side}`], head: I.head, look });
    buildLid(B, { put, scale, ec, sg, upper: false, bone: I[`lid${side}`], head: I.head, look });
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
  const openU = (look.eyeOpen ?? 1) * (upper ? 0.58 : 0.48);
  const cols = 14, rows = 4;
  const arc = upper ? [-1.06, 1.10] : [-1.00, 1.04];

  const pt = (a, e, rad) => {
    // a: around the vertical axis of the eye, e: elevation from the equator
    const x = Math.sin(a * sg) * Math.cos(e) * rad;
    const y = Math.sin(e) * rad;
    const z = Math.cos(a) * Math.cos(e) * rad;
    return [ec[0] + x, ec[1] + y * 1.02, ec[2] + z * 0.92];
  };

  const dark = new THREE.Color().setHex(upper ? 0x3a2a26 : 0x5a4038, THREE.SRGBColorSpace);
  const skinC = new THREE.Color(1, 1, 1);
  const gridIdx = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const row = [];
    for (let c = 0; c <= cols; c++) {
      const f = c / cols;
      const a = lerp(arc[0], arc[1], f);
      // margin elevation: high in the middle, dipping at the corners
      const shape = Math.sin(Math.PI * clamp01((f - 0.02) / 0.96));
      const margin = (upper ? 1 : -1) * (0.16 + 0.62 * openU * Math.pow(shape, 0.75));
      const outer = (upper ? 1 : -1) * (1.30 + 0.35 * shape);
      const e = lerp(margin, outer, smooth(t));
      const rad = R * lerp(1.055, 1.16, t * t);
      const p = pt(a, e, rad);
      const w = put(p);
      // lid margin is dark (lash line), blending to skin toward the socket
      B.color(skinC.clone().lerp(dark, Math.pow(1 - t, 3.0) * (upper ? 0.92 : 0.6)));
      B.mat(0.42 + 0.2 * t, 0);
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

  for (const sg of [1, -1]) {
    const cx = FACE.eye[0] * sg * hw * scale;
    const segU = 20, segV = 14;
    const rows = [];
    for (let v = 0; v <= segV; v++) {
      const phi = (v / segV) * Math.PI;
      const row = [];
      for (let u = 0; u <= segU; u++) {
        const th = (u / segU) * Math.PI * 2;
        // cornea bulge over the iris
        const irisT = clamp01(1 - phi / 0.62);
        const r = R * (1 + 0.05 * smooth(irisT));
        const p = new THREE.Vector3(
          Math.sin(phi) * Math.cos(th) * r + cx,
          Math.sin(phi) * Math.sin(th) * r,
          Math.cos(phi) * r
        );
        row.push(B.v(p.x, p.y, p.z, u / segU, phi / Math.PI));
      }
      rows.push(row);
    }
    for (let v = 0; v < segV; v++) {
      for (let u = 0; u < segU; u++) B.quad(rows[v][u], rows[v][u + 1], rows[v + 1][u + 1], rows[v + 1][u]);
    }
  }
  return { geometry: B.build(), map: paintEye(look) };
}

/** Polar eye texture: pupil, iris fibres, limbal ring, sclera with veins. */
function paintEye(look) {
  const iris = new THREE.Color().setHex(look.iris ?? 0x3f6f9c, THREE.SRGBColorSpace);
  const n = new Noise(99);
  return makeTexture(256, (u, v, c) => {
    const r = v * Math.PI;                    // polar angle 0 at the front
    const t = r / 0.68;                        // 0..1 across the iris
    const lidShade = 1 - 0.34 * clamp01(Math.sin(u * Math.PI * 2));
    if (t < 1.06) {
      const pupil = 0.36;
      if (t < pupil) { c[0] = c[1] = c[2] = 0.006; return; }
      const q = (t - pupil) / (1 - pupil);
      const fib = 0.60 + 0.55 * Math.abs(Math.sin(u * Math.PI * 2 * 34 + n.simplex2(u * 40, 0) * 4));
      const radial = 0.42 + 0.85 * Math.pow(q, 1.3);
      let k = fib * radial * 0.95 * lidShade;
      k *= 0.85 + 0.35 * n.simplex2(u * 22, q * 6);
      if (q > 0.84) k *= 0.22;                 // limbal ring
      c[0] = iris.r * k; c[1] = iris.g * k; c[2] = iris.b * k;
      if (q > 0.98) { const m = (q - 0.98) / 0.02; c[0] = lerp(c[0], 0.5, m); c[1] = lerp(c[1], 0.49, m); c[2] = lerp(c[2], 0.48, m); }
      return;
    }
    // sclera: never paper-white, and shadowed under the upper lid so the eye
    // sits in a socket instead of glowing out of it
    const shade = (0.44 + 0.30 * Math.min(1, (t - 1.0) * 1.1)) * lidShade;
    const vein = Math.max(0, n.simplex2(u * 26, v * 9)) * Math.max(0, 1 - Math.abs(t - 1.35));
    c[0] = shade * (0.99 + vein * 0.01);
    c[1] = shade * (0.93 - vein * 0.16);
    c[2] = shade * (0.90 - vein * 0.18);
  }, { generateMipmaps: true });
}

/**
 * The painted face map: base tone, lip colour, lash and brow shadow, beard
 * shadow, freckles, scars. Placed through the same UV projection the mesh uses,
 * so features land where the sculpt put them.
 */
function paintFace(look, uv) {
  const S = 1024;
  const skin = new THREE.Color().setHex(look.skin.getHex(THREE.SRGBColorSpace), THREE.SRGBColorSpace);
  const hexOf = (c) => `#${c.getHexString(THREE.SRGBColorSpace)}`;
  const rng = new Rng(look.seed || 7);
  const n = new Noise((look.seed || 7) + 11);

  const px = (p) => {
    const [u, v] = uv(p[0], p[1], p[2]);
    return [u * S, (1 - v) * S];
  };

  return canvasTexture(S, (ctx) => {
    ctx.fillStyle = hexOf(skin);
    ctx.fillRect(0, 0, S, S);

    // large-scale tonal variation
    const img = ctx.getImageData(0, 0, S, S);
    const d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const f = 1 + 0.045 * n.fbm2(x * 0.012, y * 0.012, 4) + 0.02 * n.simplex2(x * 0.14, y * 0.14);
        d[i] = Math.min(255, d[i] * f);
        d[i + 1] = Math.min(255, d[i + 1] * (f * 0.995));
        d[i + 2] = Math.min(255, d[i + 2] * (f * 0.99));
      }
    }
    ctx.putImageData(img, 0, 0);

    const soft = (p, rx, ry, color, alpha, rot = 0, mode = 'source-over') => {
      const [cx, cy] = px(p);
      ctx.save();
      ctx.globalCompositeOperation = mode;
      ctx.translate(cx, cy); ctx.rotate(rot);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(rx, ry) * S);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = alpha;
      ctx.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, Math.max(rx, ry) * S, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    // warmth on cheeks, nose, ears, lips region
    const blush = look.blush || 'rgba(198,86,70,0.30)';
    soft([0.052, -0.026, 0.056], 0.055, 0.045, blush, 0.7);
    soft([-0.052, -0.026, 0.056], 0.055, 0.045, blush, 0.7);
    soft([0, -0.045, 0.099], 0.030, 0.030, blush, 0.55);
    soft([0, -0.092, 0.077], 0.030, 0.026, blush, 0.35);
    // occlusion in the sockets, under the brow, beside the nose and under the
    // lip — multiplied in, so it darkens instead of washing the tone out
    const ao = (p, rx, ry, a) => soft(p, rx, ry, `rgba(120,86,78,${a})`, 1, 0, 'multiply');
    ao([0.034, -0.006, 0.072], 0.040, 0.026, 0.95);
    ao([-0.034, -0.006, 0.072], 0.040, 0.026, 0.95);
    ao([0.030, 0.008, 0.079], 0.038, 0.011, 0.75);
    ao([-0.030, 0.008, 0.079], 0.038, 0.011, 0.75);
    ao([0, -0.057, 0.091], 0.026, 0.012, 0.85);
    ao([0.019, -0.052, 0.084], 0.012, 0.012, 0.85);
    ao([-0.019, -0.052, 0.084], 0.012, 0.012, 0.85);
    ao([0, -0.090, 0.080], 0.028, 0.009, 0.6);
    ao([0.032, -0.074, 0.070], 0.020, 0.026, 0.5);
    ao([-0.032, -0.074, 0.070], 0.020, 0.026, 0.5);
    ao([0.064, 0.030, 0.046], 0.048, 0.048, 0.45);
    ao([-0.064, 0.030, 0.046], 0.048, 0.048, 0.45);
    ao([0, -0.106, 0.036], 0.070, 0.028, 0.55);

    // beard / stubble shadow
    if (look.stubble) {
      ctx.save();
      const [jx, jy] = px([0, -0.086, 0.077]);
      ctx.globalAlpha = look.stubble;
      ctx.fillStyle = look.stubbleColor || '#4b3a30';
      for (let i = 0; i < 5200; i++) {
        const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next());
        const x = jx + Math.cos(a) * r * 0.155 * S;
        const y = jy + Math.sin(a) * r * 0.085 * S - 0.02 * S;
        const fall = 1 - r;
        if (rng.next() > fall * 0.9) continue;
        ctx.fillRect(x, y, 1.7, 1.7);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // freckles
    if (look.freckles) {
      ctx.save();
      const [fx, fy] = px([0, -0.032, 0.092]);
      ctx.fillStyle = look.freckleColor || 'rgba(150,88,58,0.55)';
      for (let i = 0; i < 260; i++) {
        const x = fx + rng.gauss(0, 0.055) * S;
        const y = fy + rng.gauss(0, 0.020) * S;
        const r = rng.range(1.1, 2.6);
        ctx.globalAlpha = rng.range(0.25, 0.75);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // lips
    const lipCol = look.lip || 'rgba(158,84,80,0.55)';
    soft([0, -0.0738, 0.085], 0.028, 0.0080, lipCol, 1);
    soft([0, -0.0846, 0.084], 0.025, 0.0080, lipCol, 1);
    soft([0, -0.0738, 0.085], 0.020, 0.0050, lipCol, 0.8);
    soft([0, -0.0846, 0.084], 0.018, 0.0050, lipCol, 0.8);
    // mouth line: cupid's bow into the corners
    ctx.save();
    const mp = (x, y) => px([x, y, 0.085 - Math.abs(x) * 0.16]);
    const a1 = mp(-0.0275, -0.0786);
    const a3 = mp(0.0275, -0.0786);
    ctx.strokeStyle = 'rgba(78,36,36,0.85)';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a1[0], a1[1]);
    ctx.bezierCurveTo(...mp(-0.012, -0.0806), ...mp(-0.006, -0.0784), ...mp(0, -0.0790));
    ctx.bezierCurveTo(...mp(0.006, -0.0784), ...mp(0.012, -0.0806), a3[0], a3[1]);
    ctx.stroke();
    ctx.restore();

    // lash lines — the single strongest cue that an eye is an eye
    for (const sg of [1, -1]) {
      const ep = (x, y) => px([sg * x, y, 0.079 - Math.abs(x - 0.033) * 0.35]);
      ctx.save();
      ctx.strokeStyle = look.lash || 'rgba(28,20,22,0.92)';
      ctx.lineWidth = 5.0;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(...ep(0.015, -0.0055));
      ctx.quadraticCurveTo(...ep(0.033, 0.0035), ...ep(0.051, -0.0035));
      ctx.stroke();
      // outer flick
      ctx.lineWidth = 3.0;
      ctx.beginPath();
      ctx.moveTo(...ep(0.047, -0.0015));
      ctx.lineTo(...ep(0.056, -0.0020));
      ctx.stroke();
      // faint lower lash
      ctx.strokeStyle = 'rgba(70,46,44,0.45)';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(...ep(0.017, -0.0095));
      ctx.quadraticCurveTo(...ep(0.034, -0.0155), ...ep(0.050, -0.0070));
      ctx.stroke();
      ctx.restore();
    }

    // scar
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

    // eyebrow shadow so the geometry brows sit on something
    for (const sg of [1, -1]) {
      const b0 = px([sg * 0.012, 0.0140, 0.085]);
      const b1 = px([sg * 0.034, 0.0170, 0.077]);
      const b2 = px([sg * 0.053, 0.0085, 0.059]);
      ctx.save();
      ctx.strokeStyle = look.browShadow || 'rgba(70,50,44,0.42)';
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b0[0], b0[1]);
      ctx.quadraticCurveTo(b1[0], b1[1] - 4, b2[0], b2[1]);
      ctx.stroke();
      ctx.restore();
    }
  }, { repeat: 1 });
}
