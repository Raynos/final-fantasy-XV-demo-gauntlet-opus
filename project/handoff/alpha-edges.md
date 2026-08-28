# Alpha edges, round 2 — the spatial CAS, and where the aliasing actually lives

Lane: `alpha-edges`, 2026-08-28. Owns `src/world/veg/` and the AA/sharpen half
of `src/engine/postfx/`.
Brief: `docs/plans/2026-08-26-opus-the-standing-backlog.md` §WS-3.
Predecessors: `project/archive/handoff/alpha-edges.md` (the round-1 lane, which
is where every number before today lives), `vegetation.md`, `grass.md`.

**Status: all three items closed.** One was already landed before the plan was
written and is re-verified; one is landed and measured today; one is a measured
negative on its stated cause, with the defect relocated to a different band and
an instrument left behind. `perf` PASS with 0 of 5 shots over the floor,
`gameplay` PASS, `nanscan` not re-run (no shader on a NaN path was touched —
see "what I did not do").

Shas: `95a34c0` (spatial CAS), `46c72a1` (`probes/leaftexel.mts`), `7120d7f`
(the backlog's WS-3 result and three negatives rows).

---

## Item 1 — anti-alias the alpha cut: already landed, re-verified

The plan lists this as open. It is not: `alphaToCoverage`, a multisampled
`PostFX.rtScene` and the centred coverage ramp all shipped at `3237976` /
`1245d14`, and the plan predates that merge. `src/engine/postfx/Msaa.ts` and
`VegMaterial.coverageAA` are the two halves.

Re-verified on today's main, `?post=nomsaa` against the shipped frame,
`zone_fallgrove`, both `--cold`:

| roi | edge% | hard% | p50 | p90 | speck | mid% |
|---|---|---|---|---|---|---|
| treeline `1150,340,320,90` `nomsaa` | 37.50 | 20.0 | 15.9 | **77.6** | 7.1 | 5.35 |
| treeline, shipped | 38.96 | 15.2 | 16.4 | **58.2** | 8.2 | 7.05 |
| near crown `150,330,260,100` `nomsaa` | 37.95 | 28.6 | 18.3 | **102.1** | 29.3 | 7.86 |
| near crown, shipped | 45.62 | 22.6 | 19.2 | **75.0** | 26.1 | 8.74 |

`mid%` is the statistic to read: it is the fraction of pixels sitting between
the two Otsu classes, and partial coverage *is* that band. It goes **up** on
both ROIs, which is what "there is now something between leaf and sky" looks
like. `hard%` and p90 come down together.

**And I looked.** `tmp/crop/ae/base-edge.png` and `new2-edge.png`, the
`zone_fallgrove` treeline at `1240,335,90,55` magnified 10×: every leaf boundary
carries intermediate greys, there is no full-contrast canopy-to-sky step
anywhere in the crop, and the isolated texels that are left have neighbours in
the same tone rather than sitting alone in the sky. That is the done-when
condition of this brief and it is met.

**Hashed alpha is moot.** It was the in-lane fallback for the case where the
cross-lane half — a multisampled scene target — could not be had. It was had.
Do not build it.

---

## Item 2 — a spatially varying CAS sharpness: landed, `95a34c0`

### What the round-1 lane left, and why the constant was not the lever

`project/archive/handoff/alpha-edges.md` measured CAS **doubling** both the
apparent edge-pixel count and the speckle on the treeline, banded four shots to
show CAS is a `d1`/`d2` generator and nothing else — and then deliberately did
not turn the sharpness down, because it looked at `hero_full` at 4× and the
roofline, the path stones and the shrub all lost real definition. Benefit and
cost in the same octave.

Reproduced on today's tree before touching anything, `zone_fallgrove`, CAS on
against `?post=nocas`:

| roi | edge% | p90 | speck |
|---|---|---|---|
| treeline, CAS | 42.1 | 61.5 | 10.0 |
| treeline, `nocas` | 27.9 | 57.0 | 1.8 |
| near crown, CAS | 47.5 | 79.4 | 37.6 |
| near crown, `nocas` | 33.7 | 72.0 | 7.1 |

Still doubling. Still a trade.

### The mask

`CasPass.ts` now multiplies the sharpen by a mask read off
`fx.rtScene.depthTexture`. The question it asks is **not** "is there a depth
discontinuity here" — a roofline against the sky is the largest discontinuity in
the frame and is precisely what must stay sharp. It is **"does this
neighbourhood contain more than one surface"**, measured as **total variation
against range** over a seven-tap line on each axis:

- a smooth surface at *any* angle — including a ground plane at a grazing angle,
  where depth ramps hard down the frame — is monotone, so the steps sum to the
  range: ratio **1**;
- a single step edge (roofline, cliff lip, character silhouette, the near edge
  of a stone) is also monotone: ratio **1**, full sharpen kept;
- a leaf against the sky, or a gap of sky inside a crown, doubles back: **2**.
  Canopy runs **2–4**.

The ratio is scale-free, and that is the whole reason it works: a crown 8 m deep
at 400 m is a 2% depth variation and a bush at 15 m is a 30% one, and no
absolute threshold covers both. A second term gates on the range being a real
variation rather than depth-buffer quantisation, which at 2 km is metres.

`edgeSoft` is **0.9** rather than 1.0, so masked foliage keeps a trace of bite.

### Two ablations, and read the first one first

- **`?post=nocasmask`** pins the mask off and reproduces the pre-change frame.
  It is the control every number below is taken against.
- **`?post=casmask`** renders the mask instead of the image. **This is the
  argument, more than any table.** On `town_forecourt` the mask covers **2.0%
  of the frame** — the overhead wires and a few thin mouldings, with every
  masonry face, roof, awning and paving stone black. On `hero_full` it covers
  **26.7%**, and it is *all* grass, scrub and fence posts: the four characters
  read as clean black silhouettes with only their hair fringe lit.
  `tmp/shots/ae-mask3b/hero.jpg` and `town.jpg`.

### The numbers, `zone_fallgrove`, control against mask against `nocas`

`reliefstat`, canopy band `--roi 0.08,0.36,0.84,0.26`:

| | d1 | d2 | d4 | d8 | d16 | d32 |
|---|---|---|---|---|---|---|
| control (`nocasmask`) | 9.28 | 11.70 | 13.59 | 16.87 | 23.76 | 32.80 |
| **mask** | **8.56** | 11.24 | 13.41 | 16.83 | 23.77 | 32.79 |
| `nocas` | 7.26 | 10.48 | 13.08 | 16.71 | 23.72 | 32.79 |
| `FFXV-ground` | 8.58 | 10.59 | 12.01 | 14.49 | 17.79 | 18.25 |

`d1` lands on the reference plate's 8.58. Every band from `d8` up moves by less
than 0.05. That is the shape the round-1 lane wanted out of turning the constant
down — without paying for it in the town. Take `reliefstat`'s own caution
seriously though: our captures are PNG and the plates are JPEG, so `d1` alone is
never the claim. It is corroboration beside the mask image and the crops.

`edgestat`:

| roi | | edge% | hard% | p50 | p90 | speck |
|---|---|---|---|---|---|---|
| treeline | control | 42.14 | 16.2 | 16.7 | 61.5 | 10.0 |
| | **mask** | **38.96** | 15.2 | 16.4 | **58.2** | **8.2** |
| | `nocas` | 27.93 | 15.1 | 19.5 | 57.0 | 1.8 |
| near crown | control | 47.51 | 24.1 | 19.4 | 79.4 | 37.6 |
| | **mask** | **45.62** | 22.6 | 19.2 | **75.0** | **26.1** |
| | `nocas` | 33.69 | 25.9 | 25.1 | 72.0 | 7.1 |
| ground `0,600,500,280` | control | 17.47 | 0.1 | 10.5 | 16.9 | 0.1 |
| | **mask** | 14.61 | 0.1 | 10.4 | 16.5 | 0.0 |

### And I looked at what it must not break

- `tmp/crop/ae/ctl2-hero-head.png` against `new3-hero-head.png`, Noctis at 6×:
  the face, the rock ground and every crack in it are pixel-for-pixel as crisp.
  The only thing that softens is the hair fringe, which is 0.7 px of opaque tube
  and can only shimmer (`characters.md` §5.1.2 did that arithmetic).
- `ctl2-hero-grass.png` against `new3-hero-grass.png` at 6×: the masked version
  is the better picture. The control has an edge-crawl on every blade that reads
  as sharpened pixel art; the masked one reads as grass. Ground cracks and the
  dirt texture survive in both.
- `new3-town.png` at 5×: beams, pillar, slat fence and awning stripes all crisp.

### Cost

`perf.mts`, five shots, `q=ultra`, against a run at `95a34c0^`, both
`RULER_VALID: true`: **0 of 5 shots moved by more than the 1.03 ms floor.**
Worst shot `town_forecourt` 6.20 → 6.80 ms, which is 147 fps against a 33 ms
rule. Draws and triangles identical to the digit — this is one fullscreen pass
gaining 12 depth taps and no submissions.

**Read that honestly rather than as "free":** four of the five deltas share a
sign (−0.05, +0.10, +0.30, +0.60, +0.30), so the true cost is probably a real
≤0.3 ms and simply under the ruler. Both runs printed `VERDICT: CONTENDED`
(another lane was running `probe` and `reliefstat`), which is why I am not
quoting a sharper number. There is 26 ms of headroom either way.

`gameplay.mts`: **PASS on every segment**, worst `streaming-traverse` 128.2 fps.
Two frames over 33 ms on `sprint+turn`, on a run whose own footer says `rAF
starved on 17 yields — this page was throttled; the tail below is suspect`. A
fullscreen filter cannot produce two isolated spikes on one segment and nothing
on the other twelve.

---

## Item 3 — the near ring's leaf cards: a measured negative, and the defect moves

The item says the chunkiness is "the alpha map's own texel resolution and mip
chain", and that `alphaRef` is the wrong reference for
`VegTextures.buildAlphaMips` now the cutoff is straddled. Three handoffs carry
that sentence and none carries a number.

**`src/tools/probes/leaftexel.mts` takes the number**: texels per screen pixel,
per triangle, from the geometry's own UVs — `(|duv| * texSize) / screenPx(|dp|)`.

**Do not try this from a bounding box.** I did first, and it answered 0.51
texels/px for `tree_duscae_1_leaf` — a 2× magnification, exactly the story the
item tells. It is wrong by 13×: a crown mesh is dozens of cards merged into one
geometry and each card carries the whole 0..1 UV square, so the box is tens of
times one card. The per-triangle UV length is the card. That near-miss is why
the probe exists rather than an arithmetic note in this file.

`zone_fallgrove`, nearest instance of each kind:

| kind | nearest | texels/px |
|---|---|---|
| `tree_duscae_1_impostor` | 251.4 m | **0.99** |
| `tree_duscae_0_impostor` | 278.1 m | **1.13** |
| `canopy_duscae` (384 px) | 331.1 m | 1.74 |
| `tree_duscae_2_leaf` | 46.8 m | 6.01 |
| `tree_duscae_0_leaf` | 38.7 m | 6.69 |
| `tree_duscae_1_leaf` | 55.4 m | 8.35 |
| `bush_shrub_1_leaf` | 31.2 m | 12.06 |
| `scrub_bracken` | 38.6 m | 13.49 |
| `scrub_fern` | 44.5 m | 38.58 |

**The near ring never magnifies. It is minified 6× to 39×.** It samples mips 3–5
of a nine-level chain and the 256 px canvas already carries six to thirty-nine
times the detail the frame can hold. Texel resolution cannot be the constraint
there and raising it would buy nothing but memory.

**And the "chunky at 8×" does not reproduce.** `tmp/crop/ae/near-b.png`, a near
crown at 8×: soft, fine-grained, no staircase, if anything over-blurred. That
part of the frame has moved on since the sentence was written.

**Where the chain sits at unity is the impostor ring**: 0.74–1.13 texels/px at
210–280 m, on both forest shots. One texel per pixel, mip 0, no supersampling
from minification — the worst case for aliasing in the whole vegetation system,
and it is exactly where the treeline that `edgestat` scores sits. If anyone
picks this defect up again, that is the band to open, not the near ring.

On `alphaRef` itself the round-1 lane's argument stands and I did not disturb
it: a ramp *centred* on `alphaRef` integrates to the same 50% crossing that
`buildAlphaMips`' hard `count(a >= alphaRef)` measures, where three's one-sided
ramp biased it low. No line of `VegTextures.ts` was touched.

---

## The WS-13 "Leide is bare" band — an observation, not a build

The brief asked for a note rather than a system. From the same probe, on
`hero_full`: `bush_sage_0_leaf` reaches in to **9.8 m** and `bush_sage_1_leaf`
to 15.1 m, and the next alpha-carded thing in the frame is
`scrub_shrub_1_card` at **97.5 m**. Nothing with a silhouette occupies
**15–97 m**.

The cheap occupant is already built: `scrub_*_card` is a 128 px two-card scrub,
instanced, alpha-mapped, in the frame already, and only seated from ~97 m out.
Pulling that ring inward costs no new asset and no new material — it is a
seating range, which belongs to the vegetation-LOD lane, not here. Worth
checking the draw-call price first: `vegcensus.mts` prints exactly that.

---

## Measured negatives from today

| hypothesis | probe | result |
|---|---|---|
| a depth mask can take CAS's foliage cost down to what `nocas` shows | measured all three states | **about a third of it.** What survives is CAS sharpening *within* a card — a distant tree is three impostor planes, a mid tree is crossed cards, so the leaf detail is in the alpha and albedo texture and the depth buffer sees one flat surface across it. A depth mask structurally cannot see texture aliasing |
| "is there a depth discontinuity here" is the right mask question | reasoned, then measured | **no** — it is what a roofline is. The first version asked "is the centre a sliver thinner than the kernel", covered 10–16% of canopy, and moved `edge%` 42.14 → 40.75. Total-variation-against-range doubled the coverage and took it to 38.96 |
| an unsigned "differs from the centre by more than k" test is enough | worked the grazing-plane case through by hand before writing it | **it would have softened the whole near ground.** A monotone depth ramp reads as a boundary on both sides. The signs are load-bearing |
| the near ring's leaf cards are magnified, per the bounding box | replaced the box with per-triangle UVs | **wrong by 13×.** See item 3 |
| `alphaRef` should be re-derived for the straddled cutoff | read `buildAlphaMips` against the centred ramp, then measured where the chain actually runs | **no, and the near ring is not where to ask.** Unity is at 210–280 m, not 30–55 m |

---

## Files touched

- `src/engine/postfx/CasPass.ts` — the mask, `edgeSoft`, `tDepth`/`uNear`/
  `uFar`/`uShowMask` uniforms. The pass's docstring carries the whole argument.
- `src/engine/PostFX.ts` — two tokens in `debugToggle`, six lines.
- `src/tools/probes/leaftexel.mts` — new.
- `docs/plans/2026-08-26-opus-the-standing-backlog.md` — the WS-3 result block
  and three negatives rows.
- this file.

**One thing to know about `7120d7f`:** it shows 28 deletions in the backlog that
are not mine. Another lane had a complete, coherent rewrite of §WS-6 sitting
uncommitted in the shared tree when I committed the file, and committing the
*file* swept it in. Nothing was lost or half-written — §WS-6 reads as that
lane's finished closure — but the commit message does not describe those hunks.
Committing an explicit pathspec is not enough on a shared trunk when the path is
a document two lanes are both editing; check `git diff <path>` before the commit
as well as after.

## What I did not do

- **`nanscan` was not re-run.** Nothing I wrote is on a NaN path: no `pow()` on
  a varying, no division that can reach zero (`max(rng, 1e-4)`,
  `max(zc, 1.0)`), and the pass is a fullscreen filter with no vertex data. The
  repo's own note stands anyway — `isnan()`/`isinf()`/`(x>=0||x<0)` are all
  folded away by this backend and only `floatBitsToUint` sees a NaN.
- **No `side`/`DoubleSide` change**, so `probes/facewind.mts` was not needed.
- **`check`**: 18/19 on the first run, failing `anycheck` with 2 `any` in one
  file — another lane's transient uncommitted edit. `anycheck` run directly a
  minute later: **0 in 0 of 588 files**. Nothing in my diff introduces one.

## Shots that show the current state

- `tmp/shots/ae-mask3b/hero.jpg`, `town.jpg` — `?post=casmask`. The argument.
- `tmp/shots/ae-mask2/mask.jpg` — the same on `zone_fallgrove`.
- `tmp/crop/ae/base-edge.png`, `new2-edge.png` — the treeline at 10×, partial
  coverage visible.
- `tmp/crop/ae/ctl2-hero-grass.png` vs `new3-hero-grass.png` — the pair that
  decided `edgeSoft`.
- `tmp/crop/ae/ctl2-hero-head.png` vs `new3-hero-head.png` — what must not move,
  and does not.
- `tmp/crop/ae/near-b.png` — a near crown at 8×, which is soft and not chunky.
- `tmp/shots/ae-ctl2/`, `ae-new3/`, `ae-nocas/`, `ae-nomsaa/` — the four states.

## Exact next steps, in priority order

1. **The impostor ring at 210–280 m is the 1:1 texel band** and is where the
   treeline's residual speckle lives. Nobody has opened it. `leaftexel.mts`
   prints it per shot in one run.
2. **`coverageAA` is still called only from `VegMaterial`.** Fences, foliage
   decals, the town's alpha-cut props, `hh_town_chainlink` (`alphaTest` 0.14,
   1.21 texels/px at 10.6 m in `hero_full`) and every character hair card are
   still binary. The scene target is multisampled for all of them; it is one
   line each. Carried unchanged from round 1, still nobody's.
3. **Character hair is `mips: 0`** on all four heads — `Noctis_hair` 128 px,
   `anisotropy` 16, no mip chain at all, 9.01 texels/px at 5.2 m in `hero_full`.
   That is a minified alpha texture with no minification filter. It belongs to
   the hair lane but nothing in `leaftexel.mts`'s output is louder.
4. **`vista_noon`'s untextured placeholder props** — grey lattice tower, chrome
   sphere, red box. Sixth round running, still nobody's lane.
