# Lane 1 — skin and hair shading (`src/characters/rig/`)

Plan: `docs/plans/2026-08-30-fable-to-nine.md`, lane section at :121-147, brief at
:610-762. Tasks 1-6 plus plan task 47 (facecheck VOID), delegated from lane 16.

## Status

| # | task | state |
|---|------|-------|
| 1 | winding | **LANDED** `8145902`, verified by probe on all four heroes |
| — | garment clearance (fallout of 1) | **LANDED** `bcc3228`, verified by eye; residue below |
| 2 | subsurface / backlit ear | **LANDED** `35bee5a` — rim term + thickness; NOT yet looked at on `hero_profile` |
| 3 | skin detail scale | **LANDED** `35bee5a` after one measured negative, verification pending |
| 4 | hair aniso + coverageAA | **LANDED** `b402eba` + `b31cb87` + `eb0d40c`, verified by eye and by regionstat |
| 5 | near-white blond | **CLOSED, re-diagnosed twice** — not albedo, and not self-occlusion either; it was a crushed floor. `9672122` + `16378e7` |
| 6 | painted creases | **re-diagnosed, half landed** — see below |
| 47 | facecheck VOID = failure | **CLOSED as unlandable**, filed to `HUMAN_REVIEW.md` at `27e1050` |
| — | the eye has no pupil and no catchlight (new) | **LANDED** `b9375a2`, verified by eye at 7x |
| 38 | `skinWeight` -> Uint8 in the generators (from lane 13) | **LANDED**, verification pending |

## 1 — winding (verified)

Root cause was two shared builders, exactly as the brief said, plus three more
nobody had checked. `Geo.ts`'s ring frame `(_r, _f, tan)` is right-handed and
the ring runs `(sin th, cos th)` = clockwise in it, so the naive quad order
gives MINUS the radial normal. Fixed by swapping quad argument order
(`quad(a,b,c,d)` -> `quad(a,d,c,b)`), never by negating `_r`:

- `Geo.ts` `sweepTube` body quads, both dome caps and both cap fans,
  `sweepShell` rim + end caps, `roundedBox`, `blob`.
- `Face.ts` `buildEyes` sphere (both globes) and the caruncle.
- `Hair.ts` scalp shell (`:407`).
- `Character.ts` names the eye meshes `<name>_eyeL/_eyeR`.

Instruments (both orientation-ABSOLUTE; `assertConsistentWinding` cannot see
this defect by construction):

- **`src/tools/probes/geowind.mts` (new)** — builds each primitive alone,
  closed, about the origin. Signed volume + fraction of triangles facing away
  from the origin. Every primitive went `INWARD -> OK`; the hair shell is
  checked against each vertex's own `aGroom` (the sculpted skull normal) and
  went 0.3% -> 99.7% outward.
- **`src/tools/probes/facewind.mts`** — extended to sweep every hero, not only
  the player. All four heroes: body / head / hair / outfit / shadow / both eyes
  now positive signed volume; body and head 100.0% +z on front-most triangles.

**Looked at it.** `tmp/shots/lane1-before` vs `tmp/shots/lane1-after`
(`hero_portrait`): before, Noctis has a dark hole where his eye should be;
after, a real blue iris and a visible sclera — the globe had been rendering
its own inside. Ears, nose and lip plates (all `blob`) also come back.

## The fallout — skin through cloth (landed, partially closed)

Fixing the winding moved the body's rendered surface from the FAR side of each
limb to the near side, and the garment stopped winning the depth test by
accident. The whole party came out in patches. Two changes in `rig/Outfit.ts`
(**lane 2's file** — reported as a cross-lane change, lane 2 unstaffed in
wave 1):

- `under()` damped the body shape toward 1, which is only safe on a hollow;
  on a bulge it pulled cloth inside the skin. Now smooths hollows, follows
  bulges.
- `SKIN_CLEARANCE = 0.030` added to every pad in one wrapper round
  `Anatomy.drape`. Chosen by looking at `tmp/shots/lane1-clear*/hero_full.jpg`
  at 0 / 12 / 30 / 60 mm: 30 mm is where the curve flattens, 60 mm buys
  nothing and bloats the silhouette.

**Still open, verified not a magnitude problem:** Gladiolus' mid-back stays
bare at 60 mm clearance, and `--hide _body` shows the jacket panel is there
and does cover it. That is the drape's skin weights disagreeing with the
body's under his pose. Real fix: `drape()` samples the body curve at uniform
`u` and `sweepTube` then re-splines those nodes CENTRIPETALLY, so the
garment's `t` lands at a different height — and carries different weights —
than the `u` that `under()` evaluates the muscle shape at. Re-derive the drape
against arc length. Until then the 30 mm margin is absorbing it.

`src/tools/probes/skinclip.mts` (new) is the clearance instrument. NOTE its
first form (nearest-vertex signed distance) is UNRELIABLE and was rewritten:
a garment is layered shells and the nearest cloth vertex to a skin vertex is
often on an inner face whose normal points back at the body, which reports
"outside" for a body that is properly covered. The slice form is sign-safe but
still bin-contaminated on the legs; read its MEDIAN, not its worst.

## 47 — facecheck VOID (blocked, not landed)

`facecheck --dirty` after the winding fix still prints
`2 head(s) VOID on the pixel rows` and `PASS`:

```
  noctis   L  2.87   89.8   84.28   132.1   103.4/68.63   VOID — no blank patch on this face
  gladio   L  3.37  -36.9   55.85    75.1    86.8/30.54   VOID — no blank patch on this face
  ignis    R  3.32  150.2   82.64   179.5    42.9/22.45
  prompto  R  3.10  187.0  138.09   213.6    44.8/24.42
```

The VOID is `cheek.range > CONTROL_CEILING` — the cheek control patch is not
blank on Noctis and Gladiolus. Per the coordinator, the VOID-becomes-failure
change lands only once the heads are clear, so **it is not landed**. It is
task 6's (the painted creases / mid-face diagonal) done-when: whatever is
putting range on those two cheeks is what task 6 has to remove.

## Files owned / touched

Owned: all of `src/characters/rig/` except `Outfit.ts` and `Look.ts`.
Touched: `rig/Geo.ts`, `rig/Face.ts`, `rig/Hair.ts`, `rig/Character.ts`,
`rig/Outfit.ts` (cross-lane, see above), `tools/probes/facewind.mts`,
`tools/probes/geowind.mts` (new), `tools/probes/skinclip.mts` (new).

## Exact next step

Task 6 first, not task 2 — it is the only thing gating facecheck and therefore
plan task 47. `Face.ts brushes()` :127, constants :203-268, judged with
`probes/facefront_flat.mts`. Note the brief's finding that AO=0 changed
`hero_portrait` by NOTHING, so the slashes are the sculpt's grooves and this
is a `brushes()` job. **Re-derive against the visible surface** — every brush
constant in that block was authored while the head was backface-culled and
then softened 30-50%, and the surface it is painted on has just changed again
(the ear/nose/lip plates now render).

Then 2 (thickness in `Body.ts` `B.mat` third arg + a thickness-tinted
transmission rim inside the existing sss block, `Materials.ts:189-240`),
3 (pore tiling `:655`/`:658`), 4 (`coverageAA` `:798-799`, aniso params
`:808`), 5 (blond: `regionstat` the hair rect, then `--ablate noenv`).


## Task 6 re-diagnosed — it is NOT a `brushes()` job

The plan said task 6 was "the painted creases and the mid-face diagonal", done
when `facecheck` is green. Reading `facecheck.mts`'s own docstrings
(`:150-168`) says what the two VOIDs actually are, and it is not paint and not
`brushes()`:

