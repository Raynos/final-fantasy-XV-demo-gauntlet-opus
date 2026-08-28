# Geometry bake — WS-3 / WS-12a

Contract: `docs/plans/2026-08-25-opus-after-phase3.md` §WS-3 and
`docs/plans/2026-08-26-opus-the-standing-backlog.md` §WS-12a — the same work.
Evidence behind both: `project/archive/handoff/boot-memory.md` §"what is left".

**Status: the three named items are cache reads, the codec pays 5:1, and the
cache is byte-identical to the generators over 4.6 M vertices.**

## Correctness

    node src/tools/probe.mts src/tools/probes/geoverify.mts --dirty
    IDENTICAL — 145 parts, 4 624 052 vertices, byte for byte
    (poiPrebuild 32.7 ms, so the cache was the thing doing the serving)

`geoverify.mts` compares what the cache served at boot against what the
generator produces when asked again — same page, same instant, every attribute
and every index, byte for byte. Shore ribbon, all five megastructures, all eight
prebuilt POI compounds, and the shadow proxies derived from them.

**This, and not an image diff, is the argument.** A frame is a lossy, noisy
projection: two boots of one build differ by 1.493/255 before anything changes.
And the failure a geometry cache actually has is silent and *well-formed* — a
stale POI compound is correctly wound, contract-clean, `assertAttributeContract`
green, and standing on a heightfield that has moved. An image diff would have to
be lucky to see it; the array comparison sees it by construction. It is the
standard phase 3 held the relief chart to.

It is also the only comparison that survives this trunk. See "what went wrong
the first time" below.

**The image half, for completeness.** Both corpora at one committed sha
(`e387f89`), cold, artifact present then absent, with a `geoboot` probe either
side proving the cache was and then was not serving:

    142 of 142 shots at or under floor
    worst mean delta  party_formation  2.033 / 255  against a floor of 2.85

Nothing is close to its floor, and the largest values are the character, combat
and bestiary shots — the noisiest in the corpus — not the shots the cache
actually feeds: `road_viaduct` 0.703, `landmark_meteor` 0.438 (floor 1.24),
`landmark_dreadnought` 0.153, `zone_lestallum` 0.166, `poi_haven` 0.316 (floor
0.66). A cold seven-shot capture over the cached structures exits zero with no
console errors — worth taking, because a GLSL link failure is invisible on a
warm page.

The Meteor is the one place a cache hit decides *placement* rather than only
vertices — `{ x, gy, z, yaw }` rides back through the entry's `meta`, `gy` being
`seatY` under the impact centre — so `landmark_meteor` was read as an image, not
only diffed. It is seated in the Disc, not floating and not sunk.

## The headline

`node src/tools/bootprof.mts --n 3` at HEAD, **quiet tree, `VERDICT: quiet`**,
exclusive lease, every other cache warm — the artifact moved aside and put back
between the two runs, so nothing but the cache differs:

| | cold | warm 1 | warm 2 |
|---|---|---|---|
| **with the geometry bake** | **5.78 s** wall, **5.61 s** in `Game.init()` | 5.56 / 5.45 | 5.53 / 5.40 |
| without it | 7.13 s wall, 6.95 s init | 6.67 / 6.56 | 6.69 / 6.57 |

**1.35 s off a cold boot, at 188 cold boots per suite cycle.** The plan's own
starting figure was 6.54 s; this tree without the bake reads 7.13 s, because a
day of content landed in between.

Per phase, at one committed sha (`e387f89`), `probes/geoboot.mts` either side of
the same artifact move:

| phase | no artifact | artifact live |
|---|---|---|
| `Water.shore` | 384.4 ms | **0.9 ms** |
| `Props.mega` | 454.8 ms | **9.0 ms** |
| `Props.poiPrebuild` | 423.1 ms | **38.2 ms** |
| the wait for the 35.5 MB artifact | — | **0 ms** |

The fetch measures nothing because it starts at module evaluation and is not
awaited until immediately before the shoreline — Sky, Terrain and Water's own
textures, reflection, bed, basins and surfaces are all head start.

## The measurement that decided the design, before any of it was written

`src/tools/probes/geocodec.mts` encodes the live geometry of the three
candidate subtrees in the page, gzips it with `CompressionStream`, then
decompresses and rebuilds `BufferGeometry` objects from it:

    164.88 MB raw   45.61 MB gz
    inflate 200 ms  ·  rebuild 145 geometries 25 ms  (best of 3)

