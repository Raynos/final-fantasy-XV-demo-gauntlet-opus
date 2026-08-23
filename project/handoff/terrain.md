# Handoff — `agent/terrain`

Worktree `.claude/worktrees/agent-a5cbf6c02817c1e2b`, branch `main`, based on `4a93c1e`.
Port 5460 throughout (daemon 5461).

| commit | what |
|---|---|
| `965df83` | filter the clipmap height by the LOD cell — the chevron hatch |
| `702fb10` | `Terrain.groundColorAt` — the sampler all vegetation tints from |
| `9de5ced` | the horizontal "wood grain" — rock tile bedding + humid terracing |
| `c8ff7ab` | this handoff |
| `b0d676f` | halve the LOD filter's cost after measuring it |
| `b89d8b2` | decouple the `_outcrops` RNG from the heightfield |

Files touched, and the only files touched: `src/world/terrain/TerrainMaterial.ts`,
`src/world/terrain/Field.ts`, `src/world/terrain/Layers.ts`, `src/world/Terrain.ts`,
this file. Probes live in `tmp/tr/` (git-ignored).

---

## 1. The chevron hatch — root cause is **GTAO**, not the heightfield normals

This is the most valuable thing in the document. The brief handed me the chevron
hatch diagnosed as "`Field.heightAt()` and/or the far normal texture". It is
neither, and the previous two agents' negative results are all consistent with the
real answer once you know it.

**Bisected, not guessed** (`zone_longwythe`, the Longwythe Peak cone):

| probe | result |
|---|---|
| `tfAlbedo = vec3(0.35)` — constant albedo | hatch **unchanged** → not the splat |
| `tfNormalW = vec3(0,1,0)`, `tfAO = 1.0` | hatch **unchanged**, now visibly *dark stripes* → not the shading normal |
| `?post=plain` | hatch **gone** → it is a post-process |
| `?post=nogtao` alone | hatch **gone completely** → it is GTAO |
| gbuffer `objectNormal` forced flat | unchanged → GTAO is not reading our normal buffer |
| `tf_micro()` forced to 0 | unchanged → not the analytic micro relief |
| `polygonOffset = false` | unchanged |

`PostFX.ts:136` calls `GTAOPass.setGBuffer(this.rtScene.depthTexture)` with **no
normal texture**, which sets `NORMAL_VECTOR_TYPE = 0` in three's GTAO material:
AO normals are **reconstructed from depth**. So GTAO never sees the carefully
low-passed `tf_surfNormal`; it sees the raw triangles.

`tmp/tr/pA.png` (flat albedo, hatch intact) and `tmp/tr/pD.png` (`nogtao`, clean)
are the two frames that prove it. `tmp/tr/pCc.png`, `pEc.png`, `pFc.png`, `pIc.png`
are the rest of the bisection.

### What I fixed, and what is left

Half of it was ours. The clipmap vertex shader **point-sampled the 4 m heightfield
at a 12–96 m vertex pitch** — decimation, not filtering, leaving several metres of
pseudo-random per-vertex jitter on every coarse ring. `tf_heightLod(p, cell)` in
`TerrainMaterial.ts` low-passes the height by the level's own cell before
displacing (5-tap cross, `w = (cell - 4) * 1.1`; a no-op for levels 0–1, where
`cell` is 1.5 m and 3 m). The morph target is filtered with the **next** level's
cell so the rings still meet exactly and the seam cannot crack.

Longwythe Peak goes from wallpapered to a clean mountain — `tmp/shots/tr0/zone_longwythe.jpg`
against `tmp/shots/tr1/zone_longwythe.jpg` is the A/B, and it is not subtle.
`zone_three_valleys` and `zone_taelpar` improve as much.

**What remains is the triangle facets themselves.** Widening the filter to `*3.0`
barely touched the residual hatch on the far ranges (`tmp/tr/pJl.png`), which is the
proof: a piecewise-linear surface has a C1 discontinuity at every triangle edge and
depth-derived normals see all of them. No amount of height filtering removes that.
**It needs the AO pass.** See *Cross-boundary*.

## 2. `Terrain.groundColorAt` — it did not exist at all

`veg/Ecology.ts:499-500` calls `Terrain.groundColorAt` if it exists and
`Terrain.colorAt` if that does not. **Neither existed.** For the whole life of the
project every blade, bush and tree has tinted itself from Ecology's own fallback: a
hard-coded `C_SOIL_RED → C_SOIL_DRY → C_SOIL_WET` lerp on moisture, a warm brown
everywhere, which has never heard of `WorldMap`. That is the entire explanation of
the vegetation agent's measurement (linear luminance 0.090 at r/g 1.34 under
pale grey-green ground). It is `agent/splat`'s bug — a second source of truth that
never read the cartography — one level further out.

