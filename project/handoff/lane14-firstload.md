# Lane 14 — First load

Owns `src/engine/TexBake.ts`, `src/engine/GeoBake.ts`, `src/tools/bake.mts`,
`src/tools/coldload.mts`. Tasks 42 (instrument) and 43 (tier the bake).
Exit as written: **≤25 MB to first frame, by task 42's own instrument.**

## Headline

**86.6 MB → 72.2 MB to first frame** (`?q=high`, the default and what a real
visitor gets). The plan's exit of 25 MB is a **measured negative**: it is not
reachable from this lane's files, and the reason is structural, not effort — see
"Why 25 MB is unreachable" below. The coordinator has accepted it as a plan
defect and is recording it in `HUMAN_REVIEW.md`.

| | before | after |
|---|---|---|
| bundle | 1.02 | 1.02 |
| `terrain.bin.gz` | 33.20 | **25.51** |
| `tex.bin.gz` | 31.90 | **25.11** |
| `texc.bin.gz` | 20.51 | 20.51 |
| **to first frame** | **86.63** | **72.15** |
| `texd.bin.gz` (deferred, after the frame) | — | 6.79 |
| `geo.bin.gz` (`?q=ultra` only) | 26.89 | 26.89 |

## Task 42 — instrument — LANDED and verified (`bc5e2a0`, ratcheted in `caf5c7a`)

`coldload.mts` measures **bytes to the first frame** rather than bytes to the
whole page.

- WATCH records `firstFrame` = the first `requestAnimationFrame` callback that
  observes `window.GAME.ready === true`. `GAME.ready` is set inside
  `Game.init()` in the same task as the warm `post.render()` before it, so at
  that instant nothing has been presented and `#boot` still covers the screen;
  the first rAF after it is the first moment a person could see the game.
- READ sums transfer twice — everything, and everything whose `responseEnd` is
  at or before `firstFrame`. **Without the cut, task 43 was unmeasurable**: a
  tier landing at t+8 s counted as heavily as a byte the first frame waited for,
  so deferring would have shown zero improvement and would have looked like a
  regression the moment it added a request.
- The gate moved onto `transferFF`; `TRANSFER_MAX` 120 → 90 → **78 MB**; plus a
  new check that the marker fired at all.
- Every `baked/` request is printed with its size and flagged under 10 kB.
- A loud note that `q=high` does not fetch `geo.bin.gz` at all
  (`GeoBake.ts:141,261`, `BAKED_VARIANT = 'ultra'`). `--q ultra` selects the
  harness's load. `--origin <url>` points the instrument at a deployed site
  (**not verified** — no deploy exists; deploy is descoped from this lane).

One defect found and fixed by its own output: `waitForFunction` returns the
instant `GAME.ready` flips, and a tier deferred past the first frame has by
construction not started fetching then — so READ ran before `texd.bin.gz` was
even requested and the report said `deferred past first frame 0.0 MB in 0
requests` for a run where the deferral was working perfectly. That is the same
reading a *missing* file gives, and telling those two apart is the one thing the
column exists to do. `SETTLE` now waits for the resource list to stop growing
(750 ms quiet, 8 s cap) before READ. It cannot inflate the headline —
`transferFF` is cut at the first frame.

### Runs taken

All three were taken on a **contended** tree (`VERDICT: CONTENDED — drawcheck,
framecam, gameplay, probe, sheet, shoot, texbake`), and in all three
`texc.bin.gz` was **absent**, which each run says on its own face.

| run | requests | to first frame | total | first frame at |
|---|---|---|---|---|
| pre-tier `--gate` | 5 | 66.1 MB | 66.1 MB | 9.41 s |
| post-tier `--gate` | 5 | **51.7 MB** | 51.7 MB | 13.04 s |
| post-tier `--q ultra` | 6 | 51.7 MB | 51.7 MB | 10.25 s |
| post-tier, after SETTLE | 6 | **51.7 MB** | 58.5 MB | 10.00 s |

