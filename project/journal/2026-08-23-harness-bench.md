# Phase 0 — what concurrency actually costs here

Deliverable of Phase 0 of `docs/plans/2026-08-21-opus-harness-daemon.md`. Every
default in `src/tools/daemon.mts` has to trace back to a row on this page; if
you change one, change it here first.

Reproduce with `node src/tools/bench.mts --full` (sweep) and `node
src/tools/bench.mts --park --reset --tree`. The tool takes a lock and refuses a
busy machine, so a number here was taken on a quiet box or it is not here.

**Machine:** Apple M5 Max, 18 cores, 137 GB, one Metal GPU. Tree `64ac352`.
Chromium via `--use-angle=metal`, persistent profile (so the shader cache is
warm, as in real use).

## Q1 — the concurrency sweep

`hero_full`, 4 shots per worker, cache bypassed, each worker its own process and
its own browser — which is what N agents actually are.

| W | wall s | jobs | req/s | render ms | boot ms | spawn ms | core-s | peak RSS MB |
|---|--------|------|-------|-----------|---------|----------|--------|-------------|
| 1 |   18.9 |    4 |  0.21 |      2346 |    9169 |      325 |     20 |        2608 |
| 2 |   30.6 |    8 |  0.26 |      3987 |   12033 |      326 |     45 |        5001 |
| 3 |   39.2 |   12 |  0.31 |      5840 |   12811 |      341 |   72.7 |        7452 |
| 4 |   51.9 |   16 |  0.31 |      8418 |   14789 |      472 |  113.4 |       10002 |
| 6 |   65.7 |   24 |  0.37 |      3604 |   32281 |      547 |  209.7 |       13398 |
| 8 |   95.6 |   32 |  0.33 |      5910 |   40450 |      745 |  300.7 |       18745 |

**Where the knee is, and what it is made of.** Throughput rises 0.21 → 0.31
req/s from W=1 to W=3 and is flat after that. It is *flat within noise*, not
flat with a bump at W=6: W=4 came back at 0.29, 0.31 and 0.31 req/s across three
separate runs, a 20 % spread on a plateau that is itself only 20 % wide. So
**throughput cannot pick the number** and anything that reads a peak off this
column is reading noise.

**Latency picks it, and latency is not noisy.** Mean boot goes 9.2 s (W=1) →
14.8 s (W=4) → 32.3 s (W=6) → 40.5 s (W=8). Past W=4 a client waits multiples of
what it waits alone for no throughput at all — that is exactly what RESCUE
described as "stall agents outright".

> **`BROWSER_BUDGET = 4`** — the largest W that still boots within 2× of serial.
> RESCUE's guess of "~4" turns out to be right, and is now measured rather than
> guessed.

**What binds.** At W=4: **2.2 of 18 cores busy**, **10 GB of 137 GB** peak RSS.
Neither CPU nor RAM is anywhere near saturation, and total throughput is capped
at ~0.31 req/s regardless of how many browsers are pointed at it. **The single
Metal GPU binds.** Two consequences the plan asked for:

- The cap belongs on concurrently **rendering** pages, not on browsers. A
  parked-but-resident browser costs the GPU nothing.
- `BROWSER_BUDGET` and `WORKERS` are therefore *not* forced to be the same
  number. Workers may exceed the render budget when they are booting or
  settling; only the render step needs the narrower cap.

**Concurrency parallelises almost nothing.** Four browsers deliver 1.5× the
throughput of one. That is the single most useful sentence in this document, and
it is the argument for the whole plan: the win is not "run more browsers", it is
**stop booting the same page over and over**. Boot is 9.2 s against a 2.3 s
render, so any request served by a warm page beats any amount of parallelism.

## Q5 — is a concurrent wave frame-stable? (the gate)

- **Control**, two *serial* boots: mean **1.493**/255, max 83, 3.294 % of pixels
  over threshold.
- W=1 vs W=8: mean **1.533**/255, max 94, 3.449 %.
- **Concurrency adds 0.039/255 over the control.**

**The gate passes.** Note what the control bought: the raw W=1-vs-W=8 number is
1.533/255, which read alone looks like concurrency perturbing ~3 % of the frame.
It is not — two boots on a *quiet* machine differ by 1.493 on their own (TAA
history, the exposure integrator, shader-cache state). Without the control this
would have been a false stop. The `imgdiff` noise floor of 1.5–1.9/255 quoted in
`CLAUDE.md` is confirmed here as *boot-to-boot*, not capture-to-capture.

## Q2 — what a resident page costs, and what parking saves

