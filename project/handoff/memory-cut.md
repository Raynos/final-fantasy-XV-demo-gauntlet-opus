# memory-cut — §WS-13's memory rows, closed

Successor to `project/archive/handoff/memory-content.md`, which measured all of
this and cut none of it. This lane cuts, and closes what does not pay.

**Headline**, `bootprof --mem --play --prod`, all four bake caches warm, prod
play page:

    browser RSS, whole tree   2 596  ->  2 226 MB
    the tab (renderer)        1 608  ->  1 246 MB

Corpus, cold both sides, against an ablation tree (below): **1 of 142 shots over
its floor**, `hero_portrait` at 0.385 against 0.185, cropped 2× and looked at —
indistinguishable. `check` 19/19. `nanscan` 0 of 142.

Shas `7d08a7f` `80440c2` `070766f` `ca4690f` `88ffc62` `9571915`.

---

## Read this before quoting any number here

**Use the `after a forced GC / RSS` row where you can, and the renderer column
where you cannot.** With three lanes live the pre-GC total swings ±130 MB
between two browser launches inside one run. Both are in the logs under
`scratchpad/memcut/`.

**Three things flap under you, and each one changes what you are measuring.**

- **`geo.bin.gz`** is deleted whenever any lane touches a `GEO_SOURCES` file. A
  co-lane was editing `src/world/terrain/Field.ts` all session, so it vanished
  *twice inside a single `bootprof` run*. The fix is not to re-bake it, it is to
  **delete it deliberately before every arm**: absent in all of them is a
  controlled variable, present in some is a confound.
- **`texc.bin.gz` cannot survive a `bootprof --build <old sha>`.** It is baked
  from the *working tree*, the daemon symlinks `src/public/baked` into every
  materialised tree, and a prod build of a sha whose face sources differ prunes
  it — so that arm, *and every arm after it*, boots with the painted-face cache
  cold. That is a ~135 MB difference inside a memory report. A four-cache A/B is
  only possible between shas whose TEX/GEO sources agree.
- **A before/after corpus diff by sha measures every lane.** `3981aee` against
  HEAD came back **129 of 142 over floor, worst mean 73.0/255** — peak cliff
  bands, drainage incision, tarn beds, graded aprons, the meteor's fissure glow.
  Thirty commits from three other lanes landed inside the window.

All three are now in `project/LANDMINES.md` with the receipts.

## The ablation tree, which is how this lane got a clean answer

`scratchpad/memcut/ablate.sh`: today's HEAD with **only this lane's six files**
put back to their `3981aee` state, built with plumbing and a private index so
the shared worktree and the shared git index are never touched.
`git log 3981aee..HEAD -- <file>` first, to prove each of those six carries
nothing but this lane's commits — it does. `--build <commit>` takes any commit
object, branch or not. Ablation commit `54fe203`.

Against that tree, `texc.bin.gz` and `geo.bin.gz` deleted before **both** arms:

| | ablation | HEAD | delta |
|---|---|---|---|
| browser RSS (mean of 2 launches) | 2 458 | 2 209 | **−249** |
| renderer process | 1 459 | 1 287 | **−172** |
| gpu-process | 838 | 796 | **−42** |
| CPU texel arrays | 108.2 MB | 39.2 | −69 |
| geometry attributes | 274.9 | 241.3 | −33.6 |
| vertex + index, GPU | 318.4 | 284.8 | −33.6 |

−249 MB is a **floor**, because that configuration has `tex.bin.gz` as its only
container: the `texc.bin.gz` container the same commit frees is another 67.1 MB
it could not show.

---

## Row 1 — the 309 MB of bake containers — **LANDED, −249 MB**

**The premise was wrong in a way that made it easy.** It is not that "nothing
releases the store" — it is that **releasing an entry frees nothing**. Every
index entry carries `buf`, the whole inflated container, so `take`'s
`index.delete` removes the *lookup* and not the reference:

    tex.bin.gz   28.5 MB gz -> 67.3 MB raw, 151 entries
                 props 30.1  town 17.3  dgn 17.3  sky 2.5
    texc.bin.gz  20.5 MB gz -> 67.1 MB raw, 132 entries, all `face`

