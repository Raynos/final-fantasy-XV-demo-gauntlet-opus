# Budget — re-spending a frame that was five times bigger than anyone knew

Owner: the budget agent (`PORT=5490`), 2026-08-23.
Branch: `worktree-agent-ab181c293c632af2e`, merged from `main` at `6b61bec`
(**created 200 commits behind — check this first, always; that is now four
agents in a row**).
Predecessor: `project/handoff/perf.md`, which is the discovery this lane exists
for. Read it before this.

**Status: six commits landed, all gated. `npm run check` is 11/11,
`gameplay.mts` and `perf.mts` both PASS with `RULER_VALID: true`, and nothing in
the corpus regressed. The forest shots now carry roughly twice the geometry they
did and the frame got *faster*.**

**And the blind judge is still 8/8 against us, twice.** That is at the bottom
with what it said, because it is the part of this lane that matters most to
whoever picks it up: the frame budget was never the thing standing between this
game and a shipped one.

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

### 3. `11d4ced` — the ground layer stopped at 280 m, and the judge said so

Round 6's number one tell was *"vegetation simply stops at a radius"*, named on
the four open zones — every one of which ended its ground layer at
`Bushes.impRange` = 280 m. A 1.5 m bush at 400 m is three or four pixels, which
is what stops a hillside reading as one tiling texture.

    impRange      280 -> 440 m
    impBudget     4200 -> 9000
    per-card cap  1500 -> 3400
    tileCacheMax  900 -> 1800

**This one could not be judged the way the others were.** The cost is not in
triangles (9 000 cards of eight triangles is 72 k) and not in draw calls
(`zone_three_valleys` reports 535 calls before and after). It is in the tile
loop in `Bushes.update`, which is `O(impRange^2)` and runs inside
`Vegetation.update` — the one currency here that is genuinely scarce. And
`converge()` ignores `budgetMs`, so **a posed capture cannot see it either
way**. Judged on `gameplay.mts`: `streaming-traverse` 13.1 -> 12.4 ms, i.e.
*faster*, PASS on every segment, `RULER_VALID: true`.

### 4. `a0f50cd` — the rock far-LOD deleted, and a clean negative with it

`Rocks.build` gave the far tier a detail-1 blank (80 triangles against 320) on
the note "a boulder at four hundred metres is four pixels". The far tier starts
at **165 m**, where a 4 m boulder is over twenty pixels. Both tiers now share
one geometry, so the swap at 165 m has no silhouette step and there is one
geometry in memory instead of two.

**It is not visible in a still frame, and that is the result.** Three graded
shots captured as PNG on both sides of the one line: `zone_three_valleys` mean
**0.648/255**, `zone_longwythe` **0.674**, `zone_keycatrich` **0.624** — all
under `imgdiff`'s own 1.5-1.9/255 floor. Cost: 0 of 6 shots moved past the
0.72 ms floor, draws identical. What is kept is a *pop* removed by construction
(two meshes with different vertex and chip counts), whose magnitude at the
boundary was **not** measured — a still is the wrong instrument for it.

### 5. `780dea8` — the pricing, and a warning about how it was nearly got wrong

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

## What the blind judge says — two rounds, and the complaint moved

Both rounds used `compare.mts`'s own question with nothing added, eight pairs,
sealed key. **Round 6 (`tmp/ab/`, before the ground layer and rocks): 8
identified, 0 fooled. Round 7 (`tmp/ab2/`, current HEAD): 8 identified, 0
fooled.** The win rate did not move and the hesitation rate is 0%. That is the
headline and it should not be softened.

**But the vocabulary on the forest shot changed, and that is a result.** Two
different judge instances, same shot, `zone_fallgrove`:

  round 6  *"The forest is a scatter pass: two or three tree meshes repeated at
           even spacing with identical silhouettes, no contact darkening at any
           trunk base"*
  round 7  *"a field of near-identical small trees at near-uniform spacing with
           pale untextured trunks"* — and, separately, *"trunk shadows in the
           near band and none in the far band, marking the shadow-cascade
           cutoff"*

Round 6 read the mid-ground as **billboards**; round 7 reads it as **trees with
a variety problem** and can see individual trunks and their shadows. The defect
that remains is *placement and species variety*, which is `Trees._makeTile` and
`Biomes.ts` — the vegetation lane's territory, not a cost constant. Comparing
two judge instances is weak evidence and is offered as exactly that.

Round 7's three ranked tells, in its own words:

1. **Vegetation density and variety at 100-300 m.** *"In every demo panel the
   middle distance either went completely bare... or filled with a single cloned
   asset — the same small tree, same canopy shape, same pale trunk, at
   near-uniform spacing."* The "completely bare" cases it names are
   `vista_noon`, `zone_longwythe` and `zone_three_valleys` — **the dry zones,
   and extending the bush ring to 440 m did not fix them.** `scrubbind.mts`
   already says why: `Ecology.scrubDensity` returns 0.09-0.34 there and nothing
   is capping it. This is an ecology-density question, not a budget one.
2. **Vegetation stopping at a visible radius.** *"The boundary is often circular
   and camera-centred, which is the giveaway that it's an instancing radius and
   not terrain."* Still true past 440 m. The answer is almost certainly not more
   instances — it is the terrain's own far-LOD grass/canopy tint carrying cover
   to the horizon inside haze, which is `src/world/terrain/TerrainMaterial.ts`.
