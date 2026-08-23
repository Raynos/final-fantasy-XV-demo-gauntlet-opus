# Phase 3 — boot time and memory

The two items the human wrote in `project/TODO.md` and nobody has ever worked on:

> - Wow starting a new page takes forever
> - Wow it uses 1.4GB or RAM in ?debug and maybe in prod mode too..

Both are now **measured** rather than impressions. One of the two premises turns
out to be wrong, which changes where the work goes.

Status: IN-PROGRESS (2026-08-23, opus) — phase 3 of
`2026-08-21-opus-rescue-and-sequencing.md`. **Cold boot 13.66 s -> 6.88 s, warm
13.00 -> 6.57**, measured on a quiet tree. The target was under 6 s cold and
under 3 s warm, so this is most of the way and not there; it stays open rather
than being rounded up. Memory is attributed with numbers. Two of this plan's
premises were wrong and are corrected in place below. See
`project/handoff/boot-memory.md`.

---

## 1. Boot — measured

`node src/tools/bootprof.mts`, quiet tree, 2026-08-22:

```
load cold: 13.55 s wall, 12.95 s in Game.init()
load warm: 12.84 s wall, 12.70 s in Game.init()
```

**The warm load is only 0.7 s faster than cold.** That is the headline finding:
essentially *nothing is cached between loads*. Every generated mesh, texture and
field is rebuilt from scratch on every page load, so the browser cache buys
almost nothing. A procedural game that generates everything in code pays this on
every single reload — and this project reloads constantly, both in the dev suite
and in every capture the harness takes.

Per-system `init()`, cold:

| ms | system |
|---|---|
| 1977 | **postfx + compile + warmup** (of which 1722 ms warmup, +150 programs) |
| 1930 | **Props** |
| 1426 | **Town** |
| 1289 | **Dungeons** |
| 970 | Party |
| 602 | Vegetation |
| 600 | Minimap |
| 451 | Sky |
| 412 | Director |
| 358 | Player |
| 314 | Terrain (146 bake, 119 apply, 22 biome, 20 layers, 6 clipmap) |
| 126 | Encounters |
| 118 | Water |

**Four systems are 6.6 s of the 12.95 s.** Terrain — the thing you would assume
is the expensive one — is 314 ms.

### Where the work is

1. **Shader warmup, 1722 ms for 150 programs.** It exists for a good reason: this
   project measured a **15.8 s single-frame freeze** from compiling lights on
   demand, and `engine/LightBudget.ts` pins the counts to stop it. So the warmup
   cannot simply be deleted. The question is whether it can be *deferred* — warm
   the ~40 programs the first frame actually needs, then compile the rest across
   subsequent frames while the title screen is up. **Verify with `?shoot`
   determinism afterwards** (two cold captures must still diff at the noise floor).
2. **`Dungeons` costs 1289 ms and no dungeon is visible at boot.** Twelve interiors
   are built eagerly. This is the clearest candidate for lazy construction: build
   on first `enter()`. Watch the ~9.5 s light-recompile landmine — a dungeon
   entered for the first time mid-play must not stall.
3. **`Props` 1930 ms and `Town` 1426 ms.** Both build the whole world's dressing up
   front. `TileStream.ts` already exists for streaming; find out why props and town
   do not go through it.
4. **`Minimap` 600 ms at boot** for a widget that is not on screen in most shots.

### The bigger lever: cache the bake

`src/public/baked/` already caches the terrain field (a 32 MB deterministic blob
regenerated from our own generators). **Nothing else is cached.** If props, town
and dungeon geometry can be baked the same way — keyed on a source fingerprint,
exactly as `daemon.mts`'s `sourceStamp()` already does — a warm load could skip
most of the 6.6 s. That is the single highest-leverage idea here and it is
untested; prototype it on one system (`Props`) before committing to it.

## 2. Memory — the premise is wrong

Measured with `--enable-precise-memory-info`, after boot plus 4 s settle:

| page | JS heap used | JS heap total | geometries | textures | programs |
|---|---|---|---|---|---|
| prod (`/`) | **470.3 MB** | 513.6 MB | 405 | 251 | 245 |
| `?debug=1` | **409.4 MB** | 459.1 MB | 405 | 251 | 245 |

**`?debug` is not the memory problem — the plain page uses *more* JS heap.** The
dev suite adds no geometries, no textures and no programs. The TODO's "in ?debug
and maybe in prod mode too" has it backwards: it is a *prod* cost that `?debug`
happens to sit on top of.

The 1.4 GB figure is process RSS, not JS heap — it includes GPU-side buffers,
texture memory, and Chromium's own overhead across renderer and GPU processes. So
there are two separate questions and they need separating before any work starts:

1. **Is 470 MB of JS heap justified?** 405 geometries and 251 textures for a world
   this size is not obviously wrong. Find the top retainers with a heap snapshot
   before assuming.
2. **How much is GPU-side, and is any of it duplicated?** Procedural generation
   often keeps the CPU-side `BufferGeometry` arrays alive after upload. If nothing
   calls back into them, disposing the CPU copies could be a large, cheap win.
   **Check first whether anything reads them** — `heightAt`, collision and
   `creaturecheck`'s skinned-AABB probe all walk vertex data.

### First moves

- Take a Chrome heap snapshot on the prod page and rank retainers. Do not
  optimise before this.
- Count how many of the 251 textures are procedurally generated and whether any
  are duplicated per-instance rather than shared at module level. `EnemyBase.ts`
  already shares its detail maps deliberately; check the other generators follow suit.
- Measure GPU memory separately (`WEBGL_debug_renderer_info` plus the renderer's
  own `info.memory`) so the 1.4 GB can be attributed rather than guessed at.

## 3. Definition of done

- [ ] Cold boot **under 6 s**, warm boot **under 3 s** (from 13.55 / 12.84)
- [ ] `pnpm run check` — all 9 gates still green
- [ ] **Capture determinism unchanged**: two cold captures still diff at the
      measured noise floor. Deferring shader warmup is the risk here.
- [ ] The 1.4 GB attributed: JS heap vs GPU vs browser overhead, with numbers
- [ ] A stated, evidenced answer on whether it can come down, even if that answer
      is "no, and here is why"

## 4. Landmines

- **Toggling a light's `visible` recompiled 43 programs — a measured 9.5 s freeze.**
  Any lazy-init work must not move a compile from boot into play.
- **The dev suite must stay invisible to captures.** It refuses to load when
  `?shoot` is present; two cold captures diff at the noise floor. Do not weaken that.
- **`src/public/baked/` is gitignored and regenerated deterministically.** Delete
  it freely; do not check it in.
- Perf numbers taken while agents run are meaningless. Measure on a quiet tree.
