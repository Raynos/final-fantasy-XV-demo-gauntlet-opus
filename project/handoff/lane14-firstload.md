# Lane 14 — First load

Owns `src/engine/TexBake.ts`, `src/engine/GeoBake.ts`, `src/tools/bake.mts`,
`src/tools/coldload.mts`. Tasks 42 (instrument) and 43 (tier the bake).
Exit as written: **≤25 MB to first frame, by task 42's own instrument.**

## Status: in progress

### Task 42 — instrument — LANDED (`bc5e2a0`), not yet run end-to-end

`coldload.mts` now measures **bytes to the first frame** rather than bytes to
the whole page.

- WATCH records `firstFrame` = the first `requestAnimationFrame` callback that
  observes `window.GAME.ready === true`. `GAME.ready` is set inside
  `Game.init()` (`Game.ts:340`) in the same task as the warm `post.render()`
  before it, so at that instant nothing has been presented and `#boot` still
  covers the screen; the first rAF after it is the first moment a person could
  see the game.
- READ sums transfer twice — everything, and everything whose `responseEnd` is
  at or before `firstFrame`. Without the cut a deferred tier landing at t+8 s
  counts as heavily as a byte the first frame waited for, so tiering would have
  measured as **zero improvement**.
- The gate moved onto `transferFF`, `TRANSFER_MAX` 120 MB → 90 MB, plus a
  second check that the marker fired at all.
- Every `baked/` request is now printed with its size and flagged under 10 kB.
  A missing artifact is silent by design (every path regenerates), so a
  first-load number taken while `geo.bin.gz`/`texc.bin.gz` were pruned reads as
  a *good* number — that is how the plan's 85.5 MB got written down.
- A loud note that `q=high` (the default, and what a real visitor gets) does not
  fetch `geo.bin.gz` at all — `GeoBake`'s `BAKED_VARIANT` is `ultra`
  (`GeoBake.ts:141,261`). `--q ultra` selects the harness's load.
- `--origin <url>` points the same instrument at a deployed site. **Not
  verified** — no deploy exists (the human owns the public URL; deploy is
  descoped from this lane).

**Not verified yet:** no coldload run has been taken since the edit.

### Measured decomposition (this is the real ground, replacing the plan's 85.5)

`?q=high` — the default and a real visitor's load — fetches five things:
bundle ~1.0, `terrain.bin.gz` 33.2, `tex.bin.gz` 31.9, `texc.bin.gz` 20.5 ≈
**86.6 MB**. `?q=ultra` adds `geo.bin.gz` 30.8 ≈ **117 MB / 6 requests**. Both
numbers are true of their own arm; the plan quoted a q=high run as if it were
the whole load.

`tex.bin.gz` by namespace (gzip -9, measured off the live container, MB):

| namespace | entries | inflated | gz | gz + row delta |
|---|---|---|---|---|
| props | 82 | 37.22 | **17.60** | 15.75 |
| dgn | 36 | 17.30 | **6.78** | 5.97 |
| town | 39 | 17.30 | **5.74** | 5.31 |
| sky | 3 | 2.54 | **1.74** | 1.43 |

`terrain.bin.gz` by section (MB):

| section | kind | inflated | gz |
|---|---|---|---|
| h | f32planes | 16.78 | **11.98** |
| ctrl | planes8 | 16.78 | **8.34** |
| layerSurf | planes8 | 6.29 | 3.58 |
| layerAlbedo | planes8 | 6.29 | 2.97 |
| far | f32planes | 4.19 | 2.94 |
| layerDetail | planes8 | 2.10 | 1.73 |
| farCtrl | planes8 | 4.19 | 0.85 |
| hydro | planes8 | 1.05 | 0.78 |

### Task 43 — tiering — in progress

Three candidates, in payoff order, all measured before any code was written:

1. **`h`/`far` → `q16d`** (u16 quantise + row delta). `encodeQ16D`/`decodeQ16D`
   already exist in `FieldCodec.ts` and `BakeSection` already documents the
   `min`/`scale` fields — **the codec was built and never wired**. Measured:
   `h` 11.98 → 5.59, `far` 2.94 → 1.64. **−7.7 MB**, max height error 4.9 mm.
   Byte-plane-splitting the u16 on top gives 4.80 + 1.30 (**−8.8 MB**) but
   changes a documented shared codec's format, so it is held back.
2. **`tex` `dgn/*` deferred** past the first frame — `dgn` is only consumed on
   the first `Dungeons.enter()`, minutes after boot. **−6.8 MB**, no fallback
   needed.
3. **`texc` mip 0 deferred** — **−14.4 MB**, the single biggest item, and the
   one this lane cannot land alone. See "cross-boundary" below.

## The exit, honestly

**≤25 MB is not reachable from inside this lane's files.** Everything except
`dgn/*` and `texc` mip 0 is consumed *before* the first frame, because the first
frame is the end of `Game.init()` — all 25 systems. Landing all three items
above gives 86.6 − 29 ≈ **58 MB**. To reach 25 the remaining 33 MB
(`props` 17.6, `ctrl` 8.3, `layer*` 8.3) would have to be deferred past a frame
that currently cannot be drawn until they arrive; that is a change to *when the
first frame happens* — `Game.ts`, not this lane.

## Cross-boundary / residue

- `texc` mip 0 (−14.4 MB) needs `src/characters/rig/Face.ts`. Truncating the
  baked chain at 512² without changing `faceTexture`'s `size` would make a
  cache hit look different from a cache miss, which is the one thing this cache
  promises not to do. Either `size` drops to 512 permanently (one line, needs an
  eye on a cutscene close-up) or a deferred upgrade path re-uploads mip 0, which
  fights `dropCanvasAfterUpload`.
- Row-delta on `encodePlanes8` is a further −3.4 MB on `tex.bin.gz` alone,
  lossless, but changes `FieldCodec`'s shared format.
- Lane 16's bake-artifact gate (task 46) and any new tier file must agree.

## Landmines hit tonight

- `pnpm run build:full` **failed** at the canvas bake with `socket hang up`
  (ECONNRESET on the page's POST back to the bake socket) while the daemon was
  at 4/4 busy workers and a sweep queue 54 deep. `texc.bin.gz` and `geo.bin.gz`
  stayed absent. Retry behind `daemon.mts --wait quiet`.

## Next step

1. Get `geo.bin.gz` and `texc.bin.gz` back. Nothing may be measured until they
   are there; they have been absent for hours.
2. Baseline `coldload --prod --gate` and `--prod --q ultra` behind
   `daemon.mts --wait exclusive-free`.
3. Wire `q16d`, re-bake terrain + geo, re-measure, look at a terrain frame.
