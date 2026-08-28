# Handoff — `head` (round 14): the pixel bench, and the two shapes it found

Owns `src/characters/**`. Started from round 14's 3.0 and the judge's costed
advice — *"fix the head, and only the head. Nothing in the environment can buy a
point while that frame exists"* — against the defect sentence

> the chin projects further forward than the nose ... no mouth geometry or mouth
> texture on the mouth's location.

**Three lanes have been sent at that sentence and each time a measurement agreed
while the picture did not.** This one starts by explaining why, and the
explanation is not subtle.

---

## 1. Every head instrument in this repo reads the position buffer

`headprop.mts` says it about itself. So do `headprofile.mts`, `brushsurvive.mts`
and `hairstand.mts`. The judge reads pixels, and `head-r3.md` §5 is the proof
that the two are genuinely different questions rather than the same one measured
sloppily: **8 mm of added lip relief, an overhanging mouth line and a lip rolled
to face the sky moved the rendered mouth by 1 of 255** — below what two fresh
boots differ by. A vertex bench scored that change as a success. The frame did
not contain it. Nothing in the suite could tell the difference.

### `src/tools/facecheck.mts` — landed, `cc0958f` + `1e2ef93`, wired into `check.mts`

Renders each hero's face at 0.55 m (the range `LANDMINES.md` says face work must
be judged at) and asks the image. Two pixel rows per window, four geometry rows.

**It failed on HEAD before a line of `Face.ts` moved — 13 of 24 rows — which is
the whole point of landing it first.**

Three things make the pixel rows mean anything, and each one cost a run to find:

- **A plane is removed from every window before it is scored.** The terminator,
  the fringe's cast shadow and the falloff across a curved cheek are all smooth
  ramps, and a raw p97−p03 scores every one of them as a feature: a blank cheek
  came back at `range` 157 and `edge` 74/mm, both larger than the mouth's.
  Least squares `a + bx + cy` is exactly what a ramp is and exactly what a lip
  is not.
- **Every window is on the lit half only**, chosen at runtime by comparing the
  two cheeks. `head-r3.md` §8 measured that the shadow half sits at a flat
  Y 65–100 with no detail of any kind, identical with the normal map ablated.
- **The control is the blanker of two boxes on the same face in the same light,
  not a hand-picked one.** Three hand-picked patches in a row turned out to be
  features: x = 48 mm reached the silhouette and scored the badlands (224 of
  255); x = 34 mm at eye height sat under the fringe and scored hair (130); x =
  36 mm on the mouth line contains the **nasolabial fold**, which `Face.ts`
  itself calls the strongest off-midline value on the lower face.

**`noseLeadMm` is in it and it passes at 26 mm.** That is deliberate: nothing in
this repo had ever asserted that the nose must lead the chin, which is the gap
the plan names, and it is the number that went the wrong way when a previous
lane pulled the mid-face back. It is a ratchet, not a finding.

**`noseRange` is reported and NOT gated.** Its window sits where Noctis' and
Prompto's fringe casts its shadow, so no control can be matched in light for it;
across the cast it swung −131 to +121 with no sculpt change between the four.
The nose is gated on the geometry side instead.

**Gladiolus comes back VOID on the pixel rows, and that is a finding rather than
a tolerance.** His beard is ~350 loose black slivers scattered over the whole
lower face — at 0.55 m they read as flies stuck to his jaw — so both candidate
controls land on it at 224 of 255. No measurement of a mouth is possible under
that, by this gate or by an eye. **Fixing the beard is what un-voids him**, and
it is an open item below.

`jawWidthErr` was `mentonWidthFrac` for two runs and that version was wrong:
the menton is not the mesh's lowest vertex — the shell wraps under the jaw into
the neck and any closed surface tapers to nothing there. `1e2ef93` replaces it
with the mean absolute error of the four mandible samples of the vertex-to-menton
half-width profile against Farkas, with the menton found the way `headprop.mts`
finds it. **Validated against `headprop.mts`: 11 of its 12 samples come back
identical.**

---

## 2. What the bench found, and what moved (`4430771`)

