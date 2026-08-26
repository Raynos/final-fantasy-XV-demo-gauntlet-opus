# Status — 2026-08-26

> **A snapshot, REPLACED in place, never appended to.** Dated bullets belong in
> `journal/`. Deleting a line that has stopped being true loses nothing.
> Capped at 150 lines by `.githooks/pre-commit`.

**`main` at `291f9f5`.** Zero `any`, both typechecks clean, `vite build` green
on every commit. **`check`, `perf` and `gameplay` have NOT been run since phase
4 started adding world content** — see "Live right now".

## Perf is no longer uncertified

Full-corpus `perf.mts`, 2026-08-25: **`RULER_VALID: true`**, floor 16% of the
median 5.0 ms frame, verdict *quiet*, **mean 218.1 fps, worst 140
(`poi_reststop`), every shot over 60**. `bestiary_necromancer` read 51 fps on
2026-08-23 in a run that certified itself and failed; it reads **172** here —
that failure was the machine. **`project/baseline-perf.json` is older than
this** (the passing run was taken without `--out`), so a diff against that file
is not a regression.

**Before quoting the ruler:** its floor is measured on `shots[0]`, so **argument
order decides whether a run certifies** — 16% led by `hero_closeup` against 35%
led by `poi_reststop`, same machine, minutes apart. A floor per shot is the fix;
phase4 WS-0b owns it with the frame-cost split it blocked.

## `project/handoff/` is empty, and its backlog is a plan now

All 52 files were read, their open work extracted into
**`docs/plans/2026-08-26-opus-the-standing-backlog.md`**, and graduated.
`project/README.md` says work is picked up from `docs/plans/` or `TODO.md` **and
nowhere else**, so 52 dead lanes each held a backlog no plan knew about. **When
a lane finishes, its open work comes back to a plan.**

## Live right now — phase 4, paused mid-build at `291f9f5`

**`docs/plans/2026-08-22-opus-phase4-content-and-gameplay.md`** absorbed the
2026-08-21 sequencing plan (its §0) and is the only open phase. Work in flight
against the human's report that **the world "feels barren and empty"** when
they played it. Three commits landed; **none of them has been through
`pnpm run check`, `perf` or `gameplay` yet, and that is the first thing the
next session must do** — the world now carries ~28 live creatures and two new
instanced layers that no gate has priced.

**`src/tools/probes/walkabout.mts` is the new instrument.** It walks the real
player with real input for kilometres and counts what they *meet*; everything
else here measures a held frame, and "barren" is not a statement about a frame.
Two traps it documents in its own source, both of which made its first run lie:
a posed page boots with `Director.setLive(false)`, so **the encounter loop is
OFF in every probe** until it calls `play()`; and grazing beasts key on `ax/az`.

Same 2 979 m walk, before and after:

| | before | after |
|---|---|---|
| anything alive within 120 m | 32% of samples | **63%** |
| worst gap between events | 325 m | **75 m** |
| an E prompt available | **0%** | spots every 66-190 m |

Three findings behind those, each fixed in its own commit:

- **The world ended at 440 m.** `barrencensus.mts` (new): 90-290 non-grass
  instances per hectare inside 400 m, **8.6-12.9 in 400-800 m, 1.1-1.5 in
  800-1600 m**. Scrub now has a far *mass* ring to 2600 m, a copy of `Trees`'
  canopy ring. A vertical card is edge-on to an elevated camera, so
  `zone_longwythe` moves and `zone_three_valleys` barely does: **the elevated
  view needs the ground itself to carry the cover, and that is not built.**
- **18 hand-placed territories on a 67 km² map** — 0.08% of it had an encounter
  in it. `WildTerritories` generates dens from the cell hash. Density is a
  **swept-corridor** number, not a per-area one; the first tuning reasoned
  per-area and measured as *no change at all*.
- **`Territory.passive` had never been read** — documented as "scenery until
  something provokes it" since the spawn tables were written, never passed on
  by `activate()`, so every dualhorn in Lucis charged on sight.

Known and unfixed from watching it play: **the party is left behind by a
sprint** (Noctis arrives alone), and no `Shots.ts` shot has the encounter loop
running, so no capture in the corpus contains a den or a glint —
`probes/liveworld.mts` is the stopgap.

