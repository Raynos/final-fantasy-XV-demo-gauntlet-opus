# Alpha edges — the blind judge's round-5 number one

Owner: the alpha-edges agent (`PORT=5500`).
Branch: `worktree-agent-ace74adb2d32d4fe9`, merged up from `main` at `6b61bec`
(**the worktree was created 200 commits behind, and with no `node_modules` and
no `src/public/` at all** — that is now four agents in a row; check
`git rev-list --count HEAD..main` before anything else, and expect to run
`npm install` and `mkdir -p src/public` before the baked-cache symlink will
take).
Predecessor: `project/handoff/vegetation.md`, whose final section is this
lane's whole brief. Also load-bearing: `project/handoff/perf.md`, which is why
this fix was affordable at all.

**Status: fixed, measured, priced, and blind-tested.** Silhouette step size at
the treeline is down 26% at p90 and the speckle — the isolated texels the judge
named twice — is down 89%. The frame-time cost is **below the ruler's own noise
floor on all five shots measured**, on a run that certified itself. `check` is
11/11 and determinism is unchanged. In blind round 6 the defect fell from the
judge's number one to its number nine, and changed subject on the way down.

---

## What the edges actually were

`tmp/crop/base-edge.png`, `zone_fallgrove`'s treeline against the sky at 8×
nearest-neighbour. Every leaf boundary is one full-contrast step from canopy to
sky. There is no partial coverage anywhere in the crop: a pixel is either
foliage or it is sky, and single texels sit out in the sky with nothing
touching them. The judge's sentence, verbatim, was *"aggressive alpha-cutout
with speckled, dithered edges eating the silhouette"*, and it is precise.

It is invisible at 1× and unmissable at 8×, which is exactly why five rounds of
lanes walked past it.

---

## What fixed it

`alphaToCoverage` on every alpha-tested opaque vegetation material, plus MSAA
on the scene target to give it somewhere to write, plus a rewrite of three's
coverage ramp because three's own is one-sided.

**Each of the three is inert without the others.** That is the thing to
remember before touching any one of them.

### 1. `3237976` — `PostFX.rtScene` gains `samples`

`alphaToCoverage` turns a fragment's alpha into a *sample mask*. On a
single-sample target that is still one bit, so the material flag alone is a
no-op — which is why the vegetation lane could not land this from inside its
own directory, and was right to hand it over rather than half-attempt it.

Tiers: `low` 0, `medium` 2, `high` 4, `ultra` 8. `?post=nomsaa` forces 0 and is
the ablation the whole change is graded against. The token is read in
`_wantSamples` during the constructor rather than in `debugToggle`, because
`debugToggle` runs *after* the target is built and a token that arrived too
late to change the sample count would ablate nothing and read as "MSAA does not
matter" — a trap worth one sentence because it would have produced a confident
and completely wrong negative.

**The shared depth texture turned out not to be the obstacle it looked like.**
The handover flagged `rtScene.depthTexture` being shared with `rtVel` as a
known three limitation. In r185 it is not one: `updateMultisampleRenderTarget`
blits `COLOR_BUFFER_BIT | DEPTH_BUFFER_BIT` from the multisampled framebuffer
into the single-sample attachments whenever `resolveDepthBuffer` is set, which
it is by default, and `renderer.render()` calls it at the end of every render
into a multisampled target. So GTAO, SSR, DoF, motion blur, contact shadows and
the bloom's depth read all keep sampling exactly the textures they sampled
before, and `rtVel` — single-sampled, colour-cleared only, depth-testing movers
against the scene's depth — attaches the *resolved* texture and never touches
the multisample buffer. Nothing in `src/engine/postfx/` needed a line changed.

### 2. `1245d14` — straddle the cutoff

three's alpha-to-coverage chunk is

    a = smoothstep(alphaTest, alphaTest + fwidth(a), a)

and it starts the ramp **at** the cutoff. A texel sitting exactly on
`alphaTest` — the middle of the silhouette, by definition — therefore reports
*zero* coverage. Half of every leaf boundary was still resolving to a hard
binary step with the samples sitting there unused, and the silhouette eroded
inward by half a ramp width on top of that, which is the "eating the
silhouette" half of the complaint arriving from the fix itself.

