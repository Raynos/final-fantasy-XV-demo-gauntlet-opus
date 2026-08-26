# Clouds, round 2 — the sky that "casts no light"

Owner: the clouds-r2 lane. Predecessor: `project/handoff/clouds.md` (do not
overwrite it — it is the record of the round that fixed the *size* defect, and
all five of its commits are merged). Colour model: `project/handoff/atmosphere.md`,
still correct.

**The defect this lane was created for has one carrier and it is not the one the
verdict names.** Round 11's judge called the sky "a particle system, not
weather ... discrete white puffs, near-identical in size and opacity,
distributed at even spacing ... they cast no light, they do not tint on their
sun-facing side, they do not shadow the ground, and they do not thin toward the
horizon", in seven of twelve panels. Four separable claims. **Two were false,
measured. One was real and had a cause nobody had looked at. One was real and
was a symptom of the same cause.**

---

## The four claims, each measured

### 1. "near-identical in size" — FALSE

The coverage field's blob-size distribution, labelled off the 512² weather map
with the shader's own `cloudWeather` maths (`smoothstep(covLo, covHi, w.r) *
(0.48 + 0.98 * w.b)`, then `* uCloudCoverage`):

| covLo/covHi | p10 | p25 | p50 | p75 | p90 | max | p90/p10 |
|---|---|---|---|---|---|---|---|
| 0.54 / 1.02 *(as judged)* | 222 | 341 | 561 | 1143 | 1939 | 3516 | **8.7x** |
| 0.42 / 0.92 *(shipped)* | 168 | 314 | 856 | 1487 | 3041 | 5867 | **18.1x** |

p90/p10 = 8.7x as judged, p75/p25 = 3.3x. On the rendered frame, connected components
of the cloud mask (an ablated `?post=noclouds` frame supplies the mask) span
p90/p10 of **6.1x** (`vista_noon`), **8.2x** (`zone_three_valleys`) and
**12.8x** (`zone_longwythe`). That is a broad heavy-tailed size field, not a
unimodal one. **Do not add octaves to the coverage map.**

Peak *coverage* per blob spans only 1.85x, which is the half of the claim that
is true — and it is not a size problem, see §3.

**What was true, and is fixed, is that the median cloud was too small.** 561 m
against FFXV's 1.2–2.4 km, with the *spread* already right. That is what a
threshold does to a smooth field: cut a near-Gaussian fbm high enough and the
surviving islands are much smaller than its wavelength, roundish because the
level set of a smooth field is, and similar to each other because they are all
cut at the same height. `covLo` 0.54 was that height; at 0.42 the median goes
to 856 m, the top decile to 3.0 km, and neighbouring islands merge into banks.
`coverage` 0.34 → 0.30 pays for the area.

### 2. "distributed at even spacing" — FALSE

Clark–Evans R, toroidal, over blob centroids in field space, with three anchors
regenerated in the same run and scored by the same estimator:

| | R |
|---|---|
| poisson anchor | 1.066 *(true 1.00)* |
| lattice anchor | 1.727 *(true > 1)* |
| matérn anchor | 0.228 *(true << 1)* |
| **cloud blobs** | **0.951** |

R < 1 is *clustered*. "Evenly spaced" is R > 1 and the lattice anchor shows what
that looks like on this estimator. Repeated in screen space over rendered blob
centroids, against a poisson anchor on the same bounding box (edges unbuffered,
so the anchor reads high): clouds/poisson = 0.99, 0.87, 0.63 on the three shots.
**Nothing in the field is dispersed.** "Delete the even scatter" has nothing to
delete.

### 3. "cast no light / do not tint on their sun-facing side" — REAL, and this is the whole defect

Ablated, not guessed:

- **`?post=nocloudamb` — the sun arm alone — renders a properly modelled
  cumulus.** Blazing sunlit crown, warm-grey shadowed flank, real lobes, real
  depth. `tmp/c-cl2-sunonly.png`.
- **`?post=nocloudsun` — the ambient arm alone — is a near-flat mass.**
  `tmp/c-cl2-ambonly.png`.
- **The two together print the cotton ball.** `tmp/c-base-noon.png`.

So the sun march, the powder term, the silver lining, the 3-octave multiple
scattering and yesterday's density fix were all working. A **sky fill four times
sky radiance, with no lateral occlusion at all**, was pouring into the shadow
side and cancelling every one of them.

`cloudSkyOcclusion` marches **straight up and nowhere else**. It knows whether a
sample has cloud above it and nothing about whether it has cloud beside it, so
the sun-shadowed flank of a fair-weather cumulus — which has open sky overhead —
took the full `uAmbientBoost`. The 4.0 is not wrong in itself: it is the π that
turns sky *radiance* into the *irradiance* falling on a cloud element, and it is
what the atmosphere lane raised to make our cumulus blue-white. What was missing
is that a cloud element metres inside the body does not see the sky at all.

`uAmbBury` (new) extinguishes the fill by `exp(-uAmbBury * e)`, where `e` is the
cell's normalised fill — 0 at the silhouette edge, 1 in the core — which
`cloudDensity` already computes as its distance-to-surface proxy and returns as
`e * uCloudDensity`. One divide and one exp. The rim keeps its blue; the core
stops being lit by a sky it cannot see. **`?post=noambbury` restores the flood**,
so both states capture from one build.

### 4. "do not thin toward the horizon" — REAL, and it was a symptom of §3

Measured before the fix, mean luma of cloud pixels by row band, from the top of
frame down to the horizon, against the sky behind them (`--raw`,
`zone_three_valleys`):

| band | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| cloud L | 224 | 214 | 218 | 212 | 207 | 217 | 224 |
| sky L | 74 | 82 | 94 | 106 | 121 | 136 | 144 |

Dead flat. **But the term was already there** — `uCloudHaze` mixes the cloud's
colour toward the sky radiance in the view direction, which is the correct
model. It was set so weak that 20 km of air blended only 44%, and a cloud
sitting three stops over white swallowed that whole. 43–47% of every cloud
pixel was **clipping in the raw scene buffer**, before the tonemap ran.

`cloudHaze` 0.0000290 → 0.000085 (20 km now 82%, 40 km 97%). Cloud-vs-sky
contrast on `zone_three_valleys`, top band → horizon band: **144 → 71** becomes
**110 → 36**.

### And one the judge got wrong that nobody has checked before

**"they do not shadow the ground" is FALSE.** `?post=nocloudshadow` against the
same `--raw` frame:

| shot | mean Δ/255 | pixels > 8/255 | measured floor |
|---|---|---|---|
| `vista_noon` | **15.065** | 33.9% | 0.39 |
| `zone_longwythe` | 1.608 | 4.6% | 0.96 |
| `zone_three_valleys` | 0.301 | 1.2% | 0.74 |

The ground shadow is in the frame and on `vista_noon` it is a third of it. What
is arguable is that the shadow *field* does not correspond to the clouds you can
see overhead — `shadowScale` maps 9.45 km of cloud field onto a 2.7 km ground
tile, so the patches are ~640 m where the clouds are 2.25 km. That is
`clouds.md`'s open item 2 and it is still open.

---

## What landed

| commit | what |
|---|---|
| `cf601ca` | `uAmbBury`, `baseSag` 0.10 → 0.28 (+ the march slab widened to match), `cloudHaze` 0.0000290 → 0.000085 |
| `06eed03` | `uCloudMaxRad` 3.2 → 9.5, and this handoff |
| `e37601e` | `covLo`/`covHi` 0.54/1.02 → 0.42/0.92, `coverage` 0.34 → 0.30 |

`uCloudMaxRad` is a soft knee, `sunL *= m/(m+pk)`, so it bounds the peak **and**
compresses the gradient below it by `m²/(m+pk)²`. At 3.2 with the deck's lit
faces at `pk ≈ 3` that derivative is **0.27** — three quarters of the
crown-to-body gradient thrown away, and the result still over white, so the
tonemap threw away the rest. The atmosphere lane recorded *lowering* this as a
measured negative ("dull grey smoke") and that was correct on the tree as it
then was. Raising it was never tried, because until the cloud stopped clipping
there was nothing to raise it into.

`baseSag` is the per-column vertical displacement of the whole profile and the
only thing in this model that puts one cloud at a different **altitude** from
its neighbour — the judge's "three or four cloud sheets at different altitudes",
supplied by one field rather than by three more marches. At 0.10 it moved a
cloud ±270 m inside a 2700 m layer, less than the cloud's own height. **The
march's slab has to be widened by the same amount** or the raised half is
clipped off at `uCloudTop` and the variation costs coverage instead of buying
relief.

---

## Numbers

`--raw` (the scene buffer before any tonemap or grade), over cloud pixels inside
a sky mask that an ablated no-cloud frame supplies:

| | `vista_noon` | `zone_three_valleys` | `zone_longwythe` |
|---|---|---|---|
| raw clip%, before | 43.7 | 47.0 | 46.3 |
| raw clip%, after | 35.3 | 6.6 | 4.1 |
| graded cloud R-B p50, before | 0 | −11 | −3 |
| graded cloud R-B p50, after | 0 | −27 | −19 |

FFXV's cumulus are blue-white: `duscae-plains-lake-01` samples them at R-B −45
over a sky of `#5ea0c9`.