Against 481 + 624 + 561 ms of generation on the same page. So a quarter-second
of decode stands in for one and a half seconds of generation — **and that is
why the codec is deliberately stupid**: no quantisation, no byte transposition
(a 4-stride float transpose would shrink the gz and cost 400 ms of JS scatter to
undo). The arrays come back bit-identical.

`src/tools/probes/geosplit.mts` says where `poiPrebuild` goes: eight sites, 417
ms, **3.70 M vertices**, of which `_base` is 2 ms, `WearField.sampleInto` 1 ms,
`_apron` 79 ms and `PartBuilder.build`'s merge 23 ms. So ~335 ms is the kit
function lofting primitives, and essentially all of the phase is cacheable.

## What was built

- **`src/engine/GeoBake.ts`** — the container. `EOSGEO01`, a JSON header of
  entries, a 4-aligned body of raw typed-array bytes. `bakedGeo(key, resolve,
  build)` is the whole API; `loadGeoBake()` / `releaseGeoBake()` bracket it.
- **`src/world/props/PartBuilder.ts`** — `build()` split into `merge()`
  (vertices, the half a cache replaces) and `emitParts()` (meshes, the half both
  paths run), with `bakedParts()` = the two with `bakedGeo` between them, and
  `matResolver()`.
- **`src/tools/texbake.mts --geo`** — the bake. Boots the page at
  `?q=ultra&shoot=1&geobake=1`, records, POSTs the container back to a socket.
  `GEO_SOURCES`, `geoIsFresh()`, `pruneStaleGeoBake()`.
- Call sites: `PoiKits._make`, the five `Megastructures._xParts`,
  `Water._buildShore`.
- `src/tools/vite-plugin-bake.mts` prunes a stale geometry artifact the way it
  prunes a stale painted-face one.
- `src/tools/corpus.mts` — unrelated bug, fixed on the way past: it threw
  `unknown flag --build`, so a 142-shot corpus could only ever be captured at
  HEAD, which makes the one comparison a whole-world change needs impossible to
  run with the tool built to run it.

### Three decisions worth not re-litigating

**It is a browser bake, not a Node one.** `texbake` runs its texture generators
under Node because a texel function is arithmetic. `PoiKits._base` seats every
compound against `Terrain.drawnHeightAt` — the *rasterised clipmap*, which
`seatcheck.mts` proves is the renderer's own arithmetic. A Node bake would seat
124 compounds at subtly different heights and ship aprons graded against ground
that is not the ground the player stands on. Correct-looking geometry of the
wrong world is precisely the failure this whole class of cache has.

**Only what boot builds is baked, and that is a memory decision.** 14 keys: 8
POI compounds, 5 megastructures, the shore ribbon. Every one is consumed during
`init()`, the index empties, and `releaseGeoBake()` at the end of `Props.init`
drops whatever is left — otherwise one unclaimed entry holds the whole 165 MB
body alive for the session, in a process that is already 1.9 GB. The 116 POI
sites that stream in later therefore get **no** cache; that work is already
spread over frames.

**Materials are stored by `name`, and a colliding name is dropped.** A
material's `uuid` is regenerated on every load, so `name` is its only durable
identity. `PropMaterials`' factories memoise on tint, so one object appearing
under two table keys is not hypothetical — `matResolver` maps a name two
*different* materials answer to onto nothing, which downgrades those entries
from "cached wrong" to "not cached", and `bakedGeo` refuses to record an entry
whose materials it cannot resolve.

**Keys are prefixed with the quality tier.** `_base` reads the clipmap and the
bake runs at `q=ultra`; `combatloop` and `integration` boot at `q=low` and take
a clean miss rather than ultra's vertices.

## What did not get done, and what it would cost