`patchVeg` rewrites `<alphatest_fragment>` for the `ALPHA_TO_COVERAGE` path
only, to a ramp centred on the cutoff:

    float vegAw = max(fwidth(diffuseColor.a), 0.06);
    diffuseColor.a = smoothstep(alphaTest - vegAw, alphaTest + vegAw, diffuseColor.a);

**The centring is the whole win; the floor is insurance.** Raising the floor
0.06 → 0.11 is the same picture to three significant figures (treeline p90 72.7
→ 72.3, near crown 100.2 → 99.9), so `fwidth(a)` already exceeds it everywhere
the graded shots put a leaf. It is kept because `fwidth(a)` is the alpha map's
slope *in pixels*: on a card magnified close to the camera it collapses toward
zero and the ramp would close back into a binary test at exactly the distance
where each leaf is biggest on screen.

---

## The numbers

`src/tools/edgestat.mts` is new and is the instrument for this defect.
`reliefstat.mts` structurally cannot grade it: it measures RMS contrast per
octave, and a binary edge and a coverage-antialiased one carry nearly the same
energy. What separates them is how that energy is *distributed across
neighbouring pixels*. So, per ROI, on luminance:

- **edge%** — pixels whose largest 4-neighbour difference is ≥ 8/255.
- **hard%** — of those, the fraction stepping ≥ 48/255 in one hop.
- **p50 / p90** — the step-size distribution of the edge pixels themselves.
- **speck** — per 10 000 px, texels differing from *all four* neighbours by
  ≥ 24 in the same direction. This is the "speckled, dithered" half, and a
  coverage resolve structurally cannot produce one.
- **mid%** — pixels sitting between the two Otsu classes. Partial coverage
  *is* this band.

`zone_fallgrove`, four states of the same frame:

| roi `1150,350,120,68` (treeline) | edge% | hard% | p90 | speck | mid% |
|---|---|---|---|---|---|
| binary cut (`--ablate nomsaa`) | 53.9 | 21.9 | 97.5 | 34.7 | 5.75 |
| baseline as inherited | 53.5 | 22.0 | 98.2 | 36.0 | 5.66 |
| `samples: 4`, three's ramp | 51.4 | 23.3 | 86.5 | 15.4 | 7.32 |
| `samples: 4`, centred ramp | 53.5 | 20.6 | **72.7** | 10.3 | 8.37 |
| `samples: 8`, centred ramp | 53.7 | 20.1 | **70.2** | **3.9** | 8.45 |

| roi `900,355,400,90` (the whole treeline) | p90 | speck |
|---|---|---|
| baseline | 73.2 | 16.3 |
| `samples: 4`, three's ramp | 69.4 | 8.0 |
| `samples: 4`, centred ramp | 59.5 | 7.1 |
| `samples: 8`, centred ramp | **58.1** | **4.9** |

| roi `260,250,120,68` (a near crown) | p90 | speck |
|---|---|---|
| baseline | 137.6 | 24.4 |
| `samples: 4`, centred ramp | 100.2 | 12.8 |
| `samples: 8`, centred ramp | **100.9** | **2.6** |

Read the last two rows of each together: **4 → 8 barely moves the step size and
more than halves the speckle.** The ramp is about two pixels wide either way,
so the *edge* is as soft as it is going to get at 4 — but a single leaf lands
on the tail of the coverage distribution, where five quantisation levels show
and nine do not. `ultra` is the tier every graded capture and every `perf.mts`
run uses, so that is the tier this defect is judged on and it gets 8.

`zone_nebulawood`, foliage against the pale cliff face (`950,60,400,200`):
speck 6.0 → 3.7, p90 27.1 → 25.8. Against the sky (`250,285,450,80`): speck
41.8 → 37.8, p90 83.1 → 72.2.

---

## `reliefstat`, and why this time it *can* grade the lane