`imagestats` medians over the three daylight shots, delta from the 53-plate
`FFXV` corpus:

| | baseline | `cf601ca` | `+06eed03` | shipped | FFXV |
|---|---|---|---|---|---|
| `R-B` | −7.6 | −11.4 | −10.2 | −7.2 | −10.0 |
| `hi(R-B)` | −15.1 | −20.4 | −17.0 | **−5.7** | −19.8 |
| `hi230%` | 4.50 | 0.73 | 2.66 | 2.76 | 2.92 |
| `p99.9` | 251.0 | 226.6 | 248.2 | 247.9 | 252.5 |
| `stops` | 9.52 | 9.07 | 9.49 | 9.47 | 10.08 |

Over all **twelve** review shots rather than the three daylight ones, the grade
signature barely moves at all — which is the point: this is a change to cloud
*form*, not to the grade.

| median, n=12 | baseline | shipped | FFXV |
|---|---|---|---|
| `R-B` | −12.1 | −12.0 | −10.0 |
| `hi(R-B)` | −6.1 | −5.1 | −19.8 |
| `hi230%` | 11.32 | **8.53** | 2.92 |
| `clip%` | 1.66 | 2.31 | 0.73 |
| `stops` | 10.11 | 10.21 | 10.08 |

**`hi(R-B)` is the one number that ends up worse, and it is one shot.**
`zone_longwythe` and `zone_three_valleys` are unmoved (−0.3 and −22.3);
`vista_noon` goes −17.0 → −5.7 because its bright quartile is now almost
entirely cloud and **7.7% of it clips**, so the grade's warm `highTint` is
painting hue that the tonemap's shoulder invented. That is an exposure
question, not a colour one, and it is the top of the next lane's list.

