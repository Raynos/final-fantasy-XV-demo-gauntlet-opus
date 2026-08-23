# Clouds — silhouette, scale, self-shadowing, march sampling

Owner: the clouds agent (`PORT=5570`).
Branch: worktree off `main`, merged from `main` at the start of the session.
Predecessor: `project/handoff/atmosphere.md`. Read that first — it owns the
*colour* of this system and its numbers are still correct. This picks up the
item it left at the top of its own list.

**The defect this lane was created for is fixed.** "Clouds that are blurry
billboards rather than a rendered layer", named by a blind judge in every round
from 5 to 10, with nobody assigned. It was not the filter, not the march
resolution and not the colour. It was the *size of the clouds*.

---

## The headline

The coverage field's dominant blob was **6.8 km across**. A FFXV fair-weather
cumulus is **1.2–2.4 km**. We were drawing single clouds five times the width of
the reference's, and at 6.8 km per cloud there is nothing inside a 50° field of
view except one cloud's middle: no silhouette in frame, no gaps, no scale
variation with distance, and nothing for the shape volume to carve, because the
shape volume's own features were the same size as the cloud. That is what a
billboard looks like.

Four commits, in dependency order:

| commit | what |
|---|---|
| `a7aabac` | `uCloudTap` / `uCloudTexel` — the composite's blur radius becomes a uniform with ablations. No pixels change. |
| `3ccde18` | Coverage fbm base frequency 4 → 12 cells over the 27 km tile. Weather map 256 → 512. `uCloudBaseTile` 9000 → 4200. LOD ramp steepened. |
| `126272b` | `cloudDensity` stops multiplying by coverage twice. Clear-weather cloud becomes 3.3× optically thicker at the same silhouette. |
| `c95fcaf` | March step aliasing: skip ratio 3.0 → 2.0, entry jitter widened to a full coarse step, `uCloudTap` 1.4 → 0.90. |
| `11ccd18` | Step LOD `t*0.012 cap 300` → `t*0.017 cap 440`, loop 224 → 192. Pays for all of the above and then some. |

**Perf, on a ruler that validated itself both times:**

|  | mean | worst |
|---|---|---|
| baseline this lane inherited | 243.7 | 148 (`poi_reststop`) |
| after the sampling fix, before the LOD ramp | 224.5 | 135 (`poi_reststop`) |
| **shipped** | **248.9** | **165 (`town_shops`)** |

`RULER_VALID: true`. The whole rework is **perf-positive**, and the slowest shot
in the corpus is a town again rather than a sky. `pnpm run check` is **12/12**,
`anycheck` 0.

---

## How each judge phrase maps to a cause

The round-10 judge's exact words were *"clouds that are blurry billboards rather
than a rendered layer — no underlighting, no scale variation, no thinning at the
horizon"*. Three of those four are one bug and it is not the one anybody
guessed.

- **"no scale variation" / "no thinning at the horizon"** — the coverage cell
  size. With clouds at 2.25 km there are dozens in frame at a range of
  distances, so perspective supplies both for free. `type` and `variation` were
  moved with the coverage frequency so they still span several clouds each,
  which is what gives *neighbouring* clouds different heights.
