# Terrain material — the blind judge's round-2 number one defect

Owner: the terrain-material agent (`PORT=5420`).
Branch: `worktree-agent-a7af4e4142492a120`, fast-forwarded from `main` at `7781bdf`.
Predecessors: `project/handoff/atmosphere.md` and `project/handoff/graphics-ceiling.md`.

**Four commits, all landed and all gated. `npm run check` is 11/11 and
`seatcheck` passes standalone. The blind judge no longer ranks terrain material
first — it ranks shadowing first, which is not this lane.**

---

## The headline

Round 2's number one defect, verbatim: *"Smooth vertex-coloured brown lumps at
every distance — no detail normal, no roughness variation, no strata, no
erosion."* Round 3 moved it to **second**, and reworded it away from the
"smooth lump" reading toward tiling and splat seams. The new first is *"no
shadowing of any kind"*, which this lane does not own and which contradicts the
tree (CSM, GTAO and the horizon bake are all on) — read that as a lead about
what a *high midday sun* looks like in these six frames, not as a fact.

`reliefstat.mts` is new and is the instrument that made the work measurable.
Ground band, ours against a six-plate `FFXV-ground` subset, contrast per octave
as a percent of region mean luma:

|                 |   d1  |   d2  |   d4  |   d8  |  d16  |  d32  |  tot  |
|---|---|---|---|---|---|---|
| **before**      | 12.53 | 11.02 | 11.77 | 14.43 | 15.54 | 19.80 | 41.98 |
| **after**       | 13.68 | 12.99 | 14.04 | 15.21 | 16.32 | 19.86 | 43.57 |
| `FFXV-ground`   | 11.32 | 15.45 | 16.76 | 18.44 | 21.22 | 21.79 | 49.00 |

d4 70% → **84%** of the reference, d8 78% → **83%**, d16 73% → **77%**. The two
frames the judge named moved much further, because they are pure ground with no
canopy in the ROI:

| shot | `tot` before | after | d4 before → after |
|---|---|---|---|
| `zone_longwythe`     | 22.86 | **27.84** | 6.90 → **9.17** (41% → 55% of ref) |
| `zone_three_valleys` | 23.18 | **29.29** | 6.39 → **9.64** (38% → 58%) |

**The atmosphere lane's colour numbers were held and slightly improved.** Six
shots against `FFXV-field`, delta from the reference (0 = on it):

| | `R-B` | `sh` | `hi` | `meanL` | `p50` | `sat%` | `stops` |
|---|---|---|---|---|---|---|---|
| atmosphere lane's landing | +0.9 | +2.8 | +2.0 | +10.0 | +2.4 | +3.1 | +0.24 |
| my start (`7781bdf`)      | +0.6 | +3.0 | +1.8 | +9.3  | +2.5 | +3.2 | +0.22 |
| **after this lane**       | **-0.4** | **+0.4** | **+2.0** | **+8.5** | **+3.0** | **+3.3** | **+0.16** |

Aerial perspective was not touched. Nothing under `src/world/sky/`,
`src/engine/postfx/` or `src/world/Weather.ts` was edited.

---

## What landed

### 1. `src/tools/reliefstat.mts` — the instrument (`67768e8`)

A Laplacian pyramid over the luminance of a region, RMS contrast per octave as
a percent of the region's mean luma, against a scene-matched reference subset
cropped identically.

```bash
node src/tools/reliefstat.mts "tmp/shots/x/*.png"                 # default ground ROI
node src/tools/reliefstat.mts a.png --roi 0.3,0.55,0.55,0.09      # fractional x,y,w,h
```

**It exists because `imagestats.mts` cannot see this defect and never could.**
Every one of its twelve statistics was inside tolerance on `FFXV-field` in the
same week the judge ranked terrain material first. A colour statistic is a
statement about *where* contrast sits in a frame; it says nothing about how much
of it there is. The baseline reading — more energy than the reference at 1 px
and less at every scale above it — is the numeric form of "a flat, uniform
mottle".

Two things it deliberately does not do, both in the file header: it is not
scale-invariant across resolutions, and it is blind to *what* the contrast is.
**Read `d4`–`d16` as the signal and `d1` as a warning.** Our captures are PNG and
the plates are JPEG, so the reference's `d1` is if anything understated and a
win there would not be a win.

`GROUND_PLATES` is a *subset* of `imagestats`' `FFXV-field`: three of those ten
put a lake, a car or Noctis across the whole bottom of frame, and a flat sheet
of water would drag the ground target down for a reason that is not about
ground.

