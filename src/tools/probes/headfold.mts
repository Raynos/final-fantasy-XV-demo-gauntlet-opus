// What is covering the eye, measured on the shipped mesh.
//
//   node src/tools/probe.mts src/tools/probes/headfold.mts
//
// `Character.ts:73` ships the face material as `THREE.DoubleSide`, so a
// back-facing surface renders *in front of* whatever is behind it. The
// `facecam.mts` FRONT_SIDE ablation shows the consequence: with the shipped
// `DoubleSide` a skin-coloured mass fills the palpebral fissure, and with
// `FrontSide` the same eye is whole — sclera, iris, pupil, limbal ring,
// catchlight. So the covering surface is head geometry that is *back-facing to
// the camera*, and the landmines file's non-monotonic socket depth is exactly
// that fold.
//
// The frame says a fold exists. It does not say where, and a brush is not
// something you can point at in a picture. So: find every head triangle that
// sits inside the aperture cone, in front of the globe, and faces the wrong
// way — and report its canonical coordinates. The answer to "which brush" is
// then a bounding box.
//
// The first version of this probe tested star-shapedness against the head
// centre and reported 82% of every head inverted. That was the instrument
// measuring itself twice over: the winding convention was assumed, and a
// sculpted head is legitimately concave in the sockets, the occiput tuck and
// under the jaw, so "normal points inward" is not "folded". Both are fixed
// below — the convention is read off the crown, whose outward direction is not
// in doubt, and the test is the rendering symptom itself.

const g = window.GAME;
g.settle(10);

const party = g.get('Party');
const player = g.get('Player');
const who = [['noctis', player], ['gladio', party && party.get && party.get('gladio')],
  ['ignis', party && party.get && party.get('ignis')], ['prompto', party && party.get && party.get('prompto')]];

const r = (x, n = 4) => +x.toFixed(n);
const out = { control: {}, chars: {} };

/** Flat triangle-soup of a mesh, in canonical head space. */
function soup(mesh, o, sc) {
  const pos = mesh.geometry.getAttribute('position');
  const idx = mesh.geometry.getIndex();
  const N = idx ? idx.count : pos.count;
  const a = new Float64Array(N * 3);
  for (let i = 0; i < N; i++) {
    const j = idx ? idx.getX(i) : i;
    a[i * 3] = (pos.getX(j) - o.x) / sc;
    a[i * 3 + 1] = (pos.getY(j) - o.y) / sc;
    a[i * 3 + 2] = (pos.getZ(j) - o.z) / sc;
  }
  return a;
}