The vegetation lane recorded that `reliefstat.mts` scored its crown-normal fix
*worse*, and drew the right general conclusion: it is a detail-**density**
instrument and that was a **coherence** defect. This one is neither. It is a
defect that lives entirely in the finest band, and `reliefstat`'s own header
says so — *"aliasing, dither and JPEG mosquito noise all read as `d1` energy"*.
Excess `d1` **is** this defect, which makes `d1` the signal here rather than the
warning it usually is.

Canopy-band ROI (`--roi 0.08,0.36,0.84,0.26`), before and after, both forest
shots, against `FFXV-ground`'s 8.58 at `d1`:

| | d1 | d2 | d4 | d8 | d16 | d32 | d64 |
|---|---|---|---|---|---|---|---|
| `zone_fallgrove` before | 11.38 | 12.69 | 13.34 | 15.69 | 20.30 | 25.29 | 73.86 |
| `zone_fallgrove` after | **9.54** | 11.58 | 12.82 | 15.40 | 20.18 | 25.34 | 73.69 |
| `zone_nebulawood` before | 14.66 | 13.13 | 14.03 | 15.90 | 17.64 | 28.31 | 62.18 |
| `zone_nebulawood` after | **11.98** | 11.63 | 12.88 | 14.99 | 17.04 | 27.72 | 60.94 |

**`d1` down 16% and 18%; every band from `d4` up moves by less than 4% and in
both directions.** `zone_fallgrove` goes from 133% of the reference's `d1` to
111%, `zone_nebulawood` from 171% to 140%. That is the exact signature of
removing one-pixel aliasing and nothing else: the finest octave loses the
energy that was never a feature, and the bands where the eye reads *material*
keep every point they had. `d4` 109%, `d8` 107%, `d16` 106% of the reference,
unchanged.

This is worth writing down as the general form: **the instrument that grades a
lane is the one whose axis the defect actually lies along.** `reliefstat` could
not see a coherence defect and can see this one exactly, for the same reason.

---

## `?post=nocas` — the ablation that says what is left

The rule got applied and it paid. Run at `samples: 4`:

| | edge% | hard% | p50 | p90 | speck |
|---|---|---|---|---|---|
| MSAA, CAS on | 51.4 | 23.3 | 14.4 | 86.5 | 15.4 |
| MSAA, `nocas` | 26.9 | 33.2 | 30.9 | 79.4 | 7.7 |
| no MSAA, `nocas` | 27.0 | 36.9 | 28.4 | 99.2 | 3.9 |

Two findings, and the second is a live lead for whoever takes this next.

- **The MSAA-versus-not comparison is clean with CAS out of the way**: same
  edge-pixel count (26.9 vs 27.0), p90 down 99.2 → 79.4, hard% 36.9 → 33.2.
  That is antialiasing and nothing else — the silhouette occupies the same
  pixels and steps across them in smaller jumps.
- **CAS doubles the apparent edge-pixel count and doubles the speckle.**
  `tmp/crop/nocas-edge.png` at 8× is a visibly cleaner treeline than anything
  with CAS on. `cas.sharpness` is 0.38–0.45 and the pass is the very last thing
  in the chain, so it re-sharpens the coverage-resolved edge the rest of the
  pipeline just spent bandwidth softening. **I did not change it**, because
  sharpness is a look decision that belongs to whoever owns the grade and
  because a frame with CAS off is measurably softer everywhere, not just at
  foliage. It is the largest remaining term in this defect and it is one
  constant.

  Note the dither is *not* the carrier: it is ±0.5/255, an order of magnitude
  below the 24/255 the speckle statistic counts. It is the sharpen.

### I tried to turn CAS down and stopped, with the measurement

`CasPass.ts` *is* this lane's file, so this was mine to change and I nearly
did. The band analysis makes the case look overwhelming — CAS on against CAS
off, canopy ROI on the two forest shots and a 0.2,0.15,0.6,0.7 ROI on
`hero_full` and `town_forecourt`:

| | d1 | d2 | d4 | d8 | d16 | d32 |
|---|---|---|---|---|---|---|
| `zone_fallgrove` CAS on | 9.54 | 11.58 | 12.82 | 15.40 | 20.18 | 25.34 |
| `zone_fallgrove` CAS off | **7.37** | 10.31 | 12.27 | 15.20 | 20.12 | 25.33 |
| `zone_nebulawood` CAS on | 11.98 | 11.63 | 12.88 | 14.99 | 17.04 | 27.72 |
| `zone_nebulawood` CAS off | **7.68** | 9.98 | 12.26 | 14.79 | 17.00 | 27.70 |
| `hero_full` CAS on | 14.75 | 14.57 | 16.22 | 17.85 | 20.84 | 23.35 |
| `hero_full` CAS off | **10.67** | 12.84 | 15.61 | 17.67 | 20.78 | 23.36 |
| `town_forecourt` CAS on | 10.11 | 11.30 | 12.68 | 15.74 | 17.16 | 21.70 |
| `town_forecourt` CAS off | **7.90** | 10.11 | 12.29 | 15.62 | 17.15 | 21.72 |

**CAS is a `d1`/`d2` generator and nothing else, on every shot in the game.**
It adds 2.2–4.3 points at `d1`, 1.2–1.7 at `d2`, about 0.5 at `d4`, 0.15 at
`d8` and literally nothing above — and with it off the median `d1` across the
four lands on **8.61 against `FFXV-ground`'s 8.58**, dead on the reference,
where with it on the forest shots sit 11–40% over.

**And I still did not change it, for two reasons that are both in writing
already.**

- `reliefstat`'s own header says *"our captures are PNG and the plates are
  JPEG, so the reference's `d1` is if anything understated — never claim a win
  on `d1` alone"*. Landing a look change on a `d1` match is the exact claim it
  warns against.
- I looked. `tmp/crop/hero-cas.png` against `tmp/crop/hero-nocas.png` at 4×:
  the roof edge, the path stones and the shrub all lose real definition with
  CAS off. It is not subtle and it is not foliage.

So the honest finding is a **trade, not a defect**: CAS's benefit and CAS's
cost live in the *same octave*, and the pass cannot tell a real edge at that
scale from sub-pixel canopy. Turning it down globally buys a cleaner treeline
by softening every roofline and every stone in the game. A spatially varying
sharpness — back off where the local depth gradient is large, or where the
neighbourhood is high-frequency in a way that says "many surfaces per pixel" —
is the fix that does not pay that price, and it is a real piece of work with a
look decision inside it rather than a constant. Handed over rather than
half-attempted, with the numbers above and the crops to argue from.

---

## Cost

Triangles and draw calls are **unchanged on every shot** — MSAA adds no
geometry and no submissions, which matters because
`project/handoff/perf.md` establishes that this frame is CPU-submission-bound
at ~8.7 µs per draw call and that draw count explains 80% of frame-time
variance. What MSAA spends is bandwidth and fill, the half of the budget the
game uses least.

**8× MSAA on the scene target is free, and that is a certified measurement.**
Five shots, `q=ultra`, both passes inside one quiet window, `RULER_VALID: true`
on both. `perf.mts` has no `--ablate`, so the second pass was taken with
`_wantSamples` forced to return 0 — `?post=nomsaa` cannot be reached from that
harness.

| shot | `samples: 8` | `samples: 0` | Δ | draws | tris |
|---|---|---|---|---|---|
| `zone_fallgrove` | 4.10 ms | 4.85 ms | −0.75 | 584 | 7 777 679 |
| `zone_nebulawood` | 4.85 | 5.45 | −0.60 | 610 | 8 305 778 |
| `zone_vannath` | 5.20 | 5.80 | −0.60 | 655 | 8 276 469 |
| `vista_noon` | 4.70 | 3.80 | +0.90 | 511 | 7 500 259 |
| `town_forecourt` | 8.05 | 7.20 | +0.85 | 956 | 9 830 648 |
| mean | **195.8 fps** | 192.6 fps | | | |

