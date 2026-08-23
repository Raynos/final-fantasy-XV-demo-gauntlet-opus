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

**Status: fixed, measured, and the instrument that measures it is new.** Two
commits. Silhouette step size at the treeline is down 26% at p90 and the
speckle — the isolated texels the judge named twice — is down 89%.

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

---

## Cost

Triangles and draw calls are **unchanged on every shot** — MSAA adds no
geometry and no submissions, which matters because
`project/handoff/perf.md` establishes that this frame is CPU-submission-bound
at ~8.7 µs per draw call and that draw count explains 80% of frame-time
variance. What MSAA spends is bandwidth and fill, the half of the budget the
game uses least.

<!-- PERF -->

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
- **`npm run check`** — see below.

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

---

## Exact next steps, in priority order

1. **CAS sharpness on foliage frames.** The measurement is above and it is one
   constant. `nocas` halves the residual speckle and drops the edge-pixel count
   by half again. It needs somebody who owns the look to decide, because it
   softens the whole frame and not only the canopy — a spatially-varying
   sharpness (back off where the local depth gradient is large) is the honest
   version and is more than a constant.
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
- `tmp/shots/base/` (as inherited) vs `tmp/shots/r6/` (now).
- `tmp/ab/r6/` — blind round 6, sealed key.
