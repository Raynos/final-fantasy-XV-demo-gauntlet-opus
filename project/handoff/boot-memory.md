# Boot time and memory — phase 3

Contract: `docs/plans/2026-08-22-opus-phase3-boot-and-memory.md` (LOCKED).
Worktree `agent-a371be6dd5beec857`, `PORT=5320`.

## The headline

`node src/tools/bootprof.mts --n 3`, same worktree, same machine, before and
after, both on a quiet tree:

|  | before | after |
|---|---|---|
| cold | 13.66 s wall / 13.16 s in `Game.init()` | **9.17 s / 8.97 s** |
| warm | 13.00 s / 12.85 s | **8.99 s / 8.87 s** |

**Not under the plan's 6 s, and it cannot get there from this lane.** The three
systems this lane owns cost 4.87 s of the original 13.16 s and now cost 0.62 s.
Everything still on the boot path belongs to someone else — see *What another
lane should pick up*.

| system | before | after |
|---|---|---|
| Props | 1963 ms | **174 ms** |
| Town | 1465 ms | **267 ms** |
| Dungeons | 1443 ms | **176 ms** |
| the three together | **4871 ms** | **617 ms** |

`npm run check`: **10/10 gates pass**.

## What is done and verified

**The texel bake.** `src/public/baked/` cached the terrain field and nothing
else, which is the whole reason a warm load was only 0.7 s faster than a cold
one. `src/engine/TexBake.ts` + `src/tools/texbake.mts` now cache every keyed
`DataTexture` the world dressing synthesises, in the same directory, wired into
the same vite plugin, content-hashed against the same kind of source list.
27.4 MB gz / 61.9 MB raw over 143 textures.

Verified byte-correct, not just plausible. Five shots captured twice with the
bake and once with `?nobake=1`; `imgdiff.mts` says baked-vs-generated sits at
the run-to-run floor for every one of them, to three decimal places:

```
                       baked vs nobake   baked vs baked (the floor)
dun_balouve_entry            0.055              0.055
dun_keycatrich_entry         0.073              0.071
hero_full                    0.960              0.971
poi_dungeon_mouth            1.174              1.190
town_forecourt               0.181              0.183
```

So **capture determinism is unchanged** and the cache is not an approximation.
`town_forecourt` and `dun_keycatrich_entry` were read as images in dev and again
against `--prod`: `tmp/shots/a371-look/`, `tmp/shots/a371-prod/`. The production
bundle carries `dist/baked/tex.bin.gz` the same way it already carried
`terrain.bin.gz`.

**The memory attribution.** `node src/tools/bootprof.mts --mem`. Numbers and
methodology are in commit `a4bdce5`; the short version is below.

## What the profile actually says, corrected

The plan's totals were right and two of its causes were wrong. Both were found
by adding `bootPhase` marks *inside* the systems — those marks are committed,
and re-running `bootprof.mts` is how the next agent checks the cost has not come
back.

- **`Dungeons` does not build twelve interiors.** `Dungeon` has been lazy since
  it was written; `Dungeons.init()` builds only the twelve *exteriors*, and its
  1443 ms was the dungeon material kit being touched for the first time. There
  was no lazy-construction work to do, and none was done — which also means the
  9.5 s light-recompile landmine was never approached.
- **`Props.landmarks` was not the landmarks.** `PropMaterials` is memoised, so
  the whole cost landed on whichever caller touched it first. `Props.mega`, one
  line below it, read 394 ms for a comparable amount of geometry.
- **`Props` and `Town` do go through `TileStream`** where streaming is the right
  answer: `Rocks`, `Debris` and `Wildlife` all use it already. The plan's third
  item assumed they did not. The cost was never the scatter.
- **`Npcs` costs 2106 ms and is not in the plan's table at all.** It is now the
  largest single system on the boot path.

## Memory: measured, and the premise needs correcting twice

`bootprof.mts --mem`, M5 Max, ANGLE Metal (a real GPU — the tool prints the
renderer string so this is checkable rather than assumed), fresh browser launch
per variant, 4 s settle:

```
plain page   1942.7 MB RSS        ?debug=1   1938.9 MB RSS
  renderer     1179 MB              renderer     1176 MB
  gpu-process   572 MB              gpu-process   571 MB
  utility        78 MB              utility        78 MB
  JS heap       498 MB              JS heap       500 MB
    CPU texel arrays     94.0 MB  over 195 DataTextures
    geometry attributes  82.3 MB + 14.0 MB index, 430 geometries
    everything else     308.1 MB
  GPU-side estimate (three's own inventory)  279.3 MB
```

1. **`?debug=1` costs 4 MB.** The TODO's premise is wrong, as the plan said.
2. **But the plan's correction was wrong in the other direction.** It recorded
   `?debug` as using *less* JS heap than prod (409 vs 470 MB). That is a
   measurement artifact: navigating one tab from prod to `?debug` does not free
   the first world, so whichever page went second was charged with the first.
   With a browser launch each they are within 4 MB. Neither page is cheaper.
3. **The 1.4 GB is real and it is process RSS**, ~1.69 GB here over an idle
   browser: 1179 MB renderer + 572 MB GPU process + 78 MB utility. Of the
   renderer's share, 498 MB is JS heap the page can see; the other ~680 MB is
   V8 metadata, ANGLE's client-side buffers and the CPU staging copies Metal
   keeps of every upload.

