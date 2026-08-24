/**
 * Anthropometric proportion bench for heads.
 *
 *   node src/tools/probe.mts src/tools/probes/headprop.mts --dirty
 *
 * ## Why this exists
 *
 * `headprofile.mts` measures the mid-sagittal *outline* in 24 bands over a
 * 238 mm head — 9.9 mm a band — and now says so in its own `blindTo` field.
 * It cannot see **where a feature sits**, only that the outline wiggles: a head
 * with the eye line at 0.40 of its height and one with it at 0.52 score
 * identically, because both wiggle by the same amount. "Infant proportions" is
 * exactly that class, and it is what a blind judge called the single worst
 * frame in the game while the profile bench read 0.445-0.497 relief.
 *
 * So this bench measures **heights of named landmarks as a fraction of head
 * height**, and compares them against published adult-male means rather than
 * against anybody's eye.
 *
 * ## The reference (Farkas, *Anthropometry of the Head and Face*, 2nd ed.,
 * North American white males 18-25; head height v-gn 232 mm)
 *
 * | landmark | mm above menton | / head height, from the VERTEX |
 * |---|---|---|
 * | vertex (v)                    | 232 | 0.000 |
 * | nasion (n, bridge root)       | 121.6 | 0.477 |
 * | pupil / eye line              | ~111 | 0.520 |
 * | subnasale (sn, nose base)     | 72.6 | 0.688 |
 * | stomion (sto, mouth line)     | 50.6 | 0.782 |
 * | menton (gn)                   | 0   | 1.000 |
 *
 * Derived, and these are the ones that fail loudly when a head reads as a
 * child: **n-gn / v-gn = 0.523**, **sn-gn / v-gn = 0.312**,
 * **sto-gn / v-gn = 0.218**, **n-sn / v-gn = 0.211** (the nose), and the
 * classical thirds **n-sn : sn-gn = 0.68 : 1.00**.
 *
 * The ear: superaurale is level with the brow and subaurale with subnasale, so
 * ear length / head height = 62.4 / 232 = **0.269**, and the tragion sits on the
 * Frankfort horizontal with orbitale — ~10 mm *below* the pupil, not 25.
 *
 * Widths: head breadth eu-eu 154 mm, bizygomatic zy-zy 137 mm, bigonial go-go
 * 97 mm. **go-go / eu-eu = 0.63** is the number that separates an adult male
 * from an infant: a baby's vault is adult-sized while its mandible is not.
 *
 * ## What this bench is BLIND to
 *
 * 1. **Everything off the midline except three width bands.** It is a
 *    landmark-height instrument. A face with correct proportions and no mouth
 *    relief scores perfectly here — that is `brushsurvive.mts`'s question.
 * 2. **Shading, normals and the frame.** It reads the position buffer.
 * 3. **Hair.** Every ratio is on the bare skull; a groom moves the apparent
 *    vertex and the judge sees the groom.
 *
 * The landmark extractor is the risky part, so it is run first on a synthetic
 * head whose landmark heights are *chosen* — if it cannot recover those, no
 * number below it means anything.
 */

const g = window.GAME;
g.settle(20);

/**
 * Mid-sagittal strip half-width.
 *
 * **4 mm, and it was 10.** At 10 mm the strip reaches the nostril brush
 * (centred at x = 9.2 mm) and the alar crease, whose z is 15 mm behind the
 * dorsum's. Which of those a given 1 mm height band contains depends on how the
 * brushes moved that row in y, so the front-most z alternated between the
 * dorsum and the nostril from band to band — a 5-7 mm saw-tooth at 1 mm pitch,
 * twenty spurious extrema down one nose, and `nth('min', 0)` picking the first
 * of them as the subnasale. The dorsum is 8 mm wide; the strip has to fit
 * inside it.
 */
const SAG = 0.004;

const r = (x, n = 4) => (x === null || x === undefined || !isFinite(x) ? null : +x.toFixed(n));