51.7 = terrain 25.5 + tex 25.1 + bundle 1.0. The `q=ultra` run makes six
requests rather than five and the sixth is `geo.bin.gz` at 0.0 MB — a 404,
correctly named. Add the 20.51 MB of `texc` that was pruned out from under every
one of these and the honest first-frame load is **72.15 MB, from 86.63**.

**The last run is the one that proves the deferral**, and it is the deliverable
of both tasks together:

```
over the wire              58.5 MB in 6 requests   (124.8 MB decoded)
** TO FIRST FRAME **       51.7 MB in 5 requests   (first frame at 10.00 s)
deferred past first frame  6.8 MB in 1 requests   <-- off the first frame's bill
     6.8 MB on the wire,  17.3 MB decoded  0.20 s  /baked/texd.bin.gz  [after first frame]
     0.0 MB  /baked/texc.bin.gz   <-- MISSING or 404: the generator ran instead
bootblock: PASS — 15 blocks, worst 1765 ms, 51.7 MB to first frame (58.5 MB total)
```

6.8 MB is fetched, lands, and is **not charged to the first frame** — which is
exactly the reading the pre-task-42 instrument was incapable of producing: it
would have called this 58.5 MB and scored the tiering at zero.

`bootblock` on the *earlier* post-tier run read **FAIL**, and not on the transfer check:
`a first visit stays inside its transfer budget TO THE FIRST FRAME — 51.7 MB,
budget 78.0 MB · ok`, `the first-frame marker fired — 13043 ms · ok`, and the
failure is `worst 4816 ms, budget 3500 ms` on a block labelled **Compiling
shaders**, on a box running seven other lanes' tools with the painted-face cache
absent (so fifteen faces were being drawn from scratch). The same gate read
`worst 1966 ms` earlier the same night. Nothing this lane changed touches shader
compilation: it is a contention reading, not a regression, and the SETTLE run
above read `worst 1765 ms` and PASSED twenty minutes later.

## Task 43 — tiering — two of three landed

### 1. `h` and `far` → `q16d` — LANDED (`c210b72`), −7.69 MB

`encodeQ16D`/`decodeQ16D` had been in `FieldCodec.ts` since the container was
written, `BakeSection` already documented their `min`/`scale` header fields, and
**nothing in the tree ever called either**. The quantiser was built and never
wired. `FieldBake.ts` now writes `h` and `far` as 16-bit grids quantised over
the field's own range and delta-coded along rows; `applyBakedField` dispatches on
section kind so a container written before this decodes rather than being thrown
away.

**Verified, not assumed** — full round trip through the shipping code
(generator → `encodeField` → `applyBakedField`), 4.2 M samples:

```
h:   n=4194304   worst 4.944 mm   mean 2.462 mm
far: n=1048576   worst 3.664 mm   mean 1.796 mm
heightAt() over 20k random world points: worst 4.815 mm
```

`heightcheck`: **PASS**, `worst |gpu - cpu| = 0.000 m` — the GPU and CPU height
paths still agree exactly, which was the real risk (both read the same
quantised field, so the assertion is about desynchronisation, not about the
step). 4.8 mm is three orders of magnitude inside `driftcheck`'s 0.45 m.

`driftcheck`: **PASS** — `SURFACE DRIFT mean 0.000 m worst 0.000 m over 36864
texels`; `gpu vs heightAt worst -0.397 m` (the 1.5 m tessellation floor, not the
quantisation); `0 texels past BOTH 0.45 m and 3x their own sag bound`.

