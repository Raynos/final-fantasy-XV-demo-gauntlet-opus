# Mid-ground — the daylight band from 60 m to 400 m

Owner: the mid-ground agent (`PORT=5530`), 2026-08-23.
Branch: `worktree-agent-ae7aa657578f4e7fc`, merged up from `main` at `6b61bec`
(**created 234 commits behind — that is now six agents in a row and it really
should be a worktree-creation step**). A fresh worktree also has no
`node_modules` and no `src/public/`; both need a symlink to the main checkout
before anything runs.

Predecessors, all of which handed a piece of this over: `project/handoff/variety.md`,
`project/handoff/budget.md`, `project/handoff/terrain-material.md`,
`project/handoff/shadows.md`.

**Status: three commits landed, all gated.**

---

## The brief, and what the measurement said about it

A blind judge validated against a hardened control identified 4 of our 5 frames.
Its stated cue was *"smooth untextured terrain silhouettes, box/decal props, and
repeated card-foliage trees over a single flat ground texture with no
ground-layer scatter or contact AO"*, and every frame it caught was a daylight
landscape with ground running to the horizon.

The first useful thing this lane did was stop reading `reliefstat`'s six-shot
median and read it **per shot**. The median hides the finding completely:

| shot | `tot`, ground ROI | vs `FFXV-ground` 49.00 |
|---|---|---|
| `vista_noon` | 72.39 | 148% |
| `zone_fallgrove` | 63.11 | 129% |
| `vista_dusk` | 62.30 | 127% |
| `zone_vannath` | 48.14 | 98% |
| **`zone_longwythe`** | **28.97** | **59%** |
| **`zone_three_valleys`** | **30.11** | **61%** |

The environment does not have a uniform detail deficit. **Dry Leide does**, and
it is roughly a factor of two behind everything else we render. Those two shots
are two of the four the judge caught.

And the spectral shape of the deficit is specific. Over a mid-ground band ROI
(`--roi 0.10,0.46,0.80,0.18`), the six-shot median against the same plates:

    d4   10.66 vs 13.39   —  80% of the reference
    d8   13.64 vs 14.82   —  92%
    d16  18.13 vs 15.96   — 114%
    d32  27.41 vs 16.38   — 167%   HOT

**Too much large soft blotch, not enough small hard object.** That is one
sentence and it is the whole brief. The 2-8 m surface variegation the
terrain-material lane added is alive out there and is most of the d32; what is
missing is sub-metre contrast.

---

## The measured negative that decided the approach

Before building anything, ablate. `zone_longwythe`, paired `--raw` captures:

| ablation | mean/255 | pixels over 8/255 |
|---|---|---|
| every bush card (`--hide scrub_`) | **0.955** | 2.0% |
| the whole grass ring (`--hide grass`) | **1.654** | 5.0% |

`imgdiff`'s own noise floor is 1.5-1.9/255. **The entire instanced ground layer
of the frame the judge catches is worth about 2% of its pixels**, and
`scrubbind` says the card ring is already 8 076 of 9 000 — 90% saturated, so
there is no headroom to spend even if spending were the answer. FFXV's matched
band is tens of percent cover. Closing that with instances needs roughly fifteen
times the cards, in the one currency this renderer is bound on.

So the mid-ground fix has to be in the terrain shader, which is where ~98% of
those pixels come from. That is not a preference, it is arithmetic.

---

## What landed

### 1. `74e771a` — the `vista_noon` placeholder props, five rounds late

Two of the three offenders were one-line material bugs and **neither was what
the last handoff guessed.**

- **The "chrome-black sphere" is the comms dish, and it was never geometry.**
  `outpostMaterials().steel` was `paintedMaterial(0x8b9095, 0.5, 0.8)` —
  metalness **0.8**. A metal that smooth has essentially no diffuse term; all it
  has is the sun's specular lobe plus a sky PMREM that is dim beside a noon sun.
  On thin lattice members that reads fine because every face catches a
  highlight. On a 1.9 m spherical cap seen from *behind*, with every normal
  turned away from the sun, it renders a near-black ball with two white streaks.
  Three lanes rebuilt the dish's ribs, rim, yoke and counterweight trying to fix
  that. Painted steel is a dielectric; 0.22 is the right number.
- **The rest of the dish is aim.** It pointed up and away, so every ground
  camera saw its convex back, and a smooth cap is a ball whatever you bolt to
  it. Aimed at the shot's own camera — the euler is derived in the comment from
  the camera position and the compound yaw — it needs none of the detail: hard
  elliptical rim, concave sweep, feed horn on its tripod. `tmp/crop/m0-vn-props.jpg`
  against `tmp/crop/m2-vn-props.jpg` at 2.6-3.4x is the whole argument.
