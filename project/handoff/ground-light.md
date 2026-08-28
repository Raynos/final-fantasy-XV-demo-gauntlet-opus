# ground-light — the ground, and the light that reaches it (WS-2)

Owner: the `ground-light` lane, 2026-08-28. Directories: `src/world/terrain/`,
`src/world/veg/`. Live.

Read this before re-opening anything in WS-2: **two of the four items are closed
by measurement rather than by work**, and one of them is closed against its own
plan text.

---

## The grading slice, so a before/after is reproducible

WS-2a quotes `sh(R-B) −9.2` with no shot list, and the number is a median over a
set nobody wrote down. **This is that set**, and it reproduces the figure exactly:

```
node src/tools/shoot.mts zone_longwythe zone_three_valleys zone_vannath \
  zone_fallgrove vista_noon daycycle_noon zone_mencemoor zone_taelpar \
  --out tmp/shots/GL-day0 --jpeg
node src/tools/imagestats.mts "tmp/shots/GL-day0/*.jpg" --against FFXV-field
```

Median `sh(R-B)` **−9.3** graded, **−7.4** with exposure pinned (`?post=noexp`),
against `FFXV-field`'s **+5.8**. Use `?post=noexp` for anything that touches
light: the closed loop hands back whatever you remove.

---

## 2a — CLOSED, measured negative. The row is not buyable from ground albedo.

**The claim under test:** *"deleting the entire diffuse ambient moves the row
from −4.9 to −2.3 … the whole lever is worth 2.6 points of a 15-point gap"*,
re-filed onto ground albedo because `imagestats`' docstring says the darkest
quartile is mostly ground.

**Two ablations were added to test it, and they are kept** (`62c2d2b`,
`721ebf9`) — the same shape as `VegMaterial`'s `nogcontact`/`gcmax` pair, and
for the same reason: a weak reading from an albedo edit is ambiguous between
"the edit was small" and "this is not what those pixels are".

| token | what it does | where |
|---|---|---|
| `?post=gwhite` | terrain albedo forced to 1 | `TerrainMaterial.ts` `FRAG_MAP` |
| `?post=gwarm` | terrain albedo × (1.35, 1.0, 0.62), own luma divided out | same |
| `?post=vwhite` | every plant albedo forced to 1 | `VegMaterial.ts`, after `<map_fragment>` |
| `?post=vwarm` | every plant albedo, same warm shift at constant luma | same |

Median `sh(R-B)` over the eight shots, all with `?post=noexp`:

| | median | vs control |
|---|---|---|
| control | **−7.4** | — |
| `gwhite` | −55.3 | −47.9 |
| `gwarm` | −4.9 | **+2.5** |
| `vwarm` | −4.6 | **+2.8** |
| `gwarm,vwarm` | −2.2 | **+5.2** |

`gwhite` moving 48 levels proves the lever *reaches*. And then the whole hue
half of it — **every ground pixel and every plant pixel in the frame pushed 35%
red and −38% blue at constant luma, far past anything shippable** — buys **5.2
of the 13.2 levels needed**, and takes `sat%` from 30.6 to **38.6** against a
reference of 29.5. There is no version of "author the recipes with genuinely
different values" that outruns its own positive control by a factor of three.

**Two more reasons the row is the wrong target, both cheap to re-derive.**