/** Farkas-derived adult-male targets, as fractions of head height v-gn. */
const NORM = {
  nasionFromVertex: 0.477,
  /**
   * Derived, not looked up: Farkas does not publish v-pupil. The nasion is at
   * 0.477 and the pupil sits 10-11 mm below it on a 232 mm head, so 0.520.
   * The drawing canon's "eyes at the halfway point" is 0.50 and disagrees with
   * Farkas' own n-gn; 0.50-0.53 is the honest band and this is its middle.
   */
  eyeFromVertex: 0.520,
  subnasaleFromVertex: 0.688,
  stomionFromVertex: 0.782,
  noseLen: 0.211,        // n-sn
  lowerFace: 0.312,      // sn-gn
  chinBlock: 0.218,      // sto-gn
  earLen: 0.269,
  earCentreBelowEye: 0.056,   // ~13 mm on a 232 mm head
  goGoOverEuEu: 0.63,
  zyZyOverEuEu: 0.89,
  cephalicIndex: 79,
};

/**
 * The extractor. `pts` is a flat [x,y,z,...] cloud in canonical head space
 * (+Y up, +Z forward). `sagHalf` is the midline strip half-width.
 *
 * Midline front outline z(y) is sampled into 1 mm bands, which is ten times
 * finer than `headprofile.mts` and below every feature this is looking for.
 */
