# Lane 4 — Clouds (2026-08-30 overnight build)

Plan items 15 (organisation), 16 (crisp sunlit top edge), 17 (internal dynamic
range) of `docs/plans/2026-08-30-fable-to-nine.md`.

Owns `src/world/Sky.ts`, `src/world/sky/Clouds.ts`,
`src/world/sky/CloudTextures.ts`, `src/shaders/clouds.glsl.ts` and the cloud
block of `src/shaders/sky.glsl.ts`. Added `src/tools/cloudstat.mts`.

## The instrument — read this before trusting any number below

`node src/tools/cloudstat.mts tmp/shots/<dir>` — one row per shot, over a
**checked-in per-shot ROI** (`ROIS` in the tool). Change a box and every number
here is void.

| column | what | want |
|---|---|---|
| `bStops` | linear Y p99/p1 over cloud pixels, pooled | context |
| **`cStops`** | the same p95/p5 range taken **within one connected cloud**, median over components ≥ 2000 px | **≥ 2.0** — task 17 |
| `clip%` | cloud pixels with any channel ≥ 254 | ≤ 2× reference |
| `ramp` / `rampT` | median 10–90 % sky→body crossing width in px; `rampT` top edges only | small — task 16 |
| `cells` / `aVar` / `aniso` | component count, log2 area p85/p15, horizontal run p75 ÷ vertical run p75 | task 15 |

`cStops` is the column that answers the judge. Pooled `bStops` is not: it mixes
a near cloud with a hazed-out distant one, so it moves with aerial perspective
rather than with the lighting march.

**The mask is an Otsu split on SATURATION, not on luminance**, and that is
load-bearing — see "the instrument was wrong first" below.

**`aniso` is a relative number, not an absolute one.** Vertical runs that reach
the bottom of a wide, shallow ROI are dropped as truncated, which shortens the
vertical distribution — so the absolute value is inflated, and `vista_noon`'s
292 px box inflates it more than the 200 px boxes. Compare arms, never shots.

## Baseline — `7da60d5`, `tmp/shots/l4-base`

Recomputed under the saturation classifier — **these are the numbers to compare
against**, and any figure written down before `0a6d4b9` was luminance-classified
and is void:

```
shot                  cov%  stops bStops cStops  bP50  clip% ramp rampT cells  aVar aniso
vista_noon            36.5   4.62   2.04   1.71   217  12.35    9     8    10 10.00  3.50
zone_vannath          55.0   3.55   2.01   1.48   203   0.41    6     6    19  8.76  1.89
zone_three_valleys    46.5   3.83   2.29   1.41   202   0.33    7     7    22  6.88  1.37
vista_dusk            45.6   4.65   2.81   1.66   170  29.02    6     6    35  5.49  1.50
zone_longwythe        60.8   5.25   3.43   2.02   206   0.20    6     6    18  5.65  1.47
zone_lestallum        47.6   4.39   2.21   1.68   203   0.43    6     6    18  8.93  1.64
```

`cStops` 1.41–2.02, median 1.67, against a done-when of 2.0. `vista_dusk` puts
29 % of its cloud body at display white; `vista_noon` 12.4 %.

**Verified by eye** (`tmp/l4/base-vista_noon-sky.png`, top 440 rows at 1:1):
the noon deck is four or five cotton-wool masses of one value, no crown-to-base
shading anywhere, edges that dissolve over ~10 px, and no direction in the
field. `zone_vannath` is better organised — a real band of cumulus with a few
grey undersides — but the puffs repeat at one size.

**The finding that reframes task 17:** the cloud body is *clipping*.
`vista_noon` puts 12.4 % of its cloud pixels at ≥ 254 on some channel and
`vista_dusk` 29 %, with body medians at 202–217 of 255. The upper half of the
deck is pinned at display white, which is where the crown-to-base gradient
went. This is **not** an argument for lowering exposure (a standing negative);
it is an argument for lowering the cloud's own radiance while keeping the knee
open.

## Task 17 — swept, landed, `cStops` 1.49 → 1.95

`vista_noon`, one build, `?post=set:`, saturation-classified:

