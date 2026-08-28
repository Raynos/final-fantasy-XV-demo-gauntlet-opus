# Status — 2026-08-28

> **A snapshot, REPLACED in place, never appended to.** Dated bullets belong in
> `journal/`. Deleting a line that has stopped being true loses nothing.
> Capped at 150 lines by `.githooks/pre-commit`.

**`main`.** `pnpm run check` **19/19**, `nanscan` **0 of 142**, draw calls
**786/800**, and **`BRIEF.md`'s 33 ms rule is met for the first time** — `perf`
and `gameplay` both `RULER_VALID: true`, mean 226–229 fps, 0 hitches.

**Live lanes: one.** `rockseat`, on the bounding-box joint bug. Everything else
from the 2026-08-28 wave has reported and graduated.

## Both plans are wrapped up

`2026-08-25-opus-after-phase3` closed **4 of 4** and is in `archive/plans/`.
`2026-08-26-opus-the-standing-backlog` closed **all twelve** of the workstreams
it was written with and **stays live because §WS-13 is the queue** — that is its
own definition of done, and archiving it would recreate the condition it exists
to prevent. `docs/plans/` is one file.

## The headline is that the plans were wrong more often than they were right

Six premises were falsified by measurement, and each had already cost a lane:

- **The head was not a sculpting problem.** `buildHead`'s skull grid was **wound
  inside out**, so with a `FrontSide` material the near surface was
  backface-culled in *every frame this repo has ever captured* — what drew was
  the inside of the far side of the skull. It beat five passes because **every
  bench here reads the position buffer**, which was always correct.
- **The program count was not material sprawl.** 271 → 126 without touching one
  of the 132 construction sites: `renderer.compile()` was building programs no
  frame ever binds, in two ways.
- **The canopy blob was not GTAO.** It was NaN from the terrain shader reading
  roughness as a tangent normal's Z.
- **The shadow-warmth gap is not ground albedo.** Pushing every ground *and*
  plant pixel far past shippable buys 5.2 of the 13.2 levels needed. It is
  aerial perspective, in shadows that are otherwise black.
- **The seven dry fishing pins were one predicate** — `Fishing._survey` tested a
  global water level after `Water` stopped having one.
- **`--hide` was never broken the way WS-9 said**: one frame of shadow-cascade
  phase, not 320 draws of missing content.

## Instruments were lying, repeatedly

This is the pattern worth carrying forward. **`anycheck` reported `0 any across
0 files`** — a scanner that walked nothing, and "zero `any`" rested on it.
**`perfsprint`'s "zero new programs" is a false negative** (it compares
`cacheKey.length` strings). **`.menu-scrim`'s 26 px blur had never rendered.**
**`performance.memory` is frozen** — 200 MB allocated moves it by 0.0 MB — so
every JS-heap figure in the old boot-memory work was a constant. **`facemark`
never drew anything.** **`corpus.mts` rejected `--build`**, so a 142-shot corpus
could only ever be captured at HEAD. **`creaturecheck --dirty` never worked.**
And the **16/16 texture-unit warning is three counting the wrong limit** — the
program is 17 of a combined 32 and links fine.

## What moved

**Boot 7.13 → 5.78 s** (geometry bake), **−850 ms more** (dead compiles), and
`texc.bin.gz`/`geo.bin.gz` rebuilt after being absent all session — every
absolute boot number taken mid-session was ~2.5 s inflated.

**Frames.** The exposure meter was overriding the Sky's own physics by a median
1.361 with six of twenty poses on a rail; fixed, and `sh(R−B)` went −9.8 → −5.1
with no re-tint. Galdin Quay is a beach (strand p50 **14 → 78 m**). The 4–30 m
relief hole is filled (`reliefstat` 31.17 → 38.02 of 49). The Meteor no longer
reads as a floating arch. Fishing pins with water **4 → 8**. Anak reads as an
animal. A fight has a beginning and an end, and the arm no longer whips.

**`zone_longwythe` and `zone_mencemoor` were reframed** — both had cameras that
made their own content unreachable, measured by `framedepth`. `Shots.ts` is
otherwise unowned; the coordinator took it for those two.

## What is knowingly left

- **The head is short of `BRIEF.md`'s bar and closed anyway**, by the human,
  after six passes. Its own "done when" is met and `facecheck` asserts it. What
  remains is in the archived plan's §WS-1, led by: **every painted brush on that
  head was authored while the face was culled.**
- **§WS-13 is the queue.** Biggest rows: ~600–800 MB of recoverable RAM (the
  309 MB slice is *not* a one-line call — see the dungeon constraint), the
  `hullseat` bounding-box joint bug, the Meteor's chroma, `_genOutcrop`.
- **`docs/BOOT_PERF.md` is new and three of its rows say NOT MEASURED.** A tab
  pinned at 100% while idle is invisible to all 19 gates by construction,
  because `?shoot=1` never calls `game.start()`. So is a first-visit cold-cache
  load, and so is the unresponsive loading screen.

## Rules this run bought, all in `LANDMINES.md`

A GLSL compile or link failure is **invisible on a warm page** — the river water
surface was undrawn for a day with every gate green, and only `--cold` sees it.
An **inversely wound shell is invisible to every bench here**. `isnan`, `isinf`
and `(x >= 0 || x < 0)` are **all folded away by this backend's compiler**. A
`follow:` shot **ignores `setShot`**. A pathspec commits **the file, not your
hunks**. The pre-commit hook builds the **working tree, not the tree the commit
creates**. `daemon.mts --wait` **exits 0 when it gives up**.
