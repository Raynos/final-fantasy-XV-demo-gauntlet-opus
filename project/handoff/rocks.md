# Rocks — plan §3, the post-fracture finishing stack

Contract: `docs/plans/2026-08-21-fable-procedural-modeling.md` §3, and
`project/handoff/2026-08-23-coordinator.md`'s shared rules. **Owns
`src/world/props/Rocks.ts` and nothing else.**

Bench: `tmp/silrock.mts` + `tmp/silkinds.mts` / `tmp/silstack.mts` /
`tmp/bakestats.mts` / `tmp/valcheck.mts` (scratch, free to delete — they import
the real generator, they do not copy it). In-game check:
`src/tools/probes/rockhull.mts`.

---

## The measurement the whole lane is built on

Before any change, on the width-profile bench (8 azimuths, 24 bands normalised
by the mesh's own height, total variation over mean width):

    granite 2.435   bedded 2.529   worn 2.428   slab   2.409
    spire   2.556   talus  2.495   cobble 2.476  pebble 2.520
    ----------------------------------------------------------
    plain icosphere 2.462     cylinder 2.000     4-block stack 3.104

**All eight of our base meshes are indistinguishable from a ball.** Nine cut
planes, strata, chamfer and convexity-weighted weathering, and as far as the
*outline* is concerned the entire pipeline is worth nothing. That is why §3.4
was taken first and why §3.7 needs no new meshes.

---

## Done and verified

| item | state | evidence |
|---|---|---|
| §3.1 conjugate joint sets | **was already done** — `joints` branch, bedding + two conjugate shear sets, dominant last and deepest, chips demoted to corner chamfers | `Rocks.ts` ~line 300, landed in `5f2cd22` before this lane |
| §3.2 chamfer + weathering | already done | ditto |
| §3.3 strata step the silhouette | **DONE** `2d91563` | `rise` 0.134 → 0.234 at 96 bands |
| §3.4 corestone stacking + fabric + course overlap | **DONE** `2d91563` | TV 2.63 → 8.16 at n=3 |
| §3.5 aspect + burial floors on the placed hull | **DONE** `1b65a91` | 214/1548 aspect, 1002/1548 burial, worst 3.200 |
| §3.6 `aRock` bakes | **DONE** `2d91563` | rock luma 45→79 near, 29→46 mid, ground unmoved |
| §3.7 variety ceiling | **DONE by construction** | §3.4 multiplies silhouettes with zero new meshes or draws |

### §3.4 — corestone stacking is the item that matters

`corestones()` splits a block into 2–4 courses, ~30% vertical overlap, sizes
falling upward, a *clamped* drifting lean, per-course vertical squash and a free
per-course yaw. `_stack` places them; ~half the big anchors in `_genCell` become
one, on ground under 0.32 slope. Over 24 seeds at 96 bands:

    n     TV                     lobes                  rise
    1     2.628 [2.49..2.74]     1.375 [1.00..2.13]     0.136
    2     5.585 [3.66..6.73]     2.932 [2.00..4.13]     0.491
    3     8.162 [4.28..9.67]     4.141 [3.00..5.50]     0.721
    4    10.594 [6.63..13.76]    5.417 [4.38..6.50]     0.898

The sibling's 3.90 → 6.1–8.3 is a *different formula on a different
rasteriser*; do not compare the absolutes. The comparable number is the ratio:
theirs is 1.56–2.13×, ours is 2.1× at n=2 and 3.1× at n=3. n is 2–4 weighted
toward 3.

Outcrops got the same rule — 2–3 courses at 30% overlap, each set back along
the ridge axis, course chosen by how central the block is so the knot has a
summit rather than a jumble. Scree at the foot of every anchor shares one
orientation **fabric** (±0.6 rad of a family angle), `√rand` disc placement and
an outward shrink.

**Zero new geometry, zero new draw calls.** Every course is an instance of a
mesh already resident in a group already drawn — which is also why this answers
§3.7 and why a ninth base mesh must not be added (`variety.md` measured +104
draw calls for 1.077/255).

---

## The four measured findings, including two negatives

1. **Curvature-based cavity is identically zero on seven of our eight kinds.**
   p10/p50/p90/p99 all 0.00 for granite, bedded, worn, slab, spire, cobble and
   pebble; non-zero only for `talus`. **A half-space cut can only make a shape
   more convex**, so a mesh built from sixteen of them has no re-entrant corners
   for a curvature measure to find. This is a fact about our generator, not
   about the bake — and it is why the old radial `len / size` "cavity" appeared
   to work: it was reading the blank's own fbm, i.e. MGS5's splotch-camouflage
   bug exactly.

2. **Plane-depth occlusion was built, measured and removed.** One dot per
   cleave plane is near-free and, on a convex body, near-*constant*: every
   vertex lies deep inside all but the two or three planes that made it, so it
   came out 1/16 on a face and 3/16 on an arris — and an arris is *exposed*, not
   occluded. It is a real construction; it belongs to meshes whose planes bound
   notches. Ours do not. Removed rather than left unwired.

3. **The vertex-colour bake was not an AO term, it was a global halving of every
   rock's value.** It ranged 0.31–0.90 with nothing anywhere reaching 1. A
   vertex-colour attribute multiplies albedo, so its bright end has to be 1.
   Measured on `hero_full` (PNG, post on, boxes over known regions):

   | region | before | after |
   |---|---|---|
   | near boulder | luma **45.1** | **78.9** |
   | mid-ground stack | luma **29.5** | **45.9** |
   | hillside behind (control) | 124.3 | 124.1 |

   Our rocks were rendering at a quarter of the value of the ground they lie on.
   That is what every judge round has been calling "dark smudges in the middle
   distance", and it was a bake bug, not a material or a lighting one.

4. **Total variation is blind to the difference between a step and a ramp**, so
   the 24-band bench read §3.3 as a 2% *regression* at every amplitude and bed
   count I swept. Only at 96 bands does `rise` resolve it (0.134 → 0.234). Both
   metrics ship with what they cannot see written on them, per §9.3.

### And two instrument corrections before anything was believed

- The first width profile sampled **vertices**, and a unit box has all eight
  corners in the top and bottom bands — so a box, a cylinder and a four-block
  stack all scored *exactly* 48.000. It clips triangle edges into bands now.
- The first corestone stack floated, because `rockGeometry` normalises to the
  **bounding radius**: the instance scale is the long axis and the vertical
  half-extent is 0.447 (`slab`) to 0.988 (`spire`) of it. `Rocks.hy` measures it
  off the built geometry; both the stacks and the outcrop courses go through it.

---

## Corrections to my own brief, for whoever writes the next one

- **`Rocks.ts` does not build the Meteor of the Disc.** `meteorMass` and `CLEFT`
  are in `src/world/props/Megastructures.ts`, which the **town** lane owns
  tonight. Its 5/10 grade and its "relief at the frequency the eye resolves at
  1.5 km" note belong to that lane, not this one. Untouched here.
- **The floating rock arch is the same file and the same lane.** The silhouette
  lane's `83392d1` fixed the *seating* half; the overhang half is open, and the
  Meteor **still visibly floats above the ridgeline** in `tmp/shots/rocks-r0`
  and `rocks-r5` `zone_callaegh` (top centre, sky under it on both sides) and in
  `rocks-r0/zone_longwythe`. Requested below, not fixed here.
- **§3.1 had already landed** before this lane started, in `5f2cd22`. The plan's
  audit table does not know it.

---

## Requests to other lanes

- **town lane (`Megastructures.ts`)**: the Meteor still reads as a floating rock
  arch from `zone_callaegh` and `zone_longwythe`. Evidence:
  `tmp/shots/rocks-r5/zone_callaegh.jpg`, top centre. The landmarks and
  silhouette handoffs both rank it item 0 and both name the same two untried
  candidates (less tilt on the mass carrying the overhang; a wider, lower ejecta
  apron sized against `zone_mencemoor`'s 1.7 km camera).
- **method lane (`src/tools/silhouette.mts`)**: it measures pairwise *distance*
  between meshes (variety, §3.7's axis). This lane's bench measures outline
  *complexity* (TV, lobes, rise — §3.3/§3.4's axis). They are complementary, not
  duplicates. Please add a `--set rocks` over `KINDS`; the eight base meshes are
  worth knowing about, and this lane's headline finding is that all eight sit
  within 0.06 of a sphere on the complexity axis, which says nothing about how
  far apart they are from each other. `tmp/silrock.mts` is free to fold in.
- **materials lane (`PropMaterials.ts`)**: after the AO fix our near rocks read
  at rgb (105, 74, 54) against a hillside at (149, 119, 96) — plausible in value
  now, but noticeably more *saturated and warmer* than the ground. Shipped FFXV
  Leide rock is a desaturated grey-ochre. `rockMaterial(0x6a5849, 0.93)` is the
  lever and it is not mine.

---

## What is left, ranked

1. **The stacks read slightly like pancakes at range.** In
   `tmp/shots/rocks-r5/hero_full.jpg` the tors at ~(540,150) and (1420,110)
   show separable discs. The overlap is 0.30; 0.36–0.40 with more per-course
   squash variance is the obvious next sweep, and the bench can score it
   (`lobes` should stay up while the visible seam count falls).
2. **Nothing has been captured on `zone_taelpar`, `zone_ostium_gorge`,
   `zone_vannath`, `vista_noon`, `landmark_meteor`, `zone_ravatogh` since the
   change.** `zone_ravatogh` and `zone_taelpar` are vegetation-dominated and
   showed no rock at all in `rocks-r0`; the useful shots for this lane are
   `zone_callaegh`, `hero_full`, `zone_three_valleys`, `zone_longwythe`.
3. **`pnpm run check` has not been run since `1b65a91`.** Do it before trusting
   anything above.
4. **Draw calls and triangles**: baseline `rocks-r0` 499–716 calls / 7.9–19.8 M
   tris across the eight review shots. After: `zone_callaegh` 636 → 656,
   `zone_longwythe` 607 → 587, `hero_full` 691. No new `InstancedMesh` variant
   was created and none may be — that is the §3.7 constraint.
5. `bedded`'s `beds: 6` scored a local *minimum* on the bench at every bedding
   amplitude, which looked like aliasing against 24 bands but reproduced at 96.
   Not chased; it is a seed artefact of the per-bed resistance hash and worth one
   sweep over `seed` before anyone reads meaning into it.

## Files touched

`src/world/props/Rocks.ts` only, plus the new
`src/tools/probes/rockhull.mts`. Commits `2d91563`, `1b65a91`.