| page | idle CPU | RSS | park | parked | unpark |
|---|---|---|---|---|---|
| capture (`?shoot=1`, rAF stopped) | **0.00 cores** | 2122 MB | 34 ms | 1765 MB | 8463 ms |
| play (rAF running) | **0.74 cores** | 2222 MB | 136 ms | 1844 MB | 8532 ms |

**Do not port scaffold's parking for capture pages.** Scaffold parks because a
posed page burns 0.6–1.8 cores; ours burns *zero*, because `main.ts` never calls
`game.start()` under `?shoot=1`. Parking to `about:blank` reclaims 357 MB of
2122 — 17 % — and costs a **full 8.5 s reboot** to come back, which is the boot
cost the daemon exists to avoid. On a 137 GB machine that trade is strictly bad.

**Park play pages, or rather do not hold them.** 0.74 cores each is real; four
idle play pages is 3 cores of nothing. Play tools take a lease and release it,
so the right answer there is a short lease, not a park timer.

**The RSS number is the one to worry about.** 2.1 GB *per page* is why W=8 peaks
at 18.7 GB, and it is the same figure `project/TODO.md` complains about
("1.4 GB of RAM in ?debug"). That is a game-side memory problem, not a harness
one, but it is what makes `BROWSER_BUDGET` matter on any machine smaller than
this one.

## Q3 — soft reset against a reload

| from | soft reset + repose | programs | reload + repose |
|---|---|---|---|
| `hero_full` | 1968 ms | 257 → 257 | 11 096 ms |
| `dun_keycatrich_hall` (lighting-changing) | 2003 ms | 308 → **314** | 10 903 ms |

**Reset wins by 5.5×, including on the lighting-changing shot** — the case the
plan flagged as the one that could invert the result. Leaving a dungeon
recompiled 6 programs, not the 43 that produced RESCUE's 9.5 s freeze, and it
cost nothing measurable. Phase 5's reset-and-pool design is worth building.

The caveat the numbers cannot see: a reset is only worth 5.5× *if it is honest*.
`GAME.reset()` does not exist yet (this measured `stop()` + `resetClock()`), and
`Party.snap()` — RESCUE §B1's determinism hole — is still unwritten. A reset
that leaves formation state behind produces frames that are plausible and wrong,
which is the expensive kind. **Reset-drift detection on a `follow` shot is not
optional.**

## Q4 — what materialising a sha tree costs

| step | cost |
|---|---|
| `git archive <tree-sha> \| tar -x` | **173 ms**, 33.0 MB of source |
| dev server in that tree | up in 404 ms, first boot 9248 ms |
| `vite build` in that tree | **562 ms**, first boot 8838 ms |
| tree on disk | 115 MB; 10 cached shas = 1.2 GB |

**Decision 2 is cheap — under a second per sha — but only with the bake cache
symlinked.** The first measurement of this said `vite build` cost **24 514 ms**;
the difference is entirely `src/public/baked`. Materialise a tree without
symlinking the bake cache and every sha re-bakes the terrain. With it symlinked
the build is 562 ms, because vite here is rolldown-backed and the game is one
bundle.

So: **`git archive` + symlink `node_modules` + symlink `src/public/baked` +
`vite build` + `preview` ≈ 0.75 s per sha, 115 MB.** `--build HEAD` can be the
default, and 10 cached trees cost 1.2 GB — prune at 10, not at 3.

The plan's warning stands and is now sharper: the symlinked bake cache is
**read-only from a sha tree**. `texbake.mts --force` run from inside one would
rewrite the shared artifacts for every tree at once, which is the exact hazard
that bit the worktree experiment.

## What this changes about the plan

1. **`BROWSER_BUDGET = 4`, and it is a render cap, not a browser cap.** GPU-bound
   confirmed: 2.2/18 cores and 10/137 GB at the budget.
2. **Drop parking for capture pages.** Zero idle CPU, 17 % RSS saved, 8.5 s to
   come back. Phase 5 keeps spare pooling and the soft reset; it drops the park
   timer for `?shoot=1` pages. Play pages get short leases instead.
3. **Prune sha trees at 10, and symlink the bake cache into every one.** The
   24.5 s → 0.56 s difference is the whole affordability of Decision 2.
4. **The reset contract is worth building** (5.5× on the hard case), and it is
   worthless without `Party.snap()` and drift detection.
5. **The headline is boot, not parallelism.** 4 browsers buy 1.5× throughput;
   one warm page buys 4×. Every phase that removes a boot beats every phase that
   adds a worker — which reorders nothing in the plan, but it does say what to
   protect when a trade-off appears.