/** Centroid and un-normalised cross-product normal of triangle `t`. */
function tri(p, t) {
  const ax = p[t], ay = p[t + 1], az = p[t + 2];
  const bx = p[t + 3], by = p[t + 4], bz = p[t + 5];
  const cx = p[t + 6], cy = p[t + 7], cz = p[t + 8];
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  return {
    c: [(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3],
    n: [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx],
  };
}

for (const [key, m] of who) {
  const ch = m && m.character;
  if (!ch || !ch.head) continue;
  const dims = ch.rig.dims, o = dims.headOrigin, sc = dims.headScale;
  const P = soup(ch.head, o, sc);

  // ---- the winding convention, read off the crown ----------------------
  // The top of the skull points up. Nothing about a face sculpt changes that,
  // so the mean dot of crown triangle normals with +Y fixes the sign for the
  // whole mesh, and the magnitude of the agreement is reported so a weak
  // consensus cannot pass silently.
  let up = 0, upN = 0;
  for (let t = 0; t < P.length; t += 9) {
    const { c, n } = tri(P, t);
    if (c[1] < 0.090 || Math.abs(c[0]) > 0.025 || Math.abs(c[2]) > 0.025) continue;
    const nl = Math.hypot(n[0], n[1], n[2]) || 1;
    up += n[1] / nl; upN++;
  }
  const SIGN = up >= 0 ? 1 : -1;
  if (!out.control.crownSamples) {
    out.control.crownSamples = upN;
    out.control.crownMeanDotY = r(up / Math.max(1, upN), 3);
    out.control.sign = SIGN;
  }

  // ---- what covers the eye ---------------------------------------------
  // The globe's centre in canonical head space, and the aperture cone around
  // the gaze axis. `FACE.eye` is [0.0335, -0.006, 0.0646] with a 10.7 mm
  // globe; a 45-degree half-cone comfortably contains the whole fissure.
  const eyeC = [0.0335, -0.006, 0.0646], eyeR = 0.0107;
  // Which *group* each covering triangle belongs to. `buildHead` emits the
  // skull, the ears (group 2), the upper lid (3) and the lower lid (4) into one
  // mesh, so "head geometry covers the eye" is not yet an answer — the answer
  // is a group index, and it decides whether this is a sculpt fold or a lid.
  // `buildHead` emits in a fixed order — skull grid, chin cap, ears, then the
  // two lids with their waterlines, caruncles and lashes — so a covering
  // triangle's *index* names the part it belongs to as reliably as a draw group
  // would, and the builder's groups are smoothing groups, not draw groups.
  // Report the index span and the radial distance histogram: the lid band rides
  // at 1.105-1.36 globe radii (11.8-14.6 mm) and the socket floor is past
  // 20 mm, so the two cannot be confused.
  const totalTris = P.length / 9;
  const byGroup = {}; const idxSpan = [1e9, -1];
  const rows = { coveringTris: 0, coveringArea: 0, bbox: null, samples: [], nearest: null, byGroup, totalTris, idxSpan };
  const box = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  let nearest = 1e9;
  for (let t = 0; t < P.length; t += 9) {
    const { c, n } = tri(P, t);
    if (c[0] < 0) continue;                                   // one eye is enough
    const dx = c[0] - eyeC[0], dy = c[1] - eyeC[1], dz = c[2] - eyeC[2];
    const dl = Math.hypot(dx, dy, dz);
    if (dl < eyeR || dl > eyeR + 0.022) continue;             // not in the shell over the globe
    if (dz / dl < 0.707) continue;                            // outside a 45-degree aperture cone
    if (dl < eyeR + 0.005) {
      rows[c[1] > eyeC[1] ? 'upperAll' : 'lowerAll'] = (rows[c[1] > eyeC[1] ? 'upperAll' : 'lowerAll'] || 0) + 1;
    }
    const nl = Math.hypot(n[0], n[1], n[2]) || 1;
    // Front-face normal against the outward radial from the globe centre. A
    // lid or a cheek in front of the eye faces *out*; a fold faces back in,
    // and under DoubleSide that is what draws over the globe.
    const d = SIGN * (n[0] * dx + n[1] * dy + n[2] * dz) / (nl * dl);
    if (d >= 0) continue;
    rows.coveringTris++;
    rows.coveringArea += nl * 0.5;
    const ti = t / 9;
    // `buildHead` emits the skull grid and its chin cap first (8588 triangles at
    // the shipped 76x56 tessellation), then the ears and the two lid
    // assemblies. Splitting there is what separates "the sculpt has folded"
    // from "a lid is in the way", and the two were confounded for three rounds
    // of this investigation because they overlap in distance from the globe.
    rows[ti < 8588 ? 'skull' : 'furniture'] = (rows[ti < 8588 ? 'skull' : 'furniture'] || 0) + 1;
    if (ti < 8588) rows.skullArea = (rows.skullArea || 0) + nl * 0.5;
    idxSpan[0] = Math.min(idxSpan[0], ti); idxSpan[1] = Math.max(idxSpan[1], ti);
    const bucket = Math.round(dl * 1000);
    byGroup[bucket] = (byGroup[bucket] || 0) + 1;
    nearest = Math.min(nearest, dl - eyeR);
    for (let k = 0; k < 3; k++) {
      box[k] = Math.min(box[k], c[k]);
      box[k + 3] = Math.max(box[k + 3], c[k]);
    }
    if (rows.samples.length < 6) rows.samples.push({ at: c.map((q) => r(q)), dot: r(d, 3) });
  }
  rows.coveringArea = r(rows.coveringArea * 1e6, 1);          // mm^2
  rows.skullArea = r((rows.skullArea || 0) * 1e6, 1);         // mm^2 — THE number
  rows.bbox = rows.coveringTris ? box.map((q) => r(q)) : null;
  rows.nearest = rows.coveringTris ? r(nearest, 4) : null;
  out.chars[key] = rows;
}

return out;
