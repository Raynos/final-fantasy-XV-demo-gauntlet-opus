# Boot time and memory — phase 3

Contract: `docs/plans/2026-08-22-opus-phase3-boot-and-memory.md` — **DONE**, with
§3's definition of done **amended**, not ticked. Read §3 first; it is the honest
account. This file is the working detail behind it.

Two passes: 2026-08-23 (the texture bake, worktree `agent-a371be6dd5beec857`)
and 2026-08-25 (this one, on trunk).

## The headline

`node src/tools/bootprof.mts --n 3`, quiet tree, `VERDICT: quiet`:

| | cold | warm |
|---|---|---|
| start of plan (2026-08-22) | 13.66 s | 13.00 s |
| after pass 1 (2026-08-23) | 6.88 s | 6.57 s |
| **found at the start of pass 2** | **7.55 s** | **7.08 s** |
| **now, `?shoot=1`** | **6.64 s** | **6.03 s** |
| **now, `--play`** | **6.41 s** | **6.15 s** |

Two things in that table matter more than the last row.

**It had drifted back up.** Seven content lanes landed after pass 1 and nobody
re-measured: `Vegetation` had gone 618 -> 1369 ms and `Props` 169 -> 850. A boot
number in a plan header is a claim with a shelf life, and this one was two days
stale and most of a second wrong in the flattering direction.

**Every number this plan ever quoted was a `?shoot=1` number** — the harness's
page, where the dev suite refuses to load and the encounter director is switched
off a line after init builds for it. `project/TODO.md` is about the page a person
opens. `bootprof.mts --play` now measures that one. Report both.

**The target was cold under 6 s and warm under 3 s. Cold is a little over; warm
was never reachable, and two passes of this plan left the row open rather than
say so.** Warm boot is barely cheaper than cold here and cannot be much cheaper:
the game has no per-load state to warm into beyond the disk cache, so a warm load
repeats nearly all of a cold one. Three seconds needed the shader warm-up gone
and about half of world construction with it.

## What pass 2 changed, and what it cost

| | before | after |
|---|---|---|
| `crownNormalTex` (inside `Trees.build`) | 391 ms | ~155 ms |
| `Vegetation.trees.build` | 706 ms | 509 ms |
| `Sky.clouds` | 409 ms | ~0 (bake hit) |
| `Minimap` (`getChart`) | 458 ms | **19 ms** |
| `Sky.texbake` (artifact inflate) | 205 ms | 245 ms |
| **cold boot** | **7.55 s** | **6.64 s** |

**Three of the four wins were accidental costs, not missing caches.** Twice, the
same mistake — work that does not vary sitting inside the loop that varies:

- `crownNormalTex`'s bisection walked all 65 536 texels 25 times to use the
  fifth of them with `cov >= 0.4`. Gather them once into dense typed arrays.
- `buildAlphaMips`' coverage search walked each mip 12 times to re-derive counts
  over the same 256 possible alpha values. A histogram answers it exactly.

Both are bit-preserving by construction: same pixels, same order, same float
arithmetic. Neither needed a cache, an artifact or a re-bake step. **Look for
this shape before reaching for a cache** — it is cheaper, it has no staleness
hazard, and it was available twice in one file.

The two genuine caches, both through the Node bake (`tex.bin.gz`, now 35.4 MB /
150 entries):

- **Cloud volumes.** 64^3 shape + 48^3 detail + 512^2 weather, pure seeded noise
  with no DOM and no GPU. New `bakedBytes` in `TexBake.ts` stores a volume as a
  `size x size*size` image — the container indexes on w/h and never reads the
  bytes, so no format change and no version bump.
- **The relief chart.** `rasterChart` split out of `bakeChart` as a pure
  function; `texbake.mts` gains a `chart` job that *decodes* `terrain.bin.gz`
  rather than rebuilding the field. **Byte-identical**, max 0, Node-baked against
  browser-generated — a stronger check than any rendered frame allows.

## The three instrument fixes, and why they belong in a boot lane

None of the above could have been honestly measured without them.

1. **`ruler.mts` counted the tool's own wrapper shell as a rival lane.** An agent
   harness runs `bash -c '... && node src/tools/bootprof.mts'`; that shell's
   command line contains the tool path and it is self's *parent*, so the
   parent-to-child self-exclusion walk never reached it. Every harness tool run
   this way printed `CONTENDED (another lane is running bootprof)` on an idle
   machine and declared its own numbers void. Same bug as the pid-string version
   the code comment already records, one level up. It survived because the lanes
   that hit it read the times and skipped the verdict — which is what a guard
   that cries wolf trains people to do.
2. **`imgdiff.mts` refused baked-against-`?nobake=1` at a single sha**, which is
   exactly the check this plan's determinism row requires. A manifest now records
   the capture `variant`, and the refusal keys on build *and* variant. Pass 1 got
   around this by dirtying the tree, which `imgdiff` then correctly labels as not
   evidence.
3. **`bootprof.mts --play`**, above.

## The bug that made a correct cache do nothing

Its own heading, because there is no symptom and it will happen again.

`Sky` is the **first** system to init. `loadTexBake()` starts its fetch at module
eval and is *awaited* by `Props`, the **eighth**. That was sufficient while every
keyed generator lived in a material table Props reached first. The cloud volumes
are built seven systems earlier — so they missed on every boot with the artifact
sitting on disk, correct and unread, and the first measurement after adding them
to the bake showed **zero** improvement. A cache miss is indistinguishable from
not having a cache. `Sky.init` now awaits `loadTexBake()` itself.

## Verified

- `pnpm run check` — **17/17 gates**, at HEAD. (9 when the plan was written, 12
  at pass 1. Do not quote an old count.)
