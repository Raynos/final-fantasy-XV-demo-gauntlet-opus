# How long everything takes

**Recorded 2026-08-27 on the development machine (Apple M-series).** Every
number here is from a run that actually happened; nothing is estimated, and the
few figures that were not instrumented say so rather than guessing.

Put in `project/` rather than the repo root on purpose — `CLAUDE.md`'s rule is
that the root holds `README.md`, `CLAUDE.md`, `BRIEF.md` and build config, and
this is working state.

> **The single most useful fact below:** the whole gate suite is ~13 minutes and
> **`drawcheck` is a third of it**. Everything a human runs between edits —
> both typechecks and a production build — is **under one and a half seconds
> combined**.

## The fast lane: what pre-commit runs on every commit

| command | wall | note |
|---|---|---|
| `pnpm run typecheck` | **0.39 s** | `tsc --noEmit`, the game (~305 modules) |
| `pnpm run typecheck:tools` | **0.40 s** | `tsc --noEmit`, the harness |
| `pnpm run build` | **0.64 s** | vite/rolldown reports `built in 312 ms` |
| `node src/tools/anycheck.mts` | **0.13 s** | no browser, no build |

**pre-commit is all three of the first rows**, so a commit costs ~1.4 s of gate
plus git. That is the whole design: `CLAUDE.md` says a gate slow enough to skip
gets skipped.

`pnpm run build:full` adds `texbake.mts --canvas`, which is a browser and
re-records the painted-face cache; it prints `already fresh` and returns in
seconds when the cache is current.

## `pnpm run check` — the 18 gates

Reference run, one lane active elsewhere. **Total ~13 min.**

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
| cold boot to `GAME.ready` | **6.4 - 16.0 s** observed; 9.2 s is the benched figure in `src/tools/README.md` |
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
| **0.7 - 1.5 wall-minutes per game-minute** | 0.7 quiet, 1.5 under four lanes |
| a 30-minute session | **21 - 45 wall minutes** |
| CPU-bound | 640×360 is no faster than 800×450, and `--q` does nothing at all |
| deterministic | minute 6 reads `2.14 km, 4 encounters, 19 forage` at every viewport and in both dev and prod |

Three ceilings kill a long probe, all of them the harness:

- the lease TTL closes the page at **15 minutes** — pass `--ttl <minutes>`;
- materialised trees are pruned at ten, so **committing during a run** can drop
  the tree it is being served from;
- `perf`/`gameplay` take the quiet lane and call `pool.closeAll()`, which closes
  leased contexts too.

Shorter probes for scale: `walkabout.mts` ~4 min (6 legs × 4 200 frames),
`fightshape.mts` ~4 min, `loopclose.mts` ~2 min, `regaliadrive.mts` ~3 min.

## What is not measured here

`bench.mts` (it re-derives the harness's own defaults and was not run today),
`bootprof.mts`, `texbake --force`, and the exact wall clock of the two perf
gates. Add them when somebody runs them rather than guessing.