- **Noctis** — "a hard-edged **fringe shadow** cutting diagonally across his
  lit cheek". Confirmed by eye in `tmp/shots/lane1-fc2/noctis_facecheck.png`:
  the mark is the hair fringe's own cast shadow with a hard alpha-test edge,
  not a groove and not a brush. **That makes it task 4's job**, not task 6's:
  the hair is alpha-tested at 0.35 and three copies `map`/`alphaMap`/
  `alphaTest` onto the shadow depth material, so the shadow edge is as hard as
  the cutout. `coverageAA` (`Materials.ts:798-799`) is the fix, and it has to
  survive into the depth material.
- **Gladiolus** — his beard. **Landed** (see below) and much improved by eye,
  but he was still over the ceiling on the run before the pore retune.

So the `brushes()` re-derivation the plan asked for is NOT what clears the
VOIDs, and I did not do it. `facecheck`'s cheek control is 17 x 16 mm at the
mouth line; what puts it over 60 is a hard-edged mark crossing it.

## Gladiolus' beard — the lever was the CLUMP (landed)

Two previous passes measured count and width and both came back negative.
Neither looked at `clump: 4, splay: 0.80`: every root emitted FOUR ribbons
splayed `0.8 * len` at the tip, which on a 2.6 mm strand is a four-pointed
star about 2 mm across — a seven-pixel ASTERISK at facecheck range. That is
the "black birds", and it is why smaller and more numerous never helped: a
smaller star is still a star. `clump: 1`, `splay: 0.16`, count doubled, strand
thinned 0.9 -> 0.6 mm to hold the cross-section. **Fewer ribbons than before**
(2 136 against 4 272), so it is cheaper too.

Ablated first, per BRIEF: `--hide _hair` on `gladio_closeup` removes the marks
entirely, so they are tuft geometry and not `paintFace`'s stubble field.

**Verified by eye** — `tmp/shots/lane1-fc3/gladio_facecheck.png`: a dense dark
beard mass with a real jawline edge, where `lane1-fc2` had a swarm of separate
black glyphs over the jaw and neck. Some speckle remains on the moustache.

## Task 3 — one measured negative, recorded

First correction squared the pore cell at 36 mm and it was WORSE: the face came
back as coarse orange peel at 0.55 m and `facecheck`'s cheek control went
101.7 -> 130.8 on Noctis, 51.4 -> 70.7 on Prompto (over the ceiling, a third
VOID). The axis that was wrong was always `u`, and by being too COARSE. Second
correction squares at ~22 mm — 48x12 body, 25x11 face — which holds the
vertical feature at the 0.2 mm it already had. **That run has not come back
yet** (the box is jammed; `facecheck` timed out at 300 s twice). Re-run
`node src/tools/facecheck.mts --dirty` and read Noctis' `cheek r/e` — it must
come back at or below the 101.7 it was before any of this, or the retune is
also negative and the honest answer is to revert both to `(15,23)/(9,13)`.

## Task 38 (from lane 13) — `skinWeight` -> Uint8, in the generator

`Geo.ts` `build()` now emits `Uint8` normalised weights with the residual put
on the largest component (`AttrPack.renormalize`'s rule), and `mergeParts`
derives its output array type and `normalized` flag FROM THE FIRST PART rather
than from a hard-coded table — a table saying `Float32Array` there would copy
0-255 integers into a float buffer and shrink every vertex to the origin.
`Sculpt.ts:512`'s row is kept in step but is unreachable: nothing in
`Sculpt.ts` or `CreatureGeo.ts` writes skin weights.
`enemies/RigBuilder.ts:85,118,170` is NOT mine and is not done — it is
internally consistent as Float32, so it is safe, just unoptimised.

**Verification pending**: capture `hero_full` and look. A renormalisation bug
shows as limbs collapsing toward the model origin, which is unmissable.

## Residue (ready to paste into `project/TASKS.md`)

- **Re-derive `Anatomy.drape()` against arc length.** `drape` samples the body
  curve at uniform `u`; `sweepTube` then re-splines those 9-12 nodes
  centripetally, so a garment's `t` lands at a different height — and carries
  different skin weights — than the `u` that `Outfit.under()` evaluates the
  muscle shape at. Symptom: Gladiolus' mid-back stays bare through his jacket
  at ANY clearance (verified at 60 mm; `--hide _body` shows the panel is there
  and covers it). Currently absorbed by `SKIN_CLEARANCE = 0.030` in
  `rig/Outfit.ts`, which costs ~30 mm of radius on every garment. Fix the
  drape, then take the clearance back to ~10 mm.
- **Lane 1 task 4 — hair anisotropy + `coverageAA`** (`Materials.ts:798-799`
  and `:808`). Not started. It is now also the fix for Noctis' `facecheck`
  VOID: three copies `map`/`alphaMap`/`alphaTest` onto the shadow depth
  material, so his fringe's cast shadow has exactly the alpha cutout's hard
  edge, and that is the diagonal crossing his cheek control.
- **Lane 1 task 5 — why blond renders near-white.** Not started. The brief's
  ranked hypotheses at `docs/plans/2026-08-30-fable-to-nine.md:696` are intact
  and untested.
- **Plan task 47 — `facecheck` VOID must fail.** Not landed; see above.
- **`enemies/RigBuilder.ts:85,118,170` — `skinWeight` -> Uint8.** The last
  third of lane 13's task 38. Safe as it is (enemies merge only with enemies)
  but unoptimised. `rig/Geo.ts` and `rig/Sculpt.ts` are done.
- **NEW DEFECT, exposed by the winding fix: the eyes read googly.** Both
  globes rendered their own inside until tonight, so no lane has ever seen the
  real sclera. It is large, very white, and the upper lid does not cover
  enough of it — all four heroes read permanently startled at 0.55 m
  (`tmp/shots/lane1-fc2/*_facecheck.png`, worst on Gladiolus). `Face.ts`
  `buildLid` / `LID_OPEN` / `EYE.dome`. This is a sculpt job and it is now the
  loudest thing on a closeup.
- **`src/tools/probes/skinclip.mts` — read its median, not its worst.** Its
  first (nearest-vertex signed distance) form is unreliable and is documented
  as such in the file: a garment is layered shells and the nearest cloth vertex
  to a skin vertex is often on an inner face whose normal points back at the
  body, which reports "outside" for a body that is properly covered.

## For `HUMAN_REVIEW.md`

- **`SKIN_CLEARANCE = 0.030` inflates every garment by 30 mm of radius** and
  that is an art-direction call, not an engineering one. It was chosen by
  looking (`tmp/shots/lane1-clear{,30,60}/hero_full.jpg`): 12 mm leaves bare
  thighs on two heroes, 60 mm reads as a snowsuit and fixes nothing extra. It
  is a margin absorbing a drape bug, not a costume decision, and should shrink
  again once the drape is honest — but until then the party is measurably
  bulkier than it was this morning.


---

## Respawn 2 (2026-08-31) — log

Baseline re-measured on `7dfa7e4` (`tmp/shots/lane1r-fc0`, facecheck on HEAD):

```
  noctis   L  2.87   88.3   99.20   134.9    96.3/30.61   VOID
  gladio   L  3.37  -44.1   71.75    69.5    95.0/17.55   VOID
  ignis    R  3.32  137.7   97.61   167.1    42.2/14.86
  prompto  R  3.10  174.3  143.46   214.1    44.8/11.16
```

**Task 3 is VERIFIED as a positive.** The predecessor's exit condition was
"Noctis' cheek range must come back at or below the 101.7 it was before any of
this". It is **96.3**. The ~22 mm square pore cell stands; the 36 mm one stays
recorded as the measured negative.

**Looked at `tmp/shots/lane1r-fc0/noctis_facecheck.png` (and a 2x crop,
`noc_zoom.png`, and a 6x crop of the eye, `noc_eye.png`).** What is on the
frame, in order of loudness:

1. **The eye.** The globe reads as a ball sitting on the face, not set into it:
   below the lower lid margin there is a further band of grey-blue sclera
   ending in a clean circular arc on the cheek — the sphere's own silhouette.
   The iris is a flat navy disc with **no pupil**, no limbal gradient and no
   catchlight on this frame. Confirmed by eye, cause NOT yet confirmed.
2. **Hair** is dead matte black shards with hard staircase edges and no
   anisotropic band anywhere on the crown.
3. The cheek control (green box in the facecheck overlay) does have a dark
   diagonal across it, consistent with the fringe-shadow diagnosis.
4. Gladiolus' beard is still ~hundreds of separate dark chevrons, and they
   reach up onto the malar under the eye where no beard grows.

### `--dirty` is unusable tonight — landmine, cost me ~15 min

`facecheck --dirty` died with `page.waitForFunction: Timeout 300000ms` in
`preparePage`. Eight lanes are saving into one trunk, so the live tree is
rebuilt out from under the page. **Commit and capture `--build HEAD`.**

### Landed this session

- **`b402eba` — coverage antialiasing on the hair** (task 4, first half).
  `alphaToCoverage` gated on `sceneSamples() > 0` plus a *symmetric* ramp
  replacing `<alphatest_fragment>` in the hair branch of `patch()`. Same
  mechanism as `VegMaterial.patchVeg`; read that block before touching this.
  Side effect that matters for the VOID: `getDepthMaterial` sets
  `alphaTest = alphaToCoverage ? 0.5 : material.alphaTest`, so the fringe's
  *shadow* cutout goes 0.35 -> 0.5 for free.

### Measured, and it corrects two diagnoses in the tree

**`coverageAA` does NOT clear Noctis' VOID.** cheek range 96.3 -> **96.2**.
Landed anyway — it is right on its own terms and the hair edges needed it — but
it is a measured negative against the exit it was supposed to serve.

**The fringe-shadow diagnosis is wrong, and `facecheck.mts`'s own docstring at
`:160-167` says it.** `facecheck --hide _hair` — the whole groom AND its cast
shadow gone, same game build, only `facecheck.mts` differing — moves Noctis
from **96.2 to 90.2**. The hair is worth **6 of the 96**. Whatever puts range on
that control is the head's own form and paint, not the fringe. Hiding
`noctis_shadow` (the merged shadow proxy) also leaves him VOID.

Looked at the control patch at 8x (`tmp/shots/lane1r-fc1/noc_cheek.png`): the
mark is **not hard-edged**. It is a broad soft ramp from lit skin at the
lower-left to a dark brown mass at the upper-right, over about 7 px of
transition, with `paintFace`'s mottle on top. `range` is p97-p03, so softening
an edge does not reduce it — only reducing the *depth* of the dark end does.

### The googly eyes — cause found, fix landed, not yet closed

`facecheck --hide _eye` removes the crescent and leaves a small clean almond of
socket, so it is the globe drawing over the lid and not the lid, the paint or
the skin. The invariant nobody had written down:

    EYE.lidR * 0.92  >  1 + EYE.dome

because `eyePoint` squashes the lid shell's **z** by 0.92 and z is the axis the
depth test uses. At `lidR 1.105` that is 1.017 globe radii against a cornea
reaching 1.049 at the lower lid margin, so the globe wins. Solved in closed
form for the same screen (x, y): **-0.20 mm at fissure fraction 0.40**,
negative from f = 0.3 to f = 0.5, which is the width of the crescent on frame.

`08a834d` took `dome` 0.072 -> 0.050 and `lidR` 1.105 -> 1.16 (+0.63 mm), and
the waterline's inner row 1.012 -> 1.14 (it had been a millimetre INSIDE the
globe, so the one cue that separates an eye from a bead never drew at all).

