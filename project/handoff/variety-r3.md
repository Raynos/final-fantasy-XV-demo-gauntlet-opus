# variety-r3 — the judge's diagnosis was right and all three of its prescribed fixes were no-ops

Owner: the variety-r3 lane, 2026-08-24. Contract:
`project/handoff/2026-08-23-coordinator.md` "Shared rules".
Owns `src/world/props/{Rocks,ZoneDress,EcoSites}.ts`, `src/world/veg/Ecology.ts`'s
placement, and may extend `src/tools/{silhouette,scatterstat}.mts`.
**`ZoneDress.ts` and `EcoSites.ts` were not edited** — nothing in either turned
out to be the defect. `src/world/veg/Cluster.ts` was edited by one condition and
that is flagged below.

Predecessors this lane started from and did not repeat: `handoff/variety-r2.md`
(tors), `handoff/rocks.md`, `handoff/scatter.md`, `handoff/trees.md`.

---

## The headline, and it is the answer to the brief's question

Round 13 named the defect for the third consecutive round and prescribed a fix
in three clauses. **Every clause was already in the code or is measurably a
no-op, and the two things that actually cause the defect are neither.**

| the judge's clause | measured verdict |
|---|---|
| "randomise **yaw** (full 0-360°) per instance" | **Already there, and it is the *cause*.** `Rocks._item` has always drawn a full turn, and so has every course of every tor and stack. On a shape that is roughly radially symmetric about its own vertical axis yaw is invariant (`variety-r2` proved this) — and on a shape that is *not*, a free per-course turn is what builds the mushroom. See below. |
| "randomise **non-uniform scale** per instance" | **Already there.** `_item` draws `sx`/`sy`/`sz` as independent gaussians at sd 0.30/0.24/0.30; over the drawn field the mean cross-section anisotropy is **1.52-1.81** with 53-79% of instances past 1.4. It is also half of the mushroom's cause. |
| "reject any placement within N m of another **copy of the same asset**" | **Measurably worth nothing, and the measurement is new.** Same-asset nearest-neighbour distance is **1.44x-2.17x** the all-asset distance across every zone and both classes. With *k* meshes assigned independently the ratio is `sqrt(k)`; a grove carries three tree variants and a scrub knot two, so 1.73x and 1.41x **are the ceilings**. Identity is already maximally decorrelated. There is nothing for the rule to reject. |

What the defect actually is:

1. **Every width guarantee in `Rocks.ts` is stated on the local x axis of an
   object that is looked at from every azimuth.** Measured, the median tor had a
   course **1.23-1.64x wider than its own support** at some viewing azimuth, and
   a corestone stack reached **7.4x**. That is the mushroom, it is systematic
   rather than a tail, and **`silhouette.mts` is blind to it by construction**.
2. **Every landform in the mid ground was plumb.** Mean tilt **2.3-4.1°** on the
   far set — outcrops and tors — against **16.4-17.5°** on the loose boulders,
   from two floors multiplied together until they were gone. That is "all
   upright", literally, and it is the opposite of where anyone would look: the
   small stones were fine and the landforms were not.
3. **Nothing separated one plant from another.** `Cluster.maternScatter`'s
   `slack` defaults to 0 — skip the pass — and only `rockScatter` ever passed
   one. **9.1-13.3% of trees and 9.2-30.0% of bushes stood within 1.5 m of a
   neighbour**, trees as close as 73 cm. That is "two interpenetrating", and no
   amount of per-instance variation can touch it.