3. **Cast shadows on open ground away from the camera.** *"Trunk shadows in the
   near band and none in the far band, marking the shadow-cascade cutoff."*
   `maxFar` moved 190 -> 320 in this lane and the cutoff is **still visible**.
   320 is not a cost limit either — `shadowfar.mts` measured identical draw
   counts at every distance tried. The next lane can take it further, but should
   check the far cascade's texel density first: at 320 m with a 2048 map it is
   already back to roughly what 190 m had at 1024.

Two supporting tells worth passing on unchanged, because neither is in this
lane and both were named in both rounds: **painted/sprite clouds with hard alpha
edges**, and **no aerial perspective — distant geometry stays fully saturated
instead of hazing.**


## What is left, ranked, and what is known about each

**The first two are negatives. Read them before opening either line of work.**

1. **There is no budget bug left in the ground layer.**
   `src/tools/probes/scrubbind.mts` prints all four things that could be capping
   the undergrowth in a forest zone. Geometry budget 137-352 of 2000, card
   budget 451-2769 of 4200, every per-kind `InstancedMesh` under a third full.
   The limit is `Ecology.scrubDensity` returning **0.09-0.34**, which is
   authored ecology and the vegetation lane's call. Raising a cost cap here does
   nothing at all. This is also why extending the bush card ring to 440 m did
   not fix the judge's "completely bare middle distance" on `vista_noon`,
   `zone_longwythe` and `zone_three_valleys`: those zones are thin because the
   ecology says they are.

2. **`GrassField`'s 155 m outer ring is not a fictional-budget constant.** It is
   justified on *quality*, and the justification is good: an alpha-cut card that
   small samples mips where its own silhouette no longer exists, so the whole
   quad passes or fails as one block and the field becomes a rash of dark
   rectangles. Moving it out needs an answer to that first, not a bigger budget.
   Note also that the ring's tile grid means extending it is one of the few
   vegetation changes that genuinely *does* cost draw calls — ~124 of them in a
   graded frame already, and they scale with `far^2 / tile^2`.

3. **The judge's remaining number one is vegetation *variety* in the middle
   distance, not vegetation *presence*.** Round 7, on `zone_fallgrove`: *"a
   field of near-identical small trees at near-uniform spacing with pale
   untextured trunks."* That is `Trees._makeTile`'s placement and species draw
   plus the bark material — the vegetation lane's territory. Nothing about it is
   a cost decision, and this lane's widened geometry ring is what made it
   visible: at 88 m there were only 97-130 real trees to look repetitive.

4. **The shadow cascade cutoff is still visible and is still not a cost limit.**
   Round 7: *"trunk shadows in the near band and none in the far band, marking
   the shadow-cascade cutoff."* `maxFar` moved 190 -> 320 here and
   `shadowfar.mts` measured **identical draw counts at every distance tried**,
   so the next step out is free in the binding currency. Check the far cascade's
   texel density before taking it: at 320 m on a 2048 map it is already back to
   roughly what 190 m had at 1024, so another step wants either a fourth cascade
   or a larger map, and cascade *count* recompiles every lit material.

5. **`Trees.impRange` 330 and `canopyNear` 296 are the gate on going past 250 m
   of geometry.** Both are cheap in draws (one per variant / per species). What
   is *not* cheap is the tile iteration in `Trees.update`, which is bounded by
   `impRange` and is `O(impRange^2)`: 330 -> 480 takes the loop from 121 tiles
   to 225. That is `Vegetation.update`, the 7.8 ms half of the moving frame.
   **Measure it with `gameplay.mts`, never with a held shot** — `converge()`
   ignores `budgetMs`, so a posed capture is blind to streaming cost. The bush
   ring change in this lane is the worked example.

6. **The far horizon past the last instance is a terrain problem.** Round 7:
   *"the boundary is often circular and camera-centred, which is the giveaway
   that it's an instancing radius and not terrain."* Both judges wanted a
   forest-tinted terrain far-LOD carrying cover into haze, which is
   `src/world/terrain/TerrainMaterial.ts`. Unmeasured, and the highest-value
   thing left that this lane did not reach.

7. **Two tells outside this lane, named in both rounds, unchanged:**
   painted/sprite clouds with hard alpha edges, and no aerial perspective —
   distant geometry stays fully saturated instead of hazing.

## Files touched

Game code, four files, all inside this lane's ownership:

- `src/world/veg/Trees.ts` — `geoRange`, `geoBudget`, `perVariant`, and their
  comments
- `src/world/Sky.ts` — new `cascadeResFor`, and `maxFar`
- `src/world/veg/Bushes.ts` — `impRange`, `impBudget`, per-card cap,
  `tileCacheMax`
- `src/world/props/Rocks.ts` — the far tier shares the near geometry

Nothing else in `src/` was touched, so no other lane's work moved.

Seven new probes under `src/tools/probes/`: `vegcensus` (draws/instances/
triangles per ring, in frustum), `vegattr` (ABAB attribution of this lane's
levers), `geosweep` (sweep the geometry ring), `shadowfar` and `shadowres` (the
cascade pair), `scrubbind` (what caps the undergrowth), `vegcost` (kept, but see
the warning in `780dea8` — its sequential loop drifts and it should be rewritten
ABAB before anyone trusts it).

Shots: `tmp/shots/before/` (pre-lane), `t1` (trees at 170), `t2` (full-res
cascades at 190), `t3` (maxFar 320), `t4` (geoRange 250), `t5`/`t6` (bush ring
at 440), `t7` and `rockA`/`rockB` (the rock LOD pair), `tmp/shots/shfar/` (the
shadow crops), `tmp/shots/judge/` + `tmp/ab/` (round 6), `tmp/shots/judge2/` +
`tmp/ab2/` (round 7).