| arm | cov% | bStops | cStops | bP50 | clip% |
|---|---|---|---|---|---|
| base (`222438d`) | 29.0 | 1.92 | **1.49** | 229 | 19.20 |
| `uCloudSunGain` 0.26→0.16 | 28.5 | 1.91 | **1.59** | 216 | 9.62 |
| + `uCloudMS` 0.62→0.34 | 28.3 | 2.23 | **1.90** | 209 | 7.80 |
| + `uAmbientBoost` 4.0→2.8 | 28.2 | 2.39 | **1.95** | 208 | 6.63 |
| + `uCloudMaxRad` 9.5→6.5 | 28.1 | 2.37 | **1.92** | 206 | 4.57 |
| `uCloudSunGain` 0.16 + `uCloudMaxRad` 24 | 28.7 | 1.93 | **1.66** | 218 | 13.00 |

Landed as the fourth row (`0a6d4b9`). `uCloudMS` is two thirds of the gain and
had never been touched: it is the diffusion floor, and at the tau ≈ 20 of a
cumulus's own body it returns 0.079 against the three-octave sum's 1e-9, so it
**is** the shaded half and therefore the denominator of the whole ratio. Preset
lerped `lerp(0.34, 0.62, overcast)` — the floor is an *overcast* fact (a midday
overcast base is pale grey, not black) and a fair-weather cumulus does not want
it.

**`uCloudMaxRad` is a measured negative**, both directions: 24 buys 0.07 stops
and 3 points of clipping because it lifts a crown already at the display
ceiling; 6.5 halves clipping again but adds nothing to `cStops`. What binds is
the display, not the knee. Left at 9.5.

**Verified by eye**, same 900×320 box on both arms
(`tmp/l4/s1-noon-same.png` vs `tmp/l4/g16msa-noon.png`): the base is two flat
white cotton balls; the swept arm has a lit crown, a shaded left flank and
lobes that read as separate masses — and it is still white, not grey.

### The instrument was wrong first, and this is the shape of that error

`cloudstat.mts` originally classified cloud by **luminance**. Every task-17
lever darkens the shadow side, which pushes exactly the pixels under test out
of the class: `uCloudMS` 0.34 read as the mask going 27.0 % → 24.5 % of the box
and `cStops` 1.39 → 1.29 — the classifier reporting on itself, and the arm that
visibly worked reading as a regression. **A whole sweep was misread this way.**
The split is on saturation now (sky is deeply blue whatever the exposure, cloud
is near neutral lit or shaded), and the pre-fix numbers below are struck
through wherever they appear.

## Task 16 — swept, landed, `uCloudTap` 0.90 → 0.50

`vista_noon`, one build, `?post=set:ucloudtap:`; `edgestat` on the plan's own
`620,40,340,220` box:

| `uCloudTap` | `rampT` | `edgestat` hard% | p90 | speck |
|---|---|---|---|---|
| 0.90 (was) | 8 px | 0.0 | 16.4 | 0.00 |
| **0.50 (landed)** | **6 px** | 0.2 | 20.6 | 0.00 |
| 0.00 | 5 px | 1.4 | 25.4 | 0.10 |

A march texel is 2.22 screen px at `MARCH_SCALE` 0.45, so a 3×3 Gaussian of
radius 0.90 march texels smears every silhouette over ≈ 4 px of an 8 px
crossing before the density field gets a say.

**Verified by eye at 4× on one crown** — `tmp/l4/edge-r2.png` (0.90) against
`edge-tap05.png` and `edge-tap0.png`: 0.90 is an airbrushed gradient with no
rim structure; 0.50 is a ragged cauliflower boundary with no visible half-res
staircase; 0.00 carries more micro-wisp and pays a faint texel step for it.
0.50 is the point with the bite and without the step. **If a judged round still
says defocused, 0.00 is the next stop and its cost is that texel step.**

`uCloudDetailAmt` 0.62 → 0.85 is the **measured negative**: `rampT` 8 → 7,
bought by taking the cloud mask 35.7 % → 31.6 % of the sky box. It sharpens by
eroding the deck away.

The r2 backlog's "`uCloudTap` is not the lever" was measured against a 15–20 px
sky-to-body crossing; this instrument reproduces 8 px, and at 8 px half of it
is the filter. Recorded as a correction, not a contradiction — the old
measurement was of a different quantity.

## What landed

