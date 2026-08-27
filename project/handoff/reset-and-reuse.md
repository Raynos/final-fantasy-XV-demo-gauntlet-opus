# reset-and-reuse — making a booted page safe to hand on

Owner: opus, 2026-08-27. Sibling of `benchmaxx.md`, which covers the harness's
own wall clock. This lane is the game-side half: **why every play gate boots a
fresh page, and what has to be true before one can be reused.**

## The number this is about

`routeLease` hardcodes `cold: true`, so every play gate boots its own page:
**188 boots across 190 lease jobs at 7.46 s each**, ~1400 s of machine time per
suite cycle. It is the largest single remaining cost in the harness, and it is
also line one of `project/TODO.md` — *"starting a new page takes forever"*.

**Deleting the exclusive lease does not help and was considered.** `cold` and
the lock are two different arguments to `pool.lease(key, w, h, cold)`. Dropping
exclusivity would save zero boots and would let two tools drive one page at
once. The boot is `cold: true`, and `cold: true` is there for cause.

## The instrument

`src/tools/resetcheck.mts` — 35 state fields, one contaminating workload per
gate known to burn a page (`combat`, `ux`, `shots`, `creatures`, `dungeon`),
digest → workload → `GAME.reset()` → digest, and it names every field that
survived.

**It has a null arm and VOIDs rather than reports if that arm is dirty.** A
digest that moves on its own makes every row under it unreadable; that is the
discipline whose absence cost an evening on `drawcheck`. Run it before believing
any claim on this page.

    node src/tools/resetcheck.mts            # every workload
    node src/tools/resetcheck.mts --set ux   # one
    node src/tools/resetcheck.mts --keys     # the field list, no run

## Done and verified

29 leaked fields → **12**. `creatures` and `dungeon` come back completely clean.

- **`Game` captures the booted state and restores it in `reset()`** (`f8fef77`)
  — player position/rotation/heading, camera position/orientation/fov,
  `input.invertY`, `input.lookScale`, `rnd.quality`. After a combat-shaped
  workload the camera sat at `252.9, 17.5, -170.4` instead of `0, 3, 8` *across
  a reset*. Captured at boot rather than hardcoded: a `camera.position.set(...)`
  written into `reset()` is a second source of truth that goes stale the first
  time boot changes. Restored **after** the systems' own `reset()`, because a
  system may move the player, then the party is re-snapped so followers land
  against the restored player.
- **`Menus.reset()`** (`f8fef77`) — `open` is *derived* from the open amount
  `a`, so `setScreen('main')` left `a` where the last animation had it and
  `open` read true forever. Closes instantly and hands back what a menu takes
  from `Input`; a stopped render loop never runs the frames an animation needs.
- **`System.warmup?()` + `Enemies.warmup()` + `Game.warmup()`** (`8b72e6e`) —
  the daemon calls it once per page in `/shots`. Not a reset fix; a determinism
  fix. See below.

## What is left, in the order I would take it

1. **The enemy roster.** `enemies.n 10 -> 0` under the `shots` workload.
   `Director.scenario()` (`src/game/Director.ts:251`) calls `enemies.clear()`
   on every posed shot, and `Director` has **no `reset()`**. The honest
   difficulty: the boot roster of 10 is a dynamic outcome of the live encounter
   loop, so restoring it is not a matter of copying a number — `Director.reset()`
   has to put the live loop back and let it re-populate. Do not fake it by
   re-spawning 10 of something.
2. **The structural leaks** — `gpu.geometries` 564 → 646, `gpu.programs`
   276 → 293, `gpu.textures` 354 → 368, `scene.objects` 1869 → 2320 across
   workloads. Some of this is *correct* caching (you do not want to rebuild a
   POI), so the question is not "dispose everything" but "which of these can a
   later gate see". **This is also a share of the 1.4 GB in `project/TODO.md`**,
   so it pays twice and deserves its own lane.
3. **Only then**, flip `cold: true` per gate, with `resetcheck` green and each
   gate's verdict shown byte-identical — the same discipline that validated
   turbo. `heightcheck` is the safe first candidate: read-only, and the boot
   audit found it the only one of nine that can receive a used page today.

## Do not repeat these

- **Do not commit a `PROTOCOL` bump while an experiment is running.** Clients
  see the mismatch, restart the daemon, and every leased page closes mid-run. It
  VOIDed a 12-minute cold-page null arm tonight, and it is already in
  `LANDMINES.md` — I re-triggered a known one.
- **`windStrength` is derived, not state.** I read it drifting across resets and
  called it the cross-shot accumulator behind `drawcheck`'s noise. It is not:
  `_gust` *is* zeroed (`resetClock()` → `snap()`), and `windStrength` reads
  stale only until the next frame recomputes it. The digest reads `_gust` and
  `windDir` now. Check whether a field is stored or computed before believing it
  leaked.
- **`menus.open` was the same shape** and *was* real — derived from `a`, which
  nothing reset. The lesson is not "derived fields are false positives", it is
  "find the field that actually holds the state".

## What this bought the drawcheck instrument

`warmup()` was built for reuse and paid off somewhere else. `drawcheck`
disagreed with itself on 25/142 shots; two passes showed **nine shots differing
by exactly +15 and `setpiece_deadeye` by -60, which is 4x15**. A shared constant
across unrelated shots is one thing present or absent, not variance.

`probes/warmquantum.mts` proved half of it: `Enemies.prototype()` builds a
species' geometry on first spawn and caches it forever, so a draw count depended
on run history. Warming every species moves `setpiece_deadeye` 574 → 514 — the
null arm's -60, exactly.

**And `stableAfterWarmup: true`: on a warmed page, three consecutive passes over
twelve shots are byte-identical.** So the remaining +15 is *boot-to-boot*, not
accumulation within a run — which is why `resetClock()` did not touch it and why
restoring the booted state did not either. That is the one open question about
this instrument now, instead of one of five.