**Can it come down?** The honest answer is *a little, and not by much*:

- **94 MB** of CPU-side texel arrays are dead weight once uploaded. three keeps
  `image.data` alive and nothing in this game reads a texel back. This is the
  one clean win and it is 5% of the total. It was **not** attempted here because
  freeing it correctly needs `onUpload`-style disposal per texture and a WebGL
  context loss then re-uploads from nothing; that is a real change with a real
  failure mode and it deserves its own measured pass, not the last hour of one.
- **96 MB** of geometry attribute arrays are *not* disposable: `heightAt`,
  collision and `creaturecheck`'s skinned-AABB probe all walk vertex data, which
  the plan already warned about and which checks out.
- **279 MB** of GPU-side textures and buffers is the world. 230 textures with
  mips is 183 MB and that is what a world this size costs.
- The remaining ~1.1 GB is Chromium's, not ours, and no change in this repo
  moves it.

## What another lane should pick up

**Extend the bake.** The mechanism is generic and the cost of adopting it per
system is one key per texture plus one line in `texbake.mts`'s job list:
`bakedTexture(key, size, fn)`, `bakedNormal(key, size, heightFn, strength)`,
`bakedDataMap(key, size, fn)`. The remaining boot profile, cold:

```
  2106 ms  Npcs
  1996 ms  postfx + compile + warmup   (of which warmup 1744, scene 1506)
  1001 ms  Party
   665 ms  Minimap
   602 ms  Vegetation
```

`Npcs`, `Party` and `Minimap` are 3.77 s between them and are the same shape of
cost this lane just removed. That, plus the warmup, is what stands between 9.17 s
and the plan's 6 s.

**The shader warmup, 1744 ms for 150 programs, `scene` alone 1506 ms for 110.**
`Warmup.ts` is in this lane and `Warmup.run()` is synchronous; its caller is
`PostFX.precompile()`, called from `PostFX.render()`, and **`src/engine/PostFX.ts`
is not.** Two things the next agent should know before touching it:

- `KHR_parallel_shader_compile` **is present** on this stack.
  `src/tools/probes/compileasync-a371.mts` A/Bs `compile` against
  `compileAsync`, and on that probe's content `compileAsync` was **14× slower**
  (208 ms vs 15 ms for 24 programs) — but the probe could not reproduce the real
  per-program cost (0.6 ms each against the warmup's 13.7 ms), because cloning a
  material and adding an unread `#define` changes three's program key without
  changing the GLSL that ANGLE compiles. So what it measured is `compileAsync`'s
  **polling latency, about 8.7 ms per program**, and the parallelism win is
  unproven either way. It has to be measured in the warmup itself.
- **Do not simply defer the sweep past `GAME.ready`.** `_warmPostPasses` renders
  through the composer and resets the temporal history; running it between a
  capture's settle frames is exactly the determinism regression that was closed
  tonight.

## Files touched

- `src/engine/TexBake.ts` — new. Container format, runtime loader, the three
  `bakedX` wrappers, record mode for the bake tool.
- `src/tools/texbake.mts` — new. The Node-side bake and its source hash.
- `src/tools/bootprof.mts` — `--mem`.
- `src/tools/vite-plugin-bake.mts` — runs `texBake()` beside `bake()`.
- `src/world/town/TownMaterials.ts`, `src/world/props/PropMaterials.ts`,
  `src/world/dungeons/kit/InteriorMaterials.ts` — keyed generators.
- `src/world/Props.ts`, `src/world/town/Hammerhead.ts`,
  `src/world/dungeons/Dungeons.ts` — `await loadTexBake()`, `bootPhase` marks.
- `src/world/props/{Landmarks,Megastructures,Outposts,RoadFurniture,PoiKits,Debris}.ts`
  — material-table factories exported so the bake calls the same function
  `build()` calls.
- `src/tools/probes/texcost-a371.mts`, `src/tools/probes/compileasync-a371.mts`.

## Open questions and hazards

- **`src/world/Props.ts` is the Props *system* and the brief named
  `src/world/props/`.** Treated as in-lane; the change is four lines.
- **`src/public/baked/` is a symlink to the main checkout in every worktree, so
  the texel cache is shared between agents.** The freshness stamp is computed
  from *this* worktree's sources, so two worktrees with different
  `TownMaterials.ts` will re-bake over each other. Nothing breaks — a hash
  mismatch re-bakes, a missing key regenerates — but **a boot number taken while
  another worktree owns the cache is not yours.** After merging, run
  `node src/tools/texbake.mts --force` once.
- The runtime does not re-check the source hash; freshness is the vite plugin's
  job, exactly as it already is for `terrain.bin.gz`.
- `Town.materials` still costs 243 ms. That residual is the 35 sign faces, which
  are `canvasTexture` calls: they are drawn rather than computed and Node has no
  canvas, so they are deliberately not keyed. Baking them would need the bake to
  run in a browser rather than in Node.
- Anything that calls `disposeInteriorMaterials()` and rebuilds will regenerate
  rather than hit the cache: an entry is dropped from the index once served.
  That is correct, just slower, and only on a path nothing takes at boot.