function landmarks(pts, sagHalf) {
  let yMin = Infinity, yMax = -Infinity, xMax = 0, zMin = Infinity, zMax = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    const y = pts[i + 1], z = pts[i + 2];
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
    if (Math.abs(pts[i]) > xMax) xMax = Math.abs(pts[i]);
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  const BAND = 0.001;
  const NB = Math.max(4, Math.ceil((yMax - yMin) / BAND));
  const zf = new Array(NB).fill(-Infinity);   // midline front-most z
  const wAll = new Array(NB).fill(-Infinity); // half-width, all z
  const bandOf = (y) => Math.min(NB - 1, Math.max(0, Math.floor((y - yMin) / BAND)));
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1], z = pts[i + 2];
    const b = bandOf(y);
    if (Math.abs(x) > wAll[b]) wAll[b] = Math.abs(x);
    // **`z > 0` is load-bearing.** The midline strip contains the *back* of the
    // skull as well as the front, and the occiput brushes move those vertices
    // in y, so their heights interleave with the face's. A band that happens to
    // hold only a back-of-skull vertex then reports a front-most z of -0.09 —
    // which the first version of this bench returned as "the nasion" on all
    // four characters at once. Only the front half is the facial profile.
    if (Math.abs(x) <= sagHalf && z > 0 && z > zf[b]) zf[b] = z;
  }

  /**
   * **The band grid is finer than the mesh, so bands come up empty and a gap
   * reads as `-Infinity` — which the first version of this then happily
   * returned as "the nasion", 25 mm low, on all four characters at once.**
   * The head grid's rows are ~2.5 mm apart on the face and 5.4 mm at the crown;
   * 1 mm bands are deliberately finer than that so a 3 mm mouth line is not
   * quantised away, and the price is that every second or third band is empty.
   * Fill them by linear interpolation between the nearest occupied neighbours,
   * and report how many there were: a fill fraction near 1 means the profile
   * being measured is the interpolation, not the mesh.
   */
  const fill = (arr) => {
    let filled = 0, first = -1, last = -1;
    for (let b = 0; b < NB; b++) if (isFinite(arr[b])) { if (first < 0) first = b; last = b; }
    if (first < 0) return { filled: NB, first, last };
    for (let b = first + 1; b < last; b++) {
      if (isFinite(arr[b])) continue;
      let hi = b; while (hi <= last && !isFinite(arr[hi])) hi++;
      let lo = b - 1;
      for (let k = b; k < hi; k++) arr[k] = arr[lo] + (arr[hi] - arr[lo]) * (k - lo) / (hi - lo);
      filled += hi - b;
      b = hi;
    }
    for (let b = 0; b < first; b++) arr[b] = arr[first];
    for (let b = last + 1; b < NB; b++) arr[b] = arr[last];
    return { filled, first, last };
  };
  const fz = fill(zf), fw = fill(wAll);

  const yOf = (b) => yMin + (b + 0.5) * BAND;

  // Menton: the lowest midline band that is still *in front*. The mesh wraps
  // under the jaw into the neck, so the lowest point overall is that wrap and
  // not the chin. "In front" is a fraction of the way from the back of the
  // skull to the chin's own prominence, which is scale-free.
  const zFrontMax = Math.max(...zf.filter(isFinite));
  const chinGate = 0.34 * zFrontMax;
  let mentonB = fz.first;
  for (let b = fz.first; b <= fz.last; b++) { if (zf[b] >= chinGate) { mentonB = b; break; } }
  const vertexB = fz.last;

  const H = yOf(vertexB) - yOf(mentonB);
  const frac = (b) => (yOf(vertexB) - yOf(b)) / H;
  const win = (f) => Math.max(1, Math.round(f * H / BAND));

  /**
   * Every local extremum of the outline with at least `prom` of prominence,
   * in order from the vertex down, as `{b, kind, prom}`.
   *
   * **A named-landmark search over a window is not good enough here, and the
   * first two versions of this bench both got it wrong in ways that flattered
   * the head.** The nose carries a 3 mm wobble halfway down it, and a
   * "first local minimum below the tip" stopped there and reported the
   * subnasale 24 mm high — which made `sn-gn` come out at exactly the adult
   * norm on a head whose lower face is a quarter short. Prominence is what
   * separates a feature from a wobble, so the landmarks are assigned by
   * *order* over the prominent extrema, which is how the anatomy is actually
   * defined: below the nose tip there is the subnasale, then the upper lip,
   * then the mouth line, then the lower lip, then the mentolabial sulcus, then
   * the chin. Six in that order, always.
   */
  const extrema = (prom) => {
    // every local extremum, top-down, as an alternating sequence
    let e = [];
    for (let b = fz.last - 1; b > mentonB; b--) {
      const up = zf[b] - zf[b + 1], dn = zf[b] - zf[b - 1];
      if (up > 0 && dn > 0) e.push({ b, kind: 'max', z: zf[b] });
      else if (up < 0 && dn < 0) e.push({ b, kind: 'min', z: zf[b] });
    }
    // collapse runs of the same kind to the extreme member, so the sequence
    // alternates min,max,min,... whatever the noise did
    const alt = [];
    for (const q of e) {
      const p = alt[alt.length - 1];
      if (p && p.kind === q.kind) { if (q.kind === 'max' ? q.z > p.z : q.z < p.z) alt[alt.length - 1] = q; }
      else alt.push(q);
    }
    // persistence: drop the least prominent adjacent pair until every surviving
    // swing clears `prom`. This is what tells a feature from a wobble.
    let list = alt;
    for (;;) {
      let worst = -1, worstD = Infinity;
      for (let i = 0; i + 1 < list.length; i++) {
        const d = Math.abs(list[i].z - list[i + 1].z);
        if (d < worstD) { worstD = d; worst = i; }
      }
      if (worst < 0 || worstD >= prom) break;
      list = list.filter((_, i) => i !== worst && i !== worst + 1);
      const merged = [];
      for (const q of list) {
        const p = merged[merged.length - 1];
        if (p && p.kind === q.kind) { if (q.kind === 'max' ? q.z > p.z : q.z < p.z) merged[merged.length - 1] = q; }
        else merged.push(q);
      }
      list = merged;
    }
    return list;
  };
  const ex = extrema(0.0025);

  // Pronasale: the front-most band of the whole face. Unambiguous, no search.
  let prnB = mentonB;
  for (let b = mentonB; b <= vertexB; b++) if (zf[b] > zf[prnB]) prnB = b;

  // Above the tip: the last prominent minimum is the nasion (the brow's own
  // maximum sits above it and the bridge below it).
  const above = ex.filter((q) => q.b > prnB);
  // the *deepest* prominent minimum above the tip: the bridge carries shallower
  // wobbles and the nasion is the notch, so min-z picks it and 'the last one'
  // does not.
  const aboveMins = above.filter((q) => q.kind === 'min');
  const nasionB = (aboveMins.length
    ? aboveMins.reduce((p, q) => (q.z < p.z ? q : p))
    : { b: prnB + win(0.05) }).b;

  // Below the tip, in order: subnasale, upper lip, stomion, lower lip,
  // mentolabial sulcus, pogonion.
  const below = ex.filter((q) => q.b < prnB);
  const nth = (kind, n, fb) => {
    const list = below.filter((q) => q.kind === kind);
    return list.length > n ? list[n].b : fb;
  };
  const snB = nth('min', 0, Math.max(mentonB, prnB - win(0.08)));
  const ulB = nth('max', 0, snB - 1);
  const stoB = nth('min', 1, Math.max(mentonB, snB - win(0.06)));
  const llB = nth('max', 1, stoB - 1);
  const sulB = nth('min', 2, Math.max(mentonB, stoB - win(0.06)));
  // The chin's own projection is small enough on some heads to fall under the
  // prominence floor, which is itself the finding — so it is measured, not
  // searched: the front-most band below the sulcus, and how far it stands out.
  let pogB = mentonB;
  for (let b = mentonB; b <= sulB; b++) if (zf[b] > zf[pogB]) pogB = b;

  return {
    yMin: r(yMin), yMax: r(yMax), headHeight: r(H),
    headBreadth: 2 * xMax, headDepth: zMax - zMin,
    cephalicIndex: r(2 * xMax / (zMax - zMin) * 100, 1),
    /** Fraction of 1 mm bands that had to be interpolated. Near 1 = fiction. */
    interpFrac: { midline: r(fz.filled / NB, 3), width: r(fw.filled / NB, 3) },
    y: {
      vertex: r(yOf(vertexB)), nasion: r(yOf(nasionB)), pronasale: r(yOf(prnB)),
      subnasale: r(yOf(snB)), stomion: r(yOf(stoB)), pogonion: r(yOf(pogB)),
      menton: r(yOf(mentonB)),
    },
    z: {
      nasion: r(zf[nasionB]), pronasale: r(zf[prnB]), subnasale: r(zf[snB]),
      stomion: r(zf[stoB]), pogonion: r(zf[pogB]),
    },
    /** The prominent extrema the assignment above was made from, auditable. */
    extrema: ex.map((q) => `${q.kind}@${Math.round((yOf(vertexB) - yOf(q.b)) * 1000)}:${(q.z * 1000).toFixed(1)}`).join(' '),
    relief: {
      /** brow max -> nasion. An adult male profile has 6-10 mm here. */
      nasionMm: r(1000 * (zf[Math.min(fz.last, nasionB + win(0.06))] - zf[nasionB]), 2),
      /** nose tip -> subnasale. */
      noseProjMm: r(1000 * (zf[prnB] - zf[snB]), 2),
      /** upper lip and lower lip against the mouth line: the mouth's own relief. */
      upperLipMm: r(1000 * (zf[ulB] - zf[stoB]), 2),
      lowerLipMm: r(1000 * (zf[llB] - zf[stoB]), 2),
      /** how far the chin stands out of the mentolabial sulcus. Adult: 4-6 mm. */
      pogonionMm: r(1000 * (zf[pogB] - zf[sulB]), 2),
    },
    frac: {
      nasion: r(frac(nasionB), 3), pronasale: r(frac(prnB), 3),
      subnasale: r(frac(snB), 3), stomion: r(frac(stoB), 3), menton: 1,
    },
    ratio: {
      noseLen: r(frac(snB) - frac(nasionB), 3),
      lowerFace: r(1 - frac(snB), 3),
      chinBlock: r(1 - frac(stoB), 3),
      faceHeight: r(1 - frac(nasionB), 3),
      /** the classical lower two thirds: n-sn against sn-gn. Farkas: 0.68. */
      thirds: r((frac(snB) - frac(nasionB)) / Math.max(1e-6, 1 - frac(snB)), 3),
      /**
       * Mouth relief: how far the stomion sits behind the fullest point of the
       * lip above it and the lip below it, whichever is nearer. This is the
       * depth a light has to find to draw a mouth line, and it is the number
       * `headprofile.mts` is structurally unable to report.
       */
      mouthReliefMm: r(1000 * (Math.min(zf[ulB], zf[llB]) - zf[stoB]), 2),
    },
    /**
     * The midline front outline itself, every 2 mm from the vertex to the
     * menton, as `y_mm_below_vertex:z_mm`. A peak-finder is a hypothesis about
     * a curve; this is the curve. Read it before believing any landmark above.
     */
    outline: (() => {
      const o = [];
      for (let b = vertexB; b >= mentonB; b -= 2) {
        o.push(`${Math.round((yOf(vertexB) - yOf(b)) * 1000)}:${(zf[b] * 1000).toFixed(1)}`);
      }
      return o.join(' ');
    })(),
    _b: { NB, BAND, yMin, mentonB, vertexB, H },
    _w: wAll, _zf: zf,
  };
}