### 2. Relief that survives to the horizon (`e2348f6`)

`src/world/terrain/TerrainMaterial.ts`. An analytic relief field **in metres** —
erosion channels on structural slopes, braided wash and flow-cut channels on the
flats, bedding steps whose amplitude is `1/freq`, the bed's own thickness — fed
through Mikkelsen's surface gradient into the normal, and separately into the
albedo, the roughness and the AO.

**The trick is that every octave fades on its own screen footprint, not on
distance.** A term that fades with distance says "there is no detail out there";
a term that fades with its footprint says "the detail out there is finer than a
pixel". Only the second is true, and it is what lets one expression run from the
camera to the horizon instead of being cross-faded out at 420 m like every other
detail term in this shader.

Metres and not an arbitrary strength, because then the amount is not a number
anybody has to re-tune per range: a 3 m gully shades a foreground bank by the
same arithmetic that stops a massif being a balloon.

**The shading normal is now fetched with an explicit LOD** derived from the
projection, replacing a hand-rolled 5-tap cross whose width ramped with
distance. Both low-pass. The difference is that a level chosen from the
projection is *monotonic*, where an implicit-LOD fetch picks its level from
`dFdx` of a varying and comes back different for neighbouring quads on the far
ranges. It is also **four texture fetches cheaper**.

New uniform `uPxScale` = `2·tan(fovY/2) / drawingBufferHeight`, written each
frame by `Terrain.lateUpdate`. Do not derive the footprint in the shader from
`dFdx(vTW)`: `vTW` is a varying, so its screen derivative is constant inside a
triangle and jumps at every edge.

### 3. Tier-D grass (`71d0ed1`)

`LODS` in `veg/GrassField.ts` ends at `far: 155` and past it there was no grass
representation at all. Tier D is not more geometry — the honest LOD for a thing
smaller than a pixel is to darken the pixel — it is the aggregate of grass and
the dirt between it, painted into the terrain material, patchy at clump scale
and **taking the wind from the same uniform objects the blades sway on**
(`VegUniforms.uTime`, `uWindDir`, `uWindStrength`, shared by identity, not
copied). A gust band therefore crosses the seam instead of stopping at it, and
the weather can never move one half of a field without the other.

The colour is measured, not invented: two `--raw` captures of `zone_fallgrove`
with and without grass, over a 900×160 near-ground patch, read
`(125.6, 121.5, 82.2)` bare against `(115.8, 117.6, 72.8)` grassed — grass
multiplies its own ground by `(0.92, 0.97, 0.89)`, darker and greener. Held to
exactly that at full cover, times a patch field whose mean is about half.

Gated on the grass splat weight and on regional `bioGreen`, so Leide is
untouched: `zone_longwythe` reads identically on every `reliefstat` band.

**Cost: zero triangles and zero draw calls.** `manifest.json` for the six shots
before and after is triangle-identical to the last triangle
(`zone_longwythe` 7 208 870 both sides, `zone_fallgrove` 7 655 057, and so on).

### 4. The ground is a mosaic at a few metres (`74f3a59`)

Two causes, and the first is the one worth remembering:

- **Every albedo detail term in this shader was gated on distance, and past
  105 m all of them were already off except the 5 m layer tiles.** `gritAmt`
  ends at 16 m, `dAmtA` at 90 m, `nfAmt` — the 2–4 m surface that carries
  gravel, cracking and scour — at 105 m, `dAmtB` at 420 m. From 105 m to the
  horizon the ground was one tiled texture under a set of hectare-scale tints.
  `nfAmt` now runs on footprint: its map tiles at 2.9 m, so its features are
  about a third of a metre, and a third of a metre is still four pixels at
  240 m.
- **The six layers cannot supply a mosaic on their own.** Their mean lumas run
  0.35 to 0.47, a spread of ±15%, so the splat can switch from dirt to gravel to
  scree and the value barely moves. Added a 2–8 m variegation on the axis real
  ground varies along — scoured pale and warm against organic dark and cool —
  smoothstepped so the patches have edges, damped under a sward and on a road
  because those genuinely are uniform.

---

## Measured negatives, and one long wrong turn recorded in full

**The first relief pass drew a dotted 2×2 ladder down Longwythe Peak's crest.**
Ablating the bump with `amt = 0` proved the bump was the carrier — the ladder
vanished and the crest went back to the smooth dark band the baseline draws.
Then **six** guesses at *which input*, each one wrong, each one a real negative:

| probe | result |
|---|---|
| `--ablate nogtao` | moved 8.6% of pixels; ladder **unchanged**. Not GTAO, despite `LANDMINES.md` recording the chevron hatch as GTAO's. |
| `--ablate notaa,nocas` | **unchanged**. Not the post chain. |
| band limit widened 4 px → 8 px per octave | **unchanged** |
| determinant floored at 0.20 of the quad's area | **unchanged** |
| `abs()` → a smooth absolute value (a crease is a C1 discontinuity along every zero contour) | **unchanged** — kept anyway, a rounded gully floor is the truer shape |
| `bedRelief` dropped from the differentiated field, since it is written inside a divergent branch | **unchanged** |
| footprint from the projection instead of `dFdx(vTW)` | **unchanged on its own**, but a real bug and needed for what follows |

**What named it was a probe, not a guess.** Write `sPx/tfPx`, the per-quad
variation of `N`, and `|dFdx(relief)|` into the three colour channels of a frame
and look at it. The green channel lit up in exactly the pattern of the artefact.
The shading normal was aliasing; the relief's own crossover weight was reading
it; and the derivative of a weight that wobbles per quad between two fields that
differ by *metres* is a black dot. Filtering an aliased sample five times does
not unalias it.

Two fixes followed from that and both are in the shipped code: the crossover
between gully and wash is read from **mip 4** of the normal field, because
whether a place is a mountain flank or a basin floor is a hectare-scale question
and asking it at texel resolution was never right; and `tf_surfNormal` fetches
with an explicit LOD.

This is the third entry for the same family in `LANDMINES.md`'s "diagnoses that
were wrong" — the chevron hatch, the wood grain, and now this. **All three were
the terrain's own filtering, and all three were first blamed on something
downstream.**

### Other negatives

- **`imagestats` cannot grade this lane.** All twelve statistics were inside
  tolerance at the start and are inside tolerance now; they moved by less than
  the reference's own inter-plate spread while the frame changed a great deal.
  Use it as a *guard* against undoing the atmosphere lane, which is what it is
  now doing here, and `reliefstat` as the grade.
- **The `d1` band went the wrong way** (+1.21 → +2.36 against the reference).
  Some of that is real added high-frequency energy from the variegation and some
  is codec asymmetry. It is the one band where we were already *over* the
  reference and it is worth watching, not chasing.
- **Perf is not separable on this tree tonight and I am not going to pretend
  otherwise.** Six `perf.mts` runs, paired on the same two shots and the same
  scene state (420/436 draws, 5.77 M/6.05 M tris on both sides):

  | | `zone_longwythe` | `zone_fallgrove` |
  |---|---|---|
  | baseline `7781bdf` | 35.84, 23.78 ms | 34.25, 20.28 ms |
  | this lane | 34.76, 17.69 ms | 17.25, 18.89 ms |

  Run-to-run spread is 12+ ms on **both** sides, larger than any plausible
  shader delta, so nothing here is certified. What can be said: **no run showed
  a regression, and every median came out lower on this lane's side.** That is
  consistent with the mechanism — the shader gained about six simplex
  evaluations and *lost four texture fetches per terrain pixel* when the 5-tap
  normal cross became one `textureLod`. Somebody should take the ruler on a
  genuinely quiet tree. `RULER_VALID: true` on the runs quoted; two earlier
  attempts came back `VOID` and are not quoted.

---

## Blind A/B round 3 — `tmp/ab/r3/`, seed 3307, six pairs

**6 identified, 0 fooled, 0 hesitated. Score 3/10.** Round 2 was 6 identified,
0 fooled, five HIGH and one MEDIUM, score not restated.

**Read the hesitation number with care, because I damaged it.** My judge prompt
said "Do not be generous. Do not hedge." That is a direct instruction against the
metric the previous handoff says moves first. **Round 4 must reuse round 2's
prompt wording verbatim, or the series is broken.** My own fault, recorded so it
is not repeated.

What did move is the defect ranking. Round 2's first was terrain material.
Round 3's first is shadowing, and terrain material is second with its wording
changed from "smooth vertex-coloured brown lumps at every distance" to "a single
tiling texture at a single UV scale… visible repeat, vertical smear, hard splat
seams."

