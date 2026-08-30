# Lane 13 — Memory and boot (cold-start brief)

Mission: plan tasks 38–41. Tab 1 246 MB → under 800 MB
(`bootprof --mem --play --prod`; note the mem page boots `?q=ultra`).

Owns: `src/engine/` except `postfx/`; the boot-cache items touch
`src/world/props/Landmarks.ts`, `Rocks.ts`, `src/world/Vegetation.ts` —
coordinate via TASKS if those lanes are live (lane 18 owns PoiKits, not
these files).

## Anchors (verified)
- skinWeight: `src/characters/rig/Geo.ts:250`
  `new THREE.Float32BufferAttribute(this.sw, 4)`; contract rows Geo.ts:316
  and Sculpt.ts:512 `['skinWeight', 4, Float32Array]`; enemies
  RigBuilder.ts:85,118,170; NpcShadow.ts:71-76 clones. Switch to
  normalized Uint8 (glTF convention) and update the contract rows +
  `assertAttributeContract` expectations. ~15 MB recorded
  (AttrPack.ts:9, memory-cut.md:232-236).
- AttrPack: `src/engine/AttrPack.ts`; only callers Dungeons.ts:233
  (whole-scene at boot) and :387 (interior on enter). Streamed POIs bypass
  it: add one call where POI kit geometry lands — `src/world/Props.ts`
  (PREBUILD at :113, streaming path nearby). That file is a NAMED
  cross-lane one-liner: explicit-pathspec commit. 115 sites stream (124
  POIs − hammerhead − 8 prebuilt).
- Towns census: recorded 3.70 M resident verts, lestallum 1.34 M +
  galdin_quay 1.28 M (TASKS.md:24, geometry-bake.md:174). They are merged
  per-material + one 670 k-vert shadow proxy (PoiKits.ts:2845,2947 — the
  largest single geometry). Census via
  `src/tools/probes/geofootprint.mts` + `memowners.mts`; cut what no
  camera can reach (interior faces, underside).
- Boot caches: `bakedParts` exists at PartBuilder.ts:261, used only by
  Megastructures (:396,481,769,1108). `Props.landmarks` is
  PartBuilder-shaped WITH a root (Landmarks.ts:121-166) — a bakedParts
  swap, ~46 ms. `Rocks` = two rootless TileStreams (Rocks.ts:2624,2643) —
  needs its own cache entry shape, ~78 ms. `Vegetation.prime` = three
  phases (Vegetation.ts:70-72), 610 ms — cache the RESULT; deleting it is
  a measured negative (hero_full moves 13.359/255, LANDMINES.md); the
  streamer's tile bookkeeping must restore with the matrices.

## Commands
- `node src/tools/bootprof.mts --mem --play --prod` (the exit instrument).
- `node src/tools/probe.mts src/tools/probes/memowners.mts` /
  `geofootprint.mts` for the census.
- After ANY merge: `pnpm run build:full` (plain build deletes the
  painted-face cache without replacing it — 2.5 s cold-boot regression).

## First commits
1. skinWeight Uint8 + contract updates (biggest single win, unblocks lane
   19's 29 NPC rigs).
2. AttrPack call in Props.ts (explicit pathspec, one line).
3. Census report → targeted town cuts.
4. Boot caches, one system per commit, bootprof before/after each.

## Landmines
- "Releasing an index entry frees nothing — every entry carries the whole
  container; one surviving key pinned 134 MB" (STATUS history).
- `performance.memory` is frozen — use bootprof's instrumentation, not the
  browser number.
- Toggling a light's `visible` recompiles 43 programs (9.5 s) —
  LightBudget pins counts; don't touch light visibility while optimizing.

## Done-when
`bootprof --mem --play --prod` reports tab < 800 MB with the corpus
unchanged at floor and boot not regressed (compare docs/BOOT_PERF.md).
