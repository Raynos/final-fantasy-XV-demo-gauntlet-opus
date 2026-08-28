# 2026-08-28 — building out both live plans

Twelve lanes, ~220 commits, one coordinator. `2026-08-25-opus-after-phase3`
closed 4 of 4 and graduated; `2026-08-26-opus-the-standing-backlog` closed all
twelve of the workstreams it was written with and stays live because §WS-13 is
now the queue.

## The result that matters most is not a feature

**Six of the plans' premises were false, and each had already cost a lane an
afternoon.** That ratio — roughly 60% of closed items came back as measured
negatives or corrected premises rather than as landed features — is the honest
shape of the day.

| the plan said | it was |
|---|---|
| the head needs a sculpt fix | **`buildHead`'s skull grid was wound inside out.** With a `FrontSide` material the near surface was backface-culled in *every frame this repo has ever captured*; what drew was the inside of the far side of the skull |
| the program count is 132 material sites multiplying out | `renderer.compile()` building programs no frame ever binds. **271 → 126 without touching one site** |
| the canopy blob is `GTAOPass`'s `overrideMaterial` | NaN from the terrain shader **reading roughness as a tangent normal's Z** |
| shadow warmth is a ground-albedo row | it is aerial perspective, in shadows that are otherwise black |
| seven fishing pins need a re-bake | **one predicate** — `Fishing._survey` tested a global water level after `Water` stopped having one |
| `--hide` renders less streamed content | one frame of shadow-cascade phase |

Two more were stale rather than wrong: **`Enemy.level` had landed the day
before** and three documents still said built-and-reverted; **WS-2c had shipped
five days before** the section describing it as never-run.

## The generalisation, which is the durable half

**When a metric agrees and the frame disagrees, suspect a property no metric in
the tree reads.** Every bench here reads the *position* buffer, and the head's
positions were always correct — so five passes measured a correct face and
photographed a wrong one. `assertConsistentWinding` cannot catch it either:
edge parity is orientation-*relative*, so a uniformly wrong shell is uniformly
consistent.

That is one instance of a pattern that showed up **seven times in one day**:

- **`anycheck` reported `0 any across 0 files`** — a scanner that walked
  nothing, and "zero `any`" rested on it
- **`perfsprint`'s "zero new programs"** compares `cacheKey.length` *strings*;
  both stall twins have identical lengths
- **`.menu-scrim`'s 26 px blur had never rendered** — it samples its own
  compositing layer's backdrop, which inside `#menus` is empty
- **`performance.memory` is frozen** — 200 MB allocated moves it by 0.0 MB, so
  every JS-heap figure in the old boot-memory work was a constant
- **`facemark` never drew anything** — it stamped through
  `map.mipmaps[i].getContext('2d')` and the shipped levels are ImageBitmaps
- **`corpus.mts` rejected `--build`**, so a 142-shot corpus could only ever be
  captured at HEAD — the one comparison it exists for
- **`stackjoint` reported 0 open joints of 1615** because it computed course
  heights the same way the plan did; raycasting the placed triangles instead
  gives 266 of 5917
- **`creaturecheck --dirty` never worked**; **the 16/16 texture-unit warning is
  three counting the wrong limit** (17 of a combined 32, and it links)

## What moved

**Boot 7.13 → 5.78 s** from the geometry bake, **−850 ms more** from the dead
compiles. **The 33 ms rule is met for the first time** — 0 hitches, both perf
gates `RULER_VALID`, mean 226–229 fps. **The corpus went from 7 NaN shots to
zero.** The river water surface, which had not been drawn at all for a day
behind a `'body' : redefinition`, draws.

Frames: the exposure meter was overriding the Sky's published physics by a
median 1.361 with six of twenty poses on a rail. Galdin Quay's strand p50 went
**14 → 78 m**. The 4–30 m relief hole is filled. Fishing pins with water **4 →
8**. Anak reads as an animal. A fight has an ending.

Three shots were reframed after `framedepth` showed their cameras made their own
content unreachable — `zone_longwythe` (30 m from a 33.4 m tor, pointing 48°
away), `zone_mencemoor` (242.7 m above its own ground), `poi_tomb` (2.8 m of a
13 m temple, five degrees inside the only blocked sector).

## What was deliberately not done

The head is **short of `BRIEF.md`'s bar and closed anyway**, by the human, after
six passes — its own "done when" is met and `facecheck` asserts it. The **309 MB
memory win is not a one-line call**: `TexBake`'s entries are dropped as served,
so what stays resident is what nothing has asked for yet, and the dungeon
interiors are built on first `enter()`. Freeing at `Props.init` would surface the
first time a player walks into a cave, and **no gate poses a dungeon interior
cold**.

## A human opened the game and found three things no gate could

Long startup, 1.5 GB in the tab, 100% CPU, and an unresponsive screen while
loading. **`?shoot=1` is a determinism gate and also a blindfold**: `main.ts`
never calls `game.start()` under it, so a posed page never free-runs, and
`grep -l 'play: true' src/tools/*.mts` returns `uxcheck.mts` alone. A tab pinned
at 100% while idle is invisible to all 19 gates and all 142 shots by
construction. `docs/BOOT_PERF.md` now carries the vitals, three rows of it
marked NOT MEASURED.

## Coordination notes

Seven lanes ran concurrently against `BROWSER_BUDGET = 4`; the queue reached
depth 26 and 58% of wall-clock. Two mid-edit syntax errors in the shared tree
(both a backtick inside a `/* glsl */` template) each stopped every lane
capturing — one cost a lane the end of its session, holding a finished, measured
fix it could not look at. **A pathspec commits the file, not your hunks**, which
swept a lane's in-flight `Water.ts` into a commit that does not build, and 28
lines of a plan rewrite into another. All in `LANDMINES.md`.