**Treat that prose as a lead and not as evidence — several of its claims are
falsifiable and false.** It says there is no triplanar projection (layer 3 is
triplanar and has been for weeks), no slope- or altitude-driven blend (the splat
is driven by both), no aerial perspective (measured on the reference by the
atmosphere lane), no post pipeline and no colour grade (there is a full one),
and no shadowing (CSM, GTAO and a horizon bake are all live). This is exactly
the failure mode round 1 recorded: **the verdict column is evidence, the
reasoning is a lead.**

The two leads in it I believe, having looked at `tmp/ab/r3/ab-03.jpg` myself:

1. **Nothing in these frames casts a visible shadow onto the ground.** The
   reference panel has a cast shadow under every tree, bush and boulder. Ours
   has none I can find at this sun elevation. Either the sun is too high in
   these shot definitions or something is wrong with the cascade at this range.
   Worth an ablation by whoever owns `src/engine/` — I did not chase it because
   it is not my lane and I could not have fixed it if it were.
2. **No near-field ground cover in Leide.** In `zone_longwythe` the ground runs
   bare to the bottom edge of frame, where FFXV's matched plate is dense scrub
   and grass for the first ten metres. Leide's `bioGreen` is near zero so both
   the grass rings and my tier-D sward are correctly off — but shipped FFXV's
   Longwythe is *not* bare. That is a `veg/Biomes.ts` density question, not a
   terrain material one.

---

## What I would do next, in order

1. **The shadow finding above.** If it is real it is the largest single item in
   the environment and it is cheap to test: capture `zone_longwythe` with the
   sun forced to 25° and see whether shadows appear.
2. **The residual crest ladder is gone but the mechanism is only half fixed.**
   `structSlope` still reads `rawN` with `textureLod(..., 0.0)` — a deliberately
   unfiltered point sample — and feeds smoothsteps. It no longer feeds a
   derivative, so it no longer draws dots, but it is still an aliasing source on
   far ranges. Giving it the same footprint-derived level as `tf_surfNormal`,
   minus a bias so it stays sharper, is the tidy version.
3. **The layer palette has no value contrast: mean lumas 0.35 to 0.47.** I
   worked around it with a variegation term. The real fix is to author the six
   `RECIPES` in `Layers.ts` with genuinely different values — a pale scoured sand
   against a dark wet loam against a mid grey scree — so that the splat switching
   material is *visible*. That is the single biggest remaining lever in this lane
   and I did not take it because it touches every zone's colour at once and
   wanted more time than I had left.
4. **Roughness still barely varies.** `LAYER_ROUGH` spans 0.82–0.95, and the
   relief and variegation each move it by about 10%. At a 45° sun that is nearly
   invisible. Worth measuring with a low-sun shot before investing.
5. **Silhouette erosion is off the table until somebody re-bakes.** The judge
   names un-eroded cone silhouettes in every round, and it is right, but the
   heightfield lives in `src/public/baked/` — one cache shared by every worktree
   through a symlink — so changing `Field.ts` would drop every other worktree
   onto the 7–15 s regeneration path. Do it in the same pass as the next
   `BAKE_VERSION` bump, together with the horizon bake move the graphics-ceiling
   handoff also parked there.

## Gates

`npm run check`: **11/11**, on a tree with no other agent's paths dirty.
`anycheck` is 0. `seatcheck` PASS standalone, model residual p99 **0.000 m** —
the seating model is unaffected, which is the point of that gate.
`horizoncheck` PASS at worst MCC **0.766**, which is *lower* than the 0.858 /
0.900 / 0.907 the graphics-ceiling handoff recorded. It is deterministic across
runs and it cannot be this lane: `horizoncheck` compares the CPU bake against a
CPU brute-force march and never touches a shader, and nothing under
`terrain/Horizon.ts` or `terrain/Field.ts` was edited. **Somebody should find out
when it moved.**

## Files touched, and the only files touched

- `src/world/terrain/TerrainMaterial.ts` — the relief field, `tf_bump`,
  `tf_lodW`, `tf_sabs`, `tf_gust`, the explicit-LOD `tf_surfNormal`, the tier-D
  sward, the surface variegation, `uPxScale` and the three shared `VegUniforms`.
- `src/world/Terrain.ts` — `uPxScale` written each frame in `lateUpdate`.
- `src/tools/reliefstat.mts` — new.
- this file.

**Nothing under `src/world/sky/`, `src/engine/`, `src/world/veg/`,
`src/world/props/`, `src/world/town/`, `src/game/rpg/`, `src/ui/`,
`src/combat/` or `src/characters/` was touched.** `src/world/veg/VegMaterial.ts`
is *imported* by `TerrainMaterial.ts` for `VegUniforms` and is not modified.

