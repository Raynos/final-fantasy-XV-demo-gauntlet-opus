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
  const rootC = base.clone().multiplyScalar(0.84);
  // the value the gaps between locks should sit at: the root colour carried a
  // third of the way toward the tips, which is roughly the strand mid-tone
  const shellC = rootC.clone().lerp(tip, 0.52);

  // hairline elevation in canonical y for a given azimuth
  // A hairline is not a circle. It rides high across the forehead, plunges at
  // the temples, and drops lowest at the nape — and if the temples do not drop
  // the character has two bald patches beside the eyes from every angle.
  const hairline = (th) => {
    const c = Math.cos(th);
    let y = -0.012 + 0.049 * c + (H.hairline || 0);
    y -= (H.temple ?? 0.030) * Math.pow(Math.abs(Math.sin(th)), 1.2);
    y += (H.peak || 0) * 0.012 * Math.max(0, Math.cos(th * 2));
    // Ear notch. A hairline goes *around* the ear; this one ran straight across
    // it, so the scalp shell buried the top half of both ears and no `_profile`
    // frame in the game had a visible ear at all. `FACE.ear` sits at azimuth
    // ~1.66 rad and the hairline *rises* there — the opposite sign to `temple`,
    // which drops at the sides so there is no bald patch beside the eyes.
    const ath = Math.abs(Math.atan2(Math.sin(th), Math.cos(th)));
    y += (H.earNotch ?? 0.034) * Math.exp(-Math.pow((ath - 1.66) / 0.36, 2));
    return y;
  };
  const phiOf = (th) => Math.acos(clamp01((hairline(th) / HEAD_R[1] + 1) / 2) * 2 - 1);

  // ---- scalp shell -------------------------------------------------------
  const cols = 52, rows = 11;
  const shell = [];
  B.color(base).mat((H.rough ?? 0.36) + 0.22, 0, 0).skin([[I.head, 1]]);
  const shellPoint = (th, t) => {
    const pm = phiOf(th);
    const phi = pm * Math.min(1, t * 1.02);
    const { p, n } = sample(th, phi);
    const vol = (H.volume ?? 1) * (H.shell ?? 0.011);
    // thicker at the crown, thinning to a lip at the hairline
    let off = vol * (0.22 + 0.9 * smooth(1 - t));
    if (t >= 0.999) off = 0.0012;
    if (H.shellShape) off *= H.shellShape(th, 1 - t);
    return { p: p.clone().addScaledVector(n, off), n };
  };
  for (let r = 0; r <= rows; r++) {
    const row = [];
    const t = r / rows;
    for (let c = 0; c <= cols; c++) {
      const th = (c / cols) * Math.PI * 2;
      const { p } = shellPoint(th, t);
      // strand flow runs crown -> hairline; the highlight band is perpendicular
      const q = shellPoint(th, Math.min(1, t + 0.02)).p;
      const d = q.clone().sub(p);
      if (d.lengthSq() < 1e-10) d.set(0, -1, 0);
      B.tang(d.x, d.y, d.z);
      const w = put(p);
      // A parting is a value break, not a shape: the crown is lighter than the
      // nape and the roots at the hairline are darkest of all. The shell used to
      // sit at 0.62 of the root colour, which on near-black hair is a void —
      // and a void is exactly what "one low-poly spiky blob" looks like from
      // 6 m. It now carries a real crown-to-nape ramp so the mass has a lit
      // side even before a single strand catches the sun.
      const crown = smooth(1 - t * 1.15);
      // The shell is what shows *between* the locks, so it has to sit in the
      // same value range they do. At 0.74-1.36 of a 0.84 root colour it was a
      // long way below the strand mid-tone, and every gap read as a hole —
      // which is most of what made the scalp look like a moulded black cap.
      B.color(shellC.clone().multiplyScalar(0.82 + 0.46 * crown * crown));
      row.push(B.v(w.x, w.y, w.z, (c / cols) * 6, t * 1.5));
    }
    shell.push(row);
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) B.quad(shell[r][c], shell[r][c + 1], shell[r + 1][c + 1], shell[r + 1][c]);
  }

  // ---- lie the hair on the head ------------------------------------------
  // The sea-urchin read is not the direction field and it is not the ribbon —
  // it is that a strand leaving a curved scalp in a straight line *keeps
  // leaving it*. With ~35% of the root direction along the surface normal, a
  // 5 cm lock ends a centimetre and a half proud of the skull and every one of
  // them points somewhere different: a porcupine. Real hair is laid *on* the
  // head and only lifts where the style says so.
  //
  // So each strand point is clamped to a standoff corridor measured against the
  // sculpted skull: never inside it, never further out than `puff * len * t`.
  // `hug: 0` opts a tuft out entirely — that is what a spike is.
  const rrH = [HEAD_R[0] * (look.headWidth ?? 1), HEAD_R[1], HEAD_R[2]];
  const _q = new THREE.Vector3();
  const hugSkull = (v, maxOff, k) => {
    // fade the clamp out below the jaw and above the crown, where the skull's
    // spherical parameterisation stops meaning anything and a mane hanging past
    // the shoulders would otherwise be shoved back into the neck
    const yn = Math.abs(v.y) / rrH[1];
    const fade = 1 - clamp01((yn - 0.88) / 0.24);
    if (fade <= 0) return;
    const th = Math.atan2(v.x / rrH[0], v.z / rrH[2]);
    const ph = Math.acos(clamp01((v.y / rrH[1] + 1) / 2) * 2 - 1);
    const { p: q, n } = sample(th, ph);
    const off = _q.copy(v).sub(q).dot(n);
    const lo = maxOff * 0.12;
    const target = off > maxOff ? maxOff : (off < lo ? lo : off);
    if (target !== off) v.addScaledVector(n, (target - off) * k * fade);
  };

  // ---- tufts -------------------------------------------------------------
  for (const tuft of H.tufts) {
    const n = tuft.n || 8;
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0.5 : i / (n - 1);
      const th = lerp(tuft.th[0], tuft.th[1], f) + rng.gauss(0, tuft.thJit ?? 0.05);
      const pf = (tuft.phi ? lerp(tuft.phi[0], tuft.phi[1], rng.next()) : 0.55);
      const pm = phiOf(th);
      // `absPhi` reads phi as a real polar angle instead of a fraction of the
      // hairline, which is the only way to root strands below the equator —
      // i.e. beards, sideburns and jaw-line stubble.
      const phi = tuft.absPhi ? pf : pm * pf;
      const { p, n: nrm } = sample(th, phi);
      const root = p.clone().addScaledVector(nrm, (H.shell ?? 0.011) * (H.volume ?? 1) * 0.8 + (tuft.lift ?? 0));

      const len = (tuft.len || 0.09) * (1 + rng.gauss(0, tuft.lenVar ?? 0.14));
      const d1 = new THREE.Vector3().fromArray(tuft.dir).normalize();
      if (tuft.dirJit) {
        d1.x += rng.gauss(0, tuft.dirJit); d1.y += rng.gauss(0, tuft.dirJit); d1.z += rng.gauss(0, tuft.dirJit);
        d1.normalize();
      }
      const d0 = nrm.clone().lerp(d1, tuft.out ?? 0.15).normalize();
      // A lock bows. Straight is the single loudest tell that a strand is a
      // generated primitive, so every one gets its own sideways arc, peaking
      // mid-length and returning at the tip.
      const bowAxis = new THREE.Vector3().crossVectors(d1, nrm);
      if (bowAxis.lengthSq() < 1e-8) bowAxis.set(1, 0, 0);
      bowAxis.normalize();
      const bow = rng.gauss(0, tuft.bow ?? 0.11) * len;
      const hug = tuft.hug ?? 0.85;
      const puff = tuft.puff ?? 0.30;
      const segs = tuft.segs || (tuft.steps && tuft.steps > 6 ? 5 : 4);
      const baseOff = (H.shell ?? 0.011) * (H.volume ?? 1) * 0.8 + (tuft.lift ?? 0);
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
        cur.addScaledVector(bowAxis, bow * Math.sin(Math.PI * t));
        if (hug > 0) hugSkull(cur, baseOff + puff * len * t, hug);
        pts.push(cur.clone());
      }

      const tBase = tuft.color != null ? new THREE.Color().setHex(tuft.color, THREE.SRGBColorSpace) : base;
      const tTip = tuft.tipColor != null ? new THREE.Color().setHex(tuft.tipColor, THREE.SRGBColorSpace) : tip;
      const tRoot = tBase.clone().multiplyScalar(0.62);
      const spike = tuft.spike ?? 0.9;
      const wid = (tuft.width || 0.014) * 1.38 * (1 + rng.gauss(0, 0.18));
      const bw = tuft.spring || 0;
      B.skin(bw ? [[I.tail, bw], [I.head, 1 - bw]] : [[I.head, 1]]);
      B.mat(tuft.rough ?? H.rough ?? 0.36, 0, 1);

      // ---- clumping -------------------------------------------------------
      // One ribbon per root is what read as straw. At any strand width fine
      // enough not to be a blade, a single lock cannot fill the space between
      // itself and its neighbour, so sky shows between every strand and each one
      // reads as a separate object. Real hair separates into *clumps*: several
      // locks sharing a root and a direction, splaying apart toward the tips.
      // Emitting `clump` locks per root multiplies the density inside the
      // silhouette at a fraction of the width each, which is the difference
      // between a mass of hair and a handful of quills.
      const clumpN = Math.max(1, Math.round(tuft.clump ?? H.clump ?? 1));
      // lateral basis for the splay: two axes perpendicular to the mean flow
      const ax = bowAxis.clone();
      const ay = new THREE.Vector3().crossVectors(d1, ax);
      if (ay.lengthSq() < 1e-8) ay.set(0, 1, 0);
      ay.normalize();
      const splay = (tuft.splay ?? 0.20) * len;
      // Total cross-section is held roughly constant, so a clumped tuft is not
      // a fatter tuft: it is the same mass resolved into finer filaments.
      const cwid = clumpN > 1 ? wid * (0.42 + 0.34 / clumpN) : wid;
      const steps = tuft.steps || 6;

      for (let c2 = 0; c2 < clumpN; c2++) {
        let cpts = pts;
        if (clumpN > 1) {
          const ang = (c2 / clumpN) * Math.PI * 2 + rng.range(-0.5, 0.5);
          const rad = c2 === 0 ? rng.range(0, 0.25) : rng.range(0.45, 1.0);
          const ox = Math.cos(ang) * rad, oy = Math.sin(ang) * rad;
          cpts = pts.map((q, k) => {
            const t = k / segs;
            // the locks are together at the root and apart at the tip
            const s = splay * (0.10 + 0.90 * t * t);
            const v = q.clone().addScaledVector(ax, ox * s).addScaledVector(ay, oy * s);
            if (hug > 0) hugSkull(v, baseOff + puff * len * t + splay * 0.6, hug * 0.8);
            return v;
          });
        }
        const w2 = cwid * (0.78 + 0.44 * rng.next());
        ribbon(B, {
          points: cpts.map((q) => put(q).toArray()),
          steps,
          // six-sided: a flat diamond is what made every strand a faceted blade
          sides: tuft.sides ?? 6,
          width: w2 * scale,
          // a lock is a rolled bundle, not a ribbon: floor the depth-to-width
          // ratio so the six-sided section is actually round
          thick: w2 * scale * Math.max(0.62, tuft.thick ?? 0.5),
          up: nrm.toArray(),
          // A wide per-lock value spread is the difference between "hair" and "a
          // black shape". Some clumps sit near the root value, some run almost to
          // the tip value at their base — that is what makes the mass legible
          // once every individual ribbon is thinner than a pixel.
          color: tRoot.clone().lerp(tTip, 0.14 + 0.50 * Math.pow(rng.next(), 1.3)),
          // The tip value used to be lifted *above* the style's tip colour on
          // half the locks. The tip is the part that sits against the sky, so a
          // lifted tip is exactly the pixel that makes one strand read as a
          // separate straw. Tips now sit at or below the style value.
          tipColor: tTip.clone().multiplyScalar(0.66 + 0.30 * rng.next()),
          // Clump profile. Holding the width through the body of the strand and
          // dropping it at the end is an *arrowhead*: a broad blade converging to
          // a point in a straight line, which is precisely what read as a quill.
          // A lock narrows continuously from a wide root to a hair-fine tip, so
          // the width is a plain power curve and the root is correspondingly
          // wider to keep the same mass in the silhouette.
          taper: (t) => Math.pow(clamp01(1 - t), 0.42 + 0.30 * spike),
        });
      }
    }
  }

  // ---- hairline wisps ----------------------------------------------------
  // The scalp shell meets the forehead along a hard geometric edge. Real hair
  // never does: a few dozen fine, short, low-contrast strands crossing that
  // line are what dissolve the "wig on a stand" seam.
  {
    const nw = H.wisps ?? 44;
    B.skin([[I.head, 1]]).mat((H.rough ?? 0.36) + 0.10, 0, 1);
    for (let i = 0; i < nw; i++) {
      const th = rng.range(-2.5, 2.5);
      const pm = phiOf(th);
      const { p, n: nrm } = sample(th, pm * (0.94 + rng.next() * 0.10));
      const root = p.clone().addScaledVector(nrm, (H.shell ?? 0.011) * 0.4);
      const len = (0.016 + rng.next() * 0.020) * (H.wispLen ?? 1);
      const d = new THREE.Vector3(
        nrm.x * 0.5 + rng.gauss(0, 0.35),
        -0.80 + rng.gauss(0, 0.28),
        nrm.z * 0.55 + rng.gauss(0, 0.22)
      ).normalize();
      const mid = root.clone().addScaledVector(nrm.clone().lerp(d, 0.45).normalize(), len * 0.5);
      const tipP = mid.clone().addScaledVector(d, len * 0.6);
      B.color(rootC);
      ribbon(B, {
        points: [root, mid, tipP].map((q) => put(q).toArray()),
        steps: 3,
        width: 0.0026 * scale * (0.7 + rng.next() * 0.8),
        thick: 0.0009 * scale,
        up: nrm.toArray(),
        color: rootC.clone().multiplyScalar(0.9 + 0.3 * rng.next()),
        tipColor: base,
        taper: (t) => Math.pow(1 - t, 0.5),
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
