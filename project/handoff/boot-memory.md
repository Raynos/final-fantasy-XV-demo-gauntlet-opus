# Boot time and memory — phase 3

Contract: `docs/plans/2026-08-22-opus-phase3-boot-and-memory.md` (LOCKED).
Worktree `agent-a371be6dd5beec857`, `PORT=5320`.

## The headline

`node src/tools/bootprof.mts --n 3`, quiet tree, before and after:

|  | before | after |
|---|---|---|
| cold | 13.66 s wall / 13.16 s in `Game.init()` | **6.88 s / 6.63 s** |
| warm | 13.00 s / 12.85 s | **6.57 s / 6.44 s** |

**A hair over the plan's 6 s, and that is where the evidence stops.** The
warm-up is 2.06 s of the remaining 6.44 s and it has now been measured to
death — see below. Everything else is under 620 ms.

| system | before | after |
|---|---|---|
| Npcs | 2106 ms | **307 ms** |
| Props | 1963 ms | **169 ms** |
| Town | 1465 ms | **261 ms** |
| Dungeons | 1443 ms | **182 ms** |
| Party | 1001 ms | **298 ms** |
| Player | 365 ms | **122 ms** |
| **the six together** | **8343 ms** | **1339 ms** |

`pnpm run check`: **10/10 gates pass**, run twice.

## What is done and verified

**One mechanism, two artifacts.** `src/public/baked/` cached the terrain field
and nothing else, which is the whole reason a warm load was only 0.7 s faster
than a cold one. Everything procedural is now cached the same way:

- **`tex.bin.gz`** — 27.4 MB gz, 143 textures. The per-texel generators
  (`makeTexture` / `normalFromHeight` / `makeDataMap`), baked under Node in 7 s
  by the vite plugin at server start and on HMR. Hashed against `TEX_SOURCES`.
- **`texc.bin.gz`** — 20.9 MB gz, 15 painted faces. The *drawn* ones:
  `paintFace` builds a 1024² canvas from a million four-octave noise samples and
  hand-builds an eleven-level mip chain, so the only place it exists is inside a
  browser. Baked by `node src/tools/texbake.mts --canvas`, which boots the page
  with `?texbake=canvas`, records instead of reading, and POSTs the compressed
  container back to a socket it holds open. Hashed against `CANVAS_SOURCES`.

**Both verified byte-correct, not plausible.** Baked-vs-`?nobake=1` against the
run-to-run floor, on shots chosen to show what changed:

```
                       baked vs nobake   the floor (baked vs baked)
hero_face                    1.243              1.248
party_formation              1.812              1.823
prompto_closeup              0.311              0.310
town_npcs                    0.260              0.261
town_forecourt               0.181              0.183
dun_keycatrich_entry         0.073              0.071
dun_balouve_entry            0.055              0.055
poi_dungeon_mouth            1.174              1.190
```

Every one at or below its own floor, `prompto_closeup` included — the shot
`project/LANDMINES.md` names as the tight one. **Capture determinism is
unchanged.** Images read: `tmp/shots/a371-face-look/`, `tmp/shots/a371-look/`,
and `tmp/shots/a371-prod/` (the production bundle carries both artifacts into
`dist/baked/`).

## The shader warm-up: closed, with numbers

`renderer.compileAsync` does not help here. `Warmup.runAsync()` is the same
seven-step sweep with the scene compile handed to the parallel path, and
`bootprof.mts --warm-ab` alternates the arms load by load so a machine that
gets busier partway through penalises both equally. Six pairs, `scene` step:

```
sync          1532  1919  1586  1519  1564  1561    median 1562 ms / 112 programs
compileAsync  2133  1601  1591  1627  1547  1621    median 1611 ms / 134 programs
```

`KHR_parallel_shader_compile` is present and the path works. It is **3%
slower**. Per program the driver is marginally cheaper (12.0 ms against 13.9),
but `compileAsync` resolves a larger set — 134 against 112, because it waits on
every material in the graph rather than the subset `compile` defers — and that
eats the difference.

Going async also is not free: `Game.init` calls `post.render()` and sets `ready`
on the next line without awaiting, so an async sweep finishes *after* the
harness has been told the page is ready. Pixels stay correct; work moves into
the window a capture settles in. Not worth spending capture determinism on a 3%
loss.

`runAsync` and `--warm-ab` are kept rather than deleted: the claim is "on this
GPU, with this driver", and the next person should be able to re-check it in one
command on theirs.

**What would move the warm-up is fewer programs, not faster compilation.** 112
programs at ~14 ms is the cost; the page holds 228 in total. That is a
material-architecture question across every lane, not a boot question.

## Memory: measured, and the premise needs correcting twice

`bootprof.mts --mem`, M5 Max, ANGLE Metal (a real GPU — the tool prints the
renderer string), a fresh browser launch per variant, 4 s settle:

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

1. **`?debug=1` costs 4 MB.** The TODO's premise is wrong, as the plan said.
2. **The plan's correction was wrong the other way.** It recorded `?debug` as
   using *less* JS heap than prod (409 vs 470 MB). That is an artifact:
   navigating one tab from prod to `?debug` does not free the first world, so
   whichever page went second was charged with the first. With a launch each
   they are within 4 MB.
3. **The 1.4 GB is real and it is process RSS**, ~1.69 GB here over an idle
   browser. Of the renderer's 1179 MB, 498 MB is JS heap the page can see; the
   rest is V8 metadata, ANGLE's client-side buffers and the CPU staging copies
   Metal keeps of every upload.

