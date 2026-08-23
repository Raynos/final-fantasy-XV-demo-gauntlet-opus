# Budget — re-spending a frame that was five times bigger than anyone knew

Owner: the budget agent (`PORT=5490`), 2026-08-23.
Branch: `worktree-agent-ab181c293c632af2e`, merged from `main` at `6b61bec`
(**created 200 commits behind — check this first, always; that is now four
agents in a row**).
Predecessor: `project/handoff/perf.md`, which is the discovery this lane exists
for. Read it before this.

**Status: four commits landed, all gated. `npm run check` is 11/11,
`gameplay.mts` and `perf.mts` both PASS with `RULER_VALID: true`, and nothing in
the corpus regressed. The forest shots now carry roughly twice the geometry they
did and the frame got *faster*.** What is left is at the bottom, with the blind
judge's round-6 verdict, which is unflattering and specific.

---

## The premise

`project/handoff/perf.md` established that every perf number this project ever
took was five times too slow, because `ruler.mts` rendered 20 frames inside one
synchronous JS task and such a task is throttled ~5x once it keeps the GPU busy
past a refresh. The calm frame is 5.4 ms, not 23.

The consequence nobody had acted on: **every quality-versus-cost constant in
`src/world` was chosen by someone looking at a frame that did not exist.** This
lane went looking for those constants and re-made the decisions.

The attribution that makes it safe to spend, from the same lane:

    corr(ms, draws) = 0.801     ms = 8.7 us x draws + 0.54 ms
    corr(ms, tris)  = 0.628     cpu == ms on all 140 corpus shots

So: **triangles are close to free and draw calls are not.** Everything below
follows from that one sentence.

---

## What landed

### 1. `bf12463` + `1aee247` — the tree geometry ring, 88 m -> 250 m

`Trees.geoBudget` was **130**, and the comment beside it priced it: "geometry is
~1-3 k triangles a tree, the other two are eight." That is a triangle argument
in a frame that is bound on draw calls.

And **the geometry ring adds no draw calls at any size.** Every tree of one
variant is an instance of that variant's two `InstancedMesh`es, so the forest is
one draw per variant whatever the budget says. `src/tools/probes/vegcensus.mts`
prints the census: `tree_swamp_0_leaf`, 1 draw, 28 instances, 78 k triangles.

The census also showed 130 was *binding*: `zone_nebulawood` and `vista_dawn` sat
at exactly 130 geometry trees against 2 152 and 1 672 impostors, and
`zone_fallgrove` at 97 against 1 239 — because the graded shots are elevated
establishing frames whose nearest visible ground is 61-80 m, so an 88 m ring put
essentially the whole visible forest into billboards.

    geoRange    88 -> 250 m
    geoBudget   130 -> 1200
    perVariant  52 -> 520     (the second half of the cap)

`src/tools/probes/geosweep.mts` walks it with the shipped value re-measured
between every step, held `zone_nebulawood`:

    170 / 520    10.02 M tris   520 draws   6.1, 4.6, 4.9, 4.5 ms (interleaved)
    210 / 800    12.38 M tris   532 draws   4.8 ms
    250 / 1200   15.72 M tris   538 draws   4.6 ms
    300 / 1800   20.71 M tris   538 draws   4.7 ms

**Doubling the frame's triangles is not distinguishable from the machine's own
drift.** It stops at 250 for a reason of *shape*: `impRange` is 330 and
`canopyNear` is 296, so a geometry ring past ~250 squeezes the per-tree
billboard band out and the chain loses its middle LOD. Move those two first.

### 2. `484d7bf` — cast shadows stopped at 190 m, and every graded shot starts past it

`CSM.maxFar` was **190** and cascades 2 and 3 ran at **half resolution**. Both
came from the same group of savings. `src/tools/probes/shadowfar.mts` reports
**484 draw calls in all four configurations** — a cascade's map size and split
distance change what it *covers*, never how many times the scene is submitted.

    cascadeRes  [res, res/2, res/2] -> [res, res, res]   for `high` and `ultra`
    maxFar      190 -> 320

What it buys: the clearing in the middle of `zone_fallgrove` sits past 190 m and
was rendering as flat blown-out sand with a dozen trees standing on it casting
nothing. It now carries raking tree shadows. `tmp/shots/t3/c-fg.png` against
`tmp/shots/shfar/c-half190.png`, same crop, same camera.