- **The containers were not a mip failure.** `variety.md` guessed aliasing and
  left it. `bakedTexture` mips at anisotropy 16 and the blotches resolve cleanly
  at 3x. `rustMaterial` simply put `base.r * 1.35` — saturated orange — against
  a `0.30` neutral grey on a 0.36 m blotch: a 2.5:1 value swing with a full
  chroma swing on top, seventeen blotches across a 6 m container. Now 1.19:1.
  The third container was `M.red`, a saturated brick enamel that was the
  brightest object in the frame; all three are rusted steel.
- **And the compound cast no shadow at all**, because `outpost` was not in
  `Outposts.build`'s `casters` set. That is the judge's "box/decal props, no
  contact AO" verbatim. +19 draw calls on `vista_noon` (529 -> 548 of 800).

### 2. `c2339eb` — a dry-country ground layer painted into the terrain

`TerrainMaterial.ts`, a tier-D analogue for the country the sward's `bioGreen`
gate excludes. Zero draw calls, zero triangles, no new uniform or texture.

Three design decisions, each of which is the finding:

- **The dominant octave is 0.74 m, not metres.** 16 px at 60 m, 5 px at 200 m,
  faded out by its own screen footprint at 300 m where it stops being
  resolvable, with a 1.9 m octave under it that runs to the horizon. Everything
  coarser than that lands in d32, where we were already at 167%.
- **It is a height, not a stain.** A flat multiply adds value range without
  adding structure and would have landed in d32 with the rest of the blotches.
  The mat stands proud through `tf_bump`, so every clump has a lit side and a
  shaded side and the contrast comes out of the sun.
- **It is bimodal, because the shortfall is at the top of the range.** Luma
  percentiles over the mid-ground band:

      ours zone_longwythe      p10 40.6   p50 63.0   p90  97.6   p90/p10 2.40
      ffxv duscae-plains-noon  p10 35.4   p50 65.2   p90 122.5   p90/p10 3.45
      ffxv duscae-wilderness   p10 13.1   p50 32.2   p90  86.7   p90/p10 6.60

  We are a stop short of the reference's value *range* and our p10 is already
  the higher of the two, so cover that only darkens walks both ends down
  together and closes nothing. Bleached straw crowns brighter than the soil,
  dark shade beneath. **The first version of this term darkened only, and it is
  recorded here as the wrong instrument rather than as a tuning miss.**

  The dark endpoint is measured the way the sward's was meant to be:
  (0.644, 0.752, 0.708), from the 22 011 pixels our own scrub cards actually
  cover in a `--raw` pair — not from a rectangle that averages them with bare
  ground.

**The gating is exact, and that is the evidence it is doing what it says.**
Paired `--raw`, mean/255:

| shot | delta | pixels > 8/255 |
|---|---|---|
| `zone_longwythe` | **2.647** | 7.3% |
| `zone_three_valleys` | **2.519** | 7.6% |
| `vista_dusk` | 1.992 | 5.6% |
| `hero_full` | 0.866 | 1.9% |
| `zone_vannath` | 0.578 | 0.9% |
| `zone_fallgrove` | **0.000, max 0** | 0.000% |
| `zone_nebulawood` | 0.020 | 0.001% |

`reliefstat` on `--raw` `zone_longwythe`: total 18.06 -> 19.22, d1 8.76 -> 9.47,
d2 7.81 -> 8.99, d4 6.79 -> 7.24.

### 3. `b37c9cd` — the sward's colour was measured wrong, and it barely matters

The tier-D sward's tint came from a 900x160 rectangle with and without grass.
A rectangle averages the grassed pixels with the bare ones between them, so that
is the **partial-cover** ratio, and it was applied at **full** cover. Re-measured
over the pixels the blades actually cover:

    zone_fallgrove   ratio (0.826, 1.029, 0.735)
    zone_vannath     ratio (1.028, 1.303, 1.123)

Two findings. The humid ratio is about twice the chroma swing of the shipped
(0.922, 0.968, 0.887). And **the dry-savannah ratio is above one on every
channel** — pale straw grass over red soil is *lighter* than what it grows on,
where wet Duscae grass over dark loam is darker. One tint could not have been
right for both and the shipped one was the wrong sign for half the world.

**And it is close to a measured negative.** Paired `--raw` with only this block
changed: `zone_fallgrove` **0.037 mean/255 over 0.006% of pixels**. The 3x
crops before and after are indistinguishable. That is *reach*, not strength —
the endpoints moved 10-17% per channel, so for the frame to move 0.037 the
ground satisfying both the grass splat weight and the 100-185 m ramp at once
must be a small fraction of it. Kept because a wrong-signed constant is not a
defensible resting state, and flagged for whoever widens the reach.

