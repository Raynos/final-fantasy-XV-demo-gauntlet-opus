# runtime-facts

**Job:** fill in the three rows of `docs/BOOT_PERF.md` that said NOT MEASURED —
idle CPU, first-visit load with an empty HTTP cache, and whether the screen is
responsive while loading. **All three now carry a number and a command.**

Status: **done**. Two new tools, one gate wired into `check --perf`, one fix to
`Game.init()`, two landmines. Nothing is handed on; the two things left are
decisions for a person and are written as such at the end of `BOOT_PERF.md`.

## The three rows, as they now read

| row | number | command |
|---|---|---|
| CPU, idle page | **~16.5 ms of CPU per rendered frame = 96–105% of one core at 60 Hz**, ~200% at 120 Hz, 113% at Retina pixel scale | `node src/tools/idlecpu.mts --q high --dpr 1.5` |
| Startup, first visit, empty HTTP cache | **85.5 MB on the wire** in 5 requests (199.9 MB decoded), 7.1 s to `GAME.ready` on localhost | `node src/tools/coldload.mts --prod --n 2` |
| Startup, screen responsive during it | **No.** 10.6 fps, **92% of the load with no paint and no input**, worst block 1.2 s — was **one unbroken 7961 ms task** | `node src/tools/coldload.mts --prod` |

## What was actually found

**Idle CPU is the rAF render loop, all of it, and it is not a bug.** The
discriminator is one arm: `Game.stop()` cancels the loop and nothing else — the
page, the world, the GL context and every timer survive — and idle cost goes from
**168–181% of a core to 2.4%**. No timer, no microtask storm, no unconverged
streaming (`Vegetation.update` falls 0.37 → 0.23 ms between the two running arms,
so the converge finishes). `Game.frame()` simply draws a full post-processed
frame every tick whether or not anything moved; `post.render` is 74–77% of the
5.8 ms main-thread frame and every system together is under 1.5 ms.

**The boot-unresponsiveness mechanism written in `BOOT_PERF.md` was wrong, and
worse than written.** It said `await` yields between phases and only a long phase
blocks. It does not yield: an `await` on an already-settled promise is a
**microtask**, and microtasks drain at the end of the current task without ever
returning to the event loop. All twenty-six systems were **one task**. Fixed by
`yieldToBrowser()` (a `MessageChannel` post, a real task) in `src/game/Game.ts`,
placed after the progress label is set and before that phase's work starts.

| | before | after |
|---|---|---|
| long tasks over the whole load | 2 | **14** |
| worst single block | 7961 ms | **1243 ms** |
| frames the browser got | 43 in 8.5 s | 77 in 7.3 s |
| `bootprof --n 3` wall clock | 8.90 / 8.48 / 8.28 s | 8.84 / 8.39 / 8.42 s |

The last row is the one that mattered: **the yields cost nothing measurable**,
both arms taken back to back on the same contended box.

## Files touched

- `src/tools/idlecpu.mts` — **new.** `play: true` lease under the quiet lane,
  three oracles (`SystemInfo.getProcessInfo` per browser process,
  `Performance.getMetrics` for the main thread, in-page accumulators wrapped
  around every `system.update` / `lateUpdate` / `post.update` / `post.render`).
  A/B/A `running → stopped → running`, plus `--dpr` and `--hidden` arms.
- `src/tools/coldload.mts` — **new.** Own browser via `chromium.mts` under the
  exclusive lease, empty HTTP cache, init script installed before the app: a rAF
  chain, a `longtask` observer and a `MutationObserver` on `#boot-label` so each
  block is named by the phase it fell in. `--gate` is the `bootblock` gate.
- `src/tools/check.mts` — `bootblock` registered, `perf: true`, cost 90.
- `src/game/Game.ts` — `yieldToBrowser()` at module scope (exported), one yield
  per boot phase and one before the shader compile.