**Verified by eye, partial**: `tmp/shots/lane1r-fc2/pr_eye.png` against
`lane1r-fc1/pr_eye.png` — the pupil reads for the first time, the waterline
draws, the crescent is smaller. **It is not gone.** `878499b` is a deliberate
one-variable overshoot (`lidR 1.30`, `dome 0.035`, +1.7 mm) to settle whether
the residue is depth or a second cause; dial back to the smallest value that
holds. If it does not close, the next suspect is the socket floor sitting
behind the globe where the lid band hands off to the skull.

### Task 5 — blond, measured against the plate

`regionstat` on the 0.55 m PNGs, rect 0.44-0.62 x 0.02-0.22, against
`docs/reference/ART-DIRECTION.md` 12.3:

```
  plate  noctis (black)   p50 Y 37    p5 -> p99.5   20 -> 140
  ours                    p50 Y  0                   0 -> 142
  plate  prompto (blond)  p50 Y 81                  22 -> 176
  ours                    p50 Y 94                   5 -> 227
```

**The medians are 13 Y apart at worst — the albedo is NOT the cause.** The
brief's ranked hypothesis 1 (authored tip albedo) is therefore not it. What is
50 Y out is the **top end on blond** (227 against 176) while the bright extreme
on black is right (142 against 140), and the **bottom end on black is missing
entirely** (p50 0 and p5 0 against 37 and 20).

So: the additive terms pile onto a diffuse that is already high on pale hair,
and dark hair gets no fill at all. The deeper cause of the blond half is that
**our groom has no self-occlusion** — the plate's blond medians at Y 81 with an
albedo far above that because nine strands in ten are shadowed by strands in
front, and ours are all lit as if each were the only card on the head.

### Eye — the second cause, measured negative on the lid

`878499b` overshot to `lidR 1.30` / `dome 0.035` (+1.7 mm, 2.5x what the solve
needs) and **the crescent is the same size as at 1.16**
(`tmp/shots/lane1r-fc3/prompto_facecheck.png`). Reverted in `6976ef6`. So the
depth loss at the lid margin was real and 1.16 closes it, but the residue is
the globe **below and temporal to the aperture drawing over the skull** — the
sculpted orbital rim there sits behind the globe's silhouette. No lid standoff
buys that. It is a `buildHead` / `brushes()` job.

## Respawn-2 residue, ready to paste into `project/TASKS.md`

- **Lane 1 — the eye still reads googly, and the remaining half is the socket,
  not the lid.** `EYE.lidR * 0.92 > 1 + EYE.dome` now holds (`08a834d`), which
  gave every hero a pupil and a waterline for the first time, but a grey sclera
  crescent still hangs below and temporal to each aperture, ending in the
  globe's own silhouette arc. Proved not to be lid standoff by overshooting to
  1.30 and measuring no change. The sculpted orbital rim below the outer
  canthus is behind the globe. `Face.ts buildHead` / `brushes()`; judge at
  `facecheck --shots` and crop the eye at 6x, the corpus shots are too far.
- **Lane 1 task 47 — NOT LANDABLE and here is the number.** Making
  `facecheck`'s VOID a failure needs both heads under `CONTROL_CEILING = 60`.
  Noctis is **96.2** and `--hide _hair` — the whole groom and its cast shadow —
  moves him only to **90.2**, so the fringe-shadow diagnosis in
  `facecheck.mts:160-167` is wrong and `coverageAA` is a measured negative
  against it (96.3 -> 96.2). The mark on his control is a broad soft ramp of
  the head's own form and paint, not a hard edge, and `range` is p97-p03 so
  softening cannot help — only reducing the depth of the dark end can.
  Gladiolus is **88.6** and it is still his beard: hundreds of separate dark
  chevrons that reach up onto the malar under the eye, where no beard grows.