## Traps this cost, all of them already written down somewhere

- **Backticks inside a `/* glsl */` template literal**, three separate times,
  each one costing a 120 s capture timeout with no useful error. `sibling-TRAPS`
  trap 18, `LANDMINES.md` vegetation section, and both terrain handoffs warn
  about it. Writing a uniform name in prose is enough to do it. A fourth
  incident came from a blanket `sed -i '' 's/`//g'` over a line range that also
  ate two `const FRAG_* = /* glsl */\`` delimiters — **strip backticks by line
  number, never by range.**
- **`shoot.mts` prints only the first line of a page error.** A shader that
  fails to compile shows up as `page.waitForFunction: Timeout 120000ms
  exceeded` with an empty log. If a capture hangs right after a shader edit,
  suspect a parse error before anything else.
- **The worktree started six commits behind `main`.** `origin/main` was
  `6b61bec` and the local `main` was `7781bdf`; every document the brief named
  was missing until I fast-forwarded. Check `git log --oneline -1 main` against
  your own HEAD before concluding a handoff does not exist.
- `src/public/` did not exist in a fresh worktree, so the `baked` symlink has to
  be preceded by `mkdir -p src/public`.

## Shots that show the current state

- `tmp/shots/tm-base-j/` — the baseline at `7781bdf`, JPEG, six shots.
- `tmp/shots/tm-v1j/zone_longwythe.jpg`, `zone_vannath.jpg` — the same frames
  after. Gully relief on every massif, drainage and wear on the ground.
- `tmp/crop-lw-cone.png` vs `tmp/crop-r10-cone.png` — Longwythe Peak at 3×,
  before and after. The A/B that carries the argument.
- `tmp/crop-ridge-base.png` … `tmp/crop-ridge-r8.png` — the crest at 6×, one per
  wrong hypothesis, in order.
- `tmp/crop-probe1.png` — the three-channel derivative probe that named it.
- `tmp/crop-lw-near.png` vs `tmp/crop-v1-near.png` — near ground at 2×.
- `tmp/ab/r3/` — blind A/B round 3, six pairs, seed 3307, sealed key.

## My honest grade for the environment, against shipped FFXV

**4 / 10.** Half a point above the judge, and a point below where I hoped to be.

The terrain material is genuinely better: massifs have erosion and lit relief
where they had an airbrushed swirl, the ground has wear and drainage at metre
scale where it had a uniform mottle, and the mid-distance no longer falls off a
cliff at 105 m into one tiled texture. The measured contrast deficit closed from
30% to 16% at the scales the eye reads material.

What keeps it at 4 is that I can now see, in a side-by-side I looked at myself,
that terrain material is no longer the thing costing us the most. In
`tmp/ab/r3/ab-03.jpg` the reference panel has a cast shadow under every object
and a dense mat of scrub in its first ten metres, and ours has neither. That is
two other lanes' work and it is worth more than another round of mine. The
honest read of this lane is that it has stopped being the top-ranked defect,
which is what it was asked to do, and that the next agent should be looking at
shadows and at near-field ground cover rather than at this shader.

---

## Answered by the coordinator: when `horizoncheck`'s MCC moved, and why

You asked someone to find when the worst MCC went from 0.858 to 0.766. It moved
with the **content lane's Hammerhead merge**, and it is not a regression in the
bake.

`heightcheck` samples a fixed world point and reports it every run. It read
**8.130 m** before that merge and **7.417 m** after — the terrain field itself
changed shape. Neither gate failed, so nothing flagged it.

The cause is the escalated decision to move the Hammerhead POI onto the town at
(576,10), because the flattening pan follows the town. Probed across a 120 m box:

| site | height spread |
|---|---|
| town, (576,10) | **1.81 m** |
| old POI, (60,18) | 6.49 m |
| origin | 5.36 m |

The town now sits on the flattest ground of the three by a factor of three, and
the old site has gone back to natural terrain — which is exactly what should
happen, and it is why the sample point near the origin dropped 0.71 m.

So the horizon bake is measuring a **different skyline**, correctly. Nothing to
fix. Worth the twenty minutes it took, because "a gate's number moved and nobody
knows when" is how this repo has acquired most of its wrong diagnoses — and the
answer here happened to be benign, which you cannot know until you look.
