# Lane 1 — skin and hair shading (`src/characters/rig/`)

Plan: `docs/plans/2026-08-30-fable-to-nine.md`, lane section at :121-147, brief at
:610-762. Tasks 1-6 plus plan task 47 (facecheck VOID), delegated from lane 16.

## Status

| # | task | state |
|---|------|-------|
| 1 | winding | **LANDED** `8145902`, verified by probe on all four heroes |
| — | garment clearance (fallout of 1) | **LANDED** `bcc3228`, verified by eye; residue below |
| 2 | subsurface / backlit ear | not started |
| 3 | skin detail scale | not started |
| 4 | hair aniso + coverageAA | not started |
| 5 | near-white blond | not started |
| 6 | painted creases | not started |
| 47 | facecheck VOID = failure | **BLOCKED** — 2 heads still VOID, see below |

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
