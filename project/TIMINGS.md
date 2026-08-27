# How long everything takes

**Recorded 2026-08-27 on the development machine (Apple M-series), and revised
the same evening after the benchmaxx lane landed.** Every number here is from a
run that actually happened; nothing is estimated, and the few figures that were
not instrumented say so rather than guessing.

Most of these are now taken automatically. The daemon writes one line per job to
`~/.cache/ffxv-harness/<keyhash>/jobs.jsonl` and `node src/tools/harnessstats.mts
--since 24h --slow 30` renders it — wait against run, by tool, agent, lane or
day. **Prefer that to this file when the two disagree**: it was measured today,
and this was measured on the day somebody last edited it.

Put in `project/` rather than the repo root on purpose — `CLAUDE.md`'s rule is
that the root holds `README.md`, `CLAUDE.md`, `BRIEF.md` and build config, and
this is working state.

> **The single most useful fact below:** the whole gate suite was ~13 minutes,
> serial, with no memory. It is now **~270 s** cold and **0.68 s** on a tree it
> has already graded. Everything a human runs between edits — both typechecks
> and a production build — is **~1.0 s**, run together.

## The fast lane: what pre-commit runs on every commit

| command | wall | note |
|---|---|---|
| `pnpm run typecheck` | **0.39 s** | `tsc --noEmit`, the game (~305 modules) |
| `pnpm run typecheck:tools` | **0.40 s** | `tsc --noEmit`, the harness |
| `pnpm run build` | **0.64 s** | vite/rolldown reports `built in 312 ms` |
| `node src/tools/anycheck.mts` | **0.13 s** | no browser, no build |

**pre-commit is the first three rows, run CONCURRENTLY**: they are three
independent readers of the same tree, so nothing about them was ever ordered.
Measured back to back on a quiet box: **1.59 s serial, 1.04 s together**. That is
the whole design — `CLAUDE.md` says a gate slow enough to skip gets skipped, so
the fast lane is worth keeping fast even in half-seconds, because it runs dozens
of times a day per lane.

**post-commit** costs nothing measurable: it fires a detached `/prewarm <sha>` at
a daemon that may not exist and exits.

`pnpm run build:full` adds `texbake.mts --canvas`, which is a browser and
re-records the painted-face cache; it prints `already fresh` and returns in
seconds when the cache is current.

## `pnpm run check` — the 18 gates

**Total ~270 s cold on a quiet box, in two pools; 0.68 s on a tree already
graded.** It was ~13 minutes, serial, with no cache. Three changes, each
measured:

| | before | after |
|---|---|---|
| whole suite, cold, quiet | ~780 s | **~270 s** |
| whole suite, same clean tree | ~780 s | **0.68 s** (`gatecache`, keyed on the tree sha) |
| `drawcheck` alone | 269 s | **120 s** (`--par 4`), then **0.18 s** memoised |

The suite now **ratchets its own wall time** against
`project/check-baseline.json` and fails itself past tolerance, because it grew
9 -> 13 minutes with everybody watching gates pass and nothing metering the
meter. It grades only a comparable run — full roster, no cache hits, quiet box,
nothing red — and says which of those it lacked otherwise.

The per-gate table below is the SERIAL reference run, one lane active elsewhere.
Under two pools these overlap, so their sum is no longer the suite's time and a
row is only comparable to its own history:

| gate | s | | gate | s |
|---|---:|---|---|---:|
| build | 0.8 | | creaturecheck | 17.1 |
| anycheck | 0.2 | | combatloop | 71.5 |
| orphans | 0.2 | | roadcheck | 7.6 |
| silhouette | 5.6 | | reachcheck | 77.4 |
| silrocks | 14.1 | | floatcheck | 16.5 |
| geocheck | 1.1 | | horizoncheck | 0.3 |
| hydrocheck | 13.6 | | heightcheck | 15.2 |
| integration | 69.4 | | driftcheck | 69.7 |
| uxcheck | 92.6 | | **drawcheck** | **280.7** |

On a **quiet** machine the same gates come in materially faster — measured the
same day: `reachcheck` 77.4 → **49.4**, `driftcheck` 69.7 → **37.8**,
`drawcheck` 280.7 → **145.9**, `floatcheck` 16.5 → **10.5**, `heightcheck`
15.2 → **9.3**. Roughly a third off the leased-page gates. **A gate time is a
statement about the machine as much as about the gate.**

`drawcheck` is the outlier because it captures the whole 142-shot corpus. Its
145.9 s run was served entirely from the frame cache; 280.7 s is the same work
with cold frames. `--manifest <path>` reuses a corpus somebody else already
paid for and costs nothing.

`pnpm run check:perf` adds the two below; `check:gate` (what pre-push runs) is a
five-gate subset.

## The two perf gates — quiet machine only

Both take the daemon's **exclusive lease**, which drains every worker and closes
every leased page. Do not run them beside a long probe.

| tool | wall | result on 2026-08-27 |
|---|---|---|
| `perf.mts` (142 shots) | **~13 min**, not instrumented | mean 208.0 fps, worst 116, floor 1.00/1.15 ms, `RULER_VALID: true` |
| `gameplay.mts` (13 segments) | **~6 min**, not instrumented | every segment ≥ 60 fps, floor 0.87 ms, `RULER_VALID: true` |

`perf.mts` costs `--pairs` (24) ABBA frame pairs twice for the run floor, plus
`--shotpairs` (8) **per shot** for that shot's own floor, on top of `--frames`
(120) timing samples each. Cutting the shot list is the lever: a named subset
of eight shots is about a minute.

