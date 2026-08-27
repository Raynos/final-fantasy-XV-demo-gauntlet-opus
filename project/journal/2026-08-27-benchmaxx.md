# Benchmaxx: the harness gets a clock, and then gets faster

2026-08-27, opus. Implements `docs/plans/2026-08-24-opus-benchmaxx-harness.md`
(v2, A–F). The plan-writing session deliberately did not implement; this is the
fresh lane it asked for. Per-phase evidence lives in
`project/handoff/benchmaxx.md`; this is what actually happened and what surprised
us.

## The order was the whole design, and it held

v2's three rules — observability before optimisation, primitives before
prohibitions, ratchets before budgets — are not slogans, and following them
changed what got built.

**Observability first paid immediately.** The very first `/health` after the
ledger landed printed `paintedFaces: false`: the painted-face cache was genuinely
missing from the working tree, so every boot on this machine had been paying an
extra ~2.5 s for an unknown number of days, guarded only by a sentence of prose
in two documents. `pnpm run build:full` fixed it in 25 s. Nobody would have
looked; the daemon looked because it now had somewhere to write the answer.

**Primitives before prohibitions was the difference between a ban and a fix.**
`daemon.mts --wait quiet` returned after 9.8 s on a busy daemon, and
`guard-poll.sh`'s rejection text names it, `gitlock.mts` and
`run_in_background` by name. The guard then blocked the commit that introduced
it — the commit message describes the habits being banned — which is exactly the
failure `guard-harness.sh`'s heredoc-stripping comment predicted, one layer
further out. It now strips `-m`/`--body` arguments on the commands that carry
prose.

**The ratchet caught something on its first day.** Not a regression: `check`
grading itself refused to grade a run that had cache hits, a busy box or a red
gate, and said which. A budget that only speaks when it can be trusted is the
one people keep.

## The numbers

| | before | after |
|---|---|---|
| `pnpm run check`, cold, quiet | ~780 s serial | **~190 s**, two pools |
| `pnpm run check`, tree already graded | ~780 s | **0.68 s** |
| `drawcheck` alone | 269 s | **120 s** `--par 4`, then **0.18 s** memoised |
| pre-commit | 1.59 s | **1.04 s** |
| 30-game-min `longplay` | ~22 wall-min | **~3**, `--turbo 10`, telemetry identical |
| a week's wall-clock audit | ~2 h of transcript archaeology | `harnessstats.mts` |

## The finding nobody expected: a stepped frame is 95% draw submission

Phase D opened with a discrepancy. `gameplay.mts` prices the simulation at
4.3–7.8 ms/frame, which predicts 0.26–0.47 wall-minutes per game-minute for
`longplay`; the observed floor is 0.7. Up to half the bill was unaccounted for.

`probes/turbocost.mts` ablates `post.render` A/B/A on one page, seconds apart:

    draw on   11.66 ms/frame       draw off  0.582 ms/frame
    A/B/A drift 0.156 ms           submission 11.00 ms = 95% of the frame

The missing half was never the sim, and **the sim is not even the 4.3 ms** — it
is 0.58. A long probe spends essentially all of its wall clock submitting a scene
into a `?shoot=1` page that never presents it and that nobody screenshots. This
also explains TIMINGS' otherwise odd note that 640×360 is no faster than 800×450
and `--q` does nothing: submission is CPU and scales with draw calls, not pixels.

**And the ratio matters, which the plan did not anticipate.** The plan said
"render 1-in-N frames (or none)" and "validate by determinism; any drift
reverts". Four six-game-minute runs against the canonical `2.14 km, 4 encounters,
19 forage`:

| | wall-min/game-min | telemetry |
|---|---|---|
| plain | 0.75 | 2.14 km, 4 enc, 19 forage, 13 kills |
| `--turbo 2` | 0.37 | identical |
| `--turbo 10` | **0.10** | identical |
| `--turbo 60` | 0.06 | 2.13 km, 3 enc, 18 forage, 10 kills |

So the honest answer was neither "ship it" nor "revert": **10 is the default**,
being the largest ratio measured byte-identical, and it is already 7.5×. A
thirty-minute session goes from ~22 wall-minutes to ~3, clearing Phase D's ≤12
with the telemetry intact rather than by redefining it. Sixty is a soak setting
and `probe.mts` says so at startup.

The drift at 60 is a lead worth someone's afternoon: `seatcheck` proves
`Terrain.drawnHeightAt` is the renderer's own arithmetic against the *rasterised
clipmap*, and a frame that is never submitted does not refresh it — so the player
walks on a stale height field, the route moves, and the route is what encounters
and forage key off.

## The mistake, kept because it is instructive

Bumping `PROTOCOL` 4 → 5 for the lease-drain change cost a whole `check` run.
Two pools start nine browser clients at once; the first to call `ensureDaemon()`
found the mismatch, stopped the old daemon, and `pool.closeAll()` took its eight
siblings down mid-`page.evaluate`. The table came back `drawcheck VOID`,
`reachcheck FAIL`, and `uxcheck`/`integration` FAIL with *"Target page, context
or browser has been closed"* — four gates, none of them broken, and a result
indistinguishable from a game regression.

It is the same hazard that had just been written into `LANDMINES.md` for long
probes, one layer out, and it is now fixed rather than only documented:
`check.mts` calls `ensureDaemon()` once before it spawns anything, so the restart
is serial and invisible. **Parallelising a thing multiplies its exposure to every
shared-state hazard it already had.** That is the general lesson, and it is worth
more than the fix.

## What is not done, and why the plan is IN-PROGRESS rather than DONE

Every phase shipped and each is verified against a number taken today. But this
plan's definition of done is deliberately *weekly* — self-inflicted wait per
week, fix-lane p50, median `shoot` over a real week, zero probe deaths by
exclusive — and one session cannot close a week. What it can do, and did, is make
every one of those readable in one command. Two of them can already be read:
the `fix` lane's queue p50 is **0.0 s** over 125 jobs, and there were zero probe
deaths by exclusive after the drain landed.

Also open: probes registering a CPU-budget tag (Phase D's last bullet — `check`
now shrinks its browser pool by the number of live leases, which is most of it),
and `town_forecourt` having cleared the draw budget outright at 786, which wants
a second confirming run before its baseline entry is deleted.