**A measured negative, recorded so nobody pays for it twice.** Full-resolution
outer cascades *on their own*, at maxFar 190, are invisible: two builds captured
through `shoot.mts` (`tmp/shots/t1` half, `tmp/shots/t2` full) differ by a mean
of **0.726/255**, below `imgdiff`'s own 1.5-1.9/255 floor. The resolution only
pays once the cascade has further ground to cover. The two constants move
together or not at all.

### 3. `780dea8` — the pricing, and a warning about how it was nearly got wrong

`src/tools/probes/vegattr.mts` walks the levers ABAB from one page — old, trees
only, old, shadow only, old, both, old — so a drifting machine moves both sides
together. Held `zone_nebulawood`, quiet window:

    old            5.0 ms   520 draws   6.62 M tris
    trees only     4.9 ms   520 draws  10.02 M tris
    old            5.0 ms   520 draws   6.62 M tris
    shadow only    5.1 ms   520 draws   6.62 M tris
    old            5.1 ms   520 draws   6.62 M tris
    both           4.7 ms   520 draws  10.02 M tris
    old            4.7 ms   520 draws   6.62 M tris

---

## The certified numbers

Both on a quiet tree, at `geoRange` 250:

    gameplay.mts   PASS, every segment >= 60 fps, RULER_VALID: true
                   worst segment `streaming-traverse` 76.3 fps
                   vs baseline: streaming-traverse 15.4 -> 13.1 ms,
                   day-night-sweep 11.3 -> 7.4, combat 8.0 -> 6.0,
                   menu-open 6.1 -> 4.8 -- all FASTER. magic +0.60 ms.
                   Everything else inside the 0.38 ms floor.

    perf.mts       PASS on 12 shots, RULER_VALID: true, mean 202.9 fps,
                   worst 152 (poi_chocobo).
                   vs baseline: zone_fallgrove 5.10 -> 4.00,
                   poi_chocobo 8.25 -> 6.60. Ten unmoved. None regressed.

    npm run check  11/11.  typecheck, typecheck:tools, anycheck 0.

Triangle counts those were taken at, against the same shots in
`project/baseline-perf.json`: `zone_nebulawood` 8.3 -> 20.4 M, `zone_ravatogh`
8.0 -> 19.2 M, `zone_alstor` 9.0 -> 19.0 M, `vista_dawn` 10.4 -> 18.1 M.

**`day-night-sweep` was open defect 2 in `project/handoff/perf.md` at 88 fps and
now runs at 135.** Nothing in this lane targeted it; treat that as unexplained
rather than fixed.

---

## Two traps this lane walked into, both worth reading twice

**1. A contended machine produces a certified lie.** Two `gameplay.mts` runs of
exactly the shipped configuration came back **+8 to +13 ms on every segment**,
including `menu-open`, which draws a UI screen and shares nothing with
vegetation. Both carried `RULER_VALID: true`, because the noise floor scales
with the frame. Three other worktrees were running. **The check that saved the
work from being reverted was asking whether the segments that *cannot* have
moved did.** A certified number is not a quiet number. `ruler.mts` prints a
CONTENDED verdict above the table — read it.

**2. An in-page ablation is not a build.** `shadowres.mts` swapped
`light.shadow.mapSize` in the page and measured a 0.726/255 difference;
`shadowfar.mts` did the same swap plus `updateFrustums()` and measured
6.19/255 on the same pair. One of them is wrong and it was never worth finding
out which — two builds through `shoot.mts` settled it in one turn. **Trust the
builds.** The in-page probes are for *sweeping* a range cheaply, not for
deciding.

And an instrument note: the frame is now fast enough that `ruler.mts`'s validity
rule (`floor IQR < 0.25 x frame`) is genuinely hard to satisfy. Two runs voided
at 3.7-4.5 ms frames with 0.88-1.22 ms floors. At 200 fps the floor has to be
under 1 ms.

---

## What the blind judge says, round 6

`tmp/ab/`, eight pairs, `compare.mts`'s own question, no added instructions.
**8 identified, 0 fooled, high confidence on every one.** The verdict is
unflattering and it is still mostly about vegetation, so this is where the next
round of this lane goes.

Its three ranked tells, verbatim in substance:

1. **"Vegetation density and LOD falloff. The single most reliable tell. WebGL
   panels use a handful of instanced meshes with identical silhouettes and
   rotations, and vegetation simply *stops* at a radius, leaving bare textured
   terrain to the horizon."** Clearest on `vista_noon`, `zone_galdin`,
   `zone_longwythe`, `zone_three_valleys` — the open zones. Note this was said
   about a build that already had this lane's changes in it.