**`perf.mts`'s own verdict: "0 of 5 shots moved by more than the 0.98 ms
floor."** The deltas do not even share a sign — three shots came out *faster*
with MSAA on — which is what a change that is genuinely below the floor looks
like. Read the differences as noise, not as a result, in both directions.
Draw calls and triangles are identical to the digit either way, because MSAA
adds no submissions and the frame is CPU-submission-bound end to end
(`cpu == ms` on every row above).

`gameplay.mts --baseline`, same window, `RULER_VALID: true`, noise floor
0.53 ms: **PASS on every segment**, worst `streaming-traverse` at 88.9 fps.
Four segments moved by more than the floor and **all four moved faster** —
`combat` 8.0 → 5.3, `warp-strike` 6.6 → 5.2, `streaming-traverse` 15.4 → 11.3,
`day-night-sweep` 11.3 → 7.2. None of those is this lane; they are other lanes'
merged work showing up against a baseline taken before them. Worth recording
that **`day-night-sweep`, item 2 on `perf.md`'s open list at 11.3 ms and 11%
over budget, is now 7.2 ms and 139.9 fps.**

This is the number the vegetation lane could not take and the one the brief
predicted: the frame budget is five times what every lane before `perf.md`
believed, and MSAA spends bandwidth and fill, which is the half of it the game
uses least.

---

## What did not break

- **Determinism.** Two cold captures of `zone_fallgrove` diff at **0.320
  mean/255**, against the closed-out figure of 0.340 mean over a 0.302 floor.
  MSAA did not threaten it — the resolve is a deterministic blit.
- **Foliage shadows.** three substitutes `alphaTest = 0.5` in the shadow depth
  material for any material with `alphaToCoverage` set, so every foliage
  shadow's cutoff moved from 0.35–0.45 to 0.5. `tmp/crop/base-shadow.png`
  against `tmp/crop/r6-shadow.png` at 4× shows no thinning; the whole-frame
  diff is 2.412 mean/255 over 5.9% of pixels and is concentrated on foliage
  *edges*, not on shadow area. Worth knowing about rather than worth acting on,
  but it is a real coupling: **anything given `alphaToCoverage` here silently
  changes its own shadow silhouette.**
- **`npm run check`: 11/11**, `anycheck` 0. `combatloop` 31/31, `uxcheck`
  93/93, `horizoncheck` PASS at worst MCC 0.766 (unchanged), `integration`,
  `creaturecheck`, `roadcheck`, `heightcheck`, `driftcheck`, `orphans`, `build`
  all PASS. `npm run typecheck` and `typecheck:tools` clean.

---

## Blind A/B round 6 — `tmp/ab/r6/`, six pairs

The same six shots as round 5, `compare.mts`'s own printed question verbatim,
no added instructions, sealed key, a judge that read nothing but the six
composites.

**6 identified, 0 fooled, 0 hesitated, all six HIGH. Score 3.5/10**, against
3/10 in rounds 3, 4 and 5 and 4.5/10 in round 2. **The win rate and the
hesitation rate did not move. Again.** Six rounds now.

**What did move is the thing this lane was sent for.**

| round 5 | round 6 |
|---|---|
| **1. "Billboard/cutout vegetation. Flat crossed cards with *hard alpha edges*… aggressive alpha-cutout with speckled, dithered edges *eating the silhouette*"** | **1. terrain material — "one stretched texture over smooth extruded forms… nothing reads as rock vs dirt vs path"** |
| 3. terrain material | 2. no ambient occlusion or contact shadowing — "objects sit *on* the ground rather than *in* it" |
| 2. grounding / AO | 3. foliage is unlit alpha-cut billboards — "2–3 crossed planes… identical silhouettes repeated, no self-shading or translucency" |
| (not cited) | 4. shadows hard, opaque black, no penumbra — "holes punched in the grass" |
| 6. sky as a flat layer | 5. sky and clouds painted on, visibly tiling |
| 7. aerial perspective | 6. no aerial perspective |
| 4. primitive geometry in the silhouette | 7. flat silhouette landmarks — the city and the meteor are untextured cutouts |
| — | 8. no ground clutter at the 0–1 m scale |
| — | **9. "aliased geometry edges against sky"** |