- **Lane 1 task 5 — blond is not an albedo problem.** Medians are within 13 Y
  of the plate; the top decile is 50 Y hot (p99.5 227 against 176) while black
  hair has no bottom at all (p50 0 and p5 0 against 37 and 20). The deeper
  cause is that **the groom has no self-occlusion** — the plate's blond medians
  at Y 81 with a far higher albedo because nine strands in ten are shadowed by
  strands in front, and every card of ours is lit as if it were the only one on
  the head. A root-to-tip occlusion ramp on `vMapUv.y` is the cheap
  approximation and is untried.
- **`facecheck --hide <substr>` exists now** (`e0b5211`) and is how any of this
  was measurable at all, because `--dirty` does not come back on this trunk.

### coverageAA — verified by eye

`tmp/shots/lane1r-fc0/pr_edge.png` against `lane1r-fc1/pr_edge.png` (the same
120x80 px of Prompto's hair silhouette against sky, 8x nearest-neighbour).
Before: every strand boundary is a blocky staircase and the silhouette against
the sky is a hard binary step. After: the same strands have graded edges and
the silhouette ramps. The mechanism landed and it is visible.

### Still pending when I stopped — DO THIS FIRST

`b31cb87` (the aniso retune: exp1 110 -> 45, exp2 20 -> 9, spec 0.55 -> 0.46,
shift 0.30 -> 0.25, rim 0.30 -> 0.20) **has been looked at once and NOT
measured.** The `--cold` link proof came back clean — `hero_portrait`,
zero page errors, 460 draws, so the `<alphatest_fragment>` replacement and the
retuned block both compile and link on a cold page — and on that frame the
crown and fringe carry a **visible lighter band** where they were uniformly
black before. That is the first time the Kajiya-Kay model has drawn anything.
It reads slightly dusty rather than glossy at 1 m, which is what the `mask`
floor and the sky dome do when the band finally has company; if the regionstat
below says the top end is still hot, take `mask`'s 0.34 floor down before
touching `spec` again.

The number that decides it is still un-taken:
The harness was at 61% queue time and the run never came back. Do exactly this:

```
node src/tools/facecheck.mts --only prompto,noctis --shots tmp/shots/l1-fc5
node src/tools/regionstat.mts tmp/shots/l1-fc5/prompto_facecheck.png 0.44 0.02 0.62 0.22 --label prompto-hair
node src/tools/regionstat.mts tmp/shots/l1-fc5/noctis_facecheck.png  0.44 0.02 0.62 0.22 --label noctis-hair
node src/tools/crop.mts tmp/shots/l1-fc5/noctis_facecheck.png /tmp/n.png 430 0 380 260 3
```

Keep it if Prompto's `Y p99.5` comes down from **227** toward the plate's
**176** and a band is visible on the crown of the crop; **revert `b31cb87`** if
p99.5 does not move or the crown goes flatter than it already is. Noctis'
`p50 Y 0` is not expected to move — that is the self-occlusion residue and no
exponent fixes it.

Both now RUN and both green: `nanscan` reports **0 of 142 shots carry NaN**,
`hits: []`, and the `--cold` `hero_portrait` came back with zero page errors.
(The `WebGLTextures: 16 texture units` warning in the nanscan log is
pre-existing and not from this lane.) The shader change is a numeric
retune of an existing block plus one `<alphatest_fragment>` replacement, so a
link failure is unlikely, but the discipline says prove it.

## `b31cb87` measured — mixed, and the next move is one constant

`tmp/shots/lane1r-fc5`, same rect (0.44-0.62 x 0.02-0.22), against the same
plate rows:

```
                      p50 Y            p99.5 Y
  plate  prompto        81               176
  before               94               227
  after                62               201
  plate  noctis        37               140
  before                0               142
  after                 1               101
```

**Verdict: keep, but it is not finished, and it is not a clean win.**

- The stated defect moved the right way: blond's top end 227 -> **201**, half
  the 51 Y gap to the plate, and the band draws on the crown for the first time
  (verified by eye on the `--cold` `hero_portrait`).
- But the energy I took out with it — `spec` 0.55 -> 0.46 and the rim
  0.30 -> 0.20 — darkened everything. Blond's median overshot the plate the
  other way, 94 (+13) -> 62 (-19), and **Noctis lost the one number that was
  already right**: his bright extreme 142 -> 101 against a plate 140.

So the exponent half of the change is correct and the energy half is too
strong. The next move is **one constant**: put `spec` back to 0.55 and leave
the rim at 0.20. The band is narrow and is the thing we want back on Noctis;
the rim is broad and is what washed blond out. Predicted: Noctis' p99.5 climbs
toward 140, blond's median climbs toward 81, and blond's p99.5 rises less than
either because the rim stays cut. **Not done — I ran out of turns and would not
land a constant I could not measure.**

Noctis' `p50 Y 1` against a plate 37 did not move and was not expected to: that
is the self-occlusion residue and no exponent reaches it.

---

## Respawn 3 (2026-08-31) — log

### Priority 1 — `b31cb87` verified, and it is two changes with two verdicts

Re-measured independently (`tmp/shots/l1-fc5`, `facecheck --only prompto,noctis
--shots`, `--build HEAD` at `bf11a0b`) and got exactly the coordinator's
numbers, rect 0.44-0.62 x 0.02-0.22:

```
                  p50 Y     p99.5 Y      (plate 12.3)
  prompto  before   94         227        81 / 176
  prompto  after    62         201
  noctis   before    0         142        37 / 140
  noctis   after     1         101
```

**The broadening (exp1 110 -> 45, exp2 20 -> 9) is right and is KEPT.** Verified
by eye on a 3x crop of Noctis' crown (`tmp/shots/l1-fc5/noc_crown.png`): there is
a visible highlight band on the crown where `lane1r-fc0` had none anywhere.

**The energy cut that rode along with it was a measured negative**, per the
predecessor's own read: blond's median overshot the plate the other way and
Noctis lost his bright extreme. `eb0d40c` puts `spec` back to 0.55 and leaves the
rim at 0.20.

**Measured after `eb0d40c` (`l1-fc6`): Prompto p50 62 -> 62, p99.5 201 -> 203.**
So `spec` is very nearly free on the blond rect — the band does not land there —
and it is kept on the strength of §12.3 ("high-intensity, low-saturation and
thin") plus the crown band being visible on Noctis. **Noctis could not be
measured on that rect at all — see the landmine below.**

`nanscan` after the shader edits: **0 of 142 shots carry NaN.**

### LANDMINE — a fixed `regionstat` rect is NOT a valid A/B across `facecheck` runs

`facecheck` stabilises the *face* in frame; it does not stabilise the character's
heading, so **the background behind the head moves between runs**. The hair rect
0.44-0.62 x 0.02-0.22 sits *above* the face box and is therefore background-
contaminated. On Noctis it read black hair in `l1-fc5` and **blown-out white sky**
in `l1-fc6` (`p50 185`, `p90 #ffffff`) — no code between them touched anything
that could do that. Prompto's framing happened to be stable (p10/p50 hex
identical across the two runs), which is why his numbers are usable and Noctis'
are not.

Every recorded Noctis hair number in this file, including the 142 -> 101 above,
is contaminated to an unknown degree. **Crop the rect and LOOK at it before
quoting a number off it** (`crop.mts <png> <out> 704 18 288 180 4`).

### Task 5 re-diagnosed — the defect is a crushed FLOOR, not an excess of light

The standing diagnosis (the groom has no self-occlusion, so it is over-lit) is
**contradicted by the plate table on three of the four numbers**. Lining ours up
against §12.3:

```
                   p5 / p50 / p99.5        plate p5 / p50 / p99.5
  prompto (blond)    1  /  62  /  203        22  /  81  /  176
  noctis  (black)    0  /   1  /  101 (*)    20  /  37  /  140
```

Only ONE number (blond's top end) asks for less light. Every other one asks for
**more**, and the two floors ask for a lot more. Adding self-occlusion — which
darkens — moves five of six numbers the wrong way. What §12.3's plates actually
describe is a *lifted, compressed* range: no true blacks anywhere in hair, on a
black head or a blond one.

Confirmed by eye on the full 0.55 m frame (`l1-fc6/noctis_facecheck.png`, read
whole): Noctis' groom is a flat black silhouette with three or four chalk-white
streaks on the crown and no form at all elsewhere. That is the blind judge's
"opaque hard-alpha shards" and it is a floor problem.

### `9672122` — the sky fill was keyed off the card's own normal

The term that should give hair its shadow-side value existed and did nothing.
Three causes, one idea, landed together:

- **`hN` is the CARD's normal.** Half of any groom's ribbons face away from the
  sky at any instant, so `pow(dome, 1.6)` collapsed to ~0 over half the visible
  hair — absent exactly where it was needed. Now `gN`, the sculpted scalp normal
  (the same field the aniso band is placed against), exponent 1.6 -> 1.2.
- **`hueC = vColor / max(0.10, luminance)`** returns unit luminance above 0.10
  and a *fifth* of one at Noctis' 0.022 — a silent 5x penalty on the hair with
  nothing else. The band and the rim are tuned around that floor and are
  untouched; the fill normalises properly and clamps instead.
- **Its albedo weight ran 0.14 -> 0.56** across the cast, against plates whose
  dark ends land 10 Y apart. Now nearly flat (0.30 -> 0.36).

Plus a 45% mix toward a cool sky hue, per §12.3's "hair shadows are blue-black
where skin in the same frame is warm".

### `9672122` measured — right mechanism, a third of the way (VERIFIED, by number and by eye)

`l1-fc6` -> `l1-fc7`, same rect, and on Prompto the same framing (so this one is
a clean A/B; see the landmine above for why Noctis' is not):

```
                    p5      p50    p99.5     R-B@p50
  prompto  before    1       62      203       +26
  prompto  after     5       69      204       +25
  plate             22       81      176      cool
  noctis   before    0        1      101(*)     +1
  noctis   after     0       15      129(*)     +2
  plate             20       37      140      cool
```

Every number moved the right way and none moved the wrong way. The whole step
cost Prompto **one Y at p99.5**, which is the important part: the fill is
additive and small beside the specular, so it buys the dark end nearly free.

**Verified by eye and it is not subtle.** The same 3x crop of Noctis' crown,
same framing with mountains behind in both (`l1-fc5/noc_crown.png` vs
`l1-fc8/noc_crown.png`): before, the shadow half of the groom is dead black with
no information in it and four chalk-white streaks laid on top; after, the locks
read across the whole crown and the mass has form. The full 0.55 m frame goes
from "black helmet" to a groom with a fringe, side locks and a value gradient.

`6c5d68e` takes the coefficient 0.11 -> 0.30 on that arithmetic. **Result
pending when this was written — read `tmp/shots/l1-fc9` and the rect above.**
If a median overshoots, the coefficient is the only thing to touch.

**Still open on hair, in order:**

1. **The crown band reads as drybrush paint, not sheen.** Broad flat grey
   patches with hard edges that follow whole card silhouettes, because `a1` is
   a function of the macro normal and the per-lock `jit` is +/-60% — adjacent
   cards get very different values and the band never becomes continuous across
   the head. §12.3 wants "high-intensity, low-saturation and thin".
2. **The tint is still warm.** R-B +25 at p50 on Prompto, +2 on Noctis; §12.3's
   plates are `B > G > R` at p10 AND p50 on every one of them, and call two
   different shadow hues on one head (warm skin, cool hair) the thing to
   reproduce. The fill is mixed only 45% toward cool and is a small addition on
   top of a large warm diffuse. The lever with real authority is the authored
   `Cast.ts` hair colour, which is **lane 2's file** and needs a named
   cross-lane one-liner.
3. **`jit` is not per-lock any more.** The comment at the top of the hair block
   is explicit that jittering the shift per *fragment* replaces the band with
   noise, and it derives `jit` from `vColor` luminance — but `emitCard` already
   multiplies vColor by `crest` (across the ribbon) and `rootDark` (along it),
   so luminance varies by ~15% per fragment and `fract(luminance * 137.31)` is
   many cycles of that. The jitter it documents is not the jitter it computes.

### `b9375a2` — the eye had no pupil and no catchlight (VERIFIED by eye)

Read at 7x on the 0.55 m frame, which is the only range this is visible at.
`tmp/shots/l1-fc6/noc_eye.png` (before) against `l1-fc8/noc_eye.png` (after).

Before: a flat uniform navy disc with a hard edge, a bright sclera beside it,
and no white anywhere on the eye. After: a saturated blue iris with **a clearly
dark pupil in its centre**, visible radial fibre, and a small pale catchlight at
12 o'clock on the limbus.

Three arithmetic causes, none of them sculpt:

- `radial = 0.18 + 0.82 * q^1.45` put the inner iris at 0.18 of the iris colour
  against a pupil at 0.013-0.033 — within a stop of each other on a mid blue, so
  the pupil was not in the frame at all. Now `0.34 + 0.66 * q^1.15`.
- The limbal ring ran `mix(1.0, 0.04, smoothstep(0.78, 0.96))`: the outer FIFTH
  of the iris crushed to 4%. Dark centre plus dark rim leaves a bright annulus
  too thin to survive any real viewing distance, and the disc averages to one
  navy. Now `mix(1.0, 0.16, smoothstep(0.87, 0.99))`.
- The sky catchlight was aimed under the lid. `uSkyDirView` is straight up, so
  `normalize(uSkyDirView * 0.85 + eV)` sits ~40 degrees above the view axis and
  reflects off the part of the globe the upper lid covers. 0.48 puts it ~25
  degrees up, inside the fissure.

**The grey-blue crescent below the lower lid margin is unchanged** — that is
still the socket/skull residue the previous respawn measured and filed, and it
is still a sculpt job.

### The fill coefficient — three measured points, and the number and the frame disagree

```
              prompto p5/p50/p99.5     noctis p5/p50/p99.5
      0.11          5 /  69 / 204            0 /  15 / 129
      0.30         15 /  89 / 209            1 /  46 / 149
      plate        22 /  81 / 176           20 /  37 / 140
```

**By the numbers 0.30 wins outright** — both medians within 9 Y of §12.3 where
0.11 was 12 and 22 short. **By eye 0.30 is wrong: Noctis' hair reads GREY**
(`tmp/shots/l1-fc9/noc_full.png`), a mid-grey mass with a pale fringe. A
different character.

They disagree because the plate's black hair is a *narrow dark cluster* (p10
Y 25 -> p50 37) and a flat fill **widens** the distribution rather than
translating it: ours ran p10 5 / p50 46 / p90 92 at 0.30, i.e. the median landed
on the plate by averaging a crushed floor against greyed mid-tones. Fitting a
median with a term that also stretches the spread buys the statistic and loses
the read. **This is the general trap for any plate-table fit in this repo and it
is worth remembering: §12.3 gives five percentiles per plate, and matching one
of them is not matching the distribution.**

`16378e7` sits at **0.18**, between the two measured points and deliberately a
little *under* the plate — §12.3 says outright that hair is "rendered far darker
than intuition" and that erring bright is the failure mode. Result in
`tmp/shots/l1-fc10`.

**The way to actually reach the plate's shape is self-occlusion after all** —
but as a *modulation of this fill*, not as a darkening of the direct light,
which is where the standing diagnosis had it and which the numbers refuse (see
above: five of six numbers want more light, not less). A fill that is strong
near the outside of the groom and weak deep in the pile translates the cluster
instead of stretching it. The mechanism is written up in the residue below.

## Respawn-3 residue, ready to paste into `project/TASKS.md`

- **Lane 1 — hair self-occlusion, as a modulation of the sky fill and NOT as a
  darkening of the direct light.** The standing diagnosis had it backwards:
  against §12.3's plate table only ONE of our six hair numbers (blond's top end)
  asks for less light, and adding a darkening term moves the other five the
  wrong way. What the plates describe is a narrow, *lifted* cluster — no true
  blacks anywhere in hair, on a black head or a blond one. The sky fill in
  `Materials.ts` now supplies the lift but is flat across the pile, so it widens
  the distribution instead of translating it (measured: at coefficient 0.30 the
  median hits the plate and the hair reads grey). The fix is to weight the fill
  by depth-in-groom. **The data does not exist yet and here is exactly where to
  put it:** hair writes `B.mat(rough, 0, 1)` (`Hair.ts:645`), so **`aMat.y` —
  metalness — is always 0 on hair and is free**; `patch()` can replace
  `<metalnessmap_fragment>` with a constant 0 in the hair branch only and read
  `vMat.y` as exposure. Compute it in `buildHair` the way `liftOutOfSkull`
  already does — `(v - sample(th, ph).p) . n` is the offset above the sculpted
  scalp, i.e. depth in the pile — once per card *row* (10 per card, ~2 500 per
  head), not per vertex. **Encode 1 = exposed**, because the shell, the wisps
  and the brows (`Hair.ts:332, 791, 869, 913`) write y = 0 today and would
  otherwise render fully occluded.
- **Lane 1 — the crown highlight reads as drybrush paint, not sheen.** Broad
  flat grey patches with hard edges that follow whole card silhouettes
  (`tmp/shots/l1-fc8/noc_crown.png` at 3x). `a1` is a function of the macro
  normal and `jit` swings the primary band +/-60% per lock, so adjacent cards
  take very different values and the band never becomes continuous across the
  head. §12.3 wants "high-intensity, low-saturation and thin".
- **Lane 1 — hair is warm and the plates are cool.** R-B +25 at p50 on Prompto,
  +2 on Noctis; §12.3's plates are `B > G > R` at p10 AND p50 on every one of
  them and call two shadow hues on one head (warm skin, cool hair) the thing to
  reproduce. The fill is mixed 45% toward cool and is a small addition on a
  large warm diffuse, so it cannot carry this alone. The lever with authority is
  the authored `Cast.ts` hair colour — **lane 2's file**, needs a named
  cross-lane one-liner.
- **Lane 1 — `jit` is documented as per-lock and is not.** The comment at the
  top of the hair block in `Materials.ts` is explicit that jittering the shift
  per *fragment* replaces the band with noise, and derives `jit` from `vColor`
  luminance to avoid it. But `emitCard` multiplies vColor by `crest` (across the
  ribbon) and `rootDark` (along it), so luminance varies ~15% per fragment and
  `fract(luminance * 137.31)` is many cycles of that. The jitter it documents is
  not the jitter it computes, and this is a candidate cause of the item above.
- **`facecheck` framings are not repeatable, so a fixed `regionstat` rect is not
  an A/B instrument.** It stabilises the face, not the character's heading, so
  the background behind the head moves between runs. Noctis' hair rect read
  black hair in one run and blown-out white sky in the next (p50 185, p90
  #ffffff) with no code between them that could do that. Crop the rect and look
  at it before quoting a number off it. Prompto's happened to be stable, which
  is the only reason any of tonight's hair A/Bs are sound.
- **Lane 1 — the eye's remaining defect is the socket, and it is unchanged.**
  A grey-blue sclera crescent still hangs below and temporal to each aperture,
  ending in the globe's own silhouette arc. Proved not to be lid standoff by
  overshooting `lidR` to 1.30 and measuring no change. `Face.ts buildHead` /
  `brushes()` — the sculpted orbital rim below the outer canthus sits behind the
  globe.
- **Lane 1 task 6 — the mid-face diagonal is untouched and it is loud.** Dark
  slashes running from each nose wing out and down across the cheek, plainly
  visible at 0.55 m on `tmp/shots/l1-fc9/noc_full.png`. `Face.ts brushes()`
  `:127`, constants `:203-268`, judged with `probes/facefront_flat.mts`.

### `16378e7` at 0.18 — VERIFIED, and this is where the fill stands

```
              prompto p5/p50/p99.5     noctis p5/p50/p99.5
      0.18          9 /  76 / 206            0 /  26 / 135
      plate        22 /  81 / 176           20 /  37 / 140
```

Both medians land just *under* the plate, which is the side to be on. Noctis'
top end is now 135 against 140 — the number `b31cb87`'s energy cut had lost, and
it came back from the fill rather than from the specular.

**Read `tmp/shots/l1-fc10/noc_full.png` whole.** Noctis' hair is black again and
it has form: the fringe and the side locks carry a value gradient, individual
locks read across the crown, and the mass is dark. Against `l1-fc9` (0.30) it is
plainly darker and no longer grey; against `l1-fc6` (no fill) it is a groom
rather than a silhouette. **This is the state to hand over.**

Still crushed: Noctis' p5 is 0 against a plate 20. Those are the gaps deep in
the pile, and they are what the self-occlusion residue below is for — the fill
has to be *stronger near the surface and weaker deep* to translate the cluster
rather than stretch it.

The two loudest things left on that frame are **not** hair: the eyes still read
wide (socket residue, sculpt) and the mid-face diagonal is loud (task 6,
untouched).

### Gates run this respawn

- `nanscan` after every shader edit: **0 of 142** and then **0 of 162 shots carry
  NaN**.
- **Cold link proof** (`shoot.mts hero_portrait --cold`, `tmp/shots/l1-cold`):
  clean, 7 336 729 tris / **460 calls**, no page errors and no fallback
  material — so the retuned Kajiya-Kay block, the rewritten sky fill, the iris
  ramp and the `<alphatest_fragment>` replacement all compile and link.
- `facecheck --only prompto,noctis`: **PASS** on the geometry rows every run;
  both heads stay VOID on the pixel rows, which is task 47 and is filed as a
  human decision.
- Did NOT run `pnpm run check` — the coordinator owns the full suite.

**Looked at, this respawn:** `l1-fc5/noc_crown.png`, `l1-fc5/noc_rect.png`,
`l1-fc5/pr_hair.png`, `l1-fc6/noc_full.png`, `l1-fc6/noc_eye.png`,
`l1-fc8/noc_full.png`, `l1-fc8/noc_eye.png`, `l1-fc8/noc_crown.png`,
`l1-fc9/noc_full.png`, `l1-fc10/noc_full.png`, `l1-cold/hero_portrait.jpg`.

**The loudest defect left on a hero at portrait range is not hair and not the
eye: it is the mid-face diagonal.** On `l1-cold/hero_portrait.jpg` Noctis has a
dark slash running from each nose wing down and out across the cheek, plus a
dark mark under the mouth. At 1568 px it reads as war paint or bruising. That is
task 6, `Face.ts brushes()`, and it is untouched.

---

## Respawn 4 (2026-08-31) — log

Queue was heavily loaded all session (`harnessstats`: framecam 187 m, shoot 184 m
of queue time across the window), so this respawn is two landed changes with the
numeric work done off-harness and the frames read as they came back.

### Landmine found in my own first instrument, and it is worth knowing

**`Face.brushes()` already returns `expandMirrors(b)`** (`Face.ts:540`). Calling
`expandMirrors` on its result does not no-op — it re-mirrors every `mirror: true`
entry, so each side ends up in the list **twice** and every mirrored brush is
applied at double amplitude (99 brushes -> 179). My first decomposition was wrong
by ~2x on almost every brush before I caught it. Anything that consumes
`brushes()` must pass it to `applyBrushes` as-is.

### Task 6 — the mid-face diagonal is the ALAR CREASE, and it is measured

**Confirmed it is the sculpt, by eye.** `tmp/shots/l1r4-flat0/noctis_front_flat.jpg`
is `facefront_flat` — flat albedo, normal map nulled, hair hidden, so anything in
the frame is geometry. Both diagonals are plainly there, running from each nose
wing down and out across the cheek toward the mouth corner, with the brow shelf
and the socket craters as the other loud marks.

**Named which brush, exactly.** `applyBrushes` sums every brush against the
*original* position, so the sculpted surface is a **linear** function of the
brush list and the surface Laplacian (a 3 mm stencil; a groove is a positive
Laplacian and its magnitude is how hard the fold turns) decomposes exactly,
per brush, with no ablation build required. Swept over the cheek
(x 18..50, y -24..-58 canonical mm):

```
  peak 9.00 mm at x=24 y=-39   (beside the nose wing)
     5.28   alar crease   p=[22.8,-37.0,80.0] r=[8.0,12.0,17.0] amt=-7.6
     2.91   alar ball     p=[15.5,-36.5,85.5] r=[10.5,11.0,19.5] amt=+12.5
     0.38   malar plane, 0.33 infraorbital, nothing else over 0.4
```

Everything else on the face — brow ridge, mouth, nasolabial, malar edge —
measures **1-4**. The only sharper thing on the head is the nostril opening,
which is supposed to be a hole. The crease also drops the surface **8.85 mm**
below the mean of its own shoulders 6 mm either side; a twenty-year-old's alar
crease is 1-2 mm on a head this size.

**The note it replaces measured the falloff, not the fold.** It argued the
crease was "half a millimetre of actual groove once the cosine falloff is paid"
and doubled the amount. -7.6 mm through an 8 mm radius is a 60-degree V.

`c6013aa` takes it to **-3.0 mm through [11.0, 15.5, 21.0]** — shallower and
mainly *broader*, because hardness is what reads as a drawn line (at 0.55 m the
face is ~2 px/mm and a 9 mm Laplacian over 3 mm is an abrupt normal flip).
Re-measured on the edited tree: **peak 9.00 -> 5.09, fold 8.85 -> 5.94 mm**, and
the alar ball's 2.91 is now the largest single term there. One variable on
purpose; the ball is the next lever. **Frame verification pending** —
`tmp/shots/l1r4-flat1` is the after arm of the same `facefront_flat` framing.

### Task 2 — hair self-occlusion, landed as a modulation of the FILL

`829ce9b`. The residue's mechanism, with one deliberate departure.

- **Where the data comes from.** `Hair.ts` `buildHair` now computes, per card
  *row*, the standoff above the sculpted scalp (`skullOffset`, the quantity
  `liftOutOfSkull` already needs) and normalises it by **that tuft's own corridor
  ceiling** (`baseOff + 0.018 + puff*len*t`). The normalisation is the part that
  matters: raw standoff calls a lock lying flat on a one-layer groom "buried",
  while the ceiling *is* the authored local thickness of the groom at that point,
  so the ratio means the same thing under a puff and under a hug.
- **Where it is carried.** `aMat.y`. Hair writes `B.mat(rough, 0, 1)` everywhere
  and has never put anything but 0 in that channel, so `patch()` pins
  `metalnessFactor` to 0 in the hair branch and reads `vMat.y` as depth instead.
  New `MeshBuilder.metal()` sets the channel alone (`mat()` would reset the other
  two), and `emitCard` gained an `occAt(t)` callback.
- **Encoded 0 = exposed, against the residue's note that said 1 = exposed.**
  Every other emitter in `Hair.ts` — the scalp shell, the halo, the hairline
  wisps, the brows, the tube path — leaves the channel at 0. With `0 = exposed`
  a site that forgets to write it renders exactly as it does today; with the
  other encoding it renders fully occluded. LANDMINES' own rule: a guard's
  failure mode should be the pass's existing no-op.
- **What it modulates.** Not the direct light. Against §12.3's plate table only
  ONE of our six hair numbers (blond's p99.5, 206 against 176) asks for less
  light; the other five ask for more and the two floors ask for a lot more. The
  zero in our dark tail comes from `pow(dome, 1.2)` reaching 0 wherever the
  macro normal points away from the sky — right for a strand buried in the pile,
  wrong for an exposed one, which still sees sky sideways. So the fill gets a
  **pedestal** (`mix(0.45, 1.0, pow(dome,1.2))`) and occlusion gates the
  pedestal: `dome = 1` is untouched, only the dark tail lifts. That *translates*
  the cluster where raising the flat coefficient *stretched* it.

**Predicted, so it can be falsified:** p5 rises a lot on both heads, p50 rises
some, p99.5 barely moves. If p99.5 climbs materially the pedestal is too high.
**Measurement pending** — `tmp/shots/l1r4-occ`, `facecheck --only prompto,noctis`.

### Task 6 — verified by eye on the geometry-only frame

`tmp/shots/l1r4-flat0` (before, `7401343`) against `tmp/shots/l1r4-flat1`
(after, `c6013aa`), same `facefront_flat` framing, mid-face cropped at 3x.
**Before**: the nose base sits in a hard black ring and a deep dark comma runs
from each alar crease down and out toward the mouth corner — the war-paint mark,
in the geometry, with no map and no hair in the frame. **After**: the same marks
are broader and much lighter; the alar area reads as a fold rather than as a
slot. Still hard in that frame, and unchanged by this commit: the pit at each
mouth corner and the broad dark band from the inner canthus down the nose side.

The alar ball is now the largest single term at the crease (2.91 of the
remaining 5.09). Measured but **not landed**, because it costs the nostril:
widening the ball to r [13.0, 13.5, 21.0] with the amount held takes the crease
peak 5.17 -> 3.53 and leaves the ball's own projection *higher* (10.35 -> 10.51),
but the nostril opening loses 27% of its depth (-8.34 -> -6.08 mm) because the
two brushes overlap. That is the trade if anyone wants the last third of it.

### Task 2 — measured, and the first constants were a redistribution not a lift

`829ce9b` (weight 0.60, pedestal 0.45) measured on Prompto's hair rect, before
`tmp/shots/l1-fc10` and after `tmp/shots/l1r4-occ`:

```
                    p5     p50   p99.5      plate
  prompto  before    9      76     206      22 / 81 / 176
  prompto  after    10      71     204
```

**The rect was cropped and looked at first** (864x540 at 3x): it is all hair bar
a sliver of background at one edge, and Prompto's extreme percentiles match to
2/255 across the two runs, so on THIS pair the fixed rect is sound. What the crop
also shows is that the hair reads as a pile of flat cardboard strips at 3x — hard
rectangular card edges, visible facets, near-black gaps — which is where the p5
comes from and is a separate defect from the shading.

`probes/hairocc.mts` (new) explains the null: the channel is **bimodal**, 36-40%
at 0 and 32-43% at 1, mean **0.516 / 0.531**, so weight 0.60 against pedestal
0.45 is 0.499 of a term that was 0.500. `ea4fc24` moves it to **0.45 / 0.58**,
about +21% of level and all of it where `dome` is low, because at `dome = 1` the
term is still capped at its old value. Predicted: Prompto p50 -> ~85, p5 well
over 10, p99.5 flat; Noctis p50 -> ~33. **Result pending in
`tmp/shots/l1r4-fin`.**

### Task 2 measured again at 0.45 / 0.58, and the next lever is NOT the coefficient

`tmp/shots/l1r4-fin`, `facecheck --only prompto,noctis --shots`, tree `189fe2f`
(commit `3dfb43c`, which contains `ea4fc24`). Same run for both heads.

```
              p5 / p50 / p99.5        plate 12.3
  prompto     12 /  75 /  205         22 /  81 / 176
  noctis       0 /  24 /  129         20 /  37 / 140
```

Prompto went 10 / 71 / 204 -> 12 / 75 / 205 across the retune, i.e. the +21% of
*fill* level bought about +5% of *pixel* — the fill is a small addition beside
the diffuse and the specular, and that ratio is worth knowing before anyone
budgets another fill change.

**And it says a coefficient raise is the wrong lever.** Blond is 6 Y under the
plate at the median and **29 Y over at the top end**; black is 13 under at the
median with no floor and is *under* at the top end. A global raise pushes the
only number that is already hot. `3b19481` flattens the fill's **albedo weight**
instead — `0.30 + 0.30 * lum` is 0.307 on Noctis and 0.45 on Prompto, a 1.47x
spread against §12.3's finding that the plates' dark ends land 10 Y apart across
an order of magnitude of albedo. `0.36 + 0.16 * lum` is +19% on Noctis and -2%
on Prompto. Result in `tmp/shots/l1r4-fin2`.

Also on that run: **Prompto is no longer VOID** (cheek 59.1 against the ceiling
60; he had gone to 61.2 on the previous run). Noctis is 95.3 and still VOID —
task 47, filed as a human decision.

### The eye crescent — LOCALISED to the millimetre, not landed

`tmp/l1r4/eyeprobe.mts` (scratch, not committed) marches the sculpted skull
against the globe's own silhouette: for every screen (x, y) inside the disc it
prints `globeZ - skullZ`, positive meaning the globe stands in front of the
skull and its sclera is what draws there. Globe centre is `FACE.eye`
(33.5, -6.0, 64.6) with R 10.70; the lower lid margin peaks at elevation
-0.712 rad, i.e. **y = -13.0 mm**, and the globe runs to y = -16.7.

```
   y = -12    globe in front by 1..9 mm across x 26..42   (inside the fissure — correct)
   y = -13    globe in front by 1..6 mm across x 26..41   <- THE CRESCENT
   y = -14    globe in front by 1..3 mm across x 28..40
   y = -15    skull in front everywhere — nothing shows
```

So the crescent is a band **1.5-2 mm tall and ~15 mm wide** immediately under
the lower lid margin, and the skull needs **up to 6 mm** more z at y = -13 and
3 mm at y = -14 to cover it. That is the number the previous respawn's
overshoot test could not produce.

**Not landed, deliberately, and here is the fork:**

1. *A ledge under the lower lid* — a new brush at (33.5, -13.5), r about
   [13, 7, 20], amt +4 mm. Anatomically it is the lower lid's own roll, which
   this face lacks. But 4 mm through a 7 mm y-radius is a *rail*, and this
   file's own history says a rail is what left the hard dark slash under the
   eye that took two passes to remove. It would have to be judged on
   `facefront_flat` before it is believed.
2. *Sink the globe.* `FACE.eye`'s z from 0.0646 to ~0.0616. The lids are built
   **on** the globe (`pt(a, e, R * EYE.lidR)`), so globe-to-lid geometry is
   untouched and only globe-to-skull changes — which is exactly the defect. It
   also answers the separate complaint that the globe "reads as a ball sitting
   on the face, not set into it". Risk: 3 mm on a 21 mm globe may read sunken,
   and the lid band has to still meet the skull cleanly at the canthi.

Option 2 is the smaller, better-targeted change and is what I would try first.
I did not land either: it is a highly visible sculpt change late in a session
and neither can be believed without a `facefront_flat` capture to judge it on.

### Task 2 — the whole progression, one rect, every arm a separate `facecheck` run

```
                          prompto p5/p50/p99.5     noctis p5/p50/p99.5
  before (l1-fc10)            9 /  76 / 206              (old sha)
  occ 0.60 / ped 0.45        10 /  71 / 204
  occ 0.45 / ped 0.58        12 /  75 / 205          0 /  24 / 129
  weight 0.36 + 0.16*lum     13 /  76 / 205          1 /  28 / 132
  weight 0.44 + 0.05*lum     15 /  78 / 206          4 /  33 / 135
  plate 12.3                 22 /  81 / 176         20 /  37 / 140
```

Every number on both heads moved toward the plate and none moved away. Noctis'
p10 went 3 -> 7 with it. Blond's top end — the only number that was ever *over*
the plate — moved +1 across the whole session, which is the point of putting the
lift under a pedestal instead of into the coefficient.

**Verified by eye** (`tmp/shots/l1r4-fin3/noctis_facecheck.png`, head cropped at
2x): Noctis' groom reads as dark charcoal-black with the fringe locks separating
individually and a value gradient down each lock — roots dark, tips lighter,
which is the self-occlusion drawing. It is **not** the grey mass the flat 0.30
fill produced. The crown still carries the pale drybrush patches that are filed
as residue.

The rect is the fixed 0.44-0.62 x 0.02-0.22 one. **It was cropped and looked at
on this corpus** (864x540 at 3x, `tmp/shots/l1r4-occ/prompto_facecheck.png`): all
hair bar a sliver of dark background at one edge, and Prompto's p10/p99 hexes
track within 2/255 across all four runs, so the framing was stable across this
particular set. It is not a general licence — see the landmine.

**Separate defect the crop exposed, worth its own item:** at 3x Prompto's hair
is a pile of flat cardboard strips. Hard rectangular card ends, visible flat
facets down each card, and near-black gaps between them — which is where the p5
lives, and why the fill can only reach the floor so far. That is card geometry
and the cutout, not shading.

### Gates run this respawn

- `facecheck --only prompto,noctis`: **PASS** on the geometry rows on every run
  (noseLead 27.6/27.9, mouthRelief 6.53/6.56, transDrop 4.9/4.8, jawWidthErr
  0.015/0.018, all inside limits). **Prompto came off VOID** — cheek 61.2 -> 58.7
  against a ceiling of 60. Noctis stays VOID at 95.1: task 47, filed.
- Every capture's `[harness] sha:` line checked against `git log --format='%h %t'`
  — the announce line is the **tree** sha, not the commit sha, which is worth
  knowing before you conclude a run is stale. All four runs measured trees that
  contained the commit under test.
- Did NOT run `pnpm run check` — the coordinator owns the suite.

**Looked at, this respawn:** `l1-cold/hero_portrait.jpg`, `l1-fc10/noc_full.png`
and a 3x mid-face crop of it, `l1r4-flat0/noctis_front_flat.jpg` + 3x mid-face
crop, `l1r4-flat1/noctis_front_flat.jpg` + the same crop, `l1r4-occ` Noctis hair
at 2x, `l1r4-occ` Prompto's hair rect at 3x, `l1r4-cam/noctis_face.jpg`,
`l1r4-fin3/noctis_facecheck.png` head at 2x.