/** Half-width at a given canonical y, from the (gap-filled) width table. */
function widthAt(L, y) {
  const b = Math.min(L._b.NB - 1, Math.max(0, Math.floor((y - L._b.yMin) / L._b.BAND)));
  let m = 0;
  for (let k = Math.max(0, b - 2); k <= Math.min(L._b.NB - 1, b + 2); k++) m = Math.max(m, L._w[k]);
  return m;
}

/**
 * The half-width profile as 12 samples from the vertex to the menton, each
 * normalised by the maximum. This is the coronal shape in one line, and it is
 * where "barrel" shows up: an adult male runs roughly
 * 0.33 0.60 0.80 0.93 0.99 1.00 0.98 0.92 0.83 0.72 0.60 0.42 —
 * an infant's stays near 1.0 far further down, because the vault is nearly
 * adult-sized while the mandible is not.
 */
function widthProfile(L) {
  const out = [];
  for (let k = 0; k < 12; k++) {
    const y = L.y.vertex - (k + 0.5) / 12 * L._b.H;
    out.push(widthAt(L, y));
  }
  const m = Math.max(...out) || 1;
  return out.map((v) => r(v / m, 3));
}

// ---- control: a synthetic head whose landmark heights are CHOSEN -----------
// If the extractor cannot recover these it is measuring itself, and every
// number below is noise. Ellipsoid + a nose ridge, a mouth groove and a chin.
function syntheticHead(want, rows) {
  const p = [];
  const hx = 0.078, hy = 0.111, hz = 0.096;
  const NV = rows || 200;
  for (let i = 0; i <= NV; i++) {
    const phi = (i / NV) * Math.PI;
    for (let j = 0; j <= 220; j++) {
      const th = (j / 220) * Math.PI * 2;
      const cy = Math.cos(phi), s = Math.sin(phi);
      let x = s * Math.sin(th) * hx, y = cy * hy, z = s * Math.cos(th) * hz;
      if (z > 0 && want.prn < 1) {
        const G = (dy, wy) => Math.exp(-Math.pow((y - dy) / wy, 2) - Math.pow(x / 0.022, 2));
        z -= 0.007 * G(want.n, 0.007);        // nasion notch
        z += 0.020 * G(want.prn, 0.014);      // nose tip
        // **A decoy.** The shipped nose carries a ~3 mm wobble on the dorsum,
        // and a "first local minimum below the tip" search stopped on it and
        // put the subnasale 24 mm high — which made this head's lower face
        // measure at exactly the adult norm when it is a quarter short. The
        // control has to contain the thing that fooled the instrument.
        z += 0.003 * G(want.prn - 0.004, 0.003);
        z -= 0.009 * G(want.sn, 0.006);       // subnasale
        z += 0.012 * G(want.ul, 0.005);       // upper lip
        z -= 0.008 * G(want.sto, 0.004);      // mouth line
        z += 0.011 * G(want.ll, 0.005);       // lower lip
        z += 0.010 * G(want.pog, 0.010);      // chin
      }
      p.push(x, y, z);
    }
  }
  return p;
}

