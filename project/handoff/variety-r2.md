# variety-r2 — the repeated mushroom rock was the TOR generator, and it was one shape

Owner: the variety-r2 lane, 2026-08-24. Contract:
`project/handoff/2026-08-23-coordinator.md` "Shared rules".
Owns `src/world/props/{Rocks,ZoneDress}.ts` and the new `--set rocks` in
`src/tools/silhouette.mts`. **`ZoneDress.ts` was not edited** — nothing in it
turned out to be the defect.

Predecessors whose measurements this lane started from and did not repeat:
`handoff/rocks.md`, `handoff/scatter.md`, `handoff/variety.md`.

---

## The headline

`node src/tools/silhouette.mts --set rocks --seeds 24`, before at `9e4cf00` and
after at HEAD. The anchors are re-measured on every run and were identical on
both: known-same **0.653**, known-different **51.523**, dynamic range 78.9x,
threshold **5.799** = their geometric mean.

    family              before                        after
    rock:tor:fin         1/24  min 1.02  mean  4.93   19/24  3.16  17.10
    rock:tor:pinnacle   18/24  min 4.40  mean 12.47   21/24  4.42  12.99
    rock:tor:boss       24/24  min 14.21 mean 35.38   24/24  11.57 38.86
    rock:tor:hoodoo     did not exist                 20/24  4.12  19.61
    rock:base            8/8   min 14.80 mean 51.56   unchanged
    rock:stack          24/24  min  7.24 mean 25.45   unchanged

**Twenty-four fins were ONE silhouette.** Not "similar" — one, by the bench's own
single-linkage clustering at a threshold it derives from two anchors it
re-measures every run. Their *mean* pairwise distance, 4.93, was below the
threshold for calling two meshes identical.

That is the judge's *"the same mushroom rock appears eight-plus times per frame
at the same orientation"* as a number, and the round-9 judge's "wall of copies",
and `handoff/rocks.md`'s own open item 1 ("the failure to watch for is a field of
same-height columns"), all of which are the same object.

`pnpm run check`: **16/16**. Draw calls **unchanged** — `zone_longwythe` 614
before (`tmp/shots/peak-B/manifest.json`) and 614 after; `vista_noon` 545 and
545. Triangles down slightly on every shot. **No new mesh, no new
`InstancedMesh`, no new draw call was created and none may be** — every lever
here is a per-instance parameter, which `handoff/variety.md` priced at free
against four draws for a new visible mesh.

---

## The verdict was factually wrong in a way that was the whole lead

The judge said *"never rotated"*. `Rocks.ts` has always drawn
`yaw: rng.next() * Math.PI * 2` and composed `_e.set(pitch, yaw, roll)`. Every
instance is yawed over a full turn.

**Yaw is the one rotation that cannot change the silhouette of a shape that is
roughly radially symmetric about its own vertical axis.** Spin it as much as you
like and every azimuth presents the same outline. So the perception was right and
the mechanism named was not, and the interesting question is which *other*
parameters were doing nothing. Measured, in `_genTor`:

- **`pitch` and `roll` were 0.68 degrees.** `_item` draws
  `gauss(0, 0.3) * settle`, `settle = clamp(1 - size/5, 0.18, 1)`; every tor
  course is well over 5 m so `settle` reads its floor of 0.18, and `_genTor`
  then multiplied by a further 0.22. Standard deviation **0.012 rad**. That is
  plumb, and plumb plus radial symmetry is exactly the invariance above.
- **Every fin was `spire` on every course**, and every pinnacle was `spire` on
  its top course — one mesh, at the most visible place in the frame.
- **`w0/s0`, `h0/s0`, `taper` and `lap` were one constant each per form.** The
  only free numbers per course were a ±12% width jitter and a ±15% height
  jitter.
- **`sx` cancelled out entirely.** `s` was solved as `wz / (ex[0] * sx)`, so
  `sx` had no effect on any finished extent; the cross-section was whatever the
  independent `sz` gaussian happened to draw.

Two things it was **not**, both checked before anything was changed and both
worth recording because they are the obvious suspects:

