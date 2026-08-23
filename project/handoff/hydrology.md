# Hydrology and structural grain — the terrain half of procedural-modeling

Owner: the coordinator session, working `src/world/terrain/**` and
`src/world/Terrain.ts` as one lane so that **exactly one agent bumps the bake**.
Contract: `docs/plans/2026-08-21-fable-procedural-modeling.md` §2.4, §4.2, §4.3,
§4.4. Lane map and shared rules: `project/handoff/2026-08-23-coordinator.md`.

`project/handoff/terrain.md` is a **previous, merged** lane on some of the same
files — its chevron-hatch and clipmap-filter findings are still true and are the
reason `tf_heightLod` exists. This file does not supersede it.

**Status: five commits, all landed on `main`, `BAKE_VERSION` 3 -> 4, bake
regenerated. `pnpm run typecheck` and `vite build` green on every one (the
pre-commit hook runs both). A full `pnpm run check` was still running under
seven-lane contention when this was written — see "Not yet verified".**

---

## The headline: four of this plan's premises were false

Each was disproved by measuring *before* building against it, which cost minutes
and saved a night. They are now recorded in the plan's own audit table rather
than deleted, because a plan that reads as current and is not is the more
expensive kind of wrong.

| the plan says | actually |
|---|---|
| §2.5 — port `mixSeed` seed avalanching; OGL's seeds 101/202/303 gave 0.0002/0.0004/0.0007 | **Non-port.** Ours is mulberry32, which avalanches inside `next()`. Over 4096 consecutive seeds the first draw has lag-1 autocorrelation **−0.0103** and mean **0.49893**; the second draw's is **0.00501**. Seeds 101/202/303 give **0.136 / 0.129 / 0.932** |
| §12 — "the `_outcrops` RNG coupling must be fixed *before* 2.3/2.5 land" | **Already fixed**, with the reason in its own docstring: all nine numbers are drawn per candidate whether it is placed or not. §2.3 was never blocked |
| §4.4 — "our `microDetail` evaluated on 96 m coarse rings is a live instance of the Nyquist bug" | **Already fixed on both paths.** `tf_heightLod` fades `tf_micro` over `smoothstep(4, 14, cell)` and `Terrain._vertexHeight` mirrors it exactly, five-tap grid filter included |
| §4.4 — port ring/rim relief sampled on the unit circle, to kill atan2 branch cuts | **Already obeyed at all seven `atan2` sites in `Field.ts`** — every one feeds `cos(ang)`/`sin(ang)` into `fbm2`, never the angle |

Also stale, and harmless but worth knowing: §12 says to "bump `BAKE_VERSION`"
after touching `Field.ts`. Bake freshness has been a **content hash of a fixed
source list** (`SOURCES` in `src/tools/bake.mts`) for some time, so it
invalidates itself. `BAKE_VERSION` is the *container format* version and only
moves when the section layout changes — which it did here, for `hydro`.

---

## What is done and verified

### §2.4 — the erosion pass publishes a placement API (`3cf989f`, `9533d50`)

`Terrain.erosionAt(x, z, out)` -> `{accum, deposit, scree, wet, rock, flowX, flowZ}`.

620 000 droplets have always run at bake time and written down where the water
went. The only consumer of any of it was the splat's control texture, and
`_derive` then nulled `flow`, `sed` and `slope0` outright — so every scatterer
in the world guessed from slope and noise, and material, plants and props had no
way to agree about where water went.

**Three measurements, each of which changed the design.**

- **The splat channel cannot substitute for this.** Over 65 536 samples, raw
  droplet accumulation is exactly zero on **31.5%** of the world — the
  interfluves — with p50 1.92, p99 26.2, max 51.4. After the five-tap blur and
  the log the shader wants, `ctrl.r` is exactly zero on **10.3%**, its median is
  **0.173**, and **46.4%** of the world sits above 0.2. Stone bars keyed off it
  would bar half of Eos.
- **Reduction to 16 m is by maximum, not mean.** A wash is one or two 4 m cells
  wide; a 4x4 mean is that same smear at a coarser scale.
