# After phase 3 — four independent pieces of work

Status: PROPOSED (2026-08-25, opus) — four workstreams, each independently
staffable. **Nothing here is locked.** WS-1 is the only one with an external
argument for its priority; WS-2 and WS-3 are the boot work phase 3 deliberately
did not take, sized against measurements rather than guesses; WS-4 is small and
concrete.

Written on closing `2026-08-22-opus-phase3-boot-and-memory` (now in
`project/archive/plans/`). That plan's §3 "what is left" table and
`project/handoff/boot-memory.md` are the evidence behind WS-2 and WS-3; read one
of them before starting either.

**Assign one agent per workstream.** They collide nowhere: WS-1 is
`src/characters/**`, WS-2 is materials across every lane, WS-3 is `src/world/**`
geometry plus `src/tools/texbake.mts`, WS-4 is one shader or one material.

---

## WS-1 — The head

**The judge's own #1, and the reason round 14 scored 3.0.** Of the five changes
it was asked to compare against round 13, four were BETTER or UNCHANGED and the
head was **WORSE**: *"the chin projects further forward than the nose... no
mouth geometry or mouth texture on the mouth's location."* Its costed advice was
*"fix the head, and only the head. Nothing in the environment can buy a point
while that frame exists."* Worth **3.0 -> 4.0** — more than everything else in
this document combined.

**The trap, and it has caught three agents.** `muzzleMm` went 22.44 -> 6.46,
which is inside the adult-male norm, and the frame got worse: pulling the
mid-face back put the chin ahead of the nose. **No bench in this repo asserts
that nose projection must exceed chin projection.** That is the gap. It is the
third time on this head that a measurement agreed while the picture did not, so:

- **Add the bench first, then fix the head.** A metric that cannot fail on the
  current frame is not going to tell you when you have fixed it.
- Re-open `project/handoff/characters.md`'s "do not rebuild" verdict against
  `tmp/shots/judge-r11/hero_portrait.png`. It was reached before this defect
  was understood.
- `handoff/head.md`, `head-r2.md`, `head-r3.md` are three previous passes.
  Read what each of them already ruled out before ruling it out again.

**Done when** the portrait reads as a face at 1:1 — a mouth that exists, a nose
that leads the profile — and a bench asserts both, so the next agent cannot
regress it silently.

---

## WS-2 — Fewer shader programs

**1.83 s of a 6.6 s cold boot, the largest single item on the profile**, and the
only one phase 3 could not touch from inside a boot lane.

**What is already closed, with numbers — do not redo it.** `compileAsync` is
**3% slower** here, measured six alternating pairs (`bootprof.mts --warm-ab`
re-runs it in one command). `KHR_parallel_shader_compile` is present and the
path works; it resolves a larger set (134 programs against 112) and that eats
the per-program gain. Going async also finishes *after* the harness is told the
page is ready, which spends capture determinism for a loss.

**The open question is the program count, not the compilation.** 129 programs in
the warm-up's `scene` step alone; 228 held in total. Every one is a material
permutation. So this is a **material-architecture sweep across every lane**, not
a boot task, and that is why it is its own workstream:

- Inventory the 228 by program key and find out what actually differentiates
  them. A `#define` nobody reads still costs a program.
- Expect the answer to be a handful of flags multiplying out. Consolidating even
  one binary variant that is set on half the world removes ~60 programs.
- **`engine/LightBudget.ts` pins light counts for a reason:** toggling a light's
  `visible` once recompiled 43 programs, a measured **9.5 s freeze**. Any
  consolidation that changes a program key at runtime instead of at build time
  makes the boot cost a play cost, which is strictly worse.

**Done when** the warm-up's program count is materially down, the cold boot
number moves with it, and `pnpm run check` plus a full-corpus cold diff show the
frames unchanged. **Budget several days.** This one is genuinely risky: it
touches how everything in the game is shaded.

---

## WS-3 — Bake the geometry

Three items on the boot profile want the same thing that does not exist:

| ms | item |
|---|---|
| 400 | `Props.poiPrebuild` — eight POI kits that cannot be built inside a frame |
| 322 | `Props.mega` — megastructure geometry |
| 225 | `Water.shore` — marching-squares shoreline ribbons |

~950 ms, and none of it is an accidental cost: it is real geometry generation.
`src/public/baked/` already caches the terrain field and, since phase 3, every
keyed texture including two 3D volumes and a 2048² relief chart. **Geometry is
the one generated thing with no cache at all.**

The mechanism to copy is `src/engine/TexBake.ts` plus `src/tools/texbake.mts`,
and phase 3 added `bakedBytes` — a raw-byte entry point that stores anything as
a `w x h` image and needs no format change. A `BufferGeometry` is a set of typed
arrays; storing and restoring them is the same shape of problem.

Read before starting:

- **`TEX_SOURCES` is the whole correctness story.** A generator whose file is
  not on the list is served stale forever, with every gate green. Phase 3's
  chart entry had to pull in the *terrain* sources because the chart is
  rasterised from the heightfield.
- **A cache read before `Props.init()` misses on every boot** — `Props` is what
  awaits `loadTexBake()`, and a miss is indistinguishable from having no cache.
  This silently made the cloud bake worth zero on its first measurement.
- **`pnpm run build` is not enough; `build:full` is.** And `TexBake.ts` is in
  `CANVAS_SOURCES`, so editing it deletes the painted-face artifact.
- The prize is bigger than 950 ms. Geometry is also most of the 96 MB of CPU
  vertex arrays, and — unlike the texel arrays — those **cannot** be freed,
  because `heightAt`, collision and `creaturecheck`'s skinned-AABB probe all
  walk them. A bake does not fix that, but it is the only lever that has not
  been tried.

**Done when** the three items are cache reads, `pnpm run check` is green, and a
full-corpus **cold** diff is at or under each shot's floor.

---

## WS-4 — The black patch on the Nebulawood canopy

A solid black blob sits on the canopy near the road in `zone_nebulawood`,
roughly a third of the way up the frame. **Pre-existing** — present identically
at `b0bfb4f`, before any of phase 3's second pass — and `zone_nebulawood` is one
of the 30 judged shots, so it is costing a grade on a frame that gets looked at.

Small, concrete, and a good first task for someone new to the repo. Two entries
in `project/LANDMINES.md` are almost certainly relevant and should be checked
*before* anything else:

- **`GTAOPass` sets `scene.overrideMaterial`, which discards alpha-test**, so
  foliage stamps solid black rectangles into the AO buffer. That is this defect's
  exact shape.
- **Bisect the post chain before the shader.** `?post=plain` takes thirty
  seconds and `?post=nogtao` alone settled a different foliage/terrain artefact
  outright.

**Done when** the patch is gone, the cause is named rather than tuned away, and
`zone_nebulawood` is at or under its floor against a deliberate new baseline.

---

## Two things any of these will need

**Read `VERDICT:` before reading any number.** `ruler.mts` spent weeks reporting
`CONTENDED (another lane is running <itself>)` on an idle machine — it matched
command lines rather than executables, so a tool piped into `grep` counted the
subshell bash forked for the other half of the pipe. Fixed 2026-08-25; the
verdict is worth believing again, and a habit of skipping it had somewhere to
form.

**`project/noise-floors.json` covers 18 shots, not 142.** Everything else is
checked against `DEFAULT_LIMIT` = 2.0, which is a placeholder, not a
measurement. Worse, the recorded floors are **cold** floors and the daemon
reuses pages, so an ordinary warm diff runs 4-6x them. A warm 3.1/255 against a
default 2.0 looks like a regression and is noise; a real change can hide the
same way. **Calibrate the shots you care about first** — two `--cold` captures
of one build and `imgdiff --calibrate` — and diff cold against cold. Doing this
is what separated a real regression from noise when phase 3's last change was
being judged, in both directions.