## The lanes that closed before this one

`phase3-boot-and-memory` DONE (cold 13.66 -> **6.64 s**; **warm was never
reachable** and two passes left the row open rather than say so).
`fable-sibling-ports` DONE 6/6. `fable-procedural-modeling` DONE, so
**`src/world/veg/` has no owner.** One wrong diagnosis re-filed out of
sibling-ports: shadow warmth is a **ground albedo** row, not an ambient one.

**A plan's own rows are the least reliable thing in this repository.** Sixteen
of procedural-modeling's were false; sibling-ports produced eight more. Always
the same direction — work called open that was already built — and almost always
findable by **reading the file**. **Nothing type-checks a plan.**

**After any merge: `build:full`**, not `build` — `build` deletes the
painted-face cache without replacing it and cold boot regresses ~2.5 s.

## The grade — rounds 12/13/14: **3.5 -> 3.5 -> 3.0**, 12 identified every time

The instrument was validated separately (24 plate-vs-plate composites, 0 HIGH /
21 LOW), so the rounds are evidence. **Round 14 went DOWN and the cause is the
head** — four of five changes were BETTER or UNCHANGED, the head was WORSE:
*"the chin projects further forward than the nose... no mouth geometry."* Its
costed advice is *"fix the head, and only the head"*, worth 3.0 -> 4.0. The
detail and the trap that has caught three agents are in `after-phase3.md` WS-1.

## Gates — 17/17 on a quiet tree, 2026-08-25

Re-run after `build:full` and both `texbake` passes. The suite has grown
**9 -> 12 -> 17**; do not quote an older count from any plan or handoff.
`build` · `anycheck` 0 · `orphans` **302/302** · `silhouette` · `silrocks` ·
`geocheck` · `hydrocheck` · `integration` **27** · `uxcheck` 93/93 ·
`creaturecheck` 207 · `combatloop` **31/31** · `roadcheck` · `reachcheck` ·
`floatcheck` · `horizoncheck` · `heightcheck` · `driftcheck`.

**Two gate failures were the harness, not the code** — see `LANDMINES.md`;
check `daemon --health` and `cleanup.mts` before believing a leased-page gate.

## `gameplay.mts`, and the draw-call ceiling

**`gameplay.mts` has never certified** — a second session held the machine. Its
best contention-proof number puts `streaming-traverse` at **67.3 fps**, 4
hitches. **The 33 ms rule is still breached**: `sprint+turn` 90-104 ms, a
GPU-process stall when Hammerhead first draws. The tail that made earlier runs
unreadable **was the ruler**, not the game. Also open: **ten town shots draw
924-1011 calls against BRIEF's 800, ungated.**

## Still weak

`Layers.ts`'s splat reads as one texture, not a material system — six layers
whose mean lumas span only 0.35-0.47, and that **is** the shadow-warmth row:
`sh(R-B)` −9.2 against +5.8, a *ground albedo* problem, not an ambient one.
(The old "nothing reaches white" line is gone because it stopped being true —
the daylight slice clips 2.8% against the reference's 0.5%.)

**A page costs ~1.94 GB of RSS** — 498 MB JS heap, 279 MB GPU-side, the rest
Chromium's, only ~94 MB cleanly recoverable. Genuinely strong: the field HUD,
atmosphere, terrain strata, the world map, the opening cutscene, warp-strike
VFX, km-scale shadow, a real drainage network, shorelines, rivers, eyes.

## Next, in order

1. **Gate what just landed** — `build:full`, `pnpm run check`, then `perf` and
   `gameplay` on a quiet tree. Three commits of new world content are ungated.
2. **Finish phase 4** — the five definition-of-done boxes in §5 of its plan.
3. **The head**, alone — `after-phase3` WS-1, worth 3.0 -> 4.0 on the grade,
   more than everything else combined. Then clouds/TAA, composition, motion.

Everything else open lives in
`docs/plans/2026-08-26-opus-the-standing-backlog.md`, including its table of
**measured negatives** — ten claims not worth re-opening.