- **The first encoding was written, measured and thrown away.** Divide by p99.9
  and clamp left `wet` at **p90 0.965** — saturated — and squeezed accumulation's
  top percentile, the only part anything places against, into 0.784-1.000. Every
  channel is now its own **percentile** among the cells that carry any of it,
  zero preserved as zero. `accum > 0.97` means *wetter than 97% of the wet
  cells*, at any resolution, under any erosion tuning, forever.

**Verified a channel network and not a haze, against a negative control.** A hot
cell's neighbour is also hot at **3.19x** chance at the 90th percentile, **4.65x**
at the 95th and **11.13x** at the 99th — rising monotonically as the threshold
tightens, which is what a drainage network does and what noise cannot. White
noise at the same 5% share scores **0.94x**.

`Field._hydrology` **asserts at build time** that each channel's median is a
percentile. That assert is what caught the saturated `wet`. The *spatial* claim
is gated by `src/tools/hydrocheck.mts`, which the method lane built at my
request with the control included.

**Consumers, so this is not another declared-but-never-executed system**
(`Debris._fit`, five of them): reeds also take any ground the droplets left wet
rather than only a 2.2 m band at sea level — a marsh is not a lake edge, and
most reeds are in the marsh; driftwood strandlines where water *ran* rather than
at a constant elevation all round the world; bones bleach on `1 - wet`, so a dry
zone can have damp hollows; man-made rubbish also collects where the water drops
what it carries, instead of ringing the road at a fixed radius; and **debris
fines downstream** — leaves scale `0.55 + 0.75·accum`, branches `0.85 + 0.25·`,
logs and stumps `1.25 − 0.45·`. All three off **one** channel, which is why they
agree. Two noise masks would have disagreed and read as noise.

### §4.2 — real channels cut from the accumulation field (`1ea6824`, `fe407f1`)

`Field._inciseDrainage`, between erosion and the talus pass on purpose: erosion
fills a channel cut before it, and talus is what lays the fresh walls back to a
repose angle instead of leaving a trench with vertical sides.

**800 266 cells cut, 18.58% of the grid, mean 2.10 m, p90 5.61 m, max 9.00 m.**
Connected, which is the whole claim: a cut cell's neighbour is also cut **87.77%**
of the time against an **18.58%** chance, a lift of **4.72x**. Nothing raised.

Three things worth carrying forward:

- **Band on the rank, never on the value.** The first version interpolated
  `smoothstep(lo, hi, a)` over raw accumulation with `hi` = the single maximum of
  a heavy-tailed field. The smoothstep therefore evaluated to about zero for
  every cell in the top band and **exactly 51 cells in the whole world** came out
  deeper than 4 m — the trunk valleys the pass exists to carve did not exist.
  This is the *same* heavy-tail mistake the placement channel had already had to
  unlearn one commit earlier, which is the argument for ranking once and using
  the rank everywhere rather than reaching for the magnitude because it is nearer
  to hand.
- **The hard slope gate is not optional.** Accumulation on a flat is the
  tie-breaking noise of a transport model with nowhere downhill to go. Nothing is
  cut below 0.02 m/m, fully open past 0.06.
- **A floor may only hold a cut back, never lift ground.** Clamping the seabed to
  a constant **raised 17 772 cells** that already sat below it — a floor doing the
  opposite of its job in the one place nobody looks. It is bounded by the cell's
  own height now.

### §4.3 — the ranges have a regional strike (`f28cd89`)

Both ridge belts built their structural frame **per sample point**, and surveying
that frame over 33x33 km at 250 m says exactly why our ranges read as fields of
separate cones.

| | before | after |
|---|---|---|
| aspect, far field | p10 **0.54** · p50 1.22 · p90 2.06 | p10 2.39 · p50 **2.78** · p90 3.13 |
| aspect, ridge belt | p10 0.62 · p50 1.21 · p90 1.98 | p10 2.45 · p50 **2.80** · p90 3.15 |
| grain runs *perpendicular* to the nominal axis | **34.7% / 35.8%** of the world | **0.0%** |
| effectively isotropic — a cone | **28.8% / 31.2%** | **0.0%** |
| strike turns | **23.0 / 48.5 deg per km** | 3.9 / 6.1 |