2. **"Shadow poverty... No ambient occlusion or contact darkening anywhere, so
   trees, rocks and structures all appear to float."** And: *"no
   foliage-onto-foliage shadowing: canopies are lit uniformly, so a whole forest
   reads as one flat green mass instead of the layered light/dark structure the
   PS4 panels show."*
3. **"Sky and distance handling."** Blobby clouds on a skydome, no
   aerial-perspective haze, hard horizon lines, tiling terrain texture obvious
   at mid-to-far range.

By distance, its own breakdown: **near** — "leaves are alpha-cut cards with
hard, dark cutout edges and no translucency; nothing lights through them from
behind"; **middle** — "instancing repetition unmissable, the same two or three
silhouettes at even spacing, no grass skirt or shadow where trunk meets ground";
**far** — "vegetation vanishes at a visible radius... no forest-tinted terrain
texture to fake distant canopy, so the far ground reads as bare tiling rock".

Some of that is factually wrong about the build (there *is* an impostor band,
and there *are* three grass rings), which matters: the judge is reporting what
the frame reads as, not what it contains. Treat every line as a symptom.

---

## What is left, ranked, and what is known about each

1. **The open zones read as bare ground past ~150 m.** `GrassField.LODS[2].far`
   is 155 m and `Bushes.impRange` is 280. **Neither is a fictional-budget
   constant** — the grass one is justified on *quality* (an alpha-cut card that
   small samples mips where its silhouette no longer exists, and the field turns
   into a rash of dark rectangles), and the bush ring's cost is in the tile loop,
   which is `Vegetation.update` CPU, the one currency that is not free. The
   right answer here is probably **not more instances**: it is the terrain's own
   far-LOD grass/canopy tint carrying cover to the horizon, which lives in
   `src/world/terrain/TerrainMaterial.ts`. Unmeasured.

2. **There is no budget bug left in the ground layer, and this is a first-class
   negative.** `src/tools/probes/scrubbind.mts` prints all four things that
   could be capping the undergrowth. Geometry budget 137-352 of 2000, card
   budget 451-2769 of 4200, every per-kind `InstancedMesh` under a third full.
   The limit is `Ecology.scrubDensity` returning **0.09-0.34**, which is
   authored ecology and the vegetation lane's call. Raising a cost cap here
   would do nothing at all.

3. **`Rocks` has the same shape of constant and it is unexamined.** `Rocks.build`
   caps the near tier at 90-140 instances a kind and gives the far tier a
   *detail-1 blank* (80 triangles against 320) past `nearRange` 62-165 m,
   justified as "a boulder at four hundred metres is four pixels". Each kind is
   one `InstancedMesh`, so both the caps and the detail level are triangle
   decisions and should be free. Not measured, not touched — it is one probe's
   work with `geosweep.mts` as the template.

4. **`Trees.impRange` 330 and `canopyNear` 296 are the gate on going past 250 m
   of geometry.** Both are cheap in draws (one per variant / per species). What
   is *not* cheap is the tile iteration in `Trees.update`, which is bounded by
   `impRange` and is `O(impRange^2)`: 330 -> 480 takes the loop from 121 tiles
   to 225. That is `Vegetation.update`, the 7.8 ms half of the moving frame.
   Measure with `gameplay.mts`, not with a held shot.

5. **The judge's "no foliage-onto-foliage shadowing" is now testable and was
   not before.** With `geoRange` 250 and `maxFar` 320 there are ~1 200 real
   canopies inside the cascades where there were 130 inside 190 m. If canopies
   still read as one flat mass, the cause is not the cascade — it is the leaf
   material's `translucency` / `twoSidedNormals` handling, which is
   `VegMaterial.ts`.

## Files touched

`src/world/veg/Trees.ts` (three constants and their comments),
`src/world/Sky.ts` (`cascadeResFor`, `maxFar`), and six new probes under
`src/tools/probes/`: `vegcensus`, `vegcost`, `vegattr`, `geosweep`,
`shadowres`, `shadowfar`, `scrubbind`. Nothing else in `src/` was touched, so
no other lane's work moved.

Shots: `tmp/shots/before/` (pre-lane), `tmp/shots/t1` (trees at 170),
`tmp/shots/t2` (full-res cascades at 190), `tmp/shots/t3` (maxFar 320),
`tmp/shots/t4` (geoRange 250 — the current state), `tmp/shots/judge/` and
`tmp/ab/` (round 6), `tmp/shots/shfar/` (the shadow crops).
