import * as THREE from 'three';
import { MeshBuilder, ribbon, clamp01, smooth, lerp } from './Geo.js';
import { skullSampler, HEAD_R } from './Face.js';
import { Rng } from '../../util/Rng.js';

/**
 * Hair.
 *
 * A hairstyle is a scalp shell (opaque, follows the sculpted skull, gives the
 * silhouette its mass) plus a set of *tufts* — seeded clusters of tapered
 * ribbons that leave the scalp along its normal and bend toward a styled
 * direction. Spikes, sweeps and fringes are all the same generator with
 * different bend/taper/length.
 *
 * Everything is authored in character space and skinned, so a tuft can be
 * bound to a spring bone (`tail`) and swing with the character's motion.
 */

/**
 * @param {Object} rig
 * @param {Object} look must carry `hair` (see Cast.js) plus face shape params
 * @returns {THREE.BufferGeometry}
 */
export function buildHair(rig, look) {
  const { index: I, dims } = rig;
  const scale = dims.headScale;
  const origin = dims.headOrigin;
  const H = look.hair;
  const rng = new Rng(look.seed * 31 + 5);
  const sample = skullSampler(look);
  const B = new MeshBuilder('hair');

  const put = (p) => new THREE.Vector3(p.x, p.y, p.z).multiplyScalar(scale).add(origin);
  const base = new THREE.Color().setHex(H.color, THREE.SRGBColorSpace);
  const tip = new THREE.Color().setHex(H.tipColor ?? H.color, THREE.SRGBColorSpace);
  const rootC = base.clone().multiplyScalar(0.72);

  // hairline elevation in canonical y for a given azimuth
  const hairline = (th) => {
    const c = Math.cos(th);
    let y = -0.010 + 0.060 * c + (H.hairline || 0);
    y += (H.peak || 0) * 0.012 * Math.max(0, Math.cos(th * 2));
    return y;
  };
  const phiOf = (th) => Math.acos(clamp01((hairline(th) / HEAD_R[1] + 1) / 2) * 2 - 1);

  // ---- scalp shell -------------------------------------------------------
  const cols = 44, rows = 9;
  const shell = [];
  B.color(base).mat(H.rough ?? 0.36, 0).skin([[I.head, 1]]);
  for (let r = 0; r <= rows; r++) {
    const row = [];
    for (let c = 0; c <= cols; c++) {
      const th = (c / cols) * Math.PI * 2;
      const pm = phiOf(th);
      const t = r / rows;
      const phi = pm * Math.min(1, t * 1.02);
      const { p, n } = sample(th, phi);
      const vol = (H.volume ?? 1) * (H.shell ?? 0.011);
      // thicker at the crown, thinning to a lip at the hairline
      let off = vol * (0.22 + 0.9 * smooth(1 - t));
      if (r === rows) off = 0.0012;
      if (H.shellShape) off *= H.shellShape(th, 1 - t);
      const w = put(p.clone().addScaledVector(n, off));
      B.color(r > rows - 2 ? rootC : base);
      row.push(B.v(w.x, w.y, w.z, c / cols, t));
    }
    shell.push(row);
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) B.quad(shell[r][c], shell[r][c + 1], shell[r + 1][c + 1], shell[r + 1][c]);
  }

  // ---- tufts -------------------------------------------------------------
  for (const tuft of H.tufts) {
    const n = tuft.n || 8;
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0.5 : i / (n - 1);
      const th = lerp(tuft.th[0], tuft.th[1], f) + rng.gauss(0, tuft.thJit ?? 0.05);
      const pf = (tuft.phi ? lerp(tuft.phi[0], tuft.phi[1], rng.next()) : 0.55);
      const pm = phiOf(th);
      const phi = pm * pf;
      const { p, n: nrm } = sample(th, phi);
      const root = p.clone().addScaledVector(nrm, (H.shell ?? 0.011) * (H.volume ?? 1) * 0.8 + (tuft.lift ?? 0));

      const len = (tuft.len || 0.09) * (1 + rng.gauss(0, tuft.lenVar ?? 0.14));
      const d1 = new THREE.Vector3().fromArray(tuft.dir).normalize();
      if (tuft.dirJit) {
        d1.x += rng.gauss(0, tuft.dirJit); d1.y += rng.gauss(0, tuft.dirJit); d1.z += rng.gauss(0, tuft.dirJit);
        d1.normalize();
      }
      const d0 = nrm.clone().lerp(d1, tuft.out ?? 0.15).normalize();
      const segs = tuft.segs || 3;
      const pts = [root.clone()];
      let cur = root.clone();
      for (let k = 1; k <= segs; k++) {
        const t = k / segs;
        const d = d0.clone().lerp(d1, smooth(Math.pow(t, tuft.bendPow ?? 0.8) * (tuft.bend ?? 0.9))).normalize();
        cur = cur.clone().addScaledVector(d, len / segs);
        cur.y -= (tuft.sag || 0) * t * t * len;
        if (tuft.curl) {
          cur.x += Math.sin(t * 4 + i) * tuft.curl * len * 0.2;
          cur.z += Math.cos(t * 4 + i) * tuft.curl * len * 0.2;
        }
        pts.push(cur.clone());
      }

      const spike = tuft.spike ?? 0.9;
      const wid = (tuft.width || 0.014) * (1 + rng.gauss(0, 0.18));
      const bone = tuft.spring ? I.tail : I.head;
      const bw = tuft.spring || 0;
      B.skin(bw ? [[I.tail, bw], [I.head, 1 - bw]] : [[I.head, 1]]);
      B.mat(H.rough ?? 0.36, 0);
      ribbon(B, {
        points: pts.map((q) => put(q).toArray()),
        steps: tuft.steps || 6,
        width: wid * scale,
        thick: wid * scale * (tuft.thick ?? 0.5),
        up: nrm.toArray(),
        color: rootC.clone().lerp(base, 0.5 + 0.5 * rng.next()),
        tipColor: tip.clone().multiplyScalar(0.92 + 0.22 * rng.next()),
        // clump profile: hold width through the body of the strand and only
        // taper near the tip, so hair reads as locks rather than quills
        taper: (t) => Math.pow(clamp01(1 - Math.pow(t, 1.5 + spike)), 0.62),
      });
    }
  }

  // ---- eyebrows ----------------------------------------------------------
  const bw = look.brows || {};
  const bcol = new THREE.Color().setHex(bw.color ?? H.color, THREE.SRGBColorSpace);
  B.color(bcol).mat(0.5, 0).skin([[I.head, 1]]);
  for (const sg of [1, -1]) {
    const nb = 9;
    for (let i = 0; i < nb; i++) {
      const t = i / (nb - 1);
      const x = sg * lerp(0.010, 0.050, t) * (look.headWidth ?? 1);
      const y = lerp(0.0125, 0.0065, Math.pow(t, 1.6)) + (bw.lift ?? 0) - 0.004 * Math.pow(t - 0.35, 2) * 8;
      const z = lerp(0.0865, 0.0615, Math.pow(t, 1.35));
      const root = new THREE.Vector3(x, y, z);
      const out = new THREE.Vector3(x * 0.6, y * 0.2 + 0.2, z).normalize();
      const d = new THREE.Vector3(sg * (0.55 + 0.5 * t), 0.28 - 0.5 * t, 0.55 - 0.4 * t).normalize();
      const L = (bw.len ?? 0.012) * (1 - 0.25 * t);
      const pts = [root, root.clone().addScaledVector(d, L * 0.55), root.clone().addScaledVector(d, L)];
      B.color(bcol.clone().multiplyScalar(0.85 + 0.3 * rng.next()));
      ribbon(B, {
        points: pts.map((q) => put(q).toArray()),
        steps: 3,
        width: (bw.width ?? 0.0055) * scale,
        thick: (bw.width ?? 0.0055) * scale * 0.35,
        up: out.toArray(),
        taper: (t2) => Math.pow(1 - t2, 0.65),
      });
    }
  }

  return B.build();
}
