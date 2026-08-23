# Phase 3 — boot time and memory

The two items the human wrote in `project/TODO.md` and nobody has ever worked on:

> - Wow starting a new page takes forever
> - Wow it uses 1.4GB or RAM in ?debug and maybe in prod mode too..

Both are now **measured** rather than impressions. One of the two premises turns
out to be wrong, which changes where the work goes.

Status: IN-PROGRESS (2026-08-23, opus) — phase 3 of
`2026-08-21-opus-rescue-and-sequencing.md`. **Cold boot 13.66 s -> 6.88 s, warm
13.00 -> 6.57**, measured on a quiet tree. The target was under 6 s cold and
under 3 s warm, so this is most of the way and **not there**; it stays open
rather than being rounded up. Memory is attributed with numbers. **Three of this
plan's premises turned out to be wrong — including one of its own corrections —
and all three are corrected in place below.** 3 of 5 definition-of-done items
met; see §3. Full account in `project/handoff/boot-memory.md`.

**What shipped:** `src/tools/texbake.mts`, `src/engine/TexBake.ts`, and two new
cache artifacts beside the terrain field — `tex.bin.gz` (27.4 MB, 143 generated
textures) and `texc.bin.gz` (20.9 MB, 15 painted faces that only a browser can
draw). Both hashed against explicit source lists (`TEX_SOURCES`,
`CANVAS_SOURCES`). **`pnpm run build` deletes the painted-face cache without
replacing it — use `build:full`, or cold boot silently regresses to ~9 s.**

**What did not:** the ~94 MB of CPU-side texel arrays that are dead weight once
uploaded. It is the one clean memory win, it is identified, and it was
deliberately **not attempted** — freeing it correctly needs per-texture
`onUpload` disposal, and a WebGL context loss then re-uploads from nothing.

---

## 1. Boot — measured

`node src/tools/bootprof.mts`, quiet tree, 2026-08-22 — **the before state.**
Everything in this section is the diagnosis, not the current numbers; the after
column is in the table below it and in `project/handoff/boot-memory.md`.

```
load cold: 13.55 s wall, 12.95 s in Game.init()
load warm: 12.84 s wall, 12.70 s in Game.init()
```

| system | before | after |
|---|---|---|
| Npcs | 2106 ms | **307 ms** |
| Props | 1963 ms | **169 ms** |
| Town | 1465 ms | **261 ms** |
| Dungeons | 1443 ms | **182 ms** |
| Party | 1001 ms | **298 ms** |
| Player | 365 ms | **122 ms** |
| **the six together** | **8343 ms** | **1339 ms** |

**None of it came from the four levers §1 goes on to name.** It came from
caching the *textures* — which is why the diagnosis below is kept: it is a good
example of a correct measurement pointing at the wrong fix. `Props` was never
1930 ms of building props; it was 1930 ms of generating the textures props ask
for on the way up.

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

### Where the work is — the original diagnosis, and what it got wrong

> **Resolved differently, 2026-08-22.** Item 1 stands and is now the *whole*
> remaining cost. Items 2, 3 and 4 were **not** done and did not need to be:
> lazy dungeons, streaming props/town and a deferred minimap were all made moot
> by the texture bake. **Nothing in the game was made lazy.** If you come here
> looking for work, item 1 is the only live one.

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

## 2. Memory — the premise is wrong, and so was this section's first correction

> **Superseded 2026-08-22.** The table below was taken by navigating **one**
> browser tab from prod to `?debug`, which does not free the first world — so
> whichever page went second was charged with the first one's ~230 MB. It is
> kept only because the mistake is instructive. The corrected numbers, one
> fresh browser launch per variant, follow it.

| page | JS heap used | JS heap total | geometries | textures | programs |
|---|---|---|---|---|---|
| prod (`/`) | ~~470.3 MB~~ | ~~513.6 MB~~ | 405 | 251 | 245 |
| `?debug=1` | ~~409.4 MB~~ | ~~459.1 MB~~ | 405 | 251 | 245 |

**Corrected, `bootprof.mts --mem`, a fresh launch per variant, 4 s settle:**

| | plain page | `?debug=1` |
|---|---|---|
| process RSS | **1942.7 MB** | 1938.9 MB |
| renderer | 1179 MB | 1176 MB |
| gpu-process | 572 MB | 571 MB |
| JS heap | 498 MB | 500 MB |

**`?debug=1` costs 4 MB.** The TODO's premise is wrong — the dev suite is not
where the memory is — but so was this plan's first correction, which had prod
using *more* heap than `?debug`. With a launch each they are within 4 MB and
neither claim of a difference survives. The dev suite adds no geometries, no
textures and no programs.