const out = { norm: NORM, controls: {}, chars: {} };

{
  // Heights chosen to be the adult-male norms on a 217 mm synthetic head, so
  // the control also says what a correct head looks like coming out of here.
  const want = { n: 0.0065, prn: -0.0395, sn: -0.0555, ul: -0.0645, sto: -0.0725, ll: -0.0795, pog: -0.0935 };
  const err = (L) => ({
    nasion: r((L.y.nasion - want.n) * 1000, 1),
    pronasale: r((L.y.pronasale - want.prn) * 1000, 1),
    subnasale: r((L.y.subnasale - want.sn) * 1000, 1),
    stomion: r((L.y.stomion - want.sto) * 1000, 1),
  });
  const fine = landmarks(syntheticHead(want, 200), SAG);
  out.controls.syntheticFineRows = {
    rowSpacingMm: r(Math.PI * 111 / 200, 2), want, got: fine.y, errMm: err(fine),
    interpFrac: fine.interpFrac, frac: fine.frac, relief: fine.relief, extrema: fine.extrema,
  };
  // **The control that matters**: the same head sampled at the shipped grid's
  // own row count, so most 1 mm bands are empty. The first version of this
  // bench had no such control, and on the real mesh it returned the *back of
  // the skull* as the nasion on all four characters at once.
  const coarse = landmarks(syntheticHead(want, 120), SAG);
  out.controls.syntheticMeshRows = {
    rowSpacingMm: r(Math.PI * 111 / 120, 2), want, got: coarse.y, errMm: err(coarse),
    interpFrac: coarse.interpFrac, frac: coarse.frac, relief: coarse.relief, extrema: coarse.extrema,
  };
  // A bare ellipsoid: the extractor must not report a face on a head that has
  // none. `extrema` comes back with one entry and every landmark falls back to
  // its search window — which is what the numbers here are, and why they must
  // be read before any row below.
  const flat = landmarks(syntheticHead({ n: 9, prn: 9, sn: 9, ul: 9, sto: 9, ll: 9, pog: 9 }, 200), SAG);
  out.controls.bareEllipsoid = {
    frac: flat.frac, extrema: flat.extrema, relief: flat.relief,
    mouthReliefMm: flat.ratio.mouthReliefMm, widthProfile: widthProfile(flat),
  };
}

