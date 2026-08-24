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

| equivalent diameter, m | p10 | p25 | p50 | p75 | p90 | max |
|---|---|---|---|---|---|---|
| clear preset, 62 blobs | 222 | 341 | 561 | 1143 | 1939 | 3516 |

p90/p10 = **8.7x**, p75/p25 = 3.3x. On the rendered frame, connected components
of the cloud mask (an ablated `?post=noclouds` frame supplies the mask) span
p90/p10 of **6.1x** (`vista_noon`), **8.2x** (`zone_three_valleys`) and
**12.8x** (`zone_longwythe`). That is a broad heavy-tailed size field, not a
unimodal one. **Do not add octaves to the coverage map.**

Peak *coverage* per blob spans only 1.85x, which is the half of the claim that
is true — and it is not a size problem, see §3.

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

| | baseline | shipped | FFXV |
|---|---|---|---|
| `R-B` | −7.6 | −10.5 | −10.0 |
| `hi(R-B)` | −15.1 | −18.0 | −19.8 |
| `hi230%` | 4.50 | 1.80 | 2.92 |
| `p99.9` | 251.0 | 242.4 | 252.5 |
| `stops` | 9.52 | 9.41 | 10.08 |

---

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

## Files touched

`src/world/sky/Clouds.ts`, `src/world/Sky.ts`. Nothing else.
