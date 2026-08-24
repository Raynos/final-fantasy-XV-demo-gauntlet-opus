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
function landmarks(pts, sagHalf, prom) {
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
  const ex = extrema(prom === undefined ? 0.0025 : prom);

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
  /**
   * **The lower lip and the mentolabial sulcus are found by range search, not
   * by the extremum list, and the depth controls are what forced that.**
   *
   * On a head built to Arnett's adult-male means the labrale-inferius swing is
   * *0.8 mm* (stomion +0.2, lower lip +1.0) — a third of this extractor's
   * 2.5 mm prominence floor, which exists to kill a 3 mm wobble on the nasal
   * dorsum. So on a **correct** adult profile the persistence filter merges the
   * stomion and the lower lip away, `nth('min', 2)` finds nothing, and the
   * sulcus falls back to a fixed window — which is why `controls.depthAdult`
   * first came back with `mentolabialMm: 0` and a null mentolabial angle on a
   * head whose sulcus was placed by hand at -5.3 mm. Lowering the floor is not
   * the fix: it re-admits the dorsum decoy that bug 3 was about.
   *
   * Below the stomion the anatomy is not ambiguous and needs no prominence at
   * all — there is one lip, one sulcus and one chin, in that order — so all
   * three are extrema *of a range*: the fullest point below the mouth line, the
   * deepest point below that, the fullest point below that. `pogB` was already
   * found this way for the same reason.
   */
  const argZ = (lo, hi, want) => {
    let best = Math.max(mentonB, Math.min(lo, hi));
    for (let b = Math.max(mentonB, Math.min(lo, hi)); b <= Math.max(lo, hi); b++) {
      if (want > 0 ? zf[b] > zf[best] : zf[b] < zf[best]) best = b;
    }
    return best;
  };
  // The order below the mouth line is fixed anatomy: lip, sulcus, chin. Take
  // the two *maxima* first and let the sulcus be the minimum strictly between
  // them — searching the sulcus downward from the lip instead walks it into the
  // jaw wrap under the menton, where z collapses to nothing and the chin
  // follows it there (measured: the adult control's sulcus came back 23.7 mm
  // low and its pogonion 25.5 mm low, and both landed on the same band).
  const llB = argZ(Math.max(mentonB + 1, stoB - win(0.075)), stoB - 1, +1);
  // Sulcus first, in a window 4-22 mm below the lower lip, then the chin as the
  // front-most band below *it*. Order matters and both windows are load-
  // bearing: "the front-most band below the lower lip" finds the **lip's own
  // skirt** on a head whose chin is retruded, which is precisely the head this
  // axis exists to catch — measured on Noctis it returned the pogonion 11 mm
  // high and 6 mm proud of where the chin actually is.
  const sulB = argZ(Math.max(mentonB + 1, llB - win(0.10)), Math.max(mentonB + 1, llB - win(0.02)), -1);
  const pogB0 = argZ(mentonB, Math.max(mentonB, sulB - 1), +1);
  const pogB = pogB0;

  /**
   * **Glabella** — the front-most band above the nasion, i.e. the brow's own
   * prominence. Needed by the facial-convexity angle. It is a *maximum* over a
   * range and not a persistence-filtered extremum on purpose: on a head with a
   * weak brow the glabella is a shoulder rather than a peak and a peak-finder
   * returns nothing, which would make the convexity angle silently absent on
   * exactly the heads it is most interesting on.
   *
   * **Columella** — the midpoint of the nose's underside, between subnasale
   * and pronasale. The nasolabial angle needs a second ray out of subnasale
   * and this is the standard one. Taken as the band halfway between them
   * rather than searched, because there is no extremum there to find.
   */
  let glaB = nasionB;
  for (let b = nasionB; b <= Math.min(fz.last, nasionB + win(0.13)); b++) if (zf[b] > zf[glaB]) glaB = b;
  const colB = Math.round((snB + prnB) / 2);

  return {
    yMin: r(yMin), yMax: r(yMax), headHeight: r(H),
    headBreadth: 2 * xMax, headDepth: zMax - zMin,
    cephalicIndex: r(2 * xMax / (zMax - zMin) * 100, 1),
    /** Fraction of 1 mm bands that had to be interpolated. Near 1 = fiction. */
    interpFrac: { midline: r(fz.filled / NB, 3), width: r(fw.filled / NB, 3) },
    y: {
      vertex: r(yOf(vertexB)), glabella: r(yOf(glaB)), nasion: r(yOf(nasionB)),
      pronasale: r(yOf(prnB)), columella: r(yOf(colB)),
      subnasale: r(yOf(snB)), labraleSup: r(yOf(ulB)), stomion: r(yOf(stoB)),
      labraleInf: r(yOf(llB)), sulcus: r(yOf(sulB)), pogonion: r(yOf(pogB)),
      menton: r(yOf(mentonB)),
    },
    z: {
      glabella: r(zf[glaB]), nasion: r(zf[nasionB]), pronasale: r(zf[prnB]),
      columella: r(zf[colB]), subnasale: r(zf[snB]), labraleSup: r(zf[ulB]),
      stomion: r(zf[stoB]), labraleInf: r(zf[llB]), sulcus: r(zf[sulB]),
      pogonion: r(zf[pogB]),
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

/**
 * ============================================================================
 * THE SAGITTAL DEPTH AXIS
 * ============================================================================
 *
 * Everything above this line measures **heights** (`landmarks`) or a
 * **half-width** profile (`widthProfile`). A head can score adult on every one
 * of those rows and still be a snout, because "how far forward is the lower
 * face" is the third axis and nothing here measured it. Round 13's blind judge:
 * *"the whole lower face is now a forward-tapering muzzle wedge with no lips,
 * philtrum or chin — the region regressed while the checklist item was ticked."*
 * That is a **depth** complaint, and both benches were structurally deaf to it.
 *
 * ## The reference frame problem, and why most published norms cannot be used
 *
 * The modern soft-tissue standards (Arnett's TVL, Holdaway's facial angle,
 * anything "to Frankfort") are measured against a **true vertical in natural
 * head position**. Canonical head space here is the model's own Y axis, which
 * is whatever `shellPoint` was authored around — tilt the head 8 degrees and
 * every one of those numbers moves several millimetres while the face is
 * unchanged. Quoting them against canonical Y would be measuring the rig's
 * posture and calling it anatomy.
 *
 * So the metrics below are split, and the split is the point:
 *
 * - **Primary — tilt-invariant.** Every reference line is drawn between two
 *   points *on the face itself*, so rotating the head rotates the line with it
 *   and the number does not move. These are the ones a verdict may rest on.
 * - **Secondary — tilt-dependent.** Reported because they are legible, flagged
 *   because they are only as good as `tiltProxyDeg`.
 *
 * ## Primary metrics and their adult-male norms
 *
 * | metric | what it is | adult male |
 * |---|---|---|
 * | `eLineLsMm` | labrale superius off the pronasale-pogonion line (Ricketts' E-line) | **-4** |
 * | `eLineLiMm` | labrale inferius off the same line | **-2** |
 * | `muzzleMm` | the furthest ANY midline point between subnasale and pogonion stands in front of the subnasale-pogonion chord | **3 to 6** |
 * | `nasolabialDeg` | columella - subnasale - labrale superius | **90 to 110** |
 * | `mentolabialMm` | how deep the sulcus is under the labrale-inferius-pogonion chord | **4 +/- 2** |
 * | `mentolabialDeg` | labrale inferius - sulcus - pogonion | **122 +/- 12** |
 * | `convexityDeg` | 180 minus the angle glabella - subnasale - pogonion | **12 +/- 4** |
 *
 * `muzzleMm` is the headline and the only one that needs no landmark naming at
 * all: it is a maximum over the raw outline between two unambiguous points.
 * A peak-finder is a hypothesis; this is the curve. Cross-checked two ways ->
 * Ricketts' E-line norms put the upper lip 4.2 mm in front of that chord and
 * Arnett's TVL means (subnasale 0, labrale superius +3.3, pogonion -3.5) put it
 * at 4.2 as well, which is why the band is stated as 3-6 and not as a point.
 *
 * ## What the depth axis is STILL blind to
 *
 * The midline only. The malar plane, the zygomatic arch and the cheek are
 * off-midline depth and none of them moves a number here — `head-r2.md` §8.2
 * is still the open item it was. And like every bench in this file it reads the
 * position buffer, so it cannot say whether the relief it measures survives the
 * shipped key.
 */
function sagittal(L, sc) {
  const M = (v) => r(v * sc * 1000, 2);              // canonical -> mm
  const P = (name) => [L.y[name], L.z[name]];
  /** Signed distance in front of the chord AB, at C's own height. + = in front. */
  const offChord = (A, B, C) => {
    const t = Math.abs(A[0] - B[0]) < 1e-9 ? 0 : (A[0] - C[0]) / (A[0] - B[0]);
    return C[1] - (A[1] + (B[1] - A[1]) * t);
  };
  /** Angle ABC in degrees, in the sagittal plane (z forward, y up). */
  const angAt = (A, B, C) => {
    const u = [A[1] - B[1], A[0] - B[0]], v = [C[1] - B[1], C[0] - B[0]];
    const lu = Math.hypot(u[0], u[1]), lv = Math.hypot(v[0], v[1]);
    if (!lu || !lv) return null;
    const c = Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (lu * lv)));
    return r(Math.acos(c) * 180 / Math.PI, 1);
  };

  const sn = P('subnasale'), pog = P('pogonion'), prn = P('pronasale');

  // The headline. Walk the raw 1 mm outline from subnasale to pogonion and take
  // the furthest point in front of the sn-pog chord. No landmark naming, no
  // peak-finder, no window: a maximum over the curve itself.
  let muzzle = -Infinity, muzzleAt = null;
  for (let b = L._b.mentonB; b < L._b.NB; b++) {
    const y = L._b.yMin + (b + 0.5) * L._b.BAND;
    if (y > sn[0] || y < pog[0]) continue;
    const d = offChord(sn, pog, [y, L._zf[b]]);
    if (d > muzzle) { muzzle = d; muzzleAt = y; }
  }

  return {
    primary: {
      muzzleMm: M(muzzle),
      muzzleAtMmBelowVertex: r((L.y.vertex - muzzleAt) * sc * 1000, 1),
      eLineLsMm: M(offChord(prn, pog, P('labraleSup'))),
      eLineLiMm: M(offChord(prn, pog, P('labraleInf'))),
      eLineStoMm: M(offChord(prn, pog, P('stomion'))),
      nasolabialDeg: angAt(P('columella'), sn, P('labraleSup')),
      mentolabialMm: M(-offChord(P('labraleInf'), pog, P('sulcus'))),   // + = deep
      mentolabialDeg: angAt(P('labraleInf'), P('sulcus'), pog),
      convexityDeg: (() => {
        const a = angAt(P('glabella'), sn, pog);
        return a === null ? null : r(180 - a, 1);
      })(),
    },
    secondary: {
      /** All against a vertical through subnasale in CANONICAL space. */
      _ref: 'canonical-Y vertical through subnasale; tilt-dependent, see tiltProxyDeg',
      glabellaMm: M(L.z.glabella - sn[1]),
      pronasaleMm: M(L.z.pronasale - sn[1]),
      labraleSupMm: M(L.z.labraleSup - sn[1]),
      stomionMm: M(L.z.stomion - sn[1]),
      labraleInfMm: M(L.z.labraleInf - sn[1]),
      sulcusMm: M(L.z.sulcus - sn[1]),
      pogonionMm: M(L.z.pogonion - sn[1]),
      /** Arnett's adult-male TVL means for the same rows, for reading against. */
      arnettMale: { glabella: -8.0, pronasale: 17, labraleSup: 3.3, labraleInf: 1.0, pogonion: -3.5 },
      /** nasion -> pogonion against canonical vertical. + = chin behind nasion. */
      facialPlaneDeg: r(Math.atan2(L.z.nasion - pog[1], L.y.nasion - pog[0]) * 180 / Math.PI, 1),
    },
    /**
     * The lower-face outline expressed as offset from the sn-pog chord, every
     * 2 mm. `muzzleMm` is the maximum of this list; read the list before
     * believing the maximum.
     */
    chordProfile: (() => {
      const o = [];
      for (let b = L._b.NB - 1; b >= L._b.mentonB; b--) {
        const y = L._b.yMin + (b + 0.5) * L._b.BAND;
        if (y > sn[0] || y < pog[0]) continue;
        if (Math.round((L.y.vertex - y) * 1000) % 2) continue;
        o.push(`${Math.round((L.y.vertex - y) * 1000)}:${M(offChord(sn, pog, [y, L._zf[b]])).toFixed(1)}`);
      }
      return o.join(' ');
    })(),
  };
}

/**
 * A synthetic head whose mid-sagittal **depth** profile is chosen point by
 * point, which is what the depth axis needs and `syntheticHead` cannot give:
 * that one adds gaussians of chosen *amplitude*, so the z a landmark ends up at
 * is the sum of an ellipsoid and several overlapping tails and is not known in
 * advance. Here the midline z at every height is exactly `prof`.
 *
 * `prof` is `[y, z]` control points, vertex first. Between them the profile is
 * linear, so every control point is a corner and therefore an extremum the
 * extractor must find; at x = 0 the returned surface passes through them
 * exactly. The lobe is 22 mm wide so the 4 mm sagittal strip stays inside it
 * (worst case x = 4 mm, weight 0.967).
 */
function syntheticDepthHead(prof, rows) {
  const p = [];
  const hx = 0.078, hy = 0.111, hz = 0.096;
  const NV = rows || 200;
  const zWant = (y) => {
    if (y >= prof[0][0]) return prof[0][1];
    for (let i = 1; i < prof.length; i++) {
      if (y >= prof[i][0]) {
        const t = (prof[i - 1][0] - y) / (prof[i - 1][0] - prof[i][0]);
        return prof[i - 1][1] + t * (prof[i][1] - prof[i - 1][1]);
      }
    }
    return prof[prof.length - 1][1];
  };
  for (let i = 0; i <= NV; i++) {
    const phi = (i / NV) * Math.PI;
    for (let j = 0; j <= 220; j++) {
      const th = (j / 220) * Math.PI * 2;
      const cy = Math.cos(phi), sp = Math.sin(phi);
      const x = sp * Math.sin(th) * hx, y = cy * hy;
      let z = sp * Math.cos(th) * hz;
      if (z > 0) {
        const zEll = hz * Math.sqrt(Math.max(0, 1 - (y / hy) * (y / hy)));
        z += Math.exp(-Math.pow(x / 0.022, 2)) * (zWant(y) - zEll);
      }
      p.push(x, y, z);
    }
  }
  return p;
}

/**
 * Build a lower-face depth profile from **offsets against the subnasale**, in
 * millimetres, which is how every published soft-tissue table states them.
 * The heights are the same ones `syntheticHead` uses, so the two controls are
 * the same head measured on two different axes.
 */
function depthProfile(o) {
  const H = { gla: 0.0175, n: 0.0065, prn: -0.0395, col: -0.0475, sn: -0.0555, ul: -0.0645, sto: -0.0705, ll: -0.0765, sul: -0.0855, pog: -0.0935, gn: -0.1055 };
  const zSn = 0.083;                                   // the ellipsoid's own z there
  const at = (mm) => zSn + mm / 1000;
  return [
    [0.111, 0.0], [0.060, at(-30)], [H.gla, at(o.gla)], [H.n, at(o.n)],
    [H.prn, at(o.prn)], [H.col, at(o.col)], [H.sn, 0 + at(0)],
    [H.ul, at(o.ul)], [H.sto, at(o.sto)], [H.ll, at(o.ll)],
    [H.sul, at(o.sul)], [H.pog, at(o.pog)], [H.gn, at(o.gn)], [-0.111, 0.0],
  ];
}

/**
 * The two heads that make the depth axis worth quoting. Both are the same
 * skull with the same landmark *heights*; they differ only in depth, which is
 * exactly the pair the height bench and the width bench cannot tell apart.
 *
 * - `depthAdult` is built to Arnett's adult-male soft-tissue means
 *   (glabella -8, pronasale +17, labrale superius +3.3, inferius +1.0,
 *   pogonion -3.5, all against the subnasale). It must come back inside every
 *   band in `ZNORM`.
 * - `depthMuzzle` is that head with the lips driven 12 and 8 mm forward and
 *   the sulcus and chin driven 12 and 8 mm back — the shape round 13 named.
 *   It must come back **outside** every band, in the right direction.
 *
 * An instrument that cannot separate these two is not measuring depth, and the
 * height bench above genuinely cannot: both heads return identical `frac`,
 * identical `ratio` and an identical `widthProfile`.
 */
const DEPTH_ADULT = { gla: -8, n: -12, prn: 17, col: 6, ul: 3.3, sto: 0.2, ll: 1.0, sul: -5.3, pog: -3.5, gn: -7 };
const DEPTH_MUZZLE = { gla: -8, n: -12, prn: 17, col: 6, ul: 15.3, sto: 6, ll: 9.0, sul: -17.3, pog: -11.5, gn: -15 };

/**
 * Adult-male norms for the depth axis. See `sagittal`'s header for sources.
 *
 * **Two of these are calibrated off `controls.depthAdult` rather than quoted
 * from a table, and that is deliberate.**
 *
 * - `nasolabialDeg`. The published 90-110 is measured against the *tangent to
 *   the columella*, which a midline outline in 1 mm bands does not have. This
 *   one is `subnasale -> the outline 8 mm above it`, a different ray, and the
 *   adult control — built to Arnett's own subnasale/pronasale/labrale means —
 *   reads **126** through it. So the band here is 126 +/- 15, i.e. the
 *   instrument's own reading on a head whose answer is known, and quoting the
 *   textbook 90-110 against it would have condemned a correct nose.
 * - `convexityDeg` **does not discriminate and is reported for completeness
 *   only.** A bare featureless ellipsoid scores 12.2 through it — dead centre
 *   of the adult band — because glabella, subnasale and pogonion all sit on one
 *   smooth curve whatever is or is not carved between them.
 */
const ZNORM = {
  muzzleMm: [3, 6], eLineLsMm: [-6, -1], eLineLiMm: [-4, 0],
  nasolabialDeg: [111, 141], mentolabialMm: [2, 6], mentolabialDeg: [110, 134],
  convexityDeg: [8, 16],
  _notDiscriminating: ['convexityDeg'],
  _calibratedOffControl: ['nasolabialDeg'],
};

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
    /** No face, so no muzzle: this must be ~0 and every angle near straight. */
    sagittal: sagittal(flat, 1).primary,
  };
}