- **Capture determinism**, baked vs `?nobake=1`, eight shots, each against its
  own floor, `prompto_closeup` included:

  ```
  dun_balouve_entry     0.055 / 2.00      poi_dungeon_mouth   0.800 / 2.00
  dun_keycatrich_entry  0.073 / 2.00      prompto_closeup     0.333 / 2.00
  hero_face             1.303 / 2.00      town_forecourt      0.279 / 2.00
  party_formation       2.020 / 2.85      town_npcs           0.297 / 2.00
  ```
- **The chart**, Node-baked vs browser-generated: `mean 0.000, max 0`.
- Images read, not only diffed: `tmp/shots/chart-baked/chart.png` (ochre Leide,
  green Duscae, cool highland, caldera ring), `sky-baked/zone_galdin.png`
  (cumulus with gaps and scale variation), and `cn-head` vs `cn-dirty`
  `zone_nebulawood.png` side by side.

## Memory — unchanged from pass 1, and its rows were met

`bootprof.mts --mem`, M5 Max, ANGLE Metal, a fresh browser launch per variant:

```
plain page   1942.7 MB RSS        ?debug=1   1938.9 MB RSS
  renderer     1179 MB              renderer     1176 MB
  gpu-process   572 MB              gpu-process   571 MB
  JS heap       498 MB              JS heap       500 MB
    CPU texel arrays     94.0 MB  over 195 DataTextures
    geometry attributes  82.3 MB + 14.0 MB index, 430 geometries
    everything else     308.1 MB
  GPU-side estimate (three's own inventory)  279.3 MB
```

`?debug=1` costs **4 MB** — the TODO's premise is wrong, and so was this plan's
first correction of it, which had prod using *more* heap. Both are artifacts of
navigating one tab between variants instead of launching one browser each.

**Can it come down? A little, and not by much.** 94 MB of CPU texel arrays are
dead after upload — the one clean win, ~5% of RSS, **not attempted**: it needs
per-texture `onUpload` disposal, and a context loss then re-uploads from nothing.
96 MB of geometry arrays are **not** disposable (`heightAt`, collision and
`creaturecheck`'s skinned-AABB probe all walk vertex data). 279 MB GPU-side is
the world. The remaining ~1.1 GB is Chromium's.

## What is left, sized — the successor's work list

| ms | item | note |
|---|---|---|
| 1834 | **shader warm-up** | Closed against `compileAsync` (3% *slower*, six pairs; `--warm-ab` re-runs it). Only **fewer programs** move it — 129 in the scene step. A material-architecture question across every lane, and the natural next plan. |
| 509 | `Vegetation.trees.build` | ~158 ms GPU readback plus CPU derive. Cacheable through the *browser* bake, but `CANVAS_SOURCES` must widen to `TreeBuilder`/`VegTextures`/`Trees` — already the sharpest staleness hazard in the repo. |
| 400 / 322 / 225 | `Props.poiPrebuild`, `Props.mega`, `Water.shore` | Real geometry. All three want a **geometry bake**, which nothing here has attempted. One project, not three. |
| 354 | `Vegetation.prime.bushes` | One priming `update()` so the first frame is dressed. Removing it trades boot for a visible pop in live play; `converge()` already makes captures independent of it. |
| 245 | `Sky.texbake` | The inflate, 86 MB raw. Was hidden inside `Props`; now first on the path and honestly counted. A separately-fetched third artifact would move ~40 ms off the critical path. |
| 209 | `Director.hunts` | Arms set pieces that `setLive(false)` tears down two lines later under `?shoot`. **Skipping it when posed is ~209 ms off every capture and nothing off a player's boot.** A harness win, not a boot win, and it risks changing what a posed frame contains. Judge it as capture tooling. |

## Hazards

- **`node src/tools/texbake.mts --canvas` is not automatic and cannot be.** It
  boots the page, so it cannot run from the vite plugin. The plugin **deletes** a
  stale `texc.bin.gz` instead, because the runtime cannot tell stale from fresh.
  **`TexBake.ts` is itself in `CANVAS_SOURCES`, so editing it deletes the
  painted-face cache** — cold boot goes up ~2.5 s with every gate still green.
  This bit twice in one session, the second time after being diagnosed.
- **`pnpm run build` does not make every cache; `build:full` does.** Run it after
  any merge.
- **A cache read before `Props.init()` misses on every boot.** See above.
- **`CANVAS_SOURCES` is deliberately wide** — `Sculpt.ts`, `Anatomy.ts`,
  `Skeleton.ts` and both cast tables. The face map is authored in canonical head
  metres and projected through the head's own UV, so the *sculpt* moves those
  pixels.
- Unrelated, pre-existing, and **not** caused by anything here: a solid black
  patch sits on the canopy near the road in `zone_nebulawood`, present
  identically at HEAD before this pass. Somebody should chase it; it is not a
  boot bug.

## Files touched, pass 2

- `src/tools/ruler.mts` — ancestor-aware self-exclusion.
- `src/tools/bootprof.mts` — `--play`.
- `src/tools/shoot.mts`, `src/tools/imgdiff.mts` — manifest `variant`.
- `src/engine/BootProfile.ts` — `bootMark`, for costs accumulated over a loop.
- `src/world/Vegetation.ts`, `Water.ts`, `Sky.ts`, `src/game/Director.ts` —
  `bootPhase` marks on the four systems that had grown.
- `src/world/veg/VegTextures.ts` — `crownNormalTex` and `buildAlphaMips`.
- `src/engine/TexBake.ts` — `bakedBytes`.
- `src/world/sky/CloudTextures.ts` — split into three cached builders.
- `src/world/map/Chart.ts` — `rasterChart` split out and cached.
- `src/tools/texbake.mts` — `clouds` and `chart` jobs, wider `TEX_SOURCES`.