Of the 498 MB of JS heap: **94.0 MB** CPU texel arrays over 195 `DataTexture`s,
**82.3 MB + 14.0 MB** geometry attributes and indices over 430 geometries, and
308.1 MB everything else. Three's own inventory puts **279.3 MB** GPU-side. The
remaining ~1.1 GB is Chromium's — V8 metadata, ANGLE's client-side buffers, and
the CPU staging copies Metal keeps of every upload — and nothing in this repo
moves it.

The 1.4 GB figure is process RSS, not JS heap — it includes GPU-side buffers,
texture memory, and Chromium's own overhead across renderer and GPU processes. It
measures ~1.94 GB here, over an idle browser's ~0.25 GB. The two questions this
section said to separate, and their answers:

1. **Is ~500 MB of JS heap justified?** Broadly yes. 430 geometries and 195
   data textures for a world this size is not obviously wrong, and the heap
   snapshot found no runaway retainer.
2. **How much is GPU-side, and is any of it duplicated?** 279 MB GPU-side, and
   the duplication is real but *one-directional*: the CPU texel arrays (94 MB)
   are dead after upload and could go; the CPU geometry arrays (96 MB) **could
   not** — `heightAt`, collision and `creaturecheck`'s skinned-AABB probe all
   walk vertex data, exactly as this line warned. Checking first is what stopped
   a 96 MB "win" from breaking collision.

### First moves — all three done

- [x] Take a Chrome heap snapshot on the prod page and rank retainers. Do not
      optimise before this. *(Done, and the ranking is the §2 breakdown. The
      instruction held: nothing was optimised before it, and the snapshot is
      what showed that the 96 MB of geometry arrays are **not** free to drop.)*
- [x] Count how many of the 251 textures are procedurally generated and whether
      any are duplicated per-instance rather than shared at module level.
      *(195 `DataTexture`s carrying 94.0 MB of CPU texel arrays, plus 15 painted
      canvas faces. They are shared, not duplicated — the win here is disposing
      the CPU copies after upload, not de-duplicating them.)*
- [x] Measure GPU memory separately so the 1.4 GB can be attributed rather than
      guessed at. *(`bootprof.mts --mem` now splits RSS by Chromium
      `--type=` and prints three's own `info.memory`. It needs
      `--enable-precise-memory-info` and **a fresh browser launch per variant**,
      or it charges one page with the other's world.)*

## 3. Definition of done

Ticked 2026-08-23 against the tree. **3 of 5** — this plan is **not** done.

- [ ] Cold boot **under 6 s**, warm boot **under 3 s** (from 13.55 / 12.84).
      **MISSED: 6.88 / 6.57.** Most of the way, not there. The remaining
      6.44 s is 2.06 s of shader warm-up and nothing else over 620 ms, and
      the warm-up has been measured to exhaustion — see §1. **What would move
      it is fewer programs, not faster compilation** (112 linked at ~14 ms
      each, 228 held in total), and that is a material-architecture question
      across every lane, not a boot question.
- [x] `pnpm run check` — all gates still green. *(Was 9 gates when this was
      written; the suite is now **12** without `--perf`, 14 with. Do not read the
      old "9/9" in this file or elsewhere as current.)*
- [x] **Capture determinism unchanged**: two cold captures still diff at the
      measured noise floor. Deferring shader warmup is the risk here.
      *(Baked vs `?nobake=1` at or below each shot's own floor across eight
      shots, `prompto_closeup` — the one `LANDMINES.md` calls tight —
      included. The warmup was **not** deferred, so the risk did not
      materialise.)*
- [x] The 1.4 GB attributed: JS heap vs GPU vs browser overhead, with numbers.
      *(§2 above.)*
- [x] A stated, evidenced answer on whether it can come down, even if that
      answer is "no, and here is why". *(**A little, and not by much.** 94 MB
      of CPU texel arrays is the one clean win and is not attempted; 96 MB of
      geometry arrays is **not** disposable — `heightAt`, collision and
      `creaturecheck`'s skinned-AABB probe all walk vertex data; 279 MB of
      GPU-side data is the world; the remaining ~1.1 GB is Chromium's.)*

## 4. Landmines

- **Toggling a light's `visible` recompiled 43 programs — a measured 9.5 s freeze.**
  Any lazy-init work must not move a compile from boot into play.
- **The dev suite must stay invisible to captures.** It refuses to load when
  `?shoot` is present; two cold captures diff at the noise floor. Do not weaken that.
- **`src/public/baked/` is gitignored and regenerated deterministically.** Delete
  it freely; do not check it in.
- Perf numbers taken while agents run are meaningless. Measure on a quiet tree.