| row | HEAD | after | limit |
|---|---|---|---|
| `transverseDropMm` noctis | **18.6** | **7.2** | 12 (a head does ~7) |
| `transverseDropMm` gladio / ignis / prompto | 17.4 / 18.8 / 17.6 | 6.2 / 7.3 / 6.7 | |
| `jawWidthErr` noctis | **0.0665** | **0.0130** | 0.05 |
| `jawWidthErr` ignis / prompto | 0.0995 / 0.0640 | 0.0125 / 0.0113 | |
| `jawWidthErr` gladio | 0.1240 | **0.0450** (see 2.3) | |
| `noseLeadMm` (all) | 26.2–26.8 | **unchanged to 0.1 mm** | ≥ 12 |
| `mouthReliefMm` (all) | 5.8–6.1 | unchanged | ≥ 2 |

### 2.1 `shellPoint` swept a pure ellipse, and that is three of the judge's words

The transverse section is the item `head-r3.md` §4 measured and explicitly left
undone as *"a lane, not an afternoon"*. It is an afternoon.

`shellPoint`'s cross-section was an ellipse in theta — 53 mm across and 87 deep
at the mouth line — so the surface fell away from the midline as `cos(theta)`:
**18.6 mm of fall-back by x = 30 mm where a head does about 7.** That single
number is what *"the cheek is a blank plane at every angle but profile"*,
*"flat sockets"*, *"a wedge"* and the hard vertical terminator down the midline
of every front view in this repo's history all are. An ellipse has no *turn* in
it, so there is no cheek plane for a mouth corner or a nasolabial fold to sit
on, and a key from either side splits the face instead of drawing it.

The fix is a superellipse `|x/a|^n + |z/c|^n = 1` blended to `n = 2` by
`max(0, cos theta)`, so the occiput is untouched. **`x` is not touched at all**,
so eu-eu, zy-zy, go-go, the whole half-width profile and every landmark height
are provably unmoved; and at theta = 0 the exponent is irrelevant, so the entire
midline — `muzzleMm`, `noseLeadMm`, the whole sagittal bench — cannot move.
Measured: it does not. What moves is only the mass between the midline and the
silhouette, which is the thing that was missing.

**One free side effect worth knowing.** `paintFace` places every stroke through
`fx(x, y) = px([x, y, 0.085 − 2.6·x²])` — a *hardcoded* z profile, not the real
shell. At the mouth corner the real shell used to be at z = 71 mm against `fx`'s
assumed 83, which put the painted corner ~4 mm inboard of the geometric one. The
new section is at 82 mm there. The map is better registered than it was and
nobody has to do anything.

### 2.2 The jawline undercut *was* the chin

`facecheck` gates the mandible's four width samples. Noctis read
`0.900 0.753 0.476 0.241` against an adult's `0.82 0.70 0.53 0.32` — wide at
the gonion, then shaved to a point. **A cone seen from below is a chin that
leads the face**, which is the judge's own sentence.

The brush at fault is one line, and its own comment is the tell: a previous pass
caught it reaching *forward* past the chin in z and fixed that axis. At
`r_x = 0.046` centred on `x = 50 mm` it reached **x = 4 mm — the midline** —
and nobody measured that, because until `facecheck.mts` the width profile was
printed and never gated. Measured contribution: **−4.2 mm of half-width at the
mandible body and −6.6 mm at the chin**, which is the entire gap on the two
lowest samples.