One entry always survives — the 17.3 MB of `dgn/*` belongs to interiors built on
first `Dungeons.enter()` — so **both containers, whole, 134.4 MB, stayed
reachable for the life of the session**. `GeoBake` has the identical shape and
escapes it only because its index does empty on the boot path.

**So the fix is a compaction, not a release**, and that dissolves the call-site
question the plan spent a page on. `compactTexBake()` gives each surviving entry
its own `slice` and drops the containers: **there is no such thing as calling it
too early**, because no key is dropped and no later lookup can miss. That is
deliberately the opposite trade from `releaseGeoBake()`, where one system too
early is a silent cache miss that only surfaces when a player walks into a cave.
Called at the end of `Dungeons.init()`, the last system in `Game.init`'s boot
order.

Interiors verified cold, all three dungeons: `tmp/shots/mc-dun-before/` →
`tmp/shots/mc-dun-after/`, same triangles, same draw calls, looked at.

## Row 2 — 103 MB of CPU texel arrays — **LANDED, and a measured negative**

`dropTexelsAfterUpload` nulls `image.data` from three's own `onUpdate` hook,
wired into `TextureGen.makeTexture` and `TexBake.dress`. The bucket moves and
the process does not:

    CPU texel arrays   103.0 MB over 221 DataTextures  ->  39.2 MB over 62
    post-GC RSS        2 295.1  ->  2 295.8      (+0.7 MB)

**The 103 MB row is real, freeable, and not where the gigabyte is.** Kept
because it is free at the margin and unreachable memory is memory a browser
under pressure can take back — but on this box, against this allocator, it
returns nothing on its own. It rides on a context-loss handler the *next* row
needed anyway.

**The context-loss story**, which is why three passes left this alone. Three
restores a lost context by itself — `onContextLost` calls `preventDefault`,
`onContextRestore` calls `initGLContext()`, every texture re-uploads from
`texture.image` — and with the texels gone that re-upload writes an empty image
and the world comes back with black maps and no error. So
`Renderer._wireContextLoss` watches for `webglcontextrestored` and **reloads the
page**; every texture here is generated from code in the repo, so a reload
rebuilds all of it exactly. Not under `?shoot=1`, where a navigation the daemon
did not ask for destroys an in-flight `page.evaluate`; there it logs an error,
which `uxcheck` asserts on. A later `needsUpdate = true` would upload the same
empty image silently, so after the free `needsUpdate` is shadowed with a
property that names the texture on the console.

## Row 3 — colour and normal as normalised bytes — **LANDED, −58 MB**

`src/engine/AttrPack.ts`. Geometry attributes **275.1 → 241.5 MB** CPU,
`vertex + index` **318.7 → 285.0 MB** on the GPU, gpu-process RSS **−25 MB**,
whole-tree post-GC RSS **−58 MB**. Less than the ~65 MB the row predicted,
because two guards give some of it up on purpose.

Three refusals, all checked rather than assumed: a `color` outside 0..1 keeps
its floats (`Uint8` would flatten an over-bright tint to white); a `normal` that
is not unit length keeps its floats (`Int8` normalised is `max(v / 127, −1)`, so
it clips rather than quantises); and the range check reads the whole array
rather than sampling, because one over-bright vertex in a 700 k-vertex merge is
exactly what a sample misses.

Two guards, and these are about `mergeGeometries`, not pixels: **it returns
null, silently, when one member of a batch is normalised and another is not**,
and a null merge deletes whatever was being built. So nothing under 8 000
vertices and nothing shared by more than one mesh is touched — the small
reusable primitives are what a later merge draws from, and the mass is in
one-off merges that are already finished.

Two call sites, both "this subtree is finished": the end of `Dungeons.init()`,
and `_doEnter` right after an interior's `build()`.

## A find the measuring pass could not have made — 67 MB of canvas pyramids

`bootprof`'s "CPU texel arrays" row walks `texture.image.data`, and **a canvas
has no `data`** — its bitmap lives in the renderer process outside V8 entirely.
So every canvas-backed texture in this game has been invisible to every memory
report ever produced here.

`Face.faceTexture` builds an eleven-level pyramid by hand and assigns it to
`texture.mipmaps`, which three reads exactly once, at upload, and then holds
forever. `texc.bin.gz` says how much: **67.1 MB raw over 132 entries, all
`face`** — twelve pyramids of eleven levels, and the canvases they are painted
into are the same bytes again. `dropCanvasAfterUpload` empties `mipmaps` and
resizes every canvas to 1×1.