- **It was not the eight base meshes.** `rock:base` is 8 distinct at min 14.80,
  the healthiest row in the table. `handoff/rocks.md`'s "all eight of our base
  meshes are indistinguishable from a ball" is a statement about outline
  *complexity* (total variation), a different axis from pairwise *distance*.
  Both are true and only one of them was ever the defect. This also retires the
  §3.7 "ninth base mesh" idea for a second time — `handoff/variety.md` already
  measured it at +104 draw calls for 1.077/255.
- **It was not the corestone stacks.** `rock:stack` is 24/24 distinct. §3.4 was
  doing its job all along.

---

## What landed

Six commits, all gated by the pre-commit hook (`vite build` + both typechecks).

### `9e4cf00` — the instrument, and the refactor that makes it honest

`silhouette.mts --set rocks`, over **three** levels rather than the base meshes
the rocks lane asked for, because a base mesh is never drawn alone at the size
the judge is looking at:

    rock:base     the eight meshes of §3.7's variety ceiling
    rock:stack    corestone stacks, through the shipped stackPlan
    rock:tor      whole tors, stratified by archetype, through torPlan

Composing those needed the shape rules callable without a terrain, a scene or a
browser, so `_genTor` and `_stack` are split the way `corestones()` already was:
**`torPlan`** and **`stackPlan`** own the shape in the object's own local frame,
the methods own the seat and the instance record. **`placedScale`** is the same
split for `emit`'s two plan-3.5 guarantees, and it matters more than it looks —
the aspect floor and the burial sink both change the composed outline, so a
bench that skipped them would grade a shape the game never draws.
**`hullExtents`** is exported and `build()` calls it, so the extents the bench
places with are the extents the game places with.

This is `handoff/rocks.md`'s own headline warning taken literally: their first
stacking table was measured by a bench carrying its own copy of the rule and the
copy went stale with no symptom at all. **Nothing in `--set rocks` carries a
copy of anything.**

**Tors are stratified by archetype and that is load-bearing.** A single
`rock:tor` family's mean distance is dominated by fin-vs-boss pairs and reads as
healthy however identical the fins are — the first run reported `rock:tor`
10/12 distinct, mean 47.51, which is the number that would have closed this lane
with nothing fixed. Splitting by the form the draw produced gave 2/10 on the
fins in the same run.

### The narrow-object anchor — read the fin row against this, not against 5.80

Also in the instrument, and it changed how the rest of the lane was read.

**This metric is not scale-free in aspect.** The profile is a band width divided
by the mesh's own height, so a family whose widest band is 0.41 of its height
has all 192 of its numbers bounded by 0.41 and the largest RMS distance two such
shapes can reach is bounded with them. The tree anchors that set the 5.799
threshold are parasols and spires at 0.6–1.0 aspect. So a `fin` row scoring 4
does not mean what a `tree:savanna` row scoring 4 means.

A prism, a cone and an ellipsoid cut to 0.43 aspect — three shapes nobody would
call the same — score **23.652 / 9.815 / 20.596**, printed every run. **9.815**,
a straight column against an egg, is what "clearly different, this narrow" is
worth. The fin family's mean was 4.93 (half of it) and is now 17.10 (nearly
twice it).

### `d5e0e19` — archetype families

§3.7 asks for **families**, "not harder randomisation of one generator", and the
difference is that every number in `TORS` is a *range* the tor draws once.

- **Ranges, not constants.** Two fins now differ in proportion, taper, overlap,
  cross-section and course count.
- **A bedding profile instead of a monotone taper.**
  `1 + bed * cos(i*beta + phase)` at a per-tor amplitude, period and phase: a
  hard bed stands proud as a collar and a soft one is cut back to a waist. A
  monotone taper is the one profile that *cannot* step, and it was the only
  profile there was. The fourth archetype, **`hoodoo`**, is that term turned up.
- **A lean**, progressive rather than rigid, so the base stays plumb and the
  crown hangs off it — a weathered tor rather than a collapse. The bench
  minimises over azimuth, so only the *magnitude* scores, which is the honest
  way round: the direction is what the eye reads and the magnitude is what makes
  two tors different objects.
- **The cross-section is stated**, not left to two gaussians one of which
  cancelled out.