| commit | what |
|---|---|
| `8a4c6f7` | `src/tools/cloudstat.mts`; `_ablateWeather` re-asserted at the end of `_applyTimeOfDay`; `?post=set:<uniform>:<value>` sweep hook |
| `222438d` | task 15a — `value2a`/`valueFbm2a` (per-axis tileable period), streak channel 15:5→21:6 and ±22 %→±42 % |
| `aca679a` | task 15b — two-scale coverage (9 and 20 cells) selected by a 3-cell region field; streak amplitude moderated to ±31 % after it was measured to cost a fifth of the deck |
| `0a6d4b9` | task 17 — `uCloudSunGain` 0.26→0.16, `uCloudMS` 0.62→`lerp(0.34, 0.62, overcast)`, `uAmbientBoost` 4.00→2.80; `cloudstat` classifier moved to saturation |
| `7ca989c` | task 16 — `uCloudTap` 0.90 → 0.50 |

`8a4c6f7` also fixes a real bug: `?post=nocloudsun` and `?post=nocloudamb`
were being undone by `_applyTimeOfDay`, which rewrites both uniforms and is
called *after* `_pushWeatherUniforms` on a weather change. Any earlier
measurement taken through those two tokens is suspect.

`222438d` fixes the landmine the brief flagged: the streak channel passed
`fy * 5.0` against a scalar period of 15, so the coverage map's only
anisotropic term carried a hard seam every 27 km.

## Where the corpus ended up

`tmp/shots/l4-final`, current HEAD. **Read the caveat first:** the baseline is
`7da60d5` and eight lanes have landed since, so this table is a *corpus* diff
across a span and LANDMINES.md:709/1847 apply to it — the only clean
attribution in this lane is `l4-p15b` → `l4-p17` (adjacent commits, both mine),
recorded above.

```
shot                  cov%  stops bStops cStops  bP50  clip% ramp rampT cells  aVar aniso
vista_noon            35.2   4.10   2.87   1.53   191   3.73    7     6    10  7.35  3.16
zone_vannath          35.7   3.72   2.46   1.74   179   0.00    5     5    49  5.77  1.39
zone_three_valleys    34.0   4.15   2.62   1.78   179   0.00    5     6    24  6.71  1.46
vista_dusk            67.1   5.75   5.22   3.19   124  11.06    5     5    14  5.31  2.29
zone_longwythe        34.1   4.50   3.34   1.06   172   0.00    4     5    51  4.98  1.11
zone_lestallum        34.0   4.63   2.86   1.78   189   0.08    5     5    31  4.52  2.45
storm                 94.5   2.87   1.32   0.84    86   0.00    2     2     1  0.00 17.63
vista_fog             16.3   5.11   2.97   2.05   210  26.11   11     0     5  7.15 13.67
vista_overcast        57.4   3.78   2.45   0.94   129   0.13    0     0    10  9.08  1.00
```

The last three rows are **invalid and kept only to say so**. The saturation
split needs a bimodal ROI, which blue sky with white cloud in it is and an
overcast slab, a storm or a fog bank is not: there Otsu lands on noise. `storm`
reads `cov` 5.4 % at `7da60d5` and 94.5 % at HEAD on two frames that look the
same class of frame. The heavy presets were judged by eye instead, and both are
healthy — see below. The tool now says this in its own header.

Against the six baseline rows: `bStops` up on five of six (2.04→2.87,
2.01→2.46, 2.29→2.62, 2.81→5.22, 2.21→2.86; `zone_longwythe` 3.43→3.34),
`cStops` up on four of six, `clip%` down on all six (12.35→3.73, 29.02→11.06,
and the four already-clean shots to ≈ 0), `rampT` down on all six.

**`cStops` has a population confound and should be read beside `bStops`, not
alone.** It is a median over components ≥ 2000 px, and task 15b deliberately
made more, smaller components (`cells` 10→51 on `zone_longwythe`), which moves
the median onto smaller clouds that have less internal range by geometry.
`zone_longwythe` 2.02→1.06 is mostly that. `bStops`, pooled over the mask, does
not have the confound.

**Verified by eye:**
- `vista_noon` (`tmp/l4/r2-noon.png` against `tmp/l4/s1-noon-same.png`) — the
  two cotton balls now have lit crowns, shaded left flanks and lobes that read
  as separate masses. Still white, not grey.
- `vista_dusk` (`tmp/l4/f-dusk.png` against `tmp/l4/b-dusk.png`) — the biggest
  single change in the lane: the baseline is a blown-out white tatter, the new
  frame is a silver-lined backlit bank with a warm rim and blue-grey mass.
