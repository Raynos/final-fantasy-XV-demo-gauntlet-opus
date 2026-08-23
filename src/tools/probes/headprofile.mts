/**
 * The width-vs-height profile bench for heads (plan §8.2 tooling, ported).
 *
 *   node src/tools/probe.mts src/tools/probes/headprofile.mts --dirty
 *
 * Why this and not a frame: `hero_face` puts a head at ~100 px, and the
 * sibling's own finding is that **a head and a slab agree on height, maximum
 * width and volume** — every aggregate you would reach for first is blind to
 * the exact defect ("profile collapse") this section exists to fix. What
 * separates them is the *profile*: half-width as a function of height, and the
 * mid-sagittal front outline as a function of height.
 *
 * Everything is measured on the **shipped, finished** mesh — `char.head`'s
 * bind-space position attribute, mapped back into canonical head space by
 * `(p - dims.headOrigin) / dims.headScale` — not on the recipe, per the plan's
 * one meta-lesson.
 *
 * The instrument reports on three synthetic controls whose answer is already
 * known (sphere, ellipsoid matched to the real head's height/width/depth, and
 * a slab matched the same way) before it reports on any character, because
 * seven instruments in this repo measured themselves until somebody checked.
 */

const g = window.GAME;
g.settle(20);

const NB = 24;              // height bands
const SAG = 0.14;           // mid-sagittal strip half-width, as a fraction of max |x|

/** Round to `n` places, for a report a human reads. */
const r = (x, n = 4) => (x === null || x === undefined || !isFinite(x) ? null : +x.toFixed(n));

/**
 * Least-squares cubic in the band index, subtracted. Four unknowns solved by
 * Gauss-Jordan on the 4x4 normal equations — 24 samples, so it is exact and
 * cheap, and it keeps the bench dependency-free.
 */
function detrendCubic(y) {
  const N = y.length, A = [], b = [];
  for (let i = 0; i < 4; i++) { A.push([0, 0, 0, 0]); b.push(0); }
  for (let k = 0; k < N; k++) {
    const t = k / (N - 1) * 2 - 1;
    const p = [1, t, t * t, t * t * t];
    for (let i = 0; i < 4; i++) {
      b[i] += p[i] * y[k];
      for (let j = 0; j < 4; j++) A[i][j] += p[i] * p[j];
    }
  }
  for (let i = 0; i < 4; i++) {
    let piv = i;
    for (let k = i + 1; k < 4; k++) if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k;
    [A[i], A[piv]] = [A[piv], A[i]]; [b[i], b[piv]] = [b[piv], b[i]];
    const d = A[i][i] || 1e-12;
    for (let j = 0; j < 4; j++) A[i][j] /= d;
    b[i] /= d;
    for (let k = 0; k < 4; k++) {
      if (k === i) continue;
      const f = A[k][i];
      for (let j = 0; j < 4; j++) A[k][j] -= f * A[i][j];
      b[k] -= f * b[i];
    }
  }
  return y.map((v, k) => {
    const t = k / (N - 1) * 2 - 1;
    return v - (b[0] + b[1] * t + b[2] * t * t + b[3] * t * t * t);
  });
}

/**
 * The statistic. `pts` is a flat [x,y,z,...] array in canonical head space
 * (+Y up, +Z forward, origin at the skull centre).
 */
function profile(pts) {
  let yMin = Infinity, yMax = -Infinity, xMax = 0, zMin = Infinity, zMax = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1], z = pts[i + 2];
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
    if (Math.abs(x) > xMax) xMax = Math.abs(x);
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  const H = yMax - yMin;
  const sagX = xMax * SAG;

  // per-band: half-width, front-most z anywhere, front-most z on the midline
  const w = new Array(NB).fill(0);
  const zf = new Array(NB).fill(-Infinity);
  const zb = new Array(NB).fill(Infinity);
  const sz = new Array(NB).fill(-Infinity);
  const n = new Array(NB).fill(0);
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1], z = pts[i + 2];
    let b = Math.floor(((y - yMin) / H) * NB);
    if (b < 0) b = 0; if (b >= NB) b = NB - 1;
    n[b]++;
    if (Math.abs(x) > w[b]) w[b] = Math.abs(x);
    if (z > zf[b]) zf[b] = z;
    if (z < zb[b]) zb[b] = z;
    if (Math.abs(x) <= sagX && z > sz[b]) sz[b] = z;
  }
  // Bands with no midline sample fall back to the all-x front. An empty band
  // at all would be a hole in the mesh, and is reported rather than smoothed.
  const holes = [];
  for (let b = 0; b < NB; b++) {
    if (n[b] === 0) holes.push(b);
    if (!isFinite(sz[b])) sz[b] = zf[b];
  }

  // Height-normalised, so a bigger head is not a different shape.
  const W = w.map((v) => v / H);
  const D = zf.map((v, b) => (v - zb[b]) / H);
  const S = sz.map((v) => v / H);

  /**
   * Relief of the mid-sagittal outline: total variation of what is left after
   * a least-squares **cubic** in height is removed.
   *
   * The first version of this subtracted a straight line, and a sphere scored
   * 0.617 against a head's 0.764 — the statistic was mostly measuring the
   * skull's own arc, which is exactly the "aggregate that cannot tell a head
   * from a slab" the section warns about, one level up. A cubic absorbs any
   * smooth ovoid (sphere and ellipsoid both fall to ~0.01) and leaves only the
   * nasion notch, the nose, the subnasale, the lips, the mentolabial crease
   * and the chin. This is the number the section is about.
   */
  const det = detrendCubic(S);
  let tv = 0;
  for (let i = 1; i < NB; i++) tv += Math.abs(det[i] - det[i - 1]);
  const reliefAmp = Math.max(...det.map(Math.abs));

  // Sign alternations of the detrended outline's first difference: the number
  // of real features on the profile. The dead-band is 1.5 mm per head-height,
  // above the band-quantisation wobble a smooth ovoid produces (which scored a
  // smooth sphere at 7 "features" before it was raised).
  let alt = 0, prev = 0;
  for (let i = 1; i < NB; i++) {
    const d = det[i] - det[i - 1];
    if (Math.abs(d) < 0.0015) continue;
    const s = Math.sign(d);
    if (prev !== 0 && s !== prev) alt++;
    prev = s;
  }

  // Same idea on the coronal side: how much the half-width departs from the
  // ellipse that shares its height and maximum. A slab is flat-topped, an
  // ellipsoid is exactly the ellipse, a head has a cranial vault and a jaw.
  const wMax = Math.max(...W);
  let ellErr = 0;
  for (let i = 0; i < NB; i++) {
    const t = (i + 0.5) / NB * 2 - 1;                 // -1 .. 1
    ellErr += Math.abs(W[i] - wMax * Math.sqrt(Math.max(0, 1 - t * t)));
  }
  ellErr /= NB * wMax;

  return {
    height: r(H), maxHalfWidth: r(xMax), depth: r(zMax - zMin),
    /** width/depth x100 — human cephalic index runs 75..83. */
    cephalicIndex: r((2 * xMax) / (zMax - zMin) * 100, 1),
    /** THE statistic. */
    sagittalRelief: r(tv, 4),
    reliefAmp: r(reliefAmp, 4),
    sagittalFeatures: alt,
    widthEllipseErr: r(ellErr, 4),
    W: W.map((v) => r(v, 3)),
    S: S.map((v) => r(v, 3)),
    D: D.map((v) => r(v, 3)),
    holes,
  };
}