1. **The reference's own spread on this column is bigger than the gap.** Per
   plate, `FFXV-field`'s `sh(R-B)` runs `+10.1, −0.1, +9.0, −3.2, +39.2, −9.4,
   +2.6, +19.5, +15.5, −136.9`. Ours run `+24.2, +22.8, +0.1, −5.2, −9.5,
   −10.6, −18.7, −50.3`. Both are 50-level spreads around a 15-level
   difference of medians. `zone_fallgrove` at −9.5 is *the same number* as
   `duscae-wilderness-04`.
2. **The darkest quartile is not what the docstring assumes, and it was never
   looked at.** `tmp/gl/shadowmask.mts` paints it: in-quartile pixels keep
   their colour, everything else goes magenta.

   | shot | quartile cut | mean rgb | what it is, by eye |
   |---|---|---|---|
   | `zone_fallgrove` | 28.2 | (7.9, 16.1, 16.7) | **canopy**, near-black, with shaded floor between |
   | `zone_mencemoor` | 54.5 | (25.0, 42.4, 71.6) | shadowed mid-distance slope, steel blue |
   | `zone_vannath` | 37.9 | (21.6, 21.3, 21.8) | near-black foreground ground |
   | `zone_longwythe` | 58.8 | (54.4, 41.5, 35.1) | ground, and already **+19.4** |

   Half of it is plant, and where it is ground it is ground at luma 8–30. The
   open-country shots are already **far warmer than the reference** (+21 to
   +24 against +5.8); warming ground albedo pushes those further out while
   barely moving the wooded ones. It is not one row.

**What the column actually tracks, and this one is not ours.** `?post=noaerial`
takes the median from −7.4 to **+3.0** — the whole gap — but the mask says why
and it is not warmth: without aerial perspective the quartile *cut* collapses
(`zone_mencemoor` 62.2 → **3.0**) and the band's mean rgb becomes (0.6, 0.4,
2.4). **Our shadows are black, and blue inscatter is the only thing in them.**
`sh(R-B)` goes to zero by degeneracy. That is a real finding and it belongs to
whoever owns aerial perspective and the grade's toe — the number to beat is
`FFXV-field`'s `p0.1 = 3.4` against our **0.6**, at 11.7 stops against 9.8.

**Do not re-open 2a as an albedo item.** Written into the plan's negatives table.

---

## 2a, the part that WAS real: `LAYER_AVG` was sRGB numbers used as linear light

`14c49f3`. This is the one place the "the splat's value contrast is invisible"
complaint was true, and it is not where either document put it.

`albedoArray` is `SRGBColorSpace` with mipmaps, so the GPU decodes before it
filters and the top mip a distant pixel reads is the **mean linear albedo**.
`farCol` multiplies `uLayerAvg` straight into linear light
(`TerrainMaterial.ts:876`). Measured off `buildLayerData` at 256²:

| layer | mean linear (the far mip) | Y | old `LAYER_AVG` | Y | ratio |
|---|---|---|---|---|---|
| sand | 0.538 0.328 0.172 | 0.361 | 0.66 0.42 0.26 | 0.459 | 1.27× |
| dirt | 0.202 0.122 0.068 | 0.135 | 0.50 0.40 0.29 | 0.413 | **3.05×** |
| gravel | 0.148 0.124 0.101 | 0.127 | 0.46 0.41 0.36 | 0.417 | **3.27×** |
| rock | 0.128 0.083 0.059 | 0.091 | 0.44 0.35 0.29 | 0.365 | **4.02×** |
| grass | 0.166 0.114 0.057 | 0.121 | 0.45 0.41 0.26 | 0.408 | **3.38×** |
| road | 0.251 0.213 0.155 | 0.217 | 0.51 0.475 0.415 | 0.478 | 2.21× |

Two things fall out.

- **The recipes are not flat.** Their real linear lumas run **0.091 to 0.361, a
  3.98× spread** — sand against rock is four to one. `0.35–0.47, ±15%` is
  `LAYER_AVG`'s own span and always was. **`terrain-material.md`'s "single
  biggest remaining lever" and WS-2a's "author them with genuinely different
  values" are both aimed at a table, not at the recipes.**
- **The far LOD was painting every layer 2.2–4.0× too bright**, with the
  four-to-one spread compressed to 1.31×, over the largest region of ground in
  every establishing shot. It also reaches every plant: `Terrain.groundColorAt`
  is documented as returning linear albedo and blends `LAYER_AVG` to do it,
  bled into every tint at `GROUND_BLEED = 0.34`.

Fixed by measurement, with `tmp/gl/layerstat.mts` named in the docstring as the
thing to re-run after any recipe edit. **No recipe is touched**, so the near
field is byte-identical by construction.

Rendered: `imgdiff` `zone_longwythe` **16.366/255 over 60.8%** of pixels (floor
1.23), `zone_mencemoor` 9.069/25.0%, `zone_vannath` 8.964/33.7%,
`zone_fallgrove` 5.726/17.9%. **Looked at, and better**: Longwythe's massif and
mid-basin go from one milky tan wash to readable rock, gully and scoured pan;
Vannath's plain gains ochre pans and dark swales. `imagestats` guard held —
`meanL` 110.9 → 109.7, `sat%` 31.5 → 33.1, `clip%` 0.34 → 0.81; `sh(R-B)` moved
−9.3 → −10.0, i.e. **not at all**, which is the 2a finding restated.

**Open:** `hi(R-B)` went −9.3 → −20.1 against a reference of −13.5. It crossed
the target rather than approaching it. Worth one look by whoever next grades the
daylight slice; I judged the frame better and the column is sky-dominated.

---

## 2b — partly stale, partly measured, and one real defect found

- **`zone_fallgrove`'s ground "disagrees with itself" is STALE.** `grass.md`'s
  numbers (`groundColorAt` returns lum 0.090 / r/g 1.34 warm brown against a
  pale grey-green mat) describe the **old Ecology fallback ramp**.
  `Terrain.groundColorAt` exists now and is the shader's own far-LOD path; its
  docstring says so. There is nothing to decide. What was left of the drift was
  `LAYER_AVG`, fixed above.
- **The bush cards are measured, and the "unpinned albedo" claim needs
  re-stating.** New probe `src/tools/probes/vegalbedo.mts` prints the
  alpha-weighted mean linear luminance of every card `src/world/veg` builds:

  ```
  grassClumpTex(0)   0.5800   pinned 0.58
  leafClusterTex     0.1258 / 0.1245 / 0.1250   pinned 0.125
  fernTex()          0.1229   UNPINNED
  reedTex()          0.2203   UNPINNED
  padTex()           0.0854   UNPINNED
  ```

  The pins land exactly. The three unpinned cards span 2.6×, but **they are not
  LODs of each other** — a fern, a reed and a lily pad are three species, and
  the grass/leaf pinning rationale ("whenever this card is one LOD of something
  another ring also draws") does not apply. The defect grass.md predicted is not
  the defect that is there. **The case that *would* be the same bug is a bush's
  stand card against its own geometry ring, via `bakeCanopyCard`; that is not
  measured yet and is the honest next step.**
- **`Ecology._layoutClearings` — fixed, `26f56ca`.** See below.
- **Coverage economics and tier-D reach are NOT done.** See "What is left".

---

## The clearings leak (handed over from the landmarks lane) — FIXED

`26f56ca`. Their ablation killed WS-5's premise first: `_exclusions` is a
POI-versus-POI *placement* ban list and was never a vegetation mask.

`poiClear` returned `1 - d / r` with `r` the settlement's **catchment** radius,
so it reached 1 only at the exact centre. New probe
`src/tools/probes/padclear.mts` — 4 000 R2-sequence samples uniformly inside
each type's `PoiKits.PAD_R`, over all 124 POIs, against the same three gates in
open country:

| | mean `cleared` | grass% | scrub% | tree% |
|---|---|---|---|---|
| before, all 124 pads | 0.569 | **83.7** | **54.2** | **40.7** |
| open country | 0.000 | 88.6 | 73.7 | 48.7 |
| **after** | **1.000** | **0.0** | **0.0** | **0.0** |
| open country, after | 0.000 | 88.6 | 73.7 | 48.7 |

Open country is byte-identical, so the change is confined to the pads. Note it
was **never only grass**: scrub was at 54.2% and trees at 40.7% of pad area.
`tomb` read `cleared` 0.000 and `landmark` 0.004 because they have no `FRAC`
key and a missing key was being read as "no clearing at all" — right for
Longwythe Peak at r = 520, wrong for the 13 m tomb apron and 8 m waymark deck
that were actually built there.

The disc is now a **plateau and a skirt**: exactly 1 inside `PoiKits.PAD_R`
(imported, not copied — a copy drifts the first time a kit is retuned), linear
to 0 at `max(p.r * FRAC, PAD_R * 2.2)`, plateau clamped to 0.85 of the outer
radius so `parking` (FRAC 0.95 of a small `r`) keeps a ramp. Types with a `FRAC`
keep their authored catchment; this only ever raises a radius.

**Import-cycle note:** `Ecology → PoiKits → Rocks → Ecology`. Safe, because
`PAD_R` is a plain const read inside `_layoutClearings` at construction time —
long after module evaluation — and `Rocks` only calls `hash3` from inside
functions. If somebody moves a `hash3` call to `Rocks`' top level this breaks
with a TDZ error and nothing will point here.

Looked at: `poi_haven` reads as a built stone deck on bare ground, no blades
through the rune ring. `poi_tomb` and `poi_landmark` are both framed so far off
the pad that the change is invisible in them — that is a `Shots.ts` question,
not a vegetation one.

---

## 2c — the ramp is NOT un-rendered. It has been live for five days and it works.

**The plan is wrong about the state of this item.** `207a399` is an **ancestor
of `main`** (`git merge-base --is-ancestor 207a399 HEAD`); the fraction-of-object
ramp, its `groundContact`/`groundSpan` options and the eight call sites in
`Trees.ts` and `Bushes.ts` are all on `HEAD` and have been rendering since
2026-08-23. What had never been done is the ablation.

Paired `--raw` captures, control taken moments before each:

| shot | `nogcontact` | `gcmax` (ceiling) | floor |
|---|---|---|---|
| `zone_vannath` | **4.228** mean/255, 11.93% > 8/255 | 5.634, 21.77% | 2.00 |
| `zone_longwythe` | **3.464**, 9.90% | 3.875, 11.93% | 1.23 |
| `zone_fallgrove` | **2.838**, 8.10% | 4.394, 16.87% | 0.69 |

Every shot over its floor, and the shipped term sits at **75% of its own
positive control** on `zone_vannath` — which is what `groundContact` ≈ 0.5–0.62
against `gcmax`'s 1.0 should give. Against the metre-scale version's recorded
**0.438 mean/255 over 0.059% of pixels**, the fractional ramp is an order of
magnitude larger on both axes. **The measured negative in the plan is about the
world-metre ramp only; it does not apply to what shipped.**

Caveat, honestly: the heat map is broad rather than concentrated at trunk bases,
and a `?post=` ablation forces a cold page, so some of the 4.228 is cold-boot
noise (the floors are cold-vs-cold and it clears them 2×). Split by region on
`zone_vannath` at gain 6, the ground band's own median delta is **3.0/255** with
p90 at 8. The ordering `gcmax > nogcontact > floor` is the load-bearing part.

**2c is landed, not open.** `pnpm run check` has now been run on it.

---

## 2d — still gated, and the gate now has an answer

`gcmax` prices *all* indirect occlusion inside the ramp at **5.634 mean/255 over
21.8%** of `zone_vannath`, so in-material AO on indirect diffuse has real
headroom — but the shipped term already takes 75% of it, so the remaining
in-material-occlusion budget on **vegetation** is about 1.4/255. The place 2d is
still worth its cost is everything `patchVeg` does not touch: **terrain and
rocks carry no base occlusion at all**, and `Rocks.ts` already writes a vertex
colour from `up`/`cav` that a height-above-its-own-base factor would ride for
free (the `207a399` message says so and it is still true). That is `props/`, not
here — coordinate.

---

## Findings for other lanes

- **`zone_vannath`'s black foreground is a cloud shadow, not albedo and not
  grass.** Bottom band (`y` 0.88–0.94) median luma **13/255**, `R−B` +2. With
  `?post=nocloudshadow` it is **34** and `R−B` **+19**. `--raw --hide grass`
  says grass makes that ground *brighter*, not darker (p50 76 → 58 with grass
  removed). A cloud shadow that takes ground to 5% of white in a graded noon
  frame is worth the sky lane's attention; it is also a chunk of the `sh(R-B)`
  row.
- **`zone_mencemoor` renders as a bare corrugated massif** — parallel
  ridge-and-gully corduroy across the whole mid-ground, steel-blue in the
  gullies, and no vegetation. It is the worst shot in the corpus on `sh(R-B)`
  (−45 to −50, outside the reference's entire non-water range) and the number is
  a symptom of the geometry, not of colour. Nobody owns it.
- **`zone_longwythe`'s bare near half**: agreed with the landmarks lane, it is
  the framing. I have not raised any scatter density against that shot and
  nobody should until it is re-framed. Their two-number dolly (16 → 38 drawn,
  median on-screen height 10.7 px → 73.0 px) is the right experiment.
- **`town_forecourt` is at 686–787 draw calls against a budget of 800.** The
  clearings fix takes plants *off* pads, so it can only help.

---

## Tier-D dry cover — reach widened (small), and the ceiling priced (decisive)

`c0ec946`, `1714de9`. Two reach limiters, neither of them the one the plan looks
at, and both fixed without touching a colour:

- **The ramp started at 60 m** "handing over from the grass ring". In Leide
  there is nothing to hand over from: `bioGreen` 0.05–0.12 is the same number
  that switches the sward off *and* collapses `GrassField`'s rings, so inside
  60 m Leide had no geometry and no paint. Now `smoothstep(18, 62, vTDist)`.
- **`(1 − 0.55*w[0])` halved it on sand**, and `w[0]`'s own gain carries
  `(1 − 0.80*bioGreen)` — so sand is at *full* weight exactly where `bioGreen`
  is near zero. A rule written for a live dune was taking half the cover off the
  whole floor of Leide. Now 0.32.

**Measured, and it is small.** `reliefstat`, default ground ROI:

| `zone_longwythe` | d1 | d2 | d4 | d8 | d16 | d32 | tot |
|---|---|---|---|---|---|---|---|
| `?post=nodry` | 11.13 | 10.33 | 10.01 | 10.33 | 11.11 | 11.60 | 29.01 |
| before this change | 11.69 | 12.35 | 10.70 | 10.45 | 11.21 | 11.72 | 30.28 |
| **shipped now** | 12.10 | 14.01 | 11.44 | 10.62 | 11.27 | 11.74 | **31.50** |
| `?post=drymax` | 16.44 | **23.26** | 16.43 | 12.18 | 11.31 | 11.17 | 40.39 |
| `FFXV-ground` | 11.32 | 15.45 | 16.76 | 18.44 | 21.22 | 21.79 | 49.00 |

`imgdiff` 1.451/255 over 2.69% (floor 1.23) on `zone_longwythe`;
`zone_three_valleys` did not move at all (0.515 against a 0.74 floor — its
ground ROI is already past 62 m and is not sand-dominant), `zone_vannath` +0.57
under its floor. Zero draws, zero triangles. Kept: it is the right direction on
the worst shot in the corpus at no cost, and the 2× near-ground crop reads as
ochre pan with dark thorn flecks, not as painted noise.

**And the ceiling says stop here.** `drymax` — full cover everywhere the term
fires — buys 29.0 → 40.4 of the 20-point gap to 49.0, so the term's *entire*
remaining headroom is 8.9 and the shipped version already takes 2.5 of the 11.4.
But look at where `drymax` puts it: **d1 16.4 and d2 23.3 against a reference of
11.3 and 15.5** — 45–50% *over* — while d8/d16/d32 sit at 12.2/11.3/11.2 against
18.4/21.2/21.8. The energy is in the wrong bands. The hole is 4–30 m features at
the range the judge grades and the term's octaves are 0.74 m and 1.9 m; `cvB1`
(7 m) and `cvB2` (22 m) only modulate *amount*, they do not paint at that scale.
**Turning dry cover up further makes the ground noisier at pixel scale and does
not close the gap.** In the plan's negatives table.

## What is left, in the order I would take it

1. **Mid-scale ground structure, d8–d32.** The band above is the actual hole and
   nothing in the shader occupies it: 0.74 m and 1.9 m are gone by 300 m, 52 m
   and 165 m do not read below ~800 m, and 4–30 m — the band that carries a
   hillside at 150–400 m, i.e. the bottom third of every establishing shot — has
   an *amount* modulation and no texture. That is a bigger, better-aimed item
   than anything left in WS-2 as written.
2. **Coverage economics** (sibling-ports §3.6). `GrassField.ts:44` near ring is
   `spacing 0.27, max 240000`, `HALF_W = 0.046` at `:139`. Nothing buys width
   near the camera. Note the tension the ports item does not: `grass.md` §3
   deliberately went the *other* way (tuft radius 0.83× → 0.26–0.56×, "more,
   smaller plants — open dirt between them") and verified it by eye. Reconcile
   explicitly rather than reverting it.
3. **Bush stand-card vs geometry-ring albedo**, via `bakeCanopyCard` — the case
   that really is grass.md's bug. `probes/vegalbedo.mts` is the instrument;
   extend it to bake the card and compare.
4. **`hi(R-B)` −20.1 vs −13.5** on the daylight slice, above.

## Instruments this lane added

- `src/tools/probes/vegalbedo.mts` — alpha-weighted mean linear luminance of
  every vegetation card, against its pin.
- `src/tools/probes/padclear.mts` — what still grows on a built POI pad.
- `?post=gwhite` / `gwarm` (`TerrainMaterial.ts`), `?post=vwhite` / `vwarm`
  (`VegMaterial.ts`) — albedo floor and hue ceiling, for anything that claims a
  colour row belongs to the ground or to the plants.
- `?post=nodry` / `drymax` (`TerrainMaterial.ts`) — tier-D dry cover off, and at
  full cover. **The `ABLATE` set must stay above `NOISE_GLSL`**: the shader
  template literals interpolate it at module-evaluation time and a `const`
  declared below them is in its temporal dead zone when they run.
- `tmp/gl/shadowmask.mts` — paints the darkest quartile so `sh(R-B)` can be
  *looked at*. Scratch; promote it to `src/tools/` if a second lane wants it.
- `tmp/gl/layerstat.mts` — the recipes' real mean linear albedo. **Re-run this
  after editing any recipe in `Layers.ts`**; `LAYER_AVG` does not regenerate.