**Round 5's number one is round 6's number nine, and it changed subject on the
way down.** What is left at 9 is *"terrain ridges shimmer-crisp"* — the
terrain silhouette, which is not alpha-tested, is not this lane's change, and
is not fixed by coverage AA. The words "speckled", "dithered" and "eating the
silhouette" do not appear anywhere in round 6. What survives about foliage is
at 3 and is explicitly about *silhouette variety and self-shading* — "identical
silhouettes repeated, no self-shading or translucency" — which is the
vegetation lane's ground, not the alpha cut.

Take the usual caution with this: the ranking is one judge on one round, and
five rounds of history say the *order* reshuffles freely while 6/0/0 does not
budge. The defect leaving first place is consistent with the `edgestat` numbers
and with the crops, but it is corroboration, not proof.

The two lines the judge now leads with — terrain material, and AO/contact
shadowing — are both flagged in `vegetation.md` and `shadows.md` as somebody
else's ground, and both have been climbing for three rounds.

---

## Files touched

- `src/engine/PostFX.ts` — `samples` field, the `rtScene` option,
  `_wantSamples`, the `nomsaa` token in `debugToggle`.
- `src/world/veg/VegMaterial.ts` — `coverageAA`, called from both
  `registerAlphaCard` and `patchVeg`; the `<alphatest_fragment>` rewrite.
- `src/tools/edgestat.mts` — new.
- this file.

Nothing under `src/engine/postfx/` needed changing, and **no other lane's file
was touched at all**. The vegetation-LOD lane is live in `src/world/veg/` for
LOD ranges and densities; the only file shared is `VegMaterial.ts` and the only
part of it touched is the alpha path.

---

## Measured negatives, in full

| hypothesis | probe | result |
|---|---|---|
| TAA's history clamp is why foliage edges are hard | inherited: `--ablate notaa`, paired | **false**, and not re-derived. TAA moves 5.94/255 over 18% of pixels and visibly softens the edges. Insufficient, not absent. |
| `rtScene`'s shared `depthTexture` blocks MSAA | read three r185's `updateMultisampleRenderTarget` | **false in r185.** Depth is resolved into the depth texture alongside colour. No pass needed a change. |
| a wider coverage ramp keeps helping | floor 0.06 → 0.11, captured both | **no.** Identical to three significant figures. `fwidth(a)` is the binding term at these distances, not the floor. |
| `samples: 8` is the same picture as 4 for more bandwidth | captured both | **half true, and the half that is false is the one that matters.** Step size the same (72.7 → 70.2); speckle 10.3 → 3.9 and 12.8 → 2.6. |
| the "dithered" in the complaint is CAS's ordered dither | it is ±0.5/255 | **false.** The dither is 48× below the threshold the speckle statistic counts. It is CAS's *sharpen*, which doubles both the edge count and the speckle. |
| turning CAS's sharpness down is the next win | banded it on four shots, then looked at `hero_full` at 4× | **a trade, not a win.** CAS's benefit and its cost are the same octave. `d1` lands on the reference with it off, and the roofline, path stones and shrubs visibly soften. Not landed. |
| a coverage-preserving mip chain is a fix still to build | read `VegTextures.buildAlphaMips` | **it already exists and is good.** Every card's chain binary-searches an alpha scale per level to hold the level-0 coverage at the material's own `alphaRef`, capped at one stop, with `tinyFade` for the sub-8 px levels. This was on the list of alternatives to try; it was built two lanes ago. |

One thing that *did* need checking and came out clean: `buildAlphaMips`
estimates coverage with a hard `count(a >= alphaRef)`, which was the exactly
right model when the shader did a binary test. It still is — arguably more so.
A ramp **centred** on `alphaRef` integrates to the same 50% crossing the binary
count measures, where three's one-sided ramp biased the true coverage below it.
So the mip chain did not need re-deriving against the new ramp, and no line of
`VegTextures.ts` was touched.

---

