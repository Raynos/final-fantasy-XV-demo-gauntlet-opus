# Trees lane — §7.1–7.6, plus the scatter lane's three call sites

Owner: the trees agent, 2026-08-24. Coordinator:
`project/handoff/2026-08-23-coordinator.md`.
Owns `src/world/veg/{Trees,TreeBuilder,Bushes,GrassField,VegTextures,VegMaterial,Biomes}.ts`
— **not** `Ecology.ts` or `Cluster.ts` (the scatter lane's).
Predecessors that are still true: `project/handoff/vegetation.md` (impostor
shading and LOD), `project/handoff/variety.md` (per-instance variety),
`project/handoff/grass.md` §§2–4 and 8, `project/handoff/scatter.md` (the
sampler this lane wired), `project/handoff/method.md` (`silhouette.mts`).

---

## 1. The re-audit of §7, done before writing a line

The plan was written against `86303de` and three lanes have eaten parts of §7
since without it knowing. **Four of the eleven items were already built, or have
no consumer here.** Each row says how it was checked, not what a document said.

| item | verdict | evidence |
|---|---|---|
| **7.1** strand skeleton, radius never stored per segment | **NOT built, and deliberately not built tonight** | We have no geometry LOD1 at all: the chain is real branches → a *baked card* impostor at 250 m. "LOD1 is a re-skin of the same skeleton at a lower ring count" has **no consumer**. See §6 for the one real argument that survives for it. |
| **7.2** junction inflation + child ring re-planed on the bisector | NOT built | `grow` recursed straight off `pts[last]` with no collar and no miter. **Built tonight.** |
| **7.2** root flare, compact-support cubic, buttress lobes | half built, and the half that existed was **invisible** | A detached two-ring skirt with a `sin(3a)` wobble — and wound backwards, so it faced away from the camera. See §3. **Rebuilt tonight.** |
| **7.2** trunk stations foot-biased `t^1.8` | NOT built | `t = s/sub`, uniform, `sub = 4`. **Built tonight** (`t^1.8`, `sub = 5`, trunks only). |
| **7.2** side count follows radius, not depth | NOT built | `depth === 0 ? 8 : depth === 1 ? 5 : …`. **Built tonight**, and the honest note is that our depth table was *already* radius-correlated, so this is a correctness fix for whorl arms and reiteration shoots rather than a saving. |
| **7.3** growth habits as spec deltas | NOT built | `buildTree(sp, seed)` with no `over` at all: the three variants differed only by seed. **Built tonight.** |
| **7.4** area-conserving crown LOD (√ area ratio) | **no consumer** | Same reason as 7.1 — nothing thins limbs, so there is no thinned crown whose card wants rescaling. Recorded as not-applicable, not as skipped. |
| **7.4** card shading normals blended toward the crown radial | **ALREADY BUILT, twice** | `VegTextures.crownNormalTex` (vegetation lane, `ba6f8bc`) for both card rings, binary-searched to `CROWN_MEAN_UP = 0.84`, measured against the near ring's own 0.845. And `TreeBuilder.addLeafCard` already writes a pure crown-outward radial with an up bias for the *geometry* leaf cards. The plan's ~0.72 is a *weaker* blend than what we ship. |
| **7.4** 2 → 3 cards at 60° | NOT built | `billboardGeo` made two crossed quads. **Built tonight** for the per-tree impostor; the far stand cards stay at two, on purpose. |
| **7.5** albedo pin (`normalizeAlbedo`) that "grass got and trees never did" | **ALREADY BUILT — the plan is wrong** | `VegTextures.ts:409`: `leafClusterTex` ends `{ alphaRef: 0.42, albedo: LEAF_CARD_ALBEDO }`, and `LEAF_CARD_ALBEDO = 0.125` is declared at :336 as "the one albedo every leaf card is matched against — the tree equivalent of `GRASS_CARD_ALBEDO`". The impostor and stand-card bakes inherit it *by construction*: they render the real leaf material into a target with `MeshBasicMaterial`, so whatever the pin did is what gets baked. Verified at the call sites, as instructed. |
| **7.5** slope lean | NOT built | Confirmed: nothing read the ground normal. **Built tonight**, and it forced a real orientation fix — §4. |
| **7.5** per-tile immutable instancing for trees | **not applicable as stated** | Grass's fix is one `InstancedMesh` per tile, built once and never rewritten. Trees cannot copy it: grass has 3 rings, trees have 21 variants × 3 rings, and a per-tile mesh per variant is *four draw calls per tile per variant*. Trees use a shared per-variant pool rewritten per frame instead, which is the right trade at this variant count. Left alone. |
| **7.5** multi-view / octahedral impostors | NOT built, **not attempted** | `bakeTreeImpostor` is a single frontal ortho render. The ring is 250–330 m and the camera is near ground level over almost all of it, so the top-down error the octahedral baker fixes is barely in frame. Deferred with a reason, not forgotten — see §6. |
| **7.6** grass: tilted thatch quad per clump | NOT built, **and it is not cheap here** | See §5 — it needs a fourth per-tile ring, which is ~76 draw calls. There is a specific cheap path and it is written down. |
| **7.6** grass: root-spread ×1.8 | NOT built, **and we have already measured it as wrong** | See §5. |
| **7.6** grass: fades must shorten as well as thin | **there is no fade to fix** | Ring membership is per *tile*, a hard visible/invisible flip, softened only by the rings overlapping (blade 0–26, clump 21–84, far 78–155). There is no per-instance density or height ramp anywhere in `GrassField`. Recorded as a different and larger defect than the one §7.6 describes. |
| **7.6** bare ground is component size, not fraction | not measurable here | No instrument computes connected components of bare ground. Would need a new tool in `src/tools/`, which this lane does not own. Requested below. |

---

## 2. §7.3 habits — what landed and what it measures

`TreeBuilder.HABITS` is a table of multipliers over the species' own numbers
plus at most one structural flag. `TREE_HABITS[species]` lists three, and **the
variant index is the tier**: `Trees.build` passes `v` as `buildTree`'s fourth
argument, so a `VARIANTS = 3` band covers all three habits every run. Three
independent random draws leave one unrepresented 44% of the time, which for
three variants means the usual outcome is two shapes and a duplicate.

`Trees.pickTier` then weights the *per-instance* draw **0.50 / 0.36 / 0.14** out
of the single `rng.next()` the uniform draw already spent, so a `snapped` stem
is a rare storm-broken tree rather than a third of the forest.

Habits: `typical`, `veteran` (one-sided crown, `1 + a·cos(az − dir)`, free),
`umbrella`, `snapped` (bole truncated at 58% + a six-triangle splinter top;
leafy species reiterate two shoots off the break, `dead` does not), `layered`
(crown with vertical extent — aimed at round 8's *"canopies are flat blobs on
bare poles"*), `flagged` and `spire` (both conifer-only, see the negative below).

### The number, and it is not the number the plan asked for

`node src/tools/silhouette.mts --set trees`, threshold 4.96, dynamic range 75×:

| family | mean-d before | after | min-d before | after |
|---|---|---|---|---|
| broadleaf | 14.21 | **19.90** | 8.97 | **10.82** |
| conifer | 12.01 | **14.53** | 9.50 | **12.08** |
| dead | 15.72 | **34.40** | 13.56 | **22.65** |
| duscae | 21.32 | *19.12* | 16.72 | *16.49* |
| savanna | 18.37 | **34.87** | 13.19 | **14.71** |
| swamp | 25.31 | **27.13** | 23.18 | **23.75** |
| thicket | 17.39 | **19.51** | 13.81 | *12.06* |

**The tightest pair anywhere in the tree corpus goes 8.97 → 10.82.** Six of
seven families gain mean distance, two by 2×. `duscae` loses 10% and `thicket`
loses 13% of its minimum; both remain 2.5× above the threshold and I am
recording them rather than tuning until they go green.

**The sibling's "2 → 6 distinct silhouettes" is not reproducible here, and the
reason is the finding.** We were already 6/6: run the bench with `--seeds 6` on
the *old* code and every seeded variant of every species already scored distinct
at the calibrated threshold. Their grower produced clones and ours does not, so
the quantity that can move here is **how far apart**, not **how many**. Anyone
quoting "2 → 6" at this repo is quoting a number about a different grower.

### Measured negative: `snapped` does almost nothing to a conifer

And the reason is a property of the instrument worth knowing. The bench
normalises each mesh by its **own** height, deliberately, so pure scale scores
zero. A broken spruce is a shorter spruce of nearly the same proportions and
therefore scores as *the same shape*. Conifer went 12.01 → 12.68 with
`veteran`/`snapped`. It needed habits that change **proportion**: `flagged`
(one-sided whorl arms — the treeline shape) and `spire` (whorls starting at 42%
of the bole at 60% length) took it to 14.53 and its min-d from 9.50 to 12.08.

### Cost

Triangles per tree, meaned over all 21 variants: **2342 → 2367, +1.1%.** Wood
+12%, leaf −2.4%. The plan's −5.5% is not reproduced; our side table was already
tight, so `snapped`'s deletions only just pay for `layered`'s and `veteran`'s
additions. Per species: broadleaf +28%, duscae +25%, conifer −4%, swamp −9%,
dead −11%, savanna −12%, thicket −20%.

Draw calls: **unchanged**, by construction. No new mesh exists.

---

## 3. The thing found by probe that nobody had seen

The new root flare rendered as a **black bell at the foot of every trunk**
(`tmp/shots/trees-r1p/zone_fallgrove.png`, crop `tmp/crop/t1-foot.png`). It is
not a shading bug.

`frame(+y)` picks `ref = +x`, so a tube ring's basis comes out `(0,0,-1)` /
`(-1,0,0)`: **a tube's angle parameter sweeps the opposite rotational sense to
the flare's plain `(cos a, y, sin a)`.** Both emitted the same index pattern, so
the flare faced the other way from every other triangle on the tree. Measured on
`broadleaf#0` (`tmp/windprobe.mts`, four lines): **640 tube triangles
disagreeing with their own vertex normals, 40 flare triangles agreeing.**

The two-ring skirt this replaced had the identical bug, and was small enough and
dark enough to have hidden it for as long as it has existed. **That is most of
why trunks have always read as posts pushed into dirt** — the flare that was
supposed to fix it has never been visible.

**Would `assertConsistentWinding` have caught it? No, and this is worth the
method lane's attention.** `src/util/GeoAssert.ts:338` landed tonight and
`geocheck` passes both before and after the bug. Two independent reasons:

1. It measures **edge parity**, which is orientation-*relative*: it can only
   say that two adjacent triangles disagree with each other. A patch that is
   uniformly inside-out is perfectly self-consistent and scores clean. The
   docstring says as much ("a genuinely flipped patch is an IMBALANCE").
2. Worse for this case, the flare is a **disconnected shell**. It shares no
   edge with the branch tubes at all, so there is no interior edge anywhere in
   the mesh whose two sides could disagree. Even a check that was
   orientation-relative *and* strict would have had nothing to compare.

The check that catches it is orientation-**absolute**: the sign of
`(b−a)×(c−a) · n_authored`, per triangle. Four lines, no adjacency, and it works
on a disconnected shell and on a single triangle. Trees are the calibration
case: `broadleaf#0` reads 640 disagree / 0 agree on the tubes and 0 / 40 on the
flare, and the mesh has been shipping like that for months.

Note the corollary, which is the more alarming half: **the tube network itself
disagrees with its own authored normals, on every tree in the world, and always
has.** It renders correctly because the leaf and impostor materials are
`DoubleSide` and the wood is a closed tube seen from outside, so the sign never
mattered — until a second surface was added next to it with the other
convention. Nothing in this lane changed it, and it should be looked at
deliberately rather than flipped in passing.

---

## 4. §7.5 slope lean, and the orientation bug it exposed

22% of the slope angle toward the ground normal, added to the wind lean as a
**vector** and clamped. Flat ground contributes nothing; a 30° hillside about
6.6°.

Doing it honestly forced a fix. The lean was `Euler(lx, yaw, lz)`, and composing
XYZ that tilts `up` toward `(−lz·cos yaw, lx + lz·sin yaw)` — **the authored
lean azimuth scrambled by an unrelated random yaw.** Harmless while the azimuth
was noise (the variety lane's cell-hashed wind azimuth was already being
scrambled and nobody could tell), fatal for a lean that must point downhill.
`Trees.orient` builds `q_tilt * q_yaw` instead: yaw in the trunk's frame, tilt
in the world's. Two quaternions and a multiply per instance per frame.

---

## 5. §7.6 grass — two recorded negatives and one cheap path

**Root-spread ×1.8 is a change this repo has already measured as wrong.** Ours
places blades at `rr = sqrt(u)·rad` with `rad = hTuft·(0.26…0.56)`. ×1.8 takes
that to 0.47–1.0 × height, and `GrassField.ts` carries the measurement at the
site: radius *used* to work out at ~0.83× the tuft's own height and *"that is
not a tussock, it is a pancake — and a pancake of blades is exactly the shape
that reads as an unbroken mat rather than as separate plants."* The sibling's
×1.8 converts intra-clump overdraw into coverage in a field that does not
already have the tuft-and-dirt structure ours was tuned for. **Not built, and it
should not be built without re-running that comparison first.**

**The thatch quad needs a ring we cannot afford, and there is exactly one cheap
way in.** Grass is one `InstancedMesh` *per tile per ring*; a fourth ring is
~19 resident tiles × 4 draws ≈ **76 draw calls**, against a whole-frame budget
of 800 and a measured range of 530–700. But `swardProxyGeo`/`swardProxyMat`
already put **one instance per tuft, per tile, with exactly the right
transform**, in a mesh that is already in the scene and already costs its colour
pass draw — its vertex shader writes `gl_Position = vec4(0,0,2,1)` so every
fragment clips. Adding a low tilted quad to that geometry and letting *only*
those vertices project normally costs **zero extra draw calls**. The work is in
the material: it needs a map, an alphaTest and an instance colour, and three
builds the depth material from those properties, so the shadow pass changes too.
That is a real round of work and it is the highest-value grass item left.

---

## 6. §7.1 and multi-view impostors — why they are open, with the argument

Both are deferred with reasons rather than skipped.

**7.1's real argument is not LOD, it is vertex count.** `tube` emits two rings
per sub-segment and consecutive calls duplicate the shared ring, because
`frame()` is recomputed per segment and the two rings are *rotated* relative to
each other — welding them would twist the surface. A strand skeleton with a
parallel-transported frame would let a branch of `n` stations emit `n + 1` rings
instead of `2n`, which is close to halving wood vertices. That is worth more
here than the LOD story the plan sells it on, and it is the version to build.

**Multi-view impostors**: the ring is 250–330 m and the camera is within a few
degrees of the horizon over almost all of it, so the top-down error is barely in
frame. Port the FFXV-opus octahedral baker **with its orientation assert** when
something actually looks down on a forest — a flying shot, or the map camera.

---

## 7. The scatter lane's three call sites (handed over mid-lane)

`Ecology.groveScatter`, `scrubScatter` and `farSeat` were landed, typechecked,
measured and **not drawn**, because every call site is in this lane's files.
Wired in `10e5174`, with `project/must-run.json` gaining the three entries **in
the same commit** so `reachcheck` goes red on a regression rather than on a
promise. `Ecology.rockScatter` is not added here — its call site is the rocks
lane's, and they wired it themselves in `654c4e7`.

- `Trees._makeTile` — the 8 m lattice, `GRID`, the `DG` density grid, its
  bilerp, the per-candidate `_clumped` and the `rng.next() > d` test are gone.
  `_clumpBias` survives as a **parent** bias so the glade gate still cuts glades.
  Species comes from `p.kind` — a grove is one species.
- All per-instance draws moved from the tile `Rng` stream to
  `hashU(p.seed, k, SALT)`, one salt per meaning. The two comments calling the
  draw *count* load-bearing are now obsolete and were replaced with the reason.
- `Bushes._makeTile` — **only the `else` (woody scrub) arm** is routed through
  `scrubScatter`. The lily and reed bands keep the lattice untouched, including
  their `rng` draws, because `scrubScatter` rejects standing water outright.
  The two exclusions the old branch *order* expressed (`depth > 0.05`, and the
  reed band) are written out explicitly in the new loop.
### The count check, which is the one the rocks lane's `69829e7` says to run

Clustering must change **where** the matrices go, not how many there are, and
nothing in the running game reports an instance that was never emitted. Counted
in bare Node against the real bake over 81 tiles per zone (`tmp/treecount.mts`,
`tmp/treecount2.mts` — they run the real samplers, and the "old" side is
transcribed from `git show 10e5174^` and is a copy, good for this comparison
and nothing else).

**Trees, instances per 64 m tile:**

| zone | old lattice | new + `_clumpBias` | new, no bias | ratio |
|---|---|---|---|---|
| fallgrove | 14.42 | 12.57 | 14.57 | 0.87 |
| nebulawood | 14.91 | 13.07 | 15.25 | 0.88 |
| malacchi | 19.37 | 18.20 | 20.67 | 0.94 |
| longwythe | 0.32 | 0.41 | 0.46 | 1.28 |
| three_valleys | 0.57 | 0.70 | 0.83 | 1.23 |
| vesperpool | 40.93 | 40.70 | 43.74 | 0.99 |

0.87–1.28×, inside the scatter lane's stated 0.92–1.35 parity band. The bias
costs about 12%, which is the glade gate cutting glades — the thing it is for.

**Woody scrub, per 32 m tile,** looked alarming at first and is the opposite:

| zone | old | new + bias | ratio | **old, on ground `rootBlocked` allows** |
|---|---|---|---|---|
| fallgrove | 5.72 | 5.86 | 1.02 | 5.80 |
| nebulawood | 5.56 | 4.47 | 0.80 | 5.60 |
| malacchi | 8.32 | 6.33 | 0.76 | 7.60 |
| **longwythe** | **10.88** | **4.65** | **0.43** | **5.12** |
| three_valleys | 17.80 | 17.37 | 0.98 | 17.49 |
| vesperpool | 10.05 | 9.69 | 0.96 | 10.80 |

Longwythe appeared to lose 57% of its ground cover. It did not. **53.0% of the
old lattice's bushes there were standing on ground `rootBlocked` refuses** —
slope over 0.5, inside the 6 m road corridor, or on a cleared POI pad — because
the old scrub lattice tested only `worldRadius` and water depth and nothing
else. Longwythe is Hammerhead: the road and the pads are most of the frame.
Against the legal count the sampler is **0.91×**, and 1.03× with the bias off.
**Bushes have been growing in the road, and the swap is what stopped it.**

- `farSeat` in both tile builders. The near ring is seated for the coarser of
  the two bands it serves; `seatHeightAt` takes the **minimum** over clip
  levels, so that sinks a near tree a few centimetres rather than lifting a far
  one into the air.

---

## 8. Numbers

`manifest.json`, baseline `tmp/shots/trees-r0` (the state as inherited) against
`tmp/shots/trees-r4*` (everything in this lane, including the scatter wiring):

| shot | draws before → after | triangles before → after |
|---|---|---|
| `zone_fallgrove` | 623 → **625** | 13.48 M → **12.53 M** (−7.0%) |
| `zone_nebulawood` | 642 → **636** | 21.80 M → **25.52 M** (+17.1%) |
| `zone_malmalam` | 561 → **564** | 19.84 M → **18.45 M** (−7.0%) |
| `zone_vesperpool` | 627 → **631** | 17.49 M → **15.49 M** (−11.4%) |
| `zone_three_valleys` | 538 → **531** | 9.07 M → **8.94 M** (−1.4%) |
| `vista_noon` | 541 → **542** | 9.12 M → **8.78 M** (−3.8%) |
| `zone_malacchi` | 695 → **639** | 16.87 M → **14.89 M** (−11.8%) |

**Draw calls: −1 net over seven shots** (−56 on the worst frame, `zone_malacchi`
at 695, which was the closest any of them came to the 800 budget). Triangles
down on six of seven.

`zone_nebulawood`'s **+17.1% is the one thing in this lane I cannot explain and
did not chase.** It is a closed-canopy `duscae`/`conifer` frame and `layered` is
the +25%-per-tree habit, which is the obvious suspect and is a hypothesis, not a
finding. It wants a `--hide` ablation against `tree_duscae_1_leaf`. It is not a
draw-call or a budget problem — that frame is 636 calls — but it is a 25 M
triangle frame and it should be understood before anyone raises `geoRange`.

### Gates

`pnpm run check`: **14/16.** Both failures are attributable and neither is this
lane's:

- **`uxcheck`** — `page.evaluate: Target page, context or browser has been
  closed`. A leased-page death, not an assertion. The characters lane recorded
  the identical failure mode tonight (`a3f67c6`).
- **`floatcheck`** — `poiFloating 0 → 1`, `poiBuried 6 → 14`, and the instance
  it names is `rock_granite #24, float 21.46 m`. Both gated counters are **POI
  and rock**, which is the town and rocks lanes. The two vegetation-bearing
  counters are ungated and moved *in opposite directions*: `instBuried`
  952 → 858 and `instFloating` 320 → 364. `farSeat` seats **down** (it takes the
  minimum over clip levels), so the buried number falling is not what it should
  have done and I could not separate my instances from the rocks lane's inside
  the tool. Flagged rather than claimed.

`silhouette`, `geocheck`, `orphans`, `anycheck`, `reachcheck` (**`ok
Ecology.farSeat (6265x)`** — the wiring provably executed), `roadcheck`,
`horizoncheck`, `heightcheck`, `driftcheck`, `creaturecheck`, `combatloop` 31/31,
`integration`, `hydrocheck` and the build all pass.

**Perf was not run.** `pnpm run check` refuses the perf gates on a busy tree and
is right to: `project/LANDMINES.md` has an entire section on the perf numbers
this project lost to measuring under load. `perf.mts` and `gameplay.mts` are the
first thing to run once the machine is quiet.

One page error appears in a fresh capture and it is the water lane's own assert
firing: `[Water] shore ribbon: chain at (-3026, 1479) folded 11 of 250
triangles`. Nothing in `src/world/veg/` logs.

### What the frames actually look like, said plainly

- **`zone_fallgrove` is better than it was and worse than it was at `trees-r2`.**
  Habits, the flare and the junctions turned "pale forked poles with a green
  blob" into trees with boles, buttressed feet and six silhouettes. Then the
  grove sampler opened it out: `trees-r2j` is a closed layered canopy with sky
  through it, `trees-r4` is parkland with isolated trees and wide glades. The
  instance count barely moved (0.87×), so this is the clustering, not a loss —
  the same trees gathered into stands with real gaps between them, which is
  exactly what R 0.930 → 0.741 means. **Whether parkland is what Fallgrove
  should be is a judgement I am not making unilaterally at 3 a.m. on a shot the
  blind judge grades.** The lever is `groveScatter`'s `spread` and `mean` in
  `Ecology.ts`, which is the scatter lane's file, or `Trees._clumpBias`, which
  is mine and costs about 12% of the count.
- **A grove is one species now, and that includes `dead`.** `tmp/crop/t4-snags.png`
  is four leafless `dead` trees standing together in a Fallgrove clearing. Under
  the old per-tree species draw they would have been single incidental snags;
  clustered they read as a stand of standing dead timber, which is a real thing
  a wood does and is quite striking, but it is new and somebody should agree
  with it. It is `Ecology.treeSpecies`, not `Biomes.treeTable`.
- **`zone_nebulawood` cannot judge vegetation and I am saying so plainly.** The
  camera is at eye height *inside* a closed canopy; the frame is a wall of leaf
  cards with a cliff behind it, and no tree in it has a visible trunk, crown or
  silhouette. Every §7 change I made is invisible in that shot. The scatter lane
  reached the same conclusion independently. It is understood that it is one of
  `compare.mts`'s 30 judged frames and must not be re-framed between rounds by
  an agent whose score depends on it — recorded here for the human, not acted on.
- **`vista_noon` and `zone_three_valleys` are clean.** Both were shot after every
  change, per the `patchVeg`/`project_vertex` landmine. No blue-white card
  flooding, no sky inscatter on near vegetation. Nothing in this lane touched a
  shader, and the frames confirm it.

## 9. Requests to other lanes

- **method lane.** (a) **`assertConsistentWinding` cannot catch §3 and here is
  the calibration case.** Edge parity is orientation-*relative* and the flare is
  a *disconnected* shell, so there is not even an interior edge to disagree
  across. Add the orientation-absolute companion — `sign((b−a)×(c−a) · n)` per
  triangle — and point it at `buildTree('broadleaf', 9001, {}, 0)`: the tubes
  read 640 disagree / 0 agree and the flare 0 / 40, and *both* of those are
  facts about shipped geometry. (b)
  `silhouette.mts`'s `treeSubjects` should pass the variant index as
  `buildTree`'s new fourth argument (`buildTree(species, seed, {}, v)`) so it
  measures the *stratified* band `Trees.ts` actually ships rather than a
  `seed % 3` sample of it. (c) A bare-ground **connected-component** measure
  would close §7.6's last row; nothing here can currently say whether 22% bare
  is one clearing or 2 913 slivers.
- **coordinator.** `zone_nebulawood` is not a vegetation review shot — the
  camera is at eye height inside a closed canopy and the frame is a wall of leaf
  cards. The scatter lane says the same. A re-frame in `Shots.ts` (which you
  own) to an elevated establishing angle would make it one, and it is one of
  only two closed-canopy zones we have.
- **scatter lane** (if still live): `scatterstat.mts` should be re-run against
  the *wired* call sites now that they exist; every R number in
  `handoff/scatter.md` was measured on the sampler in isolation.

## 10. Files touched

`src/world/veg/TreeBuilder.ts`, `src/world/veg/Trees.ts`,
`src/world/veg/Bushes.ts`, `project/must-run.json`, this file.
Nothing in `Ecology.ts`, `Cluster.ts`, `src/tools/**`, `src/world/terrain/**`
or any other lane's directory.

## 11. Shots

- `tmp/shots/trees-r0/` — the state as inherited, eight shots, JPEG.
- `tmp/shots/trees-r1/`, `trees-r1p/` — habits + junctions + the flare **with
  the winding bug**. Kept: `tmp/crop/t1-foot.png` is what an inside-out root
  flare looks like and is the clearest artefact in this lane.
- `tmp/shots/trees-r2/`, `trees-r2j/` — after the winding fix.
  `tmp/crop/t2-foot.png` against `t1-foot.png` is the pair that carries §3.
- `tmp/windprobe.mts`, `tmp/tricount.mts` — the two bare-Node probes behind the
  numbers in §2 and §3. Both are four-minute rewrites if `tmp/` is deleted.
