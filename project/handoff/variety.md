# Variety — the world was statistically uniform where a shipped game is authored

Owner: the variety agent (`PORT=5520`), 2026-08-23.
Branch: `worktree-agent-aa9d85e71c6649779`, merged up from `main` at `6b61bec`
(**created 225 commits behind — check this first, always; that is now five
agents in a row and it should probably become a worktree-creation step**).
Predecessors: `project/handoff/budget.md` (which handed this over and carries
the pricing everything below depends on), `project/handoff/vegetation.md`,
`project/handoff/perf.md`.

**Status: five commits landed, all gated. `pnpm run check` 11/11, `anycheck` 0,
`perf.mts` and `gameplay.mts` both PASS with `RULER_VALID: true` and nothing
regressed. Net draw-call change across the six graded vegetation shots is
-20, +5, +1, 0, -3, 0 — i.e. zero, with the wooded frame actually cheaper.**

---

## The premise, and why it is not a rendering brief

`compare.mts --control` was added by the budget lane and run: eight pairs, four
ours-vs-FFXV and four FFXV-vs-FFXV, shuffled and neutrally named. The judge
called the real pairs 4/4 at HIGH and the control pairs 4/4 "cannot tell, LOW".
**It is not saturated and it discriminates, so its verdict is evidence.**

Asked for the single most reliable cue across the whole set it said, unprompted:

> "**terrain and vegetation authoring** — the demo's ground is always one
> smooth noise-displaced surface with a single blended texture and instanced
> blob rocks/trees carrying no cast shadows, under flat painted cloud cards,
> whereas the shipped frames always show sculpted, normal-mapped rock and
> individually shaded foliage."

And on individual frames: *"the scattered boulders are the same few instances
repeated"*, *"near-identical small trees… with pale untextured trunks"*.

The technical key, from `project/handoff/perf.md` and re-stated because
everything below follows from it: `corr(ms, draws) = 0.801` against 0.628 for
triangles, `ms = 8.7 us x draws + 0.54 ms`, `cpu == ms` on every corpus shot.
**Per-instance variation is free. Draw calls are not.** Design accordingly.

---

## What was uniform, and what it is now

### 1. `2621d63` — every trunk in the world was one colour

Not "similar". **The wood `InstancedMesh` carried no per-instance colour at
all** — only the leaves did. A species' three variants shared one
`MeshStandardMaterial` with one `S.bark`, so a stand of a hundred trees drew a
hundred copies of one tan dowel. `tmp/crop/v0-trunks.png` at 3x is a row of
identical pale sticks with the same value, the same hue and the same one-stop
gradient down the bole. That is the judge's "pale untextured trunks", and the
second half of it is not a texture complaint — it is exact.

`barkTone(x, z)` is a position-hashed draw giving value **0.50–1.35** and a
hue that moves with it (warm = heartwood red-brown, cool = lichen grey-green,
so green moves least and blue most).

**The range is deliberately 2.7:1 and that number is the finding.** At the
distance an establishing frame puts a trunk, anything under about 1.6:1 is
invisible. `SHADE_MIN`/`SHADE_SPAN` records the same threshold from the other
side, where 1.6:1 on a *canopy* was already too much and put near-black trees
against near-white ones. A canopy is a soft mass and a trunk is a hard vertical
line; they do not want the same spread, and reading one lesson onto the other
is how this stayed at 1:1 for eight rounds.

Two mechanical traps, both commented at the site:

- `vertexColors: true` is required on the wood material even though nothing
  authors vertex colours. Three declares `vColor` in the **vertex** stage for
  `USE_INSTANCING_COLOR` alone but only *consumes* it under `USE_COLOR`.
- `TreeBuilder`'s wood accumulator emits no `color` attribute, so a white one
  is added at build time. Without it the attribute is unbound and **every trunk
  renders black**.

### 2. `0503479` — trees did not lean, and their yaw did nothing

Two per-instance parameters, both free.

**Lean** was `gauss(0, 0.04)` — 2.3 degrees, which is plumb — and it was
applied as `_e.set(tilt, yaw, tilt * 0.7)`, i.e. *the same number in both Euler
components*, so the entire world leaned along one fixed diagonal. Now a
magnitude (`u^2 * 0.30 rad`: median ~4 degrees, tail to 17) and an azimuth
biased by a 48 m cell hash, so a stand agrees with itself the way a wind-formed
or downhill-leaning stand does. A purely per-tree azimuth is noise and reads as
one.

