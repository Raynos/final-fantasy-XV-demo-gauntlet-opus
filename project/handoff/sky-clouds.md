# Handoff — sky, clouds, weather, grade, exposure

`src/world/sky/`, `src/world/weather/`, `src/shaders/post/grades.ts`, and (added
by the coordinator's fourth handover mid-session) `src/engine/postfx/Exposure.ts`.

Session 2026-08-28. Branch `main`. Everything below is committed.

## What landed

| sha | what |
|---|---|
| `abb11ac` | aerial perspective's converged colour: rise 0.10 -> 0.03, zenith mix 0.12 -> 0.05 |
| `e8529a3` | revert of a haze cut that traded the range columns for the colour ones |
| `c757019` | `uAmbBury`'s two defects + the `?post=nocloudjitter` instrument |
| `a432996` | the exposure meter stops voting with the dark + `probes/expmeter.mts` |
| `f2fabc5` | all four grade `key`s +20%, the level half of `a432996` |

## The eight-shot day slice, against `FFXV-field`

`zone_longwythe zone_three_valleys zone_vannath zone_fallgrove vista_noon
daycycle_noon zone_mencemoor zone_taelpar`, `--jpeg`, `imagestats --against
FFXV-field`. This is the series to continue.

|  | at session start | shipped | FFXV-field |
|---|---|---|---|
| `R-B` | -17.0 | -17.9 | -8.5 |
| `sh(R-B)` | -9.8 | **-5.1** | +5.8 |
| `hi(R-B)` | -19.7 | -20.7 | -13.5 |
| `meanL` | 109.8 | **104.4** | 102.3 |
| `p0.1` | 0.8 | **1.8** | 3.4 |
| `p50` | 92.6 | **95.0** | 100.9 |
| `hi230%` | 8.84 | **5.19** | 6.20 |
| `clip%` | 1.12 | **0.20** | 0.50 |
| `sat%` | 33.1 | 33.6 | 29.5 |
| `stops` | 11.52 | **10.74** | 9.79 |

Seven of eleven columns improved, two (`R-B`, `hi(R-B)`) moved about a level the
wrong way. `sh(R-B)`, which is the handover that was routed here, closed 4.7 of
its 15.6-level gap without a single re-tint.

## The four handovers

### 1. `zone_vannath`'s foreground under a cloud shadow at luma 13/255 — OPEN

Not addressed. The frame is better (foreground band is no longer murky at the
new exposure) but the mechanism is untouched. What is known and what the next
lane should not re-derive:

- `clear`'s `shadowScale` 3.5 maps 9.45 km of cloud field onto a 2.7 km ground
  tile, so ground patches are ~640 m where the clouds casting them are 2.25 km.
  The magnification is left over from before `3ccde18` shrank the clouds 3x.
  **The patches are 3.5x smaller than their own clouds and that is a bug**, but
  taking `shadowScale` to 1.0 puts about one patch in the whole visible world,
  which is worse, so it needs the tile size moved as well, not the scale alone.
- The depth is roughly physical: the shadowed band is 26% of the sunlit band in
  linear, where a real cumulus shadow under a clear sky is about 11%. So the
  shadow is if anything **too shallow**, and what reads as wrong is the duty
  cycle and the framing, not the strength. Do not deepen it.

### 2. `?post=noaerial` closes the whole `sh(R-B)` gap by crushing the quartile cut — PARTLY LANDED

The finding reproduced exactly and it is real: with aerial perspective off and
exposure pinned, `zone_mencemoor`'s near massif reads luma **0** and the
Meteor's body **3**. Every level of value in that frame's dark half is
inscatter.

What was wrong with the inscatter, measured rather than judged. `?post=aerialmax
--ablate noexp` on `zone_vannath` read the converged colour at **#99bbd2, luma
182, R-B -57**, while the sky band directly above the same ridge in the same
frame reads **#c3d6d9, luma 210** and `ART-DIRECTION.md` §2's measured FFXV
ridge is **#bad2e4, luma 206**. The term was landing 24 levels under the
reference and 28 under the sky it is supposed to join.

The 0.10 elevation rise and the 0.12 zenith mix were the residue of the navy bug
`297bd09` fixed, kept on the argument that "a few kilometres of ground haze is
not the infinite column the horizon sample integrates". That does not survive
arithmetic: `uHazeBase` is 2.4e-4/m against the sky LUT's own near-ground
extinction of about 3.4e-5/m, so **our haze is seven times the atmosphere the
LUT integrates** and four kilometres of it *is* optically the horizon column.
`abb11ac` takes the rise to 0.03 and the mix to 0.05; converged colour is now
**#c4d5d6, luma 209, R-B -18**.

Still open: `hi(R-B)` is -20.7 against -13.5 and `R-B` -17.9 against -8.5. Both
are sky-fraction-confounded columns (our vistas are 40-60% sky against the
plates' 20-25%) and neither should be chased with a tint before somebody builds
a sky-matched reference slice.

### 3. `zone_mencemoor`'s bare corrugated massif — NOT MINE, and here is why

The frame is 4 stops short: **6.92 stops against `FFXV-field`'s 9.79**, with
`p0.1` at 21.8 where every other shot in the slice is under 9. Nothing in it is
dark. `?post=noaerial` takes it to 11.69 stops and the massif reads as warm rock
with sunlit crests, so it is tempting to call the haze guilty.

It is not, and the arithmetic says so. The bottom of that frame is **434 m**
from a camera at 286 m altitude (42° fov, target 107 m above the eye), and at
`clear`'s haze that is a **10% blend** — exactly `ART-DIRECTION.md` §2's own
"300 m at 10%". A 10% blend of a luma-209 inscatter onto a black surface is
17 levels of floor, which is `p0.1` 21.8 to within the measurement. **The haze
is on spec; the frame has no foreground.** Every pixel in it is either sky or
terrain at 400 m-plus, so its darkest quartile is hazed distance by
construction. That is a content and framing item and it belongs to whoever owns
`Shots.ts` or the terrain, not to the sky.

### 4. The auto-exposure meter — LANDED, and it was the largest item of the four

See `a432996` and `f2fabc5` for the full numbers. Headline:
`probes/expmeter.mts` (new) reports, per shot, the ratio of the multiplier the
integrator settles on to the scene exposure the Sky publishes from sun and sky
irradiance. Before: **median 1.361, spread 0.700-1.899, and six of twenty poses
sat on a rail** — a third of the corpus's stop decided by the edge of the band
rather than by either model. After: **median 0.944**, and the four rail-bound
dark scenes unmoved.

**The measured negative that matters here: it is NOT the centre weighting.**
Removing it outright moves `hero_portrait` 1.361 -> 1.327 and the corpus median
1.361 -> 1.344 — three percent of a thirty-six percent excursion. It is that a
log-average is dominated by its darkest members: log2(0.056), the coat, is
-4.16 where log2(0.5), a sunlit hillside, is -1.0. Area times log-depth, and it
reaches from anywhere in the frame, not just the centre box.

One correction to the handover's framing, and it should be recorded: **"100.2
against FFXV's 70.2" is the comparison `imagestats`' own header warns against.**
70.15 is the median of the whole 53-plate corpus, which is midday plains, night
VFX, menus and studio portraits together. Against the scene-matched
`FFXV-field` our day slice read `meanL` 109.8 and `p50` **92.6 against 100.9** —
we were *darker* than the reference where it counts, not brighter. The meter was
still wrong; the corpus-wide luma claim was not the reason.

## WS-4's own four items

1. **The TAA "free win" — CLOSED, MEASURED NEGATIVE. TAA is already
   accumulating the cloud buffer.** `?post=nocloudjitter` (new, `c757019`) holds
   the march's sub-texel Halton offset at zero while leaving TAA and the camera
   jitter alone, which `?post=notaa` cannot do. On `vista_dusk` and `vista_noon`
   it moves the sky band **12.8 and 16.0 mean/255 over 31-37% of it**, and at 5x
   the jitter-off frame shows exactly the artefact the ablation was written to
   detect: cloud silhouettes come through as square-cornered blocks on the
   march's own texel grid, with the small detached puffs rendering as literal
   rectangles. With the jitter on, the same edges are smooth and the top-right
   cloud carries wisps. `tmp/sc-cj1.png` (off) against `tmp/sc-cj0.png` (on).
   The shipped frame already *is* the 8x supersample the plan wanted to buy.

   The stated mechanism was independently wrong: the field scrolls at `wind`
   7.5 m/s at 5-30 km, which is 1.25e-5 rad/frame against a pixel of 4.4e-4 rad
   — **0.03 px per frame, thirty-five times below one pixel** — and a posed
   capture holds the camera still anyway. A neighbourhood clamp cannot reject a
   history over motion it cannot resolve. This also explains three of that
   lane's own negatives at once: the dither decorrelation fix changing nothing
   visible, full-resolution marching changing almost nothing, and 448 loop
   iterations being bit-identical are all what you see when accumulation is
   already working.

2. **Cloud internal dynamic range — OPEN, and it is the top of the next list.**
   Not attempted; the exposure handover took its budget. Looked at 1:1 and at
   4x: a noon cumulus is a smooth white blob whose crown and self-shadowed base
   differ by well under a stop, and its interior at 4x has no structure at all.
   The edge takes 15-20 px to cross from sky to body and that is geometric, not
   filtering — a 2.25 km cloud at 20 km subtends about 160 px and its density
   ramp is 10% of that — so `uCloudTap` is not the lever and neither is
   `MARCH_SCALE` (measured negative, `clouds.md`). The lever is
   `cloudDensity`'s remap steepness and the crown-to-base gradient, i.e.
   `uCloudSunGain` (live `lerp(0.26, 0.20, overcast)` at `Sky.ts:1018`, not the
   dead constructor value) against `uCloudMaxRad` 9.5. **Do not raise
   exposure.**

3. **`daycycle_dawn`'s magenta — LANDED, and the recorded cause was backwards.**
   `c757019`. The backlog says the burial "removes the blue that was
   desaturating them". Measured on the cloud crop x 0.83-0.95 / y 0.05-0.20 at
   free exposure: B is **143 in all four** of base, `nocloudsun`, `nocloudamb`
   and `noambbury` — to the level — so the blue is the sky behind plus the
   `uCloudHaze` wash and neither march arm puts it there. What the ablations
   move is red, and turning the burial off adds 22 levels of it at p90. The
   burial's cost at dawn is **warmth**. So the fix is a hue: what survives the
   burial arrived through the cloud's sides, so it is tinted toward `skyHz` and
   not left at `mix(skyHz, skyUp, hf)`. Near-free at noon. **The strength is
   untouched, so `cf601ca`'s cotton-ball fix is intact.**

4. **`uAmbBury` keyed on `d` — LANDED.** `c757019`. `AMB_BURY_REF = 0.021` is
   `clear`'s own density, so `clear` reproduces to the bit and `storm` at 0.030
   now buries 43% harder as it should.

5. **The cloud-shadow patch size — OPEN.** See handover 1 above.

## Instruments added

- `src/tools/probes/expmeter.mts` — adapted / published-scene exposure per shot,
  with the band and whether the shot is railed. **`probes/faceclip.mts` reads
  the 1x1 adapt target into a `Float32Array`; it is `HalfFloatType` and that
  reads back zero on this backend.** `expmeter` decodes binary16 by hand. If
  `faceclip` ever prints `exposure adapted=0.0000`, that is why.
- `?post=nocloudjitter` — the march's own sub-texel offset held at zero, TAA
  and the camera jitter left alone.

## Traps found

- **`--ablate noexp` pins exposure at a value that suits noon and nothing else.**
  Every dawn/dusk region measurement taken under it reads at luma 9 and is
  worthless. Use free exposure for a low-sun shot and pin only when comparing
  two arms of the same hour.
- **`imgdiff` refuses two captures of the same sha**, so it cannot compare two
  `--settle` values or two `--ablate` arms. And `--settle` is not in the frame
  cache key: `--settle 60` and `--settle 64` came back byte-identical.