`groundColorAt` now mirrors the shader's own far-LOD path (`farCol` over the six
`LAYER_AVG` entries weighted by the splat, the regional ground/rock tints, the three
macro colour fields, the altitude bleach, the desaturation, standing humidity),
driven by the weights `sampleMaterial` has already blended, so CPU and shader cannot
drift. It deliberately stops short of everything that only exists inside 420 m.

Measured in-page at all nineteen zone centres (`node tmp/tr/gc.mjs`):

```
longwythe    lum 0.364  r/g 1.27      fallgrove   lum 0.258  r/g 0.68
crown_verge  lum 0.422  r/g 1.63      vesperpool  lum 0.240  r/g 0.71
keycatrich   lum 0.425  r/g 1.54      malmalam    lum 0.195  r/g 0.68
taelpar      lum 0.332  r/g 0.92      ravatogh    lum 0.106  r/g 1.09
```

Leide warm, Duscae/Cleigne green-grey, Ravatogh dark basalt. Was 0.090 / 1.34
everywhere.

`sampleMaterial` now also returns `m1`, `m2` and `bio` so the nineteen-zone Gaussian
blend is not paid for twice. `bio` is the shared scratch object — read it before the
next call.

## 3. The horizontal "wood grain" — the rock **tile**, not the strata

Diagnosed as the analytic strata twice before, and wrong both times. My
`cliffAmt = bedThrough = runnelAmt = 0` probe reproduces the previous agent's
negative result exactly (`tmp/tr/tCc.png`, unchanged) — but the constant-albedo
probe removes it (`tmp/tr/tAc.png`), which rules out geometry *and* normals. Forcing
`alb[3].rgb = uLayerAvg[3]` removes it (`tmp/tr/tDc.png`). It is `Layers.ts` recipe 3.

- `hueSel = 0.5 + 0.5 * b2` was a pure sinusoid of **world Y** at two cycles per
  12.2 m tile driving red +20 % against blue −14 %, drawn triplanar. That is the
  warm-tan / blue-grey alternation. Living in the tile is how it survived the
  regional `bedRegion` suppression meant to keep bedding out of green country.
- The warp was ±0.05 of a tile — 0.6 m — so every bed ran dead level across a
  whole hillside.

Both fixed, plus the bed weighting moved off the 6 m package toward the fine
laminations, and the AO stripe cut (an AO band survives every regional tint,
because it is a shadow, not a colour). `tmp/shots/tr0/zone_taelpar.jpg` →
`tmp/shots/tr6/zone_taelpar.jpg`.

## 4. `_outcrops` no longer re-phases on every height change

`_outcrops` drew two, three or eight numbers per candidate depending on the local
slope and on whether the boulder came out big, so a height change anywhere
reshuffled every boulder downstream of it — which is what makes a one-line height
experiment indistinguishable from a scatter regression in an A/B. It bit this
session's own bisection. Every candidate now draws the same nine numbers in the
same order and the slope test only *decides*. The boulder field reshuffles once, on
purpose, and never again for a reason that is not local.

## 5. The terracing change

`Field.ts` separately stops benching humid ground: `lastTerrace` is now damped by
`1 - 0.88 * smoothstep(0.28, 0.60, moist)`. Taelpar's `terrace: 0.68` was pulling
the ground 56 % onto a 22 m staircase and the splat read tread-as-dirt /
riser-as-rock. Leide's `moist` is 0.18–0.24 so the gate never opens there and the
badland benching is untouched. **`WorldMap.ts` needs no change** — the realisation
was the problem, as the brief allowed for.

---

## Gate status

| gate | result |
|---|---|
| `pnpm exec vite build` | **pass** (pre-commit hook, all three commits) |
| `node src/tools/roadcheck.mts` | **pass** — 0 failures, 0 warnings, 30.26 km / 50 edges / 50 nodes, worst grade 13.0 % (limit 13) — identical to baseline |
| `node src/tools/heightcheck.mts` | **pass — 0.000 m at every probe**, micro and grid separately |
| `node src/tools/driftcheck.mts` | **pass** — drift 0.000 m, gpu-vs-`heightAt` worst 0.373 m (tol 0.45); coarse-LOD spread worst **1.281 m, was 1.330 m** — the LOD filter did not widen it |
| `node src/tools/perf.mts` | **pre-existing FAIL, and measured A/B'd.** Full corpus: mean **73.7 fps**, worst **41.5 fps at `vista_dawn`** — against `agent/grass`'s last recorded run of mean 73.6 / worst 39.1, i.e. unchanged. See the A/B below. |

