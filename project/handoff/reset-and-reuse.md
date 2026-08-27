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

1. **The enemy roster — do this first; it is worth double.** `enemies.n 10 -> 0`
   under the `shots` workload. It is not only a reuse blocker: **it is the cause
   of `drawcheck`'s 60-call disagreement with itself.** Posing one shot
   repeatedly and restarting the daemon between series gives
   `579 514 514 514 514 574 514` three times identically — runs 1 and 6 boot a
   page, the rest reuse one, and a reused page draws **60 fewer calls** because
   ten enemies at ~6 draws each (mesh, three shadow cascades, velocity proxy)
   are missing. Fix the roster and the gate stops being unreadable.
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

`warmup()` was built for reuse and the answer arrived from the same lane, but
**not the way this section first recorded it** — the earlier version credited
warmup with the 60 and that was wrong, so here is the settled version.

Posing one shot repeatedly through the daemon, restarting it between series:

    restart 1:  579 514 514 514 514 574 514 514
    restart 2:  579 514 514 514 514 574
    restart 3:  579 514 514 514 514 574 514

Identical three times, and the daemon log says warmup fired on every request and
built 21 prototypes each time. **So it was never noise and it is not lazy
construction.** Runs 1 and 6 are where the pool boots a page; the rest reuse
one:

    579 / 574   freshly booted page
    514         reused page, after Game.reset()

A reused page draws **60 fewer calls**, and `resetcheck` names what is missing:
`enemies.n 10 -> 0`. That is item 1 above, and it is why item 1 is worth double.

Five hypotheses died before this one, recorded so nobody re-runs them: frame
parity (`resetClock`), chunk sizing, wasted boots, state accumulating across
shots within a run, and lazy bestiary construction. Each was measured; each was
wrong. What finally pointed here was histogramming the deltas instead of
modelling them as variance — nine unrelated shots landing on exactly +15 is a
discrete thing, not a distribution. See `LANDMINES.md`.

`warmup()` stays regardless: it is correct, it removes a real history dependence
(`probes/warmquantum.mts` shows 574 -> 514 within one page), and it is what made
the boot-vs-reuse split legible once it was firing reliably.

## In-browser cost: where it actually is, measured 2026-08-28

Asked to optimise the frontend three.js so every saved millisecond compounds.
Measured first, and the answer redirects the effort:

**The frame is not the problem.** `project/STATUS.md` has the game at **mean 208
fps, worst 116, against a 60 fps target** — 3.5x over. Cutting frame cost would
not make this suite faster either: its browser time is a third page boots, and
most of the rest is driving input rather than rendering.

**Boot is the problem, and one line of it dominates.** `bootprof --dirty`:

    load cold:   6.66 s wall, 6.49 s in Game.init()
    load warm 1: 6.43 s wall, 6.32 s in Game.init()

      1959 ms  postfx+compile+warmup      <- 30% of boot
      1277 ms  Vegetation
       858 ms  Props
       374 ms  Water
       363 ms  Npcs

      -- warmup 1760 ms, +181 programs   (cold)
      -- warmup 1711 ms, +181 programs   (warm)

**The GPU program cache is doing nothing, and that is a bug worth fixing.**
`--health` reports `persistentProfile: true`, `chromium.mts` implements it
carefully and correctly — `launchPersistentContext` rather than a
`--user-data-dir` flag playwright would override, one machine-wide profile — and
a *warm* load still compiles **181 programs in 1711 ms**, within 3% of cold.
1.7 s x ~10 boots per suite is ~17 s, and it is paid again by every page a
player opens.

**Hypothesis, untested:** `CHROMIUM_ARGS` pins `--use-angle=metal`, and ANGLE's
Metal backend does not expose program binaries, so Chromium's shader disk cache
has nothing it can store. The cheap experiment is one `bootprof` run with
`--use-angle=gl` and nothing else changed, comparing `+N programs` and warmup
ms. **Do not casually make that the default** — the backend decides pixels, so
it would move every image baseline in the repo; measure first, then decide
whether it is worth a re-baseline.

**Second finding, recorded not chased:** `probes/drawwhere.mts` (new) attributes
every call through `renderBufferDirect`. On `town_forecourt`: 496 calls but
**5,231,106 triangles**, a third of them skinned character mesh at ~29k
triangles per draw with no apparent LOD, across **288 distinct object/material
buckets** — almost nothing batches, and 152 calls draw under 60 triangles each.
That bucket count is also the likely reason there are 181 shader programs to
compile, so material consolidation would pay boot *and* frame *and* the texture
-unit exhaustion the probe surfaced (`Trying to use 16 texture units while this
GPU supports only 16`, dozens of times a frame). Latent risk at 208 fps; the
first thing to reach for if that ever stops being true.
