# canopy — the black blob on the Nebulawood canopy (WS-4)

**Status: done.** The blob is gone, the cause is named, both shots it affected
carry a fresh measured floor, and `pnpm run check` is green. The instrument it
produced then found the same defect *class* in five more shots, and those are
fixed too: **`nanscan` is 0 of 142**.

Shas: **4384cff** (the terrain fix), **154e8bf** (the new floors), **ba2a26d**
(`nanscan`, the landmines, the plan), **d27a0b6** (the trail `pow()` fix and
`nanwalk`).

**`nanscan.mts` is 0 of 142 shots.** Run it after anything that touches a
shader; it is the only thing in the tree that can see this class of defect.

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

**The remaining five were a different bug, and are also fixed** — see below.
`nanscan` is now **0 of 142**.

## The other five: one unclamped `pow()` in the trail ribbon

`TRAIL_FRAG` in `src/combat/Trails.ts` takes `vUv.x` as the base of two `pow()`
calls, `pow(along, uHeadBias)` and `pow(along, 1.35)`. **GLSL leaves `pow(x, y)`
undefined for `x < 0`**, this backend answers NaN, and a ribbon interpolates
`vUv.x` a hair below zero along its own tail edge — so the NaN lands on a thin
diagonal line, which is exactly the shape the pixels have: `combat_armiger`'s 48
run from (257, 650) to (378, 616) at a constant slope. Every other `pow()` in
that shader already clamps its base. `along` and `across` are clamped at the
source now.

**Two protocol traps found on the way, and they are worth more than the diff.**
Both are in `nanwalk.mts`'s header:

1. **Hide *after* the pose.** `applyShot` **rebuilds** the VFX group. Hide a
   child and then pose, and the pose hands you a fresh set of children with the
   hide undone — so every child alibis while hiding the *group* still works (a
   hidden parent stays hidden however many children are added under it). The
   walk blames the group and names nothing.
2. **Hide by *material*, not by object.** The VFX systems spawn new children
   every frame, so even an object hidden after the pose has been replaced by the
   time the next frame draws. The materials are pooled, so `colorWrite = false`
   on one reaches the objects created after the ablation. That took it from "no
   single child removes it" straight to `trail0`, out of 41 materials, in one
   run.

Then four shader variants on `trail0`'s own material: a constant output clears
it, clamping the alpha does not, clamping the colour does not, guarding `uLife`
does not, and `pow(max(along, 1e-5), uHeadBias)` clears it outright.

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

`pnpm run check`: **19/19 gates pass**, both fixes in.

It read 18/19 on the first run, failing `facecheck`, and that was not this
lane's: it failed identically at HEAD~2, before any of this, on all four heads.
WS-1 landed its fix while this lane was running and it is green now. Worth
knowing as a habit — on a shared trunk a red gate is not yours until you have
run it against a build from before your change.


## If you are picking this up

There is nothing open in it. The two things worth carrying forward:

- **`node src/tools/probe.mts src/tools/probes/nanscan.mts` after any shader
  change.** It costs one boot and about four minutes, and it is the only
  instrument here that sees a NaN. Two unrelated NaN bugs had been shipping in
  seven of the thirty judged shots for weeks with every gate green.
- **The class, not the two bugs.** Both were an operation undefined on its input
  — `normalize()` of the zero vector, `pow()` of a negative base — on hardware
  that answers NaN rather than something harmless, and in both cases the defect
  reached the frame through a path that looks safe (`mix(a, b, 0.0)` does not
  discard a NaN; a varying is not guaranteed to stay inside the range its
  attribute was authored in). Grep for unguarded `normalize(` and `pow(` with a
  varying base in the other shaders; this lane only cleared the ones the
  instrument pointed at.