An intermediate version fed the sward tuft through `tf_bump`, which meant
hoisting the block out of its perf-guard branch so the derivative sat in uniform
control flow. That bought 0.144 instead of 0.037 — still under the floor — for
six noise evaluations, a `tf_gust` and a `tf_bump` on **every terrain pixel in
the world** including Leide and the towns. Reverted.

---

## Traps this cost, both already written down

- **Backticks inside a `/* glsl */` template literal**, a fourth time. I wrote a
  variable name in prose inside a shader comment and the next capture hung for
  the full 120 s with a bare daemon stack and no useful error. `LANDMINES.md`,
  both terrain handoffs and `sibling-TRAPS` all warn about this and it still got
  me. **If a capture hangs immediately after a shader edit, grep the edited
  range for a backtick before doing anything else** — it is one `awk` and it is
  always the first thing to check.
- **Draw counts in `manifest.json` are order-dependent.** `zone_longwythe`
  reported 578 when captured first and 598 when captured after another shot in
  the same page, with no code change between. Vegetation streaming state carries
  across shots in a daemon page. Never price a change from two multi-shot runs;
  capture the one shot alone on both sides.

---

## What is left, ranked, and what is known about each

1. **The Meteor of the Disc renders as a flat untextured pale grey-blue slab**
   and it is the largest thing in the upper half of `zone_longwythe`.
   `tmp/crop/lw-slabs.jpg` at 2.6x. It uses a real `rockMaterial`, so this is
   either the aerial-perspective fade doing its job correctly at 4-5 km or a
   genuinely dead surface — **and I did not ablate it, so I do not know which.**
   Do not re-tint it before capturing it with the fog off. `props/Megastructures.ts`.
2. **Our graded Leide shots frame a bare plain from 80 m out, and shipped FFXV
   never does.** Every `FFXV-ground` plate has foreground objects in the bottom
   band; `zone_longwythe` has none. That is why its `tot` cannot be closed by
   ground texture alone — d16 and d32 at 21 need *objects*. This is a
   `src/game/Shots.ts` framing question and that file is not this lane's.
3. **Vegetation contact AO is still unaddressed** and the round-8 judge named it
   first (*"no contact shadow or AO where they meet the terrain"*). In Leide it
   cannot be worth much — the whole ground layer is 2% of pixels there — but in
   `zone_fallgrove` and `zone_vannath` it is a much larger share. The cheap
   untried version is a vertical AO gradient baked into `scrubCardGeo` and the
   tree impostor geometry, which costs nothing at all.
4. **The tier-D sward's reach, per §3 above.** Widen `swardAmt` before anybody
   touches its colour again.
5. **`vista_noon`'s lattice mast is still the palest object in a dark frame.**
   Legible now rather than a placeholder, but high-contrast.
6. **Painted clouds with hard alpha edges**, named every round since 5, still
   outside every lane that has run.

---

## Instruments added or corrected

Nothing was added to `src/tools/`. Three measurement *methods* are worth
carrying forward and are written into the commit messages:

- **Read `reliefstat` per shot, not as a median.** The median said 93-96% of the
  reference while two shots sat at 59%.
- **A mid-ground band ROI**, `--roi 0.10,0.46,0.80,0.18`, which is what makes
  the d4-vs-d32 tilt visible. `reliefstat --roi` crops the same fraction out of
  the plates, so it is comparable.
- **Measure a cover material over the pixels it covers**, not over a rectangle.
  Take a `--raw` pair with and without the layer, mask on `sum|a-b| > 40`, and
  read both means inside the mask. A rectangle gives the partial-cover ratio and
  applying that at full cover is how the sward lost most of its effect.

---

## Shots

- `tmp/shots/m0/` — the state as inherited, six shots, JPEG. `tmp/shots/m0p/` PNG.
- `tmp/shots/m2/vista_noon.jpg` — after the props commit.
- `tmp/shots/m5/`, `tmp/shots/m6/` — after the dry cover and the sward.
- `tmp/crop/m0-vn-props.jpg` vs `tmp/crop/m2-vn-props.jpg` — the outpost at
  2.6-3.4x, before and after. The pair that carries the props argument.
- `tmp/crop/cmp-cover2.jpg` — the `zone_longwythe` mid-ground at 4x, before,
  after, and beside `duscae-plains-noon-05`. The pair that carries the terrain
  argument, and the frame this was actually judged in.
- `tmp/crop/lw-slabs.jpg` — the untextured Meteor, open item 1.
- `tmp/ab/r9/` + `tmp/ab/r9-KEY.json` — blind round 9 and its control.