Gates: `pnpm run check` — see §Gates. Draw calls on the six judged frames are
**unchanged or down** (`poi_haven` 636 -> 624 and that one is confounded by the
terrain lane's `88efe38`, see §5.3b; the other five are identical); triangles
are down 2.6-4.1% on five of six.

---

## 1. The mushroom — one fabric axis missing, `19f01c25`'s parent

### The instrument, because nothing in the tree could see it

`src/tools/probes/mushroom.mts`. Per object, the ratio of a course's projected
half-width to the one below it, **maximised over 16 viewing azimuths**, through
each course's own rotated elliptical footprint.

`silhouette.mts --set rocks` cannot answer this and it is not a bug in it: every
distance there is *between two subjects*, minimised over azimuth and mirror and
normalised by each mesh's own height. **A family in which every member is a wide
cap on a narrow neck scores as varied so long as the caps differ.** That is
exactly what happened — `rock:tor:fin` read 17.6/24 distinct while 80% of its
members were mushrooms. One line has been added to that tool's blindness block.

| family | p50 | p90 | p99 | max | >1.35 | >1.6 |
|---|---|---|---|---|---|---|
| `tor:fin` before | 1.644 | 2.140 | 2.569 | 2.577 | 80.2% | 56.2% |
| `tor:hoodoo` before | 1.453 | 1.914 | 2.119 | 2.249 | 67.5% | 32.5% |
| `tor:pinnacle` before | 1.332 | 1.707 | 2.033 | 2.208 | 47.3% | 16.0% |
| `tor:boss` before | 1.229 | 1.653 | 2.086 | 2.142 | 33.0% | 12.5% |
| `stack (plan)` | 1.014 | 1.170 | 1.281 | 1.313 | 0.0% | 0.0% |
| **`stack (as drawn)` before** | 1.102 | 1.631 | **3.683** | **7.418** | 23.8% | 11.3% |
| `tor:fin` after | 1.180 | 1.425 | 1.711 | 1.960 | **15.7%** | 4.1% |
| `tor:hoodoo` after | 1.272 | 1.423 | 1.664 | 1.707 | **23.3%** | 2.4% |
| `tor:pinnacle` after | 1.193 | 1.396 | 1.647 | 1.800 | **14.3%** | 1.3% |
| `tor:boss` after | 1.152 | 1.403 | 1.717 | 1.977 | **12.5%** | 2.6% |
| `stack (as drawn)` after | 1.027 | 1.313 | 1.878 | **2.847** | 7.2% | 1.8% |

**The two `stack` rows are the same generator read two ways and the difference
is the finding.** `stackPlan` is clean because it leaves the cross-section
isotropic; `Rocks._stack` then spreads the *anchor's* `sx`/`sz` over every
course while `corestones` yaws each one over a full turn. A rock **7.4x wider
than its support** at one azimuth, with every rule in the file satisfied.

### The fix, and it is physically the right one

A tor and a corestone stack are **one rock mass parted along one joint set**, so
their courses share a plan orientation. Per landform: a `fabric` azimuth, a
progressive `twist` on top of it (a weathered stack shears as it rises), and a
small per-course jitter. `torPlan` also caps the depth axis the way it already
capped the width axis, because with the fabric shared it is the other axis the
tor is seen from.

### The cost, and it is the interesting part

**Alignment removes a degree of freedom and the silhouette bench sees it go.**
Straight alignment alone read `rock:tor:fin` **17.6 -> 11.4** distinct and
`rock:stack` **23.8 -> 22.8**, breaching three recorded floors. Some of the
variety the ratchet had recorded *was the defect*: a per-course free turn on an
anisotropic block produces a jagged, irregular outline, and the bench scores
jagged as varied.

It is bought back on parameters that cannot mushroom — lateral drift (fin
0.30 -> 0.62, hoodoo 0.26 -> 0.46), bedding amplitude, a deliberately
**asymmetric** width jitter (narrowing is free, widening is capped), a wider
course-height range on the stacks, and wider per-tor `thin` bands.

| family (n=24, 5 resamples) | before | after | floor |
|---|---|---|---|
| `rock:tor:fin` | 17.6 | **19.8** | 13 |
| `rock:tor:hoodoo` | 20.4 | 19.8 | 19 |
| `rock:tor:pinnacle` | 19.0 | 18.6 | 14 |
| `rock:tor:boss` | 24.0 | 24.0 | 24 |
| `rock:stack` | 23.8 | **24.0** | 23 |
| `rock:base` | 8.0 | 8.0 | 8 |

`silhouette --set rocks --seeds 24 --reseeds 5`: **PASS**, all six floors held.
No floor was re-recorded and none needed to be.

---

## 2. "All upright" — the beds were level everywhere

`src/tools/probes/rockfield.mts` runs the real `_genCell` and `_genOutcrop`
against the real baked field, headless, and reports the tilt of every emitted
instance split into the loose boulder field (`near`) and the landforms (`far`).

| zone | set | mean tilt | s.d. | >5° | >10° |
|---|---|---|---|---|---|
| longwythe | near | 16.55° | 11.01 | 83.0% | 68.6% |
| **longwythe** | **far** | **2.33°** | 3.29 | **7.0%** | 2.8% |
| three_valleys | far | 3.87° | 3.77 | 26.5% | 7.1% |
| fallgrove | far | 4.05° | 4.33 | 25.7% | 8.1% |
| longwythe | far *after* | **6.68°** | 3.37 | **75.0%** | 18.3% |
| three_valleys | far *after* | 5.87° | 4.17 | 46.8% | 19.1% |
| fallgrove | far *after* | 5.85° | 4.81 | 47.8% | 11.1% |

**The loose boulders were never the problem.** Two causes, both a number
multiplied by another number until it was gone: `_item` floors `settle` at 0.18
for anything over 5 m and every tor course and outcrop block is well over 5 m,
and `_genOutcrop` then multiplied pitch and roll by a further 0.35 and by 0.4
again for a stacked block — **a standard deviation of 0.43°**. `torPlan`'s
progressive lean tilts the stack's *axis*, and the base course of a leaning tor
stayed dead level under it.

More jitter is the wrong fix and reads as rubble; both predecessor handoffs say
so and they are right. Real weathered rock is **bedded**, and bedded rock
**dips**: one angle per landform, shared by every block in it, in the same
azimuth as the lean so the two read as one deformation. Both generators pay for
it in overlap — two blocks tilted by `d` meet along a plane and the far corner
stands `w·sin(d)` proud of the contact, so an overlap authored for level beds
leaves exactly that much daylight, and `handoff/rocks.md` records what daylight
between two courses renders as.

---

## 3. Two plants could stand in the same hole

`src/tools/probes/copies.mts`, nearest-neighbour over the real `_makeTile`
output, and the same statistic is now a first-class column in `scatterstat.mts`.

| class | zone | n | NN p05 | **<1.5 m** | <3 m |
|---|---|---|---|---|---|
| trees | fallgrove | 318 -> 301 | 1.03 -> **2.13** | 9.1% -> **0.0%** | 20.8 -> 11.6% |
| trees | nebulawood | 1243 -> 1097 | **0.73** -> 2.17 | 13.3% -> **0.0%** | 41.2 -> 23.8% |
| bushes | fallgrove | 629 -> 607 | 1.07 -> 1.80 | 9.2% -> 2.8% | 28.0 -> 23.2% |
| bushes | nebulawood | 947 -> 869 | 0.69 -> 1.53 | 20.1% -> 4.5% | 50.7 -> 40.7% |
| bushes | longwythe | 1501 -> 1378 | 0.69 -> 1.45 | 20.5% -> 6.2% | 55.8 -> 49.1% |
| bushes | three_valleys | 2030 -> 1768 | 0.53 -> 1.40 | 30.0% -> 8.1% | 66.2 -> 56.2% |

**The radius was chosen against Clark-Evans R, not by taste, and the trade is
real.** A hard core removes the left tail of the NN distribution, so R rises by
arithmetic whatever it does to the picture. At the first radius tried
(`treeS[0] * (1.5 + 2.0u)`, min berth ~2.9-6.7 m) nebulawood went **0.737 ->
0.917** — from clustered to very nearly Poisson, trading the defect the Matérn
sampler exists to fix for the one it was asked to fix. At the shipped radius
(`treeS[0] * (0.8 + 0.5u)`, min berth 1.5-2.5 m):

| zone | class | R before -> after | n before -> after |
|---|---|---|---|
| fallgrove | trees | 0.742 -> **0.784** | 755 -> 713 |
| nebulawood | trees | 0.737 -> **0.826** | 2467 -> 2159 |
| alstor | trees | 0.439 -> 0.488 | 784 -> 686 |
| longwythe | trees | 0.637 -> 0.637 | 64 -> 64 |
| three_valleys | trees | 0.607 -> 0.614 | 84 -> 85 |
| fallgrove | bushes | 0.720 -> 0.750 | 1381 -> 1329 |
| nebulawood | bushes | 0.619 -> 0.674 | 2176 -> 1981 |
| longwythe | bushes | 0.663 -> 0.728 | 3392 -> 3045 |
| three_valleys | bushes | 0.671 -> 0.756 | 4540 -> 3921 |

Counts stay inside the 0.85-1.35x parity band `handoff/scatter.md` tuned `mean`
for. **Whoever tunes this next should know that R is the wrong statistic to
police a hard-core cluster process** — it mixes the within-cluster minimum
spacing with the between-cluster envelope, and only the first of those changed.
The parents are untouched.

### The bug this exposed, in a file this lane does not own

`Cluster.ts`'s rect filter lives *inside* the separation block, and halo points
are only excluded from `out` when `slack <= 0` — so the guard
`slack > 0 && out.length > 1` returned a halo point whenever a window produced
exactly one, and two adjacent tiles both emitted it. Latent while `rockScatter`
was the only caller with a slack (a 56 m rock cell is rarely that empty); it
fired immediately on a sparse zone's trees. Found as an **exact 0.00 m**
same-asset pair in `three_valleys` — one tree emitted by tiles 21,15 and 22,15.

The scatter lane is retired, the change is one condition, and it is required for
anything else here to be correct. It is `if (slack > 0)`.

---

## 3b. A thirty-metre tor could stand in a haven, and on the road

Found by reading `_genOutcrop`, then measured. Its **tor branch `continue`s
before that generator's `q` test**, so a tor — 9 to 30 m of stacked landform,
the biggest thing the prop layer places — had never seen the road term, the site
term or the POI term that filters every other stone in the file. `_genTor`
checked slope and nothing else.

And `q` itself read `eco.siteBlock` (the authored landmarks near the origin)
rather than `eco.cleared` = `max(siteBlock, poiClear)` (those plus the world
map's 124 POIs). **That is `39d4d16`'s "grass grew through every town plaza"
one layer down**, and it is sharper for rock: `rockScatter`'s reject already
takes `cleared`, so the boulder *field* was correctly excluded from a haven
while the outcrops and tors standing on top of it were not. `_density` had the
same read.

`src/tools/probes/torsite.mts` calls the real generators over a 3 km radius and
inspects what they **emit** rather than replaying the rule.

| | blocks > 4 m | on a cleared pad | within 12 m of the road |
|---|---|---|---|
| before | 3788 | **59** | 5 |
| after | 3709 | **0** | 2 |

**The tests are rings, not points, and that is the half that matters.** A tor
drifts its courses and its skirt reaches `foot * 3.6`; a crag lays blocks up to
`9 * grand` m out along `axis`. A centre test alone took 59 to 38 and left every
one of those 38 — all crag blocks whose site was just off the pad.

---

## 4. Measured negatives, in full

| hypothesis | probe | result |
|---|---|---|
| the judge's *"never rotated"* is literally true | read `Rocks.ts` | **No, and `variety-r2` already said so.** Every instance and every course is yawed over a full turn. The perception was right and the mechanism named was not. |
| **randomising yaw** buys anything | `mushroom.mts` | **It is the opposite of a fix.** Free per-course yaw on an anisotropic cross-section is what *makes* the cap. Aligning it cut `tor:fin`'s >1.35 rate from 80.2% to 15.7%. |
| **non-uniform scale** is missing | `rockfield.mts` | **No.** Mean instance anisotropy 1.63-1.81, 56-79% past 1.4, from `_item`'s three gaussians. And three.js handles `R·S` with diagonal `S` exactly (it divides by the column square-lengths, which is the correct inverse-transpose), so the "green cardboard" landmine does **not** apply to instance scale on a rigid mesh — it applies to shear and to non-uniform scale baked into a card's own geometry. |
| **rejecting a placement near another copy of the same asset** helps | new `same-asset` column in `scatterstat` | **No, and it cannot.** Ratio 1.44x-2.17x against a `sqrt(k)` ceiling of 1.41x-1.73x for the variant counts in play. Identity is already maximally decorrelated; the broken thing was all-asset spacing. |
| *"ten boulders evenly ringed"* is the Matérn cluster's radial profile | radial histogram in `rockfield.mts` | **No.** The profile is flat from 0 to ~1 spread and decays after — a disc, not an annulus. The separation pass flattens the Gaussian core rather than hollowing it. |
| *"ten boulders evenly ringed"* is in `Rocks.ts` at all | read `poi_haven` | **No — it is `PoiKits._haven`.** See §Requests. Fourteen `DodecahedronGeometry(sc, 0)` in two concentric rings around the haven deck. One literal repeated primitive, ringed. |
| the tor field's silhouette variety would survive fabric alignment unaided | `silhouette --set rocks --seeds 24 --reseeds 5` | **No.** fin 17.6 -> 11.4, stack 23.8 -> 22.8, three floors breached. Recovered on drift/bedding/jitter to 19.8 and 24.0. Recorded because it says something uncomfortable: **a ratchet can be holding a number that the defect was paying for.** |
| a bigger separation radius is better | R sweep, four radii | **No.** `treeS[0]*(1.5+2.0u)` eliminated interpenetration and took nebulawood to R 0.917, i.e. Poisson. The smallest radius that zeroes the `<1.5 m` column is the right one. |
| `scatterstat`'s `rocks` row's `same-sp 100%` meant anything | read the code | **No.** `rockScatter` passes no `kind` callback, so it was `undefined === undefined` — the most flattering wrong number the tool could print. It prints `--`. |
| the `grid` / `matern` labels in `scatterstat` were still true | read the code | **No.** The call sites landed; `_makeTile` *is* the Matérn sampler. The rows are now `shipped` (sampler + the caller's bias and water branch) and `sampler`. |

---

## 5. What is left, ranked — including two defects this lane proved and may not fix

### 1. `PoiKits._haven` is round 13's ab-04, verbatim — **town lane / whoever owns the kits**

`src/world/props/PoiKits.ts:742-761`. Six seating boulders at
`d = r * rng.range(0.55, 0.9)` and eight more at `d = r * rng.range(1.0, 1.4)`,
**every one of them a `new THREE.DodecahedronGeometry(sc, 0)`** — a bare
twelve-sided platonic solid, one mesh, scale and rotation the only variation, in
two concentric rings around the deck. `tmp/shots/vr3-r0/poi_haven.jpg` is the
frame: they are pale grey faceted balls against red-ochre ground, and they are
*the* literal instance of *"ten boulders evenly ringed"* and of round 11's
*"the same few instances repeated"* anywhere in the corpus.

The fix is one import: `Rocks.rockGeometry(seed, KINDS[i].opts)` builds real
fractured stone from a seed, `hullExtents` gives the placement its extents, and
both are already exported for exactly this. Cost is geometry, not draws — these
are `PartBuilder` merges into an existing batch.

**A census, because it is not only the haven.** `DodecahedronGeometry` /
`IcosahedronGeometry` at `detail: 0`, used as rock, appears at
`PoiKits.ts:571, 666, 747, 758, 1298, 1510, 1990, 2022, 2162` and
`Outposts.ts:511`. Ten sites. `Debris.ts:353` already carries a comment saying
this reads wrong next to real stone.

I did not make the change: `PoiKits.ts` has live commits from the perf lane
(`0c630dd`, `9137360`) and the shared rules are explicit.

### 2. Five identical bare Y-saplings — **trees lane**, and grove coherence amplifies it

`tmp/crop/vr3/fg-saplings.png` (from `tmp/shots/vr3-r3p/zone_fallgrove.png`,
crop 1000,590 400x200 at 3x) is round 13's ab-08 exactly: four pale bare
two-forked stumps in a green wood, near-identical in silhouette, bark tone and
height.

Two things make it worse than the `dead` family's silhouette row suggests
(`handoff/trees.md` reports `dead` at mean-d 34.40, the *best* row in the tree
corpus):

- The bench height-normalises, so four stumps that differ only in height score
  as one shape — and height is most of what varies between them.
- **A grove is one species by design, and that multiplies the cost of a
  low-variety species.** `Ecology.groveScatter` draws `treeSpecies` at the
  parent and every child carries it (`handoff/scatter.md`'s 88-96% coherence,
  which was the right call for the salad problem). The consequence is that you
  never see one dead tree — you see five. With species drawn per instance the
  same variety deficit would have been invisible.
  `Rocks._genCell` takes the other road for exactly this reason: 72% of children
  take the cluster's kind and 28% draw their own. Whether `groveScatter` should
  do the same is a real question, and it cannot be answered from `Ecology`
  alone: `Cluster.maternScatter` evaluates `kind` at the **parent** only.

### 3. `_genOutcrop` is still ungraded — **this lane's own debt**

`variety-r2`'s open item 5 stands. Its support rule got the projected-width
treatment here (the dip's arithmetic) but it has never been through
`silhouette.mts`, because that would need the same plan/seat split `_genTor`
got. A `rock:outcrop` family is ~30 lines in `rockSubjects` plus that split.

### 3b. `poi_haven` no longer contains the haven — **terrain lane**

Not this lane's, and worth flagging loudly because the shot is one of the six a
blind judge reads. `Shots.ts` frames it from a hard-coded
`pos: [996, 40, -688]`, and at `88efe38` (*"The cone was never only the peak:
give every disc landform the same frame"*, which reshaped fourteen mesas and
buttes) the ground under that camera rose. `tmp/shots/hv-a/poi_haven.jpg`
(`--build 262cb01`) is the composed aerial view; `tmp/shots/hv-b/poi_haven.jpg`
(`--build df0f705`) is **the same camera looking at dirt**, with the haven deck
just visible along the top edge.

**Attributed, not assumed.** `Ecology.height(996, -688)` against the current
bake reads **40.72 m** and the camera sits at **y = 40** — it is *inside the
hillside*, which explains the frame completely. And it is not this lane's
rocks: a census of every instance `_genCell` and `_genOutcrop` emit within 40 m
of that point finds exactly one stone over 2 m, and it is 35 m away. Nothing in
this lane touches the heightfield and the camera is a literal.

`Shots.ts`'s own comment records that this shot was re-framed on 2026-08-24 for
exactly this reason, by `ac1a495` *"Re-frame three corpus shots that had stopped
containing their subjects"*. It has stopped again. **A hard-coded camera in a
world whose landforms are being rebuilt is a shot that will keep going stale** —
`LANDMINES.md` already says "coordinates go stale", and this is the third time.

### 4. The near half of `zone_longwythe` still has no rock in it

`variety-r2`'s open item 4, unchanged and unmeasured. Everything below the road
in that frame is scrub and dirt. The census it asks for (instances inside the
frustum's near 200 m, against a camera 200 m off the road) is still the right
next step, and `probes/rockfield.mts` now does most of the work — it already
gathers the real instances over a window.

### 5. `ZoneDress`'s Leide anchor mix is 28% `cobble` — **deliberately not changed**

`variety-r2`'s open item 6. It is real (a 0.3-1.05 m stone in an *anchor* slot,
and `_genCell` only stacks `BIG` kinds, so 28% of clusters cannot become a tor)
but it is a *density and composition* question, not a variety one, and this lane
had no measurement that said it was the judge's defect. Moving weight out of
`cobble` also interacts with item 4 above, and the rocks lane's warning that
density here is a 6-9x lever means it should be measured before it is touched.

### 6. The `same-asset` column deserves a floor once someone adds a variant

It is currently a diagnostic. The moment a species gains a fourth variant the
ceiling moves (`sqrt(4) = 2.0`), so a fixed threshold would be wrong; the right
gate is "no lower than `sqrt(variants) * 0.85`", and it belongs to whoever owns
`check.mts`.

---

## 6. Gates

`silhouette --set rocks --seeds 24 --reseeds 5` — **PASS**, all six family
floors held, three families above where they started.

`scatterstat` — calibration anchors poisson **0.989** / lattice **1.258** /
matérn **0.519**, dynamic range 2.42x, not void.

`pnpm run check` — see the run recorded at the foot of this file.

Draw calls and triangles on the six judged frames, `tmp/shots/vr3-r0` (the
session's starting HEAD, `262cb01`) against `tmp/shots/vr3-r4`. **That window
contains other lanes' commits too** — the terrain lane's `88efe38` and the perf
lane's `eda9021` among them — so read it as "the budget did not move", not as
this lane's own cost. The isolated numbers, taken immediately either side of the
separation commit alone, are `zone_nebulawood` **731 -> 711** and
`zone_fallgrove` **606 -> 626**: the grass field's chunk allocation moving, the
same +-20 `handoff/scatter.md` recorded, net zero across the pair.

| shot | draws | triangles |
|---|---|---|
| `zone_longwythe` | 614 -> 614 | 7 796 757 -> 7 571 228 (−2.9%) |
| `zone_three_valleys` | 532 -> 532 | 7 960 134 -> 7 724 121 (−3.0%) |
| `zone_vannath` | 714 -> 714 | 9 100 321 -> 8 811 311 (−3.2%) |
| `poi_haven` | 636 -> **624** | 7 437 622 -> 7 597 352 (+2.1%) |
| `zone_fallgrove` | 606 -> 606 | 11 682 096 -> 11 381 743 (−2.6%) |
| `vista_dawn` | 736 -> 736 | 18 854 889 -> 18 083 170 (−4.1%) |

Every lever in this lane is per-instance. **No new mesh, no new geometry, no new
`InstancedMesh`, no new draw call**, which is the only budget under which any of
it was affordable.

---

## 7. Files touched

- `src/world/props/Rocks.ts` — `corestones` fabric + twist + wider asymmetric
  jitter; `torPlan` fabric, twist, `dip`, depth-axis cap, dip-paid rise, wider
  drift/bedding/width bands, wider `thin` and `lean` ranges in `TORS`;
  `_genOutcrop` `dipM`/`dipS` and the dip-paid seat; `_density` and `_genOutcrop`
  read `cleared` rather than `siteBlock`; ring-sampled pad/road exclusion in
  `_genTor` and in `_genOutcrop`'s crag branch.
- `src/world/veg/Ecology.ts` — `ScatterSep`; `groveScatter` and `scrubScatter`
  now pass a radius and a slack.
- `src/world/veg/Cluster.ts` — **one condition**, `slack > 0`. Not this lane's
  file; see §3.
- `src/tools/scatterstat.mts` — `Pt.id`, the same-asset nearest-neighbour pass,
  the `<1.5m` column, `shipped`/`sampler` labels, the `rocks` `same-sp` lie, the
  bush variant stub.
- `src/tools/silhouette.mts` — one line of blindness, and it is the load-bearing
  one.
- `src/tools/probes/mushroom.mts`, `rockfield.mts`, `copies.mts`, `torsite.mts`
  — new.
- **Not edited:** `src/world/props/ZoneDress.ts`, `src/world/props/EcoSites.ts`,
  `src/world/veg/Trees.ts`, `src/world/veg/Bushes.ts`, `src/world/props/PoiKits.ts`,
  `src/engine/**`, `src/world/props/TileStream.ts`, `src/characters/**`.

## 8. Shots

| path | what |
|---|---|
| `tmp/shots/vr3-r0`, `vr3-r0p` | **before**, the six frames the judge read |
| `tmp/crop/vr3/tv-right.png` | the mushroom rocks in `zone_three_valleys`, 6x — a wide flat cap on a narrow neck, three times in one crop |
| `tmp/crop/vr3/lw-mid.png` | `zone_longwythe`'s mid band, 4x, before |
| `tmp/shots/vr3-r1`, `vr3-r1b` | after the fabric fix |
| `tmp/crop/vr3/tv-right-r1.png` | the same crop: no caps, but every landform still plumb |
| `tmp/shots/vr3-before`, `vr3-r1b` | `zone_ostium_gorge` / `callaegh` / `keycatrich`, the rocky zones, either side |
| `tmp/crop/vr3/og-a.png`, `og-b.png` | the `zone_ostium_gorge` balanced rock at 3x, before and after — see the note below |
| `tmp/shots/vr3-r2` | after the dip |
| `tmp/crop/vr3/tv-right-r2.png`, `lw-mid-r2.png` | the same two crops: a whaleback, a knot, a leaning column and a tilted blade where there were three upright piles |
| `tmp/shots/vr3-r3`, `vr3-r3p` | after the separation, `fallgrove` / `nebulawood` / `longwythe` |
| `tmp/crop/vr3/fg-saplings.png` | **round 13's ab-08**, photographed |
| `tmp/shots/vr3-r4`, `vr3-r4p` | **after**, all six judged frames at HEAD |
| `tmp/crop/vr3/vn-trees.png`, `vn-rocks.png` | `zone_vannath`'s savanna stand and its mid-ground stones |
| `tmp/crop/vr3/cal-a.png`, `cal-b.png` | **the clearest single before/after in the lane.** `zone_callaegh`'s foreground, 2x: one smooth plumb mass becomes three dipping blades with visible bedding and a rock train below |
| `tmp/shots/hv-a`, `hv-b` | `poi_haven` either side of the terrain lane's `88efe38` — see §5.3b |

**One thing the frames say that the numbers do not.** `og-b.png` — the big
foreground rock in `zone_ostium_gorge` — is still a balanced rock to the eye and
is *not* a mushroom by any measurement here: it is a tall egg whose base is
narrower than the block it sits on, sunk 30% of its own height into it, with a
hard black contact line and no talus. The cap ratio is under 1. **The read comes
from the contact, not from the widths**, and a skirt of spalled blocks at the
joint would probably fix it. Nothing in this lane measures "does the contact
read", and it is the obvious next instrument.
