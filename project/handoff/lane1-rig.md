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
| 4 | hair aniso + coverageAA | **not done** — no time; see next step |
| 5 | near-white blond | **not done** — no time; see next step |
| 6 | painted creases | **re-diagnosed, half landed** — see below |
| 47 | facecheck VOID = failure | **NOT LANDED** — heads still VOID, see below |
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