- **Courses draw from the family's kind pool with a dominant kind** — the rule
  `Cluster.ts` uses for species per grove.

### `d30e2aa` — a landmark tail, and the honest note about it

Top 14% of tors scale to 1.95x. `_item` already carries this on the boulder
field for the reason recorded there: one big block does more for a middle
distance than fifty small ones.

**It is invisible to the bench and that is stated rather than disclaimed.** The
profile is normalised by the mesh's own height, so a pure height multiplier
scores exactly zero; the only reason the rows moved when it landed was that one
extra `rng.next()` re-sampled which seeds land in which row. **Which is why
every number in this handoff is at `--seeds 24` and not the default 10** — at 10
the row-to-row resampling noise is the same size as the effect, and the first
"all four families 10/10" reading was that noise.

### `2c9d55c` — a tor is stated by its finished height

Two bugs of one genus: **a number that decided the result and was never named.**

- **Nothing in the file said how tall a tor is.** `s0` was a nominal size, `h0`
  a multiple of it, `lap` an overlap, `n` a count, and the height was whatever
  those multiplied out to. Solving it forwards: **30 m on a 3 m base**, which is
  `tmp/crop/vr2/r1-a.png` and was the single worst object in `zone_longwythe`.
  The table names the finished height now (fin 12–22 m, boss 6–12, pinnacle
  14–30, hoodoo 9–19) and the base course's half-height is solved backwards from
  the lap and the taper.
- **The proportions asked for shapes that cannot exist.** `ASPECT_MAX` is 3.2
  and `placedScale` re-imposes it silently, because that is what a backstop
  does. So the fin family's 7:1 courses were never blades — they were 3.2:1 eggs,
  and every number in that row of the table described a shape the game never
  drew. **The band is applied where the shape is decided as well**, so the table
  means what it says.

Plus: the foot is buried against the **footprint**, not the height (a 20 m
pinnacle on a 2 m base does not stand 6 m deep in soil), and the skirt is sized
on the footprint for the same reason.

### `1ba5c4a` — heights up, and a boulder cluster is one bed

The first height table was too low and `tmp/shots/vr2-r3/zone_longwythe.jpg` went
bare in the near and middle ground — `BRIEF.md` asks for "distant rock spires"
and "the eye must always have something to land on".