**Looked at**: `vista_dawn` (`tmp/lane14/vista_dawn.jpg`, 16.99 M tris, 626
calls). The mesa profiles, the mid-ground plain and the foreground dune ripples
all hold smooth continuous gradients — no terracing, banding or stair-stepping,
which is precisely the artifact a 9.85 mm step would produce if it were visible
at all. (The blown-out white haze band across the mid-ground and the chunky
cloud edges are Sky/fog, not terrain, and not this lane's.)

`terrain.bin.gz` 33.20 → **25.51 MB**, confirmed on disk after a `vite build`.

Held back: byte-plane-splitting the u16 on top measures 4.80 + 1.30 (a further
−1.13 MB) but changes a documented shared codec's format.

### 2. `dgn/*` → `texd.bin.gz`, fetched after the first frame — LANDED (`cec2353`), −6.79 MB

36 entries, 17.3 MB inflated, 6.79 MB on the wire, none of it read until the
player first walks into a cave — yet `Dungeons.init()` awaited `loadTexBake()`
at boot like every other consumer. Now its own file, written by the same
`texbake` run off the same source hash and stamped in the same `tex.json` (one
bake split across two files, not a second bake, so the two cannot disagree about
their sources). `texIsFresh` requires both.

The fetch starts on `game-ready`, then one rAF, then one task — the smallest
delay that is definitely on the far side of the first *presented* frame. A key
that misses before it lands falls through to the generator, which is correct and
merely slower; `Dungeons.enter()` is player-driven and the fetch is local, so
nothing realistically races it.

**Verified**, by decoding both containers' headers:

```
tex   25107190 bytes  124 entries  {"town":39,"props":82,"sky":3}  hash 93dd55fd5141cf2e
texd   6792428 bytes   36 entries  {"dgn":36}                      hash 93dd55fd5141cf2e
```

One 31.90 MB file became 25.11 + 6.79, same hash, clean namespace split.

`src/tools/bakesources.mts` gained the `ARTIFACTS` row so lane 16's `bakecheck`
can see the new file, and — as a separate authorised cross-lane commit
(`6f580e9`) — `GEO_SOURCES` gained `FieldBake.ts`, which it had always been
missing.

### 3. `texc` mip 0 — NOT TAKEN, −14.4 MB available. See FOR LANE 1.

## FOR LANE 1 — `src/characters/rig/Face.ts`, −14.4 MB, the single biggest item left

`texc.bin.gz` is 132 entries = 12 faces × 11 mip levels. **Level 0 alone is
14.4 MB of the 20.5**; levels 1..10 together are 6.1 MB. Level 0 is a 1024²
canvas per face and it is only ever sampled when a head is drawn larger than
512 px — a cutscene close-up, not gameplay.

`bakedCanvasMips` (`TexBake.ts:318-347`) already accepts a chain that starts
below 1024²: its only structural check is that the chain **ends** at 1×1
(`:336`). So a boot tier of levels 1..10 is served today with no engine change.
What this lane cannot do alone is the upgrade, because it lives in `Face.ts`:

- `faceTexture` (`Face.ts:~1566`) does `new THREE.CanvasTexture(mips[0])`,
  `tex.mipmaps = mips`, `generateMipmaps = false`, then
  `dropCanvasAfterUpload(tex, mips)` — the canvases are freed on first upload,
  so there is nothing left to swap into afterwards.
- Swapping a 1024² base into a texture whose base is 512² changes the base level
  size, so it needs `tex.dispose()`; `tex.image = hi; tex.mipmaps = [hi, ...old];
  tex.needsUpdate = true` and a re-upload, not just `needsUpdate`.

**The shape that works**, if lane 1 has room:

1. `texbake.mts --canvas` writes two files instead of one, exactly as this lane
   just did for `tex`/`texd`: `texc.bin.gz` = levels ≥ 1, `texch.bin.gz` =
   level 0 only. `encodeTexBake` already takes a key filter (`cec2353`), so it
   is one `pack()` call and one `writeFile`.
2. `TexBake.ts` exports `onFaceUpgrade(key, cb)`; `bakedCanvasMips` records
   which keys it served short and calls back when `texch` lands (same
   `game-ready` + rAF + task deferral as `texd`).
3. `Face.ts` registers `(tex, mips)` in that callback instead of dropping them,
   and does the dispose-and-re-upload above. **`dropCanvasAfterUpload` must not
   run for a short-served chain**, or hold the 512² chain only.
4. Assert the level-0 size in the upgrade path. A chain shortened *at the top*
   is silently accepted by design (`TexBake.ts:336`), so a wrong `texch` would
   be invisible.

**The cheap alternative, and why it was not taken:** simply baking faces at 512²
would be one line and −14.4 MB, but `faceTexture`'s generator still draws 1024²,
so a cache *hit* would look different from a cache *miss* — the one thing this
cache promises not to do (`TexBake.ts:311-313`). If `size` drops to 512
everywhere, that promise holds and the whole tier disappears; that is a look
decision for lane 1 and a cutscene close-up, not a bytes decision.

## Why 25 MB is unreachable from these files

The first frame **is** the end of `Game.init()` — all 25 systems. Everything in
the containers except `dgn/*` and `texc` level 0 is consumed before it:
`tex/props` 17.60, `terrain/ctrl` 8.34, `terrain/layer*` 8.28,
`tex/town` 5.74, `terrain/far`+`farCtrl`+`hydro` 4.57, `tex/sky` 1.74. Landing
all three tiers gives about **58 MB**. Deferring anything further does not
remove work, it moves it to a generator that runs *on the boot path anyway*, so
it trades wire bytes for boot seconds one-for-one and the first frame arrives no
sooner.

Reaching 25 MB is a change to *when the first frame happens* — drawing a frame
before every system has initialised. That is `src/game/Game.ts`, shared under
`BRIEF.md` rule 4 and owned by no lane tonight.

## Residue for `project/TASKS.md`

- `texc` mip 0 → deferred tier: −14.4 MB. Needs `Face.ts`. Full patch shape
  above.
- Row-delta before the plane split in `encodePlanes8`: measured −3.4 MB on
  `tex.bin.gz` alone (31.86 → 28.47 at gzip -9), lossless. Changes
  `FieldCodec`'s shared container format, so it wants its own lane.
- Byte-plane-split the `q16d` u16 stream: a further −1.13 MB
  (`h` 5.59 → 4.80, `far` 1.64 → 1.30). Changes `encodeQ16D`'s format.
- `--origin <url>` in `coldload` is written but has never been run against a
  real deployment.
- **`texc.bin.gz` could not be held long enough to measure with.** It was
  pruned five separate times tonight between a bake finishing and a measurement
  starting, because `CANVAS_SOURCES` includes `Face.ts` and lane 1 was
  committing into `Face.ts` all night; every commit by anyone runs `vite build`
  in `pre-commit`, and the plugin can only delete a browser-baked artifact. The
  72.15 MB figure is therefore **arithmetic over artifacts measured on disk**
  (25.51 + 25.11 + 20.51 + 1.02), not a single run. Every `coldload` run this
  lane took prints its own artifact table, so which artifacts each number
  included is on the face of the run.
- **`pnpm run build:full` is not reliable under contention**: the canvas bake
  died with `socket hang up` (ECONNRESET on the page's POST back to the bake
  socket) at 00:31 while the daemon was 4/4 busy with a 54-deep sweep queue. It
  exits non-zero, so `&&` stops the geo bake too. A retry made it work.

## Files owned and touched

Owned: `src/engine/TexBake.ts`, `src/engine/GeoBake.ts` (untouched),
`src/tools/bake.mts` (untouched), `src/tools/coldload.mts`.
Shared, landed as explicit-pathspec commits: `src/world/terrain/FieldBake.ts`,
`src/tools/texbake.mts`, `src/tools/bakesources.mts`.

Two commits used `SKIP_BUILD_CHECK=1` because `pre-commit`'s typecheck was red
on another lane's in-flight `src/world/props/Megastructures.ts` (two unused
declarations), which is not mine to touch. `vite build` and both typechecks were
run by hand first and were clean apart from that file.

## Next step for whoever picks this up

1. On a **quiet** tree with all five artifacts present, run
   `node src/tools/coldload.mts --prod --gate` once and record the real 72 MB
   number. Everything else this lane claims is already verified; this is the
   one figure that is arithmetic rather than a reading.
2. Route the FOR LANE 1 patch above. It is the last −14.4 MB available without
   touching `Game.ts`.
3. `docs/BOOT_PERF.md` still carries the old table and does not mention the
   `q=high`/`q=ultra` geo caveat. Not this lane's file; worth one commit.