**Crown ellipse.** `sw` was one number on both x and z, so every crown was a
disc in plan — and *that* is why the per-instance yaw this record has always
carried changed nothing: `buildTree` spreads branches over a full turn, a grown
tree is very nearly rotationally symmetric, and yawing a disc rotates a shape
onto itself. `swx`/`swz` are drawn independently (up to 1.22:1) and the
existing yaw orients the ellipse, so **the yaw becomes a silhouette parameter
for free**.

Both apply in the impostor ring too, so the swap at `geoRange` steps neither
silhouette nor plan outline.

**The scatter is bit-identical:** `zone_fallgrove` reports 12 920 653 triangles
and 612 calls on both sides of both commits. The old `rng.gauss(0, 0.04)` draw
is still *taken* — its value is now a small azimuth jitter — because the count
of draws per candidate is load-bearing. Drop one and every later candidate in
the tile re-rolls, the forest re-scatters, and nothing is ablatable.

### 3. `b4bd4e2` — the scatter was a stratified grid, which is *more* uniform
than random

`_makeTile` put one candidate per 8 m cell, jittered inside it, accepted with
probability `treeDensity`. Stratification is what you reach for when you want
spacing *more* even than random, and `treeDensity` is a handful of
low-frequency fields, so the spacing came out constant to within a cell across
a whole zone. That is the mechanism behind "even spacing", "near-uniform
spacing" and "the same few instances repeated".

`_clumped` bends the density with two octaves — 31 m (a thicket) and 104 m (a
stand) — before the acceptance test. Two details are the difference between
this working and not:

- **Applied in gap space, `1 - (1-d)^k`, not `d * k`.** A closed canopy already
  has `d` near one, so a multiplier can only ever *thin* it and the forest
  would have come out uniformly sparser with holes rather than clumped. In gap
  space `d = 1` is a fixed point and `k` moves the open ground about.
- **The glade gate is separate and is the part that reads.** An exponent never
  reaches zero, so thin places stay a thin scatter rather than a clearing. The
  gate ramps cover to nothing below a threshold on the same field, which is
  what puts a visible edge on a glade.

The far canopy ring gets the same field, so a glade is still a glade at nine
hundred metres.

**The geometry budget was already binding in a wooded frame, so this spends the
same budget on denser thickets and empty glades instead of an even carpet.**
That is why `tmp/shots/v3/zone_fallgrove.jpg` is a layered canopy with sky
through it where `tmp/shots/v0/` was a lawn with sticks on it, for *fewer*
triangles.

### 4. `a26900f` — the boulder field had one size class (and see the negative)

Size spanned [2.2, 6.0] for granite with `t = u^1.65` on top, so the median
stone sat near the bottom of its band and every boulder in a frame was within a
factor of two of every other one. The top 10% of the big kinds now scale to
2.2x, so a field has erratics in it that are landmarks — one 12 m block does
more for a middle distance than fifty 3 m ones. Per-axis jitter roughly doubled
(0.16/0.13/0.16 -> 0.30/0.24/0.30).

**The anisotropy is exact, not an approximation.** The instance matrix's linear
part is `R * S` with `S` diagonal, and three's instanced normal path divides by
the column square-lengths, which *is* the correct inverse-transpose for a
rotation times an axis scale. A shear would not be — three says so in a comment
in `project_vertex` — so this stops at axis scale.

### 5. `5d3ac39` — the undergrowth had the same defect, worse

`Bushes._makeTile`'s stratified grid is 4 m, so it is even more regular than
the forest's. `scrubDensity` does carry a patch mask but it runs at 0.017 — a
59 m lobe — so it decides *whether* a hillside has scrub and never how the
scrub is arranged inside a patch. The result is the even lattice of identical
dark dots in every open zone.