`gameplay.mts`'s per-segment frame cost, which is what the numbers above are
made of:

    idle 5.7   walk 5.7   sprint 6.0   sprint+turn 5.2   strafe+camera 4.7
    weapon-swap 4.3   combat 4.7   warp-strike 4.5   magic 4.4
    streaming-traverse 7.8   day-night-sweep 7.3   weather-change 4.8
    menu-open 5.0                                        (ms per frame)

## Captures

| thing | wall |
|---|---|
| cold boot to `GAME.ready` | **~6.6 s** warm caches / **~9 s** with the painted-face cache missing / **up to 32 s** when four boots race (`drawcheck --par 4`). `bootMs` in `--health` is the live figure |
| a page's chromium RSS | **2 449 MB** with one page live, **16 465 MB** across four — `ps` over the process tree, so shared pages are counted per process; a trendline, not an absolute |
| first capture after a commit | **~2.3 s** if `post-commit` prewarmed the sha, ~38.9 s if it did not |
| one shot on a **warm** page | **0.85 - 2.3 s** — cheap shots ~0.9 s, heavy vista/character shots ~2.2 s |
| nine character shots, one boot | **~19 s** including the boot |
| `imgdiff` on a pair | seconds; no browser |
| `crop.mts` | instant; no browser |

The daemon serves **four browsers** for the whole repository. Two things follow
and both have cost time: with four lanes running, a fifth request queues or has
its page reclaimed; and page reuse is worth far more than parallelism —
`src/tools/README.md` benched four concurrent browsers at **1.5x** the
throughput of one.

## Probes

`longplay.mts` is the long pole and the ratio is the number to plan with:

| | |
|---|---|
| **0.75 wall-minutes per game-minute**, plain | 1.5 under four lanes |
| **0.37**, `--turbo 2` | telemetry **identical**; a 30-minute session is ~11 wall-min |
| **0.06**, `--turbo 60` | 11x, but the telemetry **moves** — see below |
| CPU-bound | 640×360 is no faster than 800×450, and `--q` does nothing at all |
| deterministic | minute 6 reads `2.14 km, 4 encounters, 19 forage` at every viewport and in both dev and prod |

**A stepped frame is 95% draw submission.** `probes/turbocost.mts`, A/B/A on one
page: 11.66 ms/frame with `post.render` intact, **0.582 ms** with it ablated, an
A/B/A drift of 0.156 ms. The simulation is half a millisecond; everything else is
submitting a scene into a `?shoot=1` page that never presents it. That is why
`--q` and the viewport do nothing — submission is CPU, and it scales with draw
calls rather than pixels.

**`--turbo <N>` submits one frame in N, and N matters.** At **N = 2** a
6-game-minute run reproduced the canonical triple exactly (`2.14 km, 4
encounters, 19 forage`, 13 kills) at 2x. At **N = 60** it returned `2.13 km, 3
encounters, 18 forage`, separating from game-minute 4. So turbo is safe for
quoted telemetry at small N and a **soak-and-shape tool** at large N; the
suspected mechanism is `Terrain.drawnHeightAt` reading the rasterised clipmap,
which an unsubmitted frame does not refresh. Validate any new N against a plain
run before quoting it.

Two ceilings still kill a long probe, and the third is closed:

- the lease TTL closes the page at **15 minutes** — pass `--ttl <minutes>`;
- materialised trees are pruned at ten, so **committing during a run** can drop
  the tree it is being served from;
- ~~`perf`/`gameplay` call `pool.closeAll()`~~ — **fixed.** `/exclusive` queues
  behind a live lease, bounded by that lease's own TTL, and refuses as `busy`
  naming the probe and its remaining seconds rather than closing its page.

Shorter probes for scale: `walkabout.mts` ~4 min (6 legs × 4 200 frames),
`fightshape.mts` ~4 min, `loopclose.mts` ~2 min, `regaliadrive.mts` ~3 min.

## What is not measured here

`bench.mts` (it re-derives the harness's own defaults and was not run today),
`bootprof.mts`, `texbake --force`, and the exact wall clock of the two perf
gates. Add them when somebody runs them rather than guessing.

## The suite is flaky under maximum browser pressure, and here is the state of it

Recorded 2026-08-27 by the benchmaxx lane, because a number nobody can
reproduce is worse than no number.

Five separate causes of "a gate FAILs with `Target page, context or browser has
been closed`" were found and fixed in one evening, every one of them invisible
before the daemon had a log:

1. an unhandled claim rejection in `routeShots` **killed the whole daemon** on
   any failed render, closing every browser on the machine;
2. `ensureDaemon()` read a timed-out `/version` probe as "old daemon" and
   `/stop`ped a merely *busy* one — nine clients starting at once made that
   likely, and one is enough;
3. a `PROTOCOL` bump mid-suite did the same thing legitimately, so `check` now
   settles the daemon once before it spawns anything;
4. `pruneTrees` deleted the tree it was serving;
5. the automatic reset-drift check added three captures at the exact instant a
   suite starts, and timed out on its own screenshot doing it.

**The suite has not yet been observed 18/18 end to end since the last of those
landed.** Treat a red browser gate as unproven until it reproduces standalone —
`creaturecheck` and `driftcheck` were each red in-suite and green alone the same
evening. `LANDMINES.md` carries the rule and the three candidate causes.