---

## Measured negatives, first class

1. **"Fewer, varied" by raising the threshold makes them fewer and *thinner*.**
   The obvious reading of the judge's own recommendation. `coverage` 0.34 →
   0.52 with `covLo` 0.54 → 0.66 empties the mid columns and takes the skirt
   off the survivors: the field goes sparse and weak and the frame is clearly
   worse than what it replaced. `tmp/shots/cl2-H/zone_three_valleys.jpg`.
   Lowering the threshold is what merges islands into banks.
2. **Cutting `uAmbientBoost` restores the modelling and costs the colour.**
   4.00 → 1.60 gives back the lobes and the shadowed flank — it was the
   experiment that isolated the ambient as the flattener — but the shadow side
   comes out warm-grey rather than blue, because the blue *is* the ambient.
   `tmp/c-B.png`. Occluding the fill gets both; cutting it does not.
3. **Cutting `uCloudSunGain` barely moves the clipping.** 0.26 → 0.155, a 40%
   cut, took raw cloud clip% from 43.7 to only 35.4 on `vista_noon`, because
   `uCloudMaxRad`'s knee was pinning the output near its own asymptote. A lever
   whose response is that sublinear is the wrong lever; the knee was.
   `tmp/c-A-noon.png`.
4. **The judge's "they do not shadow the ground" is false** — see the table
   above. Worth restating because it is the kind of claim that gets fixed by
   adding a second shadow system to a working one.

## Open, in the order I would take them

1. **`vista_noon` clips 7.7% of its bright quartile and its `hi(R-B)` is
   −5.7 against a reference −19.8.** Every other daylight shot is fine. It is
   an auto-exposure interaction: that frame is mountain-dominated and dark, so
   exposure lifts and the sky goes with it. Do not chase it with the cloud
   colour.
2. **`daycycle_dawn`'s clouds now read magenta** where the baseline's read
   orange-red. Burying the ambient removes the blue that was desaturating them
   at low sun, and at dawn the sun tint is extreme. Checked at dusk (fine, both
   `vista_dusk` and `daycycle_dusk` are the best frames in the set); dawn is
   the one hour where the trade shows. `tmp/shots/cl2-r4/daycycle_dawn.jpg`
   against `tmp/shots/cl2-base/daycycle_dawn.jpg`.
3. **`zone_fallgrove` still reads as an even scatter.** It is the shot whose
   camera looks along the layer at the shallowest angle, so it sees the whole
   deck edge-on and every cloud at a similar range. A second, higher, thinner
   sheet — the judge's actual recommendation — would be the fix, and it is a
   second march, not a tuning change.
4. **Everything `clouds.md` left open is still open**, in particular why TAA is
   not accumulating the cloud buffer (its item 1, and still the largest free
   win in this lane) and the ground shadow patch size (its item 2).
5. Only the `clear` preset was retuned. `overcast`, `storm` and `fog` carry
   their own `covLo`/`covHi`/`coverage`/`cloudHaze` and were checked by eye
   (`vista_overcast` keeps its ribbed lid, `storm` its silhouette, `vista_fog`
   is now a dramatic broken deck) but **not** retuned.