// ---- controls: cases whose answer is already known ----------------------
function sampleImplicit(kind, hx, hy, hz) {
  const p = [];
  for (let i = 0; i <= 56; i++) {
    const phi = (i / 56) * Math.PI;
    for (let j = 0; j <= 76; j++) {
      const th = (j / 76) * Math.PI * 2;
      const cy = Math.cos(phi), s = Math.sin(phi);
      if (kind === 'slab') {
        // a box with the same half-extents, sampled on its surface
        const u = j / 76 * 4, v = i / 56 * 2 - 1;
        const q = u % 1, f = Math.floor(u) % 4;
        const x = [1, 1 - 2 * q, -1, -1 + 2 * q][f], z = [-1 + 2 * q, 1, 1 - 2 * q, -1][f];
        p.push(x * hx, v * hy, z * hz);
      } else {
        p.push(s * Math.sin(th) * hx, cy * hy, s * Math.cos(th) * hz);
      }
    }
  }
  return p;
}

/**
 * The sculpt, ablated. Projects every vertex radially onto the ellipsoid that
 * best fits the cloud, which is precisely "the same head with the ~40 brushes
 * turned off" — a `--without <op>` ablation done on the finished mesh instead
 * of in the recipe. If the bench cannot separate a character from its own
 * ablation it is not measuring the sculpt, and every number below is noise.
 */
function ablateSculpt(pts) {
  let hx = 0, hy = 0, hz = 0;
  for (let i = 0; i < pts.length; i += 3) {
    hx = Math.max(hx, Math.abs(pts[i]));
    hy = Math.max(hy, Math.abs(pts[i + 1]));
    hz = Math.max(hz, Math.abs(pts[i + 2]));
  }
  const q = new Array(pts.length);
  for (let i = 0; i < pts.length; i += 3) {
    const u = pts[i] / hx, v = pts[i + 1] / hy, w = pts[i + 2] / hz;
    const l = Math.hypot(u, v, w) || 1;
    q[i] = (u / l) * hx; q[i + 1] = (v / l) * hy; q[i + 2] = (w / l) * hz;
  }
  return q;
}

const out = { controls: {}, chars: {} };

// ---- the cast -----------------------------------------------------------
const party = g.get('Party');
const player = g.get('Player');
const who = [['noctis', player], ['gladio', party && party.get && party.get('gladio')],
  ['ignis', party && party.get && party.get('ignis')], ['prompto', party && party.get && party.get('prompto')]];

let ref = null;
for (const [key, m] of who) {
  const ch = m && m.character;
  if (!ch || !ch.head) { out.chars[key] = null; continue; }
  const dims = ch.rig.dims;
  const o = dims.headOrigin, sc = dims.headScale;
  const pos = ch.head.geometry.getAttribute('position');
  const pts = new Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    pts[i * 3] = (pos.getX(i) - o.x) / sc;
    pts[i * 3 + 1] = (pos.getY(i) - o.y) / sc;
    pts[i * 3 + 2] = (pos.getZ(i) - o.z) / sc;
  }
  out.chars[key] = profile(pts);
  out.chars[key].verts = pos.count;
  if (!ref) {
    ref = out.chars[key];
    out.controls.noctisSculptAblated = profile(ablateSculpt(pts));
  }
}

if (ref) {
  const hx = ref.maxHalfWidth, hy = ref.height / 2, hz = ref.depth / 2;
  out.controls.sphere = profile(sampleImplicit('ellipsoid', hy, hy, hy));
  out.controls.ellipsoid = profile(sampleImplicit('ellipsoid', hx, hy, hz));
  out.controls.slab = profile(sampleImplicit('slab', hx, hy, hz));
  for (const k of Object.keys(out.controls)) {
    delete out.controls[k].W; delete out.controls[k].S; delete out.controls[k].D;
    delete out.controls[k].holes;
  }
}

return out;
