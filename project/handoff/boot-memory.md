# Boot time and memory — phase 3

Contract: `docs/plans/2026-08-22-opus-phase3-boot-and-memory.md` (LOCKED).
Worktree `agent-a371be6dd5beec857`, `PORT=5320`.

## What is done and verified

**The texel bake.** `src/public/baked/` cached the terrain field and nothing
else, which is the whole reason a warm load was only 0.7 s faster than a cold
one. `src/engine/TexBake.ts` + `src/tools/texbake.mts` now cache every keyed
`DataTexture` the world dressing synthesises, the same way and in the same
directory, wired into the same vite plugin.

Measured with `node src/tools/bootprof.mts`, this worktree:

| system | before | after |
|---|---|---|
| Props | 1963 ms | **228 ms** |
| Town | 1465 ms | **422 ms** |
| Dungeons | 1443 ms | **259 ms** |
| the three together | **4871 ms** | **909 ms** |

Verified byte-correct, not just plausible. Five shots captured twice with the
bake and once with `?nobake=1`; `imgdiff.mts` says baked-vs-generated is at the
run-to-run floor for every one of them, to three decimal places:

```
                       baked vs nobake   baked vs baked (the floor)
dun_balouve_entry            0.055              0.055
dun_keycatrich_entry         0.073              0.071
hero_full                    0.960              0.971
poi_dungeon_mouth            1.174              1.190
town_forecourt               0.181              0.183
```

So capture determinism is unchanged and the cache is not an approximation.
`town_forecourt` and `dun_keycatrich_entry` were read as images as well:
`tmp/shots/a371-look/`.

## What the profile actually says, corrected

The plan's table was right about the totals and wrong about two causes. Both
were found by adding `bootPhase` marks inside the systems — those marks are
committed, and re-running `bootprof.mts` is how you check the cost has not
come back.

- **`Dungeons` does not build twelve interiors.** `Dungeon` has been lazy since
  it was written; `Dungeons.init()` builds only the twelve *exteriors*, and its
  1443 ms was the dungeon material kit being touched for the first time. There
  is no lazy-construction work to do here, and none was done.
- **`Props.landmarks` was not the landmarks.** `PropMaterials` is memoised, so
  the whole cost landed on whichever caller touched it first. `Props.mega`
  right behind it read 394 ms for a comparable amount of geometry.
- **`Npcs` costs 2149 ms and is not in the plan's table at all.** It is now the
  single largest system on the boot path. Not my lane — see below.

## Numbers, before and after

Cold boot before this work: **13.66 s wall / 13.16 s in `Game.init()`**
(`--n 3`, this worktree, 2026-08-22).

The wall clock *after* is not yet quotable: three other agents have been live
throughout and the shader warmup — which is GPU-driver work and the most
load-sensitive thing on the boot path — has been measured anywhere between
1731 ms and 11145 ms for the same 150 programs on the same tree. `LANDMINES.md`
already records one number ("`walk` runs at ~57.5 fps") that was never real
because it was taken under load. **Re-run `node src/tools/bootprof.mts --n 3` on
a quiet tree before quoting a wall clock.** The per-system numbers above are
CPU-bound JS and are stable across all runs.

## What is left

1. **Re-measure cold and warm on a quiet tree.** One command.
2. **The shader warmup, 1854 ms for 150 programs, of which `scene` is 1506 ms.**
   The plan's idea is `renderer.compileAsync`. `Warmup.ts` is mine and
   `Warmup.run()` is synchronous; the caller is `PostFX.precompile()`, called
   from `PostFX.render()`, and **`src/engine/PostFX.ts` is not my lane**. Making
   it async is a three-line change there. Do not simply defer the sweep to after
   `GAME.ready`: `_warmPostPasses` renders through the composer and resets the
   temporal history, so running it between a capture's settle frames is a
   determinism risk, which is the one thing that must not regress.
3. **Extend the bake to the systems outside this lane.** The mechanism is
   generic — `bakedTexture` / `bakedNormal` / `bakedDataMap`, a key, and one
   line in `texbake.mts`'s job list. `Npcs` (2149 ms), `Party` (1015 ms) and
   `Minimap` (600 ms) are the candidates and are worth ~3.7 s between them.
4. **Memory.** See the section below; the attribution is measured, the disposal
   question is not yet decided.

## Files touched

- `src/engine/TexBake.ts` — new. Container format, runtime loader, the three
  `bakedX` wrappers, record mode for the bake tool.
- `src/tools/texbake.mts` — new. The Node-side bake and its source hash.
- `src/tools/vite-plugin-bake.mts` — runs `texBake()` beside `bake()`.
- `src/world/town/TownMaterials.ts`, `src/world/props/PropMaterials.ts`,
  `src/world/dungeons/kit/InteriorMaterials.ts` — keyed generators.
- `src/world/Props.ts`, `src/world/town/Hammerhead.ts`,
  `src/world/dungeons/Dungeons.ts` — `await loadTexBake()`, and `bootPhase`
  marks.
- `src/world/props/{Landmarks,Megastructures,Outposts,RoadFurniture,PoiKits,Debris}.ts`
  — the material-table factories are exported so the bake calls the same
  function `build()` calls.
- `src/tools/probes/texcost-a371.mts` — the heap-attribution probe.

## Open questions and hazards

- **`src/world/Props.ts` is the Props *system* and my brief named
  `src/world/props/`.** I treated it as in-lane; the change there is four lines
  (an import, an await, `bootPhase` wrappers).
- **`src/public/baked/` is a symlink to the main checkout in every worktree, so
  the texel cache is shared between agents.** The freshness stamp is computed
  from *this* worktree's sources. Two worktrees with different
  `TownMaterials.ts` will fight over one artifact. Nothing breaks — a hash
  mismatch re-bakes and a miss regenerates — but a boot number taken while
  another worktree owns the cache is not yours.
- The runtime does **not** re-check the source hash; freshness is the vite
  plugin's job, exactly as it already is for `terrain.bin.gz`.
- `tex.bin.gz` is 27.4 MB gz / 61.9 MB raw over 143 textures.