**Can it come down?** A little, and not by much. **94 MB** of CPU-side texel
arrays are dead weight once uploaded and nothing reads a texel back — the one
clean win, 5% of the total, and **not attempted here**: freeing it correctly
needs `onUpload`-style disposal per texture, and a WebGL context loss then
re-uploads from nothing. That is a real change with a real failure mode and
deserves its own measured pass. **96 MB** of geometry arrays are *not*
disposable — `heightAt`, collision and `creaturecheck`'s skinned-AABB probe all
walk vertex data. **279 MB** of GPU-side textures and buffers is the world. The
remaining ~1.1 GB is Chromium's and no change in this repo moves it.

## What the profile said that the plan did not

Each found by adding `bootPhase` marks *inside* the systems. Those marks are
committed, and re-running `bootprof.mts` is how the next agent checks the cost
has not come back.

- **`Dungeons` builds no interiors.** `Dungeon` has been lazy since it was
  written; `init()` builds only the twelve *exteriors*, and its 1443 ms was the
  material kit's first touch. No lazy-construction work was needed, so the 9.5 s
  light-recompile landmine was never approached.
- **`Props.landmarks` was never the landmarks.** `PropMaterials` is memoised, so
  the whole cost landed on the first caller. `Props.mega`, one line below, read
  394 ms for comparable geometry.
- **Props and Town already use `TileStream`** where it applies — Rocks, Debris
  and Wildlife. The cost was never the scatter.
- **`Npcs` was the largest system on the boot path and was not in the plan's
  table at all.** It was one thing: fifteen painted faces at ~190 ms each.

## What is left

1. **`Minimap` 616 ms** — `getChart(terrain)`, a 2048² world image off the
   terrain's own elevation grid. It is derived from the *baked* field, so it
   belongs either in `terrain.bin.gz` or in `texc.bin.gz` keyed on the terrain
   sources. The mechanism is there; nobody has keyed it.
2. **`Vegetation` 618 ms, `Terrain` 615 ms, `Sky` 487 ms, `Director` 445 ms** —
   the long tail. `Terrain.bake` is 435 ms of the 615 and is already a cache
   read (a 32 MB inflate).
3. **The warm-up, 2.06 s** — closed against `compileAsync`; open only against
   reducing the program count, which is not a boot-lane question.
4. **The 94 MB of CPU texel copies**, above.

## Files touched

- `src/engine/TexBake.ts` — new. Container format, the two-artifact loader, the
  three `bakedX` wrappers, `bakedCanvasMips`, record mode, `postRecording`.
- `src/tools/texbake.mts` — new. Node bake, browser bake, both source hashes,
  `pruneStaleCanvasBake`.
- `src/tools/bootprof.mts` — `--mem`, `--warm-ab`.
- `src/tools/vite-plugin-bake.mts` — runs `texBake()` beside `bake()`, re-bakes
  on HMR, deletes a stale canvas artifact.
- `src/engine/Warmup.ts`, `src/engine/PostFX.ts` — `runAsync()` behind
  `?warm=async`, and `warmupDone` for the measurement to await.
- Keyed generators: `src/world/town/TownMaterials.ts`,
  `src/world/props/PropMaterials.ts`,
  `src/world/dungeons/kit/InteriorMaterials.ts`, `src/characters/rig/Face.ts`.
- Call sites: `src/world/Props.ts`, `src/world/town/Hammerhead.ts`,
  `src/world/dungeons/Dungeons.ts`, `src/characters/npc/NpcRig.ts`,
  `src/characters/rig/Character.ts`, and the six exported prop material tables.
- `project/LANDMINES.md` — the stale-bake entry, and `--prod` leaving a preview.
- `src/tools/probes/texcost-a371.mts`, `src/tools/probes/compileasync-a371.mts`.

## Hazards

- **`node src/tools/texbake.mts --canvas` is not automatic and cannot be.** It
  boots the page, so it cannot run from the vite plugin — the plugin needs the
  server that is starting. What the plugin does instead is **delete** a stale
  `texc.bin.gz` and say so, because the runtime cannot tell stale from fresh.
  Deleting costs the boot time it was saving; serving costs fifteen faces that
  no longer match their sculpt, with no symptom. **After a merge that touches
  anything in `CANVAS_SOURCES`, re-run it.**
- **`CANVAS_SOURCES` is deliberately wide** — `Sculpt.ts`, `Anatomy.ts`,
  `Skeleton.ts` and both cast tables. The face map is authored in canonical head
  metres and projected through the head's own UV, so the *sculpt* moves those
  pixels. A generator missing from either source list is a silently stale cache.
- **`src/public/baked/` is a symlink to the main checkout from every worktree**,
  so both caches are shared between concurrently running agents while the
  freshness stamps come from whichever worktree baked last. Nothing breaks, but
  a boot number taken while another worktree owns the cache is not yours. Run
  `texbake.mts --force` and `texbake.mts --canvas --force` once after merging.
- **`shoot.mts --prod` leaves a `vite preview` on your `PORT`** and nothing
  afterwards refuses to reuse it. Three of my measurements were silently taken
  against a stale `dist/`. Now in `LANDMINES.md`.
- `Town.materials` still costs 241 ms: the 35 sign faces are `canvasTexture`
  calls that are not keyed. They could go into `texc.bin.gz` now that the
  browser bake exists — the mechanism is `bakedCanvasMips`, they only need keys.