| ms (quiet tree) | item | verdict |
|---|---|---|
| ~491 | `Vegetation.trees.build` | **not attempted.** It takes the renderer and draws its impostor atlases on the GPU: those are rendered *art* and want baking as images with the image baselines re-checked. WS-12a says stage it last or leave it. Left. |
| ~120 | `Vegetation.bushes.build` | not attempted. 0.5 MB of geometry over 23 instanced variants — the artifact would be trivial; the question is whether the 120 ms is geometry or the instanced plumbing, and nobody has split it. |
| ~78 | `Props.rocks` | not attempted. `Rocks` has no `root` and no `PartBuilder`: it is a tile streamer with `groups`/`stream`/`outcrops`, so it needs a different shape of entry, not this one. |
| ~46 | `Props.landmarks` | not attempted. `PartBuilder`-shaped and would be a five-line addition; skipped only for want of time. |
| 610 | `Vegetation.prime.*` | **do not delete it** (measured negative, `LANDMINES.md`). But *caching the primed result* is a different idea and is still untried: the primed state is `InstancedMesh` matrices and tint arrays, which are typed arrays — the hard part is that the streamer's own tile bookkeeping would have to be restored with them or the world desyncs on the first `update()`. |

## Memory — a finding for `TODO.md` line 2, which has no lane

The footprint scan (`src/tools/probes/geofootprint.mts`) is worse than the
phase-3 memory table records, and the growth is all in one place:

    poiKits   127 geometries  3 704 402 verts   119.7 MB
    mega       17 geometries    787 770 verts    37.7 MB
    shore       1 geometry     131 880 verts      7.4 MB
    landmarks  19 geometries     70 934 verts      1.9 MB

`boot-memory.md` records **82.3 MB + 14 MB index over 430 geometries** for the
whole page. The eight prebuilt POI compounds alone are now 119.7 MB, and **two
of them** — `lestallum` (1.34 M verts) and `galdin_quay` (1.28 M) — are 2.6 M of
the 3.7 M and 254 ms of the 417. Whether a town POI should be 1.3 M vertices is
a content question this lane did not have the standing to answer, but it is the
largest single geometry consumer in the game and nobody has looked at it.

The geometry bake does **not** fix this: it changes where the arrays come from,
not how many there are. It does add a transient — 45 MB gz plus 165 MB inflated
during `init()` — which is released at the end of `Props.init`.

## How to work on this

    node src/tools/texbake.mts --geo            # bake, if stale
    node src/tools/texbake.mts --geo --force    # always
    node src/tools/probe.mts src/tools/probes/geoboot.mts --dirty   # the boot marks

- **`texbake --geo` writes the SHARED bake cache** and pins itself to the dirty
  build for that reason. Re-bake from `main` after a merge.
- **Editing anything in `GEO_SOURCES` deletes the artifact** at the next server
  start, and boot goes back up by ~1.2 s with every gate still green and nothing
  logged where it matters. That is the system working. `src/public/baked/geo.json`
  carries the hash and the key list; **`keys: []` means the bake recorded
  nothing**, which is the one silent way this can be worthless.
- `?nobake=1` takes all four caches out of the loop for one page load.
- The image half of the correctness pass is
  `scratchpad/ab2.sh`'s shape: **both corpora at ONE committed sha**, with
  `geo.bin.gz` moved aside between them, and a `geoboot` probe either side
  proving the cache was and then was not serving. Never two dirty runs.

## What went wrong the first time, and why it is worth knowing

The first correctness pass was two full-corpus runs on the **live tree**,
minutes apart, artifact present then absent. It was worthless, twice over, and
both reasons are structural rather than bad luck:

1. **A co-agent's commit prunes your artifact.** `pre-commit` runs `vite build`,
   which runs the bake plugin, which deletes a geometry artifact whose sources
   have moved — and `GEO_SOURCES` is wide, so *any* lane touching `Terrain.ts`,
   `Ecology.ts`, `PoiKits.ts`, `Water.ts` or now `water/Tarns.ts` invalidates it.
   Two water-lane commits landed inside the first run's window and the "cache
   live" side may have booted with no cache at all.
2. **Two dirty runs are two different worlds.** The water lane was editing
   `PoiKits.ts` — the fishing kit — between the two runs. Nothing about the
   output says so.

Both are answered by pinning a sha: an already-booted page keeps the container
it inflated, so a mid-run prune is harmless, and a sha cannot drift. And
`geoverify` answers both outright, because both of its sides come from one page
at one instant.

**Three lanes were live in `src/world/` while this landed**, despite the brief
saying otherwise — water/chart in `PoiKits.ts`, `Water.ts` and `map/Chart.ts`,
and characters in `src/characters/`. Re-run `texbake --geo` after they settle.