And `_genCell` picked the anchor kind **per child**, so a zone's weight table was
a *mixture* and every cluster in the zone was the same mixture — uniformity
dressed up as variety, and exactly what `handoff/scatter.md` measured on the
undergrowth (nearest neighbour the same species 32–43% of the time, "an even
salad"). 72% of children now take a draw hashed on the *parent's* position.
Arithmetic on Longwythe's own table: P(two anchors in a cluster share a kind)
was `sum(w^2)` = **0.210**, is now `.72² + (1-.72²)·0.210` = **0.619**.

### `f0dcb9f` — a course must be *supported*

`tmp/crop/vr2/r4-a.png` and `r5-a.png`: a table rock with a wide cap and a black
undercut. It is the shape `handoff/rocks.md` records from `_genOutcrop` as
`zone_ostium_gorge`'s four-in-one-frame defect, and "the same mushroom rock" is
the judge's phrase for it.

The first fix was aimed at the wrong half. A course stops being supported two
ways and only one of them is width: **`boss` steps sideways by a gaussian at
0.70 of its own half-width** on a lap as shallow as 0.24, so the cap is not
wider than its base, it is standing *beside* it. Stated on support: a course
that is wider than the one below **or** whose centre is more than 0.55 of that
block's half-width off it takes at least a 0.58 lap. `stackPlan` gets the width
half of the same guarantee, because `corestones` can draw course 1 at 1.47x
course 0 on a 0.38 overlap.

---

## Measured negatives, in full

| hypothesis | probe | result |
|---|---|---|
| the repeated instance is one of the **eight base meshes** | `--set rocks`, `rock:base` | **No.** 8/8 distinct, min 14.80 — the healthiest row in the table. The rocks lane's "indistinguishable from a ball" is outline *complexity*, a different axis from pairwise *distance*. |
| it is the **corestone stacks** (§3.4) | `--set rocks`, `rock:stack` | **No.** 24/24 distinct, min 7.24. §3.4 was working. |
| a single `rock:tor` family is enough to grade this | ran it | **No, and it would have closed the lane.** 10/12 distinct, mean 47.51 — the fin-vs-boss pairs drown the within-form repetition. Stratifying by form gave 2/10 on fins in the same run. |
| the fin row's low numbers mean the metric is broken for narrow objects | built a prism/cone/ellipsoid anchor at 0.43 aspect | **Half true and it changes the reading.** "Clearly different, this narrow" is worth 9.815, not 51.5. The fin family was at 4.93 — genuinely below "clearly different" — and is now at 17.10. |
| **clamping the lateral step** fixes the overhanging cap | `min(0.34*wz, \|gauss\|)`, the clamp `corestones` already applies | **Works and is too expensive.** hoodoo 20/24 -> **13/24**, pinnacle 23 -> 19, boss mean 37.69 -> 26.43. The step is one of this family's strongest silhouette parameters; clamping it takes the shape away with the defect. Deepening the lap keeps both. |
| **more courses** buys back the silhouette freedom the deeper lap cost | fin 3-6, pinnacle 4-8, hoodoo 3-7 | **The opposite.** hoodoo 20/24 -> **13/24**, pinnacle 23 -> 21. More courses at these laps merge into a smoother blob, not a more articulated one. Reverted. |
| `scatterstat --set rocks` can grade the cluster-kind change | ran it | **No, and its `same-sp` column is misleading.** It reads **100%** on every zone because it measures the *sampler's* species field, and `Rocks` has never consumed it — it draws its own kind from the zone table. Real gap in the instrument, belongs to whoever owns `scatterstat`. |
| the height tail is a silhouette change | `--set rocks --seeds 24` | **No.** The profile is height-normalised, so a pure height multiplier scores exactly zero. Every row is byte-identical across that commit. It is a *composition* change and is defended as one. |

---

## Files touched

- `src/world/props/Rocks.ts` — `TORS`/`TorArchetype`, `torPlan`, `stackPlan`,
  `placedScale`, `hullExtents`, `TorCourse`/`TorPlan`/`StackCourse`, the
  cluster-coherent kind draw in `_genCell`, `_genTor` reduced to seat + record +
  skirt, `_stack` reduced to a mapping, `emit` and `build` rewired.
- `src/tools/silhouette.mts` — `rockSubjects`, the narrow-object anchor, `rocks`
  in `parseArgs`.
- `src/world/props/ZoneDress.ts` — **not edited.**

Commits `9e4cf00`, `d5e0e19`, `d30e2aa`, `2c9d55c`, `1ba5c4a`, `f0dcb9f`, plus
the tidy-up at HEAD.

## Shots

| dir | what |
|---|---|
| `tmp/shots/peak-B/zone_longwythe.png` | **before**, the frame the judge saw |
| `tmp/crop/vr2/tor-a.png`, `tor-b.png` | 4x/5x crops of it — the argument. `tor-b` is three near-identical vertical eggs stacked concentrically |
| `tmp/shots/vr2-r1` | archetype families, before the height restatement |
| `tmp/crop/vr2/r1-a.png` | the 30 m totem — why `2c9d55c` exists |
| `tmp/shots/vr2-r3`, `vr2-r4` | the plain after the height restatement, and after raising it again |
| `tmp/crop/vr2/r4-a.png`, `r5-a.png`, `r6-a.png` | the same 300x110 patch of mid-ground through the support-rule fix |
| `tmp/shots/vr2-r7` | **after**, all five judge shots at HEAD |

`vr2-r7/zone_longwythe.jpg` mid-ground now carries a low knot, a blade, a small
pinnacle and a wide table in one 60 m span; `peak-B` carried the same lozenge
eight times. `vr2-r7/zone_three_valleys.jpg` has a fin, a knot, a stack and two
low masses.

---

## What is left, ranked

1. **`--set rocks` is NOT wired into `pnpm run check` and here is why.** The
   gate's ratchet records *named pairs* (`tor#14:fin ~ tor#17:fin`), and a tor's
   name is its seed index in a stratified draw. Any future edit to `torPlan`'s
   draw order — which is any edit at all — renumbers every subject, so the whole
   baseline reads as "these are fixed" plus a fresh set of failures, on a change
   that improved things. A pair-named ratchet is the wrong shape for a
   *generated* family. **The right gate is a family-level ratchet**: fail if
   `distinct/n` for a rock family falls below its recorded floor
   (fin 19/24, hoodoo 20/24, pinnacle 21/24, boss 24/24, stack 24/24, base 8/8).
   That is a change to the gate's own logic and belongs to the **method** lane,
   not to a caller of it. Until then `--set rocks` is an on-demand bench, which
   is what `handoff/rocks.md` asked for.
2. **The fin row is the remaining debt: 19/24 at min 3.16.** It is the narrowest
   family (aspect 0.53) and the metric's ceiling falls with aspect, so it will
   always score lowest — but 3.16 is genuinely under the 9.815 narrow-object
   anchor and those pairs are real duplicates. The lever not tried is giving the
   *bedding period* more range, or letting a fin have a broken/absent crown
   course. Fins are only 14% of tors.
3. **The quilted hexagonal honeycomb is now photographed, which was the one
   thing missing.** `handoff/rocks.md` diagnosed it with a four-way ablation
   (`tmp/quilt/`, three recorded negatives: not the vertex-colour bake, not the
   normal map, not the geometry — it is `rockMaterial`'s Worley `crack` term at
   weight 0.42) and deliberately did **not** land the mitigation because it had
   never been seen in a frame. **`tmp/shots/vr2-r7/landmark_meteor.jpg` is the
   whole face of the Meteor covered in it at 1.5 km**, and it is on every tor in
   `tmp/crop/vr2/r6-a.png` too. `PropMaterials.ts:54-58` is not this lane's file.
   The ask stands: drop `crack` below 0.42, or break the cell field with a second
   octave at a different frequency, or replace the hard `f2 - f1` ridge. A
   single-scale Worley ridge reads as scales at every scale. **`node
   src/tools/texbake.mts --force` after any material edit** — the texbake key
   contains roughness and metalness and changes invalidate it silently.
4. **The near half of `zone_longwythe` has no rock in it at all.** Everything
   below the road is scrub and dirt. `_density` sweeps the carriageway
   (`smoothstep(roadDist, 4.5, 9)`) and `siteBlock` clears the pad, and the
   camera is looking straight down the corridor both of those empty — so it may
   be correct and merely badly framed. Measure before changing anything: run a
   census of instances inside the frustum's near 200 m against a camera 200 m off
   the road. Do **not** raise `rockD`; the rocks lane already found that a
   density change there is a 6-9x lever.
5. **`_genOutcrop` was not touched and has the same genus of rule** — its
   `it.s *= 0.90 / max(0.55, ex[0])` and `under.w * 0.82` cap are the outcrop
   version of `torPlan`'s support rule, written independently. It has not been
   put through the bench (a `rock:outcrop` family would be ~30 lines in
   `rockSubjects`, and `_genOutcrop` would need the same plan/seat split
   `_genTor` got). It is the one composed landform in this file that is still
   ungraded.
6. **`ZoneDress`'s Leide anchor mix is 28% `cobble`**, which is 0.3-1.05 m — a
   pebble in an anchor slot. Not obviously wrong (a cluster of small stones is a
   real thing) but it means only 72% of clusters get a block big enough to stack,
   and `_genCell` only stacks `BIG` kinds. Worth one census before anyone reads
   the boulder-field density numbers again.

---

## Two things for whoever runs the next blind round

- **The judge's factual claims are worth checking and its perceptions are worth
  believing.** "Never rotated" was false — every instance is yawed — and the
  perception behind it was exactly right, because yaw is invariant on the shape
  the generator was making. Reading the verdict literally would have sent this
  lane to add rotation that was already there; reading it as a symptom found a
  family with one member in it.
- **A family statistic can hide the defect it is meant to expose.** `rock:tor`
  at 10/12 distinct and mean 47.51 was a true number about a set that contains
  three archetypes; the defect lived entirely inside one of them. Whenever a
  generator draws a *type* before it draws parameters, stratify by the type or
  the between-type variance will swallow the within-type collapse.