## Exact next steps, in priority order

1. **A spatially varying CAS sharpness.** The full measurement is in the
   section above, including why turning the constant down is *not* the answer
   and what it costs when you look at the frame. CAS is the largest remaining
   term in this defect — it doubles the residual speckle and is the entire
   source of the frame's excess `d1` — but its benefit is in the same octave as
   its cost, so the lever has to be spatial rather than scalar. `fx.rtScene`'s
   depth texture is already bound by four other passes and is the obvious input.
2. **The near ring's leaf cards are still chunky at 8×** —
   `tmp/crop/ramp-near.png`. That is not an AA defect any more, it is the alpha
   map's own texel resolution and mip chain. `VegTextures.ts` already builds a
   coverage-preserving mip chain against `alphaRef`; with the cutoff now
   *straddled* rather than tested, that `alphaRef` is arguably the wrong
   reference and should be re-derived. Carried from `vegetation.md` §3.
3. **Everything else that is alpha-tested is still binary.** `coverageAA` is
   called only from `VegMaterial`, so vegetation and `props/Debris.ts` (which
   imports `patchVeg`) have it and nothing else does. Fences, foliage decals,
   the town's alpha-cut props and any character card do not. The scene target
   is multisampled for all of them now, so this is one line each and the
   silhouette work is already paid for.
4. **`vista_noon`'s untextured placeholder props** — a grey lattice tower, a
   chrome-black sphere, a red box. Flagged after round 2, still ending the
   judge's guess in round 5, still nobody's lane. Fifth round running and still
   the cheapest remaining point in the environment.

---

## Shots that show the current state

- `tmp/crop/base-edge.png` vs `tmp/crop/ramp-edge.png` — the treeline at 8×
  before and after. The pair that carries the argument.
- `tmp/crop/msaa4-edge.png` — MSAA with three's stock one-sided ramp, i.e. the
  half-finished version, kept because it is the state most worth not stopping
  at.
- `tmp/crop/msaa8-edge.png` — the shipped `ultra` state.
- `tmp/crop/nocas-edge.png` vs `tmp/crop/nomsaa-nocas-edge.png` — the clean
  MSAA-versus-not comparison with the sharpen out of the way.
- `tmp/crop/base-near.png` vs `tmp/crop/ramp-near.png` — a near crown, 8×.
- `tmp/crop/hero-cas.png` vs `tmp/crop/hero-nocas.png` — `hero_full` at 4×,
  with and without the sharpen. The pair that stopped me turning CAS down.
- `tmp/shots/base/` (as inherited) vs `tmp/shots/r6/` (now).
- `tmp/ab/r6/` — blind round 6, six pairs, sealed key.

---

## My honest grade for the environment, against shipped FFXV

**4 / 10.** The same number the shadows and vegetation lanes gave, and like the
vegetation lane I am not claiming its point back and adding one of my own.

What this lane was sent to fix is fixed and it was fixed by measurement. The
judge's round-5 number one, the sentence that named this defect three different
ways in one clause, is not in round 6's list at all; what is left of it is at
number nine and is about terrain ridges. The silhouette step size at the
treeline is down 26% at p90, the speckle is down 89%, the crops at 8× are a
different picture, `check` is 11/11, determinism is unchanged and no other
lane's file moved.

What keeps it at 4 is that 6/0/0 has not moved in five rounds, and this round
did not move it either — the judge identified every panel in under a second and
said so. The three lines it now leads with (terrain material, ambient
occlusion, foliage silhouette variety) are each somebody else's ground and each
has been climbing for three rounds, which is the same reading the vegetation
lane arrived at: the ranking reshuffles because the lanes are hitting real
things, and the win rate does not move because the gap is not one defect deep.

The specific caution I would leave for whoever takes the next one: **the thing
I fixed was invisible at 1× and unmissable at 8×, and it survived five rounds
because nobody magnified the frame.** The judge could see it at 1× as a
*texture* — "speckled" — without being able to say what it was. If a defect
keeps being described in words that do not match any system you own, magnify
before you re-tint.