Same two-octave field at 17 m (a knot of three or four bushes growing off each
other's litter) and 61 m (the thicket the knots sit in — deliberately near the
patch mask's own scale so the two agree rather than beat). **No glade gate**:
the patch mask already puts scrub in islands, and a second hard cutoff would
eat the cover the vegetation lane just finished putting back into Leide.

---

## Measured negatives, in full

| hypothesis | probe | result |
|---|---|---|
| "the same few instances repeated" means **eight base rock meshes**; give each kind three fracture patterns | built it — 3 seeds per big kind, 2 for talus/cobble, position-hashed, one material — and captured both sides as PNG | **+104 draw calls on `zone_three_valleys` (535 -> 639) for a mean difference of 1.077/255, which is *under* `imgdiff`'s own 1.5–1.9/255 noise floor.** Reverted. |
| a new instanced mesh costs one draw call | counted | **four.** Colour pass plus one per shadow cascade. 22 extra meshes was 88 extra calls. This is the number to price any "more meshes" idea with. |
| what reads on a distant hillside is the mesh | side-by-side 3x crops, `tmp/crop/v3-tv-rocks.png` vs `tmp/crop/v4-tv-rocks.png` | **no.** Size class and proportion. The free version (`a26900f`) moved `imgdiff` by 1.100/255 — the *same* magnitude — for zero draws. |
| `reliefstat` / `imagestats` can grade this lane | not run, deliberately | the vegetation and terrain-material lanes both recorded that these are density and colour instruments and this is a *distribution* change. Neither was going to grade it and running them would only have produced a number to argue with. |

---

## Cost

Six graded vegetation shots, `perf.mts`, quiet tree, `RULER_VALID: true`:

| shot | ms | fps | draws (before -> after) | triangles Δ |
|---|---|---|---|---|
| `zone_fallgrove` | 3.60 | 278 | 612 -> 592 | −2.4% |
| `zone_vannath` | 4.75 | 211 | 704 -> 709 | −0.3% |
| `zone_longwythe` | 3.75 | 267 | 577 -> 578 | +0.9% |
| `zone_three_valleys` | 3.10 | 323 | 535 -> 535 | +1.6% |
| `vista_noon` | 3.20 | 313 | 532 -> 529 | +1.2% |
| `zone_nebulawood` | 4.50 | 222 | 634 -> 634 | +0.2% |

`gameplay.mts --baseline`: PASS on every segment, worst `streaming-traverse`
at 100 fps (10.0 ms against the budget lane's 13.1). **`menu-open` — a UI
screen that shares nothing with vegetation — came back 4.2 ms against its 4.8 ms
baseline**, which is the budget lane's own trap-check for a contended machine
and it passes: nothing is systematically inflated.

---

## Gates

`PORT=5520 pnpm run check`: **11/11**. `anycheck` 0. `combatloop` 31/31,
`uxcheck` 93/93, `horizoncheck` PASS at worst MCC 0.766 (unchanged),
`heightcheck`, `driftcheck`, `roadcheck`, `creaturecheck`, `integration`,
`orphans`, build. `pnpm run typecheck` and `typecheck:tools` clean.

---

## Files touched

- `src/world/veg/Trees.ts` — `barkTone`, `LEAN_MAX`, `CLUMP_*`, `_clumped`,
  `swx`/`swz`, `lx`/`lz`, wood `instanceColor` and its white `color` attribute.
- `src/world/veg/Bushes.ts` — `SCRUB_CLUMP_*`, `_clumped`, `_nClump`.
- `src/world/props/Rocks.ts` — size tail on the big kinds, wider axis jitter.
- this file.

Nothing under `src/world/terrain/`, `src/engine/`, `src/world/town/`,
`src/game/` or `src/ui/` was edited. **No other lane's file was touched.**

---

## What is left, ranked

1. **The terrain far-LOD forest tint is still not built, and I did not build
   it — but I now think the brief overrates it, and here is why.** Both judges
   asked for "a forest-tinted terrain far-LOD carrying cover into haze past the
   last instance". `TerrainMaterial.ts` already has the exact precedent: the
   tier-D sward, a grass far-LOD painted into the terrain from 100–185 m with a
   patchy cover field, wind, and a colour *measured* from two `--raw` captures.
   Extending that to a tier-E canopy is maybe thirty lines in a place that
   already knows how to do it. **The problem is where it would show.** It has to
   be gated on `bioGreen` (there is no tree-density signal in the shader, and
   `terrain/Biome.ts` bakes only `green` and `damp` into the spare alpha
   channels), and the zones with high `bioGreen` — fallgrove 0.82, nebulawood
   0.62 — are the ones with *close* horizons. The frames with a kilometre of
   visible ground are `zone_vannath`, `vista_noon`, `zone_three_valleys`,
   `zone_longwythe`, all Leide, all `green` 0.05–0.12. So the change would be
   invisible in exactly the shots it was asked for. **Before building it,
   measure: pick the shots where ground past 900 m is more than a few per cent
   of the frame AND `bioGreen > 0.4`.** If that set is empty the item should be
   closed as a measured negative rather than carried a ninth round.
2. **The `vista_noon` placeholder props are still there and are still ending
   the judge's guess — fifth round now, and they are in `src/world/props/`,
   which means they are *this* lane's directory and I did not fix them.** The
   grey lattice tower, the dark sphere and the red-and-dark containers at the
   Blackrock mesa outpost (`Outposts._mesaOutpost`). The dish was already
   diagnosed and rebuilt once — read the comment on `Outposts._dish`, it is
   good — so the sphere may now be fine and the remaining offenders are the
   `texelBox` containers, whose corrugation aliases into a red-and-black
   checkerboard at that distance. **That is a mip/LOD problem on a prop
   texture, not a variety problem**, which is why I left it, but it is cheap
   and it is the oldest open item in the environment.
3. **The near field of a forest floor is still a green mat.** `Debris.ts`
   already builds logs, stumps, deadtrunks and leaf drift, and `ZoneDress`
   already gives `fallgrove` a rich litter mix (`deadtrunk` 0.8, `log` 0.7,
   `stump` 0.6). So the assets exist and the recipe exists — **check the
   density and the ranges before building anything new**: `log` draws to 200 m
   at `per: 2.2`, `stump` to 150 m at `per: 1.6`. `tmp/crop/v0-trunks.png`
   covers roughly 30 x 20 m of forest floor and has no timber in it at all, so
   either `per` is far too low for a wood or `_genCell`'s `want` is gating it.
   Measure it with a census probe, do not assume.
4. **`Trees` species selection is a 450 m grove noise plus a 40 m local**, so a
   plain like `zone_vannath` resolves to one species everywhere and the "same
   tree repeated" reading survives everything in this lane. The per-instance
   parameters now break the *silhouette* uniformity, but a second species mixed
   in at 10–20% would break the *kind* uniformity, and species share a material
   per species — so it is one extra draw per species per ring, not free but
   cheap. `Ecology.treeSpecies` and `Biomes.treeTable` are where it lives.
5. **The shadow-cascade cutoff is still visible** and is still not a cost
   limit — carried forward unchanged from `project/handoff/budget.md` §4.
6. **Painted/sprite clouds with hard alpha edges, and no aerial perspective.**
   Named in every round since 5, outside this lane, unchanged.

---

## Shots

- `tmp/shots/v0/` and `tmp/shots/v0p/` — the state as inherited (JPEG, PNG).
- `tmp/crop/v0-trunks.png`, `v1-trunks.png`, `v2-trunks.png` — the same 500x300
  patch of forest floor at 3x, before / after bark tone / after lean and
  ellipse. **The pair that carries the trunk argument.**
- `tmp/shots/v3/` — after clumping. `zone_fallgrove` against `tmp/shots/v0/` is
  the single clearest before/after in this lane.
- `tmp/crop/v3-tv-rocks.png` vs `tmp/crop/v4-tv-rocks.png` vs
  `tmp/crop/v5-tv-rocks.png` — the boulder field before, with three fracture
  patterns per kind (+104 draws, reverted), and with the free size tail. Kept
  because the middle one is the mistake most worth not repeating.
- `tmp/shots/v6/` — after undergrowth clumping.
- `tmp/shots/judge8/` — the round-8 capture set.
- `tmp/ab/r8/` (6 real pairs), `tmp/ab/r8c/` (28 control pairs),
  `tmp/ab/r8mix/` + `tmp/ab/r8mix-KEY.json` (the 12-pair shuffled round
  actually judged).

---

## Blind round 8, with its control, in the same session

`tmp/ab/r8mix/`, twelve pairs, neutrally named `pair-01 … pair-12`, shuffled
with seed 8521: **six ours-vs-FFXV and six FFXV-vs-FFXV, interleaved**, so the
judge could not know which set a pair belonged to. `compare.mts`'s own printed
question, verbatim, nothing added. A fresh agent with no context, no repo
access beyond the twelve images, and no sight of the key. Key at
`tmp/ab/r8mix-KEY.json`.

    real pairs      6 identified, 0 fooled, 0 hesitated  — all six HIGH
    control pairs   6 declined ("cannot tell", LOW)      — 0 guessed

**The judge is validated and it still beats us on every frame.** That is the
headline and it should not be softened: 6/0/0 is where this has sat since round
2, through four lanes each of which fixed the defect the previous round named.

**What moved is the cue, and I think it is the most useful thing in this
handoff.** Round 7's judge, asked unprompted for the single most reliable cue
across the whole set, said "**terrain and vegetation** authoring". Round 8's,
asked the identical question:

> "**Distant terrain silhouette.** Every demo frame renders mountains as
> smooth or faceted cones/ridges wearing one stretched noise texture — no
> strata, no erosion channels, no self-shadowing, and no vegetation
> transitioning up the slope. […] it was visible in 5 of the 6 demo panels and
> never once produced a false positive."

Vegetation is out of the headline cue. It is now defect **2** rather than the
joint **1**, and — this is the part that matters — **the complaint changed
genus**:

| round 7 | round 8 |
|---|---|
| "a field of **near-identical** small trees at **near-uniform spacing** with **pale untextured trunks**" | "Trees and bushes are a few repeated instances **with no contact shadow or AO where they meet the terrain** — so they look laid on top rather than growing out of it — and in pair 09 several clumps **float clear of the cliff** entirely" |

Uniformity, spacing and trunk colour are gone from the sentence. What replaced
them is **grounding**, which is a different system entirely and is not this
lane's. The one variety word that survives is "a few repeated instances", and
on `zone_fallgrove` specifically — the shot this lane worked hardest — it is
now *"canopies are flat blobs on bare poles"*, which is a **crown-geometry**
complaint about `duscae`'s long clear bole and thin crown, not a distribution
one.

Two honest caveats, both of which cut against reading too much into that.

1. **Comparing two judge instances is weak evidence** and is offered as exactly
   that. It is the vegetation lane's own caveat and it still applies.
2. **The control design has a leak, and the next lane should close it before
   quoting a control result again.** The judge declined all six controls — but
   its stated reason was that *both* panels carried Noctis, Prompto, the
   Regalia, a behemoth or a Japanese HUD, "assets the demo never shows at all".
   It did not fail to tell the two apart; it correctly worked out that neither
   was ours. That is still a real discrimination test — a saturated judge would
   have guessed anyway, and this one did not, six times — but it is weaker than
   intended. **A control built from two *empty landscape* plates with no
   characters, no vehicle and no HUD would be the strong version**, and
   `PAIRING` has the rows for it (`duscae-wilderness-04`, `duscae-plains-noon-05`,
   `water-lake-01`). Worth one commit to `compare.mts --control` before round 9.

---

## My honest grade for the environment, against shipped FFXV

**4.5 / 10.** The shadows and vegetation lanes both said 4; I am claiming half a
point and no more, and I want to be specific about what it is for.

What this lane was sent to do, it did, and it did it in the currency the frame
actually spends. Every trunk in the world was one colour and no one had noticed
in eight rounds because the defect was an *absent buffer*, not a wrong value.
Every tree leaned along one fixed diagonal because two Euler components were
fed from the same number. Every crown was a disc, which is why the per-instance
yaw that has been in the placement record since it was written had never
changed a silhouette. Every one of those is now a real parameter, the scatter
clumps into thickets and glades instead of a stratified lattice, the
undergrowth does the same, and the boulder field has erratics in it. **Net
draw-call change across six graded shots: zero.** The wooded frame is 2.4%
cheaper in triangles and 20 calls lighter than it was.

The half point is that the judge stopped naming vegetation first, stopped
naming spacing and stopped naming trunks, and moved to terrain. That is what
"the defect ranking keeps reshuffling, which says the lanes are hitting real
things" looks like from inside one.

What keeps it at 4.5 rather than 5 is that **the win rate did not move, again,
and this time the judge was proven to be measuring something.** Six frames, six
HIGH, no hesitation, against a control it declined six times out of six. On the
forest frame it now says "flat blobs on bare poles", which is a fair
description of a `duscae` tree and is *geometry*, and I did not touch geometry
because geometry is the one thing in this system that is not free.

And I want to record one thing against myself. I spent a real slice of this
lane building three fracture patterns per rock kind — the obvious reading of
"the same few instances repeated" — and it cost 104 draw calls on one shot to
move `imgdiff` by less than its own noise floor. The free version bought the
same 1.1/255 for nothing. **The instinct to add meshes is the expensive
instinct, and in a submission-bound renderer it should have to justify itself
against a per-instance parameter first, every time.**