- `docs/BOOT_PERF.md` — the three rows, plus sections for each with the tables.
- `project/LANDMINES.md` — two entries: the microtask trap, and "an idle tab at
  100% of a core is not necessarily a leak".
- `src/tools/README.md` — both tools in the tier table, and why `?shoot=1` being
  a blindfold needed two of them.

## Traps that cost this lane time, and will cost the next one

- **Headless does not vsync.** It free-runs at ~102–115 fps, so a raw CPU
  percentage from it is what the loop costs uncapped, not what a person pays. The
  quantity that transfers is **CPU ms per frame × the display's refresh**.
- **Headless reports `devicePixelRatio` 1.** A Retina panel reports 2 and
  `Renderer.ts` asks `min(dpr, 1.5)` at `q=high` — **2.25× the pixels**. A
  headless number *understates* a laptop. `--dpr 1.5` measures it.
- **`Emulation.setPageVisibilityOverride` is gone from this Chromium.** `--hidden`
  reports UNSUPPORTED rather than lying. The `stopped` arm answers the same
  question anyway and better.
- **`contention()` must be read after the lease is released.** It counts headless
  chromiums and load average, and the browser the tool is measuring is one of
  each, so a clean run printed "CONTENDED" with an empty list of worktrees.
- **The default player quality is `high`, not `ultra`.** `Renderer.ts` falls back
  to `'high'` with no `?q=`; every harness page asks for `ultra`. Idle cost barely
  differs between them, but do not assume that for anything else.

## Certification, all after the `Game.ts` change

| | result |
|---|---|
| `pnpm run check` | **19/19** in 317.3 s |
| `perf.mts` | **PASS**, mean 212.0 fps, worst 143 (`town_forecourt`), 142/142 clear 60 by more than their own noise, `RULER_VALID: true` |
| `gameplay.mts` | **PASS**, worst segment 123.5 fps (`streaming-traverse`), **0 hitches**, `RULER_VALID: true` |
| `nanscan` | **0 of 142** shots carry NaN |
| `bootblock` gate | **PASS** — 14 blocks / worst 1243 ms / 85.5 MB, against ≥ 8 / ≤ 3500 ms / ≤ 120 MB |
| `idlecpu` gate | **PASS** — stopped **1.0%** of a core, **16.91 CPU ms/frame** = 101.4% at 60 Hz, against ≤ 15% / ≤ 28 ms |
| `bootprof --n 3` A/B | 8.90/8.48/8.28 s before against 8.84/8.39/8.42 s after — **the yields cost nothing measurable** |
| looked at | `hero_full` and `town_forecourt` at HEAD (`tmp/shots/runtime-facts/`) — party, terrain, vegetation and the whole Hammerhead forecourt intact; `Town`, `Npcs` and `Props` all initialise correctly across the new yields |

`perf`'s mean reads 212 fps against the 226–229 recorded in `BOOT_PERF.md`; that
run was taken with three other lanes live and is a PASS on a self-validated
ruler, so the row was left alone rather than ratcheted down on a busy box.

## Not done, deliberately, and not queued anywhere

Both are in `BOOT_PERF.md` under **"What is left, and what needs a person to
decide"** because they are decisions, not tasks:

1. **A frame-rate cap.** 96–105% of a core while idle is the price of drawing an
   animated open world every vsync. It will not come down without capping the
   loop or making the frame cheaper, and a cap is a feel decision `BRIEF.md` has
   no opinion about today. One small change in `Game.start()` once decided.
2. **The 85.5 MB first visit.** Three baked artifacts are all of it. Invisible on
   localhost, ~14 s on a 50 Mbit line. Streaming the bake or shipping a
   low-resolution first tier is real work and pointless if this is never served
   over a network.

The remaining worst boot blocks are still seconds of frozen tab — `Vegetation`
1.3 s, `Dungeons` 1.2 s, `Props` 1.2 s. Chunking *inside* those loops against an
~8 ms budget is the natural next step and `yieldToBrowser()` is exported for it,
but those files belong to the terrain/props/engine lanes, not this one.