### The one perf number that is mine

Same machine, same session, four terrain-dominant shots, median frame ms:

| shot | filter off | 5-tap on `tf_height` | 5-tap on the grid only (shipped) |
|---|---|---|---|
| `vista_dawn` | 23.1 | 25.2 | 24.1 |
| `vista_noon` | 12.4 | 12.6 | 13.3 |
| `zone_longwythe` | 14.3 | 14.3 | 13.3 |
| `zone_three_valleys` | 12.5 | 14.0 | 12.8 |

The first version cost up to **+2.1 ms**, which is real money on a chain already
missing 60 fps at `vista_dawn`. Two simplex octaves are the expensive half of
`tf_height` and the four extra taps had no business paying for them — `tf_micro` is
a 4–11 m band that a 24 m lattice cannot represent at any phase, so averaging five
aliased samples of it was worse than not sampling it. The shipped version reads the
grid alone through `tf_gridH` and adds the micro term once, faded out with the cell.
That lands inside the run-to-run spread on three shots of four.

**`vista_dawn` is worth someone's attention on its own terms** — 7.47 M triangles
against 4.5–5.2 M everywhere else, and it is the only shot in the corpus below
45 fps. It is not terrain: the draw count is 576, in line with its neighbours.

## Not done / next steps, in priority order

1. **Task 4, the `lowAlt` grass gate — measured, and it is correct as it stands.**
   `node tmp/tr/gate.mjs` walks a 64 m grid over the whole playable field and
   buckets the gate by the region's own `green`:

   ```
   green bucket   samples   gate<0.5    mean gate
   0.00-0.20         3689     22.2%     0.773
   0.20-0.40         7535      4.2%     0.954
   0.40-0.60         2269      6.5%     0.933
   0.60-0.80         2129      0.0%     1.000
   0.80-1.00          762      0.0%     1.000
   ```

   The gate is fully open across green country and the only ground it closes is
   bare Leide badland above ~145 m, which is what it is for. Every gated sample
   above `green 0.45` is a 210–240 m ridge crest in the north Cleigne uplands.
   **`zone_three_valleys` is bald because it is authored bald** — `green 0.095`,
   `moist 0.24` — and its ground sits at 33 m where the gate reads exactly 1.0. The
   regional gate the previous round installed did its job; if that aerial should
   have scrub on it, the lever is its `SURFACE` entry and its `moist`, not the gate.
   I did not change either: retuning a Leide badland zone toward green on the
   strength of one high aerial is precisely the move the *shoot the baseline* rule
   exists to stop.
2. **A real height mip pyramid, if `vista_dawn` ever needs the millisecond back.**
   Build the mip chain for `uHeightTex` / `uFarHeightTex` on the CPU in
   `Terrain._uploadFieldTextures` and make `tf_heightLod` a single `textureLod` at
   `log2(cell / P.y)`. That is *cheaper than the code was before any of this work*
   — one filtered tap against four `texelFetch` — and it is a proper box filter at
   every level rather than a five-point comb. I did not do it because manual
   mipmaps on an R32F `DataTexture` need verifying against three's uploader and the
   5-tap proved the visual point first.
3. **Pallareth's and Taelpar's slopes are now clean but bland.** Taking the corduroy
   off left large areas of unbroken grey-blue rock
   (`tmp/shots/tr9/zone_pallareth.jpg`). That is strictly better than printed
   plywood, but a Duscae cliff in FFXV has lichen, wash streaks and soil pockets.
   The lever is the splat's near path, not the tile bedding I just suppressed.
4. `zone_malacchi` is a **forest canopy** shot, not the "wide prairie vista" the
   brief describes — the reframing is not in this tree. Nothing about the terrain
   can be judged from it.

## Cross-boundary — report, do not fix

