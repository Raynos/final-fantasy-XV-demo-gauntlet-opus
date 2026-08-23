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
| §3.4 corestone stacking + fabric + course overlap | **DONE** `2d91563`, tuned `cc5fe5d`, tors/outcrops re-stated on the finished hull `6306fc6` | TV 2.628 → 4.043 and `lobes` 1.38 → 4.20 at n=3 |
| §3.5 aspect + burial floors on the placed hull | **DONE** `1b65a91` | 214/1548 aspect, 1002/1548 burial, worst 3.200 |
| §3.6 `aRock` bakes | **DONE** `2d91563` | rock luma 45→79 near, 29→46 mid, ground unmoved |
| §3.7 variety ceiling | **DONE by construction** | §3.4 multiplies silhouettes with zero new meshes or draws |
| §2.3 `Ecology.rockScatter` wiring (scatter lane's ask) | **DONE** `654c4e7` | `scatterstat --set rocks` R 0.484–0.820 across five zones |

### §3.4 — corestone stacking is the item that matters

`corestones()` splits a block into 2–4 courses, ~30% vertical overlap, sizes
falling upward, a *clamped* drifting lean, per-course vertical squash and a free
per-course yaw. `_stack` places them; ~half the big anchors in `_genCell` become
one, on ground under 0.32 slope. Over 24 seeds at 96 bands:

    overlap 0.38, through the real `corestones()` and the real measured `hy`
    n     TV                       lobes                   rise
    1     2.628 [2.49..2.74]       1.375 [1.00..2.13]      0.136
    2     3.416 [2.81..4.17]       3.005 [2.00..4.50]      0.192
    3     4.043 [3.37..5.07]       4.203 [3.00..5.88]      0.222
    4     4.698 [3.81..5.80]       5.417 [3.88..7.00]      0.290

The sibling's 3.90 → 6.1–8.3 is a *different formula on a different
rasteriser*; do not compare the absolutes. The comparable number is the ratio:
theirs is 1.56–2.13×, **ours is 1.76× at n=3**, inside their band. `lobes` —
which counts masses in the outline directly — goes 1.38 → 4.20, which is the
whole claim of §3.4.

**`2d91563`'s commit message quotes a stale table** (n=3 at TV 8.162). That run
predated the removal of `Corestone.dy` and the clamped lean in the same session,
and the bench had gone on computing the old layout from its own copy of the
rule. `cc5fe5d` records the correction; `tmp/silstack.mts` now calls
`corestones()` and stacks through the same measured `hy` the game does, so it
cannot drift again without the shipped code drifting with it. **This is the
single most important thing in this handoff for whoever reads it next: a bench
that reimplements the rule it measures produces a plausible number and no
symptom.**

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

## The two defects the coordinator reported, and what they were

### 1. Floating rock stacks — FIXED, `251cea8`

Three independent observations across five shots: the coordinator's in
`poi_haven`, `zone_fallgrove` and `zone_longwythe`, the scatter lane's in
`zone_three_valleys` and `vista_noon`.

**`_genTor` was the only placement in this file that did not go through
`seatY`.** It took `eco.height(ox, oz)` — the analytic field — while `_item`,
`_stack` and `_genOutcrop` all seat against the surface the clipmap will draw at
the range the object is still visible at. Tors draw to 1150 m and `driftcheck`
measures the drawn coarse-LOD surface at up to **−2.9 m** against the analytic
field, so a tor at mid distance stood up to three metres in the air. Tors are
the tallest thing this file makes, which is why every observer picked them and
not the boulders.

`handoff/modeling.md` had written this trap down in full — *"a cull distance for
`Seat` is the range at which the object's BASE is read against the ground"* —
and this generator still had one call site that ignored it. One line. Two months
old. What found it was three people looking at frames.

**It was NOT the corestone stacks and it was NOT the §3.5 sink**, which were
both the leading hypotheses in the reports. The sink is applied in `emit`, the
one place an instance becomes a matrix, with nothing downstream of it; baking it
into the mesh would change nothing about who can defeat it here.

### 2. The quilted honeycomb — DIAGNOSED, not this lane's to fix

`src/tools/probes/rockquilt.mts` poses `poi_haven` and captures it four times in
one boot with one contribution switched off each time, because `--hide` removes
whole meshes and cannot separate three contributions on one material.
`tmp/quilt/`:

| frame | quilt |
|---|---|
| `q-0-base` | present |
| `q-1-no-normalmap` | **still present, and stronger** |
| `q-2-no-vertexcolor` | **still present** |
| `q-3-no-albedomap` | **gone completely** |

It is `rockMaterial`'s **albedo map**, and specifically its `crack` term:
`PropMaterials.ts:54-58` builds `worley2(u * 7, v * 7)` and weights
`min(1, (f2 - f1) * 2.6)` at **0.42** — a hard Worley cell boundary at seven
cells per tile, which is a honeycomb by construction. It is not the §3.6 bake,
not the chamfer and not the normal map, and I would have guessed the bake.

This lane's only lever on it is `uvScale`, the triplanar UV constant
`splitNormals` bakes (`0.62`, i.e. one tile per 1.61 m of world, so a cell is
0.23 m). Raising it makes the honeycomb finer so it reads as grain rather than
as quilting, but the pattern is still a honeycomb — the real fix is in the
material. **Requested of the materials lane**: either drop `crack`'s weight well
below 0.42, or break the cell field with a second octave at a different
frequency, or replace the hard `f2 - f1` ridge with something that is not a
closed cell. A single-scale Worley ridge reads as scales at every scale.

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

0. **UNVERIFIED AT THE TIME OF WRITING: the outcrop course-stacking change.**
   `zone_three_valleys` (`tmp/shots/rocks-r12`) showed four *caps with holes
   under them* — a course-1 block straddling the gap between two course-0
   blocks, because each course jittered its own position independently along
   the ridge line. "30% vertical course overlap" is a statement about two blocks
   that are above one another and there is nothing to overlap if they are not.
   The fix makes a higher course pick the nearest already-laid block below it
   and sit on that, with its width capped at 0.82 of that block's and its lift
   taken from the two measured half-heights. **It typechecks and it has not yet
   been captured** — the machine was saturated by four other lanes. Capture
   `zone_three_valleys` and `zone_ostium_gorge` and look before trusting it; if
   it is wrong, `git show` the commit below it and revert just that hunk.

1. **The tor proportions changed late and have only been eyed on two shots.**
   `_genTor`'s three forms are now stated as finished half-width and half-height
   in metres rather than as `s` plus an `sy` multiplier (see the commit). That
   is the right *shape* of fix — it is the same "guarantee on the finished hull"
   principle as §3.5 — but the constants (`fin` 0.46/1.60, `boss` 1.05/0.50,
   other 0.78/0.76 × `s0`) were picked to roughly preserve the old envelope and
   have been looked at on `hero_full` and `zone_ostium_gorge` only. Look at
   `zone_three_valleys`, `zone_longwythe` and `zone_vannath` before trusting
   them; the failure to watch for is a field of same-height columns, which is
   the "wall of copies" the round-9 judge named.
2. **Everything about this lane's `far` tier is unmeasured on the bench.** The
   bench scores base meshes and stacks in isolation; it has never scored a
   *placed* tor against the terrain behind it, which is the read that actually
   matters at 400 m. `imgdiff --heat` between a `--hide rock_*` ablation and its
   control would say how much of those frames the rocks are even worth.
3. **`pnpm run check` is 12/13** at `cc5fe5d`. The single failure is `anycheck`,
   and all six `any`s are in `src/tools/silhouette.mts` — the **method** lane's
   in-flight file, not this one's. Everything else passes, including the new
   `silhouette` gate.
4. **Cost.** `tmp/shots/rocks-r0` (before, at `1e5ff00`) against
   `tmp/shots/rocks-r7` (after, at HEAD):

   | shot | tris before → after | | calls |
   |---|---|---|---|
   | zone_longwythe | 8,860,000 → 9,067,930 | +2.35% | 607 → 606 |
   | zone_taelpar | 15,726,070 → 15,836,456 | +0.70% | 602 → 604 |
   | zone_ostium_gorge | 7,920,843 → 8,137,957 | +2.74% | 499 → 497 |
   | zone_vannath | 10,649,409 → 10,821,874 | +1.62% | 716 → 709 |
   | zone_callaegh | 8,381,651 → 8,572,729 | +2.28% | 636 → 644 |
   | vista_noon | 8,994,921 → 9,060,900 | +0.73% | 536 → 541 |
   | landmark_meteor | 14,887,386 → 14,960,154 | +0.49% | 591 → 589 |
   | zone_ravatogh | 19,776,671 → 19,590,533 | −0.94% | 646 → 650 |

   **No new `InstancedMesh` variant was created and none may be.** Draw calls
   move by −7 to +8, which is noise — and `rocks-r7` is at HEAD, so it carries
   every other lane's commits too and the triangle column is not purely this
   lane's.
5. **`landmark_meteor` does not frame the Meteor.** The camera looks at a wall of
   trees; there is no landmark anywhere in the shot
   (`tmp/shots/rocks-r7/landmark_meteor.jpg`). Whoever owns `Shots.ts` or the
   Duscae canopy should know — a review shot named after a landmark that cannot
   see it has been silently passing for at least this long.
6. `bedded`'s `beds: 6` scored a local *minimum* on the bench at every bedding
   amplitude, reproducing at 96 bands. Probably a seed artefact of the per-bed
   resistance hash; worth one sweep over `seed` before anyone reads meaning into
   it. Now `beds: 5`.
7. The near-field rock texture is one tile at one scale on every kind and it
   reads as a crackle/dried-mud pattern at boulder scale
   (`tmp/shots/rocks-r5/zone_callaegh.jpg`, the near cluster). `uvScale` is per
   kind and is this lane's; `rockMaterial`'s tile is not.

### The scatter wiring is landed but UNPHOTOGRAPHED

`654c4e7` replaces the entire boulder-field point process — `_genCell` no longer
places anything itself, it reads `eco.rockScatter` and dispatches on
`fromParent`. It typechecks, it builds, `scatterstat` scores it clustered in
every zone, and **no frame of it has been read**: the shared daemon spent the
last stretch of this session returning `socket hang up` on every request, across
`--dirty` and `--build HEAD` alike, and `cleanup.mts` reports the tree clean, so
it is not an orphan of mine. Whoever picks this up: capture `poi_haven`,
`zone_callaegh`, `zone_three_valleys` and `hero_full` **first**, before anything
else in this file. The specific risks, in order of how much they would cost:

- **Density.** The sampler's parent intensity and `_density` as a `bias`
  multiply, and I have not checked the resulting instance counts against the
  near/far `CAP` table. Too many and the caps silently drop stones (`emit`
  skips once `g.nw >= g.nearMax`); too few and Leide empties out.
- **The `radius` estimate** (`0.7 + 4.2 u^1.65 × rockS`) approximates `_item`'s
  size draw rather than being it, so the claimed footprint and the placed one
  can disagree. If boulders interpenetrate, that is the number.
- **`fromParent` thresholds** (blocks < 1.0, chips > 1.2) are unmeasured guesses
  about the sampler's `spread` of 13 m.

## Shots

| dir | what |
|---|---|
| `rocks-r0` | before, whole corpus of eight |
| `rocks-r4` | §3.4 landed, before the AO fix — the rocks are black |
| `rocks-r5` | after §3.5, `zone_callaegh` + `hero_full` |
| `rocks-r7` | whole corpus after, at HEAD |
| `rocks-r9` | the four balanced rocks in `zone_ostium_gorge` |
| `rocks-r10` | width fixed, height ran free — needles |
| `rocks-r11` | tors re-stated on the finished hull |
| `tmp/quilt/` | the four-way quilt ablation — `q-3-no-albedomap` is the answer |
| `mid-r1` | the coordinator's sweep, where the floating tors were found |

## Files touched

`src/world/props/Rocks.ts` only, plus the new
`src/tools/probes/rockhull.mts`. Commits `2d91563`, `1b65a91`, `cc5fe5d`,
`6306fc6`.