## Instruments added

| token | what |
|---|---|
| `noambbury` | `uAmbBury = 0` — the unoccluded sky flood that printed the cotton ball |

Scratch probes, in `tmp/` and disposable (they are here so the numbers above can
be re-derived, not because they are worth keeping):
`tmp/cl2-fieldstat.mts` (blob sizes + Clark–Evans on the weather map, with
anchors), `tmp/cl2-maskstat.mts` (the same on a rendered frame),
`tmp/cl2-cloudval.mts` (cloud value distribution by row band, sky-masked),
`tmp/cl2-crop.mts`.

## Gates

**16/16**, re-run clean. `pnpm run check` first reported 15/16 with `uxcheck`
failing on `page.evaluate: Target page, context or browser has been closed` —
`cleanup.mts` then printed *"stale registry for a dead daemon (pid 7991);
cleared"* and the standalone re-run is **93/93**. That is the landmine, exactly
as written: a stale registry looks precisely like a code regression, and the
daemon's uptime had dropped from 1850 s to 252 s mid-run. `floatcheck`, red at
the start of this session, now passes — another lane's fix, not this one's.

`horizoncheck` is the one gate that could plausibly have moved on a cloud
change, since it classifies sky against terrain at the skyline. Run standalone:
**PASS, worst MCC 0.766**, identical to the recorded baseline.

## Perf — NOT certified, and the instrument says so itself

`perf.mts` on the six sky-heavy shots came back **`RULER_VALID: false`, VOID
RUN**, and refused to certify anything:

> The noise floor is 1.75 ms against a 5.1 ms frame (34%), so nothing in this
> frame is separable. The floor GREW during the run (0.65 → 1.75 ms) … wait
> until the other worktrees are quiet and measure again.

Three other lanes were live for the whole of this session — **99 vite processes**
at the moment of the run — and a first `pnpm run check:perf` over the full
corpus was abandoned after 33 minutes when the daemon restarted underneath it
and dropped its exclusive lease. **So there is no perf number for this lane and
the next agent has to take one.** Do not read the void run's two flagged rows
(`zone_vannath` +1.80 ms, `vista_overcast` +2.30 ms) as a regression: the tool
prints them and then says in the same breath that nothing in the run is
separable.

What *is* deterministic and can be quoted: **draw calls are unchanged**, because
this whole change is fragment work inside a pass that already existed. Across
the twelve review shots, 532–785 against a cap of 800 — the same range as the
recorded 532–743, with `storm` at 785 the only shot near it and `storm` was
already the outlier.

**Where the honest risk is**, for whoever takes the ruler: the march slab is now
wider by `uBaseSag * (uCloudTop - uCloudBottom)` at both ends, which is ±756 m
on `clear` and ±1180 m on `storm`, so rays that used to miss the layer now enter
it and take an empty-space-skip pass. And `covLo` 0.54 → 0.42 puts cloud in more
columns. Both are real fill costs and neither has been measured.

## Shots

Five capture rounds, every frame read.

- `tmp/shots/cl2-base/` — the twelve review shots as round 11's judge saw them.
- `tmp/shots/cl2-r1/` — after the ambient burial alone.
- `tmp/shots/cl2-r2/` — after the horizon haze and the altitude sag.
- `tmp/shots/cl2-r3/` — after the radiance knee.
- `tmp/shots/cl2-r4/` — **the shipped state**, all twelve.
- `tmp/c-base-noon.png` / `tmp/c-C.png` / `tmp/c-final.png` — the same
  `vista_noon` sky crop at 2x, before, after the burial, and shipped. The first
  is the cotton ball.
- `tmp/c-cl2-sunonly.png` / `tmp/c-cl2-ambonly.png` — the ablation that found
  it. Look at these two side by side before touching this system.
- `tmp/shots/cl2-H/` — the measured negative: fewer *thinner* clouds.

## Files touched

`src/world/sky/Clouds.ts`, `src/world/Sky.ts`. Nothing else. Nothing in
`src/world/terrain/`, `src/world/props/`, `src/world/town/` or
`src/characters/`.

## One thing I would change if I were carrying this further

`uAmbBury` keys on the *normalised* fill `e`, so a preset with a different
`uCloudDensity` buries the same amount of sky light at the same normalised
depth, which is not right — a denser cloud should bury more. Keying on `d`
directly with `k = uAmbBury / 0.021` reproduces `clear` exactly and makes the
heavy presets scale correctly. It was not done because `overcast` and `storm`
run `uAmbientBoost` at 0.30 and the term barely reaches them, so it would have
been an unmeasurable change to a working system.
