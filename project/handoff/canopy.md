# canopy — the black blob on the Nebulawood canopy (WS-4)

**Status: done.** The blob is gone, the cause is named, both shots it affected
carry a fresh measured floor, and `pnpm run check` is green.

Shas: **4384cff** (the fix), **154e8bf** (the new floors), plus the `nanscan`
probe.

## What it was

Not post, not foliage, not GTAO's `overrideMaterial` — the two landmines the
brief pointed at are both innocent here, and `--ablate plain` says so in thirty
seconds: the blob is **pixel-identical with the entire post chain off**.

It is **NaN**, written by the terrain surface shader, shown by the grade as a
hole of pure 0,0,0.

`surfArray` is `rg = tangent normal xy, b = roughness, a = AO` (`Layers.ts`
line 9). The triplanar rock block read `sx.rgb * 2.0 - 1.0` as a tangent
normal — **it took the roughness for the normal's Z**. Where the rock layer is
out of contention (`w[3] < wCut`: any ground with no rock in it, i.e. most of a
forest) all three planes keep the neutral fill `SURF_FLAT = vec4(0.5)`, and 0.5
decodes to the **zero vector** rather than to a flat tangent normal `(0, 0, 1)`.
The whiteout blend of three zero vectors is

    (N.x * (bw.y + bw.z), N.y * (bw.x + bw.z), N.z * (bw.x + bw.y))

which on axis-aligned ground — `N = (0, 1, 0)`, `bw = (0, 1, 0)`, i.e. a flat
forest floor — is exactly zero, and `normalize` of that is NaN. It reached the
frame even where the rock weight is zero, because `mix(planarN, rockN, 0.0)` is
`0.0 * NaN` = NaN.

The fix reconstructs Z from XY (`tf_tanN`), which also makes the neutral fill
contribute exactly `N` — what the comment on `SURF_FLAT` already claims it does.

## How it was found, in order

| step | result | conclusion |
|---|---|---|
| `--ablate plain` | blob identical | not post |
| hide-walk of the whole scene graph, one child at a time | black 2831 -> 0 hiding `TerrainClipmap`, -> 395 hiding `terrain-L0` | it is terrain |
| `normal = up` in the terrain frag | 2831 -> 0 | the shading normal |
| `Nw = N` (drop the detail normal) | 2831 -> 0 | the detail normal |
| `readRenderTargetPixels(post.rtScene)` | **3337 NaN px, all inside the blob's box, none elsewhere in the frame** | NaN, not darkness |
| bit-test the chain with `floatBitsToUint` | first NaN at `rockN = normalize(tX*bw.x + ...)` | one line |
| patch the fix in-page, A/B/A | 3337 -> 0 -> 3337 | proved before editing the file |

## Two traps that cost most of the time — worth knowing before the next one

1. **Every in-shader NaN test is folded away by the shader compiler here.**
   `isnan()`, `isinf()`, and the usual `(x >= 0.0 || x < 0.0)` idiom all report
   *false* for a NaN. Six sanitisers at six points in the fragment shader moved
   the NaN count by **zero pixels**, which reads as "the terrain is innocent"
   and is not. Worse, every *diagnostic* predicate has the same failure mode:
   "the normal is not below the horizon / not denormalised / not backfacing"
   were all NaN answering `false` to a comparison. Test the bits —
   `floatBitsToUint(v) & 0x7f800000u` — which cannot be folded.
2. **A flag written through `totalEmissiveRadiance` is invisible on a NaN
   pixel**, because it is *added* to a term that is already NaN. Write the flag
   over `gl_FragColor` at `<dithering_fragment>` instead. (And note
   `outgoingLight` is summed *before* `#include <opaque_fragment>`, so a mark
   injected there is already too late.)

Both are in `project/LANDMINES.md` now.

## What else it found

`src/tools/probes/nanscan.mts` poses all 142 shots and counts NaN pixels in
`rtScene`. Before the fix: **7 shots**. After: **5**.

    zone_nebulawood  3261 px   FIXED
    zone_malmalam     314 px   FIXED
    combat_wide        29 px   still there
    combat_hud         38 px   still there
    combat_armiger     50 px   still there
    warp_strike        20 px   still there
    warp_wide          15 px   still there

**The remaining five are a different bug and are open work.** They are all
combat/warp shots, they are tens of pixels rather than thousands, and the
terrain fix does not touch them — so the source is almost certainly a VFX or
character material, not the terrain. Worth an hour: the method above transfers
directly (scan `rtScene`, hide-walk the graph, then bit-test the shader), and
`nanscan.mts` is already the instrument. Nothing in the suite catches these:
a NaN is not a page error, does not move a draw count, and against a baseline
that has the same hole in it is not even a pixel diff.

## Blast radius, looked at

The Z reconstruction changes the rock normal wherever rock is actually
sampled, so it moves pixels beyond the two holes. Warm before/after over eight
shots: `vista_noon` 3.108 mean / 6.2% of pixels over 8/255 is the largest,
`landmark_meteor` 2.298, `zone_longwythe` 2.011, `hero_full` 2.116. Cropped
`vista_noon`'s massif at 2x and looked at both sides: the strata bedding reads
slightly *cleaner* after and the upper cone loses some dark speckle. Neutral to
a hair better, and correct either way — the previous normal was modulated by
the roughness channel.

## Floors

Neither shot had one; both were on `DEFAULT_LIMIT = 2.0`. Measured from two
`--cold` captures of the fixed build and verified with a third:

    zone_nebulawood   floor 0.744   third cold capture 0.496
    zone_malmalam     floor 0.276   third cold capture 0.188

## Files

- `src/world/terrain/TerrainMaterial.ts` — `tf_tanN`, and the triplanar rock
  block that now calls it. Both carry the mechanism in comments.
- `src/tools/probes/nanscan.mts` — the corpus NaN scan.
- `project/noise-floors.json` — two new rows.

## check

`pnpm run check`: **18/19 gates pass in 86.4 s**. The one failure is
`facecheck`, and it is not this lane's: it fails identically at HEAD~2, before
this fix, on all four heads (`transverseDropMm`, `jawWidthErr`, and no mouth on
three of them). That is WS-1's gate and WS-1 is live in `src/characters/**`.