// ---- the cast --------------------------------------------------------------
const party = g.get('Party');
const player = g.get('Player');
const who = [['noctis', player], ['gladio', party && party.get && party.get('gladio')],
  ['ignis', party && party.get && party.get('ignis')], ['prompto', party && party.get && party.get('prompto')]];

for (const [key, m] of who) {
  const ch = m && m.character;
  if (!ch || !ch.head) { out.chars[key] = null; continue; }
  const dims = ch.rig.dims;
  const o = dims.headOrigin, sc = dims.headScale;
  const pos = ch.head.geometry.getAttribute('position');
  const toCanon = (i) => [(pos.getX(i) - o.x) / sc, (pos.getY(i) - o.y) / sc, (pos.getZ(i) - o.z) / sc];

  // The skull grid is emitted first, row-major, (segV+1) x (segU+1); the chin
  // cap, the ears and the lids follow it. Splitting there is what lets the ear
  // be measured separately from the skull it stands off.
  const SEGU = 144, SEGV = 120;
  const NSK = (SEGU + 1) * (SEGV + 1);
  const skull = [];
  for (let i = 0; i < Math.min(NSK, pos.count); i++) skull.push(...toCanon(i));

  const L = landmarks(skull, SAG);

  // Ears: everything after the skull grid + cap that is lateral of the lids.
  let eyMin = Infinity, eyMax = -Infinity, ezMin = Infinity, ezMax = -Infinity, exMax = 0, nEar = 0;
  for (let i = NSK + 1; i < pos.count; i++) {
    const [x, y, z] = toCanon(i);
    if (Math.abs(x) < 0.055) continue;         // lids/lashes live at |x| ~ 0.033
    nEar++;
    if (y < eyMin) eyMin = y;
    if (y > eyMax) eyMax = y;
    if (z < ezMin) ezMin = z;
    if (z > ezMax) ezMax = z;
    if (Math.abs(x) > exMax) exMax = Math.abs(x);
  }

  // The eye line, from the eye globes themselves rather than from the recipe.
  // Each globe is a child of the head bone at `bindEyePos - P.head`, so
  // `gp.position + P.head` is the bind-space eye centre and the canonical one
  // is that minus `headOrigin`, over `headScale`. No matrices, no THREE.
  let eyeY = null, eyeX = null, eyeZ = null;
  if (ch.eyeGlobes && ch.eyeGlobes.length && ch.rig.P && ch.rig.P.head) {
    const ph = ch.rig.P.head;
    let ay = 0, az = 0, ax = 0;
    for (const gp of ch.eyeGlobes) {
      ay += (gp.position.y + ph.y - o.y) / sc;
      az += (gp.position.z + ph.z - o.z) / sc;
      ax += Math.abs((gp.position.x + ph.x - o.x) / sc);
    }
    const n = ch.eyeGlobes.length;
    eyeY = ay / n; eyeZ = az / n; eyeX = ax / n;
  }

  const H = L.headHeight;
  const fr = (y) => (L.y.vertex - y) / H;
  const euEu = L.headBreadth;
  // zygomatic breadth is taken at the eye line, bigonial at the mouth line —
  // the two heights the landmark pass already located, not constants.
  const zyZy = 2 * widthAt(L, eyeY !== null ? eyeY : L.y.nasion - 0.012);
  const goGo = 2 * widthAt(L, L.y.stomion);

  out.chars[key] = {
    verts: pos.count, skullVerts: NSK, earVerts: nEar,
    headHeightMm: r(H * sc * 1000, 1),
    headBreadthMm: r(euEu * sc * 1000, 1),
    interpFrac: L.interpFrac,
    widthProfile: widthProfile(L),
    headDepthMm: r(L.headDepth * sc * 1000, 1),
    cephalicIndex: L.cephalicIndex,
    extrema: L.extrema,
    relief: L.relief,
    outline: L.outline,
    y: L.y,
    z: L.z,
    frac: L.frac,
    ratio: L.ratio,
    eye: eyeY === null ? null : {
      yCanon: r(eyeY), fromVertex: r(fr(eyeY), 3),
      halfSepMm: r(eyeX * sc * 1000, 1), zCanon: r(eyeZ),
    },
    ear: nEar === 0 ? null : {
      superaurale: r(eyMax), subaurale: r(eyMin),
      lenOverHead: r((eyMax - eyMin) / H, 3),
      centreY: r((eyMax + eyMin) / 2),
      centreBelowEyeOverHead: eyeY === null ? null : r((eyeY - (eyMax + eyMin) / 2) / H, 3),
      zCentre: r((ezMax + ezMin) / 2),
      /** 0 = at the front of the head, 1 = at the back. Farkas: ~0.50. */
      zFromFront: r((L.z.pronasale - (ezMax + ezMin) / 2) / L.headDepth, 3),
      lateralMm: r(exMax * sc * 1000, 1),
    },
    widths: {
      euEuMm: r(euEu * sc * 1000, 1),
      zyZyMm: r(zyZy * sc * 1000, 1),
      goGoMm: r(goGo * sc * 1000, 1),
      zyOverEu: r(zyZy / euEu, 3),
      goOverEu: r(goGo / euEu, 3),
    },
    /** signed error against the adult-male mean, in fractions of head height. */
    err: {
      nasion: r(L.frac.nasion - NORM.nasionFromVertex, 3),
      eye: eyeY === null ? null : r(fr(eyeY) - NORM.eyeFromVertex, 3),
      subnasale: r(L.frac.subnasale - NORM.subnasaleFromVertex, 3),
      stomion: r(L.frac.stomion - NORM.stomionFromVertex, 3),
      noseLen: r(L.ratio.noseLen - NORM.noseLen, 3),
      lowerFace: r(L.ratio.lowerFace - NORM.lowerFace, 3),
      chinBlock: r(L.ratio.chinBlock - NORM.chinBlock, 3),
      earLen: nEar === 0 ? null : r((eyMax - eyMin) / H - NORM.earLen, 3),
      goOverEu: r(goGo / euEu - NORM.goGoOverEuEu, 3),
      zyOverEu: r(zyZy / euEu - NORM.zyZyOverEuEu, 3),
    },
  };
}

out.blindTo = 'landmark heights on the midline plus three width bands. '
  + 'Blind to all off-midline relief (use brushsurvive.mts), to shading and '
  + 'normals, and to hair. Correct proportions here say nothing about whether '
  + 'the features read in a frame.';

return out;