The aspect was `(a + b·e)(c + d·e)` for a noise field `e`, and that expression
sweeps *through* 1.0. Which third of the world you got — ridge, cone, or ridge
rotated ninety degrees — was decided by a noise field nobody was reading as a
switch. And a four-kilometre range rotated through most of two right angles
along its own length, so no belt could run anywhere even where the aspect
happened to favour it.

`strikeFrame` returns `sqrt(aspect)` on **both** axes, so `kU · kV` is the
aspect by construction and **cannot invert**. Plus the conjugate set §4.3 asks
for, at 62° off the strike and ~0.6 amplitude, max-combined into the primary: a
range built from one direction is corduroy, and the cols are where two grains
meet.

### §4.4 — the last open quarter (`ab1aae0`)

`smax(a, b, k)`, a softplus smooth maximum in **metres of height difference**, at
the two hard maxima: `_mesa`'s rim (`h = y > cut ? y : cut`, k = 1.2 m) and
`_bench`'s scarp (k = 0.8 m). `Math.max` of two surfaces is C0 but not C1, the
mesh draws the derivative jump as a **line**, and GTAO amplifies it because it
reconstructs normals from depth and sees raw triangles. The rim comes out
weathered rather than knife-cut, which is what a rim that has stood for an age
looks like.

---

## Not yet verified — read this before trusting the above

- **`pnpm run check` has not completed since the terrain reshaped.** A run was
  started after `f28cd89` and was still going under seven-lane contention. The
  gates most at risk are `horizoncheck` (the far field moved; its worst MCC was
  already 0.766 against a 0.85-or-1%-disagreement gate), `roadcheck` (roads are
  carved after the incision) and `driftcheck`. **Run it and read it.**
- **§4.2 has not been shown to change a graded corpus shot.** `imgdiff` on
  `zone_ostium_gorge` before/after gave **1.638 mean against a measured 2.00
  floor** — below its own noise. `zone_three_valleys` gave 2.492 against a 0.74
  floor, but the heat map puts almost all of it in the **clouds and the hazed
  horizon band**, not on the ground. The corpus's graded shots frame flat
  foreground or heavily hazed distance; the channels are there and are visible in
  a purpose-framed capture (`tmp/shots/cuts-r1/`), but **do not claim they
  improve a corpus frame until an `imgdiff` says so above that shot's own floor.**
- **§4.3 has been captured but not A/B'd against its own before-state.**
  `tmp/shots/strike-r1/` is the after. It reads as a connected arête rather than
  separate cones in `vista_noon`, which is the intended change; that is an eye
  judgement, not a measurement.
- No blind `compare.mts` round has seen any of this.

## Two live leads, reported rather than chased

- **Floating boulders are real and reproducible**, mid-ground in `zone_longwythe`
  at roughly 300-600 m — past `ContactShadowPass`'s 55 m gate, so nothing hides
  them. `node src/tools/crop.mts tmp/shots/float-png/zone_longwythe.png out.png
  800 340 500 180 3`. Handed to the **method** lane as a known-bad for
  `proudOf`/`floatcheck` to calibrate against.
- **I nearly misdiagnosed the banding on those hillsides as the `Layers.ts`
  recipe-3 "wood grain".** It is not: that was fixed, the fix is documented in
  the recipe's own comments, and `LANDMINES.md`'s entry for it is **stale and
  should be deleted** on the next pass. Two agents in a row previously diagnosed
  the same banding as the shader's strata and were both wrong. Whatever the
  broad pale swirls on the Longwythe slopes are, they are none of those three,
  and the next person should **ablate before re-tinting**.

## Files owned and touched

`src/world/terrain/{Field,FieldBake,FieldCodec}.ts`, `src/world/Terrain.ts`,
`src/world/props/Debris.ts` (consumers only). Plus `docs/plans/2026-08-21-fable-procedural-modeling.md`
and `project/STATUS.md` as coordinator.

## The exact next step

Run `pnpm run check` on a settled tree and read all twelve rows, then A/B §4.3
against `2437bc0` with `imgdiff --heat` on `vista_noon` and `zone_longwythe`.
If `horizoncheck` regressed, the far field's conjugate amplitude (0.62) is the
first knob, not the strike frequency.