One detail that is not incidental: **level 0 is `texture.image`**, and every
GPU-side estimate in this repo reads `texture.image.width`. Shrinking it in
place would have made `bootprof`'s "scene textures" fall by 60 MB without the
GPU freeing a byte — an instrument lying in the direction of the change being
measured. So the canvas is replaced by a plain `{ width, height }` before it is
shrunk.

## Row 4 — 59 MB of boot garbage — **CLOSED, negative, twice over**

1. **There is no `gc()` in a shipped browser.** `bootprof` only sees the drop
   because it launches with `--js-flags=--expose-gc`.
2. **After row 1 the drop is not there to take.** A forced GC returned **57.9 /
   42.1 MB** of process RSS on the baseline and **−1.8 / +3.3 MB** on
   `7d08a7f`. The 59 MB *was* the containers, handed to the collector at the
   moment they finally became unreachable.

## Row 5 — the towns' 21.8 MB shadow proxies — **CLOSED, already landed**

`PartBuilder.shadowProxy` — and its copies in `PoiKits.ts` and `Hammerhead.ts` —
**already build position-only**, and say so in a comment: *"a depth pass binds no
normal, no UV and no vertex colour, so carrying them through the merge would
triple a buffer whose only reader is `gl_Position`."* The arithmetic agrees:
`town_shadow` is 670 619 vertices at 11.2 MB, and 670 619 × 12 B of position
plus a `Uint32` index is 10.7 MB. There is nothing in it but the vertex count.
The row was written from a memowners MB figure without reading the function.

## Row 6 — the ~570 MB unattributed — **CLOSED. It is two instrument facts.**

Neither is free memory and neither is a leak.

1. **A summed `ps` RSS counts the shared framework once per process.** Browser
   process **106 MB RSS against a 25 MB physical footprint**, network utility
   **48 against 8** — about 120 MB of every total this repo has ever quoted is
   one framework counted five times. `bootprof --mem` prints footprint beside
   RSS now (`88ffc62`). It over-reads in the other direction on the gpu-process:
   ~800 MB RSS against ~2 300 MB footprint, and that side is *not* usable — it
   reads within 500 MB of the same value at `q=ultra` and `q=low`, two pages
   whose GPU inventory differs by 88 MB, so it is measuring the GPU address
   space, not this page's share of it.
2. **The renderer mirrors GPU allocations, and `?q=low` proves it.** One
   `bootprof --mem --q low` run. That page drops **88.4 MB** of GPU-side
   resource (render targets 181.1 → 133.0 over 33 → 31 targets, shadow maps
   41.9 → 2.6) while changing **not one byte of content** — scene textures
   205.9 MB and geometry 240 MB, identical to the megabyte — and the browser
   tree falls **112.7 MB**, of which **62 MB comes out of the renderer** and 52
   out of the gpu-process. **0.70 MB of renderer per MB of GPU resource.**
   Extrapolated over the whole 714 MB of GPU-side inventory that is ~500 MB,
   which is the remainder, near enough.

**So the only remaining lever on this number is GPU resources**, and the largest
single one is the **181 MB of render targets across 33 of them**. That is a
`PostFX` question and this lane does not own it; it is written into
`docs/BOOT_PERF.md` rather than handed anywhere.

---

## What a successor would want to know that is not above

- **`AttrPack` does not reach streamed geometry.** The boot pass runs over the
  whole scene at the end of `Dungeons.init()` and the interiors are packed as
  they are built, but the 116 POI sites that stream in during play keep their
  floats. The natural home for a third call is `Props`' streaming completion,
  and the reason it is not there is the `mergeGeometries` guard: a streamed site
  is built *by* merging, so packing has to happen strictly after, and that seam
  was not worth opening on the last afternoon of the plan.
- **`skinWeight` is 20.4 MB of `4x Float32`** and glTF ships it as normalised
  `Uint8` everywhere. It is the same shape as row 3 and would be ~15 MB. Not
  taken: it changes deformation by a quantum, which is a *character* claim, and
  this lane had no instrument that could price it.
- **`bootprof`'s "browser" figure subtracts a `base` measured once**, before the
  first launch, while node's own RSS grows 127 → 217 MB across a run. Some of
  the pre-GC swing is that.