| what | where |
|---|---|
| **GTAO reconstructs its normals from depth and has no camera-distance falloff, so it draws the triangle facets of every distant massif as a regular hatch.** This is the residue of the chevron defect and it cannot be fixed from `world/terrain/**`. Two candidate one-liners: fade `gtao.blendIntensity` / the AO term to zero past ~600 m, or pass a real normal target as `setGBuffer(depth, normal)` — `patchGBufferMaterial` already exists and already displaces the terrain for exactly that path, it is simply not being fed. Reproduce with `node tmp/tr/pshot.mjs zone_longwythe out.png "&post=nogtao"`. | `src/engine/PostFX.ts:134-155` |
| `GROUND_BLEED = 0.22` in `veg/GrassField.ts` was tuned against the *broken* ground colour (a warm brown at luminance 0.090). Now that `groundColorAt` returns the real ground it is worth re-judging — the grass agent's §5 says exactly this and it is now actionable. | `src/world/veg/GrassField.ts:61` |
| `zone_malacchi` frames a canopy interior; `zone_mencemoor` still frames the inside of the meteor (`agent/splat` reported this and it is still true). | `src/game/Shots.ts` |
| ~~`MapRaster.ts` still orphaned.~~ **RESOLVED 2026-08-22** — deleted; `orphans` is clean at 273/273. | — |

## Gotchas — read before touching any of this

> **The `tmp/tr/` probes named below are gone** — `pshot`, `relief`, `bio`, `gc`,
> `gate`. `tmp/` is disposable by design and was cleared. Each is short and the
> paragraph that names it says what it did and why it was worth having; rebuild
> the one you need, or promote it into `src/tools/`. `pshot` in particular is the
> only way to pass a `?post=` query string to a capture, which `shoot.mts` does
> not do.

- **Backticks inside a `/* glsl */` template literal terminate the string.** I wrote
  ``…whose cells are `cell` metres…`` in a GLSL doc comment and got
  `SyntaxError: Unexpected identifier 'cell'` from the *page*, not the build. The
  vegetation handoff warns about this and I did it anyway. Do not put backticks in
  shader comments.
- **`scene.overrideMaterial` debug views are useless for terrain.** `view normals`
  and `view unlit` replace the material outright, so the clipmap renders as an
  undisplaced flat plane. Bisect by editing `tf_shade`'s outputs instead — that is
  what `tmp/tr/pshot.mjs` is for, and `?post=<token>` (`PostFX.debugToggle`) is the
  other half. `src/tools/shoot.mts` does not pass a query string, hence the probe.
- **`tmp/tr/relief.mjs`** renders a CPU hillshade of the real `Field` with any one
  term monkey-patched out (`node tmp/tr/relief.mjs noerode 950 -1000 600 800`). It
  is how I found that `_peak`'s `spoke` term is a function of **angle only**, so it
  draws a perfect radial starburst from summit to base with no radial variation at
  all — see `tmp/tr/relief-nodetail+noerode+notalus+nooutcrop+nomacro+nomicro.png`.
  That is not the chevron bug but it *is* ugly, and it is the reason the peaks look
  like beach umbrellas in wireframe. Worth a pass.
- **Bisect the post chain before the shader.** Two agents lost rounds to the chevron
  hatch by assuming it was theirs. `?post=plain` takes thirty seconds and would have
  told either of them it was not.
- `tmp/tr/bio.mjs` prints the *blended* `surfaceAt` entry at every zone centre, which
  is what the landmine about small-zone dilution asks you to measure. Use it before
  authoring any table entry. `tmp/tr/gc.mjs` does the same for `groundColorAt` and
  `tmp/tr/gate.mjs` for the `lowAlt` gate.
- **The dev server is not on 5460 as often as you think.** `src/tools/shoot.mts`
  spawns and then kills its own vite when the port is free, so a `heightcheck` run
  straight after a `shoot` finds nothing listening and hangs for its full timeout.
  Start `pnpm exec vite --port 5460 --strictPort` yourself and check it is still up.

## Shots

`tmp/shots/tr0` is the **pre-change baseline** — shoot against it before believing
any regression. `tr1` after the LOD height filter, `tr2` after `groundColorAt`,
`tr3`–`tr6` through the wood-grain work, `tr7` after the perf rework, `tr8` after
the RNG decoupling, `tr9` the final review set (`zone_pallareth`,
`zone_vesperpool`, `zone_nebulawood`, `hero_full`, `vista_dusk`).

The two A/Bs that carry the argument: `tmp/shots/tr0/zone_longwythe.jpg` against
`tmp/shots/tr7/zone_longwythe.jpg` (chevron), and `tmp/shots/tr1/zone_pallareth.jpg`
against `tmp/shots/tr9/zone_pallareth.jpg` (wood grain).