- **"no underlighting" / "no self-shadowing" (round 2's phrasing)** — the double
  coverage multiply. `cov` was used correctly as the low end of the remap that
  produces `e`, and then *again* as a plain multiply on the returned density, so
  a fair-weather sky at coverage 0.30 rendered its cumulus at 30% of nominal
  density: an optical depth of ~6 over a 1 km path where a real cumulus is
  20–100. An optically thin cloud has no interior — the light march never
  saturates, every sample from crown to base returns nearly the same energy, and
  the body prints one flat value. The heavy presets run at coverage 1.0 and were
  unaffected, which is why this survived every review: every preset ever
  scrutinised for its *shape* was a full-coverage one.
- **"blurry"** — partly the composite tap (a 1.4-texel Gaussian carrying a
  comment claiming it did not visibly soften silhouettes; it spans ±3.1 full-res
  pixels and it did), but mostly the same size problem. A 6.8 km cloud in a 50°
  frame is a gradient no matter how you sample it.

Measured before and after, `--raw` so this is the scene buffer before any
tonemap or grade, on `vista_noon`, for the density fix alone:

    hi230%   21.78 -> 14.71
    clip%    17.86 -> 11.77
    sh(R-B)  -18.6 -> -7.8

The cloud got thicker and the blown area got *smaller*. That is self-shadowing
arriving, not exposure moving.

**The atmosphere lane's open item #1 is also closed.** It recorded that nothing
in our frame ever reaches white — four of six shots clipping at exactly 0.00%
where eight of ten `FFXV-field` plates clip ≥ 0.10% — and concluded the fix was
internal dynamic range in the cloud rather than exposure. It was right.
`vista_noon` goes `p99.9` 241.1 → 255.0 and `clip%` 0.00 → 5.64 with the median
essentially unmoved (118.3 → 101.5 is coverage in frame, not exposure). For
scale, the five landscape plates span `clip%` 0.01 to 23.66 and `hi230%` 0.65 to
31.91; our four-shot median of 2.83 / 14.03 sits inside that.

---

## Measured negatives, first class

Six of them, and every one cost a capture-and-look. They are the most valuable
thing in this document.

1. **Marching at full resolution buys nothing.** `MARCH_SCALE` 0.45 → 1.0 is
   4.9× the fill and the frame is CPU-submission bound, so it was affordable. On
   a 2× crop of `vista_noon` it changed almost nothing: same featureless body,
   same absent interior. **If quintupling the sample rate resolves no detail,
   there is no detail to resolve** — that single result is what redirected this
   lane from sampling to content, and it should not be spent again.
2. **The dusk streaking is not god rays.** New `?post=nogodrays` (the pass has
   no `PostFX.debugToggle` token because `Sky` owns its intensity). The streaks
   survive with the pass off. A radial blur from a horizon sun was a good story.
3. **It is not the step budget.** 448 loop iterations instead of 224:
   bit-identical.
4. **It is not the weather-map LOD.** `gCloudLod` forced to 0: bit-identical.
5. **It is not TAA convergence, although TAA is broken here.** `atmDither` is
   interleaved gradient noise, and offsetting its *input* by `uFrame * 3.11`
   advanced the phase by 12.02 per frame, whose fractional part is 0.02 — the
   eight frames a TAA history spans covered a range of 0.16 and averaged eight
   copies of one pattern. That is a real bug and it is fixed (golden-ratio
   sequence on the output). **It removed nothing visible**, which says TAA is
   not accumulating this buffer for some other reason. Unexplained; see below.
6. **Aligning the fine march's miss threshold with the skip probe's changed
   nothing measurable.** Kept because it is correct — a cloud's outer shell
   could sit under the fine threshold (0.0004) and over the probe's (0), and six
   such samples sent the ray back to skipping, which could then step past the
   cloud to a point the probe also read as empty. No measured change on
   `vista_dusk`; do not credit it with the fix.

**And one methodological negative.** `reliefstat.mts`'s ROI is the bottom 36% of
frame — it measures ground, not sky, and it is the wrong instrument for this
lane. `vista_noon` moves `tot` 72.78 → 65.95 on it, which is cloud shadow and
cloud fraction on the mountain face, not cloud form. Do not tune a sky against
it.

---

## The dusk artefact, which is what most of this session went on

With the field at the right scale the deck stopped being a smear, and what came
out from under the smear was a sampling artefact that had been there all along:
horizontal comb-teeth along every silhouette, free-floating horizontal dashes in
clear sky, torn edges across the horizon band. The baseline hid it because a
1.4-texel Gaussian over clouds five times too large has nothing left to alias.

**Cause.** The empty-space skip probe stepped at 3× the fine step with the fine
step capped at 300 m, so the probe interval reached 900 m. The shape volume's
finest features are 100–260 m. Anything narrower than the probe interval was
present or absent depending on where the grid fell, and the grid's phase along
the ray is set by `t0` — the range at which the ray enters the layer — which
varies smoothly down the screen. Whole rows dropped the same feature together.
Hence horizontal.

**The trade that is now load-bearing, and which a future agent will be tempted
to undo.** Narrow entry jitter gives *structured* horizontal banding. Wide entry
jitter gives *unstructured* speckle. Structure reads as an artefact; speckle
reads as cloud, and a small tap filter removes speckle and cannot touch banding.
So the jitter is wide and `uCloudTap` is 0.90 rather than 0. This only works
because the clouds are now the right size: the noise to suppress is 1–4 px and
the silhouettes to preserve are tens of px. **Before the rescale that separation
did not exist**, which is the whole reason the old code had to choose 1.4.

Both ends are capturable from one build: `?post=cloudtap0`, `?post=cloudtapmax`.

**What is left of it.** At 2× — the scale the judge works at — the near and mid
field are clean. A little edge fringing survives on the far horizon band at
dusk. It is much smaller than what it replaced and I stopped there rather than
trade sharpness back for it.

---

## Open, in the order I would take them

1. **Why is TAA not accumulating the cloud buffer?** Negative 5 above proves it
   is not, and fixing the dither's temporal decorrelation did not change that.
   The march writes a jittered half-res buffer with no motion vectors, and the
   field scrolls at `wind` 7.5 m/s — a neighbourhood clamp would reject the
   history every frame. If this were working, the entry jitter would supersample
   the layer 8× for free and the residual dusk fringing would go with it. **This
   is the largest remaining free win in this lane** and it is worth more than
   any further shader tuning.
2. **Ground cloud-shadow patch size, changed as a side effect and not retuned.**
   The bake maps `uShadowTile * shadowScale` metres of cloud field onto a
   `uShadowTile` ground tile, so patch size scales with the coverage cell. Clear
   was tuned with 6.8 km blobs and `shadowScale` 3.5, giving ~1.9 km patches on
   the ground; it now gives ~640 m. That may well be better — FFXV's Duscae
   shadows are a few hundred metres — but it was not chosen and it was not
   measured. `shadowScale` is per preset at `Sky.ts:247/259/269/288`.
3. **`uCloudSunGain` was not retuned after the density fix.** The atmosphere
   lane set 0.26 to bring a *thin* deck's raw body to `#e3e9ea`, under white.
   The deck is now 3.3× thicker and `vista_noon` reads 11.77% raw clip. That is
   inside the plate corpus's own spread and the median is right, so I left it —
   but if a future round says the sky is hot, this is the number, and it is
   overwritten every frame by `Sky._applyTimeOfDay` (trap 7), not by the
   constructor.
4. **`hi(R-B)` on our daylight shots is +8.2 (`zone_longwythe`) where the
   landscape plates run −24 to −66.** FFXV's cumulus are markedly blue-white.
   The atmosphere lane's grade work moved this a long way and the remaining gap
   is real. Its `highGate` is the mechanism.
5. The other three weather presets' cloud numbers were checked by eye
   (`vista_overcast`, `storm`, `daycycle_dawn`, `vista_dusk` all captured and
   read) and none regressed — the overcast lid keeps its ribbing and thin
   luminous patches, the storm cell keeps its silhouette. None were *retuned*
   for the new cell size.

---

## Instruments added

| token | what |
|---|---|
| `cloudtap0` | `uCloudTap = 0` — the composite collapses to one bilinear fetch |
| `cloudtapmax` | `uCloudTap = 1.4` — the radius the tree shipped with |
| `nogodrays` | god rays off. Lives in `Sky`, not `PostFX`, because `Sky` owns the intensity |

## Files touched

- `src/world/sky/CloudTextures.ts` — weather-map frequencies and resolution.
- `src/world/sky/Clouds.ts` — skip ratio, entry jitter, step LOD, loop bound,
  miss threshold, dither decorrelation, `uCloudTexel` write.
- `src/shaders/clouds.glsl.ts` — the double coverage multiply.
- `src/shaders/sky.glsl.ts` — the upsample filter.
- `src/world/Sky.ts` — `uCloudTap` / `uCloudTexel`, `uCloudBaseTile`, the three
  ablation tokens.

Nothing in `src/world/terrain/`, `src/world/props/` or `src/characters/`.

## Shots

- `tmp/shots/cl-base-png/` — the baseline this lane started from.
- `tmp/shots/cl-ab/` — the state it ends at, four daylight landscape shots.
- `tmp/shots/cl-tod2/` — `vista_overcast`, `storm`, `daycycle_dawn`,
  `zone_longwythe`, the time-of-day regression check.
- `tmp/c1.jpg` / `tmp/c21.jpg` — the same `vista_noon` sky crop at 2×, before
  and after. `c1` is the smear six judges called a billboard.
- `tmp/c8.jpg` … `tmp/c20.jpg` — the dusk artefact hunt at 4×, in order.
- `tmp/ab/r11x/` + `KEY.json` — blind round 11, four real pairs and three
  plate-vs-plate controls.