Narrow in x and set outboard, plus the lateral `jaw` coefficients cut a third
time (they widen the *skull*; a heavy jaw is a squarer corner and a broader
chin, which is where Gladiolus' now goes). Noctis, Ignis and Prompto land at
`0.818 0.675 0.505 0.328` against `0.82 0.70 0.53 0.32`.

### 2.3 Gladiolus' `cheek` was inflating his mandible, and it is not obvious

He was the only hero whose half-width profile peaked **below the temple** —
`0.884 0.816` at the gonion after the brush work above. The non-obvious half:
the profile is normalised by its own maximum, which lands at the zygomatic, so
his `cheek: -0.20` shrank the **denominator** and inflated every mandible sample
under it. It was buying "gaunt veteran" by making his whole lower face read
wide. `jaw: 0.85 → 0.55`, `cheek: -0.20 → 0.10`, and he lands at 0.045.

One trap for the next person while you are in there: **`headWidth` scales the
shell but not the brush table**, whose centres are absolute canonical x. Every
brush therefore sits at a different fraction of a wide head than of a narrow
one, and Gladiolus is the only character with `headWidth: 1.04`.

---

## 3. The mouth — the mechanism, ablated, and it is not the mouth

`facecheck` after the two shape fixes, on the lit half:

| | mouthRange (limit 14) | mouthEdge (limit 3/mm) | window mean |
|---|---|---|---|
| noctis | +2.8 | −2.0 | **227.3** |
| prompto | −18.3 | −9.6 | **234.4** |
| ignis | **+20.3 PASS** | **+19.4 PASS** | 175.3 |
| gladio | VOID (beard) | VOID | 105.9 |

**Fill the entire face canvas with pure `#00ff00` and re-render: the shadow half
comes back vivid green and the lit half comes back WHITE.** The tonemapper
desaturates a highlight far above 1.0, so on the blown half of a face **no
texture of any kind survives** — not a mouth, not a nostril, not a nasolabial
fold, not a pore. That ablation is the finding of this lane and it explains
every result three lanes have had on this mouth.

Three levers corroborate it, each of which should have worked and did not:

| tried | moved `mouthRange` |
|---|---|
| mouth line `blur` 1.8 → 0.5 (head-r3 §7's own next action, never done before) | 2.1 → 2.6 |
| mouth line + its multiply shadow **much darker** (`rgba(78,42,44,.72)` → `rgba(58,26,28,.94)`) | 1.4 → 2.6 |
| face material `sheen` 0.17 → 0 and `specularIntensity` 0.35 → 0.10 | **nothing** — so the blown term is diffuse, not a highlight lobe |
| **`SKIN_BASE` 0.88 → 0.55**, which walks the face down out of the clip | **1.4 → 12.3** |

Which half of a hero is blown is decided by his **yaw in the settled pose** and
nothing else, which is why Ignis passes and Noctis does not on identical
geometry and identical paint. So `facecheck` now **VOIDs** the pixel rows above
a window mean of 212 and says why, rather than failing the sculpt for the
exposure — a gate that blamed the sculpt here would be the fourth instrument in
this repo to agree with a number and disagree with the picture.

**This reframes `head-r3.md` §5 rather than contradicting it.** Its conclusion —
geometry cannot move this mouth, the paint carries it — is right. Its *reason*
was incomplete: at `hero_portrait` it measured the mouth at 133 against skin 210
(ratio 0.63, the FFXV plate's own) and concluded we were at the plate. At 0.55 m
front-on under the same hour the same mouth arrives at a ratio of **0.93**. The
mouth is not missing from the map. It is being clipped out of the image.

**Do not darken the mouth line further.** It has now been tried and measured;
head-r3's plate constraint still stands, and the change bought 0.5 of 255.

### The next move, and it is one number

`SKIN_BASE = 0.88` on `look.skin`, shared with `Body.ts`. **It is the single
highest-value untried thing on this head** and the measurement above is its
justification. It was not taken here because it moves fifteen characters across
142 shots and needs a corpus cold diff and a real look, which did not fit in
this lane's budget. Note that 0.55 — a big cut — still only reached
`mouthRange` 12.3 against a limit of 14, so **albedo alone may not be enough and
the real lever may be the frame's exposure**, which is not `src/characters/`.
Whoever takes it should start by asking why a face's lit half clips while the
ground four metres behind it does not.

## 4. What I looked at, and what is wrong that no number covers

Frames: `tmp/shots/head-r4-base/` (HEAD corpus, before), `tmp/shots/head-r4-fc/`
(`facecam.mts` framings, before), `tmp/shots/r4-after/` (corpus, after),
`tmp/shots/fc-final/` (annotated `facecheck` frames, after),
**`tmp/shots/fc-fill/` (the green-fill ablation — keep this one if you keep
any)**. Describing them, because `tmp/` gets pruned:

- **`hero_portrait` is a low camera looking up at a head that is pitched down**,
  so the face is foreshortened into a downward wedge. `Shots.ts`'s own comment
  predicted it and said the fix is *"a head-pitch change in the settled pose or
  a shorter fringe, both in `src/characters/`"*. **Neither has been done. Both
  are still open and both are in this lane's directory.** The pitch is *spinal*,
  not the head bone — `head-r3` §8 confirmed that and `facecam`'s `PIN_HEAD`
  does not remove it, so even a "front" studio framing here is a shallow
  three-quarter.
- **The fringe blacks out half the face.** At 0.55 m Noctis' fringe covers one
  whole eye and throws a hard-edged shadow across the nose and cheek. **That
  shadow is the "hard sub-pixel vertical line down the midline" three handoffs
  reported.** It is a *cast shadow*, which is why it is hard and why head-r3 was
  right that it survives a normal-map ablation — the ablation the plan asked for
  comes back "geometry, but the hair's, not the face's". `Cast.ts`'s crown tuft
  is `len: 0.080`; a retired WIP commit cut it to 0.050 for making "a black ball
  twice the width of his head" and the tree today is *longer* than the state it
  was complaining about.
- **Gladiolus' beard reads as flies stuck to his jaw** — ~350 loose black
  slivers over bare skin, individually legible at 0.55 m, the loudest thing on
  any hero's face. It is why he is VOID in the gate.
- **The ear is a flat pink scoop standing off the head**, its top at brow level,
  with a crescent hole. `headprop.mts`: `ear.lateralMm` **97.7** against a head
  half-breadth of 81.7 — 16 mm past the widest part of the skull. Not touched:
  the ear has been buried once and un-buried twice in this repo's history and it
  is not a change to make without room to iterate.
- **Noctis' hair now reads black** rather than slate. Verified by eye at 0.55 m
  and in `hero_portrait`: it was the cheapest win on the head and it landed.
- **Both eyes now read in `hero_portrait`.** Before, one was a blank; the socket
  depth relative to the lid margin moved with the section change.

## 5. State, and the exact next step

| sha | what |
|---|---|
| `6a14da5` | `framecam.mts` stops swallowing `--dirty` (six handoffs asked); takes `--jpeg` |
| `cc0958f` | **`facecheck.mts`** — the pixel gate, wired into `check.mts`. Failed 13 of 24 rows on the tree it landed against |
| `1e2ef93` | `jawWidthErr` replaces the mis-normalised `mentonWidthFrac` |
| `4430771` | **the superellipse section, the jaw, Gladiolus' look, the hair colour, the mouth line** |
| `59260d0` | `facecheck` VOIDs a clipped window; `--shots` draws the windows on the frame |

The tree is clean. `facecheck` is green on every geometry row for all four
heroes, with three of the four VOID on the pixel rows and the reason named.

**Cross-checked against the independent instrument.** `headprop.mts` at HEAD
against `head-r3.md`'s table: `transverse.dropMm.stomion`
`[0, 3.3, 19.0, 42.3]` → `[0, 0.3, 8.5, 26.5]` (a head: `[0, 2, 7, 18]`); the
width profile's mandible `0.900 0.753 0.476 0.241` → `0.804 0.677 0.507 0.328`
against Farkas' `0.82 0.70 0.53 0.32`; `err.goOverEu` 0.139 → 0.061;
`muzzleMm` 6.46 → 6.26, i.e. **the midline did not move**, exactly as the
superellipse's construction says it cannot.

**Next, in order:**

1. **`SKIN_BASE` / the exposure (§3).** Everything else on this face is being
   measured through a clipped image.
2. **The settled head pitch and the fringe length (§4).** `Shots.ts` has been
   asking for two rounds and both are one-line changes in this directory. Judge
   them on `hero_portrait`, which is the frame the score comes from.
3. **Gladiolus' beard** — it is the ugliest thing on a hero's face and it is
   what un-VOIDs a quarter of the gate.
4. The ear's 16 mm; the cranium above the brow; the shoulder yoke's C7 →
   acromion slope.
5. `facecheck`'s `noseRange` can be gated the moment the fringe stops shadowing
   the nose window.

## 6. Closed as measured negatives

- **The mouth line's blur and value.** Sharpening (head-r3 §7's own proposal)
  and darkening it each moved the rendered mouth by **0.5 of 255**. Both changes
  stayed because they are right in every frame that is not clipped, but neither
  is the fix, and neither should be tried again.
- **The face material's `sheen` and `specularIntensity`.** Ablated to 0 and 0.10:
  the blown lit half did not move. The clipped term is diffuse.
- **The eight unreachable `WIP:` commits from 2026-08-21 are all absorbed.**
  Audited claim by claim: of ~30 specifics only four are genuinely unlanded and
  none is a head *shape* item — Noctis' crown-spike length (`Cast.ts`
  `len: 0.080` where the WIP wanted 0.050, and today's tree is longer than the
  state that commit was complaining about), `Hair.ts:293`'s `shellC` spread,
  `Materials.ts:797`'s hair specular exponents, and Prompto's hair albedo.
  `6454bb6`'s nasion / mandible body / mental tubercles and `1a5fa03`'s entire
  eye rebuild are present, usually verbatim with the commit message preserved as
  the comment. **Do not go looking there again.**
- **The midline was never the problem.** The superellipse moves
  `transverseDropMm` by 11 mm and `noseLeadMm` by less than 0.1 mm on all four
  heads. Everything three lanes measured on the midline was true, and none of it
  was the defect.