// ---- controls for the DEPTH axis ------------------------------------------
// Two heads with identical landmark heights and identical widths that differ
// only in sagittal depth. `sagittal` must separate them; nothing above it can.
{
  const run = (o, rows, prom) => {
    const L = landmarks(syntheticDepthHead(depthProfile(o), rows), SAG, prom);
    return { L, s: sagittal(L, 1) };
  };
  const zErr = (L, o) => {
    const sn = L.z.subnasale;
    const e = (k, want) => r((L.z[k] - sn) * 1000 - want, 1);
    return {
      glabella: e('glabella', o.gla), pronasale: e('pronasale', o.prn),
      labraleSup: e('labraleSup', o.ul), stomion: e('stomion', o.sto),
      labraleInf: e('labraleInf', o.ll), sulcus: e('sulcus', o.sul),
      pogonion: e('pogonion', o.pog),
    };
  };
  const adult = run(DEPTH_ADULT, 200, 0.0025);
  const muzzle = run(DEPTH_MUZZLE, 200, 0.0025);
  // The shipped grid's own row count, so most 1 mm bands are interpolated.
  const adultCoarse = run(DEPTH_ADULT, 120, 0.0025);

  out.controls.depthAdult = {
    wantMmFromSubnasale: DEPTH_ADULT, recoveredErrMm: zErr(adult.L, DEPTH_ADULT),
    sagittal: adult.s.primary, chordProfile: adult.s.chordProfile,
    frac: adult.L.frac, widthProfile: widthProfile(adult.L),
    interpFrac: adult.L.interpFrac, extrema: adult.L.extrema,
  };
  out.controls.depthAdultMeshRows = {
    recoveredErrMm: zErr(adultCoarse.L, DEPTH_ADULT), sagittal: adultCoarse.s.primary,
    interpFrac: adultCoarse.L.interpFrac,
  };
  out.controls.depthMuzzle = {
    wantMmFromSubnasale: DEPTH_MUZZLE, recoveredErrMm: zErr(muzzle.L, DEPTH_MUZZLE),
    sagittal: muzzle.s.primary, chordProfile: muzzle.s.chordProfile,
    /** Identical to `depthAdult`'s by construction — that is the whole point. */
    frac: muzzle.L.frac, widthProfile: widthProfile(muzzle.L),
  };
  /**
   * **The separation, stated as a pass/fail rather than left to a reader.**
   * If this says false, no depth number below it means anything.
   */
  const maxAbs = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  out.controls.depthSeparates = {
    /**
     * The two heads differ by up to 27 mm of depth. If the height bench and the
     * width bench barely move across that while `muzzleMm` moves 5x, the depth
     * axis is measuring something neither of them could see — which is the
     * whole claim.
     */
    heightBenchMaxDeltaFrac: r(maxAbs(
      [adult.L.frac.nasion, adult.L.frac.pronasale, adult.L.frac.subnasale, adult.L.frac.stomion],
      [muzzle.L.frac.nasion, muzzle.L.frac.pronasale, muzzle.L.frac.subnasale, muzzle.L.frac.stomion]), 3),
    widthBenchMaxDelta: r(maxAbs(widthProfile(adult.L), widthProfile(muzzle.L)), 3),
    muzzleMm: { adult: adult.s.primary.muzzleMm, muzzle: muzzle.s.primary.muzzleMm },
    muzzleRatio: r(muzzle.s.primary.muzzleMm / Math.max(1e-6, adult.s.primary.muzzleMm), 2),
    adultInsideNorms: adult.s.primary.muzzleMm >= ZNORM.muzzleMm[0] && adult.s.primary.muzzleMm <= ZNORM.muzzleMm[1],
    muzzleOutsideNorms: muzzle.s.primary.muzzleMm > ZNORM.muzzleMm[1] * 2,
    /** The bare ellipsoid must read ~0: no face, no muzzle. */
    bareEllipsoidMuzzleMm: sagittal(landmarks(syntheticHead({ n: 9, prn: 9, sn: 9, ul: 9, sto: 9, ll: 9, pog: 9 }, 200), SAG), 1).primary.muzzleMm,
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

  /**
   * **Does the painted face map still sit on the sculpt?**
   *
   * Everything in `paintFace` is authored at a canonical height, and this lane
   * moved the sculpt: the nose compressed 0.70x toward the eye line and the
   * mouth came up 15 mm. A map that stayed put would paint lips onto a chin —
   * and nothing in the repo would have said so, because a misregistered map is
   * a *beautiful* texture in the wrong place and every geometry bench reads the
   * position buffer.
   *
   * So: read the finished canvas back, take the mean luminance of a strip
   * 60 texels wide down the middle of the face (the mouth is 57 mm across and
   * the projection is cylindrical, so that is the mouth's own column), and find
   * the darkest row inside a window around each measured landmark. The mouth
   * line stroke and the upper lip's multiply shadow are the darkest thing on
   * the lower face by construction; the nostril fills are the darkest thing
   * just above it.
   */
  let paint = null;
  const canvas = ch.faceMat && ch.faceMat.map && ch.faceMat.map.image;
  if (canvas && canvas.width) {
    const S = canvas.width;
    const c2 = document.createElement('canvas');
    c2.width = c2.height = S;
    const cx2 = c2.getContext('2d', { willReadFrequently: true });
    cx2.drawImage(canvas, 0, 0);
    const px = cx2.getImageData(0, 0, S, S).data;
    const HALF = Math.round(0.029 * S);       // +/- 29 mm of face, in texels
    const lum = new Array(S).fill(0);
    for (let ry = 0; ry < S; ry++) {
      let acc = 0, n = 0;
      for (let rx = (S >> 1) - HALF; rx <= (S >> 1) + HALF; rx++) {
        const i = (ry * S + rx) * 4;
        acc += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        n++;
      }
      lum[ry] = acc / n;
    }
    // texel row -> canonical y, the exact inverse of `uvOf`'s v
    const Y0 = -0.122, Y1 = 0.116;            // FACE.yMin / FACE.yMax
    const yOfRow = (ry) => Y0 + (1 - (ry + 0.5) / S) * (Y1 - Y0);
    const rowOfY = (y) => Math.round((1 - (y - Y0) / (Y1 - Y0)) * S - 0.5);
    const darkestNear = (y, halfMm) => {
      const a = rowOfY(y + halfMm), b = rowOfY(y - halfMm);
      let best = a;
      for (let ry = Math.max(0, a); ry <= Math.min(S - 1, b); ry++) if (lum[ry] < lum[best]) best = ry;
      return yOfRow(best);
    };
    const mouthY = darkestNear(L.y.stomion, 0.014);
    const noseY = darkestNear(L.y.subnasale, 0.010);
    paint = {
      size: S,
      mouthLineY: r(mouthY), stomionY: L.y.stomion,
      mouthOffsetMm: r((mouthY - L.y.stomion) * 1000, 1),
      nostrilY: r(noseY), subnasaleY: L.y.subnasale,
      nostrilOffsetMm: r((noseY - L.y.subnasale) * 1000, 1),
      /** mean luminance of the mid-face strip, every 2 mm from the nasion down. */
      profile: (() => {
        const o = [];
        for (let y = L.y.nasion; y > L.y.menton; y -= 0.002) {
          o.push(`${Math.round((L.y.vertex - y) * 1000)}:${lum[Math.max(0, Math.min(S - 1, rowOfY(y)))].toFixed(0)}`);
        }
        return o.join(' ');
      })(),
    };
  }

  out.chars[key] = {
    paint,
    /** The third axis. Read `controls.depthSeparates` before any of it. */
    sagittal: sagittal(L, sc),
    zNorm: ZNORM,
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

out.blindTo = 'landmark heights on the midline, a half-width profile, and (since '
  + 'head-r3) the mid-sagittal DEPTH profile. Still blind to all OFF-midline '
  + 'relief -- the malar plane, the zygomatic arch, the cheek -- which is '
  + 'brushsurvive.mts\'s question and head-r2.md §8.2\'s open item; to shading, '
  + 'normals and the shipped key; and to hair. Correct numbers on all three axes '
  + 'still say nothing about whether the features read in a frame.';

return out;