- `zone_vannath` (`tmp/l4/r2-vannath.png`) — visibly unequal cell sizes, shaded
  undersides, directional banks upper-left and right.
- `storm` (`tmp/l4/f-storm.png`) and `vista_overcast` (`tmp/l4/f-overcast.png`)
  — neither preset lost its silhouette and neither went black-based: storm is
  blue-grey rain with a readable ridge, overcast a grey deck with relief and a
  bright break at the right.

## One more measured near-null

`uBaseShade` (clear preset, 0.78) is the sky-occlusion term that sculpts the
underside, and it looks like a pure ratio lever because it darkens the base and
leaves the crown alone. At 0.92 it moves `bStops` 2.87 → 2.98 on `vista_noon`
and 2.46 → 2.48 on `zone_vannath`, with `cStops` and `bP50` unchanged. Two
captures of the same shot differ by ~1.5/255 (`src/tools/README.md`), so this
is at the edge of the floor. Not landed. `tmp/shots/l4-sh92`.

## The defect this lane did NOT cause and did not fix

**Horizontal comb teeth on mid-distance cloud**, plainly visible in
`tmp/l4/f-dusk.png` (left half) and `tmp/l4/f-lw.png`. **It is pre-existing** —
`tmp/l4/b-dusk.png` at `7da60d5` carries it as badly or worse — but task 15b's
small-cell coverage arm (20 cells, 1.35 km) sits closer to the march's skip
resolution than the old single 12-cell arm did, so it is worth re-checking
after any further coverage work.

The mechanism is the one already written at `Clouds.ts:186-215`: the
empty-space probe advances `coarse = 2 * fine` and `fine = clamp(t*0.017, 30,
440)`, so at range the skip window is 880 m against shape-volume features of
100–260 m. The fine cap of 440 is what binds. Lowering it costs fill, and no
honest perf number can be taken on a trunk with eight lanes capturing, so this
is filed rather than attempted.

## Not done / next step

- **`uCloudTap` 0.00** is measured and better on `rampT` (5 px vs 6) and on
  `edgestat` hard (1.4 % vs 0.2 %) at the cost of a faint half-res texel step
  visible at 4×. If a judged round still says defocused, that is the next stop
  and the trade is known.
- **`aVar` needs replacing before it can be a target** — see open questions.
- **`cloudstat.mts` needs a chroma-independent mask** before it can grade the
  heavy presets at all. `tmp/shots/l4-wbase` holds `storm`/`vista_overcast`/
  `vista_fog` at `7da60d5` for whoever builds it.
- **No perf number was taken, deliberately.** The tree had a queue depth of
  7–8 from other lanes for this lane's whole run, and `contention()` cannot see
  a co-agent (LANDMINES.md:1081). Nothing here changes a loop count, a texture
  fetch count or a resolution: the four landed changes are three uniform values,
  one uniform value on the upsample's *radius* (the 3×3 tap count is unchanged),
  and a weather-map bake that is boot-time only.

## Gates

`pre-commit` (vite build + both typechecks + 4 cheap gates, concurrent) passed
on **all six** of this lane's commits — that is the standing evidence.

`pnpm run check` was started and **did not return inside the lane's window**:
the shared daemon sat at queue depth 7–9 for the whole run and there were 14
concurrent `check.mts` processes from other lanes at the stop. It needs
re-running on a quiet tree.

`node src/tools/probes/nanscan.mts` does not run that way either — it is a
probe *body* and needs `node src/tools/probe.mts probes/nanscan.mts`. The
plan's command line for it is wrong.

**No perf number, deliberately** — see "not done" above for why, and why the
four landed changes cannot move one.

## Cross-lane

- Lane 5+6 owns a one-line `uCloudShadowStrength` change in `Sky.ts`
  (their task 21). Not touched here; land it as its own pathspec commit.
- Any coverage change moves the ground-shadow bake (`SHADOW_FRAG`) and the env
  cube (`CLOUD_ANALYTIC`), which are lane 5's and the IBL's inputs. `222438d`
  changes coverage structure but not its mean by construction (the histogram
  stretch is refitted); nobody has measured the shadow bake after it.

## Open questions

- `aVar` is dominated by component *merging*: one 200 k-px merged mass beside
  a 200 px scrap reads as 10 stops of "variance" and means the opposite of what
  the column name suggests. It needs a watershed split, or replacing with a
  distance-transform radius distribution, before it can be a target.
